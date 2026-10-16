import { describe, it, expect } from 'vitest';

/**
 * Phase 33 Plan 03 — 팀 매집 표시 변환 골든 (UI-SPEC 「표시 변환 규칙 (T11)」 · D-08 · D-09 · D-10 · D-11).
 *
 * 잠그는 것: 억 1자리 반올림 · 0.0억 무부호 · U+2212 · 1,000억 이상 쉼표(조 변환 없음) · 부호 색 판정 · 등락률 · KST 시각 ·
 * 결과 태그 · 정렬(team_net_val 내림차순 · null 맨 뒤 · 동률 isin) · KPI 4칸(10/14 = 34 · 9 · 9 · −26.3억) · 요약 조각.
 * 픽스처 = 10/14 실측 34행(합성 행 없음 — 경계값만 개별 행을 덮어쓴다).
 */

import { fmtEok, fmtRate, kpisOf, kstHm, sortRows, summaryPartsOf, tagOf, toneOf } from '../teamflow-report';
import { CHEONIL, DONGYANG, HANSUN, teamflowRows } from '@/test-fixtures/teamflow-export';
import type { TeamflowRow } from '@gh-radar/shared';

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
    expect(fmtEok(-5_000_000, { signed: true })).toBe('0.0억');
    expect(fmtEok(null)).toBe('—');
    expect(fmtEok(Number.NaN)).toBe('—');
  });
});

describe('toneOf', () => {
  it('반올림(억 1자리) 값 기준 up · down · flat', () => {
    expect(toneOf(4_000_000)).toBe('flat');
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
    expect(top5).toEqual([HANSUN, 'KR7089590004', CHEONIL, 'KR7484120001', DONGYANG]);
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
