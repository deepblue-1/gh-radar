/**
 * order-notices — 주문 통보의 **행위 단어** 순수함수 (17-10 / D-08 · D-15).
 *
 * ① 왜 문구를 받지 않는가
 *   정정·취소 거부(804)에서 게이트웨이는 `OrderResp.message` 를 「이미 체결·취소돼
 *   취소(정정)할 잔량 없음」 으로 **교체한다**. 문구 매칭으로 만든 분기는 서버가 말을
 *   바꾸는 순간 조용히 틀어지고, 틀어진 줄은 「취소」를 「매수」로 읽히게 한다.
 *   그래서 이 파일의 어떤 함수도 문구를 **인자로 받지 않는다** — 받을 수 있게 두면
 *   언젠가 읽는다(T-17-33). 판정은 `notice_type`·`request_kind` **동등 비교**뿐이다.
 *
 * ② 왜 취소·정정에 방향이 없는가
 *   취소·정정 요청에는 매매구분이 없다. 서버 `DirectOrderReq` 에 side 칸이 있어 클라가
 *   채워 보내지만 서버는 그 값을 쓰지 않고 **그대로 에코할 뿐**이다 — 그래서 side 를
 *   그리면 **매도 주문의 취소도 「매수」** 로 보인다(gh-trade `NotificationHub.ActionWord`
 *   :466 주석). 취소·정정 행은 방향색을 쓰지 않는다.
 *
 * ③ 정본
 *   `/Users/alex/repos/gh-trade/client/Services/DMA/NotificationHub.cs`
 *   — `ActionWord`(:466) · `ActionSide`(:478) · `BuildOrderScreen`(:500 부근 board 접두).
 */

import type { JournalOrderRow } from "@gh-radar/shared";

/** 매매구분. `null` = 모른다(지어내지 않는다). */
export type NoticeSide = "B" | "S" | null;

/**
 * 행위 판정의 입력. **문구 키가 없다** (위 ①).
 */
export interface OrderActionFacts {
  /** 게이트웨이 통보 원문 1자 (`"A"`·`"E"`·`"C"`·`"M"`·`"R"`). 구 서버는 `""`. */
  noticeType: string;
  /** 요청 종류 (`"New"`·`"Modify"`·`"Cancel"`). 구 서버는 `""`. */
  requestKind: string;
  side: NoticeSide;
}

/** 시간외종가 보드 — 이 둘만이다. 벽시계로 판정하지 않는다 (D-11 과 같은 규율). */
const AFTER_HOURS_BOARDS: ReadonlySet<string> = new Set(["G2", "G3"]);

/** `requester` 의 유일한 유의미 값. 그 밖(빈 값 포함)은 메타를 붙이지 않는다. */
const MANUAL_REQUESTER = "Manual";

/**
 * 그 통보가 **무엇을 한 통보인지**. 순서가 곧 우선순위다.
 *
 * 통보 종류가 있으면 그것이 정답이다. 거부(`"R"`)·불명은 통보 종류가 행위를 말하지
 * 않으므로 서버가 실은 요청 종류(브로커 수신 전문의 정정취소구분)로 가른다.
 * 둘 다 없을 때만(신규·체결·구 서버) 매매구분으로 떨어진다.
 */
export function orderActionWord(facts: OrderActionFacts): string {
  if (facts.noticeType === "C") return "취소";
  if (facts.noticeType === "M") return "정정";
  if (facts.requestKind === "Cancel") return "취소";
  if (facts.requestKind === "Modify") return "정정";
  if (facts.side === "B") return "매수";
  if (facts.side === "S") return "매도";
  // side 를 모르고 위 분기에도 안 걸리면 **비운다**. 모르는 행위를 지어내지 않는다.
  return "";
}

/**
 * 방향색의 원천 — `orderActionWord` 가 매수/매도를 낼 때만 방향이 있다.
 * 두 함수는 같은 갈래이고 **함께 고친다**(gh-trade `ActionSide` 와 같은 규율).
 */
export function orderActionSide(facts: OrderActionFacts): NoticeSide {
  if (facts.noticeType === "C" || facts.noticeType === "M") return null;
  if (facts.requestKind === "Cancel" || facts.requestKind === "Modify") return null;
  return facts.side;
}

/** 표시 조립의 입력 — 행위 판정 + 표시 전용 2필드. */
export interface OrderNoticeFacts extends OrderActionFacts {
  /** `OrderResp.requester` — `"Manual"` 뿐이다. **표시 전용**(D-08). */
  requester: string;
  /** `OrderResp.board` — `"G2"`·`"G3"` 만 시간외종가다. */
  board: string;
}

export interface OrderNoticeLabel {
  /** 화면에 쓸 행위 단어(「시간외종가」 접두 포함). */
  text: string;
  /** 방향색 원천. 취소·정정이면 `null`. */
  side: NoticeSide;
  /** 「수동」 메타. 아니면 `""`. */
  meta: string;
}

/**
 * 화면 한 줄의 행위 표기를 조립한다.
 *
 * ★ 시간외종가 접두는 **접수·체결·거부**에만 side 단어와 함께 붙고, 취소·정정 확인에는
 *   「시간외종가」 만 붙는다(D-15 · 사용자 결정 2026-09-17). 정본 C# 에서 취소·정정 확인
 *   줄의 Lead 는 비어 있고 행위는 배지·본문(`확인`)이 말한다 — 이 표에서는 **상태 칸**이
 *   그 자리를 대신한다(`orderDisplayStatus` 가 `취소`/`정정`을 낸다).
 */
export function orderNoticeLabel(facts: OrderNoticeFacts): OrderNoticeLabel {
  const side = orderActionSide(facts);
  const action = orderActionWord(facts);
  // 접두가 붙을 자리 — 취소·정정 확인(방향 없음)은 비어 있다(위 ★).
  const lead = side === null ? "" : action;
  const text = AFTER_HOURS_BOARDS.has(facts.board)
    ? lead.length === 0
      ? "시간외종가"
      : `시간외종가 ${lead}`
    : action;
  return {
    text,
    side,
    meta: facts.requester === MANUAL_REQUESTER ? "수동" : "",
  };
}

// ===========================================================================
// 통보 묶기 (17-10 Task 2 / D-16 · T-17-34 · T-17-36)
// ===========================================================================

/**
 * 왜 묶는가 — 부분체결 조각 매도(quick-260916-fq3)에서 통보가 조각 수만큼 쏟아져
 * 「오늘 주문」 표가 한 종목으로 가득 찬다.
 *
 * ★ 무엇을 묶지 **않는가**가 더 중요하다.
 *   - **매수 접수**: 취소 직후 3초 안 재매수가 앞 줄에 합쳐지면 **이미 취소된 수량이
 *     더해져 보이고** 순서도 취소 줄 위로 올라간다(Pitfall 8 · 사용자 결정 2026-09-17).
 *   - **거부·취소확인·정정확인**: 한 건 한 건이 독립 사건이다.
 *   - **수동 발주·주체 미상**: 사람이 낸 주문은 하나하나 보여야 한다. `origin === "manual"`
 *     은 「수동」과 「출처 불명」이 **같은 값**이라(`DmaOrderRow.origin` 주석) 자동주문의
 *     증거로 쓸 수 없다 — 그래서 자동 판정은 `manual` 이 **아닐 때만** 참이다.
 *   - **라이브 통보가 없는 복원 행**: 통보가 온 적 없는 주문은 묶기의 대상이 아니다.
 *
 * ★ 창 기준은 **그 묶음의 첫 통보 시각**이다 — 슬라이딩이 아니다(T-17-36). 정본 C#
 *   (`LogPanelRenderer.FindMergeRecord` :330)은 마지막 갱신 기준 슬라이딩 창이지만,
 *   그쪽은 줄이 도착할 때마다 한 줄씩 덧붙이는 **증분 렌더러**라 성장 상한을 사람이
 *   보고 있다. 이 함수는 매 렌더마다 목록 전체를 다시 접는 순수함수이고, 슬라이딩이면
 *   통보가 계속 오는 동안 한 행이 **무한히 자란다**. 경계 `windowMs` 는 **포함**이다.
 *
 * ★ 현재 시각을 읽지 않는다. 입력 행의 `createdAt` 만 본다 — 같은 입력은 언제 불러도
 *   같은 출력이다(그래서 타이머 없이 단위 테스트로 잠긴다).
 */

/** 묶인(또는 단건인) 한 줄. */
export interface MergedOrderNotice {
  /** 대표 행 — 입력에서 **처음 만난** 행. 렌더 키·종목·행위의 정본. */
  head: JournalOrderRow;
  /** 묶인 건수. `1` 이면 묶임 표기를 붙이지 않는다. */
  count: number;
  /** 수량 합계. */
  qty: number;
  /** 단가 범위. 단가를 더하면 없는 값이 생기므로 합계가 아니다. */
  priceMin: number;
  priceMax: number;
  /** 묶음의 **첫 통보**(가장 이른) 시각 ISO. */
  at: string;
  /** 주문번호 표기 — `#첫번호~끝번호`(묶임) · 원번호(단건) · `null`(번호 없음). */
  orderNoText: string | null;
}

/** 기본 묶기 창 — 정본 C# `LogPanelRenderer.MERGE_WINDOW_MS` 와 같다. */
export const MERGE_WINDOW_MS = 3000;

/**
 * 묶기 키 — **한 곳에서만** 만든다. 분기 안에 흩뿌리면 「체결만 고치고 접수는 잊는」
 * 어긋남이 조용히 산다(정본 C# `NotificationHub.MergeKeyOf` :573 동형).
 *
 * 묶이지 않는 행은 **자기 주문번호**(없으면 행 id)가 키다 — 주문번호는 행마다 고유하므로
 * 같은 키가 둘일 수 없고, 따라서 「안 묶임」이 별도 분기 없이 성립한다.
 */
export function mergeKeyOf(row: JournalOrderRow): string {
  /* 번호가 없는 행(접수 전 거부·타임아웃)끼리 서로 묶이지 않도록 행 id 로 떨어진다. */
  const own = `NO|${row.orderNo ?? row.id}`;

  const automated = row.origin !== "manual" && row.requester !== MANUAL_REQUESTER;
  if (!automated) return own;

  const axis = `${row.origin}|${row.isin}|${row.exchange}|${row.side}`;
  // 체결은 접두 `FG`, 매도 접수는 `AG` — 접두가 달라 둘이 섞이지 않는다.
  if (row.noticeType === "E") return `FG|${axis}`;
  if (row.noticeType === "A" && row.side === "S") return `AG|${axis}`;
  return own;
}

/**
 * 주문번호 비교 — 길이가 다르면 짧은 쪽이 작다(숫자 문자열), 같으면 사전순.
 * 정본 C# `LogPanelRenderer.CompareOrderNo` 동형이다.
 */
function compareOrderNo(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 파싱 실패는 `null` — 모르는 시각으로 창을 판정하지 않는다. */
function epochOf(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

interface Group {
  out: MergedOrderNotice;
  /** 창 기준 — 그 묶음의 **첫 통보** epoch. `null`(시각 불명)이면 아무것도 붙지 않는다. */
  anchor: number | null;
  /** 출력 자리 — 묶음 구성원의 **입력 순서상 가장 앞** 인덱스. */
  headIndex: number;
  minOrderNo: string | null;
  maxOrderNo: string | null;
}

interface Item {
  row: JournalOrderRow;
  index: number;
  stamp: number | null;
}

/**
 * 오늘 주문 표가 이미 만든 행 배열 → 묶인 행 배열.
 *
 * ★ **접기는 시간 오름차순**(통보가 실제로 온 순서)으로 한다. 이 표의 행은 실측상
 *   `created_at` **내림차순**(최신 먼저)인데, 그 순서로 접으면 창 기준이 「가장 최신
 *   통보」가 되어 버려 「첫 통보 기준」이 성립하지 않는다.
 * ★ **출력 자리는 입력 순서**를 지킨다 — 묶인 행은 구성원 중 입력상 가장 앞(내림차순
 *   목록에서는 가장 최신) 자리에 선다. 서버가 준 정렬을 뒤집지 않는다.
 */
export function mergeOrderNotices(
  rows: readonly JournalOrderRow[],
  windowMs: number = MERGE_WINDOW_MS,
): MergedOrderNotice[] {
  const items: Item[] = rows.map((row, index) => ({
    row,
    index,
    stamp: epochOf(row.createdAt),
  }));
  // 시각 불명은 맨 뒤로 — 그 행은 anchor 가 `null` 이라 아무것도 흡수하지 못한다.
  const chronological = [...items].sort((a, b) => {
    const left = a.stamp ?? Number.POSITIVE_INFINITY;
    const right = b.stamp ?? Number.POSITIVE_INFINITY;
    return left === right ? a.index - b.index : left - right;
  });

  const groups: Group[] = [];
  /** 키 → 아직 창이 열려 있는 묶음. 창을 넘기면 **새 묶음**으로 교체된다. */
  const open = new Map<string, Group>();

  for (const item of chronological) {
    const key = mergeKeyOf(item.row);
    const cur = open.get(key);
    const inWindow =
      cur !== undefined &&
      cur.anchor !== null &&
      item.stamp !== null &&
      item.stamp - cur.anchor <= windowMs;

    if (cur !== undefined && inWindow) {
      absorb(cur, item);
      continue;
    }

    const fresh: Group = {
      out: {
        head: item.row,
        count: 1,
        qty: item.row.qty ?? 0,
        priceMin: item.row.price ?? 0,
        priceMax: item.row.price ?? 0,
        // 오름차순으로 접으므로 묶음의 **첫 통보**가 곧 이 행이다.
        at: item.row.createdAt,
        orderNoText: item.row.orderNo,
      },
      anchor: item.stamp,
      headIndex: item.index,
      minOrderNo: item.row.orderNo,
      maxOrderNo: item.row.orderNo,
    };
    groups.push(fresh);
    open.set(key, fresh);
  }

  return groups.sort((a, b) => a.headIndex - b.headIndex).map((group) => group.out);
}

/** 창 안의 통보 한 건을 묶음에 더한다. 시각(`at`)은 첫 통보 것이라 **건드리지 않는다**. */
function absorb(group: Group, item: Item): void {
  const { row } = item;
  group.out.count += 1;
  group.out.qty += row.qty ?? 0;
  const price = row.price ?? 0;
  if (price > 0) {
    group.out.priceMin = group.out.priceMin > 0 ? Math.min(group.out.priceMin, price) : price;
    group.out.priceMax = Math.max(group.out.priceMax, price);
  }
  if (item.index < group.headIndex) {
    group.headIndex = item.index;
    group.out.head = row;
  }
  if (row.orderNo !== null) {
    if (group.minOrderNo === null || compareOrderNo(row.orderNo, group.minOrderNo) < 0) {
      group.minOrderNo = row.orderNo;
    }
    if (group.maxOrderNo === null || compareOrderNo(row.orderNo, group.maxOrderNo) > 0) {
      group.maxOrderNo = row.orderNo;
    }
  }
  group.out.orderNoText = orderNoTextOf(group);
}

/** 묶음 표기 — 단건(N === 1)은 원번호 그대로라 묶인 것처럼 보이지 않는다. */
function orderNoTextOf(group: Group): string | null {
  const { minOrderNo: min, maxOrderNo: max } = group;
  if (min === null || max === null) return min ?? max;
  if (min === max) return min;
  return `#${min}~${max}`;
}
