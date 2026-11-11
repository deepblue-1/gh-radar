---
phase: 41-kis-news-and-disclosure-feed
plan: 01
subsystem: database · api · shared
tags: [postgres, pgtap, supabase-rpc, express, zod, vitest, kis-news]

requires:
  - phase: 07 (news-sync)
    provides: "news_articles(네이버) 표 · idx_news_stock_published 인덱스"
provides:
  - "표 kis_news · kis_news_stocks · kis_news_targets · kis_news_state (서비스롤 전용)"
  - "RPC kis_news_ingest(p_rows jsonb, p_via text, p_queried_code text DEFAULT NULL) RETURNS jsonb"
  - "RPC stock_feed_by_codes(p_codes text[], p_since timestamptz, p_per_source integer, p_register boolean, p_before timestamptz DEFAULT NULL) RETURNS jsonb"
  - "shared stock-feed.ts — 조회 계약 타입 · 상수 · toKstOffsetIso · stockFeedPerSource · newsTitleKey · isSameArticle · mergeStockFeed"
  - "server GET /api/news/by-stock (newsByStockRouter · computeNewsByStock · NewsByStockQuery)"
affects: [41-02, 41-03, 41-04, 41-05, 41-06, 41-07, 41-08, 41-10, 41-12, 41-14, gh-trade 인박스 노트]

actuals:
  tokens: 20500
  tasks: 2
  commits: 3
plan_head_before: 612d5c1e56cf1ea50a1d41199c3e4486511dd359
plan_head_after: dd12ee79b570b4779769fb74c9887d733f44a10a

tech-stack:
  added: []
  patterns:
    - "들여오기 RPC 행 단위 3갈래(같은 srno → 연결만 · 같은 KST 날 수정본 → LEAST · 새 글) + 동시 삽입 충돌 시 기존 행에 붙기"
    - "묶음 조회 RPC = unnest WITH ORDINALITY + 출처별 LATERAL LIMIT · 등록 쓰기는 같은 호출 안 ON CONFLICT … WHERE 60초"
    - "합치기 규칙은 shared 순수 함수 하나 — DB 는 출처별 원 행만, server · home-sync 가 같은 mergeStockFeed 를 부른다"

key-files:
  created:
    - supabase/migrations/20261112100000_kis_news_feed.sql
    - supabase/tests/kis_news.test.sql
    - packages/shared/src/stock-feed.ts
    - packages/shared/src/__tests__/stock-feed.test.ts
    - server/src/schemas/news-by-stock.ts
    - server/src/routes/news-by-stock.ts
    - server/tests/routes/news-by-stock.test.ts
  modified:
    - packages/shared/src/index.ts
    - server/src/app.ts

key-decisions:
  - "12시간 창은 키가 완전히 같을 때도 적용한다 — 매일 같은 제목(「[표] 외국인 순매수 상위」)이 다른 날 기사와 합쳐지지 않게(behavior 의 「다른 날이면 안 합침」을 만족시키는 유일한 해석)"
  - "합친 줄의 id 는 receivedAt(한투 received_at · 네이버 created_at)이 이른 쪽 — 같으면 한투"
  - "kis_news_ingest 의 revisions 는 수정본 경로를 탄 행 수(같은 수정본을 다시 받아도 센다) — 로그용"

patterns-established:
  - "조회 계약 시각은 전부 toKstOffsetIso 로 YYYY-MM-DDTHH:MM:SS.sss+09:00(호스트 TZ 무관)"
  - "RPC 결과 모양 위반은 빈 응답으로 숨기지 않고 throw → 500"

requirements-completed: [SC-1, SC-2, SC-3]

coverage:
  - id: D1
    description: "들여오기 RPC — 일련번호 멱등 · 같은 KST 날 수정본 1행(작성 시각 LEAST) · 다른 날 같은 제목 2행 · 수집 시각(행 0개여도) · feed_at/last_srno"
    requirement: SC-1
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql (A1 ~ A24)"
        status: pass
    human_judgment: false
  - id: D2
    description: "묶음 조회 RPC — 입력 순서 · 모든 코드 · 글 없는 코드 빈 배열 · 수집 전 collected_at null · 숨김 제외 · per_source · before/since 경계 · 등록 60초 · 권한"
    requirement: SC-3
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql (B1 ~ B21 · C1 ~ C6 · D)"
        status: pass
    human_judgment: false
  - id: D3
    description: "같은 기사 합치기 규칙(shared isSameArticle · mergeStockFeed)"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/stock-feed.test.ts (25 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/news/by-stock — RPC 1회 · 등록 · 잘라 맞춤 · 400 검증 · +09:00 시각 · Cache-Control max-age=5"
    requirement: SC-3
    verification:
      - kind: integration
        ref: "server/tests/routes/news-by-stock.test.ts (21 tests)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-11
status: complete
---

# Phase 41 Plan 01: 한투 뉴스·공시 피드 트레이서 + 합치기 규칙 Summary

**한투 공시 1건이 `kis_news_ingest` → 표 4개 → `stock_feed_by_codes`(RPC 1회 · 등록 포함) → shared `mergeStockFeed` → `GET /api/news/by-stock`(+09:00 시각 · 글 없는 코드 · 수집 전 null)까지 한 길로 이어지고, 한투 ↔ 네이버 같은 기사 합치기(12시간 창 · 키 일치 또는 15자 앞부분 · id 불변)가 shared 순수 함수 하나로 고정됐다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-11-11T14:44:44Z
- **Completed:** 2026-11-11T14:54:06Z
- **Tasks:** 2 (트레이서 1 · TDD 1)
- **Files modified:** 9 (생성 7 · 수정 2)

## Accomplishments

- 마이그레이션 `20261112100000_kis_news_feed.sql` — 표 4개(RLS · 정책 0 · PUBLIC/anon/authenticated REVOKE · service_role GRANT) · RPC 2개(함수 권한 3줄)
- pgTAP `kis_news.test.sql` 61건 전부 ok — 멱등 · 수정본 · KST 날짜 경계(UTC 같은 날) · 숨김 제외 · per_source · before/since 경계 · 등록 60초 · 권한 · RLS
- shared `stock-feed.ts` — 계약 타입 8 · 상수 8 · 함수 5(`toKstOffsetIso` · `stockFeedPerSource` · `newsTitleKey` · `isSameArticle` · `mergeStockFeed`) + 보조 타입 `SameArticleProbe`
- server `GET /api/news/by-stock` — 인증 없음 · RPC 1회 · `Cache-Control: public, max-age=5` · 한투 호출 · 한투 env 없음(grep 0)

## 계약(뒤 플랜 · gh-trade 노트가 읽는 것)

**최종 마이그레이션 이름:** `supabase/migrations/20261112100000_kis_news_feed.sql` (계획한 이름 그대로 — 시작 시 최신은 `20261109520000`)

**RPC 시그니처:**

```sql
public.kis_news_ingest(p_rows jsonb, p_via text, p_queried_code text DEFAULT NULL) RETURNS jsonb
  -- p_rows: [{ srno, provider_code, source, kind('news'|'disclosure'), category, title, title_key, written_at(ISO · 오프셋), links: [{ code, hidden_reason }] }]
  -- p_via: 'feed' | 'stock' (그 밖은 예외) · 반환 {"inserted", "revisions", "linked"}
  -- 필수 키(srno · provider_code · title_key · written_at) 누락 · 연결 code 누락은 예외
public.stock_feed_by_codes(p_codes text[], p_since timestamptz, p_per_source integer, p_register boolean, p_before timestamptz DEFAULT NULL) RETURNS jsonb
  -- 반환 {"feed_at", "stocks": [{"code", "collected_at", "kis": [{srno, kind, source, title, title_key, written_at, received_at, codes}], "naver": [{id, title, description, source, url, published_at, created_at}]}]}
  -- p_per_source < 1 은 예외
```

**응답 예시** (`GET /api/news/by-stock?codes=012340,005930` — 공시 1 · 네이버 1 · 빈 코드 1, 라우트 테스트 픽스처 그대로):

```json
{
  "asOf": "2026-11-12T09:15:03.120+09:00",
  "feedAt": "2026-11-12T09:15:00.512+09:00",
  "stocks": [
    {
      "code": "012340",
      "collectedAt": "2026-11-12T09:14:10.000+09:00",
      "count": 2,
      "truncated": false,
      "items": [
        {
          "id": "naver:11111111-1111-4111-8111-111111111111",
          "kind": "news",
          "publishedAt": "2026-11-12T09:20:00.000+09:00",
          "title": "가람전자, 대형 공급계약 수주에 강세",
          "source": "한국경제",
          "stockCodes": [],
          "url": "https://example.invalid/n1",
          "description": "가람전자가 장 초반 강세다.",
          "receivedAt": "2026-11-12T09:25:00.000+09:00"
        },
        {
          "id": "kis:2026111209143512345",
          "kind": "disclosure",
          "publishedAt": "2026-11-12T09:14:35.000+09:00",
          "title": "(주)가람전자 단일판매ㆍ공급계약체결",
          "source": "코스닥 공시",
          "stockCodes": ["012340"],
          "url": null,
          "description": null,
          "receivedAt": "2026-11-12T09:14:41.230+09:00"
        }
      ]
    },
    { "code": "005930", "collectedAt": null, "count": 0, "truncated": false, "items": [] }
  ]
}
```

- `count` = 출처별 상한(`stockFeedPerSource(limit)` = `min(limit + 10, 110)`) 안에서 합친 뒤 줄 수 · `truncated` = 한투 또는 네이버 행 수가 그 상한에 닿음 · `items` = 앞에서 `limit` 줄.
- 400 은 `{"error": {"code": "INVALID_QUERY_PARAM", "message": "<path>: <message>"}}`.

**테스트 수:** pgTAP 61 · shared `stock-feed.test.ts` 25 · server `news-by-stock.test.ts` 21.

## Task Commits

1. **Task 1: 트레이서 — 한투 공시 1건 한 길** — `5b413a36` (feat)
2. **Task 2: 합치기 규칙 완성(TDD)** — RED `a501a81f` (test) → GREEN `dd12ee79` (feat) · REFACTOR 없음

## Files Created/Modified

- `supabase/migrations/20261112100000_kis_news_feed.sql` — 표 4 · RPC 2 · 인덱스(보이는 연결 부분 인덱스 · srno · written_at)
- `supabase/tests/kis_news.test.sql` — pgTAP 61
- `packages/shared/src/stock-feed.ts` — 조회 계약 + 합치기 규칙 단일 정의
- `packages/shared/src/__tests__/stock-feed.test.ts` — 합치기 규칙 25
- `packages/shared/src/index.ts` — `export * from "./stock-feed"`
- `server/src/schemas/news-by-stock.ts` — `NewsByStockQuery`(SHORT_CODE_RE · 1 ~ 100 · 중복 제거 · days/limit 잘라 맞춤)
- `server/src/routes/news-by-stock.ts` — `newsByStockRouter` · `computeNewsByStock`
- `server/src/app.ts` — `app.use("/api/news", newsByStockRouter)` (themes 다음 줄)
- `server/tests/routes/news-by-stock.test.ts` — 라우트 21

## Decisions Made

- **12시간 창을 키 완전 일치에도 적용** — truth 문장은 「키가 같거나, (15자 앞부분 + 12시간)」 으로도 읽히지만 behavior 의 「매일 같은 제목이 다른 날이면 안 합침」 은 키가 같은 경우라 창이 없으면 만족할 수 없다. 조회 기간이 3일이라 실제로 문제가 된다.
- **id 는 receivedAt 이 이른 쪽**(같으면 한투) — 「먼저 받은 쪽」 의 직역. 한투를 먼저 받고 네이버가 나중에 붙는 보통 경우 id 가 `kis:` 로 고정된다(테스트 「id 불변」).
- **revisions 는 수정본 경로를 탄 행 수** — 같은 수정본 srno 를 다시 받아도(되감기 재수신) 다시 센다. 로그 용도라 별도 추적 표를 두지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] RPC 입력 검증 추가**
- **Found during:** Task 1
- **Issue:** 계획 명세는 p_via 검증만 적었다 — 필수 키가 빠진 행이나 연결 code 가 없는 행이 오면 NOT NULL 위반 등 원인이 불분명한 오류가 나거나 빈 키로 수정본 판정이 틀어질 수 있다.
- **Fix:** `kis_news_ingest` 가 p_rows 비배열 · 필수 키(srno · provider_code · title_key · written_at) 누락 · 연결 code 누락에 원인 문구로 예외. `stock_feed_by_codes` 는 p_per_source < 1 에 예외. 동시 실행 삽입 충돌은 run 을 죽이지 않고 기존 행에 붙는다(ON CONFLICT DO NOTHING 후 재조회).
- **Files modified:** supabase/migrations/20261112100000_kis_news_feed.sql
- **Verification:** pgTAP 61 ok
- **Committed in:** 5b413a36

**2. [Rule 2 - Missing Critical] `kis_news_written_at_idx` 인덱스 추가**
- **Found during:** Task 1
- **Issue:** 41-02 `kis_news_cleanup`(90일 보관 정리)이 `written_at` 으로 지우는데 인덱스가 없으면 전표 스캔.
- **Fix:** `CREATE INDEX kis_news_written_at_idx ON public.kis_news (written_at)`.
- **Committed in:** 5b413a36

**3. [계약 추가 — 변경 아님] `SameArticleProbe` 타입 export**
- `isSameArticle(a, b)` 인자 타입 `{ key: string; at: number }` 에 이름을 붙여 export 했다(Artifacts 표에 없는 이름 1개 추가 · 기존 이름은 그대로).

**Total deviations:** 2 auto-fixed (Rule 2 둘) + 계약 추가 1
**Impact on plan:** 표 · RPC · 타입 이름과 시그니처는 Artifacts 표 그대로. 계약 변경 없음.

## TDD Gate Compliance

- RED `a501a81f` `test(41-01)` → GREEN `dd12ee79` `feat(41-01)` 순서 확인.
- RED 근거: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/stock-feed.test.ts` → exit 1 · 15 failed / 10 passed. 합치기 6건은 assertion 실패(`expected … to have a length of 1 but got 2` 등 — 합치지 않는 정렬만 구현), `isSameArticle` 9건은 `TypeError: isSameArticle is not a function`(심볼 부재). 의미 평가: 대상 행위(합치기)는 계획한 assertion 에서 실패했고, isSameArticle 케이스는 심볼 부재 실패라 엄밀한 RED 근거로는 약하다 — GREEN 뒤 25/25 통과로 보완. `gsd_run check tdd-red-evidence` 기록은 만들지 않았다(이 플랜은 `type: execute` · TDD_MODE 미지정).

## Issues Encountered

- 표본 파일 `reference/kis-news-title-probe-result.json` 은 메인 체크아웃에만 있고(미추적) 워크트리에는 없다 — 메인 체크아웃에서 읽기만 했고 옮기지 않았다(41-06 몫).

## User Setup Required

None - 원격 적용(`supabase db push`)은 41-09.

## Next Phase Readiness

- 41-02(수집기 마이그레이션)는 이 파일보다 큰 버전(`20261112200000`)으로 진행 가능.
- 41-03 노트는 위 응답 예시 JSON 을 그대로 옮기면 된다. 5초 캐시 · 전용 제한기는 41-03 몫(이 플랜은 캐시 없이 RPC 1회).
- 41-12 수집기는 `links` 에 조회 코드를 직접 넣어야 연결된다(RPC 는 p_queried_code 를 수집 시각에만 쓴다).

## Self-Check: PASSED

- 생성 파일 7개 존재 확인 · 커밋 `5b413a36` · `a501a81f` · `dd12ee79` HEAD 조상 확인
- 수용 기준 재실행: RLS 4줄 · GRANT/REVOKE 두 함수 각각 · UNIQUE 1 · 함수 export 4 + isSameArticle · index 재수출 · SHORT_CODE_RE · `/api/news` 결선 · server 한투 흔적 0 · 라우트 `it(` 18(+ it.each 4) · stock-feed `it(` 25
- 플랜 verification: pgTAP 61/61 ok · shared build/typecheck · server typecheck · stock-feed 25/25 · news-by-stock 21/21

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-11*
