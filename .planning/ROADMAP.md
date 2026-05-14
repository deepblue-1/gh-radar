# Roadmap: gh-radar

## Overview

한국 주식 트레이더를 위한 실시간 종목 정보 웹앱을 처음부터 배포까지 구축한다. 데이터 수집 기반(KIS API + Supabase)을 먼저 세우고, Express 백엔드 API를 구축한 뒤, 디자인 시스템으로 프론트엔드 일관성을 확보한다. 이후 스캐너 UI → 검색/종목 상세 → 뉴스 파이프라인 → 토론방 스크래핑 → AI 요약 순서로 기능을 쌓아 최종적으로 트레이더가 급등 종목을 포착하고 시장 심리를 AI 요약으로 즉시 파악할 수 있는 제품을 완성한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - KIS OpenAPI 연동 + Supabase 스키마 구축
- [x] **Phase 2: Backend API** - Express API 서버 구축 및 Cloud Run 배포
- [x] **Phase 3: Design System** - 디자인 토큰, 컴포넌트 라이브러리, 테마
- [x] **Phase 4: Frontend Scaffold** - Next.js 앱 구축 및 Vercel 배포
- [ ] **Phase 5: Scanner UI** - 상한가 근접 종목 스캐너 화면
- [ ] **Phase 6: Stock Search & Detail** - 종목 검색 자동완성 + 상세 페이지
- [x] **Phase 7: News Ingestion** - Naver Search API 뉴스 수집 및 표시
- [x] **Phase 8: Discussion Board** - 네이버 종목토론방 스크래핑 및 표시
- [x] **Phase 08.1: Discussion Relevance Filter** - Claude Haiku 4.5 4-category 의미성 분류 + 웹앱 Switch 토글
- [x] **Phase 9: Daily Candle Data** - KRX 전 종목 (2020-01-02 ~ 현재) 일봉 OHLCV 수집 + 영업일 증분 갱신 (2026-05-12 완료, 4,003,432 rows)
- [ ] **Phase 10: AI Summarization** - Claude Haiku 뉴스/토론방 AI 요약 + 캐싱

## Phase Details

### Phase 1: Data Foundation
**Goal**: KIS OpenAPI에서 실시간 시세 데이터를 가져와 Supabase에 저장하는 기반 레이어가 작동한다
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02
**Success Criteria** (what must be TRUE):
  1. KIS OpenAPI 인증 토큰을 발급받아 등락률 순위 REST 엔드포인트를 성공적으로 호출할 수 있다
  2. Supabase에 stocks, news_articles, discussions, summaries 테이블이 생성되어 있다
  3. Ingestion Worker가 KIS API로부터 종목 시세 데이터를 읽어 stocks 테이블에 upsert한다
  4. 15 req/sec 이하의 속도 제한 로직이 적용되어 EGW00201 에러 없이 안정적으로 폴링한다
**Plans**: TBD

### Phase 2: Backend API
**Goal**: 프론트엔드가 소비할 수 있는 Express REST API가 Cloud Run에 배포되어 운영된다
**Depends on**: Phase 1
**Requirements**: INFR-03
**Success Criteria** (what must be TRUE):
  1. Express 앱이 Cloud Run에 배포되어 공개 URL로 접근 가능하다
  2. min-instances=1 설정으로 cold start 없이 API 요청에 응답한다
  3. `/api/scanner` 엔드포인트가 Supabase에서 종목 시세 데이터를 읽어 JSON으로 반환한다
  4. `/api/stocks/:code` 엔드포인트가 개별 종목 정보를 반환한다
**Plans:** 5 plans
- [x] 02-01-PLAN.md — server 워크스페이스 스캐폴드 + 공용 유틸/타입/매퍼/테스트 인프라
- [x] 02-02-PLAN.md — createApp 팩토리 + 미들웨어 스택 (helmet/CORS/rate-limit/request-id/pino/error/404)
- [x] 02-03-PLAN.md — 4개 엔드포인트 구현 + server.ts 엔트리 + 로컬 dev smoke
- [x] 02-04-PLAN.md — Dockerfile + deploy-server.sh + smoke-server.sh (정적 검증)
- [x] 02-05-PLAN.md — Cloud Run 실배포 + INV-1~INV-11 검증 + DEPLOY-LOG

### Phase 3: Design System
**Goal**: 모든 프론트엔드 UI가 공통으로 사용할 디자인 토큰, 컴포넌트, 레이아웃 템플릿이 정의되어 있다
**Depends on**: Nothing (can run in parallel with Phase 1-2)
**Requirements**: DSGN-01, DSGN-02, DSGN-03, DSGN-04, DSGN-05
**Success Criteria** (what must be TRUE):
  1. CSS 변수로 컬러 팔레트, 타이포그래피, 스페이싱 토큰이 정의되어 있어 하드코딩된 색상값이 없다
  2. 버튼 클릭 또는 시스템 설정에 따라 Light/Dark 테마가 전환되며 모든 컴포넌트에 반영된다
  3. Button, Card, Table, Badge, Input 등 공통 컴포넌트가 shadcn/ui 기반으로 커스터마이징되어 있다
  4. 네비게이션, 사이드바, 콘텐츠 영역을 포함한 페이지 레이아웃 템플릿이 존재한다
  5. HTML 카탈로그 문서를 브라우저로 열면 모든 토큰, 컴포넌트, 레이아웃을 시각적으로 확인할 수 있다
**Plans:** 1 plan (6 sub-plans / 3 waves)
- [x] 03-PLAN.md — Design System: webapp 스캐폴드 + 토큰/테마/컴포넌트/레이아웃/카탈로그
**UI hint**: yes

### Phase 4: Frontend Scaffold
**Goal**: Next.js 앱이 Vercel에 배포되어 접근 가능하며, 디자인 시스템을 기반으로 기본 레이아웃이 작동한다
**Depends on**: Phase 3
**Requirements**: INFR-04
**Success Criteria** (what must be TRUE):
  1. Next.js 앱이 Vercel 배포 URL로 접근 가능하다 — ✅ https://gh-radar-webapp.vercel.app
  2. 디자인 시스템의 CSS 변수와 shadcn/ui 컴포넌트가 앱에 임포트되어 정상 작동한다 — ✅ build PASS
  3. Phase 3에서 정의한 레이아웃 템플릿(네비게이션 포함)이 적용된 기본 페이지가 표시된다 — ✅ AppShell(hideSidebar) 적용 + smoke 통과
  4. Light/Dark 테마 전환이 앱에서 작동한다 — ✅ ThemeToggle 브라우저 smoke 통과
**Plans:** 1 plan
- [x] 04-PLAN.md — Frontend Scaffold: AppShell hideSidebar + apiFetch + /scanner placeholder + 에러 경계 + Vercel 환경변수
**UI hint**: yes

### Phase 5: Scanner UI
**Goal**: 트레이더가 상한가 근접 종목을 실시간으로 확인하고 임계값을 조절할 수 있는 스캐너 화면이 완성된다
**Depends on**: Phase 2, Phase 4
**Requirements**: SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, SCAN-06, SCAN-07
**Success Criteria** (what must be TRUE):
  1. 스캐너 페이지에 코스피/코스닥 전 종목의 현재가, 등락률, 거래량이 목록으로 표시된다
  2. 임계값 슬라이더(10~29%, 기본 25%)를 조작하면 기준값 이상의 등락률 종목만 필터링되어 표시된다
  3. 각 종목 행에 코스피/코스닥 구분 마켓 배지가 표시된다
  4. 화면에 마지막 데이터 갱신 시각이 표시된다
  5. 데이터가 1분 간격으로 자동 갱신되어 최신 등락률이 반영된다
**Plans:** 1 plan (4 waves)
- [x] 05-PLAN.md — Scanner UI: vitest 인프라 + 순수 유틸/훅 + chip+popover 필터 + Table/Card 듀얼 + 60s 폴링 + Suspense 페이지 교체
**UI hint**: yes

### Phase 05.1: Ingestion 운영 배포 — Cloud Run Job + Cloud Scheduler로 KIS 데이터 자동 수집 활성화 (INSERTED)

**Goal:** Phase 1에서 완성한 workers/ingestion/ 코드를 Cloud Run Job + Cloud Scheduler로 실제 GCP에 배포하여 평일 장 시간(09:00~15:59 KST) 매 분 KIS API → Supabase stocks 자동 폴링을 활성화한다. 코드 변경 없이 운영 인프라만 구성.
**Requirements**: INFR-01, INFR-02 (production 활성화)
**Depends on:** Phase 5
**Plans:** 6/6 plans executed ✅

Plans:
- [x] 05.1-01-PLAN.md — Wave 0 스크립트/YAML/DEPLOY-LOG 템플릿 스캐폴드
- [x] 05.1-02-PLAN.md — Wave 1 setup-ingestion-iam.sh 실행 (SA 2종 + Secret 4종 + accessor 4건)
- [x] 05.1-03-PLAN.md — Wave 2 deploy-ingestion.sh 실행 (이미지 27eecfd + Job + Invoker + Scheduler OAuth)
- [x] 05.1-04-PLAN.md — Wave 3 Alert policy `gh-radar-ingestion-failure` ENABLED + email channel(alex@jx1.io)
- [x] 05.1-05-PLAN.md — Wave 4 smoke 5/5 PASS (cycle complete, upserted=58)
- [x] 05.1-06-PLAN.md — Wave 5 DEPLOY-LOG 실값 기록 + STATE/ROADMAP/REQUIREMENTS 갱신

**Completed:** 2026-04-14 (KST 19:05)
**Image:** `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/ingestion:27eecfd`
**Alert policy:** `projects/gh-radar/alertPolicies/8385793339456322031` (email verification 대기)

### Phase 05.2: Scanner 데이터 품질 개선 — 거래대금 표시 전환 + 갱신시각 DB 기준 (INSERTED)

**Goal:** Scanner UI가 트레이더 관점에서 더 정확한 정보를 보여주도록 2가지 개선: (1) 거래량(주식수) 대신 거래대금(KRW)으로 표시해 저가주/고가주 간 직관적 비교 가능, (2) 갱신시각을 클라이언트 `Date.now()`가 아닌 DB `stocks.updated_at` 기준으로 표시해 장 외 시간에도 데이터 신선도 올바르게 반영.
**Requirements**: SCAN-04 (거래량 → 거래대금으로 재해석), 신규 SCAN-08 (갱신시각 서버 기준)
**Depends on:** Phase 5.1
**Plans:** 5/5 plans executed ✅

Plans:
- [x] 05.2-01-PLAN.md — DB migration (trade_amount 컬럼 추가)
- [x] 05.2-02-PLAN.md — 공용 타입 + ingestion map/upsert + vitest
- [x] 05.2-03-PLAN.md — server API (COLS + X-Last-Updated-At + CORS exposedHeaders)
- [x] 05.2-04-PLAN.md — webapp (formatTradeAmount + raw fetch + 거래대금 UI 교체)
- [x] 05.2-05-PLAN.md — Supabase/Cloud Run/Vercel 배포 + REQUIREMENTS/ROADMAP 갱신

**Completed:** 2026-04-14 (KST 21:10)
**Hotfix commit `3f9691d`:** 거래대금 정확값은 `inquirePrice.acml_tr_pbmn` 전용 (Research 오류 정정), inquirePrice 실패 시 trade_amount=0 → UI "-" 표시. rate limit 15→10 req/sec 보수적 운영.

### Phase 6: Stock Search & Detail
**Goal**: 트레이더가 종목명 또는 코드로 종목을 검색하고 해당 종목의 상세 정보를 볼 수 있다
**Depends on**: Phase 2, Phase 4
**Requirements**: SRCH-01, SRCH-02, SRCH-03
**Success Criteria** (what must be TRUE):
  1. 검색창에 종목명 또는 종목코드를 입력하면 자동완성 드롭다운이 나타난다
  2. 드롭다운에서 종목을 선택하면 해당 종목 상세 페이지로 이동한다
  3. 종목 상세 페이지에 현재가, 등락률, 거래량 등 상세 정보가 표시된다
**Plans:** 6 plans (프론트엔드 전용, 5 waves)
- [x] 06-01-PLAN.md — Wave 0 인프라: shadcn command 설치 + vitest setup + playwright + axe + e2e 픽스처
- [x] 06-02-PLAN.md — lib/stock-api.ts + useDebouncedSearch + useCmdKShortcut (+ 17 unit tests)
- [x] 06-03-PLAN.md — GlobalSearch ⌘K CommandDialog + SearchTrigger + AppShell 배선
- [x] 06-04-PLAN.md — StockHero / StockStatsGrid (em-dash 정책) / ComingSoonCard / StockDetailClient
- [x] 06-05-PLAN.md — /stocks/[code] page + not-found.tsx + error.tsx (Next 15 use(params))
- [x] 06-06-PLAN.md — playwright E2E (search/detail/a11y) + axe 접근성
**UI hint**: yes

### Phase 06.1: stock-master-universe (INSERTED)

**Goal:** 전 종목(KRX 상장 ~2,800종목) 마스터 테이블을 확보해 검색 universe 를 완전 종목으로 확장하고, 기존 `stocks` 의 마스터/시세/랭킹 역할을 3-테이블(`stocks` 마스터 / `stock_quotes` 시세 / `top_movers` 랭킹) 로 분리한다. 검색 API 는 마스터 universe 로 전환하고, 상세 페이지는 진입 시 on-demand KIS `inquirePrice` fetch 로 전환한다. STATE.md 의 '삼성전자 검색 불가' 사유 해결.
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SCAN-01..08 (회귀), INFR-02 (확장)
**Depends on:** Phase 6
**Plans:** 6/6 plans complete

Plans:
- [x] 06.1-01-PLAN.md — Wave 0 타입·워크스페이스·테스트 스캐폴드 (`packages/shared` 타입 + `workers/master-sync` 신설 + `server/src/kis/` 복제 + RED 테스트)
- [x] 06.1-02-PLAN.md — Wave 1 마이그레이션 SQL (rename + split + FK re-point + RLS 승계 + pg_trgm) + [BLOCKING] supabase db push
- [x] 06.1-03-PLAN.md — Wave 2 master-sync 구현 (KRX OpenAPI fetch + map + upsert + retry + integration test)
- [x] 06.1-04-PLAN.md — Wave 2 server stocks 라우트 전환 (마스터 universe search + on-demand inquirePrice detail + cached 폴백)
- [x] 06.1-05-PLAN.md — Wave 2 scanner 라우트 + ingestion 파이프라인 분해 (stock_quotes + top_movers 양쪽 쓰기, stocks 절대 안 건드림)
- [x] 06.1-06-PLAN.md — Wave 3 production 배포 (master-sync Job + Scheduler + 마스터 백필 + ingestion/server 재배포 + E2E 회귀 '삼성전자 검색 PASS')

### Phase 06.2: Auth + Watchlist (INSERTED)

**Goal:** Google OAuth 로그인 도입 + 앱 전체 로그인 필수 전환 + 사용자별 관심종목(Watchlist) CRUD + Scanner/Watchlist 반응형 듀얼(`lg+` Table, `<lg` 인포그래픽 카드 InfoStockCard 공유) + ⭐ 토글 Ghost variant.
**Requirements**: AUTH-01 (Deferred), AUTH-02 (Google 완료, Kakao 별도), PERS-01
**Depends on:** Phase 6, Phase 06.1
**Plans:** 10/10 plans complete

Plans:
- [x] 06.2-01-PLAN.md — Wave 1 Supabase Auth Foundation (@supabase/ssr 3-파일 클라이언트 + middleware + callback + AuthProvider + layout 배선)
- [x] 06.2-02-PLAN.md — Wave 1 Watchlists 스키마 + RLS 4정책 + BEFORE INSERT trigger + [BLOCKING] supabase db push + stocks/stock_quotes RLS authenticated 확장
- [x] 06.2-03-PLAN.md — Wave 2 /login 페이지 + middleware route guard 활성화 + open-redirect 가드 + clickjacking 헤더
- [x] 06.2-04-PLAN.md — Wave 2 AppShell sidebar 활성화 + AppSidebar (스캐너/관심종목 nav) + UserSection 팝오버 (이메일+로그아웃)
- [x] 06.2-05-PLAN.md — Wave 3 Sparkline + InfoStockCard (Scanner/Watchlist 공통) + Scanner card-list 내부 교체 + breakpoint md→lg 통일
- [x] 06.2-06-PLAN.md — Wave 3 /watchlist 페이지 + watchlist-api + useWatchlistQuery (1분 폴링) + WatchlistTable/Empty/Skeleton/Client (lg+ Table, <lg InfoStockCard)
- [x] 06.2-07-PLAN.md — Wave 4 ⭐ WatchlistToggle (Ghost variant) + useWatchlistSet 전역 멤버십 + 5개 위치 통합 (StockHero, Scanner Table/Card, Watchlist Table/Card) + 50 limit P0001 + optimistic rollback
- [x] 06.2-08-PLAN.md — Wave 5 Playwright auth fixture + storageState + auth.spec.ts + watchlist.spec.ts + 기존 4 spec 전환 + a11y UserSection
- [x] 06.2-09-PLAN.md — Wave 1 SETUP.md (Google Cloud Console + Supabase Dashboard + Vercel env 절차) + .env.local.example 갱신
- [x] 06.2-10-PLAN.md — Wave 5 mockup/06-2 정리 + middleware matcher 정합 + REQUIREMENTS.md AUTH/PERS status 갱신

### Phase 7: News Ingestion
**Goal**: 특정 종목과 관련된 최신 뉴스를 Naver Search API로 수집하여 종목 상세 페이지에 표시한다
**Depends on**: Phase 2, Phase 6
**Requirements**: NEWS-01
**Success Criteria** (what must be TRUE):
  1. 종목 상세 페이지에서 해당 종목 관련 뉴스 목록이 표시된다
  2. 뉴스 항목에 제목, 출처, 날짜가 표시되며 원문 링크가 작동한다
  3. Naver Search API 25,000 calls/day 한도 내에서 뉴스가 수집된다
**Plans:** 6 plans (4 waves) — **Completed 2026-04-17**
- [x] 07-01-PLAN.md — Wave 0 Supabase 마이그레이션(api_usage + idx_news_created_at) + packages/shared news-sanitize + 테스트 스텁 인프라 + [BLOCKING] supabase db push
- [x] 07-02-PLAN.md — Wave 1 workers/news-sync worker (naver client + sanitize pipeline + apiUsage RPC + retention + p-limit + unit/integration tests)
- [x] 07-03-PLAN.md — Wave 1 server 라우트 GET/POST (Zod clamp + 30s cooldown + naverClient 주입 + CORS Retry-After + supertest)
- [x] 07-04-PLAN.md — Wave 2 webapp UI 컴포넌트 6종 + fetchStockNews/refreshStockNews + StockDetailClient 교체 + StockHero ← 링크 + ApiClientError.details
- [x] 07-05-PLAN.md — Wave 2 /stocks/[code]/news 페이지 (Next 15 use(params) + 7일/하드캡 100 + ← back-nav)
- [x] 07-06-PLAN.md — Wave 3 IAM + deploy 스크립트 + server 재배포 + Playwright E2E(news.spec.ts 6건) + [BLOCKING] GCP 실배포 + DEPLOY-LOG
**UI hint**: yes

### Phase 07.1: news content ingestion enhancement — description 저장 (INSERTED)

**Goal**: news_articles 에 description 컬럼을 추가하고 news-sync worker 가 Naver API 의 description 스니펫을 stripHtml 후 저장하여 Phase 9 AI 요약의 입력 데이터를 확보한다
**Depends on**: Phase 7
**Requirements**: NEWS-01 (enhancement)
**Success Criteria** (what must be TRUE):
  1. news_articles.description (text nullable) 컬럼이 Supabase 프로덕션 DB 에 존재한다
  2. news-sync worker 가 신규 수집 시 stripHtml 처리된 description 을 upsert 한다
  3. 기존 1,103 행은 description=NULL 로 유지 (또는 nightly refill — planner 재량)
  4. 기존 UPSERT idempotency (ON CONFLICT DO NOTHING) 유지 — description 변경이 content_hash 에 영향 없음 확인
  5. server/webapp/worker 전 워크스페이스 test + typecheck + build green
**Rationale**: 2026-04-17 Naver API 실측 — description 평균 126자, 유니크 주제 4-5개/20건 → 트레이더 핵심 정보 70-80% 커버. URL 원문 scraping 은 본 phase 범위 아님 (Phase 9 POC 후 재검토).
**Plans:** 1 plan (1 wave, [BLOCKING] supabase db push)

Plans:
- [x] 07.1-01-PLAN.md — Wave 1 migration(ADD COLUMN) + shared NewsArticle 확장 + worker/server pipeline description 저장 + 기존 테스트 회귀 + [BLOCKING] supabase db push

**Completed:** 2026-04-18 (migration 20260417120200 + Cloud Run Job image d9b5af3 재배포 + 신규 수집부터 description 저장 확인)

### Phase 07.2: news-sync rate-limit 안정화 + news_articles 재수집 (INSERTED)

**Goal**: news-sync worker 가 Naver API 429 rate-limit 에 안정적으로 대응하여 매 tick top_movers + watchlists 전 종목을 처리하고, 기존 news_articles 를 TRUNCATE 후 clean-slate 로 재수집하여 description 커버리지 100% 확보
**Depends on**: Phase 7, Phase 7.1
**Requirements**: NEWS-01 (stability enhancement)
**Success Criteria** (what must be TRUE):
  1. news-sync Cloud Run Job 실행 시 `skipped` 0~5 이내 (현재 40+) — stopAll 이 rate-limit 하나로 cycle 전체를 중단시키지 않음
  2. NaverRateLimitError 가 NaverBudgetExhaustedError 와 **분리**된 Error class 로 정의되고 per-stock 에서 exponential backoff 1~2회 retry 후 fail-isolated 처리 (종목 1개 실패가 cycle 전체를 중단시키지 않음)
  3. concurrency 기본값 8 → **3** (NEWS_SYNC_CONCURRENCY env override 가능) — Naver ~10 QPS 한도에 안전 마진
  4. news_articles TRUNCATE 후 1 tick 재수집으로 top_movers+watchlists 전 종목(~55개)의 뉴스·description 채워짐 — `abort signal from Naver` 0건 + `inserted > 100`
  5. UPSERT 정책은 `ON CONFLICT DO NOTHING` 유지 (TRUNCATE + 재수집으로 description 채워지므로 COALESCE 불필요)
**Rationale**: 2026-04-18 진단 — 매 tick `abort signal from Naver` 5+회 + `skipped: 40+` / 55 로 74% 종목 뉴스 0건. api_usage 94건으로 daily budget(24,500) 은 충분하지만 초당 QPS 초과 → 429 → stopAll → cycle 조기 중단. description 커버리지도 3 종목 / 55 종목에 그침. 수집 시작 1일차라 기존 1,266행 폐기 손실 낮음 → clean-slate 가 UPSERT COALESCE 자연 backfill 보다 단순/빠름.
**Plans:** 1 plan (1 wave, [BLOCKING] TRUNCATE news_articles)

Plans:
- [x] 07.2-01-PLAN.md — NaverRateLimitError 분리 + concurrency 3 + per-stock backoff retry + Cloud Run Job 재배포 + TRUNCATE news_articles + 재수집 검증

**Completed:** 2026-04-18 (image `news-sync:141ccdc` / inserted=6,187 / skipped=0 / abort=0 / top_movers 55/55 커버 / description 99.9%)

### Phase 8: Discussion Board
**Goal**: 네이버 종목토론방의 최신 게시글을 on-demand로 스크래핑하여 종목 상세 페이지에 표시한다
**Depends on**: Phase 2, Phase 6
**Requirements**: DISC-01
**Success Criteria** (what must be TRUE):
  1. 종목 상세 페이지에서 해당 종목의 네이버 토론방 게시글 목록이 표시된다
  2. 데이터는 on-demand로 요청되며 5~10분 캐싱으로 불필요한 스크래핑이 방지된다
  3. 스크래핑 결과가 discussions 테이블에 저장된다
**Plans:** 7 plans (3 waves)
- [x] 08-00-poc-proxy-dom-PLAN.md — Wave 1 POC: Bright Data Web Unlocker + stock.naver.com community **JSON API 옵션 5** 채택 (cheerio/iconv/iframe body fetch 모두 폐기) + zone `gh_radar_naver` 신설 + fixture 캡처
- [x] 08-01-shared-types-scaffold-PLAN.md — Wave 1 packages/shared Discussion 타입 + discussion-sanitize 3 함수 (ISO+dot 양 포맷) + workers/discussion-sync 스캐폴드 + 테스트 스텁 (server 16 todo + e2e 5 skip)
- [x] 08-02-discussion-sync-worker-PLAN.md — Wave 1 workers/discussion-sync 워커 (Bright Data → JSON API + zod 검증 + UPSERT DO UPDATE + retention 90일 + 예산 카운터 + first-time/stale 종목 backfill loop max 10 페이지)
- [x] 08-03-server-discussion-routes-PLAN.md — Wave 1 server GET/POST discussions 라우트 (Zod + 캐시 TTL 10분 + 쿨다운 30초 + 스팸 필터 D11 + before cursor 무한 스크롤 + integration test 17건)
- [x] 08-04-webapp-discussion-section-PLAN.md — Wave 2 상세 카드 섹션 — StockDiscussionSection + 5 컴포넌트 + Stale Badge + 30s 쿨다운 + ComingSoonCard 교체
- [x] 08-05-webapp-discussion-page-PLAN.md — Wave 2 /stocks/[code]/discussions 풀페이지 Compact 3열 grid + Next 15 use(params) + IntersectionObserver 무한 스크롤
- [x] 08-06-deploy-and-e2e-PLAN.md — Wave 3 IAM + deploy 스크립트 3종 + server 재배포 + Playwright E2E 8 spec + smoke 8/8 PASS + DEPLOY-LOG (Cloud Run Job + Scheduler + 15,463 row upserted, 0 errors)
**UI hint**: yes

**Completed:** 2026-04-18 (Wave 3 deploy + smoke 8/8 PASS, Cloud Run Job `gh-radar-discussion-sync` + Scheduler `gh-radar-discussion-sync-hourly` + Secret `gh-radar-brightdata-api-key`. server `/api/stocks/:code/discussions` 200 OK 실측 (1.04s), DB 15,463 row · 50+ 종목 분포. POC PIVOT 으로 cheerio/iconv-lite/body iframe fetch 모두 제거 — RESEARCH 가정 무효화)

### Phase 08.1: 종목토론 의미성 AI 분류 + 웹앱 필터 토글 (INSERTED)

**Goal:** 수집된 네이버 종목토론방 글을 Claude Haiku 4.5 inline 분류(4-category: price_reason/theme/news_info/noise) 하여 `discussions.relevance`/`classified_at` 컬럼에 저장하고, 풀페이지 `/stocks/[code]/discussions` 에 Switch 토글(기본 ON = 의미있음만) + URL sync 로 노이즈를 제거한다.
**Requirements**: DISC-01 (enhancement), DISC-01.1
**Depends on:** Phase 8
**Plans:** 8/7 plans complete
**Completed:** 2026-04-22 (Wave 1~4 완료 — 서버/워커/웹앱 코드 landed + 로컬 테스트 PASS. production backfill + 배포는 ANTHROPIC_API_KEY 사용자 제공 이후 manual follow-up)

**Success Criteria** (what must be TRUE):
  1. `discussions` 테이블에 `relevance` (price_reason|theme|news_info|noise|NULL) + `classified_at` 컬럼이 존재하고 CHECK 제약이 적용된다
  2. `workers/discussion-sync` cycle 이 수집 직후 같은 실행에서 Claude Haiku Sync API 로 신규 행을 분류하고 `classified_at` 을 기록한다 (p-limit 5, temperature 0, max_tokens 10)
  3. server `GET /api/stocks/:code/discussions?filter=meaningful` 이 `relevance IS NULL OR relevance != 'noise'` 로 필터링하여 응답한다
  4. 웹앱 `/stocks/[code]/discussions` 에 Switch 토글이 존재하고 (기본 ON=의미있음만), URL `?filter=meaningful|all` 로 상태가 동기화된다
  5. 상세 페이지 Card(top-5, 24h) 는 수정되지 않는다 (Phase 8 UI 구조 유지)
  6. 기존 15k 누적 discussions 가 백필 스크립트로 4-category 분배된다

Plans:
- [x] 08.1-01-PLAN.md — Wave 1 DB migration (relevance/classified_at 컬럼 + 2 partial index) + packages/shared Discussion 타입 확장
- [x] 08.1-02-PLAN.md — Wave 1 server /discussions GET 의 filter=meaningful 분기 + toDiscussion 에 relevance/classifiedAt 노출
- [x] 08.1-03-PLAN.md — Wave 2 workers/discussion-sync 의 inline classify 모듈 (Claude Haiku 4.5 + p-limit(5) + max_tokens=10 + temperature=0)
- [x] 08.1-04-PLAN.md — Wave 2 server /refresh 에 classify-and-persist + GCP Secret gh-radar-anthropic-api-key + deploy 스크립트 2종 업데이트 + task-timeout=1800
- [x] 08.1-05-PLAN.md — Wave 3 15k 기존 행 일회성 backfill 스크립트 (안전장치 MAX_BACKFILL_ROWS + SIGINT graceful)
- [x] 08.1-06-PLAN.md — Wave 3 webapp /discussions 풀페이지 Switch 토글 + URL sync + 빈 상태 카피 분기 (상세 Card 미변경)
- [x] 08.1-07-PLAN.md — Wave 4 Playwright E2E 4 시나리오 + REQUIREMENTS/ROADMAP/STATE 갱신 + SUMMARY (production smoke 는 ANTHROPIC_API_KEY 주입 이후 manual)
**UI hint**: yes

### Phase 9: Daily Candle Data Collection
**Goal**: KRX 상장 전 종목(~2,800)의 일봉 OHLCV 데이터를 Supabase에 수집·저장하고, 매 영업일 EOD 후 신규 영업일 데이터를 증분 수집하여 향후 분석 기능(가격 패턴/변동성/추세 등)의 기반 데이터 레이어를 마련한다
**Depends on**: Phase 06.1 (stocks 마스터 universe — 수집 대상 종목 리스트)
**Requirements**: DATA-01 (신규)
**Status**: ✅ Complete (2026-05-12)
**Success Criteria** (what must be TRUE):
  1. 일봉 OHLCV 테이블 `stock_daily_ohlcv` 이 Supabase에 존재하고 PK=(code, date), 컬럼은 open/high/low/close/volume/trade_amount 포함, **4,003,432 행** (백필 범위 **2020-01-02 ~ 2026-05-11**) 을 보유한다 ✅
  2. 초기 백필 스크립트가 KRX OpenAPI bydd_trd 로부터 종목별 일봉 OHLCV 를 수집해 upsert한다 (Cloud Run Job 1회 실행 51분, 1,658 days, KOSPI+KOSDAQ Promise.all 병렬) ✅
  3. Cloud Run Job + Cloud Scheduler가 매 영업일 EOD 이후(`30 17 * * 1-5` KST) 신규 1영업일 데이터를 **증분** 수집한다 (full re-fetch 금지, recover `10 8 * * 1-5` 익영업일 보완) ✅
  4. 무료 API 한도 내 안정 동작 — 401 가드 + per-day try/catch fail-isolation + withRetry + chunked UPSERT (백필 중 1일 numeric overflow 발생 → hotfix migration + per-day 격리로 전체 성공 입증) ✅
  5. 데이터 정합성 — 미수집 종목 **0.00%** (0/2,771 active), 최근 30영업일 중 결측 일자 **0** (0/19 days incomplete) ✅
**Plans:** 6 plans
- [x] 09-01-PLAN.md — Wave 1 마이그레이션 SQL + StockDailyOhlcv/BdydTrdRow 타입
- [x] 09-02-PLAN.md — Wave 1 candle-sync 워크스페이스 스캐폴드 (Dockerfile + config/logger/retry/supabase)
- [x] 09-03-PLAN.md — Wave 1 KRX 클라이언트 + 파이프라인 5종 + 4 unit tests
- [x] 09-04-PLAN.md — Wave 1 MODE dispatch (backfill/daily/recover) + bootstrapStocks + businessDay
- [x] 09-05-PLAN.md — Wave 2 IAM + deploy/smoke 스크립트 + alert YAML 2종
- [x] 09-06-PLAN.md — Wave 3 KRX 실측 fixture + production push + 백필 + change_rate hotfix + DEPLOY-LOG

### Phase 09.1: intraday-current-price (RE-SCOPED 2026-05-14 — KIS → 키움 완전 대체)

**Goal:** 평일 장중 (09:00~15:30 KST) 활성 거래 종목 (~1,898) 의 시세를 **키움 REST API 만으로** 매분 수집한다. STEP1: `ka10027` 페이지네이션으로 활성 1,898 종목의 close/change/volume + 등락률 → `stock_quotes` / `top_movers` / `stock_daily_ohlcv` 오늘자 row UPSERT. STEP2: `ka10001` 단일 종목 호출로 hot set (등락률 상위 200 ∪ watchlist unique, ~250 종목) 의 OHLC + 상한가/하한가/시가총액 → `stock_quotes` / `stock_daily_ohlcv` 오늘자 row UPSERT. trade_amount = volume × close 근사값 (트레이딩 시그널 용도). **KIS ingestion(workers/ingestion) 폐기 + server/src/kis → kiwoom 교체 + Cloud Run service 도 VPC connector 추가**. Direct VPC Egress + Cloud NAT + Static External IP 1개로 worker + server 가 동일 outbound IP 공유 (키움 IP whitelist 1개 등록). EOD candle-sync 17:30 가 stock_daily_ohlcv 오늘자 row 의 공식 OHLCV 로 최종 overlay.
**Requirements**: DATA-02 (신규, 재정의)
**Depends on:** Phase 09
**Plans:** 5/11 plans executed
**Success Criteria** (what must be TRUE):
  1. `workers/intraday-sync` 워크스페이스가 candle-sync 1:1 mirror 구조로 존재하며, STEP1 (ka10027 페이지네이션) + STEP2 (ka10001 hot set) 두 단계 cycle 을 매분 실행
  2. Supabase 마이그레이션: `kis_tokens` DROP + `kiwoom_tokens` CREATE (token_type, access_token, expires_at, fetched_at) + `intraday_upsert_close(jsonb)` RPC + `intraday_upsert_ohlc(jsonb)` RPC 가 production 적용. 모든 RPC + 신규 테이블 service_role 만 호출 가능 (anon/authenticated REVOKE 명시)
  3. Cloud Run Job `gh-radar-intraday-sync` + Cloud Scheduler (`* 9-15 * * 1-5` Asia/Seoul) 가 GCP 에 ENABLED 상태로 배포
  4. VPC `gh-radar-vpc` + subnet + Cloud Router + Cloud NAT + Reserved Static IP 가 asia-northeast3 리전에 생성. Cloud Run Job (intraday-sync) **+ Cloud Run service (gh-radar-server)** 둘 다 동일 VPC connector 로 outbound traffic 이 동일 static IP 로 routing
  5. server/src/kis/* 가 server/src/kiwoom/* 로 교체. `inquirePriceToQuoteRow` 가 ka10001 응답 매핑. 종목 상세 페이지 on-demand 호출이 키움 동기 호출로 실시간성 유지
  6. 키움 화이트리스트에 Static IP 등록 완료 (사용자 액션) 후 production 첫 cycle 이 ka10027 응답 ≥1,500 row + ka10001 hot set ~250 종목 호출 성공 → `stock_quotes` 1,898 row 갱신 + `stock_daily_ohlcv` 오늘자 row 의 close/change_amount/change_rate/volume + hot set OHLC 갱신
  7. **KIS ingestion 완전 폐기**: Cloud Run Job `gh-radar-ingestion` + Scheduler + SA `gh-radar-ingestion-sa` + Secrets `gh-radar-kis-app-key`/`gh-radar-kis-app-secret` GCP 에서 삭제. workers/ingestion + server/src/kis + packages/shared/src/kis.ts 디렉터리/파일 삭제 (git history 보존). `kis_tokens` 테이블 drop migration 적용
  8. Phase 9 candle-sync EOD `30 17` 와 충돌 없음 — intraday-sync 는 `stock_daily_ohlcv` 의 close/change/volume (STEP1) + open/high/low (STEP2 hot set only) UPSERT, EOD 17:30 candle-sync 가 모든 OHLCV 컬럼을 공식값으로 덮어쓰기
  9. `trade_amount = volume × close` 근사값 정책이 코드 주석에 명시 (현 `workers/ingestion/src/pipeline/map.ts:5` 의 "근사값은 허용하지 않음" 정책 반전, 새 mapper 에 사유 + 사용처 트레이딩 시그널 명시)

Plans:
- [x] 09.1-01-PLAN.md — Wave 0 마이그레이션 SQL 4종 (kis_tokens DROP + kiwoom_tokens CREATE + intraday_upsert_close/ohlc RPC)
- [x] 09.1-02-PLAN.md — Wave 0 packages/shared/src/kiwoom.ts 4 타입 + 단위 테스트
- [x] 09.1-03-PLAN.md — Wave 0 workers/intraday-sync 워크스페이스 스캐폴드 (Dockerfile + config/logger/retry/supabase)
- [x] 09.1-04-PLAN.md — Wave 1 STEP1 — 키움 OAuth client + Supabase token cache + ka10027 페이지네이션 + parseSignedPrice/_AL strip + map.ts
- [x] 09.1-05-PLAN.md — Wave 1 STEP2 — ka10001 hot set + mapOhlc + computeHotSet + 5 fixture (보통주/KOSDAQ/변동성/우선주/ETF)
- [ ] 09.1-06-PLAN.md — Wave 1 pipeline 통합 — bootstrap + topMovers + 2 RPC caller + stock_quotes 양단계 UPSERT + runIntradayCycle + 휴장일 가드
- [ ] 09.1-07-PLAN.md — Wave 2 server/src/kis → server/src/kiwoom 교체 + inquirePriceToQuoteRow ka10001 매핑 + routes/stocks 전환
- [ ] 09.1-08-PLAN.md — Wave 3 인프라 스크립트 (setup-iam VPC+NAT+Static IP, deploy worker+VPC, smoke INV, deploy-server VPC connector 옵션 추가) + alert YAML
- [ ] 09.1-09-PLAN.md — [BLOCKING] Wave 4 cutover #1 — Supabase migration push + setup-iam 실행 + KIWOOM secret 사용자 등록 + 키움 IP 화이트리스트 + worker 배포 + smoke
- [ ] 09.1-10-PLAN.md — [BLOCKING] Wave 4 cutover #2 — server VPC 재배포 + 종목 상세 페이지 키움 호출 검증 + DEPLOY-LOG #2
- [ ] 09.1-11-PLAN.md — [BLOCKING] Wave 4 cutover #3 — KIS 폐기 (RESEARCH §12 11-step) + kis_tokens DROP push + 코드 git rm + STATE/REQUIREMENTS/ROADMAP 갱신

### Phase 09.2: 종목 상세페이지 상단 일봉차트 (INSERTED)

**Goal:** 종목 상세페이지(`/stocks/[code]`) 상단에 해당 종목의 일봉차트를 출력해 트레이더가 가격 흐름을 즉시 시각적으로 확인할 수 있게 한다. Phase 9 에서 적재된 `stock_daily_ohlcv` (4,003,432 행) 데이터를 source 로 사용.
**Requirements**: TBD (Phase 6 detail page 확장)
**Depends on:** Phase 9 (일봉 데이터), Phase 6 (상세 페이지 구조)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 09.2 to break down)

### Phase 10: AI Summarization
**Goal**: 수집된 뉴스와 토론방 데이터를 Claude Haiku가 요약하고 토론방에 긍/부정/중립 센티먼트 분석을 추가하여 종목 상세 페이지에 표시한다
**Depends on**: Phase 7, Phase 7.1, Phase 8
**Requirements**: NEWS-02, DISC-02
**Success Criteria** (what must be TRUE):
  1. 종목 상세 페이지의 뉴스 섹션에 Claude Haiku가 생성한 뉴스 요약이 표시된다
  2. 종목 상세 페이지의 토론방 섹션에 요약과 함께 긍정/부정/중립 센티먼트 비율이 표시된다
  3. 동일한 content-hash를 가진 데이터는 Claude API를 재호출하지 않고 캐시된 요약을 반환한다
  4. Claude API 호출당 input 3,000 토큰 이하, max_tokens=250 제한이 적용된다
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 1/1 | Complete | 2026-04-13 |
| 2. Backend API | 5/5 | Complete | 2026-04-13 |
| 3. Design System | 1/1 (6 sub) | Complete | 2026-04-13 |
| 4. Frontend Scaffold | 1/1 | Complete | 2026-04-13 |
| 5. Scanner UI | 1/1 | Complete | 2026-04-13 |
| 05.1. Ingestion Deploy | 6/6 | Complete | 2026-04-14 |
| 05.2. Scanner Quality | 5/5 | Complete | 2026-04-14 |
| 6. Stock Search & Detail | 6/6 | Complete | 2026-04-16 |
| 06.1. stock-master-universe | 6/6 | Complete | 2026-04-16 |
| 06.2. Auth + Watchlist | 10/10 | Complete | 2026-04-16 |
| 7. News Ingestion | 6/6 | Complete | 2026-04-17 |
| 07.1. News description | 1/1 | Complete | 2026-04-18 |
| 07.2. News rate-limit | 1/1 | Complete | 2026-04-18 |
| 8. Discussion Board | 7/7 | Complete | 2026-04-18 |
| 08.1. Discussion Relevance Filter | 8/7 | Complete    | 2026-04-22 |
| 9. Daily Candle Data | 6/6 | Complete | 2026-05-12 |
| 10. AI Summarization | 0/TBD | Not started | - |
