// packages/shared/src/kiwoom.ts
//
// 키움 REST API 응답 raw 타입 + intraday-sync cycle update 타입.
// Phase 09.1 (DATA-02) — Wave 0 Plan 02.
//
// RESEARCH §2.1 기준. mac 단위 가설 = 억원 (Plan 04 fixture 캡처로 확정 — R2).

// ─────────────────────────────────────────────────────────────
// STEP 1 — ka10027 (등락률 순위) raw row
//
// 응답 패턴 (사용자 실측 2026-05-13):
//   - cur_prc: signed string "+6760" / "-274250" — 첫 글자가 부호 (절댓값 사용)
//   - pred_pre, flu_rt: signed string (부호 유지하여 DB 저장)
//   - stk_cd: 6자 단축코드 + "_AL" suffix (예: "007460_AL") — mapper 에서 strip
//   - now_trde_qty: 누적 거래량 가설 (R1, Plan 04 fixture 로 확정)
// ─────────────────────────────────────────────────────────────
export type KiwoomKa10027Row = {
  stk_cd: string;           // "007460_AL" — strip 후 6자
  stk_nm?: string;          // 종목명 (참고용 — stocks 마스터에 존재)
  cur_prc: string;          // "+6760" / "-274250" — signed (절댓값 사용)
  pred_pre?: string;        // "+100" / "-100" — signed (change_amount, 부호 유지)
  flu_rt?: string;          // "+1.50" / "-1.50" — signed (change_rate, 부호 유지)
  now_trde_qty?: string;    // "1234567" — 누적 거래량 가설 (R1)
  pred_pre_sig?: string;    // 전일대비 sign code
  sel_req?: string;
  buy_req?: string;
  cntr_str?: string;
  cnt?: string;
};

// ─────────────────────────────────────────────────────────────
// STEP 2 — ka10001 (주식기본정보) raw row
//
// 키움 ka10001 응답은 45 필드 (KiwoomRestApi.Net wrapper 참조).
// 본 phase 가 사용하는 7개 필드만 명시 (나머지 38개는 [key:string] 인덱서 미사용 — 명시적 타입 우선).
//
// mac 단위 가설: 억원 (Plan 04 fixture 캡처로 확정 — R2).
//   잘못된 단위 시 mapper 의 parseMac 곱셈 상수 1줄 변경으로 해결.
// ─────────────────────────────────────────────────────────────
export type KiwoomKa10001Row = {
  stk_cd: string;           // 6자 단축코드 (suffix 없음, STEP1 strip 결과)
  stk_nm?: string;          // 참고용
  cur_prc: string;          // signed (검증 가드 용 — STEP1 cur_prc 와 일치해야)
  pred_pre?: string;        // signed (server inquirePrice 폴백 용)
  flu_rt?: string;          // signed (server inquirePrice 폴백 용)
  open_pric: string;        // signed (절댓값) — 오늘자 시가
  high_pric: string;        // signed (절댓값) — 오늘자 고가
  low_pric: string;         // signed (절댓값) — 오늘자 저가
  upl_pric?: string;        // 상한가 (보통 무부호)
  lst_pric?: string;        // 하한가
  mac?: string;             // 시가총액 — 가설 단위 = 억원 (R2, Plan 04 확정)
  // 나머지 38개 필드 (per_rt, eps, bps, trde_qty 등): 본 phase 미사용
  // R3 (Plan 04 fixture 캡처): 누적 거래량/거래대금 동등 필드 존재 시 본 타입 확장
};

// ─────────────────────────────────────────────────────────────
// STEP 1 출력 — pipeline mapper 가 ka10027 row 를 변환한 결과.
// intraday_upsert_close RPC + stock_quotes 양쪽에 입력으로 전달.
//
// D-23: tradeAmount = volume × price 근사값 (트레이딩 시그널 용도).
// ─────────────────────────────────────────────────────────────
export type IntradayCloseUpdate = {
  code: string;                       // 6자 (stk_cd 의 _AL strip 결과)
  date: string;                       // ISO YYYY-MM-DD (KST today)
  name?: string;                      // stock_quotes UPSERT 시 사용 (D-20)
  market?: "KOSPI" | "KOSDAQ";        // stocks 마스터에서 join
  price: number;                      // close = cur_prc absolute value
  changeAmount: number | null;
  changeRate: number | null;
  volume: number;                     // now_trde_qty
  tradeAmount: number;                // volume × price 근사값 (D-23)
};

// ─────────────────────────────────────────────────────────────
// STEP 2 출력 — pipeline mapper 가 ka10001 row 를 변환한 결과.
// intraday_upsert_ohlc RPC + stock_quotes (hot set 만) 양쪽 입력.
//
// D-14: hot set 외 ~1,700 종목은 STEP1 의 임시값 (open=high=low=close) 유지.
//       EOD 17:30 candle-sync 가 모든 OHLCV 컬럼 공식값 overlay.
// ─────────────────────────────────────────────────────────────
export type IntradayOhlcUpdate = {
  code: string;                       // 6자
  date: string;                       // ISO YYYY-MM-DD (KST today)
  open: number;                       // open_pric absolute
  high: number;                       // high_pric absolute
  low: number;                        // low_pric absolute
  upperLimit: number | null;          // upl_pric (가능하면 절댓값)
  lowerLimit: number | null;          // lst_pric
  marketCap: number | null;           // mac × 10^8 (단위 가설 — R2 확정 후 조정)
};
