/**
 * 전략 이벤트 하루 흐름 픽스처 — **테스트 전용** 재수출 (Phase 25).
 *
 * 원본은 `packages/shared/src/__fixtures__/strategy-day.ts` 한 벌이다(두 벌 금지 — relay 트레이서 ·
 * shared 골든 테스트와 같은 값). 웹 단위 테스트 · e2e 는 **이 경로만** import 한다. 제품 코드는 이 파일을
 * import 하지 않는다 — 픽스처가 번들에 들어가면 안 된다.
 */
export * from '../../../packages/shared/src/__fixtures__/strategy-day';
