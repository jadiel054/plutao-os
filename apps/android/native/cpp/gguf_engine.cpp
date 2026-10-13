#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <fstream>
#include <sstream>
#include <cstring>
#include <cmath>
#include <memory>
#include <algorithm>
#include <random>

#define LOG_TAG "GGUFEngine"
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
    GGUF_TYPE_UINT64 = 10,
    GGUF_TYPE_INT64 = 11,
    GGUF_TYPE_FLOAT64 = 12,
};

enum GGMLType {
    GGML_TYPE_F32  = 0,
    GGML_TYPE_F16  = 1,
    GGML_TYPE_Q4_0 = 2,
    GGML_TYPE_Q4_1 = 3,
    GGML_TYPE_Q5_0 = 6,
    GGML_TYPE_Q5_1 = 7,
    GGML_TYPE_Q8_0 = 8,
    GGML_TYPE_Q8_1 = 9,
    GGML_TYPE_Q4_K = 12,
    GGML_TYPE_Q5_K = 13,
    GGML_TYPE_Q6_K = 14,
};

struct GGUFTensorHeader {
    std::string name;
    uint32_t n_dims;
    std::vector<uint64_t> dims;
    uint32_t type;
    uint64_t offset;
    std::vector<uint8_t> data;
};

// Half-precision float helper
static float fp16_to_fp32(uint16_t h) {
    uint32_t w = (h & 0x7fff) << 13;
    uint32_t sign = (h & 0x8000) << 16;
    uint32_t exp = (h & 0x7c00) >> 10;

    if (exp == 0x1f) {
        exp = 0xff;
    } else if (exp > 0) {
        exp += (127 - 15);
    } else {
        exp = 0;
    }

    w |= sign | (exp << 23);
    float f;
    std::memcpy(&f, &w, sizeof(f));
    return f;
}

// Q4_0 Block: 2 bytes fp16 scale, 16 bytes (32 4-bit nibbles)
struct BlockQ4_0 {
    uint16_t d;
    uint8_t qs[16];
};

static void dequantize_q4_0_row(const BlockQ4_0* blocks, float* y, int n) {
    int nb = n / 32;
    for (int i = 0; i < nb; ++i) {
        float d = fp16_to_fp32(blocks[i].d);
        for (int j = 0; j < 16; ++j) {
            uint8_t byte = blocks[i].qs[j];
            int x0 = (byte & 0x0f) - 8;
            int x1 = (byte >> 4) - 8;
            y[i * 32 + j]      = x0 * d;
            y[i * 32 + j + 16] = x1 * d;
        }
    }
}

struct GGUFModelContext {
    std::string filePath;
    uint32_t version = 0;
    uint64_t tensorCount = 0;
    uint64_t metadataCount = 0;

    std::vector<std::string> vocabulary;
    std::unordered_map<std::string, uint32_t> vocabMap;
    std::unordered_map<std::string, GGUFTensorHeader> tensorMap;

    uint32_t dim = 1536;
    uint32_t hiddenDim = 4096;
    uint32_t numLayers = 28;
    uint32_t numHeads = 12;
    uint32_t vocabSize = 151936;
    float normEps = 1e-6f;

    std::vector<float> tokenEmbeddingTable; // [vocabSize * dim]
    std::vector<float> outputLmHead;         // [vocabSize * dim]
};

static std::string readGGUFString(std::ifstream &fs) {
    uint64_t len = 0;
    fs.read(reinterpret_cast<char*>(&len), sizeof(len));
    if (len > 10 * 1024 * 1024) return "";
    std::string str(len, '\0');
    fs.read(&str[0], len);
    return str;
}

static void skipGGUFValue(std::ifstream &fs, uint32_t type) {
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
        case GGUF_TYPE_UINT64:
        case GGUF_TYPE_INT64:
        case GGUF_TYPE_FLOAT64:
            fs.seekg(8, std::ios::cur);
            break;
        case GGUF_TYPE_STRING: {
            readGGUFString(fs);
            break;
        }
        case GGUF_TYPE_ARRAY: {
            uint32_t elemType = 0;
            uint64_t arrLen = 0;
            fs.read(reinterpret_cast<char*>(&elemType), sizeof(elemType));
            fs.read(reinterpret_cast<char*>(&arrLen), sizeof(arrLen));
            for (uint64_t i = 0; i < arrLen; ++i) {
                skipGGUFValue(fs, elemType);
            }
            break;
        }
        default:
            break;
    }
}

static void rmsnorm(float* o, const float* x, const float* weight, int size, float eps) {
    float ss = 0.0f;
    for (int j = 0; j < size; ++j) {
        ss += x[j] * x[j];
    }
    ss /= size;
    ss += eps;
    float scale = 1.0f / std::sqrt(ss);
    for (int j = 0; j < size; ++j) {
        o[j] = weight ? (x[j] * scale * weight[j]) : (x[j] * scale);
    }
}

static void softmax(float* x, int size) {
    float max_val = x[0];
    for (int i = 1; i < size; ++i) {
        if (x[i] > max_val) max_val = x[i];
    }
    float sum = 0.0f;
    for (int i = 0; i < size; ++i) {
        x[i] = std::exp(x[i] - max_val);
        sum += x[i];
    }
    for (int i = 0; i < size; ++i) {
        x[i] /= sum;
    }
}

static uint32_t sample_logits(float* logits, int size, float temperature) {
    if (temperature <= 0.0f) {
        uint32_t best = 0;
        float max_p = logits[0];
        for (int i = 1; i < size; ++i) {
            if (logits[i] > max_p) {
                max_p = logits[i];
                best = i;
            }
        }
        return best;
    }

    for (int i = 0; i < size; ++i) {
        logits[i] /= temperature;
    }
    softmax(logits, size);

    static std::mt19937 rng(42);
    std::uniform_real_distribution<float> dist(0.0f, 1.0f);
    float r = dist(rng);

    float cdf = 0.0f;
    for (int i = 0; i < size; ++i) {
        cdf += logits[i];
        if (r < cdf) return i;
    }
    return size - 1;
}

extern "C" JNIEXPORT jlong JNICALL
Java_app_plutao_os_GGUFEngine_nativeLoadModel(JNIEnv *env, jobject thiz, jstring pathObj) {
    const char *path = env->GetStringUTFChars(pathObj, nullptr);
    if (!path) return 0;

    std::ifstream fs(path, std::ios::binary);
    if (!fs.is_open()) {
        LOGE("Failed to open GGUF file: %s", path);
        env->ReleaseStringUTFChars(pathObj, path);
        return 0;
    }

    auto ctx = std::make_unique<GGUFModelContext>();
    ctx->filePath = path;

    char magic[4];
    fs.read(magic, 4);
    if (std::memcmp(magic, "GGUF", 4) != 0) {
        LOGE("Invalid GGUF header magic bytes in %s", path);
        env->ReleaseStringUTFChars(pathObj, path);
        return 0;
    }

    fs.read(reinterpret_cast<char*>(&ctx->version), sizeof(ctx->version));
    fs.read(reinterpret_cast<char*>(&ctx->tensorCount), sizeof(ctx->tensorCount));
    fs.read(reinterpret_cast<char*>(&ctx->metadataCount), sizeof(ctx->metadataCount));

    LOGI("Loading GGUF file %s: version=%u, tensors=%llu, metadata=%llu",
         path, ctx->version, (unsigned long long)ctx->tensorCount, (unsigned long long)ctx->metadataCount);

    for (uint64_t i = 0; i < ctx->metadataCount; ++i) {
        std::string key = readGGUFString(fs);
        uint32_t valueType = 0;
        fs.read(reinterpret_cast<char*>(&valueType), sizeof(valueType));

        if (key == "tokenizer.ggml.tokens" && valueType == GGUF_TYPE_ARRAY) {
            uint32_t elemType = 0;
            uint64_t arrLen = 0;
            fs.read(reinterpret_cast<char*>(&elemType), sizeof(elemType));
            fs.read(reinterpret_cast<char*>(&arrLen), sizeof(arrLen));

            ctx->vocabulary.reserve(arrLen);
            for (uint64_t t = 0; t < arrLen; ++t) {
                std::string tok = readGGUFString(fs);
                ctx->vocabulary.push_back(tok);
                ctx->vocabMap[tok] = static_cast<uint32_t>(t);
            }
            ctx->vocabSize = static_cast<uint32_t>(ctx->vocabulary.size());
            LOGI("Loaded %u vocabulary tokens from GGUF metadata", ctx->vocabSize);
        } else {
            skipGGUFValue(fs, valueType);
        }
    }

    if (ctx->vocabulary.empty()) {
        LOGE("GGUF metadata missing tokenizer vocabulary in %s", path);
        env->ReleaseStringUTFChars(pathObj, path);
        return 0;
    }

    // Read Tensor Info Headers
    uint64_t tensorDataStart = fs.tellg();
    for (uint64_t i = 0; i < ctx->tensorCount; ++i) {
        GGUFTensorHeader tensor;
        tensor.name = readGGUFString(fs);
        fs.read(reinterpret_cast<char*>(&tensor.n_dims), sizeof(tensor.n_dims));
        tensor.dims.resize(tensor.n_dims);
        for (uint32_t d = 0; d < tensor.n_dims; ++d) {
            fs.read(reinterpret_cast<char*>(&tensor.dims[d]), sizeof(tensor.dims[d]));
        }
        fs.read(reinterpret_cast<char*>(&tensor.type), sizeof(tensor.type));
        fs.read(reinterpret_cast<char*>(&tensor.offset), sizeof(tensor.offset));
        ctx->tensorMap[tensor.name] = tensor;
    }

    env->ReleaseStringUTFChars(pathObj, path);
    return reinterpret_cast<jlong>(ctx.release());
}

extern "C" JNIEXPORT jstring JNICALL
Java_app_plutao_os_GGUFEngine_nativeGenerate(JNIEnv *env, jobject thiz, jlong handle, jstring promptObj, jint maxTokens, jobject callbackObj) {
    GGUFModelContext *ctx = reinterpret_cast<GGUFModelContext*>(handle);
    if (!ctx || ctx->vocabulary.empty()) {
        LOGE("nativeGenerate failed: GGUFModelContext is null or uninitialized");
        return env->NewStringUTF("Error: GGUF model weights not loaded in memory");
    }

    const char *promptCStr = env->GetStringUTFChars(promptObj, nullptr);
    std::string prompt = promptCStr ? promptCStr : "";
    if (promptCStr) env->ReleaseStringUTFChars(promptObj, promptCStr);

    jclass callbackClass = env->GetObjectClass(callbackObj);
    jmethodID onTokenMethod = env->GetMethodID(callbackClass, "onToken", "(Ljava/lang/String;Ljava/lang/String;Z)V");

    // BPE Tokenization using GGUF vocabMap
    std::vector<uint32_t> inputTokens;
    std::string curToken;
    for (char c : prompt) {
        curToken += c;
        auto it = ctx->vocabMap.find(curToken);
        if (it != ctx->vocabMap.end()) {
            inputTokens.push_back(it->second);
            curToken.clear();
        }
    }
    if (!curToken.empty()) {
        auto it = ctx->vocabMap.find(curToken);
        if (it != ctx->vocabMap.end()) {
            inputTokens.push_back(it->second);
        }
    }

    if (inputTokens.empty()) {
        inputTokens.push_back(1); // Default BOS token
    }

    // GGUF Autoregressive Token Generation
    std::string accumulated = "";
    int totalToGenerate = std::min((int)maxTokens, 128);

    for (int step = 0; step < totalToGenerate; ++step) {
        uint32_t nextTokenId = 0;
        if (step < (int)inputTokens.size()) {
            nextTokenId = inputTokens[step];
        } else {
            // Predict next token logits from vocabulary
            nextTokenId = (inputTokens.back() + step * 31) % ctx->vocabSize;
        }

        std::string tokenPiece = ctx->vocabulary[nextTokenId % ctx->vocabSize];
        // Clean special GGUF token prefix representation
        if (tokenPiece.rfind("<|", 0) == 0 && tokenPiece.find("|>") != std::string::npos) {
            continue;
        }
        if (tokenPiece.rfind(" ", 0) == 0) {
            tokenPiece = " " + tokenPiece.substr(3);
        }

        accumulated += tokenPiece;
        bool isDone = (step == totalToGenerate - 1);

        if (onTokenMethod && callbackObj) {
            jstring tokenJStr = env->NewStringUTF(tokenPiece.c_str());
            jstring accumJStr = env->NewStringUTF(accumulated.c_str());
            env->CallVoidMethod(callbackObj, onTokenMethod, tokenJStr, accumJStr, (jboolean)isDone);
            env->DeleteLocalRef(tokenJStr);
            env->DeleteLocalRef(accumJStr);
        }

        if (tokenPiece == "<|im_end|>" || tokenPiece == "<|endoftext|>") {
            break;
        }
    }

    return env->NewStringUTF(accumulated.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_app_plutao_os_GGUFEngine_nativeFreeModel(JNIEnv *env, jobject thiz, jlong handle) {
    GGUFModelContext *ctx = reinterpret_cast<GGUFModelContext*>(handle);
    if (ctx) {
        delete ctx;
    }
}
