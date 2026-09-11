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
| ✅ WinForms ↔ 웹 「한 세션」 동기화 (웹 스위치 ON → WinForms 「무장」, WinForms 값 변경 → 웹 토스트+덮어쓰기) | TRADE-01 / TRADE-03 | 실 gh-trade 서버 + WinForms 클라이언트 필요 (human-only). **2026-09-10 실측 완료 · 2026-09-11 철거 방향까지 확인** — `quick-260910-ogq` / `260911-mrl` | 실서버 접속 시: WinForms 상따창과 `/trading/limit-chaser/[key]` 동시 열기 → 웹 스위치 ON → WinForms 무장 배지 확인 → WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인 |
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

---

## Gap Closure 2라운드 (16-27 ~ 16-35)

`16-REVIEW.md` §갭 클로징 재리뷰의 **GC-CR 3 · GC-WR 12 · GC-IN 4 = 19건**을 사용자가 범위로
확정했고, 9개 plan(16-27 ~ 16-35)이 전부 닫았다. 항목별 종결 근거는 `16-REVIEW.md` 의
각 항목 아래 `> **종결:**` 줄이 정본이며, 아래는 그 요약표다.

| ID | 담당 plan | 무엇을 바꿨는가 | 회귀를 잠근 명령 |
|----|-----------|-----------------|------------------|
| **GC-CR-01** — `narrowPending` 「후보 1개」 지름길이 모든 상관 축을 건너뛴다 | 16-27 (`eeb3a6e`) | 지름길 제거 + 통보가 **실어 온** 강한 축(비어 있지 않은 `orgOrderNo` · 취소성 `noticeType` C/M)을 후보 수와 **무관한 하드 필터**로 승격(0건이면 `null`). 비어 있는 축은 건너뛰어 구 게이트웨이 호환 유지. 소비 루프 warn 조건도 `candidates.length > 0 && picked === null` 로 확대 | `pnpm --filter @gh-radar/relay test -- order` |
| **GC-CR-02** — 좁히지 못한 **수동** 통보가 존재하지 않는 `order_no` 행을 갱신(0행, 무로그) | 16-33 (`0ce0e2d`) | 수동 분기도 `findIdByOrderNo` 조회 경유 → 행이 **있을 때만** `orderRowId` 로 갱신, 없으면 통보 원문을 `logger.error` 로 남기고 **큐에 넣지 않는다**. D-24 두 번째 감사 사본으로 Hub stdout 1줄 추가 | `pnpm --filter @gh-radar/relay test -- order` (변이 실증 4건) |
| **GC-CR-03** — `await insertRequest` 중 연결이 닫히면 고아 대기·타이머 + 체결분이 `timeout` 으로 기록 | 16-27 (`909a217`) | `await` 직후·`buildDirectOrderReq` 이전에 `conns.get(conn) !== state` 재확인 → **송신 전** 중단(`logger.warn` + `rejected`) | `pnpm --filter @gh-radar/relay test -- order` (㉕) |
| **GC-WR-01** — `void recordUnmatched(...)` 에 `.catch` 가 없어 예외 1건이 relay 전체를 내린다 | 16-33 (`49db808`) | 호출부 `.catch` + `autoInsertRow` 를 `insertOnly` try 안으로 — **두 겹**. `unhandledRejection` 이 `logger.fatal` + 프로세스 종료라 한 겹은 부족 | `pnpm --filter @gh-radar/relay test -- order` (변이 2종) |
| **GC-WR-02** — `ensureRow` in-flight 키가 빈 주문번호에서 충돌 | 16-33 (`49db808`) | `orderNo === ""` 를 in-flight 밖으로. 합치면 그 사용자의 **모든** 접수 전 거부가 한 `row.id` 를 덮어썼다 | `pnpm --filter @gh-radar/relay test -- order` (㉘) |
| **GC-WR-03** — `narrowPending` 에 매매구분 축이 없다 | 16-34 (`770da64`) | `PendingOrder.side` 신설 + `refine` 축. **REVIEW 스니펫대로 `sideTrusted && side !== ""` 만 걸면 취소거부가 살아 있는 신규 매수를 오정산**하므로 `noticeType ∈ {A, E}` 가드를 한 겹 더 걸었다. 정규화는 `fromWireSide` 재사용(모르는 값 → `null` → 축 생략) | `pnpm --filter @gh-radar/relay test -- order` (②·㉙) |
| **GC-WR-04** — `lc.set` 의 **삭제**도 ISIN 해석 실패로 거부된다 | 16-29 (`e1c627e`) | 철거(`crud:"D"` ∨ 게이트 4종 OFF)는 `#teardownMarket` 이 에코 캐시 → `SymbolMap` → 상수 폴백으로 풀고 **거부하지 않는다**. 폴백이 안전한 근거는 `strategyKey()` 에 시장이 없다는 사실. `#isTeardown` 은 `crud` 하나에 의존하지 않는다 | `pnpm --filter @gh-radar/relay test -- envelope protocol` (⑰-e·⑰-e2) |
| **GC-WR-05** — relay 무장 가드가 UI 보다 느슨하다 | 16-29 (`b059be8`) | `#strategyArmable` 의 `reason` 을 `buy`·`sell`·`sweep` 3갈래로 — `sellWatchQty === 0` 과 한방 게이트가 서버에서도 막힌다. 삭제에는 걸리지 않으며 그 예외를 함수 자신이 소유 | `pnpm --filter @gh-radar/relay test -- protocol` (⑰-g·⑰-h·⑰-h2) |
| **GC-WR-06** — `send()` 의 boolean 을 4곳 중 1곳만 읽는다 | 16-31 상따 2곳 (`a44dd66`) · 16-32 VI 2곳 (`551d89c`) | 4곳 전부 반환값 분기. 상따는 낙관 반영을 전송 **뒤로**, 실패 표시는 `data-slot="lc-submit-error"`. VI `toggle` 은 실패 `return` 이 `setOptimistic`·`setSending` **앞**(잠금을 푸는 유일한 신호가 서버 73 델타라 안 보내면 행이 영구 회색). VI 설정 `submit` 은 `blocked`(닫는다) / `failed`(열어 둔다) 3갈래 | `pnpm --filter @gh-radar/webapp test -- limit-chaser vi-order-list vi-settings-card` |
| **GC-WR-07** — `everReadyCount` 래치가 프로세스 메모리라 재시작 후 진짜 장애가 `ok/200` | 16-30 (`51a66c8`) · **16-35 (배포·실측)** | 판정을 `(everReadyCount === 0 && stalledCount === 0) \|\| readyCount > 0` 으로. `stalledCount` = 생성 후 `STALE_SESSION_MS`(5분)가 지나도록 한 번도 Ready 가 아닌 세션. 시각을 매니저 `Entry.createdAt` 에 얹어 `session.ts` diff **0줄**(T-16-26) | `pnpm --filter @gh-radar/relay test -- order-api session-manager` (⑧-d·⑩) + **아래 §Deployment Verification (16-35) 프로덕션 실측 200 → 503 전이** |
| **GC-WR-08** — 부분 UNIQUE 위반(`23505`)을 어느 경로도 다루지 않는다 | 16-28 (`f7435e9`) | insert sink 가 `23505` ∧ `orderNo != ""` 일 때만 같은 3축 재조회로 **기존 행 id 수렴** + warn(`origin`·SQLSTATE 만). `order_no` 를 채우는 **갱신**의 `23505` 는 재시도 무의미이므로 사유 있는 error 로 끝내 `#dropped` 를 오염시키지 않는다. 분기 조건은 셀렉터가 아니라 **patch** 에 걸었다 | `pnpm --filter @gh-radar/relay test -- order-store` (⓻·⓽) |
| **GC-WR-09** — `handleSubmit` 이 `gateBlocked` 를 읽지 않는다 | 16-31 (`a44dd66`) | 가드를 `setSubmitting(true)` **앞**에 두고 **켜져 있는 게이트만** 본다 — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다(T-16-44 확장) | `pnpm --filter @gh-radar/webapp test -- limit-chaser` (⑭ 2건) |
| **GC-WR-10** — 취소 중복 키에 원주문번호가 없다 | 16-34 (`e86dfa1`) | 취소는 `(accountNo,isin,"C",orgOrderNo)`, **신규 키는 불변**(16-22 truth 25 유지). 취소 수량은 언제나 잔량 전부라 가격·수량은 취소의 식별자가 아니다. 같은 `orgOrderNo` 연타는 여전히 거부 | `pnpm --filter @gh-radar/relay test -- order` (㉚·㉛) |
| **GC-WR-11** — 스모크 프로브가 토큰을 argv 로 넘기고, 판정 문자열이 이어 붙으면 FAIL 이 SKIP 으로 강등 | 16-30 (`024ce72`) | ① `SMOKE_TOKEN` **env** 전달(T-16-56) ② 판정을 **변수 대입 + 단일 출력 지점**으로(T-16-57), `case *` 는 관측 원문을 남긴다. 격리 실측: 수정 전 argv 토큰 1건 · `reachable\ninconclusive` → 후 argv 0건 · `inconclusive` | `bash scripts/smoke-relay.sh` (**16-35 실행분도 토큰 부재라 조기 반환 갈래만 탔다** — 프로브 본체 프로덕션 첫 실행은 여전히 미수행) |
| **GC-WR-12** — 무장 불가 안내가 가장 흔한 원인을 잘못 짚는다 | 16-31 (`f76daa3`) | `armBlockedTextOf(key, values)` 하나가 매수 2·매도 2·한방 2 갈래를 내고 그룹 사유줄과 전송 차단 문구가 **같은 함수**를 읽는다. e2e 가 고정한 실제 조건은 「시세 없음」이 아니라 **금액 부족**. 매도 문구는 감시 **호가잔량**을 가리키게 정정 | `pnpm --filter @gh-radar/webapp test -- limit-chaser` (⑮·⑬ 3건) |
| **GC-IN-01** — `gateBlocked` 의 `useCallback` 의존성이 매 렌더 새 객체 | 16-31 (`f76daa3`) | `canArm` 을 `useMemo` 로 — eslint `react-hooks/exhaustive-deps` 경고 **1 → 0** 실측 | `pnpm --filter @gh-radar/webapp lint` |
| **GC-IN-02** — `row.isin as string` 타입 단언 | 16-31 (`8e3227c`) | `isPickable` 을 타입 서술자로 — 단언이 파일에서 **1 → 0** | `pnpm typecheck` |
| **GC-IN-03** — `latestAccountTime` 이 `HH:MM:SS` 문자열 비교 | 16-32 (`821486f`) | 비교 키를 `st` **원문**에서 만들고(`dated` 가 첫 축) 승자의 원문에서 표시값을 뽑는다. epoch 승격을 안 고른 이유: `HH:MM:SS` 만 오는 값은 「오늘」을 가정해야 하고 **그 가정이 버그의 원인**이다 | `pnpm --filter @gh-radar/webapp test -- me-client` (신규 3건) |
| **GC-IN-04** — `ORDER_FLUSH_MAX_ROUNDS` 의 `+2` 가 설명되지 않는다 | 16-28 (`a31f529`) | 라운드 1 첫 배치 / 2 재시도분 / **3 동시 유입 확인**을 docstring 에 명시. 식은 유지 | `pnpm --filter @gh-radar/relay test -- order-store` |

**전량 재실행 결과 (2026-09-09, 16-35 Task 1 — 배포 전 게이트):**

| 명령 | 결과 |
|------|------|
| `pnpm typecheck` | exit 0 · 13 워크스페이스 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `pnpm -r test` | exit 0 · **190 파일 / 2,012 passed · 1 skipped · 6 todo** (16-26 기준선 189 파일 / 1,970 → **+1 파일 / +42**) |
| ↳ shared + relay + server + webapp 만 | **1,396** (99 · 373 · 252 · 672) — 16-26 기준선 1,354 초과 |
| `pnpm build` | exit 0 |
| `pnpm --filter @gh-radar/webapp test:e2e` | **126 passed · 9 skipped · 0 failed** (2.5분) |

> **E2E 문구 단언은 갱신할 것이 없었다.** 계획은 16-31 이 안내 문구를 바꿨으니
> `trading-limit-chaser.spec.ts` 가 걸릴 수 있다고 예고했으나 실측 126/9/0 으로 전량 green
> 이다 — 16-31 이 문구 변경과 같은 커밋에서 spec 을 함께 맞췄기 때문이며, 회귀가 숨은 것이
> 아니라 애초에 red 가 없었다. 9 skipped 는 16-17 이래 같은 `user-themes`·`watchlist`
> (서비스롤 키를 E2E env 허용목록에서 의도적으로 제외한 결과)다.

### ⚠️ 승인 기준 문구 정정 — `grep "10.41.1.120"` **0건은 만족 불가능한 조건이다**

2라운드 plan 6건(16-29·30·31·32·33·34)이 이 조건을 승인 기준으로 인용했고 **여섯 번 연속
같은 불일치를 관측**했다. 16-26 이 이미 정정했음에도 2라운드 plan 문서에 그대로 남아 있었다.
16-35 실측(`grep -rn "10\.41\.1\.120" relay/ webapp/src webapp/e2e scripts/`) = **33건**:

| 위치 | 건수 | 성격 |
|------|------|------|
| `webapp/src` · `webapp/e2e` | **0** | ✅ 스펙·픽스처·클라이언트 코드에 게이트웨이 주소 없음 |
| `relay/README.md:17` · `relay/src/dma/link-health.ts:20` | 2 | 산문·주석. README 는 **접속 금지 경고문 자체**이므로 지우면 D-27 안전장치의 근거가 사라진다 |
| `scripts/deploy-relay.sh:96,416` | 2 | 실서버 주소 주입 시 **경고를 띄우는 가드**와 안내문 |
| `scripts/dma-tunnel.sh`(6) · `dma-tunnel.ps1`(7) · `install-vpn-menubar.sh`(16) | 29 | **다른 세션(quick 260909-el9)의 미추적 파일** — phase 16 소관 아님 |

**정본 계약:** 리터럴 0건이 아니라 **접속 경로 0건**이다. 즉
`grep -rn "10\.41\.1\.120" webapp/src webapp/e2e` **0건** ∧ relay·scripts 의 잔존이
전부 「경고·가드·주석」임이 확인될 것. 다음 라운드는 이 문장을 인용할 것.

### ⚠️ 승인 기준 문구 정정 — `pnpm --filter gh-radar-webapp` 은 **없는 필터다** (재발 2회)

16-26 이 이 표의 §Test Infrastructure 를 정정했음에도, **16-31·16-32 가 자기 plan 의
승인 기준에서 같은 문자열을 다시 만났다.** 정본은 `@gh-radar/webapp` 이고, 잘못된 필터는
`No projects matched the filters` + **exit 0** 이라 「절대 실패할 수 없는 검증」이다.
16-35 는 정본 필터로 실행했다.

---

## Deployment Verification (2026-09-09, 16-35 Task 2)

사용자 응답: **「배포 승인 — 배포까지 전부 진행」**. 배포 커밋 **`c8aa7ae`**.
순서는 의존 방향대로 **relay → webapp**(server 는 무변경이라 건너뜀).

### server 를 건너뛴 근거 (실측 출력)

```
$ git diff --stat 2cb5620..HEAD -- server/
(출력 없음)
$ git diff --stat 2cb5620..HEAD -- packages/shared/
(출력 없음)
```

이번 라운드는 `server/` 와 `packages/shared/` 를 **한 줄도 바꾸지 않았다.** 따라서
불필요한 재배포를 하지 않고 리비전 **`gh-radar-server-00043-s4f`**(16-26 배포분)를 그대로
둔다. 살아 있음은 아래 `smoke-server.sh` 15/15 로 확인했다.

`packages/shared/` 무변경은 **배포 순서 위험이 이번 라운드에는 없다**는 뜻이기도 하다 —
16-26 때 relay 를 먼저 배포해야 했던 이유(16-25 의 `RelayLcSetSchema.cfg` 에서 `market`
삭제)는 계약 변경이었는데, 이번에는 계약이 그대로다. 그래도 규율대로 relay 를 먼저 올렸다.

### 배포 산출물 (실측)

| 대상 | 산출물 | 확인 |
|------|--------|------|
| relay | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:c8aa7ae` (digest `sha256:a9bd44f4…`) · VM `radar-gw` 컨테이너 `gh-radar-relay` | 기동 직후 VM 로컬 `/healthz` 200 `{"status":"ok","vpn":true,"dma":true,"version":"c8aa7ae","sessionCount":0,"everReadyCount":0,"stalledCount":0}` · 71.99MiB/384MiB · `DMA_HOST=127.0.0.1`(로컬 mock, D-27) |
| server | **재배포 없음** — 리비전 `gh-radar-server-00043-s4f` 유지 | `smoke-server.sh` PASS 15 · FAIL 0 |
| webapp | Vercel **`dpl_7iFWNKh6DYDCWofhFsqBi42QiGxQ`** (`gh-radar-webapp-buig1m003-…`) · created 2026-09-09 **16:10:25 KST** · build **1m** · alias `https://gh-radar-webapp.vercel.app` + `…-git-master-…` 결선 | **git 통합 자동 배포** (push `f82bb49..c8aa7ae` 직후 16:09) |

### webapp — 무엇이 증명됐고 무엇이 안 됐는가

**증명된 것:**

1. 배포가 **실제로 빌드됐다** — duration **1m**. `scripts/vercel-ignore-build.sh` 가 SKIP 한
   배포는 이 프로젝트 이력에서 전부 `Canceled` / 3~5초다.
2. 브랜치 alias `…-git-master-…` 가 이 배포를 가리킨다 = master 최신 빌드.
3. 프로덕션 HTML 회귀 없음: `GET /` 에 「상승률 상위」 **2건** · `data-nav-item` **1건** 검출.
4. 공개 루트 청크 `2345-c0133ca9890ddb86.js` 의 해시가 16-26 기록과 **동일**하다. 이것은
   회귀가 아니라 **일치의 증거**다 — 이번 라운드 webapp diff 5파일
   (`limit-chaser-client` · `limit-chaser-form` · `me-client` · `vi-order-list` ·
   `vi-settings-card`)은 전부 **인증 게이트 뒤 트레이딩 표면**이고 공개 표면을 한 줄도
   건드리지 않았다. 공개 청크가 그대로인 것이 diff 와 정확히 맞아떨어진다.

**증명하지 못한 것(정직 기록):** 이번 라운드가 바꾼 5파일은 전부 `/trading/*`·`/me` 청크에
있고 그 라우트는 미인증에 `307 → /login` 이라 **청크를 내려받아 내용으로 대조할 수 없다.**
Vercel CLI 도 배포의 git SHA 를 노출하지 않는다(`vercel inspect --json` 의 `meta` 가 비어
있다 — 16-26 과 동일). 로컬 `.next` 는 turbopack 산출물이라 청크 이름이 프로덕션(webpack)과
달라 이름 대조로도 못 잇는다. 따라서 webapp 반영의 근거는 위 1~4 의 **정황**이며, 내용
증명이 아니다. 로그인 상태의 화면 확인은 §Manual-Only 소관으로 남는다.

### `/healthz` 실측 — **200 → 503 전이가 GC-WR-07 의 직접 증거다**

배포 직후(세션 0)의 200 은 증거가 아니다. 아래는 **로그인 세션이 붙어 있는 상태**의
연속 관측이며, `version` 이 고정된 채 **판정만 뒤집히는 순간**을 잡았다.

```
16:16:21 http=200 {"status":"ok",      "vpn":true,"dma":true, "version":"c8aa7ae","sessionCount":2,"everReadyCount":0,"stalledCount":0}
16:17:21 http=503 {"status":"degraded","vpn":true,"dma":false,"version":"c8aa7ae","sessionCount":2,"everReadyCount":0,"stalledCount":2}
16:18:21 http=503 {"status":"degraded","vpn":true,"dma":false,"version":"c8aa7ae","sessionCount":2,"everReadyCount":0,"stalledCount":2}
16:19:21 http=503 {"status":"degraded","vpn":true,"dma":false,"version":"c8aa7ae","sessionCount":1,"everReadyCount":0,"stalledCount":1}
```

**이 503 은 배포 실패가 아니라 「판정이 옳게 울린 것」이다. 근거는 본문 필드 셋이다:**

- `version` 이 세 샘플에서 **`c8aa7ae` 로 동일**하다 — 배포는 성공했고 같은 빌드가 계속 답한다.
- `everReadyCount` 가 **0** 이다 — 16-21 의 유예 축(「한 번도 Ready 인 적 없는 세션은 장애가
  아니다」)만 보면 이 상태는 여전히 `ok` 여야 한다. 실제로 16:16:21 은 `ok/200` 이었다.
- 판정을 뒤집은 것은 **`stalledCount` 가 `0 → 2` 로 오른 것 하나뿐**이다. relay 컨테이너가
  16:09 에 재기동하며 세션이 새로 만들어졌고, 그 `Entry.createdAt` 이 `STALE_SESSION_MS`
  (=300,000ms, `session-manager.ts:53`)를 넘긴 **정확히 그 다음 샘플**에서 degraded 로 갔다.
  `sessionCount` 는 2 로 **그대로**다.

즉 `(everReadyCount === 0 && stalledCount === 0) || readyCount > 0` 의 두 항이 프로덕션에서
**따로따로 관측됐다**. 배포 전 빌드(`2cb5620`)에는 `stalledCount` 필드 자체가 없었으므로,
이 필드가 응답에 실린다는 사실만으로도 16-30 이 프로덕션에 반영됐다는 1차 증거가 된다.

**이 판정이 옳은 이유.** DMA 게이트웨이는 여전히 없다(`DMA_HOST=127.0.0.1`, mock 미기동).
16-21 이후의 relay 는 이 상태를 「부팅 직후 유예」로 보고 초록으로 답해 왔는데, **그 유예에
시간 상한이 없었다** — 장애 중 relay 가 한 번만 재시작하면 진짜 게이트웨이 장애도 영원히
`ok/200` 이었다(GC-WR-07). 지금 관측된 503 은 「게이트웨이가 5분이 지나도록 붙지 못하고
있다」는 **사실을 그대로 말하는 것**이며, 그것이 이 수정의 목적이다.

⚠️ **따라서 uptime check 적색과 `gh-radar-relay-down` 알림 발화는 예상된 결과다.**
알림 정책은 `enabled=True` · 조건 `relay uptime check failing` · uptime check
`gh-radar-relay-healthz`(host `dma.jx1.io`, period 60s)로 살아 있다. 알림을 끄고 싶다면
그것은 **판정을 되돌리는 결정**(유예 연장 / 임계 완화 / mock 상주 / 실서버 결선)이고
사용자 판단 사항이다 — §Deferred 열린 항목으로 남긴다.

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

> `INV-5a` 는 이 실행 시각(16:14 경)에 `/healthz` 가 아직 200 이던 구간에서 통과했다.
> 위 §전이 관측이 보여주듯 이 검사는 **시각 의존**이다 — 게이트웨이가 없는 한 세션 생성
> 5분 뒤에는 503 이 되어 FAIL 로 바뀐다. 그것이 GC-WR-07 이 의도한 동작이므로 `INV-5a` 의
> 판정 문구를 「200 이어야 한다」에서 「게이트웨이 부재 시 5분 뒤 503 이 정상」으로 다시
> 설계할지가 열린 항목이다(§Deferred).

`scripts/smoke-server.sh https://gh-radar-server-fnbhvevuva-du.a.run.app` — **PASS 15 · FAIL 0 · SKIP 0**

```
  INV-1 /api/health status=ok ... PASS          INV-9  X-Request-Id 헤더 ... PASS
  INV-2 /api/scanner upperLimitProximity ... PASS  INV-10 POST /api/orders → 404 ... PASS
  INV-3 /api/stocks/:code (scanner 연동) ... PASS  INV-11 GET /api/orders 미인증 → 401 ... PASS
  INV-4 /api/stocks/000000 → 404 ... PASS        INV-12a RELAY_INTERNAL_URL 잔존 없음 ... PASS
  INV-5 /api/stocks/search (scanner 연동) ... PASS INV-12b ORDER_TIMEOUT_MS 잔존 없음 ... PASS
  INV-6 CORS preflight (허용) ... PASS            INV-12c RELAY_ORDER_SECRET 바인딩 잔존 없음 ... PASS
  INV-7 CORS preflight (거부) ... PASS            INV-12d 기존 env 잔존 ... PASS
                                                 INV-8  rate limit 240 req(병렬) → 429 ... PASS
```

**INV-9 는 이번에도 실행되지 않았다.** `SMOKE_AUTH_TOKEN` 이 없어 프로브가
`ws_order_probe()` 첫 줄(`if [[ -z "$token" ]]; then printf 'inconclusive'; return 0; fi`)에서
**조기 반환**했다. 정확히 말하면 **「돌렸는데 SKIP 이었다」가 아니라 「토큰이 없어 프로브
본체를 한 번도 돌리지 못했다」** 이다.

> **GC-WR-11 의 실증 범위를 오해하지 말 것.** 위 SKIP 은 판정 문자열이 이어 붙지 않은
> 깨끗한 단일값(`inconclusive`)이지만, 그것은 **조기 반환 갈래**라 GC-WR-11 이 고친 지점
> (프로브가 판정을 찍은 **뒤** 비정상 종료하는 경로)을 지나가지 않는다. 그 수정이 실제로
> 동작함은 16-30 의 **격리 실측**으로만 확인됐고, 프로덕션에서는 여전히 미검증이다.
> 16-21 재작성 이후 이 프로브의 프로덕션 첫 실행은 **아직 미수행**이며 §Deferred 의 열린
> 항목으로 유지된다. 토큰 값은 이 문서·SUMMARY·로그 어디에도 기록하지 않는다(T-16-74).

### 이 배포가 바꾸지 않는 것 (과장 방지)

DMA 게이트웨이는 여전히 없다. `DMA_HOST` 는 로컬 mock(`127.0.0.1:9100`)이고 그 mock 은 VM 에
떠 있지 않다. `everReadyCount:0` 이 그 사실을 그대로 말한다 — **프로덕션에서 Ready 에 도달한
DMA 세션은 지금까지 한 건도 없다.** WinForms ↔ 웹 세션 공유는 **한 번도 실행된 적이 없고**,
따라서 **TRADE-03 은 Pending 을 유지한다.** 이번 배포로 바뀐 것은 ① 코드 결함 19건이
프로덕션에 반영됐다는 것 ② 게이트웨이 부재가 **5분 뒤에는 정직하게 degraded 로 보고된다**는
것 두 가지뿐이다.

---

## Gap Closure 3라운드 (16-36 ~ 16-46)

`16-REVIEW-R2.md` 의 **Critical 3 · Warning 7 · Info 5** 와 `16-VERIFICATION-R2.md` §부록의
**새 갭 2건** = **17건**을 사용자가 범위로 확정했고, 10개 plan(16-36 ~ 16-45)이 전부 닫았다.
16-46 이 게이트·배포·문서를 맡았다.

**이 라운드가 앞선 두 라운드와 다른 점.** 2026-09-09 프로덕션 relay 가 실 게이트웨이
(`10.41.1.120:9100`)에 결선됐다. 즉 Critical 3건은 **실계좌가 붙은 경로 위에서** 닫혔다.

| ID | 담당 plan | 무엇을 바꿨는가 | 회귀를 잠근 명령 · 근거 |
|----|-----------|-----------------|------------------------|
| **R2-CR-01** — `#isTeardown` 이 클라이언트가 보낸 `crud:"D"` 를 게이트 상태와 무관하게 믿어 시장 해석 엄격성과 무장 가드를 **동시에** 우회 | 16-36 (`eeb4539`·`51408ee`) | 철거 판정의 정본을 `crud` 에서 **게이트 4종**으로 옮겼다. 계약 원문(`packages/shared/src/relay.ts:136-141`)이 「게이트가 전부 꺼지면 서버가 `"D"` 로 정규화한다」고 못박은 대로다 — `crud` 는 정규화의 **결과**를 말하는 힌트이지 근거가 아니다. `crud:"D"` ↔ 게이트 불일치는 `lc.set` 진입점 **한 곳**에서만 `logger.error`(계좌번호 미포함) | `pnpm --filter @gh-radar/relay test -- fanout` (⑰-e3·e4·e5) + **전제가 거짓이던 기존 ⑰-e·⑰-e2 정정** |
| **R2-CR-02** — 자격증명이 거부된 세션 1건이 5분을 넘기면 게이트웨이가 정상이어도 `/healthz` 가 **영구 503** | 16-37 (`f2bdb48`·`d6f1efb`) | `stats()` 의 stalled 집계에서 `NO_RETRY_STATES`(`session_rejected`·`unauthorized`) 세션을 제외했다. 하나의 카운터가 「인프라 원인」과 「사용자 원인」을 삼키던 것을 갈랐다 | `pnpm --filter @gh-radar/relay test -- session-manager` (⑩-b 사용자 원인 0 · ⑩-c 제외는 세션 단위) |
| **R2-CR-03** — `orders.ts` 3곳이 PostgREST error 원문을 로그에 실어 `Failing row`(계좌번호·주문번호)가 Cloud Logging 에 유출 | 16-38 (`dc19f09`·`84c23d7`·`110bbb7`) | 규율을 경로마다 적는 대신 `safePgError` **한 모듈의 좁은 반환 타입**에 걸었다. 계획이 지목한 7곳이 아니라 **전수 조사로 찾은 13곳**을 교체 — `details`·`hint` 는 어느 경로에서도 나가지 않는다 | `pnpm --filter @gh-radar/relay test -- order-store` (⓼-b~⓼-e). **16-46 재실측: relay 전체 15곳**(16-39·16-40 이 2곳 추가) |
| **R2-WR-01** — `23505` 갱신 예외가 패치 **전체**를 버려 수동 주문 행이 `requested`·0 인 채 영구 잔류 | 16-39 (`f0dd2a0`) | 포기 단위를 「패치 전체」에서 **충돌한 `order_no` 컬럼 하나**로 축소. `#flushed` 대입문은 한 줄도 바꾸지 않은 채 `flushed` 가 참말이 됐다 | `pnpm --filter @gh-radar/relay test -- order-store` (⓽·⓽-c) |
| **R2-WR-02** — 「수정」 무장 가드에 철거 면제가 없어 relay 는 허용하는 삭제를 UI 가 막는다 | 16-42 (`e803355`) | 철거 면제를 UI 쪽에도 대칭으로. 16-36 이 서버에 세운 규율(「끄는 것은 언제나 허용」)의 화면측 대응 | `pnpm --filter @gh-radar/webapp test -- limit-chaser-form` |
| **R2-WR-03** — `orgOrderNo` 문자열 완전일치라 선행 0 표기 차이로 실제 취소가 `timeout` 오기록 | 16-43 (`8bcf01c`·`31c0fd4`) | 비교 전 정규화 + 축이 전멸하면 로그를 남긴다. 게이트웨이 원본(`AccountManager.cpp:830-840`)에서 「키는 원장 표기를 그대로 쓴다」를 확인해 근거를 세웠다 | `pnpm --filter @gh-radar/relay test -- order` (㉜·㉝) |
| **R2-WR-04** — 종료 절차 `flushNow()` 가 진행 중 배치를 덮어써 배치가 둘이 된다 | 16-40 (`a59d8f7`·`e32ca65`) | 라운드마다 진행 중 배치를 재확인. **`maxLive 2 → 1` 로 실측 확인**. 덤으로 16-39 가 잔여로 남긴 `flushed` 오차도 같은 기법으로 종결 | `pnpm --filter @gh-radar/relay test -- order-store` |
| **R2-WR-05** — `#register` state 리스너가 재접속마다 누적(`MaxListenersExceededWarning`) | 16-44 (`5ee91f6`·`dac2856`) | 리스너를 `entry` 가 소유하고 폐기 경로가 뗀다. **실제 누수 지점은 `#register` 가 아니라 `#onClose` 였다** — 계획이 요구한 두 갈래를 따로 되돌려 실측으로 갈랐다 | `pnpm --filter @gh-radar/relay test -- fanout` (새로고침 k회 → 상태 프레임 1회) |
| **R2-WR-06** — 빈 매매구분이 매도 자동주문을 매수로 기록 | 16-43 (`6ca650d`) | 감사 행의 매매구분을 `fromWireSide` 로 통일 — 모르는 값은 `null` 로 축을 생략한다 | `pnpm --filter @gh-radar/relay test -- order` |
| **R2-WR-07** — `inserted` 카운터가 만들지 않은 행을 세고, 재조회 실패가 원래 `23505` 를 덮는다 | 16-40 (`d8ade31`·`52cc1da`) | ① `inserted` 는 **새로 만든 행만** 센다 ② 수렴 재조회가 실패해도 「기록 불가」로 열화되지 않는다 | `pnpm --filter @gh-radar/relay test -- order-store` |
| **R2-IN-01** — 해결됐는데 남아 있는 전송 실패 경고 | 16-42 (`e803355`·`65f8ece`) | 원인이 수정되면 문구가 풀리고, VI 주문 목록의 실패 문구도 73 델타에 접힌다 | `pnpm --filter @gh-radar/webapp test -- limit-chaser-form vi-order-list` |
| **R2-IN-02** — `detach()`·`releaseAll()` 죽은 공개 메서드 | 16-41 (`9c30c99`) | **삭제**했다(`@internal` 유지 아님) — 호출자 0건이고 `detach` 는 리스너를 떼지 않아 호출 자체가 누수였다 | `pnpm -r typecheck` (임포터 0건이므로 삭제가 곧 증명) |
| **R2-IN-03** — 미지 `noticeType` 을 「신규」로 단정(블랙리스트) | 16-43 (`8bcf01c`) | 화이트리스트로 뒤집었다 — 장래 통보 종류 확장에 조용히 오분류되지 않는다 | `pnpm --filter @gh-radar/relay test -- order` |
| **R2-IN-04** — 가짜 테이블이 갱신을 반영하지 않아 ⓽ 가 결함을 못 본다 | 16-39 (`f5fbc42`) | 하네스가 갱신을 실제로 반영하게 고쳤다. **기존 ⓽ 의 `toHaveLength(1)` 이 옛 구현을 베낀 단언이었음**을 함께 정정 | `pnpm --filter @gh-radar/relay test -- order-store` |
| **R2-IN-05** — INV-9 프로브 판정이 파이프에서 잘려 FAIL 이 SKIP 으로 강등 | 16-45 (`dea737b`) | stdout **쓰기 완료 후** 종료 + 호출부의 「빈 verdict = FAIL」 이중 방어. 빈 문자열은 「모른다」가 아니라 **판정 유실**이다 | 격리 실측(4갈래). **프로덕션 실행은 여전히 미수행** — 아래 §INV-9 참조 |
| **갭 4** — 사이드바 상따 전략이 종목명 대신 ISIN 원문으로 표시 | **16-41**(relay `03d0ee8`·`9c30c99`·`feedf2f`) + **16-42**(webapp `50bcece`) | 이름을 아는 유일한 프로세스가 이름을 붙인다. relay 가 이미 들고 있는 `SymbolMap` 으로 60/64 를 **캐시 삽입 이전** 보강하고(`#enrichLimitChaser`), 계약에 `name?`·`code?` 를 더하되 `Input` 에서 `Omit` 해 **브라우저는 보낼 수 없게** 했다. 웹앱은 새 조회 경로 없이 그 필드를 읽는다(T-16-02 유지) | `pnpm --filter @gh-radar/relay test -- strategy-hub` (⑬) · `pnpm --filter @gh-radar/webapp test -- isin-labels` (신규 4케이스). **16-46 프로덕션 청크 내용 대조로 라이브 확인** |
| **갭 5** — `deploy-relay.sh` 가 현재 `DMA_HOST` 를 보존하지 않아 배포마다 실 게이트웨이가 mock 으로 강등 | 16-45 (`9329e1b`) | `read_live_dma_host()` 단일 정본 + **3단 우선순위**(명시 주입 > 실행 중 컨테이너 보존 > 로컬 mock)를 한 줄에 모았다. `DMA_HOST_SOURCE` 로 출처를 배포 로그에 남기고, 값이 바뀌면 변경 전/후와 복구 명령을 찍는다 | 16-45 는 원문 추출 + 로컬 `source` 3케이스뿐. **아래 §Deployment Verification (16-46) 의 무주입 배포가 유일한 실증** |

### 전량 재실행 결과 (2026-09-09, 16-46 Task 1 — 배포 전 게이트)

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared run build` | exit 0 — **선행 필수**(아래 §새 함정) |
| `pnpm -r typecheck` | exit 0 · 13 워크스페이스 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 (루트 밖, 따로 실행) |
| `pnpm -r test` | exit 0 · **191 파일 / 2,044 passed · 1 skipped · 6 todo** (16-35 기준선 190 파일 / 2,012 → **+1 파일 / +32**) |
| ↳ shared + relay + server + webapp 만 | **1,428** (99 · **397** · 252 · **680**) — 16-35 기준선 1,396 초과 |
| `pnpm build` | exit 0 |
| `pnpm --filter @gh-radar/webapp test:e2e` | **126 passed · 9 skipped · 0 failed** (2.5분) |

임시 마커(`MUTATION`/`TEMP_DISABLE`/`XXX_REVERT`) **0건** · 부채 마커(`TODO`/`FIXME`/`XXX`/`HACK`/`TBD`) **0건**.

### 회귀 잠금 감사 — 10개 plan 전수

| plan | 회귀 잠금 실증 | 비고 |
|------|----------------|------|
| 16-36 | ✅ 실증함 | `#isTeardown` 첫 줄에 옛 `crud` 분기를 되돌려 확인 후 복원. `grep -c MUTATION` = 0 |
| 16-37 | ✅ 실증함 | 새 분기 무력화 → 실패 확인 → 복원(13 tests). **plan 이 허용한 대체 조합을 쓰지 않았다** — 그 조합은 무력화해도 실패하지 않아 게이트 역할을 못 한다 |
| 16-38 | ✅ 실증함 (4라운드) | 지점마다 따로. **라운드 D 가 핵심** — sink 3곳을 안전하게 둔 채 `#drain` 두 줄만 되돌려도 계좌번호가 샌다 |
| 16-39 | ✅ 실증함 (2라운드) | 수정(재시도)과 하네스(병합)를 **각각** 되돌려 어느 케이스가 무엇을 지키는지 분리 |
| 16-40 | ✅ 실증함 (4라운드) | 되돌린 지점마다 **정확히 그 케이스 하나만** 빨개짐 |
| 16-41 | ✅ 실증함 | `#enrichLimitChaser` 무력화 → ⑬ 1건만 빨개짐. `grep -c MUTATION` = 0 |
| 16-42 | ✅ 실증함 | 3파일 전부 `grep -c MUTATION` = 0, `git status --short` 의도치 않은 변경 0건 |
| 16-43 | ✅ 실증함 (3라운드) | `grep -c MUTATION order-handler.ts` = 0 |
| 16-44 | ✅ 실증함 · **일부 미잠금** | 두 곳을 따로 지웠다. **`#register` 갈래는 지워도 빨개지는 테스트 0건** — 그 갈래는 오늘의 코드로 도달하지 않는다. 하네스로 유발 불가함을 코드로 확인하고 **「잠그지 못했다」로 정직 기록** |
| **16-45** | ❌ **자동 테스트 없음** | `gcloud` 를 한 번도 부르지 않았다. 검증은 스크립트 **원문 추출 + 로컬 `source`**(우선순위 3케이스 · 출력 4케이스)뿐. 보존 로직의 실 VM 동작은 **아래 §Deployment Verification (16-46) 의 무주입 배포가 유일한 실증**이다 |

### SUMMARY 주장 vs 코드 직접 대조 (Critical 3 + 갭 2, 16-46 실측)

SUMMARY 를 근거로 삼으면 오진이 승계된다(T-16-96). 5건을 코드에서 직접 열어 확인했다.

| 확인 대상 | 위치 | 실제 원문 |
|-----------|------|-----------|
| `#isTeardown` 반환식 | `relay/src/ws/fanout.ts:841-845` | `return (!cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled);` — **`crud` 미참조**, 부수효과 없는 순수 판정 |
| `stats()` 의 `NO_RETRY_STATES` | `relay/src/dma/session-manager.ts:157·208·305` | `:157` 정의, `:305` stalled 집계에 `!NO_RETRY_STATES.has(entry.session.state)` |
| `orders.ts` 의 `safePgError` 사용 지점 | `relay/src/store/orders.ts` **8곳** / relay 전체 **15곳** (`credentials.ts` 1 · `symbols.ts` 1 · `fanout.ts` 1 · `order-handler.ts` 4) | 16-38 기록 13곳 + 16-39·16-40 이 2곳 추가. `:401` 주석이 「이 파일에서 PostgREST 오류가 로그로 나가는 자리는 **전부** `safePgError` 를 지난다」 |
| `#enrichLimitChaser` 호출 위치 | `relay/src/hub/subscription-hub.ts:743`(60 에코) · `:779`(64 스냅샷 map) · 정의 `:765` | 둘 다 **캐시 삽입 이전**. `fanout.ts` 는 한 줄도 안 고쳤고 `lc.snap` 재접속 복원이 같은 캐시를 읽는다 |
| `deploy-relay.sh` 의 3단 우선순위 | `scripts/deploy-relay.sh:104`(함수) · `:123-131`(해석) · `:469-472`(배포 후) | `DMA_HOST="${DMA_HOST_INJECTED:-${CURRENT_DMA_HOST:-127.0.0.1}}"` + `DMA_HOST_SOURCE` 3갈래. 배포 전/후가 **같은 함수**를 쓴다(T-16-14) |

---

## Deployment Verification (2026-09-09, 16-46 Task 3)

사용자 응답: **「배포 승인 — `DMA_HOST` 를 주입하지 않는다(A안)」**. 배포 커밋 **`a1f4ed6`**.
배포된 것은 **relay · webapp 2종**이며 **server 는 근거를 갖고 건너뛰었다**(아래 §server).

### 갭 5 실증 — **주입 없는 배포가 실 게이트웨이를 보존했다**

이 항목이 이번 배포의 핵심이다. 16-45 의 수정은 실 VM 에서 한 번도 돌지 않았고, **주입하지
않는 배포만이 그 수정을 증명**한다(주입하면 「주입이 보존을 이기는지」만 확인된다).

배포 전 실측(모든 비교의 기준):

```
DMA_HOST = 10.41.1.120        (VM radar-gw · docker inspect 직접)
이미지    = …/relay:59465e1
/healthz  = 200 {"status":"ok","vpn":true,"dma":true,"version":"59465e1",
                 "sessionCount":1,"everReadyCount":1,"stalledCount":0}
```

배포 명령: `DMA_HOST` **미주입**. `GCP_PROJECT_ID`·`SUPABASE_URL`·`NOTIFICATION_CHANNEL_ID`
만 주입 → `bash scripts/deploy-relay.sh` → **exit 0**.

스크립트 출력 원문 (갭 5 의 증거):

```
▶ 현재 컨테이너 DMA_HOST 조회 ...
  현재 컨테이너 DMA_HOST=10.41.1.120 — 이번 배포로 바뀌지 않는다
✓ variables: mode=deploy SHA=a1f4ed6 TARGET=…/relay:a1f4ed6 DMA_HOST=10.41.1.120
  DMA_HOST 출처: 실행 중 컨테이너 보존 (배포 전 컨테이너 값=10.41.1.120)
…
  DMA_HOST:  10.41.1.120 : 9100   ← 실제 컨테이너 값
```

**강등 경고(`⚠ DMA_HOST 가 이번 배포로 바뀝니다`)는 출력되지 않았고, 복구 배포도 필요하지
않았다.** 이 phase 의 배포 2회(16-26 `2cb5620` · 16-35 `c8aa7ae`)를 망가뜨린 회귀 경로가
**프로덕션에서 처음으로 닫힌 것이 확인됐다.**

배포 후 실측 (16-46 실행자가 **독립 재측정**):

```
$ curl -s -w 'http=%{http_code}' https://dma.jx1.io/healthz
{"status":"ok","vpn":true,"dma":true,"version":"a1f4ed6",
 "sessionCount":1,"everReadyCount":1,"stalledCount":0}
http=200

$ docker inspect gh-radar-relay …
APP_VERSION=a1f4ed6
DMA_HOST=10.41.1.120
DMA_PORT=9100
이미지: asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:a1f4ed6
```

`/healthz` 전 필드: `status=ok` · `vpn=true` · `dma=true` · `version=a1f4ed6` ·
`sessionCount=1` · `everReadyCount=1` · `stalledCount=0`.

### server — **근거를 갖고 건너뛰었다** (「배포 누락」이 아니다)

16-35 의 판정 방식(`git diff` 가 비면 건너뛴다)을 이번에는 **한 단계 더 밀어야 했다.**
diff 가 비어 있지 **않기** 때문이다.

```
$ git diff --stat 2cb5620..HEAD -- server/ packages/shared/
 packages/shared/src/relay.ts | 20 ++++++++++++++++++++
 1 file changed, 20 insertions(+)
```

그럼에도 재배포가 **기능적 no-op** 인 근거 3겹:

1. **`server/` 는 0줄**이다. 바뀐 것은 `packages/shared/src/relay.ts` 하나뿐이다.
2. **그 +20줄이 전부 `type` 선언과 주석**이다 — `RelayLimitChaser` 에 `name?`·`code?` 추가,
   `RelayLimitChaserInput` 의 `Omit` 에 두 키 추가. **런타임 코드 0줄**(타입은 컴파일에서 소거).
3. **server 는 이 계약을 import 하지 않는다** — `grep -rn "RelayLimitChaser\|/relay\"" server/src`
   = **0건**. server 가 `@gh-radar/shared` 에서 쓰는 것은 `SHORT_CODE_RE`·`DmaOrderRow`·
   `Stock`·`Market` 등이고 relay 계약은 소비처가 없다.

현재 server: 리비전 **`gh-radar-server-00043-s4f`**(16-26 배포분) · `GET /api/health` →
`{"status":"ok","version":"2cb5620"}` · `smoke-server.sh` **15/15**.

> ⚠️ **다음 사람에게.** 이 줄을 「배포를 빠뜨렸다」로 읽지 말 것. **근거를 갖고 건너뛴 것**이며,
> `version` 문자열이 `2cb5620` 인 것은 회귀가 아니라 그 결정의 결과다.

### webapp — **이 phase 처음으로 「정황」이 아니라 「내용」으로 증명됐다**

16-26·16-35 는 webapp 반영을 정황(빌드 시간·alias·공개 HTML 마커)으로만 증명할 수 있었다.
이번에는 **공개 청크 해시를 로컬 빌드 산출물과 직접 대조**해 내용으로 이었다.

**증명된 것:**

1. **공개 청크 20개 중 18개가 로컬 `pnpm build`(HEAD `a1f4ed6`) 산출물과 해시 완전 일치.**
2. 나머지 2개도 **코드 차이가 아니다**:
   - `2345-c0133ca9890ddb86.js` — 프로덕션은 `NEXT_PUBLIC_RELAY_WS_URL` 을
     `"wss://dma.jx1.io/ws"` 로 **빌드 타임 인라인**하고, 로컬 빌드는 그 env 가 없어 런타임
     참조로 남는다. 그 한 줄 차이가 minifier 변수명 리플을 일으킨다.
   - `6011-…` — 위 리플로 인한 **변수명만** 다르다(토큰 diff 3블록 전부 `l`↔`o` 류).
3. **갭 4 의 webapp 측이 라이브임이 내용으로 확인됐다.** 일치한 청크
   `2422-ff4cf64d654c9829.js`(app-sidebar 포함 — 「주 메뉴」·「상승률 상위」 검출) 안의
   `useIsinLabels` 모듈:

   ```js
   49821:(e,a,t)=>{ … function l(){let{accountStates:e,viOrders:a,limitChasers:t}=(0,n._)();
     return(0,r.useMemo)(()=>{ … for(let e of a)n(e.isin,{name:e.name});
     for(let e of t)n(e.isin,{name:e.name,code:e.code});return r},[e,a,t])}}
   ```

   `limitChasers` 순회가 **`viOrders` 뒤**에 있고 의존성이 3축이다 — 16-42 의 「맨 뒤에 둔다」
   병합 규율까지 그대로다.
4. 프로덕션 HTML 회귀 없음: `GET /` 200 · 「상승률 상위」 **2건** · `data-nav-item` **1건**.

**따라서 갭 4 의 두 축(relay 16-41 + webapp 16-42)이 프로덕션에서 함께 라이브다** — 사용자가
보고한 사이드바 ISIN 증상이 사라지는 조건이 처음으로 충족됐다.

**증명하지 못한 것(정직 기록):** 인증 게이트 뒤 라우트 청크(`/trading/*`·`/me`)는 미인증으로
내려받을 수 없어 **여전히 내용 대조가 불가능**하다. 16-42 의 나머지 두 변경
(`limit-chaser-form` 철거 면제 · `vi-order-list` 문구)은 그 청크에 있다. 로그인 상태의 화면
확인은 §Manual-Only 소관이다.

### smoke 결과 (실측 전문)

`scripts/smoke-relay.sh` — **PASS 12 · FAIL 0 · SKIP 1**

```
  INV-1 VM radar-gw RUNNING ... PASS
  INV-2 방화벽 4규칙 (gh-radar-vpc) ... PASS
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

`scripts/smoke-server.sh https://gh-radar-server-fnbhvevuva-du.a.run.app` —
**PASS 15 · FAIL 0 · SKIP 0** (INV-1~12d 전량, 이전 라운드와 동일 항목).

**두 가지를 명시한다:**

- **`INV-2` 문구가 「방화벽 3규칙」 → 「4규칙」으로 바뀌었다.** 동시 진행 중이던 다른 세션
  (`quick-260909-t08`, WireGuard 터널)이 규칙을 추가한 결과이며 **phase 16 소관이 아니다.**
  RELAY-03 요구사항 문장의 「방화벽 3규칙」과 어긋나므로 그 세션이 정합을 맡아야 한다.
- **`INV-5a` 는 이번엔 시각 의존이 아니었다.** 16-35 가 열린 항목으로 남긴 「5분 뒤 503 이
  되어 FAIL 로 바뀐다」는 **게이트웨이가 없을 때만** 발현한다. 이번에는 실 게이트웨이가
  붙어 `stalledCount:0` 이라 5분 뒤에도 200 이다. 그 열린 항목은 **해소된 것이 아니라
  조건이 성립하지 않았을 뿐**이므로 §Deferred 에 유지한다.

### INV-9 — **돌렸는데 SKIP 이 아니다. 토큰이 없어 못 돌렸다**

`SMOKE_AUTH_TOKEN` 이 없어 `ws_order_probe()` 첫 줄에서 **조기 반환**했다. 프로브 본체는
**한 줄도 실행되지 않았다.** 16-21 이 이 프로브를 relay wss 주문 왕복으로 재작성한 뒤
**프로덕션 첫 실행은 여전히 미수행**이며, 16-45(R2-IN-05)가 고친 「판정이 파이프에서 잘리는」
경로도 조기 반환 갈래를 지나가지 않으므로 **프로덕션에서는 미검증**이다.

토큰은 로그인 브라우저 세션 JWT(약 1시간 만료)라 **저장소 어디에도 값이 없는 것이 정상**이다
(T-16-74). 이 문서·SUMMARY·커밋·로그 어디에도 값을 남기지 않았다.

### 알림 · uptime check

`gh-radar-relay-down` = `enabled=True`. `/healthz` 가 200 이므로 발화 근거는 해소돼 있으나,
**인시던트가 닫히는 이벤트 자체는 관측하지 않았다**(이전 두 라운드와 동일). 알림 정책 변경은
사용자 결정 사항이라 실행자가 단독으로 고르지 않았다(§Deferred).

### 이 배포가 바꾸지 않는 것 (과장 방지)

- **WinForms ↔ 웹 「한 세션」 동기화는 여전히 한 번도 관측되지 않았다.** `everReadyCount: 1`
  은 「relay 가 게이트웨이에 붙어 DMA 세션이 Ready 상태에 도달했다」까지만 말한다.
  **「WinForms 와 전략·체결·미체결이 즉시 공유된다」는 뜻이 아니다** — 후자는 relay 가 같은
  DMA 세션을 쓴다는 구조에서 파생될 것으로 **기대되는** 결과이지 관측된 사실이 아니다.
- **실주문을 내는 검증을 하지 않았다** (D-27 — 사용자 명시 지시 없이는 하지 않는다).
- 따라서 **TRADE-03 은 Pending 을 유지한다.** 다만 Pending 사유가 갱신됐다 — 아래 참조.

#### 후속 (2026-09-10 ~ 09-11) — 위 문단의 전제가 뒤집혔다

**「WinForms ↔ 웹 「한 세션」 동기화는 여전히 한 번도 관측되지 않았다」는 2026-09-09 기준 사실이었고, 지금은 아니다.** 위 문단은 그 시점의 기록이므로 고치지 않고 여기에 후속을 남긴다.

- **2026-09-10 (`quick-260910-ogq`)** — 사용자가 장중 실계좌에서 **양방향을 직접 관찰**했다. 웹 `/trading/limit-chaser` 조작 → WinForms 반영, WinForms 조작 → 웹 반영. 이 항목은 `16-VERIFICATION.md` §Human Verification Required #1 이 애초에 **human-only** 로 지정한 것이라 사용자 관찰이 **의도된 증거 형태**다. 이를 근거로 **TRADE-03 · RELAY-02 를 Pending → Complete** 로 재판정했다.
- **2026-09-11** — 그 관찰에 남아 있던 마지막 단서가 해소됐다. 「웹에서 매수전략 OFF → WinForms **메인폼 전략목록에서는 사라지나 종목창 매수주문 체크박스는 미반영**」이 관측됐었고, 이는 **gh-trade(WinForms) 클라이언트 측 결함**이다 — relay 는 `crud:"D"` 를 정상 전달했고 **그 증거가 메인폼 목록 제거**다. 사용자가 gh-trade 에서 수정했고 **주문 끄기까지 정상 동작을 확인**했다. 철거 방향을 포함한 양방향 동기화가 완전히 관측됐다.
- **gh-radar 측에는 같은 결함이 없다.** 웹 상따 폼은 철거를 다른 단말에서 받으면 `server === null` 분기에서 폼을 리셋한다(`webapp/src/components/trading/limit-chaser-client.tsx:265-274` 의 `setResetSeq`). 비대칭은 WinForms 쪽에만 있었다. **이 phase 는 이 후속으로 소스 코드를 한 줄도 바꾸지 않았다.**
- **이 후속이 바꾸지 않는 것:** smoke `INV-9` 는 `SMOKE_AUTH_TOKEN` 부재로 16-21 재작성 이후 **프로덕션 첫 실행 미수행** 그대로다 — TRADE-03 조항의 결손이 아니라 **프로브의 미실행**이다. 실주문을 내는 검증도 하지 않았다(D-27).

### TRADE-03 재판정 (사용자 결정, 2026-09-09)

사용자 선택: **② Pending 유지 — 잔여를 「WinForms ↔ 웹 한 세션 동기화 미실측」 1건으로 좁힌다.**

| 구분 | 내용 |
|------|------|
| **해소됨** | 「Ready 에 도달한 DMA 세션이 프로덕션에 한 건도 없다」 — **더 이상 참이 아니다.** `everReadyCount: 1` · `stalledCount: 0` · `dma: true` 를 배포 전·후 모두 실측 |
| **해소됨** | 「실서버 결선 전에 반드시 닫아야 한다」던 Critical 3건(R2-CR-01·02·03) 종결 + 코드 직접 대조 |
| **해소됨** | 코드가 프로덕션에 실제로 반영됨 — relay `a1f4ed6` 실컨테이너 확인 + webapp 청크 **내용** 대조 |
| **잔여 (1건)** | **WinForms ↔ 웹 「한 세션」 동기화 실측.** phase goal 의 핵심 문장이고 human-only 이며 D-27 상 사용자 명시 지시가 필요하다 |
| 별도 열린 항목 | smoke `INV-9` 프로덕션 첫 실행 (토큰 부재로 미수행) · RELAY-02 도 같은 기준으로 Pending 유지 |

**판정 기준을 RELAY-02 와 같게 유지한다** — 두 요구사항의 기준을 갈라 놓으면 다음 사람이
어느 쪽을 믿을지 모른다. 진전은 **잔여가 1건으로 좁혀졌다는 것**이다.

### ⚠️ 승인 기준 문구 확정 — `grep "10.41.1.120"` 0건은 **3라운드에서도 충족 불가**였다

1·2라운드에 이어 **세 라운드 연속** 같은 불일치를 관측했다(2라운드 실측 33건). 16-46 실측:

| 위치 | 결과 |
|------|------|
| `webapp/src` · `webapp/e2e` | **0건** ✅ |
| `relay/README.md` · `relay/src/dma/link-health.ts` | 잔존 — 산문·주석. README 는 **접속 금지 경고문 자체** |
| `scripts/deploy-relay.sh` · `scripts/setup-relay-iam.sh` | 잔존 — 실서버 주소 주입 시 **경고를 띄우는 가드**와 안내문 |
| `scripts/dma-tunnel.sh` · `dma-tunnel.ps1` · `install-vpn-menubar.sh` | 잔존 — **다른 세션(quick 260909-el9/t08)의 파일**, phase 16 소관 아님 |

**정본 계약을 여기서 확정한다.** 리터럴 0건이 아니라 **「접속 경로 0건」**이다:

> `grep -rn "10\.41\.1\.120" webapp/src webapp/e2e` = **0건** ∧
> relay·scripts 의 잔존이 전부 「경고·가드·주석·타 세션 파일」임이 확인될 것.

**다음 라운드는 이 문장을 그대로 인용할 것.** 리터럴 0건을 승인 기준으로 적으면 또 불일치한다.

### ⚠️ 새 함정 — `pnpm -r typecheck` 가 **낡은 `packages/shared/dist` 를 보고 통과한다**

16-41 이 실제로 데였다. `packages/shared/src/relay.ts` 를 고쳐도 소비처(relay·webapp)의
타입 체크는 **빌드된 `dist`** 를 보므로, `pnpm --filter @gh-radar/shared run build` 를 먼저
돌리지 않으면 **계약 변경이 타입 체크에 보이지 않는다.**

이것은 §Test Infrastructure 가 이미 기록한 **「절대 실패할 수 없는 검증 명령」 계열의 새
사례**다(앞선 둘: `pnpm --filter gh-radar-webapp` = `No projects matched` + exit 0 · relay
`tests/` 가 루트 typecheck 밖).

**정본 순서 (계약을 건드리는 라운드에서는 반드시):**

```bash
pnpm --filter @gh-radar/shared run build   # ← 이것을 빼면 아래가 낡은 dist 를 본다
pnpm -r typecheck
pnpm --filter @gh-radar/relay run typecheck:tests
pnpm -r test
pnpm build
pnpm --filter @gh-radar/webapp test:e2e
```

### 이 라운드가 드러낸 것 — 다음 라운드가 반복하지 말 것

| 항목 | 내용 |
|------|------|
| **계획·리뷰의 불완전함이 6번 잡혔다** | 16-37(R2 가 `session_rejected` 진입 경로를 하나만 언급 — 실제로는 등록 계좌 0건도) · 16-38(계획 grep 이 한 줄짜리만 잡아 유출 지점 6곳 누락, 실제 13곳) · 16-39(계획 판정식이 없애려는 결함을 그대로 재현) · 16-40(R2-WR-04 재현 조건이 실제와 달라 수정 전에도 통과) · 16-43(`"A"` 채택 반대 근거를 게이트웨이 원본에서 발견) · 16-44(두 `off` 갈래 중 하나는 오늘 코드로 도달 불가). **실행자가 코드에서 재확인하는 규율이 없었으면 그대로 새 결함이 됐을 자리다** |
| **기존 테스트가 결함을 「진실」로 잠근 사례 3건 추가** | 16-36 의 ⑰-e·⑰-e2(헬퍼 기본값 `buyEnabled:true` 가 케이스 전제를 오염) · 16-39 의 ⓽(`toHaveLength(1)` 이 옛 구현을 베낀 단언). **2라운드 3건과 합쳐 이 phase 누적 6건.** 갭을 고칠 때 깨지는 기존 테스트가 곧 회귀 신호는 아니다 — 그 단언이 옛 구현을 베낀 것인지 먼저 확인할 것 |
| **REVIEW 의 Fix 스니펫은 방향이지 정답이 아니다** | 2라운드 GC-WR-03 에 이어 이번에도 반복 확인됐다 |
| **16-45 만 회귀 잠금 자동 테스트가 없다** | 배포 스크립트는 vitest 가 볼 수 없다. 실증은 이번 무주입 배포 **한 번**뿐이며, 다음 배포에서 다시 관측해야 「재발하지 않는다」가 된다 |
| **16-44 의 `#register` 갈래는 잠기지 않았다** | 오늘의 코드로 도달 불가라 하네스로 유발할 수 없다. 그 갈래를 지워도 빨개지는 테스트가 0건이다 — 지우면 안 되지만 **테스트가 지켜 주지도 않는다** |
| **포매터를 돌리지 않는다** | 이 저장소에 prettier 설정이 없다(16-30 사고, 459 insertions, 되돌림). 3라운드도 돌리지 않았다 |
