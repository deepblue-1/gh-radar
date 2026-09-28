---
phase: 24-limitchaser-buy3
round: 3
scope: gap-closure round 2 — 24-18 ~ 24-24 (diff 3e2c9009..HEAD)
reviewed: 2026-09-28T15:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - packages/shared/src/relay.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/strategy-log.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 24: 갭 클로징 코드 리뷰 보고서 (3라운드 · 24-18 ~ 24-24)

**Reviewed:** 2026-09-28T15:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found
**이전 라운드 기록:** `24-REVIEW.md`(WR-/IN-)와 `24-REVIEW-R2.md`(GC-)는 수정하지 않았다. 이 라운드의 ID 는 `R3-` 네임스페이스다.

## Narrative Findings (AI reviewer)

## 요약

`git diff 3e2c9009..HEAD` 의 13개 파일을 읽었다. 필요한 곳은 주변 코드와 `webapp/src/lib/limit-chaser.ts`(`formFromServer` · `groupAutoChecksOf` · `isLimitChaserSetRejection`), gh-trade `server/src/net/Gateway.cpp`(`ProcessSetLimitChaser` 의 부분 거부 · 전면 거부 갈래)까지 따라갔다. 해당 단위 테스트 6개 파일(506건)은 직접 다시 돌려 모두 통과했다.

아래 두 Warning 은 코드 경로를 추적해 얻었다. 그다음 저장소 밖 스크래치 테스트(`renderHook(useLcFieldCommit)` · 저장소 파일 무변경)로 **재현까지 확인했다**.
- R3-WR-02: 성공 신호가 `lastSuccessField: 'sellEnabled', lastSuccessSent: false` 로 덮인다.
- R3-WR-01: 답 신호만 먼저 오면 in-flight 선매수와 대기 추가매수가 모두 `rejected` 가 되고, 에코 뒤에도 전송은 1건 그대로다.

**잘 닫힌 것.**
- **GC-WR-02:** `revertToggle` 한 자리가 서버 동기값(`baseNow()`)을 기준으로 삼는다. `failQueue` 는 주 필드가 성공하고 동반만 실패한 경우를 분리한다.
- **GC-WR-03:** 누른 순간(`formRef`)과 판정 시점(`base`)의 두 단계 판정이 들어갔다. 즉시 경로의 결과는 이전과 같다.
- **GC-IN-01:** `isServerFoldEdge` 가 구서버 에코를 거른다.
- **GC-IN-02:** 문구가 들어갔다.
- **GC-IN-05:** 주석이 고쳐졌다.
- **D-36 · D-37 · D-38:** 판정 함수 · 문구 원천이 하나로 모였다. 웹에서 「상한가 이탈」 · 「= 발동잔량」 잔재는 0건이다.

**덜 닫힌 것.**
- **GC-WR-01:** 「부분 거부 = ERROR 뒤 같은 제출의 에코」라는 전제를 **카드에만** 반영했다. 같은 ERROR 가 올리는 답 신호를 훅은 여전히 「주 필드 거부」로 읽는다. 그래서 in-flight 가 실패로 접히고, 대기열 확정이 보내지지 않은 채 버려지며, 자동 체크 줄이 사라진다 → R3-WR-01.
- **GC-WR-04:** 대기 슬롯은 그룹별로 바뀌었다. 그러나 그 슬롯을 소비하는 **성공 신호**(`lastSuccessField` · `lastSuccessSent`)가 여전히 한 칸이다. 한 이펙트 실행 안에서 성공이 둘 나면 뒤엣것이 앞엣것을 덮는다 → R3-WR-02.
- **GC-IN-04:** P24-3 은 고정 대기를 없애면서 부재(0건) 관찰 창까지 함께 없앴다 → R3-IN-02.

## Round-2 항목 클로징 표

| Round-2 | 판정 | 근거 |
|---|---|---|
| GC-WR-01 부분 거부 · 다른 탭 거부 귀속 | **partially** | 카드: 거부 분기가 `acceptAnswer()` 만 한다(`strategy-card.tsx:653`). 귀속 · 소비 · 배너는 `mine = echoAnswersSent(…)`(`:518`, `:566`) 한 판정을 읽는다. 카드 흐름 6케이스와 lib 표 10케이스가 있다. 그러나 같은 `acceptAnswer` 가 올린 `answerSeq` 를 훅이 in-flight 거부로 읽는다(`use-lc-field-commit.ts:808-809`) → R3-WR-01. |
| GC-WR-02 대기 접기 되돌림 = 누른 순간 값 | **closed** | `revertToggle`(`:510-520`)이 서버가 있으면 `baseNow()` 로 되돌린다. `reshow` 의 빠지는 키도 같은 기준이다. `failQueue` 는 주 필드가 서버 값이면 성공, 동반은 서버 값으로 처리한다(`:650-651`). 폼 · 훅 회귀가 있다. |
| GC-WR-03 D-02 전반 낡은 동반 | **closed** | `pressedLast`(`limit-chaser-form.tsx:1035`)가 참일 때만 함수 동반을 넘긴다. 함수는 `base` 로 다시 판정한다. 네 케이스(다른 단말 후매수 켬 · 꺼낼 때도 마지막 · 누른 순간 마지막 아님 · 낙관 표시 복귀)가 잠겨 있다. |
| GC-WR-04 자동 체크 로그 한 칸 | **partially** | 대기 · 결과는 `Partial<Record<AutoCheckGate, …>>` 로 바뀌었다(`:938`, `:945`). 소비 신호는 한 칸이라 한 렌더 안의 성공 둘이 겹치면 줄이 사라진다 → R3-WR-02. |
| GC-IN-01 구서버 전환 에코 | **closed** | `isServerFoldEdge` 가 prev · next 중 어느 쪽이든 `isLegacyBuySchema` 면 false 를 낸다(`:395-396`). 폼 · 함수 케이스가 있다. |
| GC-IN-02 모든 인스턴스 숨음 N건 | **closed** | 잔여 한계 문구가 넓어졌다(`:1102-1107`). 지터는 이월이다(24-24 사용자 확인). |
| GC-IN-03 no-op 성공에 자동 체크 줄 | **closed** | `lastSuccessSent` 는 ① in-flight 답에서만 true 다(`use-lc-field-commit.ts:799`). 폼은 false 면 줄을 쓰지 않는다(`:1070`). 단, 같은 신호가 덮이는 문제는 R3-WR-02 다. |
| GC-IN-04 e2e 고정 대기 | **partially** | P24-4 · P24-6 는 사건 기반 대기와 `FOLD_QUIET_MS` 로 바뀌었다. P24-3 은 부재 창까지 함께 사라졌다 → R3-IN-02. |
| GC-IN-05 「게이트 4종 밖」 | **closed** | `use-lc-field-commit.ts:743` 가 「`LC_GATE_FIELDS` 밖」으로 바뀌었다. |
| D-36 추가매수 상한가 차단(매수1잔량 항) | **closed** | 판정은 `lcExtraBuyUpperLimitBlockOf`, 문구는 `lcExtraBuyAtUpperLimitText` 한 곳이다. `card-body.tsx:282` 배관(`bq[0]`)이 들어갔다. 두꺼운 벽 · 얇은 벽 · 잔량 모름 · 호가 모름을 단위 · e2e(P24-5 · P24-13)가 모두 덮는다. |
| D-37 추가매수 포기 = 최대 초과 1종 | **closed**(웹 범위) | shared 주석 · 테스트 기대값이 바뀌었다. relay `.fbs` 사본 · envelope 의 옛 표현은 gh-trade 스키마 동기화 몫으로 이월됐다(24-24 승인). |
| D-38 override = 발동잔량 × 80% · 사람 값 유지 | **closed** | JSDoc(`strategy-log.tsx:282-287`) · 픽스처 264,000 · e2e P24-6 의 재진입 · 두 번째 발동(사람 값 유지)이 바뀌었다. 판정 코드는 바뀌지 않았다. |

## Warnings

### R3-WR-01: 부분 거부의 ERROR 가 먼저 올린 답 신호를 훅이 「주 필드 거부」로 읽는다 — in-flight 가 실패로 접히고 대기 확정이 버려지며, 자동 체크 줄이 사라진다 (GC-WR-01 이 카드에서만 닫혔다)

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:804-810, 662-668, 832-837` (원인 신호: `webapp/src/components/trading/card/strategy-card.tsx:653` · 근거: gh-trade `server/src/net/Gateway.cpp` `ProcessSetLimitChaser` 의 「그 항만 눕히고 ERROR」 갈래 → 저장 → 에코)

**Issue:** 24-18 은 거부 통지가 귀속의 끝이 아니라는 전제를 카드의 `pendingRef` 에 반영했다. 부분 거부는 ERROR 를 **먼저** 보내고, 뒤이어 같은 제출의 에코가 오기 때문이다. 그런데 거부 분기는 여전히 `acceptAnswer()` → `answerSeq + 1` 을 한다. 이 값은 `serverAnswerSeq` 로 훅에 들어간다. 훅 ① 판정은 다음과 같다.

```ts
const answered = seq !== inf.answerSeqAtSend;
const matches = server != null && server[inf.field] === inf.value;
if (matches) … else if (unacked) … else if (answered) failInflight(inf, 'rejected');
```

ERROR 와 에코는 별개의 WS 프레임이라 서로 다른 렌더에서 처리될 수 있다. 그 경우 ERROR 렌더에서는 서버 값이 아직 그대로라 `matches === false` 다. 그 결과 다음 일이 차례로 일어난다.
1. `failInflight(inf, 'rejected')` → 스위치가 서버 값(OFF)으로 되돌아가고, 「반영하지 못했어요」 말풍선이 붙는다.
2. `failQueue('rejected')` 가 **대기열 전체를 보내지 않고 실패로 둔다.** D-35 의 일상 조작(선매수 켜고 바로 추가매수 켜기)에서 추가매수 켬이 사라진다.
3. 에코가 오면 ③ 늦은 에코가 선매수를 성공으로 거둔다. 하지만 `markSuccess(f)` 는 `sent=false` 라 GC-IN-03 규칙상 자동 체크 줄이 없다. 게다가 실패 순간 폼 이펙트(`limit-chaser-form.tsx:1057-1061`)가 그 그룹 슬롯을 이미 지웠다.
4. 버려진 추가매수는 보내지 않았으므로 늦은 에코로도 거둬지지 않는다. 사람이 다시 눌러야 한다.

스크래치 재현 결과는 다음과 같다. 선매수 켬(sent)과 추가매수 켬(queued)이 있을 때 답 신호가 먼저 1 증가하면 실패는 `[preBuyEnabled, extraBuyEnabled]` 다. 그 뒤 선매수 ON 에코가 오면 실패는 `{extraBuyEnabled: 'rejected'}` 만 남고, 전송은 1건, `lastSuccessSent: false` 다.

부분 거부가 가장 자주 나는 조합이 바로 자동 체크(D-06 · D-35)다. 매도 · 취소 6체크를 함께 켜면, 서버가 매도 · 취소 검증으로 그 항만 눕힌다. 즉 「6체크 무장의 유일한 흔적」인 줄이 정확히 필요한 경우에 사라진다. 24-24 에서 사용자가 수용한 「거부로 실패한 켜기엔 자동 체크 줄 없음」은 **주 필드가 서지 않은** 경우다. 이 경우는 주 필드가 섰다.

`use-lc-field-commit.test.tsx` 의 「거부(답만 증가 · 에코 OFF)」 케이스는 이 동작을 의도로 잠그고 있다. 「답만 증가 → 곧 같은 제출 에코(주 필드 ON)」 케이스는 어디에도 없다. `strategy-card-flow` 의 GC-WR-01 케이스는 카드 훅만 돌리므로 폼 · 훅 쪽 결과를 보지 않는다.

**Fix:** 거부 통지로 올라간 답 신호는 「결과 확정」이 아니라 「곧 에코가 올 수 있음」으로 다룬다. 카드가 거부 신호를 따로 내고, 훅은 짧은 유예 안에 서버 변화가 오면 그것으로 판정한다. 전면 거부(거래소 화이트리스트 밖 · NXT 미거래 · 계좌 가드)는 에코가 없으므로 유예가 끝나면 종전대로 실패다.
```ts
// strategy-card.tsx — 거부는 답이지만 「결과」는 아직 모른다
if (isLimitChaserSetRejection(msg, isin, accountNo)) { acceptAnswer(); setRejectSeq((n) => n + 1); }

// use-lc-field-commit.ts ① — 거부 신호만으로 답이 온 렌더는 유예한다
} else if (answered && rejectOnly && !serverChanged) {
  graceRef.current ??= window.setTimeout(() => { graceRef.current = null; forceJudge(); }, LC_REJECT_ECHO_GRACE_MS);
} else if (answered) {
  failInflight(inf, 'rejected');
}
// 유예 중 서버 변화 → matches 면 markSuccess(inf.field, true) · 대기열은 종전대로 꺼낸다
```
회귀 테스트는 두 가지를 추가한다.
- 훅: 「답 신호 +1 → 같은 제출 에코(주 필드 ON · 동반 일부 OFF) → 주 필드 성공(`lastSuccessSent: true`) · 대기 건 전송 · 실패 0」
- 폼: 「선매수 켬 · 추가매수 대기 → 부분 거부 ERROR → 에코 → 선매수 자동 체크 한 줄 · 추가매수 전송」

### R3-WR-02: 성공 신호가 한 칸이라, 한 판정 실행 안에서 성공이 둘이면(① in-flight + ③ 늦은 에코) 앞 성공이 사라진다 — 그룹별 자동 체크 슬롯(GC-WR-04)이 소비되지 않는다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:458-478, 799, 832-837` · `webapp/src/components/trading/limit-chaser-form.tsx:1055-1076`

**Issue:** `markSuccess` 는 `setSuccess((s) => ({ seq: s.seq + 1, field, sent }))` 하나에 쓴다. 해소 이펙트는 한 실행 안에서 이 호출을 여러 번 할 수 있다. 먼저 ① `markSuccess(inf.field, true)` 를 부르고, 같은 실행의 ③ 늦은 에코 루프가 `markSuccess(f)` 를 부른다. React 가 둘을 한 렌더로 합치므로 폼은 **마지막 것만** 본다. 폼의 자동 체크 이펙트는 `lastSuccessField` 가 선매수 · 추가매수일 때만 슬롯을 소비한다. 결국 슬롯은 남고 줄은 쓰이지 않는다.

재현 순서(자동 체크가 겨냥하는 바로 그 흐름)는 이렇다.
1. 매도 가격이 0 인 채 「매도주문」을 켠다.
2. 서버가 「매도 설정이 불완전합니다(주문가/감시가 0 …)」로 거부한다. 실패는 `{sellEnabled, rejected, true}` 로 남는다.
3. 선매수를 켠다. 자동 체크가 매도 가격을 상한가로 채우고 `sellEnabled: true` 를 동반으로 싣는다.
4. 성공 에코가 온다. ① 선매수 성공(`sent: true`) 직후 ③ 이 `sellEnabled` 실패를 늦은 에코로 거둔다(`markSuccess('sellEnabled')`). 그 결과 `lastSuccessField: 'sellEnabled'` · `lastSuccessSent: false` 가 된다.
5. 「선매수 자동 체크 — 켬: …」 줄이 쓰이지 않는다.

스크래치 재현 결과가 정확히 `{"field":"sellEnabled","sent":false}` 다. 폼 측 슬롯을 그룹별로 바꿔도 소비 신호가 한 칸이라 GC-WR-04 와 같은 결과(6체크 무장의 유일한 흔적 소실 · 무로그)가 다른 경로로 남는다. `timeout` 실패도 같은 경로를 탄다(③ 은 `rejected` · `timeout` 둘 다 거둔다).

**Fix:** 「보낸 프레임의 답」 신호를 일반 성공 신호와 분리한다. ① 은 한 실행에 최대 한 번(in-flight 1건)이므로 덮일 수 없다.
```ts
// use-lc-field-commit.ts
const [sentSuccess, setSentSuccess] = useState<{ seq: number; field: LcFieldKey | null }>({ seq: 0, field: null });
// ① 에서만
markSuccess(inf.field);
setSentSuccess((s) => ({ seq: s.seq + 1, field: inf.field }));
// 반환: sentSuccessSeq · lastSentSuccessField (lastSuccessSent 는 제거)

// limit-chaser-form.tsx — 자동 체크 줄은 sentSuccess 로만 소비, no-op · 대기 접기 성공은
//   (successSeq 변화 ∧ lastSuccessField === gate ∧ lastSentSuccessField !== gate) 일 때 슬롯만 비운다.
```
회귀 테스트는 두 가지를 추가한다.
- 훅: 「거부된 `sellEnabled` 실패 → 선매수 켬(`sellEnabled` 동반) 성공 에코 → 보낸 성공 신호 필드 = `preBuyEnabled`」
- 폼: 같은 흐름에서 「선매수 자동 체크」 한 줄

## Info

### R3-IN-01: `echoAnswersSent` 의 「요청한 변화」에 웹이 다시 계산하는 수량 3벌과 클라 고정 3필드가 섞인다 — 사람이 요청하지 않은 필드로 귀속이 갈린다

**File:** `webapp/src/components/trading/strategy-log.tsx:336-373` (조립: `webapp/src/components/trading/limit-chaser-form.tsx:652-672`)

**Issue:** `sent` 는 `buildCfg` 가 조립한 전체 cfg 다. 그 안에서 `buyOrderQty` · `extraBuyOrderQty` · `postBuyOrderQty` 는 금액 ÷ 가격으로 **다시 계산**된다. `sweepRecalcEnabled` · `sweepMinCount` · `sweepMinRate` 는 **클라 고정**값이다. 직전 에코가 WinForms 등 다른 클라가 둔 값이면(이 파일 가드 ⑤ 가 「다를 수 있다」고 명시한 바로 그 경우) 이 6필드가 매 제출의 「요청한 변화」가 된다. 그 결과 두 가지가 생긴다.
- **다른 웹 인스턴스(데스크톱 탭 · 앱)의 에코**도 같은 재계산 값을 싣는다. 그래서 내 요청 변화가 하나도 없는데 `mine = true` 가 된다. 사유 · 동반 문장이 남의 에코에 붙고, 뒤이어 온 내 진짜 에코는 `sent === null` 로 「다른 단말」 배너를 세울 수 있다.
- 사람이 요청한 유일한 항(예: 매도주문 켬)이 부분 거부로 눕혀져도 재계산 수량이 섰다는 이유로 「내 답」이 된다. 이때 ERROR 원문 옆에 「서버 반영 완료」가 함께 설 수 있다.

GC-WR-01 의 판정 정의(「요청한 변화 중 하나라도 섰는가」)가 사람의 의도가 아니라 조립 부산물에 기대는 셈이다.

**Fix:** 판정에서 파생 · 고정 6필드를 뺀다. 금액이 바뀌면 금액 자체가 요청 변화로 잡히므로 손실이 없다.
```ts
const ECHO_ANSWER_SKIP = new Set<keyof RelayLimitChaserInput>([
  'isin', 'accountNo', 'exchange', 'crud',
  'buyOrderQty', 'extraBuyOrderQty', 'postBuyOrderQty',          // 금액→수량 재계산 — 요청이 아니다
  'sweepRecalcEnabled', 'sweepMinCount', 'sweepMinRate',           // 클라 고정 — 요청이 아니다
]);
```
lib 표에 「prev 수량 ≠ 웹 재계산 · 요청 항 눕혀짐 → 답 아님」 행을 추가한다.

### R3-IN-02: P24-3 「사람 한 번 = 10 한 건」이 부재 관찰 창 없이 로그 줄 직후에 잰다 — 에코가 유발하는 추가 제출은 잡지 못한다

**File:** `webapp/e2e/specs/trading-workbench.spec.ts:2566-2571`

**Issue:** 24-23 은 `waitForTimeout(500)` 을 걷고, 개수 단언을 두 로그 줄이 선 뒤로 옮겼다. 주석의 근거(「클릭이 둘째 10 을 보냈다면 같은 소켓 · 송신 순서라 먼저 도착해 있다」)는 **클릭이 유발한** 중복에만 맞다. 이 단언이 지켜야 할 회귀의 주류는 **에코가 유발하는** 제출이다. 예를 들면 대기열 꺼내기, D-02 후반 자동 끔, 성공 뒤 재전송 같은 것들이다. 이런 제출은 에코 처리 뒤 한 렌더 늦게 나가므로 로그 줄이 선 시점에는 아직 게이트웨이에 닿지 않았을 수 있다. 그러면 단언이 통과해 버린다. GC-IN-04 가 요구한 「0건 단언은 유예보다 넉넉한 창」 원칙이 여기에만 적용되지 않았다.
**Fix:** 같은 파일의 `FOLD_QUIET_MS` 를 재사용해 로그 줄 뒤에 관찰 창을 두고 잰다.
```ts
await expect(rows.nth(1)).toContainText('선매수 체크 — 매수주문도 켬');
await page.waitForTimeout(FOLD_QUIET_MS);
expect(lcSetCount(relay), '사람 한 번 = 10 한 건 · 에코 유발 추가 제출 0').toBe(before + 1);
```
`:3469`(P24-12) · `:3519`(P24-13)의 같은 모양 단언도 함께 점검한다.

### R3-IN-03: e2e 4c 에 디버그 출력과 원소 하나짜리 루프가 남았다

**File:** `webapp/e2e/specs/trading-workbench.spec.ts:732, 747`
**Issue:** `console.log(\`[q5e] 폴드 1단 카드 lc = …\`)` 는 바로 아래 `test.info().annotations.push` 와 같은 정보를 CI 로그에 한 번 더 찍는 디버그 잔재다. `for (const w of [LC_COMPACT_MIN])` 는 원소가 하나뿐이라 루프일 이유가 없다. 경계 잠금이라면 `LC_COMPACT_MIN - 1`(phone) 쪽을 함께 넣어야 이름값을 한다. 이 부분은 이번 갭 클로징 플랜이 아니라 quick-260928-q5e 의 변경이다. 그래도 diff 범위 안이라 기록한다.
**Fix:** `console.log` 를 지우고 annotation 만 남긴다. 루프는 `[LC_COMPACT_MIN - 1, LC_COMPACT_MIN]` 로 넓혀 phone/compact 두 쪽을 잠그거나, 단일 단언으로 푼다.

---

_Reviewed: 2026-09-28T15:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
