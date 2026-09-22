'use client';

/**
 * SharedPanels — 작업대 하단 공용 패널: 미체결 · 잔고 · 전략 로그 (18-09 / D-13 · E13 · TRADE-09).
 *
 * ① 무엇을 어디에
 *   카드 격자 아래 한 자리에서 **전 종목**의 미체결·잔고·로그를 본다(종목 열이 있다). 탭은
 *   「미체결 (N)」·「잔고 (N)」·「전략 로그」 셋이고 라벨의 (N) 은 숫자형이다 — 0 이면 빈 문구,
 *   1 이상이면 같은 행 문법이라 단/복수 어휘 분기가 없다.
 *
 * ② ★ 계좌 축은 **상태줄에서 고른 단일 계좌**다 (D-13 · Q-2)
 *   미체결·잔고는 `AccountPanel` 의 계좌 전용 모드를 **탭 임베드(`section`)** 로 그대로 쓴다.
 *   다계좌 합산을 여기서 새로 만들지 않는다 — 그것은 `/me` 담당(MYPAGE-01)이고, 두 표면이
 *   같은 일을 하면 한쪽만 고쳐진다. 취소 규율(확인 다이얼로그 · 3분기 결과 · 취소 보관 행)도
 *   `AccountPanel` 한 벌이다.
 *
 * ③ ★ 미체결 행 선택 = 수동주문 폼 정정/취소의 **유일한 진입** (D-21)
 *   선택 상태는 작업대(상위)가 소유하고 수동주문 폼의 `selectedUnfilled` 로 내려간다.
 *   토글(선택된 행을 다시 누르면 해제)은 **여기 한 곳**에서 `null` 로 바꿔 올린다 —
 *   AccountPanel 은 「이 행을 눌렀다」만 알린다.
 *
 * ④ 반응형은 컨테이너 `wb` 기준이다 (D-28 — 뷰포트 브레이크포인트 금지)
 *   - `wb` 700 이상: 격자 아래 **일반 섹션**. 본문은 세로 자연 확장(높이 상한 없음).
 *   - 폰 밴드(<700): 하단 `sticky bottom:0 · z-20` **접이식 바**. 본문 최대 40vh 스크롤.
 *     기본은 접힘 — 펼친 패널이 카드를 가리지 않게 사용자가 연다(목업 기본값).
 *   경계 수치의 정본은 `globals.css` §2.2b 다. 여기서 다시 적지 않는다.
 *
 * ⑤ ★ 레이어 예산 — 더티 바(z-40)와 겹치면 **여백으로** 비킨다. z-index 로 덮지 않는다.
 *   더티 바는 `document.body` 포털의 `fixed … z-40` 이라 이 페이지의 스태킹 컨텍스트 밖이고,
 *   이 패널은 `z-20` 이다. 카드가 N개라 폰에서 이 충돌은 **상시** 일어난다.
 *   z-index 로 이 패널을 올리면 이번에는 더티 바의 「수정」이 조용히 가려진다 — 선례:
 *   「z-index 로 FAB 을 덮는 것은 해법이 아니다 — 덮으면 채팅 진입점이 조용히 사라진다」
 *   (`dirty-action-bar.tsx` ⑥ⓒ). 그래서 바가 떠 있으면 그 **실측 높이**만큼
 *     · `bottom` — 폰 sticky 가 바 위에서 멈춘다(펼침/접힘 모두),
 *     · `margin-bottom` — 페이지 끝까지 스크롤해도 패널 끝이 바 위에 온다(≥700 포함)
 *   를 준다. 바가 DOM 에 아직 없거나 잴 수 없으면 보수적 기본값(`DIRTY_BAR_FALLBACK_PX`)이다.
 *   ★ 겹침 0 의 **실측**은 18-13 Playwright `boundingBox()` 가 맡는다 — jsdom 은 레이아웃이 없다.
 *
 * ⑥ 로딩 스피너가 없다 (E13 loading)
 *   미체결·잔고는 인증 직후 relay 스냅샷으로 채워진다(push). 스냅샷 전은 빈 문구이고, 목록 자체의
 *   로드 실패 경로는 없다.
 */

import { useCallback, useId, useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RelayAccountState, RelayOrderResultMsg, RelayUnfilled } from '@gh-radar/shared';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountPanel, type AccountRowOrigin } from '@/components/orderbook/account-panel';
import { StrategyLog, type StrategyLogEntry } from '@/components/trading/strategy-log';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

/**
 * 더티 바를 잴 수 없을 때의 보수적 기본 높이(px).
 * 폰 폭에서 바는 문구 두 줄(굵은 14px + 보조 11px 2줄) + 40px 버튼 줄 + 상하 여백으로 접힌다.
 * 모자라면 겹치고 남으면 여백일 뿐이므로 **넉넉한 쪽**으로 잡는다.
 */
export const DIRTY_BAR_FALLBACK_PX = 128;

type SharedTab = 'unfilled' | 'holdings' | 'log';

export interface SharedPanelsProps {
  /** 상태줄에서 고른 **단일 계좌**(D-13). 취소 요청의 계좌이기도 하다. */
  accountNo: string;
  /** 그 계좌의 병합된 상태. `null` = 스냅샷 전(빈 문구, 스피너 없음). */
  account: RelayAccountState | null;
  status: RelayStatus;
  /** 전 종목 전략 로그(최신이 index 0). `who` 에 종목명을 실으면 목업처럼 종목이 붙는다. */
  logEntries: readonly StrategyLogEntry[];
  /** 선택된 원주문번호 — 작업대가 소유한다. */
  selectedOrderNo: string | null;
  /** 행 선택 · 해제(`null`). 수동주문 폼 `selectedUnfilled` 의 원천이다(D-21). */
  onSelectUnfilled: (row: RelayUnfilled | null) => void;
  /** 더티 바가 떠 있는가 — 떠 있으면 그 높이만큼 비킨다(파일 상단 ⑤). */
  dirtyBarVisible: boolean;
  /** 미체결 행 출처 배지(「상따」/「수동」). 모르는 행은 `undefined` — 배지를 지어내지 않는다. */
  originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined;
  /** 종목별 현재가 — 모르는 종목은 `undefined`(평가손익 「—」). */
  priceOf?: (isin: string) => number | undefined;
  onCancelSubmitted?: (res: RelayOrderResultMsg) => void;
  className?: string;
}

/**
 * 떠 있는 더티 바의 실측 높이. 여러 장이면(카드 N개) 가장 큰 값이다.
 * 바가 없거나 높이가 0 이면 `DIRTY_BAR_FALLBACK_PX` — `visible` 은 상위가 아는 사실이므로
 * 「보인다는데 못 잰다」는 겹침 쪽으로 틀리지 않게 기본값으로 비킨다.
 */
function useDirtyBarReserve(visible: boolean): number | null {
  const [measured, setMeasured] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setMeasured(null);
      return;
    }
    const bars = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-slot="dirty-action-bar"]'));
    const measure = () => {
      const h = bars().reduce((max, el) => Math.max(max, el.offsetHeight), 0);
      setMeasured(h > 0 ? h : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    for (const el of bars()) ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  if (!visible) return null;
  return measured ?? DIRTY_BAR_FALLBACK_PX;
}

const TAB_TRIGGER =
  'h-7 flex-none rounded-[var(--r)] border border-transparent px-2.5 text-[length:var(--t-caption)] font-semibold whitespace-nowrap text-[var(--muted-fg)] shadow-none ' +
  'data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--accent-fg)] data-[state=active]:shadow-none ' +
  'dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-[var(--accent)] dark:data-[state=active]:text-[var(--accent-fg)]';

export function SharedPanels({
  accountNo,
  account,
  status,
  logEntries,
  selectedOrderNo,
  onSelectUnfilled,
  dirtyBarVisible,
  originOf,
  priceOf,
  onCancelSubmitted,
  className,
}: SharedPanelsProps) {
  const [tab, setTab] = useState<SharedTab>('unfilled');
  /** 폰 밴드 접힘 — 기본 접힘(파일 상단 ④). ≥700 에서는 이 값이 보이지 않는다. */
  const [folded, setFolded] = useState(true);
  const bodyId = useId();
  const reserve = useDirtyBarReserve(dirtyBarVisible);

  const unfilledCount = account?.unf.length ?? 0;
  const holdingCount = account?.hold.length ?? 0;

  /** 토글은 여기 한 곳 — 선택된 행을 다시 누르면 해제(`null`)를 올린다(③). */
  const handleSelect = useCallback(
    (row: RelayUnfilled) => {
      onSelectUnfilled(selectedOrderNo !== null && row.orderNo === selectedOrderNo ? null : row);
    },
    [onSelectUnfilled, selectedOrderNo],
  );

  const reserveStyle: CSSProperties | undefined =
    reserve === null ? undefined : { bottom: reserve, marginBottom: reserve };

  const embedProps = {
    selectedAccountNo: accountNo,
    account,
    status,
    priceOf,
    onCancelSubmitted,
  } as const;

  return (
    <section
      data-testid="shared-panels"
      aria-label="미체결 · 잔고 · 전략 로그"
      data-dirty-reserve={reserve === null ? undefined : 'true'}
      style={reserveStyle}
      className={cn(
        'min-w-0 border border-[var(--border)] bg-[var(--card)]',
        // 폰 밴드(<700) — 하단 sticky 접이식 바. 레이어는 z-20 이 상한이다(⑤).
        'sticky bottom-0 z-20 rounded-t-[var(--r-lg)] border-b-0 shadow-[0_-8px_24px_oklch(0_0_0/0.10)]',
        // wb ≥700 — 격자 아래 일반 섹션.
        '@min-[700px]/wb:static @min-[700px]/wb:z-auto @min-[700px]/wb:rounded-[var(--r-lg)] @min-[700px]/wb:border-b @min-[700px]/wb:shadow-none',
        className,
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SharedTab)}
        className="gap-0"
      >
        <div className="flex min-w-0 items-center gap-0.5 border-b border-[var(--border)] p-1.5 @min-[700px]/wb:gap-1 @min-[700px]/wb:px-2">
          <TabsList
            aria-label="공용 패널"
            className="h-auto min-w-0 gap-0.5 bg-transparent p-0 @min-[700px]/wb:gap-1"
          >
            <TabsTrigger value="unfilled" className={TAB_TRIGGER}>
              미체결 ({unfilledCount})
            </TabsTrigger>
            <TabsTrigger value="holdings" className={TAB_TRIGGER}>
              잔고 ({holdingCount})
            </TabsTrigger>
            <TabsTrigger value="log" className={TAB_TRIGGER}>
              전략 로그
            </TabsTrigger>
          </TabsList>
          {/* 폰 밴드 전용 접기 토글 — ≥700 에서는 접을 이유가 없다(일반 섹션). */}
          <button
            type="button"
            aria-expanded={!folded}
            aria-controls={bodyId}
            onClick={() => setFolded((f) => !f)}
            className="ml-auto h-7 flex-none rounded-[var(--r)] px-2 text-[length:var(--t-caption)] font-semibold whitespace-nowrap text-[var(--muted-fg)] hover:bg-[var(--muted)] @min-[700px]/wb:hidden"
          >
            {folded ? '펼치기 ▴' : '접기 ▾'}
          </button>
        </div>

        <div
          id={bodyId}
          data-slot="shared-panels-body"
          data-folded={folded ? 'true' : undefined}
          className={cn(
            'min-w-0 overflow-auto max-h-[40vh] @min-[700px]/wb:max-h-none',
            // 접힘은 폰 밴드에서만 본문을 숨긴다 — ≥700 은 언제나 보인다.
            folded && 'hidden @min-[700px]/wb:block',
          )}
        >
          <TabsContent value="unfilled" className="min-w-0">
            <AccountPanel
              {...embedProps}
              section="unfilled"
              originOf={originOf}
              selectedOrderNo={selectedOrderNo}
              onSelectUnfilled={handleSelect}
            />
          </TabsContent>
          <TabsContent value="holdings" className="min-w-0">
            <AccountPanel {...embedProps} section="holdings" />
          </TabsContent>
          <TabsContent value="log" className="min-w-0">
            <StrategyLog entries={logEntries} variant="embed" />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
