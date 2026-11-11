# Phase 41: 한투 뉴스·공시 피드 - Pattern Map

**Mapped:** 2026-11-11
**Files analyzed:** 27 (신규 약 20 · 수정 약 7)
**Analogs found:** 25 / 27

모든 analog 경로는 `git ls-files` 로 추적 소스임을 확인했다(dist/ 사본 제외 — 예: `server/dist/kiwoom/tokenStore.js` 는 쓰지 않는다).

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `workers/kis-news-sync/src/index.ts` | worker entry | batch/long-loop | `workers/news-sync/src/index.ts` | role-match (1회 실행 → 장기 루프로 확장) |
| `workers/kis-news-sync/src/config.ts` · `logger.ts` · `services/supabase.ts` · `Dockerfile` · `package.json` | config | - | `workers/news-sync/src/{config,logger}.ts` · `workers/news-sync/Dockerfile` · `package.json` | exact |
| `workers/kis-news-sync/src/kis/client.ts` | client | request-response | `workers/intraday-sync/src/kiwoom/client.ts` | exact |
| `workers/kis-news-sync/src/kis/token.ts` | service | CRUD(토큰 캐시) | `workers/intraday-sync/src/kiwoom/tokenStore.ts` | exact |
| `workers/kis-news-sync/src/kis/newsTitle.ts` | service | request-response(페이징) | `workers/news-sync/src/naver/collectStockNews.ts` | role-match |
| `workers/kis-news-sync/src/pipeline/cadence.ts` | utility(순수) | transform | `workers/news-sync/src/pipeline/cadence.ts` | exact |
| `workers/kis-news-sync/src/pipeline/scheduler.ts` | utility(순수) | event-driven | `workers/intraday-sync/src/kiwoom/rateLimiter.ts` | role-match(토큰 버킷) |
| `workers/kis-news-sync/src/pipeline/classify.ts` | utility(순수) | transform | `workers/home-sync/src/pipeline/loadSurges.ts` L103-128 `isExcludedProduct` | partial |
| `workers/kis-news-sync/src/pipeline/ingest.ts` | service | CRUD(RPC) | `workers/news-sync/src/apiUsage.ts` `incrementUsage`(rpc 호출 꼴) · `pipeline/upsert.ts` | role-match |
| `workers/kis-news-sync/src/pipeline/targets.ts` (대상 적재) | service | CRUD read | `workers/news-sync/src/pipeline/targets.ts` | exact |
| `workers/kis-news-sync/src/apiUsage.ts` | service | CRUD | `workers/news-sync/src/apiUsage.ts` | exact(사본, SERVICE 만 변경) |
| `workers/kis-news-sync/src/retention.ts` | service | batch | `workers/news-sync/src/retention.ts` | exact |
| `packages/shared/src/stock-feed.ts` (+ `index.ts` export) | utility/model | transform | `packages/shared/src/stockCode.ts` · `home.ts` | role-match |
| `packages/shared/src/home.ts` (HomeNewsRef 확장) | model | - | 자기 자신 L21-28 | 수정 |
| `supabase/migrations/2026111x_kis_news_tables.sql` | migration | - | `supabase/migrations/20261020200000_limitup_accum_flow.sql` L37-39 · L118-121 | exact |
| `supabase/migrations/2026111x_kis_news_rpcs.sql` | migration(RPC) | CRUD | 같은 파일 L129-140 · L276-278 · L331-333 | exact |
| `supabase/tests/kis_news.test.sql` | test(pgTAP) | - | `supabase/tests/teamflow_report.test.sql` | exact |
| `server/src/routes/news-by-stock.ts` | route | request-response | `server/src/routes/themes.ts` L157-298 · L299-322 | exact |
| `server/src/schemas/news-by-stock.ts` | schema | validation | `server/src/schemas/themes.ts` L22-31 + `schemas/news.ts` L16-40 | exact |
| `server/src/middleware/rate-limit.ts` (skip + 전용 제한기) | middleware | request-response | 자기 자신 | 수정 |
| `server/src/app.ts` (라우터 결선) | config | - | 자기 자신 L126-140 | 수정 |
| `server/src/routes/news.ts` (GET · refresh 를 RPC + merge 로) | route | request-response | 자기 자신 L95-120 + themes.ts RPC 호출 | 수정 |
| `scripts/deploy-kis-news-sync.sh` · `setup-kis-news-sync-iam.sh` · `smoke-kis-news-sync.sh` | config/ops | - | `scripts/deploy-news-sync.sh` · `setup-news-sync-iam.sh` · `smoke-news-sync.sh` | exact |
| `scripts/kis-disclosure-kinds.sql` | ops 쿼리 | - | 없음 | no-analog |
| `workers/home-sync/src/pipeline/loadSurges.ts` (3단계 RPC 교체) · `src/ai/clusterSurges.ts` (dedupe 키 · 프롬프트) | service | batch | 자기 자신 L225-250 · clusterSurges L66-85 | 수정 |
| `webapp/src/components/stock/news-item.tsx` (배지 · url null) | component | - | 자기 자신 | 수정 |
| `webapp/src/components/home/news-block.tsx` (dedupe 키) | component | - | 자기 자신 L25-43 | 수정 |
| `webapp/src/components/trading/workbench/breakout-strip.tsx` · `trading/card/*` (배지 · 띠) | component | polling | 자기 자신 | 수정 |
| gh-trade 계약 노트 | docs | - | `scripts/trade-handoff.sh` | exact |

## Pattern Assignments

### `workers/kis-news-sync/src/index.ts` (worker entry)
**Analog:** `workers/news-sync/src/index.ts` L1-80

- 임포트 꼴: `loadConfig` → `createLogger(cfg.logLevel).child({ app, version: cfg.appVersion })` → `createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey)`.
- `now` 를 실행 시작에 1회 캡처하고 `kstDateString(now)` 로 KST 날짜 키를 만든다(L72-74 주석 「run 시작 시각을 1회만 캡처」).
- 상단 JSDoc 에 Flow 번호 목록(1 ~ 7)을 적는 관례 — 새 파일도 임대 → 토큰 → 모드 → 루프 순서를 같은 형식으로 적는다.
```ts
const cfg = loadConfig();
const log = createLogger(cfg.logLevel).child({ app: "news-sync", version: cfg.appVersion });
const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
const now = new Date();
const dateKst = kstDateString(now);
```
- 차이: news-sync 는 1회 실행. 새 워커는 `kis_news_state` 임대 RPC 실패 시 즉시 0 종료, 성공 시 20:00 까지 루프 + 30초 임대 연장(RESEARCH Pattern 1).

### `workers/kis-news-sync/src/kis/client.ts`
**Analog:** `workers/intraday-sync/src/kiwoom/client.ts` (전체 16줄)
```ts
export function createKiwoomClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}
```
Bearer 는 client 에 넣지 않고 호출마다 헤더로(토큰 동적). 한투는 `appkey`·`appsecret`·`tr_id`(`FHKST01011800`)·`custtype` 헤더 추가, `rt_cd`/`msg_cd`/`msg1` 판정과 오류 클래스는 여기서.

### `workers/kis-news-sync/src/kis/token.ts`
**Analog:** `workers/intraday-sync/src/kiwoom/tokenStore.ts`
- 흐름(L25-87): `from("kiwoom_tokens").select("access_token, expires_at").eq("token_type", …).maybeSingle()` → 남은 시간이 임계 초과면 재사용 → 아니면 발급 POST → `upsert({...}, { onConflict: "token_type" })`, upsert 실패는 warn 후 진행.
```ts
if (cached) {
  const expiresAt = new Date(cached.expires_at);
  const remainMs = expiresAt.getTime() - Date.now();
  if (remainMs > TOKEN_REFRESH_THRESHOLD_MS) { ... return { accessToken: cached.access_token, expiresAt }; }
}
```
- 바꿀 점: 테이블 `kis_access_tokens`, 임계 5분 → **1시간**, 발급은 임대 보유 실행만 + 1분 1회 가드(알림톡 폭탄 방지), 만료 파싱은 `parseKiwoomExpiresDt`(L93-103) 꼴로 한투 `access_token_token_expired` 형식에 맞춰.

### `workers/kis-news-sync/src/pipeline/cadence.ts`
**Analog:** `workers/news-sync/src/pipeline/cadence.ts`
- `KST_OFFSET_MS` + `kstShifted()` + `getUTC*` 로만 시각 계산(L42-57), 창 경계는 「KST 자정 이후 분」 상수(`MARKET_WINDOW_START_MIN = 480`), `resolveRunMode(now, setting)` 의 `auto | 강제` 설정 꼴(L64-72) 그대로. 순수 함수만(I/O 금지) — 파일 상단 주석 관례 유지.

### `workers/kis-news-sync/src/pipeline/scheduler.ts`
**Analog:** `workers/intraday-sync/src/kiwoom/rateLimiter.ts`
- `Bucket { available, lastRefill, capacity, refillRate }` + `configure…RateLimiter({capacity, refillRatePerSec})`. 새 파일은 모듈 전역 대신 **시계 주입 클래스**(테스트 가능)로, 실측 근거를 상단 주석에 남기는 관례만 따른다.

### `workers/kis-news-sync/src/pipeline/classify.ts`
**Analog:** `workers/home-sync/src/pipeline/loadSurges.ts` L103-128
```ts
const EXCLUDED_SECURITY_GROUPS = new Set(["ETF", "ETN", "ELW"]);
const EXCLUDED_NAME_PATTERN = /ETN|ETF|ELW|인버스|레버리지/i;
export function isExcludedProduct(name, securityGroup): boolean { ... }
```
RESEARCH 권고대로 이 함수를 `packages/shared` 로 옮겨 home-sync 와 공유하거나 상수를 공유한다. 스팩은 넣지 않는다(원 주석 「'스팩' 은 이번 범위 아님」).

### `workers/kis-news-sync/src/apiUsage.ts`
**Analog:** `workers/news-sync/src/apiUsage.ts` — 통째 사본. `SERVICE = "kis_news_title"`, `QUOTA_STRIKE_SERVICE = "kis_news_title_quota_strike"` 만 바꾼다. `kstDateString` · `checkBudget` · `incrementUsage`(rpc `incr_api_usage` `{p_service, p_date, p_amount}`) 시그니처 그대로. 루프에서 10초 배치로 `amount` 를 모아 넘긴다.

### `workers/kis-news-sync/src/retention.ts`
**Analog:** `workers/news-sync/src/retention.ts`
```ts
const threshold = new Date(Date.now() - days * 86400 * 1000).toISOString();
const { count, error } = await supabase.from("news_articles").delete({ count: "exact" }).lt("created_at", threshold);
if (error) throw error;
return count ?? 0;
```
테이블 `kis_news`, 열 `written_at`(cascade 로 `kis_news_stocks` 정리) + `kis_news_targets` 1일 지난 행 정리. service_role 필수 주석 유지.

### `supabase/migrations/2026111x_kis_news_tables.sql`
**Analog:** `supabase/migrations/20261020200000_limitup_accum_flow.sql`
- 상단 주석에 권한 정책 서술(L37-39 「표는 서비스롤 전용 … auto-grant 가 REVOKE FROM PUBLIC 을 덮는다」).
```sql
ALTER TABLE public.limitup_accum_flow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_accum_flow FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_accum_flow FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_accum_flow TO service_role;
```
다섯 표(`kis_news` · `kis_news_stocks` · `kis_news_targets` · `kis_news_state` · `kis_access_tokens`) 모두 이 4줄. 웹은 Express 경유만 읽으므로 `TO anon, authenticated` 정책은 만들지 않는다.

### `supabase/migrations/2026111x_kis_news_rpcs.sql`
**Analog:** 같은 파일 L129-140 · L276-278
```sql
CREATE OR REPLACE FUNCTION public.limitup_commit_day(...)
...
SECURITY INVOKER
SET search_path = public, pg_temp
...
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) TO service_role;
```
`kis_news_ingest(jsonb, text, text)` · `stock_feed_by_codes(text[], timestamptz, int, boolean)` · 임대 RPC 에 같은 3줄. L25 Pitfall 2(「CREATE OR REPLACE 는 명시 안 한 속성을 기본값으로 되돌린다」) 주의 — 재정의 시 VOLATILE/search_path 재진술.

### `supabase/tests/kis_news.test.sql`
**Analog:** `supabase/tests/teamflow_report.test.sql` L1-30
- 헤더 주석: 대상 마이그레이션 · 「잠그는 것」 목록 · 실행 명령(`bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql`).
```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(N);
-- 픽스처 INSERT …
```
권한 단언(anon · authenticated EXECUTE 불가 · service_role 가능), 수정본 같은 날 합치기 · 다른 날 별개, 등록 60초 스로틀, `hidden_reason` 제외 조회를 잠근다. 끝은 `ROLLBACK`.

### `server/src/routes/news-by-stock.ts`
**Analog:** `server/src/routes/themes.ts`
- **코드 집합별 캐시 + 진행 중 promise 공유**(L163-164, L276-297):
```ts
const byStockCache = new WeakMap<SupabaseClient, Map<string, { at: number; promise: Promise<...> }>>();
const key = [...codes].sort().join(",");
const hit = perClient.get(key);
if (hit && Date.now() - hit.at < BY_STOCK_CACHE_TTL_MS) return hit.promise;
for (const [k, v] of perClient) if (Date.now() - v.at >= BY_STOCK_CACHE_TTL_MS) perClient.delete(k);
const entry = { at: Date.now(), promise: compute(supabase, codes) };
perClient.set(key, entry);
entry.promise.catch(() => { if (perClient!.get(key) === entry) perClient!.delete(key); });
```
  캐시 키에 `days`·`limit` 포함, TTL 5초.
- **핸들러**(L311-322):
```ts
themesRouter.get("/by-stock", async (req, res, next) => {
  try {
    const parsed = ThemeByStockQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(400, "INVALID_QUERY_PARAM", `${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const out = await getThemesByStock(supabase, parsed.data.codes);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(out);
  } catch (e) { next(e); }
});
```
  `max-age=5`. RPC 1회 + 모양 검증(L243-247 `if (!Array.isArray(data)) throw new Error("… 모양 위반")` — 여기선 jsonb 객체 검사). 응답은 입력 코드 순서, **글 없는 코드도 포함**(themes 는 생략하므로 다름).

### `server/src/schemas/news-by-stock.ts`
**Analog:** `server/src/schemas/themes.ts` L22-29 + `server/src/schemas/news.ts` L16-35
```ts
codes: z.string().min(1).transform((raw) => raw.split(","))
  .pipe(z.array(z.string().regex(/^\d{6}$/, "6자리 종목코드")).min(1).max(THEME_BY_STOCK_MAX_CODES))
  .transform((codes) => [...new Set(codes)]),
```
**정규식은 복사하지 말고** `SHORT_CODE_RE`(`packages/shared/src/stockCode.ts:21`, `/^[0-9A-Z]{6}$/`) 사용. `days`(1 ~ 7, 기본 3) · `limit`(1 ~ 100, 기본 20)은 news.ts 의 clamp transform 꼴(거부 대신 clamp).

### `server/src/middleware/rate-limit.ts` · `server/src/app.ts`
**Analog:** 자기 자신
```ts
skip: (req) => req.path.startsWith("/health"),
```
→ `|| req.path.startsWith("/news/by-stock")` 추가(`/api` 마운트라 path 는 접두 없음). 같은 파일에 `newsByStockRateLimiter()`(windowMs 60_000 · limit 600 · 같은 handler 429 JSON). app.ts L126 `app.use("/api", apiRateLimiter())` 아래 L128 부근 라우터 결선에 `app.use("/api/news", newsByStockRouter)`.

### `server/src/routes/news.ts` (수정)
L95-117 의 `from("news_articles")…limit(limit)` 직접 조회를 `stock_feed_by_codes([code], since, …, false)` + `mergeStockFeed` 로 교체. `before` 커서·`InvalidQueryParam` 오류 꼴 유지. refresh(L120~) 는 네이버 호출 후 응답 목록만 합친 목록으로.

### `packages/shared/src/stock-feed.ts`
**Analog:** `packages/shared/src/stockCode.ts`(작은 순수 상수/함수) + `index.ts` 의 `export { SHORT_CODE_RE } from "./stockCode";` 꼴로 재수출. `newsTitleKey` · `mergeStockFeed` · 응답 타입. 테스트는 `packages/shared/src/__tests__/` 에.

### `packages/shared/src/home.ts` (수정)
L21-28 `HomeNewsRef` 에 `url: string | null` · `kind?: "news" | "disclosure"` · `publishedAt?: string`(하위호환).

### `workers/home-sync/...` (수정)
- `loadSurges.ts` L225-250: 청크 루프 `from("news_articles")…gte("published_at", cutoffIso)` → `rpc("stock_feed_by_codes", { p_codes: chunk, p_since: cutoffIso, p_per_source: 50, p_register: false })`.
- `clusterSurges.ts` L72-85 `dedupeNewsByUrl` 와 `webapp/src/components/home/news-block.tsx` L29-38 `dedupeByUrl` 의 `seen.has(item.url)` → 키 `url ?? \`${source}|${title}\``. 기존 테스트 `clusterSurges.test.ts` L104-132 에 null url 케이스 추가.

### `webapp/src/components/stock/news-item.tsx` (수정)
현재 `<a href={article.url} target="_blank" rel="noopener noreferrer">` 고정(L37-45). url 이 null 이면 `<span>` 으로, 제목 앞 「공시」/「뉴스」 배지. `{article.title}` 텍스트 escape 만(T-03 주석 유지). 그리드 클래스 체계(`grid-cols-[1fr_78px] sm:grid-cols-[1fr_88px_78px]`) 유지하며 배지 칸 추가.

### `scripts/deploy-kis-news-sync.sh` · `setup-…-iam.sh` · `smoke-…sh`
**Analog:** `scripts/deploy-news-sync.sh`
- Section 1 가드(L24-63): `GCP_PROJECT_ID` 필수 · gcloud configuration `gh-radar` 확인 · 선행 SA/Secret 존재 확인 루프.
- Job 배포(L129-142):
```bash
gcloud run jobs deploy "$JOB" --image="$IMAGE" --region="$REGION" \
  --service-account="gh-radar-news-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --cpu=1 --memory=512Mi --task-timeout=600 --max-retries=1 --parallelism=1 --tasks=1 \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@…@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,…"
```
  바꿀 값: `--task-timeout=14h` · `--max-retries=0` · Secret `KIS_APPKEY`/`KIS_APPSECRET`.
- Scheduler create/update 멱등 루프(L180-212, `"name|cron"` 배열 · `--time-zone="Asia/Seoul"` · `--oauth-service-account-email` · OIDC 금지) + 리소스 단위 invoker 바인딩(L146-151). 빠른 창 `*/5 8-19 * * 1-5`, 느린 창 15분.
- server 에는 KIS 비밀을 바인딩하지 않는다(정적 검사 대상).

### gh-trade 계약 노트
`scripts/trade-handoff.sh <slug>` 로 생성 → 본문 TODO 채움(조회 계약 · 기본 3일 · 첫 수집 10 ~ 15초). 형식 정본은 gh-trade 쪽 README.

## Shared Patterns

### 서비스롤 전용 권한(표·RPC)
**Source:** `supabase/migrations/20261020200000_limitup_accum_flow.sql` L118-121 · L276-278 — 모든 신규 표·함수에 적용. PUBLIC 만 REVOKE 하면 auto-grant 에 덮인다.

### KST 시각 계산
**Source:** `workers/news-sync/src/apiUsage.ts` `kstDateString`(+9h 후 `toISOString().slice(0,10)`) · `cadence.ts` `kstShifted` — 워커·RPC 인자 모두. 응답 시각은 `+09:00` 오프셋 명시.

### 오류 응답(server)
**Source:** `server/src/routes/themes.ts` L313-316 — `safeParse` 실패 → `new ApiError(400, "INVALID_QUERY_PARAM", \`${path}: ${message}\`)`, `catch (e) { next(e) }`.

### 로깅(워커)
**Source:** `workers/news-sync/src/index.ts` — `createLogger(...).child({ app, version })`. 한투 실패는 `msg_cd`·`msg1`·HTTP 상태 원문 로그(무로그 catch 금지).

### 왕복 1회
**Source:** `themes.ts` `computeThemesByStock` RPC 1회 — 다중 쿼리 대신 jsonb RPC 하나(db-max-rows 절단 회피).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| 임대(lease) RPC + 장기 루프 | migration/worker | 기존 Job 은 모두 단발 실행 — RESEARCH Pattern 1 따름 |
| `scripts/kis-disclosure-kinds.sql` | ops 쿼리 | 집계용 일회 SQL 선례 없음 — 단순 SELECT 로 작성 |

## Metadata

**Analog search scope:** `workers/news-sync` · `workers/intraday-sync/src/kiwoom` · `workers/home-sync` · `server/src/{routes,schemas,middleware}` · `supabase/migrations` · `supabase/tests` · `scripts` · `packages/shared/src` · `webapp/src/components/{stock,home,trading}`
**Files scanned:** 약 25
**Pattern extraction date:** 2026-11-11
