---
phase: 25-order-log-progress
plan: 08
subsystem: webapp
tags: [today-orders, timeline, expand, order-log, live, debounce, e2e]
status: complete

requires:
  - phase: 25-03
    provides: "GET /api/orders/:id/events · shared OrderTimelineRow · compareTimelineAsc · timelineRowKey · JournalEventRow"
  - phase: 25-04
    provides: "timelineStrategyText · formatKstMs · strategy-day 하루 흐름 픽스처(골든)"
  - phase: 25-05
    provides: "orderActionWord 「주문」 · RECEIPT_UNKNOWN_RESULT_CODE · 별건 3 칩(data-side · data-tone · data-side-ref)"
provides:
  - "MergedOrderNotice.members — 묶음 구성원 시간 오름차순 · 펼침 키 members[0].id"
  - "fetchOrderEvents(anchorId, orderNos) — GET /api/orders/:id/events?orderNos="
  - "lib/order-timeline — TimelineLine · journalTimelineLine · buildTimeline · liveStrategyRows · memberOrderNos · isExpandable · membersSeqSignature · TIMELINE_REFETCH_DEBOUNCE_MS=400"
  - "components/trading/order-timeline — OrderTimeline(조회 1회 · 상태 3종 · 라이브 끼워 넣기 · 400ms trailing · in-flight 접기)"
  - "오늘 주문 카드 행 펼침(데스크톱 colSpan 8 상세 행 · 모바일 점선 블록 · ExpandToggle)"
  - "test-fixtures/order-timeline — 12451 · 12453 · 묶음 12461~12467 · 수동 12470 통보 + 응답 · TIMELINE_BY_ANCHOR"
affects: [25-09, 25-10, 25-11, 25-12]

actuals:
  tokens: 25500    # chars/4 over 25-08 커밋의 추가 줄(101,889자)
  tasks: 3
  commits: 7       # MEASURED rev-list 9797f6ac..HEAD — 이 중 2건(8c785483 · 0dbfc860)은 동시 세션 quick-260929-sar 커밋, 25-08 커밋은 5건
plan_head_before: 9797f6ac59fb91ebcb539ac15e34cc1f5dd99068

tech-stack:
  added: []
  patterns:
    - "표 ↔ 카드 행이 둘 다 DOM 에 있는 표면에서 데이터 조회가 붙은 본문은 보이는 배치 한 곳에만 마운트(useSyncExternalStore + matchMedia 경계 = CSS 경계와 같은 값)"
    - "개발 StrictMode 이중 마운트에서 요청 1회 — 마운트 effect 는 in-flight 이면 새로 부르지 않고 진행 중 요청 결과를 재사용(alive ref 는 재마운트에서 다시 참)"
    - "통보 문장은 판정 입력(notice_type · request_kind · side_trusted · result_code · local_reject · org_order_no · board)만 보고 message 는 거부 꼬리로 붙이기만 — 문구 파싱 0"
    - "상따 문장은 shared timelineStrategyText 출력({action,text})을 그대로 배치 — webapp 에서 문장 조각을 자르거나 잇지 않는다(D-09 · 2줄 형식 변경 대비)"

key-files:
  created:
    - webapp/src/lib/order-timeline.ts
    - webapp/src/components/trading/order-timeline.tsx
    - webapp/src/test-fixtures/order-timeline.ts
    - webapp/src/lib/__tests__/order-timeline.test.ts
    - webapp/src/components/trading/__tests__/order-timeline.test.tsx
  modified:
    - webapp/src/lib/order-notices.ts
    - webapp/src/lib/orders-api.ts
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/lib/__tests__/order-notices.test.ts
    - webapp/src/lib/__tests__/orders-api.test.ts
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "펼침 본문(= 조회)은 보이는 배치(표 ≥1280 / 카드 행 <1280) 한 곳에만 마운트 — 두 배치가 모두 DOM 에 있어 양쪽에 두면 클릭 1회 = GET 2회가 된다(D-02 위반)"
  - "오늘 주문 행 렌더 키도 members[0].id — head 키면 조각이 들어올 때 본문이 다시 마운트되어 재조회 · 로딩 줄이 뜬다"
  - "시간외종가 접두는 방향 줄 · 전량 체결 · 취소/정정 확인 · 거부(취소/정정/신규/로컬)에 문장 앞 「시간외종가 」 — 접수 불명(−2) · 모르는 통보는 붙이지 않는다"
  - "묶음 줄 꼬리의 주문번호는 그 줄이 속한 구성원 — 새 번호로 온 취소 · 정정 확인(order_no 12460 · org 12453)은 원주문 번호로 단다"
  - "0건 문구는 줄이 하나도 없을 때만 — 통보만 있는 수동 주문은 빈 문구 없이 통보 줄만"
  - "e2e P25-E 는 /api/orders 를 전용 목록으로 덮어쓴다 — 기존 TODAY_ORDERS 건수 단언(9행 · 6줄 · 7건/2건)을 흔들지 않는다"

patterns-established:
  - "ExpandToggle — 시각 칸 실제 button(aria-expanded · aria-controls · ▶ aria-hidden · sr-only 「{종목} {행위} 펼치기/접기」) · 불가 행은 ▶ 자리만 visibility hidden"
  - "층 없는 .tbl-wrap 규칙을 이기는 셀 스타일은 ! 수식어(!h-auto · !pt-0.5 · !pb-2.5 · !bg-transparent · [&>td]:!bg-…) — e2e 에서 getComputedStyle 로 실측"

requirements-completed: []

coverage:
  - id: D1
    description: "순수 함수 — 묶음 구성원 · 통보 문장 표(템플릿 v0) · running sum/전량 · 같은 ms 통보 먼저 · 라이브 선택 · 시그니처 · 조회 클라이언트"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-timeline.test.ts (26)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑭ members (4)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/orders-api.test.ts#fetchOrderEvents (3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "OrderTimeline — 조회 1회 · 로딩/0건/실패+다시 시도 · 묶음 꼬리 · 라이브 끼워 넣기 · 400ms trailing 디바운스 · in-flight 접기 · 재조회 실패 기존 줄 유지"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/order-timeline.test.tsx (9 · 가짜 타이머)"
        status: pass
    human_judgment: false
  - id: D3
    description: "오늘 주문 카드 행 펼침 — 시각 칸 토글 · 행 전체 클릭 · colSpan 8 상세 · 동시 펼침 · 불가 행 · 모바일 점선 블록 · 닫힘 뒤 조회 0 · head 교체에도 열린 채"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑭-1~⑭-5"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P25-E1~E5 · E7"
        status: pass
    human_judgment: false
  - id: D4
    description: "백스톱 E2 overflow — 390 최장 상따 「주문」 줄 줄바꿈 넘침 0 · 시각 78px"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P25-E6 (leavesOverflowing [] · li 높이 > 2.5줄 · 시각 칸 78px · 스크린샷 p25-e6-390-expand.png)"
        status: pass
    human_judgment: false
  - id: D5
    description: "펼침 타임라인 시각 밀도 · 모바일 flex-wrap 줄바꿈 모양(문장이 시각 아래 줄로 내려가는 목업 동작)의 가독성"
    human_judgment: true
    rationale: "목업 .row .det .tl li { flex-wrap } 그대로 구현했고 넘침은 e2e 로 잠겼지만, 짧은 문장은 한 줄 · 긴 문장은 다음 줄로 내려가는 들쭉날쭉함이 트레이더에게 읽기 좋은지는 사람이 본다"

duration: 19min
completed: 2026-09-29
---

# Phase 25 Plan 08: 오늘 주문 행 펼침 — 통보 + 상따 한 타임라인 Summary

**오늘 주문 행을 시각 칸 버튼 · 행 전체 클릭으로 펼치면 저널 통보(템플릿 v0 문장 · 주문번호별 running sum)와 상따 전략 이벤트(shared `timelineStrategyText`)가 `gw_time_ms` 순(같은 ms 통보 먼저) 한 타임라인으로 서고, 묶음 행은 `#주문번호` 꼬리 · 라이브 전략 이벤트 끼워 넣기 · lastSeq 400ms trailing 재조회까지 붙었다.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-29T11:52:45Z
- **Completed:** 2026-09-29
- **Tasks:** 3
- **Files modified:** 12 (신규 5 · 수정 7)

## Accomplishments

- `MergedOrderNotice.members`(시간 오름차순) · `fetchOrderEvents` · `lib/order-timeline.ts` 순수 함수 7종 — 통보 문장 표 전 갈래(A 접수/예약 · E 체결/전량/분모 없음 · C 취소 확인/거래소 취소 · M 행 qty/요청 · R 취소·정정 거부/접수 불명/로컬/신규 · 모르는 통보) · board G2/G3 · 방향 side_trusted
- `OrderTimeline` — 마운트 조회 1회(StrictMode 이중 마운트에도 1회) · 로딩 + aria-busy · 0건 · 실패 role=status + 다시 시도 · 재조회 중 로딩 줄 없음 · 재조회 실패 시 기존 줄 유지 + 아래 실패 줄 · 스토어 전략 이벤트 순서 자리 끼워 넣기(재조회 0) · 구성원 lastSeq → 400ms trailing 1회 · in-flight 1건 접기 · 폴링 없음
- 오늘 주문 카드 — 데스크톱 `<Fragment>` 행 + `tr[data-slot=today-order-detail] td[colSpan=8]` · 모바일 r2 아래 점선 블록 · ▶ 회전(150ms · reduced-motion 즉시) · 열린 행 primary 6% · 불가 행 ▶ visibility hidden · 커서/hover 없음 · 여러 행 동시 · 메모리 Set · 렌더 키 = 펼침 키 = `members[0].id`
- e2e me.spec P25-E1~E7 전부 green + me.spec 전체 green(18 케이스)

## 통보 문장 표 적용 범위

플랜 Context 표 15갈래 전부 `journalTimelineLine` 에 구현 · 단위 테스트로 잠금. 실데이터 경로 e2e 로 확인된 것은 A 접수 · E 체결(누적 100/300 · 120/600) · E 전량 체결(300/300 · 600/600) · C 취소 확인(새 번호 12460 → 원주문 12453 타임라인). M · R · 예약 Q-ID · board 는 단위 테스트만(픽스처 행이 e2e 로 펼쳐지지 않는 갈래 — R 은 주문번호가 없어 펼침 자체가 없다). 문구 파싱 0(acceptance grep 0).

## e2e 결과

- `playwright test e2e/specs/me.spec.ts -g "P25-E"` — **8 passed**(P25-E1~E7 7건 + auth setup 1건)
- `playwright test e2e/specs/me.spec.ts` — **19 passed**(기존 11 + P25-E 7 + setup) · 실패 0
- **백스톱 E2 overflow 실측(P25-E6 · 390×844):** 12451 카드 행 펼침 → 첫 줄(상따 「주문」 선매수 · 조건 … · 누적 861,800) `leavesOverflowing(li, 목록 오른쪽) = []` · li 높이 > 11px×1.5×2.5(줄바꿈 실제 발생) · 타임라인 시각 칸 6개 모두 `Math.round(width) === 78` · 스크린샷 `test-results/…/p25-e6-390-expand.png` 육안 확인(넘침 · 겹침 없음)
- **상세 셀 `!` 수식어 실측(P25-E1 · 1280):** padding-top 2px · padding-bottom 10px · white-space normal · 높이 > 96px · 열린 행 셀 배경 ≠ 투명 — 층 없는 `.tbl-wrap tbody td` 규칙을 이겼다(globals.css 무변경)

## Task Commits

1. **Task 1: 순수 함수 · 조회 클라이언트** — `c7d52ac7` (test · RED) → `1297921f` (feat · GREEN)
2. **Task 2: 펼침 UI · OrderTimeline** — `8fdd492a` (test · RED) → `a21bc290` (feat · GREEN)
3. **Task 3: 브라우저 증거** — `f82971cb` (test)

## Files Created/Modified

- `webapp/src/lib/order-timeline.ts` — 통보 문장 표 · 타임라인 조립 · 라이브 선택 · 시그니처 · 400ms
- `webapp/src/components/trading/order-timeline.tsx` — `OrderTimeline` 펼침 본문
- `webapp/src/test-fixtures/order-timeline.ts` — 테스트 전용 통보 · 응답 픽스처(상따 줄은 strategy-day 재사용)
- `webapp/src/lib/order-notices.ts` — `members` 필드
- `webapp/src/lib/orders-api.ts` — `fetchOrderEvents`
- `webapp/src/components/trading/today-orders-card.tsx` — 머리 ⑬ · `ExpandToggle` · 상세 행/블록 · `useTableLayout`
- 테스트 4 파일 · `webapp/e2e/specs/me.spec.ts`(P25-E1~E7)

## Decisions Made

frontmatter `key-decisions` 6건 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 표 · 카드 행 두 배치가 모두 DOM 에 있어 펼침 조회가 2회 나갈 수 있었다**
- **Found during:** Task 2 설계
- **Issue:** 카드는 CSS(`max-[1279px]:hidden` / `min-[1280px]:hidden`)로 한쪽만 보이게 두 벌을 렌더한다. 펼침 본문을 양쪽에 두면 클릭 1회 = GET 2회(D-02 · e2e 「요청 1회」 위반).
- **Fix:** `useTableLayout()`(useSyncExternalStore + `matchMedia("(min-width: 1280px)")` — CSS 경계와 같은 값)으로 보이는 배치에서만 `OrderTimeline` 을 마운트. 상세 컨테이너(`aria-controls` 대상)는 양쪽에 둔다. id 는 배치별(`-t-` / `-m-`)로 갈라 중복 없음.
- **Files modified:** webapp/src/components/trading/today-orders-card.tsx
- **Verification:** 단위 ⑭-4(조회 1회) · e2e P25-E1 · E6(`mock.urls` 1건)
- **Commit:** a21bc290

**2. [Rule 1 - Bug] 개발 StrictMode 이중 마운트가 조회를 2회 부를 수 있었다**
- **Found during:** Task 2 (next.config `reactStrictMode: true` · e2e 는 dev 서버)
- **Fix:** 마운트 effect 는 in-flight 이면 새로 부르지 않고 진행 중 요청 결과를 재사용(alive ref 는 재마운트에서 다시 참).
- **Files modified:** webapp/src/components/trading/order-timeline.tsx
- **Verification:** e2e P25-E1 600ms 대기 뒤 요청 URL 정확히 1건
- **Commit:** a21bc290

**3. [Rule 1 - Bug] head 키 렌더는 조각이 들어올 때 펼침 본문을 다시 마운트한다**
- **Issue:** 기존 렌더 키 `notice.head.id` 는 새 조각(최신)이 들어오면 바뀐다 → 열린 본문 언마운트/재마운트 → 재조회 + 로딩 줄(「조각이 더 들어와도 열린 채 유지」 위반).
- **Fix:** 렌더 키를 펼침 키와 같은 `members[0].id` 로.
- **Verification:** 단위 ⑭-5(head 교체 뒤에도 aria-expanded true)
- **Commit:** a21bc290

**4. [의도된 파급] 기존 단위 테스트 ⑦-4 기대값 갱신**
- 17-10 의 「묶인 행을 펼치는 UI 는 만들지 않는다(범위 밖)」 → 「묶인 행의 버튼은 펼침 토글뿐」. Phase 25 D-02 가 그 범위를 연 것이다.
- **Commit:** a21bc290

### 해석 · 도구 적응

- **[해석] e2e 픽스처 위치.** 플랜은 `TODAY_ORDERS` 에 행을 더하고 기존 건수 기대값을 갱신하라 했으나, P25-E 케이스만 `**/api/orders` 를 전용 목록(`P25_ORDERS` 13행)으로 덮어썼다 — 기존 11 케이스의 건수 단언(9행 · 6줄 · 7건/2건)을 건드리지 않아 회귀 표면이 작다. 증명 범위는 같다.
- **[acceptance 편차] `grep -c 'data-slot="today-order-expand"'` = 1(기준 ≥ 2).** 표 · 카드 두 표면이 공용 `ExpandToggle` 하나를 쓰므로 리터럴이 한 번만 나온다. 두 표면에 버튼이 서는 것은 단위 ⑭-1(표) · ⑭-4(카드)와 e2e P25-E1(표) · P25-E6(카드)이 증명한다. 리터럴을 맞추려고 마크업을 복제하지 않았다.
- **[해석] 시간외종가 접두 범위.** 표는 「방향 줄 앞 · 취소/정정 확인은 문장 앞에만」이다. 방향 단어가 없는 「전량 체결」 과 취소/정정 거부 줄도 문장 앞 「시간외종가 」 를 받는다(같은 규칙의 연장). 접수 불명(−2 · 꼬리만) · 모르는 통보(빈 문장)는 붙이지 않는다.
- **[보강] 검증 훅 2개 추가** — `data-slot="order-timeline-time"`(시각 칸 폭 단언) · `order-timeline-body`(aria-busy 컨테이너).
- **[보강] e2e 스크린샷 3장** — P25-E1(1280 열린 행) · P25-E3(묶음) · P25-E6(390 백스톱) `test.info().outputPath` — 실측 증거.
- **[도구] P25-E 요약 「7 passed」 대신 「8 passed」** — Playwright setup 프로젝트(auth) 1건이 같이 센다. P25-E 7건 전부 통과.

**Total deviations:** 자동 수정 3(버그) + 의도된 파급 1 + 해석 · 편차 6. **Impact:** 범위 · 공개 계약 변화 없음. 조회 횟수 규칙(클릭 1회 = GET 1회)을 지키려는 수정이다.

## TDD Gate Compliance

- RED: `c7d52ac7` (Task 1 — order-timeline 모듈 부재 + members · fetchOrderEvents 7건 실패) · `8fdd492a` (Task 2 — 카드 ⑭-1~⑭-5 실패 · OrderTimeline 모듈 부재)
- GREEN: `1297921f` · `a21bc290`
- REFACTOR: 없음(변경 없음)
- `check tdd-red-evidence` 레코드는 만들지 않았다(`type: execute` 플랜의 tdd 태스크 — 25-05 와 같은 처리)

## Verification

- `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/order-timeline.test.ts src/lib/__tests__/order-notices.test.ts src/lib/__tests__/orders-api.test.ts` — 3 files · 95 passed
- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/today-orders-card.test.tsx src/components/trading/__tests__/order-timeline.test.tsx` — 2 files · 60 passed
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — exit 0(tsc + tsconfig.e2e)
- webapp 전체 `vitest --run` — 134 files · 2987 passed · 1 skipped
- `playwright test e2e/specs/me.spec.ts -g "P25-E"` — 8 passed · `playwright test e2e/specs/me.spec.ts` — 19 passed
- eslint(변경 파일) — 0
- acceptance grep: members 5 · fetchOrderEvents 1 · `TIMELINE_REFETCH_DEBOUNCE_MS = 400` 1 · timelineStrategyText 3 · message 파싱 0 · colSpan={8} 1 · role="button" 0 · order-timeline-error 1 · aria-busy 2 · setInterval 0 · globals.css diff 0줄 · P25-E 9 · `api/orders/*/events` 1 · 실서버 리터럴 0 · today-order-expand 1(위 편차)

## Known Stubs

없음.

## Threat Flags

없음 — 새 엔드포인트 · 인증 경로 없음(25-03 라우트 소비만). T-25-34(디바운스 · in-flight 접기 · 폴링 없음) · T-25-35(문구 파싱 0) · T-25-36(주문번호 없는 행 펼침 없음) 모두 테스트로 잠김.

## Issues Encountered

- 실행 중 다른 세션이 같은 브랜치에 커밋 2건(quick-260929-sar `8c785483` · `0dbfc860`)을 넣었다 — 매 커밋 전 `git status -sb` 로 확인했고 그쪽 변경은 스테이징하지 않았다. `actuals.commits` 7 중 25-08 커밋은 5건.

## User Setup Required

None.

## Next Phase Readiness

- 25-09(오늘 주문 펼침 후속) · 25-10(창 분리 · 카드 탭)은 `buildTimeline` · `OrderTimeline` · `TIMELINE_BY_ANCHOR` 픽스처를 재사용할 수 있다.
- D-09 두 줄 형식 변경(gh-trade 예고)은 shared `strategy-event-text.ts` 한 곳에서 처리하면 된다 — webapp 은 `timelineStrategyText` 출력(`{action, text}`)을 그대로 배치만 한다. 반환 모양이 바뀌면 `buildTimeline` 의 상따 분기와 `TimelineItem` 한 곳만 따라 바꾼다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/order-timeline.ts · webapp/src/components/trading/order-timeline.tsx · webapp/src/test-fixtures/order-timeline.ts · webapp/src/lib/__tests__/order-timeline.test.ts · webapp/src/components/trading/__tests__/order-timeline.test.tsx
- FOUND: c7d52ac7 · 1297921f · 8fdd492a · a21bc290 · f82971cb
