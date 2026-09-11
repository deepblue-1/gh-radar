import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayTapeEntry } from '@gh-radar/shared';

import {
  TradeTape,
  deriveTapeSides,
  formatTapeTime,
  formatTapeTimeShort,
} from '../trade-tape';

/**
 * Phase 15 Plan 13 — 체결 테이프 계약 검증.
 *
 * 잠그는 규칙: 최신 상단 · 부호+라벨 병기(색 비의존) · 링버퍼 200 ·
 * "사용자가 스크롤을 내리면 자동 스크롤 정지" · 구분 추정 규칙.
 */

const BASE = 98_000;

function entry(over: Partial<RelayTapeEntry> = {}): RelayTapeEntry {
  return { t: '093015123456', p: 98_100, cs: '2', c: 100, q: 10, cv: 1_000, ...over };
}

/** 최신이 index 0 인 배열을 만든다. cv 는 오래된 것부터 증가한다. */
function tape(prices: number[]): RelayTapeEntry[] {
  return prices.map((p, i) =>
    entry({ p, q: 10 + i, cv: 10_000 - i, t: `0930${String(10 + i).padStart(2, '0')}000000` }),
  );
}

describe('formatTapeTime', () => {
  it('거래소 원문 "HHMMSSuuuuuu" 에서 마이크로초를 절삭한다', () => {
    expect(formatTapeTime('093015123456')).toBe('09:30:15');
    expect(formatTapeTime('093015')).toBe('09:30:15');
    // 형태를 알 수 없으면 원문을 그대로 둔다(임의 해석 금지).
    expect(formatTapeTime('N/A')).toBe('N/A');
  });
});

describe('deriveTapeSides', () => {
  it('① 최우선호가 비교가 1순위 — 매도1 이상이면 매수 체결, 매수1 이하면 매도 체결', () => {
    const entries = [entry({ p: 98_100 }), entry({ p: 97_900 })];
    expect(deriveTapeSides(entries, 98_100, 97_900)).toEqual(['B', 'S']);
  });

  it('② 최우선호가가 없으면 틱 규칙으로 폴백하고 zero-tick 은 직전 판정을 상속한다', () => {
    // 최신 → 과거 순: 98,200 / 98,200 / 98,100 / 98,300
    const entries = [
      entry({ p: 98_200 }),
      entry({ p: 98_200 }),
      entry({ p: 98_100 }),
      entry({ p: 98_300 }),
    ];
    // 가장 오래된 98,300 은 기준이 없어 기본값 B, 98,100 은 하락 → S,
    // 98,200 은 상승 → B, 그 다음 98,200 은 zero-tick → 직전(B) 상속.
    expect(deriveTapeSides(entries)).toEqual(['B', 'B', 'S', 'B']);
  });
});

describe('TradeTape', () => {
  it('③ 최신이 맨 위이고 매수/매도를 **수량 색 + sr-only 라벨**로 병기한다 (WCAG 1.4.1)', () => {
    const { container } = render(
      <TradeTape
        entries={tape([98_200, 97_900])}
        isStale={false}
        basePrice={BASE}
        bestAsk={98_200}
        bestBid={97_900}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1); // 헤더 제외
    expect(rows[0]).toHaveTextContent('98,200');
    expect(screen.getByText('09:30:10')).toBeInTheDocument();

    // `구분` 열은 없어졌다 — 열은 시각·체결가·수량 3개뿐.
    expect(container.querySelectorAll('thead th')).toHaveLength(3);
    expect(screen.queryByText('▲ 매수')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '구분' })).toBeNull();

    // 색이 유일한 구분이 되지 않도록 수량 셀에 sr-only 라벨이 남아야 한다.
    const qty = Array.from(container.querySelectorAll('tbody tr')).map(
      (r) => r.children[2] as HTMLElement,
    );
    expect(qty[0].className).toContain('text-[var(--up)]');
    expect(qty[1].className).toContain('text-[var(--down)]');
    expect(qty[0].querySelector('.sr-only')?.textContent?.trim()).toBe('매수');
    expect(qty[1].querySelector('.sr-only')?.textContent?.trim()).toBe('매도');
  });

  it('④ 체결이 없으면 빈 상태 문구를 그린다 (UI-SPEC verbatim)', () => {
    render(<TradeTape entries={[]} isStale={false} basePrice={BASE} />);

    expect(screen.getByText('아직 체결이 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('장 시작(09:00) 이후 체결이 발생하면 위에서부터 쌓여요.'),
    ).toBeInTheDocument();
  });

  it('⑤ 링버퍼 상한 200건 — 초과분은 하단부터 잘린다', () => {
    const many = tape(Array.from({ length: 260 }, (_, i) => 98_000 + i));
    render(<TradeTape entries={many} isStale={false} basePrice={BASE} />);

    // 헤더 1행 + 본문 200행.
    expect(screen.getAllByRole('row')).toHaveLength(201);
  });

  it('⑥ 재접속 중(isStale)에도 값을 비우지 않고 opacity 로만 감쇠한다', () => {
    const { container } = render(
      <TradeTape entries={tape([98_200, 97_900])} isStale basePrice={BASE} />,
    );

    const root = container.querySelector('[data-slot="trade-tape"]');
    expect(root).toHaveAttribute('data-stale', 'true');
    expect(root?.className).toContain('opacity-[.55]');
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('⑦ 스크롤을 내리면 자동 스크롤이 멈추고 `새 체결 N건 · 맨 위로` 핀이 뜬다', async () => {
    const user = userEvent.setup();
    const first = tape([98_200, 98_100]);
    const { container, rerender } = render(
      <TradeTape entries={first} isStale={false} basePrice={BASE} />,
    );

    const scroller = container.querySelector('[data-slot="trade-tape"] > div');
    expect(scroller).not.toBeNull();

    // 아직 맨 위 → 핀 없음.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    // 사용자가 아래로 스크롤 → 자동 스크롤 정지.
    fireEvent.scroll(scroller!, { target: { scrollTop: 120 } });

    // 신규 배치 2건 도착.
    const next = [entry({ p: 98_400, cv: 10_002 }), entry({ p: 98_300, cv: 10_001 }), ...first];
    rerender(<TradeTape entries={next} isStale={false} basePrice={BASE} />);

    const pin = await screen.findByRole('button', { name: /새 체결 2건 · 맨 위로/ });
    await user.click(pin);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('⑨ 열 폭을 명시 배분하고 셀은 줄바꿈하지 않는다 (`98,100` 이 두 줄로 쪼개지던 회귀)', () => {
    const { container } = render(
      <TradeTape entries={tape([98_100, 97_900])} isStale={false} basePrice={BASE} />,
    );

    // `table-fixed` 균등 분할이면 열당 폭이 모자라 체결가가 줄바꿈했다.
    const cols = container.querySelectorAll('table > colgroup > col');
    expect(cols).toHaveLength(3);
    // px 이 아니라 **비율** 이어야 한다 — px 이면 모바일에서 남는 폭이 마지막 열로 몰린다.
    expect(cols[0].className).toContain('w-[36%]'); // 시각 `09:30:17`
    expect(cols[1].className).toContain('w-[34%]'); // 체결가 `127,400`
    expect(cols[2].className).toContain('w-[30%]'); // 수량

    // 폭이 모자라도 줄바꿈 대신 잘리게 둔다 — 두 줄로 무너지는 편이 더 나쁘다.
    const row = container.querySelector('tbody tr') as HTMLElement;
    expect(row.className).toContain('[&>td]:whitespace-nowrap');
  });

  it('⑧ 구분이 추정임을 화면에 밝힌다 (게이트웨이가 매수/매도 플래그를 주지 않는다)', () => {
    render(<TradeTape entries={tape([98_200])} isStale={false} basePrice={BASE} />);
    expect(
      screen.getByText('수량 색(빨강 매수 · 파랑 매도)은 최우선호가·직전 체결가 기준 추정이에요'),
    ).toBeInTheDocument();
  });
});

/*
  260911-w5h — `compact` 옵션(상따 모바일 좌측 칼럼, 콘텐츠 ≈140px).

  ★ 이 describe 의 **첫 케이스가 회귀 잠금**이다: `compact` 를 넘기지 않는 기존 호출부
    (호가주문 탭)의 렌더 결과가 변경 전과 **완전히 같아야** 한다. 그 단언 없이 compact 만
    잠그면 「새 옵션은 맞는데 기존 화면이 조용히 바뀐」 상태가 초록으로 지나간다.
*/
describe('⑩ TradeTape compact (260911-w5h)', () => {
  const rows = () => tape([98_100, 97_900, 98_300]);
  const scroller = (root: HTMLElement) =>
    root.querySelector('[data-slot="trade-tape"] > div') as HTMLElement;

  it('★ 회귀 잠금 — `compact` 미전달이면 변경 전과 완전히 같다', () => {
    const { container } = render(
      <TradeTape entries={rows()} isStale={false} basePrice={BASE} />,
    );

    const root = container.querySelector('[data-slot="trade-tape"]')!;
    expect(root).not.toHaveAttribute('data-compact');

    // `<thead>` 3개 헤더가 그대로 있다.
    const ths = container.querySelectorAll('thead th');
    expect(ths).toHaveLength(3);
    expect(Array.from(ths).map((el) => el.textContent)).toEqual(['시각', '체결가', '수량']);

    // 시각은 `HH:MM:SS` 다.
    expect(container.querySelector('tbody td')!.textContent).toBe('09:30:10');

    // 스크롤 상한 · tabindex · 셀 패딩이 그대로다.
    const box = scroller(container);
    expect(box.className).toContain('max-h-[320px]');
    expect(box.className).toContain('min-[900px]:max-h-[664px]');
    expect(box).not.toHaveAttribute('tabindex');
    expect(box).not.toHaveAttribute('data-slot');

    const row = container.querySelector('tbody tr') as HTMLElement;
    expect(row.className).toContain('[&>td]:px-1.5');
    expect(row.className).toContain('[&>td]:h-[var(--row-h)]');
    expect(row.className).toContain('[&>td]:text-[length:var(--t-caption)]');
  });

  it('compact 는 컬럼헤더가 없고 시각이 `MM:SS` 이며 셀이 10px · 행이 24px 이다', () => {
    const { container } = render(
      <TradeTape compact entries={rows()} isStale={false} basePrice={BASE} />,
    );

    const root = container.querySelector('[data-slot="trade-tape"]')!;
    expect(root).toHaveAttribute('data-compact', 'true');
    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelector('tbody td')!.textContent).toBe('30:10');

    const row = container.querySelector('tbody tr') as HTMLElement;
    expect(row.className).toContain('[&>td]:h-6');
    expect(row.className).toContain('[&>td]:px-1');
    // ★ 세 셀 **전부** 10px 이다 — 시각만 줄이면 9자리 체결가가 140px 칼럼에서 잘린다.
    expect(row.className).toContain('[&>td]:text-[10px]');
    expect(row.className).not.toContain('[&>td]:text-[length:var(--t-caption)]');
    // 시각 셀의 개별 11px 도 compact 에서는 걷는다(행 규칙의 10px 이 이겨야 한다).
    expect((container.querySelector('tbody td') as HTMLElement).className).not.toContain(
      'text-[11px]',
    );
  });

  it('compact 스크롤 영역이 200px 상한이고 키보드로 닿는다 (axe scrollable-region-focusable)', () => {
    const { container } = render(
      <TradeTape compact entries={rows()} isStale={false} basePrice={BASE} />,
    );

    const box = scroller(container);
    expect(box.className).toContain('max-h-[200px]');
    expect(box.className).not.toContain('max-h-[320px]');
    // 안에 상시 포커스 가능한 자식이 없다 — 박스 자신이 tab stop 이어야 한다.
    expect(box).toHaveAttribute('tabindex', '0');
    expect(box).toHaveAttribute('data-slot', 'tape-scroll');
    // 이름은 자식 table 의 `aria-label` 이 읽어 준다 — 중복 라벨을 달지 않는다.
    expect(box).not.toHaveAttribute('aria-label');
  });

  it('compact 도 colgroup 비율을 갖고 체결가 칼럼이 가장 넓다', () => {
    const { container } = render(
      <TradeTape compact entries={rows()} isStale={false} basePrice={BASE} />,
    );

    const cols = Array.from(container.querySelectorAll('table > colgroup > col'));
    expect(cols).toHaveLength(3);
    expect(cols[0]!.className).toContain('w-[26%]');
    expect(cols[1]!.className).toContain('w-[42%]'); // 가장 넓다 — 9자리 체결가
    expect(cols[2]!.className).toContain('w-[32%]');
  });

  it('compact 에서도 핀 버튼 · 수량 sr-only · 「추정이에요」 라벨이 전부 남는다', () => {
    const { container, rerender } = render(
      <TradeTape compact entries={rows()} isStale={false} basePrice={BASE} />,
    );

    // 수량 색의 비색 경로.
    expect(screen.getAllByText(/매수|매도/, { selector: '.sr-only' }).length).toBeGreaterThan(0);
    // 하단 추정 고지.
    expect(
      screen.getByText('수량 색(빨강 매수 · 파랑 매도)은 최우선호가·직전 체결가 기준 추정이에요'),
    ).toBeInTheDocument();

    // 스크롤을 내린 뒤 새 체결이 들어오면 핀 버튼이 뜬다.
    fireEvent.scroll(scroller(container), { target: { scrollTop: 120 } });
    rerender(
      <TradeTape
        compact
        entries={[entry({ p: 99_000, cv: 99_999, t: '093099000000' }), ...rows()]}
        isStale={false}
        basePrice={BASE}
      />,
    );
    expect(screen.getByRole('button', { name: /새 체결 .*맨 위로/ })).toBeInTheDocument();
  });

  it('빈 상태에도 `data-compact` 가 붙는다 — 상태와 무관하게 compact 를 짚을 수 있다', () => {
    const { container } = render(
      <TradeTape compact entries={[]} isStale={false} basePrice={BASE} />,
    );

    expect(container.querySelector('[data-slot="trade-tape"]')).toHaveAttribute(
      'data-compact',
      'true',
    );
    expect(screen.getByText('아직 체결이 없어요')).toBeInTheDocument();
  });
});

describe('formatTapeTimeShort', () => {
  it('12자 원문에서 `MM:SS` 두 조각만 뽑는다', () => {
    expect(formatTapeTimeShort('093015123456')).toBe('30:15');
    expect(formatTapeTimeShort('145959000000')).toBe('59:59');
  });

  it('구분자가 섞여도 숫자만 남겨 처리한다', () => {
    expect(formatTapeTimeShort('09:30:15')).toBe('30:15');
  });

  it('6자 미만 원문은 그대로 돌려준다 — 모르는 형식을 잘라 시각을 지어내지 않는다', () => {
    expect(formatTapeTimeShort('0930')).toBe('0930');
    expect(formatTapeTimeShort('')).toBe('');
    // `formatTapeTime` 과 **같은 규율**이다.
    expect(formatTapeTimeShort('0930')).toBe(formatTapeTime('0930'));
  });
});
