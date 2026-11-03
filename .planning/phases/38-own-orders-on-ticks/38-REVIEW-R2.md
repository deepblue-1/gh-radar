---
phase: 38-own-orders-on-ticks
reviewed: 2026-11-04T04:10:00+09:00
depth: standard
files_reviewed: 11
files_reviewed_list:
  - packages/shared/src/__tests__/ticks-own.golden.test.ts
  - packages/shared/src/__tests__/ticks-own.test.ts
  - packages/shared/src/ticks/own-fills.ts
  - webapp/src/components/ticks/__tests__/tick-order-card.test.tsx
  - webapp/src/components/ticks/tick-own-section.tsx
  - webapp/src/components/ticks/tick-viewer.tsx
  - webapp/src/lib/ticks/__tests__/own-model.test.ts
  - webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts
  - webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx
  - webapp/src/lib/ticks/own-model.ts
  - webapp/src/lib/ticks/use-tick-own.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 38: 코드 리뷰 보고서 — 2라운드(R2 · 수정 5건 재검토)

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

`9cbd3ad9..HEAD` 의 수정 커밋 5개(65c012c2 · 8a4e62fa · 0dbf63a2 · 95b3b4c2 · 633af896)를 다시 읽었다. 고친 함수가 부르는 쪽(`locateBookEvidence` · `duplicatesOf` · `appendTickBytes` · `useOwnNav` · `TickMsgList` 의 `ownSelPos`)과 원천 계약(`tick_own_for_user` · `dma_journal_events` PK)도 함께 따라갔다. 의심 두 건은 합성 세션 임시 테스트로 직접 재현했다. 임시 파일은 지웠고 작업 트리에 남은 것은 없다. 기존 대상 테스트(own-model · use-tick-own · tick-order-card 54건)는 통과한다.

수정마다 원 항목이 닫혔는지 판정했다.

| 원 항목 | 판정 | 근거 |
|---|---|---|
| WR-01 음수 dt 부호 | **닫힘** | `dtText` 는 짝 있는 체결에서만 부른다(`matched` 분기). NaN 경로는 없다. −0 은 「+0ms」 로 나온다. |
| WR-02 당일 끝자락 오짝 | **닫힘 · 대신 새 퇴행** | 오짝은 사라졌다. 그러나 진짜 A3 가 이미 세션에 있는 체결도 「대기」 로 내린다(아래 WR-02). |
| WR-03 중복 A3 거르기 | **일부만 닫힘** | A3 경로(짝 · cum 색인 · 구간 · 앵커)는 닫혔다. 호가 근거(ev_kind 1 · B6)는 여전히 중복 행을 고른다(아래 WR-01). |
| WR-04 고른 줄 안정 키 | **닫힘** | 키 → id 풀이가 렌더 때 돈다. 짝이 붙으면 선택이 풀린다. 남은 점은 체결 키 유일성(IN-01)과 뷰어 단위 테스트 부재(IN-03)다. |
| WR-05 다시 받기 실패 | **닫힘 · 대신 조용한 낡음** | 데이터 손실은 없어졌다. 그러나 `status` 를 읽는 곳이 없다. 그래서 낡은 우리 층이 새 세션 위에 아무 표시 없이 남는다(아래 WR-03). |

## Warnings

### WR-01: 호가 근거(ev_kind 1)는 여전히 중복 B6 를 근거 행으로 고른다 — 원 WR-03 이 절반만 닫혔다

**File:** `packages/shared/src/ticks/own-fills.ts:209-229`, `:243-246`; `webapp/src/lib/ticks/own-model.ts:9`, `:371-386`
**Issue:** 수정은 `skip` 을 `matchOwnFills` · `cumIndexOf` · `locateTradeEvidence` 에만 넘겼다. `locateEvidence` 의 `evKind === 1` 분기는 `locateBookEvidence(buf, index, recvOrder, ev)` 를 `skip` 없이 부른다. `locateBookEvidence` 는 창 [g − 3000, g + 50] 안에서 **마지막** 일치를 고른다(`found = rec` 덮어쓰기). 세션 `duplicatesOf` 는 B6 도 같은 보드 · seq 기준으로 둘째 이후 수신을 1로 표시한다. 재수신 사본은 원본보다 늦게 오므로, 창 안에 들어오면 늘 사본이 근거가 된다. 합성 세션으로 재현했다(B6 seq 700 을 .100 · .140 에 두 번 받고 이벤트 gw .150). 결과는 `duplicates = [0, 1, 0]` · `evidence = {kind:'b6', rec: 1}` 로, 사본 행이 근거가 됐다.
결과는 세 가지다. ① 레일 ○ 와 `ordersOfEvidenceRec` 가 「중복」 칩이 붙은 행에 달린다. ② 카드 「근거 호가 · 보기 ›」 가 사본 행으로 뛴다. ③ 차트는 중복을 건너뛰므로(`tick-chart.ts:595`) 목록과 차트의 근거 자리가 갈린다. 호가 근거는 오라클에서도 가장 흔한 근거 종류다(29/29). 게다가 `own-model.ts:9` 머리 주석은 「짝짓기 · 근거 · 앵커 모두 duplicates 를 뺀다」 고 적고 있어 실제 동작과 다르다. 10/30 픽스처는 중복이 0건이라 골든으로는 드러나지 않는다.
**Fix:**
```ts
function locateBookEvidence(buf, index, recvOrder, ev, skip?: Uint8Array): number {
  …
  if (index.tag[rec] !== TAG_CODE.B6 || index.ok[rec] !== 1) continue;
  if (skip !== undefined && skip[rec] === 1) continue; // 재수신 사본은 근거가 아니다
  …
}
// locateEvidence: const rec = locateBookEvidence(buf, index, recvOrder, ev, skip);
```
shared 합성 테스트에 「같은 B6 두 번 수신 → skip 이 있으면 원본 rec」 을 더한다. 웹 own-model 테스트에도 같은 케이스(`evidenceRec === 0`)를 더한다.

### WR-02: 당일 대기 판정이 짝을 찾을 수 있는 체결까지 「전문 아직 안 옴」 으로 내린다 — 장 마감 · 한산한 종목에서는 영구

**File:** `webapp/src/lib/ticks/own-model.ts:195-197`, `:321`; `webapp/src/components/ticks/tick-own-section.tsx:245`
**Issue:** 수정 전 대기는 「짝을 못 찾은 체결」 에만 붙었다. 수정 후 `open(gw) = live && gw + 1200 > lastRecvMs` 는 짝짓기에 **들어가기 전에** 체결을 뺀다. 그래서 진짜 A3 가 이미 세션에 있어도 세션 마지막 수신이 체결 뒤 1.2초 안이면 대기다. 합성 재현에서는 A3 .100 · 마지막 수신 B6 .400 · 우리 체결 gw .105 로 두었다. live 결과는 `pending` · rec −1 이었고, 같은 세션 · 같은 own 을 과거 격자 경로로 돌리면 `matched` · rec 0 이었다.
이 상태는 세션이 1.2초 넘게 더 자라야 풀린다. 그런데 세션은 「최신 받기」 를 누를 때만 자라고, 다음 두 경우에는 아예 더 자라지 않는다.
- **장 마감 뒤 당일 화면:** 그날 마지막 레코드 1.2초 안에 난 우리 체결(종가 · 시간외 단일가 · NXT 20:00 직전 체결)이 오늘 날짜로 보는 동안 계속 「전문 아직 안 옴」 이다. ◆ 칩 · 차트 점 · 레일도 없다. 날짜가 지나 격자 경로로 열 때까지 그렇다.
- **한산한 종목 · 정적 구간:** 우리 체결이 마지막 거래이고 그 뒤 전문이 끊기면, 다음 전문이 올 때까지 대기다.

카드 문구 「전문 아직 안 옴」 은 이 경우 사실과 다르다. 그 A3 는 바로 위 목록에 있다. 원 WR-02 의 오짝을 막는 대가로, 맞는 짝을 놓치는 경우가 생겼다.
**Fix:** 대기 기준을 「마지막 레코드 수신 시각」 이 아니라 「스트림이 이 시각까지 다 왔다고 알 수 있는 시각」 으로 바꾼다. 예를 들면 `buildOwnModel(…, { live, asOfMs })` 로 넘기고 `cutoff = max(lastRecvMs, asOfMs)` 를 쓴다. `asOfMs` 는 tickgw 응답의 서버 시각(헤더 · `Date`)으로 정한다. 브라우저 시계는 게이트웨이 시계와 어긋날 수 있다. 서버 시각이 없으면 최소한 장 마감(KRX 18:00 · NXT 20:00 KST)을 지난 세션은 `live` 대기를 끈다. 더해서 open 체결이라도 `[g − 1500, g + 200]` 창 전체가 cutoff 안이면 settled 로 둔다. 이 기준으로 합성 테스트 「A3 있음 · 마지막 수신 +300ms · asOf +2s → matched」 를 더한다.

### WR-03: 다시 받기 실패 뒤 낡은 우리 층이 새 세션 위에 표시 없이 남는다 — `status` 를 읽는 곳이 없다

**File:** `webapp/src/lib/ticks/use-tick-own.ts:91`, `:101`; `webapp/src/components/ticks/tick-viewer.tsx:299-304`
**Issue:** WR-05 수정은 실패 때 직전 `own` 을 지키고 `ok: false`(status `'error'`)를 남긴다. 그런데 `useTickOwn` 의 소비처는 `tick-viewer.tsx:299` 하나다. 거기서도 `own.own` 만 읽고 `own.status` 는 어디서도 보지 않는다(`grep` 0건). 「최신 받기」 한 번은 live 증분과 own 재조회를 같이 올린다(`tick-viewer-page.tsx:345-347`). 그래서 own 만 실패하면 세션은 새 틱까지 자라는데, 우리 층은 그 전 시점에 멈춘다. 그 사이에 난 우리 체결은 새 A3 행에 칩 · ◆ 가 없다. 「우리 주문」 탭 주문 수도 옛 값이다. 사용자는 「안 채워졌다」 와 「못 받았다」 를 구분할 수 없다. 단서는 콘솔 경고 한 줄뿐이다. 수정 전에는 층이 통째로 사라져서 적어도 이상하다는 신호는 있었다. 지금은 그럴듯한 낡은 데이터가 조용히 남는다.
관련 메모: 같은 종목을 다시 받다가 응답 모양 검사(`shape`)에 실패하면 여전히 `own: null` 로 층을 지운다(`use-tick-own.ts:80-83`). 수정 보고서가 의도적으로 범위에서 뺀 부분이고 IN-03(38-REVIEW)과 이어진다. 다만 실패 처리가 두 갈래로 나뉜 상태다.
**Fix:** `status === 'error' && own !== null` 일 때 낡음을 보인다. 예를 들어 「우리 주문」 탭 머리 · 제목 줄 알약 옆에 「우리 체결 갱신 실패 · 직전 값」 작은 표시를 단다(자동 재시도 없음 — CLAUDE.md 공식 API 기준 4 · 호출량 불변). 뷰어 테스트로 「성공 → 실패 → 표시 노출」 을 잠근다. `shape` 실패도 같은 규칙(같은 종목이면 직전 own 유지)으로 맞출지는 IN-03 수정 때 함께 정한다.

## Info

### IN-01: 체결 안정 키 `gateway|seq` 는 하루 안에서도 유일하지 않을 수 있다 — 원천 PK 는 `(gateway, journal_epoch, seq)`

**File:** `webapp/src/lib/ticks/own-model.ts:324`, `:136`; `supabase/migrations/20260924200000_dma_journal_tables.sql:64`, `:90`; `supabase/migrations/20261104100000_tick_own_for_user.sql:81-89`
**Issue:** `dma_journal_events` 의 PK 는 `(gateway, journal_epoch, seq)` 다. `journal_epoch` 는 「저널 저장소 신원(초기화되면 바뀐다)」 이다. 장중에 게이트웨이 저널이 초기화되면 같은 거래일 · 같은 게이트웨이에서 seq 가 다시 1부터 쓰인다. `tick_own_for_user` 는 `journal_epoch` 를 내보내지 않는다. 그래서 같은 종목의 두 체결이 같은 `gateway|seq` 를 가질 수 있다. 그러면 `resolveOwnSel` 의 `fills.find` 는 첫 번째 것으로 풀어 다른 체결 줄을 고를 수 있다. 같은 키는 정렬 동률 깨기(`x.seq - y.seq`)에도 쓰인다. 드문 경우라 Info 로 둔다.
**Fix:** RPC fills 에 `journal_epoch`(또는 그 짧은 해시)를 더해 키를 `gateway|epoch|seq` 로 만든다. 계약을 바꾸지 않으려면 `gateway|order_no|gw_time_ms|seq` 처럼 충돌하기 더 어려운 합성 키를 쓴다.

### IN-02: 골든 「skip 을 넘겨도 오라클 그대로」 블록은 구조상 실패할 수 없다

**File:** `packages/shared/src/__tests__/ticks-own.golden.test.ts:322-363`
**Issue:** 픽스처 중복이 0건이라 `skip` 이 전부 0이다(`:341` 이 그것을 단언한다). 모든 거름 조건이 `skip[…] === 1` 이므로 「skip 있음 == skip 없음」 은 동어반복이다. 또 `skipOf` 는 웹 `duplicatesOf`(`tick-session.ts:248` — 수신순 · 전 태그 · `seq < 0` · `NO_BOARD` 제외)를 쓰지 않는다. A3 열 순서로 따로 다시 구현했다. 그래서 「웹 세션의 duplicates 가 이 픽스처에서 0」 도 증명하지 못한다. 실제 의미를 지닌 단언은 `:341` 하나다.
**Fix:** 블록을 「픽스처 A3 중복 0건」 단언 하나로 줄인다. 아니면 웹 `buildTickSession(...).duplicates` 로 실제 경로를 돌린다(shared 테스트라 웹을 import 할 수 없다면 합성 테스트로 충분하다 — 이미 있다).

### IN-03: WR-04 배선(뷰어의 키 기억 · 렌더 때 풀기)을 덮는 테스트가 없고, 기준 rec 는 다시 풀지 않는다

**File:** `webapp/src/components/ticks/tick-viewer.tsx:308-321`
**Issue:** 테스트는 `ownSelKeyOf` · `resolveOwnSel` 순수 함수만 본다. 다음 배선은 어느 테스트도 렌더하지 않는다. `ownPick` 이 키를 기억하는 것, `useMemo([ownPick, rec, ownModel])` 로 푸는 것, `onOwnSelect` 가 클로저의 `ownModel` 로 id → 키를 바꾸는 것이다. 또 `ownPick.rec`(줄의 기준 rec)는 고를 때 값 그대로 남는다. 다시 받아 그 줄의 자리가 옮겨지면(예: 보조 주문 행만 있던 주문에 이벤트가 붙어 `gwMs` · 슬롯이 바뀜) 문제가 생긴다. 커서는 옛 기준 rec 에 있는데 목록 강조(`ownSelPos`)와 `[` `]` 현재 자리(`currentPosOf`)는 새 자리의 줄을 가리킨다. 드문 경로라 Info 로 둔다.
**Fix:** `tick-viewer-live.test.tsx` 에 「줄 선택 → ownRefreshKey+1 로 id 가 밀린 own → 같은 주문이 강조」 렌더 테스트를 하나 더한다. 기준 rec 는 렌더 때 `ownLineRec(rows, pos)` 로 다시 구한다. 기억한 rec 와 다르면 선택을 풀거나 새 rec 로 옮긴다.

---

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
