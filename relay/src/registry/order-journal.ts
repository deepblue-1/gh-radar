/**
 * Phase 29 Plan 22 — D-10 · Discretion(RESEARCH Open Q6 권고 — 503 축 = KB 주문 서버 저널). **「지금 KB 주문 서버」 저널 상태 한 원천.**
 *
 * 브라우저 `journal.state`(인증 직후 스냅샷 · 전이 푸시)와 `/healthz` `journal`(503 판정 축)은 같은 서버의 `JournalStatus` 를 봐야
 * 한다 — 배지와 운영 알림이 어긋나지 않게(Phase 19 D-04). 29-03 은 브라우저 쪽을 **부팅 때의** KB 주문 서버 파이프라인에 고정했고
 * healthz 만 요청마다 현재 서버를 봤다. 이 모듈이 둘을 **현재 KB 주문 서버**(레지스트리 `orderServerOf("KB")` → 그 키의 파이프라인)
 * 하나로 묶는다:
 *
 *   frame() · health(nowMs)  호출마다 `current()` — Admin 이 주문 서버를 바꾸면 다음 스냅샷 · 다음 healthz 부터 새 서버.
 *   watch(status)            파이프라인이 생길 때마다(`ServerPipelines.onCreated`) 그 상태의 `frame` 이벤트를 건다. 이벤트 시점에
 *                            그 상태가 현재 주문 서버의 것일 때만 흘린다 — 다른 서버(예비 서버 · 교보) 끊김을 webapp 이 「기록 지연」
 *                            으로 오인하지 않게(quick-260929-c8e 규율 그대로).
 *   refresh()                레지스트리 재적재 · 파이프라인 sync 뒤 부른다. 현재 상태 객체가 바뀌었으면(주문 서버 전환 · 같은 키
 *                            재생성) 새 서버의 지금 프레임을 1건 흘린다 — 전환 직후 브라우저 배지가 옛 서버 상태에 머물지 않게.
 *
 * G-1 재검토 (Phase 29-43 — 계좌별 주문 서버):
 *   계좌마다 주문 서버를 고를 수 있게 된 뒤에도 이 원천은 **「증권사 기본 KB 주문 서버」 저널 그대로**다. 바꾸지 않는 이유 —
 *   (1) healthz `journal` 은 503 축이고, 지정 서버를 축에 넣으면 추가 서버를 본문 전용으로 둔 이유(교보 터널 재로그인 · 배포
 *   `curl -sf` · 롤아웃 거부 — quick-260929-c8e)가 되살아난다. (2) uptime 고정 경로(`brokers.{KB,KYOBO}` · `journal`)가 계좌 지정에
 *   흔들리면 알림의 의미가 바뀐다. (3) 브라우저 배지는 한 사용자 화면이 아니라 relay 기록 파이프라인의 건강이라 계좌별로 갈 이유가
 *   없다. 계좌 지정 서버들의 저널과 옛 서버에 남아 끄지 못한 전략(gh-trade-84 ② (가))은 healthz 본문 전용
 *   `accountOrderServers.<키> = { accounts, alerting, staleAccounts }` 로만 드러낸다(`order-api.ts`).
 *
 * 하지 않는 것:
 *   - 레지스트리 · 파이프라인을 직접 알지 않는다(`current` 주입 — index.ts 결선 · 테스트 스텁).
 *   - 리스너를 떼지 않는다 — 리스너는 상태 객체와 수명이 같다(파이프라인 retire 가 `status.close()` 로 함께 버린다).
 */
import type { RelayJournalStateMsg } from "@gh-radar/shared";

import type { JournalHealth } from "../journal/types.js";

/** `JournalStatus` 중 이 모듈이 쓰는 표면. 테스트는 스텁을 넣는다. */
export type OrderJournalStatusView = {
  frame(): RelayJournalStateMsg | null;
  health(nowMs: number): JournalHealth;
  on(event: "frame", listener: (frame: RelayJournalStateMsg) => void): unknown;
};

export type OrderServerJournalDeps = {
  /** 지금 KB 주문 서버 파이프라인의 상태. 없으면 undefined(스냅샷 · healthz `journal` 없음). 호출마다 현재 값을 돌려준다. */
  current: () => OrderJournalStatusView | undefined;
  /** 브라우저 송신 — 운영 결선은 `fanout.deliverJournalState`. */
  onFrame: (frame: RelayJournalStateMsg) => void;
};

export class OrderServerJournal {
  readonly #deps: OrderServerJournalDeps;
  /** 마지막으로 브라우저에 흘린 원천 상태 객체 — `refresh` 가 전환을 알아보는 기준. */
  #last: OrderJournalStatusView | undefined;

  constructor(deps: OrderServerJournalDeps) {
    this.#deps = deps;
  }

  /** 인증 직후 `journal.state` 스냅샷 원천(fanout `journalState`). 모르면 null — 지어내지 않는다. */
  frame(): RelayJournalStateMsg | null {
    return this.#deps.current()?.frame() ?? null;
  }

  /** `/healthz` `journal` 원천(order-api `journal`). 현재 주문 서버 파이프라인이 없으면 undefined — 판정에서 빠진다. */
  health(nowMs: number): JournalHealth | undefined {
    return this.#deps.current()?.health(nowMs);
  }

  /** 파이프라인 상태 하나를 지켜본다 — 그 상태가 이벤트 시점의 현재 주문 서버 것일 때만 흘린다. */
  watch(status: OrderJournalStatusView): void {
    status.on("frame", (frame) => {
      if (this.#deps.current() !== status) return;
      this.#last = status;
      this.#deps.onFrame(frame);
    });
  }

  /**
   * 현재 원천이 바뀌었으면 새 원천의 지금 프레임을 1건 흘린다(모르면 null — 보내지 않는다).
   * @returns 원천이 바뀌었는가
   */
  refresh(): boolean {
    const current = this.#deps.current();
    if (current === this.#last) return false;
    this.#last = current;
    const frame = current?.frame() ?? null;
    if (frame !== null) this.#deps.onFrame(frame);
    return true;
  }
}
