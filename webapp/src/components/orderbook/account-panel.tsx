'use client';

/**
 * AccountPanel — 계좌 패널: 미체결(취소) · 잔고 (UI-SPEC C10·C11·C7, 확정 L5 · M3 · D2 · R6).
 *
 * ① 무엇을 어디에 — **3표면 + 1이 공유하는 한 벌**이다 (D-20 / D-21)
 *   호가주문 탭(종목 축 있음) · 상따 페이지 · VI 페이지 · My page(종목 축 없음)가 전부 이
 *   컴포넌트를 쓴다. 그래서 리플로우·취소 규율을 **여기 한 번만** 구현한다 — 표면마다
 *   베끼면 한 곳만 고쳐지고 나머지는 조용히 갈린다.
 *   - 호가주문 탭: 그리드 우측 컬럼의 주문 패널 아래. 주문 → 미체결 확인 → 취소가 한 컬럼 안.
 *     ≥900px 은 `미체결`/`잔고` **탭 전환**(기본 미체결, 라벨에 건수), <900px 은 독립 2섹션
 *     세로 나열(M3, 순서 잔고 → 미체결).
 *   - **계좌 전용 모드**(종목 축 없음): 탭이 없다. 미체결 → 잔고를 그대로 나열하고
 *     ≥1280px 에서만 2열이다(R4). My page 는 이 모드로 **계좌마다 한 벌씩** 렌더한다.
 *   두 표는 항상 DOM 에 있고 **브레이크포인트 판정은 전부 CSS** 다 — JS 는 뷰포트를 재지 않는다.
 *
 * ② ★ 취소 버튼은 채우지 않는다 (UI-SPEC §토큰 충돌 경보)
 *   `--destructive` 와 `--up`(매수)의 oklch 값이 완전히 같다. 채움 빨강으로 만들면 매수
 *   버튼과 구분되지 않는다. **테두리 + `--destructive` 텍스트**가 유일한 표현이다.
 *   보이는 글자는 「취소」 한 단어뿐이다(260911-w5h — 옛 `✕` 글리프를 걷었다). 접근성
 *   이름은 계속 `주문번호 {orderNo} 취소` 다.
 *   ★ 이 버튼은 **표 행과 카드 행이 공유하는 하나**다. 규율이 갈리지 않게 두 벌로 쪼개지
 *     않는다 — 그래서 글리프 제거가 데스크톱에도 함께 걸린다.
 *
 * ③ ★ 미체결 잔량 0 행에는 취소 버튼을 렌더하지 않는다
 *   취소 수량은 언제나 **미체결 잔량 전부**이고, 잔량 0 의 취소는 게이트웨이가 즉시 거부한다
 *   (D-21). 누를 수 있지만 반드시 실패하는 버튼은 오조작을 부르는 UI 다.
 *
 * ④ ★ 취소 키는 **그 행의 ISIN** 이다 (D-02 / D-28, 2026-09-08 갱신)
 *   `AccountState.unf` 는 **계좌 전체**의 미체결이라 다른 종목 주문도 들어온다. wss 이관
 *   이후 취소는 `{t:"order.cancel"}` 이고 종목 키가 **12자 ISIN** 인데, `unf[].isin` 은
 *   언제나 실려 온다 — 그래서 **어느 종목이든 취소할 수 있다.** 단축코드(`row.code`)는
 *   relay 가 `stocks` 역매핑으로 채우는 **표시 전용** 값이고, 없다고 버튼을 잠그지 않는다
 *   (예전의 「코드 없으면 취소 불가」 서술은 폐기됐다 — 사실이 아닌 제약이었다).
 *   요청에는 반드시 **`row.isin`** 을 쓴다. 화면에 열린 종목의 값을 쓰면 다른 종목의
 *   미체결을 취소할 때 엉뚱한 종목으로 취소가 나간다 (T-16-01).
 *
 * ⑤ ★ 평가금액·평가손익·수익률은 현재가를 아는 행에서만 계산한다
 *   `HoldingState` 에는 현재가가 없다. 실시간가는 지금 구독 중인 **한 종목**만 안다
 *   (계좌 전용 모드에서는 하나도 모른다). 모르는 행에 값을 지어내면 그 숫자로 매도 판단을
 *   하게 된다 — 모르면 `—` 로 둔다.
 *   ★ 예외 하나 — **계좌 전용 모드에서 그 칸은 「평가금액」이 아니라 「매입금액」**이다
 *     (`qty × avgPrice`). 현재가를 하나도 모르는 표면이라 평가금액 칸이 전부 `—` 로 비는데,
 *     매입금액은 현재가와 무관하게 항상 알 수 있다. 값을 지어내는 것이 아니라 **칸의 의미를
 *     바꾸는 것**이라 헤더 문구와 셀 값이 `stockScoped` **같은 분기**를 읽는다 — 둘이 갈리면
 *     「평가금액」 헤더 아래 매입금액이 앉는다. 평가손익·수익률은 그대로 `—` 다(손익은
 *     현재가 없이 성립하지 않는다).
 *
 * ⑥ 취소 결과도 세 갈래다 — 접수 / **결과 모름** / 거부
 *   주문과 같은 규율이다. `sendOrder` 는 **어떤 경로에서도 reject 하지 않으므로**(16-10)
 *   이 파일에 취소 실패용 `catch` 가 없다. 결과를 모르면 "실패"라고 쓰지 않고 그 주문번호의
 *   취소 버튼을 다시 열지 않는다(같은 취소를 두 번 보내 봐야 두 번째는 거부되지만, 그때
 *   사용자가 보는 "거부"가 첫 취소의 성패를 오해하게 만든다).
 *
 * ⑦ 계좌번호는 **전체 표시**한다 (D2 / S-5). 마스킹은 relay 로그에서만 한다.
 *   계좌 전용 모드에는 계좌 `<select>` 가 없다 — 세로 반복(계좌마다 한 벌)이 계좌 구분이고,
 *   패널 안에서 계좌를 바꿀 수 있으면 "지금 보는 카드"와 "선택된 계좌"가 어긋난다.
 *
 * ⑧ ★ 모바일은 표가 아니라 **카드 행**(`.rlist`)이다 (UI-SPEC C7 / R6 · 260911-w5h)
 *   미체결 표의 콘텐츠 최소폭(439px)·잔고(444px)가 모바일 가용폭(338px)을 넘는다. 표로 두면
 *   `overflow` 아래에서 가로 스크롤이 생기거나 **조용히 잘린다**. 그래서 <1280px 에서는 표를
 *   숨기고 카드 행을 그린다(≥1280 은 반대).
 *
 *   ★ **한 문법**을 쓴다 — 이름 왼쪽 굵게(14px) / 핵심 숫자 오른쪽 굵게(14px mono) /
 *     둘째 줄부터 muted 보조(11px). 잔고·미체결·전략 현황 세 목록이 한 화면에 세로로
 *     이어지므로, 문법이 서로 다르면 사용자의 눈이 목록마다 다시 적응해야 한다.
 *     미체결은 r1(이름+구분 / 주문가) · r2(미체결 수량 / 취소) 2줄,
 *     잔고는 r1(이름 / 매입금액) · r2(수량·매도가능 / 평단) · r3(현재 / 평가·손익·손익률,
 *     **현재가를 아는 행에만**) 이다.
 *
 *   ★ 카드 행의 **각 줄은 신축 1개(왼쪽) + 나머지 `flex-none`** 이다. r1 의 신축은 반드시
 *     종목명이고, 신축에는 `min-w-0 truncate` 가 함께 간다. 우측 항목은 `ml-auto flex-none`
 *     으로 붙인다. 이게 어긋나면 긴 종목명이 숫자를 밀어내 잘린다 — 플렉스/그리드 자식의
 *     `min-w-0` 누락은 `tasks/lessons.md` 에 등재된 함정이다. r2/r3 의 왼쪽 보조 문장도
 *     길어질 수 있으므로 그 줄의 신축 역시 **왼쪽 하나**다.
 *
 * ⑨ ★ 서버가 이미 취소를 보낸 행은 **회색 + 취소 버튼 없음**이다 (D-14 / 17-09)
 *   `RelayUnfilled.pendingCancelSent` 는 서버 원장이 `'X'` 로 표시한 행, 즉 **취소가 이미
 *   나간** 주문이다. 버튼을 남겨 두면 사용자가 그것을 눌러 게이트웨이의 거부(`R`)를 받고
 *   **첫 취소의 성패를 오해한다**(⑥ 과 같은 함정의 다른 입구).
 *   ★ 판정 근거는 그 **bool 하나**다. `pendingStatus`/`queuedStatus` 문구를 비교해 회색이나
 *     숨김을 정하지 않는다 — 문구는 서버가 바꾼다(gh-trade 교훈 24 · Pitfall 6). 문구는
 *     **표시만** 한다.
 *   ★ 버튼이 그냥 사라지면 버그로 읽힌다. 그래서 서버 문구를 그 행의 보조 줄에 그대로 남겨
 *     왜 취소할 수 없는지가 보이게 한다.
 *   ★ 이 규칙은 **개별 취소와 전체 취소 두 경로가 함께** 쓴다. 한쪽만 고치면 개별은 막히는데
 *     일괄 경로로 두 번째 취소가 나간다 (옛 VI 화면의 「전체 취소」 `cancellable` 이 짝이었다 — 18-13 에서 화면과 함께 삭제).
 *
 * ⑩ ★ 미체결 행 선택 = 정정/취소의 **유일한 진입** (18-09 / D-21)
 *   `onSelectUnfilled` 를 넘긴 표면(작업대 공용 패널)에서만 행이 선택 대상이 된다. 넘기지
 *   않으면 **DOM 이 한 글자도 다르지 않다** — 기존 호출부(호가 탭 · VI · My page)는 무수정.
 *   - 시맨틱은 `<tr aria-selected>` 가 아니라 **첫 셀의 `<button aria-pressed>`** 다. 행
 *     자체에 `role="button"` 을 주면 그 안의 취소 버튼이 「버튼 안의 버튼」(nested-interactive)
 *     이 된다. 행 `onClick` 은 마우스 편의이고, 키보드 Enter/Space 는 그 버튼의 네이티브
 *     click 이 행으로 버블해 **같은 한 경로**를 탄다(호출 1회).
 *   - 선택 불가 판정은 수동주문 폼과 **같은 함수**(`unfilledSelectBlockReason`)다 — 주문번호
 *     없음(접수 전) · `pendingCancelSent`(취소 보관). 둘 다 **bool/빈 문자열 필드**로만 보고
 *     `pendingStatus` 문구를 읽지 않는다(⑨ 와 같은 규율).
 *   - 토글(재선택 = 해제)은 선택을 소유한 상위의 몫이다. 이 패널은 「이 행을 눌렀다」만 올린다.
 *   - 주문번호가 빈 행은 취소도 막는다 — 원주문번호 없는 취소는 반드시 거부되는 버튼이다(③).
 *
 * ⑪ ★ 탭 임베드 모드(`section`) — 작업대 공용 패널 전용 (18-09 / D-13)
 *   공용 패널은 「미체결 (N) / 잔고 (N) / 전략 로그」 탭을 **바깥에서** 소유한다. 그래서
 *   `section` 을 받으면 이 패널은 그 한 섹션만, 계좌 머리·섹션 제목 없이 그린다(계좌는
 *   상태줄이 이미 말한다). 계좌 축은 여전히 **단일 계좌**다 — 다계좌 합산은 `/me` 담당이다.
 *   - 열 구성은 UI-SPEC §공용 패널 원문이다(미체결: 종목 · 거래소 · 구분 · 주문가 ·
 *     주문/미체결 · 주문No · 취소 / 잔고: 종목 · 수량 · 매도가능 · 평단 · 현재가 · 평가손익 ·
 *     손익률). 뷰포트 표/카드 전환(⑧)을 쓰지 않고 **언제나 표**이며 좁으면 가로 스크롤이다
 *     (목업 `.tblx`) — 이 패널은 작업대 컨테이너(`wb`) 안에 놓이므로 뷰포트 분기가 맞지 않는다.
 *   - 취소 결과는 **그 행 바로 아래** 인라인 줄이다(E13 error). 행이 이미 사라졌으면(접수 후
 *     미체결에서 빠짐) 표 아래로 떨어진다.
 *   - 취소 규율(③④⑥⑨)과 선택 규율(⑩)은 **기본 모드와 같은 코드**를 쓴다 — 두 벌이 아니다.
 *   - `section` 을 넘기지 않는 기존 호출부의 DOM 은 그대로다(이 분기는 별도 return 이다).
 *   - `embedScope="stock"`(quick-260923-onn · 목업 ②A) — 종목이 이미 정해진 표면(작업대 전략
 *     카드의 「미체결」·「잔고」 탭)이라 **종목·거래소 열을 뺀다**(미체결 5열: 구분 · 주문가 ·
 *     주문/미체결 · 주문No · 취소 / 잔고 6열: 수량 · 매도가능 · 평단 · 현재가 · 평가손익 ·
 *     손익률). 선택 핸들은 첫 셀(구분)을 감싸고 출처 배지·서버 문구도 그 셀로 온다. 행을
 *     이 종목으로 자르는 것은 여전히 `account` 를 만들어 주는 호출부의 몫이다(필터 아님).
 *     `embedEmptyTitle` 은 빈 상태 제목 override 다 — 넘기면 보조 문장 없이 제목만 그린다.
 *     넘기지 않으면(`'account'`) 열·문구가 종전 그대로다.
 */

import { Fragment, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  RelayAccount,
  RelayAccountState,
  RelayHolding,
  RelayOrderResultMsg,
  RelayUnfilled,
} from '@gh-radar/shared';
import { sideDisplayText } from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Number as UiNumber } from '@/components/ui/number';
import {
  OrderConfirmDialog,
  type CancelOrderConfirmDetail,
} from '@/components/orderbook/order-confirm-dialog';
import {
  cancelQtyAtConfirm,
  unfilledSelectBlockReason,
} from '@/components/trading/card/manual-order-form';
import { ExchangeTag } from '@/components/trading/vi-order-list';
import { useRelayContext } from '@/lib/relay-provider';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

/** 선택 가능한 미체결 행의 `title` (UI-SPEC §공용 패널 · 원문). */
export const UNFILLED_ROW_SELECT_TITLE = '행을 누르면 수동주문 폼에서 정정·취소할 수 있어요';

/** 주문번호가 빈 행(접수 전)의 취소 버튼 `title`. 원주문번호 없는 취소는 반드시 거부된다. */
const CANCEL_BLOCK_NO_ORDER_NO = '접수 전(주문번호 없음)은 취소할 수 없어요';

type AccountTab = 'unfilled' | 'holdings';

/** 취소 결과 배너. 주문 패널과 같은 3분류다. */
type CancelResult =
  | { kind: 'accepted'; orderNo: string }
  | { kind: 'rejected'; title: string; detail: string }
  | { kind: 'unknown' };

/**
 * 미체결 행의 **출처 태그**(UI-SPEC C7). 값의 원천은 `dma_orders.origin` 이 아니라
 * **화면 컨텍스트**다 — 상따 페이지가 그린 목록은 상따, VI 페이지는 VI. 수동 주문 표면
 * (호가주문 탭·My page)은 태그를 붙이지 않는다.
 */
export type AccountOriginTag = '상따' | 'VI';

/** 공용 패널(⑪) 미체결 행의 출처 배지 — UI-SPEC §공용 패널 「상따」/「수동」. */
export type AccountRowOrigin = '상따' | '수동';

export interface AccountPanelProps {
  /**
   * 허용 계좌 목록. 계좌 셀렉터의 원천이다.
   * **계좌 전용 모드에서는 넘기지 않는다** — 셀렉터 자체가 없다(파일 상단 ⑦).
   */
  accounts?: RelayAccount[];
  /** 이 패널이 보여 주는 계좌번호. 계좌 전용 모드에서는 헤더에 **전체 표시**된다(D2). */
  selectedAccountNo: string;
  /**
   * 상품명(계좌 종류). **계좌 전용 모드 헤더 우측**에 붙는다 (UI-SPEC C5 — My page 계좌
   * 카드 머리 = `계좌 {전체번호}`(mono) + 우측 `{상품명}`). 종목 축이 있을 때는 셀렉터
   * 옵션이 이미 `{번호} · {이름}` 을 보여주므로 쓰이지 않는다.
   */
  accountName?: string;
  /** 계좌 셀렉터의 변경 창구. 계좌 전용 모드에서는 넘기지 않는다. */
  onAccountChange?: (accountNo: string) => void;
  /** 훅의 병합된 계좌 상태. null 이면 아직 스냅샷 전이다. */
  account: RelayAccountState | null;
  /**
   * 현재 종목 6자 단축코드 — **표시 전용**이다(취소 키가 아니다, 파일 상단 ④).
   * `undefined` 면 **계좌 전용 모드**(종목 축 없음)로 그린다.
   */
  code?: string;
  /** 현재 종목명 — 그 종목 행의 표기·확인 다이얼로그용. */
  name?: string;
  /** 현재 종목 12자 ISIN. 「이 행이 지금 보는 종목인가」 판정에만 쓴다. */
  isin?: string | null;
  /** 현재 종목 실시간가. 그 종목의 평가금액·평가손익·수익률 계산에만 쓴다. */
  currentPrice?: number;
  /** 미체결 행에 붙일 출처 태그. 없으면 태그를 그리지 않는다(= 수동). */
  originTag?: AccountOriginTag;
  /**
   * 계좌 전용 모드의 ≥1280px 배치를 **세로 스택**으로 고정한다 (16-14 · R3).
   *
   * 기본(false)은 My page 규율인 2열(477/477)이다. VI 페이지는 이 패널이 992px 전폭이
   * 아니라 **오른쪽 556px 컬럼** 안에 들어가므로, 그 안에서 2열로 쪼개지면 한 칸이
   * 270px 이 되어 표가 조용히 잘린다. 뷰포트 기준 미디어쿼리라 컨테이너 폭을 모르는
   * 패널이 스스로 판단할 수 없어 **호출부가 알려 준다.**
   */
  stack?: boolean;
  /**
   * 미체결 섹션 헤더 우측에 붙일 컨트롤 (UI-SPEC B7 — 거래소 필터 · 「전체 취소」).
   *
   * 패널이 필터·일괄취소를 **소유하지 않는다.** 필터는 어떤 행을 넘길지의 문제라
   * `account` 를 만들어 주는 호출부의 몫이고, 일괄 취소는 표면마다 확인 문구가 다르다.
   * 여기서는 **자리만** 내준다 — 넘기지 않으면 아무것도 그리지 않는다.
   */
  unfilledHeaderActions?: ReactNode;
  /** 세션 상태. `ready` 가 아니면 표를 흐리고 취소를 막는다. */
  status: RelayStatus;
  /** 취소 요청이 끝났을 때(접수·거부·결과 모름 무관) 부모에게 알린다. */
  onCancelSubmitted?: (res: RelayOrderResultMsg) => void;
  /**
   * 미체결 행 선택 창구 (18-09 / D-21 — 파일 상단 ⑩). **넘기지 않으면 선택 UI 가 없다**
   * (기존 호출부와 DOM 동일). 페이로드는 그 행 **전체**다 — 폼이 `orgOrderNo`·`side` 를
   * 그 행에서만 읽는다(T-18-43).
   */
  onSelectUnfilled?: (row: RelayUnfilled) => void;
  /** 선택된 원주문번호 — 그 행에 accent 강조 + `aria-pressed="true"`. 콜백이 없으면 무시된다. */
  selectedOrderNo?: string | null;
  /**
   * 탭 임베드 모드(⑪) — 그 한 섹션만 그린다. **계좌 전용 모드(`code` 없음)와 함께만** 쓴다.
   * 넘기지 않으면 기존 배치 그대로다.
   */
  section?: 'unfilled' | 'holdings';
  /**
   * 임베드 모드(⑪) 열 범위. `'account'`(기본) = 종전 7열. `'stock'` = 종목이 이미 정해진
   * 표면(작업대 카드 탭)이라 종목·거래소 열을 생략한다. `section` 과 함께만 쓴다.
   */
  embedScope?: 'account' | 'stock';
  /** 임베드 빈 상태 제목 override — 넘기면 보조 문장 없이 이 제목만 그린다(⑪). */
  embedEmptyTitle?: string;
  /**
   * 미체결 행의 출처 배지(「상따」/「수동」, ⑪ 임베드 모드 전용). 값의 원천은 호출부가
   * 아는 사실이다 — 모르면 `undefined` 를 돌려 배지를 그리지 않는다(지어내지 않는다).
   */
  originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined;
  /**
   * 종목별 현재가(⑪ 임베드 모드의 현재가·평가손익·손익률 칸). 모르는 종목은 `undefined` —
   * 그 행은 「—」다(⑤). 지금 보는 종목의 `currentPrice` 가 있으면 그것이 우선한다.
   */
  priceOf?: (isin: string) => number | undefined;
  className?: string;
}

/** 미체결 한 행의 표시 파생값 — **표와 카드가 같은 값을 쓰도록** 한 곳에서 만든다. */
interface UnfilledView {
  row: RelayUnfilled;
  /** 사람이 읽는 종목명. relay 가 못 풀었고 지금 보는 종목도 아니면 null(ISIN 원문 표기). */
  label: string | null;
  /**
   * 방향 라벨 + 형태 접미 (`매수Q` · `매도P` · `매수/종가`). 값은 **shared 헬퍼가 만든다**
   * (17-09 / D-13) — 이 파일에 접미 리터럴이 없는 것이 그 계약의 증거다.
   *
   * ⚠️ 표시 전용이다. 회색·취소 제외는 이 문자열을 읽지 않는다(근거는 `pendingCancelSent`).
   */
  sideText: string;
  cancellable: boolean;
  /** 취소 버튼을 그리되 **누를 수 없게** 하는 사유(주문번호 없음). `null` = 누를 수 있다. */
  cancelBlock: string | null;
  /** 행 선택 불가 사유(`unfilledSelectBlockReason`). `null` = 선택 가능. */
  selectBlock: string | null;
}

/** 잔고 한 행의 표시 파생값. 현재가를 모르면 `value`/`pnl`/`rate` 가 전부 null 이다(⑤). */
interface HoldingView {
  row: RelayHolding;
  label: string | null;
  price: number | null;
  value: number | null;
  pnl: number | null;
  rate: number | null;
  /** 매입금액(`qty × avgPrice`). 현재가와 무관하므로 **항상** 채워진다 — 계좌 전용 모드의 5번째 칸이다(⑤ 예외). */
  cost: number;
}

export function AccountPanel({
  accounts,
  selectedAccountNo,
  accountName,
  onAccountChange,
  account,
  code,
  name,
  isin,
  currentPrice,
  originTag,
  stack = false,
  unfilledHeaderActions,
  status,
  onCancelSubmitted,
  onSelectUnfilled,
  selectedOrderNo = null,
  section,
  embedScope = 'account',
  embedEmptyTitle,
  originOf,
  priceOf,
  className,
}: AccountPanelProps) {
  const [tab, setTab] = useState<AccountTab>('unfilled');
  const [cancelTarget, setCancelTarget] = useState<
    (CancelOrderConfirmDetail & { row: RelayUnfilled }) | null
  >(null);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  /** 결과 배너가 가리키는 원주문번호 — 임베드 모드(⑪)가 그 행 바로 아래에 배너를 둔다. */
  const [cancelResultOrderNo, setCancelResultOrderNo] = useState<string | null>(null);
  /** 결과를 모르는 취소가 나간 주문번호 — 다시 누를 수 없게 잠근다. */
  const [lockedOrderNos, setLockedOrderNos] = useState<ReadonlySet<string>>(new Set());
  const { sendOrder } = useRelayContext();

  /**
   * 종목 축이 있는가. `code` 유무 **하나로** 판정한다 — 판정 근거가 둘이면
   * (`code` 없고 `isin` 있음 같은) 중간 상태에서 절반만 종목 UI 가 그려진다.
   */
  const stockScoped = code !== undefined;
  const sessionReady = status === 'ready';

  const unfilled = useMemo<UnfilledView[]>(
    () =>
      (account?.unf ?? []).map((row) => {
        const sameStock = isin != null && row.isin === isin;
        return {
          row,
          label: row.name ?? (sameStock ? (name ?? null) : null),
          sideText: sideDisplayText(row.side, row.orderNo, row.pendingStatus, row.board),
          // ★ 취소 키는 ISIN 이고 언제나 실려 온다 — 단축코드 유무로 잠그지 않는다(④).
          // ★ 서버가 **이미 취소를 보낸** 행은 뺀다(⑨) — 근거는 그 bool 하나다.
          cancellable:
            row.unfilledQty > 0 && !row.pendingCancelSent && !lockedOrderNos.has(row.orderNo),
          cancelBlock: row.orderNo === '' ? CANCEL_BLOCK_NO_ORDER_NO : null,
          selectBlock: unfilledSelectBlockReason(row),
        };
      }),
    [account, isin, name, lockedOrderNos],
  );

  const holdings = useMemo<HoldingView[]>(
    () =>
      (account?.hold ?? []).map((row) => {
        const sameStock = isin != null && row.isin === isin;
        const price =
          sameStock && currentPrice != null ? currentPrice : (priceOf?.(row.isin) ?? null);
        const priced = price != null && price > 0 && row.avgPrice > 0;
        return {
          row,
          label: row.name ?? (sameStock ? (name ?? null) : null),
          price,
          value: priced ? price * row.qty : null,
          pnl: priced ? (price - row.avgPrice) * row.qty : null,
          rate: priced ? (price - row.avgPrice) / row.avgPrice : null,
          cost: row.qty * row.avgPrice,
        };
      }),
    [account, isin, name, currentPrice, priceOf],
  );

  /**
   * 취소 확정. 수량은 **지금 렌더의 같은 주문번호 행**(`account` — 병합된 현재 상태)으로 다시
   * 정한다(`cancelQtyAtConfirm`, GC-WR-02): 다이얼로그가 열린 사이 부분체결로 잔량이 줄었으면
   * 그 잔량으로 **내리고**, 늘었거나 행이 사라졌으면 확인한 수량 그대로 보낸다 — 막지 않는다.
   * 그래서 다이얼로그에 보였던 수량과 실제로 나간 수량이 다를 수 있다(작아지는 쪽으로만).
   * 새 화면 문구는 만들지 않는다 — 의미(「잔량 전부」)가 사용자가 확인한 뜻과 같기 때문이다.
   */
  const handleCancelConfirmed = useCallback(async () => {
    if (!cancelTarget) return;
    const row = cancelTarget.row;
    const live = account?.unf.find((r) => r.orderNo === row.orderNo) ?? null;
    const qty = cancelQtyAtConfirm(row.unfilledQty, row.orderNo, live);
    setCancelTarget(null);
    setCancelResult(null);
    setCancelResultOrderNo(row.orderNo);

    /*
      `catch` 가 없는 것이 의도다 — `sendOrder` 는 실패도 결과 프레임으로 돌려준다(16-10).
      catch 를 두면 그 분기가 「실패」 문구를 쓰게 되고, 결과를 모르는 취소에 「실패」를
      쓰면 사용자가 다시 취소를 눌러 첫 취소의 성패를 오해한다(S-8).
    */
    const res = await sendOrder({
      kind: 'cancel',
      // ★ 그 **행의** ISIN 이다. 화면에 열려 있는 종목을 쓰면 다른 종목의 미체결을
      //   취소할 때 엉뚱한 종목으로 취소가 나간다(T-16-01).
      isin: row.isin,
      accountNo: selectedAccountNo,
      exchange: row.exchange,
      orgOrderNo: row.orderNo,
      // 취소 수량은 **미체결 잔량 전부**다 (D-21). 부분 취소 경로는 만들지 않는다.
      // 확정 순간의 잔량으로 내린 값이다(위 JSDoc · GC-WR-02).
      qty,
      price: row.price,
    });

    if (res.status === 'timeout') {
      setCancelResult({ kind: 'unknown' });
      setLockedOrderNos((prev) => new Set(prev).add(row.orderNo));
    } else if (res.status === 'rejected' || res.resultCode !== 0) {
      setCancelResult({
        kind: 'rejected',
        title: `주문 취소가 거부됐어요 · ${res.message}`,
        detail: `미체결 목록을 다시 확인해 주세요. (코드 ${res.resultCode})`,
      });
    } else {
      setCancelResult({ kind: 'accepted', orderNo: res.orderNo || row.orderNo });
    }
    onCancelSubmitted?.(res);
  }, [cancelTarget, account, sendOrder, selectedAccountNo, onCancelSubmitted]);

  const openCancel = useCallback((row: RelayUnfilled, displayName: string) => {
    setCancelTarget({
      mode: 'cancel',
      orderNo: row.orderNo,
      side: row.side,
      // 확인 다이얼로그에는 **그 행의** 종목명이 떠야 한다. 현재 종목명을 고정으로
      // 쓰면 다른 종목을 취소하면서 이 종목 이름을 읽고 확인을 누르게 된다.
      stockName: displayName,
      price: row.price,
      unfilledQty: row.unfilledQty,
      // 시간외종가 원주문 판정(`isOffhoursOrder`)의 정본 — 요약 주문가 표기가 읽는다.
      board: row.board,
      row,
    });
  }, []);

  /** 취소 버튼 1개 — 표 행과 카드 행이 **같은 버튼**을 쓴다(규율이 갈리지 않게). */
  const cancelButton = (view: UnfilledView, className?: string) =>
    view.cancellable ? (
      /*
        C11 — 26px(36px 행 안), 좁은 폭에서는 `size="sm"`(32px).
        채움 금지: `--destructive` **테두리 + 텍스트**가 유일한 표현이다
        (`--destructive` == `--up` 이라 채우면 매수 버튼과 구분이 안 된다).
        ★ 보이는 글자는 「취소」 한 단어뿐이다 (260911-w5h) — 옛 `✕` 글리프를 걷었다.
          이 버튼은 **표 행과 카드 행이 공유하는 하나**라 그 제거가 데스크톱에도 함께
          걸린다. 그것이 의도다: 버튼을 두 벌로 쪼개 모바일만 바꾸면 이 파일 ② 가 적어 둔
          「규율이 갈리지 않게」가 깨진다.
      */
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!sessionReady || view.cancelBlock !== null}
        title={view.cancelBlock ?? undefined}
        aria-label={`주문번호 ${view.row.orderNo} 취소`}
        onClick={(e) => {
          // 행 선택(⑩)으로 버블하지 않는다 — 취소를 누른 것이 정정 대상 선택이 되면 안 된다.
          e.stopPropagation();
          openCancel(view.row, view.label ?? view.row.isin);
        }}
        className={cn(
          'h-[26px] border-[var(--destructive)] px-2 text-[11px] text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] max-[899px]:h-8',
          className,
        )}
      >
        취소
      </Button>
    ) : (
      <span className="text-[11px] text-[var(--muted-fg)]">—</span>
    );

  /** 선택 UI 스위치 — 콜백이 곧 스위치다(⑩). */
  const selectable = onSelectUnfilled !== undefined;
  const isSelected = (view: UnfilledView) =>
    selectable && selectedOrderNo !== null && view.row.orderNo === selectedOrderNo;

  /**
   * 선택 가능한 행의 속성(표 행 · 카드 행 공용). 콜백이 없으면 **빈 객체** — DOM 이 그대로다.
   * 선택 불가 행은 `onClick` 이 없고 `title` 이 그 사유다.
   */
  const rowSelectProps = (view: UnfilledView) => {
    if (!selectable) return {};
    return {
      title: view.selectBlock ?? UNFILLED_ROW_SELECT_TITLE,
      'data-selected': isSelected(view) ? 'true' : undefined,
      onClick:
        view.selectBlock === null ? () => onSelectUnfilled?.(view.row) : undefined,
    };
  };

  /** 선택된 행 강조 — UI-SPEC §Color Accent 6번(「미체결 표에서 선택된 행」). 새 색이 아니다. */
  const rowSelectClass = (view: UnfilledView) =>
    selectable &&
    cn(
      view.selectBlock === null && 'cursor-pointer',
      isSelected(view) && 'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent)]',
    );

  /**
   * 선택 핸들 — 첫 셀 콘텐츠를 `<button aria-pressed>` 로 감싼다(⑩). 클릭은 행으로 버블해
   * 행 `onClick` 한 경로가 받는다(여기에 `onClick` 을 두면 두 번 불린다).
   * 콜백이 없으면 콘텐츠를 **그대로** 돌려준다.
   */
  const selectHandle = (view: UnfilledView, content: ReactNode, className?: string) =>
    selectable ? (
      <button
        type="button"
        data-slot="account-unfilled-select"
        aria-pressed={isSelected(view)}
        aria-label={`주문번호 ${view.row.orderNo || '없음'} 선택`}
        disabled={view.selectBlock !== null}
        className={cn(
          'min-w-0 cursor-pointer bg-transparent p-0 text-left text-inherit disabled:cursor-not-allowed',
          className,
        )}
      >
        {content}
      </button>
    ) : (
      content
    );

  if (section !== undefined) {
    return (
      <EmbeddedSection
        section={section}
        scope={embedScope}
        emptyTitle={embedEmptyTitle}
        unfilled={unfilled}
        holdings={holdings}
        sessionReady={sessionReady}
        originOf={originOf}
        cancelResult={cancelResult}
        cancelResultOrderNo={cancelResultOrderNo}
        cancelButton={cancelButton}
        rowSelectProps={rowSelectProps}
        rowSelectClass={rowSelectClass}
        selectHandle={selectHandle}
        isSelected={isSelected}
        className={className}
        dialog={
          <OrderConfirmDialog
            detail={cancelTarget}
            onOpenChange={(open) => {
              if (!open) setCancelTarget(null);
            }}
            onConfirm={handleCancelConfirmed}
          />
        }
      />
    );
  }

  return (
    <div
      data-testid="account-panel"
      data-density="default"
      data-mode={stockScoped ? 'stock' : 'account'}
      className={cn('flex flex-col bg-[var(--card)]', className)}
    >
      {/* 계좌 머리 — 종목 축이 있으면 셀렉터, 없으면 그 계좌번호를 **전체 표시**한다(D2 · ⑦). */}
      <div className="flex items-center gap-[var(--s-2)] border-b border-[var(--border-subtle)] px-[var(--s-3)] py-[var(--s-2)]">
        <label
          htmlFor={stockScoped ? 'account-panel-account' : undefined}
          className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
        >
          계좌
        </label>
        {stockScoped ? (
          <select
            id="account-panel-account"
            value={selectedAccountNo}
            onChange={(e) => onAccountChange?.(e.target.value)}
            disabled={(accounts?.length ?? 0) === 0}
            className="mono h-8 min-w-0 flex-1 rounded-[var(--r)] border border-[var(--input)] bg-[var(--muted)] px-2 text-[length:var(--t-caption)] text-[var(--fg)] disabled:opacity-50"
          >
            {(accounts?.length ?? 0) === 0 ? (
              <option value="">계좌 확인 중…</option>
            ) : (
              (accounts ?? []).map((a) => (
                <option key={a.accountNo} value={a.accountNo}>
                  {a.accountNo} · {a.name}
                </option>
              ))
            )}
          </select>
        ) : (
          <>
            <span
              data-testid="account-panel-account-no"
              className="mono min-w-0 flex-1 truncate text-[length:var(--t-caption)] font-semibold text-[var(--fg)]"
            >
              {selectedAccountNo}
            </span>
            {/* 상품명은 **있을 때만** 그린다 — 없는 이름을 「-」로 채우지 않는다(C5). */}
            {accountName !== undefined && accountName !== '' && (
              <span
                data-testid="account-panel-account-name"
                className="shrink-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
              >
                {accountName}
              </span>
            )}
          </>
        )}
      </div>

      {/*
        ≥900px 전용 탭. 좁은 폭에서는 두 표를 그냥 나열하므로 탭 자체가 사라진다(M3).
        계좌 전용 모드에는 탭이 아예 없다 — My page 는 미체결·잔고를 함께 본다(⑦ / R4).
      */}
      {stockScoped && (
        <div
          role="tablist"
          aria-label="계좌 정보"
          className="flex gap-[var(--s-1)] px-[var(--s-3)] py-[var(--s-2)] max-[899px]:hidden"
        >
          {(
            [
              ['unfilled', `미체결 (${unfilled.length})`],
              ['holdings', `잔고 (${holdings.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'h-7 rounded-[var(--r)] border px-2.5 text-[length:var(--t-caption)] font-semibold transition-[background,border-color] duration-[120ms]',
                tab === value
                  ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--fg)]'
                  : 'border-transparent bg-transparent text-[var(--muted-fg)] hover:bg-[var(--muted)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex flex-col',
          // R4 — 계좌 전용 모드는 ≥1280px 에서만 2열이고, 그 자식에 `min-w-0` 이 **필수**다.
          // `stack` 이면 그 2열을 만들지 않는다(좁은 컬럼 안에 놓일 때, 위 props 주석).
          !stockScoped &&
            !stack &&
            'min-[1280px]:grid min-[1280px]:grid-cols-2 min-[1280px]:gap-[var(--s-3)] min-[1280px]:[&>*]:min-w-0',
        )}
      >
        {/* ── 미체결 ── (호가주문 탭 모바일은 잔고 다음 = order-2) */}
        <section
          data-testid="account-unfilled"
          aria-label="미체결 주문"
          className={cn(
            'flex flex-col gap-[var(--s-1)] px-[var(--s-3)] pb-[var(--s-3)] pt-[var(--s-3)]',
            stockScoped && 'max-[899px]:order-2 min-[900px]:pt-0',
            stockScoped && tab !== 'unfilled' && 'min-[900px]:hidden',
            !sessionReady && 'opacity-[.55]',
          )}
        >
          <div
            className={cn(
              'flex min-w-0 flex-wrap items-center gap-[var(--s-2)]',
              // 종목 축 모드에서는 ≥900 에 탭이 있어 이 머리가 통째로 사라진다.
              stockScoped && 'min-[900px]:hidden',
            )}
          >
            <h4 className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
              미체결
            </h4>
            {unfilledHeaderActions !== undefined && (
              <span
                data-slot="account-unfilled-actions"
                className="ml-auto flex flex-none items-center gap-[var(--s-2)]"
              >
                {unfilledHeaderActions}
              </span>
            )}
          </div>
          {unfilled.length === 0 ? (
            <EmptyState
              title="미체결 주문이 없어요"
              body="주문을 넣으면 여기에 표시되고, 여기서 바로 취소할 수 있어요."
            />
          ) : (
            <>
              {/* 데스크톱(≥1280) — 표 */}
              <div className="max-[1279px]:hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">주문번호</TableHead>
                      <TableHead scope="col">구분</TableHead>
                      <TableHead scope="col">종목</TableHead>
                      <TableHead scope="col" className="num">주문가</TableHead>
                      <TableHead scope="col" className="num">주문</TableHead>
                      <TableHead scope="col" className="num">미체결</TableHead>
                      <TableHead scope="col" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unfilled.map((view) => (
                      <TableRow
                        key={view.row.orderNo}
                        data-pending-cancel={view.row.pendingCancelSent ? 'true' : undefined}
                        {...rowSelectProps(view)}
                        className={cn(
                          view.row.pendingCancelSent && 'text-[var(--muted-fg)]',
                          rowSelectClass(view),
                        )}
                      >
                        <TableCell className="mono text-[length:var(--t-caption)]">
                          {selectHandle(view, view.row.orderNo)}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            <SideTag
                              side={view.row.side}
                              text={view.sideText}
                              muted={view.row.pendingCancelSent}
                              selected={isSelected(view)}
                            />
                            <OriginTag tag={originTag} />
                          </span>
                        </TableCell>
                        <TableCell className="text-[length:var(--t-caption)]">
                          {view.label ?? <span className="mono">{view.row.isin}</span>}
                          <StatusNotes texts={[view.row.queuedStatus, view.row.pendingStatus]} />
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.price)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.orderQty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.unfilledQty)}
                        </TableCell>
                        <TableCell className="num">{cancelButton(view)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<1280) — 2줄 카드 행 (C7) */}
              <div
                data-slot="account-unfilled-list"
                className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] min-[1280px]:hidden"
              >
                {unfilled.map((view) => {
                  /*
                    취소보관 행은 카드에서도 회색이다(⑨). 표는 `<TableRow>` 한 곳에 색을
                    주면 셀들이 상속하지만, 카드는 굵은 값마다 `--fg` 를 **명시**하고 있어
                    그 자리들이 같은 분기를 읽어야 한다 — 하나라도 빠지면 「반만 회색인 행」이
                    되고, 그 행이 살아 있는 주문으로 읽힌다.
                  */
                  const fg = view.row.pendingCancelSent
                    ? 'text-[var(--muted-fg)]'
                    : isSelected(view)
                      ? 'text-[var(--accent-fg)]'
                      : 'text-[var(--fg)]';
                  return (
                  <div
                    key={view.row.orderNo}
                    data-slot="account-unfilled-row"
                    data-pending-cancel={view.row.pendingCancelSent ? 'true' : undefined}
                    {...rowSelectProps(view)}
                    className={cn(
                      'min-w-0 px-[var(--s-3)] py-[var(--s-2)]',
                      view.row.pendingCancelSent && 'text-[var(--muted-fg)]',
                      rowSelectClass(view),
                    )}
                  >
                    {/*
                      r1 — 종목명(유일한 신축) + 구분 태그 … (우) **주문가**.
                      ★ 주문번호와 출처 태그를 뺐다 (260911-w5h). 주문번호는 사용자가 읽고
                        행동에 쓰는 값이 아니고(취소는 버튼이 한다), 출처는 상따 화면에서
                        모든 행이 같은 값이라 정보가 0 이었다. 좁은 화면의 노출 표면도 함께
                        줄어든다(T-w5h-02). **데스크톱 표에는 둘 다 남는다.**
                      ★ 취소 버튼의 `aria-label` 이 주문번호를 계속 말하므로 식별은 가능하다.
                    */}
                    <div
                      data-slot="account-unfilled-r1"
                      className="flex min-w-0 items-center gap-[var(--s-2)]"
                    >
                      {selectHandle(
                        view,
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold',
                            fg,
                          )}
                        >
                          {view.label ?? <span className="mono">{view.row.isin}</span>}
                        </span>,
                        'flex min-w-0 flex-1',
                      )}
                      <span className="flex flex-none items-center gap-1">
                        <SideTag
                          side={view.row.side}
                          text={view.sideText}
                          muted={view.row.pendingCancelSent}
                          selected={isSelected(view)}
                        />
                      </span>
                      <span
                        className={cn(
                          'mono ml-auto flex-none text-[length:var(--t-sm)] font-semibold whitespace-nowrap',
                          fg,
                        )}
                      >
                        {KRW.format(view.row.price)}
                      </span>
                    </div>
                    {/* r2 — 미체결 {잔량}/{주문량}주(muted 보조) … (우) 취소 */}
                    <div
                      data-slot="account-unfilled-r2"
                      className="mt-1 flex min-w-0 items-center gap-[var(--s-2)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--muted-fg)]">
                        미체결{' '}
                        <b className={cn('mono font-semibold', fg)}>
                          {KRW.format(view.row.unfilledQty)}
                        </b>{' '}
                        /{' '}
                        <b className={cn('mono font-semibold', fg)}>
                          {KRW.format(view.row.orderQty)}
                        </b>
                        주
                      </span>
                      <span className="ml-auto flex-none">{cancelButton(view)}</span>
                    </div>
                    {/* r3 — 서버 상태 문구(있는 행에만). 표에서는 종목 셀 아래 자리다. */}
                    <StatusNotes texts={[view.row.queuedStatus, view.row.pendingStatus]} />
                  </div>
                  );
                })}
              </div>
            </>
          )}
          {cancelResult && <CancelBanner result={cancelResult} />}
        </section>

        {/* ── 잔고 ── (호가주문 탭 모바일은 미체결보다 위 = order-1) */}
        <section
          data-testid="account-holdings"
          aria-label="잔고"
          className={cn(
            'flex flex-col gap-[var(--s-1)] px-[var(--s-3)] pb-[var(--s-3)] pt-[var(--s-3)]',
            stockScoped && 'max-[899px]:order-1 min-[900px]:pt-0',
            stockScoped && tab !== 'holdings' && 'min-[900px]:hidden',
            !sessionReady && 'opacity-[.55]',
          )}
        >
          <h4
            className={cn(
              'text-[length:var(--t-caption)] font-semibold text-[var(--fg)]',
              stockScoped && 'min-[900px]:hidden',
            )}
          >
            잔고
          </h4>
          {holdings.length === 0 ? (
            <EmptyState title="보유 종목이 없어요" body="체결된 주문이 있으면 잔고에 반영돼요." />
          ) : (
            <>
              {/* 데스크톱(≥1280) — 표 */}
              <div className="max-[1279px]:hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">종목</TableHead>
                      <TableHead scope="col" className="num">보유</TableHead>
                      <TableHead scope="col" className="num">매도가능</TableHead>
                      <TableHead scope="col" className="num">평단가</TableHead>
                      {/* ⑤ 예외 — 현재가를 하나도 모르는 계좌 전용 모드에서는 매입금액 칸이다.
                          아래 셀과 **같은 분기**(`stockScoped`)를 읽어야 헤더와 값이 갈리지 않는다. */}
                      <TableHead scope="col" className="num">{stockScoped ? '평가금액' : '매입금액'}</TableHead>
                      <TableHead scope="col" className="num">평가손익</TableHead>
                      <TableHead scope="col" className="num">수익률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((view) => (
                      <TableRow key={view.row.isin}>
                        <TableCell className="text-[length:var(--t-caption)]">
                          {view.label ?? <span className="mono">{view.row.isin}</span>}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.qty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.sellableQty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(Math.round(view.row.avgPrice))}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {stockScoped
                            ? view.value == null
                              ? '—'
                              : KRW.format(Math.round(view.value))
                            : KRW.format(Math.round(view.cost))}
                        </TableCell>
                        <TableCell className="num text-[length:var(--t-caption)]">
                          {view.pnl == null ? (
                            '—'
                          ) : (
                            <UiNumber
                              value={Math.round(view.pnl)}
                              format="price"
                              showSign
                              withColor
                            />
                          )}
                        </TableCell>
                        <TableCell className="num text-[length:var(--t-caption)]">
                          {view.rate == null ? (
                            '—'
                          ) : (
                            <UiNumber value={view.rate} format="percent" showSign withColor />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<1280) — 2줄 카드 행 (C7) */}
              <div
                data-slot="account-holding-list"
                className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] min-[1280px]:hidden"
              >
                {holdings.map((view) => (
                  <div
                    key={view.row.isin}
                    data-slot="account-holding-row"
                    className="min-w-0 px-[var(--s-3)] py-[var(--s-2)]"
                  >
                    {/*
                      r1 — 종목명(유일한 신축) … (우) **매입금액**.
                      ★ 오른쪽 굵은 자리는 **모드와 무관하게 언제나 매입금액**이다
                        (260911-w5h). 데스크톱 표는 `stockScoped` 로 5번째 칸의 의미를
                        가르지만(⑤ 예외, 그쪽은 헤더가 그 사실을 말한다), **카드 행에서는
                        그 분기를 쓰지 않는다** — 한 목록 안에서 같은 자리가 두 의미를 가지면
                        그 목록은 읽을 수 없다. 평가금액은 아래 r3 에 있다.
                      ★ 라벨을 붙이지 않는다 — 오른쪽 굵은 자리가 곧 그 뜻이고, 세 목록이
                        같은 자리를 같은 규칙으로 쓴다.
                    */}
                    <div
                      data-slot="account-holding-r1"
                      className="flex min-w-0 items-center gap-[var(--s-2)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                        {view.label ?? <span className="mono">{view.row.isin}</span>}
                      </span>
                      <span className="mono ml-auto flex-none text-[length:var(--t-sm)] font-semibold whitespace-nowrap text-[var(--fg)]">
                        {KRW.format(Math.round(view.cost))}
                      </span>
                    </div>
                    {/* r2 — 수량 · 매도가능(좌) … 평단(우). 둘 다 muted 보조다. */}
                    <div
                      data-slot="account-holding-r2"
                      className="mt-1 flex min-w-0 items-center gap-[var(--s-2)] text-[11px] text-[var(--muted-fg)]"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <b className="mono font-semibold">{KRW.format(view.row.qty)}</b>주 · 매도가능{' '}
                        <b className="mono font-semibold">{KRW.format(view.row.sellableQty)}</b>
                      </span>
                      <span className="ml-auto flex-none whitespace-nowrap">
                        평단{' '}
                        <b className="mono font-semibold">
                          {KRW.format(Math.round(view.row.avgPrice))}
                        </b>
                      </span>
                    </div>
                    {/*
                      r3 — **현재가를 아는 행에만** 있다.
                      ★ 대시를 찍지 않는다 (260911-w5h). 계좌 전용 모드에서는 현재가·평가·
                        손익·손익률을 전부 모르므로 옛 구조는 한 행에 대시를 3개씩 그렸다 —
                        「모른다」를 세 번 말하는 줄은 정보가 0 이고 목록의 절반을 먹는다.
                        모르면 **줄 자체가 없다.**
                    */}
                    {view.price != null && (
                      <div
                        data-slot="account-holding-r3"
                        className="mt-1 flex min-w-0 items-center gap-[var(--s-2)] text-[11px] text-[var(--muted-fg)]"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          현재 <b className="mono font-semibold">{KRW.format(view.price)}</b>
                        </span>
                        <span className="ml-auto flex flex-none items-center gap-1 whitespace-nowrap">
                          평가{' '}
                          <b className="mono font-semibold">
                            {view.value == null ? '—' : KRW.format(Math.round(view.value))}
                          </b>
                          {view.pnl != null && (
                            <UiNumber
                              value={Math.round(view.pnl)}
                              format="price"
                              showSign
                              withColor
                            />
                          )}
                          {view.rate != null && (
                            <UiNumber value={view.rate} format="percent" showSign withColor />
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <OrderConfirmDialog
        detail={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onConfirm={handleCancelConfirmed}
      />
    </div>
  );
}

/** 임베드 표 셀 공통 — 목업 `.sh` (행 32px · 좌우 10px · 한 줄). */
const EMB_TH =
  'h-auto bg-[var(--muted)] px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)]';
const EMB_TD = 'h-8 px-2.5 py-0 whitespace-nowrap text-[length:var(--t-caption)]';

/**
 * 탭 임베드 모드(⑪)의 한 섹션. 상태·취소·선택은 **부모 AccountPanel 의 것**을 받아 쓴다 —
 * 이 컴포넌트는 배치만 다르다(두 벌의 규율이 생기지 않게).
 */
function EmbeddedSection({
  section,
  scope,
  emptyTitle,
  unfilled,
  holdings,
  sessionReady,
  originOf,
  cancelResult,
  cancelResultOrderNo,
  cancelButton,
  rowSelectProps,
  rowSelectClass,
  selectHandle,
  isSelected,
  className,
  dialog,
}: {
  section: 'unfilled' | 'holdings';
  scope: 'account' | 'stock';
  emptyTitle?: string;
  unfilled: UnfilledView[];
  holdings: HoldingView[];
  sessionReady: boolean;
  originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined;
  cancelResult: CancelResult | null;
  cancelResultOrderNo: string | null;
  cancelButton: (view: UnfilledView, className?: string) => ReactNode;
  rowSelectProps: (view: UnfilledView) => Record<string, unknown>;
  rowSelectClass: (view: UnfilledView) => string | false;
  selectHandle: (view: UnfilledView, content: ReactNode, className?: string) => ReactNode;
  isSelected: (view: UnfilledView) => boolean;
  className?: string;
  dialog: ReactNode;
}) {
  /** 종목이 이미 정해진 표면(카드 탭) — 종목·거래소 열을 생략한다(⑪ stock 스코프). */
  const stockScope = scope === 'stock';
  if (section === 'holdings') {
    return (
      <div
        data-testid="account-panel"
        data-mode="embed"
        data-section="holdings"
        data-scope={scope}
        className={cn('min-w-0', !sessionReady && 'opacity-[.55]', className)}
      >
        {holdings.length === 0 ? (
          <EmptyState
            title={emptyTitle ?? '보유 종목이 없어요'}
            body={emptyTitle === undefined ? '체결된 주문이 있으면 잔고에 반영돼요.' : undefined}
          />
        ) : (
          <div data-slot="account-embed-scroll" className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {!stockScope && (
                    <TableHead scope="col" className={EMB_TH}>종목</TableHead>
                  )}
                  <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>수량</TableHead>
                  <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>매도가능</TableHead>
                  <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>평단</TableHead>
                  <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>현재가</TableHead>
                  <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>평가손익</TableHead>
                  <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>손익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((view) => (
                  <TableRow key={view.row.isin} data-slot="account-embed-holding-row">
                    {!stockScope && (
                      <TableCell className={cn(EMB_TD, 'max-w-[180px]')}>
                        <span
                          data-slot="account-embed-name"
                          title={view.label ?? view.row.isin}
                          className="block min-w-0 truncate font-semibold"
                        >
                          {view.label ?? <span className="mono">{view.row.isin}</span>}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className={cn(EMB_TD, 'mono text-right')}>
                      {KRW.format(view.row.qty)}
                    </TableCell>
                    <TableCell className={cn(EMB_TD, 'mono text-right')}>
                      {KRW.format(view.row.sellableQty)}
                    </TableCell>
                    <TableCell className={cn(EMB_TD, 'mono text-right')}>
                      {KRW.format(Math.round(view.row.avgPrice))}
                    </TableCell>
                    {/* ⑤ — 현재가를 모르는 행은 셋 다 「—」다. 지어내지 않는다. */}
                    <TableCell className={cn(EMB_TD, 'mono text-right')}>
                      {view.price == null ? '—' : KRW.format(view.price)}
                    </TableCell>
                    <TableCell data-slot="account-embed-pnl" className={cn(EMB_TD, 'text-right')}>
                      {view.pnl == null ? (
                        '—'
                      ) : (
                        <UiNumber value={Math.round(view.pnl)} format="price" showSign withColor />
                      )}
                    </TableCell>
                    <TableCell className={cn(EMB_TD, 'text-right')}>
                      {view.rate == null ? (
                        '—'
                      ) : (
                        <UiNumber value={view.rate} format="percent" showSign withColor />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  const resultRowPresent =
    cancelResultOrderNo !== null && unfilled.some((v) => v.row.orderNo === cancelResultOrderNo);

  return (
    <div
      data-testid="account-panel"
      data-mode="embed"
      data-section="unfilled"
      data-scope={scope}
      className={cn('min-w-0', !sessionReady && 'opacity-[.55]', className)}
    >
      {unfilled.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? '미체결 주문이 없어요'}
          body={
            emptyTitle === undefined
              ? '주문을 넣으면 여기에 표시되고, 여기서 바로 취소할 수 있어요.'
              : undefined
          }
        />
      ) : (
        <div data-slot="account-embed-scroll" className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!stockScope && (
                  <>
                    <TableHead scope="col" className={EMB_TH}>종목</TableHead>
                    <TableHead scope="col" className={EMB_TH}>거래소</TableHead>
                  </>
                )}
                <TableHead scope="col" className={EMB_TH}>구분</TableHead>
                <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>주문가</TableHead>
                <TableHead scope="col" className={cn(EMB_TH, 'text-right')}>주문/미체결</TableHead>
                <TableHead scope="col" className={EMB_TH}>주문No</TableHead>
                <TableHead scope="col" className={EMB_TH}>
                  <span className="sr-only">취소</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unfilled.map((view) => {
                const origin = originOf?.(view.row);
                return (
                  <Fragment key={view.row.orderNo || `nono-${view.row.isin}-${view.row.orderTime}`}>
                    <TableRow
                      data-slot="account-embed-unfilled-row"
                      data-pending-cancel={view.row.pendingCancelSent ? 'true' : undefined}
                      {...rowSelectProps(view)}
                      className={cn(
                        view.row.pendingCancelSent && 'text-[var(--muted-fg)]',
                        rowSelectClass(view),
                      )}
                    >
                      {stockScope ? (
                        /*
                          stock 스코프 — 종목·거래소 셀이 없다. 선택 핸들(⑩)은 첫 셀인 구분을
                          감싸고, 출처 배지·서버 문구(⑨)도 이 셀로 온다. 클로저는 같은 벌이다.
                        */
                        <TableCell className={EMB_TD}>
                          <span className="flex min-w-0 items-center gap-1">
                            {selectHandle(
                              view,
                              <SideTag
                                side={view.row.side}
                                text={view.sideText}
                                muted={view.row.pendingCancelSent}
                                selected={isSelected(view)}
                              />,
                              'flex min-w-0',
                            )}
                            {origin !== undefined && (
                              <span
                                data-slot="account-origin-badge"
                                className="flex-none rounded-[4px] border border-transparent bg-[var(--muted)] px-1 text-[10px] text-[var(--muted-fg)]"
                              >
                                {origin}
                              </span>
                            )}
                          </span>
                          <StatusNotes texts={[view.row.queuedStatus, view.row.pendingStatus]} />
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className={cn(EMB_TD, 'max-w-[200px]')}>
                            <span className="flex min-w-0 items-center gap-1">
                              {selectHandle(
                                view,
                                <span
                                  data-slot="account-embed-name"
                                  title={view.label ?? view.row.isin}
                                  className="block min-w-0 truncate font-semibold"
                                >
                                  {view.label ?? <span className="mono">{view.row.isin}</span>}
                                </span>,
                                'flex min-w-0',
                              )}
                              {origin !== undefined && (
                                <span
                                  data-slot="account-origin-badge"
                                  className="flex-none rounded-[4px] border border-transparent bg-[var(--muted)] px-1 text-[10px] text-[var(--muted-fg)]"
                                >
                                  {origin}
                                </span>
                              )}
                            </span>
                            <StatusNotes texts={[view.row.queuedStatus, view.row.pendingStatus]} />
                          </TableCell>
                          <TableCell className={EMB_TD}>
                            <ExchangeTag exchange={view.row.exchange} />
                          </TableCell>
                          <TableCell className={EMB_TD}>
                            <SideTag
                              side={view.row.side}
                              text={view.sideText}
                              muted={view.row.pendingCancelSent}
                              selected={isSelected(view)}
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell className={cn(EMB_TD, 'mono text-right')}>
                        {KRW.format(view.row.price)}
                      </TableCell>
                      <TableCell className={cn(EMB_TD, 'mono text-right')}>
                        {KRW.format(view.row.orderQty)} / {KRW.format(view.row.unfilledQty)}
                      </TableCell>
                      <TableCell className={cn(EMB_TD, 'mono')}>
                        {view.row.orderNo === '' ? '—' : view.row.orderNo}
                      </TableCell>
                      <TableCell className={cn(EMB_TD, 'text-right')}>{cancelButton(view)}</TableCell>
                    </TableRow>
                    {cancelResult && cancelResultOrderNo === view.row.orderNo && (
                      <TableRow data-slot="account-embed-cancel-result">
                        <TableCell colSpan={stockScope ? 5 : 7} className="px-2.5 py-1.5 whitespace-normal">
                          <CancelBanner result={cancelResult} polite />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {/* 대상 행이 이미 목록에서 빠졌으면(접수 후 사라짐) 표 아래로 떨어진다. */}
      {cancelResult && !resultRowPresent && (
        <div className="px-2.5 py-1.5">
          <CancelBanner result={cancelResult} polite />
        </div>
      )}
      {dialog}
    </div>
  );
}

/**
 * 매수/매도 구분 — **부호 + 라벨 병기**로 색에 의존하지 않는다(WCAG 1.4.1).
 *
 * ★ 라벨 문자열은 이 컴포넌트가 만들지 않는다 (17-09 / D-13). 예약·접수대기·시간외종가
 *   접미를 여기서 조립하면 규칙이 화면 수만큼 생기고, 갈릴 때 어느 쪽이 맞는지 아무도
 *   모른다. 규칙표의 주인은 shared 의 `sideDisplayText` 하나뿐이고 여기는 **받아 그린다**.
 */
function SideTag({
  side,
  text,
  muted = false,
  selected = false,
}: {
  side: RelayUnfilled['side'];
  text: string;
  muted?: boolean;
  /** 선택된 행(⑩) — accent 배경 위에서 방향색 대신 `--accent-fg`. 부호·라벨이 방향을 계속 말한다. */
  selected?: boolean;
}) {
  const buy = side === 'B';
  return (
    <span
      data-slot="account-unfilled-side"
      className={cn(
        'whitespace-nowrap text-[length:var(--t-caption)] font-semibold',
        // 취소보관 행은 방향색도 함께 죽인다(⑨) — 이 칸만 색이 살아 있으면 행이 회색으로
        // 읽히지 않는다 (C# 도 Side 셀 ForeColor 를 따로 회색으로 덮는다).
        muted
          ? 'text-[var(--muted-fg)]'
          : selected
            ? 'text-[var(--accent-fg)]'
            : buy
              ? 'text-[var(--up)]'
              : 'text-[var(--down)]',
      )}
    >
      {buy ? '▲ ' : '▼ '}
      {text}
    </span>
  );
}

/**
 * 미체결 행의 **서버 상태 문구** 보조 줄 — 예약(`queuedStatus`) · 접수대기(`pendingStatus`)
 * (17-09 / D-07 · D-14 · ⑨). 예약이 먼저다(주문의 형태가 먼저, 처리 상태가 다음).
 *
 * ★ 가공하지 않는다. 자르기·치환·상태 분류 없이 **서버 문자열 그대로** 그린다 — 화면이
 *   문구를 손대는 순간 사용자가 보는 말과 서버가 한 말이 갈린다. 「대기」·「발사중」·
 *   「완료」 같은 상태 단어를 클라가 만들어 내지 않는다는 뜻이기도 하다 (D-07).
 * ★ 새 **열**이 아니라 종목 아래 보조 줄이다 — 미체결 표는 이미 7열이라 폰 폭에 새 열을
 *   넣을 여유가 없다. 이 패널은 §2.2b 의 컨테이너 쿼리 대상이 아니라 **뷰포트 브레이크
 *   포인트**를 쓰므로, 여기에 컨테이너 쿼리를 새로 들이지 않는다.
 * ★ 값이 없으면 **요소 자체를 만들지 않는다.** 빈 줄을 그리면 상태가 없는 대다수 행에도
 *   높이가 붙어 표가 두꺼워진다.
 * ★ 이 컴포넌트는 **어느 필드의 문구인지 모른다.** 문자열 하나만 받으므로 필드 이름으로
 *   분기할 수단이 아예 없다 — 「문구로 판정하지 않는다」가 설계로 강제된다(T-17-31).
 * ★ 좁은 폭에서 조용히 잘리지 않게 `min-w-0` + 줄바꿈 허용이고, 전문은 `title` 에 둔다
 *   (플렉스/그리드 자식의 `min-w-0` 누락은 `tasks/lessons.md` 에 등재된 함정이다).
 */
function StatusNotes({ texts }: { texts: readonly string[] }) {
  const shown = texts.filter((text) => text !== '');
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((text, i) => (
        <p
          key={i}
          data-slot="account-unfilled-note"
          title={text}
          className="mt-0.5 min-w-0 text-[11px] break-words text-[var(--muted-fg)]"
        >
          {text}
        </p>
      ))}
    </>
  );
}

/**
 * 출처 태그 — 상따/VI 페이지가 내려 준 화면 컨텍스트다. 수동 주문은 태그가 **없다**
 * (「수동」이라는 태그를 붙이면 대부분의 행에 의미 없는 배지가 하나씩 붙는다).
 */
function OriginTag({ tag }: { tag?: AccountOriginTag }) {
  if (tag === undefined) return null;
  return (
    <span
      data-slot="account-origin-tag"
      className="whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted-fg)]"
    >
      {tag}
    </span>
  );
}

/**
 * 취소 결과 배너 — 주문 패널과 동일한 3분류 규율.
 *
 * `polite` = 임베드 모드(⑪)의 행 인라인 고지 — 거부도 `role="status"` 다(UI-SPEC E13 error ·
 * 「모든 일시 안내는 인라인 status」). 기본 모드의 거부 `alert` 는 기존 계약 그대로다.
 */
function CancelBanner({ result, polite = false }: { result: CancelResult; polite?: boolean }) {
  if (result.kind === 'unknown') {
    return (
      <div
        role="status"
        data-testid="cancel-result-unknown"
        className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-transparent bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
      >
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
          취소 응답이 늦어지고 있어요
        </span>
        <span className="text-[11px] text-[var(--muted-fg)]">
          취소가 이미 나갔을 수 있어요. 미체결 목록이 갱신되는지 확인해 주세요.
        </span>
      </div>
    );
  }
  if (result.kind === 'rejected') {
    return (
      <div
        role={polite ? 'status' : 'alert'}
        aria-live={polite ? 'polite' : undefined}
        data-testid="cancel-result-rejected"
        className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--destructive)] px-[var(--s-3)] py-[var(--s-2)]"
      >
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--destructive)]">
          {result.title}
        </span>
        <span className="text-[11px] text-[var(--muted-fg)]">{result.detail}</span>
      </div>
    );
  }
  return (
    <div
      role="status"
      data-testid="cancel-result-accepted"
      className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-transparent bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
    >
      <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
        취소 주문이 접수됐어요 · 주문번호 {result.orderNo}
      </span>
      <span className="text-[11px] text-[var(--muted-fg)]">
        취소가 확인되면 미체결 목록에서 사라져요.
      </span>
    </div>
  );
}

/** 빈 상태 — 중립색만 쓴다(방향색 금지). */
function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-5)] text-center">
      <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">{title}</p>
      {body !== undefined && (
        <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{body}</p>
      )}
    </div>
  );
}
