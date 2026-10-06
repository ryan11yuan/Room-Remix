#!/bin/sh
# Run by `npm run pipeline:check` with --gpus all: fails unless the GPU and every pipeline tool are usable.
# Each tool's output is captured in an assignment first: under set -e a failing command there stops the script,
# where one inside echo "$(...)" or before a pipe would not.
set -e
nvidia-smi -L
version=$(opensplat --version)
echo "OpenSplat $version"
colmap help > /dev/null
echo "COLMAP ok"
version=$(ffmpeg -hide_banner -version)
echo "$version" | head -n 1
version=$(ffprobe -hide_banner -version)
echo "$version" | head -n 1
