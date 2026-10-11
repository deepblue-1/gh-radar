---
phase: 24-limitchaser-buy3
round: 2
scope: gap-closure 24-10 ~ 24-17 (diff f2afd64c..HEAD)
reviewed: 2026-09-28T07:35:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - packages/shared/src/relay.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/e2e/specs/a11y.spec.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 24: 갭 클로징 코드 리뷰 보고서 (2라운드 · 24-10 ~ 24-17)

**Reviewed:** 2026-09-28T07:35:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found
**Round-1 기록:** `24-REVIEW.md`(WR-01~06 · IN-01~07)는 수정하지 않았다. 이 라운드의 ID 는 `GC-` 네임스페이스다.

## Narrative Findings (AI reviewer)

## 요약

`git diff f2afd64c..HEAD` 의 16개 파일을 읽었다. 필요한 곳은 주변 코드와 gh-trade `Gateway.cpp`(`ProcessSetLimitChaser`), relay `subscription-hub.ts`(ServerMessage 팬아웃)까지 따라갔다. 해당 단위 테스트 6개 파일(536건)은 직접 다시 돌려 모두 통과했다. 테스트 통과가 곧 무결함은 아니므로, 아래 결함은 코드 경로를 추적해 얻었다.

**잘 닫힌 것.**
- WR-01: 판별 지점이 `isLegacyBuySchema` · `isLegacyAmountUnknown` 하나로 모였다.
- WR-02: 끄기만 허용하고, 매수주문부터 끄게 하며, 카드 상태 · 스위치 비활성 · 열 패널까지 일관되게 반영됐다.
- IN-02 ~ IN-05: 깔끔하게 닫혔다.
- WR-06: 순수 델타 가드와 비가시 유예가 들어갔다. 남는 한계는 사용자 승인 범위다.

**새 결함.** 갭 클로징의 수정 자체가 만든 것이 셋, 덜 닫힌 것이 하나다.
- **GC-WR-01:** WR-05 수정이 전제한 「`SetLimitChaser` ERROR = 확정 거부」가 사실이 아니다. 실제로는 부분 거부(ERROR 뒤 에코)도 같은 모양이다. 게다가 ServerMessage 는 사용자의 모든 탭으로 팬아웃된다. 그래서 거부 시점에 귀속을 비우면, 내 제출의 진짜 에코가 「다른 단말」 배너로 읽히고 D-01 동반 · serverFold 문장이 사라진다.
- **GC-WR-02:** WR-04 수정으로 대기 건을 실패로 접을 때, 되돌림 기준이 서버 값이 아니라 누른 순간의 폼 값이다. 그래서 서버는 선매수 OFF 인데 스위치는 ON 으로 되돌아가는 표시 거짓이 생긴다.
- **GC-WR-03:** WR-03 의 「동반은 꺼낼 때 계산」이 켜는 방향에만 적용됐다. D-02 전반(마지막 그룹 끄기 + 마스터 OFF)은 여전히 누른 순간 값으로 굳힌다.
- **GC-WR-04:** D-35 로 자동 체크 트리거가 둘이 됐다. 그런데 로그 대기 슬롯은 여전히 한 칸이라, in-flight 중 다른 그룹을 켜면 먼저 켠 그룹의 자동 체크 로그가 사라진다. 이 로그는 매도 · 취소 6체크 자동 무장을 알리는 유일한 흔적이다.

## Round-1 항목 클로징 표

| Round-1 | 판정 | 근거 |
|---|---|---|
| WR-01 buy3 선매수 금액 0 편집 잠김 | **closed** | `limit-chaser.ts:478-480` `isLegacyAmountUnknown` · `formFromServer:504` · 훅 `amountRequired:790` · `sendNow:520` 이 모두 이 함수를 읽는다. `lcAmountBlockOf` 경로는 삭제됐다. 폼 · 훅 · e2e P24-9 회귀가 있고, `limit-chaser.test.ts` 의 옛 「버그를 의도로 단언」은 교체됐다. |
| WR-02 `buy3Schema` 미소비 | **closed**(사용자 승인 해석 기준) | `lcLegacyBlockOf`(`use-lc-field-commit.ts:195-205`)가 훅 전송 직전 가드(대기열 꺼내기 포함 `:504`)와 폼 `validateCommit`(`limit-chaser-form.tsx:1208-1210`)에 같은 함수로 들어갔다. 카드 `LC_LEGACY_BUY_STATUS` · `gateBlocked`/`gateDisabled` legacy 갈래 · 열 패널 한 줄도 있다. 남은 가장자리는 GC-IN-01. |
| WR-03 대기열 동반 낡은 값 | **partially** | 켜는 방향(`commitGroupSwitch` `:987-993`)은 함수 동반으로 바뀌었다. D-02 전반 끄는 방향(`:1001-1003`)은 여전히 정적 값이다 → GC-WR-03. |
| WR-04 `failQueue` 동반 미비교 | **partially** | 비교는 `sameAsServer(… companionsAt(q, baseNow()))`(`:581`)로 고쳐졌다. 대신 새로 들어간 되돌림 경로가 서버 값이 아닌 `prevValue` 로 되돌린다 → GC-WR-02. |
| WR-05 거부 · 무응답 귀속 오염 | **partially** | 15:40 · 전부 정지 원인 에코의 귀속 차단(`strategy-card.tsx:529-533`)과 결과 모름 창 만료 타이머(`:384-391`)는 맞다. 거부 시 즉시 비움(`:634-638`)은 부분 거부 · 다른 탭 거부까지 삼킨다 → GC-WR-01. |
| WR-06 자동 마스터 OFF 다중 인스턴스 | **partially**(사용자 승인 잔여) | 가드 ⑤ `isMasterOnlyDelta`(`limit-chaser.ts:550-556`, 폼 `:1083`)와 가드 ⑥ 비가시 유예(`:402-407`, `:1108`)가 들어갔다. 승인된 잔여 한계 문구에는 「모든 인스턴스가 숨은 경우」가 빠져 있다 → GC-IN-02. |
| IN-01 낡은 필드 수 주석 | **partially** | lib · shared · 폼 · 훅 머리는 정리됐다. 훅 `:676` 에 「게이트 4종 밖」이 남았다(`LC_GATE_FIELDS` 는 6개) → GC-IN-05. |
| IN-02 죽은 `dirtyFieldsOf` | **closed** | `webapp/src` 에서 `dirtyFieldsOf`/`DIRTY_COMPARED_FIELDS`/`LimitChaserDirtyField` 0건이다(`vi-settings-rows.tsx` 의 동명 지역 함수는 별개). |
| IN-03 선매수 한방가격 0 사전 검증 | **closed** | `groupPrechecksOf` `:437-439` 가 선매수 카드 한 줄로 말한다. |
| IN-04 선매수 금액 0 문구 | **closed** | `GROUP_AMOUNT_FIELD.preBuyEnabled`(`use-lc-field-commit.ts:212`)로 세 그룹이 같은 `amountRequired` 문구를 쓴다. |
| IN-05 동반 값 필드 낙관 반영 | **closed** | `booleanCompanions`(`:318-324`)가 `showToggle` 과 `reshow` 의 되돌림 양쪽에 걸린다. |
| IN-06 마스터 OFF 뒤 그룹 cfg 소실 | **not closed**(명시 이월) | 24-10 처리표가 gh-trade D-32 협의 사안으로 이월했다. 코드 변경은 없다. |
| IN-07 e2e 고정 대기 | **partially** | P24-5 는 사건 기반으로 바뀌었다. P24-3(`:2484`) · P24-4(`:2551, 2561, 2572, 2585`) · P24-6(`:2700`)은 그대로다 → GC-IN-04. |

## Warnings

### GC-WR-01: 거부 통지 즉시 귀속 비움(WR-05 수정)이 부분 거부와 다른 탭의 거부까지 삼켜, 내 제출의 에코를 「다른 단말」로 읽는다

**File:** `webapp/src/components/trading/card/strategy-card.tsx:634-638` (근거: `webapp/src/lib/limit-chaser.ts:615-624` · `relay/src/hub/subscription-hub.ts:1003-1012` · gh-trade `server/src/net/Gateway.cpp:2047-2050, 2266`)
**Issue:** 24-11 은 「거부는 확정 답이라 즉시 비운다」는 전제로 `isLimitChaserSetRejection` 분기에서 `pendingRef`/`pendingCauseRef` 를 비운다. 이 전제는 두 가지 이유로 거짓이다.
1. **부분 거부가 같은 모양이다.** gh-trade `ProcessSetLimitChaser` 는 매도 · 취소 · 추가매수 · 후매수 검증 실패 시 「그 항만 눕히고」 `SendServerMessageToConn(conn, "ERROR", …, {isin, accountNo, "SetLimitChaser"})` 를 **먼저** 보낸다. 그런 다음 cfg 를 저장하고 에코(`:2266`)를 보낸다. 훅 머리 ⑪ 과 RESEARCH:421 도 이 부분 거부를 설계 전제로 적어 두었다. `isLimitChaserSetRejection` 은 `lv/src/i/a` 만 보므로 이 ERROR 도 거부로 판정한다.
2. **ServerMessage 는 사용자의 모든 소켓으로 팬아웃된다**(`#fanout(userId, msg)`). 탭 B 의 거부가 같은 전략을 연 탭 A 의 카드에서도 `pendingRef` 를 비운다.

두 경우 모두, 뒤이어 오는 **내 제출의 진짜 에코**가 `sent === null` 로 처리된다. 그 결과는 이렇다.
- D-01/D-02 동반 문장(「{그룹} 체크 — 매수주문도 켬」)과 serverFold 문장(「서버가 매수 그룹 해제 — …」)이 사라지고, 종전 전이 문장으로 떨어진다.
- `limitChaserValuesChanged` 가 참이면 **거짓 「다른 단말에서 변경됐어요」 배너**와 로그 줄이 선다. 예: 자동 체크의 상한가 채움(`sellOrderPrice`)이 실린 선매수 켜기가 매도 검증에서 부분 거부되는 경우.

24-11 이전에는 이 에코가 정상 귀속됐다. 즉 WR-05 를 닫으면서 생긴 회귀다. strategy-card-flow 의 WR-05 테스트는 「ERROR 뒤 에코 없음」만 다루고 「ERROR 뒤 같은 제출의 에코」 케이스는 없다.
**Fix:** 거부 통지로는 귀속을 비우지 않는다. 비우는 시점은 이미 있는 두 수평선(에코 소비 · 결과 모름 창 만료)에 맡긴다. 거부된 제출의 귀속이 다음 무관한 에코에 붙는 원래 문제(WR-05)는 「에코가 내 cfg 와 맞는가」로 판정한다.
```ts
// 거부 분기: 귀속은 비우지 않는다 — 부분 거부는 곧 같은 제출의 에코가 온다.
if (isLimitChaserSetRejection(msg, isin, accountNo)) acceptAnswer();

// 에코 소비: 보낸 cfg 의 사용자 필드가 이 에코와 어긋나면(거부돼 서지 않은 제출) 귀속하지 않는다.
const attributed =
  cause !== null || sent === null || !echoAnswersSent(sent, server) ? null : sent;
// echoAnswersSent = sent 의 주 게이트/값 필드 중 하나 이상이 prev→server 로 실제 바뀌었거나 server 와 같다
```
최소한 부분 거부 케이스(ERROR → 같은 키 에코)의 회귀 테스트를 추가하고, 다른 탭 거부 팬아웃 케이스도 테스트한다.

### GC-WR-02: `failQueue` 가 동반 불일치로 대기 건을 접을 때 주 필드를 서버 값이 아니라 누른 순간 값으로 되돌려, 서버 OFF 인 스위치를 ON 으로 그린다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:574-592` (`revertToggle` `:463`)
**Issue:** WR-04 수정으로 이 경로에 새로 들어온 케이스가 있다. 대기 중인 「선매수 끔 + `buyEnabled:false` 동반(D-02 전반)」의 앞 건이 거부됐고, 그사이 서버가 선매수를 이미 접었다(`server.preBuyEnabled === false`, 마스터 ON)고 하자. 이때 `sameAsServer` 가 false 라 실패로 접힌다. 여기까지는 맞다. 그런데 `revertToggle(q)` 는 `showToggle(field, q.prevValue, q.prevCompanions)` 이고, `prevValue` 는 **누른 순간 폼 값 `true`** 다. 그래서 되돌린 뒤 폼은 이렇게 된다.
- 선매수 스위치는 **ON** 이다. 서버는 OFF 다.
- 그 스위치 옆에는 「반영하지 못했어요」 말풍선이 붙는다. 사용자가 끄려던 값이 이미 서버에 서 있는데도 그렇다.

폼 동기화 이펙트는 `server` 가 바뀔 때만 돌므로, 다음 비동일 에코가 올 때까지 이 거짓 표시가 남는다. 거부 답은 서버 값을 바꾸지 않는 경우가 대부분이다. 24-14 SUMMARY 는 「서버 값(ON) 되돌림」이라고 적었지만, 서버 값과 일치하는 것은 마스터 동반뿐이고 주 필드는 서버 값이 아니다. 수정 전(주 필드만 보고 성공)에는 마스터가 거짓이었고, 수정 후에는 주 필드가 거짓이다. 거짓의 위치만 옮겨졌다.
**Fix:** 서버가 있으면 되돌림 기준을 서버 값으로 잡는다. 주 필드가 이미 서버 값이면 주 필드는 성공으로, 동반만 실패로 다룬다.
```ts
const serverNow = server != null ? formFromServer(server, optsRef.current.formRef.current) : null;
if (server != null && server[q.field] === q.value) {
  markSuccess(q.field);                             // 주 필드는 서 있다
  if (q.kind === 'toggle') showToggle(q.field, q.value, pickValues(serverNow!, q.shownCompanions)); // 동반만 서버 값으로
  continue;
}
setFailure(q.field, reason, LC_COMMIT_TEXT.failed, q.value);
if (q.kind === 'toggle') {
  if (serverNow) showToggle(q.field, serverNow[q.field], pickValues(serverNow, q.shownCompanions));
  else revertToggle(q);
}
```
`failInflight` 의 되돌림도 같은 원칙(서버 있으면 서버 값)으로 맞추는 것을 검토한다.

### GC-WR-03: D-02 전반(마지막 그룹 끔 + 마스터 OFF) 동반이 여전히 누른 순간 값으로 굳는다 — WR-03 과 같은 결의 낡은 동반이 끄는 방향에 남았다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:1001-1003`
**Issue:** 켜는 방향은 `(base) => …` 함수로 바뀌어 꺼내는 순간의 서버 값으로 다시 계산된다. 끄는 방향은 그대로다. `lastGroup` 를 **누른 순간의 폼 표시값** `f` 로 판정하고, 정적 `{ buyEnabled: false }` 를 싣는다. 다음 순서가 가능하다.
1. 앞 확정이 in-flight 인 동안 「선매수 끔」이 대기에 선다. 폼상 다른 그룹이 꺼져 있으므로 동반에 마스터 OFF 가 들어간다.
2. 그사이 다른 단말 · WinForms 가 후매수를 켜고, 그 에코가 온다.
3. 대기 건을 꺼낼 때 `base.postBuyEnabled === true` 인데도 마스터 OFF 가 그대로 나간다.

서버 D-32 는 세 그룹 에코를 접는다. 결과적으로 다른 곳에서 방금 무장한 후매수가 사람 손 없이 무장 해제된다. D-02 는 「사람이 **마지막 켜진** 그룹을 끄면」 마스터도 끈다는 규칙인데, 꺼내는 시점에는 마지막이 아니다. 24-14 key-decision 은 「D-01 마스터 동반 모두 전송 시점 서버 값 기준」이라고 적었지만 D-02 는 대상에서 빠졌다.
**Fix:** 끄는 방향도 같은 함수 동반으로 바꾼다.
```ts
commitField(gate, false, 'toggle', (base) =>
  base.buyEnabled && BUY_GROUP_GATES.every((g) => g === gate || !base[g]) ? { buyEnabled: false } : {},
);
```
단, 누른 순간 판정에는 사람이 본 화면(낙관 표시 포함)이 반영돼야 한다. 즉시 경로에서는 `base` 가 서버 값이라, 같은 인스턴스에서 앞서 낙관 OFF 된 그룹이 아직 ON 으로 보일 수 있다. 그래서 즉시 경로는 `f`, 꺼낼 때는 `base` 로 판정하는 두 단계가 필요할 수 있다(예: 누른 순간 `f` 로 「마지막」이었을 때만 함수를 넘기고, 함수 안에서 `base` 로 재확인). 회귀 테스트는 WR-03 테스트와 같은 모양으로 추가한다.

### GC-WR-04: 자동 체크 로그 대기가 한 칸이라, 선매수 켬이 in-flight 인 동안 추가매수 · 후매수를 켜면 선매수 자동 체크 로그가 사라진다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:924-930, 985-998, 1014-1030`
**Issue:** `autoCheckRef` 와 `pendingAutoCheckRef` 는 폼 전체에 한 칸이다. 켜는 핸들러는 누를 때마다 `autoCheckRef.current = null` 을 두고 `pendingAutoCheckRef` 를 덮는다. 켠 그룹이 후매수이거나 결과가 `blocked`/`disconnected` 면 `null` 로 덮는다. 따라서 다음 순서가 가능하다.
1. 선매수 켬(sent) → pending `{preBuyEnabled}`.
2. 에코 전에 추가매수 켬(queued, D-35) → pending `{extraBuyEnabled}`. 후매수 켬이면 `null`.
3. 선매수 성공 에코 → `lastSuccessField('preBuyEnabled') !== pending.gate` → 로그 없음.
4. 추가매수를 꺼낼 때 자동 체크를 다시 계산하면, 선매수가 이미 6체크를 켰으므로 `turnedOn`/`skipped` 가 비고 줄도 `null` 이다.

결국 매도 · 취소 게이트 6개를 실제로 무장하고, 상한가로 매도 가격까지 채운 제출에 대해 **로그가 한 줄도 남지 않는다.** D-06 은 토스트 · 탭 이동 없이 「전략 로그 한 줄만」을 유일한 알림으로 정했다. 생략 사유(`error` 레벨 「켜지 않음: …」)가 조용히 사라지는 것은 「무로그 fail-safe 금지」 규율에도 어긋난다. 한 칸 설계는 24-07 부터 있었다. 하지만 D-35(24-17)로 트리거가 둘이 되면서 일상 조작(선매수 켜고 바로 추가매수 켜기)으로 재현된다.
**Fix:** 대기 로그를 그룹별로 둔다. 계산 결과도 그룹별로 기록한다.
```ts
const autoCheckRef = useRef<Partial<Record<AutoCheckGate, GroupAutoCheckResult>>>({});
const pendingAutoCheckRef = useRef<Partial<Record<AutoCheckGate, number /* seqAtSend */>>>({});
// 켤 때: autoCheckRef.current[autoGate] = auto;  pendingAutoCheckRef.current[autoGate] = successSeqRef.current
// 후매수 · 막힘 · 끊김은 자기 게이트 슬롯만 지운다(다른 그룹 슬롯을 건드리지 않는다).
// 이펙트: lastSuccessField 가 슬롯 키이고 seq 가 바뀌었을 때 그 슬롯만 소비한다.
```
회귀 테스트는 「선매수 켬 in-flight → 추가매수 켬 → 선매수 에코 → 선매수 자동 체크 줄 존재」로 추가한다.

## Info

### GC-IN-01: 서버 접힘 하강 전이 판정이 구서버 에코를 배제하지 않는다 — 폼 주석의 「구서버는 하강 전이가 생기지 않는다」는 전환 에코에서 거짓이다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:387-393, 1049`
**Issue:** `isServerFoldEdge` 는 `buy3Schema` 를 보지 않는다. 직전 에코가 buy3(그룹 ON)이고 이번 에코가 구서버(신필드 부재 → 그룹 0, 마스터 ON)인 전환에서는 true 가 된다. 이 경우 가드 ⑤ 를 통과하면 `cause: 'serverFold'` 로 마스터 OFF 가 구서버에 나간다. 구서버에서는 이것이 실제 매수 감시 해제다. 로그에도 「서버가 매수 그룹 해제」라는 거짓 문장이 선다. 보통은 gh-trade 롤백 시 relay 세션이 `ready` 를 잃어 `disabled` 가 기준선을 비우므로 막힌다. 다만 그 보장은 이 파일 밖에 있다.
**Fix:** `isServerFoldEdge` 에 `!isLegacyBuySchema(prev) && !isLegacyBuySchema(next)` 를 더하고, `:1049` 주석을 사실대로 고친다.

### GC-IN-02: 비가시 유예(가드 ⑥)는 모든 인스턴스가 숨어 있으면 효과가 없다 — 승인된 잔여 한계 문구에 이 경우가 없다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:402-407, 1051-1055`
**Issue:** 데스크톱 탭과 앱이 모두 백그라운드면, 모든 인스턴스가 똑같이 1.5초 뒤에 가드 ② 를 재확인한다. 그래서 여전히 N건이 거의 동시에 나간다. 코드 주석과 24-15 부록의 「남는 한계」는 「동시에 **보이는** 두 인스턴스」만 적었다. 사용자가 승인한 한계의 범위가 실제보다 좁게 기록된 셈이다. D-34 서버에서는 닿지 않는 백스톱이라 영향은 작다.
**Fix:** 잔여 한계 문구에 「모든 인스턴스가 숨은 경우 N건」을 추가한다. 유예에 인스턴스별 지터(예: 1.5초 + 0~1초 난수)를 더하면 통상 1건으로 줄어든다.

### GC-IN-03: 대기 꺼내기에서 no-op 으로 성공 처리된 켜기도 자동 체크 로그(「켜지 않음: …」)를 남길 수 있다 — D-08 위반

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:547-551` · `webapp/src/components/trading/limit-chaser-form.tsx:1014-1030`
**Issue:** 대기 중인 추가매수 켬을 꺼낼 때 서버가 이미 추가매수 ON 이면(다른 단말이 켰다) `sameAsServer` 가 참이 된다. 이때 전송 0 인 채로 `markSuccess` 된다. 이 no-op 판정 중에 동반 함수가 불려 `autoCheckRef` 가 채워진다. `turnedOn` 은 비었지만 `skipped` 는 있을 수 있다(예: 매도 매수잔량 0). 그러면 로그 이펙트가 `error` 레벨 「추가매수 자동 체크 — 켜지 않음: …」 한 줄을 쓴다. 이 폼은 아무것도 보내지 않았고 켠 주체는 다른 단말이므로, D-08 「다른 단말 변경으로는 나가지 않는다」와 어긋난다.
**Fix:** 로그 대기는 실제 전송(`sendNow` 가 `'sent'`)된 확정에만 건다. 또는 성공 시 `autoCheckRef` 의 `turnedOn.length === 0 && priceFilled === null` 이면 줄을 쓰지 않는다.

### GC-IN-04: IN-07 잔여 — P24-3 · P24-4 · P24-6 의 고정 대기가 남았고, P24-4 관찰 창(1.5초)이 새 유예 상수(1.5초)와 같다

**File:** `webapp/e2e/specs/trading-workbench.spec.ts:2484, 2551, 2561, 2572, 2585, 2700`
**Issue:** 24-10 처리표대로 이월된 항목이다. 다만 24-15 로 `LC_FOLD_HIDDEN_DEFER_MS = 1_500` 이 생겨, P24-4 「정확히 1건」을 1.5초 창으로 재는 단언이 유예 값과 정확히 겹친다. 헤드리스 실행 환경이 `visibilityState === 'hidden'` 을 보고하는 경우(일부 CI · 창 최소화), 자동 끔이 창의 경계에서 나가 결과가 흔들린다.
**Fix:** 「1건」 단언은 `waitForSetAtGateway(relay, beforeB + 1)` 같은 사건 대기로 바꾼다. 「0건」 단언은 사건(로그 줄 · 에코 반영) 뒤에, 창을 `LC_FOLD_HIDDEN_DEFER_MS` 보다 넉넉히 잡거나 상수를 import 해 묶는다.

### GC-IN-05: IN-01 잔여 — 훅 주석 「게이트 4종 밖」

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:676`
**Issue:** `LC_GATE_FIELDS` 는 6개(마스터 · 선 · 추가 · 후매수 · 매도 · 매수취소)인데, 미등록 로컬 반영 주석이 「게이트 4종 밖」이라고 적는다. 같은 파일의 `:149`, `:190` 에 나오는 「게이트 4종」은 **삭제 판정** 4종(`isDeleteIntent`)이라 맞는 표현이다. 이 줄만 등록 필드를 가리키면서 옛 숫자를 쓴다.
**Fix:** 「`LC_GATE_FIELDS` 밖」으로 바꾼다.

---

_Reviewed: 2026-09-28T07:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
