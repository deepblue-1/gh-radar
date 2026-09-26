/**
 * 같은 출처 절대 경로 판정의 **유일한 정의** (Phase 21 · WR-01 · T-21-16 · T-21-61).
 *
 * login `?next=`(WR-01) · `/auth/callback` `?next=` · 네이티브 `__ghTrade.navigate` 가 이 함수만 쓴다 —
 * 가드를 소비처마다 따로 두면 한 곳만 약해진다(로그인이 `/\evil.com` 우회에 뚫려 있던 이유).
 *
 * 허용: 문자열 · `/` 시작 · `//`(프로토콜 상대) 아님 · 역슬래시·제어문자(C0 · DEL) 없음.
 * WHATWG URL 파서는 특수 스킴에서 역슬래시를 슬래시로 읽고 탭·개행을 지운다 — 그래서 `/\evil.com` ·
 * `/<탭>/evil.com` 은 `//evil.com`(외부 호스트)이 된다. 역슬래시·제어문자를 거부해야 막힌다.
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  return !/[\\\u0000-\u001f\u007f]/.test(path);
}
