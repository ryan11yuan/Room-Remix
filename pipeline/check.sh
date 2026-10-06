#!/bin/sh
# Run by `npm run pipeline:check` with --gpus all: fails unless the GPU and every pipeline tool are usable.
set -e
nvidia-smi -L
echo "OpenSplat $(opensplat --version)"
colmap help > /dev/null
echo "COLMAP ok"
ffmpeg -hide_banner -version | head -n 1
ffprobe -hide_banner -version | head -n 1
