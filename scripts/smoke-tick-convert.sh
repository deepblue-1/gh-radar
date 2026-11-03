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
# 크래시로 포기한 날짜의 수동 재변환(R3-WR-02 · 알림 문서 ops/alert-tick-convert-failure.yaml) — 실행 기록에 끝 기록 없는
# STARTED 만 남은 날짜(OOM · task timeout 3600s)는 같은 한도(8Gi · 3600s)로 돌리면 같은 자리에서 또 죽는다. 한도 override:
#   TASK_TIMEOUT=7200s bash scripts/smoke-tick-convert.sh <YYYYMMDD>    # 이 실행만 task timeout(execute --task-timeout)
#   MEMORY=16Gi bash scripts/smoke-tick-convert.sh <YYYYMMDD>            # Job 메모리를 잠시 올리고(jobs update) 끝나면 원래 값으로 되돌린다
#   CPU=8 MEMORY=32Gi TASK_TIMEOUT=7200s bash scripts/smoke-tick-convert.sh <YYYYMMDD>   # 4 vCPU 는 16Gi 까지 — 그 위는 CPU 도
#   MEMORY · CPU 는 Job 정의를 바꾼다 — Scheduler 시간(23:00~02:30 KST)은 피한다. 되돌리기에 실패하면 ❌ 와 함께 원래 값을 출력한다
#   (그때는 `gcloud run jobs update gh-radar-tick-convert --memory=<원래> --cpu=<원래>` 또는 deploy-tick-convert.sh 재실행).
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
  echo "Usage: [TASK_TIMEOUT=7200s] [MEMORY=16Gi] [CPU=8] bash scripts/smoke-tick-convert.sh <YYYYMMDD> [nightly|request <KRX|NXT>]" >&2
  exit 2
}

DATE="${1:-}"
MODE="${2:-nightly}"
EX="${3:-}"

[[ "$DATE" =~ ^[0-9]{8}$ ]] || usage
TASK_TIMEOUT="${TASK_TIMEOUT:-}"
MEMORY="${MEMORY:-}"
CPU="${CPU:-}"
[[ -z "$TASK_TIMEOUT" || "$TASK_TIMEOUT" =~ ^[0-9]+[smh]?$ ]] || usage
[[ -z "$MEMORY" || "$MEMORY" =~ ^[0-9]+(Mi|Gi)$ ]] || usage
[[ -z "$CPU" || "$CPU" =~ ^[0-9]+$ ]] || usage
case "$MODE" in
  nightly) ARGS="nightly,--date,${DATE}" ;;
  request)
    [[ "$EX" == "KRX" || "$EX" == "NXT" ]] || usage
    ARGS="request,--date,${DATE},--ex,${EX}"
    ;;
  *) usage ;;
esac

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"

# 한도 override(MEMORY · CPU) — 실행 단위 override 가 없어 Job 정의를 잠시 바꾸고, 끝나면(실패 · 중단 포함) 원래 값으로 되돌린다.
ORIG_MEM=""
ORIG_CPU=""
restore_limits() {
  [[ -n "$ORIG_MEM" ]] || return 0
  echo "▶ 한도 되돌리기: memory=${ORIG_MEM} cpu=${ORIG_CPU}"
  if ! gcloud run jobs update "$JOB" --project="$GCP_PROJECT_ID" --region="$REGION" \
    --memory="$ORIG_MEM" --cpu="$ORIG_CPU" --quiet >/dev/null; then
    echo "❌ 한도 되돌리기 실패 — 직접: gcloud run jobs update $JOB --region=$REGION --memory=$ORIG_MEM --cpu=$ORIG_CPU" >&2
  fi
}
if [[ -n "$MEMORY" || -n "$CPU" ]]; then
  LIMITS=$(gcloud run jobs describe "$JOB" --project="$GCP_PROJECT_ID" --region="$REGION" \
    --format='value(spec.template.spec.template.spec.containers[0].resources.limits.memory,spec.template.spec.template.spec.containers[0].resources.limits.cpu)' 2>/dev/null)
  CUR_MEM=$(printf '%s' "$LIMITS" | cut -f1)
  CUR_CPU=$(printf '%s' "$LIMITS" | cut -f2)
  if [[ -z "$CUR_MEM" || -z "$CUR_CPU" ]]; then
    echo "❌ 지금 한도를 읽지 못했다 — 되돌릴 값이 없어 바꾸지 않는다" >&2
    exit 1
  fi
  ORIG_MEM="$CUR_MEM"
  ORIG_CPU="$CUR_CPU"
  trap restore_limits EXIT
  echo "▶ 한도 override: memory=${MEMORY:-$ORIG_MEM} cpu=${CPU:-$ORIG_CPU} (원래 memory=${ORIG_MEM} cpu=${ORIG_CPU})"
  if ! gcloud run jobs update "$JOB" --project="$GCP_PROJECT_ID" --region="$REGION" \
    --memory="${MEMORY:-$ORIG_MEM}" --cpu="${CPU:-$ORIG_CPU}" --quiet >/dev/null; then
    echo "❌ 한도 override 실패" >&2
    exit 1
  fi
fi

EXEC_FLAGS=(--project="$GCP_PROJECT_ID" --region="$REGION" --args="$ARGS" --wait --format='value(metadata.name)')
[[ -n "$TASK_TIMEOUT" ]] && EXEC_FLAGS+=(--task-timeout="$TASK_TIMEOUT")

echo "▶ execute: $JOB --args=$ARGS${TASK_TIMEOUT:+ --task-timeout=$TASK_TIMEOUT} (--wait)"
START_EPOCH=$(date +%s)
EXEC_OUT=$(gcloud run jobs execute "$JOB" "${EXEC_FLAGS[@]}" 2>&1)
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
