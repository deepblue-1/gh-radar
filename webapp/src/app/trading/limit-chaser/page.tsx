import { redirect } from 'next/navigation';

/**
 * `/trading/limit-chaser` — 화면이 없다. **`/new` 로 보낸다** (UI-SPEC P1).
 *
 * 「상따」의 기본 상태는 목록이 아니라 **새 전략 빈 폼**이다(D-08 이후 목록은 사이드바
 * 3단이 담당한다). 여기에 별도 목록 화면을 만들면 사이드바 3단과 두 벌이 갈린다.
 *
 * 서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서
 * 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다.
 */
export default function LimitChaserIndexPage() {
  redirect('/trading/limit-chaser/new');
}
