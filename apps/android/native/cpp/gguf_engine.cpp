#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <cstring>
#include <algorithm>
#include <thread>
#include <atomic>
#include "llama.h"

#define LOG_TAG "GGUFEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

struct NativeEngineState {
    llama_model* model = nullptr;
    llama_context* ctx = nullptr;
    const llama_vocab* vocab = nullptr;
    llama_sampler* sampler = nullptr;
    std::atomic<bool> canceled{false};
};

extern "C" JNIEXPORT jlong JNICALL
Java_app_plutao_os_GGUFEngine_nativeLoadModel(JNIEnv *env, jobject thiz, jstring pathObj) {
    const char *path = env->GetStringUTFChars(pathObj, nullptr);
    if (!path) return 0;

    LOGI("nativeLoadModel: Loading official llama.cpp model weights from %s", path);

    llama_backend_init();

    llama_model_params mparams = llama_model_default_params();
    llama_model* model = llama_model_load_from_file(path, mparams);

    env->ReleaseStringUTFChars(pathObj, path);

    if (!model) {
        LOGE("nativeLoadModel: llama_model_load_from_file returned null for %s", path);
        return 0;
    }

    uint32_t hwThreads = std::thread::hardware_concurrency();
    int32_t targetThreads = std::min((int32_t)4, (int32_t)(hwThreads > 0 ? hwThreads : 4));

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = 2048;
    cparams.n_threads = targetThreads;
    cparams.n_threads_batch = targetThreads;

    LOGI("nativeLoadModel: configured n_ctx=%u, n_threads=%d (hwThreads=%u)", cparams.n_ctx, targetThreads, hwThreads);

    llama_context* ctx = llama_init_from_model(model, cparams);

    if (!ctx) {
        LOGE("nativeLoadModel: llama_init_from_model failed");
        llama_model_free(model);
        return 0;
    }

    const llama_vocab* vocab = llama_model_get_vocab(model);

    // Sampler chain: Top-K, Top-P, Temp, Dist
    auto sparams = llama_sampler_chain_default_params();
    llama_sampler* sampler = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(sampler, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(sampler, llama_sampler_init_top_p(0.9f, 1));
    llama_sampler_chain_add(sampler, llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(sampler, llama_sampler_init_dist(1234));

    auto state = new NativeEngineState();
    state->model = model;
    state->ctx = ctx;
    state->vocab = vocab;
    state->sampler = sampler;

    LOGI("nativeLoadModel: llama.cpp model context successfully initialized in C++ memory at %p", state);
    return reinterpret_cast<jlong>(state);
}

extern "C" JNIEXPORT void JNICALL
Java_app_plutao_os_GGUFEngine_nativeCancel(JNIEnv *env, jobject thiz, jlong handle) {
    NativeEngineState *state = reinterpret_cast<NativeEngineState*>(handle);
    if (state) {
        state->canceled.store(true);
        LOGI("nativeCancel: generation cancel flag set");
    }
}

extern "C" JNIEXPORT jstring JNICALL
Java_app_plutao_os_GGUFEngine_nativeGenerate(JNIEnv *env, jobject thiz, jlong handle, jstring promptObj, jint maxTokens, jobject callbackObj) {
    NativeEngineState *state = reinterpret_cast<NativeEngineState*>(handle);
    if (!state || !state->model || !state->ctx || !state->vocab || !state->sampler) {
        LOGE("nativeGenerate: invalid native state or model context uninitialized");
        return env->NewStringUTF("Error: Native GGUF llama context is uninitialized or unloaded");
    }

    state->canceled.store(false);

    // Clear KV cache/memory before each new turn
    llama_memory_t mem = llama_get_memory(state->ctx);
    llama_memory_clear(mem, true);

    const char *promptCStr = env->GetStringUTFChars(promptObj, nullptr);
    std::string prompt = promptCStr ? promptCStr : "Olá!";
    if (promptCStr) env->ReleaseStringUTFChars(promptObj, promptCStr);

    jclass callbackClass = env->GetObjectClass(callbackObj);
    jmethodID onTokenMethod = env->GetMethodID(callbackClass, "onToken", "(Ljava/lang/String;Ljava/lang/String;Z)V");

    // Tokenize prompt with official llama.cpp vocabulary
    std::vector<llama_token> promptTokens(4096);
    int nPromptTokens = llama_tokenize(
        state->vocab,
        prompt.c_str(),
        (int32_t)prompt.size(),
        promptTokens.data(),
        (int32_t)promptTokens.size(),
        true,
        true
    );

    if (nPromptTokens <= 0) {
        promptTokens[0] = 1; // Default BOS
        nPromptTokens = 1;
    }

    // Evaluate prompt tokens in batch
    llama_batch batch = llama_batch_get_one(promptTokens.data(), nPromptTokens);
    if (llama_decode(state->ctx, batch) != 0) {
        LOGE("nativeGenerate: llama_decode failed on prompt tokens batch");
        return env->NewStringUTF("Error: GGUF decode evaluation failed");
    }

    std::string fullAccumulatedText;
    int limit = maxTokens > 0 ? (int)maxTokens : 96;

    for (int i = 0; i < limit; ++i) {
        if (state->canceled.load()) {
            LOGI("nativeGenerate: generation loop canceled by user");
            break;
        }

        llama_token sampledTok = llama_sampler_sample(state->sampler, state->ctx, -1);
        llama_sampler_accept(state->sampler, sampledTok);

        if (llama_vocab_is_eog(state->vocab, sampledTok)) {
            LOGI("nativeGenerate: hit EOG / EOS token");
            break;
        }

        char pieceBuf[256];
        int pieceLen = llama_token_to_piece(state->vocab, sampledTok, pieceBuf, sizeof(pieceBuf), 0, false);
        std::string pieceStr(pieceBuf, pieceLen > 0 ? pieceLen : 0);

        if (pieceStr.find("<|im_end|>") != std::string::npos) {
            LOGI("nativeGenerate: hit <|im_end|> stop sequence");
            break;
        }

        fullAccumulatedText += pieceStr;
        bool isDone = (i == limit - 1);

        if (onTokenMethod && callbackObj) {
            jstring tokenJStr = env->NewStringUTF(pieceStr.c_str());
            jstring accumJStr = env->NewStringUTF(fullAccumulatedText.c_str());
            env->CallVoidMethod(callbackObj, onTokenMethod, tokenJStr, accumJStr, (jboolean)isDone);
            env->DeleteLocalRef(tokenJStr);
            env->DeleteLocalRef(accumJStr);
        }

        llama_batch nextBatch = llama_batch_get_one(&sampledTok, 1);
        if (llama_decode(state->ctx, nextBatch) != 0) {
            break;
        }
    }

    return env->NewStringUTF(fullAccumulatedText.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_app_plutao_os_GGUFEngine_nativeFreeModel(JNIEnv *env, jobject thiz, jstring handle) {
    // Unused overload signature if any
}

extern "C" JNIEXPORT void JNICALL
Java_app_plutao_os_GGUFEngine_nativeFreeModel__J(JNIEnv *env, jobject thiz, jlong handle) {
    NativeEngineState *state = reinterpret_cast<NativeEngineState*>(handle);
    if (state) {
        if (state->sampler) {
            llama_sampler_free(state->sampler);
        }
        if (state->ctx) {
            llama_free(state->ctx);
        }
        if (state->model) {
            llama_model_free(state->model);
        }
        delete state;
        LOGI("nativeFreeModel: official llama context and model memory freed");
    }
}
