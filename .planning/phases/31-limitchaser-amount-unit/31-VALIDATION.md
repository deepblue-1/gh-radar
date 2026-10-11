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
| 31-01-01 | 31-01 | 1 | AMT-02 · AMT-04 | — | N/A | integration (트레이서 — relay lc.set 금액 → 10 → 60 에코 → lc) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "P31"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-01-01 | 31-01 | 1 | AMT-02 | — | N/A | component (트레이서 — 매도 「매수잔량」 만원 한 칸 행 → cfg → 에코 → 행) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/lc-tracer.test.tsx -t "P31"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-01-02 | 31-01 | 1 | AMT-02 · AMT-04 | — | N/A | unit (shared 환산 · 짝 · 메모 · 정정표 · int.Max · BigInt) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts` | ❌ W0 | ⬜ pending |
| 31-01-02 | 31-01 | 1 | AMT-02 | — | N/A | unit (relay zod 8 선택 · 조립 158~172 · 파서 · 부재 0) | `pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts tests/fanout.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-01-03 | 31-01 | 1 | AMT-02 | — | N/A | unit (webapp formFromServer · isMasterOnlyDelta · 훅 짝 성공 판정 · PadUnit 「만」) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/lib/__tests__/numpad.test.ts src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-02-01 | 31-02 | 1 | AMT-04 | — | N/A | component (두 줄 행 56px · lc-row-sub · 톤 · L4) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/two-line-row.test.tsx src/components/trading/lc/__tests__/setting-group.test.tsx` | ❌ W0 (two-line-row 신규) | ⬜ pending |
| 31-02-02 | 31-02 | 1 | AMT-04 | — | N/A | component (인라인 subOf · 시트 hint · 상태 줄 우선순위) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/inline-value-editor.test.tsx src/components/trading/lc/__tests__/number-pad-sheet.test.tsx -t "P31"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-03-01 | 31-03 | 2 | AMT-03 | — | N/A | unit + integration (relay 42 봉인 0 · 84 금액 · 구 탭 84 캐시 되싣기 · 캐시 없음 비종료 거부) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/ws-autosell.test.ts src/dma/__tests__/envelope.test.ts -t "P31"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-03-02 | 31-03 | 2 | AMT-03 | — | N/A | component (/me 「후매수 최소」 행 교체 · 42 12값 · 금액 부재 = 불러오는 중) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-04-01 | 31-04 | 2 | AMT-02 · AMT-04 | — | N/A | unit (폼 모델 8칸 만원 · 기본 0 · 상장주식수 만원 시딩 · 자동 체크 환산 주) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-04-02 | 31-04 | 2 | AMT-02 | — | N/A | typecheck (cfg 8쌍 · 행 스펙 · 요약) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` | ✅ | ⬜ pending |
| 31-04-03 | 31-04 | 2 | AMT-02 · AMT-04 | — | N/A | component (8칸 되싣기 · 비교가 변경 재계산 · 금액끼리 최소>최대 · webapp 전체) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-05-01 | 31-05 | 2 | AMT-04 (D-19) | — | N/A | unit (formatManwon · formatQtyAmt · qtyAmt — C# 바이트 동형) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts -t "P31 주문로그"` | ❌ W0 (31-01 생성 파일) | ⬜ pending |
| 31-05-02 | 31-05 | 2 | AMT-04 (D-19) | — | N/A | unit (⑦ 금액 표기 골든 · C# 예시 ①~⑨ · ev_price 환산) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts src/__tests__/strategy-event-labels.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-05-03 | 31-05 | 2 | AMT-04 (D-19) | — | N/A | component (webapp 주문로그 · 타임라인 · 카드 탭 소비자) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/order-log src/lib/__tests__/order-timeline.test.ts src/lib/__tests__/order-log-feed.test.ts src/components/trading/__tests__/order-timeline.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/components/trading/__tests__/shared-panels.test.tsx` | ✅ | ⬜ pending |
| 31-06-01 | 31-06 | 3 | AMT-04 | — | N/A | component (등록 차단 D-03 · D-04 문장 · 순서 · 접미) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx -t "P31 등록 차단"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-06-02 | 31-06 | 3 | AMT-04 | — | N/A | component (두 줄 문자열 · 파생 행 · 시트 환산/잠금 · 인라인 아래 줄) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/lc-fields.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx -t "P31"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-06-03 | 31-06 | 3 | AMT-03 · AMT-04 | — | N/A | unit + 전체 (84 후매수 최소 시딩 · webapp 회귀) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test` | ✅ | ⬜ pending |
| 31-07-01 | 31-07 | 4 | AMT-02 · AMT-04 | — | N/A | e2e (P31-1 · 2 · 3 · 4 · 7 — 390 · 1080) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P31" --workers=1` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-07-02 | 31-07 | 4 | AMT-04 | — | N/A | e2e backstop (P20-3 · P24-7 56/44 · 최악값 · L4 · P24-8 · a11y) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P20-3\|P24-7\|P24-8" --workers=1` | ✅ (갱신) | ⬜ pending |
| 31-07-03 | 31-07 | 4 | AMT-03 · AMT-04 | — | N/A | e2e (P31-5 /me 42/84 · P31-6 주문로그) + 전 워크스페이스 회귀 | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts e2e/specs/order-log.spec.ts --workers=1` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 31-08-01 | 31-08 | 5 | AMT-02 · AMT-03 | — | N/A | manual (메인 세션 relay 배포 · Vercel 미리보기 — checkpoint:human-action) | `bash scripts/smoke-relay.sh` · `vercel inspect https://trade.jx1.io`(메인 세션) | ✅ | ⬜ pending |
| 31-08-02 | 31-08 | 5 | AMT-01 | — | N/A | script check (gh-trade master `--check` + 마커 대조) | `RELAY=/Users/alex/repos/gh-radar/relay <gh-trade master worktree>/server/scripts/sync-relay-schema.sh --check` + `server-repo-commit` 접두 대조 | ✅ | ⬜ pending |
| 31-08-02 | 31-08 | 5 | AMT-04 (D-16 · D-20) | — | N/A | doc check (인박스 노트 2건 닫기) | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md && grep -qE '^status: done$' docs/inbox/from-gh-trade/261011-amount-eok-and-limit-evprice.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261011-amount-eok-and-limit-evprice.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — Task ID 는 `{plan}-{task 번호}`(31-01-01 = 31-01 Task 1). 2026-10-11 플래너가 PLAN.md 8개 확정 뒤 채웠다.*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/__tests__/lc-amount.test.ts` — 환산 · 짝 · 메모 · 검증표 (신규 · 31-01 Task 2 · 서식은 31-05 Task 1)
- [ ] `webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx` — 두 줄 행 컴포넌트 (신규 · 31-02 Task 1)
- [ ] `relay/tests/helpers/frames.ts` — `FakeLimitChaserInput` +8 금액(31-01) · `FakeUserSettingsInput` +`postBuyFloorAmount`(31-03)
- [ ] `relay/tests/helpers/fake-gateway.ts` — `SetLimitChaserRequest` +8 금액(31-01) · `SetUserSettingsRequest` +`postBuyFloorAmount`(31-03)
- [ ] `webapp/src/test-fixtures/limit-chaser.ts` — `LC_BUY3_ECHO_DEFAULTS` 8 금액(기본 0 · 31-01)
- [ ] e2e 84 픽스처(`me.spec.ts` · `a11y.spec.ts` · `trading-workbench.spec.ts`) — `postBuyFloorAmount` 추가(31-07)

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
