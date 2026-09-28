---
phase: quick-260929-akj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
autonomous: true
requirements: [R3-WR-01, R3-WR-02]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "부분 거부 — 선매수 켬(in-flight) · 추가매수 켬(대기) 뒤 서버의 ERROR 가 같은 제출의 에코보다 먼저 와도, 에코가 선매수 ON 을 싣고 오면 선매수는 성공이다. 「반영하지 못했어요」 0 · 스위치 되돌림 0 · 보낸 성공 신호 필드 = preBuyEnabled · 「선매수 자동 체크 — 」 줄 1개 · 에코 뒤 답 신호에서 추가매수 lc.set 1건(총 2건) · 실패 맵에 extraBuyEnabled 'rejected' 없음 (R3-WR-01)"
    - "전면 거부 — 거부 통지만 오고 에코가 없으면 LC_REJECT_ECHO_GRACE_MS(1,000ms) 뒤 종전대로 in-flight 'rejected' · 대기 건 전부 실패 · 토글은 서버 값으로 되돌림 · 자동 체크 줄 0 · 재전송 0. 유예가 끝나기 1ms 전에는 실패가 서지 않는다 (R3-WR-01)"
    - "같은 제출의 에코가 주 필드를 눕힌 채 오면 유예를 기다리지 않고 그 렌더에서 즉시 'rejected' 다 — 에코가 오면 에코가 판정의 정본이다 (R3-WR-01)"
    - "거부 통지 신호 없이 답 신호만 오른 경우(미등록 키 철거 에코 등 · 기존 훅/폼 테스트의 「답만 증가」)는 종전대로 즉시 판정한다 — 그 기존 테스트들은 수정 없이 통과한다"
    - "보낸 성공 신호(sentSuccessSeq · lastSentSuccessField)는 해소 ① 에서만 오르고, 같은 판정 실행의 늦은 에코 · 대기 접기 성공이 덮지 못한다. 거부된 매도주문 실패가 남은 채 선매수를 켜 성공 에코가 오면 「선매수 자동 체크 — 켬: 매도주문 …」 한 줄이 선다 · 같은 실행에 in-flight 값 확정이 성공하면 그 행의 인라인 편집기도 닫힌다 (R3-WR-02)"
    - "모든 경로에서 훅은 사용자가 누르지 않은 lc.set 을 만들지 않는다(T-16-10) — 유예 타이머는 실패 표시만 하고, 새 테스트는 전부 전송 수를 센다"
    - "webapp src/components/trading 테스트 전체(계획 시점 33파일 1,395건 green)와 tsc --noEmit 이 통과한다. 코드 커밋은 한국어 메시지 · 공동 저자 트레일러 없음 · push 와 배포는 하지 않는다"
  artifacts:
    - path: "webapp/src/components/trading/lc/use-lc-field-commit.ts"
      provides: "LC_REJECT_ECHO_GRACE_MS · serverRejectSeq 옵션 · 거부 통지 답의 에코 유예 판정 · 보낸 성공 전용 신호(sentSuccessSeq · lastSentSuccessField)"
      contains: "LC_REJECT_ECHO_GRACE_MS"
    - path: "webapp/src/components/trading/card/strategy-card.tsx"
      provides: "StrategyCardState.rejectSeq — lc.set 거부 통지(isLimitChaserSetRejection) 접수 횟수"
      contains: "setRejectSeq"
    - path: "webapp/src/components/trading/card/card-body.tsx"
      provides: "카드 rejectSeq → 폼 serverRejectSeq 배관"
      contains: "serverRejectSeq={rejectSeq}"
    - path: "webapp/src/components/trading/limit-chaser-form.tsx"
      provides: "serverRejectSeq prop 전달 · 자동 체크 줄과 편집기 닫기를 보낸 성공 신호로 소비"
      contains: "sentSuccessSeq"
    - path: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx"
      provides: "R3-WR-01 카드+폼+훅 통합 회귀(ERROR 먼저 → 같은 제출 에코 → 대기 건 전송) · ㉑-e 전면 거부는 유예 뒤 실패"
      contains: "R3-WR-01"
    - path: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx"
      provides: "R3-WR-01 훅 회귀(리뷰어 재현 · 유예 경계 · 주 필드 눕힘 즉시 거부 · 언마운트 타이머) · R3-WR-02 훅 회귀 · 보낸 성공 신호 describe 이전"
      contains: "R3-WR-02"
    - path: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx"
      provides: "R3-WR-01 폼 회귀(부분 거부 → 자동 체크 줄 + 추가매수 전송 · 전면 거부 → 유예 뒤 되돌림) · R3-WR-02 폼 회귀(선매수 줄 · 편집기 닫힘)"
      contains: "R3-WR-01"
  key_links:
    - from: "strategy-card.tsx 상따 몫 메시지 이펙트의 isLimitChaserSetRejection 분기"
      to: "use-lc-field-commit.ts 해소 이펙트 ① 의 유예 판정"
      via: "acceptAnswer() 와 함께 setRejectSeq → StrategyCardState.rejectSeq → card-body serverRejectSeq → LimitChaserForm prop → useLcFieldCommit 옵션 → Inflight.rejectSeqAtSend 와 비교"
      pattern: "serverRejectSeq"
    - from: "use-lc-field-commit.ts 해소 ① matches 분기(보낸 프레임의 답)"
      to: "limit-chaser-form.tsx 그룹 켬 자동 체크 이펙트 → onClientLog 한 줄"
      via: "setSentSuccess 가 올린 sentSuccessSeq · lastSentSuccessField 를 폼이 본-값 ref 로 한 번만 소비한다(일반 성공 신호는 슬롯 비우기에만)"
      pattern: "lastSentSuccessField"
---

<objective>
24-REVIEW-R3 의 두 Warning 을 고친다. 리뷰어가 스크래치 테스트로 재현한 시나리오를 그대로 회귀 테스트로 박는다(테스트 먼저 → 실패 확인 → 수정).

**R3-WR-01 — 부분 거부의 ERROR 가 에코보다 먼저 와서 훅이 in-flight 를 실패로 접는다.**
- gh-trade `ProcessSetLimitChaser`(Gateway.cpp)는 부분 거부 때 그 항만 눕히고 ERROR 를 먼저 보낸 뒤 저장하고 같은 제출의 에코를 보낸다. 같은 핸들러 안에서 같은 연결로 동기 송신한다(계획 시점 소스 확인).
- 카드는 그 ERROR 에 `acceptAnswer()` 로 `answerSeq` 를 올린다(`strategy-card.tsx:653`). ERROR 와 에코는 별개 WS 프레임이라 다른 렌더에 온다. 훅 ①(`use-lc-field-commit.ts:792-810`)은 ERROR 렌더에서 서버 값이 아직 그대로라 `failInflight(inf, 'rejected')` 를 부른다. 그 결과 스위치가 되돌아가고 「반영하지 못했어요」가 서며, `failQueue` 가 대기 확정(D-35 추가매수 켬)을 보내지 않고 버린다. 뒤이은 에코는 ③ 늦은 에코로 성공이 되지만 보낸 성공이 아니라서 자동 체크 줄이 없다.

**R3-WR-02 — 성공 신호가 한 칸이라 한 판정 실행 안의 두 성공 중 앞 것이 덮인다.**
- `markSuccess` 는 `{ seq, field, sent }` 한 칸에 쓴다(`:458-478`). ① in-flight 성공(보낸 것) 직후 같은 실행의 ③ 늦은 에코(`:833-837`)가 다른 필드 성공을 쓰면, 폼은 마지막 것만 본다(`limit-chaser-form.tsx:1055-1078`). 그래서 선매수 자동 체크 줄이 쓰이지 않는다.
- 같은 뿌리로 폼의 편집기 · 시트 닫기 이펙트(`:747-751`)도 in-flight 값 확정의 성공을 놓칠 수 있다.

**설계 선택 (가장 덜 침습적이면서 맞는 것):**
- R3-WR-01 — 카드가 **거부 통지 전용 신호**(`rejectSeq`)를 따로 낸다. 훅은 「보낸 뒤 거부 신호가 올랐고 ∧ 답 신호가 올랐고 ∧ 이 렌더에 서버 값 변화(에코)가 없다」일 때만 판정을 `LC_REJECT_ECHO_GRACE_MS`(1,000ms) 미룬다.
  - 그 사이 에코가 오면 에코가 판정한다. 주 필드 값이 일치하면 성공(보낸 성공)이고, 아니면 그 렌더에서 즉시 거부다.
  - 에코가 오지 않으면(전면 거부 = 거래소 화이트리스트 밖 · NXT 미거래 · 계좌 가드) 유예가 끝날 때 종전대로 거부다.
  - 유예는 1초면 넉넉하다. ERROR → 에코는 서버에서 동기로 연속 송신되므로 도착 간격은 전송 + 렌더 1회 수준이다. 그러면서 전면 거부의 폼 실패 표시도 1초 안에 선다. ERROR 원문 줄과 상태줄은 카드가 지금처럼 즉시 세운다.
- 기각한 대안 A: 거부 문구로 부분 · 전면을 클라가 분류하고 에코를 정본으로 삼는 방식. 서버 문구를 웹이 다시 분류하게 되어 문구 원천이 둘이 된다. 서버 문구가 바뀌면 조용히 갈라지고, 구서버 · 다른 탭 팬아웃까지 맞춰야 한다.
- 기각한 대안 B: 신호를 추가하지 않고, 훅이 보낸 뒤 에코를 못 본 모든 답을 유예하는 방식. 거부가 아닌 답(미등록 키 철거 에코)의 판정까지 늦어진다. 게다가 「답만 증가 = 즉시 거부」를 잠근 기존 훅 · 폼 테스트 수십 곳(계획 시점 훅 테스트만 42곳)을 고쳐야 한다.
- R3-WR-02 — 리뷰어 제안대로 **보낸 프레임의 답 전용 신호**(`sentSuccessSeq` · `lastSentSuccessField`)를 분리한다. ① 에서만 오르고, 한 실행에 in-flight 는 최대 1건이라 덮일 수 없다. 옛 불리언 플래그는 없앤다. 계획 시점 grep 결과 소비처는 폼과 훅 테스트뿐이다.

<!-- planner-discipline-allow: lastSuccessSent -->
(옛 불리언 반환 필드 이름은 `lastSuccessSent` 다. 이 이름은 Task 2 뒤 `webapp/src` 어디에도, 주석에도 남지 않는다.)

- 잔여 한계(명시): 에코가 유예보다 늦게 오는 비정상 지연이면 종전처럼 실패 → 늦은 에코 성공(보낸 성공 아님)이 된다.
- 체크포인트 판정: assumption-delta 는 quick 이라 phase_unresolved 로 생략한다. schema-gate 는 스키마 파일이 없어 생략한다.

Purpose: D-06 · D-35 자동 체크(6체크 무장의 유일한 흔적)가 가장 필요한 부분 거부 흐름에서 사라지지 않게 하고, 사람이 방금 켠 추가매수가 조용히 버려지지 않게 한다.
Output: webapp 소스 4개 · 테스트 5개 수정, 태스크별 코드 커밋(한국어 · `fix(quick-260929-akj): …` 모양 · 공동 저자 트레일러 없음). **push · 배포 없음**(이 저장소에서 push = webapp 프로덕션 배포). 문서 커밋은 오케스트레이터가 한다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/24-limitchaser-buy3/24-REVIEW-R3.md
@webapp/src/components/trading/lc/use-lc-field-commit.ts
@webapp/src/components/trading/card/strategy-card.tsx
@webapp/src/components/trading/limit-chaser-form.tsx

<interfaces>
<!-- 계획 시점(2026-09-29 07:45 KST) 라이브 관찰. 줄 번호는 그 시점 기준이며, 편집 전 grep 으로 다시 찾는다. -->

use-lc-field-commit.ts (861줄)
- UseLcFieldCommitOptions (L262-282): server · formRef · setForm · buildCfg · send · onSent? · serverAnswerSeq · disabled · unacked? · armBlockOf?
- interface Inflight extends Pending { answerSeqAtSend: number } (L318-321) — sendNow 가 setInflight({ ...p, companions, answerSeqAtSend: serverAnswerSeq }) (L595)
- success 상태 { seq, field, sent } (L458-462) · markSuccess(field, sent = false) (L468-480)
- failInflight(inf, reason) (L662-683): setInflight(null) · popAfterSeqRef=null · setFailure · revertToggle · failQueue('rejected') · timeout 이면 고아 장벽
- 해소 이펙트 (L781-839): serverChanged = prevServerRef !== server · ① (L789-811: matches → setInflight(null) · markSuccess(inf.field, true) · serverChanged 면 popAfterSeqRef=seq 아니면 drainNow / unacked → timeout / answered → rejected) · ①-2 고아 · ② 꺼내기 · ③ 늦은 에코(L831-838: rejected/timeout 실패 중 server[f] === fail.value 면 markSuccess(f))
- 언마운트 정리 이펙트 (L841-847) · 반환 (L849-860): successSeq · lastSuccessField · 옛 불리언 필드(success.sent) · clearFailure · amountRequired
- 헤더 문서 ③ (L15-19) · ⑧ (L54-57) · ⑫ (L102-105)

strategy-card.tsx
- StrategyCardState.answerSeq (L208-209) · useState answerSeq (L333) · acceptAnswer (L409-414)
- 메시지 이펙트의 set 거부 분기 (L653): if (isLimitChaserSetRejection(msg, isin, accountNo)) acceptAnswer();
- 반환 객체 answerSeq (L730)

card-body.tsx: card 구조분해 (L213-226, answerSeq L221) · <LimitChaserForm … serverAnswerSeq={answerSeq} (L271)

limit-chaser-form.tsx
- props serverAnswerSeq?: number 문서 (L524-535) · 구조분해 기본값 serverAnswerSeq = 0 (L598) · useLcFieldCommit({ … serverAnswerSeq, disabled, unacked, armBlockOf }) (L682-694)
- const { successSeq, lastSuccessField, <옛 불리언>, commit: commitField, clearFailure } = lc (L720)
- 편집기 · 시트 닫기 이펙트 (L747-751) · successSeqRef (L930-931) · autoCheckRef · pendingAutoCheckRef (L938-945, 그룹별 슬롯)
- commitGroupSwitch 의 슬롯 기록 (L1006-1024: pendingAutoCheckRef[autoGate] = successSeqRef.current)
- 자동 체크 이펙트 (L1055-1078): 실패 슬롯 버림 → lastSuccessField 가 선매수/추가매수면 seqAtSend 확인 · 슬롯 소비 · 옛 불리언 false 면 return · 서버 ON 재확인 · groupAutoCheckLogLine → clientLogRef

테스트 하네스
- 훅 테스트: setup(over) (L106-142) → { hook, update(next) = rerender, send, setForm, onSent, formRef, cfgs() }. 전역 vi.useFakeTimers({ shouldAdvanceTime: true }) (L144-150). echo() 기본값: 마스터 ON · 매도 OFF · 매도 가격 130,000 · 매도 매수잔량 10 · LC_BUY3_ECHO_DEFAULTS(선매수 · 추가매수 · 후매수 OFF).
  「답만 증가 → 즉시 거부」 케이스(L196 · L213 Pitfall 4 등)는 거부 신호가 없는 경로라 그대로 둔다.
  옛 불리언 신호 describe 는 L786-866(7케이스).
- 폼 테스트: props() (L119) · sw(name) (L137) · click (L152) · editInline(id, value) (L176) · sentConfigs() · lastConfig(). 가짜 타이머는 전역이 아니다(describe 안 설치 패턴 L317 · L1688).
  GC-WR-04 describe (L2838-2973)의 idle · SIX · PRE_FULL_LINE · autoLines 가 새 케이스의 모델이다.
- 카드 흐름 테스트: setRelay (L150) · Card (L166-196, lastCard) · msg() (L102) · quote() (L117) · lcSets() · INLINE_FAILED (L229).
  ㉑-e (L723-750)는 실제 거부 메시지 → 인라인 실패를 await waitFor 로 단언한다. GC-WR-01 describe (L1587~)의 rejection() 헬퍼도 있다. 전역 가짜 타이머 shouldAdvanceTime true.
- 트레이서 테스트: lc-tracer ⑤ (L283-309 부근) — rejection() 메시지 → 곧바로 INLINE_FAILED 말풍선 단언. 전역 가짜 타이머.
- card-body.test.tsx L168: StrategyCardState 픽스처 answerSeq: 0.
- 기준선(계획 시점 실행): 대상 6개 테스트 파일 459건 green(11s) · src/components/trading 33파일 1,395건 green(24s).
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: R3-WR-01 트레이서 — 카드 거부 신호 → 폼 → 훅 에코 유예 판정을 끝까지 한 줄로 (통합 회귀 먼저)</name>
  <files>webapp/src/components/trading/lc/use-lc-field-commit.ts, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/card/card-body.tsx, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx, webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx, webapp/src/components/trading/__tests__/card-body.test.tsx</files>
  <precondition>계획 시점에 대상 6개 테스트 파일(Task 1 verify 목록)이 459건 green 이었다. 시작 전에 같은 vitest 명령을 한 번 돌려 green 인지 확인하고, red 면 멈추고 보고한다.</precondition>
  <behavior>
    - 통합(카드+폼+훅, 실제 배관): 선매수 켜기 클릭 → lc.set 1건 · 추가매수 켜기 클릭 → 대기(여전히 1건). 이어서 이 전략 키의 부분 거부 ERROR(매도만 눕힘)가 먼저 오면, 그 렌더에서 「반영하지 못했어요」 0 · 선매수 · 추가매수 스위치 aria-checked true 유지 · lc.set 1건.
    - 이어서 같은 제출의 에코(마스터 ON · 선매수 ON · 매도 OFF)가 오면 lc.set 2건(둘째 cfg extraBuyEnabled true) · 「반영하지 못했어요」 0 · 로그에 「선매수 자동 체크 — 」로 시작하는 줄 1개.
    - 전면 거부(에코 없음): lc-tracer ⑤ 와 카드 흐름 ㉑-e 는 유예 동안 실패 말풍선이 서지 않고, LC_REJECT_ECHO_GRACE_MS 를 진행하면 종전 단언(말풍선 · 입력값 보존 · 재전송 0)이 그대로 선다.
    - 거부 신호 없이 답 신호만 오른 경로(기존 훅 · 폼 「답만 증가」 테스트 전부)는 즉시 판정 그대로다 — 수정 없이 green.
  </behavior>
  <action>
**RED 먼저.** `strategy-card-flow.test.tsx` 에 describe 「R3-WR-01 — 부분 거부 ERROR 가 에코보다 먼저 와도 in-flight 는 같은 제출의 에코로 판정한다 (24-REVIEW-R3)」를 추가하고, 위 behavior 첫 두 항목 케이스 1개를 쓴다.
- 출발 에코는 마스터 OFF · 선매수 · 추가매수 OFF · 두 그룹 금액 > 0 · 매도 매수잔량 > 0 이다. 폼 테스트 GC-WR-04 의 `idle` 모양을 따른다.
- `quote()` 는 D-36 이 걸리지 않게 둔다(매수1호가 ≠ 비교가격, 또는 매수1잔량 < 최소).
- ERROR 는 `msg({ lv: 'ERROR', src: 'SetLimitChaser', i: ISIN, a: ACCOUNT, m: '매도 설정이 불완전합니다(…) — 매도를 켜지 않았습니다' })` 로 만든다. `setRelay` 로 같은 limitChasers + messages 를 넣고 rerender 한다.
- 에코 단계는 `setRelay({ limitChasers: [answered], lastLimitChaserEcho: answered, messages: [같은 rej 객체] })` → rerender 다. 같은 메시지 객체를 다시 넘겨 카드가 ERROR 를 두 번 처리하지 않게 한다.
- 전송 수와 로그 줄은 `await waitFor` 로 단언한다.
- 수정 전에 이 케이스를 돌려 **실패를 눈으로 확인한다**(ERROR 렌더에서 실패 문구 · 스위치 되돌림 · 둘째 전송 없음). RED 만 따로 커밋하지 않는다. 테스트와 수정은 이 태스크의 한 커밋으로 묶는다.

**GREEN.**
(1) `use-lc-field-commit.ts`
- `export const LC_REJECT_ECHO_GRACE_MS = 1_000` 을 둔다. JSDoc 에 근거를 적는다: ProcessSetLimitChaser 가 ERROR → 저장 → 에코를 같은 연결로 동기 송신 · 도착 간격 = 전송 + 렌더 1회 · 전면 거부 표시는 1초 안 · 에코가 유예보다 늦으면 종전처럼 실패 → 늦은 에코 성공.
- `UseLcFieldCommitOptions` 에 `serverRejectSeq?: number` 를 추가한다(카드가 이 전략의 lc.set 거부 통지를 접수한 횟수 · 바뀌었다는 사실만 쓴다 · 거부 통지는 serverAnswerSeq 도 함께 올린다).
- `Inflight` 에 `rejectSeqAtSend: number` 를 추가한다. `sendNow` 의 setInflight 에서 `optsRef.current.serverRejectSeq ?? 0` 을 기록한다.
- 유예 타이머 ref 하나와 해제 헬퍼를 둔다.
- 해소 ① 의 판정 순서를 matches → unacked → [answered ∧ 지금 거부 신호 ≠ inf.rejectSeqAtSend ∧ !serverChanged 이면 유예] → answered 면 failInflight(inf, 'rejected') 로 바꾼다.
  - 유예는 타이머가 없을 때만 건다. 이미 걸려 있으면 마감을 늘리지 않는다.
  - 타이머 콜백은 참조를 비우고, `inflightRef.current === inf` 일 때만 `failInflight(inf, 'rejected')` 를 부른다. 아무것도 보내지 않는다(T-16-10).
- 해제 헬퍼는 ① matches 분기, `failInflight` 첫머리, 언마운트 정리 이펙트에서 부른다.
- 해소 이펙트는 `o.serverRejectSeq ?? 0` 을 읽고 deps 에 넣는다.
- 헤더 ③ · ⑧ 을 새 규칙으로 고쳐 쓴다: 거부 통지 답은 같은 렌더에 에코가 없으면 유예, 유예 중 에코가 정본, 에코 없으면 유예 끝에 거부, 거부 신호 없는 답은 즉시 판정.

(2) `strategy-card.tsx`
- `StrategyCardState.rejectSeq: number` 를 추가한다. JSDoc: lc.set 거부 통지 접수 횟수 · 부분 거부는 ERROR 뒤 같은 제출의 에코가 오므로 폼 훅이 이 신호로 판정을 유예한다(R3-WR-01) · 값 자체에는 뜻이 없다.
- useState 를 두고, L653 분기를 `acceptAnswer()` 와 `setRejectSeq(n => n + 1)` 둘 다 하게 바꾼다. 주석 블록에 R3-WR-01 한 줄을 덧붙인다.
- 반환 객체에 `rejectSeq` 를 넣는다. arm 거부 분기는 건드리지 않는다.

(3) `card-body.tsx`: card 구조분해에 `rejectSeq` 를 추가하고 `<LimitChaserForm … serverRejectSeq={rejectSeq}` 를 넘긴다.

(4) `limit-chaser-form.tsx`: prop `serverRejectSeq?: number` 를 추가한다(serverAnswerSeq 문서 옆에 짧은 JSDoc · 구조분해 기본값 0). `useLcFieldCommit` 옵션으로 넘긴다. 이 태스크에서 폼의 다른 곳은 건드리지 않는다.

(5) 전면 거부를 즉시 실패로 잠근 통합 테스트 2곳에 유예를 반영한다.
- `lc-tracer.test.tsx` ⑤: 거부 rerender 직후 「말풍선 0 · 편집기 readOnly true」를 단언한다. 그다음 `act(() => vi.advanceTimersByTime(LC_REJECT_ECHO_GRACE_MS))` 를 하고, 기존 단언을 그대로 둔다.
- `strategy-card-flow.test.tsx` ㉑-e: 거부 rerender 뒤 `act(() => vi.advanceTimersByTime(LC_REJECT_ECHO_GRACE_MS))` 를 먼저 한 다음 기존 `await waitFor` 로 넘어간다. 유예 1초와 waitFor 기본 1초가 경주하지 않게 하기 위해서다.
- 상수는 `use-lc-field-commit` 에서 import 한다. ㉑-a~d 는 카드 신호만 단언하므로 손대지 않고 green 인지만 확인한다.

(6) `card-body.test.tsx` L168 픽스처에 `rejectSeq: 0` 을 추가한다(tsc).

파일 수가 5개를 넘는 이유: (5)(6)은 이 변경이 강제하는 1~3줄짜리 기계적 조정이다. 따로 떼면 red 커밋이 생긴다.

커밋: `fix(quick-260929-akj): R3-WR-01 부분 거부 ERROR 뒤 같은 제출 에코를 기다려 판정 — 카드 거부 신호 · 훅 유예` 모양의 한국어 메시지로 한다. 공동 저자 트레일러는 넣지 않는다. push 하지 않는다.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)/webapp" && npx vitest run src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx src/components/trading/__tests__/card-body.test.tsx src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card.test.tsx && npx tsc --noEmit && grep -n "export const LC_REJECT_ECHO_GRACE_MS" src/components/trading/lc/use-lc-field-commit.ts && grep -n "setRejectSeq" src/components/trading/card/strategy-card.tsx && grep -n "serverRejectSeq={rejectSeq}" src/components/trading/card/card-body.tsx && grep -n "serverRejectSeq" src/components/trading/limit-chaser-form.tsx && grep -n "R3-WR-01" src/components/trading/__tests__/strategy-card-flow.test.tsx</automated>
  </verify>
  <done>새 통합 케이스가 수정 전에는 실패하고 수정 후에는 통과한다(ERROR 먼저 → 실패 0 · 스위치 유지 → 에코 → lc.set 2건 · 선매수 자동 체크 줄 1개). 전면 거부 통합 케이스 2개는 유예 뒤 종전 단언대로 통과하고, 기존 「답만 증가」 훅 · 폼 테스트는 수정 없이 통과한다. 6개 파일 vitest · tsc green, 코드 커밋 1개(한국어 · 트레일러 없음 · push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: R3-WR-02 — 보낸 프레임의 답 전용 성공 신호를 분리하고 폼의 자동 체크 줄 · 편집기 닫기가 그것을 소비</name>
  <files>webapp/src/components/trading/lc/use-lc-field-commit.ts, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx</files>
  <behavior>
    - 훅(리뷰어 재현): setup() → commit('sellEnabled', true, 'toggle') 전송 → update({ serverAnswerSeq: 1 }) 로 거부(value true) → commit('preBuyEnabled', true, 'toggle', { sellEnabled: true }) 가 'sent' → update({ server: echo({ preBuyEnabled: true, sellEnabled: true }) }). 결과: lastSentSuccessField === 'preBuyEnabled' · sentSuccessSeq === 1 · failures.sellEnabled 없음(늦은 에코로 거둠) · lastSuccessField === 'sellEnabled'(일반 신호는 마지막 성공 — 분리 이유 기록) · 전송 2건.
    - 폼(리뷰어 재현): 매도 가격을 채운 idle 모양에서 매도주문 켜기 → 1건 → 같은 서버 · 답 신호 1 로 거부(매도 스위치 false) → 선매수 켜기 → 2건(cfg 에 preBuyEnabled · sellEnabled true 동반) → 선매수 ON · 마스터 ON · SIX 에코 + 답 신호 2. 결과: 자동 체크 줄 정확히 1개 · 「선매수 자동 체크 — 켬: 」로 시작 · 「매도주문」 포함.
    - 폼(같은 뿌리): 매도주문 거부 실패가 남은 채 값 행 인라인 확정(예: 매수 비교잔량 lc-buy-watch-qty) Enter → 전송 · 편집기 열림. 그 값과 sellEnabled true 를 함께 실은 에코 + 답 신호 → 그 편집기가 닫힌다.
    - 옛 GC-IN-03 describe 7케이스는 새 신호로 옮겨도 같은 의미로 통과한다: 보낸 답이면 sentSuccessSeq 증가 + lastSentSuccessField = 그 필드, no-op · 대기 접기 · 로컬 반영 · 늦은 에코면 sentSuccessSeq 불변.
  </behavior>
  <action>
**RED 먼저.**
- 훅 테스트에 describe 「R3-WR-02 — 보낸 프레임의 답 신호는 같은 판정 실행의 늦은 에코 성공에 덮이지 않는다 (24-REVIEW-R3)」와 behavior 첫 항목 케이스를 추가한다.
- 폼 테스트에 describe 「R3-WR-02 — 성공 신호가 한 실행에 겹쳐도 자동 체크 줄 · 편집기 닫기가 선다 (24-REVIEW-R3)」와 behavior 둘째 · 셋째 항목 케이스를 추가한다. 헬퍼(idle · SIX · autoLines)는 GC-WR-04 describe 것을 본떠 이 describe 안에 둔다.
- 폼의 거부 단계는 거부 신호 없는 답(serverAnswerSeq 만 증가 → 즉시 실패)으로 모델해도 된다. 이 태스크의 주제는 성공 신호다.
- 돌려서 실패를 확인한다(새 필드가 없음 · 줄 0 · 편집기 열림).

**GREEN — 훅.**
- 성공 상태를 `{ seq, field }` 로 줄이고 `markSuccess(field)` 에서 둘째 인자를 없앤다.
- 새 상태 `sentSuccess: { seq, field }` 를 둔다. 해소 ① matches 분기에서만 `markSuccess(inf.field)` 와 `setSentSuccess(s => ({ seq: s.seq + 1, field: inf.field }))` 를 함께 부른다.
- 반환 타입과 객체에 `sentSuccessSeq: number` · `lastSentSuccessField: LcFieldKey | null` 을 넣는다. JSDoc: 이 훅이 소켓에 실은 in-flight 프레임의 답일 때만 오른다 · 한 판정 실행에 in-flight 는 최대 1건이라 같은 실행의 늦은 에코 · 대기 접기 성공이 덮지 못한다(R3-WR-02) · 일반 성공 신호는 모든 성공을 낸다.
- 옛 불리언 반환 필드와 그 JSDoc 을 지운다.
- 헤더 ⑫ 의 해당 두 줄을 새 신호 설명으로 바꾼다. 옛 필드 이름은 주석에도 쓰지 않고 개념으로 적는다.

**GREEN — 폼.**
- L720 구조분해를 새 두 필드로 바꾼다.
- 편집기 · 시트 닫기: 기존 이펙트(일반 신호) 옆에, `sentSuccessSeq` 가 바뀌면 `lastSentSuccessField` 의 편집기 · 시트를 닫는 이펙트를 하나 더 둔다. 닫기는 멱등이다.
- 자동 체크 이펙트를 세 단계로 다시 쓴다. deps 는 successSeq · lastSuccessField · sentSuccessSeq · lastSentSuccessField · lc.failures 다.
  - (a) 실패한 그룹 슬롯 버림 — 지금 그대로.
  - (b) `useRef` 로 마지막으로 본 sentSuccessSeq 를 기억한다. 값이 바뀐 실행에서만 lastSentSuccessField 가 선매수 · 추가매수면 그 그룹 슬롯을 소비한다. 소비 조건 · 판정은 종전과 같다: pending 이 있고 successSeq ≠ seqAtSend · 서버 ON 재확인 · auto 결과 · groupAutoCheckLogLine → clientLogRef.
  - (c) 일반 성공의 필드가 선매수 · 추가매수이고 그 슬롯이 아직 남아 있고 successSeq ≠ seqAtSend 면 **줄 없이 슬롯만 비운다**. 보내지 않은 no-op · 대기 접기 성공이다 — D-08 · GC-IN-03. (b) 가 소비한 슬롯은 이미 없으므로 겹치지 않는다.
- 이펙트 위 주석 블록에 R3-WR-02(성공 신호 둘 · 소비 규칙)를 적는다.

**테스트 이전.**
- 훅 테스트 GC-IN-03 describe(계획 시점 L786-866)를 새 신호로 옮긴다. describe 제목도 「sentSuccessSeq — 보낸 프레임의 답일 때만 오른다 (GC-IN-03 · R3-WR-02)」처럼 바꾼다.
- 옛 이름은 `webapp/src` 어디에도 남지 않게 한다.
- 폼의 기존 자동 체크 · GC-WR-04 · GC-IN-03 · D-35 · ⑲ 케이스는 수정 없이 통과해야 한다. 깨지면 소비 규칙을 고치고, 테스트 기대를 바꾸지 않는다.

커밋: `fix(quick-260929-akj): R3-WR-02 보낸 성공 신호 분리 — 늦은 에코 성공이 자동 체크 줄을 덮지 않게` 모양의 한국어 메시지로 한다. 트레일러 없음, push 없음.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)/webapp" && npx vitest run src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/card-body.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx && npx tsc --noEmit && grep -n "lastSentSuccessField" src/components/trading/lc/use-lc-field-commit.ts && grep -n "sentSuccessSeq" src/components/trading/limit-chaser-form.tsx && grep -n "R3-WR-02" src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx && ! grep -rn "lastSuccessSent" src</automated>
  </verify>
  <done>R3-WR-02 훅 · 폼 새 케이스가 수정 전에는 실패하고 수정 후에는 통과한다. 옛 불리언 신호는 소스 · 테스트 · 주석 어디에도 없다. 기존 폼 자동 체크 계열 케이스는 수정 없이 green 이고, 6개 파일 vitest · tsc 가 green 이다. 코드 커밋 1개(한국어 · 트레일러 없음 · push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: R3-WR-01 훅 · 폼 단위 회귀 잠금(리뷰어 재현 · 유예 경계 · 주 필드 눕힘 · 언마운트) + 변이 확인 + 최종 게이트</name>
  <files>webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx</files>
  <behavior>
    - H1 훅(리뷰어 재현):
      - 준비: setup({ server: echo({ buyEnabled: false }) }) → commit('preBuyEnabled', true, 'toggle', { buyEnabled: true, sellEnabled: true }) 전송 → commit('extraBuyEnabled', true, 'toggle') 대기.
      - update({ serverAnswerSeq: 1, serverRejectSeq: 1 }) 뒤: failures 가 {} · inflightField 'preBuyEnabled' · queuedFields ['extraBuyEnabled'] · 전송 1 · formRef 의 선매수 · 추가매수 true(낙관 유지).
      - update({ server: echo({ buyEnabled: true, preBuyEnabled: true, sellEnabled: false }) }) 뒤: sentSuccessSeq 1 · lastSentSuccessField 'preBuyEnabled' · failures {} · 전송 여전히 1(⑦ — 에코 렌더에서 꺼내지 않는다).
      - update({ serverAnswerSeq: 3 }) 뒤: 전송 2 · cfgs()[1].extraBuyEnabled true · failures.extraBuyEnabled 없음.
    - H2 훅(전면 거부 경계): 같은 준비 → 거부 신호 → LC_REJECT_ECHO_GRACE_MS - 1 진행 시 failures {} → 1ms 더 진행 시 failures.preBuyEnabled = { reason 'rejected', text LC_COMMIT_TEXT.failed, value true } · failures.extraBuyEnabled.reason 'rejected' · formRef 선매수 false(서버 값) · 전송 1 → 10,000ms 더 진행해도 전송 1.
    - H3 훅(주 필드 눕힘): commit('sellEnabled', true, 'toggle') → 거부 신호(답 + 거부) → 실패 없음 → 매도 OFF 인 새 에코 객체로 update 하는 그 렌더에서 타이머 진행 없이 failures.sellEnabled.reason 'rejected' → 유예만큼 진행해도 실패 1건 · 전송 1.
    - H4 훅(언마운트): 유예 중 hook.unmount() → 유예만큼 진행해도 예외 · 경고 없음 · 전송 1.
    - F1 폼(부분 거부): GC-WR-04 idle 에서 선매수 켜기 → 추가매수 켜기(대기) → 같은 서버 + serverAnswerSeq 1 + serverRejectSeq 1: 두 스위치 true · 「반영하지 못했어요」 0 · 자동 체크 줄 0 · 1건 → 선매수 ON · 마스터 ON · 매도 OFF(눕힘) · 나머지 5체크 · 매도 가격 150,800 에코(답 1 · 거부 1 유지): autoLines = [[PRE_FULL_LINE, 'info']] · 1건 → serverAnswerSeq 2: 2건 · lastConfig.extraBuyEnabled true · 추가매수 스위치 true.
    - F2 폼(전면 거부): F1 과 같은 시작 → 거부 신호 → 유예 진행 전 두 스위치 true · 실패 문구 0 → 유예 진행 후 선매수 · 추가매수 · 매도 스위치가 서버 값 false · 자동 체크 줄 0 · 1건.
  </behavior>
  <action>
**새 테스트를 추가한다.**
- 훅 테스트: describe 「R3-WR-01 — 거부 통지 답은 같은 제출의 에코를 LC_REJECT_ECHO_GRACE_MS 기다린다 (24-REVIEW-R3)」에 H1 ~ H4 를 추가한다.
  - `LC_REJECT_ECHO_GRACE_MS` 를 import 한다.
  - 경계에 민감한 H2 는 테스트 시작(setup 전)에 `vi.useFakeTimers({ shouldAdvanceTime: false })` 로 다시 설치한다. 전역 설정은 실시간 흐름이 가짜 시계를 밀어 1ms 경계가 흔들린다.
- 폼 테스트: describe 「R3-WR-01 — 부분 거부 ERROR 가 에코보다 먼저 와도 선매수 자동 체크 줄 · 대기 추가매수가 선다 (24-REVIEW-R3)」에 F1 · F2 를 추가한다.
  - 이 describe 의 beforeEach / afterEach 에서 가짜 타이머를 설치 · 해제한다(파일의 L1688 패턴 · shouldAdvanceTime false — waitFor 를 쓰지 않는다).
  - 헬퍼는 GC-WR-04 를 본떠 이 describe 안에 둔다.
- 기존 「답만 증가 → 즉시 거부」 케이스는 고치지 않는다. 거부 신호 없는 경로의 규칙 문서다.

**변이 확인 — 새 테스트가 버그를 실제로 잡는지 증명한다.**
- `use-lc-field-commit.ts` 의 유예 조건을 일시적으로 항상 거짓이 되게 바꾸고 H1 · F1 · 카드 흐름 R3-WR-01 케이스를 돌린다. 셋 다 실패해야 한다.
- 그다음 파일을 HEAD 그대로 되돌리고(`git checkout -- <파일>`) 다시 green 을 확인한다. 변이는 커밋하지 않는다.
- 변이로도 실패하지 않는 케이스가 있으면 그 케이스를 고친다. 단언이 약한 것이다.

**최종 게이트.** `src/components/trading` 전체와 tsc 를 돌린다. 계획 시점 33파일 1,395건 + 이번 추가분이 green 이어야 한다. e2e 는 돌리지 않는다(작은 수정의 전체 e2e 금지 교훈). 계획 시점 grep 결과 e2e 스펙에는 폼 실패 문구 단언이 없다. 이 판단을 SUMMARY 에 한 줄로 남긴다.

커밋: `test(quick-260929-akj): R3-WR-01 훅 · 폼 회귀 잠금 — 부분 거부 에코 판정 · 전면 거부 유예 경계` 모양의 한국어 메시지로 한다. 트레일러 없음, push 없음.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)/webapp" && npx vitest run src/components/trading && npx tsc --noEmit && git diff --quiet HEAD -- src/components/trading/lc/use-lc-field-commit.ts && test "$(grep -c 'R3-WR-01' src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx)" -ge 1 && test "$(grep -c 'R3-WR-01' src/components/trading/__tests__/limit-chaser-form.test.tsx)" -ge 1 && grep -n "LC_REJECT_ECHO_GRACE_MS" src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx</automated>
  </verify>
  <done>H1 ~ H4 · F1 · F2 가 통과하고, 변이(유예 무력화)로 H1 · F1 · 카드 흐름 R3-WR-01 이 실패하는 것을 확인했다. 확인 뒤 훅 소스는 HEAD 와 같다. src/components/trading 전체 vitest 와 tsc 가 green 이다. 코드 커밋 1개(한국어 · 트레일러 없음 · push 없음).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay WS → 브라우저 | ServerMessage(ERROR) · 60 에코가 신뢰 경계를 넘는다. 카드는 키(isin · 계좌)로 걸러 신호를 올리고, 훅은 에코 값 비교로만 성공을 판정한다 |
| 브라우저 훅 → relay lc.set | 사용자 확정 1회 = 전송 1회. 자동 재전송은 곧 두 번째 등록 · 발주 위험이다(T-16-10) |

## STRIDE Threat Register (ASVS L1 · block_on high)

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-akj-01 | Spoofing | strategy-card.tsx 거부 분기 → rejectSeq | low | mitigate | rejectSeq 는 기존 `isLimitChaserSetRejection(msg, isin, accountNo)` 분기 안에서만 오른다. 다른 계좌 · 다른 종목 거부는 answerSeq · rejectSeq 모두 불변이다(㉑-d 가 잠금 · 무수정 통과) |
| T-akj-02 | Tampering | 훅 ① 유예 중 판정 | medium | mitigate | 성공은 여전히 「에코의 주 필드 값 === 보낸 값」뿐이다(⑧). 유예 경로는 성공을 만들지 않고 실패만 만든다. H3 가 「에코가 주 필드를 눕히면 즉시 거부」를 잠근다 |
| T-akj-03 | Elevation of Privilege | 유예 타이머 · 대기열 꺼내기 | high | mitigate | 타이머 콜백은 `failInflight` 만 부른다(보내지 않는다). 꺼내기는 기존 ⑦ 규칙(사람이 확정한 대기 건 · 에코 뒤 답 신호 렌더)만 탄다. 새 테스트 전부가 전송 수를 센다(H1 = 2 · H2 = 1, 10초 뒤에도 1 · F1 = 2 · F2 = 1) |
| T-akj-04 | Denial of Service | 언마운트 뒤 유예 타이머 | low | mitigate | 언마운트 정리 이펙트에서 clearTimeout 한다. 콜백은 inflight 동일성을 확인한다. H4 가 잠금 |
| T-akj-05 | Repudiation | 부분 거부 사실의 화면 흔적 | low | accept | ERROR 원문 로그 줄 · 상태줄은 카드가 지금처럼 즉시 세운다(무변경). 유예는 폼 훅의 판정 시점만 늦춘다 |
| T-akj-06 | Information Disclosure | 새 신호 · 로그 | low | accept | 새 데이터 · 외부 호출 · 저장 없음. 로그 줄은 기존 자동 체크 문구 원천 그대로다 |
</threat_model>

<verification>
- Task 1 · 2: 대상 6개 테스트 파일 vitest + `npx tsc --noEmit` (webapp) 을 돌린다.
- Task 3: `npx vitest run src/components/trading`(계획 시점 33파일 1,395건 기준선) + `npx tsc --noEmit` 을 돌린다.
- 변이 확인: 유예 무력화로 H1 · F1 · 카드 흐름 R3-WR-01 이 실패하고, 되돌린 뒤 green 이어야 한다.
- 소스 확인: `webapp/src` 에 옛 불리언 신호 이름이 0건이다(Task 2 verify 의 negative grep). LC_REJECT_ECHO_GRACE_MS · serverRejectSeq · sentSuccessSeq · lastSentSuccessField 가 배관 각 지점에 있다.
- 하지 않는 것: e2e(Playwright) 실행 · relay 변경 · push · 배포.
</verification>

<success_criteria>
- R3-WR-01: 리뷰어 재현(답 신호 먼저 → 같은 제출 에코)에서 in-flight 선매수가 성공(보낸 성공)이다. 대기 추가매수는 에코 뒤 답 신호에서 1건 전송되고, `{ extraBuyEnabled: 'rejected' }` 는 생기지 않으며, 선매수 자동 체크 줄이 선다. 전면 거부는 1,000ms 유예 뒤 종전대로 실패한다.
- R3-WR-02: 같은 판정 실행에 늦은 에코 성공이 겹쳐도 보낸 성공 신호는 선매수를 가리키고, 「선매수 자동 체크 — 켬: 매도주문 …」 줄이 선다. 같은 뿌리의 편집기 닫기도 선다.
- 기존 「답만 증가」 · GC-WR-01~04 · GC-IN-03 · D-35 · ⑲ 테스트는 기대를 바꾸지 않고 통과한다(옛 불리언 신호 describe 의 이름 이전만 예외).
- 코드 커밋 3개. 모두 한국어이고 `(quick-260929-akj)` 스코프이며 공동 저자 트레일러가 없다. push · 배포는 없다.
</success_criteria>

<output>
Create `.planning/quick/260929-akj-24-review-r3-r3-wr-01-error-r3-wr-02/260929-akj-SUMMARY.md` when done — 설계 선택(카드 거부 신호 + 1,000ms 유예 · 기각 대안 2개), 변이 확인 결과, 테스트 수(전후), e2e 미실행 근거 한 줄, 잔여 한계(유예보다 늦은 에코)를 담는다.
</output>
