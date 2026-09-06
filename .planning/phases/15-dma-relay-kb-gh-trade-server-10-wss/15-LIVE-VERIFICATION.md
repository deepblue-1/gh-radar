# Phase 15 — 실서버 검증 결정 기록 + SC-1~SC-8 집계

> 15-20 (wave 6, phase 종결 plan). 작성·실측 2026-09-06.
> 이 문서에는 비밀 값·DMA 사용자 ID·KB VPN 계정 ID·전체 계좌번호를 기록하지 않는다.

---

## 1. Task 1 — 실서버·실계좌 검증 여부 결정 (D-27)

### 결정: **A안 `skip-live` — 실서버 검증 미수행**

| 항목 | 내용 |
|------|------|
| 결정 | **A안 (skip-live)** — 실서버(10.41.1.120)·실계좌 접속을 하지 않는다 |
| 근거 | **사용자의 명시 지시가 없다.** D-27 은 "실서버 접속과 실계좌 주문은 사용자 지시가 있을 때만"이므로, 지시 부재 시의 기본 경로는 **미수행**이다. Claude 는 이 선택을 스스로 뒤집지 않는다 |
| 결정 시각 | 2026-09-06 |
| 결과 | Task 2(실서버 검증 실행)는 **건너뜀**. phase 는 mock 검증 상태로 종료한다 |

> **이 문서는 "실서버 검증을 했다"고 읽히면 안 된다.** 아래 §2 가 접속이 실제로 일어나지
> 않았다는 것을 실측으로 남기고, §5 가 실서버 검증을 하게 되면 그때 무엇을 증명해야 하는지를
> 남긴다. §3 의 SC 집계에서 **실브로커로만 증명되는 항목은 ⚠ 로 남긴다.**

### 선행 조건 4가지의 현재 상태 (B/C안을 나중에 선택할 때의 출발점)

| # | 선행 조건 | 상태 | 근거 |
|---|-----------|------|------|
| 1 | D-03 VPN 선검증 통과 (출발지 IP 제한 없음 · 동시 세션 가능 · split-tunnel 유지) | **충족** | `15-VPN-PREFLIGHT.md` — 7항목 전부 통과, 시도 1회 / 상한 3 |
| 2 | gh-trade Phase 17 배포 (10.41.1.120 에 users.toml 배치) | **미확인** | 15-15 는 **스키마 수준**(`LoginResp.accounts`·`AccountEntry` 생성물 존재)까지만 판정했다. 실 게이트웨이 배포 상태는 gh-radar 쪽에서 확인할 수단이 없다 |
| 3 | users.toml 에 gh-radar 전용 DMA `user_id` 등록 (WinForms 값과 달라야 함 — D-17) | **미확인** | gh-trade 측 운영 절차. 값은 이 저장소에 적지 않는다 |
| 4 | `dma_credentials` 에 그 `user_id` 매핑 등록 | **미충족** | 테이블 **0행** (실측 §2) |

**즉 A안은 소극적 선택이 아니라 현재 유일하게 가능한 선택이다** — 선행 조건 4가 미충족이라
B/C안을 고르더라도 서버측 allowlist(`isDmaAllowed`)가 `403 DMA_NOT_ALLOWED` 로 끊는다.

---

## 2. Task 2 — 건너뜀. 실서버 접속이 일어나지 않았다는 실측

전부 2026-09-06 실측이다. **KB 게이트웨이에는 어떤 형태로도 접촉하지 않았다.**

| 확인 항목 | 실측 결과 | 명령 |
|-----------|-----------|------|
| VPN 유닛 상태 | `inactive` + `disabled` | `systemctl is-active openconnect@kb` / `is-enabled` |
| 터널 인터페이스 | **`tun0` 없음** (`Device "tun0" does not exist.`) | `ip -br addr show tun0` |
| 기본 경로 | `default via 10.10.0.1 dev ens4` — 터널로 넘어간 흔적 0 | `ip route show default` |
| VPN 안전장치 타이머 | `0 timers listed` (예약된 연결 절차 없음) | `systemctl list-timers 'kbvpn-*' --all` |
| relay 컨테이너 `DMA_HOST` | **`127.0.0.1`** (로컬 mock) | `docker inspect gh-radar-relay` 키 6종만 추출 |
| 컨테이너 env 안의 실서버 주소 | **0건** | `docker inspect … \| grep -c '10\.41\.1\.120'` → `0` |
| relay `/healthz` | `{"status":"ok","vpn":true,"dma":true,"version":"4ba6f83","sessionCount":0}` — **세션 0** | `curl https://dma.jx1.io/healthz` |
| `dma_credentials` 행 수 | **0** | Supabase REST `count=exact` |
| `dma_orders` 행 수 | **0** — 이 저장소가 만든 주문이 실계좌로 나간 적 없음 | Supabase REST `count=exact` |

> ⚠️ env 조회는 **키 이름 또는 지정한 키 하나만** 뽑았다. 넓은 패턴 grep 은
> `DMA_CRED_KEY` 값을 화면에 띄운다(`infra/relay/README.md` 경고 — 실제로 15-08 에서 발생).

**Task 2 acceptance 대조:** A안이므로 "건너뜀 기록 + 접속 흔적 0" 이 판정 기준이며, 위 9행이
그 근거다. 계좌번호·DMA user_id·비밀 문자열은 이 문서에 0건이다(§6 자동 검증).

---

## 3. SC-1 ~ SC-8 집계

**판정 규칙 3가지 (T-15-56).**
1. **증거 없는 ✅ 를 쓰지 않는다.** 각 행의 증거는 재현 가능한 명령 출력 또는 파일 경로다.
2. **mock·스텁으로만 증명된 것을 실서버 검증으로 쓰지 않는다.** 그런 항목은 증거 열에 `(mock)`·`(스텁)` 을 명시한다.
3. **plan 이 주장했다는 이유로 ✅ 를 주지 않는다.** 아래 ✅ 는 전부 15-20 에서 산출물을 직접 재실행하거나 조회해 확인한 것이다. 재실행하지 못한 항목은 ⚠ 로 내리고 그 이유를 적는다.

| SC | 요약 | 상태 | 증거 (2026-09-06 15-20 재실측 · 별도 표기 시 원 plan) |
|----|------|------|------|
| **SC-1** | relay 워크스페이스 등록 + 생성물 커밋 + `--check` 무변경 | **✅ 충족** | `pnpm-workspace.yaml` 에 `relay` 등재 · `relay/src/generated` **42파일**(`.ts` 41 + `StockDMA.fbs` 1) · `sync-relay-schema.sh --check` exit 0 → *"생성 41개 / 신규·변경 예정 0 / 삭제 예정 없음 / .fbs 사본 최신"* · `pnpm typecheck` exit 0 |
| **SC-2** | VM·고정 IP·방화벽 3규칙 + VPN 선검증 기록(수동 ≤3회) | **✅ 충족** | `gcloud compute instances describe radar-gw` → `RUNNING` / `e2-micro` / `canIpForward=False` · `gcloud compute addresses list` → `gh-radar-relay-ip 34.22.79.103 IN_USE`, `gh-radar-relay-internal 10.10.0.5 IN_USE` · 방화벽 **정확히 3규칙** (`443 ← 0.0.0.0/0`, `22 ← 35.235.240.0/20`, `8091 ← 10.10.0.0/26`, 포트 80 규칙 0건) · `15-VPN-PREFLIGHT.md` 7항목 통과 · **시도 1 / 상한 3** |
| **SC-3** | 프레이밍 코덱(1MB)·30초 LivePing·백오프 재접속 + 가짜 서버 소켓 증명 | **✅ 충족** | `pnpm --filter @gh-radar/relay test` **13 files / 202 tests, 0 실패** — `codec` 15 · `envelope` 57 · `fake-gateway` 12 · `dma-client` 11 · `session` 9 · `session-manager` 8. 기준 자체가 "vitest 가짜 서버 소켓 테스트로 증명"이므로 이 증거로 충족된다 |
| **SC-4** | wss 첫 메시지 인증 + allowlist + 구독/200ms 배치 + 5분 유예 | **⚠ 부분 충족** | **증명됨:** `smoke-relay.sh` **INV-6 PASS** — 운영 `wss://dma.jx1.io` 에 대해 4401 × 2(5초 미인증 close · 인증 전 sub close) 실측 · `credentials` 15 · `fanout` 12 · `hub` 12 tests · `TAPE_BATCH_MS = 200` (`relay/src/hub/subscription-hub.ts:78`, `:582` 에서 사용) · `SESSION_GRACE_MS = 300_000` (`relay/src/dma/session-manager.ts:33` + `config.ts:84` 기본값). **미증명:** ↓ §4-A |
| **SC-5** | 계좌 전부 선언 + 계좌 상태 스냅샷/델타 팬아웃 | **⚠ 부분 충족** | **증명됨:** `account-declare` 8 · `account-state` 8 tests(가짜 게이트웨이) · 재동기화 게이트는 **스키마 수준**으로 해소 — `--check` 무변경 + `relay/src/generated/stock-dma/login-resp.ts` 의 `accounts()`/`accountsLength()` · `account-entry.ts` 존재. **미증명:** ↓ §4-B |
| **SC-6** | `POST /api/orders` 왕복 + 체결·취소 wss 푸시 + `dma_orders` + 409 + mock 가격 0 거부 | **⚠ 부분 충족** | **증명됨:** `server test` 30 files / **248** 중 `tests/routes/orders.test.ts` **27건** · relay `order-api` 25 · `order-store` 10 · `15-MOCK-ORDER-EVIDENCE.md` 와이어 실측(접수 `A` / 거부 `R` rc=105 / 취소 `C`, 첫 통보 median **3.33 ms**) · **가격 0 은 층1 server zod 에서 400** 으로 막히고 층2·3 이 독립 판정, 층4 mock 브로커는 가드 우회 직송 시 rc=105 (mock) · `409 SESSION_NOT_READY` 는 **로컬 relay 직접 호출**에서 실측 · 운영 `POST/GET /api/orders` 미인증 **401**(smoke-server INV-10·11 PASS) · `stocks.isin` **2,764행**. **미증명:** ↓ §4-C |
| **SC-7** | 4탭 재구성 + 호가주문 탭 + Playwright wss 왕복 + Vercel env | **⚠ 부분 충족** | **증명됨:** `pnpm --filter webapp test` **45 files / 380 passed (1 skipped)** — phase 15 UI **87건**(`orderbook` 섹션 13 · `relay-socket` 16 · `order-panel` 19 · `account-panel` 12 · `orderbook-ladder` 8 · `relay-status-bar` 10 · `trade-tape` 9) · E2E 스펙 존재·케이스 수 `orderbook.spec.ts` **7** · `stock-detail-tabs.spec.ts` **9** · `vercel env ls` → `NEXT_PUBLIC_RELAY_WS_URL` **Production + Preview 양쪽 등재** · `vercel inspect` → `dpl_JBH7qdf4Spzwo9eSBQpcN8sbgmxF` `target=production` `● Ready` · 토큰 비노출은 코드 수준 확정(`use-relay-socket.ts:408` `new WebSocket(url)` + `:415` 첫 메시지로 토큰 송신). **미증명/미재실행:** ↓ §4-D |
| **SC-8** | Dockerfile + 3스크립트 + 알림 정책 + VM 문서(비밀 미기록) + **실서버 금지** | **⚠ 부분 충족** | **증명됨:** `relay/Dockerfile` + `Dockerfile.dockerignore` 존재 · `setup-relay-iam.sh`·`deploy-relay.sh`·`smoke-relay.sh` 존재 + `bash -n` 전부 PASS(추가로 `deploy-server.sh`·`smoke-server.sh`·VPN 래퍼 3종·`startup.sh`·`dev.sh` 도 PASS) · 알림 정책 **live 조회** `projects/gh-radar/alertPolicies/7995724305267722560` `enabled=True` · `smoke-relay.sh` **11 PASS / 0 FAIL / 2 SKIP** · `smoke-server.sh` **14 PASS / 0 FAIL** · `infra/relay/README.md` 존재 · **실서버 접속 0** (§2 의 9행). **미충족 1건:** ↓ §4-E |

**집계:** ✅ 3 (SC-1·SC-2·SC-3) · ⚠ 5 (SC-4·SC-5·SC-6·SC-7·SC-8) · ❌ 0

---

## 4. ⚠ 항목 — 무엇이 남았고 어떤 조건에서 해소되는가

### §4-A. SC-4 미증명

| 미증명 | 왜 | 해소 조건 |
|--------|-----|-----------|
| allowlist **positive** 경로(매핑 있는 사용자의 세션이 실제로 열린다) | `dma_credentials` **0행**. 운영에서 확인된 건 negative 경로(매핑 없음 → `unauthorized`)뿐이다. E2E 7케이스는 **스텁 Supabase**(`webapp/e2e/fixtures/relay.ts` — 매핑 on/off 를 스텁이 결정)로 양쪽 경로를 돈다 — 스텁이지 운영 테이블이 아니다 | `dma_credentials` 행 1개 등록 → 그 사용자로 wss 접속 |
| 호가 10단·체결 테이프가 **실브로커 데이터**로 흐르는 것 | 지금까지 흘린 데이터는 전부 mock 게이트웨이 / E2E 스텁 게이트웨이 산 | 실서버 검증(B안 이상) |
| 마지막 wss 종료 **5분 뒤** DMA 세션이 닫히는 것을 실시간으로 관측 | 상수·단위 테스트로만 확인. 운영 인스턴스에서 5분 대기 관측을 하지 않았다 | 세션이 실제로 열린 뒤 소켓 종료 → 5분 후 `sessionCount` 재확인 |

### §4-B. SC-5 미증명

15-15-SUMMARY 가 스스로 **[미검증]** 으로 표기한 항목을 그대로 이관한다.

| 미증명 | 왜 |
|--------|-----|
| 실 게이트웨이가 와이어에서 `LoginResp.accounts` 를 **채워서** 보내는가 | 판정은 전부 스키마·생성코드 수준이었다. 와이어 관측 없음 |
| users.toml 인증이 gh-radar 전용 `user_id` 로 동작하는가 (D-17 세션 합류 방지) | gh-trade 측 배포·설정. gh-radar 에서 확인 불가 |
| 잔고·미체결이 **화면에** 표시되는 것 | 세션이 Ready 에 도달한 적이 없다 |

해소 조건: 선행 조건 2·3·4 충족 + B안 이상.

### §4-C. SC-6 미증명

| 미증명 | 왜 | 해소 조건 |
|--------|-----|-----------|
| **Cloud Run → VM 8091 도달성** (`smoke-relay.sh` INV-9 = SKIP) | `POST /api/orders` 는 relay 를 부르기 **전에** allowlist 를 지난다. `dma_credentials` 0행이라 `403 DMA_NOT_ALLOWED` 로 끊겨 relay 까지 가지 않는다. **실패가 아니라 미측정**이다 — `503 RELAY_UNAVAILABLE` 은 한 번도 나오지 않았고 설정 근거(부팅 시 relay 클라이언트 구성 성공 · env 3종 결선 · 방화벽 8091 서브넷 허용)는 전부 확인됐다 | 자격증명 행 1개 + 로그인 토큰 → `SMOKE_AUTH_TOKEN=<access_token> bash scripts/smoke-relay.sh`. **기대값 409 `SESSION_NOT_READY`** (503 이면 env 미주입 또는 방화벽 문제) |
| 브라우저 UI 주문 왕복 (확인 다이얼로그 → 배너 → 미체결 목록 갱신) | 로그인 세션 + allowlist 통과가 전제. 배너 렌더 자체는 15-18 이 컴포넌트 테스트로 검증했고, 그 분기에 들어가는 **입력값**은 15-19 가 rc=105 로 확정했다 | 위와 동일 |
| `dma_orders` status 전이 (`requested → accepted/rejected/cancelled`) | 테이블 **0행**. 기록은 server 가 relay 를 부르기 전에 insert 하고 결과로 patch 하는데, 그 경로가 allowlist 앞에서 끊긴다 | 위와 동일 |
| `GET /api/orders` 오늘 주문 목록 복원 (D-24) | 위와 같은 이유 | 위와 동일 |
| 실브로커의 **응답 코드·타이밍**이 mock 과 같은가 | 측정한 지연(median 3.33 ms)은 **loopback** 값이다. VPN + 실 게이트웨이 구간은 별도 측정 대상이며, D-22 의 5초 상한이 실계통에서도 타당한지는 미확인 | 실서버 검증(C안) |
| **ISIN 42종목 결손** — `smoke-relay.sh --check-isin` **ISIN-2 FAIL** | 활성 주식(주권·미상장폐지) **2,749종목 중 isin NULL 42종목**(커버리지 98.5%). 그 42종목은 `stocks.isin` 조회가 비어 주문 조립 자체가 불가하다. 잔존 예: `008500 일정실업`·`012510 더존비즈온`·`031440 신세계푸드`·`032980 바이온`·`043090 더테크놀로지`. ISIN-1·3a·3b 는 PASS(컬럼 존재·길이 12·형태 무결) | 근본 원인은 `gh-radar-master-sync` 결함(↓ §5 항목 4). `basDd` 탐색 로직 수정 후 재동기화 |

### §4-D. SC-7 미증명 / 15-20 에서 재실행하지 못한 것

| 항목 | 상태 | 이유 |
|------|------|------|
| Playwright `orderbook` 7건 · `stock-detail-tabs` 9건 | **15-20 에서 재실행 안 함** — 15-11/15-14 의 실행 기록에 의존 | 이 worktree 에 `webapp/.env.local` · `.env.test.local` 이 없다. 비밀 파일은 worktree 로 복사하지 않는 규율이며, 복사해서 통과시키는 것은 검증이 아니라 우회다. 스펙 파일 존재·케이스 수는 정적으로 확인했다 |
| 프로덕션 브라우저에서 호가주문 탭 **직접 관찰** | **미수행** | 미인증 시 `/stocks/005930?tab=orderbook` → `/login?next=%2Fstocks%2F005930%3Ftab%3Dorderbook` 로 리다이렉트(실측 http=200 at `/login`). 로그인 없이는 관찰 불가 |
| 배포 번들에 relay wss URL 이 인라인됐는가 | **이 경로로는 확인 불가** | 위 리다이렉트 때문에 받을 수 있는 청크가 로그인 화면 22개뿐이고, 거기엔 `dma.jx1.io` 가 0건이다(예상된 결과 — 호가창 코드는 종목상세 청크에 있다). Vercel env 등재와 배포 Ready 는 확인했고, 개행 오염 부재·번들 바이트 동일성은 오케스트레이터가 별도 대조했다. **이 문서 자체로는 코드 수준 보장까지만이다** |
| 선재 E2E 실패 11건 | **잔존** | `discussions` 10건(픽스처가 구계약 배열 반환) + `auth-guards` 1건(Phase 13 이후 `/` 동작 변경). 둘 다 phase 15 무관 선재 — `deferred-items.md` 기록 |

### §4-E. SC-8 미충족 1건 — "비밀 미기록" 조항

**`.planning/STATE.md:344` 에 KB VPN 계정 ID 문자열이 남아 있다.**

- 비밀번호가 아니라 **계정 ID** 다. 그러나 `15-VPN-PREFLIGHT.md` 가 스스로 세운 규율이
  *"접속 비밀 값·계정 ID·서버 주소·인증서 핀을 기록하지 않는다"* 이고, SC-8 의 문구도
  "비밀번호 값은 문서·로그·커밋 어디에도 없음"이다. **문자열 자체는 규율 위반이다.**
- 범위: `.planning/` 기획 문서 **13개** (`STATE.md` · `ROADMAP.md` · `REQUIREMENTS.md` ·
  `15-CONTEXT.md` · `15-RESEARCH.md` · `15-PATTERNS.md` · `15-DISCUSSION-LOG.md` ·
  `15-VALIDATION.md` · `15-05/06/07/19/20-PLAN.md`). discuss/research/plan 단계에서 들어갔다.
- **이 plan 에서 제거하지 않은 이유:** `STATE.md`·`ROADMAP.md` 는 오케스트레이터 소유라
  이 executor 가 쓰지 않는다. 나머지도 확정된 기획 산출물이라 종결 plan 이 임의 편집할 대상이 아니다.
- **이관:** 별도 quick task 로 13개 문서에서 계정 ID 문자열을 마스킹할 것.
  실제 비밀번호 값은 어디에도 없다(Secret Manager `gh-radar-kb-vpn-...` + VM `/etc/kbvpn.env` 0600 에만 존재).
- 참고: 이 문서(`15-LIVE-VERIFICATION.md`)와 `infra/relay/README.md` 는 **0건**이다(§6).

---

## 5. 이관되는 알려진 미해결 항목 (하나도 버리지 않는다)

| # | 항목 | 성격 | 현재 상태 / 다음 조치 |
|---|------|------|----------------------|
| 1 | `dma_credentials` **0행** → server allowlist 가 `403 DMA_NOT_ALLOWED` 로 선차단 | phase 15 범위 안, 미해소 | 이것 하나 때문에 4건이 미증명이다: relay 도달성 `409 SESSION_NOT_READY`(INV-9) · 브라우저 UI 왕복 · `dma_orders` status 전이 · `GET /api/orders` 복원. 자격증명 등록은 실계정 비밀번호를 다루므로 **사용자 실행** 필요(`scripts/dma-credentials.ts`) |
| 2 | 프로덕션 브라우저에서 호가주문 탭 미관찰 | 검증 공백 | 미인증 리다이렉트 때문. wss URL·토큰 미노출은 **코드 수준 보장**까지만 |
| 3 | `DMA_CRED_KEY` 가 실행 로그에 노출됨 — **회전하지 않기로 사용자 결정** | 수용된 리스크 | 재론하지 않는다. 근거: `dma_credentials` 0행이라 이 키로 암호화된 데이터가 없고 값이 원격으로 나간 적 없음. **자격증명 등록을 시작하기 직전에** 회전 여부를 재검토할 가치가 있다(등록 후에는 재암호화 비용 발생). 절차는 `deferred-items.md` |
| 4 | `gh-radar-master-sync` 가 **2026-06-10 이후 매일 0행** 수신 후 조용히 종료 | 선재 · phase 15 범위 밖 | `todayBasDdKst()` 가 **오늘(KST)** 날짜를 `basDd` 로 보내는데 KRX 는 그 시점에 미발행. 실측: `20260906` 0행 / `20260904` 0행 / `20260903` 943행. **§4-C 의 ISIN 42종목 결손의 근본 원인이다.** 조치: 비어 있지 않은 응답까지 거슬러 탐색 + 연속 N회 0행을 에러로 승격 |
| 5 | `public.rls_auto_enable()` 이 **CREATE 없이 REVOKE 만** 마이그레이션에 존재 | 선재 · phase 15 범위 밖 | production 에는 함수가 있어 `db push` 는 정상이나 **빈 DB 에서 이력 재생이 불가**(로컬 `db reset` · 재해복구 · 신규 스테이징이 이 지점에서 멈춘다). 조치: `pg_get_functiondef` 덤프를 `CREATE OR REPLACE` 보정 마이그레이션으로 커밋 |
| 6 | 선재 E2E 실패 **11건** | 선재 · phase 15 범위 밖 | `discussions` 10건(`{items,hasMore}` 계약 대 배열 픽스처) + `auth-guards` 1건(Phase 13 D-07 이후 `/` 가 공개 홈이 되어 단언이 낡음) |
| 7 | server 테스트 스위트 **간헐 flake 잔존** | 선재 · 완화됨 | 15-20 에서 재현: 1차 실행 `tests/routes/stock-detail.test.ts` 1건 5초 타임아웃(30 files / 247 passed), **2차 실행 30 files / 248 전부 통과**. `keepAlive=false` 근본 수정 이후에도 supertest 가 파일마다 임시 서버를 bind/close 하는 구조가 남아 있다 |
| 8 | `gh-radar-relay-down` 알림이 **단일 리전 순간 실패에도** 울릴 수 있음 | 튜닝 대기 | `ALIGN_FRACTION_TRUE` + `LT 1` 이라 성공률 100% 미만이면 조건 성립. `REDUCE_MEAN` + `autoClose 1800s` 로 완화돼 있다. **장중 실사용 시작 전에** `thresholdValue` 를 0.5~0.7 로 낮출지 판단할 것 |
| 9 | `server/.dockerignore` 가 실제로 적용되지 않음 | 선재 · phase 15 범위 밖 | BuildKit 이 `server/Dockerfile.dockerignore` 또는 컨텍스트 루트 `.dockerignore` 를 찾는데 둘 다 없다. 멀티스테이지라 최종 이미지는 무해하나 builder 레이어·빌드 캐시에 `.env` 가 남는다. relay 쪽은 15-05 가 `Dockerfile.dockerignore` 로 해결 |
| 10 | 상태 바와 권한 게이트가 **같은 제목 문구** 사용 | UI 사소 | `실시간 호가·주문 권한이 없어요` 가 두 곳. 문구 정본을 모으려면 UI-SPEC 갱신 필요 |
| 11 | E2E 픽스처 `webapp/e2e/fixtures/stocks.ts` 에 `isin` 부재 | 알려진 경계 | 15-14 가 relay 픽스처로 호가 경로를 따로 덮었다. 탭 회귀 단언은 존재 여부만 본다 |
| 12 | KB VPN 세션 인증 **14일 만료** (선검증 시점 기준 2026-09-19) | 운영 정책 미설계 | 상시 운용 시 재인증 주기 설계 필요 |
| 13 | 터널 IP 는 **계정 고정이 아니라 풀 할당** | 설계 가정 정정 완료 | 선검증에서 Mac `.126` / VM `.124` 동시 관측으로 반증됐다. 터널 IP 를 하드코딩·allow-list 하지 말 것. 게이트웨이 `10.41.1.120` 은 서버측 고정값이라 상수 취급 가능 |
| 14 | `.planning/` 13개 문서에 KB VPN **계정 ID** 잔존 | §4-E | 마스킹 quick task |
| 15 | `REQUIREMENTS.md` 의 RELAY-01/02/03 이 여전히 `Pending` | 판단 필요 | **이 plan 은 바꾸지 않았다.** SC-4~SC-8 이 ⚠ 인 상태에서 `Complete` 로 올리는 것은 증거와 어긋난다. 실서버 검증 또는 최소한 자격증명 등록 후 재판정할 것 |

> **해소됨(기록만 남긴다):** `packages/shared` 의 `THEME_STOCK_SOURCES` 테스트 선재 실패는
> `2206bb1 fix(shared): theme source tuple 테스트를 3멤버 현행 계약에 맞춤` 으로 해결됐다.
> 15-20 재실행 결과 shared **8 files / 99 tests 전부 통과**.

---

## 6. 15-20 자체 검증

| 검사 | 결과 |
|------|------|
| `pnpm typecheck` (전 워크스페이스) | **exit 0** |
| `pnpm build` (전 워크스페이스) | **exit 0** |
| `pnpm --filter @gh-radar/relay test` | 13 files / **202** passed |
| `pnpm --filter @gh-radar/server test` | 30 files / **248** passed (1차 실행은 선재 flake 1건 — §5-7) |
| `pnpm --filter webapp test` | 45 files / **380** passed, 1 skipped |
| `pnpm --filter @gh-radar/shared test` | 8 files / **99** passed |
| `pnpm --filter @gh-radar/master-sync test` | 4 files / **36** passed |
| `bash scripts/smoke-relay.sh` | **11 PASS / 0 FAIL / 2 SKIP** (INV-4 VPN 수동 유닛 · INV-9 토큰 필요) |
| `bash scripts/smoke-server.sh <prod-url>` | **14 PASS / 0 FAIL / 0 SKIP** |
| `bash scripts/smoke-relay.sh --check-isin` | 3 PASS / **1 FAIL** (ISIN-2 — §4-C) |
| `sync-relay-schema.sh --check` | exit 0 · 무변경 |
| 인증서 **익일 재확인** (발급 2026-09-05 → 확인 2026-09-06) | `subject=CN=dma.jx1.io` · `issuer=C=US, O=Let's Encrypt, CN=YE1` · `notAfter=Dec 4 13:17:20 2026 GMT` |
| 이 문서 + `infra/relay/README.md` 비밀 패턴 grep | **0건** |

**재현 명령 (요약):**

```bash
# 스키마 정합
RELAY="$PWD/relay" bash /Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check

# 단위 테스트
pnpm --filter @gh-radar/relay test && pnpm --filter @gh-radar/server test \
  && pnpm --filter webapp test && pnpm --filter @gh-radar/shared test

# 인프라 불변식 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 workers/master-sync/.env 에서 자동 해석)
bash scripts/smoke-relay.sh
bash scripts/smoke-relay.sh --check-isin
bash scripts/smoke-server.sh "$(gcloud run services describe gh-radar-server \
  --region=asia-northeast3 --format='value(status.url)')"

# 실서버 미접속 확인
gcloud compute ssh radar-gw --zone=asia-northeast3-a --tunnel-through-iap \
  --command='systemctl is-active openconnect@kb; ip route show default; \
             sudo docker inspect gh-radar-relay \
               --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -c "10\.41\.1\.120"'
# 기대: inactive / default … dev ens4 / 0
```

---

## 7. 나중에 실서버 검증(B/C안)을 하게 되면 — 그때 증명해야 할 것

A안을 골랐다고 이 목록이 사라지지 않는다. **아래는 지금 미증명 상태로 남아 있는 항목이며,
실서버 검증은 이 항목들을 하나씩 증거로 바꾸는 작업이다.**

**선행(순서 지킬 것):**
1. gh-trade Phase 17 이 `10.41.1.120` 에 배포됐고 users.toml 이 배치됐다 — 사용자 확인.
2. users.toml 의 gh-radar 전용 DMA `user_id` 가 **WinForms 값과 다르다**(D-17). 값은 사용자에게만 확인하고 문서·로그·커밋에 적지 않는다. 같으면 게이트웨이가 세션을 합류시켜 전략 상태·계좌 범위가 섞인다.
3. `dma_credentials` 매핑 등록(`scripts/dma-credentials.ts`).
4. VPN 기동 직후 **`ip route show default` 가 `ens4` 인지** 먼저 확인. 깨졌으면 즉시 중단(T-15-11). 연결 명령과 관측 명령은 별도 SSH 호출로 분리하고, 무조건 정지 데드맨 타이머를 먼저 예약한다.

**B안(시세만)에서 증명되는 것:**
- `LoginResp.accounts` 가 실제로 채워져 오는가 → SC-5 §4-B
- 계좌 선언 루프가 실 응답으로 Ready 에 도달하는가 → SC-5
- 호가 10단·체결 테이프의 **실데이터 형식 차이** (`change_sign` · `exchange_time` 형식 · 벡터 길이) → SC-4
- allowlist positive 경로 + 5분 유예 실관측 → SC-4 §4-A
- `GetAccountStateReq` 응답의 실제 필드(계좌번호는 **뒤 4자리만** 기록) → SC-5

**C안(최소 주문 1건)에서 추가로 증명되는 것:**
- `OrderResp` 실응답 코드·타이밍이 D-22 의 5초 상한 안인가 → SC-6
- 접수(`A`) → 즉시 취소 → 취소확인(`C`) 왕복, **체결 0건** → SC-6
- `dma_orders` status 전이(`requested → accepted → cancelled`) → SC-6 §4-C
- 체결·취소 통보가 **주문자 wss 로만** 푸시되는가 → SC-4/SC-6
- `GET /api/orders` 목록 복원 → SC-6

**C안 안전 규율 (D-20 — 서버측 금액·수량 한도가 없으므로 절차로만 방어한다):**
- 최소 수량 **1주** + **체결되지 않을 지정가**(매수면 시장 최저 호가보다 훨씬 낮게).
- 접수 확인 즉시 취소. **체결시키지 않는다.** 이상 징후가 하나라도 보이면 즉시 중단하고 보고.
- 장중에만 가능.
- 검증 후 `DMA_HOST` 를 mock 으로 되돌릴지 실서버로 둘지 **사용자에게 확인**한다.

**기록 규율:** 접속 시각 · 터널 IP · 계좌 수 · 호가/체결 실측 차이 · (C안) 주문 왕복 · `dma_orders`
전이 · 되돌림 여부를 이 문서에 추가한다. **비밀번호·DMA user_id·전체 계좌번호는 기록하지 않는다.**
