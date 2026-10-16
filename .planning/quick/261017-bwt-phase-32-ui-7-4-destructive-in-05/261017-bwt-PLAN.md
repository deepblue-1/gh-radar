---
phase: quick-261017-bwt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
  - webapp/e2e/specs/me.spec.ts
  - webapp/src/components/me/account-chips.tsx
  - webapp/src/components/me/__tests__/account-chips.test.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/workbench/alert-toasts.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/strategy-badge.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - .planning/phases/32-account-axis/32-UI-SPEC.md
autonomous: true
requirements: [BWT-spacing-4x, BWT-kill-tone, BWT-kill-copy, BWT-chip-lock-feedback, BWT-chip-no-contrast, BWT-in05-vi-scope]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "32-UI-REVIEW Pillar 5 가 지목한 7곳(판정표 #1~#7)이 모두 4배수 값이고, 공용 짝(VI 시작/중지 확인 다이얼로그 2곳 · ChoiceRow 항목 · 마이크로 배지 4곳)이 같은 새 값으로 따라가 갈라지지 않는다"
    - "작업대 상단 줄은 뷰포트 344 · 685 · 830 · 992 에서 지금처럼 넘침 0 · 계좌 칩 한 줄 · 페이지 가로 스크롤 0 이고(S1 백스톱), 토스트 계좌 줄은 두 줄 이내 · 「이 계좌 보기 ›」 잘림 0 이다(S4 백스톱)"
    - "「이 계좌 끄기」 카드 버튼과 다이얼로그 실행 버튼이 같은 옅은 면 톤(color-mix --destructive 10% · hover 18% · --destructive 글자)을 한 상수로 공유하고, 가격 방향 토큰을 쓰지 않으며, 채움(솔리드) 빨강이 없다(S-6)"
    - "/me 계좌 끄기 표면(kill 줄 · 확인 다이얼로그 · 오류 줄)에 「비활성화」 가 없다 — 제목 「이 계좌의 전략을 끌까요?」 · 전송 실패 「연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」 · 버튼 「이 계좌 끄기」(D-21 · D-27) 그대로"
    - "저장 비행 잠금 중 계좌 칩마다 aria-disabled=\"true\" + 그룹과 같은 잠금 title 이 있고, disabled 속성은 없으며 roving tabindex · 화살표=포커스만(잠금) · 풀리면 다시 고르기가 그대로다"
    - "선택 칩 번호(opacity .8 · --seg-on-fg on --seg-on-bg)는 라이트 8.67:1 · 다크 6.04:1 로 AA 4.5:1 통과 — 코드 무변경"
    - "작업대 VI 트리거 스트립은 카드 격자와 같은 게이트(scopeAccount)로 걸러진다 — 계좌 수신 · 전환 · 미수신 정상 경로의 칩 수는 전과 같다(IN-05)"
  artifacts:
    - path: "webapp/src/components/trading/strategy-status-card.tsx"
      provides: "KILL_BUTTON_TONE 공용 톤(카드 버튼 · 다이얼로그 실행 버튼) · 「끄기」 어휘 제목 · 전송 실패 문구"
      contains: "KILL_BUTTON_TONE"
    - path: "webapp/src/components/me/account-chips.tsx"
      provides: "잠금 시 칩마다 aria-disabled + 잠금 title"
      contains: "aria-disabled={locked"
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "scopedViOrders = scopeAccount 게이트(IN-05)"
      contains: "[activeViOrders, scopeAccount]"
    - path: ".planning/phases/32-account-axis/32-UI-SPEC.md"
      provides: "Spacing 예외 7곳 해소 표시 · 새 치수 행 · Color 끄기 톤 · Copywriting 끄기 어휘 · S13 칩 잠금 접근성"
      contains: "quick-261017-bwt"
  key_links:
    - from: "strategy-status-card.tsx KILL_BUTTON_TONE"
      to: "kill 줄 Button · DisableAccountDialog 실행 Button"
      via: "두 className 이 같은 상수를 쓴다 — tailwind-merge 가 Button 변형의 bg/fg/hover 를 덮는다(계획 시점 실측)"
      pattern: "KILL_BUTTON_TONE"
    - from: "MeAccountChips locked"
      to: "radiogroup + 칩 button 의 aria-disabled · title"
      via: "같은 locked · lockedTitle 을 그룹과 칩에 함께 내린다 — pick 가드(잠금 무시)는 그대로"
      pattern: "aria-disabled=\\{locked"
    - from: "trading-workbench.tsx scopeAccount"
      to: "visibleCards(inAccountScope) · scopedViOrders → VI 트리거 스트립 items"
      via: "카드 격자와 VI 스트립이 한 스코프 값을 쓴다(D-01)"
      pattern: "scopeAccount === \"\" \\? activeViOrders"
---

<objective>
Phase 32 UI 리뷰(32-UI-REVIEW.md) 잔여 항목 A~F 를 처리한다. 사용자 묶음과 태스크 대응: **Task 1 = ②(B 색 토큰 + C 끄기 문구)**, **Task 2 = ③(D 잠금 칩 피드백 + E 선택 칩 번호 대비 + F IN-05)**, **Task 3 = ①(A 간격 7곳 4배수)**.

순서 이유: ② 는 문구 상수 → 카드/다이얼로그 → 단위 테스트 → 실 브라우저 E2E(P32-disable) → UI-SPEC 까지 한 경로를 끝까지 꿰는 가장 얇은 수직 조각이라 tracer 로 먼저 세운다. ① 은 파일 수가 가장 많고(공용 짝 포함 9개) 마지막 E2E 백스톱(S1 · S4 · S13)이 ③ 의 칩 속성 변화까지 함께 덮으므로 끝에 둔다. 셋 다 strategy-status-card.tsx · 32-UI-SPEC.md 를 공유하므로 한 플랜 안에서 순차다.

Purpose: 간격 계약(4배수)과 코드를 실제로 일치시키고(예외 선언 해소), 계좌 끄기 표면이 상태 색(--destructive)과 한 어휘(「끄기」)만 쓰게 하며, 잠긴 칩이 왜 안 눌리는지 hover · 스크린리더가 알게 하고, D-01 「같은 스코프」 를 한 식으로 만든다.

Output: 코드 15파일(공용 짝 포함) + 32-UI-SPEC.md 갱신, 커밋 5개(test · fix · test · fix · style).

**범위 상한(강제):** IN-04(relay 「지움」 프레임 — relay 프로토콜 · 배포 순서) · IN-01 · IN-03 · Phase 32 밖 화면의 「비활성화」 문구(card-body · strategy-card · strategy-log 등) · relay 문구 · 색 토큰 값 변경(새 토큰 0 계약) · UI-REVIEW 미지목 간격(예: kill 줄 `gap-2.5` · 전략 행 `py-2.5`) · admin `PILL_CHIP` · stock-comovement 9px 칩 · 32-UI-REVIEW.md 자체 수정은 하지 않는다. 전체 E2E 금지 — 문구/간격을 단언하는 spec 만 골라 `--workers=1`. vitest 는 바뀐 파일 관련만 `--maxWorkers=2`. 배포 · push 없음(오케스트레이터 몫).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/32-account-axis/32-UI-REVIEW.md

# 직전 quick(간격 7곳을 예외로만 선언했던 판정표 · 출처 커밋)
@.planning/quick/261016-udz-phase-32-ui-top-3-ui-spec-4/261016-udz-SUMMARY.md

# 32-UI-SPEC.md 는 823줄 — 통째로 읽지 말고 각 Task 의 read_first 구간만 Read offset/limit 로 읽는다.
# trading-workbench.test.tsx 는 3143줄 — 지정 구간만 읽는다.

## 계획 시점 관측 (2026-10-17 · HEAD 274e0dcc · 작업 트리 깨끗)

- tailwind-merge 실측: Button 변형(`outline` = `bg-[var(--muted)] text-[var(--fg)] border-transparent hover:bg-[var(--raised-2)]`, `default` = `bg-[var(--primary)] …`) 뒤에 `bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-[var(--destructive)] hover:bg-[color-mix(…_18%…)]` 를 주면 변형의 bg · fg · hover 가 정확히 빠진다. 이 프로젝트의 `outline` 변형은 테두리 없는 muted 면이다(「닫기」).
- 「비활성화」 는 strategy-status-card.tsx 안에 117행(`DISABLE_SEND_FAILED_TEXT`) · 279행(`DialogTitle`) 두 곳뿐이다(주석 0). 테스트: strategy-status-card.test.tsx 547 · 641 · 766(`SEND_FAIL`) · 931(제목) · 940, E2E: me.spec.ts 687(제목). relay 거부 문구(`ACCOUNT_DISABLE_NOTHING_TEXT` 「이 계좌에 끌 전략이 없어요」 · `ACCOUNT_DISABLE_UNCONFIRMED_TEXT`)는 이미 끄기 어휘 → relay 무변경.
- 「이 계좌 끄기」 카드 버튼(634)은 가격 방향(상승) 면 토큰 + `--destructive` 글자 + hover `color-mix 18%`, 다이얼로그 실행 버튼(316-322)은 `outline` + `--destructive` 테두리 + 투명 + hover `color-mix 10%` — 두 형태가 다르다. 32-UI-SPEC 의 S5′ 는 카드 버튼 = 목업 ⑥ `.btn.danger`(옅은 빨강 면 · 빨강 글자 — 사용자 채택 목업)로 정했다 → **둘 다 옅은 면으로 통일**한다(채움=솔리드만 금지라는 S-6 취지와 맞고, 채택 목업을 바꾸지 않는다).
- 계좌 칩(account-chips.tsx 113-173): 그룹에만 `aria-disabled` · `title`, 칩 button 은 `tabIndex` roving · `pick` 가드가 잠금을 무시. 소비처 `me-client.tsx` 가 `lockedTitle` 「저장 중에는 계좌를 바꿀 수 없어요」 를 넘긴다(작업대 AccountPill 은 잠금 없음).
- IN-05: `trading-workbench.tsx` 658 `scopeAccount = accountNo !== "" && accounts.length > 0 ? accountNo : ""` · 1408 `visibleCards = inAccountScope(cards, scopeAccount)` · 1429-1432 `scopedViOrders` 는 `accountNo === ""` 만 본다. **리뷰의 「실제 차이 없음」 전제는 한 상태에서 어긋난다**: `pillAccountOf`(lib/trading-layout.ts 174)는 `accounts` 가 비면 현재 값을 그대로 돌려주고, relay `state` 프레임이 `accounts: []` 를 명시로 실으면(`applyFrame` 의 `frame.accounts ?? state.accounts`) 계좌는 비는데 `accountNo` 와 캐시된 `viOrders` 는 남는다. 그때만 옛 식은 VI 스트립을 옛 계좌로 거르고 카드 격자는 거르지 않는다 — 수정 뒤에는 둘 다 거르지 않는다(D-01 같은 스코프). 계좌 수신 · 전환 · 처음부터 미수신 경로는 전과 같다. Task 2 테스트가 둘을 나눠 고정한다.
- 테스트 도우미(trading-workbench.test.tsx): `viOrder(over)`(223) · `lc(isin, over)`(247) · `relay(over)`(262) · 「P32 계좌 전환 경로 · 종목 단위 스코프」 describe(3010~)의 `A` · `B` · `accA` · `accB` · `SAMSUNG` · `parkedKeys()` · `pickedAccount()` · `clickAccount(B)` · VI 칩 셀렉터 `[data-slot="vi-chip"]`(2410 테스트).
- 기준 실행(직전 quick SUMMARY): account-chips 17 · workbench-status-bar 46 · me-client 30 · trading-workbench 151 통과.

## E — 선택 칩 번호 대비 (계산 결과 · 코드 무변경)

선택 칩 번호 = `--seg-on-fg` 를 80% 불투명도로 `--seg-on-bg` 위에 합성(sRGB · WCAG 2 상대 휘도). `--seg-on-*` 정의는 globals.css `:root` 92-94 · `.dark` 246-248 두 곳뿐(재정의 grep 0).

| 테마 | 글자(합성 전) | 면 | 합성 글자 | 대비 | 참고: 상품명(100%) |
|---|---|---|---|---|---|
| 라이트 | #191f28 × .8 | #ffffff | ≈ #474c53 | **8.67:1** | 16.56:1 |
| 다크 | #ffffff × .8 | #4e4e4e | ≈ #dcdcdc | **6.04:1** | 8.32:1 |

→ 둘 다 AA 4.5:1(작은 글자) 통과 · `opacity-80` 유지. 잠금 시 줄 전체 `opacity .45` 는 비활성 컴포넌트라 WCAG 1.4.3 예외.

## B — 끄기 버튼 글자 대비 (기록용 · sRGB 근사)

| 테마 | 옛 면(가격 방향 토큰) | 새 면 color-mix 10% | 참고: 면 없이 카드 위 |
|---|---|---|---|
| 라이트 (#f04452 on 흰 카드) | 3.31:1 | 3.26:1 | 3.71:1 |
| 다크 (#f04251 on #151515) | 4.13:1 (16% 틴트) | 4.44:1 | 4.87:1 |

→ 새 면은 라이트에서 사실상 같고 다크에서 오른다. 둘 다 12/600 글자 AA 4.5 에 못 미치는 것은 `--destructive` 토큰 자체의 한계(라이트 흰 바탕에서도 3.71)다 — 계약 「새 색 토큰 0」 · a11y.spec 의 `color-contrast` 이연 규칙 범위. 이 quick 은 토큰을 바꾸지 않고 SUMMARY 「범위 밖」 에 남긴다.

## A — 간격 위치별 새 값 표 (Task 3 이 적용 · 줄 번호 HEAD 274e0dcc)

규칙: 밀집 작업면(작업대 상단 줄 · 토스트 · 세그먼트 · 배지)은 **내림**(가로 폭이 늘지 않게 — 넘침 위험 0), 결정 표면(확인 다이얼로그)은 **이웃 값 정렬 쪽**. 공용 짝은 같은 새 값으로 함께 바꾼다(Phase 32 밖은 그 짝까지만).

| # | 위치 | 옛 값 | 새 값 | 방향 · 이유 | 함께 바꾸는 공용 짝 |
|---|---|---|---|---|---|
| 1 | `alert-toasts.tsx:148` 토스트 카드 루트(`alert-toast`) | `gap-2.5` 10 · `py-2.5` 10 (`px-3` 12) | `gap-2` 8 · `py-2` 8 (`px-3` 유지) | 내림 — 작업면 위에 겹치는 알림이라 밀도 우선. 열 간격 내림은 본문 열을 4px 넓혀 S4 백스톱(계좌 줄 ≤2줄 · 힌트 잘림 0)에 여유만 더한다. 높이 −4px | 없음(알림 토스트 7종이 이 한 요소를 공유) |
| 2 | `alert-toasts.tsx:169` 건수 배지 「{n}건」 | `px-[5px]` 5 | `px-1` 4 | 내림 — 1px · 좁아지기만 해 넘침 위험 0 | UI-SPEC Exceptions 가 「공용 마이크로 배지 규격」 으로 이름 붙인 4곳: `strategy-badge.tsx:176` `StrategyBadge` · `vi-order-list.tsx:820` · `workbench/vi-trigger-strip.tsx:226` · `workbench/breakout-strip.tsx:663`. `admin/account-editor.tsx:411` `PILL_CHIP` 은 그 목록 밖(관리자 화면) → 안 바꾼다 |
| 3 | `strategy-status-card.tsx:283` 「이 계좌 끄기」 다이얼로그 요약 `dl` | `gap-1.5` 6 · `py-2.5` 10 (`px-3` 12) | `gap-2` 8 · `p-3` 12 사방 | 올림 — 결정 표면이라 읽기 우선(6 은 4 · 8 등거리 → 8). py 를 px 와 같게 해 상자 안 여백 균일. 다이얼로그 높이 +8px(가로 무관) | `workbench/vi-settings-rows.tsx:833` `vi-confirm-summary`(VI 시작/중지 확인 — 같은 클래스 문자열) |
| 4 | `strategy-status-card.tsx:305` 같은 다이얼로그 경고 문단 | `px-2.5` 10 (`py-2` 8) | `px-3` 12 (`py-2` 유지) | 올림 — 위 요약 상자 글자 왼쪽 선(12)과 맞춘다 | `vi-settings-rows.tsx:859` `vi-confirm-warning` |
| 5 | `workbench-status-bar.tsx:154` 상단 줄 카드 루트 | `py-2.5` 10 (`px-4` 16) | `py-2` 8 | 내림 — 32-15 뒤 가장 높은 항목은 계좌 칩 32 → 카드 높이 52 → 48(4배수 합). 작업대 머리가 4px 줄어 격자에 양보. 세로 패딩이라 폰 밴드 한 줄 계약(S1 백스톱 = 가로 넘침 · 세로 중심 묶음 수 · 칩 한 줄)에 영향 0 | 없음(`.status-bar` 문법 짝 grep 0) |
| 6 | `workbench-status-bar.tsx:262` 컬럼 세그먼트 항목 「1단/2단/3단」 | `px-[9px]` 9 | `px-2` 8 | 내림 — 항목 3개 합 6px 좁아짐. 폰 밴드(`phoneBand` true)에서는 DOM 에 없어 폰 한 줄 계약과 무관 · 680 이상 `flex-wrap` 판정에서도 좁아지기만 | `lc/setting-group.tsx:1229` `ChoiceRow` 항목(상따 화면 · /me 상따 기본설정) — 좁아지기만 하므로 setting-group 주석의 상따 밴드 실측 여유(예 lc 344 −0.4px)는 늘기만 한다. `stock-comovement-section.tsx` 의 9px 는 세그먼트가 아닌 칩 → 안 바꾼다 |
| 7 | `workbench-status-bar.tsx:308` 옮김 안내 닫기 × | `-my-0.5` −2 on `size-5` 20 | `-my-1` −4 on `size-6` 24(아이콘 `size-3` 유지) | 같은 광학 보정 식을 4배수로: 24 − 4×2 = 16 ≈ `AUX_LINE` 줄 높이(11 × 1.45 = 15.95) → 줄 높이 불변 · 버튼 중심 = 첫 줄 중심. 누름 영역 20 → 24(WCAG 2.2 SC 2.5.8 최소 24×24 충족). 가로 4px 늘어 안내 글자 열 4px 좁아짐(`basis-full` · `break-keep` 줄바꿈 허용 줄). hover 면이 위아래 4px 넘침 = 보조 줄 묶음 위 간격(4px) 안 | 없음 |
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (② B + C): 계좌 끄기 표면 — 「끄기」 어휘 통일 + 카드 · 다이얼로그 버튼 같은 옅은 면(--destructive color-mix)</name>
  <files>webapp/src/components/trading/strategy-status-card.tsx, webapp/src/components/trading/__tests__/strategy-status-card.test.tsx, webapp/e2e/specs/me.spec.ts, .planning/phases/32-account-axis/32-UI-SPEC.md</files>
  <read_first>webapp/src/components/trading/strategy-status-card.tsx 1-40 · 105-120 · 228-330 · 600-640, webapp/src/components/trading/__tests__/strategy-status-card.test.tsx 540-550 · 757-800 · 915-960 (그 밖의 SEND_FAIL 사용처는 grep), webapp/e2e/specs/me.spec.ts 660-700, .planning/phases/32-account-axis/32-UI-SPEC.md 1-10 · 78-87 · 213-241 · 308-353 · 404-427 · 562-576</read_first>
  <behavior>
    - 「이 계좌 끄기」 → 다이얼로그 제목 = 「이 계좌의 전략을 끌까요?」 · 다이얼로그 textContent 에 「비활성화」 0 (부제 · 표 · 경고 문단 · 「닫기」 기본 포커스 · 실행 버튼 이름 「이 계좌 끄기」 는 그대로).
    - `send` 가 false → 오류 줄(`role="alert"`) = 「연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」.
    - 새 테스트 하나: 카드(kill 줄 포함) · 열린 다이얼로그 · 전송 실패 오류 줄을 차례로 띄우며 각 textContent 에 「비활성화」 가 없음을 단언(끄기 어휘 통일 · quick-261017-bwt).
    - 기존 단언 유지: 접근 이름 「이 계좌 끄기 — {번호}」 · 미확인 문구 「이 계좌 끄기 요청의 반영을 확인하지 못했어요. …」 · D-27 끄기 컨트롤 1개 · expectNoKillUi.
  </behavior>
  <action>
<!-- planner-discipline-allow: 비활성화 -->
RED 먼저(문구 상수 · per D-21 · D-27 — 버튼 라벨 「이 계좌 끄기」 는 사용자 결정이라 그대로): strategy-status-card.test.tsx 에서 (1) 766행 `SEND_FAIL` 상수 값을 「연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」 로, (2) 931행 다이얼로그 제목 단언을 「이 계좌의 전략을 끌까요?」 로, (3) 940행 부정 단언 「전부 비활성화」 를 옛 동사 전체 「비활성화」 부재로 넓힌다. (4) 「P32 이 계좌 끄기」 describe 안에 behavior 의 어휘 테스트 1개를 추가한다(카드 → 다이얼로그 → 실행 → send false 로 오류 줄까지 — 기존 `killButton` · 실행 도우미 · `send` 모의를 그대로 쓴다). 실패를 확인하고 커밋: `test(quick-261017-bwt): 계좌 끄기 표면 「끄기」 어휘 단언 (RED)` — 경로 지정 `git add` 1파일.

GREEN — C 문구: strategy-status-card.tsx 117행 `DISABLE_SEND_FAILED_TEXT` 값을 위 새 전송 실패 문구로, 279행 `DialogTitle` 글자를 「이 계좌의 전략을 끌까요?」 로 바꾼다. `KILL_HINT` · `DISABLE_UNCONFIRMED_TEXT` · `disableSubtitle` · 표 · 경고 문단 · 두 버튼 글자 · aria-label 은 이미 끄기 어휘이거나 범위 밖 동사(VI 「중지」)라 그대로 둔다. **이 파일의 주석에도 옛 동사를 쓰지 않는다**(아래 검증이 파일 전체에서 그 낱말 0 을 본다).

GREEN — B 색: `KILL_HINT` 근처에 모듈 상수 `KILL_BUTTON_TONE` 을 둔다 — 값 `bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-[var(--destructive)] hover:bg-[color-mix(in_oklab,var(--destructive)_18%,transparent)]`. JSDoc 한 줄: 「이 계좌 끄기」 카드 버튼 · 확인 다이얼로그 실행 버튼 공용 톤 = 옅은 면 + `--destructive` 글자 · 채움(솔리드) 빨강 금지(S-6 — `--destructive` 와 `--up` 매수가 같은 색) · 상태 색은 `--destructive` 만, 가격 방향 토큰 금지(상태줄 ⑥ 규율) · 10% 는 다크에서 옛 면보다 글자 대비가 높다(quick-261017-bwt). 주석에 가격 방향 토큰의 이름을 적지 않는다(「가격 방향 토큰」 이라고만). 카드 kill 줄 버튼(634)의 className 을 `cn("ml-auto h-8 rounded-[var(--r-sm)] px-3 text-[12px] font-semibold disabled:opacity-[.45]", KILL_BUTTON_TONE)` 로 — 옛 가격 방향 면 · 옛 hover 를 없앤다. 다이얼로그 실행 버튼(316-322)은 `variant="outline"` 을 유지하고(이 프로젝트의 outline = 테두리 없는 muted 면 · 「닫기」 와 같은 상자 치수) className 을 `KILL_BUTTON_TONE` 하나로 — `--destructive` 테두리 · 투명 배경 클래스를 뺀다(tailwind-merge 가 변형의 muted 면 · fg · hover 를 덮는다 — 계획 시점 실측). 주석 3곳을 사실대로 고친다: 파일 머리 ③ 의 「실행 버튼은 테두리형이다 — …(S-6)」 문장(30-31행) → 「카드 버튼 · 실행 버튼 모두 `KILL_BUTTON_TONE` 옅은 면이다 — 채움(솔리드) 빨강은 매수 버튼과 구분되지 않는다(S-6)」, 314행 인라인 「채움 금지 …」 → 「채움(솔리드) 금지 — 카드 버튼과 같은 옅은 면(S-6 · quick-261017-bwt)」, 619-620행 kill 줄 주석의 「`--destructive` 면(목업 ⑥ `.btn.danger` …)」 → 「`KILL_BUTTON_TONE` 옅은 면(목업 ⑥ `.btn.danger` — 옅은 빨강 면 · 빨강 글자)」.

E2E: webapp/e2e/specs/me.spec.ts 687행 `toContainText` 를 「이 계좌의 전략을 끌까요?」 로.

UI-SPEC(32-UI-SPEC.md — 원문은 취소선으로 남기고 새 값 + 「quick-261017-bwt」 를 같은 줄에 붙인다 · 줄 번호는 문서에 적지 않는다):
- Copywriting Contract 표 「Destructive confirmation」 행: 제목을 ~~「이 계좌의 전략을 비활성화할까요?」~~ 「이 계좌의 전략을 끌까요?」(quick-261017-bwt · 끄기 어휘 통일).
- S5 Copywriting 표 「다이얼로그 제목(계좌 모드)」 행 · 「계좌 끄기 전송 실패」 행: 같은 방식으로 새 문구. 「다이얼로그 버튼」 행의 「(테두리형 `--destructive`)」 → ~~테두리형~~ 카드 버튼과 같은 옅은 면(quick-261017-bwt).
- Color 표 「Destructive」 행: 「카드 버튼(면 …) · 다이얼로그 실행 버튼(테두리형)」 을 「카드 버튼 · 다이얼로그 실행 버튼 — 같은 옅은 면 `color-mix(in oklab, --destructive 10%, transparent)` · hover 18% · `--destructive` 글자 · 채움(솔리드) 금지 S-6 · 가격 방향 토큰 금지(quick-261017-bwt)」 로(옛 구절 취소선). 목업 변수 표의 `.btn.danger` 행 값 칸 「`--destructive` 면 · 기존 「전체 비활성화」 `Button` 변형 그대로」 → 같은 color-mix 옅은 면 기술 + quick-261017-bwt.
- S5′(「카드 맨 아래(웨이브 ② relay 뒤)」 줄)의 「`--destructive` 면」 뒤에 「(color-mix 10% 옅은 면 · 실행 버튼과 같은 톤 · quick-261017-bwt)」. Component Inventory `Button` 행 · 원문 S5 시각 절의 「실행 버튼 테두리형 `--destructive`」 구절에도 취소선 + 「옅은 면(quick-261017-bwt)」.
- frontmatter `amended:` 끝에 「 · 2026-10-17 quick-261017-bwt 간격 4배수 · 끄기 버튼 옅은 면 · 끄기 어휘 · 칩 잠금 개별 aria-disabled」 를 붙인다(Task 2 · 3 내용까지 미리 적어 frontmatter 를 한 번만 고친다).

다크 모드 확인 = 위 context 「B — 끄기 버튼 글자 대비」 표 수치(라이트 3.26 · 다크 4.44 — 토큰 한계로 AA 미달, 옛 면 대비 다크 개선)를 SUMMARY 에 옮긴다. 스크린샷 · 브라우저 직접 조작은 하지 않는다.

검증 실행 뒤 커밋: `fix(quick-261017-bwt): 계좌 끄기 표면 「끄기」 어휘 통일 · 끄기 버튼 면 --destructive color-mix 로 카드 · 다이얼로그 일치 (UI 리뷰 B · C)` — 경로 지정 `git add` 3파일(strategy-status-card.tsx · me.spec.ts · 32-UI-SPEC.md) · 직전 `git status -sb` 확인 · 한글 · Co-Authored-By 없음 · push 금지. E2E 에서 webServer 타임아웃(NextFontGoogleFontFileReplacer 반복)이 나면 `rm -rf webapp/.next` 후 재실행한다(dev 포트 3100).
  </action>
  <verify>
    <automated>node -e 'const fs=require("fs");const s=fs.readFileSync("webapp/src/components/trading/strategy-status-card.tsx","utf8");const e=[];if(s.includes("비활성화"))e.push("old-verb");if(s.includes("up-bg"))e.push("price-token");if(!s.includes("이 계좌의 전략을 끌까요?"))e.push("title");if(!s.includes("연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요."))e.push("send-fail");const n=(s.match(/KILL_BUTTON_TONE/g)||[]).length;if(n<3)e.push("tone-uses-"+n);if(!s.includes("bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)]"))e.push("tint");if(!fs.readFileSync("webapp/e2e/specs/me.spec.ts","utf8").includes("이 계좌의 전략을 끌까요?"))e.push("e2e");const u=fs.readFileSync(".planning/phases/32-account-axis/32-UI-SPEC.md","utf8");if(!u.includes("「이 계좌의 전략을 끌까요?」")||!u.includes("quick-261017-bwt"))e.push("spec");if(e.length){console.error(e.join(","));process.exit(1)}console.log("ok")' && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts -g "P32-disable" --workers=1</automated>
  </verify>
  <done>strategy-status-card.tsx 에 옛 동사 0 · 가격 방향 토큰 0 · `KILL_BUTTON_TONE` 1 정의 + 2 사용. 단위(strategy-status-card · me-client) · typecheck · E2E P32-disable 통과. UI-SPEC Copywriting · S5 표 · Color 표 · S5′ 가 새 문구 · 옅은 면 톤을 말한다. 커밋 2개(test RED · fix GREEN).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (③ D + E + F): 잠긴 칩마다 aria-disabled + title · 선택 칩 번호 대비 기록 · VI 스트립 scopeAccount 게이트(IN-05)</name>
  <files>webapp/src/components/me/account-chips.tsx, webapp/src/components/me/__tests__/account-chips.test.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx, .planning/phases/32-account-axis/32-UI-SPEC.md</files>
  <read_first>webapp/src/components/me/account-chips.tsx (전체 185줄), webapp/src/components/me/__tests__/account-chips.test.tsx 1-40 · 160-215, webapp/src/components/trading/workbench/trading-workbench.tsx 636-662 · 1400-1435, webapp/src/components/trading/__tests__/trading-workbench.test.tsx 223-290 · 2410-2427 · 3010-3060 · 3091-3110, webapp/src/lib/trading-layout.ts 160-178, .planning/phases/32-account-axis/32-UI-SPEC.md 42-60 · 159-178 · 633-645</read_first>
  <behavior>
    - D 잠금(locked + lockedTitle 「저장 중에는 계좌를 바꿀 수 없어요」): 모든 `role="radio"` 칩이 `aria-disabled="true"` · `title` = 잠금 문구, 어느 칩에도 `disabled` 속성이 없다 · 선택 칩만 `tabIndex` 0(roving 유지) · 그룹의 `aria-disabled` · `title` 도 그대로.
    - D 잠금 아님: 어느 칩에도 `aria-disabled` · `title` 이 없다(작업대 그룹 `title` 이 hover 에 보이도록).
    - D 잠금 → 풀림 rerender: 칩의 `aria-disabled` · `title` 이 사라진다. 기존 잠금 테스트(화살표 = 포커스만 · 클릭/Enter/Space 0회 · opacity .45 · 풀리면 다시 고른다)는 수정 없이 통과.
    - F 정상 경로(수정 전후 같음): 계좌 [A, B] · VI 발동 A 1건 + B 1건(서로 다른 ISIN) → 기본 계좌 A 에서 `[data-slot="vi-chip"]` 1개(A 것) → `clickAccount(B)` → 1개(B 것). 처음부터 계좌 [] → 2개.
    - F 게이트 정렬(RED): 계좌 [A, B] · B 계좌 등록 상따 1건(`lc(SAMSUNG, { accountNo: B })`) · VI 발동 A · B → A 에서 `parkedKeys()` = [B 카드] · VI 칩 1개 → `mockRelay` 를 계좌 [] (상따 · VI 같음)로 바꿔 rerender → `parkedKeys()` = [] 이고 VI 칩 2개(카드 격자와 같이 거르지 않음).
  </behavior>
  <action>
RED 먼저(per 32-UI-REVIEW 추가 권고 (5) · Pillar 6 WARNING · 32-REVIEW IN-05 · D-01):
- account-chips.test.tsx 에 behavior D 의 3 케이스를 추가한다(기존 `setup` 도우미 · `chips()` 류 조회를 쓰고, `disabled` 속성 부재는 `not.toHaveAttribute("disabled")` 로 — jest-dom `toBeDisabled` 는 aria-disabled 를 보지 않는다).
- trading-workbench.test.tsx 의 「P32 계좌 전환 경로 · 종목 단위 스코프 (Pitfall 5 · 6)」 describe 끝에 이름이 「IN-05 」 로 시작하는 it 3개를 넣는다(그 describe 의 `A` · `B` · `accA` · `accB` · `SAMSUNG` · `parkedKeys` · `pickedAccount` · `clickAccount` 를 재사용): ① 정상 전환(A → B 칩 수 · 어느 계좌 것인지 — 칩 글자 또는 표의 주문번호로 구분), ② 처음부터 계좌 [] = 전부, ③ behavior 의 게이트 정렬(계좌가 나중에 비는 rerender). ① · ② 는 수정 전에도 통과하는 회귀 고정이고 ③ 만 실패해야 한다 — 그렇게 되는지 확인한다. VI 주문은 파일 상단 `viOrder({ accountNo, isin, orderNo, name })` 로 만든다.
- 커밋: `test(quick-261017-bwt): 잠긴 계좌 칩 개별 aria-disabled · VI 스트립 스코프 게이트 단언 (RED)` — 경로 지정 2파일.

GREEN:
- D: account-chips.tsx 칩 button 에 `aria-disabled={locked ? "true" : undefined}` 와 `title={locked ? lockedTitle : undefined}` 를 더한다. `disabled` 속성은 쓰지 않는다(포커스 · roving tabindex · 「화살표는 포커스만」 유지 — 직전 quick IN-02 동작). 그룹의 `aria-disabled` · `title` · `opacity-[.45]` 와 `pick` 가드는 그대로. 머리 주석 ③ 을 「잠금이면 그룹과 칩마다 `aria-disabled` + 같은 잠금 `title` — 칩 hover · 스크린리더가 왜 안 바뀌는지 안다. `disabled` 는 쓰지 않는다(포커스 유지 · 화살표는 포커스만) · quick-261017-bwt」 로 고치고, `MeAccountChipsProps.locked` JSDoc 에 「칩마다도」 를 붙인다.
- E: 코드 무변경 — `opacity-80` 그대로(context 「E」 표: 라이트 8.67:1 · 다크 6.04:1). 수치는 SUMMARY 에 옮긴다.
- F: trading-workbench.tsx `scopedViOrders` 의 식을 `scopeAccount === "" ? activeViOrders : activeViOrders.filter((o) => o.accountNo === scopeAccount)` 로, deps 를 `[activeViOrders, scopeAccount]` 로 바꾼다(VI 는 카드와 달리 계좌 공란 통과가 없다 — 지금처럼 정확 일치). 바로 위 「작업대 계좌 스코프 (Phase 32 D-01 · UI-SPEC S2)」 주석에 한 줄: 「VI 스트립도 카드 격자와 같은 `scopeAccount` 게이트다(IN-05) — 계좌 목록이 나중에 비면 둘 다 거르지 않는다(`pillAccountOf` 는 그때 계좌를 비우지 않는다)」.
- UI-SPEC: S13 「**잠금.**」 문단(목업 ⑥ 수정 절)과 접근성 표의 「/me 계좌 칩(S13)」 행에 「잠금 시 칩마다 `aria-disabled` + 같은 `title`(`disabled` 속성 없음 — 포커스 · roving 유지 · quick-261017-bwt)」 을 붙인다. 32-15 절 「접근성 · 키보드」 에 작업대는 잠금이 없다는 기존 문장이 있으면 그대로 둔다.
- 검증 실행 뒤 커밋: `fix(quick-261017-bwt): 잠긴 계좌 칩마다 aria-disabled · 잠금 title · VI 스트립이 카드 격자와 같은 scopeAccount 게이트 (UI 리뷰 D · IN-05)` — 경로 지정 3파일(account-chips.tsx · trading-workbench.tsx · 32-UI-SPEC.md) · 직전 `git status -sb` · 한글 · Co-Authored-By 없음 · push 금지.
  </action>
  <verify>
    <automated>node -e 'const fs=require("fs");const c=fs.readFileSync("webapp/src/components/me/account-chips.tsx","utf8");const w=fs.readFileSync("webapp/src/components/trading/workbench/trading-workbench.tsx","utf8");const e=[];if((c.match(/aria-disabled=\{locked/g)||[]).length<2)e.push("chip-aria-disabled");if(!/title=\{locked \? lockedTitle : undefined\}/.test(c))e.push("chip-title");if(/[^-]disabled=\{/.test(c))e.push("bare-disabled");if(!c.includes("opacity-80"))e.push("E-changed");if(!w.includes("scopeAccount === \"\" ? activeViOrders : activeViOrders.filter((o) => o.accountNo === scopeAccount)")||!w.includes("[activeViOrders, scopeAccount]"))e.push("in05");if(e.length){console.error(e.join(","));process.exit(1)}console.log("ok")' && pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/me-client.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>잠금 시 칩마다 aria-disabled · 잠금 title(disabled 없음) · 선택 칩 번호 opacity-80 유지(대비 수치 기록) · scopedViOrders = scopeAccount 게이트. account-chips · me-client · workbench-status-bar · trading-workbench 통과(새 IN-05 ③ 은 RED 커밋에서 실패 → GREEN 통과, ① · ② 는 양쪽 통과) · typecheck 통과. 커밋 2개(test RED · fix GREEN).</done>
</task>

<task type="auto">
  <name>Task 3 (① A): 간격 7곳 4배수 + 공용 짝 동행 · 32-UI-SPEC Spacing 예외 해소</name>
  <files>webapp/src/components/trading/workbench/alert-toasts.tsx, webapp/src/components/trading/strategy-status-card.tsx, webapp/src/components/trading/workbench/vi-settings-rows.tsx, webapp/src/components/trading/workbench/workbench-status-bar.tsx, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/strategy-badge.tsx, webapp/src/components/trading/vi-order-list.tsx, webapp/src/components/trading/workbench/vi-trigger-strip.tsx, webapp/src/components/trading/workbench/breakout-strip.tsx, .planning/phases/32-account-axis/32-UI-SPEC.md</files>
  <read_first>이 PLAN context 의 「A — 간격 위치별 새 값 표」, 각 파일의 표에 적힌 줄 ±6줄(alert-toasts 145-172 · strategy-status-card 280-308 · vi-settings-rows 830-862 · workbench-status-bar 148-158 · 255-312 · setting-group 1225-1232 · strategy-badge 170-178 · vi-order-list 816-822 · vi-trigger-strip 222-228 · breakout-strip 660-665), .planning/phases/32-account-axis/32-UI-SPEC.md 243-290(Spacing Scale 절 — Task 1 반영본)</read_first>
  <action>
표(#1~#7)를 그대로 적용한다(per 32-UI-REVIEW Pillar 5 · 사용자 지시 「7곳 실제 4배수 · 공용 짝 동행 · Phase 32 밖은 그 짝까지만」). 각 줄에서 표가 가리키는 토큰만 바꾸고 나머지 클래스 · 순서는 그대로 둔다.

- #1 alert-toasts.tsx 토스트 카드 루트: 열 간격 10 → `gap-2`, 세로 패딩 10 → `py-2`(`px-3` 유지).
- #2 alert-toasts.tsx 건수 배지 「{n}건」 좌우 5px → `px-1`. 같은 5px 배지 좌우를 표의 공용 짝 4곳(strategy-badge.tsx `StrategyBadge` 의 `cn("gap-1 …")` · vi-order-list.tsx 820 · vi-trigger-strip.tsx 226 · breakout-strip.tsx 663)에서도 `px-1` 로. admin `PILL_CHIP` 은 손대지 않는다.
- #3 strategy-status-card.tsx 다이얼로그 요약 `dl` 와 vi-settings-rows.tsx `vi-confirm-summary` `dl`: 행 간격 6 → `gap-2`, 좌우 12 · 세로 10 → `p-3` 하나로(결과 두 파일 모두 `flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--border)] p-3 text-[length:var(--t-caption)]`).
- #4 같은 두 다이얼로그의 경고 문단: 좌우 10 → `px-3`(`py-2` 유지 · vi-settings-rows 쪽 `m-0` 유지).
- #5 workbench-status-bar.tsx 루트: 세로 10 → `py-2`. 153행 주석 「10/16px 패딩」 → 「8/16px 패딩(quick-261017-bwt — 32-15 계좌 칩 32 + 8×2 = 48 · 옛 10/16)」.
- #6 workbench-status-bar.tsx 컬럼 세그먼트 `ToggleGroupItem` 좌우 9px → `px-2`, setting-group.tsx `ChoiceRow` 항목 button 좌우 9px → `px-2`(트랙 `rounded-[9px]` · `p-0.5` · `gap-0.5` 는 범위 밖 — 그대로).
- #7 workbench-status-bar.tsx 옮김 안내 닫기 버튼: 위아래 −2px · 20px 상자 → `-my-1` · `size-6`(아이콘 `size-3` 그대로). 버튼 바로 위에 한 줄 주석: 「24px 누름 영역(WCAG 2.5.8) · 위아래 −4 = 줄 높이 16(`AUX_LINE` 11×1.45)에 맞춘 광학 보정 — 줄을 키우지 않는다(quick-261017-bwt)」.

32-UI-SPEC.md 「## Spacing Scale」 절(줄 번호는 문서에 적지 않는다):
- 「이 phase 가 새로 정하는 치수」 표 「상단 줄 카드」 행: 「패딩 16/10」 → ~~16/10~~ 「16/8(quick-261017-bwt — 칩 32 + 8×2 = 48)」. 같은 표 끝에 행 5개 추가(근거 칸 = quick-261017-bwt + 표 # 요지): 알림 토스트 카드 = 패딩 12/8 · 열 간격 8 / 확인 다이얼로그 요약 상자 = 패딩 12 사방 · 행 간격 8 · 경고 문단 패딩 12/8(「이 계좌 끄기」 · VI 시작/중지 공용) / 컬럼 세그먼트 · `ChoiceRow` 항목 좌우 8 / 마이크로 배지(토스트 건수 · `StrategyBadge` · VI 주문 · VI 트리거 · 돌파 태그) 좌우 4 / 옮김 안내 닫기 × = 24 상자 · 위아래 −4(광학 보정 · 24 − 8 = 줄 높이 16).
- 「(`--s-3`) 12px」 행 Usage 칸의 「서버 세그먼트 항목 좌우 — 목업 값 · 기존 `ChoiceRow`」 구절에 취소선 + 「(서버 세그먼트는 S8′ 로 없음 · `ChoiceRow` 항목 좌우는 8 — quick-261017-bwt)」.
- Exceptions 목록의 「2026-10-16 UI 리뷰 간격 판정(quick-261016-udz) …」 머리 항목 끝에 「→ 2026-10-17 quick-261017-bwt 로 아래 7곳 모두 4배수로 해소(예외 아님)」 를 붙이고, 그 아래 하위 항목 7개(토스트 카드 · 토스트 건수 배지 · 끄기 다이얼로그 `dl` · 경고 문단 · 상단 줄 카드 · 컬럼 세그먼트 항목 · 옮김 안내 ×) 각각을 통째로 취소선(~~…~~)으로 감싸고 같은 줄 끝에 「→ quick-261017-bwt 로 해소: {새 값} · 짝 {함께 바꾼 파일}」 을 붙인다(표 #1~#7 의 새 값 · 짝 그대로). 「정리(예외 아님) device-settings-card」 항목과 서버키 칩 · 세그먼트 높이 24px · LED · 사이드바 예외 항목은 그대로 둔다.

검증 실행 뒤 커밋: `style(quick-261017-bwt): UI 리뷰 간격 7곳 4배수 · 공용 짝(VI 확인 다이얼로그 · ChoiceRow · 마이크로 배지) 동행 · 32-UI-SPEC 예외 해소 (UI 리뷰 A)` — 경로 지정 `git add` 10파일 · 직전 `git status -sb` · 한글 · Co-Authored-By 없음 · push 금지. E2E webServer 타임아웃이면 `rm -rf webapp/.next` 후 재실행.
  </action>
  <verify>
    <automated>node -e 'const fs=require("fs");const r=p=>fs.readFileSync("webapp/src/components/"+p,"utf8");const e=[];const has=(p,k)=>{if(!r(p).includes(k))e.push(p+" missing "+k)};const no=(p,k)=>{if(r(p).includes(k))e.push(p+" still "+k)};has("trading/workbench/alert-toasts.tsx","items-start gap-2 rounded-[var(--r-md)] border border-l-4 border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px]");has("trading/workbench/alert-toasts.tsx","bg-[var(--accent)] px-1 text-[10px]");for(const p of ["trading/strategy-status-card.tsx","trading/workbench/vi-settings-rows.tsx"]){has(p,"flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--border)] p-3 text-[length:var(--t-caption)]");has(p,"border border-[var(--destructive)] px-3 py-2 text-[length:var(--t-caption)]")}has("trading/workbench/workbench-status-bar.tsx","bg-[var(--card)] px-4 py-2 text-[length:var(--t-caption)]");has("trading/workbench/workbench-status-bar.tsx","bg-transparent px-2 text-[11px]");has("trading/workbench/workbench-status-bar.tsx","-my-1 inline-flex size-6 shrink-0");has("trading/lc/setting-group.tsx","rounded-[7px] px-2 text-[12.5px]");has("trading/strategy-badge.tsx","\"gap-1 px-1\"");for(const p of ["trading/workbench/alert-toasts.tsx","trading/strategy-badge.tsx","trading/vi-order-list.tsx","trading/workbench/vi-trigger-strip.tsx","trading/workbench/breakout-strip.tsx"])no(p,"px-[5px]");for(const p of ["trading/workbench/workbench-status-bar.tsx","trading/lc/setting-group.tsx"])no(p,"px-[9px]");no("trading/workbench/workbench-status-bar.tsx","-my-0.5");const L=fs.readFileSync(".planning/phases/32-account-axis/32-UI-SPEC.md","utf8").split("\n");const a=L.findIndex(l=>l.startsWith("## Spacing Scale"));const b=L.findIndex((l,i)=>i>a&&l.startsWith("## Typography"));const S=a<0||b<0?"":L.slice(a,b).join("\n");if((S.match(/quick-261017-bwt/g)||[]).length<10)e.push("spec-spacing-marks");if(!S.includes("16/8"))e.push("spec-16/8");if(e.length){console.error(e.join("\n"));process.exit(1)}console.log("ok")' && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/alert-toasts.test.tsx src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/vi-settings-rows.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/lc/__tests__/setting-group.test.tsx src/components/trading/__tests__/strategy-badge.test.tsx src/components/trading/__tests__/vi-order-list.test.tsx src/components/trading/__tests__/vi-trigger-strip.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/account-axis-backstop.spec.ts -g "backstop S1|backstop S4" --workers=1</automated>
  </verify>
  <done>표 #1~#7 위치와 공용 짝이 모두 4배수 새 값(5px · 9px · −2px 잔존 0 — 지정 파일 기준). 단위 9파일 · typecheck 통과. 백스톱 E2E S1(상단 줄 344 · 685 · 830 · 992 넘침 0 · 칩 한 줄) · S13(/me 칩 줄) · S4(토스트 계좌 줄 ≤2줄 · 힌트 잘림 0) 통과. UI-SPEC Spacing 표 16/8 · 새 치수 5행 · 예외 7곳 해소 표시. style 커밋 1개.</done>
</task>

</tasks>

<verification>
- 세 태스크의 node 검사 모두 「ok」.
- 바뀐 파일 관련 단위 테스트(태스크별 목록 합집합 — strategy-status-card · me-client · account-chips · workbench-status-bar · trading-workbench · alert-toasts · vi-settings-rows · setting-group · strategy-badge · vi-order-list · vi-trigger-strip · breakout-strip)가 `--maxWorkers=2` 로 전부 통과. 마지막 태스크 뒤 한 번 더 합집합으로 돌려 앞 태스크 회귀가 없음을 확인한다.
- `pnpm --filter @gh-radar/webapp run typecheck` 통과.
- E2E 는 두 묶음만, `--workers=1`: `e2e/specs/me.spec.ts -g "P32-disable"`(끄기 문구) · `e2e/specs/account-axis-backstop.spec.ts -g "backstop S1|backstop S4"`(상단 줄 · 칩 줄 · 토스트 간격). 전체 E2E 금지.
- `git diff --stat 274e0dcc..HEAD` 가 frontmatter `files_modified` 16개 안에 머물고, relay/ · admin/ · stock-comovement-section.tsx · 32-UI-REVIEW.md · card-body.tsx · strategy-card.tsx · strategy-log.tsx 는 diff 에 없다.
- 배포 · push 없음.
</verification>

<success_criteria>
- UI 리뷰가 지목한 비-4배수 7곳이 실제 4배수가 되고 공용 짝이 같은 값으로 따라가며, 상단 줄 폰 한 줄 · 토스트 계좌 줄 계약이 백스톱으로 다시 증명된다. UI-SPEC 의 해당 예외 7개는 「quick-261017-bwt 로 해소」 로 닫히고 계약 값(16/8 · 새 치수 5행)이 갱신된다.
- 「이 계좌 끄기」 카드 · 다이얼로그 버튼이 한 상수의 옅은 면 톤을 공유하고 가격 방향 토큰이 사라지며, UI-SPEC Color 표와 코드 주석(S-6)이 같은 말을 한다.
- /me 계좌 끄기 표면 어휘가 「끄기」 하나다(UI-SPEC Copywriting 갱신 · 단위 + E2E 단언 갱신).
- 잠긴 계좌 칩 각각이 이유(title)와 비활성 상태(aria-disabled)를 알리되 포커스는 남는다. 선택 칩 번호 대비는 라이트 8.67 · 다크 6.04 로 통과(무변경). VI 스트립과 카드 격자가 한 스코프 게이트를 쓴다(IN-05 해소).
- 커밋 5개(test · fix · test · fix · style) · 한글 메시지 · Co-Authored-By 없음 · push 없음.
</success_criteria>

<output>
Create `.planning/quick/261017-bwt-phase-32-ui-7-4-destructive-in-05/261017-bwt-SUMMARY.md` when done — A 표 #1~#7 결과(새 값 · 함께 바꾼 짝), B 대비 수치(라이트 3.26 · 다크 4.44 · 토큰 한계로 AA 미달 = 범위 밖 기록), C 바뀐 문구 2개, D 테스트 수(account-chips 전후), E 대비 수치(8.67 · 6.04 · 무변경), F IN-05 ③ 의 단 하나의 동작 차이(계좌 목록이 나중에 비는 상태)와 정상 경로 무변화, 커밋 해시 5개, 실행한 E2E 두 묶음 결과, 범위 밖으로 남긴 것(IN-04 · IN-01 · IN-03 · `--destructive` 글자 대비 · admin PILL_CHIP · kill 줄 `gap-2.5` 등 미지목 간격)을 적는다.
</output>
