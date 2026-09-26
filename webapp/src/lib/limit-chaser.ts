/**
 * Phase 16 Plan 12 — 상따(LimitChaser) 폼 순수 함수 (TRADE-01).
 *
 * ① 결정 근거
 *   - **더티 판정의 유일 지점**이다(D-06). 「값 변경은 즉시 전송하지 않고 「수정」 버튼으로만
 *     반영된다」는 이 phase 의 핵심 규율이고, 그 판정이 두 곳에 있으면 한쪽만 고쳐진 채로
 *     액션 바가 뜨거나 안 뜬다. `dirtyFieldsOf` 가 유일한 비교기다.
 *   - **삭제 판정의 유일 지점**이다(D-08). 매수·매도·취소 게이트가 전부 꺼지면 `crud "D"` 다.
 *     별도 「삭제」 버튼이 없으므로 이 판정이 곧 삭제 경로다.
 *   - 수량 산출식은 gh-trade 정본과 **동형**이다
 *     `[VERIFIED: LimitChaserForm.cs:2809 BuyOrderQtyFromAmount]`.
 *     기본값·상한가 시딩도 같은 파일의 상수(:129~178) / `SeedFromUpperLimitOnce()`(:711) 를 옮겼다.
 *
 * ② 함정
 *   - ★ **역산 금지.** `수량 × 가격 ÷ 10000` 으로 금액을 되돌리지 않는다. 나머지가 잘리면서
 *     왕복이 깨진다 — gh-trade 에 **무장 수량 2주가 598주로 튄 실측 사고**가 있다(약 300배).
 *     금액 → 수량 한 방향만 존재하고, 그 방향이 이 파일에 딱 한 번 나온다.
 *   - ★ **`buyOrderAmount === 0` 은 「서버가 모른다」**는 뜻이다(Pitfall 11 — 구 클라가 보냈거나
 *     한 번도 실린 적이 없다). 금액 칸을 덮지 않고, 더티 비교에서도 뺀다. 덮으면 사용자가
 *     방금 입력한 금액이 사라지고, 비교에 넣으면 액션 바가 영원히 떠 있는다.
 *   - ★ **삭제 판정에 취소 게이트를 포함**한다(Pitfall 7). 매수·매도만 보면 「자동취소만 켠
 *     전략」을 삭제로 오판한다 — 서버는 취소 게이트가 하나라도 켜져 있으면 전략을 남긴다.
 *   - ★ **S→C 전용 4필드**(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *     `cancelQtyTrackBaseline`)는 서버가 계산해 에코로만 내려준다(Pitfall 6). 더티 비교에
 *     넣으면 서버 계산값이 「사용자 미반영 변경」으로 둔갑한다. 입력 타입에도 없다.
 *   - ★ **스위치 3종은 더티가 아니다.** 즉시 전송(D-05)이라 송신~에코 사이 한 프레임 동안
 *     서버값과 달라지는데, 그걸 더티로 세면 스위치를 켤 때마다 액션 바가 깜빡인다.
 *   - ★ 에코의 `buyEnabled`/`sellEnabled` 는 설정값이 아니라 **무장 상태**다(Pitfall 10).
 *     「내가 켰는데 서버가 껐다」가 아니라 「발주가 나갔다」는 뜻이다 — 배지 문구가 이 둘을
 *     구분하는 것은 `strategy-badge.tsx`(16-11) 소관이고, 여기서는 비교 대상에서 뺄 뿐이다.
 *
 * ③ 하지 않는 것
 *   - **서버로 보낼 페이로드를 여기서 조립하지 않는다.** 전송은 폼이 컨텍스트 `send` 로 한다
 *     (`limit-chaser-form.tsx`). 조립기가 lib 에 있으면 「보냈다」는 착각이 순수 함수 층까지
 *     내려와 테스트가 전송 경로를 검증한다고 오해하게 된다.
 *   - **S→C 전용 4필드를 입력 타입에 넣지 않는다.** 넣는 순간 어딘가에서 되보내진다.
 *   - **`crud` 를 「삭제됨」 표시의 근거로 쓰지 않는다.** `crudOf(form)` 는 **전송용 힌트**일
 *     뿐이다. 화면의 「삭제됨」 판정은 반드시 **서버 에코의 `crud`** 를 봐야 한다 —
 *     서버가 정규화한 결과가 정본이고, 클라 판정과 갈릴 수 있다(Pitfall 7).
 */

import type { RelayExchange, RelayLcCrud, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

/**
 * 폼이 실제로 편집하는 값 24종.
 *
 * `RelayLimitChaserInput`(32) 에서 뺀 것:
 *   - 정체성 3 (`isin`·`accountNo`·`exchange`) — 상단 종목·거래소·계좌 카드(A1) 소관.
 *     `market` 은 애초에 `RelayLimitChaserInput` 에 없다 — relay 가 ISIN 으로 푼다(WR-03/D-28)
 *   - 파생 2 (`crud` = `crudOf`, `buyOrderQty` = `buyOrderQtyFromAmount`)
 *   - 클라 고정 3 (`sweepRecalcEnabled: true` · `sweepMinCount: 0` · `sweepMinRate: 0`)
 *
 * ★ 고정 3 을 폼에 노출하지 않는 이유: relay 빌더가 `true`/`0`/`0` 으로 **덮어쓴다**(16-04).
 *   입력으로 열어두면 「설정했는데 반영 안 됨」이 된다.
 */
export type LimitChaserFormValues = Omit<
  RelayLimitChaserInput,
  | 'isin'
  | 'accountNo'
  | 'exchange'
  | 'crud'
  | 'buyOrderQty'
  | 'sweepRecalcEnabled'
  | 'sweepMinCount'
  | 'sweepMinRate'
>;

/** 상한가 시딩이 채우는 가격 5칸. */
export type LimitChaserSeedPrices = Pick<
  LimitChaserFormValues,
  'buyWatchPrice' | 'buyOrderPrice' | 'sellWatchPrice' | 'sellOrderPrice' | 'sweepWatchPrice'
>;

/** 삭제 판정에 필요한 게이트 4종 — 서버 정규화(`crud "D"`)와 같은 집합이다. */
export type LimitChaserGates = Pick<
  LimitChaserFormValues,
  'buyEnabled' | 'sellEnabled' | 'cancelQtyEnabled' | 'cancelTradeEnabled'
>;

/**
 * 매수수량 산출 — **유일 지점**.
 *
 * `floor(금액(만원) × 10000 / 매수가격)`. 가격이 0 이하면 0 이다(나눗셈을 하지 않는다).
 * gh-trade 는 long 으로 계산한 뒤 좁혀 uint 래핑을 막는데, JS `number` 는 2^53 까지 정확한
 * 정수를 담으므로 같은 결과를 낸다 — 100억주(1e10)도 래핑 없이 그대로 나온다.
 *
 * ★ 역산(`수량 × 가격 ÷ 10000`) 을 만들지 않는다. 파일 상단 ② 참조.
 */
export function buyOrderQtyFromAmount(amountManwon: number, price: number): number {
  if (!(price > 0)) return 0;
  return Math.floor((amountManwon * 10_000) / price);
}

/**
 * 「켜진 전략」 — 작업대가 기본으로 카드를 만들고 사이드바가 싣는 기준(2026-09-23 사용자 결정).
 * 매수주문 스위치 · 매도주문 스위치 · 매수취소의 취소잔량 체크 중 하나라도 켜져 있어야 한다.
 * 매수 그룹의 잔량/체결 조건 · 한방체결 · 취소의 체결/잔량추적 체크만 켜진 것은 **켜진 것이 아니다**
 * (취소는 취소잔량이 꺼져 있으면 무장하지 않는다 — 아래 게이트 규칙과 같은 뜻).
 * 에코의 `buyEnabled`/`sellEnabled` 는 무장 상태라 발주가 나가면 false 로 온다.
 */
export function isActiveStrategy(c: {
  buyEnabled: boolean;
  sellEnabled: boolean;
  cancelQtyEnabled: boolean;
}): boolean {
  return c.buyEnabled || c.sellEnabled || c.cancelQtyEnabled;
}

/**
 * 전략 키 조립 — **유일 지점**. 서버 `LimitChaser::MakeKey` 와 동형.
 *
 * `isin`·`accountNo` 를 12자로 절단하는 것이 계약이다 — 서버가 `strncpy(..., 12)` 로 자르므로
 * 자르지 않으면 같은 전략을 다른 키로 보게 되고, 사이드바 목록과 상세가 서로를 못 찾는다.
 */
export function strategyKey(isin: string, accountNo: string, exchange: RelayExchange): string {
  return `${isin.slice(0, 12)}:${accountNo.slice(0, 12)}:${exchange}`;
}

/**
 * 거래소 꼬리를 붙인 표시 이름 (18-REVIEW-R2 GC-IN-04 · D-03) — NXT 면 「{name} · NXT」, KRX 면 `name`
 * 그대로다. KRX 는 기본 거래소라 꼬리를 붙이지 않는다 — 같은 종목 KRX·NXT 두 전략을 가르는 최소
 * 표기다. 카드 헤더 `title` 의 「· {거래소}」 표기와 같은 구분자다. 합친 전략 로그 `who` 와 사이드바
 * 전략 이름이 함께 쓴다.
 */
export function exchangeLabeledName(name: string, exchange: RelayExchange): string {
  return exchange === "NXT" ? `${name} · NXT` : name;
}

/**
 * 전략 키 `{ISIN}:{accountNo}:{exchange}` 분해.
 *
 * 모양이 어긋나면 **null 이다** — 반쪽만 채우면 화면이 「다른 계좌의 전략」을 편집하게 된다.
 * 거래소는 화이트리스트 2종뿐이라 그 밖의 값은 키가 깨진 것으로 본다.
 */
export function parseStrategyKey(
  key: string,
): { isin: string; accountNo: string; exchange: RelayExchange } | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;
  const [isin, accountNo, exchange] = parts;
  if (isin === "" || accountNo === "") return null;
  if (exchange !== "KRX" && exchange !== "NXT") return null;
  return { isin, accountNo, exchange };
}

/**
 * 더티 비교 대상 21종 — **공개 상수**다. 테스트가 「무엇이 비교되지 않는지」를 직접 단언한다.
 *
 * 폼 24종에서 뺀 것 = 스위치 3종(`buyEnabled`·`sellEnabled`·`sweepEnabled`). 즉시 전송이라
 * 더티가 아니다(파일 상단 ②). S→C 전용 4필드는 애초에 `LimitChaserFormValues` 에 없다 —
 * 타입이 먼저 막고, 이 배열이 한 번 더 막는다.
 */
export const DIRTY_COMPARED_FIELDS = [
  'buyOrderPrice',
  'buyWatchPrice',
  'buyWatchQty',
  'buyMinTradeQty',
  'buyWatchSide',
  'buyTradeQtyEnabled',
  'buyOrderAmount',
  'sellOrderPrice',
  'sellWatchPrice',
  'sellWatchQty',
  'sellMinTradeQty',
  'sellTradeQtyEnabled',
  'sellOrderRatio',
  'sellQtyTrackEnabled',
  'sellQtyTrackRatio',
  'sweepWatchPrice',
  'sweepMinTickCount',
  'cancelQtyEnabled',
  'cancelWatchQty',
  'cancelTradeEnabled',
  'cancelQtyTrackEnabled',
] as const satisfies readonly (keyof LimitChaserFormValues)[];

/** 더티 필드 이름 — 액션 바 개수 문구와 필드 강조가 같은 집합을 본다. */
export type LimitChaserDirtyField = (typeof DIRTY_COMPARED_FIELDS)[number];

/**
 * 더티 판정 — **유일 지점**(D-06).
 *
 * `server` 가 없으면(신규 폼) 비교 기준선이 없으므로 더티도 없다. 「아직 등록 안 된 전략」에
 * 「미반영 변경 24개」를 띄우면 액션 바가 신규 폼에서 항상 떠 있게 된다.
 *
 * `buyOrderAmount` 는 서버값이 `0`(=「모른다」) 일 때만 비교에서 빠진다 — 서버가 값을 알면
 * 정상적으로 비교한다.
 */
export function dirtyFieldsOf(
  server: RelayLimitChaser | null | undefined,
  form: LimitChaserFormValues,
): LimitChaserDirtyField[] {
  if (server == null) return [];
  const dirty: LimitChaserDirtyField[] = [];
  for (const field of DIRTY_COMPARED_FIELDS) {
    // 「서버가 모른다」 — 사용자 입력을 덮지도, 미반영으로 세지도 않는다 (Pitfall 11).
    if (field === 'buyOrderAmount' && server.buyOrderAmount === 0) continue;
    if (server[field] !== form[field]) dirty.push(field);
  }
  return dirty;
}

/**
 * 삭제 의도 판정 (D-08 / Pitfall 7).
 *
 * 매수·매도·**취소 2종**이 전부 꺼지면 서버가 `crud` 를 `"D"` 로 정규화한다. 취소 게이트가
 * 하나라도 켜져 있으면 매수·매도를 둘 다 꺼도 전략이 **남는다**.
 */
export function isDeleteIntent(gates: LimitChaserGates): boolean {
  return (
    !gates.buyEnabled &&
    !gates.sellEnabled &&
    !gates.cancelQtyEnabled &&
    !gates.cancelTradeEnabled
  );
}

/**
 * 전송할 `crud` — **전송용 힌트일 뿐이다.**
 *
 * ★ UI 의 「삭제됨」 표시는 이 값이 아니라 **서버 에코의 `crud`** 를 봐야 한다. 서버 정규화
 *   결과가 정본이고, 클라 판정이 앞서갈 수 있다(Pitfall 7).
 */
export function crudOf(gates: LimitChaserGates): RelayLcCrud {
  return isDeleteIntent(gates) ? 'D' : 'C';
}

/**
 * 상한가 5칸 시딩 `[VERIFIED: SeedFromUpperLimitOnce(), LimitChaserForm.cs:711]`.
 *
 * 종목 선택 시 1회만 적용한다. 서버 에코가 있으면 **서버값이 이긴다**(D-11) — 시딩을 매
 * 렌더 걸면 에코가 덮은 값을 다시 상한가로 되돌린다.
 */
export function seedFromUpperLimit(upperLimit: number): LimitChaserSeedPrices {
  return {
    buyWatchPrice: upperLimit,
    buyOrderPrice: upperLimit,
    sellWatchPrice: upperLimit,
    sellOrderPrice: upperLimit,
    sweepWatchPrice: upperLimit,
  };
}

/**
 * 신규 폼 기본값 `[VERIFIED: LimitChaserForm.cs:129~178]`.
 *
 * ★ 매 호출 **새 객체**를 돌려준다. 모듈 상수를 공유하면 한 폼의 편집이 다음 신규 폼으로 샌다.
 */
export function defaultLimitChaserForm(): LimitChaserFormValues {
  return {
    // 매수주문
    buyWatchPrice: 0,
    buyWatchQty: 10_000, // DEFAULT_BUY_WATCH_QTY
    buyWatchSide: '0', // Ask — 매도호가 감시
    buyMinTradeQty: 30_000, // DEFAULT_BUY_MIN_TRADE_QTY
    buyTradeQtyEnabled: false,
    buyEnabled: false,
    // 매수가격
    buyOrderPrice: 0,
    buyOrderAmount: 10, // DEFAULT_BUY_ORDER_AMOUNT (만원) — Designer 기본 20,000 과 다르다
    // 한방체결
    sweepWatchPrice: 0,
    sweepMinTickCount: 3, // DEFAULT_SWEEP_MIN_TICK_COUNT
    sweepEnabled: false,
    // 매도주문
    sellWatchPrice: 0,
    sellWatchQty: 10, // DEFAULT_SELL_WATCH_QTY
    sellMinTradeQty: 30_000, // DEFAULT_SELL_MIN_TRADE_QTY
    sellTradeQtyEnabled: false,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50, // DEFAULT_SELL_QTY_TRACK_RATIO
    sellEnabled: false,
    // 매도가격
    sellOrderPrice: 0,
    sellOrderRatio: 100, // DEFAULT_SELL_ORDER_RATIO
    // 매수 미체결 자동취소
    cancelQtyEnabled: false,
    cancelWatchQty: 10, // DEFAULT_CANCEL_QTY
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
  };
}

/**
 * 예상 매도수량 — **표시 전용**이다. 정본은 서버가 Set 시점에 스냅샷한 `sellOrderQty` 다.
 * `sellableQty` 는 계좌 스토어(`RelayAccountState.hold[].sellableQty`)에서 읽는다.
 */
export function estimatedSellQty(sellableQty: number, ratio: number): number {
  return Math.floor((sellableQty * ratio) / 100);
}

/**
 * 에코 → 폼 (D-11 서버값 우선).
 *
 * 더티 필드도 **덮어쓴다** — 편집 중 보호·보류가 없다. 값이 바뀌는 순간을 사용자가 놓치지
 * 않도록 배너를 띄우는 것은 상위 화면 책임이고, 여기서는 「서버가 이긴다」만 실행한다.
 *
 * 유일한 예외가 `buyOrderAmount === 0` 이다 — 「서버가 모른다」이므로 이전 값을 남긴다
 * (Pitfall 11). 수량 × 가격 역산으로 채우지도 않는다.
 */
export function formFromServer(
  server: RelayLimitChaser,
  prev: LimitChaserFormValues,
): LimitChaserFormValues {
  return {
    buyWatchPrice: server.buyWatchPrice,
    buyWatchQty: server.buyWatchQty,
    buyWatchSide: server.buyWatchSide,
    buyMinTradeQty: server.buyMinTradeQty,
    buyTradeQtyEnabled: server.buyTradeQtyEnabled,
    buyEnabled: server.buyEnabled,
    buyOrderPrice: server.buyOrderPrice,
    buyOrderAmount: server.buyOrderAmount === 0 ? prev.buyOrderAmount : server.buyOrderAmount,
    sweepWatchPrice: server.sweepWatchPrice,
    sweepMinTickCount: server.sweepMinTickCount,
    sweepEnabled: server.sweepEnabled,
    sellWatchPrice: server.sellWatchPrice,
    sellWatchQty: server.sellWatchQty,
    sellMinTradeQty: server.sellMinTradeQty,
    sellTradeQtyEnabled: server.sellTradeQtyEnabled,
    sellQtyTrackEnabled: server.sellQtyTrackEnabled,
    sellQtyTrackRatio: server.sellQtyTrackRatio,
    sellEnabled: server.sellEnabled,
    sellOrderPrice: server.sellOrderPrice,
    sellOrderRatio: server.sellOrderRatio,
    cancelQtyEnabled: server.cancelQtyEnabled,
    cancelWatchQty: server.cancelWatchQty,
    cancelTradeEnabled: server.cancelTradeEnabled,
    cancelQtyTrackEnabled: server.cancelQtyTrackEnabled,
  };
}

/**
 * `ServerMessage(54)` 가 **상따 화면의 몫인가** — 판정의 **유일 지점**이다 (Pitfall 9).
 *
 * 서버는 거부를 응답 코드로 주지 않는다. 이 통지가 유일한 거부 신호라 반드시 사용자에게
 * 보여야 하는데(PC-7 무로그 fail-safe 금지), **아무 화면이나 다 보여 주면 반대 사고**가 난다:
 * VI 자동매수가 거부된 통지를 상따 화면이 「내 전략이 거부됐다」로 그리면 사용자가 멀쩡한
 * 상따 전략을 끄고 다시 켠다 — 그 재등록이 곧 두 번째 발주다.
 *
 * 가르는 기준은 **발신 맥락 + 종목 유무** 둘뿐이다:
 *   - `src === "SetLimitChaser"`            → 상따 등록·수정 거부. 명백히 상따 몫.
 *   - `src === "LimitChaser"`               → 상따 **런타임 사유 줄**(래치 거부 등). 상따 몫.
 *   - `src === "Account"` ∧ `i` 가 **비지 않음** → 종목이 붙은 계좌 통지 = 상따 몫.
 *   - `src === "Account"` ∧ `i` 가 **빔**      → 종목 축이 없는 계좌 통지 = **VI 몫**(여기서 안 쓴다).
 *
 * ★ `"LimitChaser"` 는 17-01 이 `src` 어휘에 더했지만 **받아 주는 판정이 없어 한 글자도
 *   그려지지 않고 있었다**(17-06 이 VI 쪽에서 같은 결손을 `VITrigger` 로 닫았다). D-20 설계는
 *   그 어휘를 `lc.arm` 실패 사유의 경로로 잡았지만, **현 gh-trade 는 36/37/38 거부를 src
 *   "System"(기본 ServerMessageContext · i/a/kind 빈 값)으로 보낸다** — 그 통지는 이 함수가
 *   아니라 카드가 arm in-flight 창 안에서 `isLimitChaserArmRejection` 으로 받는다
 *   (quick-260926-nr2). 이 함수의 로직은 그대로다.
 * ★ **대응하는 `"VITrigger"` 를 여기에 더하지 않는다** — 그것이 Pitfall 9 그 자체다.
 *   `isViServerMessage` 는 이 함수를 재사용하므로 여기가 넓어지면 그쪽도 함께 흔들린다:
 *   `"LimitChaser"` 는 `src === "Account"` 갈래를 타지 않으므로 VI 판정은 무변경이다.
 *
 * 판정을 두 곳에 두지 않는다. 갈리는 순간 한 화면은 남의 거부를 그리고 다른 화면은
 * 자기 거부를 놓치는데, 둘 다 사용자가 알아챌 수 없는 방식으로 조용히 일어난다.
 */
export function isLimitChaserServerMessage(msg: {
  src: string;
  i: string;
}): boolean {
  if (msg.src === 'SetLimitChaser' || msg.src === 'LimitChaser') return true;
  return msg.src === 'Account' && msg.i !== '';
}

/**
 * 이 통지가 **바로 이 전략의 `lc.set` 에 대한 서버의 거부 답**인가
 * (debug `lc-unacked-stuck-new-route`).
 *
 * ★ 위 `isLimitChaserServerMessage` 와 **묻는 것이 다르다.** 저쪽은 「이 통지를 상따 화면이
 *   그려도 되는가」(표시 몫)이고, 이쪽은 「이 통지가 **내가 방금 보낸 요청**에 대한 답인가」
 *   (응답 유무)다. 표시 몫이 훨씬 넓으므로 — 다른 종목의 상따 거부도, 런타임 사유 줄도
 *   그린다 — 그 넓은 판정으로 「서버가 답했다」를 결론내면 남의 답으로 내 「미반영」이
 *   거둬진다. 그래서 두 함수가 따로 있다.
 *
 * 좁히는 축은 셋이고 전부 근거가 있다:
 *   - `lv === "ERROR"`      : 거부만이 답이다. INFO 통지는 요청과 무관하게 흐른다.
 *   - `src === "SetLimitChaser"` : 서버가 **등록·수정 요청의 답**에만 찍는 맥락이다
 *     (`Gateway.cpp` `ProcessSetLimitChaser` 의 모든 거부 갈래가 이 값을 쓴다).
 *     `"Account"`(계좌 가드)·`"LimitChaser"`(런타임 사유)는 **넣지 않는다** — 그 둘은 내
 *     요청과 무관하게도 오므로 답으로 읽으면 거짓 안심이 된다.
 *   - 종목 **그리고** 계좌가 둘 다 같을 것 : 전략 키의 두 축이다. 한 축만 보면 같은
 *     종목의 다른 계좌 거부가 내 답으로 둔갑한다.
 *
 * ⚠️ **본문(`m`)을 읽지 않는다.** 사유는 서버가 쓴 문장 그대로 화면에 세우는 값이지
 *    분기 근거가 아니다 — 파싱하는 순간 서버 문구를 고칠 때마다 이 판정이 조용히 깨진다.
 */
export function isLimitChaserSetRejection(
  msg: { src: string; i: string; a: string; lv: string },
  isin: string,
  accountNo: string,
): boolean {
  // 전략 키가 반쪽이면 대조할 것이 없다 — 빈 축을 「같다」로 접으면 아무 통지나 통과한다.
  if (isin === '' || accountNo === '') return false;
  if (msg.lv !== 'ERROR' || msg.src !== 'SetLimitChaser') return false;
  return msg.i === isin && msg.a === accountNo;
}

/*
 * ── 비활성화 원인 판정 (quick-260926-nr2) ─────────────────────────────────────
 *
 * 서버 계약 결합은 **이 파일 한 곳의 주석이 소유한다**(gh-trade 읽기 전용 확인 결과):
 *   - 65(`DisableStrategiesResp` · relay `strategies.disabled`)의 송신자는
 *     `server/src/net/Gateway.cpp` `ProcessDisableStrategies` 하나다 — 상태 변경 → 저장 →
 *     키별 60 에코(세션 전 연결) → 65 를 **요청 연결에 맨 마지막**에. 즉 65 = 전부 정지 완료이고
 *     15:40 과 무관하다.
 *   - 15:40 은 `app/Server.cpp` `Server::DisableKrxLimitChasers` 다 — `DisableLimitChasers('K')`
 *     (cfg 매수·매도·취소 게이트 off · 이미 전부 꺼진 전략은 건너뜀) → 전략마다 `MarkEchoDirty`
 *     (60 에코는 **다음 300ms `FlushLimitChaserEchoes` 틱**) → 저장 →
 *     `SendServerMessageToSession(INFO, source "System", kind Purge, isin/계좌 없음)` 를 **동기로
 *     즉시**. 그래서 브라우저에는 **통지가 에코보다 먼저** 온다. 65 는 없다.
 */

/**
 * 이 54 통지가 **15:40 KRX 상따 자동 해제 통지**인가.
 *
 * `src === "System" && kind === "Purge"` 동등 비교만 한다 — 본문 `m` 은 읽지 않는다(이 파일의
 * 규율: 서버 문구를 고칠 때마다 판정이 조용히 깨진다). 현재 이 조합의 유일한 송신자는
 * `Server::DisableKrxLimitChasers` 다. `PurgeAllStrategies`(06:00 · 20:00 K · 20:05)의 Purge 는
 * `BroadcastServerMessage` 라 source 가 없어(src "") 걸리지 않고, 그쪽은 삭제라 60 에코도 없다.
 */
export function isMarketCloseReleaseNotice(msg: { src: string; kind: string }): boolean {
  return msg.src === 'System' && msg.kind === 'Purge';
}

/** 취소 게이트 무장 — 에코가 `&& cancelArmed` 로 접어 보내는 두 값의 합집합. */
function cancelGateOf(item: RelayLimitChaser): boolean {
  return item.cancelQtyEnabled || item.cancelTradeEnabled;
}

/**
 * `prev → next` 에서 게이트(매수 · 매도 · 취소 무장) 중 **하나라도 켜짐 → 꺼짐**인가.
 * 15:40 해제 귀속의 조건이다 — 해제 통지 뒤 그 키의 첫 에코가 게이트를 끄지 않았다면 그 에코는
 * 해제의 결과가 아니다.
 */
export function limitChaserGateDisarmed(prev: RelayLimitChaser, next: RelayLimitChaser): boolean {
  return (
    (prev.buyEnabled && !next.buyEnabled) ||
    (prev.sellEnabled && !next.sellEnabled) ||
    (cancelGateOf(prev) && !cancelGateOf(next))
  );
}

/**
 * 15:40 해제 통지 시점에 **해제 에코가 올 전략 키** 집합.
 *
 * `exchange === "KRX"` 이고 에코상 게이트(매수 · 매도 · 취소잔량 · 취소체결) 중 하나라도 켜진
 * 전략이다. 에코 게이트 = cfg && armed 이므로 에코상 켜짐 ⇒ cfg 켜짐 ⇒ `DisableLimitChasers('K')`
 * 가 반드시 해제하고 `MarkEchoDirty` 로 에코한다. NXT 는 애프터마켓이 20:00 까지라 제외된다.
 * (에코상 꺼졌지만 cfg 가 켜진 전략 — 발주로 소진된 게이트 — 도 서버가 해제·에코하지만, 그
 * 에코는 게이트를 새로 끄지 않으므로 귀속할 전이가 없다.)
 */
export function marketCloseReleaseKeysOf(list: readonly RelayLimitChaser[]): Set<string> {
  const keys = new Set<string>();
  for (const item of list) {
    if (item.exchange !== 'KRX') continue;
    if (item.buyEnabled || item.sellEnabled || cancelGateOf(item)) keys.add(item.key);
  }
  return keys;
}

/**
 * 이 통지가 **내가 보낸 `lc.arm` 의 거부 답**인가 (quick-260926-nr2).
 *
 * ★ 이 함수는 「내 arm 의 답인가」만 묻고, 호출자가 arm 을 보내 놓은 **in-flight 창 안에서만**
 *   의미가 있다 — 게이트웨이가 arm 거부에 전략 키를 싣지 않으므로 상관은 창으로 한다.
 * ★ 실패 모드: 창 안에 무관한 같은 모양 통지가 오면 「미반영」이 일찍 거둬질 뿐이다(= 이번 변경
 *   전 동작: 추적 없음). 거짓 「미반영」은 만들지 않는다.
 *
 * 인정하는 모양 셋 (lv 는 WARN 또는 ERROR 만):
 *   (a) 게이트웨이 36/37/38 거부 — `Gateway::ProcessArm{Sell,Cancel,Buy}Latch` 는 실패면
 *       `SendServerMessageToConn(conn, "WARN", 사유)` 를 **기본 ServerMessageContext** 로 보낸다 →
 *       src "System" · i "" · a "" · kind "". (kind "Purge" 는 15:40 해제 통지라 제외된다.)
 *   (b) relay 게이트웨이 전 거부 — src "Relay"(fanout `RELAY_MSG_SOURCE`) · lv "ERROR". lc.arm
 *       갈래(`#armLatchAccount` · `#accountAllowed` · `#buildStrategyPayload` · `#onStrategySendFailed`)
 *       는 **i 를 싣지 않고** a 는 계좌 대조 거부에서만 싣는다 → i "" 이고 a 는 "" 또는 이 계좌.
 *       (i 를 싣는 relay 거부는 lc.set 경로뿐이라 여기서는 받지 않는다.)
 *   (c) src "LimitChaser" 이고 i === isin — D-20 설계 경로(서버가 나중에 맥락을 붙여도 산다).
 *
 * ⚠️ 본문 `m` 은 읽지 않는다.
 */
export function isLimitChaserArmRejection(
  msg: { src: string; i: string; a: string; lv: string; kind: string },
  isin: string,
  accountNo: string,
): boolean {
  if (isin === '' || accountNo === '') return false;
  if (msg.lv !== 'WARN' && msg.lv !== 'ERROR') return false;
  if (msg.src === 'System') return msg.i === '' && msg.a === '' && msg.kind === '';
  if (msg.src === 'Relay') return msg.i === '' && (msg.a === '' || msg.a === accountNo);
  if (msg.src === 'LimitChaser') return msg.i === isin;
  return false;
}
