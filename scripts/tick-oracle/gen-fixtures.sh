#!/usr/bin/env bash
# 틱 뷰어(Phase 37) 오라클 픽스처 생성기 — 맥 전용.
#
# 사용법:
#   bash scripts/tick-oracle/gen-fixtures.sh decode|orders|runs
#
# 부명령:
#   decode  레이아웃 덤프(layouts.json) + 디코더 골든 3종(cut1300-krx · cut1300-nxt · raw20k-0900)
#           → packages/shared/src/__fixtures__/ticks/
#   orders  컷 13시 KRX classify_orders 주문별 골든(cut1300-krx.orders.json) — 37-03 Task 1
#   runs    컷 13시 KRX · NXT 런 통계(cut1300-runs.json) + NXT 단독 창 13:30~13:40 팀 주문(cut1300-nxt.window.json)
#           — 37-03 Task 2. 창 값이 AccumNxtFixtures.h kAccumNxt_Expect(13 · 7901/82023350 · 4632/49348980)와 다르면 종료 1
#
# 전제: gh-trade venv(Python 3.14 · compression.zstd · pyarrow)와 로컬 원본 pcap.
#   GH_TRADE_ANALYSIS (기본 /Users/alex/repos/gh-trade/server/tools/analysis)
#   ~/ticks/cut-101360/src/{krx,nxt}/{krx,nxt}-1300.pcap.zst            에코앤드림 KR7101360006 10/16 13시 컷
#   ~/ticks/team-follow/rawpcap/20261014/20261014-0900.pcap.zst       10/14 09시 무필터(모든 태그 + raw)
# 생성물(.ticks.zst · .decode.json · layouts.json)만 커밋한다. 원본 .pcap.zst 는 커밋하지 않는다.
#
# 크기 규칙: .ticks.zst 가 하나라도 1.5MB(1,572,864B) 를 넘으면 종료 1.
#   raw20k 가 넘으면 RAW_LIMIT=10000 으로 다시 돌린다(무필터 조각의 첫 N 프레임 — 모든 태그가 남는 한 줄여도 된다).
#
# 결정성: 같은 원본 · 같은 venv 면 다시 돌려도 픽스처 바이트가 같다(zstd-19 · JSON 키 정렬).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

GH_TRADE_ANALYSIS="${GH_TRADE_ANALYSIS:-/Users/alex/repos/gh-trade/server/tools/analysis}"
export GH_TRADE_ANALYSIS
PY="$GH_TRADE_ANALYSIS/.venv/bin/python"
ORACLE="scripts/tick-oracle/oracle.py"
FX="packages/shared/src/__fixtures__/ticks"
RAW_LIMIT="${RAW_LIMIT:-20000}"
MAX_BYTES=1572864

oracle() { "$PY" -I "$ORACLE" "$@"; }

cmd="${1:-}"
case "$cmd" in
  decode)
    mkdir -p "$FX"
    oracle layouts --out "$FX/layouts.json"
    oracle decode "$HOME/ticks/cut-101360/src/krx/krx-1300.pcap.zst" --label krx --out-prefix "$FX/cut1300-krx"
    oracle decode "$HOME/ticks/cut-101360/src/nxt/nxt-1300.pcap.zst" --label nxt --out-prefix "$FX/cut1300-nxt"
    oracle decode "$HOME/ticks/team-follow/rawpcap/20261014/20261014-0900.pcap.zst" --label krx \
      --limit "$RAW_LIMIT" --out-prefix "$FX/raw20k-0900"
    over=0
    for f in "$FX"/*.ticks.zst; do
      size=$(wc -c < "$f" | tr -d ' ')
      echo "$(basename "$f") ${size}B"
      if [ "$size" -gt "$MAX_BYTES" ]; then
        echo "  ↑ 1.5MB 초과 — raw20k 면 RAW_LIMIT=10000 으로 다시 돌린다" >&2
        over=1
      fi
    done
    exit "$over"
    ;;
  orders)
    oracle orders "$HOME/ticks/cut-101360/src/krx/krx-1300.pcap.zst" --out "$FX/cut1300-krx.orders.json"
    ;;
  runs)
    oracle runs --krx "$HOME/ticks/cut-101360/src/krx/krx-1300.pcap.zst" --nxt "$HOME/ticks/cut-101360/src/nxt/nxt-1300.pcap.zst" \
      --out "$FX/cut1300-runs.json"
    oracle window "$HOME/ticks/cut-101360/src/nxt/nxt-1300.pcap.zst" --from 13:30:00 --to 13:40:00 \
      --expect 13,7901,82023350,4632,49348980 --out "$FX/cut1300-nxt.window.json"
    ;;
  *)
    echo "사용법: bash scripts/tick-oracle/gen-fixtures.sh decode|orders|runs" >&2
    exit 2
    ;;
esac
