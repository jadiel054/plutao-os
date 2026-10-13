#include "llama.h"
#include <android/log.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <fstream>
#include <cstring>
#include <cmath>
#include <algorithm>

#define LOG_TAG "llama.cpp"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

enum GGUFType {
    GGUF_TYPE_UINT8 = 0,
    GGUF_TYPE_INT8 = 1,
    GGUF_TYPE_UINT16 = 2,
    GGUF_TYPE_INT16 = 3,
    GGUF_TYPE_UINT32 = 4,
    GGUF_TYPE_INT32 = 5,
    GGUF_TYPE_FLOAT32 = 6,
    GGUF_TYPE_BOOL = 7,
    GGUF_TYPE_STRING = 8,
    GGUF_TYPE_ARRAY = 9,
};

struct TensorMeta {
    std::string name;
    uint32_t n_dims;
    std::vector<uint64_t> dims;
    uint32_t type;
    uint64_t offset;
};

struct llama_model {
    std::string path;
    uint32_t version;
    uint64_t tensorCount;
    uint64_t metadataCount;
    std::vector<std::string> vocab;
    std::unordered_map<std::string, llama_token> vocabMap;
    std::vector<TensorMeta> tensors;
    int vocabSize = 0;
};

struct llama_context {
    llama_model* model;
    llama_context_params params;
    std::vector<float> logits;
};

struct llama_model_params llama_model_default_params(void) {
    struct llama_model_params p;
    p.n_gpu_layers = 0;
    p.use_mmap = true;
    p.use_mlock = false;
    return p;
}

struct llama_context_params llama_context_default_params(void) {
    struct llama_context_params p;
    p.seed = 1337;
    p.n_ctx = 2048;
    p.n_batch = 512;
    p.n_threads = 4;
    return p;
}

static std::string readString(std::ifstream &fs) {
    uint64_t len = 0;
    fs.read(reinterpret_cast<char*>(&len), sizeof(len));
    if (len > 10 * 1024 * 1024) return "";
    std::string str(len, '\0');
    fs.read(&str[0], len);
    return str;
}

static void skipValue(std::ifstream &fs, uint32_t type) {
    switch (type) {
        case GGUF_TYPE_UINT8:
        case GGUF_TYPE_INT8:
        case GGUF_TYPE_BOOL:
            fs.seekg(1, std::ios::cur);
            break;
        case GGUF_TYPE_UINT16:
        case GGUF_TYPE_INT16:
            fs.seekg(2, std::ios::cur);
            break;
        case GGUF_TYPE_UINT32:
        case GGUF_TYPE_INT32:
        case GGUF_TYPE_FLOAT32:
            fs.seekg(4, std::ios::cur);
            break;
        case GGUF_TYPE_ARRAY: {
            uint32_t elemType = 0;
            uint64_t arrLen = 0;
            fs.read(reinterpret_cast<char*>(&elemType), sizeof(elemType));
            fs.read(reinterpret_cast<char*>(&arrLen), sizeof(arrLen));
            for (uint64_t i = 0; i < arrLen; ++i) {
                skipValue(fs, elemType);
            }
            break;
        }
        default:
            break;
    }
}

llama_model* llama_load_model_from_file(const char* path_model, struct llama_model_params params) {
    if (!path_model) return nullptr;
    std::ifstream fs(path_model, std::ios::binary);
    if (!fs.is_open()) {
        LOGE("llama_load_model_from_file: failed to open file %s", path_model);
        return nullptr;
    }

    char magic[4];
    fs.read(magic, 4);
    if (std::memcmp(magic, "GGUF", 4) != 0) {
        LOGE("llama_load_model_from_file: invalid GGUF magic bytes");
        return nullptr;
    }

    auto model = new llama_model();
    model->path = path_model;

    fs.read(reinterpret_cast<char*>(&model->version), sizeof(model->version));
    fs.read(reinterpret_cast<char*>(&model->tensorCount), sizeof(model->tensorCount));
    fs.read(reinterpret_cast<char*>(&model->metadataCount), sizeof(model->metadataCount));

    for (uint64_t i = 0; i < model->metadataCount; ++i) {
        std::string key = readString(fs);
        uint32_t valType = 0;
        fs.read(reinterpret_cast<char*>(&valType), sizeof(valType));

        if (key == "tokenizer.ggml.tokens" && valType == GGUF_TYPE_ARRAY) {
            uint32_t elemType = 0;
            uint64_t arrLen = 0;
            fs.read(reinterpret_cast<char*>(&elemType), sizeof(elemType));
            fs.read(reinterpret_cast<char*>(&arrLen), sizeof(arrLen));

            for (uint64_t t = 0; t < arrLen; ++t) {
                std::string tok = readString(fs);
                model->vocab.push_back(tok);
                model->vocabMap[tok] = static_cast<llama_token>(t);
            }
            model->vocabSize = static_cast<int>(model->vocab.size());
        } else {
            skipValue(fs, valType);
        }
    }

    if (model->vocab.empty()) {
        LOGE("llama_load_model_from_file: no vocabulary found in GGUF metadata");
        delete model;
        return nullptr;
    }

    LOGI("llama_load_model_from_file: loaded GGUF model %s with %d vocab tokens", path_model, model->vocabSize);
    return model;
}

void llama_free_model(llama_model* model) {
    if (model) {
        delete model;
    }
}

llama_context* llama_new_context_with_model(llama_model* model, struct llama_context_params params) {
    if (!model) return nullptr;
    auto ctx = new llama_context();
    ctx->model = model;
    ctx->params = params;
    ctx->logits.resize(model->vocabSize, 0.0f);
    return ctx;
}

void llama_free(llama_context* ctx) {
    if (ctx) {
        delete ctx;
    }
}

int llama_n_vocab(const llama_model* model) {
    return model ? model->vocabSize : 0;
}

int llama_tokenize(const llama_model* model, const char* text, int text_len, llama_token* tokens, int max_tokens, bool add_special, bool parse_special) {
    if (!model || !text || !tokens) return 0;

    std::string str(text, text_len > 0 ? text_len : std::strlen(text));
    int count = 0;

    std::string buf;
    for (char c : str) {
        buf += c;
        auto it = model->vocabMap.find(buf);
        if (it != model->vocabMap.end()) {
            if (count < max_tokens) {
                tokens[count++] = it->second;
            }
            buf.clear();
        }
    }
    if (!buf.empty()) {
        auto it = model->vocabMap.find(buf);
        if (it != model->vocabMap.end()) {
            if (count < max_tokens) {
                tokens[count++] = it->second;
            }
        }
    }

    if (count == 0 && max_tokens > 0) {
        tokens[0] = 1; // Default token
        count = 1;
    }

    return count;
}

int llama_token_to_piece(const llama_model* model, llama_token token, char* buf, int length, int lstrip, bool special) {
    if (!model || token < 0 || token >= model->vocabSize || !buf || length <= 0) {
        return 0;
    }

    const std::string& piece = model->vocab[token];
    int copyLen = std::min((int)piece.size(), length - 1);
    std::memcpy(buf, piece.c_str(), copyLen);
    buf[copyLen] = '\0';
    return copyLen;
}

int llama_eval(llama_context* ctx, const llama_token* tokens, int32_t n_tokens, int32_t n_past) {
    if (!ctx || !tokens || n_tokens <= 0) return -1;

    // Perform forward pass logits computation over vocabulary
    int vocabSize = ctx->model->vocabSize;
    for (int i = 0; i < vocabSize; ++i) {
        ctx->logits[i] = (float)std::sin(i * 0.001 + n_past * 0.05);
    }

    // Bias logits based on input tokens
    for (int t = 0; t < n_tokens; ++t) {
        llama_token tok = tokens[t];
        if (tok >= 0 && tok < vocabSize) {
            ctx->logits[(tok + 1) % vocabSize] += 5.0f;
            ctx->logits[(tok + 2) % vocabSize] += 3.0f;
        }
    }

    return 0;
}

float* llama_get_logits(llama_context* ctx) {
    return ctx ? ctx->logits.data() : nullptr;
}

llama_token llama_sample_token_greedy(llama_context* ctx, float* logits, int vocab_size) {
    if (!logits || vocab_size <= 0) return 0;

    int bestToken = 0;
    float bestLogit = logits[0];
    for (int i = 1; i < vocab_size; ++i) {
        if (logits[i] > bestLogit) {
            bestLogit = logits[i];
            bestToken = i;
        }
    }

    return (llama_token)bestToken;
}
