---
phase: 18-gh-trade-ui-nxt-vi
plan: 07
subsystem: ui
tags: [trading, manual-order, order-confirm, modify, queued, offhours, react, tdd]
status: complete

requires:
  - phase: 18-01
    provides: "RelayOrderRequest.kind 의 modify · pieceCount? · krxSession? · buildOrderFrame 3분기"
  - phase: 18-04
    provides: "affordanceOf · ManualOrderAffordance · PREOPEN/NXT_PREOPEN_CONFIRM_NOTE"
provides:
  - "ManualOrderForm(variant card|orderbook) — 4버튼 수동주문 폼 (card/manual-order-form.tsx)"
  - "ManualOrderEntry — 적응형 진입(<700 매수|매도|수동 3탭 / ≥700 수동주문 덮기)"
  - "canModify · modifyLockReason · unfilledSelectBlockReason — 정정 잠금·행 선택 차단 판정"
  - "OrderConfirmDialog 의 ModifyOrderConfirmDetail(mode modify) + 신규/취소 detail optional 필드 확장"
  - "order-panel.tsx 의 DISABLED_LABEL export (연결 상태 문구 표 1벌)"
affects: [18-09, 18-10, 18-11, 18-13]

actuals:
  tokens: 25145
  tasks: 3
  commits: 6
plan_head_before: 1a6f33c6ad5059ae3f108999f8db91d7e536dd9b

tech-stack:
  added: []
  patterns:
    - "확인 다이얼로그가 본 요청 스냅샷(pendingReqRef)만 확정 시 전송 — 화면과 전송값이 갈라지지 않는다"
    - "적응형 진입은 두 상태(tab·cover)를 함께 들고 밴드가 하나씩만 쓴다 — 폭 판정은 @min-[700px]/lc: CSS, JS 는 폭을 재지 않는다"
    - "정정 잠금은 canModify 한 함수 — 버튼 disabled 와 제출 가드가 같은 함수를 부른다"
    - "포털 다이얼로그의 Escape 는 DOM contains 로 걸러 덮기 닫기와 섞이지 않는다"

key-files:
  created:
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx
  modified:
    - webapp/src/components/orderbook/order-confirm-dialog.tsx
    - webapp/src/components/orderbook/order-panel.tsx

key-decisions:
  - "정정 확정 버튼은 원주문 방향색(--up/--down) — 목업의 --primary 는 값이 --down 과 같아 매수 정정이 매도 파랑으로 보이므로 LOCKED 색 규칙을 우선"
  - "원주문 선택 칩은 중립 표면(--muted + --fg 테두리) — UI-SPEC 은 accent 를 지정했지만 plan 이 이 파일에서 파랑 강조 토큰을 금지"
  - "선택 시 수량은 미체결 잔량으로 채우고, 칩과 확인 다이얼로그의 원주문 줄은 원주문 수량(orderQty)을 보인다"
  - "폼 경로 취소 다이얼로그의 닫기 버튼은 「닫기」 유지 — 「취소」와 「취소 주문」이 나란히 서면 어느 쪽이 주문을 취소하는지 흐려진다"
  - "기존 미체결 표(account-panel) 취소는 accountNo 가 실려 오지 않으므로 옛 4항목 요약·「✕ 주문 취소」 그대로 — 이 phase 에서 기존 화면을 깨지 않는다"
  - "시간외종가 세션(G2/G3)은 서버 플래그 g3Open/g2Open 에서 고른다 — affordanceOf 반환 5필드 계약(테스트로 잠김)을 넓히지 않고 폼 로컬 helper 로 둠"
  - "timeout 뒤 잠금(blocked)은 4버튼 전부에 걸고 종목(isin) 전환 시에만 풀린다 — 옛 order-panel 규율 승계"

requirements-completed: []

coverage:
  - deliverable: "4버튼 폼 · 확인 다이얼로그 필수 · 중복 제출 가드 · timeout≠실패 · 77 라벨 · 조각 수 · 시간외종가 · 적응형 진입"
    human_judgment: false
    verification:
      - kind: test
        ref: "manual-order-form.test.tsx — Task 1 18 cases"
        status: pass
      - kind: command
        ref: "! grep -nE '10%|25%|50%|100%' card/manual-order-form.tsx · ! grep -nE 'new Date|Date\\.now' · grep -c affordanceOf → 6"
        status: pass
  - deliverable: "미체결 행 선택 → 정정/취소 · 정정 잠금 3조건 · 취소 = 미체결 잔량 전부 · 정정 side 승계"
    human_judgment: false
    verification:
      - kind: test
        ref: "manual-order-form.test.tsx — Task 2 12 cases (총 30)"
        status: pass
      - kind: command
        ref: "grep -c canModify card/manual-order-form.tsx → 6"
        status: pass
  - deliverable: "주문확인 다이얼로그 — 제목 6변형 · 원주문/조각 수/예약 줄/시간외종가 요약 · 포커스·연타 가드"
    human_judgment: false
    verification:
      - kind: test
        ref: "order-confirm-dialog.test.tsx (19 cases) · account-panel/order-panel 기존 테스트 무수정 green"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp test → 84 files, 1202 passed (하한 1008) · typecheck exit 0"
        status: pass
  - deliverable: "카드/호가 탭 실제 폭에서 4버튼 접힘 · 덮기 전환 · 목업 대비 시각 대조"
    human_judgment: true
    verification:
      - kind: manual
        ref: "폼은 아직 어느 라우트에도 마운트되지 않음 — 18-10 CardBody 조립 후 dev 화면 대조, 폭 램프는 18-13 Playwright"
        status: pending

metrics:
  duration: "~12분"
  completed: 2026-09-22
---

# Phase 18 Plan 07: 수동주문 폼 + 주문확인 다이얼로그 확장 Summary

카드와 호가 탭이 함께 쓰는 수동주문 폼(`ManualOrderForm`)과 그 진입 셸(`ManualOrderEntry`)을 만들고, 주문확인 다이얼로그가 정정·예약·시간외종가·폼 취소를 요약하도록 넓혔습니다. 폼은 한 컴포넌트에서 신규, 정정, 취소, 예약, 시간외종가 다섯 경우를 모두 내보내며, 어느 경우든 확인 다이얼로그를 거칩니다.

## 무엇을 만들었나

- **`card/manual-order-form.tsx` — `ManualOrderForm`**
  - `order-panel.tsx` 를 다이어트해 다시 썼습니다. 계좌 행, 가격 ±, 비율 버튼, 사다리 안내를 뺐습니다.
  - 파일 머리 주석에 살아남는 규율 5개와 뒤집힌 규율 1개를 적었습니다. 뒤집힌 것은 단일 제출 버튼 규율이고, D-20 과 WinForms 종합주문창이 그 근거입니다.
  - 버튼 라벨, 조각 스테퍼, 예약 안내는 `affordanceOf` 의 반환값으로만 정합니다. 벽시계는 읽지 않고, 77 값으로 제출을 막지도 않습니다.
  - 조각 수는 스테퍼가 보일 때만 요청에 싣습니다. 스테퍼는 초기값 5이고 상한은 서버 `maxPieces` 입니다.
  - `variant="orderbook"` 에만 주문유형 콤보가 있습니다.
    - 시간외종가를 고르면 가격이 「—」로 잠기고, 참고 종가와 안내 문장이 뜨며, 주문금액은 「종가 확정 후」가 됩니다. 이때 정정 버튼은 비활성입니다.
    - 요청에는 `price: 0` 과 `krxSession` 이 실립니다.
    - 창이 닫히면 주문유형이 지정가로 돌아갑니다.
  - 버튼을 누르면 검증 → 요청 스냅샷 → 확인 다이얼로그 순으로 진행하고, 확정하면 그 스냅샷만 `sendOrder` 로 보냅니다.
    - 중복 제출 가드는 클릭 단계와 확정 단계 두 겹입니다.
    - 응답을 기다리는 동안 4버튼이 전부 비활성이고 「주문 전송 중…」이 뜹니다.
    - `timeout` 이면 폼을 잠급니다.
  - 결과 3분기와 검증 문구는 기존 원문 그대로이고, 인라인 `role="status"` 로 띄웁니다.
  - 호가 탭 각주는 새 문장으로 교체했습니다.
  - 미체결 행 선택은 `selectedUnfilled`/`onClearSelection` prop 으로 받습니다.
    - 행을 선택하면 칩이 뜨고, 가격과 미체결 잔량이 입력에 채워집니다. 선택을 해제해도 입력값은 남습니다.
    - 정정은 원주문의 ISIN, 거래소, 방향을 승계합니다.
    - 취소 수량은 `unfilledQty` 전부이고, 폼의 수량 입력은 무시합니다.
- **`canModify` / `modifyLockReason` / `unfilledSelectBlockReason`**
  - 정정을 잠그는 조건은 G2/G3 `board`, 비어 있지 않은 `queuedStatus`, `pendingCancelSent`, 빈 `orderNo` 입니다.
  - 정정 버튼의 `disabled`·`title` 과 제출 가드가 같은 함수를 부릅니다.
  - 선택이 막힌 행이 prop 으로 들어와도 폼은 선택이 없는 것으로 취급합니다.
- **`ManualOrderEntry`**
  - 컨테이너 폭 700 미만에서는 「매수 | 매도 | 수동」 3탭이 보입니다.
  - 700 이상에서는 「수동주문」 버튼을 누르면 폼이 옵션 영역을 덮고, 헤더에 「키 …」와 ✕ 가 붙습니다.
  - ✕ 나 Escape 로 닫으면 포커스가 「수동주문」 버튼으로 돌아갑니다.
  - 두 pane 은 언제나 마운트돼 있어 옵션 값이 보존됩니다. 바뀌는 것은 클래스뿐입니다.
- **`order-confirm-dialog.tsx`**
  - 제목은 매수/매도/예약매수/예약매도/정정/취소 여섯 가지로 바뀌고, 확정 버튼은 「{라벨} 주문」입니다.
  - 요약 행을 더했습니다. 정정에는 「원주문」, 예약구간에는 「조각 수 N (서버 상한 M)」과 `--new-bg`/`--new-bd` 예약 줄이 붙습니다.
  - 시간외종가는 주문유형 「시간외종가 · 가격 0 (KRX 세션)」, 가격 「참고 종가 {가격}원」, 주문금액 「종가 확정 후」로 요약합니다.
  - 폼 경로 취소는 UI-SPEC 요약과 경고 박스(곧 `DialogDescription`), 그리고 「취소 주문」 버튼입니다.
  - 추가 필드는 전부 optional 이고, 기존 호출부 두 곳은 무수정으로 컴파일되며 테스트도 green 입니다.
  - 기본 포커스 취소, 중복 제출 가드, LOCKED 색 규칙은 그대로입니다.
  - 폰에서는 본문이 세로 스크롤되고, 종목명은 줄바꿈으로 전체를 노출합니다.

## 검증

- `pnpm --filter @gh-radar/webapp test`: 84 files, **1202 passed**, 1 skipped (하한 1008)
- `pnpm --filter @gh-radar/webapp run typecheck`: exit 0
- `eslint` 로 변경 4파일을 검사해 0 문제였습니다.
- 계획의 grep 게이트는 모두 통과했습니다. 비율 버튼 0건, 벽시계 0건, `affordanceOf` 6회, `canModify` 6회, `DialogDescription` 존재를 확인했습니다.
- 컨테이너 쿼리의 실제 전환은 jsdom 이 평가하지 않습니다. 테스트는 클래스까지만 단언하고, 실폭 전환은 18-13 Playwright 가 맡습니다.

## Deviations from Plan

**1. [실행 순서] Task 3(다이얼로그)을 먼저 실행**
- 폼(Task 1·2)이 확장된 `detail` 계약(`buttonMode`·`mode:'modify'` 등)에 타입으로 의존합니다. 그래서 다이얼로그를 먼저 넓혔습니다. 각 Task 는 RED 커밋 → GREEN 커밋 순서를 지켰습니다.

**2. [Rule 2 - LOCKED 색 규칙 우선] 정정·취소 확정 버튼에 `--primary` 를 쓰지 않음**
- UI-SPEC §Primary 는 「확인 다이얼로그의 정정/취소 확정 버튼」을 `--primary` 로 적었습니다. 그런데 `--primary` 는 `--down`(매도 파랑)과 값이 같습니다.
- 그래서 정정 확정은 원주문 방향색으로 채웠고, 취소 확정은 기존의 테두리 + `--destructive` 텍스트를 유지했습니다.

**3. [Rule 2] 원주문 선택 칩에 `--accent` 를 쓰지 않음**
- plan 이 이 파일에서 파랑 강조 토큰 등장을 금지하므로, 칩은 중립 표면(`--muted` 배경 + `--fg` 테두리)으로 그렸습니다.

**4. 폼 경로 취소 다이얼로그의 닫기 버튼은 「닫기」**
- UI-SPEC 은 취소 버튼 문구를 「취소」로 적었습니다. 취소 다이얼로그에서는 「취소」와 「취소 주문」이 나란히 서게 되므로, 기존 「닫기」를 유지했습니다.
- 기존 미체결 표 경로는 옛 요약과 「✕ 주문 취소」를 유지합니다(`accountNo` 부재로 구분).

**5. [Rule 3] `order-panel.tsx` 의 `DISABLED_LABEL` 을 export**
- `files_modified` 밖이지만 한 단어 변경입니다. 연결 상태 문구 표를 두 벌 만들지 않으려는 것입니다.

**6. 문구 신설(UI-SPEC 에 원문이 없던 자리)**
- 정정 잠금 `title` 3종을 새로 썼습니다.
  - 「시간외종가 주문은 정정할 수 없어요 · 취소 후 재등록」
  - 「예약 주문은 정정할 수 없어요 · 취소 후 재등록」
  - 「시간외종가는 정정할 수 없어요 · 취소 후 재등록」
- 선택 차단 사유 2종도 새로 썼습니다.
  - 「접수 전(주문번호 없음)은 선택할 수 없어요」 — 기존 VI 확인 체크의 문구 형식을 따랐습니다.
  - 「취소가 이미 나간 주문이에요」

## 다음 plan 이 알아야 할 것

- **18-09 (미체결 표):**
  - 행 선택 `disabled` + `title` 에는 `unfilledSelectBlockReason(row)` 를 그대로 쓰면 됩니다.
  - 선택 상태는 상위가 소유하고 `ManualOrderForm` 의 `selectedUnfilled`/`onClearSelection` 으로 내려줍니다.
- **18-10 (CardBody):**
  - `ManualOrderEntry` 의 `options` 에 `LimitChaserForm`, `form` 에 `ManualOrderForm` 을 넣으면 됩니다.
  - 폰 밴드 3탭 중 「매수/매도」 클릭은 `onOptionsTab('buy'|'sell')` 으로만 올라옵니다. `LimitChaserForm` 이 자체 매수/매도 탭을 갖고 있으므로, 18-10 에서 그 탭을 제어형으로 바꾸고 폰 밴드에서 자체 탭 줄을 숨겨야 3탭이 한 줄이 됩니다.
  - 호가 사다리 가격 클릭은 `selectedPrice={{price, seq}}` 로 넘기면 됩니다. 0 이하는 폼이 no-op 으로 처리합니다.
  - 호가 탭의 참고 종가는 `referenceClose` 로 넘깁니다.
- **18-11:** 작업대 카드의 `accountNo`·`exchange` 는 카드 키에서 옵니다. 폼에는 계좌 행이 없습니다.

## Known Stubs

없습니다.

## Threat Flags

없습니다. 주문 경로는 기존 `sendOrder`(relay wss) 하나이고, T-18-30~34 mitigation 은 테스트로 단언했습니다. 다이얼로그 건너뛰기 0건, 연타 1회 전송, `canModify` 3조건, 미표시 조각 수 미전송을 확인했습니다.

## Self-Check: PASSED

- 신설 3파일이 존재함을 확인했습니다.
- 커밋 6건(83456b0 · 2bf1415 · d647bc0 · d1a7c6d · 7587561 · 0844969)을 git log 에서 확인했습니다.
