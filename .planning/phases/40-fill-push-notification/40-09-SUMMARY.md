---
phase: 40-fill-push-notification
plan: 09
subsystem: relay
status: complete
tags: [push, relay, apns, fcm, ops, tdd]

requires:
  - "40-06 PushSender · PushSendMessage · PushSendResult · index pushSenders 슬롯 · RelayConfig.pushNotify"
  - "40-02 shared PUSH_CHANNEL_ID(fills)"
  - "40-04 APNs .p8(~/.config/gh-trade/push/AuthKey_*.p8 · 팀 954QPCS3F5) · Firebase 프로젝트 gh-radar"
provides:
  - "relay/src/push/apns.ts — ApnsSender · APNS_HOST · APNS_JWT_REUSE_MS · classifyApnsResponse · apnsPayloadOf"
  - "relay/src/push/fcm.ts — FcmSender(send · probe) · classifyFcmResponse · fcmErrorCodeOf · fcmBodyOf · FCM_METADATA_TOKEN_URL"
  - "RelayConfig.apns · apnsOffReason · fcmProjectId · apnsConfigOf"
  - "index.ts — PushNotifier 생성 전에 APNs · FCM 송신기를 pushSenders 에 넣는다 · FCM probe 1회"
  - "deploy-relay.sh push_notify_value · APNs 비치명 비밀 · PUSH_NOTIFY 전달 / setup-relay-iam.sh FCM API · 역할 · Secret 껍데기 / setup-push-secrets.sh apns"
affects: [40-12]

tech-stack:
  added: []
  patterns:
    - "송신기 = 순수 분류 함수(classify*) + 재시도 종류마다 1회 루프 — 분류 표를 테스트로 잠근다"
    - "세션 · fetch · 시계를 생성자 주입 — 가짜 http2 세션 · 가짜 fetch 로 네트워크 없이 테스트"
    - "비밀은 비치명 + 원인 문구(env 이름만) — 부팅 로그 1줄로 어느 플랫폼이 꺼졌는지 보인다"

key-files:
  created:
    - relay/src/push/apns.ts
    - relay/src/push/fcm.ts
    - relay/tests/push-apns.test.ts
    - relay/tests/push-fcm.test.ts
    - scripts/setup-push-secrets.sh
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-09-task2-red.json
  modified:
    - relay/src/config.ts
    - relay/tests/config-push.test.ts
    - relay/src/index.ts
    - relay/src/logger.ts
    - scripts/deploy-relay.sh
    - scripts/setup-relay-iam.sh

key-decisions:
  - "APNs 비밀이 어긋난 이유를 config 가 apnsOffReason(env 이름만 · 값 없음)으로 돌려주고 index 가 부팅 로그 1줄에 싣는다 — 반쪽 주입 · 형식 오류를 운영에서 바로 구분"
  - "ApnsSender 생성(createPrivateKey) 실패는 index 가 잡아 iOS 송신기만 뺀다 — 키가 깨져도 relay 기동은 막지 않는다(오류 코드만 로그)"
  - "APNs 410 은 reason 과 무관하게 token_removed(Apple 410 은 Unregistered · ExpiredToken 뿐) · 403 은 ExpiredProviderToken 만 재서명 재시도"
  - "FCM 오류 코드는 details FcmError.errorCode 우선 · 없으면 error.status — 404+UNREGISTERED 와 400+INVALID_ARGUMENT 를 섞지 않는다"
  - "FCM 메타데이터 토큰 실패도 status 0(reason Metadata)으로 보고 같은 1회 재시도 — 실패 결과는 failed(삭제 없음)"
  - "probe 는 401 도 403 과 같이 「송신 권한 없음」 error — 둘 다 역할 · 범위 문제(A2)"
  - "deploy-relay 의 APNs 사전 점검 · PUSH_NOTIFY 전달은 정상 배포 · 롤백 둘 다 — 옛 이미지는 모르는 env 를 무시한다"
  - "setup-push-secrets.sh 는 최신 버전과 값이 같으면 새 버전을 만들지 않는다(변수 비교 · 출력 없음) · 경로는 AuthKey_*.p8 무늬로만 찍는다(파일 이름에 Key ID)"

requirements-completed: [SC-1, SC-3]

coverage:
  - id: D1
    description: "APNs — ES256 JWT(ieee-p1363 64바이트 · 공개키 검증) · 49분 재사용/51분 새로 · 헤더 7종 · 본문(배지 키 없음 · 4KB 이하) · production 호스트"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "relay/tests/push-apns.test.ts#ApnsSender — JWT(ES256 · 50분 재사용)"
        status: pass
      - kind: unit
        ref: "relay/tests/push-apns.test.ts#ApnsSender — 요청 · 본문"
        status: pass
    human_judgment: false
  - id: D2
    description: "APNs 분류 — 200 ok · 410 token_removed · 400 BadDeviceToken 보존 · 429 stopRun · 403 Expired 재서명 1회 · Invalid failed · 5xx/0 재시도 1회 · 세션 goaway/error 뒤 새로 · close"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "relay/tests/push-apns.test.ts#classifyApnsResponse — 분류 표"
        status: pass
      - kind: unit
        ref: "relay/tests/push-apns.test.ts#ApnsSender — 응답에 따른 재시도 · 정리 · 중단"
        status: pass
      - kind: unit
        ref: "relay/tests/push-apns.test.ts#ApnsSender — 세션"
        status: pass
    human_judgment: false
  - id: D3
    description: "FCM — 메타데이터 토큰(만료 60초 전 재사용 · 401 재발급 1회) · v1 URL · notification 필수 · android HIGH/ttl/channel fills · data.path · tag 없음"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "relay/tests/push-fcm.test.ts#FcmSender — 메타데이터 토큰"
        status: pass
      - kind: unit
        ref: "relay/tests/push-fcm.test.ts#FcmSender — 요청 · 본문"
        status: pass
    human_judgment: false
  - id: D4
    description: "FCM 분류 — 404 UNREGISTERED token_removed · 400 보존 · 403 error · 429 stopRun · 5xx/네트워크 재시도 1회 · probe validate_only(403 error · 400/404 info · 예외 삼킴)"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "relay/tests/push-fcm.test.ts#classifyFcmResponse — 분류 표"
        status: pass
      - kind: unit
        ref: "relay/tests/push-fcm.test.ts#FcmSender — 응답에 따른 재시도 · 정리 · 중단"
        status: pass
      - kind: unit
        ref: "relay/tests/push-fcm.test.ts#FcmSender — probe(기동 권한 확인)"
        status: pass
    human_judgment: false
  - id: D5
    description: "config — apns(둘 다 + PEM + 10자 Key ID) · 비치명 원인 문구 · TEAM/TOPIC env · fcmProjectId(production 기본 gh-radar)"
    verification:
      - kind: unit
        ref: "relay/tests/config-push.test.ts#loadConfig — apns"
        status: pass
      - kind: unit
        ref: "relay/tests/config-push.test.ts#loadConfig — fcmProjectId"
        status: pass
    human_judgment: false
  - id: D6
    description: "T-19-14 — 송신기 로그에 기기 토큰 · JWT · 액세스 토큰 · 키 없음 · logger redact 3경로"
    verification:
      - kind: unit
        ref: "relay/tests/push-apns.test.ts#ApnsSender — 로그(T-19-14)"
        status: pass
      - kind: unit
        ref: "relay/tests/push-fcm.test.ts#FcmSender — 로그(T-19-14)"
        status: pass
    human_judgment: false
  - id: D7
    description: "운영 스크립트 — deploy-relay self-test(push_notify_value 4건) · PUSH_NOTIFY 오타 exit 1(gcloud 전) · bash -n 3개 · setup-push-secrets 오프라인 오류 경로(0개 · 권한 644)"
    verification:
      - kind: other
        ref: "bash scripts/deploy-relay.sh --self-test → self-test OK 12 cases"
        status: pass
      - kind: other
        ref: "PUSH_NOTIFY=yes bash scripts/deploy-relay.sh → ERROR … exit 1(네트워크 없음)"
        status: pass
    human_judgment: false
  - id: D8
    description: "실제 APNs · FCM 송신 · probe 결과 · 비밀 주입 · IAM 적용 · 재배포"
    requirement: SC-1
    verification: []
    human_judgment: true
    note: "40-12 (메인 세션 · 사용자 ! 실행)"

metrics:
  duration: "약 12분"
  completed: 2026-11-07
duration: 12min
completed: 2026-11-07

estimate:
  tokens: 105000
  tasks: 3
actuals:
  tokens: 18400
  tasks: 3
  commits: 4
plan_head_before: 857a2fdbba376dd7d2fdabd34b001e00d3c88bf8
plan_head_after: e50e0f9410f893a6a7ce500e656e1ffbd281a17c
---

# Phase 40 Plan 09: relay 푸시 송신기(APNs · FCM v1) + 운영 스크립트 Summary

**iOS 는 `node:http2` 세션 하나와 `node:crypto` ES256 JWT(50분 재사용)로 Apple 에 직접, Android 는 VM 메타데이터 토큰으로 FCM HTTP v1 에 — 새 의존성 0 · 키 파일 0. 응답 분류(410/404 만 토큰 정리 · 400 보존 · 429 중단 · 5xx/0 재시도 1회)를 테스트로 잠갔고, 비밀이 없으면 그 플랫폼만 빠진 채 relay 가 뜬다.**

## Performance

- **Duration:** 약 12분 (2026-11-06T23:43Z → 2026-11-06T23:55Z)
- **Tasks:** 3 (tracer 1 · TDD 1 · auto 1)
- **Files:** 새 파일 5(+ RED 증거 1) · 수정 6

## env · Secret · 역할 이름

| 종류 | 이름 | 뜻 |
|---|---|---|
| env | `APNS_AUTH_KEY_B64` | .p8 PEM 의 base64 한 줄(docker `--env-file` 여러 줄 불가 — Pitfall 10) |
| env | `APNS_KEY_ID` | Key ID 10자 영숫자 |
| env | `APNS_TEAM_ID` | 선택 · 기본 `954QPCS3F5` |
| env | `APNS_TOPIC` | 선택 · 기본 `com.ghtrade.app` |
| env | `FCM_PROJECT_ID` | 선택 · 없으면 production `gh-radar` · 로컬 undefined(Android 송신기 없음) |
| env | `PUSH_NOTIFY` | 40-06 — `on`/`off` · 배포 스크립트가 값이 있을 때만 env-file 에 싣는다 |
| Secret | `gh-radar-apns-auth-key` | → `APNS_AUTH_KEY_B64` (비치명) |
| Secret | `gh-radar-apns-key-id` | → `APNS_KEY_ID` (비치명) |
| 역할 | `roles/firebasecloudmessaging.admin` | relay SA · env `FCM_SENDER_ROLE` 로 바꿀 수 있음(A4) |
| API | FCM API(`setup-relay-iam.sh` Section 2) | 멱등 사용 설정 |

## 부팅 · 송신 로그 문구(전부 `[push]` 접두 · 키는 status · reason · code 만)

| 수준 | 문구 | 때 |
|---|---|---|
| info | `[push] APNs 비밀 없음 — iOS 송신 꺼짐` `{ reason }` | `config.apns` 없음(reason = `APNs 비밀 없음` · `APNS_KEY_ID 없음(…)` · `APNS_AUTH_KEY_B64 없음(…)` · `APNS_KEY_ID 형식 아님(10자 영숫자)` · `APNS_AUTH_KEY_B64 디코드가 PEM 이 아님`) |
| error | `[push] APNs 키 읽기 실패 — iOS 송신 꺼짐` `{ code }` | `createPrivateKey` 실패 |
| info | `[push] FCM 프로젝트 없음 — Android 송신 꺼짐` | `fcmProjectId` 없음(로컬) |
| info / error / warn | `[push] FCM 권한 확인` / `[push] FCM 송신 권한 없음 — setup-relay-iam.sh(FCM 역할 · API) 확인` / `[push] FCM 권한 확인 못 함 — 다음 송신에서 다시 드러난다` | 기동 probe(400·404·200 / 401·403 / 그 밖) |
| warn | `[push] FCM 권한 확인 예외 — 기동은 계속` | probe 예외 |
| info | (40-06) `[push] 켜짐 platforms=ios,android` · `[push] 꺼짐 — …` | notifier 생성 |
| info | `[push] APNs 토큰 만료 — 기기 정리` · `[push] FCM 토큰 만료 — 기기 정리` | 410 · 404 |
| error | `[push] APNs 인증 실패 — 키 · 팀 ID · Key ID 확인` · `[push] FCM 권한 · 설정 오류 — setup-relay-iam.sh(FCM 역할 · API) 확인` | 403(·401) |
| warn | `[push] APNs 한도 신호 — 이 묶음 iOS 송신 중단` · `[push] FCM 한도 신호 — 이 묶음 Android 송신 중단` | 429 |
| warn | `[push] APNs 송신 실패` · `[push] FCM 송신 실패` · `[push] APNs 세션 오류 — 다음 요청이 새로 연다` | 그 밖 |
| error | `[push] APNs 페이로드 4KB 초과 — 보내지 않음` `{ bytes }` | 계약 밖 문안 |

배포 스크립트: `⚠ APNs 비밀 생략 — iOS 체결 푸시 꺼짐: <사유> (값 주입: ! bash scripts/setup-push-secrets.sh apns)` / `✓ APNs 비밀 확인 (…)` · `체결 앱 푸시 스위치: PUSH_NOTIFY=…` · VM 로그 `비밀 4종 획득 (값은 기록하지 않음) · KYOBO … · APNs 비밀 포함|없음 · PUSH_NOTIFY=… · env 모양=…`.

## Accomplishments

- `ApnsSender` — production 호스트 고정(sandbox 없음 · Pitfall 5) · 세션 1개 재사용(`goaway`/`error`/`close` 뒤 새로 · `unref`) · 5초 타임아웃 · `apns-expiration` 지금+3600 · `apns-collapse-id` = log_id.
- `FcmSender` — 메타데이터 토큰 캐시 · 5초 `AbortSignal.timeout` · `probe()` validate_only · shared `PUSH_CHANNEL_ID` import.
- index — 두 송신기를 `new PushNotifier` **위**에서 넣는다(notifier 는 생성 때 송신기 수로 켜짐을 정한다).
- 스크립트 3 · logger redact 3경로(`*.APNS_AUTH_KEY_B64` · `*.APNS_KEY_ID` · `*.keyPem`).

## 테스트 수

- 새 테스트: `push-apns.test.ts` 20 · `push-fcm.test.ts` 19 · `config-push.test.ts` +8(apns 5 · fcmProjectId 3)
- 플랜 명시 4 파일(`push-fcm · push-apns · config-push · push-notifier`) + 이웃 config 3 파일(`config-quote · config-registry · config-upstreams`) → **7 파일 · 91 통과 · 실패 0**
- `typecheck` · `typecheck:tests` — `error TS` 0
- `bash scripts/deploy-relay.sh --self-test` → `self-test OK 12 cases`(push_notify_value 4건 포함 · FAIL 0)
- `bash -n` 3개 통과 · `test -x scripts/setup-push-secrets.sh` · 추적 모드 줄 0 · `OPS-OK`

## Task Commits

| Task | 이름 | 커밋 |
|---|---|---|
| 1 (tracer) | APNs 한 길 — config → ApnsSender → 분류 → index | `633bdaeb` (feat) |
| 2 RED | FCM · fcmProjectId 실패 테스트 + RED 증거 | `f5fd90e1` (test) |
| 2 GREEN | FcmSender · fcmProjectId · index 결선 · probe | `0dc7f918` (feat) |
| 3 | 운영 스크립트 3 · logger redact | `e50e0f94` (feat) |

REFACTOR 커밋 없음.

## TDD

- **Task 2 RED** — 대상 `tests/config-push.test.ts > loadConfig — fcmProjectId (Phase 40 FCM v1) > 없음 + production → gh-radar(운영 VM 메타데이터 토큰)`: `expected undefined to be 'gh-radar'` AssertionError(exit 1) · `gsd-tools check tdd-red-evidence` = `RED_EVIDENCE_OK`(target_test_failed). 의미 판정: 대상이 실제로 실행되어 계획한 단언에서 실패 — `loadConfig` 가 `fcmProjectId` 를 돌려주지 않는 구현 부재가 원인(로드 · 문법 · 픽스처 오류 아님). 같은 RED 커밋의 `push-fcm.test.ts` 는 `src/push/fcm.ts` 가 없어 모듈 해석에서 멈췄다 — RED 판정 근거로 쓰지 않았고 GREEN 에서 19/19 통과로 확인.
- RED 명령은 `pnpm … exec` 대신 `relay/node_modules/.bin/vitest run --root relay …` — pnpm 이 실패 시 stdout 에 덧붙이는 `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` 줄이 TAP 를 깨뜨려(`invalid_record` · Non-TAP data) 원 러너로 다시 돌렸다. pino 부팅 줄은 `consoleOutput` 으로 분리.
- **Task 2 GREEN** — 4 파일 69/69 통과.
- 증거 파일: `tdd-evidence/40-09-task2-red.json`(커밋됨).

## setup-push-secrets.sh 출력 줄 전부 (수락 기준 — `grep -nE '^[[:space:]]*(echo|printf)'`)

```
37:  echo "사용: bash scripts/setup-push-secrets.sh <stage>..." >&2
38:  echo "  stages: apns" >&2
51:    echo "ERROR gcloud — gcloud CLI 가 없다" >&2
55:    echo "OK gcloud — 인증: SA 키 파일 ${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE} · 프로젝트 ${CLOUDSDK_CORE_PROJECT}"
57:    echo "OK gcloud — 인증: gcloud 사용자 계정 · 프로젝트 ${CLOUDSDK_CORE_PROJECT}"
71:    echo "ERROR apns — 디렉터리 없음: $PUSH_DIR (40-04 에서 받은 AuthKey_*.p8 을 여기에 둔다)" >&2
78:    echo "ERROR apns — $PUSH_DIR 에 AuthKey_*.p8 이 정확히 1개여야 한다 (지금 ${#found[@]}개)" >&2
84:    echo "ERROR apns — 권한이 600 이 아니다: $PUSH_DIR/AuthKey_*.p8 (chmod 600 뒤 다시 실행)" >&2
91:    echo "ERROR apns — 파일 이름에서 Key ID(AuthKey_ 뒤 10자 영숫자)를 읽지 못했다: $PUSH_DIR/AuthKey_*.p8" >&2
95:    echo "ERROR apns — PEM 개인키(BEGIN PRIVATE KEY)가 아니다: $PUSH_DIR/AuthKey_*.p8" >&2
103:      echo "ERROR apns — Secret '$s' 없음 — 먼저 GCP_PROJECT_ID=${CLOUDSDK_CORE_PROJECT} bash scripts/setup-relay-iam.sh" >&2
115:      echo "ERROR apns — Secret '$APNS_KEY_SECRET' 새 버전 실패 (권한 · 프로젝트 확인)" >&2
122:      echo "ERROR apns — Secret '$APNS_KEY_ID_SECRET' 새 버전 실패 (권한 · 프로젝트 확인)" >&2
131:    echo "SKIP apns — 이미 같은 값"
133:    echo "OK apns — $APNS_KEY_SECRET · $APNS_KEY_ID_SECRET 새 버전 (relay 는 다음 bash scripts/deploy-relay.sh 때 읽는다)"
150:      echo "ERROR $STAGE — 알 수 없는 stage" >&2
```

값을 싣는 `printf '%s' …` 두 줄은 `if ! printf '%s' "$…" | gcloud secrets versions add … --data-file=- >/dev/null 2>&1; then` 꼴이라 화면으로 가지 않는다(줄머리가 `if` 라 위 grep 에 안 걸린다). 오프라인 확인: 디렉터리 없음 · 파일 0개 · 권한 644 세 경로가 gcloud 전에 ERROR 한 줄 + exit 1(가짜 디렉터리 · 빈 파일 — 실제 .p8 은 읽지 않았다).

## Verification

- 수락 기준 Task 1: `ieee-p1363` 2 · `APNS_HOST` 2 · `sandbox.push` 0 · `badge` 0 · `new ApnsSender` 1 · 새 의존성 grep 0 — PASS
- 수락 기준 Task 2: v1 URL 2 · `Metadata-Flavor` 2 · `validate_only` 3 · `new FcmSender` 1 · `private_key|GOOGLE_APPLICATION_CREDENTIALS` 0 — PASS
- 수락 기준 Task 3: `push_notify_value` 6 · deploy `gh-radar-apns-auth-key` 4 · iam 3 · iam `fcm.googleapis.com` 1 · logger `"*.APNS_AUTH_KEY_B64"` 1 — PASS
- SC-3 게이트: `git diff --stat 743784bb -- relay/src/order relay/src/dma relay/src/journal relay/src/ws` 빈 출력
- 플랜 `<verification>` 의 relay **전체** vitest 는 돌리지 않았다 — 이번 실행 지시(동시 executor 3개 · 플랜 명시 파일만)를 따랐다. 웨이브 병합 뒤 한 세션 몫.
- 스크립트는 실행하지 않았다(gcloud · IAM · Secret Manager 경로 0) — `bash -n` · `--self-test` · `--help` · 네트워크 전 오류 경로만.

## Decisions Made

frontmatter `key-decisions` 8건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 운영 가시성] `apnsOffReason` 추가**
- **Found during:** Task 1
- **Issue:** 플랜은 「원인 표시는 index 부팅 로그 — 값 없음」 이라 했는데 config 가 `apns` undefined 만 돌려주면 index 는 반쪽 주입 · 형식 오류 · 미주입을 가를 수 없다.
- **Fix:** `RelayConfig.apnsOffReason`(env 이름만 담은 문구) + `apnsConfigOf` — 테스트가 문구에 값이 없음을 잠근다.
- **Files modified:** relay/src/config.ts · relay/tests/config-push.test.ts
- **Commit:** `633bdaeb`

**2. [Rule 2 - 견고성] 키 파싱 실패 격리 · 4KB 초과 가드**
- **Found during:** Task 1
- **Issue:** PEM 문자열은 맞지만 키가 깨진 경우 `new ApnsSender` 가 throw 해 relay 기동이 죽는다 · 문안이 4KB 를 넘으면 APNs 413 을 일부러 받는다.
- **Fix:** index 가 try/catch 로 iOS 송신기만 뺀다(오류 코드만 로그) · 송신 전 바이트 검사(failed `PayloadTooLarge` · 송신 0).
- **Commit:** `633bdaeb`

**3. [Rule 2 - 비밀 비출력] setup-push-secrets 경로 문구에서 Key ID 제거**
- **Found during:** Task 3
- **Issue:** ERROR 줄이 `$p8`(파일 이름 `AuthKey_<KeyID>.p8`)을 찍으면 Key ID 가 화면에 나간다(플랜 규약 「Key ID 미출력」 위반).
- **Fix:** 경로는 `$PUSH_DIR/AuthKey_*.p8` 무늬로만 찍는다 + 머리 주석에 이유.
- **Commit:** `e50e0f94`

**4. [Rule 3 - 증거 형식] RED 명령을 vitest 바이너리로**
- **Found during:** Task 2 RED
- **Issue:** `pnpm --filter … exec vitest` 가 실패 때 stdout 에 pnpm 오류 줄을 덧붙여 RED 판정기가 `invalid_record`(Non-TAP data)를 냈다.
- **Fix:** 같은 테스트를 `relay/node_modules/.bin/vitest run --root relay …` 로 다시 돌려 `RED_EVIDENCE_OK`. 보고서 조작 없음.
- **Commit:** `f5fd90e1`

---

**Total deviations:** 4 auto-fixed (Rule 2 3건 · Rule 3 1건)
**Impact on plan:** 이름 · 계약 · 결선 위치 · 스크립트 단계는 플랜 그대로.

## Issues Encountered

- worktree 에 node_modules 가 없어 `pnpm install --frozen-lockfile --prefer-offline`(새 패키지 0) 뒤 `pnpm --filter @gh-radar/shared build`.
- shellcheck 미설치 — `bash -n` 과 self-test · 오프라인 경로로 대신했다.

## Known Stubs

없음. (40-06 의 `const pushSenders: PushSender[] = []` 는 이번에 config 로 채워진다 — 비밀이 없으면 의도대로 빈 채 「꺼짐」 로그.)

## Next Phase Readiness (40-12)

1. `GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh --dry-run` → 확인 뒤 실제 실행(FCM API · 역할 · APNs Secret 껍데기 2 + 접근권).
2. 사용자 `! bash scripts/setup-push-secrets.sh apns` → `OK apns …` 한 줄.
3. 장 마감(20:00 KST) 뒤 `bash scripts/deploy-relay.sh` → `✓ APNs 비밀 확인` · VM 로그 `APNs 비밀 포함`.
4. relay 로그에서 `[push] 켜짐 platforms=ios,android` · `[push] FCM 권한 확인` 확인. `[push] FCM 송신 권한 없음 …` 이면 역할(`FCM_SENDER_ROLE`) · VM 범위(A2 — 메타데이터 `?scopes=` 또는 VM 범위 재설정)를 본다.
5. 비상 끄기: `PUSH_NOTIFY=off bash scripts/deploy-relay.sh`.

## Self-Check: PASSED

- FOUND: relay/src/push/apns.ts · relay/src/push/fcm.ts · relay/tests/push-apns.test.ts · relay/tests/push-fcm.test.ts · scripts/setup-push-secrets.sh · tdd-evidence/40-09-task2-red.json
- FOUND commits: 633bdaeb · f5fd90e1 · 0dc7f918 · e50e0f94
