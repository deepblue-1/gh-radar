"use client";

/**
 * CardGrid — `/trading` 작업대의 **카드 격자** (UI-SPEC §레이아웃 계약 9 · §접근성 「포커스 순서 —
 * 카드 격자」 · D-09 · D-28 · E6, TRADE-09). 정본은 채택 목업 `18-workbench-mockup.html`
 * `.cards`/`.stack`(CSS `:365-373` · 렌더 `renderCards()` `:1089-1096`).
 *
 * ① 정렬 규칙은 **한 가지**다 (D-09)
 *   펼친 카드는 각각 한 칸, 접힌 카드는 전부 **스택 한 칸**에 세로로(gap 8px). 렌더 순서는
 *   펼친 카드들 → 스택이고, 같은 무리 안에서는 받은 순서를 지킨다. DOM 순서가 곧 포커스 순서다.
 *   - 접힌 카드가 0장이면 스택 칸 자체가 없다.
 *   - 스택 위에 라벨이 없다(목업의 `.stack-lab` 은 채택안에서 쓰지 않는다 — 「쓸데없는 라벨링」).
 *   - 펼침/접힘은 **재렌더**다 — 움직임 효과를 두지 않는다. 헤더 클릭 한 번에 카드가 스택과 격자
 *     사이를 옮겨 간다. 옮겨 가는 것은 DOM 자리뿐이고, 카드의 React 부모는 바뀌지 않아 마운트가
 *     유지된다(⑤).
 *
 * ② 열 수는 page 컨테이너(`@container/wb`, 작업대 루트가 선언) 쿼리로만 바뀐다 (D-04 · D-28)
 *   기본(page <680)은 언제나 1열이고, `cols` 2/3 의 열 지정은 680 이상에서만 걸린다 —
 *   목업 `@container page (min-width:700px) { .cards[data-cols="2"] … }` 과 같은 뜻이다.
 *   이 파일은 폭을 JS 로 재지 않고, 뷰포트 브레이크포인트를 쓰지 않는다. 밴드 수치의 정본은
 *   `globals.css` §2.2b 다.
 *
 * ③ 포커스 규율 (UI-SPEC §접근성)
 *   - 접기/펼치기: 토글을 누른 헤더 버튼으로 포커스를 되찾는 일은 카드 헤더(`card-header.tsx` ③)가
 *     한다 — 스택 ↔ 격자 이동에도 카드는 부모가 바뀌지 않아 마운트가 유지되고(⑤), 헤더는 같은
 *     id 로 버튼을 되찾는다.
 *   - ✕ 로 카드가 사라지면(포커스가 함께 사라지면) 직전 렌더 순서에서 **다음 카드 헤더**로, 다음
 *     카드가 없으면 `fallbackFocusSelector`(종목 추가 검색란)로 옮긴다. 사용자가 이미 다른 곳에
 *     포커스를 두었다면 건드리지 않는다.
 *
 * ④ 빈 상태 (E6 empty · loading)
 *   카드 0장이면 격자 대신 UI-SPEC §Copywriting 의 빈 문구 2줄을 그린다. 스켈레톤이 없다 —
 *   게이트 통과 직후 64 스냅샷 전의 짧은 구간도 이 문구다.
 *
 * ⑤ ★ 카드 정체성은 고정 호스트 노드가 지킨다 (18-REVIEW WR-02)
 *   펼친 카드는 격자 칸 직계, 접힌 카드는 스택 안에 있어 JSX 로 그대로 그리면 토글마다 **부모가
 *   바뀌고** React 는 같은 `key` 여도 카드 서브트리를 새로 만든다 — 미전송 더티 값, 수동주문
 *   「결과 모름」 잠금(중복 체결 방지), 전송↔에코 상관이 접기 한 번에 사라진다. 그래서 카드마다
 *   `display: contents` 호스트 `div` 를 하나 만들어 두고 카드는 그 노드로 `createPortal` 한다 —
 *   React 트리에서 카드는 격자 뒤의 평평한 keyed 목록이라 부모가 바뀌지 않는다. 격자는 ①의 DOM
 *   구조(`card-grid` > `card-cell` … > `card-stack` > `card-cell`)를 그대로 그리되 칸은 빈
 *   **자리표**이고, 자리표의 안정 ref 콜백이 그 키의 호스트를 자기 안으로 옮겨 붙인다. 기각한
 *   대안은 카드 상태를 작업대로 끌어올리기 — LimitChaserForm 의 내부 폼 상태·전송 잠금까지
 *   올려야 해 변경면이 훨씬 넓다. React 숨김 경계 컴포넌트는 Next 번들 React 에 없어 쓰지 않는다.
 *
 * ⑥ 계좌 스코프 숨김 = **주차** (Phase 32 D-01 · RESEARCH Pattern 2)
 *   `hiddenIds` 의 카드(작업대 계좌 밖)는 자리표를 격자가 아니라 격자 밖 `hidden` 주차 노드
 *   (`card-parking`)에 둔다 — ⑤ 의 자리표 ref 가 호스트를 그리로 옮겨 붙일 뿐 포털은 **전수** 카드에
 *   그대로라 언마운트가 없다(에코 · 더티 · 결과 모름 잠금 · 미확인 카운트 보존). 그래서 세 축이 갈린다:
 *   - 격자 순서 · 빈 상태 판정 · ✕ 뒤 포커스 = **보이는** 카드만(숨은 카드로 포커스를 보내지 않는다).
 *   - 호스트 정리(`present`) = **모든** 카드 — 숨기는 순간 호스트를 지우면 그것이 곧 언마운트다.
 *   - 포털 = 모든 카드. 숨은 카드는 `CardInScopeContext` 가 false 라 열린 넘버패드 시트 · 인라인 편집 ·
 *     실패 말풍선이 스스로 닫힌다(body 포털 · 포커스를 쥔 입력이라 호스트를 주차해도 화면에 남기 때문 ·
 *     더티 값은 폼 상태라 그대로).
 *   보이는 카드 0 ∧ 숨은 카드 N ≥ 1 이면 빈 상태 문구가 계좌 문구(숨은 카드 수 안내)로 바뀐다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { TradingCols } from "@/lib/breakout-list";
import { cn } from "@/lib/utils";

/** 빈 상태 제목 — UI-SPEC §Copywriting 「Empty state heading」 원문. */
export const CARD_GRID_EMPTY_HEADING = "거래할 종목이 없어요";
/** 빈 상태 본문 — UI-SPEC §Copywriting 「Empty state body」 원문. */
export const CARD_GRID_EMPTY_BODY =
  "위 검색란에서 종목을 추가하거나, 돌파 목록의 종목을 눌러 시작하세요.";
/** 고른 계좌 카드 0 ∧ 다른 계좌 카드 ≥ 1 — Phase 32 UI-SPEC S2 Copywriting 원문. */
export const CARD_GRID_ACCOUNT_EMPTY_HEADING = "이 계좌에 거래할 종목이 없어요";
/** 계좌 빈 상태 본문 — `n` = 숨은(다른 계좌) 카드 수(UI-SPEC S2). */
export function cardGridAccountEmptyBody(n: number): string {
  return `위 검색란에서 종목을 추가하면 이 계좌로 열려요 · 다른 계좌 카드 ${n}장은 계좌를 바꾸면 보여요`;
}

/**
 * 「이 카드가 지금 작업대 범위 안인가」(Phase 32 D-01 · ⑥). 기본값 true — CardGrid 밖(/me 등)의 같은 컴포넌트는
 * 영향이 없다. 시트 · 인라인 편집 · 실패 말풍선이 이 값이 false 가 되는 순간 스스로 닫는다(취소 경로 · 전송 없음).
 */
const CardInScopeContext = createContext(true);

/** 지금 이 카드가 작업대 범위 안인가 — 숨은(다른 계좌) 카드면 false. CardGrid 밖은 언제나 true. */
export function useCardInScope(): boolean {
  return useContext(CardInScopeContext);
}

export interface CardGridItem {
  /**
   * 카드 정체성(18-REVIEW WR-05) — 작업대가 만든 단조 증가 식별자. key · 호스트 노드 · 토글 id ·
   * ✕ 뒤 포커스 순서가 전부 이 값을 쓴다. 같은 종목(ISIN) 카드가 둘일 수 있어(전략 키가 다른
   * 등록 전략 둘) ISIN 은 정체성이 아니다.
   */
  id: string;
  isin: string;
  open: boolean;
}

export interface CardGridProps<T extends CardGridItem> {
  cards: readonly T[];
  cols: TradingCols;
  renderCard: (card: T) => ReactNode;
  /**
   * 작업대 계좌 스코프 밖 카드(Phase 32 D-01). 언마운트하지 않고 호스트를 주차 노드에 붙인다 —
   * 에코 · 더티 · 결과 모름 잠금 · 미확인 카운트 보존(⑥).
   */
  hiddenIds?: ReadonlySet<string>;
  /** ✕ 로 마지막 카드가 사라졌을 때 포커스를 받을 요소(종목 추가 검색란). */
  fallbackFocusSelector?: string;
  className?: string;
}

/**
 * page(`wb`) 680 이상에서만 걸리는 열 지정(§2.2b 「격자 열 수 경계」 — 카드 밴드 첫 경계 685 와 다른 값이다.
 * 갤럭시 폴드 안쪽 화면 wb ≈ 691 을 들이기 위해 700 → 680, quick-260923-hfk) — Tailwind 가 소스를
 * 스캔하므로 **리터럴 그대로** 둔다.
 * 1단은 기본 1열 그대로라 추가 클래스가 없다.
 */
const COLS_CLASS: Record<TradingCols, string> = {
  1: "",
  2: "@min-[680px]/wb:grid-cols-[repeat(2,minmax(0,1fr))]",
  3: "@min-[680px]/wb:grid-cols-[repeat(3,minmax(0,1fr))]",
};

/** 헤더 토글 id — `strategy-card.tsx` 의 `strategy-card-{카드 id}-toggle` 과 같은 규약. */
function toggleIdOf(id: string): string {
  return `strategy-card-${id.replace(/[^A-Za-z0-9_-]/g, "_")}-toggle`;
}

/** 렌더 순서(①) — 펼친 카드들 → 접힌 카드들. 같은 무리 안의 순서는 입력 순서다. */
export function renderOrderOf<T extends CardGridItem>(cards: readonly T[]): {
  open: T[];
  folded: T[];
} {
  const open: T[] = [];
  const folded: T[] = [];
  for (const c of cards) (c.open ? open : folded).push(c);
  return { open, folded };
}

const noopSubscribe = () => () => {};

/** 클라이언트 렌더인가 — 서버/하이드레이션 첫 렌더는 `false`(호스트 노드를 만들지 않는다). */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function CardGrid<T extends CardGridItem>({
  cards,
  cols,
  renderCard,
  hiddenIds,
  fallbackFocusSelector,
  className,
}: CardGridProps<T>) {
  /* ⑥ 보이는 카드 · 주차 카드 — 숨김이 없으면 입력 배열 그대로(종전과 같은 참조 · 같은 DOM). */
  const visible =
    hiddenIds === undefined || hiddenIds.size === 0
      ? cards
      : cards.filter((c) => !hiddenIds.has(c.id));
  const parked = visible === cards ? [] : cards.filter((c) => hiddenIds?.has(c.id) === true);
  const { open, folded } = renderOrderOf(visible);
  const order = [...open, ...folded].map((c) => c.id);

  /* ── ⑤ 카드별 고정 호스트 노드 + 자리표 ref 콜백 ──────────────────────── */
  const isClient = useIsClient();
  const hosts = useRef(new Map<string, HTMLDivElement>());
  /** 키의 호스트 — 렌더 중 생성이지만 Map 조회라 멱등이다. SSR 에서는 만들지 않는다. */
  const hostOf = (id: string): HTMLDivElement | null => {
    if (!isClient || typeof document === "undefined") return null;
    let host = hosts.current.get(id);
    if (host === undefined) {
      host = document.createElement("div");
      host.setAttribute("data-slot", "card-host");
      // Tailwind 스캔에 기대지 않는다 — 카드 `article` 이 칸의 직접 레이아웃 자식처럼 동작한다.
      host.style.display = "contents";
      hosts.current.set(id, host);
    }
    return host;
  };
  /** 키별 **안정** ref 콜백 — 같은 자리표가 유지되는 동안 다시 불리지 않는다. */
  const placeRefs = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const placeRefOf = useCallback((id: string) => {
    let ref = placeRefs.current.get(id);
    if (ref === undefined) {
      ref = (el: HTMLDivElement | null) => {
        // null(자리표가 사라짐)에는 아무것도 하지 않는다 — 다음 자리표가 붙인다.
        if (el === null) return;
        const host = hosts.current.get(id);
        if (host !== undefined && host.parentNode !== el) el.appendChild(host);
      };
      placeRefs.current.set(id, ref);
    }
    return ref;
  }, []);

  /*
    사라진 키의 호스트를 치운다(✕ · 빈 상태). 카드 내용은 포털 언마운트로 이미 비었다.
    ★ `present` 는 **모든** 카드 id 다(⑥) — 보이는 id 로 잡으면 숨기는 순간 호스트가 지워져 언마운트가 된다.
  */
  useLayoutEffect(() => {
    const present = new Set(cards.map((c) => c.id));
    for (const [id, host] of hosts.current) {
      if (present.has(id)) continue;
      host.remove();
      hosts.current.delete(id);
      placeRefs.current.delete(id);
    }
  });
  /*
    ★ 언마운트 정리 효과를 두지 않는다 — 호스트는 자리표의 자식이라 격자와 함께 문서에서 빠지고,
      StrictMode 의 효과 재실행(정리 → 재설치)이 살아 있는 호스트를 지우는 일이 없게 한다.
  */

  /* ── ③ ✕ 뒤 포커스 ─────────────────────────────────────────────── */
  /*
    ⑥ 「사라짐」 은 카드 집합에서 빠진 것(✕)만이다 — 계좌 전환으로 숨은 카드는 사라진 것이 아니라
    포커스를 옮기지 않는다. 다음 대상은 **보이는** 순서에서만 고른다(숨은 카드로 포커스를 보내지 않는다).
  */
  const prevOrder = useRef<string[]>(order);
  useLayoutEffect(() => {
    const before = prevOrder.current;
    prevOrder.current = order;
    const live = new Set(cards.map((c) => c.id));
    const shown = new Set(order);
    const removedAt = before.findIndex((id) => !live.has(id));
    if (removedAt < 0) return;
    // 사용자가 이미 다른 곳에 포커스를 두었다면 건드리지 않는다.
    const active = document.activeElement;
    if (active !== null && active !== document.body && active.isConnected) return;
    const next = before.slice(removedAt + 1).find((id) => shown.has(id));
    const target =
      next !== undefined
        ? document.getElementById(toggleIdOf(next))
        : fallbackFocusSelector !== undefined
          ? document.querySelector<HTMLElement>(fallbackFocusSelector)
          : null;
    target?.focus();
  });

  /*
    ★ 순서가 계약이다 — 격자(자리표)가 포털 배열보다 **앞**이다. 커밋 레이아웃 단계는 형제 순서대로
      돌아서, 자리표 ref 가 호스트를 제자리에 붙인 **뒤에** 카드 안쪽의 레이아웃 효과가 돈다.
  */
  return (
    <>
      {visible.length === 0 ? (
        /*
          ④ 빈 상태 — 판정은 「보이는 카드 0」(⑥). 숨은 카드가 있으면 계좌 문구(숨은 수 안내)로, 전 카드 0 이면
          종전 문구. 상자 기하 · 슬롯은 같다.
        */
        <div
          data-slot="card-grid-empty"
          className={cn(
            "flex min-w-0 flex-col items-center gap-1 rounded-[var(--r-lg)] border border-dashed border-[var(--faint)] px-4 py-8 text-center",
            className,
          )}
        >
          <p className="m-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            {parked.length > 0 ? CARD_GRID_ACCOUNT_EMPTY_HEADING : CARD_GRID_EMPTY_HEADING}
          </p>
          <p className="m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {parked.length > 0 ? cardGridAccountEmptyBody(parked.length) : CARD_GRID_EMPTY_BODY}
          </p>
        </div>
      ) : (
        <div
          data-slot="card-grid"
          data-cols={String(cols)}
          className={cn(
            "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3",
            COLS_CLASS[cols],
            className,
          )}
        >
          {open.map((c) => (
            <div key={c.id} ref={placeRefOf(c.id)} data-slot="card-cell" className="min-w-0" />
          ))}
          {folded.length > 0 && (
            <div data-slot="card-stack" className="flex min-w-0 flex-col gap-2">
              {folded.map((c) => (
                <div key={c.id} ref={placeRefOf(c.id)} data-slot="card-cell" className="min-w-0" />
              ))}
            </div>
          )}
        </div>
      )}
      {/* ⑥ 숨은 카드의 자리표 — 같은 ref 콜백이 호스트를 여기로 옮긴다(언마운트 아님). */}
      {parked.length > 0 && (
        <div hidden data-slot="card-parking">
          {parked.map((c) => (
            <div key={c.id} ref={placeRefOf(c.id)} />
          ))}
        </div>
      )}
      {cards.map((c) => {
        const host = hostOf(c.id);
        // Provider 는 늘 감싼다(값만 바뀐다) — 숨김 전환이 카드 서브트리 모양을 바꾸지 않아 다시 마운트되지 않는다.
        return host === null
          ? null
          : createPortal(
              <CardInScopeContext.Provider value={hiddenIds?.has(c.id) !== true}>
                {renderCard(c)}
              </CardInScopeContext.Provider>,
              host,
              c.id,
            );
      })}
    </>
  );
}
