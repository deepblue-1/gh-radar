---
phase: quick-261121-gdx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/styles/globals.css
  - webapp/src/styles/__tests__/tds-tokens.test.ts
  - webapp/src/components/admin/admin-sheet.tsx
  - webapp/src/components/admin/__tests__/admin-sheet.test.tsx
  - webapp/src/components/settlement/account-table.tsx
  - webapp/src/components/settlement/open-pools-card.tsx
  - webapp/src/components/settlement/reflect-box.tsx
  - webapp/src/components/settlement/settle-sheet.tsx
  - webapp/src/components/settlement/ledger-row.tsx
  - webapp/src/components/settlement/ledger-sheet.tsx
  - webapp/src/components/settlement/settle-confirm.tsx
  - webapp/src/components/settlement/transfer-card.tsx
  - webapp/src/components/settlement/name-vs-card.tsx
  - webapp/src/components/settlement/__tests__/reflect-box.test.tsx
  - webapp/src/components/settlement/__tests__/activity-card.test.tsx
  - webapp/src/components/settlement/__tests__/settle-confirm.test.tsx
  - webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx
  - webapp/src/components/settlement/__tests__/settle-sheet.test.tsx
  - webapp/e2e/specs/admin-settlement.spec.ts
  - .planning/phases/44-admin-settlement/44-UI-SPEC.md
  - .planning/phases/44-admin-settlement/44-UI-REVIEW.md
autonomous: true
requirements:
  - 44-UI-REVIEW-01
  - 44-UI-REVIEW-02
  - 44-UI-REVIEW-03
  - 44-UI-REVIEW-04
  - 44-UI-REVIEW-05
  - 44-UI-REVIEW-06
  - 44-UI-REVIEW-07
  - 44-UI-REVIEW-08
  - 44-UI-REVIEW-09
  - 44-UI-REVIEW-10

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "라이트 테마 정산 화면의 경고 글자(미설정 · 못 읽음 · 서버 간 다름 · 예수금 미설정 · 장중 줄 · 반영 상자 경고 · 「현중 → 근형」 꼬리표)가 흰 카드 · --muted 상자 · 꼬리표 틴트 위에서 4.5 : 1 이상이다"
    - "다크 테마 정산 경고 글자 색은 지금과 같다(#ffb13d)"
    - "「바로 출금」 켜짐 알약의 흰 글자가 라이트 · 다크 모두 면 위 4.5 : 1 이상이다"
    - "정산 취소 확인 창 하단 구분선이 --border-subtle hairline 이다(다크에서 순백 아님)"
    - "「이체 내역 보기」 · 펼침 줄 작은 버튼 · 시트 알약을 중심에서 위아래 21px 지점을 눌러도 그 버튼이 눌린다(보이는 모양은 그대로)"
    - "금액 칸에 8자리 이상을 넣으면 값은 바뀌지 않고 칸 오류 줄에 상한 안내가 뜬다"
    - "거래 기록 · 정산하기 시트가 열릴 때 첫 포커스가 머리 × 버튼이 아니라 시트 컨테이너다(화면 안 밀림)"
    - "전역 --led-latent · ADMIN_TONE_CLASS · ui/dialog.tsx · 정산 밖 AdminSheet 사용처 동작은 바뀌지 않는다"
  artifacts:
    - path: "webapp/src/styles/globals.css"
      provides: "정산 전용 토큰 --settle-warn-fg · --settle-on-bg (첫 :root · .dark 둘 다)"
      contains: "--settle-warn-fg"
    - path: "webapp/src/styles/__tests__/tds-tokens.test.ts"
      provides: "정산 토큰 대비 회귀 게이트"
      contains: "settle-warn-fg"
    - path: "webapp/src/components/admin/admin-sheet.tsx"
      provides: "선택형 onOpenAutoFocus prop(없으면 종전 Radix 기본)"
      contains: "onOpenAutoFocus"
    - path: "webapp/src/components/settlement/ledger-row.tsx"
      provides: "SETTLE_HIT_44 히트 확장 상수 · ACTIVITY_SMALL_BUTTON 적용"
      contains: "SETTLE_HIT_44"
    - path: "webapp/e2e/specs/admin-settlement.spec.ts"
      provides: "P44-F4 첫 포커스 · 금액 상한 안내 · 히트 44 실브라우저 단언"
      contains: "P44-F4"
  key_links:
    - from: "webapp/src/components/settlement/*.tsx"
      to: "webapp/src/styles/globals.css"
      via: "text-[var(--settle-warn-fg)] · bg-[var(--settle-on-bg)]"
      pattern: "--settle-(warn-fg|on-bg)"
    - from: "webapp/src/components/settlement/ledger-sheet.tsx · settle-sheet.tsx"
      to: "webapp/src/components/admin/admin-sheet.tsx"
      via: "onOpenAutoFocus → SheetContent(컨테이너 focus preventScroll)"
      pattern: "onOpenAutoFocus"
    - from: "webapp/src/components/settlement/settle-row.tsx"
      to: "webapp/src/components/settlement/ledger-row.tsx"
      via: "ACTIVITY_SMALL_BUTTON(정산 취소 버튼이 같은 상수라 히트 확장을 함께 받는다)"
      pattern: "ACTIVITY_SMALL_BUTTON"
---

<objective>
Phase 44 UI 리뷰(`.planning/phases/44-admin-settlement/44-UI-REVIEW.md` 「우선 수정」 1 ~ 10)를 **정산 화면 안에서만** 처리한다.

사용자 결정(2026-11-21): 대비 문제는 정산 화면만 진하게 — 전역 `--led-latent` · 트레이더 화면 · 계좌 메뉴(Phase 36) · `components/admin/reflect-chip.tsx` · `components/ui/dialog.tsx` 는 건드리지 않는다. ② 사람 카드 큰 숫자는 `totalKrw` 유지(44-13-SUMMARY key-decisions) — 코드 무변경, 문서 · e2e 주석만 정정.

Purpose: 라이트 경고 글자 2.05 : 1 · 「바로 출금」 3.7 : 1 의 정보 손실, 폰 터치 대상 18 · 32px, 시트 첫 포커스 × 버튼, 금액 8자리 조용한 버림을 없앤다.
Output: 정산 전용 토큰 2개 + 컴포넌트 클래스 교체 · 히트 확장 상수 · AdminSheet 선택형 prop · 금액 상한 안내 · 계약 간격 2곳 · 문서 정정 · 단위 / 토큰 / e2e 테스트.

범위 상한(사용자): webapp 만 — server · shared · DB · relay 변경 없음, 새 의존성 없음. 트레이서 형태는 쓰지 않는다(이미 운영 중인 화면의 스타일 · 상호작용 보정 — 증명할 새 구조 없음).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/44-admin-settlement/44-UI-REVIEW.md
@.planning/phases/44-admin-settlement/44-UI-SPEC.md

## 이미 확인한 사실(실행자가 다시 조사할 필요 없음)

- 정산에서 `--led-latent` 를 **글자색**으로 쓰는 곳은 정확히 5곳: `account-table.tsx` 27행 `WARN_LINE` · 87행 「미설정」 칸, `open-pools-card.tsx` 153행, `reflect-box.tsx` 89행 `WARN`, `settle-sheet.tsx` 283행 장중 줄. 그리고 `ledger-row.tsx` 210행 「현중 → 근형」 꼬리표가 공용 `ADMIN_TONE_CLASS.warn`(reflect-chip.tsx · 면 18% 틴트 + 글자)을 쓴다. 정산 컴포넌트는 `src/app/admin/settlement/page.tsx` 밖에서 import 되지 않는다(정산 전용).
- 이 글자색을 단언하는 기존 테스트: `__tests__/reflect-box.test.tsx` 136 · 144 · 179행, `__tests__/activity-card.test.tsx` 224행 — 지금 초록, 클래스를 바꾸면 빨강이 되므로 같은 태스크에서 기대값을 고친다.
- `ui/dialog.tsx` 113행 `DialogFooter` 의 `border-t` 는 색이 없다. globals.css 에 base 테두리색 규칙이 없어(Tailwind v4 기본 = currentColor) 다크는 #ffffff, 라이트는 `--popover-fg` #191f28 로 그려진다.
- `tds-tokens.test.ts` 의 `parseBlock` 은 **첫** `\n:root {`(50행) 와 `.dark {`(257행) 만 읽는다 — 819행 두 번째 `:root` 에 토큰을 두면 테스트가 못 본다. 이미 `contrast()`(256행) · `resolve()`(270행) 와 Phase 41 대비 describe(281행) 선례가 있다. `THEME_COLOR_TOKENS`(131행) 은 두 테마 모두 정의를 강제한다.
- 전역 `*:focus-visible`(globals.css 598행)는 레이어 밖이라 Tailwind 유틸(`focus-visible:outline-none` 등 · `@layer utilities`)보다 항상 이긴다. `[data-focus-ring="seamless"]`(607행)는 CSS 변수라 **자손에게 상속**된다.
- `AdminSheet`(admin-sheet.tsx)는 `onOpenAutoFocus` 를 받지 않는다. 쓰는 곳: 정산 2(ledger-sheet · settle-sheet) + user-sheet · server-sheet · user-create-sheet · account-master-sheet. 컨테이너 포커스 선례: `layout/app-shell.tsx` 128행 · `ticks/candle-ma-form.tsx` 348행 · 이 phase 의 `settle-confirm.tsx` 133행.
- 히트 확장 선례: `reflect-box.tsx` 109행 스위치 `relative … after:absolute after:-inset-x-[2px] after:-inset-y-[10px] after:content-['']`. 대상 버튼 · 알약에는 기존 `after:` · `before:` 가 없고 `ui/button.tsx` 에 `overflow-hidden` 도 없다.
- 금액 칸: `ledger-sheet.tsx` 255 ~ 260행 `onAmount` 가 7자리를 넘으면 `return` 만 한다(제어 입력이라 직전 값으로 되돌아감 → 빈 칸에 8자리 붙여넣기 = 빈 칸 유지 · 안내 없음). 기존 테스트 `ledger-sheet.test.tsx` 258행이 「8자리째 무시」 값만 잠근다.
- e2e 고정 응답의 기본 거래 9줄은 모두 `settleId: null`(고치기 · 지우기 버튼이 보이는 줄). AdminSheet 닫기 버튼은 `data-slot="sheet-close"`, 거래 줄 버튼은 `data-slot="settlement-ledger-row"`.

## 대비 계산표(WCAG 상대 휘도 · 실행자는 이 값을 그대로 쓴다)

| 토큰 | 테마 | 값 | 확인한 대비 |
|---|---|---|---|
| `--settle-warn-fg` | 라이트 | `#9c4f00`(색상각 30° · 주황 유지 · 파괴 빨강과 구분) | 흰 카드 #ffffff 5.95 · `--muted` #f2f4f6 5.39 · 꼬리표 틴트(#ff9f1a 18% on #ffffff = #ffeed6) 5.22 · 꼬리표 틴트 on `--muted`(#f4e5ce · 펼친 / hover 줄의 보수적 상한) 4.80 |
| `--settle-warn-fg` | 다크 | `#ffb13d`(= 다크 `--led-latent` · 무변경) | 다크 카드 #151515 10.09 · 다크 `--muted` #2d2d2d 7.61 · 틴트 #3f311c 6.96 · 틴트 #534530 5.13 |
| `--settle-on-bg` | 라이트 | `#1b64da` | 흰 글자 5.41 · 면 대 `--muted` 상자 #f2f4f6 4.91 |
| `--settle-on-bg` | 다크 | `#1a71eb`(`--primary` 와 같은 색상각 215°) | 흰 글자 4.56 · 면 대 다크 `--muted` 상자 #2d2d2d 3.02(비텍스트 3 : 1) · 대 #151515 4.00 |

참고(현재 값): 라이트 `--led-latent` #ff9f1a 흰 위 2.05 · `--muted` 위 1.86 · 틴트 위 1.80, `--primary` 흰 글자 라이트 #3182f6 3.71 · 다크 #3485fa 3.57(다크도 미달이라 두 테마 모두 바꾼다). 후보 #c2410c 는 틴트 on muted 4.18 로 탈락, #2272eb 는 흰 글자 4.49 로 탈락.
</context>

<tasks>

<task type="auto">
  <name>Task 1: 색 · 대비 — 정산 전용 경고 글자 토큰 · 「바로 출금」 켜짐 면 · 확인 창 하단선 (리뷰 2 · 3 · 4)</name>
  <files>webapp/src/styles/globals.css, webapp/src/styles/__tests__/tds-tokens.test.ts, webapp/src/components/settlement/account-table.tsx, webapp/src/components/settlement/open-pools-card.tsx, webapp/src/components/settlement/reflect-box.tsx, webapp/src/components/settlement/settle-sheet.tsx, webapp/src/components/settlement/ledger-row.tsx, webapp/src/components/settlement/settle-confirm.tsx, webapp/src/components/settlement/__tests__/reflect-box.test.tsx, webapp/src/components/settlement/__tests__/activity-card.test.tsx, webapp/src/components/settlement/__tests__/settle-confirm.test.tsx</files>
  <read_first>webapp/src/styles/globals.css 86 ~ 96행 · 292 ~ 300행 · 345 ~ 363행(person 토큰 블록 · 다크 literal 관례 주석), webapp/src/styles/__tests__/tds-tokens.test.ts 17 ~ 34행 · 128 ~ 145행 · 256 ~ 289행, webapp/src/components/admin/reflect-chip.tsx 24 ~ 33행(읽기만 — 고치지 않는다)</read_first>
  <action>
A. 토큰(사용자 결정 2026-11-21 「정산 화면만 진하게」): `webapp/src/styles/globals.css` 의 **첫** `:root {` 블록에서 `--person-j` 줄(94행) 바로 뒤, 그리고 `.dark {` 블록의 `--person-j` 줄(299행) 바로 뒤에 같은 이름의 토큰 두 개를 둔다. 값은 위 「대비 계산표」 그대로: `--settle-warn-fg` 라이트 `#9c4f00` · 다크 `#ffb13d`, `--settle-on-bg` 라이트 `#1b64da` · 다크 `#1a71eb`. 다크도 `var(...)` 가 아니라 literal(345 ~ 352행 다크 토큰 관례). 두 블록 모두 한국어 주석: 「Phase 44 정산 화면 전용(quick 261121-gdx · 44-UI-REVIEW 2 · 3) — 경고 글자 / 「바로 출금」 켜짐 면. 전역 `--led-latent`(상따 LED 축) · `--primary` 를 바꾸지 않으려고 정산만 따로 둔다(사용자 결정 2026-11-21). 다른 화면에서 재사용하지 마라」 + 라이트 대비 수치 한 줄 · 다크는 「`--led-latent` 다크 값과 같게 유지(tds-tokens.test 가 동치 고정)」.

B. 토큰 테스트 `webapp/src/styles/__tests__/tds-tokens.test.ts`: `THEME_COLOR_TOKENS` 끝에 `'settle-warn-fg', 'settle-on-bg'` 추가. 파일 끝에 describe 「정산 화면 대비 (quick 261121-gdx · 44-UI-REVIEW 2 · 3)」 추가 — 작은 도우미 `mixHex(fg, bg, alpha)`(채널별 `Math.round(alpha*fg + (1-alpha)*bg)` → `#rrggbb`)를 두고, 라이트 · 다크 `it.each` 로 (1) `settle-warn-fg` 대 `card` · `muted` 각각 ≥ 4.5, (2) `settle-warn-fg` 대 `mixHex(led-latent, card, 0.18)` · `mixHex(led-latent, muted, 0.18)` 각각 ≥ 4.5(꼬리표 틴트 — 면은 계속 `--led-latent` 18%), (3) `primary-fg` 대 `settle-on-bg` ≥ 4.5, (4) `settle-on-bg` 대 `muted` ≥ 3(알약이 서는 나누기 상자 면 · 비텍스트). 별도 it 로 「다크 `--settle-warn-fg` 는 다크 `--led-latent` 와 같은 값(다크 무변경)」. 값은 모두 기존 `resolve()` 로 푼다.

C. 컴포넌트 클래스 교체(정산 디렉터리만):
- `account-table.tsx` `WARN_LINE`(27행)과 「미설정」 칸 삼항(87행), `open-pools-card.tsx` 153행 「예수금이 설정되지 않은 계좌가 있어요」, `reflect-box.tsx` `WARN`(89행), `settle-sheet.tsx` 283행 장중 줄 — 이 다섯 자리의 `--led-latent` 글자색 클래스를 `text-[var(--settle-warn-fg)]` 로 바꾼다. 주석에도 옛 클래스 문자열을 그대로 적지 않는다(검증 grep 이 셈한다).
- `ledger-row.tsx` 210행 「현중 → 근형」 꼬리표: `className={cn(ADMIN_TONE_CLASS.warn, "text-[var(--settle-warn-fg)]")}` — 면 틴트는 공용 그대로 두고 글자색만 덮는다(tailwind-merge 가 `text-[var(...)]` 를 글자색 그룹으로 보아 뒤 클래스가 이긴다 — 크기는 이 코드베이스가 `text-[length:…]` 로 구분). `reflect-chip.tsx` 는 고치지 않는다(어드민 공용 · 계좌 메뉴).
- `settle-sheet.tsx` 327행 「바로 출금」 켜짐: 면 · 테두리를 `--settle-on-bg` 로(`border-[var(--settle-on-bg)] bg-[var(--settle-on-bg)] text-[var(--primary-fg)]`). 글자 12/600 은 그대로 — 리뷰 3의 두 선택지 중 「면을 진하게」(사용자 지시). 꺼짐 상태 · 스위치(`--primary`)는 그대로.
- `settle-confirm.tsx` 166행 `DialogFooter` 의 `className="flex-row"` 에 `border-[var(--border-subtle)]` 를 더한다. 테마 접두 없이 무조건 — 리뷰 4 수정안 원문 그대로이고, 라이트도 지금 currentColor(#191f28) 진한 선이라 계약 hairline(UI-SPEC 「줄 사이 hairline = `--border-subtle`」)과 어긋난다(손보는 표면 안 시각 결함 → 고치고 SUMMARY 한 줄). `ui/dialog.tsx` 는 고치지 않는다.

D. 테스트 기대값: `reflect-box.test.tsx` 136 · 144 · 179행과 `activity-card.test.tsx` 224행의 글자색 기대를 `text-[var(--settle-warn-fg)]` 로 바꾸고, activity-card 쪽은 꼬리표 className 에 `var(--led-latent)_18%`(틴트 유지)가 있고 옛 글자색 클래스는 없음을 함께 단언한다. `settle-confirm.test.tsx` 에 「하단 `[data-slot="dialog-footer"]` className 에 `border-[var(--border-subtle)]`」 it 하나 추가(기존 열기 도우미 재사용).

E. 커밋(경로 지정 · `git add -A` 금지 · 직전에 `git status -sb` 로 남의 변경이 섞이지 않았는지 확인 · `.planning/ui-reviews/` 는 추적하지 않음): 위 `<files>` 11개만 `git add` 후 `fix(quick-261121-gdx): 정산 경고 글자 · 바로 출금 알약 대비 4.5 : 1 이상 · 확인 창 하단선 hairline`. Co-Authored-By 넣지 않음 · push 하지 않음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && test "$(grep -rF 'text-[var(--led-latent)]' webapp/src/components/settlement --include='*.tsx' | grep -v __tests__ | wc -l | tr -d ' ')" = 0 && test "$(grep -cE '^[[:space:]]*--settle-(warn-fg|on-bg):[[:space:]]*#[0-9a-f]{6};' webapp/src/styles/globals.css)" -ge 4</automated>
  </verify>
  <done>마지막 두 게이트의 HEAD 기준값은 5 와 0(둘 다 지금은 실패 — 게이트가 실제 변화를 잰다). 정산 vitest · tds-tokens(새 대비 describe 포함) · typecheck 통과. 정산 디렉터리 소스에 옛 경고 글자색 클래스 0줄, globals.css 에 새 토큰 정의 4줄(라이트 2 · 다크 2). reflect-chip.tsx · ui/dialog.tsx · 전역 `--led-latent` 값 diff 없음.</done>
</task>

<task type="auto">
  <name>Task 2: 상호작용 — 시트 첫 포커스 · 금액 상한 안내 · 터치 히트 44 · 계약 간격 (리뷰 5 · 6 · 7 · 8 · 10)</name>
  <files>webapp/src/components/admin/admin-sheet.tsx, webapp/src/components/admin/__tests__/admin-sheet.test.tsx, webapp/src/components/settlement/ledger-row.tsx, webapp/src/components/settlement/ledger-sheet.tsx, webapp/src/components/settlement/settle-sheet.tsx, webapp/src/components/settlement/transfer-card.tsx, webapp/src/components/settlement/name-vs-card.tsx, webapp/src/components/settlement/open-pools-card.tsx, webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx, webapp/src/components/settlement/__tests__/settle-sheet.test.tsx</files>
  <read_first>webapp/src/components/admin/admin-sheet.tsx 전체(162행), webapp/src/components/layout/app-shell.tsx 115 ~ 132행, webapp/src/components/settlement/reflect-box.tsx 100 ~ 112행, webapp/src/components/settlement/ledger-sheet.tsx 36 ~ 95행 · 250 ~ 262행 · 404 ~ 435행 · 544 ~ 575행, webapp/src/components/admin/__tests__/admin-sheet.test.tsx 1 ~ 60행</read_first>
  <behavior>
    - admin-sheet: `onOpenAutoFocus` 를 주면 열릴 때 1회 불린다 / 주지 않으면 종전대로 닫기(×) 버튼(`[data-slot="sheet-close"]`)에 포커스.
    - ledger-sheet · settle-sheet: 열면 `document.activeElement` 가 `[data-admin-sheet]` 요소이고 닫기 버튼이 아니다(waitFor).
    - ledger-sheet 금액: 「1,234,567」 에서 「1,234,5678」 입력 → 값 「1,234,567」 그대로 · `[data-slot="ledger-error-amount"]` = 「금액은 만원 단위로 9,999,999만원까지 적을 수 있어요」 · 금액 칸 `aria-invalid="true"` → 이어서 「12,345」 입력하면 안내 사라짐 → 기존 저장 바디 단언 그대로 통과.
    - ledger-sheet 금액: 빈 칸에 「99999999」 → 값 「」 · 안내 = 위 상한 문구(「금액을 넣어 주세요」 아님).
  </behavior>
  <action>
A. 첫 포커스(리뷰 7 · 프로젝트 규칙 「시트 자동 포커스는 컨테이너로 preventScroll」): `admin-sheet.tsx` `AdminSheetProps` 에 선택형 `onOpenAutoFocus?: (event: Event) => void`(JSDoc: 「열릴 때 첫 포커스 — 주지 않으면 Radix 기본(머리 닫기 버튼). 정산 시트는 컨테이너로 돌린다」)를 더하고 `SheetContent` 에 그대로 넘긴다. undefined 면 Radix 기본이라 user-sheet · server-sheet · user-create-sheet · account-master-sheet 는 그대로다. 파일 머리 주석에 한 줄. `ledger-sheet.tsx` · `settle-sheet.tsx` 의 `AdminSheet` 에 핸들러를 준다 — `e.preventDefault()` 뒤 `(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })`(app-shell 128행 · candle-ma-form 348행과 같은 꼴 · Radix 콘텐츠는 tabIndex -1). 시트 컨테이너에 `data-focus-ring="seamless"` 를 달지 않는다(변수가 자손에 상속돼 시트 안 모든 키보드 링이 꺼진다). `focus-visible:outline-none` 류 유틸도 달지 않는다(레이어 밖 전역 규칙에 져서 효과 없음 — 마우스로 열면 링 없음 · 터치는 전역 규칙이 끔 · 키보드로 열 때 시트 둘레 링은 settle-confirm 선례대로 둔다). `settle-sheet.tsx` 51행의 「AdminSheet 가 onOpenAutoFocus 를 받지 않아 …」 낡은 주석을 새 동작으로 고치고, `ledger-sheet.tsx` 머리 주석에도 첫 포커스 한 줄.

B. 금액 상한 안내(리뷰 6): `LEDGER_SHEET_TEXT` 에 `amountMax: "금액은 만원 단위로 9,999,999만원까지 적을 수 있어요"`(UI-SPEC 칸 오류 톤 — 「미래 날짜는 적을 수 없어요」 · 「금액은 만원 미만을 버리고 적어요」 와 같은 결). `onAmount` 에서 숫자가 `AMOUNT_MAX_DIGITS` 를 넘으면 값은 바꾸지 않고(앞 7자리로 잘라 넣지 않는다 — 원 단위 금액 59,500,000 을 만원 칸에 붙여넣으면 5,950,000만원 = 595억이 되는 오입력을 조용히 만든다) `setErrors((e) => ({ ...e, amount: T.amountMax }))` 만 한다. 범위 안 입력이 오면 기존 `amount: null` 이 안내를 지운다. 안내는 기존 칸 오류 줄(`ledger-error-amount` · `role="alert"` · `aria-invalid` · `aria-describedby`)을 그대로 쓴다(사용자 지시 「칸 오류 줄」). `validate()` 는 바꾸지 않는다. 머리 주석 43행 금액 설명에 「넘치면 값은 그대로 · 칸 오류 줄에 상한 안내」 추가. 테스트: `ledger-sheet.test.tsx` 19행 표의 「무시」 와 258행 테스트 제목을 「값 그대로 · 상한 안내」 로 고치고 behavior 의 두 경우를 단언(258행 흐름에 이어 붙이고, 빈 칸 붙여넣기는 새 it).

C. 터치 히트 44(리뷰 5 · 8 — 보이는 모양 무변경): `ledger-row.tsx` 의 `ACTIVITY_*` 상수 옆에 `export const SETTLE_HIT_44 = "relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"` 와 주석(「보이는 크기는 그대로 두고 누르는 영역만 세로 44 — 위아래로 넘친 부분은 투명 의사 요소 · reflect-box 스위치 `after:` 히트 선례 · 높이가 18 이든 32 든 가운데 기준 44」). 적용: (1) `ACTIVITY_SMALL_BUTTON` 의 `cn(...)` 에 추가 → 「고치기」 · 「지우기」 · 정산 줄 「정산 취소」(settle-row 가 같은 상수) 모두, (2) `ledger-sheet.tsx` `PillGroup` 알약 className(562행), (3) `settle-sheet.tsx` `PoolPills` 알약(427행)과 「바로 출금」 알약(324행), (4) `transfer-card.tsx` 53행 「이체 내역 보기」 버튼. 각 파일은 `./ledger-row` 에서 import(순환 없음 — ledger-row 는 시트 · transfer-card 를 import 하지 않는다). 알려진 결과: 줄바꿈된 알약 줄 사이 틈 8px 안에서 위아래 히트가 4px 겹친다(뒤 DOM 이 이김 · 보이는 알약 면은 가리지 않음) — SUMMARY 에 적는다. 나누기 줄(`py-2`) · 단추 줄(`pt-2 pb-3`) 안에서는 넘침이 줄 안에 머문다.

D. 계약 간격(리뷰 10): `name-vs-card.tsx` `ZeroAmount` 의 `mt-0.5` → `mt-1`(xs 4px). 근거: 목업 `.zero b` 는 margin-top 2 + 행간 1.5 로 보이는 틈 약 9.75px, 우리는 앞 줄 14/1.5 · 금액 18/1.2 행간만으로 약 5.3px 이라 4 를 더한 9.3 이 가장 가깝다. `open-pools-card.tsx` 124행 묶음 이름 · 비율 사이 `gap-1.5` → `gap-2`(sm 8px). 근거: 목업은 `<b>` 뒤 공백 한 칸(약 4) + `margin-left:4px` = 약 8 이고 JSX 에는 공백이 없다. 두 클래스를 단언하는 테스트는 없다.

E. 커밋(경로 지정 · 직전 `git status -sb` 확인): 위 `<files>` 10개만 `git add` 후 `fix(quick-261121-gdx): 정산 시트 첫 포커스 컨테이너 · 금액 상한 안내 · 터치 히트 44 · 계약 간격`. Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement src/components/admin/__tests__/admin-sheet.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && test "$(grep -l 'SETTLE_HIT_44' webapp/src/components/settlement/ledger-row.tsx webapp/src/components/settlement/ledger-sheet.tsx webapp/src/components/settlement/settle-sheet.tsx webapp/src/components/settlement/transfer-card.tsx | wc -l | tr -d ' ')" = 4</automated>
  </verify>
  <done>마지막 게이트 HEAD 기준값 0(지금 실패). 정산 vitest · admin-sheet 테스트 · typecheck 통과, behavior 4항목이 테스트로 잠김. 정산 밖 AdminSheet 사용처 4곳 파일 diff 없음. name-vs-card · open-pools-card 의 6px · 2px 간격 0곳.</done>
</task>

<task type="auto">
  <name>Task 3: 문서 정정(리뷰 1) · 리뷰 9 처분 기록 · e2e 실브라우저 단언 · 최종 e2e</name>
  <files>.planning/phases/44-admin-settlement/44-UI-SPEC.md, .planning/phases/44-admin-settlement/44-UI-REVIEW.md, webapp/e2e/specs/admin-settlement.spec.ts</files>
  <read_first>.planning/phases/44-admin-settlement/44-UI-SPEC.md 216 ~ 230행 · 330 ~ 335행, .planning/phases/44-admin-settlement/44-13-SUMMARY.md 25 ~ 35행, webapp/e2e/specs/admin-settlement.spec.ts 전체(253행)</read_first>
  <action>
A. ② 큰 숫자 결정 반영(리뷰 1 · 코드 무변경 · 사용자 답 2026-11-21 · 44-13-SUMMARY key-decisions): `44-UI-SPEC.md` 222행 「큰 숫자」 줄의 문구 칸을 「「5억 2,450만」 + 「원」(14/400 `--muted-fg`) · 계산 불가 「—」(+ 「원」 그대로) — 값은 `personSummary().totalKrw`(정산한 수익 중 남겨 둔 돈 + 정산 전 수익 중 내 몫 · 검산 5억 2,450만 · 5억 2,450만 · 0). 「지금 몫 전체」(`stakeKrw` · 9억 2,450만)는 합계 줄 값이다(사용자 결정 2026-11-21 · 44-13-SUMMARY)」 로 정정한다. 333행 시선 앵커 문장의 「「내 수익 몫」 큰 숫자(24/600)」 뒤에 「(값 = `totalKrw` — 사용자 결정 2026-11-21)」 를 붙인다. UI-SPEC 의 다른 줄(색 표 · 히트 · Accent 목록)은 이번 범위에서 고치지 않는다 — 차이는 SUMMARY 에 적는다.
   `webapp/e2e/specs/admin-settlement.spec.ts` 16행 머리 주석과 129행 줄 주석에 있는 44-06 미결 표시를 「totalKrw 유지 — 사용자 결정 2026-11-21 · 44-13-SUMMARY」 로 바꾼다. 값 잠금은 더하지 않는다(정정만 · 잘림 검사 그대로).
   `44-UI-REVIEW.md` 「우선 수정」 1번 머리 `[WARNING · 사용자 결정 필요]` 를 `[결정됨 2026-11-21 · totalKrw 유지]` 로 바꾸고 그 항목 끝에 한 문장 「사용자 답(44-13-SUMMARY key-decisions): 큰 숫자는 지금처럼 totalKrw — 코드는 그대로 두고 UI-SPEC ② 표 · 시선 앵커와 e2e 주석을 정정했다(quick 261121-gdx).」 2 ~ 10번은 손대지 않는다(오케스트레이터가 뒤에서 표시).

B. e2e 새 테스트 `P44-F4 390 — 시트 첫 포커스 · 금액 상한 안내 · 터치 히트 44`(describe 안 마지막): 뷰포트 390 × 844 · `page.clock.setFixedTime(new Date(SETTLEMENT_NOW))` · `mockSettlementApi` · `open`. 파일 위 도우미에 `hitsSelf(locator, dy)` 추가 — `locator.evaluate` 안에서 요소를 `scrollIntoView({ block: 'center' })` 한 뒤 rect 가운데에서 세로 `dy` 떨어진 점의 `document.elementFromPoint` 가 그 요소 자신이거나 그 안이면 true. 단언 순서: (1) ⑤ 카드 `[data-slot="settlement-transfer"]` 의 「이체 내역 보기」 버튼 — dy −21 · +21 모두 true. (2) 활동 카드 첫 `[data-slot="settlement-ledger-item"]` 의 `[data-slot="settlement-ledger-row"]` 를 눌러 펼친 뒤 「고치기」 버튼 — dy −21 · +21 true. (3) `openSheet(page, ledgerHead(page), '거래 기록')` 직후 `sheet` 가 포커스를 갖고(`toBeFocused`) `sheet.locator('[data-slot="sheet-close"]')` 는 포커스가 없다. (4) 「무슨 거래」 첫 알약 — dy −21 만 true(아래쪽은 줄바꿈된 다음 줄 히트와 겹칠 수 있어 재지 않는다). (5) `[data-slot="ledger-amount"]` 에 `fill('99999999')` → `toHaveValue('')` · `[data-slot="ledger-error-amount"]` 가 Task 2 상한 문구와 정확히 같다. HEAD 에서는 (1) 18px · (2)(4) 32px 라 ±21 이 바깥이고 (3) 이 닫기 버튼이므로 이 테스트는 수정 전 실패 · 수정 후 통과다.

C. 최종 e2e: 아래 verify 명령을 실행한다(이 파일만 · `--workers=1` — 동시 세션 메모리). `webServer` 시간 초과에 `NextFontGoogleFontFileReplacer` 가 반복되면 `rm -rf webapp/.next` 후 한 번만 다시 돈다. 운영 접속 없음(고정 응답).

D. SUMMARY(`.planning/quick/261121-gdx-phase-44-ui-review-fixes-settlement-only/261121-gdx-SUMMARY.md`)에 반드시 적을 것: 항목 1 ~ 10 처리 표(커밋 해시) · 대비 계산표 값 · 리뷰 9 미처리 사유(「넓은 카드 계좌 표 행 추적 — UI-SPEC ③ 계좌 표 `.at` 계약 · 채택 목업에 행 구분선 · hover 가 없는 설계 그대로 둔다. 사용자 결정 2026-11-21 계약 설계 유지 · 원하면 별도 quick」) · UI-SPEC 과 달라진 점(색 표 Warn 줄 라이트 값이 정산에서 `--settle-warn-fg`, Accent reserved 2번 「바로 출금」 켜짐 면이 `--settle-on-bg`, 터치 높이 줄의 알약 32 가 히트 44) · 확인 창 하단선은 라이트도 #191f28 → #e5e8eb 로 바뀜 · 금액 상한은 잘라 넣지 않고 값 유지(원 단위 붙여넣기 오입력 근거) · 알약 줄 사이 4px 히트 겹침 · 다크 「바로 출금」 면 #3485fa → #1a71eb(다크 흰 글자도 3.57 로 미달이었음) · 앞으로 어드민 계좌 메뉴(Phase 36 `WARN_LINE`)와 정산의 라이트 경고 글자색이 다르다(사용자가 정산만 선택).

E. 커밋(경로 지정 · 직전 `git status -sb`): 위 `<files>` 3개만 `git add` 후 `docs(quick-261121-gdx): ② 큰 숫자 totalKrw 결정 반영 · e2e 첫 포커스 · 상한 안내 · 히트 44 단언`. SUMMARY · STATE 커밋은 quick 워크플로 몫. Co-Authored-By 없음 · push 없음(push 는 곧 webapp 운영 배포 — 메인 세션이 정한다).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-settlement.spec.ts --workers=1 && pnpm --filter @gh-radar/webapp run typecheck && test "$(grep -c '사용자 결정 2026-11-21' webapp/e2e/specs/admin-settlement.spec.ts)" -ge 2 && grep -q 'totalKrw' .planning/phases/44-admin-settlement/44-UI-SPEC.md && grep -q '결정됨 2026-11-21' .planning/phases/44-admin-settlement/44-UI-REVIEW.md</automated>
  </verify>
  <done>admin-settlement.spec 전체(기존 P44-E1 · E2 × 4 · F1 · F2 · F3 + 새 F4) 통과. 마지막 세 grep 의 HEAD 기준값은 0 · 없음 · 없음(지금 실패). UI-SPEC ② 큰 숫자 줄 · 시선 앵커가 totalKrw 결정과 일치, UI-REVIEW 1번만 상태 정정, SUMMARY 에 리뷰 9 사유와 계약 차이 기록.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement src/styles/__tests__/tds-tokens.test.ts src/components/admin/__tests__/admin-sheet.test.tsx --maxWorkers=2` 초록.
- `pnpm --filter @gh-radar/webapp run typecheck` 초록(e2e tsconfig 포함).
- `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-settlement.spec.ts --workers=1` 초록.
- `git diff HEAD~3 --stat` 에 `webapp/src/components/ui/dialog.tsx` · `webapp/src/components/admin/reflect-chip.tsx` · server · shared · supabase · infra 가 없고, globals.css 의 `--led-latent` 두 줄 값이 그대로다.
- 전체 vitest · 전체 e2e 는 돌리지 않는다(동시 세션 메모리 규칙).
</verification>

<success_criteria>
- 우선 수정 2 · 3 · 4 · 5 · 6 · 7 · 8 · 10 이 코드로 해결되고 각각 단위 · 토큰 · e2e 중 하나 이상으로 잠김.
- 우선 수정 1 은 문서 · e2e 주석 정정으로 닫힘(코드 무변경), 9 는 사유와 함께 미처리 기록.
- 라이트 정산 경고 글자 최저 대비 4.80 : 1, 「바로 출금」 흰 글자 라이트 5.41 · 다크 4.56 : 1.
- 커밋 3개(한국어 · 경로 지정 · Co-Authored-By 없음 · push 없음).
</success_criteria>

<output>
Create `.planning/quick/261121-gdx-phase-44-ui-review-fixes-settlement-only/261121-gdx-SUMMARY.md` when done
</output>
