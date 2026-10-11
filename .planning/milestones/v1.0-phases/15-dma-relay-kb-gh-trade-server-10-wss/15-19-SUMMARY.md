---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 19
subsystem: infra
tags: [cloud-run, gce, docker, deploy-script, smoke-test, dma, orders, flatbuffers, secret-manager]

# Dependency graph
requires:
  - phase: 15-18
    provides: "주문 UI (결과 3분류 배너 — 접수 / 결과 모름 / 거부)"
  - phase: 15-17
    provides: "server `POST·GET /api/orders` + `relay-client.ts` 응답 3분류"
  - phase: 15-16
    provides: "relay `POST /internal/orders` + `buildDirectOrderReq` + `parseOrderResp`"
  - phase: 15-08
    provides: "`deploy-relay.sh` / `smoke-relay.sh` INV-1~8 / 가동 중인 relay 컨테이너"
  - phase: 15-05
    provides: "relay 프로세스 본체 · `X-Relay-Secret` 관문 · 로컬 mock 실행 절차"
provides:
  - "`deploy-server.sh` — `RELAY_INTERNAL_URL`·`ORDER_TIMEOUT_MS` env + `RELAY_ORDER_SECRET` secret 주입 + **배포 후 env 20종 대조 게이트**"
  - "`deploy-server.sh` — relay 주문 비밀 accessor 를 server 런타임 SA 에 멱등 바인딩"
  - "`smoke-server.sh` — INV-10/11(주문 라우트 미인증 401) · INV-12(relay env 결선 + 기존 env 잔존) + SKIP 카운터"
  - "`smoke-relay.sh` — INV-9(Cloud Run→VM 도달성, **에러코드 기준 3갈래 판정**) · INV-10(dma_orders service_role 성공 / anon 차단)"
  - "실제 재배포 — relay `4ba6f83` · server `2bf2c0a`(리비전 `gh-radar-server-00038-kc6`)"
  - "`15-MOCK-ORDER-EVIDENCE.md` — mock 브로커 주문 왕복 4케이스 + 가격 0 거부 층 확정"
affects: [15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "파괴적 검사는 러너 맨 끝에 둔다 — 한도 소진이 성공 조건인 검사는 뒤 검사를 오염시킨다"
    - "도달성 판정은 상태코드가 아니라 **에러코드**로 한다 — 같은 403 이 서로 다른 층에서 나온다"
    - "`--set-env-vars` 전량 치환은 배포 후 **필수 키 목록 대조**로 감시한다 (배포 성공 ≠ 설정 온전)"
    - "측정할 수 없는 것은 PASS 가 아니라 SKIP 으로 남긴다 — 미측정과 통과는 다른 사실이다"
    - "일회용 검증 하네스는 저장소에 남기지 않고, 재현 절차와 sentinel 만 문서에 남긴다"

key-files:
  created:
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-MOCK-ORDER-EVIDENCE.md
  modified:
    - scripts/deploy-server.sh
    - scripts/deploy-relay.sh
    - scripts/smoke-server.sh
    - scripts/smoke-relay.sh
    - infra/relay/README.md

key-decisions:
  - "INV-9 를 상태코드가 아니라 error.code 로 판정한다 — `DMA_NOT_ALLOWED`(403, allowlist 에서 끊김)와 `ACCOUNT_NOT_ALLOWED`(403, relay 가 답함)를 상태코드로는 구분할 수 없어, 플랜 원문대로 403 을 PASS 로 세면 relay 에 닿지도 못한 요청이 도달성 증거로 둔갑한다"
  - "도달성 미측정을 SKIP 으로 남기고 PASS 로 위장하지 않는다 — `dma_credentials` 0행이라 인증 요청도 relay 이전에서 끝난다. 자격증명 등록은 실계정 비밀번호를 다루므로 15-20 소관"
  - "파괴적 INV-8(rate limit 소진)을 스모크 맨 끝으로 이동 — 번호는 유지. 번호를 바꾸면 기존 SUMMARY·README 의 INV 참조가 전부 어긋난다"
  - "가격 0 검증만으로는 부족하다고 판단해 sentinel 수량 105 를 추가 측정 — 가격 0 은 층1 에서 막혀 브로커에 닿지 않으므로 '거부가 화면까지 오는가'를 증명하지 못한다"
  - "relay 주문 비밀 accessor 바인딩을 `deploy-server.sh` 에 추가 — server 런타임 SA(default compute)에 접근권이 없어 `--update-secrets` 리비전이 기동하지 못하는 상태였다"
  - "`dma_credentials` 에 임시 행을 만들어 도달성을 측정하지 않는다 — allowlist 테이블에 대한 프로덕션 쓰기는 이 plan 의 인가 범위 밖이다"

patterns-established:
  - "3갈래 판정(PASS/FAIL/SKIP)이 필요한 프로브는 판정 문자열을 뱉고 호출부가 분기한다 — bool 반환 프로브에 억지로 담으면 '모름'이 '통과'로 접힌다"
  - "배포 스크립트는 배포 직후 **이름 목록만** 읽어 설정을 대조한다 (값은 출력하지 않는다)"

requirements-completed: [RELAY-02, RELAY-03]

# Metrics
duration: 78min
completed: 2026-09-06
---

# Phase 15 Plan 19: 주문 경로 결선 + mock 왕복 실측 Summary

**relay·server 를 재배포해 Cloud Run 에 주문 릴레이 env 를 결선하고(env 17→20, 소실 0), mock 브로커로 접수·거부·취소 왕복을 실측해 가격 0 이 `server zod`(층1)에서 막힌다는 것과 거부 통보가 rc=105 로 화면 분기까지 온다는 것을 확정했다.**

## Performance

- **Duration:** ~78분
- **Tasks:** 3/3
- **Commits:** 6
- **Files modified:** 5 (신규 1 · 수정 4)

## Accomplishments

| 산출물 | 내용 |
|--------|------|
| `deploy-server.sh` | relay env 2종 + secret 1종 주입 · 전량 치환 경고 주석 · **배포 후 필수 env 20종 대조 게이트** · relay 비밀 accessor 멱등 바인딩 · 선행 secret 검증 |
| `smoke-server.sh` | INV-10/11(주문 라우트 미인증 **401**) · INV-12a/b/c(relay env·secret 바인딩·기존 env 잔존) · SKIP 카운터 · 파괴적 INV-8 위치 이동 |
| `smoke-relay.sh` | INV-9(Cloud Run→VM 도달성, 에러코드 3갈래 판정) · INV-10a/b(`dma_orders` service_role 성공 / **anon 차단**) |
| `deploy-relay.sh` | uptime check **갱신** 경로 gcloud 플래그 수정 (재배포에서 처음 드러난 버그) |
| 재배포 2건 | relay `4ba6f83` · server `2bf2c0a` (리비전 `gh-radar-server-00038-kc6`) |
| `15-MOCK-ORDER-EVIDENCE.md` | 주문 왕복 4케이스 + 가격 0 거부 **층 확정** + 로그 비밀 미노출 실측 |

## Task 1 — 배포 스크립트 결선 + smoke 확장 (`4ba6f83`)

`--set-env-vars` 는 **추가가 아니라 교체**다. 그래서 env 를 하나 넣는 일이 "문자열에 한 항목
추가"로 끝나지 않는다 — 기존 항목이 하나라도 빠지면 재배포마다 조용히 초기화되고, gcloud 는
그걸 성공으로 보고한다. 경고 주석만으로는 다음 사람이 같은 실수를 반복하므로 **배포 직후
리비전에서 이름 목록을 읽어 필수 20종을 대조하고, 하나라도 없으면 `exit 1`** 하는 단계를 넣었다.
값은 출력하지 않는다 — 비밀이 아닌 `RELAY_INTERNAL_URL` 만 예외인데, 그 값이 맞는지가 주문 경로
진단의 첫 단서이기 때문이다.

**실측으로 드러난 선행 결손 하나** (Rule 2): `gh-radar-relay-order-secret` 의 IAM 바인딩이
`gh-radar-relay-sa` **하나뿐**이었다. Cloud Run server 는 default compute SA 로 도는데
`setup-relay-iam.sh` 는 relay SA 만 챙긴다 — 그대로 `--update-secrets` 를 붙였다면 리비전이
secret 을 못 읽고 기동에 실패했을 것이다. 기존 안전망 루프(Kiwoom·Naver·Bright Data)와 같은
형태로 멱등 바인딩을 추가했다.

## Task 2 — 재배포 + 결선 검증 (`2bf2c0a` · `784d1a5` · `c7153dc` · `5d62223`)

**결과: 두 스모크 모두 `FAIL: 0`. env 17 → 20, 감소 0. 내부 포트는 여전히 닫혀 있다.**

| 검증 | 결과 |
|------|------|
| `smoke-server.sh` | **PASS 14 / FAIL 0 / SKIP 0** |
| `smoke-relay.sh` | **PASS 11 / FAIL 0 / SKIP 2** (INV-4 VPN 수동 유닛 · INV-9 아래) |
| env 대조 | 17 → 20. `SUPABASE_URL`·`ANTHROPIC_API_KEY`·`DISCUSSION_CLASSIFY_ENABLED(false)` 전부 잔존 |
| `POST·GET /api/orders` 미인증 | **401** (라우트 결선 + 인증 관문) |
| INV-7 재확인 | `8091`·`9100` 둘 다 여전히 공인 차단. 방화벽 3규칙 유지, **포트 80 규칙 0건** |
| INV-10 | `dma_orders` service_role 조회 성공 · **anon 차단** (RLS 회귀 없음) |
| relay 클라이언트 부팅 | 기동 로그에 `RELAY_… not set` 경고 0건 → 사설 대역 가드(10.10.0.0/26) 통과 |
| `DMA_HOST` | `127.0.0.1` 유지 — 실서버 미접속 (D-27) |

### 그 과정에서 고친 것 2건

**① `deploy-relay.sh` uptime check 갱신 경로가 죽어 있었다** (`2bf2c0a`).
`gcloud monitoring uptime update` 는 반복 필드라 `--status-classes` 가 아니라
`--set-status-classes` 를 받는다. 15-08 은 **최초 생성**이라 create 갈래만 탔고, 이 갈래는
재배포에서 처음 돌았다. `set -e` 라 여기서 죽으면 컨테이너는 새 이미지로 이미 떠 있는데
uptime check·알림 정책만 갱신되지 않은 채 스크립트가 끝난다 — 조용한 감시 공백이다.

**② 새로 넣은 INV-10/11 이 429 로 FAIL 했다** (`784d1a5`).
원인은 주문 라우트가 아니라 **검사 순서**였다. INV-8 은 `/api` 전역 한도(200/60s) 소진이
곧 성공 조건인데, 한도는 라우트 전체에 걸린다. 게다가 리미터는 인스턴스 메모리에 있고
Cloud Run 인스턴스가 최대 3대라 240건이 몇 대에 흩어지느냐에 따라 뒤 검사가 **어느 날은
통과하고 어느 날은 실패한다** — 기존 INV-9 가 우연히 통과하고 있었던 것도 같은 이유다.
파괴적 검사를 맨 끝으로 옮기고(번호는 유지), 왜 위치가 번호보다 중요한지를 주석에 남겼다.

### ⚠️ 플랜 acceptance 1건 미충족 — `POST /api/orders` 409 미관측 (`c7153dc`)

플랜은 "인증 토큰 포함 `POST /api/orders` → **409 `SESSION_NOT_READY`**" 를 도달성 증거로
요구했다. **관측하지 못했고, 그 이유는 실패가 아니라 구조다.**

`POST /api/orders` 는 relay 를 부르기 **전에** allowlist 를 지난다 — `dma_credentials` 행
존재 여부다(D-12). 이 테이블은 현재 **0행**이라, 유효한 토큰이 있어도 요청이
`403 DMA_NOT_ALLOWED` 로 끊겨 **relay 까지 가지 않는다.**

여기서 플랜 스펙의 결함이 하나 드러났다. 플랜은 INV-9 판정을 "503 이 아닌 응답(409/403/200)"
으로 정의했는데, **403 은 두 층에서 나온다**:

| error.code | 어느 층 | 도달성에 대한 의미 |
|------------|---------|-------------------|
| `DMA_NOT_ALLOWED` (403) | server allowlist | relay **미도달** — 아무것도 모른다 |
| `ACCOUNT_NOT_ALLOWED` (403) | relay 세션 계좌 목록 | relay 가 답했다 — **도달했다** |

플랜대로 403 을 뭉뚱그려 PASS 로 셌다면 **relay 에 닿지도 못한 요청이 도달성 증거로 둔갑**해
초록불이 켜졌을 것이다. 그래서 INV-9 을 상태코드가 아니라 **에러코드 기준 3갈래**
(reachable / unreachable / 판정 불가)로 다시 짰고, 현재 상태를 **SKIP** 으로 남겼다.

**대신 확인한 것** — `503 RELAY_UNAVAILABLE` 은 한 번도 나오지 않았고, 설정 측 근거는 전부
확보했다: 부팅 시 relay 클라이언트 구성 성공(사설 대역 가드 통과) · env·secret 결선 ·
방화벽 8091 서브넷 허용 · **로컬 relay 에서 같은 요청이 정확히 409 `SESSION_NOT_READY` 를
돌려준다는 실측**(증거 문서 §5-④). 남은 것은 VPC 구간 한 홉이다.

재측정은 `dma_credentials` 행 1개 + 로그인 토큰이 있으면 한 줄이다:
`SMOKE_AUTH_TOKEN=<access_token> bash scripts/smoke-relay.sh`

## Task 3 — mock 브로커 왕복 실측 (`257cf75`)

로컬 mock(`127.0.0.1:9100`, `[broker] name="mock"`)에 **relay 의 실제 와이어 코드**
(`envelope.ts`/`codec.ts`, 테스트 스텁 아님)로 붙어 측정했다. 실서버·실계좌·VPN 미접속.

### ★ 가격 0 은 어느 층에서 막히는가

| 층 | 위치 | 결과 |
|----|------|------|
| **층1** | server zod `OrderPostBody` | **거부** — `path="price" code="too_small"` → 400 |
| 층2 | relay zod `OrderRequestSchema` | 거부 — 400 `VALIDATION_FAILED` |
| 층3 | relay `buildDirectOrderReq` | 거부 — `OrderBuildError BAD_PRICE` |
| 층4 | mock 브로커 | (도달 시) 거부 — `R` rc=105 `"호가가격 Format 오류"` |

**정상 경로에서 실제로 막는 것은 층1이다.** 층2·3 이 같은 판정을 독립적으로 내리므로
server 를 우회한 relay 직접 호출도 같은 곳에서 멈춘다.

그리고 여기서 플랜이 예상하지 못한 사실이 나왔다 — **가격 0 으로는 "거부가 화면까지 오는가"를
검증할 수 없다.** 층1이 먼저 막아 브로커에 영원히 닿지 않기 때문이다. 층4 의 거부 능력 자체는
가드를 우회한 raw 프레임으로 따로 실증했지만(rc=105 확인), 그것은 정상 경로가 아니다.

그래서 mock 이 **정확히 이 목적으로** 둔 두 번째 훅을 썼다 — `kRejectSentinelQty = 105`.
가격·종목·계좌가 전부 정상이라 층1~3 을 통과하고 브로커에서만 거부되는, **정상 경로로 도달
가능한 유일한 브로커 거부 갈래**다.

### 왕복 4케이스

| 케이스 | 실측 |
|--------|------|
| ① 정상 주문 | `A` rc=0 `mock_accepted` → `E` rc=0 `mock_filled` — 같은 주문번호로 **2건** |
| ② 브로커 거부(sentinel 105) | `R` rc=105 `"mock_rejected 호가가격 Format 오류"` · **`orderNo` 빈 문자열**(접수 전 거부라 번호 미발급) |
| ③ 취소 | `C` rc=0 · 새 주문번호 + `orgOrderNo` 승계 · **`sideTrusted=false`** |
| ④ relay HTTP 관문 | 비밀 없음/틀림 **둘 다 401 동일 응답** · 가격 0 → 400 · 세션 없음 → **409** |

**왕복 지연** (loopback, 표본 10건): 송신 → 첫 통보 `min 1.87ms / median 3.33ms / max 4.50ms`.
D-22 의 5,000ms 대기 상한은 3자릿수 배수의 여유가 있다.

**두 가지가 실측으로 확인됐다.**
`sideTrusted=false` — 취소 통보의 `side` 는 `"B"` 로 채워져 오지만 요청에 매매구분이 담기지
않아 브로커가 지어낸 값이다(Pitfall 8). 그대로 그리면 매도 취소가 "매수"로 표시된다.
`orderNo` 빈 문자열 — 거부 통보만으로는 `order_no` 로 행을 찾을 수 없다. 15-16 이 상관
셀렉터를 `id → order_no` 순으로 둔 이유가 여기서 확인된다.

### 로그에 비밀이 남지 않는가 (T-15-04)

relay 로컬 로그 전량 대조 — `RELAY_ORDER_SECRET`·`DMA_CRED_KEY`·`SERVICE_ROLE_KEY` 값
**평문 0건**, `password` 문자열 **0건**. 대신 남기는 것: 401 은 **`hasHeader` 불리언**,
400 은 **위반 필드 이름(`["price"]`)만**(바디에 계좌번호가 있으므로), 409 는 계좌번호
**`377285****` 마스킹**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 누락된 필수 기능] relay 주문 비밀 accessor 미바인딩**
- **Found during:** Task 1
- **Issue:** `gh-radar-relay-order-secret` IAM 바인딩이 `gh-radar-relay-sa` 하나뿐. Cloud Run server 는 default compute SA 로 돌아 secret 을 읽을 수 없다 — `--update-secrets` 를 붙인 리비전이 기동에 실패했을 상태
- **Fix:** `deploy-server.sh` 에 멱등 바인딩 루프 + 선행 존재 검증 추가 (기존 Kiwoom/Naver/Bright Data 안전망과 동형)
- **Commit:** `4ba6f83`

**2. [Rule 1 - 버그] `deploy-relay.sh` uptime check 갱신 경로 gcloud 플래그 오류**
- **Found during:** Task 2 (relay 재배포 1차 시도)
- **Issue:** `gcloud monitoring uptime update` 는 `--set-status-classes` 를 받는데 `--status-classes` 를 넘겨 `set -e` 로 중단. 15-08 은 create 갈래만 타서 드러나지 않았다
- **Fix:** update 갈래만 `--set-status-classes` 로 교정 + 왜 create 와 다른지 주석
- **Commit:** `2bf2c0a`

**3. [Rule 1 - 버그] 파괴적 INV-8 이 뒤 검사를 오염**
- **Found during:** Task 2 (신규 INV-10/11 이 429 로 FAIL)
- **Issue:** INV-8 은 `/api` 전역 한도 소진이 성공 조건인데 한도가 라우트 전체에 걸린다. 리미터가 인스턴스 메모리라 Cloud Run 3대 분산에 따라 **비결정 실패**가 된다
- **Fix:** 파괴적 검사를 러너 맨 끝으로 이동(번호 유지) + 위치가 번호보다 중요한 이유 주석
- **Commit:** `784d1a5`

**4. [Rule 1 - 안전성] INV-9 판정 기준이 거짓 초록불을 낼 수 있었다**
- **Found during:** Task 2
- **Issue:** 플랜이 지정한 "403 이면 PASS" 는 `DMA_NOT_ALLOWED`(relay 미도달)와 `ACCOUNT_NOT_ALLOWED`(relay 도달)를 구분하지 못한다 — relay 에 닿지도 못한 요청이 도달성 증거가 된다
- **Fix:** 상태코드가 아닌 `error.code` 기준 3갈래(reachable/unreachable/판정 불가) 판정으로 재작성
- **Commit:** `c7153dc`

### 플랜과 다르게 한 판단

**5. 가격 0 외에 sentinel 수량 105 를 추가 측정**
플랜은 가격 0 으로 거부 경로를 검증하라고 했지만, 실측 결과 가격 0 은 층1에서 막혀 **브로커에
도달하지 못한다**. 가격 0 만으로는 "거부 통보가 화면까지 오는가"를 증명할 수 없어, mock 이
같은 목적으로 둔 sentinel 수량으로 정상 경로 브로커 거부를 함께 측정했다. 플랜이 요구한
"어느 층에서 거부됐는지 기록"은 4층 전부를 개별 측정해 충족했다.

**6. `dma_credentials` 임시 행을 만들지 않았다**
도달성(INV-9) 측정에는 allowlist 행이 필요하지만, **프로덕션 allowlist 테이블에 대한 쓰기는
이 plan 의 인가 범위 밖**이다. 미측정을 SKIP 으로 남기고 15-20 에 인계했다.

## Known Gaps

| 항목 | 이유 | 인계 |
|------|------|------|
| Cloud Run → VM 8091 도달성 (`409 SESSION_NOT_READY`) | `dma_credentials` 0행 → allowlist 에서 403 으로 끊김 | 15-20 |
| 브라우저 UI 왕복 (배너 실물·확인 다이얼로그·미체결 갱신) | 로그인 세션 필요. 배너 렌더는 15-18 이 검증, 입력값은 이 plan 이 확정 | 15-20 |
| `dma_orders` status 전이 · `GET /api/orders` 복원 (D-24) | 위와 같은 전제 | 15-20 |
| relay `202 ORDER_TIMEOUT` 갈래 | mock 은 즉답이라 5초 초과를 만들 수 없다. 계약은 코드·단위시험이 지킨다 | — |

네 항목 모두 **공통 전제 1개**(`dma_credentials` 행 1개 + 로그인 토큰)로 한 번에 해소된다.

## Verification

- `bash -n` × 4 스크립트 — exit 0
- `smoke-server.sh` → **PASS 14 / FAIL 0 / SKIP 0**
- `smoke-relay.sh` → **PASS 11 / FAIL 0 / SKIP 2**
- `nc -z -w3 <공인IP> 8091` → 실패(닫힘 유지)
- 증거 문서 — `10.41.1.120` 0건 · 비밀 패턴 0건 · 실계좌 전체번호 0건 · `가격 0` 9회

## Self-Check: PASSED

- `scripts/deploy-server.sh` FOUND · `scripts/deploy-relay.sh` FOUND · `scripts/smoke-server.sh` FOUND · `scripts/smoke-relay.sh` FOUND
- `infra/relay/README.md` FOUND · `15-MOCK-ORDER-EVIDENCE.md` FOUND
- 커밋 6건 전부 존재: `4ba6f83` `2bf2c0a` `784d1a5` `c7153dc` `5d62223` `257cf75`
