# Phase 10: Theme Classification — Research

**Researched:** 2026-06-09
**Domain:** 2-소스 테마 스크랩 파이프라인 + 시스템/유저 테마 데이터 모델 + AI 보강 + /themes UI (한국 주식 테마 분류)
**Confidence:** HIGH (스크랩 소스 2종 실측 검증 / 모든 재사용 패턴 코드 확인 / 모델·버전 검증)

> **provenance 표기:** `[VERIFIED: <tool>]` 세션 내 도구로 확인 · `[CITED: <url>]` 공식 문서 참조 · `[ASSUMED]` 학습지식(미검증, 사용자/플래너 확인 필요). 모든 `[ASSUMED]` 는 §Assumptions Log 에 집계.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 ~ D-16 — 연구는 이 결정 안에서만 수행)

**데이터 모델 / 소유**
- **D-01:** 시스템 테마(전역 read-only 스크랩) vs 유저 테마(per-user CRUD) **분리** — 별도 row 집합으로 충돌 제거. (위키식 전역 편집안 폐기)
- **D-02:** 한 종목 = 여러 테마 (M:N). `theme_stocks` 조인. 시스템·유저 모두 다중 매핑.
- **D-03:** 시스템 `theme_stocks` 행은 `source`(naver/alphasquare/ai), `confidence`, `effective_from`/`effective_to`(편입·제외 이력) 보존.
- **D-04:** 유저 테마는 본인 소유·본인만 조회/편집 (watchlist 와 동일 per-user + owner-only RLS). 스크래퍼 절대 미접근.
- **D-05:** **fork = 스냅샷 복사** — 그 시점 멤버십을 유저 테마로 복제 후 독립(시스템 갱신 전파 없음). 빈 테마 신규도 가능.

**수집 / 스크래핑**
- **D-06:** 소스 2-tier — (1) 네이버 금융 테마 `finance.naver.com/sise/theme.naver`(EUC-KR, ~265, 산업/이벤트), (2) 알파스퀘어 `alphasquare.co.kr/home/theme-factor`(정치/시사 보강).
- **D-07:** 수집 = **직접 fetch 먼저 → 429/403 차단 감지 시 Bright Data 프록시 폴백**.
- **D-08:** `workers/theme-sync` 신규 — Cloud Run Job + Cloud Scheduler **일 1회 16:00 KST**, OAuth invoker. master-sync/news-sync 템플릿 복제.
- **D-09:** 변경 감지 = 콘텐츠 **SHA256 해시**, 동일 콘텐츠면 DB write 스킵. 시스템 테마 이름/설명/멤버십은 스크랩 항상 갱신.
- **D-10:** **이름 정규화 후 병합** — 네이버↔알파스퀘어 동일/유사 테마명 병합, 종목 합집합, `source` 다중 태그. **초기 자동 병합은 보수적**(확실한 정규화만), 애매하면 분리 유지.
- **D-11:** 운영 5원칙 준수(CLAUDE.md) — 일 1회 배치 캡 / 24h 캐싱+해시 / on-demand fetch 금지(서버측 배치만) / 429·403 즉시 24h backoff / 출처 표기+부분 캐싱(전체 DB 덤프 금지).

**AI 보강**
- **D-12:** Claude Haiku 4.5 로 (a) 뉴스(`news_articles`) 기반 신규 시스템 테마 후보 발굴, (b) 종목↔테마 오분류 교정. discussion-sync classify 패턴 재사용. **AI 결과도 시스템 테마 레이어**(source=ai)로만, 유저 테마와 분리.

**UI**
- **D-13:** /themes 구성 = **내 테마 상단 고정** + 그 아래 시스템 테마.
- **D-14:** 정렬 = **테마 소속 종목 중 등락률 상위 3종목의 평균 등락률 내림차순**. source = `stock_quotes`(장중)/일봉 close(장외).
- **D-15:** 테마 클릭 → 별도 페이지 `/themes/[id]`. 종목 행 = **scanner row 재사용**. 종목 클릭 → `/stocks/[code]`.
- **D-16:** 종목 상세 `/stocks/[code]` 에 "이 종목의 테마" 칩 — 시스템 테마 + 로그인 유저의 내 테마 모두. 칩 클릭 → `/themes/[id]`.

### Claude's Discretion (planner/researcher 재량 — 본 연구가 권장안 제시)
- 테이블 정확 스키마(단일 vs 분리), `theme_stocks` provenance 형태 → **§Architecture Pattern 1 권장**
- 이름 정규화 알고리즘 구체(공백/특수문자/동의어 사전 범위) → **§Architecture Pattern 4 권장**
- "상위 3종목 평균 등락률" 계산·캐싱 위치 → **§Architecture Pattern 5 권장**
- 등락률 source 분기(장중/장외) → **§Architecture Pattern 5 권장**
- 알파스퀘어 DOM 파싱 selector / theme id 추출 → **§Architecture Pattern 3 (DOM 불필요, JSON API 발견)**
- AI 보강 트리거 주기/프롬프트/source 라벨 → **§Architecture Pattern 6 권장**
- fork 스냅샷 시 effective 이력 복사 범위 → **§Architecture Pattern 7 권장**
- /themes 빈/로딩/에러 상태, 유저 편집 UI 형태, 종목 칩 overflow → **§Architecture Pattern 8 권장**
- 테스트 범위(unit/integration/E2E) → **§Validation Architecture**

### Deferred Ideas (OUT OF SCOPE — 절대 연구·계획 금지)
- 테마 기반 알림(v2 NOTF-*) / 테마 간 상관·상한가 동조 분석(Phase 11+) / 유저 테마 공유·공개 / 테마 트렌드 시계열 차트 / 이름 정규화 동의어 사전 고도화(운영 중 개선)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **THEME-01** | 테마 매핑 수집 (2-tier, 일 1회 16:00 KST, SHA256 해시, 5원칙) | §Pattern 2(네이버 파서 실측) + §Pattern 3(알파스퀘어 JSON API 실측) + §Pattern 9(직접→프록시 폴백) + §Don't Hand-Roll(worker 템플릿) + §Environment Availability |
| **THEME-02** | /themes 목록 + 테마별 종목 표시 (내 테마 상단 + 시스템, 상위3평균 정렬, scanner row, 칩) | §Pattern 5(정렬 계산) + §Pattern 8(UI) + §Code Examples(PostgREST embed / scanner-table 재사용) |
| **THEME-03** | 유저 테마 CRUD + fork (per-user owner-only RLS, watchlist 복제) | §Pattern 1(스키마) + §Pattern 7(fork) + §Code Examples(watchlist 스택 1:1 복제) + §Pitfall 3(RLS authenticated) |
| **THEME-04** | AI 테마 보강 (Claude Haiku 4.5, 뉴스 기반 발굴 + 오분류 교정, 시스템 레이어) | §Pattern 6(AI 설계) + §Don't Hand-Roll(classify 모듈 재사용) + §Pitfall 7(AI 비용/오분류) |
</phase_requirements>

## Summary

이 phase 는 큰 phase 지만, gh-radar 의 기존 7개 워커/페이지 선례 덕에 **거의 모든 구성요소가 검증된 복제 패턴**으로 환원된다. 핵심 리스크 3개(네이버 EUC-KR HTML 구조, 알파스퀘어 SSR/SPA 여부, 직접→프록시 폴백 인터페이스)는 이번 세션에서 **실측으로 모두 해소**했다.

**가장 큰 발견 2가지:**
1. **알파스퀘어는 CONTEXT D-06 의 "SSR" 가정과 달리 Vue SPA(S3 호스팅)다.** 그러나 DOM 파싱이 불필요 — **공개·무인증 JSON API** `https://api.alphasquare.co.kr/theme/v2/all-themes`(451 테마, 27 카테고리, alias 포함) + `/theme/v2/themes/{id}/stocks`(종목 code 배열) 를 직접 발견했다. Phase 8 의 PIVOT(cheerio→Naver JSON API) 과 동일한 패턴 — DOM scraping 보다 훨씬 견고. `[VERIFIED: curl]`
2. **네이버 테마는 robots.txt 가 `/sise/` 를 명시 Allow** 한다(`Disallow: /` 후 `Allow: /sise/`). 토론방(`/item/board.naver?...&page=*`)과 달리 테마 페이지(`/sise/theme.naver`, `/sise/sise_group_detail.naver`)는 robots.txt 허용 영역 — Phase 8 토론방보다 법적 리스크가 **낮다**. HTML 구조(`table.type_1.theme` 목록, `table.type_5` 상세, `/item/main.naver?code={6자리}` 종목 링크, `?page=N` 페이지네이션 ~7페이지)도 실측 확인. `[VERIFIED: curl + iconv]`

**Primary recommendation:** 데이터 모델은 **단일 `themes` 테이블(+`owner_id` nullable + `is_system` 플래그) + 단일 `theme_stocks`(provenance 컬럼 포함)** 로 통합(§Pattern 1). 스크랩은 네이버=EUC-KR HTML 파싱(cheerio), 알파스퀘어=JSON API 직접 호출, 둘 다 직접 fetch→429/403 시 Bright Data 폴백. 워커는 master-sync 디렉터리 1:1 복제 + discussion-sync 의 proxy/client + classify 모듈 임포트. 유저 테마는 watchlist 스택(테이블/RLS/api/hook/UI) 그대로 복제. Wave 7개로 분할(§Wave 분할).

## Standard Stack

> 이 phase 는 신규 외부 라이브러리가 거의 없다 — 기존 워크스페이스 의존성 재사용이 원칙. 신규 1개(cheerio)만 추가.

### Core (이미 설치됨 — 재사용)
| Library | Version (검증) | Purpose | Why Standard |
|---------|------|---------|--------------|
| `@supabase/supabase-js` | `^2.49.0` | 워커 service-role 쓰기 + 웹앱 anon/authenticated 읽기 | 전 워커 표준 `[VERIFIED: package.json]` |
| `axios` | `^1.7.0` | 네이버/알파스퀘어 직접 fetch + Bright Data 프록시 | master-sync/discussion-sync 표준 `[VERIFIED: package.json]` |
| `@anthropic-ai/sdk` | `^0.65.0` | AI 보강 (Claude Haiku 4.5) | discussion-sync classify 와 동일 `[VERIFIED: package.json]` |
| `p-limit` | `^7.0.0` | AI 호출 동시성 제어 (default 5) | discussion-sync classify 표준 `[VERIFIED: package.json]` |
| `pino` | `^9.0.0` | 구조화 로깅 + redact | 전 워커 표준 `[VERIFIED: package.json]` |
| `zod` | (server/worker 기설치) | 스크랩 응답 검증 + server 라우트 쿼리 검증 | discussion-sync fetchDiscussions 선례 `[VERIFIED: fetchDiscussions.ts]` |
| `dotenv` | `^16.4.0` | 로컬 dev env | 워커 표준 `[VERIFIED: package.json]` |

### Supporting (신규 1개)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cheerio` | `^1.0.0` | 네이버 테마 **HTML 파싱** (목록 anchor + 상세 종목 테이블) | 네이버는 EUC-KR HTML(JSON API 없음) → cheerio 필요. 알파스퀘어는 JSON API 라 cheerio 불필요. `[ASSUMED: cheerio 1.0 안정]` — Phase 8 POC 에서 cheerio 가 폐기됐지만 그건 토론방이 SPA 였기 때문이고, 네이버 테마는 진짜 SSR HTML 임(실측). `[VERIFIED: curl]` |
| `iconv-lite` | `^0.6.3` | EUC-KR → UTF-8 변환 (네이버 응답) | 네이버 `content-type: text/html;charset=EUC-KR` 실측 확인 → 필수. `[VERIFIED: curl 헤더]` |

> **주의:** `axios` 로 EUC-KR 페이지 fetch 시 `responseType: 'arraybuffer'` 로 받아 `iconv.decode(buf, 'EUC-KR')` 해야 한다. `responseType: 'text'` 면 axios 가 UTF-8 로 강제 디코딩해 한글이 깨진다(§Pitfall 2).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 알파스퀘어 JSON API 직접 호출 | DOM 파싱 (cheerio/playwright) | **JSON API 압승** — SPA 라 DOM 은 헤드리스 브라우저 필요(Cloud Run 부적합). JSON API 는 무인증 공개 + 구조화 + alias 제공. `[VERIFIED: curl]` |
| cheerio (네이버) | playwright/puppeteer | 네이버 테마는 진짜 SSR HTML → 헤드리스 불필요. cheerio 가 가볍고 Cloud Run 적합. `[VERIFIED: curl]` |
| `node-html-parser` | cheerio | cheerio 가 jQuery-like selector + 한국 스크래핑 생태계 표준. 프로젝트에 이미 멘탈모델 존재(Phase 8 RESEARCH). |
| 단일 `themes`+플래그 | `themes`/`user_themes` 분리 테이블 | §Pattern 1 에서 단일 권장(이유 상술). 분리는 `theme_stocks` 도 2개로 쪼개야 해 조인·UI 복잡도 2배. |

**Installation:**
```bash
# workers/theme-sync (신규 워크스페이스) package.json 에 추가
pnpm -F @gh-radar/theme-sync add cheerio iconv-lite
# 나머지(@supabase/supabase-js axios @anthropic-ai/sdk p-limit pino zod dotenv)는 master-sync/discussion-sync 에서 복사
```

**Version verification:** `[VERIFIED]` Anthropic Haiku 4.5 = model id `claude-haiku-4-5`, $1/M in + $5/M out (2026 기준 동일). `[CITED: platform.claude.com/docs/en/about-claude/pricing]` · `[VERIFIED: WebSearch]`. cheerio/iconv-lite 버전은 플래너가 `npm view cheerio version` 으로 최종 확정 권장(현재 안정 메이저는 cheerio 1.x, iconv-lite 0.6.x). `[ASSUMED]`

## Architecture Patterns

### Recommended Project Structure (신규/변경 파일)
```
supabase/migrations/
└── YYYYMMDDHHMMSS_theme_tables.sql          # themes + theme_stocks + user 정책 (Wave 1)

packages/shared/src/
├── theme.ts                                  # camelCase 타입: Theme, ThemeStock, ThemeWithStats ... (Wave 1)
└── index.ts                                  # re-export 추가

workers/theme-sync/                           # master-sync 1:1 복제 (Wave 2)
├── Dockerfile                                # master-sync Dockerfile 복사 → master-sync→theme-sync 치환
├── package.json                              # +cheerio +iconv-lite +@anthropic-ai/sdk +p-limit
├── vitest.config.ts
├── src/
│   ├── index.ts                              # runThemeSyncCycle (master-sync runMasterSync 패턴)
│   ├── config.ts                             # SUPABASE + BRIGHTDATA + ANTHROPIC + tuning env
│   ├── logger.ts retry.ts                    # 워커 표준 복사 (redact 경로 포함)
│   ├── services/supabase.ts                  # service-role 클라이언트
│   ├── scrape/
│   │   ├── fetchWithFallback.ts              # 직접 axios → 429/403 시 fetchViaProxy (§Pattern 9)
│   │   ├── naver/parseThemeList.ts           # cheerio: table.type_1.theme → {no,name}[]
│   │   ├── naver/parseThemeDetail.ts         # cheerio: table.type_5 → stock code[]
│   │   ├── naver/fetchNaverThemes.ts         # 목록 페이지네이션 + 상세 N (직접→폴백)
│   │   └── alphasquare/fetchAlphaThemes.ts   # JSON API all-themes + /{id}/stocks (직접→폴백)
│   ├── merge/normalizeName.ts                # 보수적 정규화 (§Pattern 4)
│   ├── merge/mergeThemes.ts                  # 네이버 ∪ 알파 정규화-키 병합
│   ├── pipeline/upsertThemes.ts             # themes + theme_stocks effective UPSERT (§Pattern 1)
│   ├── pipeline/computeStats.ts             # 상위3평균 precompute (§Pattern 5)
│   ├── ai/                                    # discussion-sync/src/classify 복제 + 변형 (§Pattern 6)
│   │   ├── anthropic.ts                       # SDK 싱글톤 (복사)
│   │   ├── discoverThemes.ts                  # 뉴스 기반 신규 테마 후보 (POC)
│   │   └── correctMembership.ts              # 종목↔테마 오분류 교정 (POC)
│   └── scrapeState.ts                        # 429/403 24h backoff 상태 (api_usage 테이블 재사용, §Pattern 9)

server/src/
├── routes/themes.ts                          # GET /api/themes, GET /api/themes/:id (Wave 3)
├── schemas/themes.ts                         # Zod 쿼리
├── mappers/theme.ts                          # row→camelCase
└── app.ts                                     # app.use('/api/themes', themesRouter) 추가

webapp/src/
├── app/themes/page.tsx                       # AppShell+AppSidebar+ThemesClient (Wave 4)
├── app/themes/[id]/page.tsx                  # Next15 use(params) (Wave 4)
├── components/theme/                          # themes-client / theme-detail-client / theme-card / theme-chips / empty/skeleton/error
├── lib/theme-api.ts                           # 시스템=Express fetch, 유저=Supabase 직접 CRUD (§Pattern 1)
├── hooks/use-themes-query.ts                  # useWatchlistQuery 복제 (60s 폴링)
├── components/stock/stock-detail-client.tsx   # 테마 칩 섹션 1줄 삽입 (D-16)
└── components/layout/app-sidebar.tsx          # /themes nav 추가

scripts/                                       # master-sync 스크립트 1:1 복제 (Wave 6)
├── setup-theme-sync-iam.sh deploy-theme-sync.sh smoke-theme-sync.sh
```

### Pattern 1: 단일 테이블 + 플래그 (시스템/유저 통합) — **권장**

**What:** `themes` 1개 테이블에 `owner_id uuid NULL`(시스템=NULL, 유저=auth.uid()) + `is_system boolean` 으로 두 레이어를 구분. `theme_stocks` 1개 테이블에 provenance 컬럼. RLS 가 두 레이어를 동시 처리.

**When to use:** D-01(분리) 의 의도는 "스크랩↔편집 충돌 0" 인데, 이는 **테이블 분리가 아니라 RLS + owner_id NULL 분기**로 동일하게 달성된다. 단일 테이블이 우월한 이유:
- `theme_stocks` 조인이 1개로 유지 — 분리 시 `theme_stocks`+`user_theme_stocks` 2개 → /themes 목록(시스템+유저 혼합 정렬), 종목 칩(시스템+유저 동시 조회)이 모두 UNION 쿼리가 됨.
- fork(D-05) 가 같은 테이블 내 INSERT-SELECT 로 단순(§Pattern 7).
- watchlist 선례의 owner-only RLS 패턴을 그대로 쓰되, 시스템 read 정책만 추가.

**근거:** 스캐너 3-테이블 분리(`stocks`/`stock_quotes`/`top_movers`)는 **역할(존재/시세/랭킹)이 달라서** 분리했지만, 시스템·유저 테마는 **구조가 동일**(이름+종목 집합)하고 소유권만 다르다 → 컬럼 플래그가 정석. `[VERIFIED: split_stocks 마이그레이션 비교]`

**DDL 스케치 (플래너가 마이그레이션으로 구체화):**
```sql
BEGIN;

-- 1) themes — 시스템(owner_id NULL) + 유저(owner_id=auth.uid()) 통합
CREATE TABLE themes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  owner_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- 시스템=NULL
  -- 정규화 병합 키 (시스템 전용, §Pattern 4) — 동일 norm_key 끼리 1개 시스템 테마로 병합
  norm_key    text,
  -- 다중 출처 태그 (시스템): {naver, alphasquare, ai}
  sources     text[] NOT NULL DEFAULT '{}',
  -- 정렬 precompute (§Pattern 5): 상위3 평균 등락률 + 계산 시각
  top3_avg_change_rate numeric(10,4),
  stats_updated_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 무결성: 시스템이면 owner NULL, 유저면 owner NOT NULL
  CONSTRAINT themes_owner_consistency CHECK (
    (is_system AND owner_id IS NULL) OR (NOT is_system AND owner_id IS NOT NULL)
  )
);
-- 시스템 테마 norm_key 유니크 (병합 보장). 유저 테마는 norm_key NULL → partial unique.
CREATE UNIQUE INDEX uq_themes_system_norm ON themes (norm_key) WHERE is_system;
CREATE INDEX idx_themes_owner ON themes (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_themes_system_sort ON themes (top3_avg_change_rate DESC NULLS LAST) WHERE is_system;

-- 2) theme_stocks — M:N + provenance (D-02, D-03)
CREATE TABLE theme_stocks (
  theme_id     uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  stock_code   text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,  -- FK: 존재 종목만
  source       text NOT NULL DEFAULT 'naver',     -- naver|alphasquare|ai|user
  confidence   numeric(4,3),                       -- 0~1 (AI/스크랩 신뢰도, nullable)
  reason       text,                               -- 네이버 '편입 사유' info_txt (§Pattern 2)
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,                      -- NULL=현재 편입중, 값=제외된 시점
  PRIMARY KEY (theme_id, stock_code)               -- 현재 편입 1행 (이력은 effective_to 로)
);
CREATE INDEX idx_theme_stocks_code ON theme_stocks (stock_code);          -- 종목 칩 역조회 (D-16)
CREATE INDEX idx_theme_stocks_active ON theme_stocks (theme_id) WHERE effective_to IS NULL;

-- 3) RLS — 시스템 read(전역) + 유저 owner-only CRUD (watchlist 선례)
ALTER TABLE themes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_stocks ENABLE ROW LEVEL SECURITY;

-- 시스템 테마: 누구나 읽기 (anon + authenticated 둘 다 — Pitfall 3)
CREATE POLICY "read_system_themes" ON themes
  FOR SELECT TO anon, authenticated USING (is_system = true);
-- 유저 테마: 본인만 읽기
CREATE POLICY "read_own_themes" ON themes
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
-- 유저 테마: 본인만 생성/수정/삭제 (is_system 강제 false — WITH CHECK)
CREATE POLICY "insert_own_themes" ON themes
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND is_system = false);
CREATE POLICY "update_own_themes" ON themes
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() AND is_system = false)
  WITH CHECK (owner_id = auth.uid() AND is_system = false);
CREATE POLICY "delete_own_themes" ON themes
  FOR DELETE TO authenticated USING (owner_id = auth.uid() AND is_system = false);

-- theme_stocks: 부모 theme 의 가시성/소유를 따라감 (EXISTS 서브쿼리)
CREATE POLICY "read_theme_stocks" ON theme_stocks
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM themes t WHERE t.id = theme_id
            AND (t.is_system OR t.owner_id = auth.uid()))
  );
CREATE POLICY "write_own_theme_stocks" ON theme_stocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM themes t WHERE t.id = theme_id
                 AND t.owner_id = auth.uid() AND NOT t.is_system))
  WITH CHECK (EXISTS (SELECT 1 FROM themes t WHERE t.id = theme_id
                 AND t.owner_id = auth.uid() AND NOT t.is_system));
-- 주의: 시스템 theme_stocks 쓰기는 service_role(워커)만 — RLS bypass. 유저는 위 정책으로 본인 것만.

COMMIT;
```

**Anti-Pattern:** 시스템 `theme_stocks` 쓰기 정책을 authenticated 에 부여 — 유저가 시스템 테마 멤버십을 조작할 수 있게 됨. **시스템 쓰기는 워커 service_role 만**(RLS bypass).

> `[ASSUMED]` 이 DDL 은 권장 스케치 — 플래너가 watchlist 마이그레이션 톤(주석·BEGIN/COMMIT·trigger)에 맞춰 최종화. `theme_stocks` 에 유저 테마 50종목 제한 trigger 를 watchlist `enforce_watchlist_limit` 패턴으로 추가 권장(§Pitfall 5). `[VERIFIED: watchlists.sql 패턴]`

### Pattern 2: 네이버 금융 테마 스크랩 (EUC-KR HTML, cheerio) — **실측 검증**

**What:** 2단계 — (1) 목록 페이지에서 테마 ID+이름 추출, (2) 각 테마 상세에서 종목 code 추출.

**실측 구조 `[VERIFIED: curl + iconv 2026-06-09]`:**
- **목록** `GET /sise/theme.naver?page={N}` — `content-type: text/html;charset=EUC-KR`. 테마 행 = `table.type_1.theme` 내부 `<a href="/sise/sise_group_detail.naver?type=theme&no={ID}">{테마명}</a>`. 페이지당 ~40개. **페이지네이션 = `?page=N`, ~7페이지(총 ~265 테마)**. page 7, 8 모두 25개 동일 반환 → **page 7 이 마지막**(이후 clamp/중복). 마지막 페이지 감지: 직전 페이지와 theme ID 집합이 같으면 stop, 또는 페이지 콘텐츠 해시 중복 시 stop.
- **목록 col**: `col_type1`(등락률) 등 테마-레벨 평균 등락률도 목록에 있으나 — **우리는 §Pattern 5 로 stock_quotes 기반 자체 계산**하므로 네이버 등락률은 무시(데이터 신선도·일관성).
- **상세** `GET /sise/sise_group_detail.naver?type=theme&no={ID}` — 종목 테이블 = `table.type_5`. 종목 행 = `td.name > div.name_area > a[href="/item/main.naver?code={6자리}"]{종목명}`. **code 6자리가 `stocks.code` 와 직접 매칭**(005930 등). 예: HBM(no=536) = 33종목.
- **보너스 — 편입 사유**: 상세 각 종목에 `div.info_layer_wrap > p.info_txt` 로 "이 종목이 왜 이 테마인가" 설명문 존재 → `theme_stocks.reason` 에 저장 권장(AI 오분류 교정 §Pattern 6 의 입력으로 유용). `[VERIFIED: curl 089030 테크윙 info_txt 확인]`

**Example (cheerio 파서 골격):**
```typescript
// scrape/naver/parseThemeList.ts  — Source: 실측 HTML 구조 [VERIFIED]
import * as cheerio from 'cheerio';
export function parseThemeList(html: string): Array<{ no: string; name: string }> {
  const $ = cheerio.load(html);
  const out: Array<{ no: string; name: string }> = [];
  $('table.type_1.theme a[href*="sise_group_detail.naver?type=theme"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/no=(\d+)/);
    const name = $(el).text().trim();
    if (m && name) out.push({ no: m[1], name });
  });
  return out; // dedupe by no
}
// scrape/naver/parseThemeDetail.ts
export function parseThemeDetail(html: string): Array<{ code: string; name: string; reason: string | null }> {
  const $ = cheerio.load(html);
  const out: Array<{ code: string; name: string; reason: string | null }> = [];
  $('table.type_5 td.name').each((_, td) => {
    const a = $(td).find('a[href*="/item/main.naver?code="]');
    const href = a.attr('href') ?? '';
    const m = href.match(/code=([0-9A-Za-z]{6})/);
    if (!m) return;
    const reason = $(td).closest('tr').find('p.info_txt').first().text().trim() || null;
    out.push({ code: m[1], name: a.text().trim(), reason });
  });
  return out;
}
```

**EUC-KR fetch (필수):**
```typescript
import iconv from 'iconv-lite';
const res = await client.get(url, { responseType: 'arraybuffer' }); // text 금지(Pitfall 2)
const html = iconv.decode(Buffer.from(res.data), 'EUC-KR');
```

**robots.txt `[VERIFIED: curl finance.naver.com/robots.txt]`:** `User-agent: * → Disallow: /` 이지만 곧이어 `Allow: /sise/`. **테마 페이지(`/sise/...`)는 robots.txt 허용**. 토론방과 달리 명시 허용 영역이므로 5원칙 준수 하 리스크 낮음. (단 일 1회 캡 + 출처표기는 그대로 유지.)

### Pattern 3: 알파스퀘어 테마 스크랩 (공개 JSON API) — **CONTEXT 가정 정정 + 실측 검증**

**What:** CONTEXT D-06 은 알파스퀘어를 "SSR" 로 가정했으나 **실제는 Vue SPA(AmazonS3 호스팅, `id="app"` shell 30KB)**. DOM 파싱 불가/불필요. 대신 **무인증 공개 JSON API 직접 호출**.

**실측 엔드포인트 `[VERIFIED: curl 2026-06-09]`:** base = `https://api.alphasquare.co.kr` (브라우저 번들 `assets/index-*.js` 에서 추출)
- `GET /theme/v2/all-themes` → `{data:[{name, id, theme_count, themes:[{id, name, description, aliases[], big_theme_id, stock_count, ...}]}]}`. **27 카테고리 / 총 451 테마**. **`정치` 카테고리에 이재명(id=6, 41종목)/한동훈(19)/김문수(8) 등 정치인주 풍부** — 네이버 미노출분의 핵심 가치. `aliases[]` 가 §Pattern 4 병합에 직접 유용.
- `GET /theme/v2/themes/{id}/stocks` → `[{id, code, ko_name, en_name, market("kosdaq"/"kospi"), is_alive, country_code("KR")}]`. **code 6자리가 `stocks.code` 와 직접 매칭**. 이재명(id=6) = 40종목.
- (참고) `GET /theme/v2/leader-board?limit=N` → `{data:[{theme, stats, stock_count}]}` — `stats` 에 등락률류 있으나 우리는 §Pattern 5 로 자체 계산하므로 미사용.

**스코프 제한:** 451 테마 전부가 아니라 **CONTEXT 의도(정치/시사 = 네이버 보강분)** 에 집중. 권장: `정치` + `트렌드`(조기대선 등) 카테고리 우선, 나머지는 네이버와 중복 → 병합으로 흡수. 플래너가 카테고리 화이트리스트 결정(§Pattern 4 병합이 중복 제거).

**Example:**
```typescript
// scrape/alphasquare/fetchAlphaThemes.ts — Source: 실측 API [VERIFIED]
const ALPHA_BASE = 'https://api.alphasquare.co.kr';
const POLITICS_CATEGORIES = new Set(['정치', '트렌드']); // 플래너 조정 가능
async function fetchAlphaThemes(fetchFn): Promise<ThemeScrape[]> {
  const all = JSON.parse(await fetchFn(`${ALPHA_BASE}/theme/v2/all-themes`));
  const themes = all.data
    .filter(c => POLITICS_CATEGORIES.has(c.name))
    .flatMap(c => c.themes);
  const out: ThemeScrape[] = [];
  for (const t of themes) {
    const stocks = JSON.parse(await fetchFn(`${ALPHA_BASE}/theme/v2/themes/${t.id}/stocks`));
    out.push({
      name: t.name, description: t.description, aliases: t.aliases ?? [],
      stocks: stocks.filter(s => s.country_code === 'KR' && s.is_alive).map(s => s.code),
      source: 'alphasquare',
    });
  }
  return out;
}
```

> **운영 5원칙 점검(알파스퀘어):** 무인증 공개 API 라도 5원칙 적용 — 일 1회만, 콘텐츠 해시 캐싱, 429/403 시 24h backoff, 출처 표기. robots.txt `[VERIFIED]` = `Disallow: /stock/trading-note` 외 전부 Allow(Googlebot/Yeti 등), `api.alphasquare.co.kr` 는 별도 호스트(robots 무관). 부분 캐싱(전체 451 덤프 금지 — 정치/시사 카테고리만).

### Pattern 4: 보수적 이름 정규화 + 병합 (D-10)

**What:** 네이버 테마명 ↔ 알파스퀘어 테마명을 정규화 키(`norm_key`)로 묶어 동일 시스템 테마로 병합. **확실한 정규화만**(D-10 — 애매하면 분리).

**보수적 정규화 규칙 (이 범위만, 동의어 사전은 Deferred):**
1. 양끝 공백 trim + 내부 연속 공백 → 단일(또는 전부 제거)
2. 한글 자모/영숫자/괄호 안 내용 유지, 그 외 특수문자(`·`, `/`, `-`, `,`) 정규화: 제거 또는 단일화
3. 영문 소문자화 (`AI챗봇` vs `ai 챗봇`)
4. **NFKC 유니코드 정규화** (전각/반각, 합성문자)
5. 괄호 부가설명 제거 옵션 보류 — `HBM(고대역폭메모리)` 의 `(...)` 는 동일성 판단에 위험 → **초기엔 괄호 유지**(보수적)

**병합 알고리즘:**
```
norm_key(name) = NFKC(name).toLowerCase().replace(/\s+/g,'').replace(/[·/\-,]/g,'')
for each scraped theme:
  k = norm_key(name)
  themes.upsert by (is_system=true, norm_key=k):
    - 신규면 INSERT (name = 더 짧거나 네이버 우선)
    - 기존이면 sources 배열에 source 추가 (array_append, dedupe)
  theme_stocks: 두 소스의 종목 code 합집합 UPSERT
```

**Don't:** Levenshtein/유사도 임계값 자동 병합 — D-10 "보수적" 위반. 오병합(서로 다른 테마 합침)은 fork-후-수정 불가(시스템 read-only). **정규화 후 완전일치만** 병합, 나머지는 분리 유지(유저가 fork 후 수동 병합).

**근거:** AlphaSquare `aliases[]` 필드를 추가 매칭 키로 사용 가능 — alias 중 하나가 네이버명과 norm_key 일치하면 병합 후보. 단 초기엔 정확 일치만으로 시작 권장. `[VERIFIED: all-themes aliases 존재]`

### Pattern 5: "상위 3종목 평균 등락률" 정렬 지표 (D-14) — precompute 권장

**What:** 각 시스템 테마의 소속 종목 중 등락률 상위 3개의 평균을 `themes.top3_avg_change_rate` 컬럼에 **워커가 precompute**.

**계산 위치 비교:**
| 옵션 | 장 | 단 | 평가 |
|------|----|----|------|
| **A. 워커 precompute 컬럼** | /themes 목록이 단순 `ORDER BY` (인덱스 사용). 수백 테마 × 종목 집계를 배치에서 1회. | 신선도 = 배치 주기. | **권장** — 단 신선도 보완 필요(아래) |
| B. server 쿼리 aggregate | 항상 최신 | 매 요청 수백 테마 조인+window 함수 = 느림, PostgREST 가 복잡 집계 약함 | 부적합 |
| C. materialized view | SQL 선언적 | REFRESH 트리거 관리 + RLS 적용 까다로움 | 과함 |

**신선도 보완(중요):** D-08 스크랩은 일 1회(16:00)지만 **등락률은 장중 1분마다 변한다**(stock_quotes). 정렬 지표가 하루 1번이면 "지금 뜨는 테마" 의도(D-14)에 못 미침. **권장:**
- 정렬 stats 계산을 **theme-sync 워커와 분리** — 별도 경량 Cloud Run Job `gh-radar-theme-stats` 를 **장중 N분마다**(예: 5분, `*/5 9-15 * * 1-5` KST) 실행해 `top3_avg_change_rate` 만 갱신. 스크랩(일1회)과 stats(장중 5분)는 다른 주기.
- 또는 server `/api/themes` 응답 시 top_movers 처럼 stock_quotes 를 조인해 **상위 3개만 실시간 계산**(테마 수백 × 각 종목 등락률 1쿼리로 IN fetch 후 메모리 집계 — scanner.ts 가 이미 이 패턴). 테마당 종목 수십, 테마 수백 → 전체 매핑 1쿼리 + 메모리 group-by 면 충분히 빠름.

> **플래너 결정 포인트:** (A1) 워커 precompute(컬럼) + 장중 별도 stats Job, vs (A2) server 가 stock_quotes 조인해 매 요청 계산. **권장 = A2 (server 계산)** — scanner.ts 선례(`top_movers` codes → `stock_quotes` IN → 메모리 정렬)와 동형이고, 별도 Job 운영비 없음, 항상 최신. 테마 매핑(theme_stocks 전체 ~수천 행)을 1쿼리로 읽고 종목별 최신 등락률을 stock_quotes IN 으로 조인 후 테마별 top3 평균을 메모리 계산. 컬럼은 캐시 폴백용으로만 둠.

**장중/장외 source 분기:** `stock_quotes.change_rate` 가 장중 1분 갱신값(키움 intraday-sync). 장 마감 후엔 stock_quotes 가 종가 기준으로 고정되므로 **동일 컬럼이 장중/장외 모두 커버** — 별도 일봉 분기 불필요(stock_quotes 가 EOD candle-sync 로 종가 overlay 됨). `[VERIFIED: scanner.ts + STATE Phase 09.1]` 단 stock_quotes 에 없는 종목(거래정지 등)은 등락률 0 또는 제외.

**Example (server 계산 — scanner.ts 패턴):**
```typescript
// 1) theme_stocks 전체(active) 읽기 → Map<themeId, code[]>
// 2) 모든 code 의 stock_quotes.change_rate IN fetch → Map<code, rate>
// 3) 테마별: rates 내림차순 정렬 → 상위 3 평균 → ThemeWithStats
// 4) top3avg desc 정렬 (내 테마는 별도 분리하여 상단 고정 — D-13)
```

### Pattern 6: AI 보강 설계 (D-12, THEME-04) — discussion-sync classify 복제

**What:** Claude Haiku 4.5 로 (a) 뉴스 기반 신규 시스템 테마 후보 발굴, (b) 종목↔테마 오분류 교정. **반드시 시스템 레이어(source='ai')만** — 유저 테마 불가침.

**재사용 자산 `[VERIFIED: discussion-sync/src/classify/]`:** `anthropic.ts`(SDK 싱글톤 lazy + `__resetForTests`), `classifyBatch.ts`(p-limit + Promise.allSettled), `prompt.ts`(system + few-shot), `persistRelevance.ts`(Map→UPDATE). 패턴: `model=claude-haiku-4-5`, `temperature=0`, 작은 `max_tokens`, 실패 시 null→다음 cycle 재시도.

**(a) 신규 테마 발굴 (POC 범위로 제한):**
- 입력: 최근 N일 `news_articles`(title + description, Phase 07.1 으로 description 저장됨 `[VERIFIED: init schema]`). 종목별 키라 — 등락 상위 종목군의 뉴스 제목을 샘플링.
- 프롬프트: "다음 뉴스 제목들에서 기존 시스템 테마에 없는 신규 테마/이슈 키워드를 추출. 각 키워드에 관련 종목코드. JSON 출력."
- 출력 → `source='ai'` 신규 themes + theme_stocks(confidence 기록). **기존 norm_key 와 충돌 시 병합**(중복 발굴 방지).
- **안전장치:** AI 발굴 테마는 `confidence` 기록 + 별도 검수 가능하도록 source 라벨 분리. 잘못 발굴돼도 시스템 레이어라 유저 테마 무영향.

**(b) 오분류 교정 (POC 범위):**
- 입력: 스크랩된 `theme_stocks`(특히 reason 텍스트 있는 것) — "이 종목이 이 테마에 맞는가?" 검증.
- 보수적: AI 가 "명백히 무관" 으로 판단한 것만 `effective_to` 마킹(제외), 추가 편입은 하지 않음(false positive 위험).
- **안전장치:** 교정은 `source='naver'/'alphasquare'` 행을 직접 삭제하지 않고 `effective_to` 로 soft-제외 + AI 판단 로그. 원 소스 데이터 보존.

**트리거 주기:** theme-sync 일 1회 cycle **동반 실행**(스크랩 직후 같은 Job 에서) 권장 — 별도 스케줄 불필요, 비용 일 1회로 통제. classify_enabled kill-switch(discussion-sync 선례) 필수.

**비용 추정 `[VERIFIED: Haiku 4.5 $1/$5, WebSearch]`:**
- 발굴: ~수천 뉴스 제목 → 배치 입력 ~50K~200K 토큰/일 + 출력 소량. ≈ $0.05~0.25/일.
- 교정: theme_stocks ~수천 행 중 신규/변경분만 → 입력 수만 토큰. ≈ $0.05~0.15/일.
- **합계 ≈ $0.1~0.4/일 (월 $3~12)** — Batch API 50% 할인 적용 가능(비긴급). discussion-sync 정기 ~$2/day 대비 저렴. `[ASSUMED: 토큰량 추정치 — POC 에서 실측]`

**POC 범위(플래너):** Wave 5 에서 (a) 발굴만 먼저 작은 샘플로 정확도/비용 검증 → 통과 시 (b) 교정 추가. 정확도 미달 시 AI 보강을 source='ai_candidate'(비표시) 로 격리하고 표시 레이어 제외.

### Pattern 7: 유저 테마 CRUD + fork (D-04, D-05, THEME-03) — watchlist 스택 복제

**What:** watchlist(Phase 06.2) 스택을 1:1 복제하되 "stock_code 리스트" → "theme + theme_stocks" 로 확장.

**복제 매핑 `[VERIFIED: watchlist 전 스택 확인]`:**
| watchlist 자산 | theme 대응 |
|---|---|
| `watchlists.sql`(테이블+RLS 4정책+50limit trigger) | §Pattern 1 DDL (themes 유저 정책 + theme_stocks 유저 정책 + 종목수 limit trigger) |
| `webapp/src/lib/watchlist-api.ts`(fetch/add/remove, RLS 자동필터) | `lib/theme-api.ts` 의 유저 부분: `createUserTheme/updateTheme/deleteTheme/addThemeStock/removeThemeStock/forkSystemTheme` |
| `hooks/use-watchlist-query.ts`(60s 폴링) | `hooks/use-themes-query.ts` (내 테마 + 시스템 테마) |
| `components/watchlist/watchlist-client.tsx`(lg Table / <lg Card, empty/skeleton/error) | `components/theme/themes-client.tsx` |
| `app/watchlist/page.tsx`(AppShell+AppSidebar+Client) | `app/themes/page.tsx` 동형 |

**fork = 스냅샷 복사 (D-05) 구현 — 같은 테이블 내 INSERT-SELECT (단일 테이블 이점):**
```typescript
// lib/theme-api.ts forkSystemTheme — RLS 가 owner 강제
async function forkSystemTheme(supabase, userId, systemThemeId) {
  // 1) 시스템 테마 메타 읽기 (RLS: 시스템 read 허용)
  const { data: sys } = await supabase.from('themes')
    .select('name, description').eq('id', systemThemeId).eq('is_system', true).single();
  // 2) 유저 테마 INSERT (owner=userId, is_system=false) — RLS WITH CHECK 통과
  const { data: mine } = await supabase.from('themes')
    .insert({ name: sys.name, description: sys.description, owner_id: userId, is_system: false })
    .select('id').single();
  // 3) 그 시점 active 멤버십 복사 (effective_to IS NULL 인 것만 — fork 스냅샷 범위)
  const { data: members } = await supabase.from('theme_stocks')
    .select('stock_code').eq('theme_id', systemThemeId).is('effective_to', null);
  await supabase.from('theme_stocks').insert(
    members.map(m => ({ theme_id: mine.id, stock_code: m.stock_code, source: 'user' }))
  );
  return mine.id;
}
```

**fork effective 이력 복사 범위(Discretion):** **현재 active 멤버십만 복사**(effective_to IS NULL). 과거 제외 이력은 복사 안 함 — fork 는 "지금 이 종목들로 시작" 의미(D-05 스냅샷). 유저 theme_stocks 는 effective_from=now, source='user', effective_to=NULL 로 단순화(유저 테마는 이력 추적 불필요 — 본인이 직접 add/remove).

> **레이어 분리 보장:** 모든 유저 쓰기 경로에서 `is_system=false` + `owner_id=auth.uid()` 를 RLS WITH CHECK 로 강제(§Pattern 1). 워커(service_role)는 `is_system=true` 만 건드림. 두 레이어가 코드·정책 양쪽에서 분리.

### Pattern 8: /themes UI (D-13~D-16) — 기존 컴포넌트 재사용

**`/themes` 목록 (D-13):** 내 테마 섹션(상단 고정) + 시스템 테마 섹션(top3avg desc). 각 테마 = `theme-card`(이름 + 상위3평균 등락률 뱃지 + 종목수 + source 뱃지 + 출처표기). 내 테마 카드엔 편집/삭제, 시스템 카드엔 "내 테마로 복사(fork)" 버튼.

**`/themes/[id]` 상세 (D-15):** `scanner-table.tsx`/`scanner-card-list.tsx` **직접 재사용** — props 가 `StockWithProximity[]` 라 theme_stocks→stock_quotes 조인 결과를 그 타입으로 매핑하면 됨. `[VERIFIED: scanner-table.tsx]` 종목 행 = 종목명+코드+마켓+현재가+등락률+거래대금+⭐. 종목 클릭 → `/stocks/[code]`(이미 Link href 내장). Next15 `use(params)` 패턴(stock detail page 선례).

**종목 칩 (D-16):** `stock-detail-client.tsx` 의 `<div className="space-y-6">` 섹션 위에 `<StockThemeChips stockCode={stock.code} />` 1줄 삽입(최소 침습). 칩 컴포넌트: theme_stocks 역조회(`idx_theme_stocks_code`) → 시스템 테마 + 로그인 시 내 테마. 칩 클릭 → `/themes/[id]`. **overflow**: 최대 ~6개 표시 + "+N" 더보기(Discretion — watchlist 50limit 처럼 상한).

**상태(Discretion):** empty("아직 내 테마가 없어요" + 생성 CTA) / skeleton / error 는 `scanner-empty.tsx`/`scanner-skeleton.tsx`/`scanner-error.tsx` 및 watchlist-empty 패턴 복제. `[VERIFIED: scanner 컴포넌트 존재]`

**유저 편집 UI(Discretion):** watchlist-client 패턴 참고. 권장 = 전용 페이지/모달보다 **`/themes/[id]` 에서 본인 테마면 인라인 종목 add(검색)/remove(⭐ 토글 변형)** — GlobalSearch(⌘K) 컴포넌트 재사용해 종목 검색 후 추가. 신규 테마 생성은 /themes 상단 "테마 만들기" 버튼 → 간단 모달(이름).

### 데이터 흐름 (시스템=Express service-role, 유저=Supabase 직접) — **중요 아키텍처 결정**
| 데이터 | 경로 | 이유 |
|---|---|---|
| 시스템 테마 목록 + 종목 + 상위3평균 | **Express `/api/themes`**(service-role) | scanner 처럼 stock_quotes 조인·집계가 서버에 적합. RLS 우회(시스템은 공개). `X-Last-Updated-At` 헤더 가능. `[VERIFIED: scanner.ts]` |
| 유저 테마 CRUD + fork | **webapp → Supabase 직접**(authenticated, RLS) | watchlist 와 동일 — RLS 가 owner 자동 필터. `[VERIFIED: watchlist-api.ts]` |
| 종목 칩(시스템+유저) | webapp → Supabase 직접 또는 Express | 혼합 — 시스템은 anon read, 유저는 authenticated read 정책으로 1쿼리 가능(단일 테이블 이점). 권장: Supabase 직접(RLS 가 두 레이어 한번에 필터). |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cloud Run Job + Scheduler 워커 | 새 워커 스캐폴드 | `workers/master-sync/` **디렉터리 복사** + `scripts/{setup,deploy,smoke}-master-sync.sh` 복사 | Dockerfile(pnpm deploy)·config·logger·retry·supabase·OAuth invoker·delimiter `^@^`·Content-Range smoke 모두 검증됨 `[VERIFIED]` |
| 차단 시 프록시 폴백 | 새 Bright Data 클라이언트 | `workers/discussion-sync/src/proxy/client.ts` `fetchViaProxy` **임포트** | 401/402/403/429 에러 분류 + zone/country=kr + redact 완비 `[VERIFIED: client.ts]` |
| AI 분류/배치 | 새 Anthropic 통합 | `discussion-sync/src/classify/{anthropic,classifyBatch}.ts` **복제** | SDK 싱글톤 + p-limit + Promise.allSettled + temp=0 + null-retry `[VERIFIED]` |
| 일일 호출 카운터 / 24h backoff 상태 | 새 상태 테이블 | `api_usage` 테이블 + `incr_api_usage` RPC **재사용**(service='theme_naver'/'theme_alpha') | atomic RPC + REVOKE 완비. 24h backoff 도 동일 테이블에 backoff_until 패턴 `[VERIFIED: apiUsage.ts]` |
| per-user CRUD + RLS | 새 owner 정책 | `watchlists.sql` 4정책 + limit trigger **복제** | owner-only + WITH CHECK + P0001 limit + authenticated 명시 `[VERIFIED]` |
| 종목 행 테이블 UI | 새 테마 종목 테이블 | `scanner-table.tsx`/`scanner-card-list.tsx` **재사용** | `StockWithProximity[]` props 그대로 + Link + ⭐ + 반응형 `[VERIFIED]` |
| 60s 폴링 훅 | 새 폴링 로직 | `use-watchlist-query.ts` **복제** | visibility API + stale-but-visible + MAX(updatedAt) `[VERIFIED]` |
| EUC-KR 디코딩 | 수동 charset 변환 | `iconv-lite` `decode(buf,'EUC-KR')` | axios arraybuffer + iconv 표준. 수동 변환은 깨짐 |
| 테마 HTML 파싱 | 정규식 스크래핑 | `cheerio` selector | `table.type_1.theme` / `table.type_5` selector 가 견고. 정규식은 마크업 변화에 취약 |

**Key insight:** 이 phase 는 **"새로 만드는 것"이 거의 없다.** 워커=master-sync 복사, 폴백=discussion-sync 임포트, AI=discussion-sync 복제, 유저 CRUD=watchlist 복제, UI=scanner/watchlist 복제. 진짜 신규 로직은 (1) 네이버 cheerio 파서 2개, (2) 알파스퀘어 JSON fetch, (3) norm_key 병합, (4) 상위3평균 계산 — 이 4개뿐. 나머지는 검증된 패턴 조립.

## Runtime State Inventory

> 이 phase 는 **신규 테이블·신규 워커 생성**(greenfield 적 성격)이지만, 기존 인프라에 추가되는 부분이 있어 점검.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 신규 `themes`/`theme_stocks` 테이블 — 기존 데이터 없음(신규 생성). `api_usage` 에 신규 service 라벨(theme_naver/theme_alpha) 행 추가됨. | 마이그레이션으로 테이블 생성. api_usage 는 자동 누적(기존 RPC). |
| Live service config | 신규 Cloud Run Job `gh-radar-theme-sync` + Scheduler `gh-radar-theme-sync-daily`(16:00 KST). 기존 Job 들과 독립. **DB(SQLite/n8n 등) 미사용** — 전부 코드/GCP. | deploy 스크립트가 생성(master-sync 복제). |
| OS-registered state | 없음 — Cloud Run Job 은 stateless 컨테이너. Windows Task Scheduler/pm2/launchd 미사용. | None — verified by 아키텍처(전부 GCP Cloud Run). |
| Secrets/env vars | 기존 재사용: `gh-radar-supabase-service-role`, `gh-radar-brightdata-api-key`(폴백), `gh-radar-anthropic-api-key`(AI). **신규 시크릿 없음**. theme-sync SA 신규 생성(`gh-radar-theme-sync-sa`) + 위 3 시크릿 accessor 바인딩. | setup-iam 스크립트가 SA 생성 + accessor 바인딩(기존 시크릿 재사용). 사용자 신규 입력 불필요. `[VERIFIED: MEMORY 기존 creds 재요청 금지]` |
| Build artifacts | 신규 `workers/theme-sync/dist` + Docker 이미지 `theme-sync:{sha}`. packages/shared 빌드에 theme.ts 추가 → 재빌드 필요. | Dockerfile 이 pnpm build 수행. `pnpm -F @gh-radar/shared build` 후 의존 워크스페이스 재빌드. |

**핵심 질문(모든 repo 파일 업데이트 후 잔존 상태):** 없음 — 신규 생성 phase 라 rename/migration 잔존 상태 이슈 무관. 단 **알파스퀘어/네이버 API 가 변경되면**(외부 의존) 파서가 깨질 수 있음 → §Pitfall 1·2 로 가드.

## Common Pitfalls

### Pitfall 1: 네이버 production IP 차단 (Phase 8 의 핵심 교훈)
**What goes wrong:** 로컬 curl 로는 200 OK 인데 Cloud Run production IP 에서 403/429.
**Why:** 네이버 anti-bot 이 데이터센터 IP 를 차단(Phase 8 에서 실증 — `STATE`: "curl로 SSR이 보여도 production IP는 차단당함").
**How to avoid:** D-07 직접→Bright Data 폴백 구조 필수. 직접 fetch 403/429 시 즉시 `fetchViaProxy`(country=kr) 로 재시도. **일 1회 저빈도라 직접 fetch 가 대부분 통과할 수 있으나, 폴백 없으면 첫 차단에 전체 실패.** 폴백 후에도 403 면 24h backoff(§Pitfall 8).
**Warning signs:** 로컬 PASS / production 첫 실행 0 row + 403 로그.

### Pitfall 2: EUC-KR 한글 깨짐 (axios responseType)
**What goes wrong:** 네이버 테마명·종목명이 `������` 로 깨짐.
**Why:** axios 기본 `responseType:'text'` 가 UTF-8 강제 디코딩 → EUC-KR 바이트 손상. SC #4 직접 위반.
**How to avoid:** `responseType:'arraybuffer'` 로 받아 `iconv.decode(Buffer.from(res.data),'EUC-KR')`. **알파스퀘어는 UTF-8 JSON 이라 iconv 불필요** — 소스별 분기.
**Warning signs:** 테마명 mojibake. unit test 로 EUC-KR fixture 디코딩 검증(§Validation).

### Pitfall 3: RLS authenticated 누락 → 로그인 유저 빈 화면
**What goes wrong:** `TO anon` 만 정책 작성 → Google 로그인 유저(role=authenticated)가 시스템 테마 0행.
**Why:** authenticated 는 anon 정책 자동 상속 안 함(프로젝트 반복 함정 — watchlist/stock_daily_ohlcv 에서 2번 발생). `[VERIFIED: MEMORY + 20260515163000 마이그레이션]`
**How to avoid:** 시스템 테마 read 정책 = `TO anon, authenticated`(§Pattern 1 DDL 반영됨). theme_stocks read 정책도 동일.
**Warning signs:** 비로그인 OK / 로그인 후 /themes 빈 화면. (STATE DI-03 도 동일 이슈 경고.)

### Pitfall 4: Cloud Run Job 인증 OIDC 사용 (Phase 05.1 Pitfall 2)
**What goes wrong:** Scheduler→Job 호출이 OIDC 토큰이면 실패.
**Why:** Cloud Run **Job** 호출은 OAuth bearer 만 허용(service 와 다름). `[VERIFIED: 전 deploy 스크립트 + STATE 결정 이력]`
**How to avoid:** `--oauth-service-account-email` 사용(`--oidc-*` 금지). master-sync deploy §6 그대로 복제.
**Warning signs:** Scheduler 실행 401/403, Job 미실행.

### Pitfall 5: theme_stocks FK 무결성 (존재 종목만)
**What goes wrong:** 스크랩 종목 code 가 `stocks` 마스터에 없어 FK 위반으로 전체 batch 실패.
**Why:** 네이버/알파스퀘어 종목 code 가 우리 마스터(KRX 활성)와 불일치 가능(신규상장/상장폐지/우선주 등).
**How to avoid:** UPSERT 전 `stocks` 존재 확인 → 없는 code 는 **per-stock skip + 로그**(master-sync delist-sweep 패턴). 또는 FK NOT VALID + 런타임 필터. theme_stocks INSERT 를 chunk + ON CONFLICT 로.
**Warning signs:** `violates foreign key constraint theme_stocks_stock_code_fkey`.

### Pitfall 6: 네이버 페이지네이션 무한 루프 / 마지막 페이지 오판
**What goes wrong:** `?page=8,9,...` 가 page 7 과 동일 내용 반환 → 같은 테마 중복 수집 또는 무한 루프.
**Why:** 네이버가 범위 초과 page 를 clamp(마지막 페이지 반복). `[VERIFIED: page 7/8 동일 25개]`
**How to avoid:** 직전 페이지 theme ID 집합과 현재가 동일하면 stop. 또는 페이지 콘텐츠 해시 중복 시 stop. hard cap(예: 10페이지)도 둠(master-sync MIN_EXPECTED 가드 정신).
**Warning signs:** 같은 theme no 반복 로그, 무한 페이지.

### Pitfall 7: AI 비용 폭주 / 오분류로 잘못된 테마 표시
**What goes wrong:** 매 cycle 전체 뉴스/매핑 재분류 → 비용 폭주. 또는 AI 가 엉뚱한 종목을 테마에 편입.
**Why:** 미분류만 거르지 않으면 중복 호출. AI 발굴/교정은 false positive 위험.
**How to avoid:** (1) 신규/변경분만 AI 호출(discussion-sync `unclassifiedRows` 패턴). (2) `classify_enabled` kill-switch. (3) AI 결과 `source='ai'` + `confidence` 분리 — 정확도 미달 시 표시 레이어에서 제외(비표시 격리). (4) 교정은 soft-제외(effective_to)만, 원 소스 보존. (5) POC 로 정확도/비용 먼저 검증(§Pattern 6).
**Warning signs:** AI 비용 일 $1 초과, 유저 신고("이 종목 왜 이 테마?").

### Pitfall 8: 429/403 즉시 24h backoff 미구현 (운영 5원칙 #4)
**What goes wrong:** 차단 후 자동 재시도/지수 backoff 로 계속 두드림 → 차단 심화 + 법적 리스크.
**Why:** 5원칙 #4 = "차단 신호는 명시 차단으로 해석, 24h backoff".
**How to avoid:** 직접+프록시 둘 다 403/429 면 `api_usage`(또는 전용 컬럼)에 `backoff_until=now+24h` 저장 → cycle 시작 시 backoff_until 미경과면 해당 source skip + 알림. 자동 지수 재시도 금지.
**Warning signs:** 반복 403 로그, 차단 후에도 매시 호출.

### Pitfall 9: 병렬 Wave worktree race (MEMORY 규칙)
**What goes wrong:** 병렬 subagent 가 shared tree 에서 git add race.
**How to avoid:** 병렬 Wave 는 worktree 분리 또는 순차 실행. `[VERIFIED: MEMORY feedback_parallel_wave_worktree]` config `parallelization:false` 이므로 기본 순차 — 안전.

### Pitfall 10: 외부 API 구조 변경 (알파스퀘어/네이버)
**What goes wrong:** 알파스퀘어 JSON 스키마 변경 또는 네이버 마크업 변경 → 파서 silent 실패.
**How to avoid:** zod 스키마 검증(fetchDiscussions 선례) + MIN_EXPECTED 가드(테마/종목 수 비정상 적으면 throw, master-sync 패턴). fixture 캡처 후 unit test.
**Warning signs:** 테마 0개 또는 종목 0개 수집.

## Code Examples

### PostgREST nested embed (theme_stocks → stocks → stock_quotes) — watchlist 선례
```typescript
// 종목 칩 역조회 (D-16) — Source: watchlist-api.ts [VERIFIED]
// 한 종목이 속한 테마 (시스템 + 내 테마, RLS 가 자동 필터)
const { data } = await supabase
  .from('theme_stocks')
  .select(`theme_id, themes!inner ( id, name, is_system, owner_id )`)
  .eq('stock_code', code)
  .is('effective_to', null);
// PostgREST 1:1 은 object, 1:N 은 array — Array.isArray 방어 (watchlist 선례)
```

### server /api/themes 정렬 (scanner.ts 패턴)
```typescript
// Source: scanner.ts [VERIFIED] — top_movers codes → stock_quotes IN → 메모리 정렬
// 1) theme_stocks active 전체 → Map<themeId, code[]>
// 2) unique codes → stock_quotes.change_rate IN fetch (PostgREST 대량 IN 은 청크 분할 — 최근 회귀 교훈)
// 3) 테마별 rates desc 정렬 → 상위3 평균
// 4) ThemeWithStats[] top3avg desc 정렬
// ⚠️ 최근 커밋 37afcde: stocks .in() 대량 조회는 청크 분할 필수 (URL 길이 한계) — 동일 적용
```
> **주의(최근 회귀 교훈):** `[VERIFIED: git log 37afcde]` "stocks .in() 대량 조회 청크 분할 — 강세장 스캐너 빈 화면 회귀". theme_stocks 종목 code 가 수천 개면 stock_quotes `.in(codes)` 를 **청크(예: 200개씩) 분할** 필수. 단일 IN 은 URL 길이 초과로 빈 응답.

### Cloud Run Job deploy (master-sync 복제 — OAuth invoker)
```bash
# Source: deploy-master-sync.sh [VERIFIED] — 신규 theme-sync 로 치환
gcloud run jobs deploy gh-radar-theme-sync \
  --service-account="gh-radar-theme-sync-sa@${PROJECT}.iam.gserviceaccount.com" \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest" \
  --task-timeout=600s --max-retries=1
gcloud scheduler jobs create http gh-radar-theme-sync-daily \
  --schedule="0 16 * * *" --time-zone="Asia/Seoul" \
  --oauth-service-account-email="gh-radar-scheduler-sa@${PROJECT}.iam.gserviceaccount.com"  # OIDC 금지
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CONTEXT D-06: 알파스퀘어 "SSR" 가정 | **Vue SPA + 공개 JSON API** `api.alphasquare.co.kr/theme/v2/*` | 2026-06-09 실측 | DOM 파싱 폐기 → JSON 직접 호출(Phase 8 PIVOT 과 동형). cheerio 는 네이버에만. |
| 네이버 테마 "스크래핑 = 회색지대" 전제 | robots.txt `/sise/` **명시 Allow** | 2026-06-09 실측 | 테마 페이지는 토론방보다 법적 리스크 낮음(단 5원칙 유지) |
| 정렬 지표 일 1회 precompute 가정 | server 실시간 stock_quotes 조인 계산 권장 | 본 연구 | "지금 뜨는 테마"(D-14) 신선도 확보, 별도 stats Job 불필요 |
| `themes`/`user_themes` 분리 검토 | 단일 `themes`+`is_system`+`owner_id` 권장 | 본 연구 | 조인·fork·칩 쿼리 단순화 |

**Deprecated/outdated:**
- cheerio 를 토론방에 쓰던 Phase 8 RESEARCH 가정 → 폐기됐으나 **네이버 테마는 진짜 SSR 이라 cheerio 가 정답**(혼동 주의 — 소스별 다름).

## Assumptions Log

> `[ASSUMED]` 태그 집계 — 플래너/discuss-phase 가 사용자 확인 또는 POC 로 해소.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | cheerio/iconv-lite 최신 안정 버전이 cheerio 1.x / 0.6.x | Standard Stack | 낮음 — `npm view` 로 플래너 확정. |
| A2 | 알파스퀘어 정치/트렌드 카테고리만 수집(전체 451 아님) | Pattern 3 | 중 — 플래너가 카테고리 화이트리스트 최종 결정. 전체 수집 시 네이버와 대량 중복(병합이 흡수하나 비용↑). |
| A3 | AI 보강 비용 월 $3~12 (토큰량 추정) | Pattern 6 | 중 — POC 실측 필요. 미달 시 source='ai' 격리. |
| A4 | 정렬 = server 실시간 계산(A2안)이 precompute 보다 우월 | Pattern 5 | 낮음 — 둘 다 가능, scanner 선례상 server 계산 검증됨. 테마/종목 수 폭증 시 precompute 재검토. |
| A5 | 네이버 직접 fetch 가 일 1회 저빈도라 대부분 통과(폴백은 안전망) | Pattern 9 | 중 — Phase 8 은 차단당했음. 첫 production 실행에서 직접 fetch 통과 여부 검증(통과 못해도 폴백으로 동작). |
| A6 | DDL 스케치(단일 테이블/플래그/RLS)가 watchlist 톤으로 최종화 가능 | Pattern 1 | 낮음 — 권장안, 플래너가 마이그레이션 구체화. |
| A7 | fork 는 active 멤버십만 복사(과거 이력 미복사) | Pattern 7 | 낮음 — D-05 스냅샷 의미에 부합. |

**이 표가 비어있지 않음:** 7개 가정 — A2/A3/A5 는 플래너 결정 또는 POC 로, 나머지는 저위험.

## Open Questions (RESOLVED)

> 3개 모두 플래너 채택 결정으로 해소됨. 미해소 blocking 항목 없음.

1. **알파스퀘어 수집 카테고리 범위 (A2)** — **RESOLVED:** Plan 03 `scrape/config.ts` `alphaCategories` 기본값 `['정치','트렌드']` 채택 (운영 중 카테고리 확장 가능).
   - 알고 있는 것: 27 카테고리 451 테마, 정치 카테고리에 정치인주 풍부.
   - 불명확: 정치/트렌드만 vs 전체(네이버 미커버분 더 있을 수 있음).
   - 권장: 정치 + 트렌드(조기대선 등) 우선 시작, 병합 후 커버리지 확인 → 운영 중 카테고리 확장.

2. **정렬 stats 계산 위치 최종 (A4)** — **RESOLVED:** Plan 04 에서 **server 실시간 `stock_quotes` 청크 IN 계산**으로 구현 채택 (D-14, scanner 선례, 커밋 37afcde 청크 분할 교훈 반영).
   - 알고 있는 것: server 실시간 계산(A2안) vs 워커 precompute(A1안) 둘 다 가능.
   - 채택: server 실시간(scanner 선례). 테마/종목 수 폭증 시 precompute 재검토(후속).

3. **AI 보강 POC 통과 기준 (A3)** — **RESOLVED:** Plan 06 Task 3 **POC 게이트**(checkpoint)로 실행 시점에 결정 — 작은 샘플 발굴 정확도/비용 검증 → 미달 시 `source='ai_candidate'` 비표시 격리(표시 보류). 미달 시 Wave 5 만 후속 phase 10.1 분리 fallback 명시.
   - 알고 있는 것: 비용 ~월 $3~12 추정, classify 패턴 검증됨.
   - 채택: Wave 5 발굴 샘플 검증 게이트 → 정확도 미달 시 source 격리.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| 네이버 테마 페이지 `/sise/theme.naver` | THEME-01 네이버 수집 | ✓ | EUC-KR HTML, 200 OK | Bright Data 프록시 폴백(D-07) |
| 알파스퀘어 JSON API `api.alphasquare.co.kr/theme/v2/*` | THEME-01 알파 수집 | ✓ | 무인증 공개 JSON | Bright Data 프록시 폴백 / 정치테마 누락 시 네이버만 |
| `gh-radar-brightdata-api-key` (GCP Secret) | 차단 폴백(D-07) | ✓ | Phase 8 도입 | — (없으면 폴백 불가, 직접 fetch만) |
| `gh-radar-anthropic-api-key` (GCP Secret) | AI 보강(THEME-04) | ✓ | Phase 08.1 도입 | classify_enabled=false 로 AI 보강 skip |
| `gh-radar-supabase-service-role` (GCP Secret) | 워커 쓰기 | ✓ | 전 워커 공유 | — |
| `stocks` 마스터 (FK 대상) | theme_stocks FK | ✓ | Phase 06.1, ~2,771 활성 | per-stock skip(없는 code) |
| `stock_quotes` (등락률) | 상위3평균(D-14) | ✓ | Phase 09.1, 1분 갱신 | 종목 등락률 0 폴백 |
| `news_articles` (AI 입력) | 테마 발굴(THEME-04) | ✓ | Phase 07.1, description 포함 | 발굴 skip |
| Bright Data 예산 | 폴백 호출 | ✓ | Phase 8 zone `gh_radar_naver` | 일 1회 저빈도라 예산 영향 미미 |

**Missing dependencies with no fallback:** 없음 — 모든 핵심 의존성 가용.
**Missing dependencies with fallback:** AI(키 없으면 skip), 알파스퀘어(차단 시 네이버만으로 축소 운영).

## Validation Architecture

> nyquist_validation 활성(`config.json: nyquist_validation:true`). `[VERIFIED]`

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **vitest** `^3.0.0` (워커/server/webapp 공통) + **Playwright**(webapp E2E) `[VERIFIED: package.json]` |
| Config file | 각 워크스페이스 `vitest.config.ts` (theme-sync 는 master-sync 복사) |
| Quick run command | `pnpm -F @gh-radar/theme-sync test` (워커) / `pnpm -F @gh-radar/server test` / `pnpm -F webapp test` |
| Full suite command | `pnpm -r test` (전 워크스페이스) + webapp Playwright `pnpm -F webapp e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | 네이버 EUC-KR fixture → 테마 목록 파싱(table.type_1) | unit | `pnpm -F @gh-radar/theme-sync test parseThemeList` | ❌ Wave 0 |
| THEME-01 | 네이버 상세 fixture → 종목 code 추출(table.type_5) | unit | `... test parseThemeDetail` | ❌ Wave 0 |
| THEME-01 | EUC-KR 디코딩 한글 무손상 | unit | `... test iconv` | ❌ Wave 0 |
| THEME-01 | 알파스퀘어 JSON fixture → 테마+종목 매핑 | unit | `... test fetchAlphaThemes` | ❌ Wave 0 |
| THEME-01 | norm_key 병합(공백/특수문자/대소문자) | unit | `... test normalizeName` | ❌ Wave 0 |
| THEME-01 | 직접 fetch 403 → 프록시 폴백 호출 | unit(mock) | `... test fetchWithFallback` | ❌ Wave 0 |
| THEME-01 | 429/403 → 24h backoff 상태 저장 + skip | unit(mock) | `... test scrapeState` | ❌ Wave 0 |
| THEME-01 | theme_stocks FK skip(없는 종목) + upsert | integration(supabase-mock) | `... test upsertThemes` | ❌ Wave 0 |
| THEME-01 | SHA256 해시 동일 시 write skip | unit | `... test contentHash` | ❌ Wave 0 |
| THEME-02 | 상위3평균 계산(rates desc top3) | unit | `pnpm -F @gh-radar/server test computeTop3` | ❌ Wave 0 |
| THEME-02 | /api/themes 정렬 + stock_quotes 청크 IN | integration(supertest) | `pnpm -F @gh-radar/server test themes` | ❌ Wave 0 |
| THEME-02 | /themes 목록(내 테마 상단+시스템) 렌더 | E2E | `pnpm -F webapp e2e themes.spec` | ❌ Wave 0 |
| THEME-02 | /themes/[id] scanner row + 종목 클릭→상세 | E2E | `... e2e themes.spec` | ❌ Wave 0 |
| THEME-02 | /stocks/[code] 테마 칩 표시 + 클릭→/themes/[id] | E2E | `... e2e theme-chips.spec` | ❌ Wave 0 |
| THEME-03 | 유저 테마 RLS owner-only(타인 row deny) | integration(supabase) | `pnpm -F webapp test theme-api` | ❌ Wave 0 |
| THEME-03 | fork = active 멤버십 스냅샷 복사 | integration | `... test forkSystemTheme` | ❌ Wave 0 |
| THEME-03 | 유저 CRUD(생성/편집/삭제/add/remove) | E2E | `... e2e user-themes.spec` | ❌ Wave 0 |
| THEME-04 | AI 발굴 프롬프트 파싱(JSON 응답→테마후보) | unit(mock SDK) | `pnpm -F @gh-radar/theme-sync test discoverThemes` | ❌ Wave 0 |
| THEME-04 | AI 오분류 교정 soft-제외(effective_to) | unit(mock SDK) | `... test correctMembership` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** 해당 워크스페이스 quick test (`pnpm -F <ws> test`)
- **Per wave merge:** `pnpm -r test` (전 워크스페이스) + typecheck + build
- **Phase gate:** 전 suite green + Playwright E2E green + production smoke(theme-sync Job 1회 실행 → themes count > 0) → `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `workers/theme-sync/vitest.config.ts` + tests/helpers/supabase-mock.ts (discussion-sync 복사)
- [ ] 네이버 EUC-KR fixture (`tests/fixtures/naver-theme-list.html`, `naver-theme-detail.html`) — 실측 페이지 캡처
- [ ] 알파스퀘어 JSON fixture (`tests/fixtures/alpha-all-themes.json`, `alpha-stocks.json`) — 실측 캡처
- [ ] `server` themes 라우트 supertest 스텁
- [ ] `webapp` Playwright themes/user-themes/theme-chips spec 스텁 + auth fixture(기존 storageState 재사용)
- [ ] cheerio/iconv-lite 설치 (`pnpm -F @gh-radar/theme-sync add cheerio iconv-lite`)

## Security Domain

> `security_enforcement` config 키 부재 → 기본 enabled 로 간주.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth(Google OAuth) 기존 — 유저 테마는 세션 필수(middleware route guard). `[VERIFIED: auth-context]` |
| V3 Session Management | yes | @supabase/ssr 쿠키 세션 기존 |
| V4 Access Control | **yes (핵심)** | **owner-only RLS** — 유저 테마 `owner_id=auth.uid()` + `is_system=false` WITH CHECK. 시스템 쓰기 service_role only. §Pattern 1 |
| V5 Input Validation | yes | Zod(server 라우트) + 스크랩 응답 zod 검증 + 종목 code 정규식(`/^[A-Za-z0-9]{1,10}$/`, stocks.ts 선례) |
| V6 Cryptography | no(직접) | SHA256 은 변경감지용(보안 아님). 시크릿은 GCP Secret Manager(기존) |

### Known Threat Patterns for {Next.js + Express + Supabase + Cloud Run 워커 + 외부 스크랩}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 유저 A 가 유저 B 테마 조회/수정 | Information Disclosure / Tampering | owner-only RLS(USING + WITH CHECK) — DB 레벨 강제 `[VERIFIED: watchlist 선례]` |
| 유저가 시스템 테마 위조/편입 조작 | Tampering | is_system 쓰기 정책 authenticated 부재 + WITH CHECK is_system=false |
| 스크랩 응답에 악성 HTML/스크립트(테마명/reason) | XSS | React 자동 이스케이프 + stripHtml(필요 시) + 표시 전 정규화 |
| 시크릿 로그 노출(Bright Data/Anthropic 토큰) | Information Disclosure | pino redact(discussion-sync 7-path 선례 복제) `[VERIFIED]` |
| 스크랩 DoS/과호출 → 차단·법적 | DoS | 5원칙(일1회 캡 + 24h backoff) + api_usage 카운터 |
| SSRF(프록시 url 파라미터) | — | Bright Data url 은 고정 도메인(naver/alphasquare)만 — 사용자 입력 url 금지 |
| RLS authenticated 누락 → 정보 부재(역방향) | — | `TO anon, authenticated` 명시(Pitfall 3) |

## Sources

### Primary (HIGH confidence — 세션 내 실측)
- `[VERIFIED: curl]` 네이버 robots.txt — `/sise/` Allow / 토론방 page Disallow
- `[VERIFIED: curl + iconv]` 네이버 `/sise/theme.naver`(EUC-KR, table.type_1.theme, ?page=N ~7페이지) + `/sise/sise_group_detail.naver?type=theme&no=536`(table.type_5, /item/main.naver?code= 33종목, info_txt 편입사유)
- `[VERIFIED: curl]` 알파스퀘어 SPA(S3) + `api.alphasquare.co.kr/theme/v2/all-themes`(451테마/27카테고리/aliases) + `/theme/v2/themes/6/stocks`(이재명 40종목, code/market) + robots.txt
- `[VERIFIED: 파일 읽기]` watchlists.sql / watchlist-api.ts / use-watchlist-query.ts / watchlist-client.tsx / auth-context.tsx (유저 CRUD 선례)
- `[VERIFIED: 파일 읽기]` discussion-sync proxy/client.ts + classify/{anthropic,classifyOne,classifyBatch,prompt,persistRelevance}.ts + index.ts + config.ts + apiUsage.ts (폴백 + AI + 예산)
- `[VERIFIED: 파일 읽기]` master-sync {config,index,supabase,upsert,client}.ts + Dockerfile + deploy/setup/smoke 스크립트 (워커 템플릿)
- `[VERIFIED: 파일 읽기]` scanner.ts + stocks.ts + app.ts + scanner-table.tsx (server 라우트 + UI 재사용)
- `[VERIFIED: 파일 읽기]` split_stocks 마이그레이션 + 20260515163000(RLS authenticated fix) + api_usage 마이그레이션
- `[CITED: platform.claude.com/docs/en/about-claude/pricing]` Claude Haiku 4.5 = `claude-haiku-4-5`, $1/M in + $5/M out

### Secondary (MEDIUM — WebSearch 검증)
- `[VERIFIED: WebSearch]` Haiku 4.5 모델 id/가격(2026 동일), 200K context

### Tertiary (LOW — 미검증, POC/확정 필요)
- cheerio/iconv-lite 정확 최신 버전(`npm view` 권장)
- AI 토큰량/비용 추정치(POC 실측)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 기존 의존성 재사용 + 신규 2개(cheerio/iconv) 표준
- 스크랩 소스(네이버/알파): HIGH — 둘 다 실측 검증(구조/charset/페이지네이션/JSON API)
- Architecture(스키마/병합/정렬/fork): HIGH — watchlist/scanner 선례 + 실측 데이터 기반 권장
- AI 보강: MEDIUM — 패턴 검증됨, 정확도/비용은 POC 필요
- Pitfalls: HIGH — Phase 8/05.1/06.2 실제 교훈 + 최근 회귀(청크 IN) 반영

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (외부 API 구조는 변동 가능 — 7일 내 plan 착수 권장. 네이버 마크업/알파스퀘어 JSON 변경 시 파서 재검증)

---

## Wave 분할 권장 (큰 phase — 의존성 기반)

> config `parallelization:false` → 기본 순차. 아래는 논리적 의존 순서. 병렬 가능 지점 명시(worktree 분리 시).

| Wave | 내용 | Req | 의존 | 병렬? |
|------|------|-----|------|-------|
| **0** | 테스트 인프라 — theme-sync vitest 스캐폴드 + 네이버/알파 fixture 캡처 + supabase-mock + cheerio/iconv 설치 + server/webapp 테스트 스텁 | 전부 | — | — |
| **1** | 데이터 모델 — `themes`+`theme_stocks` 마이그레이션(단일 테이블/플래그/RLS/limit trigger) + `packages/shared/theme.ts` 타입 + **[BLOCKING] supabase db push** | THEME-01/03 | W0 | — |
| **2** | 스크랩 파이프라인 — theme-sync 워커(네이버 cheerio 파서 + 알파 JSON fetch + fetchWithFallback + normalizeName 병합 + upsert + scrapeState backoff + SHA256). 직접→프록시 폴백. **AI 제외** | THEME-01 | W1 | 네이버/알파 파서는 병렬 가능(worktree) |
| **3** | 시스템 테마 표시(server) — `/api/themes`(상위3평균 stock_quotes 청크 IN 계산) + `/api/themes/:id` + 종목 칩 역조회 라우트 + mappers/schemas + app.ts | THEME-02 | W1 | W4 와 병렬 가능(server vs webapp) |
| **4** | 유저 테마 CRUD(webapp) — theme-api(유저 부분 + fork) + use-themes-query + themes-client + 편집 UI. watchlist 복제 | THEME-03 | W1 | W3 와 병렬 가능 |
| **5** | AI 보강 — discoverThemes(뉴스 발굴 POC) + correctMembership(soft-제외) + theme-sync cycle 통합 + classify_enabled. **POC 정확도/비용 게이트** | THEME-04 | W2 | — |
| **6** | UI 통합 — /themes page + /themes/[id](scanner row) + 종목 칩 stock-detail 삽입 + app-sidebar nav + empty/skeleton/error | THEME-02 | W3,W4 | — |
| **7** | 배포 + E2E — setup/deploy/smoke 스크립트(master-sync 복제, OAuth invoker) + **[BLOCKING] GCP 배포** + Playwright E2E(themes/user-themes/chips) + production smoke(themes count>0) | 전부 | W2,W3,W4,W5,W6 | — |

**병렬 가능 지점(worktree 분리 시):** W2 네이버/알파 파서, W3(server)↔W4(webapp 유저 CRUD). 단 MEMORY 규칙(parallel wave worktree 분리) 준수. config 가 순차라 안전하게 순차 진행 권장.

**대안 — phase 축소(플래너 판단):** 큰 phase 라 W5(AI 보강, THEME-04)를 별도 후속 phase(10.1)로 분리 가능. 단 사용자가 "한번에" 명시 선택 → 본 연구는 7-wave 단일 phase 전제. AI 가 POC 게이트 실패 시 W5 만 후속 분리하는 fallback 권장.

## RESEARCH COMPLETE

**Phase:** 10 - Theme Classification
**Confidence:** HIGH

### Key Findings
- **알파스퀘어 = SPA(SSR 아님) + 공개 무인증 JSON API 발견** (`api.alphasquare.co.kr/theme/v2/all-themes` 451테마, `/themes/{id}/stocks` 종목 code) — DOM 파싱 불필요, CONTEXT D-06 가정 정정. 정치 카테고리에 이재명(41)/한동훈(19) 등 정치인주 풍부.
- **네이버 테마 = robots.txt `/sise/` 명시 Allow** + EUC-KR HTML 구조 실측(table.type_1.theme 목록 ~7페이지, table.type_5 상세, /item/main.naver?code= 종목, info_txt 편입사유) — 토론방보다 리스크 낮음.
- **데이터 모델 = 단일 themes+is_system+owner_id 권장** (분리 대비 조인/fork/칩 단순) + theme_stocks provenance(source/confidence/effective/reason).
- **거의 모든 구성요소가 검증된 복제** — 워커=master-sync, 폴백=discussion-sync proxy, AI=discussion-sync classify, 유저 CRUD=watchlist, UI=scanner/watchlist. 진짜 신규는 네이버 파서 2개+알파 fetch+병합+상위3평균 4개뿐.
- **정렬(상위3평균) = server 실시간 stock_quotes 청크 IN 계산 권장**(scanner 선례, 최근 회귀 37afcde 청크 분할 교훈 반영) — 일1회 precompute보다 신선.

### File Created
`/Users/alex/repos/gh-radar/.planning/phases/10-theme-classification/10-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | 기존 의존성 재사용 + cheerio/iconv 표준 |
| 스크랩 소스 | HIGH | 네이버/알파 둘 다 실측(구조/charset/JSON API) |
| Architecture | HIGH | watchlist/scanner 선례 + 실측 데이터 기반 |
| AI 보강 | MEDIUM | 패턴 검증됨, 정확도/비용 POC 필요 |
| Pitfalls | HIGH | Phase 8/05.1/06.2 + 최근 회귀 교훈 |

### Open Questions (RESOLVED — 플래너/POC 해소)
- 알파스퀘어 수집 카테고리 범위(정치/트렌드만 vs 전체)
- 정렬 stats 위치 최종(server 실시간 vs precompute)
- AI 보강 POC 통과 기준(정확도/비용)

### Ready for Planning
Research complete. 7-wave 분할 권장안 포함. Planner can now create PLAN.md files.
