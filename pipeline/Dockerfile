# Room Remix's splat pipeline (spec 2026-10-06 §3-§4).
# OpenSplat v1.2.2 is built the way its own Dockerfile builds it (Ubuntu 22.04, CUDA 12.1.1, libtorch 2.2.1), for the
# RTX 4060 (sm_89), with one difference: that Dockerfile runs plain `ninja`, one compile per CPU, and on the demo laptop
# those libtorch compiles filled Docker Desktop's 7.8 GB VM until Docker stopped answering. BUILD_JOBS caps them.
# COLMAP and ffmpeg come from Ubuntu's packages after the compile, so changing them doesn't rebuild OpenSplat. Ubuntu's
# COLMAP has no CUDA, so SIFT runs on the CPU (the pipeline passes use_gpu 0).
FROM ubuntu:22.04
ARG OPENSPLAT_VERSION=v1.2.2
ARG CUDA_VERSION=12.1.1
ARG TORCH_VERSION=2.2.1
ARG CMAKE_CUDA_ARCHITECTURES=89
ARG BUILD_JOBS=2
SHELL ["/bin/bash", "-c"]
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y build-essential ca-certificates cmake git ninja-build libopencv-dev unzip wget sudo && \
    rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${OPENSPLAT_VERSION}" https://github.com/pierotofy/OpenSplat.git /code
WORKDIR /code
RUN bash .github/workflows/cuda/Linux.sh "ubuntu-22.04" "${CUDA_VERSION}"
RUN CU="cu${CUDA_VERSION%%.*}$(echo "${CUDA_VERSION}" | cut -d'.' -f2)" && \
    wget -nv "https://download.pytorch.org/libtorch/${CU}/libtorch-cxx11-abi-shared-with-deps-${TORCH_VERSION}%2B${CU}.zip" -O libtorch.zip && \
    unzip -q libtorch.zip -d . && \
    rm libtorch.zip
RUN CU="cu${CUDA_VERSION%%.*}$(echo "${CUDA_VERSION}" | cut -d'.' -f2)" && \
    source .github/workflows/cuda/Linux-env.sh "${CU}" && \
    mkdir build && cd build && \
    cmake .. -GNinja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/code/libtorch \
      -DCMAKE_CUDA_ARCHITECTURES="${CMAKE_CUDA_ARCHITECTURES}" -DCUDA_TOOLKIT_ROOT_DIR="${CUDA_HOME}" && \
    ninja -j "${BUILD_JOBS}"
RUN apt-get update && \
    apt-get install -y --no-install-recommends colmap ffmpeg && \
    rm -rf /var/lib/apt/lists/*
RUN ln -sf /code/build/opensplat /usr/local/bin/opensplat
# COLMAP links Qt, and nothing here has a display.
ENV QT_QPA_PLATFORM=offscreen
COPY check.sh /usr/local/bin/rr-check
# A Windows checkout can give the script CRLF line endings.
RUN sed -i 's/\r$//' /usr/local/bin/rr-check && chmod +x /usr/local/bin/rr-check
WORKDIR /job
