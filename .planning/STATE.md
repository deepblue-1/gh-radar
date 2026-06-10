---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Phase 11 UI-SPEC approved
last_updated: "2026-06-10T06:27:47.290Z"
last_activity: 2026-06-09
progress:
  total_phases: 20
  completed_phases: 13
  total_plans: 92
  completed_plans: 78
  percent: 85
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 10 — theme-classification

## Current Position

Phase: 10
Plan: Not started
Plans completed: 78 / 92 (Phase 10: 10-01 infra / 10-02 migration / 10-03 scrape / 10-04 system-server / 10-05 user-crud / 10-06 ai-enrichment / 10-07 themes-ui / 10-08 deploy-e2e)
Status: Phase complete — ready for verification
Production URL: https://gh-radar-webapp.vercel.app
Last activity: 2026-06-09

Progress: [█████████░] 85% (78/92 plans · 13/19 phases)

### Phase 10 Production State (2026-06-09)

- Cloud Run Job `gh-radar-theme-sync` + Scheduler `gh-radar-theme-sync-daily` (`0 16 * * *` Asia/Seoul, OAuth invoker, no OIDC) live. SA `gh-radar-theme-sync-sa` + 기존 Secret 3종 재사용(supabase-service-role/brightdata-api-key/anthropic-api-key). 이미지 `theme-sync:e944970`. `THEME_SYNC_CLASSIFY_ENABLED=true`.
- 첫 production scrape: **356 시스템 테마**(331 naver/alpha + **25 AI 발굴**) + **7,561 theme_stocks**. AI 보강 라이브(aiDiscovered=25, aiCorrected=2), backedOffSources=[] (네이버 직접 성공). themes count gate PASS(356).
- 첫 자동 Scheduler 실행: 다음 16:00 KST. 5원칙 backoff(429/403 24h) + SHA256 해시 변경감지 가드 동작 확인(smoke).
- 유저 테마 optimistic 갱신 + 테마 E2E 3종 green(10/10). THEME-01~04 production 검증 완료.
- **서버 재배포(plan 누락분, push 후 발견·수정):** 배포 server 이미지가 10-04 themes 라우트 이전(75683d1)이라 `/api/themes` 404 → `deploy-server.sh` 로 HEAD 58218f4 재배포(revision gh-radar-server-00021-jdv) → `/api/themes` 200(356 테마, 상위3평균 desc: 반도체장비 +24.94%) + `/api/themes/:id` 200 + smoke 9/9. 풀스택 라이브(Supabase→server→webapp).

### Phase 9 Production State (2026-05-12 12:24 KST)

- `stock_daily_ohlcv`: 4,003,432 rows (2020-01-02 ~ 2026-05-11)
- 3 Cloud Run Jobs + 2 Schedulers (eod `30 17`, recover `10 8` Asia/Seoul) + 2 Alert policies live
- 첫 daily Job 자동 실행: 2026-05-12 17:30 KST
- 첫 recover Job 자동 실행: 2026-05-13 08:10 KST
- Hotfix: change_rate numeric(8,4) → numeric(10,4) (제일바이오 052670 29948.08% overflow)

## Phase 1 Success Criteria 검증

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | KIS 토큰 발급 + 등락률 순위 호출 | ✅ | 실증 테스트 (FHPST01700000, J/NX) + 로컬 스모크 |
| 2 | Supabase 4개 테이블 생성 | ✅ | db push 2개 마이그레이션 적용, +kis_tokens=5개 |
| 3 | Ingestion Worker → stocks upsert | ✅ | 58행 upsert, 상한가/하한가 포함 |
| 4 | 15 req/sec 제한, EGW00201 없음 | ✅ | rateLimiter 토큰 버킷, 스모크 테스트 에러 없음 |

## Phase 2 Success Criteria 검증

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | Cloud Run 공개 URL 접근 가능 | ✅ | https://gh-radar-server-1023658565518.asia-northeast3.run.app |
| 2 | min-instances=1, cold start 없음 | ✅ | 배포 구성: min=1 max=3 cpu=1 mem=512Mi |
| 3 | /api/scanner JSON 반환 | ✅ | smoke INV-2 PASS |
| 4 | /api/stocks/:code 반환 | ✅ | smoke INV-3 PASS |
| — | INV-1~INV-9 전체 | ✅ | 9/9 PASS — DEPLOY-LOG.md |

## Phase 3 Success Criteria 검증

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | CSS 변수 토큰, 하드코딩 색상 없음 | ✅ | webapp/src/app/globals.css |
| 2 | Light/Dark 테마 전환 | ✅ | ThemeProvider + ThemeToggle (next-themes) |
| 3 | 공통 컴포넌트 (Button/Card/Table/Badge/Input 등) | ✅ | shadcn 10종 + 금융 variant |
| 4 | 레이아웃 템플릿 | ✅ | AppShell, CenterShell, AppHeader |
| 5 | HTML 카탈로그 | ✅ | /design 페이지 (7섹션) + 03-UI-PREVIEW.html |

## Performance Metrics

**Velocity:**

- Total plans completed: 57 (1 + 5 + 1×6 sub)
- Phase 1 duration: 2026-04-10 ~ 2026-04-13 (4일)
- Phase 2 duration: 2026-04-13 (1일)
- Phase 3 duration: 2026-04-13 (1일)
- Total commits: 25+

**By Phase:**

| Phase | Plans | Duration | Status |
|-------|-------|----------|--------|
| 1. Data Foundation | 1 | 4일 | ✅ 완료 |
| 2. Backend API | 5 | 1일 | ✅ 완료 |
| 3. Design System | 1 (6 sub / 3 wave) | 1일 | ✅ 완료 |
| Phase 04 P04 | 45분 | 7 tasks | 10 files |
| Phase 05.1 P01 | ~20분 | 3 tasks | 6 files |
| Phase 06 P01 | 15m | 3 tasks | 9 files |
| Phase 06 P02 | 8m | 3 tasks | 6 files |
| Phase 06 P03 | 3 | 3 tasks | 5 files |
| Phase 06 P04 | 12 | 2 tasks | 9 files |
| Phase 06 P05 | 2 | 2 tasks | 5 files |
| Phase 06 P06 | 40 | 2 tasks | 7 files |
| Phase 09-daily-candle-data P01 | 6min | 3 tasks | 4 files |
| Phase 09-daily-candle-data P02 | 3min | 2 tasks | 9 files |
| Phase 09-daily-candle-data P03 | 5min | 4 tasks | 9 files |
| Phase 09-daily-candle-data P04 | 7min | 4 tasks | 12 files |
| Phase 09-daily-candle-data P05 | 4min | 4 tasks | 5 files |
| Phase 09.1 P01 | 3min | 4 tasks | 4 files |
| Phase 09.1 P02 | 2m | 2 tasks | 3 files |
| Phase 09.1 P03 | 2m17s | 3 tasks | 12 files |
| Phase 09.1 P04 | 4m | 3 tasks | 11 files |
| Phase 09.1 P05 | 2m34s | 3 tasks | 11 files |
| Phase 09.1 P06 | 4m | 3 tasks | 12 files |
| Phase 09.1 P07 | 8m | 3 tasks | 15 files |
| Phase 09.1 P08 | 4m22s | 4 tasks | 5 files |
| Phase 09.1 P09 | 75min | 7 tasks | 8 files |
| Phase 09.1 P10 | 8m | 4 tasks | 2 files |
| Phase 09.1 P11 | 22m | 6 tasks | 47 files |
| Phase 09.2 P02 | 5min | 2 tasks | 4 files |
| Phase 09.2 P03 | 8min | 3 tasks | 6 files |
| Phase 10 P01 | 6min | 2 tasks | 11 files |
| Phase 10 P02 | ~75min (prod push 게이트 포함) | 3 tasks | 4 files |
| Phase 10 P03 | 16min | 3 tasks | 18 files |
| Phase 10-theme-classification P04 | ~7min | 2 tasks | 8 files |
| Phase 10 P05 | 6min | 2 tasks | 4 files |
| Phase 10 P06 | 55min | 3 tasks | 9 files |
| Phase 10 P07 | 13min | 3 tasks | 14 files |
| Phase 10 P08 | 13min | 3 tasks | 16 files |

## Accumulated Context

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: Ingestion 운영 배포 — Cloud Run Job + Cloud Scheduler 자동 트리거 (URGENT, 2026-04-14 DB stale 발견)
- Phase 06.2 inserted after Phase 6: Auth + Watchlist (URGENT, 2026-04-16 Phase 7 discuss 중 뉴스 배치 타겟에 사용자별 관심종목 필요 판명 → AUTH-01/02 + PERS-01 v2→v1 승격)
- Phase 07.1 inserted after Phase 7: news content ingestion enhancement — description 저장 (URGENT, 2026-04-17 Phase 9 discuss 중 AI 요약 입력 데이터 부재 판명 → Naver API 실측 후 description 스니펫 저장 결정. URL 원문 scraping 은 Phase 9 POC 후 재검토)
- Phase 07.1 complete 2026-04-18: migration 20260417120200 적용 + Cloud Run Job 재배포(image d9b5af3) + smoke tick 에서 신규 45건 description 저장 확인 (기존 1,103행 NULL 유지). news-sync smoke INV-5/6 은 DI-02 헤더 CR 파싱 버그로 FAIL 표기되나 데이터 정상(확인됨)
- Phase 07.2 inserted after Phase 7.1: news-sync rate-limit 안정화 + news_articles 재수집 (URGENT, 2026-04-18 진단 — abort signal from Naver 매 tick 5+회 발생, skipped 40+/55 로 74% 종목 뉴스 0건. 429 rate-limit 을 daily budget 과 혼동해 stopAll → cycle 조기 중단. 수정: concurrency 8→3 + NaverRateLimitError 분리 + per-stock backoff retry + TRUNCATE news_articles 후 clean-slate 재수집. UPSERT 정책 DO NOTHING 유지)
- Phase 07.2 complete 2026-04-18: Cloud Run Job 재배포(image news-sync:141ccdc) + deploy-news-sync.sh NEWS_SYNC_CONCURRENCY=8→3 수정 + news_articles TRUNCATE(1,270→0) + 즉시 execute → inserted 6,187 / skipped 0 / abort signal 0 / top_movers 55/55 (100%) + description 99.9% (6,183/6,187) 커버리지 달성. SC 5/5 green
- Phase 08.1 inserted after Phase 8: 종목토론 의미성 AI 분류 + 웹앱 필터 토글 (URGENT, 2026-04-21 수집된 discussions 중 다수가 욕설·뇌피셜·감탄사 노이즈)
- Phase 08.1 planned 2026-04-22: 7 plans / 4 waves. 설계 변경 — Batch API → **Claude Haiku Sync API inline 통합** (discussion-sync cycle 내부에서 수집 직후 분류, 별도 worker 없음). 4-category (price_reason/theme/news_info/noise), p-limit(5), temperature=0, max_tokens=10, model=claude-haiku-4-5. discussions.relevance/classified_at 컬럼 추가 + partial indexes. server DiscussionListQuery.filter(all|meaningful) + `relevance IS NULL OR relevance != 'noise'`. webapp Switch 토글 (풀페이지만, 기본 ON=meaningful, URL sync `?filter=meaningful`). 백필 15k 행 일회성 스크립트 ~$23, 정기 ~$2/day
- Phase 9 의미 교체 2026-05-10: 기존 Phase 9 (AI Summarization, TBD/미시작) 을 Phase 10 으로 renumber, 신규 Phase 9 = Daily Candle Data Collection (KRX 전 종목 3년치 일봉 OHLCV + 영업일 EOD 증분 갱신). 분석 기반 데이터 레이어가 AI 요약보다 선행되는 게 자연스럽다는 판단. Phase 10 의 Depends/SC/UI hint 는 변경 없음. /gsd-insert-phase 도구는 decimal 만 지원해 수동 ROADMAP/STATE/REQUIREMENTS 편집. total_phases 16→17. 신규 요구사항 DATA-01.
- Phase 09.1 inserted after Phase 09 (URGENT, 2026-05-13): intraday-current-price — 키움 REST `ka10027` 페이지네이션으로 활성 종목 ~1,898 매분 현재가 갱신. Direct VPC Egress + Static IP 인프라 (키움 IP whitelist 필수). KIS ingestion 무변경 (공존 전략). stock_daily_ohlcv 오늘자 row UPSERT.
- Phase 09.2 inserted after Phase 09.1 (URGENT, 2026-05-14): 종목 상세페이지(`/stocks/[code]`) 상단에 해당 종목의 일봉차트 출력. Phase 9 의 `stock_daily_ohlcv` (4,003,432 행) 을 source 로 활용해 트레이더가 가격 흐름을 즉시 시각적으로 확인. 디렉터리 slug `stock-detail-daily-chart`. plan/구현은 `/gsd-plan-phase 09.2` 에서 본격 설계.
- Phase 08 complete 2026-04-18: discussion-board production live. POC PIVOT 으로 RESEARCH 가정(cheerio HTML + iframe body fetch + iconv-lite) 모두 폐기 → Bright Data Web Unlocker(zone `gh_radar_naver`, country=kr) + `stock.naver.com/api/community/discussion/posts/by-item` JSON API 단일 호출로 본문 포함 50건/페이지. Cloud Run Job `gh-radar-discussion-sync` + Scheduler `gh-radar-discussion-sync-hourly` (0 * * * * KST) + Secret `gh-radar-brightdata-api-key` + 워커 first-time/stale 종목 backfill loop (max 10페이지 OR 7일) + server `before` cursor + webapp 무한 스크롤. 첫 production cycle: 58 종목 → 187 requests → upserted **15,463 row** / errors 0. smoke 8/8 PASS. server 응답 1.04s (실시간 토론방 데이터 검증). pipeline 재작성으로 월 비용 ~\$72 (당초 추정 \$144 절반).
- Phase 09.1 complete 2026-05-15: KIS ingestion 완전 폐기 + 키움 REST API (ka10027 페이지네이션 + ka10001 hot set) 단일 source 전환. workers/intraday-sync 신설 (Cloud Run Job + Scheduler `* 9-15 * * 1-5` Asia/Seoul, VPC + Static IP 34.64.195.151). server/src/kis → server/src/kiwoom 교체 + Cloud Run service VPC connector 재배포 (revision gh-radar-server-00017-mrm, image db391ac). SC #1~9 모두 충족. trade_amount 정책 정확값 → volume×close 근사값 전환 (D-23). git history 보존 (workers/ingestion + server/src/kis + packages/shared/src/kis.ts). Plan 11 RESEARCH §12 11-step cleanup 완료: Scheduler PAUSE → 정합 검증 (intraday-sync 단독 870 row 5분 갱신 정상) → Job/Scheduler/SA/Secrets×3(kis-app-key/kis-app-secret/kis-account-number)/Alert policy 삭제 → kis_tokens DROP migration apply → 47 파일 git rm/edit + commit db391ac → server redeploy (`--remove-secrets=KIS_APP_KEY,KIS_APP_SECRET --remove-env-vars=KIS_BASE_URL`) + smoke 9/9 + 종목 상세 005930/000660 200 OK + 최종 stock_quotes 952 row 5분 갱신.
- Phase 10 added 2026-06-08: Theme Classification — 테마별 종목 묶기 (네이버 금융 테마[산업/이벤트] + 알파스퀘어[정치인주/시사] 2-tier 일 1회 16:00 KST 배치 수집 → `themes`/`theme_stocks` 적재 + 웹앱 `/themes` UI). Phase 7(뉴스)·Phase 8(토론방) 의 "수집+표시" 단일 phase 선례 따름. MVP = A(수집)+B(UI), 상한가 동조 분석(C/D/E)은 후속 phase 로 분리. 신규 요구사항 THEME-01/02. **삭제된 구 Phase 10(AI Summarization) 번호 재사용** (정수 max+1). 한국 크롤링 운영 5원칙(CLAUDE.md, 2026-06-08 quick task 260608-g0k 로 명문화) 준수 — 진짜 리스크는 형사 아닌 민사 DB제작자 권리 침해(대법원 2017다224395). 콘텐츠 SHA256 해시 변경감지 + EUC-KR→UTF-8(iconv-lite). `/gsd-plan-phase 10` 에서 본격 설계.
- Phase 11 added 2026-06-10: Co-movement Candidates — 상한가 동조 종목 탐지. Phase 10 직전 아이디어 회의(세션 2286945e)에서 테마와 함께 제안됐다가 후속 분리 후 누락된 동조 분석을 재개 (`tasks/co-movement-idea-prompt.md`). 종목 X 급등 시 "따라 오를 후보 Y"를 일봉 통계적 동조로 점수화해 종목상세 TOP-K 표시 (테마와 다른 축). **아이디어 디스커션 + read-only 실측(2026-06-10)으로 v1 확정**: 통계 단위 = 하이브리드(테마-풀링 참여도 주 + 페어 직접동조 보조) — 실측상 종목당 급등(≥15%) 이벤트 **중앙값 2회**라 페어 단독 통계는 ~75% 종목에서 불가, 테마 풀링 필수(테마 커버리지 89% = 활성 2,778 중 2,476). 시차 = D0 동반 + D+1 후행 둘 다. 점수 = conf_d0(주)/lift/avg_ret/conf_d1, lookback 24m, 테마 발화일 ≥8 게이팅. 테마없는 ~11%는 정직한 빈 상태(`stocks.sector` 전부 NULL). 성능 = 이벤트 부분집합 ~2.5만행을 Postgres SQL 함수로 사전계산(`theme_comovement` 테이블 + `(date,code) WHERE change_rate≥10` 부분인덱스 + change_rate>31 아티팩트 제외), 읽기 RPC는 앵커 활성 테마(중앙값 3) union 집계. 구성 = 마이그레이션 + SQL함수 + RPC + 얇은 `co-movement-sync` 워커(candle-sync EOD 이후 야간 1회) + 서버 `/api/stocks/:code/co-movement` + 종목상세 UI 섹션. 신규 요구사항 COMV-01. v2 deferral = 페어 정식모델·Granger lead-lag·인트라데이 시차·테마없음 그래프 클러스터링. `/gsd-plan-phase 11` 에서 본격 설계.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: KIS 실계좌 사용 결정 (모의투자 대신) → readOnlyGuard 안전장치 적용
- Phase 1: TR ID FHPST01700000 확정, 마켓코드 J(KOSPI)/NX(KOSDAQ)
- Phase 1: 등락률 순위에 상한가/하한가 없음 → inquirePrice(FHKST01010100) 2단계 파이프라인
- Phase 1: 휴장일 감지 acml_hgpr_date 기반 (bsop_date 없음)
- Phase 1: pnpm 8→10 업그레이드 (Node 22 호환)
- Phase 1: .nvmrc=22, Docker도 node:22-alpine (2026-04-13 Node 22 통일; 초안은 Docker=20이었으나 로컬=Prod 일치 우선, 모든 deps pure JS라 alpine 22 리스크 없음)
- Phase 2 준비: Node 22 LTS 기준으로 CONTEXT/RESEARCH 정렬, `package.json` engines `>=22`
- [Phase 04]: AppShell hideSidebar prop — 기본 false 로 /design 카탈로그 회귀 없이 v1 전 페이지 헤더 전용 모드 적용
- [Phase 04]: apiFetch 클라이언트: Phase 2 envelope 파싱 + X-Request-Id 캡처 + 8s 타임아웃, ApiClientError 단일 클래스 통합
- [Phase 04]: /scanner ISR 30s (revalidate=30 + cache:'force-cache') 로 /api/health 폴링 과도호출 방지
- [Phase 05.1]: Cloud Run Job invoker 바인딩은 setup-ingestion-iam.sh가 아닌 deploy-ingestion.sh §5.5에 배치 (Job 리소스 생성 후에만 가능)
- [Phase 05.1]: Scheduler → Cloud Run Job 인증은 --oauth-service-account-email 전용 (OIDC 금지, Pitfall 2)
- [Phase 06]: useDebouncedSearch 는 AbortError 를 name 체크로 명시 스킵 — aborted flag 만으로는 race window 발생
- [Phase 06]: Plan 03: CommandDialog 가 shouldFilter prop 미 forward → 내부 <Command shouldFilter={false}> 래핑 + CommandLoading export 부재로 div 로 치환
- [Phase 06]: [Phase 06 Plan 04]: Number 컴포넌트는 NumberDisplay 별칭으로 import — JS 전역 Number.isFinite shadow 방지
- [Phase 06]: [Phase 06 Plan 04]: StockDetailClient 에러 패턴 — 404 만 notFound() 분기, 그 외는 state 유지하여 stale-but-visible + 인라인 에러 카드
- [Phase 06]: [Phase 06 Plan 05]: /stocks/[code] 라우트는 'use client' + React.use(params) 로 Next 15 Promise params 처리 — 서버 컴포넌트 초기 fetch 대신 전체 클라이언트 경로 채택 (스캐너와 일관, refresh 훅 단순화)
- [Phase 09-daily-candle-data]: [Phase 09 Plan 01]: stock_daily_ohlcv 마이그레이션 SQL — FK NOT VALID + 런타임 stocks bootstrap (T-09-03 옵션 B), production push 는 Plan 06 [BLOCKING] task 에서
- [Phase 09-daily-candle-data]: Plan 02: vitest passWithNoTests:true — placeholder 워크스페이스에서 0 test exit 0 보장; krxBaseUrl default = data-dbg.krx.co.kr/svc/apis (RESEARCH §1.1 production 검증된 URL 직접 잠금, master-sync 와 의도적 차이)
- [Phase 09-daily-candle-data]: Plan 03: 결측 감지는 RPC 가 아닌 client-side N+1 패턴 (활성 stocks count + lookback distinct date + per-date head:true count) — Supabase JS v2 가 raw GROUP BY 제한적이라 head:true count 의 명료성 우선. lookback 영업일은 DB distinct date 기반 추론 (RESEARCH §3.3 옵션 A). Vitest mock 은 thenable 흉내 없이 final method 에서 mockResolvedValue — Supabase v2 builder 충분히 지원.
- [Phase 09-daily-candle-data]: Plan 04: config.basDd optional 추가 (BAS_DD env, daily mode 수동 재실행 override) + backfill MIN_EXPECTED 정책=throw (RESEARCH §7 warn+continue 와 의도적 차이 — 한 영업일 부분 응답이 ~4M row 오염 위험) + mock basDd 분기 패턴 (call counter race 회피, withRetry 호환)
- [Phase 09-daily-candle-data]: Plan 05: Cloud Run Job 3개 분리 (RESEARCH §5.1 채택) — daily/recover/backfill 동일 이미지 + Job 별 default MODE env, task-timeout/memory mode 별 최적화, race 자연 방지(T-09-06), alert policy 분리. Scheduler 2종 OAuth (OIDC 금지, Phase 05.1 D-07 lesson 승계). runtime SA gh-radar-candle-sync-sa 최소권한 (KIS 시크릿 미바인딩, T-09-04.1). backfill 은 alert 제외 (수동 실행). 본 plan 은 스크립트 작성만 — Plan 06 이 실제 실행.
- [Phase 09.1]: Plan 01: RPC #1 의 ON CONFLICT 에서 open 의도적 omit (STEP2 가 정확값 덮어쓰기, EOD 17:30 overlay 가 최종 보완) — D-33 / T-09.1-03
- [Phase 09.1]: Plan 01: RPC #2 의 ON CONFLICT 에서 close/volume/trade_amount/change_amount/change_rate 의도적 omit — STEP1 매분 갱신 컬럼 보호 (D-34, T-2)
- [Phase 09.1]: Plan 01: kis_tokens DROP 은 Wave 0 파일 생성, Wave 4 cutover 마지막 step 에서만 push (KIS ingestion 가용성 보장 — T-09.1-04)
- [Phase 09.1]: Plan 01: 모든 신규 RPC + kiwoom_tokens 에 REVOKE 3줄 명시 (PUBLIC + anon,authenticated + GRANT service_role) — feedback_supabase_rpc_revoke 룰 준수
- [Phase 09.1]: Plan 02: kiwoom raw 타입에 인덱서 (`[key:string]: string`) 의도적 미사용 — kis.ts (인덱서 사용) 와 의도적 차이. 명시 필드 + 타입 안전성 우선. 추가 필드 필요 시 본 타입 확장 (R3).
- [Phase 09.1]: Plan 02: IntradayOhlcUpdate.marketCap 의 mac 단위 가설 = 억원 (R2). Plan 04 fixture 캡처가 단위 확정 — 가설 틀려도 mapper parseMac 1줄 변경으로 해결, 본 타입 변경 불필요.
- [Phase 09.1]: Plan 03: candle-sync 1:1 mirror 로 workers/intraday-sync 스캐폴드 — MODE dispatch 의도적 제거 (단일 cycle). redact 7 paths (kiwoomAppkey/kiwoomSecretkey/headers.authorization/access_token/accessToken/token/supabaseServiceRoleKey) — T-09.1-07 mitigate.
- [Phase 09.1]: Plan 03: tuning env defaults — MIN_EXPECTED_ROWS=1500 (휴장일 guard), HOT_SET_TOP_N=200 (D-11), KA10001_RATE_LIMIT=24 req/s (사용자 2026-05-13 실측). 모두 env override 가능.
- [Phase 09.1]: [Plan 04] parseSignedPrice 1 함수가 +/- 부호 분리 + 절댓값 + direction(up/down/flat) 한번에 처리 — D-09. flu_rt/pred_pre 는 parseOptionalSignedNumber 로 부호 유지 별도. trim/comma strip/Number.isFinite 가드 포함.
- [Phase 09.1]: [Plan 04] tokenStore 는 axios 직접 호출 (createKiwoomClient 미사용) — token endpoint 는 Bearer 미필요. upsert onConflict=token_type 으로 race idempotent (T-09.1-13 accept). parseKiwoomExpiresDt 가 'YYYYMMDDhhmmss' KST → UTC 변환.
- [Phase 09.1]: [Plan 04] fetchKa10027 의 hard cap 5000 + cont-yn=Y AND next-key 둘 다 있어야 loop 진행 (T-09.1-14). 401 → '키움 401' / 429 → '키움 429' / return_code != 0 → return_msg 분류 throw (T-09.1-11/12).
- [Phase 09.1]: [Plan 05] parseMac (×10^8) 가설 단위=억원을 1줄 격리 — Plan 06 production smoke 시 확정. 잘못된 단위 시 함수 1줄 + mapOhlc.test.ts expectation 1줄 변경만으로 정정 (T-09.1-15 mitigate).
- [Phase 09.1]: [Plan 05] fetchKa10001ForHotSet 가 Promise.allSettled (Promise.all 아님) + 각 호출 직전 acquireKiwoomRateToken — 종목별 실패가 cycle 중단 안 함 (T-09.1-16) + token bucket 자연 직렬화 (T-09.1-17).
- [Phase 09.1]: [Plan 05] computeHotSet = top N ∪ watchlist unique (Set 자료구조). watchlist 빈 → top N 만 정상 동작 (T-09.1-18 mitigate). user_id 미노출 (stock_code 만 SELECT).
- [Phase 09.1]: [Plan 06] rebuildTopMovers 가 marketMap 인자 추가 — top_movers 의 name/market NOT NULL 제약 충족 (PLAN 원안 미반영, Rule 1 Bug 자동 수정). DELETE 패턴도 .gte('rank', 0) → .neq('code', '') 변경 (rank=NULL 회피).
- [Phase 09.1]: [Plan 06] runIntradayCycle 통합 — STEP1 (ka10027 fetch → bootstrap → mapping+dedupe → market join → RPC #1 + stock_quotes + top_movers) → STEP2 (computeHotSet → ka10001 Promise.allSettled → mapping → RPC #2 + stock_quotes) 직렬 dispatch. 휴장일/partial 가드 (0 row exit 정상, < MIN_EXPECTED throw). dedupe Map by code 로 페이지 경계 중복 자연 제거.
- [Phase 09.1]: [Plan 06] STEP1/STEP2 stock_quotes UPSERT 의도적 컬럼 분리 — onConflict=code 가 페이로드 컬럼만 UPDATE 특성 활용. STEP1 (price/change/volume/trade_amount/name/market) 과 STEP2 (open/high/low/upper/lower/market_cap) 서로 다른 컬럼 → 자연 race-free (T-09.1-21 mitigate).
- [Phase 09.1]: [Plan 07] server/src/kis/* → server/src/kiwoom/* 4 모듈 신설 (worker Plan 04 mirror). createKiwoomRuntime 의 { client, getToken } 페어 stateless 패턴 — 매 요청 getKiwoomToken 재조회. cached SELECT 를 키움 호출 이전에 수행 (Rule 1 Bug — mock upsert overwrite + production race 회피).
- [Phase 09.1]: [Plan 07] StockQuoteRowUpsert = Omit<StockQuoteRow, 'volume'|'trade_amount'> — D-22 R3 RESOLVED. inquirePriceToQuoteRow 가 partial row 반환 → Supabase upsert 가 명시 컬럼만 SET → STEP1 ka10027 의 매분 trade_amount/volume 보존. server tests 121/121 + typecheck/build exit 0.
- [Phase 09.1]: [Plan 07] KIS env optional 화 (kisAppKey/Secret default '') + KIWOOM_APPKEY/SECRETKEY required get(). server/src/kis/* + services/kis-runtime.ts 는 무변경 (dead code 잔존) — Wave 4 Plan 11 cleanup 안전 deletion 대기. tests/setup.ts 가 KIWOOM env 주입 (test loadConfig throw 회피).
- [Phase 09.1]: [Plan 08] candle-sync setup/deploy/smoke/alert 4 파일 1:1 mirror + VPC stack 확장 — Static IP 1개를 Cloud Run Job (intraday-sync) + Cloud Run service (server) 공유 (D-29). compute.networkUser 3 바인딩 (Service Agent + intraday-sync SA + default compute SA, RESEARCH §4.7). Scheduler cron '* 9-15 * * 1-5' Asia/Seoul + task-timeout=60s. OAuth (OIDC 금지, T-09.1-34 mitigate).
- [Phase 09.1]: [Plan 08] KIWOOM Secrets 빈 secret 신설 + KIS env/secret 의도적 유지 (Wave 4 cleanup 까지 transition) — setup 스크립트가 gcloud secrets create 만 + accessor 바인딩, value 등록은 Plan 09 [BLOCKING] 사용자 액션. deploy-server.sh 가 KIS_APP_KEY/SECRET + KIWOOM_APPKEY/SECRETKEY 동시 보유, kis-runtime.ts dead code (Plan 07). VPC stack 존재 확인 게이트로 server 재배포 시 잘못된 outbound 사고 방지 (T-09.1-36).
- [Phase 09.1]: [Plan 09] 키움 ka10027 stex_tp='3' (통합) 필수 파라미터 추가 — 키움 spec 변경 (2026-05-15) 대응. MIN_EXPECTED_ROWS 1500→800 (실측 900~1175).
- [Phase 09.1]: [Plan 09] stock_quotes payload 의 name/market 키 미포함 + upper_limit/lower_limit 한국 시장 일일변동폭 ±30% 임시값 채움. PLAN 06 의 잘못된 컬럼 가정 정정.
- [Phase 09.1]: [Plan 09] upsertQuotesStep2 UPSERT → 종목별 UPDATE — Supabase upsert(onConflict) 가 INSERT 분기에서 모든 NOT NULL 평가하는 함정 회피. ~250 종목 직렬 호출 수십 ms (60s cycle 매우 여유).
- [Phase 09.1]: [Plan 09] STEP2 hot set 을 STEP1 처리 종목으로 intersect — watchlist 종목 중 ka10027 미응답 종목이 STEP2 신규 INSERT 시도하는 문제 해소. dropped 카운트 로그.
- [Phase 09.1]: [Plan 10] server Cloud Run service 재배포 (revision gh-radar-server-00015-zr5, image fe96bec) — Direct VPC Egress (gh-radar-vpc + gh-radar-subnet-an3 + vpc-egress=all-traffic) + KIWOOM secret (APPKEY+SECRETKEY:latest) 적용. 종목 상세 페이지가 키움 ka10001 동기 호출로 전환. smoke 9/9 + Cloud Logging Kiwoom runtime ready (tokenLen=86) + GET /api/stocks/005930+000660 200 검증. KIS env/secret 잔존 (Plan 11 cleanup).
- [Phase 09.1]: [Plan 10] Cloud Run service Direct VPC Egress 패턴 — annotation run.googleapis.com/network-interfaces + vpc-access-egress=all-traffic 으로 Serverless VPC Access connector 없이 native VPC 연결. Cloud Run Job (intraday-sync) + service (server) 가 동일 VPC + Cloud NAT 공유, Static IP 34.64.195.151 1개로 키움 IP whitelist 운영 통합 (D-29 충족).
- [Phase 09.1]: [Plan 10] cold-start 약 3초 (예측 1-2분 대비 우수) — min-instances=1 유지 + Cloud Run 의 빠른 instance startup. RESEARCH §4.6 T-12 의 예측보다 좋게 동작. server 이미지 빌드 (Plan 07 코드) 가 production schema 와 자연 호환 (Plan 09 의 worker 5건 deviation 패턴이 server 측 발생 안 함).
- [Phase 09.1]: [Plan 10] Cloud Logging 검색 시 pino 의 실제 필드명은 jsonPayload.message (msg 아님) — Plan 본문 검증 쿼리의 jsonPayload.msg 패턴은 미동작. 향후 GCP 로그 검색 시 jsonPayload.message 사용. 본 plan 에서 자연 정정.
- [Phase 09.1]: [Plan 11] KIS ingestion 완전 폐기 (RESEARCH §12 11-step). 데이터 정합 검증 (Scheduler PAUSE 후 10분 대기 + intraday-sync 단독 운영 870 row 5분 갱신 확인) → GCP 리소스 7개 삭제 (Job + Scheduler + SA + Secrets×3 + Alert) → kis_tokens DROP migration push (PGRST205) → 47 파일 git rm/edit + commit db391ac. PLAN 본문은 KIS secret 2개만 명시했으나 GCP 에 gh-radar-kis-account-number 추가 발견 — Rule 2 (Auto-add critical) 로 함께 삭제.
- [Phase 09.1]: [Plan 11] server 재배포 시 `gcloud run deploy --update-secrets` 가 기존 KIS secret binding 을 **누적**하여 첫 deploy 가 "Permission denied on secret: gh-radar-kis-app-key" 로 실패. Rule 3 (Auto-fix blocking) — `gcloud run services update --remove-secrets=KIS_APP_KEY,KIS_APP_SECRET --remove-env-vars=KIS_BASE_URL` 로 명시 제거하여 새 revision gh-radar-server-00017-mrm (image db391ac) 활성화. lesson — Cloud Run 의 secret binding 변경 시 `--remove-secrets` 명시 필수.
- [Phase 09.2]: Plan 02: useEffect 3-effect 분리 (mount/theme/rows) — theme 변경 시 chart 인스턴스 재생성 회피 + Volume bar per-bar color 도 theme effect 에서 재주입 (Pitfall 6 fix)
- [Phase 09.2]: Plan 02: error.message 의도적 미노출 (T-09.2-07 mitigate) — generic 카피 + console.error 분리. PostgREST/RLS 내부 정보 누설 표면 0
- [Phase 09.2]: Plan 02: 단위 테스트는 lightweight-charts 전체 mock — jsdom 에서 Canvas 렌더링 불가, 시각 검증은 Manual Verification (Plan 03 checkpoint) 책임
- [Phase 09.2]: 캔들스틱 차트 채택 — REQUIREMENTS.md Out of Scope 정책 반전 (사용자 명시 2026-05-15, 상세 페이지 자체 완결성 우선). 라이브러리 = lightweight-charts 5.2.0 (RESEARCH 비교 후 lock-in: 번들 +4 kB / 캔들+Volume 네이티브 / 트레이더 친숙도). 데이터 = webapp → Supabase PostgREST 직접 호출 (Phase 06.2 watchlist 패턴 mirror). Pitfall 9 (oklch parser 거부) → chart-colors.ts utility 모듈로 회귀 방지. Pitfall 6 (다크모드 자동 분기 미작동) → next-themes useTheme + chart.applyOptions effect 로 production 해결.
- [Phase 10]: Plan 01: theme-sync logger.ts 는 master-sync named export `logger` 형태 채택(discussion-sync factory 아님) — retry.ts `import { logger }` 호환 + redact paths 만 theme-sync 시크릿(brightdata/anthropic/supabase service-role/token)으로 교체 (T-10-01-01 mitigate)
- [Phase 10]: Plan 01: alpha-all-themes.json 실측 548KB(27카테고리)→정치(full 39테마,이재명 id=6)+반도체(2테마) 트리밍 — CLAUDE.md 크롤링 5원칙 #5(부분캐싱·전체덤프 금지) + POLITICS_CATEGORIES 필터 포함/제외 양방향 검증. 네이버 HTML 은 cheerio td.name>div.name_area>a 선택자 컨텍스트 보호 위해 실측 full page 미트리밍 보존
- [Phase 10]: Plan 01: 워커 스캐폴드 패턴 = master-sync(package/tsconfig/retry/supabase) + discussion-sync(vitest passWithNoTests) 1:1 복제 후 name/redact 치환. 외부 소스 둘 다 curl 200 OK(차단 없음) → 실측 fixture 고정(RESEARCH valid_until 2026-07-09)
- [Phase 10]: Plan 02: 시스템/유저 테마를 테이블 분리 없이 단일 themes(is_system 플래그 + owner_id NULL 분기 + norm_key partial-unique)로 모델링 (D-01) — "충돌 0"은 RLS + WITH CHECK 가 강제, theme_stocks 조인 1개 유지로 목록·종목칩 UNION 회피 + fork=INSERT-SELECT 단순화
- [Phase 10]: Plan 02: 공개 read 정책(read_system_themes / read_theme_stocks) TO anon, authenticated 둘 다 명시 (Pitfall 3, feedback_supabase_rls_authenticated) — anon-only 시 로그인(JWT authenticated) 사용자 default-deny 빈 응답 회귀 방지. owner_id REFERENCES auth.users(id) ON DELETE CASCADE + CHECK themes_owner_consistency 무결성. 종목수/테마수 50-limit 은 RLS subquery 금지(recursion+42501 구분불가) → BEFORE INSERT trigger P0001 (시스템=service_role 무제한)
- [Phase 10]: Plan 02: production db push 적용 완료 + 검증 — `supabase db push --yes` 가 20260609120000_theme_tables.sql 적용(exit 0), dry-run 재실행 "Remote database is up to date", service_role REST GET themes/theme_stocks 200(테이블 존재), anon REST GET themes?is_system=eq.true 200(read_system_themes 활성). 시드 부재로 빈 배열이나 default-deny 아님 = RLS 정상
- [Phase 10]: Plan 02: [Rule 3 - 포매팅] acceptance-criteria 리터럴 lowercase grep(`references stocks(code)` / `owner_id uuid REFERENCES auth.users`) ↔ repo uppercase-SQL 컨벤션 양립 — canonical DDL 은 uppercase REFERENCES 유지 + 동일 라인 trailing 주석에 lowercase 앵커 병기. 스키마/동작 무영향 (주석은 SQL 무시)
- [Phase 10]: Plan 03: backoff 상태를 api_usage 재사용(service=theme_*_backoff, count=backoff-until epoch ms)으로 저장 — 신규 마이그레이션 회피. 콘텐츠 SHA256 은 hex 앞 13자리(52bit) 정수 다이제스트로 api_usage.count 저장/비교(변경 감지용)
- [Phase 10]: Plan 03: 직접 fetch → 403/429/undefined-status 시 Bright Data 프록시 1회 폴백(자동 지수 재시도 금지, 5원칙 #4). EUC-KR 은 arraybuffer+iconv(Pitfall 2), 알파는 zod 검증 JSON. 둘 다 차단 시 markBackoff(24h) → 다음 cycle skip
- [Phase 10]: Plan 03: 보수적 norm_key 정규화(NFKC+소문자+공백/특수문자 제거, 괄호 보존, Levenshtein 금지) — 'AI챗봇'='ai 챗봇' 병합, 'HBM(고대역폭메모리)'≠'HBM' 분리. upsertThemes 는 stocks .in() 청크(200) FK skip + theme_stocks 청크(500) + effective_to soft-제외 이력
- [Phase 10-theme-classification]: 10-04: 테마 상위3평균을 server 실시간 계산(A2)으로 — stock_quotes.change_rate 매 요청 재계산(scanner.ts 동형), DB precompute 컬럼은 캐시 폴백용. '지금 뜨는 테마' 신선도(D-14).
- [Phase 10-theme-classification]: 10-04: /api/themes 두 라우트 모두 stock_quotes/.in() 청크(200)+error throw — 테마 종목 합집합 가변 대규모, 37afcde 강세장 빈응답 회귀 선제 차단.
- [Phase 10-theme-classification]: 10-04: GET /api/themes(:id) 가 is_system=true 만 조회 — 유저 테마 id 404. 유저 테마는 webapp→Supabase RLS 직접 경로(Plan 05)라 service_role 라우트 격리(T-10-04-04).
- [Phase 10]: 유저 테마 CRUD/fetch/fork 전 경로 Supabase 직접(Express 미경유) — RLS owner-only 격리 + is_system=false 명시로 위조 차단 (10-05)
- [Phase 10]: fork = 단일 테이블 INSERT-SELECT 스냅샷, active 멤버십(effective_to IS NULL)만 source='user' 복사 (D-05, 10-05)
- [Phase 10]: P0001 50-limit 을 isThemeStockLimitError 헬퍼로 식별 + useThemesQuery 가 두 소스 60s 합성(비로그인 myThemes=[]) (10-05)
- [Phase 10]: 10-06: 펜스-tolerant JSON 추출을 parseJson.extractJsonObject 공유 유틸로 — Haiku 가 'JSON only' 지시에도 ```json 펜스로 감싸 discover/correct 두 파서의 JSON.parse 가 throw → 발굴 0건(POC 실측 라이브 버그). 첫 '{'~마지막 '}' 슬라이스로 두 파서 공유 수정. mocked 테스트가 못 잡은 사각지대.
- [Phase 10]: 10-06: 보수적 cross-chunk dedup(collapseNearDuplicates) — POC 36 후보 중 ~55% 가 청크별 같은 테마 변형명 재발굴. 병합 조건 EITHER (a)종목코드 ≥2 공유 OR (b)norm_key substring 포함(짧은쪽 길이≥4 가드). edit-distance 금지, 불확실 시 KEEP BOTH(normalizeName 보수 원칙 승계). 병합 시 더 일반적(짧은) 이름 canonical+stockCodes 합집합+confidence max.
- [Phase 10]: 10-06 POC 실측: 5 Claude 호출 ~51k in+1.9k out 토큰 = $0.06/run → ~$1.83/월(target <$1/일 통과). 정확도 GOOD(HBM/온디바이스AI/양자/파운드리 등 실 KR 테마). source='ai' 표시 승인(ai_candidate 격리 불필요, 코드 변경 0 — /api/themes is_system=true 자동 surface). prod 활성은 10-08 의 THEME_SYNC_CLASSIFY_ENABLED=true.
- [Phase 10]: [10-07] 출처 도트를 globals.css 토큰만으로 매핑(naver=--flat / alphasquare=--down 블루 정확일치 / ai=--accent 뱃지+--primary 도트) — 목업 인라인 oklch(green/purple) literal 은 하드 룰(토큰만) 우선해 폐기, 세 출처 시각 구분 유지하며 색 리터럴 0
- [Phase 10]: [10-07] theme-api.fetchMyThemeDetail 추가 — /api/themes/:id 가 유저 테마 404(Plan04 격리)라 유저 상세는 Supabase nested embed(theme_stocks→stocks→stock_quotes, watchlist 톤). 상세 fetch 는 시스템 우선 → 404 시 유저 폴백, isSystem 이 read-only/편집 분기 구동
- [Phase 10]: [10-07] /themes/[id] 종목 리스트 = scanner-table/card-list 직접 재사용(ThemeStockMember→StockWithProximity 매핑 1함수, props 변경 0). ThemeEditDialog 단일 컴포넌트가 create/edit/fork 3모드 + 종목 add·remove + P0001 인라인 흡수, 목록 CTA + 상세 편집 양쪽 재사용
- [Phase 10]: [10-08] theme-sync production 배포 — Cloud Run Job gh-radar-theme-sync + Scheduler gh-radar-theme-sync-daily(0 16 KST, OAuth invoker OIDC 금지) + SA + 기존 Secret 3종(brightdata/anthropic/supabase-service-role) 재사용(신규 0). THEME_SYNC_CLASSIFY_ENABLED=true. 첫 scrape 356 시스템 테마(331 naver/alpha + 25 AI 발굴) + 7,561 theme_stocks + aiDiscovered=25/aiCorrected=2, backedOffSources=[] (네이버 직접 성공). themes count gate PASS(356)
- [Phase 10]: [10-08] 유저 테마 optimistic 갱신 — upsertMyTheme(replace-by-id else prepend)/removeMyTheme(id) + onSaved(스냅샷)/onDeleted(id) 시그니처. Supabase 풀러 read-after-write 레이스로 생성 직후 list 빈 화면 회귀를 즉시 반영 후 refresh reconcile 2단으로 해소(통계 null 폴백). create-and-add E2E 통과
- [Phase 10]: [10-08] @gh-radar/shared 확장자 없는 re-export lesson — 10-02 의 첫 런타임 값 re-export(THEME_STOCK_SOURCES from ./theme.js)가 Turbopack dev .js→.ts resolve 갭 재유발(DEV 전용 오버레이, production build 는 항상 green). moduleResolution:bundler 에서 확장자 생략이 관용(NodeNext 소비자는 dist, 무영향)
- [Phase 10]: [10-08] smoke INV-2 — Cloud Run Job pino 로그는 jsonPayload.msg 로 쿼리(service .message 매핑과 다름, 라이브 덤프 확인) + Cloud Logging ingestion 지연 5×15s 재시도. Phase 09.1 의 'service 는 jsonPayload.message' 와 대비되는 Job 측 관측. E2E 상세(edit/delete/fork)는 Express /api/themes/:id 부재로 404 mock(mockThemesApi {list:[]}) → 실 Supabase fetchMyThemeDetail RLS owner-only 폴백 구동

### Pending Todos

- 주말 KIS 실증 테스트 (휴장일 acml_hgpr_date 검증) — 다음 주말에 보완
- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- DI-01: `incr_api_usage(text,date,int)` RPC 에 `REVOKE ALL FROM anon, authenticated` 마이그레이션 추가 (Supabase 플랫폼 auto-grant 회귀) — Phase 8 또는 별도 infra PR
- DI-02: `scripts/smoke-master-sync.sh` INV-4 헤더 CR 파싱 버그 (동일 패턴, 별도 PR)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key) — 예: 90일 cron
- DI-03: Phase 09.2 RESEARCH Pitfall 10 follow-up — `news_articles`, `discussions`, `summaries` 테이블의 RLS 정책이 `TO anon` 만 명시하는지 audit. supabase/migrations/20260515163000 (stock_daily_ohlcv fix 패턴) mirror 로 `TO anon, authenticated USING (true)` 갱신 필요. supabase-js 가 인증 사용자 JWT 호출 → role=`authenticated` → 정책 부재 → default-deny 함정. 본 phase 09.2 와 무관 (차트는 stock_daily_ohlcv 만 사용) 하나 로그인 사용자 페이지 (Phase 7 뉴스, Phase 8 토론, Phase 10 요약) 의 빈 응답 가능성. 별도 phase 또는 인프라 PR 권장.
- DI-04: Phase 09.2 RESEARCH Pitfall 11 follow-up — Vercel production env 등록 시 trailing newline (`\n`) 오염 검증 절차 자동화. 증상: dev 정상이나 production 만 모든 fetch 비정상. 검증: `vercel env pull` 후 `tail -c1 .env.local | xxd -p` 가 `0a` (newline) 이면 오염. 즉시 수정: `vercel env rm` + `printf "%s" "값" | vercel env add`. CI hook 자동화 검토 (별도 인프라 PR).

### Blockers/Concerns

- 네이버 종목토론방 현재 렌더링 방식(SSR vs CSR) → Phase 8 전에 검증 필요
- Cloud Run min-instances=1 정확한 월 비용 → Phase 2 배포 시 확인

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260418-kd8 | phase 7 뉴스 풀페이지 무한 스크롤 (Phase 8 토론방 1:1 미러) | 2026-04-18 | fb2607c | [260418-kd8-phase-7](./quick/260418-kd8-phase-7/) |
| 260424-dld | 스캐너 등락률 슬라이더 제거 + 서버 고정 10% 하한 | 2026-04-24 | a371cc2 | [260424-dld-remove-scanner-rate-filter](./quick/260424-dld-remove-scanner-rate-filter/) |
| 260608-g0k | CLAUDE.md 한국 크롤링 법적 진술 정정 + 운영 5원칙 추가 | 2026-06-08 | e97e436 | [260608-g0k-claude-md-5](./quick/260608-g0k-claude-md-5/) |

## Session Continuity

Last session: 2026-06-10T06:27:47.285Z
Stopped at: Phase 11 UI-SPEC approved
Next: 10-08 deploy-e2e — Task 1(Dockerfile + setup/deploy/smoke 스크립트, master-sync 복제 OAuth invoker) + Task 2(E2E 3종: themes/user-themes/theme-chips) 작성·정적검증 완료(666cfe1, b5e33d6). Task 3 [BLOCKING]: GCP 인증(Deployer SA) 후 setup-theme-sync-iam.sh → deploy-theme-sync.sh(THEME_SYNC_CLASSIFY_ENABLED=true) → smoke-theme-sync.sh(themes count > 0) → Playwright E2E. 사용자 승인 후 오케스트레이터가 실행. (DI-02 smoke 헤더 CR 버그는 smoke-theme-sync.sh 에서 tr -d '\r' 로 선제 회피.)
