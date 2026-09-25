'use client';

/**
 * LimitChaserForm — 상따 매수/매도 설정 **토스식 리스트** (Phase 20 · UI-SPEC §1~§4, TRADE-01).
 *
 * ① 무엇을 어디에
 *   무엇을 어떤 순서로 그리는지는 **`lc/lc-fields.ts` 한 곳**이 정한다(D-19) — 매수 쪽 =
 *   [매수가격 · 주문금액] → 매수주문 → 한방체결 · 매도 쪽 = [매도가격 · 매도비율] → 매도주문 →
 *   매수취소(맨 아래). 행 모양은 `lc/setting-group.tsx` 의 조각이다(값 행 · 체크 값 행 · 감시대상 행 ·
 *   기준선 행 · 그룹 카드 · 그룹 스위치). 이 파일은 그 둘을 **값·전송 배선**으로 잇는다.
 *   본문 폭 **700px 이상**이면 매수 | 매도 두 열이 나란히 서고 각 열 머리가 「● 매수」/「● 매도」다.
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
 *   2. **매수/매도는 3중으로 말한다** — ≥700 열 머리 점 색(`--up`/`--down`) + 글자(「매수」/「매도」) +
 *      위치(왼쪽/오른쪽). 폰은 바깥 3탭 글자가 말한다. 선택 면(감시대상 토글·탭)은 중립 `--seg-on-*` 다.
 *   3. ★ **발주할 수 없는 전략은 무장되지 않는다**(WR-06). 켜는 방향만 `gateBlocked()` 로 막고 그
 *      사유는 **열 맨 아래 한 곳**(`lc-arm-blocked-panel`)에 모인다 — 그룹 안에 끼우면 사유가 뜰 때마다
 *      아래 행이 밀린다. 값 확정도 전송 직전 같은 판정(`armBlockOf`)을 지난다(필드 확정 훅).
 *      ★ **끄는 것은 언제나 허용**한다 — 무장 해제를 막으면 그게 더 위험하다(T-16-44).
 *   4. **삭제 버튼을 만들지 않는다**(D-08). 매수·매도·취소 게이트가 전부 꺼지면 그것이 삭제
 *      (`crud "D"`)다. 판정은 `crudOf()` 한 곳이고, 화면의 「삭제됨」은 서버 에코의 `crud` 를 본다.
 *   5. 매수취소 그룹 스위치 = `cancelQtyEnabled`(D-21). 꺼져 있어도 체결·잔량추적 체크는 켤 수 있고
 *      그래서 이 그룹만 흐리지 않는다 — 무장 판정은 `lib/limit-chaser.ts` 그대로다.
 *
 * ③ ★ 값은 **확정 1회 = 즉시 반영**이다 (Phase 20 D-04)
 *   시트 「{필드명} 적용」 · 인라인 Enter/포커스 이탈 · 체크 · 감시대상 · 스위치 **한 번**이 곧 전략 전체
 *   (32필드) 전송 한 번이다(`useLcFieldCommit`). 더티 누적도 「수정/되돌리기」 액션 바도 **없다** —
 *   옛 더티 모델은 이 plan(20-04)에서 폐기됐다. 성공 판정은 **에코의 그 필드 값 === 보낸 값**뿐이다
 *   (거부도 답 신호를 올리므로 답만으로 성공이라 읽지 않는다 · D-06). 값 필드는 낙관 반영하지 않는다 —
 *   행은 에코가 올 때까지 서버 값이다. 토글 종류는 전송 뒤 낙관 표시하고 실패하면 서버 값으로 되돌린다.
 *   ★ 워크벤치 더티 배관(카드 `dirtyCount` · 더티 호스트 · 이탈 경고)은 **고치지 않았다** — 이 폼이
 *     더티 수를 보내지 않으므로 늘 0 이고, 그래서 스스로 비활성이다(RESEARCH Pitfall 10).
 *
 * ④ ★ 에코가 도착하면 서버가 이긴다 (D-11 · D-27)
 *   목록은 에코 값으로 덮인다. 유일한 예외가 **편집 중인 버퍼**다 — 인라인 편집기·시트는 자기 버퍼를
 *   들고 있어 에코가 입력을 덮지 않는다(UI-SPEC E4 partial). 편집이 끝나면 행은 에코 값이다.
 *   `buyOrderAmount === 0`(=「서버가 모른다」)은 덮지 않으며 그 판단은 `formFromServer` 한 곳에 있다.
 *
 * ⑤ ★ 전송 필드는 **클라 입력 29 + 클라 고정 3 = 32** 이다
 *   S→C 전용 4필드(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *   `cancelQtyTrackBaseline`)를 **싣지 않는다**(Pitfall 6). 되보내면 「값이 왕복한다」는
 *   착각으로 에코 비교가 오염된다.
 *   고정 3(`sweepRecalcEnabled: true`·`sweepMinCount: 0`·`sweepMinRate: 0`)은 **폼에 노출하지
 *   않는다** — relay 빌더가 어차피 그 값으로 덮으므로(16-04), 입력을 열면 「설정했는데 반영
 *   안 됨」이 된다.
 *
 * ⑥ 토스트를 쓰지 않는다 (UI-SPEC D3)
 *   결과는 행(값 강조 900ms · 실패 링/말풍선) · 시트 상태 줄 · 폼 맨 위 한 줄(스위치·체크·감시대상
 *   전송 끊김) · 상태줄 · 전략 로그로만 알린다.
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
 *   - **감시대상**: `aria-pressed` 버튼 두 개다 — 라디오 그룹이면 방향키가 선택을 바꿔 **전송**한다.
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
  seedFromUpperLimit,
  type LimitChaserFormValues,
} from '@/lib/limit-chaser';
import { cn } from '@/lib/utils';
import { InlineValueEditor, type InlineSaveVia } from '@/components/trading/lc/inline-value-editor';
import {
  LC_BUY_GROUPS,
  LC_SELL_GROUPS,
  LC_SWITCH_LABEL,
  lcNavigableRows,
  lcRowByField,
  lcRowById,
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
  CheckValueRow,
  DerivedRow,
  GroupSwitch,
  SettingGroup,
  SettingRow,
  WatchTargetRow,
} from '@/components/trading/lc/setting-group';
import {
  LC_COMMIT_TEXT,
  useLcFieldCommit,
  type LcCommitFailure,
  type LcFailReason,
  type LcFieldKey,
} from '@/components/trading/lc/use-lc-field-commit';
import { useEditMode } from '@/lib/use-edit-mode';

/**
 * 무장 판정을 지나는 게이트 3종. **순서가 곧 사유 표시 우선순위**다 — 화면의 위→아래
 * (매수 → 한방 → 매도)와 같게 두어야 사유 패널이 짚어 준 곳과 사용자가 보는 곳이 일치한다.
 */
const GATE_KEYS = ['buyEnabled', 'sweepEnabled', 'sellEnabled'] as const;
type GateKey = (typeof GATE_KEYS)[number];

/**
 * 무장 불가 사유 (WR-06). 배지만 회색으로 두면 사용자는 **왜** 안 켜지는지 모른다.
 *
 * ★ **원인이 둘이고, 사용자가 만져야 할 곳이 서로 다르다** (GC-WR-12).
 *   1. **시세 미수신** — `stock_quotes` 행이 없으면 상한가·현재가가 0 이고, 상한가 시딩이
 *      가격 칸을 전부 0 으로 채운다. 이때 만져야 할 것은 **가격**이다.
 *   2. **주문금액 부족** — 가격은 정상인데 `floor(주문금액 / 매수가격) = 0주` 인 경우다.
 *      이쪽이 **훨씬 흔하다**: 기본 주문금액 10만원으로 127,400원 종목을 고르면 그 자리에서
 *      0주가 된다(`e2e/specs/trading-limit-chaser.spec.ts:181-192` 가 고정한 재현 조건).
 *      이때 만져야 할 것은 **금액**이고, 「시세를 못 받았다」고 말하면 사용자는 엉뚱한 곳
 *      (재접속·새로고침)을 만지며 그 사이 시장은 움직인다.
 *   옛 문구는 둘을 「시세를 받지 못해 …」 한 줄로 뭉개 ②를 ①로 오인시켰다.
 */
const ARM_BLOCKED_TEXT = {
  buyPrice: '시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.',
  buyAmount: '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
  sellPrice: '시세를 받지 못해 매도가격이 0 이에요. 매도가격을 입력하면 켤 수 있어요.',
  sellWatchQty: '매도 호가잔량이 0 이에요. 감시할 잔량을 입력하면 켤 수 있어요.',
  sweepPrice: '시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.',
} as const;

/**
 * 게이트의 **표시 이름** — 값은 각 `Group` 의 `title` 과 **같은 문자열**이어야 한다.
 *
 * 사용자가 목록 위에서 본 이름과 사유가 부르는 이름이 갈리면 그것이 곧 오독이다.
 * 사유 줄과 전송 직전 차단 문구(`armBlockOf`)가 **이 표 하나**를 읽는다.
 */
const GATE_LABEL: Record<GateKey, string> = {
  buyEnabled: '매수주문',
  sweepEnabled: '한방체결',
  sellEnabled: '매도주문',
};

/**
 * 게이트 하나가 왜 안 켜지는가 — **문구 산출 지점 하나**.
 *
 * 열 맨 아래 사유 패널과 필드 확정 훅의 차단 문구(`armBlockOf`)가 **이 함수 하나**를 읽는다. 두 곳에 따로
 * 적으면 언젠가 서로 다른 말을 하고, 그때 사용자는 「화면이 서로 다른 이유를 대는」 상태를
 * 본다 — 안전 게이트에서 그것은 문구 결함이 아니라 신뢰 결함이다(GC-WR-09 + GC-WR-12).
 *
 * ★ 판정은 `canArm*` 3식과 **같은 값**을 본다(`limit-chaser.ts` 의 산출식을 복제하지 않는다).
 */
function armBlockedTextOf(key: GateKey, values: LimitChaserFormValues): string {
  // 매도는 두 값이 독립이다 — 가격이 0 이면 시세, 아니면 감시 호가잔량이다(`canArmSell` 동형).
  if (key === 'sellEnabled') {
    return values.sellOrderPrice === 0 ? ARM_BLOCKED_TEXT.sellPrice : ARM_BLOCKED_TEXT.sellWatchQty;
  }
  // 매수는 「가격이 없다」와 「금액이 모자라 0주가 됐다」가 다른 행동을 요구한다.
  const buyReason =
    values.buyOrderPrice === 0 ? ARM_BLOCKED_TEXT.buyPrice : ARM_BLOCKED_TEXT.buyAmount;
  if (key === 'buyEnabled') return buyReason;
  /*
    한방은 `canArmSweep = sweepWatchPrice > 0 && canArmBuy` 라 원인이 **두 축**이다.
    자기 감시가가 0 인 경우를 먼저 짚고, 아니면 매수 쪽 사유를 **접두 없이 그대로** 쓴다.
    ★ 옛 접두어(「한방은 매수 무장 조건을 함께 요구해요 — 」)는 260911-w5h 에서 사라졌다.
      그것이 하던 「한방이라는 맥락 고지」는 이제 **게이트 이름 나열**(`GATE_LABEL`)이 한다 —
      같은 문장을 공유하는 두 게이트가 한 줄로 합쳐지므로(`armBlockedGroupsOf`) 접두를 남기면
      같은 사유가 두 줄로 갈려 중복 병합이 영영 일어나지 않는다.
  */
  return values.sweepWatchPrice === 0 ? ARM_BLOCKED_TEXT.sweepPrice : buyReason;
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
 * `GATE_KEYS` 순서(매수 → 한방 → 매도 = 화면 위→아래)로 막힌 게이트를 고른 뒤
 * `armBlockedTextOf` 결과가 **같은 문자열인 것끼리 묶는다**. 첫 등장 순서를 유지한다 —
 * 그래야 카드 위에서 본 순서와 사유 순서가 같다.
 *
 * ★ 문장은 여기서 짓지 않는다. 산출 지점은 계속 `armBlockedTextOf` 하나다(파일 상단 ② 5).
 */
function armBlockedGroupsOf(
  keys: readonly GateKey[],
  values: LimitChaserFormValues,
  canArm: Record<GateKey, boolean>,
  disabled: boolean,
): ArmBlockedGroup[] {
  if (disabled) return [];
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
 * ★ **무장 가능 판정** (WR-06) — 발주할 수 없는 전략은 켜지지 않는다. **산출 지점 하나**다.
 *
 * 렌더의 스위치 `disabled`·사유 패널(`canArm`), 필드 확정 훅의
 * 전송 직전 가드(`armBlockOf`, 20-01)가 전부 이 함수를 읽는다 — 식을 복제하면 한쪽만 고쳐진다.
 *
 * `mergeMasterAndQuote` 는 `stock_quotes` 행이 없으면 `upperLimit: 0`·`price: 0` 을 돌려주고,
 * 그런 종목을 고르면 상한가 시딩이 가격 칸을 전부 0 으로 채운다. 그 상태로 매수를 켜면
 * `{buyEnabled:true, buyOrderPrice:0, buyOrderQty:0}` 이 나가고(`UIntSchema` 는 0 을
 * 통과시킨다) 화면에는 「무장」 배지가 뜬다 — 사용자는 무장했다고 믿지만 그 전략은 영원히
 * 발주하지 않는다. 조용한 실패다.
 *
 * ★ 수량 산출식을 **복제하지 않는다**. `buyOrderQtyFromAmount` 를 그대로 읽는다 —
 *   `lib/limit-chaser.ts` 가 유일 지점이다.
 */
function canArmOf(values: LimitChaserFormValues): Record<GateKey, boolean> {
  const buyQty = buyOrderQtyFromAmount(values.buyOrderAmount, values.buyOrderPrice);
  const buy = values.buyOrderPrice > 0 && buyQty > 0;
  /*
    ★ 매도는 **예상 매도수량(`estimatedSellQty(매도가능, 비율)`)을 조건으로 쓰지 않는다.**

    `lib/limit-chaser.ts` 가 그 값을 **표시 전용**이라고 못박았고, 정본은 서버가 Set 시점에
    스냅샷하는 `sellOrderQty` 다. 화면에서 그 예상값 행 자체를 걷어낸 지금도(quick 260911-tuk)
    이 문장은 그대로다 — 표시를 지운 것이지 판정 기준을 바꾼 것이 아니다.
    게다가 상따의 정상 흐름은 「아직 한 주도 없는 상태에서 매수·매도를 함께 무장」이다.
    보유 0 을 무장 차단 조건으로 삼으면 이 화면의 주 동선이 통째로 막힌다.

    그래서 **서버 검증과 동형**으로 잡는다: 서버가 매도를 눕히는 조건은 `sellWatchQty === 0`
    (「0 이면 서버가 매도 활성화를 거부한다」)과 비율 범위이지 보유수량이 아니다. WR-06 이
    말한 「시세를 못 받은 종목」은 `sellOrderPrice === 0` 으로 여기서 그대로 걸린다.
  */
  const sell = values.sellOrderPrice > 0 && values.sellWatchQty > 0;
  /*
    한방(스윕)은 **매수 발주를 재계산**하는 보조 트리거다. `crudOf` 의 게이트 4종
    (`buyEnabled`·`sellEnabled`·`cancelQtyEnabled`·`cancelTradeEnabled`)에 `sweepEnabled` 가
    없다는 사실이 그것을 말한다 — 한방만 켠 전략은 서버가 삭제(`crud "D"`)로 정규화한다.
    그래서 한방은 **자기 감시가(`sweepWatchPrice`) + 매수 무장 조건**을 함께 요구한다.
    매수를 못 켜는 상태에서 한방만 켜는 것은 정의상 아무 발주도 만들지 못한다.
  */
  const sweep = values.sweepWatchPrice > 0 && buy;
  return { buyEnabled: buy, sellEnabled: sell, sweepEnabled: sweep };
}

/**
 * 이 값으로 보내면 relay 가 통째로 거부할 무장인가 — 사유 1줄, 아니면 `null`.
 *
 * ★ 조립 규칙은 `{게이트이름} · {사유}` 이고, 시트 검증(`validate`)과 필드 확정 훅이
 *   **이 함수 하나**를 읽는다(GC-WR-09 · T-16-60).
 * ★ **켜져 있는 게이트만** 본다(`values[key]`) — 끄는 방향은 막지 않는다(T-16-44).
 * ★★ **철거 면제**(R2-WR-02) — 게이트 4종이 전부 꺼진 요청은 전략을 내리는 요청이라 막지 않는다.
 *   relay `fanout.ts` `#strategyArmable` 도 `#isTeardown(cfg)` 를 먼저 면제한다. 첫 관문이
 *   마지막 관문보다 엄격하면 사용자는 전략을 내리려는데 화면이 막는다. `sweepEnabled` 는 삭제
 *   판정 4종에 들어 있지 않아 「게이트 4종 OFF + 한방 ON + 시세 끊김」이 정확히 그 함정이다.
 */
function armBlockOf(values: LimitChaserFormValues): string | null {
  if (isDeleteIntent(values)) return null;
  const canArm = canArmOf(values);
  const blocked = GATE_KEYS.find((key) => values[key] && !canArm[key]);
  return blocked === undefined
    ? null
    : `${GATE_LABEL[blocked]}${ARM_BLOCKED_SEP}${armBlockedTextOf(blocked, values)}`;
}

/** 매수 열이 품는 게이트 — 한방은 매수 열 안에 있으므로 그 사유도 이 열에 선다. */
const BUY_COLUMN_GATES: readonly GateKey[] = ['buyEnabled', 'sweepEnabled'];
/** 매도 열은 자기 사유만 갖는다 — 매수 사유가 매도 열에 새지 않는다. */
const SELL_COLUMN_GATES: readonly GateKey[] = ['sellEnabled'];

/**
 * 전송 실패 문구 — `strategy-status-card.tsx:358` 의 「연결이 끊겨 … 보내지 못했어요」 계열과
 * 같은 어조다. 두 화면이 같은 사건을 다른 말로 하면 사용자는 다른 사건으로 읽는다.
 * 폼 맨 위 `lc-submit-error` 는 이제 **스위치·체크·감시대상 전송 실패 전용**이다(값 전송 실패는
 * 행·시트·말풍선이 말한다 — UI-SPEC 레이아웃 계약).
 */
const SEND_FAILED_TEXT = {
  gate: '연결이 끊겨 켜기/끄기를 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.',
} as const;

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
   * 서버 에코 1건. `null`/`undefined` 면 미등록(신규) 전략이다 — 값·체크·감시대상 확정은 로컬만(A-P1).
   * **이 prop 이 바뀌면 폼이 서버값으로 덮인다**(D-11).
   */
  server?: RelayLimitChaser | null;
  /** 상한가 — 신규 폼에서 가격 5칸을 **1회만** 시딩한다. */
  upperLimit?: number;
  /** 세션 미준비 등 — 폼 전체 비활성. */
  disabled?: boolean;
  /** 그룹 헤더 상태 문구(`무장` / `발주 완료 · 무장 해제` 등). 매핑은 상위 소관이다. */
  buyStatusText?: string;
  sellStatusText?: string;
  /**
   * 한방체결 · 매수취소 그룹 제목 옆 보조문(18-10 카드 본문 — 「켜짐」/「꺼짐」 · 「감시 중」 등).
   * 없으면 그 자리에 아무것도 그리지 않는다 — 옛 상따 화면은 넘기지 않으므로 DOM 이 그대로다.
   */
  sweepStatusText?: string;
  cancelStatusText?: string;
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
   * `lc.set` 을 **보낸 직후** 통지 (16-13).
   *
   * ★ 상위가 이걸 알아야 하는 이유는 두 가지이고 둘 다 오해를 막는 장치다:
   *   ① **3초 무응답 판정** — 보낸 시각을 모르면 「미반영」을 셀 수 없다. 그래도 **자동
   *      재전송은 하지 않는다**(T-16-10): 재전송은 사용자가 누르지 않은 두 번째 등록이다.
   *   ② **에코의 출처** — 내가 보낸 요청의 에코와 다른 단말의 변경을 구분하지 못하면
   *      내 확정이 반영될 때마다 「다른 단말에서 변경됐어요」가 뜬다.
   */
  onSent?: (cfg: RelayLimitChaserInput) => void;
  /**
   * 에코가 도착해 폼을 서버값으로 덮었을 때 통지 (16-13, D-11).
   *
   * `overwrittenDirty` 는 Phase 20 D-04 이후 **언제나 0** 이다 — 더티 누적이 없고, 편집 중인 버퍼는
   * 편집기의 것이라 에코가 덮지 않는다(E4). 계약(필드 모양)은 카드 상태 훅과 맞추려고 남겼다.
   */
  onServerEcho?: (info: { changed: number; overwrittenDirty: number }) => void;
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
  className?: string;
}

export function LimitChaserForm({
  isin,
  accountNo,
  exchange,
  server = null,
  upperLimit,
  disabled = false,
  buyStatusText = '',
  sellStatusText = '',
  sweepStatusText,
  cancelStatusText,
  tab: controlledTab,
  hideTabs = false,
  serverAnswerSeq = 0,
  onSent,
  onServerEcho,
  unacked = false,
  currentPrice = 0,
  tickRule,
  className,
}: LimitChaserFormProps) {
  const { send } = useRelayContext();
  const [ownTab, setTab] = useState<'buy' | 'sell'>('buy');
  // 제어형이면 바깥 값이 이긴다(카드 본문의 3탭) — 자체 상태는 옛 화면 경로에서만 쓰인다.
  const tab = controlledTab ?? ownTab;

  const [form, setForm] = useState<LimitChaserFormValues>(() => {
    const base = defaultLimitChaserForm();
    if (server != null) return formFromServer(server, base);
    // 상한가 5칸 시딩은 **신규 폼 1회**다(`SeedFromUpperLimitOnce`). 매 렌더 걸면 에코가
    // 덮은 값을 다시 상한가로 되돌린다.
    return upperLimit != null && upperLimit > 0 ? { ...base, ...seedFromUpperLimit(upperLimit) } : base;
  });

  const formRef = useRef(form);
  formRef.current = form;
  const echoNotifyRef = useRef(onServerEcho);
  echoNotifyRef.current = onServerEcho;

  /*
    D-11 · D-27 — 에코가 도착하면 **서버가 이긴다.** 목록 값은 에코로 덮인다.
    편집 중인 버퍼(인라인 편집기 · 시트)는 폼 값이 아니라 **편집기의 것**이라 여기서 덮이지 않는다(E4).
    ★ 더티 누적이 없으므로(D-04) 「덮인 더티」는 언제나 0 이다 — 상위 배너는 「서버 값으로 맞췄어요」만 쓴다.
  */
  useEffect(() => {
    if (server == null) return;
    const prev = formRef.current;
    const next = formFromServer(server, prev);
    let changed = 0;
    for (const k of Object.keys(next) as (keyof LimitChaserFormValues)[]) {
      if (next[k] !== prev[k]) changed += 1;
    }
    setForm(next);
    echoNotifyRef.current?.({ changed, overwrittenDirty: 0 });
  }, [server]);

  /**
   * 폼 값 → 와이어 `cfg` (33필드). **조립 지점은 여기 하나다.**
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
    ★ Phase 20 D-04 — **한 필드 확정 = 전략 1회 전송**(`useLcFieldCommit`). 시트·인라인·체크·감시대상·
      스위치가 이 훅 하나를 공유한다. cfg 조립은 위 `buildCfg` 하나를 그대로 넘긴다(복제 금지).
      기준값은 폼 로컬 값이 아니라 서버 동기값이고(T-20-03), 값 필드는 낙관 반영하지 않는다(D-06).
  */
  const lc = useLcFieldCommit({
    server,
    formRef,
    setForm,
    buildCfg,
    send,
    onSent: (cfg) => sentNotifyRef.current?.(cfg),
    serverAnswerSeq,
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
  const { successSeq, lastSuccessField, commit: commitField, clearFailure } = lc;
  useEffect(() => {
    if (successSeq === 0 || lastSuccessField === null) return;
    setEditingField((cur) => (cur === lastSuccessField ? null : cur));
    setSheetField((cur) => (cur === lastSuccessField ? null : cur));
  }, [successSeq, lastSuccessField]);

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
      if (via === 'blur') endEdit();
      else if (via === 'enter' && (outcome === 'noop' || outcome === 'local')) endEdit();
    },
    [commitField, endEdit],
  );
  const handleInlineCancel = useCallback(
    (field: LcNumField) => {
      clearFailure(field);
      endEdit();
    },
    [clearFailure, endEdit],
  );
  /**
   * Tab / Shift+Tab (D-14 · 가정 A5) — **같은 그룹**의 다음/이전 값 행. 감시대상 · 값 없는 체크 행 ·
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
      if (outcome === 'noop' || outcome === 'local') setSheetField(null);
    },
    [commitField],
  );
  const handleSheetClose = useCallback(() => {
    if (sheetField !== null) clearFailure(sheetField);
    setSheetField(null);
  }, [clearFailure, sheetField]);

  /*
    ★ **무장 가능 판정** (WR-06) — 발주할 수 없는 전략은 켜지지 않는다. 산출식은 모듈 수준
      `canArmOf` **하나**다(20-01) — 필드 확정 훅의 전송 직전 가드(`armBlockOf`)가 같은 식을
      읽어야 하므로 컴포넌트 밖으로 옮겼다. 근거 주석도 그 함수에 있다.
  */
  const {
    buyEnabled: canArmBuy,
    sellEnabled: canArmSell,
    sweepEnabled: canArmSweep,
  } = canArmOf(form);

  /*
    ★ **`useMemo` 다** (GC-IN-01). 객체 리터럴로 두면 매 렌더 새 참조가 되고, 그것을 의존성으로
      받는 아래 `gateBlocked` 의 `useCallback` 이 **아무것도 메모하지 않는다** — 21개 컨트롤이
      붙은 고밀도 폼에서 한 글자 입력마다 스위치 3개의 콜백이 통째로 새로 만들어진다.
    의존성이 세 boolean 이면 충분한 근거: `canArmBuy/Sell/Sweep` 는 이미 폼 값에서 계산이
      끝난 **결과**이고, 이 객체는 그 셋을 키에 얹기만 한다. 폼 값을 다시 의존성에 넣으면
      결과가 그대로인 입력(예: 비교가격 변경)에도 참조가 깨져 메모가 다시 무의미해진다.
  */
  const canArm: Record<GateKey, boolean> = useMemo(
    () => ({ buyEnabled: canArmBuy, sellEnabled: canArmSell, sweepEnabled: canArmSweep }),
    [canArmBuy, canArmSell, canArmSweep],
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
      if (!next) return false;
      return !canArm[key];
    },
    [disabled, canArm],
  );

  /**
   * 스위치 · 체크 · 감시대상 — **확인 없이 즉시** 한 필드 전송(Phase 16 D-05 · D-04).
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
    폼 맨 위 한 줄 = 스위치·체크·감시대상의 **보내지 못한 실패**(끊김 · 무장 불가 · 범위 밖)에서 파생한다
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
  const statusOf: Record<LcStatusKey, string | undefined> = {
    buy: buyStatusText,
    sweep: sweepStatusText,
    sell: sellStatusText,
    cancel: cancelStatusText,
  };
  /** 스위치를 지금 누를 수 없는가 — 매수취소(`cancelQtyEnabled`)는 무장 판정 게이트가 아니다. */
  const gateDisabled = (gate: LcGate): boolean =>
    gate === 'cancelQtyEnabled' ? disabled : gateBlocked(gate, !form[gate]);

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
        initialValue={typeof failure?.value === 'number' ? failure.value : form[field]}
        upperLimit={unit === '원' ? (upperLimit ?? 0) : 0}
        tickRule={tickRule}
        min={range?.min}
        max={range?.max}
        validate={(v) => armBlockOf({ ...lcBaseValues(server, formRef.current), [field]: v })}
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
   * 자신의 핸들러보다 먼저 돈다). 체크 버튼 · 감시대상 · 스위치는 `data-lc-field` 버튼이 아니어서
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

  /** 값 행이 공유하는 편집 배선(값 행 · 체크 값 행의 값 버튼). */
  function valueProps(field: LcNumField) {
    return {
      disabled,
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

  function renderRow(group: LcGroupSpec, row: LcRowSpec): ReactNode {
    switch (row.kind) {
      case 'value':
        return (
          <SettingRow
            key={row.id}
            id={row.id}
            label={row.label}
            unit={row.unit}
            value={form[row.field]}
            {...valueProps(row.field)}
            onActivate={(el) => activateRow(row.field, el)}
            editor={
              editingField === row.field ? inlineEditorOf(row.field, row.id, row.label, row.unit, row.range) : undefined
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
            groupTitle={group.title ?? ''}
            label={row.label}
            checked={form[check]}
            onToggle={() => commitToggle(check, !form[check])}
            checkBusy={isBusy(check)}
            checkFlash={lc.flashField === check}
            checkFailureText={toggleFailureTextOf(check)}
            {...(row.kind === 'checkValue' && v !== null
              ? {
                  ...v,
                  value: form[row.field],
                  unit: row.unit,
                  valueId: row.id,
                  onActivateValue: (el: HTMLElement) => activateRow(row.field, el),
                  editor:
                    editingField === row.field
                      ? inlineEditorOf(row.field, row.id, row.label, row.unit, row.range)
                      : undefined,
                }
              : {})}
            disabled={disabled}
          />
        );
      }
      case 'watch':
        return (
          <WatchTargetRow
            key="watch"
            value={form.buyWatchSide}
            onSelect={(side) => commitToggle('buyWatchSide', side)}
            disabled={disabled}
            busy={isBusy('buyWatchSide')}
            flash={lc.flashField === 'buyWatchSide'}
            failureText={toggleFailureTextOf('buyWatchSide')}
          />
        );
      case 'derived':
        // S→C 전용 — 서버가 매도 진입을 래치한 뒤에만 존재한다(UI Considerations E1 partial).
        return server?.sellEntryLatched ? (
          <DerivedRow key="derived" label={row.label} value={server.sellQtyTrackBaseline} unit="주" />
        ) : null;
    }
  }

  function renderGroup(spec: LcGroupSpec): ReactNode {
    const gate = spec.gate;
    return (
      <SettingGroup
        key={spec.slot}
        spec={spec}
        statusText={spec.title && spec.statusKey ? statusOf[spec.statusKey] : undefined}
        on={gate ? form[gate] : undefined}
        switchNode={
          gate ? (
            <GroupSwitch
              id={gate === 'cancelQtyEnabled' ? 'lc-cancel-qty' : undefined}
              label={LC_SWITCH_LABEL[gate]}
              checked={form[gate]}
              // ★ 켜는 방향만 막는다 — `!form[gate]` 를 넘기므로 **켜져 있으면 언제나 끌 수 있다**.
              disabled={gateDisabled(gate)}
              onCheckedChange={(v) => commitToggle(gate, v)}
              failureText={toggleFailureTextOf(gate)}
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
  const buyReasons = armBlockedGroupsOf(BUY_COLUMN_GATES, form, canArm, disabled);
  const sellReasons = armBlockedGroupsOf(SELL_COLUMN_GATES, form, canArm, disabled);

  /**
   * 한 열(pane) — ≥700 열 머리 「● 매수」/「● 매도」 → 그룹들(사이 10) → 사유 패널.
   * ★ 비활성 pane 숨김은 **CSS 클래스**다 (260912-k2x) — 본문 폭은 미디어 질의 API 로 관측할 수
   *   없어 폭 판정을 CSS 에 통째로 넘기고 JS 는 「어느 탭이 선택됐나」만 안다. **조건부 렌더로
   *   바꾸지 마라** — 언마운트하면 나가 있던 확정·열린 편집이 사라진다.
   */
  function pane(side: 'buy' | 'sell', groups: readonly LcGroupSpec[], reasons: ArmBlockedGroup[]): ReactNode {
    return (
      <div data-pane={side} className={cn('min-w-0', tab !== side && 'hidden @min-[700px]/lc:block')}>
        <div
          data-slot="lc-column-head"
          className="mt-2.5 hidden items-center gap-1.5 px-0.5 text-[15px] leading-[1.5] font-bold text-[var(--fg)] @min-[700px]/lc:flex"
        >
          <span
            aria-hidden="true"
            className={cn('size-2 flex-none rounded-full', side === 'buy' ? 'bg-[var(--up)]' : 'bg-[var(--down)]')}
          />
          {side === 'buy' ? '매수' : '매도'}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5 @min-[700px]/lc:mt-2.5">{groups.map(renderGroup)}</div>
        <ArmBlockedPanel groups={reasons} />
      </div>
    );
  }

  // 시트 입력 — 닫혀 있을 때도 같은 필드 기준으로 계산한다(열림은 `sheetRow` 하나가 정한다).
  const sheetRow = sheetField === null ? null : lcRowByField(sheetField);
  const sheetKey: LcNumField = sheetField ?? 'sweepMinTickCount';
  const sheetFailure = lc.failures[sheetKey];
  const sheetBusy = isBusy(sheetKey);
  const sheetStatusKey = sheetRow?.group.statusKey;

  return (
    <div data-slot="limit-chaser-form" className={cn('min-w-0', className)} onPointerDownCapture={handlePointerDownCapture}>
      {submitError === '' ? null : (
        /*
          스위치·체크·감시대상을 눌렀는데 못 나갔거나 무장 판정에 막혔다 — 화면이 그 사실을 말한다.
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
          className="mb-[var(--s-2)] grid grid-cols-2 gap-[var(--s-1)] @min-[700px]/lc:hidden"
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

      {/* 매수·매도 두 열(본문 700~). **그리드 자식 전부 `min-w-0`**(lessons.md). 간격 8 · ≥992 16 은 기존 값. */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--s-2)] @min-[700px]/lc:grid-cols-2 @min-[992px]/lc:gap-[var(--s-4)] [&>*]:min-w-0">
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
        title={sheetRow?.row.label ?? ''}
        description={sheetRow?.row.desc ?? ''}
        unit={sheetRow?.row.unit ?? '건'}
        purpose="apply"
        initialValue={typeof sheetFailure?.value === 'number' ? sheetFailure.value : form[sheetKey]}
        // 값 필드는 낙관 반영이 없어 폼 값 = 서버 동기값이다(D-06).
        serverValue={form[sheetKey]}
        // 필드 범위(relay 스키마 · CR-01) — 범위 밖이면 확인 잠금 · 범위 밖 `set` 칩(잔량추적의 100 등) 비활성.
        // D-15a — 호가 단위 잠금 강도(종목 분류). 원 단위 행만 쓴다.
        ctx={{
          current: currentPrice,
          upper: upperLimit ?? 0,
          min: sheetRow?.row.range?.min,
          max: sheetRow?.row.range?.max,
          tickRule,
        }}
        status={sheetBusy ? 'busy' : sheetFailure !== undefined ? 'failed' : 'editing'}
        failureText={sheetFailure?.text ?? null}
        // 그 필드가 속한 그룹이 「감시 중」이면 한 줄 안내(추가 확인 없음 · D-05). 가격 섹션은 매수주문·
        // 매도주문 그룹의 상태를 따른다(`lc-fields.ts` `statusKey`).
        armedNotice={sheetStatusKey !== undefined && statusOf[sheetStatusKey] === '감시 중'}
        validate={(v) => armBlockOf({ ...lcBaseValues(server, formRef.current), [sheetKey]: v })}
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

/** 폼 맨 위 한 줄이 말하는 토글 실패 — **보내지 못한 것**(끊김 · 무장 불가 · 범위 밖). 거부·무응답은 말풍선. */
const SUBMIT_ERROR_REASONS: ReadonlySet<LcFailReason> = new Set(['disconnected', 'armBlocked', 'invalid']);

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
