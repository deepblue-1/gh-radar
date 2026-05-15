---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 09.2 CONTEXT 보강 라운드 — mockup 라이브러리 후보 3종 lock-in
last_updated: "2026-05-15T10:46:42.538Z"
last_activity: 2026-05-15 -- Phase 09.2 planning complete
progress:
  total_phases: 19
  completed_phases: 11
  total_plans: 84
  completed_plans: 67
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 09.1 — intraday-current-price

## Current Position

Phase: 09.2
Plan: Not started
Plans completed: 62 / 70 (Phase 9 6 plans + 09.1 11 plans)
Status: Ready to execute
Production URL: https://gh-radar-webapp.vercel.app
Last activity: 2026-05-15 -- Phase 09.2 planning complete

Progress: [█████████░] 89% (62/70 plans · 11/17 phases)

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

- Total plans completed: 49 (1 + 5 + 1×6 sub)
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

### Pending Todos

- 주말 KIS 실증 테스트 (휴장일 acml_hgpr_date 검증) — 다음 주말에 보완
- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- DI-01: `incr_api_usage(text,date,int)` RPC 에 `REVOKE ALL FROM anon, authenticated` 마이그레이션 추가 (Supabase 플랫폼 auto-grant 회귀) — Phase 8 또는 별도 infra PR
- DI-02: `scripts/smoke-master-sync.sh` INV-4 헤더 CR 파싱 버그 (동일 패턴, 별도 PR)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key) — 예: 90일 cron

### Blockers/Concerns

- 네이버 종목토론방 현재 렌더링 방식(SSR vs CSR) → Phase 8 전에 검증 필요
- Cloud Run min-instances=1 정확한 월 비용 → Phase 2 배포 시 확인

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260418-kd8 | phase 7 뉴스 풀페이지 무한 스크롤 (Phase 8 토론방 1:1 미러) | 2026-04-18 | fb2607c | [260418-kd8-phase-7](./quick/260418-kd8-phase-7/) |
| 260424-dld | 스캐너 등락률 슬라이더 제거 + 서버 고정 10% 하한 | 2026-04-24 | a371cc2 | [260424-dld-remove-scanner-rate-filter](./quick/260424-dld-remove-scanner-rate-filter/) |

## Session Continuity

Last session: 2026-05-15T05:52:02.396Z
Stopped at: Phase 09.2 CONTEXT 보강 라운드 — mockup 라이브러리 후보 3종 lock-in
Next: Phase 10 AI Summarization (Not started) — CONTEXT/RESEARCH 작성부터 (`/gsd-context-phase 10`)
