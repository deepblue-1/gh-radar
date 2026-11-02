#!/usr/bin/env bash
# install.sh — radar-gw 에 tickgw(당일 틱 경로 · Phase 37)의 119 접속 계정 tickpull 을 설치한다
#              (root, 멱등 — 정본 문서: docs/relay-operations.md 「gh-radar 당일 틱 경로 tickgw」)
#
# 사용: sudo bash install.sh --host-fp SHA256:<119 ed25519 호스트키 지문> [--host 10.16.207.119]
#   --host-fp   필수 — 119 호스트키 지문. radar-gw 에서 `sudo ssh-keygen -lf /var/lib/tickarc/.ssh/known_hosts`
#               (gh-trade 가 이미 고정 — 2026-10-05 값 SHA256:7s4iOpsEMcJkjLHD9KpGv7TIDXxJj2ip5Na+hU4aiJY).
#               ssh-keyscan 결과의 지문이 이것과 다르면 아무것도 쓰지 않고 종료코드 2
#   --host      기본 10.16.207.119
#
# 하는 일(순서): ① 호스트키 지문 대조 → ② 시스템 사용자 tickpull(/var/lib/tickpull, nologin) · 홈 0750 · .ssh 0700
#   → ③ ed25519 키(없을 때만, 주석 radar-gw-tickpull — 119 등록 줄 · gh-trade 확인과 같은 문자열)
#   → ④ known_hosts 고정(0644 · tickgw 가 StrictHostKeyChecking=yes 로 쓴다)
#   → ⑤ 키 지문(본문 아님) · `id -u/-g tickpull` 출력 — deploy-tickgw.sh 가 같은 값을 읽어 이미지 빌드 인자로 넘긴다.
#
# tickgw 컨테이너는 `--user <tickpull uid>:<gid> -v /var/lib/tickpull/.ssh:/ssh:ro` 로 이 키 · known_hosts 를 읽는다.
# 패키지를 설치하지 않는다(ssh-keygen · ssh-keyscan 은 Debian 기본 openssh-client).
# gh-trade 소유물(tickarc 사용자 · tick-archive.* 유닛) · gh-radar relay · limitpull(limitup-pull.*) 은 건드리지 않는다.
# 장중(평일 08:00~20:00 KST)에는 돌리지 않는다 — 설치 · 배포는 20:00 이후 메인 세션(37-17).
set -euo pipefail

HOST_FP=''
HOST=10.16.207.119

USER_NAME=tickpull
HOME_DIR=/var/lib/tickpull
KEY_COMMENT=radar-gw-tickpull

die() { echo "[tickpull-install] ERROR $1" >&2; exit "${2:-1}"; }
log() { echo "[tickpull-install] $*"; }

while (( $# )); do
    case $1 in
        --host-fp) shift; HOST_FP=${1:-} ;;
        --host)    shift; HOST=${1:-} ;;
        -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)         die "알 수 없는 인자: $1" 2 ;;
    esac
    shift
done

(( EUID == 0 )) || die "root 로 실행한다 (sudo bash $0 …)" 2
[[ $HOST_FP == SHA256:* ]] || die "--host-fp SHA256:… 이 필요하다: '$HOST_FP'" 2
[[ -n $HOST ]] || die "--host 가 비었다" 2
for c in ssh-keyscan ssh-keygen useradd runuser install; do
    command -v "$c" >/dev/null 2>&1 || die "$c 가 없다" 2
done

# ① 호스트키 지문 대조 — 다르면 아무것도 쓰지 않는다
scan=$(ssh-keyscan -T 10 -t ed25519 "$HOST" 2>/dev/null | grep -v '^#' || true)
[[ -n $scan ]] || die "ssh-keyscan $HOST 응답 없음 (아무것도 쓰지 않았다)" 2
scan_fp=$(printf '%s\n' "$scan" | ssh-keygen -lf - | awk '{print $2}')
if [[ $scan_fp != "$HOST_FP" ]]; then
    die "호스트키 지문 불일치 — 기대 $HOST_FP · 실제 $scan_fp (아무것도 쓰지 않았다)" 2
fi
log "호스트키 지문 일치 $HOST $scan_fp"

# ② 시스템 사용자 tickpull
if ! id "$USER_NAME" >/dev/null 2>&1; then
    log "사용자 $USER_NAME 생성"
    useradd --system --user-group --home-dir "$HOME_DIR" --create-home --shell /usr/sbin/nologin "$USER_NAME"
fi
install -d -m 0750 -o "$USER_NAME" -g "$USER_NAME" "$HOME_DIR"
install -d -m 0700 -o "$USER_NAME" -g "$USER_NAME" "$HOME_DIR/.ssh"

# ③ 키 — 없을 때만 만든다(재설치가 키를 바꾸면 119 등록 줄이 무효가 된다)
if [[ ! -f $HOME_DIR/.ssh/id_ed25519 ]]; then
    log "ed25519 키 생성 (주석 $KEY_COMMENT)"
    runuser -u "$USER_NAME" -- ssh-keygen -q -t ed25519 -N '' -C "$KEY_COMMENT" -f "$HOME_DIR/.ssh/id_ed25519"
else
    log "ed25519 키 있음 — 그대로 둔다"
fi
chmod 0600 "$HOME_DIR/.ssh/id_ed25519"

# ④ known_hosts 고정 (tickgw 가 StrictHostKeyChecking=yes · UserKnownHostsFile=/ssh/known_hosts 로 쓴다)
printf '%s\n' "$scan" >"$HOME_DIR/.ssh/known_hosts"
chown "$USER_NAME:$USER_NAME" "$HOME_DIR/.ssh/known_hosts"
chmod 0644 "$HOME_DIR/.ssh/known_hosts"

# ⑤ 지문 · uid/gid 만 — 공개키 본문은 로그 · 커밋에 남기지 않는다(인박스 노트 추기로 1회 전달)
log "키 지문: $(ssh-keygen -lf "$HOME_DIR/.ssh/id_ed25519.pub")"
log "TICKPULL_UID=$(id -u "$USER_NAME") TICKPULL_GID=$(id -g "$USER_NAME")  (deploy-tickgw.sh 가 같은 값을 읽는다)"
log "공개키 본문 = radar-gw 의 $HOME_DIR/.ssh/id_ed25519.pub 파일 — gh-trade 인박스 노트 추기용(119 등록은 gh-trade 사용자)"
log "119 등록 줄 꼴: restrict,command=\"/usr/bin/taskset -c 0 /usr/bin/nice -n 19 /usr/bin/ionice -c 3 <질의 명령>\" ssh-ed25519 AAAA… $KEY_COMMENT"
log "완료"
