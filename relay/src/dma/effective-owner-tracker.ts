/**
 * Phase 29-44 — G-1 ⑤c (가) 보강. 전 DMA 유저 × 계좌의 **유효 주문 서버** 스냅샷과 그 변화(`OwnerMove`).
 *
 * 왜 필요한가 (gh-trade-84 ②(가) · 29-29-SUMMARY §후속): 서버의 `user_id@BROKER` 세션은 relay 연결이 0 이어도 지워지지 않고 그
 * 세션의 전략(상따 · VI · 자동매도)과 미체결이 남아 **옛 서버에서 실주문을 낼 수 있다.** 29-36 의 연결 중 경로(`fanout` 사용자별
 * 서명 diff)는 브라우저를 열어 둔 사용자만 본다 — 웹에서 상따를 켜고 탭을 닫은 트레이더의 계좌를 Admin 이 옮기면 그 경로는 그
 * 사용자를 보지 못한다. 이 트래커는 서버 매핑(79/87) · 계좌별 지정 · 레지스트리만으로 계산하므로 **연결 유무와 무관하게** 「옮겨진
 * 계좌」 를 안다(fanout `sweepMoved` 가 옛 서버 임시 세션으로 끈다).
 *
 * 계산 (두 벌 금지 — 29-33 `createOrderServerRouting().effectiveOrderServer` 를 주입받는다):
 *   - 대상 DMA 유저 = `dmaUserIds()`(운영: 모든 서버 파이프라인 매핑의 합집합).
 *   - 그 유저 계좌 = 모든 서버(`servers()`) 매핑의 합집합 · 계좌의 증권사 = 그 계좌가 실린 서버의 레지스트리 증권사.
 *   - 유효 서버(`effective`) = 지정 ?? 증권사 기본 주문 서버. 소유 서버(`owner`) = 유효 서버 매핑에 그 계좌가 있을 때만 그 키,
 *     아니면 undefined(29-33 fail closed — 지정 서버가 아직 계좌를 모르면 아무 세션도 그 계좌를 소유하지 않는다).
 *   - `refresh()` 는 직전 스냅샷과 견주어 **두 스냅샷 모두에 있는 계좌** 중 소유 서버가 바뀐 것만 낸다. 매핑에서 사라진 계좌 ·
 *     새로 보인 계좌는 옮겨짐이 아니다(87 축소 · 확장 — 29-36 「선언 목록에서 빠진 계좌는 옮겨짐이 아니다」 와 같은 규율).
 *   - 첫 `refresh()` 는 기준선만 잡는다(0). 지정 첫 적재 전(`ready()` false)에는 기준선을 잡지 않는다 — 미적재 사본(지정 없음)을
 *     기준선으로 삼으면 첫 적재가 「지정된 계좌 전부 기본 서버 → 지정 서버」 로 보여 부팅마다 대량 sweep 이 난다.
 *   - `snapshotOf(dmaUserId)` 는 그 유저의 **지금 값**을 계산해 돌려준다(기준선 불변) — 로그인 백스톱 · 재시도의 「지금 누가 주문
 *     서버인가」 판정 원천.
 *
 * 하지 않는 것: 로그(이 모듈은 아무것도 남기지 않는다 — DMA id · 계좌번호 무로그 · D-19 · T-16-09) · 세션 · 끄기(fanout 몫).
 */
import { isDmaBroker, type DmaBroker } from "../registry/registry.js";

/** 계좌 1건의 유효 주문 서버(소유 서버) 변화. `from` · `to` undefined = 그 시점 소유자 없음(29-33 fail closed). */
export type OwnerMove = {
  dmaUserId: string;
  broker: DmaBroker;
  accountNo: string;
  from: string | undefined;
  to: string | undefined;
};

/** 계좌 1건의 지금 값. */
export type OwnerSnapshotEntry = {
  broker: DmaBroker;
  accountNo: string;
  /** 소유 서버 — 유효 서버 매핑에 계좌가 있을 때만 그 키, 아니면 undefined. */
  owner: string | undefined;
  /** 유효 서버(지정 ?? 증권사 기본) — 그 매핑에 계좌가 없어도 키. 「이 서버의 전략은 끄면 안 된다」 판정 원천. */
  effective: string | undefined;
  /** 그 계좌가 매핑(users.toml)에 실린 서버 키 — `servers()` 순서. */
  servers: readonly string[];
};

export type EffectiveOwnerTrackerDeps = {
  /** 대상 DMA 유저 (운영: 모든 서버 파이프라인 매핑의 합집합). */
  dmaUserIds: () => Iterable<string>;
  /** 그 서버 매핑의 그 DMA 유저 계좌 (운영: `pipelines.get(key)?.access.accountsOf`). */
  accountsOf: (serverKey: string, dmaUserId: string) => ReadonlySet<string> | undefined;
  /** 매핑을 볼 서버와 그 증권사 (운영: 지금 파이프라인 — 레지스트리 enabled). */
  servers: () => ReadonlyArray<{ key: string; broker: string }>;
  /** 29-33 유효 주문 서버(지정 ?? 증권사 기본). */
  effectiveOrderServer: (dmaUserId: string, broker: DmaBroker, accountNo: string) => string | undefined;
  /** 지정 첫 적재가 끝났는가. false 면 `refresh` 는 기준선을 잡지 않는다. 미주입 = 늘 true. */
  ready?: () => boolean;
};

type UserSnapshot = Map<string, OwnerSnapshotEntry>;

function entryKey(broker: string, accountNo: string): string {
  return `${broker}|${accountNo}`;
}

export class EffectiveOwnerTracker {
  readonly #deps: EffectiveOwnerTrackerDeps;
  /** 기준선 — 마지막 `refresh` 의 전 사용자 스냅샷. 첫 기준선 전 null. */
  #snap: Map<string, UserSnapshot> | null = null;

  constructor(deps: EffectiveOwnerTrackerDeps) {
    this.#deps = deps;
  }

  /**
   * 지금 값을 계산해 기준선과 견주고 기준선을 교체한다. 첫 호출(그리고 `ready()` 전)은 0.
   * @returns 소유 서버가 바뀐 계좌(두 스냅샷 모두에 있는 계좌만)
   */
  refresh(): OwnerMove[] {
    if (this.#deps.ready !== undefined && !this.#deps.ready()) return [];
    const servers = this.#deps.servers();
    const next = new Map<string, UserSnapshot>();
    for (const dma of this.#deps.dmaUserIds()) {
      const snap = this.#compute(dma, servers);
      if (snap.size > 0) next.set(dma, snap);
    }
    const prev = this.#snap;
    this.#snap = next;
    if (prev === null) return [];
    const moves: OwnerMove[] = [];
    for (const [dma, before] of prev) {
      const after = next.get(dma);
      if (after === undefined) continue;
      for (const [key, p] of before) {
        const n = after.get(key);
        if (n === undefined || n.owner === p.owner) continue;
        moves.push({ dmaUserId: dma, broker: p.broker, accountNo: p.accountNo, from: p.owner, to: n.owner });
      }
    }
    return moves;
  }

  /** 그 DMA 유저의 지금 값(계좌 키 `${broker}|${accountNo}` → 항목). 기준선을 바꾸지 않는다. 매핑에 없으면 빈 맵. */
  snapshotOf(dmaUserId: string): ReadonlyMap<string, OwnerSnapshotEntry> {
    return this.#compute(dmaUserId, this.#deps.servers());
  }

  #compute(dma: string, servers: ReadonlyArray<{ key: string; broker: string }>): UserSnapshot {
    const registered = new Map<string, { broker: DmaBroker; accountNo: string; servers: string[] }>();
    for (const s of servers) {
      if (!isDmaBroker(s.broker)) continue;
      for (const accountNo of this.#deps.accountsOf(s.key, dma) ?? []) {
        const key = entryKey(s.broker, accountNo);
        const r = registered.get(key) ?? { broker: s.broker, accountNo, servers: [] };
        r.servers.push(s.key);
        registered.set(key, r);
      }
    }
    const out: UserSnapshot = new Map();
    for (const [key, r] of registered) {
      const effective = this.#deps.effectiveOrderServer(dma, r.broker, r.accountNo);
      const owner =
        effective !== undefined && this.#deps.accountsOf(effective, dma)?.has(r.accountNo) === true ? effective : undefined;
      out.set(key, { broker: r.broker, accountNo: r.accountNo, owner, effective, servers: r.servers });
    }
    return out;
  }
}
