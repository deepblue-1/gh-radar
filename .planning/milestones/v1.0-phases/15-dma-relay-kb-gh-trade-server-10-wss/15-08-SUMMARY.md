---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 08
subsystem: infra
tags: [gcp, gce, docker, artifact-registry, iap-ssh, cloud-monitoring, uptime-check, secret-manager, smoke-test]

# Dependency graph
requires:
  - phase: 15-05
    provides: "relay/Dockerfile (amd64 멀티스테이지) + relay 프로세스 본체 · /healthz · 공유 비밀 관문"
  - phase: 15-07
    provides: "가동 중인 radar-gw VM · 방화벽 3규칙 · 고정 IP · Let's Encrypt 인증서 · Secret 3종 실체화 · relay-docker-login 헬퍼"
provides:
  - "`scripts/deploy-relay.sh` — amd64 빌드 → AR push → IAP SSH `docker run` 배포 + uptime/알림 결선 + `--rollback`"
  - "`scripts/smoke-relay.sh` — INV-1~8 인프라 불변식 러너 (SKIP 카운터 · `--check-tls` · `--check-exposure` · `--check-isin` 골격)"
  - "`ops/alert-relay-down.yaml` — uptime check 기반 relay 다운 알림 정책 (원인 추정 6종 문서화)"
  - "실제 가동 중인 relay 컨테이너 — `https://dma.jx1.io/healthz` 200 (15-07 의 502 해소)"
  - "uptime check `gh-radar-relay-healthz` + 알림 정책 `gh-radar-relay-down` (채널 결선 완료)"
affects: [15-09, 15-10, 15-14, 15-16, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: [cloud-monitoring-uptime-check, docker-on-gce]
  patterns:
    - "원격 셸 스크립트는 base64 로 감싸 `--command` 에 넘긴다 — 로컬→gcloud→ssh→원격 4중 인용을 우회"
    - "원격 스크립트를 head(치환되는 공개 설정) + body(인용 heredoc) 로 분리 — 원격 변수의 조기 전개를 구조적으로 차단"
    - "비밀은 배포 명령줄이 아니라 **대상 호스트 안에서** Secret Manager → tmpfs env-file 로 주입"
    - "'열려 있으면 안 되는 것' 은 능동 검증한다 — 부정을 `bash -c '! ...'` 로 명시"
    - "검증 러너에 SKIP 을 FAIL 과 분리해 둔다 — '확인 안 함' 과 '틀림' 은 다른 사실이다"

key-files:
  created:
    - scripts/deploy-relay.sh
    - scripts/smoke-relay.sh
    - ops/alert-relay-down.yaml
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-08-SUMMARY.md
  modified:
    - infra/relay/README.md
    - scripts/setup-relay-iam.sh
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md

key-decisions:
  - "비밀 주입을 `-e KEY=VALUE` 가 아니라 VM 내부 tmpfs env-file 로 — 명령줄 주입은 ps·journalctl·셸 히스토리 3곳에 값을 남긴다"
  - "원격 명령을 base64 로 전송 — 4중 인용을 통과하는 스크립트는 조용히 깨지고, 깨진 채로 성공한 것처럼 보인다"
  - "INV-4(VPN)를 FAIL 이 아니라 SKIP 으로 — openconnect 는 자동 기동 미등록 수동 유닛이라 미기동이 기본 정상 상태다"
  - "uptime check 에 validate-ssl 을 켜서 인증서 만료를 같은 알림으로 흡수 (T-15-13 을 별도 감시 없이 커버)"
  - "알림 임계값은 plan 의 명시 스펙(LT 1)을 그대로 따르고, 리전별 중복 인시던트만 crossSeriesReducer 로 억제 — 튜닝은 실측 후 deferred"
  - "`nc` 결과를 8초 워치독으로 유계 — DROP 포트에서 macOS nc 가 75초 매달려 스모크가 사실상 안 돌아간다"

patterns-established:
  - "배포 스크립트는 '실패 시 무엇을 먼저 돌려야 하는지'를 에러 메시지에 담는다 (setup-*-iam.sh 힌트)"
  - "안전한 쪽을 기본값으로 두고, 위험한 값은 명시 주입 + 경고 출력으로만 도달 가능하게 한다 (DMA_HOST)"

requirements-completed: [RELAY-03]

# Metrics
duration: 27min
completed: 2026-09-06
---

# Phase 15 Plan 08: relay VM 배포 + 인프라 불변식 자동 검증 Summary

**15-07 이 세워 둔 빈 인프라 위에 relay 컨테이너를 실제로 올려 `https://dma.jx1.io/healthz` 의 502 를 200 으로 바꾸고, 인프라 불변식 8종을 매번 자동 검증하는 스모크 러너와 uptime 기반 알림을 붙였다 — 실서버 접속은 한 번도 일어나지 않았다.**

## Performance

- **Duration:** 약 27분
- **Started:** 2026-09-05T16:35Z
- **Completed:** 2026-09-05T17:02Z
- **Tasks:** 3/3 (checkpoint 1건 — 사용자 사전 승인 하에 실행)
- **Files created:** 3 · **modified:** 3

## Accomplishments

- **SC-8 의 나머지 절반을 채웠다.** `relay/Dockerfile`(15-05) + `setup-relay-iam.sh`(15-06) 에 이어
  `deploy-relay.sh` · `smoke-relay.sh` · `ops/alert-relay-down.yaml` 이 갖춰졌고, 세 개가 전부 **실제로 동작하는 것을 실행으로 증명**했다. 워커 3종 세트 규약을 relay 에 그대로 이식하되 배포 대상(Cloud Run Job → VM 위 Docker)과 알림 근거(실행 실패 메트릭 → uptime check) 두 축만 바꿨다.
- **`https://dma.jx1.io/healthz` 가 200 을 돌려준다.** 15-07 이 남긴 502(업스트림 부재)가 해소됐다.
  응답은 `{"status":"ok","vpn":true,"dma":true,"version":"e6f39e5","sessionCount":0}` 로,
  계좌번호·사용자 식별자가 어느 필드에도 없다(T-15-22 능동 확인).
- **INV-7 이 "닫혀 있음" 을 능동 증명했다.** 공인 IP `34.22.79.103` 의 `8091`(내부 주문)과
  `9100`(DMA 게이트웨이) 이 둘 다 도달 불가다. 이건 "설정했으니 되겠지" 가 아니라 **바깥에서 실제로 두드려 본 결과**다 (T-15-12).
- **메모리 예산이 실측으로 확인됐다.** 컨테이너 기동 후 호스트 `used=491MB` / `available=478MB`,
  relay 컨테이너 자체는 `48.85MiB / 384MiB`(세션 0개). Pitfall 11 의 700MB 경계에 한참 못 미쳐
  **e2-small 전환은 불필요**하다. 상한(`--memory=384m`)이 실제로 걸려 있음을 `docker inspect` 로 확인했다.
- **실서버 접속 0건.** 컨테이너 env 는 `DMA_HOST=127.0.0.1` 이고 `docker inspect` 결과에 KB 게이트웨이 주소가 없다.
  openconnect 는 손대지 않았고(`inactive` 유지), KB 로그인·주문도 0건이다 (D-27).

## Task Commits

1. **Task 1: `scripts/deploy-relay.sh`** — `d54d395` (feat)
2. **Task 2: `scripts/smoke-relay.sh` + `ops/alert-relay-down.yaml`** — `e6f39e5` (feat)
3. **Task 3: [BLOCKING] 배포 실행 + smoke** — `c9e12b1` (feat)

## 실측 결과

### 배포 (Task 3)

| 항목 | 값 |
|------|-----|
| 이미지 | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:e6f39e5` (+ `:latest`) |
| 컨테이너 | `gh-radar-relay` — **Up** · `RestartPolicy=always` · `NetworkMode=host` |
| 메모리 상한 | `Memory=402653184`(384MiB) · `MemorySwap=805306368`(768MiB) — inspect 로 실확인 |
| 주입 env | `NODE_ENV=production` · `APP_VERSION=e6f39e5` · `WS_PORT=8090` · `ORDER_API_PORT=8091` · **`DMA_HOST=127.0.0.1`** · `DMA_PORT=9100` · `DMA_BROKER=KB` |
| 공개 `/healthz` | **200** · `ssl_verify_result=0` · 식별자 미포함 |
| `free -m` | total 969 · **used 491** · available 478 |
| `docker stats` | `48.85MiB / 384MiB` · cpu 0.03% |
| uptime check | `gh-radar-relay-healthz` — https/443 `/healthz` · period 1분 · `validate-ssl` · 2xx |
| 알림 정책 | `projects/gh-radar/alertPolicies/7995724305267722560` · enabled · 채널 결선됨 |

### smoke-relay.sh — **PASS 9 / FAIL 0 / SKIP 1**

| INV | 결과 | 근거 |
|-----|------|------|
| INV-1 VM RUNNING | PASS | `radar-gw` = RUNNING |
| INV-2 방화벽 3규칙 | PASS | 이름까지 정확히 일치 — 포트 80 규칙 **0건** |
| INV-3 고정 IP 결선 | PASS | 예약 `gh-radar-relay-ip` == VM natIP |
| INV-4 VPN + split-tunnel | **SKIP** | `openconnect@kb=inactive` — 수동 유닛이라 미기동이 기본 정상 |
| INV-5a 공개 헬스 | PASS | 200 + 식별자 미포함 |
| INV-5b TLS | PASS | issuer Let's Encrypt · `notAfter` 미래(`-checkend 0`) |
| INV-6 wss 인증 왕복 | PASS | 잘못된 토큰 → **4401 `invalid token`** / 5초 무전송 → **4401 `auth timeout`** |
| INV-7a `8091` 공인 차단 | PASS | `nc` 실패 |
| INV-7b `9100` 공인 차단 | PASS | `nc` 실패 |
| INV-8 알림 결선 | PASS | 정책 1건 + 채널 비어있지 않음 + uptime check 존재 |

## Decisions Made

- **비밀을 배포 명령줄에 싣지 않는다.** `docker run -e KEY=VALUE` 는 값이 VM 의 `ps` 출력,
  `journalctl`, 그리고 배포자의 셸 히스토리 3곳에 남는다. 대신 VM 안에서 메타데이터 토큰으로
  Secret Manager REST 를 호출해 `/dev/shm`(tmpfs) 의 0600 env-file 에 쓰고 `--env-file` 로 넘긴 뒤
  즉시 지운다. docker 가 이미 컨테이너 설정에 값을 복사하므로 파일이 사라져도 재시작에 지장이 없다 (T-15-29).
- **원격 스크립트를 base64 로 전송한다.** `--command` 문자열은 로컬 셸 → gcloud → ssh → 원격 셸
  **4중 인용**을 통과한다. 따옴표가 섞인 스크립트는 이 경로에서 조용히 깨지고, 더 나쁜 것은
  깨진 채로 exit 0 이 나올 수 있다는 점이다. base64 는 인용 문자를 아예 만들지 않는다.
  스크립트를 head(로컬에서 치환되는 공개 설정) + body(인용 heredoc) 로 나눠 원격 변수의 조기 전개도 구조적으로 막았다.
- **INV-4 는 SKIP 이다.** openconnect 는 15-06/15-07 이 의도적으로 자동 기동을 등록하지 않은
  수동 유닛이다. 미기동을 FAIL 로 세면 **정상 상태의 스모크가 상시 빨간불**이 되고, 그러면 사람이
  빨간불을 무시하기 시작한다. SKIP 카운터를 따로 둬서 "확인 안 함" 과 "틀림" 을 분리했다.
- **uptime check 에 `validate-ssl` 을 켰다.** 인증서 만료(T-15-13)를 별도 감시 없이 같은 알림으로
  흡수한다. 만료되면 uptime check 가 실패하고 `gh-radar-relay-down` 이 뜬다.
- **알림 임계값은 plan 스펙을 그대로 따랐다.** `LT 1` 은 "성공률 100% 미만이면 조건 성립" 이라
  단일 리전 순간 실패에도 울릴 수 있다. 임계값은 plan 의 명시 스펙이라 임의로 바꾸지 않고,
  대신 `crossSeriesReducer: REDUCE_MEAN` 으로 리전별 중복 인시던트만 억제한 뒤
  튜닝 후보를 `deferred-items.md` 에 남겼다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 블로킹] relay SA 에 `gh-radar-supabase-service-role` 접근권이 없었다**

- **Found during:** Task 1 (배포 스크립트의 비밀 주입 경로 설계 중 IAM 실사)
- **Issue:** 15-06/15-07 이 relay SA 에 바인딩한 Secret 은 `dma-cred-key` · `relay-order-secret` ·
  `kb-vpn-password` 3종뿐이었다. 그런데 `loadConfig()` 는 **`SUPABASE_SERVICE_ROLE_KEY` 도 필수**로
  요구한다(wss 토큰 검증 + `dma_credentials` 조회). 즉 컨테이너가 뜨자마자 throw 로 죽었을 상황이다.
- **Fix:** `setup-relay-iam.sh` 에 바인딩 블록을 추가했다. 이 Secret 은 워커들이 공유하는 **기존 자산**이라
  "없으면 만든다" 루프에 넣지 않고 존재를 전제로 바인딩만 한다 — 공유 Secret 을 빈 껍데기로
  새로 만들 수 있는 경로를 두면 안 된다. 배포 스크립트도 4종을 선행 검증하도록 했다.
- **Files modified:** `scripts/setup-relay-iam.sh`, `scripts/deploy-relay.sh`
- **Verification:** 바인딩 적용 후 배포 실행 → 컨테이너가 정상 기동하고 `/healthz` 200
- **Committed in:** `d54d395`

**2. [Rule 1 - 버그] INV-6 프로브가 `require("ws")` 를 찾지 못해 FAIL 이었다**

- **Found during:** Task 3 (첫 스모크 실행 — INV-6 만 FAIL)
- **Issue:** CommonJS 의 `require("ws")` 는 **cwd 가 아니라 스크립트 파일이 있는 디렉터리**부터
  `node_modules` 를 거슬러 올라간다. 프로브를 `mktemp -d`(= `/tmp` 아래)에 쓰고
  `pnpm --filter @gh-radar/relay exec node <파일>` 로 돌렸더니, pnpm 이 cwd 를 `relay/` 로 바꿔도
  `MODULE_NOT_FOUND` 로 죽었다. **relay 는 정상이었고 검증 도구가 틀렸다** — 수동 프로브로
  4401 × 2 가 나오는 것을 먼저 확인해 원인을 분리했다.
- **Fix:** `require.resolve('ws')` 로 모듈 절대경로를 먼저 구해 프로브에 인자로 넘긴다.
  이제 `pnpm exec` 래퍼 없이 `node` 로 직접 실행한다.
- **Files modified:** `scripts/smoke-relay.sh`
- **Verification:** 재실행 → INV-6 PASS (`invalid token` / `auth timeout` 둘 다 4401)
- **Committed in:** `c9e12b1`

**3. [Rule 1 - 버그] `nc -z -w3` 이 포트당 75초 매달려 스모크가 사실상 안 돌아갔다**

- **Found during:** Task 2 (`--check-exposure` 첫 실행이 120초 타임아웃)
- **Issue:** 방화벽이 SYN 을 **DROP**(거부 응답 없음)하면 macOS 의 `nc` 는 `-w` 를 커넥트 단계에
  적용하지 않고 OS 기본 TCP 타임아웃까지 기다린다. 실측 **75.01초**, 포트 2개면 2분 30초다.
  `timeout`/`gtimeout` 바이너리는 이 환경에 없다.
- **Fix:** `port_closed()` 워치독을 추가해 8초로 유계했다. **8초 동안 SYN-ACK 도 RST 도 오지
  않았다는 것 자체가 "닫힘" 의 증거**이므로 타임아웃을 PASS 로 판정하는 것이 의미상으로도 맞다.
  열린 포트는 즉시 SYN-ACK 이 오므로(443 실측 <1초) 오판 여지가 없다.
- **Files modified:** `scripts/smoke-relay.sh`
- **Verification:** `--check-exposure` 총 소요 **160초 → 17초**, 판정은 동일(PASS/PASS)
- **Committed in:** `e6f39e5`(도입) / `c9e12b1`(전체 스모크에서 재확인)

### 계획 보강 (범위 내)

**4. [Rule 2 - 누락된 필수 기능] pull 후 AR 액세스 토큰이 디스크에 남았다**

- **Found during:** Task 3 (배포 출력의 docker 경고 — `Your password will be stored unencrypted in /root/.docker/config.json`)
- **Issue:** `relay-docker-login` 이 메타데이터 액세스 토큰을 `/root/.docker/config.json` 에 **평문**으로 남긴다.
  이미지를 이미 받은 뒤에는 붙들고 있을 이유가 없는 자격증명이다(재시작 정책은 로컬 이미지를 쓴다).
- **Fix:** `docker pull` 직후 `docker logout <registry>` 를 추가했다.
- **Files modified:** `scripts/deploy-relay.sh`
- **Committed in:** `c9e12b1`

**5. [Rule 2] `smoke-relay.sh` 에 SKIP 카운터를 추가했다**

plan 은 INV-4 만 SKIP 을 요구했지만 러너 골격(`smoke-intraday-sync.sh`)에는 SKIP 개념이 없었다.
`skip()` 함수 + 별도 카운터 + 종료 요약의 `Skipped:` 줄을 더해 "확인 안 함" 이 침묵으로 사라지지 않게 했다.

**Total deviations:** 5건 (Rule 3 × 1, Rule 1 × 2, Rule 2 × 2). 전부 자동 수정 — 아키텍처 변경 없음.

## ⚠️ 보안 사고 1건 — `gh-radar-dma-cred-key` 회전 필요 (사용자 조치)

**무슨 일이 있었나.** Task 3 검증 중 컨테이너 env 를 확인하면서
`docker inspect ... .Config.Env | grep -E 'DMA_|...'` 를 실행했다. 이 패턴이
`DMA_HOST` 뿐 아니라 **`DMA_CRED_KEY` 까지 매칭해 키 값이 실행 로그에 그대로 출력됐다.**

**노출 범위.** `gh-radar-dma-cred-key` **1종만**이다. 같은 명령의 grep 패턴이
`SUPABASE_SERVICE_ROLE_KEY` 와 `RELAY_ORDER_SECRET` 에는 매칭되지 않아 두 값은 출력되지 않았다.
값은 로컬 실행 로그에만 존재하며 커밋·문서·원격 어디에도 기록하지 않았다(이 SUMMARY 포함).

**영향 평가.** 이 키는 `dma_credentials.dma_password_enc` 의 AES-256-GCM 키다.
**`dma_credentials` 는 현재 0행**이다(`content-range: */0` 로 확인). 즉 이 키로 암호화된
데이터가 아직 하나도 없어 **실제 유출 피해는 없고, 지금이 회전 비용이 가장 싼 시점**이다.

**시도한 조치와 결과.** 회전 스크립트(새 버전 추가 → 이전 버전 disable)를 작성해 실행했으나
**권한 정책이 차단**했다 — 프로덕션 비밀 회전은 이번 실행에 승인된 범위(VM 배포) 밖이다.
우회하지 않고 사용자 조치로 넘긴다.

**필요한 조치 (사용자):**

```bash
# ① 새 키 생성 + 주입 (값을 화면에 출력하지 않는다)
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add gh-radar-dma-cred-key --data-file=-

# ② 이전 버전 비활성 (버전 번호는 아래로 확인)
gcloud secrets versions list gh-radar-dma-cred-key --filter='state=ENABLED' --format='value(name)'
gcloud secrets versions disable 1 --secret=gh-radar-dma-cred-key

# ③ 컨테이너가 새 키를 읽도록 재배포
GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://<ref>.supabase.co \
NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh

# ④ 확인
bash scripts/smoke-relay.sh
```

`dma_credentials` 가 0행이므로 ①~④ 로 재암호화나 재등록이 필요한 데이터는 없다.
**15-16(주문) 또는 관리자 자격증명 등록이 시작되기 전에 처리할 것** — 그 이후에는 회전 비용이 올라간다.

**재발 방지 (반영 완료).** `infra/relay/README.md` 에 경고를 박았다 —
컨테이너 env 확인은 값이 아니라 **키 이름만** 뽑는다:

```bash
sudo docker inspect gh-radar-relay --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1
```

## 발견 사항 — 후속 plan 에 인계

### plan acceptance 명령의 결함 1건 (리소스 문제 아님)

`grep -c '${NOTIFICATION_CHANNEL_ID}' ops/alert-relay-down.yaml` 은 파일이 정상인데도 **0** 을 반환한다.
grep 이 `${...}` 의 중괄호를 구간(interval) 표현으로 해석해 매칭에 실패하기 때문이다.
기존 `ops/alert-intraday-sync-failure.yaml`(확실히 정상인 파일)로 같은 명령을 돌려도 0 이 나오는 것으로 교차 확인했다.
**올바른 검증은 `grep -c '\${NOTIFICATION_CHANNEL_ID}'`** 이고, 그 결과는 `1` 이다.
15-07 이 발견한 gcloud 필터 함정과 같은 계열 — **acceptance 명령 자체를 의심해야 하는 경우**다.

### YAML 검증 도구가 이 환경에 없다

`python3 -c "import yaml"` 이 실패한다(PyYAML 미설치, gcloud 번들 python 도 py2 판이라 사용 불가).
이번엔 워크스페이스의 `js-yaml` 로 파싱을 검증했다. 후속 plan 이 YAML 을 만들면 같은 우회가 필요하다.

### VPN 상시 기동 여부는 여전히 미결

15-07 이 15-08 으로 넘긴 "VPN 상시 기동 결정" 은 **이번에도 미결로 남긴다.** 이유:
이번 배포의 `DMA_HOST` 가 로컬 mock 이라 VPN 이 떠 있어도 쓰이지 않고, VPN 기동은
실서버 접속 판단(D-27 · 15-20)과 묶여야 한다. 지금 상시 기동을 켜면 **아무도 쓰지 않는 터널을
KB 사내망에 계속 유지**하게 된다. 15-20 에서 실서버 접속을 결정할 때 함께 정할 것.

### 세션 인증 만료 임박 (15-07 인계 사항)

15-07 이 기록한 KB VPN 세션 인증 만료는 **2026-09-19** 다. 오늘 기준 약 13일 남았다.

## Threat Model 대응

| Threat ID | 대응 | 상태 |
|-----------|------|------|
| T-15-12 (내부 포트 공인 노출) | INV-7 이 `8091`·`9100` 을 바깥에서 실제로 두드려 **둘 다 도달 불가** 확인. 방화벽 규칙도 이름까지 대조(INV-2) | **완료 (실증)** |
| T-15-06 (내부 주문 포트 스푸핑) | 방화벽 source-range(15-06/07) + `X-Relay-Secret` 상수시간 비교(15-05) 양쪽이 모두 배포됨. 8091 은 공인망에서 도달 불가 | **완료** |
| T-15-29 (배포 명령줄 비밀 노출) | 비밀 3종을 VM 내부 tmpfs env-file 로 주입. 배포 스크립트 하드코딩 비밀 **0건**. AR 토큰도 pull 후 logout | **완료** — 단, 검증 단계의 별건 노출은 위 §보안 사고 참조 |
| T-15-08 (컨테이너 메모리 DoS) | `Memory=402653184` / `MemorySwap=805306368` inspect 확인. 로그 로테이션 10m×3. 실측 used 491MB | **완료 (실증)** |
| T-15-30 (`DMA_HOST` 오접속) | 컨테이너 env 가 `127.0.0.1`. `docker inspect` 에 KB 게이트웨이 주소 **없음**. 실서버 지정 시 경고 출력 분기 존재 | **완료 (실증)** |
| T-15-13 (인증서 만료) | uptime check `validate-ssl=true` + `gh-radar-relay-down` 알림. INV-5b 가 `-checkend 0` 로 매 실행 확인 | **완료** |
| T-15-22 (공개 `/healthz` 정보 노출) | 응답 JSON 에 `accountNo`·`userId`·`account_no`·`user_id` **부재** 확인. INV-5a 가 매 실행 재검사 | **완료 (실증)** |

## Verification

| 검증 | 결과 |
|------|------|
| `bash -n scripts/deploy-relay.sh` / `smoke-relay.sh` / `setup-relay-iam.sh` | 전부 exit 0 |
| Task 1 acceptance 8항목 | 전부 통과 (`--platform` 1 · `-f relay/Dockerfile` 1 · `--restart=always` 1 · `--memory=384m` 1 · `tunnel-through-iap` 1 · `NOTIFICATION_CHANNEL_ID` 5 · `10.41.1.120` 1(경고 분기 내) · 하드코딩 비밀 0) |
| Task 2 acceptance 10항목 | 통과 (INV-1~8 전부 존재 · `'! nc -z` 2 · `8091`/`9100`/`ens4`/`4401`/`check-isin` 전부 ≥1 · `uptime_check` 1 · 채널 ID 리터럴 0 · YAML 파싱 OK) — 단 `${NOTIFICATION_CHANNEL_ID}` grep 은 이스케이프 필요(§발견 사항) |
| Task 3 acceptance 7항목 | 전부 통과 (smoke `FAIL: 0` · nc 8091/9100 둘 다 실패 · `/healthz` 200 + 식별자 없음 · `docker ps` = `Up` · 알림 정책 1건 · env 에 실서버 주소 없음 · README 배포 상태 + SHA 기록) |
| `bash scripts/smoke-relay.sh` | **PASS 9 / FAIL 0 / SKIP 1** |
| 커밋 전 구간 파일 삭제 | 0건 |
| 산출물 비밀 값 스캔 | 0건 (SUMMARY 포함 — 노출된 값은 어디에도 기록하지 않음) |

## User Setup Required

1. **`gh-radar-dma-cred-key` 회전** — 위 §보안 사고의 ①~④ 절차. `dma_credentials` 0행이라 지금이 가장 싸다.
   **15-16(주문) 또는 자격증명 등록 시작 전에 처리할 것.**
2. **익일 `smoke-relay.sh --check-tls` 재확인** — VALIDATION §Sampling Rate 의 "배포 직후 1회 + 다음 날 1회".
   인증서 갱신 동작과 컨테이너 지속성을 본다. 결과는 STATE 에 기록.
3. **알림 임계값 튜닝 판단** — 며칠 운영 후 오탐 빈도를 보고 결정. `deferred-items.md` 참조.
   **장중 실사용 시작 전에** 판단할 것.

## Next Phase Readiness

- **15-09/15-10 이 즉시 실행 가능하다.** relay 가 떠 있고 `/healthz` 가 200 이라
  스키마·백필 작업의 검증 대상이 살아 있다. `smoke-relay.sh --check-isin` 골격이
  15-10 을 기다리고 있다(현재는 안내 후 exit 0).
- **15-16(주문 라우트)의 배포 경로가 준비됐다.** 코드가 추가되면 `deploy-relay.sh` 재실행만으로
  반영되고, 실패 시 `--rollback <이전 SHA>` 로 빌드 없이 되돌릴 수 있다.
- **15-20(실서버 검증)의 전제가 명확해졌다.** 실서버 접속은 `DMA_HOST=10.41.1.120` 을 명시 주입해야만
  일어나고, 그때 스크립트가 경고를 출력한다. VPN 상시 기동 결정도 그 시점으로 미뤘다.
- **주의:** `gh-radar-relay-down` 알림이 이제 **살아 있다.** relay 를 의도적으로 내리는 작업
  (예: 재배포 중 장시간 정지)은 알림을 유발한다. `autoClose: 1800s` 로 30분 뒤 자동으로 닫힌다.

## Self-Check: PASSED

- 생성 주장 파일 3종(`scripts/deploy-relay.sh` · `scripts/smoke-relay.sh` · `ops/alert-relay-down.yaml`) 디스크 존재 확인
- 수정 주장 파일 3종(`infra/relay/README.md` · `scripts/setup-relay-iam.sh` · `deferred-items.md`) 존재 확인
- 커밋 3건(`d54d395` · `e6f39e5` · `c9e12b1`) 전부 git 이력에 존재 확인
- 커밋 전 구간 파일 삭제 0건
- SUMMARY 비밀 값 스캔 0건

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06*
