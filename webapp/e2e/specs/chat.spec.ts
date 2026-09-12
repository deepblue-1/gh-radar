import { test, expect } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SK_HYNIX } from '../fixtures/stocks';
import {
  mockChatApi,
  CHAT_ASSISTANT_TEXT,
  CHAT_CONVERSATIONS,
} from '../fixtures/chat';

/**
 * Phase 14 Plan 11 — AI 애널리스트 챗봇 E2E (CHAT-01).
 *
 * baseURL=http://localhost:3100 (playwright.config, dev.sh PORT=3100 규약).
 *
 * VALIDATION (4 시나리오):
 *   1. 비로그인 `/stocks/{code}` → `/login?next=…` 로그인 벽 (260912-ok2 가 다시 썼다 —
 *      아래 케이스 주석 참조. D-01 게이트 자체는 `chat-fab.test.tsx` Test 1 이 잠근다).
 *   2. 로그인 후 FAB → 시트 open → 질문 전송 → SSE text 스트리밍(assistant 답변).
 *   3. 종목상세(/stocks/000660) FAB 라벨에 종목명 컨텍스트("SK하이닉스 분석") 표시(D-03).
 *   4. /chat 페이지 대화목록 렌더 + 삭제 다이얼로그 open/취소(T-14-11).
 *
 * ★ quick-260912-mvo Q-01 — FAB 은 더 이상 전역이 아니다. 종목상세 본문(`/stocks/{code}`)
 *   에서만 렌더되므로 1·2 도 시나리오 3 과 **같은 라우트·같은 mock**(`mockStockApi` +
 *   `/stocks/000660`)에서 FAB 을 누른다. 검증 대상(비로그인 게이트 / 시트 open + SSE)은
 *   그대로다 — 진입 지점만 새 계약에 맞췄고, 그 라우트의 FAB 가시성은 시나리오 3 이 이미 증명한다.
 *
 * SSE/대화관리는 fixtures/chat 의 결정론 mock(실서버·Anthropic 호출 없음). 스트리밍은
 * 첫 토큰/조립 텍스트 + 시트 상태 중심으로 assert(네트워크 불안정 대비).
 */

// ── Test 1: 비로그인 게이트 (파일-레벨 분리 대신 describe-레벨 storageState 초기화) ──
test.describe('Phase 14 — 챗 비로그인 게이트 (D-01)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context }) => {
    // 워커 재사용 시 누수 쿠키 제거(auth-guards.spec 동형).
    await context.clearCookies();
  });

  /*
    ★ quick-260912-ok2 — 이 시나리오는 **구조적으로 도달 불가**가 됐다. 다시 쓴다.

    무엇이 깨져 있었나: 「비로그인 사용자가 FAB 을 눌러 게이트를 본다」였는데, 두 변화가
    겹치면서 그런 사용자가 존재할 수 없게 됐다.
      ⓐ 260911-tuk — 앱 전체가 로그인 벽 뒤로 갔다. `middleware.ts` 의 공개 판정은
         `PUBLIC_PREFIXES`(`/login`·`/auth`) 하나뿐이고, 홈조차 벽 뒤다.
      ⓑ 260912-mvo Q-01 — FAB 이 전역에서 `/stocks/{code}` 본문으로 좁혀졌다.
      그 결과 「FAB 이 보이는 페이지」와 「비로그인으로 도달 가능한 페이지」의 교집합이
      **공집합**이다. 위 단언은 영원히 볼 수 없는 화면을 기다리고 있었다.

    무엇으로 다시 썼나: **현재의 진짜 계약** — 「비로그인은 `/stocks/{code}` 에 닿지 못하고
    `/login?next=…` 으로 막힌다」. `auth-guards.spec.ts` 가 `/scanner`·`/watchlist`·`/`·
    `/trading/*`·`/me` 를 잠그고 있지만 **`/stocks/{code}` 는 아무도 잠그지 않았다** —
    챗 FAB 이 사는 바로 그 표면이다. 죽은 시나리오가 새 커버리지가 된다.

    ★ **D-01 커버리지는 소실되지 않았다.** 「비로그인 클릭 → 로그인 필요 상태 + `openChat`
      미호출」은 `src/components/chat/__tests__/chat-fab.test.tsx` 의 **Test 1** 이 그대로
      잠그고 있다. 게이트 자체는 컴포넌트 계약이라 브라우저 왕복이 필요하지 않고, 브라우저가
      증명해야 하는 것(그 표면에 비로그인으로 닿을 수 있는가)은 이제 **닿지 못한다**는
      사실이다. 이 케이스가 그 사실을 본다.
  */
  test('비로그인 /stocks/{code} → /login?next 로 막힌다 (챗 FAB 표면의 로그인 벽)', async ({
    page,
  }) => {
    // 라우트가 벽에 막히는지를 보는 케이스다. mock 은 그대로 둔다 — 벽이 걷히면 이 mock
    // 위에서 페이지가 그려지고, 그때 이 단언이 정확히 그 변화를 붙잡는다.
    await mockStockApi(page, {
      detailByCode: { '000660': FIXTURE_SK_HYNIX },
    });
    await page.goto('/stocks/000660');

    // `next` 는 **한 번만** 인코딩된다 — `auth-guards.spec.ts` 와 같은 규약이다.
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent('/stocks/000660')}$`),
    );

    // 벽 뒤의 것은 무엇도 렌더되지 않는다 — FAB 도, 챗 게이트 박스도, 입력창도.
    await expect(page.getByRole('button', { name: /^AI/ })).toHaveCount(0);
    await expect(page.getByText('로그인이 필요해요')).toHaveCount(0);
    await expect(page.getByLabel('메시지 입력')).toHaveCount(0);

    // 로그인 화면의 진입점은 실제로 있다 — 벽에 막힌 사용자가 갈 곳이 없으면 벽이 아니라 벽돌이다.
    await expect(page.getByRole('button', { name: 'Google로 로그인' })).toBeVisible();
  });
});

// ── Test 2~4: 로그인 상태(config chromium storageState 자동 주입) ──
test.describe('Phase 14 — 챗 로그인 플로우 (CHAT-01)', () => {
  test('로그인 후 FAB → 시트 open → 질문 전송 → SSE 스트리밍', async ({
    page,
  }) => {
    // quick-260912-mvo Q-01 — 홈(`/`)에는 FAB 이 없다. 시나리오 3 과 같은 종목상세
    // 라우트·mock 에서 누른다(SSE 검증 자체는 라우트와 무관하다).
    await mockStockApi(page, {
      detailByCode: { '000660': FIXTURE_SK_HYNIX },
    });
    await mockChatApi(page);
    await page.goto('/stocks/000660');
    await page.waitForLoadState('networkidle');

    // FAB 클릭 → 시트 open(로그인 상태이므로 openChat). 라벨은 접두로 잡는다.
    const fab = page.getByRole('button', { name: /^AI/ });
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();

    // 시트 열림 — composer 입력창.
    const input = page.getByLabel('메시지 입력');
    await expect(input).toBeVisible();

    // 질문 전송(Enter) → SSE 스트리밍.
    await input.fill('오늘 주도 테마 알려줘');
    await input.press('Enter');

    // assistant 답변 텍스트(SSE text 이벤트 조립 결과)가 thread 에 나타난다.
    await expect(page.getByText(CHAT_ASSISTANT_TEXT)).toBeVisible({
      timeout: 10_000,
    });

    // 미니 종목카드(stock_card 블록) → /stocks/000660 링크로 렌더.
    await expect(page.locator('a[href="/stocks/000660"]').first()).toBeVisible();
  });

  test('종목상세 FAB 라벨에 종목명 컨텍스트 표시(D-03)', async ({ page }) => {
    await mockStockApi(page, {
      detailByCode: { '000660': FIXTURE_SK_HYNIX },
    });
    await page.goto('/stocks/000660');

    // 종목 상세 로드 → setStockContext 발행 → FAB 라벨이 종목명 컨텍스트를 반영.
    // aria-label 은 `AI · SK하이닉스 분석`.
    const fab = page.getByRole('button', {
      name: /AI · SK하이닉스 분석/,
    });
    await expect(fab).toBeVisible({ timeout: 10_000 });

    // 라벨 본문에도 "SK하이닉스 분석" 서브라인 노출.
    await expect(fab.getByText('SK하이닉스 분석')).toBeVisible();
  });

  test('/chat 대화목록 렌더 + 삭제 다이얼로그 open/취소(T-14-11)', async ({
    page,
  }) => {
    await mockChatApi(page);
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // 대화 목록(updatedAt desc) — 최신 대화가 상단.
    await expect(
      page.getByText(CHAT_CONVERSATIONS[0]!.title!),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(CHAT_CONVERSATIONS[1]!.title!)).toBeVisible();

    // 종목 배지(000660) + 종목 필터 select 노출.
    await expect(page.getByLabel('종목 필터')).toBeVisible();

    // 첫 대화의 🗑(대화 삭제) → 삭제 확인 다이얼로그 open.
    await page.getByRole('button', { name: '대화 삭제' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText('이 대화를 삭제할까요?'),
    ).toBeVisible();
    await expect(
      dialog.getByText('삭제한 대화는 되돌릴 수 없어요.'),
    ).toBeVisible();

    // 취소 → 다이얼로그 닫힘 + 대화는 그대로 유지(파괴적 액션 방지).
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(CHAT_CONVERSATIONS[0]!.title!)).toBeVisible();
  });
});
