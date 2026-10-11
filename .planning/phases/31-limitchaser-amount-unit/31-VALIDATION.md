---
phase: "31"
slug: "limitchaser-amount-unit"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-11"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. 근거: `31-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (relay · shared) · vitest 2.1.9 (webapp) · Playwright 1.59.1 (webapp E2E — 진짜 relay + fake gateway) |
| **Config file** | `relay/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| **Quick run command** | 워크스페이스별 파일 단위 — shared `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts` · relay `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts --maxWorkers=2` · webapp `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/lib/__tests__/numpad.test.ts src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/me/__tests__/limit-chaser-defaults.test.tsx --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| **E2E** | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "P31\|P20-3\|P24-7\|P24-8" --workers=1` |
| **Estimated runtime** | ~120 seconds (unit) · E2E 별도 |

주의: shared · server 의 `test` 스크립트는 watch 다 — 반드시 `exec vitest run`. 동시 세션이면 vitest `--maxWorkers=2` · playwright `--workers=1` (메모리 고갈 방지). 기준선 실측: relay envelope+protocol 261 passed · webapp 관련 4파일 286 passed.

---

## Sampling Rate

- **After every task commit:** 해당 워크스페이스 quick 명령 (위 표의 파일 단위, `--maxWorkers=2`)
- **After every plan wave:** Full suite command (타입체크 포함 — 금액 키 전환은 컴파일 오류가 1차 안전망)
- **Before `/gsd-verify-work`:** Full suite green + E2E P31 · 백스톱(P20-3 · P24-7 · P24-8, 390 · 1080) green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | AMT-01 | — | N/A | script check | `RELAY=/Users/alex/repos/gh-radar/relay <gh-trade master worktree>/server/scripts/sync-relay-schema.sh --check` + 마커 해시 비교 | ✅ | ⬜ pending |
| TBD | TBD | TBD | AMT-02 | — | N/A | unit (shared 환산·짝·메모) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AMT-02 | — | N/A | unit (relay zod · 조립 · 파서) | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-02 | — | N/A | integration (fanout → fake gateway) | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-02 | — | N/A | unit (webapp formFromServer · buildCfg · 훅 성공 판정) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-04 | — | N/A | component (시트 · 두 줄 행 · 폼 문구) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx src/lib/__tests__/numpad.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-03 | — | N/A | component (/me 행 교체 · 42/84) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-03 | — | N/A | unit (relay 42 봉인 0 · 84 파서) | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-02~04 | — | N/A | e2e (P31 · 백스톱) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "P31\|P20-3\|P24-7\|P24-8" --workers=1` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-04 (D-19) | — | N/A | unit (shared ⑦ 주문로그 수량 토큰 「N만(M주)」/「X.Y억(M주)」 · ev_price 환산 골든) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/order-log/__tests__/order-log-list.test.tsx src/lib/__tests__/order-timeline.test.ts --maxWorkers=2` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | AMT-04 | — | N/A | doc check (인박스 노트 닫기) | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md` | ✅ | ⬜ pending |
| TBD | TBD | TBD | AMT-04 (D-20) | — | N/A | doc check (두 번째 노트 닫기) | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261011-amount-eok-and-limit-evprice.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261011-amount-eok-and-limit-evprice.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — Task ID · Plan · Wave 는 플래너가 PLAN.md 확정 뒤 채운다.*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/__tests__/lc-amount.test.ts` — 환산 · 짝 · 메모 · 검증표 (신규)
- [ ] `relay/tests/helpers/frames.ts` — `LimitChaserFrameInput` +8 금액 · `FakeUserSettingsInput` +`postBuyFloorAmount`
- [ ] `relay/tests/helpers/fake-gateway.ts` — `SetLimitChaserRequest` +8 금액 · `SetUserSettingsRequest` +`postBuyFloorAmount`
- [ ] `webapp/src/test-fixtures/limit-chaser.ts` — `RelayLimitChaser` 8 금액(기본 0) · 폼 픽스처 금액 키
- [ ] e2e 84 픽스처(`me.spec.ts` · `a11y.spec.ts` · `trading-workbench.spec.ts`) — `postBuyFloorAmount` 추가

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| gh-trade 서버 배포 뒤 C# 만원 입력 종목 → 웹 재제출 → 60 에코 금액 원값 · 84 amount | AMT-02 · AMT-03 | 실서버(gh-trade) 의존 · 구 서버는 vtable 158~172 무시 | 배포 뒤 Cloud Logging `relay_docker` + 상따 화면 · /me 화면에서 사람이 확인 |
| relay 선배포 → Vercel 고유 URL 미리보기 확인 | AMT-02 · AMT-04 | 배포는 메인 세션 체크포인트(서브에이전트 배포는 분류기 차단) | relay 먼저 · 미리보기 나중 (RESEARCH Pitfall 10) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
