const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstDate(now: Date = new Date()): Date {
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + KST_OFFSET_MS);
}

export function isKoreanMarketOpen(now: Date = new Date()): boolean {
  const kst = getKstDate(now);
  const day = kst.getDay();
  if (day === 0 || day === 6) return false;

  const hours = kst.getHours();
  const minutes = kst.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // 장 시간: 09:00 ~ 15:30 KST
  return timeInMinutes >= 540 && timeInMinutes <= 930;
}
