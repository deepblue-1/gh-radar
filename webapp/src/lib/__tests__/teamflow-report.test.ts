import { describe, it, expect } from 'vitest';

/**
 * Phase 33 Plan 03 — 팀 매집 표시 변환 골든 (UI-SPEC 「표시 변환 규칙 (T11)」 · D-08 · D-09 · D-10 · D-11).
 *
 * 잠그는 것: 억 1자리 반올림 · 0.0억 무부호 · U+2212 · 1,000억 이상 쉼표(조 변환 없음) · 부호 색 판정 · 등락률 · KST 시각 ·
 * 결과 태그 · 정렬(team_net_val 내림차순 · null 맨 뒤 · 동률 isin) · KPI 4칸(10/14 = 34 · 9 · 9 · −26.3억) · 요약 조각.
 * 픽스처 = 10/14 실측 34행(합성 행 없음 — 경계값만 개별 행을 덮어쓴다).
 */

import {
  BAND_SLOTS,
  BUCKET_KEY_CLOSE,
  BUCKET_KEY_FIRST,
  BUCKET_KEY_LAST,
  BUCKET_SLOTS,
  bandSlotsOf,
  bucketSlotsOf,
  fmtRangePct,
  fmtEok,
  fmtQty,
  fmtRate,
  fmtShare,
  isHotShare,
  kpisOf,
  kstHm,
  rowDescriptionOf,
  sortRows,
  summaryPartsOf,
  tagOf,
  toneOf,
} from '../teamflow-report';
import { CHEONIL, DONGYANG, HANSUN, SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';
import type { TeamflowBucket, TeamflowRow } from '@gh-radar/shared';

const rowOf = (isin: string): TeamflowRow => teamflowRows().find((r) => r.isin === isin)!;

describe('kpisOf (D-11)', () => {
  it('10/14 픽스처 = 탐지 34 · 팀 순매수 9 · 상한가 도달 9 · 합 −2,629,083,913 원', () => {
    expect(kpisOf(teamflowRows())).toEqual({ detected: 34, netPositive: 9, limit: 9, netSum: -2629083913 });
  });

  it('team_net_val null 행은 합 · 「팀 순매수 종목」 에서 빠지고 탐지 수에는 남는다', () => {
    const rows = teamflowRows().slice(0, 3).map((r, i) => ({
      ...r,
      team_net_val: i === 0 ? null : i === 1 ? 300_000_000 : -100_000_000,
      status: 'below',
    }));
    expect(kpisOf(rows)).toEqual({ detected: 3, netPositive: 1, limit: 0, netSum: 200_000_000 });
  });

  it('전부 null 이면 합 0 · 행 0 이면 전부 0', () => {
    const rows = teamflowRows().slice(0, 2).map((r) => ({ ...r, team_net_val: null, status: 'limit' }));
    expect(kpisOf(rows)).toEqual({ detected: 2, netPositive: 0, limit: 2, netSum: 0 });
    expect(kpisOf([])).toEqual({ detected: 0, netPositive: 0, limit: 0, netSum: 0 });
  });
});

describe('fmtEok (D-10)', () => {
  it('부호 + 억 1자리 반올림 · U+2212 · 1,000억 이상 쉼표 · 조 변환 없음', () => {
    expect(fmtEok(-2629083913, { signed: true })).toBe('−26.3억');
    expect(fmtEok(586497190, { signed: true })).toBe('+5.9억');
    expect(fmtEok(700_000_000, { signed: true })).toBe('+7.0억');
    expect(fmtEok(-310_000_000)).toBe('−3.1억');
    expect(fmtEok(123_450_000_000, { signed: true })).toBe('+1,234.5억');
  });

  it('signed 가 아니면 양수에 「+」 없음', () => {
    expect(fmtEok(20_000_000)).toBe('0.2억');
  });

  it('반올림 0 은 부호 없는 「0.0억」 · null 은 「—」', () => {
    expect(fmtEok(0, { signed: true })).toBe('0.0억');
    expect(fmtEok(-0)).toBe('0.0억');
    expect(fmtEok(4_999_999, { signed: true })).toBe('0.0억');
    expect(fmtEok(-4_999_999, { signed: true })).toBe('0.0억');
    expect(fmtEok(null)).toBe('—');
    expect(fmtEok(Number.NaN)).toBe('—');
  });

  it('0.05억 경계는 0 에서 먼 쪽 — 같은 크기의 ± 값이 대칭(WR-02 · 등락률과 같은 규칙)', () => {
    expect(fmtEok(5_000_000, { signed: true })).toBe('+0.1억');
    expect(fmtEok(-5_000_000, { signed: true })).toBe('−0.1억');
    // 부동소수 경계 — 15,000,000 / 1e7 = 1.5 정확값 · 양쪽 모두 0.2억
    expect(fmtEok(15_000_000, { signed: true })).toBe('+0.2억');
    expect(fmtEok(-15_000_000, { signed: true })).toBe('−0.2억');
    expect(fmtEok(-25_000_000)).toBe('−0.3억');
    expect(fmtEok(-14_999_999)).toBe('−0.1억');
  });
});

describe('toneOf', () => {
  it('반올림(억 1자리) 값 기준 up · down · flat', () => {
    expect(toneOf(4_000_000)).toBe('flat');
    expect(toneOf(5_000_000)).toBe('up');
    expect(toneOf(-5_000_000)).toBe('down');
    expect(toneOf(-4_999_999)).toBe('flat');
    expect(toneOf(586497190)).toBe('up');
    expect(toneOf(-112514343)).toBe('down');
    expect(toneOf(null)).toBe('flat');
  });
});

describe('fmtRate · kstHm', () => {
  it('등락률 부호 + 소수 1자리 · 0 은 「0.0%」', () => {
    expect(fmtRate(22.6)).toBe('+22.6%');
    expect(fmtRate(-1.2)).toBe('−1.2%');
    expect(fmtRate(0)).toBe('0.0%');
  });

  it('epoch ms → KST 「HH:MM」', () => {
    expect(kstHm(1791946230850)).toBe('11:50');
  });
});

describe('tagOf (D-09)', () => {
  it('상한가 = 「상한가 HH:MM」 · 미도달 = 마지막 등락률 · first_limit_ms null = 「상한가」', () => {
    expect(tagOf(rowOf(CHEONIL))).toEqual({ kind: 'limit', text: '상한가 11:50' });
    expect(tagOf(rowOf(DONGYANG))).toEqual({ kind: 'below', text: '+22.1%' });
    expect(tagOf({ ...rowOf(CHEONIL), first_limit_ms: null })).toEqual({ kind: 'limit', text: '상한가' });
  });
});

describe('sortRows (D-08)', () => {
  it('10/14 상위 5 = 한선엔지니어링 · 제주항공 · 천일고속 · 도우인시스 · 동양고속', () => {
    const top5 = sortRows(teamflowRows()).slice(0, 5).map((r) => r.isin);
    expect(top5).toEqual(['KR7452280001', 'KR7089590004', 'KR7000650002', 'KR7484120001', 'KR7084670009']);
  });

  it('null 맨 뒤 · 동률 isin 오름차순 · 입력 배열 불변', () => {
    const base = rowOf(HANSUN);
    const rows = [
      { ...base, isin: 'KR7000000003', team_net_val: null },
      { ...base, isin: 'KR7000000002', team_net_val: 100 },
      { ...base, isin: 'KR7000000001', team_net_val: 100 },
      { ...base, isin: 'KR7000000004', team_net_val: -50 },
    ];
    const before = rows.map((r) => r.isin);
    expect(sortRows(rows).map((r) => r.isin)).toEqual(['KR7000000001', 'KR7000000002', 'KR7000000004', 'KR7000000003']);
    expect(rows.map((r) => r.isin)).toEqual(before);
  });

  it('전부 순매도인 날도 내림차순(덜 판 종목이 위)', () => {
    const base = rowOf(HANSUN);
    const rows = [
      { ...base, isin: 'A', team_net_val: -300 },
      { ...base, isin: 'B', team_net_val: -100 },
    ];
    expect(sortRows(rows).map((r) => r.isin)).toEqual(['B', 'A']);
  });
});

describe('summaryPartsOf', () => {
  it('<b> 짝만 strong · 그 밖 태그 · 짝 없는 <b> 는 글자째 제거 · 엔티티 해제', () => {
    expect(summaryPartsOf('순매수 <b>+7.0억</b> 끝')).toEqual([
      { text: '순매수 ' },
      { text: '+7.0억', strong: true },
      { text: ' 끝' },
    ]);
    expect(summaryPartsOf('<i>x</i> &amp; y')).toEqual([{ text: 'x & y' }]);
    expect(summaryPartsOf('<b>z')).toEqual([{ text: 'z' }]);
  });
});

describe('fmtShare · isHotShare (D-11)', () => {
  it('0~1 × 100 반올림 정수 % · null 「—」', () => {
    expect(fmtShare(0.26023)).toBe('26%');
    expect(fmtShare(0.37)).toBe('37%');
    expect(fmtShare(null)).toBe('—');
  });

  it('≥ 0.30 만 hot', () => {
    expect(isHotShare(0.3)).toBe(true);
    expect(isHotShare(0.2999)).toBe(false);
    expect(isHotShare(null)).toBe(false);
  });
});

describe('fmtQty', () => {
  it('ko-KR 정수 · signed 면 + / U+2212 · null 「—」', () => {
    expect(fmtQty(96289)).toBe('96,289');
    expect(fmtQty(96289, { signed: true })).toBe('+96,289');
    expect(fmtQty(-21245, { signed: true })).toBe('−21,245');
    expect(fmtQty(null)).toBe('—');
  });
});

describe('BAND_SLOTS · bandSlotsOf (UI-SPEC T4)', () => {
  it('9칸 고정 순서', () => {
    expect(BAND_SLOTS).toEqual([
      '0% 미만',
      '0~5%',
      '5~10%',
      '10~15%',
      '15~20%',
      '20~25%',
      '25~28%',
      '28%~상한 미만',
      '상한가 가격',
    ]);
  });

  it('에스엠벡셀 = 9칸 전부 · 「하루 합계」 제외', () => {
    expect(bandSlotsOf(rowOf(SMBEXCEL).payload!.bands)).toEqual([
      6225285, -176192305, -11612257, -226281326, 78255046, -125037017, -95574679, 437702910, 288480150,
    ]);
  });

  it('천일고속 = 「0% 미만」 없음(null) · 「상한가 가격」 −508,256,000', () => {
    const slots = bandSlotsOf(rowOf(CHEONIL).payload!.bands);
    expect(slots).toHaveLength(9);
    expect(slots[0]).toBeNull();
    expect(slots[8]).toBe(-508256000);
  });

  it('모르는 label 은 어디에도 놓지 않는다 · [] → null 9개', () => {
    const band = rowOf(CHEONIL).payload!.bands[0]!;
    expect(bandSlotsOf([{ ...band, label: '30% 초과', net_val: 123 }])).toEqual(Array(9).fill(null));
    expect(bandSlotsOf([])).toEqual(Array(9).fill(null));
  });
});

describe('rowDescriptionOf (UI-SPEC T3 행 sr 설명)', () => {
  it('미도달 = 고가 항목 포함', () => {
    expect(rowDescriptionOf(rowOf(DONGYANG))).toBe(
      '결과 +22.1%, 고가 +29.3%, 팀 순매수 +2.2억, 20% 아래 −0.1억, 20%~상한 +2.3억, 매수 중 팀 2%',
    );
  });

  it('상한가 행은 고가 항목 없음', () => {
    expect(rowDescriptionOf(rowOf(CHEONIL))).toBe(
      '결과 상한가 11:50, 팀 순매수 +4.1억, 20% 아래 +1.1억, 20%~상한 +3.0억, 매수 중 팀 16%',
    );
  });

  it('미도달인데 high_rate null 이면 고가 항목 없음 · 값 null = 「—」', () => {
    expect(
      rowDescriptionOf({ ...rowOf(DONGYANG), high_rate: null, below20_net_val: null, team_buy_share: null }),
    ).toBe('결과 +22.1%, 팀 순매수 +2.2억, 20% 아래 —, 20%~상한 +2.3억, 매수 중 팀 —');
  });
});

/** 합성 10분 버킷 — key 로 start 를 만들고 나머지는 null(필요한 키만 덮어쓴다). */
const bk = (key: number, patch: Partial<TeamflowBucket> = {}): TeamflowBucket => {
  const m = key * 10;
  const start = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return {
    key,
    start,
    lo: null,
    hi: null,
    share: null,
    vol: null,
    val: null,
    buy_aggr: null,
    sell_aggr: null,
    team_buy: null,
    team_sell: null,
    net: null,
    team_buy_val: null,
    team_sell_val: null,
    net_val: null,
    ...patch,
  };
};

describe('bucketSlotsOf (D-13 · 2026-10-16 보정 — key 93 → 슬롯 38 합산)', () => {
  it('상수 — 54(09:00) · 92(15:20) · 93(15:30 종가 단일가) · 39칸', () => {
    expect(BUCKET_KEY_FIRST).toBe(54);
    expect(BUCKET_KEY_LAST).toBe(92);
    expect(BUCKET_KEY_CLOSE).toBe(93);
    expect(BUCKET_SLOTS).toBe(39);
  });

  it('천일고속 — 39칸 전부 채워짐 · slots[0] 09:00 · slots[38] = key 93 복사(start 15:20 · vol 40 · share null · lo = hi ≈ 29.78)', () => {
    const slots = bucketSlotsOf(rowOf(CHEONIL).payload!.buckets);
    expect(slots).toHaveLength(39);
    expect(slots.every((s) => s !== null)).toBe(true);
    expect(slots[0]!.start).toBe('09:00');
    expect(slots[18]!.start).toBe('12:00');
    const last = slots[38]!;
    expect(last.start).toBe('15:20');
    expect(last.key).toBe(92);
    expect(last.vol).toBe(40);
    expect(last.share).toBeNull();
    expect(last.lo).toBeCloseTo(29.78, 2);
    expect(last.hi).toBeCloseTo(29.78, 2);
  });

  it('합성 key 92 + 93 → 슬롯 38 하나로 합산(수량 · 금액 합 · lo min · hi max · share = 합산 team_buy ÷ buy_aggr)', () => {
    const slots = bucketSlotsOf([
      bk(92, { vol: 10, buy_aggr: 4, team_buy: 2, lo: 20, hi: 21, net_val: 100, share: 0.5 }),
      bk(93, { vol: 5, buy_aggr: 0, team_buy: 0, lo: 22, hi: 22, net_val: 0 }),
    ]);
    const s = slots[38]!;
    expect(s.start).toBe('15:20');
    expect(s.vol).toBe(15);
    expect(s.buy_aggr).toBe(4);
    expect(s.team_buy).toBe(2);
    expect(s.share).toBe(0.5);
    expect(s.lo).toBe(20);
    expect(s.hi).toBe(22);
    expect(s.net_val).toBe(100);
    // 둘 다 null 인 키는 null 그대로
    expect(s.team_sell_val).toBeNull();
    expect(slots.slice(0, 38).every((x) => x === null)).toBe(true);
  });

  it('합산 분모 0 → share null', () => {
    const s = bucketSlotsOf([bk(92, { buy_aggr: 0, team_buy: 0 }), bk(93, { buy_aggr: 0, team_buy: 0 })])[38]!;
    expect(s.share).toBeNull();
  });

  it('범위 밖 key(53 · 94) 버림 · 빈 칸 null · 54 → 슬롯 0 · 91 → 슬롯 37', () => {
    const slots = bucketSlotsOf([bk(53, { vol: 1 }), bk(54, { vol: 2 }), bk(91, { vol: 3 }), bk(94, { vol: 4 })]);
    expect(slots).toHaveLength(39);
    expect(slots[0]!.vol).toBe(2);
    expect(slots[37]!.vol).toBe(3);
    expect(slots.filter((x) => x !== null)).toHaveLength(2);
  });

  it('[] → null 39개(예외 없음)', () => {
    const slots = bucketSlotsOf([]);
    expect(slots).toHaveLength(39);
    expect(slots.every((x) => x === null)).toBe(true);
  });

  it('입력 배열 · 객체 불변', () => {
    const input = [bk(92, { vol: 10, buy_aggr: 4, team_buy: 2 }), bk(93, { vol: 5, buy_aggr: 0, team_buy: 0 })];
    const before = JSON.stringify(input);
    const slots = bucketSlotsOf(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(slots[38]).not.toBe(input[0]);
  });
});

describe('fmtRangePct (UI-SPEC 10분 표 · 툴팁)', () => {
  it('소수 1자리 · 음수만 U+2212 · 「~」 · 「%」', () => {
    expect(fmtRangePct(21.089, 29.779)).toBe('21.1~29.8%');
    expect(fmtRangePct(-1.23, 3.4)).toBe('\u22121.2~3.4%');
    expect(fmtRangePct(-0.04, 0)).toBe('0.0~0.0%');
  });

  it('둘 중 하나라도 null → 「—」', () => {
    expect(fmtRangePct(null, 3)).toBe('—');
    expect(fmtRangePct(3, null)).toBe('—');
  });
});
