'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * useUrlTab — `?tab=` 탭 셸의 정본 (quick-261006-pey P-1).
 *
 * ① 이 파일이 정본이다
 *   종목상세 3탭(`components/stock/stock-detail-tabs.tsx`)과 /me 4탭(`components/trading/me-client.tsx` ·
 *   quick-261006-pey D-1)이 함께 쓴다. 메커니즘은 종목상세의 현행 코드를 옮겨 받았다. ★ 새 탭 셸은 사본을
 *   만들지 말고 이 훅을 쓴다 — 두 벌이면 가드 · 방문 유지 규칙이 한쪽만 고쳐져 조용히 갈린다. 화면 고유 규칙
 *   (종목상세 T9 뉴스토론 재클릭 · D-31 옛 `?tab=orderbook` 딥링크 · 폰 「트레이딩」 CTA)은 호출부에 남는다.
 *
 * ② 옮겨 온 계약
 *   T3 `?tab=` 이 단일 진실이고 전환은 `window.history.pushState`(push 계열 — 브라우저 뒤로가기가 이전 탭으로).
 *      라우터 내비게이션은 RSC 서버 왕복이 끝나야 `?tab=` 이 바뀌어 탭 전환이 지연됐다. Next 15 가 네이티브
 *      pushState 를 검색 파라미터 훅과 동기화하므로 서버 요청 없이 즉시 전환된다. 한 클릭 = 기록 1개는
 *      `select` 의 실시간 URL 가드가 보장한다 (260913-v2e) — Radix TabsTrigger 는 mousedown 과 focus(자동
 *      활성화) 두 곳에서 onValueChange 를 부르고(Chrome · 안드로이드는 mousedown 에 포커스한다), 렌더 클로저의
 *      활성값은 Next 의 transition 반영 전이라 낡아 있으므로 동기로 바뀌는 `window.location.search` 로 거른다.
 *   T8 한 번 연 패널은 떠나도 언마운트하지 않고 숨긴다(`keepMounted` → TabsContent `forceMount` +
 *      `data-[state=inactive]:hidden`). Radix 기본은 비활성 패널을 언마운트해 재방문마다 섹션이 다시
 *      마운트 · 재조회되고 스켈레톤이 떴다. 열지 않은 탭은 여전히 마운트하지 않는다(첫 진입 비용 그대로).
 *   T-15-37 (Tampering) `?tab=` 은 사용자 제어 입력이다. 화이트리스트(`values`) 밖의 임의 문자열은 렌더 경로에
 *      들어가지 못하고 전부 기본 탭으로 떨어진다.
 *   탭 전환 시 탭 바 기준 `scrollIntoView({ block: 'start' })` — 탭 바 바로 아래가 보이게(탭 위 공통 영역은
 *      지나간 상태). 탭별 스크롤 복원은 없다(단순성 우선 · /me 도 같은 문법 — P-7).
 *
 * ③ 클래스 상수
 *   `URL_TAB_BAR_CLASS` — sticky 탭 바(T4). AppShell 의 `main` 패딩(`p-2 md:p-4 lg:p-6`)을 가로질러 바가 폭을
 *   꽉 채우도록 `-mx-2 px-2 md:-mx-4 md:px-4 lg:-mx-6 lg:px-6` 로 상쇄한다 — 없으면 스크롤된 콘텐츠가 바 좌우로
 *   비쳐 보인다. ★ 상쇄 값이 본문 패딩과 **같은 브레이크포인트로 갈려야** 한다. 한쪽만 고치면 바가 좌우로
 *   삐져나가거나 덜 퍼진다(260924-vj1 전에는 md 단계가 빠져 768~1023 에서 바가 8px 덜 퍼졌다).
 *   배경(bg)과 목록 폭 제한은 호출부 몫이다(P-2 — 종목상세 `--bg` + `max-w-4xl`, /me `--surface` + PAGE_WRAP 900).
 *
 * ④ K-1 알려진 선행 제약 (고치지 않는다 — 기록만)
 *   AppShell `<main>` 이 `overflow-auto` 인데 실제 스크롤 주체는 창(window)이다(`lib/tab-scroll-memory.ts` 헤더).
 *   `main` 이 스크롤 컨테이너이면서 스스로 스크롤하지 않으므로 그 안의 CSS `sticky` 는 실제로 고정되지 않는 것으로
 *   보인다(종목상세 탭 바도 같다). 셸 변경은 전 페이지 영향이라 이 훅의 범위 밖이다 — 고칠지는 사용자 결정.
 */

export interface UrlTab<T extends string> {
  /** `parse(useSearchParams().get('tab'))` — URL 이 단일 진실이라 별도 초기 state 가 없다. */
  active: T;
  /** `values` 밖이면 `defaultValue` (T-15-37). */
  parse: (raw: string | null) => T;
  /** 방문한 탭이면 `true` — TabsContent `forceMount` 용(T8). */
  keepMounted: (v: T) => true | undefined;
  /** 가드 → `pushState(null, '', '?tab=…')` → 탭 바 스크롤 (T3). */
  select: (next: string) => void;
  /** 탭 바 요소 — `select` 가 이 요소 기준으로 스크롤한다. */
  tabBarRef: RefObject<HTMLDivElement | null>;
}

/**
 * `values` 는 **모듈 상수**로 넘긴다 — 매 렌더 새 배열이면 `parse` · `select` 가 매번 바뀐다.
 */
export function useUrlTab<T extends string>(values: readonly T[], defaultValue: T): UrlTab<T> {
  const searchParams = useSearchParams();
  const tabBarRef = useRef<HTMLDivElement>(null);

  const parse = useCallback(
    (raw: string | null): T => (values.includes(raw as T) ? (raw as T) : defaultValue),
    [values, defaultValue],
  );

  // 딥링크 진입도 이 한 줄로 처리된다.
  const active = parse(searchParams.get('tab'));

  // T8 — 한 번이라도 활성이었던 탭. 클릭 · 뒤로가기 · 딥링크 어느 경로로 바뀌어도 `active` 에서
  // 파생되므로 렌더 중에 갱신한다(이전 렌더 값에서 파생되는 state — effect 로 한 박자 늦추지 않음).
  const [visited, setVisited] = useState<ReadonlySet<T>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set(visited).add(active));
  const keepMounted = (v: T): true | undefined => (visited.has(v) ? true : undefined);

  const select = useCallback(
    (next: string) => {
      const value = parse(next);
      // 한 클릭 = 기록 1개 가드(위 ② T3 · 260913-v2e) — 실시간 URL 로 거른다.
      if (parse(new URLSearchParams(window.location.search).get('tab')) === value) return;
      // T3 — `replace` 가 아니라 push 계열. 쿼리만 쓰는 상대 URL 이라 pathname 은 유지된다.
      window.history.pushState(null, '', `?tab=${value}`);
      tabBarRef.current?.scrollIntoView({ block: 'start' });
    },
    [parse],
  );

  return { active, parse, keepMounted, select, tabBarRef };
}

/** sticky 탭 바 — 배경 없음, 호출부가 bg 를 붙인다(위 ③ · P-2). */
export const URL_TAB_BAR_CLASS =
  'sticky top-0 z-20 -mx-2 border-b border-[var(--border-subtle)] px-2 md:-mx-4 md:px-4 lg:-mx-6 lg:px-6';

/** 탭 목록 — 폭 제한 없음, 호출부가 붙인다(P-2). */
export const URL_TAB_LIST_CLASS =
  'h-auto w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** 탭 트리거 — 17px/600 · 선택 = 글자 `--nav-on-fg` · 밑줄 `--nav-on-line` (260924-vj1 · 260925-gy6). */
export const URL_TAB_TRIGGER_CLASS =
  'h-[50px] flex-none rounded-none border-b-2 border-transparent px-3 text-[17px] font-semibold text-[var(--muted-fg)] shadow-none after:hidden hover:text-[var(--fg)] data-[state=active]:border-b-[var(--nav-on-line)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--nav-on-fg)] data-[state=active]:shadow-none';
