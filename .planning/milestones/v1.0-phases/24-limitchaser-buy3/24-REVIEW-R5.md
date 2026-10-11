---
phase: 24-limitchaser-buy3
round: 5
scope: gap-closure round 5 — quick-260929-htw 코드 커밋 0061d51f · 307cc4dd (diff b6a9f486..307cc4dd, 소스만)
reviewed: 2026-09-29T04:45:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 24: 갭 클로징 코드 리뷰 보고서 (5라운드 · quick-260929-htw)

**Reviewed:** 2026-09-29T04:45:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

리뷰 범위는 `0061d51f`(lib `confirmAutoChecks` · 사유 「서버 거부」 · `groupAutoChecksOf` refused · 폼 (b) 배선)와 `307cc4dd`(훅 ⑬ `laidRef` · `companionsAt` 4곳 laid 전달 · 폼 동반 함수 laid 배선)다. 주변 코드로 훅 해소 이펙트 전체, 폼 자동 체크 이펙트 (a)(b)(c), `dropMasterAfterServerFold`, `packages/shared/src/relay.ts` 에코 필드 계약, `strategy-log.tsx` 무장 전이도 읽었다. 대상 4개 테스트 파일은 479건 모두 green 이다(로컬 실행 확인).

**R3-G1 / R4-WR-01 클로징 판정: closed(정의된 시나리오 기준).**
- 로그 줄 쪽: 폼 (b) `limit-chaser-form.tsx:1090-1092` 가 `groupAutoCheckLogLine(confirmAutoChecks(auto, echoNow))` 로 바뀌었다. 부분 거부 에코(`sellEnabled false`)에서 「켬」 에는 에코에 선 항목만 남고, 매도주문은 `서버 거부` · error 로 옮겨진다. 폼 F1 과 카드 흐름이 정확한 문장과 level 을 잠갔다.
- 부수 효과 쪽: 훅 `use-lc-field-commit.ts:873-876` 이 해소 ① 에서 눕힌 동반을 모은다. 꺼내는 순간의 `sendNow` 가 `laidRef.current` 를 동반 함수에 넘기고, 두 번째 cfg 의 `sellEnabled` 는 false 다(폼 F1 · 카드 흐름 · 훅 테스트).
- 전부 섰을 때 줄 동일성: `groupAutoChecksOf` 의 skipped 는 이미 정본 순서로 쌓이므로, `confirmAutoChecks` 의 정렬은 항등이다. companions 필터도 전부 선 경우 항등이다. lib 첫 케이스 `toEqual(auto)` 가 이를 잠갔다. 회귀 없음.
- 가격 조각: 선 칸만 남기고, 둘 다 안 서면 `priceFilled null` 이다. `groupAutoCheckLogLine` 의 라벨 분기와 모순이 없다.

**새로 생긴 결함은 두 갈래다.**
1. 새로 들어온 「흐름이 비었나」 술어(`:771-778`)는 한쪽만 잠겨 있다. 「흐름이 빈 뒤에는 비운다」 는 테스트가 있지만, 「흐름 안에서는 비우지 않는다」 는 어떤 테스트도 잠그지 않는다. 그래서 술어를 무조건 참으로 바꾸는 변이도 전 테스트를 통과한다(R5-WR-01).
2. 이전 리뷰(R4)가 제안한 스니펫을 의심해 본 결과가 있다. 「에코에 서지 않음 = 서버 거부」 라는 등식은 relay 계약의 무장 접힘(발주 소진)과 충돌한다. 이 등식이 로그 문구와 `laid` 수집 양쪽에 그대로 들어갔다(R5-WR-02).

## Warnings

### R5-WR-01: ⑬ 「흐름이 비었나」 술어가 한쪽만 잠겼다 — 흐름 안 확정에서 `laid` 를 지우는 변이를 어떤 테스트도 잡지 못한다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:771-778` · 잠금 공백: `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx:1027-1117` · `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:3178-3238` · `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx:1758-1822`

**Issue:** 새 술어는 조건 네 개의 논리곱이다.

```ts
if (
  inflightRef.current === null &&
  queueRef.current.length === 0 &&
  popAfterSeqRef.current === null &&
  orphanRef.current === null
) {
  laidRef.current.clear();
}
```

R3-G1 관련 테스트에서 `commit` 이 불리는 자리는 두 곳뿐이다.
- (a) 눕힌 동반이 모이기 **전**: 훅 `prep()` · 폼 `startAndReject` · 카드의 두 클릭. 이때 `laid` 는 원래 비어 있어서 지워도 관측 차이가 없다.
- (b) 흐름이 완전히 빈 **뒤**: 훅 「흐름이 빈 뒤」 케이스.

「부분 거부 에코로 `laid` 가 모인 뒤 · 흐름이 아직 비지 않은 상태에서 사람이 확정한다」 는 경로는 한 케이스도 없다. 따라서 다음 변이는 모두 전 테스트를 통과한다.
- 술어 전체를 `true` 로 바꾸기(모든 확정에서 비움)
- `popAfterSeqRef.current === null` 항 삭제
- `orphanRef.current === null` 항 삭제

SUMMARY 의 변이 확인은 M1(수집 줄 주석)과 M2(폼이 laid 를 넘기지 않음) 둘뿐이다. 새 술어 자체는 변이 대상이 아니었다.

실제 결과는 이렇다. 선매수 켬 성공 에코가 매도를 눕힌 직후, 답 신호 증가 전(`popAfterSeqRef` 장벽 안)에 사람이 추가매수를 켜는 경우를 보자. 이 확정은 `busy` 라 대기로 선다. 이때 술어가 과잉으로 참이면 `laid` 가 지워진다. 그러면 꺼낼 때 매도주문을 다시 싣게 되어, R4-WR-01 이 그대로 재발한다. 계획(T-htw-03)은 「흐름이 빈 상태의 새 확정에서만 비우는 한 자리」 를 mitigation 으로 적었다. 하지만 그 경계의 안쪽은 검증되지 않았다.

**Fix:** 훅 R3-G1 describe 에 장벽 안 확정 케이스를 더하고, 결과 모름 장벽 케이스도 하나 더 둔다.

```ts
it('장벽 안(성공 에코 뒤 · 답 신호 증가 전)의 새 확정은 laid 를 지우지 않는다 — 꺼낼 때 laid 에 sellEnabled', () => {
  const t = setup({ server: echo({ buyEnabled: false }) });
  act(() => {
    t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true, sellEnabled: true });
  });
  // 부분 거부 에코 — serverChanged 라 popAfterSeqRef 가 선다(대기열은 비어 있다).
  t.update({ server: echo({ buyEnabled: true, preBuyEnabled: true, sellEnabled: false }) });
  const c = recordingCompanion();
  act(() => {
    expect(t.hook.result.current.commit('extraBuyEnabled', true, 'toggle', c.fn)).toBe('queued');
  });
  t.update({ serverAnswerSeq: 1 });
  expect(t.send).toHaveBeenCalledTimes(2);
  expect(c.seen[c.seen.length - 1]).toEqual(['sellEnabled']);
  expect(t.cfgs()[1]!.sellEnabled).toBe(false);
});
```

같은 모양으로 `unacked` 에서 결과 모름 장벽(`orphanRef`)이 선 동안 다른 필드를 확정하는 케이스도 하나 둔다. 그리고 SUMMARY 의 변이 표에 「술어 → true」 행을 더한다.

### R5-WR-02: 「에코에 서지 않음 = 서버 거부」 등식이 relay 무장 접힘 계약과 충돌한다 — 문구와 `laid` 수집이 모두 거부 신호를 보지 않는다

**File:** `webapp/src/lib/limit-chaser.ts:455-467`(`confirmAutoChecks`) · `webapp/src/components/trading/lc/use-lc-field-commit.ts:873-876`(수집) · 근거: `packages/shared/src/relay.ts:125-133` · `:188` · `:225-230`

**Issue:** `confirmAutoChecks` 는 `server[field] !== true` 인 요청 항목을 모두 `서버 거부` 로 옮긴다. 훅 ⑬ 도 같은 조건(`v === true && server[k] !== true`)으로 `laid` 를 모은다. 그런데 `sellEnabled` · `cancelQtyEnabled` · `cancelTradeEnabled` 에코는 설정값이 아니라 **무장 상태로 접힌 값**(`cfg && sellArmed` / `&& cancelArmed`)이다. relay 계약 주석은 이 점을 명시적으로 경고한다.

> 발주가 나가 게이트가 소진되면 `false` 로 온다. "내가 켰는데 서버가 껐다"가 아니라 **"발주가 나갔다"**는 뜻이므로 UI 배지는 이 둘을 다른 문구로 구분해야 한다 (Pitfall 10).

현재 판정은 거부 신호(`serverRejectSeq` 변화 · ERROR 원문)를 전혀 보지 않는다. 그래서 다음 경우를 구분하지 못한다.
- 서버 §9 부분 거부(ERROR 동반)
- 무장 직후 같은 에코 안에서 게이트가 소진된 경우(ERROR 없음)

두 경우 모두 「켜지 않음: 매도주문(서버 거부)」 · error 가 된다. 두 번째 경우에는 JSDoc 과 UI-SPEC 이 말하는 「구체 사유는 서버 ERROR 원문 줄이 말한다」 가 거짓이 된다. ERROR 줄이 없기 때문이다. 같은 오판이 `laid` 에도 들어간다. 그래서 같은 흐름에서 대기하던 추가매수는 소진된(거부되지 않은) 게이트를 재무장하지 않고, 역시 「서버 거부」 로 적는다.

이 등식은 R4-WR-01 제안 스니펫(`const laid = r.turnedOn.filter((it) => server[…] !== true)`)에서 그대로 왔다. htw 계획은 JSDoc 에 「사실의 핵심은 그 순간 방어가 서 있지 않다」 라고 적어 두었다. 그러나 사유 어휘는 원인(거부)을 단정한다. 가능성은 낮다. 매도는 진입 래치 뒤에 발주하고, 에코는 Set 직후 한 번이기 때문이다. 다만 이 줄이 「6체크 무장의 유일한 흔적」 이라는 R3-G1 의 전제에서 보면, 원인을 단정하는 문구는 같은 종류의 사실 불일치다.

**Fix:** 둘 중 하나로 고친다.
- (권장) 사유 어휘를 원인 중립으로 바꾼다. 예: `에코 미반영` 또는 `무장 안 됨`. UI-SPEC 닫힌 목록도 함께 개정한다. `laid` 는 「이 흐름에서 요청했는데 무장되지 않은 항목」 으로 뜻을 좁혀 적는다.
- (대안) 훅이 해소 ① 에서 `rejectSeq !== inf.rejectSeqAtSend` 를 함께 기록해 보낸 성공 신호에 싣는다(예: `sentSuccess.rejected: boolean`). 그러면 폼 (b) 는 거부 신호가 있을 때만 `서버 거부` 를 쓰고, 없으면 중립 사유를 쓴다. `laid` 수집도 같은 조건으로 거른다. 단 ERROR 가 에코보다 **늦게** 오는 순서에서는 이 대안도 놓치므로, 권장안이 더 견고하다.

```ts
// 대안 스케치 — 해소 ① matches
const rejectedHere = rejectSeq !== inf.rejectSeqAtSend;
for (const [k, v] of Object.entries(booleanCompanions(carried)) as [LcFieldKey, unknown][]) {
  if (v === true && server[k] !== true && rejectedHere) laidRef.current.add(k);
}
setSentSuccess((s) => ({ seq: s.seq + 1, field: inf.field, rejected: rejectedHere }));
```

## Info

### R5-IN-01: `confirmAutoChecks` 는 비대칭이다 — 「켬」 은 에코로 확정하지만 「켜지 않음」 은 에코와 대조하지 않는다

**File:** `webapp/src/lib/limit-chaser.ts:455-467`
**Issue:** `turnedOn` 은 에코로 거르고, `r.skipped`(예측 사유 · refused 사유)는 그대로 둔다. 같은 흐름에서 사람이 매도주문을 직접 켜서 대기 순서상 먼저 섰거나, 다른 단말 · WinForms 가 같은 순간 켰다면 에코는 ON 이다. 그런데도 줄은 「켜지 않음: 매도주문(…)」 이다. 「로그는 사실만」 원칙이 한 방향으로만 적용됐다. 가능성은 낮다.
**Fix:** skipped 중 `server[field] === true` 인 항목은 줄에서 빼는 편이 사실에 맞다. 그 항목은 이 자동 체크가 켠 것이 아니므로 「켬」 에 넣지도 않는다. 또는 이 한계를 JSDoc 「잔여 한계」 에 명시한다.

### R5-IN-02: `laid` 수집이 주 필드 `matches` 에만 기댄다 — 게이트가 이미 켜진 채 보낸 확정은 보내기 전 에코로 성공 판정돼 요청 동반 전부가 `laid` 로 오염될 수 있다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:866-876`
**Issue:** `matches = server[inf.field] === inf.value` 는 동반을 보지 않는다. 다음 흐름을 보자.
1. 같은 필드 OFF→ON 이 대기에서 교체된 뒤 꺼내진다.
2. 게이트는 이미 ON 인데 동반(예: 사람이 꺼 둔 취소)이 달라서 no-op 이 아니게 되어 나간다.
3. 다음 렌더가 에코 없는 거부 신호(부분 거부의 ERROR 선행 순서)이면, 해소 ① 이 **보내기 전 에코**로 `matches` 가 된다.
4. 그 결과 요청한 동반 전부가 `server[k] !== true` 로 `laid` 에 들어가고, 폼 (b) 줄도 전부 「서버 거부」 가 된다.

이 판정 규칙 자체는 이전부터 있던 것이다(⑧). 이번 변경은 그 오판을 흐름 수명의 기억으로 퍼뜨린다. 발생 가능성은 매우 낮다.
**Fix:** 수집을 `serverChanged`(이 렌더에 에코가 왔다)일 때로 한정한다. 또는 이 경로를 ⑬ 헤더의 한계로 적는다.

### R5-IN-03: 추가매수 줄의 「서버 거부」 는 그 제출에서 서버가 거부한 것이 아니다 — 거부 한 번에 error 줄이 셋

**File:** `webapp/src/lib/limit-chaser.ts:404` · `webapp/src/components/trading/limit-chaser-form.tsx:1015` · `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:3232-3235`
**Issue:** refused 경로의 `서버 거부` 는 클라이언트가 **싣지 않은** 항목이다. 서버는 추가매수 프레임에서 매도주문을 본 적이 없다. 로그 탭에는 한 번의 거부로 세 줄이 선다.
- `[서버] … 매도를 켜지 않았습니다` 원문
- 선매수 error 줄
- 「추가매수 자동 체크 — 켜지 않음: 매도주문(서버 거부)」 error 줄

셋째 줄은 사람에게 「두 번 거부됐다」 로 읽힐 수 있다. UI-SPEC 개정(「같은 사유로 적는다」)이 의도한 결과라서 결함이 아니라 문구 정확성 메모로 남긴다.
**Fix:** refused 로 뺀 항목의 사유를 구별해 적는다(예: `앞 제출에서 서버 거부`). 또는 추가매수 줄에서는 refused 항목을 생략하고, 선매수 줄 한 줄로 사건을 말하게 한다. 어느 쪽이든 UI-SPEC 닫힌 목록 개정이 필요하다.

### R5-IN-04: 카드 흐름 통합 테스트가 추가매수 줄을 잠그지 않는다 — ⑬ 을 훅에 둔 이유인 「꺼내기가 먼저」 순서에서 줄 결과가 검증되지 않았다

**File:** `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx:1807-1822`
**Issue:** 설계 근거는 이렇다. 카드 흐름에서는 답 신호 증가와 보낸 성공이 한 렌더로 합쳐져 훅 꺼내기가 폼 (b) 보다 먼저 돈다. 그래서 기억을 훅에 두었다. 그런데 카드 케이스는 두 번째 cfg 의 `sellEnabled false` 와 선매수 줄만 본다. 추가매수 성공 에코를 보내 「추가매수 자동 체크 — 켜지 않음: 매도주문(서버 거부)」 줄과 그 level 을 단언하는 부분이 없다. 이 줄은 폼 단독 F1 순서에서만 잠겨 있다.
**Fix:** 카드 케이스 끝에 추가매수 성공 에코(`{ ...answered, extraBuyEnabled: true }`)를 보내고 두 가지를 단언한다. 추가매수 줄의 정확한 문장 · `data-level="error"`, 그리고 `lcSets()` 길이 2 유지.

### R5-IN-05: 주석 · 명세 정합 — 「사람의 새 확정」 · 「다른 그룹」 · 닫힌 목록 JSDoc

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:118-129,769-770` · `webapp/src/components/trading/limit-chaser-form.tsx:1168` · `webapp/src/lib/limit-chaser.ts:294` · `.planning/phases/24-limitchaser-buy3/24-UI-SPEC.md:403`
**Issue:**
- ⑬ 은 「사람의 새 확정」 에서 비운다고 적는다. 실제로는 비-사람 제출인 `dropMasterAfterServerFold`(`commitField('buyEnabled', false, …, { cause: 'serverFold' })`)도 같은 `commit` 을 지나며 비운다. 흐름이 빈 상태에서만 비우므로 동작상으로는 무해하다.
- UI-SPEC 은 「같은 흐름에서 대기하던 **다른 그룹**의 자동 체크」 라고 적는다. 실제로는 같은 그룹의 재확정(선매수 OFF→ON 대기 교체)에도 적용된다.
- `AutoCheckReason` JSDoc 은 「새 사유를 여기 더하지 않는다」 는 문장을 유지한 채 바로 다음 줄에서 사유를 더했다.

**Fix:** 이렇게 고친다.
- ⑬ 문구를 「흐름이 빈 상태의 새 확정(사람 · serverFold 모두)」 으로 바꾼다.
- UI-SPEC 을 「같은 흐름에서 대기하던 그룹 켬 자동 체크」 로 바꾼다.
- JSDoc 첫 문장을 「UI-SPEC 닫힌 목록을 먼저 개정하지 않고 사유를 더하지 않는다」 로 바꾼다.

---

_Reviewed: 2026-09-29T04:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
