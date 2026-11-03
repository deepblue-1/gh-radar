---
phase: 37-tick-viewer
round: 3
reviewed: 2026-11-04T07:30:00+09:00
depth: standard
scope: "2라운드 수정 fix(37) 커밋 16개 + 문서 후속 56029d3e(c2df163a..13b24ecf) — 수정이 만든 새 결함"
files_reviewed: 39
files_reviewed_list:
  - docs/relay-operations.md
  - ops/alert-tick-convert-failure.yaml
  - scripts/deploy-tick-convert.sh
  - scripts/deploy-tickgw.sh
  - supabase/migrations/20261104600000_tick_request_cap_null_triggered.sql
  - supabase/migrations/20261104600100_tick_request_join_outside_cap.sql
  - supabase/migrations/20261104600200_tick_convert_runs_since_error.sql
  - supabase/tests/tick_viewer.test.sql
  - tickgw/src/cache.ts
  - tickgw/src/config.ts
  - tickgw/src/indexer.ts
  - tickgw/src/poller.ts
  - tickgw/tests/indexer.test.ts
  - tickgw/tests/poller.test.ts
  - tickgw/tests/server.test.ts
  - webapp/e2e/specs/ticks-viewer.spec.ts
  - webapp/src/components/ticks/__tests__/tick-state-card.test.tsx
  - webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx
  - webapp/src/components/ticks/tick-header.tsx
  - webapp/src/components/ticks/tick-msg-list.tsx
  - webapp/src/components/ticks/tick-viewer-page.tsx
  - webapp/src/components/ticks/tick-viewer.tsx
  - webapp/src/instrumentation-client.ts
  - webapp/src/lib/router-transition.ts
  - webapp/src/lib/ticks/__tests__/msg-rows.test.ts
  - webapp/src/lib/ticks/__tests__/use-fixed-window.test.tsx
  - webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx
  - webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx
  - webapp/src/lib/ticks/msg-rows.ts
  - webapp/src/lib/ticks/use-fixed-window.ts
  - webapp/src/lib/ticks/use-tick-cursor.ts
  - webapp/src/lib/ticks/use-tick-live.ts
  - workers/tick-convert/src/meta.ts
  - workers/tick-convert/src/modes/nightly.ts
  - workers/tick-convert/src/modes/promote.ts
  - workers/tick-convert/src/store.ts
  - workers/tick-convert/tests/nightly.test.ts
  - workers/tick-convert/tests/promote.test.ts
  - workers/tick-convert/tests/too-large.test.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 37: Code Review Report — Round 3

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

> 2라운드 수정(37-REVIEW-FIX-R2.md)의 커밋만 봤다. 정본 37-REVIEW.md · 37-REVIEW-R2.md 는 그대로 둔다. 1·2라운드에서 이미 낸 지적은 수정이 틀린 경우만 다시 적었다.

## Summary

`git log c2df163a..13b24ecf --grep='^fix(37)'` 의 16개 커밋과 문서 후속 `56029d3e` 를 `git show` 로 읽었다. 판단은 HEAD 소스에서 했다.

**확인한 것**
- 시험(`--maxWorkers=2`): tickgw 70/70 · tick-convert 162/162 · webapp `src/lib/ticks` + `src/components/ticks` 26파일 425/425 통과. pgTAP 과 e2e 는 돌리지 않았다.
- 재현 시험: scratchpad `r3probe/live-starve.test.ts` 로 R3-WR-01 을 실제 `Poller` · `TickCache` 위에서 재현했다(아래).
- Next 15.5.15 소스 대조: `onRouterTransitionStart` 는 `dispatchNavigateAction`(Link · push · replace)과 `dispatchTraverseAction`(popstate)에서 액션을 큐에 넣기 **직전에** 동기로 불린다(`app-router-instance.js:211-229`). 패치된 `replaceState` 는 무조건 ACTION_RESTORE 를 넣고, 대기 중인 NAVIGATE 를 버린다(`:131-145`). R2-WR-30 수정의 전제는 맞다.
- SQL 세 개는 모두 `CREATE OR REPLACE` 다. 세 개 모두 PUBLIC · anon · authenticated REVOKE 와 service_role GRANT 를 다시 적었다. NULL 처리(`coalesce(… >= …, false)`)도 맞다.
- `tick_convert_runs` 를 읽는 곳은 nightly(`runsSince`)와 purge(날짜로 DELETE)뿐이다. server · webapp 에는 없다. `tick_eta_s` 는 `tick_convert_requests` 만 본다. 그래서 STARTED 행(ok null)이 다른 화면이나 판정에 섞이지 않는다.

**전체 판정**
막아야 할 것(BLOCKER)은 없다. 새 경고는 2건이다.
1. **R2-WR-01 의 승격 보호가 우선순위를 뒤집었다(R3-WR-01).** 19:55 부터는 따라잡기 대상이 아닌 오늘 complete 키까지 모두 지울 수 없다. 그러면 따라잡기가 빈자리를 다 먹은 뒤, 리스가 살아 있는 **지금 보고 있는 키**의 5초 증분이 `full` 로 버려진다. 그 키는 장 마감 직전 5분 동안 delayed 가 되고 마감 마무리에서도 빠져 승격되지 않는다. 수정 보고서가 「새로 연 키의 delayed」 로만 적은 맞바꿈보다 범위가 넓다.
2. **R2-WR-03 의 「포기하면 실행마다 종료 1」(R3-WR-02).** 그 날짜가 catch-up 창(10일)을 벗어날 때까지 알림이 하룻밤 두 번씩 온다. 크래시로 포기한 날짜(OOM · 타임아웃)는 문서가 안내한 `nightly --date D` 를 같은 Job 한도로 돌리면 또 죽는다. 그래서 알림을 끌 수 없다. 같은 정책을 request · promote 와 함께 쓰므로 진짜 새 실패도 이 소음에 묻힌다.

그 밖의 수정(R2-WR-02 · WR-30 · WR-31 · IN-01~08 · IN-30~32)은 지적대로 닫혔다. 남은 것은 Info 5건이다.

## Warnings

### R3-WR-01: 19:55~마감 동안 승격 보호가 리스가 살아 있는 활성 키의 증분까지 막는다 — 지금 보는 키가 delayed 가 되고 승격에서 빠진다

**File:** `tickgw/src/poller.ts:241-246,260-266,477-485,564-586,784-794` · `tickgw/src/cache.ts:133-136,153-157`

**Issue:**
- `promotionPinned` 는 승격 창(19:55 ~ 마감 마무리 끝, closed 는 21:00)에 들어온 **모든** 오늘 complete 키를 보호한다. 따라잡기 대상인지, 이미 따라잡았는지, 리스가 있는지는 가리지 않는다.
- 그러면 `headroom()` 이 셀 수 있는 몫(보호되지 않은 다른 키)은 「complete 아님 · 다른 날짜」 키만 남는다.
- 따라잡기는 이 남은 자리와 빈자리를 먼저 채운다. 리스 끝난 키들을 하루치로 불리고, 자리가 모자라면 그 키에서 멈춘다(`catchup stopped`). 그래서 창 안에서는 캐시가 상한 바로 아래까지 찬다.
- 그다음 리스가 살아 있는 활성 키(사용자가 마감을 보고 있는 키)의 5초 증분이 `append` 에서 `full` 이 된다(`cache.ts:133-135`). 그 키는 다른 키를 지울 수 없기 때문이다.
  - `poll` 은 그 키를 실패 백오프에 넣는다. 그 키는 delayed 로 보이고 5 → 60초 간격이 된다.
  - `fullNeed` 때문에 자리가 날 때까지 호출도 하지 않는다(R2-IN-03).
- 20:01 마감 마무리의 `closeOne` 도 같은 `roomForRetry` 에 걸린다. 그래서 3회 뒤 `close gave up (cache full)` 가 되고, **그 키는 승격되지 않는다**.
- 결과가 뒤집힌다. 아무도 안 보던 키는 따라잡혀 승격되고, 사용자가 보던 키는 마지막 5분(NXT 19:55~20:00)을 못 받고 승격에서도 빠진다.
- R2-IN-05 의 전역 75 대기도 겹친다. 대기 동안에는 `closeSweep` 이 돌지 않는다(`stepInner:358`). 그래서 `closeDoneDate` 가 늦어지고, 보호가 풀리는 시각도 같이 밀린다.

**재현** (scratchpad `r3probe/live-starve.test.ts` · 실제 Poller/TickCache):
- 조건: 상한 15,500B · 1분 1레코드 10B
  - 키 1 · 2 는 10:00 · 10:01 에 잠깐 열었다.
  - 키 9 는 19:50 에 열고 계속 touch 했다.
- 결과:
  - 키 9 크기는 19:54:59 에 7,150B 이고 19:59 에도 7,150B 다(증분 0).
  - `peek(키9)` 는 `delayed` 다.
  - 20:15 에도 키 9 는 `closed=false` 다(승격 안 됨).
  - 키 2 는 따라잡혀 7,150B 가 됐다.

**Fix:** 따라잡기가 활성 키 몫을 남기게 한다. 활성 키는 「따라잡기를 아직 못 끝낸 · 리스 없는」 보호 키보다 앞선다.
```ts
// poller.catchupOne — applyOk 전에: 따라잡기 응답은 활성 키 예비분을 남길 때만 붙인다
const reserve = CATCHUP_RESERVE_BYTES; // 예: 8 MiB 또는 활성 키 수 × 1 MiB
if (res.stdout.length > this.deps.cache.headroom(run.key) - reserve) { /* "full" 과 같이 이 키 따라잡기 멈춤 */ }
// 그리고/또는 promotionPinned: 리스가 살아 있는 키의 append 를 위해서는
//   「closed 아님 ∧ 리스 없음 ∧ 따라잡기 끝(catchupCaught) 아님」 키를 rank 1 후보로 풀어 준다(지울 때 cache evict 로그)
```
시험에 「19:50 부터 보는 키가 19:55~20:00 증분을 계속 받고 20:01 에 closed」 를 더한다.

### R3-WR-02: 포기한 날짜가 있으면 실행마다 종료 1 — 최대 10일 · 하룻밤 2회 알림 · 크래시로 포기한 날짜는 안내된 수동 재변환으로 끌 수 없다

**File:** `workers/tick-convert/src/modes/nightly.ts:570-584` · `ops/alert-tick-convert-failure.yaml:5,16-28` · `scripts/deploy-tick-convert.sh:167-169`

**Issue:**
1. **알림이 오래 이어진다.**
   - `gaveUp` 은 실행 상태 없이 매번 다시 계산된다. 그래서 포기한 날짜가 catch-up 창(`TICK_CATCHUP_DAYS` 10일) 안에 있는 동안 23:30 · 01:30 실행이 모두 종료 1 이다.
   - 알림 정책은 실패 실행마다 incident 를 연다(`ALIGN_SUM 300s`). 날짜 하나를 포기하면 최대 약 20건이 온다.
   - 창을 벗어나는 순간 신호 없이 멈춘다.
2. **크래시로 포기한 날짜는 문서의 해결책으로 끌 수 없다.**
   - 포기 사유가 「끝 기록 없는 STARTED」(OOM · task timeout 3600s)이면, `nightly --date D`(`smoke-tick-convert.sh` → 같은 Job · 같은 8Gi · 3600s)도 같은 자리에서 죽는다.
   - 그러면 ok 기록이 생기지 않고 알림이 계속된다.
   - 알림 문서 5행은 이 경우의 우회(`gcloud run jobs execute --task-timeout … --memory …` override, 또는 「포기 확인」 표지)를 안내하지 않는다.
3. **새 실패가 묻힌다.**
   - 같은 정책이 `gh-radar-tick-convert`(nightly · request)와 `-promote` 를 함께 본다.
   - 포기 소음이 이어지는 동안에는 다른 날짜의 새 nightly 실패나 request 실패가 알림만으로는 구별되지 않는다(로그를 열어야 안다).
   - 「무로그 fail-safe 금지」 의 반대쪽 함정이다. 같은 알림이 매일 오면 사람이 그 알림을 무시하게 된다.
- 수정 보고서는 「23:30 · 01:30 실행을 상태 없이 하나로 묶을 방법이 없다」 고 했다. 그러나 `runsSince` 가 이미 `finished_at` 을 돌려준다. 그래서 상태 없이도 「막 포기한 실행」 을 가릴 수 있다.

**Fix:**
```ts
// 포기 직후에만 종료 1 — 그 날짜의 마지막 nightly 기록(실패 · STARTED)이 직전 실행 간격(≤ 22.5h) 안이면 「새로 포기」
const lastOf = (d: string) => max(runs.filter(r => r.mode === 'nightly' && r.date === d).map(r => Date.parse(r.finished_at ?? '')));
const fresh = gaveUp.filter(d => deps.now.getTime() - lastOf(d) < 22.5 * 3600_000);
out.failed += fresh.length > 0 ? 1 : 0;           // 알림은 포기 직후 1~2회
logger.error({ gaveUp, fresh }, '… 다시 고르지 않는다');   // 로그는 실행마다(로그 기반 알림 조건으로 따로 걸 수 있음)
```
알림 문서 5행에 다음을 더한다.
- 크래시 포기는 `--task-timeout` · `--memory` override 로 수동 재변환한다.
- 영구 포기를 받아들이는 방법도 적는다(예: 그 날짜에 `ok=true · error='ABANDONED'` 기록 RPC).

## Info

### R3-IN-01: 크래시 판정이 「끝 기록 쓰기 실패」 와 「예산 넘긴 날짜의 타임아웃」 도 그 날짜의 결정적 실패로 센다

**File:** `workers/tick-convert/src/modes/nightly.ts:141-168,459-477,521-545`

**Issue:**
- `crashes = STARTED − 끝 기록` 이다. 끝 기록(`runRecord`)이 Supabase 일시 장애로 실패해도(:541 은 error 로그만 남긴다) STARTED 는 남는다. 그러면 그 실행은 **크래시(결정적)** 로 센다. R2-WR-03 이 빼려던 「일시 장애」 가 이 길로 다시 들어온다.
- task timeout(3600s)이 예산(40분) 안에 시작한 두 번째 날짜를 끊어도, 그 날짜의 결함으로 센다. 예를 들어 앞 날짜가 GCS FUSE 지연으로 TRANSIENT 실패를 반복하며 35분씩 걸리면, 뒤 날짜는 건강해도 3회 만에 포기된다.
- 지금 추정(날짜당 3~8분)으로는 드물다. 그래서 Info 로 둔다.

**Fix:**
- 끝 기록 쓰기는 짧게 한 번 더 시도한다.
- STARTED 행에 `started_at` 을 남기고, 그 실행의 `t0 + nightlyBudgetMs` 뒤에 시작한 날짜의 미완 STARTED 는 세지 않는다. 또는 「그 실행에서 첫 번째로 시작한 날짜」 만 센다.

### R3-IN-02: 업로드 오류의 HTTP 상태를 `statusCode`(본문 문자열) 먼저 읽는다 — 숫자가 아니면 영구 4xx 도 TRANSIENT 로 떨어진다

**File:** `workers/tick-convert/src/store.ts:52-55` · `workers/tick-convert/src/modes/nightly.ts:98-103`

**Issue:**
- storage-js 2.103 의 `StorageApiError` 를 보면 `status` 는 HTTP 상태 정수다. `statusCode` 는 `err.statusCode || err.code || String(status)` 다(`dist/index.mjs:268-275`).
- 그런데 `Number(raw.statusCode ?? raw.status)` 는 `statusCode` 가 있으면(늘 있다) 그 값만 본다.
- 본문에 `statusCode` 없이 `code: "InvalidKey"` 같은 문자열만 오면 `NaN` 이다. 그러면 `status` 를 싣지 않는다. `uploadFailure` 는 이 오류를 상태 없음, 곧 일시 장애로 본다. 영구 거부가 포기 카운트에서 빠지고 매 실행 다시 통독된다.

**Fix:** `const st = Number.isInteger(raw.status) ? raw.status : Number(raw.statusCode);` 처럼 HTTP `status` 를 먼저 쓴다.

### R3-IN-03: 리스가 살아 있는 queued 키(활성 8 밖)는 19:55~마감에 폴링도 따라잡기도 되지 않는다 — R2-IN-04 의 「queued 키」 전제가 반만 닫혔다

**File:** `tickgw/src/poller.ts:606-610,363`

**Issue:**
- `catchupEligible` 은 「리스가 끝난」 키만 받는다. 9번째 이후로 대기 중인(queued) 키는 화면이 열려 있어 리스가 살아 있다. 그래서 따라잡기 대상이 아니다.
- 보통 루프도 앞 8키만 돈다(`liveRuns(now).slice(0, maxKeys)`).
- 그래서 그 키는 20:01 마감 마무리에서 처음으로 08:00 부터 읽힌다. 그 시각엔 이른 시간 파일이 이미 압축 중이라 `compressed_files_skipped` 가 생기고 승격되지 않는다.
- R2-IN-04 는 「리스가 끝난 queued 키」 만 고쳤다.

**Fix:** 창 안에서는 queued(활성 순번 ≥ maxKeys)인 키도 `catchupEligible` 로 본다. 리스가 살아 있어도 보통 루프가 돌지 않는 키이기 때문이다.

### R3-IN-04: 같은 열기 키로 가는 이동 뒤에는 다음 커서 이동 전까지 URL `t` 를 다시 쓰지 않는다

**File:** `webapp/src/lib/ticks/use-tick-cursor.ts:316-337`

**Issue:**
- 이동이 대기 중일 때 `write()` 는 그냥 돌아간다. 그때 대기 타이머도 다시 잡지 않는다.
- 예를 들어 같은 키 push(지금 날짜 칩을 다시 누름 → `t` 없는 URL)가 끝나 URL 이 바뀌어도, 쓰기는 다음 `rec` · `session` 변경 때에야 다시 난다.
- 정지 상태에서 이동 중에 커서를 한 번 옮기고 그대로 두면 URL 의 `t` 는 옛 자리(또는 없음)에 머문다. 새로고침이나 링크 복사가 다른 틱을 가리킨다.

**Fix:** 막힌 쓰기는 `pendingWrite = true` 로 기억한다. 구독 콜백이나 `useSearchParams` 변화(이동 커밋) 때 `pendingWrite` 면 `write()` 를 다시 예약한다.

### R3-IN-05: 증분 More 「제자리」 검사가 `commit(m)` 뒤에 있다 — offsetEnd 가 뒤로 가면 커서가 이미 되돌아가 있다

**File:** `webapp/src/lib/ticks/use-tick-live.ts:299,319-326`

**Issue:**
- 하루치 경로는 제자리 검사를 `commit` **전에** 한다(:274). 증분 경로는 바이트를 세션에 붙이고 `commit(m)`(offset = offsetEnd)을 한 **뒤에** 검사한다.
- 계약 위반이 `offsetEnd < prevOffset` 이면 offset 이 이미 뒤로 가 있다. 다음 누름은 이미 붙인 바이트를 다시 받아 같은 틱을 두 번 붙인다.
- 같으면(`==`) 해가 없다. tickgw 는 epoch 안에서 offset 을 줄이지 않으므로 Info 다.

**Fix:** 증분도 `m.more === true && m.offsetEnd <= prevOffset` 이면 `appendTickBytes` · `commit` 전에 오류로 센다. 하루치와 같은 순서로 맞춘다.

## Round-2 resolution check

| ID | 해소 | 근거 · 남은 것 |
|----|------|----------------|
| R2-WR-01 | partial | 따라잡기와 마감 마무리끼리 서로 지우지 않는다. `cache evict` 로그와 caught/lost 도 맞다(시험 재확인). 그러나 보호 범위가 넓어 활성 키 증분이 굶는다 → R3-WR-01 |
| R2-WR-02 | yes | `coalesce(triggered_at >= now()-2m, false)` 다. 본문의 다른 곳은 300100 과 같다. REVOKE/GRANT 를 다시 적었다 |
| R2-WR-03 | partial | TRANSIENT 를 빼고, STARTED 크래시를 세고, 포기 날짜 종료 1, 알림 문서까지 반영했다. 알림 소음과 크래시 포기의 해결 경로 → R3-WR-02, 크래시 오판 → R3-IN-01, 업로드 상태 파싱 → R3-IN-02 |
| R2-WR-30 | yes | Next 15.5.15 의 `dispatchNavigateAction` · `dispatchTraverseAction` 이 액션을 넣기 전에 훅을 부른다. 다른 키 · 같은 키 · 뒤로(popstate 뒤 `location` 은 이미 목적지) 경우 모두 판정이 맞다. 리스너가 0이면 즉시 돌아가 다른 화면 영향이 없다. 클라이언트 전용이라 SSR 과 무관하다. StrictMode 재마운트는 구독 해제로 정리된다. 남은 것 → R3-IN-04 |
| R2-WR-31 | yes | `fillFailures` 상한 3 · 5 → 10초 백오프 · `fillFailed` 정지 · 카드 「다시 시도」 1회 · refetch 중 버튼 풀림 |
| R2-IN-01 | yes | `undefined` 만 0 이다. 그 밖은 `badCounts` → complete=false + warn |
| R2-IN-02 | yes | 문턱 62,914,560B 로 tickgw 키 상한(100,663,296)보다 작다. 시험으로 고정했다 |
| R2-IN-03 | yes | `fullNeed` 와 `headroom` 사전 판정이 세 경로(폴링 · 따라잡기 · 마감)에 모두 있다. 단 R3-WR-01 에서는 이 판정이 굶음을 오래 끈다 |
| R2-IN-04 | partial | 리스가 끝난 queued · 백오프 키는 따라잡는다. 리스가 살아 있는 queued 키는 빠진다 → R3-IN-03 |
| R2-IN-05 | yes | 전역 `busyUntil` 은 5 → 15 → 30 → 60초다. 정상 응답이나 64 에서 되돌린다. 실패 단계와 상태는 그대로다 |
| R2-IN-06 | yes | 합류(5a)가 상한 판정 앞에 있다. capped 여도 요청자 집합에 든다 |
| R2-IN-07 | yes | `-dirty-<epoch초>` 다. 되돌림은 `{{.Image}}`(ID)로 한다. 비교는 `docker image inspect {{.Id}}` 로 한다. env-file 은 늦게 지운다 |
| R2-IN-08 | yes | 주석이 실제 거부 경계(19:59)와 같다 |
| R2-IN-30 | yes | 커서가 화면 안이면 커서 행, 아니면 첫 전문 행을 기준으로 한다. `scrollToOffset` 이 상태를 같이 올린다. `posOfRec` 는 모든 rec 를 채우므로(−1 없음) 기준을 잃지 않는다 |
| R2-IN-31 | yes | 두 경로 모두 진행을 확인한다. 상한에서 `more` 를 남기고 버튼은 「이어 받기」 다. 증분 검사 순서 → R3-IN-05 |
| R2-IN-32 | yes | `sessionComplete` 는 세션을 바꾸거나 같은 epoch 로 이어 붙인 응답에서만 바뀐다 |

---

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
