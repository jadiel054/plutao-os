cmake_minimum_required(VERSION 3.22.1)
project("llama_vendor")

add_library(
    llama
    STATIC
    ../../llama.cpp
)

target_include_directories(
    llama
    PUBLIC
    ../../
)

target_link_libraries(
    llama
)
