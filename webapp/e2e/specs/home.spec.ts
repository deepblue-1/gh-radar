import { test, expect } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED, HOME_EMPTY } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';

/**
 * Phase 13 Plan 05 — 홈(`/`) 승격 E2E (HOME-01).
 *
 * VALIDATION:
 *   - `/` 가 홈("오늘의 급등 테마")을 렌더(더 이상 /scanner 로 302 리다이렉트하지 않음).
 *   - 날짜 네비(이전/다음/오늘) + 시점 pill 행 렌더.
 *   - 급등 없는 날 empty-state("오늘은 +15% 급등 종목이 없습니다" + "상승률 상위로 이동").
 *   - 사이드바 홈 nav item 이 `/` 에서 active(aria-current="page").
 *   - REGRESSION(T-13-12): /scanner 직접 접근 시 상승률 상위 UI 정상 렌더.
 *
 * 데이터(급등)는 날마다 변동하므로 `/api/home` 을 결정론 mock 으로 고정(themes.spec 동형).
 * populated/empty 두 응답을 명시 주입해 라이브 데이터 부재로 하드 실패하지 않도록 한다.
 * storageState(로그인)는 config chromium project 가 자동 주입 — `/` 도 로그인 필수 표면이라
 * (quick 260911-tuk) 그 주입이 없으면 middleware 가 `/login?next=%2F` 로 튕긴다.
 */

test.describe('Phase 13 — 홈 승격 (HOME-01)', () => {
  test('/ — 홈 렌더(타이틀 + 테마/개별 급등 카드) + 홈 nav active', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    // 타이틀(카피 계약).
    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // populated: 주도 테마 섹션 + 테마명 + 개별 급등 섹션 렌더 (empty-tolerant OR 아님 —
    // populated mock 을 명시 주입했으므로 카드가 반드시 나온다).
    await expect(
      page.getByRole('heading', { name: '주도 테마' }),
    ).toBeVisible();
    await expect(page.getByText('AI 반도체').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '개별 급등' }),
    ).toBeVisible();
    await expect(page.getByText('카카오').first()).toBeVisible();

    // 사이드바 홈 nav — `/` 에서 active(aria-current="page"). 데스크톱 뷰포트(>=lg)에서
    // aside 사이드바가 노출된다(app-shell hidden lg:block).
    const homeNav = page
      .getByRole('link', { name: '홈', exact: true })
      .first();
    await expect(homeNav).toBeVisible();
    await expect(homeNav).toHaveAttribute('aria-current', 'page');
  });

  test('/ — 날짜/시점 네비(이전 날짜·다음 날짜·오늘 + 시점 슬라이더) 렌더', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 날짜 네비 — 이전/다음 아이콘 버튼 + "오늘" reset.
    await expect(page.getByRole('button', { name: '이전 날짜' })).toBeVisible();
    await expect(page.getByRole('button', { name: '다음 날짜' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '오늘', exact: true }),
    ).toBeVisible();

    // 시점 슬라이더 — populated 는 슬롯 2개(14:30 / 15:30 · 애프터마켓). 기본 선택 = 최신.
    const slider = page.getByRole('slider', { name: '시점 선택' });
    await expect(slider).toBeVisible();
    await expect(page.getByText(/15:30 · 애프터마켓/)).toBeVisible();

    // quick-260913-g4c — 가장 긴 라벨 "15:30 · 애프터마켓" 이 390px 에서도 줄바꿈·잘림·가로 스크롤 없이
    // 고정 폭 pill 안에 들어간다.
    await page.setViewportSize({ width: 390, height: 900 });
    const pill = page.getByTestId('home-slot-label');
    await expect(pill).toHaveText('15:30 · 애프터마켓');
    const fit = await pill.evaluate((el) => {
      const cs = getComputedStyle(el);
      const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
      const contentH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return {
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        oneLine: contentH <= lineH * 1.5,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
      };
    });
    expect(fit.scrollW, '라벨 pill 이 잘린다').toBeLessThanOrEqual(fit.clientW);
    expect(fit.oneLine, '라벨 pill 이 줄바꿈된다').toBe(true);
    expect(fit.docScrollW, '390px 에서 가로 스크롤이 생겼다').toBe(fit.docClientW);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 슬라이더를 0(이른 슬롯)으로 → 선택이 14:30 으로 바뀜 (aria-valuetext 로 검증 —
    // "14:30" 텍스트는 min 라벨과 선택 pill 두 곳에 떠 strict-mode 충돌).
    await slider.fill('0');
    await expect(slider).toHaveAttribute('aria-valuetext', '14:30');
    await expect(page.getByText(/15:30 · 애프터마켓/)).toHaveCount(0);
  });

  test('/ — 급등 없는 날 empty-state("+15% 급등 종목이 없습니다" + 상승률 상위로 이동 CTA)', async ({
    page,
  }) => {
    // empty 응답 명시 주입 — snapshot=null → HomeEmpty.
    await mockHomeApi(page, { response: HOME_EMPTY });
    await page.goto('/');

    await expect(
      page.getByText('오늘은 +15% 급등 종목이 없습니다'),
    ).toBeVisible({ timeout: 10_000 });

    // "상승률 상위로 이동" CTA → /scanner Link.
    const cta = page.getByRole('link', { name: '상승률 상위로 이동' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/scanner');
  });

  test('A(인라인 확장) — "+N개 종목 더" 클릭 시 숨겨진 종목 노출(aria-expanded), "접기" 토글', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 6종목 → top4 노출, overflow 2 → "+2개 종목 더" 토글(초기 접힘).
    const toggle = page.getByRole('button', { name: '+2개 종목 더' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // 접힌 상태: overflow 종목(가온칩스)은 카드 본문에 없음.
    await expect(page.getByRole('link', { name: /가온칩스/ })).toHaveCount(0);

    // 클릭 → 펼침(aria-expanded=true) + overflow 종목 노출.
    await toggle.click();
    const expanded = page.getByRole('button', { name: '접기' });
    await expect(expanded).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: /가온칩스/ })).toBeVisible();

    // 재클릭 → 접힘.
    await expanded.click();
    await expect(
      page.getByRole('button', { name: '+2개 종목 더' }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: /가온칩스/ })).toHaveCount(0);
  });

  test('B(바텀시트) — 테마명 트리거 클릭 시 dialog 오픈 + 전체 소속 종목 + 근거 뉴스 목록(2건 초과)', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 테마명 트리거 = aria-haspopup="dialog" 버튼.
    const trigger = page.getByRole('button', { name: /AI 반도체/ });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 전체 소속 종목(overflow 포함, 접힘 없이) 노출 — 종목 행은 /stocks/{code} href 로 특정.
    // (뉴스 제목 anchor 에도 "SK하이닉스" 가 있어 name 매칭은 strict-mode 충돌 → href 로 구분.)
    await expect(dialog.locator('a[href="/stocks/000660"]')).toBeVisible(); // SK하이닉스
    await expect(dialog.locator('a[href="/stocks/399720"]')).toBeVisible(); // 가온칩스(overflow)
    await expect(dialog.locator('a[href="/stocks/394280"]')).toBeVisible(); // 오픈엣지테크놀로지(overflow)

    // 근거 뉴스 목록(dedup 후 3건 unique — 2건 초과). 중복 URL 기사는 미노출.
    await expect(
      dialog.getByText('HBM 공급 부족 심화… 관련주 강세', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText('SK하이닉스, HBM4 양산 계획 앞당겨'),
    ).toBeVisible();
    await expect(
      dialog.getByText('반도체 장비주 일제히 급등… 수주 기대감'),
    ).toBeVisible();
    await expect(
      dialog.getByText('HBM 공급 부족 심화… 관련주 강세 (중복)'),
    ).toHaveCount(0);
  });

  test('C(종목 → 상세) — 종목 행이 /stocks/{code} 링크이고 클릭 시 이동한다', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 종목 상세 링크 존재(a[href^="/stocks/"]).
    const stockLink = page.locator('a[href^="/stocks/"]').first();
    await expect(stockLink).toBeVisible();

    // SK하이닉스(000660) 행 → /stocks/000660.
    const hynixLink = page.getByRole('link', { name: /SK하이닉스/ }).first();
    await expect(hynixLink).toHaveAttribute('href', '/stocks/000660');

    // 클릭 시 상세로 이동.
    await hynixLink.click();
    await expect(page).toHaveURL(/\/stocks\/000660$/);
  });

  test('REGRESSION(T-13-12) — /scanner 직접 접근 시 상승률 상위 UI 정상 렌더', async ({
    page,
  }) => {
    // 상승률 상위 페이지 진입 시 백엔드 부재로 인한 폴링 실패 차단(빈 배열 mock).
    await mockStockApi(page);
    await page.goto('/scanner');

    // / 가 더 이상 /scanner 로 302 리다이렉트하지 않음 → /scanner 는 직접 접근으로만 도달.
    // 상승률 상위 UI(⌘K 검색 트리거 = AppShell nav)가 렌더되면 회귀 없음으로 판정.
    await expect(page).toHaveURL(/\/scanner$/);
    await expect(
      page.getByLabel('종목 검색 열기').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  /*
    ★ quick-260912-u58 ⑤ — **앱 셸 여백 불변식**. 헤더와 본문의 좌우 여백이 같은 램프여야
      한다: 뷰포트 8 / 768↑ 16 / 1024↑ 24 px.

    왜 여기(홈 spec)인가: 헤더는 **전 페이지 공통**이다. 상따 spec 에만 두면 「상따에서만
    맞다」와 구분되지 않는다. 이 파일이 이미 여는 두 경로(`/` · `/scanner`)에서 확인하면
    한 화면의 우연이 아님이 드러난다.

    ★ **클래스 문자열이 아니라 계산된 스타일**을 본다. 클래스만 보면 CSS 가 아예 안 먹어도
      통과한다 — 그 구분이 이 케이스의 존재 이유다(클래스 계약은 `app-shell-chrome.test.tsx`
      가 이미 잠근다. 이쪽은 실제 픽셀이다).
    ★ 옛 결함은 `main`=`p-2 lg:p-6` / `header`=맨몸 `px-6` 이라 폰에서 헤더 24 · 본문 8 로
      16px 어긋나 있었다. 두 값을 **같은 케이스에서** 재야 그 어긋남이 다시 나지 않는다.
  */
  test('★ 셸 불변식 — 헤더와 본문의 좌우 여백이 8/16/24 한 램프다 (quick-260912-u58 ⑤)', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await mockStockApi(page);

    for (const path of ['/', '/scanner']) {
      for (const [width, expected] of [
        [390, '8px'],
        [768, '16px'],
        [1024, '24px'],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.locator('header').first().waitFor({ timeout: 15_000 });
        await page.locator('main').first().waitFor({ timeout: 15_000 });

        const m = await page.evaluate(() => {
          const h = getComputedStyle(document.querySelector('header')!);
          const mn = getComputedStyle(document.querySelector('main')!);
          return {
            headerL: h.paddingLeft,
            headerR: h.paddingRight,
            mainL: mn.paddingLeft,
            mainR: mn.paddingRight,
          };
        });

        expect(m, `${path} @${width} 의 좌우 여백이 ${expected} 한 값이 아니다`).toEqual({
          headerL: expected,
          headerR: expected,
          mainL: expected,
          mainR: expected,
        });
      }
    }
  });

  /*
    ★ quick-260913-0em — **잉크 불변식**. 위 케이스(260912-u58 ⑤)와 **짝이고, 그것을 대체하지
      않는다**: 저쪽은 헤더/본문의 패딩 **박스**가 같은 램프인지를 보고, 이쪽은 헤더 좌우 끝
      아이콘의 **보이는 잉크**가 본문 여백선에 서는지를 본다. 둘 다 참이어야 한다.

    왜 둘이 갈라지는가: 헤더 끝 컨트롤은 44×44 터치 타깃(WCAG 2.5.5) 한가운데 20px 아이콘이
    박힌 아이콘 버튼이라, **박스가 정확히 맞아도 잉크는 12px 안쪽**에 선다. 본문 카드는 테두리가
    여백선에 딱 붙으므로 사용자 눈에는 12px 짝짝이로 보인다 — 사용자 신고가 정확히 이것이었다.
    박스 단언만 있으면 이 결함이 통과한다. 그래서 잉크를 따로 잰다.

    ★ 값을 **절대 px 로 굳히지 않는다** — 헤드리스 스크롤바 폭이 뷰포트마다 clientWidth 를
      깎아서 절대값은 환경 의존이다. 잉크를 **본문 여백선과의 상대 거리**로 재면 그 의존이 없다.
    ★ 폰(390)만 `inset 4` 인 것은 타협이 아니라 **오버플로 제약**이다: 패딩이 8 이라 12 를 다
      당기면 오른쪽 버튼이 뷰포트를 넘어 가로 스크롤이 생긴다. 그래서 좌우 대칭 4px 안쪽에서
      멈춘다. `md`(768)↑ 는 패딩이 16 이라 정확히 0 이다. 근거는 `app-header.tsx` 주석이 정본.
    ★ `scrollWidth === clientWidth` 를 같은 케이스에서 본다 — 이 변경은 **음수 마진**이라
      가로 스크롤을 만들 수 있는 종류다. 그 위험을 잰 적 없는 상태로 두지 않는다.
    ★ 1004·1023 은 사용자가 신고한 실제 폭과 `lg`(1024) 직전 경계다 — 램프의 마지막 칸이
      `lg` 로 새지 않는지를 잡는다.
  */
  test('★ 셸 불변식 — 헤더 아이콘 **잉크**가 본문 여백선에 선다 (quick-260913-0em)', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await mockStockApi(page);

    // [뷰포트, 잉크가 본문 여백선보다 안쪽으로 들어가도 되는 px]
    for (const [width, inset] of [
      [390, 4],
      [768, 0],
      [1004, 0],
      [1023, 0],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.locator('header').first().waitFor({ timeout: 15_000 });
      await page.locator('main').first().waitFor({ timeout: 15_000 });
      // <lg 헤더의 좌우 끝 컨트롤 — 이 둘이 붙기 전에 재면 잉크가 없다.
      // ★ 검색 트리거는 **같은 aria-label 을 가진 버튼이 둘**이다(데스크톱 readonly input +
      //   모바일 아이콘). DOM 순서상 데스크톱이 먼저라 `.first()` 는 `<lg` 에서 항상 hidden 인
      //   쪽을 집는다 — 여기서 필요한 것은 뒤쪽(모바일 아이콘)이다.
      await page.getByLabel('사이드바 열기').first().waitFor({ timeout: 15_000 });
      await page.getByLabel('종목 검색 열기').last().waitFor({ timeout: 15_000 });

      const m = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const r = main.getBoundingClientRect();
        const cs = getComputedStyle(main);
        // 잉크 = 아이콘 `<svg>` 의 경계 상자. `display:none` 인 lg+ 전용 컨트롤은 0 크기라 걸러진다.
        const inks = Array.from(document.querySelectorAll('header svg'))
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width > 0 && b.height > 0);
        return {
          inkCount: inks.length,
          leftGap: Math.round(
            Math.min(...inks.map((b) => b.left)) - (r.left + parseFloat(cs.paddingLeft)),
          ),
          rightGap: Math.round(
            r.right - parseFloat(cs.paddingRight) - Math.max(...inks.map((b) => b.right)),
          ),
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });

      // 잰 대상이 맞는지부터 — 0개면 위 비교가 Infinity 로 조용히 통과한다.
      expect(
        m.inkCount,
        `@${width} 헤더에서 보이는 아이콘 잉크가 2개(햄버거·검색)가 아니다`,
      ).toBe(2);

      expect(
        { leftGap: m.leftGap, rightGap: m.rightGap },
        `@${width} 헤더 잉크가 본문 여백선에서 ${inset}px 안쪽이 아니다`,
      ).toEqual({ leftGap: inset, rightGap: inset });

      // 음수 마진이 오른쪽으로 넘치면 여기서 걸린다.
      expect(m.scrollW, `@${width} 가로 스크롤이 생겼다`).toBe(m.clientW);
    }
  });
});
