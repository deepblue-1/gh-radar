// RED 골격 — 21-04 Task 1 GREEN 에서 구현한다.
export type NativeMsgType = 'ready' | 'route' | 'theme' | 'overlay' | 'pull';

export function postNative(_type: NativeMsgType, _payload?: unknown): boolean {
  return false;
}
