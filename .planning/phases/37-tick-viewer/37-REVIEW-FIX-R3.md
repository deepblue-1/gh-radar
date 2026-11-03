---
phase: 37-tick-viewer
fixed_at: 2026-11-04T07:45:14+09:00
review_path: .planning/phases/37-tick-viewer/37-REVIEW-R3.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 37: Code Review Fix Report — Round 3

**Fixed at:** 2026-11-04T07:45:14+09:00
**Source review:** .planning/phases/37-tick-viewer/37-REVIEW-R3.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (Warning 2 · Info 5 · fix_scope all)
- Fixed: 7
- Skipped: 0

**검증을 어디서 돌렸나:** 하네스 격리 worktree `.claude/worktrees/agent-a5718c56e8f6abf9d`(브랜치 `worktree-agent-a5718c56e8f6abf9d`)에서 돌렸다. 이 worktree 에서 `pnpm install --frozen-lockfile --prefer-offline` 과 `@gh-radar/shared` 빌드를 먼저 했다. 메인 체크아웃에서는 돌리지 않았다. 그래서 숫자를 다시 내려면 fast-forward 뒤 메인에서 같은 명령을 돌려야 한다.
- 시험(`--maxWorkers=2`): tick-convert 전체 168/168 · tickgw 전체 73/73 · webapp `src/lib/ticks src/components/ticks` 26파일 428/428 통과
- tsc: tick-convert · tickgw · webapp(`tsc --noEmit`) 모두 0
- 새로 더한 시험 넷(R3-IN-03 · IN-04 · IN-05 · WR-02 의 이미 알린 포기)은 소스 변경을 되돌린 상태에서 실패하는 것을 확인했다.
- SQL 은 건드리지 않았다. 그래서 pgTAP 은 돌리지 않았고, 새 마이그레이션도 없다. playwright 는 돌리지 않았다(오케스트레이터 몫).


## 오케스트레이터 — 병합 · 재검증 · 배포 (2026-11-04)

- master 에 cherry-pick(abf2feaa..517033a2). R3-WR-01 은 오케스트레이터 커밋 `eb5e47f4`(07:3x tickgw 배포).
- master 재검증: tickgw 73 · tick-convert 168 · webapp 단위 전체 5628(+1 skip) · tsc 0 · `bash -n` smoke · e2e ticks-viewer 27/27.
- 배포: tickgw `517033a2`(radar-gw · 07:47 KST · 장 전) · tick-convert Job `517033a2`(nightly · promote · 알림 정책 갱신) · webapp push. DB · server 변경 없음.

## Fixed Issues

### R3-WR-01: 19:55~마감 동안 승격 보호가 리스가 살아 있는 활성 키의 증분까지 막는다 — 지금 보는 키가 delayed 가 되고 승격에서 빠진다

**Files modified:** `tickgw/src/cache.ts`, `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`, `tickgw/tests/server.test.ts`
**Commit:** eb5e47f4 (오케스트레이터가 먼저 고쳤다 — 이번 라운드는 읽고 그대로 두었다)
**Applied fix:** LRU 보호를 두 단계로 나눴다. `setProtect` 는 `true`(강 — 리스가 살아 있는 키, 아무도 못 지움) · `"pinned"`(약 — 승격 입력인 오늘 complete 키) · `false` 를 돌려준다. `append` · `headroom` 은 우선순위(`live` · `normal` · `catchup`)를 받는다. 지금 보는 키의 append(`live`)는 약 보호 키를 마지막 순서로 지울 수 있다. 따라잡기(`catchup`)는 상한의 25%(`CATCHUP_RESERVE`)를 지금 보는 키 몫으로 남긴 안쪽으로만 붙인다. 보통 폴링과 마감 마무리는 리스가 있으면 `live` 로 붙인다. 그래서 19:55~19:59 에 아무도 안 보던 키가 자리를 다 채워 보던 키의 5초 증분이 `full` 로 버려지던 역전이 없어졌다. 시험은 「19:50 부터 보는 키가 19:55~19:59 에도 증분을 받고 20:15 에 closed」 다(고치기 전 delayed · 승격 안 됨).
**재배포:** tickgw(radar-gw · `scripts/deploy-tickgw.sh`)

### R3-WR-02: 포기한 날짜가 있으면 실행마다 종료 1 — 최대 10일 · 하룻밤 2회 알림 · 크래시로 포기한 날짜는 안내된 수동 재변환으로 끌 수 없다

**Files modified:** `workers/tick-convert/src/modes/nightly.ts`, `workers/tick-convert/tests/nightly.test.ts`, `ops/alert-tick-convert-failure.yaml`, `scripts/smoke-tick-convert.sh`
**Commit:** cb5dd2cb
**Applied fix:**
- `freshlyGaveUp(now, gaveUp, runs)` 를 더했다. 포기한 날짜의 nightly 기록 중 가장 늦은 `finished_at` 이 `GAVE_UP_ALERT_WINDOW_MS`(22.5시간) 안이면 「막 포기」 로 본다. 막 포기한 날짜가 있을 때만 `failed += 1`(종료 1 · 알림)이다.
  - 22.5시간의 근거: Scheduler 는 23:30 · 01:30 매일 돈다. 기록을 쓴 실행의 다음 실행은 그 기록 뒤 22시간 안이다. 그다음 실행은 23시간 넘어서다(실행 하나는 ≤ 60분).
  - 그래서 날짜 하나에 알림은 1~2회다. 수동 재변환이 또 실패하면 그 기록이 창을 다시 연다. 그러면 다음 실행이 한 번 더 알린다. 그 수동 실행 자체도 종료 1 이다.
  - 시각을 하나도 못 읽으면 막 포기로 본다. 알림을 끄는 쪽으로 오판하지 않기 위해서다.
- 포기 error 로그는 계속 실행마다 남긴다. 로그에 `gaveUpFresh` 를 싣고, 문구로 막 포기와 「이미 알린 포기」 를 가른다. 요약 줄에는 `gave_up_fresh=` 를 더했다. `NightlyOutcome.gaveUpFresh` 도 더했다.
- 크래시 포기를 끄는 경로: `smoke-tick-convert.sh` 에 env override 를 더했다.
  - `TASK_TIMEOUT`: `gcloud run jobs execute --task-timeout`. 그 실행에만 걸린다.
  - `MEMORY` · `CPU`: Cloud Run Job 실행에는 메모리 override 가 없다. 그래서 `jobs update` 로 잠시 올린다. EXIT trap 에서 `describe` 로 읽어 둔 원래 값으로 되돌린다. 원래 값을 못 읽으면 바꾸지 않는다. 되돌리기에 실패하면 ❌ 와 직접 되돌릴 명령을 출력한다.
- 알림 문서(`ops/alert-tick-convert-failure.yaml`)에 다음을 적었다.
  - 알림 1~2회 규칙. 그래서 이 알림이 또 오면 새 실패다.
  - 크래시 포기 수동 재변환 명령: `TASK_TIMEOUT=7200s` · `MEMORY=16Gi` · `CPU=8 MEMORY=32Gi`. Scheduler 시간은 피한다.
  - 포기를 받아들이면 할 일이 없다(더 알리지 않는다).
  - 종료 0 목록에 「이미 알린 포기」 를 더했다.
- 영구 포기 RPC(`ABANDONED` 기록)는 만들지 않았다. 알림이 이미 1~2회로 끝나므로, 받아들이는 데 기록이 필요 없다. SQL 변경도 피했다.
- 시험: 막 포기는 종료 1 · `gaveUpFresh` 를 싣는다. 이미 알린 포기는 종료 0 · 「이미 알린 포기」 로그다. `freshlyGaveUp` 단위 시험(request 기록 무시 · null 시각)도 더했다.

**Status:** fixed: requires human verification — 알림 판정 논리를 바꿨다. 22.5시간 창이 운영 Scheduler 간격과 맞는지 확인이 필요하다. `gcloud run jobs execute --task-timeout` · `jobs update --memory/--cpu` 는 실제 GCP 에서 돌려 보지 않았다(`bash -n` · 인자 검증만 했다).
**재배포:** tick-convert 이미지 + 알림 정책. 둘 다 `scripts/deploy-tick-convert.sh` 가 한다(Section 7 이 yaml 로 정책을 update). 스크립트는 저장소 파일이라 배포가 필요 없다.

### R3-IN-01: 크래시 판정이 「끝 기록 쓰기 실패」 와 「예산 넘긴 날짜의 타임아웃」 도 그 날짜의 결정적 실패로 센다

**Files modified:** `workers/tick-convert/src/modes/nightly.ts`, `workers/tick-convert/src/modes/request.ts`, `workers/tick-convert/src/meta.ts`, `workers/tick-convert/tests/nightly.test.ts`
**Commit:** 55466d7b
**Applied fix:**
- 「시작」 기록 표지를 둘로 나눴다. 실행 안에서 첫 번째로 변환을 시작한 날짜만 `STARTED` 이고, 뒤 날짜는 `STARTED_LATER` 다. 가르는 것은 `RunCtx.started` 다.
- `failedNightlyRunsOf` 를 (날짜, 거래소)마다 `finished_at` 순으로 「시작 → 끝」 을 짝짓는 방식으로 바꿨다. 끝 기록 없이 다음 시작이 오거나 마지막이 시작이면, 그 시작이 `STARTED` 일 때만 크래시로 센다. 받은 순서가 뒤섞여도 시각으로 맞춘다. 시각을 못 읽는 행이 있으면 받은 순서를 쓴다.
- 앞 날짜가 시간을 먹어 task timeout 에 끊긴 건강한 뒤 날짜는 더 이상 포기되지 않는다. 정말 그 날짜가 죽이는 것이면 다음 실행에서 첫 날짜가 되어 센다.
- 끝 기록 쓰기는 실패하면 `RUN_RECORD_RETRY_MS`(1초) 뒤 한 번 더 시도한다(`recordEnd`). `JobDeps.sleep` 을 주입할 수 있게 했다. 두 번 다 실패하면 그 날짜는 전과 같이 실패다.
- 기존 크래시 집계 시험(10/26 · 10/28 · 10/29)은 그대로 통과한다. 새 시험: `STARTED_LATER` 는 세지 않음 · 뒤섞인 순서 짝짓기 · 첫 날짜만 `STARTED` · 끝 기록 재시도(1회 실패면 성공, 2회 실패면 날짜 실패).
- 옛 `STARTED` 기록은 모두 첫 날짜로 센다(이전 동작 그대로). SQL · pgTAP 은 바뀌지 않는다(error 는 text).

**Status:** fixed: requires human verification — 크래시 집계 논리를 바꿨다(짝짓기 · 첫 날짜만 셈).
**재배포:** tick-convert 이미지(`scripts/deploy-tick-convert.sh`)

### R3-IN-02: 업로드 오류의 HTTP 상태를 `statusCode`(본문 문자열) 먼저 읽는다 — 숫자가 아니면 영구 4xx 도 TRANSIENT 로 떨어진다

**Files modified:** `workers/tick-convert/src/store.ts`, `workers/tick-convert/tests/nightly.test.ts`
**Commit:** eb7f794d
**Applied fix:** `const st = Number.isInteger(raw.status) ? Number(raw.status) : Number(raw.statusCode)` 로 바꿨다. StorageApiError 의 HTTP 상태 정수 `status` 를 먼저 쓰고, `status` 가 없을 때만 본문 `statusCode` 를 쓴다. 시험: `{status 400, statusCode "InvalidKey"}` 는 결정적 · `{status 503, statusCode "400"}` 은 일시 장애 · `{statusCode "InvalidKey"}`(상태 없음)는 일시 장애. 기존 `statusCode: "400"` · `"503"` 시험도 그대로 통과한다.
**재배포:** tick-convert 이미지(`scripts/deploy-tick-convert.sh`)

### R3-IN-03: 리스가 살아 있는 queued 키(활성 8 밖)는 19:55~마감에 폴링도 따라잡기도 되지 않는다 — R2-IN-04 의 「queued 키」 전제가 반만 닫혔다

**Files modified:** `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`, `docs/relay-operations.md`
**Commit:** 943d7a11
**Applied fix:**
- `catchupEligible` 이 받는 키를 넓혔다. 리스가 끝난 키에 더해, 리스가 살아 있어도 `liveRuns` 순번 ≥ `maxKeys` 인 queued 키도 받는다(`queuedKeys(now)` 를 `catchupDue` 에서 한 번 계산). 둘 다 보통 루프가 돌지 않는 키다.
- 따라잡기는 원래의 호출 슬롯 하나를 그대로 쓴다. 그래서 다음은 바뀌지 않는다: 동시성 1 · 공정 교대 · 25% 예비 · 활성 상한(그 키는 여전히 `queued` 상태) · 19:59 창 끝(gh-trade 회신).
- 따라잡는 도중 그 키가 활성 8키로 올라오면 대상에서 빠진다. 그 뒤로는 보통 루프가 커서부터 받는다.
- 시험(고치기 전 B 호출 0 으로 실패 확인): 19:53 부터 계속 보는 queued 키를 쓴다. 이 키가 19:55:00 에 08:00 부터 따라잡히는지, 활성 키는 계속 5초 증분인지, 20:10 에 closed 인지 본다.
- R2-IN-04 시험이 기대하던 시각은 「리스 끝(19:56) 뒤」 에서 「queued 가 된 순간(19:55:30) 이후」 로 바꿨다. 지금은 더 이르게 넣기 때문이다.
- 운영 문서(`docs/relay-operations.md` 19:55 따라잡기 단락)의 대상 설명도 고쳤다.

**Status:** fixed: requires human verification — 따라잡기 대상 조건을 바꿨다.
**재배포:** tickgw(radar-gw · `scripts/deploy-tickgw.sh`)

### R3-IN-04: 같은 열기 키로 가는 이동 뒤에는 다음 커서 이동 전까지 URL `t` 를 다시 쓰지 않는다

**Files modified:** `webapp/src/lib/ticks/use-tick-cursor.ts`, `webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx`
**Commit:** fc8fd4b8
**Applied fix:**
- `pendingWrite` ref 를 더했다. 이것이 켜지는 때는 둘이다. 쓰기가 이동 대기로 막혔을 때, 그리고 이동 신호가 대기 타이머를 지웠을 때다.
- 이동이 커밋되면 Next 가 커밋한 URL 을 `useSearchParams` 에 싣는다. 그 문자열이 바뀌고 `pendingWrite` 가 켜져 있으면 쓰기를 다시 예약한다.
- `write` 를 ref 만 읽는 안정 콜백(`useCallback([])`)으로 뺐다. 그래서 대기 타이머에서 불러도, 커밋 재시도에서 불러도 지금 상태를 쓴다(WR-61 그대로).
- 다른 키로 가는 이동은 커밋 뒤에도 그대로 막힌다. 우리 `replaceState` 도 Next 가 searchParams 에 동기화하지만, 그때는 막힌 쓰기가 없어 아무것도 하지 않는다.
- 앱 라우터 밖(시험)에서는 `useSearchParams` 가 null 이라 이 경로가 돌지 않는다. 뷰어 페이지는 이미 Suspense 안이다(`app/analytics/ticks/page.tsx`).
- 시험(고치기 전 실패 확인)은 `next/navigation` 의 `useSearchParams` 를 바꿀 수 있는 값으로 mock 했다.
  - 같은 키 push 가 커밋되면 커서가 그대로여도 한 번 다시 쓴다. 그 뒤 우리 쓰기의 searchParams 동기화로는 더 쓰지 않는다.
  - 다른 화면 커밋 뒤에는 쓰지 않는다.

**Status:** fixed: requires human verification — 실제 Next 15 에서 같은 키 push 커밋 때 `useSearchParams` 가 바뀌는지는 e2e 로 확인해야 한다. 시험은 mock 이다.
**재배포:** webapp(Vercel — push 가 배포)

### R3-IN-05: 증분 More 「제자리」 검사가 `commit(m)` 뒤에 있다 — offsetEnd 가 뒤로 가면 커서가 이미 되돌아가 있다

**Files modified:** `webapp/src/lib/ticks/use-tick-live.ts`, `webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx`
**Commit:** 517033a2
**Applied fix:** 증분(`!fill`)에서 `m.more === true && m.offsetEnd <= prevOffset` 이면, `appendTickBytes` 와 `commit` 전에 오류 1 로 센다. `moreChain` 0 · `moreLeft` false 로 두고 publish 한다. 하루치 경로와 같은 순서다. 뒤쪽에 있던 같은 검사는 지웠다. offset 과 세션이 그대로이므로 다음 누름은 같은 자리부터 받는다. 머리 주석에도 적었다. 시험(고치기 전 `11990 ≠ 6000` 으로 실패 확인): offsetEnd 가 뒤로 가는 응답이 오면 세션이 그대로다. 다음 누름의 offset 은 `Z1.length` 그대로다. 그 뒤 정상 응답이 오면 한 번만 붙는다. 기존 「제자리(==)」 시험도 그대로 통과한다.
**재배포:** webapp(Vercel — push 가 배포)

## 재배포 대상 정리

| 대상 | 수정 | 방법 |
|------|------|------|
| tickgw (radar-gw) | R3-WR-01 · R3-IN-03 | `scripts/deploy-tickgw.sh` |
| tick-convert Job 이미지 + 알림 정책 | R3-WR-02 · R3-IN-01 · R3-IN-02 | `scripts/deploy-tick-convert.sh`(이미지 · 두 Job · 알림 정책 yaml update) |
| webapp (Vercel) | R3-IN-04 · R3-IN-05 | push(메모리 「배포는 relay 먼저 · push 나중」 — 백엔드 먼저) |
| Supabase | 없음 | — |

---

_Fixed: 2026-11-04T07:45:14+09:00_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
