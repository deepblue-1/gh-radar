import { redirect } from 'next/navigation';

/**
 * `/trading/limit-chaser/[key]` — 옛 「등록된 상따 전략 편집」. **`/trading?focus={key}` 로 보낸다**
 * (Phase 18 D-02 · UI-SPEC Q-5). 작업대가 그 키의 카드를 펼친 채 연다.
 *
 * `key` 는 `{ISIN}:{accountNo}:{exchange}` 다. 경로 세그먼트로 올 때는 인코딩돼 있으므로
 * `decodeURIComponent` 로 원문을 얻고, 쿼리 값으로 옮길 때 `encodeURIComponent` 로 **다시** 싼다 —
 * 사이드바 `limitChaserHref` 와 같은 인코딩 규율이다. 작업대는 `parseStrategyKey` 로만 해석하고
 * 모양이 어긋나면 무시한다(T-18-58). 디코드가 실패하는 값(잘린 `%`)은 원문 그대로 싸서 보낸다 —
 * 작업대가 무시하므로 화면은 `/trading` 과 같다.
 *
 * `next.config` 의 정규식 리다이렉트로 옮기지 않는다 — 키가 `:` 를 품고, 디코드→재인코드를
 * 정규식으로 하는 것보다 여기서 하는 편이 기존 규율과 같다.
 *
 * 서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서
 * 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다. Next 15 는 `params` 를 **Promise 로** 넘긴다.
 */
export default async function LimitChaserEditRedirect({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  let raw = key;
  try {
    raw = decodeURIComponent(key);
  } catch {
    // 잘린 `%` — 원문을 그대로 쓴다(위 docstring).
  }
  redirect(`/trading?focus=${encodeURIComponent(raw)}`);
}
