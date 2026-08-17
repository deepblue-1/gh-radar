---
phase: quick-260817-f1a
plan: 01
subsystem: workers/intraday-sync, workers/home-sync, workers/limit-up-sync, packages/shared
tags: [휴장일가드, 데이터무결성, 키움API, KRX캘린더]
status: checkpoint-pending
dependency_graph:
  requires:
    - "workers/intraday-sync staleGuard (2차/3차 방어망, 무손실 유지)"
  provides:
    - "@gh-radar/shared: KRX_HOLIDAYS / isKrxHoliday / isKrxCalendarStale / kstDateIso"
    - "intraday-sync 0차 캘린더 게이트 + 1차 ka10081 dt 게이트"
    - "home-sync 0차 캘린더 게이트"
    - "limit-up-sync 0차 캘린더 게이트 (D-1 기준)"
  affects:
    - "stock_daily_ohlcv (휴장일 write 경로 차단)"
    - "home_theme_snapshots (휴장일 write 경로 차단)"
tech_stack:
  added: []
  patterns:
    - "결정적 신호(캘린더 + 소스 자신의 dt) 우선, 값 비교 휴리스틱은 후단 방어로 강등"
    - "역방향 오탐 대비 킬 스위치 env (DT_GUARD_ENABLED) + 보수적 판정 규칙"
key_files:
  created:
    - packages/shared/src/krxCalendar.ts
    - packages/shared/src/__tests__/krxCalendar.test.ts
    - workers/intraday-sync/src/kiwoom/fetchDailyChart.ts
    - workers/intraday-sync/tests/fetchDailyChart.test.ts
    - workers/limit-up-sync/tests/dispatch.test.ts
  modified:
    - packages/shared/src/index.ts
    - workers/intraday-sync/src/index.ts
    - workers/intraday-sync/src/config.ts
    - workers/intraday-sync/tests/runCycle.test.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts
    - workers/limit-up-sync/src/index.ts
    - scripts/deploy-intraday-sync.sh
metrics:
  tasks_completed: 2
  tasks_total: 3
  commits: 5
  duration: "~12분 (Task 1-2, 코드 구간)"
  completed: 2026-08-17
---

# Quick Task 260817-f1a: 휴장일 가짜 일봉 근본 차단 Summary

2026-08-17 휴장일에 키움이 재방출한 직전 거래일 스냅샷이 staleGuard 를 뚫고 DB 를 오염시킨 사고를,
KRX 휴장일 캘린더(0차)와 키움 자신의 일봉 `dt`(1차)라는 두 결정적 신호로 write 경로 앞단에서 차단.

**상태: Task 3(배포·오염 데이터 삭제·프로덕션 실측) 체크포인트 대기 중.** 코드 구간(Task 1·2)만 완료.

## 완료된 작업

### Task 1 — KRX 휴장일 캘린더 0차 가드 (`3819884`, `43aa453`, `14f1042`)

`packages/shared/src/krxCalendar.ts` 신설:

- `KRX_HOLIDAYS` 7일 seed (2026-08-17 + 잔여 6일, RESEARCH §Q2 기사 원문 교차검증분만)
- `isKrxHoliday(dateIso)` — 모듈 스코프 `Set` 으로 O(1) 조회
- `isKrxCalendarStale(dateIso)` — `> 2026-12-31` 이면 true. 2027 seed 미갱신 시 매 사이클 warn 으로
  조용한 무력화 방지 (T-f1a-06)
- `kstDateIso(now)` — 워커의 `todayIsoKst`/`computeSlot` 과 동일한 `+9h → getUTC*` 방식

워커 3종 게이트:

| 워커 | 판정 날짜 | skip 동작 |
|------|-----------|-----------|
| intraday-sync | 오늘(KST) | `{step1Count:0, step2Count:0, failed:0}` 반환, 키움/DB write 0 |
| home-sync | `tradeDate` (afterClose 게이트보다 **앞**) | `skipped:true` summary, `upsertSnapshot` 미호출 |
| limit-up-sync | **직전일 D-1** | `{skipped:true, reason:"krx_holiday", prevDateIso}`, `runRebuild` 미호출 |

limit-up-sync 만 D-1 기준인 이유: Scheduler `0 2 * * 2-6` (화~토 새벽 2시) 의 대상 거래일은 오늘이 아니라 D-1.
오늘 기준으로 판정하면 8/18(화) 02:00 실행이 8/17 오염 데이터를 그대로 rebuild 한다.

기존 `staleGuard` 와 ka10027 0행 가드는 **삭제하지 않고** 2차·3차 방어망으로 유지.

### Task 2 — ka10081 dt 1차 가드 (`998a9c7`, `1098d66`)

`workers/intraday-sync/src/kiwoom/fetchDailyChart.ts` 신설 — `fetchKa10081LatestDt`:

- `POST /api/dostk/chart`, `api-id: ka10081`, body `{stk_cd, base_dt, upd_stkpc_tp:"1"}`
- `stk_dt_pole_chart_qry` 에서 `/^\d{8}$/` 만족하는 `dt` 의 **문자열 max** (배열 정렬 방향 가정 금지)
- 단일 호출(`cont-yn: "N"`, 페이지네이션 없음), 후보 없으면 `null` → fail-open
- 401/429/`return_code` 에러 분류는 `fetchRanking.ts` 규약 mirror
- 응답 전문 로깅 금지 — `latestDt` 만 caller 가 로깅 (T-f1a-04)

`config.ts` 확장:

- `dtGuardEnabled` (`DT_GUARD_ENABLED`, default **true**) — 킬 스위치
- `dtGuardProbeCodes` (`DT_GUARD_PROBE_CODES`, default `["005930","069500"]`) — 단일 종목 거래정지 리스크 분산

`index.ts` 실행 순서 (핵심):

```
1. dateIso + cycle start 로그
2. isKrxCalendarStale warn
3. token 발급 + kiwoom client  ← 게이트보다 앞으로 이동 (probe 에 필요)
4. probe (dtGuardEnabled 시) → log.info "ka10081 dt probe"
5. 0차 isKrxHoliday → skip           (probe 결과는 이미 로깅됨 = 휴장일 실측 확보)
6. 1차 dt 판정 → skip
7. 기존 흐름 (fetchKa10027 …)
```

판정 규칙(보수적): `okProbes.length > 0 && okProbes.every(latestDt !== todayBasDd)` 일 때만 skip.
하나라도 오늘 dt 가 있으면 통과 — 역방향 오탐(A2 반증)이 정방향 미탐보다 훨씬 치명적이기 때문.
probe 전부 실패 시 warn 후 fail-open, `withRetry` 미적용.

## 계획 대비 변경 사항

### [제약 추가 — 오케스트레이터 지시] dt 가드 skip 판정을 KST 09:00 이후로 한정

- **문제:** 08시대(NXT 프리마켓) 사이클은 **정상 거래일에도** 오늘 일봉이 아직 생성되지 않아 `dt=전일`이 정상이다.
  원안대로면 매 거래일 프리마켓 시세 갱신이 통째로 멈추는 역방향 오탐이 확정적으로 발생한다.
- **조치:** `hourKst < 9` 이면 skip 하지 않고 관측 로그(`"프리마켓(09:00 이전) 사이클 — … 판정 보류(관측만)"`)만 남긴다.
  0차 캘린더 가드는 시간과 무관하게 적용 (휴장일 08시대도 정상 skip).
- **테스트 고정:** `08:30 KST + dt=전일 → skip 안 함` / `09:30 KST + dt=전일 → skip` 2케이스.

### [Rule 1 - Bug] 기존 `runCycle.test.ts` 가 실제 시스템 날짜에 의존

- **발견:** Task 1 게이트 추가 직후 기존 케이스 2건 실패. 실행일(2026-08-17)이 휴장일이라 cycle 이 전부 skip.
- **조치:** 해당 describe 의 `beforeEach` 에서 `vi.useFakeTimers({toFake:["Date"]})` + `setSystemTime(2026-08-18 10:00 KST)` 로 고정.
  `setTimeout` 은 실제 유지해 `withRetry` 백오프와 간섭하지 않도록 `toFake` 를 Date 로 한정.
- **커밋:** `14f1042`

### [Rule 2 - Missing critical] 배포 스크립트에 `DT_GUARD_ENABLED` 주입

- **발견:** `deploy-intraday-sync.sh` 는 `--set-env-vars` 로 env 를 **전량 치환**한다. 킬 스위치를 콘솔/CLI 로 꽂아도
  다음 재배포에서 지워져, 계획의 성공 기준 #5("코드 변경 없이 원복 가능")가 성립하지 않는다.
- **조치:** `COMMON_ENV` 에 `DT_GUARD_ENABLED=${DT_GUARD_ENABLED:-true}` 추가.
  원복 절차: `DT_GUARD_ENABLED=false ./scripts/deploy-intraday-sync.sh`
- **커밋:** `1098d66`

### 테스트 stub 기본값 변경

`runCycle.test.ts` 의 `stubEnv()` 가 `DT_GUARD_ENABLED=false` 를 기본 주입한다.
dt 가드와 무관한 기존 케이스가 실제 axios 로 키움을 호출하는 것을 막기 위함이며,
dt 가드 전용 describe 만 `"true"` 로 덮어쓰고 `fetchDailyChart` 를 mock 한다.

## 검증 결과

| 대상 | 결과 |
|------|------|
| `packages/shared` vitest | 98/99 pass — **1건은 선재 결함**(아래 Deferred) |
| `packages/shared` build(tsup) + typecheck | exit 0 |
| `workers/intraday-sync` vitest | **118/118 pass** (기존 회귀 0 + 신규 fetchDailyChart 7 + runCycle 6) |
| `workers/home-sync` vitest | **138/138 pass** (신규 휴장일 2케이스 포함) |
| `workers/limit-up-sync` vitest | **9/9 pass** (신규 dispatch 2케이스 포함) |
| 워커 3종 typecheck + build | 전부 exit 0 |
| `bash -n scripts/deploy-intraday-sync.sh` | exit 0 |

## Deferred Issues (범위 외 — 본 변경과 무관)

**`packages/shared/src/__tests__/theme.test.ts` 1건 실패 (선재).**
`THEME_STOCK_SOURCES` 가 3개(`naver/alphasquare/user`)인데 테스트는 `ai` 포함 4개를 기대.
원인은 `22b37bc feat(quick-260706-erk): 공유 타입·테마 프론트에서 'ai' source 제거` 가 상수만 바꾸고
테스트를 갱신하지 않은 것. base commit `3935c32` 에서도 동일하게 실패한다.
상세: `deferred-items.md`. 별도 quick task 로 기대값 정정 권장.

## 남은 작업 — Task 3 (checkpoint, 오케스트레이터 실행)

**순서 엄수: 배포(게이트) 먼저, 삭제 나중.** intraday-sync 는 매분 실행되므로 먼저 삭제하면 즉시 재오염된다.

1. **STEP 1 배포** — `deploy-intraday-sync.sh` / `deploy-home-sync.sh` / `deploy-limit-up-sync.sh`
2. **STEP 2 게이트·실측 확인** — 휴장일 skip 로그 + Job Succeeded + **`ka10081 dt probe` 의 `latestDt` 실측값 기록**
   - `20260814` → A1 확정, dt 가드 유효
   - `20260817` → A1 반증 → `DT_GUARD_ENABLED=false` 재배포, 0차 캘린더 단독 운영
3. **STEP 3 오염 데이터 삭제** (사용자, Supabase SQL Editor) — `stock_daily_ohlcv`/`home_theme_snapshots` 의 `2026-08-17` 행
4. **STEP 4 육안 확인** — 종목 차트 마지막 캔들이 8/14 로 복귀, 홈 정상
5. **STEP 5 8/18 관측 예약** — 09:0x 이후에도 skip 지속 시 A2 반증 → 즉시 킬 스위치

### SUMMARY 미기재 항목 (Task 3 완료 후 채울 것)

- [ ] ka10081 `latestDt` 실측값 (V2 결과, A1 확정/반증)
- [ ] 삭제된 행 수 (`stock_daily_ohlcv` 예상 ~3,660 / `home_theme_snapshots` 예상 ~34)
- [ ] 8/18 프리마켓·정규장 관측 결과

## Self-Check: PASSED

- 신규 파일 5종 전부 존재 확인 (`krxCalendar.ts`, `krxCalendar.test.ts`, `fetchDailyChart.ts`, `fetchDailyChart.test.ts`, `dispatch.test.ts`)
- 커밋 5건 전부 `git log` 확인 (`3819884` `43aa453` `14f1042` `998a9c7` `1098d66`)
- key_links 확인: `isKrxHoliday` 가 워커 3종 `index.ts` 에 배선, `fetchKa10081LatestDt` 가 intraday-sync `index.ts` 에 배선,
  `2026-08-17` 이 `krxCalendar.ts` seed 에 존재
- working tree clean (docs 산출물만 untracked — 오케스트레이터가 docs 커밋 담당)
