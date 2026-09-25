/**
 * Phase 20 (D-12) — `(pointer: coarse)` 판정을 테스트 안에서 바꾸는 matchMedia 모킹 헬퍼.
 *
 * `.test.` 가 아니라 vitest 가 수집하지 않는다(테스트 전용 헬퍼). 모양은 `tests/setup.ts` 의
 * jsdom 폴리필을 그대로 따르되, `addEventListener('change', …)` 로 모인 리스너를
 * `emitPointerChange` 가 불러 `useEditMode` 의 구독 경로까지 태운다.
 *
 * ⚠️ 누수 금지(RESEARCH Pitfall 7): 폴리필은 「없을 때만」 설치되므로 교체가 같은 파일의
 * 다음 테스트로 샌다. `mockPointer` 를 쓰는 파일은 반드시 `afterEach(restoreMatchMedia)`.
 */

const COARSE = '(pointer: coarse)';

type Listener = (e: MediaQueryListEvent) => void;

const original: typeof window.matchMedia | undefined =
  typeof window !== 'undefined' ? window.matchMedia : undefined;

let coarseNow = false;
const listeners = new Set<Listener>();

function mediaList(query: string): MediaQueryList {
  const mql = {
    get matches() {
      return coarseNow && query === COARSE;
    },
    media: query,
    onchange: null,
    addListener: (l: Listener) => listeners.add(l),
    removeListener: (l: Listener) => listeners.delete(l),
    addEventListener: (_type: string, l: Listener) => listeners.add(l),
    removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
    dispatchEvent: () => false,
  };
  return mql as unknown as MediaQueryList;
}

/** 주 포인터를 coarse(터치) / fine(마우스)로 둔다. */
export function mockPointer(coarse: boolean): void {
  coarseNow = coarse;
  listeners.clear();
  window.matchMedia = ((query: string) => mediaList(query)) as typeof window.matchMedia;
}

/** 주 포인터가 바뀐 것처럼 상태를 바꾸고 구독자(`change`)를 부른다. */
export function emitPointerChange(coarse: boolean): void {
  coarseNow = coarse;
  const ev = { matches: coarse, media: COARSE } as MediaQueryListEvent;
  for (const l of [...listeners]) l(ev);
}

/** 원본 matchMedia(= setup 폴리필)로 되돌린다. `afterEach` 에서 부른다. */
export function restoreMatchMedia(): void {
  coarseNow = false;
  listeners.clear();
  if (original) window.matchMedia = original;
}
