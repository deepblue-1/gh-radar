---
phase: 37-tick-viewer
round: 2
reviewed: 2026-11-04T06:40:00+09:00
depth: standard
scope: "fix(37) 커밋 42개(fd6c044d..90173169)의 변경분 — 갭 클로징 수정이 만든 새 결함"
files_reviewed: 45
files_reviewed_list:
  - docs/relay-operations.md
  - ops/alert-tick-convert-failure.yaml
  - packages/shared/src/__tests__/ticks-pnl.golden.test.ts
  - packages/shared/src/tick-api.ts
  - packages/shared/src/ticks/book.ts
  - packages/shared/src/ticks/decode.ts
  - packages/shared/src/ticks/orders-krx.ts
  - packages/shared/src/ticks/record-index.ts
  - packages/shared/src/ticks/route.ts
  - scripts/deploy-server.sh
  - scripts/deploy-tick-convert.sh
  - scripts/deploy-tickgw.sh
  - scripts/tick-oracle/gen-fixtures.sh
  - scripts/tick-oracle/oracle.py
  - server/src/routes/ticks.ts
  - server/src/services/cors-config.ts
  - server/src/services/tick-convert-trigger.ts
  - server/src/services/tickgw-client.ts
  - server/src/services/ticks.ts
  - supabase/migrations/20261104300000_tick_request_cap_trigger_count.sql
  - supabase/migrations/20261104300100_tick_request_requesters.sql
  - supabase/migrations/20261104300200_tick_grid_upsert_dedupe.sql
  - supabase/tests/tick_viewer.test.sql
  - tickgw/src/cache.ts
  - tickgw/src/config.ts
  - tickgw/src/indexer.ts
  - tickgw/src/poller.ts
  - tickgw/src/server.ts
  - tickgw/tests/poller.test.ts
  - webapp/src/components/ticks/tick-header.tsx
  - webapp/src/components/ticks/tick-msg-list.tsx
  - webapp/src/components/ticks/tick-slider.tsx
  - webapp/src/components/ticks/tick-state-card.tsx
  - webapp/src/components/ticks/tick-viewer-page.tsx
  - webapp/src/components/ticks/tick-viewer.tsx
  - webapp/src/lib/ticks/tick-api.ts
  - webapp/src/lib/ticks/tick-url.ts
  - webapp/src/lib/ticks/use-fixed-window.ts
  - webapp/src/lib/ticks/use-tick-cursor.ts
  - webapp/src/lib/ticks/use-tick-grid.ts
  - webapp/src/lib/ticks/use-tick-live.ts
  - workers/tick-convert/src/modes/nightly.ts
  - workers/tick-convert/src/modes/promote.ts
  - workers/tick-convert/src/modes/request.ts
  - workers/tick-convert/src/tickgw-export.ts
findings:
  critical: 0
  warning: 5
  info: 11
  total: 16
status: issues_found
---

# Phase 37: Code Review Report — Round 2

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 45
**Status:** issues_found

> 1라운드(37-REVIEW.md) 수정 커밋의 변경분만 리뷰어 둘이 나눠 봤다(백엔드 R2-*-01..29 · webapp R2-*-30..59). 정본 37-REVIEW.md 는 그대로 둔다.

## Summary

### Part 백엔드 — shared · DB · server · tickgw · tick-convert · 스크립트

`git log --grep='^fix(37)' fd6c044d..HEAD` 의 fix 커밋 가운데 백엔드 경로(packages · server · tickgw · workers · supabase · scripts · docs)를 건드린 커밋을 모두 읽었다. 각 커밋은 `git show` 와 주변 소스로 판단했다. webapp 쪽은 범위 밖이다. `ca2c0e01` 은 server · shared 부분만 봤다.

**확인한 것**
- 시험(`--maxWorkers=2`): tickgw 62/62 · tick-convert 158/158 · server `ticks*.test.ts` 48/48 모두 통과.
- 재현 시험: scratchpad `r2probe/catchup-lru.test.ts` 로 R2-WR-01 을 실제 Poller · TickCache 위에서 재현했다.
- 배포 이미지(읽기 전용 조회): `gh-radar-tick-convert` 와 `gh-radar-tick-convert-promote` 는 `a6cc71e0` 이다. 이 이미지에 CR-30 · WR-30 · WR-36 · IN-32 커밋이 들어 있다.

**전체 판정**
Round-1 의 Critical 2건(CR-30 · CR-31)은 코드에서 해소됐다. gh-trade 119 계약 변경도 맞게 반영했다. 반영한 항목은 `skipped_records` · 75 의미 확장 · exit 1 · 60초 한도 · 19:59 창 끝이다.

그러나 수정이 새 결함 셋을 만들었다.
1. CR-31 후속인 19:55 따라잡기가 WR-33 의 LRU 정책과 맞물린다. 그래서 막 따라잡은 키를 스스로 지운다. 로그는 그 키를 caught 로 센다.
2. WR-01 상한의 단락 조건이 `triggered_at IS NULL` 인 pending 에서 NULL 3값 논리로 상한 검사를 통째로 건너뛴다.
3. WR-36 포기 규칙이 일시 장애와 영구 실패를 구분하지 않는다. 포기한 뒤로는 알림도 없다. 알림 문서는 여전히 「다시 고른다」 고 적혀 있다.

SQL 권한 재진술은 세 마이그레이션 모두 정확하다(PUBLIC · anon · authenticated REVOKE + service_role GRANT). 표는 service_role 전용이라 `requesters` 가 PostgREST 로 새지 않는다.

### Part webapp

- **범위:** `fd6c044d..HEAD` 의 `fix(37)` webapp 커밋 14개를 봤다(WR-60 ~ WR-65 · IN-60 ~ IN-64 · WR-02-W · WR-32-W · 오케스트레이터 후속 `90173169`). e2e 커밋 `9407f999` 도 읽었다. 각 커밋은 `git show` 로 보고, 판단은 HEAD 소스에서 했다. 백엔드는 보지 않았다.
- **시험:** `vitest run use-tick-live · use-tick-cursor · use-tick-grid · tick-msg-list --maxWorkers=2` → 4개 파일 · 61건 통과. playwright 는 돌리지 않았다.
- **총평:** 11건 중 9건은 지적대로 닫혔다. 새로 생긴 결함 가운데 막아야 할 것(BLOCKER)은 없다. 경고는 2건이다.
  - **WR-60 은 일부만 닫혔다.** 토큰은 페이지 `go()` 만 올린다. 사이드바 `<Link>` 이동과 브라우저 뒤로 · 앞으로(popstate)도 Next 액션 큐에서 같은 RESTORE 경합을 겪는다(R2-WR-30).
  - **WR-62 는 조용히 멈추던 것을 「끝없이 다시 받기」로 바꿨다.** 해제가 늘 같은 자리에서 실패하면 5초마다 하루치를 처음부터 다시 받는다. 상한도 백오프도 없다(R2-WR-31).
- **더 볼 것 없음으로 확인한 질문:**
  - WR-65 `k` 는 옛 `t`-only 링크와 호환된다. 세 보고서 알약(`tick-link.ts:42`)은 `k` 없이 `t` 만 쓰고, 그러면 그 ms 의 첫 틱으로 열린다(예전과 같다). 파싱은 `t` 가 유효할 때만 `k` 를 받는다. 범위는 1~999999 이다. 같은 ms 를 벗어나면 첫 틱으로 떨어진다.
  - IN-60 타이머: 진입 화면에서만 돈다. cleanup 에서 interval · visibilitychange 를 둘 다 지워 새지 않는다.
  - IN-62 공유 받기: 리스너 수로 판정해 마지막 훅이 떠날 때만 abort 한다. 0ms 유예 덕에 StrictMode 재마운트가 같은 받기를 이어 쓴다.
  - WR-64: null meta 는 502 로 간다. 하루치는 다시 받고, 증분은 멈춘다.
  - WR-32-W 증분 연쇄: 상한 16 이다. offset · epoch 는 조각마다 `commit` 한다. 409 가 오면 refetch 로 넘어가고, `moreChain` 은 다음 누름의 `resume()` 에서 0 이 된다.

## Warnings

### R2-WR-01: 19:55 따라잡기가 LRU 로 다른 따라잡기 키(이미 따라잡은 키 포함)를 지운다 — 승격 손실 · 로그는 caught 로 셈

**File:** `tickgw/src/cache.ts:124-166` · `tickgw/src/poller.ts:216-220,529-532,571-599,551-562`

**Issue:**
LRU 보호 술어(`setProtect`)는 「리스가 살아 있는 키」만 보호한다(poller.ts:217-220). 따라잡기 대상은 정의상 리스가 끝난 오늘 complete 키다(poller.ts:506-510). 그래서 모두 LRU 후보다.

1. 따라잡기는 낮에 받은 몇 분 분량을 하루치(lastRecvNs → 19:55)로 불린다. 그래서 캐시 총량이 크게 는다.
2. `append` 는 상한을 넘기면 다른 보호 안 된 키를 `lastAccess` 오름차순으로 지운다(cache.ts:129-135 · 153-166).
3. 따라잡기 순서는 `cache.values()` 삽입 순서다. 모든 항목의 `nextDueAt` 이 `now` 로 같다(poller.ts:529-532, 545-547). 이 순서는 LRU 가 지우는 순서(가장 오래 전에 연 키)와 같다.
4. 결과: 키 1 을 따라잡은 뒤 키 3 을 따라잡으면, 키 3 의 append 가 **방금 따라잡은 키 1 을 지운다**. 키 1 은 20:01 마감 마무리에서 사라지고 승격되지 않는다.
5. 이 삭제는 로그를 하나도 남기지 않는다(`enforceLimit` 무로그). `catchup done` 은 `caught` 를 `done` 시점에 세므로(poller.ts:591-593) 지워진 키도 caught 로 남는다. 운영 확인 절차(`docker logs | grep catchup`)가 오판한다.

**재현 결과** (scratchpad `r2probe/catchup-lru.test.ts`):
- 조건: 캐시 16,000B · 1분 1레코드 10B · 10:00/10:01/10:02 에 잠깐 연 키 3개
- 로그: `catchup done keys=3 caught=3`
- 그 뒤 키 1 이 `evicted` 다. `close sweep start keys=2` · `closed=2` 로 키 1 은 승격에서 빠진다.
- 키 1(7,150B)을 지운 이유는 키 3 의 5,930B 를 붙이기 위해서다.

운영 규모: 96MB 를 「극단 ≈7MB · 보통 ≈1MB」(docs/relay-operations.md)로 나누면 극단 종목 십여 개다. 급등 종목을 여럿 본 날이면 닿는 크기다.

**Fix:**
- 오늘 complete 키를 지우는 대신 따라잡기를 멈춘다.
- LRU 후보는 「complete 아님 · 다른 날짜」 키부터 지운다.
- 지울 때는 반드시 로그를 남긴다.
```ts
// cache.ts — 후보 순위: (1) 오늘 complete 아님 · 다른 날짜 (2) 그 밖, 각 안에서 lastAccess 오름차순
private victimRank(e: CacheEntry, today: string): number { return e.complete && e.date === today ? 1 : 0; }
// append(key, bytes, meta, { spareTodayComplete }) — 따라잡기 · 마감 마무리 경로는 spareTodayComplete=true:
//   rank 1 후보만 남으면 지우지 않고 "full" (승격 입력끼리 서로 지우지 않는다)
// enforceLimit — 지울 때마다 log("warn", "cache evict", { key, size, complete, reason: "lru" })
// poller.catchupOne — caught 는 finishCatchup 시점에 cache.get(key) 가 살아 있는 키만 센다
```

### R2-WR-02: WR-01 상한 단락이 `triggered_at IS NULL` 인 pending 에서 NULL 로 평가돼 상한 검사를 통째로 건너뛴다

**File:** `supabase/migrations/20261104300100_tick_request_requesters.sql:100-111` (같은 식 `20261104300000_tick_request_cap_trigger_count.sql:101-111`)

**Issue:**
```sql
IF p_daily_cap IS NOT NULL
   AND NOT (v_found AND (v_row.status = 'running'
                         OR (v_row.status = 'pending' AND v_row.triggered_at >= now() - interval '2 minutes'))) THEN
```
행이 `pending` 이고 `triggered_at IS NULL` 이면 식이 이렇게 풀린다.

1. `NULL >= …` → NULL
2. `true AND NULL` → NULL, `false OR NULL` → NULL
3. `v_found AND NULL` → NULL, `NOT NULL` → NULL
4. `cap IS NOT NULL AND NULL` → NULL

PL/pgSQL `IF NULL` 은 거짓이므로 **상한 검사를 건너뛴다**. 바로 뒤 (7) 은 `triggered_at IS NULL` 행을 깨우고 `trigger_count` 를 +1 한다. 상한에 이미 닿았어도 Job 이 실행된다.

머리 주석과 커밋 설명은 「단락은 running · 2분 안 pending 일 때만 · stale pending 재트리거는 상한을 거친다」 라고 한다. 그런데 가장 stale 한 경우인 「한 번도 안 깨운 pending」 이 오히려 상한 밖으로 빠진다.

이 상태는 흔하다.
- **(a) 잠긴 동안 들어온 요청:** 같은 (날짜, 거래소)의 Job 이 running 이거나 2분 안에 깨운 상태에서 새 isin 을 요청하면, (6) 은 행을 넣고 (7) 은 `tick_trigger_blocked` 때문에 0행이다. 그 행이 claim 뒤에 들어왔다면 pending · NULL 로 남는다.
- **(b) 깨우기 실패 되돌림:** `tick_request_trigger_failed` 가 `triggered_at = NULL` 로 되돌린다.

두 경우 모두 `tick_open_for_user` 가 `stale = (triggered_at IS NULL …)` 를 참으로 낸다(20261103210000:24-27). 그러면 웹이 convert 를 다시 부르므로, 이 우회는 평소 화면 흐름에서 그대로 탄다.

pgTAP J2 는 `triggered_at = now() - 3 minutes`(NULL 아님)만 다룬다. 그래서 이 경로가 잠기지 않았다(tick_viewer.test.sql J2).

**Fix:**
```sql
AND NOT (v_found AND (v_row.status = 'running'
                      OR (v_row.status = 'pending'
                          AND coalesce(v_row.triggered_at >= now() - interval '2 minutes', false))))
```
새 마이그레이션으로 함수를 다시 정의하고 REVOKE/GRANT 를 다시 적는다. pgTAP 에 「pending · triggered_at NULL · 상한 소진 → capped true · trigger_count 그대로」 단언을 더한다.

### R2-WR-03: WR-36 포기 규칙이 일시 장애도 3회째에 영구 포기하고, 포기 뒤로는 알림이 없으며, 알림 문서는 「다시 고른다」 그대로다

**File:** `workers/tick-convert/src/modes/nightly.ts:97-110,141,446-462` · `ops/alert-tick-convert-failure.yaml:5`

**Issue:**
1. **세는 대상이 넓다.** `failedNightlyRunsOf` 는 nightly `ok=false` 기록을 날짜별로 센다. 여기에는 날짜 단위 fatal(`candidates` RPC 실패 · Storage 오류 등 runDay catch)이 모두 들어간다.
   - nightly 는 하루 두 번(23:30 · 01:30) 돌고, 실행마다 미완 날짜를 모두 다시 고른다.
   - 그래서 Supabase · GCS 장애가 하룻밤 반(실행 3회)만 이어지면 catch-up 창 10일 안의 **미완 날짜 전부**가 동시에 영구 포기된다.
   - round-1 이 요구한 것은 「날짜 단위 fatal 의 반복 상한」 이었다. 그러나 인프라 일시 장애와 원본 결함을 구분하지 않아서 일시 장애도 영구 손실로 이어진다.
2. **포기 뒤 침묵.** 알림 정책은 Job 실행 실패(`completed_execution_count result=failed`)만 본다. 포기한 날짜는 더 고르지 않으므로 Job 은 종료 0 이고 알림도 다시 오지 않는다. 남는 신호는 `logger.warn` 한 줄(nightly.ts:452-458)뿐이다.
3. **알림 문서가 어긋난다.** 알림 문서(alert yaml:5)는 여전히 「실패 날짜는 ok 기록이 없어 다음 실행이 다시 고른다(catch-up 10일)」 라고 안내한다. 운영자는 알림 3번 뒤 자동 복구를 기대하게 된다.
4. **Job 이 죽으면 세지 않는다.** OOM 이나 task timeout 으로 Job 자체가 죽으면 `runRecord` 가 쓰이지 않아 실패로 세지 않는다. 그래서 round-1 이 지적한 「거대한 날짜 하나가 매 실행 전량 재통독」 고리 가운데 크래시 경로는 그대로다.

**Fix:**
- 실패 사유를 나눈다. 원본 · 키 결함(`scanOne` throw · 업로드 영구 거부)만 포기 카운트에 넣는다. RPC · 네트워크 오류는 세지 않는다.
- 포기한 날짜가 있으면 그 실행은 종료 1 로 끝내 알림을 하루 한 번 낸다. 또는 로그 기반 알림 조건(`jsonPayload.msg:"다시 고르지 않는다"`)을 더한다.
- 알림 문서 5행을 「실패 2회 초과 날짜는 더 고르지 않는다 — `nightly --date D` 수동 재변환」 으로 고친다.
- 크래시 경로는 날짜 시작 때 `ok=null` 「시작」 기록을 먼저 쓰고, 끝나지 않은 시작 기록도 실패로 센다.

### R2-WR-30: WR-60 토큰은 `go()` 만 올린다 — 사이드바 `<Link>` · 브라우저 뒤로/앞으로는 여전히 커서 replaceState 에 버려진다

**File:** `webapp/src/components/ticks/tick-viewer-page.tsx:426-435` · `webapp/src/lib/ticks/use-tick-cursor.ts:298-306` (+ `webapp/src/app/analytics/ticks/page.tsx:19` · `node_modules/next/dist/client/components/app-router.js:319-331, 339-353` · `app-router-instance.js:131-145`)

**Issue:**
- WR-60 의 원인은 「대기 중인 액션이 있을 때 RESTORE 가 오면 그 액션을 discard 한다」는 Next 15.5.15 액션 큐 규칙이다. 이 규칙은 액션이 어디서 왔는지 가리지 않는다.
  - `app-router-instance.js:131-145` 는 ACTION_NAVIGATE 와 ACTION_RESTORE 를 같이 다룬다.
  - 패치된 `history.replaceState` 는 무조건 ACTION_RESTORE 를 dispatch 한다(`app-router.js:293-303`).
- 그런데 토큰(`navRef`)은 페이지의 `go()` 만 올린다. 아래 두 경로는 토큰을 올리지 않으므로 커서의 250ms 쓰기가 그대로 계속된다.
  1. **사이드바 `<Link>`**(`AppShell sidebar={<AppSidebar />}` — 틱뷰어 페이지에 늘 보인다): 재생 중에 다른 화면(상따 · 보고서 등)을 누르면 NAVIGATE 가 RSC 응답을 기다린다. 그 사이 커서 쓰기 한 번이면 이동이 discard 된다. 원 WR-60 과 같은 증상이다.
  2. **브라우저 뒤로 · 앞으로:**
     - `onPopState` 는 RESTORE 를 `startTransition` 으로 dispatch 한다(`:349-353`). 그래서 옛 뷰어는 전환 렌더가 커밋될 때까지 마운트돼 있다.
     - 재생 중이면 rAF · setTimeout 의 `setRec` 이 기본 우선순위로 먼저 커밋된다. 그 커밋이 쓰기를 부르면 `replaceState(null, '', 옛 뷰어 URL)` 가 실행된다.
     - 이때 브라우저의 현재 항목은 이미 **목록 항목**이다. 결과적으로 그 history 항목의 URL 이 뷰어 URL 로 덮이고, 새 RESTORE 가 화면을 뷰어로 되돌린다. 「뒤로」 가 먹지 않을 뿐 아니라 목록 항목 하나가 사라진다.
- **부차:** 토큰을 올린 뒤 push 가 다른 이유로 버려지면 뷰어는 재마운트되지 않는다. 예를 들어 push 대기 중에 뒤로를 누르는 경우다. 그러면 그 뷰어가 살아 있는 동안 `navToken0` 와 값이 다시는 같아지지 않아 URL `t` · `k` 쓰기가 영구히 멈춘다. 새로고침 · 링크 복사가 옛 자리를 가리킨다.

**Fix:** 「떠나는 중」 판정을 `go()` 밖에서도 잡는다. `useTickCursor` 안에서 모든 출구를 듣고, 쓰기를 멈추는 동시에 대기 타이머도 지운다.
```ts
// use-tick-cursor.ts — 마운트 동안
useEffect(() => {
  const leave = () => {
    leaving.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  // 같은 출처 <a href> 클릭(사이드바 Link 포함) — Link 의 onClick 보다 먼저(capture)
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && a.origin === location.origin && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey) leave();
  };
  window.addEventListener('click', onClick, true);
  window.addEventListener('popstate', leave); // 뒤로 · 앞으로 — Next onPopState 보다 먼저 등록돼 있지 않아도 쓰기 전에 실행된다
  return () => { window.removeEventListener('click', onClick, true); window.removeEventListener('popstate', leave); };
}, []);
// write(): if (leaving.current || (nav && nav.current !== navToken0.current)) return;
```
부차 문제는 이렇게 고친다. 토큰 비교를 「마운트 때 값과 다름」 대신 「지금 URL 의 (isin, d, ex) 가 `urlRef.current` 와 다름 ∨ 이동 대기 중」으로 바꾼다. 또는 push 가 끝난 뒤에도 같은 열기 키면 `navToken0` 를 현재 값으로 다시 맞춘다. e2e 에는 「재생 중 사이드바 링크 → 그 화면」 과 「재생 중 뒤로 → 목록 · history.length 그대로」 를 더한다.

### R2-WR-31: 하루치 해제 실패(WR-62)에 상한 · 백오프가 없다 — 실패가 결정적이면 5초마다 하루치 전체를 영원히 다시 받는다

**File:** `webapp/src/lib/ticks/use-tick-live.ts:219-239` (+ `:193-196` · `:177-178` · `webapp/src/components/ticks/tick-header.tsx:143-163`)

**Issue:**
- 하루치(fill) 경로에서 `appendTickBytes` 가 throw 하면 다음처럼 된다.
  - `pending = []` · `offset = 0` · `epoch = null` 로 비운다.
  - `schedule(pollMs)` 뒤 08:00 부터 다시 받는다. More 이면 8MiB 조각마다 `schedule(0)` 으로 연달아 받는다.
  - 실패를 세는 것은 `c.errors += 1` 뿐이다. 이 값으로 멈추거나 간격을 늘리는 분기는 없다.
- 원 WR-62 가 꼽은 실패 원인에는 결정적인 것이 있다.
  - `buildTickSession` 의 `boards.length >= NO_BOARD` RangeError 는 그날 그 종목 자료라면 늘 같다.
  - tickgw 캐시 안의 깨진 프레임은 epoch 가 바뀔 때까지 같다.
- 그러면 이렇게 된다.
  - 화면은 「하루치 받는 중」 카드에 머문다. 머리에는 3회 뒤 「받지 못하고 있어요」 가 뜬다.
  - 그 아래에서 하루치 전체(수 MB ~ 수십 MB · 상한 96MB 캐시)가 약 5초마다 끝없이 다시 내려온다. 탭이 보이는 한 Cloud Run egress 와 tickgw 응답을 계속 쓴다. CLAUDE.md 「API 호출 비용 최소화」 와도 어긋난다.
  - 409 뒤 refetch 중이었다면 `refetching` 이 영영 false 로 돌아오지 않는다. 그래서 IN-64 의 「다시 받는 중」 버튼(`tick-header.tsx:143`)도 영구 비활성이다.
- 증분 경로는 offset 을 그대로 둔다. 결정적 실패라면 누를 때마다 같은 조각에서 실패한다. 사용자가 새로고침하면 그 조각이 하루치 안에 들어가 위의 무한 루프로 이어진다.
- 원 리뷰가 제안한 「또는 `halt('unavailable')`」 쪽 종료 조건이 빠져 있다. 「받는 중에 갇힘」 은 「받기를 반복하며 갇힘」 으로 바뀌었을 뿐이다.

**Fix:** 연속 해제 실패를 따로 세고, 정해 둔 횟수(예 2회)를 넘으면 멈춘 뒤 사람이 다시 시도하게 한다.
```ts
// Ctl 에 decodeFailures: number 추가 · commit() 에서 0 으로
} catch (e) {
  console.warn('[ticks/live] 바이트를 풀지 못함', e);
  c.errors += 1;
  c.decodeFailures += 1;
  if (c.decodeFailures >= TICK_LIVE_DECODE_MAX /* 2 */) {
    c.refetching = false;
    return halt('unavailable'); // 또는 새 status 'corrupt' → 카드 「자료를 풀지 못했어요 · 다시 시도」(resume 으로 0 부터 1회)
  }
  if (fill) { c.pending = []; c.offset = 0; c.epoch = null; publish(); return schedule(pollMs * 2 ** c.decodeFailures); }
  return publish();
}
```
`use-tick-live.test.tsx` 에 「늘 깨진 본문 → 요청 수가 N 에서 멈춘다 · status 가 멈춤」 케이스를 더한다.

## Info

### R2-IN-01: `skipped_records` · `compressed_files_skipped` 가 형식이 틀리면 조용히 0 — CR-31 완결 게이트가 fail-open

**File:** `tickgw/src/indexer.ts:120-122,147-148`

**Issue:** `countOrZero` 는 필드가 없을 때(옛 응답 · gh-trade 가 허용)뿐 아니라 **있는데 형식이 틀릴 때**도 0 을 낸다. 예를 들어 ns 필드처럼 문자열 `"3"` 으로 오거나 음수일 때다. 이때는 로그도 없다. 두 값은 CR-31 의 「승격 안 함」 판정 입력이다. 계약 표류 한 번이면 잘린 하루가 다시 complete 로 승격된다(무로그 fail-safe 금지 메모리 규칙).

**Fix:** `undefined` 만 0 으로 본다. 그 밖에 정수가 아닌 값은 `null` 로 돌려서 `parseMeta` 실패(→ "fail" 분류) 처리하거나, 최소한 `complete=false` 와 warn 로그로 다룬다.

### R2-IN-02: WR-30 받기 전 크기 판정 문턱(100MiB)이 tickgw 키 상한(96MiB)보다 커서 기본 설정에선 발동하지 않는다

**File:** `workers/tick-convert/src/modes/promote.ts:100,181-186` · `workers/tick-convert/src/store.ts:20` · `tickgw/src/config.ts:144` · `tickgw/src/cache.ts:128`

**Issue:** `GRID_MAX_BYTES × PREFETCH_FACTOR` 는 52,428,800 × 2 = 104,857,600B 다. tickgw 는 키 하나가 `limitBytes`(기본 100,663,296B)를 넘으면 `too_large` 로 처리한다. 그러면 complete=false 이므로 closed 가 되지 않고 export 에 나오지 않는다. 따라서 export 에 실리는 `key.bytes` 는 언제나 문턱보다 작다. 「2Gi Job 안에서 큰 키 원시를 펼치지 않는다」 는 의도가 실제로는 동작하지 않는다. 받은 뒤 판정(206행)은 정상이다.

**Fix:** 문턱을 원본 압축 크기 기준으로 다시 잡는다(예: `GRID_MAX_BYTES` 자체 또는 그 1.2배). 또는 해제 전에 `splitZstdFrames` 프레임 헤더의 content size 합으로 원시 크기를 추정해 판정한다.

### R2-IN-03: WR-33 「캐시 가득(full)」 은 119 를 부른 뒤 결과를 버린다 — 자리가 날 때까지 60초마다 같은 범위를 다시 읽는다

**File:** `tickgw/src/poller.ts:405-408,483-486,594-597,678-689`

**Issue:** 보호된(리스 살아 있는) 키 합이 상한에 닿으면, 새 키는 매 백오프(최대 60초)마다 119 를 호출한다. 이 호출은 08:00 부터 최대 16MB 를 읽는다. 그런데 `append` 가 `full` 이면 응답을 그대로 버린다. 상한이 활성 8키라 호출량은 묶여 있지만, 버려질 것이 확실한 질의를 119(코어 0 공유)에 계속 보낸다.

**Fix:** 호출 전에 `cache.canFit(key, estimate)` 같은 사전 판정을 둔다(보호 안 된 몫 + 여유가 0 이면 호출하지 않고 백오프). 또는 `full` 이 연속되면 그 키를 `blocked` 로 두고 리스 변화(다른 키 해제) 때만 다시 시도한다.

### R2-IN-04: 따라잡기 대상 고정의 전제 「19:55 뒤 리스가 끝난 키는 이미 몇 분 안쪽까지 받았다」 가 queued 키에서 틀린다

**File:** `tickgw/src/poller.ts:52,505-510,527-533`

**Issue:** 활성 8키 밖에서 기다리던(queued) 키는 한 번도 폴링되지 않았을 수 있다. 그래서 `lastRecvNs = null` 이다. 이런 키가 19:55 에 리스가 살아 있으면 대상에서 빠진다(의도). 그런데 19:56 에 리스가 끝나도 대상은 이미 고정돼 다시 들어오지 않는다. 그러면 20:01 마감 마무리가 08:00 부터 읽는다. 그 시각엔 이른 시간 파일이 압축 중이므로 `compressed_files_skipped` 가 생겨 승격되지 않는다. 같은 일이 실패 백오프 중이던 키(`run.failures > 0`)에도 생긴다.

**Fix:** 대상 고정 대신 창 안에서는 매 step 「리스가 끝났고 아직 대상에 넣은 적 없는」 키를 더 넣는다(`catchupSeen` 집합). 머리 주석의 전제 문장도 고친다.

### R2-IN-05: 75 의 뜻이 「색인 준비 안 됨(최대 수십 분)」 까지 넓어졌는데 2초 재시도에 상한 · 단계가 없다

**File:** `tickgw/src/poller.ts:17,489-491,602-604,703-706`

**Issue:** gh-trade 4f474b1f 이후 75 에는 「처음부터 재색인이면 수십 분」 이 포함된다. tickgw 는 75 를 실패로 세지 않고 키마다 2~2.5초 뒤 다시 부른다. 활성 8키 · 마감 마무리 · 따라잡기가 모두 그렇게 한다. 재색인이 30분이면 초당 수 회 · 수천 회의 ssh 채널 실행이 119 에 간다. gh-trade 회신은 「처리 그대로 맞는다」 고 했지만, 지속 시간이 바뀐 만큼 호출 규율(차단 신호를 두드리지 않는다)의 취지와는 거리가 있다.

**Fix:** 75 가 연속 N 회(예: 5회 · 약 10초)를 넘으면 전역 대기를 단계적으로 늘린다(5 → 15 → 30초). 첫 정상 응답에서 되돌린다. 75 는 실패로 세지 않는 규칙을 유지한다.

### R2-IN-06: WR-02 합류가 상한에 걸리면 빠진다 — stale pending 에 합류하려던 사용자는 요청자 집합에 들지 않는다

**File:** `supabase/migrations/20261104300100_tick_request_requesters.sql:100-126`

**Issue:** (6b) 합류 UPDATE 는 `IF NOT capped` 안에 있다. 이미 pending 인데 2분이 지난(stale) 행에 다른 사용자가 오면 상한 검사를 거친다(R2-WR-02 를 고친 뒤에는 NULL 인 경우도 포함). 상한에 걸리면 capped 를 받고 집합에 들지 않는다. 그 뒤 원래 요청자가 취소하면 이 사용자 화면은 cancelled 를 본다. 합류는 Job 0 · 상한 0 이어야 한다는 설계(머리 주석 ②)와 어긋난다.

**Fix:** (6b) 를 상한 판정 밖으로 옮긴다. 합류는 항상 하고, 재트리거(7)만 상한으로 막는다. capped 응답에는 「진행 중 요청에 합류함」 을 함께 실을 수 있다.

### R2-IN-07: `ALLOW_DIRTY=1` 을 같은 HEAD 에서 두 번 쓰면 태그 `<sha>-dirty` 가 겹쳐 되돌림이 꺼지고 앞 이미지가 덮인다

**File:** `scripts/deploy-tickgw.sh:142-149,266-276`

**Issue:** 두 번째 dirty 배포는 `TARGET_IMAGE == PREV_IMAGE` 다. 그래서 `fail_rollback` 이 「되돌릴 교체 전 이미지가 없다」 로 끝나고 tickgw 가 0개가 된다. 같은 태그로 `docker pull` 하면 VM 의 앞 이미지 내용도 사라진다. deploy-tick-convert.sh:115-118 도 같은 태그 규칙이다.

**Fix:** `-dirty-$(date +%s)` 나 `-dirty-<git diff 해시 앞 8자>` 처럼 매번 다른 접미를 붙인다. 되돌림은 태그가 아니라 `docker inspect --format '{{.Image}}'`(이미지 ID)로 잡는다.

### R2-IN-08: 설정 주석이 바뀐 창 끝(19:59)과 어긋난다

**File:** `tickgw/src/config.ts:27`

**Issue:** 「20:00 이후 값은 거부(창이 비어 뜻이 없다)」 라고 적혀 있지만, 실제로는 `hhmm >= 1959` 를 거부한다(126행). REVIEW-FIX CR-31-F 의 「20:00 이후 값은 설정 오류로 거부」 도 옛 문장이다.

**Fix:** 「19:59 이후 값은 거부」 로 고친다.

### R2-IN-30: IN-63 후속(`90173169`)의 scrollTop 보정은 커서 행을 기준으로 한다 — 사용자가 커서에서 떨어진 곳을 보고 있을 때(IN-63 이 지키려던 상황) 보던 화면이 밀린다

**File:** `webapp/src/components/ticks/tick-msg-list.tsx:615-629` (+ `webapp/src/lib/ticks/use-fixed-window.ts:36-58`)

**Issue:**
- 보정은 「모델만 바뀌고 커서 rec · mode 가 그대로」 일 때 `scrollTop += (selPos − prev.pos) × rowH` 다. 이것은 **커서 행**이 화면에서 같은 자리에 머물게 하는 식이다.
- IN-63 의 대상은 「과거 틱을 보며 목록을 훑던」 사용자다. 이 사용자의 viewport 는 커서 행과 멀다. 그래서 둘이 갈린다.
  - 끼어든 줄(우리 주문 줄 · NOFILL 줄 — own 재조회 · 대기 해제로 자리가 바뀜)이 viewport 와 커서 **사이**에 있으면, viewport 앞에는 바뀐 것이 없는데도 화면이 그 줄 수만큼 밀린다.
  - 반대로 커서가 viewport 보다 위에 있고 줄이 그 사이에 끼면 보정이 0 이다. 그러면 보던 줄이 아래로 밀린다.
- 이 보정은 `el.scrollTop` 만 바꾸고 `useFixedWindow` 의 `scrollTop` 상태는 바로 올리지 않는다. `scrollToIndex` 는 상태를 올린다. 그래서 scroll 이벤트 → rAF 가 돌 때까지 한 프레임 동안 옛 scrollTop 으로 계산한 창이 그려진다. 차가 크면 빈 spacer 가 잠깐 보인다.
- 지금 자료 흐름에서 차는 대개 몇 줄이다. 거래소순은 수신순 자리를 그대로 두므로 증분은 끝에 붙는다. 그래서 Info 로 둔다.

**Fix:** 보정 기준을 「보이던 첫 항목」 으로 바꾼다.
- 먼저 직전 모델에서 `floor(scrollTop / rowH)` 항목의 identity(rec 또는 own id)를 기억한다.
- 새 모델에서 그 항목의 자리를 찾아 `scrollTop` 을 맞춘다.
- 커서 행이 직전 viewport 안에 있었을 때만 지금의 커서 기준 보정을 써도 된다.
- 어느 쪽이든 `useFixedWindow` 에 `scrollToOffset(px)` 를 두어 상태를 같이 올린다.

### R2-IN-31: More 이어 받기의 끝 조건 — 증분 상한(16)에 닿아도 신호가 없고, 하루치 More 는 진행 확인 없이 `schedule(0)` 이다

**File:** `webapp/src/lib/ticks/use-tick-live.ts:212-218`, `:255-260`

**Issue:**
- **증분:** `moreChain` 이 16 에 닿으면 `moreChain = 0; publish()` 로 끝난다.
  - 헤더는 평소의 「최신 받기」 로 돌아오고, 캐시에 더 있다는 표시는 없다.
  - 마지막 meta 는 tickgw 가 More 일 때 덮어 쓴 `state: 'loading'` 이다(`tickgw/src/server.ts:204-205`). 그래서 페이지의 `liveAsOfMs` · `liveServerAsOfMs` 는 다음 누름까지 null 이다. 이 값은 `state === 'ready'` 일 때만 채워지므로, 우리 체결 대기 판정이 그동안 as-of 없이 돈다.
- **하루치:** `m.more === true` 면 `offsetEnd` 가 실제로 앞으로 갔는지 보지 않고 곧바로 다시 요청한다.
  - tickgw `boundedEnd` 는 첫 청크를 늘 싣는다. 그래서 지금 계약으로는 진행이 보장된다.
  - 그러나 웹 쪽에는 방어선이 없다. 계약을 어긴 응답(More=true · 0바이트 · 같은 offsetEnd)이 오면 RTT 간격으로 끝없이 요청한다.

**Fix:**
- 증분 상한에 닿으면 `c.meta = { ...m, more: true }` 를 남긴다. 머리는 「더 있음 · 다시 눌러 이어 받기」 로 보인다.
- 두 경로 모두 `m.more && m.offsetEnd > prevOffset` 일 때만 이어 받는다. 아니면 오류로 세고 멈춘다.

### R2-IN-32: 「당일 자료 일부 빠짐」 배지(WR-63)가 409 다시 받기 중에는 화면 세션이 아니라 새 epoch 의 중간 meta 를 읽는다

**File:** `webapp/src/components/ticks/tick-viewer-page.tsx:476` (+ `webapp/src/lib/ticks/use-tick-live.ts:212-216`)

**Issue:**
- refetch 중에도 하루치 loading 응답마다 `commit(m)` 이 `c.meta` 를 새 epoch 값으로 바꾼다. 그동안 화면은 옛 세션을 그대로 보인다(머리 주석 ④).
- 그런데 배지 조건은 `live.session !== null && live.meta?.complete === false` 다. 그래서 옛 세션의 끊김 배지가 새 엔트리 값(대개 true)에 따라 다시 받는 동안 사라진다. 반대도 생긴다.
- 같은 파일의 as-of 두 값은 이 어긋남을 알고 `state === 'ready'` 로 막아 두었다(`:386-390` 주석). 배지만 빠졌다.

**Fix:**
- 가장 간단한 방법: `incomplete: live.session !== null && !live.refetching && live.meta?.complete === false`.
- 더 정확한 방법: 세션을 바꾸는 publish 에서 `sessionComplete` 를 따로 들고 그 값을 쓴다.

## Round-1 resolution check

### Part 백엔드 — shared · DB · server · tickgw · tick-convert · 스크립트

| ID | 해소 | 근거 · 남은 것 |
|----|------|----------------|
| CR-30 | yes | `checkKey` 가 null 을 허용하고 키 단위로 `rejected` 에 담는다. 0건 키는 incomplete 다. 가짜 tickgw 가 실제 계약(null)과 같다. 배포 이미지 a6cc71e0 에 포함됐다. |
| CR-31 | yes(정확성) · partial(승격률) | `compressed_files_skipped` · `skipped_records` > 0 이면 complete=false 다. 승격률 보전용 19:55 따라잡기는 R2-WR-01(LRU 자기 삭제) · R2-IN-04 때문에 기대보다 덜 지킨다. |
| WR-01 | partial | 횟수 기반 상한과 되돌림은 맞다. NULL 단락 우회가 남았다(R2-WR-02). |
| WR-02 | yes(DB) | 요청자 집합, 내 몫 빼기 취소, 같은 advisory 잠금, 응답에 `requesters` 비노출을 확인했다. 합류가 상한에 걸리는 틈이 있다(R2-IN-06). 웹 쪽은 형제 리뷰 몫이다. |
| WR-03 | yes | 게이트가 두 파일이 모두 있는지 본다. 생성기 안내도 같다. |
| WR-30 | yes | 받은 뒤 `GRID_MAX_BYTES` 판정 → tooLarge(종료 0). 받기 전 판정은 기본 설정에서 발동하지 않는다(R2-IN-02). |
| WR-31 | yes | `parts` subarray 스트리밍 · 캐시 96MB · stdout 20MB. |
| WR-32 | yes | 프레임 경계 8MiB · `X-Tick-More` · loading 덮어쓰기 · server 복사 제거 · shared 헤더와 CORS 노출(ca2c0e01). |
| WR-33 | yes | 리스 보호 · full · too_large · tooLargeKeys. 부작용으로 R2-IN-03(헛호출)이 있고, 따라잡기와 결합하면 R2-WR-01 이 생긴다. |
| WR-34 | yes | 21:00 가드 · 교체 전 이미지 되돌림 · env-file 늦은 삭제. dirty 태그가 겹치면 되돌림이 빠진다(R2-IN-07). |
| WR-35 | yes | 두 스크립트 모두 `TICKGW_URL` 필수 · `TICKGW_DISABLE=1` 명시 · 동시 지정 거부 · 옛 승격 Job 경고. |
| WR-36 | partial | 반복 실패 날짜를 고르지 않는다. 일시 장애도 포기하고, 포기 뒤 침묵하며, 알림 문서가 어긋나고, 크래시 경로가 빠졌다(R2-WR-03). |
| IN-01 | yes | `hits15(pct, chg, px)` · 바깥 호출처 0. |
| IN-02 | yes | JSDoc 전제 명시(가드를 넣지 않은 근거 타당). |
| IN-03 | yes | 합성 프레임 4종 · 카운터 단언. |
| IN-04 | yes | `fieldOf` 가 kind · 고정 폭을 모듈 로드 때 잠근다. |
| IN-05 | yes | `numOf` · `strOf` 하나로, `decodeAny` → `layoutOf`. |
| IN-06 | yes | `WITH ORDINALITY` + `DISTINCT ON … ord DESC` · REVOKE/GRANT 재진술 · 최신 정의(20261103230000)의 팀 3칸 보존. |
| IN-07 | yes | `scope_of` → `SystemExit("[oracle] …")`(종료 1). |
| IN-08 | yes | `check_size` 를 모든 부명령에 적용(`set -e` 로 종료 1) · bigtech 예외 명시. |
| IN-30 | yes | 넘치면 청크를 비우고 `Buffer.alloc(0)` · `code ?? -1`. |
| IN-31 | yes | TIMEOUT 은 되돌리지 않고 stale 2분 규칙에 맡긴다(그 뒤 재트리거는 non-null triggered_at 이라 상한을 거친다). |
| IN-32 | yes | nightly · request 요약과 실행 기록에 `truncated n`. |
| IN-33 | yes | 빌드 입력 dirty 가드(Dockerfile COPY 경로와 일치) · `REMOTE_OK` 표지로 IAP 실패를 구분. |
| IN-34 | yes | 서명 전 `checkOpenShape`(봉투 · grid 필드). |

### Part webapp

| ID | 해소 | 근거 |
|---|---|---|
| WR-60 | partial | `go()` 경로(목록으로 · 날짜 · 거래소 · 종목)는 닫혔다. 같은 열기 키면 토큰을 올리지 않아 영구 정지가 없고, 재마운트 때 `navToken0` 를 다시 잡는다. 사이드바 Link · 뒤로/앞으로는 열려 있다 → R2-WR-30 |
| WR-61 | yes | `sessionRef` · `liveRef` · 범위 가드가 있다. ref 동기화 effect 가 쓰기 effect 보다 먼저 선언돼 같은 커밋 값을 읽는다 |
| WR-62 | partial | 커밋 순서(붙인 뒤 offset)와 마지막 방어선은 맞다. 다만 결정적 실패에 종료 조건이 없다 → R2-WR-31 |
| WR-63 | yes | 배지가 있다(`role=status` · title). refetch 중 출처가 어긋나는 것은 R2-IN-32 |
| WR-64 | yes | trim · `/^\d+$/` · safe integer 를 확인하고, null 이면 502 로 간다 |
| WR-65 | yes | `k` 쓰기 · 읽기가 서로의 역이다. 옛 `t`-only 링크(세 보고서 알약)와 호환된다. 슬라이더 같은 시각 점프는 no-op 이다 |
| IN-60 | yes | 진입 화면에서만 1분 · 탭 복귀 때 다시 정하고, 타이머 정리가 맞다. 오늘 목록 열기는 응답 `date` 를 쓴다 |
| IN-61 | yes | `supplyOf` 가 열린 경로로 정한다 |
| IN-62 | yes | 바이트마다 정지 타이머를 다시 잰다. 마지막 소비자가 떠날 때만 abort 하고, 자기 inflight 인지 확인한다 |
| IN-63 | yes | 모델만 바뀌면 커서로 끌어오지 않는다. 후속 보정의 기준 행은 R2-IN-30 |
| IN-64 | yes | `refetching` 이면 비활성 · 「다시 받는 중」. 단 R2-WR-31 상황에서는 영구 비활성이 된다 |
| WR-02-W | yes | 열 때 `!stale` 이면 join(실패해도 화면 유지)하고, stale 이면 기존 재트리거를 탄다. 폴링의 `cancelled` 는 「취소됨 · 다시 요청」 카드다 |
| WR-32-W | yes | `X-Tick-More` 가 shared 헤더 · CORS 노출 · 웹 파싱에 들어갔다. 증분 연쇄 상한은 16, 하루치 More 는 즉시 이어 받는다. 끝 조건 보강은 R2-IN-31 |

---

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer × 2 parts)_
_Depth: standard_
