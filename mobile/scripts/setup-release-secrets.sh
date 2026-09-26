#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# setup-release-secrets.sh — GH Trade 릴리스 비밀 주입 (Phase 22 · D-06 · RESEARCH Pattern 5)
#
# 이 스크립트는 사용자가 직접 실행한다:
#   ! bash mobile/scripts/setup-release-secrets.sh <stage>...
#   예) ! bash mobile/scripts/setup-release-secrets.sh dir asc
#
# 규약
#   - 대화형 입력 없음(`!` 셸에 TTY 가 없을 수 있다 — read 프롬프트 · keytool 대화형 금지).
#   - 값은 어떤 경로로도 출력하지 않는다. 출력은 「OK <stage>」 / 「SKIP <stage> — 이미 있음」 /
#     「ERROR <stage> — …(경로만)」 뿐이다. 셸 추적 모드를 켜지 않는다.
#   - 이미 있는 파일은 덮어쓰지 않고 SKIP 한다(재실행 안전 · 엣지 FA-4).
#   - 비밀은 저장소 밖 ${GHTRADE_RELEASE_DIR:-~/.config/gh-trade/release}(700) 아래 600 파일로만 둔다.
#
# stages
#   dir       비밀 디렉터리 생성 · 700
#   asc       weekly-wine 의 App Store Connect API 키(.p8)와 키 ID · 발급자 ID 줄만 옮겨 ios.env 를 만든다
#   keystore  Android 업로드 키스토어(PKCS12 · RSA 4096 · alias ghtrade-upload)를 만들고 android.env 를 쓴다
#             (D-08). 비밀번호는 openssl rand 로 이 스크립트 안에서만 생성하고, keytool 에는 `:env` 형식으로
#             넘겨 명령줄에도 남지 않는다. 화면에는 업로드 인증서 SHA-1(공개 지문)만 나온다.
#             **이미 키스토어가 있으면 SKIP** — 업로드 키가 바뀌면 Play 가 업로드를 거부하고 Google 에
#             업로드 키 재설정을 요청해야 한다(T-22-11).
#   backup    업로드 키스토어 · 그 비밀번호 · (있으면) ASC API 키(.p8 은 재다운로드 불가)를 GCP Secret Manager 에
#             1본 백업한다(D-08). 이미 있는 비밀은 SKIP.
#   play-sa   androidpublisher API 사용 설정 → Play 게시용 SA gh-radar-play-publisher → 키 JSON(600).
#             GCP 프로젝트 IAM 역할은 주지 않는다 — Play 권한은 Play Console 에서 앱 단위로 준다(최소 권한 · T-22-10).
#
# 선택 env
#   GHTRADE_RELEASE_DIR        비밀 디렉터리. 기본 ~/.config/gh-trade/release
#   WEEKLY_WINE_FASTLANE_DIR   ASC 키 원본 위치. 기본 ~/repos/weekly-wine-app/ios/App/fastlane
#   CLOUDSDK_CORE_PROJECT      backup · play-sa 의 GCP 프로젝트. 기본 gh-radar
#   CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE  비어 있고 ~/.config/gcloud/gh-radar-deployer.json 이 있으면 그 키를 쓴다
# ═══════════════════════════════════════════════════════════════

REL="${GHTRADE_RELEASE_DIR:-$HOME/.config/gh-trade/release}"

usage() {
  echo "사용: bash mobile/scripts/setup-release-secrets.sh <stage>..." >&2
  echo "  stages: dir · asc · keystore · backup · play-sa" >&2
}

# JDK 도구 위치 — `!` 셸의 PATH 에는 macOS 스텁(/usr/bin/keytool)만 있을 수 있다.
jdk_tool() {
  local name="$1" c
  for c in "${JAVA_HOME:-}/bin/$name" "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/$name"; do
    if [[ -x "$c" ]]; then echo "$c"; return 0; fi
  done
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  return 1
}

# gcloud 준비 — scripts/dma-credentials.sh 관례(프로젝트 기본값 · deployer 키 자동 지정).
# CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE 가 **설정돼 있지 않으면** deployer SA 키를 쓰고,
# 빈 값으로 **명시**하면(`CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE= bash …`) gcloud 사용자 계정을 쓴다.
gcloud_prep() {
  export CLOUDSDK_CORE_PROJECT="${CLOUDSDK_CORE_PROJECT:-gh-radar}"
  local deployer="$HOME/.config/gcloud/gh-radar-deployer.json"
  if [[ -z "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE+x}" && -f "$deployer" ]]; then
    export CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE="$deployer"
  elif [[ -z "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}" ]]; then
    unset CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE
  fi
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "ERROR gcloud — gcloud CLI 가 없다" >&2
    return 1
  fi
  if [[ -n "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}" ]]; then
    echo "OK gcloud — 인증: SA 키 파일 ${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE} · 프로젝트 ${CLOUDSDK_CORE_PROJECT}"
  else
    echo "OK gcloud — 인증: gcloud 사용자 계정 · 프로젝트 ${CLOUDSDK_CORE_PROJECT}"
  fi
}

gcloud_hint() {
  echo "  권한이 없으면 \`gcloud auth login\` 으로 사용자 계정에 로그인한 뒤 다시 실행:" >&2
  echo "  ! CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE= bash mobile/scripts/setup-release-secrets.sh $1" >&2
}

stage_dir() {
  mkdir -p "$REL"
  chmod 700 "$REL"
  echo "OK dir"
}

stage_asc() {
  local ww src_env key_src tmp
  ww="${WEEKLY_WINE_FASTLANE_DIR:-$HOME/repos/weekly-wine-app/ios/App/fastlane}"
  src_env="$ww/.env.default"

  if [[ ! -d "$REL" ]]; then
    echo "ERROR asc — 비밀 디렉터리가 없다: $REL (먼저 dir 단계를 실행)" >&2
    return 1
  fi
  if [[ -f "$REL/ios.env" ]]; then
    echo "SKIP asc — 이미 있음"
    return 0
  fi
  if [[ ! -f "$src_env" ]]; then
    echo "ERROR asc — weekly-wine ASC 키 파일 없음: $src_env" >&2
    return 1
  fi

  # 파일 전체를 옮기지 않는다 — 두 키 줄만 추린다(값은 화면에 나오지 않는다).
  tmp="$(mktemp "$REL/.asc.XXXXXX")"
  grep -E '^(export[[:space:]]+)?ASC_(KEY_ID|ISSUER_ID)=' "$src_env" \
    | sed -E 's/^export[[:space:]]+//' | tr -d '\r' > "$tmp" || true

  local ASC_KEY_ID="" ASC_ISSUER_ID=""
  # shellcheck disable=SC1090
  source "$tmp"
  if [[ -z "$ASC_KEY_ID" || -z "$ASC_ISSUER_ID" ]]; then
    rm -f "$tmp"
    echo "ERROR asc — $src_env 에 ASC_KEY_ID · ASC_ISSUER_ID 줄이 없다" >&2
    return 1
  fi
  if [[ ! "$ASC_KEY_ID" =~ ^[A-Za-z0-9]+$ ]]; then
    rm -f "$tmp"
    echo "ERROR asc — ASC_KEY_ID 형식이 예상과 다르다(영숫자만 허용)" >&2
    return 1
  fi

  key_src="$ww/AuthKey.p8"
  if [[ ! -f "$key_src" ]]; then key_src="$ww/AuthKey_${ASC_KEY_ID}.p8"; fi
  if [[ ! -f "$key_src" ]]; then
    rm -f "$tmp"
    echo "ERROR asc — weekly-wine ASC 키 파일 없음: $ww/AuthKey.p8" >&2
    return 1
  fi

  local key_dst="$REL/AuthKey_${ASC_KEY_ID}.p8"
  if [[ ! -f "$key_dst" ]]; then
    install -m 600 "$key_src" "$key_dst"
  fi

  {
    cat "$tmp"
    echo "ASC_KEY_PATH=$key_dst"
    echo "GHTRADE_RELEASE_OUT=$HOME/Library/Developer/gh-trade-release/ios"
  } > "$REL/.ios.env.new"
  rm -f "$tmp"
  chmod 600 "$REL/.ios.env.new"
  mv "$REL/.ios.env.new" "$REL/ios.env"
  echo "OK asc"
}

stage_keystore() {
  local jks="$REL/ghtrade-upload.jks" envf="$REL/android.env"
  local tmp_jks="$REL/.ghtrade-upload.jks.new" tmp_env="$REL/.android.env.new"
  local keytool err sha1

  if [[ ! -d "$REL" ]]; then
    echo "ERROR keystore — 비밀 디렉터리가 없다: $REL (먼저 dir 단계를 실행)" >&2
    return 1
  fi
  # 업로드 키는 절대 재생성하지 않는다 — 바뀌면 Play 가 업로드를 거부한다(T-22-11).
  if [[ -f "$jks" ]]; then
    echo "SKIP keystore — 이미 있음(업로드 키는 재생성하지 않는다)"
    return 0
  fi
  if [[ -f "$envf" ]]; then
    echo "ERROR keystore — android.env 만 있고 키스토어가 없다 — 수동 확인: $envf" >&2
    return 1
  fi
  if ! keytool="$(jdk_tool keytool)"; then
    echo "ERROR keystore — keytool 을 찾지 못했다(JAVA_HOME 또는 Android Studio JBR)" >&2
    return 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR keystore — openssl 이 없다" >&2
    return 1
  fi

  rm -f "$tmp_jks" "$tmp_env"
  # PKCS12 는 스토어·키 비밀번호가 같아야 한다 — 같은 값을 두 변수에 둔다. 값은 출력하지 않는다.
  GHTRADE_UPLOAD_STORE_PASSWORD="$(openssl rand -base64 32)"
  GHTRADE_UPLOAD_KEY_PASSWORD="$GHTRADE_UPLOAD_STORE_PASSWORD"
  export GHTRADE_UPLOAD_STORE_PASSWORD GHTRADE_UPLOAD_KEY_PASSWORD

  # `-storepass:env` · `-keypass:env` — 비밀번호가 명령줄(ps · 셸 히스토리)에 나타나지 않는다.
  if ! err="$("$keytool" -genkeypair -keystore "$tmp_jks" -storetype PKCS12 -alias ghtrade-upload \
      -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=GH Trade, C=KR" \
      -storepass:env GHTRADE_UPLOAD_STORE_PASSWORD -keypass:env GHTRADE_UPLOAD_KEY_PASSWORD \
      -noprompt 2>&1 >/dev/null)"; then
    rm -f "$tmp_jks"
    echo "ERROR keystore — keytool 키 생성 실패: $err" >&2
    return 1
  fi
  chmod 600 "$tmp_jks"

  sha1="$("$keytool" -list -v -keystore "$tmp_jks" -storetype PKCS12 -alias ghtrade-upload \
      -storepass:env GHTRADE_UPLOAD_STORE_PASSWORD 2>/dev/null | awk '/SHA1:/{print $2; exit}')"
  if [[ ! "$sha1" =~ ^([0-9A-F]{2}:){19}[0-9A-F]{2}$ ]]; then
    rm -f "$tmp_jks"
    echo "ERROR keystore — 업로드 인증서 SHA-1 을 읽지 못했다" >&2
    return 1
  fi

  {
    printf '%s=%s\n' GHTRADE_UPLOAD_STORE_FILE "$jks"
    printf '%s=%s\n' GHTRADE_UPLOAD_STORE_PASSWORD "$GHTRADE_UPLOAD_STORE_PASSWORD"
    printf '%s=%s\n' GHTRADE_UPLOAD_KEY_ALIAS ghtrade-upload
    printf '%s=%s\n' GHTRADE_UPLOAD_KEY_PASSWORD "$GHTRADE_UPLOAD_KEY_PASSWORD"
    printf '%s=%s\n' GHTRADE_UPLOAD_SHA1 "$sha1"
    printf '%s=%s\n' GOOGLE_PLAY_JSON_KEY "$REL/play-service-account.json"
  } > "$tmp_env"
  chmod 600 "$tmp_env"
  unset GHTRADE_UPLOAD_STORE_PASSWORD GHTRADE_UPLOAD_KEY_PASSWORD

  mv "$tmp_jks" "$jks"
  mv "$tmp_env" "$envf"
  echo "OK keystore"
  echo "업로드 인증서 SHA-1: $sha1"
}

# Secret Manager 에 비밀 1개를 만든다(이미 있으면 SKIP). $1 이름 · $2 데이터 파일
backup_one() {
  local name="$1" file="$2" err
  if gcloud secrets describe "$name" --format='value(name)' >/dev/null 2>&1; then
    echo "SKIP backup $name — 이미 있음"
    return 0
  fi
  if ! err="$(gcloud secrets create "$name" --replication-policy=automatic --data-file="$file" 2>&1 >/dev/null)"; then
    echo "ERROR backup $name — gcloud 실패:" >&2
    echo "$err" >&2
    gcloud_hint backup
    return 1
  fi
  echo "OK backup $name"
}

stage_backup() {
  local jks="$REL/ghtrade-upload.jks" envf="$REL/android.env" pw_tmp p8="" f rc=0

  if [[ ! -f "$jks" || ! -f "$envf" ]]; then
    echo "ERROR backup — 키스토어 또는 android.env 가 없다(먼저 keystore 단계를 실행): $REL" >&2
    return 1
  fi
  gcloud_prep || return 1

  backup_one gh-radar-ghtrade-upload-keystore "$jks" || rc=1

  # 비밀번호 값은 umask 077 임시 파일로만 넘기고 즉시 지운다(줄바꿈 없이 — 값 그대로).
  pw_tmp="$(mktemp "$REL/.pw.XXXXXX")"
  grep -E '^GHTRADE_UPLOAD_STORE_PASSWORD=' "$envf" | head -n 1 | cut -d= -f2- | tr -d '\r\n' > "$pw_tmp" || true
  if [[ ! -s "$pw_tmp" ]]; then
    rm -f "$pw_tmp"
    echo "ERROR backup gh-radar-ghtrade-upload-keystore-password — android.env 에 GHTRADE_UPLOAD_STORE_PASSWORD 가 비어 있다" >&2
    return 1
  fi
  backup_one gh-radar-ghtrade-upload-keystore-password "$pw_tmp" || rc=1
  rm -f "$pw_tmp"

  for f in "$REL"/AuthKey_*.p8; do
    if [[ -f "$f" ]]; then p8="$f"; break; fi
  done
  if [[ -n "$p8" ]]; then
    backup_one gh-radar-ghtrade-asc-api-key "$p8" || rc=1
  else
    echo "SKIP backup gh-radar-ghtrade-asc-api-key — $REL 에 AuthKey_*.p8 없음"
  fi
  return "$rc"
}

stage_play_sa() {
  local sa_name="gh-radar-play-publisher" sa_email key="$REL/play-service-account.json" err

  if [[ ! -d "$REL" ]]; then
    echo "ERROR play-sa — 비밀 디렉터리가 없다: $REL (먼저 dir 단계를 실행)" >&2
    return 1
  fi
  gcloud_prep || return 1
  sa_email="${sa_name}@${CLOUDSDK_CORE_PROJECT}.iam.gserviceaccount.com"

  if ! err="$(gcloud services enable androidpublisher.googleapis.com 2>&1 >/dev/null)"; then
    echo "ERROR play-sa — androidpublisher API 사용 설정 실패:" >&2
    echo "$err" >&2
    gcloud_hint play-sa
    return 1
  fi
  if ! gcloud iam service-accounts describe "$sa_email" >/dev/null 2>&1; then
    if ! err="$(gcloud iam service-accounts create "$sa_name" --display-name="GH Trade Play publisher" 2>&1 >/dev/null)"; then
      echo "ERROR play-sa — SA 생성 실패:" >&2
      echo "$err" >&2
      gcloud_hint play-sa
      return 1
    fi
  fi
  # GCP 프로젝트 IAM 역할은 주지 않는다 — Play 권한은 Play Console 에서 앱 단위로(T-22-10).
  if [[ -f "$key" ]]; then
    echo "SKIP play-sa 키 — 이미 있음"
  else
    if ! err="$(gcloud iam service-accounts keys create "$key" --iam-account="$sa_email" 2>&1 >/dev/null)"; then
      rm -f "$key"
      echo "ERROR play-sa — SA 키 생성 실패:" >&2
      echo "$err" >&2
      gcloud_hint play-sa
      return 1
    fi
    chmod 600 "$key"
  fi
  echo "OK play-sa"
  echo "SA: $sa_email"
}

if [[ $# -eq 0 ]]; then
  usage
  exit 2
fi

# 모든 stage 이름을 먼저 확인한다 — 오타가 섞이면 아무것도 실행하지 않는다.
for stage in "$@"; do
  case "$stage" in
    dir | asc | keystore | backup | play-sa) ;;
    *)
      echo "모르는 stage: $stage" >&2
      usage
      exit 2
      ;;
  esac
done

for stage in "$@"; do
  case "$stage" in
    dir) stage_dir ;;
    asc) stage_asc ;;
    keystore) stage_keystore ;;
    backup) stage_backup ;;
    play-sa) stage_play_sa ;;
  esac
done
