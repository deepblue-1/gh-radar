---
phase: 39-trade-diagnosis-chatbot
plan: 04
subsystem: api
tags: [ticks, zstd, tickgw, supabase-storage, diagnosis, chatbot]

requires:
  - phase: 37-tick-viewer
    provides: "pcapns-rec+zstd/1 레코드 프레이밍 · splitZstdFrames · iterRecords · decodeAny · tick_open_for_user · requestTickConvert · tickgw 당일 경로"
provides:
  - "getMarketTicksText — {isin, exchange, date, from, to} → 범례 + 원본 A3/B6 한 줄 + 잘림 문구 + 틱 보기 링크 텍스트(throw 없음)"
  - "formatA3Line · formatB6Line · tickViewerPath · MARKET_LEGEND · MARKET_WINDOW_MAX_MS(60000) · MARKET_MAX_RECORDS(400) · LIVE_WAIT_MAX_MS(20000)"
  - "fetchLiveBytes · LiveFetchMemoEntry — tickgw 상태표 서버판(실행 단위 메모로 증분)"
  - "openTickGridForServer — object_path 를 서버 안에서만 돌려주는 격자 열기"
  - "server/scripts/measure-diagnosis-tokens.ts (--dry)"
affects: [39-07, 39-09]

actuals:
  tokens: 12900
  tasks: 3
  commits: 5
plan_head_before: 65764351cf344c56dc2f1d4264de5d196be4ed99
plan_head_after: 8671610747a7086a86f55dad4bc88ed59cabb26e

tech-stack:
  added: []
  patterns:
    - "창 수집기(TickWindow) 하나를 격자(스트리밍 해제) · tickgw(프레임별 동기 해제) 두 경로가 공유 — 같은 줄을 만든다"
    - "모든 사용자(모델) 문구는 완성 문자열 리터럴 — 「자료 없음: …」 · 「변환 중 · …」 를 grep 으로 찾을 수 있다"

key-files:
  created:
    - server/src/services/specialists/diagnosis/diagnosis-market.ts
    - server/src/services/tick-live-fetch.ts
    - server/src/services/specialists/__tests__/diagnosis-market.test.ts
    - server/scripts/measure-diagnosis-tokens.ts
  modified:
    - server/src/services/ticks.ts

key-decisions:
  - "창 판정은 거래소 시각(trade_time_ns · proc_time_ns), 줄 순서는 수신순, 링크 t 는 창 안 첫 레코드의 수신 시각(KST ms)"
  - "to 는 주어진 순간까지 포함(HH:MM:SS 는 .000) — from+60초 넘으면 to = from+60초로 자르고 잘림 문구"
  - "tickgw state ready 는 complete 여부와 무관하게 받은 만큼 ok — 진단은 하루치 완결을 기다리지 않는다(워커 fetchLiveDay 와 다른 점)"
  - "MARKET_MAX_RECORDS 400 유지 — countTokens 실측은 보류(executor 는 live API 금지), 39-09 메인 세션에서 실측"

patterns-established:
  - "requestTickConvert 를 실제 구현 그대로 감싼 vi.mock 스파이로 호출 인자를 고정하고 동작은 RPC mock 으로 검증"

requirements-completed: [SC-1, SC-5]

coverage:
  - id: D1
    description: "지난 날짜 격자 경로 — 원본 A3/B6 골든 두 줄 · bs 공백 b_ · 60초/400건 잘림 · KRX/NXT 틱 보기 링크 · RPC 인자"
    requirement: "SC-1"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-market.test.ts#getMarketTicksText — 지난 날짜 격자 경로(Task 1)"
        status: pass
      - kind: unit
        ref: "server/tests/routes/ticks.test.ts (openTick 무변경)"
        status: pass
    human_judgment: false
  - id: D2
    description: "오늘 tickgw 경로 — 장 전/휴장 호출 0 · UNREACHABLE/401/queued 20초/blocked 사유 · 이어붙인 두 프레임 · 실행 메모 증분 · 기록 없음"
    requirement: "SC-1"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-market.test.ts#getMarketTicksText — 오늘 tickgw 경로(Task 2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "격자 없음 → 요청 변환(상한 공유 · 기다리지 않음) — 약 N분 · 한도 소진 · 경로 꺼짐 · 요청 실패 · 업로드 전 · 경합 재열기 · DMA 매핑 없음"
    requirement: "SC-1"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-market.test.ts#getMarketTicksText — 격자 없음 → 변환 요청(Task 3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SC-5 — 시세 도구는 우리 tickgw · Storage · RPC 만 부른다(전역 fetch 0 · 소스에 fetch(/axios 0줄)"
    requirement: "SC-5"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-market.test.ts#SC-5 — 시세 도구는 외부 원본을 부르지 않는다"
        status: pass
      - kind: other
        ref: "grep -rEn \"(^|[^A-Za-z_])fetch\\(|axios\" server/src/services/specialists/diagnosis/ server/src/services/tick-live-fetch.ts → 0줄"
        status: pass
    human_judgment: false
  - id: D5
    description: "토큰 실측 스크립트 — --dry 로 줄 길이 · 창 분포 출력, 실측(countTokens)은 키가 있는 메인 세션 몫"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/server exec tsx scripts/measure-diagnosis-tokens.ts --dry"
        status: pass
    human_judgment: true
    rationale: "countTokens 실측(400건 블록 토큰 수)은 live API 라 이 executor 에서 돌리지 않았다 — 39-09 메인 세션이 돌려 M 을 확정해야 한다"

duration: 14min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 04: 진단 시세 도구 엔진 Summary

**`getMarketTicksText` 하나로 지난 날짜는 Storage 격자를 서버가 프레임별 스트리밍으로 풀고, 오늘은 tickgw 상태표 서버판(`fetchLiveBytes`)으로 받아, 범례 + 원본 A3/B6 한 줄(bs 공백 `b_`) + 60초/400건 잘림 문구 + 틱 보기 링크를 돌려주고, 격자가 없으면 기존 요청 변환을 기다리지 않고 걸어 「변환 중 · 약 N분 뒤」 를 답한다.**

## Performance

- **Duration:** 약 14분
- **Started:** 2026-11-06T04:50:42Z
- **Completed:** 2026-11-06T05:04:22Z
- **Tasks:** 3
- **Files modified:** 5 (신규 4 · 수정 1)

## Accomplishments

- 지난 날짜 경로: `openTickGridForServer` → `storage.from("tick-grid").download` → `splitZstdFrames` → 프레임마다 `createZstdDecompress` 스트리밍 → 꼬리 잇기 `iterRecords` → `decodeAny` → 거래소 시각 창 → 한 줄. 창 끝 + 5초를 지나면 스트림을 닫는다(512Mi). 픽스처 골든 두 줄이 글자 그대로 나온다.
- 오늘 경로: `fetchLiveBytes` 가 loading·queued 2초 · delayed 5초 · blocked · 409 epoch 재시작(연속 3회 상한) · status 0 · 401 을 처리하고, 실행 단위 memo(`isin|ex`)로 두 번째 호출부터 offsetEnd 증분만 받는다. 이어붙인 프레임은 프레임마다 푼다.
- 격자 없음: `requestTickConvert` 를 그대로 불러 하루 상한 · Job 1회 판정을 웹 틱뷰어와 공유한다. 429/503/502 · 업로드 전 · 경합(grid_ready → 한 번 다시 열기) 이 각자 문구로 나온다. 대기(sleep) 0회.
- 실패는 모두 throw 없이 `source: "none"` + 완성 문구 + 서버 로그(원인은 로그에만).

## Task Commits

1. **Task 1: 지난 날짜 한 경로 끝까지(tracer)** — `6a5fee65` (feat)
2. **Task 2: 오늘 경로 — tickgw 상태표 서버판** — RED `3571a367` (test) → GREEN `349b8eb7` (feat)
3. **Task 3: 격자 없음 → 변환 요청 + 토큰 실측 스크립트** — RED `0639180d` (test) → GREEN `86716107` (feat)

**Plan metadata:** 이 SUMMARY 커밋(아래)

## Files Created/Modified

- `server/src/services/specialists/diagnosis/diagnosis-market.ts` — 공개 계약(`getMarketTicksText` · 타입 4종 · 상수 4종 · `formatA3Line` · `formatB6Line` · `tickViewerPath`) · 창 수집기 · 두 경로 · 변환 분기
- `server/src/services/tick-live-fetch.ts` — `fetchLiveBytes` · `LiveFetchMemoEntry` · `LiveUnavailableReason`
- `server/src/services/ticks.ts` — `openTickGridForServer` · `TickGridForServer` 추가, `openTick` 은 RPC 호출 · 게이트 · 모양 검사를 공용 헬퍼로 뽑았을 뿐 응답 무변경(`ticks.test.ts` 통과)
- `server/src/services/specialists/__tests__/diagnosis-market.test.ts` — 21개 테스트(격자 7 · 오늘 7 · 변환 6 · SC-5 1)
- `server/scripts/measure-diagnosis-tokens.ts` — 줄 길이 · 창 분포 · (키가 있으면) countTokens

## 토큰 실측

**실측 보류 — 39-09 메인 세션.** 병렬 executor 지시(유료/라이브 외부 API 금지)에 따라 `countTokens` 는 부르지 않았다. `--dry` 결과(픽스처 `cut1300-krx`, A3 3,089 · B6 8,901):

| 항목 | 값 |
|---|---|
| A3 평균 길이 | 60.3자 (RESEARCH 와 같음) |
| B6 평균 길이 | 144.6자 (RESEARCH 와 같음) |
| 범례 | 132자 |
| 10초 창 레코드(1초 간격 슬라이딩) | p50 30 · p90 78 · p99 306 · max 547 |
| 60초 창 레코드 | p50 202 · p90 379 · p99 1,641 · max 1,973 |
| 400건 혼합 블록 | 51,625자 (2.5자/토큰 가정이면 ≈ 20.7K 토큰 — 30K 이하라 M=400 유지) |

메인 세션 실행: `pnpm --filter @gh-radar/server exec tsx -r dotenv/config scripts/measure-diagnosis-tokens.ts` — 400건 블록이 30K 를 넘으면 출력이 `floor(400 × 20000 / 실측)` 을 권고한다. 창 분포가 RESEARCH 표(60초 p50 279)와 다른 것은 집계 방식(여기는 1초 간격 시작점 슬라이딩) 차이다.

## Decisions Made

- 창은 거래소 시각으로 거르고 줄은 수신순 그대로 — 서버는 정렬 · 묶기를 하지 않는다(D-06). 링크 `t` 는 창 안 첫 레코드의 **수신** 시각(틱뷰어 URL 규약).
- `to` 는 주어진 순간까지 포함(`13:00:05` = 13:00:05.000). 잘림 문구의 `<첫>~<끝>` 은 실제로 담긴 레코드의 거래소 시각(ms).
- 디코딩 전에 수신 시각이 창 −5초보다 이르면 건너뛰고, 태그 두 바이트(A3 · B6)를 먼저 본다 — 하루치 격자에서 창 앞 레코드를 디코딩하지 않는다(CPU). 격자는 종목 하나지만 `isin` 일치도 확인한다.
- tickgw `ready` 는 complete 와 무관하게 ok — 진단은 「지금까지」 를 본다. 사유 TIMEOUT · CONFLICT · BAD_RESPONSE 에도 각자 문구를 줬다(행동 명세 밖 · 모델이 원인을 구분하도록).
- 해제는 `Readable.from().pipe()` 대신 `createZstdDecompress().end(frame)` + `for await` — 같은 스트리밍이고 pipe 오류 전파 구멍이 없다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 실행 메모 타입을 Task 1 에서 먼저 만듦**
- **Found during:** Task 1
- **Issue:** 공개 계약 `MarketMemo = Map<string, LiveFetchMemoEntry>` 가 Task 2 파일(`tick-live-fetch.ts`)의 타입을 쓴다.
- **Fix:** Task 1 에서 `tick-live-fetch.ts` 에 타입만 두고, Task 2 에서 `fetchLiveBytes` 를 채웠다.
- **Files modified:** server/src/services/tick-live-fetch.ts
- **Committed in:** 6a5fee65 · 349b8eb7

**2. [Rule 1 - Acceptance] 사유 문구를 완성 문자열 리터럴로**
- **Found during:** Task 2 수락 기준 점검
- **Issue:** `none(reason)` 이 접두사를 붙이는 구조라 `grep -c "자료 없음:"` 이 4(기준 ≥ 6). Task 3 의 「변환 중 · …」 도 「자료 없음」 이 아닌 문구다.
- **Fix:** `none(text)` 가 완성 문구를 받게 하고 모든 호출을 `"자료 없음: …"` 리터럴로 — 이제 27건.
- **Files modified:** server/src/services/specialists/diagnosis/diagnosis-market.ts
- **Verification:** 같은 21개 테스트 통과 · grep 27
- **Committed in:** 349b8eb7

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 acceptance)
**Impact on plan:** 계약 · 문구 · 동작은 명세 그대로. 범위 추가 없음.

## TDD Gate Compliance

- Task 2: `test(39-04)` 3571a367 → `feat(39-04)` 349b8eb7. RED 6건 실패(전부 계획한 단언 — 「당일 시세 경로 꺼짐」 스텁이 돌려준 값). 분류기 `RED_EVIDENCE_OK`(대상 「이어붙인 두 zstd 프레임」, `-t` 로 대상만 · `LOG_LEVEL=silent`).
- Task 3: `test(39-04)` 0639180d → `feat(39-04)` 86716107. RED 5건 실패(전부 「그날 격자 없음」 스텁 · 스파이 0회). 분류기 `RED_EVIDENCE_OK`(대상 「429 → …」).
- 의미 판정: 두 RED 모두 대상 테스트가 실제로 돌았고 계획한 동작 단언에서 실패했다(로드 · 문법 · 픽스처 오류 없음). 이미 통과한 RED 케이스(tickgw 미결선 · fetch 0 · access false)는 Task 1 이 이미 만든 동작이라 예상된 통과다.
- 참고: vitest `tap-flat` 은 `toMatchObject` 실패의 여러 줄 diff 를 들여쓰지 않고 내보내 분류기가 `invalid_record`(Malformed TAP)로 거른다 — 한 줄 `toBe` 단언 대상만 `-t` 로 다시 돌려 기록했다(보고서 손편집 없음).
- REFACTOR 커밋 없음(변경 불필요).

## Issues Encountered

- pino 로거가 stdout 에 JSON 줄을 내 TAP 보고서 앞에 섞인다 — `LOG_LEVEL=silent` 로 돌려 해결(테스트 동작 무관).

## Known Stubs

없음. (Task 1 의 임시 「그날 격자 없음」 · 「당일 시세 경로 꺼짐」 분기는 Task 2 · 3 에서 모두 채웠다.)

## User Setup Required

None - 외부 서비스 설정 없음. (토큰 실측은 39-09 메인 세션이 기존 `ANTHROPIC_API_KEY` 로 1회 실행.)

## Next Phase Readiness

- 39-07 은 `getMarketTicksText(input, { supabase, userId, tickgw: app.locals.tickgw, trigger, dailyCap: config.tickRequestDailyCap }, memo)` 를 `get_market_ticks` 도구로 연결만 하면 된다. memo 는 진단 실행마다 `new Map()`.
- 39-09: ① 토큰 실측 1회(위 명령) ② 운영 이미지 Node ≥ 22.15 확인(zstd — 없으면 `자료 없음: 서버 zstd 미지원` + logger.error).

---
*Phase: 39-trade-diagnosis-chatbot*
*Completed: 2026-11-06*

## Self-Check: PASSED

- 파일 5개 존재 확인 · 작업 커밋 5개(6a5fee65 · 3571a367 · 349b8eb7 · 0639180d · 86716107)가 이 브랜치에 있음 · 작업 트리 깨끗함
- 계획 검증: diagnosis-market + ticks + ticks-live + tickgw-client + specialists 테스트 88개 통과 · server typecheck 통과 · SC-5 grep 0줄 · --dry 실행 통과
