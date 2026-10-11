---
phase: 18-gh-trade-ui-nxt-vi
plan: 08
subsystem: ui
tags: [trading, breakout, rate-cross, stock-search, workbench, react, tdd]
status: complete

requires:
  - phase: 18-04
    provides: "breakout-list.ts(trackBreakoutMeta·breakoutRowsFrom·shouldRemoveBreakout·newBreakoutsToAnnounce·집합 I/O) · use-breakout-quotes.ts · alert-tone.ts"
  - phase: 18-06
    provides: "workbench/ 디렉터리 구조 · --new-bg/--new-bd 토큰 · @container/wb 접기 관례"
provides:
  - "BreakoutStrip — 돌파감지 칩 스트립 + 「더보기」 7열 표 (workbench/breakout-strip.tsx)"
  - "StockAddBar — 거래소 토글 없는 종목 추가란 (workbench/stock-add-bar.tsx)"
  - "StockSearchField · isPickable · SelectedStock — limit-chaser-client.tsx 에서 승격(정의 1벌)"
  - "RelayData/RelayContextValue.rateCrossSnapSeq — 78 적용 횟수(76/78 구분 신호)"
  - "breakoutQuotePrice(quotes, isin) — 돌파 구독 거래소의 현재가, 모르면 undefined"
affects: [18-09, 18-13]

actuals:
  tokens: 29696
  tasks: 3
  commits: 4
plan_head_before: edf99113d7164aa6d1d14c1601a08785f8f9ff5b

tech-stack:
  added: []
  patterns:
    - "파생 클라 기록(meta·첫 돌파시각·이탈 삭제)은 렌더 중 「이전 prop 저장」 패턴으로 갱신 — 재판정 트리거는 시세 맵 객체가 아니라 보이는 종목의 가격 서명"
    - "이탈 삭제는 지울 때의 항목 객체를 기억하고, 서버가 새 프레임(객체 교체)을 보낼 때만 되살린다 — 임계 근처 깜빡임 방지"
    - "상시 검색 입력은 onCancel 없이 쓰면 Esc·바깥 blur 가 질의를 비운다 — 보조 버튼은 래퍼 안(trailing) 에 그려 blur 취소와 싸우지 않는다"

key-files:
  created:
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/components/trading/workbench/stock-add-bar.tsx
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
    - webapp/src/components/trading/__tests__/stock-add-bar.test.tsx
  modified:
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/use-breakout-quotes.ts

key-decisions:
  - "76 과 78 을 가르기 위해 리듀서에 rateCrossSnapSeq(78 적용 횟수)를 더했다 — rateCrossItems 배열만으로는 둘이 구분되지 않아 「78 행 무음·무강조」를 보장할 수 없었다"
  - "첫 채움(마운트 시 이미 있던 목록)도 무음·무강조로 기록한다 — 화면을 연 순간의 목록은 사용자에게 새 돌파가 아니다"
  - "「거래중」 행은 신규로 칠하지 않는다 — 목업의 행 상태는 신규 | 거래중 | 기본 중 하나이고 「신규 M」 도 거래중을 세지 않는다"
  - "종목 추가란의 「추가」 는 활성 검색 항목이 있을 때만 활성 — 공란뿐 아니라 검색 중·고를 수 있는 결과 0건에서도 눌러도 아무 일 없는 버튼을 두지 않는다"
  - "종목 추가란에 ⌘K 키캡을 그리지 않았다 — 전역 ⌘K 는 종목 상세로 라우팅하는 GlobalSearch 를 여므로 이 입력의 단축키로 표기하면 거짓이 된다"
  - "현재가 0 이하 시세는 「모름」(undefined) 으로 읽는다 — 장전 0 가격으로 이탈 판정하지 않는다"

requirements-completed: []

coverage:
  - deliverable: "돌파 스트립/표 — 서버 순서 그대로 · 30초 강조(타이머 1개) · 78 무음·무강조+기록 · 기록 후 재생 · 거래중 · ✕ 삭제 · 이름 없는 행 · 거래소 미표시 · 현재가 모름 행 유지"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/breakout-strip.test.tsx (Task 1 20 cases)"
        status: pass
      - kind: command
        ref: "grep 정렬·상한 재적용 0건 · 거래소 문자열 0건 · shouldRemoveBreakout 3회"
        status: pass
  - deliverable: "종목 추가란 — 승격된 StockSearchField/isPickable · 첫 항목 자동 활성 · ↓/Enter · isin 없음/시장 미상 불가 · onAdd/onFocusCard · 거래소 토글 없음"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/stock-add-bar.test.tsx (Task 2 11 cases)"
        status: pass
      - kind: test
        ref: "webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx (69 — 승격 후 무수정 통과)"
        status: pass
  - deliverable: "E4·E5 상태 커버리지 — 스피너 없음 · M=0 신규 필 부재 · 200행 · 열 접기 구조 · 긴 이름 · 검색 0건/중/실패"
    human_judgment: false
    verification:
      - kind: test
        ref: "breakout-strip.test.tsx + stock-add-bar.test.tsx Task 3 블록 (16 cases)"
        status: pass
  - deliverable: "폰 밴드 열 접기 실제 잘림 0 · 목업 대비 배치·문구·색 눈 대조"
    human_judgment: true
    rationale: "컨테이너 쿼리(@container/wb)는 jsdom 이 재지 못한다 — 18-13 Playwright 가 잘림 0 을 잰다. 두 컴포넌트는 아직 어떤 라우트에도 마운트되지 않았다(18-09 가 /trading 에 조립) — dev 화면 목업 대조는 그 뒤에 가능하다"

duration: 40min
completed: 2026-09-22
---

# Phase 18 Plan 08: 돌파감지 스트립·표 + 종목 추가란 Summary

**relay 돌파 집합을 한 번도 재해석하지 않고 그리는 칩 스트립 + 7열 표(30초 강조 타이머 1개 · 기록 후 재생 · 이탈 판정 단일 함수)와, 상따 화면에서 승격한 종목검색으로 만든 거래소 토글 없는 종목 추가란**

## Performance

- **Duration:** 약 40분
- **Completed:** 2026-09-22
- **Tasks:** 3
- **Files modified:** 8 (신규 4 · 수정 4)

## Accomplishments

- `BreakoutStrip` — 「돌파 N」 + 「신규 M」 필 + 칩 가로 스크롤 + 「더보기」, 펼친 표는 종목 · 현재가 · 등락률 · 임계 · 기준가 · 돌파시각 · 액션 7열. 칩/행 클릭은 `onAddCard(isin, name?, code?)`, 카드가 있는 종목은 `onFocusCard(isin)` + 「거래중」 표식. 행 ✕ 는 「지운 종목」 집합 기록 + `onDismiss`.
- 클라 몫 규칙이 전부 `breakout-list.ts`(18-04) 함수에서 나온다 — `trackBreakoutMeta` · `breakoutRowsFrom` · `shouldRemoveBreakout` · `newBreakoutsToAnnounce` · `addSounded`/`addDismissed`. 컴포넌트 소스에 정렬·역순·상한 재적용·거래소 문자열이 없다(verify grep 통과).
- 알림음은 `addSounded` → `playBreakoutTone` 순서(호출 순서 장부로 단언). 78 스냅샷·첫 채움 행은 무음·무강조이면서 집합에 기록된다.
- 강조 만료는 목록 전체 1초 tick `setInterval` 1개 — 3행을 연속으로 넣어도 `setInterval` 호출 1회, 강조가 끝나면 `clearInterval` 후 타이머 0개(fake timers 로 단언).
- `StockAddBar` — `StockSearchField`·`isPickable`·`SelectedStock` 을 `limit-chaser-client.tsx` 에서 옮겨 정의 1벌로 만들었다(존재 이유 주석 포함). 상따 화면은 import 로 쓰며 기존 69 케이스가 무수정 통과.

## Task Commits

1. **Task 1 RED: 돌파 스트립 실패 테스트** — `3cc17b7` (test)
2. **Task 1 GREEN: 돌파 스트립/7열 표 + rateCrossSnapSeq + breakoutQuotePrice** — `c5efabf` (feat)
3. **Task 2: 종목 추가란 + 종목검색 승격** — `1a8e357` (feat)
4. **Task 3: E4·E5 상태 커버리지 마감** — `866258b` (test)

## Files Created/Modified

- `webapp/src/components/trading/workbench/breakout-strip.tsx` — 돌파 스트립 + 7열 표
- `webapp/src/components/trading/workbench/stock-add-bar.tsx` — 승격된 `StockSearchField`/`isPickable` + `StockAddBar`
- `webapp/src/components/trading/limit-chaser-client.tsx` — 비공개 종목검색 정의 제거, 승격본 import
- `webapp/src/lib/use-relay-socket.ts` — `rateCrossSnapSeq` (78 적용 시 +1, 리셋 시 0)
- `webapp/src/lib/relay-provider.tsx` — Provider 밖 빈 값에 `rateCrossSnapSeq: 0`
- `webapp/src/lib/use-breakout-quotes.ts` — `breakoutQuotePrice` (거래소 상수를 스트립 밖에 둔다)
- `webapp/src/components/trading/__tests__/breakout-strip.test.tsx` — 31 cases
- `webapp/src/components/trading/__tests__/stock-add-bar.test.tsx` — 16 cases

## Decisions Made

frontmatter `key-decisions` 참조. 핵심은 76/78 구분 신호(`rateCrossSnapSeq`)를 리듀서에 둔 것 — 아래 Deviations 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 76 과 78 을 가를 신호가 없었다 → 리듀서에 `rateCrossSnapSeq` 추가**
- **Found during:** Task 1
- **Issue:** `breakout-list.ts` 는 `silent` 를 호출자가 정한다고 하는데, relay 컨텍스트의 `rateCrossItems` 는 76 upsert 와 78 전량 교체 모두 새 배열이라 구분할 수 없었다. 배열 차이로 추정하면 「인증 직후 78 이 1건」인 경우가 76 신규 1건과 똑같아 보여 알림음·강조가 잘못 난다.
- **Fix:** `RelayData`/`RelayConnectionState` 에 `rateCrossSnapSeq`(78 적용 횟수)를 더하고 `rate.cross.snap` 분기에서 +1. 스트립은 이 값이 바뀐 렌더의 새 종목을 `silent` 로 기록한다. plan `files_modified` 밖(Phase 17 리듀서) 변경이지만 추가 전용 필드이고 기존 테스트 전부 통과.
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`, `webapp/src/lib/relay-provider.tsx`
- **Commit:** `c5efabf`

**2. [Rule 3 - Blocking] 거래소 상수를 스트립 밖에 두기 위한 `breakoutQuotePrice` 추가**
- **Found during:** Task 1
- **Issue:** 이탈 판정은 `relayQuoteKey(isin, "KRX")` 시세가 필요한데, verify 는 스트립 소스에 거래소 문자열을 금지하고 `use-breakout-quotes.ts` 의 `BREAKOUT_EXCHANGE` 는 비공개였다.
- **Fix:** `use-breakout-quotes.ts` 에 `breakoutQuotePrice(quotes, isin)` export (0 이하·비유한 가격은 `undefined` = 모름).
- **Commit:** `c5efabf`

**3. [Rule 2 - Correctness] 이탈 삭제를 서버의 새 프레임까지 유지**
- **Found during:** Task 1
- **Issue:** 매 렌더 `shouldRemoveBreakout` 만 적용하면 시세가 임계−2%p 근처에서 흔들릴 때 행이 사라졌다 다시 나타난다(서버는 그 사이 76 을 다시 보내지 않는다).
- **Fix:** 지울 때의 항목 객체를 기억하고, 같은 키의 항목 객체가 바뀔 때(76 재돌파·78)만 되살려 다시 판정한다. 판정 자체는 여전히 `shouldRemoveBreakout` 하나다.
- **Commit:** `c5efabf`

**4. [UI 정직성] 종목 추가란의 `⌘K` 키캡 생략**
- **Found during:** Task 2
- **Issue:** UI-SPEC/목업은 입력에 `⌘K` 힌트를 붙이지만, 앱의 전역 ⌘K(`use-cmdk-shortcut`)는 선택 시 종목 상세로 라우팅하는 GlobalSearch 를 연다. 이 입력의 단축키처럼 표기하면 누르는 순간 작업대를 떠난다.
- **Fix:** 키캡을 그리지 않았다. `/trading` 에서 ⌘K 를 이 입력 포커스로 바꾸려면 전역 단축키와의 조정이 필요해 18-09(작업대 조립)에서 결정할 일로 넘긴다.

**5. [TDD 절차] Task 2 는 RED 커밋 없이 테스트+구현 한 커밋**
- **Found during:** Task 2
- **Issue:** Task 2 의 본체는 기존 컴포넌트의 **이동**(재구현 금지)이라 「먼저 실패」를 만들 구현이 거의 없다(바 래퍼 + 콜백 분기뿐).
- **Fix:** 테스트와 구현을 `1a8e357` 한 커밋으로 넣었다. 승격 무결성은 기존 `limit-chaser-client` 69 케이스 무수정 통과로 확인.

---

**Total deviations:** 5 (Rule 2 두 건 · Rule 3 한 건 · UI 정직성 한 건 · 절차 한 건)
**Impact:** 계약 추가는 `rateCrossSnapSeq`·`breakoutQuotePrice` 두 개이고 둘 다 추가 전용이다. 범위 확장 없음.

## Issues Encountered

- **「최신 위」 문구와 실제 순서가 어긋난다 (미해결 — 판단 필요).** UI-SPEC 표 헤더 문구는 「… · 임계 20% · 최신 위」이고 D-14 도 「새 돌파 맨 위」라고 하지만, Phase 17 리듀서(`sortRateCross`)와 relay getter 는 `exchangeTime` **오름차순**(오래된 것 먼저)으로 정렬한다. 이 plan 은 「relay 배열 순서 그대로 · 정렬/역순 0회」를 요구하므로 순서를 그대로 그렸고, 그 결과 화면에는 **가장 오래된 돌파가 맨 위**에 온다. 헤더 문구는 UI-SPEC 원문 그대로 두었다. 바로잡으려면 (a) 리듀서 정렬을 내림차순으로 바꾸거나(relay getter·78 계약과 함께) (b) 표시 계층에서 뒤집는 것을 D-14 예외로 허용하는 결정이 필요하다 — 18-09 전에 정할 것을 권한다.
- 테스트 중 `vi.spyOn(window, 'setInterval'/'clearInterval')` 을 복원하지 않으면 다음 테스트의 fake timers 설치 뒤 `window.clearInterval is not a function` 이 났다 — 해당 테스트 끝에서 `mockRestore()`.

## Known Stubs

없음. 두 컴포넌트는 콜백·props 로 완결되고 빈 값이 UI 로 흐르는 자리가 없다. 다만 아직 어떤 라우트에도 마운트되지 않았다 — 18-09 가 `/trading` 작업대에 `items={rateCrossItems}` · `snapSeq={rateCrossSnapSeq}` · `cards` · 카드 추가/포커스 콜백을 연결한다.

## jsdom 이 못 보는 것 (18-13 Playwright 로 넘김)

- 폰 밴드(본문 <700 · <830) 열 접기의 **실제 잘림 0** — 단위 테스트는 열 접기 클래스(`hidden @min-[700px]/wb:table-cell` · `@min-[830px]`)와 보조줄 「{HH:MM:SS} 돌파」 구조가 있는지까지만 단언한다.
- 칩 줄의 실제 가로 스크롤·표의 세로 확장 레이아웃 — 단위 테스트는 `overflow-x-auto`·`flex-nowrap`·`max-h`/`overflow-y` 부재까지만 단언.
- 목업 대비 배치·문구·색 눈 대조(plan Task 3 human-check) — 마운트 후(18-09) 가능.

## Verification

- `pnpm exec vitest --run breakout-strip stock-add-bar` — 47 passed (breakout-strip 31 · stock-add-bar 16)
- `pnpm exec vitest --run limit-chaser` — 178 passed (승격 후 기존 화면 무수정)
- `pnpm --filter @gh-radar/webapp test` — 86 files · **1249 passed** · 1 skipped (기준선 1008 이상)
- `pnpm --filter @gh-radar/webapp run typecheck` — error TS 0
- 스트립 소스 grep — `.sort(`/`.reverse(`/`.slice(0, 200` 0건 · 거래소 문자열 0건 · `shouldRemoveBreakout` 3회
- `stock-add-bar.tsx` 의 `isPickable` 8회 · `limit-chaser-client.tsx` 중복 정의 0건

## Next Phase Readiness

- 18-09 작업대 조립이 두 컴포넌트를 마운트할 수 있다. 조립 시 넘길 값: `useRelayContext().rateCrossItems` · `.rateCrossSnapSeq` · 카드 ISIN 집합 · `onAddCard`/`onFocusCard`/`onAdd` 콜백.
- 결정 대기 1건: 위 「최신 위」 순서 불일치.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/breakout-strip.tsx
- FOUND: webapp/src/components/trading/workbench/stock-add-bar.tsx
- FOUND: webapp/src/components/trading/__tests__/breakout-strip.test.tsx
- FOUND: webapp/src/components/trading/__tests__/stock-add-bar.test.tsx
- FOUND commits: 3cc17b7 · c5efabf · 1a8e357 · 866258b
