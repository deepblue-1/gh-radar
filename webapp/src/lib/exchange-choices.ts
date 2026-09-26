/**
 * 거래소 선택지 판정 (quick-260923-pq2) — NXT 에 상장되지 않은 종목은 세그먼트에서 NXT 를 숨긴다.
 *
 * 작업대 카드 헤더가 이 함수를 쓴다(종목상세 호가 상태줄은 Phase 21 D-31 로 호가주문 탭과 함께 사라졌다).
 * 판정을 한 곳에 둬야 표면이 늘어도 같은 종목이 화면마다 다르게 보이지 않는다.
 *
 * 원천은 relay `nxt.snap`(게이트웨이 종목마스터 57 의 `nxt_tradable`)이 채운 ISIN 집합이다.
 *   - 모름(`null`/`undefined` — 구 relay · 57 미적재 · e2e 스텁) → 둘 다. 모름을 「미거래」로
 *     읽으면 모든 종목의 NXT 가 사라진다.
 *   - 집합에 있음 → 둘 다. 없음 → 「KRX」 하나(빈 집합도 확정이다).
 *   - 현재 거래소가 이미 NXT 면 집합과 무관하게 둘 다 — 저장 배치 복원 등으로 NXT 에 선 카드가
 *     KRX 로 되돌아갈 길을 잃지 않게 한다.
 *
 * 숨김만 한다 — 거래소를 자동 전환하지 않는다. `isNxtEmpty`(D3) 휴리스틱은 플래그를 모를 때의
 * 안전망으로 그대로 둔다. 반환값은 **상수 참조**라 호출부가 memo 없이 참조 비교할 수 있다.
 */
import type { RelayExchange } from '@gh-radar/shared';

export const EXCHANGE_CHOICES_ALL: readonly RelayExchange[] = ['KRX', 'NXT'];
export const EXCHANGE_CHOICES_KRX_ONLY: readonly RelayExchange[] = ['KRX'];

export function exchangeChoicesOf(
  isin: string,
  exchange: RelayExchange,
  nxtTradable: ReadonlySet<string> | null | undefined,
): readonly RelayExchange[] {
  if (nxtTradable == null) return EXCHANGE_CHOICES_ALL;
  if (isin === '') return EXCHANGE_CHOICES_ALL;
  if (exchange === 'NXT') return EXCHANGE_CHOICES_ALL;
  if (nxtTradable.has(isin)) return EXCHANGE_CHOICES_ALL;
  return EXCHANGE_CHOICES_KRX_ONLY;
}
