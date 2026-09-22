import type { Locator, Page } from '@playwright/test';

/**
 * 잘림 판정 헬퍼 — **저장소의 유일한 정의**다 (Phase 18 Plan 13 에서 승격).
 *
 * 원래 `specs/trading-limit-chaser.spec.ts` 안의 비공개 함수 둘이었다(260912-ok2 · quick-260912-u58 ⑤).
 * 18-13 이 `/trading` 작업대 spec 을 새로 쓰면서 같은 판정이 두 파일에 필요해졌고, 판정식이
 * 둘로 갈리면 한쪽만 고쳐진다 — 그래서 **옮겼다**(복사하지 않았다). 본문은 옮기기 전과
 * 한 글자도 다르지 않다(`slice(0, 24)` · `Math.round` · `over > 1` · `sr-only`/스크롤 영역 제외).
 *
 * 두 판정은 **서로 다른 실패를 본다** — 대체하지 말고 나란히 쓴다.
 *   · `leavesOverflowing` — 잎 요소의 **좌표**가 컨테이너 오른쪽 밖으로 밀렸는가.
 *     `truncate`(`overflow:hidden`) 가 걸린 요소는 좌표가 밀리지 않아 이쪽이 못 본다.
 *   · `scrollOverflowing` — 요소 **자신의 내용이 자기 상자보다 넓은가**(`scrollWidth - clientWidth > 1`).
 *     부모를 밀어내며 넘치는 요소는 자기 `scrollWidth` 가 멀쩡해 이쪽이 못 본다.
 */

/**
 * 잘림 진단 ① — **행 안의 잎 요소 좌표**다.
 *
 * 행은 블록이라 넘쳐도 폭이 컨테이너와 같고 `overflow-hidden` 이 넘침을 삼킨다.
 * `getBoundingClientRect` 는 ancestor 클리핑에 영향받지 않아 밀려난 진짜 좌표가 나온다.
 * 실패 메시지에 **무엇이 얼마나** 밀려났는지 남는다 — 「어딘가 잘렸다」로 끝나지 않게.
 */
export async function leavesOverflowing(
  scope: Locator,
  right: number,
): Promise<{ text: string; over: number }[]> {
  return scope.evaluate(
    (el, r) =>
      Array.from(el.querySelectorAll<HTMLElement>('*'))
        .map((child) => ({
          text: (child.textContent ?? '').slice(0, 24),
          over: Math.round(child.getBoundingClientRect().right - r), // 1px = 반올림 여유
        }))
        .filter((item) => item.over > 1),
    right,
  );
}

/**
 * 잘림 진단 ② — **스크롤 판정식**이다.
 *
 * 제외 두 가지:
 *   · `sr-only` — 1px 상자에 글자를 숨기는 장치라 **항상** 넘친다(설계다).
 *   · overflow 가 `auto`/`scroll` 인 조상 안 — 스크롤하라고 만든 영역이다(호가 사다리 등).
 */
export async function scrollOverflowing(
  page: Page,
  rootSelector: string,
): Promise<{ tag: string; text: string; over: number }[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (root === null) return [{ tag: '<ROOT_MISSING>', text: sel, over: -1 }];
    const inScroller = (el: Element): boolean => {
      let p = el.parentElement;
      while (p !== null && p !== root) {
        const o = getComputedStyle(p);
        if (/(auto|scroll)/.test(o.overflowX) || /(auto|scroll)/.test(o.overflow)) return true;
        p = p.parentElement;
      }
      return false;
    };
    return Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((el) => !el.classList.contains('sr-only') && el.closest('.sr-only') === null)
      .filter((el) => el.scrollWidth - el.clientWidth > 1)
      .filter((el) => !inScroller(el))
      .map((el) => ({
        tag: `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ''}`,
        text: (el.textContent ?? '').slice(0, 24),
        over: el.scrollWidth - el.clientWidth,
      }));
  }, rootSelector);
}
