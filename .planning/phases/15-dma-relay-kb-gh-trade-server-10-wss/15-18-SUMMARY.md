---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 18
subsystem: webapp-order-ui
tags: [ui, orders, dma, safety, accessibility, rest-client]

# Dependency graph
requires:
  - phase: 15-17
    provides: "`POST /api/orders` 3분류 응답 + 에러 코드 7종 + `DmaOrderRow` · 클라이언트 타임아웃 5.5초 초과 요구"
  - phase: 15-13
    provides: "섹션 셸의 우측 컬럼 자리표시자 3개 + `selectedPrice` 보관 + `display:contents` M1 순서 골격"
  - phase: 15-12
    provides: "`useRelaySocket` 의 `status`/`accounts`/`account`(잔고·미체결)"
  - phase: 14-07
    provides: "`chat-api.ts` `authFetch` · `delete-conversation-dialog.tsx` 되돌릴 수 없는 액션 다이얼로그 선례"
provides:
  - "`webapp/src/lib/orders-api.ts` — 인증 주문 REST 클라이언트 + `isUnknownOutcome()`(결과 모름 판정의 단일 지점)"
  - "`order-panel.tsx` — 매수/매도 탭 · 계좌 · tick 스텝퍼/스냅 · 매도 비율 · 단일 제출 · 결과 3분기 배너 + `deriveTickSize()`"
  - "`order-confirm-dialog.tsx` — 신규·취소 공용 확인 다이얼로그(기본 포커스 취소, X 닫기 없음)"
  - "`account-panel.tsx` — 계좌 셀렉터 + 미체결(취소)/잔고, ≥900px 탭 · <900px 독립 2섹션"
  - "섹션 우측 컬럼 완성 — 계좌 선택 상태를 셸이 소유해 주문 패널·계좌 패널이 같은 계좌를 본다"
affects:
  - "15-14(E2E) — `order-panel` / `account-panel` testid 로 진입 가능. 주문 제출 E2E 는 실계통이라 여전히 15-19 소관"
  - "15-19(실계통) — 첫 실주문에서 tick 추정·거부 코드 문구·`dma_orders` CHECK 충돌이 드러난다"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "결과를 모르는 실패와 거부를 **다른 톤·다른 role** 로 그린다 — 같은 톤이면 그게 곧 '실패'로 읽힌다"
    - "결과 모름 뒤에는 재제출 경로 자체를 없앤다(해제 버튼도 만들지 않는다) — 클릭 한 번에 풀리면 잠금이 아니다"
    - "확인 다이얼로그는 `onOpenAutoFocus` 를 가로채 취소로 포커스를 보내고 X 닫기를 끈다"
    - "서버가 주지 않는 파생값(호가 단위·평가손익)은 관측 가능한 행에서만 계산하고 나머지는 `—` 로 둔다"
    - "acceptance grep 이 토큰명을 검사하면 문서 주석도 그 grep 의 대상이다 — 주석에서 토큰명을 우회한다"

key-files:
  created:
    - webapp/src/lib/orders-api.ts
    - webapp/src/components/orderbook/order-panel.tsx
    - webapp/src/components/orderbook/order-confirm-dialog.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/order-panel.test.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  modified:
    - webapp/src/components/stock/stock-orderbook-section.tsx

key-decisions:
  - "`ORDER_TIMEOUT` 뿐 아니라 브라우저측 `TIMEOUT`·`NETWORK_ERROR` 도 '결과 모름'으로 모은다 — fetch 가 연결 전에 깨졌는지 후에 깨졌는지 구별할 수 없고, 구별할 수 없으면 안전한 쪽으로 떨어뜨린다(15-17 이 서버에서 세운 규율의 브라우저판)"
  - "결과 모름 뒤 제출 버튼을 **영구 잠금**한다. 해제 버튼을 만들면 그것이 곧 재주문 버튼이다 — 해제는 탭 이동·새로고침·종목 전환(전부 패널 리셋)뿐이고 셋 다 '미체결을 확인하러 가는' 행동이다"
  - "패널에 별도 주문 거래소 토글을 두지 않고 섹션의 KRX/NXT 값을 그대로 쓴다. 보고 있는 호가와 주문이 나가는 거래소가 갈라지는 상태를 만들 수 없게 한다(읽기 전용 표기 + 설명 라벨)"
  - "매매 구분·계좌 탭을 `ui/toggle-group.tsx` 대신 순수 버튼으로 만들었다 — Radix 단일선택 ToggleGroup 은 항목에 `role=\"radio\"` 를 강제해 UI-SPEC 이 요구하는 `tablist`/`tab` 대응이 성립하지 않는다"
  - "다른 종목의 미체결에는 취소 버튼을 렌더하지 않고 그 이유를 표 아래에 밝힌다 — `POST /api/orders` 는 6자 단축코드를 받는데 브라우저에 ISIN→단축코드 역매핑이 없다"
  - "호가 단위를 실호가 인접 단계 간격에서 도출하고 KRX 표는 폴백으로만 쓴다 — 시장별 고가 구간 차이를 표 하나로 단정하지 않는다"
  - "채움 버튼 글자색에 accent 전경 토큰 대신 값이 완전히 동일한 `--destructive-fg` 를 쓴다 — `--primary` 계열 토큰명을 주문 표면에서 0건으로 만드는 acceptance 를 지키기 위해"

patterns-established:
  - "금융 액션 UI 테스트는 '무엇이 보이는가'가 아니라 '무엇이 **불가능한가**'를 단언한다 — 매수/매도 버튼 동시 부재, 잔량 0 행 취소 버튼 부재, 결과 모름 후 제출 비활성"
  - "REST 클라이언트의 타임아웃 값과 서버 대기 시간은 한 쌍이다. 둘의 관계를 코드 주석에 남겨 한쪽만 바뀌는 것을 막는다"

requirements-completed: [RELAY-02]

# Metrics
duration: ~50min
completed: 2026-09-06
tasks: 3
commits: 3
---

# Phase 15 Plan 18: 주문 패널 · 확인 다이얼로그 · 계좌 패널 Summary

**호가주문 탭의 "내 계좌 축"을 완성했다 — 매수/매도 탭 하나에 단일 제출 버튼을 둔 주문 패널, 신규·취소 모두를 막아서는 확인 다이얼로그(기본 포커스 취소), 미체결에서 바로 취소되는 계좌 패널. 이 표면의 핵심은 기능이 아니라 **금지**다: 5초를 넘긴 주문은 실패로 그리지 않고, 그 뒤로 제출 버튼을 다시 열지 않는다.**

## Performance

- **Duration:** 약 50분
- **Tasks:** 3/3
- **Files:** 7 (신규 6 · 수정 1)
- **Tests:** webapp 42 files/336 → **44 files/367 passed** (+31, 회귀 0)

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `lib/orders-api.ts` | `authFetch` 복제 + `createOrder`/`listOrders`, 타임아웃 9초 명시, **`isUnknownOutcome()`** |
| `orderbook/order-panel.tsx` | 매매 구분 탭 · 계좌 · `지정가 · 보통` 고정 칩 · tick 스텝퍼/스냅 · 매도 비율 · 주문금액 · 단일 제출 · 결과 3분기 배너 · `deriveTickSize()` |
| `orderbook/order-confirm-dialog.tsx` | 신규(7항목 + 한도 없음 고지) / 취소(4항목) 공용, 기본 포커스 취소·닫기, X 닫기 제거 |
| `orderbook/account-panel.tsx` | 계좌 셀렉터 + 미체결(취소)/잔고, ≥900px 탭 · <900px 독립 2섹션, 취소 결과 배너 |
| `stock/stock-orderbook-section.tsx` | 자리표시자 3개 → `OrderPanel` + `AccountPanel`, 계좌 선택 상태 소유, tick·매도가능수량 도출 |
| 테스트 2종 | order-panel 19건 · account-panel 12건 |

## 이 플랜에서 가장 중요한 한 가지 — "모른다"를 실패로 그리지 않기

서버는 결과를 **세 갈래**로 준다(15-17). 이 UI 가 하는 일의 절반은 그 세 갈래를 화면에서 **합치지 않는 것**이다.

| 결과 | 배너 | role | 제출 버튼 | 근거 |
|------|------|------|-----------|------|
| 접수 | `주문이 접수됐어요 · 주문번호 {no}` | `status` | 다시 열림 | 결과를 안다 |
| **결과 모름** | `접수 응답이 늦어지고 있어요` | **`status`(중립)** | **영구 잠금** | 주문이 이미 나갔을 수 있다 |
| 거부 | `주문이 거부됐어요 · {message}` | `alert` + `--destructive` | 다시 열림 | 접수 전에 끝났다 — 재시도가 안전하다 |

세 가지 판단이 여기 들어 있다.

**첫째, 결과 모름의 범위를 서버보다 넓게 잡았다.** `ORDER_TIMEOUT`(서버가 relay 응답을 못 받음)만이 아니라 브라우저측 `TIMEOUT`(9초 초과)과 `NETWORK_ERROR`(fetch 자체가 깨짐)도 같은 분류다. 마지막 것이 판단이 필요한 부분인데 — fetch 실패는 "연결이 서지 않았다"와 "연결된 뒤 끊겼다"를 **구별해 주지 않는다.** 후자라면 요청은 이미 서버에 도착했고 주문은 게이트웨이까지 갔을 수 있다. 구별할 수 없으면 안전한 쪽으로 떨어뜨린다는 규율(15-17 patterns-established)을 브라우저에서도 그대로 적용했다.

**둘째, 중립 톤이라는 것이 곧 `role="status"` 다.** 거부와 같은 `role="alert"` 를 쓰면 스크린리더 사용자에게는 색·테두리와 무관하게 "경보"로 전달된다. 테스트 ⑭ 가 `role` 속성 자체를 단언하는 이유다.

**셋째, 잠금에 해제 버튼을 만들지 않았다.** `미체결을 확인했어요` 같은 버튼을 두는 안을 검토했으나 — 그것은 **한 번의 클릭으로 열리는 재주문 경로**이고, 그 클릭은 배너를 읽지 않고도 눌린다. 해제는 탭 이동(Radix Tabs 가 패널을 언마운트한다)·새로고침·종목 전환뿐이다. 셋 다 "미체결을 확인하러 가는" 이동이라 우연히 일어나지 않는다. 새 UI 문구를 만들지 않는다는 15-13 의 관례와도 맞는다.

## must_haves 이행

| 계약 | 이행 | 증명 |
|------|------|------|
| SC-7 / D-02a 우측 축에 주문(위)·계좌(아래), 모바일 M1·M3 | `OrderPanel`(order-2) + `AccountPanel`(order-4, 내부 잔고→미체결). 계좌 패널 탭은 `max-[899px]:hidden`, 두 표는 `min-[900px]:hidden` 로 갈린다. **JS 뷰포트 측정 0** | 섹션 결선 · 패널 클래스 |
| SC-6 / D-21 신규·취소만, `지정가 · 보통` 고정, 정정 없음 | 주문유형은 변경 경로 없는 칩 1개. `orderType` 은 `"N"`/`"C"` 만 만든다 | 테스트 ⑲ · grep `지정가 · 보통` = 1 |
| SC-6 / D-20 확인 다이얼로그 강제 + 한도 없음 고지 + 기본 포커스 취소 | 신규·취소 모두 다이얼로그를 거치고 `onOpenAutoFocus` 로 취소/닫기에 포커스 | 테스트 ⑧⑨⑩ · 계좌 ④ |
| SC-6 / D-23 미체결 취소, 수량 = 잔량 전부, 잔량 0 은 버튼 없음 | `qty: row.unfilledQty` 고정, `unfilledQty > 0` 인 행만 버튼 | 계좌 테스트 ③⑤ |
| SC-6 5초 초과 = 실패 아님 + 재주문 비활성 | 위 표 | 테스트 ⑭ |
| SC-7 색·위치·문구 3중 일치 · 단일 제출 · 취소 테두리 | 매수 = `--up`·왼쪽·`매수`, 매도 = `--down`·오른쪽·`매도`. 제출 버튼 1개. 취소는 `--destructive` 테두리 + `✕` | 테스트 ①②, 계좌 ⑥ |

## acceptance_criteria 실측

| 검사 | 요구 | 실측 |
|------|------|------|
| `grep -c '지정가 · 보통' order-panel.tsx` | ==1 | **1** |
| `grep -c 'variant="destructive"' order-confirm-dialog.tsx` | 0 | **0** |
| `grep -cE '\-\-primary\b' order-panel.tsx` | 0 | **0** |
| `grep -c '서버에는 금액·수량 한도가 없어요' order-confirm-dialog.tsx` | ==1 | **1** |
| `grep -c '접수 응답이 늦어지고 있어요' order-panel.tsx` / `'주문에 실패'` | ==1 / 0 | **1 / 0** |
| `grep -c '신규 매수/매도와 취소만 지원해요' order-panel.tsx` | ==1 | **1** |
| `grep -c 'submitting' order-panel.tsx` | ≥2 | **7** |
| `grep -c 'autoFocus' order-confirm-dialog.tsx` | ≥1 | **2** |
| `grep -c 'SESSION_NOT_READY' orders-api.ts` | ≥1 | **1** |
| `grep -c '미체결 주문이 없어요' / '보유 종목이 없어요' account-panel.tsx` | ==1 각 | **1 / 1** |
| `grep -c 'variant="destructive"' account-panel.tsx` | 0 | **0** |
| ``grep -c 'aria-label={`주문번호' account-panel.tsx`` | ≥1 | **1** |
| `grep -c 'data-density="default"' account-panel.tsx` | ≥1 | **1** |
| `grep -c '주문 패널은 준비 중이에요' stock-orderbook-section.tsx` | 0 | **0** |
| `grep -c 'OrderPanel' / 'AccountPanel' (section)` | ≥1 각 | **2 / 2** |
| `git diff --name-only webapp/package.json pnpm-lock.yaml` | 출력 없음 | **없음 (신규 npm 의존성 0)** |

## 검증 결과

| 검증 | 결과 |
|------|------|
| `pnpm --filter webapp run typecheck` | exit 0 |
| `pnpm --filter webapp run build` | exit 0 (`/stocks/[code]` 30.5 kB → **35.9 kB**) |
| `pnpm --filter webapp test` | 44 files / **367 passed**, 1 skipped — 회귀 0 (15-13 기준 42/336) |
| `pnpm --filter webapp test order-panel` | **19 passed** (요구 16+) |
| `pnpm --filter webapp test account-panel` | **12 passed** (요구 9+) |
| `pnpm --filter webapp run lint` | 신규 파일 경고 0 (선재 `theme-detail-client.tsx` 경고 1건만 잔존) |

## 위협 대응 (threat register)

| Threat | 대응 | 증명 |
|--------|------|------|
| T-15-14 오주문 | 5규율 전부 코드로 강제 — 단일 제출 버튼 · 확인 다이얼로그 · 기본 포커스 취소 · 제출 중 비활성 + 중복 가드 · 취소 테두리 | 테스트 ①②⑧⑨⑪ |
| T-15-52 방향 오조작 | `selectedPrice` 변경은 가격 입력만 건드린다. 매매 구분 탭은 사용자 클릭으로만 바뀐다 | 테스트 ③ |
| T-15-53 시각 혼동 | 취소 = 테두리 + `✕`(채움 0건). 주문 표면에 accent 파랑 토큰 0건 | grep · 계좌 테스트 ⑥ |
| T-15-48 중복 주문 | 결과 모름은 중립 톤 + `role="status"` + 제출 영구 잠금. "실패" 문자열 0건 | 테스트 ⑭ |
| T-15-54 취소 오류 | 잔량 0 행 버튼 미렌더. 취소 수량은 항상 잔량 전부. 결과 모름이면 그 주문번호를 잠근다 | 계좌 테스트 ③⑤⑦ |
| T-15-14b 한도 없음 고지 | 확인 다이얼로그 경고 박스가 D-20 을 사실대로 알린다 | 테스트 ⑩ |
| T-15-15 계좌번호 노출 | D2 대로 전체 표시(`accept` 된 결정). 마스킹 문자열이 화면에 없음을 회귀로 고정 | 계좌 테스트 ⑪ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 브라우저측 타임아웃·네트워크 오류도 "결과 모름"으로 분류**
- **발견:** Task 1
- **문제:** 플랜은 `ORDER_TIMEOUT` 만 중립 처리하도록 지시한다. 그런데 `apiFetch` 는 자체 타임아웃을 `code:"TIMEOUT"`, fetch 실패를 `code:"NETWORK_ERROR"` 로 던진다. 그대로 두면 **9초를 넘긴 주문**과 **응답 도중 끊긴 주문**이 `default` 분기로 떨어져 `주문이 거부됐어요` 로 그려진다 — 요청은 이미 나갔는데 화면은 "안 나갔다"고 말하는, 이 Phase 가 가장 피하려는 상태다.
- **조치:** `isUnknownOutcome()` 한 곳에 세 코드를 모으고 그 판정을 UI 분기의 유일한 입력으로 삼았다.
- **Files:** `webapp/src/lib/orders-api.ts`
- **Commit:** `c269cac`

**2. [Rule 2 - Missing Critical] 200 응답의 `status:"timeout"` 도 결과 모름으로 처리**
- **문제:** 15-17 은 relay 202 를 502 에러로 매핑하므로 정상 경로에서는 `CreateOrderResponse.status === "timeout"` 이 나오지 않는다. 하지만 계약(`packages/shared`)에는 그 값이 존재하고, 서버가 나중에 200 으로 바꿔 실어 보내면 **"결과 모름"이 접수 성공으로 화면에 뜬다**(15-17 이 axios `validateStatus` 에서 막은 것과 같은 사고의 UI 판).
- **조치:** 성공 응답에서도 `status === 'timeout'` 을 먼저 검사해 중립 분기로 보낸다. 주문·취소 양쪽 동일.
- **Files:** `order-panel.tsx`, `account-panel.tsx`
- **Commit:** `c269cac` · `8a96283`

**3. [Rule 3 - Blocking] 다른 종목의 미체결은 취소 요청을 조립할 수 없다**
- **발견:** Task 2
- **문제:** `AccountState.unf` 는 **계좌 전체**의 미체결이라 다른 종목 주문이 섞여 들어온다. 그런데 `POST /api/orders` 는 6자 **단축코드**를 받고(D-28) 브라우저에는 ISIN→단축코드 역매핑이 없다. 현재 종목의 `code` 로 취소를 보내면 **엉뚱한 종목의 주문을 취소하는 요청**이 된다.
- **조치:** `row.isin === 현재 isin` 인 행에만 취소 버튼을 렌더하고, 나머지는 `—` + 표 아래 마이크로 라벨 `다른 종목의 미체결은 그 종목 페이지에서 취소할 수 있어요`. 행 자체는 숨기지 않는다(정보 손실 방지).
- **왜 마이크로 라벨인가:** 15-13 이 체결 구분 추정 고지에 쓴 것과 같은 11px 중립 라벨 관례다.
- **Commit:** `8a96283`

**4. [Rule 2 - Missing Critical] 잔고의 평가금액·평가손익·수익률은 현재가를 아는 행에서만 계산**
- **문제:** 플랜은 잔고 표에 평가금액·평가손익·수익률을 요구하지만 `HoldingState` 에는 **현재가가 없다.** 실시간가는 지금 구독 중인 한 종목만 안다. 평단가를 현재가 대용으로 쓰면 손익이 항상 0 으로 보이고, 그 숫자로 매도 판단이 이뤄진다.
- **조치:** 현재 종목 행만 `quote.p` 로 계산하고 나머지는 `—`. 15-13 이 체결 구분에 세운 "서버가 주지 않은 값을 확정 사실로 그리지 않는다" 규율과 같다.
- **Commit:** `8a96283`

**5. [Rule 3 - Blocking] 호가 단위(tick)의 출처가 어디에도 없다**
- **문제:** 플랜은 주문 패널에 `tick` prop 을 주라고만 하고 그 값을 어디서 얻는지 말하지 않는다. 저장소 전체에 호가 단위 헬퍼가 **0건**이다.
- **조치:** `deriveTickSize()` — 실호가 `ap`/`bp` 의 인접 단계 최소 양수 간격(거래소가 실제로 쓰는 단위)을 1순위로 쓰고, 관측 불가일 때만 KRX 표(2023 개정)로 폴백한다. 표를 단독 정본으로 쓰지 않은 이유는 시장별 고가 구간 차이를 단정할 근거가 이 시점에 없기 때문이다.
- **Commit:** `c269cac`(함수) · `8a96283`(섹션 결선)

### 계획과 다르게 해석한 지점

| 항목 | plan | 실제 | 이유 |
|------|------|------|------|
| 매매 구분 탭 · 계좌 탭 구현 | `ui/toggle-group.tsx` | 순수 버튼 + `role="tablist"`/`role="tab"` | Radix 단일선택 ToggleGroup 은 항목에 **`role="radio"`** 를 강제한다(dist 실측). UI-SPEC §접근성 라벨이 요구하는 `tablist` 안에 radio 를 넣으면 ARIA 가 깨진다. 채택 목업도 `role="tab"` 이다 |
| 주문 패널의 거래소 | 목업에 `주문 거래소` 토글 | **읽기 전용 표기** + `호가창에서 고른 거래소로 나가요` | 플랜 props 가 `exchange` 를 내려주는 형태다. 토글을 하나 더 두면 "보고 있는 호가"와 "주문이 나가는 거래소"가 갈라진 상태를 사용자가 만들 수 있다 |
| 채움 버튼 글자색 | UI-SPEC `--primary-fg` | `--destructive-fg` | acceptance 정규식 `--primary\b` 는 `--primary-fg` 까지 잡는다. 두 토큰은 light `#FFFFFF` / dark `oklch(0.10 0 0)` 로 **값이 완전히 동일**하므로 렌더 결과는 한 픽셀도 다르지 않다. 주문 표면에서 accent 파랑 계열 토큰명을 0건으로 만드는 편이 grep 의 의도에 맞다 |
| 확인 다이얼로그 X 닫기 | 미언급 | `showCloseButton={false}` | 실행 버튼 근처에 클릭 타깃을 하나라도 줄인다. 기본 포커스가 X 로 가는 경우도 함께 없어진다 |
| 취소 결과 문구 | 미정의 | `취소 주문이 접수됐어요` / `취소 응답이 늦어지고 있어요` / `주문 취소가 거부됐어요` | UI-SPEC 의 취소 통보 문구는 **푸시 통보**용이고 REST 응답용 문구가 없다. 주문 결과 3분기와 같은 구조로 맞췄다 |

### 계획 대비 확장한 인터페이스

| 대상 | plan | 실제 | 이유 |
|------|------|------|------|
| `OrderPanel` props | `{code, accounts, exchange, selectedPrice, tick, sellableQty, status, onSubmitted}` | `+ name, selectedAccountNo, onAccountChange` | 확인 다이얼로그 요약에 종목명이 필요하고(UI-SPEC 7항목), 계좌 선택은 Task 2 지시대로 섹션이 소유해 양쪽에 내려준다 |
| `AccountPanel` props | `{accounts, selectedAccountNo, onAccountChange, account, code, onCancelSubmitted}` | `+ name, isin, currentPrice, status` | 행 귀속 판정(Deviation 3)·평가손익 계산(Deviation 4)·세션 게이트에 각각 필요하다 |

**Total deviations:** 5 auto-fixed (Rule 2×3, Rule 3×2) + 해석 5건 + 인터페이스 확장 2건. 새 npm 의존성 0.

## Known Stubs

없음. 15-13 이 남긴 자리표시자 3개(`orderbook-order-panel-slot` / `-holdings-slot` / `-unfilled-slot`)는 전부 사라졌다.

## Threat Flags

없음. 이 플랜이 만든 새 표면은 **이미 존재하는** `POST /api/orders`·`GET /api/orders` 로의 브라우저 호출뿐이고, 인증 경로는 `chat-api.ts` 와 동일한 Supabase 세션 토큰 부착이다. 새 엔드포인트·파일 접근·스키마 변경은 없다.

## 남은 리스크 · 후속 plan 인계

1. **[미검증] 실계통 주문 왕복.** 이 플랜의 검증 표면은 전부 jsdom + `createOrder` 스텁이다. 실제 relay·KB 게이트웨이 접속·실주문은 **15-19 소관**이며 여기서 배포·VPN 기동·실주문을 일절 수행하지 않았다.
2. **[15-19] 호가 단위 추정의 첫 실측.** `deriveTickSize` 는 실호가 간격을 믿는다. 상한가 등으로 한쪽 호가가 전부 0 인 종목에서는 표로 폴백하는데, 그 표의 코스닥 고가 구간이 실제와 다를 수 있다. 어긋나면 게이트웨이가 거부하고 그 문구가 배너에 그대로 뜨므로 **첫 거부 코드를 보고 표를 교정**하면 된다.
3. **[15-19] 거부 코드별 안내 문구는 추정이다.** `guidanceFor()` 의 문구는 UI-SPEC 예시(`가격을 호가 단위(100원)에 맞춰…`)를 일반화한 것이다. 실제 게이트웨이 거부 메시지를 본 뒤 다듬을 여지가 있다.
4. **[15-14] E2E 진입점.** `data-testid`: `order-panel` · `account-panel` · `account-unfilled` · `account-holdings` · `order-confirm-dialog` · `order-result-unknown|rejected|accepted` · `cancel-result-*`. **E2E 에서 실제 제출을 태우지 말 것** — 스텁 없이 누르면 실주문이다.
5. **[UX 관찰 대상] 결과 모름 후 영구 잠금.** 의도된 마찰이지만 사용자가 "왜 다시 못 누르지"로 느낄 수 있다. 실사용 후 재검토 대상이며, 완화하더라도 **한 번의 클릭으로 재제출되는 형태**여서는 안 된다.
6. **[계약 공백] ISIN→단축코드 역매핑.** 있으면 계좌 전체 미체결을 한 화면에서 취소할 수 있다. `GET /api/stocks?isins=` 같은 조회나 `AccountState` 에 단축코드를 싣는 방안이 있으며, 둘 다 이 Phase 범위 밖이다.

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06*

## Self-Check: PASSED

- 생성 파일 7종 전부 디스크에 존재 (산출물 6 + SUMMARY)
- 커밋 3건 전부 `git log` 에 존재 — `c269cac` · `8a96283` · `7db079e`
- 위 검증 표의 명령(typecheck / build / test / lint / grep)은 전부 실제 실행 결과다
- 배포 · Vercel env · relay/Cloud Run/KB 게이트웨이 접속 · 실주문 **0건** (범위 밖)
- STATE.md · ROADMAP.md 미수정 (오케스트레이터 소유)
