---
phase: 21-gh-trade-mobile-app
plan: 26
subsystem: ui
tags: [react, tailwind, numpad, dialog, safe-area, lucide, gap-closure]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-24 UAT 3차 진단(G-21-R3-3·5·6·7 권장 수정) · §21 --app-safe-top/bottom 토큰"
provides:
  - "PAD_CHIPS.만원 = 천만(+1,000) · 오천만(+5,000) · 1억(+10,000) · 지우기(만원 단위 더하기)"
  - "SettingGroup 상단 패딩 제목 유무 분기(제목 없음 pt-1 · 있음 pt-2.5)"
  - "카드 헤더 ✕ data-slot=card-close · size-8 · XIcon size-4 · after:-inset-1.5 히트 44 · -my-[3px]"
  - "종목정보 팝업 ≥700 고정 높이 · 본문 scrollbar-gutter · 폰 safe-area 패딩 · ✕ XIcon size-5 히트 44"
affects: [21-30, 21-36]

actuals:
  tokens: 5800
  tasks: 3
  commits: 5
plan_head_before: d22980f7cc7a31cbd366d103763470ec64f1534a

tech-stack:
  added: []
  patterns:
    - "아이콘 버튼 히트 44 = size-8(32) 상자 + relative · after:absolute after:-inset-1.5 after:content-[''] (카드 ✕ · 팝업 ✕ 공통)"
    - "폰 전체화면 오버레이의 safe-area = pt/pb calc(기본 + var(--app-safe-*)) + min-[700px]: 로 종전 값 복귀"

key-files:
  created: []
  modified:
    - webapp/src/lib/numpad.ts
    - webapp/src/lib/__tests__/numpad.test.ts
    - webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx
    - .planning/phases/20-toss-order-ticket/20-CONTEXT.md
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/__tests__/card-header.test.tsx
    - webapp/src/components/trading/card/stock-info-modal.tsx
    - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx

key-decisions:
  - "만원 칩 상한 테스트는 999,994,999 + 오천만 = 999,999,999(도달) · 999,995,000 + 오천만 = 그대로(초과 무시) 두 케이스로 잠갔다 — 플랜의 「999999000 → 999999999」는 applyPadChip 의 초과 무시 계약과 맞지 않는다"
  - "카드 헤더 ⓘ(h-[26px] 13px)는 손대지 않았다 — G-21-R3-6 범위는 ✕ 뿐이고 ⓘ 크기는 사용자 요청 밖"

patterns-established:
  - "아이콘 닫기 버튼: lucide XIcon aria-hidden + size-8 상자 + after:-inset-1.5 히트 44 — 텍스트 글리프 ✕ 금지"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "주문금액(만원) 키패드 칩 천만/오천만/1억/지우기 — 만원 단위 1,000/5,000/10,000 더하기 · 9자리 상한 · 접근 이름"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/numpad.test.ts#만원 천만 on 100 → 1100 (만원 단위 +1,000 · G-21-R3-3)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx#(만원) 칩 줄 = 1,000만원 · 5,000만원 · 1억원 더하기 · 전부 지우기"
        status: pass
    human_judgment: true
    rationale: "칩 모양·폭(「오천만」 세 글자)이 키패드 칩 줄에 맞게 서는지는 실기 UAT(21-36)에서 본다"
  - id: D2
    description: "제목 없는 가격 섹션 카드 상단 pt-1 로 위아래 여백 대칭"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx#제목 없는 가격 섹션(%s)은 상단 패딩 pt-1"
        status: pass
    human_judgment: true
    rationale: "jsdom 은 레이아웃이 없어 클래스만 잠근다 — 실제 여백 대칭 체감은 21-36 UAT"
  - id: D3
    description: "카드 ✕ 32 상자 · 16 아이콘 · 히트 44 · 헤더 줄 높이·전파 차단·이름·title 유지"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-header.test.tsx#✕ = data-slot card-close · 32 상자(size-8)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-header.test.tsx#세그먼트·LED·ⓘ·✕ 클릭은 onToggle 을 부르지 않는다(전파 차단)"
        status: pass
    human_judgment: true
    rationale: "헤더 줄 높이 26 유지·크기 조화는 실제 렌더에서만 보인다(21-36 UAT)"
  - id: D4
    description: "종목정보 팝업 ≥700 고정 높이 · scrollbar-gutter · 폰 safe-area 패딩 · ✕ XIcon 44 · 첫 포커스 · body 포털 유지"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/stock-info-modal.test.tsx#⑨ 크기·안전영역·✕ (G-21-R3-7)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/stock-info-modal.test.tsx#⑦ 모달 DOM 은 카드 <article> 의 자손이 아니다"
        status: pass
    human_judgment: true
    rationale: "세 탭 높이 동일 · 앱 노치/홈 인디케이터 회피는 실기·실브라우저에서만 확인 가능(21-36 UAT)"

duration: 5min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 26: UAT 3차 트레이딩 시각 결함 4건 Summary

**주문금액 키패드 칩을 천만·오천만·1억(만원 단위 더하기)으로 바꾸고, 제목 없는 가격 카드 상단을 pt-1 로, 카드·팝업 ✕ 를 32 상자 + lucide XIcon + 히트 44 로, 종목정보 팝업을 ≥700 고정 높이 min(720px, 100dvh−48px−안전영역) · scrollbar-gutter · 폰 safe-area 패딩으로 고쳤다**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-09-26T10:04:36Z
- **Completed:** 2026-09-26T10:09:27Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

### 칩 표 (G-21-R3-3)

| 칩 | 접근 이름 | 동작(만원 단위) |
|---|---|---|
| 천만 | 1,000만원 더하기 | +1,000 |
| 오천만 | 5,000만원 더하기 | +5,000 |
| 1억 | 1억원 더하기 | +10,000 |
| 지우기 | 전부 지우기 | 빈 값 |

더하기 동작 · 9자리 상한(999,999,999) · 원 변환 경로(lc-fields/limit-chaser)는 그대로다. 20-CONTEXT D-17 원문은 보존하고 끝에 포인터를 붙였다.

### 패딩 분기 (G-21-R3-5)

`SettingGroup` section = `cn('min-w-0 rounded-[16px] bg-[var(--group-bg)] px-2.5 pb-1', spec.title ? 'pt-2.5' : 'pt-1')` — 제목 없는 buy-price · sell-price 는 pt-1(4px), 제목 있는 그룹은 pt-2.5 그대로다.

### ✕ 치수

| 표면 | 상자 | 아이콘 | 히트 | 기타 |
|---|---|---|---|---|
| 카드 헤더 ✕ (G-21-R3-6) | size-8 (32×32) | XIcon size-4 (16) | after:-inset-1.5 → 44×44 | `-my-[3px]` 로 헤더 줄 26 유지 · `data-slot="card-close"` · title 「카드 제거」 · aria 「{종목명} 카드 닫기」 · stopPropagation · 760 이상 order-last |
| 종목정보 팝업 ✕ (G-21-R3-7) | size-8 (32×32) | XIcon size-5 (20) | after:-inset-1.5 → 44×44 | aria 「닫기」 · closeRef 첫 포커스 · DialogClose asChild |

### 팝업 크기 식 (G-21-R3-7)

- 뷰포트 ≥700: `h = min(720px, calc(100dvh − 48px − var(--app-safe-top) − var(--app-safe-bottom)))` 고정 · 폭 `min(960px, 100% − 32px)` 그대로 (옛 `h-auto` · `max-h-[calc(100dvh-48px)]` 제거).
- 본문: `[scrollbar-gutter:stable]` — 탭 전환 때 본문 폭 고정.
- 폰(<700) 전체화면: 헤더 `pt-[calc(10px+var(--app-safe-top))] pb-2.5 min-[700px]:pt-2.5` · 본문 `pt-3 pb-[calc(12px+var(--app-safe-bottom))] min-[700px]:pb-3` — 브라우저(안전영역 0)는 종전 값과 같다.
- Tailwind v4.2.2 컴파일로 생성 CSS 를 확인했다: `height: min(720px, calc(100dvh - 48px - var(--app-safe-top) - var(--app-safe-bottom)))` · `scrollbar-gutter: stable` · `padding-top: calc(10px + var(--app-safe-top))` · `inset: calc(var(--spacing) * -1.5)`.

### 테스트 결과

- 플랜 verify 세 묶음(numpad · number-pad-sheet / setting-group · card-header / stock-info-modal): **Test Files 5 passed · Tests 190 passed**
- 회귀 확인(`src/components/trading` + `src/lib` 전체): **Test Files 72 passed · Tests 1715 passed · 1 skipped**
- `pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e tsconfig): 통과 · 변경 소스 3개 eslint 통과
- TDD: Task 2 · Task 3 는 RED(대상 단언이 클래스 누락으로 실패 — 유효 RED) → GREEN 순서로 커밋

## Task Commits

1. **Task 1 (tracer): 만원 칩 천만/오천만/1억** — `bac84ce` (feat) · 트레이서 게이트: interactive · end-of-phase · automated-only → verify 재실행 통과 후 확장
2. **Task 2: 가격 섹션 pt-1 · 카드 ✕** — `32f2fa1` (test, RED) · `0e5f51c` (feat, GREEN)
3. **Task 3: 종목정보 팝업 크기·safe-area·✕** — `fbf8a11` (test, RED) · `2eea81c` (feat, GREEN)

## Files Created/Modified

- `webapp/src/lib/numpad.ts` — PAD_CHIPS 만원 줄 교체 + 주석
- `webapp/src/lib/__tests__/numpad.test.ts` — 라벨 표 · aria 이름 · 1100 · 1억/오천만 · 상한 경계
- `webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx` — 만원 시트 칩 이름 4개 · 100 → 1,100
- `.planning/phases/20-toss-order-ticket/20-CONTEXT.md` — D-17 끝 포인터(원문 보존)
- `webapp/src/components/trading/lc/setting-group.tsx` — 상단 패딩 분기 + 주석
- `webapp/src/components/trading/lc/__tests__/setting-group.test.tsx` — buy-price/sell-price pt-1 단언
- `webapp/src/components/trading/card/card-header.tsx` — ✕ 교체 · XIcon import · 머리 주석
- `webapp/src/components/trading/__tests__/card-header.test.tsx` — ✕ data-slot · svg · 클래스 단언
- `webapp/src/components/trading/card/stock-info-modal.tsx` — 크기 · 헤더/본문 패딩 · ✕ · 머리 주석 ⑤
- `webapp/src/components/trading/__tests__/stock-info-modal.test.tsx` — ⑨ 크기·안전영역·✕·첫 포커스

## Decisions Made

- 만원 칩 상한 경계는 applyPadChip 의 「초과 결과는 버퍼 불변」 계약에 맞춰 두 케이스로 잠갔다(아래 편차 1).
- 카드 헤더 ⓘ 는 그대로 둔다 — 요청 범위는 ✕ 하나다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 플랜의 상한 테스트 기대값이 코드 계약과 어긋남**
- **Found during:** Task 1
- **Issue:** 플랜 ② 「오천만 on 999999000 → 999999999(상한)」 — 999,999,000 + 5,000 = 1,000,004,000 은 9자리를 넘어 `applyPadChip` 이 버퍼를 **바꾸지 않는다**(기존 「결과가 9자리를 넘는 칩은 버퍼를 바꾸지 않는다」 계약 · 자동 보정 없음 D-15). 999,999,999 로 자르면 그 계약을 깬다.
- **Fix:** 상한 도달(999,994,999 + 오천만 = 999,999,999)과 초과 무시(999,995,000 + 오천만 = 999,995,000) 두 케이스로 테스트. 코드 무변경.
- **Files modified:** webapp/src/lib/__tests__/numpad.test.ts
- **Verification:** numpad.test 81 통과
- **Committed in:** bac84ce

**2. [수용 기준 문구] Task 2 「옛 작은 상자 제거」 grep 이 ⓘ 버튼에도 걸림**
- **Found during:** Task 2
- **Issue:** `h-\[26px\] flex-none items-center rounded` 패턴이 ✕ 가 아니라 ⓘ 버튼(`h-[26px] … px-1.5 text-[13px]`, card-header.tsx ≈220)에 1건 매칭된다. ✕ 의 옛 클래스(`h-[26px] … px-2 text-[11px] … @min-[760px]/lc:order-last`)는 완전히 제거됐다(테스트가 ✕ 에 `h-[26px]` 없음을 단언).
- **Fix:** ⓘ 는 범위 밖이라 고치지 않음. 의도(✕ 옛 상자 제거)는 충족.
- **Verification:** card-header.test ✕ 단언 `not.toContain('h-[26px]')` 통과

---

**Total deviations:** 1 auto-fixed (Rule 1) + 1 수용 기준 문구 불일치 기록
**Impact on plan:** 동작·범위 변화 없음. 상한 계약 보존.

## Issues Encountered

- 다른 세션이 작업 중 `webapp/src/components/trading/card/card-tabs.tsx` · `__tests__/card-tabs.test.tsx` 를 수정했다 되돌렸다 다시 수정했다. 스테이징하지 않았고, 회귀 실행(trading 전체)에서 card-tabs 테스트는 그 변경 상태로 통과했다. `tasks/lessons.md` · `.planning/state.json` · `.planning/milestone.lock` 도 손대지 않았다.
- 손보는 표면 안의 다른 줄바꿈·잘림은 jsdom 에서 볼 수 없어 추가 수정 없음 — 21-36 UAT 에서 본다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-30 이 `stock-info-modal.tsx` 를 이어 받는다(팝업 안 전체목록). 본문 div 가 여러 줄 JSX 로 바뀌었고 `[scrollbar-gutter:stable]` · safe-area 패딩이 붙었으니 그 위에 얹으면 된다.
- 실제 치수 · 체감(칩 모양 · 가격 카드 여백 · ✕ 크기 · 팝업 세 탭 높이 · 앱 노치)은 21-36 UAT. push 금지(21-36 체크포인트).

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- 소스 4개 · SUMMARY 존재 확인
- 커밋 bac84ce · 32f2fa1 · 0e5f51c · fbf8a11 · 2eea81c 존재 확인
