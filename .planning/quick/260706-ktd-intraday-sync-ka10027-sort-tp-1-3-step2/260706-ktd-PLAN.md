---
phase: quick-260706-ktd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/intraday-sync/src/kiwoom/fetchRanking.ts
  - workers/intraday-sync/src/index.ts
  - workers/intraday-sync/tests/fetchRanking.test.ts
  - workers/intraday-sync/tests/runCycle.test.ts
autonomous: true
requirements: [INTRADAY-DOWN-FIX]
must_haves:
  truths:
    - "fetchKa10027 이 sortTp 파라미터를 받아 상승(1)/하락(3) 순위를 모두 조회할 수 있다"
    - "runIntradayCycle 이 sort_tp=1 + sort_tp=3 두 번 호출 후 병합하여 하락 종목도 STEP1 upsert(stock_daily_ohlcv/stock_quotes) 대상에 포함한다"
    - "STEP2 step1Codes intersect 필터가 제거되어 watchlist 정확 OHLC 가 stock_daily_ohlcv 에 반영된다"
    - "휴장일 가드는 병합(merged) 결과 length===0 기준으로 유지된다"
    - "workers/intraday-sync 전체 vitest 가 회귀 없이 통과한다"
  artifacts:
    - path: "workers/intraday-sync/src/kiwoom/fetchRanking.ts"
      provides: "sortTp 파라미터화된 fetchKa10027 (하드코딩 sort_tp 제거)"
      contains: "sortTp"
    - path: "workers/intraday-sync/src/index.ts"
      provides: "sort_tp 1+3 병합 STEP1 + step1Codes 필터 제거된 STEP2"
      contains: "sort_tp"
  key_links:
    - from: "workers/intraday-sync/src/index.ts"
      to: "fetchKa10027(sortTp)"
      via: "sort_tp=1 + sort_tp=3 두 번 호출 후 concat"
      pattern: "fetchKa10027\\("
    - from: "workers/intraday-sync/src/index.ts"
      to: "intradayUpsertOhlc / upsertQuotesStep2"
      via: "step2UpdatesRaw 를 필터 없이 직접 전달"
      pattern: "step2UpdatesRaw"
---

<objective>
intraday-sync 가 하락 전환 종목의 일봉(stock_daily_ohlcv)을 매분 갱신하지 못하는 구조적 버그를 수정한다.

증상: 삼성전기(009150)·SK하이닉스(000660) 등 하락 종목의 7/6 일봉 캔들이 장 시작 직후 값(09:00:34)에 동결. 헤더 가격은 on-demand ka10001 로 최신이나 일봉은 EOD candle-sync(17:30)까지 정지.

근본 원인 2가지:
1. STEP1 소스(ka10027)가 `sort_tp="1"` 하드코딩 → 상승+보합만 커버. 하락 전환 종목은 응답에서 사라져 일봉 갱신 중단.
2. STEP2 `step1Codes` intersect 필터가 watchlist 종목의 정확 OHLC(intradayUpsertOhlc)까지 걸러냄. 이 필터의 원 도입 사유(upsertQuotesStep2 INSERT 시 NOT NULL violation)는 STEP2 가 UPSERT→UPDATE 로 전환되며 이미 소멸.

Purpose: 하락 종목 일봉 동결 해소 + 부수 효과로 하락 종목 stock_quotes 도 매분 갱신.
Output: fetchRanking.ts(sortTp 파라미터화) + index.ts(1+3 병합, step1Codes 필터 제거) + 테스트 갱신.

승인된 진단/계획: `/Users/alex/.claude/plans/7-foamy-eagle.md` (재설계 금지, 그대로 태스크화).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260706-ktd-intraday-sync-ka10027-sort-tp-1-3-step2/../../../../CLAUDE.md

<interfaces>
<!-- 현재 코드 계약 — 탐색 불필요. 아래 시그니처/구조 그대로 수정한다. -->

현재 fetchRanking.ts (수정 대상):
```typescript
// body 에 sort_tp: "1" 하드코딩 (L38), 페이지네이션 loop 는 sort_tp 를 body 로만 사용.
export async function fetchKa10027(
  client: AxiosInstance,
  token: string,
  hardCap = 5000,
): Promise<KiwoomKa10027Row[]>
```

현재 index.ts runIntradayCycle STEP1 fetch (L90-104):
```typescript
const ka10027Rows = await withRetry(
  () => fetchKa10027(kiwoom, token.accessToken, config.paginationHardCap),
  "fetchKa10027",
);
log.info({ rows: ka10027Rows.length }, "STEP1 ka10027 fetched");
if (ka10027Rows.length === 0) {
  log.warn("ka10027 0 rows — 휴장일 또는 키움 미응답");
  return { step1Count: 0, step2Count: 0, failed: 0 };
}
```
이후 `ka10027Rows` 를 dedupeMap(Map by code, "마지막 승")으로 중복 제거 → step1Updates.

현재 index.ts STEP2 필터 (L213-226, 제거 대상):
```typescript
const step1Codes = new Set(step1Updates.map((u) => u.code));
const step2Updates = step2UpdatesRaw.filter((u) => step1Codes.has(u.code));
const droppedFromStep2 = step2UpdatesRaw.length - step2Updates.length;
if (droppedFromStep2 > 0) {
  log.info({ dropped: droppedFromStep2 }, "STEP2 dropped non-STEP1 codes ...");
}
// 이후 step2Updates 를 intradayUpsertOhlc / upsertQuotesStep2 에 전달 (L229-236)
```

안전 근거 (확인 완료):
- `intraday_upsert_ohlc` RPC(intradayUpsertOhlc): INSERT 폴백 분기 보유 → 없는 종목도 안전(close=open/volume=0, STEP1 이 즉시 보정).
- `upsertQuotesStep2` (upsertQuotes.ts:62-90): UPSERT→UPDATE 로 전환됨 → 없는 row 에 no-op. NOT NULL violation 위험 소멸.

하위 파이프라인 자연 호환 (변경 불요): rebuildTopMovers(changeRate>0 필터로 하락 종목 스캐너 미유입), computeHotSet(changeRate desc top100 → 하락 후순위), fetchStocksMasterChunked(수천 행 대응 완료).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: fetchKa10027 에 sortTp 파라미터 추가 (하드코딩 제거)</name>
  <files>workers/intraday-sync/src/kiwoom/fetchRanking.ts, workers/intraday-sync/tests/fetchRanking.test.ts</files>
  <behavior>
    - sortTp 미지정 시 기본값 "1" → body.sort_tp === "1" (기존 호출 하위호환)
    - sortTp="3" 전달 시 → body.sort_tp === "3"
    - 기존 페이지네이션/에러 분류/hardCap 동작 불변
  </behavior>
  <action>
fetchRanking.ts:
- `fetchKa10027` 시그니처를 `(client, token, sortTp = "1", hardCap = 5000)` 로 변경. sortTp 는 config 성격 파라미터라 안전 cap(hardCap) 앞에 배치.
- body 의 `sort_tp: "1"` 하드코딩(L38)을 `sort_tp: sortTp` 로 교체.
- L12-19, L36-37 의 낡은 주석(sort_tp=1 고정 정당화, "3 은 하락만 반환 → 스캐너 빈 화면")을 갱신: sort_tp 는 이제 caller 가 지정(1=상승+보합, 3=하락+보합), STEP1 이 index.ts 에서 1+3 병합 호출한다는 취지로 정정. probe 의미 주석(1/3/4)은 유지.

tests/fetchRanking.test.ts:
- hardCap 테스트(L109-115) 호출을 `fetchKa10027(client, "TOKEN", 2)` → `fetchKa10027(client, "TOKEN", "1", 2)` 로 수정 (hardCap 이 4번째 인자로 밀림).
- "회귀 가드 — sort_tp 는 반드시 '1'" 테스트(L56-68)를 갱신: 기본값 검증("sortTp 미지정 시 body.sort_tp === '1'")으로 프레이밍 변경하고, `.not.toBe("3")` 단정은 제거(이제 3 은 정당한 하락 조회값).
- 신규 테스트 추가: `fetchKa10027(client, "TOKEN", "3")` 호출 시 `client.post` body 의 `sort_tp === "3"` 검증.
- 나머지 body 검증 테스트(L33-54)의 sort_tp="1" 단정은 기본값이라 유지.
  </action>
  <verify>
    <automated>cd workers/intraday-sync && npx vitest run tests/fetchRanking.test.ts</automated>
  </verify>
  <done>sortTp 파라미터 존재, 기본값 "1" 하위호환, sortTp="3" 시 body.sort_tp="3", fetchRanking.test.ts green</done>
</task>

<task type="auto">
  <name>Task 2: runIntradayCycle — sort_tp 1+3 병합 + STEP2 step1Codes 필터 제거</name>
  <files>workers/intraday-sync/src/index.ts</files>
  <action>
STEP1 fetch (L90-104):
- 단일 `fetchKa10027` 호출을 두 번 호출로 교체:
  - `sort_tp=1`(상승+보합): `fetchKa10027(kiwoom, token.accessToken, "1", config.paginationHardCap)`
  - `sort_tp=3`(하락+보합): `fetchKa10027(kiwoom, token.accessToken, "3", config.paginationHardCap)`
  - 둘 다 `withRetry` 로 감싸고, 결과를 `const ka10027Rows = [...upRows, ...downRows]` 로 concat.
- concat 후 기존 dedupeMap(Map by code, "마지막 row 승")이 보합 중복(1/3 응답 양쪽에 등장하는 flat 종목)을 자연 제거 — 동일값이라 무해.
- 로그: `log.info({ upRows: upRows.length, downRows: downRows.length, rows: ka10027Rows.length }, "STEP1 ka10027 fetched (sort_tp 1+3 merged)")`.
- 휴장일 가드는 병합 `ka10027Rows.length === 0` 기준 그대로 유지.
- 주석(L98-100)의 "sort_tp=1 의 상승 종목 수" 문구를 "sort_tp 1+3 병합 종목 수" 로 정정.

STEP2 필터 제거 (L213-226):
- `step1Codes` Set 생성, `step2Updates = step2UpdatesRaw.filter(...)`, `droppedFromStep2` 계산 및 dropped 로그 블록 전체 삭제.
- L229-236 의 `intradayUpsertOhlc(supabase, step2Updates)` / `upsertQuotesStep2(supabase, step2Updates)` 인자를 `step2UpdatesRaw` 로 교체.
- 최종 반환/로그의 `step2Count: step2Updates.length` 를 `step2Count: step2UpdatesRaw.length` 로 교체(L238-243).
- 낡은 주석(L213-217, "STEP1 처리 종목만 STEP2 UPSERT 대상 ... intersect 하여 안전")을 제거하고, 필터 제거 근거(intraday_upsert_ohlc INSERT 폴백 + upsertQuotesStep2 UPDATE no-op)를 짧게 대체 주석으로 명시.
  </action>
  <verify>
    <automated>cd workers/intraday-sync && npx tsc --noEmit</automated>
  </verify>
  <done>fetchKa10027 이 sort_tp 1/3 두 번 호출 후 병합, step1Codes 필터/dropped 로그 삭제, step2UpdatesRaw 직접 전달, typecheck exit 0</done>
</task>

<task type="auto">
  <name>Task 3: runCycle 테스트 갱신 + 전체 vitest 회귀</name>
  <files>workers/intraday-sync/tests/runCycle.test.ts</files>
  <action>
tests/runCycle.test.ts:
- 기존 "ka10027 0 row → 가드" 테스트: `fetchKa10027` mock 이 `.mockResolvedValue([])` 라 1+3 두 호출 모두 [] 반환 → 병합 [] → guard 통과. 그대로 유지하되, 이제 두 번 호출됨을 반영하도록 mock 을 `vi.fn().mockResolvedValue([])` 유지(둘 다 [] 반환) 확인.
- 신규 테스트 추가 — sort_tp 병합 검증: `fetchKa10027` mock 을 첫 호출(sort_tp=1)엔 상승 종목 row, 둘째 호출(sort_tp=3)엔 하락 종목 row(예: 삼성전기 009150 하락) 반환하도록 `mockResolvedValueOnce` 2회 설정. runIntradayCycle 실행 후 `fetchKa10027` 이 2회 호출되고 세 번째 인자가 각각 "1","3" 인지(`.mock.calls[0][2] === "1"`, `[1][2] === "3"`) 검증. 하위 DB 파이프라인(bootstrap/upsert/topMovers/computeHotSet/fetchHotSet 등)은 기존 0-row 테스트 패턴대로 `vi.doMock` 스텁 처리하여 하락 종목이 step1Updates 에 포함되는지(intradayUpsertClose 스텁 인자에 009150 존재) 검증.
- STEP2 필터 제거 검증: computeHotSet 이 STEP1 미포함 watchlist 종목을 반환하도록 스텁하고, fetchKa10001ForHotSet 이 해당 종목 OHLC 를 반환하게 한 뒤, `intradayUpsertOhlc` 스텁이 그 종목을 포함한 채(필터되지 않고) 호출되는지 검증.
  (스텁 복잡도가 과하면, 최소한 "fetchKa10027 2회 호출 + sortTp 인자 1/3" 검증 테스트만 추가하고 STEP2 필터 제거는 typecheck + 전체 회귀로 커버.)

마지막: workers/intraday-sync 전체 vitest 회귀 실행하여 기존 15개 테스트 파일 모두 green 확인.
  </action>
  <verify>
    <automated>cd workers/intraday-sync && npx vitest run</automated>
  </verify>
  <done>runCycle 병합/필터 제거 테스트 추가, workers/intraday-sync 전체 vitest green (회귀 0)</done>
</task>

</tasks>

<verification>
1. `cd workers/intraday-sync && npx vitest run` — 전체 green
2. `cd workers/intraday-sync && npx tsc --noEmit` — exit 0
3. 코드 리뷰: fetchRanking.ts 에 `sort_tp: "1"` 하드코딩 잔존 없음(`grep -n 'sort_tp: "1"' src/kiwoom/fetchRanking.ts` → 매치 없음), index.ts 에 `step1Codes`/`droppedFromStep2` 잔존 없음
</verification>

<success_criteria>
- fetchKa10027 이 sortTp 파라미터화(기본 "1"), body 하드코딩 제거
- runIntradayCycle 이 sort_tp=1 + sort_tp=3 병합 호출, 하락 종목이 STEP1 upsert 대상에 포함
- STEP2 step1Codes intersect 필터 완전 제거, step2UpdatesRaw 직접 전달
- 휴장일 가드 병합 기준 length===0 유지
- 전체 vitest 회귀 통과 + typecheck exit 0
</success_criteria>

<risk_notes>
- ka10027 페이지 호출 ~2배(약 18→31 페이지, 공유 rate limiter 5/sec 기준 사이클 +3~4초). 현재 ~30초 → 1분 주기 여유. 배포 후 STEP2 간헐 429(failureGroups) 빈도 모니터링 필요.
- sort_tp=3 의미(하락+보합)는 probe 주석 기반 — 배포 전 스모크(`scripts/smoke-intraday-sync.sh`)에서 실응답으로 재확인(STEP1 rows ~3,000+, mapErrors 급증 없음).
- 배포는 GSD `/gsd-quick` 플로우에서 `scripts/deploy-intraday-sync.sh` (cron 8-15시 설정 그대로).
</risk_notes>

<output>
After completion, create `.planning/quick/260706-ktd-intraday-sync-ka10027-sort-tp-1-3-step2/260706-ktd-SUMMARY.md`
</output>
