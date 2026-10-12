---
phase: 31
review: 31-REVIEW-R3.md
round: 3
findings:
  - id: R3-WR-01
    severity: warning
    disposition: fixed
    fixed_by: b977002f
    title: "IN-02 수정이 「조기 성공」을 「거짓 거부」로 바꾼다 — 같은 키 옛 푸시(금액 0 · 같은 주)가 먼저 오면 즉시 rejected"
  - id: R3-IN-01
    severity: info
    disposition: accepted
    note: "효과가 관측되지 않아 테스트로 고정할 수 없다 — 아래 본문"
    title: "IN-05 폼 수준 변경(subOf · hint 의 lcBaseValues)을 되돌려도 깨지는 테스트가 없다"
  - id: R3-IN-02
    severity: info
    disposition: fixed
    title: "armBlockOf 머리 주석 「☐자동 끄기는 열려 있다」가 ☐줄매수도 켜진 조합에서는 거짓"
  - id: R3-IN-03
    severity: info
    disposition: not_applicable
    note: "리뷰 Fix 가 R3-WR-01 (b) 선택 때만 할 일 — (a) 로 고쳐 해당 없음"
    title: "echoKnowsAmounts 가 금액 8필드 모두 0 인 에코에서 관용 유지 — 옛 전략 · 구 탭 전략에는 IN-02 효과 없음"
  - id: R3-IN-04
    severity: info
    disposition: fixed
    title: "줄매수 최소 > 최대 판정이 제출 주끼리로 바뀌었는데 UI-SPEC 230행 · 31-04-PLAN 38행은 「금액끼리」"
---

# Phase 31 — Code Review Disposition (Round 3)

verify-work 31 의 재검증(stale 해소) 중 code_review_gate 가 돌린 3라운드 리뷰다. 게이트는 advisory 라 phase 진행을 막지 않는다. R3-WR-01 은 사용자 지시로 (a) 안(모호한 에코 = 거부 대신 에코 유예)으로 고쳤다(b977002f — shared `amountEchoIsAmbiguous` · 훅 유예 분기 · 운영 배선(답 신호 증가)을 모사한 훅 테스트 4건, 수정 전 코드에서 3건 실패 확인). 

## R3-IN-01~04 처리 (2026-10-12)

- **R3-IN-01 — accepted.** 아래 줄(`lcQtyRowSubOf`) · 시트 안내(`lcAmountHintOf`)가 `values` 에서 읽는 값은 그 그룹 비교가 하나다(`lcSubmitQtyOf` → `qtyForSubmit(amount, values[price], echo(server))`). 폼의 비교가는 값 필드라 낙관 반영이 없고(훅 ④), `formFromServer` 동기 이펙트로만 바뀐다. 그래서 `form` 과 `lcBaseValues(server, form)` 의 비교가가 갈리는 때는 서버 값이 바뀐 렌더와 동기 이펙트 사이 한 프레임뿐이다. 그 프레임에서 옛 코드(`form`)의 출력은 직전 프레임과 같은 글자라 DOM 에 차이가 남지 않는다 — 어떤 렌더 테스트도 두 코드를 구분할 수 없다. 코드는 잠금 · cfg 와 같은 기준값을 쓴다는 일관성 때문에 그대로 두고, 회귀 고정 없음을 알려진 한계로 받아들인다.
- **R3-IN-02 — fixed.** `armBlockOf` 머리 주석을 「☐줄매수가 꺼져 있을 때 ☐자동 끄기 · ☐줄매수 끄기 · 최소/최대 수정 · 철거」로 고치고, ☐줄매수 · ☐자동이 둘 다 켜지면 ☐자동 끄기가 막히는 이유(`isDisarm` 면제 없음)를 적었다.
- **R3-IN-03 — not_applicable.** R3-WR-01 을 (a) 로 고쳤다.
- **R3-IN-04 — fixed.** `31-UI-SPEC.md` 등록 차단 줄 · `31-04-PLAN.md` must-have 줄에 정정 문구, `31-CONTEXT.md` 에 D-21(제출 주끼리) 을 남겼다.
