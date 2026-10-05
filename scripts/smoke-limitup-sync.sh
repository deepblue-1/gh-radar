#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 개별 invariant fail 추적 (선례 smoke 패턴)
set +x  # 비밀(service_role 키)이 trace 로 새지 않게 — 키는 변수 · 600 헤더 파일에만

# ═══════════════════════════════════════════════════════════════
# smoke-limitup-sync.sh
# Phase 28 D-14 · D-13 · D-20 — 밤 export 적재 워커 배포 후 검증 (INV-1~7)
#
# Usage:
#   bash scripts/smoke-limitup-sync.sh                    # INV-1~7 전체 (대상 날짜 = GCS 의 manifest 있는 최신 날짜)
#   bash scripts/smoke-limitup-sync.sh --date 20261002    # INV-4 · INV-6 대상 날짜 지정
#   bash scripts/smoke-limitup-sync.sh --check-scheduler  # INV-5 만
#
# 필수 env: GCP_PROJECT_ID · SUPABASE_URL (--check-scheduler 는 GCP_PROJECT_ID 만)
# 키: SUPABASE_SERVICE_ROLE_KEY 가 없으면 Secret gh-radar-supabase-service-role 최신 버전을 변수로만 읽는다(출력 금지).
#
# INV-1: Job execute --wait exit 0
# INV-2: 로그 "limitup-sync complete" 1건 이상 (방금 실행 — jsonPayload.msg)
# INV-3: 로그 "limitup-sync failed" 0건
# INV-4: 대상 날짜 6표 count == GCS export/<D>/manifest.json 의 files[<tbl>.ndjson.gz].rows
#        (인박스 「확인 방법」 — limitup_member_alloc 은 D 가 KST 오늘 − 30일 안일 때만 · 다른 5표는 − 90일 안)
# INV-5: Scheduler gh-radar-limitup-sync-nightly ENABLED + cron '20 21 * * 1-5' + timeZone Asia/Seoul
# INV-6: Storage limitup-grid 의 grid/<D>/ 객체 수 == manifest 의 grid/ 파일 수
# INV-7: 버킷 IAM — relay SA roles/storage.objectUser · 워커 SA roles/storage.objectViewer
# ═══════════════════════════════════════════════════════════════

REGION=asia-northeast3
JOB=gh-radar-limitup-sync
SCHED=gh-radar-limitup-sync-nightly
SCHED_CRON='20 21 * * 1-5'
SCHED_TZ='Asia/Seoul'
BUCKET_URL=gs://gh-radar-limitup-export
EXPORT_URL="${BUCKET_URL}/export"
GRID_BUCKET=limitup-grid
TABLES=(entries locks jumps member_alloc facts touches)
KEEP_DAYS=90
ALLOC_KEEP_DAYS=30

PASS=0
FAIL=0
declare -a FAILED_INVS
DETAIL=""

# check <name> <fn/cmd...> — 함수는 같은 셸에서 돈다(DETAIL · 전역 변수 공유). stdout/stderr 는 숨기고 DETAIL 만 보인다.
check() {
  local name="$1"; shift
  DETAIL=""
  echo -n "  $name ... "
  if "$@" >/dev/null 2>&1; then
    echo "PASS${DETAIL:+ ($DETAIL)}"
    PASS=$((PASS + 1))
  else
    echo "FAIL${DETAIL:+ ($DETAIL)}"
    FAIL=$((FAIL + 1))
    FAILED_INVS+=("$name")
  fi
}

summary_and_exit() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "PASS: $PASS  FAIL: $FAIL"
  if [[ $FAIL -gt 0 ]]; then
    echo "Failed: ${FAILED_INVS[*]}"
    exit 1
  fi
  echo "✅ All smoke invariants passed"
  exit 0
}

# ─── 인자 ───
MODE=full
TARGET_DATE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-scheduler) MODE=scheduler; shift ;;
    --date)
      TARGET_DATE="${2:-}"
      [[ "$TARGET_DATE" =~ ^[0-9]{8}$ ]] || { echo "ERROR: --date 는 YYYYMMDD" >&2; exit 2; }
      shift 2 ;;
    *) echo "ERROR: unknown arg '$1' (--date YYYYMMDD | --check-scheduler)" >&2; exit 2 ;;
  esac
done

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"
WORKER_SA_EMAIL="gh-radar-limitup-sync-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
RELAY_SA_EMAIL="gh-radar-relay-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# ─── INV 함수 ───

inv5_scheduler() {
  local state schedule tz
  state=$(gcloud scheduler jobs describe "$SCHED" --location="$REGION" --format='value(state)' 2>/dev/null)
  schedule=$(gcloud scheduler jobs describe "$SCHED" --location="$REGION" --format='value(schedule)' 2>/dev/null)
  tz=$(gcloud scheduler jobs describe "$SCHED" --location="$REGION" --format='value(timeZone)' 2>/dev/null)
  DETAIL="state=$state schedule='$schedule' tz=$tz"
  [ "$state" = ENABLED ] && [ "$schedule" = "$SCHED_CRON" ] && [ "$tz" = "$SCHED_TZ" ]
}

if [[ "$MODE" = scheduler ]]; then
  echo "Smoke testing limitup-sync — INV-5 only"
  check "INV-5 $SCHED ENABLED + cron '$SCHED_CRON' $SCHED_TZ" inv5_scheduler
  summary_and_exit
fi

: "${SUPABASE_URL:?SUPABASE_URL must be set}"

# service_role 키 — env 우선, 없으면 Secret Manager 에서 변수로만 (출력 금지)
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SUPABASE_SERVICE_ROLE_KEY=$(gcloud secrets versions access latest --secret=gh-radar-supabase-service-role 2>/dev/null) || SUPABASE_SERVICE_ROLE_KEY=""
fi
if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY 없음 (env 또는 Secret gh-radar-supabase-service-role)" >&2
  exit 1
fi
# 키를 argv(ps 노출)에 싣지 않도록 curl 헤더 파일(600)로 넘긴다
HDR_FILE=$(mktemp)
chmod 600 "$HDR_FILE"
trap 'rm -f "$HDR_FILE"' EXIT
printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" > "$HDR_FILE"
unset SUPABASE_SERVICE_ROLE_KEY

# KST 오늘 기준 N일 전 YYYYMMDD (워커 kstYmdDaysAgo 와 같은 정의)
kst_days_ago() {
  node -e 'const n=Number(process.argv[1]);const t=new Date(Date.now()+9*3600e3);t.setUTCDate(t.getUTCDate()-n);process.stdout.write(t.toISOString().slice(0,10).replace(/-/g,""))' "$1"
}

EXEC_NAME=""
inv1_execute() {
  EXEC_NAME=$(gcloud run jobs execute "$JOB" --region="$REGION" --wait --format='value(metadata.name)' 2>/dev/null)
  local rc=$?
  DETAIL="execution=${EXEC_NAME:-?}"
  [ $rc -eq 0 ]
}

# 방금 실행만 보도록 execution_name 라벨로 좁힌다(없으면 최근 40분 — task-timeout 1800s + 여유).
log_filter() {
  local msg="$1"
  local f="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND jsonPayload.msg=\"$msg\""
  if [[ -n "$EXEC_NAME" ]]; then
    f="$f AND labels.\"run.googleapis.com/execution_name\"=\"$EXEC_NAME\""
  fi
  printf '%s' "$f"
}

inv2_complete_log() {
  local n
  n=$(gcloud logging read "$(log_filter 'limitup-sync complete')" --freshness=40m --limit=5 --format='value(timestamp)' 2>/dev/null | grep -c .)
  DETAIL="complete=$n"
  [ "$n" -ge 1 ]
}

inv3_no_failed_log() {
  local n
  n=$(gcloud logging read "$(log_filter 'limitup-sync failed')" --freshness=40m --limit=5 --format='value(timestamp)' 2>/dev/null | grep -c .)
  DETAIL="failed=$n"
  [ "$n" -eq 0 ]
}

# 대상 날짜: --date 또는 GCS 의 manifest 있는 최신 날짜
resolve_target_date() {
  if [[ -z "$TARGET_DATE" ]]; then
    TARGET_DATE=$(gcloud storage ls "${EXPORT_URL}/*/manifest.json" 2>/dev/null \
      | sed -nE 's#.*/export/([0-9]{8})/manifest\.json$#\1#p' | sort | tail -1)
  fi
  [[ -n "$TARGET_DATE" ]]
}

MANIFEST_JSON=""
load_manifest() {
  MANIFEST_JSON=$(gcloud storage cat "${EXPORT_URL}/${TARGET_DATE}/manifest.json" 2>/dev/null) || return 1
  [[ -n "$MANIFEST_JSON" ]]
}

# manifest 의 files[name=<name>].rows (없으면 빈 문자열)
manifest_rows() {
  printf '%s' "$MANIFEST_JSON" | jq -r --arg n "$1" '.files[] | select(.name == $n) | .rows' | head -1
}

manifest_grid_count() {
  printf '%s' "$MANIFEST_JSON" | jq -r '[.files[] | select(.name | startswith("grid/"))] | length'
}

# limitup_<tbl> 의 date=eq.<D> 행 수 (PostgREST count=exact · Range 0-0)
db_count() {
  local tbl="$1" range
  range=$(curl -fsS -I -H @"$HDR_FILE" -H "Prefer: count=exact" -H "Range: 0-0" \
    "${SUPABASE_URL}/rest/v1/limitup_${tbl}?select=date&date=eq.${TARGET_DATE}" 2>/dev/null \
    | tr -d '\r' | grep -i '^content-range:')
  printf '%s' "$range" | grep -oE '[0-9]+$'
}

inv4_rows_match_manifest() {
  local tbl="$1" expect got
  expect=$(manifest_rows "${tbl}.ndjson.gz")
  got=$(db_count "$tbl")
  DETAIL="${TARGET_DATE} limitup_${tbl} db=${got:-?} manifest=${expect:-?}"
  [ -n "$expect" ] && [ -n "$got" ] && [ "$got" -eq "$expect" ]
}

inv6_grid_objects() {
  local expect got
  expect=$(manifest_grid_count)
  got=$(curl -fsS -X POST -H @"$HDR_FILE" -H "Content-Type: application/json" \
    -d "{\"prefix\":\"grid/${TARGET_DATE}\",\"limit\":1000,\"offset\":0}" \
    "${SUPABASE_URL}/storage/v1/object/list/${GRID_BUCKET}" 2>/dev/null \
    | jq -r '[.[] | select(.id != null and (.name | endswith(".json.gz")))] | length')
  DETAIL="${GRID_BUCKET}/grid/${TARGET_DATE}/ objects=${got:-?} manifest=${expect:-?}"
  [ -n "$expect" ] && [ -n "$got" ] && [ "$got" -eq "$expect" ]
}

inv7_bucket_iam() {
  local policy relay worker
  policy=$(gcloud storage buckets get-iam-policy "$BUCKET_URL" --format=json 2>/dev/null) || return 1
  relay=$(printf '%s' "$policy" | jq -r --arg m "serviceAccount:${RELAY_SA_EMAIL}" \
    '[.bindings[] | select(.role == "roles/storage.objectUser") | .members[] | select(. == $m)] | length')
  worker=$(printf '%s' "$policy" | jq -r --arg m "serviceAccount:${WORKER_SA_EMAIL}" \
    '[.bindings[] | select(.role == "roles/storage.objectViewer") | .members[] | select(. == $m)] | length')
  DETAIL="relay objectUser=$relay worker objectViewer=$worker"
  [ "$relay" -ge 1 ] && [ "$worker" -ge 1 ]
}

# ─── 실행 ───
echo "Smoke testing limitup-sync — INV-1~7"
echo ""

check "INV-1 Job execute --wait exit 0" inv1_execute
check "INV-2 logs: limitup-sync complete" inv2_complete_log
check "INV-3 logs: no limitup-sync failed" inv3_no_failed_log

if resolve_target_date && load_manifest; then
  echo "  (대상 날짜 ${TARGET_DATE} · ${EXPORT_URL}/${TARGET_DATE}/manifest.json)"
  CUTOFF=$(kst_days_ago "$KEEP_DAYS")
  ALLOC_CUTOFF=$(kst_days_ago "$ALLOC_KEEP_DAYS")
  for tbl in "${TABLES[@]}"; do
    if [[ "$tbl" = member_alloc ]] && [[ "$TARGET_DATE" < "$ALLOC_CUTOFF" ]]; then
      echo "  INV-4 limitup_member_alloc ... SKIP (${TARGET_DATE} < ${ALLOC_CUTOFF} — 30일 보존 밖)"
      continue
    fi
    if [[ "$TARGET_DATE" < "$CUTOFF" ]]; then
      echo "  INV-4 limitup_${tbl} ... SKIP (${TARGET_DATE} < ${CUTOFF} — 90일 보존 밖)"
      continue
    fi
    check "INV-4 limitup_${tbl} rows == manifest" inv4_rows_match_manifest "$tbl"
  done
  check "INV-6 Storage ${GRID_BUCKET}/grid/${TARGET_DATE}/ == manifest grid" inv6_grid_objects
else
  echo "  INV-4 ... FAIL (manifest 없음 — ${EXPORT_URL}/${TARGET_DATE:-<최신>}/manifest.json)"
  echo "  INV-6 ... FAIL (manifest 없음)"
  FAIL=$((FAIL + 2))
  FAILED_INVS+=("INV-4 manifest" "INV-6 manifest")
fi

check "INV-5 $SCHED ENABLED + cron '$SCHED_CRON' $SCHED_TZ" inv5_scheduler
check "INV-7 bucket IAM (relay objectUser · worker objectViewer)" inv7_bucket_iam

summary_and_exit
