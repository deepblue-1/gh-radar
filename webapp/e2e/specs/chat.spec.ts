import { test, expect } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SK_HYNIX } from '../fixtures/stocks';
import { mockHomeApi, HOME_EMPTY, HOME_POPULATED } from '../fixtures/home';
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
 *   1. 비로그인 FAB 클릭 → "로그인이 필요해요" 게이트(D-01), 스트리밍 미발생.
 *   2. 로그인 후 FAB → 시트 open → 질문 전송 → SSE text 스트리밍(assistant 답변).
 *   3. 종목상세(/stocks/000660) FAB 라벨에 종목명 컨텍스트("SK하이닉스 분석") 표시(D-03).
 *   4. /chat 페이지 대화목록 렌더 + 삭제 다이얼로그 open/취소(T-14-11).
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

  test('비로그인 FAB 클릭 → "로그인이 필요해요" 게이트(스트리밍 미발생)', async ({
    page,
  }) => {
    // `/` 는 PUBLIC_EXACT — 비로그인도 공개. 홈 급등 데이터는 empty mock 으로 고정.
    await mockHomeApi(page, { response: HOME_EMPTY });
    await page.goto('/');

    // 전역 FAB(aria-label "AI 애널리스트") 노출 확인.
    const fab = page.getByRole('button', { name: 'AI 애널리스트', exact: true });
    await expect(fab).toBeVisible({ timeout: 10_000 });

    await fab.click();

    // D-01 — 로그인 필요 상태 박스(시트/스트리밍 미발생).
    await expect(page.getByText('로그인이 필요해요')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Google로 로그인' }),
    ).toBeVisible();

    // composer(입력창)는 열리지 않는다 — 시트 미오픈 확인.
    await expect(page.getByLabel('메시지 입력')).toHaveCount(0);
  });
});

// ── Test 2~4: 로그인 상태(config chromium storageState 자동 주입) ──
test.describe('Phase 14 — 챗 로그인 플로우 (CHAT-01)', () => {
  test('로그인 후 FAB → 시트 open → 질문 전송 → SSE 스트리밍', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await mockChatApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // FAB 클릭 → 시트 open(로그인 상태이므로 openChat).
    const fab = page.getByRole('button', { name: 'AI 애널리스트', exact: true });
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
    // aria-label 은 `AI 애널리스트 · SK하이닉스 분석`.
    const fab = page.getByRole('button', {
      name: /AI 애널리스트 · SK하이닉스 분석/,
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
