---
phase: quick-260929-htw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
autonomous: true
requirements: [R3-G1, R4-WR-01]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "부분 거부 — 선매수 켬 성공 에코가 매도주문만 눕혀(sellEnabled false) 오면 로그 줄은 정확히 「선매수 자동 체크 — 켬: 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 켜지 않음: 매도주문(서버 거부) / 매도 주문가격·비교가격 = 상한가 150,800원」 이고 level 은 error 다. 「켬」 에는 에코에 선 항목만 들어간다 (R3-G1 · R4-WR-01)"
    - "요청한 항목이 에코에 전부 선 경우 로그 줄은 지금과 한 글자도 다르지 않다 — ⑲ · D-35 · GC-WR-04 · R3-WR-02 · 카드 24-07 의 기존 자동 체크 줄 테스트는 기대값 수정 없이 통과한다"
    - "같은 흐름의 대기 추가매수는 방금 서버가 눕힌 매도주문을 다시 싣지 않는다 — 두 번째 lc.set 의 sellEnabled 는 false(서버 값)이고 매도주문 스위치는 OFF 로 보인다. 그 성공 에코 뒤 「추가매수 자동 체크 — 켜지 않음: 매도주문(서버 거부)」(error) 한 줄이 선다. 전송 수는 사람 클릭 수 그대로다(폼 F1 = 2 · 카드 흐름 = 2)"
    - "흐름이 빈 뒤(in-flight · 대기 · 답 대기 장벽 · 결과 모름 장벽 모두 없음) 사람이 새로 누른 확정은 눕힌 동반 기억이 비어 있다 — 새 클릭은 새 의도라 자동 체크가 평소대로 매도주문을 요청한다"
    - "사유 어휘 「서버 거부」 는 lib 판정 한 곳(limit-chaser.ts)에서만 만들어지고 UI-SPEC 닫힌 목록에 올라 있다. 예측 사유가 있으면 예측 사유가 먼저이고, 취소>잔량추적 의 「취소가 켜지지 않음」 사유는 취소가 실제로 받은 사유를 따른다"
    - "webapp src/components/trading · src/lib 테스트 전체와 tsc --noEmit 이 green 이다. 코드 커밋은 한국어 메시지 · 공동 저자 트레일러 없음 · push 와 배포는 하지 않는다"
  artifacts:
    - path: "webapp/src/lib/limit-chaser.ts"
      provides: "AutoCheckReason 「서버 거부」 · confirmAutoChecks(예측 → 에코로 확정, 순수 함수) · groupAutoChecksOf 넷째 인자 refused(서버가 눕힌 필드 사전 제외)"
      contains: "export function confirmAutoChecks"
    - path: "webapp/src/components/trading/limit-chaser-form.tsx"
      provides: "자동 체크 줄 (b) 가 confirmAutoChecks(auto, 서버) 로 확정한 결과를 쓴다 · 그룹 켬 동반 함수가 훅의 laid 를 groupAutoChecksOf 에 넘긴다"
      contains: "confirmAutoChecks("
    - path: "webapp/src/components/trading/lc/use-lc-field-commit.ts"
      provides: "⑬ 눕힌 동반 — 해소 ① 성공 때 켜 달라 보낸 동반 중 에코에 서지 않은 필드를 모으고, 동반 함수 둘째 인자로 넘기며, 흐름이 빈 상태의 새 확정에서 비운다"
      contains: "laidRef"
    - path: "webapp/src/lib/__tests__/limit-chaser.test.ts"
      provides: "confirmAutoChecks 표(요청 6 · 에코 6 / 요청 6 · 에코 5 / 예측 생략 + 서버 거부 순서 / 가격 한 칸) · refused 입력 표"
      contains: "confirmAutoChecks"
    - path: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx"
      provides: "F1 기대값 교정(서버 거부 · error) + 대기 추가매수 sellEnabled false · 추가매수 줄 잠금"
      contains: "매도주문(서버 거부)"
    - path: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx"
      provides: "카드 + 폼 + 훅 통합 — 부분 거부 선매수 줄 정확 문장 · 두 번째 lc.set sellEnabled false"
      contains: "매도주문(서버 거부)"
    - path: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx"
      provides: "눕힌 동반 전달 · 전부 섬이면 빈 기억 · 흐름이 빈 뒤 새 확정은 빈 기억"
      contains: "R3-G1"
    - path: ".planning/phases/24-limitchaser-buy3/24-UI-SPEC.md"
      provides: "자동 체크 로그 사유 닫힌 목록에 「서버 거부」 추가 · 「켬」 은 성공 에코로 확정 · 부분 거부 예시"
      contains: "서버 거부"
  key_links:
    - from: "limit-chaser-form.tsx 자동 체크 이펙트 (b) 보낸 성공 소비"
      to: "limit-chaser.ts confirmAutoChecks → groupAutoCheckLogLine"
      via: "슬롯의 예측 결과(auto)를 serverRef.current(성공 에코)와 대조해 에코에 선 항목만 「켬」, 나머지는 skipped '서버 거부'"
      pattern: "groupAutoCheckLogLine\\(confirmAutoChecks\\("
    - from: "use-lc-field-commit.ts 해소 ① matches 분기"
      to: "limit-chaser-form.tsx commitGroupSwitch 동반 함수 → groupAutoChecksOf(…, laid)"
      via: "inf.companions 의 true 불리언 중 server[k] !== true 를 laidRef 에 모으고 companionsAt(p, base, laid) 로 넘긴다 — 꺼내는 순간 계산(sendNow · drain no-op · failQueue · commit shown)이 모두 같은 기억을 본다"
      pattern: "laidRef"
---

<objective>
24-VERIFICATION-R3 의 R3-G1(= 24-REVIEW-R4 R4-WR-01)을 닫는다. 고칠 것은 두 가지다.

1. 부분 거부 뒤 되살아난 「선매수 · 추가매수 자동 체크」 로그 줄이, 서버가 눕힌 항목까지 「켬」 으로 적는다.
2. 같은 뿌리의 부수 효과가 있다. 대기하던 추가매수를 꺼낼 때 방금 서버가 눕힌 매도주문을 다시 싣는다.

**뿌리.** 자동 체크 판정(`groupAutoChecksOf`)은 누른 순간 · 꺼내는 순간의 **예측**이다. 서버가 실제로 선 결과(성공 에코)를 두 자리 모두에서 보지 않는다.
- 로그 줄: `limit-chaser-form.tsx:1083` 이 그룹 게이트 하나만 에코와 대조하고, 내용은 예측값 그대로 쓴다.
- 대기 건: 꺼낼 때 동반 함수가 에코를 `base` 로 다시 예측한다. 그래서 서버가 방금 거부한 항목을 또 켠다.

**수정 방향 — 판정은 lib 한 곳, 사실은 에코.**
- **사후 확정 `confirmAutoChecks(auto, server)`**(리뷰어 제안). 요청했는데 에코에 서지 않은 항목은 「켬」 에서 빼고 사유 「서버 거부」 로 옮긴다. 가격 조각도 에코에 선 칸만 남긴다.
- **사전 제외 `groupAutoChecksOf(gate, values, upper, refused)`.** 훅이 「이 흐름에서 서버가 눕힌 내 동반 필드」 를 동반 함수에 넘긴다. 자동 체크는 그 항목을 다시 켜지 않고 같은 사유로 적는다. 이것이 24-REVIEW-R4 가 제시한 선택지 (ii) 다.
  - (i) 수용은 기각한다. 로그는 사실만 적어야 한다(무로그 fail-safe 금지). 그런데 거의 확실히 같은 ERROR 를 다시 부르는 재요청을 알면서 두는 셈이다.
  - 기억의 수명은 **흐름**이다. 흐름이 비면(in-flight · 대기 · 장벽 없음) 사람의 새 확정이 기억을 비운다. 새 클릭은 새 의도이므로 평소대로 요청한다. 서버가 또 눕혀도 이제는 로그가 사실대로 적는다.
  - 기억을 폼이 아니라 훅에 두는 이유가 있다. 폼 (b)(줄 소비)와 훅의 대기 꺼내기는 흐름마다 실행 순서가 다르다.
    - 폼 단독 F1: (b) 가 먼저다.
    - 카드 흐름: 카드의 답 신호 증가와 보낸 성공 상태가 한 렌더로 합쳐져 훅 꺼내기가 먼저다.
    - 그래서 폼 슬롯으로 기억을 만들면 순서에 따라 기억이 빈다. 훅은 in-flight 가 실제로 실은 동반 값(`inf.companions`)과 그 답 에코를 같은 실행에서 본다. 순서와 무관하게 정확하다.

**부수 효과 재현 판정 — 계획 시점 코드 판독(가변 외부 상태 아님).**
- F1 에코 `pre` 는 `sellEnabled false` 다. 폼 테스트 `echo()` 기본값 `sellOrderRatio 100`(limit-chaser-form.test.tsx:96) · `sellWatchQty 10` · 가격 150,800 이 함께 온다.
- 꺼낼 때 흐름: `sendNow`(use-lc-field-commit.ts:587-590) → `companionsAt` → 폼 동반 함수(limit-chaser-form.tsx:1009-1015) → `groupAutoChecksOf('extraBuyEnabled', base)` 순서다. 여기서 매도주문의 세 조건(가격 · 매도 매수잔량 · 매도비율)이 모두 통과한다.
- 결과: `companions.sellEnabled = true` 가 되어 cfg 에 실린다. 카드 흐름 `echo()` 도 `sellOrderRatio 100`(strategy-card-flow.test.tsx:79)이라 같다.
- 따라서 **재현된다**고 판정하고, 같은 뿌리로 함께 고친다. Task 2 의 첫 RED 가 이를 실행으로 다시 확인한다.

**범위 밖(건드리지 않는다):** R4-IN-01~03, R3-IN-01~03, 이미 켜져 있던 항목을 서버가 눕힌 경우(자동 체크가 요청한 항목이 아니다 — 서버 ERROR 원문 줄이 말한다), D-01 마스터 동반의 재요청(D-32 로 주 필드가 함께 눕으므로 성공 경로가 없다).
**체크포인트 판정:** assumption-delta 는 no-change 다(quick · 단수↔복수 전이 없음). schema-gate 는 스키마 파일이 없어 생략한다.

Purpose: 「매도 · 취소 6체크 무장의 유일한 흔적」 인 이 로그가 부분 거부에서도 사실과 일치하게 한다. 그리고 서버가 방금 거부한 무장을 사람 모르게 다시 요청하지 않게 한다.
Output:
- 소스 3개 · 테스트 4개 · UI-SPEC 1개를 수정한다.
- 태스크별 코드 커밋은 한국어로 `fix(quick-260929-htw): …` 모양이고 공동 저자 트레일러가 없다.
- **push · 배포는 없다**(이 저장소에서 push = webapp 프로덕션 배포). 문서 · STATE 커밋은 오케스트레이터가 한다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/24-limitchaser-buy3/24-VERIFICATION-R3.md
@.planning/phases/24-limitchaser-buy3/24-REVIEW-R4.md
@.planning/quick/260929-akj-24-review-r3-r3-wr-01-error-r3-wr-02/260929-akj-SUMMARY.md

<interfaces>
<!-- 계획 시점(2026-09-29) 라이브 관찰. 줄 번호는 그 시점 기준이다. 편집 전 grep 으로 다시 찾는다. -->

webapp/src/lib/limit-chaser.ts (720줄)
- L290 AutoCheckGate · L292 AutoCheckItem(순서 = 로그 순서: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적)
- L294 AutoCheckReason 닫힌 목록. JSDoc 은 「새 사유를 여기 더하지 않는다(문구 원천이 UI-SPEC 이다)」 라고 적는다. 그래서 UI-SPEC 을 같은 태스크에서 개정한다
- L296-304 GroupAutoCheckResult { groupLabel, companions, turnedOn, skipped, priceFilled }
- L314-321 AUTO_CHECK_FIELD(항목 ↔ 필드, 비공개)
- L349-424 groupAutoChecksOf(gate, values, upperLimit)
  - decide(item, checks): 이미 켜짐이면 목록 밖 · 첫 실패 사유면 skipped · 아니면 companions[field]=true · turnedOn
  - 취소>잔량추적 은 [!cancelOn, '취소 매수잔량 0'] 이다(주석: 취소가 못 켜진 사유와 같다)
- L433-448 groupAutoCheckLogLine(r)
  - 가격 라벨은 r.companions 의 sellOrderPrice · sellWatchPrice 유무로 정한다
  - level = skipped 가 있으면 error

webapp/src/components/trading/limit-chaser-form.tsx (1664줄)
- L672-685 useLcFieldCommit({ … }) · L711 commit: commitField
- L938 autoCheckRef · L945 pendingAutoCheckRef(그룹별 슬롯)
- L1006-1016 commitGroupSwitch 켜는 방향: commitField(gate, true, 'toggle', (base) => { … groupAutoChecksOf(autoGate, base, upperLimitRef.current) … })
- L1064-1095 자동 체크 이펙트 (a)(b)(c). (b) L1083 이 수정 지점이다:
  const line = serverRef.current?.[gate] === true && auto !== undefined ? groupAutoCheckLogLine(auto) : null;

webapp/src/components/trading/lc/use-lc-field-commit.ts (927줄)
- 헤더 ⑪(L90-110 동반) · ⑫(L111-117)
- L312-314 export type LcCompanions = Partial<LimitChaserFormValues> | ((base) => Partial<LimitChaserFormValues>)
- L376-383 booleanCompanions · L389-396 companionsAt(p, base) · L399 sameAsServer
- companionsAt 호출 4곳:
  - L588 sendNow
  - L647 drain no-op
  - L681 failQueue
  - L749 commit shown
- L732-806 commit: disabled 가드 → shown 계산 → 같은 필드 대기 교체 → no-op → busy(inflight · popAfterSeqRef · orphanBlocks) → 대기 또는 sendNow
- L818-900 해소 이펙트. ① matches(L835-848)는 clearRejectGrace → setInflight(null) → markSuccess → setSentSuccess → popAfterSeq/drainNow 순서다. inf.companions 는 실제로 실은 계산 값이다(L626-632)

테스트 하네스
- lib 테스트
  - L525 groupAutoChecksOf(preBuyEnabled) describe 의 base() 가 모델이다
  - L656 groupAutoCheckLogLine describe
  - L712 D-35 describe
- 폼 테스트
  - L56 sentConfigs · L63 lastConfig · L73 echo(기본 sellOrderRatio 100 · L96) · L120 props · L138 sw
  - L3141-3226 R3-WR-01 describe
    - idle · FIVE_WITHOUT_SELL · PRE_FULL_LINE(L3159) · autoLines · startAndReject
    - F1 L3184: L3199 가 [[PRE_FULL_LINE, 'info']] 를 기대한다 = 잘못 잠긴 값
- 카드 흐름 테스트
  - L55 echo(sellOrderRatio 100 · L79) · L202 logRows · L235 lcSets
  - L1732-1813 R3-WR-01 describe
    - autoPre L1737 · 에코 answered L1788-1800
    - L1808 은 autoPre() 길이 1 만 본다
  - L1218-1257 24-07 describe(전부 섬 · 기대값 불변 대상)
- 훅 테스트
  - L43 echo · L111 setup(over) → { hook, update, send, formRef, cfgs() } · L146 전역 가짜 타이머
  - L912-1020 R3-WR-01 describe 의 prepPreBuyWithQueuedExtra(L914)와 H1(L930)이 새 케이스의 모델이다
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: R3-G1 트레이서 — 자동 체크 줄을 성공 에코로 확정한다(lib confirmAutoChecks · 사유 「서버 거부」 · 폼 (b) 배선 · F1 기대값 교정 · UI-SPEC)</name>
  <files>webapp/src/lib/limit-chaser.ts, webapp/src/lib/__tests__/limit-chaser.test.ts, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx, .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md</files>
  <read_first>
    - webapp/src/lib/limit-chaser.ts L286-449 (자동 체크 절 전체)
    - webapp/src/components/trading/limit-chaser-form.tsx L1050-1096 (자동 체크 이펙트 주석 · (a)(b)(c))
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx L3134-3226 (R3-WR-01 describe · F1 · F2)
    - webapp/src/lib/__tests__/limit-chaser.test.ts L525-770 (groupAutoChecksOf · groupAutoCheckLogLine · D-35 표)
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md L396-406 (선매수 자동 체크 로그 문법 · 사유 닫힌 목록) · L728-742 (D-35 일반화 절)
  </read_first>
  <behavior>
    - lib confirmAutoChecks — 요청 6 · 에코 6 이면 입력과 같은 결과를 낸다. 로그 줄은 기존 FULL 문장 그대로 · info 다.
    - lib confirmAutoChecks — 요청 6 · 에코 5(매도주문만 눕힘 · 가격 선다)면 turnedOn 5개 · skipped 에 매도주문(서버 거부)가 오고 priceFilled 는 그대로다. 줄은 「선매수 자동 체크 — 켬: 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 켜지 않음: 매도주문(서버 거부) / 매도 주문가격·비교가격 = 상한가 150,800원」 · error 다.
    - lib confirmAutoChecks — 예측 생략(예: 취소 매수잔량 0 → 취소 · 취소>잔량추적)과 서버 거부(매도주문)가 섞이면 skipped 는 항목 정본 순서다. 매도주문(서버 거부) · 취소(취소 매수잔량 0) · 취소>잔량추적(취소 매수잔량 0) 순이다.
    - lib confirmAutoChecks — 채운 가격 두 칸 중 에코에 한 칸만 서면 가격 조각은 선 칸 이름만 댄다(예: 「매도 비교가격 = 상한가 …」). 둘 다 안 서면 가격 조각이 없다. 입력 객체는 변하지 않는다(순수).
    - lib groupAutoChecksOf 넷째 인자 refused — refused 에 sellEnabled 가 있고 예측 조건이 모두 통과하면 매도주문은 skipped(서버 거부)다. companions 에 sellEnabled 가 없다.
    - lib groupAutoChecksOf refused — 이미 켜진 항목은 refused 여도 목록 밖이다. 예측 사유가 있으면 예측 사유가 먼저다(매도 매수잔량 0 + refused 매도주문 → 매도주문(매도 매수잔량 0)).
    - lib groupAutoChecksOf refused — refused 에 cancelQtyEnabled 가 있으면 취소(서버 거부)가 되고, 취소>잔량추적 도 취소(가 받은) 사유를 따라 서버 거부다. 취소 매수잔량 0 이 아니다.
    - lib groupAutoChecksOf refused — 인자를 생략하면 결과가 지금과 같다(기존 표 무수정 통과).
    - 폼 F1 — 부분 거부 에코(sellEnabled false) 뒤 autoLines 는 [[위 부분 거부 문장, 'error']] 다. 기존 [[PRE_FULL_LINE, 'info']] 가 아니다. 실패 표시 0 · 전송 1 → 다음 답 신호에 2 는 그대로다.
  </behavior>
  <action>
RED 먼저. 다음 순서로 진행한다.

1. 폼 테스트 R3-WR-01 describe(limit-chaser-form.test.tsx L3141~)를 고친다.
   - 부분 거부 문장 상수를 새로 둔다(예: PRE_PARTIAL_LINE). 문장은 behavior 의 F1 항 그대로다.
   - F1 L3199 기대값을 [[PRE_PARTIAL_LINE, 'error']] 로 바꾼다.
   - 쓰이지 않게 되는 PRE_FULL_LINE 상수는 이 describe 에서 지운다. GC-WR-04 describe 의 같은 이름 상수는 별개이므로 그대로 둔다.
   - F1 it 제목도 「켜지 않음: 매도주문(서버 거부)」 · error 를 말하도록 고친다.
2. lib 테스트에 두 describe 를 새로 둔다.
   - confirmAutoChecks 표(behavior 1~4)
   - groupAutoChecksOf refused 입력 표(behavior 5~8)
   - 둘 다 기존 base() 헬퍼를 쓴다. 이름에는 R3-G1 · R4-WR-01 을 단다.
3. `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx` 로 새 케이스가 **실패**하는지 확인하고 실패 이유를 기록한다. 이유는 둘 중 하나다: 미구현 export 로 인한 import 실패, F1 문장 불일치.

GREEN — lib(webapp/src/lib/limit-chaser.ts):
- AutoCheckReason 에 '서버 거부' 를 더한다. JSDoc 은 두 가지를 적는다.
  - UI-SPEC 닫힌 목록이 이 태스크에서 함께 개정됐다는 것(R3-G1).
  - 「서버 거부」 = 요청했으나 성공 에코에 서지 않은 항목이라는 것. 에코의 플래그는 무장 상태(cfg ∧ armed)라 「그 순간 방어가 서 있지 않다」 가 사실의 핵심이다. 구체 사유는 서버 ERROR 원문 줄이 말한다.
- 항목 정본 순서 상수를 AUTO_CHECK_FIELD 의 키 순서로 하나 둔다(skipped 정렬용).
- export function confirmAutoChecks(r, server) 를 만든다(순수 함수 · 판정 한 곳 · 입력 불변).
  - server 는 여섯 플래그 필드와 sellOrderPrice · sellWatchPrice 만 읽는 구조 타입이다(LimitChaserFormValues 에서 Pick). RelayLimitChaser 가 그대로 들어가는지 tsc 로 확인한다.
  - turnedOn 은 server[필드] === true 인 항목만 남긴다.
  - 나머지는 { item, reason: '서버 거부' } 로 skipped 에 합치고, 합친 skipped 를 항목 정본 순서로 정렬한다.
  - companions 는 server[k] 가 같은 값인 항목만 남긴다(플래그 · 두 가격 모두).
  - priceFilled 는 남은 companions 에 가격이 하나라도 있으면 원래 값, 아니면 null 이다.
  - groupAutoCheckLogLine 은 바꾸지 않는다. 라벨 · level 은 확정 결과에서 그대로 따라 나온다.
- groupAutoChecksOf 에 넷째 인자 refused 를 더한다. 타입은 ReadonlySet<keyof LimitChaserFormValues>, 기본값은 빈 집합 상수다.
  - decide 순서는 ① 이미 켜짐이면 목록 밖, ② 예측 첫 실패 사유, ③ refused 에 그 필드가 있으면 서버 거부, ④ 켬 이다.
  - decide 가 그 항목이 받은 사유를 돌려줄 수 있게 한다. 취소>잔량추적 의 「취소가 켜지지 않음」 조건 사유는 고정 문자열 '취소 매수잔량 0' 이 아니라 취소가 실제로 받은 사유를 쓴다. 기존 예측 결과는 달라지지 않는다 — 지금 취소의 예측 사유는 상한가 미수신(취소>잔량추적 이 먼저 같은 사유로 걸린다) 또는 취소 매수잔량 0 뿐이다.
  - JSDoc 에 refused 의 뜻을 적는다: 이 흐름에서 서버가 눕힌 내 동반 필드 · 호출자는 훅의 ⑬ 을 넘긴다 · R4-WR-01 선택지 (ii).

GREEN — 폼(limit-chaser-form.tsx (b) L1083):
- serverRef.current 를 지역 변수로 받는다.
- 그룹 게이트가 true 이고 auto 가 있을 때 groupAutoCheckLogLine(confirmAutoChecks(auto, 그 서버)) 로 줄을 만든다.
- 이펙트 위 주석 블록과 (b) 옆 주석을 고친다: 「마지막 계산 = 실제로 나간 cfg」 에 더해 「내용은 성공 에코로 확정 — 요청했으나 서지 않은 항목은 켜지 않음(서버 거부) · R3-G1」.
- import 에 confirmAutoChecks 를 더한다.

UI-SPEC(24-UI-SPEC.md L403 사유 닫힌 목록 · L396-406 절)을 개정한다.
- 닫힌 목록에 서버 거부 항을 더한다: 요청했으나 성공 에코(무장 상태)에 서지 않은 항목 — 부분 거부. 같은 흐름에서 대기하던 다른 그룹의 자동 체크는 그 항목을 다시 싣지 않고 같은 사유로 적는다. 2026-09-29 · quick-260929-htw · R3-G1 개정 표시를 단다.
- 「켬」 목록과 가격 조각은 성공 에코로 확정한다는 불릿을 하나 더한다.
- 부분 거부 예시 문장(error)을 하나 더한다.
- D-35 일반화 절(L728-742)은 「사유 어휘는 위 절 그대로」 라서 손대지 않는다.

회귀 확인.
- ⑲ · D-35 · GC-WR-04 · R3-WR-02 폼 케이스와 카드 흐름 24-07 · R3-WR-01 은 기대값을 바꾸지 않고 통과해야 한다.
  - 카드 흐름 R3-WR-01 은 이 태스크에서는 길이 1 만 보므로 통과한다. 정확 문장 잠금은 Task 2 에서 한다.
- 기존 테스트가 실패하면 기대값을 약화하지 않는다. 먼저 판정한다: 그 픽스처의 성공 에코가 요청 항목을 빠뜨린 것인가(그 테스트 의도가 「전부 섬」 인가)?
  - 그렇다면 에코 픽스처를 요청대로 채운다.
  - 의도가 부분 거부라면 기대 문장을 사실대로 고친다.
  - 어느 경우든 SUMMARY 「기존 테스트 조정」 에 한 줄씩 적는다.

커밋. 이 태스크의 다섯 파일만 git add 한다. 동시 세션 경합 교훈에 따라 add -A 는 금지하고 커밋 직전 git status -sb 로 남의 변경이 섞이지 않았는지 본다.
- 메시지: 한국어 한 줄(예: 「fix(quick-260929-htw): 자동 체크 줄을 성공 에코로 확정 — 서버가 눕힌 항목은 켜지 않음(서버 거부) (R3-G1)」) + 본문 요약.
- 공동 저자 트레일러는 넣지 않는다. push 하지 않는다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx && pnpm --filter @gh-radar/webapp exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function confirmAutoChecks" webapp/src/lib/limit-chaser.ts` = 1
    - `grep -n "'서버 거부'" webapp/src/lib/limit-chaser.ts` 가 AutoCheckReason 타입 줄을 포함한다
    - `grep -n "groupAutoCheckLogLine(confirmAutoChecks(" webapp/src/components/trading/limit-chaser-form.tsx` 가 1줄 이상이다
    - `grep -n "매도주문(서버 거부)" webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` 가 1줄 이상이다(F1 부분 거부 문장)
    - `grep -n "서버 거부" .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md` 가 사유 닫힌 목록 줄을 포함한다
    - RED 단계에서 새 lib 케이스와 F1 이 실패했고 GREEN 뒤 통과한 기록이 SUMMARY 에 있다
    - 트레일러 없음: `MSG=$(git log -1 --format=%B) && printf '%s\n' "$MSG" | grep -c "Co-Authored-By"` 가 0 을 출력한다(git 실패는 && 에서 멈춰 통과로 읽히지 않는다)
  </acceptance_criteria>
  <done>부분 거부 에코 뒤 선매수 자동 체크 줄이 에코에 선 항목만 「켬」 으로 적고 매도주문을 「켜지 않음(서버 거부)」 · error 로 적는다(F1 잠금). 전부 선 경우의 줄은 불변이다. lib 두 입구(confirmAutoChecks · refused)가 표로 잠겼다. UI-SPEC 닫힌 목록이 개정됐다. 대상 3파일 테스트와 tsc 가 green 이고 커밋 1개가 있다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: R4-WR-01 부수 효과 — 훅이 서버가 눕힌 동반을 같은 흐름의 동반 함수에 알리고, 대기 추가매수가 매도주문을 다시 싣지 않는다</name>
  <files>webapp/src/components/trading/lc/use-lc-field-commit.ts, webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx, webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx</files>
  <read_first>
    - webapp/src/components/trading/lc/use-lc-field-commit.ts L86-117 (헤더 ⑪ ⑫) · L305-400 (LcCompanions · Pending · booleanCompanions · companionsAt) · L580-700 (sendNow · drain · failQueue) · L726-806 (commit) · L818-900 (해소 이펙트)
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx L912-1020 (R3-WR-01 describe · prepPreBuyWithQueuedExtra · H1)
    - webapp/src/components/trading/limit-chaser-form.tsx L1000-1030 (commitGroupSwitch 켜는 방향 동반 함수)
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx L1726-1813 (R3-WR-01 통합 케이스)
  </read_first>
  <behavior>
    - 훅 — 선매수 켬(정적 동반 buyEnabled · sellEnabled true) in-flight · 추가매수 켬 대기(함수 동반)에서 거부 신호 → 에코(선매수 ON · 매도 OFF) → 답 신호 증가로 꺼낸다. 이때 동반 함수가 받은 둘째 인자에 sellEnabled 가 있다(함수 안에서 배열로 스냅숏해 단언).
    - 훅 — 위 경우 함수가 laid 에 sellEnabled 가 있으면 빈 동반을 돌려주도록 두면, 두 번째 cfg 의 sellEnabled 는 false 이고 formRef 의 sellEnabled 도 false 다(reshow 가 빠진 키를 서버 값으로 되돌림).
    - 훅 — 같은 흐름에서 에코가 매도까지 세웠으면(sellEnabled true) 꺼낼 때 받은 laid 는 비어 있다.
    - 훅 — 위 흐름이 끝나 흐름이 빈 뒤 새로 확정한 함수 동반은 빈 laid 를 받는다. 흐름이 비려면 in-flight · 대기 · 장벽이 모두 없어야 한다. 추가매수 성공 에코 뒤 답 신호 증가까지 보내야 답 대기 장벽(popAfterSeqRef)이 풀린다.
    - 폼 F1(확장) — 부분 거부 뒤 다음 답 신호에 나간 두 번째 lc.set 은 extraBuyEnabled true · sellEnabled false 다. 매도주문 스위치는 aria-checked false 다.
    - 폼 F1(확장) — 추가매수 성공 에코({ …pre, extraBuyEnabled: true } · 다음 답 신호) 뒤 autoLines 는 [[PRE_PARTIAL_LINE, 'error'], ['추가매수 자동 체크 — 켜지 않음: 매도주문(서버 거부)', 'error']] 다. 전송은 2 그대로다.
    - 카드 흐름 — 부분 거부 통합 케이스에서 autoPre() 가 정확히 [PRE_PARTIAL 문장] 이고 그 로그 행 data-level 은 error 다. lcSets()[1].cfg 는 extraBuyEnabled true · sellEnabled false 다. lcSets 길이는 2 다.
  </behavior>
  <action>
RED 먼저 — 부수 효과 재현을 실행으로 확인한다.

1. 폼 F1 을 behavior 5 · 6 대로 이어 쓴다. 기존 두 번째 rerender(serverAnswerSeq 2) 뒤 단언을 더하고, 그 뒤 추가매수 성공 에코 rerender(serverAnswerSeq 3)를 더한다.
2. 카드 흐름 R3-WR-01 케이스 L1806-1810 을 behavior 7 대로 바꾼다.
   - 부분 거부 문장 상수를 이 describe 에 둔다.
   - 정확 문장 · data-level · 두 번째 cfg 의 sellEnabled false 를 단언한다.
3. 훅 테스트에 새 describe 를 둔다: 「R3-G1 — 서버가 눕힌 동반은 같은 흐름의 대기 동반 함수에 laid 로 전달된다 (24-REVIEW-R4 R4-WR-01)」.
   - H1 의 prep 모양을 따르되 추가매수는 함수 동반(vi.fn)으로 확정한다. behavior 1~4 를 케이스로 둔다.
   - 함수는 호출마다 laid 를 배열로 스냅숏해 기록한다. 살아 있는 집합을 나중에 읽지 않는다.
   - 모든 케이스가 전송 수(t.send 호출 수)를 센다.
4. `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` 를 실행한다.
   - 폼 F1 · 카드 흐름이 「두 번째 cfg 의 sellEnabled 가 true」 로 실패해야 한다 — 이것이 부수 효과 재현 증거다. 실패 출력 요지를 SUMMARY 에 적는다.
   - **예외 처리:** 두 통합 단언이 수정 전에 이미 통과하면(재현 안 됨) 여기서 멈춘다. 다음 세 가지를 하고 그 판정 근거를 SUMMARY 「부수 효과 — 범위 밖」 에 적는다.
     - 이 태스크의 구현을 하지 않는다.
     - Task 1 의 refused 입력을 되돌리는 별도 커밋을 만든다(사용처 없는 입력 금지).
     - 새로 쓴 단언은 사실을 잠그는 회귀로 남긴다.

GREEN — 훅(use-lc-field-commit.ts):
- LcCompanions 의 함수 형태에 둘째 인자 laid: ReadonlySet<LcFieldKey> 를 더한다. 인자 하나짜리 기존 함수(D-02 마스터 끄기 등)는 그대로 호환된다.
- 모듈 함수 companionsAt 에 셋째 인자 laid 를 더해 함수 동반에 넘긴다. 호출 4곳이 모두 같은 laidRef.current 를 넘긴다: sendNow · drain no-op · failQueue · commit 의 shown. 한 곳이라도 빠지면 no-op 판정 · 낙관 표시 · 전송 조립이 서로 다른 동반을 본다(WR-04 · WR-03 의 「같은 규칙」 원칙).
- 훅 안에 laidRef(Set<LcFieldKey>)를 둔다.
- 해소 ① matches 분기에서 inf.companions 의 불리언 중 값이 true 이고 server[k] !== true 인 필드를 laidRef 에 더한다. booleanCompanions 를 재사용한다.
- commit 에서 disabled 가드 뒤 · shown 계산 **앞**에 흐름이 비었는지 본다: inflightRef · queueRef 길이 0 · popAfterSeqRef · orphanRef 가 모두 비었나. 비었으면 laidRef 를 비운다. 사람의 새 확정은 새 흐름의 시작이다.
- 헤더에 ⑬ 항을 새로 적는다(눕힌 동반): 무엇을 모으나 · 누가 읽나(동반 함수 둘째 인자) · 언제 비우나(흐름이 빈 상태의 새 확정) · 왜 훅인가(폼 (b)와 꺼내기의 실행 순서가 흐름마다 달라 폼 슬롯으로는 기억이 빈다 · in-flight 가 실은 값과 그 답 에코를 같은 실행에서 보는 곳은 훅뿐) · T-16-10(전송을 만들지 않고 싣는 동반만 줄인다).
- ⑪ 의 LcCompanions 설명에도 둘째 인자를 한 줄 적는다.

GREEN — 폼(limit-chaser-form.tsx commitGroupSwitch 동반 함수 L1009-1015):
- 동반 함수를 (base, laid) 로 받는다.
- groupAutoChecksOf(autoGate, base, upperLimitRef.current, laid) 로 넘긴다.
- 위 D-06 · WR-03 주석 블록에 한 줄 더한다: 「꺼내는 순간 계산은 이 흐름에서 서버가 눕힌 항목(훅 ⑬)을 다시 켜지 않고 서버 거부로 적는다 — R4-WR-01 (ii) · 사람의 새 클릭(흐름이 빈 뒤)은 평소대로 요청」.

전체 회귀.
- `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib` 과 `pnpm --filter @gh-radar/webapp exec tsc --noEmit` 을 돌린다. 전후 파일 · 건수를 SUMMARY 에 적는다. 시작 전 기준선은 Task 1 전에 한 번 돌려 둔다.
- 기존 테스트가 깨지면 Task 1 과 같은 판정 규칙을 따른다(기대값 약화 금지 · 픽스처 사실화 · SUMMARY 기록).

변이 확인(잠금 증명). 아래 두 변이마다 폼 F1 확장 · 카드 흐름 · 훅 새 케이스 중 무엇이 실패하는지 적는다. 끝나면 해당 파일을 git checkout 으로 되돌리고 git diff --quiet HEAD 와 green 재확인까지 한다.
- 훅 matches 분기의 laid 수집 한 줄을 주석 처리한다.
- 폼 동반 함수가 laid 를 넘기지 않게 한다.

e2e 는 돌리지 않는다(작은 수정 · 교훈). 근거로 webapp/e2e 의 자동 체크 단언이 P24-3 의 「선매수 자동 체크 — 켬: 」 포함 검사뿐이고 부분 거부 시나리오가 없음을 grep 으로 확인해 SUMMARY 에 한 줄 적는다.

커밋. 이 태스크의 다섯 파일만 git add 한다(add -A 금지 · 커밋 직전 git status -sb 재확인).
- 메시지: 한국어(예: 「fix(quick-260929-htw): 대기 자동 체크가 서버가 눕힌 동반을 다시 싣지 않는다 — 훅 ⑬ 눕힌 동반 (R4-WR-01)」).
- 공동 저자 트레일러는 넣지 않는다. push · 배포는 하지 않는다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib && pnpm --filter @gh-radar/webapp exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "laidRef" webapp/src/components/trading/lc/use-lc-field-commit.ts` 가 선언 · matches 수집 · commit 비우기 · companionsAt 전달 자리를 포함한다(4종 이상)
    - companionsAt 호출 줄이 모두 laidRef.current 를 넘긴다: `grep -n "companionsAt(" webapp/src/components/trading/lc/use-lc-field-commit.ts | grep -v "function companionsAt" | grep -vE "^[0-9]+:\s*(\*|//)" | grep -vc "laidRef.current"` = 0 이고, 같은 파이프에서 마지막 필터를 뺀 호출 줄 수는 4 이상이다
    - `grep -n "groupAutoChecksOf(autoGate, base, upperLimitRef.current, laid)" webapp/src/components/trading/limit-chaser-form.tsx` 가 1줄이다
    - `grep -n "추가매수 자동 체크 — 켜지 않음: 매도주문(서버 거부)" webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` 가 1줄 이상이다
    - `grep -n "R3-G1" webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` 가 1줄 이상이다
    - RED(두 번째 cfg sellEnabled true 로 실패) → GREEN 기록과 변이 확인 결과가 SUMMARY 에 있다
    - 트레일러 없음: `MSG=$(git log -2 --format=%B) && printf '%s\n' "$MSG" | grep -c "Co-Authored-By"` 가 0 을 출력한다
    - push 없음: `AHEAD=$(git log @{u}..HEAD --oneline) && printf '%s\n' "$AHEAD" | grep -c "quick-260929-htw"` 가 2 이상이다(두 태스크 커밋이 원격에 올라가지 않은 채 남아 있다)
  </acceptance_criteria>
  <done>부분 거부 흐름에서 대기 추가매수가 매도주문을 다시 싣지 않는다(두 번째 cfg sellEnabled false · 스위치 OFF). 추가매수 줄은 「켜지 않음: 매도주문(서버 거부)」 · error 로 사실대로 선다. 흐름이 빈 뒤 새 클릭은 평소대로 요청한다. 훅 · 폼 · 카드 흐름 세 층이 잠겼다. trading · lib 전체 테스트와 tsc 가 green 이고 커밋이 1개 더 있다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay WS → 브라우저 | 60 에코(무장 상태)와 ERROR 가 신뢰 경계를 넘는다. 자동 체크 줄과 눕힌 동반 기억은 성공 에코 값으로만 판정한다. 폼의 예측으로 사실을 대신하지 않는다 |
| 브라우저 훅 → relay lc.set | 사람 확정 1회 = 전송 1회(T-16-10). 이번 변경은 싣는 동반을 줄일 뿐이고 전송을 만들지 않는다 |

## STRIDE Threat Register (ASVS L1 · block_on high)

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-htw-01 | Repudiation | limit-chaser-form.tsx (b) 자동 체크 줄 | high | mitigate | 줄은 confirmAutoChecks(auto, serverRef.current) 로 에코에 선 항목만 「켬」 이다. 서지 않은 항목은 「켜지 않음(서버 거부)」 · error 다. F1 · 카드 흐름이 정확 문장과 level 을 잠그고, lib 표가 순서 · 가격 조각 · 불변성을 잠근다 |
| T-htw-02 | Elevation of Privilege | 훅 대기 꺼내기 · 동반 함수 | high | mitigate | laid 는 동반 계산의 입력일 뿐이다. 전송 경로(sendNow · drain · commit)는 무변경이다. 새 테스트 전부가 전송 수를 센다(폼 F1 = 2 · 카드 흐름 lcSets 2 · 훅 케이스별 send 호출 수) |
| T-htw-03 | Tampering | laidRef 수명 | medium | mitigate | 흐름이 빈 상태의 새 확정에서만 비우는 한 자리다. 훅 케이스 「흐름이 빈 뒤 새 확정 = 빈 laid」 가 잠근다. 기억이 사람의 새 클릭을 조용히 막지 않는다 |
| T-htw-04 | Tampering | 동반 계산 일관성 | medium | mitigate | companionsAt 호출 4곳(sendNow · drain no-op · failQueue · commit shown)이 같은 laidRef.current 를 넘긴다(acceptance grep). 낙관 표시 · no-op · 전송 조립이 같은 동반을 본다 |
| T-htw-05 | Denial of Service | 거부된 무장의 반복 재요청 | low | mitigate | 같은 흐름 안에서는 서버가 눕힌 항목을 다시 싣지 않는다. 사람 클릭마다 1회라 폭주 경로가 없다 |
| T-htw-06 | Information Disclosure | 로그 · 새 신호 | low | accept | 새 데이터 · 외부 호출 · 저장이 없다. 로그 어휘는 UI-SPEC 닫힌 목록 개정분(서버 거부)뿐이다 |
</threat_model>

<verification>
- Task 1: `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` green · tsc green.
- Task 2: `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib` green · `pnpm --filter @gh-radar/webapp exec tsc --noEmit` green.
- 기존 자동 체크 줄 테스트는 기대값 수정 없이 통과한다: 폼 ⑲ · D-35 · GC-WR-04 · R3-WR-02, 카드 24-07. 수정이 있었다면 SUMMARY 에 사실 판정 근거가 있다.
- RED → GREEN 기록(Task 1: 새 lib 케이스 · F1 / Task 2: 두 번째 cfg sellEnabled true 재현)과 변이 확인 결과가 SUMMARY 에 있다.
- 커밋 2개(한국어 · 공동 저자 트레일러 없음). push · 배포 없음.
</verification>

<success_criteria>
- R3-G1 truth 「자동 체크 로그가 실제로 서버에 선 값만 「켬」 으로 적고, 서버가 거부한 항목을 켠 것으로 잘못 기록하지 않는다」 가 코드와 테스트로 선다.
- 24-VERIFICATION-R3 missing 3항이 모두 해소된다: ① confirmAutoChecks 판정 단일화 · ② F1 · 카드 흐름 기대값 교정 · ③ 부수 효과 결정 — (ii) 채택, 훅 ⑬ 흐름 수명 기억.
- 트레이딩 · lib 테스트 전체와 tsc 가 green 이다.
</success_criteria>

<output>
Create `.planning/quick/260929-htw-24-r3-g1/260929-htw-SUMMARY.md` when done. 담을 내용:
- 설계 선택: 사후 확정 + 사전 제외 · 기억을 훅에 둔 이유(실행 순서) · 선택지 (i) 기각 근거
- RED 출력 요지(F1 문장 불일치 · 두 번째 cfg sellEnabled true)
- 변이 확인 결과
- 기존 테스트 조정(없으면 「없음」)
- 테스트 수 전후
- e2e 미실행 근거 한 줄
- 잔여 한계(이미 켜져 있던 항목을 서버가 눕힌 경우는 자동 체크 줄 밖 — 서버 ERROR 원문 줄이 말함)
</output>
