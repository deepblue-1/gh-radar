#!/usr/bin/env bash
# 틱 뷰어(Phase 37) 오라클 픽스처 생성기 — 맥 전용.
#
# 사용법:
#   bash scripts/tick-oracle/gen-fixtures.sh decode|orders|runs|pnl|g4cut|launch
#   bash scripts/tick-oracle/gen-fixtures.sh pnl --bigtech      (선택 — 빅텍 10/22 하루, GCS 원본 ≈ 3.4GB)
#
# 부명령:
#   decode  레이아웃 덤프(layouts.json) + 디코더 골든 3종(cut1300-krx · cut1300-nxt · raw20k-0900)
#           → packages/shared/src/__fixtures__/ticks/
#   orders  컷 13시 KRX classify_orders 주문별 골든(cut1300-krx.orders.json) — 37-03 Task 1
#   runs    컷 13시 KRX · NXT 런 통계(cut1300-runs.json) + NXT 단독 창 13:30~13:40 팀 주문(cut1300-nxt.window.json)
#           — 37-03 Task 2. 창 값이 AccumNxtFixtures.h kAccumNxt_Expect(13 · 7901/82023350 · 4632/49348980)와 다르면 종료 1
#   pnl     천일고속 KR7000650002 10/14 A3 전용 조각(chunil-1014-a3.ticks.zst) + export payload.pnl 두 범위(chunil-1014.pnl.json)
#           — 37-03 Task 3. 같은 A3 로 파이썬 team_pnl 을 다시 계산해 export 와 다르면 종료 1
#           --bigtech: 빅텍 KR7065450009 10/22 08~19시(bigtech-1022-a3.ticks.zst · bigtech-1022.pnl.json). A3 조각이 1.5MB 를
#           넘으면 **두 파일 모두** 커밋하지 않는다(로컬 검증용 · 테스트는 두 파일이 다 있을 때만 켜진다 — 그 밖엔 skip).
#           원본은 ~/ticks/oracle/20261022/krx/ 에 미리 받아 둔다(아래 GCS 메모).
#   g4cut   빅텍 KR7065450009 10/22 15~17시 G4 조각(bigtech-1022-g4.ticks.zst · bigtech-1022-g4.golden.json) — 37-03 Task 3(필수).
#           원본 ~/ticks/oracle/20261022/krx/20261022-{1500,1600,1700}.pcap.zst (GCS 393,017,311B · 아래 메모). G4 체결 0 이면 종료 1
#   launch  발사 대기열 · 체결 런 골든 조각 4개(quick 261103-pei) — 지정 ISIN A3 · B6 · 보드 · 수신 창(oracle.py launchcut)
#           launch1022-krx-g4   10/22 코스닥 060900 G4 15:59~ — 원본 ~/ticks/oracle/20261022/krx/20261022-{1600..2000}(GCS 메모)
#           launch1030-krx-g4   10/30 184230 G4 15:59~ — ~/ticks/queue-spike/1030/krx-1600.pcap.zst(16:00~16:59)
#           launch1030-krx-0900 10/30 KRX 8종목 09:00:26~09:00:31.500 — ~/ticks/queue-spike/1030/krx-0900.pcap.zst
#           launch1030-nxt-0900 10/30 NXT 6종목 09:00:29.500~09:00:32 — ~/ticks/queue-spike/1030/nxt-0900.pcap.zst
#           하나라도 1.5MB 를 넘으면 종료 1
#
# GCS 원본 받기(deployer SA · 읽기만 · Archive 꺼내기 ≈ $0.05/GB + 송신):
#   GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar \
#     gcloud storage cp gs://gh-trade-tick-archive/raw/krx/20261022/20261022-1500.pcap.zst … ~/ticks/oracle/20261022/krx/
#
# 전제: gh-trade venv(Python 3.14 · compression.zstd · pyarrow)와 로컬 원본 pcap.
#   GH_TRADE_ANALYSIS (기본 /Users/alex/repos/gh-trade/server/tools/analysis)
#   ~/ticks/cut-101360/src/{krx,nxt}/{krx,nxt}-1300.pcap.zst            에코앤드림 KR7101360006 10/16 13시 컷
#   ~/ticks/team-follow/rawpcap/20261014/20261014-0900.pcap.zst       10/14 09시 무필터(모든 태그 + raw)
# 생성물(.ticks.zst · .decode.json · layouts.json)만 커밋한다. 원본 .pcap.zst 는 커밋하지 않는다.
#
# 크기 규칙: .ticks.zst 를 만드는 모든 부명령(decode · pnl · g4cut · launch)이 끝에서 check_size 로 재고, 하나라도
#   1.5MB(1,572,864B) 를 넘으면 종료 1. 예외 하나 — `pnl --bigtech` 는 선택 픽스처라 넘어도 종료 0(경고만 · 두 파일 모두 커밋 금지).
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

# check_size <넘을 때 안내> <파일…> — 크기를 찍고, 하나라도 MAX_BYTES 를 넘으면 안내를 stderr 로 내고 1 을 돌려준다.
check_size() {
  local hint="$1" over=0 f size
  shift
  for f in "$@"; do
    size=$(wc -c < "$f" | tr -d ' ')
    echo "$(basename "$f") ${size}B"
    if [ "$size" -gt "$MAX_BYTES" ]; then
      echo "  ↑ 1.5MB 초과 — $hint" >&2
      over=1
    fi
  done
  return "$over"
}

cmd="${1:-}"
case "$cmd" in
  decode)
    mkdir -p "$FX"
    oracle layouts --out "$FX/layouts.json"
    oracle decode "$HOME/ticks/cut-101360/src/krx/krx-1300.pcap.zst" --label krx --out-prefix "$FX/cut1300-krx"
    oracle decode "$HOME/ticks/cut-101360/src/nxt/nxt-1300.pcap.zst" --label nxt --out-prefix "$FX/cut1300-nxt"
    oracle decode "$HOME/ticks/team-follow/rawpcap/20261014/20261014-0900.pcap.zst" --label krx \
      --limit "$RAW_LIMIT" --out-prefix "$FX/raw20k-0900"
    check_size "raw20k 면 RAW_LIMIT=10000 으로 다시 돌린다" \
      "$FX/cut1300-krx.ticks.zst" "$FX/cut1300-nxt.ticks.zst" "$FX/raw20k-0900.ticks.zst"
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
  pnl)
    if [ "${2:-}" = "--bigtech" ]; then
      oracle pnl --isin KR7065450009 --date 20261022 --pcap-dir "$HOME/ticks/oracle/20261022/krx" \
        --hours 0800,0900,1000,1100,1200,1300,1400,1500,1600,1700,1800,1900 \
        --export "$HOME/ticks/research/export/20261022" --out-prefix "$FX/bigtech-1022"
      # 머리 크기 규칙의 예외 — 선택 픽스처라 넘어도 종료 0(경고만)
      check_size "bigtech-1022-a3.ticks.zst · bigtech-1022.pnl.json 둘 다 커밋하지 않는다(테스트는 둘 다 있을 때만 켜진다)" \
        "$FX/bigtech-1022-a3.ticks.zst" || true
    else
      oracle pnl --isin KR7000650002 --date 20261014 --pcap-dir "$HOME/ticks/team-follow/rawpcap/20261014" \
        --export "$HOME/ticks/research/export/20261014" --out-prefix "$FX/chunil-1014"
      check_size "시간 범위를 줄인다" "$FX/chunil-1014-a3.ticks.zst"
    fi
    ;;
  g4cut)
    oracle g4cut --isin KR7065450009 --date 20261022 --pcap-dir "$HOME/ticks/oracle/20261022/krx" \
      --hours 1500,1600,1700 --out-prefix "$FX/bigtech-1022-g4"
    check_size "시간 범위를 줄인다" "$FX/bigtech-1022-g4.ticks.zst"
    ;;
  launch)
    K22="$HOME/ticks/oracle/20261022/krx"
    Q30="$HOME/ticks/queue-spike/1030"
    oracle launchcut --pcap "$K22/20261022-1600.pcap.zst" --pcap "$K22/20261022-1700.pcap.zst" \
      --pcap "$K22/20261022-1800.pcap.zst" --pcap "$K22/20261022-1900.pcap.zst" --pcap "$K22/20261022-2000.pcap.zst" \
      --date 20261022 --isins KR7060900008 --board G4 --from 15:59:00 --out "$FX/launch1022-krx-g4.ticks.zst"
    oracle launchcut --pcap "$Q30/krx-1600.pcap.zst" --date 20261030 --isins KR7184230001 --board G4 --from 15:59:00 \
      --out "$FX/launch1030-krx-g4.ticks.zst"
    oracle launchcut --pcap "$Q30/krx-0900.pcap.zst" --date 20261030 \
      --isins KR7376900007,KR7033640004,KR7272210006,KR7010060002,KR7012450003,KR7249420001,KR7222800005,KR7445680002 \
      --from 09:00:26 --to 09:00:31.500 --out "$FX/launch1030-krx-0900.ticks.zst"
    oracle launchcut --pcap "$Q30/nxt-0900.pcap.zst" --date 20261030 \
      --isins KR7425420007,KR7376900007,KR7095340006,KR7005930003,KR7012450003,KR7010140002 \
      --from 09:00:29.500 --to 09:00:32 --out "$FX/launch1030-nxt-0900.ticks.zst"
    check_size "수신 창을 줄인다" "$FX"/launch10*.ticks.zst
    ;;
  *)
    echo "사용법: bash scripts/tick-oracle/gen-fixtures.sh decode|orders|runs|pnl [--bigtech]|g4cut|launch" >&2
    exit 2
    ;;
esac
