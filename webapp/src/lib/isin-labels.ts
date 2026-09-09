"use client";

/**
 * Phase 16 Plan 23 (WR-08) — ISIN → 종목명·단축코드 역매핑 **단일 정본**.
 *
 * 이 파일이 생기기 전에는 같은 역할의 사본이 셋이었다(`app-sidebar` · `limit-chaser-client`
 * · `strategy-status-card`). 셋의 **동작이 서로 달라서** 계좌가 여럿일 때 사이드바만 ISIN
 * 원문을 그렸다. 사본을 줄이는 게 목적이 아니라 **동작이 갈라질 자리를 없애는 것**이 목적이다.
 *
 * 규율 (전부 이유가 있다):
 *  (a) `RelayLimitChaser` 에는 종목명도 단축코드도 **없다** — 게이트웨이가 싣지 않는다.
 *      relay 는 잔고(`hold`)·미체결(`unf`)·VI 주문에만 `stocks.isin` 역매핑으로 채워 준다.
 *  (b) 원천은 **전역 wss 스냅샷뿐**이다. 이름 하나 때문에 별도 조회 경로(REST·Supabase)를
 *      만들지 않는다(T-16-02 — 목록의 원천이 둘이 되면 화면이 두 진실을 갖는다).
 *      그래서 「모르면 ISIN 을 그대로 보여준다」가 정답이다 — `account-panel` 의
 *      `name ?? isin` 폴백과 같은 규약이다.
 *  (c) **`account`(마지막 수신 계좌)를 보지 않는다.** `accountStates` 전체를 훑는다.
 *      마지막 계좌 하나만 보면 그 계좌에 보유·미체결이 없는 종목의 전략이 `KR7005930003`
 *      같은 ISIN 원문으로 남고, 계좌 상태 프레임이 올 때마다 표시가 **왔다 갔다 한다**
 *      (WR-08). 16-23 에서 `account` 필드 자체가 계약에서 제거됐다.
 */

import { useMemo } from "react";

import { useRelayContext } from "@/lib/relay-provider";

/** ISIN 하나의 표시 라벨. 둘 다 **모를 수 있다** — 모르는 값을 지어내지 않는다. */
export interface IsinLabel {
  name?: string;
  code?: string;
}

/**
 * ISIN → 종목명·단축코드를 **이미 받은 프레임에서만** 만든다.
 *
 * 병합 규칙: 나중 프레임이 **빈 값으로 이전 값을 지우지 않는다**. `undefined`·빈 문자열은
 * 「모른다」이지 「없다」가 아니므로, 이름을 아는 프레임 뒤에 이름 없는 프레임이 오면
 * 화면에서 이름이 사라지는 깜빡임이 생긴다.
 *
 * ⚠️ `useMemo` 는 선택이 아니다. 이 훅은 사이드바·상따 폼·전략 현황 카드에서 매 렌더
 *    호출되고, 반환 Map 을 `useMemo` 의존성으로 쓰는 소비자가 있다 — 매번 새 Map 이면
 *    아래층 memo 가 전부 무효화된다.
 */
export function useIsinLabels(): ReadonlyMap<string, IsinLabel> {
  const { accountStates, viOrders } = useRelayContext();

  return useMemo(() => {
    const out = new Map<string, IsinLabel>();
    const put = (isin: string, next: IsinLabel): void => {
      const prev = out.get(isin) ?? {};
      out.set(isin, {
        name: next.name !== undefined && next.name !== "" ? next.name : prev.name,
        code: next.code !== undefined && next.code !== "" ? next.code : prev.code,
      });
    };

    // 계좌 **전체**를 훑는다 — 위 (c).
    for (const state of accountStates.values()) {
      for (const row of state.hold) put(row.isin, { name: row.name, code: row.code });
      for (const row of state.unf) put(row.isin, { name: row.name, code: row.code });
    }
    // VI 주문에는 단축코드가 없다 — 이름만 싣는다.
    for (const row of viOrders) put(row.isin, { name: row.name });

    return out;
  }, [accountStates, viOrders]);
}
