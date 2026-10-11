---
phase: quick-260922-tqr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/lib/use-vi-end-alerts.ts
  - webapp/src/lib/vi-alert.ts
  - webapp/src/lib/alert-tone.ts
  - webapp/src/lib/breakout-list.ts
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
  - webapp/src/lib/__tests__/vi-alert.test.ts
  - webapp/src/components/ui/command.tsx
  - webapp/src/components/trading/workbench/stock-add-bar.tsx
  - webapp/e2e/specs/search.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/orderbook/trade-tape.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
files_deleted:
  - webapp/src/lib/use-vi-end-alerts.ts
autonomous: true
requirements: [TQR-01, TQR-02, TQR-03]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "작업대 상태줄의 알림 묶음(workbench-alerts)에는 돌파 알림음 토글 하나만 있고, VI 마감알림 토글·권한 요청·마감 타이머·브라우저 Notification 코드가 webapp 어디에도 없다 (TQR-01)"
    - "VI 금액 변환(manwonToKrw · krwToManwon · MAX_VI_ORDER_AMOUNT_MANWON)과 VI 통지 몫 판정(isViServerMessage)은 그대로 동작한다 — VI 설정 2줄 · VI 서버 오류 줄 · 전략 로그가 바뀌지 않는다 (TQR-01)"
    - "터치 기기(pointer: coarse — iPhone 세로·가로 844px 포함)에서 전역 검색 · 테마 종목 추가 · 작업대 종목 추가 입력의 글꼴이 16px 이라 iOS Safari 가 포커스 시 확대하지 않고, 마우스 기기(pointer: fine)에서는 기존 14px 그대로다 (TQR-02)"
    - "viewport 에 확대 금지(최대 배율 · 사용자 확대 끔)를 넣지 않는다 — 핀치줌 접근성 유지 (TQR-02)"
    - "호가창 체결 테이프 하단과 상따 카드 호가 칼럼에 수량 색 설명 문구가 없고, 수량 색 · sr-only 매수/매도(서버 체결구분 우선 · 미상만 추정)는 그대로다 (TQR-03)"
  artifacts:
    - path: "webapp/src/lib/vi-alert.ts"
      provides: "VI 금액 단위 변환 + 통지 몫 판정만 남은 순수 유틸"
      exports: ["manwonToKrw", "krwToManwon", "MAX_VI_ORDER_AMOUNT_MANWON", "isViServerMessage"]
    - path: "webapp/src/components/trading/workbench/workbench-status-bar.tsx"
      provides: "알림 묶음에 ToneToggle 하나뿐인 상태줄"
    - path: "webapp/src/components/ui/command.tsx"
      provides: "CommandInput 터치 16px / 마우스 14px"
      contains: "text-base pointer-fine:text-sm"
    - path: "webapp/src/components/trading/workbench/stock-add-bar.tsx"
      provides: "StockSearchField 입력 터치 16px / 마우스 14px"
      contains: "text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-sm)]"
    - path: "webapp/src/components/orderbook/trade-tape.tsx"
      provides: "하단 설명 문구 없는 체결 테이프 · tapeSidesOf 추정 게이트 유지"
  key_links:
    - from: "webapp/src/components/trading/workbench/vi-settings-rows.tsx"
      to: "webapp/src/lib/vi-alert.ts"
      via: "import { MAX_VI_ORDER_AMOUNT_MANWON, krwToManwon, manwonToKrw }"
      pattern: "from '@/lib/vi-alert'"
    - from: "webapp/src/lib/use-vi-server-error.ts"
      to: "webapp/src/lib/vi-alert.ts"
      via: "import { isViServerMessage }"
      pattern: "isViServerMessage"
    - from: "webapp/src/components/search/global-search.tsx · webapp/src/components/theme/theme-edit-dialog.tsx"
      to: "webapp/src/components/ui/command.tsx"
      via: "CommandInput (className 미전달 — 기본 클래스가 그대로 적용)"
      pattern: "<CommandInput"
    - from: "webapp/src/components/orderbook/trade-tape.tsx TradeTape"
      to: "tapeSidesOf"
      via: "useMemo → sides 만 구조분해"
      pattern: "tapeSidesOf\\(rows"
---

<objective>
작업대/호가 UI 정리 3건을 한 플랜으로 처리한다 (quick-260922-tqr).

1. **TQR-01** 작업대 상태줄의 VI 「마감알림」 토글을 **기능째** 제거한다 — 버튼만 지우면 훅·타이머·권한 요청이 죽은 코드로 남으므로 훅 파일 삭제 + `vi-alert.ts` 의 알림 전용 export 삭제까지 간다. 금액 변환·통지 몫 판정은 유지.
2. **TQR-02** iPhone 에서 종목검색 입력 포커스 시 화면이 확대되는 문제를 **16px 글꼴**로 막는다 (viewport 확대 금지 설정은 절대 쓰지 않는다 — `limit-chaser-form.tsx` 모바일 16px 주석의 정책).
3. **TQR-03** 호가창 체결 테이프 하단 설명 문구(수량 색 근거 고지)와 상따 카드의 중복 캡션을 제거한다. 매수/매도 판정(서버 체결구분 우선 + 미상만 추정)과 색·sr-only 는 유지.

Purpose: 사용자가 요청한 화면 정리 — 쓰지 않는 토글 제거, iPhone 검색 UX 결함 수정, 소음 문구 제거.
Output: 위 3건이 반영된 webapp 코드 + 갱신된 vitest/Playwright 테스트 + SUMMARY.

Tracer-first 미적용 근거: 기존 아키텍처 위의 **제거·CSS 클래스 변경**뿐이라 새로 증명할 end-to-end 경로가 없다 (quick 제약 「항목당 1태스크」 = `--no-tracer` 와 동등). 태스크 3개는 서로 독립이며 같은 파일을 공유하는 곳은 `trading-workbench.spec.ts` 하나(Task 1 → Task 2 순차)뿐이다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

사전 조사 결과 (플래너가 2026-09-22 grep 으로 재확인함 — 실행 전 다시 grep 해서 확인할 것):
- `use-vi-end-alerts.ts` 의 소비처는 `trading-workbench.tsx` 하나뿐이다. 이 훅 전용 테스트 파일은 없다.
- `vi-alert.ts` 에서 **남는** export 의 소비처: `vi-settings-rows.tsx`(금액 3종) · `use-vi-server-error.ts`(isViServerMessage) · `strategy-log.test.tsx`(isViServerMessage) · `vi-settings-rows.test.tsx`(금액 2종).
- `vi-alert.ts` 에서 **지우는** export 의 소비처: `workbench-status-bar.tsx` · `use-vi-end-alerts.ts` · `workbench-status-bar.test.tsx` · `vi-alert.test.ts` 뿐.
- `alert-tone.ts:4` · `breakout-list.ts:19` 주석이 「`vi-alert.ts` 의 로컬 설정 함수 패턴」을 가리킨다 — 그 함수들이 사라지므로 포인터가 끊긴다.
- `trading-workbench.test.tsx` · `card-body.test.tsx` 는 VI 알림/설명 문구를 참조하지 않는다.
- `CommandInput` 호출부(`global-search.tsx:57` · `theme-edit-dialog.tsx:383`)는 둘 다 `className` 을 넘기지 않는다. `StockSearchField` 는 `stock-add-bar.tsx` 안에서만 쓰인다.
- 두 입력의 클래스 문자열을 단언하는 vitest/e2e 는 없다 (e2e `home.spec.ts:83` 의 fontSize 는 무관).
- Tailwind 는 4.2.2 — `pointer-fine:` 변형(`@media (pointer: fine)`)이 내장돼 있다 (dist 확인).
- Playwright chromium 에서 `hasTouch: true` 컨텍스트는 `matchMedia('(pointer: coarse)')` true · `(pointer: fine)` false, 기본 Desktop Chrome 은 fine true (플래너 실측).
- 설명 문구 원문을 단언하는 곳은 `trade-tape.test.tsx`(⑫ ⑬ ⑧ · compact 1건)뿐이고 e2e 에는 없다 (`orderbook.spec.ts:196` 은 주석).
- `app/layout.tsx` 의 `viewport` 는 `themeColor` 만 가진다.

@webapp/src/components/trading/workbench/workbench-status-bar.tsx
@webapp/src/lib/vi-alert.ts
@webapp/src/components/orderbook/trade-tape.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: VI 마감 알림 토글을 기능째 제거 (TQR-01)</name>
  <files>webapp/src/components/trading/workbench/workbench-status-bar.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/lib/use-vi-end-alerts.ts (삭제), webapp/src/lib/vi-alert.ts, webapp/src/lib/alert-tone.ts, webapp/src/lib/breakout-list.ts, webapp/src/components/trading/workbench/vi-settings-rows.tsx, webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx, webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx, webapp/src/lib/__tests__/vi-alert.test.ts, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <read_first>
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx (헤더 주석 ④ 28-31행 · import 38-59행 · props 97-98 · 구조분해 117 · 알림 묶음 190-193 · ToneToggle/ALERT_BTN 240-300 · ViAlertToggle 302-357)
    - webapp/src/components/trading/workbench/trading-workbench.tsx (139-141행 import · 721-731행 · 785-800행 상태줄 props)
    - webapp/src/lib/vi-alert.ts (전체 241행 — 남길 것/지울 것 경계)
    - webapp/src/lib/__tests__/vi-alert.test.ts (describe 경계: 금액 31-50 · parse 51 · schedule 74 · 로컬 설정 110 · 권한/통지 133-206 · isViServerMessage 208-247)
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx (1-90행 · 200-246행)
    - webapp/e2e/specs/trading-workbench.spec.ts (1400-1430행, 테스트 20)
  </read_first>
  <behavior>
    - 상태줄 렌더 후 `[data-slot="workbench-alerts"]` 안의 버튼은 정확히 1개(돌파 알림음)이다.
    - `[data-slot="workbench-vi-alert-toggle"]` · `[data-slot="workbench-vi-alert-reason"]` 가 DOM 에 없다. 이름이 /VI 마감/ 인 버튼이 없다.
    - `WorkbenchStatusBarProps` 에 VI 알림 콜백 prop 이 없다 (tsc 로 보장 — 넘기면 타입 오류).
    - `vi-alert.ts` 의 금액 변환 3종 · `isViServerMessage` 테스트는 전부 그대로 green.
    - e2e 20번: 상태줄에 VI 알림 토글이 0개.
  </behavior>
  <action>
    **먼저 테스트를 바꿔 RED 를 본 뒤 코드를 지운다.** 지우기 전 각 심볼을 `grep -rn <심볼> webapp/src webapp/e2e` 로 확인해 위 context 목록 밖의 소비처가 없음을 재확인한다(있으면 멈추고 보고).

    (A) 테스트 먼저
    - `workbench-status-bar.test.tsx`: 헤더 잠금 목록의 VI 알림 토글 항목을 「알림 묶음에는 돌파 알림음 하나뿐이다 — VI 브라우저 알림 토글은 기능째 제거(quick-260922-tqr)」로 바꾼다. `@/lib/vi-alert` 모듈 mock 블록, 그 모듈 import 줄, `beforeEach` 의 권한 요청 mockClear 줄을 지운다. 알림음 describe 안의 VI 토글 테스트 2건(켜면 권한 요청·저장 / 거부 사유 role=status)을 **부재 단언 1건**으로 교체한다: `workbench-alerts` 안 `getAllByRole('button')` 길이 1 이고 그것이 /돌파 알림음/ 버튼 · 위 두 data-slot 이 `null` · `screen.queryByRole('button', { name: /VI 마감/ })` 가 `null` · 렌더 후 `localStorage.getItem('gh-radar:vi-alert')` 가 `null`. 이 시점에 실행하면 부재 단언이 실패해야 한다(RED).
    - `vi-alert.test.ts`: parse · schedule · 로컬 설정 · 권한/통지 describe 4묶음과 그 전용 픽스처(`RECEIVED` 상수, Notification 스텁용 beforeEach/afterEach)를 지운다. import 는 남는 테스트가 쓰는 것(`isViServerMessage`, `krwToManwon`, `manwonToKrw` 등)만, vitest import 도 실제 쓰는 것(`describe`, `expect`, `it` …)만 남긴다. 헤더 잠금 목록에서 `vi_end_time` 3분기 · 알림 설정 항목을 뺀다.
    - `vi-settings-rows.test.tsx` 87행 테스트 제목에서 알림 스위치 언급을 빼 「… 계좌는 줄에 없다」로, 103행 주석을 「계좌 셀렉터는 상태줄 몫이다(Q-1). VI 브라우저 알림 스위치는 기능째 제거됐다 — 줄에 되살아나지 않는다(quick-260922-tqr)」로 바꾼다. 부재 단언(105행)은 그대로 둔다(재유입 가드).
    - `e2e/specs/trading-workbench.spec.ts` 테스트 20: 제목에서 「· (알림)은 상태줄」 세그먼트를 뺀다. 1424-1425행(이관 주석 + 토글 `toBeVisible`)을 「VI 브라우저 알림 토글은 기능째 제거됐다(quick-260922-tqr)」 주석 + `await expect(statusBar(page).locator('[data-slot="workbench-vi-alert-toggle"]')).toHaveCount(0);` 로 교체한다.

    (B) 코드 제거
    - `workbench-status-bar.tsx`: lucide import 에서 종 아이콘 2개(`Bell`, `BellOff`)만 빼고 `Volume2`/`VolumeX` 는 유지. `@/lib/vi-alert` import 블록 삭제. props 인터페이스의 VI 알림 콜백 prop 과 JSDoc, 컴포넌트 구조분해의 같은 이름 삭제. `data-slot="workbench-alerts"` span 은 **유지**하고 그 안의 VI 토글 엘리먼트만 삭제(ToneToggle 하나 남음). `function ViAlertToggle` 과 JSDoc 전체 삭제. 헤더 주석 ④ 를 현재 상태로 다시 쓴다: 「이 기기 전용 알림 — 돌파 알림음(D-17)」 + 한 줄 이력 「VI 브라우저 알림 토글은 사용자 요청으로 기능째 제거했다(quick-260922-tqr)」. `ALERT_BTN` 등 주변 주석이 「알림 2종」을 말하면 같이 고친다. React 훅 import(`useCallback`/`useEffect`/`useState`)는 ToneToggle 이 계속 쓰므로 유지(tsc·eslint 로 확인).
    - `trading-workbench.tsx`: 훅 import(139행)와 `@/lib/vi-alert` import(141행) 삭제, 727-729행 3줄(알림 on/off state · 로컬 설정 읽는 effect · 훅 호출) 삭제, 상태줄에 넘기던 콜백 prop 1줄(798행) 삭제. `viOrders` · `useEffect` · `useState` 는 다른 곳에서 계속 쓰므로 그대로.
    - `webapp/src/lib/use-vi-end-alerts.ts` 를 `git rm` 으로 삭제한다.
    - `vi-alert.ts`: 알림 전용 export 와 비공개 도우미를 전부 삭제 — 저장 키 · 리드/폴백 ms 상수 · 해제 시각 파서 · 스케줄 타입과 함수 · 로컬 설정 read/write · 권한 결과 타입과 요청 함수 · 비공개 사유 문구 상수 2개(미지원 · 거부 — 둘 다 권한 요청 함수 전용) · 통지 함수 · 「로컬 설정」「브라우저 알림 권한」 구획 주석. **남긴다**: `MAX_VI_ORDER_AMOUNT_KRW`·`isLimitChaserServerMessage` import, `MANWON_IN_KRW`, `manwonToKrw`, `krwToManwon`, `MAX_VI_ORDER_AMOUNT_MANWON`, `isViServerMessage` 와 각 JSDoc. 파일 헤더를 「VI 공용 순수 유틸 — 금액 단위 · 통지 몫 판정」으로 다시 쓴다: ① 은 「둘 다 두 곳에 두면 조용히 갈리는 값」으로 고치고, 알림·권한·SSR 가드(②③④)는 삭제, 끝에 한 줄 이력 「브라우저 알림 부분은 quick-260922-tqr 에서 제거됐다 — 파일명은 import 파급을 피하려 유지」. 헤더·이력 문구에 한글 토글 라벨(붙여 쓴 네 글자)을 쓰지 않는다(아래 grep 게이트).
    - 끊긴 포인터 주석 정리: `alert-tone.ts` 4행의 「구조·가드는 `vi-alert.ts` 를 따른다」 포인터를 빼고 자립 문장으로(아래 불릿이 이미 규칙을 설명한다). `breakout-list.ts` 19행 「패턴 정본은 `vi-alert.ts` 의 로컬 설정 함수다」는 이 파일 자신의 로컬 설정 함수(`readTonePref` 등)가 정본이라는 문장으로 바꾸거나 삭제. `vi-settings-rows.tsx` 10-11행 ★ 주석은 「계좌 셀렉터는 줄에 없다 — 계좌는 상태줄이 고르고 prop 으로 내려온다」로 줄인다(알림 스위치 언급 삭제). 43·86·108행의 `vi-alert.ts` 금액 함수 언급은 여전히 참이므로 그대로.
    - 사용자 브라우저에 남은 localStorage 키는 무해하므로 마이그레이션·정리 코드를 넣지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && test ! -e webapp/src/lib/use-vi-end-alerts.ts && ! grep -rnE "useViEndAlerts|ViAlertToggle|onViAlertChange|setViAlertOn|readViAlertEnabled|writeViAlertEnabled|requestViAlertPermission|notifyViEnd|scheduleViAlert|parseViEndTime|VI_ALERT_|use-vi-end-alerts" webapp/src webapp/e2e && ! grep -rn "마감알림" webapp/src --exclude-dir=__tests__ && pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/workbench-status-bar.test.tsx src/lib/__tests__/vi-alert.test.ts src/components/trading/__tests__/vi-settings-rows.test.tsx src/components/trading/__tests__/strategy-log.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>
    - 상태줄 알림 묶음 = 돌파 알림음 1개. VI 알림 토글·사유 줄·훅·타이머·Notification 코드 0 (grep 게이트 통과, 훅 파일 없음).
    - `vi-alert.ts` 는 금액 3종 + `isViServerMessage` 만 export, 해당 테스트 green.
    - 부재 단언 테스트가 코드 제거 전 RED → 제거 후 GREEN 이었다(SUMMARY 에 기록).
    - webapp typecheck(app + e2e tsconfig) 오류 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: iPhone 종목검색 입력 포커스 확대 방지 — 터치 16px / 마우스 14px (TQR-02)</name>
  <files>webapp/src/components/ui/command.tsx, webapp/src/components/trading/workbench/stock-add-bar.tsx, webapp/e2e/specs/search.spec.ts, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <read_first>
    - webapp/src/components/trading/limit-chaser-form.tsx 1446-1455행 (모바일 16px 정책 주석 — 이 태스크의 정본 근거)
    - webapp/src/components/ui/command.tsx 64-85행 (CommandInput)
    - webapp/src/components/trading/workbench/stock-add-bar.tsx 296-366행 (StockSearchField `<input type="search">` 와 그 위 ★ 주석 — `h-9`↔`top-10` 한 쌍 규율)
    - webapp/e2e/specs/search.spec.ts 1-75행 (describe · mockStockApi beforeEach · 헤더 트리거/⌘K 로 여는 법)
    - webapp/e2e/specs/trading-workbench.spec.ts 118-124행 (`addBox`) · 280-300행 (describe · beforeAll/beforeEach) · 697행 테스트 9
  </read_first>
  <action>
    정책(limit-chaser-form.tsx 모바일 16px 주석): iOS Safari 는 글꼴 16px 미만 입력에 포커스하면 확대하고 되돌리지 않는다. 해결은 **글꼴 16px** 하나이며 viewport 확대 금지 설정은 쓰지 않는다(핀치줌 접근성). `app/layout.tsx` 의 `viewport` 는 건드리지 않는다.

    **브레이크포인트 선택 — 오케스트레이터 예시(`sm:`)와 다르게 간다(플래너 결정):** 뷰포트 폭 브레이크포인트(`sm:` 640 · `md:` 768)는 iPhone **가로 모드**(844~932px)에서 넘어가 14px 로 돌아가므로 가로에서 다시 확대된다. 확대 여부는 폭이 아니라 터치 입력 기기라는 사실에 달려 있으므로 **기본값을 16px 로 두고, 마우스 기기(`pointer-fine:` = `@media (pointer: fine)`)에서만 기존 14px** 로 되돌린다. 포인터를 모르는 환경은 16px(=확대 안 함) 쪽으로 떨어져 안전하고, 데스크톱 화면은 어떤 폭에서도 지금과 픽셀 동일하다. 이 근거를 두 파일 주석과 SUMMARY 에 남긴다.

    - `command.tsx` `CommandInput`: 입력 className 의 `text-sm` 하나를 `text-base pointer-fine:text-sm` 으로 바꾼다(파일 관용 = Tailwind 기본 스케일, 루트 16px 이라 `text-base` = 16px). `CommandEmpty` · `CommandItem` 등 다른 `text-sm` 은 입력이 아니므로 그대로. `<CommandPrimitive.Input` 바로 위에 짧은 주석: iOS 16px 확대 방지 · 기본 16px/마우스만 14px · 뷰포트 브레이크포인트를 쓰지 않는 이유(iPhone 가로 폭) · 정책 정본은 limit-chaser-form.tsx 모바일 16px 주석. 이 한 곳으로 전역 헤더 검색(global-search.tsx)과 테마 편집 「종목 추가」 검색(theme-edit-dialog.tsx)이 함께 고쳐진다 — 두 호출부는 className 을 넘기지 않으므로 수정 불필요.
    - `stock-add-bar.tsx` `StockSearchField` 의 `<input type="search">` className 에서 `text-[length:var(--t-sm)]` 을 `text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-sm)]` 로 바꾼다(파일 관용 = 토큰). 그 위 기존 ★ 주석 블록에 같은 정책 한 단락을 덧붙인다(근거는 command.tsx 주석 참조로 짧게). 높이 `h-9` 는 바꾸지 않는다 — 16px 글꼴은 36px 안에 들어가고 `top-10` 짝 규율도 그대로다. `/trading` 레이아웃은 컨테이너 쿼리지만 이 확대 문제는 기기 성질이라 컨테이너 쿼리가 아니다(globals.css §2.2b 무관).
    - e2e `search.spec.ts`: 기존 `test.describe('Phase 6 — 전역 검색 …')` **안에** 중첩 describe 「입력 글꼴 — iOS 포커스 확대 방지 (quick-260922-tqr)」를 추가해 `mockStockApi` beforeEach 를 물려받게 한다. (a) 기본 Desktop Chrome(pointer fine): `/scanner` 에서 기존 「헤더 트리거 클릭으로도 Dialog 오픈」과 같은 방법으로 다이얼로그를 열고 `getByPlaceholder('종목명 또는 종목코드를 입력하세요')` 가 `toHaveCSS('font-size', '14px')`. (b) 한 겹 더 중첩한 describe 에 `test.use({ hasTouch: true, viewport: { width: 844, height: 390 } })`(iPhone 가로 폭 — sm·md 를 넘는 폭에서도 16px 임을 잠금) 후 같은 입력이 `toHaveCSS('font-size', '16px')`. 그 폭에서 헤더 트리거가 클릭 불가하면 첫 테스트의 ⌘K(`modKey`) 경로로 연다.
    - e2e `trading-workbench.spec.ts`(Task 1 이 먼저 수정한 파일 — 순차): 테스트 9 의 종목 추가 입력 사용 직전에 `await expect(addBox(page)).toHaveCSS('font-size', '14px');` 한 줄(데스크톱 불변 잠금). 메인 describe 끝에 중첩 describe 를 추가해 `test.use({ hasTouch: true, viewport: { width: 844, height: 390 } })` 로 `goto(WORKBENCH_URL)` → `waitForReady` → `addBox(page)` 가 `toHaveCSS('font-size', '16px')`. 파일이 serial 모드이고 relay 픽스처가 메인 describe 의 beforeAll/beforeEach 에 있으므로 반드시 메인 describe 안에 둔다. 844 폭에서 종목 추가란이 보이지 않으면 원인을 SUMMARY 에 적고 390×844 세로로 대체한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/webapp && grep -Fq 'text-base pointer-fine:text-sm' src/components/ui/command.tsx && grep -Fq 'text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-sm)]' src/components/trading/workbench/stock-add-bar.tsx && ! grep -nE "maximumScale|userScalable" src/app/layout.tsx && pnpm --filter @gh-radar/webapp exec vitest --run src/components/search/__tests__/global-search.test.tsx src/components/trading/__tests__/stock-add-bar.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test search</automated>
  </verify>
  <done>
    - Playwright: Desktop Chrome 에서 전역 검색 입력 14px, `hasTouch` 844×390 에서 16px. 작업대 종목 추가란 데스크톱 14px · 터치 16px (trading-workbench 스펙은 plan 검증 단계에서 함께 실행).
    - `app/layout.tsx` viewport 불변(확대 금지 설정 없음).
    - 두 파일에 정책·브레이크포인트 선택 근거 주석.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 체결 테이프 하단 설명 문구 + 상따 카드 중복 캡션 제거, 매수/매도 판정 유지 (TQR-03)</name>
  <files>webapp/src/components/orderbook/trade-tape.tsx, webapp/src/components/trading/card/card-body.tsx, webapp/src/components/orderbook/__tests__/trade-tape.test.tsx</files>
  <read_first>
    - webapp/src/components/orderbook/trade-tape.tsx (헤더 21-28행 · 상수 60-69 · compact prop 문서 80-91 · TapeSidesResult 170-176 · tapeSidesOf 178-208 · 컴포넌트 useMemo 235-240 · 루트 div 326-333 · 하단 p 460-470)
    - webapp/src/components/trading/card/card-body.tsx 312-334행
    - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx 75-175행 · 270-290행 · 370-395행
  </read_first>
  <behavior>
    - ⑫ 서버 체결구분 전부 제공: 수량 셀 색/sr-only 가 서버값(1=매도 down, 2=매수 up)을 따르고, 테이프에 설명 문구(/체결구분/ · /추정/ 텍스트)가 없다.
    - ⑬ 혼합(서버 '1' + 미상 ''@ASK1, bestAsk=ASK1): 0행 매도(down · sr-only 매도), 1행은 추정으로 매수(up · sr-only 매수), 설명 문구 없음.
    - ⑧ 전부 미상(`tape([98_200])`): 수량 셀 sr-only 가 `deriveTapeSides(entries)[0]` 매핑(B→매수, S→매도)과 같고 설명 문구 없음.
    - compact: 핀 버튼 · 수량 sr-only 는 남고 설명 문구 없음.
    - ⓪-1 전부 서버값이면 추정 함수 호출 0회, ⓪-3 미상 섞이면 정확히 1회 — 추정 게이트 유지 증명.
  </behavior>
  <action>
    **먼저 테스트를 바꿔 RED 를 본 뒤 코드를 지운다.**

    (A) `trade-tape.test.tsx`
    - ⓪-1 · ⓪-3: 반환 객체의 폴백 여부 필드 단언 줄만 지운다. 추정 함수 spy 단언(호출 0회 / 1회)은 그대로 — 이것이 「전부 서버값이면 추정을 돌리지 않는다」의 실제 증명이다.
    - ⑫: 제목을 「… 수량 색·sr-only 가 서버값을 따르고, 하단 설명 문구는 없다 (D-10)」로. 색·sr-only 단언은 유지하고, 문구 존재 단언 2줄을 `expect(screen.queryByText(/체결구분/)).toBeNull()` · `expect(screen.queryByText(/추정/)).toBeNull()` 로 교체.
    - ⑬: 문구만 보던 테스트를 behavior 의 혼합 케이스 판정 단언(0행 down+매도, 1행 up+매수) + 문구 부재로 다시 쓴다. 제목 「체결구분 없는 체결이 섞이면 그 행만 추정으로 칠하고, 설명 문구는 없다 (D-10)」.
    - ⑧: 전부 미상 픽스처의 수량 셀 sr-only 가 `deriveTapeSides` 결과 매핑과 같다는 단언 + 문구 부재로 다시 쓴다. 제목 「서버가 `bs` 를 주지 않은 체결은 추정으로 칠하고, 설명 문구는 없다」.
    - compact 테스트(「compact 에서도 핀 버튼 · 수량 sr-only · 하단 고지 라벨이 전부 남는다」): 제목에서 고지 라벨을 빼고 「(하단 설명 문구는 없다)」를 붙이며, 문구 존재 단언을 부재 단언으로 교체. 핀 버튼·sr-only 단언은 유지.
    - 이 시점에 ⑫ ⑬ ⑧ compact 가 RED 여야 한다.

    (B) `trade-tape.tsx`
    <!-- planner-discipline-allow: SIDE_NOTE -->
    - 하단 고지 문구 상수 2개(`SIDE_NOTE_SERVER`, `SIDE_NOTE_FALLBACK`)와 JSDoc 삭제.
    - 컴포넌트 끝의 설명 `<p>` 와 그 위 설명 주석 블록 삭제. 루트 div(`flex min-w-0 flex-col`)에 이 문단만을 위한 클래스가 없는지 확인(플래너 확인: 없음).
    - `useMemo` 구조분해를 `{ sides }` 만 받도록 바꾼다.
    - `TapeSidesResult` 에서 폴백 여부 필드를 삭제하고 `tapeSidesOf` 반환을 `{ sides }` 로. **단 `tapeSidesOf` 내부의 폴백 필요 여부 로컬 불리언(추정 함수를 한 번만/아예 안 부르는 게이트)은 그대로 둔다** — 이것이 매수/매도 판정 자체다. 반환 필드는 설명 문구가 유일한 소비처였으므로 함께 없앤다(죽은 API 방지).
    - 주석 정리: 헤더 ★ 구분 출처 단락의 「하단 고지는 실제로 쓴 근거를 말한다」 하위 불릿 삭제, `compact` prop 문서의 「그대로 남는 것」 목록에서 하단 고지 라벨 삭제, `tapeSidesOf` JSDoc 에서 「추정을 쓰지 않았다가 고지 문구의 근거」 절 삭제, `TapeSidesResult` JSDoc 을 현재 필드에 맞게. 주석에 설명 문구 원문을 인용하지 않는다(아래 grep 게이트).
    - sr-only 매수/매도(WCAG 1.4.1 유일한 비색 경로)와 수량 색은 절대 건드리지 않는다.

    (C) `card-body.tsx`: `card-body-orderbook` 안 `OrderbookLadder` 아래의 설명 주석 블록과 `@min-[830px]/lc:block` 캡션 `<p>` 를 통째로 삭제. 다른 것은 그대로.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && ! grep -rnE "SIDE_NOTE|체결구분 기준|추정했어요" webapp/src --exclude-dir=__tests__ && ! grep -n "usedFallback:" webapp/src/components/orderbook/trade-tape.tsx && ! grep -rn "\.usedFallback" webapp/src && pnpm --filter @gh-radar/webapp exec vitest --run src/components/orderbook/__tests__/trade-tape.test.tsx src/components/trading/__tests__/card-body.test.tsx src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx src/components/stock/__tests__/orderbook.test.tsx && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>
    - 체결 테이프(일반·compact)와 상따 카드 호가 칼럼에 수량 색 설명 문구 0.
    - 수량 색 · sr-only 매수/매도 · 추정 게이트(호출 0회/1회) 테스트 green — 판정 커버리지 감소 없음.
    - ⑫ ⑬ ⑧ compact 가 코드 제거 전 RED → 후 GREEN 이었다(SUMMARY 기록).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 localStorage | 제거된 VI 알림 설정 키가 사용자 브라우저에 남는다 — 앱이 더 이상 읽지 않는다 |
| 브라우저 Notification API | 제거로 권한 요청·알림 표면이 사라진다 (공격면 축소) |
| relay → 화면 (체결구분 `bs`) | 매수/매도 색·sr-only 는 트레이더 판단 입력 — 판정 로직 훼손 시 오판·오주문 유발 |
| 사용자 입력 → VI 주문 금액(만원→원) | 금액 변환 유틸이 같은 파일에 남는다 — 실수로 지우거나 바꾸면 1만 배/1만분의 1 주문 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-tqr-01 | Tampering | `vi-alert.ts` 정리 중 `manwonToKrw`/`krwToManwon`/`MAX_VI_ORDER_AMOUNT_MANWON` 훼손 | high | mitigate | Task 1: 지우기 전 심볼별 grep, 남길 목록 명시, `vi-alert.test.ts` 금액 describe 유지 + `vi-settings-rows.test.tsx` 실행, typecheck 로 소비처 컴파일 확인 |
| T-tqr-02 | Spoofing | `isViServerMessage` 훼손 시 남의 거부를 VI 몫으로 그림 (Pitfall 9) | high | mitigate | Task 1: 함수·JSDoc 보존, isViServerMessage describe + `strategy-log.test.tsx` 실행 |
| T-tqr-03 | Tampering | 체결 테이프 매수/매도 판정(추정 게이트) 훼손 → 색 오표시 | high | mitigate | Task 3: 내부 게이트 불리언 유지 명시, ⓪-1/⓪-3 spy 단언 유지, ⑬ ⑧ 을 판정 단언으로 재작성해 커버리지 유지 |
| T-tqr-04 | Denial of Service (접근성) | viewport 확대 금지로 핀치줌 차단 | medium | mitigate | Task 2: 16px 글꼴로만 해결, `app/layout.tsx` viewport 에 확대 금지 키가 없음을 grep 게이트로 확인 |
| T-tqr-05 | Information Disclosure | 잔존 localStorage 키 `gh-radar:vi-alert` | low | accept | 값은 on/off 뿐이고 민감정보 없음 · 서버 미전송 · 앱이 읽지 않음 — 마이그레이션 불필요 |
</threat_model>

<verification>
전 태스크 완료 후 plan 게이트 (webapp 기준선: 18-36 시점 vitest 1472 pass / 1 skip · Playwright 전체 143 pass / 9 skip):

1. `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck` — app + e2e tsconfig 오류 0. (`@gh-radar/shared` dist 누락 오류가 나면 앞에 `pnpm --filter @gh-radar/shared build &&` 를 붙여 재실행)
2. `pnpm --filter @gh-radar/webapp run test` — 전체 vitest green. 테스트 수 변화(삭제된 VI 알림 테스트만큼 감소)를 SUMMARY 에 수치로 기록.
3. `cd /Users/alex/repos/gh-radar/webapp && pnpm exec eslint src/components/trading/workbench/workbench-status-bar.tsx src/components/trading/workbench/trading-workbench.tsx src/lib/vi-alert.ts src/lib/alert-tone.ts src/lib/breakout-list.ts src/components/trading/workbench/vi-settings-rows.tsx src/components/ui/command.tsx src/components/trading/workbench/stock-add-bar.tsx src/components/orderbook/trade-tape.tsx src/components/trading/card/card-body.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/vi-settings-rows.test.tsx src/lib/__tests__/vi-alert.test.ts src/components/orderbook/__tests__/trade-tape.test.tsx e2e/specs/search.spec.ts e2e/specs/trading-workbench.spec.ts` — 오류 0 (unused import 포함).
4. `cd /Users/alex/repos/gh-radar/webapp && pnpm exec playwright test trading-workbench orderbook search` — 0 fail. dev 서버는 playwright webServer 가 PORT=3100 으로 띄운다(dev.sh 와 동일 · 3000 가정 금지). relay 는 spec 픽스처가 8090 에 띄운다. pass/skip 수를 SUMMARY 에 기록.
5. 잔재 grep (제품 코드):
   `! grep -rnE "마감알림|useViEndAlerts|use-vi-end-alerts|SIDE_NOTE|체결구분 기준" webapp/src --exclude-dir=__tests__` → 출력 없음.
6. 시각 확인(선택, 가능하면): 3100 dev 에서 `/trading` 상태줄 알림 묶음에 알림음 하나 · 호가 탭 체결 테이프 하단 문구 없음 · 상따 카드 3단 밴드(본문 ≥830) 캡션 없음. 손보는 표면의 줄바꿈·잘림·겹침 결함이 보이면 바로 고치고 한 줄 보고.
</verification>

<success_criteria>
- TQR-01: VI 마감알림 토글·훅·알림 전용 유틸 0, 금액 변환·통지 몫 판정 불변, 관련 vitest/e2e 가 부재를 단언.
- TQR-02: 터치 16px / 마우스 14px 가 Playwright computed style 로 증명됨(전역 검색 + 작업대 종목 추가), viewport 불변.
- TQR-03: 설명 문구 2곳 제거, 매수/매도 판정 커버리지 유지.
- typecheck · 전체 vitest · eslint(변경 파일) · Playwright(trading-workbench · orderbook · search) 전부 green.
</success_criteria>

<output>
Create `/Users/alex/repos/gh-radar/.planning/quick/260922-tqr-workbench-ui-cleanup/260922-tqr-SUMMARY.md` when done — 태스크별 RED→GREEN 기록, 테스트 수 전후, 브레이크포인트 선택 근거(`pointer-fine:` vs `sm:`), Playwright 결과 포함.

커밋 규칙:
- 커밋 메시지는 **한글**, `Co-Authored-By` 넣지 않는다. 커밋 전에 메시지를 사용자에게 보여주고 확인받는다(사용자 전역 규칙).
- `git add` 직전 `git status`·`git log -1` 재확인 후 **명시 경로만** stage 한다 — `git add -A` 금지 (작업트리에 이 작업과 무관한 `.planning/state.json` 변경이 이미 있고, 동시 세션 커밋 경합 이력 있음). 훅 파일 삭제는 `git rm` 으로 stage.
- **push 하지 않는다.** master 가 origin 보다 49 커밋 앞서 있고 Phase 18 relay(R2~R4)가 미배포다. push 는 곧 webapp 프로덕션 배포라 배포 순서(relay → 검증 → webapp push)를 깬다. push 여부·시점은 사용자 결정으로 넘긴다(사용자 전역 규칙 「커밋 후 push」와 충돌하므로 오케스트레이터가 사용자에게 명시).
</output>
