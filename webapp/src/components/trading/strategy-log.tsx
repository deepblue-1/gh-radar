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
 *   서버에 저장하지 않고 새로고침하면 사라진다.
 *   ★ 그 사실을 **화면에 고지하지 않는다**(사용자 결정 260911-w5h). 옛 캡션
 *     (「서버 에코 기준 · 새로고침 시 지워져요」)은 제목 줄 우측에 붙어 모바일에서 제목을
 *     두 줄로 접었고, 그 상시 표시 문구는 어차피 다음번에 읽히지 않는다(T-16-86 과 같은
 *     이유다). **접는 비용이 고지의 값보다 컸다.** 이 사실 자체는 여기 주석으로만 남는다.
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

import { serverMsgBadge } from '@gh-radar/shared';
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
  /**
   * 종목명(선택) — 작업대 공용 패널처럼 **여러 종목의 로그가 한 목록에 섞이는** 표면에서만
   * 채운다(18-09 · 목업 `.log .who`). 종목 하나만 보는 옛 화면은 넘기지 않는다.
   */
  who?: string;
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
  | 'buyLatched'
  | 'buyUnlatched'
  | 'sellArmed'
  | 'sellDisarmed'
  | 'sellLatched'
  | 'sellUnlatched'
  | 'cancelArmed'
  | 'cancelDisarmed'
  | 'cancelLatched'
  | 'cancelUnlatched'
  | 'valuesApplied';

/**
 * 전이 → 문장 조각. 순서는 아래 `TRANSITION_ORDER` 가 정한다.
 *
 * ★ **공개 상수다** — 테스트가 두 표의 원소 집합이 정확히 같은지 직접 단언한다
 *   (`DIRTY_COMPARED_FIELDS` 와 같은 규율). 한쪽만 늘어나는 것이 이 파일의 대표 결함이다.
 */
export const TRANSITION_TEXT: Record<StrategyTransition, string> = {
  registered: '전략이 등록됐어요',
  deleted: '전략이 삭제됐어요 (매수·매도·자동취소가 모두 꺼졌어요)',
  buyArmed: '매수 무장',
  // ★ 무장 해제의 **이유**가 발주인지 사용자 조작인지는 에코만으로 알 수 없다(Pitfall 10).
  //   직전 발주 이력을 아는 호출부가 `hadOrder` 로 알려줄 때만 「발주」라고 쓴다.
  buyFired: '매수 발주 — 무장 해제',
  buyDisarmed: '매수 무장 해제',
  // 매수 래치는 **매수잔량 기준(`buyWatchSide "1"`) 갈래에만 존재한다**(BL-01). 매도잔량
  // 기준에서는 서버가 켜지도 보지도 않아 값이 언제나 false 라 전이가 나지 않는다.
  buyLatched: '매수 진입 래치 ON — 잔량 항 판정 시작',
  buyUnlatched: '매수 진입 래치 해제',
  sellArmed: '매도 무장 — 대기 (지지벽 미관측)',
  sellDisarmed: '매도 무장 해제',
  sellLatched: '매도 진입 래치 ON — 감시 시작',
  sellUnlatched: '매도 진입 래치 해제',
  cancelArmed: '매수 미체결 자동취소 무장',
  cancelDisarmed: '매수 미체결 자동취소 해제',
  cancelLatched: '취소 진입 래치 ON — 취소 판정 시작',
  cancelUnlatched: '취소 진입 래치 해제',
  valuesApplied: '서버 반영 완료',
};

/**
 * 한 줄 안에서의 조각 순서 — 매수 → 매도 → 취소 → 값. 배지 순서와 같은 축이다.
 *
 * 래치 2종은 각 축의 **무장·해제 뒤**에 놓는다(매도가 이미 그 배치다) — 세 축이 같은
 * 내부 순서를 쓰면 사용자가 줄을 읽는 방식이 축마다 달라지지 않는다.
 */
export const TRANSITION_ORDER: readonly StrategyTransition[] = [
  'registered',
  'deleted',
  'buyArmed',
  'buyFired',
  'buyDisarmed',
  'buyLatched',
  'buyUnlatched',
  'sellArmed',
  'sellDisarmed',
  'sellLatched',
  'sellUnlatched',
  'cancelArmed',
  'cancelDisarmed',
  'cancelLatched',
  'cancelUnlatched',
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
    /*
      ★ 래치 2종도 게이트 축이다 (17-11 / D-23 · T-17-39). 빠지면 **사용자가 켜지도 않은**
        래치 변화가 「서버 반영 완료」로 보고돼, 자기가 하지 않은 수정이 반영된 줄 안다.
        래치 자체는 바로 위 전이 4종이 각자의 문장으로 말한다.
    */
    'cancelEntryLatched',
    'buyEntryLatched',
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
    /*
      ★ 첫 스냅샷의 규율은 **세 축이 같다** (17-11 / 계획 ④ 「실측해서 같은 규율을 쓴다」).
        기존 매도가 하던 그대로 — 래치가 켜져 있으면 래치 문장을, 아니면 무장 문장을 쓴다.
        한 축만 다르게 두면 같은 상태가 축마다 다르게 보고되고, 그 차이를 사용자는
        「취소는 아직 안 켜졌나 보다」로 읽는다.
    */
    if (next.buyEntryLatched) hit.add('buyLatched');
    else if (next.buyEnabled) hit.add('buyArmed');
    if (next.sellEntryLatched) hit.add('sellLatched');
    else if (next.sellEnabled) hit.add('sellArmed');
    if (next.cancelEntryLatched) hit.add('cancelLatched');
    else if (cancelArmedOf(next)) hit.add('cancelArmed');
  } else {
    if (!prev.buyEnabled && next.buyEnabled) hit.add('buyArmed');
    if (prev.buyEnabled && !next.buyEnabled) {
      hit.add(opts.hadOrder === true ? 'buyFired' : 'buyDisarmed');
    }
    if (!prev.buyEntryLatched && next.buyEntryLatched) hit.add('buyLatched');
    if (prev.buyEntryLatched && !next.buyEntryLatched) hit.add('buyUnlatched');
    if (!prev.sellEnabled && next.sellEnabled) hit.add('sellArmed');
    if (prev.sellEnabled && !next.sellEnabled) hit.add('sellDisarmed');
    if (!prev.sellEntryLatched && next.sellEntryLatched) hit.add('sellLatched');
    if (prev.sellEntryLatched && !next.sellEntryLatched) hit.add('sellUnlatched');
    if (!cancelArmedOf(prev) && cancelArmedOf(next)) hit.add('cancelArmed');
    if (cancelArmedOf(prev) && !cancelArmedOf(next)) hit.add('cancelDisarmed');
    if (!prev.cancelEntryLatched && next.cancelEntryLatched) hit.add('cancelLatched');
    if (prev.cancelEntryLatched && !next.cancelEntryLatched) hit.add('cancelUnlatched');
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
 * ★ 17-11 — 출처 **배지**가 접두로 붙는다(D-17). 판정은 shared 의 `serverMsgBadge`
 *   하나뿐이고 이 파일에서 `src` 를 직접 비교하지 않는다 — 비교를 여기 다시 쓰면 서버
 *   어휘가 늘 때마다 상태바·VI 화면과 갈린다.
 */
export function serverMessageLogLine(msg: RelayServerMsg): {
  text: string;
  level: 'info' | 'error';
} {
  const isError = msg.lv === 'ERROR';
  const prefix = isError ? '서버가 거부했어요' : '서버 통지';
  const badge = serverMsgBadge(msg.src);
  /*
    ★ 배지가 출처를 **이름으로** 말하는 어휘(`[상따]`·`[VI]`)면 원문 `src` 를 덧붙이지
      않는다 — 같은 말을 두 번 하는 줄이 된다. 배지가 `[서버]`(모르는 출처) 로 떨어질 때만
      원문이 유일한 단서이므로 남긴다. 판정 입력은 **배지의 반환값**이지 `src` 문자열이
      아니다 — 어휘가 늘어도 이 줄은 고칠 것이 없다.
  */
  const named = badge !== serverMsgBadge('');
  const source = !named && msg.src !== '' ? ` (${msg.src})` : '';
  return { text: `${badge} ${prefix}${source} — ${msg.m}`, level: isError ? 'error' : 'info' };
}

/** 15:40 서버 자동 비활성화 (65) — UI-SPEC §동기화 문구 verbatim. */
export function strategiesDisabledLogLine(): string {
  return '서버가 모든 전략을 자동 비활성화했어요 (장 마감 규칙)';
}

export interface StrategyLogProps {
  /** 최신이 index 0. 상위가 누적을 소유한다(새로고침하면 사라지는 브라우저 메모리다). */
  entries: readonly StrategyLogEntry[];
  /**
   * `'embed'` = 작업대 공용 패널의 「전략 로그」 탭 (18-09 / D-13).
   *   탭 라벨이 제목을 대신하므로 카드 테두리·제목이 없고, 목록 높이 상한도 없다(패널 본문이
   *   스크롤을 소유한다). 빈 문구는 UI-SPEC §공용 패널 「아직 기록이 없어요」.
   *   메시지는 **clamp 없이 줄바꿈**한다(`min-w-0` + `word-break:keep-all`, Q-4) — 로그는
   *   읽히는 것이 목적이다.
   * 기본 `'card'` 는 기존 화면 그대로다.
   */
  variant?: 'card' | 'embed';
  /**
   * `'embed'` 빈 상태 제목 override (quick-260923-onn — 작업대 카드 「로그」 탭은 「로그 없음」).
   * 넘기지 않으면 종전 「아직 기록이 없어요」 그대로다.
   */
  emptyTitle?: string;
  className?: string;
}

export function StrategyLog({ entries, variant = 'card', emptyTitle, className }: StrategyLogProps) {
  if (variant === 'embed') {
    return (
      <section data-slot="strategy-log" data-variant="embed" className={cn('min-w-0', className)}>
        {entries.length === 0 ? (
          <div className="m-[var(--s-3)] rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
            <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              {emptyTitle ?? '아직 기록이 없어요'}
            </b>
          </div>
        ) : (
          <ol
            data-slot="strategy-log-list"
            className="m-0 flex list-none flex-col gap-0.5 px-[var(--s-3)] py-1.5 text-[11px] leading-[1.7]"
          >
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-slot="strategy-log-row"
                data-level={entry.level ?? 'info'}
                className="flex min-w-0 items-baseline gap-[var(--s-2)]"
              >
                <span className="mono flex-none text-[var(--muted-fg)]">{entry.at}</span>
                {entry.who !== undefined && entry.who !== '' && (
                  <span className="flex-none font-semibold text-[var(--fg)]">{entry.who}</span>
                )}
                <span
                  data-slot="strategy-log-msg"
                  className={cn(
                    'min-w-0 [word-break:keep-all] [overflow-wrap:anywhere]',
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

  return (
    <section
      data-slot="strategy-log"
      className={cn(
        'min-w-0 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-3)]',
        className,
      )}
    >
      {/* 캡션이 사라져 `flex-wrap`/`gap`/`ml-auto` 가 필요 없다 — 제목 한 줄이다. */}
      <h3 className="m-0 mb-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
        전략 로그
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
          /*
            ★ `mono` 는 **시각 `<span>` 에만** 건다 (260911-w5h). 목록 전체를 mono 로 두면
              한글 로그 문장이 자간이 벌어진 채 읽히고, 좁은 폭에서 두세 줄로 접힌다.
              세로로 줄을 맞춰야 하는 것은 시각뿐이다.
          */
          className="m-0 flex max-h-[160px] list-none flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-0 text-[11px] leading-[1.6]"
        >
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-slot="strategy-log-row"
              data-level={entry.level ?? 'info'}
              className="flex min-w-0 items-baseline gap-[var(--s-2)]"
            >
              <span className="mono flex-none text-[var(--muted-fg)]">{entry.at}</span>
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
