---
phase: quick-260912-gyz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/e2e/specs/trading-limit-chaser.spec.ts
autonomous: true
requirements: [TRADE-01]

estimate:
  tokens: 100000
  raw_tokens: 50000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "상따 헤더 카드에 가격 칩 행이 없다 — 종목을 골라도, 편집으로 들어와도, 호가가 도착해도 그 행은 DOM 에 없다(숨김이 아니라 부재다)"
    - "칩 행이 사라지면서 고아가 되는 파생값·조각·import 가 0개다 — lint warning 기준선 3건이 그대로다"
    - "감시 대상 세그먼트에서 「매도잔량」을 고르면 파랑(`--down`), 「매수잔량」을 고르면 빨강(`--up`)이다 — 호가창의 매도=파랑 / 매수=빨강 축과 같은 방향이다"
    - "`buyWatchSide` 가 더티일 때 세그먼트 테두리가 `--primary` 인 표현은 그대로 살아 있다"
    - "상따 폼의 그룹 소제목·행 라벨·세그먼트 버튼 글꼴이 모바일·데스크톱 모두 13px 이고, 체크박스가 17px 이며, 입력 높이가 38px 이다"
    - "★ 모바일 입력 글꼴이 여전히 16px 이다 — 16px 미만으로 내려간 입력이 0개이므로 iOS Safari 가 포커스 시 화면을 확대하지 않는다. 데스크톱만 15px 다"
    - "라벨 칸 `--lw` 가 모바일 76px · 데스크톱 104px 이라 「잔량추적」·「취소잔량」 4글자가 체크박스와 함께 들어가고 잘리지 않는다"
    - "데스크톱(≥1280) 헤더 종목정보 8칸이 한 줄 가로 나열이고, 폭이 모자라면 다음 줄로 넘어간다"
    - "모바일(<1280) 헤더 종목정보는 2열 4행 그대로다 — 클래스가 한 글자도 바뀌지 않았다"
    - "8칸의 값 산출이 한 벌뿐이다 — 배치를 바꾸려고 같은 값을 두 번 계산하거나 JSX 를 복제한 곳이 0곳이다"
    - "8칸의 값·색·포맷 규칙이 불변이다(시·고·저는 기준가 대비 방향색, 상한·상승VI 는 `--up`, 하한은 `--down`, 시총·발행1% 중립, 모르면 `—`)"
    - "전송 cfg·무장 판정식·데이터 경로가 한 줄도 바뀌지 않았다 — 이번 변경은 전부 표시다"
  artifacts:
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
  key_links:
    - "세그먼트 방향색 ↔ 호가창 색 축(`orderbook-ladder` 매도=`--down` / 매수=`--up`) — 둘이 어긋나면 사용자는 같은 화면에서 반대 색을 본다"
    - "`--lw` ↔ `Row`/`CheckRow` 1열 — `CheckRow` 1열에는 체크박스 17px + gap 이 라벨과 함께 들어가므로 라벨 글꼴을 올리면 이 폭이 함께 올라가야 한다"
    - "칩 행 삭제 ↔ `tickSize`/`deriveTickSize` — 칩 행이 그 파생값의 유일한 소비처였다. 남기면 lint warning 기준선이 깨진다"
    - "헤더 8칸 배치 분기 ↔ `lc-quote-grid > div` 셀렉터 — 기존 단위 테스트 4건이 그 직계 자식 8개를 세고 있다. 래퍼를 끼우면 그 4건이 한꺼번에 죽는다"
    - "e2e `trading-limit-chaser.spec.ts:160` ↔ 칩 행 — 직전 quick 이 상한가 칩을 걷었는데 이 단언은 그 칩의 텍스트를 계속 요구한다(이미 거짓이다). 이번에 새 계약으로 다시 쓴다"
---

<objective>
사용자가 목업(`260912-chaser-desktop.html`, 「안 A」 채택)을 검토해 확정한 상따 후속 다듬기 4건을
구현한다.

① 가격 칩 행 **전체 삭제** · ② 감시 대상 세그먼트를 **그 선택지의 방향색**으로 · ③ 폼 글자 확대
(모바일 입력 16px 은 유지) · ④ 데스크톱 종목정보를 **한 줄 가로 나열**로.

Purpose: 직전 quick(260911-w5h)이 모바일을 정리하면서 남긴 세 가지 부채를 닫는다 — ⓐ 헤더 8칸과
칩 행이 같은 카드에서 같은 말을 두 번 하던 것 ⓑ 감시 대상 세그먼트가 「매도호가 잔량을 본다」면서
화면은 빨강이라고 말하던 것 ⓒ 폼 글자가 11~12px 이라 실사용에서 읽기 힘들던 것. 그리고 ⓓ 모바일
전용으로 만든 헤더 8칸이 데스크톱에서 2열 4행으로 92px 을 먹던 것을 한 줄로 눕힌다.

Output: 두 프레젠테이션 컴포넌트(`limit-chaser-client.tsx` · `limit-chaser-form.tsx`)의 마크업·
클래스 변경, 그 계약을 잠그는 단위 테스트, 이미 거짓이 된 e2e 단언 1건의 재작성. 커밋 2개.

★ 이 plan 에는 `tracer` 태스크가 **없다**. 관통할 층이 없기 때문이다 — 데이터 경로·전송 cfg·
무장 판정식은 한 줄도 바뀌지 않고, 바뀌는 것은 이미 결선된 두 컴포넌트의 마크업과 클래스뿐이다.
얇은 수직 슬라이스를 만들면 「클래스 한 개만 먼저 바꾸는」 인위적 태스크가 될 뿐 새 정보를 주지
않는다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

**시각 정본 — 반드시 먼저 열어라:**
@.planning/quick/260912-gyz-chaser-polish-remove-price-chips-directi/260912-chaser-desktop.html
(데스크톱 프레임 1152px = 1440 뷰포트 − 사이드바 240 − main 여백 48. **「안 A」가 채택안**이다.
`.form.big` / `.mform.big` 프로파일이 ③ 의 정본이고, `.seg button.onask/.onbid` 가 ② 의 정본,
`.i-row` 가 ④ 데스크톱 배치의 정본이다.)

**출발점 — 이번 변경은 여기서 시작한다. 오래된 기억으로 고치지 마라:**
@.planning/quick/260911-w5h-chaser-mobile-ui-rework-form-label-reaso/260911-w5h-SUMMARY.md

**고칠 파일:**
@webapp/src/components/trading/limit-chaser-client.tsx
@webapp/src/components/trading/limit-chaser-form.tsx
@webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
@webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
@webapp/e2e/specs/trading-limit-chaser.spec.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 칩 행을 걷고 · 세그먼트를 방향색으로 · 폼 글자를 키운다 (①②③)</name>

  <precondition>
  작업 트리가 `master` 이고 HEAD 가 `faa3b93`(직전 quick 260911-w5h 의 마지막 커밋) 위에 있다.
  `git log --oneline -1` 로 확인한다 — 그보다 앞선 커밋에서 시작하면 아래 줄 번호·클래스 원문이
  전부 어긋난다. 어긋나면 멈추고 보고한다.
  </precondition>

  <files>
webapp/src/components/trading/limit-chaser-client.tsx
webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
webapp/src/components/trading/limit-chaser-form.tsx
webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
webapp/e2e/specs/trading-limit-chaser.spec.ts
  </files>

  <read_first>
`webapp/src/components/trading/limit-chaser-client.tsx` — 파생값 블록(`upperLimit`~`tickSize`),
헤더 카드 렌더, 파일 하단 조각 정의(`QuoteCell` · `priceText` · `priceTone` · `PriceChip`).
`webapp/src/components/trading/limit-chaser-form.tsx` — 파일 상단 JSDoc ②-1, 감시 대상 세그먼트
블록, 하단 구성 요소(`Card` · `GroupHeader` · `Row` · `NumInput` · `CheckRow`).
`webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — `describe('⑰ 모바일 폼
표시 계약 (260911-w5h)')` 전체.
  </read_first>

  <behavior>
  **① 칩 행 부재 (`limit-chaser-client.test.tsx`)**
  - 기존 「가격 칩은 기준가 · 호가단위 2개뿐이다」 케이스를 **부재 단언으로 다시 쓴다** —
    편집 진입 + 호가 도착 상태에서도 칩 행 슬롯을 찾으면 `null` 이다. 지워서 통과시키지 않는다.
  - 기존 ④ 케이스(신규 진입에서 칩 행이 없다)의 단언은 **그대로 참**이므로 손대지 않는다.
  - 같은 상태에서 헤더 8칸(`lc-quote-grid`)은 **여전히 있다** — 칩만 사라진 것이지 정보가
    사라진 것이 아님을 같은 케이스가 함께 단언한다.

  **② 세그먼트 방향색 (`limit-chaser-form.test.tsx`)**
  - 서버값 `buyWatchSide: '0'`(매도잔량) 상태: 「매도잔량」 버튼 className 에
    `bg-[var(--down-bg)]` 와 `text-[var(--down)]` 가 있고 `--up-bg` 는 **없다**.
    같은 순간 「매수잔량」 버튼은 `bg-transparent` + `text-[var(--muted-fg)]` 다.
  - 「매수잔량」을 클릭한 뒤: 그 버튼이 `bg-[var(--up-bg)]` + `text-[var(--up)]` 가 되고,
    「매도잔량」이 `bg-transparent` 로 돌아간다.
  - 기존 ⑰ 의 더티 테두리 케이스와 전송 cfg 회귀 케이스는 **무수정 통과**해야 한다.

  **③ 치수 (`limit-chaser-form.test.tsx` — ⑰ 의 치수 케이스 3건을 새 값으로 다시 쓴다)**
  - 카드 className 에 `[--lw:76px]` 와 `min-[1280px]:[--lw:104px]` 가 있다(옛 64/88 은 없다).
  - 입력 래퍼 className 에 `h-[38px]` 가 있고, 데스크톱 높이 override 가 **없다**
    (`min-[1280px]:h-` 로 시작하는 유틸이 래퍼에 하나도 없다).
  - ★ 입력 `<input>` className 에 `text-[16px]` 가 **그대로 있고** 데스크톱 override 가
    `min-[1280px]:text-[15px]` 다 — `--t-caption` 을 참조하는 글꼴 유틸이 그 입력에 없다.
    이 케이스의 주석에 「16px 미만이면 iOS Safari 가 포커스 시 확대하고 되돌리지 않는다」를
    남긴다.
  - 체크박스 className 이 `size-[17px]` 이고 데스크톱 size override 가 없다.
  - 행 라벨(`Row`)·체크박스 라벨(`CheckRow`)·그룹 소제목·세그먼트 버튼의 글꼴이 전부
    `text-[13px]` 이고, 넷 중 어디에도 `text-[11px]`·`text-[12px]` 가 남아 있지 않다.
  - 단위(`원`/`주`) 글꼴이 `text-[13px]` + `min-[1280px]:text-[12px]` 다.
  </behavior>

  <action>
**① 가격 칩 행 전체 삭제 — `limit-chaser-client.tsx`**

1. `data-slot` 이 `lc-price-chips` 인 조건부 블록(`{isin !== '' && !searching && (…)}` 전체와
   그 안의 두 칩)을 **통째로 제거**한다. 그 바로 위에 붙은 「가격 칩 — …」 주석 블록도 함께
   지운다 — 사라진 요소를 설명하는 주석은 다음 사람에게 거짓말을 한다.
2. 고아가 되는 것을 **grep 으로 확인한 뒤** 제거한다. 실측 결과는 이렇다:
   - `tickSize` 상수 — 소비처가 칩 하나뿐이었다. **제거한다.**
   - `deriveTickSize` import(`order-panel` 에서 온다) — 이 파일의 유일한 소비처가 위
     `tickSize` 였다. **import 를 제거한다.** `order-panel` 의 정의와 `stock-orderbook-section`
     의 소비는 손대지 않는다(그쪽은 그대로 살아 있다).
   - 파일 하단 `PriceChip` 조각 정의 — 호출부가 0 이 된다. **정의를 제거한다.**
     (직전 quick 이 `RowKey`/`RowValue` 를 같은 이유로 지웠다 — 남기면
     `@typescript-eslint/no-unused-vars` warning 이 늘어 기준선 3건이 깨진다.)
   - `basePrice` 는 **남긴다** — 헤더 8칸의 방향색 기준이자 `OrderbookLadder` 의 prop 이다.
   - `lowerLimit` 도 **남긴다** — 헤더 8칸의 「하한」이 그 값을 쓴다.
   - `KRW`·`priceText`·`priceTone`·`QuoteCell` 전부 8칸이 계속 쓴다. 남긴다.
   제거 후 그 파일에 미사용 심볼이 하나도 없음을 lint 로 확인한다(기준선 3건 그대로).
3. 파일 상단 JSDoc ① 의 화면 조립 서술에서 「+ 기준가·호가단위 칩」 부분을 **사실에 맞게
   고친다** — 헤더 카드는 이제 거래소 콤보 · 종목명 버튼 · 현재가/등락률 · 종목정보 8칸으로
   끝난다.

**② 감시 대상 세그먼트 = 그 선택지의 방향색 — `limit-chaser-form.tsx`**

4. 세그먼트 버튼의 선택 분기를 **선택지별로** 가른다. 지금은 선택되면 무조건
   `bg-[var(--up-bg)] text-[var(--up)]` 인데, `side === '0'`(매도잔량)이면
   `bg-[var(--down-bg)] text-[var(--down)]`, `side === '1'`(매수잔량)이면
   `bg-[var(--up-bg)] text-[var(--up)]` 로 한다. 비선택은 지금 그대로
   `bg-transparent text-[var(--muted-fg)]` 다. 더티 테두리(`border-[var(--primary)]`)는
   컨테이너 쪽이므로 손대지 않는다.
5. **근거를 세그먼트 블록 주석에 남긴다.** 두 문장이다:
   ⓐ 감시 대상은 「어느 쪽 호가 잔량을 보는가」이므로 색은 그룹(매수주문)이 아니라 **그 호가의
   방향**을 따라야 한다 — 호가창의 매도=`--down` · 매수=`--up` 축과 같은 축이다. 그룹 색을
   그대로 쓰면 매도호가 잔량을 감시하는데 화면은 빨강이라고 말한다.
   ⓑ 파일 상단 ②-1 의 「색·위치·문구 3중 일치」는 **게이트 스위치와 매수/매도 탭**에 대한
   규율이고 이 세그먼트는 그 대상이 아니다 — 두 규율이 충돌하는 것처럼 읽히지 않게 이 문장을
   함께 적는다.
6. 파일 상단 JSDoc ②-1 의 ⓐⓑⓒ 열거 뒤에 **한 문장**을 잇는다: 감시 대상 세그먼트는 그 축의
   예외이며 자기 선택지의 호가 방향색을 따른다(근거는 세그먼트 블록 주석).

**③ 폼 글자 크기 확대 — `limit-chaser-form.tsx`**

목업 `.form.big` / `.mform.big` 이 정본이다. 아래가 전수 목록이고, 이 밖의 치수는 건드리지
않는다.

| 대상 | 지금 | 바꾼 뒤 |
|---|---|---|
| `Card` 라벨 칸 | `[--lw:64px]` · `min-[1280px]:[--lw:88px]` | `[--lw:76px]` · `min-[1280px]:[--lw:104px]` |
| 그룹 소제목 | `text-[11px]` | `text-[13px]` |
| `Row` 라벨 | `text-[11px]` + 데스크톱 `--t-caption` override | `text-[13px]` (override 제거) |
| `CheckRow` 라벨 | `text-[11px]` + 데스크톱 `--t-caption` override | `text-[13px]` (override 제거) |
| `NumInput` 래퍼 | `h-9` · `min-[1280px]:h-8` | `h-[38px]` (데스크톱 override 제거) |
| `NumInput` 입력 | `text-[16px]` + 데스크톱 `--t-caption` override | `text-[16px]` · `min-[1280px]:text-[15px]` |
| 단위 span | `text-[10px]` | `text-[13px]` · `min-[1280px]:text-[12px]` |
| 세그먼트 컨테이너 | `h-9` · `min-[1280px]:h-8` | `h-[38px]` (데스크톱 override 제거) |
| 세그먼트 버튼 | `text-[12px]` | `text-[13px]` |
| 체크박스 | `size-4` · `min-[1280px]:size-[18px]` | `size-[17px]` (데스크톱 override 제거) |
| `Row`/`CheckRow` 행 최소 높이 | `min-h-9` · `min-[1280px]:min-h-8` | `min-h-[38px]` (데스크톱 override 제거) |

마지막 행(행 최소 높이)의 근거를 그 자리 주석에 남긴다: 입력이 38px 로 양쪽 폭에서 같아졌으므로
입력이 없는 행만 36/32 로 남으면 그 행에서만 세로 리듬이 끊긴다. 행 높이는 입력 높이를 따른다.

7. **★ 모바일 입력 글꼴 16px 은 절대 내리지 않는다.** `NumInput` 입력의 기존 16px 주석을
   **확장해** 이번 변경 사실을 못박는다: 데스크톱만 15px 로 올렸고 모바일 16px 은 그대로다.
   16px 미만이면 iOS Safari 가 포커스 시 화면을 확대하고 **되돌리지 않는다** — 이번 사이클에서
   그 문제를 고친 유일한 장치이므로, 뒤에 오는 어떤 「통일」 변경도 이 값을 내려서는 안 된다.
8. **★ `Card` 의 JSDoc 을 다시 쓴다.** 지금 그 주석은 「라벨 글꼴 11px + 체크박스 16px + gap
   3px 이면 4글자가 64px 에 들어간다」고 **64/88 을 근거와 함께 정당화**하고 있다 — 이번 변경
   뒤에는 그 문장이 통째로 거짓이다. 새 근거로 교체한다: 라벨이 13px 이 되면 4글자
   (「잔량추적」·「취소잔량」)가 **체크박스 17px + gap 과 함께** 64px/88px 안에 안 들어가
   조용히 잘린다. 그래서 모바일 76px · 데스크톱 104px 이다. `--lw` 가 `Row` 와 `CheckRow`
   **둘 다**의 1열 폭이라는 기존 서술과 카드 크롬이 데스크톱 전용이라는 서술은 그대로 참이므로
   유지한다.
9. **★ 모바일 잘림 조건을 그 주석에 함께 적는다:** 390px 뷰포트에서 `10,000,000` + 단위가
   **여전히 안 잘려야 한다**. 목업이 그 폭에서 실제로 렌더해 확인한 조건은 — 좌 40% 호가 /
   우 60% 폼, `AppShell main` 여백 8px, `--lw:76px`, 입력 글꼴 16px — 이다. jsdom 에는
   레이아웃이 없어 이 조건은 **단위 테스트가 증명할 수 없다**. SUMMARY 의 미검증 항목에
   그대로 적는다.

**④ 이미 거짓이 된 e2e 단언 재작성 — `webapp/e2e/specs/trading-limit-chaser.spec.ts`**

10. 테스트 2(「종목 선택 → 가격 5칸이 상한가로 시딩되고…」)가 칩 행 텍스트에 「상한가」가 들어
    있기를 요구한다. **직전 quick 이 상한가 칩을 이미 걷었으므로 이 단언은 지금도 거짓**이다
    (Playwright 를 돌리지 않아 드러나지 않았을 뿐이다). 새 계약으로 다시 쓴다:
    칩 행 슬롯은 `toHaveCount(0)` 이고, 대신 헤더 종목정보 그리드(`lc-quote-grid`)가
    「상한」 라벨과 `LIVE_UPPER_LIMIT` 값을 함께 담는다. 단언의 의도(폼과 헤더가 **같은
    숫자**를 말한다)는 유지하되 그 증거를 살아 있는 표면으로 옮기는 것이다.
    바로 위 「폼과 칩이 같은 숫자를 말해야 한다」 주석도 헤더 기준으로 고친다.
11. 테스트 1 의 `lc-price-chips` 부재 단언(`toHaveCount(0)`)은 **그대로 참**이다 — 남기되,
    「종목이 없으면」이라는 전제 주석을 「행 자체를 없앴다」로 고친다.
12. **Playwright 는 실행하지 않는다.** `pnpm -C webapp typecheck` 의 `tsconfig.e2e.json` 통과로만
    확인하고, 그 사실(「고쳤다」이지 「통과를 봤다」가 아니다)을 SUMMARY 에 적는다.

**커밋:** 이 태스크의 결과를 원자적 커밋 1개로 남긴다. 메시지는 한글, 커밋 전에 사용자에게
메시지를 보여주고 확인을 받는다. `Co-Authored-By` 는 넣지 않는다.
  </action>

  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp test 2>&1 | tail -4</automated>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp lint 2>&1 | grep -c 'Warning:'; pnpm -C webapp lint 2>&1 | grep -c 'Error:'</automated>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp typecheck</automated>
    <automated>cd /Users/alex/repos/gh-radar && grep -c 'data-slot="lc-price-chips"' webapp/src/components/trading/limit-chaser-client.tsx; grep -c 'function PriceChip' webapp/src/components/trading/limit-chaser-client.tsx; grep -cE '^import .*order-panel' webapp/src/components/trading/limit-chaser-client.tsx</automated>
    <automated>cd /Users/alex/repos/gh-radar && grep -c 'var(--down-bg)' webapp/src/components/trading/limit-chaser-form.tsx; grep -c '\[--lw:76px\]' webapp/src/components/trading/limit-chaser-form.tsx; grep -c 'min-\[1280px\]:\[--lw:104px\]' webapp/src/components/trading/limit-chaser-form.tsx</automated>
  </verify>

  <done>
- `pnpm -C webapp test` exit 0 · **63 files** · passed **≥ 763** · skipped 1 (감소 0)
- `pnpm -C webapp lint` → `Warning:` **정확히 3** · `Error:` **0**
- `pnpm -C webapp typecheck` exit 0 (`tsc --noEmit` + `tsc -p tsconfig.e2e.json`)
- `limit-chaser-client.tsx` 에서 칩 슬롯 **0건** · `PriceChip` 정의 **0건** · `order-panel`
  import 줄 **0건**
- `limit-chaser-form.tsx` 에 `var(--down-bg)` **≥1** · `[--lw:76px]` **1** ·
  `min-[1280px]:[--lw:104px]` **1**
- 세그먼트 방향색 · 치수 7종 · 칩 부재가 전부 단위 테스트로 잠겼고, 깨진 기존 케이스는
  **새 계약으로 다시 썼다**(단언을 지워서 통과시킨 곳 0건)
- `limit-chaser-form.tsx` 상단 JSDoc ②-1 과 `Card` JSDoc, `NumInput` 16px 주석,
  `limit-chaser-client.tsx` 상단 JSDoc ① 이 전부 **바뀐 사실과 일치**한다
- 한글 메시지 커밋 1개 (`Co-Authored-By` 없음)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 데스크톱 종목정보를 한 줄 가로 나열로 (④ 안 A)</name>

  <files>
webapp/src/components/trading/limit-chaser-client.tsx
webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  </files>

  <read_first>
`.planning/quick/260912-gyz-chaser-polish-remove-price-chips-directi/260912-chaser-desktop.html`
의 **「안 A」 프레임**과 그 `.i-row` / `.i-row .cell` / `.i-row .k` / `.i-row .v` 규칙,
`.hd-nm b` · `.chg b` · `.chg span` 글꼴.
`webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx` 의 `cells()` /
`cellText()` 헬퍼와 그것을 쓰는 4개 케이스(8칸 개수·라벨 순서 / 대시 8개 / 값 8개 / 색 8개).
  </read_first>

  <behavior>
  - 8칸 컨테이너는 **하나**다. 모바일 클래스(`grid grid-cols-2` + `border-t` + `py-1`)가
    그대로 남아 있고, 데스크톱 배치는 전부 `min-[1280px]:` 접두 유틸로만 얹힌다 —
    맨몸(접두 없는) 데스크톱 전용 유틸이 0개다.
  - 데스크톱 유틸에 `flex` · `flex-wrap` · `items-baseline` · `gap-x-[22px]` 가 있다.
  - 칸 개수는 여전히 **8** 이고 `lc-quote-grid` 의 **직계 자식**이다 — 기존 4개 케이스가
    래퍼 없이 그대로 통과한다(`cells()` 가 `> div` 를 센다).
  - 각 칸: 데스크톱에서 값이 `ml-auto` 로 밀리지 않고 라벨 바로 옆에 붙는다
    (`min-[1280px]:ml-0`), 라벨의 모바일 최소폭이 데스크톱에서 풀린다
    (`min-[1280px]:min-w-0`), 글꼴이 데스크톱 12px 이다.
  - 값 산출이 한 벌뿐이다 — 파일 전체에서 `QuoteCell` 호출이 **정확히 8개**다.
  - 뷰포트 폭을 JS 로 재는 분기(미디어쿼리 훅·창 폭 측정·resize 리스너)가 **0개**다.
  - 헤더 글꼴: 종목명은 모바일 16px 유지 + 데스크톱 20px, 현재가는 모바일 16px 유지 +
    데스크톱 22px, 단축코드·등락률은 모바일 11px 유지 + 데스크톱 12px·13px.
  - 값·색·포맷 케이스 4건은 **한 글자도 고치지 않고** 통과한다. 고쳐야 한다면 그것은 이번
    변경이 값 산출을 건드렸다는 뜻이므로 되돌린다.
  </behavior>

  <action>
**배치 분기는 CSS 로만 한다 — 이것이 이 태스크의 핵심 제약이다.**

같은 데이터를 두 벌로 렌더하면(모바일용 JSX 하나 + 데스크톱용 JSX 하나) 언젠가 한쪽만
고쳐지고, 그때 사용자는 폭에 따라 다른 숫자를 보게 된다. 8칸의 값 산출은 이미 한 벌이므로
**그 한 벌을 그대로 두고 컨테이너·칸의 클래스에만 `min-[1280px]:` 분기를 얹는다.** 뷰포트 폭을
JS 로 재는 훅이나 조건부 렌더를 만들지 않는다 — SSR 과 첫 페인트에서 배치가 튄다.

1. **컨테이너** — `lc-quote-grid` 슬롯의 클래스에 데스크톱 유틸을 잇는다. 모바일 부분은 한
   글자도 바꾸지 않는다.
   - 유지: `grid grid-cols-2 border-t border-[var(--border-subtle)] py-1`
   - 추가: `min-[1280px]:flex min-[1280px]:flex-wrap min-[1280px]:items-baseline
     min-[1280px]:gap-x-[22px] min-[1280px]:gap-y-0 min-[1280px]:px-3.5 min-[1280px]:py-2`
     (`gap-x-[22px]` 와 `px-3.5`(14px) / `py-2`(8px) 는 목업 `.i-row` 의 `gap:0 22px` ·
     `padding:8px 14px` 동형이다. `flex` 가 켜지면 `grid-cols-2` 는 무시되므로 별도 해제가
     필요 없다.)

2. **칸(`QuoteCell`)** — 모바일 클래스 유지 + 데스크톱 override 3개.
   - 루트: 유지 `flex items-baseline gap-1.5 px-2.5 py-[3px] text-[11px]` / 추가
     `min-[1280px]:px-0 min-[1280px]:py-0 min-[1280px]:text-[12px]`
     (칸 패딩을 0 으로 돌리는 이유: 데스크톱에서는 칸 사이 간격을 컨테이너의 `gap-x` 가
     담당한다. 둘 다 주면 22px 에 20px 이 더해져 한 줄에 8칸이 안 들어간다.)
   - 라벨: 추가 `min-[1280px]:min-w-0` (모바일 `min-w-[34px]` 는 2열에서 값의 좌측 끝을
     맞추는 장치다. 한 줄 나열에서는 그 폭이 라벨 뒤에 빈 공간을 만든다.)
   - 값: 추가 `min-[1280px]:ml-0` (모바일 `ml-auto` 는 값을 칸의 오른쪽 끝으로 민다. 한 줄
     나열에서는 라벨 바로 옆에 붙어야 「라벨 값」 한 쌍으로 읽힌다.)
   - `QuoteCell` 의 JSDoc 을 사실에 맞게 고친다: 이 칸은 **두 배치**를 산다 — 모바일 2열 4행
     에서는 라벨 왼쪽 · 값 오른쪽, 데스크톱 한 줄 나열에서는 `라벨 값` 인라인 쌍. 색은
     호출부가 정한다는 기존 서술은 그대로 참이다.

3. **값·색·포맷 규칙은 그대로다.** 시가·고가·저가는 `basePrice` 대비 방향색, 상한·상승VI 는
   `--up`, 하한은 `--down`, 시총·발행1% 는 중립, 모르면 `—`. 라벨 8개와 그 순서도 그대로다.
   `priceText`·`priceTone`·`formatMarketCap`·`formatOnePercentShares` 를 한 줄도 고치지
   않는다.

4. **헤더 나머지** — 계좌 칩 · 거래소 콤보 · 종목명 버튼 · 현재가의 **구조는 그대로**이고
   데스크톱 글꼴만 키운다(목업 `.dt` 프레임 동형). 모바일 값은 전부 유지한다.
   - 종목명 `<b>`: 유지 `text-[16px]` / 추가 `min-[1280px]:text-[20px]`
   - 단축코드 `<span>`: 유지 `text-[11px]` / 추가 `min-[1280px]:text-[12px]`
   - 현재가 `<b>`: 유지 `text-[16px]` / 추가 `min-[1280px]:text-[22px]`
   - 등락률 `<small>`: 유지 `text-[11px]` / 추가 `min-[1280px]:text-[13px]`
   현재가/등락률의 세로 스택(`flex-col items-end`)은 **바꾸지 않는다** — 목업은 한 줄 baseline
   이지만 그 변경은 확정 스펙 밖이고, 모바일 레이아웃까지 함께 흔든다.

5. **파일 상단 JSDoc ①** 의 화면 조립 서술에 배치 분기를 적는다: 헤더 종목정보는 모바일 2열
   4행 · 데스크톱(≥1280) 한 줄 가로 나열이며, **같은 8칸이 클래스만 갈아입는다**(배열도 JSX도
   한 벌이다)는 사실을 함께 남긴다. 목업 정본 파일명
   (`260912-chaser-desktop.html` 「안 A」)을 근거로 인용한다.

6. **테스트** — `limit-chaser-client.test.tsx` 에 케이스를 더한다. 기존 4개 케이스는
   **손대지 않는다**(그것이 「값 산출이 안 바뀌었다」의 증거다).
   - 컨테이너가 모바일 2열 클래스를 유지하면서 데스크톱 flex-wrap 유틸을 갖는다.
   - 칸 8개 각각이 데스크톱 override 3종(`min-[1280px]:ml-0`·`min-[1280px]:min-w-0`·
     `min-[1280px]:text-[12px]`)을 갖는다.
   - **복제 금지 잠금**: 렌더된 `lc-quote-grid` 가 문서에 **1개**이고 그 직계 자식이 8개다
     (모바일용·데스크톱용 컨테이너가 둘 다 DOM 에 있는 구현을 이 단언이 잡는다).
   - 헤더 글꼴 4종이 모바일 값을 유지한 채 데스크톱 override 를 갖는다.

7. ⚠️ **jsdom 이 증명하지 못하는 것**을 SUMMARY 에 정직하게 적는다: 클래스 단언은 「그 유틸이
   붙어 있다」를 잠글 뿐 「1152px 에서 8칸이 한 줄에 들어간다」를 잠그지 않는다. 그것은 목업이
   실폭에서 렌더해 확인한 사실이고, 실기기 확인은 남는다.

**커밋:** 원자적 커밋 1개. 한글 메시지, 커밋 전 사용자 확인, `Co-Authored-By` 없음.
  </action>

  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp test 2>&1 | tail -4</automated>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp lint 2>&1 | grep -c 'Warning:'; pnpm -C webapp lint 2>&1 | grep -c 'Error:'</automated>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp typecheck && pnpm -C webapp build</automated>
    <automated>cd /Users/alex/repos/gh-radar && grep -c '<QuoteCell' webapp/src/components/trading/limit-chaser-client.tsx; grep -c 'data-slot="lc-quote-grid"' webapp/src/components/trading/limit-chaser-client.tsx</automated>
    <automated>cd /Users/alex/repos/gh-radar && git diff --stat faa3b93..HEAD -- webapp/src/lib/quote-format.ts webapp/src/lib/limit-chaser.ts webapp/src/components/orderbook/order-panel.tsx</automated>
  </verify>

  <done>
- `pnpm -C webapp test` exit 0 · **63 files** · passed **≥ Task 1 종료 시점 값** · skipped 1
- `pnpm -C webapp lint` → `Warning:` **정확히 3** · `Error:` **0**
- `pnpm -C webapp typecheck` · `pnpm -C webapp build` 둘 다 exit 0
- `limit-chaser-client.tsx` 의 `QuoteCell` 호출이 **정확히 8개** · `lc-quote-grid` 슬롯이
  **정확히 1개** (값 산출·컨테이너가 복제되지 않았다는 증거)
- `faa3b93..HEAD` 기준 `quote-format.ts` · `limit-chaser.ts` · `order-panel.tsx` diff **0줄**
  (데이터·포맷·호가단위 산출 경로가 이번 quick 전체에서 불변)
- 기존 8칸 케이스 4건(개수·라벨 순서 / 대시 8개 / 값 8개 / 색 8개)이 **무수정 통과**
- 파일 상단 JSDoc ① 과 `QuoteCell` JSDoc 이 두 배치를 사실대로 서술한다
- 한글 메시지 커밋 1개 (`Co-Authored-By` 없음)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay wss → 브라우저 렌더 | 호가·상한/하한·시총이 화면에 그려지는 경계. 이번 변경은 **표시만** 바꾸고 전송·판정·저장 경로는 건드리지 않는다 |
| 브라우저 화면 → 사용자의 매매 판단 | 화면의 숫자와 색이 곧 발주 판단이 되는 경계. 잘못된 색·잘린 숫자가 곧 오발주다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-gyz-01 | Repudiation | 칩 행 삭제로 사라지는 「기준가 · 호가단위」 | low | accept | 사용자가 행 전체 삭제를 **확정**했다. 기준가는 헤더 8칸의 방향색 기준으로 계속 살아 있고(시·고·저가 그 기준으로 칠해진다), 호가단위는 상따 폼이 사용자에게 요구하지 않는 값이다. 같은 화면의 사다리가 인접 호가 간격으로 그 사실을 계속 보여준다 |
| T-gyz-02 | Tampering | 감시 대상 세그먼트 색 반전 | medium | mitigate | 색만 바꾸고 `buyWatchSide` 값·전송 cfg·무장 판정은 한 줄도 건드리지 않는다. 기존 「세그먼트 클릭이 cfg 에 반영된다」 회귀 케이스가 무수정 통과하는 것이 그 증거다. 새 색이 **선택지별로** 갈리는지를 두 방향 모두 단언한다 — 한 방향만 잠그면 반대쪽이 조용히 그룹색으로 남는다 |
| T-gyz-03 | Information Disclosure | 색 단독 의미 전달 (WCAG 1.4.1) | medium | accept | 세그먼트는 색 **외에** 문구(「매도잔량」/「매수잔량」)와 `aria-pressed` 로 선택을 전달한다. 색은 보조 축이므로 새 `sr-only` 가 필요하지 않다. 접근성 이름 「감시 대상」과 버튼 문구는 그대로다 |
| T-gyz-04 | Denial of Service (가독성) | `--lw` 를 넓히지 않은 채 라벨만 13px 로 올리는 경우 | high | mitigate | 「잔량추적」·「취소잔량」 4글자가 체크박스 17px + gap 과 함께 64/88px 에 들어가지 않아 **조용히 잘린다** — 잘린 라벨은 사용자가 다른 필드를 고치게 만든다. `--lw` 76/104 를 같은 커밋에서 올리고, 그 근거를 `Card` JSDoc 에 박제하며, 두 값 모두 grep 게이트로 잠근다 |
| T-gyz-05 | Denial of Service (모바일) | 입력 글꼴이 16px 미만으로 내려가는 회귀 | high | mitigate | 데스크톱만 15px 로 올리고 모바일 16px 은 유지한다. 단위 테스트가 `text-[16px]` 존재를 단언하고, `NumInput` 주석이 iOS Safari 자동 확대의 근거를 못박는다. 「데스크톱과 통일하자」는 다음 변경이 이 값을 내리지 못하게 하는 유일한 장치다 |
| T-gyz-06 | Tampering | 8칸 값 산출 복제 | high | mitigate | 배치 분기를 **CSS 로만** 한다. `QuoteCell` 호출 8개 · `lc-quote-grid` 1개를 grep/DOM 단언으로 잠근다 — 복제하면 폭에 따라 다른 숫자가 보이고, 그 숫자로 매매 판단이 이뤄진다 |
| T-gyz-07 | Repudiation | 이미 거짓인 e2e 단언(`상한가` 칩 텍스트) | medium | mitigate | 삭제하지 않고 **살아 있는 표면(헤더 8칸)으로 옮겨 다시 쓴다**. 「폼과 화면이 같은 상한가를 말한다」는 의도가 검증 없이 사라지면, 다음에 시딩이 깨져도 아무도 모른다 |
| T-gyz-SC | Tampering | npm/pip/cargo installs | n/a | accept | **패키지 설치가 없다.** 기존 의존성만 쓰는 컴포넌트 수정이라 공급망 표면이 열리지 않는다 |
</threat_model>

<verification>
두 태스크 종료 후 한 번 더 전량 게이트:

1. `pnpm -C webapp typecheck` → exit 0 (`tsc --noEmit` + `tsc -p tsconfig.e2e.json`)
2. `pnpm -C webapp test` → exit 0 · **63 files** · passed **≥ 763** · skipped 1
   (기준선 실측: `63 passed (63)` / `763 passed | 1 skipped (764)` — **감소 0**)
3. `pnpm -C webapp lint` → `Warning:` **정확히 3** · `Error:` **0**
   (기준선 3건 그대로: `ScannerEmpty` · `_msg` · `use-relay-socket` exhaustive-deps)
4. `pnpm -C webapp build` → exit 0
5. `git log --oneline -2` → 한글 커밋 2개, 태스크당 1개
6. **Playwright 는 돌리지 않는다.** `trading-limit-chaser.spec.ts` 는 `tsconfig.e2e.json`
   통과로만 확인하고, 그 사실을 SUMMARY 에 **정직하게** 적는다 — 「고쳤다」이지 「통과를
   봤다」가 아니다.

★ 다음은 **하지 않는다**: 배포 · `gcloud` 호출 · relay/server 수정 · 실계좌 접속(D-27) ·
포매터 전체 실행 · 모바일(<1280) 헤더 8칸 배치 변경 · 데스크톱 사다리/잔고/미체결 표 수정 ·
`buyWatchSide` 판정·전송 cfg 수정 · worktree 격리(main tree `master` 에서 순차 실행).
</verification>

<success_criteria>
- 가격 칩 행이 마크업에서 사라졌고, 그 행 전용이던 파생값·조각·import 도 함께 사라졌으며,
  실제로 다른 소비처가 있는 것(`basePrice` · `lowerLimit` · `deriveTickSize` **정의**)은
  남아 있다 — lint warning 기준선 3건이 그 증거다
- 감시 대상 세그먼트가 선택지의 방향색을 따르고(매도잔량=파랑 · 매수잔량=빨강), 그 근거와
  「파일 상단 ②-1 은 게이트·탭 규율이지 이 세그먼트가 아니다」가 주석에 함께 박혔다
- 폼 치수 11종이 목업 `.form.big`/`.mform.big` 과 일치하고, **모바일 입력 16px 이 유지**되며
  그 이유가 주석에 못박혔다
- `--lw` 가 76/104 이고 그 근거(13px 라벨 4글자 + 체크박스 17px + gap)가 `Card` JSDoc 에
  사실로 기록됐다 — 옛 64/88 을 정당화하던 문단은 남아 있지 않다
- 데스크톱 8칸이 한 줄 가로 나열이고 모바일 2열 4행이 불변이며, **같은 8칸이 클래스만 갈아입는다**
  (`QuoteCell` 호출 8개 · `lc-quote-grid` 1개 · JS 폭 분기 0개)
- 8칸의 값·색·포맷 케이스 4건이 **무수정 통과**한다 — 값 산출이 안 바뀌었다는 증거다
- 깨진 테스트를 **새 계약으로 다시 썼다** — 단언을 지워서 통과시킨 곳이 0건이다
- 이미 거짓이던 e2e 칩 단언이 헤더 8칸 기준으로 다시 쓰였다
- 동작이 바뀐 파일의 JSDoc 이 전부 사실과 일치한다(`limit-chaser-client` ① · `QuoteCell` /
  `limit-chaser-form` ②-1 · `Card` · `NumInput` · 세그먼트 블록)
- 커밋 2개, 전부 한글 메시지, `Co-Authored-By` 없음, main tree(`master`) 순차 실행
</success_criteria>

<output>
Create `.planning/quick/260912-gyz-chaser-polish-remove-price-chips-directi/260912-gyz-SUMMARY.md` when done.

SUMMARY 에 **반드시** 남길 미검증 항목:
1. 390px 에서 `10,000,000` + 단위가 안 잘리는가 (jsdom 에 레이아웃이 없다 — 목업 확인분만 있다)
2. 1152px 에서 8칸이 한 줄에 들어가는가 (같은 이유)
3. 실기기 iOS Safari 에서 16px 입력이 확대를 일으키지 않는가
4. e2e 스펙은 **고쳤을 뿐 통과를 본 것이 아니다** (Playwright 미실행)
</output>
