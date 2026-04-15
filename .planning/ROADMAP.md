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
- [ ] **Phase 7: News Ingestion** - Naver Search API 뉴스 수집 및 표시
- [ ] **Phase 8: Discussion Board** - 네이버 종목토론방 스크래핑 및 표시
- [ ] **Phase 9: AI Summarization** - Claude Haiku 뉴스/토론방 AI 요약 + 캐싱

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

### Phase 7: News Ingestion
**Goal**: 특정 종목과 관련된 최신 뉴스를 Naver Search API로 수집하여 종목 상세 페이지에 표시한다
**Depends on**: Phase 2, Phase 6
**Requirements**: NEWS-01
**Success Criteria** (what must be TRUE):
  1. 종목 상세 페이지에서 해당 종목 관련 뉴스 목록이 표시된다
  2. 뉴스 항목에 제목, 출처, 날짜가 표시되며 원문 링크가 작동한다
  3. Naver Search API 25,000 calls/day 한도 내에서 뉴스가 수집된다
**Plans**: TBD
**UI hint**: yes

### Phase 8: Discussion Board
**Goal**: 네이버 종목토론방의 최신 게시글을 on-demand로 스크래핑하여 종목 상세 페이지에 표시한다
**Depends on**: Phase 2, Phase 6
**Requirements**: DISC-01
**Success Criteria** (what must be TRUE):
  1. 종목 상세 페이지에서 해당 종목의 네이버 토론방 게시글 목록이 표시된다
  2. 데이터는 on-demand로 요청되며 5~10분 캐싱으로 불필요한 스크래핑이 방지된다
  3. 스크래핑 결과가 discussions 테이블에 저장된다
**Plans**: TBD
**UI hint**: yes

### Phase 9: AI Summarization
**Goal**: 수집된 뉴스와 토론방 데이터를 Claude Haiku가 요약하고 토론방에 긍/부정/중립 센티먼트 분석을 추가하여 종목 상세 페이지에 표시한다
**Depends on**: Phase 7, Phase 8
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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 0/TBD | Not started | - |
| 2. Backend API | 0/TBD | Not started | - |
| 3. Design System | 0/TBD | Not started | - |
| 4. Frontend Scaffold | 0/TBD | Not started | - |
| 5. Scanner UI | 0/TBD | Not started | - |
| 6. Stock Search & Detail | 0/TBD | Not started | - |
| 7. News Ingestion | 0/TBD | Not started | - |
| 8. Discussion Board | 0/TBD | Not started | - |
| 9. AI Summarization | 0/TBD | Not started | - |
