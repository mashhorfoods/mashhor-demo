#!/bin/sh
# PNG/JPG → overlay/assets/svc-<id>.webp (2400×1500) and svc-<id>-1200.webp. Also works for the real
# cover images: put them in tools/service-covers/out/ as svc-<id>.png/.jpg.
set -e
cd "$(dirname "$0")"
FF=${FFMPEG:-ffmpeg}
for f in out/svc-*.*; do
  id=$(basename "$f" | sed 's/\.[^.]*$//')
  "$FF" -v error -y -i "$f" -vf "scale=2400:1500:force_original_aspect_ratio=increase,crop=2400:1500" \
    -c:v libwebp -quality 80 -compression_level 6 "../../overlay/assets/$id.webp"
  "$FF" -v error -y -i "$f" -vf "scale=1200:750:force_original_aspect_ratio=increase,crop=1200:750" \
    -c:v libwebp -quality 80 -compression_level 6 "../../overlay/assets/$id-1200.webp"
  echo "overlay/assets/$id.webp (+ $id-1200.webp)"
done
