# Room Remix's splat pipeline (spec 2026-10-06 §3-§4). The base, room-remix-opensplat, is OpenSplat's own Dockerfile at
# v1.2.2 built for the RTX 4060 (sm_89) by `npm run pipeline:build`. COLMAP and ffmpeg come from Ubuntu 22.04's
# packages; Ubuntu's COLMAP has no CUDA, so SIFT runs on the CPU (the pipeline passes use_gpu 0).
FROM room-remix-opensplat
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
