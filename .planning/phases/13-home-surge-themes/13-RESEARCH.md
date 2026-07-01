# Phase 13: 홈 화면 — 오늘의 급등 테마 AI 분석 - Research

**Researched:** 2026-07-01
**Domain:** 사전계산→Supabase→read-only 워커 파이프라인 (Cloud Run Job + Claude Haiku bottom-up 클러스터링 + Next.js read-only 홈)
**Confidence:** HIGH (재사용 코드/스키마 선례 실물 확인 + 라이브 Supabase 데이터 probe 성공)

## Summary

이 phase 는 새로운 기술 도입이 거의 없다. gh-radar 는 이미 **theme-sync(Phase 10)** 와 **limit-up-sync(Phase 12)** 라는 두 개의 성숙한 "사전계산 워커 → Supabase 테이블 → 서버 객체계약 라우트 → webapp read-only 표시" 파이프라인을 프로덕션에 운영 중이다. home-sync 는 그 골격을 **1:1 클론**하고 (a) 신규 마이그레이션 `home_theme_snapshots`, (b) 신규 Claude 프롬프트(bottom-up 클러스터링), (c) 신규 `/api/home` 라우트, (d) 루트 페이지 교체 4가지만 새로 만든다. `[VERIFIED: codebase]` — 재사용 대상 파일 전부 실측했다.

리서치의 실제 가치는 CONTEXT.md 가 남긴 **미해결 설계 트레이드오프**를 실물 코드/데이터로 판정하는 데 있다. 핵심 결론: (1) `home_theme_snapshots` 는 **정규화 테이블이 아니라 JSON blob per row** 가 맞다 — 읽기 패턴이 "최신 스냅샷 통째로 1건 + 날짜/시점 네비 목록" 이고 limit-up 처럼 종목 상세에서 조인하는 read 가 없기 때문. (2) hash-skip 은 **새 row 를 skip 하지 말고 직전 스냅샷을 복제 append** 해야 한다 — 시점 네비에 빈 슬롯이 생기면 UX 가 깨진다. (3) cron 은 `30 9-15 * * 1-5` 로 마감(15:30) 슬롯을 자연 포함한다. (4) `/api/home` 은 limit-up 선례대로 **객체 계약**(`{ snapshot, index }`) 이다.

라이브 probe 결과 (2026-07-01 15:59 KST 장중, `stock_quotes` freshest=`06:59:35Z`): **change_rate ≥ 20% 종목이 51개**, 그 중 **42개(82%)가 news_articles 커버**, 일부는 100건 이상 뉴스 보유. 입력 토큰 규모가 충분히 작아 Claude Haiku 1회 호출이 안전하며 비용은 theme-sync(~$1.83/월) 보다 낮다.

**Primary recommendation:** theme-sync 워커를 `workers/home-sync` 로 클론 → 프롬프트만 신규 작성. `home_theme_snapshots` 를 `(trade_date, captured_at)` PK + JSONB `payload` 단일 테이블로 설계 (limit-up_tables.sql RLS/REVOKE 톤 복제). hash-skip 은 복제-append. cron `30 9-15 * * 1-5` Asia/Seoul, OAuth invoker, VPC 불필요(theme-sync 배포 패턴, intraday-sync 아님).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `home_theme_snapshots` = **시점별 row 보존**. `(date, captured_at/time-slot)` 단위 1 row. 매 :30 마다 새 스냅샷을 **append** (같은 날 덮어쓰기 아님). 장중 테마 변화 시계열 보존. ("하루 1 row 덮어쓰기" 는 폐기.)
- **D-02:** 홈 기본 뷰 = 오늘 최신(:30) 스냅샷. **v1 UI 가 날짜 + 장중 시점 둘 다 탐색** (날짜 네비 + 그 날의 9:30/10:30/… 시점 탐색 모두 v1).
- **D-03:** 비교 = 날짜/시점 전환만. **별도 side-by-side 비교 뷰 없음** (deferred).
- **D-04:** 테마당 대표 뉴스 1-2건. Claude 가 상승 이유를 가장 잘 설명하는 뉴스 1-2건 선별(제목+출처+링크). `news_articles` 의 `title`/`url` 을 **그대로 저장**(환각 방지, 입력 뉴스 중 선택만). 출처 표기.
- **D-05:** 주도 테마 정렬 = **소속 급등종목 수 desc, 동수면 평균 등락률 desc** (breadth 우선).
- **D-06:** +20% 고정 임계값. **2종목 이상 = 테마 카드, 1종목 = '개별 급등' 섹션**. 급등 없는 날 = 빈 상태. 개별/테마 판정은 Claude 클러스터링 결과 기반.
- **클러스터링 = bottom-up** — 기존 큐레이션 테마(`themes`/`theme_stocks`) 미참조, 순수 발견.
- **근거 = `news_articles`** — 신규 외부 호출 0 → 크롤링 5원칙 자연 준수(home-sync 자체 크롤링 없음).
- **갱신 = 장중 매시 :30** — Cloud Scheduler intraday(9:30~15:30, 마감직후 포함).
- **홈 = 루트(`/`) 승격** — 기존 `/scanner` 리다이렉트를 홈으로 교체. 스캐너는 `/scanner` 유지, 사이드바 NAV 2번째.
- **워커 배포** — Cloud Run Job `gh-radar-home-sync` + Scheduler **OAuth invoker (OIDC 금지)**. theme-sync `anthropic.ts` 싱글톤·config 재사용, 프롬프트만 신규.
- **RLS** — 신규 테이블 `home_theme_snapshots` 는 `TO anon, authenticated` **둘 다 명시**.
- **Haiku JSON 펜스 가드** — `extractJsonObject` 유틸 (첫 `{`~마지막 `}` 슬라이스).

### Claude's Discretion (researcher/planner/UI-SPEC 재량)
- `home_theme_snapshots` 정확 스키마 (시점별 row 키 형태, JSON blob vs 정규화 테이블). → **본 리서치가 판정: JSONB blob per row.**
- hash-skip 가드 × 시점별 row 상호작용 (skip vs 참조/복제 append). → **본 리서치가 판정: 복제 append.**
- Claude 프롬프트 설계 (bottom-up 클러스터링, JSON 계약, 테마명/상승이유/대표뉴스, 개별 급등 vs 테마 판정). → **본 리서치가 계약 초안 제시.**
- 소속 종목 카드 표시 개수(top N + "+N개") — UI-SPEC.
- 장중 시점 네비 UI 형태(슬라이더/드롭다운/탭) + 날짜 네비 형태 — UI-SPEC.
- '개별 급등' 섹션에도 뉴스 근거 부여 여부/형태.
- 등락률 source — `stock_quotes.change_rate`(scanner 동형). 장외 시간대 표시 정책.
- `home-sync` cron 정확 표현. → **본 리서치가 판정: `30 9-15 * * 1-5`.**
- `/api/home` 응답 계약. → **본 리서치가 객체 계약 초안 제시.**
- 테스트 범위 (unit/integration/E2E).

### Deferred Ideas (OUT OF SCOPE)
- 장중 시점 시계열 차트/슬라이더 고도화 (테마별 시간대 등락 그래프).
- 오늘 vs 어제 나란히-비교(side-by-side) 뷰.
- 테마 기반 알림 (v2 NOTF-*).
- 개별 급등 종목 → 동조 후보 연계 (Phase 11 재사용).
- home-sync 발견 테마를 Phase 10 시스템 테마로 승격/피드백.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 (신규) | 앱 루트(`/`) 홈 화면에 오늘 +20% 급등 종목을 bottom-up AI 클러스터링한 "오늘의 주도 테마 · 상승 이유 · 소속 종목 · 대표 뉴스" 를 시점별 스냅샷으로 표시하고, 날짜/장중 시점 네비를 제공한다. home-sync 워커가 장중 매시 :30 배치로 사전계산, 웹앱은 read-only. | 전 섹션. 스키마=§Architecture Pattern 1, 워커=§Pattern 2, AI 계약=§Pattern 3, hash-skip=§Pattern 4, cron=§Pattern 5, `/api/home`=§Pattern 6, 데이터 실측=§Data Probe |

**REQUIREMENTS.md 등록 필요:** HOME-01 신규 추가 + Traceability/커버리지 갱신 (plan Wave 0). `[ASSUMED]` — 정확한 REQUIREMENTS.md 포맷은 planner 가 기존 LIMIT-01/COMV-01 등록 패턴을 따라 확정.
</phase_requirements>

## Standard Stack

신규 라이브러리 도입 없음. 전부 기존 프로젝트 의존성 재사용.

### Core (재사용 — 신규 설치 0)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 기존 (theme-sync 사용) | Claude Haiku 호출 | `[VERIFIED: codebase]` theme-sync `anthropic.ts` 싱글톤 그대로 클론. `claude-haiku-4-5` temp=0 JSON-only |
| `@supabase/supabase-js` | 2.103.2 | service_role 쓰기 (워커) + anon/authenticated 읽기 (서버) | `[VERIFIED: node_modules/.pnpm]` 프로젝트 표준 |
| `p-limit` | 기존 | Claude 동시 호출 제어 | `[VERIFIED: codebase]` discoverThemes 사용 — **단, home-sync 는 Claude 1회 호출이라 p-limit 불필요할 수 있음** (§Pattern 3 참조) |
| `vitest` | 3.x | 워커/서버/webapp 단위 테스트 | `[VERIFIED: workers/theme-sync/package.json]` `vitest run` |
| `express` | 5.x | `/api/home` 라우트 | `[VERIFIED: codebase]` scanner/themes/limitUp 라우트 선례 |
| Next.js App Router | 15.x | 홈 페이지 (`export const dynamic='force-dynamic'`) | `[VERIFIED: webapp/src/app/scanner/page.tsx]` |

### Supporting (재사용)
| Asset | Location | Purpose |
|-------|----------|---------|
| `extractJsonObject` | `workers/theme-sync/src/ai/parseJson.ts` | `[VERIFIED: codebase]` Haiku ```json 펜스 방어. **주의: CONTEXT.md 는 `packages/shared` 라 적었으나 실제는 theme-sync 워커 로컬 파일** — home-sync 클론 시 이 파일도 함께 복사 |
| `getAnthropicClient` / `__resetAnthropicClientForTests` | `workers/theme-sync/src/ai/anthropic.ts` | `[VERIFIED: codebase]` lazy 싱글톤. 그대로 복제 |
| logger + redact | `workers/theme-sync/src/logger.ts` | 시크릿 redact (anthropic/supabase service-role) |
| `fetchQuotesChunked` / `fetchMastersChunked` / `QUOTE_CHUNK`(200) / `ROW_PAGE`(1000) | `server/src/lib/quoteJoin.ts` | `[VERIFIED: server/src/routes/themes.ts import]` `.in()` 청크 + db-max-rows 1000 페이지네이션 유틸 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONB blob per row (권장) | 정규화 4테이블 (snapshot/theme/stock/news) | §Architecture Pattern 1 에서 판정 — 읽기 패턴상 blob 우세 |
| 복제 append (권장) | hash 동일 시 row skip | §Architecture Pattern 4 — 시점 네비 빈 슬롯 회피 위해 복제 |
| Claude 1회 호출 (권장) | 뉴스 청크별 다회 호출 (theme-sync 방식) | 급등 종목 51개 규모면 단일 호출로 충분 — §Data Probe |

**Installation:** 신규 npm 설치 없음. `workers/home-sync` 는 `workers/theme-sync/package.json` 을 복제 후 name 만 교체.

**Version verification:** `[VERIFIED: workers/theme-sync/src/config.ts:92]` `classifyModel` default `"claude-haiku-4-5"` (theme-sync + discussion-sync 양쪽 동일 고정). Haiku 4.5 가격 `[CITED: CLAUDE.md §AI Summarization]` = $1.00/M input + $5.00/M output.

## Architecture Patterns

### Recommended Structure
```
workers/home-sync/                 # theme-sync 1:1 클론 (신규 외부 소스 0)
├── Dockerfile                     # theme-sync 복제 (VPC 불필요)
├── package.json                   # name: @gh-radar/home-sync
├── vitest.config.ts
└── src/
    ├── config.ts                  # theme-sync 축소 클론 (스크랩/프록시 env 제거, anthropic/supabase만)
    ├── index.ts                   # runHomeSyncCycle (아래 §Pattern 2)
    ├── logger.ts                  # redact 복제
    ├── services/supabase.ts       # createSupabaseClient 복제
    ├── ai/
    │   ├── anthropic.ts           # 싱글톤 복제 (무변경)
    │   ├── parseJson.ts           # extractJsonObject 복제 (무변경)
    │   ├── prompt.ts              # 신규 — bottom-up 클러스터링 프롬프트 (§Pattern 3)
    │   └── clusterSurges.ts       # 신규 — Claude 호출 + 파싱 + 검증 (discoverThemes 골격)
    └── pipeline/
        ├── loadSurges.ts          # 신규 — top_movers ⋈ stock_quotes ≥20 + news_articles
        ├── contentHash.ts         # theme-sync SHA256 패턴 (§Pattern 4)
        └── upsertSnapshot.ts      # 신규 — home_theme_snapshots INSERT (append)

supabase/migrations/
└── YYYYMMDDHHMMSS_home_theme_snapshots.sql   # 신규 (§Pattern 1)

server/src/
├── routes/home.ts                 # 신규 — GET /api/home (§Pattern 6)
├── mappers/home.ts                # 신규 — row → HomeSnapshotResponse
├── schemas/home.ts                # 신규 — Zod query (date?, capturedAt?)
└── app.ts                         # app.use("/api/home", homeRouter) 등록

packages/shared/src/
└── home.ts                        # 신규 camelCase 타입 (HomeThemeSnapshot/HomeSurgeTheme/HomeSurgeStock/HomeNewsRef)

webapp/src/
├── app/page.tsx                   # redirect('/scanner') → 홈 페이지로 교체
├── app/scanner/page.tsx           # 무변경 (스캐너 라우트 유지)
├── lib/home-api.ts                # 신규 — apiFetch 계약
└── components/layout/app-sidebar.tsx  # NAV: 홈 1번째, 스캐너 2번째
```

### Pattern 1: `home_theme_snapshots` 스키마 — JSONB blob per row (권장)

**판정: JSON blob per row. 정규화 4테이블 아님.**

**근거 (실제 읽기 패턴 기반):**
1. `/api/home` 의 핵심 read = "특정 `(date, captured_at)` 스냅샷 **1건 전체**를 통째로 반환" (D-02) — 테마 목록 + 각 테마의 소속 종목 + 대표 뉴스가 한 화면에 함께 표시된다. 조인 없이 한 row 를 그대로 내려주면 됨.
2. limit-up 처럼 "종목 상세에서 `theme_stocks` 를 code 로 역조회" 하는 read 가 **없다**. home-sync 스냅샷은 종목 상세 어디에서도 조인되지 않는다 (홈 전용). 정규화의 유일한 이점(교차 조인)이 불필요.
3. 시점 네비 목록 read = `(date, captured_at)` 키 + 요약 메타(테마 수/종목 수)만 필요 — payload 없이 컬럼만 SELECT.
4. Claude 출력이 이미 nested JSON(테마→종목→뉴스)이라 blob 저장이 매핑 0. 정규화하면 워커가 4테이블 트랜잭션 분해 + 서버가 재조립 — 순손실.
`[VERIFIED: codebase]` limit-up 은 종목상세 조인 read 때문에 정규화했지만(`theme_stocks` ⋈), home 은 그 read 가 없어 상황이 다르다.

**권장 DDL (limit_up_tables.sql 톤 복제 — BEGIN/COMMIT · 공개 read RLS · 컬럼 주석):**
```sql
-- YYYYMMDDHHMMSS_home_theme_snapshots.sql
-- Phase 13 (HOME-01): 홈 급등 테마 시점별 스냅샷 (bottom-up AI 클러스터링 결과).
--   D-01: (trade_date, captured_at) 단위 append (덮어쓰기 아님) → 장중 테마 변화 시계열 보존.
--   Claude 출력이 nested JSON(테마→종목→뉴스)이라 payload jsonb blob 단일 테이블 (정규화 불요 —
--   종목상세 조인 read 없음, 홈 전용 통짜 read).
--   Pitfall(feedback_supabase_rls_authenticated): RLS TO anon, authenticated 둘 다 명시.
BEGIN;

CREATE TABLE home_theme_snapshots (
  trade_date    date        NOT NULL,               -- KST 거래일 (Asia/Seoul)
  captured_at   timestamptz NOT NULL,               -- :30 슬롯 캡처 시각 (KST 정각 :30)
  theme_count   int         NOT NULL DEFAULT 0,      -- 네비 목록용 요약 (payload 없이 SELECT)
  stock_count   int         NOT NULL DEFAULT 0,      -- 급등 종목 총수 (테마+개별)
  content_hash  text        NOT NULL,                -- 급등집합+뉴스 SHA256 (hash-skip 가드, §Pattern 4)
  is_carried    boolean     NOT NULL DEFAULT false,  -- 직전 스냅샷 복제 append 여부 (§Pattern 4)
  payload       jsonb       NOT NULL,                -- { themes:[...], singles:[...], threshold:20, market_status:'open'|'closed' }
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, captured_at)
);

-- 네비: 최신 스냅샷 (captured_at DESC) + 날짜별 목록.
CREATE INDEX idx_home_snapshots_captured ON home_theme_snapshots (captured_at DESC);
CREATE INDEX idx_home_snapshots_date     ON home_theme_snapshots (trade_date DESC, captured_at DESC);

-- RLS — 공개 read (TO anon, authenticated 둘 다 — default-deny 함정 회피).
ALTER TABLE home_theme_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_home_theme_snapshots"
  ON home_theme_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
```
`[VERIFIED: supabase/migrations/20260628120000_limit_up_tables.sql]` — RLS 패턴/톤/주석 스타일 복제 기준. `[VERIFIED: 20260515163000_fix..._rls_authenticated.sql]` — `TO anon, authenticated` 정확 구문.

**payload JSON 형태 (권장, Claude 출력과 1:1):**
```jsonc
{
  "threshold": 20,
  "marketStatus": "open",        // open|closed (장외 시간 표시 정책, §Data Contract)
  "themes": [                    // D-05: 종목수 desc, 동수면 평균등락률 desc 로 워커가 정렬 후 저장
    {
      "name": "초전도체",
      "reason": "LK-99 재현 실험 성공 보도로 관련주 동반 급등",   // Claude 요약
      "stocks": [                // D-06: 2+ 종목
        { "code": "294630", "name": "서남", "changeRate": 29.9 },
        { "code": "004920", "name": "덕성", "changeRate": 24.1 }
      ],
      "news": [                  // D-04: 1-2건, title/url 입력에서 선택만 (환각 금지)
        { "title": "초전도체 테마 급등…", "url": "https://...", "source": "한국경제" }
      ]
    }
  ],
  "singles": [                   // D-06: 1종목 = 개별 급등 섹션
    {
      "code": "347700", "name": "스피어", "changeRate": 20.1,
      "reason": "스페이스X 밸류체인 편입 소식",
      "news": [ { "title": "...", "url": "https://...", "source": "..." } ]
    }
  ]
}
```

**Anti-Pattern:** 정규화 4테이블 (`home_snapshot` / `home_theme` / `home_theme_stock` / `home_news`). 홈이 조인 read 를 안 하므로 순수 오버헤드. (limit-up 은 종목상세 조인 때문에 정규화가 옳았지만 home 은 반대.)

### Pattern 2: home-sync cycle (theme-sync index.ts 골격 축소 클론)

**흐름 (theme-sync `runThemeSyncCycle` 골격 — 스크랩/프록시/backoff 제거, 급등+뉴스 로드로 교체):**
```
1. loadConfig() + service_role Supabase (theme-sync 복제)
2. loadSurges(): top_movers ⋈ stock_quotes 에서 change_rate >= 20 종목 로드
   + 각 종목 news_articles (stock_code IN (...) 청크, published_at DESC, per-code 상위 K건)
3. contentHash = SHA256(급등 code 집합 정렬 + 뉴스 id/title 집합)  ← theme-sync computeContentHash 패턴
4. 직전 (오늘 최신) 스냅샷 조회 → hash 동일?
   YES → 직전 payload 복제 append (is_carried=true), Claude 호출 skip (§Pattern 4)
   NO  → clusterSurges(): Claude Haiku 1회 → 파싱/검증 → payload 조립 → append (is_carried=false)
5. upsertSnapshot: INSERT (trade_date, captured_at, ...) — PK 충돌 시 DO NOTHING (같은 슬롯 재실행 idempotent)
6. summary 로그 (themeCount/stockCount/skippedHash/claudeCalled)
```
`[VERIFIED: workers/theme-sync/src/index.ts]` — hash 동일 시 write skip + try/catch AI 격리 패턴 존재. home-sync 는 스크랩 소스가 없어 backoff/프록시/`isBlockSignal` 전부 제거 → **훨씬 단순**. 5원칙 완전 무관(외부 크롤링 0, 순수 DB read + Claude).

**config.ts 축소 (theme-sync 대비 제거/유지):**
- 제거: `brightdata*`, `alphaApiBase`, `naverThemeBase`, `themeSyncMaxPages`, `alphaCategories`, backoff 관련.
- 유지: `supabaseUrl`, `supabaseServiceRoleKey`, `anthropicApiKey`, `classifyModel`(="claude-haiku-4-5"), `logLevel`, `appVersion`.
- 신규: `surgeThreshold`(default 20), `newsPerStock`(default 5, 토큰 상한), `surgeMax`(급등종목 하드캡, 예: 80).

### Pattern 3: Claude Haiku bottom-up 클러스터링 프롬프트 계약 (핵심)

**재사용 골격 (`clusterSurges.ts`):** discoverThemes.ts 의 Claude 호출 셰이프를 복제 —
```ts
// discoverThemes.ts:261 셰이프 (VERIFIED)
const res = await client.messages.create({
  model: cfg.classifyModel,     // "claude-haiku-4-5"
  max_tokens: 2048,             // 클러스터 목록 — discover(1024)보다 크게 (종목/뉴스 배열 포함)
  temperature: 0,
  system: CLUSTER_SYSTEM_PROMPT,
  messages: [ ...fewShot, { role: "user", content: formatClusterMessage(surges) } ],
});
const first = res.content.find((c) => c.type === "text");
const text = first && first.type === "text" ? first.text.trim() : "";
const jsonStr = extractJsonObject(text);   // 펜스 가드 (VERIFIED parseJson.ts)
```
`[VERIFIED: workers/theme-sync/src/ai/discoverThemes.ts:253-281]` — 이 호출/파싱/펜스가드 셰이프 그대로.

**입력 계약 (user 메시지):** 급등 종목 리스트 + 각 종목의 뉴스 title/description.
```
급등종목 (오늘 +20% 이상):
- 294630 서남 (+29.9%)
  뉴스: 초전도체 테마 급등…서남 상한가 [url1] | LK-99 재현 기대 [url2]
- 004920 덕성 (+24.1%)
  뉴스: 덕성, 초전도체 관련주 부각 [url3]
- 347700 스피어 (+20.1%)
  뉴스: 스페이스X 밸류체인 편입 [url4]
```

**출력 JSON 계약 (system 프롬프트로 강제):**
```jsonc
{
  "themes": [
    {
      "name": "초전도체",                 // 테마명 생성 규칙: 급등을 잇는 공통 이슈를 2~10자 한글로
      "reason": "LK-99 재현 실험 성공 보도", // 상승이유 1~2문장, 입력 뉴스 근거만
      "stockCodes": ["294630", "004920"],  // D-06: 2+ 종목만 테마
      "newsRefs": [0, 1]                    // D-04: 입력 뉴스의 인덱스만 선택 (환각 방지 — 아래 주석)
    }
  ],
  "singles": [
    { "stockCode": "347700", "reason": "스페이스X 밸류체인 편입", "newsRefs": [3] }  // 1종목
  ]
}
```

**환각 방지 설계 (D-04 핵심 — 중요):** Claude 에게 URL/제목을 **생성시키지 말고**, 입력 뉴스에 **번호(인덱스)를 매겨** 넘긴 뒤 **인덱스만 선택**하게 한다. 워커가 인덱스→실제 `news_articles.title/url/source` 로 해석해 payload 에 박제. 이렇게 하면 Claude 가 URL 을 지어낼 수 없다. (discoverThemes 가 "회사명→code 를 마스터로 해석"(LLM code 추정 약점 회피)한 것과 동일 철학 — `[VERIFIED: discoverThemes.ts:135 resolveNamesToCodes]`.) 마찬가지로 `stockCodes` 도 입력에 준 code 중에서만 고르게 하고, 워커가 급등집합에 없는 code 는 드롭.

**정렬 (D-05):** Claude 출력 후 **워커가 정렬**한다 (LLM 정렬 신뢰 금지). `themes` 를 `stockCodes.length desc`, 동수면 소속 종목 평균 change_rate desc 로 재정렬 후 저장. 개별 급등(`singles`)은 change_rate desc.

**개별 vs 테마 판정 (D-06):** system 프롬프트에 "2개 이상 종목이 같은 이유로 오르면 themes, 홀로 오르면 singles" 명시. 워커가 사후 검증 — `stockCodes.length < 2` 인 theme 은 single 로 강등, 급등집합에 없는 code 제거 후 재판정.

**few-shot:** discoverThemes 처럼 2건 (정상 클러스터 1 + 급등 없음 `{"themes":[],"singles":[]}` 1). `[VERIFIED: prompt.ts:26 DISCOVER_FEW_SHOT]` 패턴.

**호출 횟수:** **Claude 1회** 권장. 급등 종목 51개 × 뉴스 5건 = 입력 ~255 뉴스 라인. theme-sync 는 하루 전체 뉴스(~300건)를 60건 청크로 5회 나눴지만, home-sync 는 급등 종목만이라 규모가 작아 단일 호출로 전체 맥락을 한 번에 본다(클러스터링은 전역 뷰가 필요 — 청크 나누면 같은 테마가 청크별로 쪼개짐). p-limit 불필요.

**토큰/비용 추정 `[VERIFIED: Data Probe]`:**
- 입력: 51 종목 × (헤더 ~20토큰 + 뉴스 5건 × ~40토큰) ≈ 51 × 220 ≈ **11,200 input 토큰** + system/few-shot ~1,500 = **~13k input**.
- 출력: 테마 ~10개 × (이름+이유+배열) ≈ **~1,500 output 토큰**.
- 1회 비용 = 13k × $1/M + 1.5k × $5/M = $0.013 + $0.0075 ≈ **$0.02/호출**.
- 하루 슬롯 = 9:30~15:30 매시 :30 = **7슬롯/일**. hash-skip 으로 실제 Claude 호출은 변화 있는 슬롯만 (~3-5회/일 추정).
- 월 = 7슬롯 × 22영업일 × $0.02 = **~$3.1/월 상한** (hash-skip 적용 시 ~$1.5/월). theme-sync ~$1.83/월 과 동급. `[ASSUMED]` 실제 급등 종목 수/뉴스 밀도는 날마다 변동 — planner 가 POC 로 1슬롯 실측(theme-sync 10-06 POC 선례).

### Pattern 4: hash-skip 가드 × 시점별 row — 복제 append (권장)

**판정: hash 동일 시 새 row 를 skip 하지 말고 직전 스냅샷 payload 를 복제해 append (is_carried=true).**

**근거:** D-02 가 "장중 시점 네비(9:30/10:30/…)를 v1 UI 에서 탐색" 을 요구한다. hash 동일 슬롯을 skip 하면 시점 네비에 **빈 슬롯**이 생겨 "11:30 을 눌렀는데 데이터 없음" 이 된다 — 시계열 연속성 파괴. 직전 payload 를 복제하면 모든 :30 슬롯이 채워져 네비가 연속적이고, Claude 비용은 그대로 0 (호출 skip). 저장 중복(같은 payload 반복)은 payload 크기가 작아(테마 수십 개) 무시 가능.

**theme-sync 와의 차이:** `[VERIFIED: theme-sync/src/index.ts:206-225]` theme-sync 는 hash 동일 시 **upsert 자체를 skip**(테이블이 "현재 상태" 단일본이라 안 써도 됨). 하지만 home 은 "시점별 append 이력" 이라 반드시 row 가 있어야 함 → **복제 append 로 분기**. 이것이 D-01(시점별 보존) × hash-skip 의 상호작용 해법.

**구현:**
```ts
const prev = await fetchLatestSnapshotToday(supabase, tradeDate);  // captured_at DESC limit 1
const hash = computeContentHash(surges, news);
if (prev && prev.content_hash === hash) {
  // 복제 append — Claude 호출 0, payload 그대로, is_carried=true
  await insertSnapshot({ tradeDate, capturedAt: slotNow, ...prev, content_hash: hash, is_carried: true });
} else {
  const payload = await clusterSurges(...);   // Claude 1회
  await insertSnapshot({ ..., payload, content_hash: hash, is_carried: false });
}
```

**시점 네비에서 skip 슬롯 처리 (`/api/home` index):** 복제 append 를 쓰므로 네비 목록에 **모든 슬롯이 존재**한다. `is_carried=true` 슬롯은 UI 가 "직전과 동일" 뱃지를 달지 여부만 선택(UI-SPEC 재량). 빈 슬롯 개념 자체가 없어짐. `[ASSUMED]` — is_carried 뱃지 표시는 UI-SPEC 결정.

### Pattern 5: home-sync cron — `30 9-15 * * 1-5` Asia/Seoul (권장)

**판정: `30 9-15 * * 1-5` (분=30, 시=9~15). `0,30` 아님.**

**근거:** CONTEXT.md 는 "매시 **:30**" (9:30·10:30···15:30). `30 9-15 * * 1-5` = 9:30, 10:30, 11:30, 12:30, 13:30, 14:30, **15:30** — 정확히 7슬롯, **마감(15:30) 슬롯 자연 포함**. `0,30 9-15` 는 정각(:00)도 트리거해 요구와 불일치. `[VERIFIED: scripts/deploy-intraday-sync.sh:123]` 는 `* 9-15 * * 1-5`(매분)를 쓰지만 그건 매분 갱신 워커라 다름. home 은 :30 만.

**마감 슬롯 시맨틱:** 15:30 = 정규장 마감(15:30 KST) 직후 슬롯. 이 슬롯이 "오늘의 최종 급등 테마" 가 되어 장 마감 후~다음날 개장 전까지 홈 기본 뷰로 표시된다. `stock_quotes` 는 마감 후 최종 change_rate 를 보유(intraday-sync 마지막 cycle).

**배포 (theme-sync 패턴 복제 — VPC 불필요):**
- Cloud Run Job `gh-radar-home-sync`, `--memory=512Mi`, `--task-timeout` 은 theme-sync(600s)보다 짧아도 됨(Claude 1회) — **120s 권장**. `--max-retries=1`.
- **VPC/Static IP 불필요** — home-sync 는 Supabase + Anthropic 만 호출(외부 IP whitelist 무관). `[VERIFIED]` theme-sync 도 VPC 없음(scripts/deploy-theme-sync.sh 에 `--network` 없음). intraday-sync 의 VPC 스택은 키움 whitelist 전용이라 복제 대상 아님.
- Scheduler `gh-radar-home-sync-cron`, `--schedule="30 9-15 * * 1-5"`, `--time-zone="Asia/Seoul"`, **`--oauth-service-account-email`** (OIDC 금지, Phase 05.1 Pitfall 2). `[VERIFIED: deploy-theme-sync.sh:180 / deploy-intraday-sync.sh:127]`.
- Secret 재사용 (신규 0): `gh-radar-anthropic-api-key`, `gh-radar-supabase-service-role`. `[VERIFIED: STATE.md Phase 10 — 기존 Secret 3종 재사용]`.
- SA: `gh-radar-home-sync-sa` (신규, 최소권한 — anthropic + supabase-service-role accessor 2건) + 기존 `gh-radar-scheduler-sa` invoker 바인딩.

### Pattern 6: `/api/home` 응답 — 객체 계약 (limit-up 선례)

**판정: 배열 아닌 객체 `{ snapshot, index }`.** `[VERIFIED: server/src/routes/limitUp.ts:111]` limit-up 이 `{ hero, events, themes }` 객체 계약을 씀 (comovement 배열 드리프트 회피). home 도 동일.

**라우트 셰이프 (limitUp.ts + themes.ts 혼합):**
```ts
// GET /api/home?date=2026-07-01&capturedAt=2026-07-01T02:30:00Z
// - 파라미터 없음 → 오늘 최신 스냅샷 (captured_at DESC limit 1)
// - date 만 → 그 날 최신 슬롯
// - date + capturedAt → 정확한 슬롯
export const homeRouter = Router();
homeRouter.get("/", async (req, res, next) => {
  const { date, capturedAt } = HomeQuery.parse(req.query);  // Zod, 둘 다 optional
  const supabase = req.app.locals.supabase;

  // 1. 대상 스냅샷 1건 (payload 포함)
  let q = supabase.from("home_theme_snapshots")
    .select("trade_date,captured_at,theme_count,stock_count,is_carried,payload");
  if (capturedAt) q = q.eq("captured_at", capturedAt);
  else if (date)  q = q.eq("trade_date", date);
  const { data: snap } = await q.order("captured_at", { ascending: false }).limit(1).maybeSingle();

  // 2. 네비 인덱스 — payload 없이 메타만 (최근 N일 슬롯 목록)
  const { data: idx } = await supabase.from("home_theme_snapshots")
    .select("trade_date,captured_at,theme_count,stock_count,is_carried")
    .order("captured_at", { ascending: false })
    .limit(200);   // 최근 ~30영업일 × 7슬롯

  res.setHeader("Cache-Control", "no-store");  // scanner/themes/limitUp 동형
  res.json({
    snapshot: snap ? mapSnapshot(snap) : null,   // null = 빈 상태 (급등 없는 날 / 데이터 없음)
    index: (idx ?? []).map(mapIndexEntry),        // 날짜/시점 네비 목록
  });
});
```

**등락률 source (Claude's Discretion 판정):** payload 안의 `changeRate` 는 **스냅샷 캡처 시점의 `stock_quotes.change_rate`** 를 박제(정적). 홈은 "그 시점에 뭐가 왜 올랐나" 의 시계열 기록이므로 실시간 재조인하면 안 된다(과거 슬롯 조회 시 오늘 시세로 오염). limit-up 이 시세 조인을 의도적으로 안 한 것과 동일 철학. `[VERIFIED: limitUp.ts:22 "정적 이력 — 시세 조인/재계산 0"]`.

**장외 시간대 표시 정책:** `payload.marketStatus` = `open`|`closed` (워커가 캡처 시각으로 판정, 15:30 슬롯 이후 = closed). UI 가 "장 마감 — 오늘의 최종 급등" 등 문구 분기. `[ASSUMED]` — 정확 문구는 UI-SPEC.

**빈 상태:** 급등 종목 0 (급등 없는 날) 또는 스냅샷 없음(장 시작 전) → `snapshot=null` 또는 `payload.themes=[] & singles=[]`. UI "오늘은 +20% 급등 종목이 없습니다"(D-06).

**app.ts 등록:** `app.use("/api/home", homeRouter)` — rate-limit 미들웨어 뒤. `[VERIFIED: server/src/app.ts 패턴]`.

### Anti-Patterns to Avoid
- **정규화 4테이블 스키마** (§Pattern 1) — 조인 read 없는데 오버헤드.
- **hash 동일 시 row skip** (§Pattern 4) — 시점 네비 빈 슬롯.
- **payload changeRate 실시간 재조인** (§Pattern 6) — 과거 슬롯이 오늘 시세로 오염.
- **Claude 에게 URL/제목 생성 요청** (§Pattern 3) — 환각. 인덱스 선택만.
- **Claude 정렬 신뢰** (§Pattern 3) — 워커가 D-05 정렬.
- **VPC 스택 복제** (§Pattern 5) — home-sync 는 IP whitelist 무관, theme-sync 배포(VPC 없음) 복제.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Haiku ```json 펜스 파싱 | 정규식 JSON 추출 | `extractJsonObject` (theme-sync 로컬 복제) | `[VERIFIED]` Phase 10 라이브 버그(펜스로 발굴 0건) 수정 유틸 |
| Anthropic client 재초기화 | 매 호출 `new Anthropic()` | `getAnthropicClient` 싱글톤 | `[VERIFIED: anthropic.ts]` lazy + 테스트 reset |
| `.in()` 1000행 절단 | 단일 `.in(codes)` | `fetchQuotesChunked` / `ROW_PAGE` 페이지네이션 | `[VERIFIED: quoteJoin.ts]` PostgREST db-max-rows 1000 침묵 절단 (themes 0종목 버그 클래스) |
| 회사명→code / 뉴스 근거 해석 | LLM 이 code/url 생성 | 입력 인덱스/이름 → DB 해석 (resolveNamesToCodes 철학) | `[VERIFIED: discoverThemes.ts:135]` LLM 은 code/url 지어냄 |
| Cloud Run Job + Scheduler OAuth | 새 배포 스크립트 | deploy-theme-sync.sh 복제 | `[VERIFIED]` OIDC 금지 Pitfall 이미 반영 |

**Key insight:** home-sync 는 "새 코드" 가 아니라 "theme-sync 에서 스크랩/프록시/backoff 를 도려내고 프롬프트를 갈아끼운 것" 이다. 새로 짜는 표면적이 극히 작다.

## Runtime State Inventory

> rename/refactor 아님(greenfield 기능 추가). 단, 루트 라우트 교체가 있어 그 영향만 명시.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 없음 — 신규 테이블만 생성, 기존 데이터 rename 0. `[VERIFIED: probe]` | 없음 |
| Live service config | Cloud Scheduler 신규 1개 생성(`gh-radar-home-sync-cron`). 기존 스케줄러 미변경. | 신규 등록(§Pattern 5) |
| OS-registered state | 없음 | 없음 |
| Secrets/env vars | 기존 Secret 2종 재사용(`gh-radar-anthropic-api-key`, `gh-radar-supabase-service-role`) — 신규 0. `[VERIFIED: STATE.md]` | 신규 SA `gh-radar-home-sync-sa` accessor 바인딩만 |
| Build artifacts | `webapp/src/app/page.tsx` 가 `redirect('/scanner')` → 홈 렌더로 교체. **기존 `/scanner` 라우트/북마크는 유지** (교체 아님). `[VERIFIED: page.tsx:9]` | page.tsx 교체 + sidebar NAV 재정렬 |

**루트 교체 회귀 주의:** `page.tsx` 가 현재 서버 리다이렉트라 이걸 홈 페이지로 바꾸면 기존 "`/` 접속 → `/scanner`" 동작이 사라진다. 이건 의도된 변경(홈 승격). `/scanner` 직접 접속은 계속 동작. E2E 로 회귀 확인 필요(§Validation).

## Common Pitfalls

### Pitfall 1: PostgREST 1000행 침묵 절단 (뉴스 로드)
**What goes wrong:** `news_articles.in('stock_code', codes)` 가 급등 종목 뉴스 총합 >1000 이면 통째로 잘림.
**증거:** `[VERIFIED: Data Probe]` 51 종목 뉴스 쿼리가 정확히 1000행에서 잘림(probe 에서 후반 code 카운트 0 관측). 실제 커버리지는 더 높음.
**How to avoid:** per-stock 상위 K건(예: 5)으로 제한 후 `.in()` 청크 — `fetchQuotesChunked` 패턴. 종목별 `published_at DESC` 상위 K 를 서브쿼리 아닌 per-code fetch 또는 code 청크 + 앱단 상위K 컷.
**Warning signs:** 후반 급등 종목이 뉴스 0건으로 관측되는데 실제로는 있음.

### Pitfall 2: RLS `TO anon` 만 명시 → 로그인 유저 default-deny
**What goes wrong:** 신규 테이블에 `TO anon` 만 쓰면 authenticated(Google 로그인) 유저가 0행.
**How to avoid:** `TO anon, authenticated` 둘 다. `[VERIFIED: 메모리 feedback_supabase_rls_authenticated + 20260515163000 마이그레이션]`.

### Pitfall 3: 과거 슬롯 시세 오염
**What goes wrong:** `/api/home` 이 payload 의 changeRate 를 실시간 stock_quotes 로 재조인하면 어제 11:30 슬롯이 오늘 시세로 표시됨.
**How to avoid:** payload changeRate 를 캡처 시점 값으로 박제(정적). 재조인 금지(§Pattern 6).

### Pitfall 4: Claude 환각 URL/제목
**What goes wrong:** Claude 가 그럴듯한 가짜 뉴스 URL 생성 → 출처 추적성 파괴 + 5원칙 출처표기 위반.
**How to avoid:** 입력 뉴스에 인덱스 부여 → 인덱스만 선택 → 워커가 실 title/url 해석(§Pattern 3, D-04).

### Pitfall 5: Cloud Scheduler OIDC 사용
**What goes wrong:** OIDC 인증으로 Job 트리거 시 실패.
**How to avoid:** `--oauth-service-account-email` 전용. `[VERIFIED: Phase 05.1 Pitfall 2, deploy-theme-sync.sh]`.

### Pitfall 6: 클러스터링을 뉴스 청크로 나눔
**What goes wrong:** theme-sync 처럼 뉴스를 60건 청크로 나눠 다회 호출하면 같은 테마가 청크마다 쪼개져 재발굴(theme-sync 가 collapseNearDuplicates 로 후처리한 이유).
**How to avoid:** home-sync 는 급등 종목만이라 규모가 작음 → **Claude 1회 전역 호출**로 전체 급등을 한 번에 클러스터(§Pattern 3).

## Code Examples

### 급등 종목 + 뉴스 로드 (scanner.ts + Pitfall 1 회피)
```ts
// Source: server/src/routes/scanner.ts (top_movers ⋈ stock_quotes) + quoteJoin 청크
// 1. change_rate >= 20 종목 (stock_quotes 직접 필터 — probe 검증)
const { data: hi } = await supabase.from("stock_quotes")
  .select("code,change_rate").gte("change_rate", 20);
const codes = hi.map(r => r.code);
// 2. 마스터 name/market (chunk) + 3. 뉴스 per-code 상위 K (chunk, published_at DESC)
//    Pitfall 1: 단일 .in() 금지 — 청크 + 앱단 상위 K 컷
```

### content hash (theme-sync 패턴)
```ts
// Source: workers/theme-sync/src/pipeline/contentHash.ts (SHA256 hex → 변경감지)
// home: 급등 code 정렬 + 뉴스 id/title 집합을 SHA256. 직전 슬롯과 비교 → 복제 append 분기.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/` → redirect('/scanner') | `/` = 홈(급등 테마) 페이지 | Phase 13 | 앱 첫 인상이 "오늘 뭐가 왜 올랐나" |
| 큐레이션 테마(themes/theme_stocks) 조회 | bottom-up AI 순수 발견 | Phase 13 | Phase 10 시스템 테마와 다른 축 |

**Deprecated/outdated:** 없음 — 기존 파이프라인 확장.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude 1회 호출 비용 ~$0.02/슬롯, 월 ~$1.5-3.1 | §Pattern 3 | 급등 종목/뉴스 밀도 변동 시 상향 — planner POC 1슬롯 실측 권장(theme-sync 10-06 선례) |
| A2 | is_carried 뱃지 UI 표시 여부 | §Pattern 4/6 | 없음 — UI-SPEC 재량 |
| A3 | marketStatus open/closed 문구 | §Pattern 6 | 없음 — UI-SPEC 재량 |
| A4 | HOME-01 REQUIREMENTS.md 등록 포맷 | §Phase Requirements | 낮음 — 기존 LIMIT-01 패턴 복제 |
| A5 | newsPerStock=5, surgeMax=80 등 튜닝값 | §Pattern 2/3 | 낮음 — env override 가능, POC 조정 |

**Claude 클러스터링 정확도(테마명/개별판정)** 는 `[ASSUMED]` — theme-sync POC 가 "GOOD(HBM/온디바이스AI 등 실 KR 테마)" 였으나 bottom-up 급등 클러스터링은 다른 태스크. planner 가 POC 게이트 필수(§Validation).

## Open Questions (RESOLVED)

1. **뉴스 없는 급등 종목(9/51=18%) 처리**
   - What we know: probe 상 227100/139050/35320K 등 뉴스 0건. `[VERIFIED: probe]`
   - What's unclear: 뉴스 근거 없는 급등을 개별 급등에 "이유 미상" 으로 넣을지, 제외할지.
   - Recommendation: singles 에 `reason=null` 로 포함(급등 사실은 유효). Claude 가 근거 없으면 reason 비움. UI 가 "상승 이유 뉴스 미발견" 표시.
   - **RESOLVED:** reason=null 로 두고 카드에 근거 없이 표시(뉴스 있는 종목만 verbatim 근거). Plan 02 interfaces 반영 완료.

2. **12:30 슬롯 (점심시간)**
   - What we know: `30 9-15` 은 12:30 포함. 한국장은 12시 휴장 없음(연속). `[ASSUMED]`
   - Recommendation: 그대로 포함 — 연속장이라 12:30 도 유효 데이터.
   - **RESOLVED:** 포함 (cron `30 9-15 * * 1-5` 이 12:30 커버). Plan 02 interfaces 반영 완료.

3. **content_hash 에 뉴스 포함 시 민감도**
   - What we know: 뉴스가 1건만 추가돼도 hash 변동 → Claude 재호출.
   - Recommendation: hash 를 급등 code 집합 + 뉴스 **개수/최신 id** 정도로(전체 title 아님) — 과민 재호출 억제. planner 튜닝.
   - **RESOLVED:** 급등종목 코드 집합 + 뉴스 개수/최신 news id 를 해시 입력에 포함(전체 title 제외). Plan 02 interfaces(contentHash) 반영 완료.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (prod) | 워커 read/write + 서버 read | ✓ | PostgREST | — |
| Anthropic API (Haiku) | 클러스터링 | ✓ (Secret `gh-radar-anthropic-api-key` 재사용) | claude-haiku-4-5 | — |
| GCP Cloud Run Job + Scheduler | 배포 | ✓ (theme-sync 선례) | — | — |
| `news_articles` 데이터 | AI 근거 | ✓ 42/51 급등 종목 커버 | — | 뉴스 없는 종목은 reason=null |
| `top_movers`/`stock_quotes` | 급등 종목 소스 | ✓ intraday-sync 매분 갱신 | — | — |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** 뉴스 미커버 급등 종목(18%) → reason=null 개별 급등(Open Q1).

## Validation Architecture

> nyquist_validation=true (config.json). 포함.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (워커/서버) + Playwright (webapp E2E) |
| Config file | `workers/home-sync/vitest.config.ts` (theme-sync 복제), `webapp/playwright.config.ts` (기존) |
| Quick run command | `pnpm --filter @gh-radar/home-sync test` |
| Full suite command | `pnpm -r test` (워커+서버+webapp) + `pnpm --filter webapp e2e` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| HOME-01 | 급등 클러스터 파싱 (Claude JSON → payload) | unit | `pnpm --filter @gh-radar/home-sync test` (clusterSurges.test) | ❌ Wave 0 |
| HOME-01 | 정렬 D-05 (종목수 desc, 동수 평균등락 desc) | unit | 위 (sort.test) | ❌ Wave 0 |
| HOME-01 | 개별/테마 판정 D-06 (2+ vs 1) | unit | 위 (classify.test) | ❌ Wave 0 |
| HOME-01 | 뉴스 인덱스→title/url 해석 (환각 방지) | unit | 위 (resolveNews.test) | ❌ Wave 0 |
| HOME-01 | hash-skip 복제 append (is_carried) | unit | 위 (contentHash.test) | ❌ Wave 0 |
| HOME-01 | 스냅샷 INSERT + RLS anon/authenticated read | integration | `pnpm --filter server test` (supabase mock) | ❌ Wave 0 |
| HOME-01 | `/api/home` 객체 계약 { snapshot, index } | integration | `pnpm --filter server test` (home.route.test, supertest) | ❌ Wave 0 |
| HOME-01 | `/` 홈 표시 + 날짜/시점 네비 + 빈 상태 | E2E | `pnpm --filter webapp e2e` (home.spec.ts) | ❌ Wave 0 |
| HOME-01 (회귀) | `/scanner` 직접 접속 여전히 동작 | E2E | 위 (scanner.spec 기존) | ✅ 기존 |
| HOME-01 (POC) | Claude 클러스터링 정확도/비용 게이트 | manual POC | 워커 1슬롯 실 실행 (theme-sync 10-06 선례) | ❌ Wave |

### Sampling Rate
- **Per task commit:** `pnpm --filter @gh-radar/home-sync test` (< 10s)
- **Per wave merge:** `pnpm -r test` (전 워크스페이스)
- **Phase gate:** 전 suite green + Playwright home.spec + **Claude POC 게이트**(비용/정확도) → `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `workers/home-sync/vitest.config.ts` + `src/**/*.test.ts` — HOME-01 unit (파싱/정렬/판정/hash)
- [ ] `server/src/routes/home.route.test.ts` — `/api/home` 객체계약 + RLS
- [ ] `webapp/e2e/specs/home.spec.ts` — 홈 표시/네비/빈상태
- [ ] Claude POC 스크립트 — 1슬롯 실 클러스터링 (정확도/비용 게이트, planner [BLOCKING] task)
- [ ] Framework install: 없음 (theme-sync vitest 복제)

## Security Domain

> security_enforcement absent = enabled. 포함.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 홈은 공개 read (anon 허용) |
| V3 Session Management | no | 상태 없음 |
| V4 Access Control | yes | RLS `TO anon, authenticated` read-only. 워커만 service_role 쓰기 (사용자 쓰기 경로 없음) |
| V5 Input Validation | yes | `/api/home` Zod (date/capturedAt) — scanner/limitUp 선례. Claude 출력은 워커에서 code/url 검증(급등집합/입력뉴스 대조) |
| V6 Cryptography | no | SHA256 은 콘텐츠 변경감지용(보안 아님), 표준 crypto |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Claude 환각 URL 표시 | Tampering (근거 위조) | 인덱스 선택만 + 워커가 실 news_articles 대조 (§Pattern 3, D-04) |
| 로그인 유저 default-deny | DoS(자기) | RLS TO anon, authenticated 둘 다 (Pitfall 2) |
| 시크릿 로그 노출 | Info Disclosure | logger redact(anthropic/supabase service-role) theme-sync 복제 |
| 급등집합 밖 code 주입 | Tampering | 워커가 payload code 를 급등 code 집합으로 필터 (§Pattern 3 사후검증) |
| PostgREST error.message 노출 | Info Disclosure | 서버 라우트 generic error(next(e)) — scanner/limitUp 동형 |

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: codebase]` workers/theme-sync/src/{index,config,ai/anthropic,ai/prompt,ai/discoverThemes,ai/parseJson}.ts — 재사용 골격
- `[VERIFIED: codebase]` server/src/routes/{scanner,themes,limitUp}.ts — 라우트 객체계약 + 청크조인
- `[VERIFIED: codebase]` supabase/migrations/{20260628120000_limit_up_tables, 20260609120000_theme_tables, 20260415120000_split_stocks, 20260413120000_init, 20260515163000_fix..._rls_authenticated}.sql — 스키마/RLS 복제 기준
- `[VERIFIED: codebase]` scripts/{deploy-intraday-sync,deploy-theme-sync}.sh — cron/OAuth/VPC 판정
- `[VERIFIED: codebase]` webapp/src/app/page.tsx + components/layout/app-sidebar.tsx — 루트/NAV 교체 지점
- `[VERIFIED: Data Probe 2026-07-01]` 라이브 Supabase: change_rate≥20 = 51종목, 뉴스 42/51 커버, freshest quote 06:59:35Z
- `[CITED: CLAUDE.md §AI Summarization]` Haiku 4.5 $1/$5, temp=0 JSON-only 정책
- `[CITED: STATE.md Phase 10/12]` theme-sync/limit-up 배포 선례, Secret 재사용, POC 게이트

### Secondary (MEDIUM confidence)
- `[CITED: 메모리 feedback_supabase_rls_authenticated]` RLS TO anon, authenticated
- `[CITED: 메모리 feedback_parallel_wave_worktree]` 병렬 Wave worktree 분리 (plan 참고)

### Tertiary (LOW confidence)
- 없음 — 전 claim VERIFIED/CITED.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 전부 기존 재사용, 실물 확인
- Architecture (스키마/hash/cron/라우트): HIGH — limit-up/theme-sync 선례 실측 + 판정 근거 명확
- AI 프롬프트 계약: MEDIUM — 골격/셰이프 VERIFIED, 클러스터링 정확도는 POC 필요(A-log)
- Data probe: HIGH — 라이브 실측 성공
- Pitfalls: HIGH — 대부분 프로젝트 라이브 버그 이력

**Research date:** 2026-07-01
**Valid until:** 2026-07-31 (내부 코드/스키마 기반, 안정. 단 급등 종목 수는 매일 변동 — POC 시 재측정)

## RESEARCH COMPLETE

**Phase:** 13 - home-surge-themes
**Confidence:** HIGH

### Key Findings
- home-sync 는 신규 코드가 아니라 **theme-sync 클론에서 스크랩/프록시/backoff 제거 + 프롬프트 교체** — 표면적 극소.
- **스키마 판정: JSONB blob per row** (`(trade_date, captured_at)` PK). 홈은 조인 read 가 없어 정규화 불필요 (limit-up 과 반대 상황).
- **hash-skip 판정: 복제 append (is_carried)** — 시점 네비 빈 슬롯 회피 (theme-sync 의 write-skip 과 분기).
- **cron 판정: `30 9-15 * * 1-5` Asia/Seoul** — 마감 15:30 슬롯 자연 포함. VPC 불필요(theme-sync 배포 복제, intraday-sync 아님).
- **AI 계약: Claude 1회 전역 호출 + 뉴스 인덱스 선택(환각방지) + 워커 정렬(D-05)/판정(D-06)**. 비용 ~$1.5-3.1/월.
- **라이브 probe: 급등(≥20%) 51종목, 뉴스 82% 커버** — 입력 규모 작아 단일 호출 안전.

### File Created
`.planning/phases/13-home-surge-themes/13-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | 전부 기존 재사용, 실물 확인 |
| Architecture | HIGH | limit-up/theme-sync 선례 실측 + 판정 근거 명확 |
| AI 프롬프트 | MEDIUM | 셰이프 VERIFIED, 클러스터링 정확도 POC 필요 |
| Pitfalls | HIGH | 프로젝트 라이브 버그 이력 |

### Open Questions
- 뉴스 없는 급등 종목(18%) 처리 (reason=null 권장)
- content_hash 민감도 튜닝 (뉴스 개수/최신 id 권장)
- Claude 클러스터링 정확도 — planner POC 게이트 필수

### Ready for Planning
Research 완료. Planner 가 PLAN.md 작성 가능. 권장 Wave: (0)테스트 인프라+마이그레이션+HOME-01 등록 → (1)home-sync 워커(loadSurges+clusterSurges+hash+upsert) → (2)`/api/home` 라우트+shared 타입 → (3)홈 페이지 UI(UI-SPEC 게이트)+네비 → (4)루트/사이드바 교체 → (5)배포+POC 게이트+E2E.
