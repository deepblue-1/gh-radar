---
phase: quick-260820-fh2
plan: 01
subsystem: workers/intraday-sync, workers/candle-sync
tags: [일봉오염, NXT, KRX-EOD, recover, 가드]
requires:
  - workers/intraday-sync (ka10027 STEP1/STEP2 파이프라인)
  - workers/candle-sync (recover mode + KRX bydd_trd)
provides:
  - "isDailyWriteWindow / isEodClosePass — KST 정규장·EOD 창 판정 순수 함수"
  - "runEodClosePass — ka10027 stex_tp=1 sweep 으로 KRX 공식 종가 확정"
  - "fetchRecentTradingDates — DB distinct 기준 최근 N영업일 조회"
  - "recover 강제 재적재 (RECOVER_FORCE_RECENT_DAYS, default 2)"
affects:
  - stock_daily_ohlcv (쓰기 창 축소 + EOD 덮어쓰기)
  - stock_quotes / top_movers (무변경 — 표시 계층 회귀 방지)
tech-stack:
  added: []
  patterns:
    - "표시 계층(stock_quotes/top_movers)과 기록 계층(stock_daily_ohlcv)의 소스 분리"
    - "5분 슬롯 5회 재시도 + idempotent upsert 로 EOD 패스 단일 실패 흡수"
    - "forced-first 병합 후 maxCalls 상한 — 우선순위 높은 일자가 상한에 잘리지 않게"
key-files:
  created:
    - workers/intraday-sync/src/marketWindow.ts
    - workers/intraday-sync/src/pipeline/eodClose.ts
    - workers/intraday-sync/tests/marketWindow.test.ts
    - workers/intraday-sync/tests/eodClose.test.ts
    - workers/candle-sync/src/pipeline/recentDates.ts
    - workers/candle-sync/tests/recentDates.test.ts
  modified:
    - workers/intraday-sync/src/index.ts
    - workers/intraday-sync/src/kiwoom/fetchRanking.ts
    - workers/intraday-sync/tests/fetchRanking.test.ts
    - workers/intraday-sync/tests/runCycle.test.ts
    - workers/candle-sync/src/config.ts
    - workers/candle-sync/src/modes/recover.ts
    - workers/candle-sync/tests/runRecover.test.ts
decisions:
  - "D-fh2-01: 정규장 밖 사이클은 일봉만 skip, stock_quotes/top_movers 는 계속 갱신 — NXT 실시간 표시 유지"
  - "D-fh2-02: EOD 패스는 stock_daily_ohlcv 만 쓴다. stock_quotes 를 덮으면 '장 마감 후 화면 멈춤' 회귀"
  - "D-fh2-03: recover forced 일자를 missing 앞에 병합 — maxCalls 상한에서 최근 일자가 잘리지 않도록"
  - "isDailyWriteWindow 상한은 15:30 포함 — 15:20~15:30 동시호가가 공식 종가를 확정하는 구간"
  - "isEodClosePass 상한은 15:55 — 16:00 시간외 단일가(±10%) 개시 전에 반드시 끝나야 함"
metrics:
  duration: ~25분
  completed: 2026-08-20
  tasks_completed: 2
  tasks_total: 3
  status: Task 3(배포·백필) 미실행 — 오케스트레이터/사용자 액션 대기
---

# Quick 260820-fh2: intraday-sync NXT 일봉 오염 차단 + KRX EOD 종가 확정 Summary

NXT 프리/애프터마켓 체결가가 `stock_daily_ohlcv` 종가를 덮어쓰던 경로를 정규장 창(09:00~15:30) 게이트로 차단하고, 15:35~15:55 사이클이 `ka10027 stex_tp="1"`(KRX 전용)로 당일 공식 종가를 확정하도록 EOD 패스를 추가했다. 동시에 candle-sync recover 의 overlay 가 구조적으로 한 번도 발동하지 않던 결함을 최근 2영업일 무조건 재적재로 보완했다.

## 무엇을 만들었나

### Task 1 — intraday-sync 일봉 쓰기 창 제한 + EOD KRX 전용 종가 패스

- **`src/marketWindow.ts` (신규)** — `kstMinutesOfDay` / `isDailyWriteWindow` / `isEodClosePass` 순수 함수 3종.
  - `isDailyWriteWindow`: 540(09:00) ≤ m ≤ 930(15:30), 양끝 포함.
  - `isEodClosePass`: KST 15시 + 분 ∈ {35,40,45,50,55}.
- **`src/kiwoom/fetchRanking.ts`** — `fetchKa10027(client, token, sortTp, hardCap, stexTp = "3")` 로 5번째 인자 추가. 하드코딩 `stex_tp: "3"` 제거(기본값으로 이전, 기존 STEP1 호출부 무변경).
- **`src/pipeline/eodClose.ts` (신규)** — `runEodClosePass(deps)`. `sort_tp` 1/3 을 각각 `stex_tp="1"` 로 sweep → `ka10027RowToCloseUpdate` 매핑(개별 실패 skip) → code dedupe → `intradayUpsertClose` 만 호출. `stock_quotes`/`top_movers` 는 의도적으로 건드리지 않음.
- **`src/index.ts`** — `dailyWrite`/`eodPass` 를 cycle 시작 로그에 포함. `intradayUpsertClose`(STEP1)와 `intradayUpsertOhlc`(STEP2)를 `dailyWrite` 로 게이트하고, `upsertQuotesStep1`/`rebuildTopMovers`/`upsertQuotesStep2` 는 무게이트 유지. STEP2 이후 `eodPass` 시 `runEodClosePass` 를 try/catch 로 호출(실패해도 cycle 계속 — 다음 5분 슬롯이 재시도).
- 반환 shape `{ step1Count, step2Count, failed }` 3키 유지. 일봉 skip 시 `step1Count=0`.

### Task 2 — candle-sync recover 최근 2영업일 무조건 재적재

- **`src/pipeline/recentDates.ts` (신규)** — `fetchRecentTradingDates(supabase, n)`. `missingDates.ts` Step 2 의 20일 창 + 클라이언트측 Set dedupe 패턴 재사용. `n <= 0` 이면 쿼리 없이 `[]`, error 는 로그 후 throw.
- **`src/config.ts`** — `recoverForceRecentDays` (`RECOVER_FORCE_RECENT_DAYS`, default 2, 0 = 킬 스위치).
- **`src/modes/recover.ts`** — `findMissingDates` 앞에서 forced 일자를 try/catch 로 조회(실패 시 warn + 빈 배열, fail-open). `targetDates = Set([...forced, ...missing]).slice(0, recoverMaxCalls)` — forced 가 앞이라 상한에 잘리지 않는다. 시작 로그에 `{ forcedDates, missingDates, targetDates }` 기록. 루프 본문(0 row skip / >50% OHLV=0 skip / bootstrap / per-date 격리)은 전부 재사용되어 forced 일자에도 동일 가드가 걸린다.

## Task 별 커밋

| Task | 단계 | 커밋 | 메시지 |
|------|------|------|--------|
| 1 | RED | `56af199` | test(quick-260820-fh2): 일봉 쓰기 창 제한 + EOD KRX 종가 패스 실패 테스트 추가 |
| 1 | GREEN | `7233c7b` | feat(quick-260820-fh2): 일봉 쓰기 창 09:00~15:30 제한 + EOD KRX 전용 종가 패스 |
| 2 | RED | `ad89212` | test(quick-260820-fh2): candle-sync recover 최근 2영업일 강제 재적재 실패 테스트 추가 |
| 2 | GREEN | `fcc1c08` | feat(quick-260820-fh2): candle-sync recover 최근 2영업일 무조건 KRX 재적재 |

REFACTOR 커밋 없음 — 두 태스크 모두 GREEN 시점 코드가 최종 형태였다.

## 검증 결과

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/intraday-sync test` | ✅ 19 files / **148 tests** passed |
| `pnpm --filter @gh-radar/candle-sync test` | ✅ 10 files / **65 tests** passed |
| `pnpm -r typecheck` | ✅ 12/12 workspace 프로젝트 Done |
| `grep -v '^\s*//' fetchRanking.ts \| grep -c 'stex_tp: "3"'` | ✅ `0` (하드코딩 제거 확인) |
| 08:30·15:45 사이클이 `intradayUpsertClose` 미호출 | ✅ runCycle.test.ts 단언 |
| 15:45 만 `runEodClosePass` 호출, 15:31 은 미호출 | ✅ runCycle.test.ts 단언 |
| "결측 0 + forced 2일자 → datesProcessed=2" | ✅ runRecover.test.ts 단언 |
| 기존 runRecover 4개 케이스 미회귀 | ✅ 전부 통과 |

기존 테스트 회귀 없음. intraday-sync 는 121 → 148 tests, candle-sync 는 60 → 65 tests.

## 계획과의 차이

### 자동 수정 (Rule 3 — blocking issue)

**1. [Rule 3 - Blocking] 워크트리에 `@gh-radar/shared` dist 부재로 vitest 전체 collect 실패**
- **발견 시점:** Task 1 RED 테스트 실행
- **문제:** 신규 워크트리에는 `packages/shared/dist` 가 없어 `Failed to resolve entry for package "@gh-radar/shared"` 로 runCycle 계열 테스트 파일 5개가 통째로 collect 실패했다. 코드 문제가 아니라 환경 문제.
- **조치:** `pnpm --filter @gh-radar/shared build` 실행. 소스 변경 없음, 커밋 없음(dist 는 gitignore).

**2. [Rule 3 - Blocking] `pnpm install` 이 `pnpm-workspace.yaml` 에 placeholder `allowBuilds` 블록을 자동 추가**
- **발견 시점:** Task 1 RED 커밋 직전 `git status`
- **문제:** pnpm 11.15.1 이 ignored build scripts 안내용으로 `allowBuilds: { esbuild: set this to true or false, ... }` 를 워크스페이스 설정에 써넣었다. 본 태스크와 무관한 툴링 노이즈.
- **조치:** `git checkout -- pnpm-workspace.yaml` 로 원복. 이후 테스트는 `--config.verify-deps-before-run=false` 로 deps 재검증을 우회해 재발을 막았다.

### 계획 대비 보강 (테스트 추가)

플랜 `<behavior>` 에 명시되지 않았으나 다음 케이스를 추가했다 — 모두 회귀 방지 목적이며 구현 변경은 없다.

- `runCycle.test.ts`: "10:00 정규장 → 일봉 쓰기 정상 + EOD 미호출" (게이트가 정상 경로를 죽이지 않음을 명시 단언), "EOD 패스 실패가 cycle 을 죽이지 않는다".
- `eodClose.test.ts`: "매핑 실패 row 는 skip 하고 나머지 계속 처리".
- `recentDates.test.ts`: "n <= 0 → 쿼리 미실행" (킬 스위치가 불필요한 DB 호출도 안 하도록).
- `runRecover.test.ts`: "recoverForceRecentDays=0 → 강제 재적재 비활성".

`runRecover.test.ts` 의 `loadConfig` mock 은 `recoverMaxCalls` 상한 케이스를 위해 고정 객체에서 `vi.hoisted` 컨테이너로 전환했다. 기존 4개 케이스는 `beforeEach` 에서 `baseConfig()` 로 리셋되어 기대값이 그대로 보존된다.

## 인증 게이트

없음. 이 실행에서는 외부 인증이 필요한 단계가 없었다(배포·백필은 Task 3 로 분리).

## Known Stubs

없음. 두 태스크 모두 실제 데이터 경로에 배선되어 있으며 하드코딩된 빈 값·placeholder 는 도입하지 않았다.

## Threat Flags

플랜 `<threat_model>` 밖의 신규 보안 표면 없음. 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경 모두 없다. 신규 패키지 설치도 없다(T-fh2-SC 유지).

플랜의 `mitigate` 항목 반영 상태:

| Threat ID | 반영 |
|-----------|------|
| T-fh2-01 | ✅ `isDailyWriteWindow` 로 09:00~15:30 밖 일봉 쓰기 차단 |
| T-fh2-02 | ✅ `isEodClosePass` 상한 15:55 고정, 16:00 이후 실행 불가 (테스트 단언) |
| T-fh2-03 | ✅ forced 일자도 `>50% OHLV=0 skip` 가드 통과 (테스트 단언) |
| T-fh2-04 | ✅ 5분 슬롯 5회 + 기존 `acquireKiwoomRateToken` 버킷 공유 (fetchKa10027 내부) |

## ⚠️ Task 3 미실행 — 오케스트레이터/사용자 액션 필요

**Task 3 (배포 + 2026-05-21~2026-08-19 백필 + 정정 검증) 은 이 워크트리에서 실행하지 않았다.** `checkpoint:human-verify gate="blocking"` 이며 되돌리기 어려운 프로덕션 쓰기(Cloud Run 배포 + `stock_daily_ohlcv` 백필)를 포함하므로 실행자 범위 밖이다.

남은 작업(플랜 Task 3 원문 참조):

1. `bash scripts/deploy-intraday-sync.sh` — Scheduler cron `* 8-15 * * 1-5` 유지 확인
2. `bash scripts/deploy-candle-sync.sh` — Job 3개 + Scheduler 2개 갱신
3. `gh-radar-candle-sync-backfill` 을 `MODE=backfill, BACKFILL_FROM=2026-05-21, BACKFILL_TO=2026-08-19` 로 실행 → `daysProcessed ≈ 62`, `daysFailed = 0` 확인
4. 검증: `000660` / `2026-08-19` 의 `close === 1500000` 이고 `close <= high` (백필 전 close 1,606,000 / high 1,559,000)
5. 교차 확인: `005930` 임의 오염 일자 1건도 `close <= high` 성립
6. 사후 확인(배포 당일 장 마감 후): 15:35~15:55 사이클 로그에 `runEodClosePass` count > 0, 15:31~15:59 사이클에 "정규장 밖 — 일봉 쓰기 skip" 로그

**순서 주의:** intraday-sync 를 먼저 배포해야 백필 직후 재오염되지 않는다.

배포 전 참고 — 신규 env 는 `RECOVER_FORCE_RECENT_DAYS` 하나뿐이고 default 2 로 동작하므로 `deploy-candle-sync.sh` 수정 없이 배포 가능하다. 명시적으로 끄려면 recover Job 에 `RECOVER_FORCE_RECENT_DAYS=0` 을 주면 된다.

## Success Criteria 상태

| # | 기준 | 상태 |
|---|------|------|
| 1 | 정규장 밖 사이클이 `stock_daily_ohlcv` 를 쓰지 않고 `stock_quotes` 만 갱신 | ✅ 코드 + 테스트 |
| 2 | 15:35~15:55 사이클이 `ka10027 stex_tp="1"` 로 KRX 공식 종가 upsert | ✅ 코드 + 테스트 |
| 3 | recover 가 결측 판정 없이도 최근 2영업일 재적재 | ✅ 코드 + 테스트 |
| 4 | 2026-05-21~08-19 백필 완료 + 000660 종가 1,500,000 정정 | ⏸ Task 3 대기 |
| 5 | 두 워커 프로덕션 배포 + 기존 스케줄 유지 | ⏸ Task 3 대기 |

## Self-Check: PASSED

- 생성 파일 6개 전부 디스크 존재 확인
- 커밋 4개(`56af199`, `7233c7b`, `ad89212`, `fcc1c08`) 전부 `git log` 존재 확인
- 워킹 트리 clean (stray 변경 없음)
