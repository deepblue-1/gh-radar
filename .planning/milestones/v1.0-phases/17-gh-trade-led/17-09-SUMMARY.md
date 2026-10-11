---
phase: 17-gh-trade-led
plan: 09
subsystem: ui
tags: [webapp, react, orderbook, unfilled, cancel, shared-helper, tdd, a11y]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 `sideDisplayText(side, orderNo, pendingStatus, board)` — 접미 **누적** 규칙표(C# `NotificationHub.cs:172` 동형)"
  - phase: 17-gh-trade-led
    provides: "17-02 가 브라우저까지 결선한 미체결 5필드(`orderTime`·`queuedStatus`·`pendingStatus`·`board`·`pendingCancelSent`)"
  - phase: 17-gh-trade-led
    provides: "17-06 의 현재 `vi-client.tsx`(거래소별 `viTriggers` · `vi-last-notice` 줄) · 17-08 의 「서버 진실을 재계산하지 않는다」 웹 표면 선례"
provides:
  - "`sideDisplayText` 의 **첫 화면 소비처** — `UnfilledView.sideText` 한 자리에서 만들어 표·카드 두 벌이 같은 문자열을 쓴다"
  - "`SideTag(side, text, muted)` — 라벨을 조립하지 않고 **받아 그리는** 표식 컴포넌트 (`data-slot=\"account-unfilled-side\"`)"
  - "`StatusNotes(texts)` — 서버 상태 문구 보조 줄. **어느 필드인지 모르는** 문자열 배열만 받아 문구 분기를 설계로 차단 (`data-slot=\"account-unfilled-note\"`)"
  - "취소보관 행 규칙: `pendingCancelSent` 하나로 회색 + 취소 버튼 숨김. **개별(account-panel) · 전체(vi-client) 두 경로 동일 식**"
  - "자동 게이트 3종: 두 파일 접미 리터럴 0 · `pendingStatus` 조건식 0 · 문구 가공(`.slice`/`.replace`/`.split`) 0"
  - "실측 확정: VI 화면은 자기 미체결 표를 그리지 않는다 — `panelAccount` 를 `AccountPanel` 에 위임한다(표식 생성 자리 1곳)"
affects: [17-10, 17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 7559
  tasks: 3
  commits: 6
plan_head_before: 5bac27947908b8c8d5f23644d0145c05185c8671

tech-stack:
  added: []
  patterns:
    - "표시 문자열의 주인은 **shared 순수함수 하나**다 — 화면 컴포넌트는 접미를 조립하지 않고 받아 그린다(파일 안 접미 리터럴 0 이 그 증거)"
    - "문구 분기를 **설계로** 막는다: 보조 줄 컴포넌트가 필드 이름을 모르는 `string[]` 만 받으면 「문구를 보고 판정」할 수단이 아예 없다"
    - "색을 상속하는 표(`<TableRow>` 한 곳)와 값마다 `--fg` 를 명시하는 카드는 **같은 분기를 읽어야** 한다 — 하나 빠지면 「반만 회색인 행」이 살아 있는 주문으로 읽힌다"
    - "같은 규칙을 쓰는 두 경로(개별·전체 취소)는 **양쪽 파일 주석이 서로를 지목**한다 — 한쪽만 고치는 다음 사람을 막는 가장 싼 수단"

key-files:
  created: []
  modified:
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/trading/vi-client.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/trading/__tests__/vi-client.test.tsx

key-decisions:
  - "접미는 **누적**이다 — Q-ID ∧ 접수대기 ∧ 시간외종가 행은 `매수QP/종가`. 계획서의 「앞 접미 하나만」 문구 대신 C# 정본과 17-01 헬퍼를 따랐다(사용자 확정 사항)"
  - "`StatusNote` 를 `text: string` → `texts: string[]` 로 두어 컴포넌트가 **필드 정체를 모르게** 했다 — Task 2 의 `pendingStatus === ''` 가 acceptance grep 을 1 로 올린 것을 피하는 동시에 실제 설계가 나아졌다"
  - "보조 줄은 **새 열이 아니다** — 미체결 표는 이미 7열이라 폰 폭에 여유가 없고, 이 패널은 §2.2b 컨테이너 쿼리가 아니라 뷰포트 브레이크포인트를 쓴다"
  - "취소보관 행의 방향색(`--up`/`--down`)도 함께 죽인다 — C# 이 Side 셀 ForeColor 를 따로 회색으로 덮는 것과 같은 이유"
  - "`orderTime` 열은 추가하지 않았다(CONTEXT `<deferred>` 재량) — 파서에는 값이 있으므로 나중에 열만 더하면 된다"

patterns-established:
  - "Pattern 1: 두 표면의 표식 일치는 「한 곳에서 만든다」는 주석이 아니라 **같은 행을 두 번 렌더해 문자열을 비교**하는 테스트로 증명한다"
  - "Pattern 2: acceptance grep 이 의도와 어긋나게 잡히면 grep 을 우회하지 말고 **코드 구조를 게이트의 의도 쪽으로** 옮긴다(17-08 선례 승계)"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "미체결 행의 매수/매도 표식이 예약(`매수Q`)·접수대기(`매수P`)·시간외종가(`매수/종가`) 접미를 보여 주고, 접미는 배타가 아니라 누적이다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#⑱ 주문번호가 Q-ID 인 매수 행은 예약 접미를 단다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#⑲ 접수대기 문구가 있는 매도 행은 접수대기 접미를 단다 (문구 내용은 보지 않는다)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#⑳ 시간외종가 보드 행은 종가 접미를 단다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉑ 셋 다 아닌 행은 종전과 같다 — 없는 형태를 지어내지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉒ 세 조건이 겹치면 접미가 **누적**된다 (C# 정본 — 배타가 아니다)"
        status: pass
    human_judgment: false
  - id: D2
    description: "접미 생성은 `sideDisplayText` 한 함수만 한다 — 두 표면 어디에도 인라인 접미 문자열이 없고, 같은 행의 표식이 두 화면에서 한 글자도 다르지 않다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-client.test.tsx#③ 같은 행을 VI 화면과 계좌 패널에서 보면 표식이 **한 글자도** 다르지 않다"
        status: pass
      - kind: other
        ref: "grep -cE '\"Q\"|\"P\"|\"/종가\"' webapp/src/components/orderbook/account-panel.tsx webapp/src/components/trading/vi-client.tsx → 0 · 0"
        status: pass
      - kind: other
        ref: "grep -c 'sideDisplayText' webapp/src/components/orderbook/account-panel.tsx → 3"
        status: pass
    human_judgment: false
  - id: D3
    description: "`pendingCancelSent === true` 행은 회색이고 취소 버튼이 없다. 개별·전체 두 취소 경로가 같은 규칙을 쓰고, 판정 근거는 그 bool 하나다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉓ 취소보관 행은 글자가 회색이다 (표·카드 두 벌 모두)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉔ 미체결 잔량이 남아 있어도 취소보관 행에는 취소 버튼이 없다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉕ 취소보관이 아니고 잔량이 있으면 종전대로 취소할 수 있다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉖ 같은 접수대기 문구라도 bool 이 다르면 판정이 갈린다 — 문구를 보지 않는다"
        status: pass
      - kind: integration
        ref: "webapp/src/components/trading/__tests__/vi-client.test.tsx#④ 취소보관 행은 건수에서 빠지고 취소가 나가지 않는다"
        status: pass
      - kind: integration
        ref: "webapp/src/components/trading/__tests__/vi-client.test.tsx#④ 전부 취소보관이면 「전체 취소」 버튼 자체가 눌리지 않는다"
        status: pass
      - kind: other
        ref: "grep -cE 'pendingStatus\\s*(===|!==|\\.includes)' (두 파일) → 0 · 0 (T-17-31)"
        status: pass
    human_judgment: false
  - id: D4
    description: "예약·접수대기 서버 문구가 가공 없이 그대로 닿고, 두 값이 빈 행에는 보조 표시가 붙지 않는다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉘ 예약 상태 문구가 **그대로** 보인다 (가공 없음)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉙ 접수대기 문구가 **그대로** 보인다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉚ 둘 다 있으면 둘 다 보인다 — 예약 먼저, 접수대기 다음"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉛ 두 값이 모두 빈 행에는 보조 표시가 붙지 않는다 (표가 두꺼워지지 않는다)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#㉜ 픽스처 3행(전부 빈 값)에도 보조 줄이 하나도 없다 — 어제의 표 그대로다"
        status: pass
      - kind: other
        ref: "grep -cE '(queuedStatus|pendingStatus)\\s*\\.(slice|replace|split)\\(' (두 파일) → 0 · 0 (T-17-32)"
        status: pass
    human_judgment: false
  - id: D5
    description: "보조 줄과 회색 행이 실제 브라우저의 좁은 폭(폰 밴드)에서 읽히는지 · 취소 버튼이 사라진 자리가 버그로 읽히지 않는지"
    verification: []
    human_judgment: true
    rationale: "jsdom 에는 CSS 가 없어 `break-words` 줄바꿈·회색 대비·보조 줄이 더해진 행 높이를 증명할 수 없다. 표·카드 두 벌이 모두 DOM 에 있는 환경이라 「어느 쪽이 보이는가」도 테스트가 답할 수 없다. D-26 대로 배포 후 사용자 관찰, 또는 dev(PORT=3100) 스크린샷으로만 닫힌다."
  - id: D6
    description: "실서버가 보내는 실제 `queued_status`/`pending_status` 문구와 Q-ID 형식이 이 표식·보조 줄에서 의도대로 보이는지"
    verification: []
    human_judgment: true
    rationale: "표식·문구의 입력은 전부 목 프레임이다. 서버가 다른 길이·다른 어휘를 보내면 테스트는 통과한 채 화면만 어색해진다(예: 아주 긴 문구, Q-ID 가 아닌 예약 번호 체계). 17-02 의 D8 과 같은 종류의 미지이고 장중 관찰로만 닫힌다."

# Metrics
duration: 11 min
completed: 2026-09-20
status: complete
---

# Phase 17 Plan 09: 미체결 표식 · 취소보관 행 · 서버 상태 문구 Summary

**미체결 표가 서버가 아는 네 가지 사실(예약 요약 행 · 증권사 접수대기 · 시간외종가 · 취소 보관)을 말하기 시작했다 — 표식은 `sideDisplayText` 한 함수에서만 나오고, 이미 취소가 나간 행은 회색 + 취소 버튼 없음이며(개별·전체 두 경로 동일 식), 예약·접수대기 문구는 한 글자도 가공하지 않고 그대로 닿는다.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-20T09:16:34Z
- **Completed:** 2026-09-20T09:27:30Z
- **Tasks:** 3 (tracer 1 · auto 2, 전부 `tdd="true"`)
- **Files modified:** 4
- **테스트:** webapp 918 → **936** (+18), relay 467 회귀 0

## Accomplishments

- **표식을 만드는 자리가 저장소에 하나뿐이 됐다.** `SideTag` 는 이제 라벨을 조립하지 않고 **받아 그린다**. 값은 `UnfilledView.sideText` 한 자리에서 `sideDisplayText(side, orderNo, pendingStatus, board)` 로 만들어지고, 표와 카드 두 벌이 같은 문자열을 읽는다. 두 파일의 접미 리터럴 카운트 `0` 이 그 계약의 자동 증거다.
- **「두 표면이 같다」를 주석이 아니라 런타임으로 증명했다.** 같은 행을 VI 화면과 계좌 패널에서 각각 렌더해 `[data-slot="account-unfilled-side"]` 의 문자열을 **비교**한다. 구조가 바뀌어 VI 가 자기 표를 갖게 되는 날 이 단언이 먼저 깨진다.
- **접미는 누적이다.** Q-ID ∧ 접수대기 ∧ 시간외종가가 겹친 행은 `매수QP/종가` 다. C# 정본(`NotificationHub.cs:172`)이 세 `if` 를 연달아 적용하고, 17-01 헬퍼가 이미 그 규칙을 갖고 있었다 — 화면은 그것을 그대로 받았다.
- **이미 취소가 나간 행에 취소 버튼이 없다.** `pendingCancelSent` 하나로 개별 취소(`account-panel` 의 `cancellable`)와 전체 취소(`vi-client` 의 `cancellable`)가 **같은 식**을 쓴다. 한쪽만 고치면 개별은 막히는데 일괄 경로로 두 번째 취소가 나가는 상태가 되므로, 두 파일 주석이 서로를 지목하게 했다.
- **버튼이 사라진 이유가 화면에 남는다.** 회색 행에는 서버 접수대기 문구가 보조 줄로 그대로 뜬다. 버튼만 조용히 사라지면 사용자는 그것을 버그로 읽고 새로고침·재취소를 시도한다.
- **문구 분기를 설계로 막았다.** 보조 줄 컴포넌트 `StatusNotes` 는 `string[]` 만 받는다 — **어느 필드의 문구인지 모르므로** 필드 이름으로 분기할 수단이 아예 없다. 「대기/발사중/완료」를 클라가 지어내는 코드가 들어올 자리가 구조적으로 없다(D-07 · T-17-32).

## Task Commits

1. **Task 1 (tracer, TDD): 미체결 표식 — `sideDisplayText` 한 함수로 두 표면**
   - RED — `d8d17c7` (test)
   - GREEN — `636e0c5` (feat)
   - REFACTOR — 없음 (헬퍼 위임이 이미 최소 형태)
2. **Task 2 (TDD): 취소보관 행 — 회색 · 취소 버튼 숨김**
   - RED — `40aea86` (test)
   - GREEN — `d78bdd0` (feat)
   - REFACTOR — 없음 (`StatusNote` 의 시그니처 정리는 acceptance 를 닫기 위한 GREEN 의 일부라 같은 커밋에 넣었다)
3. **Task 3 (TDD): 예약·접수대기 상태 문구 표시**
   - RED — `a871a04` (test)
   - GREEN — `8a957a5` (feat)
   - REFACTOR — 없음

**Plan metadata:** 이 SUMMARY 커밋.

`commits: 6` 은 서술이 아니라 `git rev-list --count 5bac279..HEAD` 로 **측정**한 값이다.

## Files Created/Modified

- `webapp/src/components/orderbook/account-panel.tsx` — 파일 상단 ⑨(취소보관 행 규율) 신설 · `UnfilledView.sideText` · `cancellable` 에 `!pendingCancelSent` · `SideTag(muted)` · `StatusNotes` 신설 · 표/카드 회색 분기
- `webapp/src/components/trading/vi-client.tsx` — 「전체 취소」 대상에서 취소보관 행 제외(개별 경로와 같은 식임을 주석으로 못박음)
- `webapp/src/components/orderbook/__tests__/account-panel.test.tsx` — 픽스처 헬퍼 3종(`unf`/`withUnfilled`/`sideTexts`) + 표식 5 · 취소보관 5 · 상태 문구 5 = 15 케이스
- `webapp/src/components/trading/__tests__/vi-client.test.tsx` — 두 표면 표식 일치 1 · 전체 취소 제외 2 케이스

## 측정 기록 (계획이 「실측해서 확인하라」고 한 것)

**VI 화면에는 자기 미체결 표가 없다.** `vi-client.tsx` 는 거래소 필터로 행을 줄인 `panelAccount` 를 `AccountPanel` 에 넘기고 헤더 자리(`unfilledHeaderActions`)만 빌린다(그 파일 ⑥ 이 이미 적어 둔 설계다). 따라서 **표식을 그리는 자리는 계좌 패널 한 곳뿐**이고, Task 1 ③ 이 대비한 「vi-client 자체 표」는 존재하지 않아 중복 작업이 없었다. 그 사실에 기대는 대신, 같은 행을 두 화면에서 렌더해 문자열을 비교하는 테스트로 **런타임에서도 참**임을 잠갔다.

**`orderTime` 은 화면에 쓰이지 않는다.** 파서(17-02)에는 값이 있고 브라우저 계약에도 있지만 열을 추가하지 않았다 — 미체결 표는 이미 7열이고 CONTEXT `<deferred>` 가 열 추가를 재량으로 두었다. 나중에 필요하면 **열만** 더하면 된다(값 경로는 이미 있다).

## Decisions Made

1. **접미 누적** — 계획서 문구가 아니라 C# 정본 + 17-01 헬퍼를 따랐다(사용자 확정). `매수QP/종가` 가 정답이다.
2. **`StatusNotes` 는 필드 정체를 모른다** — 아래 「계획서와의 차이」 #1 참조. 게이트를 우회하는 대신 구조를 게이트의 의도 쪽으로 옮겼다.
3. **회색은 방향색도 죽인다** — `SideTag(muted)`. 매수/매도 칸만 색이 살아 있으면 그 행은 회색으로 읽히지 않는다(C# 도 Side 셀 ForeColor 를 따로 덮는다).
4. **보조 줄이지 새 열이 아니다** — 7열 표 + 폰 밴드. 이 패널은 §2.2b 컨테이너 쿼리 대상이 아니라 뷰포트 브레이크포인트를 쓰므로 컨테이너 쿼리를 새로 들이지 않았다(신설 0건).
5. **예약 → 접수대기 순서** — 주문의 **형태**가 먼저, 그 처리 **상태**가 다음이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 의 acceptance grep 이 내 보조 줄 코드에 걸렸다**
- **Found during:** Task 2 (GREEN 직후 acceptance 재실행)
- **Issue:** Task 2 ④ 가 요구한 「회색 행에 `pendingStatus` 노출」을 `StatusNote({ row })` 안의 `if (row.pendingStatus === '') return null;` 로 구현했더니, 같은 Task 의 acceptance `grep -cE 'pendingStatus\s*(===|!==|\.includes)'` 가 `0` → `1` 이 됐다. 게이트가 잡으려던 것(문구로 회색·취소를 **판정**하기)은 한 줄도 들어가지 않았지만, 그 줄은 「빈 값인지만 본다」는 D-13 이 명시 허용한 검사다(shared 의 `sideDisplayText` 자신도 `pendingStatus !== ""` 를 쓴다).
- **Fix:** `!row.pendingStatus` 로 바꿔 grep 만 피하는 우회를 **하지 않았다**(그건 게이트를 무력화하는 것이다). 대신 컴포넌트가 `text: string` → 최종적으로 `texts: string[]` 만 받게 해 **어느 필드의 문구인지 모르도록** 만들었다. 필드 이름이 없으면 필드로 분기할 수단이 없으므로, 게이트가 지키려던 성질이 주석이 아니라 타입으로 강제된다.
- **Files modified:** `webapp/src/components/orderbook/account-panel.tsx`
- **Verification:** 재측정 두 파일 모두 `0`, webapp 931 green
- **Committed in:** `d78bdd0` (커밋 전에 수정)

### 계획서와의 차이 (수정하지 않고 기록)

**2. [범위] Task 1 이 `vi-client.test.tsx` 도 건드렸다**
- Task 1 `<files>` 는 `vi-client.tsx` 와 `account-panel.test.tsx` 만 적었지만, 「두 표면 표식 일치」 단언은 **두 화면을 같은 파일에서 렌더**해야 성립한다. `account-panel.test.tsx` 의 relay 스텁은 `sendOrder` 하나만 갈아 끼우는 형태라 `ViClient` 가 필요로 하는 `auth-context`·`next/navigation` 목이 없고, 그것을 들이면 계좌 패널 전용 파일의 스텁 경계(그 파일 상단 ★)가 무너진다. 그래서 이미 두 목을 갖춘 `vi-client.test.tsx` 에 넣었다.

**3. [해석] Task 2 ④ 의 「보조 텍스트 또는 툴팁」을 Task 3 과 **한 자리**로 합쳤다**
- 두 태스크가 같은 문구(`pendingStatus`)를 각각 노출하라고 요구한다. 자리를 둘로 만들면 같은 문장이 한 행에 두 번 뜬다. Task 2 에서 보조 줄 1개를 만들고 Task 3 에서 그 줄이 `queuedStatus` 까지 받도록 넓혔다 — `title` 속성(툴팁)도 함께 달아 긴 문구의 전문을 잃지 않는다.
- 그 결과 Task 3 RED 에서 ㉙·㉛·㉜ 세 케이스가 **이미 초록**이었다. 새 동작이 아니라 Task 2 가 세운 성질의 회귀 그물이라 그것이 맞다(아래 RED 증거 표에 그대로 적었다).

**4. [기록] 계획서 「앞 접미 하나만」은 적용하지 않았다**
- 사용자가 이번 세션에 **누적**을 확정했고 C# 정본·17-01 헬퍼가 모두 누적이다. 배타로 만들면 같은 주문이 WinForms 와 웹에서 다르게 보인다. ㉒ 가 그 규칙을 못박는다.

---

**Total deviations:** 1 auto-fixed (Rule 3 블로킹) + 3 기록만
**Impact on plan:** 범위를 넓히지 않았다. #1 은 게이트의 **의도**를 지키면서 설계를 나아지게 한 수정이고, #2·#3 은 acceptance 를 실제로 닫기 위한 최소 경로다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 (tracer) | ✓ `d8d17c7` | ✓ `636e0c5` | — (변경 없음) | Pass |
| 2 | ✓ `40aea86` | ✓ `d78bdd0` | — (변경 없음) | Pass |
| 3 | ✓ `a871a04` | ✓ `8a957a5` | — (변경 없음) | Pass |

**RED 증거 (#3770 실질 요건 — 세 사이클 모두 「대상 테스트가 계획된 behavior 에 대한 단언으로 실패」)**

| 사이클 | command | exit | 대상 테스트 | 실패 형태 | 집계 |
|---|---|---|---|---|---|
| Task 1 | `pnpm --filter @gh-radar/webapp test -- account-panel vi-client` | `1` | `미체결 표식 > ⑱ ⑲ ⑳ ㉑ ㉒` · `vi-client > ③ 같은 행을 VI 화면과 계좌 패널에서…` | **단언 실패** — `expected [ '', '' ] to deeply equal [ '▲ 매수', '▼ 매도' ]`, `expected [ '' ] to deeply equal [ '▲ 매수QP/종가' ]` (표식 슬롯이 아직 DOM 에 없어 빈 문자열) | 925 중 **6 실패 / 918 통과 / 1 skip** |
| Task 2 | `pnpm --filter @gh-radar/webapp test` | `1` | `취소보관 행 > ㉓ ㉔ ㉖ ㉗` · `vi-client > ④ 두 케이스` | **단언 실패 + 문구 미발견** — `expected 'transition-colors data-[state=selecte…' to contain 'text-[var(--muted-fg)]'`, `to have a length of +0 but got 2`, `Expected element to have text content: 1건이 한 번에 취소돼요. / Received: …2건이…`, `Received element is not disabled` | 932 중 **6 실패 / 925 통과 / 1 skip** |
| Task 3 | `pnpm --filter @gh-radar/webapp test -- account-panel` | `1` | `예약·접수대기 서버 문구 > ㉘ ㉚` | **단언 실패** — `expected [] to deeply equal [ '발사완료 미발주 3주' ]`, `expected [ '증권사 보관 · 09:00 처리' ] to deeply equal [ '발사완료 미발주 3주', '증권사 보관 · 09:00 처리' ]` | 937 중 **2 실패 / 934 통과 / 1 skip** |

로드 실패·0건 발견·unexpected green 어느 쪽도 아니다. 실패한 테스트는 전부 계획된 `<behavior>` 에 대한 단언이고, 나머지 918~934 건이 정상 통과했다는 것이 「픽스처가 깨진 게 아니다」의 증거다.

**RED 단계에서도 통과한 케이스(의도된 green — 회귀 그물):** Task 2 의 `㉕`(취소보관이 아닌 행은 종전대로 취소 가능 — 깨지지 말아야 할 성질), Task 3 의 `㉙`·`㉛`·`㉜`(Task 2 가 이미 세운 접수대기 표시와 빈 행 무표시). 셋 다 **새 동작이 아니라 지켜야 할 성질**이라 RED 에서 초록인 것이 맞다 — 새 동작인 척 꾸미지 않았다.

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다 (17-01·17-02·17-03·17-07·17-08 이 보고한 도구 갭 그대로).**
`bin/lib/tdd-red-evidence.cjs` 의 `parseNodeTestSummary` 가 `node --test` 의 `# tests/# pass/# fail` 푸터로만 집계를 읽는데 vitest 는 그 푸터를 내지 않아 어떤 입력이든 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내는 것은 게이트가 검사하려던 증거의 위조라 하지 않았고, 대신 위 표로 실질 증거를 남긴다.

## Issues Encountered

없음. 계획서의 세 태스크가 서로의 결과 위에 얹히는 구조라(표식 → 회색 → 문구) 순서대로 진행되는 동안 막힌 지점이 없었다.

## Known Stubs

없음. 이 plan 이 만든 표면은 전부 서버 값이 그대로 흐르는 경로이고, 빈 값을 UI 에 고정으로 넣은 자리가 없다(빈 값은 **요소를 만들지 않는 것**으로 처리한다).

## 검증 결과 (plan `<verification>`)

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp test` | **936 passed / 1 skipped, 72 files** |
| `pnpm --filter @gh-radar/relay run test` | **467 passed / 19 files** (회귀 0) |
| `pnpm typecheck` (루트 전체) | **통과** (`error TS` 0) |
| §2.2b 밴드 경계 리터럴(`700px`·`830px`·`992px`) | `globals.css` **무변경**, 카운트 4 (전·후 동일) |
| 두 취소 경로 취소보관 제외 단언 | 개별 `㉔`·`㉖` · 전체 `④` 두 케이스 **통과** |
| 접미 리터럴 · `pendingStatus` 조건식 · 문구 가공 | 두 파일 모두 **0 · 0 · 0** |
| `container-type`/`@min-[` 신설 | `account-panel.tsx` **0** |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **17-10 이후로 넘어가도 좋다.** 이 plan 이 손댄 두 파일은 표시 층뿐이고 relay·shared 계약을 바꾸지 않았다.
- **17-11(상따 래치 LED)** 은 `latch-led.tsx` 를 마운트하는 일이고 이 plan 과 파일이 겹치지 않는다. 단, 상따 화면도 같은 `AccountPanel` 을 쓰므로 표식·회색은 **이미 거기에도 걸려 있다**(3표면 공용의 이점).
- **남은 미지 2건은 사람이 닫는다:** 좁은 폭에서의 가독성(coverage D5)과 실서버 문구·Q-ID 실값(coverage D6). 둘 다 D-26 배포 후 장중 관찰 항목이다.
- **Phase 18 을 위한 여지:** `orderTime` 은 파서·계약에 값이 있고 화면만 비어 있다 — 「시간」 열이 필요해지면 열만 더하면 된다.

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-20*

## Self-Check: PASSED

- `key-files.modified` 4건 전부 디스크에 존재
- 태스크 커밋 6건(`d8d17c7` `636e0c5` `40aea86` `d78bdd0` `a871a04` `8a957a5`) 전부 `git log` 에 존재
- plan `<verification>` 전 항목 재실행 통과 (위 「검증 결과」 표)
