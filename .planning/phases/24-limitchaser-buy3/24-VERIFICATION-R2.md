---
phase: 24-limitchaser-buy3
verified: 2026-09-28T16:50:00Z
status: gaps_found
score: 17/18 truths verified (1 reopened-failed via GC-WR-01 · 3 new round-2 code defects found)
covered_files: [".planning/phases/24-limitchaser-buy3/24-10-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-10-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-11-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-11-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-12-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-12-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-13-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-13-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-14-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-14-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-15-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-15-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-16-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-16-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-17-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-17-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R2.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW.md", ".planning/phases/24-limitchaser-buy3/24-UI-SPEC.md", ".planning/phases/24-limitchaser-buy3/24-VERIFICATION.md", "packages/shared/src/relay.ts", "webapp/e2e/specs/a11y.spec.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/trading/__tests__/card-body.test.tsx", "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx", "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/strategy-card.tsx", "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx", "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx", "webapp/src/components/trading/lc/setting-group.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/components/trading/strategy-log.tsx", "webapp/src/lib/__tests__/limit-chaser.test.ts", "webapp/src/lib/limit-chaser.ts"]
covered_digest: "v1:sha256:24b6fff04c2075e5f1c38505c6b896d9c83b5894d4b3416515c5f5f445be407f"
behavior_unverified: 2
overrides_applied: 3
overrides:
  - must_have: "D-03/D-04a 재해석 — buy3 에코 선매수 금액 0 은 미입력, 구서버 에코의 「금액부터 받는」 경로 제거"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — 갭이 아니라 채택된 설계 변경"
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
  - must_have: "구서버 에코 — 매수주문부터 끄게 하는 규칙(끄는 방향 ∧ 결과 매수주문 OFF 만 허용)"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2)"
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
  - must_have: "WR-06 남는 한계 — 동시에 보이는 두 인스턴스 각 1건 · 한 왕복 안쪽 편집 되돌림은 compare-and-set 이월"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — 운영 서버 D-34 가 이 경로 자체를 막아 잔여 위험 낮음"
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
re_verification:
  previous_status: gaps_found
  previous_score: 13/18
  gaps_closed:
    - "WR-01 — buy3 선매수 금액 0(후매수·추가매수 전용) 전략이 새로고침·재마운트 뒤에도 편집 가능"
    - "WR-02 — webapp 이 buy3Schema 를 소비해 구서버 에코를 구분·제한(끄기만 허용)"
    - "WR-03 — 선매수 켜기 대기열 확정의 동반 필드가 꺼내는 순간 최신 서버값으로 재계산됨(해당 방향 한정)"
    - "WR-04 — failQueue 성공 판정이 주 필드만이 아니라 동반 필드까지 서버값과 비교함(비교 로직 한정)"
    - "WR-06 — D-02 후반 자동 마스터 OFF 가 순수 델타 가드 + 비가시 유예로 인스턴스 간 중복을 크게 줄임(사용자 승인 잔여 한계 有)"
  gaps_remaining:
    - "WR-05 — 거부/무응답 귀속 정리 수정 자체가 새 오귀속(GC-WR-01)을 만듦: 부분 거부·다른 탭 거부에서 내 제출의 진짜 에코가 「다른 단말」로 오독됨"
  regressions:
    - "GC-WR-02 — failQueue 실패 시 revertToggle 이 서버 값이 아니라 누른 순간 값(prevValue)으로 되돌려, 서버 OFF 인 스위치가 화면에 ON 으로 남는 거짓 표시(WR-04 수정이 만든 새 결함)"
    - "GC-WR-03 — D-02 전반(마지막 그룹 끔 + 마스터 OFF) 동반이 여전히 누른 순간 정적 값이라, 대기 중 다른 단말이 그룹을 켜도 마스터 OFF 가 그대로 나가 무장 해제됨(WR-03 수정이 켜는 방향에만 적용된 결과)"
    - "GC-WR-04 — 자동 체크 로그 대기가 폼 전체 한 칸이라, 선매수 켬 in-flight 중 추가매수를 켜면 선매수 자동 체크(6체크 무장) 로그가 통째로 사라짐(24-17 D-35 로 트리거 빈도 상승)"
gaps:
  - truth: "거부·무응답으로 끝난 제출의 사유(sent/sentCause)가 그 사건에만 귀속되고, 다음 무관한 에코에 잘못 붙지 않는다(전략 로그 정확성) — round-1 WR-05"
    status: failed
    reason: "24-11 수정은 `isLimitChaserSetRejection` 분기에서 즉시 pendingRef/pendingCauseRef 를 비운다. 그런데 gh-trade Gateway.cpp 의 ProcessSetLimitChaser 는 부분 거부(매도·취소·추가·후매수 검증 실패)에서도 먼저 ERROR 를 보낸 뒤 cfg 를 저장하고 정상 에코를 뒤이어 보낸다 — 같은 제출의 진짜 에코가 뒤따라온다. 또한 ServerMessage 는 사용자의 모든 소켓(탭 A·B)으로 팬아웃된다. 두 경우 모두 거부 시점에 귀속을 비우면, 뒤이어 오는 **내 제출의 진짜 에코**가 `sent === null` 로 처리돼 D-01/D-02 동반 문장·serverFold 문장이 사라지고 거짓 「다른 단말에서 변경됐어요」 배너가 선다. 직접 코드 확인: strategy-card.tsx 634-638 이 무조건 즉시 비움. 기존 WR-05 회귀 테스트(strategy-card-flow.test.tsx 1320행 describe)는 전부 「거부 뒤 무관한 다른 단말 에코」 케이스만 다루고 「거부(부분) 뒤 같은 제출의 정상 에코」 케이스가 하나도 없다 — grep 으로 직접 확인."
    artifacts:
      - path: webapp/src/components/trading/card/strategy-card.tsx
        issue: "634-638 — isLimitChaserSetRejection 분기가 부분 거부 여부·다른 탭 여부를 가리지 않고 무조건 귀속을 비운다(GC-WR-01)"
      - path: webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
        issue: "WR-05 describe 블록에 부분 거부(ERROR 뒤 같은 키 에코) 회귀 케이스가 없다"
    missing:
      - "거부 분기에서는 귀속을 비우지 않고 acceptAnswer() 만 한다 — 비우는 시점은 이미 있는 두 수평선(에코 소비·결과 모름 창 만료)에 맡긴다(24-REVIEW-R2.md GC-WR-01 제안 diff — echoAnswersSent 판정 추가)"
      - "부분 거부(ERROR → 같은 키 에코) 회귀 테스트, 다른 탭 거부 팬아웃 케이스 테스트"
  - truth: "R2-G1 (신규) — failQueue 가 대기 건을 실패로 접을 때, 폼에 남는 표시가 서버의 실제 값과 일치한다"
    status: failed
    reason: "WR-04 수정으로 failQueue 의 성공 판정 자체(주 필드+동반 비교)는 올바르게 고쳐졌으나, 실패로 접힐 때 부르는 revertToggle(q) 은 `showToggle(field, q.prevValue, q.prevCompanions)` 로 **누른 순간 폼 값**(prevValue)으로 되돌린다. 예: 대기 중이던 「선매수 끔 + buyEnabled:false 동반」의 앞 건이 거부됐고 그사이 서버가 이미 선매수를 접었다면(server.preBuyEnabled === false), sameAsServer 는 false 로 판정해 실패로 접히는데 revertToggle 이 되돌리는 값은 서버 값이 아니라 눌렀을 때의 폼 값 true 다 — 결과: 선매수 스위치가 화면에 ON 으로 남고 「반영하지 못했어요」 말풍선이 붙는다. 사용자가 끄려던 값은 이미 서버에 서 있는데도 거짓 실패로 보인다. 직접 코드 확인: use-lc-field-commit.ts 의 revertToggle 정의(prevValue 사용)와 failQueue 의 실패 분기(setFailure + revertToggle(q))."
    artifacts:
      - path: webapp/src/components/trading/lc/use-lc-field-commit.ts
        issue: "revertToggle 이 서버 값이 아닌 q.prevValue 로 되돌린다 — failQueue 의 실패 분기가 이를 그대로 쓴다(GC-WR-02)"
    missing:
      - "server 가 있으면 되돌림 기준을 서버 값으로 잡는다 — 주 필드가 이미 서버 값이면 주 필드는 성공, 동반만 실패로 다룬다(24-REVIEW-R2.md GC-WR-02 제안 diff)"
    deferred_note: "WR-04 의 좁은 문구(「성공 판정 시 동반 필드까지 비교」)는 그 자체로는 충족됐다 — 이 갭은 그 수정이 낳은 실패-경로 표시 정확성의 새 결함이다."
  - truth: "R2-G2 (신규) — D-02 전반(마지막 그룹 끔 + 마스터 동반 OFF) 확정의 동반 필드도 꺼내는 순간의 최신 서버 값으로 재계산된다"
    status: failed
    reason: "WR-03 수정은 선매수 켜기(켜는 방향)에만 적용됐다 — commitGroupSwitch 의 ON 분기는 `(base) => {...}` 함수로 companions 를 넘겨 꺼낼 때 재계산한다. 그러나 OFF 분기(D-02 전반, 마지막 켜진 그룹을 끌 때 마스터도 같이 끄는 동반)는 `commitField(gate, false, 'toggle', { buyEnabled: false })` 로 정적 객체를 그대로 넘긴다. 직접 코드 확인: limit-chaser-form.tsx 997-1001 부근. 시나리오: 앞 확정이 in-flight 인 동안 「선매수 끔」이 대기에 서고(그때는 다른 그룹이 폼상 꺼져 있어 마스터 OFF 동반 결정), 그사이 다른 단말이 후매수를 켠 에코가 온 뒤 대기 건이 나가면, base.postBuyEnabled === true 인데도 정적 companions 의 buyEnabled:false 가 그대로 실려 다른 곳에서 방금 무장한 후매수가 사람 손 없이 무장 해제된다."
    artifacts:
      - path: webapp/src/components/trading/limit-chaser-form.tsx
        issue: "commitGroupSwitch 의 끄는 방향(D-02 전반)이 정적 { buyEnabled: false } 를 넘긴다 — 켜는 방향만 함수로 고쳐졌다(GC-WR-03)"
    missing:
      - "끄는 방향도 (base) => (그 시점 base 로 재판정한 마지막 그룹 여부) ? { buyEnabled: false } : {} 형태의 함수로 바꾼다(24-REVIEW-R2.md GC-WR-03 제안 diff) — 단 누른 순간 판정에는 낙관 표시가 반영돼야 해 두 단계 판정이 필요할 수 있음"
    deferred_note: "round-1 WR-03 의 좁은 문구(「선매수 켜기 대기열」)는 충족됐다 — 이 갭은 같은 결의 결함이 반대 방향(끄기)에 남은 새로 특정된 범위다."
  - truth: "R2-G3 (신규) — 선매수·추가매수 자동 체크 로그(D-06/D-35)가 그룹별로 독립적으로 기록돼, 한 그룹의 in-flight 중 다른 그룹을 켜도 먼저 켠 그룹의 자동 체크 로그가 사라지지 않는다"
    status: failed
    reason: "autoCheckRef · pendingAutoCheckRef 가 폼 전체에 한 칸이다. 선매수 켬(pending) → 에코 전에 추가매수 켬(같은 칸을 덮어씀, D-35 로 트리거 빈도가 올라감) → 선매수 성공 에코가 와도 `lastSuccessField('preBuyEnabled') !== pending.gate` 라 로그 없음. 매도·취소 게이트 6개를 실제로 무장하고 매도가를 상한가로 채운 제출인데도 로그가 한 줄도 남지 않는다 — 프로젝트 규율 「무로그 fail-safe 금지」 위반. 직접 코드 확인: limit-chaser-form.tsx 의 autoCheckRef/pendingAutoCheckRef 선언이 useRef<GroupAutoCheckResult | null>·useRef<{gate,seqAtSend}|null> 로 단일 슬롯이고, commitGroupSwitch ON 분기가 매 호출마다 `autoCheckRef.current = null` 로 리셋한다."
    artifacts:
      - path: webapp/src/components/trading/limit-chaser-form.tsx
        issue: "autoCheckRef/pendingAutoCheckRef 가 그룹별이 아니라 폼 전체 한 칸(GC-WR-04) — 24-17(D-35) 로 추가매수 트리거가 더해지며 일상 조작으로 재현 가능해짐"
    missing:
      - "대기 로그·계산 결과를 그룹별 Partial<Record<AutoCheckGate, ...>> 로 바꾼다(24-REVIEW-R2.md GC-WR-04 제안 diff) — 후매수·막힘·끊김은 자기 게이트 슬롯만 지운다"
      - "회귀 테스트: 선매수 켬 in-flight → 추가매수 켬 → 선매수 에코 → 선매수 자동 체크 로그 존재"
    deferred_note: "이 결함의 뿌리(한 칸 설계)는 24-07 부터 있었으나, 24-17 D-35(추가매수 켬 자동 체크 추가)로 일상 조작 재현 가능성이 크게 올라가 이번 갭 클로징 라운드의 산출물로 취급한다."
behavior_unverified_items:
  - truth: "후매수 소진(3단계) 진입 직전 300ms 창에서, 서버가 아직 소진 에코를 보내기 전에 옛 ON 값으로 클라이언트가 재제출하는 창이 실제 생기는지"
    test: "실 서버 대상 UAT — 후매수가 발동·보유중 상태에서 마지막 재진입 소진 시점을 실시간으로 관찰"
    expected: "300ms 창 안에 웹이 옛 ON cfg 를 재제출해 서버가 다시 열어버리는 핑퐁이 생기지 않는다"
    why_human: "실시간 타이밍 경합이라 정적 코드·단위/e2e 테스트로 재현되지 않는다 — round-1 에서도 UAT 로 이월됐고 이번 갭 클로징 범위 밖(24-16 명시)"
  - truth: "구서버 buy3Schema=0 에코를 받았을 때 카드 상태 문구·편집 가능 범위가 실제 운영 화면에서 올바르게 표시되는지(WR-02 눈 확인)"
    test: "가짜 게이트웨이 또는 롤백된 relay 로 buy3Schema 미탑재 에코를 만들어 상따 카드 표시를 관찰, 또는 24-13 스크린샷(reference/24-13-legacy/) 채택 여부 재확인"
    expected: "구서버 에코 카드가 「구서버 전략 · 끄기만 가능」 한 줄을 실제 화면에서 정상 표시하고, buy_watch_side 를 조용히 지우지 않는다"
    why_human: "현재 프로덕션은 신 스키마로 배포돼 이 경로가 상시 트리거되지 않는다 — 코드·단위/e2e 테스트는 확인했으나(P24-10/P24-11, a11y 구서버 에코 카드) 실 운영 화면 확인은 사람 눈 몫"
human_verification:
  - test: "300ms 창 실기 관찰(24-09 SUMMARY ⑨ · round-1 UAT 이월 · 이번 라운드도 범위 밖)"
    expected: "후매수 소진 직전 옛 ON 재제출 핑퐁이 관측되지 않는다"
    why_human: "실시간 타이밍 경합, UAT 전용"
  - test: "운영 웹 눈 확인(24-09 SUMMARY ⑥ · round-1 UAT 이월) — 이번 배포(7e8830a2) 반영 뒤 상따 카드 매수 LED · 접힌 카드 3장 · DevTools WS lc.snap 의 buy3Schema:1 · 실전략 1건 값 확정→에코 · 구서버 판정 화면(가능하면 후매수 전용 전략 새로고침 뒤 편집)"
    expected: "매수 LED 2단계(OFF/감시/보유중) 정상 표시, buy3Schema:1 실제 확인, 값 확정 왕복 정상, 구서버 전략은 끄기만 가능 문구가 실제로 뜬다"
    why_human: "운영 웹 실기 확인 — 24-16-SUMMARY 도 이 항목을 /gsd-verify-work 24 UAT 로 명시 이월했다"
  - test: "R6 한방 두 행 수용 여부(24-04·24-08 SUMMARY 「사람 확인 남은 항목」 1) — 스케치 009 D 의 한 행과 다른 두 행 UI"
    expected: "사용자가 두 행 레이아웃을 최종 승인하거나 거부"
    why_human: "디자인 채택 여부는 사람 판단 — round-1 이후 갭 클로징 범위에 포함되지 않아 그대로 이월"
  - test: "24-08 SUMMARY 「사람 확인 남은 항목」 2~9 — 접힌 카드 흐림·L3, 제목줄 줄바꿈 3줄 헤더, 로그 문장 모양, 사전 검증 줄 시각, 무장 불가 패널 문구, 선매수 켬 실제 흐름(탭 이동 없음), 360폭 시딩 값 표시, 라이트/다크 색"
    expected: "스크린샷(reference/24-08-visual/, 8장) 기준으로 시각적으로 허용 가능한지 확인"
    why_human: "시각적 품질·수용 여부 판단 — 자동 측정 불가, 갭 클로징 범위 밖"
coincidental_reliance_items: []
---

# Phase 24: gh-trade 상따 매수주문 3종 분리 — 갭 클로징 재검증(Round 2) Verification Report

**Phase Goal:** gh-trade Phase 24 가 상따 매수를 선매수·추가매수·후매수 세 갈래로 나눈 와이어 규약을 relay·webapp 에 반영하고, round-1 검증(24-VERIFICATION.md)이 찾은 6건의 코드 결함(WR-01~06)을 닫는다.

**Verified:** 2026-09-28T16:50:00Z (KST)
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (24-10 ~ 24-17), 이것이 round 2 재검증이다.

## 요약

round-1 이 찾은 6건(WR-01~06) 중 **4건(WR-01·WR-02·WR-03·WR-04)의 좁은 문구는 코드·테스트로 실제 닫혔고, WR-06 은 사용자 승인 잔여 한계와 함께 닫혔다.** 그러나 자체 코드 리뷰(24-REVIEW-R2.md, 갭 클로징 완료 직후 실행)가 그 수정 코드에서 **새 결함 4건**을 찾았다:

- **WR-05 는 사실상 닫히지 않았다** — 수정(거부 시 즉시 귀속 비움)이 부분 거부·다른 탭 거부 시나리오에서 **내 제출의 진짜 에코를 「다른 단말」로 오독**하게 만든다(GC-WR-01). 원래 갭의 핵심 truth(「사유가 그 사건에만 귀속된다」)를 다른 방향에서 그대로 위반한다 — round 2 에서도 FAILED 로 유지한다.
- WR-04 의 비교 로직 자체는 고쳐졌지만, 실패로 접는 되돌림 값이 서버 값이 아니라 누른 순간 값이라 **서버 OFF 인 스위치가 화면에 ON 으로 남는** 새 결함이 생겼다(GC-WR-02, R2-G1).
- WR-03 의 수정은 켜는 방향에만 적용돼, 끄는 방향(D-02 전반)에는 낡은 정적 동반이 그대로 남아 **다른 단말이 방금 무장한 그룹을 사람 손 없이 해제**할 수 있다(GC-WR-03, R2-G2).
- 24-17 이 추가한 D-35(추가매수 켬 자동 체크)로 인해 자동 체크 로그의 한 칸 설계 결함이 일상 조작으로 재현 가능해져, **매도·취소 6체크 무장 사실이 로그에 한 줄도 남지 않는** 결함이 생겼다(GC-WR-04, R2-G3).

이 4건 전부 배포된 코드(`7e8830a2` — 이미 origin/master, 프로덕션 반영됨)에 **현재 존재**하며, GC-REVIEW-R2 이후 수정 커밋이 없다(`git merge-base --is-ancestor 3e2c9009 origin/master` → no, 즉 review 문서 자체도 아직 master 에 없지만 리뷰 대상 코드는 이미 master 에 있다). Info 레벨 5건(GC-IN-01~05)은 낮은 심각도 또는 문서 정합성 문제로 별도 나열한다.

## Goal Achievement — round-1 6건 클로징 재검증

| # | Round-1 Gap | 재검증 결과 | 근거 |
|---|---|---|---|
| WR-01 | buy3 선매수 금액 0 전략 새로고침 뒤 잠김 | ✓ VERIFIED (closed) | `isLegacyBuySchema`/`isLegacyAmountUnknown` 단일 판정(limit-chaser.ts:463-479) 확인, `formFromServer`(:504)·훅 `amountRequired`·`sendNow`(:520 부근)가 전부 이를 읽음. 단위 테스트(`use-lc-field-commit.test.tsx:866,880`, `limit-chaser-form.test.tsx:1285` describe) + e2e P24-9 존재·통과(webapp 2757/2757+1skip 재실행 확인) |
| WR-02 | webapp 이 buy3Schema 미소비 | ✓ VERIFIED (closed, 사용자 승인 해석) | `lcLegacyBlockOf`(use-lc-field-commit.ts:195) 가 전송 직전 가드(대기열 포함)·폼 `validateCommit`(:1210)에 동일 함수로 사용됨. 카드 `LC_LEGACY_BUY_STATUS`(card-body.tsx:125) 확인. e2e P24-10/P24-11, a11y 구서버 에코 카드 존재. 남는 가장자리는 GC-IN-01(Info, 아래) |
| WR-03 | 선매수 켜기 대기열 동반이 낡은 값 | ✓ VERIFIED (closed, 좁은 문구 한정) | commitGroupSwitch ON 분기가 `(base) => {...}` 함수로 companions 를 넘겨 꺼낼 때 재계산(limit-chaser-form.tsx 확인). **단, 같은 결의 결함이 끄는 방향에 남음 → R2-G2 신규 갭** |
| WR-04 | failQueue 가 주 필드만 비교 | ✓ VERIFIED (closed, 좁은 문구 한정) | `failQueue` 가 `sameAsServer(server, q.field, q.value, companionsAt(q, baseNow()))` 로 동반까지 비교(use-lc-field-commit.ts 직접 확인). **단, 실패 시 되돌림 값이 서버 값이 아니라 prevValue → R2-G1 신규 갭** |
| WR-05 | 거부·무응답 사유 오귀속 | ✗ FAILED (재개, round 2에도 유지) | 24-11 수정이 거부 시 즉시 귀속을 비우지만, 부분 거부·다른 탭 거부에서 내 제출의 진짜 에코가 「다른 단말」로 오독됨(GC-WR-01, 코드 직접 확인: strategy-card.tsx:634-638) — 원래 truth를 다른 경로로 재위반 |
| WR-06 | D-02 후반 자동 OFF 다중 인스턴스 중복 | ✓ VERIFIED (closed, 사용자 승인 잔여 한계) | `isMasterOnlyDelta`(limit-chaser.ts:550)·`LC_FOLD_HIDDEN_DEFER_MS`(limit-chaser-form.tsx:402) 가드 ⑤⑥ 확인. 남는 한계(동시 가시 인스턴스·한 왕복 편집 되돌림)는 24-16 에서 사용자 승인됨(override 적용). GC-IN-02(모든 인스턴스가 숨은 경우 문구 누락)는 Info, 별도 |

**Score 갱신:** round-1 18개 truth 중 14~18(WR-01~06, 표 18은 WR-05+WR-06 합본)이 관심 대상이었다. 재검증 결과 WR-01·02·03(좁은 문구)·04(좁은 문구)·06 = 5건 closed, WR-05 = 1건 유지 FAILED. round-1 truth 1~13(relay 와이어·구조·배포 등)은 relay 무변경(`94ebc91c..HEAD -- relay/` diff 빈 출력, 직접 재확인) 및 webapp 전체 테스트 재통과로 회귀 없음을 확인 — 그대로 VERIFIED 유지.

## 신규 Round-2 갭 (GC-REVIEW-R2 기반, 코드로 직접 재확인)

| ID | 내용 | 심각도 | 상태 |
|---|---|---|---|
| GC-WR-01 (= WR-05 재개) | 거부 분기 즉시 귀속 비움이 부분 거부·다른 탭 거부의 진짜 에코를 오귀속 | 🛑 Blocker | FAILED (위 표) |
| R2-G1 (GC-WR-02) | failQueue 실패 시 revertToggle 이 서버 값이 아닌 prevValue 로 되돌려 거짓 ON 표시 | 🛑 Blocker | FAILED (신규) |
| R2-G2 (GC-WR-03) | D-02 전반(끄기) 동반이 정적 값 그대로 — 다른 단말이 무장한 그룹을 조용히 해제 가능 | 🛑 Blocker | FAILED (신규) |
| R2-G3 (GC-WR-04) | 자동 체크 로그 한 칸 설계 — D-35 로 트리거 빈도 상승, 무장 사실 로그 소실(무로그 fail-safe 금지 위반) | 🛑 Blocker | FAILED (신규) |

네 항목 모두 코드를 직접 읽어 재현 조건을 확인했다(본 보고서 "Anti-Patterns Found" 및 각 gap 항목의 evidence 참조). 실시간 재현 실행(멀티탭·경합)은 하지 않았다 — 코드 경로 추적 근거를 채택했다(24-REVIEW-R2.md 와 동일한 방법론).

## Info 레벨 잔여 (참고, 블로커 아님)

| ID | 내용 | 비고 |
|---|---|---|
| GC-IN-01 | `isServerFoldEdge` 가 buy3→구서버 전환 에코에서 구서버 판별을 하지 않음 | 보통 relay 세션 `ready` 상실로 막힘 — 그 보장은 이 파일 밖 |
| GC-IN-02 | 비가시 유예(가드 ⑥) — 모든 인스턴스가 숨은 경우 문구 누락 | 승인된 잔여 한계 문구 범위가 실제보다 좁게 기록 — D-34 서버 백스톱으로 영향 작음 |
| GC-IN-03 | 대기 꺼내기 no-op 성공 시에도 자동 체크 로그가 기록될 수 있음(D-08 위반 — 다른 단말이 켠 경우도 로그) | 로그 대기를 실제 전송된 확정에만 걸면 해결 |
| GC-IN-04 | e2e P24-3·P24-4·P24-6 고정 대기 잔존, P24-4 관찰 창이 신설 유예 상수와 겹침 | 사건 기반 대기로 교체 권고 |
| GC-IN-05 | 훅 주석 「게이트 4종 밖」 오기(`LC_GATE_FIELDS` 는 6개) | 주석 정정만 |

## 직접 재실행한 회귀 증거 (재현, SUMMARY 주장과 대조)

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay run test` | 28 files · **651 passed** (재확인, SUMMARY 주장과 일치) |
| `pnpm --filter @gh-radar/webapp run test` | 125 files · **2757 passed · 1 skipped** (재확인, SUMMARY 주장과 일치) |
| `git diff --stat 94ebc91c..HEAD -- relay/` | 빈 출력 — relay 무변경 재확인 |
| `git merge-base --is-ancestor 7e8830a2 origin/master` | yes — 갭 클로징 코드(24-10~24-17, be2b6396 포함)가 **이미 프로덕션에 배포됨** |
| `git merge-base --is-ancestor 3e2c9009 origin/master` | no — GC-REVIEW-R2 문서 자체는 아직 master 에 없음(문서 커밋일 뿐, 리뷰 대상 코드는 이미 master) |
| grep `revertToggle`/`autoCheckRef`/`commitField(gate, false` 등 | GC-WR-01~04 의 코드 위치·내용을 직접 눈으로 확인(REVIEW-R2 인용과 일치) |

## Requirements Coverage

24-10~24-17 PLAN 전부 `requirements: []` — REQUIREMENTS.md 교차검증 대상 없음, ORPHANED 없음(round-1과 동일).

## Anti-Patterns Found

| File | Line(대략) | Pattern | Severity | Impact |
|---|---|---|---|---|
| `webapp/src/components/trading/card/strategy-card.tsx` | 634-638 | 거부 분기 무조건 즉시 귀속 비움 | 🛑 Blocker (GC-WR-01) | 부분 거부·다른 탭 거부 시 내 제출의 진짜 에코를 「다른 단말」로 오독 |
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | revertToggle 정의부 · failQueue 실패 분기 | 실패 되돌림이 prevValue 사용(서버 값 아님) | 🛑 Blocker (GC-WR-02) | 서버 OFF 인 스위치가 화면에 ON 으로 잘못 남음 |
| `webapp/src/components/trading/limit-chaser-form.tsx` | commitGroupSwitch OFF 분기(`{ buyEnabled: false }` 정적) | D-02 전반 동반이 정적 값 | 🛑 Blocker (GC-WR-03) | 다른 단말이 무장한 그룹을 조용히 무장 해제 가능 |
| `webapp/src/components/trading/limit-chaser-form.tsx` | `autoCheckRef`/`pendingAutoCheckRef` 단일 슬롯 | 그룹별이 아닌 폼 전체 한 칸 | 🛑 Blocker (GC-WR-04) | 매도·취소 6체크 무장 로그가 통째로 소실(무로그 fail-safe 금지 위반) |
| TBD/FIXME/XXX | - | 없음 | - | grep 결과 0건 — 게이트 통과 |

**Debt marker gate:** `TBD`/`FIXME`/`XXX` 0건 — 통과.

## Human Verification Required

1. **300ms 창 실기 관찰** — round-1 부터 UAT 이월, 이번 라운드 범위 밖.
2. **운영 웹 눈 확인**(이번 배포 `7e8830a2` 반영 뒤) — 매수 LED·접힌 카드·`buy3Schema:1`·값 확정 왕복·구서버 전략 표시.
3. **R6 한방 두 행 수용 여부** — 사람 판단, 미변경 이월.
4. **24-08 시각 항목 2~9** — 스크린샷 기준 시각 품질 확인, 미변경 이월.

## Gaps Summary

갭 클로징(24-10~24-17)은 round-1 이 찾은 6건 중 5건(WR-01·02·03·04·06)의 **좁게 쓰인 truth 문구**를 코드·테스트로 실제로 닫았다 — 이는 직접 코드를 읽고 테스트를 재실행해 확인했다. 그러나 그 수정 자체가 **같은 결의 새 결함 4건**을 낳았다:

- WR-05 는 실질적으로 닫히지 않았다 — 오귀속 문제가 다른 트리거(부분 거부·다른 탭)로 재발한다.
- WR-04·WR-03 은 각각 인접한 코드 경로(실패 되돌림 값, 끄는 방향 동반)에 구조적으로 같은 버그 패턴이 남아 있다.
- 24-17 이 추가한 신규 기능(D-35)이 기존에 잠재해 있던 로그 설계 결함(한 칸 슬롯)의 실사용 재현 가능성을 크게 높였다.

이 4건은 모두 이미 프로덕션에 배포된 코드(`origin/master` = `7e8830a2`)에 존재하며, 갭 클로징 완료 직후 실행된 자체 코드 리뷰(24-REVIEW-R2.md, `3e2c9009`)가 이를 발견한 뒤에도 수정 커밋이 없다. round-1 과 같은 패턴 — 코드 리뷰가 배포 이후 실행되고, 발견된 결함이 그대로 프로덕션에 남아 있다 — 이 이번 라운드에도 반복됐다. 사용자 승인 3건(D-03/D-04a 재해석·구서버 끄기 규칙·WR-06 잔여 한계)은 설계 결정으로 override 처리했다 — 갭이 아니다.

---

_Verified: 2026-09-28T16:50:00Z_
_Verifier: Claude (gsd-verifier)_
