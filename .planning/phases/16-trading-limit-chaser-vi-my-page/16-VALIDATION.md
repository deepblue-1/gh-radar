---
phase: 16
slug: trading-limit-chaser-vi-my-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-08
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 원천: `16-RESEARCH.md` §Validation Architecture (2026-09-08 실측). Task ID 열은 planner 가 PLAN.md 작성 후 채운다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.1.9 (+ @testing-library/react ^16.3.2, jsdom ^29 — webapp) · vitest (relay/server/shared) · Playwright ^1.59.1 (+ @axe-core/playwright) — E2E |
| **Config file** | 각 워크스페이스 `vitest.config.*` · `webapp/playwright.config.*` |
| **Quick run command** | `pnpm typecheck && pnpm --filter @gh-radar/relay test` (relay 작업) / `pnpm typecheck && pnpm --filter gh-radar-webapp test` (webapp 작업) |
| **Full suite command** | `pnpm typecheck && pnpm -r test && pnpm --filter gh-radar-webapp test:e2e` |
| **Estimated runtime** | 단위 ~30–60초 · E2E 전량 ~5–8분 (8090 relay 포트 직렬화 필요, RESEARCH pitfall #20) |

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
| TBD | TBD | 0 | TRADE-03 | — | N/A | build | `../gh-trade/server/scripts/sync-relay-schema.sh --check` exits 0 (생성 코드 동기화) | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | TRADE-01 | — | N/A | source | `test -f webapp/src/components/ui/checkbox.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | TRADE-03 | — | N/A | fixture | `relay/tests/helpers/fake-gateway.ts` 에 `respondLimitChaserList`/`pushLimitChaserEcho`/`respondViTrigger`/`pushViOrderList`/`pushOrderResp` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TRADE-03 | T-16-05 | 화이트리스트 밖 MsgType 무시 | unit | `pnpm --filter @gh-radar/relay test -- codec` | ✅ 확장 | ⬜ pending |
| TBD | TBD | 1 | TRADE-03 | T-16-05 | deprecated 슬롯·위치 인자 미사용 | unit | `pnpm --filter @gh-radar/relay test -- envelope` | ✅ 확장 + ❌ 신규 케이스 | ⬜ pending |
| TBD | TBD | 1 | TRADE-03 | T-16-02 | 스냅샷 팬아웃은 `#deliver(userId)` 단일 경로 | unit | `pnpm --filter @gh-radar/relay test -- hub` / `-- fanout` | ✅ 확장 | ⬜ pending |
| TBD | TBD | 1 | TRADE-03 | T-16-01 / T-16-03 | `account_no ∈ session.allowedAccounts` · `rid` 연결 스코프 · 타임아웃 = 결과 모름 | unit | `pnpm --filter @gh-radar/relay test -- order` | ⚠ 재작성 (HTTP → wss) | ⬜ pending |
| TBD | TBD | 1 | TRADE-03 | — | `dma_orders` insert(자동주문 origin) + update 큐 | unit | `pnpm --filter @gh-radar/relay test -- order-store` | ✅ 확장 | ⬜ pending |
| TBD | TBD | 2 | TRADE-01 | — | N/A | unit | `pnpm --filter gh-radar-webapp test` (`limit-chaser.test.ts` — 수량 산출·전략 키·더티) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | TRADE-01 | — | N/A | unit(RTL) | `pnpm --filter gh-radar-webapp test` (`limit-chaser-form.test.tsx` — 스위치 즉시·둘 다 OFF=D·수정 버튼·에코 덮어쓰기) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | TRADE-02 | — | N/A | unit(RTL) | `pnpm --filter gh-radar-webapp test` (`vi-order-list.test.tsx` — 상태 6종·confirm_locked·데드라인) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | TRADE-02 | — | 시작/중지 확인 다이얼로그 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- trading-vi` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | NAV-01 | — | N/A | unit(RTL) | `pnpm --filter gh-radar-webapp test` (`app-sidebar.test.tsx` — 트리·aria-current·data-nav-item) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | NAV-01 | T-16-04 | 비로그인/`unauthorized` 시 트레이딩·My page 미렌더 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- auth-guards` | ✅ 확장 | ⬜ pending |
| TBD | TBD | 2 | MYPAGE-01 | T-16-04 | 전체 비활성화 확인 다이얼로그 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- me` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | 회귀 | — | N/A | e2e | `pnpm --filter gh-radar-webapp test:e2e -- orderbook` (전역 연결 승격 후 호가주문 탭) | ✅ | ⬜ pending |
| TBD | TBD | 2 | 회귀 | — | N/A | unit | `pnpm --filter gh-radar-webapp test` (`relay-socket.test.ts` 재접속·백오프) | ✅ | ⬜ pending |
| TBD | TBD | 3 | 회귀 | — | N/A | e2e | `pnpm --filter gh-radar-webapp test:e2e -- a11y` (신규 3표면 추가) | ✅ 확장 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `relay/src/generated/**` 재동기화 — `../gh-trade/server/scripts/sync-relay-schema.sh` (`cancelQtyTrackBaseline`·`orderTime` 접근자 누락, flatc 25.12.19 로컬 확인)
- [ ] `webapp/src/components/ui/checkbox.tsx` — `npx shadcn add checkbox` (신규 npm 의존성 없음)
- [ ] `relay/tests/helpers/fake-gateway.ts` — 전략 응답 주입 API: `respondLimitChaserList(items)` · `pushLimitChaserEcho(sock, cfg)` · `respondViTrigger(cfg)` · `pushViOrderList(sock, items, snap)` · `pushOrderResp(sock, notice)`
- [ ] `webapp/e2e/fixtures/relay.ts` — `LocalRelay` 인터페이스에 위 API 노출
- [ ] `webapp/src/components/trading/__tests__/` + 공용 픽스처(에코 1건·전략 목록 3건·VI 주문 5건)
- [ ] `webapp/e2e/specs/trading-limit-chaser.spec.ts` · `trading-vi.spec.ts` · `me.spec.ts` · `sidebar-tree.spec.ts` — 스텁
- [ ] `relay/tests/order-api.test.ts` → wss 주문 핸들러 테스트로 재작성
- [ ] `supabase/migrations/*_dma_orders_origin.sql` (D-03 재량 채택 시) + `supabase db push` [BLOCKING]

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WinForms ↔ 웹 「한 세션」 동기화 (웹 스위치 ON → WinForms 「무장」, WinForms 값 변경 → 웹 토스트+덮어쓰기) | TRADE-01 / TRADE-03 | 실 gh-trade 서버 + WinForms 클라이언트 필요. `dma_credentials` 0행(15-20 A안 skip-live) 상태에서는 불가 | 실서버 접속 시: WinForms 상따창과 `/trading/limit-chaser/[key]` 동시 열기 → 웹 스위치 ON → WinForms 무장 배지 확인 → WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인 |
| gh-trade mock 서버 대상 전략 왕복 (24/21/34 빈 Envelope → 60/61/73 응답) | TRADE-03 | 로컬 mock 바이너리 실행 필요 (`../gh-trade/server/scripts/run-mac.sh`) | relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인 |
| VI 마감알림 브라우저 Notification | TRADE-02 | Notification 권한은 headless 에서 실제 표시 불가 | 권한 허용 후 `vi_end_time` 임박 시 알림 표시 확인 (이 기기만) |
| 15:40 서버 자동 비활성화(61 Broadcast) 표시 | TRADE-02 | 서버 시각 의존 | 장 마감 후 VI 페이지에서 `run=false` 반영 + 로그 1줄 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (단위) / < 480s (E2E)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
