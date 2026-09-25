---
phase: "20"
slug: "toss-order-ticket"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: "2026-09-25"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 정본 출처: `20-RESEARCH.md` §Validation Architecture. 모든 명령은 worktree 루트 `/Users/alex/repos/gh-radar/.claude/worktrees/toss-b` 에서 실행한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.1.9 (webapp, jsdom) · vitest ^4.1.4 (packages/shared) · @playwright/test ^1.59.1 |
| **Config file** | `webapp/vitest.config.ts` · `webapp/tests/setup.ts` · `webapp/playwright.config.ts` |
| **Quick run command** | `pnpm --filter @gh-radar/webapp exec vitest --run <파일들>` (주의: `pnpm … test -- <name>` 은 필터가 안 되고 전체 suite 를 돈다) |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test` |
| **Shared unit** | `pnpm --filter @gh-radar/shared exec vitest --run src/krxTick.test.ts src/limitUp.test.ts` |
| **E2E (phase gate)** | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/orderbook.spec.ts e2e/specs/a11y.spec.ts e2e/specs/sidebar-tree.spec.ts` (포트 3100 에 다른 dev 서버가 없는지 먼저 확인 — `reuseExistingServer` 함정) |
| **Estimated runtime** | quick < 5s · full ~30s (기준선 99 파일 · 1731 통과 · 1 skip) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @gh-radar/webapp exec vitest --run <해당 task 가 만든/바꾼 테스트 파일>` (shared 변경 시 `pnpm --filter @gh-radar/shared build` 선행)
- **After every plan wave:** Run `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test`
- **Before `/gsd-verify-work`:** Full suite green + e2e 4 spec(순차 `workers: 1`) + 폭 4개(본문 344/700/830/992) × 최악값 잘림 0 + 시각 확인(다크/라이트 · 폰 390 · 태블릿 768 터치 · 데스크톱 1280)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Requirements 는 ROADMAP 에서 TBD 이므로 CONTEXT.md 의 D-XX 결정을 요구사항 열에 쓴다. Task ID 는 플래너가 채웠다(2026-09-25, 플랜 20-01~20-07). Status 는 20-07 Task 3 이 실행 결과로 채웠다(2026-09-25 · webapp 107 파일 1970 통과 · 1 skip · shared 10 파일 131 · relay 22 파일 632 · e2e 4 spec 71 passed).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-T1 | 01 | 1 | D-04 · D-14 · D-14a · D-14c · D-20 (트레이서) | T-20-01 · T-20-03 · T-20-04 | 「호가변경」 인라인 Enter → lc.set 1회(서버 값 + 필드 1개) · 에코 일치 때만 행 갱신 · 거부 = 실패 문구 · 미등록 = 전송 0 | component + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/lc-tracer.test.tsx` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P20-1"` | ❌ W0(신설) | ✅ green |
| 20-01-T2 | 01 | 1 | D-04 · D-05 · D-06 · D-07 | T-20-02 · T-20-04 · T-20-08 | 거부(answerSeq 만) = 실패 · unacked = 실패 · 늦은 에코 = 성공 · 직렬화 1건 · 실패 시 대기 폐기 + 실패 표시 · 무장 불가 = 전송 0 · 토글 되돌림 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` | ❌ W0(신설) | ✅ green |
| 20-02-T1 | 02 | 1 | D-15 · D-15 회귀 | T-20-10 | 7구간 한 곳 · limitUpPrice/order-panel 행동 보존 · 자동 보정 없음 | unit | `pnpm --filter @gh-radar/shared exec vitest --run src/krxTick.test.ts src/limitUp.test.ts` · `pnpm --filter @gh-radar/webapp exec vitest --run src/components/orderbook/__tests__/order-panel.test.tsx` | ❌ W0 / ✅ 회귀 | ✅ green |
| 20-02-T2 | 02 | 1 | D-16 · D-17 · D-14c · D-15 | T-20-06 | 숫자만 · 9자리 상한 · fresh 덮어쓰기 · 칩 단위별 · 검증 문구 원문 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/numpad.test.ts` | ❌ W0(신설) | ✅ green |
| 20-02-T3 | 02 | 1 | Pitfall 5 폭 예산 · UI Considerations overflow | T-20-12 | 본문 344/700/830/992 × 최악값 행 넘침 px 실측 → 20-04 백스톱 레벨 · 코드 비커밋 | spike | `node "${TMPDIR:-/tmp}/gh-radar-p20-spike/lc-width-spike.mjs"` (JSON 4밴드) | — (일회성) | ✅ green (20-02 실측 · 실브라우저 단언은 20-07 P20-3 이 대체) |
| 20-03-T1 | 03 | 2 | D-12 · 토큰 | — | SSR 스냅샷 inline · coarse → sheet · change 구독 · --group-bg/--switch-off/--dim 양 테마 · oklch 0 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/use-edit-mode.test.ts src/styles/__tests__/tds-tokens.test.ts` | ❌ W0 / ⚠️ 기대값 추가 | ✅ green |
| 20-03-T2 | 03 | 2 | D-13 · D-16 · D-17 · D-23 · D-05 · D-06 · D-07 | T-20-01 · T-20-04 · T-20-10 · T-20-11 | body 직속 포털 · role=dialog · 닫힐 때 연 행으로 포커스 복귀 · busy 시 Esc/바깥 무시 · D-15 잠금 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/number-pad-sheet.test.tsx` | ❌ W0(신설) | ✅ green |
| 20-03-T3 | 03 | 2 | D-12 · D-13 | T-20-04 | hasTouch → 시트 · 390→370 · 768→440 가운데 · radius 28 · body 직속 · 적용 → 10 → 에코 → 닫힘 | component + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/lc-tracer.test.tsx` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P20-"` | ❌ W0(새 describe) | ✅ green |
| 20-04-T1 | 04 | 3 | D-01 · D-02 · D-19 · D-20 · D-21 · D-22 | — | 스펙 순서 · role=switch · 원형 체크 role=checkbox · 감시대상 group+aria-pressed · 44px · 뷰포트 BP 0 · 말줄임 0 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/setting-group.test.tsx` | ❌ (신설) | ✅ green |
| 20-04-T2 | 04 | 3 | D-01 · D-03 · D-04 · 불변식(컨테이너) | T-20-01 · T-20-03 · T-20-12 · T-20-13 | dirty-action-bar DOM 부재 · 워크벤치 배관 diff 0 · 카드 컨테이너·/lc 유틸만 · lc-group-* 슬롯 유지 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/card-body.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/stock/__tests__/stock-orderbook-section.test.tsx` | ⚠️ 갱신 | ✅ green |
| 20-04-T3 | 04 | 3 | D-01 · D-02 · D-04 · D-19 · D-20 · D-21 · D-22 | T-20-13 | 스위치 4 즉시 · 값 확정 1회 · 32필드 · 미등록 로컬 · 무장 가드 · 에코 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx` | ⚠️ 재작성 | ✅ green |
| 20-05-T1 | 05 | 4 | D-14 · D-14a · D-14c · D-15 | T-20-01 · T-20-10 | ↑↓ 한 호가/1 · 위반 저장 거부 + 말풍선 · 위반 blur 취소 · busy readOnly · 안내 문구·저장 버튼 0 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/inline-value-editor.test.tsx` | ❌ (신설) | ✅ green |
| 20-05-T2 | 05 | 4 | D-14 · D-14b | T-20-02 · T-20-14 | Tab 같은 그룹 다음(감시대상 건너뜀) · 한 번 클릭 전환 · 직렬화 · 옮긴 뒤 실패 표시 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/inline-navigation.test.tsx` | ❌ (신설) | ✅ green |
| 20-06-T1 | 06 | 4 | D-08 · D-09 · D-11 · D-15 | T-20-10 · T-20-15 | 상자/48·38 버튼 · 스테퍼 제거 · 전체 선택·↑↓ · 가격 검증 줄(주문 안 막음) · 주문 경로 줄 diff 0 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/manual-order-form.test.tsx` | ⚠️ 부분 갱신 | ✅ green |
| 20-06-T2 | 06 | 4 | D-10 · D-17 · D-23 | T-20-05 · T-20-09 | 시트 「입력」 = 값만 채움 · sendOrder 0 · 주문은 확인 다이얼로그로만 · 현재가/상한가 같은 카드 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/manual-order-form.test.tsx src/components/trading/__tests__/card-body.test.tsx` | ⚠️ 새 describe | ✅ green |
| 20-07-T1 | 07 | 5 | 불변식(폭) · D-04 · D-20 | T-20-12 · T-20-17 | 셀렉터 이관 · 더티 케이스 5개 재정의 · P20-3 최악값 × 4밴드 잘림 0 · 44px · 그룹 높이 동일 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts` | ⚠️ 확장 | ✅ green |
| 20-07-T2 | 07 | 5 | D-10 · D-12 · D-13 · D-15 · a11y · 주문 경로 | T-20-09 · T-20-11 | P20-4 매수가격 시트 · P20-5 수동주문 시트(주문 0) · 호가 탭 시트 vs FAB · 스위치 role · 시트 axe 0 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/orderbook.spec.ts e2e/specs/a11y.spec.ts e2e/specs/sidebar-tree.spec.ts` | ⚠️ ⑦·11 재정의 | ✅ green |
| 20-07-T3 | 07 | 5 | 전체 게이트 | T-20-16 | build_command · test_command · shared 전체 · webapp build · e2e 4 spec | gate | config `build_command` · `test_command` · e2e 4 spec | ✅ | ✅ green (build · test · shared · webapp build · e2e 71 passed) |

*Status: ⬜ 대기 · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/shared/src/krxTick.ts` + `packages/shared/src/krxTick.test.ts` — D-15 (호가단위 7구간 · `tickUp/Down` · `priceInputIssue`) → **20-02 T1**
- [x] `webapp/src/lib/use-edit-mode.ts` + `webapp/src/lib/__tests__/use-edit-mode.test.ts` — D-12 → **20-03 T1**
- [x] `webapp/src/lib/numpad.ts` + `webapp/src/lib/__tests__/numpad.test.ts` — D-16 / D-17 / D-14c → **20-02 T2**
- [x] `webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx` — D-13 / D-16 / D-23 → **20-03 T2**
- [x] 폭 예산 스파이크: 최악값 행을 가진 임시 Playwright 측정(본문 344/700/830/992) — Pitfall 5 backstop 필요 여부 확정(결과를 20-02-SUMMARY `## 폭 스파이크` 에 기록 후 스파이크 코드는 버림) → **20-02 T3**
- [x] 시트 테스트용 `matchMedia` 모킹 헬퍼 `webapp/src/lib/__tests__/match-media.ts` — Pitfall 7 → **20-03 T1**
- [x] `webapp/e2e/specs/trading-workbench.spec.ts` 에 `test.use({ hasTouch: true })` describe 추가 — D-12 / D-13 → **20-03 T3**(P20-2) · 확장 **20-07 T2**(P20-4 · P20-5)

*프레임워크 설치 불필요 — vitest · playwright 모두 기존 인프라.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 시각 확인(다크/라이트 · 토스 톤) | D-01 · D-08 · D-13 | 색·둥근면·간격은 목업 대조가 필요 | 폰 390 · 태블릿 768(터치) · 데스크톱 1280 에서 목업 `002-toss-order-ticket/index.html` 과 나란히 비교 |
| 실기 하이브리드 기기(터치+마우스) 판정 | D-12 | Playwright 로 재현 불가(Surface · iPad+트랙패드) | 실기에서 행 탭 → 시트, 마우스 클릭 → 인라인 확인 |
| 실 게이트웨이 반영 지연/실패 | D-05 · D-06 | 실서버 타임아웃은 e2e 모킹 밖 | relay 연결을 끊고 적용 → 「반영하지 못했어요 · 다시 시도」 + 입력값 보존 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
