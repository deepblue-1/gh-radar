#!/usr/bin/env bash
# install.sh — radar-gw 에 119 상한가 export 운반기(limitup-pull)를 설치한다 (root, 멱등 — docs/relay-operations.md)
#
# 사용: sudo bash install.sh --bucket gs://gh-radar-limitup-export --host-fp SHA256:<119 ed25519 호스트키 지문> [--host 10.16.207.119] [--enable-timer]
#   --bucket        필수 — /etc/limitup-pull.env 의 BUCKET (스크립트가 그 아래 export/ 에 올린다)
#   --host-fp       필수 — 119 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 의 두 번째 칸
#                   (radar-gw 에서는 `sudo ssh-keygen -lf /var/lib/tickarc/.ssh/known_hosts` 로도 얻는다).
#                   ssh-keyscan 결과의 지문이 이것과 다르면 아무것도 쓰지 않고 종료코드 2
#   --host          기본 10.16.207.119
#   --enable-timer  limitup-pull.timer 를 enable --now 한다. 없으면 타이머 상태를 바꾸지 않는다
#                   — 119 에 키(radar-gw-pull)가 등록되기 전에는 주지 않는다(D-13)
#
# 하는 일(순서): ① 호스트키 지문 대조 → ② rsync 패키지(없을 때만, 이 하나만) · rsync flock gcloud 확인
#   → ③ 시스템 사용자 limitpull(/var/lib/limitpull, nologin) · 홈 750 · .ssh 700 · export 750
#   → ④ ed25519 키(없을 때만, 주석 radar-gw-pull — gh-trade 등록 줄 · grep 확인과 같은 문자열, D-21)
#   → ⑤ limitpull known_hosts 고정 → ⑥ /etc/limitup-pull.env(BUCKET · REMOTE)
#   → ⑦ /usr/local/lib/limitup-pull/limitup-pull.sh · /etc/systemd/system/limitup-pull.{service,timer} · daemon-reload
#   → ⑧ (--enable-timer) enable --now → ⑨ 키 지문(본문 아님)·타이머 상태 출력.
# gh-radar relay 의 유닛·파일과 gh-trade 소유물(tickarc 사용자 · tick-archive.* 유닛)은 건드리지 않는다.
# SA JSON 키를 만들지 않는다(VM 메타데이터 자격 — relay SA 만 쓴다).
set -euo pipefail

SRC=$(cd "$(dirname "$0")" && pwd)
BUCKET=''
HOST_FP=''
HOST=10.16.207.119
ENABLE_TIMER=0

USER_NAME=limitpull
HOME_DIR=/var/lib/limitpull
LIB_DIR=/usr/local/lib/limitup-pull
ENV_FILE=/etc/limitup-pull.env
UNIT_DIR=/etc/systemd/system
KEY_COMMENT=radar-gw-pull

die() { echo "[install] ERROR $1" >&2; exit "${2:-1}"; }
log() { echo "[install] $*"; }

while (( $# )); do
    case $1 in
        --bucket)       shift; BUCKET=${1:-} ;;
        --host-fp)      shift; HOST_FP=${1:-} ;;
        --host)         shift; HOST=${1:-} ;;
        --enable-timer) ENABLE_TIMER=1 ;;
        -h|--help)      sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)              die "알 수 없는 인자: $1" 2 ;;
    esac
    shift
done

(( EUID == 0 )) || die "root 로 실행한다 (sudo bash $0 …)" 2
[[ $BUCKET =~ ^gs://[a-z0-9._-]+$ ]] || die "--bucket gs://이름 이 필요하다: '$BUCKET'" 2
[[ $HOST_FP == SHA256:* ]] || die "--host-fp SHA256:… 이 필요하다: '$HOST_FP'" 2
[[ -n $HOST ]] || die "--host 가 비었다" 2
for f in limitup-pull.sh limitup-pull.service limitup-pull.timer; do
    [[ -f $SRC/$f ]] || die "같은 디렉터리에 $f 가 없다 ($SRC)" 2
done

# ① 호스트키 지문 대조 — 다르면 아무것도 쓰지 않는다
scan=$(ssh-keyscan -T 10 -t ed25519 "$HOST" 2>/dev/null | grep -v '^#' || true)
[[ -n $scan ]] || die "ssh-keyscan $HOST 응답 없음 (아무것도 쓰지 않았다)" 2
scan_fp=$(printf '%s\n' "$scan" | ssh-keygen -lf - | awk '{print $2}')
if [[ $scan_fp != "$HOST_FP" ]]; then
    die "호스트키 지문 불일치 — 기대 $HOST_FP · 실제 $scan_fp (아무것도 쓰지 않았다)" 2
fi
log "호스트키 지문 일치 $HOST $scan_fp"

# ② rsync 패키지 — 이 하나만(gh-trade 운반기가 이미 설치했으면 건너뛴다)
if ! command -v rsync >/dev/null 2>&1; then
    log "rsync 설치"
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends rsync \
        || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends rsync; }
fi
for c in rsync flock gcloud; do
    command -v "$c" >/dev/null 2>&1 || die "$c 가 없다"
done

# ③ 시스템 사용자 limitpull
if ! id "$USER_NAME" >/dev/null 2>&1; then
    log "사용자 $USER_NAME 생성"
    useradd --system --user-group --home-dir "$HOME_DIR" --create-home --shell /usr/sbin/nologin "$USER_NAME"
fi
install -d -m 0750 -o "$USER_NAME" -g "$USER_NAME" "$HOME_DIR"
install -d -m 0700 -o "$USER_NAME" -g "$USER_NAME" "$HOME_DIR/.ssh"
install -d -m 0750 -o "$USER_NAME" -g "$USER_NAME" "$HOME_DIR/export"

# ④ 키 — 없을 때만 만든다(재설치가 키를 바꾸면 119 등록 줄이 무효가 된다)
if [[ ! -f $HOME_DIR/.ssh/id_ed25519 ]]; then
    log "ed25519 키 생성 (주석 $KEY_COMMENT)"
    runuser -u "$USER_NAME" -- ssh-keygen -q -t ed25519 -N '' -C radar-gw-pull -f "$HOME_DIR/.ssh/id_ed25519"
else
    log "ed25519 키 있음 — 그대로 둔다"
fi

# ⑤ known_hosts 고정 (스크립트가 StrictHostKeyChecking=yes 로 쓴다)
printf '%s\n' "$scan" >"$HOME_DIR/.ssh/known_hosts"
chown "$USER_NAME:$USER_NAME" "$HOME_DIR/.ssh/known_hosts"
chmod 0644 "$HOME_DIR/.ssh/known_hosts"

# ⑥ 설정
printf 'BUCKET=%s\nREMOTE=smok95@%s\n' "$BUCKET" "$HOST" >"$ENV_FILE"
chmod 0644 "$ENV_FILE"

# ⑦ 스크립트·유닛
install -D -m 0755 "$SRC/limitup-pull.sh" "$LIB_DIR/limitup-pull.sh"
install -m 0644 "$SRC/limitup-pull.service" "$UNIT_DIR/limitup-pull.service"
install -m 0644 "$SRC/limitup-pull.timer" "$UNIT_DIR/limitup-pull.timer"
systemctl daemon-reload

# ⑧ 타이머 — 119 등록 뒤에만
if (( ENABLE_TIMER )); then
    log "타이머 enable --now"
    systemctl enable --now limitup-pull.timer
fi

# ⑨ 키 지문만 — 공개키 본문은 로그·커밋에 남기지 않는다
log "키 지문: $(ssh-keygen -lf "$HOME_DIR/.ssh/id_ed25519.pub")"
log "공개키 본문은 \`sudo cat $HOME_DIR/.ssh/id_ed25519.pub\` — gh-trade 인박스 노트 추기용(119 등록은 gh-trade 사용자)"
log "타이머 enabled=$(systemctl is-enabled limitup-pull.timer 2>/dev/null || true) active=$(systemctl is-active limitup-pull.timer 2>/dev/null || true)"
systemctl list-timers limitup-pull.timer --all --no-pager || true
log "완료"
