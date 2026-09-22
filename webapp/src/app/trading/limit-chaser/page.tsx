import { redirect } from 'next/navigation';

/**
 * `/trading/limit-chaser` — 화면이 없다. **`/trading` 으로 보낸다** (Phase 18 D-02).
 *
 * 상따는 이제 `/trading` 작업대의 카드다. 옛 북마크·링크가 빈 화면에 떨어지지 않게 작업대로 모은다.
 *
 * 서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서
 * 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다.
 */
export default function LimitChaserIndexPage() {
  redirect('/trading');
}
