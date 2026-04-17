# Phase 07: News Ingestion — Research

**Researched:** 2026-04-17
**Domain:** Naver Search News API 수집 → Supabase 저장 → Express API → Next.js 상세 페이지/뉴스 페이지 표시 (Cloud Run Job 배치 + 사용자 수동 새로고침)
**Confidence:** HIGH (스택/패턴 모두 기존 phase 5/6/6.1/6.2 에서 확정 + Naver API 스펙 외부 검증 완료)
**Output language:** ko

---

## Context Summary (CONTEXT 에서 확정된 결정 — 연구 범위 아님)

> 이하 항목은 `07-CONTEXT.md` D1~D9 + R1~R5 + `07-UI-SPEC.md` 에서 이미 잠긴 결정. 본 RESEARCH 는 이를 전제로 **planner 가 바로 task 로 녹일 수 있는 구체 정보**만 제공한다.

| # | 결정 | 출처 |
|---|---|---|
| 1 | 수집 트리거: Cloud Run Job + Cloud Scheduler `*/15 * * * *` (24h) + 사용자 수동 새로고침 | D1, D2 |
| 2 | 배치 대상: `top_movers` 최신 scan_id ∪ `watchlists.stock_code` (~200종목 상한) | D2 |
| 3 | Worker 위치: `workers/news-sync/` (master-sync 패턴 그대로 복제) | D2 |
| 4 | API: `GET https://openapi.naver.com/v1/search/news.json` · `query={종목명}&display=20&sort=date&start=1` · 헤더 `X-Naver-Client-Id`/`X-Naver-Client-Secret` | D3 |
| 5 | 저장: INSERT + ON CONFLICT DO NOTHING on `UNIQUE(stock_code, url)`, content_hash sha256, 90일 retention | D4 |
| 6 | Rate limit: 25K/day 글로벌 카운터(저장소는 재량) + per-stock 30s 쿨다운 (서버 `MAX(created_at)` 기반) | D5 |
| 7 | UI: 세로 2단 적층, 상세 5건 + 더보기 → `/stocks/[code]/news` (7일 전체, 하드캡 100), 짧은 도메인 prefix 출처 | D6/D7/R1/R2/R5 |
| 8 | API: `GET /api/stocks/:code/news?days=7&limit=<=100` + `POST /api/stocks/:code/news/refresh` (429+`retry_after_seconds`) | D8/R3 |
| 9 | 신규 deps 금지: webapp 에 `date-fns-tz` 도입 안 함 — 기존 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 재사용 | UI-SPEC §Design System |
| 10 | back-nav 규칙: 03-UI-SPEC §4.4 — 타이틀 왼쪽 인라인 `←` (breadcrumb 줄 폐기) | R5 |

---

## Project Constraints (from CLAUDE.md)

> CLAUDE.md 의 directives 가 본 phase 에 미치는 영향 — planner 가 verification step 에 반영해야 함.

- **법적 가이드 (Naver):** robots.txt 준수, API 이용약관 준수. **본 phase 는 공식 Search API 만 사용 — robots.txt/스크래핑 이슈 없음.** 토론방(Phase 8) 과 분리.
- **2022 대법원 2021도1533 판결:** 본 phase 범위에선 해당 없음 (공식 API). 법적 위험은 Phase 8 로 이연.
- **API 이용약관 (Naver Search):** 출처 표기 권고 — 본 phase R1 에서 짧은 도메인 prefix 노출로 이미 충족.
- **배포 환경:** 프론트 Vercel, 백엔드 Cloud Run (컨테이너). news-sync 도 Cloud Run Job 형태로 통일.
- **Budget / Rate Limit 보호:** 25K/day 의 77% 사용 예상 — 폴링 주기 변경 가능하도록 Scheduler cron 을 ENV 가 아닌 Scheduler 리소스 자체로 분리(이미 master-sync 패턴 유지).
- **데이터 갱신 1분 폴링 허용:** 본 phase 는 15분 주기 — 충분히 보수적.
- **한글 소통:** 본 문서 한글 작성 + 사용자 노출 카피 모두 한글 (UI-SPEC §Copywriting 일치).
- **GSD 워크플로우:** 모든 코드 변경은 `/gsd-execute-phase` 진입 후 진행 — planner 는 이 전제 위에서 task 분해.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NEWS-01 | 종목별 관련 뉴스 목록 표시 (Naver Search API) — (1) 목록, (2) 제목/출처/날짜+원문 링크, (3) 25K/day 한도 | (1) D6/D7/R2 + Section "Express route 설계" / "Next.js 페이지" / (2) D3 응답 매핑 + R1 출처 + UI-SPEC §Visual / (3) Section "호출 카운터 저장소" + Section "동시성·실패 격리" |

---

## Research Findings

### 1. Naver Search News API 실전 운영

**HIGH confidence — 외부 사례 + 공식 가이드 검증 완료.**

#### 1.1 응답 JSON 스펙 (실제 필드)
[VERIFIED: scsc3313/naver-news-search-api README, isnow890/naver-search-mcp]

```json
{
  "lastBuildDate": "Fri, 17 Apr 2026 14:32:00 +0900",
  "total": 4823,
  "start": 1,
  "display": 20,
  "items": [
    {
      "title": "<b>삼성전자</b>, 1분기 영업익 6.6조원...",
      "originallink": "https://www.hankyung.com/article/202604170142",
      "link": "https://n.news.naver.com/mnews/article/015/0005012345",
      "description": "<b>삼성전자</b>가 17일 발표한 1분기 잠정실적에 따르면...",
      "pubDate": "Fri, 17 Apr 2026 14:32:00 +0900"
    }
  ]
}
```

핵심 사항:
- **`source` 필드 없음.** 출처 정보는 `originallink` 의 host 에서 파싱해야 함.
- **`title`/`description` 에 HTML 태그 + entity 노출:** `<b>`, `</b>`, `&quot;`, `&amp;`, `&#39;`, `&lt;` 등. **반드시 server 에서 strip.**
- `originallink` 우선, 폴백 `link` (Naver 뉴스 자체 페이지) — D3 결정과 일치.
- `pubDate`: RFC 822 + `+0900` (KST) — `new Date(pubDate)` 로 그대로 파싱 가능 (Section 2 참조).
- `total` 은 ~4000 까지 의미있고, `start` 는 max 1000 이라 **본 phase 의 `display=20, start=1` 단일 호출이면 충분**. 페이지네이션 deferred.

#### 1.2 요청 파라미터 한계
[VERIFIED: scsc3313 README + Naver gateway 일반 패턴]

| 파라미터 | 허용 범위 | 본 phase 사용 |
|---|---|---|
| `query` | URL-encoded UTF-8, 검색어 | 종목명 (D3) |
| `display` | 1~100 | **20** (D3) |
| `start` | 1~1000 | **1** |
| `sort` | `sim` (정확도) / `date` (최신) | **`date`** (D3) — 트레이더는 최신 우선 |

#### 1.3 한글 query encoding
[ASSUMED] axios 의 `params: { query: '삼성전자' }` 는 자동으로 UTF-8 % 인코딩 (`%EC%82%BC%EC%84%B1...`). 별도 처리 불필요.

#### 1.4 sort=date vs sort=sim 비교
[VERIFIED: Naver SearchAPI/SerpAPI 문서] `sort=date` 는 `pubDate DESC`. 종목 뉴스의 시의성 가치가 정확도 가치보다 높음 → **D3 의 `sort=date` 채택은 정당**. (대안 sim 은 동명회사 노이즈 완화에 미세하게 도움이지만, R1 의 출처 노출 + Phase 9 AI 요약이 노이즈 처리 담당.)

#### 1.5 동명이인/동명회사 노이즈
- "한미약품" / "한미반도체" 와 같은 부분 매칭, 또는 종목명이 일반 명사인 경우(예: "동원" / "삼성") 무관 뉴스 다수 혼입.
- **갑작스런 v1 완화는 deferred** — CONTEXT D3 명시. 본 phase 는 그대로 두고 Phase 9 AI 가 처리.
- 단, planner 는 worker 단계에서 **종목명이 1글자**인 케이스는 skip 또는 종목코드 추가 쿼리 등으로 별도 정책을 두는 옵션을 명시할 수 있음 (선택 — Open Question 1 참조).

#### 1.6 에러 응답
[CITED: naver.github.io/naver-openapi-guide/errorcode.html]

| HTTP | 의미 | worker 처리 |
|---|---|---|
| 401 | client id/secret 무효 | retry 안 함, 즉시 abort + 명시 에러 throw (master-sync 의 401 처리 패턴 동일) |
| 400/403 | 파라미터 오류 | retry 안 함, 해당 종목 skip + 로그 |
| 429 | **일일 한도 초과** | 즉시 cycle abort + 다음 tick 까지 hold |
| 500 | 서버 에러 | 1~2회 backoff retry |

응답 형식 (JSON 또는 XML — Accept 미지정 시 XML 가능성, **`/v1/search/news.json` endpoint 사용 시 JSON 보장**):
```json
{ "errorMessage": "Authentication failed", "errorCode": "024" }
```

---

### 2. RFC 822 → timestamptz 변환

**HIGH confidence — Node 내장 + Postgres 자동 변환으로 충분.**

[VERIFIED: ECMA-262 Date parsing, Postgres timestamptz docs]

- `new Date('Fri, 17 Apr 2026 14:32:00 +0900')` 는 V8 (Node 22) 에서 **정확히 파싱**되어 UTC 기반 `Date` 객체 반환.
- `.toISOString()` → `'2026-04-17T05:32:00.000Z'` (UTC) — 이를 그대로 Supabase `timestamptz` 컬럼에 INSERT 하면 KST 시각이 보존됨.
- **`date-fns-tz` 불필요.** UI-SPEC 가드레일 §2 (신규 deps 금지) 와 일치.
- 엣지 케이스:
  - 잘못된 포맷 → `Date.NaN` → `Number.isNaN(d.getTime())` 검사 → 해당 item skip.
  - 타임존 약어(`KST`) 가 들어오면 V8 이 unknown 으로 NaN 처리할 수 있음 — Naver 는 `+0900` 만 사용하므로 실제 발생 가능성 낮으나 방어 필수.

KST 포맷팅(UI):
- 상세 Card `MM/DD HH:mm` → `new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })`
- `/news` 페이지 `YYYY-MM-DD HH:mm` → `Intl.DateTimeFormat` + `year:'numeric'` 추가, hyphen 구분은 직접 join (Intl 의 `formatToParts` 사용 또는 단순 substring 변환). 기존 `stock-detail-client.tsx:15-21` 패턴 복사 후 옵션만 변경.

---

### 3. `title`/`description` HTML 태그 strip

**HIGH confidence — 정규식 best-effort 가 본 케이스에 충분 + 신규 dep 회피.**

조사 결과:
- 현재 repo 에 `sanitize-html`, `striptags`, `dompurify`, `xss` **모두 미설치** (Grep 검증).
- 추가 dep 도입 시 worker 이미지 크기 + 보안 surface 증가.
- Naver title/description 은 **Naver gateway 가 미리 sanitize** 한 결과 → `<b>...</b>` 와 알려진 HTML entity 만 등장. 임의 script/style/iframe 삽입 사례 없음(공식 API 응답이며 시도가 있어도 Naver 가 1차 필터).

**권장 (HIGH):** 정규식 + entity decode 의 **순수 함수**를 server (또는 worker shared) 에 작성:

```ts
// workers/news-sync/src/pipeline/sanitize.ts
const HTML_TAG_RE = /<\/?[a-z][a-z0-9]*\b[^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&nbsp;': ' ',
};
const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-f]+);/gi;

export function stripHtml(input: string): string {
  if (!input) return '';
  let s = input.replace(HTML_TAG_RE, '');
  s = s.replace(NUMERIC_ENTITY_RE, (_, n) => String.fromCodePoint(Number(n)));
  s = s.replace(HEX_ENTITY_RE, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  for (const [k, v] of Object.entries(NAMED_ENTITIES)) s = s.replaceAll(k, v);
  return s.trim();
}
```

위치: `workers/news-sync/src/pipeline/sanitize.ts` 단일 함수 + 단위 테스트 8~10케이스. Express route 도 (수동 새로고침 시) 동일 함수 import → `packages/shared/src/news-sanitize.ts` 또는 worker 내부 `pipeline/sanitize.ts` 를 server 에서 직접 import (현재 monorepo 가 server → workers import 안 함 — **`packages/shared` 에 공통 함수 배치 권장**).

**XSS 추가 방어 (depth-in-defense):**
- DB 에 strip 된 plain text 만 저장 → SELECT 결과는 이미 안전.
- React 가 기본적으로 텍스트를 escape 하므로, `dangerouslySetInnerHTML` 을 절대 사용하지 않으면 추가 위협 없음.
- 단, `originallink` URL 은 **별도 검증 필요**: `new URL(url).protocol === 'https:'` 또는 `'http:'` 만 허용 (javascript:, data: 차단). Section 12 (Threat Model) 참조.

---

### 4. 호출 카운터 저장소 — 추천: **Supabase `api_usage` 테이블 (atomic increment)**

**MEDIUM-HIGH confidence — 후보 3종 비교 후 Supabase 채택.**

| 후보 | 장점 | 단점 | 평가 |
|---|---|---|---|
| (a) Upstash Redis 신규 도입 | atomic INCR 완벽 | Cloud Run Job 에 신규 secret + URL + 의존성 추가, monthly cost 미미하지만 운영 surface 증가, 본 repo 에 Redis 클라이언트 미설치 | **불채택** (overkill) |
| (b) **Supabase `api_usage` (UPSERT + RPC)** | 이미 있는 인프라, 트랜잭셔널, 다음 tick / cleanup job / 모니터링 쿼리 자유 | RPC 1회 추가 호출 필요 | ✅ **채택** |
| (c) Cloud Run Job in-memory | zero infra | **각 Job invocation 이 독립 컨테이너 — 카운터 공유 불가** (15분 tick 간 hard reset) | **불채택** (요구사항 미충족) |

**추천 스키마:**

```sql
-- supabase/migrations/20260417xxxxxx_api_usage.sql
CREATE TABLE api_usage (
  service     text NOT NULL,        -- 'naver_search_news'
  usage_date  date NOT NULL,        -- KST 기준 일자
  count       bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, usage_date)
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
-- RLS: anon/authenticated 읽기 정책 없음 — service_role 만.

-- Atomic increment + 잔여량 반환
CREATE OR REPLACE FUNCTION incr_api_usage(p_service text, p_date date, p_amount int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_count bigint;
BEGIN
  INSERT INTO api_usage(service, usage_date, count, updated_at)
    VALUES (p_service, p_date, p_amount, now())
    ON CONFLICT (service, usage_date)
    DO UPDATE SET count = api_usage.count + p_amount, updated_at = now()
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;
```

**worker 호출 패턴:**
1. Cycle 시작 시 `SELECT count FROM api_usage WHERE service='naver_search_news' AND usage_date=current_date_kst` → 잔여량 = `25000 - count`. 잔여 < 안전 마진(예: 50) 이면 cycle skip + 경고 로그.
2. 종목별 fetch 직전 `incr_api_usage(...,1)` 호출. 반환값이 25000 초과면 즉시 abort.
3. 수동 refresh route 도 동일 RPC 사용 → 글로벌 정합성 유지.

**KST 일자 계산:** master-sync 의 `todayBasDdKst()` 패턴 재사용 (UTC + 9h → YYYY-MM-DD).

---

### 5. 배포 아티팩트 델타 (master-sync 대비 news-sync)

**HIGH confidence — 기존 master-sync 파일 그대로 복제 + 변수만 치환.**

| 카테고리 | 파일 | 델타 |
|---|---|---|
| Workspace | `pnpm-workspace.yaml` | 변경 없음 (`workers/*` glob) |
| Worker code | `workers/news-sync/` (신규 디렉터리) | master-sync 전체 복제 후 fetcher 만 교체 (Section 5.1) |
| Dockerfile | `workers/news-sync/Dockerfile` | master-sync Dockerfile 1:1 복사 + `master-sync` → `news-sync` 치환 (3곳) |
| IAM 스크립트 | `scripts/setup-news-sync-iam.sh` | master-sync 미러 + 신규 Secret `gh-radar-naver-client-id`, `gh-radar-naver-client-secret` 생성 + 신규 SA `gh-radar-news-sync-sa` (Naver + Supabase 만 access) |
| Deploy 스크립트 | `scripts/deploy-news-sync.sh` | master-sync 미러 + Job 이름 `gh-radar-news-sync` + cron `*/15 * * * *` (24h) + region `asia-northeast3` + memory 512Mi + task-timeout 600s (200종목 × 평균 1초 fetch + 여유) |
| Smoke | `scripts/smoke-news-sync.sh` | master-sync 미러 — `gcloud run jobs execute --wait` + 종료코드 검증 |
| ops/alert | `ops/alert-news-sync-failure.yaml` | `ops/alert-ingestion-failure.yaml` 복제 + Job 이름 치환 (선택 — planner 재량) |
| Secret accessor | `setup-news-sync-iam.sh` | news-sync-sa 에 `gh-radar-naver-client-id`, `gh-radar-naver-client-secret`, `gh-radar-supabase-service-role` accessor 부여 (KIS/KRX 시크릿 미바인딩 — 최소권한) |
| Scheduler invoker | `deploy-news-sync.sh` §5.5 | `gh-radar-scheduler-sa` 를 `gh-radar-news-sync` Job invoker 로 바인딩 (master-sync §5.5 패턴 동일) |
| Scheduler 리소스 | `deploy-news-sync.sh` §6 | `gh-radar-news-sync-scheduler` create-or-update, OAuth(`--oauth-service-account-email`, OIDC 금지 — Pitfall 2 그대로 적용) |

**환경변수 매핑:**
```
SUPABASE_URL                  (env)
SUPABASE_SERVICE_ROLE_KEY     (secret: gh-radar-supabase-service-role)
NAVER_CLIENT_ID               (secret: gh-radar-naver-client-id)
NAVER_CLIENT_SECRET           (secret: gh-radar-naver-client-secret)
NAVER_BASE_URL                (env, default https://openapi.naver.com)
LOG_LEVEL=info
APP_VERSION=$GIT_SHA
NEWS_SYNC_CONCURRENCY=8       (Section 6 참조)
NEWS_SYNC_DAILY_BUDGET=24500  (25000 의 98% 안전 마진 — 수동 refresh 여유)
```

#### 5.1 Worker code 구조 (master-sync 미러)

```
workers/news-sync/
├── package.json              # @gh-radar/news-sync, deps: axios pino @supabase/supabase-js dotenv @gh-radar/shared (sanitize-html 도입 안 함)
├── Dockerfile                # 위 표 그대로
├── tsconfig.json             # master-sync 1:1
├── vitest.config.ts          # master-sync 1:1
├── src/
│   ├── config.ts             # NaverConfig + targets concurrency budget
│   ├── logger.ts             # redact: naverClientSecret/supabaseServiceRoleKey
│   ├── retry.ts              # master-sync 그대로
│   ├── services/supabase.ts  # master-sync 그대로
│   ├── naver/
│   │   ├── client.ts         # axios.create({ baseURL, headers: { 'X-Naver-Client-Id': ..., 'X-Naver-Client-Secret': ... } })
│   │   └── searchNews.ts     # GET /v1/search/news.json + 에러 처리(401/429/5xx 분기)
│   ├── pipeline/
│   │   ├── sanitize.ts       # Section 3 stripHtml
│   │   ├── sourceHost.ts     # Section 8 짧은 도메인 prefix
│   │   ├── map.ts            # NaverItem → news_articles row + content_hash
│   │   ├── upsert.ts         # INSERT ON CONFLICT DO NOTHING + 카운트 반환
│   │   └── targets.ts        # top_movers ∪ watchlists 조회 + 마스터 검증
│   ├── apiUsage.ts           # incr_api_usage RPC wrapper + budget 체크
│   ├── retention.ts          # DELETE WHERE created_at < now() - interval '90 days'
│   └── index.ts              # CLI entry: targets 로드 → p-limit 동시성 → fetch/sanitize/upsert → cleanup → counter flush
└── tests/
    ├── sanitize.test.ts
    ├── sourceHost.test.ts
    ├── map.test.ts
    ├── searchNews.test.ts    # MSW 또는 axios mock — 401/429/5xx + 정상 응답
    └── index.test.ts         # 전체 cycle e2e (mock supabase + naver)
```

---

### 6. 동시성·실패 격리

**HIGH confidence — p-limit 채택 + per-stock try/catch.**

#### 6.1 동시성 적정선
- Naver Search API latency 평균 200~600ms [ASSUMED — 외부 벤치 부재, 한국 로케이션 + Naver 자체 인프라 일반 추정].
- 200 종목을 직렬 호출 → 200 × 400ms = 80초 (12분 한도 내 충분).
- 동시성 8 → ~10초 + jitter. 동시성 10 이상은 Naver 의 미공개 per-second rate limit (역사적으로 10/sec 추정) 와 충돌 위험.
- **권장: 동시성 8 (`p-limit(8)`).** ENV `NEWS_SYNC_CONCURRENCY` 로 override 가능.

#### 6.2 라이브러리 — `p-limit`
- 현재 repo 미설치. 추가 dep 1개 (size 1.4KB, dependency-free).
- 대안: `Promise.allSettled` + 수동 chunk 처리 — 가능하지만 코드 길어짐. **p-limit 채택 권장.**
- 버전 [VERIFIED: npm view] `7.3.0` (2026 최신).

#### 6.3 실패 격리
```ts
const limit = pLimit(config.concurrency);
const tasks = stockCodes.map((code) =>
  limit(async () => {
    try {
      const stock = await getStockMaster(code);   // 마스터 미존재 시 skip
      if (!stock) return { code, status: 'skipped_no_master' };
      const remaining = await checkBudget();
      if (remaining < 1) return { code, status: 'budget_exhausted' };
      const items = await searchNews(stock.name, naverClient);
      const inserted = await upsertNews(supabase, code, items);
      return { code, status: 'ok', inserted };
    } catch (err) {
      log.warn({ code, err }, 'news fetch failed (per-stock)');
      return { code, status: 'error', err: (err as Error).message };
    }
  }),
);
const results = await Promise.allSettled(tasks);
```

per-stock 실패가 cycle 전체를 중단하지 않음. 단, 401(인증) / 429(글로벌) 발생 시 **즉시 abort 시그널 공유** — `AbortController` 또는 `let stopAll = false` 플래그 활용.

---

### 7. Retention cleanup 실행 위치

**MEDIUM confidence — news-sync Job 종료 시 inline 실행 권장.**

| 옵션 | 장점 | 단점 |
|---|---|---|
| (a) news-sync Job 종료 직전 `DELETE WHERE created_at < now() - interval '90 days'` | 추가 Scheduler/Job/IAM 없음, Job 매 15분마다 자연스럽게 실행 | Job 실행 시간 +1~3초 |
| (b) 독립 Cloud Scheduler `0 3 * * *` + 신규 Cloud Run Job `gh-radar-news-cleanup` | 책임 분리 | IAM/Job/Scheduler 신규 3개 추가 — 비용·복잡도 증가, ROI 낮음 |
| (c) Supabase pg_cron extension | Cloud 인프라 0 | pg_cron 활성화 + 권한 + 마이그레이션 운영 추가, 본 repo 내 미사용 |

**권장 (a):** `workers/news-sync/src/retention.ts` + `index.ts` 의 cycle 종료 직전 `await runRetention(supabase, 90)` 호출. 1일 1회만 실행하고 싶다면 KST 03~04시 tick 에서만 분기 (planner 재량). Idempotent 한 DELETE 라 매 tick 실행해도 cost 무의미.

```ts
// workers/news-sync/src/retention.ts
export async function runRetention(supabase: SupabaseClient, days = 90): Promise<number> {
  const { count, error } = await supabase
    .from('news_articles')
    .delete({ count: 'exact' })
    .lt('created_at', new Date(Date.now() - days * 86400_000).toISOString());
  if (error) throw error;
  return count ?? 0;
}
```

---

### 8. Express route 설계 구체

**HIGH confidence — 기존 `stocks.ts` 패턴 재사용.**

#### 8.1 새 router vs 기존 확장
- **권장: `server/src/routes/news.ts` 신규 + `server/src/app.ts` 마운트 `/api/stocks/:code/news`.** 책임 분리 + Phase 8/9 와 충돌 회피.
- 마운트 패턴: `app.use('/api/stocks', stocksRouter)` 가 이미 있으므로 **`/api/stocks/:code/news`** 경로를 새 router 로 처리하려면 `app.use('/api/stocks/:code/news', ...)` 또는 `stocksRouter.use('/:code/news', newsRouter)` 형태. **후자가 깔끔** (params merging).

권장 구조:
```ts
// server/src/routes/news.ts
import { Router } from 'express';
export const newsRouter: Router = Router({ mergeParams: true });

newsRouter.get('/', async (req, res, next) => { /* GET /api/stocks/:code/news */ });
newsRouter.post('/refresh', async (req, res, next) => { /* POST /api/stocks/:code/news/refresh */ });

// server/src/routes/stocks.ts 끝부분 추가
import { newsRouter } from './news.js';
stocksRouter.use('/:code/news', newsRouter);
```

#### 8.2 Zod 스키마

```ts
// server/src/schemas/news.ts
import { z } from 'zod';

export const StockCodeParam = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, 'invalid stock code'),
});

export const NewsListQuery = z.object({
  days: z.coerce.number().int().min(1).max(7).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export type NewsListQueryT = z.infer<typeof NewsListQuery>;
```

핵심:
- `code` 검증은 `stocksRouter.get('/:code')` 와 동일 정규식 (`/^[A-Za-z0-9]{1,10}$/`).
- `days` max 7 (UI-SPEC R2 7일 하드캡), `limit` max 100 (R3 clamp). 클라이언트가 200 보내도 100 으로 강제.

#### 8.3 GET 핸들러 로직

```ts
newsRouter.get('/', async (req, res, next) => {
  try {
    const { code } = StockCodeParam.parse(req.params);
    const { days, limit } = NewsListQuery.parse(req.query);
    const supabase = req.app.locals.supabase as SupabaseClient;

    // 마스터 존재 검증 (404)
    const { data: master, error: mErr } = await supabase
      .from('stocks').select('code').eq('code', code).maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);

    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data, error } = await supabase
      .from('news_articles')
      .select('id,stock_code,title,source,url,published_at,created_at')
      .eq('stock_code', code)
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json((data ?? []).map(toNewsArticleDto));
  } catch (e) {
    if (e instanceof z.ZodError) return next(InvalidQueryParam('news', e.issues[0].message));
    next(e);
  }
});
```

#### 8.4 POST /refresh 핸들러 (쿨다운 + Naver 호출)

```ts
const COOLDOWN_S = 30;

newsRouter.post('/refresh', async (req, res, next) => {
  try {
    const { code } = StockCodeParam.parse(req.params);
    const supabase = req.app.locals.supabase as SupabaseClient;
    const naver    = req.app.locals.naverClient as AxiosInstance | undefined;
    if (!naver) throw new ApiError(503, 'NAVER_UNAVAILABLE', 'naver client not configured');

    // 1. 마스터 존재
    const { data: master, error: mErr } = await supabase
      .from('stocks').select('code,name').eq('code', code).maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);

    // 2. 쿨다운: news_articles MAX(created_at) 기준
    const { data: latest, error: lErr } = await supabase
      .from('news_articles').select('created_at')
      .eq('stock_code', code).order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (lErr) throw lErr;
    if (latest) {
      const elapsed = (Date.now() - Date.parse(latest.created_at)) / 1000;
      if (elapsed < COOLDOWN_S) {
        const retry_after_seconds = Math.ceil(COOLDOWN_S - elapsed);
        res.setHeader('Retry-After', String(retry_after_seconds));
        res.status(429).json({
          error: { code: 'NEWS_REFRESH_COOLDOWN', message: '잠시 후 다시 시도해주세요' },
          retry_after_seconds,
        });
        return;
      }
    }

    // 3. Budget 체크 (api_usage RPC)
    const { data: remaining } = await supabase.rpc('incr_api_usage', {
      p_service: 'naver_search_news',
      p_date:    kstDateString(),
      p_amount:  1,
    });
    if ((remaining as number) > NAVER_DAILY_BUDGET) {
      throw new ApiError(503, 'NAVER_BUDGET_EXHAUSTED', '오늘 뉴스 새로고침 한도가 모두 소진되었습니다');
    }

    // 4. Naver fetch + sanitize + upsert (worker pipeline 함수 재사용)
    const items = await searchNews(naver, master.name);
    const rows  = items.map((it) => mapToNewsRow(code, it));
    await upsertNews(supabase, rows);

    // 5. 갱신된 목록 반환 (GET 와 동일 로직)
    /* ... GET handler 와 동일 ... */
  } catch (e) { next(e); }
});
```

#### 8.5 rate limiter 미들웨어
- 기존 `apiRateLimiter()` (200 req/min IP-based) 가 `/api` 전체에 이미 적용됨 → **POST refresh 도 자동 적용**. 별도 추가 불필요.
- 추가 보호가 필요하면 `/refresh` 만 더 엄격한 limiter (예: 10/min IP) 를 mount 가능 — 단 per-stock 30s 쿨다운 + 글로벌 budget 으로 이미 충분.

---

### 9. Next.js 15 nested dynamic route — `/stocks/[code]/news`

**HIGH confidence — Phase 06 의 `/stocks/[code]/page.tsx` 패턴 그대로.**

#### 9.1 server/client 경계
- 기존 `webapp/src/app/stocks/[code]/page.tsx` 가 **`'use client' + use(params)` 전체 클라이언트** 모델 (STATE.md: "전체 클라이언트 경로 채택 — 스캐너와 일관, refresh 훅 단순화"). **이 결정 그대로 승계.**
- `/stocks/[code]/news/page.tsx` 도 `'use client'` + `use(params)` + `<AppShell sidebar={<AppSidebar />}>` 래핑.
- 데이터 fetch 는 mount 시 `fetchStockNews(code, ...)` (Section 10.1).

#### 9.2 not-found / error
- **`/stocks/[code]/not-found.tsx` 가 부모에 이미 존재** → nested 경로도 자동 상속 (Next 15 동작). UI-SPEC §3 명시: "404 (종목 코드 없음): Phase 6 not-found.tsx 공용 — `app/stocks/[code]/news/not-found.tsx` 작성 생략 가능".
- `error.tsx` 도 동일 — 부모 boundary 로 충분. 단, 더 세분화된 메시지 원하면 신규 `news/error.tsx` 작성 가능 (실행자 재량).

#### 9.3 page 파일 골격
```tsx
// webapp/src/app/stocks/[code]/news/page.tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { NewsPageClient } from '@/components/stock/news-page-client';

const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

export default function StockNewsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  if (!CODE_RE.test(code)) notFound();
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto w-full max-w-4xl">
        <NewsPageClient code={code} />
      </div>
    </AppShell>
  );
}
```

`NewsPageClient` 는 UI-SPEC §"Component Inventory" 의 `NewsPageClient` 신규 컴포넌트.

---

### 10. 테스트 전략 (Validation Architecture 의 일부 — Section 11 참조)

#### 10.1 Unit (vitest)

| 대상 | 파일 | 테스트 케이스 |
|---|---|---|
| `stripHtml` | `workers/news-sync/tests/sanitize.test.ts` | 빈 문자열, `<b>X</b>`, 중첩 `<i><b>X</b></i>`, 명명 entity (`&amp;`/`&quot;`/`&apos;`/`&lt;`/`&gt;`/`&nbsp;`), 숫자 entity `&#39;` `&#8217;`, hex `&#x2019;`, 한글 보존 |
| `sourceHost(originallink)` | `workers/news-sync/tests/sourceHost.test.ts` | `https://www.hankyung.com/...` → `hankyung`, `https://news.mt.co.kr/...` → `mt`, `https://m.chosun.com/...` → `chosun` (`m.` 도 strip), 잘못된 URL → `null` |
| `mapToNewsRow` | `workers/news-sync/tests/map.test.ts` | originallink 없음 → link 폴백, pubDate NaN → skip, content_hash 결정성(같은 입력 같은 hash) |
| `incr_api_usage` mock | `workers/news-sync/tests/apiUsage.test.ts` | budget 초과 시 throw, 정상 증가 시 잔여량 반환 |
| `searchNews` (axios mock) | `workers/news-sync/tests/searchNews.test.ts` | 200 정상 / 401 (즉시 throw) / 429 (BudgetExhausted throw) / 500 (retry) / 빈 items |
| `upsertNews` ON CONFLICT | `workers/news-sync/tests/upsert.test.ts` | 중복 url → skip, 신규 → insert, 카운트 반환 정확 |
| Zod `NewsListQuery` | `server/src/schemas/news.test.ts` | days clamp(8 → reject), limit clamp(200 → 100), 기본값 |

#### 10.2 Integration

- `workers/news-sync/tests/index.test.ts`: full cycle — supabase mock + axios mock + p-limit. `targets.ts` 가 top_movers + watchlists 합집합을 정확히 dedupe 하는지, budget exhausted 시 abort, per-stock 실패 격리.

#### 10.3 E2E (Playwright)

신규 `webapp/e2e/news.spec.ts` + `webapp/e2e/fixtures/news.ts`:

- `mockNewsApi(page, { listByCode: { '005930': [item1..item5] }, refreshDelayMs: 100 })`:
  - GET `/api/stocks/:code/news?...` → 200 fixture
  - POST `/api/stocks/:code/news/refresh` → 200 with new item prepended
  - 빈 상태 fixture: `[]`
  - 429 fixture: `{ error: { code: 'NEWS_REFRESH_COOLDOWN', ... }, retry_after_seconds: 25 }`
  - 5xx fixture: `503` + error envelope

테스트 시나리오:
1. `/stocks/005930` 진입 → 뉴스 5건 + footer "전체 뉴스 보기 →" 표시
2. 새로고침 클릭 → button `aria-busy="true"` → 응답 후 새 항목 prepend → 카운트다운 30s 진입
3. 카운트다운 중 다시 클릭 → button disabled 유지 (서버 호출 없음 — `request.count` 0 검증)
4. 빈 상태 → NewsEmptyState 표시 + CTA 클릭으로 refresh
5. `/stocks/005930/news` 직접 진입 → 100건 표시 (또는 fixture 한도)
6. h1 좌측 ← 클릭 → `/stocks/005930` 복귀
7. axe-core: 뉴스 Card / `/news` 페이지 / 빈 상태 / 에러 0 violation

---

### 11. Validation Architecture (Nyquist Dimension 8)

> 결정별 자동 검증 방식 — planner 의 PLAN.md `acceptance_criteria` 원천. **각 항목은 grep / vitest / SQL / Playwright 명령으로 직접 확인 가능.**

| ID | 결정 | 자동 검증 |
|---|---|---|
| V-01 | `news-sync` worker 가 master-sync 패턴 100% 준수 | `test -d workers/news-sync && test -f workers/news-sync/Dockerfile && test -f workers/news-sync/package.json` |
| V-02 | sanitize 함수 구현 + 테스트 | `pnpm -F @gh-radar/news-sync test -- sanitize.test.ts` 그린 |
| V-03 | 호출 카운터 RPC migration 적용 | `grep -l "incr_api_usage" supabase/migrations/*.sql` + `psql -c "\df incr_api_usage"` 존재 |
| V-04 | budget 초과 시 worker abort | `pnpm -F @gh-radar/news-sync test -- searchNews.test.ts` 의 budget exhausted 케이스 그린 |
| V-05 | server route 등록 | `grep -E "/api/stocks.+news" server/src/routes/stocks.ts server/src/routes/news.ts` 매치 |
| V-06 | Zod schema clamp | `pnpm -F @gh-radar/server test -- news.test.ts` 그린 + `curl -s '...?limit=999'` 응답 row 수 ≤ 100 |
| V-07 | 30s 쿨다운 응답 | `curl -X POST .../refresh` 2회 연속 → 두 번째 status=429 + body.retry_after_seconds 정수 |
| V-08 | retention 90일 | `psql -c "SELECT count(*) FROM news_articles WHERE created_at < now() - interval '90 days'"` 0 (cycle 후) |
| V-09 | 상세 페이지 뉴스 5건 + 더보기 | Playwright `news.spec.ts` 시나리오 1 |
| V-10 | `/news` 페이지 100건 하드캡 | Playwright + curl `?limit=200` 응답 ≤ 100 |
| V-11 | 짧은 도메인 prefix 출처 표시 | `pnpm -F @gh-radar/news-sync test -- sourceHost.test.ts` 그린 + Playwright DOM 검증 |
| V-12 | 외부 링크 보안 속성 | Playwright `expect(locator).toHaveAttribute('rel', /noopener.*noreferrer/)` |
| V-13 | back-nav (← 인라인) | Playwright `click('a[aria-label="종목 상세로 돌아가기"]')` → URL 일치 |
| V-14 | a11y axe | Playwright + `@axe-core/playwright` 0 violation |
| V-15 | UNIQUE(stock_code, url) ON CONFLICT 스킵 | `pnpm -F @gh-radar/news-sync test -- upsert.test.ts` (중복 inserted=0) |
| V-16 | api_usage 일자 카운트 정확 | worker 1회 실행 후 `SELECT count FROM api_usage WHERE usage_date=current_date` ≈ 종목수 |
| V-17 | Cloud Run Job 배포 | `gcloud run jobs describe gh-radar-news-sync --region=asia-northeast3` exit 0 |
| V-18 | Scheduler cron 정확 | `gcloud scheduler jobs describe gh-radar-news-sync-scheduler --location=asia-northeast3 --format='value(schedule)'` == `"*/15 * * * *"` |
| V-19 | Naver secret 미노출 | `gcloud logging read 'resource.type=cloud_run_job AND textPayload:naver_client_secret'` 매치 0 |
| V-20 | 신규 deps 정책 (date-fns-tz / sanitize-html 도입 금지) | `! grep -E "date-fns-tz|sanitize-html|striptags|dompurify" webapp/package.json server/package.json` |

#### Test Framework
| Property | Value |
|---|---|
| Frameworks | vitest 4.x (server) / vitest 3.x (workers) / vitest 2.x (webapp) / Playwright 1.59 (e2e) |
| Quick run | `pnpm -F @gh-radar/news-sync test` (~5s) |
| Server tests | `pnpm -F @gh-radar/server test` |
| Webapp tests | `pnpm -F @gh-radar/webapp test` |
| E2E | `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts` |
| Phase gate | 위 4개 + `pnpm -r typecheck` 모두 그린 |

#### Wave 0 Gaps
- [ ] `workers/news-sync/` 디렉터리 + 모든 src/tests 파일 (master-sync 복제)
- [ ] `webapp/e2e/fixtures/news.ts` (mock-api 패턴)
- [ ] `webapp/e2e/news.spec.ts`
- [ ] `server/src/schemas/news.ts` + `server/src/schemas/news.test.ts`
- [ ] `server/src/routes/news.ts` + (optional) `server/src/routes/news.test.ts` (supertest)
- [ ] `supabase/migrations/20260417xxxxxx_api_usage.sql`
- [ ] `packages/shared/src/news-sanitize.ts` (server + worker 양쪽 import — 단일 진실)

---

### 12. Security Threat Model (간략 — 자세한 표는 별도 §"Security Threat Model")

상위 5개 핵심 위협:
1. **Naver client secret 노출** — Secret Manager + Cloud Run env + pino redact + 로그 감사
2. **외부 링크 XSS / tabnabbing** — URL protocol whitelist + `rel="noopener noreferrer"` + React text escape
3. **글로벌 25K/day budget 초과로 서비스 중단** — atomic RPC counter + 안전 마진 24500
4. **악성 종목코드로 server crash / SQL injection** — Zod regex + Supabase parametric query
5. **DoS via 새로고침 abuse** — per-stock 30s cooldown + IP rate limit + budget exhaustion

자세한 내용은 §Security Threat Model 표 참조.

---

## Recommended Approach

> Planner 가 그대로 task 로 분해할 수 있는 결정 모음.

### A. Database
1. **신규 마이그레이션** `supabase/migrations/20260417xxxxxx_api_usage.sql`:
   - `api_usage(service, usage_date, count, updated_at)` PK 복합
   - RLS enable + service_role 만 (`anon`/`authenticated` 정책 미생성)
   - `incr_api_usage(p_service, p_date, p_amount)` SECURITY DEFINER 함수
2. `news_articles` 스키마는 **변경 없음** (이미 Phase 1 + 06.1 에서 완성).
3. (선택) `news_articles` 에 `idx_news_created_at` (`created_at DESC`) 추가 — retention DELETE 효율 + cooldown MAX(created_at) 효율. **권장**.

### B. Worker (`workers/news-sync/`)
1. `pnpm-workspace.yaml` 변경 없음 (`workers/*` glob 흡수).
2. `package.json` 의존성: `axios`, `pino`, `dotenv`, `@supabase/supabase-js`, `@gh-radar/shared`, **`p-limit@^7`** (신규).
3. 파일 구조 = Section 5.1 트리. master-sync 복제 후 다음만 교체:
   - `krx/` → `naver/`
   - `pipeline/map.ts` → 새 NewsRow 매핑
   - `pipeline/upsert.ts` → ON CONFLICT DO NOTHING 정책
   - `pipeline/sanitize.ts`, `pipeline/sourceHost.ts`, `pipeline/targets.ts` 신규
   - `apiUsage.ts`, `retention.ts` 신규
4. `src/index.ts` 흐름:
   ```
   loadConfig
   → supabase.from('top_movers').select('stock_code') (latest scan_id)
     ∪ supabase.from('watchlists').select('stock_code')  → dedupe
   → checkBudget()
   → p-limit(8) 으로 per-stock fetch+sanitize+upsert
   → runRetention(90)
   → log summary (counts: fetched/inserted/skipped/errors/budgetUsed)
   → exit 0
   ```
5. logger redact 경로: `*.naverClientSecret`, `*.supabaseServiceRoleKey`, `headers["X-Naver-Client-Secret"]`.

### C. 공통 모듈 — `packages/shared/`
- `packages/shared/src/news-sanitize.ts` — `stripHtml`, `extractSourcePrefix(url)`, `parsePubDate(rfc822)` 3개 순수 함수. server + worker 양쪽 import.
- `packages/shared/src/news.ts` 의 `NewsArticle` 타입에 `summary` 등 필드 추가는 **하지 않음** (Phase 9 범위).

### D. Server (`server/src/`)
1. `routes/news.ts` 신규 (Section 8.4).
2. `routes/stocks.ts` 끝에 `stocksRouter.use('/:code/news', newsRouter);` 추가.
3. `schemas/news.ts` 신규 — `StockCodeParam`, `NewsListQuery`.
4. `errors.ts` 에 `NewsRefreshCooldown(seconds)`, `NaverBudgetExhausted()` 헬퍼 추가.
5. `app.ts`:
   - `app.locals.naverClient` 주입 — `axios.create({ baseURL: NAVER_BASE_URL, headers: { 'X-Naver-Client-Id', 'X-Naver-Client-Secret' } })`.
   - 신규 ENV: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_BASE_URL` (default `https://openapi.naver.com`), `NAVER_DAILY_BUDGET=24500`.
6. `services/cors-config.ts` — exposedHeaders 에 `Retry-After` 추가 (브라우저 fetch 가 읽을 수 있도록).

### E. Webapp (`webapp/src/`)
1. `lib/stock-api.ts` 에 두 함수 추가:
   ```ts
   export function fetchStockNews(code, opts: { days?: number; limit?: number }, signal): Promise<NewsArticle[]>
   export function refreshStockNews(code, signal): Promise<NewsArticle[]>  // 429 → ApiClientError(status=429), error.retry_after_seconds 보존
   ```
   `apiFetch` 의 envelope 파서를 확장 — 429 응답 body 에 `retry_after_seconds` 가 있으면 ApiClientError 인스턴스에 보존 (현재는 code/message 만 캡처). **간단 확장: ApiClientError 에 `details?: unknown` 필드 추가.**
2. 신규 컴포넌트 6종 (UI-SPEC §Component Inventory 그대로):
   - `components/stock/stock-news-section.tsx`
   - `components/stock/news-item.tsx` (variant `card` / `full`)
   - `components/stock/news-refresh-button.tsx`
   - `components/stock/news-empty-state.tsx`
   - `components/stock/news-list-skeleton.tsx`
   - `components/stock/news-page-client.tsx`
3. `components/stock/stock-detail-client.tsx`:
   - L139-148 placeholder 영역을 `<div className="space-y-6"> <StockNewsSection stockCode={stock.code} /> <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." /> </div>` 로 교체
   - StockHero 의 종목명 좌측 ← 링크 (R5 / 03-UI-SPEC §4.4) — `<a href="/" aria-label="목록으로 돌아가기">` 인라인 추가 (StockHero 컴포넌트 수정 필요).
4. `app/stocks/[code]/news/page.tsx` 신규 (Section 9.3).
5. KST 포맷 유틸:
   - `lib/format-news-date.ts` — `formatNewsCardDate(iso)` → `"04/17 14:32"`, `formatNewsFullDate(iso)` → `"2026-04-17 14:32"`. 내부 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })` 사용. **`date-fns-tz` 미사용.**

### F. 인프라 / 배포
1. `scripts/setup-news-sync-iam.sh` — master-sync iam 스크립트 미러:
   - SA: `gh-radar-news-sync-sa` 신규
   - Secret: `gh-radar-naver-client-id`, `gh-radar-naver-client-secret` (KIS Secret 패턴 — stdin 주입)
   - Accessor: news-sync-sa → naver 시크릿 2개 + supabase-service-role
2. `scripts/deploy-news-sync.sh` — master-sync deploy 스크립트 미러:
   - Job 이름 `gh-radar-news-sync`
   - cron `*/15 * * * *` (매 15분, 24h)
   - region `asia-northeast3`, memory 512Mi, task-timeout 600s, max-retries 1, parallelism 1
   - Scheduler invoker `gh-radar-scheduler-sa`, OAuth (OIDC 금지)
3. `scripts/smoke-news-sync.sh` — `gcloud run jobs execute --wait` + Supabase row 증가 확인.
4. 서버 재배포 (`scripts/deploy-server.sh`) 시 신규 ENV `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 마운트 추가 — Secret Manager 와 Cloud Run service 둘 다 갱신.

### G. 테스트
- Section 10 의 unit/integration/E2E 그대로.
- Wave 0 에 vitest fixture / mock 인프라 작성 (mock-api.ts 의 news 패치 추가).

---

## Validation Architecture

> 위 §11 Validation Architecture (Nyquist Dimension 8) 표 참조. 모든 V-01~V-20 은 자동화 가능.

**샘플링 전략:**
- **Per task commit:** `pnpm -F @gh-radar/<scope> test --run` (대상 워크스페이스만)
- **Per wave merge:** `pnpm -r test --run && pnpm -r typecheck`
- **Phase gate:** `pnpm -r test --run && pnpm -r typecheck && pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts` 모두 그린 + `gcloud run jobs execute gh-radar-news-sync --wait` smoke 통과 + Supabase `news_articles` 행 증가 확인

**Phase Requirements → Test Map:**

| Req | Behavior | Test | 자동 명령 | 파일 |
|---|---|---|---|---|
| NEWS-01(1) | 종목별 뉴스 목록 표시 | E2E | `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts -g "list"` | ❌ Wave 0 |
| NEWS-01(2) | 제목/출처/날짜 + 원문 링크 | E2E + unit | 위 + `pnpm -F @gh-radar/news-sync test -- sourceHost.test.ts` | ❌ Wave 0 |
| NEWS-01(3) | 25K/day 한도 내 | unit + SQL | `pnpm -F @gh-radar/news-sync test -- searchNews.test.ts -g "budget"` + `psql ... api_usage` | ❌ Wave 0 |

---

## Security Threat Model

> ASVS V5 (Input Validation) + V6 (Cryptography 의 비밀 관리) + STRIDE.

### Applicable ASVS Categories

| ASVS | 적용 | 표준 통제 |
|---|---|---|
| V2 Authentication | NO | (인증 영역 변경 없음 — Phase 06.2 Supabase Auth 그대로) |
| V3 Session | NO | (변경 없음) |
| V4 Access Control | YES | RLS: news_articles SELECT anon 유지 / api_usage service_role 만 / 마스터 검증 후 행 INSERT |
| V5 Input Validation | YES | Zod (`code` 정규식, `days`/`limit` clamp), URL protocol whitelist, sanitize-html 대신 정규식 + entity decode |
| V6 Cryptography | YES | Naver client secret = GCP Secret Manager (rotation 가능), pino redact, **content_hash = sha256 단방향** (Phase 9 캐시키 — 비밀 아님) |

### Threat Patterns (STRIDE)

| # | Asset | Threat | STRIDE | Mitigation | Plan Hook |
|---|---|---|---|---|---|
| T-01 | NAVER_CLIENT_ID/SECRET | Secret 노출 (코드 commit / 로그 / env dump) | Information Disclosure | (1) GCP Secret Manager + Cloud Run `--set-secrets` (env 직접 X) (2) pino redact paths 등록 (3) `.env.example` 만 commit, `.env` `.gitignore` (4) PR diff 검사 | scripts/setup-news-sync-iam.sh + workers/news-sync/src/logger.ts + scripts/deploy-news-sync.sh |
| T-02 | news_articles.url (외부 링크) | Open Redirect / Phishing / Tabnabbing | Tampering / Spoofing | (1) `<a target="_blank" rel="noopener noreferrer">` 강제 (2) URL protocol whitelist (`https:`/`http:` 외 reject) — server map 단계 + UI render 직전 2중 (3) 로그에 url 그대로 (escape 없음 → 텍스트만 저장) | NewsItem 컴포넌트 + workers/news-sync/src/pipeline/map.ts URL 검증 |
| T-03 | news_articles.title | Stored XSS (script 주입 흡수 후 `dangerouslySetInnerHTML` 으로 노출) | Tampering | (1) DB 저장 전 stripHtml + entity decode (2) React 기본 텍스트 escape — `dangerouslySetInnerHTML` 절대 사용 금지 (3) `eslint-plugin-react/no-danger` 검사 (현 repo 미설치 — 도입 권장 또는 grep 가드) | packages/shared/src/news-sanitize.ts + grep guard CI |
| T-04 | Naver Search API | DoS via 25K/day 글로벌 budget 소진 | DoS | (1) atomic RPC counter (race-free) (2) 안전 마진 24500 (3) per-stock 30s cooldown (4) per-IP rate limit (기존) (5) cycle 시작 시 budget 사전 체크 + 잔여 < 마진 → skip | api_usage migration + Section 4 RPC + Section 8 server cooldown |
| T-05 | server/api/stocks/:code/news/refresh | 익명 사용자가 한 IP 에서 다수 종목 새로고침 폭주로 budget 빨아먹기 | DoS | (1) per-stock 30s cooldown (2) IP rate limit 200/min (이미 있음) (3) 향후: 인증 사용자만 refresh 허용 (Phase 06.2 그대로 활용 — 현재는 watchlist 만 인증 게이트, refresh 도 게이트 검토 — Open Question 3) | server/src/routes/news.ts + middleware/rate-limit.ts |
| T-06 | api_usage.count | 카운터 위변조 | Tampering | RLS: service_role 만 INSERT/UPDATE — anon/authenticated 정책 미생성 → 우회 불가 | api_usage migration |
| T-07 | server logs | 사용자 종목코드를 통한 log injection | Tampering | (1) Zod 정규식 통과한 값만 로그 (2) pino structured logging (이미 사용) — newline injection 무력화 | 기존 패턴 유지 |
| T-08 | news_articles INSERT | SQL injection | Tampering | Supabase JS SDK 의 parametric query — 직접 SQL 미사용 | 기존 패턴 유지 |
| T-09 | Naver API 응답 | 응답 무결성 (MITM) | Tampering | HTTPS only — `NAVER_BASE_URL=https://openapi.naver.com` (HTTP redirect 없음 — Naver 가 HTTP 거부) | workers/news-sync/src/naver/client.ts |
| T-10 | content_hash | 충돌로 인한 캐시 오작동 (Phase 9) | Repudiation | sha256 (충돌 확률 무시) — Phase 9 가 hash 만으로 캐시 키 사용 | packages/shared/src/news-sanitize.ts |

---

## Delta — CONTEXT R6/R7 (2026-04-17, plan review 후)

> 이 섹션은 CONTEXT.md 개정 이후 추가. 위 §Recommended Approach 의 B(Worker) 섹션이 아래 delta 를 반영하도록 갱신됐다.

### R6 (배치 주기 장중/장외 분리)
- Cloud Scheduler 1개 → **2개**
  - `gh-radar-news-sync-intraday` — `*/15 9-15 * * 1-5` (KST, 장중 평일)
  - `gh-radar-news-sync-offhours` — `0 */2 * * *` (KST, 장외 전시간)
- 두 scheduler 가 동일 `gh-radar-news-sync` Job 을 트리거. 시간대 겹침 구간에서 중복 tick 이 발생해도 `ON CONFLICT DO NOTHING` 이 흡수 — 운영 리스크 없음.

### R7 (display=100 + 페이지네이션 + 증분 종료조건)
- `naver/searchNews.ts` 시그니처 확장: `searchNews(client, query, { start?: number; display?: number })`, 기본 display=100
- 신규 `naver/collectStockNews.ts` 가 **페이지네이션 루프**를 담당:
  ```
  start = 1
  cutoff = lastSeenIso ?? firstCutoffIso(7일 전)
  while (start <= 1000):
    page = searchNews(client, q, { start, display: 100 })
    await onPage()  // budget 증가 + abort 판정, false 면 break('budget')
    if page empty: break('empty')
    for item in page:
      if parsePubDate(item) <= cutoff: hitCutoff=true
      else items.push(item)
    if hitCutoff: break('cutoff')
    if page.length < 100: break('empty')
    start += 100
  if start > 1000: stoppedBy='api-limit'
  ```
- 신규 `pipeline/lastSeen.ts` — `loadLastSeenMap(supabase, codes)` 로 종목별 `MAX(published_at)` 배치 조회 (인덱스 `idx_news_stock_published` 사용)
- 운영 호출량 추정: 주당 ≈ 50,440, 일 평균 ≈ **7,200 calls** (25K 한도의 **29%**) — 기존 77% → 완화. budget pre-check 는 그대로 유지.
- Nyquist 신규 V-ID: V-21 (param), V-22 (증분 종료), V-23 (첫 수집 7일 컷오프), V-24 (scheduler 2개) — VALIDATION.md 에 추가됨.

---

## Risks & Open Questions

### 1. 종목명 1글자 / 너무 일반적인 종목명의 노이즈
- 예: "동원" / "한미" / "삼성" — Naver Search 가 종목과 무관한 결과를 다수 반환할 수 있음.
- 본 phase 는 "v1 허용" (CONTEXT D3). Phase 9 AI 요약이 부분 완화.
- **Planner 옵션:** worker 의 query 를 `${종목명} 주가` 또는 `${종목명} 종목` 등으로 augment — 노이즈는 줄지만 hit 자체가 줄어들 수 있음. **본 phase 에선 채택 안 함, deferred 명시 권장.**

### 2. Naver per-second rate limit 미공식
- 25K/day 외에 초당 limit 이 있을 수 있다는 community 보고가 일부 — Naver 공식 가이드는 명시 안 함. p-limit(8) 은 보수적 안전선. 운영 중 429(per-second) 가 관측되면 6~4 로 낮춘다.

### 3. 익명 사용자에게 refresh 허용 vs 인증 사용자만
- 현재 webapp 은 Phase 06.2 에서 전체 로그인 필수로 전환됨. **상세 페이지 자체가 이미 인증 게이트 뒤** → server 의 `/refresh` 는 그대로 둬도 IP rate limit + cooldown + budget 으로 충분히 보호.
- Phase 9 이후 공개 페이지 도입 시 재검토.

### 4. Cloud Run Job 24h 가동 비용
- master-sync (1회/일) 와 달리 news-sync 는 **96회/일** × 평균 30~60초 실행 → 월 약 **2,880~5,760 task-minutes**. Cloud Run Job 가격 (vCPU-second 기준) 으로 환산 시 월 $1~3 수준 [ASSUMED]. 운영 중 실측 후 cron 주기 완화 가능.

### 5. `api_usage.usage_date` 의 KST 일자 경계
- 자정 직후 (KST 00:00) 에 카운터 reset. UTC 보다 9시간 빠르므로 worker 가 UTC 기반으로 `current_date` 사용하면 어긋남. **반드시 KST 기준 `today()`** (master-sync `todayBasDdKst()` 패턴 재사용).

### 6. `originallink` 가 비어있는 케이스
- Naver 가 link 만 채우는 경우 (자체 인입 뉴스 등). `url` 폴백 = `link`, `source` = `n.news.naver.com` host 파싱 → prefix `n` 이 어색. **권장: `n.news.naver.com` / `news.naver.com` 은 prefix `naver` 로 special-case mapping 1줄 추가.**

### 7. 2026-04-17 시점 Naver Search API URL/스펙 변경
- 외부 사례 모두 `https://openapi.naver.com/v1/search/news.json` 일관 — 변경 가능성 낮음 [ASSUMED]. 운영 중 4xx 다발 시 재확인.

### 8. ESLint `no-danger` 미설치
- `dangerouslySetInnerHTML` 금지가 코드 리뷰에만 의존. **Planner 가 `eslint-plugin-react` 의 `react/no-danger` 룰을 활성화하거나, CI grep guard 추가 권장.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Naver Search API latency 200~600ms | 6.1 | 너무 길면 600초 timeout 부족 — task-timeout 1200s 로 늘리면 충족 |
| A2 | Naver 응답이 항상 JSON (`/v1/search/news.json`) | 1 | XML 폴백 시 파서 추가 필요 — 사례 0건이라 무시 |
| A3 | `<b>` 외 다른 태그가 title/description 에 등장하지 않음 | 3 | 정규식이 `<[a-z]...>` 모든 태그 흡수 — script 가 들어와도 strip — 안전 |
| A4 | Cloud Run Job 24h 비용 < $5/월 | Risk 4 | 초과 시 Scheduler cron 주기 완화 (15→30분) |
| A5 | Naver 에 별도 per-second limit 미공식 (8 동시성 안전) | 6.1 | 429 관측 시 동시성 4 로 하향 — ENV 변수로 즉시 가능 |
| A6 | api_usage RLS 가 service_role 외 모두 차단 (정책 부재 시 기본 deny) | T-06 | RLS 활성 + 정책 0 = 모든 anon/authenticated 차단 — Postgres 표준 |
| A7 | webapp 의 ApiClientError 에 details 필드 추가가 비파괴적 변경 | E.1 | 기존 호출부 영향 없음 — optional |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | worker/server/webapp | ✓ | 22.x (.nvmrc=22) | — |
| pnpm | monorepo | ✓ | 10.x | — |
| Docker | Cloud Run image build | ✓ | (Phase 1~6 사용중) | — |
| gcloud CLI | Cloud Run / Scheduler / Secret Manager | ✓ | (Phase 5.1/6.1 검증) | — |
| Supabase CLI | DB migration | ✓ | (Phase 6.1/6.2 사용중) | `supabase db push` 대안 직접 SQL |
| GCP project `gh-radar` | 배포 | ✓ | 활성 | — |
| Naver Developer 계정 + Search API 등록 | API 키 발급 | ❓ | **사용자 확인 필요** | — (필수) |
| `NAVER_CLIENT_ID`/`SECRET` | worker/server 배포 | ❓ | **GCP Secret Manager 신규** | — (필수) |
| Cloud Run Job 추가 슬롯 | gh-radar-news-sync | ✓ (한도 여유) | — | — |

**Missing dependencies (블로킹):**
- Naver Search API 키 발급 — 사용자가 `developers.naver.com` → "애플리케이션 등록" → "검색" API 사용 체크 → Client ID/Secret 발급. Phase 7 첫 task 의 사람 작업으로 명시.

---

## Sources

### Primary (HIGH confidence)
- 기존 phase 06/06.1/06.2 의 RESEARCH/CONTEXT — 본 repo 내부 검증된 패턴
- `workers/master-sync/` 전체 (실측) — news-sync 복제 모델
- `server/src/routes/stocks.ts`, `server/src/app.ts`, `server/src/middleware/error-handler.ts` (실측)
- `webapp/src/components/stock/stock-detail-client.tsx`, `webapp/src/lib/api.ts`, `webapp/src/lib/stock-api.ts` (실측)
- `supabase/migrations/20260413120000_init_tables.sql` (news_articles 스키마 실측)
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql` (FK re-point 실측)
- `.planning/phases/07-news-ingestion/07-CONTEXT.md` + `07-UI-SPEC.md` (잠긴 결정 출처)

### Secondary (MEDIUM confidence)
- [Naver Open API 에러 코드 가이드 (공식)](https://naver.github.io/naver-openapi-guide/errorcode.html) — 401/429/500 분류
- [scsc3313/naver-news-search-api](https://github.com/scsc3313/naver-news-search-api) — 응답 필드 + HTML 태그 패턴
- [isnow890/naver-search-mcp](https://github.com/isnow890/naver-search-mcp) — Naver Search 통합 사례 (1.0.47, 활성 유지보수)
- [How to format dates for RSS feeds (RFC-822)](https://whitep4nth3r.com/blog/how-to-format-dates-for-rss-feeds-rfc-822/) — RFC 822 + `+0900` 포맷 검증
- [Searchapi.io Naver API docs](https://www.searchapi.io/docs/naver-api) — 파라미터 한계 (display 1~100, start 1~1000, sort sim/date)
- npm version 검증 결과 (실행): `sanitize-html@2.17.3`, `p-limit@7.3.0`, `tldts@7.0.28`, `psl@1.15.0` — 본 phase 는 sanitize-html / tldts / psl **미채택**, p-limit 만 도입.

### Tertiary (LOW — 검증 필요)
- Naver per-second rate limit (community 보고 — 공식 미공개)
- Cloud Run Job 24h 비용 추정

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 기존 phase 패턴 재사용
- Architecture: HIGH — master-sync 복제 모델 + 06 server route 패턴
- Pitfalls: HIGH — Phase 5.1/6.1 의 Cloud Run 학습 그대로 적용 (OIDC 금지, 리소스 단위 invoker, secret stdin 주입, Postgres RLS 기본 deny)
- Naver API 외부 검증: MEDIUM-HIGH — 응답 필드/포맷/한도는 다수 사례 일치, 일부 운영 변수(per-second limit) 만 LOW

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30일 — 외부 API 변경 시 재확인)

---

## RESEARCH COMPLETE
