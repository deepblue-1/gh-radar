---
phase: 24-limitchaser-buy3
round: R3
verified: 2026-09-29T12:55:00Z
status: gaps_found
previous_status: gaps_found
score: 21/22 truths verified (round-1 18건 + round-2 갭클로징 3건 전부 닫힘 확인, 신규 1건 R3-G1 미해결)
covered_files: [".planning/phases/24-limitchaser-buy3/24-18-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-18-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-19-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-19-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-20-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-20-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-21-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-21-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-22-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-22-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-23-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-23-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-24-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-24-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R2.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R3.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R4.md", ".planning/phases/24-limitchaser-buy3/24-UAT.md", ".planning/phases/24-limitchaser-buy3/24-VERIFICATION-R2.md", ".planning/phases/24-limitchaser-buy3/24-VERIFICATION.md", "packages/shared/src/relay.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/trading/__tests__/card-body.test.tsx", "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx", "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx", "webapp/src/components/trading/__tests__/strategy-card.test.tsx", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/strategy-card.tsx", "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx", "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/components/trading/strategy-log.tsx", "webapp/src/lib/limit-chaser.ts"]
covered_digest: "v1:sha256:b3012c0b3790b4ce15069a8e41f26b0c2f7d9a3e83537e96ef3b7322a4bd3c0f"
behavior_unverified: 0
overrides_applied: 3
overrides:
  - must_have: "D-03/D-04a 재해석 — buy3 에코 선매수 금액 0 은 미입력, 구서버 에코의 「금액부터 받는」 경로 제거"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — 갭이 아니라 채택된 설계 변경. round-3 에서도 재확인(24-UAT.md #83, 24-16 체크포인트 「승인」)."
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
  - must_have: "구서버 에코 — 매수주문부터 끄게 하는 규칙(끄는 방향 ∧ 결과 매수주문 OFF 만 허용)"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2)"
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
  - must_have: "WR-06 남는 한계 — 동시에 보이는 두 인스턴스 각 1건 · 한 왕복 안쪽 편집 되돌림은 compare-and-set 이월"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — 운영 서버 D-34 가 이 경로 자체를 막아 잔여 위험 낮음. round-3 에서도 재확인(24-UAT.md #83)."
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
re_verification:
  previous_status: gaps_found
  previous_score: "17/18 truths verified (1 reopened-failed via GC-WR-01 · 3 new round-2 code defects found)"
  gaps_closed:
    - "GC-WR-01 (= WR-05 재개) — 거부·다른 탭 거부의 진짜 에코 오귀속 메커니즘 자체는 닫혔다(카드가 acceptAnswer()만 하고 귀속·소비·배너 판정은 echoAnswersSent 한 곳을 본다). 단, 이 수정이 되살린 자동 체크 로그의 *내용* 정확성이 새 결함(R3-G1, 아래)이다."
    - "R2-G1 (GC-WR-02) — revertToggle 이 baseNow() 기준 서버 동기값으로 되돌린다. failQueue 는 주 필드/동반을 분리해 서버 값과 이미 같으면 성공으로 접는다."
    - "R2-G2 (GC-WR-03) — commitGroupSwitch 의 끄는 방향(D-02 전반)도 누른 순간(formRef)과 꺼내는 순간(base) 두 단계로 판정한다 — pressedLast 계산이 함수 동반을 조건부로 넘긴다."
    - "R2-G3 (GC-WR-04) — autoCheckRef/pendingAutoCheckRef 가 Partial<Record<AutoCheckGate, …>> 그룹별 슬롯이다. 그 슬롯을 소비하는 성공 신호도 sentSuccess(①에서만·실행당 최대 1건)로 분리돼(R3-WR-02 후속 수정, quick-260929-akj) 한 렌더 안에 성공이 둘이어도 앞선 그룹의 줄이 사라지지 않는다."
  gaps_remaining: []
  regressions:
    - "R3-G1 (= 24-REVIEW-R4 R4-WR-01) — GC-WR-01/R3-WR-01 수정이 되살린 「선매수·추가매수 자동 체크」 로그 줄이, 부분 거부로 서버가 실제로 눕힌 항목까지 「켬」으로 표시한다. 매도·취소 6체크 무장의 유일한 흔적인 이 로그가 부분 거부 상황에서 사실과 반대로 남는다."
gaps:
  - truth: "선매수·추가매수 자동 체크 로그(D-06/D-35, 「무장의 유일한 흔적」)가 실제로 서버에 선 값만 「켬」으로 적고, 서버가 거부한 항목을 켠 것으로 잘못 기록하지 않는다"
    status: failed
    reason: |
      24-REVIEW-R4 (R4-WR-01)가 코드로 확인하고 본 검증이 직접 재확인했다. limit-chaser-form.tsx:1083
      의 자동 체크 로그 줄 생성부가 `serverRef.current?.[gate] === true`(그룹 게이트 하나)만 에코와
      대조하고, 실제 줄 내용(`groupAutoCheckLogLine(auto)`)은 누른 순간 예측값(`auto.turnedOn`/`auto.priceFilled`)
      을 그대로 쓴다. 부분 거부(예: 매도 사전 검증 실패로 `sellEnabled:false` 에코)에서도 그룹 게이트
      (`preBuyEnabled`) 자체는 성공하므로 줄이 서고, 그 줄은 실제로는 서버가 눕힌 「매도주문」을 「켬」
      목록에 그대로 포함한다.

      직접 재현 확인: `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` 의 F1 테스트
      (`it('F1 부분 거부 — …')`, :3184)를 단독 실행하면 PASS 한다 — 이 PASS 자체가 문제다. 테스트가
      에코 `sellEnabled:false`(매도 눕힘)인 상황에서 `PRE_FULL_LINE`(「선매수 자동 체크 — 켬: 매도주문 ·
      매도>잔량추적 · … 」, 매도주문 포함)을 기대값으로 잠갔다 — 잘못된 동작이 회귀 테스트로 고정돼 있다.
      `strategy-card-flow.test.tsx:1789-1808` 의 카드 흐름 통합 케이스도 같은 모양을 기대한다.

      트레이딩 도구에서 이 로그는 "매도/취소 방어가 실제로 서 있는가"를 사람이 확인하는 유일한 수단이다
      (CLAUDE.md 프로젝트 교훈 "무로그 fail-safe 금지"). round-2 의 R2-G3/GC-WR-04 는 "로그가 통째로
      사라짐"(무로그)이었고 이번은 "로그는 서지만 거짓 내용"이다 — 사람이 ERROR 줄을 놓치면 매도 방어가
      선 줄 알고 넘어갈 수 있어 무로그보다 더 위험한 방향의 같은 결 결함이다. 레벨도 `info` 라 시각적으로
      눈에 띄지 않는다. round-1 WR-05/round-2 GC-WR-01 이 요구한 "귀속이 그 사건에 정확히 붙는다"는
      truth 를, "귀속 대상은 맞으나 내용이 틀리다"는 다른 경로로 위반한다 — 독립적 판단으로 이를 gap 으로
      분류한다(별도 follow-up 으로 미룰 사안이 아니라고 본 근거: (a) 코드 확인 완료, (b) 잘못된 값이
      이미 통과하는 테스트로 고정돼 회귀 방지막이 거꾸로 작동, (c) 트레이딩 안전 도메인에서 "방어가 선
      줄 아는" 오탐은 실제 손실로 이어질 수 있음).
    artifacts:
      - path: webapp/src/components/trading/limit-chaser-form.tsx
        issue: "1083행 — 자동 체크 로그 줄이 그룹 게이트 하나만 에코와 대조하고 내용은 누른 순간 예측값(auto)을 그대로 쓴다(R4-WR-01)"
      - path: webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
        issue: "F1 테스트(3184행)가 서버가 눕힌 항목을 「켬」으로 표시하는 틀린 로그 문장을 기대값으로 잠갔다"
      - path: webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
        issue: "1789-1808행 카드 흐름 통합 케이스도 같은 틀린 모양을 기대값으로 잠갔다"
    missing:
      - "24-REVIEW-R4.md 의 제안대로 confirmAutoChecks(auto, server) 같은 순수 함수로 예측 결과를 에코로 확정 — 요청했으나 에코에 서지 않은 항목은 「켬」에서 빼고 사유를 「서버 거부」로 옮긴다(limit-chaser.ts 판정 단일화)"
      - "F1·카드 흐름 케이스의 기대값을 실제(올바른) 문장으로 갱신 — '켬: 매도>잔량추적 · … / 켜지 않음: 매도주문(서버 거부) / …'"
      - "부수 효과 결정 — 대기 추가매수를 꺼낼 때 방금 서버가 눕힌 매도주문을 동반 함수가 다시 켜서 재요청하는 경로를 수용할지, 세션 내 「서버 거부」 기억으로 막을지 명시적으로 정한다"
---

# Phase 24: gh-trade 상따 매수주문 3종 분리 — 갭 클로징 재검증(Round 3) Verification Report

**Phase Goal:** gh-trade Phase 24 가 상따 매수를 선매수·추가매수·후매수 세 갈래로 나눴다(SetLimitChaser MsgType 10/60/64 말미 append 17필드, vtable 98~130; buy_watch_side·buy_entry_latched·MsgType 38 ArmBuyLatchReq 폐기). gh-radar 가 buy3_schema=1 을 실어 신 클라로 인정받고, relay·webapp 이 3종 분리를 반영한다.

**Verified:** 2026-09-29T12:55:00Z (KST)
**Status:** gaps_found
**Re-verification:** Yes — round 3. round-1(24-VERIFICATION.md) → 갭 클로징 24-14~24-17 → round-2(24-VERIFICATION-R2.md, gaps_found) → 갭 클로징 24-18~24-24 → 자체 코드 리뷰 3라운드(24-REVIEW-R3.md) → quick-260929-akj(3커밋) + 배너 제거(1a2c9944) → 자체 코드 리뷰 4라운드(24-REVIEW-R4.md) → **본 문서(round-3 재검증)**.

## 요약

round-2 가 남긴 4건(GC-WR-01=WR-05 재개, R2-G1, R2-G2, R2-G3) 은 **코드를 직접 읽고 재확인한 결과 전부 닫혔다.** 24-18~24-24 갭 클로징 뒤 실행된 자체 코드 리뷰 3라운드(24-REVIEW-R3.md)가 그 수정 자체에서 새 결함 2건(R3-WR-01, R3-WR-02)을 찾았고, 이는 이후 quick-260929-akj(커밋 `7fd7da49`·`214ae025`·`808a29a2`)로 코드·회귀 테스트까지 직접 확인해 닫혔다. 「다른 단말에서 변경」 배너·로그 줄 제거(`1a2c9944`)도 함께 반영됐고 회귀는 없다.

그러나 R3-WR-01 을 닫은 바로 그 수정(부분 거부에서도 자동 체크 로그가 다시 서게 함)이 **새로운 정확성 결함**을 드러냈다 — 자체 코드 리뷰 4라운드(24-REVIEW-R4.md, `R4-WR-01`)가 찾았고, 본 검증이 코드와 테스트(F1)를 직접 실행해 재확인했다:

- **R3-G1 (신규, = R4-WR-01)** — 부분 거부 뒤 되살아난 「선매수/추가매수 자동 체크」로그 줄이, 서버가 실제로 눕힌 항목까지 「켬」으로 적는다. F1 회귀 테스트가 이 틀린 문장을 기대값으로 이미 잠갔다(단독 실행 PASS 확인). 매도·취소 6체크 무장의 유일한 흔적이라는 이 로그의 존재 이유 자체를 무너뜨리는 결함으로 판단해 **gap 으로 분류**한다(판단 근거는 아래 "R3-G1 판정 근거" 참조).

human_verification 관련해서는, round-2 가 남긴 4개 항목(300ms 창 실기, 운영 웹 눈 확인, R6 두 행, 24-08 시각 2~9)이 모두 `24-UAT.md`(status: complete, 86/86 pass, 2026-09-29 완료)로 사람이 직접 확인했다 — UAT #1~#12, #83 을 근거로 재확인 완료 처리한다(아래 "Human Verification" 절 참조). round-4 리뷰가 남긴 Info 3건(R4-IN-01~03)과 round-3 리뷰의 Info 3건(R3-IN-01~03) 은 낮은 심각도로 별도 표에 기록하되 이번 라운드의 블로커로 세지 않는다.

## Round-2 갭 클로징 재검증

| ID | 내용 | 재검증 결과 | 근거 |
|---|---|---|---|
| GC-WR-01 (=WR-05 재개) | 거부·다른 탭 거부의 진짜 에코 오귀속 | ✓ VERIFIED (closed, 메커니즘) | `strategy-card.tsx` 거부 분기가 `acceptAnswer()`만 하고 귀속·소비·배너 판정은 `echoAnswersSent(…)` 한 곳으로 통일(24-REVIEW-R4 확인, 본 검증도 코드 직접 열람). **단, 이 수정이 되살린 자동 체크 로그 *내용*의 정확성은 별개 결함(R3-G1) — 아래 참조** |
| R2-G1 (GC-WR-02) | failQueue 되돌림이 prevValue(누른 순간 값) | ✓ VERIFIED (closed) | `use-lc-field-commit.ts` `revertToggle` 이 서버 있으면 `baseNow()` 기준으로 되돌림(직접 코드 확인, :500 부근 `markSuccess`/되돌림 경로). `failQueue` 가 주 필드/동반을 분리해 서버 값과 이미 같으면 성공 처리(24-REVIEW-R3 「closed」 재확인) |
| R2-G2 (GC-WR-03) | D-02 전반(끄기) 동반이 정적 값 | ✓ VERIFIED (closed) | `limit-chaser-form.tsx:1035` `pressedLast`(누른 순간 판정) 참일 때만 `(base) => …` 함수 동반을 넘겨 꺼내는 순간 `base` 로 재확인(직접 코드 확인, 라인 1025-1043) |
| R2-G3 (GC-WR-04) | 자동 체크 로그 한 칸 설계 | ✓ VERIFIED (closed) | `autoCheckRef`/`pendingAutoCheckRef` 가 `Partial<Record<AutoCheckGate, …>>` 그룹별 슬롯(직접 코드 확인, :938, :945). 그 슬롯을 소비하는 성공 신호도 `sentSuccess`(①에서만·실행당 최대 1건, :832-836)로 분리돼 한 렌더 안의 성공 2건이 겹쳐도 앞 그룹 줄이 사라지지 않는다(R3-WR-02 후속 수정, quick-260929-akj 로 닫힘) |

**round-1 truth 1~13**(relay 와이어·구조·배포 등) 은 이번 라운드에도 relay 무변경을 재확인했다: `packages/shared/src/relay.ts`·`relay/src/` 의 마지막 phase-24 관련 커밋은 `24-10`(주석 정정)이며, 이후 커밋(`104ab050` 등)은 phase 25 준비용 관찰자/저널 기능으로 buy3 로직과 무관하다.

## Round-3/4 자체 코드 리뷰 후속 재검증

| ID | 내용 | 재검증 결과 | 근거 |
|---|---|---|---|
| R3-WR-01 | 부분 거부 ERROR 가 먼저 올린 답 신호를 훅이 「주 필드 거부」로 읽어 in-flight 실패·대기 폐기·자동 체크 줄 소실 | ✓ VERIFIED (closed, 메커니즘) | `use-lc-field-commit.ts:851-861` 유예 로직(`rejectGraceTimer`, `LC_REJECT_ECHO_GRACE_MS=1000`) 직접 확인. 훅 H1~H4, 폼 F1·F2 회귀 테스트 존재 확인, `H1 리뷰어 재현` 단독 실행 PASS 재확인 |
| R3-WR-02 | 성공 신호 한 칸이라 같은 실행의 성공 2건 중 하나가 덮임 | ✓ VERIFIED (closed) | `sentSuccess` 가 `matches` 분기(①)에서만 오르고(:832-836) 한 실행당 최대 1건. 폼의 (b)/(c) 소비 규칙이 `sentSuccessSeq`/`lastSentSuccessField` 를 우선 소비(limit-chaser-form.tsx:1071-1094 부근 직접 확인) |
| R4-WR-01 | 되살아난 자동 체크 로그가 서버 거부 항목을 「켬」으로 표시 | ✗ FAILED → **R3-G1 로 승격** | 아래 "신규 Round-3 갭" 참조 |

## 신규 Round-3 갭

| ID | 내용 | 심각도 | 상태 |
|---|---|---|---|
| R3-G1 (= 24-REVIEW-R4 R4-WR-01) | 부분 거부 뒤 되살아난 자동 체크 로그가 서버가 눕힌 항목까지 「켬」으로 기록 | 🛑 Blocker | FAILED (신규) |

### R3-G1 판정 근거 (gap vs. non-blocking follow-up 독립 판단)

이 항목을 **gap 으로 분류**했다. 이유는 다음과 같다.

1. **코드 확인 완료** — `limit-chaser-form.tsx:1083` 의 `serverRef.current?.[gate] === true && auto !== undefined ? groupAutoCheckLogLine(auto) : null` 이 그룹 게이트 하나만 에코와 대조하고, 로그 내용(`auto.turnedOn`/`auto.priceFilled`)은 누른 순간의 예측값을 그대로 쓴다는 것을 직접 읽어 확인했다(24-REVIEW-R4 인용과 일치).
2. **재현 테스트가 이미 초록으로 통과 중** — `limit-chaser-form.test.tsx` 의 `F1` 테스트를 단독 실행(`npx vitest run -t "F1 부분 거부"`)해 PASS 를 직접 확인했다. 이 테스트는 에코가 `sellEnabled:false`(서버가 매도를 눕힘)인 상황에서도 로그 문장에 「매도주문」이 「켬」으로 포함된 `PRE_FULL_LINE` 을 기대값으로 삼는다 — 틀린 동작이 회귀 방지 테스트로 고정돼, 일반적인 "테스트가 있으니 안전"이라는 신호가 오히려 반대로 작동한다.
3. **도메인 위험도** — 이 로그는 이 코드베이스 전체에서 "매도·취소 6체크 무장이 실제로 섰다"는 **유일한 흔적**으로 명시돼 있다(코드 주석 자체가 그렇게 부른다). 트레이딩 앱에서 "방어가 선 줄 알았는데 실제로는 서버가 거부했다"는 오탐은 실손실로 이어질 수 있는 안전 관련 결함이다. CLAUDE.md/MEMORY.md 의 프로젝트 교훈("무로그 fail-safe 금지")이 요구하는 것은 "로그가 존재한다"가 아니라 "로그가 실제로 일어난 일을 정확히 말한다"는 것이고, 이 결함은 정확히 그 요구를 위반한다.
4. **round-1 WR-05 / round-2 GC-WR-01 의 원 truth 재위반** — 두 라운드 모두 "사유가 그 사건에만 정확히 귀속된다"를 요구했다. 이번 결함은 귀속 대상(어떤 제출·어떤 그룹)은 맞지만 그 사건에 대해 로그가 말하는 **내용**이 틀렸다 — 같은 결의 문제가 형태만 바꿔 세 번째로 나타난 것으로 본다(WR-05 → GC-WR-01 재발 → R3-G1).

반대로 "non-blocking follow-up"으로 미룰 수 있었던 이유(예: UAT #6 "로그 문장 모양"이 pass 했다는 점)는 검토했으나 기각한다 — UAT #6 은 일반적인 로그 모양(줄바꿈·빨간색 표시 등 시각 확인)을 검증한 것이지, 부분 거부라는 구체적 시나리오에서 로그 *내용*이 사실과 일치하는지를 사람이 눈으로 확인한 항목이 아니다(UAT 소스는 `24-01~24-24 SUMMARY` 커버리지 + 12건 사람 확인이며, 부분 거부 로그 내용 정확성은 그 12건에 없다). 따라서 UAT 통과가 이 결함을 반증하지 않는다.

## Info 레벨 잔여 (참고, 블로커 아님)

| ID | 내용 | 출처 | 상태 |
|---|---|---|---|
| R3-IN-01 | `echoAnswersSent` 의 「요청한 변화」판정에 재계산 수량 3필드 + 클라 고정 3필드가 섞여 남의 에코를 내 것으로 오판할 수 있음 | 24-REVIEW-R3 | open(akj 범위 밖 · 배너 제거로 첫째 결과는 무력화, 둘째 결과는 잔존) |
| R3-IN-02 | e2e P24-3 「사람 한 번=10 한 건」단언이 부재 관찰 창 없이 로그 줄 직후에 재 — 에코 유발 추가 제출은 못 잡음 | 24-REVIEW-R3 | open(akj 범위 밖) |
| R3-IN-03 | e2e 4c 디버그 `console.log` 잔재 · 원소 하나짜리 루프 | 24-REVIEW-R3 | open(akj 범위 밖 · quick-260928-q5e 소관) |
| R4-IN-01 | 유예 조건이 「이 렌더에 서버 변화 없음」이라 ERROR·에코가 한 렌더로 합쳐지면 이미 온 에코를 두고 1초 더 기다리고, 그 사이 다른 필드 확정은 대기 후 폐기 | 24-REVIEW-R4 | open |
| R4-IN-02 | 훅 테스트 H4(유예 중 언마운트)가 정리 코드를 지워도 통과 — 실질적으로 아무것도 잠그지 않음 | 24-REVIEW-R4 | open |
| R4-IN-03 | 배너 제거(1a2c9944) 뒤에도 주석 5곳이 「배너」를 현재형으로 서술 | 24-REVIEW-R4 | open |

이 6건은 Info 수준(문서 정합성·경계 케이스·테스트 무력화)으로, 이번 라운드에서 gap 으로 승격하지 않는다. 다음 갭 클로징 라운드에서 R3-G1 과 함께 처리 여부를 검토할 것을 권고한다.

## 직접 재실행/재확인한 증거

| 명령/확인 | 결과 |
|---|---|
| `npx vitest run -t "H1 리뷰어 재현" use-lc-field-commit.test.tsx` | 1 passed (R3-WR-01 closed 재확인) |
| `npx vitest run -t "F1 부분 거부" limit-chaser-form.test.tsx` | 1 passed — **단, 이 PASS 는 R3-G1 의 증거다**(틀린 문장이 기대값으로 잠겨 있음) |
| `webapp` 전량 스위트(오케스트레이터 실행) | 125 files / 2823 passed / 1 skipped |
| `relay` 전량 스위트(오케스트레이터 실행, 재실행 포함) | 665/665 passed — 최초 1회 `fanout.test.ts` T-16-02(phase-16, 타이밍 의존) flaky 1건은 격리 3/3·전량 재실행 2/2 로 phase-24 회귀 아님 확인 |
| `git log --oneline -- packages/shared/src/relay.ts relay/src/` | phase-24 관련 마지막 변경은 `24-10`(주석) — 이후 커밋은 phase-25 준비(관찰자/저널)로 buy3 무관 |
| `grep -rE "TBD|FIXME|XXX"` (b2e6d5c3..HEAD 의 webapp 변경 파일) | 0건 |
| `grep -n "Phase 24" .planning/REQUIREMENTS.md` | 매치 없음 — phase-24 는 `requirements: []` 로 일관, ORPHANED 없음(round-1·2 와 동일) |

## Requirements Coverage

24-18~24-24 PLAN 전부 `requirements: []` — REQUIREMENTS.md 교차검증 대상 없음, ORPHANED 없음(round-1·2 와 동일).

## Human Verification (round-2 이월분 — UAT 로 종결)

round-2 가 남긴 4개 human_verification 항목은 `24-UAT.md`(status: complete, 2026-09-29, 86/86 pass)에서 전부 사람이 확인했다 — 재이월하지 않는다.

| Round-2 항목 | UAT 근거 |
|---|---|
| 300ms 창 실기 관찰 | UAT #12 "후매수 소진 300ms 창(실기)" — result: pass |
| 운영 웹 눈 확인(매수 LED·buy3Schema:1·값 확정 왕복·구서버 표시) | UAT #1, #2 — result: pass; 구서버 표시는 UAT #83(24-16 체크포인트 승인 + 스크린샷 `reference/24-13-legacy/`) |
| R6 한방 두 행 수용 여부 | UAT #3 "R6 한방 두 행 수용" — result: pass |
| 24-08 시각 항목 2~9 | UAT #4~#11 — result: pass (전부) |

## Gaps Summary

round-2 가 남긴 4건은 코드 직접 열람으로 전부 닫힌 것을 확인했다 — 이는 실제 진전이다. 그러나 그중 가장 어려웠던 GC-WR-01(거부·무응답 귀속 정확성)의 수정 경로가 이번에도(3번째로) 새 결함을 낳았다: 자동 체크 로그를 부분 거부 상황에서도 되살리는 수정 자체는 옳았지만, 되살아난 로그의 *내용*이 서버 검증 결과가 아니라 사람이 누른 순간의 예측을 그대로 쓴다. 이 결함은 이미 F1 회귀 테스트에 "잘못된 기대값"으로 고정돼 있어, 다음에 이 코드를 만지는 사람이 그 잘못된 값을 기준으로 삼을 위험이 있다.

패턴은 round-1(코드 리뷰가 배포 뒤 실행)·round-2(수정이 새 결함 3건 유발)와 동일하게 반복됐다 — 이번에는 "귀속 정확성"이라는 한 가지 truth 를 세 번째로 다른 형태(무조건 비움 → 오귀속 → 오귀속 정정하며 되살아난 로그의 내용 오류)로 위반했다. 사용자 승인 3건(D-03/D-04a 재해석·구서버 끄기 규칙·WR-06 잔여 한계)은 이번 라운드에서도 override 로 유지한다 — 갭이 아니다.

---

_Verified: 2026-09-29T12:55:00Z_
_Verifier: Claude (gsd-verifier)_
