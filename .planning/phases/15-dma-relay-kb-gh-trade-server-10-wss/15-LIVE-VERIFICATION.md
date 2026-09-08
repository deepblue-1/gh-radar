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

> **이 표는 2026-09-06 시점 판정이다(증거로 보존한다).** 그 뒤 라이브 전환(D-17 철회 · `DMA_HOST` 실 게이트웨이 · 실주문 왕복)이 일어났고, **라이브 전환 이후의 재판정은 §8 이 정본**이다 — 아래 행과 §8 이 다르면 §8 이 이긴다.

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

**해소 (quick-260908-py9, 2026-09-08).**

- 위 13개 문서에 `ROADMAP.md`(3건) 를 포함한 실측 범위 재산정 결과 **15개 파일 · 38건**이었고
  (`.planning/` 14개 + `tasks/relay-handoff.md` 1개), 전부 맨 토큰 `KB_VPN_ACCOUNT` 로 치환했다.
  저장소 전체 정규식 게이트가 **0건**이 되어 SC-8 의 "비밀 미기록" 조항이 충족됐다.
- **마스킹은 작업 트리 기준이다.** 과거 커밋 객체에는 원 문자열이 그대로 남아 있다.
- `git filter-repo` 등 **히스토리 재작성은 의도적으로 하지 않았다.** 값이 비밀번호가 아닌 계정 ID 이고,
  원격 히스토리 재작성(모든 참조 무효화·강제 push·협업자 재클론)의 비용과 리스크가 얻는 이득을 초과한다.
- 실제 접속 비밀 값은 여전히 Secret Manager 와 VM `/etc/kbvpn.env`(0600) 에만 존재한다 — 저장소에는 과거 이력에도 없다.

---

## 5. 이관되는 알려진 미해결 항목 (하나도 버리지 않는다)

| # | 항목 | 성격 | 현재 상태 / 다음 조치 |
|---|------|------|----------------------|
| 1 | `dma_credentials` **0행** → server allowlist 가 `403 DMA_NOT_ALLOWED` 로 선차단 | phase 15 범위 안, 미해소 | 이것 하나 때문에 4건이 미증명이다: relay 도달성 `409 SESSION_NOT_READY`(INV-9) · 브라우저 UI 왕복 · `dma_orders` status 전이 · `GET /api/orders` 복원. 자격증명 등록은 실계정 비밀번호를 다루므로 **사용자 실행** 필요(`scripts/dma-credentials.ts`) |
| 2 | 프로덕션 브라우저에서 호가주문 탭 미관찰 | 검증 공백 | 미인증 리다이렉트 때문. wss URL·토큰 미노출은 **코드 수준 보장**까지만 |
| 3 | `DMA_CRED_KEY` 가 실행 로그에 노출됨 — **회전하지 않기로 사용자 결정** | 수용된 리스크 | 재론하지 않는다. 근거: `dma_credentials` 0행이라 이 키로 암호화된 데이터가 없고 값이 원격으로 나간 적 없음. **자격증명 등록을 시작하기 직전에** 회전 여부를 재검토할 가치가 있다(등록 후에는 재암호화 비용 발생). 절차는 `deferred-items.md` |
| 4 | `gh-radar-master-sync` 가 **2026-06-10 이후 매일 0행** 수신 후 조용히 종료 | 선재 · phase 15 범위 밖 | `todayBasDdKst()` 가 **오늘(KST)** 날짜를 `basDd` 로 보내는데 KRX 는 그 시점에 미발행. 실측: `20260906` 0행 / `20260904` 0행 / `20260903` 943행. **§4-C 의 ISIN 42종목 결손의 근본 원인이다.** 조치: 비어 있지 않은 응답까지 거슬러 탐색 + 연속 N회 0행을 에러로 승격 |
| 5 | `public.rls_auto_enable()` 이 **CREATE 없이 REVOKE 만** 마이그레이션에 존재 | **해소 (quick-260908-qnf, 2026-09-08)** | production 에는 함수가 있어 `db push` 는 정상이나 **빈 DB 에서 이력 재생이 불가**(로컬 `db reset` · 재해복구 · 신규 스테이징이 이 지점에서 멈춘다). 조치 완료: `20260702160000_security_perf_advisor_fixes.sql` 안 REVOKE **앞**에 `CREATE OR REPLACE` 를 in-place 삽입(`a5187ce`). 일회용 컨테이너에서 35개 파일 전량 오류 0 재생 + `has_function_privilege` anon/authenticated/PUBLIC 전부 `false` 실증. `db push` 미실행 |
| 6 | 선재 E2E 실패 **11건** | **해소 (quick-260908-qnf, 2026-09-08)** | baseline 11 failed → **0**. 원인은 문서 진단과 달리 **둘**이었다: envelope 계약 7건(`4458b90`) + `CLASSIFY_PAUSED`(quick 260706-erk 이후 E2E 만 미갱신) 3건(`3e5d572`) + `auth-guards` 1건(`663bf35`). 목표 4개 스펙 29건 green |
| 7 | server 테스트 스위트 **간헐 flake 잔존** | **현 시점 재현 안 됨 (quick-260908-qnf, 2026-09-08)** | 15-20 에서 재현: 1차 실행 `tests/routes/stock-detail.test.ts` 1건 5초 타임아웃(30 files / 247 passed), **2차 실행 30 files / 248 전부 통과**. 2026-09-08 시간 상자 재계측: **3회 연속 31 files / 268 tests 전부 통과**(4.80s / 5.60s / 6.84s) — 수정 근거가 없어 `server/vitest.config.ts` 무변경. 구조(supertest 가 파일마다 임시 서버 bind/close)는 그대로이므로 재발 시 재계측 |
| 8 | `gh-radar-relay-down` 알림이 **단일 리전 순간 실패에도** 울릴 수 있음 | 튜닝 대기 | `ALIGN_FRACTION_TRUE` + `LT 1` 이라 성공률 100% 미만이면 조건 성립. `REDUCE_MEAN` + `autoClose 1800s` 로 완화돼 있다. **장중 실사용 시작 전에** `thresholdValue` 를 0.5~0.7 로 낮출지 판단할 것 |
| 9 | `server/.dockerignore` 가 실제로 적용되지 않음 | **해소 (quick-260908-qnf, 2026-09-08)** | BuildKit 이 `server/Dockerfile.dockerignore` 또는 컨텍스트 루트 `.dockerignore` 를 찾는데 둘 다 없다. `git mv` 로 `server/Dockerfile.dockerignore` · `workers/intraday-sync/Dockerfile.dockerignore` 생성 + `**/.next`(546MB)·`.vercel`·`**/.env*` 추가(`bccd89d`). builder 스테이지 직접 조회로 `.env` 0건 · `server/tests` 부재 확인, 빌드 성공 |
| 10 | 상태 바와 권한 게이트가 **같은 제목 문구** 사용 | **해소 (quick-260908-qnf, 2026-09-08)** | 상태 바 body 를 `실시간 연결을 시작하지 않았어요` 로 교체하고 게이트 카드 제목은 정본으로 유지(`18999b0`). `15-UI-SPEC.md` 에 소유처를 명시하고 회귀 단언 1건 추가. `webapp/src` 내 잔존 1곳(게이트) |
| 11 | E2E 픽스처 `webapp/e2e/fixtures/stocks.ts` 에 `isin` 부재 | **해소 (quick-260908-qnf, 2026-09-08)** | 15-14 가 타입·삼성·NULL_PRICE 를 이미 채웠고, 남아 있던 SK하이닉스·카카오의 ISIN 상속(3종목 동일 표준코드)을 실제 표준코드로 교정(`6ce5137`) |
| 12 | KB VPN 세션 인증 **14일 만료** (접속 시각 + 14일 롤링) | **해소 (quick-260908-py9, 2026-09-08)** | `kbvpn-renew.timer` = 매주 일요일 06:00 KST `OnCalendar=Sun 06:00 Asia/Seoul` 1회 발화 → `systemctl restart openconnect@kb` 로 창을 미리 민다. 저장소 정본 `infra/relay/startup.sh install_renew_timer()` + VM 실적용. 밀린 발화 따라잡기 옵션 미사용(장중 몰림 차단), 자체 재시도 없음(워치독 소관). runbook = `infra/relay/README.md` |
| 13 | 터널 IP 는 **계정 고정이 아니라 풀 할당** | 설계 가정 정정 완료 | 선검증에서 Mac `.126` / VM `.124` 동시 관측으로 반증됐다. 터널 IP 를 하드코딩·allow-list 하지 말 것. 게이트웨이 `10.41.1.120` 은 서버측 고정값이라 상수 취급 가능 |
| 14 | `.planning/` 문서에 KB VPN **계정 ID** 잔존 | §4-E | **해소 (quick-260908-py9, 2026-09-08)** — 실측 15개 파일 38건을 `KB_VPN_ACCOUNT` 로 마스킹, 저장소 전체 게이트 0건. 히스토리 재작성은 미수행(§4-E) |
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

---

## 8. 2026-09-08 재집계 — 라이브 전환 이후

> §1~§7 은 **2026-09-06 시점의 정직한 기록**이며 한 글자도 고치지 않았다. 그 뒤 실제로 라이브 전환이
> 일어났다(D-17 철회 · `DMA_HOST` 실 게이트웨이 · VPN 상시 유지 · 실주문 왕복). 이 절은 그 전환 **이후**의
> 재판정이며, §3·§4·§5 와 이 절이 어긋나면 **이 절이 정본**이다.
>
> 재판정 규칙은 §3 의 3가지를 그대로 승계한다. 추가로 **"라이브가 됐으니 다 됐다"는 추정을 쓰지 않는다** —
> 항목마다 재현 가능한 실측 출력 또는 커밋 해시를 적고, 근거를 못 대면 ⚠ 로 남긴다.
> 이 절의 실측은 **전부 읽기 전용**이다. 새 주문·코드 변경·배포·Supabase 쓰기 0건.

### 8.1 재집계 근거 (전부 읽기 전용 실측)

**`/healthz` 페이로드 해석 규칙 (재판정의 핵심 추론).** `sessionCount` 는 relay `SessionManager` 가 들고 있는
**사용자별 DMA 세션 수**(`session-manager.ts` → `#sessions.size`)이고, `dma` 는 `order-api.ts` 의
`sessionsOk = stats.sessionCount === 0 || stats.readyCount > 0` 이다. 따라서 **`dma:true` 단독은 아무것도
증명하지 않는다**(세션 0일 때도 `true`). 그러나 **`sessionCount:1` 과 `dma:true` 가 동시에 참이면
`readyCount > 0` 이 강제**되고, 상태기계가 `Idle → Connecting → LoggingIn → DeclaringAccounts → Ready`(SC-3)
이므로 **Ready 도달은 로그인 성공 + 계좌 선언 완료를 함의한다.** 또 세션은 wss 첫 메시지 인증 +
`dma_credentials` allowlist 통과 후에만 생성되므로(SC-4), `sessionCount ≥ 1` 은 **allowlist positive 경로가
실제로 열렸다**는 증거이기도 하다. 두 값은 항상 함께 읽는다.

| 근거 | 실측값 또는 커밋 | 무엇을 증명하는가 |
|------|------------------|-------------------|
| `curl -s https://dma.jx1.io/healthz` (2026-09-08 20:37 KST) | `{"status":"ok","vpn":true,"dma":true,"version":"a2c5238","sessionCount":1}` | 위 해석 규칙 적용 → **세션 1개가 Ready**. 로그인 성공 + 계좌 선언 완료 + allowlist positive 경로 개통. 2026-09-06 의 `sessionCount:0`(§2)과 결정적으로 다르다 |
| Supabase REST `dma_credentials` `count=exact` | **2행** (15-20 시점 0행) | allowlist 매핑이 운영 테이블에 실제로 등록됐다. `403 DMA_NOT_ALLOWED` 선차단이 더 이상 일어나지 않는다 |
| Supabase REST `dma_orders` `count=exact` + `select=status` | **5행** — `rejected` 3 · `accepted` 2 | 이 저장소가 만든 주문이 relay 를 통과해 **실브로커 응답까지 왕복**했다. 15-20 시점 0행 |
| `dma_orders` 비PII 상세 (`select=created_at,updated_at,status,result_code,notice_type,origin,side,order_type,qty,filled_qty`) | `2026-09-06T23:44Z` rc=**606** `R` 매수 · `2026-09-07T23:51Z` rc=**515** `R` 매수 ×2 · `2026-09-08T10:17Z` rc=**0** `E` 매수(filled 1) · 동 `10:17Z` rc=**0** `E` 매도(filled 1). `order_no` 5/5 SET · `isin` 5/5 SET · `org_order_no` 5/5 **NULL** · `origin` 5/5 `manual` | 실브로커 **응답 코드가 mock 이 아닌 실코드**(606/515/0)로 돌아온다 · `stocks.isin` 매핑이 주문 조립에 실제로 쓰였다 · 매수·매도 **양방향** 신규 주문 · **취소(`org_order_no`) 경로는 한 번도 실행되지 않았다** |
| `dma_orders` 전이 지연 (`updated_at − created_at`) | 145.7 / 77.0 / 45.8 / 87.3 / 72.1 ms — **median 77.0 ms** | 행이 insert 된 뒤 통보(`R`/`E`)로 patch 되는 **status 전이가 실제로 일어났다**. D-22 의 5초 상한 대비 약 1/60. mock 의 median 3.33 ms 는 loopback 이었고 실계통은 한 자릿수 크지만 상한 안이다 (주: 이 Δ 는 DB 측 근사이며 계측된 `OrderResp` 지연 자체는 아니다) |
| `bash scripts/smoke-relay.sh --check-isin` | **4 PASS / 0 FAIL** — 활성 주식(주권·미상장폐지) **2,717종목 / isin NULL 0종목** | §4-C 의 **ISIN 42종목 결손 해소**. ISIN-2 가 FAIL → PASS 로 뒤집혔다 |
| `f13eb7d` docs(15): D-17 철회 — DMA `user_id` 를 WinForms 와 동일하게 (2026-09-06) | 커밋 실재 | 15-20 이 "미확인"으로 남긴 **선행조건 3**(gh-radar 전용 `user_id`)이 설계째 철회됐다 → 해소가 아니라 **조건 소멸**. 웹이 WinForms 와 동일 세션에 합류한다 |
| `1ef7cc7` VPN 상시 유지 — 부팅 자동기동 + failed 회수 워치독 · `f9ca062` 재접속 상한 철회 (2026-09-06) | 커밋 실재 + `infra/relay/README.md` §현재 운영 상태 | §2 의 `inactive`+`disabled`+`타이머 0건` 실측이 무효화됐다. 현재 `openconnect@kb` = `active`+`enabled`, `kbvpn-watchdog`/`kbvpn-renew` 타이머 2개 |
| `a2c5238` healthz 의 vpn 을 회선 실측으로 (2026-09-06) | 배포 이미지 태그 = `a2c5238` = `/healthz.version` | 접속자 0명일 때 장애가 안 보이던 구멍을 **실운영에서 발견**했다 = 운영이 실제로 돌고 있다 |
| `531930e` 계좌 상태 0수량 삭제 계약 반영 — 중계 캐시·브라우저 병합 동시 수정 (2026-09-06) | 커밋 실재 | **실 게이트웨이 동작을 보고서야 알 수 있는 계약**이다. 계좌 상태 스냅샷/델타(66/67)가 실데이터로 흘렀다 |
| `fd7942b` 잔고·미체결 종목명 표시 + 전 종목 취소 — relay ISIN 역매핑 (2026-09-06) | 커밋 실재 | 잔고·미체결이 **화면에** 떠 있고 실데이터가 렌더된다 |
| `da24eec` 호가주문창 재배치 (2026-09-06) · `12bd478` 호가창 모바일 잘림 수정 (2026-09-07) | 커밋 실재 | 프로덕션 브라우저에서 호가주문 탭이 **사용자에 의해 관측**되고 있다 — 실사용 중 발견된 시각 결함의 수정이다 |
| `dd2a8cc` relay-down 알림 임계값 1.0 → 0.9 (2026-09-06) | 커밋 실재 | §5 이관 8 이 튜닝됐다 |
| `8816557` master-sync 3개월 무증상 정지 복구 — basDd 역탐색 + sweep 페이징 (2026-09-06) | 커밋 실재 + 위 ISIN 수치 | §5 이관 4 의 근본 수정 → ISIN 결손의 원인 제거 |
| `ace2f7d` docs(15-20): phase 15 종결 plan SUMMARY (2026-09-06) | 커밋 + `15-20-SUMMARY.md` 실재 | ROADMAP 의 `15-20-PLAN.md` 미체크가 사실과 다르다 |
| `infra/relay/README.md` §현재 운영 상태 · §실서버 라이브 상태 (2026-09-08 실측, quick-260908-py9) | `DMA_HOST` = **실 게이트웨이 `10.41.1.120`** · `caddy` active · 세션 인증 만료 예정 2026-09-20 | D-27 이 사용자 지시로 해제됐고 **주문 경로가 실계좌에 닿는다** |
| quick-260908-py9 · quick-260908-qnf SUMMARY | §4-E 마스킹 게이트 0건 · 선재 E2E 11 → **0** · 4개 스펙 + `orderbook.spec.ts` 동시 실행 **37 passed / exit 0** | §5 이관 5·6·7·9·10·11·12·14 종결 |

> **PLAN 기대와 어긋난 실측 1건 (실측이 이긴다).** 이 quick 의 PLAN 은 "`orderbook` 7건 재실행 기록은 없으므로
> §4-D Playwright 는 **부분** 해소"로 지시했다. 그러나 quick-260908-qnf SUMMARY 는
> *"목표 4개 스펙 + `orderbook.spec.ts` 동시 실행 최종 확인: 37 passed / exit 0"* 을 기록하고 있다 —
> `orderbook` 스펙은 실제로 재실행됐다. 따라서 §4-D Playwright 항목은 **전부 해소**로 판정한다.

> **해석하지 않고 남기는 관측 1건.** `accepted` 2건의 체결 통보 시각은 `2026-09-08T10:17Z` = **19:17 KST** 로
> 정규장·시간외 단일가 종료 이후다. **통보가 실제로 왔다는 사실만** 기록한다 — 그 체결의 성격(정규 체결인지
> 게이트웨이측 처리인지)은 이 재집계의 읽기 범위로 판정할 수 없다.

### 8.2 SC-4 ~ SC-8 재판정

**SC-1·SC-2·SC-3 은 재판정 대상이 아니다.** 2026-09-06 에 이미 ✅ 였고 그 근거(워크스페이스 등록·생성물
`--check` 무변경 / VM·고정 IP·방화벽 3규칙·VPN 선검증 기록 / 코덱·LivePing·재접속 가짜서버 테스트 202건)는
라이브 전환으로 달라지지 않는다.

| SC | 2026-09-06 판정 | 2026-09-08 재판정 | 근거 | 남은 미증명 |
|----|----------------|-------------------|------|-------------|
| **SC-4** | ⚠ 부분 충족 | **⚠ 부분 충족 유지** (3항 중 2항 해소) | allowlist positive = `sessionCount:1` ∧ `dma:true` + `dma_credentials` **2행** · 실브로커 호가 10단/체결 테이프 = `DMA_HOST` 실 게이트웨이 + `531930e`(0수량 삭제 계약) + `fd7942b` + `12bd478` | **마지막 wss 종료 5분 뒤 DMA 세션이 닫히는 것의 실시간 관측.** 상수·단위 테스트 수준 그대로 |
| **SC-5** | ⚠ 부분 충족 | **✅ 충족** | Ready 도달이 `LoginResp` 로그인 성공 + `UpdateAccountNoReq` 계좌 선언 완료를 함의(8.1 해석 규칙) · 계좌 상태 스냅샷/델타는 `531930e` 가 **실데이터를 봐야만 알 수 있는 계약**(0수량 삭제)을 반영 · 잔고·미체결 화면 표시는 `fd7942b` · D-17 전용 `user_id` 조항은 `f13eb7d` 로 **조건 소멸** | 없음 |
| **SC-6** | ⚠ 부분 충족 | **⚠ 부분 충족 유지** (6항 중 4항 해소 — 대폭 진전) | `dma_orders` **5행** 실왕복 · 실브로커 rc **606/515/0** · 전이 Δ median **77 ms** ≤ 5초(D-22) · `isin` 5/5 SET · 매수·매도 양방향 · `409 SESSION_NOT_READY` 는 15-20 로컬 실측 유지 · mock 가격 0 거부는 15-19 실측 유지 | **취소(`C`) 왕복과 `cancelled` 전이 미관측**(`org_order_no` 5/5 NULL) · **`GET /api/orders` 응답 자체 미관측**(복원 소스 5행은 존재) |
| **SC-7** | ⚠ 부분 충족 | **✅ 충족** | Playwright 재실행 완료 — qnf 가 4개 스펙 29건 + `orderbook.spec.ts` 동시 **37 passed / exit 0** · 선재 E2E 11 → **0** · 프로덕션 브라우저 관측은 `da24eec`·`12bd478`(실사용 발견 결함 수정) · 배포 번들 wss URL 은 **라이브 wss 세션이 실제로 열려 있다**(`sessionCount:1`)는 사실로 대체 증명 · Vercel env·배포 Ready 는 15-20 확인 유지 | 없음. 단 **브라우저 직접 관찰의 주체는 사용자이며 Claude 가 관측한 것은 아니다** |
| **SC-8** | ⚠ 부분 충족 (미충족 1건) | **✅ 충족** | "비밀번호 값이 문서·로그·커밋 어디에도 없음" + 계정 ID 마스킹은 quick-260908-py9 로 해소(저장소 전역 게이트 **0건**, §4-E 하단) · Dockerfile·스크립트 3종·알림 정책은 15-20 확인 유지 + `dd2a8cc` 임계값 튜닝 · **"실서버·실계좌 접속은 사용자 지시 전엔 하지 않는다" 조항은 위반이 아니라 준수**다 — 접속은 **사용자 지시로 D-27 이 해제된 뒤**에 일어났다(`infra/relay/README.md` §실서버 라이브 상태) | 없음 |

**집계 (2026-09-08):** ✅ **6** (SC-1·SC-2·SC-3·SC-5·SC-7·SC-8) · ⚠ **2** (SC-4·SC-6) · ❌ 0
*(2026-09-06: ✅ 3 · ⚠ 5 · ❌ 0)*

**요구사항 판정으로의 전달 (REQUIREMENTS.md 는 이 결론을 옮긴다).**

- **RELAY-01 → Complete.** 조항별 근거가 전부 있다: 사용자별 DMA 세션 + wss 첫 메시지 인증 + `dma_credentials`
  allowlist = `sessionCount:1` ∧ `dma:true` + 매핑 2행 / 호가 10단·체결 테이프·`AccountState` 팬아웃 = `531930e`·`fd7942b` /
  4탭 + 호가주문 탭 = `da24eec`·`12bd478` 실사용 + `stock-detail-tabs`·`orderbook` 스펙 green.
  SC-4 에 남은 ⚠(5분 유예 실관측)는 **세션 수명 관측 기록의 공백**이지 RELAY-01 이 열거한 조항의 결손이 아니다.
- **RELAY-02 → Pending 유지.** 열거 조항 중 **취소 주문 릴레이 + 취소확인(`C`) 푸시**와 **오늘 주문 목록 복원
  (`GET /api/orders`)** 두 가지에 실측 근거가 없다. 나머지(신규 매수/매도 릴레이 · `OrderResp` ≤5초 · 체결(`E`) 푸시 ·
  `dma_orders` 기록 · ISIN 매핑 · 409)는 전부 증명됐다.
- **RELAY-03 → Complete.** SC-2 는 원래 ✅, SC-8 이 이번에 ✅ 가 됐다. 다만 열거 조항의 "재시도 상한·백오프" 는
  `f9ca062`(재접속 상한 철회) + `1ef7cc7`(부팅 자동기동 + 워치독)로 **상시 유지 정책으로 대체**됐다 —
  결손이 아니라 설계 갱신이며, 정본은 `infra/relay/README.md` §VPN 조작 이다.

### 8.3 §4-A ~ §4-E 미증명 항목 재분류

| 출처 | 미증명 항목 | 재판정 | 근거 또는 남은 해소 조건 |
|------|-------------|--------|--------------------------|
| §4-A | allowlist **positive** 경로 (매핑 있는 사용자의 세션이 실제로 열린다) | **증명됨** | `dma_credentials` **2행** + `/healthz` `sessionCount:1` ∧ `dma:true` → 세션은 인증·allowlist 통과 후에만 생성되므로 positive 경로가 열렸다 |
| §4-A | 호가 10단·체결 테이프가 **실브로커 데이터**로 흐르는 것 | **증명됨** | `DMA_HOST` = 실 게이트웨이(`10.41.1.120`) + `531930e`(실데이터를 봐야 아는 0수량 삭제 계약) + `fd7942b` + `12bd478`(실사용 호가창 결함 수정) |
| §4-A | 마지막 wss 종료 **5분 뒤** DMA 세션이 닫히는 것을 실시간 관측 | **여전히 ⚠** | 관측 기록 없음. 이 quick 에서 5분 대기 관측을 새로 하지 않았다. 참고 추론: 20:37 KST 에 `sessionCount:1` 인데 마지막 주문이 19:17 KST 이므로 유예 5분으로는 설명되지 않는다 → 소켓이 아직 열려 있다는 뜻. **해소 조건:** 세션 보유자가 마지막 wss 를 닫은 시각을 특정하고 5분 뒤 `/healthz` 의 `sessionCount` 가 0 인지 확인 |
| §4-B | 실 게이트웨이가 와이어에서 `LoginResp.accounts` 를 **채워서** 보내는가 | **증명됨(추론)** | Ready 도달이 `DeclaringAccounts` 통과를 함의한다. 계좌가 비어 왔다면 선언 루프가 Ready 로 가지 못한다. 보강 근거로 `531930e` 가 실 계좌 상태 델타를 다룬다 |
| §4-B | users.toml 인증이 gh-radar **전용** `user_id` 로 동작하는가 (D-17) | **조건 소멸** | `f13eb7d` 로 D-17 이 **철회**됐다. 웹은 WinForms 와 **동일 세션에 합류**하는 것이 현재 설계다(Phase 16 의 실시간 전략 공유가 이 위에 선다). 증명된 것이 아니라 **항목 자체가 사라졌다** |
| §4-B | 잔고·미체결이 **화면에** 표시되는 것 | **증명됨** | `fd7942b` — 잔고·미체결 종목명 표시 + 전 종목 취소(relay ISIN 역매핑). 실사용 화면에서 나온 요구다 |
| §4-C | **Cloud Run → VM 8091 도달성** (`smoke-relay.sh` INV-9 = SKIP) | **증명됨 (기대값보다 강하게)** | 기대값이던 `409 SESSION_NOT_READY` 를 건너뛰고, 실제 주문 5건이 relay 를 통과해 실브로커 응답 코드를 받아 `dma_orders` 에 기록됐다. `503 RELAY_UNAVAILABLE` 은 여전히 0건 |
| §4-C | 브라우저 UI 주문 왕복 (확인 다이얼로그 → 배너 → 미체결 목록 갱신) | **증명됨 (사용자 관측)** | `dma_orders` 5행이 전부 `origin='manual'`(수기 주문 경로) · 매수/매도 양방향 · `da24eec`·`12bd478` 이 실사용 중 발견된 호가주문창 결함 수정. **Claude 가 UI 를 본 것은 아니다** |
| §4-C | `dma_orders` status 전이 (`requested → accepted/rejected/cancelled`) | **부분 증명** | `rejected` 3 · `accepted` 2 관측, insert→통보 patch Δ median 77 ms 로 전이 실증. **`cancelled` 전이는 미관측** (`org_order_no` 5/5 NULL) → SC-6 잔여로 이월 |
| §4-C | `GET /api/orders` 오늘 주문 목록 복원 (D-24) | **여전히 ⚠ (복원 소스만 확보)** | 복원 대상 5행이 실재하지만 엔드포인트 응답을 관측하지 않았다. 이 quick 은 로그인 토큰 취득이 범위 밖이고 읽기 허용 목록에도 없었다. **해소 조건:** 로그인 액세스 토큰으로 `GET /api/orders` 1회(읽기 전용) 호출해 오늘 5건이 돌아오는지 확인 |
| §4-C | 실브로커의 **응답 코드·타이밍**이 mock 과 같은가 | **증명됨 (타이밍은 근사)** | 실코드 **606**(알고리즘거래자ID 오류) · **515**(알 수 없는 거부코드) · **0**(정상) 관측 — mock 의 `rc=105` 와 다른 실계통 코드다. 타이밍은 DB insert→patch Δ **median 77 ms**(loopback mock 3.33 ms 대비 ~23배)로 D-22 의 5초 상한 안. 계측된 `OrderResp` 지연 자체가 아니라 DB 측 근사임을 명시한다 |
| §4-C | **ISIN 42종목 결손** (`--check-isin` ISIN-2 FAIL) | **해소** | `8816557`(basDd 역탐색 + sweep 페이징)로 근본 원인 제거 → 재실측 **4 PASS / 0 FAIL**, 활성 **2,717종목 / isin NULL 0** |
| §4-D | Playwright `orderbook` 7건 · `stock-detail-tabs` 9건 재실행 | **해소** | quick-260908-qnf — 목표 4개 스펙 29건 green + `orderbook.spec.ts` 동시 실행 **37 passed / exit 0**. **이 quick 의 PLAN 은 "부분 해소"를 지시했으나 실측 기록이 그 가정을 뒤집었다(§8.1 주석)** |
| §4-D | 프로덕션 브라우저에서 호가주문 탭 **직접 관찰** | **증명됨 (사용자 관측)** | `da24eec`(체결·호가·주문 순 재배치 + 호가 행 전체 클릭) · `12bd478`(모바일 잘림 수정) 은 **화면을 보지 않으면 나올 수 없는** 결함 수정이다. **관측 주체는 사용자이며 Claude 의 직접 관찰은 여전히 없다** |
| §4-D | 배포 번들에 relay wss URL 이 인라인됐는가 | **증명됨 (대체 증거)** | 번들 정적 대조 대신 **라이브 wss 세션이 실제로 열렸다**는 사실로 판정한다 — `sessionCount:1` 은 브라우저가 배포 번들의 URL 로 `wss://dma.jx1.io` 에 붙어 첫 메시지 인증까지 통과했음을 함의한다 |
| §4-D | 선재 E2E 실패 11건 | **해소** | quick-260908-qnf — baseline 11 failed → **0** (`4458b90` envelope 계약 7 + `3e5d572` `CLASSIFY_PAUSED` 3 + `663bf35` auth-guards 1) |
| §4-E | SC-8 "비밀 미기록" 조항 (`.planning/` 에 KB VPN 계정 ID 잔존) | **해소 (재확인만)** | quick-260908-py9 가 15개 파일 38건을 맨 토큰으로 마스킹, 저장소 전역 게이트 **0건**. 상세는 §4-E 하단에 이미 기록돼 있어 중복 서술하지 않는다 |

### 8.4 §5 이관 15건 상태 재집계

| # | 항목 요약 | 2026-09-08 상태 | 근거 |
|---|-----------|-----------------|------|
| 1 | `dma_credentials` 0행 → allowlist 선차단 | **해소** | `count=exact` → **2행**. 이것 하나에 걸려 있던 4건(도달성·UI 왕복·status 전이·목록 복원) 중 3건이 함께 풀렸다 |
| 2 | 프로덕션 브라우저에서 호가주문 탭 미관찰 | **해소 (사용자 관측)** | `da24eec` · `12bd478` — 실사용 중 발견된 호가주문창 결함 수정. Claude 직접 관찰은 아니다 |
| 3 | `DMA_CRED_KEY` 실행 로그 노출 — 회전 여부 | **종결 (수용된 리스크)** | **2026-09-08 사용자 재확인: 회전하지 않는다.** 자격증명이 이미 등록된 뒤이므로 "등록 직전 재검토" 조건 자체가 **소멸**했다. 재론하지 않는다 |
| 4 | `gh-radar-master-sync` 3개월 무증상 정지 | **해소** | `8816557`(basDd 역탐색 + sweep 페이징) → `--check-isin` 4 PASS, 활성 2,717 / NULL 0 |
| 5 | `rls_auto_enable()` CREATE 없이 REVOKE 만 | **해소 (재확인)** | quick-260908-qnf `a5187ce` — 일회용 컨테이너 35개 파일 전량 재생 오류 0 |
| 6 | 선재 E2E 실패 11건 | **해소 (재확인)** | quick-260908-qnf — 11 → **0** |
| 7 | server 테스트 간헐 flake | **재현 안 됨 (재확인)** | quick-260908-qnf — 3회 연속 31 files / 268 tests 통과. 재발 시 재계측 |
| 8 | `gh-radar-relay-down` 알림 과민 임계값 | **종결 (튜닝됨)** | `dd2a8cc` 로 `thresholdValue` **1.0 → 0.9**. 원 권고(0.5~0.7)보다 보수적이지만, **오경보를 실제로 관측하기 전에 더 낮추지 않는다** — 라이브 운영 중 오경보 관측 시 재조정 |
| 9 | `server/.dockerignore` 미적용 | **해소 (재확인)** | quick-260908-qnf `bccd89d` |
| 10 | 상태 바 ↔ 권한 게이트 동일 문구 | **해소 (재확인)** | quick-260908-qnf `18999b0` |
| 11 | E2E 픽스처 `isin` 부재 | **해소 (재확인)** | quick-260908-qnf `6ce5137` |
| 12 | KB VPN 세션 인증 14일 만료 | **해소 (재확인)** | quick-260908-py9 — `kbvpn-renew.timer` 주간 재접속. 다음 만료 예정 2026-09-20 |
| 13 | 터널 IP 는 계정 고정이 아니라 풀 할당 | **정정 완료** | 선검증 실측으로 반증됨. 터널 IP 하드코딩·allow-list 금지 |
| 14 | `.planning/` 에 KB VPN 계정 ID 잔존 | **해소 (재확인)** | quick-260908-py9 — 15파일 38건 마스킹, 전역 게이트 0건. 히스토리 재작성은 미수행 |
| 15 | `REQUIREMENTS.md` RELAY-01/02/03 이 `Pending` | **처리됨 (이 quick)** | §8.2 결론대로 재판정 — RELAY-01 **Complete** · RELAY-02 **Pending(잔여 2건)** · RELAY-03 **Complete** |

### 8.5 재집계 후에도 남는 것

- **SC-4 — 마지막 wss 종료 5분 뒤 세션 종료 실관측.** *닫으려면:* 세션 보유자가 브라우저를 닫은 시각을 특정하고,
  5분 경과 후 `curl https://dma.jx1.io/healthz` 의 `sessionCount` 가 `0` 인지 확인한다. 읽기 전용이며 실계좌 위험 없음.
- **SC-6 — 취소(`C`) 왕복과 `cancelled` 전이.** *닫으려면:* 장중에 체결되지 않을 지정가 1주 주문을 넣고 즉시 취소해
  `org_order_no` 가 채워진 행과 `cancelled` 전이를 관측한다. **실계좌에 주문이 나가므로 사용자의 명시 지시가 있을 때만**
  수행한다(D-20 안전 규율 §7 그대로).
- **SC-6 — `GET /api/orders` 오늘 주문 목록 복원 응답.** *닫으려면:* 로그인 액세스 토큰으로 `GET /api/orders` 를 1회
  호출해 오늘 주문이 돌아오는지 확인한다. 읽기 전용이지만 토큰 취득이 필요해 이 quick 범위 밖이었다.
- **§5-8 알림 임계값 0.9 (원 권고 0.5~0.7).** *닫으려면:* 라이브 운영 중 단일 리전 순간 실패로 인한 오경보를 실제로
  관측한 뒤 그 관측을 근거로 조정한다. 관측 없이 미리 낮추지 않는다.
- **(판정 아님, 기록만) 2026-09-08 19:17 KST 체결 통보 2건의 시각 성격.** 정규장·시간외 단일가 종료 이후 시각이다.
  통보가 왔다는 사실만 남기고 해석하지 않는다 — 필요하면 사용자가 게이트웨이 측 동작으로 확인할 사항이다.
