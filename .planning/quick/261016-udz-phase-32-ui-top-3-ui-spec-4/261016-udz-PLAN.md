---
phase: quick-261016-udz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/me/account-chips.tsx
  - webapp/src/components/me/__tests__/account-chips.test.tsx
  - .planning/phases/32-account-axis/32-UI-SPEC.md
  - webapp/src/components/me/device-settings-card.tsx
autonomous: true
requirements: [UDZ-chips-arrow-select, UDZ-uispec-32-15, UDZ-spacing-4x]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "계좌 칩 줄(/me 「My page 계좌」 · 작업대 「계좌」 — 같은 MeAccountChips)에서 ←/→/↑/↓ · Home/End 를 누르면 포커스가 옮겨 가고 그 칩이 바로 선택된다(onChange 1회) — WAI-ARIA radio group 패턴(IN-02 해소)"
    - "잠금(locked) 상태에서는 화살표 · Home/End 가 포커스만 옮기고 선택(aria-checked · onChange)은 그대로다 — 클릭 · Enter · Space 도 지금처럼 무시된다"
    - "Enter/Space/클릭 선택, 선택 칩 재선택 무효, roving tabindex(선택 칩만 tabIndex 0), 끝에서 반대편으로 도는 동작은 그대로다"
    - "/me(me-client.test) · 작업대(workbench-status-bar.test · trading-workbench.test) 소비처 단위 테스트가 수정 없이 통과한다"
    - "32-UI-SPEC 에 「2026-10-16 수정 (32-15)」 절이 하나 있고, 작업대 상단 줄 = AccountPill(이름 유지) → MeAccountChips 래퍼라는 사실이 지금 코드와 일치한다(라벨 「계좌」 · ACCOUNT_PILL_TITLE · 슬롯 workbench-account / workbench-account-chip · compact = phoneBand · 칩 밖 서버키 칩 없음 · 계좌 0 = 「계좌 확인 중…」 글자)"
    - "그 절 밖에서 네이티브 셀렉트 · 칩 밖 서버키 칩을 기술하는 UI-SPEC 줄은 전부 취소선(~~) 또는 「32-15」 표시가 붙어 있다"
    - "UI-REVIEW Pillar 5 가 지목한 간격 위치 9곳이 각각 4배수로 바뀌었거나(1곳) UI-SPEC Spacing Exceptions 에 출처 · 근거와 함께 선언돼 있다(8곳 — 1곳은 기존 선언 문구 갱신)"
  artifacts:
    - path: "webapp/src/components/me/account-chips.tsx"
      provides: "onKeyDown 이 포커스 이동 뒤 pick(대상 칩 계좌번호) 호출 — 잠금 · 같은 계좌 무시는 기존 pick 가드"
      contains: "IN-02"
    - path: "webapp/src/components/me/__tests__/account-chips.test.tsx"
      provides: "화살표 · Home/End = 포커스 + 선택(제어 하네스) · 잠금 시 포커스만 · 계좌 1개 무효 · Enter/Space 선택 유지"
      contains: "ArrowRight"
    - path: ".planning/phases/32-account-axis/32-UI-SPEC.md"
      provides: "「2026-10-16 수정 (32-15)」 절 · 옛 셀렉트 행 무효 표시 · 키보드 문법 갱신 · Spacing Exceptions 판정 근거"
      contains: "2026-10-16 수정 (32-15)"
    - path: "webapp/src/components/me/device-settings-card.tsx"
      provides: "「이 기기」 캡션 위 여백 4px(4배수)"
      contains: "px-1 pt-1 pb-2 text-[12.5px]"
  key_links:
    - from: "webapp/src/components/me/account-chips.tsx onKeyDown"
      to: "pick() → onChange"
      via: "포커스 이동 직후 대상 칩 data-account-no 로 pick 호출 — locked · 같은 계좌면 pick 가드가 무시"
      pattern: "pick\\("
    - from: "MeAccountChips onChange"
      to: "me-client.tsx pickMeAccount · workbench-status-bar.tsx AccountPill → trading-workbench.tsx pickAccount"
      via: "두 소비처 모두 로컬 상태 · localStorage · history.replaceState 뿐(네트워크 왕복 없음) — 화살표마다 선택해도 안전"
      pattern: "onChange=\\{"
---

<objective>
Phase 32 UI 리뷰(32-UI-REVIEW.md 17/24) Top 3 를 고친다. 사용자 번호와 태스크 순서 대응: **Task 1 = ②**(계좌 칩 화살표 = 선택 · IN-02), **Task 2 = ①**(UI-SPEC 32-15 수정 절 · 옛 셀렉트 행 무효), **Task 3 = ③**(비-4배수 간격 판정). ② 를 먼저 하는 이유: ① 의 UI-SPEC 갱신이 키보드 문법까지 「실제 코드」 를 읽고 한 번에 적게 하려는 것이다(문서가 코드보다 앞서지 않는다).

Purpose: 다음 phase 가 UI-SPEC 을 믿고 작업대 계좌 선택을 셀렉트로 오판하지 않게 하고, 스크린리더 사용자가 화살표로 계좌를 바꿀 때 「선택됨」 변화를 듣게 하며, 간격 계약(4배수)과 코드의 어긋남을 수정 또는 근거 있는 예외로 닫는다.

Output: account-chips.tsx 키보드 수정 + 테스트, 32-UI-SPEC.md 수정 절 · 무효 표시 · Spacing Exceptions 근거, device-settings-card.tsx 캡션 여백 1곳.

**범위 상한(강제):** 이 3건만. 색 토큰(`--up-bg` 교체) · 「끄기/비활성화」 문구 통일 · 잠금 칩 개별 disabled/aria-disabled 처리 · IN-04 · IN-05 · `ChoiceRow`(setting-group.tsx) 키보드 · ROADMAP 의 32-15 기록 · Phase 32 밖 파일 간격 · UI-REVIEW 미지목 위치의 간격은 손대지 않는다. 32-UI-REVIEW.md 자체는 고치지 않는다(감사 산출물). 전체 E2E 금지 — 이 플랜은 E2E 가 필요 없다(소비처 jsdom 테스트로 충분).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/32-account-axis/32-UI-REVIEW.md
@CLAUDE.md

# 고칠 코드 · 테스트
@webapp/src/components/me/account-chips.tsx
@webapp/src/components/me/__tests__/account-chips.test.tsx

# 사실 확인용(읽기만) — 32-15 작업대 칩
@webapp/src/components/trading/workbench/workbench-status-bar.tsx
@webapp/e2e/fixtures/workbench-account.ts

# 32-UI-SPEC.md 는 733줄(약 47K 토큰) — 통째로 읽지 말고 아래 Task 2 · 3 이 지정한 구간만 Read offset/limit 로 읽는다.

## 계획 시점 관측(2026-10-16 · HEAD 1fdb78cf)

- `MeAccountChips.onKeyDown` 은 ←/→/↑/↓ · Home/End 에서 `buttons[to]?.focus()` 만 하고 선택은 Enter/Space/클릭(네이티브 button)으로만 된다. `pick(next)` 는 `locked || next === accountNo` 면 무시한다. 칩 button 마다 `data-account-no` 가 있다.
- 소비처 2곳: `me-client.tsx` `pickMeAccount`(setState + `writeMeAccount` localStorage) · `workbench-status-bar.tsx` `AccountPill` → `MeAccountChips`(label 「계좌」 · title `ACCOUNT_PILL_TITLE` · slot `workbench-account` · chipSlot `workbench-account-chip` · compact = `phoneBand` · locked 없음) → `trading-workbench.tsx` `pickAccount`(setState · `writeTradingAccount` · `history.replaceState`). 둘 다 네트워크 왕복이 없다.
- `ChoiceRow`(setting-group.tsx ~1185)는 「화살표는 포커스만(선택 = 전송)」 — 선택이 relay 전송이라 그렇다. 계좌 칩은 로컬 상태라 같은 이유가 없다. ChoiceRow 는 범위 밖, 그대로 둔다.
- 테스트 · E2E 어디에도 계좌 칩에 화살표를 누르는 곳은 없다(grep ArrowRight/ArrowLeft/Home/End — account-chips.test.tsx 만).
- 기준 실행: account-chips(13) · device-settings-card(7) · workbench-status-bar · me-client · trading-workbench(151) · strategy-status-card · alert-toasts 전부 통과(285+20).
- 32-15 출처: 커밋 `55aee55b`(feat · 셀렉트 → 칩 · 칩 밖 `workbench-account-server` 제거 · 계좌 0 = 「계좌 확인 중…」 글자) · `09b546be`(test · E2E 칩 전환 · 폰 「상품명 · 서버키」 · 백스톱 칩 줄 판정 · `webapp/e2e/fixtures/workbench-account.ts`). 32-VERIFICATION.md 74 · 149행이 「사용자 지시 변경이라 갭 아님」 으로 기록. 작업대 서버키 칩 `title` 「이 계좌의 주문 서버」 는 코드에서 사라졌다(grep 0).
</context>

## ③ 간격 위치별 판정표 (Task 3 이 적용 · 출처는 `git blame` / `git log -S` 실측)

원칙(사용자): 4배수로 맞추되, 시각 결과가 눈에 띄게 달라지거나 Phase 31 이전부터 상속된 값 · 기존 공용 부품 규격이면 UI-SPEC Spacing Exceptions 에 근거와 함께 선언한다. 줄 번호는 HEAD 1fdb78cf 기준.

| # | 위치 | 비-4배수 값 | 출처 | 판정 | 근거 · 조치 |
|---|---|---|---|---|---|
| 1 | `alert-toasts.tsx:148` 토스트 카드 | `gap-2.5`(10) · `py-2.5`(10) (`px-3` 12 은 4배수) | `3efe2d24` quick-260923-pgu (2026-09-23 · Phase 31 이전). Phase 32 는 S4 계좌 줄(`data-part="account"`)만 더했고 이 줄은 안 바꿨다 | 예외 | 상속 · 알림 토스트 7종 공통 기하 — 바꾸면 Phase 32 와 무관한 모든 토스트 높이 · 열 간격이 바뀐다. UI-REVIEW 의 「신규 코드」 판단은 blame 상 틀림 |
| 2 | `alert-toasts.tsx:169` 건수 배지 「{n}건」 | `px-[5px]` | `3efe2d24` (같음) | 예외 | 상속 + 프로젝트 공용 마이크로 배지 규격 — `strategy-badge.tsx:176` · `vi-order-list.tsx:820` · `vi-trigger-strip.tsx:226` · `breakout-strip.tsx:663` 이 같은 5px |
| 3 | `strategy-status-card.tsx:283` 「이 계좌 끄기」 확인 다이얼로그 요약 상자(`dl`) | `gap-1.5`(6) · `py-2.5`(10) | 원본 `527af76a` 16-15 (2026-09-08 「전체 비활성화」 다이얼로그) → 32-01 · 32-06 이 계좌 모드로 옮김 | 예외 | 상속 + 확인 다이얼로그 공용 문법 — `vi-settings-rows.tsx:833` VI 시작/중지 다이얼로그 `vi-confirm-summary` 가 같은 값. 한쪽만 바꾸면 두 확인 다이얼로그가 갈린다(VI 쪽은 UI-REVIEW 미지목 · 범위 밖) |
| 4 | `strategy-status-card.tsx:305` 같은 다이얼로그 경고 문단 | `px-2.5`(10) (`py-2` 8 은 4배수) | 원본 16-15 (같음) | 예외 | 같은 근거 — `vi-settings-rows.tsx:859` `vi-confirm-warning` 같은 값 |
| 5 | `workbench-status-bar.tsx:154` 상단 줄 카드 | `py-2.5`(10) | `f8280a45` 토스 B 테마 `.status-bar` 10/16 (260924-vj1 · Phase 31 이전) | 예외 | 상속 · UI-SPEC 치수 표가 이미 「상단 줄 카드 — 기존 그대로 패딩 16/10」 으로 값을 선언 — Exceptions 에도 명시해 계약 안 모순을 없앤다. 바꾸면 작업대 머리 높이가 바뀐다 |
| 6 | `workbench-status-bar.tsx:262` 컬럼 세그먼트 항목 「1단/2단/3단」 | `px-[9px]` | `e2f33f7c` 18-11 (Phase 18) → 32-03 이 옮김 | 예외 | 사용자 예시 그대로 — 공용 세그먼트 항목 규격(`setting-group.tsx:1229` ChoiceRow 항목도 `px-[9px]`) · 24px 트랙 안 항목 폭 맞춤 |
| 7 | `workbench-status-bar.tsx:308` 옮김 안내 닫기 × | `-my-0.5`(−2) | `b32ef150` 29-39 (Phase 29) | 예외 | 상속 · 광학 보정 — 20px(`size-5`) 누름 영역을 `AUX_LINE` 줄 높이 ≈16px(11px × 1.45) 안에 넣어 줄을 키우지 않는다(20 − 2×2 = 16) |
| 8 | `device-settings-card.tsx:74` 「이 기기」 캡션 | `pt-0.5`(2) | `6d4e3822` 32-03 (Phase 32 신규) | **수정** | 신규 · 공용 부품 아님 · 차이 2px(제목 → 캡션) — `pt-1`(4)로, `pb-2` 유지. 같은 역할 캡션 `me-lc-defaults-note`(limit-chaser-defaults.tsx:730)도 `pt-1` 이라 위 여백이 맞춰진다 |
| 9 | `account-chips.tsx:169` 칩 안 서버키 칩 | `px-1.5`(6) | `8aa49eab` 32-01 (옛 작업대 서버키 칩 치수 복사) | 예외(기존 선언 유지) | UI-SPEC Exceptions 에 「서버키 칩 … 좌우 6px」 이 이미 있다. 단 그 근거 문구가 32-15 로 사라진 칩 밖 서버키 칩을 가리키므로 문구 갱신이 필요 — **Task 2 몫**(32-15 사실) |

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (② IN-02): 계좌 칩 radiogroup — 화살표 · Home/End 가 포커스와 함께 선택</name>
  <files>webapp/src/components/me/account-chips.tsx, webapp/src/components/me/__tests__/account-chips.test.tsx</files>
  <read_first>webapp/src/components/me/account-chips.tsx (전체 179줄), webapp/src/components/me/__tests__/account-chips.test.tsx (전체 152줄), webapp/src/components/trading/workbench/workbench-status-bar.tsx 318-361 (AccountPill 래퍼 — 읽기만)</read_first>
  <behavior>
    - 비제어(setup · accountNo 「1234-5678」 고정): 첫 칩에 포커스 → ArrowRight → 둘째 칩 포커스 + onChange 1회 「8765-4321」.
    - 제어 하네스(테스트 안 useState 래퍼 — onChange 스파이를 호출하고 상태도 바꾼다): 첫 칩에서 ArrowRight 세 번 → onChange 순서 「8765-4321」 · 「5555-0001」 · 「1234-5678」(끝에서 처음으로 돈다) · 매번 포커스 칩 = aria-checked true 칩 = 유일한 tabIndex 0. 첫 칩에서 ArrowLeft → 「5555-0001」(반대편으로 돈다). ArrowDown/ArrowUp 은 Right/Left 와 같다.
    - 제어 하네스: End → 마지막 칩 포커스 + 선택, Home → 첫 칩 포커스 + 선택.
    - 잠금(locked): ArrowRight · End · Home 은 포커스만 옮기고 onChange 0회 · aria-checked 는 원래 칩 그대로(기존 잠금 테스트 2개의 「클릭 · Enter · Space 0회 · aria-disabled · title · opacity · 풀리면 다시 고른다」 단언은 유지).
    - 계좌 1개: ArrowRight → 포커스는 같은 칩 · onChange 0회(pick 의 같은 계좌 가드).
    - Enter/Space 선택 유지: 선택 안 된 칩에 프로그램 포커스(`chips()[2].focus()`) 후 Enter → 「5555-0001」, `chips()[1].focus()` 후 Space → 「8765-4321」.
    - 나머지 기존 케이스(radiogroup 이름 · 접근 이름 · roving tabindex · 목록 밖 선택 · 클릭 · 재클릭 무효 · 빈 목록 · 부분별 렌더)는 그대로 통과.
  </behavior>
  <action>
RED 먼저(per IN-02 · 32-UI-REVIEW Top 3 ②): account-chips.test.tsx 에서 「→ 키는 포커스만 옮기고 onChange 0회」 테스트와 「Home/End 는 처음/끝 칩 포커스(onChange 0)」 테스트를 위 behavior 의 「포커스 + 선택」 테스트로 바꾸고, 「Enter 가 포커스 칩을 고른다 · Space 도」 테스트는 화살표 대신 프로그램 포커스로 칩을 옮긴 뒤 Enter/Space 를 누르는 형태로 고친다. 제어 하네스 · 잠금 시 화살표/Home/End 포커스만 · 계좌 1개 케이스를 추가한다. 하네스는 테스트 파일 안의 작은 컴포넌트(React useState 로 accountNo 를 쥐고 onChange 에서 스파이 호출 + 상태 갱신)로 만든다 — 새 공용 유틸 파일을 만들지 않는다. 파일 머리 주석(10~13줄)의 「←/→ 는 포커스만」 문구를 「←/→/↑/↓ · Home/End = 포커스 + 선택(WAI-ARIA radio · IN-02) · 잠금이면 포커스만」 으로 고친다. 새 테스트가 실패하는 것을 확인하고 커밋한다(`test(quick-261016-udz): …`).

GREEN: account-chips.tsx `onKeyDown` 에서 대상 인덱스를 정하고 `preventDefault` · `buttons[to]?.focus()` 한 다음, 그 버튼의 `data-account-no`(dataset.accountNo)가 있으면 기존 `pick` 에 넘긴다. 잠금 · 같은 계좌 무시는 `pick` 가드가 이미 하므로 키 처리 안에 별도 분기를 만들지 않는다(잠금이면 포커스만 옮겨 가는 지금 동작이 그대로 유지된다). 순환 · Home/End · ArrowDown/ArrowUp 처리와 roving tabindex(`tabStop`) · `scrollIntoView` 효과 · Enter/Space(네이티브 button 클릭)는 그대로 둔다. 개별 칩에 `disabled`/`aria-disabled` 를 붙이지 않는다(잠금 칩 disabled 처리는 범위 밖).

머리 주석 ② 를 고친다: 키보드 문법 = WAI-ARIA radio group — roving tabindex · ←/→/↑/↓ 는 이웃 칩으로 포커스를 옮기며 **그 칩을 고른다**(끝에서 반대편) · Home/End 는 처음/끝 칩을 고른다 · Enter/Space/클릭도 고른다 · 잠금(③)이면 화살표는 포커스만. 그리고 `ChoiceRow` 와 갈리는 이유 한 줄: ChoiceRow 는 선택 = relay 전송이라 화살표가 포커스만이지만, 계좌 칩 선택은 로컬 상태(기기별 기억 · 작업대 스코프)라 왕복이 없어 WAI-ARIA 기본을 따른다(IN-02 · quick-261016-udz). 주석 ③ 의 「칩 클릭 · 키 선택이 무시된다」 는 「칩 클릭 · 키 선택이 무시된다(화살표는 포커스만 옮긴다)」 로 맞춘다. 주석 안에 IN-02 를 남긴다(artifact contains 검사).

소비처 확인: me-client.test.tsx · workbench-status-bar.test.tsx · trading-workbench.test.tsx 는 화살표를 쓰지 않으므로 수정 없이 통과해야 한다 — 실패하면 소비처 테스트를 고치지 말고 원인을 먼저 찾는다(포커스가 칩에서 빠지는 재마운트 등). 커밋: `fix(quick-261016-udz): 계좌 칩 화살표 · Home/End 가 포커스와 함께 선택 — WAI-ARIA radio (IN-02)`. 경로 지정 `git add`(두 파일) · `git add -A` 금지 · 커밋 직전 `git status -sb` 로 남의 변경이 섞이지 않았는지 확인 · 한글 메시지 · Co-Authored-By 없음 · push 금지.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/me-client.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>화살표 · Home/End 가 포커스와 함께 onChange 를 부르고(잠금이면 포커스만), Enter/Space/클릭 · roving tabindex 는 그대로 — account-chips 테스트가 새 케이스 포함 통과, /me · 작업대 소비처 테스트 3파일이 수정 없이 통과, webapp typecheck 통과, test 커밋(RED) + fix 커밋(GREEN) 2개.</done>
</task>

<task type="auto">
  <name>Task 2 (① 32-15): 32-UI-SPEC 에 「작업대 상단 줄도 계좌 칩」 수정 절 · 옛 셀렉트 행 무효 표시 · 키보드 문법 갱신</name>
  <files>.planning/phases/32-account-axis/32-UI-SPEC.md</files>
  <read_first>.planning/phases/32-account-axis/32-UI-SPEC.md 1-122(머리 · 기존 「2026-10-16 수정」 절) · 138-205(인벤토리 · Spacing) · 224-300(Color · Copywriting · S11 · S1) · 408-442(S1 · S2 시각) · 486-495(S6 원문) · 525-570(S10 · 접근성 · 체커 메모) · 574-610(폭 백스톱 · UI Considerations S1/S2) · 630-676(Considerations S6 · S10 · S11) · 698-706(Discretion), webapp/src/components/trading/workbench/workbench-status-bar.tsx 1-30 · 70-110 · 140-160 · 318-361, webapp/src/components/me/account-chips.tsx(Task 1 반영본), webapp/e2e/fixtures/workbench-account.ts, webapp/e2e/specs/account-axis-backstop.spec.ts 40-55, `git show --stat 55aee55b 09b546be`, .planning/phases/32-account-axis/32-VERIFICATION.md 74 · 149행</read_first>
  <action>
기존 문서 관례(「2026-10-16 수정 — /me 계좌 위 선택」 절 · 원문은 변경 이력으로 남기고 취소선 · 「수정 절이 우선」 배너)를 그대로 따른다. 원문 문장을 지우지 않는다 — 취소선(~~…~~)으로 남기고 바로 뒤에 「(32-15 로 대체 — 새 사실)」 을 붙인다. 모든 사실은 위 read_first 의 지금 코드에서 확인한 것만 적는다(32-UI-REVIEW Top 3 ① · 사용자 지시).

(1) 새 절 추가 — 제목은 정확히 `## 2026-10-16 수정 (32-15) — 작업대 상단 줄도 계좌 칩`. 자리는 기존 「2026-10-16 수정 — /me 계좌 위 선택」 절의 마지막 하위 절(「폭 백스톱(수정분)」) 뒤, `## Design System` 앞의 구분선(---) 바로 앞이며, 새 절 끝에도 구분선을 둔다. 담을 사실:
- 출처: 사용자 지시 2026-10-16 「계좌선택을 콤보로 하지 말고 칩으로」 · 「칩 밖에 KB120 한번 더 표현하는건 없애줘」, 커밋 `55aee55b`(feat) · `09b546be`(E2E), 32-VERIFICATION 「사용자 지시 변경이라 갭 아님」. 이 절이 S1 · S2 · S10 · S10′ · 접근성 · 폭 백스톱 · UI Considerations · Claude's Discretion 의 셀렉트 기술과 어긋나면 이긴다.
- S1′ 배치: 상단 줄 카드 안 왼쪽부터 계좌 칩 줄 → 시세 알약 → 주문 알약 → (`ml-auto`) 컬럼 세그먼트. 칩 밖 서버키 칩 항목은 없다.
- 부품: `AccountPill`(이름 유지 · `workbench-status-bar.tsx` export · props `{accounts, accountNo, onChange, compact}`)은 `MeAccountChips` 를 감싼 얇은 래퍼다 — 네이티브 셀렉트 없음. 넘기는 값: 그룹 이름 「계좌」 · 그룹 `title` = `ACCOUNT_PILL_TITLE` 「작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요」 · 그룹 슬롯 `workbench-account`(유지) · 칩 슬롯 `workbench-account-chip` + `data-account-no` · `compact` = 상단 줄 `phoneBand` · 잠금(`locked`) 없음.
- 칩 모양: S13 칩과 같은 부품 · 같은 치수(높이 32 · 좌우 12 · `rounded-full` · 칩 사이 8 · 칩 안 4 · 선택 `--seg-on-*` · 비선택 `--muted` · `whitespace-nowrap` · 한 줄 가로 스크롤 · 스크롤바 숨김).
- 칩 글자: `wb` ≥ 680 = /me 와 같은 상품명(12.5/600) · 번호(11/400 mono) · 서버키 칩(10/700). `compact` true(`wb` < 680 · 격자 1열 고정 — 세그먼트를 DOM 에서 빼는 것과 같은 판정) = 번호를 빼고 「상품명 · 서버키」, 단 상품명이 비었거나 다른 계좌와 상품명 ∧ 서버키가 같으면 상품명 대신 번호(`accountShortLabelOf` · 사이드바 소제목 규칙). `compact` null(폭 미판정 첫 페인트) = 두 부분을 모두 그리고 CSS `@max-[680px]/wb:hidden` 으로 줄인다(세그먼트 `hidden @min-[680px]/wb:inline-flex` 와 같은 경계). 접근 이름은 언제나 전체 `accountChipLabelOf`(「{상품명} {번호} {서버키}」). 작업대 폰 칩 글자와 /me 칩 글자가 다른 것은 폭 때문의 의도된 차이라고 한 줄 적는다(32-UI-REVIEW Pillar 2 메모).
- 서버키: 칩 안 `data-part="server"` 뿐 — 칩 밖 서버키 칩과 그 `title` 「이 계좌의 주문 서버」 는 없다.
- 상태: 계좌 0 = 칩 없이 「계좌 확인 중…」 글자 하나(span · 슬롯 `workbench-account` · `aria-disabled="true"` · 같은 `title` · 11px `--muted-fg` · 높이 32 — 옛 「1옵션 비활성 셀렉트」 대체) / 1 = 칩 1개 선택 / 다수 = 칩 줄 · 넘치면 그 줄 안 가로 스크롤(옛 네이티브 말줄임 대체).
- 접근성 · 키보드: radiogroup 「계좌」 · 칩 `role="radio"` + `aria-checked` · roving tabindex · Task 1 이후 키보드 = S13 과 같다(←/→/↑/↓ · Home/End = 포커스 + 선택 · 끝에서 반대편 · Enter/Space/클릭도 선택 · IN-02 수정) · 바꾼 뒤 포커스는 그 칩(S2 「포커스는 셀렉트에」 를 대체) · 작업대는 잠금이 없다.
- 슬롯 · 테스트: 「유지 슬롯」 에서 칩 밖 서버키 칩 슬롯이 빠지고 `workbench-account-chip` 이 더해진다. E2E 조회구는 `webapp/e2e/fixtures/workbench-account.ts`(accountChips · accountChip · pickAccount · expectAccount). 폭 백스톱(`account-axis-backstop.spec.ts`)은 칩 줄 자신의 가로 스크롤 폭을 넘침 판정에서 뺀다.
- S10 · S10′ 무효: 공용 계좌 필(네이티브 셀렉트)은 어디에도 없다 — /me(S13) · 작업대(이 절) 모두 `MeAccountChips`.
- 끝에 「무효 표시한 자리」 목록(아래 (3) 의 절 이름들)을 한 줄씩.

(2) 머리: frontmatter `amended:` 따옴표 문자열 끝에 「 · 2026-10-16 32-15 작업대 상단 줄 셀렉트 → 계좌 칩(「2026-10-16 수정 (32-15)」 절 우선) · 계좌 칩 화살표 = 선택(IN-02)」 을 덧붙인다(한 줄 · 큰따옴표 유지 · YAML 깨지지 않게). 머리 인용문의 「새 파일은 공용 계좌 필(`AccountPill` 이전) 하나다.」 를 취소선 + 「(32-15: 공용 필 없음 — 작업대 · /me 모두 `MeAccountChips`)」 로, 기존 「2026-10-16 수정:」 인용 줄 다음에 「2026-10-16 수정 (32-15)」 우선 규칙 인용 줄 하나를 더한다.

(3) 원문 무효 표시 — 아래 자리를 찾아(줄 번호는 HEAD 기준 근사 · 문구로 찾는다) 낡은 구절에 취소선 + 「32-15」 표시를 붙인다. 판정 규칙: 새 절 밖에서 「셀렉트」 · 꺾쇠 select 태그 · 칩 밖 서버키 슬롯 이름(`workbench-account-server`)이 나오는 줄은 **모두** 같은 줄 안에 취소선(~~) 또는 「32-15」 글자를 가져야 한다(아래 verify 가 줄 단위로 검사한다).
- 섹션 배너(인용 한 줄 「> **32-15 수정 절이 우선** — 계좌 셀렉트 기술은 계좌 칩 줄로 대체」): Copywriting `### S1. 작업대 상단 줄 A (D-05 · D-06 · D-07)` · 시각 `### S1. 작업대 상단 줄 A` · `### S2. 작업대 계좌 스코프`(시각) · `### S10. 공용 계좌 필 (D-13)`(기존 배너 줄에 덧붙여도 된다) · `### S10′. 공용 계좌 필 (D-25 축소)`.
- S10′ 본문(~110) 「S10 원문의 모양 · props 는 작업대 상단 줄 S1 에만 적용」 → 취소선 + 「32-15 로 S10 은 어디에도 적용되지 않는다」. S10 원문 3줄(~529-531).
- 인벤토리(~151 `AccountPill` 행 Notes): 옛 「네이티브 select + 서버키 칩」 설명 취소선 + 「32-15: `MeAccountChips` 래퍼 · label 「계좌」 · slot `workbench-account` / `workbench-account-chip` · compact = phoneBand」. `MeAccountChips` 행(~152): 「/me 탭 위(S13) + 작업대 상단 줄(32-15 · `AccountPill` 경유)」 · props(label · title · slot · chipSlot · compact · locked · lockedTitle) · 「`ChoiceRow` 세그먼트 키보드 문법 재사용」 취소선 + 「키보드 WAI-ARIA radio — 화살표 · Home/End = 선택(IN-02)」 — 이 행에 「32-15」 와 「IN-02」 둘 다 들어가야 한다. `ChoiceRow` 행(~163): 「키보드 · 선택 면 문법 원본」 → 「선택 면 문법 원본 · 키보드는 갈림(ChoiceRow 화살표 = 포커스만 · 선택 = 전송 / 계좌 칩 화살표 = 선택 · IN-02)」.
- Spacing Exceptions(~202 서버키 칩 줄): 근거 「기존 … 칩 그대로」 를 취소선 + 「32-15 뒤 계좌 칩 안 `data-part="server"`(/me · 작업대 공용) · /me 설정 제목 줄 서버키 칩 — 옛 칩 치수 그대로」(판정표 9). (~203) 「상단 줄 계좌 셀렉트 높이 26px」 구절만 취소선 + 「32-15: 칩 높이 32 · S13 치수」 — 컬럼 세그먼트 24px · LED 7px 는 유지.
- Color(~229 Secondary 「계좌 셀렉트」 · ~250 「계좌번호(셀렉트 · 소제목)」) · Copywriting Primary CTA(~264 「작업대의 주 동작은 계좌 셀렉트 선택」 → 계좌 칩 선택) · S11 쓰는 자리(~276 「① 상단 줄 셀렉트 옵션」 → 32-15: 작업대 칩 접근 이름 `accountChipLabelOf` · 폰 칩 글자 `accountShortLabelOf`).
- Copywriting S1 표(~286-289): 접근 이름 · `title` 행은 「계좌 셀렉트」 → 「계좌 칩 줄(radiogroup)」 로 표시(문구 값 자체는 유효), 「계좌 0개」 행 → 「계좌 확인 중…」 글자 span, 「서버키 칩 `title`」 행 → 32-15 로 없음.
- 시각 S1(~414 배치 줄 · ~424 「**셀렉트 · 칩:**」 문단 · ~430 유지 슬롯), S2(~436 전환 · ~441 계좌 1개), S6 원문(~491 「공용 `AccountPill` — 셀렉트 + 서버키 칩」 — /me 주문 필은 이미 S6′ 로 없음 · 32-15 로 공용 필도 없음).
- 접근성 표(~549 「계좌 셀렉트」 행 → radiogroup 「계좌」 · ~561 「계좌 전환 포커스」 행 → 칩), 체커 메모(~567 시선 앵커 「계좌 셀렉트」 → 계좌 칩 줄의 선택 칩), 폭 백스톱(~576 최악값 「셀렉트 옵션」 · ~577 상단 줄 네이티브 말줄임 → 칩 줄 가로 스크롤).
- UI Considerations S1 행(~594 · 597 · 600 · 601), S2 행(~603 · 608), S6 long-text(~640), S10 행 전부(~665-672 — 표 행 끝에 「32-15 로 무효」), S11 overflow(~675 select 옵션 구절), Claude's Discretion 4(~705).

(4) 키보드 문법(Task 1 반영): S13 「**접근성.**」 문단(~53 — 문단 첫머리 「**접근성.**」 와 「My page 계좌」 는 그대로 둔다)의 「roving tabindex(←/→ · Home/End) — `ChoiceRow` 세그먼트와 같은 키보드 문법」 을 취소선 + 「roving tabindex · ←/→/↑/↓ · Home/End 는 포커스를 옮기며 그 칩을 고른다(WAI-ARIA radio · IN-02 수정 2026-10-16) · 끝에서 반대편 · Enter/Space/클릭도 고른다 · 잠금이면 포커스만 — ChoiceRow 는 선택 = 전송이라 포커스만으로 남는다」 로. 접근성 표 「/me 계좌 칩(S13)」 행(~550 · 행 안의 `role="radiogroup"` 표기는 그대로 둔다 — Spacing 치수 표의 같은 이름 행 ~192 와 구분하는 검사 기준)에도 같은 요지 + IN-02 + 「작업대 상단 줄도 같은 부품(32-15)」.

커밋: `docs(quick-261016-udz): 32-UI-SPEC 에 32-15 작업대 상단 줄 계좌 칩 수정 절 · 옛 셀렉트 행 무효 · 칩 키보드 IN-02 반영`. 경로 지정 `git add .planning/phases/32-account-axis/32-UI-SPEC.md` · `git status -sb` 확인 · 한글 · Co-Authored-By 없음 · push 금지.
  </action>
  <verify>
    <automated>node -e 'const L=require("fs").readFileSync(".planning/phases/32-account-axis/32-UI-SPEC.md","utf8").split("\n");const H=/^## 2026-10-16 수정 \(32-15\)/;const hs=L.filter(l=>H.test(l)).length;let inS=false;const sec=[],bad=[];L.forEach((l,i)=>{if(H.test(l)){inS=true;return}if(inS&&/^## /.test(l))inS=false;if(inS){sec.push(l);return}if(/셀렉트|\x3cselect\x3e|workbench-account-server/.test(l)&&!/32-15|~~/.test(l))bad.push(i+1)});const S=sec.join("\n");const need=["workbench-account-chip","accountShortLabelOf","accountChipLabelOf","@max-[680px]/wb:hidden","55aee55b","09b546be","계좌 확인 중…","작업대에 보일 계좌예요","IN-02","workbench-account.ts"].filter(k=>!S.includes(k));const kb=[["S13 접근성",L.find(l=>l.startsWith("**접근성.**")&&l.includes("My page 계좌"))||""],["a11y S13",L.find(l=>l.startsWith("| /me 계좌 칩(S13)")&&l.includes("radiogroup"))||""],["inventory",L.find(l=>l.startsWith("| `MeAccountChips`"))||""]].filter(([n,l])=>!l.includes("IN-02")).map(([n])=>n);const inv=L.find(l=>l.startsWith("| `MeAccountChips`"))||"";const am=/^amended: ".*32-15.*"$/.test(L.find(l=>l.startsWith("amended:"))||"");const e=[];if(hs!==1)e.push("heading count "+hs);if(bad.length)e.push("unmarked lines "+bad.join(","));if(need.length)e.push("section missing "+need.join(","));if(kb.length)e.push("IN-02 missing: "+kb.join(","));if(!inv.includes("32-15"))e.push("inventory MeAccountChips lacks 32-15");if(!am)e.push("amended lacks 32-15");if(e.length){console.error(e.join("\n"));process.exit(1)}console.log("ok")'</automated>
  </verify>
  <done>32-UI-SPEC 에 「2026-10-16 수정 (32-15)」 절이 정확히 하나 있고 코드 사실(래퍼 · 라벨 · title · 슬롯 · compact 3상태 · 칩 밖 서버키 칩 없음 · 계좌 0 글자 · E2E 조회구 · 커밋 2개)을 담는다. 절 밖의 셀렉트/칩 밖 서버키 칩 기술 줄은 전부 취소선 또는 32-15 표시. S13 접근성 문단 · 접근성 표 S13 행 · 인벤토리 MeAccountChips 행이 IN-02 키보드(화살표 = 선택)를 말한다. frontmatter amended 에 32-15. docs 커밋 1개.</done>
</task>

<task type="auto">
  <name>Task 3 (③ 간격): 「이 기기」 캡션 4배수 정리 + UI-SPEC Spacing Exceptions 에 상속 · 공용 값 근거 선언</name>
  <files>webapp/src/components/me/device-settings-card.tsx, .planning/phases/32-account-axis/32-UI-SPEC.md</files>
  <read_first>이 PLAN 의 「③ 간격 위치별 판정표」, webapp/src/components/me/device-settings-card.tsx 60-85, .planning/phases/32-account-axis/32-UI-SPEC.md 「## Spacing Scale」 절(~168-205 — Task 2 반영본), 판정표 각 행의 출처를 의심되면 `git blame -L <줄>,<줄> <파일>` 로 재확인(읽기만)</read_first>
  <action>
판정표 그대로 적용한다(per 32-UI-REVIEW Top 3 ③ · 사용자 원칙 「4배수로 맞추되 상속 · 공용 규격 · 눈에 띄는 시각 변화는 Exceptions 에 근거와 함께」).

(1) 수정 1곳(판정표 8): device-settings-card.tsx 캡션 `p`(`id={captionId}`)의 위 여백을 2px 단계에서 `pt-1`(4px)로 바꾸고 `px-1` · `pb-2` · 나머지 클래스는 그대로 둔다 — 결과 클래스는 `px-1 pt-1 pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]`. 다른 줄은 바꾸지 않는다.

(2) 코드 무변경 7곳(판정표 1~7): alert-toasts.tsx · strategy-status-card.tsx · workbench-status-bar.tsx 는 열지도 고치지도 않는다(예외로 선언만).

(3) 32-UI-SPEC 「## Spacing Scale」 의 「Exceptions (상속 · 컴포넌트 내부 미세 치수 — 간격 스케일 밖으로 선언):」 목록 끝(같은 목록 안 · 다음 구분선 앞)에 머리 항목 「2026-10-16 UI 리뷰 간격 판정(quick-261016-udz) — 32-UI-REVIEW Pillar 5 지목 값 중 4배수로 바꾸지 않고 남기는 것 · 근거 = 출처 커밋 · 공용 규격」 을 두고 그 아래 하위 항목 7개(판정표 1~7)를 적는다. 각 항목 = 요소 이름 + 파일 이름 + 값(클래스 그대로 — 예 `gap-2.5` · `py-2.5` · `px-[5px]` · `gap-1.5` · `px-2.5` · `px-[9px]` · `-my-0.5`) + 픽셀 + 출처(커밋 해시 · plan/quick 이름 · Phase 31 이전 여부) + 근거 한 줄(판정표 「근거」 열 요지). 판정표 3 · 4 는 `vi-settings-rows.tsx` VI 시작/중지 다이얼로그와 같은 값이라는 점을, 판정표 5 는 치수 표의 「상단 줄 카드 — 패딩 16/10」 과 같은 값이라는 점을 반드시 적는다. 마지막에 하위 항목 하나 더: 「`device-settings-card.tsx` 「이 기기」 캡션 위 여백 2px → 4px(`pt-1`)로 정리 — Phase 32 신규 · 공용 아님 · 차이 2px」. 판정표 9(서버키 칩 6px)는 Task 2 가 이미 문구를 갱신했으므로 손대지 않는다. 줄 번호는 문서에 적지 않는다(드리프트) — 파일 · 요소 · 슬롯 이름으로 가리킨다.

커밋: `style(quick-261016-udz): 「이 기기」 캡션 위 여백 4배수 · 32-UI-SPEC 간격 예외 근거 명시 (UI 리뷰 ③)`. 경로 지정 `git add` 두 파일 · `git status -sb` 확인 · 한글 · Co-Authored-By 없음 · push 금지.
  </action>
  <verify>
    <automated>grep -q 'px-1 pt-1 pb-2 text-\[12.5px\]' webapp/src/components/me/device-settings-card.tsx && pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/device-settings-card.test.tsx --maxWorkers=2 && node -e 'const L=require("fs").readFileSync(".planning/phases/32-account-axis/32-UI-SPEC.md","utf8").split("\n");const a=L.findIndex(l=>l.startsWith("Exceptions ("));const b=L.findIndex((l,i)=>i>a&&l==="---");const R=a<0||b<0?"":L.slice(a,b).join("\n");const miss=["quick-261016-udz","alert-toasts","strategy-status-card","vi-settings-rows","workbench-status-bar","device-settings-card","px-[9px]","-my-0.5","px-[5px]","py-2.5","gap-1.5","gap-2.5","px-2.5","16/10"].filter(k=>!R.includes(k));if(a<0||b<0||miss.length){console.error("Exceptions missing: "+miss.join(","));process.exit(1)}console.log("ok")'</automated>
  </verify>
  <done>device-settings-card 캡션 = `pt-1`(4배수) · device-settings-card 테스트 통과. UI-SPEC Spacing Exceptions 목록 안에 판정표 1~7 이 파일 · 값 · 출처 · 근거와 함께 선언되고 device 캡션 정리 사실이 기록됨. alert-toasts · strategy-status-card · workbench-status-bar 코드 무변경. style 커밋 1개.</done>
</task>

</tasks>

<verification>
- 바뀐 파일 관련 단위 테스트만, 메모리 보호용 워커 2개: `pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/account-chips.test.tsx src/components/me/__tests__/device-settings-card.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/me-client.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` 전부 통과.
- `pnpm --filter @gh-radar/webapp run typecheck` 통과.
- Task 2 · Task 3 의 node 문서 검사 둘 다 「ok」.
- `git diff --stat 1fdb78cf..HEAD` 의 코드 파일이 account-chips.tsx · account-chips.test.tsx · device-settings-card.tsx 3개뿐이고(문서는 32-UI-SPEC.md 1개), alert-toasts.tsx · strategy-status-card.tsx · workbench-status-bar.tsx · setting-group.tsx · 32-UI-REVIEW.md 는 diff 에 없다.
- E2E · 전체 회귀는 돌리지 않는다(사용자 지시 · 동시 세션 메모리). 배포 · push 없음.
</verification>

<success_criteria>
- 계좌 칩(/me · 작업대 공용)이 WAI-ARIA radio group 처럼 화살표 · Home/End 로 선택되고, 잠금이면 선택이 바뀌지 않는다(IN-02 해소).
- 32-UI-SPEC 이 작업대 상단 줄 = 계좌 칩(32-15)을 사실대로 말하고, 옛 셀렉트 기술이 남은 줄은 모두 무효 표시돼 다음 phase 가 오판하지 않는다.
- UI-REVIEW 지목 간격 9곳이 수정(1) · 예외 선언(7) · 기존 예외 문구 갱신(1)으로 전부 닫히고, 위치별 판정이 이 PLAN 표와 UI-SPEC 에 남는다.
- 커밋 4개(test · fix · docs · style) · 한글 메시지 · Co-Authored-By 없음 · push 없음.
</success_criteria>

<output>
Create `.planning/quick/261016-udz-phase-32-ui-top-3-ui-spec-4/261016-udz-SUMMARY.md` when done — 판정표 결과(수정 1 · 예외 7 · 문구 갱신 1), 커밋 해시 4개, 테스트 수(account-chips 전후), 범위 밖으로 남긴 UI-REVIEW 항목(색 토큰 · 끄기/비활성화 문구 · 잠금 칩 disabled · IN-04 · IN-05 · ROADMAP 32-15 기록)을 적는다.
</output>
