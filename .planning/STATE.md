---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 14-01-PLAN.md
last_updated: "2026-07-02T10:59:29.014Z"
last_activity: 2026-07-02
progress:
  total_phases: 23
  completed_phases: 16
  total_plans: 119
  completed_plans: 95
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 14 — ai-analyst-chatbot

## Current Position

Phase: 14 (ai-analyst-chatbot) — EXECUTING
Plan: 2 of 11
Plans completed: 88 / 102 (Phase 12: 12-01 스캐폴드 / 12-02 마이그레이션 / 12-03 server 라우트 / 12-04 워커 배포 / 12-05 webapp 표시)
Status: Ready to execute
Production URL: https://gh-radar-webapp.vercel.app
Last activity: 2026-07-02

Progress: [█████████░] 86% (88/102 plans · 15/21 phases)

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

- Total plans completed: 78 (1 + 5 + 1×6 sub)
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
| Phase 12 P01 | 8min | 2 tasks | 15 files |
| Phase 12 P02 | 12min | 3 tasks | 2 files |
| Phase 12 P03 | 11min | 3 tasks | 6 files |
| Phase 12 P04 | 10min | 2 tasks | 3 files |
| Phase 12 P05 | ~20min | 5 tasks | 6 files |
| Phase 13 P01 | 5min | 3 tasks | 15 files |
| Phase 13 P13-02 | 9min | 3 tasks | 12 files |
| Phase 13 P13-03 | ~3min | 2 tasks | 6 files |
| Phase 13 P13-04 | ~25min | 3 tasks | 11 files |
| Phase 13 P13-05 | ~4min | 2 tasks | 6 files |
| Phase 13 P13-06 | ~17min | 3 tasks | 6 files |
| Phase 14 P01 | 4min | 2 tasks | 1 files |

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
- Phase 12 added 2026-06-25: 상한가 다음날 이력 통계 (종목상세) — "이 종목이 과거 상한가 갔을 때 다음날 따라들어갔으면 어땠나"를 과거 일봉(OHLCV, Supabase 기보유 ~4M행) 백테스트로 표시. **아이디어 디스커션(세션 진행중)으로 v1 방향 확정**: 진입가정 A안(상한가 당일 종가=상한가 매수) → 다음날 시/고/저/종 수익률 계산. 근거데이터 = 종목 자체 이력만(시장평균/shrinkage 미사용, 사용자 결정). 표시 = 단일 확률숫자 대신 실제 상한가 이벤트 리스트가 히어로(컬럼: 상한가일/다음날 시·고·저·종 수익률/거래대금·회전율/점상한가 태그, 최신순). 요약 카운트("N회 중 시초가 익절 M회·평균±x%·최악 -y%"), 확률% 는 N≥5 일때만 보조. 최근가중 = 감쇠공식 대신 "최근 N회" 보조스탯+최신순(가짜정밀도 회피). 점상한가 판별 = OHLC 만으로(시=고=저=종=상한가). 핵심지표 = 시초가 수익률(고가기반은 과대평가, 참고용). L2 보조카드 = 테마 모멘텀(최근 X일 동테마 상한가 다음날 익절 흐름, per-stock 과 분리 표시, AI테마 중복제거 위에 얹음). 아키텍처 = 순수계산(외부크롤링 없음, KRX EOD 만 → 5원칙 무관), master-sync 배치 일1회 사전계산 → Supabase 저장 → 종목상세 읽기전용(on-demand fetch 금지). v2 deferral = 상한가 잠긴시각/매수잔량(굳은강도, EOD 불가 → KIS 실시간). 신규 요구사항 후보 LIMIT-01. **표시안 = C안 채택**(2026-06-26 HTML 목업 A/B/C 비교 후): 히어로형 — 상단 "시초가 익절 확률 %"(N≥5만, 미만은 카운트) 큰 숫자 + 다음날 시초가 수익률 분포 히스토그램 + 이벤트 리스트(최신순, 오래된건 흐리게, 시·고·저·종 4컬럼+점상 태그+**거래대금·회전율 컬럼 포함**=A안 컬럼 흡수) + 소속 테마별 분리 익절률 카드(HBM/반도체장비/… 각 N 병기). 국내 색상(수익=빨강 --up, 손실=파랑 --down). 목업 = scratchpad/limit-up-nextday-mockup.html. **세부 데이터/스키마/배치는 `/gsd-plan-phase 12` 에서 확정**.
- Phase 11 added 2026-06-10: Co-movement Candidates — 상한가 동조 종목 탐지. Phase 10 직전 아이디어 회의(세션 2286945e)에서 테마와 함께 제안됐다가 후속 분리 후 누락된 동조 분석을 재개 (`tasks/co-movement-idea-prompt.md`). 종목 X 급등 시 "따라 오를 후보 Y"를 일봉 통계적 동조로 점수화해 종목상세 TOP-K 표시 (테마와 다른 축). **아이디어 디스커션 + read-only 실측(2026-06-10)으로 v1 확정**: 통계 단위 = 하이브리드(테마-풀링 참여도 주 + 페어 직접동조 보조) — 실측상 종목당 급등(≥15%) 이벤트 **중앙값 2회**라 페어 단독 통계는 ~75% 종목에서 불가, 테마 풀링 필수(테마 커버리지 89% = 활성 2,778 중 2,476). 시차 = D0 동반 + D+1 후행 둘 다. 점수 = conf_d0(주)/lift/avg_ret/conf_d1, lookback 24m, 테마 발화일 ≥8 게이팅. 테마없는 ~11%는 정직한 빈 상태(`stocks.sector` 전부 NULL). 성능 = 이벤트 부분집합 ~2.5만행을 Postgres SQL 함수로 사전계산(`theme_comovement` 테이블 + `(date,code) WHERE change_rate≥10` 부분인덱스 + change_rate>31 아티팩트 제외), 읽기 RPC는 앵커 활성 테마(중앙값 3) union 집계. 구성 = 마이그레이션 + SQL함수 + RPC + 얇은 `co-movement-sync` 워커(candle-sync EOD 이후 야간 1회) + 서버 `/api/stocks/:code/co-movement` + 종목상세 UI 섹션. 신규 요구사항 COMV-01. v2 deferral = 페어 정식모델·Granger lead-lag·인트라데이 시차·테마없음 그래프 클러스터링. `/gsd-plan-phase 11` 에서 본격 설계.
- Phase 13 added 2026-07-01: 홈 화면 — 오늘의 급등 테마 AI 분석. 앱 루트(/)에 새 홈. 오늘 +20% 이상 급등 종목을 **기존 큐레이션 테마(themes/theme_stocks) 미참조 · bottom-up 순수 발견**으로 AI 클러스터링 → 오늘의 주도 테마·상승이유·소속종목을 뉴스 근거와 함께 표시(사용자와 설계 논의 완료). 확정: ①클러스터링=bottom-up ②근거=news_articles(이미 news-sync 수집중, 신규 외부호출 없음) ③갱신=장중 매시 :30(9:30·10:30···15:30 마감직후, Cloud Scheduler) ④임계값=20% 고정(급등없는날 빈 상태 표시) ⑤단일종목=별도 '개별 급등' 섹션(2종목+ 는 '테마' 카드) ⑥이력=일별 스냅샷 누적 ⑦홈=루트(/) 승격, 스캐너 2번째 메뉴. 데이터흐름=새 `home-sync` 워커(Cloud Run Job)가 top_movers⋈stock_quotes(≥20%)+급등종목 news_articles 읽어 **급등집합+뉴스 content hash 가 직전 스냅샷과 동일하면 Claude 호출 skip**(비용/일관성 가드, theme-sync 24h hash 패턴 재사용) → Claude Haiku 1회(temp=0, JSON-only) → `home_theme_snapshots`(일별) 저장 → 웹앱 read-only. 구성=①마이그레이션 home_theme_snapshots(신규 테이블 RLS `TO anon,authenticated` 둘다 명시) ②workers/home-sync(theme-sync anthropic.ts 싱글톤·config 재사용, 프롬프트만 신규) ③server /api/home ④webapp / 루트 페이지 + app-sidebar.tsx NAV. 디렉터리 slug `home-surge-themes`(자동생성 `ai` 는 한글 stripping 결과라 수동 교정). `/gsd-plan-phase 13` 에서 본격 설계.
- Phase 14 added 2026-07-02: AI 애널리스트 챗봇 (멀티에이전트) — 팀장(Sonnet)+전문가 5 에이전트(Haiku: 시세/수급·테마·뉴스/심리·상한가패턴·웹서치) 오케스트레이션. 상한가 따라잡기 전략 대화 특화(주도 테마, 오늘 상한가 종목 분석, 내일 익절 판단). **사용자 결정(2026-07-02 AskQ)**: ①모델=팀장 Sonnet+전문가 Haiku ②히스토리=로그인 사용자별 Supabase 저장(conversations/messages, RLS)+종목별 필터 ③전문가 5명 추천안 그대로. 데이터=기존 테이블(stock_quotes/OHLCV/themes/co-movement/news/discussions/limit_up_*/home_theme_snapshots) tool 조회 + Anthropic web_search 실시간. 백엔드=기존 Express 서버 SSE POST /api/chat (참고: ../weekly-wine-bot server/src/services/chat-service.ts 의 세션 Map/tool-use 루프/sanitizeMessages/rate-limit/SSE 이벤트 프로토콜 이식). 프론트=전역 FAB+챗 시트(참고: ../weekly-wine-cafe24 skin34 somi-chat 패턴을 React로 포팅), 종목상세=해당 종목 컨텍스트+종목별 히스토리, 사이드바 /chat=일반 대화. 디렉터리 slug `ai-analyst-chatbot`(자동생성 slug 한글 stripping 으로 수동 교정). `/gsd-plan-phase 14` 에서 본격 설계.
- Phase 13 complete 2026-07-02: 홈 급등 테마 6/6 프로덕션 라이브. 배포=theme-sync 패턴 복제(VPC 없음, OAuth invoker, Secret 재사용 신규 0). Cloud Run Job `gh-radar-home-sync` @ image f6b1905(512Mi/task-timeout=120s/max-retries=1, SA `gh-radar-home-sync-sa` 최소권한 — supabase-service-role + anthropic accessor 2건만, brightdata 미바인딩) + Scheduler `gh-radar-home-sync-cron` ENABLED(`30 9-15 * * 1-5` Asia/Seoul, 7슬롯, 15:30 마감 포함). **Claude POC 게이트 PASS**(themeCount=4/stockCount=48, claudeCalled=true, isCarried=false — 호남반도체 17멤버/전력기기 5/위메이드 3/이차전지 2, reason 일관, 뉴스 verbatim + 실제 매체 URL junggi/etoday 환각 0, Haiku 1회/사이클 ~\$3.1/월 상한 이내). server 재배포(스모크 9/9, `/api/home` 200 snapshot 4테마 index 1슬롯) + webapp Vercel prebuilt(`/` 홈 200, `/scanner` 307→/login 은 비로그인 auth 정상). smoke-home-sync 6/6 + Playwright home.spec 5/5 green. **후속(비차단):** 테마 내 뉴스 URL dedup 미적용(호남반도체 news_total=44 vs unique=4 — 멤버 종목들이 동일 상한가 기사 참조, 저장 중복). UI 는 근거뉴스 top 1-2 distinct 만 노출해 표시 무영향이나 CLAUDE.md 5원칙 #5(최소 저장) 관점 quick task follow-up 권장.

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
- [Phase 12]: [12-01] limitUpPrice tick 판정은 target(prev_close×1.3) 가격대 기준 — prev_close 기준 시 500k 등 경계 오류(Pitfall 1). 응답 계약은 객체 {hero,events,themes}(배열 아님, comovement 드리프트 회피). TS 미러가 plpgsql limit_up_price() Wave 2 회귀 대조 기준. limit-up-sync 워커 = Phase 11 동조 워커 1:1 복제 + rebuild_limit_up 교체.
- [Phase 12]: [12-02] 마감상한가 판별 = close=limit_up_price(prev_close) 정수 정확 비교(비율 임계 아님, D-01). limit_up_price() IMMUTABLE 순수산술 REVOKE 불요, rebuild_limit_up() 만 REVOKE 3줄+search_path 격리. STEP C 테마풀링=active 시스템테마(is_system AND NOT hidden AND effective_to IS NULL) 멤버 이벤트풀 GROUP BY. 프로덕션 rebuild event_rows=3459/stock 1271/theme 322, 황금케이스(000390 4회 win 0.75·000440 4회 jeom1 win 0.50) 재현, anon RPC 401(REVOKE).
- [Phase 12]: [12-03] server 읽기 라우트 GET /api/stocks/:code/limit-up = limit_up_* SELECT → { hero, events, themes } 객체 계약(배열 아님). 정적 이력 — 시세 조인/재계산 0 (D-22 read-only). turnover/win_rate NULL 보존(toNumOrNull), 테마 sample_n DESC 정렬(D-17), 이벤트 0회 zeroStats 빈 상태. /:code 핸들러 앞 등록(shadowing 회피). prod 재배포 revision gh-radar-server-00030-wb6 + curl 검증(000440 events=4 객체·005930 빈·!!! 400·count 3459 불변). smoke INV-8 무관 FAIL.
- [Phase 12]: [12-04] limit-up-sync 워커 배포 — Phase 11 동조 워커 setup/deploy/smoke 1:1 복제(식별자만 교체). Cloud Run Job gh-radar-limit-up-sync(180s) + Scheduler nightly(cron 0 2 * * 2-6 KST, OAuth invoker OIDC 금지, 리소스 단위 run.invoker). 외부 API 키 0(supabase-service-role accessor 1개만, T-12-04-02). 배포된 Job rebuild_limit_up 실행 event_rows=3459/stock 1271/theme 322. smoke INV-1/3/4/5 PASS, INV-2 는 Cloud Logging 전파지연 flake(직접 재조회 통과).
- [Phase 12]: [12-05] webapp 상한가 다음날 이력 섹션 ②안 데이터 대시보드 — KPI 3그리드(시초가 익절 N≥3 게이팅/평균/최악) + 전폭 분포 밴드(변형 A) + OHLC 8컬럼 표(점상 태그·faded·더보기) + 테마 가로 풀링 바(N desc) + 면책. 표시 순수함수(shouldShowWinRate/sparkBucketTone/fmtRet/fmtTurnover/BUCKET_LABELS) limit-up-format.ts 분리 + 단위 테스트 박제(sparkBucketTone(2)='up' off-by-one BLOCKER 3 가드). comovement 미러 quiet fallback(return null, error.message 미노출, T-12-05-01). 국내 색상 oklch 토큰만(D-13, 하드코딩 0). prod 시각 검증 중 분포 spark 가독성 이슈 → 변형 A(라벨 세로 막대 밴드) 재디자인 후 재배포(gh-radar-webapp-faraucl94...). Phase 12 LIMIT-01 end-to-end prod live.
- [Phase 13]: [13-01] home_theme_snapshots = JSONB-blob-per-row 스냅샷 (PK trade_date,captured_at + payload jsonb Claude 출력 1:1 + content_hash/is_carried hash-skip 복제 append). RPC 없는 plain table → REVOKE 불요, RLS SELECT TO anon,authenticated + service_role write. 프로덕션 push 완료(anon GET 200).
- [Phase 13]: [13-01] workers/home-sync = theme-sync reduced 클론 — config 은 anthropic+supabase+급등튜닝(surge/news)만, 스크랩/프록시 전면 제거. anthropic.ts/parseJson.ts verbatim. Dockerfile VPC 없음(§Pattern 5 Supabase+Anthropic만 호출). [Rule 1 버그] config JSDoc 의 */scrape* 시퀀스가 블록주석 조기종료 유발 → 리워딩.
- [Phase 13]: [13-02] home-sync 파이프라인 — loadSurges(급등+종목별 top-K 뉴스 truncation 회피) + clusterSurges(Claude 1x bottom-up, newsRefs 인덱스 verbatim 해석 D-04 + breadth 정렬 D-05 + <2 강등 D-06) + runHomeSyncCycle(hash-skip clone-append is_carried, Pattern 4). TDD 20/20 green + build 0. clusterSurges 반환 ClusterResult(threshold/marketStatus 는 index 확정). tsconfig exclude src 테스트(코로케이트 테스트가 build 로 vitest 끌어오는 문제 차단, Rule 3).
- [Phase 13]: 13-03: /api/home 읽기 라우트 = limitUp 객체계약 { snapshot, index }(배열 아님). payload verbatim 서빙(실시간 시세 재조인 없음, Pitfall 3/T-13-03). 파라미터 우선순위 capturedAt>date>무필터.
- [Phase 13]: 13-04: useHomeQuery 폴링 없음 — 홈은 시점별(:30) 이력 조망 화면이라 사용자 date/slot 전환이 fetch 트리거. AbortController 로 파라미터 빠른 전환 레이스 차단(useThemesQuery 변형)
- [Phase 13]: 13-04: 시점 슬롯 HH:MM 라벨/마감(15:30) 판별 = Intl.DateTimeFormat timeZone=Asia/Seoul (capturedAt UTC ISO → KST). home-client isEmpty = snapshot null OR (themes[] AND singles[] 둘 다 비어있음)
- [Phase 13]: 13-04: /home-preview 프리뷰 + middleware PUBLIC_EXACT 항목은 임시 검증 스캐폴드 — home-client 가 라이브 /api/home 호출이라 네트워크 무관 목데이터 프리뷰로 시각 체크포인트 승인. Plan 05 가 / 루트 마운트 시 둘 다 제거
- [Phase 13]: 13-05: 홈을 앱 루트(/)로 승격 — page.tsx redirect('/scanner') → AppShell+Suspense(HomeSkeleton)+HomeClient(force-dynamic), 사이드바 NAV 홈 1번째. 임시 /home-preview 라우트+middleware 화이트리스트 제거. home.spec E2E 5/5(렌더/날짜·시점 네비/빈 상태/scanner 회귀 T-13-12)
- [Phase 13]: [13-06] home-sync 프로덕션 배포: Cloud Run Job(512Mi/120s, VPC 없음) + Scheduler gh-radar-home-sync-cron(30 9-15 KST 7슬롯, OAuth) + Secret 재사용 신규 0. Claude POC PASS(themeCount=4 실제 대응, 환각 0, ~$3.1/월 이내). 후속(비차단): 테마 내 뉴스 URL dedup(news_total 44 vs unique 4 저장 중복, 표시 무영향).
- [Phase 14]: 14-01: conversations.stock_code ON DELETE SET NULL (종목 상폐 시 대화 보존) + messages RLS 는 user_id 없이 conversations EXISTS 서브쿼리 4정책 + RPC 없어 REVOKE 불요(home_theme_snapshots 선례). 비공개라 TO authenticated 만(anon 미부여=default-deny). production push + pg_policies 8행 검증.

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

Last session: 2026-07-02T10:59:29.010Z
Stopped at: Completed 14-01-PLAN.md
Next: 10-08 deploy-e2e — Task 1(Dockerfile + setup/deploy/smoke 스크립트, master-sync 복제 OAuth invoker) + Task 2(E2E 3종: themes/user-themes/theme-chips) 작성·정적검증 완료(666cfe1, b5e33d6). Task 3 [BLOCKING]: GCP 인증(Deployer SA) 후 setup-theme-sync-iam.sh → deploy-theme-sync.sh(THEME_SYNC_CLASSIFY_ENABLED=true) → smoke-theme-sync.sh(themes count > 0) → Playwright E2E. 사용자 승인 후 오케스트레이터가 실행. (DI-02 smoke 헤더 CR 버그는 smoke-theme-sync.sh 에서 tr -d '\r' 로 선제 회피.)
