---
phase: 24-limitchaser-buy3
round: 4
scope: gap-closure round 3 — quick-260929-akj(7fd7da49 · 214ae025 · 808a29a2) + 다른 단말 배너 제거(1a2c9944) (diff b2e6d5c3..HEAD)
reviewed: 2026-09-29T03:38:20Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 24: 갭 클로징 코드 리뷰 보고서 (4라운드 · quick-260929-akj + 배너 제거)

**Reviewed:** 2026-09-29T03:38:20Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found
**이전 라운드 기록:** `24-REVIEW.md`(WR-/IN-) · `24-REVIEW-R2.md`(GC-) · `24-REVIEW-R3.md`(R3-)는 수정하지 않았다. 이 라운드의 ID 는 `R4-` 네임스페이스다.

## Narrative Findings (AI reviewer)

## 요약

`git diff b2e6d5c3..HEAD` 의 12개 파일을 읽었다. 대상은 네 커밋이다.
- `7fd7da49` · `214ae025` · `808a29a2` — quick-260929-akj. R3-WR-01 · R3-WR-02 수정과 회귀 테스트.
- `1a2c9944` — 「다른 단말에서 변경」 배너 · 로그 줄 제거. `onServerEcho` · `ECHO_BANNER_MS` 를 정리했다.

필요한 곳은 주변 코드까지 따라갔다. `webapp/src/lib/limit-chaser.ts` 의 `groupAutoChecksOf` · `groupAutoCheckLogLine`, 카드의 `acceptAnswer` · 에코 이펙트 두 개, `number-pad-sheet.tsx` 의 `otherDevice` 줄이 그 대상이다. 대상 단위 테스트 6개 파일(468건)을 직접 다시 돌려 모두 통과했다. `npx tsc --noEmit` 도 green 이다. 제거된 API(`ECHO_BANNER_MS` · `handleServerEcho` · `onServerEcho` · `card-echo-banner` · `lastSuccessSent` · `overwrittenDirty`)는 `webapp/src` · `webapp/e2e` 어디에도 남지 않았다(grep 0건).

**잘 닫힌 것.**
- **R3-WR-01 (메커니즘):** 카드가 거부 통지에서 `acceptAnswer()` 와 `setRejectSeq` 를 한 이펙트 안에서 함께 올린다. 그래서 훅은 답 신호와 거부 신호를 같은 실행에서 본다. 훅 ① 의 순서도 맞다(matches → unacked → 유예 → 즉시 거부). 유예 타이머의 정리 경로(성공 · `failInflight` · 언마운트)도 빠짐이 없다. `setInflight(null)` 을 부르는 자리는 `matches` 분기와 `failInflight` 둘뿐이고, 둘 다 `clearRejectGrace()` 를 지난다. 타이머 콜백은 `inflightRef.current === inf` 동일성 가드가 있고, 아무것도 보내지 않는다(T-16-10). 리뷰어 재현(선매수 in-flight + 추가매수 대기 → ERROR 먼저 → 에코)은 훅 H1 · 폼 F1 · 카드 흐름 통합 케이스가 모두 잠근다.
- **R3-WR-02:** 보낸 성공 신호가 해소 ① 의 `matches` 분기에서만 오른다. 한 실행에 in-flight 는 최대 1건이라 덮일 수 없다. 폼의 (a)(b)(c) 소비 규칙을 모든 성공 경로(① · drain no-op · 로컬 반영 · failQueue 섬 · ③ 늦은 에코)에 대입해 봤다. 겹치거나 빠지는 슬롯이 없었다. (b) 가 먼저 소비하므로 (c) 가 같은 슬롯을 다시 비우는 일도 없다.
- **배너 제거(1a2c9944):** 카드 상태 · 폼 · 카드 본문 · e2e 13 · P24-6 이 한 벌로 정리됐다. `limitChaserValuesChanged` 는 `strategyLogLine` 의 `valuesApplied`(「서버 반영 완료」)에서 계속 쓰인다. 그래서 다른 단말 변경은 로그 한 줄로 여전히 드러난다.

**덜 닫힌 것.**
- R3-WR-01 이 살린 자동 체크 줄이 **요청한 항목**을 적는다. 서버가 실제로 세운 항목이 아니다. 부분 거부의 정의가 「요청 일부를 눕힘」이므로, 이 줄이 되살아나는 바로 그 경우에 줄이 사실과 어긋난다. 폼 F1 테스트가 그 어긋난 문장을 기대값으로 잠갔다 → R4-WR-01.

## Round-3 항목 클로징 표

| Round-3 | 판정 | 근거 |
|---|---|---|
| R3-WR-01 부분 거부 ERROR 가 in-flight 를 실패로 접음 | **closed**(메커니즘) · 후속 R4-WR-01 | `strategy-card.tsx:615-618` 거부 신호 → `card-body.tsx:273` → 폼 → 훅 `use-lc-field-commit.ts:851-861` 유예. 에코가 오면 matches(성공) 또는 즉시 거부다(H3). 에코가 없으면 유예 끝에 거부이고, 대기열도 종전대로 실패다(H2 · F2 · lc-tracer ⑤ · ⑬). 되살아난 자동 체크 줄의 내용 문제는 R4-WR-01 이다. |
| R3-WR-02 성공 신호 한 칸 | **closed** | `sentSuccess` 는 `:838-842` 에서만 오른다. 폼 (b) `limit-chaser-form.tsx:1071-1086` 은 보낸 성공으로만 줄을 쓴다. (c) `:1088-1094` 은 줄 없이 슬롯만 비운다. 편집기 닫기도 보낸 성공 신호로 한 벌 더 걸렸다(`:747-751`). 훅 · 폼 회귀가 있다. |
| R3-IN-01 `echoAnswersSent` 의 재계산 · 고정 6필드 | **open**(akj 범위 밖 · 일부 무효화) | 1a2c9944 로 「다른 단말」 배너가 사라졌다. 그래서 첫째 결과(내 진짜 에코가 배너를 세움)는 더 이상 나타나지 않는다. 둘째 결과(사유 · 동반 문장이 남의 에코에 붙음 · ERROR 옆 「서버 반영 완료」)는 그대로다. 재보고하지 않는다. |
| R3-IN-02 P24-3 부재 관찰 창 | **open**(akj 범위 밖) | 재보고하지 않는다. |
| R3-IN-03 e2e 4c 디버그 출력 | **open**(akj 범위 밖) | 재보고하지 않는다. |

## Warnings

### R4-WR-01: 부분 거부 뒤 되살아난 「선매수 자동 체크」 줄이 서버가 눕힌 항목까지 「켬」으로 적는다 — F1 테스트가 모순된 문장을 잠갔다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:1083` (문장: `webapp/src/lib/limit-chaser.ts:433-448` `groupAutoCheckLogLine`) · 잠금: `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:3188-3199` · `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx:1789-1808`

**Issue:** (b) 는 줄을 이렇게 만든다.

```ts
const line = serverRef.current?.[gate] === true && auto !== undefined ? groupAutoCheckLogLine(auto) : null;
```

에코와 대조하는 것은 **그룹 게이트 하나**(`serverRef.current[gate]`)뿐이다. `auto.turnedOn` · `auto.priceFilled` 는 누른 순간(또는 꺼내는 순간)의 **예측**이다. 이 값이 그대로 「켬: …」이 된다. akj 전에는 이 차이가 드러날 일이 거의 없었다. 부분 거부에서는 줄 자체가 사라졌기 때문이다(R3-WR-01). 이제 줄이 바로 그 흐름에서 선다. 부분 거부는 정의상 요청 항목 일부를 서버가 눕힌 경우다. 그래서 줄이 선다면 사실과 어긋난다.

F1 이 이 모순을 그대로 기대값으로 삼는다. 에코는 `sellEnabled: false`(매도 눕힘)이다. 로그 탭의 순서는 이렇게 된다.
1. `[서버] 매도 설정이 불완전합니다 … 매도를 켜지 않았습니다` (ERROR)
2. `선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · … ` (info, `PRE_FULL_LINE`)

카드 흐름 통합 케이스도 같은 에코 뒤에 `autoPre()` 1줄을 기대한다. 스위치는 매도 OFF 인데 로그는 「켬: 매도주문」이라고 한다. 자동 체크 줄은 이 파일이 「6체크 무장의 **유일한 흔적**」이라고 부르는 기록이다. 그 기록이 틀린 무장 상태를 남긴다. 레벨도 `info` 라, 사람이 ERROR 줄을 놓치면 매도가 무장된 줄 알고 넘어간다.

같은 뿌리의 부수 효과가 하나 더 있다. 대기하던 추가매수를 꺼낼 때 동반 함수가 `base`(에코 = `sellEnabled false`)로 다시 계산한다. 그러면 `groupAutoChecksOf` 가 방금 서버가 눕힌 매도주문을 **다시** 켜서 싣는다. 가격 · 잔량 · 비율 조건은 예측상 통과이기 때문이다. 부분 거부는 예측(`groupAutoChecksOf`)과 서버 검증이 갈라진 경우라, 두 번째 제출도 같은 ERROR 를 받을 가능성이 높다. 그 뒤에는 「추가매수 자동 체크 — 켬: 매도주문 …」 거짓 줄이 하나 더 선다. 제출은 사람 클릭 1회당 1건이라 T-16-10 위반은 아니다. 다만 akj 전에는 이 경로가 대기 폐기로 끊겼다. 이 경로는 akj 가 새로 연 것이다.

**Fix:** 줄은 **에코가 확인한 결과**로 만든다. 요청했는데 에코에 서지 않은 항목은 「켬」에서 빼고, 사유를 「서버 거부」로 옮긴다. 판정은 lib 한 곳에 둔다.

```ts
// limit-chaser.ts — 예측 결과를 에코로 확정한다(순수 함수 · 판정 한 곳)
export type AutoCheckReason = … | '서버 거부';
export function confirmAutoChecks(r: GroupAutoCheckResult, server: RelayLimitChaser): GroupAutoCheckResult {
  const stood = r.turnedOn.filter((it) => server[AUTO_CHECK_FIELD[it]] === true);
  const laid = r.turnedOn.filter((it) => server[AUTO_CHECK_FIELD[it]] !== true);
  const priceStood =
    r.priceFilled !== null &&
    (r.companions.sellOrderPrice === undefined || server.sellOrderPrice === r.companions.sellOrderPrice) &&
    (r.companions.sellWatchPrice === undefined || server.sellWatchPrice === r.companions.sellWatchPrice);
  return {
    ...r,
    turnedOn: stood,
    skipped: [...r.skipped, ...laid.map((item) => ({ item, reason: '서버 거부' as const }))],
    priceFilled: priceStood ? r.priceFilled : null,
  };
}

// limit-chaser-form.tsx (b)
const s = serverRef.current;
const line = s?.[gate] === true && auto !== undefined ? groupAutoCheckLogLine(confirmAutoChecks(auto, s)) : null;
```

F1 · 카드 흐름 케이스의 기대값은 `'선매수 자동 체크 — 켬: 매도>잔량추적 · … / 켜지 않음: 매도주문(서버 거부) / …'` · `'error'` 로 바꾼다. lib 표에는 「요청 6 · 에코 5 → 켬 5 · 서버 거부 1」 행을 추가한다.

부수 효과(대기 추가매수가 눕혀진 매도를 다시 요청)는 선택지가 둘이다.
- (i) 사용자 결정으로 수용하고 이 파일 주석에 적는다.
- (ii) 폼이 「이 세션에서 서버가 눕힌 자동 체크 항목」을 기억한다. 그리고 그 항목은 다음 자동 체크에서 `skipped('서버 거부')` 로 둔다.

어느 쪽이든 명시적으로 결정해야 한다.

## Info

### R4-IN-01: 유예 조건이 「이 렌더에 서버 변화 없음」이라, ERROR 와 같은 제출 에코가 한 렌더에 합쳐지고 주 필드가 눕혀졌으면 이미 온 에코를 두고 1초를 더 기다린다 — 그 사이 누른 확정은 보내지 않고 실패한다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:851`

**Issue:** 유예 조건은 `answered && rejectSeq !== inf.rejectSeqAtSend && !serverChanged` 다. `serverChanged` 는 「이 **실행**에 서버 값이 바뀌었나」를 뜻하고, 「보낸 **뒤** 에코가 왔나」를 뜻하지 않는다. gh-trade 는 ERROR 와 에코를 같은 연결로 연달아 보낸다. 그래서 두 WS 프레임이 한 스케줄러 틱에 처리돼 한 렌더(R0)로 합쳐질 수 있다. 이때 순서는 다음과 같다.
1. R0 의 자식(폼 훅) 이펙트가 부모(카드) 이펙트보다 먼저 돈다. 그 시점에 서버 값은 바뀌었지만 답 신호는 아직 그대로다.
2. 주 필드가 눕혀졌으면(`matches` false · `answered` false) 아무 판정도 하지 않는다.
3. R1 에서 카드가 올린 답 · 거부 신호가 들어온다. 이때 `serverChanged` 는 false 라 유예에 들어간다.

에코는 이미 왔으므로 결과는 확정이다. 그런데도 실패 표시가 1초 늦게 선다. 그 1초 동안 추가로 두 가지가 생긴다.
- in-flight 가 살아 있으니 사람이 누른 **다른 필드**의 확정은 대기열에 선다. 유예가 끝나면 `failQueue('rejected')` 가 그것을 **보내지 않고** 실패로 표시한다.
- 인라인 편집기는 readOnly 로 잠긴 채다(lc-tracer ⑤ 가 `readOnly === true` 를 유예 중 기대값으로 잠갔다).

전면 거부(에코 없음)도 같다. ERROR 경보가 선 뒤 1초 안에 누른 확정은 모두 대기 후 폐기된다. SUMMARY 「잔여 한계」는 「폼 실패 표시가 최대 1초 늦다」만 적었다. 이 폐기는 적지 않았다.

**Fix:** 판정 기준을 「보낸 뒤 서버 값이 한 번이라도 바뀌었나」로 바꾼다. 보낼 때의 서버 객체를 in-flight 에 적어 두면 한 줄로 끝난다.

```ts
// sendNow
setInflight({ ...p, companions, answerSeqAtSend: serverAnswerSeq, rejectSeqAtSend: …, serverAtSend: server ?? null });
// 해소 ①
} else if (answered && rejectSeq !== inf.rejectSeqAtSend && server === inf.serverAtSend) {
  // 보낸 뒤 에코가 한 번도 없었다 — 부분 거부면 곧 온다(유예)
```

유예 중 대기 확정이 폐기되는 것은 SUMMARY 「잔여 한계」와 `LC_REJECT_ECHO_GRACE_MS` JSDoc 에 한 줄 적는다. 훅 테스트에는 「서버 변화 렌더(주 필드 OFF · 답 불변) → 답 + 거부 렌더 → 타이머 진행 없이 rejected」 케이스를 추가한다.

### R4-IN-02: H4(유예 중 언마운트)는 정리 코드를 지워도 통과한다 — 아무것도 잠그지 않는다

**File:** `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx:1006-1019`

**Issue:** H4 가 확인하는 것은 세 가지다. ① 예외 없음 ② `console.error` 없음 ③ 전송 1. 이 저장소는 React 19.2 다. React 18 부터 언마운트된 컴포넌트의 setState 경고가 없어졌다. 그리고 유예 타이머 콜백은 아무것도 보내지 않는다(T-16-10). 그래서 언마운트 정리(`clearRejectGrace()`)를 지워도 세 단언이 모두 그대로 통과한다. 타이머가 발화해 `failInflight` → `revertToggle` → `optsRef.current.setForm` 까지 돌아도 결과는 같다. SUMMARY 「변이 확인」에서 H4 만 살아남은 것도 같은 이유다. 요약은 이를 「타이머 정리를 잠그는 케이스라 의도와 맞다」고 읽었지만, 실제로는 정리를 잠그지 못한다.

**Fix:** 정리가 없을 때만 달라지는 관측값을 단언한다. 하네스의 `setForm` 이 `t.formRef` 를 갱신하므로 이것으로 충분하다.

```ts
t.hook.unmount();
act(() => { vi.advanceTimersByTime(LC_REJECT_ECHO_GRACE_MS * 2); });
// 정리가 없으면 타이머가 revertToggle → setForm 으로 낙관 표시를 되돌린다.
expect(t.formRef.current.preBuyEnabled).toBe(true);
expect(vi.getTimerCount()).toBe(0);
```

### R4-IN-03: 배너 제거 뒤에도 주석 다섯 곳이 「배너」를 현재형으로 말한다

**File:** `webapp/src/components/trading/strategy-log.tsx:27, 47` · `webapp/src/components/trading/card/strategy-card.tsx:240, 478, 484`

**Issue:** 1a2c9944 는 코드 · 테스트에서 배너를 걷었다. 하지만 설명 주석 몇 곳이 남았다.
- `strategy-log.tsx:27`: 「알림 채널은 상태줄 인라인 배너(6초) + 이 로그 2개뿐이다」
- `strategy-log.tsx:47`: 「「서버 반영 완료」도 「다른 단말」 배너도 아니다」
- `strategy-card.tsx:240`: 「refs·타이머·배너를 공유하지 않는다」
- `strategy-card.tsx:478`: 「로그·배너·appliedAt 을 건드리지 않는다」
- `strategy-card.tsx:484`: 「배너를 삼키지 않는다(GC-WR-01)」

이 저장소의 주석은 설계 정본 역할을 한다. 없는 채널을 정본으로 적어 두면 다음 변경자가 배너 경로를 찾거나 되살린다.

**Fix:** 다섯 곳을 현재 동작으로 고친다.
- `:27`: 「카드 인라인 고지(미반영 · 서버 거부) + 이 로그」
- `:47`: 「「서버 반영 완료」가 아니다」
- `:240`: 「refs·타이머를」
- `:478`: 「로그·appliedAt 을」
- `:484`: 「내 귀속을 삼키지 않는다」

---

_Reviewed: 2026-09-29T03:38:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
