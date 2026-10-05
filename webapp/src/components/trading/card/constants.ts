/**
 * 상따 카드 공용 상수 — 무거운 클라이언트 컴포넌트 모듈(`strategy-card.tsx`)을 끌어오지 않고 읽게 따로 둔다
 * (27-REVIEW IN-05 — `/me` 상따 기본설정이 이 두 값 때문에 카드 모듈 전체를 import 하던 결합을 끊는다).
 */

/**
 * 전송 후 「미반영」 판정까지의 대기(ms).
 * WinForms `RespTimeoutMs=3000` 과 **같은 값**이다 — 두 클라이언트가 다른 시각에 다른 말을
 * 하면 사용자가 어느 쪽을 믿을지 알 수 없다.
 */
export const ACK_TIMEOUT_MS = 3_000;

/**
 * `@container/lc` — §2.2b 4밴드를 재는 컨테이너 선언(①). **이 파일이 유일한 출처**다.
 *
 * 종목상세 호가 탭(`stock-orderbook-section.tsx`)은 카드가 아니라 탭 본문 래퍼가 이 선언을 달아야
 * 하므로 이 상수를 import 해 쓴다 — 문자열을 그 파일에 다시 적지 않는다. (옛 상따 화면도 그랬다 · 18-13 삭제)
 * ★ 문자열 리터럴 그대로 둔다 — Tailwind 가 소스를 스캔해 이 클래스를 만든다.
 */
export const LC_CONTAINER_CLASS = "@container/lc";
