import { redirect } from 'next/navigation';

/**
 * `/trading/limit-chaser/new` — 옛 「새 상따 전략 빈 폼」. **`/trading` 으로 보낸다** (Phase 18 D-02).
 *
 * 새 전략은 작업대의 「종목 추가」·돌파 칩이 카드로 만든다. 빈 폼 화면은 더 이상 없다.
 *
 * 서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서
 * 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다.
 */
export default function LimitChaserNewPage() {
  redirect('/trading');
}
