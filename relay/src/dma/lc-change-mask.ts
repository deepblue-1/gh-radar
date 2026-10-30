/**
 * quick-261030-kpg — 상따 `SetLimitChaser.change_mask`(id 85 · vt 174 · gh-trade Phase 44) 계산.
 *
 * 웹 lc.set 의 `changed`(사람이 이번 제출에서 손댄 칸 이름 · gh-trade D-05)를 shared 비트 표
 * (`LC_CHANGE_MASK_FIELDS` — 인덱스 = 비트)로 uint64 로 바꾼다. 짝 수량 비트(gh-trade D-10)도 이 모듈 몫이다.
 */
import { LC_CHANGE_MASK_FIELDS, isLcChangeMaskField } from "@gh-radar/shared";

/** 이름 → 비트. 모듈 로드 시 한 번 만든다. */
const BIT_OF: ReadonlyMap<string, bigint> = new Map(
  LC_CHANGE_MASK_FIELDS.map((f, i) => [f.key, 1n << BigInt(i)] as const),
);

/**
 * `changed` → `{ mask, unknown }`.
 *
 * - 비트 표 안의 이름은 자기 비트를 세우고, 표 밖 이름은 `unknown` 에 (중복 없이) 담는다.
 *   모르는 이름이 있을 때의 폴백(마스크 미적재 · warn)은 호출부(fanout — userId 를 아는 쪽)가 정한다.
 * - 짝 수량 비트 규칙(gh-trade D-10)도 이 함수 안에서 적용한다 — `cfg` 는 「추적 OFF 로 바뀔 때」 규칙이 읽는 값이다.
 * - 빈 배열 = `{ mask: 0n, unknown: [] }`. 순수 함수 — 로그를 남기지 않는다.
 */
export function lcChangeMaskOf(
  changed: readonly string[],
  cfg: { sellQtyTrackEnabled: boolean; cancelQtyTrackEnabled: boolean },
): { mask: bigint; unknown: string[] } {
  void cfg;
  let mask = 0n;
  const unknown: string[] = [];
  for (const name of changed) {
    if (isLcChangeMaskField(name)) {
      mask |= BIT_OF.get(name)!;
    } else if (!unknown.includes(name)) {
      unknown.push(name);
    }
  }
  return { mask, unknown };
}
