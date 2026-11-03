---
phase: 37-tick-viewer
fixed_at: 2026-11-04T07:10:00+09:00
review_path: .planning/phases/37-tick-viewer/37-REVIEW-R2.md
iteration: 1
findings_in_scope: 16
fixed: 16
skipped: 0
status: all_fixed
---

# Phase 37: 2라운드 코드 리뷰 수정 보고

**수정 시각:** 2026-11-04
**원본 리뷰:** .planning/phases/37-tick-viewer/37-REVIEW-R2.md (Warning 5 · Info 11)
**범위:** 16건 전부(fix_scope = all) — 백엔드 11(R2-WR-01..03 · R2-IN-01..08) · webapp 5(R2-WR-30 · 31 · R2-IN-30..32)

**요약:**
- 수정 16 · 건너뜀 0. 수정기 둘이 격리 worktree 에서 돌고 오케스트레이터가 master 에 cherry-pick 했다(겹친 파일 0).
- **master 재검증:** tickgw 70 · tick-convert 162 · server 753 · shared(ticks) 통과 · webapp 단위 전체 5625(+1 skip) · tsc(shared · server · tickgw · tick-convert · webapp) 0 · pgTAP tick_viewer PASS(138) · e2e ticks-viewer 27/27 ×2(새 「재생 중 사이드바 홈 · 뒤로」 2건 포함) · sidebar-tree/accum/teamflow/limitup 49/49.
- **배포(2026-11-04 07:0x~07:1x KST, 장 전):** tickgw `198d9dc3`(radar-gw · 교체 전 2514ff8e · 운영 sha 조상 확인) · DB `20261104600000` · `600100` · `600200` · tick-convert Job `198d9dc3`(nightly · promote) · webapp push `198d9dc3`. server 는 변경 없음(`90173169` 유지).

## 백엔드 기록

### 백엔드 — 재배포 대상 (오케스트레이터)

| 대상 | 들어간 수정 | 시한 · 순서 |
|------|-------------|-------------|
| **tickgw** (radar-gw 컨테이너 · `scripts/deploy-tickgw.sh`) | R2-WR-01 · R2-IN-01 · R2-IN-03 · R2-IN-04 · R2-IN-05 · R2-IN-08 (+ 배포 스크립트 자체 R2-IN-07) | **오늘 08:00 KST 전.** 스크립트의 장중 · 20~21시 가드 안. DB 와 무관 |
| **DB 마이그레이션** (`supabase db push --linked --yes`) | R2-WR-02 `20261104600000` · R2-IN-06 `20261104600100` · R2-WR-03 `20261104600200` | 언제든. 세 개 모두 CREATE OR REPLACE + REVOKE/GRANT 재진술. 표 변경 없음 |
| **tick-convert Job** (`gh-radar-tick-convert` · `-promote` · `scripts/deploy-tick-convert.sh`) | R2-WR-03(nightly) · R2-IN-02(promote) (+ 배포 스크립트 R2-IN-07) · 알림 정책 문서(`ops/alert-tick-convert-failure.yaml` — 같은 스크립트가 update) | 오늘 20:10 승격 · 23:30 nightly 전. DB 순서 무관: 옛 RPC 에는 error 키가 없다. 그러면 모든 ok false 를 결정적으로 센다(지금과 같다) |
| **server** | 없음 | 재배포 불필요 |

검증은 모두 **이 격리 worktree**(`.claude/worktrees/agent-a9e814de27392cf5a`)에서 돌렸다. `pnpm install --frozen-lockfile --prefer-offline` 와 `@gh-radar/shared` build 를 한 뒤에 돌렸다.
- tickgw: vitest 70/70 · `tsc --noEmit` 통과
- tick-convert: vitest 162/162 · `tsc --noEmit` 통과
- server: `tests/routes/ticks*` + `tests/services` 110/110, `tsc` 통과
  - 첫 실행에서 `ticks.test.ts` 「today」 1건이 `read ECONNRESET` 로 실패했다. server 코드는 건드리지 않았고, 재실행 2회는 모두 110/110 이었다. 로컬 소켓 일시 오류로 본다.
- pgTAP: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` 138/138 PASS(마이그레이션 106개 재생)
  - RED 확인: `--until 20261104500000` 이면 R2-WR-02 새 단언 3건이 `not ok` 이다.
  - RED 확인: `--until 20261104600000` 이면 R2-IN-06 새 단언 2건이 `not ok` 이다.
- `bash -n scripts/deploy-tickgw.sh scripts/deploy-tick-convert.sh` 통과. `ops/alert-tick-convert-failure.yaml` 은 js-yaml 로 파싱했다.

### 백엔드 — 참고 — 문서 후속 커밋

- `56029d3e` — `docs/relay-operations.md` 의 tickgw 문단을 코드에 맞췄다(R2-WR-01 · R2-IN-03 · R2-IN-04 · R2-IN-05).
  - 75 단계 대기 · 승격 보호 · LRU 순위 · `cache evict`
  - full 사전 판정 · 따라잡기 동적 대상 · `catchup add`
  - `catchup done` 의 lost · 19:59 요약
- 19:59:00 창 끝(gh-trade 회신)은 그대로 두었다. 이어받기도 19:59 뒤에는 새로 시작하지 않는다.

## webapp 기록



## Fixed Issues

### R2-WR-01: 19:55 따라잡기가 LRU 로 다른 따라잡기 키(이미 따라잡은 키 포함)를 지운다 — 승격 손실 · 로그는 caught 로 셈

**Files modified:** `tickgw/src/cache.ts`, `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`, `tickgw/tests/server.test.ts`, `docs/relay-operations.md`(후속 56029d3e)
**Commit:** 6d2dd836
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- **승격 보호.** 보호 술어에 「승격 창의 오늘 complete 키」 를 더했다(`Poller.promotionPinned`).
  - 승격 창 = 따라잡기 시작(TICKGW_CATCHUP_AT · 끄면 마감 마무리 시작)부터다.
  - closed 아닌 키는 그날 마감 마무리가 끝날 때까지 보호한다.
  - closed 키는 KEEP_UNTIL(21:00 · 승격 Job 20:10 · 20:40)까지 보호한다.
  - 지시는 「마감 마무리가 닫을 때까지」 였다. 그런데 닫힌 키를 바로 풀면 마무리 도중 다음 키의 append 가 방금 닫은 키를 지운다(같은 손실). 그래서 closed 도 승격 Job 이 읽을 때까지 지킨다.
- **LRU 순위**(`cache.victimRank`): complete 아님 · 다른 날짜 키를 먼저 지운다. 그 안에서는 lastAccess 순이다. 지울 때마다 `cache evict` warn 로그를 남긴다(key · size · complete · closed · for_key).
- **따라잡기 `full`.** 다른 키를 지우지 않고 그 키 따라잡기만 멈춘다(`catchup stopped (cache full)` warn). 남은 구간은 20:01 마감 마무리 몫이다.
- **caught.** `catchup done` 시점에 같은 epoch · complete 로 살아 있는 키만 센다. 끝까지 받았는데 사라진 키는 `lost` 로 세고, lost > 0 이면 warn 이다.
- scratchpad 재현 `r2probe/catchup-lru.test.ts` 를 실제 시험으로 옮겼다(`poller.test.ts`).
  - 고치기 전: 키 1 이 evicted 되고 caught 는 3 이었다.
  - 고친 뒤: 키 1 · 2 는 따라잡혀 closed 다. 키 3 은 자리가 없어 멈추고 closed 가 아니다. `catchup done keys=3 caught=2 lost=0`, `cache evict` 로그는 0 이다.
- 창 밖에서는 지금처럼 오늘 complete 키도 LRU 후보다. 그런 삭제에 warn 이 남는지 보는 시험도 더했다.
- **사람 확인 포인트.** 19:55~21:00 에는 오늘 complete 키를 지우지 않는다. 그래서 그 사이 새로 연 키는 캐시가 차면 `delayed`(full 백오프)가 된다. 승격 손실과 저녁 새 키 지연을 맞바꾸는 판단이 맞는지 봐 달라.

### R2-WR-02: WR-01 상한 단락이 `triggered_at IS NULL` 인 pending 에서 NULL 로 평가돼 상한 검사를 통째로 건너뛴다

**Files modified:** `supabase/migrations/20261104600000_tick_request_cap_null_triggered.sql`(새 파일), `supabase/tests/tick_viewer.test.sql`
**Commit:** 7f29ae21
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- 새 마이그레이션에서 `tick_request_convert_for_user` 를 CREATE OR REPLACE 했다. (5) 의 2분 비교를 `coalesce(v_row.triggered_at >= now() - interval '2 minutes', false)` 로 감쌌다.
- 나머지 본문은 20261104300100 과 한 글자도 다르지 않다(diff 로 확인).
- REVOKE PUBLIC · anon · authenticated 와 GRANT service_role 을 원본과 똑같이 다시 적었다.
- 적용된 마이그레이션은 고치지 않았다.
- pgTAP J2 에 3건을 더했다.
  - triggered_at NULL pending + 상한 소진 → capped true
  - 그 행은 pending · triggered_at NULL · trigger_count 0 그대로
  - 상한이 남으면 다시 깨운다

### R2-WR-03: WR-36 포기 규칙이 일시 장애도 3회째에 영구 포기하고, 포기 뒤로는 알림이 없으며, 알림 문서는 「다시 고른다」 그대로다

**Files modified:** `workers/tick-convert/src/modes/nightly.ts`, `workers/tick-convert/src/meta.ts`, `workers/tick-convert/src/store.ts`, `workers/tick-convert/tests/nightly.test.ts`, `workers/tick-convert/tests/too-large.test.ts`, `supabase/migrations/20261104600200_tick_convert_runs_since_error.sql`(새 파일), `supabase/tests/tick_viewer.test.sql`, `ops/alert-tick-convert-failure.yaml`
**Commit:** 52b98073
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- **실패 분류.**
  - 일시 장애는 `TransientError` 이거나 fs 코드(EIO · ETIMEDOUT · ECONNRESET · ENOTCONN · ESTALE 등 — GCS FUSE)인 것이다. 대상: candidates RPC · 메타 upsert RPC · Storage 업로드 5xx/상태 없음(네트워크).
  - 일시 장애로만 실패한 기록은 error 를 `TRANSIENT: …` 로 남기고, 포기 카운트에서 뺀다.
  - 업로드 4xx(408 · 429 빼고)는 결정적으로 센다. `store.upload` 가 오류에 HTTP 상태를 싣는다.
  - 통독(zstd · magic) · 격자 만들기 오류도 결정적이다.
- **크래시 경로.** 변환을 시작하는 날짜는 먼저 거래소별 「시작」 기록(ok null · error `STARTED`)을 쓴다.
  - `failedNightlyRunsOf` 는 STARTED 수 − 끝 기록 수(0 미만은 0)를 크래시로 더한다. 대상은 OOM · task timeout 이다.
  - 시작 기록 쓰기가 실패해도 변환은 계속한다(warn).
- **포기 뒤 알림.** 포기한 날짜가 있으면 실행마다 `logger.error`(`… 다시 고르지 않는다 …`)를 남기고 `failed += 1` 로 종료 1 한다.
  - 알림 정책은 Job 실패 실행(`completed_execution_count result=failed`)이라 포기 뒤에도 알림이 계속 온다.
  - `nightly --date D` 로 ok 기록이 생기면 포기 목록에서 빠지고 알림도 멎는다.
  - 리뷰는 「하루 한 번」 을 제안했다. 그러나 23:30 · 01:30 실행을 상태 없이 하나로 묶을 방법이 없어 「실행마다」 로 했다(max-retries 0 이라 재시도 폭주는 없다).
- **DB.** 새 마이그레이션이 `tick_convert_runs_since` 원소에 `error` 를 더한다(REVOKE/GRANT 재진술). pgTAP K 단언을 갱신하고, STARTED 기록 단언 1건을 더했다(plan 138).
- **알림 문서**(`ops/alert-tick-convert-failure.yaml` 5행): 결정적 실패 2회 초과 날짜는 더 고르지 않는다고 적었다. 일시 장애는 세지 않는다는 것, 실행마다 종료 1, 로그 문구, `nightly --date D` 수동 재변환도 적었다.
- **시험**
  - TRANSIENT 미산입 · 크래시 산입 · error 없는 옛 기록 산입
  - candidates 실패 → `TRANSIENT:`
  - 업로드 400 → 결정적 · 503 → TRANSIENT
  - 포기 날짜 → 고르지 않음 · error 로그 · 종료 1
  - 기존 시험은 「끝 기록」 만 보도록 `finals()` 로 맞췄다.

### R2-IN-01: `skipped_records` · `compressed_files_skipped` 가 형식이 틀리면 조용히 0 — CR-31 완결 게이트가 fail-open

**Files modified:** `tickgw/src/indexer.ts`, `tickgw/src/poller.ts`, `tickgw/tests/indexer.test.ts`, `tickgw/tests/poller.test.ts`
**Commit:** f01c370d
**Applied fix:**
- `countOrZero` 를 `countField` 로 바꿨다. 필드가 없을 때(undefined)만 0 이다. 있는데 음 아닌 안전 정수가 아니면(문자열 · 음수 · 소수 · null) `IndexerMeta.badCounts` 에 필드 이름을 담는다.
- poller `applyOk` 는 badCounts 가 있으면 그 키를 complete=false 로 두고 warn(`indexer count fields malformed — not complete`) 한다. `indexer` 로그 줄에도 `bad_counts` 를 남긴다.
- parseMeta 를 통째로 실패시키는 길은 택하지 않았다. 계약 표류 한 번에 라이브 뷰가 전부 delayed 로 멈추기 때문이다. 이 방식은 승격만 막는 fail-closed 다.

### R2-IN-02: WR-30 받기 전 크기 판정 문턱(100MiB)이 tickgw 키 상한(96MiB)보다 커서 기본 설정에선 발동하지 않는다

**Files modified:** `workers/tick-convert/src/modes/promote.ts`, `workers/tick-convert/tests/promote.test.ts`
**Commit:** fea9a6aa
**Applied fix:**
- `PREFETCH_FACTOR` 를 2 에서 1.2 로 낮췄다. 문턱은 `GRID_MAX_BYTES` × 1.2 = 62,914,560B(≈60MiB)다.
- `TICKGW_KEY_LIMIT_BYTES`(100,663,296)를 두고, 시험이 「문턱 < tickgw 키 상한 · 문턱 > GRID_MAX」 를 고정한다.
- 잘못 거른 키는 승격만 빠진다. 그날 밤 nightly 가 같은 상한 규칙으로 다시 만든다(주석에 적었다).

### R2-IN-03: WR-33 「캐시 가득(full)」 은 119 를 부른 뒤 결과를 버린다 — 자리가 날 때까지 60초마다 같은 범위를 다시 읽는다

**Files modified:** `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`
**Commit:** b4e65434
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- `full` 로 버린 응답 바이트를 `run.fullNeed` 에 기억한다. 다음 시도 전에 `cache.headroom(key) < fullNeed` 면 119 를 부르지 않는다. 같은 from 의 응답은 그보다 작아지지 않기 때문이다.
  - 폴링은 failures+1 백오프(delayed)로 처리한다.
  - 따라잡기는 그 키를 멈춘다.
  - 마감 마무리는 시도 1회로 센다. 3회면 포기한다(`close gave up (cache full)`).
- 성공적으로 붙이면 `fullNeed=0` 으로 되돌린다.
- WR-33 시험이 「full 동안 그 키 08:00 호출 1회뿐 · 자리가 나면 1회 더」 를 단언한다. R2-WR-01 시험은 「키 3 마감 마무리 119 호출 0」 을 단언한다.

### R2-IN-04: 따라잡기 대상 고정의 전제 「19:55 뒤 리스가 끝난 키는 이미 몇 분 안쪽까지 받았다」 가 queued 키에서 틀린다

**Files modified:** `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`
**Commit:** dd2ab041
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- 대상을 시작 때 고정하지 않는다. 창 안 매 step 마다 「대상 조건을 만족하고 아직 넣은 적 없는」 키를 더 넣는다(`catchupSeen` · 로그 `catchup add`).
- 대상이 바닥나도 창 끝(19:59)까지는 열어 두고, 요약 `catchup done` 은 19:59 에 남긴다.
- 머리 주석의 전제 문장도 고쳤다.
- 시험: 활성 1키 밖 queued 키가 19:56 에 리스가 끝난다. 그러면 08:00 부터 따라잡고, 20:01 마감 마무리로 closed 가 된다.

### R2-IN-05: 75 의 뜻이 「색인 준비 안 됨(최대 수십 분)」 까지 넓어졌는데 2초 재시도에 상한 · 단계가 없다

**Files modified:** `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`
**Commit:** b0dd312f
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- 키를 가리지 않는 전역 `busyStreak` 를 둔다. 연속 5회까지는 지금처럼 2초 + 지터다.
- 넘으면 5 → 15 → 30 → 60초(+지터) **전역 대기**(`busyUntil`)를 건다. 그동안 모든 키 · 따라잡기 · 마감 마무리 호출이 0 이다.
- 정상 응답(또는 64) 한 번이면 되돌린다. 로그는 `indexer busy streak — slowing down` · `indexer busy cleared` 다.
- 실패 단계 · X-Tick-State 는 건드리지 않는다. gh-trade 계약 「75 = 다시」 를 유지한다.
- 시험
  - 75 10회의 간격 = [2.25s ×5, 5.25, 15.25, 30.25, 60.25, 60.25] · 상태 ready · 되돌림 뒤 다시 2.25s
  - 4키가 5분 동안 늘 75 → 호출 < 20 · 느린 단계 간격 ≥ 5s

### R2-IN-06: WR-02 합류가 상한에 걸리면 빠진다 — stale pending 에 합류하려던 사용자는 요청자 집합에 들지 않는다

**Files modified:** `supabase/migrations/20261104600100_tick_request_join_outside_cap.sql`(새 파일), `supabase/tests/tick_viewer.test.sql`
**Commit:** 925974a8
**Status:** fixed: requires human verification (논리 변경)
**Applied fix:**
- 합류 UPDATE((6b))를 상한 판정 앞 (5a) 로 옮겼다. 그래서 상한과 무관하게 늘 합류한다. 상한은 (6) 다시 올림 · (7) 재트리거만 막는다. 응답 모양 · 429 경로는 그대로다.
- 새 마이그레이션에서 CREATE OR REPLACE 하고 REVOKE/GRANT 를 재진술했다. 본문은 20261104600000 기반이라 R2-WR-02 의 coalesce 를 포함한다.
- pgTAP J4 에 4건을 더했다.
  - stale pending + 상한 소진 → capped
  - 집합 {u1, u2}
  - 깨우지 않음
  - 원래 요청자가 취소해도 pending

### R2-IN-07: `ALLOW_DIRTY=1` 을 같은 HEAD 에서 두 번 쓰면 태그 `<sha>-dirty` 가 겹쳐 되돌림이 꺼지고 앞 이미지가 덮인다

**Files modified:** `scripts/deploy-tickgw.sh`, `scripts/deploy-tick-convert.sh`
**Commit:** 198d9dc3
**Applied fix:**
- 두 스크립트 모두 dirty 태그를 `<sha>-dirty-<epoch초>` 로 바꿨다. 배포마다 접미가 다르다.
- deploy-tickgw.sh 의 되돌림은 태그(`.Config.Image`)가 아니라 교체 전 컨테이너의 이미지 ID(`.Image`, sha256)로 잡는다. 같은 이미지인지는 `docker image inspect --format '{{.Id}}' "$TARGET_IMAGE"` 와 비교해 판정한다. 로그에는 태그와 ID 를 함께 남긴다.
- `bash -n` 은 통과했다. 실제 VM 경로는 다음 배포에서 확인된다.

### R2-IN-08: 설정 주석이 바뀐 창 끝(19:59)과 어긋난다

**Files modified:** `tickgw/src/config.ts`
**Commit:** 2438fed9
**Applied fix:**
- `TICKGW_CATCHUP_AT` 주석을 「19:59 이후 값은 거부」 로 고쳤다(창 끝 근거로 gh-trade 회신을 인용).
- 지난 보고서(REVIEW-FIX CR-31-F)의 옛 문장은 산출물이라 고치지 않았다.

### R2-WR-30: WR-60 토큰은 `go()` 만 올린다 — 사이드바 `<Link>` · 브라우저 뒤로/앞으로는 여전히 커서 replaceState 에 버려진다

**Files modified:** `webapp/src/instrumentation-client.ts`(새 파일), `webapp/src/lib/router-transition.ts`(새 파일), `webapp/src/lib/ticks/use-tick-cursor.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx`, `webapp/e2e/specs/ticks-viewer.spec.ts`
**Commit:** 08917743
**Applied fix:**
- **신호 출처:** 출구를 하나씩 듣는 대신 Next 15 공식 훅 `instrumentation-client.ts` 의 `onRouterTransitionStart(url, type)` 를 쓴다.
  - 이 훅은 모든 앱 라우터 이동이 시작될 때 동기로 불린다. `<Link>` · `router.push/replace` · 뒤로/앞으로(traverse)가 모두 들어간다. 머리 검색의 `router.push` 같은 경로도 빠지지 않는다.
  - 호출 시점은 `dispatchNavigateAction` · `dispatchTraverseAction` 안, 액션을 큐에 넣기 직전이다. node_modules 의 Next 15.5.15 소스로 확인했다.
  - 이 신호는 작은 구독 모듈 `router-transition.ts` 가 중계한다. 구독자에서 예외가 나도 삼켜서 이동을 막지 않는다.
- **멈추기:** `useTickCursor` 가 이동 시작 신호를 받으면 `{from: 그때 URL, to: 목적지}` 를 기록하고 대기 타이머를 지운다.
- **다시 쓰기:** 지금 URL 이 이 뷰어의 열기 키(경로 · isin · d · ex — `isSameTickOpenKey`)이고, 다음 둘 중 하나일 때만 다시 쓴다.
  - URL 이 from 에서 바뀌었다.
  - 목적지가 그때 URL 그대로다.
- **경우별 동작:**
  - 다른 키로 가는 이동(사이드바 Link · 목록으로 · 뒤로로 목록 항목에 섬): 뷰어가 내려갈 때까지 쓰지 않는다. 커밋 뒤 언마운트 전 한 틈에도 새 항목을 덮지 않는다.
  - 같은 키로 가는 push: 커밋되면 다시 쓴다.
  - 같은 키로 가는 뒤로/앞으로: 바로 다시 쓴다. 그 RESTORE 가 버려져도 같은 트리 · 같은 키라 결과가 같다.
  - 부차 문제(영구 정지): 해소됐다. 다른 이동이 앞의 이동을 덮고 이 키로 돌아오면 URL 이 바뀌므로 쓰기를 재개한다.
- **정리:** `navToken` 배선(page `navRef` → TickViewer → cursor)은 걷었다.
- **단위 시험 6건:** 다른 화면 push · traverse 로 목록 · 같은 키 push 커밋 대기 · 같은 키 traverse 와 덮인 뒤 복귀 · 언마운트 해제 · `isSameTickOpenKey`.
- **e2e 2건 추가(미실행):**
  - 「재생 중 사이드바 홈 링크 → 홈 화면 · 1초 뒤에도 `/`」
  - 「재생 중 뒤로 → 목록 · history.length 그대로 · 1초 뒤에도 목록 URL · 앞으로 = 뷰어 · 다시 뒤로 = 목록」
- **판정:** fixed — 사람 검증 필요. 이동 대기 판정 로직이고, e2e 를 아직 돌리지 않았다.

### R2-WR-31: 하루치 해제 실패(WR-62)에 상한 · 백오프가 없다 — 실패가 결정적이면 5초마다 하루치 전체를 영원히 다시 받는다

**Files modified:** `webapp/src/lib/ticks/use-tick-live.ts`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx`, `webapp/src/components/ticks/__tests__/tick-state-card.test.tsx`
**Commit:** 2a3a8d01
**Applied fix:**
- **실패 세기:** 하루치 해제 연속 실패를 `fillFailures` 로 센다.
  - 리뷰 제안처럼 `commit()` 에서 0 으로 되돌리지 않는다. 하루치 loading 조각마다 commit 이 불려서 상한이 끝내 닿지 않기 때문이다. 하루치를 풀어 세션을 만든 때만 0 으로 되돌린다.
  - 마지막 방어선(handle throw)도 하루치 중이면 같은 상한을 탄다.
- **백오프:** `pollMs × 2^(n−1)`, 곧 5초 → 10초다.
- **멈춤:** `TICK_LIVE_FILL_FAIL_MAX`(3)에 닿으면 `fillFailed` 로 멈춘다. 그 뒤로는 타이머도 가시성 복귀도 다시 받지 않는다.
- **다시 시도:** `retry()` 는 1회만 받는다(카운터를 상한−1 로 둔다). 또 실패하면 곧바로 다시 멈춘다.
- **세션 전:** 페이지가 「당일 자료를 풀지 못했어요」 카드를 보인다(「목록으로」 · 「다시 시도」).
- **409 다시 받기 중:** `refetching` 을 내려 IN-64 「다시 받는 중」 버튼이 풀린다. 이전 세션은 그대로 보인다. 오류 수가 0 보다 크므로 버튼은 빨간 「다시 받기」 이고, 누르면 `refresh()` → `retry()` 로 그 하루치를 1회 다시 받는다.
- **증분 경로:** 사람이 누를 때만 받으므로 그대로 뒀다.
- **시험:**
  - 훅: 늘 깨진 하루치 → 3회에서 정지 · 백오프 간격 · retry 1회 · 성공 시 해제
  - 훅: 409 다시 받기가 늘 깨짐 → 정지 · `refetching` false · 세션 유지 · refresh 1회
  - 페이지: 카드와 「다시 시도」 1회
- **남김:** 일반 오류(502 · 네트워크)가 하루치 받는 중 5초마다 다시 시도하는 것은 기존 설계라 범위 밖이다.

### R2-IN-30: IN-63 후속(`90173169`)의 scrollTop 보정은 커서 행을 기준으로 한다 — 사용자가 커서에서 떨어진 곳을 보고 있을 때(IN-63 이 지키려던 상황) 보던 화면이 밀린다

**Files modified:** `webapp/src/components/ticks/tick-msg-list.tsx`, `webapp/src/lib/ticks/msg-rows.ts`, `webapp/src/lib/ticks/use-fixed-window.ts`, `webapp/src/lib/ticks/__tests__/msg-rows.test.ts`, `webapp/src/lib/ticks/__tests__/use-fixed-window.test.tsx`
**Commit:** 3359d1b9
**Applied fix:**
- **기준 정하기:** 순수 함수 `keepViewShiftOf(prev, next, …)` 를 더했다.
  - 커서 행이 직전 화면 안에 있었으면 커서 행을 기준으로 한다. 폰 390 의 숨김→보임 뒤 동작을 지키기 위해서다.
  - 아니면 직전 화면의 첫 전문 행(ROW · rec 는 모델이 바뀌어도 같다)을 기준으로 한다. 우리 줄 · 꼬리 · 점선은 id 가 모델마다 바뀔 수 있어 기준으로 쓰지 않는다.
  - 기준 행이 새 모델에서 얼마나 움직였는지(행 수)를 돌려준다.
- **effect 의존성:** `model` 을 더했다. 그래서 커서 자리가 그대로인 모델 변경도 보정한다. 리뷰가 꼽은 「커서가 위 · 줄이 사이에 낌」 경우다.
- **창 상태:** `useFixedWindow.scrollToOffset(px)` 를 더했다. scrollTop 과 창 상태를 같이 올리므로, 한 프레임 동안 옛 창이 그려져 빈 spacer 가 보이는 일이 없다.
- **유지:** 커밋 `90173169` 의 숨김→보임 가운데 맞춤(fresh)은 그대로다.
- **시험:**
  - 순수 함수 5건: 리뷰 두 경우 · 커서 화면 안 · 첫 항목이 우리 줄이고 빠짐(음수) · 숨김 · 기준 없음
  - `scrollToOffset` 1건
  - 기존 IN-63 목록 시험 통과
- **남김:** 폰 390 e2e 는 돌리지 않았다.
- **판정:** fixed — 사람 검증 필요. 스크롤 기준 로직이다.

### R2-IN-31: More 이어 받기의 끝 조건 — 증분 상한(16)에 닿아도 신호가 없고, 하루치 More 는 진행 확인 없이 `schedule(0)` 이다

**Files modified:** `webapp/src/lib/ticks/use-tick-live.ts`, `webapp/src/components/ticks/tick-header.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**Commit:** 3249ce6d
**Applied fix:**
- **진행 확인:** 두 경로 모두 `m.more && m.offsetEnd > 직전 offset` 일 때만 이어 받는다.
  - 증분에서 제자리면 오류 1을 세고 멈춘다. 버튼은 「다시 받기」 가 된다.
  - 하루치에서 제자리면 조각과 offset 은 그대로 두고, R2-WR-31 의 실패 상한과 백오프를 탄다(`failFill(false)`). 그래서 RTT 간격으로 끝없이 요청하지 않는다.
  - 두 경우 모두 warn 로그를 남긴다.
- **상한 신호:** 증분 상한(16)에 닿으면 `more`(캐시에 더 있음)를 남긴다. 머리 버튼은 「이어 받기」 가 되고, title 은 「받을 전문이 더 있어요 — 눌러 이어 받기」 다. More 없이 끝나면 `more` 가 풀린다.
- **기존 시험:** 「More 끝없이」 시험은 offsetEnd 가 늘어나게 고쳤다. 고정 offsetEnd 는 이제 계약 위반으로 처리된다.
- **새 시험:** 증분 제자리 · 하루치 제자리 · 머리 「이어 받기」.
- **남김:** 상한에 닿은 동안 as-of 가 null 인 것(meta.state loading)은 그대로다. 리뷰도 신호만 요구했고, 대기 판정에는 보수적인 쪽이다.

### R2-IN-32: 「당일 자료 일부 빠짐」 배지(WR-63)가 409 다시 받기 중에는 화면 세션이 아니라 새 epoch 의 중간 meta 를 읽는다

**Files modified:** `webapp/src/lib/ticks/use-tick-live.ts`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx`
**Commit:** b4d66c04
**Applied fix:**
- **방식:** 리뷰가 「더 정확한 방법」 으로 든 것을 택했다.
- **값을 바꾸는 때:** `useTickLive` 는 `sessionComplete` 를 따로 든다. 이 값은 세션을 바꾸는 응답(하루치 완료)이나 같은 epoch 증분 응답(0바이트 포함)의 `complete` 일 때만 바뀐다.
- **배지 조건:** `live.session !== null && live.sessionComplete === false` 다.
- **효과:** 409 다시 받기 중 새 epoch 의 loading meta 로 배지가 깜박이지 않는다. R2-WR-31 정지 상태에서도 옛 세션 값을 유지한다.
- **시험:** 끊김 세션 → 409 다시 받기 중 meta.complete 가 true 여도 false 를 유지 → 완료 뒤 true → 같은 epoch 증분이 끊김을 알리면 false.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer × 2 parts)_
_Iteration: 1_
