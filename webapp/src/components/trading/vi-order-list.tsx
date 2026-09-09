'use client';

/**
 * ViOrderList — VI 주문내역 (UI-SPEC B5·B6 · §VI 주문 상태 배지, TRADE-02 · D-10).
 *
 * ① 무엇을 그리는가
 *   데스크톱(≥1280) **9열 표**(확인·시각·종목·발동가·상승률·주문가·수량·상태·110초) /
 *   그 아래 폭에서는 **카드 행**. 두 트리는 항상 DOM 에 있고 폭 판정은 전부 CSS 다 —
 *   `account-panel.tsx` ⑧ 과 같은 규율이라 조회할 때는 트리를 좁혀야 한다.
 *
 * ② ★ 부분체결은 **서버 상태가 아니라 파생**이다
 *   와이어 `state` 는 6종(`Pending`·`Accepted`·`Cancelling`·`Cancelled`·`Filled`·`Rejected`)
 *   이고 `PartiallyFilled` 라는 값은 **오지 않는다.** 부분체결은 `state === "Accepted" ∧
 *   filledQty > 0` 로 화면이 만든다. 서버 값으로 착각해 `state === "PartiallyFilled"` 를
 *   비교하면 **어떤 행도 부분체결로 보이지 않는다**(항상 거짓인 비교라 조용히 지나간다).
 *
 * ③ ★ 확인 체크는 즉시 전송이고 **더티 대상이 아니다** (D-10)
 *   `ConfirmVIOrderReq(33)` 은 바꾸는 즉시 나간다. 서버는 확인 응답을 따로 주지 않고
 *   **73(`vi.list` 델타)** 으로 정정한다 — 그래서 낙관 반영 후 73 을 기다리고,
 *   ★ **타임아웃 UI 를 만들지 않는다.** 서버 무응답이 정상 경로인 자리에 「실패」를 쓰면
 *     사용자가 되돌리려고 다시 눌러 반대 값을 보낸다.
 *
 * ④ ★ 체크할 수 없는 행이 있다
 *   - `orderNo === ""`(접수 전): 빈 주문번호의 확인은 **서버가 응답 없이 드롭**한다.
 *     보내 봐야 아무 일도 일어나지 않으므로 애초에 열지 않는다.
 *   - `confirmLocked === true`: **서버 계산값**이다. 클라가 119초를 다시 재지 않는다.
 *   둘 다 `disabled` + `aria-disabled` + `opacity:.35` 이고 tab 순서에서 빠진다.
 *
 * ⑤ ★ 데드라인 진행바에 전이(애니메이션)를 걸지 않는다 (B6 · C4)
 *   1초마다 잔여가 바뀌는데 폭에 전이를 걸면 바가 **항상 실제보다 뒤처진 값**을 보여 준다.
 *   20초 경계에서 색이 바뀌는 순간이 이 화면에서 가장 중요한 1초인데, 그 순간을 전이가
 *   흐린다. 그래서 이 파일에는 폭·색 어디에도 전이가 없다.
 *
 * ⑥ ★ 시각은 로케일 포맷터로 만들지 않는다 (16-13 실측)
 *   `toLocaleTimeString("ko-KR", { hour12: false })` 는 Chromium 에서 `0시 57분 16초` 를
 *   돌려준다. 표의 시각 열은 `.mono` 고정폭 계약이라 한글 조사가 섞이면 매 초 열 폭이
 *   달라진다. 자리수를 직접 채운다.
 *
 * ⑦ ★ 접수 전 행의 키는 주문번호가 아니다
 *   `orderNo` 가 `""` 라 그대로 키로 쓰면 **서로 다른 종목의 접수 전 행이 한 줄로 겹친다.**
 *   병합기(`use-relay-socket.ts`)가 쓰는 `viOrderKey` 를 그대로 가져다 쓴다 — 규칙을 여기
 *   다시 적으면 목록이 두 모양이 된다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RelayViOrderItem, RelayViOrderState } from '@gh-radar/shared';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRelayContext } from '@/lib/relay-provider';
import { viOrderKey } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

/** 서버 자동취소 창(초). 진행바의 분모이자 접수 시각 역산의 기준이다. */
export const VI_DEADLINE_SECONDS = 110;

/** 「임박」 전환점(초) — UI-SPEC C4 2단계. ≥20 중립 / <20 `--destructive`. */
export const VI_DEADLINE_HOT_SECONDS = 20;

/** 카드 헤더 우측 캡션 · 하단 고지 — UI-SPEC §VI 라벨 verbatim. */
export const VI_ORDER_LIST_CAPTION = '확인 체크 = 119초 미확인 취소 면제';
export const VI_ORDER_LIST_TIP =
  '110초 미도달 취소는 서버 규칙이라 면제되지 않아요 · 접수 전(주문번호 없음)은 확인할 수 없어요';

/** 상태 배지 1건의 표시 계약. 색·형태·텍스트 **3중**이라 색맹·흑백에서도 읽힌다. */
interface StateFace {
  label: string;
  /** 도트 형태 — 색 없이 상태를 가르는 축이다. */
  dot: 'solid' | 'hollow';
  className: string;
}

const NEUTRAL_FACE = 'bg-[var(--muted)] text-[var(--muted-fg)] border-transparent';

/**
 * 서버 상태 → 배지 얼굴. **부분체결은 여기 없다**(②) — 파생이라 `stateFaceOf` 가 만든다.
 *
 * `Cancelling` 은 UI-SPEC 배지 표에 없지만 와이어에는 있는 값이다. 표에 없다고 빈 배지를
 * 그리면 사용자는 그 행의 상태를 읽을 방법이 없다 — 중립 「취소 중」으로 말한다.
 */
const STATE_FACES: Record<RelayViOrderState, StateFace> = {
  Pending: { label: '접수 전', dot: 'hollow', className: NEUTRAL_FACE },
  // 「접수」만 중립 **강조**(`--fg` 텍스트 + 채운 도트) — 지금 살아 있는 주문이라는 뜻이다.
  Accepted: { label: '접수', dot: 'solid', className: 'bg-[var(--muted)] text-[var(--fg)] border-transparent' },
  Cancelling: { label: '취소 중', dot: 'solid', className: NEUTRAL_FACE },
  Cancelled: { label: '취소', dot: 'solid', className: NEUTRAL_FACE },
  Filled: { label: '체결', dot: 'solid', className: 'bg-[var(--up-bg)] text-[var(--up)] border-transparent' },
  Rejected: {
    label: '거부',
    dot: 'solid',
    className: 'bg-transparent text-[var(--destructive)] border-[var(--destructive)]',
  },
};

/**
 * 행 1건의 배지 얼굴 (**순수 함수**).
 *
 * ★ 부분체결 판정은 `state === "Accepted" && filledQty > 0` 다. 서버가 보내는 상태가 아니다(②).
 */
export function stateFaceOf(item: Pick<RelayViOrderItem, 'state' | 'filledQty' | 'orderQty'>): StateFace {
  if (item.state === 'Accepted' && item.filledQty > 0) {
    return {
      label: `부분체결 ${NUM.format(item.filledQty)}/${NUM.format(item.orderQty)}`,
      dot: 'solid',
      className: 'bg-[var(--up-bg)] text-[var(--up)] border-transparent',
    };
  }
  return (
    STATE_FACES[item.state] ?? {
      // 스키마 밖 값이 와도 화면이 비지 않는다 — 원문을 그대로 보여 준다.
      label: String(item.state),
      dot: 'hollow',
      className: NEUTRAL_FACE,
    }
  );
}

/**
 * 확인 체크를 열 수 있는가 — **잠금 판정의 유일 지점**이다 (④).
 *
 * 체크박스의 `disabled` 와 전송 가드가 **같은 함수**를 쓴다. 두 곳에 따로 적으면 한쪽만
 * 고쳐지고, 그때 뚫리는 것이 「비활성인데 눌리면 나가는 확인」이다 — 그 확인은 119초
 * 자동취소 면제라 되돌릴 수 없다.
 */
export function isConfirmable(
  item: Pick<RelayViOrderItem, 'orderNo' | 'confirmLocked'>,
  disabled = false,
): boolean {
  if (disabled) return false;
  // 빈 주문번호의 확인은 서버가 응답 없이 드롭한다 — 보내 봐야 아무 일도 없다.
  if (item.orderNo === '') return false;
  // 서버 계산값이다. 클라가 119초를 다시 재지 않는다.
  return !item.confirmLocked;
}

/** 110초 자동취소까지 남은 **초**. 음수는 0 이다(지난 것은 「0초」이지 「-3초」가 아니다). */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  if (deadlineMs <= 0) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** 진행바를 그리는 행인가 — `Accepted` ∧ 잔여>0 뿐이다(B6). */
function hasDeadline(item: RelayViOrderItem, nowMs: number): boolean {
  return item.state === 'Accepted' && remainingSeconds(item.deadline110Ms, nowMs) > 0;
}

/**
 * `HH:MM:SS` — **로케일 포맷터를 쓰지 않는다**(⑥).
 * 접수 시각은 `deadline110Ms − 110초` 로 역산한다. 와이어에 수신 시각 필드가 없고,
 * 브라우저 도착 시각을 쓰면 새로고침할 때마다 같은 주문의 시각이 달라진다.
 */
export function acceptedClock(deadline110Ms: number): string | null {
  if (deadline110Ms <= 0) return null;
  const at = new Date(deadline110Ms - VI_DEADLINE_SECONDS * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** 전일대비 상승률(%). 기준가를 모르면 null 이다 — 0 으로 나눈 값을 지어내지 않는다. */
export function changeRateOf(triggerPrice: number, basePrice: number): number | null {
  if (basePrice <= 0) return null;
  return ((triggerPrice - basePrice) / basePrice) * 100;
}

export interface ViOrderListProps {
  items: readonly RelayViOrderItem[];
  /** 세션이 준비되지 않았다 — 체크를 열지 않는다. */
  disabled?: boolean;
  /** 스냅샷 수신 전. 빈 목록과 구분해 스켈레톤을 그린다. */
  loading?: boolean;
  /**
   * 데드라인 계산 기준 시각(ms). **테스트·스토리 전용**이고 넘기지 않으면 1초 틱을 돈다.
   * 넘기면 내부 타이머를 아예 걸지 않는다 — 두 시계가 겹치면 단언이 흔들린다.
   */
  nowMs?: number;
  className?: string;
}

export function ViOrderList({ items, disabled = false, loading = false, nowMs, className }: ViOrderListProps) {
  const { send } = useRelayContext();
  const now = useNow(nowMs);

  /* ── 낙관 반영 + 중복 클릭 잠금 (③) ──────────────────────────────── */

  /** 보낸 값. 73 이 같은 값으로 정정하면 지운다. 이 값이 있는 동안 화면은 낙관값을 보여 준다. */
  const [optimistic, setOptimistic] = useState<ReadonlyMap<string, boolean>>(new Map());
  /** 전송 중 주문번호 — 같은 행의 연타를 막는다(정정이 오면 풀린다). */
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (optimistic.size === 0 && sending.size === 0) return;
    const byOrderNo = new Map(items.filter((i) => i.orderNo !== '').map((i) => [i.orderNo, i]));
    const nextOptimistic = new Map(optimistic);
    const nextSending = new Set(sending);
    let changed = false;

    for (const [orderNo, wanted] of optimistic) {
      const item = byOrderNo.get(orderNo);
      if (item === undefined) continue;
      // 정정 완료 = 서버가 원하는 값으로 왔거나, 잠겨서 더는 바꿀 수 없게 됐다.
      if (item.confirmed === wanted || item.confirmLocked) {
        nextOptimistic.delete(orderNo);
        nextSending.delete(orderNo);
        changed = true;
      }
    }
    if (changed) {
      setOptimistic(nextOptimistic);
      setSending(nextSending);
    }
  }, [items, optimistic, sending]);

  const toggle = useCallback(
    (item: RelayViOrderItem, next: boolean) => {
      // ④ 보내 봐야 서버가 드롭하거나 거부하는 행은 애초에 보내지 않는다.
      if (!isConfirmable(item, disabled)) return;
      if (sending.has(item.orderNo)) return; // 연타 1회화
      // 세션 가드는 위 `isConfirmable(item, disabled)` 안에 있다 — `disabled` ←
      // `vi-client.tsx` `ViSurface` 의 `<ViOrderList disabled={!sessionReady}>`,
      // `sessionReady = status === 'ready'`(16-19 감사).
      send({ t: 'vi.confirm', orderNo: item.orderNo, confirmed: next });
      setOptimistic((prev) => new Map(prev).set(item.orderNo, next));
      setSending((prev) => new Set(prev).add(item.orderNo));
    },
    [disabled, send, sending],
  );

  const rows = useMemo(
    () =>
      items.map((item) => {
        const key = viOrderKey(item);
        const locked = !isConfirmable(item, disabled);
        return {
          key,
          item,
          face: stateFaceOf(item),
          checked: optimistic.get(item.orderNo) ?? item.confirmed,
          locked,
          remaining: remainingSeconds(item.deadline110Ms, now),
          live: hasDeadline(item, now),
          label: item.name !== undefined && item.name !== '' ? item.name : item.isin,
        };
      }),
    [items, optimistic, disabled, now],
  );

  return (
    <section
      data-slot="vi-order-list"
      className={cn(
        'flex min-w-0 flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-3)]',
        className,
      )}
    >
      <h3 className="m-0 mb-[var(--s-2)] flex flex-wrap items-center gap-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
        VI 주문내역
        <span className="ml-auto text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]">
          {VI_ORDER_LIST_CAPTION}
        </span>
      </h3>

      {loading ? (
        <div aria-busy="true" data-slot="vi-order-skeleton" className="flex flex-col gap-[var(--s-1)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 rounded-[var(--r-md)] bg-[var(--muted)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div
          data-slot="vi-order-empty"
          className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center"
        >
          <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            오늘 발동된 VI 주문이 없어요
          </b>
          <span className="block text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            가동 중이면 조건에 맞는 VI 발동 종목이 여기에 쌓여요.
          </span>
        </div>
      ) : (
        <>
          {/* ── 데스크톱(≥1280) 9열 표 ── */}
          <div data-slot="vi-order-table" className="max-[1279px]:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">확인</TableHead>
                  <TableHead scope="col">시각</TableHead>
                  <TableHead scope="col">종목</TableHead>
                  <TableHead scope="col" className="num">발동가</TableHead>
                  <TableHead scope="col" className="num">상승률</TableHead>
                  <TableHead scope="col" className="num">주문가</TableHead>
                  <TableHead scope="col" className="num">수량</TableHead>
                  <TableHead scope="col">상태</TableHead>
                  <TableHead scope="col">110초</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key} data-slot="vi-order-row" data-state={row.item.state}>
                    <TableCell>
                      <ConfirmCheck row={row} onToggle={toggle} />
                    </TableCell>
                    <TableCell className="mono text-[length:var(--t-caption)]">
                      {acceptedClock(row.item.deadline110Ms) ?? '—'}
                    </TableCell>
                    <TableCell className="min-w-0 text-[length:var(--t-caption)]">
                      <span className="block min-w-0 truncate font-semibold text-[var(--fg)]">
                        {row.label}
                      </span>
                    </TableCell>
                    <TableCell className="num mono text-[length:var(--t-caption)]">
                      {NUM.format(row.item.triggerPrice)}
                    </TableCell>
                    <TableCell className="num mono text-[length:var(--t-caption)]">
                      <ChangeRate triggerPrice={row.item.triggerPrice} basePrice={row.item.basePrice} />
                    </TableCell>
                    <TableCell className="num mono text-[length:var(--t-caption)]">
                      {NUM.format(row.item.orderPrice)}
                    </TableCell>
                    <TableCell className="num mono text-[length:var(--t-caption)]">
                      {NUM.format(row.item.orderQty)}
                      {row.item.filledQty > 0 && (
                        <small className="ml-1 text-[var(--muted-fg)]">
                          ({NUM.format(row.item.filledQty)})
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      <StateBadge face={row.face} />
                    </TableCell>
                    <TableCell>
                      {row.live ? (
                        <DeadlineMeter remaining={row.remaining} confirmed={row.checked} compact />
                      ) : (
                        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ── 모바일(<1280) 카드 행 ── (R6 — 9열 표는 390px 에서 조용히 잘린다) */}
          <div
            data-slot="vi-order-cards"
            className="flex flex-col gap-[var(--s-2)] min-[1280px]:hidden"
          >
            {rows.map((row) => (
              <div
                key={row.key}
                data-slot="vi-order-row"
                data-state={row.item.state}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[var(--s-2)] rounded-[var(--r-md)] border border-[var(--border)] p-[var(--s-2)] [&>*]:min-w-0"
              >
                <ConfirmCheck row={row} onToggle={toggle} />
                {/* 종목명이 이 행에서 **유일하게 늘어나는 항목**이다(C7 규율). */}
                <span className="min-w-0">
                  <b className="block min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                    {row.label}
                  </b>
                  <small className="mono block text-[11px] font-normal text-[var(--muted-fg)]">
                    {acceptedClock(row.item.deadline110Ms) ?? '—'}
                  </small>
                </span>
                <span className="flex-none">
                  <StateBadge face={row.face} />
                </span>

                <div className="col-span-3 flex min-w-0 flex-wrap gap-x-[var(--s-2)] gap-y-1 text-[11px] text-[var(--muted-fg)]">
                  <span className="flex-none">
                    발동가{' '}
                    <b className="mono font-semibold text-[var(--fg)]">
                      {NUM.format(row.item.triggerPrice)}
                    </b>
                  </span>
                  <span className="mono flex-none font-semibold">
                    <ChangeRate triggerPrice={row.item.triggerPrice} basePrice={row.item.basePrice} />
                  </span>
                  <span className="flex-none">
                    주문{' '}
                    <b className="mono font-semibold text-[var(--fg)]">
                      {NUM.format(row.item.orderPrice)}
                    </b>{' '}
                    × <b className="mono font-semibold text-[var(--fg)]">{NUM.format(row.item.orderQty)}</b>주
                  </span>
                </div>

                {row.live && (
                  <div className="col-span-3 min-w-0">
                    <DeadlineMeter remaining={row.remaining} confirmed={row.checked} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p data-slot="vi-order-tip" className="m-0 mt-[var(--s-2)] text-[11px] text-[var(--muted-fg)]">
        {VI_ORDER_LIST_TIP}
      </p>
    </section>
  );
}

/* ───────────────────────────── 조각 ───────────────────────────── */

interface RowView {
  key: string;
  item: RelayViOrderItem;
  face: StateFace;
  checked: boolean;
  locked: boolean;
  remaining: number;
  live: boolean;
  label: string;
}

/**
 * 확인 체크 (③·④). 표와 카드가 **같은 조각**을 쓴다 — 두 벌이면 한쪽만 잠금 규칙을 잃는다.
 *
 * `aria-label` 이 「무엇이 면제되는지」까지 말한다. 「확인」만으로는 이 체크가 119초 자동취소를
 * 푼다는 사실이 스크린리더에 전달되지 않는다.
 */
function ConfirmCheck({
  row,
  onToggle,
}: {
  row: RowView;
  onToggle: (item: RelayViOrderItem, next: boolean) => void;
}) {
  return (
    <Checkbox
      checked={row.checked}
      disabled={row.locked}
      aria-disabled={row.locked || undefined}
      aria-label={`${row.label} 주문 확인 — 119초 미확인 취소 면제`}
      onCheckedChange={(next) => onToggle(row.item, next === true)}
      // 잠긴 행은 눈으로도 명백히 죽어 있어야 한다(UI-SPEC B5 `opacity:.35`).
      className="size-[22px] flex-none rounded-[5px] disabled:opacity-[0.35]"
    />
  );
}

/** 상태 배지 — 색 + 도트 형태 + 텍스트 3중(WCAG 1.4.1). */
function StateBadge({ face }: { face: StateFace }) {
  return (
    <span
      data-slot="vi-state-badge"
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border px-[5px] text-[11px] font-semibold whitespace-nowrap',
        face.className,
      )}
    >
      <span
        aria-hidden="true"
        data-dot={face.dot}
        className={cn(
          'block shrink-0 rounded-full',
          face.dot === 'solid' ? 'size-[5px] bg-current' : 'size-[7px] border-[1.5px] border-current',
        )}
      />
      {face.label}
    </span>
  );
}

/**
 * 데드라인 진행바 (B6 · C4).
 *
 * ★ 진행바 role 선언은 이 파일에서 **여기 한 곳뿐**이다 — 표·카드가 같은 조각을 쓰므로
 *   접근성 계약이 한 번만 정의된다.
 * ★ 폭에도 색에도 **전이가 없다**(⑤). 20초 경계에서 숫자와 색이 같은 프레임에 바뀐다.
 */
function DeadlineMeter({
  remaining,
  confirmed,
  compact = false,
}: {
  remaining: number;
  confirmed: boolean;
  /** 표 셀용 — 진행바 없이 숫자만. 9열 표에서 바를 넣으면 열이 밀린다. */
  compact?: boolean;
}) {
  const hot = remaining < VI_DEADLINE_HOT_SECONDS;
  const percent = Math.max(0, Math.min(100, Math.round((remaining / VI_DEADLINE_SECONDS) * 100)));
  const tone = hot ? 'text-[var(--destructive)]' : 'text-[var(--muted-fg)]';

  /*
    표 셀(9열)에서는 **숫자만** 그린다 — 목업 정본이 그렇고, 「110초 취소까지」를 열 안에
    넣으면 열 폭이 두 배가 되어 9열이 992px 를 넘는다. 그 문맥은 열 머리(`110초`)가 준다.
    색 2단계는 두 표면이 **같은 값**으로 갈린다.
  */
  if (compact) {
    return (
      <span
        data-slot="vi-deadline"
        data-hot={hot ? 'true' : 'false'}
        className={cn('mono text-[11px] font-semibold whitespace-nowrap', tone)}
      >
        {remaining}초
      </span>
    );
  }

  return (
    <div
      data-slot="vi-deadline"
      data-hot={hot ? 'true' : 'false'}
      className={cn('flex min-w-0 items-center gap-[var(--s-2)] text-[11px]', tone)}
    >
      <span className="flex-none whitespace-nowrap">
        110초 취소까지 <b className="mono font-semibold">{remaining}초</b>
      </span>
      <div
        role="progressbar"
        aria-label="110초 자동취소까지 남은 시간"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={VI_DEADLINE_SECONDS}
        className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-[var(--muted)]"
      >
        {/* 폭은 인라인 style 이다 — 매 초 바뀌는 값이라 클래스로는 표현되지 않고,
            계산값(`getComputedStyle`)으로 단언할 수 있어야 규칙이 지워진 것을 잡는다. */}
        <span
          aria-hidden="true"
          data-slot="vi-deadline-fill"
          className={cn('block h-full', hot ? 'bg-[var(--destructive)]' : 'bg-[var(--muted-fg)]')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="flex-none whitespace-nowrap">
        {confirmed ? '확인됨' : '미확인 → 119초 취소'}
      </span>
    </div>
  );
}

/** 전일대비 상승률. 모르면 `—` 다 — 0 으로 나눈 값을 지어내지 않는다. */
function ChangeRate({ triggerPrice, basePrice }: { triggerPrice: number; basePrice: number }) {
  const rate = changeRateOf(triggerPrice, basePrice);
  if (rate === null) return <span className="text-[var(--muted-fg)]">—</span>;
  return (
    <span className={rate > 0 ? 'text-[var(--up)]' : rate < 0 ? 'text-[var(--down)]' : 'text-[var(--flat)]'}>
      {rate > 0 ? '+' : ''}
      {rate.toFixed(1)}%
    </span>
  );
}

/**
 * 1초 틱. `override` 가 있으면 **타이머를 아예 걸지 않는다** — 두 시계가 겹치면
 * 테스트가 자기가 정한 시각과 실제 시각 사이에서 흔들린다.
 */
function useNow(override?: number): number {
  const [now, setNow] = useState(() => override ?? Date.now());

  useEffect(() => {
    if (override !== undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [override]);

  return override ?? now;
}
