import { redirect } from 'next/navigation';

/**
 * `/trading/vi` — 옛 VI 화면. **`/trading` 으로 보낸다** (Phase 18 D-02).
 *
 * VI 설정·발동은 이제 작업대의 「VI 설정 2줄」과 「VI 발동 스트립」이다. AppShell 조립은
 * 18-11 이 `app/trading/page.tsx` 로 옮겼다.
 *
 * 서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서
 * 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다.
 */
export default function ViPage() {
  redirect('/trading');
}
