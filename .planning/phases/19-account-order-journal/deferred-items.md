# Phase 19 — Deferred Items

범위 밖에서 발견한 문제. 이 phase 의 plan 이 고치지 않았다.

## 19-03 발견

- **`scripts/verify-dma-orders-price-check.sh` 가 pgTAP 계획 수 불일치를 통과시킨다.** 판정식이
  `psql exit != 0 || grep '^not ok'` 뿐이라 `# Looks like you planned 80 tests but ran 79` 가 떠도
  `# RESULT: PASS` · exit 0 이다(19-03 Task 3 에서 plan(80) 오기로 실측). `finish(true)` 는 실패 단언이
  있을 때만 RAISE 하고 계획 수 불일치에는 RAISE 하지 않는다. 19-xx plan 들의 `<fails_when>` 은 이 줄을
  실패로 적고 있으므로, 지금은 실행자가 출력을 눈으로 확인해야 한다.
  제안: 판정식에 `|| printf '%s\n' "$out" | grep -q '^# Looks like you planned'` 를 더한다(한 줄).
  dma_orders 회귀 테스트와 공용 스크립트라 19-03 파일 범위 밖이다.

## 19-08 발견

- **표 머리의 숫자 열(`TableHead className="num"`)이 오른쪽 정렬되지 않는다 — 앱 전역.** `globals.css`
  `.tbl-wrap thead th { text-align: left }`(명시도 0,1,2)가 `.num { text-align: right }`(0,1,0)를 이겨,
  「수량」·「가격」 머리가 왼쪽에 붙고 그 아래 숫자는 오른쪽에 붙는다(19-08 데스크톱 스크린샷
  `19-08-today-orders-wide-*.png` 에서 실측 · 목업은 `.num { text-align: right !important }` 라 오른쪽).
  오늘 주문 카드만의 문제가 아니다 — account-panel 미체결·잔고 표 등 `num` 머리를 쓰는 모든 표가 같다.
  제안: `globals.css` 에 `.tbl-wrap thead th.num { text-align: right; }` 한 줄. 모든 표 표면에 번지는
  변경이라 19-08(오늘 주문 카드) 범위 밖으로 남긴다.
