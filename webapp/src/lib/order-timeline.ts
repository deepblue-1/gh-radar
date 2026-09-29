/**
 * order-timeline — 오늘 주문 행 펼침 **한 타임라인**의 순수 함수 (Phase 25 · D-01 ~ D-03).
 *
 * ① 무엇을 합치는가 (D-01 · D-02)
 *   주문(묶음) 1건의 저널 통보(A/E/C/M/R — `dma_journal_events`)와 상따 전략 이벤트(`dma_strategy_events`)를
 *   `gw_time_ms` 순 한 목록으로 만든다. 묶음 행(3초 창 — `mergeOrderNotices`)은 구성원 전체의 이벤트를 한
 *   타임라인에 그리고 줄마다 주문번호 꼬리를 단다(채택 2-A).
 *
 * ② 줄 순서 (Pitfall 9)
 *   `compareTimelineAsc`(shared — RPC `ORDER BY` 와 같은 한 정의) 하나다: ms → 같은 ms 는 **통보 → 상따** →
 *   seq. 통보 seq 와 전략 seq 는 별도 공간이라 seq 만으로 섞지 않는다. 라이브로 끼워 넣은 줄도 같은 비교로
 *   자리를 잡는다 — 끝에 붙이지 않는다(D-03).
 *
 * ③ 통보 문장 — gh-trade 템플릿 v0 + 대조 합의(2026-09-29)가 정본이다. **재작성하지 않는다.**
 *   행위 단어만 앞 굵은 칸(`action`)으로 올리고 나머지는 원문 단어 · 숫자 · 순서 그대로다(UI-SPEC R7).
 *   판정 입력은 `notice_type` · `request_kind` · `side_trusted` · `side` · `result_code` · `local_reject` ·
 *   `org_order_no` · `board` 뿐이고 `message` 는 거부 줄 꼬리(` — {message}`)로 **붙이기만** 한다 — 문구를
 *   파싱하지 않는다(D-36 · T-25-35). 804 거부에서 서버가 문구를 교체하므로 문구 분기는 조용히 틀어진다.
 *
 * ④ 상따 문장 — `timelineStrategyText`(shared 조립기 — D-09) 결과를 **그대로** 쓴다. 여기서 문장 조각을
 *   다시 자르거나 잇지 않는다 — 문장 형식이 바뀌어도 조립기 한 곳만 고치게.
 *
 * ⑤ 체결 누적 (대조 질문 ②)
 *   주문번호별 통보 E 를 seq 순으로 더한 **running sum** 이다(행의 `filledQty` 는 최종 누적이라 중간 줄에 쓰면
 *   모든 조각이 최종값으로 보인다). 분모 = 그 주문 행 `qty` · 전량 = `running + modifiedQty ≥ qty`(DB 투영과
 *   같은 규칙 — 정정 이동분을 빼면 남은 조각이 영원히 「부분」) · `qty` 를 모르면 분모 없이.
 */

import {
  compareTimelineAsc,
  formatKstMs,
  timelineRowKey,
  timelineStrategyText,
  type JournalEventRow,
  type JournalOrderRow,
  type OrderTimelineRow,
  type StrategyEventRow,
} from "@gh-radar/shared";

import { RECEIPT_UNKNOWN_RESULT_CODE, type MergedOrderNotice } from "./order-notices";

/** 펼침 재조회 trailing 디바운스 — 조각 체결 폭주 시 Cloud Run 왕복 폭주 방지(UI-SPEC R19 · Pitfall 10). */
export const TIMELINE_REFETCH_DEBOUNCE_MS = 400;

/** 타임라인 한 줄 — 표면은 이 값을 배치만 한다(문자열을 다시 조립하지 않는다). */
export interface TimelineLine {
  /** `timelineRowKey` — React 키 · 중복 제거 키. */
  key: string;
  source: OrderTimelineRow["source"];
  gwTimeMs: number;
  /** KST `HH:MM:SS.mmm`. */
  time: string;
  /** 행위 단어(600). */
  action: string;
  /** 나머지 문장(`--muted-fg`). 빈 문자열일 수 있다(거래소 취소 잔량 0 · 모르는 통보). */
  text: string;
  /** 통보 체결 누적 꼬리 `(누적 N/M)`. 상따 줄 · 분모 모름은 `null`. */
  cumTail: string | null;
  /** 묶음 행에서만 — 그 줄의 구성원 주문번호. 단건은 `null`. */
  orderNo: string | null;
}

/** 통보 줄 문장 — 행위 + 나머지 + 누적 꼬리. */
export interface JournalLineText {
  action: string;
  text: string;
  cumTail: string | null;
}

/** 통보 문장의 판단 문맥 — 그 줄의 주문 행 · running sum · 묶음 구성원. */
export interface JournalLineContext {
  /** 이 통보의 `order_no` 와 같은 구성원 행. 모르면(구성원 밖) `undefined`. */
  row?: JournalOrderRow;
  /** E 의 주문번호별 누적(이 줄까지). E 가 아니거나 모르면 `null`. */
  running: number | null;
  members: readonly JournalOrderRow[];
}

const NUM = new Intl.NumberFormat("ko-KR");

/** 시간외종가 보드 — 이 둘만이다(`order-notices` 와 같은 규율 · 벽시계로 판정하지 않는다). */
const AFTER_HOURS_BOARDS: ReadonlySet<string> = new Set(["G2", "G3"]);

/** 방향 단어 — `side_trusted ∧ side` 일 때만 매수/매도, 그 밖은 「주문」(대조 합의 · 25-05 통일). */
function sideWord(ev: JournalEventRow): string {
  if (ev.sideTrusted && ev.side === "B") return "매수";
  if (ev.sideTrusted && ev.side === "S") return "매도";
  return "주문";
}

const qtyPrice = (qty: number, price: number): string => `${NUM.format(qty)}주 @${NUM.format(price)}`;

/** 거부 꼬리 — message 가 있을 때만, 원문 그대로. */
const reasonTail = (message: string): string => (message === "" ? "" : `— ${message}`);

/** 공백으로 잇되 빈 조각은 뺀다. */
const joinSpace = (...parts: string[]): string => parts.filter((p) => p !== "").join(" ");

/**
 * 통보 1건 → 줄 문장 (Context 문장 표 그대로 · 위 ③).
 *
 * board G2/G3 는 문장 앞에 「시간외종가 」 — 방향 있는 줄(접수 · 체결 · 신규 거부)은 방향 단어와 붙어
 * 「시간외종가 매수 …」, 취소 · 정정 확인은 문장 앞에만 붙는다(D-15 · 행위 단어 칸은 건드리지 않는다).
 */
export function journalTimelineLine(ev: JournalEventRow, ctx: JournalLineContext): JournalLineText {
  const line = baseLine(ev, ctx);
  if (line.board && AFTER_HOURS_BOARDS.has(ev.board)) {
    return { ...line.out, text: joinSpace("시간외종가", line.out.text) };
  }
  return line.out;
}

/** 문장 표 본체 — `board` = 시간외종가 접두를 받을 줄인가. */
function baseLine(
  ev: JournalEventRow,
  ctx: JournalLineContext,
): { out: JournalLineText; board: boolean } {
  const plain = (action: string, text: string, board = true) => ({
    out: { action, text, cumTail: null },
    board,
  });

  switch (ev.noticeType) {
    case "A": {
      const body = `${sideWord(ev)} ${qtyPrice(ev.orderQty, ev.orderPrice)}`;
      // 예약 주문 Q-ID — 번호를 문장 끝에(템플릿 v0).
      return ev.orderNo.startsWith("Q")
        ? plain("예약 접수", `${body} ${ev.orderNo}`)
        : plain("접수", body);
    }
    case "E": {
      const qty = ctx.row?.qty ?? null;
      const running = ctx.running;
      const exec = qtyPrice(ev.execQty, ev.execPrice);
      if (qty === null || running === null) {
        return plain("체결", `${sideWord(ev)} ${exec}`);
      }
      const cumTail = `(누적 ${NUM.format(running)}/${NUM.format(qty)})`;
      const full = running + (ctx.row?.modifiedQty ?? 0) >= qty;
      return full
        ? { out: { action: "전량 체결", text: exec, cumTail }, board: true }
        : { out: { action: "체결", text: `${sideWord(ev)} ${exec}`, cumTail }, board: true };
    }
    case "C": {
      // 원주문 번호가 비었거나 자기 번호 = 거래소 자동취소(IOC 잔량 · 시간외 미체결 등).
      const exchange = ev.orgOrderNo === "" || ev.orgOrderNo === ev.orderNo;
      if (exchange) {
        return plain("거래소 취소", ev.orderQty === 0 ? "" : `잔량 ${NUM.format(ev.orderQty)}주`);
      }
      return plain("취소 확인", `잔량 ${NUM.format(ev.orderQty)}주`);
    }
    case "M": {
      // 새 번호 행의 qty 는 DB 가 원주문 잔량으로 캡한 값(m23) — 이벤트 원문은 요청 에코라 유령 잔량이 섞인다.
      const moved = ctx.row !== undefined && ctx.row.orderNo === ev.orderNo ? ctx.row.qty : null;
      return moved !== null
        ? plain("정정 확인", qtyPrice(moved, ev.orderPrice))
        : plain("정정 확인", `요청 ${qtyPrice(ev.orderQty, ev.orderPrice)}`);
    }
    case "R": {
      const tail = reasonTail(ev.message);
      if (ev.requestKind === "Cancel") return plain("거부", joinSpace("취소 거부", tail));
      if (ev.requestKind === "Modify") return plain("거부", joinSpace("정정 거부", tail));
      if (ev.resultCode === RECEIPT_UNKNOWN_RESULT_CODE) return plain("접수 불명", tail, false);
      const body = `${sideWord(ev)} ${qtyPrice(ev.orderQty, ev.orderPrice)}`;
      return ev.localReject
        ? plain("거부", joinSpace(body, "서버 거부(미전송)", tail))
        : plain("거부", joinSpace(body, tail));
    }
    default:
      // 모르는 통보 — 지어내지 않고 원문 코드(D-10). 빈 값이면 출처 이름.
      return plain(ev.noticeType === "" ? "통보" : ev.noticeType, "", false);
  }
}

/** 구성원 주문번호 — null 제외 · 중복 제거 · 순서 유지(= 조회 `orderNos`). */
export function memberOrderNos(members: readonly JournalOrderRow[]): string[] {
  const out: string[] = [];
  for (const m of members) {
    if (m.orderNo !== null && !out.includes(m.orderNo)) out.push(m.orderNo);
  }
  return out;
}

/** 펼칠 수 있는 행 — 구성원 중 주문번호가 하나라도 있다(UI-SPEC 결정 8-A · 없는 이벤트를 지어내지 않는다). */
export function isExpandable(notice: Pick<MergedOrderNotice, "orderNoText">): boolean {
  return notice.orderNoText !== null;
}

/** 그 줄이 속한 구성원 주문번호 — 통보는 자기 번호, 새 번호로 온 취소/정정 확인은 원주문 번호. */
function memberOrderNoOf(row: OrderTimelineRow, members: ReadonlySet<string>): string | null {
  const { orderNo } = row.event;
  if (members.has(orderNo)) return orderNo;
  if (row.source === "journal" && members.has(row.event.orgOrderNo)) return row.event.orgOrderNo;
  return orderNo === "" ? null : orderNo;
}

/**
 * 응답(+ 라이브 전략 행) → 줄 목록.
 *
 * `timelineRowKey` 로 중복을 없애고(재조회 응답과 라이브 행이 겹친다) `compareTimelineAsc` 로 정렬한 뒤,
 * 통보 E 의 주문번호별 running sum 을 seq 순으로 매긴다(위 ⑤).
 */
export function buildTimeline(
  rows: readonly OrderTimelineRow[],
  members: readonly JournalOrderRow[],
  { bundled }: { bundled: boolean },
): TimelineLine[] {
  const unique = new Map<string, OrderTimelineRow>();
  for (const r of rows) {
    const key = timelineRowKey(r);
    if (!unique.has(key)) unique.set(key, r);
  }
  const sorted = [...unique.entries()].sort(([, a], [, b]) => compareTimelineAsc(a, b));

  // 주문번호별 running sum — 통보 seq 순(같은 소스 안의 순서 정본).
  const running = new Map<string, number>();
  const fills = sorted
    .filter(([, r]) => r.source === "journal" && r.event.noticeType === "E")
    .sort(([, a], [, b]) => a.seq - b.seq);
  const acc = new Map<string, number>();
  for (const [key, r] of fills) {
    const ev = r.event as JournalEventRow;
    const next = (acc.get(ev.orderNo) ?? 0) + ev.execQty;
    acc.set(ev.orderNo, next);
    running.set(key, next);
  }

  const rowByNo = new Map<string, JournalOrderRow>();
  for (const m of members) if (m.orderNo !== null && !rowByNo.has(m.orderNo)) rowByNo.set(m.orderNo, m);
  const memberNos = new Set(rowByNo.keys());

  return sorted.map(([key, r]) => {
    const text =
      r.source === "journal"
        ? journalTimelineLine(r.event, {
            row: rowByNo.get(r.event.orderNo),
            running: running.get(key) ?? null,
            members,
          })
        : { ...timelineStrategyText(r.event), cumTail: null };
    return {
      key,
      source: r.source,
      gwTimeMs: r.gwTimeMs,
      time: formatKstMs(r.gwTimeMs),
      action: text.action,
      text: text.text,
      cumTail: text.cumTail,
      orderNo: bundled ? memberOrderNoOf(r, memberNos) : null,
    };
  });
}

/**
 * relay 스토어 `strategyEvents` → 펼친 행에 끼워 넣을 전략 행 (D-03).
 *
 * 같은 계좌 · 같은 거래일 · 주문번호 ∈ 구성원만 — 시세 이벤트(주문번호 "")는 주문 타임라인이 아니다.
 * 스토어는 relay 가 계좌 권한으로 이미 거른 푸시다(T-25-33 — 가시성 판정은 서버 몫).
 */
export function liveStrategyRows(
  storeEvents: readonly StrategyEventRow[],
  members: readonly JournalOrderRow[],
  accountNo: string,
  tradeDate: string,
): OrderTimelineRow[] {
  const nos = new Set(memberOrderNos(members));
  const out: OrderTimelineRow[] = [];
  for (const ev of storeEvents) {
    if (ev.accountNo !== accountNo || ev.tradeDate !== tradeDate) continue;
    if (ev.orderNo === "" || !nos.has(ev.orderNo)) continue;
    out.push({ source: "strategy", gwTimeMs: ev.gwTimeMs, seq: ev.seq, event: ev });
  }
  return out;
}

/**
 * 재조회 트리거 시그니처 — 구성원 id 와 **더 최신인** `lastSeq`(구성원 행 · 스토어 `journalRows` 중 큰 값).
 *
 * 통보 조각은 이벤트 푸시가 없으므로 투영 행 `lastSeq` 상승이 「통보가 더 왔다」 는 유일한 신호다. 구성원 밖
 * 행의 변화에는 바뀌지 않는다 — 다른 주문의 체결이 펼친 행을 재조회시키지 않게.
 */
export function membersSeqSignature(
  members: readonly JournalOrderRow[],
  journalRows: readonly JournalOrderRow[],
): string {
  const ids = new Set(members.map((m) => m.id));
  const pushed = new Map<string, number>();
  for (const r of journalRows) {
    if (!ids.has(r.id)) continue;
    pushed.set(r.id, Math.max(pushed.get(r.id) ?? r.lastSeq, r.lastSeq));
  }
  return members.map((m) => `${m.id}:${Math.max(m.lastSeq, pushed.get(m.id) ?? m.lastSeq)}`).join("|");
}
