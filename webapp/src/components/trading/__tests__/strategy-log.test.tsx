import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { RelayLimitChaser, RelayServerMsg } from '@gh-radar/shared';

import {
  StrategyLog,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from '../strategy-log';
import { isLimitChaserServerMessage } from '@/lib/limit-chaser';

/**
 * Phase 16 Plan 13 Task 1 — 전략 로그 (A13 · T-16-07).
 *
 * 여기서 잠그는 것:
 *   - 전이 문장이 **순수 함수**에서 나오는가 (화면마다 다른 말을 하지 않게)
 *   - 무장 해제가 「발주」인지 「사용자 조작」인지 **구분**되는가 (Pitfall 10)
 *   - 서버 거부(`ServerMessage ERROR`)가 **문구를 지어내지 않고** 원문을 싣는가 (D-36)
 *   - 상따/VI 몫 판정이 종목 유무로 갈리는가 (Pitfall 9)
 */

const BASE: RelayLimitChaser = {
  isin: 'KR7005930003',
  accountNo: '1234567801',
  // 시장 구분은 1자 코드다 — `"Q"`=KOSDAQ, 그 외=KOSPI (게이트웨이는 첫 글자만 읽는다).
  market: 'K',
  crud: 'C',
  buyOrderPrice: 71_000,
  buyOrderQty: 14,
  buyWatchPrice: 71_100,
  buyWatchQty: 10_000,
  buyMinTradeQty: 30_000,
  buyWatchSide: '0',
  buyTradeQtyEnabled: false,
  buyEnabled: false,
  sellOrderPrice: 71_200,
  sellOrderQty: 0,
  sellWatchPrice: 71_300,
  sellWatchQty: 10,
  sellMinTradeQty: 30_500,
  sellEnabled: false,
  sellTradeQtyEnabled: false,
  sweepWatchPrice: 71_400,
  sweepEnabled: false,
  sweepMinTickCount: 3,
  sweepRecalcEnabled: true,
  sweepMinCount: 0,
  sweepMinRate: 0,
  exchange: 'KRX',
  sellOrderRatio: 100,
  sellQtyTrackEnabled: false,
  sellQtyTrackRatio: 50,
  sellQtyTrackBaseline: 0,
  buyOrderAmount: 10,
  sellEntryLatched: false,
  cancelQtyEnabled: false,
  cancelWatchQty: 10,
  cancelTradeEnabled: false,
  cancelQtyTrackEnabled: false,
  cancelQtyTrackBaseline: 0,
  key: 'KR7005930003:1234567801:KRX',
};

const at = (over: Partial<RelayLimitChaser>): RelayLimitChaser => ({ ...BASE, ...over });

function msg(over: Partial<RelayServerMsg> = {}): RelayServerMsg {
  return { t: 'msg', lv: 'INFO', m: '세션에 참여했습니다', i: '', a: '', src: 'System', kind: '', ...over };
}

describe('strategyLogLine — 전이 문장(순수 함수)', () => {
  it('① 처음 본 전략 = 등록. 무장 상태도 함께 적는다', () => {
    expect(strategyLogLine(null, at({ buyEnabled: true }))).toBe('전략이 등록됐어요 · 매수 무장');
  });

  it('② 매수 무장 / 무장 해제', () => {
    expect(strategyLogLine(BASE, at({ buyEnabled: true }))).toBe('매수 무장');
    expect(strategyLogLine(at({ buyEnabled: true }), BASE)).toBe('매수 무장 해제');
  });

  it('③ ★ 발주로 인한 무장 해제는 `hadOrder` 로만 「발주」라고 쓴다 (Pitfall 10)', () => {
    // 직전 발주 이력을 모르면 「발주」라고 단정하지 않는다 — 거짓말이 된다.
    expect(strategyLogLine(at({ buyEnabled: true }), BASE)).toBe('매수 무장 해제');
    expect(strategyLogLine(at({ buyEnabled: true }), BASE, { hadOrder: true })).toBe(
      '매수 발주 — 무장 해제',
    );
  });

  it('④ 매도 무장 → 래치 전이가 각각 다른 문장이다', () => {
    expect(strategyLogLine(BASE, at({ sellEnabled: true }))).toBe('매도 무장 — 대기 (지지벽 미관측)');
    expect(
      strategyLogLine(at({ sellEnabled: true }), at({ sellEnabled: true, sellEntryLatched: true })),
    ).toBe('매도 진입 래치 ON — 감시 시작');
    expect(
      strategyLogLine(at({ sellEnabled: true, sellEntryLatched: true }), at({ sellEnabled: true })),
    ).toBe('매도 진입 래치 해제');
  });

  it('⑤ 취소 게이트 무장/해제 — 두 항 중 하나만 켜져도 무장이다', () => {
    expect(strategyLogLine(BASE, at({ cancelQtyEnabled: true }))).toBe(
      '매수 미체결 자동취소 무장',
    );
    expect(strategyLogLine(BASE, at({ cancelTradeEnabled: true }))).toBe(
      '매수 미체결 자동취소 무장',
    );
    expect(strategyLogLine(at({ cancelQtyEnabled: true }), BASE)).toBe(
      '매수 미체결 자동취소 해제',
    );
  });

  it('⑥ 값만 바뀌면 「서버 반영 완료」 — 반영의 유일한 증거가 에코다', () => {
    expect(strategyLogLine(BASE, at({ buyWatchQty: 8_000 }))).toBe('서버 반영 완료');
    // 게이트·래치·S→C 파생만 바뀐 것은 값 변경이 아니다(둘을 뭉개면 문장이 항상 붙는다).
    expect(strategyLogLine(BASE, at({ buyEnabled: true }))).toBe('매수 무장');
  });

  it('⑦ `crud:"D"` 는 삭제다 — 스위치가 아니라 에코가 판정한다 (Pitfall 7)', () => {
    expect(strategyLogLine(at({ buyEnabled: true }), at({ crud: 'D' }))).toBe(
      '전략이 삭제됐어요 (매수·매도·자동취소가 모두 꺼졌어요)',
    );
  });

  it('⑧ 아무것도 안 바뀌면 null — 같은 줄을 반복해 쌓지 않는다', () => {
    expect(strategyLogLine(BASE, at({}))).toBeNull();
  });

  it('⑨ 여러 전이가 한 줄로 합쳐지고 순서는 매수 → 매도 → 취소 → 값 고정이다', () => {
    const line = strategyLogLine(
      BASE,
      at({ buyEnabled: true, sellEnabled: true, cancelQtyEnabled: true, buyWatchQty: 8_000 }),
    );
    expect(line).toBe(
      '매수 무장 · 매도 무장 — 대기 (지지벽 미관측) · 매수 미체결 자동취소 무장 · 서버 반영 완료',
    );
  });
});

describe('serverMessageLogLine / strategiesDisabledLogLine', () => {
  it('⑩ ERROR 는 「거부」로 쓰고 서버 원문을 **그대로** 싣는다 (D-36 · PC-7)', () => {
    const out = serverMessageLogLine(
      msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '허용되지 않은 거래소입니다' }),
    );
    expect(out.level).toBe('error');
    expect(out.text).toBe('서버가 거부했어요 (SetLimitChaser) — 허용되지 않은 거래소입니다');
  });

  it('⑪ INFO 는 통지로 남고 레벨이 error 가 아니다', () => {
    const out = serverMessageLogLine(msg({ m: '세션에 참여했습니다', src: 'System' }));
    expect(out.level).toBe('info');
    expect(out.text).toContain('세션에 참여했습니다');
  });

  it('⑫ 15:40 자동 비활성화 문구는 UI-SPEC verbatim 이다', () => {
    expect(strategiesDisabledLogLine()).toBe(
      '서버가 모든 전략을 자동 비활성화했어요 (장 마감 규칙)',
    );
  });
});

describe('isLimitChaserServerMessage — 상따/VI 몫 판정 (Pitfall 9)', () => {
  it('⑬ SetLimitChaser 는 상따, 종목 없는 Account 통지는 VI 몫이라 상따가 표시하지 않는다', () => {
    expect(isLimitChaserServerMessage(msg({ src: 'SetLimitChaser', i: '' }))).toBe(true);
    expect(isLimitChaserServerMessage(msg({ src: 'Account', i: 'KR7005930003' }))).toBe(true);
    // ★ 종목이 없는 계좌 통지 = VI 몫. 여기서 그리면 사용자가 멀쩡한 상따를 껐다 켠다.
    expect(isLimitChaserServerMessage(msg({ src: 'Account', i: '' }))).toBe(false);
    expect(isLimitChaserServerMessage(msg({ src: 'System', i: '' }))).toBe(false);
  });
});

describe('StrategyLog — 렌더', () => {
  const entries: StrategyLogEntry[] = [
    { id: '2', at: '13:44:02', text: '매수 발주 — 무장 해제', level: 'info' },
    { id: '1', at: '13:42:11', text: '서버가 거부했어요 — 계좌 권한 없음', level: 'error' },
  ];

  it('⑭ 빈 상태 문구가 UI-SPEC verbatim 이다', () => {
    render(<StrategyLog entries={[]} />);
    expect(screen.getByText('아직 반영된 이벤트가 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('스위치를 켜거나 값을 수정하면 서버 응답이 여기에 쌓여요.'),
    ).toBeInTheDocument();
  });

  it('⑮ 시각 + 문장을 최신 상단으로 쌓고 ERROR 는 destructive 색이다', () => {
    const { container } = render(<StrategyLog entries={entries} />);

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="strategy-log-row"]'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('13:44:02');
    expect(rows[1].textContent).toContain('13:42:11');
    expect(rows[1].dataset.level).toBe('error');
    expect(rows[1].innerHTML).toContain('--destructive');
    expect(rows[0].innerHTML).not.toContain('--destructive');
  });

  /*
    ★ **뒤집힌 계약** (260911-w5h). 옛 캡션(「서버 에코 기준 · 새로고침 시 지워져요」)은
      제목 줄 우측에 붙어 모바일에서 제목을 두 줄로 접었고, 상시 표시 문구는 어차피
      다음번에 읽히지 않는다(T-16-86 과 같은 이유). 사용자가 **없앤다**로 확정했다 —
      아래로 내린 것이 아니라 컴포넌트 어디에도 없다.
  */
  it('⑯ 캡션 문구가 컴포넌트 어디에도 없고 목록은 160px 스크롤이다', () => {
    const { container } = render(<StrategyLog entries={entries} />);

    const root = container.querySelector('[data-slot="strategy-log"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(within(root).queryByText('서버 에코 기준 · 새로고침 시 지워져요')).toBeNull();
    expect(root.textContent).not.toContain('새로고침');
    // 제목은 그대로다 — 없앤 것은 캡션뿐이다.
    expect(within(root).getByRole('heading', { name: '전략 로그' })).toBeInTheDocument();

    const list = container.querySelector('[data-slot="strategy-log-list"]');
    expect(list?.className).toContain('max-h-[160px]');
    expect(list?.className).toContain('overflow-y-auto');

    /*
      ★ `mono` 는 **시각에만** 있다. 목록 전체가 mono 면 한글 로그 문장이 자간이 벌어진 채
        읽히고 좁은 폭에서 두세 줄로 접힌다 — 세로로 줄을 맞춰야 하는 것은 시각뿐이다.
    */
    expect(list?.className).not.toContain('mono');
    const row = container.querySelector('[data-slot="strategy-log-row"]') as HTMLElement;
    const spans = Array.from(row.querySelectorAll('span'));
    expect(spans[0]!.className).toContain('mono'); // 시각
    expect(spans[0]!.textContent).toBe('13:44:02');
    expect(spans[1]!.className).not.toContain('mono'); // 문장은 본문 폰트
  });
});
