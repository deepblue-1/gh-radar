/**
 * quick 261104-n9h (결정 1) 틱뷰어 오늘 목록 「당일손익」 추정 — 순서를 모르는 하루 합계만으로 내는 근사(화면 「≈」).
 *
 * 입력 = 매집감지 kind 16 isin 별 최신 행의 당일 축(인박스 261025-accum-day-axis ③ · tick_today_for_user 가 실어 준다):
 *   day_buy_krw(snap_qty[2]) · day_sell_krw(snap_cum[2]) · day_avg_px(accept_latency_us) · 당일 순수량(message `day=` 첫 조각)
 *   + 현재가(last_px · kind 16 price).
 *
 * 근거: 격자 손익(team-pnl.ts 평균단가법)은 체결 시각순으로 잔량 · 평단을 갱신하고, 잔량을 넘는 매도는 원가 미상으로 손익에서
 * 뺀다. 여기는 하루 합계만 알아 순서를 무시한다 —
 *   - 순수량 ≥ 0: 매도 − 매수 + 순수량 × 현재가(= 평균단가법 실현 + 미실현 · 매도가 늘 매수 뒤라면 정확히 같다).
 *   - 순수량 < 0(이월분까지 매도): 오늘 산 몫(매수 ÷ 평단)만 매도 평균가로 실현한 것으로 본다 — 나머지 매도는 원가 미상(손익 0).
 * 그래서 이월분 매도 뒤 재매수처럼 순서가 섞인 날 · 시간대별 매도 단가가 크게 다른 날은 어긋난다. 또 kind 16 당일 값은
 * KRX+NXT 합산 · 우리 체결 제외(06:00 · 새 사이클 때 0 부터)라 과거 목록(그 거래소 팀만 · 우리 체결 포함)과 정의가 다르다 —
 * 화면은 「≈」 를 붙이고 툴팁에 「장 마감 뒤 격자 값과 다를 수 있음」 을 밝힌다.
 *
 * 반올림은 Math.round — 추정치라 team-pnl.ts 의 은행가 반올림(파이썬 골든 비트 일치)이 필요 없다.
 */

/** 추정 입력 — 원 · 주 · 원/주. 키 없는 옛 RPC 면 undefined. */
export interface TeamDayEstimateInput {
  /** 당일 팀 매수 금액(원). */
  buyKrw: number | null | undefined;
  /** 당일 팀 매도 금액(원). */
  sellKrw: number | null | undefined;
  /** 당일 팀 매수 평단(원/주 · 0 = 당일 매수 없음). */
  avgPx: number | null | undefined;
  /** 당일 팀 순수량(주 · 음수 = 이월분까지 매도). */
  netQty: number | null | undefined;
  /** 지금 체결가(원/주). 순수량 > 0 일 때만 필요. */
  lastPx: number | null | undefined;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** 당일 팀 손익 추정(원 · 정수). 모르면 null — 매수 · 매도 둘 다 0 · 순수량 모름 · 보유분이 있는데 현재가 모름. */
export function estimateTeamDayPnl(i: TeamDayEstimateInput): number | null {
  const { buyKrw, sellKrw, netQty, lastPx } = i;
  if (!finite(buyKrw) || !finite(sellKrw)) return null;
  if (buyKrw === 0 && sellKrw === 0) return null;
  if (!finite(netQty)) return null;
  const avgPx = finite(i.avgPx) ? i.avgPx : 0;
  const buyQty = avgPx > 0 ? Math.round(buyKrw / avgPx) : 0;

  if (netQty >= 0) {
    if (netQty === 0) return Math.round(sellKrw - buyKrw);
    if (!finite(lastPx) || lastPx <= 0) return null;
    return Math.round(sellKrw - buyKrw + netQty * lastPx);
  }
  if (buyQty === 0) return 0;
  const sellQty = buyQty - netQty;
  return Math.round((buyQty * sellKrw) / sellQty) - Math.round(buyKrw);
}
