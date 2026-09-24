---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 19
current_phase_name: 계좌별 주문기록 전용 연결
status: executing
stopped_at: Completed 19-06-PLAN.md
last_updated: "2026-09-24T16:21:15.570Z"
last_activity: 2026-09-25
last_activity_desc: 19-06 완료 — webapp 오늘 주문 원천 전환(REST + journal.rows 병합 · journal.state 복구 재조회 · 옛 라이브 join·DmaOrderRow 삭제, 미push)
state_head: d8db495c28c86ba72f148d70e53eb47c969ff518
progress:
  total_phases: 28
  completed_phases: 4
  total_plans: 246
  completed_plans: 224
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 19 — 계좌별 주문기록 전용 연결

## Current Position

Phase: 19 (계좌별 주문기록 전용 연결) — EXECUTING
Plan: 7 of 13
Plans completed: 224 / 233
Status: Ready to execute
배포 순서: DB(완료 · R4 변경 0) → relay(R2 18-14·17·19 + R3 18-25·18-26 + R4 18-33) → 검증 → webapp push (18-26 webapp 은 relay 18-26 뒤에만 · R4 webapp 새 결합 없음)
Production URL: https://gh-radar-webapp.vercel.app
Last activity: 2026-09-25 — 19-04 완료(shared 저널 행 계약·매퍼·wss 프레임 2종 + server GET /api/orders 저널 RPC 1회 · server 261 · shared 115 green, 미배포) / 이전: 19-02 완료(relay 사용자 세션 dma_orders 기록부 제거 · 기록 모듈 삭제 · relay 527 · e2e 50 green, 미배포)

Progress: [█████████░] 93%

Phase 16 갭 클로징 이력: [16-GAP-CLOSURE-LOG.md](./phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md)

### ✅ Phase 17 프로덕션 배포 완결 (2026-09-20 20:31 KST)

- webapp = relay = `ef1499a`(같은 커밋) · `/healthz` → `status:"ok"` · `vpn:true` · `dma:true` · `stalledCount:0` · `DMA_HOST=10.41.1.120` 보존(미주입).
- `smoke-relay.sh` **PASS 12 · FAIL 0 · SKIP 1**(INV-9 는 `SMOKE_AUTH_TOKEN` 미설정 시 SKIP 이 정상).
- **교훈 — 이 저장소에서 `git push` 는 곧 webapp 프로덕션 배포다.** 배포 순서는 **relay 먼저 → 검증 → push**, 백엔드 배포가 막히면 push 하지 않는다.
- 원문(반쪽 배포 25분 경위 · 방화벽 가드 `4225a6f`): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#낡은-섹션-원문)

### ★ 그 외 남은 것 1건

- **`sudo xcodebuild -license` 동의.** Xcode 27.0 / 동의본 26.3 불일치로 `clang`·`xcrun`·`strings`·Homebrew `g++-15` 가 전부 막혀 **D-25 실기 검증이 미수행**(WINDOWS #17 — **배포해도 닫히지 않는다**). 동의 후 `cd /Users/alex/repos/gh-trade/server && ./scripts/build.sh --server-only` (45s).

## Performance Metrics

**Velocity:**

- Total plans completed: 89 (1 + 5 + 1×6 sub)
- Phase 1 duration: 2026-04-10 ~ 2026-04-13 (4일)
- Phase 2 duration: 2026-04-13 (1일)
- Phase 3 duration: 2026-04-13 (1일)
- Total commits: 25+

**By Phase:**

이전 행(By Phase 전부 · Per-Plan Phase 17·18): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#performance-metrics)

| Phase | Plans | Duration | Status |
|-------|-------|----------|--------|

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 19 P01 | 10min | 3 tasks | 5 files |
| Phase 19 P02 | 12min | 3 tasks | 11 files |
| Phase 19 P03 | 10min | 3 tasks | 4 files |
| Phase 19 P04 | 4min | 2 tasks | 7 files |
| Phase 19 P05 | 8min | 2 tasks | 6 files |
| Phase 19 P06 | 10min | 3 tasks | 13 files |

## Accumulated Context

relay 운영 지식(Phase 17 이 남긴 재사용 가능한 사실): [docs/relay-operations.md](../docs/relay-operations.md)

### Roadmap Evolution

- Phase 17 added 2026-09-18: gh-trade 프로토콜 재동기화·기존 화면 보정·상따 래치 LED — 서버 291a953→HEAD(59f7513e 배포) append-only 변경 반영, MsgType 36~38·76~78, 래치 3종 LED + 수동 점등
- Phase 18 added 2026-09-18: gh-trade 신규 기능 UI — 돌파감지 목록(76/78)·예약/시간외종가 발주(77)·NXT VI 설정. Phase 17 뒤, 목업 게이트 필수
- Phase 19 added 2026-09-24: 계좌별 주문기록 전용 연결 — relay↔gh-trade 관찰자 기록 연결 1개 장중 상시 · seq 이어받기 · 계좌 기준 기록. 근거 debug mobile-bg-resume-gaps 1번(부재 5분 초과 시 통보 51 유실, 09-23 43 vs 2건)
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
- Phase 16 added 2026-09-07: 트레이딩 메뉴(상따·VI) — gh-trade WinForms 상따전략창(필드 29개, 등록버튼 없이 스위치 ON=등록·값변경 300ms 자동재제출·전략키 ISIN:계좌:거래소)과 VI 종합주문창(세션당 1건: 계좌·금액(만)·상승률·run, 주문가=상한가 고정, VI 주문내역 확인체크=119초 취소 면제)을 웹으로 이식. 사이드 메뉴 재편: 종목검색(상승률 상위=구 스캐너·테마·관심종목) / 트레이딩(상따 — 하위에 등록된 전략 목록, VI) / My page(전략 현황·잔고·미체결 = gh-trade 메인폼) / 홈·AI 애널리스트 유지. **실시간 공유는 구조적으로 해결됨**: 게이트웨이가 세션(user_id+broker) 단위로 모든 연결에 Set*Resp 에코를 팬아웃하고 Phase 15 D-17 철회로 웹도 `ezmesya` 세션에 합류 → relay 가 전략 메시지(10/11/20/21/24/33/34 ↔ 56/60/61/64/65/72/73)를 wss 로 흘리면 됨, DB 동기화 불필요. 사용자 지시: GSD 정식 절차(discuss → ui-phase 목업 → plan → execute). 사전 목업 초안(scratchpad `16-limit-chaser-mockup.html`, `16-vi-trigger-mockup.html`)은 ui-phase 에서 phase 디렉토리로 이관·재검토.
- Phase 15 added 2026-09-05: DMA 중계 서버(relay) — GCE VM(radar-gw) 에서 KB VPN 너머 gh-trade-server(10.41.1.120:9100, FlatBuffers) 에 붙어 호가 10단 시세를 브라우저로 wss 팬아웃 + 주문 릴레이. 인계 문서 `tasks/relay-handoff.md`(gh-trade 세션 2026-09-05). 사용자 지시: 정식 phase 절차(discuss→plan→execute), 핸드오프 결정 사항은 discuss-phase 에서 전면 재검토.

### Decisions

전체 결정 로그: [DECISIONS-ARCHIVE.md](./DECISIONS-ARCHIVE.md)

- [Phase 18]: 18-28: 옮기기 확정 직전 viMoveTargetOf 재판정 · 스냅샷 from·to 전체 일치일 때만 송신, 아니면 VI_MOVE_STALE_TEXT · 창 유지 (T-18-118)
- [Phase 18]: 18-28: 가동 중 VI 불일치 고지는 「옮기려면 먼저 중지하세요」 — 버튼 DOM 부재 + submit 계좌 지정 가드 두 겹 (T-18-117)
- [Phase 18]: 18-30: 결과 모름(timeout) 잠금은 TradingWorkbench 가 계좌|ISIN|거래소 키로 들고 /trading 페이지를 떠날 때만 푼다 — ✕·접기·재추가·계좌 전환·DMA 게이트 전환으로 풀리지 않음. 잠긴 카드 ✕ 는 결과 모름 확인 다이얼로그(data-reason=unknown). 호가 탭은 폼 로컬 잠금 그대로 (GC-WR-03)
- [Phase 18]: 18-29: 사용자 apply 선택(위반 행 a=0·b=0) — 원격 dma_orders_price_check null-safe 적용, 전후 덤프 diff CHECK 1줄뿐(GC-CR-01 원격 닫힘)
- [Phase 18]: 18-31: 계좌 늦게 도착 시 사용자 카드의 펼침을 같은 키 등록 카드가 잇고 정리는 removeCard 와 같은 forgetCardState (GC-IN-05)
- [Phase 18]: 18-31: 잔고 평가 가격 = KRX 우선 · NXT 폴백(holdingQuotePrice, 카드 순서 무관) · NXT 전략만 「{종목명} · NXT」 꼬리(로그 who · 사이드바) (GC-IN-04)
- [Phase 18]: 18-33: R3-WR-01 상태 단조성은 relay supabaseOrderSink 조건부 UPDATE(status IN replaceableStatusesOf) — 마이그레이션 없음, 막힘은 warn+flushedNoop
- [Phase 18]: 18-34: 결과 모름 잠금 = RelayProvider 앱 수명(strategyKey) — 신규·정정만 · 진행 중 포함 · 로그아웃·새로고침에만 해제 (18-30 컨텍스트 승격 금지를 사용자 결정 1로 대체)
- [Phase 18]: 18-35: 주문 잠금 원천은 RelayProvider.orderLocks 하나 — 작업대는 ✕ 판정에만 읽고 폼은 스스로 읽는다(18-30 배선 제거)
- [Phase 18]: 18-35: 카드 정리(더티 키 · 직전 로그)는 커밋된 cards 에서 파생 — 치운 id 를 계산하지 않는다(R3-IN-03)
- [Phase 19]: 19-01: dma_journal_apply 필수 키는 seq·trade_date·gw_time_ms — 형식 오류면 배치 전체 실패(계약 위반 비은폐), 나머지 키는 빈 문자열/0/false 로 적재
- [Phase 19]: 19-01: 투영은 알 수 없는 request_kind·빈 account_no 를 RAISE(apply_error 로 드러남), sync_access 는 빈 키 행이 있으면 교체 전체 거부(기존 매핑 보존)
- [Phase 19]: 19-01: 저널 테이블 4종·함수 6종은 서비스롤 전용 — 로컬 pgTAP 이미지의 기본 ACL 이 플랫폼 auto-grant 를 재현해 명시 REVOKE 누락을 잡는다
- [Phase 19]: Phase 19 D-01: relay 주문 핸들러는 rid 즉시응답 상관만 한다 — dma_orders 기록부(요청 행·정산·미부착 통보·자동주문 행·원주문 정산·정정 이동·전략 캐시 계좌 추정) 전부 제거, 요청 경로는 동기
- [Phase 19]: Phase 19 D-05: relay/src/store/orders.ts 와 그 테스트·가짜 PostgREST 삭제 — 동결 테이블에 쓸 수 있는 코드를 남기지 않는다
- [Phase 19]: WsFanout 주문 분기는 종목맵(symbols) 하나로 열린다. Hub {t:"order"} 팬아웃·감사 사본 로그는 유지(D-03 · Open Q7)
- [Phase 19]: 19-03: 원주문 번호로 온 정정/취소 거부는 reject_seq 행으로 분리 — 원주문 rejected 덮기 금지
- [Phase 19]: 19-03: 방향은 원주문 side 정본, 없으면 side_trusted 일 때만 레코드 값(거부 행 포함)
- [Phase 19]: 19-04: resolveTradeDate 는 NaN 검사 + KST 재변환 일치 검사 — 2026-02-30 같은 롤오버 날짜도 400
- [Phase 19]: 19-05: relay JournalAccess 는 빈 식별자 매핑 행을 버린다 — DB sync RPC 가 한 행 때문에 교체 전체를 거부해 무한 재시도가 되는 것을 막는다
- [Phase 19]: 19-05: JournalWriter.push 의 gap/overflow 는 호출자(19-07 관찰자)가 dropTransport 후 since_seq=lastReceivedSeq 로 재접속하라는 신호 — 커서는 적용 RPC 트랜잭션 안에서만 전진
- [Phase 19]: 19-06: 카드 원천 = REST + journal.rows 두 가지, 같은 id 는 lastSeq 큰 쪽 — 정렬 비교 함수 하나(compareJournalNewestFirst)를 리듀서와 병합이 공유
- [Phase 19]: 19-06: 자동주문 묶기는 origin limit_chaser|vi 이고 requester≠Manual 일 때만 — origin null 은 묶지 않음(D-08 보충)

### Pending Todos

닫힌 항목(근거 포함): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#닫힌-todo--blocker)

- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key) — 예: 90일 cron
- DI-03: Phase 09.2 RESEARCH Pitfall 10 follow-up — `news_articles`, `discussions`, `summaries` 테이블의 RLS 정책이 `TO anon` 만 명시하는지 audit. supabase/migrations/20260515163000 (stock_daily_ohlcv fix 패턴) mirror 로 `TO anon, authenticated USING (true)` 갱신 필요. supabase-js 가 인증 사용자 JWT 호출 → role=`authenticated` → 정책 부재 → default-deny 함정. 본 phase 09.2 와 무관 (차트는 stock_daily_ohlcv 만 사용) 하나 로그인 사용자 페이지 (Phase 7 뉴스, Phase 8 토론, Phase 10 요약) 의 빈 응답 가능성. 별도 phase 또는 인프라 PR 권장.
- DI-04: Phase 09.2 RESEARCH Pitfall 11 follow-up — Vercel production env 등록 시 trailing newline (`\n`) 오염 검증 절차 자동화. 증상: dev 정상이나 production 만 모든 fetch 비정상. 검증: `vercel env pull` 후 `tail -c1 .env.local | xxd -p` 가 `0a` (newline) 이면 오염. 즉시 수정: `vercel env rm` + `printf "%s" "값" | vercel env add`. CI hook 자동화 검토 (별도 인프라 PR).

### Blockers/Concerns

닫힌 항목(근거 포함): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#닫힌-todo--blocker)

None yet.

### Quick Tasks Completed

이전 quick 이력: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#quick-tasks-completed)

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260923-nvr | **VI 해제된 발동 숨김** — gh-trade `VIOrderItem.vi_released`(슬롯 36, jsv) 동기화: relay 디코드 · shared `viReleased?` · 작업대 VI 칩·표·미확인 수에서 해제 항목 제외(설정 중지 요약은 전체). relay 605 · webapp 1094 · Playwright 54/0. gh-trade 실서버·relay 배포 뒤 동작 | 2026-09-23 | — | [260923-nvr-vi-released-hide](./quick/260923-nvr-vi-released-hide/) |
| 260923-m23 | **정정확인 수량 캡 대응(gh-trade a940b25f·a70f6ab7)** — relay `dma_orders` 정정 모델링: 정정 행 qty 를 hub 66/67 기준 이동 수량으로 캡(요청 에코 유령 잔량 제거) · 원주문 행 `modified_qty` 기록·전량 이동 시 종결 `modified` · CAS 수량 경로 일반화(E-before-M 재판정) · 자동 정정 행 order_type M · 웹앱 「정정」 표시. 새 마이그레이션 `20260923120000_dma_orders_modified.sql`(원격 미적용). relay 630 · webapp orders-api 16 · pgTAP 15 ok. 배포 순서: 마이그레이션 → relay → push | 2026-09-23 | 96b166d | [260923-m23-dma-orders](./quick/260923-m23-dma-orders/) |
| 260923-onn | 작업대 카드 안 탭(정보\|미체결 N\|잔고\|로그 N 교체) + 접힌 카드 요약(LED 점 3개 · 미체결 N · 잔고 N주) — 2026-09-23 목업 채택안 ①A/②A. LatchLed variant=dot · card-account-slice 순수 함수 · card-tabs · AccountPanel stock 스코프 임베드 · 선택 토글 헬퍼 공유. build 0 · webapp 1561/1 skip · Playwright trading-workbench 38/0 | 2026-09-23 | 381dd52 | [260923-onn-wb-card-tabs-summary-led-3-n-n-2026-09-2](./quick/260923-onn-wb-card-tabs-summary-led-3-n-n-2026-09-2/) |
| 260923-p3k | 작업대 카드 순서 — 접으면 접힘 스택 끝 · 펼치면 펼친 카드 끝 · 새로 열리는 카드도 펼친 카드 끝(withCardOpen 단일 경로, open 만 바꾸던 7지점 통일) · 같은 종목 카드 둘일 때 펼친 카드 우선 선택(isinFocusCardOf). webapp typecheck 0 · 1569/1 skip · Playwright trading-workbench 38/0 | 2026-09-23 | bdfaacf | [260923-p3k-wb-card-order](./quick/260923-p3k-wb-card-order/) |
| 260923-pgu | 작업대 이벤트 알림(목업 ③A · Phase 15 D-36/18 D-27 「토스트 없음」 결정 갱신) — 접수·체결·정정/취소확인·거부·VI 발동·돌파 토스트(우하단, 폰 상단 · 6/4초 · 최대 4 · role=status) · 같은 주문 체결 3초 창 누적 · 이벤트 카드 헤더 3회 펄스+빨간 점 · 클릭 시 카드 펼침+해당 탭 · relay 리듀서 주문번호 색인(0행 포함) · e2e GC8. typecheck 0 · 1634/1 skip · Playwright 39/0 | 2026-09-23 | 032a041 | [260923-pgu-wb-alerts-vi-3-3-2026-09-23-a](./quick/260923-pgu-wb-alerts-vi-3-3-2026-09-23-a/) |
| 260923-pgv | 작업대 카드 거래소 KRX\|NXT 토글 — 등록 후 잠금(D-10) 해제, 토글 = 그 거래소 키의 전략 표시(있으면 옵션·없으면 미설정 폼, 서버 전략 이동 없음) · 충돌→더티 확인 다이얼로그→적용 3단 · 자동 카드 미재생성 잠금 테스트 · ✕ 「결과 모름」 판정을 KRX·NXT 두 키로(uhw ⑦·⑦-b 계약 대체) · e2e GC3 보강. typecheck 0 · 1643/1 skip · Playwright 39/0 | 2026-09-23 | 86a2fa2 | [260923-pgv-wb-exchange-toggle-krx-nxt-d-10](./quick/260923-pgv-wb-exchange-toggle-krx-nxt-d-10/) |
| 260923-pq2 | NXT 미거래 종목은 카드·호가 거래소 세그먼트에 「KRX」 라벨 하나 — relay 57 nxt_tradable 보존 → GatewaySymbolMaster ISIN 집합 → 인증 직후 nxt.snap(적재 시에만) · 재적재 재전송 · webapp 리듀서 nxtTradable(null=모름 → 둘 다) · exchangeChoicesOf 순수 함수. build 0 · relay 632 · webapp 1655/1 skip · Playwright 39/0. **relay 미배포** — 배포 순서 relay → 검증 → push | 2026-09-23 | f9ce892 | [260923-pq2-wb-nxt-hide-nxt-nxt-relay-57-nxt-tradabl](./quick/260923-pq2-wb-nxt-hide-nxt-nxt-relay-57-nxt-tradabl/) |
| 260923-que | 카드 ✕ 「결과 모름」 경고 — 같은 종목·계좌의 다른 카드가 지금 보여주는 거래소 키는 제외(lockedExchangesOf 카드 배열 인자 · pgv OR 판정의 과잉 경고 제거) · ⑦ 갱신 · ⑦-g 2건. typecheck 0 · 1657/1 skip · Playwright 39/0 | 2026-09-23 | 7cff024 | [260923-que-wb-close-lock-shown](./quick/260923-que-wb-close-lock-shown/) |
| 85 | 작업대 소소 4건(fast) — 카드 탭 제목 괄호 건수 · 수동주문 입력 16px · 접으면 접힘 맨 앞 · NXT 미거래 종목 카드 세그먼트 숨김. webapp 1657/1 skip · Playwright 39/0 | 2026-09-23 | 0ae774a | — |
| 86 | 작업대 5건(fast) — 더티 바 카드 하단(JS 핀 · main 스크롤 컨테이너라 sticky 불가) · 꺼진 전략 기본 숨김(isActiveStrategy · 진입 시 1회 걷기) · 돌파 표/칩 폰 정리 · 매수취소 체크 한 줄. webapp 1660/1 skip · Playwright 39/0 | 2026-09-23 | 797d468 | — |
| 260924-blo | STATE.md 정리 — 966줄→216줄. 낡은 섹션·이전 quick/metrics 행은 STATE-ARCHIVE.md, 결정 290건은 DECISIONS-ARCHIVE.md, Phase 16 갭 클로징 로그는 16-GAP-CLOSURE-LOG.md, Phase 17 relay 운영 지식은 docs/relay-operations.md 로 이관·링크. 닫힌 Todo 3·Blocker 2 근거 기록. split/verify 스크립트로 무손실 검증 | 2026-09-24 | 4d07ad5 | [260924-blo-state-md-phase-16-decisions-phase-17](./quick/260924-blo-state-md-phase-16-decisions-phase-17/) |
| 12 | Per-Plan 메트릭 표 Phase 17·18 행 47개 STATE-ARCHIVE.md 이관(fast) — STATE.md 는 헤더 스캐폴드만, 170줄 | 2026-09-23 | 966632d | — |

## Session Continuity

**Resume file:** None

Last session: 2026-09-24T16:21:14.917Z
Stopped at: Completed 19-06-PLAN.md
Next: **Phase 17 은 12/12 plan 실행 + 프로덕션 배포까지 완결됐다.** 전량 게이트 green(루트 typecheck · relay **467** · webapp **998**(+1 skip) · shared **108** · Playwright **135 pass · 0 fail** · 재동기화 `--check` 차이 0), 프로덕션 `ef1499a` · smoke 12 PASS. **남은 것은 실기 관측 1건이다.**

- **① D-25 실기 관측 (WINDOWS #17 · 배포해도 닫히지 않는다).** 래치 36/37/38 왕복과 76/77/78 드롭 0 을 아직 한 번도 보지 못했다. 두 경로 중 하나: **(a) 다음 장중(평일 08:00~20:00 KST)에 상따 화면에서 LED 를 눌러 색 전환을 관측**하거나, **(b) `sudo xcodebuild -license` 동의 후 gh-trade HEAD 를 빌드해 mock 왕복 관측**. 관측되면 **TRADE-04 · TRADE-05 를 Complete 로 재판정**한다.
- **② `sudo xcodebuild -license` 동의** — D-25 실기 검증(WINDOWS #17) 재개용. **배포해도 이 항목은 닫히지 않는다.**
- **TRADE-04 · TRADE-05 는 Pending 유지** — 배포는 (부분)했지만 래치 36/37/38 실기 왕복은 여전히 미관측이고, 일요일이라 실거래 관측도 불가했다. 기준을 바꾸지 않았다.
- **WINDOWS:** open 4건 — #9·#10·#11(Phase 16 승계) · **#17(D-25 미수행)**. #12·#14·#15·#16 은 이번에 닫았다(#16 은 사용자 육안 승인).

- **Phase 16 승계 항목 3건 (여전히 유효).**
- **① smoke `INV-9` 프로덕션 첫 실행 미수행.** `SMOKE_AUTH_TOKEN`(브라우저 로그인 `access_token`, 약 1시간 만료)이 있어야 16-21 재작성 이후 첫 실행이 된다. 저장소 어디에도 값이 없는 것이 정상이다(T-16-74). 명령은 `deferred-items.md` §16-46. **이것은 TRADE-03 조항의 결손이 아니라 프로브의 미실행이다** — 섞어 적지 말 것.
- **② `/healthz` 알림 정책 — 사용자 결정 대기.** `gh-radar-relay-down` 은 게이트웨이가 붙어 있는 지금(`stalledCount: 0`)은 조용하지만, 끊기면 세션 생성 5분 뒤 503 이 상시화된다. 해법 후보 4개는 `deferred-items.md` §16-35. 실행자가 단독으로 고를 문제가 아니다.
- **③ 다른 세션과의 정합.** WireGuard 작업(`quick-260909-t08` 계열)이 방화벽 규칙을 4개로 늘려 smoke `INV-2` 문구가 바뀌었다. `REQUIREMENTS.md` RELAY-03 의 「방화벽 3규칙」과 어긋나므로 그 세션이 정합을 맡는다.
