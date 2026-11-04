# Quick Task 261104-nxs: 작업대 매집감지 목록 — relay 95 AccumPriceBatch 현재가 원천 + 등락률·당일 순매수 「최소~최대」 필터 - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Task Boundary

작업대(`/trading`) 「매집」 패널(`webapp/src/components/trading/workbench/accum-strip.tsx`)의 두 가지:

1. **현재가 원천 교체** — relay 가 gh-trade MsgType 95 `AccumPriceBatch` 를 디코드해 웹으로 내보내고, 패널은 그 값을
   현재가·등락률 원천으로 쓴다. 지금의 종목별 시세 구독(`useBreakoutQuotes` · `MAX_BREAKOUT_SUBS` 40 예산 공유)은
   **95 에 값이 없는 종목에만** 폴백으로 남긴다(구 서버 = 95 부재 = 전부 폴백).
2. **필터 줄** — gh-trade 매집감지창(gh-trade quick-261104-519)처럼 「최소 ~ 최대」 필터. 단 이번엔 **등락률(%) · 당일 순매수(억)
   두 칸만**, 기본값 **등락률 15 이상 · 당일 순매수 1억 이상**, 「전부 보기」 체크, 「필터 밖 N」.

범위 밖: 알림음(웹 매집 패널엔 소리가 없다 — 새로 만들지 않는다) · 수익률·누적·시총 필터 · gh-trade 쪽 변경 · 매집 보고서 화면.

</domain>

<decisions>
## Implementation Decisions

### 필터 줄 위치·모양 — 목업 A 채택 (`mockup-filter.html` 안 A)
- 「더보기」로 표를 펼치면 **표 바로 위 한 줄**: `등락률 [15] ~ [  ] %   당일 순매수 [1] ~ [  ] 억   ☐ 전부 보기   …   필터 밖 N`(오른쪽 끝).
- 표를 접어도 필터는 칩에 그대로 걸린다. 그래서 「매집」 라벨(게이트웨이 키 옆)에 작은 회색 알약 **「필터 밖 N」** 을 보인다 —
  N > 0 이고 「전부 보기」 꺼짐일 때만.
- 좁은 폭(폰)에서는 칸 묶음(등락률 묶음 · 당일 순매수 묶음 · 전부 보기 · 필터 밖 N)이 묶음 단위로 줄을 바꾼다(flex-wrap) —
  gh-trade FlowLayoutPanel 동형. 가로 스크롤 금지.
- 칸은 작은 숫자 입력(오른쪽 정렬 · tabular-nums · 빈 칸 placeholder 「최소」「최대」). **적용은 Enter 와 칸 떠남(blur)**,
  적용 뒤 칸 글자를 정규화해 다시 쓴다(잘못된 값 → 빈 칸). 타이핑 중에는 목록이 흔들리지 않는다.
- 펼친 표는 지금 「행이 있을 때만」 보인다 — 필터 전 행이 하나라도 있으면 펼친 영역(필터 줄)을 보이고, 필터로 전부 걸러졌으면
  필터 줄 아래에 「필터를 통과한 종목이 없어요 — 「전부 보기」로 숨긴 종목을 볼 수 있어요」.
- 칩 줄이 필터로 비면 빈 문구는 「필터를 통과한 종목이 없어요」(원래 빈 문구 `ACCUM_EMPTY_TEXT` 는 필터 전 활성 행 0 일 때 그대로).

### 필터가 거르는 범위 — 추천안(gh-trade `IsShownRow` 동형)
- **칩 · 펼친 표 · 회색 「청산」 행 모두** 같은 판정 하나로 거른다(판정 함수 1곳 — 순수 함수 `accum-list.ts` 에).
- 판정 값 = **화면에 보이는 값**: 등락률은 표시 등락률(95 → 구독 시세 → 행 값 순, 소수 둘째 자리 반올림해 비교 — gh-trade 동형),
  당일 순매수는 `dayNetKrw`(null(옛 행) → 0 으로 비교 — gh-trade C-2). 억 칸은 원으로 환산(반올림)해 비교. 경계 포함.
  빈 칸 = 그쪽 제한 없음. 잘못된 값·NaN·무한대 = 빈 칸(예외 없음).
- ✕ 숨김(사이클 단위)은 필터와 별개로 그대로 먼저 적용된다. 「필터 밖 N」 의 N = ✕ 숨김을 뺀 행 중 필터에 걸린 행 수.
- 「전부 보기」 켜짐: 필터 밖 행도 보인다 — 칩은 그대로, **표의 필터 밖 행은 흐리게**(목업 A 의 `opacity .45`). 정렬은 그대로.
- 신규 강조(30초)·카드 추가/포커스·✕ 동작은 바뀌지 않는다. 필터 밖이던 행이 값 변화로 통과하면 그냥 나타난다(소리·강조 없음).

### 필터 값 기억 — 추천안(gh-trade 동형)
- 필터 4칸 값은 **이 기기(localStorage)** 에 기억한다 — 날짜 키 없이 계속 유지. 저장 실패·파싱 실패는 기본값으로(try/catch).
  처음(저장 없음)은 기본값 `등락률 최소 15 · 당일 순매수 최소 1억`, 최대 칸은 빈 칸.
- 「전부 보기」 는 기억하지 않는다(매 진입 꺼짐 — gh-trade 비영속 동형).
- 키는 기존 패널 기억(`trading-layout` `readPanelsPref/writePanelsPref` 또는 `gh-radar:` 접두 키) 문법을 따른다 — 플래너 재량.

### 현재가 원천 — relay 95 (Claude 재량으로 결정 · 사용자 위임)
- **원천 연결 = relay quote 관찰자 연결(`#onFeedFrame`)** 하나. 인박스 `docs/inbox/from-gh-trade/261104-accum-price-batch-buckets.md`
  정정(gh-trade-22 확인): 정기 묶음은 관찰자에게도 Broadcast, 로그인 스냅샷(`is_snapshot`)은 관찰자 로그인 89 뒤에 온다.
  사용자 세션(`#onFrame`)으로도 95 가 오지만(88 과 같은 접속 연결 전부) **명시 case 로 받아 무시**한다(PC-12 미처리 계수기 0 유지 ·
  디버그 로그) — 원천을 둘로 만들지 않는다(돌파 76/78 이 quote 쪽을 무시하는 것과 반대 방향의 같은 원칙).
- relay 는 전역 캐시 `isin → { last, rate, base }` 하나를 든다. 정기 묶음 = 변경분 병합, 스냅샷(여러 프레임일 수 있음 · 512개씩) =
  병합. quote 연결이 새로 ready(재접속 · 시세 주 서버 전환)되면 캐시를 비운다 — 새 서버의 스냅샷이 다시 채운다.
- 웹으로는 새 relay 메시지(예: `{ t: "accum.prices", snap, items }` — 이름·모양은 `packages/shared/src/relay.ts` 계약에 플래너가 정한다)로
  내보낸다. 웹 소켓이 ready 될 때 지금 캐시 전체를 snap 으로 1회, 그 뒤 95 정기 묶음 변경분을 그대로 흘린다.
  수신 대상은 기존 시장 데이터(시세)와 같은 인증 규칙.
- 결과적 커버리지: quote 주 서버의 매집 감시 집합만 95 로 온다. 패널이 다른 서버(예: KB120 계좌 · quote 주 KYOBO119)를 보이면
  서버 사이 등록 차이만큼은 95 에 없다 → 그 종목만 기존 구독 폴백. 이것이 「95 부재면 기존 구독 폴백」 의 종목 단위 의미다.
- 웹: 표시 현재가 = 95 값 → (없으면) 구독 시세 → (없으면) 행 값. 등락률은 95 의 `change_rate` 를 그대로(59 QuoteState.change_rate
  와 같은 값), 폴백 경로는 지금 `liveRateOf` 그대로. **구독 후보는 활성 행 중 95 캐시에 없는 종목만** — 40 예산을 95 가 대체한다.
- 청산 행은 지금처럼 행 값 고정(95 값을 쓰지 않는다).
- 렌더 비용: 95 는 300ms 주기 변경분이다. relay 컨텍스트 전체 리렌더를 키우지 않게 돌파 시세 훅처럼 ≤5Hz 스로틀 또는 별도 구독
  저장소로 패널에만 흘린다(debug `trading-cpu-260923` 교훈) — 방식은 플래너 재량.

### 스키마 동기화
- relay 생성물(`relay/src/generated/**`)에 95 가 아직 없다(SYNC MARKER `e96aef6e`). gh-trade 소유 스크립트로 맞춘다:
  `cd /Users/alex/repos/gh-trade && RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh`
  (flatc 25.12.19 고정 · 손편집 금지). gh-trade master 의 fbs 기준 — 90 `buckets` append(l7i)도 같이 들어온다(무해).
- 수기 사본 3곳 갱신 필수: `relay/src/dma/msg-type.ts`(`MSG` · `INBOUND_MSG_TYPES` 화이트리스트 — 빠지면 조용히 warn 드롭),
  `relay/src/dma/envelope.ts`(파서), `relay/src/hub/subscription-hub.ts` switch(`#onFrame` · `#onFeedFrame` 둘 다 명시 case).

### Claude's Discretion
- relay 메시지 이름·필드 축약, 캐시 자료구조, 웹 저장소/훅 분리 방식, 스로틀 간격, 필터 저장 키 이름, 입력 칸 너비.
- 필터 판정·직렬화 순수 함수 위치(`accum-list.ts` 권장)와 테스트 구성.

</decisions>

<specifics>
## Specific Ideas

- 채택 목업: `.planning/quick/261104-nxs-relay-95-accumpricebatch/mockup-filter.html` 의 **A**(펼친 표 위 한 줄 · 라벨 옆 「필터 밖 N」 ·
  전부 보기 때 표의 필터 밖 행 흐리게).
- gh-trade 원본 동작: `/Users/alex/repos/gh-trade/.planning/quick/261104-519-accum-watch-filter-mcap-cap-removal/261104-519-SUMMARY.md`
  (AccumFilter 판정 규칙 — 경계 포함 · 소수 둘째 자리 반올림 · 억→원 반올림 · 빈칸=제한 없음 · 잘못된 값=빈칸).
  gh-trade C-3(현재가 모름 → 통과 아님)은 웹에선 행 값 폴백이 있어 등락률이 늘 있으므로 해당 없음.

</specifics>

<canonical_refs>
## Canonical References

- 인박스: `docs/inbox/from-gh-trade/261104-accum-price-batch-buckets.md`(95 계약 · 관찰자 수신 정정)
- gh-trade 스키마 정본: `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs`(quick-261104-k9l 블록 · `AccumPriceItem` · `AccumPriceBatch` · Envelope 슬롯 114)
- gh-trade 프로토콜 표: `/Users/alex/repos/gh-trade/server/docs/protocol.md` 「AccumPriceBatch(95)」 행
- relay 계약 정본: `packages/shared/src/relay.ts`
- 현행 패널 규칙: `webapp/src/components/trading/workbench/accum-strip.tsx` 머리 주석 ①~⑩, `webapp/src/lib/accum-list.ts`, `webapp/src/lib/use-breakout-quotes.ts`

</canonical_refs>
