---
phase: 41-kis-news-and-disclosure-feed
plan: 04
subsystem: webapp
tags: [react, tailwind, vitest, stock-news, kis-news]

requires:
  - phase: 41-01
    provides: "shared StockFeedItem · StockFeedKind 타입"
provides:
  - "webapp fetchStockNews · refreshStockNews 반환 StockFeedItem[]"
  - "FeedKindBadge(kind · size 'full' | 'mini' · className) — data-slot feed-kind-badge · data-kind"
  - "CSS 토큰 --feed-disc · --feed-disc-bg · --feed-news · --feed-news-bg (라이트 · 다크)"
  - "NewsItem props article: StockFeedItem — data-slot news-item-nolink · news-item-src · news-item-src-sub"
  - "카드 제목 「관련 뉴스·공시」 · 「전체 보기 →」 · 전체 목록 「최근 7일 뉴스·공시」"
affects: [41-05, 41-07, 41-09, 41-10, 41-14]

actuals:
  tokens: 9650
  tasks: 2
  commits: 3
plan_head_before: 4f55f5e1adcef51a9a58ec26b64944079fd3e2a3
plan_head_after: b1f0731d3fa8dfc362598470e2f5fcdded959a8f

tech-stack:
  added: []
  patterns:
    - "줄 종류 배지는 FeedKindBadge 하나 — 색은 --feed-* 토큰만, 바깥 여백은 쓰는 자리가 className 으로"
    - "링크 없는 줄은 <a> 대신 data-slot=news-item-nolink 글자 · ↗ 는 url 있는 줄만"

key-files:
  created:
    - webapp/src/components/stock/feed-kind-badge.tsx
    - webapp/src/components/stock/__tests__/news-item.test.tsx
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/components/stock/news-item.tsx
    - webapp/src/lib/stock-api.ts
    - webapp/src/components/stock/stock-news-section.tsx
    - webapp/src/components/stock/news-full-list.tsx
    - webapp/src/components/stock/news-empty-state.tsx
    - webapp/src/components/stock/news-view.ts
    - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
    - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
    - webapp/e2e/specs/news.spec.ts
    - webapp/e2e/specs/stock-detail.spec.ts

key-decisions:
  - "mini 배지는 role=img + aria-label(전체 이름) + title — generic span 에는 ARIA 이름을 붙일 수 없어서"
  - "제목 칸은 div(min-w-0) 안에 제목(line-clamp-2)과 폰 보조 줄을 나눠 둔다 — 목업처럼 보조 줄을 줄 수 제한 요소 안에 넣으면 보조 줄까지 잘린다"
  - "e2e 의 「전체 보기」 버튼 찾기는 /^전체 보기/ — 「전체 토론 보기」 와 섞이지 않게 앞 고정"

patterns-established:
  - "--feed-news 계열은 var(--muted-fg) · var(--muted) 참조 — 다크 블록에도 같은 참조를 다시 적는다(사용자 정의 속성은 정의한 요소에서 계산된다)"

requirements-completed: [SC-2, SC-6]

coverage:
  - id: D1
    description: "FeedKindBadge — 「공시」/「뉴스」 · mini 「공」/「뉴」 + aria-label · data-kind"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/news-item.test.tsx#FeedKindBadge"
        status: pass
    human_judgment: false
  - id: D2
    description: "NewsItem — 배지가 제목 앞 · url 있는 줄만 새 창 링크 + ↗ · url null 줄은 글자 제목 · 자료원 PC 열 + 폰 보조 줄 항상 · 제목 텍스트 그대로"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/news-item.test.tsx (11 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "카드 제목 · 전체 보기 · 전체 목록 제목 · 오류 · 빈 상태 · 끝 문구 「뉴스·공시」"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-detail-client.test.tsx · webapp/src/components/trading/__tests__/stock-info-modal.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "배지 색 · 줄바꿈 · 잘림 · 폰/PC 자료원 배치가 목업 ① A 와 같아 보이는지(라이트 · 다크)"
    requirement: SC-6
    human_judgment: true
    rationale: "시각 확인은 41-09 UAT — e2e 는 문구만 맞추고 실행하지 않았다(플랜 지시)"

duration: 약 15분
completed: 2026-11-11
status: complete
---

# Phase 41 Plan 04: 종목 뉴스 목록 — 공시/뉴스 배지 · 링크 없는 줄 · 「관련 뉴스·공시」 Summary

**`NewsItem` 이 shared `StockFeedItem` 을 받아 줄 앞 「공시」/「뉴스」 배지(`FeedKindBadge` · `--feed-*` 토큰)를 그리고, `url` 이 있는 줄만 새 창 링크 + 「↗」, 없는 줄은 글자 제목으로 그리며 자료원은 PC 열과 폰 보조 줄에 항상 보인다. 이 부품 하나로 종목 상세 · 종목 정보 창 · 전체 목록 세 곳이 같이 바뀌고, 카드 제목은 「관련 뉴스·공시」 다.**

## Performance

- **Duration:** 약 15분
- **Completed:** 2026-11-11T15:05Z
- **Tasks:** 2 (TDD 1 · 일반 1)
- **Files modified:** 13 (생성 2 · 수정 11)

## Accomplishments

- `FeedKindBadge` — 11px · 600 · 둥근 5px · 좌우 6px(`mini` 10px · 좌우 4px), 색은 `--feed-*` 토큰만. ② ③ ④(41-05 · 41-07 · 41-10)가 그대로 가져다 쓴다.
- `NewsItem` — 배지 + 제목, 링크 있는 줄 / 없는 줄 두 갈래, 자료원 항상(`news-item-src` · `news-item-src-sub`). 그리드 클래스 체계(card `[1fr_78px]` / sm `[1fr_88px_78px]` · full 그대로)는 유지. T-02(`noopener noreferrer`) · T-03(텍스트로만) 주석 유지.
- `fetchStockNews` · `refreshStockNews` 반환 `StockFeedItem[]` — server 쪽 응답 변경은 41-14.
- ① 자리 문구 전부를 목업 ① A 로. 걸러 보기 칩 · 공시 따로 묶음은 만들지 않았다(D-16 기각안).

## 색 토큰

| 토큰 | 라이트 | 다크 |
|---|---|---|
| `--feed-disc` | `#c2410c` | `#ff9f43` |
| `--feed-disc-bg` | `#fff4e6` | `rgba(255, 159, 67, 0.16)` |
| `--feed-news` | `var(--muted-fg)` | `var(--muted-fg)` |
| `--feed-news-bg` | `var(--muted)` | `var(--muted)` |

위치: `globals.css` 의 `--new-bg` · `--new-bd` 바로 아래(라이트 `:root` · 다크 `.dark`).

## 바뀐 문구

| 자리 | 전 | 후 |
|---|---|---|
| 카드 제목(로딩 · 정상 2곳) | 관련 뉴스 | 관련 뉴스·공시 |
| 카드 아래 링크/버튼(2곳) | 전체 뉴스 보기 → | 전체 보기 → |
| 카드 초기 오류 | 뉴스를 불러오지 못했어요 | 뉴스·공시를 불러오지 못했어요 |
| 전체 목록 제목 | 최근 7일 뉴스 | 최근 7일 뉴스·공시 |
| 전체 목록 초기 오류 | 뉴스를 불러오지 못했어요 | 뉴스·공시를 불러오지 못했어요 |
| 전체 목록 빈 상태 제목 | 표시할 뉴스가 없어요 | 표시할 뉴스·공시가 없어요 |
| 전체 목록 빈 상태 본문 | 최근 7일 내 수집된 뉴스가 없습니다. … | 최근 7일 내 수집된 뉴스·공시가 없습니다. … |
| 전체 목록 끝 | 최근 7일 뉴스를 모두 불러왔어요 | 최근 7일 뉴스·공시를 모두 불러왔어요 |
| `NewsEmptyState` 기본 제목 | 아직 수집된 뉴스가 없어요 | 아직 수집된 뉴스·공시가 없어요 |

그대로 둔 것: `NewsEmptyState` 본문 · 「뉴스 새로고침」 버튼, 새로고침 실패 인라인 「뉴스를 갱신하지 못했어요…」(네이버 새로고침이라), 전체 목록 추가 로드 실패 「추가 뉴스를 불러오지 못했어요」(플랜 목록 밖).

## Task Commits

1. **Task 1: FeedKindBadge · 토큰 · NewsItem · stock-api 타입(TDD)** — RED `055aa24a` (test) → GREEN `1692b045` (feat) · REFACTOR 없음
2. **Task 2: 문구 + 기존 테스트 · e2e 스펙 문자열** — `b1f0731d` (feat)

## Files Created/Modified

- `webapp/src/components/stock/feed-kind-badge.tsx` — 새 배지 부품
- `webapp/src/components/stock/__tests__/news-item.test.tsx` — 11 tests
- `webapp/src/styles/globals.css` — `--feed-*` 4토큰 × 라이트 · 다크
- `webapp/src/components/stock/news-item.tsx` — 배지 · 링크 없는 줄 · 자료원 항상
- `webapp/src/lib/stock-api.ts` — 반환 `StockFeedItem[]` · 계약 주석
- `webapp/src/components/stock/stock-news-section.tsx` · `news-full-list.tsx` — 상태 타입 `StockFeedItem[]` · 문구
- `webapp/src/components/stock/news-empty-state.tsx` · `news-view.ts` — 문구 · 주석
- `webapp/src/components/stock/__tests__/stock-detail-client.test.tsx` · `webapp/src/components/trading/__tests__/stock-info-modal.test.tsx` — 새 문구
- `webapp/e2e/specs/news.spec.ts` · `webapp/e2e/specs/stock-detail.spec.ts` — 새 문구(실행 안 함)

## Decisions Made

- **mini 배지 접근성**: `role="img"` + `aria-label`(「공시」/「뉴스」) + `title`. 이름 붙이기가 금지된 generic span 에 aria-label 만 달면 스크린리더가 무시할 수 있다.
- **보조 줄 위치**: 목업은 `.sub` 를 제목 요소(줄 수 제한) 안에 두지만, 그러면 긴 제목에서 보조 줄이 잘린다. 제목 칸을 `div.min-w-0` 로 감싸 제목(`line-clamp-2`)과 보조 줄(`sm:hidden` · `truncate`)을 형제로 뒀다 — 보이는 결과는 목업과 같다.
- **e2e 버튼 찾기 `/^전체 보기/`**: 같은 화면의 「전체 토론 보기」 와 섞이지 않게.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 소비처 상태 타입 교체를 Task 1 로 당김**
- **Found during:** Task 1
- **Issue:** `stock-api.ts` 반환을 `StockFeedItem[]` 로 바꾸면 `stock-news-section.tsx` · `news-full-list.tsx` 의 `useState<NewsArticle[]>` 가 타입 오류 — Task 1 verify(typecheck)가 통과할 수 없다.
- **Fix:** 두 파일의 `NewsArticle` → `StockFeedItem` 교체(타입만)를 Task 1 GREEN 커밋에 넣었다. 문구는 Task 2 에서.
- **Committed in:** `1692b045`

**2. [Rule 3 - Blocking] RED 커밋에 배지 자리표시 파일**
- **Found during:** Task 1 RED
- **Issue:** `feed-kind-badge.tsx` 가 없으면 테스트 파일 import 가 실패해 단언이 아닌 로드 실패(INVALID_RED)가 된다.
- **Fix:** RED 커밋에 `null` 을 그리는 `FeedKindBadge` 자리표시를 같이 넣어 9건이 단언에서 실패하게 했다. GREEN 에서 구현으로 바꿨다.
- **Committed in:** `055aa24a`

**3. [문구 하나 더] 전체 목록 빈 상태 본문** — 제목을 「뉴스·공시」 로 바꾸면서 같은 칸 본문 「수집된 뉴스가 없습니다」 도 「뉴스·공시」 로 맞췄다(문구 목록 밖이지만 제목과 어긋나지 않게).

**Total deviations:** 2 auto-fixed (Rule 3 둘) + 문구 1
**Impact on plan:** 계약 이름(`FeedKindBadge` · props · 토큰 · data-slot · 카드 제목)은 Artifacts 그대로. 추가 계약: `FeedKindBadge` 에 선택 prop `className`, `NewsItem` 자료원 열 `data-slot="news-item-src"`.

## TDD Gate Compliance

- RED `055aa24a` `test(41-04)` → GREEN `1692b045` `feat(41-04)` 순서.
- RED 근거: `pnpm --filter @gh-radar/webapp exec vitest run src/components/stock/__tests__/news-item.test.tsx --maxWorkers=2` → exit 1 · 9 failed / 2 passed. 실패 9건은 배지 글자 · mini · ↗ · 링크 없는 줄 · 배지 위치 단언(`expected <a …> to be null`, `toHaveTextContent`, 자리표시가 null 이라 slot 조회 null). 통과 2건은 기존 동작(링크 속성 · time dateTime) 단언이라 그대로 맞다. 의미 평가: 대상 행위는 계획한 단언에서 실패했다(로드 · 문법 실패 0). `gsd_run check tdd-red-evidence` 기록은 만들지 않았다(이 플랜은 `type: execute` · TDD_MODE 미지정).
- GREEN: 11/11 통과.

## Issues Encountered

- `webapp/e2e/fixtures/news.ts` 의 `NEWS_ITEM_SAMPLE` 은 옛 `NewsArticle` 모양(`kind` 없음)이다 — 이 플랜 파일 목록 밖이라 두었다. e2e 를 돌리면 배지가 빈 칸으로 보일 수 있다(단언에는 영향 없음 예상). 41-09 UAT 전에 fixtures 에 `kind: 'news'` 를 넣는 것이 좋다.

## User Setup Required

None.

## Next Phase Readiness

- 41-05 · 41-07 · 41-10 은 `import { FeedKindBadge } from '@/components/stock/feed-kind-badge'` 로 바로 쓴다(`size="mini"` · 여백은 `className`).
- server 응답이 `StockFeedItem[]` 이 되는 것은 41-14 — 둘이 합쳐져야 실제 화면에 공시 줄이 나온다.

## Self-Check: PASSED

- 생성 파일 2개 존재 · 커밋 `055aa24a` · `1692b045` · `b1f0731d` HEAD 조상 확인
- 수용 기준 재실행: `--feed-disc:` 2 · `export function FeedKindBadge` 1 · `news-item-nolink` 2 · stock-api `StockFeedItem` 8 · news-item.test `it(` 11 · `관련 뉴스·공시` 3 · 옛 문구 grep 빈 출력 · `NewsArticle` grep 빈 출력
- 플랜 verification: news-item · stock-detail-client · stock-info-modal 41/41 통과 · webapp typecheck(e2e tsconfig 포함) 통과

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-11*
