---
phase: 42-tick-chart-candle-overlay
fixed_at: 2026-11-13T11:17:07Z
review_path: .planning/phases/42-tick-chart-candle-overlay/42-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 42: 코드 리뷰 수정 보고서

**수정 시각:** 2026-11-13T11:17:07Z
**원본 리뷰:** .planning/phases/42-tick-chart-candle-overlay/42-REVIEW.md
**반복:** 1

**요약:**
- 범위 안 항목: 8 (경고 3 · 참고 5 — fix_scope all)
- 수정: 8
- 건너뜀: 0

**사람 확인 필요:** WR-02 · WR-03 · IN-01 · IN-04 는 화면 판정 · 초점 · 데이터 연속성 로직이라 테스트는 통과했어도 실제 화면에서 한 번 확인할 것.

## Fixed Issues

### WR-01: 마우스 이동 · 커서 한 칸마다 누적 거래대금 경로를 메모 없이 다시 계산(O(창 안 체결 수) · 중복 계산)

**상태:** fixed
**고친 파일:** `webapp/src/components/ticks/candle-chart.tsx`, `webapp/src/components/ticks/candle-lower-layers.tsx`, `webapp/src/components/ticks/__tests__/candle-lower-layers.test.tsx`, `webapp/src/components/ticks/__tests__/candle-chart-memo.test.tsx`(새 파일)
**커밋:** 0e4ed627
**적용 내용:** `CandleChart` 가 `turnoverPathsOf` 를 `useMemo([turnover, view, x, P, plotW, endMs])` 로 한 번만 계산하고 `CandleLowerLayers` 에 `tv` 속성으로 넘긴다. 아래 판의 메모 안 중복 계산은 지웠다. 새 회귀 테스트는 `turnoverPathsOf` 를 통과 감시로 감싸 마우스를 4번 옮겨도 호출 수가 늘지 않고 팀 비중 값 점은 그대로 그려지는지 본다. 메모를 빼면 실패하는 것도 확인했다. 선 차트(`tick-chart.tsx:421`)의 같은 꼴은 보호 파일이라 건드리지 않았다.

### WR-02: 수익률 판 「팀 체결 없음」 · 눈금 표시가 창 안 값이 아니라 창 밖 커서 점까지 포함한 `day` 로 갈린다

**상태:** fixed: requires human verification
**고친 파일:** `webapp/src/components/ticks/candle-return-layer.tsx`, `webapp/src/components/ticks/candle-chart.tsx`, `webapp/src/components/ticks/__tests__/candle-return-layer.test.tsx`, `webapp/src/components/ticks/__tests__/candle-chart.test.tsx`
**커밋:** 7054ea54
**적용 내용:** `CandleReturnLayer` 에 `noTeam`(`session.team.fills.length === 0`, 아래 판과 같은 하루 기준)을 넘긴다. 「팀 체결 없음」 은 `noTeam && !hasCum` 일 때만 띄운다. 팀이 체결했지만 창이 첫 매수 전이면 0% 선만 있는 빈 판이다(새 문구는 만들지 않았다). 오른쪽 눈금 글자는 눈금을 만든 창 안 점에 값이 있을 때만 그린다. 이 커밋에서는 `dayScaled` 로 넘겼고, IN-01 에서 `day` 하나로 합쳤다. 기존 테스트 「당일 값이 전부 null → 빈 상태와 같다」 는 버그 동작을 잠그고 있어 「팀이 체결한 하루면 빈 판」 으로 고쳤다. 회귀 테스트 두 개를 더했다. 하나는 차트 통합 테스트로, 13:00 일반 체결 → 15:00 팀 매수인 하루에서 「10초」 창으로 좁히면 「팀 체결 없음」 이 없고 아래 판 계단은 남는지 본다. 다른 하나는 팀 체결 없는 하루면 두 판 모두 「팀 체결 없음」 인지 본다. 옛 조건으로 되돌리면 실패하는 것도 확인했다.

### WR-03: 키보드로 차트 종류를 바꾸면 초점이 `<body>` 로 떨어진다

**상태:** fixed: requires human verification
**고친 파일:** `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx`
**커밋:** 0fa11ad5
**적용 내용:** 뷰어가 `onKindChange` 순간 `document.activeElement` 가 `[data-slot="chart-kind-switch"]` 안이었는지 ref 에 기록한다. `chartKind` 가 바뀐 effect 에서 다음 프레임(`requestAnimationFrame`)에 본문 안 `[data-slot="chart-kind-switch"] button[aria-pressed="true"]` 로 `focus()` 한다. 다음 프레임까지 기다리는 까닭은 새 차트가 첫 폭을 재고 다시 그리면서(폰 제목 줄 배치) 스위치가 다시 마운트돼도 초점을 놓치지 않게 하려는 것이다. 초점이 없던 누름(터치 · Safari 마우스)은 초점을 옮기지 않는다. **`tick-chart.tsx` 는 고치지 않았다.** 스위치는 두 차트 모두 같은 `ChartKindSwitch`(`titleAddon`)라 뷰어 쪽만으로 충분하다. `chart-kind-switch.tsx` 도 그대로다. 회귀 테스트는 두 가지다. 선 → 봉 → 선 양방향에서 키보드 누름(초점 있는 채 click) 뒤 새 차트의 켜진 버튼에 초점이 있는지 보고, 초점 없이 누르면 `body` 그대로인지 본다. 기록을 끄면 실패하는 것도 확인했다. 실제 브라우저의 Enter · Space와 스크린리더 낭독은 사람이 확인해야 한다.

### IN-01: 창 밖 커서 점이 당일 수익률 경로에 이어져 눈금 밖 대각선 조각을 만든다

**상태:** fixed: requires human verification
**고친 파일:** `webapp/src/components/ticks/candle-chart.tsx`, `webapp/src/components/ticks/candle-return-layer.tsx`, `webapp/src/components/ticks/__tests__/candle-return-layer.test.tsx`, `webapp/src/components/ticks/__tests__/candle-chart.test.tsx`
**커밋:** 3c532ecb
**적용 내용:** 수익률 판의 선과 눈금 글자가 눈금을 만든 창 안 점(`dayScalePts`, 창 밖 커서 점 제외)을 함께 쓴다. 커서 점은 값 띠 · 값 점(`candleBandAt` 경로) 전용으로 남는다. WR-02 의 `dayScaled` 속성은 필요 없어져 뺐다. 회귀 테스트(차트 통합)는 13:00 팀 매수 → 15:00 커서인 하루에서 `initialView` 14:00 ~ 14:01 창을 쓴다. 이때 커서 선이 없고, 창 안 점이 하나뿐이라 수익률 선도 없으며(커서 점과 잇는 사선 없음), 눈금 글자와 값 띠 수익률은 그대로인지 본다. 커서 점이 든 배열로 되돌리면 실패하는 것도 확인했다.

### IN-02: 재생 중 커서 한 칸마다 열 샘플링 전체를 최대 두 번 다시 한다

**상태:** fixed
**고친 파일:** `webapp/src/lib/ticks/candle-returns.ts`, `webapp/src/components/ticks/candle-chart.tsx`, `webapp/src/lib/ticks/__tests__/candle-returns.test.ts`
**커밋:** 95e2544a
**적용 내용:** 커서 없는 당일 점 `dayBase = dayReturnPointsOf(session, view, plotW, -1)` 를 `[session, view, plotW]` 로 메모한다. 새 순수 함수 `withCursorReturnPoint(base, session, view, cursorRec)` 는 창 안 커서 점 하나만 (t, 거래소순) 정렬 자리에 이진 탐색으로 끼운다. 커서가 −1 · 창 밖 · 이미 있는 rec 이거나 팀 없는 하루면 `base` 를 같은 객체로 돌려준다. 창 밖 커서일 때 `-1` 로 한 번 더 돌던 중복 계산도 사라졌다. 회귀 테스트는 창 안 모든 rec(B6 · A3 · 팀 체결)에서 결과가 `dayReturnPointsOf(…, rec)` 와 같은지, 그 밖의 경우는 같은 객체인지 본다.

### IN-03: 당일 증분마다 봉 집계가 BigInt 시각 변환을 세 번째로 반복한다

**상태:** fixed
**고친 파일:** `webapp/src/lib/ticks/candle-chart.ts`
**커밋:** 20f9b115
**적용 내용:** `buildBase` 가 `turnoverSeriesOf(session)`(세션마다 1회 캐시)의 점을 돈다. 각 점에서 `t[m]`(수신 ms)와 `recvOrder[pos[m]] → a3Of → px/qty` 로 1분봉을 만든다. 중복 · 가격 0 · 수량 0 거름은 그 계열이 이미 했고, 08:00 전 · 20:00 뒤 제외는 그대로 둔다. `msOfNs` import 는 필요 없어져 뺐다. `tick-chart.ts` 는 고치지 않고 가져다 쓰기만 했다. 새 테스트는 더하지 않았다. 기존 직접 집계 오라클(구현을 부르지 않는 1 · 5 · 10 · 15 · 30 · 60분봉), 거름 · 단일가 · 「거래대금 합 = 넷째 판 증분」 테스트가 같은 값을 잠그고 있고 모두 통과했다.

### IN-04: 일 이동평균이 「앞 거래일」 연속성을 검사하지 않는다

**상태:** fixed: requires human verification
**고친 파일:** `webapp/src/lib/ticks/daily-closes.ts`, `webapp/src/lib/ticks/__tests__/daily-closes.test.ts`
**커밋:** 1515f872
**적용 내용:** `fetchPrevCloses` 는 받은 행의 날짜를 버리지 않고, 종가가 유효한 가장 가까운 행부터 보는 날짜까지의 평일 수를 센다. 그 수가 `PREV_CLOSE_MAX_GAP_WEEKDAYS`(6)를 넘으면 앞 거래일 행이 빠진 것으로 보고 `[]` 를 돌려준다. 그러면 `maStatusOf` 가 `short-days` 를 돌려주고, 기존 캡션 「지난 거래일 종가가 모자라 그리지 않아요」 가 뜬다. 상태 타입 · 훅 · 캡션 문구는 그대로다. **한계:** 휴장 달력이 없어(`@gh-radar/shared` `krxCalendar` 는 2026-08-17 ~ 12-31 휴장일만 있다) 하루 이틀 빠진 행은 휴일과 구분하지 못한다. 일봉 동기화가 오래 끊긴 긴 공백만 잡는다. 문턱 6 은 설 · 추석 긴 연휴(평일 휴장 5일 안팎)를 정상으로 보도록 넉넉히 잡은 값이라, 운영에서 받아들일 만한지 사람이 판단해야 한다. 회귀 테스트는 평일 8일 공백, 종가 0 행 건너뛴 기준, 금 → 월 주말, 평일 5일 연휴, 경계값 6일(허용) · 7일(`[]`)을 본다.

### IN-05: 패널과 「비트까지 같아야 하는」 수익률 서식이 복제본으로만 묶여 있다

**상태:** fixed
**고친 파일:** `webapp/src/lib/ticks/tick-format.ts`, `webapp/src/lib/ticks/__tests__/tick-format.test.ts`, `webapp/src/components/ticks/tick-team-panel.tsx`, `webapp/src/components/ticks/candle-chart-band.tsx`
**커밋:** d652dff8
**적용 내용:** 리뷰 제안대로 `fmtRet` 를 `lib/ticks/tick-format.ts` 에 export 하고, 팀 거래정보 패널과 봉 차트 값 띠의 복제본 두 벌을 지워 둘 다 이 함수를 import 한다. 띠에서 쓰지 않게 된 `MINUS` import 도 뺐다. 새 서식 테스트는 반올림 경계(±0.00004 → 「0.00%」 · 0.00005 → 「+0.01%」), 음의 0, null · undefined · NaN · 무한대를 잠근다. **부분 범위:** 같은 항목이 언급한 `fmtSpan` · `KBD` 는 원본이 선 차트 `tick-chart.tsx` 안 비공개 선언이다. 한 곳으로 모으려면 보호 대상 파일을 고쳐야 해서 이번에는 그대로 두었다. 새 파일로 옮겨도 선 차트 쪽 복제본이 남아 중복은 줄지 않는다.

## 검증

- **실행 위치:** 하네스가 만든 격리 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/agent-a85b7d270a338bcea`(브랜치 `worktree-agent-a85b7d270a338bcea`). 이미 격리돼 있어 따로 중첩 worktree 를 만들지 않았고, 이 트리에서 `pnpm install --frozen-lockfile` 과 `@gh-radar/shared` 빌드를 한 뒤 돌렸다. 메인 checkout 에서는 다시 돌리지 않았다.
- **보호 파일:** `tick-chart.ts` · `team-model.ts` · `tick-chart-tip.ts` · `own-model.ts` · `use-chart-view.ts` · `use-chart-width.ts` · `touch-inspect.ts` 와 그 테스트는 `b72dcd0f` 대비 diff 0 이다. `tick-chart.tsx` 도 diff 0 이다.
- **수정마다:** 고친 파일과 바로 옆 테스트를 `vitest --maxWorkers=2` 로 돌리고 `pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e tsconfig)를 돌렸다. WR-01 · WR-02 · WR-03 · IN-01 은 수정을 되돌리면 새 테스트가 실패하는 것도 확인했다.
- **마지막 확인:** `vitest run --maxWorkers=2 src/components/ticks/__tests__ src/lib/ticks/__tests__` 는 44 파일 · 709 테스트 전부 통과했다. typecheck 는 오류 0, 고친 소스 파일 eslint 도 경고 · 오류 0 이다. 전체 스위트와 Playwright 는 돌리지 않았다(지시대로).

---

_수정 시각: 2026-11-13T11:17:07Z_
_수정자: Claude (gsd-code-fixer)_
_반복: 1_
