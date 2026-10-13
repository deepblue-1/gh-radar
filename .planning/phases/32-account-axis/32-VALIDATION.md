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
| 32-XX-XX | — | — | AXIS-01~05 | — | N/A | — | 플래너가 PLAN.md 확정 뒤 `32-RESEARCH.md` § Phase Requirements → Test Map 을 태스크 단위로 옮긴다 | — | ⬜ pending |

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
