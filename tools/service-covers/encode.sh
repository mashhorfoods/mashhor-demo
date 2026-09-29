#!/bin/sh
# The service covers: tools/service-covers/out/svc-<id>.png|.jpg (16:10, at
# least 1600 wide) → overlay/assets/svc-<id>.webp (1600×1000) and
# svc-<id>-1200.webp (1200×750, for phones). Then rebuild.
#
#   FFMPEG=/path/to/ffmpeg tools/service-covers/encode.sh
set -e
cd "$(dirname "$0")"
FF=${FFMPEG:-ffmpeg}
for f in out/svc-*.*; do
  id=$(basename "$f" | sed 's/\.[^.]*$//')
  for size in 1600:1000 1200:750; do
    w=${size%%:*}
    name=$id; [ "$w" = 1600 ] || name=$id-$w
    "$FF" -v error -y -i "$f" -vf "scale=$size:force_original_aspect_ratio=increase:flags=lanczos,crop=$size" \
      -c:v libwebp -quality 82 -compression_level 6 "../../overlay/assets/$name.webp"
  done
  echo "overlay/assets/$id.webp (+ $id-1200.webp)"
done
