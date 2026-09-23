import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { RelayLimitChaser, RelayServerMsg } from '@gh-radar/shared';

import {
  StrategyLog,
  TRANSITION_ORDER,
  TRANSITION_TEXT,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from '../strategy-log';
import { isLimitChaserServerMessage } from '@/lib/limit-chaser';
import { isViServerMessage } from '@/lib/vi-alert';

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
  cancelEntryLatched: false,
  buyEntryLatched: false,
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
    // ★ 17-11 — 출처 배지가 접두로 붙었다(D-17). 「거부」 문구와 서버 원문은 그대로다.
    expect(out.text).toBe('[서버] 서버가 거부했어요 (SetLimitChaser) — 허용되지 않은 거래소입니다');
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

  /*
    ★ 17-11 — `src === "LimitChaser"`(상따 **런타임 사유 줄**) 는 상따 화면의 몫이다.
      17-01 이 `src` 어휘에 더했지만 받아 주는 판정이 없어 **한 글자도 그려지지 않았다**
      (17-06 이 VI 쪽에서 같은 결손을 발견하고 `VITrigger` 만 열었다 — `LimitChaser` 를
      VI 가 받는 것은 Pitfall 9 위반이라 그쪽에 열지 않았고, 이 화면이 그 소비처다).
  */
  it('⑬b ★ `LimitChaser` 런타임 사유 줄은 상따 몫이고, VI 몫으로는 새지 않는다 (Pitfall 9)', () => {
    expect(isLimitChaserServerMessage(msg({ src: 'LimitChaser', i: '' }))).toBe(true);
    expect(isLimitChaserServerMessage(msg({ src: 'LimitChaser', i: 'KR7005930003' }))).toBe(true);
    // VI 화면은 여전히 그리지 않는다 — 남의 거부를 내 거부로 그리지 않는다.
    expect(isViServerMessage(msg({ src: 'LimitChaser', i: '' }))).toBe(false);
    expect(isViServerMessage(msg({ src: 'VITrigger', i: '' }))).toBe(true);
  });
});

/*
  Phase 17 Plan 11 Task 2 — 래치 전이 4종 · 값 변경 skip · 출처 배지 (D-17 · D-23).

  여기서 잠그는 것:
    ① 취소·매수 래치 ON/해제가 **각자의 문장**을 갖는가 (매도와 대구)
    ② ★ 래치만 바뀐 에코가 「서버 반영 완료」로 보고되지 않는가 — 보고되면 사용자는
       **자기가 하지도 않은 수정이 반영됐다**고 읽는다 (T-17-39)
    ③ 첫 스냅샷 규율이 매도·취소·매수 **세 축에서 같은가** — 한쪽만 다르면 같은 상태가
       축마다 다르게 보고된다
    ④ 두 표(`TRANSITION_TEXT`/`TRANSITION_ORDER`)가 **닫힌 집합으로 동형인가** — 문구만
       있고 아무도 만들지 않는 전이 / 전이는 나는데 문구가 없는 사건을 둘 다 막는다
*/
describe('⑰ 취소·매수 래치 전이 4종 + skip 집합 (17-11 Task 2)', () => {
  it('⑰-1 취소 진입 래치 ON / 해제', () => {
    const armed = at({ cancelQtyEnabled: true });
    expect(strategyLogLine(armed, at({ cancelQtyEnabled: true, cancelEntryLatched: true }))).toBe(
      '취소 진입 래치 ON — 취소 판정 시작',
    );
    expect(strategyLogLine(at({ cancelQtyEnabled: true, cancelEntryLatched: true }), armed)).toBe(
      '취소 진입 래치 해제',
    );
  });

  it('⑰-2 매수 진입 래치 ON / 해제', () => {
    const armed = at({ buyEnabled: true, buyWatchSide: '1' });
    expect(strategyLogLine(armed, { ...armed, buyEntryLatched: true })).toBe(
      '매수 진입 래치 ON — 잔량 항 판정 시작',
    );
    expect(strategyLogLine({ ...armed, buyEntryLatched: true }, armed)).toBe(
      '매수 진입 래치 해제',
    );
  });

  it('⑰-3 ★ 래치 두 필드**만** 바뀐 에코는 「서버 반영 완료」를 내지 않는다 (T-17-39)', () => {
    const line = strategyLogLine(
      BASE,
      at({ cancelEntryLatched: true, buyEntryLatched: true }),
    );
    expect(line).not.toBeNull();
    expect(line).not.toContain('서버 반영 완료');
    // 두 래치 문장만 남는다.
    expect(line).toBe('매수 진입 래치 ON — 잔량 항 판정 시작 · 취소 진입 래치 ON — 취소 판정 시작');
  });

  it('⑰-4 값이 함께 바뀌면 그때는 「서버 반영 완료」가 붙는다 — skip 이 값 축까지 먹지 않는다', () => {
    expect(strategyLogLine(BASE, at({ cancelEntryLatched: true, cancelWatchQty: 99 }))).toBe(
      '취소 진입 래치 ON — 취소 판정 시작 · 서버 반영 완료',
    );
  });

  it('⑰-5 ★ 첫 스냅샷 규율이 매도·취소·매수 세 축에서 **같다** (실측 기준: 매도)', () => {
    // 매도는 래치가 켜져 있으면 등록 줄에 래치 문장을 쓴다 — 그것이 기존 규율이다.
    expect(strategyLogLine(null, at({ sellEnabled: true, sellEntryLatched: true }))).toBe(
      '전략이 등록됐어요 · 매도 진입 래치 ON — 감시 시작',
    );
    expect(
      strategyLogLine(null, at({ cancelQtyEnabled: true, cancelEntryLatched: true })),
    ).toBe('전략이 등록됐어요 · 취소 진입 래치 ON — 취소 판정 시작');
    expect(
      strategyLogLine(null, at({ buyEnabled: true, buyWatchSide: '1', buyEntryLatched: true })),
    ).toBe('전략이 등록됐어요 · 매수 진입 래치 ON — 잔량 항 판정 시작');
    // 래치가 꺼져 있으면 무장 문장으로 떨어진다 — 세 축 모두.
    expect(strategyLogLine(null, at({ cancelQtyEnabled: true }))).toBe(
      '전략이 등록됐어요 · 매수 미체결 자동취소 무장',
    );
  });

  it('⑰-6 ★ 두 표가 16종 닫힌 집합으로 동형이다 — 문구/전이가 한쪽만 늘지 않는다', () => {
    expect(TRANSITION_ORDER).toHaveLength(16);
    expect(Object.keys(TRANSITION_TEXT)).toHaveLength(16);
    // 중복 없음 + 두 표의 원소 집합이 정확히 같다.
    expect(new Set(TRANSITION_ORDER).size).toBe(16);
    expect([...TRANSITION_ORDER].sort()).toEqual(Object.keys(TRANSITION_TEXT).sort());
  });

  it('⑰-7 한 줄 안의 순서는 매수 → 매도 → 취소 축을 지킨다 (래치도 제자리)', () => {
    const line = strategyLogLine(
      at({ buyEnabled: true, buyWatchSide: '1', sellEnabled: true, cancelQtyEnabled: true }),
      at({
        buyEnabled: true,
        buyWatchSide: '1',
        buyEntryLatched: true,
        sellEnabled: true,
        sellEntryLatched: true,
        cancelQtyEnabled: true,
        cancelEntryLatched: true,
      }),
    );
    expect(line).toBe(
      '매수 진입 래치 ON — 잔량 항 판정 시작 · 매도 진입 래치 ON — 감시 시작 · 취소 진입 래치 ON — 취소 판정 시작',
    );
  });
});

describe('⑱ 서버 통지 출처 배지 (D-17)', () => {
  it('⑱-1 `LimitChaser` 사유 줄은 `[상따]` 로 시작하고 원문 어휘를 두 번 말하지 않는다', () => {
    const out = serverMessageLogLine(
      msg({ lv: 'ERROR', src: 'LimitChaser', m: '매도 무장이 꺼져 있습니다 — 매도 감시를 먼저 켜세요' }),
    );
    expect(out.text).toBe(
      '[상따] 서버가 거부했어요 — 매도 무장이 꺼져 있습니다 — 매도 감시를 먼저 켜세요',
    );
    expect(out.text).not.toContain('(LimitChaser)');
    expect(out.level).toBe('error');
  });

  it('⑱-2 `VITrigger` 는 `[VI]`, 그 밖은 `[서버]` + 원문 src 를 그대로 남긴다', () => {
    expect(serverMessageLogLine(msg({ src: 'VITrigger', m: 'VI 발동' })).text).toBe(
      '[VI] 서버 통지 — VI 발동',
    );
    // 배지가 출처를 이름으로 말하지 못하는 어휘는 원문 src 가 유일한 단서다 — 남긴다.
    expect(
      serverMessageLogLine(msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '허용되지 않은 거래소입니다' }))
        .text,
    ).toBe('[서버] 서버가 거부했어요 (SetLimitChaser) — 허용되지 않은 거래소입니다');
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

describe('StrategyLog embed — 빈 문구 override (quick-260923-onn)', () => {
  it('emptyTitle 을 넘기면 그 문구 · 없으면 종전 「아직 기록이 없어요」', () => {
    const { unmount } = render(<StrategyLog entries={[]} variant="embed" emptyTitle="로그 없음" />);
    expect(screen.getByText('로그 없음')).toBeInTheDocument();
    expect(screen.queryByText('아직 기록이 없어요')).toBeNull();
    unmount();
    render(<StrategyLog entries={[]} variant="embed" />);
    expect(screen.getByText('아직 기록이 없어요')).toBeInTheDocument();
  });
});
