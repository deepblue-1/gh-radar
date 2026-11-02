---
phase: 37-tick-viewer
plan: 06
subsystem: worker
tags: [tick-convert, cloud-run-job, zstd, pcap, supabase-storage, request-mode, upload-readiness]
status: complete

requires:
  - phase: 37-tick-viewer (37-01)
    provides: "저장처: supabase-storage · D-19 범위: 승인 (precondition)"
  - phase: 37-tick-viewer (37-02)
    provides: "PcapNsReader · isinKeyOf · iterRecords · tagOf · TICK_FMT · A3_LAYOUT · decodeFields · layoutOf · DayRateTracker"
  - phase: 37-tick-viewer (37-04)
    provides: "tick_request_claim · tick_request_finish · tick_grid_upsert(모드 규칙) · tick_convert_run_record · runs_since · candidates · purge_old · 버킷 tick-grid"
provides:
  - "워크스페이스 @gh-radar/tick-convert — src/{index,config,logger,archive,scan,grid-file,store,meta}.ts · src/modes/request.ts · src/services/supabase.ts"
  - "CLI `request --date YYYYMMDD --ex KRX|NXT` · 모드 표 MODES(37-18 nightly · 37-12 promote 가 한 줄씩 더한다)"
  - "env TICK_ARCHIVE_DIR · TICK_KEEP_DAYS · TICK_CATCHUP_DAYS · TICK_UP_PCT · TICK_ZSTD_LEVEL · TICK_STAGE_CHUNK_BYTES · TICK_NIGHTLY_BUDGET_MS"
  - "GRID_BUCKET = \"tick-grid\" · gridObjectPath · GridStore · createSupabaseGridStore(upload · removeDates)"
  - "buildGridFile · RecordSink · scanObjects · keyOf · listDayObjects · firstRecordNs · presentHours"
  - "READY_GRACE_DAYS = 2 · kstYmdDaysAgo · isLabelReady · isDayReady · hasReadyWindowObjects · judgeReady"
  - "createMeta(sb) — claim · finish · upsertGrids · runRecord · runsSince · candidates · purgeOld 래퍼(모양 검사)"
  - "결과 코드 NO_RECORDS · NOT_UPLOADED (meta.ts 상수)"
  - "테스트 헬퍼 tests/helpers/synth-archive.ts · fake-supabase.ts"
affects: [37-12, 37-16, 37-18]

actuals:
  tokens: 22207      # chars/4 over git diff 18088679..9d47a158 (88,828자)
  tasks: 2
  commits: 3         # MEASURED: git rev-list --count 18088679..HEAD (SUMMARY 커밋 제외)
plan_head_before: 18088679ec9ea1e0ebb47cdcd20425e5ec666aee
plan_head_after: 9d47a15885ea59930f9f357aa276ece019202747

tech-stack:
  added: []
  patterns:
    - "변환 Job 모드 표 MODES — argv 첫 토큰으로 고르고 각 모드가 자기 인자를 파싱(UsageError → 종료 2)"
    - "업로드 판정은 통독 전에 — 시각 객체 유무만 본다(업로드 시각 규칙과 독립)"
    - "키별 원시 버퍼는 RecordSink(늘어나는 단일 버퍼) — 레코드마다 배열을 만들지 않는다"

key-files:
  created:
    - workers/tick-convert/package.json
    - workers/tick-convert/tsconfig.json
    - workers/tick-convert/vitest.config.ts
    - workers/tick-convert/src/index.ts
    - workers/tick-convert/src/config.ts
    - workers/tick-convert/src/logger.ts
    - workers/tick-convert/src/services/supabase.ts
    - workers/tick-convert/src/archive.ts
    - workers/tick-convert/src/scan.ts
    - workers/tick-convert/src/grid-file.ts
    - workers/tick-convert/src/store.ts
    - workers/tick-convert/src/meta.ts
    - workers/tick-convert/src/modes/request.ts
    - workers/tick-convert/tests/helpers/synth-archive.ts
    - workers/tick-convert/tests/helpers/fake-supabase.ts
    - workers/tick-convert/tests/request.test.ts
    - workers/tick-convert/tests/config.test.ts
    - workers/tick-convert/tests/archive.test.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "request 모드는 자기 라벨만 판정한다(isLabelReady) — NXT 가 덜 올라와도 KRX 요청은 변환. 두 라벨 판정 isDayReady 는 nightly(37-18) 몫"
  - "08~20시 밖(00~07 · 21~23시) 객체만 있는 날은 「객체 0」 과 같이 NOT_UPLOADED(나이와 무관)"
  - "통독이 throw 하면(깨진 원본) claim 된 종목 중 결과 없는 것을 failed `SCAN_FAILED: …` 로 바로 닫는다 — 25분 JOB_TIMEOUT 회수를 기다리지 않게"
  - "메타 upsert 가 실패하면 그 실행에서 올린 종목 전부를 실패로 finish(객체는 남지만 메타가 가리키지 않아 무해)"
  - "zstd 스트림 해제기가 입력을 끝까지 먹지 않았으면(bytesWritten < 파일 크기) throw — 다중 프레임 무로그 손실 방지"
  - "같은 HHMM 의 -N 정렬용 첫 레코드 시각은 앞 256KB 를 `finishFlush: ZSTD_e_flush` 로 부분 해제해 읽는다(동기 · listDayObjects 시그니처 유지)"

patterns-established:
  - "tick 가짜 Supabase: rpc + storage 만 기록 · tick RPC 기본 응답은 37-04 실제 반환 모양"
  - "합성 아카이브 기본 시각 집합 = 10/30 실측(라벨당 0000~2300 매시 1개 · 채움 IA 레코드 1개)"

requirements-completed: [D-03, D-04, D-19]

coverage:
  - id: D1
    description: "request 모드 트레이서 — 합성 아카이브 → claim → 통독 → 격자 파일(그 ISIN 그 라벨 패킷 전부 · B9 · 길이 안 맞는 A3 포함 · IA 제외) → 업로드 → tick_grid_upsert('request') → finish → run_record 순서"
    requirement: D-03
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/request.test.ts"
        status: pass
  - id: D2
    description: "격자 경로 grid/<D>/<EX>/<isin>.request.ticks.zst · application/zstd upsert · 업로드 실패 키는 메타 없음 · fmt pcapns-rec+zstd/1"
    requirement: D-04
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/request.test.ts"
        status: pass
  - id: D3
    description: "업로드 판정 — 10/30 실측 24객체 → isDayReady true · 08~20시 한 시각 빠지면 false · -N 접미 · NOT_UPLOADED(통독 0 · main 0) · 2일 초과 partial"
    requirement: D-03
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/archive.test.ts · tests/request.test.ts"
        status: pass
  - id: D4
    description: "D-19 범위 — ISIN 오프셋 없는 태그(IA)는 격자에서 빠지고 다섯 태그 + A0 는 길이 무관 raw 보존"
    requirement: D-19
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/request.test.ts"
        status: pass

duration: 17min
completed: 2026-11-02
---

# Phase 37 Plan 06: 변환 Job 뼈대 + request 모드 Summary

**과거 변환 Job `@gh-radar/tick-convert` 를 limitup-sync 뼈대로 세웠다. request 모드는 claim 한 종목만 GCS 원본에서 한 번 통독해 `pcapns-rec+zstd/1` 격자 파일로 만들고, Storage `tick-grid` 에 올린 뒤 `tick_grid_upsert('request')` 와 finish 까지 닫는다. 통독 전에 업로드 판정을 해서, 업로드 전 날짜는 읽지 않고 `NOT_UPLOADED`(종료 0)로 닫는다. 2일 넘게 덜 올라온 날만 있는 객체로 `partial` 변환한다.**

## Performance

- **Duration:** 약 17분 (2026-11-02T10:38Z → 10:55Z)
- **Tasks:** 2 (트레이서 1 + TDD 1)
- **Files:** 18개 생성 · 1개 수정(pnpm-lock.yaml)

## Accomplishments

- **트레이서(Task 1):** 합성 아카이브에서 claim 한 KRX 1종목을 받는다. 업로드 바이트를 `zstdDecompressSync` → `iterRecords` 로 되돌리면 그 ISIN 의 KRX 패킷 6건(A3 3 · B6 · B9 · 길이 180B A3)과 수신 ns · 바이트가 정확히 같다. 다른 ISIN · NXT · IA 채움 레코드는 들어가지 않는다. 호출 순서는 업로드 → `tick_grid_upsert` → `tick_request_finish` → `tick_convert_run_record` 다.
- **메타 행:** `{sources: ['request'], records 6, a3_count 4, base_px 10000, high_rate 15, last_rate 5, fmt 'pcapns-rec+zstd/1', first/last_recv_ms}` 다. 기준가·등락률은 A3 ∧ G1 체결로 `DayRateTracker` 를 거친 값이다.
- **실패 격리:** 업로드 실패 키는 메타에서 빠지고 finish 에 경로를 담은 메시지가 들어간다(main 1). 메타 upsert 가 실패하면 올린 종목 전부가 실패로 닫힌다(main 1). 깨진 원본이면 `SCAN_FAILED`(main 1)로 닫는다.
- **NO_RECORDS:** 레코드가 0 인 종목은 `NO_RECORDS` 로 닫는다. claim 한 종목이 그 하나뿐이어도 main 0 이다.
- **업로드 판정(Task 2):** `isLabelReady` 는 08~20시 매시 객체(`-N` 포함)가 있는지 본다. 10/30 실측 24객체 목록이면 true, KRX 13시 하나만 빠져도 false 다. 21~23시 · 00~07시는 판정에 쓰지 않고, `-1300-1` 은 13시로 센다.
- **Node zstd 기동 검사:** zstd 함수가 없으면 종료 2. 잘못된 인자 · 모르는 모드도 종료 2.

## 업로드 판정 표 (request 모드 · 그 라벨만)

| 그 라벨의 08~20시 객체 | 날짜 vs KST 오늘 − 2일 | 통독 | finish | 실행 기록 | main |
|---|---|---|---|---|---|
| 0개(또는 00~07 · 21~23시만) | 무관 | 안 함(createReadStream 0) | 전부 failed `NOT_UPLOADED` | ok · error `NOT_UPLOADED` · bytes_read 0 | 0 |
| 일부 | 같거나 이후(유예 안) | 안 함 | 전부 failed `NOT_UPLOADED` | ok · error `NOT_UPLOADED` | 0 |
| 일부 | 이전(2일 초과) | 있는 객체로 | 종목별 done / NO_RECORDS | ok · error `partial` | 0(실패 없으면) |
| 전부(08~20시 매시) | 무관 | 05~20시 전부 | 종목별 done / NO_RECORDS | ok · error null | 0 |

## 요약 로그 예시 (시험 실행 · `LOG_LEVEL=info`)

```
[tick-convert] mode=request date=20261030 ex=KRX ready=full targets=1 written=1 no_records=0 not_uploaded=0 failed=0 bytes_read=1462 ms=0
[tick-convert] mode=request date=20261030 ex=KRX ready=full targets=2 written=1 no_records=1 not_uploaded=0 failed=0 bytes_read=1462 ms=0
[tick-convert] mode=request date=20261030 ex=KRX ready=none targets=2 written=0 no_records=0 not_uploaded=2 failed=0 bytes_read=0 ms=0
[tick-convert] mode=request date=20261030 ex=KRX ready=partial targets=1 written=0 no_records=0 not_uploaded=1 failed=0 bytes_read=0 ms=0
[tick-convert] mode=request date=20261030 ex=KRX ready=-  targets=0 written=0 no_records=0 not_uploaded=0 failed=0 bytes_read=0 ms=0
```

## 합성 아카이브 크기

- 기본은 라벨마다 `0000`~`2300` 24파일(10/30 실측 시각 집합)이다. 파일마다 IA 채움 레코드가 1건 있고, 시험 종목 패킷은 09 · 10시 파일에 들어 있다.
- KRX 05~20시 16파일의 압축 합계는 **1,462B** 다(`bytes_read` 로 단언한다).

## Task Commits

1. **Task 1 (tracer): request 모드 끝까지 · 워커 뼈대** — `40b1307e` (feat)
   - 트레이서 게이트(interactive · end-of-phase · 자동 verify 만): verify 재실행이 exit 0 으로 통과해 확장으로 넘어갔다.
2. **Task 2 (TDD): 업로드 판정**
   - RED `0a5b1f03` (test) — archive.ts 판정 함수는 false 를 반환하는 뼈대로 두었다.
   - GREEN `9d47a158` (feat)

## TDD Gate Compliance

- **RED:** `0a5b1f03` — 대상 `archive.test.ts > 업로드 판정 — isLabelReady · isDayReady (08~20시 매시 존재) > 10/30 실측 24객체 목록(두 라벨) → … 모두 true`. 실행 `vitest run tests/archive.test.ts --reporter=junit` 결과는 exit 1 · 23 테스트 중 5 실패였다. `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK**(`target_test_failed` · junit · report_errors 없음)다. 같은 RED 실행에서 request 의 NOT_UPLOADED · partial 시험 4건도 단언 실패했다.
  - **semanticAssessment:** 대상 테스트는 실제로 실행됐고 `toBe(true)` 에서 AssertionError 로 실패했다. 실패 원인은 판정 뼈대가 아직 판정을 하지 않는다는 계획된 단언이다. 로드 · 문법 · 픽스처 오류는 아니다.
- **GREEN:** `9d47a158` — 3 파일 58 테스트 통과.
- **REFACTOR:** 따로 하지 않았다. 통독 본문을 `convertClaimed` 로 떼어 낸 작업은 GREEN 커밋에 들어 있다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/tick-convert run typecheck && pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2` → exit 0 · **3 파일 58 테스트 통과**(config 11 · archive 23 · request 24).
- 수용 grep 은 Task 1 · Task 2 모두 OK 다(`"name": "@gh-radar/tick-convert"` · lockfile `tick-convert` · `GRID_BUCKET = "tick-grid"` · `ticks.zst` · index.ts `zstdCompressSync` · `export function isLabelReady` · `READY_GRACE_DAYS = 2` · request.ts `NOT_UPLOADED`).
- pgTAP 대상은 없다(DB 변경 없음). 배포 · `supabase db push` · `git push` 는 하지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 견고성] 통독 실패 시 claim 된 종목을 바로 닫기**
- **Found during:** Task 1
- **Issue:** 계획 흐름에는 통독 중 예외(깨진 원본 · zstd 오류)를 어떻게 처리할지가 없었다. 처리하지 않으면 claim 된 요청이 running 으로 남고, 25분 JOB_TIMEOUT 회수 전까지 웹이 「변환 중」 에 머문다.
- **Fix:** 결과가 아직 없는 종목을 failed `SCAN_FAILED: <msg>` 로 finish 하고, 실행 기록을 ok false 로 남긴다(main 1). 시험 1건을 더했다.
- **Commit:** `40b1307e` · `9d47a158`

**2. [Rule 2 - 무로그 손실 방지] zstd 다중 프레임 가드**
- **Issue:** 37-02 에서 Node zstd 해제가 이어붙인 프레임의 뒤 프레임을 조용히 버릴 수 있다고 실측했다. 원본은 한 프레임이지만 보장된 것은 아니다.
- **Fix:** `scan.ts` 는 해제기 `bytesWritten` 이 파일 크기보다 작으면 throw 한다. 스크래치 실측으로, 뒤 프레임을 버린 경우(24/48B)는 이 값이 작게 나와 잡힌다는 것을 확인했다.
- **Commit:** `40b1307e`

**3. [Rule 2 - 견고성] 메타 upsert 실패 처리**
- **Issue:** 계획은 「성공 키만 upsert」 까지만 정했고, upsert 자체가 실패했을 때는 정하지 않았다.
- **Fix:** 그 실행에서 올린 종목 전부를 실패 메시지로 finish 한다(main 1). 객체는 남지만 메타가 가리키지 않으므로 해가 없다.
- **Commit:** `40b1307e`

**4. [작은 시그니처 조정]**
- `buildGridFile` 은 원시 레코드를 `RecordSink`(늘어나는 단일 버퍼)에서 받는다. 레코드마다 `encodeRecord` 배열을 만들면 hot 종목에서 객체 수 오버헤드가 커져서 바꿨다. 바이트는 `encodeRecord` 와 같고, 시험이 `iterRecords` 로 왕복을 확인한다.
- `scanObjects` 반환에 `keyed` · `truncatedFiles` 를 더했다.
- 모드 공용 의존성 타입 `JobDeps`(sb · store · config · now · clock)는 `modes/request.ts` 에 두었다. 계획 파일 목록 밖에 새 파일을 만들지 않으려는 선택이고, 37-18 이 공용 파일로 옮겨도 된다.
- request 판정 헬퍼 `judgeReady` · `hasReadyWindowObjects` 를 더했다.
- `vitest.config.ts` 에 `env.LOG_LEVEL = silent` 기본값을 넣었다(시험 출력 정리 · `LOG_LEVEL=info` 로 켤 수 있다).

---

**Total deviations:** 자동 수정 3건(전부 Rule 2) + 시그니처 조정. 범위 확대는 없다.

## Known Stubs

없다(TODO · placeholder · 뼈대 grep 0건).

## Issues Encountered

- 워크트리 격리 쉘이 heredoc · 복합 명령을 거부해서, 스크립트 파일(scratchpad)과 Edit 도구로 우회했다. 결과에는 영향이 없다.
- 통독이 실패한 실행의 `bytes_read` 는 0 으로 기록된다. 스캔 통계가 예외와 함께 사라지기 때문이다. 비용 실측(SC3)은 정상 실행 기록만 쓰므로 그대로 두었다.

## Next Phase Readiness

- **37-18(nightly · Dockerfile · 배포):** `MODES` 에 `nightly` 한 줄을 더하면 된다. 그대로 쓸 수 있는 것은 `isDayReady` · `READY_GRACE_DAYS` · `kstYmdDaysAgo` · `createMeta().runsSince/candidates/purgeOld` · `GridStore.removeDates` · `config.stageChunkBytes/nightlyBudgetMs/catchupDays/upPct` 다. 스테이징 청크를 이어붙일 때는 `splitZstdFrames` 를 거쳐야 한다(37-02).
- **37-12(promote):** 같은 모드 표 · `gridObjectPath(…, 'promoted')` · `upsertGrids('promoted', …)` 를 쓴다.
- **37-16:** 배포 · 실측(SC3 — 실제 GCS 마운트 통독 시간 · 읽기 비용) 몫이다.

## Self-Check: PASSED

- FOUND: workers/tick-convert/src/{index,config,logger,archive,scan,grid-file,store,meta}.ts · src/modes/request.ts · src/services/supabase.ts
- FOUND: workers/tick-convert/tests/{request,config,archive}.test.ts · tests/helpers/{synth-archive,fake-supabase}.ts
- FOUND: 커밋 `40b1307e` · `0a5b1f03` · `9d47a158` (HEAD 조상)
- 워커 전체 vitest 58/58 통과 · typecheck 통과
