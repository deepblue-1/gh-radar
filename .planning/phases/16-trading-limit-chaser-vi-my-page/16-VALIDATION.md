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
| **Full suite command** | `pnpm typecheck && pnpm -r test && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp test:e2e` |
| **⚠️ 필터 이름 정정 (16-26 실측)** | 이 표의 이전 판과 phase 문서 88곳이 인용한 `--filter gh-radar-webapp` 은 **어떤 프로젝트에도 매치되지 않는다**. `webapp/package.json` 의 이름은 `@gh-radar/webapp` 이고 `gh-radar-webapp` 은 이 파일 이력에 존재한 적이 없다. pnpm 은 `No projects matched the filters` 를 찍고 **exit 0** 으로 끝나므로 그 명령은 **절대 실패할 수 없는 검증**이었다. 위 명령이 정본이다. |
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

### 열린 항목 1 (2026-09-09 16-26 에서 해소) — relay 공개 `/healthz` 가 503(degraded)이었다

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


---

## Gap Closure (16-18 ~ 16-26)

`16-VERIFICATION.md` 갭 4건 + `16-REVIEW.md` Critical 1 · Warning 9 = **14건**을 사용자가
범위로 명시 확정했고, 9개 plan(16-18 ~ 16-26)이 전부 닫았다. Info 7건은 범위 밖이다
(§deferred-items 참조).

| ID | 담당 plan | 무엇을 바꿨는가 | 회귀를 잠근 명령 |
|----|-----------|-----------------|------------------|
| **G1** (gap 1, BLOCKER) — `dma_orders` 감사 기록 결손 + 테넌트 간 쓰기 | 16-18 | `OrderLookupSink` 를 `(userId, orderNo)` 로 좁히고 KST 당일 `created_at` 범위 필터 추가 · `maybeSingle()` 제거 · `selectorOf` 가 `userId` 없으면 `null` 반환(드롭+error) · 부분 UNIQUE 인덱스 `idx_dma_orders_user_order_no_kst_day` **프로덕션 적용 완료**(migration `20260909120000`) | `pnpm --filter @gh-radar/relay test -- order-store` (가짜 `SupabaseClient` 주입으로 **적용된 필터와 영향 받은 행**을 단언 — 스텁 대체 금지) |
| **G2** (gap 2) — 통보 상관이 ISIN 단일 축이라 결과가 오귀속된다 | 16-22 | `narrowPending()` 다축 상관(ISIN + `orgOrderNo` + `price` + `quantity` + `qty`). **좁히기에 실패하면 「오래된 것」 폴백 없이 미정산**으로 남긴다 | `pnpm --filter @gh-radar/relay test -- order` |
| **G3** (gap 3) — 킬 스위치가 단절 시 무로그 no-op | 16-19 | `send()` 를 `=> boolean` 계약으로 바꾸고 미연결 시 `console.error` 1줄(`msg.t` 만 — 계좌번호 미포함) · 단절 중에는 킬 스위치를 **누를 수 없다** · 전송 실패·ack 미수신이 화면에 드러난다. 계획에 없던 `vi-settings-card` 「수정」 버튼의 같은 구멍도 함께 막았다 | `pnpm --filter @gh-radar/webapp test -- relay-socket` |
| **G4** (gap 4) — 프로덕션 relay `/healthz` 503 상시화 | 16-21 (코드) · **16-26 (배포·실측)** | 판정축을 `sessionCount === 0 \|\| readyCount > 0` → `everReadyCount === 0 \|\| readyCount > 0` 으로 이동(사용자 확정 해법 ③). 「한 번도 Ready 인 적 없는 세션」은 장애가 아니고, 「Ready 였다가 죽은 세션」은 여전히 503 | `pnpm --filter @gh-radar/relay test -- order-api` (⑧ / ⑧-b / ⑧-c) + **아래 §Deployment Verification (2026-09-09, 16-26) 프로덕션 실측** |
| **CR-01** — 호가주문 탭 계좌 패널이 「마지막 수신 계좌」를 그린다 | 16-23 | `account`(마지막 수신 계좌) 필드를 **relay 계약에서 통째로 제거**했다. 소비자는 전부 `accountStates` + 선택 계좌를 읽는다 — 값을 고르는 규칙을 고치는 대신 잘못된 축 자체를 없앴다 | `pnpm --filter @gh-radar/webapp test -- relay-socket orderbook` |
| **WR-01** — `recordUnmatched` 조회↔insert 사이 in-flight 가드 부재 | 16-18 | `` `${userId}|${orderNo}` `` 키 in-flight Promise 로 감쌌다. `closeConn`/`close` 는 `inflight` 을 건드리지 않는다 | `pnpm --filter @gh-radar/relay test -- order-store` |
| **WR-02** — 중복 주문 가드가 연결 스코프라 두 번째 탭에서 무력 | 16-22 | 가드를 **사용자 스코프**로 승격 | `pnpm --filter @gh-radar/relay test -- order` |
| **WR-03** — 브라우저가 시장 구분을 `'K'` 로 추정 (D-28 위반) | 16-25 | `lc.set` 의 시장 소유권을 relay 로 이관 — `RelayLcSetSchema.cfg` 에서 `market` 삭제(브라우저가 실어 보내도 `z.object` 가 떨어뜨린다), fanout 이 `symbols.lookup(isin)` 으로 푼다. 못 풀면 거부. 검색 결과의 `isPickable` 한 지점이 `disabled` 와 `onClick` 가드를 함께 읽는다 | `pnpm --filter @gh-radar/relay test -- envelope protocol` · `pnpm --filter @gh-radar/webapp test -- limit-chaser` |
| **WR-04** — `webapp/src/lib/orders-api.ts` 가 죽은 코드 | 16-20 | 모듈 삭제 + `server/src/errors.ts` 의 사실과 다른 주석 정정 | `pnpm typecheck` (임포터 0건이므로 삭제가 곧 증명) |
| **WR-05** — `dma_orders.origin` 을 쓰기만 하고 읽는 경로가 없다 | 16-20 | `ORDER_COLS`·`DmaOrderRow` 에 `origin` 추가 → `GET /api/orders` 응답에 실린다 | `pnpm --filter @gh-radar/server test -- dma-orders` |
| **WR-06** — 발주가 0 · 수량 0 인 전략을 「매수 켜짐」으로 무장 가능 | 16-25 | `gateBlocked(key, next)` 단일 판정을 스위치 `disabled` 와 `toggleGate` 전송 가드가 함께 읽는다. **끄기(`next === false`)는 무장 조건을 보지 않는다** — 무장 해제를 막으면 사용자의 자산을 인질로 잡는다. relay 쪽에도 같은 거부를 걸었다 | `pnpm --filter @gh-radar/webapp test -- limit-chaser` · 상따 E2E 12/12 |
| **WR-07** — VI 주문금액에 상한 없음 (ulong 감쌈) | 16-24 | `MAX_VI_ORDER_AMOUNT_KRW` 단일 정본을 zod · envelope 조립기 · UI **세 층**에 같은 값으로 걸었다. 입력은 상한으로 자르고 **이유를 문장으로 남긴다**(조용히 삼키지 않는다) | `pnpm --filter @gh-radar/relay test -- envelope protocol` · `pnpm --filter @gh-radar/webapp test -- vi-settings-card` |
| **WR-08** — 사이드바 ISIN→종목명 역매핑만 `account` 를 읽는다 | 16-23 | 역매핑 사본 3개를 `webapp/src/lib/isin-labels` 공용 훅으로 통합 | `pnpm --filter @gh-radar/webapp test -- isin-labels` |
| **WR-09** — 종료 절차 `flushNow()` 가 진행 중 플러시와 겹치면 큐를 안 비운다 | 16-24 | 진행 중 플러시를 **await** 하고 재큐잉분까지 최대 3라운드 소진 · 상한 도달 시 남은 큐 길이를 `logger.error` 로 남긴다 | `pnpm --filter @gh-radar/relay test -- order-store` (⑮⑯⑰) |

**전량 재실행 결과 (2026-09-09, 16-26 Task 1 — 배포 전 게이트):**

| 명령 | 결과 |
|------|------|
| `pnpm typecheck` | exit 0 · 13 워크스페이스 |
| `pnpm -r test` | exit 0 · **189 파일 / 1,970 passed · 1 skipped · 6 todo** (16-17 기준선 1,909 → **+61**) |
| ↳ shared + relay + server + webapp 만 | **1,354** (99 · 351 · 252 · 652) — 검증 시점 기준선 **1,293 초과** |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | 최초 실행 **error TS 14건** → 수정 후 exit 0 (아래 참조) |
| `pnpm --filter @gh-radar/webapp test:e2e` | **126 passed · 9 skipped · 0 failed** (5.5분) |

**relay `tests/` typecheck 가 16-25 의 경계를 잡았다.** `buildSetLimitChaserReq` 가
`RelayLimitChaserInput & { market }` 로 좁혀졌는데 `envelope.test.ts` 의 픽스처 `lcInput()` 은
`market` 을 담은 채 반환형이 `RelayLimitChaserInput` 이었다. **vitest 는 형을 보지 않으므로
relay 351 green 이 이 결함을 가리고 있었다** — 루트 `typecheck` 밖에 있는 이 명령을 함께
돌려야 하는 이유가 실측으로 증명됐다 (16-26 `2cb5620`).

**D-27 게이트의 정확한 상태.** 16-26-PLAN 의 acceptance
`grep -rn "10\.41\.1\.120" relay/ webapp/src webapp/e2e scripts/` **0건**은 애초에 만족
불가능한 조건이었다. 실측 17건의 내역:

| 위치 | 건수 | 성격 |
|------|------|------|
| `webapp/src` · `webapp/e2e` | **0** | ✅ 스펙·픽스처·클라이언트 코드에 게이트웨이 주소 없음 |
| `relay/README.md:17` · `relay/src/dma/link-health.ts:20` | 2 | 산문·주석 (README 는 **접속 금지 경고문** 자체) |
| `scripts/deploy-relay.sh:96,416` | 2 | 실서버 주소가 주입되면 **경고를 띄우는 가드**와 안내문 |
| `scripts/dma-tunnel.sh` · `scripts/dma-tunnel.ps1` | 13 | **다른 세션(quick 260909-el9)의 미추적 파일** — phase 16 소관 아님 |

D-27 의 실질(실서버 접속 **코드** 0건 · 스펙·픽스처 0건)은 유지된다. 리터럴 0건이 아니라
**접속 경로 0건**이 정확한 계약이다.

---

## Deployment Verification (2026-09-09, 16-26 Task 2)

사용자 응답: **「배포 승인 — Claude 가 3종 실행」**. 순서는 의존 방향대로
**relay → server → webapp** 고정. 배포 커밋 `2cb5620`.

**순서가 고정인 이유(실제 위험).** 16-25 가 `RelayLcSetSchema.cfg` 에서 `market` 을 삭제했다.
**새 webapp + 옛 relay** 조합이면 `market` 없는 `cfg` 가 옛 스키마의 필수 필드 검증에 걸려
`lc.set` 이 통째로 드롭된다. 역방향(**새 relay + 옛 webapp**)은 안전하다 — 새 스키마는
`.strict()` 가 아니므로 옛 브라우저가 실어 보내는 `market` 을 조용히 stripped 하고 relay 가
ISIN 으로 다시 푼다. 그래서 relay 가 먼저다.

### 배포 산출물 (실측)

| 대상 | 산출물 | 확인 |
|------|--------|------|
| relay | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:2cb5620` (digest `sha256:ea99242c…`) · VM `radar-gw` 컨테이너 `gh-radar-relay` | 기동 직후 VM 로컬 `/healthz` 200 `{"status":"ok","vpn":true,"dma":true,"version":"2cb5620","sessionCount":1,"everReadyCount":0}` · 63.56MiB/384MiB · `DMA_HOST=127.0.0.1`(로컬 mock, D-27) |
| server | `server:2cb5620` → 리비전 **`gh-radar-server-00043-s4f`** (100% 트래픽) | 배포 스크립트 `env 항목 17개 (필수 17종 대조)` 통과 |
| webapp | **`dpl_6Uwsjm3qT7WnKrhFmMPDt73Bz9C9`** (`gh-radar-webapp-pfw9qh4dq-…`) · alias `https://gh-radar-webapp.vercel.app` + `…-git-master-…` 결선 · created 2026-09-09 11:51:18 KST | **Vercel git 통합이 자동 배포했다** — 16-17 이 수동 배포로 우회해야 했던 `ignoreCommand` skip 문제는 `b691b15` 로 이미 고쳐져 있었다 (아래 §webapp 배포 경로) |

### webapp 배포 경로 — 수동 CLI 가 아니라 git 통합이었다

`vercel pull` / `vercel build` 는 이 실행 환경의 권한 정책에 막혔다. 그래서 **이미 라이브인
배포본이 갭 클로징 코드를 담고 있는지**를 먼저 확인했고, 담고 있었다.

근거 4겹:

1. **프로덕션 번들 내용 실측 (가장 강한 근거).** 루트 레이아웃의 `RelayProvider` 가 로드하는
   청크 `/_next/static/chunks/2345-c0133ca9890ddb86.js` (13,257 B) 에서
   - 16-19(`d52e788`, 10:01)가 넣은 런타임 문자열 **`소켓 미연결` 1건 검출**
   - 16-23(`29cbb03`, 11:04)이 `use-relay-socket.ts` 에서 지운 `account` 키가
     **0건** (`accountStates` 는 9건 잔존) → 그 삭제가 반영된 빌드다

   즉 라이브 빌드는 **16-23 이후**임이 내용으로 증명된다.
2. 배포 생성 시각 **11:51:18** 이 `origin/master` tip 커밋 `6b27fcc`(11:51)와 같은 분.
3. Vercel 의 브랜치 alias `…-git-master-…` 가 이 배포를 가리킨다(= master 최신 배포).
4. 유일한 미푸시 커밋 `2cb5620` 은 `relay/src/dma/__tests__/` 만 건드린다 —
   `scripts/vercel-ignore-build.sh` 는 `webapp/`·`packages/shared/`·`pnpm-lock.yaml` 이
   안 바뀌면 빌드를 SKIP 하므로, 푸시해도 이 배포본이 그대로 정본으로 남는다.

**직접 관측하지 못한 것(정직 기록):** Vercel CLI 는 배포의 git SHA 를 노출하지 않는다
(`vercel inspect --json` 의 `meta`·`gitSource` 가 빈 객체). 또 16-24·16-25 의 webapp 변경은
인증 게이트 뒤 라우트 청크에 있어 **미인증으로 내려받을 수 없다** — 그 둘이 라이브임은 위
2·3·4 의 정황이고 내용 증명은 16-23 까지다.

### `/healthz` 실측 — **세션이 있는 상태의 200** (gap 4 종결 근거)

배포 직후(세션 0)의 200 은 증거가 아니다. 아래는 **로그인 세션이 붙어 있는 상태**의 관측이며,
`sessionCount` 가 0 이 아니라는 점이 그 조건을 스스로 증명한다.

```
$ curl -s -w 'http=%{http_code}' https://dma.jx1.io/healthz
{"status":"ok","vpn":true,"dma":true,"version":"2cb5620","sessionCount":2,"everReadyCount":0}
http=200
```

재측정(수 분 뒤)에서도 동일:

```
{"status":"ok","vpn":true,"dma":true,"version":"2cb5620","sessionCount":2,"everReadyCount":0}
http=200
```

**배포 직전 같은 엔드포인트의 관측(대조군):**

```
{"status":"degraded","vpn":true,"dma":false,"version":"4b6d792","sessionCount":2}
http=503
```

대조가 정확하다 — **`sessionCount` 는 2 로 같고 판정만 뒤집혔다.** 응답에 `everReadyCount`
필드가 **없다**는 것이 옛 빌드(16-21 미반영)의 직접 증거이고, 새 빌드는 그 필드를 `0` 으로
싣는다. 즉 「게이트웨이가 애초에 없는 환경」이 더 이상 relay 장애로 보고되지 않는다.
`version` 도 `4b6d792` → `2cb5620` 으로 이번 커밋과 일치한다.

### smoke 결과 (실측 전문)

`scripts/smoke-relay.sh` — **PASS 12 · FAIL 0 · SKIP 1**

```
  INV-1 VM radar-gw RUNNING ... PASS
  INV-2 방화벽 3규칙 (gh-radar-vpc) ... PASS
  INV-3 고정 IP gh-radar-relay-ip → radar-gw 결선 ... PASS
  INV-4 tun0 활성 + 기본 경로 ens4 유지 ... PASS
  INV-5a 공개 /healthz 200 + 식별자 미포함 ... PASS
  INV-5b TLS issuer=Let's Encrypt + notAfter 미래 ... PASS
  INV-6 wss 인증 왕복 (4401 × 2) ... PASS
  INV-7a 8091 공인 차단 (nc 실패해야 PASS) ... PASS
  INV-7b 9100 공인 차단 (nc 실패해야 PASS) ... PASS
  INV-8 알림 정책 gh-radar-relay-down + 채널 + uptime check ... PASS
  INV-9 브라우저 → relay wss 주문 왕복 도달성 ... SKIP (SMOKE_AUTH_TOKEN 미설정 — 로그인 토큰 필요)
  INV-10a dma_orders service_role 조회 ... PASS
  INV-10b dma_orders anon 차단 (200 이면 RLS 회귀) ... PASS
```

**`INV-5a` 가 PASS 로 전환됐다** — 16-17 배포에서 **유일한 FAIL** 이었던 항목이고, 그것이
§열린 항목 1 의 근거였다.

`scripts/smoke-server.sh` — **PASS 15 · FAIL 0 · SKIP 0** (배포 스크립트 내부에서 실행)

```
  INV-1 /api/health status=ok ... PASS
  INV-2 /api/scanner upperLimitProximity ... PASS
  INV-3 /api/stocks/:code (scanner 연동) ... PASS
  INV-4 /api/stocks/000000 → 404 ... PASS
  INV-5 /api/stocks/search (scanner 연동) ... PASS
  INV-6 CORS preflight (허용) ... PASS
  INV-7 CORS preflight (거부) ... PASS
  INV-9 X-Request-Id 헤더 ... PASS
  INV-10 POST /api/orders → 404 (라우트 부재) ... PASS
  INV-11 GET /api/orders 미인증 → 401 ... PASS
  INV-12a RELAY_INTERNAL_URL 잔존 없음 ... PASS
  INV-12b ORDER_TIMEOUT_MS 잔존 없음 ... PASS
  INV-12c RELAY_ORDER_SECRET 바인딩 잔존 없음 ... PASS
  INV-12d 기존 env 잔존 (SUPABASE_URL·ANTHROPIC_API_KEY·DISCUSSION_CLASSIFY_ENABLED) ... PASS
  INV-8 rate limit 240 req(병렬) → 429 발생 ... PASS
```

**INV-9 는 실행되지 않았다.** `SMOKE_AUTH_TOKEN` 미설정이라 프로브가 SKIP 으로 떨어졌다.
정확히 말하면 **「돌렸는데 SKIP 이었다」가 아니라 「토큰이 없어 프로브 본체를 한 번도 돌리지
못했다」** 이다 — 16-21 이 INV-9 를 relay wss 주문 왕복으로 **재작성한 뒤 첫 실행이 아직
미수행**이며, 이는 §Deferred 의 열린 항목으로 남는다.

### T-16-08 — server 리비전의 relay 결선 제거 (실측 재확인)

`gcloud run revisions describe gh-radar-server-00043-s4f` 로 되읽은 env 이름 목록:

```
ANTHROPIC_API_KEY APP_VERSION BRIGHTDATA_API_KEY CORS_ALLOWED_ORIGINS
DISCUSSION_CLASSIFY_ENABLED KIWOOM_APPKEY KIWOOM_BASE_URL KIWOOM_SECRETKEY
KIWOOM_TOKEN_TYPE LOG_LEVEL NAVER_BASE_URL NAVER_CLIENT_ID NAVER_CLIENT_SECRET
NAVER_DAILY_BUDGET NODE_ENV SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL
```

`RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET` · `ORDER_TIMEOUT_MS` **0건**. 16-17 이
`00042-p78` 에서 명시 제거한 상태가 새 리비전에도 승계됐다(smoke INV-12a/b/c 와 이중 확인).

### 프로덕션 표면 회귀 없음

| 확인 | 결과 |
|------|------|
| `GET /` HTML 에 「상승률 상위」 | 검출 ✓ (Phase 16 사이드바 트리 유지) |
| `GET /` HTML 에 `data-nav-item` | 검출 ✓ |

### uptime check · 알림

`gh-radar-relay-healthz` (host `dma.jx1.io`, period 60s) 는 배포 절차가 갱신했고,
알림 정책 `gh-radar-relay-down` 은 `enabled=True` · 조건 `relay uptime check failing` 이다.
발화의 **근거 조건(503)이 해소**된 것은 위 실측으로 확인했으나, **인시던트가 닫히는 이벤트
자체는 관측하지 않았다** — uptime check 자체 주기(60초)에 따라 닫힌다.

### 이 배포가 바꾸지 않는 것 (과장 방지)

DMA 게이트웨이는 살아나지 않았다. `DMA_HOST` 는 여전히 로컬 mock(`127.0.0.1:9100`)이고 그
mock 은 VM 에 떠 있지 않다. `everReadyCount:0` 이 그 사실을 그대로 말한다 — **프로덕션에서
Ready 에 도달한 DMA 세션은 한 번도 없다.** 로그인 사용자는 트레이딩 3표면에서 DMA 게이트를
계속 본다. 바뀐 것은 **그 상태가 더 이상 relay 장애로 보고되지 않는다**는 것뿐이다.
