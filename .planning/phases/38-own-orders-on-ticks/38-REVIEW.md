---
phase: 38-own-orders-on-ticks
reviewed: 2026-11-03T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/tick-api.ts
  - packages/shared/src/ticks/index.ts
  - packages/shared/src/ticks/own-fills.ts
  - packages/shared/src/ticks/record-index.ts
  - scripts/tick-oracle/gen-own-fixtures.mjs
  - server/src/routes/ticks.ts
  - server/src/services/ticks.ts
  - supabase/migrations/20261104100000_tick_own_for_user.sql
  - webapp/src/components/ticks/tick-chart.tsx
  - webapp/src/components/ticks/tick-header.tsx
  - webapp/src/components/ticks/tick-msg-list.tsx
  - webapp/src/components/ticks/tick-order-card.tsx
  - webapp/src/components/ticks/tick-own-section.tsx
  - webapp/src/components/ticks/tick-viewer-page.tsx
  - webapp/src/components/ticks/tick-viewer.tsx
  - webapp/src/lib/ticks/msg-rows.ts
  - webapp/src/lib/ticks/own-model.ts
  - webapp/src/lib/ticks/tick-api.ts
  - webapp/src/lib/ticks/tick-chart-tip.ts
  - webapp/src/lib/ticks/tick-chart.ts
  - webapp/src/lib/ticks/use-own-nav.ts
  - webapp/src/lib/ticks/use-tick-cursor.ts
  - webapp/src/lib/ticks/use-tick-live.ts
  - webapp/src/lib/ticks/use-tick-own.ts
  - webapp/src/styles/globals.css
  - supabase/tests/tick_own.test.sql
  - server/tests/routes/ticks.test.ts
  - packages/shared/src/__tests__/ticks-own.test.ts
  - packages/shared/src/__tests__/ticks-own.golden.test.ts
  - webapp/src/lib/ticks/__tests__/own-model.test.ts
  - webapp/src/lib/ticks/__tests__/use-own-nav.test.tsx
  - webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx
  - webapp/e2e/fixtures/ticks.ts
  - webapp/e2e/specs/ticks-viewer.spec.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 38: 코드 리뷰 보고서

**Reviewed:** 2026-11-03
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

Phase 38 의 우리 주문 · 체결 경로 전체를 읽었다 — RPC `tick_own_for_user`(가시성 · 어드민 · 켜진 서버 거름) → `GET /api/ticks/own` → `useTickOwn` → `buildOwnModel`(shared `matchOwnFills` · `locateEvidence` · `anchorOf`) → 전문 목록 레일 · 주문 줄 · 짝 없음 줄 · 카드 섹션 · 「우리 주문」 탭 · 차트 ◆/○/◇ · 제목 줄 알약 · `[` `]` 키. 공유 파일(msg-rows · tick-msg-list · tick-order-card · use-tick-cursor)은 Phase 38 몫만 봤다.

**가시성 게이트(D-01 · D-03)는 새지 않는다.** 세 배열 모두 `JOIN dma_servers … AND s.enabled` 와 `(v_admin OR gateway|account_no = ANY(v_vis))` 를 같이 건다. 어드민 판정은 함수 안에서 `dma_app_access_map()` role 로 하고(인자 없음 · `requireAdmin` 과 같은 `app_users.role` 원천), REVOKE 는 PUBLIC/anon/authenticated 를 모두 명시했다. 서버는 네 배열의 모양을 검사하고 `no-store` 를 붙인다. 응답 어디에도 `dma_user_id` 는 없다.

결함은 짝짓기 결과를 **표시하고 다시 쓰는** 쪽에 모여 있다. 10/30 픽스처로 직접 재 보니 짝지은 체결 401건 중 **210건이 dt < 0** 인데, 카드는 이를 「+-37ms」 로 그린다(WR-01). 당일 경로에서는 저널이 틱보다 먼저 온 체결이 「대기」 가 되지 않고, 더 이른 같은 가격 A3 에 잘못 붙을 수 있다(WR-02). 짝짓기 · 근거 특정이 세션의 중복 A3 를 거르지 않는다(WR-03) — 단, 10/30 픽스처에는 중복이 0건이라 오라클 수치와는 충돌하지 않는다. 고른 우리 줄은 id 로 기억해 own 을 다시 받으면 다른 주문을 가리킬 수 있고(WR-04), 「최신 받기」 때 own 조회가 한 번만 실패해도 이미 받아 둔 우리 층이 통째로 사라진다(WR-05).

접수된 기존 항목(가격 판 밖 우리 점 미표시 · 차트 ◆ 클릭이 고른 줄을 풀지 않음 · 추정 꼬리말 k 의 범위)은 다시 올리지 않았다. IN-02 는 그 항목과 원인이 같지만 **다른 경로**(카드 · 표)다.

## Warnings

### WR-01: 카드 체결 줄이 음수 시각차를 「+-NNms」 로 그린다 — 짝지은 체결의 약 절반

**File:** `webapp/src/components/ticks/tick-own-section.tsx:227`
**Issue:** `dtMs = gw − A3 시각` 이고 짝 창은 [−200, +1500]ms 라 음수가 정상 값이다. 그런데 렌더는 `` ` +${Math.round(f.dtMs)}ms` `` 처럼 `+` 를 무조건 붙인다. 커밋된 10/30 픽스처를 shared dist 의 `matchOwnFills` 로 돌려 보니 음수 dt 가 키별 124 · 37 · 23 · 11 · 15건이었다. 짝 401건 중 210건(52%)이다. 이 체결들은 카드에 「13:00:00.250 100 +-37ms」 로 나온다. 카드 테스트(`tick-order-card.test.tsx:266` · `:282`)는 양수(+5 · +3)만 단언해 이 경로를 잡지 못한다.
**Fix:**
```tsx
const dt = Math.round(f.dtMs);
<span className="text-[var(--muted-fg)]">{` ${dt >= 0 ? '+' : '−'}${Math.abs(dt)}ms`}</span>
```
음수 dt(예: −37 → 「−37ms」) 단언 테스트를 하나 더한다.

### WR-02: 당일 끝자락 체결이 「대기」 가 아니라 더 이른 같은 가격 A3 에 잘못 짝지어진다

**File:** `webapp/src/lib/ticks/own-model.ts:278-279` (+ `packages/shared/src/ticks/own-fills.ts:99-124`)
**Issue:** 「대기(pending)」 판정은 `m.a3j < 0` 일 때만 한다(`m.a3j >= 0 ? 'matched' : live && … ? 'pending' : 'nofill'`). 머리 주석 ⑥ 이 말하듯 당일에는 저널이 틱보다 먼저 올 수 있다. 그런데 짝 창은 [g − 1500, g + 200] 이다. 진짜 A3 가 아직 세션에 없어도 1.5초 안에 **같은 가격 · 남은 수량이 충분한 A3** 가 있으면 그 A3 에 붙어 「matched」 가 된다. 상한가 추격 종목은 체결이 거의 다 같은 가격(상한가)이라 이런 A3 가 거의 늘 있다. 결과는 세 가지다. ① 틀린 행에 ◆ 칩 · 레일이 붙는다. ② 그 A3 의 남은 수량을 잘못 깎는다. ③ own 은 「최신 받기」 를 다시 누르기 전까지 다시 받지 않으므로(자동 타이머 없음) 틀린 짝이 다음 클릭까지 화면에 남는다.
**Fix:** 당일이면 짝 창이 세션 끝을 넘는 체결(`g + OWN_PENDING_GRACE_MS > lastRecvMs`)은 짝 결과와 관계없이 대기로 두고, 남은 수량도 깎지 않는다. 가장 단순하게는 그런 체결을 `matchOwnFills` 입력에서 빼고 대기로 만든다.
```ts
const open = (gw: number) => live && gw + OWN_PENDING_GRACE_MS > lastRecvMs;
const settledIdx = sorted.map((f, i) => (open(f.gw_time_ms) ? -1 : i)).filter((i) => i >= 0);
const settledMatches = matchOwnFills(index, a3, settledIdx.map((i) => toIn(sorted[i]!)));
// 대기 체결: a3j −1 · state 'pending' · slotOfFill 로 줄 자리
```
(`lastRecvMs` 계산을 짝짓기 앞으로 옮긴다.) 과거 격자(`live` false)의 결과 · 오라클 수치는 바뀌지 않는다.

### WR-03: 짝짓기 · 근거 특정이 중복 A3(같은 보드 · seq 재수신)를 거르지 않는다

**File:** `packages/shared/src/ticks/own-fills.ts:78-117`, `:238-246`, `:265-269`; `webapp/src/lib/ticks/own-model.ts:159-163`
**Issue:** 세션에는 `duplicates`(같은 보드 · seq 의 두 번째 이후 수신)가 있다. 차트(`tick-chart.ts:595`)는 이를 건너뛰고 전문 목록은 「중복」 칩을 단다. 그런데 `matchOwnFills` · `locateTradeEvidence` · `anchorOf` 는 `a3ColumnsOf` 의 모든 A3 를 쓴다. 중복 A3 는 체결 시각 tNs · 가격 · 수량이 원본과 같으므로 다음 일이 생긴다. ① 원본과 |dt| 가 같은 둘째 후보가 되어 늘 「추정 · 동가 후보 2」 가 붙는다. ② 원본의 남은 수량이 바닥나면 다음 우리 체결이 중복 행으로 넘어가 칩 · ◆ 가 두 행으로 갈린다. ③ 체결 근거 단건 판정이 `hits === 2` 가 되어 단건 대신 구간이나 「근거 없음」 으로 떨어진다. ④ 앵커(마지막 j)가 중복 행을 가리킨다. 10/30 픽스처 5종을 재 보니 중복이 0건이라 오라클(401/406 · 108 · 29/29 · 100/100)과는 충돌하지 않는다. 다만 중복이 있는 격자 · 당일 스트림에서는 위 결과가 그대로 나온다.
**Fix:** 짝짓기 · cum 색인에서 중복 A3 를 뺀다. shared 함수에 선택 인자 `skip?: Uint8Array`(rec → 1)를 두고 웹이 `session.duplicates` 를 넘긴다.
```ts
for (; p < n; p++) {
  const j = by[p]!;
  if (skip?.[a3.rec[j]!] === 1) continue;
  …
}
// cumIndexOf(a3, skip) 도 같은 조건
```
오라클 픽스처에는 중복이 없으므로 골든 수치는 그대로다. 중복 1건을 넣은 합성 케이스 테스트를 더한다.

### WR-04: 고른 우리 줄(`ownPick`)을 id 로 기억해서 own 을 다시 받으면 다른 주문 · 체결을 가리킬 수 있다

**File:** `webapp/src/components/ticks/tick-viewer.tsx:298-299` (+ `tick-msg-list.tsx` `ownSelPos` · `tick-order-card.tsx:61-65`)
**Issue:** `ownPick = { sel: { kind, id }, rec }` 의 `id` 는 `buildOwnModel` 이 정렬한 뒤 매긴 순번이다(주문 = 주문 시각순 · 체결 = gw 순). 「최신 받기」 로 own 이 바뀌면 순번이 밀릴 수 있다. 늦게 들어온 다른 게이트웨이 저널에 더 이른 gw 체결이 끼거나, 체결만 있던 주문(`sortMs` = 첫 체결)에 이벤트가 붙는 경우다. 커서가 그대로 `pick.rec` 이면 `ownSel` 이 살아 있어 카드 섹션 · 목록 강조 · 알약 k 가 **다른 주문**을 보인다. 같은 파일의 되돌아가기 알약(`ownBack`)은 바로 이 문제 때문에 `gateway|order_no` 키로 기억한다(:342 주석). 선택 쪽만 그렇게 하지 않았다.
**Fix:** 선택도 안정 키로 기억하고 렌더 때 현재 모델 id 로 푼다.
```ts
type OwnPickKey = { kind: 'order'; key: string } | { kind: 'fill'; key: string /* gateway|seq */ };
const ownSel = ownPick && ownPick.rec === rec ? resolvePick(ownModel, ownPick.sel) : null;
```
(또는 `ownModel` 이 바뀌면 `ownPick` 을 비운다 — 더 단순하지만 선택이 풀린다.)

### WR-05: 「최신 받기」 때 own 조회가 한 번 실패하면 받아 둔 우리 층이 통째로 사라진다

**File:** `webapp/src/lib/ticks/use-tick-own.ts:85-89`, `:96-101`
**Issue:** 머리 주석 ⑤ 는 같은 종목을 다시 받는 동안 직전 결과를 유지한다고 하고, 실제로 `loading` 상태에서는 유지한다. 그런데 실패하면 `setSettled({ key: k, reqKey: rk, own: null, ok: false })` 로 직전 결과를 덮는다. 당일에 네트워크가 잠깐 끊기거나 5xx 가 한 번 나면 레일 · 칩 · 주문 줄 · 카드 섹션 · 「우리 주문」 탭이 모두 사라진다(`TickSidePane` 도 탭 없는 37 화면으로 돌아간다). 다시 누르기 전까지 돌아오지 않는다. 처음 열 때 실패하면 「우리 층 없음」 이 맞지만, 이미 받은 데이터를 일시 오류로 버리는 것은 데이터 손실이다.
**Fix:** 같은 종목 키에서 다시 받다가 실패하면 직전 `own` 을 지키고 상태만 `error` 로 둔다.
```ts
(e) => {
  if (!current) return;
  warnOf(e);
  setSettled((prev) => ({ key: k, reqKey: rk, own: prev?.key === k ? prev.own : null, ok: false }));
}
```
`use-tick-own.test.tsx` 에 「성공 → refreshKey+1 실패 → own 유지」 케이스를 더한다.

## Info

### IN-01: 클라 재정렬 키가 RPC 정렬(「차감 순서의 정본」)과 다르다

**File:** `webapp/src/lib/ticks/own-model.ts:148-158` · `supabase/migrations/20261104100000_tick_own_for_user.sql:89` · `packages/shared/src/tick-api.ts:201-202`
**Issue:** RPC 는 `ORDER BY j.gw_time(µs), gateway, seq` 로 내고, 계약 주석은 이 순서를 「남은 수량 차감 순서의 정본 — 바꾸지 마라」 라고 한다. 그런데 `buildOwnModel` 은 `gw_time_ms`(ms 절사), gateway, seq 로 다시 정렬하고 주석 ② 에 「RPC 정렬과 같은 키」 라고 적었다. 같은 ms 안에 서로 다른 게이트웨이 체결이 있으면 µs 순서 대신 게이트웨이 이름순으로 바뀐다. 그러면 남은 수량 차감 순서가 갈린다(오라클 생성기 `cmpRow` 는 클라와 같은 ms 키).
**Fix:** 둘 중 하나로 맞춘다. RPC 정렬을 `(gw_time_ms, gateway, seq)` 로 바꾸거나, 클라가 응답 순서를 그대로 쓰고(재정렬 제거) 주석 · 계약을 정리한다.

### IN-02: 카드 「보기 ›」 · 「우리 주문」 표 행 클릭 · `onOwnOrder` 폴백도 고른 줄을 풀지 않는다

**File:** `webapp/src/components/ticks/tick-viewer.tsx:208-222`, `:323-329`
**Issue:** 38-08 은 `[` `]` 이동에서 같은 결함(짝 없음 줄의 기준 rec 가 다음 대상 행이면 선택이 남음)을 `navJump`(`setOwnPick(null)` + 이동)로 고쳤다. 그러나 카드 섹션 · 「우리 주문」 탭 표 · `onOwnOrder` 의 「첫 짝 체결」 폴백은 아직 `cursor.jumpToRec` 를 그대로 쓴다. 목표 rec 가 고른 줄의 기준 rec 와 같으면 A3 행이 아니라 줄 선택이 계속 보인다. 접수된 「차트 ◆ 클릭」 항목과 원인이 같지만 경로가 다르다.
**Fix:** `TickSidePane` 에 내리는 `onJump` · `onOwnJump` 와 `onOwnOrder` 폴백에 `navJump` 를 쓴다.

### IN-03: `useTickOwn` 모양 검사가 `events` · `orders` 를 보지 않는다

**File:** `webapp/src/lib/ticks/use-tick-own.ts:78`
**Issue:** `fills` · `servers` 만 배열인지 확인한다. 그런데 `buildOwnModel` 은 `own.events` · `own.orders` 를 바로 순회한다(`own-model.ts:176` · `:190`). 둘 중 하나가 없는 응답(목 · 계약 이탈)이 오면 렌더 중 `useMemo` 에서 예외가 나 뷰어 전체가 깨진다. 이는 「own 이 실패해도 뷰어는 그대로」(Pitfall 5) 계약과 어긋난다. 현재 서버는 네 배열을 모두 검사하므로 운영 경로에서는 일어나지 않는다.
**Fix:** `!Array.isArray(own.events) || !Array.isArray(own.orders)` 도 `shape` 실패로 처리한다.

### IN-04: 근거 종류 낱말 「체결 구간」 만 shared 라벨 밖에 하드코딩

**File:** `webapp/src/lib/ticks/own-model.ts:345`
**Issue:** D-05 · 25 D-09/D-10 은 낱말을 `strategy-event-labels` · `strategy-event-text` 정본에서만 쓰라고 한다. 호가 · 체결 · 체결통보는 `EVIDENCE_KIND_LABELS` 에서 오지만 `'체결 구간'` 만 웹 모델 안 리터럴이다. 같은 낱말이 `tick-own-section.tsx:152` 에도 따로 있다.
**Fix:** shared 에 `EVIDENCE_RANGE_LABEL = "체결 구간"` 을 두고 두 곳이 import 한다.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
