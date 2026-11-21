"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEffects,
  appliedEffectAt,
  effectDiff,
  isSettlementMarketHours,
  nowBudgetsOfAccounts,
  pendAccKeys,
  type SettlementAccountView,
  type SettlementCtx,
  type SettlementLedgerBody,
  type SettlementLedgerRow,
  type SettlementSettleBody,
  type SettlementSettleRow,
  type SettlementView,
} from "@gh-radar/shared";

import { AdminPanelPage } from "@/components/admin/admin-sheet";
import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY } from "@/components/admin/reflect-chip";
import { CARD } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cancelSettlement,
  confirmSettlement,
  deleteSettlementLedger,
  fetchSettlement,
  retrySettlementLedger,
  saveSettlementLedger,
} from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ActivityCard, type ActivitySegment } from "./activity-card";
import { LedgerSheet } from "./ledger-sheet";
import { NameVsCard } from "./name-vs-card";
import { OpenPoolsCard } from "./open-pools-card";
import { PersonCards } from "./person-cards";
import { reflectPreviewLines } from "./reflect-box";
import { CONFIRM_TEXT, SettleConfirm, cancelConfirmText, deleteConfirmText } from "./settle-confirm";
import { SettleSheet } from "./settle-sheet";
import { TransferCard } from "./transfer-card";

/**
 * SettlementClient — `/admin/settlement` 본문 (Phase 44 · UI-SPEC ① · E1).
 *
 * - 데이터는 `GET /api/admin/settlement` 한 번(브라우저는 정산 표를 직접 읽지 않는다 · D-18). 화면 시각 계산의 기준은 응답 `now`.
 * - 상태 loading | error | forbidden | ready(accounts-client 꼴). 403 은 「관리자만 사용할 수 있어요.」(role 없음),
 *   그 밖 실패는 오류 상자(`role="alert"`) + 「다시 시도」 가 본문 전체를 대신한다.
 * - `reload()` = 저장 뒤 다시 불러오기 — 화면을 비우지 않고 값만 바꾼다. 실패하면 보이던 값을 그대로 둔다(seq 가드).
 * - 본문 순서(UI-SPEC ①): 머리 → 세 사람 카드(②) → 「정산 전 수익」(③) → 「명의 대 몫」(④) · 「현중 ↔ 근형 계좌이체」(⑤)(넓으면 2열)
 *   → 활동 카드(⑥). 계산 입력 `SettlementCtx` 는 응답에서 한 번 만든다. 첫 불러오기 동안은 Skeleton 뿐 — 불러온 뒤 ② ~ ⑥ 이 한 번에 나타난다.
 * - 머리 「거래 기록」(44-10) → ⑦ 시트(새 거래) · 거래 줄 펼침 「고치기」 → ⑦ 고치기 · 「지우기」 → ⑨ 확인 창. 시트가 열린 동안
 *   `AdminPanelPage` 가 패널 폭을 비운다. 저장 성공 → 시트 닫힘 · 세그먼트가 「정산 기록」 이었으면 「계좌 거래」 로 · 다시 불러오기.
 * - 머리 「정산하기」(44-11) → ⑧ 시트. 열 때 화면 값을 바로 보이고 `reload()` 로 예수금을 다시 읽어 조용히 바꾼다(실패하면 지금 값 그대로 ·
 *   사용자 확정 2026-11-20). 확정 성공 → 시트 닫힘 · 세그먼트 「정산 기록」 · 새 정산 줄 펼침 · 다시 불러오기. 확정 숫자는 server 가 누른 순간 읽은 값(D-16).
 * - 지우기(D-23 · D-30): 반영했던 것이 있을 때만 ⑩ 상자(기본 켜짐 · 되돌릴 값 미리 보기). server 가 되돌릴 수 없다고 미리 거부하면
 *   (409 `REVERT_UNREADABLE`) 창을 두고 server 문장을 그대로 · 지운 뒤 보내기만 실패하면(`unreverted`) 문장 + 확정 잠금 ·
 *   「닫기」 로 닫을 때 다시 불러온다. 그 밖 거부는 「지우지 못했어요 · <message>」.
 * - 정산 취소(D-17 · D-23 · D-30): 묶음별 가장 최근 정산 줄의 「정산 취소」 → ⑨ 확인. 그 정산의 바로 출금 줄이 예수금에 반영했던 것이
 *   있을 때만 ⑩ 상자. D-30 두 갈래는 지우기와 같다 · 그 밖 거부는 「정산을 취소하지 못했어요 · <message>」.
 */

/**
 * 화면 문구. `forbidden` · `loadFailed` · `retry` 는 `ADMIN_ACCOUNTS_TEXT` 의 같은 키와 글자 그대로(UI-SPEC 「Error state」) —
 * 계좌 화면 모듈 전체를 이 화면 묶음에 끌어오지 않으려고 값을 옮겨 적고, 같음은 테스트가 잠근다.
 */
export const SETTLEMENT_TEXT = {
  title: "정산",
  docTitle: "정산 · Admin",
  loading: "불러오는 중",
  forbidden: "관리자만 사용할 수 있어요.",
  loadFailed: "불러오지 못했어요",
  retry: "다시 시도",
  retryFailed: "다시 반영하지 못했어요",
  ledgerCreate: "거래 기록",
  settleOpen: "정산하기",
} as const;

/**
 * ⑦ 시트 — `row` 가 있으면 고치기(D-19) · 없으면 새 거래. 닫을 때는 `open` 만 내려 닫히는 동안 제목 · 값이 바뀌지 않게 한다.
 */
interface LedgerSheetState {
  open: boolean;
  row: SettlementLedgerRow | null;
}

/**
 * ⑨ 거래 지우기 확인 — `reflect` = ⑩ 스위치(상자가 없으면 쓰지 않는다) · `error` = 완성 문장 ·
 * `locked` = 지운 뒤 되돌리기만 실패해 확정 단추를 잠갔다(닫을 때 다시 불러온다 · D-30).
 * 닫을 때는 `open` 만 내려 닫히는 동안 문단이 비지 않게 한다.
 */
interface DeleteTarget {
  open: boolean;
  row: SettlementLedgerRow;
  reflect: boolean;
  busy: boolean;
  error: string | null;
  locked: boolean;
}

/**
 * ⑨ 정산 취소 확인 — `outRows` = 그 정산의 바로 출금 줄(연 순간의 값 · 닫히는 동안 문단이 바뀌지 않게). 나머지는 `DeleteTarget` 과 같다.
 */
interface CancelTarget {
  open: boolean;
  settle: SettlementSettleRow;
  outRows: SettlementLedgerRow[];
  reflect: boolean;
  busy: boolean;
  error: string | null;
  locked: boolean;
}

/**
 * 지우기 · 정산 취소가 되돌릴 증감(CR-01 — server `revertOf` 와 같은 목표값 대조). 화면이 이번 조회 때 읽은 값으로 판정한다:
 * 지금 값 = 기록된 목표값인 계좌(보냈는데 응답만 못 받은 반영)는 「들어감」, 보냈지만 지금 못 읽은 계좌는 「들어갔을 수 있음」 으로
 * 센다 — 그래서 그런 계좌만 걸린 거래도 ⑩ 상자가 나오고 server 에 reflect true 를 보낸다(최종 판정은 server 가 그 순간 읽은 값으로).
 */
function revertApplied(rows: readonly SettlementLedgerRow[], accounts: readonly SettlementAccountView[]) {
  const now = nowBudgetsOfAccounts(accounts);
  return addEffects(rows.map((r) => appliedEffectAt(r, now, { unknownApplied: true })));
}

function withoutKey(m: Readonly<Record<number, string>>, id: number): Readonly<Record<number, string>> {
  if (!(id in m)) return m;
  const next = { ...m };
  delete next[id];
  return next;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "ready"; view: SettlementView };

export function SettlementClient() {
  const T = SETTLEMENT_TEXT;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // 활동 카드(⑥) — 화면 안 상태. 세그먼트 기본 「계좌 거래」 · ⑤ 「이체 내역 보기」 → 「현중 ↔ 근형 이체」.
  // 펼친 줄은 id 집합(여러 줄 동시 펼침 · 다시 불러와도 그대로) · 첫 화면은 모두 닫힘.
  const [activitySegment, setActivitySegment] = useState<ActivitySegment>("ledger");
  const [openSettle, setOpenSettle] = useState<ReadonlySet<number>>(() => new Set());
  const [openLedger, setOpenLedger] = useState<ReadonlySet<number>>(() => new Set());
  // 「다시 반영」(D-26) — 보내는 중인 거래 id · 거래 id → 오류 문장.
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryErrors, setRetryErrors] = useState<Readonly<Record<number, string>>>({});
  // ⑦ 거래 시트 · ⑨ 거래 지우기 확인(44-10).
  const [ledgerSheet, setLedgerSheet] = useState<LedgerSheetState>({ open: false, row: null });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  // ⑧ 정산하기 시트 · ⑨ 정산 취소 확인(44-11).
  const [settleOpen, setSettleOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const view = await fetchSettlement();
      if (seq.current === my) setState({ kind: "ready", view });
    } catch (err) {
      if (seq.current !== my) return;
      const forbidden = err instanceof ApiClientError && err.status === 403;
      setState((prev) => (forbidden ? { kind: "forbidden" } : prev.kind === "ready" ? prev : { kind: "error" }));
    }
  }, []);

  useEffect(() => {
    document.title = T.docTitle;
  }, [T.docTitle]);

  useEffect(() => {
    void reload();
    return () => {
      // 언마운트 뒤 도착한 응답은 버린다 — 의도적으로 「그때의」 seq 를 올린다(DOM ref 아님).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++;
    };
  }, [reload]);

  // 계산 입력 — 응답이 바뀔 때만 다시 만든다(사람 카드 · 뒤 플랜의 카드들이 같은 ctx 를 쓴다).
  const view = state.kind === "ready" ? state.view : null;
  const ctx = useMemo<SettlementCtx | null>(
    () => (view ? { accounts: view.accounts, ledger: view.ledger, settles: view.settles } : null),
    [view],
  );

  const retry = () => {
    setState({ kind: "loading" });
    void reload();
  };

  /**
   * 「다시 반영」 — 확인 없이 바로 보낸다(못 보낸 계좌만 · 서버가 고른다). 응답 `pend` 가 남거나 요청이 실패하면
   * 그 줄 아래 「다시 반영하지 못했어요 · <message>」. 끝나면 늘 목록을 다시 불러온다(꼬리표 · 예수금 줄 갱신).
   */
  const onRetry = useCallback(
    async (id: number) => {
      setRetryingId(id);
      setRetryErrors((prev) => withoutKey(prev, id));
      const fail = (message: string | undefined) =>
        setRetryErrors((prev) => ({ ...prev, [id]: message ? `${T.retryFailed} · ${message}` : T.retryFailed }));
      try {
        const res = await retrySettlementLedger(id);
        if (pendAccKeys(res.pend ?? {}).length > 0) fail(res.message);
      } catch (err) {
        fail(err instanceof Error ? err.message : undefined);
      } finally {
        setRetryingId(null);
        await reload();
      }
    },
    [reload, T.retryFailed],
  );

  /**
   * ⑦ 저장 — 새 거래는 POST · 고치기는 PUT(그 줄 id). 성공하면(못 보낸 계좌가 남아도 · D-26) 시트를 닫고 세그먼트가
   * 「정산 기록」 이었으면 「계좌 거래」 로 바꾼 뒤 다시 불러온다. 실패는 그대로 던져 시트가 하단 오류 줄을 보이게 한다.
   */
  const editId = ledgerSheet.row?.id;
  const onSaveLedger = useCallback(
    async (body: SettlementLedgerBody) => {
      try {
        await saveSettlementLedger(body, editId);
      } catch (err) {
        // 응답을 못 받음(시간 초과 · 네트워크) — server 는 저장했을 수 있다(IN-05). 목록을 다시 불러와 확인할 수 있게 한다.
        if (err instanceof ApiClientError && err.status === 0) void reload();
        throw err;
      }
      setLedgerSheet((s) => ({ ...s, open: false }));
      setActivitySegment((s) => (s === "settle" ? "ledger" : s));
      void reload();
    },
    [editId, reload],
  );

  /** ⑨ 거래 지우기 확정(D-23 · D-30). 반영 상자가 없으면(반영했던 것이 없음) 늘 reflect false 로 보낸다. */
  const onConfirmDelete = async () => {
    const t = deleteTarget;
    if (!t || t.busy || t.locked) return;
    const reflect = Object.keys(revertApplied([t.row], view?.accounts ?? [])).length > 0 ? t.reflect : false;
    setDeleteTarget({ ...t, busy: true, error: null });
    try {
      const res = await deleteSettlementLedger(t.row.id, reflect);
      if ((res.unreverted ?? []).length > 0) {
        // 지웠지만 예수금 되돌리기만 실패 — 창을 두고 server 문장(접두 없음) + 확정 잠금 · 닫을 때 다시 불러온다.
        setDeleteTarget((cur) => cur && { ...cur, busy: false, locked: true, error: res.message ?? null });
        return;
      }
      setDeleteTarget((cur) => cur && { ...cur, open: false, busy: false });
      void reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // 미리 막고 안내(409 REVERT_UNREADABLE) — server 문장 그대로 · 잠그지 않는다(스위치를 끄고 다시 누를 수 있다).
      const error =
        err instanceof ApiClientError && err.code === "REVERT_UNREADABLE"
          ? message
          : message
            ? `${CONFIRM_TEXT.deleteFailed} · ${message}`
            : CONFIRM_TEXT.deleteFailed;
      setDeleteTarget((cur) => cur && { ...cur, busy: false, error });
    }
  };

  const onCloseDelete = () => {
    const locked = deleteTarget?.locked === true;
    setDeleteTarget((cur) => cur && { ...cur, open: false });
    if (locked) void reload();
  };

  /** ⑧ 열기 — 화면 값을 바로 보이고 예수금을 다시 읽는다(실패하면 지금 값 그대로 · reload 의 seq 가드). */
  const onOpenSettle = () => {
    setSettleOpen(true);
    void reload();
  };

  /**
   * ⑧ 확정 — 바디는 시트가 만든 `{ pool, outs, memo, reflect, expectPrev }` 그대로(D-16). 성공하면 시트를 닫고 「정산 기록」 으로 ·
   * 새 정산 줄을 펼친 채(UI-SPEC ⑥ 흐름) 다시 불러온다. 실패는 그대로 던져 시트가 하단 오류 줄을 보이게 한다.
   */
  const onConfirmSettle = useCallback(
    async (body: SettlementSettleBody) => {
      const res = await confirmSettlement(body);
      setSettleOpen(false);
      setActivitySegment("settle");
      const newId = res.id;
      if (newId !== undefined) setOpenSettle((s) => new Set(s).add(newId));
      void reload();
    },
    [reload],
  );

  /** ⑨ 정산 취소 — 그 정산의 바로 출금 줄이 지금 예수금에 넣어 둔 증감(없으면 상자 없음 · D-23 · 목표값 대조 CR-01). */
  const cancelApplied = (t: CancelTarget) => revertApplied(t.outRows, view?.accounts ?? []);

  /** ⑨ 정산 취소 확정(D-17 · D-23 · D-30) — 거래 지우기와 같은 갈래. 반영 상자가 없으면 늘 reflect false. */
  const onConfirmCancel = async () => {
    const t = cancelTarget;
    if (!t || t.busy || t.locked) return;
    const reflect = Object.keys(cancelApplied(t)).length > 0 ? t.reflect : false;
    setCancelTarget({ ...t, busy: true, error: null });
    try {
      const res = await cancelSettlement(t.settle.id, reflect);
      if ((res.unreverted ?? []).length > 0) {
        // 취소했지만 예수금 되돌리기만 실패 — 창을 두고 server 문장(접두 없음) + 확정 잠금 · 닫을 때 다시 불러온다.
        setCancelTarget((cur) => cur && { ...cur, busy: false, locked: true, error: res.message ?? null });
        return;
      }
      setCancelTarget((cur) => cur && { ...cur, open: false, busy: false });
      void reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // 미리 막고 안내(409 REVERT_UNREADABLE) — server 문장 그대로 · 잠그지 않는다(스위치를 끄고 다시 누를 수 있다).
      const error =
        err instanceof ApiClientError && err.code === "REVERT_UNREADABLE"
          ? message
          : message
            ? `${CONFIRM_TEXT.cancelFailed} · ${message}`
            : CONFIRM_TEXT.cancelFailed;
      setCancelTarget((cur) => cur && { ...cur, busy: false, error });
    }
  };

  const onCloseCancel = () => {
    const locked = cancelTarget?.locked === true;
    setCancelTarget((cur) => cur && { ...cur, open: false });
    if (locked) void reload();
  };

  const toggle = (set: ReadonlySet<number>, id: number): ReadonlySet<number> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <AdminPanelPage
      data-slot="admin-settlement"
      panelOpen={ledgerSheet.open || settleOpen}
      className="@container/settle gap-3"
    >
      <PageHeader
        title={T.title}
        className="mb-1"
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-slot="settlement-ledger-create"
              disabled={state.kind !== "ready"}
              onClick={() => setLedgerSheet({ open: true, row: null })}
              className={cn(ADMIN_BUTTON_SECONDARY, "h-9 bg-[var(--card)] sm:h-8 dark:bg-[var(--muted)]")}
            >
              {T.ledgerCreate}
            </Button>
            <Button
              type="button"
              size="sm"
              data-slot="settlement-settle-create"
              disabled={state.kind !== "ready"}
              onClick={onOpenSettle}
              className={cn(ADMIN_BUTTON_PRIMARY, "h-9 sm:h-8")}
            >
              {T.settleOpen}
            </Button>
          </>
        }
      />

      {state.kind === "loading" && <SettlementSkeleton />}

      {state.kind === "forbidden" && (
        <div
          data-slot="admin-settlement-error"
          className={cn(CARD, "px-4 py-4 text-[length:var(--t-sm)]")}
        >
          <p className="text-[var(--muted-fg)]">{T.forbidden}</p>
        </div>
      )}

      {state.kind === "error" && (
        <div
          data-slot="admin-settlement-error"
          role="alert"
          className={cn(CARD, "flex flex-wrap items-center gap-3 px-4 py-4 text-[length:var(--t-sm)]")}
        >
          <p className="text-[var(--fg)]">{T.loadFailed}</p>
          <Button type="button" size="sm" variant="secondary" onClick={retry} className={ADMIN_BUTTON_SECONDARY}>
            {T.retry}
          </Button>
        </div>
      )}

      {state.kind === "ready" && ctx && (
        <>
          <PersonCards ctx={ctx} />
          <OpenPoolsCard view={state.view} />
          <div
            data-slot="settlement-name-transfer"
            className="grid min-w-0 grid-cols-1 gap-3 @min-[768px]/settle:grid-cols-2"
          >
            <NameVsCard ctx={ctx} />
            <TransferCard ledger={ctx.ledger} onShowTransfers={() => setActivitySegment("hg")} />
          </div>
          <ActivityCard
            ctx={ctx}
            nowIso={state.view.now}
            segment={activitySegment}
            onSegment={setActivitySegment}
            openSettle={openSettle}
            openLedger={openLedger}
            onToggleSettle={(id) => setOpenSettle((s) => toggle(s, id))}
            onToggleLedger={(id) => setOpenLedger((s) => toggle(s, id))}
            ledgerHandlers={{
              onEdit: (row) => setLedgerSheet({ open: true, row }),
              onDelete: (row) => setDeleteTarget({ open: true, row, reflect: true, busy: false, error: null, locked: false }),
              onRetry: (id) => void onRetry(id),
              retryingId,
              retryErrors,
            }}
            onCancelSettle={(settle) =>
              setCancelTarget({
                open: true,
                settle,
                outRows: state.view.ledger.filter((r) => r.settleId === settle.id),
                reflect: true,
                busy: false,
                error: null,
                locked: false,
              })
            }
          />
          <LedgerSheet
            open={ledgerSheet.open}
            mode={ledgerSheet.row ? "edit" : "new"}
            row={ledgerSheet.row}
            accounts={state.view.accounts}
            nowIso={state.view.now}
            onClose={() => setLedgerSheet((s) => ({ ...s, open: false }))}
            onSave={onSaveLedger}
          />
          {deleteTarget && (
            <SettleConfirm
              open={deleteTarget.open}
              title={CONFIRM_TEXT.deleteTitle}
              body={deleteConfirmText(deleteTarget.row, state.view.now)}
              confirmLabel={CONFIRM_TEXT.delete}
              reflect={
                Object.keys(revertApplied([deleteTarget.row], state.view.accounts)).length > 0
                  ? {
                      on: deleteTarget.reflect,
                      onToggle: (next) =>
                        setDeleteTarget((cur) => cur && { ...cur, reflect: next, error: cur.locked ? cur.error : null }),
                      lines: reflectPreviewLines(
                        effectDiff(revertApplied([deleteTarget.row], state.view.accounts), {}),
                        state.view.accounts,
                      ),
                      marketHours: isSettlementMarketHours(new Date()),
                    }
                  : null
              }
              busy={deleteTarget.busy}
              error={deleteTarget.error}
              confirmDisabled={deleteTarget.locked}
              onClose={onCloseDelete}
              onConfirm={() => void onConfirmDelete()}
            />
          )}
          <SettleSheet
            open={settleOpen}
            view={state.view}
            nowIso={state.view.now}
            onClose={() => setSettleOpen(false)}
            onConfirm={onConfirmSettle}
          />
          {cancelTarget && (
            <SettleConfirm
              open={cancelTarget.open}
              title={CONFIRM_TEXT.cancelTitle}
              body={cancelConfirmText(cancelTarget.settle, cancelTarget.outRows.length, state.view.now)}
              confirmLabel={CONFIRM_TEXT.cancel}
              reflect={
                Object.keys(cancelApplied(cancelTarget)).length > 0
                  ? {
                      on: cancelTarget.reflect,
                      onToggle: (next) =>
                        setCancelTarget((cur) => cur && { ...cur, reflect: next, error: cur.locked ? cur.error : null }),
                      lines: reflectPreviewLines(effectDiff(cancelApplied(cancelTarget), {}), state.view.accounts),
                      marketHours: isSettlementMarketHours(new Date()),
                    }
                  : null
              }
              busy={cancelTarget.busy}
              error={cancelTarget.error}
              confirmDisabled={cancelTarget.locked}
              onClose={onCloseCancel}
              onConfirm={() => void onConfirmCancel()}
            />
          )}
        </>
      )}
    </AdminPanelPage>
  );
}

/** 첫 불러오기 자리 — 사람 카드 자리 3 + 표 카드 1(UI-SPEC E1 · accounts `ListSkeleton` 문법). */
function SettlementSkeleton() {
  return (
    <div
      data-slot="admin-settlement-loading"
      aria-busy="true"
      aria-label={SETTLEMENT_TEXT.loading}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 @min-[768px]/settle:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(CARD, "flex flex-col gap-2 p-4")}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-32 max-w-full" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>
      <div className={cn(CARD, "flex flex-col gap-2 p-4")}>
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  );
}
