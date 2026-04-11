# Phase 1: Data Foundation — 구현 계획

> GSD phase-plan 포맷(컨텍스트 → 산출물 → 빌드 순서 → 검증)을 따르며 `01-CONTEXT.md`에 잠긴 20개 결정사항(D-01~D-20)을 모두 준수합니다.

---

## 컨텍스트

**프로젝트 현재 상태.** `gh-radar`는 그린필드 저장소입니다. 루트에는 `CLAUDE.md` 하나만 존재하고, 애플리케이션 코드·`package.json`·데이터베이스·배포된 서비스가 전혀 없습니다. 모든 사전 산출물은 `.planning/` 아래에 있습니다(PROJECT.md, ROADMAP.md, REQUIREMENTS.md, research/, Phase 1 CONTEXT.md).

**왜 Phase 1이 필요한가.** 후속 모든 페이즈(Backend API, Scanner UI, News, Discussions, AI 요약)는 KIS OpenAPI 최신 스냅샷을 담은 Supabase 테이블을 읽습니다. 장 시간 동안 그 테이블에 매 분마다 안정적으로 쓰는 인제스천 워커가 없으면 다른 어떤 것도 빌드할 수 없습니다. Phase 1의 존재 이유는 한국투자증권(KIS) OpenAPI와 인증 → 등락률 순위 REST 호출 → Supabase `stocks` 테이블 upsert를 엔드투엔드로 증명하는 것입니다. 이 과정에서 20 req/sec rate limit과 일 1회 토큰 발급 제한 모두 위반하지 않아야 합니다.

**페이즈 목표** (ROADMAP.md §"Phase 1"): *KIS OpenAPI에서 실시간 시세 데이터를 가져와 Supabase에 저장하는 기반 레이어가 작동한다.*

**Success Criteria** (페이즈 종료 시 모두 TRUE여야 함):

1. KIS OpenAPI 인증 토큰을 발급받아 등락률 순위 REST 엔드포인트를 성공적으로 호출할 수 있다
2. Supabase에 `stocks`, `news_articles`, `discussions`, `summaries` 4개 테이블이 생성되어 있다
3. `workers/ingestion`이 KIS API로부터 종목 시세를 읽어 `stocks` 테이블에 upsert한다
4. 15 req/sec 이하 속도 제한 로직이 적용되어 EGW00201 에러 없이 안정적으로 폴링한다

**해결되는 요구사항:** INFR-01 (KIS 연동), INFR-02 (Supabase 스키마).

**Phase 1에 포함되지 않는 것:** Express API (Phase 2), Cloud Scheduler 실제 등록 (Phase 2와 병행), 프론트엔드 (Phase 3/4), news/discussions/summaries 데이터 수집 (Phase 7–9), 사용자 인증 (v2).

---

## 선행 조건 (실행 전 사용자 준비 필요)

아래 항목들은 실행을 막는 프리러퀴지트입니다. Claude가 프로비저닝하지 않으며, Phase 1 실행 중 사용자가 직접 준비하는 것으로 가정합니다.

| # | 선행 조건 | 방법 | 블록되는 작업 |
|---|---|---|---|
| 1 | KIS 개발자센터 계정 + 모의투자(paper) 계좌 | `https://apiportal.koreainvestment.com` 가입 → 앱 등록 → `KIS_APP_KEY` / `KIS_APP_SECRET` 발급 | KIS client, 실증 테스트 |
| 2 | Supabase 프로젝트 | `https://supabase.com`에서 새 프로젝트 생성 → URL + service_role key 확보 | Migrations, ingestion |
| 3 | 로컬 CLI 도구 | `pnpm` (`npm i -g pnpm`), `supabase` (`brew install supabase/tap/supabase`), `docker` | Build, migrate, containerize |
| 4 | Node.js 20.x | `nvm install 20 && nvm use 20` | 모든 워크스페이스 |
| 5 | (선택) `gcloud` + GCP 프로젝트 | Cloud Run Job 실제 배포용. 본 페이즈는 **deployment prep**만 수행하고, 실제 `gcloud run jobs deploy`는 사용자가 직접 실행 | Cloud Run Job 배포 |

1번과 2번은 실행 중 Claude가 사용자와 인터랙티브하게 진행합니다. 3·4·5번은 사용자 환경에서 사전 준비합니다.

---

## 산출물

### D1 — 모노레포 스켈레톤 (pnpm workspaces)

**루트 파일:**
- `package.json` — `"private": true`, 루트 스크립트 (`lint`, `typecheck`, `build`)
- `pnpm-workspace.yaml` — `webapp`, `server`, `workers/*`, `packages/*` 선언
- `tsconfig.base.json` — strict 모드, ES2022 타겟, `@gh-radar/shared` path alias
- `.nvmrc` — `20`
- `.gitignore` — `node_modules`, `dist`, `.env`, `.env.local`, `.next`, `supabase/.temp`, `supabase/.branches`
- `.editorconfig`
- `README.md` — 한 화면 개요: 아키텍처 다이어그램, 각 워크스페이스 실행 방법, 환경변수 체크리스트

**워크스페이스 스텁** (`package.json` + `tsconfig.json`만 있어서 workspaces가 resolve되도록):
- `webapp/` — `package.json`만 (Next.js 스캐폴드는 Phase 4)
- `server/` — `package.json`만 (Express 스캐폴드는 Phase 2)
- `workers/ingestion/` — **본 페이즈에서 완전 구축**
- `packages/shared/` — **본 페이즈에서 완전 구축**

**준수 결정:** D-01 (pnpm), D-02 (`apps/` 없는 플랫 레이아웃), D-03 (`workers/` 복수형), D-04 (TypeScript 통일), D-05 (`packages/shared` 도메인 타입).

### D2 — `packages/shared` (도메인 타입)

**파일:**
- `packages/shared/package.json` — `"name": "@gh-radar/shared"`, `tsup`로 CJS + ESM 듀얼 빌드, `exports` 필드는 weekly-wine-bot `packages/somi-chat-core/package.json` 패턴 그대로
- `packages/shared/tsconfig.json` — `module: ESNext`, `moduleResolution: bundler`, `declaration: true`
- `packages/shared/tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['cjs', 'esm']`, `dts: true`
- `packages/shared/src/index.ts` — 모든 public 타입 re-export
- `packages/shared/src/stock.ts` — `Stock`, `Market` (`'KOSPI' | 'KOSDAQ'`)
- `packages/shared/src/news.ts` — `NewsArticle`
- `packages/shared/src/discussion.ts` — `Discussion`
- `packages/shared/src/summary.ts` — `Summary`, `SummaryType`, `Sentiment`
- `packages/shared/src/kis.ts` — raw KIS API 응답 타입 (D-13 실증 결과 기반 필드명)
- `packages/shared/src/marketHours.ts` — `isKoreanMarketOpen(date: Date): boolean`, `getKstDate(): Date` (KST = UTC+9 고정 오프셋, 한국은 서머타임 없음)

**`Stock` 형태** (D-06, D-07 미러):

```ts
export type Stock = {
  code: string;          // 종목코드 (6자리 PK)
  name: string;          // 종목명
  market: Market;        // 'KOSPI' | 'KOSDAQ'
  price: number;         // 현재가
  changeAmount: number;  // 전일대비
  changeRate: number;    // 등락률 (%)
  volume: number;        // 거래량
  open: number;          // 시가
  high: number;          // 고가
  low: number;           // 저가
  marketCap: number;     // 시가총액
  upperLimit: number;    // 상한가 (D-07: 저장 필수)
  lowerLimit: number;    // 하한가
  updatedAt: string;     // 갱신시각 (ISO 8601)
};
```

### D3 — Supabase 스키마 (마이그레이션 + RLS)

**파일:**
- `supabase/config.toml` — weekly-wine-bot 미러: API 포트 54321, DB 포트 54322, PG v17, `schemas = ["public", "graphql_public"]`
- `supabase/migrations/20260410120000_init_tables.sql` — `stocks`, `news_articles`, `discussions`, `summaries`, `kis_tokens` 생성
- `supabase/migrations/20260410120100_rls_policies.sql` — RLS 활성화 + 정책
- `supabase/SCHEMA.md` — 사람이 읽는 스키마 문서 (ASCII 관계도 + 테이블별 컬럼 + RLS 상태)
- `supabase/seed.sql` — 빈 placeholder

**테이블: `stocks`** (핵심, 본 페이즈에서 데이터까지 채움)

```sql
CREATE TABLE IF NOT EXISTS stocks (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  market        text NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ')),
  price         numeric(20,2) NOT NULL,
  change_amount numeric(20,2) NOT NULL,
  change_rate   numeric(8,4)  NOT NULL,
  volume        bigint NOT NULL DEFAULT 0,
  open          numeric(20,2),
  high          numeric(20,2),
  low           numeric(20,2),
  market_cap    bigint,
  upper_limit   numeric(20,2) NOT NULL,
  lower_limit   numeric(20,2) NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stocks_change_rate_desc
  ON stocks (change_rate DESC NULLS LAST);
CREATE INDEX idx_stocks_market ON stocks (market);
```

> **Discretion 해결:** 가격은 `numeric(20,2)`, 거래량/시가총액은 `bigint`. Scanner용 `change_rate` 내림차순 인덱스 추가. 단일 종목 조회는 `code` PK로 충분하므로 별도 인덱스 불필요.

**테이블: `news_articles`** (Phase 7에서 데이터 삽입)

```sql
CREATE TABLE IF NOT EXISTS news_articles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code    text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  title         text NOT NULL,
  source        text,
  url           text NOT NULL,
  published_at  timestamptz NOT NULL,
  content_hash  text,
  summary_id    uuid REFERENCES summaries(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_code, url)
);
CREATE INDEX idx_news_stock_published ON news_articles (stock_code, published_at DESC);
```

**테이블: `discussions`** (Phase 8에서 데이터 삽입)

```sql
CREATE TABLE IF NOT EXISTS discussions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code    text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  post_id       text NOT NULL,        -- Naver 게시글 ID
  title         text,
  body          text,
  author        text,
  posted_at     timestamptz,
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_code, post_id)
);
CREATE INDEX idx_discussions_stock_posted ON discussions (stock_code, posted_at DESC);
```

**테이블: `summaries`** (Phase 9에서 데이터 삽입)

```sql
CREATE TABLE IF NOT EXISTS summaries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash  text NOT NULL UNIQUE,        -- Phase 9 캐싱 키
  summary_type  text NOT NULL CHECK (summary_type IN ('news', 'discussion')),
  summary_text  text NOT NULL,
  sentiment     jsonb,                        -- {positive, negative, neutral} — 토론방만
  model         text NOT NULL,                -- 예: 'claude-haiku-4-5'
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

**테이블: `kis_tokens`** (Phase 1 인프라 — Cloud Run Job stateless 해결)

```sql
CREATE TABLE IF NOT EXISTS kis_tokens (
  id            text PRIMARY KEY CHECK (id = 'current'),  -- 단일 행 강제
  access_token  text NOT NULL,
  token_type    text NOT NULL DEFAULT 'Bearer',
  expires_at    timestamptz NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now()
);
```

> **Discretion 해결 (Cloud Run Job stateless 하에서 KIS 토큰 캐싱):** Supabase의 단일 행 테이블(`kis_tokens`, `id = 'current'` 키)에 토큰을 저장합니다. KIS가 토큰 발급을 **일 1회로 제한**하고 Cloud Run Job은 실행 간 파일시스템 상태가 사라지기 때문에 필요한 조치입니다. Secret Manager는 24시간마다 시크릿을 로테이션해야 하는 추가 장치가 필요해 제외했습니다. 이미 보유한 DB 행이 가장 단순한 내구 저장소입니다. 각 잡 실행 시: 토큰 읽기 → `expires_at - now > 5분`이면 재사용, 아니면 재발급 후 upsert.

**RLS 정책** (D-17: anon SELECT, service_role write):

```sql
ALTER TABLE stocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kis_tokens      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_stocks"        ON stocks        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_news"          ON news_articles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_discussions"   ON discussions   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_summaries"     ON summaries     FOR SELECT TO anon USING (true);
-- kis_tokens는 의도적으로 anon 정책 없음 (service_role이 RLS 우회)
```

### D4 — `workers/ingestion` (KIS → Supabase 파이프라인)

**목적:** 한 번 실행되면 KIS 등락률 순위(KOSPI + KOSDAQ)를 받아 `stocks` 테이블에 upsert하고 종료하는 Cloud Run Job. 실제 Cloud Scheduler 매 분 트리거 등록은 Phase 2 책임이며, 본 페이즈는 Dockerfile과 배포 준비 이미지까지만 제공합니다.

**파일:**

```
workers/ingestion/
├── Dockerfile                  # 멀티스테이지: node:20-alpine builder → prod
├── .dockerignore
├── .env.example                # KIS_APP_KEY, KIS_APP_SECRET, KIS_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOG_LEVEL
├── package.json                # name: @gh-radar/ingestion
├── tsconfig.json               # module: CommonJS (Node 직접 실행, weekly-wine-bot server tsconfig 미러)
├── vitest.config.ts
├── src/
│   ├── index.ts                # 엔트리포인트 — 원샷 실행
│   ├── config.ts               # 환경변수 로딩 + 검증 (weekly-wine-bot supabase.ts 패턴: 단순 process.env 체크, zod 없음)
│   ├── logger.ts               # pino JSON → stdout, {job_run_id, cycle_count} 바인딩
│   ├── services/
│   │   └── supabase.ts         # service_role 싱글턴 (weekly-wine-bot/server/src/services/supabase.ts 패턴 복사)
│   ├── kis/
│   │   ├── client.ts           # Axios 인스턴스, base URL 스위칭, OAuth 헤더 주입, readOnlyGuard 체인 적용
│   │   ├── readOnlyGuard.ts    # ⚠️ 실계좌 안전장치: 시세 조회 path 화이트리스트 외 요청은 즉시 throw
│   │   ├── tokenStore.ts       # kis_tokens 행 읽기/쓰기, 만료 5분 전이면 재사용
│   │   ├── ranking.ts          # fetchRanking(market: 'KOSPI' | 'KOSDAQ'): Promise<KisRankingRow[]>
│   │   ├── rateLimiter.ts      # 인프로세스 토큰 버킷, 15 req/sec 상한
│   │   └── types.ts            # @gh-radar/shared kis 타입 re-export + 내부 리퀘스트 빌더
│   ├── pipeline/
│   │   ├── map.ts              # KisRankingRow → Stock (순수 함수, 유닛 테스트 대상)
│   │   ├── upsert.ts           # stocks 테이블 배치 upsert
│   │   └── run.ts              # 전체 오케스트레이션: 토큰 → KOSPI 조회 → KOSDAQ 조회 → map → upsert
│   ├── holidayGuard.ts         # 첫 응답 행의 bsop_date 읽기; 오늘(KST)과 다르면 exit 0
│   ├── retry.ts                # 지수 백오프 1초→2초→4초, 최대 3회. EGW00201은 rate limit 카운팅용으로 그대로 throw
│   └── errors.ts               # 커스텀 에러 (KisRateLimitError, KisAuthError, HolidayError)
├── scripts/
│   └── empirical-test.ts       # D-13: 주말에 실행하는 standalone 스크립트 → 원본 KIS 응답을 .planning/phases/01-data-foundation/kis-empirical-sample.json에 덤프
└── tests/
    ├── map.test.ts             # 캡처한 샘플 기반 KIS 필드 → Stock 변환 검증
    ├── retry.test.ts           # fake timers로 백오프 시퀀스 검증
    ├── rateLimiter.test.ts     # 버스트 상황에서 15/sec 상한 검증
    └── holidayGuard.test.ts    # bsop_date != today일 때 exit 0 동작 검증
```

**핵심 플로우**

*`src/index.ts` (수도 코드):*

```ts
async function main() {
  const log = logger.child({ job_run_id: crypto.randomUUID() });
  try {
    const cfg = loadConfig();
    const sb = getSupabase();
    const token = await getKisToken(sb, cfg);
    const rows = await fetchAllRanking(token, cfg);      // KOSPI + KOSDAQ
    if (isHoliday(rows, getKstDate())) {
      log.info('non-trading day detected, exiting');
      return;
    }
    const stocks = rows.map(toStock);
    const { count } = await upsertStocks(sb, stocks);
    log.info({ upserted: count }, 'cycle complete');
  } catch (err) {
    log.error({ err }, 'cycle failed');
    process.exit(1);
  }
}
main();
```

**준수 결정:** D-09 (Cloud Run Job, Express와 분리), D-10 (Scheduler cron 1분 간격은 추후), D-11 (BullMQ/Redis 미사용), D-12 (bsop_date 기반 휴장일 감지, 외부 캘린더 사용 안 함), D-14 (지수 백오프 1→2→4, 최대 3회), D-15 (멱등 upsert), D-20 (service_role 싱글턴).

**⚠️ 실계좌 사용 — 추가 안전장치 (코드 레벨 강제):**

사용자는 KIS **실계좌**(계좌번호 `44381356-01`)로 진행을 결정했습니다. 등락률 순위를 포함한 시세 API가 실계좌에서 가장 안정적이기 때문입니다. 그러나 같은 App Key/Secret으로 주문/거래 API도 호출이 가능하므로, 본 워커가 실수든 코드 변경이든 미래의 회귀든 어떤 경로로도 거래 엔드포인트를 못 부르도록 코드 레벨에서 차단합니다.

1. **읽기 전용 path 화이트리스트 (`src/kis/readOnlyGuard.ts`).** 모든 KIS HTTP 요청은 axios interceptor를 통과하며 path가 화이트리스트와 매칭되지 않으면 `KisForbiddenPathError`를 throw합니다.
   - 허용 prefix (Phase 1):
     - `/uapi/domestic-stock/v1/ranking/` — 등락률/거래량 순위
     - `/uapi/domestic-stock/v1/quotations/` — 시세조회 (필요 시)
     - `/oauth2/tokenP` — 토큰 발급
   - 명시 차단 prefix (defense in depth):
     - `/uapi/domestic-stock/v1/trading/` — 주식 주문
     - `/uapi/domestic-stock/v1/order-cash` 등 모든 `order` 포함 path
2. **계좌 정보 환경변수 분리.** `KIS_ACCOUNT_NUMBER=44381356-01`을 받아 `config.ts`에서 `CANO=44381356`, `ACNT_PRDT_CD=01`로 자동 파싱. 일부 KIS REST 헤더가 요구하는 형식에 맞춤.
3. **로그 redact.** `pino` 로거에 redact 패스 추가: `req.headers.authorization`, `req.headers.appkey`, `req.headers.appsecret`, `*.access_token`, `*.refresh_token`, `*.cano`, `*.acnt_prdt_cd`. 로그에 시크릿이나 계좌번호가 평문으로 남지 않도록 강제.
4. **유닛 테스트 강제.** `tests/readOnlyGuard.test.ts` 추가: 허용된 path는 통과, 거래 path는 throw, 알 수 없는 path는 throw를 검증. CI 단계에서 회귀를 잡음.

**Claude's Discretion 해결:**
- **로거:** `pino` JSON 포맷 (Cloud Logging이 severity를 자동 파싱) + 위 redact 설정
- **환경변수 관리:** 개발은 `.env` via `dotenv/config` (weekly-wine-bot server의 `tsx watch -r dotenv/config` 패턴 미러). Cloud Run Job은 `--set-env-vars` + `--set-secrets`로 Secret Manager에서 `KIS_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` 주입
- **베이스 이미지:** `node:20-alpine`, 멀티스테이지 (builder → prod). weekly-wine-bot/server/Dockerfile 미러
- **테스팅:** Vitest 선택 (Jest보다 빠르고 TS/ESM 네이티브). Phase 1은 유닛 테스트만 작성. 통합 테스트는 실증 테스트 스크립트 자체가 대체
- **Node 버전:** `.nvmrc`는 사용자 머신 기준 `22` (Node 22 LTS, Node 20과 ABI 호환). 베이스 이미지는 `node:20-alpine` 그대로 — Cloud Run Job은 컨테이너 안에서 20을 사용하면 충분하고 alpine 22 이미지가 아직 모든 native 모듈에 안정적이지 않음.

### D5 — Cloud Run Job 배포 준비 (실배포 없음)

**파일:**
- `workers/ingestion/Dockerfile` — 멀티스테이지 빌드. `packages/shared/dist`를 최종 이미지의 `node_modules/@gh-radar/shared` 아래로 복사 (weekly-wine-bot/server/Dockerfile 22–27 라인 패턴 미러)
- `workers/ingestion/.dockerignore` — `node_modules`, `dist`, `.env`, tests, `.planning` 제외
- `workers/ingestion/DEPLOY.md` — 사용자가 직접 실행할 `gcloud` 명령 단계:
  1. `gcloud builds submit --tag gcr.io/$PROJECT/gh-radar-ingestion`
  2. `gcloud run jobs create gh-radar-ingestion --image gcr.io/$PROJECT/gh-radar-ingestion --set-env-vars=... --set-secrets=KIS_APP_SECRET=kis-app-secret:latest,...`
  3. `gcloud run jobs execute gh-radar-ingestion` (원샷 수동 테스트)
  4. 주의: `gcloud scheduler jobs create http ...`는 **Phase 2**, 여기서는 아님

### D6 — KIS 실증 검증 (D-13 필수)

**스크립트:** `workers/ingestion/scripts/empirical-test.ts`

**실행 시점:** 비거래일 — 오늘은 **토요일 2026-04-11**로 휴장 중. 지금 또는 내일(2026-04-12 일)에 휴장일 샘플을 캡처하고, 다음 거래일(2026-04-13 월) 장 시간에 거래일 샘플을 한 번 더 캡처해 두 응답을 비교한다.

**동작:**
1. KIS 토큰 발급
2. KOSPI와 KOSDAQ 각각 `국내주식 등락률 순위` REST 호출
3. 원본 JSON 응답을 `.planning/phases/01-data-foundation/kis-response-weekend.json`과 `kis-response-trading-day.json`에 덤프
4. 정확한 필드명 캡처 (KIS 문서는 `hts_kor_isnm`, `stck_shrn_iscd`, `stck_prpr`, `prdy_ctrt`, `stck_hgpr`, `stck_lwpr`, `acml_vol`을 제안하지만, 등락률 순위의 정확한 TR ID와 스키마는 실증으로 확정)

**출력 아티팩트** (저장소 커밋):
- `.planning/phases/01-data-foundation/kis-empirical-notes.md` — 결과 기록: 실제 TR ID, 필드명 매핑, `bsop_date` (영업일) 필드 위치, 휴장일 응답 동작 (freeze vs error vs empty), 마켓별 페이지네이션 특이사항
- `.planning/phases/01-data-foundation/kis-response-*.json` — 민감정보 제거(계좌번호, 토큰 마스킹) 원본 샘플

**계획 피드백:** 실증 테스트 후 `src/pipeline/map.ts`의 필드 매핑과 `src/holidayGuard.ts`의 휴장일 감지 로직이 최종 확정됩니다. 두 파일은 실증 실행 **이후**에 작성합니다.

---

## 빌드 순서 (순서대로, 원자 커밋 친화적)

각 단계 = 1개 커밋. 포맷: `chore(01-data-foundation): <step>` 또는 `feat(01-data-foundation): <step>`. GSD 컨벤션에 따른 `01` 페이즈 prefix.

1. **모노레포 스켈레톤** — 루트 `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, 워크스페이스 스텁
2. **`packages/shared` 타입** — stock/news/discussion/summary/kis 도메인 타입, `tsup` 빌드, `pnpm -F @gh-radar/shared build`로 `dist/` 생성 확인
3. **Supabase 스캐폴드** — `supabase init`, `config.toml`, `SCHEMA.md` 뼈대
4. **Supabase 마이그레이션 (테이블)** — `20260410120000_init_tables.sql`로 5개 테이블 (`stocks`, `news_articles`, `discussions`, `summaries`, `kis_tokens`)
5. **Supabase 마이그레이션 (RLS)** — `20260410120100_rls_policies.sql`, `supabase db push`로 적용, Supabase Studio에서 확인
6. **`workers/ingestion` 스캐폴드** — `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, 빈 `src/index.ts`
7. **Config + logger + Supabase 클라이언트** — `config.ts`, `logger.ts`, `services/supabase.ts`
8. **KIS 실증 테스트 스크립트** — `scripts/empirical-test.ts`. **일시정지: 사용자가 주말에 실행한 뒤 `kis-empirical-notes.md`와 마스킹 샘플 커밋**
9. **읽기 전용 가드** — `kis/readOnlyGuard.ts` + `tests/readOnlyGuard.test.ts`. **이 단계가 KIS 클라이언트보다 먼저** — 실계좌 안전장치를 가장 먼저 박아 클라이언트가 처음 작성될 때부터 가드를 통과
10. **KIS 클라이언트 + 토큰 스토어** — `kis/client.ts` (axios interceptor에 readOnlyGuard 체인), `kis/tokenStore.ts` (5분 TTL 남으면 재사용, 아니면 재발급 + upsert)
11. **Rate limiter** — `kis/rateLimiter.ts` (인프로세스 토큰 버킷, 15 req/sec)
12. **등락률 순위 호출** — `kis/ranking.ts`, 실증 TR ID와 필드 매핑 사용
13. **Retry + errors** — `retry.ts`, `errors.ts` (지수 백오프 1→2→4, 최대 3회)
14. **파이프라인 map + upsert** — `pipeline/map.ts` (순수), `pipeline/upsert.ts`, `pipeline/run.ts`
15. **홀리데이 가드** — `holidayGuard.ts`, 실증 결과 기반 `bsop_date` 체크
16. **메인 엔트리 와이어링** — `src/index.ts`에서 전체 사이클 오케스트레이션
17. **유닛 테스트** — `map.test.ts`, `retry.test.ts`, `rateLimiter.test.ts`, `holidayGuard.test.ts` (readOnlyGuard 테스트는 9단계에서 이미 작성됨)
18. **로컬 실행 스모크 테스트** — `pnpm -F @gh-radar/ingestion dev`, Supabase `stocks`가 채워지는지 확인 (등락률 순위 엔드포인트 응답 크기에 따라 100~200행 예상. 전 종목 커버는 필요 시 Phase 1.1)
19. **Dockerfile + .dockerignore** — 멀티스테이지, 로컬 `docker build`, `--env-file .env`로 실행 확인
20. **DEPLOY.md** — Cloud Run Job용 gcloud 명령 (자동 실행 없음)
21. **README.md** — 최상위 프로젝트 개요, 아키텍처, 셋업, 워크스페이스 명령, 환경변수 체크리스트
22. **STATE.md 업데이트** — Phase 1 Success Criteria 체크

**일시정지 지점** (Claude는 멈추고 사용자 대기):
- 5단계 이전: Supabase 프로젝트가 존재해야 함 ✅ 이미 확보 (`ivdbzxgaapbmrxreyuht`)
- 8단계 이후: 실증 테스트는 사용자 머신에서 실행. 휴장일 샘플은 오늘(토 2026-04-11) 또는 내일 가능, 거래일 샘플은 다음 월요일(2026-04-13) 장 시간(09:00~15:30 KST)에 캡처
- 18단계 이전: `KIS_APP_KEY` / `KIS_APP_SECRET`이 `workers/ingestion/.env`에 있어야 함 ✅ 이미 작성됨

---

## 실행 전 필독 파일

실행 에이전트는 코드 작성 전에 아래 파일을 읽어야 합니다.

- `.planning/phases/01-data-foundation/01-CONTEXT.md` — 잠긴 결정 D-01..D-20
- `.planning/PROJECT.md` — v1 범위와 제약
- `.planning/REQUIREMENTS.md` — INFR-01, INFR-02
- `.planning/ROADMAP.md` §"Phase 1" — Success Criteria
- `.planning/research/STACK.md` — KIS API 노트, rate limit
- `.planning/research/PITFALLS.md` — EGW00201, 토큰 발급, Cloud Run scale-to-zero
- `CLAUDE.md` — 프로젝트 레벨 규칙
- `/Users/alex/repos/weekly-wine-bot/supabase/config.toml` — Supabase 설정 레퍼런스
- `/Users/alex/repos/weekly-wine-bot/supabase/migrations/20260313073807_crm_tables_rls_policies.sql` — RLS 정책 예시
- `/Users/alex/repos/weekly-wine-bot/supabase/SCHEMA.md` — 스키마 문서 포맷
- `/Users/alex/repos/weekly-wine-bot/server/src/services/supabase.ts` — 싱글턴 클라이언트 패턴
- `/Users/alex/repos/weekly-wine-bot/server/Dockerfile` — 멀티스테이지 Node Dockerfile 패턴
- `/Users/alex/repos/weekly-wine-bot/package.json` — 루트 workspaces 패턴
- `/Users/alex/repos/weekly-wine-bot/packages/somi-chat-core/package.json` — 공유 패키지 `exports` 필드

---

## 검증 (페이즈 완료 전 엔드투엔드 증명)

순서대로 실행. 모두 통과해야 함.

### V1 — 모노레포 resolve
```bash
pnpm install
pnpm -r --workspace-concurrency=1 run typecheck
```
**기대:** 모든 워크스페이스 resolve, TypeScript 에러 0건.

### V2 — 공유 패키지 빌드
```bash
pnpm -F @gh-radar/shared build
ls packages/shared/dist/
```
**기대:** `index.js`, `index.cjs`, `index.d.ts` 생성.

### V3 — Supabase 스키마 생성
```bash
supabase db push
supabase db dump --data-only=false | grep -E "CREATE TABLE (stocks|news_articles|discussions|summaries|kis_tokens)"
```
**기대:** 5개 테이블 전부 존재. 5개 테이블 모두 RLS 활성화.

### V4 — RLS 정책 활성화
Supabase Studio SQL 에디터에서:
```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
```
**기대:** `anon_read_*` 정책 4개 (stocks, news_articles, discussions, summaries). `kis_tokens`는 정책 없음 (service_role 전용).

### V5 — KIS 실증 테스트 성공
```bash
ls .planning/phases/01-data-foundation/kis-empirical-notes.md
ls .planning/phases/01-data-foundation/kis-response-*.json
```
**기대:** 노트 파일에 실제 TR ID, 필드명 매핑, 휴장일 `bsop_date` 동작이 기록됨.

### V6 — 인제스천 워커 로컬 실행 + upsert
```bash
cd workers/ingestion
cp .env.example .env
# KIS + Supabase 크리덴셜 채우기
pnpm dev
```
이어서 Supabase SQL 에디터에서:
```sql
SELECT COUNT(*), MAX(updated_at), MIN(change_rate), MAX(change_rate) FROM stocks;
```
**기대:** 행 수 > 0 (순위 엔드포인트 페이지 크기에 따라 30~200개), `updated_at`이 1분 내, `change_rate` 범위가 합리적.

### V7 — Rate limit 테스트 (EGW00201 없음)
10초 내 3회 연속 실행:
```bash
for i in 1 2 3; do pnpm dev & done; wait
```
**기대:** 로그에 `EGW00201` 없음. Rate limiter가 버스트를 15 req/sec 이하로 제한.

### V8 — 휴장일 시뮬레이션
주말에 실제로 실행하거나 샘플 fixture의 `bsop_date`를 목킹해 실행:
```bash
pnpm dev
```
**기대:** `non-trading day detected, exiting` 로그, exit 0, upsert 없음. 유닛 테스트 `holidayGuard.test.ts`에서도 결정적으로 커버.

### V9 — 유닛 테스트 통과
```bash
pnpm -F @gh-radar/ingestion test
```
**기대:** `map.test.ts`, `retry.test.ts`, `rateLimiter.test.ts`, `holidayGuard.test.ts`, `readOnlyGuard.test.ts` 전부 녹색.

### V10 — 읽기 전용 가드 회귀 테스트 (실계좌 안전장치)
```bash
pnpm -F @gh-radar/ingestion test -- readOnlyGuard
```
**기대:** 거래 path (`/uapi/domestic-stock/v1/trading/order-cash` 등)로 요청 시 `KisForbiddenPathError` throw, 시세 path는 통과. `axios.create` mock으로 검증.

추가 수동 검증: 임시 코드로 `await client.post('/uapi/domestic-stock/v1/trading/order-cash', {})`를 호출 시도 → 즉시 throw가 떨어지는지 1회 확인 후 코드 제거.

### V11 — Docker 이미지 빌드 + 실행
```bash
docker build -t gh-radar-ingestion:local -f workers/ingestion/Dockerfile .
docker run --rm --env-file workers/ingestion/.env gh-radar-ingestion:local
```
**기대:** 이미지 ≤ 250 MB. 컨테이너가 1사이클 실행 후 exit 0. Supabase `stocks.updated_at` 갱신.

### V12 — Success Criteria 4개 전부 TRUE
각 기준을 증거와 매핑:

| # | 기준 | 증거 |
|---|---|---|
| 1 | KIS 토큰 발급 + 등락률 순위 호출 성공 | V5 실증 샘플 + V6 로컬 실행 |
| 2 | Supabase 4개 테이블 생성 | V3 마이그레이션 출력 |
| 3 | Ingestion Worker가 stocks에 upsert | V6 행 수 > 0, `updated_at` 최신 |
| 4 | 15 req/sec 제한 + EGW00201 없음 | V7 버스트 테스트 |

---

## 열린 가정 (Claude's Discretion, 가시성 위해 명시)

1. **KIS 환경 — 실계좌 확정.** 사용자가 실계좌(계좌번호 `44381356-01`)로 진행을 결정. `KIS_BASE_URL=https://openapi.koreainvestment.com:9443` (실거래). 시세 API의 안정성을 위한 선택이며, 대신 실계좌 위험은 코드 레벨 안전장치(`readOnlyGuard.ts` 화이트리스트, 로그 redact, 회귀 테스트)로 차단. 모의투자 fallback이 필요해지면 `KIS_BASE_URL`을 `https://openapivts.koreainvestment.com:29443`로 1줄 변경.
2. **등락률 순위 TR ID.** 리서치 파일에는 정확한 TR ID가 없음 — 실증 테스트(8단계) 후 확정. `kis/ranking.ts` 구현을 12단계로 미뤄 이 순서를 보장.
3. **Vitest 도입.** weekly-wine-bot에는 테스트가 없지만, 본 계획은 파이프라인 map 함수와 휴장일 가드 로직 같은 순수 함수/엣지케이스 코드를 유닛 테스트로 저렴하게 커버하기 위해 Phase 1부터 Vitest를 도입. 새 컨벤션을 여기서 확립.
4. **Cloud Run 실배포 없음.** Phase 1은 `docker build` + `DEPLOY.md`까지. `gcloud run jobs deploy`와 `gcloud scheduler jobs create` 실행은 Express 서버가 합류하는 Phase 2로 연기.
5. **전 종목 vs 상위 N개.** 등락률 순위 엔드포인트는 보통 마켓당 상위 ~100개만 반환 (전체 ~2,700 종목이 아님). Phase 1은 상위 N개로 출시. 전 종목 커버리지가 Scanner에 실제로 필요한지 확인 후 필요하면 Phase 1.1로 처리.

---

## 범위 가드 (Phase 1에 명시적으로 포함되지 않음)

- Express API 엔드포인트 (`/api/scanner`, `/api/stocks/:code`) — Phase 2
- Cloud Run Service 배포, Cloud Scheduler 잡 등록 — Phase 2
- 모든 프론트엔드 코드 (Next.js 앱, 컴포넌트, Tailwind, shadcn/ui) — Phase 3 & 4
- 뉴스 수집기, 토론방 스크래퍼, 요약기 — Phase 7, 8, 9
- KIS WebSocket 구독 (`H0STCNT0`) — 연기 (REST 폴링으로 v1 요구 충족)
- BullMQ / Upstash Redis — D-11에 따라 연기
- 시계열 스냅샷 (`stock_snapshots`) — v2로 연기
- 사용자 인증 — v2로 연기

---

*페이즈 디렉토리: `.planning/phases/01-data-foundation/`*
*계획 작성일: 2026-04-10*
