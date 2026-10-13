#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <cstring>
#include "llama.h"

#define LOG_TAG "GGUFEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

struct NativeEngineState {
    llama_model* model = nullptr;
    llama_context* ctx = nullptr;
};

extern "C" JNIEXPORT jlong JNICALL
Java_app_plutao_os_GGUFEngine_nativeLoadModel(JNIEnv *env, jobject thiz, jstring pathObj) {
    const char *path = env->GetStringUTFChars(pathObj, nullptr);
    if (!path) return 0;

    LOGI("nativeLoadModel: Loading GGUF model from %s via llama.cpp", path);

    llama_model_params mparams = llama_model_default_params();
    llama_model* model = llama_load_model_from_file(path, mparams);

    env->ReleaseStringUTFChars(pathObj, path);

    if (!model) {
        LOGE("nativeLoadModel: llama_load_model_from_file returned null");
        return 0;
    }

    llama_context_params cparams = llama_context_default_params();
    llama_context* ctx = llama_new_context_with_model(model, cparams);

    if (!ctx) {
        LOGE("nativeLoadModel: llama_new_context_with_model failed");
        llama_free_model(model);
        return 0;
    }

    auto state = new NativeEngineState();
    state->model = model;
    state->ctx = ctx;

    LOGI("nativeLoadModel: llama.cpp model context successfully loaded at handle %p", state);
    return reinterpret_cast<jlong>(state);
}

extern "C" JNIEXPORT jstring JNICALL
Java_app_plutao_os_GGUFEngine_nativeGenerate(JNIEnv *env, jobject thiz, jlong handle, jstring promptObj, jint maxTokens, jobject callbackObj) {
    NativeEngineState *state = reinterpret_cast<NativeEngineState*>(handle);
    if (!state || !state->model || !state->ctx) {
        LOGE("nativeGenerate: handle is invalid or context is null");
        return env->NewStringUTF("Error: Native GGUF llama context is null");
    }

    const char *promptCStr = env->GetStringUTFChars(promptObj, nullptr);
    std::string prompt = promptCStr ? promptCStr : "Olá!";
    if (promptCStr) env->ReleaseStringUTFChars(promptObj, promptCStr);

    jclass callbackClass = env->GetObjectClass(callbackObj);
    jmethodID onTokenMethod = env->GetMethodID(callbackClass, "onToken", "(Ljava/lang/String;Ljava/lang/String;Z)V");

    // Tokenize input prompt
    std::vector<llama_token> tokens(2048);
    int nTokens = llama_tokenize(state->model, prompt.c_str(), (int)prompt.size(), tokens.data(), (int)tokens.size(), true, true);

    if (nTokens <= 0) {
        tokens[0] = 1;
        nTokens = 1;
    }

    // Evaluate input prompt batch
    llama_eval(state->ctx, tokens.data(), nTokens, 0);

    std::string fullAccumulatedText;
    int vocabSize = llama_n_vocab(state->model);
    int tokensToGenerate = std::min((int)maxTokens, 128);

    for (int i = 0; i < tokensToGenerate; ++i) {
        float* logits = llama_get_logits(state->ctx);
        llama_token nextTok = llama_sample_token_greedy(state->ctx, logits, vocabSize);

        char pieceBuf[256];
        int pieceLen = llama_token_to_piece(state->model, nextTok, pieceBuf, sizeof(pieceBuf), 0, false);
        std::string pieceStr(pieceBuf, pieceLen > 0 ? pieceLen : 0);

        fullAccumulatedText += pieceStr;
        bool isDone = (i == tokensToGenerate - 1);

        if (onTokenMethod && callbackObj) {
            jstring tokenJStr = env->NewStringUTF(pieceStr.c_str());
            jstring accumJStr = env->NewStringUTF(fullAccumulatedText.c_str());
            env->CallVoidMethod(callbackObj, onTokenMethod, tokenJStr, accumJStr, (jboolean)isDone);
            env->DeleteLocalRef(tokenJStr);
            env->DeleteLocalRef(accumJStr);
        }

        // Eval next token
        llama_token nextBatch[1] = { nextTok };
        llama_eval(state->ctx, nextBatch, 1, nTokens + i);
    }

    return env->NewStringUTF(fullAccumulatedText.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_app_plutao_os_GGUFEngine_nativeFreeModel(JNIEnv *env, jobject thiz, jlong handle) {
    NativeEngineState *state = reinterpret_cast<NativeEngineState*>(handle);
    if (state) {
        if (state->ctx) {
            llama_free(state->ctx);
        }
        if (state->model) {
            llama_free_model(state->model);
        }
        delete state;
        LOGI("nativeFreeModel: llama context and model freed");
    }
}
