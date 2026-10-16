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
| 32-01-01 | 01 | 1 | AXIS-03 · AXIS-04(D-20 · D-12 · 트레이서) | — | N/A | unit + component + e2e | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/account-label.test.ts src/lib/__tests__/trading-layout.test.ts src/components/me/__tests__/account-chips.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32-chips" --workers=1` | ❌ W0 account-label · account-chips 신규 | ⬜ pending |
| 32-01-02 | 01 | 1 | AXIS-03(D-21 · D-27 끄기 UI 제거) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32-\| [12348]\. "` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-01-03 | 01 | 1 | AXIS-02~05 문구(REQUIREMENTS · ROADMAP 14플랜) | — | N/A | doc check | 가드 명령 → `WORDING_APPLIED` 또는 `WORDING_DEFERRED`(다른 세션 미커밋) | ✅ | ⬜ pending |
| 32-02-01 | 02 | 2 | AXIS-04(D-23 · Pitfall 10 · 트레이서) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/today-orders-card.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32-orders"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-02-02 | 02 | 2 | AXIS-04(D-22) | — | N/A | component + e2e | `… vitest run src/components/orderbook/__tests__/account-panel.test.tsx src/components/trading/__tests__/me-client.test.tsx src/components/trading/__tests__/today-orders-card.test.tsx --maxWorkers=2` · typecheck · `playwright … me.spec.ts` 전체 | ✅ · ❌ 케이스 | ⬜ pending |
| 32-02-03 | 02 | 2 | D-19 웨이브 ① 단독 push | — | N/A | checkpoint:decision | — (auto_select defer) | — | ⬜ pending |
| 32-03-01 | 03 | 3 | AXIS-02(D-05 · D-06 · D-07 · 트레이서) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/workbench-status-bar.test.tsx --maxWorkers=2` · `playwright … trading-workbench.spec.ts a11y.spec.ts -g "P32-top\|aria-live\|live"` | ✅ · ❌(갱신) | ⬜ pending |
| 32-03-02 | 03 | 3 | AXIS-02(D-06 · Pitfall 4 · 8) | — | N/A | unit + e2e | typecheck · `… vitest run src/lib/__tests__/queued-window.test.ts src/lib/__tests__/quote-state.test.ts` · `playwright … trading-workbench order-log unfilled-progress stock-detail-tabs` | ✅ | ⬜ pending |
| 32-03-03 | 03 | 3 | AXIS-02(D-15) | — | N/A | component | `… vitest run src/components/me/__tests__/device-settings-card.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` | ❌ W0 device-settings-card 신규(tone 이전) | ⬜ pending |
| 32-04-01 | 04 | 4 | AXIS-01(D-01 · 트레이서) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/card-grid.test.tsx --maxWorkers=2` · `playwright … trading-workbench.spec.ts -g "P32-scope"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-04-02 | 04 | 4 | AXIS-01(D-04 · Pitfall 5 · 6) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/card-grid.test.tsx --maxWorkers=2` · `playwright … -g "P32-focus\|P32-scope"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-04-03 | 04 | 4 | AXIS-01(D-03) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/alert-toasts.test.tsx src/lib/__tests__/trading-alerts.test.ts src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` · typecheck · `playwright … trading-workbench.spec.ts a11y.spec.ts` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-05-01 | 05 | 5 | AXIS-01(D-02 · 트레이서) | — | N/A | component + e2e | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` · `playwright … sidebar-tree.spec.ts -g "P32-sidebar"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-05-02 | 05 | 5 | AXIS-01(D-02 · D-04) | — | N/A | component + e2e | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` · `playwright … sidebar-tree.spec.ts` 전체 | ✅ · ❌ 케이스 | ⬜ pending |
| 32-06-01 | 06 | 6 | AXIS-03(D-09 보정 · 트레이서) | — | 새 메시지 타입 — 구 relay 는 4400(fail-safe) | integration + e2e | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "P32" --maxWorkers=2` · `playwright … me.spec.ts -g "P32-disable"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-06-02 | 06 | 6 | AXIS-03(D-09 보정) | — | 계좌 대조 `#accountAllowed`(IDOR 거부) | unit + integration | `… relay exec vitest run tests/fanout-multi-session.test.ts tests/hub-multi-session.test.ts tests/protocol.test.ts tests/fanout-access.test.ts tests/fanout.test.ts --maxWorkers=2` · relay typecheck 2종 | ✅ · ❌ 케이스 | ⬜ pending |
| 32-06-03 | 06 | 6 | AXIS-03(D-21 · D-27 · S5′) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/strategy-status-card.test.tsx src/lib/__tests__/relay-socket.test.ts --maxWorkers=2` · typecheck · `playwright … me.spec.ts` 전체 | ✅ · ❌ 케이스 | ⬜ pending |
| 32-07-01 | 07 | 7 | AXIS-05(D-14a · 트레이서 relay) | — | 지정 서버는 그 사용자 세션 맵에서만 · 없으면 primary 로 떨어뜨리지 않음 | integration | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "P32\|Phase 27" --maxWorkers=2` · webapp typecheck | ✅ · ❌ 케이스 | ⬜ pending |
| 32-07-02 | 07 | 7 | AXIS-05(D-14a · Pitfall 11 · 13 · A3) | — | N/A | unit + integration | `… relay exec vitest run tests/hub-multi-session.test.ts tests/hub.test.ts tests/fanout-multi-session.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts tests/fanout.test.ts --maxWorkers=2` · relay typecheck 2종 | ✅ · ❌(262-330 · 657-676 갱신) | ⬜ pending |
| 32-08-01 | 08 | 8 | AXIS-05(D-14a · D-24 · 트레이서 웹) | — | N/A | e2e | webapp typecheck · `playwright … me.spec.ts -g "P32-settings\|P27-M1\|P31-5"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-08-02 | 08 | 8 | AXIS-05(D-14b · Pitfall 14) | — | N/A | unit + component | `… vitest run src/lib/__tests__/user-settings-server.test.ts src/lib/__tests__/relay-socket.test.ts src/components/me/__tests__/limit-chaser-defaults.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx src/lib/__tests__/limit-chaser.test.ts --maxWorkers=2` | ❌ W0 user-settings-server 신규 | ⬜ pending |
| 32-09-01 | 09 | 9 | AXIS-05(D-24 · S8′ · 트레이서) | — | N/A | component + e2e | `… vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx --maxWorkers=2` · `playwright … me.spec.ts -g "P32-settings\|P27-M1\|P31-5\|PEY-3"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-09-02 | 09 | 9 | AXIS-04 · AXIS-05(Pitfall 12 · S13 잠금) | — | N/A | component + e2e | `… vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` · typecheck · `playwright … me.spec.ts` 전체 | ✅ · ❌ 케이스 | ⬜ pending |
| 32-10-01 | 10 | 10 | AXIS-01~05(D-19 · UI backstop) | — | N/A | full suite + e2e | `playwright … account-axis-backstop.spec.ts` · build_command + 세 워크스페이스 vitest 전체 · E2E 7 spec `--workers=1` | ❌ W0 account-axis-backstop.spec 신규 | ⬜ pending |
| 32-10-02 | 10 | 10 | D-19 배포(relay 20:00 KST 뒤 → push) | — | N/A | manual(메인 세션) | relay deploy → smoke → push | — | ⬜ pending |
| 32-10-03 | 10 | 10 | AXIS-05 라이브(ROADMAP SC5) | — | N/A | auto + manual UAT | `git fetch -q origin && test -z "$(git log origin/master..HEAD --oneline -- relay webapp packages)"` → PUSHED · human-check KB120 · KYOBO119 | — | ⬜ pending |
| 32-11-01 | 11 | 11 | AXIS-01(D-17 one-way 결정) | — | N/A | checkpoint:decision | — (auto_select 없음 — 사람 결정 · 권고안 아니면 32-13 acceptance 수정 뒤 실행) | — | ⬜ pending |
| 32-11-02 | 11 | 11 | AXIS-01(D-17 · 트레이서) | — | N/A | unit + integration | `… relay exec vitest run src/dma/__tests__/envelope.test.ts tests/hub-multi-session.test.ts tests/fanout.test.ts -t "P32" --maxWorkers=2` · webapp typecheck · relay-socket | ✅ · ❌ 케이스(헬퍼 `respondViSlots` 신규) | ⬜ pending |
| 32-11-03 | 11 | 11 | AXIS-01(D-17 · D-16 호환) | — | vi.set 소유 세션만 · 서버 간 가드 제거 | unit + integration | relay typecheck 2종 · `pnpm --filter @gh-radar/relay run test` · SUMMARY `relay_commit` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-12-01 | 12 | 12 | AXIS-01(D-18 · 트레이서) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/vi-settings-rows.test.tsx --maxWorkers=2` · `playwright … trading-workbench.spec.ts -g "P32-vi"` | ✅ · ❌ 케이스(픽스처 `seedViSlots`) | ⬜ pending |
| 32-12-02 | 12 | 12 | AXIS-01(D-18) | — | N/A | component + e2e | `… vitest run src/components/trading/__tests__/vi-settings-rows.test.tsx --maxWorkers=2` · typecheck · `playwright … trading-workbench.spec.ts -g "VI\|P32-vi"` | ✅ | ⬜ pending |
| 32-13-01 | 13 | 13 | AXIS-01 · AXIS-03(D-18 · S3 · 트레이서) | — | N/A | component + e2e | typecheck · `… vitest run strategy-status-card me-client app-sidebar trading-workbench --maxWorkers=2` · `playwright … me.spec.ts sidebar-tree.spec.ts -g "P32-vi-me\|P32-sidebar-vi"` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-13-02 | 13 | 13 | AXIS-01(D-17 권고안 전제) | — | N/A | unit + component + e2e | typecheck · `… vitest run src/lib src/components/trading src/components/layout --maxWorkers=2`(relay-provider.test 포함) · `playwright … trading-workbench me sidebar-tree a11y` | ✅ · ❌ 케이스 | ⬜ pending |
| 32-14-01 | 14 | 14 | D-16 · D-26 relay ④ 배포 · gh-trade 회신 | — | N/A | manual(메인 세션) | relay deploy(20:00 KST 뒤) → smoke → SendMessage | — | ⬜ pending |
| 32-14-02 | 14 | 14 | D-26 webapp ④ push | — | N/A | manual(메인 세션) | gh-trade 서버 배포 확인 → push | — | ⬜ pending |
| 32-14-03 | 14 | 14 | AXIS-01(D-18 UAT · 인박스 닫기) | — | N/A | auto + manual UAT | 노트 `status: done` · `done_commit`(= 32-11 `relay_commit`) 커밋 존재 · 회신 절 → NOTE_CLOSED · human-check 교보119 | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `webapp/src/lib/__tests__/account-label.test.ts` · `webapp/src/components/me/__tests__/account-chips.test.tsx` — 32-01 이 만든다(D-12 · D-20)
- [ ] `webapp/src/components/me/__tests__/device-settings-card.test.tsx` — 32-03 이 만든다(`workbench-status-bar.test.tsx` 187-232 tone 이전 · D-15)
- [ ] `webapp/src/lib/__tests__/user-settings-server.test.ts` — 32-08 이 만든다(서버별 84 조회 · 시딩)
- [ ] `webapp/e2e/specs/account-axis-backstop.spec.ts` — 32-10 이 만든다(S1 · S3 · S4 · S9 · S13 · S8′ 백스톱)
- [ ] `relay/tests/helpers/frames.ts` `unregistered` · `fake-gateway.ts` `respondViSlots`(21 → 선언 계좌마다 61) — 32-11 이 만든다 · `webapp/e2e/fixtures/relay.ts` `seedViSlots` — 32-12 가 만든다
- [ ] (선택) `webapp/e2e/fixtures/relay.ts` 다중 서버 옵션 — 두 번째 스텁 게이트웨이 + `DMA_KYOBO_HOST/PORT` + 접근 맵 KYOBO 행. 이 phase 는 만들지 않는다 — 다중 서버는 relay 통합 테스트(`fanout-multi-session` · `hub-multi-session`)와 라이브 UAT(32-10 · 32-14)로 증명

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| relay 배포 뒤 KB120 · KYOBO119 에서 서로 다른 매매설정 값이 보이고, 각 서버 저장이 그 서버에만 반영된다 | AXIS-05 | 웹 E2E 하네스는 단일 세션 — 실서버 2대 필요 | 20:00 KST 뒤 relay 배포 → /me 계좌 칩으로 KB · 교보 계좌 전환(설정 탭 서버 = 고른 계좌의 서버 · D-24) · 저장 → Cloud Logging `relay_docker` 42 송신 서버키 확인 · 다른 서버 값 불변 확인 |
| 교보119 VI 계좌별 실증 | AXIS-01(④) | gh-trade 서버 배포 뒤 실계좌 | relay ④ → gh-trade 서버 배포 → push 뒤 작업대 계좌별 VI 행 등록 · KB · 교보 동시 가동 · 사이드바 계좌 묶음 · /me 고른 계좌 VI 행 확인(32-14) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
