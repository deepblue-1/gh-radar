---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 19
current_phase_name: 계좌별 주문기록 전용 연결
status: planning
stopped_at: Phase 20 complete, ready to plan Phase 19
last_updated: "2026-10-03T12:56:24.709Z"
last_activity: 2026-10-03
last_activity_desc: Phase 20 complete, transitioned to Phase 19
state_head: 6c8c88d8189fe306145c0f6d9906a2e1d59509e3
progress:
  total_phases: 35
  completed_phases: 5
  total_plans: 352
  completed_plans: 337
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 26 — 시세 전용 공유 연결 — relay 종목 단위 팬아웃

## Current Position

Phase: 19 — 계좌별 주문기록 전용 연결
Plan: Not started
Plans completed: 220 / 234
Status: Ready to plan
배포 순서: DB(완료 · R4 변경 0) → relay(R2 18-14·17·19 + R3 18-25·18-26 + R4 18-33) → 검증 → webapp push (18-26 webapp 은 relay 18-26 뒤에만 · R4 webapp 새 결합 없음)
Production URL: https://gh-radar-webapp.vercel.app
Last activity: 2026-10-03 — Phase 20 complete, transitioned to Phase 19

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
| Phase 19 P07 | 13min | 3 tasks | 12 files |
| Phase 19 P08 | 10min | 3 tasks | 6 files |
| Phase 19 P09 | 16min | 3 tasks | 21 files |
| Phase 19 P10 | 12min | 3 tasks | 17 files |
| Phase 19 P11 | 30min | 3 tasks | 0 files |
| Phase 19 P12 | 35min | 3 tasks | 0 files |
| Phase 20 P01 | 18 min | 2 tasks | 8 files |
| Phase 20 P02 | 11min | 3 tasks | 8 files |
| Phase 20 P03 | 13min | 3 tasks | 10 files |
| Phase 20 P04 | 25min | 3 tasks | 9 files |
| Phase 20 P05 | 7min | 2 tasks | 4 files |
| Phase 20 P06 | 14min | 2 tasks | 4 files |
| Phase 20 P07 | 39min | 3 tasks | 10 files |
| Phase 20 P08 | 23min | 3 tasks | 8 files |
| Phase 21 P01 | 29min | 3 tasks | 33 files |
| Phase 21 P02 | 4min | 2 tasks | 57 files |
| Phase 21 P04 | 11min | 2 tasks | 13 files |
| Phase 21 P03 | 3 min(Task 3) · 체크포인트 대기 별도 | 3 tasks | 2 files |
| Phase 21 P05 | 10min | 2 tasks | 7 files |
| Phase 21 P07 | 10min | 3 tasks | 13 files |
| Phase 21 P10 | 8min | 3 tasks | 8 files |
| Phase 21 P14 | 5min | 2 tasks | 13 files |
| Phase 21 P06 | 20min | 3 tasks | 12 files |
| Phase 21 P08 | 12min | 3 tasks | 9 files |
| Phase 21 P11 | 8min | 2 tasks | 7 files |
| Phase 21 P12 | 9min | 3 tasks | 16 files |
| Phase 21 P09 | 25min | 3 tasks | 10 files |
| Phase 21 P13 | 13min | 2 tasks | 7 files |
| Phase 21 P15 | 11 min | 3 tasks | 13 files |
| Phase 21 P17 | 4min | 3 tasks | 7 files |
| Phase 21 P18 | 4min | 2 tasks | 6 files |
| Phase 21 P19 | 2min | 2 tasks | 6 files |
| Phase 21 P20 | 6min | 3 tasks | 6 files |
| Phase 21 P21 | 3min | 2 tasks | 3 files |
| Phase 21 P22 | 4min | 2 tasks | 7 files |
| Phase 21 P23 | 12min | 2 tasks | 0 files |
| Phase 21 P24 | 5min | 2 tasks | 1 files |
| Phase 21 P25 | 19min | 3 tasks | 4 files |
| Phase 21 P26 | 5min | 3 tasks | 10 files |
| Phase 21 P27 | 8min | 3 tasks | 17 files |
| Phase 21 P28 | 7min | 3 tasks | 5 files |
| Phase 21 P29 | 19min | 3 tasks | 8 files |
| Phase 21 P30 | 12min | 3 tasks | 21 files |
| Phase 21 P31 | 9min | 2 tasks | 11 files |
| Phase 21 P32 | 19min | 3 tasks | 12 files |
| Phase 21 P33 | 14min | 3 tasks | 9 files |
| Phase 21 P34 | 23min | 3 tasks | 25 files |
| Phase 21 P35 | 12min | 3 tasks | 1 files |
| Phase 21 P36 | 7min | 2 tasks | 1 files |
| Phase 22 P02 | 55min | 3 tasks | 1 files |
| Phase 22 P01 | 1h 10m | 2 tasks | 11 files |
| Phase 22 P03 | 8min | 2 tasks | 6 files |
| Phase 22 P04 | 6h (실행 12min) | 3 tasks | 10 files |
| Phase 22 P06 | 2 min | 2 tasks | 2 files |
| Phase 22 P05 | 2h 21m (실행 약 15min) | 3 tasks | 3 files |
| Phase 22 P07 | 1h 21m | 3 tasks | 7 files |
| Phase 22 P08 | 2h 16m | 2 tasks | 2 files |
| Phase 22 P09 | 7min | 2 tasks | 0 files |
| Phase 22 P10 | 9min | 3 tasks | 3 files |
| Phase 24 P01 | 21 min | 2 tasks | 39 files |
| Phase 24 P03 | 16min | 3 tasks | 24 files |
| Phase 24 P04 | 36min | 3 tasks | 17 files |
| Phase 24 P05 | 9min | 2 tasks | 9 files |
| Phase 24 P06 | 23min | 3 tasks | 11 files |
| Phase 24 P07 | 17min | 2 tasks | 8 files |
| Phase 24 P08 | 23min | 2 tasks | 5 files |
| Phase 24 P02 | 343min(대부분 사용자 대기) | 2 tasks | 1 files |
| Phase 24 P09 | 45min | 3 tasks | 1 files |
| Phase 24 P10 | 11min | 3 tasks | 9 files |
| Phase 24 P11 | 6min | 2 tasks | 2 files |
| Phase 24 P12 | 13 min | 2 tasks | 5 files |
| Phase 24 P13 | 12min | 3 tasks | 15 files |
| Phase 24 P14 | 11min | 2 tasks | 4 files |
| Phase 24 P15 | 8min | 2 tasks | 6 files |
| Phase 24 P17 | 8 min | 2 tasks | 6 files |
| Phase 24 P18 | 8min | 2 tasks | 5 files |
| Phase 24 P19 | 7min | 2 tasks | 3 files |
| Phase 24 P20 | 6min | 2 tasks | 3 files |
| Phase 24 P21 | 12min | 2 tasks | 4 files |
| Phase 24 P22 | 11 min | 3 tasks | 9 files |
| Phase 24 P23 | 9min | 2 tasks | 6 files |
| Phase 24 P24 | 2h52m | 3 tasks | 1 files |
| Phase 25 P01 | 26min | 2 tasks | 48 files |
| Phase 25 P02 | 10 min | 2 tasks | 13 files |
| Phase 25 P03 | 11min | 3 tasks | 12 files |
| Phase 25 P04 | 9min | 2 tasks | 4 files |
| Phase 25 P05 | 6min | 2 tasks | 7 files |
| Phase 25 P06 | 21min | 3 tasks | 15 files |
| Phase 25 P07 | 44 min | 3 tasks | 21 files |
| Phase 25 P08 | 19min | 3 tasks | 12 files |
| Phase 25 P09 | 17min | 3 tasks | 5 files |
| Phase 25 P10 | 26 min | 3 tasks | 15 files |
| Phase 25 P11 | 확인만 | 3 tasks | 1 files |
| Phase 25 P12 | 56min | 3 tasks | 1 files |
| Phase 25 P13 | 37 min | 3 tasks | 4 files |
| Phase 26 P01 | 4min | 1 tasks | 12 files |
| Phase 26 P02 | 8min | 2 tasks | 4 files |
| Phase 26 P03 | 11min | 1 tasks | 4 files |
| Phase 26 P04 | 5min | 2 tasks | 5 files |
| Phase 26 P05 | 14min | 1 tasks | 4 files |
| Phase 26 P06 | 6min | 2 tasks | 2 files |
| Phase 26 P07 | 7min | 2 tasks | 3 files |
| Phase 26 P08 | 11min | 2 tasks | 7 files |
| Phase 26 P09 | 5min | 2 tasks | 6 files |
| Phase 26 P10 | 13min | 2 tasks | 5 files |
| Phase 26 P11 | 10min | 2 tasks | 9 files |
| Phase 26 P12 | 10min | 3 tasks | 10 files |
| Phase 26 P13 | 5min | 3 tasks | 1 files |
| Phase 26 P14 | 14min | 2 tasks | 9 files |

## Accumulated Context

relay 운영 지식(Phase 17 이 남긴 재사용 가능한 사실): [docs/relay-operations.md](../docs/relay-operations.md)

### Roadmap Evolution

- Phase 26 added (2026-09-30): 시세 전용 공유 연결 — relay 종목 단위 팬아웃. 배경: 유저 5~6명이 거의 같은 종목(상따)을 구독하는데 relay 가 유저별 DMA 세션마다 따로 구독해 gh-trade→relay VPN 구간에 시세가 N 벌 흐르고, 주문 세션 송신 큐에서 통보가 시세 뒤에 줄을 섬(Fanout 은 conn 단위 복사 · 퍼블리셔가 주문 NIC IRQ 와 코어 3 공유). 결정: 사람 계정 공유 대신 **관찰자 로그인에 quote 역할** 추가(기존 공유 비밀 재사용 · 주문 권한 0), relay 는 시세 관찰자 세션 1개 + 참조계수 `isin|ex` 전역화 + 캐시 유저 간 공유 + PRICE 필터 relay 이관. WinForms 직결 유지. gh-trade 서버 변경은 gh-trade 저장소 별도 phase. 직전 확인: users.toml 에 relay 전용 계정 없음, 기존 relay 전용 연결은 저널 관찰자뿐(시세 구독은 관문에서 차단 Gateway.cpp:856).
- Phase 25 added (2026-09-29): 주문로그·잔량진행률 — 기획서(MJ 9/27) 반영. 로그 7종 = gh-trade 서버 StrategyEvent(관찰자 저널 80 말미 append·별도 seq·같은 epoch, 필드 v0.1 동결) → relay 두 스트림 커서·`dma_strategy_events`·`journal.events` 푸시 → 오늘 주문 행 펼침 + 작업대 「주문로그」 탭 신설(전략 로그 분리 유지). 진행률 B안(대기 행 아래 2줄째·모바일 r3, 웹·WinForms 공통) · `QueueProgress` 브로드캐스트. 사용자 확정: 풀안 · 용어 기존(선매수/추가매수/후매수). 착수 순서 gh-trade fbs 커밋 → sync-relay-schema.sh → gh-radar 생성물 커밋, 배포 서버→relay→webapp. 설계 근거 9개 파일은 `.planning/phases/25-order-log-progress/reference/`. 연락처 gh-trade 세션 `gh-trade-6d`.
- Phase 24 added (2026-09-27, 브랜치 `gsd/phase-24-limitchaser-buy3`): gh-trade 상따 매수주문 3종 분리(선매수·추가매수·후매수) relay·webapp 반영 — `SetLimitChaser` 말미 17필드(`buy3_schema=1`) · `buy_watch_side`·MsgType 38 폐기 · 매수 LED 2단계 · 상따 설정 3그룹(WinForms 상따 창 참고, 목업 게이트 선행). gh-trade 서버(24-11)·WinForms 배포 뒤에만 배포. 인계 원문은 gh-trade 세션 `gh-trade-38`.
- Phase 22 added (2026-09-26): GH Trade 테스트 배포 — iOS TestFlight · Android Play 내부 테스트. Phase 21 앱을 타인 기기에 설치 가능하게(App Store Connect·TestFlight / 릴리스 키스토어·AAB·Play 내부 트랙 / 릴리스 빌드 Google 로그인 유지 / 버전 규칙·반복 절차 / 스토어 최소 자료 / verify-prod 게이트). 정식 출시·심사 대응 범위 밖. discuss 선결 5건(계정 현황 · 테스터 범위 · 트레이딩 접근 제한 · OAuth 테스터 허용 · 빌드 실행 주체).
- Phase 21 added (2026-09-25): GH Trade 모바일 앱 (Capacitor) — Remote-URL 셸 · 네이티브 탭바 · pull-to-refresh · 네이티브 Google 로그인 · 브랜드명 GH Trade. 결정 4건 사용자 확정(네이티브 탭바 / signInWithIdToken / refresh 훅→reload / mobile/ 패키지).
- Phase 20 added (2026-09-25, 브랜치 theme/toss-b 전용): 호가주문 토스식 재구성 — sketch 002 채택안

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
- Phase 22 edited: edited fields: title, goal, 범위 안·밖, plans — Android 를 Play 내부 테스트에서 Firebase App Distribution APK 로 재범위(Play 개발자 인증 미완료), Play 배포는 Phase 23 으로 분리
- Phase 23 added: GH Trade Play 스토어 내부 테스트 배포 (개발자 인증 후) — 옛 22-05~22-07 플랜을 from-phase-22/ 로 이관

### Decisions

전체 결정 로그: [DECISIONS-ARCHIVE.md](./DECISIONS-ARCHIVE.md)

- [Phase 20]: D-24 — 상단 상태줄(OrderbookStatusBar) 1줄 압축을 안 C 로 이번 phase 에서 구현(검증 갭 12/13 → 목업 A~D 비교 후 사용자 선택). 잘림 0 유지, 폭이 모자라면 2줄
- [Phase 20]: D-02a — 감시대상 행은 ≥700 에서도 라벨 숨김 + 행 전체 폭 토글(830 넘침 해소, 목업 비교 후 사용자 선택 D). 버튼 26px·13/600 유지
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
- [Phase 19]: 19-07: 관찰자 재접속 since_seq 기본값은 lastReceivedSeq ?? 0 — 옛 epoch seq 를 새 epoch 와 짝지으면 앞 구간이 조용히 누락된다
- [Phase 19]: 19-07: journal 파생 상태에서 rejected·disabled 는 db_error 로 덮지 않는다 — rejected 는 healthz 즉시 503
- [Phase 19]: 19-07: 이후 relay 이미지는 production 에서 DMA_OBSERVER_SECRET 없으면 기동 실패 — 19-11 시크릿·env 주입 전 relay 배포 금지
- [Phase 19]: 19-08: 오늘 주문 카드 B′ — 묶음은 relay 계좌 목록 순, 통보 묶기는 묶음마다(계좌 경계 불가), 출처 칩은 origin null 이면 생략, OriginTag 는 components/trading/origin-tag.tsx 공용(account-panel 은 상따/VI 만)
- [Phase 19]: 19-09: G1 계약(gh-trade 8285a265)은 인계서 §2 와 의미 1:1 — 도메인 타입 무변경, seq 류 ulong 은 파서 경계 toNum
- [Phase 19]: 19-09: 관찰자 코덱은 76·54 를 ignore(로그인 전 브로드캐스트) — 로그인 실패는 반드시 79 success=false 라는 gh-trade 합의
- [Phase 19]: 19-09: resync ∧ oldestSeq 0 → 로그인 직후 live(게이트웨이는 head+1 부터만 보낸다) — 기록기 갭 규칙 무변경
- [Phase 19]: 19-09: 저널 배치 파서는 레코드를 버리지 않는다(형식 이상은 warn) · 상한 절단 시 caughtUp 거짓
- [Phase 19]: 19-10: seq 역행(같은 epoch · 로그인 head < 마지막 수신 seq)은 resync 무관 lastReceivedSeq 유지 · error 로그 · healthz journal.seqRegressions 표시(503 아님) — gh-trade Phase 23 합의
- [Phase 19]: 19-10: 관찰자 비밀 순환·전환 순서는 게이트웨이 재시작 → relay 재배포(마지막) — relay 는 로그인 거부 뒤 재시작 전 재시도하지 않는다
- [Phase 19]: 19-11: 20:00 KST 조건을 추석 연휴 휴장으로 사용자 면제 — DB push 15:59~16:04 · 게이트웨이 재기동 16:24:45 KST
- [Phase 19]: 19-11: 원격 journal 함수는 7개(플랜 문구 6은 셈 오류) — 전부 service_role 전용 · 덤프 GRANT ALL 표기는 Supabase default privileges
- [Phase 19]: 19-12: 20:00 조건 사용자 면제(추석 휴장) — relay 43d4d0c 16:32 KST 배포
- [Phase 19]: 19-12: 매핑 행 수 대조는 게이트웨이 accounts=3 = dma_account_access 3행 일치로 갈음
- [Phase 19]: 19-12: 알림 정책 documentation 10834>10240 바이트 초과는 후속 과제(다음 relay 배포마다 exit 1 재발)
- [Phase 20]: 20-01: 필드 확정 cfg 기준값 = formFromServer(server, formRef) + 바꾼 필드 1개 · 성공은 에코 값 비교로만(답 신호만으로는 거부) · 대기 건은 성공 뒤 serverAnswerSeq 변화 렌더에서만 꺼냄
- [Phase 20]: 20-01: 무장 판정을 canArmOf/armBlockOf 모듈 함수로 단일화 — handleSubmit 과 useLcFieldCommit 이 공유 · 끄는 방향 게이트는 무장 가드 면제(T-16-44)
- [Phase 20]: 20-02: 호가 단위 표는 packages/shared/src/krxTick.ts 한 곳 — limitUpPrice·deriveTickSize 폴백·키패드가 모두 krxTickSize 호출 (D-15)
- [Phase 20]: 20-02 폭 스파이크: 백스톱 폰(344) L2 · 700 L2 · 992 L0 · 830 은 감시대상 행이 L2 로도 −3.4px (권고 ≥700 토글 좌우 10→8 + L2) · 20-06 ≥700 버튼 17px 한 줄 확인
- [Phase 20]: [20-03] 편집 방식은 useEditMode()(주 포인터 (pointer: coarse) 구독 · 서버 렌더 inline) 하나가 가른다 — 터치면 행 탭이 키패드 시트(NumberPadSheet, 폼당 1개 · body 포털 · min(440, 100vw−20) 가운데)를 열고 전송은 훅 commit 하나. 시트는 successSeq(에코 값 일치)로만 닫힌다
- [Phase 20]: [20-03] 시트 접근성·겹침 규율 — 시트 안 Enter 는 버튼 포커스면 그 버튼에 맡기고 · 컨테이너 링은 focus-visible 변수로 컨테이너에만 걷고(seamless 는 자식 버튼 링까지 지움) · 시트가 편집 중인 행은 실패 말풍선을 꺼 오버레이 위 겹침을 막는다 · aria-modal 은 명시(Radix 미부여)
- [Phase 20]: 20-04 폭 백스톱 — 폰 밴드(<700)만 L2(행 좌우 0 · 라벨–값 간격 4) · ≥700 은 D-02a 로 L0 충분해 원래 값(4 · 6). 공유 ROW_BOX 한 줄
- [Phase 20]: 20-04 가격 섹션도 statusKey 를 가진다 — 매수가격·매도가격 시트의 「감시 중」 안내는 매수주문·매도주문 상태를 따른다
- [Phase 20]: 20-04 토글 무응답 실패는 서버 값으로 되돌린다 — 미등록 카드의 「켰다→무응답→끔(D)」 흐름은 사라지고 두 번째 누름은 재시도(strategy-card-flow ㉑ 재정의)
- [Phase 20]: 20-05: 이미 저장한 버퍼(반영 중·저장 뒤 미수정)에서 Tab 은 재전송 없이 이동만 — 재시도는 Enter 뿐(T-16-10)
- [Phase 20]: 20-05: 위반 값 blur = 취소(A6)는 무장 불가 값에도 적용 · 편집 끝난 값 행 실패 말풍선은 인라인 문구로 통일(옛 rowFailureTextOf 제거)
- [Phase 20]: 20-05: D-14b 한 번 클릭 = onPointerDownCapture 로 nextEditRef 기록 → endEdit 이어받기 · 반영 중/비활성 행은 기록하지 않음 · Tab 이동은 대상이 반영 중이어도 연다
- [Phase 20]: 20-06: 수동주문 D-14c 클릭 전체 선택은 이번 누름으로 들어온 경우에만 — 이미 편집 중인 칸은 캐럿 이동 허용(중간 수정 가능)
- [Phase 20]: 20-06: 종목(isin) 전환 시 열린 수동주문 시트를 닫는다 — 기존 종목 전환 리셋 이펙트는 무변경, 별도 이펙트(T-20-05)
- [Phase 20]: 20-06: ≥700 매수/매도 17px 적용(20-02 스파이크 206px 버튼에 예약매수 한 줄) · <700 은 13px 줄바꿈 유지 · 결과 배너는 거부만 --destructive
- [Phase 20]: 20-07: 매수·매도 값 버튼 이름 중복은 이름(UI-SPEC 계약) 대신 aria-describedby = 그룹 제목으로 가른다
- [Phase 20]: 20-07: overflow.ts 는 빈 절대배치 가상요소(히트 영역)만으로 넘친 요소를 제외한다 — 실제 글자는 Range 로 계속 판정
- [Phase 20]: 20-07: P20-3 실측 폰(344) 기준선 행 여유 +0.4px — 들어가므로 백스톱 추가 없음(글자 불변) · 가장 먼저 깨질 행으로 P20-3 이 감시
- [Phase 20]: D-15a(WR-05, 2026-09-25): 호가 단위 잠금은 종목 분류가 가른다 — 마스터 stocks.security_group(ETF·ETN·ELW = /search 와 같은 블랙리스트)을 카드 본문이 읽어 두 폼에 같은 값으로 전달. 주식 = 잠금 · ETP·분류 불명 = 경고만 · 상한가 초과는 늘 잠금 · 조회 중은 잠금
- [Phase 20]: D-04a(WR-07, 2026-09-25): 서버 buyOrderAmount 0(레거시) 전략은 주문금액 행 「—」 + 금액 외 확정을 「주문금액을 먼저 입력해 주세요」로 막음 · 끄기는 늘 허용(금액·수량은 서버 값 그대로 전송) · 0 아닌 금액 에코 뒤 정상
- [Phase 20]: 20-08: 폰 계좌 칩은 이름이 계좌를 유일하게 가리킬 때만 이름만 — 이름이 비거나 중복이면 「번호 · 이름」(오발주 가드 · T-20-18)
- [Phase 20]: 20-08: 폰 투명 오버레이 select 는 -indent-[9999px](옵션 0) — scrollOverflowing 판정을 바꾸지 않고 투명 글자 거짓 넘침 제거
- [Phase 21]: 21-01: 번들 ID com.ghtrade.app 확정 (Apple 팀 954QPCS3F5) · Capacitor 8.5.2 / capgo social-login 8.5.11 승인 · iOS App 폴더는 동기화 그룹 아님 → 새 Swift 파일 pbxproj 수동 등록 · ATS 예외 불필요
- [Phase 21]: 21-02: Android 셸 = Kotlin MainActivity : BridgeActivity + BridgeWebViewClient 상속(bridge.setWebViewClient) + GhTradeBridge @JavascriptInterface(호스트·타입 화이트리스트) · KGP 2.2.21 · jvmTarget 21 (1.9.22 폴백 불필요)
- [Phase 21]: 21-04: native refresh 레지스트리는 등록 훅 전부 호출(Promise.allSettled) · 등록 0 이면 location.reload — 종목상세 섹션별 재조회(D-18)
- [Phase 21]: 21-04: window.__ghTrade.navigate 는 / 시작 · // 금지 + 역슬래시·제어문자 거부(URL 파서가 /\evil 을 //evil 로 읽음 — T-21-16 강화)
- [Phase 21]: 21-04: 오버레이 신호는 Content 안 NativeOverlayMarker 마운트 수명 참조계수(0↔1 전이만 송신) — Sheet·Dialog·NumberPadSheet 3곳, 새 오버레이 원천도 같은 한 줄
- [Phase 21]: 21-03: Google OAuth 공개 클라이언트 ID(web·ios·android, GCP gh-radar 1023658565518)와 iOS URL scheme 을 google-client-ids.ts 리터럴 상수로 — Vercel env 미사용(개행 오염 이력), 형식·역순 테스트로 잠금
- [Phase 21]: 21-03: Supabase Google Client IDs = web,ios,android(웹 먼저) · Skip nonce checks off 유지 · 동의 화면 이름 gh-radar 유지 · release SHA-1 미등록(Deferred)
- [Phase 21]: 21-05: 앱 셸 분기 — lg: 와 경합하는 aside·햄버거는 레이어 밖 CSS(html.native-app [data-slot]), FAB·AI 버튼은 native: 변형. 「AI 분석」은 히어로 첫 줄 오른쪽 끝(ml-auto)
- [Phase 21]: 21-07: probeNow 는 복귀 경로 onResume(true) 재사용(relay 무변경) · 종목상세 당겨서 새로고침은 GET 캐시 재조회만 등록(POST refresh 0)
- [Phase 21]: 21-10: iOS 오프라인 판정 = url 스킴+호스트 ≠ server.url (dev localhost 겹침 방지)
- [Phase 21]: 21-10: 웹 ready 수신 시 overlayOpen 초기화 — 전체 로드 시 오버레이 고착 방지(T-21-18)
- [Phase 21]: 21-14: 어댑티브 전경은 @capacitor/assets inset 16.7% 때문에 0.88배 시 가시 원의 ~57% — 21-16 UAT 에서 작으면 scale(1) 로 올려도 안전
- [Phase 21]: 21-06: 안전영역은 --app-safe-* 네 변수로만 읽고(SystemBars 주입 우선·env 폴백), 앱 하단 고정 바는 --native-tabbar-offset(max(safe−14,14)+70+8) 위, 본문 108
- [Phase 21]: 21-06: 헤더 box-content 로 투명 1px 테두리 제거(높이 56 유지) · z-30(종목상세 탭 바 덮임 방지)
- [Phase 21]: 21-08: /search 검색 결과는 ⌘K 와 같은 useDebouncedSearch 경로만 재사용(새 무필터 경로 없음) · 본문면 위 입력은 라이트 --card/다크 --muted(라이트 --muted=--surface 소실)
- [Phase 21]: 21-11: iOS 테마 변경은 applyTheme 단일 경로(currentTheme private(set)) — 웹 theme 은 dark/light 만, OS 다크모드 미추종, UserDefaults gh-trade.theme 저장
- [Phase 21]: 21-11: iOS 오프라인 폴백은 Capacitor 델리게이트 전달형 프록시 + 네트워크 오류 6코드만 · 폴백 페이지 복귀는 /icon.svg no-cors 도달 탐침 + safeTarget 허용 출처
- [Phase 21]: 21-12: Android 탭바 인셋 리스너는 탭바에만, IME 는 루트 창 인셋 읽기로 감지(SystemBars DecorView 리스너 보존)
- [Phase 21]: 21-12: Android 탭 아이콘은 스케치 004 채택안 심볼을 벡터로 옮김(weekly-wine person_fill 은 tint 불가)
- [Phase 21]: 21-09: D-21 브랜드는 노출 문자열만 GH Trade — gh-radar: 저장 키·[gh-radar] 로그 접두·@gh-radar/* 패키지·GCP 프로젝트명 유지
- [Phase 21]: 21-09: /me 계정 카드 A 는 DMA 게이트 화면에도 표시 · 카드 아래 16 = gap 12 + mb-1 · 테마 아이콘은 전환될 테마(다크=Sun)
- [Phase 21]: 21-13: Android 오프라인 폴백은 assets public/index.html 을 https://localhost/index.html?to=…&theme=… 주소로 loadDataWithBaseURL (server.url 이면 Capacitor 가 localhost 를 네트워크로 프록시)
- [Phase 21]: 21-13: Android 테마는 applyTheme 단일 경로 · load() 끝 post 로 SystemBars DEFAULT 스타일 뒤 재적용
- [Phase 21]: 21-13: 뒤로가기 홈 이동 뒤 clearHistory 1회 · 로그인/인증 화면은 종료 · 웹 back() false 면 네이티브 순서로
- [Phase 21]: 21-15: 네이티브 Google 로그인은 webapp 의존성 없이 window.Capacitor.nativePromise('SocialLogin') 래퍼 — 플러그인엔 SHA-256(raw nonce), Supabase signInWithIdToken 엔 raw · forcePrompt true · 성공 시 location.replace(safeNext) · Android MainActivity 무변경(online·scopes 없음) · iOS 는 Info.plist URL scheme 만
- [Phase 21]: 21-17: Android Custom Tabs 는 androidx.browser 1.9.0 앱 모듈 선언(Task 1 선택 a) — capgo 가 이미 APK 에 싣는 좌표라 런타임 의존 집합 무변경
- [Phase 21]: 21-17: 사이트 밖 판정 ExternalLinks.opensInAppBrowser 는 앱 호스트 소문자 정확 일치만 같은 호스트(접미사 위장·www 는 외부) · 정본 26케이스 표를 iOS 21-22 가 복제
- [Phase 21]: 21-18: 저장값 없을 때 기본 테마 = 다크, 웹·iOS·Android·오프라인 폴백 공통(G-21-N1 · D-23a). 저장값 읽기 경로 무변경 — 기존 사용자 선택 우선, 기본값은 저장하지 않음
- [Phase 21]: 21-19: 테마 버튼 규칙(D-08b) 단일 정의 — theme-toggle.tsx 의 THEME_SWITCH_LABEL(키=목적지)·ThemeSwitchIcon 을 사이드바 토글·계정 카드가 공유, 다크=Sun·「라이트 모드로 전환」 / 라이트=Moon·「다크 모드로 전환」
- [Phase 21]: 21-20: D-27b 탭바 = 스케치 007 C(라벨 없음 · 캡슐 56×36 16% · 테두리 없음 · ultra-thin 유리 + glass 틴트 · 그림자 두 겹 · 높이 60 · radius 30 · 페이드 86) — 네이티브 60 ↔ 웹 offset gap+60+8 · 본문 98 동시 변경
- [Phase 21]: 21-20: 탭바 대비 다크 5.78/3.51 · 라이트 4.62/3.08 (≥3.0) — glassAlpha 조정 불필요
- [Phase 21]: 21-20: CONTEXT 에 D-27b · D-23a · D-08b · D-28 기록 — 이전 결정 원문 보존 + 대체 포인터
- [Phase 21]: 21-21: Android 유리 = glass RGB × 알파 240(≈94% 불투명, A10) · elevation 12 · 대비 다크 5.26/3.23 · 라이트 4.62/3.08 (모두 ≥3.0)
- [Phase 21]: 21-22: iOS 같은 호스트 새 창 요청(target=_blank · window.open)은 새 WKWebView 없이 같은 WebView 에 load — Android 와 일치 · opener 없음
- [Phase 21]: 21-22: NavigationDelegateProxy 는 3인자 decidePolicyFor 만 구현 · uiDelegate 도 프록시에 세우되 originalUI 를 교체 전에 잡는다(UI 콜백 Capacitor 전달 유지)
- [Phase 21]: 21-23: UAT 프록시 업스트림은 gcloud run services describe 조회값(https://gh-radar-server-fnbhvevuva-du.a.run.app) — env 파일 미열람, scratchpad 스크립트는 UPSTREAM 필수
- [Phase 21]: [21-24] UAT 재개 신호 push-then-recheck — Claude 가 Phase 21 커밋 30개 push(bac3746..5f91e1a) · 운영 CSS 98 확인 · 세 기기 운영 빌드 재설치, UAT 항목 1~5 는 실서버에서 /gsd-verify-work 21 로 재확인
- [Phase 21]: 21-25: 스케치 008 채택 ①B /me 전략 로그 = 전략 현황 카드 안 「현황 | 로그」(기본 현황) · ②A 넓은 폭 「트레이딩」 = 히어로 첫 줄 끝 32 알약 · ③A 카드 주문유형 = 주문금액 위 44px 행 (D-25a · D-30 · D-31)
- [Phase 21]: 21-25: R3-2 잃는 동작 범위 밖 동의 · R3-8 옛 뉴스/토론 URL 리다이렉트 동의(D-29) · WR-03 = a androidx.webkit 1.14.0 앱 모듈 선언 + WebMessageListener(메인 프레임·허용 출처)
- [Phase 21]: 21-25: D-32 R3-11 = 탭 루트 스크롤 복원 + 스켈레톤 없는 재방문(query-cache) · keep-alive/탭별 웹뷰 기각
- [Phase 21]: 21-26: 만원 키패드 칩 = 천만(+1,000)·오천만(+5,000)·1억(+10,000)·지우기(만원 단위 더하기 · 9자리 초과는 버퍼 불변 계약 유지)
- [Phase 21]: 21-26: 아이콘 닫기 버튼 = lucide XIcon + size-8 상자 + after:-inset-1.5 히트 44(카드 ✕ · 종목정보 팝업 ✕) · 팝업 ≥700 높이 min(720px,100dvh−48px−안전영역) 고정 · 폰 safe-area 패딩
- [Phase 21]: 21-27 WR-04: 오버레이 계수를 back 대상/탭바 숨김 둘로 나누지 않는다 — PopoverContent 도 같은 NativeOverlayMarker
- [Phase 21]: 21-27 IN-06: App Router 가 클라 내비(경로·쿼리)마다 viewport 메타를 새로 만들어 #17171c 로 되돌린다(실측) — ThemeColorSync 는 head MutationObserver 로 재적용
- [Phase 21]: 21-27 WR-01: 같은 출처 경로 판정은 lib/safe-path.ts isSafeInternalPath 하나 — login·/auth/callback·navigate 공용
- [Phase 21]: 21-28: iOS 탭바 보임 분기는 모델 값이 이미 보임이면 반환 — 대기 해제 280ms 페이드가 applyPath 의 두 번째 호출에 걷히지 않게
- [Phase 21]: 21-28: iOS 브리지 출처 = WKSecurityOrigin 스킴·호스트·포트 정확 일치(기본 포트 80/443 → 0 정규화)
- [Phase 21]: 21-28: iOS 콜드 스타트도 setupTabBar 에서 beginDocumentLoad() 로 1.5초 상한 예약(고착 방지)
- [Phase 21]: 21-29: Android 탭바 IME 숨김 = WindowInsetsAnimation onPrepare 즉시 · (IME/2).coerceIn(80,200)ms · 재표시 90ms · 문서 로드 대기 onPageStarted → 첫 route/1.5초 → 280ms 감속
- [Phase 21]: 21-29: Android 브리지 = androidx.webkit WebMessageListener(서버 출처 · 메인 프레임만 · 기본 포트 정규화) · 미지원 폴백 JS 인터페이스 + 출처 전체 비교 · allowBackup=false + dataExtractionRules 전 도메인 제외
- [Phase 21]: 21-29: IN-03 오프라인 폴백 뒤로가기 루프 에뮬레이터 재현 → navigateBack isOfflinePage -> finish()
- [Phase 21]: 21-30: 탭 안 전체목록의 「우리가 쌓은 기록」 판정은 history.state 표식({ghNewsView: code}) — back() = 표식이면 history.back, 아니면 replaceState ?tab=news
- [Phase 21]: 21-30: 활성 뉴스토론 탭 재클릭 = 요약은 TabsTrigger onClick 이 handleValueChange 로 넘긴다 — Radix 는 활성 탭 재클릭에 onValueChange 를 부르지 않는다
- [Phase 21]: 21-31 D-32: 탭 루트 스크롤 주체는 창(window) — useTabRootScrollMemory 를 AppShell 에서 호출(루트별 scrollY · location.pathname 확인 기록 · ?파라미터 착지 제외 · 30 프레임 상한). 재방문 시드는 기존 query-cache 키 search:hub · chat:conversations:{필터} · me:today-orders:{KST 날짜}
- [Phase 21]: 21-32: D-25a ① 채택안 B 구현 — /me 전략 현황 카드 「현황 | 로그」 알약 세그먼트(기본 현황) · 로그 = 앱 전역 StrategyLogFeedProvider(relay 파생 · 작업대와 같은 순수 함수 · 사용자 경계에서 비움 · 200줄) · 로그 높이 상한 320
- [Phase 21]: 21-32: 앱 /trading 공용 패널·spacer 는 html.native-app display:none · 카드 더티 바 탭바 비킴은 숨은 프로브 computed bottom(82px)로 — 더티 바는 Phase 20 D-04 이후 렌더되지 않아 잠재 결함 수정(식=단위 · 프로브=e2e)
- [Phase 21]: 21-33: /trading?code= 착지 = 작업대 effect 하나(layoutRestored 뒤 · handledCodeRef · isPickable 재사용 · ensureIsinCard(reveal) · code 만 replaceState 제거 · 송신 0) — 콜백은 ref 로 읽어 계좌 도착이 fetch 를 끊지 않게
- [Phase 21]: 21-33: 카드 수동주문 주문유형 = 스케치 008 ③ A 44px 행(주문금액 위) · 선택 불가면 행 아래 ⓘ 캡션 · affordanceOf 그대로 — orderType 은 variant 무관 orderTypeState
- [Phase 21]: 21-33: 종목정보 팝업 newsView 로컬 상태 — 요약 hidden 마운트 유지 · Esc/Android 뒤로가기 onEscapeKeyDown 두 단계 · 탭 이동·닫힘 = 요약 · /trading URL 불변
- [Phase 21]: 종목상세 「주문하기」 → 「트레이딩」 링크 /trading?code= (폰 하단 바 data-slot 유지 + 넓은 폭 히어로 32 알약 · 스케치 008 ② A · isPickable 게이트) (21-34 · D-30)
- [Phase 21]: 종목상세 3탭 — 옛 ?tab=orderbook 은 매매 가능 router.replace(/trading?code=) · 불가 replaceState(?tab=chart). 라우터는 페이지 밖 딥링크에만, 탭 전환은 pushState (21-34 · D-31)
- [Phase 21]: orderbook.spec 고유 검증 5묶음을 trading-workbench.spec 「G-21-R3-10 이전 — 」로 이관 후 삭제 · 카드 시간외종가 참고 종가 = quote.kc (21-34)
- [Phase 21]: 21-35: 백엔드 무변경 게이트는 배포로 충족 — rcc 2건(e9e4c786·89f5680d)은 relay:2fe94209 선배포에 포함, 2fe94209..HEAD 백엔드 diff 0. 21-36 T-21-99 재확인도 이 기준으로 판정
- [Phase 21]: 21-35: Task 3 dev UAT 환경은 사용자 결정으로 생략 — 사람 확인은 21-36 push 뒤 실서버(push-then-recheck), 재확인 표 A1~A10 · B1~B8
- [Phase 21]: 21-35: 21-REVIEW-R2 1차 13건 모두 수정 — WR-03 구형 WebView 폴백(addJavascriptInterface) 잔여 위험은 iframe 부재로 수용
- [Phase 21]: 21-36: push-then-recheck — 백엔드 게이트는 2fe94209..HEAD 백엔드 diff 0 · origin/master..HEAD 72 커밋 = 알려진 집합 → push 7fc86b9f..8e0fe57c · 운영 CSS 반영 13:03:31Z · 세 기기 운영 빌드 삭제 후 새 설치
- [Phase 21]: 21-36: iOS 시뮬레이터는 앱 삭제 뒤에도 기기 전역 쿠키(data/Library/Cookies)로 로그인 유지 — B2 첫 로그인은 앱 안 로그아웃 뒤 확인
- [Phase 21]: 완료(2026-09-26) — UAT 4차 실서버 30/30 pass · 재검증 21-VERIFICATION-R2.md passed 15/15(1차 VERIFICATION 은 frontmatter 만 passed·fingerprint 합집합 갱신, 본문 보존). secure-phase · validate-phase(Nyquist) · ui-review 는 사용자 결정으로 미실행. 스토어/TestFlight·Play 테스트 배포는 별도 신규 phase 로
- [Phase 22]: 22-02: 개인정보처리방침 승인(2026-09-27) — 운영자·책임자 「GH Trade 운영자」, 연락처 alex@jx1.io, 시행일은 22-07 push 일(자리표시 TBD-22-07-push)
- [Phase 22]: 22-02: 국외 이전 표에서 Supabase(서울) 제외, Vercel·Google Cloud 로그는 보수적 고지, 연락처 열 추가(오케스트레이터 결정)
- [Phase 22]: 22-01: TestFlight 첫 업로드 빌드 1.0 (202609270252) — sigh 가 com.ghtrade.app AppStore 프로파일 생성, archive 는 Xcode 계정 인증(-authenticationKey* 불필요)
- [Phase 22]: 22-01: ASC 앱 이름 GH Trade · 사용자 초대 가능 → D-02 내부 테스터 경로 유지
- [Phase 22]: 22-03: /privacy 시행일은 자리표시 「2026년 ○월 ○일」 그대로 — 22-07 이 push 날짜로 초안·page.tsx·page.test.tsx 를 함께 채운다
- [Phase 22]: 22-03: 공개 경로 판정은 webapp/src/lib/supabase/public-path.ts 의 isPublicPath 한 곳 — PUBLIC_PREFIXES [/login, /auth, /privacy] · 경계 비교
- [Phase 22]: 22-04: 업로드 인증서 SHA-1 2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D (공개 — 22-06 Android OAuth 클라이언트용) · 백업 Secret Manager gh-radar-ghtrade-upload-keystore(-password) · asc-api-key (deployer SA 인증)
- [Phase 22]: 22-04: 첫 AAB versionCode 609270905 · mobile/android/app/build/outputs/bundle/release/app-release.aab · AAB CHECK OK · lintVital 수정 없음 — 22-05 콘솔 첫 업로드 대상
- [Phase 22]: 22-06: 22-01 TestFlight 빌드 202609270252 = VALID (2026-09-27 11:50 KST · release-ios.sh latest 한 줄 계약)
- [Phase 22]: 22-05: D-17 Firebase 를 기존 gh-radar 에 추가(사용자 결정) — FCM 푸시 가능성으로 장기 자산 · 앱 ID 1:1023658565518:android:3b06f0472060afa97e4edf · 그룹 ghtrade-testers(본인 1명)
- [Phase 22]: 22-05: 업로드 SA gh-trade-appdistro 역할 roles/firebaseappdistro.admin 정확히 하나 · 키 600 · Secret Manager 백업 없음(분실 시 재발급)
- [Phase 22]: 22-05: OAuth 동의 화면 「테스트」 모드 — 테스터 Google 계정마다 테스트 사용자 추가 필요(22-08 인계) · Supabase 가입 제한 없음(D-05)
- [Phase 22]: 22-07: 첫 Firebase App Distribution 릴리스 versionCode 609271311(2026-09-27 13:11 KST · 그룹 ghtrade-testers) — APK CHECK OK sha1=2fe3ba78… · 전용 SA 인증(ADC 0건) · firebase_latest 일치 · 에뮬레이터 사이드로드 OK 후 release 판 제거
- [Phase 22]: 22-07: native:release:android 기본 경로 = Firebase APK(release-android.sh 기본 firebase) · Play 경로는 native:release:android:play(beta)로 Phase 23 보존 · 22-09 두 번째 릴리스는 versionCode > 609271311
- [Phase 22]: 22-08: 본인 Android 실기(Firebase 609271311) 로그인 통과 뒤 테스터 편입 — Firebase 3 · ASC 신규 초대 1(Marketing · GH Trade 한정) · OAuth 테스트 사용자 3 · dma_credentials 0
- [Phase 22]: 22-08: 디버그 세션(798f911f 스크롤·상태바 띠 웹 수정)이 master 를 push 해 22-10 push 게이트 선점 — /privacy 시행일 자리표시 운영 노출 중, 22-10 이 시행일(기본 2026-09-27 KST) 채워 재배포
- [Phase 22]: 22-09: 두 번째 릴리스 iOS 202609270252→202609271538 (TestFlight VALID 약 2분) · Android 609271311→609271542 (Firebase 그룹 배포 · 전용 SA 인증 · ADC 0)
- [Phase 22]: 22-09: 전 자동 게이트 6개 green · 릴리스 뒤 mobile/ 무변경 · PROD CONFIG OK · push 안 함(22-10)
- [Phase 22]: 22-10: push 결정 — 798f911f..d678bc51 을 2026-09-27 15:52:10 KST push, 운영 /privacy 15:53:19 KST 반영(PRIVACY LIVE 2026년 9월 27일)
- [Phase 22]: 22-10: 시행일 2026-09-27 유지 — /privacy 첫 공개일(15:28 KST 디버그 세션 push 798f911f 가 자리표시 시행일 페이지를 선공개)과 push 날이 같아 재조정 없음
- [Phase 24]: 24-01: buy3_schema 는 relay 상수 LC_FIXED_BUY3_SCHEMA=1 로 못박고 입력·zod 에 두지 않는다 (T-24-01)
- [Phase 24]: 24-01: 매수 LED 는 마스터 우선 — buyEnabled=false 면 postBuyPhase=2 여도 OFF · 세 상태 모두 클릭 불가 (D-12)
- [Phase 24]: 24-01: formFromServer 는 추가매수·후매수 금액 0 을 0 그대로 들인다 — buyOrderAmount prev 보존 특례 불채택 (D-03)
- [Phase 24]: 24-03: 구 탭 판정은 세션·계좌 가드 뒤 — 게이트 켜진 옛 lc.set·lc.arm buy 는 거부 프레임+소켓 유지, 철거만 중립값 buy3_schema=1 중계(레거시 0 중계 없음)
- [Phase 24]: 24-03: relay MSG 에서 38 제거(번호 봉인) · shared RelayLcArmMsg.latch sell|cancel · webapp ArmableLatchKind
- [Phase 24]: 24-03: buyWatchSide 는 RelayLimitChaserInput 에서 제거 · 읽기 전용 RelayLimitChaser 필드는 유지(옛 에코·24-02 도구)
- [Phase 24]: 24-04: 폰 밴드(<700) 값 쉐브런을 상따 설정 전체에서 숨김(L3) — 본문 344 새 행 4px 넘침 해소
- [Phase 24]: 24-04: 표시 판정 한 곳(lc-fields lcValueTextOf/lcSummaryOf/lcRowA11yNameOf/lcRowDimOf) — 시트 「지금」은 server=null 로 설정값
- [Phase 24]: 24-04: 세 그룹 카드 접힘 = 폼 useState(저장 안 함) · 자동 펼침은 행 실패만(값 실패 · 체크 거부/무응답)
- [Phase 24]: 24-05: 카드 fired 상태 자체 제거 — 마스터 OFF 는 발주가 아니다(Pitfall 11) · strategyStatusOf(server, false)
- [Phase 24]: 24-05: D-01/D-02 동반 문장은 보낸 cfg 로만 판정 · D-02 후반은 보낸 사유 serverFold 로만(pendingCauseRef = pendingRef 수명)
- [Phase 24]: 24-05: 후매수 단계 2 진입/이탈 전이에서만 매도·취소 override 4필드를 값 비교에서 제외(Pitfall 8 · 판정 한 곳)
- [Phase 24]: 24-06: 한방은 등록 필드(LC_GATE_FIELDS)에서 뺐지만 끄는 방향 면제는 isDisarm 으로 유지(T-16-44)
- [Phase 24]: 24-06: 스위치 disabled · 켤 수 없는 이유 패널은 가격 0 만 — 그룹 수량 0 은 누르는 순간 카드 사전 검증 줄(R7)
- [Phase 24]: 24-06: D-02 후반 에코 경로 제출은 폼 dropMasterAfterServerFold 한 곳 — 하강 전이 · 다음 틱 · 가드 4개 · 재접속 뒤 옛 에코 객체는 기준선 아님
- [Phase 24]: 24-06: 웹 canArmOf ↔ relay #strategyArmable 그룹별 동형(buy=가격 · 그룹=그룹 수량 · sweep=선매수 하위)
- [Phase 24]: 24-07: 선매수 자동 체크는 사람의 선매수 ON 핸들러에서만 계산 — 취소 매수잔량 0 이면 취소>잔량추적도 생략(서버 §9 ②′ 가 취소 3플래그를 눕히므로 UI-SPEC 예시와 다름) · 판정 기준은 서버 동기값 · 로그는 주 필드 성공 뒤 한 줄
- [Phase 24]: 24-07: 새 전략 기본값 D-04(선매수 4,000만원 · 잔량추적 55) · 상장주식수 시딩은 폼 인스턴스당 1회(삭제 뒤 remount 된 새 폼도 시딩) · 사람이 확정한 칸 제외 · 제출/로그/강조 0
- [Phase 24]: 24-08: 제목줄 상태 문구는 inline-block 한 덩어리 + 「 · 」 조각(nowrap) 경계에서만 줄바꿈 — 344 에서 「켜짐 ·」/「켠 매수 없음」 쪼개짐 수정, 전체 nowrap 은 0.4px 차로 스위치를 덮을 수 있어 배제
- [Phase 24]: 24-08: 실브라우저 제출 단언은 게이트웨이 10 개수 + 디코드로 — D-02 후반 하강 전이 1건 · 재수신 0건 · 삭제 가드 0건을 1.5초 관찰 창으로 잰다(두 클라 동작 같음 · D-19 정정)
- [Phase 24]: 24-02: D-14 추출 완료(2026-09-28 08:06 KST) — 옛 서버 lc.snap 총 2건 · 매수잔량 기준 0건, 24-12 재기동 뒤 재설정 대상 없음 · gh-trade-38 회신은 메인 세션
- [Phase 24]: Phase 24-09: 장중(11:00~12:00 KST) 재기동·배포로 당김(사용자 결정) — 중간 창 10:47:22~11:13:46 약 26분. relay:94ebc91c(롤백 대상 2fe94209) · webapp master 94ebc91c 라이브, 운영 웹 눈 확인·300ms 창 관찰은 UAT 이월
- [Phase 24]: 24-10 WR-01: 선매수 금액 0 = 서버가 모른다(D-04a) 특례는 구서버 에코(buy3Schema 0)에서만 — 판별 단일 지점 lib isLegacyBuySchema · isLegacyAmountUnknown. buy3 에코의 0 은 미입력(D-03)이라 선매수 켜기만 카드 한 줄로 막힘
- [Phase 24]: 24-11: 무응답 제출의 로그 귀속은 결과 모름 창(ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS) 만료 때 동일성 가드로 비운다 · 거부는 즉시 비운다 · 15:40·전부 정지 원인 에코에는 sent 를 넘기지 않는다 (WR-05) — 3초에 비우면 늦게 닿은 내 에코가 거짓 「다른 단말」 배너를 세운다 — 훅 고아 장벽과 같은 수평선
- [Phase 24]: 24-12 WR-02: 구서버 에코(buy3Schema 0)는 「끄는 방향 ∧ 결과 매수주문 OFF」만 전송 — lcLegacyBlockOf 가 훅 전송 직전(대기열 포함)과 시트 · 인라인 검증의 단일 판정. 매수주문 끄기는 늘 허용(T-16-44)
- [Phase 24]: 24-12: D-04a 금액 확정 특례 제거(도달 불가) — 금액 행 「—」 · 끄기 cfg 서버 금액 · 수량만 남음. CONTEXT D-03 재해석 확인은 24-16 체크포인트 몫
- [Phase 24]: 24-13: 구서버 에코면 매수주문 카드 상태는 마스터 무관 「구서버 전략 · 끄기만 가능」(--destructive) — 구서버는 buy3 그룹을 몰라 「켠 매수 없음」이 거짓
- [Phase 24]: 24-13: 구서버 에코는 켜는 방향 스위치 전부 disabled(매수취소 포함) · 끄기는 늘 허용 · 열 패널은 그 열 카드 이름 전부 + legacyReadOnly 한 줄(다른 사유 병기 없음)
- [Phase 24]: 24-14: 동반 필드는 값 또는 (base) => 동반 함수(LcCompanions) — 대기 건은 꺼내는 순간의 서버 동기값으로 다시 계산(WR-03) · 선매수 자동 체크 · D-01 마스터 동반 모두 전송 시점 서버 값 · 사전 검증 · D-16 은 누르는 순간(R7)
- [Phase 24]: 24-14: failQueue 는 drain · 즉시 경로와 같은 sameAsServer(주 필드 + 지금 계산한 동반) — 주 필드만 같다고 성공으로 접지 않는다(WR-04)
- [Phase 24]: 24-14: 동반은 불리언만 낙관 표시 · 되돌림 — 매도 가격 채움은 cfg 에만 · 에코 뒤 표시(IN-05)
- [Phase 24]: 24-14: 자동 체크 로그는 성공 뒤 autoCheckRef(마지막 계산 = 실제 전송 판정) · pendingAutoCheckRef = { gate, seqAtSend } (24-17 이 넓힘)
- [Phase 24]: 24-15: D-02 후반 자동 마스터 OFF 는 보낼 cfg 가 최신 에코와 buyEnabled 한 필드만 다를 때만 나간다(가드 ⑤ · lib isMasterOnlyDelta) — 수량 3벌 · 클라 고정 3필드 포함 비교, 다르면 접고 재예약 없음
- [Phase 24]: 24-15: 보이지 않는 인스턴스(visibilityState hidden)는 자동 끔을 LC_FOLD_HIDDEN_DEFER_MS(1.5초) 미룬 뒤 가드 ② 재확인(가드 ⑥) — 보이는 인스턴스는 다음 틱 그대로
- [Phase 24]: 24-15: WR-06 은 webapp 만으로 닫음(relay 재배포 불필요) — 동시에 보이는 두 인스턴스 · 한 왕복 안쪽 사람 편집 되돌림은 relay/서버 compare-and-set 이월, 24-16 체크포인트에서 사용자 확인
- [Phase 24]: 24-17: D-35 — 사람이 추가매수를 켤 때도 선매수와 같은 규칙으로 매도 · 취소 6체크를 한 lc.set 에 싣는다. 판정은 lib groupAutoChecksOf(gate, …) 한 벌(gate 는 로그 첫머리 그룹 이름만) · 후매수는 AutoCheckGate 에서 제외 · 순서 사전 검증 → D-16 → 자동 체크 · 로그 「{선매수|추가매수} 자동 체크 — …」(선매수 문장 불변) · webapp 만(relay 변경 없음)
- [Phase 24]: 24-18 GC-WR-01: 거부 통지는 보낸 제출 귀속을 비우지 않는다 — 귀속 판정은 strategy-log echoAnswersSent(요청 변화가 하나라도 섰는가) 한 곳, 싣지 않은 에코는 귀속을 받지도 소비하지도 않고 끝은 결과 모름 창 만료 — 부분 거부(ERROR 뒤 같은 제출의 에코)와 다른 탭 거부 팬아웃 때문에 거부 시점 비움이 내 에코를 다른 단말로 읽게 했다(24-REVIEW-R2 GC-WR-01)
- [Phase 24]: GC-WR-02: 토글 되돌림 기준은 서버가 있으면 지금 서버 동기값(baseNow()), 미등록이면 확정 직전 폼 값 — revertToggle 한 자리 · reshow 빠지는 키도 같은 기준
- [Phase 24]: GC-WR-02: failQueue 에서 주 필드만 서버 값이면 주 필드는 성공 · 동반은 서버 값으로 조용히 표시(동반 말풍선 없음 · 24-24 사용자 확인 결정) — 대기 건 전체 성공 접기(WR-04 금지)와 다름
- [Phase 24]: 24-20 GC-WR-03: D-02 전반 마스터 동반은 누른 순간 화면에서 마지막 ∧ 판정 시점(즉시 · 꺼내는 순간) 서버 값에서도 마지막일 때만 — 대기 중 다른 단말이 켠 그룹을 해제하지 않는다
- [Phase 24]: 24-20 GC-IN-01: isServerFoldEdge 는 직전 · 이번 에코 중 구서버(buy3Schema 0)가 있으면 false — 구서버에 자동 마스터 OFF 금지 · GC-IN-02 유예 지터는 넣지 않고 남는 한계 문구(모든 인스턴스 숨음 N건)만 넓힘
- [Phase 24]: 24-21 GC-WR-04: 자동 체크 로그 대기 · 계산 결과는 그룹별 슬롯 — 선매수 in-flight 중 다른 그룹을 켜도 선매수 6체크 무장 줄이 남는다
- [Phase 24]: 24-21 GC-IN-03: 자동 체크 줄은 훅 lastSuccessSent(in-flight 에코 답)에만 — 다른 단말이 켠 no-op · 대기 접기 성공에는 쓰지 않는다(D-08)
- [Phase 24]: 24-22 D-36: 추가매수 켜기 클라 차단 = 매수1호가 == 비교가격(둘 다 > 0) ∧ 매수1잔량 ≥ 최소(0 이면 1) — 얇은 벽 · 잔량 모름은 허용(서버 「모름」 규칙 백스톱 · gh-trade k3u 동형) · 문구 원천 lcExtraBuyAtUpperLimitText(WinForms 원문 · ko-KR 쉼표)
- [Phase 24]: 24-23 D-38: 웹은 후매수 발동 override 값(발동잔량 × 80% 또는 유지된 사람 값)을 계산하지 않고 에코 그대로 보인다 — 「= 발동잔량」 서술 · 픽스처 제거, Pitfall 8 판정 불변
- [Phase 24]: 24-23 D-37: 추가매수 포기 = 최대 초과 1종 — shared 주석 · UI-SPEC · 테스트 예시 정정, 새 클라 문구 없음 · relay .fbs/envelope 옛 표현은 gh-trade 스키마 동기화 몫으로 이월(relay 무변경)
- [Phase 24]: 24-23 GC-IN-04: e2e 부재 관찰 창 FOLD_QUIET_MS = 3초(LC_FOLD_HIDDEN_DEFER_MS × 2) · 「1건」은 waitForSetAtGateway 사건 · P24-3/4/6 숫자 고정 대기 0
- [Phase 24]: 24-24 사용자 승인: D-36 새 문구 · 판단 6건(GC-WR-01 창 안 같은 변화 에코=내 답 · GC-WR-02 · GC-WR-03 두 단계 판정 · GC-IN-02 숨음 N건+지터 이월 · D-37 relay 옛 주석은 gh-trade sync 몫 · 거부 실패 켜기엔 자동 체크 줄 없음) 모두 수용 — 이월: relay 소켓 상관 · 유예 지터
- [Phase 24]: 24-24 배포: origin/master 앞섬은 phase 브랜치에서 git merge --no-ff origin/master(rebase 안 함) → 병합 트리 게이트 재실행 → master fast-forward push(d6194dcd) · Vercel 자동 빌드 Ready · relay 재배포 없음(relay:94ebc91c 유지)
- [Phase 25]: 25-01: 관찰자 두 스트림 — JournalWriter 스트림 서술자 주입(JournalStreamSpec) · 커서 2 · since 2(epoch 짝 가드) · pending 2 · 주문 push 먼저
- [Phase 25]: 25-01: journal.events 시세 공개 판정은 kind 로만(isMarketStrategyEvent) — 빈 계좌번호 판정 금지(T-25-01)
- [Phase 25]: 25-01: relay 테스트는 shared 소스 픽스처를 런타임 동적 import 로 읽는다(NodeNext · rootDir 경계 — 값 두 벌 금지)
- [Phase 25]: 25-01: dma_strategy_events enum 칸 CHECK 없음 · 전략 커서는 dma_journal_cursor 전략 칸 2(주문 칸 불변) · 원격 미적용(25-11) — relay 배포는 마이그레이션 적용 뒤
- [Phase 25]: 25-02: /healthz journal.strategy {lastSeq·headSeq·lagSeq·dbError·queueDepth}|null 은 본문 전용 표시 신호 — 파생 상태·503 은 주문 스트림 기준 유지(마이그레이션 전 배포의 장중 거짓 503 방지)
- [Phase 25]: 25-02: 두 스트림 관찰자 경계는 25-01 구현으로 이미 충족 — observer.ts 무수정, 테스트 유효성은 변이 4종으로 증명
- [Phase 25]: Phase 25-03: 주문 1건 이벤트 RPC 는 클라 계좌를 받지 않고 :id 행의 (gateway, trade_date, account_no) 로 통보+전략을 거른다 — orderNos 에 남의 계좌 번호를 끼워도 행 계좌 밖으로 못 나감(T-25-13)
- [Phase 25]: Phase 25-03: 두 소스 타임라인 정렬 = gw_time_ms(ms 정수) → 같은 ms 통보 먼저 → seq. 키는 source|gateway|epoch|seq (별도 seq 공간)
- [Phase 25]: Phase 25-04: 12453 후매수 조건 연산자는 서버 reason_code(PostBuy 반등 … 잔량>발동잔량)가 정본이라 「>」 — 기획서·목업의 「≤」 는 형식 설명용 예시
- [Phase 25]: Phase 25-04: 모르는 kind 는 그룹을 알아도 tone unknown · 행위 원문 kind 숫자 · 본문 없음 / 펼침 그룹 접두는 주문 줄(kind 3·6)만 · group 0 은 접두 없음
- [Phase 25]: 25-05: 방향 미상은 「주문」(알림 포함) · rejected∧result_code -2 는 「접수 불명」 muted(투영 status 불변) · KB 거부 R(New) 방향은 sideRef 로 회색 참고 표기 — 판정·문구 정본은 order-notices.ts/orders-api.ts
- [Phase 25]: 25-06: 83 QueueProgress 는 hub 가 세션 allowedAccounts 로 거른 뒤에만 캐시(없으면 fail-closed) · dmaUserId 제거 · (isin, exchange) 전량 교체 · 빈→빈 팬아웃 억제 · 중복 83 은 멱등이라 제거 안 함
- [Phase 25]: 25-06: 진행률 종류명 group 0 → 「매수」(A-P1) — webapp/src/lib/queue-progress.ts progressGroupLabel 한 곳
- [Phase 25]: 25-07: 주문로그 새 줄 강조·배지 원천은 strategyEventsBatch 가 아니라 strategyEvents 키 집합 스냅샷 비교 — batch 는 마지막 프레임만 들어 연속 푸시 렌더 합쳐짐에서 앞 줄을 놓친다
- [Phase 25]: 25-07: useStickToBottom 따라감 판정은 직전 커밋 scrollHeight 기준 삽입 전 거리 — scroll 이벤트(다음 프레임)보다 먼저 온 푸시에 끌려 내려가지 않게
- [Phase 25]: 25-07: 공용 패널 탭 값 정본 SHARED_PANEL_TABS(as const) → SharedPanelTab·isSharedPanelTab·SharedTab 파생 · 창 분리 상수 ORDER_LOG_WINDOW_* 는 order-log-feed.ts(25-10 공유)
- [Phase 25]: 25-08: 오늘 주문 펼침 본문(조회)은 보이는 배치(표 ≥1280 / 카드 행) 한 곳에만 마운트 — 클릭 1회 = GET 1회
- [Phase 25]: 25-08: 오늘 주문 행 렌더 키 = 펼침 키 = members[0].id — 조각이 들어와도 본문 재마운트 · 재조회 없음
- [Phase 25]: 25-08: 통보 문장은 판정 필드만 보고 message 는 거부 꼬리로만 · 상따 문장은 timelineStrategyText 출력 그대로(D-09 두 줄 형식 변경은 shared 한 곳)
- [Phase 25]: 25-09: 진행률 보조행은 표 폭을 넓히지 않는다(w-0 min-w-full + 막대 140→40px 신축) — 넓히면 카드 탭 폰 폭(344)에서 미체결 표가 324→380 가로 스크롤돼 「취소」 가 밀린다
- [Phase 25]: 25-09: 진행률 보조행은 기본 표 · 임베드가 UnfilledProgressRow 한 컴포넌트를 공유 · 문구 조각은 unfilled-progress.tsx 상수 + progressView 값 텍스트 두 곳
- [Phase 25]: 25-10: 카드 탭 주문로그 종목 칸은 카드 표시명(stockName) — 카드는 useIsinLabels 비구독(T-18-29)
- [Phase 25]: 25-10: OrderLogFeedProvider 는 WorkbenchSurface 루트(phoneBand 동반) · 게이트 뒤 마운트 1회 조회 불변
- [Phase 25]: 25-10: 창 분리 문서 제목 정본 = page.tsx generateMetadata — router.replace 가 루트 제목으로 덮는다
- [Phase 25]: 25-10: WB_PHONE_BAND_BELOW 정의는 lib/trading-layout.ts · 작업대는 재수출(창 번들 경량)
- [Phase 25]: 25-11 원격 스키마 적용(Phase 25 마이그레이션 3개)은 외부 세션 quick-260929-sas 가 사용자 승인으로 처리 — 25-11 은 읽기 전용 확인만(migration list 48행 Local=Remote · 세 RPC anon HTTP 401)
- [Phase 25]: [25-12] Phase 25 배포는 병합 커밋 6289e430 하나로 relay:6289e430 → server gh-radar-server-00053-cmm → webapp(Vercel 6289e430) 순서 · 롤백 대상 relay 4c143596 · server 00052-88h
- [Phase 25]: [25-12] gh-trade 1712001c blob 차이(SetLimitChaser 말미 post_buy_auto)는 재생성 없이 5f49cfa5 생성물로 배포 — 와이어 호환(buy3_schema 1). 재생성·배포는 quick-260929-vzy 몫
- [Phase 25]: [25-12] push 는 배포·검증 커밋 6289e430 만(fast-forward) — 동시 세션 vzy 커밋은 미배포. 첫 거래일 UAT 는 2026-09-30 장중 gh-trade 알림 대기
- [Phase 25]: 25-13: WR-02 — #clearCaches 가 진행률 키를 지우면 그 userId 에게만 unf.progress snap:true entries:[] 1프레임(이미 연결된 브라우저 사본 비움 · D-13 무변경). (A) vzy 동반 배포 relay:6821181b · push 6289e430..6821181b
- [Phase 26]: 26-01: 관찰자 role 검증은 envelope buildObserverLoginReq 한 곳 — 0/1 밖은 RangeError(비밀 미포함), ObserverLoginResult.role 필수(거부·구 게이트웨이 0) — 26-02 QuoteFeed role_mismatch 판정 근거
- [Phase 26]: 26-02: QuoteFeed 는 별도 클래스(저널 관찰자 무변경) · 초기 disabled · reconnects 는 재-ready 시 계수 · 79 만 소비하고 ready 뒤 78 포함 전부 frame 으로(무시 판단은 hub)
- [Phase 26]: 26-02: 스텁 게이트웨이 role 1 로그인은 quote 목록 전용 — 79(role 1 · 거부면 role 0) → 성공이면 빈 78, 저널 목록은 role 0 만
- [Phase 26]: 26-03: 시세 키 전역 marketKey(isin|ex) · 업스트림 송신자 = quote 연결(attachFeed) · 공개 시세는 hub market 이벤트(RelayQuote|RelayTape 한정) + fanout #keyConns 색인 — 사용자 세션 ready 는 시세 재구독 안 함(D-03·D-08)
- [Phase 26]: 26-03: 전역 시세 캐시는 1→0 에서 정리 · 참조계수 없는 키의 늦은 58/59·69/71 은 캐시 안 하고 버림 (재접속 창은 linger 26-08 담당)
- [Phase 26]: 26-04: quote 비밀 폴백(D-17)은 production 필수 검사 뒤 계산 — production 은 여전히 DMA_OBSERVER_SECRET 만 요구, quote 키로 우회 불가
- [Phase 26]: 26-04: quote 연결은 주 게이트웨이에만 · 부팅 결선 뒤 관찰자 start 옆에서 start, 종료 4단계 관찰자 stop 앞에서 stop
- [Phase 26]: [26-05] e2e quote 연결 기본 켬 · 저널 관찰자는 observer:true 만(D-17) — 주입 소켓은 역할로 고른다: 사용자 세션 프레임 userSocket() · 시세 quoteSocket() · 게이트웨이 첫 소켓 가정 금지
- [Phase 26]: 26-06: quote 경계 테스트는 hub 무수정 특성화 — 뮤테이션 8종으로 공허하지 않음 증명, T-26-09 송신 집합 ⊆ {4,5,28,29,32} 는 실 TCP describe afterEach 불변식
- [Phase 26]: Phase 26-07: PRICE 소켓 판정은 hub 키 단위 1회 — samePriceSection 12필드(et · 호가 · 정적 제외) + PRICE_MIN_INTERVAL_MS 100 + 키당 pending 타이머 1개, 억제분은 +100ms 에 캐시 최신 q 를 {full:false, price:true} 로
- [Phase 26]: Phase 26-07: D-05 편차(VI 상태만 바뀐 R8 불통과)는 PRICE 소비처(use-breakout-quotes)가 q.p 만 읽어 표시 차이 없음 — 26-07-SUMMARY 「D-05 편차」
- [Phase 26]: Phase 26-07: PRICE 게이트 정리는 unsubscribe 한 줄(refs.price === 0 || 실효 PRICE) — 26-08 linger 가 1→0 을 바꿀 때 같이 옮길 것
- [Phase 26]: Phase 26-08: linger 키는 #refs 에 합계 0 항목으로 남긴다 — 업스트림 구독 키 = live + linger, #onQuote 가드가 그대로 linger 중 캐시 갱신 · 만료 뒤 미캐시를 가른다
- [Phase 26]: Phase 26-08: LINGER_MS 15초 · 만료 · lingerMs 0 · 재접속 정리는 #releaseKey 한 자리(재접속만 29(false) 생략), 복귀 시 linger 당시 level 로 승격/강등 판정
- [Phase 26]: Phase 26-08: stats.subscriptionCount = live 키 수, 업스트림 키 = subscriptionCount + lingerCount · QUOTE_LINGER_MS 기본 15000 · e2e 0 · 빈 문자열/음수/비숫자 기동 거부
- [Phase 26]: 26-09: 구독 한도 판정은 사용자(200) → 전역(2000 · live+linger) 순서, 참조계수 변경 전. 전역 자리는 since 최소 linger 키를 29(false) 로 먼저 해제, 없으면 거부(LRU 없음)
- [Phase 26]: 26-09: 한도 거부는 그 소켓에만 {t:"sub.limit", i, x, scope} — {t:"msg"} 재사용 안 함. 거부 키는 conn.keys · #keyConns 미등록 · subLimitRejects 누적(healthz 원천)
- [Phase 26]: 26-10: 재구독 페이싱 — in-flight 창 32 키 · FULL 은 69 · PRICE 는 58 응답 또는 3초로 다음 키 (A5 가정 · 재구독 완료 로그로 조정)
- [Phase 26]: 26-10: 응답 없는 29(해제 · 강등)는 창 밖 즉시 · 대기 중 키의 해제는 프레임 0 · 강등은 대기 항목 level 만 (A10 FIFO 가정)
- [Phase 26]: 26-10: 페이서 타이머는 대기열이 있거나 재구독 추적 중일 때만 1개 — 평시 구독에 타이머를 쌓지 않는다
- [Phase 26]: 83 재송신 넛지: 사용자의 이 세션 첫 참조가 이미 업스트림(live · linger)인 키면 같은 실효 level 29(true) 1건, 사용자 세션 Ready 에 참조 > 0 키마다 1건 — 승격 · 강등 29 가 나가는 호출은 생략 (26-11)
- [Phase 26]: #userRefs 는 「본 키」 기억(참조 0 보존) — 사용자 한도는 active(참조 > 0) 계수로 판정, #releaseKey · #clearCaches 가 정리 (26-11)
- [Phase 26]: QuoteStatus = quote.state 프레임(3초 디바운스) · healthz 7키의 한 원천. quoteAlerting 은 rejected · role_mismatch 즉시, 그 밖 장중 60초 (26-11)
- [Phase 26]: 26-12: quote 는 journalGateways 와 달리 /healthz 503 축 — 폴백 없음(D-03)이라 단일 장애점 · 판정은 quoteAlerting 한 벌(장중 60초 · 거부/역할 불일치 즉시)
- [Phase 26]: 26-12: quote.state 는 인증 직후 알 때만 스냅샷 · 전이는 #users 전 연결 · 미등록 0 — webapp 은 quoteState/subLimit 최신 1건만 보관하고 isStale 불변(D-04)
- [Phase 26]: 26-13 D-14 채택: 배지 2축은 안 B 점형(「● 시세」 · 「● 주문」 · 끊김 시만 「HH:MM:SS~ 멈춤」) · 수정 없음
- [Phase 26]: RELAY_STATE_LABELS.connecting 상수는 중립 「서버 연결 중…」 — 접두 「주문」 과 합쳐 읽힘 · 예외 규칙 없음
- [Phase 26]: 재연결 중 시세 필은 마지막 quoteState 유지 · 구독 한도는 시세 필 title 만(칩 없음) · My page 점도 작업대 톤
- [Phase 26]: 26-14: 배지 2축은 안 B 정본대로 구현 — quotePillOf · orderPillOf(lib/quote-state.ts) 단일 판정, 두 상태줄은 그리기만
- [Phase 26]: 26-14: RELAY_STATE_LABELS.connecting = 「서버 연결 중…」(화면 「주문 서버 연결 중…」) — 소비처는 두 상태줄 · use-relay-socket 뿐

### Pending Todos

닫힌 항목(근거 포함): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#닫힌-todo--blocker)

- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key) — 예: 90일 cron
- DI-03: Phase 09.2 RESEARCH Pitfall 10 follow-up — `news_articles`, `discussions`, `summaries` 테이블의 RLS 정책이 `TO anon` 만 명시하는지 audit. supabase/migrations/20260515163000 (stock_daily_ohlcv fix 패턴) mirror 로 `TO anon, authenticated USING (true)` 갱신 필요. supabase-js 가 인증 사용자 JWT 호출 → role=`authenticated` → 정책 부재 → default-deny 함정. 본 phase 09.2 와 무관 (차트는 stock_daily_ohlcv 만 사용) 하나 로그인 사용자 페이지 (Phase 7 뉴스, Phase 8 토론, Phase 10 요약) 의 빈 응답 가능성. 별도 phase 또는 인프라 PR 권장.
- DI-04: Phase 09.2 RESEARCH Pitfall 11 follow-up — Vercel production env 등록 시 trailing newline (`\n`) 오염 검증 절차 자동화. 증상: dev 정상이나 production 만 모든 fetch 비정상. 검증: `vercel env pull` 후 `tail -c1 .env.local | xxd -p` 가 `0a` (newline) 이면 오염. 즉시 수정: `vercel env rm` + `printf "%s" "값" | vercel env add`. CI hook 자동화 검토 (별도 인프라 PR).

### Blockers/Concerns

닫힌 항목(근거 포함): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#닫힌-todo--blocker)

- **Phase 22 Play 경로 → Phase 23 (2026-09-27).** Play Console 개발자 인증 미완료로 Android 는 Firebase App Distribution APK 로 재범위(22-05~22-10 재계획 · 체커 통과). Play 스토어 배포는 Phase 23 — 착수 조건: Play 개발자 인증 완료. 옛 22-05~22-07 은 phases/23-gh-trade-play/from-phase-22/.

### Quick Tasks Completed

이전 quick 이력: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#quick-tasks-completed)

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260928-nf6 | **discussion-sync 사전 예산 판정 과대 추정 수정** — 필요량을 104종목×백필 30페이지=3,120 으로 잡아 하루 사용량 ~1,880 이후 KST 자정까지 매 정각 skip(최근 30일 265회, 평일 오후 수집 공백). 남은 예산 < 종목 수×1 일 때만 skip, 상한은 기존 요청 단위 원자적 하드캡. 판정 근거 필드 로그. 회귀 4케이스(재현 1986 실행 · 부족 skip · 경계 · 하드캡) · 86 passed | 2026-09-28 | 80df4f59 | [260928-nf6-discussion-sync](./quick/260928-nf6-discussion-sync/) |
| 260927-u9t | **크롤링 워커 소스 실패 알림** — theme-sync·discussion-sync 가 소스 실패에도 exit 0 이라 무음(09-11~27 네이버 테마 0개, 09-27 Bright Data 401 10시간). 로그 매치 알림 정책 2개(gh-radar-theme-sync-source-failure · gh-radar-discussion-sync-source-failure, jsonPayload.level>=50 + backoff/fatal, 시간당 1통) + pino Cloud Logging severity 매핑 + 배포 스크립트 update-or-create. 30일 로그 재생 오탐 0. 두 잡 :90060c93 배포. 선행 fix 8d88d1e0 = 네이버 테마 소스를 m.stock.naver.com JSON API 로 전환 | 2026-09-27 | 90060c93 | [260927-u9t-theme-sync-discussion-sync](./quick/260927-u9t-theme-sync-discussion-sync/) |
| 260925-gy6 | **라이트 선택·활성 = 스케치 003-A(브랜치 theme/toss-b · 미병합)** — 라이트 `--pill-on-*` 검정 → blue50 #e8f3ff/blue600 #1b64da(알약 9곳 자동) · `--side-bg` 흰색 · 새 토큰 5개(`--nav-on-bg/fg/line` · `--spec-dot-bg/ring`, 다크 값 = 종전 렌더 색) → 사이드바 활성 · 종목상세 탭 선택(글자 blue600 · 밑줄 blue500) · 내 테마 칩 · 스펙트럼 현재가 점. 세그먼트 선택색은 Phase 20 D-02 로 제외. 다크 무변경(가드 테스트). typecheck 0 · webapp 1748/1 skip · 라이트 갤러리 3화면×6폭 넘침 0 | 2026-09-25 | — | [260925-gy6-sketch-003-a-blue50-blue600](./quick/260925-gy6-sketch-003-a-blue50-blue600/) |
| 260925-0pf | **토스 B → 공식 TDS 값 정렬(브랜치 theme/toss-b · 미병합)** — @toss/tds-colors 팔레트(다크 띠 #101013 · 선택 면 grey300 · 비활성 grey400 · red #f04251 / 라이트 보조 grey600) · 행 구분선 hairline(#3c3c47/#e5e8eb, `--border-subtle` 재사용 · 45줄+3곳) · 탭 t5 17/600 · 라벨 t6 15 · CTA 56/r16 · 주문 버튼 48/r14(`lc` 글자 불변). typecheck 0 · webapp 1731/1 skip · build 0 · 갤러리 132장 넘침 0 · 프리뷰 재배포 | 2026-09-25 | — | [260925-0pf-tds-theme-toss-b](./quick/260925-0pf-tds-theme-toss-b/) |
| 260924-vj1 | **토스 B 테마 실험(브랜치 theme/toss-b · 미병합)** — 스케치 001 B안 전역 리스킨: TDS 다크/라이트 토큰 · 무테 면 · radius 상향 · Pretendard tabular 숫자 · 알약 세그먼트 · 종목상세 풀폭 띠+폰 주문하기 CTA · 사다리/폼/카드 표면. §2.2b 경계·`--lw` 불변. 스케치 002(호가주문 토스식: 리스트+바텀시트·자체 키패드·데스크톱 인라인) 채택안 기록. typecheck 0 · webapp 1681/1 skip · build 0 · 갤러리 132장 가로 넘침 0 · Vercel 프리뷰 확인 | 2026-09-24 | — | [260924-vj1-b-theme-toss-b](./quick/260924-vj1-b-theme-toss-b/) |
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
| 260925-o1s | **relay 알림 정책 문서 크기 초과 수정** — `ops/alert-relay-down.yaml` documentation 10,834→9,039 바이트(GCP 상한 10,240 · 목표 ≤9,500). 8번 상세는 docs/relay-operations.md 「관찰자 기록 연결 (Phase 19)」→「상태별 대응」 이관. deploy-relay.sh `--alert-only`(apply_alert_policy 공용 함수, SUPABASE_URL·IAP SSH 불필요). 라이브 정책 7995724305267722560 문서만 갱신(7,782→9,039), 조건·임계 0.9·AND·채널 불변 describe 확인. stub·size·precheck·live-diff PASS | 2026-09-25 | — | [260925-o1s-relay-alert-doc-size](./quick/260925-o1s-relay-alert-doc-size/) |
| 260925-ptw | **트레이딩 화면 디자인 8건** — 카드 헤더 종목코드 제거·종목명 1줄+ⓘ 옆·✕ 이름줄 맨 오른쪽 · 카드 탭(정보/미체결/잔고/로그) 본문 고정 높이(row-h×4, 3행+스크롤)·탭 영역 접기(cardTabsFolded 기억) · 하단 잔고 행 클릭→카드 생성/포커스(reveal) · `.tbl-wrap thead th` 정렬을 @layer components 로(우정렬 머리글) · 타이틀·계좌·상태줄 한 줄 flex-wrap · viewport maximum-scale=1·user-scalable=no + 종목추가 입력 14px 복원. typecheck 0 · lint 0 err · 2132/1 skip | 2026-09-25 | — | [260925-ptw-trading-design-polish](./quick/260925-ptw-trading-design-polish/) |
| 18 | 트레이딩 후속 3건(fast) — 전역 검색 입력 14px 단일화(터치 16px 이원화 제거 · search.spec 에 viewport meta 단언) · 카드 탭 본문 네 탭 공통 고정 높이 = 정보 탭 3줄(≈72px · 사용자 정정: 탭별 높이 ✗), 카드 탭 빈 상태 dense(미체결·잔고·로그) · 종목추가 입력·버튼 46px(위 VI·돌파·상태줄 실측 46 과 맞춤, 버튼 r-md·14px). typecheck 0 · 2132/1 skip · Playwright 실측 390/1024/1440 | 2026-09-25 | fb3d45e | — |
| 260926-bwu | **radar-gw e2-small 전환 · wg0 부팅 실패 수정** — 2026-09-26 08:11 KST e2-micro→e2-small(RAM 1976MB · IP·MAC 불변 · relay healthz ok). 재부팅에서 `wg-quick@wg0` 실패: startup.sh wg0.conf PostUp 교보 .119 ESTABLISHED 선삭제 줄만 `2>/dev/null \|\| true` 누락(quick-260921-or9 도입, 9/16 이후 첫 재부팅). 수정 + README 머신 타입·메모리 예산·사건 기록 + setup-relay-iam.sh 생성 타입 e2-small. 부팅 모의 OK 17 · 하네스 ALL PASS. VM 반영 완료: startup-script 메타데이터 재적용(저장소와 일치) + 재부팅 검증(09-26 08:58 KST) — wg-quick@wg0 active · Bad rule 0 · peers 5 · 핸드셰이크 3 · DOCKER-USER ACCEPT 7 · MAC 불변 · relay healthz ok | 2026-09-26 | 94e40a3 | [260926-bwu-radar-gw-wg0-e2-small](./quick/260926-bwu-radar-gw-wg0-e2-small/) |
| 260926-d76 | **로그인 화면 sketch 006 A안 구현** — `/login` 의 shadcn Card·제목「GH Trade에 로그인」·설명 문구 제거. 앱 아이콘(`/icon.svg` 76·radius 22%) + 워드마크 h1「GH Trade」 가운데, Google 버튼 반전 CTA(56·radius 16·16/700 — 라이트 #191f28/흰, 다크 흰/#191f28) 폰 하단(좌우 20·바닥 44 + `--app-safe-bottom`) · md 이상 워드마크 아래 360 폭. 오류 알림 `--up-bg`/`--up` 12px, 진행 중 스피너+70%. 로그인 로직(OAuth·네이티브·safeNext) 불변. 앱은 Remote-URL 셸이라 웹 배포만으로 동일 반영. vitest 10/10 · typecheck · eslint · e2e auth-guards+brand-account 16/16 · 계산 스타일 66/66 | 2026-09-26 | eda719a | [260926-d76-sketch-006-a-card-google-cta-safe-area](./quick/260926-d76-sketch-006-a-card-google-cta-safe-area/) |
| 260926-nr2 | **상따 카드 「다른 단말에서 변경됐어요」 오배너·같은 뿌리 오표시 6건** — 에코 분류를 「누가 보냈나」→「무엇이 바뀌었나」로. 배너는 사용자 설정 값(`limitChaserValuesChanged`)이 내 요청 없이 바뀔 때만 · 내용 동일/런타임 카운터만 다른 에코(lc.arm 즉답+300ms 플러시 이중 에코 · 재연결 lc.snap)는 무동작(`isRuntimeOnlyEcho`) · S→C 전용 필드 shared 단일 정의(`LIMIT_CHASER_SERVER_*_FIELDS`)로 「서버 반영 완료」 오로그 제거 · lc.arm 3초 미반영 추적+거부 인식(`isLimitChaserArmRejection`) · 이 브라우저 전부 정지(65 경계 창)·15:40 KRX 해제(통지 경계) 에코를 relay 층에서 원인 귀속 → 「매수 발주」·「발주 완료」 오표시 제거 · 65 로그 문구 교정(장 마감 아님). 한계: 다른 단말 전부 정지는 여전히 발주로 읽힘. typecheck · relay 628 · webapp 2311/1 skip | 2026-09-26 | — | [260926-nr2-lc-card-false-other-device-banner-and-ec](./quick/260926-nr2-lc-card-false-other-device-banner-and-ec/) |
| 260927-s4j | **Phase 22 보안 경고 W-1·W-2 수정** — iOS check-ipa 를 TestFlight 업로드 전 lane 게이트로(build_app → check-ipa → `upload_to_testflight(ipa:)` · REVIEW CR-01) · Play beta check-aab 도 업로드 전(Phase 23 경로 보존) · 위생 검사 (10) lane 단위 업로드 전 짝 검사 · release-apps.sh 화면은 허용 표식 줄만(URL 가림 · ANSI 제거) · 로그 700/600 · 스텁 회귀 테스트 `test-release-apps-output.sh`(bash 5.3·3.2). 실제 업로드 미실행 — 다음 `native:release` 때 `IPA CHECK OK` 가 업로드 줄보다 먼저 나오는지 확인 | 2026-09-27 | 473bfb7e | [260927-s4j-phase-22-w-1-w-2-release-apps-sh-check-i](./quick/260927-s4j-phase-22-w-1-w-2-release-apps-sh-check-i/) |
| 260928-cs1 | **작업대 알림 토스트 우상단(헤더 아래)** — iPad 요청. 모든 뷰포트 상단 앵커 `top: 3.5rem+8px+safe-top`(헤더 z-30 안 덮음) · ≥700 우측 340px · <700 좌우 12px 전폭 · 최신이 맨 위(렌더 역순, 키 유지) · 등장 위→아래 · 앱 셸 ≥700 탭바 bottom 규칙 삭제 · GC8 단언 갱신. vitest 174/174 · e2e GC8 통과 · 스크린샷 3장 | 2026-09-28 | ed2cbd64 | [260928-cs1-toast-top-right](./quick/260928-cs1-toast-top-right/) |
| 260928-ei9 | **교보 DMA 신규 서버 10.16.207.127 개통** — startup.sh §8 nft wgfwd 교보 세트 5곳 3원소 · wg0.conf DOCKER-USER .127 6줄(.119 거울) · README 「DMA 서버 추가 절차」 · unit 헤더(라우트는 PUSH_REPLY 아닌 로그인 응답). radar-gw 라이브 nft -f 원자 교체 + DOCKER-USER ACCEPT 7→9 + startup-script 메타데이터 sha 일치. 1차 재접속 후 .127 라우트 없음 → 임시 라우트+tun1 캡처(SYN 15/응답 0)로 교보 게이트웨이 정책 문제 입증 → 교보 반영 후 14:06 재접속에 라우트 3개·:22 open. Mac AllowedIPs .127/32 추가·재연결, 09-29 08:47 끝단 3건 open | 2026-09-28 | d15bc821 | [260928-ei9-kyobo-dma-127](./quick/260928-ei9-kyobo-dma-127/) |
| 260929-c8e | **relay 관찰자 다중 업스트림 — 교보 kyobo127 관찰자(Verified)** — config.journalUpstreams(env DMA_KYOBO_HOST/PORT · DMA_OBSERVER_SECRET_KYOBO, 미설정=오늘과 동일) · 게이트웨이별 writer/access/observer/status · healthz journalGateways(503 판정 밖) · 추가 게이트웨이 매핑 journal.rows 푸시 · KB journal.state 프레임·webapp 불변 · SessionManager KB 단일. deploy-relay.sh/setup-relay-iam.sh KYOBO 비밀(없으면 KB 단독) · README 다중 게이트웨이 절. relay 665/665 · webapp 183/183 · 하네스 52/52. 라이브: 시크릿 b672eca72f2e · kyobo127 observer.toml(gh-trade) · relay 4c143596 배포 → KB·KYOBO 둘 다 live, accounts 3, 신원 교차 확인 승인, smoke 10/10. 한계: KYOBO 끊김 알림 경로 없음 · dma_journal_orders_for_user 게이트웨이 무관 조인(후속) | 2026-09-29 | 104ab050 | [260929-c8e-relay-kyobo-observer](./quick/260929-c8e-relay-kyobo-observer/) |
| 260929-sar | **KYOBO 관찰자 끊김 알림(Verified)** — /healthz `journalGateways.KYOBO.alerting` 을 JSONPath EXACT_MATCH `false` 로 보는 uptime check `gh-radar-kyobo-observer-healthz`(2xx·5xx) + 정책 `gh-radar-kyobo-observer-down`(6지점 평균·싱가포르 <0.9 · 300s). KB `gh-radar-relay-down` 두 조건을 KB check_id 로 한정(같은 host 오염 방지, 나머지 불변). deploy-relay.sh 가 라이브 healthz KYOBO 키 유무로 생성·갱신·삭제(전체 배포·--alert-only·--rollback). 라이브: 6지점 true · 멱등 · 음성 시험 incident 9분 08초 OPEN · 같은 창 KB/KYOBO 알림 0 · 임시 자원 삭제 · smoke 12/0 | 2026-09-29 | 8c785483 | [260929-sar-kyobo-observer-alert](./quick/260929-sar-kyobo-observer-alert/) |
| 260929-sas | **주문 가시성 게이트웨이 인지 조인(Verified)** — 마이그레이션 20260929190000: dma_credentials.gateway(기본 KB) · 추가 게이트웨이 신원 연결 테이블 dma_gateway_identities(service_role 전용 · 데이터 기반 시드) · 규칙 뷰 dma_visibility_identities + dma_visible_accounts(p_user_id) · ⑨ 와 Phase 25 전략 조회 RPC 2종 재정의. relay 추가 게이트웨이 journal.rows/journal.events 푸시도 연결 기준(60초 재적재 · fail closed). pgTAP 7파일 전부 PASS · relay 721/721 · webapp 184 · server 27. 원격: Phase 25 180000~180200 과 함께 21:37 push(사용자 승인) → 적용 전후 가시성·⑨ 행 수 동일 ALL PASS · smoke 12/0. **relay 미배포**(배포본 4c143596 이후 Phase 25 relay 14건) → relay 변경은 다음 Phase 25 relay 배포에 동반, 그때까지 kyobo127 새 user_id 추가 금지 | 2026-09-29 | 5cfacb83 | [260929-sas-gateway-aware-visibility](./quick/260929-sas-gateway-aware-visibility/) |
| 260926-o2u | **페이지 레이아웃 토스 문법 통일(목업 C=900 채택)** — 사이드바 「종목검색」 그룹(상승률 상위·테마·관심종목) 제거 · 세 페이지 진입은 /search 타일, 그 경로에선 사이드바 「검색」 활성. 공용 `PageHeader`(h1 22/700 · 뒤로가기 ChevronLeft, 기록 없으면 /search) + `PAGE_WRAP` max-w 900 가운데 → 홈·My page·검색·상승률 상위·테마·관심종목(트레이딩 제외). 섹션 제목 15/600 muted + 개수 평문 · 테마 순위 카드 한 장+hairline · My page 미체결·잔고 세로 스택 · 미정의 `--t-2xl` 5곳 제거. 홈 섹션 간격만 20px(복사됨 말풍선 겹침). typecheck · vitest 2329/1 skip · Playwright 41/41 | 2026-09-26 | c7763e2 | [260926-o2u-page-layout-toss](./quick/260926-o2u-page-layout-toss/) |
| 260926-rcc | **돌파감지 NXT 발화 거래소 추종 (gh-trade quick-260923-cfo 동기화)** — 76/78 `exchange` 가 NXT 일 수 있고 서버 상태는 ISIN 당 1개. relay 캐시·78 팬아웃·브라우저 upsert·스트립 행 키를 ISIN 한 축으로, 돌파 칩은 행의 발화 거래소 피드로 price 구독·가격·이탈 판정(전환 시 옛 피드 해제·새 피드 구독, 무장·3초 유예는 새 피드 기준 재시작), 카드 구독 제외는 (ISIN, 거래소). relay 630 · webapp 2376 통과, Playwright 미실행(3100 점유). **배포: relay 먼저 → healthz → push**(구 relay+새 webapp 은 스냅샷 ISIN 중복). 미배포 | 2026-09-26 | e9e4c78 · 89f5680 · 4d62ba7 | [260926-rcc-breakout-nxt-feed-exchange-rate-cross-is](./quick/260926-rcc-breakout-nxt-feed-exchange-rate-cross-is/) |
| 260926-s5v | **돌파 후속 2건 gh-trade 동작 동기화 (260926-rcc 후속)** — ① 돌파 행 → 카드를 발화 거래소로 연다(기존 카드는 발화 거래소로 전환 · NXT 미거래 종목의 NXT 요청은 무시 · 추가바·보유행은 KRX 유지, gh-trade `FormManager.OpenLimitChaserForm`). ② 이탈로 지운 행은 구독 해제, 새 구간(crossTime·거래소가 다른) 76 이면 새 행(등재시각·강조·3초 유예·첫 돌파시각 재시작) · 같은 구간 재전송(재접속 78)은 지운 채. 돌파 토스트는 스트립 새 행 신호로 — 재돌파에도 토스트, 알림음은 종목당 하루 1회 유지. webapp 2434 통과, Playwright 미실행(3100 점유). relay 무변경 · 배포는 rcc 순서(relay → healthz → push). 미배포 | 2026-09-26 | 0c88254 · a551023 · d28ac2d | [260926-s5v-breakout-row-open-card-fire-exchange-re-](./quick/260926-s5v-breakout-row-open-card-fire-exchange-re-/) |
| 260926-v5n | **키보드 사유 탭바 숨김 즉시화 (UAT 3차 실서버 B1 후속 · D-12a')** — 사용자 실기기(iPhone 16) 보고 「키보드가 나올 때 탭바가 늦게 사라짐」. iOS `keyboardWillShow` 분기 = removeAllAnimations → performWithoutAnimation(alpha 0 · isHidden) · Android IME onPrepare 분기 = animate().cancel() → alpha 0 · GONE. 키보드 길이·곡선 상태 제거. 재표시 90ms · 비키보드 사유 150ms+0.2s · 하드웨어 키보드 유지 불변. iOS/Android 스모크 · JUnit · verify-prod PROD CONFIG OK · 실기기 mesya · iPhone 17 · emulator 운영 빌드 설치. 네이티브 전용(webapp 무변경) → push 불필요 | 2026-09-26 | b9cf376 · 41311b4 | [260926-v5n-ios-keyboard-tabbar-instant-hide-on-devi](./quick/260926-v5n-ios-keyboard-tabbar-instant-hide-on-devi/) |
| 260926-vk9 | **키패드 시트 열림 탭바 즉시 숨김 (260926-v5n 후속 · D-12a'')** — 사용자 재보고 「수량 입력칸 눌렀을 때 여전히 느림」: 터치 기기 수량·가격 칸은 시스템 키보드가 아니라 웹 NumberPadSheet(overlay 경로 · D-12 150ms+0.2s)를 연다. NumberPadSheet 만 `<NativeOverlayMarker immediate />` → 0→1 에서 `overlay {open:true, immediate:true}` → iOS·Android 가 v5n 즉시 경로로 숨김. Sheet·Dialog·Popover 는 D-12 불변 · 필드 없음/모름 = 종전(옛·새 조합 모두 안전). vitest 2408 · Playwright vk9 · native-shell 11 · a11y 2 · iOS/Android 스모크 · verify-prod OK · 실기기 mesya · iPhone 17 · emulator 운영 빌드 설치. **웹 변경 포함 → 체감은 push 뒤**. 미배포 | 2026-09-26 | b02156a · 97e12d6 | [260926-vk9-numpad-sheet-tabbar-instant-hide](./quick/260926-vk9-numpad-sheet-tabbar-instant-hide/) |
| 260928-no0 | 마이페이지 전략 현황 카드·상태줄이 켜진 전략(isActiveStrategy)만 센다 — 꺼진(매수·매도·취소잔량 OFF) 전략 미표시 · gh-trade 합의(서버 64/60 등록 전수 계약 유지) | 2026-09-28 | c8e0c38e | [260928-no0-off-isactivestrategy](./quick/260928-no0-off-isactivestrategy/) |
| 260928-q5e | 폴드 세로 1단(lc≈689)에서 상따 카드 매수·매도 옵션 2열 — lc 첫 밴드 경계 700 → 685 | 2026-09-28 | 3da455e1 | [260928-q5e-1-lc-689-2-lc-700](./quick/260928-q5e-1-lc-689-2-lc-700/) |
| 260929-akj | **24-REVIEW-R3 Warning 2건 수정** — R3-WR-01: 부분 거부 ERROR 가 에코보다 먼저 와도 카드 거부 신호(rejectSeq→serverRejectSeq) 뒤 1초 유예 안의 같은 제출 에코로 판정(전면 거부는 유예 끝에 실패 · 타이머는 전송 없음). R3-WR-02: 보낸 성공 신호(sentSuccessSeq · lastSentSuccessField) 분리 — 늦은 에코 성공이 자동 체크 줄을 덮지 않음 · lastSuccessSent 제거. vitest trading 1405 · tsc green. 남은 한계: 1초보다 늦은 에코는 종전 동작. 미배포 | 2026-09-29 | 7fd7da49 · 214ae025 · 808a29a2 | [260929-akj-24-review-r3-r3-wr-01-error-r3-wr-02](./quick/260929-akj-24-review-r3-r3-wr-01-error-r3-wr-02/) |
| 260929-htw | **24-VERIFICATION-R3 R3-G1(=24-REVIEW-R4 R4-WR-01) 수정** — 부분 거부 뒤 되살아나는 선매수·추가매수 자동 체크 줄을 성공 에코로 확정(lib confirmAutoChecks): 에코에 선 항목만 「켬」, 서버가 눕힌 항목은 「켜지 않음: …(서버 거부)」 · error 레벨. 훅 ⑬ 눕힌 동반(laid) — 대기 추가매수가 서버가 눕힌 매도주문을 다시 싣지 않음(수정 전 재현 확인). F1 폼·카드 흐름 잘못 잠긴 기대값 교정 · 24-UI-SPEC 사유 목록 「서버 거부」 추가. webapp vitest 2835 · tsc green. 미배포 | 2026-09-29 | 0061d51f · 307cc4dd | [260929-htw-24-r3-g1](./quick/260929-htw-24-r3-g1/) |
| 260929-k7u | **24-REVIEW-R5 후속(R5-WR-01 · R5-WR-02 · R5-IN-05)** — 자동 체크 여섯째 사유를 「서버 거부」 에서 원인 중립 「무장 안 됨」 으로 개정(에코 게이트 값=무장 상태라 거부와 발주 소진을 단정하지 않음 · lib 인자 refused→laid · UI-SPEC 닫힌 목록 동기). 훅 ⑬ 흐름 안 확정(답 대기 · 결과 모름 · in-flight) 3케이스로 눕힌 동반 보존 잠금 — 변이 M3~M6 잡힘, M7(queueRef 항)은 도달 불가 상태라 동등 변이로 생존. 코드 동작 변경 0 · webapp 2,838 pass · typecheck green · push/배포 없음 | 2026-09-29 | d07ad591 · c8daa53f | [260929-k7u-24-r5-laidref-r5-wr-01-r5-wr-02](./quick/260929-k7u-24-r5-laidref-r5-wr-01-r5-wr-02/) |
| 35 | 상따 카드 「다른 단말에서 변경」 배너·로그 줄 제거 — (a) 수정하던 값 N개 · (b) 서버 값으로 맞췄어요 둘 다 · onServerEcho·ECHO_BANNER_MS 정리 · vitest trading 1404 · e2e 13·P24-6 green · 미배포 (1a2c9944) | 2026-09-29 | 1a2c9944 | — |
| 36 | VI 설정 줄 「다른 단말에서 변경됨」 고지 제거 — 상따 카드 배너 제거와 짝 · vitest trading 1404 green (92fbebbe) | 2026-09-29 | 92fbebbe | — |
| 37 | 오늘 주문 종목명 누락 — relay 스냅샷에 없는 종목은 stocks 마스터 이름 폴백(ISIN 당 세션 1회) | 2026-09-29 | 829d2729 | — |
| 38 | 크롬 무채색 분홍 끼 — color-mix `in oklch` → `in oklab` 64곳/37파일(Chromium 이 저채도 hue 를 none=0° 로 떨굼 · 헤더 등). WebKit 과 픽셀 일치 · vitest 2823 green | 2026-09-29 | 5aa2dbbe | — |
| 260929-vzy | **후매수 「자동」 체크 (gh-trade dcaa78b1)** — 생성물 2파일 그대로 커밋(동기화 스크립트 미실행 · Phase 25 생성물 보존). shared postBuyAuto(입력 필수) · relay 는 postBuyAuto 있을 때만 buy3_schema=2(없으면 1 — 옛 탭 재전송이 자동을 끄지 않음) · 60/64 에코 디코드(부재 false). 웹: 후매수 스위치 바로 왼쪽 「자동」 체크(에코 표시) · 매수주문 끄면 자동도 끔 · 켜기 사전 검증 · 자동만 켠 등록은 철거 아님 · 로그 「후매수 자동 체크/해제」. relay 731 · webapp 3049 · e2e vzy-1/P24-7 · a11y green. 미배포(relay 먼저 → push) · 이월: 15:40 해제 귀속이 자동만 켠 전략 미집계 | 2026-09-29 | 127c1028 · fb175921 · d261c8d0 · bf36a28f · eac3a60e · b8db4c3c · 25ba301d | [260929-vzy-post-buy-auto-checkbox-relay-webapp](./quick/260929-vzy-post-buy-auto-checkbox-relay-webapp/) |
| 260930-e73 | **OrderGroup 7 수동 · 8 VI 표시 (gh-trade-82 계약)** — shared 표시명 7「수동」·8「VI」 · 방향은 group+kind(`strategyEventSide`: 8 매수 · 7 은 kind 6 매도 · 3/4/5/7 매수 · 그 밖 null) · 조건 비면 「수동 주문」/「VI 자동주문」 · 펼침 접두 중복 제거 · 진행률 보조행 7/8 라벨. relay·DB 무변경(통과 테스트만). 필터 칩 미추가(사용자 결정 대기) · 펼침 빈 상태 문구 후속. 미배포(gh-trade 배포 전 무해) | 2026-09-30 | 6d3ce955 · 404b1ae1 · 5a056b39 | [260930-e73-ordergroup-7-8-vi](./quick/260930-e73-ordergroup-7-8-vi/) |
| 260930-e30 | **사이드바 아이콘 레일 접기 + 스크롤 헤더 원형 햄버거** — lg 헤더 PanelLeft 토글(햄버거 자리)로 240↔64 레일 · localStorage 영속 · head 인라인 스크립트로 첫 페인트 전 복원 · 레일=아이콘만+트레이딩 켜진 전략 수 배지+하단 세로 쌓기(드로어 무영향). 폰(<lg)·앱은 창 스크롤>8 이면 헤더 배경·로고·검색이 빠지고 햄버거만 좌·상 8px 반투명 원형으로 뜸(상단에서만 헤더 · 드로어 열림/포커스 시 강제 표시 · 앱 상태바 띠 흐림 유지). 목업 채택안 A·상단전용. 미push | 2026-09-30 | 394bf0f0 · 0df77a97 · b69716c6 | [260930-e30-sidebar-collapse-scroll-header](./quick/260930-e30-sidebar-collapse-scroll-header/) |
| 47 | 주문로그 구분 필터 「수동」(group 7)·「VI」(group 8) 칩 추가 + 오늘주문 펼침 빈 상태 「주문 기록 없음」 | 2026-09-30 | 5bbb124c | — |
| 260930-fi4 | **gh-trade a09dfc8b 동기화 — 83 first_filled · 추가매수 포기 수량 · OrderGroup 7/8** — 생성물 4파일(SYNC d303fe9f · buy_watch_side 슬롯 24 봉인 동반 → relay 상수 "0") · relay 83 firstFilled 파서·hub 통과 · 60/64/11.2 extraBuyAbandonQty 디코드(C→S 미적재) · 웹 보조행 「{그룹} · N주 / 0주 / 체결 시작」(막대 고정) · 전략 로그 「추가매수 포기 · 최대 초과 N」. 배포 대기(relay 먼저 → push → gh-trade 120) · 후속: buyWatchSide 죽은 필드 · lc.arm latch "buy" 관용 제거 | 2026-09-30 | 5b29b842 · 5fa405d8 · 3aac9a27 | [260930-fi4-83-first-filled-ordergroup-7-8-relay](./quick/260930-fi4-83-first-filled-ordergroup-7-8-relay/) |
| 260930-lm7 | **오늘주문 신규 상장 종목명 — ISIN 대신 이름** — 원인: 오늘 상장 종목은 master-sync(08:10 · 전 영업일 KRX) 전이라 `stocks.isin` 이 비어 있음(intraday-sync bootstrap 은 code·name 만). `fetchStockNames` 가 isin 미해결 보통주 ISIN 만 단축코드로 한 번 더 조회(우선주 제외). 오늘주문 · 주문로그 공통. 세션 초 조회 실패(상장 전 bootstrap 전)는 null 캐시라 새로고침 필요 | 2026-09-30 | 359c755b · 1f21acff · 6adaa5ef | [260930-lm7-isin](./quick/260930-lm7-isin/) |
| 260930-lq5 | **카드 주문로그 · 전략로그 → 버튼 + 한 종목 팝업** — 카드 탭은 정보 · 미체결 · 잔고만, 오른쪽 「주문로그(새 줄 배지)」 · 「전략로그」 버튼이 그 카드 종목 · 거래소 · 계좌 전용 다이얼로그를 연다(목업 v2 A). 주문로그 = 요약 한 줄 · 구분 필터 · 6열 표(시각 · 주문번호 뒤 4자리 · 구분 · 행위 · 내용 · 누적) · 위→아래 시간 흐름 · 창 분리 유지. 전략로그 = 시각 · 내용 · 오류만. 폰(<640) 전체 화면 두 줄 행. VI/돌파 알림 탭 → 정보. 공용 패널은 그대로 | 2026-09-30 | a4b45562 · 4d7683ff · 529af3e4 | [260930-lq5-log-popup](./quick/260930-lq5-log-popup/) |
| 261001-bnc | **홈 급등 신선도를 `stock_quotes.rate_updated_at` 으로 분리** — 원인: 10/1 00:28 KST 종목상세 on-demand ka10001 upsert 가 전일 스냅샷(동일스틸럭스 023790 +29.99%)에 `updated_at=now` 를 찍어 home-sync `updated_at >= KST 자정` 필터 통과 → 08:00~08:04 급등 노출(KRX 전용이라 NXT 프리마켓 STEP1 이 덮지 못함). 잠재 경로: STEP2 hot set(관심종목)이 `updated_at` 만 갱신. 수정: nullable `rate_updated_at` 컬럼(백필 없음) · STEP1 만 스탬프(STEP2 제외) · server on-demand upsert 는 KRX 거래일 08:00~20:00 창 안에서만(`isQuoteSessionWindow`) · loadSurges 필터 교체. 배포 대기: db push → intraday-sync·server → home-sync 순 | 2026-10-01 | f0cff839 · 51d0b94f | [261001-bnc-home-sync-rate-updated-at](./quick/261001-bnc-home-sync-rate-updated-at/) |
| 51 | 사이드바 메뉴 순서 교체 — AI 애널리스트를 My page 위로 | 2026-09-30 | 72c1fb5b | — |
| 52 | 다크 토큰 청색 틴트 제거(무채색화) | 2026-09-30 | 9e14b49a | — |
| 53 | 다크 면 사다리 한 단계 하향(토스 홈 스케일) | 2026-09-30 | f60c6905 | — |
| 54 | 다크 면 사다리 두 단계 하향(목업 C 채택) | 2026-09-30 | bfc900e3 | — |
| 261001-dyi | 작업대 종목카드 접힘 시 시세 구독 FULL→PRICE 강등 · 펼치면 FULL 승격 + relay 같은 소켓 승격에 캐시 호가 스냅샷 선송신 (relay 배포 → push 순서) | 2026-10-01 | 3de6aab5 | [261001-dyi-full-price-full](./quick/261001-dyi-full-price-full/) |
| 55 | 종목 카드 「전략로그」 버튼 라벨 → 「로그」 | 2026-10-01 | 3aeb02c0 | — |
| 58 | 종목카드 호가/체결 톤 다운 — 체결 플래시 3%·1단 현재가 행 배경 한 단계 낮춤·매도1/매수1 경계선 일직선 (fa31efea) | 2026-10-01 | fa31efea | — |
| 261001-gjk | 상따 매도 열 — 가격 섹션과 매도주문 카드 합치기(주문가격·비교가격·매도비율·매수잔량·잔량추적·체결) | 2026-10-01 | 980ab8db | [261001-gjk-sell-card-merge](./quick/261001-gjk-sell-card-merge/) |
| 261002-fim | 상따 후매수 잠금 해제선 `post_buy_unlock_qty` 종단 — gh-trade 259bc869 생성물 재동기화(vtable 136) · relay 60/64 파서(C→S 미적재) · shared 런타임 7/S→C 12 · 웹 「발동잔량」 칸(펼침·접힘): 발동잔량 0 이고 해제선 > 0 이면 회색 + sr 「잠금 해제선」. 서버 미배포 동안 0. relay 배포 → push 순서 | 2026-10-02 | 단일 커밋(코드+문서) | [261002-fim-post-buy-unlock-qty-relay-shared-hub](./quick/261002-fim-post-buy-unlock-qty-relay-shared-hub/) |
| 61 | 교보 VPN 감시 타이머 탐침 112→119 (radar-gw 재설치·재기동, 119:22 도달 확인) | 2026-10-03 | 단일 커밋 | — |
| 261003-rc4 | 버스트 상한가 후속 (gh-trade quick-261003-phd) — 생성물 재동기화(SYNC 26b3493e · BurstLimit 10 · burst_upper_limit · extra_buy_burst_release vtable 138 · BulkSellReq 40) · 주문로그 kind 10 「버스트 상한가 · 조각 N · 합계 M주」(shared 시세 이벤트 판정 + 조회 RPC 가시성 (1,2,10) 마이그레이션 20261003120000 · pgTAP 28) · 추가매수 「☐버스트 시 해제」 양방향(relay buy3_schema 3 = postBuyAuto+burst 둘 다 실릴 때만) · 상따 호가창 「버스트」 겹침 표식(relay `bul`). 배포 순서 DB → relay → push | 2026-10-03 | 648e7892·dc439352·6181ee5d·4b328171 | [261003-rc4-burst-limit-followup](./quick/261003-rc4-burst-limit-followup/) |

## Session Continuity

**Resume file:** None

Last session: 2026-10-01T03:30:00Z
Stopped at: Phase 20 complete, ready to plan Phase 19
Next: **Phase 17 은 12/12 plan 실행 + 프로덕션 배포까지 완결됐다.** 전량 게이트 green(루트 typecheck · relay **467** · webapp **998**(+1 skip) · shared **108** · Playwright **135 pass · 0 fail** · 재동기화 `--check` 차이 0), 프로덕션 `ef1499a` · smoke 12 PASS. **남은 것은 실기 관측 1건이다.**

- **① D-25 실기 관측 (WINDOWS #17 · 배포해도 닫히지 않는다).** 래치 36/37/38 왕복과 76/77/78 드롭 0 을 아직 한 번도 보지 못했다. 두 경로 중 하나: **(a) 다음 장중(평일 08:00~20:00 KST)에 상따 화면에서 LED 를 눌러 색 전환을 관측**하거나, **(b) `sudo xcodebuild -license` 동의 후 gh-trade HEAD 를 빌드해 mock 왕복 관측**. 관측되면 **TRADE-04 · TRADE-05 를 Complete 로 재판정**한다.
- **② `sudo xcodebuild -license` 동의** — D-25 실기 검증(WINDOWS #17) 재개용. **배포해도 이 항목은 닫히지 않는다.**
- **TRADE-04 · TRADE-05 는 Pending 유지** — 배포는 (부분)했지만 래치 36/37/38 실기 왕복은 여전히 미관측이고, 일요일이라 실거래 관측도 불가했다. 기준을 바꾸지 않았다.
- **WINDOWS:** open 4건 — #9·#10·#11(Phase 16 승계) · **#17(D-25 미수행)**. #12·#14·#15·#16 은 이번에 닫았다(#16 은 사용자 육안 승인).

- **Phase 16 승계 항목 3건 (여전히 유효).**
- **① smoke `INV-9` 프로덕션 첫 실행 미수행.** `SMOKE_AUTH_TOKEN`(브라우저 로그인 `access_token`, 약 1시간 만료)이 있어야 16-21 재작성 이후 첫 실행이 된다. 저장소 어디에도 값이 없는 것이 정상이다(T-16-74). 명령은 `deferred-items.md` §16-46. **이것은 TRADE-03 조항의 결손이 아니라 프로브의 미실행이다** — 섞어 적지 말 것.
- **② `/healthz` 알림 정책 — 사용자 결정 대기.** `gh-radar-relay-down` 은 게이트웨이가 붙어 있는 지금(`stalledCount: 0`)은 조용하지만, 끊기면 세션 생성 5분 뒤 503 이 상시화된다. 해법 후보 4개는 `deferred-items.md` §16-35. 실행자가 단독으로 고를 문제가 아니다.
- **③ 다른 세션과의 정합.** WireGuard 작업(`quick-260909-t08` 계열)이 방화벽 규칙을 4개로 늘려 smoke `INV-2` 문구가 바뀌었다. `REQUIREMENTS.md` RELAY-03 의 「방화벽 3규칙」과 어긋나므로 그 세션이 정합을 맡는다.
