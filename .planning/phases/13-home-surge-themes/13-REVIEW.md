---
phase: 13-home-surge-themes
reviewed: 2026-07-02T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - packages/shared/src/home.ts
  - server/src/app.ts
  - server/src/mappers/home.ts
  - server/src/routes/home.ts
  - server/src/schemas/home.ts
  - supabase/migrations/20260701123000_home_theme_snapshots.sql
  - webapp/src/app/page.tsx
  - webapp/src/components/home/home-client.tsx
  - webapp/src/components/home/home-empty.tsx
  - webapp/src/components/home/home-header.tsx
  - webapp/src/components/home/home-skeleton.tsx
  - webapp/src/components/home/news-block.tsx
  - webapp/src/components/home/solo-card.tsx
  - webapp/src/components/home/theme-card.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/hooks/use-home-query.ts
  - webapp/src/lib/home-api.ts
  - webapp/src/lib/supabase/middleware.ts
  - workers/home-sync/src/ai/anthropic.ts
  - workers/home-sync/src/ai/clusterSurges.ts
  - workers/home-sync/src/ai/parseJson.ts
  - workers/home-sync/src/ai/prompt.ts
  - workers/home-sync/src/config.ts
  - workers/home-sync/src/index.ts
  - workers/home-sync/src/logger.ts
  - workers/home-sync/src/pipeline/contentHash.ts
  - workers/home-sync/src/pipeline/loadSurges.ts
  - workers/home-sync/src/pipeline/upsertSnapshot.ts
  - workers/home-sync/src/services/supabase.ts
  - scripts/deploy-home-sync.sh
  - scripts/setup-home-sync-iam.sh
  - scripts/smoke-home-sync.sh
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-02
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 13 홈 급등 테마 파이프라인(home-sync 워커 → home_theme_snapshots → /api/home → 웹앱 홈)을
표준 깊이로 리뷰했다. 핵심 보안·정합성 관심사는 대부분 잘 처리되어 있다:

- **RLS (마이그레이션):** `SELECT TO anon, authenticated USING (true)` + INSERT/UPDATE/DELETE
  policy 부재 → service_role(워커)만 write. `feedback_supabase_rls_authenticated` (default-deny
  회귀) 및 T-13-02/T-13-04 를 정확히 준수. RPC 가 아닌 plain table 이므로 REVOKE 불요 판단도 옳다.
- **Pitfall 3 (정적 이력 오염 방지):** `/api/home` 라우트와 `mapSnapshot` 이 payload 를 verbatim
  통과시키고 실시간 시세 재조인을 하지 않는다. 테스트(home.route.test.ts #4)로 회귀 고정. 정확.
- **anti-hallucination (D-04):** `resolveNewsRefs` 가 범위 밖 인덱스를 drop, `demoteInvalidThemes`
  가 급등 집합 밖 stockCode 를 drop → Claude 가 새 URL/코드를 지어내도 구조적으로 차단. 견고.
- **hash-skip clone-append (Pattern 4):** `computeContentHash` 가 코드/뉴스 id 정렬 후 직렬화로
  결정적. `index.ts` 분기가 hash 일치 시 Claude 호출 0. `upsertSnapshot` 은 ignoreDuplicates 로 slot
  멱등. 정확.
- **시크릿/에러 노출:** logger redact(T-13-05), 라우트 `next(e)` generic 위임(T-13-09), 훅
  error.message 미노출 + console 분리(T-13-09), 뉴스 anchor `rel="noopener noreferrer"`(T-13-11)
  모두 준수.

발견된 이슈는 Critical 0건. Warning 2건(news 로드의 db-max-rows truncation 잠재 재발, hash 입력의
newsPerStock 상한 미반영으로 인한 clone-append 정확성 미세 편차)과 Info 4건(newsRefs 중복 미제거 —
기존 follow-up, 강등 single 의 newsRefs 오귀속 가능성, marketStatus 시간 경계, computeSlot 재시도
경계)이다.

## Warnings

### WR-01: news_articles 로드에 limit/range 부재 — db-max-rows(1000) truncation 잠재 재발

**File:** `workers/home-sync/src/pipeline/loadSurges.ts:77-95`
**Issue:**
주석(74-75행)은 "단일 `.in()` 1000-row truncation 회피"를 목적으로 명시하지만, 실제 쿼리는 code 청크
단위 `.in()` + `.order("published_at", desc)` 만 걸고 **`.limit()`/`.range()` 가 없다**. 청크 크기
`QUOTE_CHUNK=200` 이고 `surgeMax=80` 이라 실전에서는 보통 단일 청크(≤80 종목)이지만, 그 80 종목의
누적 뉴스가 1000행을 넘으면 PostgREST 가 응답을 **정렬 뒤쪽(published_at 오래된 쪽)에서 통째 truncate**
한다. 그 결과 앱 측 종목별 top-K(`newsPerStock`) 필터가 도는 시점에는 이미 일부 종목의 최신 뉴스가
누락돼 있을 수 있다 — 주석이 회피했다고 주장하는 바로 그 Pitfall-1 이 조건부로 재발한다. 뉴스가 조용히
사라져도 예외 없이 통과하므로 관측이 어렵다.
**Fix:**
종목별 top-K 를 서버 측에서 보장하도록 청크 크기를 낮추거나(예: `newsPerStock * chunk ≤ 1000` 이
되도록 chunk 재산정), 종목별로 `.limit(newsPerStock)` 을 건 개별 쿼리 또는 PostgREST 의 종목별
서브셀렉트를 사용한다. 최소 방어로 쿼리에 명시적 상한을 두어 truncation 이 조용히 일어나지 않게 한다:

```ts
const NEWS_FETCH_CAP = 1000; // db-max-rows 미만으로 명시
const { data, error } = await supabase
  .from("news_articles")
  .select(NEWS_COLS)
  .in("stock_code", chunk)
  .order("published_at", { ascending: false })
  .limit(NEWS_FETCH_CAP);
// 그리고 chunk 크기를 Math.floor(NEWS_FETCH_CAP / cfg.newsPerStock) 이하로 재산정.
```

### WR-02: content_hash 가 newsPerStock 상한 이전의 전체 뉴스 id 집합 — clone-append 정확성 미세 편차

**File:** `workers/home-sync/src/pipeline/contentHash.ts:14-20` (연계: `loadSurges.ts:88-94`)
**Issue:**
`computeContentHash` 는 `surges[].news[].id` 전체를 해시 입력으로 쓴다. `loadSurges` 는 종목별
`newsPerStock`(기본 5)건까지만 `surge.news` 에 담으므로, hash 입력은 "Claude 가 실제로 본 top-K
뉴스 집합"과 동일하다 — 여기까지는 정합. 다만 top-K 컷오프 경계에서 6번째·7번째 뉴스가 교체돼도
top-K(1~5위) id 가 그대로면 hash 는 불변 → Claude 호출 skip 후 직전 payload 를 그대로 clone-append
한다. 이는 의도된 title-insensitive 설계(주석)와 방향은 같지만, "표시되는 top-K 뉴스는 동일한데 순위
경계 밖 뉴스만 바뀐 경우"에는 payload 를 재생성하지 않는 것이 오히려 정확하다 — 즉 현 동작은 대체로
**옳다**. 리스크는 반대쪽: `newsPerStock` 을 운영 중 늘리면(예: 5→10) 같은 급등집합에 대해 hash 가
바뀌어 불필요한 Claude 재호출이 발생하고, 과거 슬롯과 hash 비교가 어긋난다. 설정 변경이 곧 hash 도메인
변경임이 문서화되어 있지 않다.
**Fix:**
hash 입력에 `newsPerStock` 등 hash 도메인에 영향을 주는 튜닝 파라미터를 명시적으로 포함하거나(파라미터
변경 = 새 hash 도메인임을 코드로 표현), 최소한 `computeContentHash` 주석에 "newsPerStock/surgeMax
변경 시 직전 슬롯과 hash 가 불연속 → 그 슬롯은 강제 Claude 재호출됨"을 명시한다:

```ts
const canonical = {
  codes: surges.map((s) => s.code).sort(),
  news: surges.flatMap((s) => s.news.map((n) => n.id)).sort(),
  // 튜닝 파라미터가 hash 도메인을 바꾼다는 사실을 명시(운영 변경 시 재호출 유발).
  k: cfg.newsPerStock,
};
```

## Info

### IN-01: resolveNewsRefs — 같은 뉴스 인덱스/URL 중복 미제거 (기존 follow-up)

**File:** `workers/home-sync/src/ai/clusterSurges.ts:52-62`
**Issue:**
`resolveNewsRefs` 는 범위 검증만 하고 중복 인덱스를 제거하지 않는다. Claude 가 `newsRefs: [0, 0]` 또는
서로 다른 인덱스이지만 동일 URL 을 가리키는 뉴스를 반환하면, 같은 뉴스가 테마/single 카드에 두 번
표시될 수 있다. `NewsBlock` 이 `MAX_NEWS=2` 로 잘라 최종 표출은 최대 2건이지만, 중복 2건이면 실질
1건만 노출되는 셈이라 근거 다양성이 줄어든다. 알려진 follow-up 로 기록됨.
**Fix:**
인덱스 및 URL 기준 dedupe 를 추가한다:

```ts
export function resolveNewsRefs(indexedNews, refs) {
  const out = [];
  const seenUrl = new Set();
  for (const r of refs) {
    if (!Number.isInteger(r) || r < 0 || r >= indexedNews.length) continue;
    const n = indexedNews[r];
    if (seenUrl.has(n.url)) continue;
    seenUrl.add(n.url);
    out.push(n);
  }
  return out;
}
```

### IN-02: 강등 single 의 newsRefs 가 drop 된 다른 종목 뉴스를 가리킬 수 있음

**File:** `workers/home-sync/src/ai/clusterSurges.ts:80-81`
**Issue:**
`demoteInvalidThemes` 가 <2 valid 테마를 single 로 강등할 때 `newsRefs: t.newsRefs`(테마 전체 뉴스
참조)와 `reason: t.reason`(테마 이유)을 그대로 넘긴다. 그런데 이 뉴스/이유는 테마 소속 여러 종목에 대한
것이므로, 남은 1개 종목의 근거와 정확히 일치하지 않을 수 있다(예: drop 된 종목의 뉴스가 single 근거로
표시). anti-hallucination 범위 검증은 통과하지만 의미적 오귀속 여지가 있다. 실무 영향은 작다(강등은
드문 경로, 뉴스는 여전히 입력 실뉴스).
**Fix:**
강등 시 newsRefs 를 남은 종목(uniq[0]) 관련 뉴스로 제한하거나, 근거 정합이 불확실하면 reason/newsRefs
를 비워 보수적으로 표시한다. 최소한 이 의미적 편차를 주석으로 남긴다.

### IN-03: marketStatus 경계 — hour>=15 이지만 스케줄러는 15:30 만 발화

**File:** `workers/home-sync/src/index.ts:63` (연계: `home-header.tsx:58` `isCloseSlot`)
**Issue:**
`computeSlot` 은 `hour >= 15` 이면 `closed` 로 판정하는데, 헤더의 `isCloseSlot` 은 `HH:MM === '15:30'`
정확 매칭으로 "마감" pill 을 표시한다. 스케줄러(`30 9-15 * * 1-5`)가 정상 발화하면 15시대 슬롯은
15:30 하나뿐이라 두 판정이 일치한다. 그러나 재시도/수동 실행으로 16:xx 에 도는 경우 payload 는
`closed` 인데 헤더는 마감 dot 을 안 붙이는 등 표시 불일치가 생길 수 있다. 정상 경로에서는 문제 없음.
**Fix:**
마감 판정 기준을 한 곳(공유 상수/함수)으로 통일하거나, `marketStatus` 를 헤더 "마감" 표시의 단일
근거로 삼아 시각 문자열 매칭 의존을 제거한다.

### IN-04: computeSlot 재시도 시 시간 경계 넘으면 off-schedule 슬롯 생성 가능

**File:** `workers/home-sync/src/index.ts:48-65`
**Issue:**
`computeSlot` 은 실행 시각의 현재 시(hour)를 그대로 slot 시각으로 쓴다. 스케줄러가 :30 에 발화하는
전제에서는 정확하지만, `max-retries=1` 재시도가 시(hour) 경계를 넘겨 실행되면(예: 15:59 발화 실패 →
16:0x 재시도) 스케줄러의 7개 슬롯에 없는 16:30 슬롯이 append 된다. 인덱스/네비에 계획에 없는 슬롯이
섞일 수 있다. 발생 확률은 낮다(task-timeout 120s, 재시도 1회).
**Fix:**
slot 시각을 실행 시각이 아니라 스케줄러가 의도한 트리거 시각(예: 페이로드로 전달하거나, 가장 가까운
:30 슬롯으로 정규화)에서 도출한다. 정상 경로 영향이 없으므로 우선순위는 낮다.

---

_Reviewed: 2026-07-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
