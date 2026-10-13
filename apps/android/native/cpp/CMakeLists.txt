cmake_minimum_required(VERSION 3.22.1)
project("gguf_engine")

add_library(
    gguf_engine
    SHARED
    gguf_engine.cpp
)

find_library(
    log-lib
    log
)

target_link_libraries(
    gguf_engine
    ${log-lib}
)
