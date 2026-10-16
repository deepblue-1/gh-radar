---
phase: 32-account-axis
plan: 04
subsystem: ui
tags: [react, nextjs, playwright, vitest, trading-workbench, account-axis, toast]

requires:
  - phase: 32-account-axis
    provides: "32-01 — accountFullLabelOf(D-12) · 32-03 — 상단 줄 A(WorkbenchStatusBar 안 AccountPill · accounts/accountNo/onAccountChange)"
  - phase: 18
    provides: "CardGrid ⑤ 고정 호스트 + 자리표 ref 포털(카드 마운트 유지) · ?focus= 마운트 1회 소비 · 사이드바 포커스 요청"
  - phase: quick-260923-pgu
    provides: "AlertToasts · cardForAlert · openAlert · TradingAlert.accountNo(카드 매칭)"
provides:
  - "CardGrid hiddenIds — 숨은 카드 자리표를 hidden card-parking 에 둔다(포털 전수 · 언마운트 없음) · 빈 상태 판정 = 보이는 카드 0"
  - "CARD_GRID_ACCOUNT_EMPTY_HEADING 「이 계좌에 거래할 종목이 없어요」 · cardGridAccountEmptyBody(n)"
  - "useCardInScope() / CardInScopeContext(기본 true) — 숨은 카드의 넘버패드 시트 · 인라인 편집(취소 경로) · 실패 말풍선이 스스로 닫힌다"
  - "inAccountScope(cards, scope) · isinFocusCardOf(cards, isin, scope?) — export 순수 함수(종목 단위 경로 고른 계좌 한정)"
  - "cardForAlert(cards, alert, currentAccountNo) — 계좌 우선(정확 일치 → 우선 계좌 → 종전 폴백)"
  - "작업대 visibleCards · hiddenCardIds · scopedViOrders · 프로그램 전환 3경로(?focus= · 포커스 요청 · 토스트) = pickAccount"
  - "ACCOUNT_PILL_TITLE 「작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요」"
  - "AlertToasts({ alerts, onOpen, onDismiss, accounts, currentAccountNo }) — data-part account · account-hint"
  - "E2E P32-scope · P32-focus · P32-toast"
affects: [32-05, 32-10, 32-12]

actuals:
  tokens: 14200
  tasks: 3
  commits: 5
plan_head_before: 5988c8224fc066dfa44c5b1a7311f4dc1a23c5e3
plan_head_after: 576ed1df139a06f9f9418720de4fd029fbfb6564

tech-stack:
  added: []
  patterns:
    - "숨김 = 주차 — 자리표를 hidden 노드로 옮길 뿐 포털은 전수(마운트 · 에코 · 더티 · 잠금 보존). 판정 축 셋: 표시 · 빈 상태 · ✕ 포커스 = 보이는 카드 / 호스트 정리 = 전 카드 / 포털 = 전 카드"
    - "body 포털 UI(시트 · 말풍선)와 포커스 쥔 입력은 컨텍스트(useCardInScope)로 「범위 밖」 을 알고 스스로 닫는다 — 기본값 true 라 CardGrid 밖은 무영향"
    - "프로그램 계좌 전환은 pickAccount 하나 + shouldSwitchTo 가드(대상 ≠ 지금 ∧ accounts[] 안) — setAccountNo 단독 금지(저장값이 되돌린다)"
    - "종목 단위 경로는 scopeAccountRef(업데이터 · 안정 콜백) · 전략 키 충돌 판정만 전수"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/card-grid.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/alert-toasts.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/components/trading/lc/inline-value-editor.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/lib/trading-alerts.ts
    - webapp/src/components/trading/__tests__/card-grid.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/components/trading/__tests__/alert-toasts.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - .planning/phases/32-account-axis/32-04-PLAN.md

key-decisions:
  - "스코프 값 하나(scopeAccount) — accountNo 가 있고 accounts[] 가 비지 않을 때만 그 계좌, 아니면 \"\"(거르지 않음). 격자 표시 · 종목 단위 경로 · 「이미 카드 있음」 이 같은 inAccountScope 를 쓴다"
  - "프로그램 전환은 대상 계좌가 accounts[] 안일 때만 — 목록 밖 계좌로 바꾸면 셀렉트에 옵션이 없어 화면 계좌와 스코프가 갈린다(그때는 카드가 숨은 채)"
  - "cardForAlert 우선 계좌 = 알림 계좌 ?? 지금 계좌 — ① (ISIN · 계좌 · 거래소) 정확 일치 ② 우선 계좌 안 (ISIN · 거래소) 펼침 우선 → 그 계좌 ISIN ③ 종전 폴백(전 계좌)"
  - "넘버패드 시트는 반영 중(busy)이어도 범위 밖이면 닫는다 — 전송은 이미 나갔고 결과는 행 · 에코가 말한다. 숨은 카드 시트가 다른 계좌 화면을 덮지 않게"
  - "인라인 편집은 settledRef · leftRef 를 먼저 세운 뒤 onCancel — 숨김이 만드는 늦은 blur 가 저장(blur = 저장)으로 새지 않는다"
  - "실패 말풍선(FailureBubble)은 상태를 지우지 않고 open && inScope 로 숨은 동안만 닫는다 — 다시 보이면 돌아온다"
  - "cardFeeds(돌파 구독 예산)는 전 카드 그대로 — 숨은 카드도 구독을 유지한다(Pitfall 9)"
  - "AlertToasts 의 accounts · currentAccountNo 는 필수 prop — 소비처가 작업대 하나라 기본값으로 숨기지 않았다(기존 단위 테스트 12 렌더에 명시)"

patterns-established:
  - "다계좌 E2E 는 respondLoginWithAccounts 로 늘리고, describe beforeEach 가 respondLogin({ success: true }) 로 한 계좌로 되돌린다(reset() 이 로그인 응답을 되돌리지 않는다)"

requirements-completed: [AXIS-01]

coverage:
  - id: D1
    description: "(트레이서 · D-01) 셀렉트 계좌 → 격자는 그 계좌(+ 계좌 공란) 카드만 · 다른 계좌 카드는 card-parking 주차(언마운트 없음 · 입력값 보존) · VI 스트립 칩 계좌 필터 · 계좌 빈 상태 문구"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-grid.test.tsx#P32 계좌 스코프 숨김 주차 (D-01 · Pattern 2) (7)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P32-scope"
        status: pass
    human_judgment: false
  - id: D2
    description: "(Pitfall 5) ?focus= · 사이드바 포커스 요청 · 토스트 탭이 pickAccount 로 작업대 계좌를 바꾸고 저장 — 새로고침해도 그 계좌"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#P32 계좌 전환 경로 · 종목 단위 스코프 (Pitfall 5 · 6) (8)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P32-focus"
        status: pass
    human_judgment: false
  - id: D3
    description: "(Pitfall 6) 종목 추가 · 보유 행 · 돌파 · 「이미 카드 있음」 · 종목 단위 포커스가 고른 계좌 카드만 — 다른 계좌 숨은 카드를 펼치지 않고 새 카드"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#종목 추가 — 같은 종목 카드가 다른 계좌에만 있으면 … 새 카드 · isinFocusCardOf · cardForAlert"
        status: pass
    human_judgment: false
  - id: D4
    description: "(D-01 · S2) 전환 때 숨는 카드의 넘버패드 시트 · 인라인 편집(전송 없음) · 실패 말풍선 닫힘 · 카드 상태 보존"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-grid.test.tsx#P32 계좌 전환 때 숨는 카드의 편집 UI 닫기 (D-01 · S2 · useCardInScope) (3)"
        status: pass
      - kind: e2e
        ref: "trading-workbench.spec P20-2 · P20-4 · P20-5 터치 시트(LcSheetShell 회귀) 단독 재실행"
        status: pass
    human_judgment: false
  - id: D5
    description: "(D-03 · S4) 토스트 계좌 줄 「계좌 {전체 라벨}」 · 목록 밖 번호만 · 돌파 줄 없음 · 다른 계좌면 「이 계좌 보기 ›」 · 누르면 그 계좌로 바뀌고 카드로"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/alert-toasts.test.tsx#P32 토스트 계좌 줄 (D-03 · S4) (6)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P32-toast"
        status: pass
    human_judgment: false
  - id: D6
    description: "셀렉트 title 새 문구(S1) · VI 설정 행 무변경(D-16)"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#AccountPill — 작업대에 보일 계좌 (Phase 32 D-01 · S1)"
        status: pass
      - kind: other
        ref: "grep -c ViSettingsRows trading-workbench.tsx = 2(전과 같음)"
        status: pass
    human_judgment: false
  - id: D7
    description: "S2 · S4 시각(계좌 빈 상태 상자 · 토스트 계좌 줄 11px · 힌트 primary 정렬 · 두 줄 줄바꿈) — 목업 대비"
    verification:
      - kind: e2e
        ref: "a11y.spec 13/13(/trading 포함)"
        status: pass
    human_judgment: true
    rationale: "목업 대비 시각 판정(줄 간격 · 힌트 오른쪽 끝 정렬 · break-keep 두 줄 모양)은 사람 몫(UI 리뷰)"

duration: 27min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 04: 작업대 계좌 스코프 · 전환 경로 · 토스트 계좌 줄 Summary

**작업대 상단 줄 계좌가 화면 범위가 됐다 — 다른 계좌 카드는 언마운트 없이 hidden 주차 노드로 빠지고(VI 스트립도 계좌 필터), `?focus=` · 사이드바 · 토스트 세 경로가 `pickAccount` 로 계좌를 바꾸며, 종목 단위 경로는 고른 계좌 카드만 보고, 토스트는 전 계좌 알림에 「계좌 {전체 라벨}」 · 「이 계좌 보기 ›」 를 단다(AXIS-01 · D-01 · D-03 · Pitfall 5 · 6).**

## Performance

- **Duration:** 약 27분(벽시계 측정값)
- **Started:** 2026-10-16T05:35:43Z
- **Completed:** 2026-10-16T06:02:25Z
- **Tasks:** 3
- **Files modified:** 14 (소스 8 · 테스트 5 · PLAN 1 — 생성 0)

## Accomplishments
- `CardGrid hiddenIds` — 숨은 카드의 자리표를 격자 밖 `<div hidden data-slot="card-parking">` 에 두어 기존 자리표 ref 가 호스트를 그리로 옮긴다. 포털은 전수라 마운트 · 더티 · 결과 모름 잠금이 그대로다. 호스트 정리는 전 카드 기준이고, ✕ 뒤 포커스는 보이는 순서만 본다(숨김만으로는 포커스를 옮기지 않는다)
- 빈 상태 판정 = 보이는 카드 0. 숨은 카드 N 장이면 「이 계좌에 거래할 종목이 없어요」 + 「…다른 계좌 카드 N장은 계좌를 바꾸면 보여요」, 전 카드 0 이면 종전 문구
- 작업대 `visibleCards`(`inAccountScope` — 계좌 미정이면 거르지 않음) · `hiddenCardIds` · `scopedViOrders`(「미확인 n」 도 그 목록으로 셈)
- 프로그램 전환 3경로 — `?focus=` 소비 · `useTradingFocusRequest` · `openAlert` 가 `shouldSwitchTo`(대상 ≠ 지금 ∧ `accounts[]` 안) 뒤 `pickAccount`. 바꾼 계좌가 기억 계좌다(새로고침 유지 · E2E)
- 종목 단위 경로 고른 계좌 한정 — `isinFocusCardOf(cards, isin, scope)` · `focusCard` · `ensureIsinCard`(종목 추가 · 보유 행 · `?code=` · 이벤트) · 돌파 행(`openBreakoutCard`) · `cardIsins`. 거래소 전환 충돌 판정(`changeExchange`)만 전수
- `cardForAlert(cards, alert, currentAccountNo)` — 계좌 우선
- `CardInScopeContext` / `useCardInScope()` — `LcSheetShell`(넘버패드 · 3택 시트 공용 껍데기) · `InlineValueEditor`(취소 경로 · 전송 0) · `FailureBubble`(숨은 동안만 닫힘)
- `ACCOUNT_PILL_TITLE` = 「작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요」
- `AlertToasts` 계좌 줄(`account` 파트 · 11/400 `--muted-fg` · `break-keep`) + 힌트(`account-hint` · 11/600 `--primary` · `whitespace-nowrap` · `›` aria-hidden). 계좌 줄은 본문 버튼 안이라 접근 이름에 들어간다. `TradingAlert.accountNo` 주석 「카드 매칭 + 토스트 계좌 줄 표시(Phase 32 D-03 …)」
- E2E `P32-scope` · `P32-focus` · `P32-toast` 신규 — describe `beforeEach` 가 로그인 응답을 한 계좌로 되돌린다

## Task Commits

1. **Task 1 (tracer): 계좌 스코프 한 경로** — `2c658088` (feat). 트레이서 게이트(end-of-phase · automated-only `<verify>`): card-grid vitest 26/26 · E2E `P32-scope` 1 passed 재실행 통과 → 확장
2. **Task 2: 프로그램 전환 3경로 · 종목 단위 스코프 · 전환 때 닫기 · title** — RED `750fa853` (test) → GREEN `93183978` (feat)
3. **Task 3: 토스트 계좌 줄** — RED `10afe5aa` (test) → GREEN `576ed1df` (feat)

`commits: 5` = `git rev-list --count 5988c822..576ed1df`(전부 32-04 커밋 · SUMMARY 커밋 전).

## TDD Gate Compliance

플랜 `type: execute` 이고 Task 2 · 3 만 `tdd="true"` 다. 두 태스크 모두 `test(32-04)` → `feat(32-04)` 순서로 커밋됐다. REFACTOR 커밋은 없다. TAP 분류기(`check tdd-red-evidence`)는 돌리지 않았다 — 아래 의미 판정만 기록한다(32-01 ~ 32-03 과 같은 처리).

- **Task 2 RED** (`750fa853`): 대상 11건 실패. 10건은 계획한 단언에서 실패했다 — 셀렉트 값 `'37728502101'`≠B ×3(?focus= · 포커스 요청 · 토스트), `cardForAlert` 결과 `'bx'`≠`'an'`/`'ax'` ×2, 종목 추가 결과 키 집합 불일치, title 문자열 불일치, 시트 1개 남음, 인라인 입력 남음, 말풍선 2개 남음. 1건은 `TypeError: isinFocusCardOf is not a function` 이다 — 계획한 export 가 아직 없어서다(픽스처 · 문법 오류 아님). 「계좌를 바꾸면 그 계좌 기준」 1건은 RED 에서 이미 통과했다(Task 1 스코프 위의 회귀 고정).
- **Task 2 GREEN** (`93183978`): 3 파일 217/217. 첫 GREEN 실행에서 인라인 테스트 1건이 실패했는데 원인은 테스트 설계였다 — 편집기 둘을 열면 B 의 blur 가 저장(D-14)해서 공용 spy 를 불렀다. 편집기 하나만 여는 테스트로 고쳐 GREEN 에 넣었다. 옛 title 단언 2곳도 교체했다.
- **Task 3 RED** (`10afe5aa`): 대상 5건 실패. 전부 `account` 파트가 없어서다(`expected null not to be null` · null 의 `textContent` · 접근 이름 매칭 실패). 「돌파 = 줄 없음」 1건은 이미 통과했다(회귀 고정).
- **Task 3 GREEN** (`576ed1df`): alert-toasts 22 · trading-alerts 36 · trading-workbench 통과(3 파일 196/196).

## Decisions Made
- 스코프 값은 `scopeAccount` 하나다. 계좌 미정(`accountNo` 공란 ∨ `accounts[]` 빈 목록)이면 `""` 로 거르지 않는다(S2 loading). 표시 · 종목 단위 · 「이미 카드 있음」 이 같은 `inAccountScope` 를 쓴다.
- 프로그램 전환은 대상 계좌가 `accounts[]` 안일 때만 한다. 목록 밖 계좌로 바꾸면 셀렉트 옵션과 스코프가 갈리므로, 그때는 카드가 숨은 채 둔다. 토스트 힌트도 같은 조건이다(S4 「목록 밖 = 힌트 없음」 과 일치).
- 넘버패드 시트는 `busy` 여도 범위 밖이면 닫는다. 인라인 편집은 `settledRef` · `leftRef` 를 먼저 세운 뒤 `onCancel` 을 부른다. 실패 말풍선은 `open && inScope` 로 숨은 동안만 닫는다.
- `cardFeeds`(돌파 구독 예산)는 전 카드로 둔다(Pitfall 9 — 숨은 카드도 구독 유지).
- 카드 안 다른 포털 조사 결과는 이렇다. `card-log-popups` LogDialog · 수동주문 `OrderConfirmDialog` · `StockInfoModal`(작업대 소유)은 모달이라, 열려 있는 동안 셀렉트 · 토스트 · 사이드바를 누를 수 없다(전환 경로 없음). 그래서 손대지 않았다. `latch-led` Tooltip 은 호버 일시 표시라 손대지 않았다. `FailureBubble`(비모달 Popover · 실패 문구가 남는다)만 같은 훅으로 닫았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합 · 플랜 지시] 실패 말풍선(FailureBubble)도 숨은 카드에서 닫기 — 선언 밖 파일 추가**
- **Found during:** Task 2
- **Issue:** `lc/setting-group.tsx` `FailureBubble` 은 비모달 Radix Popover(body 포털)다. 반영 실패 문구가 있으면 카드를 주차해도 앵커 없이 화면에 남는다.
- **Fix:** `open && useCardInScope()` 로 숨은 동안만 닫는다(문구 상태는 그대로 · 다시 보이면 돌아온다). 플랜 지시대로 `files_modified` 와 Task 2 `<files>` 에 `setting-group.tsx` 를 추가했다.
- **Files modified:** webapp/src/components/trading/lc/setting-group.tsx · .planning/phases/32-account-axis/32-04-PLAN.md
- **Verification:** card-grid 「카드 실패 말풍선 … 다시 보이면 돌아온다」
- **Committed in:** `93183978`

**2. [Rule 3 - Blocking] E2E 로그인 응답 누수 차단**
- **Found during:** Task 1
- **Issue:** `relay.reset()` 은 로그인 응답(계좌 목록)을 되돌리지 않는다. 그래서 P32 다계좌 케이스 뒤의 케이스가 두 계좌로 시작한다.
- **Fix:** describe `beforeEach` 에 `relay.gateway.respondLogin({ success: true })` 를 넣었다(기본 한 계좌).
- **Files modified:** webapp/e2e/specs/trading-workbench.spec.ts
- **Committed in:** `2c658088`

**3. [Rule 1 - 테스트] Playwright `selectOption` 은 포커스를 주지 않는다**
- **Found during:** Task 1
- **Issue:** 「셀렉트로 바꾸면 포커스는 셀렉트에」 단언이 실패했다. 도구가 포커스 없이 값을 바꾸기 때문이다(실사용과 다름).
- **Fix:** `account.focus()` 뒤 `selectOption` 을 하고, 전환이 포커스를 옮기지 않는지 단언한다.
- **Committed in:** `2c658088`

**4. [수용 기준 문자 그대로 미달 · 의도 충족] `grep -c "pickAccount("` = 3 (기준 ≥ 4)**
- 기준이 센 다섯 자리(정의 · 셀렉트 · `?focus=` · 포커스 요청 · 토스트)는 전부 `pickAccount` 를 지난다. 다만 정의는 `const pickAccount = useCallback(`, 셀렉트는 `onAccountChange={pickAccount}` 라서 `pickAccount(` 패턴에 걸리지 않는다. 호출 3곳(778 · 826 · 1243)은 패턴에 걸린다. 주석으로 개수를 채우지 않았다.

**5. [Rule 3 - 타입] `AlertToasts` 새 필수 props → 기존 단위 테스트 12 렌더에 `accounts={[]} currentAccountNo=""`**
- **Committed in:** `576ed1df`

---

**Total deviations:** 5건(Rule 2 ×1 · Rule 3 ×2 · Rule 1 ×1 · 기준 문자 미달 1)
**Impact on plan:** 범위 확장은 없다. `FailureBubble` 은 플랜이 미리 허락한 「카드 안 다른 팝오버」 경로다. `trading-alerts.test.ts` 에는 「계좌번호를 표시하지 않는다」 류 단언이 없어서 고치지 않았다(동작 변경 없음 · 주석만).

## Issues Encountered
- **trading-workbench P31-3(폰 시트 환산 · 비교가 0 에코 아래 줄 「777주」) 실패 — 기존 결함 · 범위 밖(deferred-items.md 32-03 항목 그대로).** 32-04 전체 실행에서 같은 자리 · 같은 값으로 실패했다. 이 플랜은 `LcSheetShell` 을 바꿨다. 그래서 같은 터치 시트 묶음 P20-2 · P20-4 · P20-5 를 단독으로 다시 돌렸고 4 passed(셋업 포함)다. serial 로 미실행된 뒤 3 describe(비로그인 `?code=` · 회선 단절 · 시세 끊김)도 단독 재실행해 통과했다.
- 첫 P32-scope 재실행 1회는 webServer 120초 타임아웃(`module-not-found` — 동시 세션의 `.next` 재빌드로 추정)으로 끝났고, 다음 실행에서 통과했다(일시적).

## Verification
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — exit 0 · error TS 0
- `vitest run src/components/trading src/lib --maxWorkers=2` — 99 files · 3134 passed · 1 skipped · FAIL 0 · `src/components/me` 69 passed
- `playwright … trading-workbench.spec.ts a11y.spec.ts` — 93 passed · 1 failed(P31-3 기존 결함) · 3 미실행 → 단독 재실행 통과(P20-2/4/5 · 뒤 3 describe)
- `playwright … order-log.spec.ts unfilled-progress.spec.ts` — 20 passed
- E2E `P32-top` · `P32-scope` · `P32-focus` · `P32-toast` — 전부 통과
- 수용 grep: `data-slot="card-parking"` 1 · `CARD_GRID_ACCOUNT_EMPTY_HEADING` 2 · `hiddenIds={hiddenCardIds}` 1 · `scopedViOrders` 2 · `ViSettingsRows` 2(전과 같음) · title 문구 1 · `cardForAlert(` 시그니처에 `currentAccountNo` · `pickAccount(` 3(위 편차 4) · `data-part="account"` 1 · `data-part="account-hint"` 1 · `accountFullLabelOf(` 1 · `Phase 32 D-03` 1
- 「P32 계좌 스코프」 it 7 · 「P32 계좌 전환 경로」 it 8 · 「P32 계좌 전환 때 … 닫기」 it 3 · 「P32 토스트 계좌 줄」 it 6 — 전부 passed

## Known Stubs
없음.

## User Setup Required
None.

## Next Phase Readiness
- 32-05(사이드바 계좌 묶음)는 이 플랜의 포커스 경로를 그대로 쓴다. 전략 줄 클릭 → `requestTradingFocus` 가 작업대 계좌를 그 전략 계좌로 바꾼다(목록 안 계좌일 때).
- VI 설정 행(`ViSettingsRows`)은 손대지 않았다(D-16 · 웨이브 ④ 32-12).
- push · 배포하지 않았다(커밋은 로컬 master).

## Self-Check: PASSED
- FOUND: card-grid.tsx · trading-workbench.tsx · alert-toasts.tsx · setting-group.tsx · number-pad-sheet.tsx · inline-value-editor.tsx · workbench-status-bar.tsx · trading-alerts.ts
- FOUND commits: 2c658088 · 750fa853 · 93183978 · 10afe5aa · 576ed1df (HEAD 조상)
