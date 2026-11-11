---
phase: 41-kis-news-and-disclosure-feed
plan: 07
subsystem: ui
tags: [react, nextjs, tailwind-container-queries, vitest, context]

requires:
  - phase: 41-05
    provides: "StockFeedProvider(작업대 루트) · StockFeedEntriesContext · useStockFeedEntry · useStockFeedIsNew · useStockFeedAvailable · FeedRows band='lc' · formatFeedTime"
  - phase: 41-04
    provides: "FeedKindBadge · --feed-* 토큰"
provides:
  - "CardNewsStrip({ code, stockName }) — 상따 카드 한 줄 띠(첫 공시 | 첫 뉴스 · N건 ▾/▴) + 누르면 최근 3일 펼침(FeedRows band='lc')"
  - "shortDisclosureTitle(title, stockName) — 공시 제목 앞 회사명 걷기(띠 표시 전용)"
  - "CARD_NEWS_EMPTY_TEXT = '최근 3일 뉴스·공시 없음' · data-slot card-news-strip(data-state pending · empty · open · closed) · card-news-open"
  - "strategy-card.tsx — <CardHeader> 바로 뒤 · open && code 일 때 CardNewsStrip"
affects: [41-09]

actuals:
  tokens: 6700
  tasks: 2
  commits: 4
plan_head_before: ce941c686b0b83e2d1952f09caef629303b06668
plan_head_after: edd3d03e18c62930b505e0a23fd4ad80855a3f56

tech-stack:
  added: []
  patterns:
    - "띠 · 빈 줄 · 첫 응답 전 자리가 같은 상자 클래스(STRIP_BOX · min-h 30px)를 써서 응답이 와도 카드 높이가 출렁이지 않는다"
    - "카드는 새 props 없이 문맥에서 읽는 자식 하나만 끼운다 — memo 비교 불변"

key-files:
  created:
    - webapp/src/components/trading/card/card-news-strip.tsx
    - webapp/src/components/trading/__tests__/card-news-strip.test.tsx
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-07-T1-red.json
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-07-T2-red.json
  modified:
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx

key-decisions:
  - "띠는 펼친 카드에만 보인다 — 접힌 카드 묶음은 지금처럼 머리줄 한 줄(Claude 재량 · 41-09 UAT 확인)"
  - "띠 위아래 · 펼침 아래 구분선은 목업의 --border 대신 TDS hairline --border-subtle(행 구분선 가드 tds-tokens.test)"
  - "건수는 entry.count(상한 도달 시 「N건+」) — 41-05 돌파 상세 머리와 같은 표기"
  - "shortDisclosureTitle 은 이름 뒤 공백을 요구한다 — 「가람전자우 배당」 같은 다른 종목명 접두는 걷지 않는다 · 걷은 결과가 빈 문자열이면 원 제목"

patterns-established:
  - "상따 카드 안 새 부품은 뷰포트 분기 없이 lc 컨테이너 경계(FeedRows band='lc' 685)만 쓴다"

requirements-completed: [SC-6]

coverage:
  - id: D1
    description: "띠 표시 — 첫 공시(배지 · 시각 · 회사명 걷은 제목) 「|」 첫 뉴스(배지 · 시각 · 제목) · 「N건 ▾」/「N건+ ▾」 · 한 종류만이면 구분자 없음 · 받은 순서에서 고를 뿐 재정렬 없음(D-14)"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-news-strip.test.tsx#CardNewsStrip"
        status: pass
    human_judgment: false
  - id: D2
    description: "shortDisclosureTitle — (주)/주식회사 접두 · 뒤 (주) · 이름 없으면 원 제목 · 정규식 특수문자 이스케이프"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-news-strip.test.tsx#shortDisclosureTitle"
        status: pass
    human_judgment: false
  - id: D3
    description: "펼침/접힘(aria-expanded · aria-controls · ▾/▴) · 펼친 목록 원 제목 · lc 685 경계 · 클릭 전파 차단 · 빈 줄 · 첫 응답 전 자리 · 공급자 밖 없음 · 새 글 --new-bg"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-news-strip.test.tsx#CardNewsStrip"
        status: pass
    human_judgment: false
  - id: D4
    description: "카드 결선 — 펼친 카드 · 코드 있음 · 공급자 안일 때만 헤더 바로 다음 형제 · 기존 카드 테스트 회귀 0"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#Phase 41 상따 카드 뉴스·공시 띠 (D-18)"
        status: pass
    human_judgment: false
  - id: D5
    description: "목업 ③ 과 같은 모양 — 띠 한 줄 말줄임 · 펼친 줄 자료원 위치 · 카드 폭 밴드별 잘림 · 겹침 없음"
    verification: []
    human_judgment: true
    rationale: "시각 대조는 41-09 UAT 몫 — 이 플랜은 브라우저 렌더를 보지 않았다"

duration: 10min
completed: 2026-11-12
status: complete
---

# Phase 41 Plan 07: 상따 카드 뉴스·공시 띠 Summary

**펼친 상따 카드의 종목 줄 바로 아래에 「공시 15:15:01 단일판매ㆍ공급계약체결 | 뉴스 15:16 … · 4건 ▾」 한 줄 띠가 붙고, 누르면 최근 3일 글 전부(`FeedRows band="lc"`)가 아래로 펼쳐진다. 새 글이면 띠가 `--new-bg` 로 칠해진다(작업대 공급자 1초 시계).**

## Performance

- **Duration:** 약 10분
- **Completed:** 2026-11-12
- **Tasks:** 2
- **Files:** 생성 4 · 수정 2

## 띠 상태 표

| 상태 | 조건 | 모양 | `data-slot` · `data-state` |
|---|---|---|---|
| 둘 다 | 공시 · 뉴스 모두 있음 | 공시(배지 · 시각 · 회사명 걷은 제목) 「\|」 뉴스(배지 · 시각 · 제목) · 오른쪽 「N건 ▾」(상한 「N건+ ▾」) | `card-news-strip` · `closed`(button) |
| 하나 | 한 종류만 있음 | 그 하나만 · 구분자 없음 | `card-news-strip` · `closed` |
| 없음 | 글 0건(수집 전 `collectedAt: null` 포함) | 누를 수 없는 빈 줄 「최근 3일 뉴스·공시 없음」 · `--faint` | `card-news-strip` · `empty`(div) |
| 첫 응답 전 | 공급자 안 · 그 코드 응답 아직 없음 | 글자 없는 같은 높이(30px) 자리 | `card-news-strip` · `pending`(div · aria-hidden) |
| 펼침 | 띠 클릭 | 「N건 ▴」 · 바로 아래 `FeedRows band="lc"`(원 제목 · 자료원은 카드 폭 685 이상 오른쪽 칸 · 그 아래 제목 아래 줄) · 다시 클릭하면 접힘 | `card-news-strip` · `open` + `card-news-open` |
| 강조 | 띠에 보이는 공시 · 뉴스 id 가 새 글(30초) | 띠 전체 `bg-[var(--new-bg)]` | `data-new="true"` |
| 공급자 밖 | 작업대가 아닌 자리 | 아무것도 그리지 않음 | — |

**결정:** 띠는 펼친 카드에만 보인다 — 접힌 카드 묶음은 지금처럼 머리줄 한 줄(Claude 재량 · 41-09 UAT 확인).

## Task Commits

1. **Task 1: `CardNewsStrip`** — `aaea0359` (test · RED) → `cdaeb078` (feat · GREEN)
2. **Task 2: 카드 결선** — `cae0e51c` (test · RED) → `edd3d03e` (feat · GREEN)

## TDD Gate Compliance

- T1 RED: `tdd-red/41-07-T1-red.json` — `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK`(target 「공시 · 뉴스가 다 있으면 … 오른쪽 「N건 ▾」」 · 첫 단언 `expected null not to be null` — 스텁이 null 을 그림 · 모듈 로드 성공). 전체 실행에서는 12건 중 11건이 단언 실패, 「공급자 밖이면 그리지 않음」 1건은 부재 단언이라 구현 전에도 참. GREEN 12/12.
- T2 RED: `tdd-red/41-07-T2-red.json` — `RED_EVIDENCE_OK`(target 「펼친 카드에만 띠 …」 · 띠 null). 전체 31건 중 대상 1건만 실패 · 기존 27건 회귀 0 · 부재를 단언하는 새 3건은 결선 전에도 참. GREEN 31/31.
- 전체 파일 tap 출력은 여러 줄 오류 메시지 때문에 분류기가 `invalid_record`(Malformed TAP)로 거절 — 41-05 와 같이 대상 하나만 `-t` 로 돌리고, 대상 첫 단언을 한 줄 메시지 꼴(`expect(strip()).not.toBeNull()`)로 두었다(단언 뜻은 같다).

## 테스트 수

- `card-news-strip.test.tsx` 12(`shortDisclosureTitle` 2 · `CardNewsStrip` 10)
- `strategy-card.test.tsx` 31(새 4: 「펼친 카드에만 띠」 · 「접힌 카드 띠 없음」 · 「코드 없는 카드 띠 없음」 · 「공급자 밖 띠 없음」)

## Files Created/Modified

- `webapp/src/components/trading/card/card-news-strip.tsx` — 띠 부품 · `shortDisclosureTitle` · `CARD_NEWS_EMPTY_TEXT` · 머리 설계 주석(D-18 · D-20 · gh-trade 상따 1 · 펼친 카드에만)
- `webapp/src/components/trading/__tests__/card-news-strip.test.tsx` — 문맥 주입(`StockFeedEntriesContext`) + 강조는 실제 `StockFeedProvider`(fetch 목)
- `webapp/src/components/trading/card/strategy-card.tsx` — import · 헤더 뒤 결선 · 설계 주석 ⑤ 한 줄
- `webapp/src/components/trading/__tests__/strategy-card.test.tsx` — 결선 4 케이스
- `tdd-red/41-07-T1-red.json` · `tdd-red/41-07-T2-red.json`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 프로젝트 규칙] 띠 · 펼침 구분선을 `--border` 대신 `--border-subtle`**
- **Found during:** Task 1
- **Issue:** 플랜 action 은 목업대로 띠 「위아래 `--border` 선」 이라 했으나, 방향 테두리에 `--border` 를 쓰면 행 구분선 가드(`src/styles/__tests__/tds-tokens.test.ts`)가 실패한다(웨이브 3 에서 한 번 깨진 규칙).
- **Fix:** `border-y` · `border-b` 를 `border-[var(--border-subtle)]` 로. tds-tokens 85건 통과.
- **Files modified:** webapp/src/components/trading/card/card-news-strip.tsx
- **Committed in:** cdaeb078

**2. [Rule 2 - 접근성] 펼침 영역 `aria-controls` 연결**
- **Found during:** Task 1
- **Issue:** 플랜은 버튼 `aria-expanded` 만 명시. 펼친 영역을 가리킬 곳이 없으면 보조기기가 무엇이 펼쳐졌는지 모른다.
- **Fix:** `useId` 로 펼침 영역 id · 펼친 동안 버튼 `aria-controls`. 테스트가 단언한다.
- **Committed in:** cdaeb078

---

**Total deviations:** 2 auto-fixed (Rule 2 둘). 범위 확장 없음.

## Issues Encountered

- tap 리포터 여러 줄 오류 메시지 Malformed — TDD Gate Compliance 절에 처리 기록.

## Known Stubs

없음. (T1 RED 스텁은 같은 태스크 GREEN 커밋에서 실제 구현으로 바뀜.)

## User Setup Required

None.

## Next Phase Readiness

- 41-09 UAT 에서 목업 ③ 과 시각 대조 · 접힌 카드에 띠가 없는 결정 확인.

## Verification

- `pnpm --filter @gh-radar/shared build` → 성공
- `pnpm exec vitest run src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx src/components/trading/__tests__/card-news-strip.test.tsx src/styles/__tests__/tds-tokens.test.ts src/styles/__tests__/table-head-align.test.ts --maxWorkers=2`(cwd webapp) → 6 files · 248 passed
- `pnpm exec vitest run src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/card-body.test.tsx --maxWorkers=2` → 2 files · 221 passed(카드를 공급자 안에서 그리는 작업대 회귀 0)
- `pnpm --filter @gh-radar/webapp run typecheck` → 통과(오류 0)
- acceptance grep: `CARD_NEWS_EMPTY_TEXT = '최근 3일 뉴스·공시 없음'` 1 · `export function shortDisclosureTitle` 1 · `@media|sm:|md:|lg:|xl:` 0줄 · card-news-strip `it(` 12 · strategy-card `CardNewsStrip` 3

## Self-Check: PASSED

- 생성 파일 2개(+ RED 증거 2개) 존재 확인
- 커밋 `aaea0359` · `cdaeb078` · `cae0e51c` · `edd3d03e` 모두 HEAD 조상(`git log ce941c68..HEAD`)
- STATE.md / ROADMAP.md 손대지 않음

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-12*
