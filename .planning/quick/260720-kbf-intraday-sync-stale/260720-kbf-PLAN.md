---
phase: quick-260720-kbf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/intraday-sync/src/pipeline/staleGuard.ts
  - workers/intraday-sync/src/index.ts
  - workers/intraday-sync/tests/staleGuard.test.ts
  - workers/intraday-sync/tests/runCycle.test.ts
  - tasks/lessons.md
autonomous: true
requirements: [QUICK-260720-KBF]

must_haves:
  truths:
    - "휴장일/프리마켓에 키움이 직전 거래일 snapshot 을 그대로 반환하면 cycle 이 skip 되어 stock_daily_ohlcv 에 가짜 행이 INSERT 되지 않는다"
    - "실거래일에는 stale 가드가 발동하지 않고 기존 흐름대로 기록된다"
    - "오염 3개 날짜(2026-05-25, 2026-06-03, 2026-07-17) 행이 stock_daily_ohlcv 에서 삭제되고 상한가/동조 통계가 재빌드된다"
    - "044380 종목 상세페이지에서 7/17 가짜 '상' 마커가 사라진다"
  artifacts:
    - path: "workers/intraday-sync/src/pipeline/staleGuard.ts"
      provides: "detectStaleSnapshot 순수 함수 + fetchPrevDayRows 헬퍼"
      contains: "detectStaleSnapshot"
    - path: "workers/intraday-sync/tests/staleGuard.test.ts"
      provides: "stale 판정 단위 테스트 (전체일치/부분일치/표본부족/null/epsilon)"
  key_links:
    - from: "workers/intraday-sync/src/index.ts"
      to: "workers/intraday-sync/src/pipeline/staleGuard.ts"
      via: "mapping+dedupe 직후 detectStaleSnapshot 호출 → stale 시 no-op return"
      pattern: "detectStaleSnapshot"
---

<objective>
휴장일/프리마켓에 키움 REST(ka10027)가 직전 거래일 snapshot 을 그대로 반환하면, `intraday-sync` 워커가 오늘 날짜로 스탬핑한 가짜 일봉 행을 `stock_daily_ohlcv` 에 INSERT 하는 버그를 수정한다.

현재 휴장일 가드는 "ka10027 응답 0행"뿐이라, 평일 휴장일에 키움이 전일 데이터를 반환하면 통과되어 전날 등락률(+30%)을 담은 가짜 상한가 행이 만들어진다(044380 7/17 '상' 마커 오표시의 근본 원인).

Purpose: stale 감지 heuristic 가드를 추가해 재발을 막고, 이미 발생한 오염 데이터(2026-05-25 / 06-03 / 07-17)를 삭제 후 통계를 재빌드한다. 프론트 차트 방어선은 사용자 결정으로 제외.

Output: staleGuard 모듈 + index.ts 2단 가드 + 단위/통합 테스트 + 오염 데이터 정리 + 재배포 + lessons 기록.

설계는 사용자 승인 완료(`~/.claude/plans/https-gh-radar-webapp-vercel-app-stocks-synchronous-seal.md`) — 재검토 없이 그대로 구현.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@workers/intraday-sync/src/index.ts
@workers/intraday-sync/src/pipeline/map.ts
@workers/intraday-sync/tests/runCycle.test.ts

<interfaces>
<!-- 실행자가 바로 쓸 수 있는 계약. 코드베이스 재탐색 불필요. -->

From packages/shared/src/kiwoom.ts:
```typescript
export type IntradayCloseUpdate = {
  code: string;
  date: string;
  name: string;
  price: number;              // close = cur_prc 절댓값
  changeAmount: number | null;
  changeRate: number | null;  // flu_rt (부호 유지, null 가능)
  volume: number;
  tradeAmount: number;
};
```

DB 테이블 `stock_daily_ohlcv` 관련 컬럼: `code` (text), `date` (date), `close` (numeric), `change_rate` (numeric). PK `(code, date)`.

index.ts 현재 흐름 (수정 대상, 라인 참고):
- L104: `ka10027Rows = [...upRows, ...downRows]`
- L110-116: 0행 가드 (`if (ka10027Rows.length === 0) return ...`)
- L118-122: bootstrapMissingStocks
- L124-136: mapping + dedupe → `step1Updates`
- L138 이후: market join → DB writes

배포 정보:
- Cloud Run region: `asia-northeast3`, project: `gh-radar`
- deployer SA key: `~/.config/gcloud/gh-radar-deployer.json`, env `CLOUDSDK_CORE_PROJECT=gh-radar`
- service role 자격증명: `workers/master-sync/.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- 재빌드 Job 이름: `gh-radar-limit-up-sync`, `gh-radar-comovement-sync`
- 워커 재배포: `scripts/deploy-intraday-sync.sh`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: stale 감지 가드 구현 + 2단 가드 배선 + 테스트</name>
  <files>workers/intraday-sync/src/pipeline/staleGuard.ts, workers/intraday-sync/src/index.ts, workers/intraday-sync/tests/staleGuard.test.ts, workers/intraday-sync/tests/runCycle.test.ts</files>
  <behavior>
    detectStaleSnapshot(updates, prevRows) → { stale, comparable, matched, ratio }:
    - Test 1 (전체 일치 → stale): 모든 update 가 prevRow 와 price===close AND |changeRate - change_rate| < 0.005 로 매칭, comparable ≥ 30 → stale=true
    - Test 2 (부분 일치 → 통과): 매칭 비율 < 0.8 (예: 절반만 일치) → stale=false
    - Test 3 (표본 부족 → 보류): comparable < 30 → stale=false (오탐 방지)
    - Test 4 (null 처리): update.changeRate 또는 prev.change_rate 가 null 인 쌍은 비교 대상에서 제외 (comparable 미포함)
    - Test 5 (epsilon 경계): |diff| == 0.005 는 불일치(strict <), 0.0049 는 일치
    - runCycle.test.ts: 기존 supabase mock 에 prev-day 조회 응답(불일치 데이터) 추가 → 기존 시나리오 green 유지 + "stale 응답 → step1/step2 count 0, no-op exit" 시나리오 추가
  </behavior>
  <action>
1. 신규 `workers/intraday-sync/src/pipeline/staleGuard.ts`:
   - 타입 `PrevDayRow = { code: string; close: number | null; change_rate: number | null }`
   - 순수 함수 `detectStaleSnapshot(updates: IntradayCloseUpdate[], prevRows: PrevDayRow[]): { stale: boolean; comparable: number; matched: number; ratio: number }`
     - prevRows 를 code→row Map 으로 인덱싱
     - 각 update 에 대해 대응 prevRow 조회. 비교 가능 조건: `update.price != null && update.changeRate != null && prev.close != null && prev.change_rate != null`. 이 조건 만족 시에만 comparable++
     - 매칭 조건: `update.price === prev.close && Math.abs(update.changeRate - prev.change_rate) < 0.005` → matched++
     - `ratio = comparable > 0 ? matched / comparable : 0`
     - `stale = comparable >= 30 && ratio >= 0.8`
     - 상수 `MIN_COMPARABLE = 30`, `MATCH_RATIO_THRESHOLD = 0.8`, `RATE_EPSILON = 0.005` 를 모듈 상단에 명명 상수로.
   - fetch 헬퍼 `fetchPrevDayRows(supabase, sampleCodes, todayIso): Promise<PrevDayRow[]>`
     - sampleCodes 최대 100개(caller 가 slice 하거나 여기서 slice — 여기서 `sampleCodes.slice(0, 100)`)
     - `.from('stock_daily_ohlcv').select('code, close, change_rate').in('code', sample).lt('date', todayIso).gte('date', tenDaysBefore).order('date', { ascending: false })`
     - tenDaysBefore = todayIso 에서 10일 뺀 ISO date 문자열(간단한 Date 산술, KST 무관 — 단순 하한)
     - JS 에서 code 별 최신 행만 채택(order desc 이므로 code 첫 등장이 최신): Map 으로 code 첫 값만 취함
     - error 는 throw (조용한 빈 결과 금지 — 빈 결과면 comparable=0 으로 가드가 무력화되므로 fail-fast)
   - 헬퍼 `sampleCodes(updates): string[]` (또는 index.ts 에서 인라인) — step1Updates 에서 code 추출 후 최대 100개.

2. `workers/intraday-sync/src/index.ts` 순서 재배치:
   - 현재 L124-136 의 mapping+dedupe 블록을 0행 가드(L110-116) 직후로 유지(이미 그 위치이나 stale 가드를 그 뒤에 삽입) — 실제로는 bootstrap 을 mapping 뒤로 이동해도 되고, 승인 계획은 "mapping+dedupe → stale 가드 → bootstrap" 순서. 안전하게: 0행 가드 → mapping+dedupe(step1Updates 산출) → **stale 가드** → bootstrap → 이후 기존 흐름.
   - stale 가드 삽입: 
     ```ts
     const sample = step1Updates.map((u) => u.code).slice(0, 100);
     const prevRows = await withRetry(
       () => fetchPrevDayRows(supabase, sample, dateIso),
       "fetchPrevDayRows",
     );
     const staleResult = detectStaleSnapshot(step1Updates, prevRows);
     if (staleResult.stale) {
       log.warn(
         { comparable: staleResult.comparable, matched: staleResult.matched, ratio: staleResult.ratio },
         "stale snapshot 감지 — 휴장일/프리마켓, cycle skip",
       );
       return { step1Count: 0, step2Count: 0, failed: 0 };
     }
     ```
   - bootstrapMissingStocks 는 stale 가드 통과 후 호출(가짜 데이터로 stocks 부트스트랩 방지).
   - 주석 갱신: L62-64 및 L110-116 의 휴장일 가드 설명을 "2단 가드: (1) ka10027 0행 (2) stale snapshot 감지(직전 거래일 저장 데이터와 내용 비교)"로 갱신.
   - import 추가: `import { detectStaleSnapshot, fetchPrevDayRows } from "./pipeline/staleGuard";`

3. 신규 `workers/intraday-sync/tests/staleGuard.test.ts`: behavior 의 Test 1-5 를 vitest 로 작성. detectStaleSnapshot 순수 함수만 대상(supabase mock 불필요).

4. `workers/intraday-sync/tests/runCycle.test.ts` 갱신:
   - `supabaseStub()` 의 `from()` 체인을 확장해 `stock_daily_ohlcv` 의 prev-day 조회(`select().in().lt().gte().order()`)에 응답 가능하도록. stocks 마스터 조회(기존)와 공존. 반환은 불일치 데이터(빈 배열 또는 값 다른 행) → 기존 시나리오에서 stale=false 유지(기존 테스트 green).
   - 신규 시나리오 추가: prev-day 조회가 step1Updates 와 동일한 close/change_rate 를 ≥30건 반환하도록 mock → `detectStaleSnapshot` stale=true → `runIntradayCycle()` 이 `{ step1Count: 0, step2Count: 0, failed: 0 }` 반환 + DB write 미호출 검증.
  </action>
  <verify>
    <automated>cd workers/intraday-sync && pnpm vitest run tests/staleGuard.test.ts tests/runCycle.test.ts && pnpm tsc --noEmit</automated>
  </verify>
  <done>staleGuard.test.ts 5 케이스 + runCycle.test.ts(기존 + stale 신규) 전부 green. tsc 통과. index.ts 가 mapping+dedupe 후 stale 가드를 거쳐 stale 시 no-op return.</done>
</task>

<task type="auto">
  <name>Task 2: 오염 데이터 삭제 + 통계 재빌드 + 검증 (운영 작업)</name>
  <files>(코드 커밋 없음 — 운영 스크립트/명령만)</files>
  <action>
CLAUDE.md 커밋 규칙 및 기존 credentials 재요청 금지 원칙 준수. 자격증명은 `workers/master-sync/.env` 와 `~/.config/gcloud/gh-radar-deployer.json` 를 먼저 사용(사용자에게 재요청 금지).

1. 삭제 전 현황 기록: `stock_daily_ohlcv` 에서 `date IN ('2026-05-25','2026-06-03','2026-07-17')` 행 수 조회(예상 5,25=3171 / 6,3=1322 / 7,17=3706). 044380 의 2026-07-17 행 존재 확인.
   - Supabase REST 또는 service-role JS 스크립트(scratchpad 에 임시 작성) 사용. env 는 `workers/master-sync/.env` 의 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

2. 삭제: `stock_daily_ohlcv` 에서 `.in('date', ['2026-05-25','2026-06-03','2026-07-17']).delete()` (또는 동등 SQL DELETE). 휴장일이라 정상 데이터 없음 — 전량 가짜.

3. 재빌드 (둘 다 TRUNCATE+INSERT full-rebuild 라 멱등):
   - `CLOUDSDK_CORE_PROJECT=gh-radar GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json gcloud run jobs execute gh-radar-limit-up-sync --region asia-northeast3 --wait`
   - `... gcloud run jobs execute gh-radar-comovement-sync --region asia-northeast3 --wait`
   - Job 실행이 여의치 않으면 각 워커가 사용하는 rebuild RPC 를 직접 호출(lookback 기본값 사용).

4. 검증:
   - 3개 날짜 행 수 0 재조회 확인.
   - 044380 의 2026-07-17 행 소멸 확인.
   - `limit_up_events`(또는 통계 테이블)에서 044380 7/16 상한가 이벤트의 next-day 통계가 7/17(가짜) 대신 실제 다음 거래일 기준으로 복구됐는지 조회.
  </action>
  <verify>
    <automated>node scratchpad/verify-cleanup.mjs</automated>
  </verify>
  <done>3개 날짜(2026-05-25/06-03/07-17) 행 수 0. 044380 7/17 행 소멸. limit-up-sync + comovement-sync 재빌드 완료(exit 0). 통계가 실제 거래일 기준으로 복구됨.</done>
</task>

<task type="auto">
  <name>Task 3: 워커 재배포 + lessons 기록</name>
  <files>tasks/lessons.md</files>
  <action>
1. 워커 재배포(스케줄 변경 없음, 이미지 갱신만):
   - `CLOUDSDK_CORE_PROJECT=gh-radar GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json bash scripts/deploy-intraday-sync.sh`
   - 배포 후 revision/이미지 태그 기록. Scheduler cron(`* 9-15 * * 1-5` Asia/Seoul)는 불변 확인.

2. `tasks/lessons.md` 에 패턴 기록(파일 없으면 생성):
   - 제목: "외부 API stale 응답은 0행 가드로 못 잡는다"
   - 내용: 키움 ka10027 이 휴장일/프리마켓에 직전 거래일 snapshot 을 그대로 반환 → "응답 0행" 가드 통과 → 오늘 날짜로 가짜 상한가 행 INSERT. 해결: 저장된 직전 거래일 데이터(close, change_rate)와 내용 비교(comparable ≥ 30 AND 일치율 ≥ 0.8)로 stale 판정 후 skip. 덤: 프리마켓 08:00-09:00 stale 오염도 동일 가드로 차단.

3. 프로드 검증(간접): 재배포 후 다음 장중 cycle 로그에서 실거래일 정상 기록(가드 미발동) + 장 시작 전(08시대) stale skip warn 관찰 가능 여부를 후속 관찰 항목으로 SUMMARY 에 남김. https://gh-radar-webapp.vercel.app/stocks/044380 에서 7/17 '상' 소멸 확인.
  </action>
  <verify>
    <automated>test -f tasks/lessons.md && grep -q "stale" tasks/lessons.md && echo OK</automated>
  </verify>
  <done>intraday-sync 재배포 완료(새 revision), Scheduler 불변. tasks/lessons.md 에 stale 가드 패턴 기록. 044380 웹앱 7/17 '상' 소멸 확인.</done>
</task>

</tasks>

<verification>
1. 단위/통합: `cd workers/intraday-sync && pnpm vitest run` — staleGuard + runCycle 전체 green, tsc 통과.
2. 데이터 정리: 3개 날짜 행 0 + 044380 7/17 소멸 + 통계 복구.
3. 프로드: 재배포 후 실거래일 정상 기록(가드 미발동), 웹앱 044380 '상' 소멸.
4. 가드 실증(간접): 장 시작 전 cycle 로그에서 stale skip warn 관찰.
</verification>

<success_criteria>
- detectStaleSnapshot 순수 함수 + fetchPrevDayRows 헬퍼가 존재하고 테스트로 검증됨
- index.ts 가 2단 가드(0행 + stale)로 동작하며 stale 시 어떤 테이블에도 기록하지 않음
- 오염 3개 날짜 행 삭제 + limit-up/comovement 재빌드 완료
- 044380 7/17 가짜 '상' 마커 소멸
- intraday-sync 재배포 + lessons.md 기록 완료
</success_criteria>

<output>
After completion, create `.planning/quick/260720-kbf-intraday-sync-stale/260720-kbf-SUMMARY.md`
</output>
