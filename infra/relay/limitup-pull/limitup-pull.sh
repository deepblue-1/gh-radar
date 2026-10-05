#!/usr/bin/env bash
# limitup-pull.sh — 119 상한가 밤 export 를 radar-gw 미러로 받아 GCS 버킷에 올린다
#                   (Phase 28 D-13 · 정본 문서: docs/relay-operations.md 「radar-gw 호스트 공유」)
#
# 흐름: 119 rrsync 읽기 전용 키(루트 ~/ticks/export = 원격 `/`) → `rsync -az --delete --exclude='*.tmp'` 로 로컬 미러
#       → `gcloud storage rsync` 2단 업로드 ① manifest.json 을 뺀 데이터 ② manifest 까지 한 번 더.
#       워커(Cloud Run Job limitup-sync)가 「새 manifest + 옛 데이터」 를 보는 창을 줄인다 — 최종 방어는 워커의 sha256 대조.
# 운반만 한다 — 판단·적재·알림은 Cloud Run 워커 몫이다. radar-gw 에 Node 런타임·Supabase 키를 두지 않는다.
# 객체를 지우는 명령을 부르지 않는다 — GCS 사본 보존(D-16). 로컬 미러만 --delete 로 119 를 따라간다.
# 상태 파일이 없다 — 미러와 버킷을 매 회차 맞추므로 놓친 회차는 다음 회차가 보충한다.
#
# 대상: radar-gw(Debian 12, bash 5, 시스템 시간대 UTC) — limitup-pull.service 가 limitpull 사용자로 부른다.
#
# 옵션
#   (없음)               본 실행. 평일 06:30~20:30 KST 에는 「장중 — 건너뜀」 한 줄 뒤 종료 0
#   --self-test          순수 함수(date_dirs · dates_summary · daytime_blocked) 단언. 네트워크 없음, BUCKET 불필요
#   --check              원격 루트 목록과 버킷 export/ 목록 조회(둘 다 되면 0, 하나라도 실패하면 1)
#   --dry-run            받을 날짜 목록과 올릴 객체 개수만 출력. 전송 없음, 장중 가드 대상 아님
#   --allow-daytime      장중 가드 해제 — 시험 전용
#
# 종료코드: 0 정상(건너뜀 포함) · 1 rsync·업로드 실패, --check 실패 · 2 사용법·설정 오류
#
# 경로
#   원격: smok95@10.16.207.119:/ (rrsync -ro /home/smok95/ticks/export) — <YYYYMMDD>/manifest.json 이 완료 표시,
#         <YYYYMMDD>.tmp/ 는 119 가 쓰는 중인 날짜라 받지 않는다
#   로컬: $LOCAL_DIR/<YYYYMMDD>/…   잠금: ${LOCAL_DIR}.lock (미러 밖 — --delete 가 지우지 않게)
#   버킷: $BUCKET/export/<YYYYMMDD>/…
#
# 설정(환경변수 — /etc/limitup-pull.env 가 BUCKET · REMOTE 를 준다)
#   BUCKET        필수, gs://…
#   REMOTE        기본 smok95@10.16.207.119
#   SSH_KEY       기본 /var/lib/limitpull/.ssh/id_ed25519 (주석 radar-gw-pull)
#   KNOWN_HOSTS   기본 /var/lib/limitpull/.ssh/known_hosts
#   LOCAL_DIR     기본 /var/lib/limitpull/export
set -euo pipefail

REMOTE=${REMOTE:-smok95@10.16.207.119}
SSH_KEY=${SSH_KEY:-/var/lib/limitpull/.ssh/id_ed25519}
KNOWN_HOSTS=${KNOWN_HOSTS:-/var/lib/limitpull/.ssh/known_hosts}
LOCAL_DIR=${LOCAL_DIR:-/var/lib/limitpull/export}
LOCAL_DIR=${LOCAL_DIR%/}
LOCK_FILE=${LOCAL_DIR}.lock
BUCKET=${BUCKET:-}

# gcloud 동작 고정(유닛 Environment= 와 이중) — 합성 업로드는 임시 객체 삭제와 메모리를 쓴다. radar-gw 는 relay 와 같은 2GB
export CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False
export CLOUDSDK_STORAGE_PROCESS_COUNT=1
export CLOUDSDK_STORAGE_THREAD_COUNT=2
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

RSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o ConnectTimeout=15 -o ServerAliveInterval=30"

# gcloud storage rsync --exclude 는 상대 경로에 대한 정규식이다
EXCLUDE_MANIFEST='(^|.*/)manifest\.json$'

log()  { printf '[limitup-pull] %s\n' "$*"; }
warn() { printf '[limitup-pull] WARN %s\n' "$*" >&2; }
die()  { printf '[limitup-pull] ERROR %s\n' "$1" >&2; exit "${2:-2}"; }

# ---------------------------------------------------------------- 순수 함수 (자가 시험 대상)

# date_dirs DIR — DIR 바로 아래 YYYYMMDD 디렉터리 중 manifest.json 이 있는 것만 한 줄에 하나, 이름순.
#   <D>.tmp(쓰는 중) · manifest 없는 날짜 · 다른 이름은 뺀다. DIR 이 없으면 빈 출력
date_dirs() {
    local dir=${1%/} p d
    [[ -d $dir ]] || return 0
    for p in "$dir"/*/; do
        d=${p%/}
        d=${d##*/}
        if [[ $d =~ ^[0-9]{8}$ && -f $dir/$d/manifest.json ]]; then
            printf '%s\n' "$d"
        fi
    done | LC_ALL=C sort
}

# dates_summary DIR → "dates=<개수> latest=<최신 날짜 또는 ->"
dates_summary() {
    local list n latest
    list=$(date_dirs "$1")
    if [[ -z $list ]]; then
        printf 'dates=0 latest=-\n'
        return 0
    fi
    n=$(printf '%s\n' "$list" | wc -l | tr -d ' ')
    latest=$(printf '%s\n' "$list" | tail -n 1)
    printf 'dates=%s latest=%s\n' "$n" "$latest"
}

# daytime_blocked DOW HHMM — 월~금(1~5) 06:30 ≤ HHMM < 20:30 이면 참(0). 호출자는 TZ=Asia/Seoul 로 값을 구한다
daytime_blocked() {
    local dow=$1 hhmm=$((10#$2))
    (( dow >= 1 && dow <= 5 && hhmm >= 630 && hhmm < 2030 ))
}

# ---------------------------------------------------------------- 자가 시험

self_test() {
    local n=0 got expected tmp
    tmp=$(mktemp -d)
    # 20261002 = manifest 있음(받음) · 20261003.tmp = 쓰는 중(manifest 가 있어도 뺀다) · 20261004 = manifest 없음
    # notes = 날짜 아님 · 2026100 = 7자리 · 20260930 = manifest 있음(이름순 확인용)
    mkdir -p "$tmp/20261002" "$tmp/20261003.tmp" "$tmp/20261004" "$tmp/notes" "$tmp/2026100" "$tmp/20260930"
    : >"$tmp/20261002/manifest.json"
    : >"$tmp/20261003.tmp/manifest.json"
    : >"$tmp/20261004/entries.ndjson.gz"
    : >"$tmp/notes/manifest.json"
    : >"$tmp/2026100/manifest.json"
    : >"$tmp/20260930/manifest.json"
    : >"$tmp/20261005"   # 디렉터리가 아닌 파일

    expected=$(printf '%s\n' 20260930 20261002)
    got=$(date_dirs "$tmp")
    if [[ $got != "$expected" ]]; then
        rm -rf "$tmp"
        printf 'self-test FAIL date_dirs\n--- expected\n%s\n--- got\n%s\n' "$expected" "$got" >&2
        exit 1
    fi
    n=$((n + 1))

    got=$(date_dirs "$tmp/")
    [[ $got == "$expected" ]] || { rm -rf "$tmp"; echo "self-test FAIL date_dirs(끝 슬래시): $got" >&2; exit 1; }
    n=$((n + 1))

    got=$(dates_summary "$tmp")
    [[ $got == 'dates=2 latest=20261002' ]] || { rm -rf "$tmp"; echo "self-test FAIL dates_summary: $got" >&2; exit 1; }
    n=$((n + 1))

    rm -rf "$tmp"

    got=$(date_dirs "$tmp")
    [[ -z $got ]] || { echo "self-test FAIL date_dirs(없는 디렉터리): $got" >&2; exit 1; }
    n=$((n + 1))

    got=$(dates_summary "$tmp")
    [[ $got == 'dates=0 latest=-' ]] || { echo "self-test FAIL dates_summary(빈): $got" >&2; exit 1; }
    n=$((n + 1))

    # DOW HHMM 기대(1=차단, 0=통과)
    local c dow hhmm want rc
    for c in '1 0900 1' '1 2100 0' '6 1200 0' '5 0630 1' '5 2030 0' '1 0629 0' '7 0700 0' '3 2029 1'; do
        read -r dow hhmm want <<<"$c"
        rc=0
        daytime_blocked "$dow" "$hhmm" || rc=1
        if { [[ $want == 1 ]] && (( rc != 0 )); } || { [[ $want == 0 ]] && (( rc == 0 )); }; then
            echo "self-test FAIL daytime_blocked $dow $hhmm (기대 차단=$want)" >&2
            exit 1
        fi
        n=$((n + 1))
    done
    echo "self-test OK $n cases"
}

# ---------------------------------------------------------------- 원격·버킷

# pull_mirror [rsync 추가 인자…] — 119 export 전체를 로컬 미러로(rrsync 가 ~/ticks/export 를 `/` 로 보인다)
pull_mirror() {
    rsync -az --delete --exclude='*.tmp' "$@" -e "$RSH" "$REMOTE:/" "$LOCAL_DIR/" </dev/null
}

# bucket_list — 버킷 export/ 아래 객체 목록. 아직 객체가 없으면 빈 출력(정상)
bucket_list() {
    local out err rc=0
    err=$(mktemp)
    out=$(gcloud storage ls "$BUCKET/export/" 2>"$err" </dev/null) || rc=$?
    if (( rc != 0 )); then
        if grep -q 'matched no objects' "$err"; then
            rm -f "$err"
            return 0
        fi
        cat "$err" >&2
        rm -f "$err"
        return 1
    fi
    rm -f "$err"
    printf '%s' "$out"
}

# ---------------------------------------------------------------- 모드

do_check() {
    local fail=0 root n
    if root=$(rsync --list-only --no-human-readable -e "$RSH" "$REMOTE:/" </dev/null); then
        n=$(printf '%s\n' "$root" | awk '$1 ~ /^d/ && $5 ~ /^[0-9]{8}$/' | wc -l | tr -d ' ')
        log "check remote / OK (날짜 디렉터리 $n 개)"
    else
        warn "check remote / 실패"; fail=1
    fi
    if bucket_list >/dev/null; then
        log "check bucket $BUCKET/export/ OK"
    else
        warn "check bucket $BUCKET/export/ 실패"; fail=1
    fi
    (( fail == 0 )) && log "check OK" || log "check FAIL"
    return "$fail"
}

do_dry_run() {
    local out dates n_up fail=0
    if out=$(pull_mirror -n --out-format='%n'); then
        dates=$(printf '%s\n' "$out" | awk -F/ '$1 ~ /^[0-9]{8}$/ {print $1}' | LC_ALL=C sort -u | tr '\n' ' ')
        log "dry-run rsync 받을 날짜: ${dates:-(없음)}"
    else
        warn "dry-run rsync 실패"; fail=1
    fi
    if [[ -d $LOCAL_DIR ]]; then
        if out=$(gcloud storage rsync "$LOCAL_DIR" "$BUCKET/export" --recursive --checksums-only --dry-run 2>&1 </dev/null); then
            n_up=$(printf '%s\n' "$out" | grep -c 'Would copy' || true)
            log "dry-run upload 현재 미러 기준 올릴 객체 $n_up 개"
        else
            printf '%s\n' "$out" >&2
            warn "dry-run upload 실패"; fail=1
        fi
    else
        log "dry-run upload 미러 없음($LOCAL_DIR) — 첫 회차"
    fi
    log "dry-run $(dates_summary "$LOCAL_DIR")"
    return "$fail"
}

do_pull() {
    local allow_daytime=$1 summary

    mkdir -p "$LOCAL_DIR"
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        log "다른 회차가 실행 중 — 건너뜀"
        exit 0
    fi
    if (( ! allow_daytime )) && daytime_blocked "$(TZ=Asia/Seoul date +%u)" "$(TZ=Asia/Seoul date +%H%M)"; then
        log "장중 — 건너뜀"
        exit 0
    fi

    if ! pull_mirror; then
        warn "rsync 실패 — 업로드하지 않는다"
        log "$(dates_summary "$LOCAL_DIR") rsync=fail upload=skip"
        return 1
    fi
    summary=$(dates_summary "$LOCAL_DIR")

    # ① manifest 를 뺀 데이터 먼저
    if ! gcloud storage rsync "$LOCAL_DIR" "$BUCKET/export" --recursive --checksums-only \
            --exclude="$EXCLUDE_MANIFEST" </dev/null; then
        warn "업로드 1단(데이터) 실패"
        log "$summary rsync=ok upload=fail"
        return 1
    fi
    # ② manifest 까지 — 데이터는 이미 같아 manifest 만 오른다
    if ! gcloud storage rsync "$LOCAL_DIR" "$BUCKET/export" --recursive --checksums-only </dev/null; then
        warn "업로드 2단(manifest) 실패"
        log "$summary rsync=ok upload=fail"
        return 1
    fi
    log "$summary rsync=ok upload=ok"
}

# ---------------------------------------------------------------- 진입

usage() {
    sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

main() {
    local mode=pull allow_daytime=0
    while (( $# )); do
        case $1 in
            --self-test)     mode=self-test ;;
            --check)         mode=check ;;
            --dry-run)       mode=dry-run ;;
            --allow-daytime) allow_daytime=1 ;;
            -h|--help)       usage; exit 0 ;;
            *)               die "알 수 없는 인자: $1 (--help)" ;;
        esac
        shift
    done

    if [[ $mode == self-test ]]; then
        self_test
        exit 0
    fi

    [[ $BUCKET =~ ^gs://[a-z0-9._-]+$ ]] || die "BUCKET 이 비었거나 형식이 틀렸다(gs://이름): '${BUCKET}'"

    case $mode in
        check)   do_check || exit 1 ;;
        dry-run) do_dry_run || exit 1 ;;
        pull)    do_pull "$allow_daytime" || exit 1 ;;
    esac
}

main "$@"
