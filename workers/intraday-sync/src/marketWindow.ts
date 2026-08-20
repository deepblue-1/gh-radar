// workers/intraday-sync/src/marketWindow.ts
//
// KST 시장 창 판정 순수 함수 (D-fh2-01 / D-fh2-02, 2026-08-20).
//
// 배경: intraday-sync 는 Scheduler cron `* 8-15 * * 1-5` (KST) 로 08:00~15:59 매분 돈다.
//   그런데 키움 ka10027 은 stex_tp="3"(통합) 이라 KRX 정규장 밖에서는 NXT 프리마켓
//   (08:00~08:50) / NXT 애프터마켓(15:30~20:00) 체결가를 cur_prc 로 돌려준다.
//   이 값을 그대로 stock_daily_ohlcv 종가로 upsert 해 온 결과, 2026-05-21~08-19 구간
//   62 거래일 중 36 일의 종가가 KRX 공식 종가와 불일치했다 (000660 8/19: close 1,606,000
//   > high 1,559,000 자기모순).
//
// 해법은 두 축:
//   (1) isDailyWriteWindow — 정규장 밖 사이클은 일봉(stock_daily_ohlcv) 쓰기를 하지 않는다.
//       stock_quotes(표시용 현재가)는 계속 갱신하므로 NXT 실시간 시세 표시는 유지된다.
//   (2) isEodClosePass — 15:35~15:55 사이클이 KRX 전용(stex_tp="1") 종가로 당일 일봉을 확정한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KRX 정규장 시작 09:00 = 540 분. */
const REGULAR_OPEN_MIN = 9 * 60;
/**
 * KRX 정규장 종료 15:30 = 930 분. **양끝 포함**.
 *   15:20~15:30 종가 단일가(동시호가)가 공식 종가를 확정하는 구간이므로 15:30 사이클까지는
 *   정규장 데이터다. 15:31 부터는 NXT 애프터마켓이 이미 개시(15:30~)돼 오염이 시작된다.
 */
const REGULAR_CLOSE_MIN = 15 * 60 + 30;

/**
 * EOD 공식 종가 패스 슬롯 (KST 15시대의 분).
 *
 * 하한 15:35 — 15:30 동시호가 체결/정산이 반영될 여유를 둔다.
 * 상한 15:55 — **16:00 부터 시간외 단일가(±10%) 가 개시**되어 cur_prc 가 다시 오염된다.
 *   15:40~16:00 시간외 종가매매는 종가 그대로 체결되므로 무해하지만, 16:00 이후는 안 된다.
 *
 * 5분 간격 5회를 쓰는 이유:
 *   - 단일 사이클이 키움 429/타임아웃으로 실패해도 남은 슬롯이 재시도한다(idempotent upsert).
 *   - 매분 21회 호출하면 키움 rate bucket 만 축내고 얻는 게 없다 — 5회면 충분.
 */
const EOD_PASS_MINUTES = new Set([35, 40, 45, 50, 55]);

/**
 * Date → KST 기준 0..1439 분.
 * index.ts 의 기존 KST 변환 관례(+9h 후 getUTC*)를 그대로 사용한다 (KST 는 DST 없음).
 */
export function kstMinutesOfDay(now: Date): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/**
 * stock_daily_ohlcv 쓰기가 허용되는 창인가 — KRX 정규장 09:00~15:30 (양끝 포함).
 * false 인 사이클은 일봉을 건드리지 않고 stock_quotes 만 갱신한다 (D-fh2-01).
 */
export function isDailyWriteWindow(now: Date): boolean {
  const m = kstMinutesOfDay(now);
  return m >= REGULAR_OPEN_MIN && m <= REGULAR_CLOSE_MIN;
}

/**
 * KRX 공식 종가 확정 패스를 돌릴 사이클인가 — 15:35/15:40/15:45/15:50/15:55 (D-fh2-02).
 */
export function isEodClosePass(now: Date): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.getUTCHours() === 15 && EOD_PASS_MINUTES.has(kst.getUTCMinutes());
}
