/**
 * KST(Asia/Seoul) 시각 포맷터 (Phase 5 SCAN-06).
 * 단일 `Intl.DateTimeFormat` 인스턴스를 모듈 로드 시 1회 생성하여 재사용.
 */

const KST_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * epoch ms → `HH:MM:SS KST`.
 * ko-KR + hour12:false 로케일 조합은 브라우저/Node 에 따라 '24:00:00' 으로 렌더될 수 있어
 * 직접 파츠 조립 후 suffix 부착 — 2자리 zero-pad 보장.
 */
export function formatKstTime(epochMs: number): string {
  const parts = KST_FORMATTER.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPart['type']): string => {
    const p = parts.find((x) => x.type === type)?.value ?? '00';
    // ko-KR 가 '24' 를 반환하는 경우를 자정 '00' 으로 정규화
    if (type === 'hour' && p === '24') return '00';
    return p.padStart(2, '0');
  };
  return `${get('hour')}:${get('minute')}:${get('second')} KST`;
}
