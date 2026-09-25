import type { Locator, Page } from '@playwright/test';

/**
 * 잘림 판정 헬퍼 — **저장소의 유일한 정의**다 (Phase 18 Plan 13 에서 승격).
 *
 * 원래 `specs/trading-limit-chaser.spec.ts` 안의 비공개 함수 둘이었다(260912-ok2 · quick-260912-u58 ⑤).
 * 18-13 이 `/trading` 작업대 spec 을 새로 쓰면서 같은 판정이 두 파일에 필요해졌고, 판정식이
 * 둘로 갈리면 한쪽만 고쳐진다 — 그래서 **옮겼다**(복사하지 않았다). 본문은 옮기기 전과
 * 한 글자도 다르지 않다(`slice(0, 24)` · `Math.round` · `over > 1` · `sr-only`/스크롤 영역 제외).
 *
 * 세 판정은 **서로 다른 실패를 본다** — 대체하지 말고 나란히 쓴다.
 *   · `leavesOverflowing` — 잎 요소의 **좌표**가 컨테이너 오른쪽 밖으로 밀렸는가.
 *     `truncate`(`overflow:hidden`) 가 걸린 요소는 좌표가 밀리지 않아 이쪽이 못 본다.
 *   · `scrollOverflowing` — 요소 **자신의 내용이 자기 상자보다 넓은가**(`scrollWidth - clientWidth > 1`).
 *     부모를 밀어내며 넘치는 요소는 자기 `scrollWidth` 가 멀쩡해 이쪽이 못 본다.
 *   · `selectsClipped` (Phase 20 · 20-08) — 보이는 `<select>` 가 **자기 본래 폭보다 좁아졌는가**.
 *     `min-w-0` · `max-w-full` 인 select 는 flex 가 줄이면 선택 글자를 조용히 잘라 그린다 — 그런데
 *     네이티브 컨트롤이라 `scrollWidth` 가 늘지 않고(위 두 판정 모두 조용) 좌표도 안 밀린다.
 *     그래서 제약 없는 곳에 복제해 잰 본래 폭과 실제 폭을 비교한다(목업 `naturalSelectWidth` 이식).
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
 * 제외 세 가지:
 *   · `sr-only` — 1px 상자에 글자를 숨기는 장치라 **항상** 넘친다(설계다).
 *   · overflow 가 `auto`/`scroll` 인 조상 안 — 스크롤하라고 만든 영역이다(호가 사다리 등).
 *   · **히트 영역 가상요소만으로 넘친 요소** (Phase 20 · 20-07) — 그룹 스위치처럼 시각 40×24 컨트롤이
 *     빈 `::after`(`position:absolute` · `content:""`)를 상자 밖으로 늘려 히트 44×44 를 만드는 장치다.
 *     가상요소는 `scrollWidth` 에 잡히지만 글자가 없다. 그래서 **요소의 실제 내용(글자 포함 ·
 *     `Range` 로 잰다)이 자기 상자 안에 있을 때만** 제외한다 — 실제 글자가 넘치면 그대로 잡힌다.
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
    /** 넘침의 원인이 빈 절대배치 가상요소(히트 영역)뿐인가 — 실제 내용은 자기 상자 안이다. */
    const hitAreaOnly = (el: HTMLElement): boolean => {
      const hasHitPseudo = (['::before', '::after'] as const).some((p) => {
        const s = getComputedStyle(el, p);
        return s.position === 'absolute' && s.content === '""';
      });
      if (!hasHitPseudo) return false;
      const range = document.createRange();
      range.selectNodeContents(el);
      const content = range.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return content.width === 0 || content.right <= box.right + 1;
    };
    return Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((el) => !el.classList.contains('sr-only') && el.closest('.sr-only') === null)
      .filter((el) => el.scrollWidth - el.clientWidth > 1)
      .filter((el) => !inScroller(el))
      .filter((el) => !hitAreaOnly(el))
      .map((el) => ({
        tag: `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ''}`,
        text: (el.textContent ?? '').slice(0, 24),
        over: el.scrollWidth - el.clientWidth,
      }));
  }, rootSelector);
}

/**
 * 잘림 진단 ③ — **select 본래 폭 판정**이다 (Phase 20 · 20-08 · 목업 `naturalSelectWidth` 이식).
 *
 * 루트 안의 보이는 select(폭 > 0 · 계산 opacity ≠ 0) 마다 같은 부모 안 화면 밖 호스트
 * (`position:absolute; left:-9999px; visibility:hidden; width:max-content`)에 `max-width:none;
 * min-width:auto` 로 복제해 본래 폭을 재고, 본래 폭 − 실제 폭 > 0.5 인 것을 돌려준다.
 *   · 투명 오버레이 select(opacity 0 — 폰 계좌 칩)는 글자를 그리지 않으므로 제외한다. 그 자리의
 *     보이는 이름표는 위 두 판정이 본다.
 *   · 같은 부모 안에 복제하는 이유 — 컨테이너 쿼리(`@min-[Npx]/lc:`)·상속 글꼴이 원본과 같아야
 *     같은 폭이 나온다. 호스트는 절대배치라 원본 배치를 흔들지 않고, 재자마자 지운다.
 */
export async function selectsClipped(
  page: Page,
  rootSelector: string,
): Promise<{ text: string; deficit: number }[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (root === null) return [{ text: `<ROOT_MISSING> ${sel}`, deficit: -1 }];
    return Array.from(root.querySelectorAll('select'))
      .filter(
        (s) => s.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(s).opacity) !== 0,
      )
      .map((s) => {
        const host = document.createElement('div');
        host.style.cssText =
          'position:absolute;left:-9999px;top:0;width:max-content;visibility:hidden';
        (s.parentElement ?? root).appendChild(host);
        const clone = s.cloneNode(true) as HTMLSelectElement;
        clone.style.maxWidth = 'none';
        clone.style.minWidth = 'auto';
        clone.value = s.value;
        host.appendChild(clone);
        const natural = clone.getBoundingClientRect().width;
        host.remove();
        return {
          text: (s.selectedOptions[0]?.textContent ?? '').slice(0, 24),
          deficit: Math.round((natural - s.getBoundingClientRect().width) * 10) / 10,
        };
      })
      .filter((item) => item.deficit > 0.5);
  }, rootSelector);
}
