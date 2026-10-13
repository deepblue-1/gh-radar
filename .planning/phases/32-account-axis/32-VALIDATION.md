---
phase: "32"
slug: "account-axis"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-13"
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. 근거: `32-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (relay · shared) · vitest 2.1.9 (webapp) · Playwright 1.59.1 (webapp E2E — 진짜 relay + 스텁 게이트웨이 · 단일 세션) |
| **Config file** | `relay/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| **Quick run command** | relay `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts tests/fanout-multi-session.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts --maxWorkers=2` · webapp `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/today-orders-card.test.tsx src/components/trading/__tests__/card-grid.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/alert-toasts.test.tsx src/components/layout/__tests__/app-sidebar.test.tsx src/components/me/__tests__/limit-chaser-defaults.test.tsx src/lib/__tests__/relay-socket.test.ts --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| **E2E** | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts e2e/specs/a11y.spec.ts e2e/specs/sidebar-tree.spec.ts -g "P32" --workers=1` (새 케이스는 `P32-` 접두) · 회귀: `workbench-status-bar[data-status]` 대기 사용 spec(`order-log` · `unfilled-progress` · `stock-detail-tabs` 포함) |
| **Estimated runtime** | ~120 seconds (unit) · E2E 별도 |

주의: shared · server 의 `test` 스크립트는 watch 다 — 반드시 `exec vitest run`. 동시 세션이면 vitest `--maxWorkers=2` · playwright `--workers=1` (메모리 고갈 방지). 기준선 실측(2026-10-13): relay `hub-multi-session` + `fanout-multi-session` + `protocol` + `ws-autosell` 163 passed · webapp `workbench-status-bar` + `limit-chaser-defaults` + `relay-socket` 226 passed.

---

## Sampling Rate

- **After every task commit:** 해당 워크스페이스 quick 명령 (위 표의 파일 단위, `--maxWorkers=2`)
- **After every plan wave:** Full suite command (타입체크 포함 — `userSettings` → Map 승격, `RelayViTriggers` 교체는 컴파일 오류가 1차 안전망)
- **Before `/gsd-verify-work`:** Full suite green + E2E P32 · 회귀(`trading-workbench` · `me` · `a11y` · `sidebar-tree` · `order-log` · `unfilled-progress` · `stock-detail-tabs`) green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | AXIS-03 · AXIS-04(D-12 · D-13) | — | N/A | unit + component + e2e | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/account-label.test.ts src/components/trading/__tests__/account-pill.test.tsx src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32-status"` | ❌ W0 account-label · account-pill 신규 | ⬜ pending |
| 32-01-02 | 01 | 1 | AXIS-03(D-08 · D-11) | — | N/A | component | `… vitest run src/components/trading/__tests__/strategy-status-card.test.tsx src/components/orderbook/__tests__/account-panel.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-01-03 | 01 | 1 | AXIS-04(D-10) | — | N/A | unit + component + e2e | `… vitest run src/lib/__tests__/orders-api.test.ts src/lib/__tests__/trading-layout.test.ts src/components/trading/__tests__/today-orders-card.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32\|9\. B\|10\. B\|PEY-2"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-02-01 | 02 | 2 | AXIS-02(D-05 · D-06 · D-07) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` · `playwright … trading-workbench.spec.ts a11y.spec.ts -g "P32-top\|…"` | ✅ · ❌(갱신) | ⬜ pending |
| 32-02-02 | 02 | 2 | AXIS-02(D-15 · D-06) | — | N/A | component | `… vitest run src/components/me/__tests__/device-settings-card.test.tsx src/lib/__tests__/queued-window.test.ts src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` | ❌ W0 device-settings-card 신규(tone 이전) | ⬜ pending |
| 32-02-03 | 02 | 2 | AXIS-01(D-02) | — | N/A | component + e2e | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` · `playwright … sidebar-tree.spec.ts` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-03-01 | 03 | 3 | AXIS-01(D-01) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/card-grid.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/account-pill.test.tsx --maxWorkers=2` · `playwright … -g "P32-scope"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-03-02 | 03 | 3 | AXIS-01(D-04 · Pitfall 5 · 6) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` · `playwright … -g "P32-scope"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-03-03 | 03 | 3 | AXIS-01(D-03) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/alert-toasts.test.tsx src/lib/__tests__/trading-alerts.test.ts src/components/trading/__tests__/trading-workbench.test.tsx src/lib/__tests__/use-trading-alerts.test.tsx --maxWorkers=2` · `playwright … -g "P32\|GC8"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-04-01 | 04 | 2 | AXIS-03(D-09 보정) | — | 계좌 대조 `#accountAllowed` | unit + integration + e2e | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/protocol.test.ts tests/fanout-multi-session.test.ts -t "P32" --maxWorkers=2` · webapp relay-socket · strategy-status-card · `playwright … me.spec.ts -g "P32-disable"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-04-02 | 04 | 2 | AXIS-03(D-09) | — | IDOR 거부 | unit + integration | `… relay exec vitest run tests/fanout-multi-session.test.ts tests/hub-multi-session.test.ts tests/fanout-access.test.ts tests/protocol.test.ts --maxWorkers=2` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-04-03 | 04 | 2 | AXIS-03(D-09) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/strategy-status-card.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32\|4\. 전체\|3\. 전략 0"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-05-01 | 05 | 3 | AXIS-05(D-14a · D-14b) | — | 지정 서버는 그 사용자 세션 맵에서만 | integration + unit | `… relay exec vitest run tests/fanout-multi-session.test.ts -t "P32"` · webapp user-settings-server · relay-socket · limit-chaser-defaults · limit-chaser-form | ❌ W0 user-settings-server 신규 | ⬜ pending |
| 32-05-02 | 05 | 3 | AXIS-05(D-14a) | — | N/A | unit + integration | `… relay exec vitest run tests/hub-multi-session.test.ts tests/hub.test.ts tests/fanout-multi-session.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts tests/fanout.test.ts --maxWorkers=2` | ✅ · ❌(262-390 · 657-676 갱신) | ⬜ pending |
| 32-05-03 | 05 | 3 | AXIS-05(D-14) | — | N/A | component + e2e | `… vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx src/lib/__tests__/trading-layout.test.ts --maxWorkers=2` · `playwright … me.spec.ts -g "P32-settings\|P27-M1\|P31-5\|PEY-3"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-06-01 | 06 | 4 | AXIS-01~05(D-19 · UI backstop) | — | N/A | full suite + e2e | build_command · 세 워크스페이스 vitest 전체 · E2E 8 spec(`account-axis-backstop.spec.ts` 신규 포함) `--workers=1` | ❌ W0 backstop spec 신규 | ⬜ pending |
| 32-06-02 | 06 | 4 | D-19 배포 | — | N/A | manual(메인 세션) | relay deploy → smoke → push | — | ⬜ pending |
| 32-06-03 | 06 | 4 | AXIS-05 라이브 · D-09 라이브 | — | N/A | manual UAT | KB120 · KYOBO119 값 · 저장 단독 반영 · Cloud Logging 42 서버키 | — | ⬜ pending |
| 32-07-01 | 07 | 5 | AXIS-01(D-17 결정) | — | N/A | checkpoint:decision | `ls docs/inbox/from-gh-trade/*-vi-per-account.md && grep -q unregistered relay/src/generated/StockDMA.fbs && ! grep -q "server-repo-commit: 8d56ea53" relay/src/generated/StockDMA.fbs` (게이트) | — | ⬜ blocked(gh-trade 33) |
| 32-07-02 | 07 | 5 | AXIS-01(D-17 · D-18) | — | N/A | unit + integration | `… relay exec vitest run src/dma/__tests__/envelope.test.ts tests/hub-multi-session.test.ts -t "P32"` · webapp relay-socket · vi-settings-rows | ✅ · ❌(④) | ⬜ blocked |
| 32-07-03 | 07 | 5 | AXIS-01(D-17) | — | vi.set 소유 세션만 | unit + integration | `… relay exec vitest run tests/hub-multi-session.test.ts tests/fanout-multi-session.test.ts tests/hub.test.ts tests/fanout.test.ts src/dma/__tests__/envelope.test.ts --maxWorkers=2` | ✅ · ❌(④) | ⬜ blocked |
| 32-08-01 | 08 | 6 | AXIS-01(D-18) | — | N/A | component + e2e | `… vitest run src/lib/__tests__/relay-socket.test.ts src/components/trading/__tests__/vi-settings-rows.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` · `playwright … -g "P32-vi\|VI"` | ✅ · ❌(④) | ⬜ blocked |
| 32-08-02 | 08 | 6 | AXIS-01 · AXIS-03(D-18 · D-02) | — | N/A | component + e2e | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/me-client.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` · E2E me · sidebar-tree · trading-workbench · a11y | ✅ · ❌(④) | ⬜ blocked |
| 32-08-03 | 08 | 6 | AXIS-01(D-16 · D-18 UAT) | — | N/A | manual(메인 세션) | relay → gh-trade 서버 → push · 교보119 VI 실증 | — | ⬜ blocked |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `webapp/src/components/me/__tests__/` — 알림음(tone) 테스트를 옮길 파일(`workbench-status-bar.test.tsx` 187-232 이전 · D-15)
- [ ] `relay/tests/helpers/frames.ts` — `buildUserSettingsFrame` 그대로(서버는 세션이 정한다) · 계좌 끄기용 64 픽스처는 두 계좌 · 두 서버 소유 조합
- [ ] (선택) `webapp/e2e/fixtures/relay.ts` 다중 서버 옵션 — 두 번째 스텁 게이트웨이 + `DMA_KYOBO_HOST/PORT` + 접근 맵 KYOBO 행. 없으면 다중 서버는 relay 통합 테스트와 라이브 UAT 로 증명
- [ ] (④ · gh-trade Phase 33 뒤) `relay/tests/helpers/frames.ts` · `fake-gateway.ts` — 61 `unregistered` 빌드 · 21 응답 n 프레임 · 생성물 동기화 뒤

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| relay 배포 뒤 KB120 · KYOBO119 에서 서로 다른 매매설정 값이 보이고, 각 서버 저장이 그 서버에만 반영된다 | AXIS-05 | 웹 E2E 하네스는 단일 세션 — 실서버 2대 필요 | 20:00 KST 뒤 relay 배포 → /me 설정 탭 세그먼트 전환 · 저장 → Cloud Logging `relay_docker` 42 송신 서버키 확인 · 다른 서버 값 불변 확인 |
| 교보119 VI 계좌별 실증 | AXIS-01(④) | gh-trade 서버 배포 뒤 실계좌 | gh-trade Phase 33 배포 뒤 작업대 계좌별 VI 행 등록 · 사이드바 · /me 묶음 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
