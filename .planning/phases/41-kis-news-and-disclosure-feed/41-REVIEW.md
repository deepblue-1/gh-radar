---
phase: 41-kis-news-and-disclosure-feed
reviewed: 2026-11-13T11:40:59Z
depth: standard
files_reviewed: 107
files_reviewed_list:
  - packages/shared/src/__tests__/etp.test.ts
  - packages/shared/src/__tests__/home.test.ts
  - packages/shared/src/__tests__/market-summary.test.ts
  - packages/shared/src/__tests__/stock-feed.test.ts
  - packages/shared/src/etp.ts
  - packages/shared/src/home.ts
  - packages/shared/src/index.ts
  - packages/shared/src/market-summary.ts
  - packages/shared/src/stock-feed.ts
  - scripts/deploy-kis-news-sync.sh
  - scripts/kis-news-report.sh
  - scripts/setup-kis-news-sync-iam.sh
  - scripts/setup-kis-secrets.sh
  - scripts/smoke-kis-news-sync.sh
  - server/src/app.ts
  - server/src/middleware/rate-limit.ts
  - server/src/routes/news-by-stock.ts
  - server/src/routes/news.ts
  - server/src/schemas/news-by-stock.ts
  - server/tests/middleware/rate-limit.test.ts
  - server/tests/routes/news-by-stock.test.ts
  - server/tests/routes/news.test.ts
  - supabase/migrations/20261112100000_kis_news_feed.sql
  - supabase/migrations/20261112200000_kis_news_collector.sql
  - supabase/migrations/20261112300000_kis_news_auto_market_hidden.sql
  - supabase/migrations/20261112310000_kis_news_auto_market_supply.sql
  - supabase/migrations/20261112320000_stock_feed_naver_title_name.sql
  - supabase/migrations/20261112340000_stock_title_aliases.sql
  - supabase/tests/fixtures/41_auto_market_pre.sql
  - supabase/tests/kis_news.test.sql
  - supabase/tests/kis_news_auto_market.test.sql
  - supabase/tests/kis_news_collector.test.sql
  - supabase/tests/stock_feed_naver_title.test.sql
  - supabase/tests/stock_title_aliases.test.sql
  - webapp/e2e/specs/news.spec.ts
  - webapp/e2e/specs/stock-detail.spec.ts
  - webapp/src/components/home/__tests__/news-block.test.tsx
  - webapp/src/components/home/__tests__/theme-card.test.tsx
  - webapp/src/components/home/news-block.tsx
  - webapp/src/components/home/theme-card.tsx
  - webapp/src/components/stock/__tests__/news-item.test.tsx
  - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
  - webapp/src/components/stock/feed-kind-badge.tsx
  - webapp/src/components/stock/news-empty-state.tsx
  - webapp/src/components/stock/news-full-list.tsx
  - webapp/src/components/stock/news-item.tsx
  - webapp/src/components/stock/news-view.ts
  - webapp/src/components/stock/stock-news-section.tsx
  - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
  - webapp/src/components/trading/__tests__/card-news-strip.test.tsx
  - webapp/src/components/trading/__tests__/feed-rows.test.tsx
  - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/card/card-news-strip.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/feed/feed-rows.tsx
  - webapp/src/components/trading/feed/stock-feed-context.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/lib/__tests__/format-feed-time.test.ts
  - webapp/src/lib/__tests__/use-stock-feed.test.tsx
  - webapp/src/lib/format-feed-time.ts
  - webapp/src/lib/news-by-stock-api.ts
  - webapp/src/lib/stock-api.ts
  - webapp/src/lib/use-stock-feed.ts
  - webapp/src/styles/globals.css
  - workers/home-sync/src/ai/clusterSurges.test.ts
  - workers/home-sync/src/ai/clusterSurges.ts
  - workers/home-sync/src/ai/prompt.test.ts
  - workers/home-sync/src/ai/prompt.ts
  - workers/home-sync/src/pipeline/loadSurges.test.ts
  - workers/home-sync/src/pipeline/loadSurges.ts
  - workers/kis-news-sync/Dockerfile
  - workers/kis-news-sync/package.json
  - workers/kis-news-sync/src/apiUsage.ts
  - workers/kis-news-sync/src/collector.ts
  - workers/kis-news-sync/src/config.ts
  - workers/kis-news-sync/src/index.ts
  - workers/kis-news-sync/src/kis/client.ts
  - workers/kis-news-sync/src/kis/newsTitle.ts
  - workers/kis-news-sync/src/kis/token.ts
  - workers/kis-news-sync/src/kis/types.ts
  - workers/kis-news-sync/src/logger.ts
  - workers/kis-news-sync/src/pipeline/cadence.ts
  - workers/kis-news-sync/src/pipeline/classify.ts
  - workers/kis-news-sync/src/pipeline/ingest.ts
  - workers/kis-news-sync/src/pipeline/scheduler.ts
  - workers/kis-news-sync/src/pipeline/targets.ts
  - workers/kis-news-sync/src/retention.ts
  - workers/kis-news-sync/src/services/supabase.ts
  - workers/kis-news-sync/tests/budget.test.ts
  - workers/kis-news-sync/tests/cadence.test.ts
  - workers/kis-news-sync/tests/classify.test.ts
  - workers/kis-news-sync/tests/classifyError.test.ts
  - workers/kis-news-sync/tests/collector.test.ts
  - workers/kis-news-sync/tests/config.test.ts
  - workers/kis-news-sync/tests/fixtures/kis-news-title-sample.json
  - workers/kis-news-sync/tests/ingest.test.ts
  - workers/kis-news-sync/tests/logger.test.ts
  - workers/kis-news-sync/tests/newsTitle.test.ts
  - workers/kis-news-sync/tests/schedule.test.ts
  - workers/kis-news-sync/tests/scheduler.test.ts
  - workers/kis-news-sync/tests/targets.test.ts
  - workers/kis-news-sync/tests/token.test.ts
  - workers/kis-news-sync/tsconfig.json
  - workers/kis-news-sync/vitest.config.ts
findings:
  critical: 2
  warning: 11
  info: 19
  total: 32
  necessity: 1
status: issues_found
---

# Phase 41: Code Review Report

**Depth:** standard · **Files reviewed:** 107 · 영역별 리뷰어 셋의 합본(ID 대역: A 01 ~ 29 · B 30 ~ 59 · C 60 ~ 89). 범위는 phase 작업 커밋 + 41-09 UAT 보정 커밋 5개(8907a59a · dd4bd44b · 0bc17a9d · 95607989 · 2affd1f2), 잠금 파일 제외.

## Summary

### 슬라이스 A — workers/kis-news-sync · 운영 스크립트

한투 뉴스·공시 수집기(`workers/kis-news-sync`)의 장기 실행 루프 · 임대 · 토큰(61초 가드) · 초당 상한 버킷 · 빠른 창 판정 · 예산/한도 의심 · 분류/들여오기와, 배포 · IAM · 비밀 주입 · 스모크 · 보고 스크립트를 standard 깊이로 읽었다. 판단 근거로 실측 픽스처(`tests/fixtures/kis-news-title-sample.json`)와 들여오기/임대 SQL(`supabase/migrations/20261112100000_kis_news_feed.sql` · `20261112200000_kis_news_collector.sql`)도 대조했다.

잘 된 점: 비밀 처리(axios `config` 를 버리는 `KisApiError` · `safeErrorFields` 네 필드 · pino redact · 스크립트의 stdin 헤더/`--data-file=-`)는 단단하고, 셸 스크립트들은 `set -euo pipefail` 과 따옴표가 일관된다. 시각 계산은 +9h 뒤 `getUTC*` 만 써서 컨테이너 TZ 와 무관하고, 07:00 · 20:00 경계와 Scheduler 배열 정합도 테스트가 잠근다.

핵심 문제:
- **CR-01** 다음 쪽 커서가 `data_dt`/`data_tm`(갱신 시각)으로 만들어진다. 실측 표본을 보면 한투는 일련번호(첫 작성 시각) 기준으로 쪽을 자른다. 그래서 쪽 경계에 수정본이 오면 같은 쪽이 다시 오고, `added === 0` 에서 **경고 없이** 되감기가 멈춘다. 그 뒤 `lastSeen` 이 최신으로 넘어가 그 틈은 영구히 빈다.
- **WR-01 ~ WR-04** 60초 전면 정지가 같은 걸음 안에서는 지켜지지 않는다(WR-01). 5xx 와 함께 온 모르는 `msg_cd` 는 영구 「일시 장애」로 분류돼, 한도 소진 신호여도 run 을 멈추지 않는다(운영 기준 ④ 공백 · WR-02). 분류 통계(무효 · 미연결 · 모르는 코드)를 로그에 남기지 않는 무로그 탈락이 있다(WR-03). 한도 의심 표시가 있는 날 토큰 무효가 오면 하루 종일 탐침 실패로 묶인다(WR-04).

ID 대역: 이 슬라이스는 CR/WR/IN 01 ~ 29.

### 슬라이스 B — DB · server · shared · home-sync

Supabase 마이그레이션 6개 · pgTAP 6개, server 묶음 조회 · 종목 뉴스 라우트 · 제한기, shared 합치기 규칙(stock-feed · market-summary · etp · home), home-sync 재료 로드 · 프롬프트 · 클러스터 호출을 standard 깊이로 읽었다. 현재 작업 트리 기준이며, 이 조각 밖이지만 조각 안 코드가 의존하는 `20261113300000_stock_feed_min_disclosures.sql`(6인자 `stock_feed_by_codes`)은 맥락 확인용으로만 읽었다.

보안 규칙은 지켜졌다 — 새 표 6개(`kis_news` · `kis_news_stocks` · `kis_news_targets` · `kis_news_state` · `kis_access_tokens` · `stock_title_aliases`)는 모두 RLS 켜짐 · 정책 0 · `PUBLIC` 과 `anon, authenticated` 명시 REVOKE · service_role GRANT 이고, 새 함수 10개(`kis_news_ingest` · `stock_feed_by_codes` · 수집기 RPC 7 · `stock_title_needles`)는 모두 `REVOKE ... FROM anon, authenticated` 를 명시하고 `SECURITY INVOKER` · `search_path` 고정이다. home-sync 는 service role 키로 RPC 를 부른다. LLM 호출(`clusterSurges`)은 정상 · 비정상 종료 모두 `stopReason` 을 로그로 남기고 예외 경로도 무로그로 삼키지 않는다. 백필 UPDATE 2개(`hidden_reason IS NULL` 조건)는 다시 돌려도 결과가 같다.

결함은 세 갈래다. ① 시황 제목 규칙(`isMarketSummaryTitle`)이 「종목 얘기에 지수가 곁들여진 제목은 남긴다」는 자기 명세를 어기고, 지수 낱말로 시작하는 종목 재료 제목과 이전상장 기사를 네이버 · 한투 양쪽에서 지운다(재현함). ② 종목 뉴스 목록의 `before` 커서가 한투 ↔ 네이버 짝을 쪽 경계에서 끊어, 같은 기사가 두 쪽에 한 번씩 나오거나 링크가 떨어진 줄로 보일 수 있다. ③ 묶음 조회의 등록 upsert 가 잠금 순서를 정하지 않아, 겹치는 코드 묶음을 동시에 등록하면 교착(deadlock) → 500 이 날 수 있다. 나머지는 Info 다(주석 · 실제 동작 불일치, 정규화 키 빈틈, 낱말 규칙 누수, 인증 없는 등록이 상한을 밀어내는 문제, 배포 순서 의존).

### 슬라이스 C — webapp

작업대 공유 폴링 훅(`use-stock-feed`)과 문맥(`stock-feed-context`), 돌파 배지 · 행 선택 상세, 상따 카드 띠, 홈 공시 줄, API 클라이언트, 관련 단위 · e2e 테스트를 `d55496b2..HEAD` diff 기준으로 읽었다. 큰 파일(`trading-workbench.tsx` · `strategy-card.tsx` · `breakout-strip.tsx` · `globals.css` · 대형 테스트)은 Phase 41 변경 구간과 그 주변 호출 경로만 읽었다. `trading-workbench.tsx` 의 `originOf={unfilledOriginOf}` 변경은 quick-261112-w2q 산출물이라 이 슬라이스 범위에서 뺐다. UI 감사(41-UI-REVIEW.md)가 다룬 키보드 도달 · aria-label · 대비 문제는 중복하지 않았다.

괜찮은 점:
- 폴링 공급자는 작업대에 하나뿐이다(`StockFeedProvider` 사용처 1곳). effect 정리(abort · clearInterval · removeEventListener)도 빠짐없다. effect 의존을 정렬 · 결합한 코드 문자열로 잡아 5Hz 재렌더가 재요청을 일으키지 않는다.
- entries 문맥과 1초 강조 시계 문맥을 나눠서, 칩 · 표가 1초마다 다시 그려지지 않는다.
- 외부 제목 · 자료원은 모두 React 텍스트 노드로만 그린다(`dangerouslySetInnerHTML` · `innerHTML` 0건). 링크에는 `rel="noopener noreferrer"` 가 붙어 있다.

주요 우려:
1. **새 글 강조의 기준선**을 서버가 그 종목을 아직 수집하기 전(`collectedAt: null`) 응답으로 잡는다. 그래서 서버가 막 등록한 종목은 첫 종목별 수집(목표 10초 안팎 · D-06)이 끝난 뒤 3일 치 기존 글이 한꺼번에 「새 글」로 강조된다(CR-60).
2. 회차 시작마다 진행 중 요청을 무조건 끊는다. 그래서 주기보다 느린 응답이나 코드 집합이 자주 바뀌는 상황에서 응답이 영영 반영되지 않을 수 있고, 코드가 바뀔 때마다 디바운스 없이 즉시 재요청한다(WR-60 · WR-61).
3. 띠 · 상세의 「N건」 은 서버 `count`(출처별 상한 안 합친 수)인데 실제로 펼쳐 보이는 줄은 `limit`(20) + 공시 3건까지다. 그래서 「35건」 이라고 써 놓고 20줄만 보이는 일이 `+` 표시 없이 생긴다(WR-62).
4. e2e 픽스처가 옛 `NewsArticle` 모양 그대로라 새 계약(`kind` · `url: null`)을 한 번도 지나가지 않는다(WR-63).

## Critical Issues

### CR-01: 커서가 갱신 시각(`data_tm`)을 써서 수정본이 쪽 끝에 오면 되감기가 조용히 멈추고 틈이 영구히 빈다

**File:** `workers/kis-news-sync/src/kis/newsTitle.ts:58-60`, `workers/kis-news-sync/src/kis/newsTitle.ts:165-166`, `workers/kis-news-sync/src/collector.ts:395-401`, `workers/kis-news-sync/src/collector.ts:427-430`
**Issue:**
`cursorOf(row)` 는 다음 쪽 위치를 `{ date: row.data_dt, time: row.data_tm, srno }` 로 만든다. 하지만 실측 표본에서 한투는 `FID_INPUT_DATE_1`/`FID_INPUT_HOUR_1` 을 **일련번호 앞 14자리(첫 작성 시각)** 기준으로 적용한다.
- `steps.past_1d` 는 커서 `0000153000` 으로 불렀는데, 14번째 행 `2026111015293044488` 의 `data_tm` 이 `154433` 이다. 커서보다 늦은 갱신 시각인데도 포함됐다. 즉 `data_tm` 이 아니라 일련번호 시각(15:29:30 ≤ 15:30:00)으로 거른다.
- `steps.cont_by_time_only` 와 `steps.cont_by_cursor` 의 결과가 같다. `FID_INPUT_SRNO` 는 쪽 위치를 사실상 정하지 않는다.
- 표본의 쪽들은 모두 일련번호 내림차순이다. 그런데 `steps.stock_005930` 의 **마지막 행**(39번)은 일련번호 `2026111114251935761`(14:25:19)에 `data_tm` 이 `175422` 다. 서울경제 수정본은 3/350 이 이렇다(41-RESEARCH 14행).

이런 행이 쪽 끝에 오면 다음 커서가 14:25 가 아니라 17:54 가 된다. 수정 지연(실측 15분 ~ 3.5시간)이 한 쪽이 덮는 시간(저녁 ≈ 24분/40건)보다 길면 다음 쪽이 같은 쪽으로 돌아온다. 그러면 `added === 0` → `{ reachedSeen: false, capped: false }` 로 끝난다. `capped` 가 아니라서 `doFeed` 의 「page cap reached」 경고도 나지 않는다(무로그 탈락). 이어서 `ingestFeed` 가 `lastSeen` 을 받은 행의 최댓값으로 올리고, DB `last_srno` 도 RPC 가 올린다. 그래서 다음 실행도 그 틈을 다시 보지 않는다. 피해가 가장 큰 곳은 여러 쪽을 되감는 느린 실행(30쪽)과 빠른 창 재시작이다.

현재 테스트(`tests/newsTitle.test.ts:47-50` · `97-102`)는 `data_tm` 과 일련번호 시각이 **같은** 행(`all_latest` 마지막 행)으로만 커서를 검증해서 이 경우를 덮지 못한다.
**Fix:**
```ts
// newsTitle.ts — 커서는 일련번호 앞 14자리(첫 작성 시각)로. 모양이 틀리면 data_dt/tm 으로 물러선다.
export function cursorOf(row: KisNewsTitleRow): NewsTitleCursor {
  const s = (row.cntt_usiq_srno ?? "").trim();
  if (/^\d{19}$/.test(s)) return { date: s.slice(0, 8), time: s.slice(8, 14), srno: s };
  return { date: row.data_dt, time: row.data_tm, srno: s };
}

// pageUntilSeen — 새 행 0 쪽은 「되감기 미완」으로 알린다
if (added === 0) return { rows, pages, reachedSeen: false, capped: false, stalled: true };
// collector.doFeed — res.stalled || res.capped 면 warn, 그리고 되감기를 끝내지 못했으면
// lastSeen 을 최신으로 올리지 않는다(또는 받은 범위의 가장 오래된 일련번호를 별도 보관해 다음 걸음에 이어 받기).
```
테스트에는 `stock_005930` 의 39번 행처럼 `data_tm` 이 일련번호 시각보다 늦은 행을 쪽 끝에 두는 경우를 추가한다.

### CR-60: 수집 전(`collectedAt: null`) 응답을 기준선으로 잡아, 서버가 첫 종목별 수집을 마치면 3일 치 기존 글이 「새 글」로 강조된다

**File:** `webapp/src/lib/use-stock-feed.ts:110-119`
**Issue:**
`apply` 는 코드별 **첫 응답**을 무조건 기준선(`seen.set(e.code, …)`)으로 삼는다. 그 응답이 수집 전 응답인지는 보지 않는다(`e.collectedAt` 을 읽지 않음).

서버 쪽 사실관계는 이렇다.
- 묶음 조회는 그 종목을 「모아 달라」고 등록만 한다(`server/src/routes/news-by-stock.ts:71` `p_register: true`).
- 종목별 보충 조회는 다음 차례에 수집된다(41-CONTEXT D-05 · D-06 「새로 등록된 종목은 다음 차례에 먼저 수집 · 목표 10초 안팎」).
- 종목별 조회는 「뉴스 빠짐(응답 종목코드가 기사당 1개)을 메우는 용도」다.

그래서 작업대에 처음 들어온 종목(검색으로 추가한 카드, `top_movers` · 관심종목 밖 돌파 종목)은 다음 순서를 밟는다.
1. 1회차 응답: `collectedAt: null`. 전체 흐름으로 들어온 일부 글만 있거나 0건이다. 이 응답이 기준선이 된다.
2. 2 ~ 3회차 응답: 종목별 수집이 메운 **최근 3일 치 뉴스**가 들어온다. 전부 「기준선에 없던 id」라서 `firstSeen` 에 지금 시각이 찍힌다.
3. 결과: 그 종목의 띠 · 상세 목록이 며칠 전 기사까지 통째로 30초간 `--new-bg` 로 칠해진다.

상따 카드는 「공시 뜨자마자 판단하는 화면」(card-news-strip.tsx 머리 주석 ①)이다. 지난 기사를 방금 뜬 재료로 보이게 하는 것은 핵심 신호의 오작동이다.

같은 이유로, 수집 후에도 종목별 보충 수집(1 ~ 3분 주기)이 뒤늦게 메운 **오래된** 기사가 「새 글」로 강조된다. 현재 테스트(`use-stock-feed.test.tsx` 의 `entry()`)는 `collectedAt` 을 항상 채워서 이 경로를 검증하지 않는다.

**Fix:** 수집 전 응답으로는 기준선을 잡지 않는다. 여기에 작성 시각 신선도 조건을 더하면 늦게 메워진 옛 글도 거를 수 있다.
```ts
for (const e of got) {
  const ids = e.items.map((it) => it.id);
  // 수집 전(collectedAt null) 응답은 기준선이 아니다 — 첫 종목별 수집이 메운 기존 글이 새 글로 오인된다(D-06).
  if (e.collectedAt === null) continue;
  const before = seen.get(e.code);
  if (before !== undefined) {
    for (const it of e.items) {
      const fresh = now - Date.parse(it.publishedAt) < STOCK_FEED_FRESH_PUBLISHED_MS; // 예: 10분
      if (fresh && !before.has(it.id) && !(next ?? firstSeen).has(it.id)) writable().set(it.id, now);
    }
  }
  seen.set(e.code, new Set(ids));
}
```
테스트도 추가한다. 1회차 `collectedAt: null` + 0건, 2회차 `collectedAt` 이 있고 옛 글 N건이면 `firstSeen.size === 0` 이어야 한다.

## Warnings

### WR-01: 「초당 초과 5번 → 60초 전면 정지」가 같은 걸음의 나머지 흐름(F · G · 종목별)에는 걸리지 않는다

**File:** `workers/kis-news-sync/src/collector.ts:313-343`, `workers/kis-news-sync/src/collector.ts:440-449`, `workers/kis-news-sync/src/collector.ts:492-506`
**Issue:** `runFast` 는 걸음 시작에서 한 번만 `now >= this.pausedUntil` 을 본다. `fastStep` 안에서 `feed` 흐름이 5번째 `EGW00201` 을 받아 `pausedUntil = now + 60s` 를 세워도, 같은 `for` 루프의 `F` · `G` 와 그 아래 종목별 분기는 `pausedUntil` 을 다시 보지 않는다. `call()` 도 보지 않는다. 그래서 「pausing all KIS calls for 60s」 오류 로그 직후에도 같은 걸음에서 최대 3건이 더 나갈 수 있다. 지금은 대개 전역 버킷(용량 1)이 막아 준다. 하지만 응답이 버킷 간격(1000/maxRps ms — 5 rps 면 200ms, 15 rps 면 67ms)보다 오래 걸리면 그대로 나간다. 가짜 시계 테스트는 한투 호출에 시간이 0 이라 이 경로를 못 본다. 같은 걸음 안에서 `runFlow`/`onError` 에 걸음 시작의 낡은 `now` 를 넘기는 문제도 있다. 그래서 정지 시작과 다음 예정 시각이 걸음 길이(최대 5쪽 · 수 초)만큼 앞당겨진다.
**Fix:** `call()` 맨 앞에서 정지를 강제하고, 흐름마다 현재 시각을 다시 읽는다.
```ts
private async call(query: NewsTitleQuery, flow: FlowName) {
  this.budgetGate();
  if (this.now() < this.pausedUntil) throw new PausedError(); // runFlow 에서 오류로 세지 않고 건너뜀
  await this.acquire(this.global);
  ...
}
// fastStep: for 루프 안에서 `const t = this.now(); if (t < this.pausedUntil) return;` 후 runFlow(name, t, …)
```

### WR-02: 5xx 와 함께 온 모르는 `msg_cd` 는 영구 「transient」 — 한도 소진 신호여도 run 이 멈추지 않는다(운영 기준 ④)

**File:** `workers/kis-news-sync/src/kis/client.ts:43-49`, `workers/kis-news-sync/src/collector.ts:518-540`
**Issue:** `classifyKisError` 는 아는 코드 표에 없으면 상태값으로 넘어간다. 그래서 `status >= 500` 이면 `msg_cd` 가 있어도 `"transient"` 다. 한투는 업무 오류(`EGW00201` 등)를 HTTP 500 으로 주는 경우가 흔하다. 파일 머리 주석도 「상태값은 미확인」이라 적었다. 일일 한도 소진처럼 아직 모르는 코드가 500 으로 오면 「모르는 오류 연속 5번 → 한도 의심 표시 · 종료 1」 경로를 타지 않는다. 대신 흐름마다 최대 60초 물러서며 20:00 까지 계속 두드린다(흐름 4개 × 분당 1번 + 종목 흐름). CLAUDE.md 「공식 API 운영 기준」 ④ 「일일 한도 소진 신호 시 해당 run 즉시 중단, 재시도로 두드리지 않음」의 공백이다. 업무 코드가 있다는 것은 게이트웨이가 요청을 해석해 거절했다는 뜻이라 일시 장애로 보기 어렵다.
**Fix:**
```ts
export function classifyKisError(status: number, msgCd: string | null | undefined): KisErrorKind {
  const known = msgCd ? KIND_BY_MSG_CD[msgCd] : undefined;
  if (known) return known;
  if (msgCd) return "unknown";            // 업무 코드가 있으면 상태와 무관하게 한도 의심 후보
  if (status === 0 || status >= 500) return "transient";
  if (status === 429) return "rate_limit";
  return "unknown";
}
```
(필요하면 `MCA`/`OPSQ` 계열처럼 일시 장애로 확인된 코드만 표에 `transient` 로 따로 등록한다.)

### WR-03: 분류 통계(무효 · 미연결 · 모르는 코드)를 버린다 — 응답 모양이 바뀌거나 종목 정보가 비면 아무 로그 없이 0건 수집

**File:** `workers/kis-news-sync/src/collector.ts:406`, `workers/kis-news-sync/src/collector.ts:413`, `workers/kis-news-sync/src/collector.ts:424`, `workers/kis-news-sync/src/pipeline/classify.ts:172-203`, `workers/kis-news-sync/src/pipeline/targets.ts:70-83`
**Issue:** `toIngestRows` 는 `stats.invalid` · `unlinked` · `unknownCodes` 를 돌려준다. 그런데 세 호출부 모두 `{ rows }` 만 꺼내고 통계를 버린다. 한투가 날짜 모양(`data_tm`)을 바꾸거나 `kis_news_stock_meta` 가 빈 객체를 돌려주는 경우를 보자. 시작 시 `loadStockMeta` 는 빈 Map 도 정상으로 받는다. 이때 모든 행이 무효나 미연결로 빠진다. 그래도 `ingest([], "feed")` 는 성공하고 `feed_at` 을 갱신하므로, 운영 화면과 `kis-news-report.sh stats` 에는 수집기가 건강해 보인다. 프로젝트 규칙 「무로그 fail-safe 금지」에 걸린다.
**Fix:** 흐름마다 통계를 누적해 `collector stop` 로그와 주기 로그에 싣는다. 무효 비율이 높거나(예: 받은 행의 50% 이상) 종목 정보가 0건이면 `warn` 을 1번 남긴다.
```ts
const { rows, stats } = toIngestRows(raw, { meta: this.meta });
this.classifyStats.invalid += stats.invalid; // … unlinked · unknownCodes
if (raw.length > 0 && stats.invalid === raw.length) this.d.log.warn({ flow, ...stats }, "all rows invalid — KIS response shape changed?");
// main(): if (this.meta.size === 0) log.warn({}, "stock meta empty — nothing can be linked");
```

### WR-04: 한도 의심 표시가 있는 날 탐침이 토큰 무효를 「한도 탐침 실패」로 처리 — 강제 재발급 없이 하루 종일 실패를 반복할 수 있다

**File:** `workers/kis-news-sync/src/collector.ts:270-284`
**Issue:** `strikes > 0` 일 때 단독 탐침은 `this.call({}, "feed")` 의 모든 `KisApiError` 를 `quota_probe_failed`(종료 1)로 바꾼다. 탐침이 `EGW00121`/`EGW00123`(토큰 무효)을 받으면 `onError` 의 강제 재발급 경로를 타지 않는다. 다음 실행도 DB 토큰이 1시간 넘게 남아 있으면 `obtainToken(false)` 가 같은 토큰을 재사용한다. 그래서 5분마다 「탐침 실패 → 종료 1」을 반복하고, DB 토큰 남은 시간이 1시간 아래로 내려갈 때까지(최대 약 23시간) 수집이 0 이다. 진짜 원인은 토큰인데 로그는 「quota probe failed」라 오진하기 쉽다.
**Fix:** 탐침 실패 종류를 가른다.
```ts
} catch (err) {
  if (err instanceof StopRun) throw err;
  if (err instanceof KisApiError && err.kind === "token_invalid" && !this.tokenForced) {
    this.tokenForced = true;
    this.token = await this.obtainToken(true);   // 1번만 재발급 뒤 탐침 1건 더
    ... // 재탐침 실패면 그대로 종료 1
  }
  log.warn({ ...safeErrorFields(err), strikesToday: strikes }, "quota probe failed — …");
  return { code: 1, reason: err instanceof KisApiError ? `quota_probe_failed_${err.kind}` : "quota_probe_failed" };
}
```

### WR-30: 시황 제목 규칙이 종목 재료 기사를 지운다 — 「지수가 주어」 · 「두 지수 동시 등장」 규칙의 오탐

**File:** `packages/shared/src/market-summary.ts:31`, `packages/shared/src/market-summary.ts:33`
**Issue:** 파일 머리 주석(9 ~ 10행)은 「종목 얘기에 지수가 곁들여진 제목은 걸리지 않아야 한다」고 명세하지만, 같은 정규식을 node 로 그대로 돌려 보면 다음 종목 재료 제목이 시황으로 판정된다.

| 제목 | 걸린 규칙 |
|---|---|
| `코스닥 대장주 알테오젠, 美 머크와 기술이전 계약` | 33행(지수로 시작) |
| `코스닥 시총 2위 에코프로비엠, 3분기 영업이익 흑자전환` | 33행 |
| `코스피 편입 앞둔 가람전자, 강세` | 33행 |
| `에코프로비엠, 코스닥 떠나 코스피로 이전 추진` | 31행(「이전 ?상장」 꼴만 예외라 「이전 추진」 · 「이전 결정」 은 걸린다) |

`mergeStockFeed`(stock-feed.ts:260 · 263)가 이 판정으로 네이버 줄과 한투 뉴스 줄을 응답 시점에 지우므로, server 묶음 조회 · 종목 뉴스 탭 · home-sync AI 입력(loadSurges → mergeStockFeed) 모두에서 해당 종목의 핵심 재료가 사라진다. 33행 부정 전방탐색 목록(`상장|입성|이전|IPO|협회|새내기|行|200|150`)은 「코스닥 대장주 · 시총 N위 · 편입」 같은 흔한 수식어를 막지 못하고, 31행은 「코스피」 · 「코스닥」 이 한 제목에 함께 나오는 이전 기사를 「이전상장」 표기일 때만 살린다. 테스트(`market-summary.test.ts`)에는 이 반례가 없다.
**Fix:** 33행은 지수 바로 뒤가 지수 동사 · 수치일 때만 걸도록 좁힌다(32행 주석의 예 「코스닥 '급등'...」 꼴). 예:
```ts
// 지수가 주어 — 지수 바로 뒤가 따옴표 낱말 · 방향 낱말 · 수치일 때만
new RegExp(`^${TAGS}["'‘“]?${IDX}["'’”]?,? ?(['‘]?(급등|급락|반등|하락|상승|강세|약세|폭락|폭등)|[0-9.]+%|[0-9][0-9,]{2,5}선)`),
// 두 지수 동시 등장 — 이전 계열 낱말 전부 예외
/^(?!.*이전)(?=.*코스피)(?=.*코스닥)/,
```
위 네 제목을 `market-summary.test.ts` 의 「걸리면 안 되는 제목」 목록에 반례로 추가해 잠근다.

### WR-31: 종목 뉴스 목록의 `before` 커서가 한투 ↔ 네이버 짝을 쪽 경계에서 끊는다 — 같은 기사 두 줄 · 링크 유실

**File:** `server/src/routes/news.ts:57-80`
**Issue:** `loadMergedFeed` 는 RPC 가 출처별로 `< before` 를 걸어 준 행만 합친다. 합친 줄의 `publishedAt` 은 두 시각 중 이른 쪽(stock-feed.ts:242)이라, 짝의 한쪽이 커서보다 늦고 다른 쪽이 이를 때 다음 쪽에서 남은 한쪽이 홀로 나온다. 두 경우가 증명된다.
1. **같은 기사 두 줄:** 1쪽에서 한투 행 K(09:58)가 한투 출처별 상한(`stockFeedPerSource(limit)` = limit + 10 행) 밖으로 밀리면 네이버 행 N(10:05)은 짝 없이 1쪽에 나온다. 1쪽 마지막 줄이 10:00 이면 2쪽 RPC(`p_before` = 10:00)는 N 을 빼고 K 를 주므로 K 가 다시 한 줄로 나온다 — D-12 「같은 기사는 한 줄」 위반(한투 글이 몰리는 급등 종목에서 상한 밖 밀림이 실제로 생긴다).
2. **링크 · 종류 유실:** 1쪽에서 K(10:05) · N(09:58)이 합쳐져 09:58 로 정렬되고 1쪽 limit 밖에 놓이면, 2쪽(`before` = 10:00)은 K 를 빼고 N 만 준다 — 공시였다면 「공시」 배지 · 거래소 자료원이 사라진 네이버 줄로 보인다. 반대 방향(K 09:58 · N 10:05)이면 링크 없는 한투 줄만 남는다.
**Fix:** 커서 쪽 넘김에서는 RPC 의 `p_before` 를 짝 창만큼 넓혀 받고(`before + SAME_ARTICLE_WINDOW_MS`), 합친 뒤에 `publishedAt < before` 로 거른다 — 짝의 늦은 쪽도 다시 받아 합쳐지므로 두 쪽 모두 같은 합친 줄을 기준으로 잘린다.
```ts
const widened = before ? new Date(Date.parse(before) + SAME_ARTICLE_WINDOW_MS).toISOString() : null;
// rpc(..., { p_before: widened, ... }) → mergeStockFeed → .filter(publishedAt < before) → slice(limit)
```
(1번 경우는 출처별 상한도 같이 넓혀야 완전히 닫힌다 — 커서 쪽은 `p_per_source` 를 `stockFeedPerSource(limit) * 2` 정도로.) 경계 두 경우를 `news.test.ts` 에 추가한다.

### WR-32: 묶음 조회 등록 upsert 의 잠금 순서가 정해지지 않아 동시 등록끼리 교착할 수 있다

**File:** `supabase/migrations/20261112340000_stock_title_aliases.sql:74-82` (같은 본문이 `20261112100000_kis_news_feed.sql:289-297` · `20261112320000_stock_feed_naver_title_name.sql:76-84` 에 있고 현재 정의 `20261113300000` 도 그대로 이어받는다)
**Issue:** `INSERT ... SELECT DISTINCT c FROM unnest(p_codes) ... ON CONFLICT (stock_code) DO UPDATE ... WHERE t.last_requested_at < now() - 60s` 는 WHERE 가 거짓이어도 충돌한 행을 잠근다(PostgreSQL 문서: 「all rows will be locked when the ON CONFLICT DO UPDATE action is taken」). 잠그는 순서는 `SELECT DISTINCT` 출력 순서인데 `ORDER BY` 가 없어 HashAggregate 버킷 순서(입력 크기 · 추정치에 따라 달라짐)를 따른다. server 는 캐시 키만 정렬하고 RPC 에는 요청 순서 그대로 넘긴다(`news-by-stock.ts:68`). 사무실 gh-trade 클라 여러 대와 웹 작업대가 겹치는 돌파 종목 묶음을 5 ~ 10초마다 서로 다른 조합으로 부르므로, 두 트랜잭션이 A → B, B → A 순으로 잠그면 교착 감지(`40P01`)로 한쪽이 실패하고 그 요청은 500 이 된다(실패는 캐시하지 않으니 다음 요청에서 회복되지만 클라는 한 주기 빈 응답).
**Fix:** 잠금 순서를 고정한다.
```sql
INSERT INTO public.kis_news_targets AS t (stock_code, last_requested_at)
SELECT c, now()
  FROM (SELECT DISTINCT c FROM unnest(coalesce(p_codes, ARRAY[]::text[])) AS c
         WHERE c IS NOT NULL AND c <> '') d
 ORDER BY c
ON CONFLICT (stock_code) DO UPDATE ...
```
새 마이그레이션에서 현재 6인자 정의에 같은 수정을 넣는다.

### WR-60: 회차 시작마다 진행 중 요청을 끊어서, 묶음 순차 조회가 10초를 넘으면 응답이 영영 반영되지 않는다

**File:** `webapp/src/lib/use-stock-feed.ts:129-149`
**Issue:** `run()` 은 시작하자마자 `controller?.abort()` 로 직전 회차를 끊는다. 그 뒤 100코드 묶음을 **차례로** `await` 하고, 모든 묶음이 끝나야 `apply` 한다.

`setInterval(run, 10_000)` 은 직전 회차가 끝났는지 보지 않는다. 그래서 한 회차 전체(묶음 수 × 왕복)가 10초를 넘으면 매 회차가 다음 회차에 끊긴다. 받아 둔 앞 묶음 결과(`got`)도 함께 버려진다.

이런 상황은 실제로 생길 수 있다.
- 돌파 목록이 수백 줄이면 묶음이 2 ~ 3개다.
- 회차 끝까지 가려면 `apiFetch` 기본 타임아웃 8초(`webapp/src/lib/api.ts:16`) × 묶음 수만큼 걸릴 수 있다.
- 서버는 Cloud Run 콜드스타트 · VPC 왕복이 지연을 지배한다(프로젝트 메모).

그러면 화면은 첫 응답 상태에 멈추거나 「불러오는 중」 / pending 자리로 남는다. 오류 표시도 없다. 서버는 끊긴 요청의 RPC 를 그대로 계산하므로 부하만 남는다.

**Fix:** 진행 중 회차가 있으면 주기 tick 은 건너뛴다. 끊기는 코드 집합이 바뀌었을 때(effect 정리)와 다시 보일 때만 한다.
```ts
let inFlight = false;
const run = async (force = false) => {
  if (document.visibilityState === 'hidden') return;
  if (inFlight && !force) return;          // 주기 tick 은 겹치지 않는다
  controller?.abort();
  const ctrl = (controller = new AbortController());
  inFlight = true;
  try { /* 묶음 순차 조회 · apply */ } finally { if (controller === ctrl) inFlight = false; }
};
let timer = setInterval(() => void run(), intervalMs);
```
묶음은 `Promise.allSettled` 로 병렬로 보내 회차 시간을 줄이는 것도 고려한다(묶음 수가 작아 탭당 동시 요청 2 ~ 3개).

### WR-61: 코드 집합이 바뀔 때마다 디바운스 없이 즉시 전량 재조회한다 — 돌파 목록이 자주 바뀌는 장 시작 무렵 요청이 10초 설계보다 늘고 응답이 끊겨 버려진다

**File:** `webapp/src/lib/use-stock-feed.ts:93-164` · `webapp/src/components/trading/workbench/trading-workbench.tsx:1415-1423`
**Issue:** `feedCodes` 는 `rateCrossItems`(relay 돌파 항목)와 카드 코드의 합집합이다. 돌파 항목이 하나 들어오거나 이탈할 때마다 `sig` 가 바뀐다. 그러면 effect 가 다음을 반복한다.
1. 진행 중 요청을 abort한다.
2. interval 을 새로 건다(10초 주기가 리셋된다).
3. **모든 묶음**을 즉시 다시 부른다.

장 시작(09:00) · NXT 개장(08:00)처럼 돌파 진입 · 이탈이 몇 초 간격으로 이어지면 이렇게 된다.
- 탭당 요청이 10초 1회가 아니라 「변경 1회당 묶음 수만큼」이 된다. 머리 주석 ①의 「탭당 10초 1번」 설계와 다르다.
- 서버 캐시 키가 정렬한 전체 코드 집합(`news-by-stock.ts:113`)이라, 변경마다 모든 묶음이 캐시를 빗나가 RPC(등록 쓰기 포함)를 새로 돈다.
- 변경 간격이 응답 지연보다 짧으면 WR-60 처럼 매번 끊겨 아무 응답도 반영되지 않는다.

**Fix:** 코드 집합 변경을 짧게(예: 1 ~ 2초) 모아서 처리하고, 주기를 리셋하지 않는다. 혹은 새로 들어온 코드만 즉시 조회하고, 전체 집합은 다음 정규 tick 에 맞춘다.
```ts
// effect 밖: 최신 목록은 ref 로, interval 은 intervalMs 에만 의존
const listRef = useRef<string[]>([]);
useEffect(() => { listRef.current = sig ? sig.split(SIG_SEP) : []; /* 새 코드만 debounce 뒤 1회 */ }, [sig]);
```

### WR-62: 띠 · 상세의 「N건」(서버 `count`)과 펼쳐 보이는 줄 수가 다르다 — `+` 없이 「35건」 이라 쓰고 20줄만 보인다

**File:** `webapp/src/components/trading/card/card-news-strip.tsx:110` · `webapp/src/components/trading/workbench/breakout-strip.tsx:551`
**Issue:** `entry.count` 는 출처별 상한 `stockFeedPerSource(limit) = limit + 10 = 30` 안에서 합친 뒤의 줄 수다(`packages/shared/src/stock-feed.ts:172-174`, `server/src/routes/news-by-stock.ts:84`). 반면 `entry.items` 는 `takeFeedWithDisclosures(merged, 20, 3)` 라서 최대 23줄이다. `truncated` 는 「한 출처라도 30행에 닿음」일 때만 참이다.

예를 들어 한투 25행 + 네이버 10행(합쳐짐 없음)이면 이렇게 된다.
- `count = 35`, `truncated = false`.
- 띠에는 「35건 ▾」, 상세 머리에는 「최근 3일 뉴스·공시 35건」 이 뜬다.
- 펼치면 20 ~ 23줄뿐이고, 나머지를 볼 방법도 「+」 표시도 없다.

D-18 「띠를 누르면 최근 3일 글 **전부**가 아래로 펼쳐진다」와도 맞지 않는다. 화면은 서버 계약을 「목록 총수」로 잘못 해석하고 있다.

**Fix:** 화면이 실제로 그리는 줄 수를 쓰고, 더 있으면 `+` 를 붙인다.
```ts
const more = entry.truncated || entry.count > entry.items.length;
const count = `${entry.items.length}건${more ? '+' : ''} ${open ? '▴' : '▾'}`;
```
「전부」가 요구사항이면 `limit` 를 올리는 것도 방법이다. 다만 그러면 응답 크기 · 출처별 상한이 함께 커지므로, 서버 슬라이스와 계약을 맞춰야 한다.

### WR-63: e2e 픽스처가 옛 `NewsArticle` 모양이라 새 계약(`kind` · `url: null` · 배지)을 지나가지 않는다 — 작업대 e2e 는 `/api/news/by-stock` 을 모킹하지 않는다

**File:** `webapp/e2e/specs/news.spec.ts:53-109` (픽스처 `webapp/e2e/fixtures/news.ts:6-23`)
**Issue:** `news.spec.ts` 는 문구만 「뉴스·공시」 · 「전체 보기」 로 고쳤다. 응답 픽스처 `NEWS_ITEM_SAMPLE` 은 그대로 `stockCode` · `createdAt` · `source: "hankyung"` 를 쓰고 `kind` · `receivedAt` · `stockCodes` · `description` 이 없다.

그래서 브라우저에서 다음이 일어난다.
- `NewsItem` 이 `FeedKindBadge kind={undefined}` 를 그린다. 클래스에 `undefined` 가 박히고 라벨은 빈 칸이다.
- 그래도 테스트는 통과한다. 결국 링크 없는 줄(`news-item-nolink`), 「공시」 배지, 자료원 보조 줄 중 어느 것도 실제 브라우저 경로로 검증되지 않는다.

`trading-workbench.spec.ts` 에는 `by-stock` 라우트 모킹이 없다. 그래서 작업대 e2e 내내 10초마다 `localhost:8080/api/news/by-stock` 실요청이 실패하고 조용히 삼켜진다. 돌파 배지 · 행 선택 상세 · 카드 띠도 e2e 커버리지가 0이다.

**Fix:** 다음 세 가지를 한다.
1. `fixtures/news.ts` 를 shared `StockFeedItem` 타입으로 고정한다(`satisfies StockFeedItem`).
2. 공시(`kind: 'disclosure'`, `url: null`) 표본을 넣어 `news-item-nolink` · 배지 텍스트를 단언한다.
3. 작업대 spec 에 `**/api/news/by-stock?**` 모킹을 넣고, 배지 1건 · 행 선택 상세 1건을 단언한다.

## Info

### IN-01: `tokenForced` 가 한 번 서면 실행 끝까지 그대로 — 몇 시간 뒤의 정상적인 토큰 무효 1번에도 종료 1

**File:** `workers/kis-news-sync/src/collector.ts:166`, `workers/kis-news-sync/src/collector.ts:508-516`
**Issue:** 13시간 실행 중 08:00 에 강제 재발급을 한 번 했다고 하자. 18:00 에 서로 무관한 토큰 무효가 오면 바로 `token_invalid` 종료 1 이다. 다음 깨움(≤ 5분)이 이어받지만, 의도(「강제 재발급 직후 또 무효면 종료」)보다 넓다.
**Fix:** 강제 재발급 뒤 성공 호출이 한 번 있으면(`runFlow` 성공 분기) `tokenForced = false` 로 되돌리거나, 마지막 강제 시각 + N분 안의 재무효만 종료로 본다.

### IN-02: 쪽 상한(`capped`)에 닿으면 `lastSeen` 이 최신으로 건너뛰어 그 아래 틈은 다시 받지 않는다

**File:** `workers/kis-news-sync/src/collector.ts:395-401`, `workers/kis-news-sync/src/collector.ts:427-430`
**Issue:** 경고는 남기지만, 5쪽(빠른 창)이나 30쪽(느린 실행)을 넘는 틈은 일반 뉴스에서 영구히 빠진다. F · G 안전망은 공시 1쪽씩만 덮는다. 설계상 감수(Pitfall 3)지만, 이어 받기 커서를 메모리에 두면 다음 걸음에서 메울 수 있다.
**Fix:** capped 면 마지막 커서를 `pendingCursor` 로 두고, 다음 feed 흐름에서 최신 1쪽 뒤에 그 커서부터 이어서 받는다.

### IN-03: 강제 `KIS_NEWS_MODE=fast` 를 06:00 전이나 주말에 주면 14시간 task-timeout 을 넘기거나 주말 내내 돈다

**File:** `workers/kis-news-sync/src/collector.ts:290-296`, `workers/kis-news-sync/src/pipeline/cadence.ts:51-57`
**Issue:** `fastWindowEndOf` 는 요일과 시작 시각을 보지 않고 「그날 20:00」만 준다. 05:00 에 강제 fast 를 주면 15시간 루프라 `--task-timeout=14h` 에 강제 종료된다(임대는 TTL 로 풀린다). 주말에 주면 주말 장중 내내 돈다.
**Fix:** 강제 fast 라도 `max(t0, 그날 07:00)` 부터 13시간 상한을 두거나, 시작 시 창 밖이면 warn 을 남긴다.

### IN-04: Supabase 호출에 타임아웃이 없다 — DB 호출이 매달리면 임대 연장이 멈추고, 깨어난 뒤 남의 임대 아래서 한 걸음을 더 돈다

**File:** `workers/kis-news-sync/src/services/supabase.ts:12-14`, `workers/kis-news-sync/src/collector.ts:617-624`
**Issue:** 한투 axios 에는 10초 타임아웃이 있지만, supabase-js fetch 에는 없다. `ingest` 나 `loadTargets` 가 90초 넘게 매달리면 임대가 만료되고 다음 깨움이 넘겨받는다. 매달렸던 실행은 다음 `maintain` 전까지 `haveLease = true` 로 한투 호출을 하고, `refreshToken` 경로에서는 토큰 발급도 시도할 수 있다(61초 가드가 대부분 막는다).
**Fix:** `createClient(..., { global: { fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(15_000) }) } })` 로 상한을 둔다.

### IN-05: 종료 시 사용량 flush 가 실패하면 그 몫은 사라진다(예산 과소 집계)

**File:** `workers/kis-news-sync/src/collector.ts:679-681`, `workers/kis-news-sync/src/apiUsage.ts:98-108`
**Issue:** `UsageCounter.flush` 는 실패하면 메모리로 되돌리지만, `shutdown` 은 한 번만 시도하고 프로세스가 끝난다. 최대 10초 분량(≈ 27 ~ 50건)이 `api_usage` 에 안 남는다. 영향은 작지만 자체 상한 판정이 그만큼 느슨해진다.
**Fix:** `shutdown` 에서 실패 시 1 ~ 2번 짧게 다시 시도하고, 끝내 실패하면 `lostCalls` 수를 `error` 로그에 싣는다.

### IN-06: 스모크 INV-4 가 15분 안 다른 실행의 「probe ok」로도 통과한다

**File:** `scripts/smoke-kis-news-sync.sh:88-101`
**Issue:** 로그 필터가 Job 이름과 `--freshness=15m` 뿐이다. 15분 안에 재배포했거나 수동 probe 를 돌렸다면, 이번 probe 가 실패했어도 INV-4 는 PASS 다(INV-1 이 따로 잡긴 한다).
**Fix:** INV-1 에서 `--format='value(metadata.name)'` 로 실행 이름을 받아 `labels."run.googleapis.com/execution_name"="$EXEC"` 조건을 더한다.

### IN-07: `setup-kis-secrets.sh` 의 `file_mode` 가 GNU stat(Linux)에서 항상 틀린 값을 낸다

**File:** `scripts/setup-kis-secrets.sh:72-74`
**Issue:** GNU `stat -f` 는 「파일시스템 정보」 옵션이다. 그래서 `'%Lp'` 를 파일 인자로 보고 실패하면서도, 실제 파일의 파일시스템 정보를 stdout 에 찍는다. 이어서 `|| stat -c '%a'` 출력이 붙어 `MODE` 가 여러 줄 문자열이 되고, 권한 검사가 늘 실패한다. 지금은 macOS 에서만 돌려서 드러나지 않는다.
**Fix:** `if stat -c '%a' "$1" >/dev/null 2>&1; then stat -c '%a' "$1"; else stat -f '%Lp' "$1"; fi` 처럼 GNU 를 먼저 판별한다.

### IN-08: 배포 스크립트가 Secret 이름 변수를 정의해 놓고 `--set-secrets` 에는 리터럴을 쓴다

**File:** `scripts/deploy-kis-news-sync.sh:63-64`, `scripts/deploy-kis-news-sync.sh:297`
**Issue:** 가드(214 ~ 225행)는 `$KIS_APPKEY_SECRET` · `$KIS_APPSECRET_SECRET` 를 검사하는데, 실제 바인딩은 `gh-radar-kis-appkey` · `gh-radar-kis-appsecret` 리터럴이다. 한쪽만 바꾸면 가드와 배포가 갈라진다.
**Fix:** `--set-secrets="SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SECRET}:latest,KIS_APPKEY=${KIS_APPKEY_SECRET}:latest,KIS_APPSECRET=${KIS_APPSECRET_SECRET}:latest"`

### IN-09: Generality without instantiation — `pageUntilSeen` 의 `minWrittenAt` 를 운영 코드가 한 번도 넘기지 않는다

**File:** `workers/kis-news-sync/src/kis/newsTitle.ts:44-46`, `workers/kis-news-sync/src/kis/newsTitle.ts:122-130`, `workers/kis-news-sync/src/kis/newsTitle.ts:158`
**Category:** necessity
**Issue:** 유일한 호출부 `collector.ts:391-394` 는 `{ lastSeenSrno, maxPages }` 만 넘긴다. `minWrittenAt`, `writtenAtMs`, `reachedOld` 분기는 `tests/newsTitle.test.ts:207` 에서만 쓰인다. 게다가 이 분기는 CR-01 과 같은 갱신 시각(`data_dt`/`data_tm`)을 기준으로 삼는다. 나중에 쓰게 되면 수정본에서 같은 오판을 한다.
**Fix:** 옵션과 `writtenAtMs` 를 지우거나, 남기려면 일련번호 앞 14자리로 판정하게 바꾼다.

---

_Reviewed: 2026-11-13T11:38:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### IN-30: `clampInt` 주석과 실제 동작이 다르다 — 비정수 · 숫자 아닌 값은 잘라 맞추지 않고 400

**File:** `server/src/schemas/news-by-stock.ts:11-22`
**Issue:** 주석은 「범위 밖 · 비정수 · 빈 값은 거부하지 않고 잘라 맞춘다」지만 zod 4.3.6 에서 `days=abc` · `days=2.5` · `days=Infinity` 는 `z.coerce.number().int()` 단계에서 실패해 400 이 된다(직접 확인). 그래서 transform 안의 `!Number.isFinite(v)` 분기는 닿지 않는다. gh-trade 계약 노트가 이 주석을 옮겼다면 클라 쪽 기대와 어긋난다.
**Fix:** 주석을 「정수가 아니면 400 · 정수는 1 ~ max 로 잘라 맞춤」으로 고치고 죽은 분기를 지우거나, 정말 잘라 맞추려면 `z.preprocess` 로 `Math.trunc` · NaN → undefined 를 먼저 적용한다.

### IN-31: `isRpcResult` 가 두 라우트에 복제돼 있다

**File:** `server/src/routes/news.ts:37-49`, `server/src/routes/news-by-stock.ts:42-54`
**Issue:** 같은 모양 검사가 두 파일에 글자까지 같게 있다(41-14 SUMMARY 가 「같은 웨이브라 건드리지 않았다」고 남긴 임시 복제). 한쪽만 고치면 RPC 계약 검사가 갈라진다.
**Fix:** `news-by-stock.ts` 에서 export 하거나 `server/src/mappers/stock-feed.ts` 로 옮겨 두 라우트가 같이 쓴다.

### IN-32: `newsTitleKey` 가 가운뎃점 「ㆍ」(아래아)을 글자로 남긴다 — 「기호 차이 무시」(D-12)의 빈틈

**File:** `packages/shared/src/stock-feed.ts:177-179`
**Issue:** `[^\p{L}\p{N}]` 제거는 `·`(U+00B7) · `∙` · `‧` 는 지우지만 한국 기사 · 공시 제목에 흔한 `ㆍ`(U+318D, NFKC 후 U+119E — 문자 범주 Lo)는 남긴다. `단일판매ㆍ공급계약` → `단일판매ᆞ공급계약`, `단일판매·공급계약` → `단일판매공급계약` 으로 키가 갈려(직접 확인) 한투 ↔ 네이버 사본의 점 표기가 다르면 합치기(D-12)와 수정본 키(D-13, DB `title_key`)가 모두 실패한다.
**Fix:** 키 정규화에서 `ㆍᆞ` 를 지운다(`.replace(/[ㆍᆞ]/g, "")` 를 NFKC 뒤에). DB `kis_news.title_key` 는 수집기가 같은 함수로 만들므로, 바꿀 때 기존 행 `title_key` 소급 UPDATE(유일키 충돌 주의)를 같이 계획한다.

### IN-33: `stock_title_needles` 낱말 규칙이 넓은 낱말을 만든다 — 우선주 「LG우」 → `lg`, 첫 낱말 「NHN KCP」 → `nhn`

**File:** `supabase/migrations/20261112320000_stock_feed_naver_title_name.sql:31-46`, `:161`
**Issue:** ① 우선주 걷기(`[0-9]?우[a-c]?$`)의 최소 길이가 2라 `LG우` · `SK우` · `CJ우` · `GS우` 같은 그룹 우선주의 낱말이 `lg` · `sk` · `cj` · `gs` 가 되어, 그룹 계열사 기사 전부가 그 우선주 네이버 줄로 남는다. 또 이 정규식은 우선주 여부를 보지 않고 이름 끝 「우」를 모두 걷는다. ② 띄어 쓴 이름의 첫 낱말(3자 이상)은 `NHN KCP` → `nhn` 처럼 다른 상장사 이름이 되어 남의 기사가 남는다. ③ 공백 제거가 ASCII 공백만 지워(`replace(..., ' ', '')`) NBSP · 탭이 든 제목은 「가람 전자」 꼴 매칭이 실패한다. 파일 머리 「알려진 한계」 에는 ① ② 가 없다.
**Fix:** 우선주 걷기의 최소 길이를 3으로 올리거나 본주 이름을 `stocks` 에서 실제로 찾아 쓰고, 첫 낱말 규칙은 다른 종목명과 같지 않을 때만 넣는다. 공백 제거는 `regexp_replace(lower(na.title), '\s', '', 'g')` 로. 판단이 필요한 범위면 최소한 「알려진 한계」 주석에 적는다.

### IN-34: 인증 없는 묶음 조회가 등록 상한(200)을 밀어낼 수 있다

**File:** `server/src/routes/news-by-stock.ts:67-75`, `supabase/migrations/20261112200000_kis_news_collector.sql:155-163`
**Issue:** `GET /api/news/by-stock` 은 인증 없이(D-03) 캐시가 빗나갈 때마다 최대 100코드를 `p_register: true` 로 등록하고, IP 당 분 600회까지 허용된다. 수집 대상의 등록 몫은 `last_requested_at DESC` 최근 200개(`kis_news_targets_list` 의 `LIMIT greatest(p_registered_cap, 0)`)라, 아무나 마스터 코드 묶음을 돌려 부르면 gh-trade · 작업대가 등록한 돌파 종목이 상한 밖으로 밀려 `collectedAt` 이 null 로 남는다. 한투 호출량은 상한 · 예산이 묶으므로 비용 문제는 아니고 서비스 품질 문제다(사용자 메모상 보안 검사는 생략 범위라 Info 로 둔다).
**Fix:** 등록은 요청당 코드 수 · IP 당 등록 빈도를 따로 묶거나, 웹 작업대 경로는 로그인 사용자만 등록하게 나누는 등의 완화를 검토한다.

### IN-35: auto_market 2번 규칙이 「<이름>(<코드>) 급등, <재료>」 꼴의 재료 기사까지 숨긴다

**File:** `supabase/migrations/20261112310000_kis_news_auto_market_supply.sql:25` (같은 식 `20261112300000_kis_news_auto_market_hidden.sql:29`)
**Issue:** `'^.+\([0-9A-Z]{6}\) +((소폭|상승|하락|급등|급락|강세|약세|상한가|하한가)|[+-][0-9])'` 는 괄호 코드 뒤 방향 낱말만 보고 뒤의 재료 문구를 보지 않는다. 「에코프로(086520) 급등, 2차전지 대규모 수주」 같은 제목도 숨는다. 운영 표본상 이 꼴이 인포스탁 시세 한 줄이었다는 근거는 있지만, 픽스처(`41_auto_market_pre.sql`)에는 이 꼴의 재료 반례가 없어 오탐 여부가 잠기지 않았다. 규칙 정본은 수집기 `classify.ts` 다.
**Fix:** 2번 규칙에 끝 앵커(시세 숫자 · 「↑」 · 쉼표 뒤 수급 낱말만 허용)를 두거나, 반례 제목을 수집기 테스트와 이 픽스처의 「남아야 하는 뉴스」에 추가해 판단을 고정한다.

### IN-36: server · home-sync 가 6인자 RPC(`p_min_disclosures`)를 전제한다 — DB 먼저 배포 필수

**File:** `server/src/routes/news-by-stock.ts:74`, `workers/home-sync/src/pipeline/loadSurges.ts:239`
**Issue:** 두 호출은 `p_min_disclosures` 를 이름 인자로 넘긴다. 이 인자는 이 조각 밖 `20261113300000_stock_feed_min_disclosures.sql` 이 만든다 — 그 마이그레이션이 원격에 적용되기 전에 server 나 home-sync 이미지가 나가면 PostgREST 가 함수를 찾지 못해(PGRST202) 묶음 조회 전체가 500, home-sync 는 사이클마다 throw 한다. `news.ts` 는 이 인자를 넘기지 않아 양쪽 서명 모두에서 돈다.
**Fix:** 배포 순서(`supabase db push` → server · home-sync)를 배포 스크립트나 SUMMARY 체크리스트에 명시한다. 메모리 「배포 경로는 diff 디렉터리별로 대조」와 같은 꼴로 마이그레이션 디렉터리도 대조 항목에 넣는다.

---

_Reviewed: 2026-11-13T11:39:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### IN-60: 코드가 0개가 되면 effect 가 바로 끝나서 이전 entries · 기준선이 그대로 남는다

**File:** `webapp/src/lib/use-stock-feed.ts:94-98`
**Issue:** `if (sig === '') return;` 이 기준선 정리(98행)보다 앞에 있다. 그래서 돌파 목록 · 카드가 모두 비었다가(relay 재연결 스냅샷 등) 같은 코드가 다시 들어오면 두 가지가 남는다.
- 옛 기준선이 남아 있다. 머리 주석의 「빠진 코드의 기준선은 버린다 — 다시 들어오면 그 첫 응답이 다시 기준선」이 지켜지지 않는다. 비어 있던 동안 나온 글이 한꺼번에 강조된다.
- `state.entries` 에는 빠진 코드의 묶음이 다음 성공 응답 전까지 남는다.

**Fix:** 빈 집합일 때도 `seenRef.current.clear()` 를 하고, `setState(EMPTY)`(이미 비었으면 생략) 뒤에 return 한다.

### IN-61: 영구 실패 · 형식 밖 코드는 「불러오는 중」 / pending 자리에 끝없이 머문다 — 오류와 로딩을 구분할 수 없다

**File:** `webapp/src/components/trading/workbench/breakout-strip.tsx:568` · `webapp/src/components/trading/card/card-news-strip.tsx:95-97` · `webapp/src/lib/use-stock-feed.ts:139-142`
**Issue:** 묶음이 계속 실패하거나(서버 500 · 429 · 타임아웃 — WR-60 포함), 코드가 `SHORT_CODE_RE` 를 통과하지 못해 폴링에서 빠지면 다음처럼 된다.
- 상세는 영원히 「불러오는 중」 을 띄운다.
- 카드 띠는 영원히 빈 30px 자리다.

훅은 실패를 상태로 내보내지 않는다. `catch {}` 가 원인도 남기지 않아 운영에서 진단할 수도 없다(프로젝트 메모 「무로그 fail-safe 금지」).

**Fix:** 훅이 코드별 「마지막 실패 시각」이나 전체 `error` 를 함께 내보내게 하고, 일정 횟수가 넘으면 「불러오지 못했어요」 로 바꾼다. catch 에는 `console.warn` 으로 status · code 를 한 번 남긴다(스로틀).

### IN-62: 묶음 경계가 사용자별 카드 코드와 공용 돌파 코드를 섞어서, 서버 5초 캐시를 사용자끼리 나눠 쓰지 못한다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:1415-1423` · `webapp/src/lib/use-stock-feed.ts:85,135-137`
**Issue:** `feedCodes` 는 돌파 코드(모든 사용자가 같은 relay 목록)와 카드 코드(사용자별)를 섞어 정렬한 뒤 100개씩 자른다. 서버 캐시 키는 「정렬한 코드 집합」(`server/src/routes/news-by-stock.ts:113`)이다. 카드 구성이 다른 사용자는 모든 묶음의 키가 달라지므로, 접속 사용자 N명이면 10초마다 대략 N × 묶음 수 만큼 RPC(등록 쓰기 포함)가 돈다. 한투 호출과는 무관해서 운영 기준 ③을 어기지는 않는다. 다만 DB 부하는 사용자 수에 비례하고, 캐시가 막을 수 있던 몫이다.

**Fix:** 돌파 코드 묶음과 카드 코드 묶음을 따로 요청한다. 그러면 돌파 묶음은 사용자 간 키가 같아져 5초 캐시 · 진행 중 promise 공유를 받는다.

---

_Reviewed: 2026-11-13T11:36:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
