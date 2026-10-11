---
phase: 28-limitup-feature-ingest
round: 2
reviewed: 2026-10-10T01:23:06Z
depth: standard
base_review: .planning/phases/28-limitup-feature-ingest/28-REVIEW.md
fix_report: .planning/phases/28-limitup-feature-ingest/28-REVIEW-FIX.md
commits_reviewed:
  - b38987b8
  - ef2ec49c
  - 453c1bc2
  - 59376d3e
  - cb245cdc
  - 02f6e852
  - 7757ea46
  - 1982d612
  - 6d0044a4
  - c28651a9
  - 6be91f1f
  - 6cc4d55c
  - 1b66a044
files_reviewed: 35
files_reviewed_list:
  - infra/relay/limitup-pull/limitup-pull.sh
  - ops/alert-limitup-sync-failure.yaml
  - relay/src/hub/subscription-hub.ts
  - relay/tests/hub.test.ts
  - scripts/deploy-limitup-sync.sh
  - server/src/errors.ts
  - server/src/middleware/error-handler.ts
  - server/src/services/dma-orders.ts
  - server/src/services/limitup-report.ts
  - server/tests/middleware/error-handler.test.ts
  - server/tests/routes/limitup-report.test.ts
  - supabase/migrations/20261006090500_limitup_commit_day_timeout.sql
  - supabase/tests/dma_strategy_limit_feature.test.sql
  - supabase/tests/dma_strategy_read.test.sql
  - supabase/tests/limitup_report.test.sql
  - webapp/src/components/analytics/__tests__/limitup-day-grid.test.tsx
  - webapp/src/components/analytics/limitup-day-grid.tsx
  - webapp/src/lib/__tests__/use-limitup-grid.test.tsx
  - webapp/src/lib/__tests__/use-order-log-feed.test.tsx
  - webapp/src/lib/use-limitup-grid.ts
  - webapp/src/lib/use-order-log-feed.ts
  - webapp/src/lib/use-relay-socket.ts
  - workers/limitup-sync/Dockerfile
  - workers/limitup-sync/package.json
  - workers/limitup-sync/src/config.ts
  - workers/limitup-sync/src/freshness.ts
  - workers/limitup-sync/src/grid.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/src/purge.ts
  - workers/limitup-sync/tests/config.test.ts
  - workers/limitup-sync/tests/dispatch-dryrun-totals.test.ts
  - workers/limitup-sync/tests/dispatch.test.ts
  - workers/limitup-sync/tests/freshness.test.ts
  - workers/limitup-sync/tests/load.test.ts
  - workers/limitup-sync/tests/purge.test.ts
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Phase 28: 코드 리뷰 보고서 — 2라운드 (증분)

**검토 시각:** 2026-10-10T01:23:06Z
**깊이:** standard
**검토 파일:** 35
**상태:** issues_found

## 요약

1라운드 수정 커밋 11개(`fix(28)`)와 6cc4d55c(radar-gw mawk), 1b66a044(pgTAP 픽스처 재기반 · dry-run 합계 테스트)를 diff 단위로 읽었다. 주변 코드도 함께 읽어, 각 수정이 지적을 실제로 닫는지와 새 결함을 만들지 않았는지를 확인했다. relay `subscription-hub.ts` · webapp `use-relay-socket.ts` 는 Phase 28 부분만 봤다. 85 캐시와 FULL→PRICE 강등 시 캐시 삭제가 그 범위이고, Phase 29 다중 서버 로직은 보지 않았다.

로컬에서 확인한 테스트:
- `pnpm -C workers/limitup-sync test`: 9 files · 94 통과
- server `error-handler` · `limitup-report`: 25 통과
- webapp `use-order-log-feed` · `use-limitup-grid` · `limitup-day-grid`: 43 통과
- relay `hub.test.ts`: 111 통과
- pgTAP 3파일은 로컬 DB 컨테이너가 없어 실행하지 못했다. 정적으로만 대조했다. `dma_users.dma_user_id` 의 `octet_length <= 8` 제약 때문에 `dma-shared` 는 `dma-shr` 같은 식으로 개명됐고, 이 개명이 제약과 맞는 것까지 확인했다.

**1라운드 수정별 판정**

| 지적 | 판정 | 비고 |
|---|---|---|
| CR-B01 날짜 격리 | 닫힘 | 날짜 루프 격리 · purge 도달 · 종료 1 확인. 부수 결함은 IN-R2-01 · IN-R2-05 |
| WR-A01 relay 85 캐시 | 닫힘 | 강등 두 자리 · `resubscribeAll` · 늦은 85 버림 모두 맞다. linger(FULL) 갱신 조건도 정확하다 |
| WR-A02 kind 15 축출 틈 | **부분** | 「같은 틈 1회」 보장이 축출마다 깨진다 → WR-R2-01 |
| WR-A03 pref 하이드레이션 | 닫힘 | 첫 렌더가 false 여도 ④ 기준선 · ② ready 효과에 부작용이 없다 |
| WR-A04 격자 LRU | 닫힘 | 잔여 누수 1건(IN-R2-06) |
| WR-A05 행 설명 | 닫힘 | 이후 quick(865257ea)에서 열이 바뀌었지만 `rowDescription` 도 같이 갱신됐다 |
| WR-B01 신선도 | 닫힘 | 정리 실패와 겹치면 stale 로그가 사라진다 → WR-R2-02. 캘린더 만료 신호 없음 → IN-R2-02 |
| WR-B02 commit 소요 · timeout | 닫힘 | 임계는 이후 ecf7c173 에서 30초. 마이그레이션 머리말 수치가 낡았다(IN-R2-07) |
| WR-B03 cause 로깅 | 닫힘 | 응답 본문은 고정 문구 그대로이고, cause 는 warn 로그에만 실린다 |
| WR-B04 섞인 보고서 내리기 | 닫힘(보고서 경로) | grid-urls · 지문 경로는 `files_sig` 를 보지 않는다(IN-R2-04) |
| WR-B05 purge 단계 격리 | 닫힘 | 단계별 try · `partial` · 한 번 throw 를 확인했다 |
| 6cc4d55c mawk | 닫힘 | 스크립트 안에 `{n}` 반복이 남은 awk 는 없다(70행은 bash `=~`, 261행은 GNU sed BRE 라 무관) |
| 1b66a044 테스트 | 유효 | 불변식(합계 == manifest rows 합)과 창 밖 날짜 제외를 함께 잠근다 |

Critical 은 없다. Warning 2건은 아래와 같다.
- WR-R2-01: WR-A02 수정이 비정상 상태(DB 기록 지연 · REST 결과가 꼬리를 못 옮김)에서 종일 조회 요청 폭주로 바뀐다.
- WR-R2-02: 보존 정리가 실패하면 WR-B01 의 stale 신호가 로그에서 사라진다.

## Warnings

### WR-R2-01: WR-A02 틈 메우기 가드가 「가장 오래된 라이브 줄」 키라서, 재조회가 틈을 못 메우면 새 kind 15 한 줄마다 종일 `?lf=1` 을 다시 부른다

**File:** `webapp/src/lib/use-order-log-feed.ts:182-193`

**Issue:**
- 가드 키는 `strategyEventKey(oldestLive)` 다. `limitFeatureEvents` 는 상한 5,000 에서 `slice(merged.length - limit)` 로 앞을 버린다(`use-relay-socket.ts` `upsertStrategyEvents`). 그래서 상한에 닿은 뒤에는 **새 kind 15 가 한 줄 들어올 때마다 `oldestLive` 가 바뀌고 가드 키도 새로 생긴다**.
- 재조회 응답이 꼬리(`lfTail`)를 `oldestLive` 뒤로 옮기지 못하면 효과가 다시 조건을 만족한다. `lfStatus` 가 `'ready'` 로 돌아오는 즉시, 다음 축출에서 또 재조회한다. 꼬리를 못 옮기는 경우는 둘이다.
  - relay 관찰자의 Supabase 기록이 밀리거나 멈춘 채 라이브 푸시만 계속되는 경우
  - REST 가 그날 kind 15 를 0 건 돌려줘 `lfTail === undefined` 인 경우
- 그러면 장중 분당 수십 줄 속도로 하루치 kind 15(수천~1만 행, jsonb 단일 값)를 매번 통째로 다시 받는다. 장애 중인 Supabase · Cloud Run 에 브라우저 탭마다 그 부하가 얹힌다.
- 주석의 「응답이 여전히 틈을 못 메워도 다음 축출 전까지 다시 부르지 않는다」 는 사실이지만, 「다음 축출」 은 몇 초 뒤다. 「루프 금지」 를 보장하지 못한다.
- 테스트(`use-order-log-feed.test.tsx:487-511`)는 응답이 틈을 못 메운 상태에서 **같은 라이브 목록으로** rerender 만 한다. 라이브 줄을 하나 더 넣으면 3번째 호출이 나간다.

**Fix:** 가드를 「직전 재조회가 꼬리를 옮겼는가」 와 최소 간격으로 건다.
```ts
const lfGapRef = useRef<{ tail: string | null; at: number } | null>(null);
const LF_GAP_MIN_INTERVAL_MS = 60_000;
useEffect(() => {
  if (!showLimitFeature || !isToday || !lfCached || lfStatus !== 'ready') return;
  if (oldestLive === undefined || oldestLive.tradeDate !== date) return;
  if (lfTail !== undefined && compareStrategyEventAsc(lfTail, oldestLive) >= 0) return;
  const tail = lfTail ? strategyEventKey(lfTail) : null;
  const last = lfGapRef.current;
  // 직전 재조회가 꼬리를 못 옮겼다 → 서버가 아직 모른다. ready 전이 · retry 가 새로 받을 때까지 멈춘다.
  if (last !== null && last.tail === tail) return;
  if (last !== null && Date.now() - last.at < LF_GAP_MIN_INTERVAL_MS) return;
  lfGapRef.current = { tail, at: Date.now() };
  void loadLf();
}, [/* 동일 */]);
```
그리고 「응답이 틈을 못 메운 뒤 라이브 줄이 하나 더 들어와도 다시 부르지 않는다」 를 테스트로 잠근다.

### WR-R2-02: 보존 정리가 실패하면 dispatch 가 결과를 돌려주지 못해 WR-B01 의 `limitup-sync stale` 로그가 나가지 않는다

**File:** `workers/limitup-sync/src/index.ts:311-327`, `:332-357`

**Issue:**
- WR-B05 로 정리 세 단계는 서로 막지 않게 됐다. 그러나 하나라도 실패하면 `purgeOld` 가 throw 하고, dispatch 는 그 throw 를 그대로 다시 던진다(325행). 그래서 `main` 은 `result` 를 받지 못하고 catch 의 `"limitup-sync failed"` 한 줄만 남긴다.
- 그 결과 `freshness.stale` 판정과 `"limitup-sync stale"` error 로그(337-341행)는 실행되지 않는다. 336행 주석의 설계 의도는 「실패 · alert 와 겹쳐도 따로 남긴다 — 로그 검색 한 줄로 찾을 수 있어야 한다」 이다.
- 정리 실패는 매일 반복될 수 있다. 예: Storage 권한 · 버킷 정책 변경, kind 15 RPC 의 권한 회귀. 그동안 119 export · radar-gw 운반이 멈추면 운영자는 알림 문서(`ops/alert-limitup-sync-failure.yaml`)가 안내하는 `limitup-sync stale` 을 검색해도 아무것도 찾지 못한다. 정리 실패를 고친 뒤에야 운반 정지가 드러난다.
- 종료 코드는 어느 쪽이든 1이므로 알림 자체는 울린다. 하지만 원인 신호가 가려진다.

**Fix:** 정리 오류를 결과에 담고, 종료 코드 판정은 main 한 곳에서 한다.
```ts
// DispatchResult 에 추가
purgeError: { message: string; partial?: PurgeResult } | null;

// dispatch
} catch (err) {
  const partial = (err as { partial?: PurgeResult }).partial;
  log.error({ loaded: result.loaded, grids: result.grids, partial, err }, "limitup purge failed — 적재는 끝남");
  result.purgeError = { message: err instanceof Error ? err.message : String(err), partial };
}
return result;

// main — stale 로그 뒤에
if (result.purgeError) { logger.error({ result }, "limitup-sync purge failed"); return 1; }
```
「정리 실패 + stale → stale 로그와 종료 1」 테스트를 더한다.

## Info

### IN-R2-01: skip 기록 RPC 실패나 unchanged streak 초기화 실패가 `record_skip(date, "load")` 를 한 번 더 불러, 사유를 덮어쓰고 streak 를 부풀린다

**File:** `workers/limitup-sync/src/index.ts:151-168`, `:199-205`, `:292-306`

**Issue:** `skip()` 안의 `recordSkip` 이 throw 하면, 루프 catch 가 그 날짜를 `failed` 에 넣고 `recordSkip(date, "load")` 를 또 부른다.
- 첫 RPC 가 일시 오류였고 둘째가 성공하면, `last_skip_reason` 이 실제 사유(sha · schema · manifest)가 아니라 `"load"` 로 남는다.
- 첫 RPC 는 증가에 성공했지만 응답이 정수가 아니어서(156행) throw 한 경우, 한 run 에 streak 가 +2 된다. 「3연속」 알림이 실제 2박 만에 날 수 있다.
- 같은 날짜가 `skipped[reason]` 과 `failed` 양쪽에 남는다.
- unchanged 날짜의 streak 초기화(200-204행)가 실패하면, 정상 적재·무변경인 날짜에도 `"load"` skip 이 1 쌓인다.

**Fix:** 루프 catch 에서 오류 출처를 구분한다. `recordSkip` · streak 초기화에서 난 오류(전용 Error 클래스나 플래그로 표시)는 `failed` 에만 넣고 `recordSkip("load")` 를 다시 부르지 않는다.

### IN-R2-02: 신선도 판정이 KRX 캘린더 seed 만료(`isKrxCalendarStale`)를 보지 않는다

**File:** `workers/limitup-sync/src/freshness.ts:32-46`

**Issue:** `@gh-radar/shared` 는 `KRX_HOLIDAYS_SEEDED_THROUGH = "2026-12-31"` 과 `isKrxCalendarStale` 를 제공하지만, `freshnessOf` 는 이를 쓰지 않는다.
- 2027 년부터는 휴장일이 거래일로 세진다. 2027 추석(9/14~16 화~목)처럼 평일 휴장이 사흘 이어지면 거짓 stale(종료 1)이 난다.
- 그 전에도 「캘린더가 비었다」 는 신호가 어디에도 없다. 머리말 주석은 이 한계를 적었지만, 운영 신호로는 이어지지 않는다.

**Fix:** 세는 구간이 `KRX_HOLIDAYS_SEEDED_THROUGH` 를 넘으면 `Freshness` 에 `calendarStale: true` 를 싣는다. main 은 warn 로그(「KRX 휴장일 seed 갱신 필요」)를 낸다.

### IN-R2-03: `LIMITUP_SKIP_DATES` 를 안내대로 `gcloud run jobs update` 로 켜면, 다음 배포의 `--set-env-vars` 가 조용히 지운다

**File:** `scripts/deploy-limitup-sync.sh:21-23`, `:94`, `:113`

**Issue:** 주석은 배포 없이 켜는 방법으로 `--update-env-vars` 를 안내한다. 그런데 배포 스크립트는 셸 env 에 `LIMITUP_SKIP_DATES` 가 없으면 그 키를 빼고 `--set-env-vars` 로 Job env 전체를 교체한다.
- 운영자가 잊으면 제외했던 영구 오류 날짜가 다음 밤부터 다시 실패해 매일 알림이 울린다. 소리 나는 실패라 Info 로 둔다.

**Fix:** 배포 전에 라이브 Job env 에서 현재 값을 읽는다(`gcloud run jobs describe … --format='value(…env)'`). 셸 값이 비어 있는데 라이브 값이 있으면 경고하고 중단하거나 라이브 값을 이어받는다.

### IN-R2-04: WR-B04 의 「보고서에서 내리기」 가 격자 URL · 지문 경로에는 닿지 않는다

**File:** `supabase/migrations/20261006090400_limitup_report_rpcs.sql:129-146`(`limitup_grid_isins_for_user`), 같은 파일 `:102-121`(지문 `v_fp`)

**Issue:**
- `limitup_grid_isins_for_user` 는 `files_sig` 를 보지 않는다. 그래서 내려진 날짜에도 옛 `grid_summary` 의 isin 으로 (이미 새 export 로 덮인) 격자 서명 URL 을 발급한다.
- 지문 집계는 `limitup_member_daily` 를 날짜 범위로만 합산하므로 내려진 날짜의 옛 행이 그대로 들어간다.
- webapp 은 `loaded:false` 날짜에 격자를 요청하지 않으므로, 실제 노출은 두 경로로 한정된다.
  - API 직접 호출
  - 실패 run 이전부터 열려 있던 페이지(URL 목록 모듈 캐시)

**Fix:** 격자 RPC 에 `EXISTS (SELECT 1 FROM limitup_loads l WHERE l.date = p_date AND l.files_sig IS NOT NULL)` 게이트를 넣는다. 지문 합산은 `d.date IN (SELECT date FROM limitup_loads WHERE files_sig IS NOT NULL)` 으로 제한한다. 결정 사안이면 리뷰 FIX 에 「의도적 범위 밖」 으로 남긴다.

### IN-R2-05: 실패 · 제외 날짜의 `limitup_stage` 잔여 행이 보존 창(90일) 동안 남는다

**File:** `workers/limitup-sync/src/index.ts:251-272`, `:286-291`

**Issue:** stage insert 뒤 commit 이 실패하면, 그 날짜의 stage 행(member_alloc 포함 수만~십만 행)이 다음 시도의 `limitup_stage_clear` 까지 남는다.
- 운영자가 그 날짜를 `LIMITUP_SKIP_DATES` 로 빼면 다음 시도가 오지 않는다. 그러면 `limitup_purge_old` 의 `date < cutoff`(90일) 정리 때까지 남는다.

**Fix:** 업로드 뒤 실패 catch(266행)에서 `limitup_stage_clear(date)` 를 best-effort 로 부른다. 그 실패는 로그만 남긴다.

### IN-R2-06: 격자 LRU 에서 밀린 날짜의 URL 목록이 4xx 재시도 경로에서 캐시에 되살아난다

**File:** `webapp/src/lib/use-limitup-grid.ts:78-93`, `:57-68`

**Issue:** `touchDate` 가 날짜를 버린 뒤에도, 그 날짜의 진행 중 `load` 가 4xx 를 받으면 `urlCache.delete(date)` → `urlsOf(date)` 순서로 돈다. 이때 버린 날짜의 URL 목록 Promise 가 다시 `urlCache` 에 들어간다. 격자 본체는 105행 가드로 막히지만 URL 목록은 막히지 않는다. 크기가 작아 영향은 미미하다.

**Fix:** `urlsOf` 에서 성공 시 `if (!recentDates.includes(date)) urlCache.delete(date)` 를 하거나, `load` 재시도 전에 `recentDates.includes(date)` 를 확인한다.

### IN-R2-07: timeout 마이그레이션 머리말의 근거 수치가 운영 실측과 어긋난다

**File:** `supabase/migrations/20261006090500_limitup_commit_day_timeout.sql:4-13`

**Issue:** 머리말은 근거로 「로컬 최대 실측 2~3초」 와 「120s = 로컬 최대 실측의 수십 배」 를 든다. 그러나 `index.ts:52-53` 의 운영 실측은 member_alloc 5만~9만 행 날 5.6~10.9초이고, 그 결과 임계도 30초로 올렸다(ecf7c173). 실제 여유는 약 11배다. 원격 `service_role` 600s 를 120s 로 **낮추는** 판단 근거로 남는 문서라 수치를 맞춰 둘 가치가 있다.

**Fix:** 적용된 마이그레이션은 수정하지 않는다. 다음 관련 마이그레이션이나 `index.ts` 주석에 「운영 실측 10.9s · 여유 ~11배」 를 정본으로 적는다.

---

_Reviewed: 2026-10-10T01:23:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
