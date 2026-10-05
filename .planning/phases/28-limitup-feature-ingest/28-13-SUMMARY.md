---
phase: 28-limitup-feature-ingest
plan: 13
subsystem: webapp
tags: [nextjs, react, analytics, limitup, svg, decompressionstream, intersectionobserver, vitest, playwright]
status: complete

requires:
  - phase: 28-10
    provides: "GET /api/limitup/report (day · prev · fingerprint) · GET /api/limitup/grid-urls (서명 URL) · shared 계약 타입"
  - phase: 28-12
    provides: "/analytics/limitup 페이지 · dayRowsOf · scrollToEventCard(#ev-{isin} → h3 포커스) · fetchLimitupGridUrls"
provides:
  - "사건 카드(종목마다 1장 · section#ev-{isin} · h3 tabIndex -1) — 잠김 태그 · 레인 1 진입 10분 · 레인 2 잠김 전 구간 · 사실 문장 · 창구 비중"
  - "격자 파일 지연 로드 훅 useLimitupGrid — 서명 URL 날짜당 1회 · DecompressionStream gzip 해제 · (날짜, isin) 캐시 · 4xx 1회 재발급 · retry"
  - "창구 지문표(관찰 중 n<10 · 상위 20 + 더 보기) · 어제 결과(D+1 시가 손익)"
  - "lib/limitup-lanes.ts — gridSeries · entryWindowOf · lockWindowOf · laneEntryOf · laneLockOf · lockTagsOf · fmtSpan · circledNumber · factsSorted · memberBarsOf · fingerprintRowsOf · yesterdayRowsOf · layoutLaneLabels"
  - "e2e P28-R1 · P28-R1b(폰 390 라벨 겹침 실측)"
affects: [28-14, 28-15]

actuals:
  tokens: 31900
  tasks: 3
  commits: 3
plan_head_before: 7742e6bfb2f7363231183ae473f1ffb60ecf1130

tech-stack:
  added: []
  patterns:
    - "레인 좌표는 0~100 % 로 정규화해 SVG(viewBox 0 0 100 100 · preserveAspectRatio none)와 HTML 오버레이가 같은 x 를 쓴다"
    - "오버레이 글자는 layoutLaneLabels 가 14px 줄 칸에 겹치지 않게 놓고, 못 들어가면 버린다(마커 title 로만 남음)"
    - "IntersectionObserver root = 실제로 넘치는 스크롤 조상(없으면 뷰포트) · rootMargin 400px · 한 번 가까워지면 끝"
    - "실 export 픽스처를 lib 단위 · 컴포넌트 · 훅 · e2e 가 한 모듈(test-fixtures/limitup-export.ts)로 읽는다"

key-files:
  created:
    - webapp/src/lib/limitup-lanes.ts
    - webapp/src/lib/use-limitup-grid.ts
    - webapp/src/lib/__tests__/limitup-lanes.test.ts
    - webapp/src/lib/__tests__/use-limitup-grid.test.tsx
    - webapp/src/test-fixtures/limitup-export.ts
    - webapp/src/components/analytics/limitup-event-card.tsx
    - webapp/src/components/analytics/limitup-lane.tsx
    - webapp/src/components/analytics/limitup-fingerprint-table.tsx
    - webapp/src/components/analytics/limitup-yesterday-table.tsx
    - webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx
    - webapp/src/components/analytics/__tests__/limitup-tables.test.tsx
    - webapp/e2e/fixtures/limitup-report.ts
    - webapp/e2e/specs/limitup-report.spec.ts
  modified:
    - webapp/src/components/analytics/limitup-report.tsx
    - webapp/src/components/analytics/__tests__/limitup-report.test.tsx

key-decisions:
  - "레인 2 「최대」 점은 잠김 구간 안의 최대 잔량이다(창 전체 최대가 아니다) — 창 앞 120초에 잠김 전 잔량이 더 큰 날이 있다(덕우전자 09:04 35.2억 vs 잠김 중 27.5억). gh-trade 사실 「잠김 N 최대 잔량」 과 같은 축"
  - "레인 2 y 하한 20억(하루 격자 스파크와 같은 바닥) — 기준선 10억이 늘 보인다"
  - "지속 표기(fmtSpan)는 내림 — 3700초 = 「1시간 1분」(플랜 behavior). gh-trade _fmt_s 의 반올림과 다를 수 있다"
  - "서명 URL 재발급은 4xx 전부(403 · 400 포함)에서 1회 — 그 뒤 실패는 error 로 두고 자동 재시도하지 않는다(「다시 시도」)"
  - "레인 캡션 범위(「09:00~09:07」)는 격자 없이 entries · locks 로 계산한다 — 로딩 중에도 캡션이 보인다(entryWindowOf · lockWindowOf)"
  - "창구 막대 % 는 facts values 그대로 소수 1자리(「54.4%」, 100 이면 「100%」) — 40px 칸 안"
  - "어제 결과 행 순서 = isin(gh-trade _section_yesterday 정렬) · 손익은 d1_open 이 있을 때만"

requirements-completed: [D-11, D-12]

coverage:
  - deliverable: "레인 · 표 계산 lib(gh-trade 창 · 마커 규칙) + 라벨 배치"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limitup-lanes.test.ts (29건 — 실 export 20261002 + 합성)"
        status: pass
  - deliverable: "격자 로더 훅(서명 URL 1회 · gzip 해제 · 캐시 · 만료 재발급 · retry)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-limitup-grid.test.tsx (7건 — 실 격자 gzip 바이트)"
        status: pass
  - deliverable: "사건 카드 · 레인 · 색 감사"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx (11건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/limitup-report.spec.ts#P28-R1 (e)(f) 색 감사"
        status: pass
  - deliverable: "창구 지문표 · 어제 결과"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/limitup-tables.test.tsx (5건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/limitup-report.spec.ts#P28-R1 (g)(h)"
        status: pass
  - deliverable: "보고서 한 장 종단(사이드바 → 날짜 → 격자 → 카드 → 지문표 → 어제 결과 · 빈 날짜 · 403)"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/limitup-report.spec.ts#P28-R1 · #P28-R1b"
        status: pass
  - deliverable: "레인 시각 품질(실데이터 29종목 · 곡선 밀도 · 라벨 가독성)"
    human_judgment: true
    rationale: "실 export 20261002 29종목을 1280 · 820 · 1440 · 390 에서 executor 가 스크린샷으로 확인했다(라벨 겹침 0 · 넘침 0). 1초 해상도 매도벽 곡선의 밀도 같은 취향 판단은 사용자 UAT 몫"

duration: 27min
completed: 2026-10-05
---

# Phase 28 Plan 13: 보고서 ② — 사건 카드 · 창구 지문표 · 어제 결과 Summary

**하루 격자 아래에 종목마다 사건 카드를 붙였다. 카드는 진입 10분 레인과 잠김 전 구간 레인, 사실 문장, 창구 막대로 되어 있다. 격자 파일은 카드가 화면 가까이 올 때 서명 URL 로 받아 브라우저에서 gzip 을 푼다. 꼬리에는 90일 창구 지문표와 어제 결과를 달았다. 이로써 gh-trade D-20 구성(B 하루 격자 → A 사건 카드 → C 창구 지문표 → 어제 결과)이 `/analytics/limitup` 한 장에 모두 들어갔다.**

## Performance

- **Duration:** 약 27분
- **Started:** 2026-10-05T11:03:53Z
- **Completed:** 2026-10-05T11:30:27Z
- **Tasks:** 3
- **Files:** 신규 13 · 수정 2

## Accomplishments

- `lib/limitup-lanes.ts`: 창과 마커 규칙은 gh-trade `_section_a_cards` 를 따르고, 그림 규칙은 UI-SPEC ④-4 를 따른다. 정의 출처는 머리 주석에 행 번호까지 적었다.
  - 레인 1 창 = [기준 − 600, 기준 + 60] ∩ 09:00~15:29:59. 기준은 첫 상한 체결 → t{detect} → t25/t20/t15 → 첫 잠김 시작 순으로 고른다.
  - 레인 2 창 = [첫 잠김 − 120, 마지막 잠김 끝(장 끝까지면 15:30) + 60].
  - 마커: 25% 도달(창 안일 때만), 매도벽 소진(기준 이하에서 처음 0), 첫 상한가 체결, 최대 점, ▼ burst_sell, ✕ cancel, 깨짐 ●.
  - 글자 라벨은 가장 큰 ▼ 하나(「09:06 매도 6,713주」)와 가장 큰 ✕ 하나(「취소 −4.6억」)에만 단다. 나머지 마커는 title 만 있다.
- `lib/use-limitup-grid.ts`:
  - 모듈 캐시 두 개를 둔다. 날짜 → 서명 URL 목록 Promise, (날짜, isin) → 격자.
  - 진행 중인 요청을 묶어서 같은 격자를 두 번 받지 않는다.
  - 서명 URL fetch 가 4xx 면 grid-urls 를 한 번만 다시 받는다. 그래도 실패면 error 로 두고 「다시 시도」 를 기다린다.
- 사건 카드:
  - 머리는 h3 종목명 + 「{코드} · 상한가 {N}」 + 잠김 태그다(「잠김 ③ · 42분 뒤 깨짐」 `--up` · 「잠김 ④ · 종가 유지」 `--down`). 7개 이상이면 「+N」 을 붙이고 나머지는 title 에 둔다.
  - < xl 은 한 열, xl 은 `2fr 1fr` 두 열(간격 24px)이다.
  - 로딩 중에는 레인 높이를 지킨 빈 면에 「불러오는 중…」 이 뜨고, 실패하면 「곡선을 불러오지 못했어요」 + 「다시 시도」 가 뜬다. 사실 문장과 창구 막대는 그대로 남는다.
- 레인:
  - SVG 는 선 · 면 · 음영만 그린다(`vectorEffect` non-scaling 1.5px · `role="img"` + 요약 aria-label).
  - 마커와 글자는 `aria-hidden` HTML 오버레이에 11px 고정으로 그린다. 오버레이 위치는 `layoutLaneLabels` 가 잡는다.
- 지문표: 사건 ≥ 10 행은 매수 두 칸을 `--up`, 매도 칸을 `--down` 으로 칠하고 상태에 「—」 를 둔다. 사건 < 10 행은 행 전체를 `--muted-fg` 로 하고 「관찰 중」 태그를 단다(수치는 그대로). 상위 20행 아래에 「창구 N개 더 보기」 가 있다.
- 어제 결과: 「종목 · 상한가 · D+1 시가 · 손익」. 손익은 `fmtRet(d1_ret × 100)` 에 색 축을 붙이고, 값이 없으면 「—」 다.

## Task Commits

1. **Task 1: 레인 · 표 계산 lib + 격자 로더 훅** — `4950e4e5` (feat). TDD 순서: 틀린 값을 돌려주는 RED 스텁에서 lanes 26건과 훅 6건이 assertion 으로 실패하는 것을 먼저 봤다. 두 기록 모두 `check tdd-red-evidence` 가 RED_EVIDENCE_OK 를 냈다. 그 뒤 GREEN 을 만들고, 플랜 지시(「green 뒤 한 커밋」)대로 한 커밋에 넣었다.
2. **Task 2: 사건 카드 · 레인 · 지문표 · 어제 결과 · 보고서 배선 · 색 감사** — `2d90eefd` (feat)
3. **Task 3: e2e P28-R1 · P28-R1b** — `5276fafc` (test). 이 과정에서 찾은 시각 결함 두 건(아래 Deviations 3 · 4)의 수정도 같은 커밋에 들어 있다.

## 색 감사 결과

- 단위(`limitup-event-card.test.tsx`)와 e2e(P28-R1, 보고서 전체 SVG)가 같은 조건을 확인한다.
  - SVG 안 모든 `stroke`/`fill` 값이 `var(--fg)` · `var(--muted)` · `var(--led-latent)` · `var(--border-subtle)` · `none` 중 하나다.
  - SVG 자식은 `rect`/`line`/`path` 뿐이고, `text`/`tspan`/`foreignObject` 는 0개다.
  - `led-armed` 는 0번 나온다.
- 오버레이 색은 이렇다. 깨짐 ● 과 그 라벨 `--up`, ▼ `--down`, ✕ `--muted-fg`, 25% 도달 `--led-latent`, 첫 체결 · 최대 · 매도벽 소진 `--fg`.
- 정적 검사(`grep -E '<text|led-armed|recharts|from "d3'`, lane · event-card) 결과도 0건이다.

## 검증

- `pnpm --filter @gh-radar/shared build` · `webapp typecheck`(src + e2e): 오류 0
- `webapp test`: 149 파일, 3501 통과(1 skip). 이 플랜에서 늘어난 테스트는 52건이다(lanes 29 · 훅 7 · 카드 11 · 표 5).
- `playwright limitup-report.spec.ts sidebar-tree.spec.ts`: 11/11 통과(로컬 relay · dev 3100)
- e2e 스크린샷: `webapp/test-results/limitup-report-390.png`(gitignore 대상 · 로컬에만 있음)
- 실데이터 시각 점검:
  - 실 export `~/ticks/research/export/20261002`(29종목 · 잠김 12 · 격자 29)를 route 목으로 넣었다.
  - 1280 · 820 · 1440 · 390 폭에서 모든 카드를 화면에 올려 격자 37 레인을 받았다.
  - 측정 결과는 라벨끼리 겹침 0, 레인 밖으로 나간 라벨 0, 페이지 가로 넘침 0이다.
  - 임시 spec 은 지웠다. 스크린샷은 세션 scratchpad 에만 있다.

## Decisions Made

frontmatter `key-decisions` 참고. 요점은 세 가지다. 레인 2 최대 점은 잠김 구간 안에서 고른다. 서명 URL 재발급은 한 번만 한다. 캡션 범위는 격자 없이 계산한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 실 export 픽스처 로더 `webapp/src/test-fixtures/limitup-export.ts` 를 새로 만들었다**
- 플랜 files 목록에 없는 파일이다.
- lib 단위 · 훅 · 컴포넌트 테스트와 e2e 픽스처가 같은 워커 픽스처(entries · locks · facts · jumps → marks · 격자 gzip)를 읽게 한 곳에 모았다.
- **Commit:** 4950e4e5

**2. [Rule 3] 28-12 보고서 테스트의 `@/lib/limitup-api` 목에 `fetchLimitupGridUrls` 를 더했다**
- 보고서가 이제 사건 카드를 그린다. jsdom 에는 IntersectionObserver 가 없어 카드가 곧장 격자를 부르는데, 목에 그 export 가 없었다.
- 응답하지 않는 Promise 를 주어 레인이 「불러오는 중…」 에 머물게 했다.
- **Commit:** 2d90eefd

**3. [Rule 1 - Bug] 사건 카드가 고정 헤더(56px) 밑으로 숨었다**
- `scrollIntoView({block:"start"})` 는 문서 스크롤 기준이라 카드 머리가 sticky 헤더 아래로 들어갔다.
- `scroll-mt-[calc(4.5rem+var(--app-safe-top))]` 를 달았다(strategy-card 와 같은 문법). 이제 카드 상단은 뷰포트 위에서 약 72px 아래에 놓인다.
- 그래서 e2e (e) 의 판정은 「top < 80 + 72(scroll-margin)」, 「top > −80」 이다. 플랜의 「± 80px」 를 고정 헤더 아래 기준으로 읽은 것이다.
- **Commit:** 5276fafc

**4. [Rule 1 - 시각 결함] 레인 라벨이 곡선 · 마커와 겹쳐 읽기 어려웠다**
- 실데이터 티엠씨에서 ▼ 가 「최대 118.5억」 글자 위에 겹쳤다.
- 라벨에 반투명 카드 면(`color-mix(--card 78%)`)을 깔았다. 라벨끼리의 겹침은 원래 0이었다(`layoutLaneLabels`).
- **Commit:** 5276fafc

**5. [Rule 2] 라벨 배치 함수 `layoutLaneLabels` · `estimateLabelWidth` 를 lib 에 더했다**
- 플랜 Artifacts 표에 없는 함수다. 그러나 「폰 360px 에서 라벨이 겹치지 않는다」(E8 overflow backstop)를 지키려면 필요했다.
- 실데이터에서 깨짐 · 최대 · ▼ · ✕ 라벨이 11초 안에 몰리는 경우가 있다(덕우전자).
- 단위 3건과 e2e P28-R1b 가 겹침 0 을 확인한다.
- **Commit:** 2d90eefd

---

**Total deviations:** 5 (Rule 3 2 · Rule 1 2 · Rule 2 1)
**Impact on plan:** 범위 변화 없음. 모두 이 플랜 표면 안에서 처리했다.

## Issues Encountered

- 플랜 truths 에 「격자 파일 요청은 화면 근처 카드 수만큼」 이 있다. e2e 에서 이를 세다 보니, ‹ 로 연 앞 문서(10/01)의 늦은 격자 요청이 다음 문서 기록에 섞였다. 요청 URL 의 날짜로 걸러 이 문서 것만 센다. 앱 쪽 문제는 아니다(문서마다 모듈 캐시가 새로 시작한다).
- 1초 해상도 매도벽 곡선(레인 1 아래 절반)은 실데이터에서 매우 촘촘하다. 데이터를 그대로 그린 결과라 손대지 않았다. 취향 판단은 UAT 로 넘긴다.

## Known Stubs

없음.

## User Setup Required

None. 원격 RPC · 버킷 적용(28-14)과 server/webapp 배포(28-15)가 끝나야 실데이터가 보인다. 이 플랜은 커밋만 했다(push · 배포 없음).

## Next Phase Readiness

- 보고서 웹 표면이 다 들어갔다. 남은 일은 원격 적용(28-14)과 배포(28-15)다.
- Ready for 28-14.

## Self-Check: PASSED

- 신규 13 · 수정 2 파일 FOUND · 커밋 4950e4e5 · 2d90eefd · 5276fafc FOUND
