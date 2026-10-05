'use client';

/**
 * LimitChaserForm — 상따 매수/매도 설정 **토스식 리스트** (Phase 20 · UI-SPEC §1~§4, TRADE-01).
 *
 * ① 무엇을 어디에
 *   무엇을 어떤 순서로 그리는지는 **`lc/lc-fields.ts` 한 곳**이 정한다(D-19) — 매수 쪽 =
 *   매수주문 공통 카드(주문가격 · 비교가격) → 선매수 → 추가매수 → 후매수(접이식 카드 3장 · Phase 24 ⑤) ·
 *   매도 쪽 = 매도주문 카드(주문가격 · 비교가격 · 매도비율 · 매수잔량 · 잔량추적 · 체결) → 매수취소 → 자동매도(접이식 ·
 *   Phase 27 D-01 — 시작조건 · 비율 · 방법 3택 · 누적/기준 읽기 전용). 행 모양은 `lc/setting-group.tsx` 의
 *   조각이다(값 행 · 체크 값 행 · 읽기 전용 행 · 그룹 카드 · 그룹 스위치). 이 파일은 그 둘을 **값·전송
 *   배선**으로 잇는다. 표시 판정(의미어 · 요약 줄 · 접근성 이름 · 흐림)도 `lc-fields.ts` 순수 함수다.
 *   ★ 세 그룹 카드의 접힘은 폼 인스턴스 `useState` 하나다(R1) — 저장하지 않고, 에코 · 탭 전환 · 밴드 변화에
 *     풀리지 않으며, remount 때만 전부 접힘으로 돌아간다. 접힌 행은 CSS `hidden` 이라 **언마운트하지 않는다**
 *     (아래 탭 숨김과 같은 이유). 자동 펼침은 그 카드 안 행 확정 실패 한 경우뿐이다(T-24-19).
 *   본문 폭 **685px 이상**이면 매수 | 매도 두 열이 나란히 서고 각 열 머리가 「● 매수」/「● 매도」다.
 *   그 아래(폰 밴드)는 탭 하나당 한 열이다.
 *   ★ 판정 기준은 뷰포트가 아니라 **본문 폭**이다 (260912-k2x). 밴드 표와 경계 셋의 실측
 *     근거는 `webapp/src/styles/globals.css` §2.2b 가 정본이다 — 여기에 복사하지 마라.
 *   ★ **탭은 폰 전용이고, 숨김은 CSS 이며, 언마운트하지 않는다.** 비활성 pane 은 `display:none`
 *     이라 접근성 트리에서도 빠지지만 **DOM 에는 남는다** — 조건부 렌더로 바꾸면 탭을 옮길 때
 *     나가 있던 확정(in-flight)·열린 편집기가 함께 사라진다.
 *
 * ② ★ 오조작 방지 — 이 파일의 존재 이유
 *   1. **스위치는 확인 없이 즉시 전송**한다(Phase 16 D-05) — 상한가 직전에 다이얼로그를 한 번 더
 *      거치게 하면 그 1~2초가 체결을 놓치는 비용이다. 오터치 방어는 **기하학**이다 — 시각 40×24 +
 *      히트 44×44 + 그룹 제목줄 **오른쪽 끝** 고정(`GroupSwitch` · `SettingGroup`). 크기·위치를 줄이는
 *      변경은 곧 안전장치를 줄이는 변경이다.
 *   2. **매수/매도는 3중으로 말한다** — ≥685 열 머리 점 색(`--up`/`--down`) + 글자(「매수」/「매도」) +
 *      위치(왼쪽/오른쪽). 폰은 바깥 3탭 글자가 말한다. 선택 면(탭)은 중립 `--seg-on-*` 다.
 *   3. ★ **발주할 수 없는 전략은 무장되지 않는다**(WR-06). 켜는 방향만 `gateBlocked()` 로 막고 그
 *      사유는 **열 맨 아래 한 곳**(`lc-arm-blocked-panel`)에 모인다 — 그룹 안에 끼우면 사유가 뜰 때마다
 *      아래 행이 밀린다. 값 확정도 전송 직전 같은 판정(`armBlockOf`)을 지난다(필드 확정 훅).
 *      ★ **끄는 것은 언제나 허용**한다 — 무장 해제를 막으면 그게 더 위험하다(T-16-44).
 *      구서버 에코(lib `isLegacyBuySchema` · WR-02)는 켜는 방향 전부가 `disabled`(매수취소 포함)이고 열 패널이
 *      「{카드 이름들} · 구서버 전략이라 끄기만 …」 한 줄을 말한다 — 누르기 전에 알 수 있는 사유다(24-13).
 *   4. **삭제 버튼을 만들지 않는다**(D-08). 매수·매도·취소 게이트가 전부 꺼지면 그것이 삭제
 *      (`crud "D"`)다. 판정은 `crudOf()` 한 곳이고, 화면의 「삭제됨」은 서버 에코의 `crud` 를 본다.
 *   5. 매수취소 그룹 스위치 = `cancelQtyEnabled`(D-21). 꺼져 있어도 체결·잔량추적 체크는 켤 수 있고
 *      그래서 이 그룹만 흐리지 않는다 — 무장 판정은 `lib/limit-chaser.ts` 그대로다.
 *
 * ③ ★ 값은 **확정 1회 = 즉시 반영**이다 (Phase 20 D-04)
 *   시트 「{필드명} 적용」 · 인라인 Enter/포커스 이탈 · 체크 · 스위치 **한 번**이 곧 전략 전체
 *   (`RelayLimitChaserInput` 전 필드) 전송 한 번이다(`useLcFieldCommit`). 더티 누적도 「수정/되돌리기」 액션 바도 **없다** —
 *   옛 더티 모델은 이 plan(20-04)에서 폐기됐다. 성공 판정은 **에코의 그 필드 값 === 보낸 값**뿐이다
 *   (거부도 답 신호를 올리므로 답만으로 성공이라 읽지 않는다 · D-06). 값 필드는 낙관 반영하지 않는다 —
 *   행은 에코가 올 때까지 서버 값이다. 토글 종류는 전송 뒤 낙관 표시하고 실패하면 서버 값으로 되돌린다.
 *   ★ 워크벤치 더티 배관(카드 `dirtyCount` · 더티 호스트 · 이탈 경고)은 **고치지 않았다** — 이 폼이
 *     더티 수를 보내지 않으므로 늘 0 이고, 그래서 스스로 비활성이다(RESEARCH Pitfall 10).
 *
 * ④ ★ 에코가 도착하면 서버가 이긴다 (D-11 · D-27)
 *   목록은 에코 값으로 덮인다. 유일한 예외가 **편집 중인 버퍼**다 — 인라인 편집기·시트는 자기 버퍼를
 *   들고 있어 에코가 입력을 덮지 않는다(UI-SPEC E4 partial). 편집이 끝나면 행은 에코 값이다.
 *   구서버 에코(`buy3Schema 0`)의 선매수 금액 0(=「서버가 모른다」)은 덮지 않으며 그 판단은 lib
 *   `isLegacyAmountUnknown` 한 곳에 있다(buy3 에코의 0 은 「선매수 금액 미입력」 — D-03 · 24-REVIEW WR-01).
 *   ★ 그 상태(레거시 전략)에서는 주문금액 행이 폼이 든 클라 기본값이 아니라 **「—」** 다(D-04a 잔여 · 훅 `amountRequired`).
 *     구서버 에코는 끄기만 · 매수주문부터다(WR-02 · 판정은 훅 `lcLegacyBlockOf` 하나 — 시트 · 인라인 검증과 전송 직전
 *     가드가 같이 읽는다). 매수주문 끄기는 늘 나간다(T-16-44).
 *
 * ⑤ ★ 전송 필드는 **클라 입력 + 클라 고정 3** 이다 — 목록의 정본은 shared `RelayLimitChaserInput`(Omit)이다
 *   (여기에 필드 수를 적지 않는다 — 필드가 합류할 때 갈라진다).
 *   S→C 전용 필드(정본 shared `LIMIT_CHASER_SERVER_ONLY_FIELDS`)를 **싣지 않는다**(Pitfall 6). 되보내면
 *   「값이 왕복한다」는 착각으로 에코 비교가 오염된다.
 *   고정 3(`sweepRecalcEnabled: true`·`sweepMinCount: 0`·`sweepMinRate: 0`)은 **폼에 노출하지
 *   않는다** — relay 빌더가 어차피 그 값으로 덮으므로(16-04), 입력을 열면 「설정했는데 반영
 *   안 됨」이 된다.
 *
 * ⑥ 토스트를 쓰지 않는다 (UI-SPEC D3)
 *   결과는 행(값 강조 900ms · 실패 링/말풍선) · 시트 상태 줄 · 폼 맨 위 한 줄(스위치·체크
 *   전송 끊김) · 그룹 카드 사전 검증 줄(그룹 켜기 거절 · Phase 24 §7) · 상태줄 · 전략 로그(D-36 은
 *   `onClientLog` 한 줄)로만 알린다.
 *
 * ⑦ ★ 색 규칙 (UI-SPEC Color)
 *   `--primary` 는 「Accent 전용 자리」 목록(켜진 스위치 트랙 · 켜진 체크 채움 · 인라인 편집 링 ·
 *   확정 강조 · 포커스 링 · 시트)에서만 쓴다. `--primary` 는 `--down`(매도 파랑)과 값이 같다 —
 *   매도는 글자와 위치가 함께 말한다(WCAG 1.4.1).
 *
 * ⑧ 왜 Radix 를 이렇게 쓰는가
 *   - **탭**: 단일선택 `ToggleGroup` 은 항목에 `role="radio"` 를 강제해 `tablist`/`tab` 대응이
 *     깨진다(`order-panel.tsx:422` 와 같은 판단이다) — 순수 버튼이다.
 *   - **스위치**: `ui/switch.tsx` 의 thumb 기하(16px · `translate-x-4`)가 컴포넌트 안에 하드코딩돼
 *     호출부에서 못 바꾼다(RESEARCH Pitfall 9). 이 화면의 오터치 방어가 **40×24 + 히트 44** 라
 *     공용 파일을 고치는 대신 `GroupSwitch` 가 Radix Switch primitive 를 **직접** 그린다.
 *   - **체크**: 원형 체크 + 라벨이 한 `<button role="checkbox">` 다(D-22) — 행 높이 44 전체가 히트다.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type {
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
  TickRule,
} from '@gh-radar/shared';

import { useRelayContext } from '@/lib/relay-provider';
import {
  buyOrderQtyFromAmount,
  crudOf,
  defaultLimitChaserForm,
  formFromServer,
  isDeleteIntent,
  isLegacyBuySchema,
  confirmAutoChecks,
  groupAutoCheckLogLine,
  groupAutoChecksOf,
  isMasterOnlyDelta,
  seedFromUpperLimit,
  seedListSharesDefaults,
  seedFromUserSettings,
  autoSellButtonsOf,
  autoSellStartBlocked,
  type AutoCheckGate,
  type AutoSellAction,
  type GroupAutoCheckResult,
  type LimitChaserFormValues,
} from '@/lib/limit-chaser';
import { cn } from '@/lib/utils';
import { InlineValueEditor, type InlineSaveVia } from '@/components/trading/lc/inline-value-editor';
import {
  LC_BUY_GROUPS,
  LC_SELL_GROUPS,
  LC_SWITCH_LABEL,
  lcAutoSellBasisText,
  lcNavigableRows,
  lcRowA11yNameOf,
  lcRowByField,
  lcRowById,
  lcRowDimOf,
  lcRowOfField,
  lcSummaryOf,
  lcValueTextOf,
  POST_BUY_UNLOCK_SR_TEXT,
  type LcGate,
  type LcGroupSpec,
  type LcNumField,
  type LcRange,
  type LcRowSpec,
  type LcStatusKey,
  type LcUnit,
} from '@/components/trading/lc/lc-fields';
import { NumberPadSheet } from '@/components/trading/lc/number-pad-sheet';
import {
  AutoSellActions,
  CheckValueRow,
  ChoiceRow,
  DerivedRow,
  formatSettingValue,
  GroupNote,
  GroupHeaderCheck,
  GroupSummary,
  GroupSwitch,
  SettingGroup,
  SettingRow,
} from '@/components/trading/lc/setting-group';
import {
  LC_COMMIT_TEXT,
  lcExtraBuyUpperLimitBlockOf,
  lcGroupAmountBlockOf,
  lcLegacyBlockOf,
  useLcFieldCommit,
  type LcCommitFailure,
  type LcCommitMeta,
  type LcFailReason,
  type LcFieldKey,
} from '@/components/trading/lc/use-lc-field-commit';
import { useEditMode } from '@/lib/use-edit-mode';

/**
 * 무장 판정을 지나는 게이트 5종. **순서가 곧 사유 표시 우선순위**다 — 화면의 위→아래
 * (매수주문 → 선매수 → 추가매수 → 후매수 → 매도)와 같게 두어야 사유 패널이 짚어 준 곳과 사용자가 보는 곳이 일치한다.
 * 한방은 선매수 안 **체크**가 됐다(Phase 24) — 게이트가 아니고, 그 무장 판정은 `armBlockOf` 끝 한 줄이다.
 */
const GATE_KEYS = ['buyEnabled', 'preBuyEnabled', 'extraBuyEnabled', 'postBuyEnabled', 'sellEnabled'] as const;
type GateKey = (typeof GATE_KEYS)[number];

/** 매수 세 그룹 스위치(D-01 · D-02 동반 대상). */
type BuyGroupGate = 'preBuyEnabled' | 'extraBuyEnabled' | 'postBuyEnabled';
const BUY_GROUP_GATES: readonly BuyGroupGate[] = ['preBuyEnabled', 'extraBuyEnabled', 'postBuyEnabled'];
const isBuyGroupGate = (gate: string): gate is BuyGroupGate => (BUY_GROUP_GATES as readonly string[]).includes(gate);

/**
 * 그룹 → 그 그룹 금액 필드. 수량은 **공통 주문가격**으로 `buyOrderQtyFromAmount` 가 산출한다(역산 금지 ·
 * `buildCfg` 의 금액→수량 3벌과 같은 호출).
 */
const GROUP_AMOUNT_FIELD = {
  preBuyEnabled: 'buyOrderAmount',
  extraBuyEnabled: 'extraBuyOrderAmount',
  postBuyEnabled: 'postBuyOrderAmount',
} as const satisfies Record<BuyGroupGate, keyof LimitChaserFormValues>;

/** 그룹 주문수량 — 웹 `canArmOf` 와 사전 검증이 같은 식을 읽는다(relay 는 산출된 `…OrderQty` 를 본다). */
function groupQtyOf(gate: BuyGroupGate, values: LimitChaserFormValues): number {
  return buyOrderQtyFromAmount(values[GROUP_AMOUNT_FIELD[gate]], values.buyOrderPrice);
}

/**
 * 무장 불가 사유 (WR-06 · UI-SPEC 「무장 불가 패널 문구」). 배지만 회색으로 두면 사용자는 **왜** 안 켜지는지 모른다.
 *
 * ★ 열 아래 「켤 수 없는 이유」 패널은 **누르기 전에 알 수 있는 시세 미수신(가격 0)** 만 다룬다(R7).
 *   옛 「주문금액 부족 → 0주」 패널 문구는 그룹 카드 사전 검증 줄(`LC_COMMIT_TEXT.qtyZero`)로 옮겼다 —
 *   수량 0 은 누르는 순간 그 카드 안에서 말한다(Phase 24 · UI-SPEC §7).
 */
const ARM_BLOCKED_TEXT = {
  buyPrice: '시세를 받지 못해 주문가격이 0 이에요. 주문가격을 입력하면 켤 수 있어요.',
  buyWatchPrice: '시세를 받지 못해 비교가격이 0 이에요. 비교가격을 입력하면 켤 수 있어요.',
  sellPrice: '시세를 받지 못해 매도 주문가격이 0 이에요. 주문가격을 입력하면 켤 수 있어요.',
  sellWatchQty: '매도 매수잔량이 0 이에요. 감시할 매수잔량을 입력하면 켤 수 있어요.',
  sweepPrice: '시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.',
} as const;

/**
 * 게이트의 **표시 이름** — 값은 각 그룹 카드의 `title` 과 **같은 문자열**이어야 한다.
 *
 * 사용자가 목록 위에서 본 이름과 사유가 부르는 이름이 갈리면 그것이 곧 오독이다.
 * 사유 줄과 전송 직전 차단 문구(`armBlockOf`)가 **이 표 하나**를 읽는다.
 */
const GATE_LABEL: Record<GateKey, string> = {
  buyEnabled: '매수주문',
  preBuyEnabled: '선매수',
  extraBuyEnabled: '추가매수',
  postBuyEnabled: '후매수',
  sellEnabled: '매도주문',
};
/** 한방 체크의 무장 불가 접두 — 「{그룹} {라벨}」 규칙(체크 접근성 이름과 같다). */
const SWEEP_LABEL = '선매수 한방';

/** 매수 공통 가격(주문가격 · 비교가격) 사유 — 서버가 마스터를 눕히는 값(relay `buy` 갈래). 멀쩡하면 null. */
function buyPriceReasonOf(values: LimitChaserFormValues): string | null {
  if (values.buyOrderPrice === 0) return ARM_BLOCKED_TEXT.buyPrice;
  if (values.buyWatchPrice === 0) return ARM_BLOCKED_TEXT.buyWatchPrice;
  return null;
}

/**
 * 게이트 하나가 왜 안 켜지는가 — **문구 산출 지점 하나**.
 *
 * 열 맨 아래 사유 패널과 필드 확정 훅의 차단 문구(`armBlockOf`)가 **이 함수 하나**를 읽는다. 두 곳에 따로
 * 적으면 언젠가 서로 다른 말을 하고, 그때 사용자는 「화면이 서로 다른 이유를 대는」 상태를
 * 본다 — 안전 게이트에서 그것은 문구 결함이 아니라 신뢰 결함이다(GC-WR-09 + GC-WR-12).
 *
 * ★ 판정은 `canArmOf` 와 **같은 값**을 본다(`limit-chaser.ts` 의 산출식을 복제하지 않는다).
 */
function armBlockedTextOf(key: GateKey, values: LimitChaserFormValues): string {
  // 매도는 두 값이 독립이다 — 가격이 0 이면 시세, 아니면 감시 매수잔량이다(`canArmOf.sellEnabled` 동형).
  if (key === 'sellEnabled') {
    return values.sellOrderPrice === 0 ? ARM_BLOCKED_TEXT.sellPrice : ARM_BLOCKED_TEXT.sellWatchQty;
  }
  // 매수 넷은 공통 가격이 먼저다(시세 미수신 — 만질 곳은 가격). 가격이 멀쩡한데 막혔으면 그 그룹 수량 0 이다
  //   (만질 곳은 그 카드 금액 — 사전 검증 줄과 같은 문장).
  return buyPriceReasonOf(values) ?? LC_COMMIT_TEXT.qtyZero;
}

/** 사유 한 줄 — 같은 문장을 공유하는 게이트들이 한 줄로 합쳐진 결과다. */
export interface ArmBlockedGroup {
  /** `GATE_LABEL` 값들. 화면 위→아래(`GATE_KEYS`) 순서다. */
  gates: string[];
  /** `armBlockedTextOf` 가 돌려준 문장 그대로. */
  text: string;
}

/**
 * 「켤 수 없는 이유」 목록 산출 — **순수 함수 하나**.
 *
 * `GATE_KEYS` 순서(매수주문 → 선 · 추가 · 후매수 → 매도 = 화면 위→아래)로 막힌 게이트를 고른 뒤
 * `armBlockedTextOf` 결과가 **같은 문자열인 것끼리 묶는다**(「매수주문 · 선매수 · 추가매수 · 후매수 · {사유}」).
 * 첫 등장 순서를 유지한다 — 그래야 카드 위에서 본 순서와 사유 순서가 같다.
 * `canArm` 은 **정적 판정**(`canArmStaticOf` — 가격 0 · 매도 매수잔량 0)이다. 그룹 수량 0 은 여기 없다(R7).
 *
 * ★ 구서버 에코(`legacyNames` 가 null 아님 · WR-02)는 **그 열의 한 줄만** 돌려준다 — 「{그 열 카드 이름들} ·
 *   `LC_COMMIT_TEXT.legacyReadOnly`」. 구서버 에코는 누르기 전에 알 수 있는 사유라 이 패널 몫이다(R7 결 —
 *   시세 미수신과 같은 자리). 켜는 방향이 전부 막혀 있으므로 가격 0 같은 다른 사유는 그 열에서 말하지 않는다
 *   (한 줄이 사실 전부다). 문장 원천은 훅 `LC_COMMIT_TEXT` 하나다(전송 직전 가드 · 확정 전 검증과 같은 문장).
 *
 * ★ 문장은 여기서 짓지 않는다. 산출 지점은 계속 `armBlockedTextOf` 하나다(파일 상단 ② 5).
 */
function armBlockedGroupsOf(
  keys: readonly GateKey[],
  values: LimitChaserFormValues,
  canArm: Record<GateKey, boolean>,
  disabled: boolean,
  legacyNames: readonly string[] | null,
): ArmBlockedGroup[] {
  if (disabled) return [];
  if (legacyNames !== null) return [{ gates: [...legacyNames], text: LC_COMMIT_TEXT.legacyReadOnly }];
  const out: ArmBlockedGroup[] = [];
  for (const key of GATE_KEYS) {
    if (!keys.includes(key)) continue;
    if (values[key] || canArm[key]) continue;
    const text = armBlockedTextOf(key, values);
    const hit = out.find((g) => g.text === text);
    if (hit) hit.gates.push(GATE_LABEL[key]);
    else out.push({ gates: [GATE_LABEL[key]], text });
  }
  return out;
}

/** 사유 한 줄의 조립 규칙 — 패널과 `armBlockOf` 가 **같은 규칙**을 쓴다. */
const ARM_BLOCKED_SEP = ' · ';

/**
 * ★ **무장 가능 판정** (WR-06 · Phase 24 그룹별) — 발주할 수 없는 그룹은 켜지지 않는다. **산출 지점 하나**다.
 *
 * 필드 확정 훅의 전송 직전 가드(`armBlockOf`) · 사전 검증 수량 판정이 이 식을 읽고, relay `fanout.ts`
 * `#strategyArmable` 의 여섯 갈래(buy · preBuy · extraBuy · postBuy · sweep · sell)와 **같은 커밋에서 같은 식**이다
 * (Pitfall 5 · GC-WR-05 — 첫 관문이 마지막 관문과 같거나 더 엄격해야 한다).
 *
 *   - `buyEnabled`(마스터) = 주문가격 > 0 ∧ 비교가격 > 0 — 서버가 마스터를 눕히는 값. 마스터는 수량을 보지 않는다.
 *   - 선 · 추가 · 후매수 = 마스터 무장 가능 ∧ 그 그룹 수량(`buyOrderQtyFromAmount(그룹 금액, 주문가격)`) > 0.
 *     옛 식(마스터 = 선매수 수량 > 0)은 선매수 금액이 빈 정상 후매수 전략을 막았다.
 *
 * `mergeMasterAndQuote` 는 `stock_quotes` 행이 없으면 `upperLimit: 0`·`price: 0` 을 돌려주고,
 * 그런 종목을 고르면 상한가 시딩이 가격 칸을 전부 0 으로 채운다 — 그 상태의 「무장」 배지는 영원히
 * 발주하지 않는 조용한 실패다.
 */
function canArmOf(values: LimitChaserFormValues): Record<GateKey, boolean> {
  const buy = buyPriceReasonOf(values) === null;
  /*
    ★ 매도는 **예상 매도수량(`estimatedSellQty(매도가능, 비율)`)을 조건으로 쓰지 않는다.**
    정본은 서버가 Set 시점에 스냅샷하는 `sellOrderQty` 이고, 상따의 정상 흐름은 「아직 한 주도 없는 상태에서
    매수·매도를 함께 무장」이다. 서버 검증과 동형으로 `sellWatchQty === 0`(「0 이면 서버가 매도 활성화를
    거부한다」)과 시세 미수신(`sellOrderPrice === 0`)만 본다.
  */
  const sell = values.sellOrderPrice > 0 && values.sellWatchQty > 0;
  return {
    buyEnabled: buy,
    preBuyEnabled: buy && groupQtyOf('preBuyEnabled', values) > 0,
    extraBuyEnabled: buy && groupQtyOf('extraBuyEnabled', values) > 0,
    postBuyEnabled: buy && groupQtyOf('postBuyEnabled', values) > 0,
    sellEnabled: sell,
  };
}

/**
 * **정적** 무장 판정 — 누르기 전에 알 수 있는 사유만(시세 미수신 · 매도 매수잔량 0). 스위치 `disabled` 와
 * 열 아래 패널이 이것을 읽는다. 그룹 수량 0 은 누르는 순간의 사전 검증이다(R7 · UI-SPEC §7) — 여기 넣으면
 * 금액만 모자란 그룹 스위치가 눌리지도 않아 「왜」를 말할 자리가 사라진다.
 */
function canArmStaticOf(values: LimitChaserFormValues): Record<GateKey, boolean> {
  const buy = buyPriceReasonOf(values) === null;
  const sell = values.sellOrderPrice > 0 && values.sellWatchQty > 0;
  return { buyEnabled: buy, preBuyEnabled: buy, extraBuyEnabled: buy, postBuyEnabled: buy, sellEnabled: sell };
}

/**
 * 이 값으로 보내면 relay 가 통째로 거부할 무장인가 — 사유 1줄, 아니면 `null`.
 *
 * ★ 조립 규칙은 `{게이트이름} · {사유}` 이고, 시트 검증(`validate`)과 필드 확정 훅이
 *   **이 함수 하나**를 읽는다(GC-WR-09 · T-16-60). 동반 필드(D-01)는 훅이 합친 값으로 부른다.
 * ★ **켜져 있는 게이트만** 본다(`values[key]`) — 끄는 방향은 막지 않는다(T-16-44).
 * ★ 한방(선매수 안 체크)은 게이트 뒤 한 줄이다 — 선매수가 켜져 있을 때만 한방가격 0 을 본다(relay `sweep` 갈래 ·
 *   선매수가 꺼져 있으면 판정되지 않는 값이라 막을 이유가 없다).
 * ★★ **철거 면제**(R2-WR-02) — 게이트 4종이 전부 꺼진 요청은 전략을 내리는 요청이라 막지 않는다.
 *   relay `fanout.ts` `#strategyArmable` 도 `#isTeardown(cfg)` 를 먼저 면제한다. 첫 관문이
 *   마지막 관문보다 엄격하면 사용자는 전략을 내리려는데 화면이 막는다.
 */
function armBlockOf(values: LimitChaserFormValues): string | null {
  if (isDeleteIntent(values)) return null;
  const canArm = canArmOf(values);
  const blocked = GATE_KEYS.find((key) => values[key] && !canArm[key]);
  if (blocked !== undefined) return `${GATE_LABEL[blocked]}${ARM_BLOCKED_SEP}${armBlockedTextOf(blocked, values)}`;
  if (values.preBuyEnabled && values.sweepEnabled && values.sweepWatchPrice === 0) {
    return `${SWEEP_LABEL}${ARM_BLOCKED_SEP}${ARM_BLOCKED_TEXT.sweepPrice}`;
  }
  return null;
}

/** 매수 열이 품는 게이트 — 마스터 + 세 그룹. 사유가 같으면 한 줄로 합쳐진다. */
const BUY_COLUMN_GATES: readonly GateKey[] = ['buyEnabled', 'preBuyEnabled', 'extraBuyEnabled', 'postBuyEnabled'];
/** 매도 열은 자기 사유만 갖는다 — 매수 사유가 매도 열에 새지 않는다. */
const SELL_COLUMN_GATES: readonly GateKey[] = ['sellEnabled'];
/**
 * 구서버 에코(WR-02) 열 패널이 부르는 카드 이름들 — 스위치가 있는 카드 전부(화면 위→아래). 매수 열은 무장 게이트
 * 표시 이름 그대로, 매도 열은 매도주문 + 매수취소 카드 제목(`lc-fields.ts` 에서 읽는다 — 문자열 복제 금지).
 */
const BUY_COLUMN_LEGACY_NAMES: readonly string[] = BUY_COLUMN_GATES.map((key) => GATE_LABEL[key]);
const SELL_COLUMN_LEGACY_NAMES: readonly string[] = [
  ...SELL_COLUMN_GATES.map((key) => GATE_LABEL[key]),
  ...LC_SELL_GROUPS.flatMap((g) => (g.gate === 'cancelQtyEnabled' && g.title !== undefined ? [g.title] : [])),
];

/**
 * D-02 후반 · D-19 — **서버 접힘 하강 전이**인가(WinForms `b066e135` `DropMasterAfterServerFold` 의 `hadBuyGroup` 동형).
 *
 * 직전 **렌더된** 에코에서는 선 · 추가 · 후매수 중 하나라도 ON 이었는데(hadBuyGroup) 이 에코에서 세 그룹 OFF ∧
 * 마스터 ON 이 된 경우만 true 다. 이미 세 그룹 OFF 로 시작하는 에코(같은 상태 재수신 · 재접속 뒤 첫 `lc.snap` ·
 * 첫 스냅샷 · 사람이 마지막 그룹을 꺼 마스터까지 꺼진 자기 에코)는 트리거가 아니다(핑퐁 0).
 *
 * gh-trade D-34(`9f07d025`) 서버는 세 그룹이 모두 접히는 순간 마스터도 내려 같은 에코에 `buyEnabled=false` 를
 * 싣는다 — 그 에코는 여기서 false 다. 이 자동 끔은 구 서버용 백스톱이다(WinForms 도 같다).
 *
 * 구서버 에코(`isLegacyBuySchema` · 전환 에코 포함)는 하강 전이로 읽지 않는다 — 직전 · 이번 에코가 모두 buy3 일 때만
 * true 일 수 있다. buy3 → 구서버 전환 에코는 신필드 부재로 세 그룹이 0 이 되지만 서버가 접은 것이 아니고, 구서버에
 * 마스터 OFF 는 실제 매수 감시 해제다(GC-IN-01). relay 세션 `ready` 소실에 기대지 않고 여기서 거른다.
 */
export function isServerFoldEdge(prev: RelayLimitChaser | null, next: RelayLimitChaser | null): boolean {
  if (prev === null || next === null) return false;
  // GC-IN-01 — 직전 · 이번 에코 중 하나라도 구서버면 하강 전이가 아니다(전환 에코 포함).
  if (isLegacyBuySchema(prev)) return false;
  if (isLegacyBuySchema(next)) return false;
  const hadBuyGroup = prev.preBuyEnabled || prev.extraBuyEnabled || prev.postBuyEnabled;
  return (
    hadBuyGroup && !next.preBuyEnabled && !next.extraBuyEnabled && !next.postBuyEnabled && next.buyEnabled
  );
}

/**
 * D-02 후반 가드 ⑥ — **보이지 않는 인스턴스**(백그라운드 탭 · 앱)가 서버 접힘 자동 끔을 미루는 시간(ms · 24-REVIEW WR-06).
 *
 * 보이지 않는 인스턴스는 보이는 인스턴스가 먼저 보내도록 양보한다. 유예 뒤 가드 ② 가 최신 에코로 재확인해 이미
 * 마스터 OFF 면 접는다 — 같은 사용자의 탭 · 앱 N개에서 자동 끔이 통상 1건이다. 에코 왕복(수백 ms)보다 넉넉하고
 * 사람이 체감할 자동 끔 지연은 아닌 값이다.
 */
export const LC_FOLD_HIDDEN_DEFER_MS = 1_500;

/** 자동 끔 예약 지연 — 화면에 보이면 0(다음 틱) · 숨어 있으면 `LC_FOLD_HIDDEN_DEFER_MS`(가드 ⑥). SSR 에서는 0. */
function serverFoldDelayMs(): number {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden' ? LC_FOLD_HIDDEN_DEFER_MS : 0;
}

/** 그룹 스위치 → 그 그룹 카드 slot(사전 검증 줄 자리). */
const GROUP_SLOT = {
  preBuyEnabled: 'pre-buy',
  extraBuyEnabled: 'extra-buy',
  postBuyEnabled: 'post-buy',
} as const satisfies Record<BuyGroupGate, string>;
type PrecheckSlot = (typeof GROUP_SLOT)[BuyGroupGate];

/**
 * 그룹 켜기 사전 검증 — 실패한 검증 문구 **전부**(UI-SPEC §7 「그룹 켜기 검증 순서」 순). 화면에는 첫 실패 하나만
 * 뜨고(`groupPrecheckOf`), 전부를 돌려주는 까닭은 「사라지는 때 ①」 — 띄운 문구의 검증이 통과했는지를 따로 본다.
 *
 * 순서: (세션 · 무장 불가(가격 0)는 스위치 `disabled` 가 먼저 막는다) → 금액 → 수량 → 그룹 고유.
 *   - 금액: 세 그룹 모두 D-03(그룹 금액 0 · `lcGroupAmountBlockOf` — buy3 에코의 선매수 금액 0 도 여기 · IN-04). 수량 0
 *     문구로 떨어지지 않는다. 구서버 에코는 켜는 방향 전체를 훅 가드(`lcLegacyBlockOf` · WR-02)와 24-13 의 스위치 비활성이
 *     먼저 막는다.
 *     금액이 실패하면 수량은 보지 않는다(같은 원인을 두 번 말하지 않는다).
 *   - 수량: `buyOrderQtyFromAmount(그룹 금액, 공통 주문가격) === 0` — 웹 `canArmOf` · relay `…OrderQty === 0` 과 같은 식.
 *   - 선매수: 한방 체크 ON ∧ 한방가격 0 → `ARM_BLOCKED_TEXT.sweepPrice`(IN-03 — 폼 맨 위가 아니라 선매수 카드 한 줄).
 *   - 추가매수: D-10 최대 ≠ 0 ∧ 최소 > 최대.
 *   - 후매수: 반등 1~100 밖(D-20 · 레거시 0) → 매도비율 0(D-27 · 레거시).
 * `values` = 이 확정이 실을 기준값(서버 동기값 — 훅과 같은 `lcBaseValues`).
 */
function groupPrechecksOf(gate: BuyGroupGate, values: LimitChaserFormValues): string[] {
  const out: string[] = [];
  const amount = lcGroupAmountBlockOf(values, gate, true);
  if (amount !== null) out.push(amount);
  else if (values.buyOrderPrice > 0 && groupQtyOf(gate, values) === 0) out.push(LC_COMMIT_TEXT.qtyZero);
  if (gate === 'preBuyEnabled' && values.sweepEnabled && values.sweepWatchPrice === 0) {
    out.push(ARM_BLOCKED_TEXT.sweepPrice);
  }
  if (gate === 'extraBuyEnabled' && values.extraBuyMaxQty !== 0 && values.extraBuyMinQty > values.extraBuyMaxQty) {
    out.push(LC_COMMIT_TEXT.minOverMax);
  }
  if (gate === 'postBuyEnabled') {
    if (values.postBuyReboundPct < 1 || values.postBuyReboundPct > 100) out.push(LC_COMMIT_TEXT.reboundRange);
    if (values.sellOrderRatio === 0) out.push(LC_COMMIT_TEXT.sellRatioRequired);
  }
  return out;
}

/** 그룹 켜기 사전 검증 — 첫 실패 문구 하나, 통과면 null(누르는 순간 판정 · R7). 끄는 방향에는 부르지 않는다(T-16-44). */
function groupPrecheckOf(gate: BuyGroupGate, values: LimitChaserFormValues): string | null {
  return groupPrechecksOf(gate, values)[0] ?? null;
}

/**
 * 전송 실패 문구 — `strategy-status-card.tsx:358` 의 「연결이 끊겨 … 보내지 못했어요」 계열과
 * 같은 어조다. 두 화면이 같은 사건을 다른 말로 하면 사용자는 다른 사건으로 읽는다.
 * 폼 맨 위 `lc-submit-error` 는 이제 **스위치·체크 전송 실패 전용**이다(값 전송 실패는
 * 행·시트·말풍선이 말한다 — UI-SPEC 레이아웃 계약).
 */
const SEND_FAILED_TEXT = {
  gate: '연결이 끊겨 켜기/끄기를 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.',
} as const;

/** 접이식 그룹 카드 slot(Phase 24 ⑤ · Phase 27 D-01 자동매도). */
type FoldSlot = 'pre-buy' | 'extra-buy' | 'post-buy' | 'auto-sell';
const FOLD_SLOTS: ReadonlySet<string> = new Set<FoldSlot>(['pre-buy', 'extra-buy', 'post-buy', 'auto-sell']);
const isFoldSlot = (slot: string): slot is FoldSlot => FOLD_SLOTS.has(slot);
/** 매수 쪽 카드 — 시트 「감시 중」 안내를 게이트 에코로 판정한다(D-05 · UI-SPEC §11 끝). */
const BUY_SIDE_SLOTS: ReadonlySet<string> = new Set(['buy', 'pre-buy', 'extra-buy', 'post-buy']);
/** 후매수 소진 안내(UI-SPEC §5 · 스케치 원문). */
const POST_BUY_EXHAUSTED_TEXT = '소진 — 「최대」에 횟수를 넣고 다시 켜면 그 값부터 세요';

export interface LimitChaserFormProps {
  /** 12자 ISIN — 상단 종목 카드(A1)가 고른 값. */
  isin: string;
  /** 주문 계좌. 소유권 대조는 relay 가 한다(`session.allowedAccounts`, T-16-01). */
  accountNo: string;
  /*
    ★ `market` prop 이 **없다** (WR-03 / D-28). 시장 구분은 relay 가 `SymbolMap` 으로 ISIN 을
      풀어 채운다 — 브라우저는 그 값을 만들지도, 싣지도 않는다. 예전에는 상위가
      `row.market === 'KOSDAQ' ? 'Q' : 'K'` 로 **추측**해 내려보냈고 KONEX·`null` 이 조용히
      KOSPI 가 됐다. 표시가 필요해지더라도 이 폼이 **와이어로 내보내지 않는다**는 사실은
      바뀌지 않는다.
  */
  exchange: RelayExchange;
  /**
   * 서버 에코 1건. `null`/`undefined` 면 미등록(신규) 전략이다 — 값·체크 확정은 로컬만(A-P1).
   * **이 prop 이 바뀌면 폼이 서버값으로 덮인다**(D-11).
   */
  server?: RelayLimitChaser | null;
  /** 상한가 — 신규 폼에서 가격 5칸을 **1회만** 시딩한다. */
  upperLimit?: number;
  /**
   * 호가 프레임 상장주식수(`RelayQuote.ls`) — D-17 시딩 원천, 0 = 모름. 새 전략(서버 전략 없음)이면 폼당 1회
   * 수량 5칸을 채운다(`seedListSharesDefaults` · 사용자가 이 폼에서 손댄 칸 제외 · 제출 없음).
   */
  listShares?: number;
  /** 세션 미준비 등 — 폼 전체 비활성. */
  disabled?: boolean;
  /**
   * 카드 제목 옆 상태 문구(UI-SPEC §11 — 「감시 중」「보유중」「소진」「포기」「꺼짐」 …). 매핑은 상위
   * (`card-body.tsx` `cardGroupStatusOf`) 소관이다. 없는 키는 그 자리에 아무것도 그리지 않는다.
   */
  groupStatus?: Partial<Record<LcStatusKey, string>>;
  /**
   * 폰 밴드 pane 탭 — **제어형** (18-10). 넘기면 이 값이 보이는 pane 을 정하고, 넘기지 않으면
   * 폼이 자체 상태로 든다(옛 화면 경로).
   */
  tab?: 'buy' | 'sell';
  /**
   * 폼 자신의 「매수 | 매도」 탭 줄을 그리지 않는다 (18-10). 카드 본문은 「매수 | 매도 | 수동」
   * 3탭을 **바깥에서** 그리므로(`ManualOrderEntry`), 이 줄이 함께 서면 탭 줄이 두 줄이 된다.
   */
  hideTabs?: boolean;
  /**
   * 서버가 이 전략에 **답한 횟수** — 값이 아니라 **바뀌었다는 사실**만 쓴다.
   *
   * 필드 확정 훅의 **답 신호**다(거부 판정 · 대기열 꺼내기) — 폼 맨 위 실패 문구도 이 신호로 접는다.
   * `server` prop 만으로는 부족하다: 답이 왔는데도 `server` 가 그대로인 경우가 둘 있고, 그때 옛
   * 「수정」 버튼은 `반영 중…` 으로 **영구히 잠겼다** (debug `lc-unacked-stuck-new-route`):
   *   ① 미등록 키의 철거 에코 — `crud:"D"` 는 목록에 담기지 않아 `server` 가 안 바뀐다
   *   ② 서버 거부 — 60 에코 자체가 오지 않는다(`Gateway.cpp` 의 거부 갈래)
   * 판정은 상위가 소유한다(카드 상태 훅 `acceptAnswer` · `card/strategy-card.tsx`) — 상태줄 「미반영」을
   * 거두는 것과 **같은 신호**여야 두 표시가 서로 다른 말을 하지 않는다.
   */
  serverAnswerSeq?: number;
  /**
   * 이 전략의 `lc.set` **거부 통지를 접수한 횟수**(카드 `rejectSeq`) — 바뀌었다는 사실만 쓴다. 거부 통지는
   * `serverAnswerSeq` 도 함께 올린다. 필드 확정 훅이 이 신호로 부분 거부의 같은 제출 에코를 기다려 판정한다
   * (24-REVIEW-R3 R3-WR-01 · `LC_REJECT_ECHO_GRACE_MS`). 기본 0.
   */
  serverRejectSeq?: number;
  /**
   * `lc.set` 을 **보낸 직후** 통지 (16-13).
   *
   * ★ 상위가 이걸 알아야 하는 이유는 두 가지이고 둘 다 오해를 막는 장치다:
   *   ① **3초 무응답 판정** — 보낸 시각을 모르면 「미반영」을 셀 수 없다. 그래도 **자동
   *      재전송은 하지 않는다**(T-16-10): 재전송은 사용자가 누르지 않은 두 번째 등록이다.
   *   ② **에코의 출처** — 내가 보낸 요청의 에코와 다른 단말의 변경을 구분하지 못하면
   *      로그 전이 문장(D-01/D-02 동반 · 서버 접힘 사유)을 내 제출에 귀속할 수 없다.
   * `meta.cause` = 보낸 사유(D-02 후반 서버 접힘 자동 끔 = `'serverFold'`) — 카드가 에코 로그 귀속에 쓴다(24-05).
   * 사유 없는 전송은 인자 하나로 부른다.
   */
  onSent?: (cfg: RelayLimitChaserInput, meta?: LcCommitMeta) => void;
  /**
   * 카드 3초 무응답 — 필드 확정 실패 판정 입력, UI-SPEC A10.
   *
   * 카드 상태 훅의 `unacked`(상태줄 「미반영」)를 그대로 받는다. 폼이 자기 타이머를 따로 두면
   * 두 표시가 서로 다른 말을 한다(RESEARCH Don't Hand-Roll). 기본 false.
   */
  unacked?: boolean;
  /**
   * 현재 체결가 — 20-03 시트 칩 『현재가』 원천. 없으면 0 이다.
   * (20-01 은 받기만 한다 — 소비처는 20-03 의 키패드 시트다.)
   */
  currentPrice?: number;
  /**
   * 호가 단위 잠금 강도(D-15 · D-15a) — 종목 마스터 분류(`useTickRule`, 카드 본문이 넘긴다). 미지정 = 주식
   * (호가 단위 위반 잠금). `etp`·`unknown` 이면 원 단위 시트·인라인이 호가 단위 위반을 **경고만** 한다.
   */
  tickRule?: TickRule;
  /**
   * 호가 매수1호가(`RelayQuote.bp[0]`) — D-36 판정 입력. 호가 미수신이면 0(기본) — 0 이면 D-36 은 허용이다
   * (상한가로 치환하지 않는다 · D-20).
   */
  bestBid?: number;
  /** 호가 매수1잔량(`RelayQuote.bq[0]`) — D-36 판정 입력. 미수신이면 0 = 허용(하한 미만 · 서버 「모름」 규칙이 백스톱). */
  bestBidQty?: number;
  /**
   * 클라 합성 전략 로그 한 줄 통로(D-36 — 카드 `pushClientLog`). 제출이 없어 에코가 말해 줄 수 없는 사건만 쓴다.
   * 토스트 · 다이얼로그를 쓰지 않는 이유는 파일 상단 ⑥.
   */
  onClientLog?: (text: string, level: 'info' | 'error') => void;
  /**
   * 41(바로시작 · 중지) 응답 대기 action — 카드 훅 `autoSellPending`(Phase 27 D-08). 대기 중이면 두 버튼이 잠기고,
   * 자동매도 그룹의 스위치 · 값 · 방법 행 확정도 막힌다(상호 배제 — 41 즉답 에코가 그 확정의 답으로 섞이지 않게).
   * 다른 그룹은 막지 않는다. 기본 `null`.
   */
  autoSellPending?: AutoSellAction | null;
  /**
   * 자동매도 바로시작 · 중지 → 카드 훅 `onAutoSellCommand`(41 전송 · 대기 · 가드). 없으면 버튼 행을 그리지 않는다
   * (옛 경로 · 카드 밖 폼).
   */
  onAutoSellCommand?: (action: AutoSellAction) => void;
  className?: string;
}

export function LimitChaserForm({
  isin,
  accountNo,
  exchange,
  server = null,
  upperLimit,
  listShares = 0,
  disabled = false,
  groupStatus,
  tab: controlledTab,
  hideTabs = false,
  serverAnswerSeq = 0,
  serverRejectSeq = 0,
  onSent,
  unacked = false,
  currentPrice = 0,
  tickRule,
  bestBid = 0,
  bestBidQty = 0,
  onClientLog,
  autoSellPending = null,
  onAutoSellCommand,
  className,
}: LimitChaserFormProps) {
  const { send, userSettings } = useRelayContext();
  const [ownTab, setTab] = useState<'buy' | 'sell'>('buy');
  // 제어형이면 바깥 값이 이긴다(카드 본문의 3탭) — 자체 상태는 옛 화면 경로에서만 쓰인다.
  const tab = controlledTab ?? ownTab;

  const [form, setForm] = useState<LimitChaserFormValues>(() => {
    if (server != null) return formFromServer(server, defaultLimitChaserForm());
    // 새 전략 — D-04 상수 위에 84 사용자 기본설정 9칸(D-11 · 미수신이면 빈 패치 · lc 범위 밖 칸은 상수 그대로).
    const base = { ...defaultLimitChaserForm(), ...seedFromUserSettings(userSettings) };
    // 상한가 5칸 시딩은 **신규 폼 1회**다(`SeedFromUpperLimitOnce`). 매 렌더 걸면 에코가
    // 덮은 값을 다시 상한가로 되돌린다.
    return upperLimit != null && upperLimit > 0 ? { ...base, ...seedFromUpperLimit(upperLimit) } : base;
  });

  const formRef = useRef(form);
  formRef.current = form;

  /*
    D-11 · D-27 — 에코가 도착하면 **서버가 이긴다.** 목록 값은 에코로 덮인다.
    편집 중인 버퍼(인라인 편집기 · 시트)는 폼 값이 아니라 **편집기의 것**이라 여기서 덮이지 않는다(E4).
    ★ 덮어도 따로 알리지 않는다 — 값은 화면에 · 전이는 로그 「서버 반영 완료」에 이미 보인다(다른 단말 배너 제거 · 2026-09-29).
  */
  useEffect(() => {
    if (server == null) return;
    setForm(formFromServer(server, formRef.current));
  }, [server]);

  /**
   * 폼 값 → 와이어 `cfg`(필드 목록의 정본 = shared `RelayLimitChaserInput`). **조립 지점은 여기 하나다.**
   *
   * `crud` 는 `crudOf(values)` 다 — 값·체크 확정 경로에서도 클라가 `"C"` 를 박지 않는다.
   * 매수취소 「체결」 체크는 스위치가 아니라 **체크**인데, 그때 매수·매도·취소잔량이
   * 이미 꺼져 있으면 그 확정이 곧 삭제다. `"C"` 를 박으면 서버가 어차피 `"D"` 로
   * 정규화하므로 화면과 와이어만 갈린다.
   */
  const buildCfg = useCallback(
    (values: LimitChaserFormValues): RelayLimitChaserInput => ({
      ...values,
      isin,
      accountNo,
      // ★ `market` 을 싣지 않는다 (WR-03 / D-28) — relay 가 `symbols.lookup(isin)` 으로 푼다.
      //   여기서 추측해 넣으면 그 추측이 **반복 발주 설정**이 된다. 스키마도 이 키를 떨어뜨린다.
      exchange,
      crud: crudOf(values),
      // 발주 정본. **역산 금지** — 산출식은 `lib/limit-chaser.ts` 한 곳뿐이다.
      buyOrderQty: buyOrderQtyFromAmount(values.buyOrderAmount, values.buyOrderPrice),
      // Phase 24 — 추가매수 · 후매수도 같은 함수 · 같은 공통 매수가격(금액→수량 3벌 = 호출 3곳).
      extraBuyOrderQty: buyOrderQtyFromAmount(values.extraBuyOrderAmount, values.buyOrderPrice),
      postBuyOrderQty: buyOrderQtyFromAmount(values.postBuyOrderAmount, values.buyOrderPrice),
      // 클라 고정 3 — 폼에 노출하지 않는다(파일 상단 ⑤).
      sweepRecalcEnabled: true,
      sweepMinCount: 0,
      sweepMinRate: 0,
    }),
    [isin, accountNo, exchange],
  );

  const sentNotifyRef = useRef(onSent);
  sentNotifyRef.current = onSent;

  /*
    ★ Phase 20 D-04 — **한 필드 확정 = 전략 1회 전송**(`useLcFieldCommit`). 시트·인라인·체크·
      스위치가 이 훅 하나를 공유한다. cfg 조립은 위 `buildCfg` 하나를 그대로 넘긴다(복제 금지).
      기준값은 폼 로컬 값이 아니라 서버 동기값이고(T-20-03), 값 필드는 낙관 반영하지 않는다(D-06).
  */
  const lc = useLcFieldCommit({
    server,
    formRef,
    setForm,
    buildCfg,
    send,
    // 사유(meta)는 받은 그대로 넘긴다 — 없으면 인자 하나다(훅 ⑫).
    onSent: (...args) => sentNotifyRef.current?.(...args),
    serverAnswerSeq,
    serverRejectSeq,
    disabled,
    unacked,
    armBlockOf,
  });
  /** 인라인 편집 중인 필드 — 한 번에 한 행이다(마우스 기기 · D-14). */
  const [editingField, setEditingField] = useState<LcNumField | null>(null);
  /**
   * D-14b 한 번 클릭 전환 — 편집 중 다른 값 행을 누르면 pointerdown(캡처)에서 그 행을 기록하고,
   * 편집기 포커스 이탈이 저장/취소를 마친 직후 그 행이 편집을 **이어받는다**(RESEARCH §Q6 ·
   * 목업 `index.html:513-519`). React 에서는 행 높이가 불변이라 click 이 살아남는 경우가 많지만,
   * blur 저장이 만드는 재렌더(편집 행 `<div>` → `<button>`)가 click 대상을 떼어낼 수 있어 이 기록이 보험이다.
   * 행 click 의 `activateRow` 는 멱등이라 두 경로가 함께 돌아도 무해하다.
   */
  const nextEditRef = useRef<LcNumField | null>(null);
  /** 편집 종료 — 기록된 다음 행이 있으면 그 행이 이어받는다(없으면 편집 종료). */
  const endEdit = useCallback(() => {
    const next = nextEditRef.current;
    nextEditRef.current = null;
    setEditingField(next);
  }, []);
  /*
    ★ D-12 — 편집 방식은 입력 장치로 가른다. 주 포인터가 터치면 행을 눌러 키패드 시트를 연다.
      시트는 폼 끝에 **한 개만** 두고 `sheetField` 가 무엇을 편집하는지 정한다. 닫히면 포커스는
      연 행으로 돌아간다(`sheetReturnRef`).
  */
  const editMode = useEditMode();
  const [sheetField, setSheetField] = useState<LcNumField | null>(null);
  const sheetReturnRef = useRef<HTMLElement | null>(null);
  // 내 확정이 에코로 성공하면 그 행의 편집·시트를 닫는다(성공 판정은 훅 — 값 비교뿐이다).
  const { successSeq, lastSuccessField, sentSuccessSeq, lastSentSuccessField, commit: commitField, clearFailure } = lc;

  /*
    ★ D-17 상장주식수 시딩 — 새 전략(서버 전략 없음)에서 **폼당 1회** 수량 5칸을 채운다(WinForms `SeedListSharesDefaults`).
      ① 서버에 그 키의 전략이 있으면 시딩하지 않는다(에코가 이긴다 · 가드 소진).
      ② `listShares === 0`(모름)이면 아무것도 하지 않아 가드가 남는다 — 뒤에 오는 프레임이 채운다(그동안 폴백 유지).
      ③ 사용자가 이 폼에서 확정한 값 칸(`touchedRef` — 인라인 · 시트 · 3택 확정 경로)은 덮지 않는다.
         3택(자동매도 방법 · Phase 27)도 같은 집합에 든다 — 27-07 84 시딩이 「손대지 않은 칸만」 을 같은 집합으로 판정한다.
      ④ **제출 · 로그(`onClientLog`) · 강조를 만들지 않는다** — `setForm` 한 번뿐이고, 값은 첫 등록 cfg 에 실린다.
  */
  const touchedRef = useRef(new Set<LcNumField | 'autoSellMethod'>());
  const seededRef = useRef(false);
  /** 사람이 이 폼에서 값을 확정했다 — 보내지 못한 확정(막힘 · 끊김)은 값이 바뀌지 않았으므로 세지 않는다. */
  const markTouched = useCallback((field: LcNumField | 'autoSellMethod', outcome: string) => {
    if (outcome !== 'blocked' && outcome !== 'disconnected') touchedRef.current.add(field);
  }, []);
  useEffect(() => {
    if (seededRef.current) return;
    const seed = seedListSharesDefaults(listShares);
    if (seed === null) return; // ② 모른다 — 가드를 남긴다.
    seededRef.current = true;
    if (server != null) return; // ① 서버 값이 이긴다.
    const patch: Partial<LimitChaserFormValues> = {};
    for (const [field, value] of Object.entries(seed) as [keyof typeof seed, number][]) {
      if (!touchedRef.current.has(field)) patch[field] = value; // ③
    }
    if (Object.keys(patch).length > 0) setForm((prev) => ({ ...prev, ...patch }));
  }, [listShares, server]);

  /*
    ★ D-11 84 사용자 기본설정 재시딩(27-07) — 84 가 열려 있는 **미등록** 폼에 늦게(또는 브로드캐스트로 다시) 오면
      손대지 않은 칸만 새 값으로 바꾼다. 초기값은 위 `useState` 가 이미 같은 함수로 채웠다.
      ① 서버 에코가 한 번이라도 온 폼은 시딩하지 않는다(에코가 이긴다 — 에코가 사라져도 그 값은 등록된 전략의 값이다).
      ③ `touchedRef`(값 · 3택 방법)에 든 칸은 덮지 않는다.
      ④ 전송 · 로그(`onClientLog`) · 강조를 만들지 않는다 — `setForm` 한 번뿐이고 값은 첫 등록 cfg 에 실린다(D-17 ④ 동형).
      ★ 같은 값이면 `setForm` 을 부르지 않는다 — 마운트 직후 같은 84 로 도는 첫 실행은 no-op 이다(불필요한 렌더 0).
  */
  const hadServerRef = useRef(server != null);
  useEffect(() => {
    if (server != null) hadServerRef.current = true;
    if (hadServerRef.current) return; // ①
    const seed = seedFromUserSettings(userSettings);
    const cur = formRef.current;
    const patch: Partial<LimitChaserFormValues> = {};
    for (const [field, value] of Object.entries(seed) as [keyof typeof seed, number][]) {
      if (!touchedRef.current.has(field) && cur[field] !== value) patch[field] = value; // ③
    }
    if (Object.keys(patch).length > 0) setForm((prev) => ({ ...prev, ...patch }));
  }, [userSettings, server]);
  useEffect(() => {
    if (successSeq === 0 || lastSuccessField === null) return;
    setEditingField((cur) => (cur === lastSuccessField ? null : cur));
    setSheetField((cur) => (cur === lastSuccessField ? null : cur));
  }, [successSeq, lastSuccessField]);
  /*
    보낸 성공으로도 닫는다(24-REVIEW-R3 R3-WR-02) — 일반 성공 신호는 한 칸이라 같은 판정 실행의 늦은 에코 성공이 in-flight
    값 확정의 성공을 덮을 수 있다. 보낸 성공 신호는 덮이지 않는다. 닫기는 멱등이다(위 이펙트와 겹쳐도 같은 결과).
  */
  useEffect(() => {
    if (sentSuccessSeq === 0 || lastSentSuccessField === null) return;
    setEditingField((cur) => (cur === lastSentSuccessField ? null : cur));
    setSheetField((cur) => (cur === lastSentSuccessField ? null : cur));
  }, [sentSuccessSeq, lastSentSuccessField]);

  /**
   * 인라인 저장 — Enter 는 결과를 편집기 안에서 말하고(반영 중 잠금 · 실패 말풍선),
   * 포커스 이탈은 편집을 끝내고 결과를 **행**이 말한다(`aria-busy` · 실패 링). UI-SPEC §6.
   * Tab 은 저장만 하고 다음 행은 `handleInlineNavigate` 가 고른다(편집기가 저장 → 이동 순으로 부른다).
   * ★ 앞 행이 반영 중이어도 다음 행 편집은 막지 않는다 — 확정 전송만 상태 기계가 직렬화한다
   *   (D-14b 가 UI-SPEC E4 loading 의 「다른 행 클릭 무시」보다 우선 · RESEARCH §Q6).
   */
  const handleInlineSave = useCallback(
    (field: LcNumField, value: number, via: InlineSaveVia) => {
      const outcome = commitField(field, value, 'value');
      markTouched(field, outcome);
      if (via === 'blur') endEdit();
      else if (via === 'enter' && (outcome === 'noop' || outcome === 'local')) endEdit();
    },
    [commitField, endEdit, markTouched],
  );
  const handleInlineCancel = useCallback(
    (field: LcNumField) => {
      clearFailure(field);
      endEdit();
    },
    [clearFailure, endEdit],
  );
  /**
   * Tab / Shift+Tab (D-14 · 가정 A5) — **같은 그룹**의 다음/이전 값 행. 값 없는 체크 행 ·
   * 기준선 행은 `lcNavigableRows` 가 이미 뺐다. 그룹 끝이면 편집 종료 — 다른 그룹으로 넘어가지 않는다.
   */
  const handleInlineNavigate = useCallback((field: LcNumField, dir: 'next' | 'prev') => {
    nextEditRef.current = null;
    const slot = lcRowByField(field)?.group.slot;
    const rows = slot === undefined ? [] : lcNavigableRows(slot);
    const i = rows.findIndex((r) => r.field === field);
    const to = i < 0 ? undefined : rows[dir === 'next' ? i + 1 : i - 1];
    setEditingField(to?.field ?? null);
  }, []);

  /**
   * 값 행 누르기 — **모든 값 행이 이 한 경로**다. 터치 기기면 시트, 아니면 그 자리 인라인 편집(D-12).
   * 반영 중인 행은 열지 않는다. 체크 값 행의 값 버튼도 체크 상태와 무관하게 이 경로다(D-22).
   */
  const activateRow = useCallback(
    (field: LcNumField, el: HTMLElement) => {
      if (disabled || lc.inflightField === field) return;
      nextEditRef.current = null;
      sheetReturnRef.current = el;
      if (editMode === 'sheet') setSheetField(field);
      else setEditingField(field);
    },
    [disabled, editMode, lc.inflightField],
  );

  /**
   * 시트 「{필드명} 적용」 — 전송은 훅(`commit`) 하나다. 성공 닫기는 위 `successSeq` 이펙트가 하고
   * (에코 값 일치 · T-20-04), 보낼 것이 없거나(`noop`) 미등록 로컬 반영(`local`)이면 바로 닫는다.
   * 거부·무응답·끊김·무장 불가면 시트가 남아 이유를 말한다(D-06 · 자동 재시도 없음).
   */
  const handleSheetConfirm = useCallback(
    (field: LcNumField, value: number) => {
      const outcome = commitField(field, value, 'value');
      markTouched(field, outcome);
      if (outcome === 'noop' || outcome === 'local') setSheetField(null);
    },
    [commitField, markTouched],
  );
  /**
   * 3택 행 선택(Phase 27 D-02 — 자동매도 방법) — 값 확정과 **같은 경로**다(`commit(field, v, 'value')` = `lc.set` 1회 ·
   * 낙관 반영 없음 · 미등록이면 로컬 반영). 폰 시트는 `ChoiceRow` 가 스스로 닫는다.
   */
  const handleChoiceSelect = useCallback(
    (field: 'autoSellMethod', value: number) => {
      const outcome = commitField(field, value, 'value');
      markTouched(field, outcome);
    },
    [commitField, markTouched],
  );
  const handleSheetClose = useCallback(() => {
    if (sheetField !== null) clearFailure(sheetField);
    setSheetField(null);
  }, [clearFailure, sheetField]);

  /*
    ★ **정적 무장 판정** (WR-06 · R7) — 스위치 `disabled` 와 열 아래 패널은 누르기 전에 알 수 있는 사유
      (시세 미수신 · 매도 매수잔량 0)만 본다. 산출식은 모듈 수준 `canArmStaticOf` **하나**다. 그룹 수량 0 은
      누르는 순간의 사전 검증 · 전송 직전 `armBlockOf`(= `canArmOf`) 몫이다.
    ★ **`useMemo` 다** (GC-IN-01) — 객체 리터럴이면 매 렌더 새 참조라 아래 `gateBlocked` 의 `useCallback` 이
      아무것도 메모하지 않는다. 의존성은 이미 계산이 끝난 두 boolean 이면 충분하다.
  */
  const { buyEnabled: canArmBuyPrice, sellEnabled: canArmSell } = canArmStaticOf(form);
  /** WR-02 — 구서버 에코면 켜는 방향 전부가 누르기 전에 막힌다(스위치 `disabled` · 열 패널 한 줄). 판별은 lib 하나. */
  const legacy = isLegacyBuySchema(server);
  const canArm: Record<GateKey, boolean> = useMemo(
    () => ({
      buyEnabled: canArmBuyPrice,
      preBuyEnabled: canArmBuyPrice,
      extraBuyEnabled: canArmBuyPrice,
      postBuyEnabled: canArmBuyPrice,
      sellEnabled: canArmSell,
    }),
    [canArmBuyPrice, canArmSell],
  );

  /**
   * 스위치 1개의 **판정 지점 하나**. 렌더의 `disabled` 와 전송 직전 가드가 이 함수를 함께
   * 읽는다 — 두 곳에 따로 적으면 한쪽만 고쳐지고, 그때 뚫리는 것이 「비활성인데 눌리면
   * 나가는 무장」이다 (`vi-order-list.tsx` 의 `isConfirmable` 과 같은 규율이다).
   *
   * ★ **끄는 것은 언제나 허용한다** (`next === false` 면 무장 조건을 보지 않는다).
   *   무장 해제를 막으면 그게 더 위험하다 — 이미 켜진 게이트를 못 끄는 화면은 사용자의
   *   자산을 인질로 잡는다 (T-16-44).
   */
  const gateBlocked = useCallback(
    (key: GateKey, next: boolean): boolean => {
      if (disabled) return true;
      if (!next) return false; // 끄는 방향은 구서버여도 막지 않는다(T-16-44 · 24-12 `lcLegacyBlockOf` 가 순서만 본다)
      return legacy || !canArm[key];
    },
    [disabled, canArm, legacy],
  );

  /**
   * 스위치 · 체크 — **확인 없이 즉시** 한 필드 전송(Phase 16 D-05 · D-04).
   *
   * ★ 결과 문구는 반환값이 아니라 **훅의 실패 상태에서 파생**한다(아래 `submitError` · 20-REVIEW WR-03) —
   *   대기열에서 꺼낼 때(`drain`) 막히거나 끊긴 토글도 같은 자리가 말해야 하기 때문이다.
   * ★ 거부·무응답은 훅이 컨트롤을 서버 값으로 되돌리고, 그 자리 말풍선이 말한다(`toggleFailureTextOf`).
   */
  const commitToggle = useCallback(
    <K extends LcFieldKey>(field: K, value: LimitChaserFormValues[K]) => {
      commitField(field, value, 'toggle');
    },
    [commitField],
  );

  /*
    폼 맨 위 한 줄 = 스위치·체크의 **보내지 못한 실패**(끊김 · 무장 불가 · 범위 밖)에서 파생한다
    (20-REVIEW WR-03). 옛 판은 `commitToggle` 이 직접 받은 반환값으로만 세워서, 대기열에서 꺼낼 때 막힌
    토글은 스위치만 조용히 되돌아갔다(무로그 fail-safe · 파일 상단 ⑥ 위반).
    ★ 답이 도착하면 그때까지의 문구는 접는다 — 답이 왔다는 것은 그 사건이 이미 지나갔다는 뜻이다. 실패 객체의
      **정체성**으로 접으므로, 같은 답 렌더에서 새로 생긴 실패(꺼내다 막힌 토글)는 접히지 않고 선다.
    ★ 신호가 **둘**인 이유는 `serverAnswerSeq` prop 주석에 있다 — `server` 변화만 보면
      「미등록 키 철거 에코」와 「거부」 두 경우를 놓친다.
  */
  const failuresSeenRef = useRef(lc.failures);
  failuresSeenRef.current = lc.failures;
  const [dismissedFailures, setDismissedFailures] = useState<ReadonlySet<LcCommitFailure>>(() => new Set());
  useEffect(() => {
    setDismissedFailures(new Set(Object.values(failuresSeenRef.current)));
  }, [server, serverAnswerSeq]);
  const submitError = toggleSubmitErrorOf(lc.failures, dismissedFailures);

  /** 그 필드의 확정이 나가 있거나 대기열에 서 있는가. */
  const isBusy = (field: LcFieldKey): boolean =>
    lc.inflightField === field || lc.queuedFields.includes(field);
  /** 토글 종류의 거부·무응답 말풍선 — 끊김·무장 불가는 폼 맨 위 한 줄이 말한다(A-P4). */
  const toggleFailureTextOf = (field: LcFieldKey): string | null => {
    const f = lc.failures[field];
    return f !== undefined && (f.reason === 'rejected' || f.reason === 'timeout') ? LC_COMMIT_TEXT.failed : null;
  };
  /** 그룹 상태 문구 — 매핑은 상위(`card-body.tsx` `cardGroupStatusOf`) 소관이다. */
  const statusOf = (key: LcStatusKey | undefined): string | undefined =>
    key === undefined ? undefined : groupStatus?.[key];
  /**
   * 스위치를 지금 누를 수 없는가 — 정적 무장 판정(WR-06 · 시세 미수신)을 지나는 것은 마스터 · 세 그룹 · 매도다.
   * 매수취소 · 자동매도(Phase 27 — 시세 무관 · 발주 판정은 서버)는 세션 미준비와 구서버 에코의 켜는 방향(WR-02)만
   * 본다. 그룹 수량 0 · 그룹 고유 검증은 `disabled` 가 아니라 누르는 순간의 사전 검증이다(R7). 자동매도 범위(비율 ·
   * 방법)는 전송 직전 `lcRangeIssue` 가 막는다(Pitfall 5 — 폼 맨 위 한 줄).
   */
  const gateDisabled = (gate: LcGate): boolean =>
    gate === 'autoSellEnabled' && autoSellPending !== null
      ? true
      : gate === 'cancelQtyEnabled' || gate === 'autoSellEnabled'
        ? disabled || (legacy && !form[gate])
        : gateBlocked(gate, !form[gate]);
  /**
   * 41 대기 중 그룹 확정 잠금(Phase 27 재량 — RESEARCH Pitfall 6 상호 배제). 자동매도 그룹만 — 다른 그룹은 막지 않는다
   * (D-07 「다른 그룹 무관」). 대기는 ≤3초다(카드 41 전용 타이머).
   */
  const autoSellLocked = (group: LcGroupSpec): boolean => autoSellPending !== null && group.slot === 'auto-sell';
  /**
   * 자동매도 바로시작 · 중지 활성(D-05 · D-07 · D-09) — 판정 입력은 폼 `server` prop = 카드 훅의 같은 `server` 다
   * (카드 전송 가드와 한 입력). 바로시작만 자동매도 그룹 확정(in-flight · 대기열 · 실패)이 깨끗해야 한다.
   */
  const autoSellButtons = autoSellButtonsOf(server);
  const autoSellIdle = autoSellPending === null && !disabled;
  const autoSellStartEnabled =
    autoSellIdle &&
    autoSellButtons.start &&
    !autoSellStartBlocked({ inflightField: lc.inflightField, queuedFields: lc.queuedFields, failures: lc.failures });
  const autoSellStopEnabled = autoSellIdle && autoSellButtons.stop;

  /*
    그룹 켜기 사전 검증 줄(UI-SPEC §7) — 카드마다 한 자리지만 폼 전체에 **늘 한 줄**이다(누른 카드의 것).
    ★ 사라지는 때: ① 원인 값이 고쳐져 띄운 문구의 검증이 통과할 때(값 확정 에코 뒤 — 미등록이면 로컬 반영 뒤)
      ② 그 그룹이 켜진 에코가 올 때(이 단말 · 다른 단말 무관) ③ 다른 사유로 다시 누르면 그 문구로 교체.
    ★ 이 정리 이펙트는 **제출을 만들지 않는다** — 상태 한 칸만 비운다.
    ★ 사전 검증 실패는 자동 펼침 트리거가 아니다(T-24-19 — 줄은 제목줄 바로 아래라 접혀 있어도 보인다).
  */
  const [precheck, setPrecheck] = useState<{ slot: PrecheckSlot; gate: BuyGroupGate; text: string } | null>(null);
  /** 최신 서버 에코 — 이벤트 핸들러 · 다음 틱 콜백이 읽는다(사전 검증 기준값 · D-02 후반 재확인). */
  const serverRef = useRef(server);
  serverRef.current = server;
  const bestBidRef = useRef(bestBid);
  bestBidRef.current = bestBid;
  const bestBidQtyRef = useRef(bestBidQty);
  bestBidQtyRef.current = bestBidQty;
  const clientLogRef = useRef(onClientLog);
  clientLogRef.current = onClientLog;
  const upperLimitRef = useRef(upperLimit ?? 0);
  upperLimitRef.current = upperLimit ?? 0;
  const successSeqRef = useRef(successSeq);
  successSeqRef.current = successSeq;
  /**
   * 자동 체크(D-06 · D-35) **마지막 계산 결과** — 켜는 확정이 넘긴 동반 함수가 판정 시점마다 다시 적는다(WR-03).
   * 대기열에서 꺼내는 순간의 계산이 마지막이므로 로그 한 줄은 실제로 나간 cfg 와 같은 판정을 말한다.
   * ★ 그룹별 슬롯 — 한 그룹의 핸들러는 자기 슬롯만 만진다(GC-WR-04). 선매수 켬이 in-flight 인 동안 추가매수 ·
   *   후매수를 켜도 선매수 슬롯은 그대로다.
   */
  const autoCheckRef = useRef<Partial<Record<AutoCheckGate, GroupAutoCheckResult>>>({});
  /**
   * 자동 체크 로그 한 줄 — 그 제출의 **성공 에코를 기다린다**(D-06 · UI-SPEC 「전송 성공 에코 뒤」). 줄은 성공 뒤
   * 그 그룹의 `autoCheckRef` 슬롯으로 만든다(보낸 순간이 아니라 실제 전송 판정). 키 = 켠 그룹 · 값 = 누른 순간의
   * 성공 카운터(seqAtSend) — 이전 성공(같은 그룹 필드 포함)을 이 제출의 성공으로 읽지 않는다.
   * ★ 그룹별 슬롯 — 한 그룹의 핸들러는 자기 슬롯만 만진다(GC-WR-04).
   */
  const pendingAutoCheckRef = useRef<Partial<Record<AutoCheckGate, number>>>({});
  useEffect(() => {
    setPrecheck((cur) => {
      if (cur === null) return cur;
      if (server?.[cur.gate] === true) return null;
      const still = groupPrechecksOf(cur.gate, lcBaseValues(server, form)).includes(cur.text);
      return still ? cur : null;
    });
  }, [server, form]);

  /**
   * 그룹 스위치(선 · 추가 · 후매수) — **사람의 스위치 핸들러에서만** 부른다(D-01 · D-02 전반 · UI-SPEC 상호작용 계약).
   *
   * - 켜는 방향: 마스터가 꺼져 있으면 같은 `lc.set` 에 마스터도 켠다(D-01 — 추가 확인창 없음). 실패하면 훅이
   *   두 스위치를 함께 서버 값으로 되돌린다.
   * - 끄는 방향: 마스터가 켜져 있고 나머지 두 그룹이 꺼져 있으면 같은 `lc.set` 에 마스터도 끈다(D-02 전반).
   *   「마지막」은 두 단계다(GC-WR-03) — 사람이 **본** 마지막(누른 순간 화면 · 낙관 표시 포함) ∧ 판정 시점(즉시 ·
   *   대기열에서 꺼내는 순간) 서버 값에서도 여전히 마지막. 대기 중 다른 단말이 켠 그룹을 조용히 해제하지 않는다
   *   (WR-03 과 같은 꺼낼 때 계산). 매도 · 취소 게이트까지 전부 꺼져 있으면 그 제출이 곧 삭제다(`crudOf` = `D` ·
   *   기존 규약 · 확인창 없음). 다른 그룹이 켜져 있으면 그 그룹만 끈다.
   * ★ 에코 경로(서버 에코 · 재접속 · 다른 단말)는 이 함수를 부르지 않는다 — 에코로 생기는 제출은 D-02 후반
   *   `dropMasterAfterServerFold` 한 곳뿐이다.
   */
  const commitGroupSwitch = useCallback(
    (gate: BuyGroupGate, on: boolean) => {
      const f = formRef.current;
      if (on) {
        // 사전 검증(R7 · UI-SPEC §7) — 낙관 표시 전에 판정한다(스위치는 움직이지 않는다). 전송 0 · 그 카드 한 줄.
        const pressed = lcBaseValues(serverRef.current, f);
        const slot = GROUP_SLOT[gate];
        const failed = groupPrecheckOf(gate, pressed);
        if (failed !== null) {
          setPrecheck({ slot, gate, text: failed });
          return;
        }
        // 통과했다 = 그 카드에 떠 있던 사유는 이제 사실이 아니다.
        setPrecheck((cur) => (cur !== null && cur.slot === slot ? null : cur));
        // D-36(D-16 개정) — 추가매수만 · 매수1호가 == 비교가격(둘 다 > 0) ∧ 매수1잔량 ≥ 최소(0 이면 1)이면 두꺼운 벽에
        //   붙은 상한가로 본다. 제출 없이 로그 원문 한 줄만(사전 검증 줄 · 다이얼로그 · 토스트 · 자동 체크 없음 — 어떤
        //   자동 체크 슬롯도 건드리지 않는다). 얇은 벽 · 잔량 모름(0) · 호가 모름은 허용 — 0 을 상한가로 치환하지 않는다(D-20).
        const upperBlock =
          gate === 'extraBuyEnabled'
            ? lcExtraBuyUpperLimitBlockOf(bestBidRef.current, bestBidQtyRef.current, pressed)
            : null;
        if (upperBlock !== null) {
          clientLogRef.current?.(upperBlock, 'error');
          return;
        }
        /*
          D-06 · D-07 · D-08 · D-35 — **사람이** 선매수 · 추가매수를 켜는 이 자리에서만 매도 · 취소 6체크를 같은 `lc.set`
          에 동반으로 싣는다(확인창 · 토스트 · 매도 탭 이동 · 링크 없음 · 후매수는 대상 아님 — 마스터 동반만). 에코 · 재접속 ·
          다른 단말 변경으로 그 그룹이 ON 이 되는 경로(서버 값 이펙트 · D-02 후반 `dropMasterAfterServerFold`)에서는
          `groupAutoChecksOf` 를 부르지 않는다 — 계산은 이 핸들러가 넘긴 함수 안에서만 돈다. 추가매수 고유 사전 거부(사전
          검증 줄 · D-36)는 위에서 먼저 끝났다 — 거부면 여기까지 오지 않는다. 0 인 매도 가격은 상한가를 알 때만 명시 값으로
          채운다(D-20).
          ★ WR-03 — 동반은 값이 아니라 **판정 시점에 계산하는 함수**다. 훅이 그 확정의 판정 시점(누른 순간 · 대기열에서
            꺼내는 순간)의 서버 동기값(`base`)으로 부른다 — 앞 확정이 in-flight 인 동안 사람이 확정한 매도 가격을 낡은 상한가
            채움이 덮지 않고, 그사이 0 이 된 매도 매수잔량에 `sellEnabled` 를 싣지 않는다(relay 프레임 전체 거부 방지).
            D-01 마스터 동반도 같은 기준이다(전송 시점 서버 값이 이미 켜져 있으면 싣지 않는다).
            사전 검증 · D-36 은 위에서 누르는 순간 판정한다(R7).
          ★ R4-WR-01 (ii) · R5-WR-02 — 꺼내는 순간 계산은 이 흐름에서 무장되지 않은 항목(훅 ⑬ `laid`)을 다시 켜지 않고
            「무장 안 됨」 으로 적는다. 흐름이 빈 뒤의 새 클릭은 평소대로 요청한다.
        */
        const autoGate: AutoCheckGate | null = gate === 'preBuyEnabled' || gate === 'extraBuyEnabled' ? gate : null;
        // 자기 그룹 슬롯만 비운다 — 후매수(autoGate null)는 어떤 슬롯도 건드리지 않는다(GC-WR-04).
        if (autoGate !== null) delete autoCheckRef.current[autoGate];
        const outcome = commitField(gate, true, 'toggle', (base, laid) => {
          const companions: Partial<LimitChaserFormValues> = base.buyEnabled ? {} : { buyEnabled: true };
          if (autoGate === null) return companions;
          const auto = groupAutoChecksOf(autoGate, base, upperLimitRef.current, laid);
          autoCheckRef.current[autoGate] = auto;
          return { ...auto.companions, ...companions };
        });
        if (autoGate === null) return;
        // 로그는 성공 에코 뒤 한 줄 — 나가지 못했으면(막힘 · 끊김) 쓰지 않는다(「보냈다」를 로그로 남기지 않는다).
        //   막힘 · 끊김도 자기 슬롯만 지운다 — 다른 그룹의 대기 줄은 그대로다(GC-WR-04).
        if (outcome === 'sent' || outcome === 'queued') {
          pendingAutoCheckRef.current[autoGate] = successSeqRef.current;
        } else {
          delete pendingAutoCheckRef.current[autoGate];
          delete autoCheckRef.current[autoGate];
        }
        return;
      }
      /*
        D-02 전반 — 두 단계 판정(GC-WR-03). ① 누른 순간 사람이 **본** 화면(`formRef` · 낙관 표시 포함)에서 마스터 ON ∧
        이 그룹이 마지막 켜진 그룹일 때만 동반 함수를 넘긴다(D-02 = 사람이 본 「마지막」 — 화면에 다른 그룹이 켜져
        있었으면 꺼내는 순간 마지막이 돼도 마스터를 끄지 않는다). ② 함수는 판정 시점(즉시 · 대기열에서 꺼내는 순간)의
        서버 동기값(`base`)으로 「여전히 마스터 ON ∧ 다른 두 그룹 OFF」를 다시 확인한다 — 앞 확정이 in-flight 인 동안
        다른 단말 · WinForms 가 켠 그룹을 사람 손 없이 해제하지 않는다(WR-03 과 같은 꺼낼 때 계산). 즉시 경로에는
        in-flight 가 없어 낙관 표시 = 서버 값이라 ② 가 ① 과 같은 답이다(종전 결과 불변).
      */
      const pressedLast = f.buyEnabled && BUY_GROUP_GATES.every((g) => g === gate || !f[g]);
      if (pressedLast) {
        commitField(gate, false, 'toggle', (base) =>
          base.buyEnabled && BUY_GROUP_GATES.every((g) => g === gate || !base[g]) ? { buyEnabled: false } : {},
        );
      } else {
        commitField(gate, false, 'toggle');
      }
    },
    [commitField],
  );

  /**
   * 매수주문(마스터) 스위치 — **사람의 스위치 핸들러에서만** 부른다(quick-260929-vzy D-06).
   *
   * - 끄는 방향: 같은 `lc.set` 에 후매수 ☐자동도 끈다(`postBuyAuto: false`). WinForms `HandleArmToggle` 의
   *   `chk == chkBuyEnabled` 동형이다 — 사람이 매수주문을 껐는데 서버 자동이 나중에 마스터를 다시 올려 사게 두지 않는다.
   *   값 동반이라 대기열에서 꺼낼 때도 같은 값이고, 실패하면 훅 ⑪ 이 두 컨트롤을 함께 서버 값으로 되돌린다.
   * - 켜는 방향: 종전 그대로(자동을 건드리지 않는다).
   * ★ 사람 스위치에서만 동작한다. D-02 전반(`commitGroupSwitch` 마지막 그룹 끄기의 마스터 동반) · D-02 후반
   *   (`dropMasterAfterServerFold`)은 자동을 건드리지 않는다(WinForms 동형 — 그 경로의 마스터 끔은 사람의 매수주문 끄기가 아니다).
   */
  const commitMasterSwitch = useCallback(
    (on: boolean) => {
      if (on) commitField('buyEnabled', true, 'toggle');
      else commitField('buyEnabled', false, 'toggle', { postBuyAuto: false });
    },
    [commitField],
  );

  /**
   * 후매수 ☐자동 체크(quick-260929-vzy · P-2) — 판정은 서버다. 폼은 입력을 보내고 에코 값을 보인다.
   *
   * - 켜는 방향: 후매수 켜기와 **같은 사전 검증**(금액 · 수량 · 반등 1~100 · 매도비율)을 지난다 — 서버가 불완전한
   *   자동(수량 0 · 반등 0 · 매도비율 0)을 ERROR 로 눕히기 때문이다. 실패면 전송 0 · 후매수 카드 한 줄(체크는 움직이지
   *   않는다). 통과면 자동만 보낸다 — 마스터는 켜지 않는다(발화 때 서버 몫 · WinForms 동형).
   * - 끄는 방향: 무장 해제라 언제나 보낸다(T-16-44).
   */
  const commitPostBuyAuto = useCallback(
    (on: boolean) => {
      if (on) {
        const failed = groupPrecheckOf('postBuyEnabled', lcBaseValues(serverRef.current, formRef.current));
        if (failed !== null) {
          setPrecheck({ slot: 'post-buy', gate: 'postBuyEnabled', text: failed });
          return;
        }
        setPrecheck((cur) => (cur !== null && cur.slot === 'post-buy' ? null : cur));
      }
      commitField('postBuyAuto', on, 'toggle');
    },
    [commitField],
  );

  /*
    그룹 켬 자동 체크 로그(D-06 · D-35) — 그 제출이 **성공한 뒤** 한 줄(「{선매수|추가매수} 자동 체크 — …」). 성공 필드 ·
    서버 ON 재확인은 **슬롯 키(켠 그룹)** 로 본다. 카드 `pushClientLog` 가 한 박자 늦게 쌓으므로 같은 에코의 D-01 줄
    (「{그룹} 체크 — 매수주문도 켬」) 다음에 온다. 실패(거부 · 무응답 · 끊김 · 대기 폐기)면 그 그룹 슬롯만 버린다.
    ★ 슬롯은 그룹별 — 선매수 in-flight 중 다른 그룹을 켜도 선매수 줄이 사라지지 않는다(GC-WR-04). 이 성공은 성공한
      필드의 슬롯만 소비하고 다른 슬롯은 그대로 둔다.
    ★ 성공 신호는 둘이다(24-REVIEW-R3 R3-WR-02). 훅의 해소 이펙트는 한 실행 안에서 성공을 둘 낼 수 있고(in-flight 성공
      직후 같은 실행의 늦은 에코 성공) 일반 신호는 한 칸이라 뒤엣것이 덮는다. 그래서 소비 규칙은 셋이다:
      (a) 실패한 그룹 슬롯은 버린다.
      (b) **보낸 성공**(`sentSuccessSeq` 가 바뀐 실행 · 한 번만)의 필드가 선매수 · 추가매수면 그 슬롯을 소비하고 줄을 쓴다
          — 보낸 성공은 한 실행에 최대 1건이라 덮이지 않는다.
      (c) 일반 성공의 필드가 선매수 · 추가매수이고 그 슬롯이 아직 남아 있으면 **줄 없이 슬롯만 비운다** — 보내지 않은
          no-op · 대기 접기 성공이다(D-08 · GC-IN-03). (b) 가 소비한 슬롯은 이미 없으므로 겹치지 않는다.
    ★ (b) 의 줄 **내용은 성공 에코로 확정**한다(R3-G1 · 24-REVIEW-R4 R4-WR-01 · R5-WR-02). 슬롯의 계산은 예측이고, 요청 항목
      일부가 에코에 무장으로 서지 않을 수 있다(부분 거부 · 무장 직후 발주 소진) — `confirmAutoChecks(예측, 에코)` 가 에코에
      선 항목만 「켬」 으로 두고, 서지 않은 항목은 「켜지 않음(무장 안 됨)」 · error 로 옮긴다(원인은 단정하지 않는다).
      전부 섰으면 줄은 종전과 같다.
    ★ 이 이펙트는 제출을 만들지 않는다 — 로그 한 줄만 내보낸다.
  */
  const sentSuccessSeenRef = useRef(sentSuccessSeq);
  useEffect(() => {
    const pending = pendingAutoCheckRef.current;
    // (a)
    for (const g of Object.keys(pending) as AutoCheckGate[]) {
      if (lc.failures[g] === undefined) continue;
      delete pending[g];
      delete autoCheckRef.current[g];
    }
    // (b) 보낸 성공 — 값이 바뀐 실행에서만 한 번 소비한다.
    if (sentSuccessSeenRef.current !== sentSuccessSeq) {
      sentSuccessSeenRef.current = sentSuccessSeq;
      const gate = lastSentSuccessField;
      if (gate === 'preBuyEnabled' || gate === 'extraBuyEnabled') {
        const seqAtSend = pending[gate];
        if (seqAtSend !== undefined && successSeq !== seqAtSend) {
          delete pending[gate];
          const auto = autoCheckRef.current[gate];
          delete autoCheckRef.current[gate];
          // 그새 그 그룹을 다시 꺼 그 확정이 성공한 경우는 켠 사건이 아니다. 마지막 계산 = 실제로 나간 cfg 의 판정(WR-03)
          //   — 켤 것도 생략도 없으면 줄 없음. 내용은 성공 에코로 확정한다 — 요청했으나 무장으로 서지 않은 항목은
          //   「켜지 않음(무장 안 됨)」(R3-G1 · R5-WR-02 · 원인은 단정하지 않는다).
          const echoNow = serverRef.current;
          const line =
            echoNow?.[gate] === true && auto !== undefined ? groupAutoCheckLogLine(confirmAutoChecks(auto, echoNow)) : null;
          if (line !== null) clientLogRef.current?.(line.text, line.level);
        }
      }
    }
    // (c) 보내지 않은 켜기(다른 단말이 켠 no-op · 대기 접기 성공)에는 자동 체크 줄이 없다 — 슬롯만 비운다(D-08 · GC-IN-03).
    if (lastSuccessField === 'preBuyEnabled' || lastSuccessField === 'extraBuyEnabled') {
      const seqAtSend = pending[lastSuccessField];
      if (seqAtSend !== undefined && successSeq !== seqAtSend) {
        delete pending[lastSuccessField];
        delete autoCheckRef.current[lastSuccessField];
      }
    }
  }, [successSeq, lastSuccessField, sentSuccessSeq, lastSentSuccessField, lc.failures]);

  /*
    ★ D-02 후반 · D-19 (2026-09-28 정정 · WinForms `b066e135` `DropMasterAfterServerFold` 동형) —
      **사람 입력 핸들러가 아닌 곳에서 제출을 만드는 유일한 경로**다(T-24-25).
      서버가 발주 · 포기 · 소진으로 그룹을 접어 「그룹 하나라도 ON」→「세 그룹 OFF · 마스터 ON」 하강 전이가
      에코되면, 에코 적용 뒤 다음 틱에 `buyEnabled: false` 를 **정확히 1건** 보낸다(나머지 = 에코 cfg · crud C ·
      마스터 낙관 OFF · 실패하면 훅이 서버 값(ON)으로 되돌리고 재시도하지 않는다).
      가드 6개:
        ① 매도주문 · 취소>잔량 · 취소>체결이 전부 OFF 면 그 제출은 삭제(`crud D`)가 되므로 보내지 않는다 —
           이때만 매수주문 상태 「켜짐 · 켠 매수 없음」이 남는다.
        ② 보내기 직전 최신 에코로 재확인 — 그새 마스터가 꺼졌거나 그룹이 켜졌으면 중단.
        ③ in-flight · 대기 확정이 있으면 기다렸다가(이 이펙트가 풀린 렌더에서 다시 예약) 그 에코 뒤에 다시 판정 —
           중복 제출 0.
        ④ 하강 전이만 — 같은 상태 재수신 · 재접속 뒤 첫 `lc.snap` · 첫 스냅샷 · 자기 마스터 OFF 에코는 트리거가
           아니다(`isServerFoldEdge` · 재접속이면 기준선을 비우고 옛 에코 객체는 기준선으로 삼지 않는다).
        ⑤ 순수 델타(WR-06) — 보낼 cfg 가 최신 에코와 `buyEnabled` 한 필드만 다를 때만 보낸다(lib `isMasterOnlyDelta`).
           웹이 다시 계산하는 수량 3벌 · 클라 고정 3필드가 에코와 다르면 다른 클라 · 다른 단말이 둔 값이라 덮지
           않는다 — ① 과 같은 결로 접고(재예약 없음) 매수주문 상태 「켜짐 · 켠 매수 없음」이 남는다.
           구서버 에코는 전환 에코(buy3 → 구서버)를 포함해 `isServerFoldEdge` 가 먼저 거른다(GC-IN-01) — 이 가드까지
           오지 않는다.
        ⑥ 비가시 유예(WR-06) — 화면에 보이지 않는 인스턴스(`document.visibilityState === 'hidden'`)는 예약을
           `LC_FOLD_HIDDEN_DEFER_MS` 미룬 뒤 ② 로 재확인한다. 그사이 보이는 인스턴스가 보낸 마스터 OFF 에코가 왔으면
           보내지 않는다 — 탭 · 앱 N개에서 통상 1건. 보이는 인스턴스는 종전대로 다음 틱이다.
      남는 한계(24-16 체크포인트에서 사용자 확인): 동시에 화면에 보이는 두 인스턴스(예: 데스크톱 + 전면 앱)는 각 1건씩
      보낼 수 있고(같은 순수 델타 cfg — 둘째는 OFF→OFF 무접촉), 자동 제출보다 한 왕복 안쪽에 서버에 닿은 사람 편집은
      전체 cfg 규약(마지막 쓰기 승리) 때문에 되돌려질 수 있다. 화면에 보이는 인스턴스가 하나도 없으면(모든 탭 · 앱이
      숨음) 모두 같은 유예(`LC_FOLD_HIDDEN_DEFER_MS`) 뒤 ② 를 재확인하므로 N건이 거의 동시에 나갈 수 있다 — 유예
      지터는 넣지 않았다(운영 서버 D-34 에서는 이 백스톱에 닿지 않음 · 24-24 사용자 확인 · GC-IN-02).
      완전 차단은 relay/서버 비교 후 쓰기가 필요해 이월한다.
      로그 문장(「서버가 매수 그룹 해제 — …」)은 폼이 쓰지 않는다 — 사유(`cause: 'serverFold'`)를 실어 보내면
      카드가 성공 에코에서 쓴다(24-05).
  */
  const lcBusyRef = useRef(false);
  lcBusyRef.current = lc.inflightField !== null || lc.queuedFields.length > 0;
  /** 직전 **렌더된** 에코 — 하강 전이 판정의 prev. 재접속이면 비운다(④). */
  const lastEchoRef = useRef<RelayLimitChaser | null>(null);
  /** 재접속 직전 에코 객체 — 재접속 뒤 이 객체가 그대로면 기준선으로 삼지 않는다(첫 `lc.snap` 이 기준선 · ④). */
  const staleEchoRef = useRef<RelayLimitChaser | null | undefined>(undefined);
  /** 하강 전이를 봤고 아직 보내지(또는 가드로 접지) 않았다. */
  const foldPendingRef = useRef(false);
  const dropMasterAfterServerFold = useCallback(() => {
    const s = serverRef.current;
    // ② 최신 에코로 재확인 — 마스터 OFF 이거나 그룹이 다시 켜졌으면 할 일이 없다.
    if (s == null || !s.buyEnabled || s.preBuyEnabled || s.extraBuyEnabled || s.postBuyEnabled) {
      foldPendingRef.current = false;
      return;
    }
    // ③ 앞 확정이 끝나지 않았다 — 기다린다(그 에코 뒤 이펙트가 다시 예약한다).
    if (lcBusyRef.current) return;
    // ① 매도 · 취소 게이트가 전부 꺼져 있으면 이 제출은 삭제다 — 보내지 않는다.
    if (!s.sellEnabled && !s.cancelQtyEnabled && !s.cancelTradeEnabled) {
      foldPendingRef.current = false;
      return;
    }
    // ⑤ 보낼 cfg 가 최신 에코와 `buyEnabled` 한 필드만 달라야 한다 — 웹이 다시 계산하는 수량 3벌 · 클라 고정 3필드가
    //    에코와 다르면 다른 클라가 둔 값이다. 자동 제출이 덮지 않는다(WR-06 · ① 과 같은 결 — 다시 예약하지 않는다).
    if (!isMasterOnlyDelta(buildCfg({ ...lcBaseValues(s, formRef.current), buyEnabled: false }), s)) {
      foldPendingRef.current = false;
      return;
    }
    // 한 번 보내면 먼저 내린다 — 실패 · 막힘이어도 다시 예약하지 않는다(재시도 없음 · 훅 ⑤).
    foldPendingRef.current = false;
    commitField('buyEnabled', false, 'toggle', undefined, { cause: 'serverFold' });
  }, [buildCfg, commitField]);
  useEffect(() => {
    if (disabled) {
      lastEchoRef.current = null;
      foldPendingRef.current = false;
      staleEchoRef.current = server;
      return;
    }
    if (staleEchoRef.current !== undefined) {
      if (server === staleEchoRef.current) return;
      staleEchoRef.current = undefined;
    }
    if (server !== lastEchoRef.current) {
      if (isServerFoldEdge(lastEchoRef.current, server)) foldPendingRef.current = true;
      lastEchoRef.current = server;
    }
    if (!foldPendingRef.current) return;
    // 에코 적용(폼 덮기 · 훅 판정)이 끝난 **다음 틱**에 판정한다 — 숨은 인스턴스는 유예 뒤다(⑥).
    const id = window.setTimeout(dropMasterAfterServerFold, serverFoldDelayMs());
    return () => window.clearTimeout(id);
  }, [server, disabled, lc.inflightField, lc.queuedFields, dropMasterAfterServerFold]);

  /*
    ★ 세 그룹 카드 접힘(Phase 24 ⑤ · R1) — false = 접힘(네 밴드 기본 · 켜진 그룹도 자동으로 펼치지 않는다).
      폼 인스턴스 상태 하나라 에코 재렌더 · 매수/매도 탭 전환 · 밴드 변화에 풀리지 않고, 저장하지 않는다.
  */
  const [expanded, setExpanded] = useState<Record<FoldSlot, boolean>>({
    'pre-buy': false,
    'extra-buy': false,
    'post-buy': false,
    'auto-sell': false,
  });
  const toggleFold = useCallback((slot: FoldSlot) => {
    setExpanded((prev) => ({ ...prev, [slot]: !prev[slot] }));
  }, []);
  /*
    ★ 자동 펼침은 **단 한 경우**다(UI-SPEC §2 · T-24-19) — 접힌 카드 안 행의 확정이 실패해 그 행에 실패
      말풍선을 띄워야 할 때. 앵커 행이 숨어 있으면 실패가 보이지 않는다(조용한 실패 금지). **새로** 들어온
      실패만 본다(이전 실패 객체와 정체성 비교). 그룹 스위치 실패는 행이 아니라(제목줄의 스위치가 말한다)
      펼치지 않고, 에코 · 사전 검증으로도 펼치지 않는다. 체크는 말풍선이 뜨는 거부 · 무응답만.
  */
  const prevFailuresRef = useRef(lc.failures);
  useEffect(() => {
    const prev = prevFailuresRef.current;
    prevFailuresRef.current = lc.failures;
    const open: FoldSlot[] = [];
    for (const [field, f] of Object.entries(lc.failures) as [LcFieldKey, LcCommitFailure | undefined][]) {
      if (f === undefined || prev[field] === f) continue;
      const hit = lcRowOfField(field);
      if (hit === null || !isFoldSlot(hit.group.slot)) continue;
      if (hit.isCheck && f.reason !== 'rejected' && f.reason !== 'timeout') continue;
      open.push(hit.group.slot);
    }
    if (open.length === 0) return;
    setExpanded((cur) => {
      if (open.every((slot) => cur[slot])) return cur;
      const next = { ...cur };
      for (const slot of open) next[slot] = true;
      return next;
    });
  }, [lc.failures]);

  /**
   * 인라인 편집기 — 실패로 남은 입력값이 있으면 그 값으로 다시 연다(입력 보존 · A-P3).
   * 검증은 편집기가 저장 **전**에 한다 — 원 단위 호가·상한가(D-15, `upperLimit`) · 필드 범위(`range`,
   * relay 스키마 · CR-01) → 무장 불가(`armBlockOf` · 훅의 전송 직전 가드와 **같은 식** = 서버 동기값 +
   * 바꾼 필드 · T-20-03).
   */
  function inlineEditorOf(field: LcNumField, id: string, label: string, unit: LcUnit, range?: LcRange): ReactNode {
    const failure = lc.failures[field];
    return (
      <InlineValueEditor
        id={id}
        label={label}
        unit={unit}
        initialValue={typeof failure?.value === 'number' ? failure.value : shownValueOf(field)}
        upperLimit={unit === '원' ? (upperLimit ?? 0) : 0}
        tickRule={tickRule}
        min={range?.min}
        max={range?.max}
        validate={(v) => validateCommit(field, v)}
        busy={isBusy(field)}
        failureText={inlineFailureTextOf(failure)}
        onSave={(v, via) => handleInlineSave(field, v, via)}
        onCancel={() => handleInlineCancel(field)}
        onDismiss={endEdit}
        onNavigate={(dir) => handleInlineNavigate(field, dir)}
      />
    );
  }

  /**
   * D-14b — 편집 중 다른 **값 행(값 버튼)** 을 누르면 그 행을 다음 편집으로 기록한다(캡처 단계라 행
   * 자신의 핸들러보다 먼저 돈다). 체크 버튼 · 스위치는 `data-lc-field` 버튼이 아니어서
   * 기록하지 않는다 — 그 클릭은 제 동작을 한다. 비활성 · 반영 중인 행도 기록하지 않는다(`activateRow` 와 같은 규칙).
   */
  const handlePointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (editingField === null) return;
    const target = e.target instanceof Element ? e.target.closest('[data-lc-field]') : null;
    if (!(target instanceof HTMLButtonElement) || target.disabled) return;
    const hit = lcRowById(target.dataset.lcField ?? '');
    if (hit === null || (hit.row.kind !== 'value' && hit.row.kind !== 'checkValue')) return;
    const field = hit.row.field;
    if (field === editingField || lc.inflightField === field) return;
    nextEditRef.current = field;
  };

  /**
   * 행·편집기가 보여 줄 값 — 서버가 주문금액을 모르면(레거시) 주문금액은 `null`(「—」 · 빈 편집)이다(D-04a).
   * 폼이 든 금액은 클라 기본값(10만원)이라 서버 사실이 아니다 — 그 값을 보이면 「10만원어치 산다」로 읽힌다.
   */
  function shownValueOf(field: LcNumField): number | null {
    return field === 'buyOrderAmount' && lc.amountRequired ? null : form[field];
  }

  /**
   * 시트·인라인 확정 전 검증 — 구서버 에코 편집 제한(WR-02 · `lcLegacyBlockOf`) → 무장 불가(`armBlockOf`). 훅의 전송
   * 직전 가드와 **같은 두 함수 · 같은 순서**다(기준값 = 서버 동기값 + 바꾼 필드 · T-20-03).
   */
  function validateCommit(field: LcNumField, v: number): string | null {
    const next: LimitChaserFormValues = { ...lcBaseValues(server, formRef.current), [field]: v };
    return lcLegacyBlockOf(isLegacyBuySchema(server), field, v, next) ?? armBlockOf(next);
  }

  /** 값 행이 공유하는 편집 배선(값 행 · 체크 값 행의 값 버튼). */
  function valueProps(field: LcNumField, locked = false) {
    return {
      disabled: disabled || locked,
      busy: isBusy(field),
      flash: lc.flashField === field,
      failed: lc.failures[field] !== undefined,
      // 시트가 이 행을 편집 중이면 실패는 시트 상태 줄이 말한다 — 말풍선(body 포털)이 시트
      // 오버레이 위로 뜨지 않게 행 쪽은 끈다(20-03).
      failureText: sheetField === field ? null : inlineFailureTextOf(lc.failures[field]),
      editing: editingField === field,
      hasPopup: editMode === 'sheet',
    };
  }

  /**
   * 값 행의 표시 문자열 · 접근성 이름 — 판정은 `lc-fields.ts` 순수 함수 한 곳이다(UI-SPEC §4 · D-09 · D-10).
   * 선매수 금액을 서버가 모르면(D-04a) `shownValueOf` 가 `null` → 「—」 이다.
   */
  function displayOf(group: LcGroupSpec, row: Extract<LcRowSpec, { kind: 'value' | 'checkValue' }>) {
    const shown = shownValueOf(row.field);
    const valueText = shown === null ? undefined : (lcValueTextOf(row.field, form, server) ?? undefined);
    const text = valueText ?? (shown === null ? '—' : formatSettingValue(shown, row.unit));
    return { valueText, ariaName: lcRowA11yNameOf(group, row, text) };
  }

  function renderRow(group: LcGroupSpec, row: LcRowSpec): ReactNode {
    const dim = lcRowDimOf(group, row, form);
    switch (row.kind) {
      case 'value':
        return (
          <SettingRow
            key={row.id}
            id={row.id}
            label={row.label}
            unit={row.unit}
            value={shownValueOf(row.field)}
            {...displayOf(group, row)}
            dim={dim}
            {...valueProps(row.field, autoSellLocked(group))}
            onActivate={(el) => activateRow(row.field, el)}
            editor={
              editingField === row.field
                ? inlineEditorOf(row.field, row.id, row.label, row.unit, row.inputRange ?? row.range)
                : undefined
            }
          />
        );
      case 'checkValue':
      case 'check': {
        const check = row.check;
        const v = row.kind === 'checkValue' ? valueProps(row.field) : null;
        return (
          <CheckValueRow
            key={row.checkId}
            checkId={row.checkId}
            groupTitle={group.title}
            label={row.label}
            checked={form[check]}
            onToggle={() => commitToggle(check, !form[check])}
            checkBusy={isBusy(check)}
            checkFlash={lc.flashField === check}
            checkFailureText={toggleFailureTextOf(check)}
            dim={dim}
            {...(row.kind === 'checkValue' && v !== null
              ? {
                  ...v,
                  ...displayOf(group, row),
                  value: form[row.field],
                  unit: row.unit,
                  valueId: row.id,
                  onActivateValue: (el: HTMLElement) => activateRow(row.field, el),
                  editor:
                    editingField === row.field
                      ? inlineEditorOf(row.field, row.id, row.label, row.unit, row.inputRange ?? row.range)
                      : undefined,
                }
              : {})}
            disabled={disabled}
          />
        );
      }
      case 'choice': {
        // Phase 27 D-02 — 자동매도 방법 3택(폰 시트 · 데스크톱 세그먼트). 값은 서버 값(낙관 반영 없음).
        const f = lc.failures[row.field];
        return (
          <ChoiceRow
            key={row.id}
            id={row.id}
            label={row.label}
            value={form[row.field]}
            options={row.options}
            a11yName={`${group.title} ${row.label}`}
            sheetTitle={`${group.title} ${row.label}`}
            description={row.desc}
            disabled={disabled || autoSellLocked(group)}
            dim={dim}
            busy={isBusy(row.field)}
            flash={lc.flashField === row.field}
            failureText={
              f === undefined ? null : f.reason === 'rejected' || f.reason === 'timeout' ? LC_COMMIT_TEXT.failed : f.text
            }
            onSelect={(v) => handleChoiceSelect(row.field, v)}
          />
        );
      }
      case 'derived':
        if (row.source === 'autoSellSoldQty') {
          // 자동매도 누적 매도 — 0 「—」(sr 「없음」) · > 0 빨강(목업 `.v.hot` = `--up`). 펼침이면 늘 그린다.
          return (
            <DerivedRow
              key="auto-sell-sold"
              slot="lc-auto-sell-sold"
              label={row.label}
              value={server?.autoSellSoldQty ?? 0}
              unit="주"
              emphasis
              valueText="—"
              srText="없음"
              dim={dim}
            />
          );
        }
        if (row.source === 'autoSellBasisPrice') {
          // 자동매도 기준 — 「{상한가|매수가} N원」 · 상태 0 · 기준 0 이면 「—」(판정은 `lcAutoSellBasisText` 하나).
          const basis = lcAutoSellBasisText(server);
          return (
            <DerivedRow
              key="auto-sell-basis"
              slot="lc-auto-sell-basis"
              label={row.label}
              value={basis === '—' ? 0 : (server?.autoSellBasisPrice ?? 0)}
              unit="원"
              display={basis}
              valueText="—"
              srText="없음"
              dim={dim}
            />
          );
        }
        if (row.source === 'postBuyTriggerQty') {
          // 후매수 발동잔량 — 펼침이면 단계 0 에서도 늘 그린다(「—」 · sr-only 「없음」 · UI-SPEC §6 · E5).
          // 발동잔량 0 · 해제선 > 0 이면 해제선 회색(gh-trade 259bc869 · quick-261002-fim).
          return (
            <DerivedRow
              key="post-buy-trigger"
              slot="lc-post-buy-trigger"
              label={row.label}
              value={server?.postBuyTriggerQty ?? 0}
              unit="주"
              emphasis
              valueText="—"
              srText="없음"
              mutedValue={server?.postBuyUnlockQty ?? 0}
              mutedSrText={POST_BUY_UNLOCK_SR_TEXT}
              dim={dim}
            />
          );
        }
        // 잔량추적 기준선 — S→C 전용 · 서버가 매도 진입을 래치한 뒤에만 존재한다(UI Considerations E1 partial).
        return server?.sellEntryLatched ? (
          <DerivedRow key="derived" label={row.label} value={server.sellQtyTrackBaseline} unit="주" dim={dim} />
        ) : null;
      case 'note':
        // 후매수 소진(단계 3) 안내 — 「최대」 행 바로 아래 · 역할 없음 · 흐리지 않는다(UI-SPEC §5).
        // 접힌 카드에서는 그리지 않는다(상태 「소진」 + 요약 「3회 · 남은 0회」가 같은 사실을 말하고, 안내가
        // 가리키는 「최대」 편집은 펼쳐야 가능하다).
        return server?.postBuyPhase === 3 && expanded['post-buy'] ? (
          <GroupNote key="post-buy-exhausted" slot="lc-post-buy-exhausted">
            {POST_BUY_EXHAUSTED_TEXT}
          </GroupNote>
        ) : null;
    }
  }

  function renderGroup(spec: LcGroupSpec): ReactNode {
    const gate = spec.gate;
    const slot = spec.slot;
    return (
      <SettingGroup
        key={slot}
        spec={spec}
        statusText={statusOf(spec.statusKey)}
        on={gate ? form[gate] : undefined}
        // 흐림은 행마다 한 번(`lcRowDimOf`) — 컨테이너까지 흐리면 .45 × .45 가 된다(⑩ · UI-SPEC §9).
        dimRows={false}
        // 그룹 켜기 사전 검증 줄 — 누른 카드 한 자리(UI-SPEC §7 · R8).
        precheckText={precheck !== null && precheck.slot === slot ? precheck.text : null}
        // Phase 27 D-05 — 자동매도 펼친 본문 마지막 행(접힌 카드에서는 SettingGroup 이 그리지 않는다).
        footer={
          slot === 'auto-sell' && onAutoSellCommand !== undefined ? (
            <AutoSellActions
              startEnabled={autoSellStartEnabled}
              stopEnabled={autoSellStopEnabled}
              onStart={() => onAutoSellCommand('start')}
              onStop={() => onAutoSellCommand('stop')}
            />
          ) : undefined
        }
        fold={
          spec.collapsible && isFoldSlot(slot)
            ? {
                expanded: expanded[slot],
                onToggle: () => toggleFold(slot),
                summary: <GroupSummary items={lcSummaryOf(slot, form, server, lc.amountRequired)} />,
              }
            : undefined
        }
        switchNode={
          gate ? (
            <GroupSwitch
              id={gate === 'cancelQtyEnabled' ? 'lc-cancel-qty' : undefined}
              label={LC_SWITCH_LABEL[gate]}
              checked={form[gate]}
              // ★ 켜는 방향만 막는다 — `!form[gate]` 를 넘기므로 **켜져 있으면 언제나 끌 수 있다**.
              disabled={gateDisabled(gate)}
              onCheckedChange={(v) =>
                isBuyGroupGate(gate)
                  ? commitGroupSwitch(gate, v)
                  : gate === 'buyEnabled'
                    ? commitMasterSwitch(v)
                    : commitToggle(gate, v)
              }
              failureText={toggleFailureTextOf(gate)}
            />
          ) : undefined
        }
        // 제목줄 체크(quick-260929-vzy 후매수 ☐자동) — 스위치 바로 앞 · 에코 값을 그대로 보인다.
        headerCheck={
          spec.headerCheck ? (
            <GroupHeaderCheck
              id={spec.headerCheck.checkId}
              label={spec.headerCheck.label}
              ariaLabel={spec.headerCheck.ariaLabel}
              hint={spec.headerCheck.hint}
              checked={form.postBuyAuto}
              busy={isBusy('postBuyAuto')}
              flash={lc.flashField === 'postBuyAuto'}
              failureText={toggleFailureTextOf('postBuyAuto')}
              // 끄기는 세션만 본다(T-16-44). 켜기는 후매수 스위치와 같은 정적 판정(세션 · 구서버 WR-02 · 시세 미수신).
              disabled={form.postBuyAuto ? disabled : gateBlocked('postBuyEnabled', true)}
              onToggle={() => commitPostBuyAuto(!form.postBuyAuto)}
            />
          ) : undefined
        }
      >
        {spec.rows.map((row) => renderRow(spec, row))}
      </SettingGroup>
    );
  }

  /*
    「켤 수 없는 이유」는 **열 맨 아래 한 곳**에만 모인다 (260911-w5h).
    그룹 헤더 바로 아래에 끼우면 사유가 뜨거나 사라질 때마다 그 아래 행 전체가 세로로 밀린다.
  */
  const buyReasons = armBlockedGroupsOf(BUY_COLUMN_GATES, form, canArm, disabled, legacy ? BUY_COLUMN_LEGACY_NAMES : null);
  const sellReasons = armBlockedGroupsOf(
    SELL_COLUMN_GATES,
    form,
    canArm,
    disabled,
    legacy ? SELL_COLUMN_LEGACY_NAMES : null,
  );

  /**
   * 한 열(pane) — ≥685 열 머리 「● 매수」/「● 매도」 → 그룹들(사이 10) → 사유 패널.
   * ★ 비활성 pane 숨김은 **CSS 클래스**다 (260912-k2x) — 본문 폭은 미디어 질의 API 로 관측할 수
   *   없어 폭 판정을 CSS 에 통째로 넘기고 JS 는 「어느 탭이 선택됐나」만 안다. **조건부 렌더로
   *   바꾸지 마라** — 언마운트하면 나가 있던 확정·열린 편집이 사라진다.
   */
  function pane(side: 'buy' | 'sell', groups: readonly LcGroupSpec[], reasons: ArmBlockedGroup[]): ReactNode {
    return (
      <div data-pane={side} className={cn('min-w-0', tab !== side && 'hidden @min-[685px]/lc:block')}>
        <div
          data-slot="lc-column-head"
          className="mt-2.5 hidden items-center gap-1.5 px-0.5 text-[15px] leading-[1.5] font-bold text-[var(--fg)] @min-[685px]/lc:flex"
        >
          <span
            aria-hidden="true"
            className={cn('size-2 flex-none rounded-full', side === 'buy' ? 'bg-[var(--up)]' : 'bg-[var(--down)]')}
          />
          {side === 'buy' ? '매수' : '매도'}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5 @min-[685px]/lc:mt-2.5">{groups.map(renderGroup)}</div>
        <ArmBlockedPanel groups={reasons} />
      </div>
    );
  }

  // 시트 입력 — 닫혀 있을 때도 같은 필드 기준으로 계산한다(열림은 `sheetRow` 하나가 정한다).
  const sheetRow = sheetField === null ? null : lcRowByField(sheetField);
  const sheetKey: LcNumField = sheetField ?? 'sweepMinTickCount';
  const sheetFailure = lc.failures[sheetKey];
  const sheetBusy = isBusy(sheetKey);
  /*
    D-05 「감시 중 — 적용하면 바로 반영돼요」 — 매수 쪽은 그 행 카드의 게이트 **에코**가 ON 이면(공통 카드 =
    마스터, 그룹 카드 = 그 그룹 — 「보유중」「켜짐 · 켠 매수 없음」 포함). 자동매도(Phase 27)도 게이트 에코 ON 이면 —
    칩 낱말(대기 · 감시 …)은 「감시 중」 으로 시작하지 않는다. 매도주문 · 매수취소는 기존 판정(상태 문구 「감시 중」).
  */
  const sheetGroup = sheetRow?.group;
  const sheetArmed =
    sheetGroup === undefined
      ? false
      : BUY_SIDE_SLOTS.has(sheetGroup.slot) || sheetGroup.slot === 'auto-sell'
        ? sheetGroup.dimGate !== undefined && server?.[sheetGroup.dimGate] === true
        : (statusOf(sheetGroup.statusKey) ?? '').startsWith('감시 중');
  // 시트 「지금 ○○」 — 의미어를 행과 같은 함수에서 받는다. 에코 런타임(잔여)은 싣지 않는다 = 설정값(D-11).
  const sheetServerText =
    sheetRow === null || shownValueOf(sheetKey) === null ? undefined : (lcValueTextOf(sheetKey, form, null) ?? undefined);
  const sheetRange = sheetRow === null ? undefined : (sheetRow.row.inputRange ?? sheetRow.row.range);

  return (
    <div data-slot="limit-chaser-form" className={cn('min-w-0', className)} onPointerDownCapture={handlePointerDownCapture}>
      {submitError === '' ? null : (
        /*
          스위치·체크를 눌렀는데 못 나갔거나 무장 판정에 막혔다 — 화면이 그 사실을 말한다.
          ★ **폼 맨 위**다. `role="alert"` 이라 스크롤 위치와 무관하게 읽힌다. 토스트를 쓰지 않는
            근거는 파일 상단 ⑥.
        */
        <p
          data-slot="lc-submit-error"
          role="alert"
          className="mb-[var(--s-2)] m-0 text-[11px] leading-normal text-[var(--destructive)]"
        >
          {submitError}
        </p>
      )}
      {hideTabs ? null : (
        <div
          role="tablist"
          aria-label="주문 설정"
          className="mb-[var(--s-2)] grid grid-cols-2 gap-[var(--s-1)] @min-[685px]/lc:hidden"
        >
          {(['buy', 'sell'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                // 토스 B `.side-tabs` — 선택은 방향색이 아니라 중립 선택 면이다(라벨 「매수/매도」 글자가
                // 방향을 말한다 · WCAG 1.4.1). 높이 42 는 세로만 — 글자·가로 폭 불변.
                'h-[42px] min-w-0 rounded-[var(--r)] border border-transparent text-[length:var(--t-sm)] font-semibold',
                tab === t && 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]',
                tab !== t && 'bg-[var(--muted)] text-[var(--muted-fg)]',
              )}
            >
              {t === 'buy' ? '매수' : '매도'}
            </button>
          ))}
        </div>
      )}

      {/* 매수·매도 두 열(본문 685~). **그리드 자식 전부 `min-w-0`**(lessons.md). 간격 8 · ≥992 16 은 기존 값. */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--s-2)] @min-[685px]/lc:grid-cols-2 @min-[992px]/lc:gap-[var(--s-4)] [&>*]:min-w-0">
        {pane('buy', LC_BUY_GROUPS, buyReasons)}
        {pane('sell', LC_SELL_GROUPS, sellReasons)}
      </div>

      {/*
        ★ Phase 20 D-13 — 터치 기기 키패드 시트. **폼 전체에 한 개**이고 `document.body` 로 포털한다
          (카드의 `container-type` 조상 밖 · Radix 가 대신 한다). 제목·설명·단위는 필드 스펙
          (`lcRowByField`)에서 온다. 시트는 값만 넘기고 전송은 `handleSheetConfirm` → 훅 `commit` 하나다.
      */}
      <NumberPadSheet
        open={sheetRow !== null}
        title={sheetRow === null ? '' : (sheetRow.row.sheetTitle ?? sheetRow.row.label)}
        description={sheetRow?.row.desc ?? ''}
        unit={sheetRow?.row.unit ?? '건'}
        purpose="apply"
        initialValue={typeof sheetFailure?.value === 'number' ? sheetFailure.value : shownValueOf(sheetKey)}
        // 값 필드는 낙관 반영이 없어 폼 값 = 서버 동기값이다(D-06). 서버가 모르는 금액은 「지금 ○○」 없음(D-04a).
        serverValue={shownValueOf(sheetKey)}
        serverValueText={sheetServerText}
        // 필드 범위(relay 스키마 · CR-01) — 범위 밖이면 확인 잠금 · 범위 밖 `set` 칩(잔량추적의 100 등) 비활성.
        // D-15a — 호가 단위 잠금 강도(종목 분류). 원 단위 행만 쓴다.
        ctx={{
          current: currentPrice,
          upper: upperLimit ?? 0,
          min: sheetRange?.min,
          max: sheetRange?.max,
          tickRule,
        }}
        status={sheetBusy ? 'busy' : sheetFailure !== undefined ? 'failed' : 'editing'}
        failureText={sheetFailure?.text ?? null}
        // 그 행 카드가 감시 중이면 한 줄 안내(추가 확인 없음 · D-05) — 판정은 위 `sheetArmed`.
        armedNotice={sheetArmed}
        validate={(v) => validateCommit(sheetKey, v)}
        returnFocusRef={sheetReturnRef}
        onConfirm={(v) => handleSheetConfirm(sheetKey, v)}
        onClose={handleSheetClose}
      />
    </div>
  );
}

/* ───────────────────────── 폼 구성 요소 ───────────────────────── */

/**
 * 「켤 수 없는 이유」 — 카드의 **마지막 자식**. 목록이 비면 `null` 이라 영역 자체가 DOM 에 없다.
 *
 * ★ 슬롯 이름 `lc-arm-blocked` 는 옛 그룹 안 사유줄에서 그대로 이어받았다 —
 *   `e2e/specs/trading-limit-chaser.spec.ts` 가 그 슬롯의 가시성을 보고 있고, 그 단언은 새
 *   구조에서도 그대로 참이어야 한다(사유가 **어디서** 보이는지가 바뀐 것이지 보이는지
 *   여부가 바뀐 것이 아니다).
 */
function ArmBlockedPanel({ groups }: { groups: ArmBlockedGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div
      data-slot="lc-arm-blocked-panel"
      className="mt-[var(--s-2)] border-t border-[var(--border-subtle)] bg-[var(--muted)] px-[var(--s-2)] py-1.5"
    >
      <p className="m-0 mb-0.5 text-[10px] font-semibold tracking-[0.04em] text-[var(--muted-fg)]">
        켤 수 없는 이유
      </p>
      <ul className="m-0 list-disc pl-[13px] text-[11px] leading-[1.5] text-[var(--muted-fg)]">
        {groups.map((g) => (
          <li key={g.gates.join('|')} data-slot="lc-arm-blocked">
            <b data-slot="lc-arm-blocked-gates" className="font-semibold text-[var(--fg)]">
              {g.gates.join(ARM_BLOCKED_SEP)}
            </b>
            {ARM_BLOCKED_SEP}
            <span data-slot="lc-arm-blocked-text">{g.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 인라인 실패 문구 — 보냈는데 안 선 것(거부·무응답)은 「Enter 로 다시 시도」를 덧붙인다
 * (UI-SPEC Copywriting 「인라인 실패 말풍선」). 끊김·무장 불가는 그 사유 문장 그대로다.
 * 편집기 말풍선과 **편집이 끝난 행**의 앵커 말풍선(다른 행으로 옮긴 뒤 도착한 실패 · A-P3)이 이 한
 * 함수를 쓴다 — 그 행을 다시 누르면 보존값으로 편집이 열려 Enter 가 곧 재시도다.
 */
function inlineFailureTextOf(f: LcCommitFailure | undefined): string | null {
  if (f === undefined) return null;
  return f.reason === 'rejected' || f.reason === 'timeout' ? LC_COMMIT_TEXT.inlineFailed : f.text;
}

/**
 * 폼 맨 위 한 줄이 말하는 토글 실패 — **보내지 못한 것**(끊김 · 무장 불가 · 범위 밖 ·
 * 구서버 에코 읽기 전용(WR-02) — 막힌 토글이 조용히 되돌아가지 않게). 거부·무응답은 말풍선.
 */
const SUBMIT_ERROR_REASONS: ReadonlySet<LcFailReason> = new Set([
  'disconnected',
  'armBlocked',
  'invalid',
  'legacySchema',
]);

/**
 * 폼 맨 위 한 줄(`lc-submit-error`) 파생 — 토글 종류(값이 숫자가 아닌 필드)의 보내지 못한 실패 중 아직 답으로
 * 접히지 않은 첫 건. 끊김은 토글 어조의 기존 문장(`SEND_FAILED_TEXT.gate`), 나머지는 훅이 둔 사유 문장
 * (`armBlockOf` · `lcRangeIssue`) 그대로다 — 문장 산출 지점은 하나다. 값 필드 실패는 행·시트·말풍선이 말한다.
 */
function toggleSubmitErrorOf(
  failures: Partial<Record<LcFieldKey, LcCommitFailure>>,
  dismissed: ReadonlySet<LcCommitFailure>,
): string {
  for (const f of Object.values(failures)) {
    if (f === undefined || dismissed.has(f)) continue;
    if (typeof f.value === 'number' || !SUBMIT_ERROR_REASONS.has(f.reason)) continue;
    return f.reason === 'disconnected' ? SEND_FAILED_TEXT.gate : f.text;
  }
  return '';
}

/** 무장 판정 기준값 — 서버 동기값(없으면 폼 값). 훅의 전송 직전 가드와 같은 식이다(T-20-03). */
function lcBaseValues(
  server: RelayLimitChaser | null,
  form: LimitChaserFormValues,
): LimitChaserFormValues {
  return server != null ? formFromServer(server, form) : form;
}
