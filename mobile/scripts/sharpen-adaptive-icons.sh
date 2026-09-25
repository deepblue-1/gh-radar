#!/usr/bin/env bash
# D-22 후처리 — @capacitor/assets@3.0.5 의 Android 어댑티브 전경 흐림 보정.
#
# 생성기는 mipmap-anydpi-v26/ic_launcher*.xml 에서 전경을 inset 16.7%(108dp 레이어 안 72dp 영역)로
# 그리면서 ic_launcher_foreground.png 는 48dp 크기로만 뽑는다 → 런처에서 1.5배 업스케일돼 흐려진다.
# 원본 resources/icon-foreground.png(1024) 에서 72dp 크기로 다시 뽑아 1:1 로 맞춘다.
# `native:assets` 가 generate 직후 호출한다(재생성 때 흐림이 되돌아오지 않게).
set -euo pipefail
cd "$(dirname "$0")/.."
src=resources/icon-foreground.png
res=android/app/src/main/res
# 72dp × 밀도 배율(ldpi .75 · mdpi 1 · hdpi 1.5 · xhdpi 2 · xxhdpi 3 · xxxhdpi 4)
for pair in ldpi:54 mdpi:72 hdpi:108 xhdpi:144 xxhdpi:216 xxxhdpi:288; do
  density=${pair%%:*}; px=${pair##*:}
  out="$res/mipmap-$density/ic_launcher_foreground.png"
  [ -f "$out" ] || { echo "missing $out (generate 먼저)" >&2; exit 1; }
  sips -z "$px" "$px" "$src" --out "$out" >/dev/null
  echo "$out ${px}px"
done
echo "SHARPEN OK"
