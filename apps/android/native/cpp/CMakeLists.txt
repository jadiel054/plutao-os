cmake_minimum_required(VERSION 3.22.1)
project("gguf_engine")

set(BUILD_SHARED_LIBS ON CACHE BOOL "Build shared libs" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "Build examples" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "Build tests" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "Build server" FORCE)

# Android NDK / Bionic defines madvise(2) but not posix_madvise(3) or POSIX_MADV_*
add_compile_definitions(_POSIX_C_SOURCE=200112L _XOPEN_SOURCE=600)

if(ANDROID)
    add_compile_definitions(
        posix_madvise=madvise
        POSIX_MADV_WILLNEED=MADV_WILLNEED
        POSIX_MADV_RANDOM=MADV_RANDOM
        POSIX_MADV_NORMAL=MADV_NORMAL
        POSIX_MADV_SEQUENTIAL=MADV_SEQUENTIAL
        POSIX_MADV_DONTNEED=MADV_DONTNEED
    )
endif()

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
