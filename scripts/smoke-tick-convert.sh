#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끈다 — 실행 실패여도 실행 이름 · 로그 요약을 끝까지 출력한다(선례 smoke 패턴).

# ═══════════════════════════════════════════════════════════════
# smoke-tick-convert.sh
# Phase 37 — 틱 격자 변환 Job 배포 후 한 번 실행해 보기(SC3 실측 — 통독 시간 · 읽기 바이트).
#
# Usage:
#   bash scripts/smoke-tick-convert.sh <YYYYMMDD>                 # nightly --date D (그 날 하나 · 기록 무시 · 다시 쓴다)
#   bash scripts/smoke-tick-convert.sh <YYYYMMDD> nightly
#   bash scripts/smoke-tick-convert.sh <YYYYMMDD> request <KRX|NXT>  # request --date D --ex EX (pending 요청이 없으면 기록만)
#
# 동작: gcloud run jobs execute gh-radar-tick-convert --args=… --wait (이미지 ENTRYPOINT ["node", "dist/index.js"] —
#       --args 는 CMD 자리만 바꾼다) → 실행 이름 · 소요 · Cloud Logging 의 `[tick-convert]` 요약 줄을 출력한다.
#       로그 수집 지연(수십 초)은 10초 간격 최대 9회(≈90초) 재조회로 흡수한다(limitup-sync smoke 동형).
# 종료 코드: 0 실행 성공 · 1 실행 실패(Job 종료 1 · 2) · 2 잘못된 인자.
# 필수 env: GCP_PROJECT_ID. 실행: 메인 세션(37-16).
# ═══════════════════════════════════════════════════════════════

REGION=asia-northeast3
JOB=gh-radar-tick-convert

usage() {
  echo "Usage: bash scripts/smoke-tick-convert.sh <YYYYMMDD> [nightly|request <KRX|NXT>]" >&2
  exit 2
}

DATE="${1:-}"
MODE="${2:-nightly}"
EX="${3:-}"

[[ "$DATE" =~ ^[0-9]{8}$ ]] || usage
case "$MODE" in
  nightly) ARGS="nightly,--date,${DATE}" ;;
  request)
    [[ "$EX" == "KRX" || "$EX" == "NXT" ]] || usage
    ARGS="request,--date,${DATE},--ex,${EX}"
    ;;
  *) usage ;;
esac

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"

echo "▶ execute: $JOB --args=$ARGS (--wait)"
START_EPOCH=$(date +%s)
EXEC_OUT=$(gcloud run jobs execute "$JOB" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --args="$ARGS" \
  --wait \
  --format='value(metadata.name)' 2>&1)
EXEC_RC=$?
END_EPOCH=$(date +%s)

# 실행 이름 — 성공이면 format 출력 한 줄, 실패면 오류 메시지 안의 `gh-radar-tick-convert-xxxxx`
EXEC_NAME=$(printf '%s\n' "$EXEC_OUT" | grep -Eo "${JOB}-[a-z0-9]+" | tail -1)
echo "  execution: ${EXEC_NAME:-?}"
echo "  wall:      $((END_EPOCH - START_EPOCH))s (gcloud --wait 왕복 포함)"

if [[ -n "$EXEC_NAME" ]]; then
  gcloud run jobs executions describe "$EXEC_NAME" \
    --project="$GCP_PROJECT_ID" \
    --region="$REGION" \
    --format='value(status.startTime,status.completionTime,status.succeededCount,status.failedCount)' 2>/dev/null \
    | awk -F'\t' '{ printf "  start=%s  done=%s  succeeded=%s  failed=%s\n", $1, $2, $3, $4 }'
fi

# [tick-convert] 요약 줄 — pino JSON 은 jsonPayload.msg
if [[ -n "$EXEC_NAME" ]]; then
  FILTER="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${JOB}\" AND labels.\"run.googleapis.com/execution_name\"=\"${EXEC_NAME}\" AND jsonPayload.msg:\"[tick-convert]\""
  LINES=""
  for _ in 1 2 3 4 5 6 7 8 9; do
    LINES=$(gcloud logging read "$FILTER" \
      --project="$GCP_PROJECT_ID" \
      --order=asc \
      --limit=100 \
      --freshness=2h \
      --format='value(jsonPayload.msg)' 2>/dev/null)
    [[ -n "$LINES" ]] && break
    sleep 10
  done
  echo ""
  echo "── [tick-convert] 요약 ──"
  if [[ -n "$LINES" ]]; then
    printf '%s\n' "$LINES"
  else
    echo "  (요약 줄 없음 — 로그 수집 지연이거나 기동 실패. gcloud logging read 로 실행 ${EXEC_NAME} 를 직접 본다)"
  fi
fi

echo ""
if [[ $EXEC_RC -ne 0 ]]; then
  echo "❌ 실행 실패 (gcloud rc=$EXEC_RC)"
  printf '%s\n' "$EXEC_OUT" | tail -5
  exit 1
fi
echo "✅ 실행 성공"
exit 0
