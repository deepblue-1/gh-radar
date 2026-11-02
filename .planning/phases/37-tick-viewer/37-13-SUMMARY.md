---
phase: 37-tick-viewer
plan: 13
subsystem: webapp
status: complete
tags: [tick-viewer, msg-list, virtualization, inversion, classify_orders, nxt-runs, order-card, playwright]

requires:
  - phase: 37-03
    provides: "scopeTrades · classifyKrxOrders · tagNxtRuns · nxtRunStats · classifyNxtTeamOrders(오라클 일치)"
  - phase: 37-05
    provides: "buildTickIndex · exchangeOrderOf · a3ColumnsOf(toTrades) · inversionsOf(1조각 런 포함) · bookAt · TEAM_MEMBER_LABEL"
  - phase: 37-10
    provides: "TickSession · useTickCursor(mode · setMode · jumpToRec) · TickViewer HTS_PANES · 컷 13시 픽스처 헬퍼"
provides:
  - "TickSession 확장 — scope · orders(ViewOrder) · orderOfRec · teamOfRec · openOrder · inversions · inversionOfB6 · duplicates · orderEndPos · ordersByEnd · lastA3 · basePx · recentOrdersOf()"
  - "lib/ticks/msg-rows.ts — MSG_ITEM · buildMsgRows · MsgRowsModel(posOfRec · tailPosOfOrder · slotPosOfB6 · nextInversionFrom) · fmtA3Row · fmtB6Row · fmtOtherRow · orderShapeLabel · tailText · inversionText · tailInversionText · slotText · fmtDurNs · fmtLeadMs · sideOf"
  - "lib/ticks/use-fixed-window.ts — useFixedWindow({ count, rowH, overscan, ref })"
  - "components/ticks: TickMsgList · ShapeChip · TickOrderCard · TickAmountCard · HTS_PANES 전문 · 버스트 · 팀 칸"
  - "test-fixtures/tick-synth.ts — 합성 전문(a3Msg · b6Msg · r8Msg · b9Msg · c3Msg · a0Msg · rawMsg) · synthSession · inversionSession"
affects: [37-14, 37-19]

actuals:
  tokens: 25200       # chars/4 over 실현 diff(webapp 100,930자)
  tasks: 3
  commits: 4          # MEASURED: git rev-list --count 0d2145de..aca1e692 (SUMMARY 커밋 제외)
plan_head_before: 0d2145de65429b05bd2c7910ad59c6c2a315c4b6
plan_head_after: aca1e692da18cc05700f95436c6a255b49b28603

tech-stack:
  added: []
  patterns:
    - "주문 판정은 세션 생성 때 한 번 — 묶기는 shared 입력 순서(KRX accum (t, seq) · NXT G1 seq)로, 표시 순열과 따로"
    - "표시 항목 = Int32Array(kind << 28 | idx) — ROW · TAIL · SLOT 모두 같은 높이라 창 가상화가 인덱스 산술"
    - "B6 행 서식은 세션별 WeakMap 캐시(상한 4,000) — 보이는 행만 풀고 커서 이동 때 다시 풀지 않는다"
    - "HTS 줄 = flex-wrap(호가 300 고정 · 전문 flex 999 1 480 · 오른쪽 열 flex 1 1 330) — 폭이 모자라면 오른쪽 열이 아래 줄 전체 폭 · 카드 auto-fit 두 열"

key-files:
  created:
    - webapp/src/lib/ticks/msg-rows.ts
    - webapp/src/lib/ticks/use-fixed-window.ts
    - webapp/src/components/ticks/tick-msg-list.tsx
    - webapp/src/components/ticks/tick-order-card.tsx
    - webapp/src/components/ticks/tick-amount-card.tsx
    - webapp/src/test-fixtures/tick-synth.ts
    - webapp/src/lib/ticks/__tests__/msg-rows.test.ts
    - webapp/src/lib/ticks/__tests__/use-fixed-window.test.tsx
    - webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx
    - webapp/src/components/ticks/__tests__/tick-order-card.test.tsx
    - webapp/src/components/ticks/__tests__/tick-amount-card.test.tsx
    - .planning/phases/37-tick-viewer/37-13-red-evidence.json
  modified:
    - webapp/src/lib/ticks/tick-session.ts
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/e2e/specs/ticks-viewer.spec.ts

key-decisions:
  - "KRX 뷰어 범위는 accum(G1+G4 · (t, seq) 순) 하나 — 컷 13시는 G1 만이라 teamflow 오라클(2,687 · 팀 126)과 조각마다 같은 분할이 나온다(테스트로 잠금)"
  - "NXT 는 런 = 주문(2,833) · 팀 = classifyNxtTeamOrders(65) · bs ∉ {1,2} 런은 「단일가」"
  - "진행 중(Pitfall 9) = 닫는 B6 가 없고 같은 보드에 마지막 조각 seq 보다 큰 레코드가 아직 없음 — 스트림 끝 열린 주문만 해당"
  - "중복 = 같은 보드 · seq 의 두 번째 이후 수신(수신순) — 「중복」 칩만, 판정 입력에서 빼지 않는다(Pitfall 12)"
  - "점선 「거래소순 자리」 는 1조각 런 뒤집힘에도 단다(37-05 inversionsOf 계약) — 자리 = 그 주문 조각 중 가장 늦게 수신된 것 바로 뒤(점선 줄이 B6 위로 가지 않게) · 같은 자리에 꼬리가 있으면 점선이 먼저"
  - "A3 행 「· 0/0」 은 a1 = b1 = 0 일 때만 붙인다(플랜 문구) — 스케치 020 의 `ask1/bid1` 병기는 빼서 행 폭을 아꼈다"
  - "시각 열은 두 모드 모두 수신 시각(B6 거래소 시각은 지연 디코딩이라 목록에서 풀지 않는다) · 데스크톱 µs 흐리게 · 폰 생략"
  - "TAIL · SLOT 행도 role=option(aria-selected=false) — listbox 안 모든 항목이 같은 역할"

requirements-completed: [D-00, D-13, D-19, D-20]

duration: ~20min
completed: 2026-11-02
---

# Phase 37 Plan 13: 전문 목록(020 A + 3) · 이 주문 · 거래대금 Summary

**세션이 shared 판정 함수(KRX accum `classifyKrxOrders` · NXT 런)로 주문을 한 번 묶고, 전문 목록은 그 결과를 거래소순(기본) · 수신순 한 행씩 레일 · 닫는 B6 칩 · 꼬리 줄 · 주황 ↕ · 점선 「거래소순 자리」 로 보인다. 목록은 같은 높이 창 가상화라 DOM 이 ~46행이고, 행 클릭 · 다음 역전 · 키가 같은 커서를 움직여 호가 10단 · 이 주문 · 거래대금 카드가 함께 바뀐다.**

## Performance

- **Duration:** 약 20분(11:57Z → 12:14Z)
- **Tasks:** 3/3 (Task 1 tracer · Task 2 TDD RED → GREEN · Task 3)
- **Files:** 생성 12 · 수정 3

## 측정값 (output 요청)

### 컷 픽스처 주문 · 역전 수

| 항목 | KRX `cut1300-krx` | NXT `cut1300-nxt` |
|------|------------------|------------------|
| 레코드 | 11,990 | 11,474 |
| 주문(런) | **2,687** (= 오라클 orders 2,687) | **2,833** (= 오라클 run_orders 2,833) |
| 팀 | **126** (자전거래방지 70 · 0/0 단독 55 · 0/0 스윕 끝 1) | **65** (= 오라클 smp 65) |
| 2조각 이상 | 182 | 179 |
| 최대 조각 | 27 | 40 |
| 뒤집힘(1조각 포함) | 330 | 928 |
| 뒤집힘(2조각 이상) | **84** (= 오라클 inverted 84/182) | **90** (= 오라클 inverted 90/179) |
| 중복 · 진행 중 | 0 · 없음 | 0 · 없음 |
| 항목 수 거래소순 · 수신순 | 12,172 · 12,502 | 11,653 · 12,581 |
| 세션 생성(jsdom · 판정 포함) | 23.4ms | 26.7ms |
| buildMsgRows 거래소순 · 수신순 | 1.0ms · 1.4ms | 0.3ms · 0.8ms |

(37-10 세션 20.5~23.2ms 에서 판정이 ~2ms 늘었다. 성능 값은 vitest 안 1회 — 실패 조건 아님.)

### 가상화 DOM 행 수

- 목록 높이 640px(머리 · 열 머리 빼면 스크롤 칸 ≈ 580px) · 행 24px · overscan 10 → 맨 위 35행 · 가운데 ≈ 46행. 폰 22px 도 같은 식.
- `use-fixed-window.test.tsx` — 270,000 항목 · 480px 칸: 맨 위 31행 · 가운데 41행(= 20 + 2·10 + 1) · spacer 합 = 나머지 항목 × 24px.
- e2e 단언: 컷(1.2만 행)에서 DOM 행 < 80.

### 행 종류 표

| 항목 | 모양 | 클릭 |
|------|------|------|
| A3 | `16,400 +1,064 (1,745만) 매수 · 0/0` — 가격 등락색 · 수량 매수 빨강/매도 파랑 · 금액 축약 · 「· 0/0」 은 a1 = b1 = 0 일 때만 · 단일가 bs 는 「단일가」 · 1조각 주문은 이 행에 모양 칩 | 그 틱 |
| B6 | `매도1 16,400 ×283 (464만) 매수1 16,350 ×121 (198만)` — 총잔량 없음 · 묶음 닫는 B6 면 앞에 점선 「닫는 B6」 칩 · 먼저 온 B6 면 seq 주황 `↕` + 꼬리말(거래소순 「↕ 수신은 9.0ms 먼저」 · 수신순 「↕ 9.0ms 먼저 수신」) | 그 틱 |
| B9 | `거래원 매수1 교보 3,400 · 매도1 한국 1,200`(팀 창구는 이름) | 그 틱 |
| C3 | `프로그램 순매수 차익 +600 · 비차익 −500`(위탁 + 자기 체결 수량) | 그 틱 |
| R8 | `VI 발동(정적) 기준가 16,400 · 발동가 18,040` · `VI 해제`(주황) | 그 틱 |
| A0 | `종목 정보 <종목명>` | 그 틱 |
| 기타(D-19) | 배지 「기타」 · `기타 · A3 · 01S · 150B`(태그 · 정보구분 · 길이) | 그 틱 |
| 중복 | 그 행 끝 회색 「중복」 칩(판정은 그대로) | 그 틱 |
| TAIL | `┗ 3조각 1단 · 600주 · 984만 · 264µs` + 모양 칩 + 「진행 중」 + 「· 닫는 B6 ↕ 9.0ms 먼저(수신)」 | 그 주문 마지막 조각 |
| SLOT(수신순만) | 점선 주황 `⋯ 거래소순 자리 — 이 B6 는 9.0ms 먼저 수신돼 위 4행에 있음` | 그 B6 |

레일: 2조각 이상 주문의 조각 · 닫는 B6 · 점선 · 꼬리 행 왼쪽 3px(팀 `--team` · 일반 `--faint`) · 묶음 안 행 사이 선 없음 · 둘째 행부터 A3 시각 흐림 · 선택 틱과 같은 주문 행은 옅은 보라 띠.

## Accomplishments

- **트레이서(Task 1):** 세션에 주문 판정을 얹었다. KRX 는 `a3.toTrades()` → `scopeTrades(…, "accum")` → `classifyKrxOrders`, NXT 는 A3 · B6 → `NxtRow` → `tagNxtRuns` → `nxtRunStats` · `classifyNxtTeamOrders` 다. 출력은 공통 `ViewOrder` 이고, 닫는 B6 · 팀 · 진행 중 · 뒤집힘 · 중복 표를 함께 낸다. 그 위에 `buildMsgRows`(거래소순 · 꼬리) → `useFixedWindow` → `TickMsgList` → 행 클릭 = `cursor.jumpToRec` 을 이었다. 목록 순서는 커서 훅 모드를 그대로 쓰므로 키 이동 단위도 표시 순서다. 트레이서 게이트(자동 verify 만 · end-of-phase)는 verify 명령 재실행 18/18 통과 뒤 넓혔다.
- **뒤집힘 3(Task 2):** 수신순에서만 SLOT 항목을 넣는다. 꼬리말은 두 꼴이고, 꼬리 줄에도 같은 말을 붙인다. 「↕ 다음 역전」 은 커서 뒤 첫 역전 B6 로 가고, 더 없으면 비활성이다. 기타 · B9 · C3 · R8 · A0 · 중복 행 문구도 넣었다. 모드를 바꿔도 커서 rec 는 그대로이고, 목록은 가운데로 스크롤한다.
- **오른쪽 열 · 폰(Task 3):** 「이 주문」 카드는 모양 · 매수/매도 · 조각 · 단 · 수량 · 금액 · 지속 · seq 범위 · 닫는 B6(↕ ms) · 진행 중을 보인다. 그 아래 「최근 주문 10건」 표는 행 클릭 = 마지막 조각이다. 「거래대금」 카드는 커서 이하 마지막 A3 의 `cum_value` · 현재가 · 등락률(DayRateTracker 기준가) · 누적 거래량을 보인다. 폰 세그먼트는 「호가 | 전문 | 버스트 · 팀」 이 됐다(팀 카드는 37-14 가 같은 칸에 더한다).

## Task Commits

1. **Task 1 (tracer): 전문 목록 트레이서** — `6f24d79e` (feat)
2. **Task 2 RED: 뒤집힘 3 · 기타 · 중복 행 실패 테스트** — `6c2d7595` (test)
3. **Task 2 GREEN: 뒤집힘 표현 3** — `06646e26` (feat)
4. **Task 3: 이 주문 · 거래대금 카드 · 폰 탭 · e2e** — `aca1e692` (feat)

## TDD Gate Compliance

- **RED** `6c2d7595` — 대상 `msg-rows.test.ts > 뒤집힘 3 … > 꼬리말 두 꼴 · 꼬리 줄 · 점선 문구`. JUnit 리포터로 단독 실행해 exit 1 이 나왔고, `expected '' to be '↕ 9.0ms 먼저 수신'` 로 실패했다. `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK**(target_test_failed)다. 증거 파일은 `37-13-red-evidence.json` 이다.
  - semanticAssessment: 대상 테스트가 실행됐고, 계획한 단언(수신순 꼬리말)에서 AssertionError 로 실패했다. 원인은 문구 함수가 빈 뼈대라는 계획된 미구현이다. import · 문법 · 픽스처 오류가 아니다(뼈대 export 를 두어 import 가 아닌 단언 실패가 되게 했다). 전체 RED 실행에서는 msg-rows 3건과 tick-msg-list 4건이 단언 실패했다. Task 1 이 이미 낸 세션 뒤집힘 · 다음 역전 모델 · 행 클릭 단언은 통과했다.
- **GREEN** `06646e26` — msg-rows 16 · tick-msg-list 5 모두 통과.
- **REFACTOR** — 없음.

## Verification

- Task 1 verify: `shared build && webapp typecheck && vitest msg-rows · use-fixed-window · tick-session --maxWorkers=2` → exit 0 · 3 파일 18 통과.
- Task 2 verify: `… vitest msg-rows · tick-msg-list` → 20 통과(뒤에 컷 역전 84 단언을 더해 21).
- Task 3 verify(단위 · 타입): `webapp typecheck(+ e2e tsconfig)` 통과 · `vitest tick-order-card · tick-amount-card · tick-msg-list` → 13 통과.
- 회귀: `vitest src/lib/ticks src/components/ticks` → **16 파일 141 테스트 통과**(37-08 페이지 흐름 · 37-10 커서/호가/슬라이더 포함).
- eslint(`src/lib/ticks` · `src/components/ticks` · `tick-synth.ts` · e2e 스펙) 오류 0. 경고 5건은 기존 `accum-export.ts` 것이다.
- 수락 기준 grep: `export function buildMsgRows` · `classifyKrxOrders` · `classifyNxtTeamOrders`(tick-session) · `export function useFixedWindow` · `거래소순 자리` · `수신은`(msg-rows) · `다음 역전`(tick-msg-list) · `최근 주문`(tick-order-card) · `cumValue`(tick-amount-card) — 전부 OK.
- **e2e 미실행 — 오케스트레이터가 메인 트리에서 실행.** worktree 에 webapp env 가 없고 비밀 가드가 복사를 막는다. 실행할 명령:
  `cd webapp && pnpm exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1`
  - 새 describe 「틱 전문 뷰어 전문 목록 — 행 그룹 · 뒤집힘 · 이 주문」 3절
    1. 목록 — 행 클릭 → 머리 seq · 호가 기준 seq · 이 주문 카드(DOM 행 < 80 · 1280 가로 넘침 0)
    2. ↕ 다음 역전 → 먼저 온 B6 · 수신순 토글 → 같은 틱 · 점선 자리 → 클릭 = 그 B6 · 거래소순 복귀 시 점선 0
    3. 폰 390 — 세그먼트 「호가 | 전문 | 버스트 · 팀」 · 칸 전환 · 가로 넘침 0
  - 기존 37-08 · 37-10 절은 손대지 않았다. 다만 HTS 줄에 칸이 둘 늘어 「열기」 절의 1280 가로 넘침 단언이 새 배치도 함께 본다.

## Deviations from Plan

### Auto-fixed / 보강

**1. [Rule 3 - 막힘] 합성 전문 테스트 픽스처 `webapp/src/test-fixtures/tick-synth.ts` 추가(플랜 files 밖)**
- 플랜 테스트의 「합성 세션(팀 SMP 3조각 + 닫는 B6 · 1조각 · 단일가 · 70조각 · 뒤집힘 · 기타 · 중복)」 을 만들려면 레이아웃대로 전문을 짓는 헬퍼가 필요하다. 필드 이름으로 오프셋을 찾으므로 매직 넘버가 없다. 다섯 테스트 파일이 같이 쓴다.
- Commit `6f24d79e` · `6c2d7595`

**2. [Rule 2 - 계약 보강] `TickSession` 에 `orderEndPos` · `ordersByEnd` · `lastA3` · `basePx` · `recentOrdersOf()` 추가(플랜 색인 밖)**
- 「최근 주문 10건(커서 이전)」 은 거래소순 끝 자리로 이진 탐색해야 O(log n) 이다. 「거래대금」 카드도 커서 이하 마지막 A3 를 O(1) 로 찾아야 한다. 그래서 세션 생성 때 표를 한 번 만든다. 기준가는 DayRateTracker 최빈값을 세션에 한 번 계산해 둔다.
- Commit `6f24d79e`

**3. [Rule 1 - 정확성] 점선 자리 위치 = 그 주문 조각 중 가장 늦게 수신된 것 뒤**
- 플랜 문구는 「마지막 조각 바로 뒤」 다. 조각들이 seq 순서로 수신되지 않으면 그 자리가 B6 보다 위가 되어 「위 n행」 이 음수가 된다. 그래서 조각 중 수신이 가장 늦은 것 뒤에 둔다. 조각이 수신 순서를 지키면(같은 멀티캐스트 그룹 — 보통) 둘은 같은 자리다. 컷 KRX 330건 전부가 B6 보다 아래에 있음을 단언으로 잠갔다.
- Commit `06646e26`

**4. [Rule 2 - 배치] 데스크톱 HTS 줄 줄바꿈(flex-wrap)**
- 앱 셸 사이드바(240px)를 펼친 1280 에서는 본문이 ≈ 992px 다. 호가 300 · 오른쪽 열 330 을 빼면 전문이 ≈ 340px 이 되어 B6 행이 거의 다 잘린다. 그래서 전문 기본 폭을 480 으로 두고, 모자라면 오른쪽 열이 아래 줄 전체 폭(카드 두 열)으로 내려가게 했다. 사이드바를 레일로 접으면 세 칸이 한 줄이다.
- Commit `aca1e692`

---

**Total deviations:** 4(보강 · 해석). 범위 확대 없음.

## Known Stubs

없음. 다만 아래는 의도한 빈 자리다(스텁 아님 — 37-14 가 원소를 더한다).
- 폰 탭 「버스트 · 팀」 · 데스크톱 오른쪽 열에는 지금 이 주문 · 거래대금 카드만 있다. 팀(5창구 · 손익) 카드는 37-14 가 같은 `tick-side` 격자에 더한다.

## Known Limitations

- 시각 확인(실화면)은 못 했다. env 가 없어 dev 서버를 띄울 수 없었다. 1280 · 390 가로 넘침 0 과 DOM 행 수는 e2e 단언에 넣었다. 폰 390 B6 행은 매수1 금액 앞에서 말줄임될 수 있다(스케치 020 「미결 — 실기기에서 다시 본다」 와 같다).
- 수신순 점선 자리는 1조각 런 뒤집힘에도 붙는다. 그래서 NXT 컷은 928개다(다조각만 90). 37-05 계약 「목록 ↕ 는 1조각 주문 행에도」 를 따랐다. 소음으로 보이면 다조각만으로 좁히는 한 줄 조정이다(`buildMsgRows` 의 `session.inversions` 필터).
- 중복 판정은 같은 보드 · seq 기준이다. 컷 두 픽스처에는 중복이 0건이라 실데이터 표식은 합성으로만 확인했다.

## Issues Encountered

- `.planning/WINDOWS.md` 장부에 「e2e 미실행」 을 append 하려 했지만 `gsd-tools windows append` 가 「Ledger counts disagree with entries: 4/0/13/17 vs 3/0/14/17」 로 거부했다. 37-08 · 37-10 과 같은 기존 장부 집계 불일치이고, 이 플랜 밖의 문제라 고치지 않았다.

## Threat Flags

없음 — 새 네트워크 · 인증 · 스키마 표면이 없다(이미 받은 격자 바이트 위 순수 계산 · 화면).

## Next Phase Readiness

- 37-14: 팀 카드는 `TickViewer` 의 `side` 칸 `tick-side` 격자에 원소를 더한다. 팀 체결은 `session.orders` 의 `team` · `recs` 를 쓰거나, 37-03 `teamFillsOf`/`buildPnlPrefix` 에 `scopeTrades(session.a3.toTrades(), "accum")` 를 넣는다. 커서 시각은 `session.index.recvNs[cursor.rec]` 다.
- 37-19(당일 증분): 세션을 다시 만들면 판정 · 열린 주문 표식(`open` · `openOrder`)이 새 바이트 기준으로 다시 정해진다(Pitfall 9).

## Self-Check: PASSED

- FOUND: 생성 12 · 수정 3 파일 전부 존재
- FOUND: `6f24d79e` · `6c2d7595` · `06646e26` · `aca1e692` (HEAD 조상)
