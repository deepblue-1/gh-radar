---
phase: 10-theme-classification
plan: 04
type: execute
wave: 3
depends_on: [02]
files_modified:
  - server/src/routes/themes.ts
  - server/src/schemas/themes.ts
  - server/src/mappers/theme.ts
  - server/src/lib/computeTop3.ts
  - server/src/app.ts
  - server/src/__tests__/themes.test.ts
  - server/src/__tests__/computeTop3.test.ts
autonomous: true
requirements: [THEME-02]
must_haves:
  truths:
    - "GET /api/themes 가 시스템 테마를 상위3종목 평균 등락률 내림차순으로 반환한다"
    - "GET /api/themes/:id 가 해당 테마 소속 종목 리스트(현재가/등락률 포함)를 반환한다"
    - "상위3평균은 stock_quotes 를 청크 IN 으로 조인해 server 에서 실시간 계산된다"
    - "장중/장외 모두 stock_quotes.change_rate 단일 컬럼으로 커버된다"
  artifacts:
    - path: "server/src/routes/themes.ts"
      provides: "GET /api/themes, GET /api/themes/:id"
      exports: ["themesRouter"]
    - path: "server/src/lib/computeTop3.ts"
      provides: "테마별 등락률 상위3 평균 계산 (순수 함수)"
      exports: ["computeTop3Avg"]
  key_links:
    - from: "server/src/app.ts"
      to: "themesRouter"
      via: "app.use('/api/themes', themesRouter)"
      pattern: "api/themes"
    - from: "themes.ts"
      to: "stock_quotes"
      via: "청크 IN 조인 (37afcde 교훈)"
      pattern: "stock_quotes"
---

<objective>
시스템 테마 표시용 Express 라우트를 구현한다: `GET /api/themes`(시스템 테마 목록 + 상위3종목 평균 등락률 desc 정렬) + `GET /api/themes/:id`(테마 소속 종목 리스트, scanner row 매핑). 상위3평균은 theme_stocks 전체를 읽고 stock_quotes 를 **청크 IN** 으로 조인해 server 에서 실시간 계산(scanner.ts 선례). service_role 로 시스템 테마는 RLS 우회.

Purpose: THEME-02 의 데이터 경로. D-14(상위3평균 정렬)를 RESEARCH 권장 A2(server 실시간 계산)로 구현 — 일1회 precompute 보다 신선("지금 뜨는 테마"). 컬럼 top3_avg_change_rate 는 캐시 폴백용. 유저 테마는 webapp→Supabase 직접(Plan 05)이라 이 라우트는 시스템 전용.
Output: themes 라우트 + computeTop3 + mappers/schemas + app.ts 결선.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-RESEARCH.md

<interfaces>
복제 기준:

server/src/routes/scanner.ts (top_movers codes → stock_quotes IN → 메모리 정렬 — 1:1 패턴):
- QUOTE_COLS = "code,price,change_amount,change_rate,volume,trade_amount,...,updated_at"
- supabase = req.app.locals.supabase as SupabaseClient
- .from("stock_quotes").select(QUOTE_COLS).in("code", codes)  ← codes 수천개면 청크 분할 필수(37afcde)
- ApiError(status, code, message) from ../errors.js
- res.setHeader("X-Last-Updated-At", ...) + Cache-Control no-store

server/src/app.ts 결선 패턴 (Wave 3 라인 추가):
import { themesRouter } from "./routes/themes.js";
app.use("/api/themes", themesRouter);  // scannerRouter 다음

server/src/schemas/scanner.ts (Zod 쿼리 패턴): ScannerQuery = z.object({...}).safeParse(req.query)

packages/shared theme.ts (Plan 02): Theme, ThemeWithStats, ThemeStockMember.

stock_quotes.change_rate = 장중 키움 1분 갱신값, 장 마감 후 EOD overlay 로 종가 기준 고정 → 장중/장외 단일 컬럼 커버(RESEARCH Pattern 5). stock_quotes 없는 종목은 등락률 0 또는 제외.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: computeTop3Avg 순수 함수 + 테마 mapper</name>
  <files>server/src/lib/computeTop3.ts, server/src/mappers/theme.ts, server/src/__tests__/computeTop3.test.ts</files>
  <read_first>
    - server/src/mappers/scanner.ts, stock.ts (row→camelCase 매핑 톤)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 5 (계산 로직), §Code Examples
    - packages/shared/src/theme.ts (Plan 02 타입)
  </read_first>
  <behavior>
    - computeTop3Avg([29.9, 18.4, 12.1, 5.0]) = (29.9+18.4+12.1)/3 (상위 3 desc 평균)
    - 종목 2개면 2개 평균, 0개면 null
    - 음수 등락률도 정렬 후 상위3 (예: [-2.4, -5, -8] → 상위3 평균 음수)
    - mapper: theme row + stock_quotes Map → ThemeWithStats (top3AvgChangeRate, stockCount)
  </behavior>
  <action>
    1. computeTop3.ts — export function computeTop3Avg(rates: number[]): number | null. rates desc 정렬 → slice(0,3) → 평균. 빈 배열 null.
    2. mappers/theme.ts — themeRowToThemeWithStats(themeRow, memberCodes, quoteByCode): ThemeWithStats. ThemeStockMember 매핑(code/name/market/price/changeRate/tradeAmount/source). row snake→camel.
    3. computeTop3.test.ts — 상위3 평균 / 2개 / 0개 / 음수 케이스.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/server test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/server test` exits 0 (computeTop3.test.ts green)
    - `grep -q "computeTop3Avg" server/src/lib/computeTop3.ts` exits 0
    - computeTop3.test.ts 에 상위3/2개/0개/음수 4 케이스 존재
    - mappers/theme.ts 가 ThemeWithStats 반환 (top3AvgChangeRate + stockCount)
  </acceptance_criteria>
  <done>computeTop3Avg + theme mapper 가 순수 함수 테스트 green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: themes 라우트 (목록 + 상세) + 청크 IN + app 결선</name>
  <files>server/src/routes/themes.ts, server/src/schemas/themes.ts, server/src/app.ts, server/src/__tests__/themes.test.ts</files>
  <read_first>
    - server/src/routes/scanner.ts (stock_quotes IN + 메모리 정렬 — 1:1 복제 기준)
    - server/src/routes/stocks.ts (:code 파라미터 + 중첩 라우터 패턴), server/src/app.ts (결선)
    - server/src/schemas/scanner.ts (Zod 패턴), server/src/errors.ts (ApiError)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Code Examples (청크 IN 경고)
  </read_first>
  <behavior>
    - GET /api/themes → 시스템 테마(is_system) + theme_stocks active 조회 → 종목 code → stock_quotes 청크 IN → 테마별 top3 평균 → ThemeWithStats[] top3avg desc
    - GET /api/themes/:id → 테마 소속 종목 리스트(stock_quotes 조인) ThemeStockMember[]
    - 잘못된 :id (uuid 아님) → 400, 없는 테마 → 404
    - stock_quotes codes 가 200개 초과면 청크 분할 fetch (빈 응답 회귀 방지)
  </behavior>
  <action>
    1. schemas/themes.ts — Zod: ThemeDetailParams = z.object({ id: z.string().uuid() }). (목록은 쿼리 없음 or market 옵션).
    2. routes/themes.ts — themesRouter (scanner.ts 구조 복제):
       GET "/" : supabase.from("themes").select(...).eq("is_system", true) → theme_stocks active(effective_to is null) IN(themeIds) → 종목 code 집합 → stock_quotes change_rate/price/trade_amount 를 청크(200)로 IN fetch → Map<code, quote> → 테마별 종목 등락률 배열 → computeTop3Avg → ThemeWithStats[] → top3avg desc 정렬. Cache-Control no-store.
       GET "/:id" : params 검증 → themes 단건(is_system) → theme_stocks active IN → stocks(name/market) + stock_quotes 조인(청크) → ThemeStockMember[] 반환. 없으면 404.
    3. app.ts — import themesRouter + app.use("/api/themes", themesRouter) (scannerRouter 다음 라인).
    4. themes.test.ts — supertest: 목록 정렬(top3 desc) + 청크 IN(201개 code mock) + 상세 종목 + 400/404.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/server test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/server test` exits 0 (themes.test.ts green)
    - `pnpm -F @gh-radar/server build` exits 0
    - `grep -q "api/themes" server/src/app.ts` exits 0
    - `grep -q "themesRouter" server/src/routes/themes.ts` exits 0
    - themes.ts 가 stock_quotes 를 청크(200)로 IN fetch (codes.length > 200 분할) — themes.test.ts 에 201개 code 케이스
    - themes.test.ts 에 목록 top3 desc 정렬 + 상세 404 케이스 존재
  </acceptance_criteria>
  <done>GET /api/themes(정렬) + /api/themes/:id(상세)가 청크 IN 포함 supertest green, app 결선 완료.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| webapp(client) → Express /api/themes | 미신뢰 쿼리 파라미터(:id) 경계 |
| Express(service_role) → themes/theme_stocks/stock_quotes | service_role 읽기 (시스템 테마 공개) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-04-01 | Tampering / Injection | :id 파라미터 | mitigate | Zod z.string().uuid() 검증 → PostgREST 파라미터 바인딩(SQL injection 차단, stocks.ts 선례) |
| T-10-04-02 | Information Disclosure | DB 에러 메시지 노출 | mitigate | ApiError envelope 로 generic 코드 반환, 내부 PostgREST/RLS 메시지 미노출(09.2 선례) |
| T-10-04-03 | DoS | 대량 code IN 으로 빈 응답/URL 초과 | mitigate | stock_quotes IN 청크 분할(200, 37afcde 회귀 교훈) |
| T-10-04-04 | Information Disclosure | 유저 테마가 /api/themes 에 노출 | mitigate | 라우트는 is_system=true 만 조회 — 유저 테마는 webapp→Supabase RLS 경로(Plan 05) |
</threat_model>

<verification>
- `pnpm -F @gh-radar/server test` green (computeTop3 + themes 라우트)
- `pnpm -F @gh-radar/server build` exits 0
- 청크 IN(201개 code) + top3 desc 정렬 + 400/404 케이스가 supertest 에 존재
</verification>

<success_criteria>
- SC#5 부분(server): /api/themes 목록(상위3평균 정렬) + /api/themes/:id 종목 리스트(stock_quotes 기반) 제공
- D-14 충족: 상위3종목 평균 등락률 desc 정렬 (server 실시간 청크 IN 계산)
- 장중/장외 stock_quotes.change_rate 단일 컬럼 커버
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-04-SUMMARY.md`
</output>
