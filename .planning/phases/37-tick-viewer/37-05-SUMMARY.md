---
phase: 37-tick-viewer
plan: 05
subsystem: shared-ticks-viewer-model
status: complete
tags: [ticks, viewer-model, exchange-order, inversion, book10, tick-time, density, vi, b9, typed-array]

requires:
  - phase: 37-02
    provides: "framing(iterRecords · encodeRecord · concatBytes) · layouts(A3/B6/R8/B9_LAYOUT) · decode(decodeFields · parse*) · readTicksZst · 컷 13시 · raw20k 픽스처"
  - phase: 37-03
    provides: "A3Trade · a3TradeOf · scopeTrades · classifyKrxOrders · tagNxtRuns 런 규칙 · cut1300-runs.json(inverted 84/182 · 90/179)"
provides:
  - "packages/shared/src/ticks/record-index.ts — TAG_CODE · TagCode · NO_BOARD · TickIndex · buildTickIndex · payloadOf · boardIndexOf · recvOrderOf · exchangeOrderOf · inversePerm · A3Columns · a3ColumnsOf · Inversion · inversionsOf"
  - "packages/shared/src/ticks/book.ts — lastB6Of · BookLevel · Book10 · bookAt · bookAmountOf · bookLagMs"
  - "packages/shared/src/ticks/tick-time.ts — KST_OFFSET_NS · dayStartNs · parseTickTime · fmtTickTime · lowerBoundRecv"
  - "packages/shared/src/ticks/density.ts — DENSITY_BUCKETS(144) · DENSITY_BUCKET_NS · densityOf · ViSpan · viSpansOf"
  - "packages/shared/src/ticks/members.ts — TEAM_MEMBERS · TeamMember · TEAM_MEMBER_LABEL · lastB9Of · MemberRow · memberTableAt"
affects: [37-10, 37-11, 37-12, 37-13, 37-14, 37-19]

actuals:
  tokens: 16700       # chars/4 over 실현 diff 전체 66,717자(코드 · 테스트 · RED 증거 JSON)
  tasks: 2
  commits: 3          # MEASURED: git rev-list --count 18088679..0aee9b21 (SUMMARY 커밋 제외)
plan_head_before: 18088679ec9ea1e0ebb47cdcd20425e5ec666aee
plan_head_after: 0aee9b21ae34ea833ea6082a9601829f1c3fd675

tech-stack:
  added: []
  patterns:
    - "뷰어 모델은 순수 함수 + typed array(Int32Array 순열 · BigInt64Array recv) — Web Worker 로 그대로 옮길 수 있다(A10)"
    - "지연 디코딩 — 인덱스는 머리(태그 · 길이 · msg_seq · board_id)만, A3 는 열 배열로 즉시, B6 · R8 · B9 는 선택 시 decodeFields"
    - "거래소순 = 보드별로 그 보드가 차지한 수신 자리에 seq 오름차순 재충전 — 순번 없는 행 · 보드 사이 순서는 수신 순서"
    - "A3 열은 레이아웃 필드 이름으로 오프셋을 찾아 직접 파싱(매직 넘버 없음) — decodeFields 와 전수 대조로 잠금"

key-files:
  created:
    - packages/shared/src/ticks/record-index.ts
    - packages/shared/src/ticks/book.ts
    - packages/shared/src/ticks/tick-time.ts
    - packages/shared/src/ticks/density.ts
    - packages/shared/src/ticks/members.ts
    - packages/shared/src/__tests__/ticks-record-index.test.ts
    - packages/shared/src/__tests__/ticks-book.test.ts
    - packages/shared/src/__tests__/ticks-time.test.ts
    - packages/shared/src/__tests__/ticks-density.test.ts
    - packages/shared/src/__tests__/ticks-members.test.ts
    - .planning/phases/37-tick-viewer/37-05-red-evidence.json
  modified:
    - packages/shared/src/ticks/index.ts

key-decisions:
  - "inversionsOf 는 1조각 런 뒤집힘도 낸다(목록 「↕」 표시는 1조각 주문 행에도 필요) — 골든 84 · 90 대조는 pieces ≥ 2 ∧ G1 로 걸러 nxt_runs inverted 정의와 맞춘다"
  - "A3Columns 에 n · nxt · isin(인턴된 문자열) 열을 더했다 — toTrades() 가 a3TradeOf 와 같은 A3Trade(isin · exchange 포함)를 내야 scopeTrades 가 파이썬과 같은 범위를 고른다"
  - "밀도 칸은 체결 시각이 아니라 수신 시각 기준(슬라이더가 수신 시간축) · [08:00, 20:00) 반열린 구간"
  - "VI 구간 — 열린 구간 중 다시 온 '1'(연장 · 재송신)은 같은 구간 · 짝 없는 '2' 는 무시"
  - "5창구 — teamflow member_rows 처럼 같은 창구가 두 단에 있으면 뒤 단이 이긴다 · 코드는 trim · 상위 5 밖 null"
  - "parseTickTime 은 YYYYMMDD · YYYY-MM-DD(kstDateIso) 둘 다 받고 달력 검증(2026-13-01 → null · dayStartNs 는 RangeError)"

requirements-completed: [D-00, D-11, D-18]

duration: ~25min
completed: 2026-11-02
---

# Phase 37 Plan 05: 뷰어 모델 Summary

**저장된 격자 바이트 하나로 수신순 · 거래소순(보드별 msg_seq 재배열) 순열, 닫는 B6 뒤집힘(KRX 84 · NXT 90 = 오라클), 선택 틱의 호가 10단(주 · 금액), `HH:MM:SS.mmm` 시각 점프, 5분 거래대금 밀도 144칸, VI 구간, 5창구 B9 표를 순수 함수 · typed array 로 낸다.**

## Performance

- **Duration:** 약 25분
- **Tasks:** 2 (Task 1 tracer · Task 2 TDD)
- **Files:** 생성 11 · 수정 1

## 컷 픽스처 측정값 (output 요청)

| 항목 | KRX `cut1300-krx` | NXT `cut1300-nxt` |
|------|------------------|------------------|
| 레코드 수(n) | 11,990 (A3 3,089 · B6 8,901) | 11,474 (A3 3,219 · B6 8,255) |
| 보드 목록 | `G1` | `G1` |
| inversionsOf 다조각 런(pieces ≥ 2 ∧ G1) | **84** (= runs.json inverted 84/182) | **90** (= runs.json inverted 90/179) |
| buildTickIndex | 4.8ms | 1.9ms |

(성능은 vitest 안 `performance.now()` 1회 측정 — 첫 측정은 JIT 예열 포함. 실패 조건 아님.)

## Accomplishments

- `buildTickIndex` — iterRecords 두 번(개수 · 채우기)으로 off · len · recvNs(BigInt64Array) · tag · ok · seq · board 를 만든다. n 은 decode.json 표 rows 합 · source.records 와 같고, seq · 보드는 전 A3 · B6 에서 decodeFields 와 같다.
- `exchangeOrderOf` — 결과가 순열이고, 보드마다 seq 비감소, seq -1 행 자리 불변, 보드별 자리 집합 = 수신순. 합성 7행(A3 G1 s2 → B6 G1 s1 → B9 → A3 G4 s1 → B6 G1 s3 → C3 → A3 G1 s4) → `[1,0,2,3,4,5,6]`.
- `a3ColumnsOf` — 전 A3 에서 `toTrades()[j]` 가 `a3TradeOf(rec, decodeFields(A3))` 와 deep-equal, pct · chg · cumValue 도 같다.
- `lastB6Of` — A3 자리 200개 등간격 표본에서 무차별 탐색(같은 보드 거래소순 앞쪽 마지막 B6)과 같다. `bookAt` 10단 · 총잔량 · 예상가는 decodeFields(B6) 와 같고 금액 = 잔량 × 가격. 장 시작 전 -1 → null, B9 행은 앞 행 보드를 쓴다.
- `parseTickTime` ↔ `fmtTickTime` 왕복, 25시 · 한 자리 분초 · 4자리 밀리초 → null, `lowerBoundRecv` 는 비항등 수신순에서 lower_bound.
- `densityOf` — 08:00 칸 0 · 07:59:59.999 / 20:00 제외 · 19:59:59.999 칸 143 · 단일가 bs 포함. 컷 13시 Σ칸 = 범위 A3 px×qty 합이고 13시 칸(60..71) 밖은 0.
- `memberTableAt` — 합성(교보 매도 3단 · NH 매수 1단) 표, raw20k 09시 실 B9 105건 전수 = decodeFields 단계 값.

## Task Commits

1. **Task 1 (tracer): 레코드 인덱스 · 거래소순 · 뒤집힘 · 마지막 B6 10단** — `13e0a274` (feat)
   - 트레이서 게이트: verify 명령 재실행 통과(20/20) — 확장 진행
2. **Task 2 RED: 시각 · 밀도 · VI · 5창구 실패 테스트** — `1ad587df` (test)
3. **Task 2 GREEN: 시각 점프 · 5분 밀도 · VI 구간 · 5창구 B9 표** — `0aee9b21` (feat)

## TDD Gate Compliance

- **RED** `1ad587df` — 테스트 3개 + 시그니처만 있는 스텁(값이 틀림). 모듈이 없을 때의 실패는 import 오류라 RED 가 아니므로 스텁을 두고 다시 돌렸다. 증거 `37-05-red-evidence.json` → `gsd_run check tdd-red-evidence` = **RED_EVIDENCE_OK**(target_test_failed). 대상: `ticks-time.test.ts > parseTickTime · fmtTickTime > 13:05:07.123 (2026-10-16 KST) = epoch ns` — expected `1792123507123000000n` · actual `null`.
  - semanticAssessment: 대상 테스트가 실행됐고 계획한 assertion 에서 스텁 값 때문에 실패했다(import · 문법 · 픽스처 오류 아님). 세 파일 전체 실행에서도 17건 중 15건이 스텁 값 AssertionError(통과 2건은 상수 · null 반환이 우연히 맞는 케이스). 세 파일 TAP 출력은 멀티라인 diff 때문에 분류기가 `invalid_record` 로 거부해 대상 파일 하나로 다시 돌린 기록을 제출했다.
- **GREEN** `0aee9b21` — 다섯 테스트 파일 37/37 통과.
- **REFACTOR** — 없음.

## Verification

- `pnpm --filter @gh-radar/shared build && … typecheck && … vitest run (다섯 파일) --maxWorkers=2` → exit 0 · **Test Files 5 passed · Tests 37 passed**.
- shared 전체 회귀: `vitest run --maxWorkers=2` → **38 files passed · 1037 passed · 2 skipped**(기존 선택 골든 skip).

## Deviations from Plan

### 추가한 기호 (Rule 2 — 호출자가 쓸 정확성 보조, 시그니처는 플랜 그대로)

**1. A3Columns 에 `n` · `nxt` · `isin` 열**
- **Found during:** Task 1
- **Issue:** `toTrades(): A3Trade[]` 가 A3Trade 의 `isin` · `exchange` 를 채워야 `scopeTrades`(exchange='KRX' 조건)와 `classifyKrxOrders`(isin 조건)가 파이썬과 같은 결과를 낸다 — 플랜 열 목록에는 없었다.
- **Fix:** isin(인턴된 문자열 배열) · nxt(Uint8Array, exchangeOf 규칙) · n 을 더했다. 전 A3 deep-equal 테스트로 잠금.
- **Commit:** `13e0a274`

**2. 작은 보조 기호** — `NO_BOARD` · `TagCode` · `payloadOf` · `boardIndexOf`(record-index) · `Book10.board` · `bookLagMs`(「Δms 전」 · truth ③) · `DENSITY_BUCKET_NS` · `TeamMember` · `memberTableAt` 반환의 `b9Rec`. 모두 추가뿐이고 기존 이름과 겹치지 않는다(배럴 build · typecheck 통과).

### 해석

**3. inversionsOf 범위** — 1조각 런도 낸다(목록 행 「↕」 표시용). 골든 대조는 pieces ≥ 2 ∧ G1 로 걸러 nxt_runs `inverted`(다조각 ∧ 닫는 B6 있음 ∧ 늦은 조각 > 0)와 같은 정의다. 결과는 닫는 B6 의 거래소순 자리 오름차순(「↕ 다음 역전」 이동 순서).

**4. TDD RED 스텁 커밋** — tdd.md #3770 이 import 오류를 RED 로 인정하지 않아 스텁 3개를 RED 커밋에 넣었다(GREEN 커밋이 덮어씀). RED 증거 JSON 을 phase 디렉터리에 커밋했다(분류기가 프로젝트 밖 경로를 거부).

---

**Total deviations:** 2 추가(Rule 2) · 2 해석. **Impact:** 시그니처 · 동작 계약은 플랜 그대로, 범위 확장 없음.

## Known Stubs

없음 — RED 스텁 3개는 GREEN 커밋 `0aee9b21` 에서 실구현으로 바뀌었다.

## Issues Encountered

- vitest `tap-flat` 출력에 멀티라인 diff(`Object {` …)가 섞이면 TDD 분류기가 `Non-TAP data` 로 거부한다 — 대상 테스트 한 파일만 돌린 기록으로 해결.

## Next Phase Readiness

- 웹(37-10~37-14 · 37-19)은 `buildTickIndex → recvOrderOf/exchangeOrderOf → inversePerm` 으로 표시 순열과 자리 ↔ rec 변환을, `lastB6Of + bookAt` 으로 호가 10단을, `parseTickTime + lowerBoundRecv` 로 URL `t` 점프를, `densityOf · viSpansOf` 로 슬라이더를, `lastB9Of + memberTableAt` 으로 5창구 표를 바로 쓴다.
- 주문 묶기는 순열과 별개 — `a3ColumnsOf(...).toTrades()` → `scopeTrades(…, "accum")` → `classifyKrxOrders` (NXT 는 `tagNxtRuns`).
- 한선 10/14 급(≈27만 건) 성능은 아직 측정 안 함 — 컷(1.2만 건) 4.8ms 기준 선형이면 ≈0.1s 대. 끊김이 보이면 Worker 이전(A10).

## Self-Check: PASSED

- 생성 파일 11개 존재 확인 · 커밋 `13e0a274` · `1ad587df` · `0aee9b21` HEAD 조상 확인.
