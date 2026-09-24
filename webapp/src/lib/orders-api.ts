/**
 * orders-api — 「오늘 주문」 복원 조회 + 저널 푸시 병합 (RELAY-02 / D-24 → Phase 19 D-03).
 *
 * ① 원천은 두 가지뿐이다 (Phase 19 D-03)
 *   REST `GET /api/orders` 복원(계좌 기준 저널 `dma_account_orders` 의 오늘 행)과 relay wss
 *   `{t:"journal.rows"}` 푸시. 둘 다 shared `toJournalOrderRow` 한 매퍼를 지난 같은 모양
 *   (`JournalOrderRow`)이라 `id` 하나로 맞춘다. 세션 51 기반 `{t:"order"}` 는 여기에 오지 않는다 —
 *   그것은 토스트·전략 로그 표면 전용이다. (Phase 19 D-03 로 라이브 join 제거.)
 *
 * ② ★ `date` 쿼리를 붙이지 않는다
 *   서버가 공유 `kstDateIso()` 로 KST 오늘을 정하고(`services/dma-orders.ts` 의
 *   `resolveTradeDate`) **그것이 조회의 정본**이다. 그래서 요청 URL 은 쿼리 문자열 없는
 *   `/api/orders` 다. 푸시 행의 「오늘」 판정(`mergeJournalRows` 의 `today`)도 같은 shared
 *   `kstDateIso` 를 쓴다 — 브라우저에 두 번째 KST 함수를 만들지 않는다.
 *
 * ③ ★ 같은 `id` 면 `lastSeq` 가 큰 쪽이 이긴다
 *   `lastSeq` 는 그 행에 반영된 마지막 게이트웨이 저널 seq 다. 복원과 푸시 중 어느 쪽이 먼저
 *   도착했든 더 나중 사실을 담은 쪽이 남는다(늦게 도착한 옛 행의 표시 역전 방지 · T-19-27).
 *   푸시 행은 **완전한 행**(종목·계좌·방향 포함)이라 복원에 없던 행도 만든다.
 *
 * ④ 응답은 bare array 다
 *   `routes/orders.ts` 가 `JournalOrderRow[]` 를 그대로 반환한다(scanner/themes/news/chat 과 같은
 *   규약). envelope 을 언랩하지 않는다.
 */

import type { JournalOrderRow, JournalOrderStatus, RelayAccount } from "@gh-radar/shared";

import { authFetch } from "./auth-fetch";

/**
 * 오늘(KST) 내가 볼 수 있는 계좌의 주문 전체를 복원한다. `requireAuth` 라우트라 Bearer 가 필수다.
 * 세션이 없으면 서버 왕복 없이 `ApiClientError`(UNAUTHENTICATED) 로 끝난다.
 */
export function fetchTodayOrders(): Promise<JournalOrderRow[]> {
  return authFetch<JournalOrderRow[]>("/api/orders");
}

/** 시각 파싱 실패는 가장 오래된 것으로 친다 — 모르는 시각을 목록 맨 위에 세우지 않는다. */
function stampOf(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * 저널 행 정렬 — `createdAt` 내림차순(최신 먼저), 동률은 `lastSeq` 내림차순, 그래도 같으면 `id`.
 *
 * 리듀서(`use-relay-socket` 의 `journalRows` 보관)와 카드 병합이 **같은 비교 함수**를 쓴다.
 * 시각은 문자열이 아니라 epoch 로 비교한다 — REST 와 푸시의 ISO 표기(`Z` · `+00:00`)가 달라도
 * 순서가 갈리지 않게.
 */
export function compareJournalNewestFirst(a: JournalOrderRow, b: JournalOrderRow): number {
  const at = stampOf(a.createdAt);
  const bt = stampOf(b.createdAt);
  if (at !== bt) return at < bt ? 1 : -1;
  if (a.lastSeq !== b.lastSeq) return b.lastSeq - a.lastSeq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 복원 스냅샷 × 푸시 행 → 화면 행 (Phase 19 D-03).
 *
 * - 병합 키는 `id` 하나다. 같은 `id` 는 `lastSeq` 가 **큰 쪽**이 남는다(같으면 복원 유지).
 * - 푸시 행은 `tradeDate === today` 인 것만 받는다 — 자정을 넘겨 열려 있던 탭이 어제 행을
 *   「오늘 주문」 에 섞지 않게. 복원 행은 서버가 이미 오늘로 걸렀으므로 거르지 않는다.
 * - 정렬은 `compareJournalNewestFirst` 하나다.
 */
export function mergeJournalRows(
  restored: readonly JournalOrderRow[],
  pushed: readonly JournalOrderRow[],
  today: string,
): JournalOrderRow[] {
  const byId = new Map<string, JournalOrderRow>();
  for (const row of restored) {
    const cur = byId.get(row.id);
    if (cur === undefined || row.lastSeq > cur.lastSeq) byId.set(row.id, row);
  }
  for (const row of pushed) {
    if (row.tradeDate !== today) continue;
    const cur = byId.get(row.id);
    if (cur === undefined || row.lastSeq > cur.lastSeq) byId.set(row.id, row);
  }
  return [...byId.values()].sort(compareJournalNewestFirst);
}

/** 「오늘 주문」 카드의 계좌 묶음 1개 (B′ · Phase 19 D-07). */
export interface JournalAccountGroup {
  accountNo: string;
  /** 상품명. relay 계좌 목록에 없는 계좌는 `""` — 소제목이 번호만 그린다. */
  name: string;
  rows: JournalOrderRow[];
}

/**
 * 화면 행 → 계좌별 묶음 (B′ · Phase 19 D-07).
 *
 * - 순서는 **relay 계좌 목록 순**이다 — 위쪽 계좌 카드(미체결·잔고)와 같은 순서로 읽힌다.
 * - 행이 없는 계좌는 묶음을 만들지 않는다(빈 소제목 금지).
 * - 목록에 없는 계좌(권한은 있으나 이 세션 계좌 목록 밖 · 프레임 도착 전)는 버리지 않고 뒤에
 *   붙인다 — rows 첫 등장 순 · `name` 은 `""`. 기록된 주문을 화면이 숨기지 않는다.
 * - 각 묶음의 rows 는 **입력 순서를 유지**한다(`compareJournalNewestFirst` 결과 그대로).
 */
export function groupJournalRowsByAccount(
  rows: readonly JournalOrderRow[],
  accounts: readonly RelayAccount[],
): JournalAccountGroup[] {
  const byAccount = new Map<string, JournalOrderRow[]>();
  for (const row of rows) {
    const bucket = byAccount.get(row.accountNo);
    if (bucket === undefined) byAccount.set(row.accountNo, [row]);
    else bucket.push(row);
  }
  const groups: JournalAccountGroup[] = [];
  for (const account of accounts) {
    const bucket = byAccount.get(account.accountNo);
    if (bucket === undefined) continue;
    groups.push({ accountNo: account.accountNo, name: account.name, rows: bucket });
    byAccount.delete(account.accountNo);
  }
  // Map 은 삽입 순서를 지킨다 = rows 첫 등장 순.
  for (const [accountNo, bucket] of byAccount) {
    groups.push({ accountNo, name: "", rows: bucket });
  }
  return groups;
}

/** 표시 라벨 + 톤. 톤은 account-panel 이 쓰는 색 토큰 집합과 같은 축이다. */
export interface OrderDisplayStatus {
  label: string;
  tone: "normal" | "muted" | "danger";
}

/** 저널 행 status 6종 → 표시. `requested`·`timeout` 은 저널에 없다(relay 즉시응답 전용). */
const STATUS_LABELS: Readonly<Record<JournalOrderStatus, OrderDisplayStatus>> = {
  accepted: { label: "접수", tone: "normal" },
  partially_filled: { label: "부분체결", tone: "normal" },
  filled: { label: "체결", tone: "normal" },
  cancelled: { label: "취소", tone: "muted" },
  rejected: { label: "거부", tone: "danger" },
  // 원주문 잔량이 정정으로 새 주문번호에 옮겨가 닫힌 행 (quick-260923-m23). 기존 단어·톤 재사용.
  modified: { label: "정정", tone: "muted" },
};

/**
 * 그 행에 무엇이라고 쓸지 고른다 — DB 투영의 `status` **하나**가 말한다 (Phase 19 D-03).
 *
 * 진행 단계는 기록기가 적용 RPC 안에서 단조로 투영하므로 화면이 다시 판정하지 않는다.
 * 모르는 값(계약 밖 · 새 서버)은 지어내지 않고 원문을 muted 로 보인다.
 */
export function orderDisplayStatus(row: JournalOrderRow): OrderDisplayStatus {
  return STATUS_LABELS[row.status] ?? { label: String(row.status), tone: "muted" };
}
