"use client";

/**
 * TradingWorkbench — `/trading` **단일 트레이딩 작업대** 셸 (D-01 · D-02 · D-04 · D-09 · D-13 ·
 * D-27 · D-28, TRADE-09). 정본은 채택 목업 `18-workbench-mockup.html`(마크업 `:727-756`).
 *
 * ① 위 → 아래 고정 순서 (UI-SPEC §레이아웃 계약 표 10행)
 *   제목줄(「트레이딩」 + 계좌 필) → 상태줄 → VI 패널(스트립 줄 · 「더보기」 펼침 안 VI 설정 2줄 ·
 *   발동 표) → 돌파 스트립/표 → 종목 추가 → 카드 격자 → 공용 패널. 블록은 앞선 플랜(18-05 ~
 *   18-10)이 만든 것을 **조립만** 한다. VI 설정은 VI 패널의 `settings` 슬롯으로 넘긴다 — 접혀도
 *   마운트가 유지되므로 아래 ⑦ 의 VI 더티 합이 그대로 산다.
 *
 * ② ★ 이 컴포넌트가 **카드 집합의 단일 소유자**다
 *   `{ id, isin, accountNo, exchange, open, name?, code? }` 목록 · 단 수 · 선택된 미체결 행 · 상태줄
 *   계좌 · 팝업 상태를 여기 한 곳이 갖는다. 돌파 스트립·종목 추가란의 `onAddCard`/`onFocusCard`, 카드
 *   헤더의 ✕·캐럿·거래소 세그먼트가 전부 이 상태를 바꾼다.
 *   - ★ 카드 정체성은 **카드 id**(`wb-card-{n}`, 이 컴포넌트가 단조 증가로 만든다)다 — 격자 key ·
 *     DOM id · 콜백 인자 · 더티/로그 합산이 전부 이 축이다(18-REVIEW WR-05). 전략 키
 *     (`ISIN:계좌:거래소`)는 카드의 **현재 값**이다 — 등록 여부와 무관하게 거래소 토글로 키가
 *     바뀌므로(quick-260923-pgv) 정체성으로 쓰면 토글마다 다시 마운트된다(WR-02 사고의 재발).
 *   - ★ 거래소 전환과 자동 카드(quick-260923-pgv) — 등록 KRX 카드를 NXT 로 바꾸면 KRX 키 카드가
 *     사라지지만 `seenKeys` 가 멤버십 ref 라 그 키는 다시 `fresh` 가 되지 않고, 리마운트는 lyt
 *     `restoreSavedCards` 의 `seen` 이 막는다 — 한 종목 카드 하나에서 거래소를 오간다. 배치 기억 없는
 *     첫 방문은 등록 전략마다 카드가 생기는 기존 동작 그대로다.
 *   - 등록 전략 하나에 카드 하나다(D-03 「카드와 동기」) — 같은 ISIN 에 전략이 둘(KRX·NXT 또는
 *     계좌 A·B)이면 카드도 둘이다. 두 카드가 **같은 전략 키**를 가질 수는 없다(한 서버 전략을 두
 *     훅이 소유하면 에코 상관이 갈라진다 · T-18-94).
 *   - 사용자 트리거 추가(돌파 칩 · 종목 추가)는 **종목 단위**다(D-07 · D-08) — 그 ISIN 의 카드가
 *     있으면 그 카드 하나(`isinFocusCardOf`)를 펼칠 뿐 새 카드를 만들지 않는다. 「거래중」 표식도 ISIN 단위다.
 *     돌파 행 경로만 거래소를 안다(`openBreakoutCard` · quick-260926-s5v) — 발화 거래소 키 카드가 있으면
 *     그것을 펼치고, 없으면 종목 단위 포커스 카드를 펼친 뒤 발화 거래소로 전환한다(`changeExchange` 규칙).
 *   - 공용 패널 미체결 행 선택은 그 행을 받을 카드(같은 ISIN ∧ 행의 거래소 ∧ 상태줄 계좌)를
 *     보장한다 — 없으면 그 키로 펼친 카드를 붙인다(`cardForUnfilled` · WR-04). 역시 송신 0 이다.
 *     카드 안 「미체결」 탭(quick-260923-onn)도 같은 `selectUnfilled` 를 탄다 — 선택은 여전히 이
 *     컴포넌트 하나가 소유한다(카드는 `selectedUnfilled?.orderNo` 를 파생할 뿐).
 *     공용 패널 행(미체결 · 잔고) 클릭은 카드 보장 뒤 `reveal` — 카드 머리를 화면 위로(`block:start`)
 *     스크롤하고 헤더 토글에 포커스(quick-260925-ptw). 잔고 행은 거래소를 모르므로 `addCard` 와 같은
 *     ISIN 단위 규칙(상태줄 계좌 · KRX)이다. 카드 탭 안 미체결 클릭은 reveal 하지 않는다(자기 카드
 *     안에서 포커스를 뺏지 않게). 역시 송신 0 이다.
 *   - ★ 카드 순서(quick-260923-p3k) — 배열 순서가 곧 무리 안 순서다(card-grid ①). `open` 을 바꾸는
 *     모든 경로는 `withCardOpen` 하나를 지나 그 카드를 배열 **맨 끝**으로 옮긴다: 접으면 접힘 스택
 *     맨 끝, 펼치면(토글 · 종목 추가/돌파 칩 · 미체결 선택 · `?focus=`/사이드바 · 거래소 충돌) 펼친
 *     카드 맨 끝. 새 카드와 등록 전략 자동 카드는 append 라 이미 끝이다. 이미 같은 상태면 참조
 *     그대로(순서 · 재렌더 불변). 배치 저장(quick-260923-lyt)은 이 배열 순서를 그대로 저장·복원한다.
 *     종목 단위 포커스(돌파 칩 · 종목 추가)가 고르는 카드는 `isinFocusCardOf` 하나가 푼다 — 그 ISIN
 *     의 펼친 카드가 있으면 그것(다시 눌러도 둘째 카드를 열지 않는다), 없으면 배열 첫 카드. 업데이터와
 *     스크롤 효과가 같은 함수를 써서, 펼친 카드가 끝으로 옮겨도 둘이 다른 카드를 가리키지 않는다.
 *   - 새 카드는 **스위치 전부 OFF · 펼침**으로 시작한다(D-07). 거래소는 경로가 정한다 — 돌파 행 경로는
 *     **행의 발화 거래소**(NXT 미거래 확정 종목의 NXT 요청은 무시 → KRX)로 시작하고, 기존 카드는 발화
 *     거래소로 맞춘다(quick-260926-s5v · gh-trade cfo `OpenLimitChaserForm(code, null, row.CrossExchange)`).
 *     거래소를 모르는 경로(종목 추가란 · 잔고 행)는 KRX 다. 서버에 아무것도 보내지 않는다 — 등록은
 *     사용자가 카드에서 스위치를 켤 때뿐이다.
 *   - 등록된 전략(64 스냅샷 · 60 에코)은 처음 보이는 키일 때, 그 키를 **현재 키로 가진 카드가
 *     없으면** 접힌 카드로 한 번 들어온다(카드 집합 멤버십만 읽는다 — 값은 카드가 스스로 읽는다,
 *     ③). 그래서 64 스냅샷 전의 짧은 구간은 빈 문구다(E6 loading).
 *
 * ③ ★ 에코를 **분배하지 않는다** (Pitfall 9 · T-18-52)
 *   `limitChasers` 배열을 카드에 prop 으로 내리지 않는다. 카드는 `useRelayContext()` 에서 직접 읽고
 *   자기 `key` 로 `find` 한다(`strategy-card.tsx` ②). 작업대가 가운데 서는 순간 상관의 두 번째 벌이
 *   생긴다. 여기서 `limitChasers` 를 보는 곳은 딱 둘 — 처음 보는 키의 카드 추가(멤버십)와 ✕ 시
 *   「등록된 전략인가」 판정 — 이고 둘 다 카드에 값을 건네지 않는다.
 *
 * ④ 재렌더 예산 (Pitfall 10 · T-18-56)
 *   `useIsinLabels()` Map 을 카드에 통째로 내리지 않는다 — `labels.get(isin)` 결과 **문자열**만 내린다.
 *   카드 콜백은 전부 카드 id 를 받는 안정 콜백이다(`strategy-card.tsx` ④).
 *
 * ⑤ 컨테이너 두 개 (D-28)
 *   이 루트가 `@container/wb`(페이지 본문 폭)이고, 카드 래퍼가 `@container/lc`(카드 폭)다.
 *   **뷰포트 분기를 신설하지 않는다** — 앱 셸·사이드바만 기존 뷰포트 브레이크포인트를 쓴다. 단 수
 *   세그먼트를 폰 밴드에서 DOM 에서 빼려면 `wb` 폭을 알아야 해서, 루트 폭을 `ResizeObserver` 로
 *   읽어 공용 패널에는 `phoneBand`(<700), 상태줄에는 `singleColumnOnly`(<680, 격자 1열 고정)로
 *   내린다(격자 열 수는 CSS 가 정한다). 두 경계의 정본은 `globals.css` §2.2b 다.
 *
 * ⑥ `?focus={전략키}` 는 **마운트 1회만** 소비한다 (D-02 · RESEARCH Pattern 6 · T-18-53)
 *   `parseStrategyKey` 로만 해석하고, 모양이 어긋나면 무시한다. 그 키가 **등록된 전략**으로 보이면
 *   (스냅샷 도착 후) **그 키의 카드**를 펼친다(같은 ISIN 의 다른 키 카드가 아니다 · WR-05) — 카드를
 *   새로 **등록**하지 않는다. 뒤로가기로 URL 이 바뀌어도
 *   로컬 상태가 정본이다.
 *   이미 이 화면 위에서 사이드바 전략을 누르면 URL 만 바뀌므로, 사이드바가 보내는 **포커스 요청
 *   이벤트**(`lib/trading-focus.ts`)를 따로 듣는다(18-12). 같은 해석(`parseStrategyKey` → 등록 키
 *   대조)을 거치고, 스냅샷 전이면 마운트 때와 같은 보류 슬롯에 넣는다.
 *   ★ 보류는 **등록 목록을 알기 전에만** 허용한다(WR-07 · GC-IN-02 · `knowsRegistered`) — 이번
 *   연결에서 확정 64 스냅샷을 받은 뒤의 미스는 (빈 목록이어도) 버리고, 보류 중이던 요청도 그
 *   스냅샷이 그 키 없이 오면 버린다. relay 는 64 전에 `lc.snap` 을 보내지 않는다(18-26).
 *
 * ⑥-b `?code=` — 종목상세 「트레이딩」 착지(D-30 · G-21-R3-9) · 복원 뒤 1회 · 카드 보장 + reveal · 송신 0
 *   배치 복원(`layoutRestored`) **뒤에** 처리한다 — 복원 전에 붙인 카드는 복원이 덮는다. 처리한 코드는
 *   `handledCodeRef` 에 적어 같은 값을 두 번 처리하지 않는다. 6자리(`[0-9A-Z]`)가 아니면 fetch 없이
 *   로그만, 맞으면 `fetchStockDetail` → `isPickable`(종목 추가란과 **같은 판정 한 곳** — KOSPI/KOSDAQ ∧
 *   isin) → `ensureIsinCard(…, reveal=true)`(있으면 펼침 · 없으면 상태줄 계좌 · KRX 로 추가 · 머리 위로
 *   스크롤 + 헤더 토글 포커스). 매매 불가 · 실패는 카드 없이 로그만. 끝나면 `replaceState` 로 `code` 만
 *   지운다(다른 파라미터는 남김). 전략 등록 · 주문은 **보내지 않는다**(T-21-91).
 *
 * ⑦ 이탈 경고 · 게이트 · 팝업은 **페이지 1곳**
 *   - `useLeaveWarning` 은 카드 더티 수 + VI 2줄 더티 수의 합으로 한 번만 건다.
 *   - `DmaGate` 는 여기 한 곳에서만 감싼다(카드마다 감싸지 않는다). 게이트가 서면 격자·스트립이
 *     렌더되지 않는다(T-18-54). 연결 중에는 게이트를 세우지 않는다(`useDmaGateReason` 규율).
 *   - 종목정보 팝업(`StockInfoModal`)은 한 번에 하나 — 상태를 여기 둔다.
 *
 * ⑧ 카드 ✕ (UI-SPEC E7 error · E7 확장 · R3 목업 ②)
 *   등록 전 카드는 즉시 사라진다. 두 경우만 확인 다이얼로그(`workbench-close-confirm`, `data-reason`)
 *   를 거친다 — 판정은 `closeCard` 한 곳이다.
 *   - `unknown` — 카드의 계좌·ISIN 에 대해 **KRX·NXT 두 키 중 하나라도** `RelayProvider` 주문
 *     잠금(진행 중 · 결과 모름)에 있다(⑨). 제목 「결과를 모르는 주문이 있어요」 + 「잠긴 거래소: …」 한
 *     줄. 본문은 해제 규칙(로그아웃 · 새로고침)을 사실대로 말한다. ★ 현재 키만 보지 않는다
 *     (quick-260923-pgv) — 거래소 토글이 등록 후에도 자유로워져, KRX 키가 잠긴 카드를 NXT 로 바꾼 뒤
 *     ✕ 를 누르면 현재 키만 보는 판정은 경고 없이 닫는다. 잠금 자체(요청의 키 · 앱 수명)는 그대로다.
 *     단 같은 계좌·ISIN 의 **다른 카드가 지금 보여주는** 거래소 키는 뺀다 — 다른 카드가 보여주는
 *     잠금은 시야에서 사라지지 않는다(quick-260923-que). 빼고 남은 게 없으면 아래 `registered` → 즉시 제거.
 *     등록 전략도 있으면 아래 등록 전략 문장이 한 줄 더 붙는다(R3 목업 ② 2-b).
 *   - `registered` — **등록된 전략이 있는 카드**. 카드를 닫는 것은 서버 전략 삭제가 아니다(전략은
 *     계속 동작하고 사이드바·My page 에 남는다).
 *   작업대가 `lc.set` 을 직접 보내는 두 번째 송신 경로를 만들지 않는다 — 전략을 끄는 경로는 카드의
 *   스위치 하나다. 다이얼로그·잠금은 화면 상태다(서버 송신 0).
 *
 * ⑨ 잠금은 작업대가 들지 않는다 — `RelayProvider.orderLocks`(앱 수명)를 ✕ 판정에만 읽는다 ·
 *   카드 폼은 같은 컨텍스트를 스스로 읽는다 (R3-WR-02 · D-27 R4 보강 · 사용자 결정 1)
 *   신규 · 정정 요청이 전송 중이거나 결과 모름(timeout)이면 `RelayProvider` 가 **보낸 요청의**
 *   `계좌|ISIN|거래소`(`strategyKey`) 키를 잠근다(해제는 로그아웃 · 새로고침 · 취소 timeout 은 잠그지
 *   않는다). 작업대는 잠금을 상태로 두지도, 카드 본문에 prop 으로 내리지도 않는다 — 원천은 하나다.
 *   그래서 ✕ 뒤 종목 추가 · 돌파 칩 · 미체결 선택 · 다른 화면에 다녀오기 어느 경로로 다시 열어도 새
 *   카드의 폼이 같은 키로 잠긴 채 선다.
 *
 * ⑩ 이벤트 알림 (quick-260923-pgu · 목업 ③A · 결정 갱신 D-36/D-27)
 *   접수 · 체결 · 정정/취소확인 · 거부 · VI 발동 · 돌파(스트립 새 행 `onRowsAdded` · quick-260926-s5v) 가
 *   오면 `useTradingAlerts` 가 토스트를 세우고
 *   (`AlertToasts` — 이 루트 안에만, 앱 셸 아님), 그 이벤트의 카드(`cardForAlert`)에 표시를 건다.
 *   작업대가 `alertedCardIds`(헤더 펄스 → 빨간 점 · 링) 와 `tabRequest`(클릭 시 카드 탭) 를 **소유**하고
 *   카드 상태(`WorkbenchCard`)에 섞지 않는다 — 배치 저장에 들어가지 않는다. 이벤트만으로 카드를 만들지
 *   않는다(클릭 때만). 표시는 헤더 토글 · 토스트 클릭으로 지워진다. 카드 `open` 변경은 여기서도
 *   `withCardOpen` 하나를 지난다(quick-260923-p3k).
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  RelayExchange,
  RelayHolding,
  RelayLimitChaser,
  RelayQuote,
  RelayUnfilled,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardBody } from "@/components/trading/card/card-body";
import { StockInfoModal } from "@/components/trading/card/stock-info-modal";
import type { CardTabRequest } from "@/components/trading/card/card-tabs";
import {
  StrategyCard,
  type StrategyCardState,
} from "@/components/trading/card/strategy-card";
import { DmaGate, useDmaGateReason } from "@/components/trading/dma-gate";
import type { StrategyLogEntry } from "@/components/trading/strategy-log";
import { AlertToasts } from "@/components/trading/workbench/alert-toasts";
import { BreakoutStrip } from "@/components/trading/workbench/breakout-strip";
import { CardGrid } from "@/components/trading/workbench/card-grid";
import { SharedPanels } from "@/components/trading/workbench/shared-panels";
import { isPickable, StockAddBar } from "@/components/trading/workbench/stock-add-bar";
import {
  ViServerErrorLine,
  ViSettingsRows,
} from "@/components/trading/workbench/vi-settings-rows";
import { ViTriggerStrip } from "@/components/trading/workbench/vi-trigger-strip";
import {
  AccountPill,
  WorkbenchStatusBar,
} from "@/components/trading/workbench/workbench-status-bar";
import { useAuth } from "@/lib/auth-context";
import { readColsPref, type TradingCols } from "@/lib/breakout-list";
import { exchangeChoicesOf } from "@/lib/exchange-choices";
import { useIsinLabels } from "@/lib/isin-labels";
import { exchangeLabeledName, isActiveStrategy, parseStrategyKey, strategyKey } from "@/lib/limit-chaser";
import { useNativeRefresh } from "@/lib/native/use-native-refresh";
import { useRelayContext } from "@/lib/relay-provider";
import { fetchStockDetail } from "@/lib/stock-api";
import { alertTabFor, type TradingAlert } from "@/lib/trading-alerts";
import { useTradingFocusRequest } from "@/lib/trading-focus";
import {
  readTradingLayout,
  writeTradingLayout,
  type SavedLayout,
} from "@/lib/trading-layout";
import { breakoutFeedKey } from "@/lib/use-breakout-quotes";
import { useLeaveWarning } from "@/lib/use-leave-warning";
import { useTradingAlerts } from "@/lib/use-trading-alerts";
import { relayQuoteKey, type RelayStatus } from "@/lib/use-relay-socket";
import { useViServerError } from "@/lib/use-vi-server-error";
import type { RelayQueuedWindowMsg } from "@gh-radar/shared";

/** 페이지(`wb`) 폰 밴드 상한(미만) — `globals.css` §2.2b 의 첫 경계(본문 700)와 같은 값이다. */
const WB_PHONE_BAND_BELOW = 700;
/**
 * 격자 1열 고정 상한(미만) — 이 폭 아래에서만 단 수 세그먼트가 빠진다. 카드 밴드 경계가 아니라
 * 「2열 격자가 서는 최소 wb 폭」이다(§2.2b 「격자 열 수 경계」). 700 이면 갤럭시 폴드 안쪽 화면
 * (wb ≈ 691)이 9px 차이로 1열에 갇힌다(quick-260923-hfk). `card-grid.tsx` `COLS_CLASS` ·
 * 상태줄 CSS 폴백의 `@min-[680px]/wb` 리터럴과 같은 값이어야 한다.
 */
const WB_SINGLE_COLUMN_BELOW = 680;

/** 합친 전략 로그 보관 상한(브라우저 메모리). 카드 1장의 상한(100)과 같은 자릿수다. */
const MAX_MERGED_LOG = 200;

/** 자동 복구를 기대할 수 없는 상태 — 상태줄에 「다시 연결」을 준다(18-10 호가 탭과 같은 집합). */
const UNRECOVERABLE_STATES: ReadonlySet<string> = new Set([
  "failed",
  "manual_required",
  "session_rejected",
]);

/** ⑧ ✕ 확인 다이얼로그 원문 — UI-SPEC E7 · R3 목업 ②. */
const CLOSE_REGISTERED_TITLE = "등록된 전략이 있는 카드예요";
const CLOSE_REGISTERED_BODY =
  "카드를 닫아도 서버의 상따 전략은 그대로 동작해요. 전략을 멈추려면 카드에서 매수·매도 스위치를 끄세요.";
export const CLOSE_UNKNOWN_TITLE = "결과를 모르는 주문이 있어요";
export const CLOSE_UNKNOWN_BODY =
  "미체결 목록에서 접수 여부를 확인하세요. 카드를 닫았다 다시 열거나 다른 화면에 다녀와도 이 종목의 주문 버튼은 잠긴 채로 남아요. 로그아웃하거나 새로고침하면 풀려요.";

/** ⑧ 결과 모름 다이얼로그의 잠긴 거래소 한 줄(quick-260923-pgv) — 테스트가 같은 함수를 읽는다. */
export function closeLockedExchangesLine(exchanges: readonly RelayExchange[]): string {
  return `잠긴 거래소: ${exchanges.join(" · ")}`;
}

/**
 * 거래소 전환 확인(quick-260923-pgv · 설계 항목 2) — 전환은 폼 remount 라 미전송 더티 값이 사라진다.
 * 테스트가 같은 상수·함수를 읽는다.
 */
export const EXCHANGE_SWITCH_TITLE = "수정 중인 값이 사라져요";
export function exchangeSwitchBody(
  name: string,
  count: number,
  from: RelayExchange,
  to: RelayExchange,
): string {
  return `${name} 의 수정 중인 값 ${count}개가 사라져요. ${from} → ${to} 로 바꿀까요?`;
}

const EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

/** 종목 추가 검색란 — ✕ 로 마지막 카드가 사라졌을 때 포커스를 받는다. */
const ADD_SEARCH_SELECTOR = '[data-slot="stock-add-bar"] input';

/** 카드 1장의 작업대 측 상태(②). 값(전략·시세)은 없다 — 카드가 스스로 읽는다(③). */
export interface WorkbenchCard {
  /** 카드 정체성(②) — `wb-card-{n}`. 전략 키가 아니다(등록 여부와 무관하게 거래소 토글로 키가 바뀐다 · quick-260923-pgv). */
  id: string;
  isin: string;
  /** 카드 키의 계좌 — 만들 때의 상태줄 계좌(또는 등록된 전략 키의 계좌)로 고정된다(Q-3). */
  accountNo: string;
  exchange: RelayExchange;
  open: boolean;
  /** 추가 시점에 알던 종목명·코드(돌파 항목·검색 결과). 없으면 라벨 역매핑을 쓴다. */
  name?: string;
  code?: string;
}

/** 카드의 **현재** 전략 키(②) — 정체성이 아니라 값이다. */
function keyOf(c: WorkbenchCard): string {
  return strategyKey(c.isin, c.accountNo, c.exchange);
}

/**
 * ⑧ ✕ 판정 — 카드의 계좌·ISIN 에 대해 잠긴 거래소(KRX·NXT 순). 현재 거래소만 보지 않는다
 * (quick-260923-pgv). 단 **다른 카드가 지금 그 키를 보여주는** 거래소는 뺀다 — 이 카드를 닫아도
 * 잠긴 주문이 시야에서 사라지지 않는다(quick-260923-que). 카드 키는 유일하므로(T-18-94) 자기 현재
 * 키는 이 제외에 걸리지 않는다. 계좌가 비었으면 잠금 키가 없다.
 */
function lockedExchangesOf(
  locks: ReadonlyMap<string, unknown>,
  c: WorkbenchCard,
  cards: readonly WorkbenchCard[],
): RelayExchange[] {
  if (c.accountNo === "") return [];
  return EXCHANGES.filter((ex) => {
    const key = strategyKey(c.isin, c.accountNo, ex);
    return locks.has(key) && !cards.some((o) => o.id !== c.id && keyOf(o) === key);
  });
}

/** 카드 헤더 토글 id — `strategy-card.tsx` 의 `strategy-card-{카드 id}-toggle` 규약. */
function toggleIdOf(id: string): string {
  return `strategy-card-${id.replace(/[^A-Za-z0-9_-]/g, "_")}-toggle`;
}

/**
 * 펼친 뒤 화면에 들여올 카드 — 전략 키(포커스 · 키 충돌) 또는 ISIN 의 첫 카드(D-07 · D-08).
 * `reveal` = 공용 패널 행 클릭(quick-260925-ptw) — 카드 머리를 화면 위로(`block:start`) 스크롤하고
 * 헤더 토글에 포커스. 없으면 종전대로 `nearest` 스크롤만.
 */
type ScrollTarget = ({ key: string } | { isin: string }) & { reveal?: boolean };

/**
 * 카드 순서 규칙(quick-260923-p3k · 2026-09-23 개정) — 접으면 접힘 스택 **맨 앞**, 펼치면 펼친 카드 맨 끝(**순수 함수**).
 * `open` 을 바꾸는 모든 경로가 이 함수 하나를 지난다. 무리 안 순서는 배열 순서다(card-grid ①) —
 * `renderOrderOf` 는 손대지 않는다. 대상이 없거나 이미 같은 상태면 입력 배열을 그대로 돌려준다
 * (참조 유지 · `setCards` 베일아웃 · 저장 효과 재실행 없음). 입력은 변형하지 않는다.
 */
export function withCardOpen(
  prev: WorkbenchCard[],
  id: string,
  open: boolean,
): WorkbenchCard[] {
  const i = prev.findIndex((c) => c.id === id);
  if (i < 0 || prev[i].open === open) return prev;
  const rest = [...prev.slice(0, i), ...prev.slice(i + 1)];
  // 펼치면 펼친 무리의 끝, 접으면 접힘 무리의 **맨 앞**(2026-09-23 사용자 요청) — `renderOrderOf` 가
  // 무리 안에서 배열 순서를 지키므로 배열 앞/끝이 곧 무리 앞/끝이다.
  return open ? [...rest, { ...prev[i], open }] : [{ ...prev[i], open }, ...rest];
}

/**
 * 종목 단위 포커스(D-07 · D-08)가 펼칠 카드 — 그 ISIN 의 **펼친 카드**가 있으면 그것, 없으면 배열(=
 * 표시) 첫 카드. `focusCard` · `addCard` 업데이터와 스크롤 효과가 같은 규칙으로 푼다 — 펼친 카드가
 * 배열 끝으로 옮겨도(`withCardOpen`) 둘이 같은 ISIN 의 다른 카드를 가리키지 않는다(quick-260923-p3k).
 */
function isinFocusCardOf(cards: readonly WorkbenchCard[], isin: string): WorkbenchCard | undefined {
  return cards.find((c) => c.isin === isin && c.open) ?? cards.find((c) => c.isin === isin);
}

/**
 * 등록된 전략 1건의 카드를 펼친 카드 집합 (**순수 함수** · ⑥). **현재 키가 그 전략 키인 카드**를
 * 펼치고(같은 ISIN 의 다른 키 카드는 건드리지 않는다 · WR-05), 없으면 그 전략의 키(계좌·거래소)로
 * 펼친 카드를 `newId` 로 붙인다. `?focus=` 마운트 소비와 사이드바 포커스 요청이 같은 규칙을 쓴다.
 */
function withFocusedCard(
  prev: WorkbenchCard[],
  hit: RelayLimitChaser,
  newId: string,
): WorkbenchCard[] {
  const cur = prev.find((x) => keyOf(x) === hit.key);
  return cur !== undefined
    ? withCardOpen(prev, cur.id, true)
    : [
        ...prev,
        {
          id: newId,
          isin: hit.isin,
          accountNo: hit.accountNo,
          exchange: hit.exchange,
          open: true,
          name: hit.name,
          code: hit.code,
        },
      ];
}

/**
 * 공용 패널 미체결 행을 **받을 카드** 판정 (**순수 함수** · D-13 · D-21 · 18-REVIEW WR-04). 판정의
 * 유일 지점이다 — 선택 전달 조건(`renderCard` 의 `selectedUnfilled`: 같은 ISIN ∧ 행의 거래소 ∧ 카드
 * 계좌 = 상태줄 계좌)을 만족하는 카드가 있으면 그 id, 없으면 그 조건을 만족하도록 붙일 카드 모양
 * (행의 ISIN · 행의 거래소 · **상태줄 계좌** · 펼침)을 돌려준다. 전달 조건을 느슨하게 하지 않고
 * 카드를 붙이는 쪽으로 「선택됨인데 정정·취소 폼이 없음」 을 없앤다(T-18-96 · T-18-97).
 */
export type UnfilledTarget =
  | { kind: "existing"; id: string }
  | { kind: "new"; card: Omit<WorkbenchCard, "id"> };

export function cardForUnfilled(
  cards: readonly WorkbenchCard[],
  row: RelayUnfilled,
  accountNo: string,
): UnfilledTarget {
  const hit = cards.find(
    (c) => c.isin === row.isin && c.exchange === row.exchange && c.accountNo === accountNo,
  );
  if (hit !== undefined) return { kind: "existing", id: hit.id };
  return {
    kind: "new",
    card: {
      isin: row.isin,
      accountNo,
      exchange: row.exchange,
      open: true,
      name: row.name,
      code: row.code,
    },
  };
}

/**
 * 이벤트 알림을 **받을 카드** 판정 (**순수 함수** · quick-260923-pgu ⑩). 판정의 유일 지점이다 —
 * 토스트가 뜰 때의 헤더 표시(`markAlerted`)와 토스트 클릭(`openAlert`)이 같은 규칙으로 푼다.
 *  ① (ISIN · 계좌 · 거래소) 정확 일치 — 주문 통보 · VI 는 계좌를 안다.
 *  ② (ISIN · 거래소) — 펼친 카드 우선. 돌파는 계좌를 모른다.
 *  ③ ISIN 만 — `isinFocusCardOf`(펼친 카드 우선 · 종목 단위 포커스와 같은 규칙).
 * ISIN 을 모르면(색인 조인 실패 주문) `undefined` — 카드를 찾지도 만들지도 않는다.
 */
export function cardForAlert(
  cards: readonly WorkbenchCard[],
  a: Pick<TradingAlert, "isin" | "accountNo" | "exchange">,
): WorkbenchCard | undefined {
  const { isin, accountNo, exchange } = a;
  if (isin === undefined || isin === "") return undefined;
  if (accountNo !== undefined) {
    const exact = cards.find(
      (c) => c.isin === isin && c.accountNo === accountNo && c.exchange === exchange,
    );
    if (exact !== undefined) return exact;
  }
  const sameEx = cards.filter((c) => c.isin === isin && c.exchange === exchange);
  return sameEx.find((c) => c.open) ?? sameEx[0] ?? isinFocusCardOf(cards, isin);
}

/** 집합에서 한 id 를 뺀다 — 없으면 같은 참조(상태 베일아웃). */
function withoutId(prev: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!prev.has(id)) return prev;
  const next = new Set(prev);
  next.delete(id);
  return next;
}

/**
 * 잔고 평가 가격 (**순수 함수** · 18-REVIEW-R2 GC-IN-04) — KRX 시세가 유한·양수면 그 값, 아니면 NXT
 * 시세가 같은 조건이면 그 값, 아니면 `undefined`(평가손익 「—」).
 *
 * 근거: 잔고 행에는 거래소 축이 없다(게이트웨이 `HoldingState` · `RelayHolding` 은 ISIN · 수량 ·
 * 매도가능 · 평단뿐이다). KRX 는 기본 거래소다. NXT
 * 폴백은 NXT 카드만 있는 종목의 평가를 비우지 않기 위해서다. 카드 집합을 읽지 않는다 — 예전에는
 * 그 ISIN 의 **첫 카드** 거래소를 골라 같은 종목 KRX·NXT 카드의 순서에 따라 평가 가격이 바뀌었다.
 */
export function holdingQuotePrice(
  quotes: ReadonlyMap<string, RelayQuote>,
  isin: string,
): number | undefined {
  for (const exchange of ["KRX", "NXT"] as const) {
    const p = quotes.get(relayQuoteKey(isin, exchange))?.p;
    if (p !== undefined && Number.isFinite(p) && p > 0) return p;
  }
  return undefined;
}

/**
 * 계좌 채움 (**순수 함수** · GC-IN-05 · D-07). 계좌 도착 전에 만든 카드(계좌 `""`)를 `accountNo` 로
 * 채운다. 채운 키가 이미 다른 카드의 키면(그 사이 같은 키의 등록 전략이 들어왔다) 그 빈 계좌 카드는
 * 치우고(`dropped`) — 두 카드가 같은 전략 키를 가질 수 없다(② · T-18-94) — 치운 카드가 펼쳐져
 * 있었으면 **그 키의 카드를 펼친다**(사용자가 연 카드의 맥락을 등록 카드가 잇는다 · 접혀 있었으면
 * 건드리지 않는다). 빈 계좌 카드가 없으면 입력 배열을 그대로 돌려준다(효과 무한 루프 방지).
 * 치운 카드의 정리(더티 · 직전 로그)는 여기서도 호출자도 하지 않는다 — 커밋된 `cards` 에서 파생한다
 * (R3-IN-03 · `WorkbenchSurface` 의 정리 효과). `dropped` 는 순수 함수 테스트가 치운 카드를 단언하려고
 * 남긴 반환이다 — 작업대는 `next` 만 쓴다.
 */
export function fillAccountCards(
  cards: WorkbenchCard[],
  accountNo: string,
): { next: WorkbenchCard[]; dropped: string[] } {
  if (!cards.some((c) => c.accountNo === "")) return { next: cards, dropped: [] };
  const taken = new Set(cards.filter((c) => c.accountNo !== "").map(keyOf));
  const openKeys = new Set<string>();
  const dropped: string[] = [];
  const kept: WorkbenchCard[] = [];
  for (const c of cards) {
    if (c.accountNo !== "") {
      kept.push(c);
      continue;
    }
    const filled = { ...c, accountNo };
    const key = keyOf(filled);
    if (taken.has(key)) {
      dropped.push(c.id);
      if (c.open) openKeys.add(key);
      continue;
    }
    taken.add(key);
    kept.push(filled);
  }
  // 펼침을 잇는 등록 카드도 「가장 최근에 바뀐 카드」 — 펼친 무리 끝으로(quick-260923-p3k).
  let next = kept;
  for (const c of kept) {
    if (openKeys.has(keyOf(c)) && !c.open) next = withCardOpen(next, c.id, true);
  }
  return { next, dropped };
}

/**
 * 저장된 배치 복원 (**순수 함수** · quick-260923-lyt). 저장된 카드가 저장 순서·펼침 그대로 앞에 서고,
 * 복원 전에 이미 생긴 카드(`prev` — 등록 전략 자동 카드 등)는 뒤에 붙는다. 단 **사용자가 닫아 둔
 * 등록 전략**(저장된 `seen` 에 있는데 저장된 카드에는 없는 키)은 붙이지 않는다 — 돌아왔을 때 닫은
 * 카드가 다시 생기면 기억한 게 아니다. 같은 키는 하나만(② · T-18-94). `ids` 는 저장 카드 수만큼
 * 호출자가 업데이터 **밖**에서 뽑아 넘긴다(`nextCardId` 규율).
 */
export function restoreSavedCards(
  prev: WorkbenchCard[],
  saved: SavedLayout,
  ids: readonly string[],
): WorkbenchCard[] {
  const out: WorkbenchCard[] = [];
  const keys = new Set<string>();
  saved.cards.forEach((c, i) => {
    const card: WorkbenchCard = { ...c, id: ids[i] };
    const key = keyOf(card);
    if (keys.has(key)) return;
    keys.add(key);
    out.push(card);
  });
  const closed = new Set(saved.seen);
  for (const c of prev) {
    const key = keyOf(c);
    if (keys.has(key) || closed.has(key)) continue;
    keys.add(key);
    out.push(c);
  }
  return out;
}

/**
 * 꺼진 등록 전략 카드 걷기 (**순수 함수** · 2026-09-23 사용자 결정). 작업대에 들어온 뒤 등록 목록을 처음
 * 확정으로 알 때 **한 번** 부른다 — 저장 배치로 되살아난 카드 중 등록 전략이 있는데 켜져 있지 않은
 * (`isActiveStrategy` 거짓) 카드를 뺀다. 등록 전략이 없는 카드(사용자가 추가한 빈 카드)와 주문
 * 잠금(진행 중 · 결과 모름)이 걸린 카드는 남긴다. 세션 도중 체결로 무장이 풀린 카드는 걷지 않는다.
 */
export function pruneInactiveCards(
  cards: WorkbenchCard[],
  chasers: readonly RelayLimitChaser[],
  locks: ReadonlyMap<string, unknown>,
): { next: WorkbenchCard[]; dropped: string[] } {
  const inactive = new Set(chasers.filter((c) => !isActiveStrategy(c)).map((c) => c.key));
  if (inactive.size === 0) return { next: cards, dropped: [] };
  const dropped: string[] = [];
  const next = cards.filter((c) => {
    const key = keyOf(c);
    if (!inactive.has(key) || locks.has(key)) return true;
    dropped.push(key);
    return false;
  });
  return dropped.length === 0 ? { next: cards, dropped } : { next, dropped };
}

/**
 * 「등록 전략 목록을 안다」 — 포커스 요청 보류를 버려도 되는가 (⑥ · WR-07 · 18-26 GC-IN-02).
 * **이번 연결에서 확정 64 스냅샷을 받았는가**(`limitChaserSnapSeq > 0`) 하나다 — 목록이 비어
 * 있는지는 보지 않는다.
 *
 * 확정 여부는 relay 계약이 말한다: relay 는 게이트웨이 64 를 받은 뒤에만 `lc.snap` 을 내리므로
 * (`relay/src/ws/fanout.ts` 인증 경로 · `hasLimitChaserList`) 받은 스냅샷은 빈 배열도 「등록 전략
 * 없음」 의 확정이다. 콜드 세션은 첫 64 까지 snapSeq 0 이라 `?focus=` 가 보류된 채 산다(D-02).
 * 세션이 ready 로 전환되면(재연결 · 재로그인) 리듀서가 0 으로 되돌려 새 64 까지 보류한다.
 */
function knowsRegistered(snapSeq: number): boolean {
  return snapSeq > 0;
}

/** 지금 시각 `HH:MM:SS` — 로케일 포맷터를 쓰지 않는다(`strategy-card.tsx` `clockNow` 와 같은 이유). */
function clockNow(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function TradingWorkbench() {
  const gateReason = useDmaGateReason();
  // 게이트는 페이지를 **대체**한다(⑦). 아래 본문의 훅이 돌지 않도록 컴포넌트를 가른다.
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="트레이딩" />;
  }
  return <WorkbenchSurface />;
}

function WorkbenchSurface() {
  const relay = useRelayContext();
  const {
    status,
    statusLabel,
    accounts,
    accountStates,
    limitChasers,
    limitChaserSnapSeq,
    viTriggers,
    viOrders,
    rateCrossItems,
    rateCrossSnapSeq,
    queuedWindow,
    quotes,
    messages,
    reconnect,
  } = relay;
  // D-16 — relay 재탐침. 편집 중 수동주문 입력은 컴포넌트 로컬 상태라 유지된다.
  useNativeRefresh(relay.probeNow);
  const labels = useIsinLabels();
  /*
    ④ — 라벨 Map 은 계좌 델타마다 새 인스턴스다. 콜백이 Map 을 의존성으로 잡으면 콜백이 매번 바뀌어
    카드 `memo` 가 죽는다. 콜백 안에서는 ref 로 최신 Map 을 읽는다.
  */
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  /* ── 상태줄 계좌 (Q-2 · Q-3) ─────────────────────────────────────── */
  const [accountNo, setAccountNo] = useState("");
  // 계좌가 도착하면 **미선택일 때만** 첫 계좌를 고른다. 이미 고른 계좌를 덮지 않는다.
  useEffect(() => {
    if (accountNo !== "" || accounts.length === 0) return;
    setAccountNo(accounts[0].accountNo);
  }, [accountNo, accounts]);

  /* ── 카드 집합 (②) ────────────────────────────────────────────────── */
  const [cards, setCards] = useState<WorkbenchCard[]>([]);
  /*
    카드 id 발급 — 업데이터 **밖**에서 뽑아 업데이터에 넘긴다. 업데이터 안에서 뽑으면 StrictMode ·
    재처리 때 같은 카드가 다른 id 를 받아 다시 마운트될 수 있다. 쓰지 않고 버린 번호는 재사용하지
    않는다(유일성만 보장한다).
  */
  const cardSeq = useRef(0);
  const nextCardId = useCallback(() => {
    cardSeq.current += 1;
    return `wb-card-${cardSeq.current}`;
  }, []);

  /** 펼친 뒤 화면에 들여올 카드. 레이아웃 효과가 한 번 스크롤하고 비운다. */
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);

  /* ── ⑩ 이벤트 알림 표시 · 탭 요청 — 작업대 소유(카드 상태에 섞지 않는다) ── */
  const [alertedCardIds, setAlertedCardIds] = useState<ReadonlySet<string>>(() => new Set());
  const [tabRequest, setTabRequest] = useState<{ id: string; req: CardTabRequest } | null>(null);
  const tabSeq = useRef(0);

  /* ── ⑥ `?focus=` — 마운트 1회 소비 ───────────────────────────────── */
  const searchParams = useSearchParams();
  const pendingFocus = useRef<ReturnType<typeof parseStrategyKey> | undefined>(undefined);
  if (pendingFocus.current === undefined) {
    const raw = searchParams?.get("focus") ?? null;
    pendingFocus.current = raw === null ? null : parseStrategyKey(raw);
  }

  /* ── 등록된 전략 → 처음 보는 키만 카드로 (② · 멤버십만) ─────────── */
  const seenKeys = useRef(new Set<string>());

  /*
    ── 배치 기억 (quick-260923-lyt) ── 다른 메뉴에 갔다 와도 카드 순서·펼침·닫은 등록 카드가 그대로다.
    ★ 이 효과는 아래 「등록 전략 → 카드」 효과보다 **먼저 선언**한다 — 같은 커밋에서 `seenKeys` 를
      먼저 채워야 닫아 둔 등록 전략이 새 카드로 되살아나지 않는다. 사용자 id 를 모르면 기다린다.
    ★ 저장은 복원이 끝난 뒤부터다(`layoutRestored`) — 첫 렌더의 빈 카드 목록이 저장값을 덮으면 안 된다.
  */
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [layoutRestored, setLayoutRestored] = useState(false);
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (userId === "" || restoredFor.current === userId) return;
    restoredFor.current = userId;
    const saved = readTradingLayout(userId);
    if (saved !== null) {
      for (const k of saved.seen) seenKeys.current.add(k);
      const ids = saved.cards.map(() => nextCardId());
      setCards((prev) => restoreSavedCards(prev, saved, ids));
    }
    setLayoutRestored(true);
  }, [userId, nextCardId]);
  /*
    꺼진 등록 전략 카드 걷기 — 배치 복원 뒤 등록 목록을 확정으로 처음 알 때 **한 번**(`pruneInactiveCards`).
    걷은 키는 seen 에서도 빼 그 전략이 다시 켜지면 새 카드로 뜨게 한다.
  */
  const inactivePruned = useRef(false);
  useEffect(() => {
    if (inactivePruned.current || !layoutRestored || !knowsRegistered(limitChaserSnapSeq)) return;
    inactivePruned.current = true;
    const locks = relay.orderLocks;
    setCards((prev) => {
      const { next, dropped } = pruneInactiveCards(prev, limitChasers, locks);
      for (const k of dropped) seenKeys.current.delete(k); // 멱등 — StrictMode 이중 호출에도 같다
      return next;
    });
  }, [layoutRestored, limitChaserSnapSeq, limitChasers, relay.orderLocks]);
  useEffect(() => {
    // 꺼진 전략은 기본 카드를 만들지 않는다(2026-09-23) — seen 에도 넣지 않아 나중에 켜지면 그때 카드가 뜬다.
    const fresh = limitChasers.filter((c) => isActiveStrategy(c) && !seenKeys.current.has(c.key));
    for (const c of fresh) seenKeys.current.add(c.key);

    const f = pendingFocus.current;
    const focusHit =
      f === null || f === undefined
        ? undefined
        : limitChasers.find((c) => c.key === strategyKey(f.isin, f.accountNo, f.exchange));
    /*
      ★ 보류는 **등록 목록을 알기 전에만** 산다(WR-07 · T-18-98). 찾았으면 소비하고, 목록을 아는데도
        없으면 버린다 — 삭제된 전략·오래된 링크의 키가 남았다가 나중에 같은 키가 등록되는 순간
        사용자 조작 없이 카드가 펼쳐지고 스크롤되면 안 된다. 판정은 `knowsRegistered` 한 곳이다.
    */
    if (focusHit !== undefined || knowsRegistered(limitChaserSnapSeq)) {
      pendingFocus.current = null;
    }

    if (fresh.length === 0 && focusHit === undefined) return;
    const freshIds = fresh.map(() => nextCardId());
    const focusId = nextCardId();
    setCards((prev) => {
      let next = prev;
      fresh.forEach((c, i) => {
        /*
          ★ 전략 키 대조(WR-05) — 같은 ISIN 이라도 키가 다르면 다른 전략이라 카드를 따로 둔다(D-03).
            현재 키가 같은 카드(= 사용자가 방금 스위치를 켠 등록 전 카드의 60 에코)가 있으면 건너뛴다.
        */
        if (next.some((x) => keyOf(x) === c.key)) return;
        next = [
          ...next,
          {
            id: freshIds[i],
            isin: c.isin,
            accountNo: c.accountNo,
            exchange: c.exchange,
            open: false,
            name: c.name,
            code: c.code,
          },
        ];
      });
      if (focusHit !== undefined) next = withFocusedCard(next, focusHit, focusId);
      return next;
    });
    if (focusHit !== undefined) setScrollTarget({ key: focusHit.key });
  }, [limitChasers, limitChaserSnapSeq, nextCardId]);

  /* ── ⑥ 사이드바 포커스 요청 — 이미 이 화면 위일 때 (18-12) ───────── */
  const limitChasersRef = useRef(limitChasers);
  limitChasersRef.current = limitChasers;
  const snapSeqRef = useRef(limitChaserSnapSeq);
  snapSeqRef.current = limitChaserSnapSeq;
  useTradingFocusRequest((raw) => {
    const f = parseStrategyKey(raw);
    if (f === null) return;
    const hit = limitChasersRef.current.find(
      (c) => c.key === strategyKey(f.isin, f.accountNo, f.exchange),
    );
    if (hit === undefined) {
      // 스냅샷 전 — 마운트 때와 같은 보류 슬롯. 등록 전략이 보이는 순간 위 효과가 펼친다.
      // 스냅샷 후 — 등록되지 않은 키다. 보류하지 않고 버린다(WR-07 · T-18-98).
      pendingFocus.current = knowsRegistered(snapSeqRef.current) ? null : f;
      return;
    }
    const newId = nextCardId();
    setCards((prev) => withFocusedCard(prev, hit, newId));
    setScrollTarget({ key: hit.key });
  });

  /* ── 펼치고 스크롤 ────────────────────────────────────────────────── */
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  // 대상은 이번 렌더의 카드 집합으로 푼다 — 업데이터가 고른 카드와 어긋나지 않는다.
  useLayoutEffect(() => {
    if (scrollTarget === null) return;
    const hit =
      "key" in scrollTarget
        ? cards.find((c) => keyOf(c) === scrollTarget.key)
        : isinFocusCardOf(cards, scrollTarget.isin);
    const el =
      hit === undefined
        ? null
        : document.getElementById(toggleIdOf(hit.id))?.closest('[data-slot="strategy-card"]');
    const reveal = scrollTarget.reveal === true;
    el?.scrollIntoView?.({ block: reveal ? "start" : "nearest" });
    // 요소 참조가 아니라 id 로 찾는다 — 재마운트 뒤에도 같은 id 다(card-header ③ 과 같은 이유).
    if (reveal && hit !== undefined) {
      document.getElementById(toggleIdOf(hit.id))?.focus({ preventScroll: true });
    }
    setScrollTarget(null);
  }, [scrollTarget, cards]);

  /** 그 ISIN 의 카드 하나(`isinFocusCardOf`)를 펼친다(D-07 · D-08 — 종목 단위). */
  const focusCard = useCallback((isin: string) => {
    setCards((prev) => {
      const first = isinFocusCardOf(prev, isin);
      return first === undefined ? prev : withCardOpen(prev, first.id, true);
    });
    setScrollTarget({ isin });
  }, []);

  /**
   * 그 ISIN 의 카드 보장 — 카드가 있으면 그 카드(`isinFocusCardOf`)를 펼칠 뿐 새 카드를 만들지 않고,
   * 없으면 상태줄 계좌 · KRX 로 붙인다(D-07). `reveal` 은 공용 패널 잔고 행 경로(quick-260925-ptw).
   */
  const ensureIsinCard = useCallback(
    (isin: string, name: string | undefined, code: string | undefined, reveal: boolean) => {
      const newId = nextCardId();
      setCards((prev) => {
        const first = isinFocusCardOf(prev, isin);
        return first !== undefined
          ? withCardOpen(prev, first.id, true)
          : [...prev, { id: newId, isin, accountNo, exchange: "KRX", open: true, name, code }];
      });
      setScrollTarget({ isin, reveal });
    },
    [accountNo, nextCardId],
  );
  /** 사용자 트리거 추가(돌파 스트립 · 종목 추가) — 동작 불변(nearest 스크롤 · 포커스 이동 없음). */
  const addCard = useCallback(
    (isin: string, name?: string, code?: string) => ensureIsinCard(isin, name, code, false),
    [ensureIsinCard],
  );
  /** 공용 패널 잔고 행 → 그 종목 카드 보장 + 머리 위로 스크롤 + 헤더 토글 포커스(송신 0). */
  const pickHolding = useCallback(
    (row: RelayHolding) => ensureIsinCard(row.isin, row.name, row.code, true),
    [ensureIsinCard],
  );

  /* ── ⑥-b `?code=` — 종목상세 「트레이딩」 착지 (D-30 · G-21-R3-9) ───── */
  const landingCode = searchParams?.get("code") ?? null;
  const handledCodeRef = useRef<string | null>(null);
  /* 계좌가 늦게 와도 fetch 를 끊지 않게 최신 콜백은 ref 로 읽는다(의존성에 넣으면 재실행 = abort). */
  const ensureIsinCardRef = useRef(ensureIsinCard);
  ensureIsinCardRef.current = ensureIsinCard;
  useEffect(() => {
    if (landingCode === null || !layoutRestored || handledCodeRef.current === landingCode) return;
    handledCodeRef.current = landingCode;
    /* `code` 만 지운다 — `focus` 등 다른 파라미터는 남긴다. */
    const clearCodeParam = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("code")) return;
      params.delete("code");
      const qs = params.toString();
      window.history.replaceState(null, "", qs === "" ? "/trading" : `/trading?${qs}`);
    };
    if (!/^[0-9A-Z]{6}$/.test(landingCode)) {
      console.warn("[gh-radar] ?code= 형식 아님 — 무시");
      clearCodeParam();
      return;
    }
    const controller = new AbortController();
    let settled = false;
    fetchStockDetail(landingCode, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (isPickable(detail)) {
          const ensureIsinCard = ensureIsinCardRef.current;
          ensureIsinCard(detail.isin, detail.name, detail.code, true);
        } else {
          console.warn("[gh-radar] ?code= 매매 불가 종목 — 카드 없음", landingCode);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[gh-radar] ?code= 종목 조회 실패 — 카드 없음", landingCode, err);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        settled = true;
        clearCodeParam();
      });
    return () => {
      if (settled) return;
      controller.abort();
      /* 끝나기 전에 끊겼다(StrictMode 재실행 · 이탈) — 같은 코드를 다시 처리할 수 있게 비운다. */
      if (handledCodeRef.current === landingCode) handledCodeRef.current = null;
    };
  }, [landingCode, layoutRestored]);

  const toggleCard = useCallback((id: string) => {
    setCards((prev) => {
      const cur = prev.find((c) => c.id === id);
      return cur === undefined ? prev : withCardOpen(prev, id, !cur.open);
    });
    // ⑩ 헤더 토글은 그 카드의 알림 표시를 지운다(목업 ③A 「카드를 누르면 지워진다」).
    setAlertedCardIds((prev) => withoutId(prev, id));
  }, []);

  /* ── 더티 합산 · 이탈 경고 (⑦) ────────────────────────────────────── */
  const [cardDirty, setCardDirty] = useState<Readonly<Record<string, number>>>({});
  /* 최신 값을 ref 로(안정 `changeExchange`) — `registeredRef` 와 같은 패턴. */
  const cardDirtyRef = useRef(cardDirty);
  cardDirtyRef.current = cardDirty;
  const [viDirty, setViDirty] = useState(0);
  const reportDirty = useCallback((id: string, count: number) => {
    setCardDirty((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
  }, []);
  const cardDirtySum = cards.reduce((sum, c) => sum + (cardDirty[c.id] ?? 0), 0);
  /** 더티가 있는 카드 수 = 떠 있는 더티 바 수 — 공용 패널이 수가 바뀔 때마다 비킴을 다시 잰다. */
  const dirtyCardCount = cards.reduce((n, c) => n + ((cardDirty[c.id] ?? 0) > 0 ? 1 : 0), 0);
  useLeaveWarning(cardDirtySum + viDirty > 0);

  /*
    거래소 토글(등록 여부 무관 · quick-260923-pgv · 설계 항목 1~3) — 전략 이동이 아니라 이 카드가 보는
    키의 거래소 축 전환이다. ① 바꾼 뒤의 키를 **다른 카드가 이미 쓰면** 이 카드는 그대로 두고 그 카드를
    펼쳐 스크롤한다(T-18-94 — 두 카드 한 키 금지: 한 서버 전략을 두 카드 훅이 소유하면 에코 상관·더티
    판정이 갈라진다). 충돌이 먼저다: 이 카드 값이 사라지지 않으니 물을 것이 없다. ② 미전송 더티 값이
    있으면 확인 뒤(폼 remount 로 값이 사라진다). ③ 더티 0 이면 즉시. relay 로는 아무것도 보내지 않는다.
  */
  const [exchangeAsk, setExchangeAsk] = useState<{ id: string; exchange: RelayExchange } | null>(null);
  const applyExchange = useCallback((id: string, exchange: RelayExchange) => {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id);
      if (card === undefined) return prev;
      const nextKey = strategyKey(card.isin, card.accountNo, exchange);
      return prev.some((c) => c.id !== id && keyOf(c) === nextKey)
        ? prev
        : prev.map((c) => (c.id === id ? { ...c, exchange } : c));
    });
  }, []);
  const changeExchange = useCallback(
    (id: string, exchange: RelayExchange) => {
      const cur = cardsRef.current;
      const card = cur.find((c) => c.id === id);
      if (card === undefined || card.exchange === exchange) return;
      const nextKey = strategyKey(card.isin, card.accountNo, exchange);
      const clash = cur.find((c) => c.id !== id && keyOf(c) === nextKey);
      if (clash !== undefined) {
        setCards((prev) => withCardOpen(prev, clash.id, true));
        setScrollTarget({ key: nextKey });
        return;
      }
      if ((cardDirtyRef.current[id] ?? 0) > 0) {
        setExchangeAsk({ id, exchange });
        return;
      }
      applyExchange(id, exchange);
    },
    [applyExchange],
  );

  /*
    돌파 행 → 카드 (quick-260926-s5v · gh-trade cfo). 거래소를 아는 유일한 사용자 트리거 경로다.
    gh-trade `RateCrossListForm.cs:532` `OpenLimitChaserForm(code, null, row.CrossExchange)` 와 결과가 같다.
    R1 요청 거래소 — 종목의 NXT 선택 가능 여부(`exchangeChoicesOf` — 카드 헤더·종목상세와 같은 판정)로
       거른다. 선택지에 없으면 요청 없음(null): gh-trade `ApplySeededExchange` 가 비활성 라디오 요청을
       무시하는 것과 같다(`LimitChaserForm.cs:676-681`). 둘째 인자가 고정 KRX 인 이유 — 현재 카드
       거래소가 아니라 종목 자체의 NXT 거래 여부를 묻는다.
    R2 그 ISIN 카드 없음 → 요청 거래소(없으면 KRX) · 상태줄 계좌 · 펼침으로 새 카드(`FormManager.cs:141-148`).
    R3 카드 있음(`FormManager.cs:126-135` 재사용 + `SelectExchange`) → 요청 거래소 키를 이미 보는 카드가
       있으면(펼친 것 우선) 그 카드만 펼친다(요청 = 현재 거래소면 무동작 :671). 없으면 종목 단위 포커스
       카드를 펼치고 기존 `changeExchange` 로 전환한다 — 키 충돌 · 미전송 더티 확인 규칙을 새로 쓰지
       않는다(quick-260923-pgv). 판정은 클릭 시점의 `cardsRef` 다(`changeExchange` 와 같은 방식).
    서버 송신 0 — 카드 생성·전환은 클라 상태다.
  */
  const nxtTradableRef = useRef(relay.nxtTradable);
  nxtTradableRef.current = relay.nxtTradable;
  const openBreakoutCard = useCallback(
    (isin: string, exchange: RelayExchange, name?: string, code?: string) => {
      const want = exchangeChoicesOf(isin, "KRX", nxtTradableRef.current).includes(exchange)
        ? exchange
        : null;
      const cur = cardsRef.current;
      const first = isinFocusCardOf(cur, isin);
      if (first === undefined) {
        const newId = nextCardId();
        setCards((prev) => {
          // 그 사이 그 ISIN 카드가 생겼으면 펼치기만 한다(`ensureIsinCard` 와 같은 방어).
          const again = isinFocusCardOf(prev, isin);
          return again !== undefined
            ? withCardOpen(prev, again.id, true)
            : [
                ...prev,
                { id: newId, isin, accountNo, exchange: want ?? "KRX", open: true, name, code },
              ];
        });
        setScrollTarget({ isin });
        return;
      }
      const hit =
        want === null
          ? undefined
          : (cur.find((c) => c.isin === isin && c.exchange === want && c.open) ??
            cur.find((c) => c.isin === isin && c.exchange === want));
      if (hit !== undefined) {
        setCards((prev) => withCardOpen(prev, hit.id, true));
        setScrollTarget({ key: keyOf(hit) });
        return;
      }
      setCards((prev) => withCardOpen(prev, first.id, true));
      setScrollTarget({ isin });
      if (want !== null && first.exchange !== want) changeExchange(first.id, want);
    },
    [accountNo, nextCardId, changeExchange],
  );
  /** 스트립 어댑터 — 인자 순서만 맞춘다(안정 콜백). */
  const addBreakoutCard = useCallback(
    (isin: string, name: string | undefined, code: string | undefined, exchange: RelayExchange) =>
      openBreakoutCard(isin, exchange, name, code),
    [openBreakoutCard],
  );
  const focusBreakoutCard = useCallback(
    (isin: string, exchange: RelayExchange) => openBreakoutCard(isin, exchange),
    [openBreakoutCard],
  );

  /* ── 카드 제거 (⑧) ────────────────────────────────────────────────── */
  /** 카드별 합친 로그의 직전 문장 — 전략 로그 합치기의 중복 판정(아래). */
  const lastLogText = useRef(new Map<string, string>());
  /*
    ★ 정리는 `cards` 커밋에서 파생한다 — 치운 id 를 계산하지 않는다(R3-IN-03). 카드를 치우는 경로
      (✕ · 계좌 채움 · 앞으로 생길 경로)가 몇 개든 커밋된 카드 집합에 없는 id 의 더티 키 · 직전 로그
      문장을 여기 한 곳이 지운다. 카드 id 는 재사용되지 않고(`nextCardId`) 더티 합산은 `cards` 를
      순회하므로, 커밋과 이 효과 사이의 한 렌더에도 합산 · 더티 바 수 · 이탈 경고는 이미 맞다.
      바뀐 것이 없으면 상태를 그대로 돌려 재렌더를 만들지 않는다.
  */
  useEffect(() => {
    const live = new Set(cards.map((c) => c.id));
    setCardDirty((prev) => {
      const gone = Object.keys(prev).filter((id) => !live.has(id));
      if (gone.length === 0) return prev;
      const next = { ...prev };
      for (const id of gone) delete next[id];
      return next;
    });
    for (const id of [...lastLogText.current.keys()]) {
      if (!live.has(id)) lastLogText.current.delete(id);
    }
    // ⑩ 알림 표시 · 탭 요청도 같은 파생 정리 — 치운 카드의 id 가 남지 않게.
    setAlertedCardIds((prev) => {
      const gone = [...prev].filter((id) => !live.has(id));
      if (gone.length === 0) return prev;
      return new Set([...prev].filter((id) => live.has(id)));
    });
    setTabRequest((prev) => (prev === null || live.has(prev.id) ? prev : null));
  }, [cards]);
  const removeCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  /*
    계좌 도착 전에 만든 카드는 계좌가 비어 있다 — 계좌가 정해지면 그 카드들만 채운다(`fillAccountCards`).
    채운 키가 이미 다른 카드의 키면(그 사이 같은 키의 등록 전략이 들어왔다) 빈 계좌 카드를 치운다 — 두
    카드가 같은 전략 키를 가질 수 없다(② · T-18-94). ★ 사용자가 연 카드의 맥락(펼침)을 등록 카드가
    잇는다(GC-IN-05). 업데이터 한 번만 부른다 — 같은 배치의 다른 효과가 넣은 카드도 `prev` 로 본다.
    치운 카드의 정리는 위 `cards` 파생 효과가 한다(치운 id 를 계산하지 않는다 · R3-IN-03).
  */
  useEffect(() => {
    if (accountNo === "") return;
    setCards((prev) => fillAccountCards(prev, accountNo).next);
  }, [accountNo, layoutRestored]);

  /*
    배치 저장 (quick-260923-lyt) — 카드가 바뀔 때마다. `seen` 은 등록 목록을 확정으로 안 뒤(64 스냅샷)에는
    지금 등록된 키만 남긴다 — 지운 전략의 키가 쌓이지 않고, 나중에 같은 키가 다시 등록되면 새 카드로 뜬다.
  */
  useEffect(() => {
    if (!layoutRestored || userId === "") return;
    const registered = knowsRegistered(limitChaserSnapSeq)
      ? new Set(limitChasers.map((c) => c.key))
      : null;
    const seen = [...seenKeys.current].filter((k) => registered === null || registered.has(k));
    writeTradingLayout(userId, { cards, seen });
  }, [cards, layoutRestored, userId, limitChasers, limitChaserSnapSeq]);

  /** ✕ 확인 — 카드 id 와 이유(⑧). `unknown` 이 `registered` 보다 먼저다(잠금 지속을 먼저 말한다). */
  const [closeAsk, setCloseAsk] = useState<{
    id: string;
    reason: "unknown" | "registered";
    /** `unknown` 일 때 잠긴 거래소(KRX·NXT 순 · quick-260923-pgv). */
    lockedExchanges: readonly RelayExchange[];
  } | null>(null);
  const registeredKeys = useMemo(() => new Set(limitChasers.map((c) => c.key)), [limitChasers]);
  const registeredRef = useRef(registeredKeys);
  registeredRef.current = registeredKeys;
  /* ⑧ ⑨ `RelayProvider` 주문 잠금(진행 중 · 결과 모름) — 유일한 원천. 최신 값을 ref 로(안정 `closeCard`). */
  const orderLocksRef = useRef(relay.orderLocks);
  orderLocksRef.current = relay.orderLocks;

  const closeCard = useCallback(
    (id: string) => {
      const card = cardsRef.current.find((c) => c.id === id);
      if (card === undefined) return;
      const lockedExchanges = lockedExchangesOf(orderLocksRef.current, card, cardsRef.current);
      if (lockedExchanges.length > 0) {
        setCloseAsk({ id, reason: "unknown", lockedExchanges });
        return;
      }
      if (card.accountNo !== "" && registeredRef.current.has(keyOf(card))) {
        setCloseAsk({ id, reason: "registered", lockedExchanges: [] });
        return;
      }
      removeCard(id);
    },
    [removeCard],
  );

  /* ── 공용 패널 · 미체결 선택 (D-13 · D-21) ────────────────────────── */
  const account = accountNo === "" ? null : (accountStates.get(accountNo) ?? null);
  const [selected, setSelected] = useState<RelayUnfilled | null>(null);
  // 계좌를 바꾸면 선택을 푼다 — 다른 계좌의 원주문번호로 정정·취소가 나가면 안 된다.
  useEffect(() => setSelected(null), [accountNo]);
  // 선택은 **살아 있는 행**으로만 산다(체결·취소로 사라지면 해제, 잔량이 바뀌면 새 행으로).
  const liveSelected = useMemo(() => {
    if (selected === null || account === null) return null;
    return account.unf.find((u) => u.orderNo === selected.orderNo) ?? null;
  }, [selected, account]);

  /*
    ★ 선택하면 그 행을 받을 카드가 **언제나** 격자에 있고 펼쳐져 화면에 들어온다(WR-04) — 정확 일치
      카드가 없으면(카드 없는 종목 · NXT 미체결인데 카드는 KRX · 카드 계좌가 상태줄과 다름) 행의
      ISIN · 거래소와 상태줄 계좌로 카드를 붙인다. 카드 추가는 화면 상태다 — 서버에 아무것도 보내지
      않는다(D-07 과 같은 규율 · T-18-99). 정확 일치가 없을 때만 붙이므로 그 전략 키를 쓰는 카드가
      없다(키 충돌 규칙 T-18-94 와 부딪치지 않는다). 판정은 `cardForUnfilled` 한 곳이다.
  */
  const selectUnfilledWith = useCallback(
    (row: RelayUnfilled | null, reveal: boolean) => {
      setSelected(row);
      if (row === null) return;
      const newId = nextCardId();
      setCards((prev) => {
        const target = cardForUnfilled(prev, row, accountNo);
        return target.kind === "existing"
          ? withCardOpen(prev, target.id, true)
          : [...prev, { id: newId, ...target.card }];
      });
      setScrollTarget({ key: strategyKey(row.isin, accountNo, row.exchange), reveal });
    },
    [accountNo, nextCardId],
  );
  /** 카드 「미체결」 탭용 — 동작 불변(nearest 스크롤 · 포커스를 뺏지 않는다). */
  const selectUnfilled = useCallback(
    (row: RelayUnfilled | null) => selectUnfilledWith(row, false),
    [selectUnfilledWith],
  );
  /** 공용 패널용 — 선택 + 카드 머리 위로 스크롤 + 헤더 토글 포커스(quick-260925-ptw). */
  const selectUnfilledFromPanel = useCallback(
    (row: RelayUnfilled | null) => selectUnfilledWith(row, true),
    [selectUnfilledWith],
  );
  const clearSelection = useCallback(() => setSelected(null), []);

  /* ── ⑩ 이벤트 알림 ────────────────────────────────────────────────── */
  /** 새 알림(병합 제외)이 오면 그 카드에 표시 — 이벤트만으로 카드를 만들지 않는다. */
  const markAlerted = useCallback((a: TradingAlert) => {
    const hit = cardForAlert(cardsRef.current, a);
    if (hit === undefined) return;
    setAlertedCardIds((prev) => (prev.has(hit.id) ? prev : new Set(prev).add(hit.id)));
  }, []);
  const { alerts, dismiss: dismissAlert, notifyBreakouts } = useTradingAlerts({
    orders: relay.orders,
    viNotices: relay.viNotices,
    orderIndex: relay.orderIndex,
    onNew: markAlerted,
  });
  const accountStatesRef = useRef(accountStates);
  accountStatesRef.current = accountStates;
  /*
    토스트 클릭 — 그 카드를 펼치고(없으면 알림의 종목·계좌·거래소로 붙이고) 스크롤 → 탭 요청 → 표시
    해제 → 토스트 닫기. 카드 `open` 변경은 `withCardOpen` 하나를 지난다(p3k). 종목을 모르는 알림
    (색인 조인 실패 주문 「주문 {No}」)은 카드 없이 닫기만 한다. 서버 송신 0.
  */
  const openAlert = useCallback(
    (a: TradingAlert) => {
      dismissAlert(a.id);
      const isin = a.isin;
      if (isin === undefined || isin === "") return;
      const hit = cardForAlert(cardsRef.current, a);
      const card: WorkbenchCard =
        hit ?? {
          id: nextCardId(),
          isin,
          accountNo: a.accountNo ?? accountNo,
          exchange: a.exchange,
          open: true,
          name: a.name,
          code: a.code,
        };
      if (hit !== undefined) {
        setCards((prev) => withCardOpen(prev, hit.id, true));
      } else {
        // `cardForAlert` 가 못 찾았다 = 그 ISIN 의 카드가 없다 → 같은 전략 키의 카드도 없다(T-18-94).
        setCards((prev) =>
          prev.some((c) => keyOf(c) === keyOf(card)) ? prev : [...prev, card],
        );
      }
      setScrollTarget({ key: keyOf(card) });
      const hasHolding = (accountStatesRef.current.get(card.accountNo)?.hold ?? []).some(
        (h) => h.isin === isin,
      );
      tabSeq.current += 1;
      setTabRequest({
        id: card.id,
        req: { tab: alertTabFor(a, { hasHolding, cardIsNew: hit === undefined }), seq: tabSeq.current },
      });
      setAlertedCardIds((prev) => withoutId(prev, card.id));
    },
    [accountNo, nextCardId, dismissAlert],
  );

  // 잔고 평가 가격 — 카드 순서와 무관한 고정 축(KRX 우선 · NXT 폴백 · GC-IN-04).
  const priceOf = useCallback((isin: string) => holdingQuotePrice(quotes, isin), [quotes]);

  /* ── 전략 로그 합치기 (공용 패널 「전략 로그」) ───────────────────── */
  const [mergedLog, setMergedLog] = useState<StrategyLogEntry[]>([]);
  const seenLog = useRef(new WeakSet<StrategyLogEntry>());
  const logSeq = useRef(0);
  const reportLog = useCallback(
    (id: string, log: readonly StrategyLogEntry[]) => {
      const fresh = log.filter((e) => !seenLog.current.has(e));
      if (fresh.length === 0) return;
      for (const e of fresh) seenLog.current.add(e);
      const card = cardsRef.current.find((c) => c.id === id);
      // NXT 전략 줄은 「{종목명} · NXT」 — 같은 종목 KRX·NXT 두 카드의 줄을 가른다(GC-IN-04 · D-03).
      const who =
        card === undefined
          ? id
          : exchangeLabeledName(
              card.name ?? labelsRef.current.get(card.isin)?.name ?? card.isin,
              card.exchange,
            );
      /*
        ★ 같은 카드의 **직전 줄과 같은 문장**은 합친 목록에 두 번 쌓지 않는다 — 재접속 스냅샷이 같은
          문장(「전략이 등록됐어요 · …」)을 다시 쓰는 경우의 방어다(18-20 이후 카드는 접기/펴기로 다시
          마운트되지 않는다). 판정 축은 카드 id 다 — 같은 종목 카드 둘(WR-05)의 줄이 서로를 지우지
          않는다. 판정은 업데이터 밖에서 한다(업데이터는 순수하게).
      */
      const add: StrategyLogEntry[] = [];
      // `log` 는 최신이 index 0 — 오래된 것부터 쌓아 최신이 맨 위에 오게 한다.
      for (let i = fresh.length - 1; i >= 0; i -= 1) {
        const e = fresh[i];
        if (lastLogText.current.get(id) === e.text) continue;
        lastLogText.current.set(id, e.text);
        logSeq.current += 1;
        add.unshift({ ...e, id: `wb-log-${logSeq.current}`, who });
      }
      if (add.length === 0) return;
      setMergedLog((prev) => [...add, ...prev].slice(0, MAX_MERGED_LOG));
    },
    [],
  );

  /* ── 종목정보 팝업 (⑦) ────────────────────────────────────────────── */
  const [info, setInfo] = useState<{ code: string | null; name: string } | null>(null);
  const openInfo = useCallback(
    (id: string) => {
      const card = cardsRef.current.find((c) => c.id === id);
      if (card === undefined) return;
      const label = labelsRef.current.get(card.isin);
      setInfo({
        code: card.code ?? label?.code ?? null,
        name: card.name ?? label?.name ?? card.isin,
      });
    },
    [],
  );

  /* ── 상태줄 입력 ──────────────────────────────────────────────────── */
  const [cols, setCols] = useState<TradingCols>(1);
  // 저장값은 마운트 후에 읽는다 — SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다.
  useEffect(() => setCols(readColsPref()), []);

  // VI 몫 서버 거부 — VI 패널 스트립 줄 바로 아래(접혀도 보인다 · 18-13 · T-16-07).
  const viServerError = useViServerError(messages);

  const appliedAt = useAppliedAt({ limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow });

  /* ── ⑤ `wb` 폭 → 폰 밴드 ─────────────────────────────────────────── */
  const rootRef = useRef<HTMLDivElement>(null);
  const [phoneBand, setPhoneBand] = useState<boolean | null>(null);
  const [singleColumnOnly, setSingleColumnOnly] = useState<boolean | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined || width === 0) return;
      setPhoneBand(width < WB_PHONE_BAND_BELOW);
      setSingleColumnOnly(width < WB_SINGLE_COLUMN_BELOW);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 파생 ─────────────────────────────────────────────────────────── */
  const cardIsins = useMemo(() => new Set(cards.map((c) => c.isin)), [cards]);
  // 카드가 스스로 구독한 (ISIN, 거래소) 피드 — 돌파 훅 구독 예산에서만 뺀다(quick-260926-rcc).
  const cardFeeds = useMemo(() => new Set(cards.map((c) => breakoutFeedKey(c))), [cards]);
  /*
    VI 발동 칩·표에는 **해제되지 않은** 발동만 싣는다 (사용자 결정 2026-09-23 · quick-260923-nvr).
    해제 판정은 서버의 `viReleased` 하나다 — `viEndTime` 으로 추정하지 않는다(임의종료·연장).
    「미확인 n」 필도 이 목록으로 센다. VI 설정 「중지」 확인 요약(오늘 주문)은 전체 `viOrders` 그대로다.
  */
  const activeViOrders = useMemo(() => viOrders.filter((o) => o.viReleased !== true), [viOrders]);
  const accountName = accounts.find((a) => a.accountNo === accountNo)?.name;
  const closeCardInfo = closeAsk === null ? null : cards.find((c) => c.id === closeAsk.id) ?? null;
  /*
    다이얼로그 문구 — 닫히는 애니메이션 동안(`closeAsk` 가 이미 null) 다른 이유의 문구로 뒤집히지
    않게 마지막으로 연 값을 붙든다. 결과 모름 다이얼로그에 등록 전략 문장을 붙일지(R3 목업 ② 2-b)도
    같이 든다.
  */
  const closeCopyRef = useRef<{
    reason: "unknown" | "registered";
    alsoRegistered: boolean;
    lockedExchanges: readonly RelayExchange[];
  }>({
    reason: "registered",
    alsoRegistered: false,
    lockedExchanges: [],
  });
  if (closeAsk !== null && closeCardInfo !== null) {
    closeCopyRef.current = {
      reason: closeAsk.reason,
      alsoRegistered:
        closeCardInfo.accountNo !== "" && registeredKeys.has(keyOf(closeCardInfo)),
      lockedExchanges: closeAsk.lockedExchanges,
    };
  }
  const {
    reason: closeReason,
    alsoRegistered: closeAlsoRegistered,
    lockedExchanges: closeLockedExchanges,
  } = closeCopyRef.current;

  /*
    거래소 전환 확인 다이얼로그(quick-260923-pgv) — ✕ 다이얼로그와 같은 문법. 닫히는 애니메이션 동안
    (`exchangeAsk` 가 이미 null) 문구가 비지 않게 마지막으로 연 값을 붙든다.
  */
  const exchangeAskCard =
    exchangeAsk === null ? null : cards.find((c) => c.id === exchangeAsk.id) ?? null;
  const exchangeCopyRef = useRef<{
    name: string;
    count: number;
    from: RelayExchange;
    to: RelayExchange;
  }>({ name: "", count: 0, from: "KRX", to: "NXT" });
  if (exchangeAsk !== null && exchangeAskCard !== null) {
    const label = exchangeAskCard.name ?? labels.get(exchangeAskCard.isin)?.name ?? "";
    exchangeCopyRef.current = {
      name: label === "" ? exchangeAskCard.isin : label,
      count: cardDirty[exchangeAskCard.id] ?? 0,
      from: exchangeAskCard.exchange,
      to: exchangeAsk.exchange,
    };
  }
  const exchangeCopy = exchangeCopyRef.current;

  return (
    <div
      ref={rootRef}
      data-slot="trading-workbench"
      className="@container/wb flex min-w-0 flex-col gap-3"
    >
      {/*
        1 · 머리줄 — 제목 · 계좌 · 상태줄(폭이 모자라면 상태줄이 다음 줄, quick-260925-ptw)
        ★ 줄바꿈은 새 폭 숫자·뷰포트 브레이크포인트·컨테이너 쿼리가 아니라 **내용 폭**이 정한다:
          상태줄 basis auto(= 내용 max-content)가 남는 폭보다 크면 flex-wrap 이 통째로 다음 줄로
          내리고, 들어가면 남는 폭을 채운다(상태줄 안 `ml-auto` 우측 묶음은 그대로 오른쪽 끝).
          gap 12 = 루트 `gap-3` 과 같아 줄바꿈된 모양이 종전 두 줄 배치와 같다.
      */}
      <div data-slot="workbench-head" className="flex min-w-0 flex-wrap items-center gap-3">
        <div
          data-slot="workbench-title"
          className="flex max-w-full min-w-0 flex-wrap items-center gap-2.5"
        >
          <h1 className="m-0 text-[length:var(--t-h3)] leading-[var(--lh-tight)] font-bold text-[var(--fg)]">
            트레이딩
          </h1>
          <AccountPill accounts={accounts} accountNo={accountNo} onChange={setAccountNo} />
        </div>

        <WorkbenchStatusBar
          className="flex-[1_1_auto]"
          status={status}
          statusLabel={statusLabel}
          queuedWindow={queuedWindow}
          appliedAt={appliedAt}
          cols={cols}
          onColsChange={setCols}
          phoneBand={singleColumnOnly}
          onReconnect={UNRECOVERABLE_STATES.has(status) ? reconnect : undefined}
        />
      </div>

      {/* 3 · VI 패널 — 스트립 줄 · 경보 · 펼침 안 VI 설정 2줄 · 발동 표 */}
      <ViTriggerStrip
        items={activeViOrders}
        disabled={status !== "ready"}
        settings={
          <ViSettingsRows
            viTriggers={viTriggers}
            accountNo={accountNo}
            accountName={accountName}
            disabled={status !== "ready"}
            viOrders={viOrders}
            onDirtyCountChange={setViDirty}
          />
        }
        alert={<ViServerErrorLine error={viServerError} className="px-2.5 pb-2" />}
      />

      {/* 4 · 돌파 스트립 / 표 */}
      <BreakoutStrip
        items={rateCrossItems}
        snapSeq={rateCrossSnapSeq}
        cards={cardIsins}
        cardFeeds={cardFeeds}
        onAddCard={addBreakoutCard}
        onFocusCard={focusBreakoutCard}
        onRowsAdded={notifyBreakouts}
      />

      {/* 5 · 종목 추가 */}
      <StockAddBar cards={cardIsins} onAdd={addCard} onFocusCard={focusCard} />

      {/* 6 · 카드 격자 */}
      <CardGrid
        cards={cards}
        cols={cols}
        fallbackFocusSelector={ADD_SEARCH_SELECTOR}
        renderCard={(c) => (
          <WorkbenchCardItem
            card={c}
            name={c.name ?? labels.get(c.isin)?.name ?? ""}
            code={c.code ?? labels.get(c.isin)?.code ?? null}
            status={status}
            queuedWindow={queuedWindow}
            selectedUnfilled={
              liveSelected !== null &&
              liveSelected.isin === c.isin &&
              liveSelected.exchange === c.exchange &&
              c.accountNo === accountNo
                ? liveSelected
                : null
            }
            onClearSelection={clearSelection}
            onToggle={toggleCard}
            onClose={closeCard}
            onExchangeChange={changeExchange}
            onInfo={openInfo}
            onDirtyCountChange={reportDirty}
            onLogChange={reportLog}
            /*
              카드 탭 행 선택 — `selectedUnfilled` 를 내리는 조건과 같은 술어(카드 계좌 = 상태줄 계좌).
              다르면 폼도 선택을 못 받으므로 선택 UI 도 없다(취소는 카드 계좌로 여전히 된다 · T-onn-04).
            */
            onSelectUnfilled={c.accountNo === accountNo ? selectUnfilled : undefined}
            priceOf={priceOf}
            alerted={alertedCardIds.has(c.id)}
            requestedTab={tabRequest !== null && tabRequest.id === c.id ? tabRequest.req : undefined}
          />
        )}
      />

      {/* 7 · 공용 패널 */}
      <SharedPanels
        accountNo={accountNo}
        account={account}
        status={status}
        logEntries={mergedLog}
        selectedOrderNo={liveSelected?.orderNo ?? null}
        onSelectUnfilled={selectUnfilledFromPanel}
        onPickHolding={pickHolding}
        // 더티 바가 카드 하단으로 옮겨(2026-09-23 · 목업 B) 공용 패널이 화면 하단 바를 비켜 설 일이 없다.
        dirtyBarCount={0}
        priceOf={priceOf}
        phoneBand={phoneBand}
      />

      {/* 8 · 이벤트 알림 토스트(⑩) — 뷰포트 오버레이지만 이 작업대 루트 안에만 산다 */}
      <AlertToasts alerts={alerts} onOpen={openAlert} onDismiss={dismissAlert} />

      <StockInfoModal
        code={info?.code ?? null}
        name={info?.name ?? ""}
        open={info !== null}
        onOpenChange={(open) => {
          if (!open) setInfo(null);
        }}
      />

      <Dialog
        open={closeCardInfo !== null}
        onOpenChange={(open) => {
          if (!open) setCloseAsk(null);
        }}
      >
        <DialogContent
          data-testid="workbench-close-confirm"
          data-reason={closeReason}
          data-locked-exchanges={closeReason === "unknown" ? closeLockedExchanges.join(" ") : undefined}
          onCloseAutoFocus={(e) => {
            // 카드를 닫았으면 ✕ 버튼이 사라졌다 — 포커스는 격자가 다음 카드 헤더로 옮긴다.
            if (closeCardInfo !== null && !cards.some((c) => c.id === closeCardInfo.id)) {
              e.preventDefault();
            }
          }}
        >
          {closeReason === "unknown" ? (
            <DialogHeader>
              <DialogTitle>{CLOSE_UNKNOWN_TITLE}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-col gap-1.5">
                  <p className="m-0 font-semibold" data-slot="close-locked-exchanges">
                    {closeLockedExchangesLine(closeLockedExchanges)}
                  </p>
                  <p className="m-0">{CLOSE_UNKNOWN_BODY}</p>
                  {closeAlsoRegistered && <p className="m-0">{CLOSE_REGISTERED_BODY}</p>}
                </div>
              </DialogDescription>
            </DialogHeader>
          ) : (
            <DialogHeader>
              <DialogTitle>{CLOSE_REGISTERED_TITLE}</DialogTitle>
              <DialogDescription>{CLOSE_REGISTERED_BODY}</DialogDescription>
            </DialogHeader>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseAsk(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (closeCardInfo !== null) removeCard(closeCardInfo.id);
                setCloseAsk(null);
              }}
            >
              카드 닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={exchangeAskCard !== null}
        onOpenChange={(open) => {
          if (!open) setExchangeAsk(null);
        }}
      >
        <DialogContent data-testid="workbench-exchange-confirm">
          <DialogHeader>
            <DialogTitle>{EXCHANGE_SWITCH_TITLE}</DialogTitle>
            <DialogDescription>
              {exchangeSwitchBody(exchangeCopy.name, exchangeCopy.count, exchangeCopy.from, exchangeCopy.to)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExchangeAsk(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (exchangeAsk !== null && exchangeAskCard !== null) {
                  applyExchange(exchangeAskCard.id, exchangeAsk.exchange);
                }
                setExchangeAsk(null);
              }}
            >
              바꾸기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 「반영 {HH:MM:SS}」 — 작업대가 서버 push(64/60 전략 · 76/78 돌파 · 72/73 VI 주문 · 61 VI 설정 ·
 * 77 창)를 **받은 시각**. 마운트 시점에 이미 있던 값은 반영으로 치지 않는다(첫 push 전 = 「반영 —」).
 * 상태줄은 벽시계를 읽지 않고 이 문자열을 그대로 쓴다(D-22).
 */
function useAppliedAt(sources: {
  limitChasers: unknown;
  rateCrossItems: unknown;
  viOrders: unknown;
  viTriggers: unknown;
  queuedWindow: RelayQueuedWindowMsg | undefined;
}): string | null {
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const prev = useRef(sources);
  const { limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow } = sources;
  useEffect(() => {
    const p = prev.current;
    const changed =
      p.limitChasers !== limitChasers ||
      p.rateCrossItems !== rateCrossItems ||
      p.viOrders !== viOrders ||
      p.viTriggers !== viTriggers ||
      p.queuedWindow !== queuedWindow;
    prev.current = { limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow };
    if (changed) setAppliedAt(clockNow());
  }, [limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow]);
  return appliedAt;
}

interface WorkbenchCardItemProps {
  card: WorkbenchCard;
  name: string;
  code: string | null;
  status: RelayStatus;
  queuedWindow: RelayQueuedWindowMsg | undefined;
  selectedUnfilled: RelayUnfilled | null;
  onClearSelection: () => void;
  onToggle: (cardId: string) => void;
  onClose: (cardId: string) => void;
  onExchangeChange: (cardId: string, exchange: RelayExchange) => void;
  onInfo: (cardId: string) => void;
  onDirtyCountChange: (cardId: string, count: number) => void;
  onLogChange: (cardId: string, log: readonly StrategyLogEntry[]) => void;
  /** 카드 「미체결」 탭 행 선택 — 작업대 `selectUnfilled`(카드 계좌 = 상태줄 계좌일 때만). */
  onSelectUnfilled?: (row: RelayUnfilled | null) => void;
  /** 카드 「잔고」 탭 현재가 — 공용 패널과 같은 `priceOf`. */
  priceOf: (isin: string) => number | undefined;
  /** ⑩ 알림 표시(`data-alert`). */
  alerted: boolean;
  /** ⑩ 알림 클릭 탭 요청 — 대상 카드에만, 나머지는 `undefined`(memo 유지). */
  requestedTab?: CardTabRequest;
}

/**
 * 카드 1장 = `StrategyCard` + `CardBody` 본문(18-10). 본문 렌더 함수를 카드마다 **안정적으로** 만들어
 * `StrategyCard` 의 `memo` 가 살게 한다(④). 전략 배열·라벨 Map 은 여기에도 없다 — 문자열과 이 카드의
 * 선택 행만 온다(③ · T-18-52). 주문 잠금도 내리지 않는다 — 폼이 `RelayProvider` 에서 스스로 읽는다(⑨).
 */
const WorkbenchCardItem = memo(function WorkbenchCardItem({
  card,
  name,
  code,
  status,
  queuedWindow,
  selectedUnfilled,
  onClearSelection,
  onToggle,
  onClose,
  onExchangeChange,
  onInfo,
  onDirtyCountChange,
  onLogChange,
  onSelectUnfilled,
  priceOf,
  alerted,
  requestedTab,
}: WorkbenchCardItemProps) {
  const { id, isin, accountNo, exchange, open } = card;
  const body = useCallback(
    (state: StrategyCardState) => (
      <CardBody
        variant="card"
        card={state}
        isin={isin}
        accountNo={accountNo}
        exchange={exchange}
        name={name}
        code={code}
        status={status}
        queuedWindow={queuedWindow}
        selectedUnfilled={selectedUnfilled}
        onClearSelection={onClearSelection}
      />
    ),
    [
      isin,
      accountNo,
      exchange,
      name,
      code,
      status,
      queuedWindow,
      selectedUnfilled,
      onClearSelection,
    ],
  );

  return (
    <StrategyCard
      cardId={id}
      isin={isin}
      accountNo={accountNo}
      exchange={exchange}
      name={name}
      code={code}
      open={open}
      onToggle={onToggle}
      onClose={onClose}
      onExchangeChange={onExchangeChange}
      onInfo={onInfo}
      onDirtyCountChange={onDirtyCountChange}
      onLogChange={onLogChange}
      body={body}
      selectedOrderNo={selectedUnfilled?.orderNo ?? null}
      onSelectUnfilled={onSelectUnfilled}
      priceOf={priceOf}
      alerted={alerted}
      requestedTab={requestedTab}
    />
  );
});
