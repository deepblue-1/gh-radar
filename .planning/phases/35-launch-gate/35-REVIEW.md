---
phase: 35-launch-gate
reviewed: 2026-10-31T15:43:48Z
depth: standard
files_reviewed: 71
files_reviewed_list:
  - packages/shared/src/__tests__/admin.test.ts
  - packages/shared/src/__tests__/launch-plan.test.ts
  - packages/shared/src/__tests__/launch.test.ts
  - packages/shared/src/__tests__/strategy-event-labels.test.ts
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - packages/shared/src/launch-plan.ts
  - packages/shared/src/launch.ts
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/strategy-event.ts
  - relay/src/admin/admin-api.ts
  - relay/src/admin/admin-conn.ts
  - relay/src/admin/launch-plan.ts
  - relay/src/admin/types.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/tools/launch-backfill.ts
  - relay/tests/admin-api.test.ts
  - relay/tests/admin-conn.test.ts
  - relay/tests/admin-launch-plan.test.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/hub.test.ts
  - relay/tests/launch-backfill.test.ts
  - scripts/launch-backfill.sh
  - scripts/launch-backfill.ts
  - server/src/app.ts
  - server/src/routes/admin-launch.ts
  - server/src/schemas/admin-launch.ts
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - server/tests/fixtures/fake-relay-admin.ts
  - server/tests/routes/admin-launch.test.ts
  - supabase/migrations/20261027200000_launch_gate.sql
  - supabase/migrations/20261027200100_launch_gate_apply.sql
  - supabase/migrations/20261028200000_launch_project_mapping.sql
  - supabase/migrations/20261028200100_launch_plan_changes.sql
  - supabase/tests/launch_gate.test.sql
  - supabase/tests/launch_gate_apply.test.sql
  - supabase/tests/launch_plan_changes.test.sql
  - supabase/tests/launch_project_mapping.test.sql
  - webapp/e2e/fixtures/launch.ts
  - webapp/e2e/specs/admin-launch.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/src/app/admin/launch/page.tsx
  - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
  - webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx
  - webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx
  - webapp/src/components/admin/launch-client.tsx
  - webapp/src/components/admin/launch-gate-chart.tsx
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/launch-orders-tab.tsx
  - webapp/src/components/admin/launch-plan-bar.tsx
  - webapp/src/components/admin/launch-plan-editor.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/lib/__tests__/launch-format.test.ts
  - webapp/src/lib/__tests__/launch-map.test.ts
  - webapp/src/lib/__tests__/launch-plan-view.test.ts
  - webapp/src/lib/launch-api.ts
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/launch-map.ts
  - webapp/src/lib/launch-plan-view.ts
  - webapp/src/styles/__tests__/tds-tokens.test.ts
  - webapp/src/styles/globals.css
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-10-31T15:43:48Z
**Depth:** standard
**Files Reviewed:** 71
**Status:** issues_found

## Summary

Phase 35(발사 경계 지도 어드민 + 범위 7 발사 계획 어드민)의 DB 마이그레이션 4개 · shared 계약 · relay(op 8/9 · 94 · `LaunchPlanService` · 백필 도구) · server(`/api/admin/launch/*`) · webapp(주문 내역 · 경계 지도 · 계획 편집)을 standard 깊이로 검토했다. 사전 존재 파일(relay/src/index.ts · server/src/app.ts · app-sidebar.tsx · globals.css · subscription-hub.ts · envelope.ts)은 `1b2b7035..HEAD` hunk 만 봤다. 그 hunk 중 Phase 36(예수금 · 비용률 · change_mask) 몫은 이 phase 범위 밖이라 형식만 확인했다.

후속 마이그레이션 `20261030120000` · `20261030200000`(PK 에 `fire_base`) · `20261030210000` 이 이 phase 의 SQL 일부를 재정의한다. 그래서 이미 거기서 고쳐진 항목(옛 PK 의 A KRX 재확인 회차 충돌 등)은 지적하지 않았다.

전반적으로 권한(RLS 정책 0 · REVOKE 3줄 · service_role 전용), 원문 적재와 해석의 실패 격리(서브블록 · `errors`), 사용자 경로에서 17·18 제외(apply rows · json 래퍼 · 주문 타임라인)는 탄탄하다. 문제가 모인 곳은 **발사 계획 저장의 결과 보고 경로**다.

- (CR-01) 서버에 실제로 적용됐을 수 있는 저장을 「미반영: 서버 연결 안 됨 / offline」 으로 확정 보고하고, 그 값이 영구 이력에 그대로 남는다.
- (WR-01) 저장은 ok 인데 재조회 값이 없으면 화면이 저장 전 계획을 계속 보인다.
- (WR-02) 백필 도구의 논리 키에 `fire_base` 가 빠져 있다. DB PK 가 바뀐 뒤 키가 어긋났다.

## Critical Issues

### CR-01: 적용됐을 수 있는 계획 저장을 「offline · 미반영」 으로 확정 보고하고 영구 이력에 그렇게 기록함

**File:** `relay/src/admin/launch-plan.ts:110-117` · `server/src/services/admin-launch.ts:229-247` · `server/src/routes/admin-launch.ts:124-137` · `webapp/src/components/admin/launch-map-tab.tsx:146` · `webapp/src/lib/launch-plan-view.ts:264-268`

**Issue:** 「요청이 서버에 닿지 않았다」 와 「요청은 나갔는데 응답을 못 받았다」 가 모두 `offline` 하나로 접힌다. 화면은 `offline` 을 「KB120 미반영: 서버 연결 안 됨」 이라는 **확정 미반영** 문장으로 보이고, 이력 표(D-29 · 영구 보관)에도 `outcome='offline'` 으로 남는다. 다음 세 경로에서는 op 8 이 gh-trade 에 이미 반영됐을 수 있다.

1. **relay:** op 8 을 보낸 직후 admin 연결이 끊기면 `AdminConn.#failAll` 이 비행 중 항목을 `{ kind: "offline" }` 으로 푼다(admin-conn.ts `#failAll`). `set()` 은 이를 그대로 `outcome: out.kind`(= offline)로 돌려준다(launch-plan.ts:117). 서울 엣지 주기 끊김처럼 실제로 관측되는 연결 끊김에서 일어난다.
2. **server:** `saveLaunchPlanViaRelay` 는 relay HTTP 타임아웃 · 연결 리셋 · 비200 을 모두 `status 0 → offline(RELAY_FAILED_MESSAGE)` 로 접는다(admin-launch.ts:243-247). relay `set()` 의 전체 소요에는 상한이 없다. `ADMIN_COMMAND_TIMEOUT_MS`(5초) 타이머는 **송신 시점**(`#pump`)에 시작되므로 AdminConn FIFO 대기 시간(앞선 dispatcher op · op 5 재조회 · 87 대기 `snapshotWaitMs` · 다른 탭의 op 9)이 더해진다. 그래서 「대기 + 전 조회 5초 + 저장 5초」 가 server 상한 15초(`RELAY_ADMIN_TIMEOUT_MS`)를 넘을 수 있다. 모듈 머리 주석의 「전 조회 5초 + 저장 5초 = 마감 10초 안」 은 큐 대기를 빠뜨렸다. 같은 이유로 GET `/launch/plan` 의 6초 상한(`RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS`)도 큐 대기 한 건이면 넘어, 두 서버가 통째로 offline 이 되고 「계획 고치기」 가 꺼진다.
3. **webapp:** `saveLaunchPlan` 이 throw 하면(브라우저 20초 타임아웃 · 네트워크 · 5xx) 결과를 무조건 `{ outcome: 'offline' }` 로 만든다(launch-map-tab.tsx:146). 계획 상태도 다시 읽지 않는다. 이때 server 는 이미 저장을 마치고 이력 행까지 썼을 수 있다.

실거래 발사 시각(16:00 · 09:00:30) 설정이다. 어드민이 「미반영」 을 믿고 옛 계획이 유지된다고 판단하면 실제 발사는 새 계획으로 나간다. 이력에도 「서버 연결 안 됨」 으로 굳어, D-29 의 「경계가 언제부터 바뀌었나」 대조가 틀어진다.

**Fix:** 송신 뒤 결과를 모르는 경우는 `timeout`(= 모름)으로 보고하고, 화면이 서버 값을 다시 읽게 한다.
```ts
// relay/src/admin/launch-plan.ts — op 8 이 나간 뒤의 offline 은 「모름」
const out = await admin.command({ op: ADMIN_OP.SetLaunchPlan, ... });
if (out.kind !== "result") {
  // 송신 전 offline 은 #target 이 이미 걸렀다 — 여기 offline 은 「보냈는데 응답 전에 끊김」
  return { result: { server: serverKey, outcome: "timeout" }, before_us: beforeUs, plan: null };
}
```
```ts
// server/src/services/admin-launch.ts — 요청을 보낸 뒤의 실패(status 0 · 비200)는 timeout 으로
//   (relay 미설정 · 요청 전 실패만 offline). axios 타임아웃/리셋은 relay 가 op 8 을 보냈을 수 있다.
return { result: { server: gateway, outcome: "timeout", message: RELAY_FAILED_MESSAGE }, before_us: null, plan: null };
```
```ts
// webapp launch-map-tab.tsx onSave 실패 분기 — 결과는 timeout(「응답 없음」) + 계획 재조회
() => {
  setLastSave({ key, save: { result: { server: gateway, outcome: 'timeout' }, at: new Date() } });
  fetchLaunchPlan().then((r) => r.kind === 'ready' && setPlan({ kind: 'ready', resp: r.resp }), () => {});
},
```
relay `set()` 에는 `deadlineAt` 기준의 전체 상한도 둔다. 전 조회 시작 전에 남은 시간이 `2 × ADMIN_COMMAND_TIMEOUT_MS` 보다 짧으면 전 조회를 건너뛰는 식이다. 그래야 server 15초 안에 응답이 나간다.

## Warnings

### WR-01: 저장은 ok 인데 relay 가 재조회 값을 못 실으면 화면이 저장 전 계획을 계속 보임(D-27 「성공 뒤 다시 조회」 미이행)

**File:** `webapp/src/lib/launch-plan-view.ts:198-207` · `webapp/src/components/admin/launch-map-tab.tsx:141-144` · `relay/src/admin/launch-plan.ts:125-130`

**Issue:** relay `set()` 은 op 8 이 code 0 이어도 두 경우에 `plan: null` 을 돌려준다. ① 마감 판정으로 후 조회를 건너뛸 때(:125-127 · 주석은 「웹이 다시 읽는다」), ② 후 조회가 ok 가 아닐 때(timeout · failed · offline · :130).

웹은 다시 읽지 않는다(「Pitfall S6 — 재조회 없음」). `planStateWithSave` 는 `resp.plan === null` 이면 `servers` 를 그대로 둔다. `onSave` 도 `saved === null` 이라 편집 칸을 새 값으로 다시 열지 않는다. 그 결과 다음이 모두 생긴다.
- 패널 점선 · 「다음 발사 계획」 줄 · 요약 카드 「다음 첫 조각」 이 **저장 전 값**으로 남는다. 이력 접힘 맨 위에는 새 `after` 가 「저장됨」 으로 들어가 화면 안에서 서로 어긋난다.
- 편집 칸의 기준 `entry` 가 옛 값이라 `changed` 가 계속 참이다. 「저장」 이 다시 켜지고, 「되돌리기」 는 **저장 전 값**으로 되돌린다. 이 상태에서 저장을 누르면 방금 바꾼 계획을 되돌리는 op 8 이 나간다.

relay 와 webapp 주석이 서로 「상대가 다시 읽는다」 고 가정하고 있다.

**Fix:** ok 인데 plan 이 없으면 웹이 1회 재조회하거나, 최소한 그 칸을 보낸 값으로 낙관 갱신한다.
```ts
// launch-map-tab.tsx onSave 성공 분기
setPlan((s) => planStateWithSave(s, gateway, resp));
if (resp.result.outcome === 'ok' && resp.plan === null) {
  fetchLaunchPlan().then(
    (r) => { if (r.kind === 'ready') setPlan({ kind: 'ready', resp: r.resp }); },
    () => {},
  );
  setEdit((e) => (same(e) ? planEditOf(gateway, market, f, valid) : e)); // 기준을 보낸 값으로
}
```

### WR-02: 백필 계획의 논리 키에 `fire_base` 가 없어 DB PK(20261030200000 뒤)와 어긋남 — A KRX 재확인 회차 조각 · 머리가 섞이거나 버려짐

**File:** `relay/src/tools/launch-backfill.ts:362-370`, `:376-439`

**Issue:** `pieceKey` 는 `(trade_date, gateway, profile, fire_exchange, market, wire)`, `headKey` 는 `(…, market)` 이다. 주석은 「DB PK 와 같다」 고 하지만, quick-261030-d7b(`20261030200000_launch_fire_base_key.sql`)가 두 표 PK 에 `fire_base` 를 넣은 뒤로는 맞지 않는다. 정식 노트 질문 5 답(「재확인 회차는 기준시각별 머리 · 조각으로 따로 받는다 — gh-radar 가 키를 고친다」)에 따르면, ndjson 이 A KRX 본회차(09:00:27)와 재확인 회차(09:00:29)를 `fire_base` 와 함께 주는 경우 다음과 같이 된다.
- 같은 wire 의 두 회차 조각이 `byKey` 에서 충돌한다. 뒤의 것만 남고 나머지는 `duplicates` 로 세어져 **조용히 버려진다**(dry-run 은 「중복 x」 숫자만 보인다).
- 머리는 두 회차 조각을 한 묶음으로 `launchHeadOf` 계산한다. `fire_base` 는 `p0` 의 값만 실려, n_pieces · gate_lo/hi 가 틀린 머리 1행이 들어간다.

DB 쪽에서는 두 회차가 공존할 수 있게 고쳐 놓고, 백필 입력 단계에서 다시 합쳐 버리는 셈이다.

**Fix:**
```ts
/** 조각 논리 키 — DB PK(20261030200000)와 같다. */
function pieceKey(p: LaunchPieceInput): string {
  return [p.trade_date, p.gateway, p.profile, p.fire_exchange, p.fire_base, p.market, p.wire].join("|");
}
function headKey(p: LaunchPieceInput): string {
  return [p.trade_date, p.gateway, p.profile, p.fire_exchange, p.fire_base, p.market].join("|");
}
```
`groups` 정렬 키(:436)에도 `fire_base` 를 넣고, `relay/tests/launch-backfill.test.ts` 에 「같은 날 A KRX 09:00:27 · 09:00:29 wire 0 이 두 조각 · 두 머리」 단언을 추가한다.

## Info

### IN-01: 잘못된 `?fire=` 값은 정본화(replace)하지 않음

**File:** `webapp/src/components/admin/launch-client.tsx:49`

**Issue:** `tab` · `d` · `range` 는 잘못된 값이면 `router.replace` 로 지우는데, `fire` 는 조용히 `q16` 으로 읽기만 하고 주소에 원문을 남긴다. 공유 주소와 실제 화면이 다르다.

**Fix:** `badFire = raw !== null && launchFireParamOf(raw) === null` 을 같은 정본화 effect 에 넣는다.

### IN-02: 16:00 머리 카드의 「N조각 · 결과」 가 뒤탐침을 실조각처럼 셈

**File:** `webapp/src/lib/launch-format.ts:237-247`

**Issue:** `launchHeadCardOf` 의 `count` · `counts` 는 탭 조각 전부(뒤탐침 포함)를 센다. 뒤탐침 「기타」 는 회색 「기타」 로 들어간다. 지도(`launchGateSideOf` — 열림) · 백필 머리(`launchHeadOf` — 제외) · kind 18 `n_pieces`(실조각만)와 정의가 다르다. 그래서 카드 「13조각」 이 머리 n_pieces 10 과 어긋나 보인다.

**Fix:** 카드 count · counts 는 `!isLaunchTailProbe(p)` 로 거르고, 뒤탐침 수는 「· 탐침 n」 으로 따로 보인다(날짜별 표 `launch-day-probes` 와 같은 꼴).

### IN-03: 저장 중 입력한 값이 저장 응답 도착 시 덮어써짐

**File:** `webapp/src/components/admin/launch-map-tab.tsx:143` · `webapp/src/components/admin/launch-plan-editor.tsx:32`

**Issue:** 편집 칸 주석은 「저장 중에도 입력은 막지 않는다(값 유지)」 인데, 성공 응답이 오면 `setEdit(planEditOf(gateway, market, f, saved.offsets_us))` 가 그 사이 입력한 초안을 통째로 서버 값으로 바꾼다.

**Fix:** 응답 시점의 `e.draft` 가 저장 요청 때의 draft 와 같을 때만 다시 연다. 아니면 저장 중 입력을 막는다(input `readOnly={saving}`).

### IN-04: 백필 입력 검증이 느슨함 — profile · fire_exchange 미검증, `.json` 은 무조건 첨부 형식

**File:** `relay/src/tools/launch-backfill.ts:228-241`, `:281-286`, `:396-425`

**Issue:**
- ndjson 의 `fire_base` 가 주어지면 `profile` · `fire_exchange` 는 아무 문자열이나 통과한다(예: `nxt` 소문자). 그런 행은 지도 · 주문 내역 어디에도 걸리지 않는 키로 영구 적재된다.
- 확장자 `.json` 은 첨부 `pieces.json` 형식으로만 읽어, gh-trade 가 ndjson 필드 배열을 `.json` 으로 주면 전 행이 거부된다.
- 백필은 A NXT 매도 다리 머리를 따로 만든다. 라이브 kind 18 은 노트대로 NXT 쪽을 N 머리 1행에 합친다. 그래서 같은 날 두 출처의 머리 정의가 다르다.

**Fix:** profile ∈ {Q16, N, A} · fire_exchange ∈ {KRX, NXT} 를 reject 사유로 막는다. `isLaunchFireBaseOf(profile, exchange, fire_base)` 로 기준시각 조합도 검사한다. 백필 머리는 라이브 정의(NXT = N 머리에 합산)에 맞추거나, 그 차이를 dry-run 출력에 명시한다.

---

_Reviewed: 2026-10-31T15:43:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
