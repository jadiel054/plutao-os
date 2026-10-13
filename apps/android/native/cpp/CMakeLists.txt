cmake_minimum_required(VERSION 3.22.1)
project("gguf_engine")

set(BUILD_SHARED_LIBS ON CACHE BOOL "Build shared libs" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "Build examples" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "Build tests" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "Build server" FORCE)

add_subdirectory(vendor/llama.cpp)

add_library(
    gguf_engine
    SHARED
    gguf_engine.cpp
)

find_library(
    log-lib
    log
)

target_include_directories(
    gguf_engine
    PRIVATE
    vendor/llama.cpp/include
    vendor/llama.cpp/ggml/include
)

target_link_libraries(
    gguf_engine
    llama
    ${log-lib}
)
