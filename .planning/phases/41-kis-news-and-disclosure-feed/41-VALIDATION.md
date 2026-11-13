---
phase: "41"
slug: "kis-news-and-disclosure-feed"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-11"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 출처: `41-RESEARCH.md` §Validation Architecture. 요구사항 ID 가 없는 phase 라 성공 기준(SC-1 ~ SC-7 · `41-CONTEXT.md` §specifics)과 D-19 로 추적한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest — 새 워커 `workers/kis-news-sync` ^3(news-sync 와 같음) · server ^4.1.4(node) · shared ^4.1.4 · webapp ^2.1.9(jsdom) · home-sync 기존 설정 + pgTAP(로컬 일회용 Postgres 컨테이너 `public.ecr.aws/supabase/postgres:17.6.1.104`) |
| **Config file** | `server/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` · 새 `workers/kis-news-sync/vitest.config.ts`(Wave 0 가 만든다) · pgTAP 러너 `scripts/verify-dma-orders-price-check.sh --test <file>` |
| **Quick run command** | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/<file>.test.ts --maxWorkers=2`(패키지별 단일 파일) · DB 는 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql`(D-19 묶음 때 `pnpm --filter @gh-radar/home-sync exec vitest run --maxWorkers=2` 추가) |
| **Estimated runtime** | 단일 파일 ≤ 15초 · 41-09 Task 1 실측(2026-11-12): shared 3.5초 · 수집기 1.2초 · server routes+middleware 8.4초 · webapp 4디렉터리 78초 · pgTAP 2파일 각 1분 안팎(컨테이너 기동 포함) |

---

## Sampling Rate

- **After every task commit:** 그 태스크 파일 단위 `exec vitest run <파일> --maxWorkers=2` · DB 태스크는 pgTAP 1파일.
- **After every plan wave:** 건드린 패키지 `exec vitest run --maxWorkers=2` + pgTAP `kis_news.test.sql` — 전체 회귀는 한 세션만 돌린다(동시 세션 메모리 고갈 규칙).
- **Before `/gsd-verify-work`:** Full suite green + 배포 뒤 운영 확인(아래 Manual-Only 표).
- **Max feedback latency:** 단일 파일 ≤ 15초.

---

## Per-Task Verification Map

보안 검사는 사용자 결정으로 생략(`security_enforcement: false`) — Threat Ref 는 「—」. 태스크 ID = `41-<플랜>-<태스크>`(2026-11-11 plan-phase 확정 · 같은 날 checker 수정으로 41-06 을 41-06 · 41-12 · 41-13 으로, 41-04 의 server 태스크를 41-14 로 나눔 — 41-08 은 웨이브 4). 41-09 Task 1 이 File Exists · Status 를 실제 결과로 바꾼다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 41-01 | 1 | SC-1 · SC-3 · D-03 · D-04 · D-13 | — | 들여오기 · 묶음 조회 RPC 서비스롤 전용 · 표 RLS 정책 0 | tracer(pgTAP + route) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/news-by-stock.test.ts --maxWorkers=2` — 같은 일련번호 두 번 → 1행 · 같은 날 수정본 1행 · 다음 날 2행 · 조회 코드 연결 · 수집 시각 · 등록 60초 · 입력 순서 · 수집 전 null · 400 | ✅ | ✅ green |
| 41-01-02 | 41-01 | 1 | SC-2 · D-12 · D-14 | — | N/A | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/stock-feed.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/news-by-stock.test.ts --maxWorkers=2` — 제목 키 · 15자 앞부분 · 12시간 · 시각 이른 쪽 · 링크 · 요약문은 네이버 · id 불변 · 정렬 | ✅ | ✅ green |
| 41-02-01 | 41-02 | 2 | SC-1 · SC-7 · D-05 · D-06 · D-10 | — | 7개 RPC 서비스롤 전용 · 토큰 표 RLS | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news_collector.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql` — 임대 · 대상 · 정리 · 공시 종류 묶음 · 운영 수치 | ✅ | ✅ green |
| 41-02-02 | 41-02 | 2 | SC-4 · SC-5 · D-01 · D-02 | — | 비밀 주입 비출력 · 셸 추적 없음 · server 배포에 한투 비밀 없음 | static | `bash -n` 5파일 · 실행 권한 · `bash scripts/deploy-kis-news-sync.sh --self-test` · `--max-retries=0` · `--task-timeout=14h` (41-02 Task 2 verify 그대로 · OPS-OK) | ✅ | ✅ green |
| 41-03-01 | 41-03 | 2 | SC-3 · SC-4 | — | 인증 없는 조회 — 전용 제한기 · 5초 캐시 · 입력 검증 400 | route | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/news-by-stock.test.ts tests/middleware/rate-limit.test.ts --maxWorkers=2` | ✅ (케이스 추가) | ✅ green |
| 41-03-02 | 41-03 | 2 | SC-3 · D-21 | — | N/A | static(노트) | 41-03 Task 2 verify(NOTE-OK — 인박스 파일 · 필수 문구 · phase 사본) | ✅ | ✅ green |
| 41-14-01 | 41-14 | 2 | SC-2 · SC-5 | — | 새로고침은 네이버만 | route | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/news.test.ts --maxWorkers=2` — 조회 · 새로고침 응답이 합친 목록 · before 커서 | ✅ (케이스 추가) | ✅ green |
| 41-04-01 | 41-04 | 2 | SC-6 · D-16 · D-20 | — | 텍스트로만 렌더 | RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/stock/__tests__/news-item.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck` — 배지 · 링크 없는 줄 · ↗ 는 링크 줄만 · 자료원 항상 | ✅ | ✅ green |
| 41-04-02 | 41-04 | 2 | SC-6 · D-16 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/stock/__tests__/stock-detail-client.test.tsx src/components/trading/__tests__/stock-info-modal.test.tsx src/components/stock/__tests__/news-item.test.tsx --maxWorkers=2` — 「관련 뉴스·공시」 문구 | ✅ (문구 갱신) | ✅ green |
| 41-05-01 | 41-05 | 3 | SC-6 · D-04 · D-17 | — | N/A | unit/RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/use-stock-feed.test.tsx src/lib/__tests__/format-feed-time.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck` — 10초 · 100코드 묶음 · 숨김 정지 · 새 글 30초 · 타이머 1개 | ✅ | ✅ green |
| 41-05-02 | 41-05 | 3 | SC-6 · D-17 · D-20 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/feed-rows.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` — 돌파 배지 · 행 선택 상세 · 「추가」 는 카드 | ✅ (케이스 추가) | ✅ green |
| 41-06-01 | 41-06 | 2 | SC-5 | — | 실측 표본에 토큰 · 키 문자열 0 · 한 벌만 | static + typecheck | `test -f workers/kis-news-sync/tests/fixtures/kis-news-title-sample.json && test ! -e .planning/phases/41-kis-news-and-disclosure-feed/reference/kis-news-title-probe-result.json && grep -q "kis-news-sync" pnpm-lock.yaml && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync run typecheck` — 골격 · `KisNewsTitleRow` · 픽스처 이동(SKELETON-OK) | ✅ | ✅ green |
| 41-06-02 | 41-06 | 2 | SC-5 · D-01 | — | 로그 비밀 가림(redact) · 필수 비밀 오류에 값 없음 | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/config.test.ts tests/logger.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` — env 계약 · 초당 상한 1 ~ 15 · 비밀 값 출력 없음 | ✅ | ✅ green |
| 41-12-01 | 41-12 | 3 | D-09 | — | N/A | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/etp.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/shared run typecheck` — ETP 그룹 · 이름 · 스팩 제외 · null | ✅ | ✅ green |
| 41-12-02 | 41-12 | 3 | SC-1 · D-07 · D-09 · D-11 | — | N/A | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/classify.test.ts tests/ingest.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` — 실측 표본 분류 · 파생 안내 · ETP · 작성 시각 | ✅ | ✅ green |
| 41-13-01 | 41-13 | 3 | SC-1 · SC-5 · D-01 | — | 오류 로그는 안전 필드만(헤더 · 키 없음) | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/classifyError.test.ts tests/newsTitle.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` — 오류 코드별 분류 · 커서 페이징 | ✅ | ✅ green |
| 41-13-02 | 41-13 | 3 | SC-5 · D-01 | — | 로그에 토큰 · 시크릿 없음 · 발급 61초 가드 · 임대 보유자만 발급 | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/token.test.ts tests/classifyError.test.ts tests/newsTitle.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` — 토큰 재사용 · 1시간 전 재발급 · 61초 가드 | ✅ | ✅ green |
| 41-07-01 | 41-07 | 4 | SC-6 · D-18 · D-20 | — | N/A | RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/card-news-strip.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck` — 띠 상태 6종 | ✅ | ✅ green |
| 41-07-02 | 41-07 | 4 | SC-6 · D-18 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx src/components/trading/__tests__/card-news-strip.test.tsx --maxWorkers=2` — 펼친 카드에만 띠 · 회귀 0 | ✅ (케이스 추가) | ✅ green |
| 41-08-01 | 41-08 | 4 | SC-1 · SC-4 · D-02 | — | N/A | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/cadence.test.ts tests/scheduler.test.ts tests/budget.test.ts tests/schedule.test.ts --maxWorkers=2` — 빠른 창 `07:00` · `20:00` 경계 · 주말 · 초당 상한 · 새 등록 먼저 · Scheduler 정합 | ✅ | ✅ green |
| 41-08-02 | 41-08 | 4 | SC-1 · SC-4 · SC-5 · D-01 · D-05 · D-06 | — | 로그에 토큰 없음 · 임대 보유자만 발급 | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/collector.test.ts tests/targets.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run build` — 임대 · 모드 · 오류 처리 · 예산 · 정리 | ✅ | ✅ green |
| 41-09-01 | 41-09 | 5 | SC-4 · SC-5 | — | server 에 한투 호출 경로 · 비밀 없음 | static + 회귀 | 41-09 Task 1 verify(PREDEPLOY-OK — news-sync 무변경 · `news_articles` 무변경 · server 한투 grep 0 · pgTAP 2 · self-test) | ✅ (명령) | ✅ green |
| 41-09-02 | 41-09 | 5 | SC-1 ~ SC-5 | — | [BLOCKING] 스키마 push · 비밀 사용자 `!` | manual(메인 세션) | `supabase migration list --linked` — 두 버전 Remote | ✅ (41-09 SUMMARY 02:55 KST Local · Remote) | ✅ green |
| 41-09-03 | 41-09 | 5 | SC-6 · D-15 ~ D-18 · D-20 | — | N/A | manual UAT | UAT-SIGNED | ✅ (사용자 「됐다」 2026-11-12) | ✅ green |
| 41-10-01 | 41-10 | 6 | D-19 | — | N/A | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/home-sync exec vitest run src/pipeline/loadSurges.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/home-sync run typecheck` — 합친 피드 · 공시 먼저 · ETP 단일 정의 | ✅ (케이스 추가) | ✅ green |
| 41-10-02 | 41-10 | 6 | D-19 | — | 인덱스 → 원문(환각 방지) | unit | `pnpm --filter @gh-radar/home-sync exec vitest run src/ai/prompt.test.ts src/ai/clusterSurges.test.ts src/pipeline/loadSurges.test.ts --maxWorkers=2` — `[공시]` 줄 · null url 중복 제거 · stop_reason 로그 | ✅ (케이스 추가) | ✅ green |
| 41-10-03 | 41-10 | 6 | SC-6(④) · D-19 · D-20 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/home/__tests__/news-block.test.tsx src/components/home/__tests__/theme-card.test.tsx src/components/home/__tests__/solo-card.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/server run typecheck` | ✅ (케이스 추가) | ✅ green |
| 41-UAT-1 | 41-09 보정 | 5 | SC-6 · D-09 | — | N/A | unit + pgTAP | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/classify.test.ts --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --until 20261112200000 --with supabase/tests/fixtures/41_auto_market_pre.sql --with supabase/migrations/20261112300000_kis_news_auto_market_hidden.sql --with supabase/migrations/20261112310000_kis_news_auto_market_supply.sql --test supabase/tests/kis_news_auto_market.test.sql` — 시세 · 시황 · 목록 · 수급 자동 기사 auto_market · 소급(8907a59a · dd4bd44b) | ✅ | ✅ green |
| 41-UAT-2 | 41-09 보정 | 5 | SC-6 · D-12 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/market-summary.test.ts src/__tests__/stock-feed.test.ts --maxWorkers=2` — 지수 얘기뿐인 시황 제목을 합치기에서 제외(0bc17a9d) | ✅ | ✅ green |
| 41-UAT-3 | 41-09 보정 | 5 | SC-6 · SC-2 | — | stock_title_needles · 별칭 표 서비스롤 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_feed_naver_title.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_title_aliases.test.sql` — 네이버 뉴스는 제목에 종목명(별칭 포함) 있는 기사만(95607989 · 2affd1f2) | ✅ | ✅ green |
| 41-11-01 | 41-11 | 7 | D-19 | — | N/A | manual(메인 세션) | `git fetch origin master --quiet && test "$(git rev-parse master)" = "$(git rev-parse origin/master)"` | — | ✅ green |
| 41-11-02 | 41-11 | 7 | SC-7 · D-10 · D-19 · SC-1 · SC-4 | — | N/A | manual(하루 뒤) | NEXT-DAY-RECORDED | — | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**41-09 Task 1 실측 (2026-11-12 · HEAD `132bdf97`):**

- 정적 게이트: `git diff --stat e951de6e..HEAD -- workers/news-sync` 빈 출력 · 두 마이그레이션 본문(주석 제외)에 `news_articles` 를 고치거나 지우는 문장 0(조회 `FROM public.news_articles` 1곳뿐) · `server/src` · `scripts/deploy-server.sh` 에 한투 경로 · env · Secret 0.
- 회귀: shared 47 파일 · 1276 통과(2 skip) · 수집기 13 파일 · 188 통과 · 수집기 typecheck · build 통과 · server typecheck 통과 · server `tests/routes tests/middleware` 33 파일 · 719 통과 · webapp typecheck 통과 · webapp `src/components/stock src/components/trading src/lib src/components/home` 155 파일 · 4383 통과(1 skip) · pgTAP `kis_news.test.sql` 61/61 · `kis_news_collector.test.sql` 84/84 · `deploy-kis-news-sync.sh --self-test` SELF-TEST OK(schedulers=3 · 14h · 재시도 0 · 초당 5).
- 41-02-02 OPS(문법 · 실행 권한 · 셸 추적 없음 · 리터럴) · 41-03-02 NOTE(gh-trade 인박스 `261112-kis-news-by-stock.md` 필수 문구 · TODO 0 · phase 사본) · 41-06-01(픽스처 · 원본 사본 없음 · lockfile) 도 따로 확인.
- 간헐 실패 1건(이 phase 무관): server 첫 실행에서 `tests/routes/ticks.test.ts` ③ 이 `/api/ticks/open?d=20261014&ex=KRX` 에 400 대신 404 — 같은 명령 재실행 719/719 · 파일 단독 34/34 통과. 이 phase 는 `ticks` 라우트 · 테스트를 건드리지 않았고, 바꾼 `app.ts` 마운트 · 전역 제한기 skip 은 404 경로와 무관. 같은 시각 다른 세션 vitest 가 돌고 있었다.

---

## Wave 0 Requirements

- [x] `workers/kis-news-sync/` 패키지 골격 + `vitest.config.ts` — `workers/kis-news-sync/package.json` · `workers/kis-news-sync/vitest.config.ts`(41-06)
- [x] `workers/kis-news-sync/tests/fixtures/kis-news-title-sample.json` — 실측 표본(41-06). 보존 사본 `reference/kis-news-title-probe-result.json` 은 저장소에 없다(한 벌만 — 메인 체크아웃에도 없음 확인 2026-11-12)
- [x] `supabase/tests/kis_news.test.sql`(61) · `supabase/tests/kis_news_collector.test.sql`(84)
- [x] `packages/shared/src/__tests__/stock-feed.test.ts`
- [x] `server/tests/routes/news-by-stock.test.ts`
- [x] `webapp/src/components/stock/__tests__/news-item.test.tsx` · `webapp/src/lib/__tests__/use-stock-feed.test.tsx` · `webapp/src/lib/__tests__/format-feed-time.test.ts` · `webapp/src/components/trading/__tests__/feed-rows.test.tsx` · `webapp/src/components/trading/__tests__/card-news-strip.test.tsx`
- [x] `scripts/kis-news-report.sh`(`kinds` · `stats`) + RPC `kis_disclosure_kinds` · `kis_news_ops_stats`(`supabase/migrations/20261112200000_kis_news_collector.sql` ⑥ · ⑦ — 41-02 · RESEARCH 의 `.sql` 단독 파일 대신 원격 SQL 실행 수단이 없어 RPC + 스크립트로)
- [x] 스모크 스크립트: `scripts/smoke-kis-news-sync.sh`(INV-1 probe — 41-02 · 문법 · 실행 권한 확인). Cloud Run 발신 한투 1회 **실행**은 키 주입 · 배포 뒤 41-09 Task 2(Manual — 41-09-02 행)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 웹 네 자리가 채택 목업대로 보인다(폭 390 · PC · 상따 본문 폭 4밴드) | SC-6 | 시각 대조 | ① ~ ③ 은 41-09 Task 3 · ④ 는 41-11 Task 2 — `reference/mockup-news-disclosure-web.html` 과 운영 화면을 나란히 대조 |
| 수집 하루 뒤 공시 종류 목록을 사용자에게 보여 주고 더 뺄 종류를 확인 | SC-7 (D-10) | 사용자 판단 | 41-11 Task 2 — `bash scripts/kis-news-report.sh kinds 1` 결과를 일상어 목록으로 제시 · 결과: 2026-11-13 하루 공시 403건(보임 211 · ETF 숨김 156 · 파생 안내 숨김 36)을 10개 묶음으로 제시 → 사용자 「숨기고 싶은 종류 없음」(규칙 변경 없음) |
| 평일 빠른 시간대에 새 글이 10초 안팎에 들어온다 · 수집기가 한 개만 돈다 | SC-1 | 운영 데이터 필요 | 41-11 Task 2 — `bash scripts/kis-news-report.sh stats 1`(지연 중앙값 15초 이하 목표) · 「lease acquired」 로그 1번 · 결과: 2026-11-13 공시 지연 중앙 3.3초 · 90% 5.5초(뉴스 중앙 16.5초) · `07:00` ~ `20:00` 임대를 잡은 실행 1개(gh-radar-kis-news-sync-9hzvn, 20:00 「fast window end」 정상 종료) |
| 당일 호출 수가 카운터에 남고 예산 안 | SC-4 | 운영 데이터 필요 | 41-09 Task 2 · 41-11 Task 2 — `stats` 의 `usage_today`(`api_usage` `kis_news_title`) · 한도 의심 표시 0 · 결과: 2026-11-13 `usage_today` 91,179(자체 상한 200,000 의 46%) · 한도 의심 표시 0 |
| gh-trade 클라가 종목 묶음 조회로 받는다 | SC-3 · D-21 | 다른 저장소 클라 | 41-09 Task 2 `curl` 응답 형태 · 지연 · collectedAt 변화 + 41-03 노트 · gh-trade 세션 확인 |
| 홈 AI 요약 하루 호출 수 배포 전후 비교 | D-19 | 운영 데이터 필요 | 41-11 Task 1(기준선 · 평일 3일) · Task 2(배포 다음 평일) — 「home-sync cycle complete」 의 `claudeCalled=true` 수 · 결과: 기준선(11/9 427 · 11/10 500 · 11/11 507) 평균 478 → 배포 다음 평일 11/13 463(−3%) · 463회 모두 end_turn · 출력 1,598,048 토큰(Haiku 5.5 $0.50/MTok ≈ $0.80/일) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-11-12 — 41-09 Task 3 화면 UAT 통과(사용자 「됐다」, 폰 · PC). 2026-11-13 — 41-11 Task 2: ④ 홈 「공시」 배지 사용자 「됨」 · D-10 「없음」 · 토큰 알림톡 1회 · D-19 호출 수 −3%

## Validation Audit 2026-11-13

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Rows re-run green | 6 |
| Rows added | 3 |
