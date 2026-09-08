---
phase: 16
slug: trading-limit-chaser-vi-my-page
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-08
verified: 2026-09-09
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 원천: `16-RESEARCH.md` §Validation Architecture (2026-09-08 실측).
> **2026-09-09 (16-17):** Task ID·Status 열을 실행 결과로 채웠다. 전량 실측 재실행 기준이며
> 추정으로 채운 칸은 없다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.1.9 (+ @testing-library/react ^16.3.2, jsdom ^29 — webapp) · vitest (relay/server/shared) · Playwright ^1.59.1 (+ @axe-core/playwright) — E2E |
| **Config file** | 각 워크스페이스 `vitest.config.*` · `webapp/playwright.config.*` |
| **Quick run command** | `pnpm typecheck && pnpm --filter @gh-radar/relay test` (relay 작업) / `pnpm typecheck && pnpm --filter gh-radar-webapp test` (webapp 작업) |
| **Full suite command** | `pnpm typecheck && pnpm -r test && pnpm --filter gh-radar-webapp test:e2e` |
| **Estimated runtime** | 단위 ~30–60초 · E2E 전량 **2.4분 실측**(추정 5–8분보다 빠르다 — 8090 relay 포트 직렬화 필요, RESEARCH pitfall #20) |

**16-17 이 닫은 검사 사각지대 2건 — 다음 phase 도 같은 함정에 걸린다:**

| 사각지대 | 조치 |
|----------|------|
| `webapp/e2e/**` 를 **어떤 tsc 도 보지 않았다**(`tsconfig.json` 의 include 는 `src/**/*` 뿐) | `webapp/tsconfig.e2e.json` 신설 + `webapp` 의 `typecheck` 스크립트에 직접 이어 붙임 → 루트 `pnpm typecheck` 가 항상 함께 본다 |
| relay `tests/` 는 루트 `typecheck` 에서 제외돼 있다 | 별도 명령 유지: `pnpm --filter @gh-radar/relay run typecheck:tests` (**전량 검증 시 반드시 함께 실행**) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` + 해당 워크스페이스 `test` (quick run command)
- **After every plan wave:** Run `pnpm typecheck && pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green (`test:e2e` 포함 — `orderbook.spec.ts` 회귀 필수)
- **Max feedback latency:** 60 seconds (단위) / 480 seconds (E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01 T2 | 16-01-PLAN.md | 0 | TRADE-03 | — | N/A | build | `../gh-trade/server/scripts/sync-relay-schema.sh --check` exits 0 (생성 코드 동기화) | ✅ | ✅ green |
| 16-01 T2 | 16-01-PLAN.md | 0 | TRADE-01 | — | N/A | source | `test -f webapp/src/components/ui/checkbox.tsx` | ✅ | ✅ green |
| 16-02 T2 | 16-02-PLAN.md | 0 | TRADE-03 | — | N/A | fixture | `relay/tests/helpers/fake-gateway.ts` 에 `respondLimitChaserList`/`pushLimitChaserEcho`/`respondViTrigger`/`pushViOrderList`/`pushOrderResp` | ✅ | ✅ green |
| 16-04 T1 | 16-04-PLAN.md | 1 | TRADE-03 | T-16-05 | 화이트리스트 밖 MsgType 무시 | unit | `pnpm --filter @gh-radar/relay test -- codec` | ✅ | ✅ green |
| 16-04 T2 · 16-05 T2 | 16-04·16-05-PLAN.md | 1 | TRADE-03 | T-16-05 | deprecated 슬롯·위치 인자 미사용 | unit | `pnpm --filter @gh-radar/relay test -- envelope` | ✅ | ✅ green |
| 16-06 T1~T3 | 16-06-PLAN.md | 1 | TRADE-03 | T-16-02 | 스냅샷 팬아웃은 `#deliver(userId)` 단일 경로 | unit | `pnpm --filter @gh-radar/relay test -- hub` / `-- fanout` | ✅ | ✅ green |
| 16-08 T2 | 16-08-PLAN.md | 1 | TRADE-03 | T-16-01 / T-16-03 | `account_no ∈ session.allowedAccounts` · `rid` 연결 스코프 · 타임아웃 = 결과 모름 | unit | `pnpm --filter @gh-radar/relay test -- order` | ✅ 재작성 완료 (HTTP → wss) | ✅ green |
| 16-08 T1 · T3 | 16-08-PLAN.md | 1 | TRADE-03 | — | `dma_orders` insert(자동주문 origin) + update 큐 | unit | `pnpm --filter @gh-radar/relay test -- order-store` | ✅ | ✅ green |
| 16-12 T1 | 16-12-PLAN.md | 2 | TRADE-01 | — | N/A | unit | `pnpm --filter gh-radar-webapp test` (`limit-chaser.test.ts` — 수량 산출·전략 키·더티) | ✅ | ✅ green |
| 16-12 T3 | 16-12-PLAN.md | 2 | TRADE-01 | — | N/A | unit(RTL) | `pnpm --filter gh-radar-webapp test` (`limit-chaser-form.test.tsx` — 스위치 즉시·둘 다 OFF=D·수정 버튼·에코 덮어쓰기) | ✅ | ✅ green |
| 16-14 T2 | 16-14-PLAN.md | 2 | TRADE-02 | — | N/A | unit(RTL) | `pnpm --filter gh-radar-webapp test` (`vi-order-list.test.tsx` — 상태 6종·confirm_locked·데드라인) | ✅ | ✅ green |
| 16-14 T3 | 16-14-PLAN.md | 2 | TRADE-02 | — | 시작/중지 확인 다이얼로그 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- trading-vi` | ✅ | ✅ green (11 케이스) |
| 16-11 T1 | 16-11-PLAN.md | 2 | NAV-01 | — | N/A | unit(RTL) | `pnpm --filter gh-radar-webapp test` (`app-sidebar.test.tsx` — 트리·aria-current·data-nav-item) | ✅ | ✅ green |
| 16-11 T3 | 16-11-PLAN.md | 2 | NAV-01 | T-16-04 | 비로그인/`unauthorized` 시 트레이딩·My page 미렌더 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- auth-guards` | ✅ | ✅ green |
| 16-15 T3 | 16-15-PLAN.md | 2 | MYPAGE-01 | T-16-04 | 전체 비활성화 확인 다이얼로그 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- me` | ✅ | ✅ green |
| 16-10 T3 · 16-16 T3 | 16-10·16-16-PLAN.md | 2 | 회귀 | — | N/A | e2e | `pnpm --filter gh-radar-webapp test:e2e -- orderbook` (전역 연결 승격 후 호가주문 탭) | ✅ | ✅ green (REST 제거 후 재확인) |
| 16-09 T3 | 16-09-PLAN.md | 2 | 회귀 | — | N/A | unit | `pnpm --filter gh-radar-webapp test` (`relay-socket.test.ts` 재접속·백오프) | ✅ | ✅ green |
| 16-13 T3 | 16-13-PLAN.md | 2 | TRADE-01 | — | 스위치 즉시 전송 · 둘 다 OFF = `crud "D"` | e2e | `pnpm --filter gh-radar-webapp test:e2e -- trading-limit-chaser` | ✅ | ✅ green (10 케이스) |
| 16-11 T3 | 16-11-PLAN.md | 2 | NAV-01 | — | N/A | e2e | `pnpm --filter gh-radar-webapp test:e2e -- sidebar-tree` | ✅ | ✅ green |
| 16-16 T1 · T2 | 16-16-PLAN.md | 3 | TRADE-03 | T-16-11 | `POST /api/orders` · `POST /internal/orders` **부재**(404)를 단언 | unit | `pnpm --filter @gh-radar/server test -- orders` / `pnpm --filter @gh-radar/relay test -- order-api` | ✅ | ✅ green (부재 회귀 4종) |
| **16-17 T1** | **16-17-PLAN.md** | **3** | 회귀 | — | 호가 셀 비포커스 · `confirm_locked` 탭 제외 · 원 아이콘 라벨 1개 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- a11y` (신규 3표면 추가) | ✅ | ✅ green (9 케이스 — 위반 2건 잡아 수정) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**전량 실측 (2026-09-09, 16-17 Task 1):**

| 명령 | 결과 |
|------|------|
| `pnpm typecheck` (webapp e2e 포함) | ✅ 13 워크스페이스 Done |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | ✅ exit 0 |
| `pnpm -r test` | ✅ **1,909 passed** / 1 skipped / 6 todo · 189 파일 · 13 워크스페이스 |
| `pnpm --filter gh-radar-webapp test:e2e` | ✅ **126 passed** / 9 skipped / **0 failed** (2.4분) |

> 9 skipped 는 `user-themes`·`watchlist` 로, `SUPABASE_SERVICE_ROLE_KEY` 를 E2E env
> 허용목록에서 **의도적으로 뺀** 결과다(`playwright.config.ts` — 서비스롤 키가 Next dev
> 런타임에 주입되는 것을 막는 SETUP.md §3 금지 규약). 실패가 아니다.

**선행 실패 3건 — 16-17 이 원인을 밝혀 전부 제거했다.** 16-11 이 「a11y 스켈레톤 · 뉴스 목록
상한 계약 · ⌘K 단축키 회귀」로 기록하고 16-15 가 재현한 3건이다. 실제 원인은 계약 회귀가
아니라 **접근성 위반 1건 + 스펙의 경주 2건**이었다:

| 선행 실패 | 진짜 원인 | 조치 |
|-----------|-----------|------|
| `a11y` `/stocks/005930` | role 없는 `div` 에 `aria-label`(axe `aria-prohibited-attr`, serious) — 라벨이 낭독되지 않고 조용히 사라진다 | `stock-daily-chart-skeleton` 에 `role="status"` (형제 스켈레톤 3종과 같은 규약) |
| `news` 「caps list」 | h1 이 `stock?.name ?? code` 라 로딩 중에도 보인다 → 재시도 없는 `count()` 가 0 을 읽음 | 목록 컨테이너 대기 + 재시도 단언 |
| `search` ⌘K | `document.addEventListener` 가 effect 라 하이드레이션 전 dispatch 가 사라짐 | `toPass` 로 리스너가 설 때까지 재발사 |
| `news` 「refresh cooldown」(불안정으로만 기록) | `disabled = isRefreshing \|\| isCooldown` — 429 도착 전에도 disabled | `data-remaining-seconds` 를 재시도 단언으로 대기 |

---

## Wave 0 Requirements

- [x] `relay/src/generated/**` 재동기화 — `../gh-trade/server/scripts/sync-relay-schema.sh` (`cancelQtyTrackBaseline`·`orderTime` 접근자 누락, flatc 25.12.19 로컬 확인) → 16-01 T2 · `--check` 재실행 exit 0 (2026-09-09)
- [x] `webapp/src/components/ui/checkbox.tsx` — `npx shadcn add checkbox` (신규 npm 의존성 없음) → 16-01 T2
- [x] `relay/tests/helpers/fake-gateway.ts` — 전략 응답 주입 API: `respondLimitChaserList(items)` · `pushLimitChaserEcho(sock, cfg)` · `respondViTrigger(cfg)` · `pushViOrderList(sock, items, snap)` · `pushOrderResp(sock, notice)` → 16-02 T2
- [x] `webapp/e2e/fixtures/relay.ts` — `LocalRelay` 인터페이스에 위 API 노출 → 16-02 T3
- [x] `webapp/src/components/trading/__tests__/` + 공용 픽스처(에코 1건·전략 목록 3건·VI 주문 5건) → 16-12/16-14/16-15
- [x] `webapp/e2e/specs/trading-limit-chaser.spec.ts` · `trading-vi.spec.ts` · `me.spec.ts` · `sidebar-tree.spec.ts` — 스텁 → 전부 실 케이스로 채워짐 (16-11/16-13/16-14/16-15)
- [x] `relay/tests/order-api.test.ts` → wss 주문 핸들러 테스트로 재작성 → 16-08 T3, 16-16 이 라우트 **부재** 단언으로 마감
- [x] `supabase/migrations/*_dma_orders_origin.sql` (D-03 재량 채택 시) + `supabase db push` [BLOCKING] → 16-01 T3

---

## Manual-Only Verifications

> **실서버·실계좌 검증 미실시 (D-27 · Phase 15 15-20 A안 승계 · 2026-09-09 사용자 지시로 재확인).**
> 이 phase 는 **mock 검증으로 종결**한다. 아래 항목은 사용자의 **명시 지시가 있을 때만**
> 실행하며, 그때까지 「검증되지 않았다」가 이 표의 정확한 상태다 — 「통과했다」로 바꿔
> 적지 않는다. 게이트웨이 주소·실계좌 리터럴은 spec·픽스처·주석 어디에도 없다.
>
> ⚠️ **사실 정정 (2026-09-09 16-17 Task 2 실측): `dma_credentials` 는 0행이 아니라 2행이다.**
> 16-17-PLAN 과 이 문서의 이전 판이 「0행」을 근거로 삼았지만 실제로는
> `2026-09-06T00:38Z`·`2026-09-08T08:26Z` 에 생성된 행이 각각 있다(Supabase service_role
> 조회). 결론(실서버 미검증)은 그대로지만 **근거가 다르다** — 「자격증명이 없어서 못 한다」가
> 아니라 「자격증명이 있어도 D-27 상 사용자 명시 지시 없이는 하지 않는다」다. 이 차이는
> 아래 §Deployment Verification 의 relay `/healthz` degraded 관측을 설명하는 핵심이기도 하다.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WinForms ↔ 웹 「한 세션」 동기화 (웹 스위치 ON → WinForms 「무장」, WinForms 값 변경 → 웹 토스트+덮어쓰기) | TRADE-01 / TRADE-03 | 실 gh-trade 서버 + WinForms 클라이언트 필요. `dma_credentials` 0행(15-20 A안 skip-live) 상태에서는 불가 | 실서버 접속 시: WinForms 상따창과 `/trading/limit-chaser/[key]` 동시 열기 → 웹 스위치 ON → WinForms 무장 배지 확인 → WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인 |
| gh-trade mock 서버 대상 전략 왕복 (24/21/34 빈 Envelope → 60/61/73 응답) | TRADE-03 | 로컬 mock 바이너리 실행 필요 (`../gh-trade/server/scripts/run-mac.sh`) | relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인 |
| VI 마감알림 브라우저 Notification | TRADE-02 | Notification 권한은 headless 에서 실제 표시 불가 | 권한 허용 후 `vi_end_time` 임박 시 알림 표시 확인 (이 기기만) |
| 15:40 서버 자동 비활성화(61 Broadcast) 표시 | TRADE-02 | 서버 시각 의존 | 장 마감 후 VI 페이지에서 `run=false` 반영 + 로그 1줄 확인 |
| 확인 체크 잠금의 영구화 (16-14 deferred) | TRADE-02 | 서버가 그 주문에 대해 영원히 아무것도 보내지 않는 경우를 mock 으로 재현할 수 없다 | 실계좌 검증 시: 73 정정도 `confirmLocked` 도 오지 않는 행이 실제로 관측되는지 확인 (D-10 상 의도된 동작이나 실측 가치 있음) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (단위) / < 480s (E2E — 2.4분 실측)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 자동 검증 전량 green (2026-09-09, 16-17 Task 1) + 배포 3종 실행 완료
(2026-09-09, 16-17 Task 2 — 사용자 「배포 승인」). 아래 §Deployment Verification 이 정본이다.

---

## Deployment Verification (2026-09-09, 16-17 Task 2)

사용자 응답: **「배포 승인 — Claude가 배포 3종 실행」**, 실서버·실계좌 검증은 **미실시**.
순서는 의존 방향대로 **relay → server → webapp**.

### 배포 산출물

| 대상 | 산출물 | 확인 |
|------|--------|------|
| relay | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:4b6d792` · VM `radar-gw` 컨테이너 `gh-radar-relay` | 기동 직후 VM 로컬 `/healthz` 200 `{"status":"ok","vpn":true,"dma":true,"version":"4b6d792","sessionCount":0}` · 메모리 54MiB/384MiB |
| server | 이미지 `server:99fdf15` -> 리비전 `gh-radar-server-00041-nsc` -> **제거 적용 후 `gh-radar-server-00042-p78`** (100% 트래픽) | `GET /api/health` -> `{"status":"ok","version":"99fdf15"}` |
| webapp | Vercel `dpl_5Zw2zNAv5HQ9EHJsaC31fJ3WZtRw` (`gh-radar-webapp-mwxn21lpz-...`) · alias `https://gh-radar-webapp.vercel.app` 결선 | 수동 `vercel pull` -> `build` -> `deploy --prebuilt` (ignoreCommand 우회) |

### smoke 결과 (실측)

| 스모크 | 결과 |
|--------|------|
| `scripts/smoke-relay.sh` | **PASS 11 · FAIL 1 · SKIP 1** — FAIL 은 `INV-5a 공개 /healthz`(아래 §열린 항목 1) · SKIP 은 `INV-9`(`SMOKE_AUTH_TOKEN` 미설정) |
| `scripts/smoke-server.sh` (제거 적용 **전**) | PASS 14 · FAIL 1 — `INV-12c RELAY_ORDER_SECRET 바인딩 잔존` (예상된 경로: `--update-secrets` 는 병합이라 배포만으로는 안 사라진다) |
| `scripts/smoke-server.sh` (제거 적용 **후**) | 전량 통과 — **PASS 15 · FAIL 0 · SKIP 0** |

### T-16-08 — server 리비전의 relay 결선 제거 (실측 확인)

```
gcloud run services update gh-radar-server --region=asia-northeast3 \
  --remove-env-vars=RELAY_INTERNAL_URL,ORDER_TIMEOUT_MS \
  --remove-secrets=RELAY_ORDER_SECRET      -> gh-radar-server-00042-p78
```

`gcloud run services describe` 로 되읽은 `00042-p78` 의 env 이름 **17종**에 다음이 **0건**:

| 키 | 배포 전(`00040-gqw`) | 배포 후(`00042-p78`) |
|----|---------------------|---------------------|
| `RELAY_INTERNAL_URL` | 있음 (`http://10.10.0.5:8091`) | **없음** |
| `ORDER_TIMEOUT_MS` | 있음 (`5000`) | **없음** |
| `RELAY_ORDER_SECRET` | 있음 (secret 바인딩) | **없음** |

**Secret Manager 의 `gh-radar-relay-order-secret` 은 살아 있다** — `state=ENABLED` 버전 1개
확인. relay 가 `/healthz` 공유 비밀 관문에 계속 쓰므로 삭제하면 relay 부팅이 깨진다.

### 프로덕션 라우트 (신규 3표면)

| 경로 | 미인증 응답 | 판정 |
|------|-------------|------|
| `/me` | `307 -> /login?next=%2Fme` (따라가면 200) | 계약대로 |
| `/trading/vi` | `307 -> /login?next=%2Ftrading%2Fvi` (따라가면 200) | 계약대로 |
| `/trading/limit-chaser/new` | `307 -> /login?next=%2Ftrading%2Flimit-chaser%2Fnew` (따라가면 200) | 계약대로 |
| `/` | 200, `nav[aria-label="주 메뉴"]` + `data-nav-item` 렌더 | 사이드바 트리 반영 |

> 16-17-PLAN 의 acceptance 는 「프로덕션 3라우트가 200」이라고 적었지만 **미인증 200 은
> 오히려 실패**다 — 16-11 T3 의 auth-guard 계약이 비로그인에 트레이딩·My page 를 렌더하지
> 않기를 요구한다(T-16-04). 실측값 307 -> login -> 200 이 그 계약을 만족하는 정답이며, 표현을
> 「200」에서 「인증 게이트를 통과해 도달 가능」으로 정정해 기록한다. 로그인 상태의 화면
> 확인은 위 §Manual-Only 로 남는다.

### 열린 항목 1 — relay 공개 `/healthz` 가 503(degraded)이다

`INV-5a` 가 FAIL 인 유일한 항목이고, **이번 배포가 만든 회귀가 아니다.**

```
GET https://dma.jx1.io/healthz -> 503
{"status":"degraded","vpn":true,"dma":false,"version":"4b6d792","sessionCount":1}
```

원인 사슬(전부 실측):

1. `dma_credentials` 가 **2행**이다(위 사실 정정) -> 로그인 사용자가 붙으면 relay 가 그
   사용자의 DMA 세션을 만든다. 컨테이너 로그에 `userId b1e20b81...` 세션이 있다.
2. `DMA_HOST` 는 D-27 상 **로컬 mock `127.0.0.1:9100`** 인데 VM 에 그 mock 이 떠 있지 않다
   -> `connect ECONNREFUSED` 무한 재접속(백오프 30초 상한, `escalated:false`).
3. `/healthz` 판정은 `sessionsOk = sessionCount === 0 || readyCount > 0` 다(15-05 결정).
   세션 1 · Ready 0 -> `degraded` -> **503** -> uptime check 적색 -> `gh-radar-relay-down` 발화.

**회귀가 아닌 근거 2가지:**

- 판정 로직이 Phase 16 에서 **한 줄도 바뀌지 않았다** (`git diff 4734986..HEAD --
  relay/src/order/order-api.ts` 의 `healthy`/`sessionsOk` 관련 증감 0).
- 같은 상태가 **이전에도 있었다**. uptime check 3일 이력에서 100% 미만 구간은
  `2026-09-06 01:30~04:30Z`(=10:30~13:30 KST 장중, `dma_credentials` 첫 행 생성 직후)와
  이번 배포 시점뿐이다. 즉 「접속자가 있고 게이트웨이가 없으면 503」은 재발형 상시 조건이다.

**다만 이번 webapp 배포가 트리거 표면을 넓힌다.** Phase 16 이 `RelayProvider` 를 루트
레이아웃으로 올려 `enabled: user != null` 로 연결한다(신규 `webapp/src/lib/relay-provider.tsx`).
이전에는 호가주문 탭에서만 세션이 열렸지만 이제 **로그인만 하면 어느 페이지에서든** 열린다.
게이트웨이가 없는 동안에는 그만큼 503 구간이 길어진다.

**손대지 않은 이유:** 해법 후보가 전부 결정 사항이다 — (1) VM 에 mock 게이트웨이 상주,
(2) 실서버(10.41.1.120) 결선(**D-27 상 금지, 이번 사용자 지시로도 명시 배제**),
(3) degraded 판정에서 「한 번도 Ready 였던 적 없는 세션」 제외(15-05 계약 변경),
(4) 알림 정책 조정. 실행자가 단독으로 고를 문제가 아니라 사용자 결정이 필요하다
(deviation Rule 4). `deferred-items.md` §16-17 에 같은 내용을 남겼다.
