/**
 * radio-keys — WAI-ARIA radio group 화살표 문법 한 벌(quick-261107-iep).
 *
 * `MeAccountChips` ②(계좌 칩)와 `LaunchServerChips`(발사 서버 칩)가 같이 쓴다 — 목표 칩 index 계산만 둔다.
 * 포커스 이동 · 선택(가드 · 잠금)은 쓰는 곳이 한다.
 *
 * - ArrowRight · ArrowDown = 다음 칩(끝에서 처음으로 돈다)
 * - ArrowLeft · ArrowUp = 이전 칩(처음에서 끝으로 돈다)
 * - Home = 처음 · End = 끝
 * - 그 밖 키 = null(쓰는 곳은 아무것도 하지 않는다 — preventDefault 도 하지 않는다)
 */
export function radioKeyTargetOf(key: string, at: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (at + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
