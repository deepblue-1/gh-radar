"use client";

/**
 * TodayOrdersCard — My page 의 「오늘 주문」 (RELAY-02 / D-24, quick-260910-jce).
 *
 * ① 무엇을 메우는가
 *   주문 **접수**는 16-16 이 wss 단일 경로로 옮겼지만 **복원**은 옮기지 않았다. 서버
 *   `GET /api/orders` 라우트는 살아 있는데 호출자가 0건이라, 새로고침하면 오늘 낸 주문이
 *   화면에서 사라졌다. 이 카드가 그 호출자다.
 *
 * ② ★ 조회는 **페이지당 1회**다
 *   마운트 시 한 번 부른다. 계좌 카드(`AccountPanel`) 안에 넣지 않은 이유가 여기 있다 —
 *   그 컴포넌트는 4표면이 공유하고 My page 에서는 **계좌마다 한 벌씩** 렌더되므로, 계좌가
 *   2개면 계좌 축이 없는 같은 응답을 2번 부르게 된다(`listTodayOrders` 는 내가 볼 수 있는
 *   계좌 전부를 한 번에 준다). T-16-02 의 취지(표면마다 조회 경로를 늘리지 않는다)는 유지된다 — 늘어난
 *   조회 표면은 **하나**다.
 *
 * ③ ★ 원천은 REST 복원 + `journal.rows` 푸시 **둘뿐**이다 (Phase 19 D-03)
 *   푸시 행은 관찰자 기록기가 계좌 저널을 투영한 **완전한 행**(종목·계좌·방향 포함)이라 복원에
 *   없던 행도 만든다 — 부재 중 자동주문(이어받기로 채워진 행)과 같은 계좌 다른 단말의 주문이
 *   이 경로로 빠짐없이 선다. 같은 `id` 면 `lastSeq` 가 큰 쪽이 이긴다(`mergeJournalRows`).
 *   세션 51 기반 `{t:"order"}` 는 카드 병합에 쓰지 않는다 — 토스트·전략 로그 표면 전용이다.
 *   「오늘」 은 shared `kstDateIso` 하나로 정한다(브라우저에 두 번째 KST 함수를 두지 않는다).
 *
 * ④ ★ 실패는 **이 카드 안에서** 수렴한다
 *   조회가 깨져도 throw 하지 않는다. 이 카드가 터지면 같은 트리의 전략·계좌 카드까지
 *   함께 죽는다 — 주문 목록 하나 때문에 잔고를 못 보는 것이 훨씬 나쁘다.
 *
 * ⑤ ★ 좁은 폭에서는 표가 아니라 **카드 행**이다 (account-panel 헤더 ⑧ 과 같은 규율)
 *   flex 자식 중 `flex:1 1 auto; min-width:0` 은 **종목 칸 하나뿐**이고 나머지는 전부
 *   `flex-none` 이다. 이 규칙이 어긋나면 스크롤이 아니라 **조용한 잘림**이 된다
 *   (`tasks/lessons.md` 등재 함정). 색 토큰도 account-panel 이 쓰는 것만 쓴다.
 *
 * ⑥ ★ 종목명의 원천은 `useIsinLabels` **하나**다 (quick-260910-kql)
 *   이름을 얻으려고 별도 조회 경로(REST·Supabase·`orders-api` 확장)를 만들지 않는다 —
 *   그 훅은 이미 받은 relay wss 스냅샷만 읽고 네트워크를 타지 않는다(T-16-02). 표시 표면이
 *   늘어도 호출량이 늘지 않는 이유가 그것이다.
 *   ★ 이름을 모르면 **코드 → ISIN 으로 무너진다**(3단 폴백) — 훅에 「로딩」 신호가 따로 없고
 *     아직 프레임이 안 왔으면 Map 이 그냥 비어 있으므로, 소비자가 폴백으로 처리하는 것이
 *     그 훅의 규약이다. 그래서 어느 경우에도 종목 칸이 비지 않는다.
 *   ★ 코드 칸을 더해도 모바일 ①줄의 신축 항목은 **여전히 종목명 하나뿐**이다 — 새 코드
 *     span 은 `flex:none` 이다(위 ⑤). 긴 종목명은 말줄임으로 잘리되 **식별자인 코드는
 *     온전히 남는다.** 코드를 ②줄로 내리지 않는다: ②줄은 전부 `flex:none` 이라 넘침을
 *     흡수할 신축 항목이 없어, 항목을 더하면 truncate 가 아니라 조용한 잘림이 된다.
 *
 * ⑦ ★ relay 재인증 때 **한 번 더** 부른다 (debug mobile-bg-resume-gaps 4)
 *   소켓이 끊긴 동안 놓친 `journal.rows` 푸시는 재생되지 않는다. 그 사이 기록기가 저널에 투영한
 *   행은 재조회로만 화면에 온다. 트리거는 ready **재진입**(끊겼다 붙음) 하나라 폴링이 아니다.
 *   재조회 행과 끊기기 전 푸시 행이 겹치면 `lastSeq` 가 큰 쪽이 남는다(위 ③).
 *
 * ⑧ ★ journal.state 복구 재조회 (Phase 19 D-04)
 *   relay 의 기록 연결이 끊겼다(`delayed`) 다시 붙으면(`live`) 기록기가 끊긴 구간을 이어받아
 *   저널을 채운다 — 이어받기로 채워진 행을 가져오려고 `delayed → live` **전이에서만** 1회
 *   다시 부른다. 마운트 뒤 첫 `live` 는 마운트 조회와 같은 시점이라 건너뛰고(⑦ 과 같은 판정),
 *   `live → live` 반복 프레임은 전이가 아니다. 폴링이 아니다.
 *
 * ⑨ ★ 계좌별 묶음 — 채택 목업 B′ (Phase 19 D-07)
 *   기준이 「로그인한 사람」 에서 「계좌」 로 바뀌어(D-06) 같은 계좌의 WinForms · 다른 DMA 사용자
 *   주문이 섞인다. 계좌마다 소제목(계좌 · 번호 전체 · 상품명 · N건)을 달고 목록을 반복한다 —
 *   위쪽 계좌 카드(미체결·잔고)가 계좌마다 한 벌씩 반복되는 것과 같은 읽기 방식이다.
 *   순서는 relay 계좌 목록 순 · 목록 밖 계좌는 번호만으로 뒤에 · 행 없는 계좌는 묶음이 없다
 *   (`groupJournalRowsByAccount`). 통보 묶기(`mergeOrderNotices`)는 **묶음마다** 부른다 — 묶기가
 *   계좌 경계를 넘지 않는다. 헤더 「N건」 은 묶기 전 전체 행 수, 소제목 「N건」 은 그 계좌의
 *   묶기 전 행 수다. 조회는 여전히 페이지당 1회다(위 ② — 계좌 카드 안에 넣지 않는다).
 *   좁은 폭 카드 행 ↔ 넓은 폭(≥1280) 표 전환은 **뷰포트** 규칙 그대로다(상따 컨테이너 쿼리 비적용).
 *
 * ⑩ ★ 출처 칩 · NXT 태그 (Phase 19 D-08)
 *   출처를 아는 행마다 칩(상따 · VI · 수동 — account-panel 출처 태그와 같은 조각 `OriginTag`)이
 *   붙는다. origin 미상(null)은 칩이 없다 — 「수동」 으로 그리면 거짓일 수 있다(D-08 보충).
 *   NXT 행에만 `ExchangeTag`(채움형)가 종목 코드 옆에 붙는다 — KRX 는 기본값이라 없다.
 *   주문자(DMA 사용자)는 표시하지 않는다(계약에 필드가 없다 · T-19-08). 새 조각은 전부 `flex:none`
 *   이다(위 ⑤ — 신축 항목은 종목명 하나뿐). 출처 칩이 수동을 말하므로 구분 칸의 「· 수동」 꼬리는
 *   없다. 주문번호가 없는 로컬 거부 행은 주문번호 · 수량 · 가격 자리에 「—」 를 쓴다.
 *
 * ⑪ ★ 기록 지연 표식 (Phase 19 D-04 (a))
 *   relay 가 `journal.state` 를 `delayed` 로 보내면(관찰자 기록 연결 끊김 · 10초 디바운스) 제목 옆
 *   「기록 지연」 배지(role=status · 진행 점 · reduced-motion 이면 정지)와 한 줄 안내가 뜬다 — 빈
 *   목록을 「주문 없음」 으로 오해하지 않게(T-19-31). 이미 기록된 행은 흐리게 하지 않는다.
 *   복구(`live`)되면 표식이 사라지고 위 ⑧ 이 한 번 재조회한다.
 *
 * ⑫ 재방문 시드 (Phase 21 D-32)
 *   성공한 조회 결과를 `lib/query-cache` 에 **KST 날짜 키**(`me:today-orders:{날짜}`)로 남긴다. 탭을 오가
 *   다시 마운트되면 첫 렌더부터 그 행으로 서고(「불러오는 중」 없음) 마운트 조회가 뒤에서 교체한다.
 *   날짜가 바뀌면 키가 달라 어제 목록을 오늘 것처럼 보이지 않는다(T-21-86). 실패는 캐시를 쓰지 않는다.
 *   사용자 전환 시 AuthProvider 가 캐시를 비운다(T-21-85).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { kstDateIso, type JournalOrderRow } from "@gh-radar/shared";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExchangeTag } from "@/components/trading/exchange-tag";
import { OriginTag, originTagOf } from "@/components/trading/origin-tag";
import { useIsinLabels, type IsinLabel } from "@/lib/isin-labels";
import {
  mergeOrderNotices,
  orderActionWord,
  orderNoticeLabel,
  type MergedOrderNotice,
  type OrderNoticeFacts,
  type OrderNoticeLabel,
} from "@/lib/order-notices";
import {
  fetchTodayOrders,
  groupJournalRowsByAccount,
  mergeJournalRows,
  orderDisplayStatus,
  type OrderDisplayStatus,
} from "@/lib/orders-api";
import { readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";

const KRW = new Intl.NumberFormat("ko-KR");

/**
 * 주문 시각 — `created_at`(UTC ISO) 을 **KST** 로 읽는다.
 * 브라우저 시간대에 맡기면 해외에서 접속한 화면만 조용히 다른 시각을 그린다.
 */
const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 모르는 모양은 지어내지 않고 `—` 로 둔다(me-client `formatServerTime` 과 같은 규율). */
function orderTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "—" : KST_TIME.format(at);
}

/**
 * 표시용 종목 — **이름 → 코드 → ISIN** 3단 폴백이라 어느 경우에도 칸이 비지 않는다.
 *
 * 코드 칸은 `row.stockCode` → `label.code` → `row.isin` 순으로 무너진다. DB 가 아는
 * 단축코드를 **맨 앞**에 두는 이유: 주문 이력에 기록된 단축코드는 그 주문 시점의 사실이고,
 * 라벨은 지금 relay 가 아는 값이다. 이력의 식별자는 기록된 값이어야 한다.
 *
 * 이름을 모르면(계좌 프레임 도착 전·`SymbolMap` 미해석) 코드 칸 값을 **이름 자리로 올리고**
 * 코드 칸은 `null` 로 둔다 — 이름 칸이 이미 코드/ISIN 인 행에 같은 값을 두 번 쓰지 않는
 * `strategy-status-card` 의 `StrategyRow` 와 같은 판단이다.
 */
function stockLabel(
  row: JournalOrderRow,
  label: IsinLabel | undefined,
): { name: string; code: string | null } {
  const code = row.stockCode ?? label?.code ?? row.isin;
  return label?.name !== undefined ? { name: label.name, code } : { name: code, code: null };
}

/**
 * 통보 판정에 쓸 **서버 사실**만 모은다 (17-10 / D-08 · D-15 → Phase 19 D-03).
 *
 * ★ 저널 행이 통보 사실(`noticeType`·`requestKind`·`requester`·`board`)을 **스스로 싣는다** —
 *   복원 행과 푸시 행이 같은 규칙으로 읽힌다. `requestKind` 가 없으면 **우리가 아는 주문 종류**
 *   (`orderType` C = 취소주문 · M = 정정주문)가 유일한 근거다. 어느 경로에도 `message` 가 없다
 *   — 804 거부에서 서버가 문구를 교체하기 때문이다(T-17-33).
 * ★ `side` 는 저널 행이 확실할 때만 싣는다(C/M 통보만 받은 행은 null). 순수함수는 `null` 을
 *   「모른다」로 받아 행위를 지어내지 않는다.
 */
function noticeFactsOf(row: JournalOrderRow): OrderNoticeFacts {
  return {
    noticeType: row.noticeType ?? "",
    requestKind:
      row.requestKind ?? (row.orderType === "C" ? "Cancel" : row.orderType === "M" ? "Modify" : ""),
    side: row.side,
    requester: row.requester ?? "",
    board: row.board ?? "",
  };
}

/** D-32 — 재방문 시드 캐시 키(KST 날짜 포함 · 위 ⑫). */
function todayOrdersCacheKey(date: string): string {
  return `me:today-orders:${date}`;
}

export function TodayOrdersCard() {
  const { accounts, journalRows, journalState, status } = useRelayContext();
  /* 종목명의 원천(위 ⑥). 이미 받은 프레임만 읽는다 — 새 조회 경로가 아니다. */
  const labels = useIsinLabels();

  /**
   * `null` = 아직 한 번도 응답을 못 받음(로딩). `[]` = 오늘 주문이 정말 없음.
   * D-32(위 ⑫) — 오늘 날짜 키 캐시가 있으면 그 행으로 시작한다.
   */
  const [restored, setRestored] = useState<JournalOrderRow[] | null>(
    () => readQueryCache<JournalOrderRow[]>(todayOrdersCacheKey(kstDateIso())) ?? null,
  );
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchTodayOrders();
      setRestored(rows);
      setFailed(false);
      writeQueryCache(todayOrdersCacheKey(kstDateIso()), rows);
    } catch {
      /*
        어떤 실패든 여기서 멈춘다(위 ④). 실패 사유를 화면에 풀어 쓰지 않는다 —
        401/500/타임아웃 중 무엇이든 사용자가 할 일은 같다(다시 열어 보기).
      */
      setRestored([]);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    ★ relay 재인증(ready **재진입**)마다 1회 다시 부른다 (위 ⑦ · debug mobile-bg-resume-gaps 4).
    `wasReadyRef` 는 「이 카드가 ready 를 본 적 있는가」다. 마운트 뒤 **첫** ready 는 마운트
    조회와 같은 시점이라 건너뛰고, ready 가 유지되는 동안의 리렌더는 전이가 아니라 건너뛴다.
  */
  const wasReadyRef = useRef(status === "ready");
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "ready" || prev === "ready") return;
    if (!wasReadyRef.current) {
      wasReadyRef.current = true;
      return;
    }
    void load();
  }, [status, load]);

  /*
    ★ 기록 연결 복구(`delayed → live`)마다 1회 다시 부른다 (위 ⑧ · D-04).
    직전 상태를 ref 로 들고 전이만 본다 — 마운트 시점에 이미 `live` 였거나 첫 프레임이 `live`
    면 직전 값이 `delayed` 가 아니므로 부르지 않는다.
  */
  const journalLive = journalState?.s ?? null;
  const prevJournalRef = useRef(journalLive);
  useEffect(() => {
    const prev = prevJournalRef.current;
    prevJournalRef.current = journalLive;
    if (prev === "delayed" && journalLive === "live") void load();
  }, [journalLive, load]);

  /*
    기록 지연 표식 (위 ⑪ · D-04 (a)). 시각은 카드의 `KST_TIME` 하나로 읽는다 — 모르는 모양이면
    (`orderTime` 이 「—」) 시각 문장을 빼고 지어내지 않는다.
  */
  const delayed = journalState?.s === "delayed";
  const sinceText =
    delayed && journalState?.since !== undefined ? orderTime(journalState.since) : "—";
  const delayedSince = sinceText === "—" ? null : sinceText;

  /* 두 원천의 병합(위 ③). 푸시는 오늘(KST) 행만 받는다 — 자정을 넘긴 탭이 어제 행을 섞지 않게. */
  const rows = useMemo(
    () => mergeJournalRows(restored ?? [], journalRows, kstDateIso()),
    [restored, journalRows],
  );

  /*
    ★ 계좌별로 나눈 **뒤** 묶음마다 통보를 접는다 (위 ⑨ · 17-10 / D-16) — 병합 → 계좌 나누기 →
    표시 접기 순서다. 접기가 계좌 경계를 넘지 않는다.
  */
  const groups = useMemo(
    () =>
      groupJournalRowsByAccount(rows, accounts).map((group) => ({
        ...group,
        merged: mergeOrderNotices(group.rows),
      })),
    [rows, accounts],
  );

  return (
    <section
      data-slot="today-orders-card"
      aria-label="오늘 주문"
      className="flex flex-col gap-[var(--s-2)] rounded-[var(--r-lg)] border border-transparent bg-[var(--card)] px-[var(--s-3)] py-[var(--s-3)]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-[var(--s-2)]">
        <h2 className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">오늘 주문</h2>
        {rows.length > 0 && (
          <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {rows.length}건
          </span>
        )}
        {delayed && (
          <span
            role="status"
            data-testid="today-orders-delayed"
            className="inline-flex h-5 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 text-[11px] font-semibold text-[var(--muted-fg)]"
          >
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full bg-current animate-pulse motion-reduce:animate-none"
            />
            기록 지연
          </span>
        )}
      </div>
      {/*
        기록 지연 안내 (위 ⑪) — 본문(로딩·빈·오류·목록)과 무관하게 머리 아래에 붙는다.
        이미 그린 행은 흐리게 하지 않는다 — 기록된 줄은 맞는 값이다.
      */}
      {delayed && (
        <p
          data-testid="today-orders-delayed-note"
          className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
        >
          <b className="font-semibold text-[var(--fg)]">기록 지연</b> — 복구되면 채워집니다.
          {delayedSince !== null && (
            <>
              {" "}
              <span className="mono">{delayedSince}</span> 이후 주문이 아직 안 보일 수 있어요.
            </>
          )}
        </p>
      )}

      {failed ? (
        <p
          role="status"
          data-testid="today-orders-error"
          className="rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-4)] text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
        >
          오늘 주문 목록을 불러오지 못했어요. 잔고·미체결은 위 계좌 카드에서 그대로 볼 수 있어요.
        </p>
      ) : restored === null ? (
        <p
          data-testid="today-orders-loading"
          aria-busy="true"
          className="rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-4)] text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
        >
          오늘 주문을 불러오는 중이에요…
        </p>
      ) : rows.length === 0 ? (
        <div
          data-testid="today-orders-empty"
          className="flex flex-col items-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-5)] text-center"
        >
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            오늘 낸 주문이 없어요
          </p>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            주문을 넣으면 접수·체결·취소가 여기에 모두 남아요.
          </p>
        </div>
      ) : (
        <div data-slot="today-orders-groups" className="flex flex-col gap-1.5">
          {groups.map((group) => (
            <div
              key={group.accountNo}
              data-slot="today-orders-group"
              data-account={group.accountNo}
              className="flex min-w-0 flex-col gap-1.5"
            >
              {/* 계좌 소제목 — account-panel 계좌 전용 모드 머리와 같은 문법(위 ⑨). */}
              <div className="flex min-w-0 items-center gap-[var(--s-2)] px-0.5">
                <span className="flex-none text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                  계좌
                </span>
                <span
                  data-slot="today-orders-group-account-no"
                  className="mono min-w-0 flex-1 truncate text-[length:var(--t-caption)] font-semibold text-[var(--fg)]"
                >
                  {group.accountNo}
                </span>
                {/* 상품명은 **있을 때만** — 목록 밖 계좌는 번호만 그린다. */}
                {group.name !== "" && (
                  <span className="flex-none whitespace-nowrap text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                    {group.name}
                  </span>
                )}
                <span className="mono flex-none whitespace-nowrap text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {group.rows.length}건
                </span>
              </div>

              {/* 데스크톱(≥1280) — 표 */}
              <div className="max-[1279px]:hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">시각</TableHead>
                      <TableHead scope="col">종목</TableHead>
                      <TableHead scope="col">구분</TableHead>
                      <TableHead scope="col">출처</TableHead>
                      <TableHead scope="col" className="num">
                        수량
                      </TableHead>
                      <TableHead scope="col" className="num">
                        가격
                      </TableHead>
                      <TableHead scope="col">상태</TableHead>
                      <TableHead scope="col">주문번호</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.merged.map((notice) => (
                      <OrderTableRow
                        key={notice.head.id}
                        notice={notice}
                        label={labels.get(notice.head.isin)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<1280) — 2줄 카드 행 (위 ⑤) */}
              <div
                data-slot="today-orders-list"
                className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] min-[1280px]:hidden"
              >
                {group.merged.map((notice) => (
                  <OrderCardRow
                    key={notice.head.id}
                    notice={notice}
                    label={labels.get(notice.head.isin)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 데스크톱 표 1행. 출처 열은 구분 바로 뒤, NXT 태그는 종목 셀의 코드 뒤다(위 ⑩). */
function OrderTableRow({
  notice,
  label: isinLabel,
}: {
  notice: MergedOrderNotice;
  label: IsinLabel | undefined;
}) {
  const row = notice.head;
  const stock = stockLabel(row, isinLabel);
  const facts = noticeFactsOf(row);
  const label = orderNoticeLabel(facts);
  return (
    <TableRow data-slot="today-order-table-row">
      <TableCell className="mono text-[length:var(--t-caption)]">{orderTime(notice.at)}</TableCell>
      {/*
        표 셀에는 폭 제약이 없어 `truncate` 가 동작하지 않는다 — 대신 `Table` 이
        감싸는 `.tbl-wrap overflow-x-auto` 가 가로 스크롤로 받는다(설계된 동작).
      */}
      <TableCell>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className={cn(
              "text-[length:var(--t-caption)] font-semibold text-[var(--fg)]",
              // 이름 자리에 코드/ISIN 이 올라온 행만 mono — 한글 종목명에는 씌우지 않는다.
              stock.code === null && "mono",
            )}
          >
            {stock.name}
          </span>
          {stock.code !== null && (
            <span className="mono text-[11px] text-[var(--muted-fg)]">{stock.code}</span>
          )}
          {row.exchange === "NXT" && <ExchangeTag exchange="NXT" size="sm" />}
        </span>
      </TableCell>
      <TableCell>
        <SideTag label={label} srAction={orderActionWord(facts)} />
      </TableCell>
      <TableCell>
        <OriginTag tag={originTagOf(row.origin)} slot="today-order-origin" />
      </TableCell>
      <TableCell className="num mono text-[length:var(--t-caption)]">{qtyText(notice)}</TableCell>
      <TableCell className="num mono text-[length:var(--t-caption)]">{priceText(notice)}</TableCell>
      <TableCell>
        <StatusTag shown={orderDisplayStatus(row)} />
      </TableCell>
      <TableCell className="mono text-[length:var(--t-caption)]">
        {notice.orderNoText ?? "—"}
        {notice.count > 1 && (
          <span className="ml-1 text-[var(--muted-fg)]">({notice.count}건)</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * 모바일 2줄 카드 행 (위 ⑤ · ⑩).
 * ①줄 = 종목명(유일한 신축 항목) · 코드 · NXT · 구분 · 출처 · (우) 상태.
 */
function OrderCardRow({
  notice,
  label: isinLabel,
}: {
  notice: MergedOrderNotice;
  label: IsinLabel | undefined;
}) {
  const row = notice.head;
  const stock = stockLabel(row, isinLabel);
  const facts = noticeFactsOf(row);
  const label = orderNoticeLabel(facts);
  return (
    <div data-slot="today-order-row" className="min-w-0 px-[var(--s-3)] py-[var(--s-2)]">
      <div className="flex min-w-0 items-center gap-[var(--s-2)]">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]",
            // 이름 자리에 코드/ISIN 이 올라온 행만 mono (위 ⑥).
            stock.code === null && "mono",
          )}
        >
          {stock.name}
        </span>
        {/* 식별자 — 이름이 잘려도 이것은 온전히 남아야 하므로 `flex:none` 이다. */}
        {stock.code !== null && (
          <span className="mono flex-none whitespace-nowrap text-[11px] text-[var(--muted-fg)]">
            {stock.code}
          </span>
        )}
        {row.exchange === "NXT" && <ExchangeTag exchange="NXT" size="sm" />}
        <span className="flex flex-none items-center gap-1">
          <SideTag label={label} srAction={orderActionWord(facts)} />
          <OriginTag tag={originTagOf(row.origin)} slot="today-order-origin" />
        </span>
        <span className="ml-auto flex flex-none items-center gap-1">
          <StatusTag shown={orderDisplayStatus(row)} />
        </span>
      </div>
      {/*
        ②줄 — 시각 · 수량 · 가격 · (우) 주문번호. 전부 `flex:none` 이라 넘침을 흡수할 신축 항목이
        없다 — 390px 에서 묶인 행(주문번호 범위 · (N건))이 넘치면 **줄을 바꿔** 주문번호가 다음 줄로
        내려간다(Phase 19 D-07 · 목업 `.fix .l2`). 잘리지 않는다.
      */}
      <div className="mt-1 flex min-w-0 flex-wrap gap-y-0.5 items-center gap-x-[var(--s-2)]">
        <span className="flex flex-none items-center gap-1">
          <RowValue>{orderTime(notice.at)}</RowValue>
        </span>
        <span className="flex flex-none items-center gap-1">
          <RowKey>수량</RowKey>
          <RowValue>{qtyText(notice)}</RowValue>
        </span>
        <span className="flex flex-none items-center gap-1">
          <RowKey>가격</RowKey>
          <RowValue>{priceText(notice)}</RowValue>
        </span>
        <span className="ml-auto flex flex-none items-center gap-1">
          <RowKey>주문</RowKey>
          <RowValue>{notice.orderNoText ?? "—"}</RowValue>
          {notice.count > 1 && (
            <span className="text-[11px] text-[var(--muted-fg)]">({notice.count}건)</span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * 묶인 행의 가격 — **범위**다. 단가를 더하면 없는 값이 생기고(3천원짜리 3건이 9천원으로
 * 보인다), 트레이더는 그 숫자로 판단한다. 정본 C# `RewriteMerged` 도 min~max 로 쓴다.
 * 단가를 모르면(로컬 거부 · 취소 0) 지어내지 않고 「—」 다 (Phase 19 D-08).
 */
function priceText(group: MergedOrderNotice): string {
  const { priceMin: min, priceMax: max } = group;
  if (min === null || max === null) return "—";
  return min === max ? KRW.format(min) : `${KRW.format(min)}~${KRW.format(max)}`;
}

/** 수량 — 모르면 「—」(체결이 접수보다 먼저 온 행 · 로컬 거부). 0 으로 지어내지 않는다. */
function qtyText(group: MergedOrderNotice): string {
  return group.qty === null ? "—" : KRW.format(group.qty);
}

/** 카드 행의 라벨(11px 중립). **`flex:none`** 이라 숫자를 밀어내지 않는다. */
function RowKey({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-[var(--muted-fg)]">{children}</span>;
}

/** 카드 행의 값(mono·tabular). 이것도 `flex:none` 이어야 잘리지 않는다. */
function RowValue({ children }: { children: ReactNode }) {
  return (
    <span className="mono whitespace-nowrap text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
      {children}
    </span>
  );
}

/**
 * 행위 표기 — **부호 + 라벨 병기**로 색에 의존하지 않는다(WCAG 1.4.1, account-panel 과 동형).
 *
 * ★ 문자열을 **조립하지 않고 받아 그린다**(17-09 가 미체결 표식에서 세운 규율과 같다).
 *   판정도 접두도 `order-notices.ts` 한 곳에서 나온다.
 *
 * ★ 취소·정정 행은 방향색을 쓰지 않는다 — 서버는 취소·정정에 side 를 쓰지 않고 그대로
 *   에코하므로 **매도 주문의 취소도 「매수」** 로 보인다. 색으로 그리면 신규 매수와 헷갈린다.
 *
 * ★ `srAction` — 시간외종가 취소·정정은 보이는 문구가 「시간외종가」 뿐이라(D-15 사용자
 *   결정) 행위 단어가 눈에서 사라진다. 상태 칸이 그 자리를 대신하지만, 스크린리더가 이
 *   칸만 읽을 때도 무엇을 한 통보인지 들리도록 `orderActionWord` 의 **맨몸 단어**를
 *   숨김 텍스트로 같이 둔다. 보이는 문자열은 바뀌지 않는다.
 *
 * ★ D-08 — 출처 칩이 수동을 말한다. 그래서 이 칸은 「· 수동」 꼬리를 그리지 않는다
 *   (`orderNoticeLabel` 의 메타 필드와 함수는 trading-alerts 가 쓰므로 그대로 둔다).
 */
function SideTag({ label, srAction }: { label: OrderNoticeLabel; srAction: string }) {
  const arrow = label.side === "B" ? "▲ " : label.side === "S" ? "▼ " : "";
  return (
    <span
      data-slot="today-order-side"
      data-side={label.side ?? "none"}
      className={cn(
        "whitespace-nowrap text-[length:var(--t-caption)] font-semibold",
        label.side === "B" && "text-[var(--up)]",
        label.side === "S" && "text-[var(--down)]",
        label.side === null && "text-[var(--muted-fg)]",
      )}
    >
      {arrow}
      {label.text}
      {srAction !== "" && srAction !== label.text && (
        <span className="sr-only"> {srAction}</span>
      )}
    </span>
  );
}

/** 상태 배지 — 색은 톤 3종만 쓴다(account-panel 이 쓰는 토큰과 같은 집합). */
function StatusTag({ shown }: { shown: OrderDisplayStatus }) {
  return (
    <span
      data-slot="today-order-status"
      data-tone={shown.tone}
      className={cn(
        "whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold",
        shown.tone === "danger" && "text-[var(--destructive)]",
        shown.tone === "muted" && "text-[var(--muted-fg)]",
        shown.tone === "normal" && "text-[var(--fg)]",
      )}
    >
      {shown.label}
    </span>
  );
}
