'use client';

/**
 * StrategyLog — 전략 로그 (16-UI-SPEC A13 · D3 · T-16-07).
 *
 * ① 무엇을 쌓는가
 *   **서버가 실제로 말한 것만** 쌓는다 — 상따 에코(`SetLimitChaserResp 60`)의 상태 전이와
 *   `ServerMessage(54)` 통지, 그리고 15:40 전략 일괄 비활성화(65)다. 「보냈다」는 사실은
 *   쌓지 않는다: 이 화면에서 보냄과 반영은 다른 사건이고, 보낸 것을 로그에 적으면 **반영되지
 *   않은 요청이 반영된 것처럼 읽힌다**(에코가 안 오는 것이 곧 거부다 — RESEARCH Pitfall 8).
 *
 * ② ★ 조용한 거부를 남기는 자리다 (T-16-07 · PC-7)
 *   서버는 거부를 응답 코드로 주지 않는다. `ServerMessage(level:"ERROR")` 가 유일한 통지라
 *   그것을 **상태줄과 이 로그 양쪽**에 남긴다. 상태줄은 최신 1건만 보여주고 지나가므로,
 *   「아까 뭐라고 떴었지」를 되짚을 수 있는 곳은 여기뿐이다.
 *
 * ③ 브라우저 메모리 전용이다 (T-16-02)
 *   서버에 저장하지 않고 새로고침하면 사라진다. 그 사실을 캡션으로 **고지**한다 —
 *   영구 기록으로 오해하면 사용자가 사후 확인을 이 화면에 의존한다.
 *
 * ④ 토스트를 쓰지 않는다 (D3)
 *   알림 채널은 상태줄 인라인 배너(6초) + 이 로그 2개뿐이다. Phase 15 D-36 이 이미
 *   「토스트가 아니라 상태 영역 누적」으로 고정했고 저장소에 토스트 라이브러리가 없다.
 *
 * ⑤ 문장 생성은 **순수 함수**다
 *   `strategyLogLine`/`serverMessageLogLine`/`strategiesDisabledLogLine` 이 그 지점이고
 *   컴포넌트는 문장을 짓지 않는다. 전이 판정을 렌더 안에 두면 같은 전이가 화면마다 다른
 *   문장이 되고, 무엇보다 **테스트할 수 없다**.
 */

import type { RelayLimitChaser, RelayServerMsg } from '@gh-radar/shared';

import { cn } from '@/lib/utils';

/** 로그 1줄. `level` 은 `--destructive` 텍스트 여부만 가른다(형태·문구가 이미 구분한다). */
export interface StrategyLogEntry {
  /** 렌더 키. 같은 초에 두 줄이 쌓여도 겹치지 않게 호출부가 만든다. */
  id: string;
  /** `HH:MM:SS` 로컬 시각. */
  at: string;
  text: string;
  level?: 'info' | 'error';
}

/**
 * 에코 상태 전이 종류.
 *
 * **닫힌 집합이다.** 새 전이를 추가하려면 이 유니온과 문구 표 양쪽을 고쳐야 하고, 그래야
 * 「문구는 있는데 아무도 만들지 않는 전이」/「전이는 나는데 문구가 없는 사건」이 안 생긴다.
 */
export type StrategyTransition =
  | 'registered'
  | 'deleted'
  | 'buyArmed'
  | 'buyFired'
  | 'buyDisarmed'
  | 'sellArmed'
  | 'sellDisarmed'
  | 'sellLatched'
  | 'sellUnlatched'
  | 'cancelArmed'
  | 'cancelDisarmed'
  | 'valuesApplied';

/** 전이 → 문장 조각. 순서는 아래 `TRANSITION_ORDER` 가 정한다. */
const TRANSITION_TEXT: Record<StrategyTransition, string> = {
  registered: '전략이 등록됐어요',
  deleted: '전략이 삭제됐어요 (매수·매도·자동취소가 모두 꺼졌어요)',
  buyArmed: '매수 무장',
  // ★ 무장 해제의 **이유**가 발주인지 사용자 조작인지는 에코만으로 알 수 없다(Pitfall 10).
  //   직전 발주 이력을 아는 호출부가 `hadOrder` 로 알려줄 때만 「발주」라고 쓴다.
  buyFired: '매수 발주 — 무장 해제',
  buyDisarmed: '매수 무장 해제',
  sellArmed: '매도 무장 — 대기 (지지벽 미관측)',
  sellDisarmed: '매도 무장 해제',
  sellLatched: '매도 진입 래치 ON — 감시 시작',
  sellUnlatched: '매도 진입 래치 해제',
  cancelArmed: '매수 미체결 자동취소 무장',
  cancelDisarmed: '매수 미체결 자동취소 해제',
  valuesApplied: '서버 반영 완료',
};

/** 한 줄 안에서의 조각 순서 — 매수 → 매도 → 취소 → 값. 배지 순서와 같은 축이다. */
const TRANSITION_ORDER: readonly StrategyTransition[] = [
  'registered',
  'deleted',
  'buyArmed',
  'buyFired',
  'buyDisarmed',
  'sellArmed',
  'sellDisarmed',
  'sellLatched',
  'sellUnlatched',
  'cancelArmed',
  'cancelDisarmed',
  'valuesApplied',
];

/** 취소 게이트 무장 여부 — 서버가 `&& cancelArmed` 로 접어 보내는 두 값의 합집합이다. */
function cancelArmedOf(item: RelayLimitChaser): boolean {
  return item.cancelQtyEnabled || item.cancelTradeEnabled;
}

/**
 * 값 축(게이트가 아닌 필드)이 바뀌었는가.
 *
 * 게이트 4종·래치를 뺀 나머지를 비교한다. 이 판정이 없으면 「수정」이 반영돼도 로그가
 * 비어 있어 사용자가 **반영 여부를 알 수 없다** — 반영의 유일한 증거가 에코이기 때문이다.
 */
function valuesChanged(prev: RelayLimitChaser, next: RelayLimitChaser): boolean {
  const skip = new Set<keyof RelayLimitChaser>([
    'buyEnabled',
    'sellEnabled',
    'sellEntryLatched',
    'cancelQtyEnabled',
    'cancelTradeEnabled',
    'crud',
    'key',
  ]);
  for (const k of Object.keys(next) as (keyof RelayLimitChaser)[]) {
    if (skip.has(k)) continue;
    if (prev[k] !== next[k]) return true;
  }
  return false;
}

/**
 * 에코 전이 → 로그 문장 (**순수 함수**). 바뀐 게 없으면 `null` 이다.
 *
 * `prev === null` 은 「이 전략을 처음 본다」는 뜻이다(첫 스냅샷·신규 등록).
 * `hadOrder` 는 「직전에 매수 발주가 나갔는가」다 — 와이어 필드가 아니라 화면이 아는
 * 사실이므로 호출부가 넘긴다. 없으면 「발주」라고 쓰지 않는다(거짓말하지 않는다).
 */
export function strategyLogLine(
  prev: RelayLimitChaser | null,
  next: RelayLimitChaser,
  opts: { hadOrder?: boolean } = {},
): string | null {
  const hit = new Set<StrategyTransition>();

  if (next.crud === 'D') {
    hit.add('deleted');
  } else if (prev === null) {
    hit.add('registered');
    if (next.buyEnabled) hit.add('buyArmed');
    if (next.sellEntryLatched) hit.add('sellLatched');
    else if (next.sellEnabled) hit.add('sellArmed');
  } else {
    if (!prev.buyEnabled && next.buyEnabled) hit.add('buyArmed');
    if (prev.buyEnabled && !next.buyEnabled) {
      hit.add(opts.hadOrder === true ? 'buyFired' : 'buyDisarmed');
    }
    if (!prev.sellEnabled && next.sellEnabled) hit.add('sellArmed');
    if (prev.sellEnabled && !next.sellEnabled) hit.add('sellDisarmed');
    if (!prev.sellEntryLatched && next.sellEntryLatched) hit.add('sellLatched');
    if (prev.sellEntryLatched && !next.sellEntryLatched) hit.add('sellUnlatched');
    if (!cancelArmedOf(prev) && cancelArmedOf(next)) hit.add('cancelArmed');
    if (cancelArmedOf(prev) && !cancelArmedOf(next)) hit.add('cancelDisarmed');
    if (valuesChanged(prev, next)) hit.add('valuesApplied');
  }

  if (hit.size === 0) return null;
  return TRANSITION_ORDER.filter((t) => hit.has(t))
    .map((t) => TRANSITION_TEXT[t])
    .join(' · ');
}

/**
 * `ServerMessage(54)` → 로그 문장 (**순수 함수**).
 *
 * ★ 레벨·발신 맥락을 **해석하지 않고 그대로** 실어 보낸다(D-36). 서버가 보낸 거부 사유가
 *   정적 문구표보다 언제나 더 유용하고, 우리가 모르는 사유를 「알 수 없는 오류」로 뭉개면
 *   사용자는 원인을 영원히 못 본다.
 */
export function serverMessageLogLine(msg: RelayServerMsg): {
  text: string;
  level: 'info' | 'error';
} {
  const isError = msg.lv === 'ERROR';
  const prefix = isError ? '서버가 거부했어요' : '서버 통지';
  const source = msg.src !== '' ? ` (${msg.src})` : '';
  return { text: `${prefix}${source} — ${msg.m}`, level: isError ? 'error' : 'info' };
}

/** 15:40 서버 자동 비활성화 (65) — UI-SPEC §동기화 문구 verbatim. */
export function strategiesDisabledLogLine(): string {
  return '서버가 모든 전략을 자동 비활성화했어요 (장 마감 규칙)';
}

export interface StrategyLogProps {
  /** 최신이 index 0. 상위가 누적을 소유한다(새로고침하면 사라지는 브라우저 메모리다). */
  entries: readonly StrategyLogEntry[];
  className?: string;
}

export function StrategyLog({ entries, className }: StrategyLogProps) {
  return (
    <section
      data-slot="strategy-log"
      className={cn(
        'min-w-0 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-3)]',
        className,
      )}
    >
      <h3 className="m-0 mb-[var(--s-2)] flex flex-wrap items-center gap-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
        전략 로그
        {/* ③ 고지 — 「영구 기록」으로 오해하면 사후 확인을 이 화면에 의존하게 된다. */}
        <span className="ml-auto text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]">
          서버 에코 기준 · 새로고침 시 지워져요
        </span>
      </h3>

      {entries.length === 0 ? (
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
          <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            아직 반영된 이벤트가 없어요
          </b>
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            스위치를 켜거나 값을 수정하면 서버 응답이 여기에 쌓여요.
          </span>
        </div>
      ) : (
        <ol
          data-slot="strategy-log-list"
          className="mono m-0 flex max-h-[160px] list-none flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-0 text-[11px] leading-[1.6]"
        >
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-slot="strategy-log-row"
              data-level={entry.level ?? 'info'}
              className="flex min-w-0 items-baseline gap-[var(--s-2)]"
            >
              <span className="flex-none text-[var(--muted-fg)]">{entry.at}</span>
              <span
                className={cn(
                  'min-w-0',
                  entry.level === 'error' ? 'text-[var(--destructive)]' : 'text-[var(--fg)]',
                )}
              >
                {entry.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
