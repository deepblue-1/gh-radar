---
phase: 20-toss-order-ticket
plan: 03
subsystem: ui
tags: [react, nextjs, radix-dialog, matchmedia, useSyncExternalStore, vitest, playwright, hasTouch, limit-chaser]

requires:
  - phase: 20-01
    provides: "useLcFieldCommit(commit · failures · inflightField · queuedFields · successSeq · lastSuccessField · clearFailure) · LC_COMMIT_TEXT · SettingRow(hasPopup · onActivate(el)) · armBlockOf · CardBody → currentPrice"
  - phase: 20-02
    provides: "numpad.ts(padInit · padKey · PAD_CHIPS · padChipDisabled · applyPadChip · padValue · formatPadDisplay · padIssue · canConfirmPad) · krxTick 검증 문구 · 시트 폭 스파이크(390 → 370 · 문구 1줄)"
provides:
  - "useEditMode · EditMode · COARSE_POINTER_QUERY — 입력 장치로 시트/인라인 판정(SSR 안전)"
  - "match-media.ts 테스트 헬퍼 — mockPointer · emitPointerChange · restoreMatchMedia"
  - "토큰 --group-bg · --switch-off · --dim (:root · .dark)"
  - "NumberPadSheet · NumberPadSheetProps — 공용 키패드 바텀시트(상따 apply · 수동주문 fill)"
  - "트레이서 「호가변경」 행의 터치 경로(행 탭 → 시트 → 적용 → 에코 → 닫힘) + e2e P20-2"
affects: [20-04, 20-05, 20-06, 20-07]

actuals:
  tokens: 11922
  tasks: 3
  commits: 6
plan_head_before: af529fc0e45062a61ef5fb84f0faafe0298a0766

tech-stack:
  added: []
  patterns:
    - "편집 방식 = 주 포인터 `(pointer: coarse)` 구독 훅 하나 — 폭 판단은 계속 @container/lc"
    - "제어형 Radix Dialog 는 onOpenAutoFocus(컨테이너) · onCloseAutoFocus(returnFocusRef) 로 포커스를 손으로 잡는다"
    - "시트 버퍼는 open false→true 전이에서만 초기화(렌더 중 파생 상태) — 열린 사이 에코가 입력을 덮지 않는다"
    - "시트 인스턴스는 폼당 한 개 · sheetField 가 무엇을 편집하는지 정한다 · 전송은 훅 commit 하나"
    - "matchMedia 모킹은 afterEach(restoreMatchMedia) 짝으로만 쓴다(Pitfall 7)"

key-files:
  created:
    - webapp/src/lib/use-edit-mode.ts
    - webapp/src/lib/__tests__/use-edit-mode.test.ts
    - webapp/src/lib/__tests__/match-media.ts
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "시트 안 Enter 는 포커스가 버튼에 있으면 그 버튼의 기본 동작에 맡긴다 — 키보드 사용자가 「닫기」에서 Enter 를 눌렀는데 적용이 나가지 않게. 콘텐츠·디스플레이에 포커스가 있을 때만 Enter = 적용"
  - "시트 컨테이너의 포커스 링은 `focus-visible:[--focus-outline:none]` 로 컨테이너 자신에만 걷는다 — `data-focus-ring=\"seamless\"` 는 CSS 변수가 자식 버튼으로 상속돼 키패드·버튼 링까지 지운다"
  - "시트가 편집 중인 행은 실패 말풍선(FailureBubble, body 포털)을 끈다 — 늦게 열린 Popover 가 dim 오버레이 위로 뜨고 alert 가 둘이 되는 것을 막는다. 실패는 시트 상태 줄 한 곳이 말한다"
  - "Radix Dialog 는 aria-modal 을 달지 않아(형제 aria-hidden 만) Content 에 aria-modal=\"true\" 를 명시했다"
  - "시트 상태 줄은 빈 p(자리 확보) 안에 role=alert/status span 을 넣는다 — 역할을 한 요소에서 바꾸지 않는다"
  - "busy 에는 실패·다른 단말 문구를 내리고 감시 중 안내만 남긴다 — 재시도 중 옛 실패 문구가 보이지 않게"

patterns-established:
  - "터치 편집 표면 = NumberPadSheet 하나: 호출부는 title·description·unit·purpose·status·failureText·validate 만 넘기고 전송은 onConfirm 뒤에서 한다"
  - "e2e 시트 기하는 getAnimations().finished 를 기다린 뒤 boundingBox 로 잰다(등장 슬라이드 250ms)"

requirements-completed: []

coverage:
  - id: D1
    description: "편집 방식 판정 훅 — coarse → sheet · 기본/서버 렌더/matchMedia 부재 → inline · change 구독 · 모킹 누수 없음"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-edit-mode.test.ts (7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "새 토큰 --group-bg · --switch-off · --dim 이 양 테마에 정의되고 oklch 없음"
    verification:
      - kind: unit
        ref: "webapp/src/styles/__tests__/tds-tokens.test.ts (67)"
        status: pass
    human_judgment: false
  - id: D3
    description: "NumberPadSheet — body 포털 · 「{필드명} 적용/입력」 · 첫 입력 대기 · 칩 · 가격 검증 잠금(보정 없음) · validate · 반영 중 잠금 · 실패 · 다른 단말 · 감시 중 안내 · 물리 키 · 포커스 복귀 · 접근성 이름 · 전송 0 · min() 폭"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx (29)"
        status: pass
    human_judgment: false
  - id: D4
    description: "트레이서 터치 경로 — 행 탭 → 시트 → 「호가변경 적용」 → lc.set 1회 → 에코 → 닫힘 · 행 5건 강조 · 포커스 복귀 · 거부/끊김/다른 단말/닫기/같은 값 · 마우스 기기는 인라인 그대로"
    verification:
      - kind: integration
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#⑪~⑰"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g P20- (P20-1 · P20-2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "시트 기하 — 뷰포트 390 폭 370 · 768 폭 440 가운데 · radius 28 · 하단 ≥10 · 카드 밖 · 가로 폰(844×390) 내부 스크롤로 「호가변경 적용」 도달"
    verification:
      - kind: e2e
        ref: "trading-workbench.spec.ts › Phase 20 — 터치 기기 시트 › P20-2"
        status: pass
    human_judgment: false
  - id: D6
    description: "시트의 시각 품질(목업 002 와 같은 느낌 — 등장 슬라이드, 캐럿 깜빡임, fresh 강조 면, 칩·키 간격, 라이트/다크)"
    verification: []
    human_judgment: true
    rationale: "jsdom 은 색·모션을 평가하지 않고 P20-2 는 기하와 동작만 잰다 — 목업과의 시각 일치는 사람이 실기(또는 hasTouch 브라우저)에서 본다"

duration: 13min
completed: 2026-09-25
status: complete
---

# Phase 20 Plan 03: 터치 경로 — 편집 방식 판정 · 키패드 바텀시트 · 트레이서 시트 연결 Summary

**주 포인터 `(pointer: coarse)` 를 구독하는 `useEditMode` 로 터치 기기를 가르고, Radix Dialog 를 직접 조립한 body 포털 키패드 시트 `NumberPadSheet`(min(440, 100vw−20) 가운데 · 칩 · 3×4 키패드 · 「{필드명} 적용」 · 반영 중/실패/다른 단말/감시 중 상태)를 세워 「호가변경」 행에 연결했다. 실브라우저(hasTouch)에서 탭 → 5 → 「호가변경 적용」 → 게이트웨이 10 → 60 에코 → 시트 닫힘 · 행 「5건」 까지 증명했다(P20-2).**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-09-25T04:09:16Z
- **Completed:** 2026-09-25T04:22:08Z
- **Tasks:** 3 (전부 TDD RED → GREEN)
- **Files modified:** 10 (생성 5 · 수정 5)

## Accomplishments

- **D-12 편집 방식 판정:** `useEditMode()` = `useSyncExternalStore(subscribe, getSnapshot, () => false)`. 서버·하이드레이션 첫 렌더는 inline이고 `change` 이벤트를 구독한다. `any-pointer` 판정식은 쓰지 않는다(주 입력 장치 원칙). 테스트 헬퍼 `mockPointer` · `emitPointerChange` · `restoreMatchMedia` 는 구독 경로까지 태우고, 테스트 뒤 원본으로 되돌린다.
- **토큰 3개:** `--group-bg` #f9fafb / #2c2c35 · `--switch-off` #d1d6db / #4d4d59 · `--dim` rgba(0, 0, 0, 0.2) / rgba(0, 0, 0, 0.56). `tds-tokens.test` 팔레트 가드에 올렸다.
- **NumberPadSheet (D-13 · D-16 · D-17 · D-23 · D-05~D-07):** `ui/sheet.tsx` 를 쓰지 않고 Radix Dialog 를 직접 조립했다. `document.body` 포털이고 오버레이는 `--dim`(blur 없음)이다. 폭은 `min()` 식 하나로 정하고 `inset-x-0 mx-auto` 로 가운데에 둔다. radius 28, 하단 `max(10px, env(safe-area-inset-bottom))`, 높이 상한 `calc(100dvh − 20px)` 에 내부 스크롤이다. 입력칸은 없다. 디스플레이는 `<output aria-live>`, 키패드는 버튼 12개다. 상태 줄은 자리를 항상 잡아 두고 검증 오류 → 실패 → 다른 단말 → 감시 중 순으로 하나만 보인다. 반영 중에는 칩·키·닫기·Esc·바깥 누름·물리 키가 모두 잠긴다. 전송은 하지 않는다(`onConfirm` 만 부른다).
- **트레이서 연결:** 터치 기기에서 「호가변경」 행(`aria-haspopup="dialog"`)을 누르면 시트가 열린다. 적용은 20-01 훅의 `commit(field, v, 'value')` 한 경로로 나가고, 시트는 에코로 성공이 판정될 때만(`successSeq`) 닫힌다. `noop`·`local` 은 즉시 닫힌다. 거부·무응답·끊김·무장 불가면 시트가 남아 이유를 말한다. 닫으면 포커스가 연 행으로 돌아간다. 마우스 기기 경로(20-01 인라인)는 바뀌지 않았다.

## Task Commits

1. **Task 1 RED:** `40bc4a2` — test(20-03): 편집 방식 판정 훅·새 토큰 3개 실패 테스트 + matchMedia 모킹 헬퍼
2. **Task 1 GREEN:** `d7935f1` — feat(20-03): 편집 방식 판정 훅 useEditMode + 토큰 --group-bg · --switch-off · --dim
3. **Task 2 RED:** `42d02b9` — test(20-03): 공용 키패드 바텀시트 NumberPadSheet 실패 테스트 추가
4. **Task 2 GREEN:** `0599e5a` — feat(20-03): 공용 키패드 바텀시트 NumberPadSheet — Radix Dialog 직접 조립 · body 포털
5. **Task 3 RED:** `ffbae0e` — test(20-03): 트레이서 터치(시트) 경로 실패 테스트 추가
6. **Task 3 GREEN:** `73adc42` — feat(20-03): 트레이서 「호가변경」 행에 키패드 시트 연결 — 터치 기기 탭 → 적용 → 에코 → 닫힘

REFACTOR 커밋 없음.

## TDD Gate Compliance

| 태스크 | RED 커밋 | RED 증거(`gsd-tools check tdd-red-evidence`) | GREEN 커밋 |
|---|---|---|---|
| Task 1 | `40bc4a2` | `RED_EVIDENCE_OK` — 대상 「주 포인터가 coarse 면 sheet」 · 74 중 9 실패(훅 2 + 토큰 7, 전부 단언 실패) | `d7935f1` |
| Task 2 | `42d02b9` | `RED_EVIDENCE_OK` — 대상 「열리면 body 포털이고 렌더 컨테이너(카드 자리) 밖이다 …」 · 29 중 27 실패(스텁이 null 을 돌려줌) | `0599e5a` |
| Task 3 | `ffbae0e` | `RED_EVIDENCE_OK` — 대상 「⑪ 행에 aria-haspopup=dialog …」 · 17 중 6 실패(⑪~⑯ · ⑰ 인라인 회귀 가드와 기존 10건은 통과) | `73adc42` |

RED 증거는 20-01·20-02 와 같은 방식으로 만들었다. vitest `tap-flat` 출력에 `# tests/# pass/# fail` 요약 줄을 붙여 검사기에 넣었다.

## Files Created/Modified

- `webapp/src/lib/use-edit-mode.ts` — `useEditMode` · `EditMode` · `COARSE_POINTER_QUERY`
- `webapp/src/lib/__tests__/match-media.ts` — `mockPointer` · `emitPointerChange` · `restoreMatchMedia`(수집되지 않는 헬퍼)
- `webapp/src/lib/__tests__/use-edit-mode.test.ts` — 7케이스(renderHook + renderToString)
- `webapp/src/styles/globals.css` — 토큰 3개(양 블록) + 캐럿 `@keyframes numpad-caret`
- `webapp/src/styles/__tests__/tds-tokens.test.ts` — 기대값 · 테마 토큰 집합 · `--dim` rgba 단언
- `webapp/src/components/trading/lc/number-pad-sheet.tsx` — `NumberPadSheet` · `NumberPadSheetProps`
- `webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx` — 29케이스(소스 가드 2 포함)
- `webapp/src/components/trading/limit-chaser-form.tsx` — `useEditMode` · `sheetField` · `activateRow` · `handleSheetConfirm/Close` · 시트 인스턴스 1개 · `LC_SHEET_SPEC` · `lcBaseValues` · `currentPrice` 구조분해
- `webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx` — describe 「터치(시트) 경로」 ⑪~⑰
- `webapp/e2e/specs/trading-workbench.spec.ts` — describe 「Phase 20 — 터치 기기 시트」 `P20-2`

`webapp/src/components/trading/lc/setting-group.tsx` 는 수정하지 않았다. 20-01 이 이미 `hasPopup → aria-haspopup="dialog"` 를 구현해 두어 확인만 했다(플랜 ②).

## Decisions Made

frontmatter `key-decisions` 참조. 핵심 셋:
1. 시트 안 Enter 는 버튼에 포커스가 있으면 그 버튼에 맡긴다. 「닫기」에서 누른 Enter 가 적용으로 나가지 않는다.
2. 컨테이너 링은 컨테이너 자신에만 걷는다. seamless 변수는 자식 버튼으로 상속되기 때문이다.
3. 시트가 편집 중인 행은 실패 말풍선을 끈다. 오버레이 위로 뜨지 않게 하고 alert 가 둘이 되는 것을 막는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 접근성 계약] `aria-modal="true"` 명시**
- **Found during:** Task 2 GREEN
- **Issue:** Radix Dialog 1.1.x 는 모달을 형제 `aria-hidden` 으로만 표현하고 `aria-modal` 을 달지 않는다. 접근성 계약·behavior 가 요구하는 속성이 비어 있었다.
- **Fix:** `Dialog.Content` 에 `aria-modal="true"` 를 명시했다.
- **Files modified:** `number-pad-sheet.tsx`
- **Commit:** `0599e5a`

**2. [Rule 1 - Bug] 컨테이너 링 제거가 자식 버튼 링까지 지우는 문제**
- **Found during:** Task 2 GREEN(작성 중 자기 검토)
- **Issue:** UI-SPEC 은 「초기 포커스 = 컨테이너, 링 없음」이다. 그런데 `data-focus-ring="seamless"` 는 CSS 변수라 자식으로 상속되고, 그러면 키패드·버튼의 전역 이중 링(유일한 포커스 표시)까지 사라진다. WCAG 2.4.7 위반이다.
- **Fix:** `focus-visible:[--focus-outline:none] focus-visible:[--focus-shadow:none]` 를 컨테이너에 걸었다. 컨테이너 자신이 `:focus-visible` 일 때만 변수가 꺼지므로 자식이 포커스를 받으면 원래 링이 산다.
- **Files modified:** `number-pad-sheet.tsx`
- **Commit:** `0599e5a`

**3. [Rule 2 - UI redress] 시트가 여는 행의 실패 말풍선 억제**
- **Found during:** Task 3
- **Issue:** 20-01 `SettingRow` 는 실패가 있으면 Radix Popover 말풍선을 body 포털로 띄운다. 시트가 열린 뒤 실패가 오면 그 Popover 가 dim 오버레이보다 DOM 뒤에 붙어 오버레이 위에 떴고, `role=alert` 도 둘이 됐다(T-20-11 과 같은 성격).
- **Fix:** `sheetField === 그 필드` 인 동안은 행에 `failureText={null}` 을 넘긴다. 실패는 시트 상태 줄이 말한다. 닫기는 실패 기록을 지우므로 닫은 뒤에도 말풍선이 남지 않는다. ⑬ 이 「말풍선 없음」을 단언한다.
- **Files modified:** `limit-chaser-form.tsx`
- **Commit:** `73adc42`

**4. [Rule 3 - Blocking] 캐럿 깜빡임 keyframes 를 globals.css 에 추가**
- **Found during:** Task 2
- **Issue:** 캐럿 1s `steps(1)` 깜빡임에 쓸 keyframes 가 없었다. Tailwind 기본 `animate-pulse` 는 steps 가 아니다.
- **Fix:** `globals.css` 에 `@keyframes numpad-caret` 를 두고 `motion-safe:` 에서만 걸었다(reduced-motion 이면 캐럿 고정). 파일은 플랜 `files_modified` 안에 있지만 Task 2 목록 밖이다.
- **Files modified:** `webapp/src/styles/globals.css`
- **Commit:** `0599e5a`

**5. [TDD 절차] Task 3 는 구현을 먼저 쓰고 RED 를 사후에 증명했다**
- **Issue:** Task 3 에서는 폼 배선을 먼저 작성했다. 그 뒤 테스트를 썼다.
- **Fix:** 구현본을 세션 스크래치패드에 보관했다. 그다음 `git checkout -- limit-chaser-form.tsx`(그 파일 하나)로 변경 전 폼을 되살려 새 테스트를 돌렸고, 결과는 `RED_EVIDENCE_OK`(⑪~⑯ 실패)였다. 이 상태에서 테스트만 RED 커밋(`ffbae0e`)하고, 구현본을 복원해 GREEN 커밋(`73adc42`)했다. 커밋 이력은 RED → GREEN 순서를 지키고, RED 커밋 시점 코드에서 테스트가 실제로 실패함을 검증했다.
- **Commit:** `ffbae0e` · `73adc42`

**6. [범위 소폭 확장] P20-2 에 가로 폰 높이 backstop 을 넣었다**
- must_haves 의 backstop 행(가로 폰 높이 약 390 에서 내부 스크롤로 「{필드명} 적용」 에 도달)을 같은 테스트 끝에서 실측한다. 뷰포트 844×390 에서 시트 높이는 370 이하이고 `scrollHeight > clientHeight` 이며, 적용 버튼은 `toBeInViewport` 로 확인했다.
- **Commit:** `73adc42`

**7. [실행 환경] 플랜 커밋 원장 위치**
- 20-02 와 같다. worktree 격리 때문에 `plan_head_before`(af529fc)를 세션 스크래치패드에 기록했다. `commits: 6` 은 `git rev-list --count af529fc..HEAD` 로 측정한 값이다.

---

**Total deviations:** 4 auto-fixed (Rule 1 ×1 · Rule 2 ×2 · Rule 3 ×1) + TDD 절차 1 + 범위 소폭 확장 1 + 실행 환경 1. **Impact:** 전부 접근성 계약이나 오버레이 겹침 방지를 강화한 것이다. 프로토콜·주문 경로 변경은 없다.

## Issues Encountered

- 플랜 수용 기준은 Playwright 「2 passed」인데, 실제 출력은 인증 셋업 프로젝트를 포함해 「3 passed」다(셋업 1 + P20-1 + P20-2, 실패 0). 20-01 에서도 같았다.
- 포트 3100 에 리스너가 없어(`lsof` 출력 0) Playwright 가 이 worktree 의 `PORT=3100 pnpm dev` 를 직접 띄웠다(Pitfall 8 확인, 선행조건 충족).

## Verification Results

- `vitest --run src/lib/__tests__/use-edit-mode.test.ts src/styles/__tests__/tds-tokens.test.ts` → `Test Files 2 passed (2) · Tests 74 passed (74)`
- `vitest --run …/number-pad-sheet.test.tsx` → `Tests 29 passed (29)`
- `vitest --run …/lc-tracer.test.tsx` → `Tests 17 passed (17)`
- `pnpm --filter @gh-radar/shared build` → `DTS dist/index.d.ts 68.77 KB`(성공)
- `pnpm --filter @gh-radar/webapp run typecheck` → `tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0
- `pnpm --filter @gh-radar/webapp run test` → **`Test Files 104 passed (104) · Tests 1890 passed | 1 skipped (1891)`**(skip 1 은 기존 것)
- `playwright test e2e/specs/trading-workbench.spec.ts -g "P20-"` → **`3 passed (12.5s)`**(셋업 + P20-1 + P20-2)
- ESLint(변경 파일 전부) → 오류 0 · 경고 0
- 수용 grep:
  - `--group-bg:` 2 · `--switch-off:` 2 · `--dim:` 2 · tds `'group-bg'` 3 · `useSyncExternalStore` 2 · `matchMedia('(any-pointer` 0
  - 시트: `w-[min(440px,calc(100vw-20px))]` 2 · `rounded-[28px]` 1 · `bg-[var(--dim)]` 1 · `onCloseAutoFocus` 1 · `from '@/components/ui/sheet'` 0 · `<input` 0 · 뷰포트 브레이크포인트 변형 0줄
  - 폼: `useEditMode()` 1 · `<NumberPadSheet` 정확히 1줄(1317)
- `.planning/milestone.lock` · `webapp/e2e/specs/zz-theme-gallery.spec.ts` 는 `??` 그대로다(열지도 스테이징하지도 않았다).
- STATE 의 830 밴드 감시대상 블로커(20-04 전)는 이 플랜 범위 밖이라 건드리지 않았다.

## Known Stubs

없음. `armedNotice={sweepStatusText === '감시 중'}` 는 현재 한방체결 그룹 보조문이 「켜짐/꺼짐」뿐이라 늘 false 지만, 스텁이 아니라 올바른 판정식이다. 20-04 가 필드 스펙으로 그룹을 일반화하면 매수·매도 그룹에서 참이 된다. `LC_SHEET_SPEC` 이 「호가변경」 한 필드뿐인 것은 플랜 범위(트레이서 한 행) 그대로이고, 20-04 가 넓힌다.

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·스키마 변경은 없다. 위협 레지스터 대응:
- T-20-01: 명시 버튼만 전송하고, busy 동안 입력은 전부 잠기며, `validate` 가 확정을 잠근다.
- T-20-04: 시트는 `successSeq` 로만 닫힌다.
- T-20-10: 보정 없이 잠근다.
- T-20-11: z-50 body 끝 포털 + `--dim` 이 배경 포인터를 막는다. 행 말풍선 겹침도 추가로 막았다.

## Next Phase Readiness

- 20-04(전체 리스트)는 `LC_SHEET_SPEC`/`LcSheetField` 를 `lc-fields.ts` 필드 스펙으로 바꾸고, `activateRow` · `handleSheetConfirm` · 시트 인스턴스 1개를 그대로 쓰면 된다. 가격 필드는 `unit='원'` 과 `ctx`(현재가·상한가)가 이미 배선돼 있다.
- 20-06(수동주문)은 `purpose='fill'` · `serverValue` 없음 · 「{필드명} 입력」 으로 `NumberPadSheet` 를 재사용한다(`useEditMode` 로 상자 `<input>`/`<button>` 전환).
- 블로커(기존, 20-04 전): 830 밴드 감시대상 행 폭 해법은 사용자 결정이 필요하다. 이 플랜은 건드리지 않았다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/use-edit-mode.ts · webapp/src/lib/__tests__/match-media.ts · webapp/src/lib/__tests__/use-edit-mode.test.ts · webapp/src/components/trading/lc/number-pad-sheet.tsx · webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx
- FOUND commits: 40bc4a2 · d7935f1 · 42d02b9 · 0599e5a · ffbae0e · 73adc42 (`git log af529fc..HEAD`)
