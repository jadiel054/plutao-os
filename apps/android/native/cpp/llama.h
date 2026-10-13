#ifndef LLAMA_H
#define LLAMA_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct llama_model llama_model;
typedef struct llama_context llama_context;
typedef int32_t llama_token;

struct llama_model_params {
    int32_t n_gpu_layers;
    bool use_mmap;
    bool use_mlock;
};

struct llama_context_params {
    uint32_t seed;
    uint32_t n_ctx;
    uint32_t n_batch;
    uint32_t n_threads;
};

struct llama_model_params llama_model_default_params(void);
struct llama_context_params llama_context_default_params(void);

llama_model* llama_load_model_from_file(const char* path_model, struct llama_model_params params);
void llama_free_model(llama_model* model);

llama_context* llama_new_context_with_model(llama_model* model, struct llama_context_params params);
void llama_free(llama_context* ctx);

int llama_tokenize(const llama_model* model, const char* text, int text_len, llama_token* tokens, int max_tokens, bool add_special, bool parse_special);
int llama_token_to_piece(const llama_model* model, llama_token token, char* buf, int length, int lstrip, bool special);

int llama_eval(llama_context* ctx, const llama_token* tokens, int32_t n_tokens, int32_t n_past);
float* llama_get_logits(llama_context* ctx);
int llama_n_vocab(const llama_model* model);
llama_token llama_sample_token_greedy(llama_context* ctx, float* logits, int vocab_size);

#ifdef __cplusplus
}
#endif

#endif // LLAMA_H
