---
phase: 20-toss-order-ticket
plan: 05
subsystem: ui
tags: [react, inline-edit, keyboard, limit-chaser, vitest, user-event, tdd]
status: complete

requires:
  - phase: 20-01
    provides: "InlineValueEditor(기본 Enter/Esc/blur) · useLcFieldCommit(commit · failures · inflightField · queuedFields · clearFailure) · FailureBubble · armBlockOf"
  - phase: 20-02
    provides: "numpad.ts stepValue · padIssue · PAD_MAX_DIGITS (호가 단위 표는 @gh-radar/shared)"
  - phase: 20-04
    provides: "lc-fields.ts lcNavigableRows · lcRowById · lcRowByField · 필드 스펙으로 조립한 폼"
provides:
  - "InlineValueEditor — ↑↓ 스텝 · D-15/무장 검증 말풍선 · 위반 blur 취소(A6) · 반영 중 readOnly/aria-busy/sr-only · 실패 재시도 · Tab/Shift+Tab onNavigate · props upperLimit/validate/onNavigate · InlineSaveVia 'tab'"
  - "limit-chaser-form.tsx — Tab/Shift+Tab 같은 그룹 이동(handleInlineNavigate) · D-14b 한 번 클릭 전환(onPointerDownCapture + nextEditRef + endEdit) · 옮긴 뒤 실패 행 앵커 말풍선(인라인 문구)"
affects: [20-06, 20-07]

actuals:
  tokens: 12900
  tasks: 2
  commits: 4
plan_head_before: 21f89ae8b353bba490f376af7046eb9ce5fd4ca9

tech-stack:
  added: []
  patterns:
    - "편집 종료는 endEdit 한 경로 — 기록된 다음 행(nextEditRef)이 있으면 이어받고 없으면 닫는다(blur 저장 · 취소 · dismiss 공통)"
    - "인라인 검증 순서: padIssue(원 호가·상한가) → validate(armBlockOf, 훅 전송 직전 가드와 같은 식) — 검증 이유가 실패 문구보다 먼저"
    - "userEvent 로 실제 포인터 순서를 재현해 D-14b 를 검증하고, click 유실 경로는 pointerDown+blur 만으로 따로 잠근다"

key-files:
  created:
    - webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx
    - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
  modified:
    - webapp/src/components/trading/lc/inline-value-editor.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx

key-decisions:
  - "이미 저장한 버퍼(반영 중 · 저장 뒤 미수정)에서 Tab 은 다시 보내지 않고 이동만 한다 — 포커스 이탈과 같은 규율(T-16-10). 재시도는 Enter 뿐"
  - "위반 값 포커스 이탈 = 취소(A6)는 무장 불가 값에도 적용 — 20-04 까지는 blur 가 전송 직전 차단으로 행 실패(armBlocked)를 남겼으나 이제 조용히 취소된다"
  - "편집이 끝난 값 행의 실패 말풍선을 인라인 문구(거부·무응답 = 「반영하지 못했어요 · Enter 로 다시 시도해 주세요」)로 통일 — 옛 rowFailureTextOf 제거"
  - "한 번 클릭 기록은 반영 중(in-flight)·비활성 행을 건너뛴다(activateRow 와 같은 규칙) · Tab 이동은 대상이 반영 중이어도 연다(readOnly busy 편집기)"
  - "편집기 onSave 시그니처는 20-01 의 (value, via) 를 유지하고 via 에 'tab' 을 더했다 — 폼이 blur/enter/tab 을 다르게 끝낸다"

patterns-established:
  - "편집기는 Tab 으로 떠날 때 leftRef 를 세워 언마운트 중 늦은 blur 가 편집을 다시 끝내지 않게 한다"

requirements-completed: []

duration: 7min
completed: 2026-09-25
---

# Phase 20 Plan 05: 인라인 키보드·포인터 정확성 요약

**인라인 편집기가 ↑↓ 한 호가/1 스텝 · D-15 호가/상한가·무장 불가 저장 거부 말풍선 · 반영 중 잠금 · Enter 재시도 · Tab/Shift+Tab 같은 그룹 이동을 하고, 폼은 pointerdown 캡처로 「한 번 클릭 전환」(D-14b)과 다른 행으로 옮긴 뒤 도착한 실패의 제자리 표시를 한다.**

## 성과

- **소요:** 약 7분 (2026-09-25T05:09:55Z → 05:16:17Z)
- **태스크:** 2/2
- **변경 파일:** 4 (신규 테스트 2 · 수정 2)

## 완료한 일

1. **Task 1 — `InlineValueEditor` 확장 (D-14 · D-14a · D-14c · D-15 · A6 · E4)**
   - ↑/↓ = `stepValue`(원 = +tick(v)/−tick(v−1) · 그 밖 ±1 · [0, 999,999,999]) · `preventDefault` · 버퍼만 바꾸고 저장하지 않는다.
   - Enter/Tab 검증: `padIssue`(원 단위 호가·상한가) → `validate`(무장 불가). 위반이면 저장 0 + `FailureBubble`(role=alert) 에 이유, 보정 없음. 값을 고치면 이유가 걷힌다.
   - 포커스 이탈: 위반이면 `onCancel`(A6), 아니면 `onSave(v, 'blur')`. 반영 중/이미 저장이면 `onDismiss` 만.
   - 반영 중: `readOnly` · `aria-busy` · `opacity-60` · sr-only `aria-live="polite"` 「반영 중…」 · 타이핑/↑↓ 무시.
   - Tab/Shift+Tab: 저장 뒤 `onNavigate('next'|'prev')` · 이미 저장한 버퍼는 이동만.
   - 머리 주석에 D-14/D-14a/D-14c/D-15/A5/A6 근거와 「안내 문구·저장 버튼을 두지 않는다」 명시. 테스트 25개.
2. **Task 2 — 폼 내비게이션 (D-14 · D-14b · A-P3)**
   - `handleInlineNavigate`: `lcRowByField(field).group.slot` → `lcNavigableRows(slot)` 다음/이전, 그룹 끝이면 종료.
   - `onPointerDownCapture`: 편집 중에 `[data-lc-field]` **버튼**(값 행/값 버튼 · 비활성·반영 중 제외)을 누르면 `nextEditRef` 에 기록 → 편집기 blur 저장/취소/dismiss 뒤 `endEdit()` 가 이어받는다. 체크·감시대상·스위치는 기록하지 않아 제 동작을 한다.
   - 편집기에 `upperLimit`(원만) · `validate`(= `armBlockOf(lcBaseValues(server, form) + 바꾼 필드)`) · `busy`(in-flight + 대기) · `onNavigate` 배선.
   - 편집 중이 아닌 행의 실패 말풍선을 `inlineFailureTextOf` 로 통일 — 포커스를 뺏지 않고, 값 글자는 서버 값(D-06), 다시 누르면 `failures[field].value` 로 열리고 Esc 가 `clearFailure`.
   - 테스트 18개(userEvent 포인터 순서 · click 유실 보험 경로 포함).

## 태스크 커밋

1. **Task 1 RED** — `fe44199` test(20-05): 인라인 편집기 ↑↓·D-15 검증·반영 중 잠금·Tab 계약 테스트 추가 (RED)
2. **Task 1 GREEN** — `c5d869f` feat(20-05): 인라인 편집기에 ↑↓ 스텝·D-15/무장 검증 말풍선·반영 중 잠금·Tab 이동 콜백 추가
3. **Task 2 RED** — `f8a4e4a` test(20-05): 폼 인라인 Tab 이동·한 번 클릭 전환·직렬화·옮긴 뒤 실패 계약 테스트 추가 (RED)
4. **Task 2 GREEN** — `fd24592` feat(20-05): 상따 폼 인라인 Tab 같은 그룹 이동·D-14b 한 번 클릭 전환·옮긴 뒤 실패 앵커 표시

## TDD 게이트 준수

- Task 1 RED: `inline-value-editor.test.tsx` 25개 중 **17 실패**(모두 계획한 행동의 단언 실패 — ↑↓ · 검증 · A6 · 반영 중 · Tab), 8개는 20-01 이 이미 충족한 행동(포커스·선택 · 빈 값 · Esc · 재시도 · 9자리 · 무안내). GREEN 에서 25/25.
- Task 2 RED: `inline-navigation.test.tsx` 16개 중 **7 실패**(Tab 이동 5 · 옮긴 뒤 실패 2). D-14b 한 번 클릭 케이스는 구현 전에도 통과했다 — RESEARCH §Q6 가 예측한 대로 jsdom/React 에서 click 이 살아남기 때문이다. 그래서 GREEN 단계에서 **click 유실 경로**(pointerDown + blur 만) 테스트를 더했고, `onPointerDownCapture` 를 떼면 그 테스트가 실패함을 직접 확인했다(1 failed / 17 passed → 복원 후 18 passed).

## 검증 결과 (실측)

- `pnpm --filter @gh-radar/shared build` → DTS 빌드 성공
- `pnpm --filter @gh-radar/webapp run typecheck` → `tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0
- `vitest --run inline-navigation · inline-value-editor · limit-chaser-form · lc-tracer` → `Test Files 4 passed · Tests 121 passed`(보험 테스트 추가 전) · 추가 뒤 `inline-navigation` 18 passed
- `pnpm --filter @gh-radar/webapp run test` → **`Test Files 107 passed (107) · Tests 1941 passed | 1 skipped (1942)`** (skip 1 은 기존 `watchlist-api.test.ts`)
- `playwright test e2e/specs/trading-workbench.spec.ts -g "P20-"` → **`3 passed (13.2s)`** (인증 셋업 + P20-1 인라인 Enter + P20-2 시트)
- 수락 grep: 편집기 `stepValue` 3 · `onNavigate` 5 · `aria-busy` 3 / 폼 `onPointerDownCapture` 1 · `lcNavigableRows` 3

## 계획 대비 변경

### 자동 수정

**1. [Rule 2 - 누락된 중요 기능] 이미 저장한 버퍼의 Tab 은 재전송하지 않는다**
- **발견:** Task 1
- **문제:** 계획의 Tab 규칙은 「저장 뒤 이동」만 말한다. Enter 로 보낸 뒤(반영 중) 또는 실패 뒤 고치지 않은 버퍼에서 Tab 을 누르면 같은 확정을 두 번 보내게 된다(T-16-10 위반).
- **수정:** `busy || settledRef` 면 저장 없이 `onNavigate` 만. 실패 값의 재시도는 Enter 로만 남는다. 행은 실패 링·말풍선을 유지한다(A-P3).
- **파일:** `inline-value-editor.tsx` · 테스트 「이미 저장한 버퍼(반영 중)에서 Tab 은 다시 저장하지 않고 이동만 한다」
- **커밋:** c5d869f

**2. [Rule 1 - 버그 예방] Tab 으로 떠난 편집기의 늦은 blur 가드(`leftRef`)**
- **발견:** Task 1
- **문제:** Tab 이동으로 편집기가 언마운트될 때 blur 가 뒤늦게 오면 `onDismiss → endEdit()` 가 막 연 다음 행 편집을 닫을 수 있다.
- **수정:** Tab 이동 시 `leftRef` 를 세우고 blur 에서 무시(`onNavigate` 가 있을 때만).
- **커밋:** c5d869f

**3. [Rule 2 - 테스트 보강] click 유실 보험 경로 테스트**
- **발견:** Task 2 RED — 한 번 클릭 케이스가 구현 전에도 통과해 `onPointerDownCapture` 를 검증하지 못했다.
- **수정:** pointerDown + blur 만으로 이어받기 · 체크 버튼 pointerDown 은 기록하지 않음 2개를 추가하고 뮤테이션(핸들러 제거)으로 실효를 확인.
- **커밋:** fd24592

### 계획 인터페이스와의 차이

- 계획 `<interfaces>` 는 `onSave(v)` 였지만 20-01 의 `onSave(value, via)` 를 유지하고 `via` 에 `'tab'` 을 더했다 — 폼이 blur(편집 종료) · enter(편집기 유지) · tab(이동이 결정)을 다르게 끝내야 한다. `onDismiss` 도 유지했다.

---

**총 변경:** 자동 수정 3건(누락 기능 1 · 버그 예방 1 · 테스트 보강 1). 범위 확장 없음.

## 알려진 스텁

없음 — 변경 파일에 placeholder/TODO/빈 값 렌더 없음.

## 위협 표면

계획 `<threat_model>` 밖의 새 표면 없음. T-20-01(위반 blur = 취소 · busy blur 재저장 0 · Tab 재전송 0) · T-20-10(↑↓ 는 버퍼만, 검증은 거부+이유만) · T-20-02(재시도 = Enter 뿐) · T-20-14(옮긴 뒤 실패 링+말풍선이 다음 성공/Esc 까지) 모두 테스트로 잠금.

## 다음 플랜 준비

- 20-06(수동주문 상자)은 `numpad.ts` 만 공유하고 이 편집기를 쓰지 않는다.
- 20-07 은 실브라우저에서 Tab 이동과 한 번 클릭 전환을 e2e 로 한 번 더 확인할 수 있다(jsdom 은 레이아웃·실제 포커스 이동 규칙을 평가하지 않는다).

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/inline-value-editor.tsx
- FOUND: webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx
- FOUND: webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
- FOUND: webapp/src/components/trading/limit-chaser-form.tsx
- FOUND commits: fe44199 · c5d869f · f8a4e4a · fd24592
