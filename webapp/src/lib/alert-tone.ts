/**
 * 돌파 알림음 (Phase 18 D-17 · TRADE-06 → quick-261107-fbj 로 꺼짐).
 *
 * ① quick-261107-fbj — 돌파 알림음은 **저장값과 무관하게 꺼짐**이다(스케치 030 A 결정). /me 의 알림음
 *   토글 카드도 함께 제거했다. 예전에 이 기기에서 켜 둔 저장값(`gh-radar:breakout-tone`)이 남아 있어도
 *   읽지 않는다 — 소리를 내는 경로가 없다. Web Audio 단음 합성 구현(sine 880Hz · 160ms · 지연 생성 컨텍스트 ·
 *   자동재생 차단 판정)은 git 이력(Phase 18 D-17)에 있다.
 *
 * ② 호출부 계약은 그대로다 — `breakout-strip` · `use-trading-alerts` 는 「기록(`addSounded`) 먼저, 재생 나중」
 *   순서로 이 함수를 부른다. 이름 · 시그니처를 유지해 호출부와 그 테스트 목이 바뀌지 않는다. 되살릴 때는
 *   이 함수 본문만 바꾸면 된다.
 *
 * ③ 알림 본문·로그에 계좌번호·금액을 싣지 않는다 — 이 모듈은 아무것도 싣지 않는다.
 */

/** 돌파 알림음 1회 — 지금은 언제나 `false`(울리지 않음 · 위 ①). 오디오 컨텍스트도 만들지 않는다. */
export function playBreakoutTone(): boolean {
  return false;
}
