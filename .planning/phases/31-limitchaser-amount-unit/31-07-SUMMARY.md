---
phase: 31-limitchaser-amount-unit
plan: 07
subsystem: testing
tags: [e2e, playwright, limit-chaser, amount-unit, manwon, two-line-row, width-backstop, relay, a11y]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-01 fake-gateway 10 디코드 금액 8필드 · pushLimitChaserEcho 금액 입력 / 31-03 42·84 postBuyFloorAmount / 31-05 주문로그 ⑦ 서식 / 31-06 두 줄 행 · 시트 · 등록 차단 · 84 시딩"
provides:
  - "e2e P31-1~P31-4 · P31-7(trading-workbench) · P31-5(me) · P31-6(order-log) — 실 relay + 스텁 게이트웨이 경로"
  - "폭/높이 백스톱 P20-3 · P24-7 56/44 분리 · 최악값 「999,999,999만」/「2,147,483,647주」 · L4 실측 · P24-8 회귀"
  - "결함 수정 2건 — 두 줄 체크 값 행 값-라벨 겹침(L4b) · 인라인 편집칸 9자리 잘림(거울 글자 자동 폭)"
  - "fake-gateway 10 디코드 수량 주 4필드 · 한방 건수"
affects: [31-08, verify-work]

actuals:
  tokens: 15356
  tasks: 3
  commits: 3
plan_head_before: b49f23096b2ff8708687ab529d6b4c4ed836b9ba
plan_head_after: 9b0ccce15685a6090c127d7541b85e493ec3ee82

tech-stack:
  added: []
  patterns:
    - "e2e 기대 주는 shared `qtyFromAmount` · `amountFromQty` 로 잰다 — spec 에 환산 공식을 복제하지 않는다"
    - "에코 도착 신호는 두 줄 행 아래 줄(`lc-row-sub` = 에코 주) — 위 줄은 만원 역산이라 시드마다 달라진다"
    - "높이 단언은 행이 `lc-row-sub` 를 품는가로 56/44 를 가른다(수량 8 · 파생 2 = 56) — 행 id 목록을 하드코딩하지 않는다"
    - "auto-grow 입력 = inline-grid 한 칸에 숨은 거울 글자 + `size=1` 입력(브라우저 공통 · field-sizing 의존 없음)"

key-files:
  created: []
  modified:
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/me.spec.ts
    - webapp/e2e/specs/order-log.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - relay/tests/helpers/fake-gateway.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/inline-value-editor.tsx
    - webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx
    - webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx

key-decisions:
  - "L4b(31-07 신설) — 두 줄 체크 값 행은 값 버튼 shrink-0 · 체크 묶음이 줄며 라벨이 원형 체크 아래 줄로 접힌다(라벨 낱말 불분할 · 말줄임 0 · 글자 크기 불변 · 행 56 불변). 체크 버튼을 flex-1 로 늘리지 않는다 — 빈 가운데 클릭이 즉시 전송되는 오터치를 만든다"
  - "인라인 편집칸 폭 = 버퍼 글자 폭(최소 9ch) — 고정 9ch 는 「999,999,999」 11글자를 7px 잘랐다(Phase 20 부터 잠복 · 31 S4 가 계약화)"
  - "P31-4 줄매수 최대 0주 차단 문장은 기존 채널 폼 머리 `lc-submit-error`(role=alert)가 말한다 — 스위치 전송 직전 가드 몫. 새 표면 없음"
  - "P31-7 새 카드 매수 비교가는 스텁 상한가 127,400 이라 84만 → 6주(UI-SPEC 예시 12,870 → 65주는 같은 shared 함수 단언으로 병기)"
  - "새 폼 수량 8칸 기본값 0(D-12)이라 새 카드 매도 열 「켤 수 없는 이유」 에 「매도 매수잔량이 0 이에요…」 가 선다 — 정상 동작으로 e2e 10 에 잠금"
  - "P20-3 수동 pane 계좌 이름 말줄임은 quick-261007-h76 사용자 결정 B(이름 쪽만 줄임 + title 전체) — 종목명처럼 말줄임 · title 을 확인한 뒤 넘침 목록에서 뺀다(번호 · 다른 요소는 그대로)"

patterns-established:
  - "폭 백스톱 최소 여유 annotation — P24-7: 344 2.6 · 685 0.4(매도 「체결」 체크 값 행) · 830 2.9 · 992 9.9 / P20-3: 344 3.9 · 685 0.4 · 830 2.9 · 992 32.6"

requirements-completed: [AMT-02, AMT-03, AMT-04]

coverage:
  - id: D1
    description: "만원 한 칸 왕복 — 매도 「매수잔량」 1000 → 10 sell_watch_amount 1000 · qty 777 → 60 에코 「1,000만」/「777주」 · 접근성 이름 「매도 매수잔량 1,000만 777주」"
    requirement: AMT-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P31-1 만원 한 칸 왕복"
        status: pass
    human_judgment: false
  - id: D2
    description: "C# 원값 되싣기(SC2) — 8 금액 짝 에코에서 「호가변경」 5 → 10 의 금액 8필드 · 주 8필드 = 에코 원값(sell_watch_amount 100) · 구 서버 에코(금액 0 · 777주) 역산 「1,000만」 오류 표시 0"
    requirement: AMT-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P31-2 C# 원값 되싣기"
        status: pass
    human_judgment: false
  - id: D3
    description: "폰 시트(390) — 단위 「만」 · 만원 칩 4개 · 「= 777주 (비교가격 12,870원)」 → 「매수잔량 적용」 = 10 한 건 · 매도 비교가 0 → 아래 줄 빨간 「비교가격 필요」 · 시트 잠금 문장 · 적용 비활성 · 전송 0"
    requirement: AMT-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P31-3 폰 시트 환산 · 잠금"
        status: pass
    human_judgment: false
  - id: D4
    description: "등록 차단 — 매수 비교가 127,400 · 줄매수 최대 12만에서 「줄매수 켜기」 = 전송 0 + C# 원문 + 「 (12만 → 0주)」 · 아래 줄 「무제한」(UI-SPEC 순위 2)"
    requirement: AMT-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P31-4 등록 차단"
        status: pass
    human_judgment: false
  - id: D5
    description: "/me 후매수 최소 42/84(SC3) — 84 금액 84 → 「84만원」 · 옛 하한잔량 행 0 → 300 확정 → 42 post_buy_floor_amount 300 · qty 0 · 나머지 10값 84 그대로 · present 부재 → 「300만원」 · P27-M1 42 12값 기대 갱신"
    requirement: AMT-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P31-5 /me 후매수 최소"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P27-M1 상따 기본설정"
        status: pass
    human_judgment: false
  - id: D6
    description: "주문로그 ⑦ — 상한가노출 ev_price 13,000 「매도잔량 6500만(5,000주)」 · ev_price 0 「매도잔량 5,000」 · 주문 줄 「371만(300주) @12,350」(공용 패널 · 카드 팝업) · P25-1/P25-7 조건 문장 새 표기"
    requirement: AMT-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/order-log.spec.ts#P31-6 주문로그 ⑦ 금액 표기"
        status: pass
    human_judgment: false
  - id: D7
    description: "84 시딩 첫 cfg — postBuyFloorAmount 84 → 새 카드 행 「84만」 · 첫 등록 10 post_buy_floor_amount 84 · qty = 매수 비교가 내림 환산 · P27-4 봉인 주 0"
    requirement: AMT-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P31-7 새 폼 84 후매수 최소"
        status: pass
    human_judgment: false
  - id: D8
    description: "폭/높이 백스톱 — 본문 344 · 685 · 830 · 992 에서 수량 8 · 파생 2 = 56px · 그 밖 44px · 최악값 「999,999,999만」/「2,147,483,647주」 잘림 · 말줄임 0 · 344 「잔량추적 / 기준선」 L4 접힘(라벨 42px) · 편집 전후 56/44 · 편집칸 「999,999,999」 잘림 0 · P24-8 602px ≤ 660"
    requirement: AMT-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P20-3 최악값"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-7 폭 최악값"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-8 폰 한 화면"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx#CheckValueRow 두 줄"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx#입력칸은 최소 9ch"
        status: pass
    human_judgment: false
  - id: D9
    description: "접근성 — 두 줄 값 버튼 이름 「선매수 매도잔량 71,100만 10,000주」 · 아래 줄 sr 텍스트 0 · 시트 설명 「이 금액」 · axe critical/serious 0(상따 매트릭스 · /me)"
    requirement: AMT-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/a11y.spec.ts (13 passed)"
        status: pass
    human_judgment: false
  - id: D10
    description: "전 워크스페이스 회귀 — shared build · relay typecheck(+tests) · webapp typecheck · shared 617 · relay 1546 · webapp 3989(1 skipped) · e2e 네 spec 132 passed"
    verification:
      - kind: other
        ref: "VALIDATION Full suite command (exit 0)"
        status: pass
      - kind: e2e
        ref: "playwright test trading-workbench · me · order-log · a11y --workers=1 (132 passed)"
        status: pass
    human_judgment: false
  - id: D11
    description: "시각 백스톱 S3 · S4 · S6 — 시트 상태 줄 여러 줄일 때 키패드 · 버튼 위치 불변, Enter 차단 말풍선(max-w 280) 줄바꿈 품질, 등록 차단 8문장 + 접미의 패널 · 시트 · 말풍선 줄바꿈 · 가로 스크롤 0"
    verification: []
    human_judgment: true
    rationale: "플랜 Task 2 human-check — 줄바꿈된 상태 줄의 시트 기하 · 말풍선 줄바꿈 품질은 픽셀 단언보다 눈이 정확하다(UI-SPEC S3 · S4 · S6 「시각 확인」). L4b 라벨 접힘(「○ / 체결량」)의 모양도 같이 본다"
  - id: D12
    description: "실 gh-trade 서버 되싣기 실증(새 서버의 60 에코 금액 원값 · kind 1·2 ev_price)"
    verification: []
    human_judgment: true
    rationale: "VALIDATION Manual-Only — gh-trade feature/limitchaser-amount-unit 배포 뒤에만 관찰 가능(31-08)"

duration: 47min
completed: 2026-10-12
---

# Phase 31 Plan 07: E2E P31 · 폭/높이 백스톱 · 전 워크스페이스 회귀 Summary

**실 relay + 스텁 게이트웨이로 만원 칸 왕복 · C# 원값 되싣기 · 폰 시트 환산/잠금 · 등록 차단 · /me 후매수 최소 42/84 · 주문로그 ⑦ · 84 시딩 첫 cfg 를 증명했다. 두 줄 행 56/44 백스톱을 최악값 「999,999,999만」/「2,147,483,647주」 로 실측하다 결함 둘을 찾아 고쳤다. 하나는 체크 값 행에서 값이 라벨을 덮던 것이고, 다른 하나는 편집칸이 9자리 값을 자르던 것이다. 전 워크스페이스와 e2e 네 spec(132)이 green 이다.**

## Performance

- **Duration:** 47 min
- **Started:** 2026-10-11T15:49:45Z
- **Completed:** 2026-10-11T16:36:36Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- **P31 e2e 7건.** P31-1(만원 왕복) · P31-2(C# 원값 8쌍 되싣기 · SC2) · P31-3(폰 시트) · P31-4(등록 차단) · P31-7(84 시딩)은 `trading-workbench`, P31-5(/me 42/84 · SC3)는 `me`, P31-6(주문로그 ⑦)은 `order-log` 에 들어갔다. 기대 주는 전부 shared `qtyFromAmount`/`amountFromQty` 로 잰다.
- **기존 상따 e2e 를 새 의미로 갱신했다.** 에코 도착 신호는 아래 줄 「10,000주」 로 바꿨다. 8,000만 확정은 10 금액 · 내림 주를 단언한 뒤 같은 값을 에코한다. 그 밖에 상장주식수 만원 시딩 역산, 요약 kv 만원, P24-9 후매수 최소 200만, 다른 단말 에코 역산을 반영했다. 새 폼 기본 0(D-12)이 만드는 매도 「켤 수 없는 이유」 는 정상 동작으로 잠갔다.
- **백스톱(P20-3 · P24-7).** 수량 8칸 에코 주를 int.MaxValue · 비교가 1,274,000 으로 두어 최악값을 만들고 4밴드에서 쟀다. `lc-row-sub` 를 품은 행은 56, 나머지 행은 44 다. L4 「잔량추적 / 기준선」 은 라벨 42px · 행 56 이다. 편집 전·중·뒤 높이는 수량 행 56 · 「호가변경」 44 다. P24-8 은 602px(≤ 660)이다.
- **a11y.** 두 줄 값 버튼 이름 「선매수 매도잔량 71,100만 10,000주」 를 단언했고 axe 위반은 0 그대로다. 84 lc 시드에는 금액 짝(711,000만)을 넣었다.
- **전 워크스페이스 회귀.** shared 617 · relay 1546 · webapp 3989(1 skipped) · 타입체크 4종이 green 이다. e2e 는 trading-workbench 81 · me+order-log 40 · a11y 13 을 따로 돌렸고, 네 spec 을 함께 돌린 결과는 132 passed 다.

## Task Commits

1. **Task 1: trading-workbench P31-1~4 · P31-7 · 기존 시나리오 갱신** - `3f64e56e` (test)
2. **Task 2: 폭/높이 백스톱 56/44 · 최악값 · L4 · P24-8 · a11y + 결함 2건 수정** - `d9bfba3d` (fix)
3. **Task 3: /me P31-5 · 주문로그 P31-6 · 전 워크스페이스 회귀** - `9b0ccce1` (test)

## Files Created/Modified

- `webapp/e2e/specs/trading-workbench.spec.ts`
  - 헬퍼: `lcSub` · `manText` · `juText` · `echoBuyWatchAmount` · `QTY_WORST` · `QTY_ROW_IDS`
  - 테스트: P31 5건 · 기존 시나리오 만원 갱신 · 56/44 측정 · `checkL4Label` · `expectEditingRow56`/`44` · 계좌 이름 말줄임 예외
- `webapp/e2e/specs/me.spec.ts`: `LC84` 픽스처 · 42 12값 기대(봉인 주 0 · 금액) · P31-5
- `webapp/e2e/specs/order-log.spec.ts`: P31-6 · P25-1/P25-7 조건 문장 새 표기
- `webapp/e2e/specs/a11y.spec.ts`: 두 줄 이름 단언 · 아래 줄 에코 신호 · 시트 설명 「이 금액」 · 84 lc 시드 금액 짝
- `relay/tests/helpers/fake-gateway.ts`: 10 디코드에 `buyWatchQty` · `buyMinTradeQty` · `sellMinTradeQty` · `cancelWatchQty` · `sweepMinTickCount` 추가
- `webapp/src/components/trading/lc/setting-group.tsx`: `CHECK_BUTTON_TALL`(L4b) · 두 줄 값 버튼 `shrink-0`
- `webapp/src/components/trading/lc/inline-value-editor.tsx`: 입력칸 거울 글자 inline-grid(최소 9ch · 버퍼 폭)
- `webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx` · `inline-value-editor.test.tsx`: 위 두 수정의 클래스 · 구조 단언

## Decisions Made

frontmatter `key-decisions` 6건과 같다. 핵심은 둘이다. 첫째, 결함은 단언을 느슨하게 하지 않고 화면에서 고쳤다(L4b · 편집칸 자동 폭). 둘째, 체크 버튼은 오터치 때문에 넓히지 않는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 두 줄 체크 값 행에서 값이 라벨을 덮음(L4b)**
- **Found during:** Task 2(P24-7 최악값 실측)
- **Issue:** 선매수 「체결량」 행에 「999,999,999만」 이 들어가면 값이 원형 체크 · 라벨 쪽으로 넘쳐 겹쳤다. 여유는 본문 344 −8px · 685 −3.5px · 830 −9px 였다. UI-SPEC 의 「옛 최악값과 같은 폭」 추정은 값 행 기준이었다. 체크 값 행은 원형 체크 + 간격(28px)이 라벨 앞에 붙어 더 좁다.
- **Fix:** 두 줄 체크 값 행에서 값 버튼을 `shrink-0` 으로 두었다. 체크 묶음은 `shrink flex-wrap` 이라 모자라면 라벨이 원형 체크 아래 줄로 접힌다. 라벨 낱말은 갈리지 않고 말줄임 · 글자 크기 · 행 56 도 그대로다. 체크 버튼은 늘리지 않는다(오터치).
- **Files modified:** `setting-group.tsx` · `two-line-row.test.tsx`
- **Verification:** P24-7 · P20-3 4밴드 통과. 최소 여유는 685 +0.4(매도 「체결」) · 830 +2.9 다. 단위 테스트는 lc 10파일 748 passed 다.
- **Committed in:** `d9bfba3d`

**2. [Rule 1 - Bug] 인라인 편집칸이 9자리 값을 자름**
- **Found during:** Task 2(P20-3 편집 중 실측 · S4)
- **Issue:** 입력칸이 고정 `w-[9ch]` 라 「999,999,999」(쉼표 포함 11글자)가 7px 잘렸다. Phase 20 부터 잠복했고, 31 UI-SPEC S4 가 「잘림 0」 을 계약했다.
- **Fix:** inline-grid 한 칸에 숨은 거울 글자(버퍼)와 `size=1` 입력을 겹쳤다. 폭은 버퍼 글자 폭이고 최소 9ch 다. 행 상자는 그대로라 레이아웃 이동은 없다.
- **Files modified:** `inline-value-editor.tsx` · `inline-value-editor.test.tsx`
- **Verification:** P20-3 344 · 685 · 830 · 992 에서 편집칸 scrollWidth ≤ clientWidth 이고 행 56 이다. 편집기 단위 테스트도 통과했다.
- **Committed in:** `d9bfba3d`

**3. [Rule 3 - Blocking] fake-gateway 10 디코드에 수량 주 4필드 · 한방 건수 없음**
- **Found during:** Task 1(P31-2 「주 8필드 = 에코 주」)
- **Issue:** `readSetLimitChaserRequest` 에 `buyWatchQty` · `buyMinTradeQty` · `sellMinTradeQty` · `cancelWatchQty` · `sweepMinTickCount` 가 없었다.
- **Fix:** 테스트 헬퍼 인터페이스 · 디코드에 5필드를 추가했다(제품 코드 무변경).
- **Files modified:** `relay/tests/helpers/fake-gateway.ts`
- **Verification:** relay `typecheck:tests` 와 relay 1546 passed.
- **Committed in:** `3f64e56e`

**4. [Rule 3 - Blocking] P20-3 수동 pane 이 의도된 계좌 이름 말줄임에서 실패**
- **Found during:** Task 2(P20-3 344 수동 pane)
- **Issue:** 「주문계좌」 행의 「 · 위탁종합」 은 quick-261007-h76 사용자 결정 B 에 따라 이름 쪽만 줄이는 말줄임(title 전체)이다. 그 뒤로 P20-3 을 돌리지 않아 잠복해 있었고 Phase 31 과는 무관하다.
- **Fix:** `cardScrollOverflowing` 은 이미 종목명 말줄임을 예외로 둔다. 같은 방식으로 이 이름도 ellipsis CSS · 값 `title` 전체를 확인한 뒤 넘침 목록에서 뺀다. 번호 쪽과 다른 요소의 넘침은 그대로 잡는다. 상따 행 백스톱(잘림 · 말줄임 · 56/44)은 느슨하게 하지 않았다.
- **Files modified:** `trading-workbench.spec.ts`
- **Committed in:** `d9bfba3d`

**5. [플랜 수치 조정] P31-7 기대 주와 P31-4 표시 채널**
- P31-7: 새 카드 매수 비교가는 스텁 상한가 127,400 이라 84만 → 6주다. 플랜 예시는 12,870 → 65 다. 그래서 기대값을 `qtyFromAmount(84, sent.buyWatchPrice)` 로 쟀고, 65 는 shared 함수 단언으로 병기했다.
- P31-4: 차단 문장은 FailureBubble 이 아니라 기존 폼 머리 `lc-submit-error`(role=alert)에 선다. 아래 줄은 UI-SPEC 순위 2 에 따라 「무제한」 이다.
- a11y: 플랜이 「84 시드(514)」 라 부른 곳은 lc 시드다. 금액 짝 `postBuyFloorAmount` 를 그 lc 시드에 넣었다.

**Total deviations:** 4 auto-fixed(Rule 1 ×2 · Rule 3 ×2) + 플랜 수치 조정 1
**Impact on plan:** 제품 코드는 31-02 표면 두 파일만 고쳤다. 백스톱 단언은 그대로 두고 화면을 고쳤다.

## Issues Encountered

- 시나리오 10(새 카드)에서 매도 열 「켤 수 없는 이유」 가 새로 섰다. 새 폼 수량 기본 0(D-12 · 31-04)이 만든 정상 결과라 e2e 에 그 문장으로 잠갔다.

## Known Stubs

없음.

## User Setup Required

없음.

## Next Phase Readiness

- 31-08(인박스 노트 닫기 · 미리보기)이 남았다.
- 사람 확인이 필요하다: S3 · S4 · S6 시각 확인과 L4b 라벨 접힘 모양(D11). 실서버 실증은 배포 뒤다(D12).
- 요구사항 AMT-02 · 03 · 04 의 Complete 표시는 31-08 도 같은 ID 를 선언하므로 마지막 선언 플랜 몫이다(`requirements.ready-ids` 0/3).

## Self-Check: PASSED

- 파일: 수정 9개 FOUND · SUMMARY FOUND
- 커밋: `3f64e56e` · `d9bfba3d` · `9b0ccce1` FOUND(이 브랜치)
- 수용 기준:
  - Task 1: `P31-[1-47]` 6줄 · P31-2 sellWatchAmount 100 단언 · `-g P31` 통과(전체 실행)
  - Task 2: `r.h - 56` 2줄 · `2_147_483_647` 1줄 · P20-3/P24-7/P24-8 3 passed · a11y 13 passed
  - Task 3: `P31-5` 1줄 · `P31-6` 1줄 · 하한잔량 비-toHaveCount 0 · 세 verify exit 0
