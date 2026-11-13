---
phase: 42-tick-chart-candle-overlay
reviewed: 2026-11-13T10:52:03Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - packages/shared/src/tick-api.ts
  - supabase/migrations/20261113100000_tick_open_accum_avg_px.sql
  - webapp/src/components/ticks/candle-chart-band.tsx
  - webapp/src/components/ticks/candle-chart-caption.tsx
  - webapp/src/components/ticks/candle-chart-title.tsx
  - webapp/src/components/ticks/candle-chart.tsx
  - webapp/src/components/ticks/candle-lower-layers.tsx
  - webapp/src/components/ticks/candle-ma-chips.tsx
  - webapp/src/components/ticks/candle-ma-form.tsx
  - webapp/src/components/ticks/candle-price-layer.tsx
  - webapp/src/components/ticks/candle-return-layer.tsx
  - webapp/src/components/ticks/candle-unit-menu.tsx
  - webapp/src/components/ticks/chart-kind-switch.tsx
  - webapp/src/components/ticks/tick-chart-band.tsx
  - webapp/src/components/ticks/tick-chart.tsx
  - webapp/src/components/ticks/tick-viewer-page.tsx
  - webapp/src/components/ticks/tick-viewer.tsx
  - webapp/src/lib/ticks/candle-chart.ts
  - webapp/src/lib/ticks/candle-ma.ts
  - webapp/src/lib/ticks/candle-prefs.ts
  - webapp/src/lib/ticks/candle-readout.ts
  - webapp/src/lib/ticks/candle-returns.ts
  - webapp/src/lib/ticks/daily-closes.ts
  - webapp/src/lib/ticks/use-candle-prefs.ts
  - webapp/src/lib/ticks/use-prev-closes.ts
  - webapp/src/lib/ticks/use-view-sync.ts
  - webapp/src/styles/globals.css
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
  necessity: 0
status: issues_found
---

# Phase 42: 코드 리뷰 보고서

**리뷰 시각:** 2026-11-13T10:52:03Z
**깊이:** standard
**리뷰 파일 수:** 27
**상태:** issues_found

## 요약

봉 차트 신규 파일 22개 전체와, 이미 있던 파일 5개(`tick-chart.tsx` · `tick-chart-band.tsx` · `tick-viewer.tsx` · `tick-viewer-page.tsx` · `globals.css`)의 `b72dcd0f` 이후 Phase 42 diff 를 읽었다. 판단에 필요한 호출 대상(`use-chart-view.ts` · `tick-chart.ts` 의 `priceSeriesOf` / `turnoverSeriesOf` / `turnoverPathsOf` / `decimatedIdxOf` · `team-model.ts` `teamKpiAt` · shared `pnlAt` / `recvOrderOf` · `accum-chart.ts` `avgPxPointsOf` / `presetOf` / `clampView`)도 따라가 확인했다.

순수 계산 쪽은 단단하다.
- 봉 집계(`buildBase` · `rollUp`): `recvOrderOf` 가 recv_ns 안정 정렬을 보장하므로 「k 는 감소하지 않는다」 전제가 성립한다.
- 이동평균: SMA 누적합은 정수 가격이라 오차 누적이 없고, EMA 시드와 일 SMA 정의는 D-11 과 맞다. 끊김 규칙은 30분 이상이면서 한 단위보다 클 때다.
- 누적 평단 계단 · 가장자리 글자 · 두 눈금 0% 맞춤 · `localStorage` 파싱 · 색 재배정 · 스냅숏 안정도 이상 없다.
- RPC 마이그레이션은 직전 정의(`20261103210000`)에서 `accum.avg_px` 키 하나만 달라졌다. 그 뒤에 `tick_open_for_user` 를 다시 정의한 마이그레이션은 없어 다른 변경을 되돌리지 않는다. REVOKE / GRANT 도 유지된다.
- `useViewSync` 는 StrictMode 이중 effect, 「이미 같은 창」(schedule false), 반영 전 `0` 키(setPreset)까지 따져 봤다. 보류(pending) 상태가 풀리지 않고 남는 경로는 찾지 못했다.

결함은 세 갈래다.
1. **마우스 1px 마다 O(창 안 체결 수)** 를 다시 도는 메모 없는 `turnoverPathsOf` 가 있다. 같은 계산을 `CandleLowerLayers` 가 이미 메모해 두므로 순수 중복이다. 큰 세션에서 「마우스 재렌더는 세로선 · 점 · 띠만」(SC-7) 이라는 주석상 계약을 깬다.
2. 수익률 판의 빈 상태 · 눈금 표시가 창 밖 커서 점에 끌려간다. 팀이 그날 체결했는데도 「팀 체결 없음」 이 뜨거나, 선이 없는데 눈금만 뜬다.
3. 차트 종류 스위치를 키보드로 누르면 스위치를 품은 차트 전체가 언마운트돼 초점이 `<body>` 로 떨어진다.

치명(Critical) 등급은 없다. 필요성(Necessity) 기준은 `necessity-review.md` 를 읽고 적용했으나 근거를 증명할 수 있는 항목이 없어 0건이다. `usePrevCloses` 의 `!code || key === null` 같은 사소한 중복 검사는 보고할 가치가 없어 뺐다.

## 경고(Warnings)

### WR-01: 마우스 이동 · 커서 한 칸마다 누적 거래대금 경로를 메모 없이 다시 계산(O(창 안 체결 수) · 중복 계산)

**파일:** `webapp/src/components/ticks/candle-chart.tsx:362-364` (사용처 `:446`), `webapp/src/components/ticks/candle-lower-layers.tsx:71`
**문제:**
`CandleChart` 본문의 `const tv = turnoverPathsOf(turnover, view, x, P, plotW, endMs);` 는 메모가 없다. 그래서 다음마다 다시 돈다.
- `setHover` 로 다시 그릴 때(viewBox 1px 마다 1회)
- 재생 중 `cursorRec` 가 바뀔 때마다
- 터치 살펴보기 이동마다

`turnoverPathsOf` 는 `decimatedIdxOf` 로 **창 안 모든 체결점을 한 바퀴 돌고**(`tick-chart.ts:252-` 의 `while (k < b)`), 영역 · 비중 경로 문자열을 둘 다 만든다. 하루 전체 창에 수십만 체결인 세션이면 마우스 1px 마다 그만큼 돈다.

그런데 이 컴포넌트가 실제로 쓰는 값은 호버 점의 `tv.share !== ''` 와 `tv.shareTop` 둘뿐이다. 같은 입력의 같은 계산은 `CandleLowerLayers` 가 `useMemo` 안에서 이미 한다. 결과적으로 (1) 순수 중복이고, (2) 파일 머리 주석 ②′ 「봉 · 이동평균 · 수익률 점은 메모(마우스 상태 무관 · SC-7)」 와 344행 「마우스 이동 재렌더는 세로선 · 점 · 띠만 바꾼다」 가 약속한 성질을 깬다.

선 차트(`tick-chart.tsx:421`)에도 같은 꼴이 있다. 다만 봉 차트는 아래 판이 이 값을 메모로 따로 계산하고 있으니 고칠 지점이 분명하다.

**고치는 방법:** 한 곳에서 메모하고 아래 판에 넘긴다.
```tsx
// candle-chart.tsx
const tv = useMemo(
  () => turnoverPathsOf(turnover, view, x, P, plotW, endMs),
  [turnover, view, x, P, plotW, endMs],
);
...
<CandleLowerLayers frame={frame} session={session} ... tv={tv} />
// candle-lower-layers.tsx — m 안의 tv: turnoverPathsOf(...) 를 지우고 props.tv 를 쓴다
```
`endMs` 는 세션마다 고정 값이라 의존성에 넣어도 안정적이다. 최소한 `useMemo` 만 씌워도 마우스 이동 비용은 사라진다.

### WR-02: 수익률 판 「팀 체결 없음」 · 눈금 표시가 창 안 값이 아니라 창 밖 커서 점까지 포함한 `day` 로 갈린다

**파일:** `webapp/src/components/ticks/candle-return-layer.tsx:34`, `:85-94`, `:106-118`; `webapp/src/components/ticks/candle-chart.tsx:346-353`
**문제:**
`CandleReturnLayer` 의 `hasDay = hasValue(day)` 가 세 가지를 정한다.
- 당일 눈금 글자를 그릴지
- 「팀 체결 없음」 빈 상태를 띄울지
- 판 제목 꼴

여기서 `day` 는 `dayReturnPointsOf(session, view, plotW, cursorRec)` 라 **창 밖 커서 rec 점까지 들어 있다**. 반면 눈금 `scales` 는 창 밖 커서 점을 뺀 `dayScalePts` 로 잡는다. 이 엇갈림이 두 가지 틀린 화면을 만든다.

1. **보기 창이 팀 첫 매수 전 구간이고 커서도 그 앞일 때.** 예: 09:00 ~ 09:10 을 확대해 보고 있고 팀 첫 매수는 10:00 이다. 이때 모든 점이 `pnl === null` 이라 `hasDay = false` 가 되고, 판 가운데에 「팀 체결 없음」 이 뜬다. 그날 팀은 실제로 체결했다. 아래 순매수 · 10분 판은 하루 기준(`team.fills.length === 0`, `candle-lower-layers.tsx:49`)으로 판정하므로 계단이 그려진다. 한 화면 안에서 두 판이 서로 다른 말을 한다.
2. **같은 창이지만 커서가 첫 매수 뒤(창 밖)일 때.** 커서 점 하나 때문에 `hasDay = true` 가 된다. 선은 `returnPathOf` 가 점 하나짜리 조각을 버려서 그려지지 않는데, 눈금은 `ed === null` 기본 단위로 「+0.1% / −0.1%」 를 그린다. 커서 위치에 따라 1과 2 사이를 오간다.

**고치는 방법:** 빈 상태는 하루 기준, 눈금 표시는 실제 눈금을 만든 점 기준으로 나눈다.
```tsx
// candle-chart.tsx → CandleReturnLayer 에 넘김
<CandleReturnLayer ... noTeam={session.team.fills.length === 0} dayScaled={dayScalePts} />

// candle-return-layer.tsx
const hasDayLine = hasValue(day);                  // 선 경로 용
const hasDayAxis = hasValue(dayScaled);            // 눈금 글자 용(창 안 점)
...
{!hasDayAxis && !hasCum && (noTeam ? '팀 체결 없음' : '팀 첫 매수 전')} // 문구는 UI-SPEC 과 맞춰 결정
```
문구를 새로 만들지 않으려면 최소한 「팀 체결 없음」 은 `noTeam` 일 때만 띄우고, 그 밖에는 빈 판(0% 선만)으로 둔다.

### WR-03: 키보드로 차트 종류를 바꾸면 초점이 `<body>` 로 떨어진다

**파일:** `webapp/src/components/ticks/tick-viewer.tsx:341-348`, `:530-564`; `webapp/src/components/ticks/chart-kind-switch.tsx:43-45`
**문제:**
`ChartKindSwitch` 는 각 차트의 제목 줄 안(`titleAddon`)에 그려진다. 「봉 차트」 를 누르면 `setChartKind` 로 `TickChart` 가 통째로 언마운트되고 `CandleChart` 가 새로 마운트된다. 반대 방향도 같다. 그래서 초점을 가졌던 버튼이 DOM 에서 사라지고 초점이 `<body>` 로 간다.

키보드 · 스크린리더 사용자는 방금 누른 스위치 자리를 잃는다. 다시 탭을 처음부터 돌아야 차트 래퍼(`+ − 0`)나 스위치에 닿는다. D-04 의 「두 차트를 함께 마운트하지 않는다」 결정은 그대로 두더라도, 초점 복귀는 따로 처리해야 한다.

**고치는 방법:** 전환 직후 새 차트의 켜진 스위치 버튼으로 초점을 옮긴다. 예를 들어 뷰어에서 「키보드로 전환했다」 표시를 ref 로 들고 있다가 새 스위치가 마운트될 때 한 번 포커스한다.
```tsx
// tick-viewer.tsx
const refocusKindRef = useRef(false);
const onKindChange = useCallback((k: ChartKind) => {
  if (k === chartKind) return;
  refocusKindRef.current = true;
  setSwitchView(lastViewRef.current);
  setChartKind(k);
}, [chartKind, setChartKind]);
const kindAddon = (phone: boolean) => (
  <ChartKindSwitch value={chartKind} onChange={onKindChange} phone={phone} refocusRef={refocusKindRef} />
);

// chart-kind-switch.tsx — 마운트 때 refocusRef.current 면 켜진 버튼에 focus() 후 false 로
```

## 참고(Info)

### IN-01: 창 밖 커서 점이 당일 수익률 경로에 이어져 눈금 밖 대각선 조각을 만든다

**파일:** `webapp/src/lib/ticks/candle-returns.ts:64`, `webapp/src/components/ticks/candle-chart.tsx:346-353`, `webapp/src/components/ticks/candle-return-layer.tsx:38`
**문제:** 사용자가 끌어서 커서를 창 밖에 두면, `day` 의 커서 점은 창 밖에 있으면서도 경로에 그대로 이어진다. 눈금은 그 점을 뺀 `dayScalePts` 로 잡혀 있다. 그래서 창 끝의 마지막 체결점에서 커서 점까지 직선이 그려지는데, 그 선이 눈금 범위를 벗어난 y 로 향한다. 창 오른쪽에 체결이 없는 구간(15:30 ~ 16:00 빈 띠 등)이 끼면 그 폭만큼 보이는 사선이 된다. 클립이 판 밖은 자르지만, 판 안에서 보이는 부분은 실제 값이 아닌 보간이다.
**고치는 방법:** 경로용 점은 `dayScalePts`(창 안 커서만 포함)를 쓰고, 커서 점은 값 띠 · 호버 점 전용으로 둔다. 커서 x 에서 선이 패널 값을 지나야 한다는 계약(Pitfall 6)은 커서가 창 안일 때만 의미가 있다.

### IN-02: 재생 중 커서 한 칸마다 열 샘플링 전체를 최대 두 번 다시 한다

**파일:** `webapp/src/components/ticks/candle-chart.tsx:346-351`
**문제:** `day` 는 `cursorRec` 를 의존성으로 가진다. 그래서 커서가 한 칸 움직일 때마다 `columnIdxOf`(그림 폭 열 수만큼 이진 탐색), 점마다 `teamKpiAt`, 정렬을 처음부터 다시 한다. 실제로 바뀌는 것은 커서 점 하나다. 게다가 `dayScalePts` 의 의존성에 `day` 가 들어 있어, 커서가 창 밖이면 같은 계산을 `-1` 로 한 번 더 한다. 세션 크기에는 로그로만 늘어서 지금은 감당되지만, 재생 속도를 올리면 비용이 프레임마다 쌓인다.
**고치는 방법:** 커서 없는 기본 점을 `[session, view, plotW]` 로 메모한다. 커서 점은 정렬 위치에 끼워 넣기만 하는 작은 함수로 나눈다. 그러면 `dayScalePts` 는 커서가 창 안일 때만 그 결과를 쓰고, 아니면 기본 점을 그대로 쓴다.

### IN-03: 당일 증분마다 봉 집계가 BigInt 시각 변환을 세 번째로 반복한다

**파일:** `webapp/src/lib/ticks/candle-chart.ts:105-144`
**문제:** `buildBase` 는 A3 마다 `msOfNs(index.recvNs[r])` 를 부른다(BigInt 나눗셈 2회). 당일 화면은 증분마다 새 세션 객체가 생기므로 `priceSeriesOf` · `turnoverSeriesOf` 와 함께 세 번째 O(A3) BigInt 패스가 된다. 그런데 `turnoverSeriesOf` 는 같은 거름(`j < 0` · 중복 · 가격 0 · 수량 0)을 쓰고, ms 시각 `t` 와 수신순 자리 `pos` 를 이미 갖고 있다. 수십만 체결 종목이면 증분마다 메인 스레드를 수십 ms 더 잡는다.
**고치는 방법:** `const tv = turnoverSeriesOf(session)` 의 `t[i]` 와 `recvOrder[tv.pos[i]] → a3Of → px/qty` 로 1분봉을 만든다. 거름이 같다는 점은 파일 머리 주석 ②가 이미 약속하고 있다. 08:00 전 · 20:00 뒤 제외만 그대로 둔다.

### IN-04: 일 이동평균이 「앞 거래일」 연속성을 검사하지 않는다

**파일:** `webapp/src/lib/ticks/daily-closes.ts:33-48`, `webapp/src/lib/ticks/candle-ma.ts:100-107`
**문제:** `fetchPrevCloses` 는 `date < 보는 날짜` 인 행 중 최근 n 개를 받는다. 받은 날짜는 버리고 종가만 돌려준다. 그래서 `stock_daily_ohlcv` 에 바로 앞 거래일 행이 빠져 있으면(일봉 동기화 지연 · 실패) 이틀 전 종가부터 N − 1 개를 써서 틀린 「일 N」 선을 그린다. 캡션 안내도 없다. 지금 운영에서는 장중 upsert 로 D−1 행이 늘 있어 드러나지 않았을 가능성이 크다.
**고치는 방법:** 날짜도 함께 돌려주고, 마지막 행 날짜가 보는 날짜 직전 거래일보다 오래됐으면(예: 주말 · 공휴일을 뺀 7일 넘는 공백) `short-days` 로 떨어뜨린다. 캡션 「지난 거래일 종가가 모자라 그리지 않아요」 가 이미 있다.

### IN-05: 패널과 「비트까지 같아야 하는」 수익률 서식이 복제본으로만 묶여 있다

**파일:** `webapp/src/components/ticks/candle-chart-band.tsx:29-35` (원본 `tick-team-panel.tsx` `fmtRet`), 그 밖에 `candle-chart.tsx:163-171`(`fmtSpan` · `KBD` — 선 차트 복제)
**문제:** SC-4 는 「띠 수익률 글자 = 패널 글자」 를 계약으로 둔다. 그런데 이를 지키는 장치가 주석 「바꾸면 둘 다」 뿐이다. 한쪽만 고치면 테스트가 잡을지는 `candle-chart-band.test.tsx` 의 대조 케이스에 달려 있다. 지금은 대조가 있지만 서식 경계값(0.005% 반올림 · 음의 0)까지 덮는지는 보장되지 않는다.
**고치는 방법:** `fmtRet` 를 `lib/ticks/tick-format.ts` 로 옮겨 두 곳이 import 하게 한다. `fmtSpan` 도 같은 방식으로 한 곳에 둔다.

---

_리뷰 시각: 2026-11-13T10:52:03Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
