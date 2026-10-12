---
phase: quick-261012-oif
plan: 01
status: complete
subsystem: webapp/trading/limit-chaser
tags: [lc, ui, chevron, fold, burst]
requires: []
provides:
  - "매수취소 접이식 카드 (FoldSlot cancel · lcSummaryOf cancel)"
  - "☐버스트 취소 = 매수주문 카드 마지막 행"
  - "값 쉐브런 L3 임계 @min-[360px]/lc"
affects: [webapp/e2e/specs/trading-workbench.spec.ts]
key-files:
  modified:
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/styles/globals.css
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "쉐브런 L3 임계 X = 360. 실측 X0 ≈ 348(P20-3 최악값 기준)에 8을 더해 10 단위로 올린 값이다. 밴드 경계(685 · 830 · 992)는 그대로다."
metrics:
  completed: 2026-10-12
  tasks: 2
actuals:
  tokens: 16900
  tasks: 2
  commits: 2
plan_head_before: 9f31990c67ea173232234a076cf46669692e8575
plan_head_after: 3fb8ecbd070c5d499768c546fcaba9184992a8d0
---

# Quick 261012-oif: 상따 카드 4건 수정 요약

상따 설정 카드 네 가지를 고쳤다. 매도주문의 「잔량추적 기준선」 행을 지웠고, 매수취소 카드를 자동매도처럼 접히게 바꿨다. ☐버스트 해제는 「버스트 취소」로 이름을 바꿔 매수주문 카드 맨 아래로 옮겼다. 값 쉐브런은 실측을 근거로 lc 360px 이상이면 보이게 했다(기존 685px). 필드명 · checkId · 와이어 · 에코 로직은 손대지 않았다.

## 커밋

| Task | 내용 | Commit |
| ---- | ---- | ------ |
| 1 | 기준선 행 삭제 · 매수취소 접이식 · 버스트 취소 이동 (items 2/3/4) | 03584822 |
| 2 | 쉐브런 임계 실측(685 → 360) · e2e 정합 (item 1) | 3fb8ecbd |

## 쉐브런 임계 실측 (P20-3 최악값 · 쉐브런 강제 표시 · L2 그대로 · 임시 수정은 되돌림)

pane마다 가장 작은 여유(px)를 적었다(`free` = 행 안쪽 폭 − 라벨/값 내용 폭 − gap).

| lc 폭 | 매수 pane 최소 여유 | 매도 pane 최소 여유 |
| ----- | ------------------- | ------------------- |
| 684 | 180.7 (○체결량) | 192.6 (○체결) |
| 600 | 132.0 (○체결량) | 143.9 (○체결) |
| 520 | 85.6 (○체결량) | 97.5 (○체결) |
| 460 | 50.8 (○체결량) | 62.7 (○체결) |
| 420 | 27.6 (○체결량) | 39.5 (○체결) |
| 380 | 4.4 (○체결량) | 16.3 (○체결) |
| 376 | 2.1 (○체결량) | 14.0 (○체결) |
| 372 | 12.4 (최소 잔량 — ○체결량은 L4b로 접힘) | 11.7 (○체결) |
| 364 | 7.8 (최소 잔량) | 7.0 (○체결) |
| 360 | 5.5 (최소 잔량) | 4.7 (○체결) |
| 356 | 3.2 (최소 잔량) | 2.4 (○체결) |
| 352 | 0.8 (최소 잔량) | 0.1 (○체결) |
| 348 | 1.9 (매도잔량 — 「최소 잔량」은 L4로 접힘) | 1.9 (매수잔량 — ○체결은 L4b로 접힘) |
| 344 | **−0.4** (매도잔량) | **−0.4** (매수잔량 · 취소 매수잔량) |

- 여유는 폭 1px당 약 0.58px씩 늘었다. 카드 본문이 호가 | 옵션으로 나뉘어 있어서다. 계획이 가정한 1:1은 아니었다.
- **X0 = 348.** 여유 ≥ 0인 가장 좁은 실측 폭이다. 확인용으로 X0−4 = 344도 쟀더니 −0.4로 0 아래였다. 보간하면 약 344.7이다.
- **X = 360.** X0에 8을 더해(356) 10 단위로 올린 값이다. P20-3 상시 가드에서 360의 최소 여유는 +4.7px(매도 「○ 체결」)다.
- 360~372 구간에서는 최악값 「○ 체결량」 라벨이 원형 체크 아래 줄로 접힌다(L4b — Phase 31에 이미 있던 대비책이고 잘림은 아니다). 쉐브런이 없으면 이 폭에서는 접히지 않으니, 쉐브런 때문에 생기는 접힘이다. 다만 999,999,999만 같은 최악값에서만 그렇다.
- 390 폰(P24-8 · 카드 폭 372)에서도 이제 값 쉐브런이 보인다.

## e2e 결과 (Playwright --workers=1)

- **P20-3 통과.** 대상 폭은 344 · 360 · 685 · 830 · 992다. 최소 여유는 344: 3.9 · 360: 4.7 · 685: 0.4 · 830: 2.9 · 992: 38.
- **P24-7 통과.** 접힌 요약 줄은 매도 pane 2개, 2열 5개다. cancel 요약 줄은 모든 폭에서 2줄이다.
- **P24-8 통과.** 탭 줄 위에서 후매수 카드 아래까지 **646px(한도 660)**. 매수주문 카드 172 · 선매수 119 · 줄매수 119 · 후매수 159 · 카드 폭 372.

## 단위 테스트

- 타입체크 통과.
- webapp vitest 전체(--maxWorkers=2): 165개 파일, 4023개 통과 · 1개 skip.

## 계획과 다른 점

### 자동 수정한 것

**1. [Rule 3 - Blocking] card-body.test 「섹션 라벨 없음」 단언 수정**
- **발견 시점:** Task 1 검증
- **문제:** 매수취소가 접히면서 요약 줄에 kv 키 「체결」이 생겼다. 그런데 이 테스트는 「체결」 글자를 체크 행 라벨에서만 허용하고 있었다.
- **수정:** `[data-slot="lc-group-summary"]` 안의 kv 키도 허용하도록 필터를 넓혔다. 이 파일은 계획 Task 1 `<files>`에는 없지만 verify 목록에는 있었다.
- **수정 파일:** webapp/src/components/trading/__tests__/card-body.test.tsx
- **Commit:** 03584822

**2. [범위 정리] P20-3 상시 가드용 상수 추가**
- e2e 스펙에 `LC_CHEVRON_MIN = 360` 상수를 만들어 P20-3 대상 폭과 테스트 제목에 썼다. 숫자 리터럴을 흩뿌리지 않으려는 것이다.
- P24-7 제목에서 「L4 라벨 접힘」 문구를 뺐다. 그 행이 사라졌기 때문이다.

## 메모

- e2e에서 `lc-cancel-trade` · `lc-cancel-qty-track` · `lc-cancel-watch-qty`를 클릭하는 곳은 없었다. 값을 읽는 `lcValue` / `lcSub`만 있고, 이 둘은 숨은 요소도 읽는다.
- 4c 테스트(갤럭시 폴드)는 펼치는 그룹이 여전히 3개이고 cancel을 펼치지 않는다. 계획 범위 밖이라 돌리지 않았다.
- `webapp/src/lib/limit-chaser.ts:760` 주석의 「버스트 해제」는 서버 동작(줄매수를 내림)을 설명하는 말이라 그대로 두었다.

## Self-Check: PASSED

- FOUND: 03584822, 3fb8ecbd (HEAD 조상)
- `grep -c "@min-\[685px\]/lc:inline" setting-group.tsx` = 0
- `['"\`]잔량추적 기준선` 0건 · 주석이 아닌 「버스트 해제」 0건
- git diff에 임시 ladder · console.log · 강제 inline 잔존 없음
