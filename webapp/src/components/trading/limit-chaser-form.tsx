'use client';

/**
 * LimitChaserForm — 상따 매수/매도 폼 카드 (UI-SPEC A4~A9, TRADE-01).
 *
 * ① 무엇을 어디에
 *   본문 폭 **700px 이상**이면 매수·매도 두 카드가 **2열**로 나란히 선다. 그 아래(폰 밴드)
 *   에서는 **「매수」/「매도」 세그먼트 탭**이고 탭당 카드 하나만 보인다.
 *   ★ 판정 기준은 뷰포트가 아니라 **본문 폭**이다 (260912-k2x). 밴드 표와 경계 셋의 실측
 *     근거는 `webapp/src/styles/globals.css` §2.2b 가 정본이다 — 여기에 복사하지 마라.
 *   ★ **탭은 폰 전용이고, 숨김은 CSS 이며, 언마운트하지 않는다.** 뷰포트를 재던 경로는
 *     사라졌다(본문 폭은 미디어 질의 API 로 관측할 수 없다). 비활성 pane 은 `display:none`
 *     이라 접근성 트리에서도 빠지지만 **DOM 에는 남는다** — 조건부 렌더로 바꾸면 탭을 옮길
 *     때마다 매도 설정이 초기화되고 더티 카운트·에코 덮어쓰기 계산이 함께 망가진다.
 *   ★ 하단 더티 액션 바는 `document.body` 로 **포털**된다 — 상따 본문 컨테이너가 layout
 *     containment 를 걸어 `position:fixed` 자손의 컨테이닝 블록이 되기 때문이다. 포털을
 *     걷으면 그 바가 본문 끝으로 내려앉는다.
 *   ★ 카드는 **2개**다. 그룹 6개를 카드 6개로 쪼개지 않는다 — 라벨 컬럼 폭(`--lw`)이 카드
 *     안에서 공유돼야 값이 세로로 정렬되고, 카드를 쪼개면 그 정렬이 깨진다.
 *
 * ② ★ 오조작 방지 — 이 파일의 존재 이유
 *   1. **색·위치·문구 3중 일치** — 매수 = `--up` · **왼쪽/위** · 「매수」, 매도 = `--down` ·
 *      **오른쪽/아래** · 「매도」. ★ 옛 「그룹 좌측 3px 액센트 바」는 260911-w5h 에서 사라졌다.
 *      그 축을 카드 안에서 잇는 일은 이제 **셋이 함께** 한다 — ⓐ 상단 세그먼트 탭(선택 시
 *      매수 `--up` / 매도 `--down` 테두리+배경) ⓑ 게이트 스위치 색(`tone`) ⓒ 그룹 소제목
 *      (「매수주문」·「한방체결」·「매도주문」). 바 하나를 지운 것이지 축을 지운 것이 아니다.
 *      ★ **「감시 대상」 세그먼트는 그 축의 예외**다 (260912-gyz) — 그룹색이 아니라 자기
 *        선택지의 호가 방향색(매도잔량 `--down` · 매수잔량 `--up`)을 따른다. 근거는 세그먼트
 *        블록 주석에 있다.
 *   2. **자동취소(가드) 그룹은 중립색**이다. 경고 전용 색 토큰은 이 저장소에 **없다**(UI-SPEC
 *      C1/FLAG-1) — 없는 토큰을 쓰면 색이 통째로 죽어 「경고인데 안 보이는 경고」가 된다.
 *   3. ★ **규율 3(확인 다이얼로그)은 D-05 로 뒤집혔다.** `order-panel.tsx` 는 제출마다
 *      다이얼로그를 거치지만, 여기 **스위치 3개는 확인 없이 즉시 전송**한다. 상한가 직전에
 *      다이얼로그를 한 번 더 거치게 하면 그 1~2초가 체결을 놓치는 비용이다.
 *      대신 오터치 방어는 **기하학**으로 한다 — **44×26 크기 + 최소 8px 간격 + 그룹 헤더
 *      우측 끝 고정 위치**(`ml-auto`). 이 세 가지가 이 파일에서 유일한 오터치 방어이므로
 *      크기·간격·위치를 줄이는 변경은 곧 안전장치를 줄이는 변경이다.
 *   4. **제출 후 즉시 재활성 금지** — 전송 중에는 액션 바가 `반영 중…` 으로 잠긴다.
 *   5. ★ **발주할 수 없는 전략은 무장되지 않는다**(WR-06). 발주가·산출 수량이 0 이면 스위치를
 *      **켤 수 없고** 그 사유가 **카드 맨 아래 한 곳**(`data-slot="lc-arm-blocked-panel"`)에
 *      모인다 — 그룹 안에 끼워 넣으면 사유가 뜰 때마다 아래 입력 행이 세로로 밀린다.
 *      같은 문장을 공유하는 게이트는 **한 줄로 합쳐지고**(`armBlockedGroupsOf`) 게이트 이름이
 *      `·` 로 앞에 나열된다(`GATE_LABEL`). 문구 산출 지점은 계속 `armBlockedTextOf` **하나**고,
 *      `handleSubmit` 의 차단 문구도 **같은 조립 규칙**(`{게이트이름} · {사유}`)을 쓴다. 판정은
 *      `gateBlocked()` 하나이고 렌더의 `disabled` 와 **전송 직전 가드 2곳**(`toggleGate` ·
 *      `handleSubmit`)이 그것을 함께 읽는다 (GC-WR-09 이전에는 `toggleGate` 만 읽었고,
 *      그래서 「수정」은 relay 에 통째로 거부될 값을 그대로 밀어 넣었다).
 *      ★ **끄는 것은 언제나 허용**한다 — 무장 해제를 막으면 그게 더 위험하다(T-16-44).
 *      relay 도 같은 조건을 거부하므로 UI 를 우회한 경로가 있어도 무장 상태가 만들어지지 않는다.
 *   6. **삭제 버튼을 만들지 않는다**(D-08). 매수·매도·취소 게이트가 전부 꺼지면 그것이 삭제
 *      (`crud "D"`)다. 판정은 `crudOf()` 한 곳이고, **화면의 「삭제됨」 표시는 서버 에코의
 *      `crud`** 를 본다(클라 판정은 전송용 힌트일 뿐이다).
 *
 * ③ ★ 값은 자동 반영되지 않는다 (D-06)
 *   초안의 「0.3초 자동 반영」은 폐기됐다. 이 파일에 **디바운스도 지연 전송도 없다.**
 *   값이 서버값과 달라지면 그 필드가 더티가 되고(라벨 `--primary` + `● ` 접두 · 입력 테두리
 *   `--primary` **한 겹**), 하단 `DirtyActionBar` 의 「수정」을 눌러야 나간다.
 *   ★ 옛 2px 링 그림자는 260911-w5h 에서 사라졌다 — 포커스·더티 둘 다 **테두리 한 겹**이
 *     유일한 표현이다. 비색 경로는 라벨의 `● ` 접두가 그대로 잇는다(WCAG 1.4.1).
 *   ★ **스위치는 더티 값을 함께 밀어낸다** — 스위치를 켜면 그 시점 폼 전체가 실린다.
 *     스위치를 막지 않는 대신 액션 바 보조문이 그 사실을 상시 고지한다.
 *
 * ④ ★ 에코가 도착하면 서버가 이긴다 (D-11)
 *   더티 필드도 **덮어쓴다.** 편집 중 보호·보류가 없다 — 「내가 치던 값이 남아 있다」는
 *   착각이 실제 서버 상태와 갈리는 순간이 이 화면에서 가장 비싼 오해다. 덮어쓴 필드는
 *   ≤150ms 배경 플래시로 한 번 알리고, 배너·로그는 상위(`limit-chaser-client`) 소관이다.
 *   유일한 예외가 `buyOrderAmount === 0`(=「서버가 모른다」)이고 그 판단은 `formFromServer`
 *   한 곳에 있다.
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
 *   결과는 액션 바의 소멸 + 상태줄 + 전략 로그로만 알린다.
 *
 * ⑦ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보)
 *   `--primary` 는 `--down`(매도 파랑)과 값이 완전히 같다. 채움 면의 글자색은 `--primary-fg`
 *   대신 값이 동일한 `--destructive-fg` 를 쓴다 — 규율은 `dirty-action-bar.tsx` ③ 에 있고
 *   이 파일에는 채움 면이 없다.
 *
 * ⑧ 왜 Radix 를 두 군데에서 쓰지 않는가
 *   - **탭**: 단일선택 `ToggleGroup` 은 항목에 `role="radio"` 를 강제해 UI-SPEC 이 요구하는
 *     `tablist`/`tab` 대응이 깨진다(`order-panel.tsx:422` 와 같은 판단이다).
 *   - **스위치**: `ui/switch.tsx` 의 thumb 기하(16px · `translate-x-4`)가 컴포넌트 안에
 *     하드코딩돼 호출부에서 못 바꾼다. 이 화면의 유일한 오터치 방어가 **정확히 44×26** 이라
 *     (② 3) 공용 primitive 를 이 한 화면 때문에 고치는 대신 순수 버튼으로 그린다.
 *   - **체크박스**: `ui/checkbox.tsx` 는 `<button role="checkbox">` 라 `<label for>` 로
 *     이름을 붙일 수 없다. 21개 컨트롤이 붙는 고밀도 폼에서 라벨 클릭 토글과 라벨 연결을
 *     동시에 얻으려면 네이티브 `<input type="checkbox">` 가 맞다.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
} from '@gh-radar/shared';

import { useRelayContext } from '@/lib/relay-provider';
import {
  buyOrderQtyFromAmount,
  crudOf,
  defaultLimitChaserForm,
  dirtyFieldsOf,
  formFromServer,
  isDeleteIntent,
  seedFromUpperLimit,
  type LimitChaserDirtyField,
  type LimitChaserFormValues,
} from '@/lib/limit-chaser';
import { cn } from '@/lib/utils';
import { DirtyActionBar } from '@/components/trading/dirty-action-bar';

/** 액션 바 보조문 — 상따 정본(UI-SPEC §CTA). 스위치가 더티를 함께 민다는 사실을 상시 고지한다. */
const DIRTY_HINT = '「수정」을 눌러야 반영돼요 · 스위치를 켜면 변경한 값까지 함께 반영돼요';

/**
 * 무장 판정을 지나는 게이트 3종. **순서가 곧 사유 표시 우선순위**다 — 화면의 위→아래
 * (매수 → 한방 → 매도)와 같게 두어야 「수정」이 짚어 준 곳과 사용자가 보는 곳이 일치한다.
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
 * 사용자가 카드 위에서 본 이름과 사유가 부르는 이름이 갈리면 그것이 곧 오독이다.
 * 사유 줄과 `handleSubmit` 차단 문구가 **이 표 하나**를 읽는다.
 */
const GATE_LABEL: Record<GateKey, string> = {
  buyEnabled: '매수주문',
  sweepEnabled: '한방체결',
  sellEnabled: '매도주문',
};

/**
 * 게이트 하나가 왜 안 켜지는가 — **문구 산출 지점 하나**.
 *
 * 그룹 렌더의 사유줄과 `handleSubmit` 의 차단 문구가 **이 함수 하나**를 읽는다. 두 곳에 따로
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

/** 사유 한 줄의 조립 규칙 — 패널과 `handleSubmit` 이 **같은 규칙**을 쓴다. */
const ARM_BLOCKED_SEP = ' · ';

/** 매수 카드가 품는 게이트 — 한방은 매수 카드 안에 있으므로 그 사유도 이 카드에 선다. */
const BUY_CARD_GATES: readonly GateKey[] = ['buyEnabled', 'sweepEnabled'];
/** 매도 카드는 자기 사유만 갖는다 — 매수 사유가 매도 카드에 새지 않는다. */
const SELL_CARD_GATES: readonly GateKey[] = ['sellEnabled'];

/**
 * 전송 실패 문구 — `strategy-status-card.tsx:358` 의 「연결이 끊겨 … 보내지 못했어요」 계열과
 * 같은 어조다. 두 화면이 같은 사건을 다른 말로 하면 사용자는 다른 사건으로 읽는다.
 */
const SEND_FAILED_TEXT = {
  gate: '연결이 끊겨 스위치를 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.',
  submit: '연결이 끊겨 수정 내용을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.',
} as const;

const NUM = new Intl.NumberFormat('ko-KR');
const EMPTY_FLASH: ReadonlySet<string> = new Set();

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
   * 서버 에코 1건. `null`/`undefined` 면 신규 폼이고 더티 기준선이 없다.
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
  /** 더티 수 통지 — 상위의 이탈 경고(라우터 가드 · `beforeunload`)가 이 값을 쓴다. */
  onDirtyCountChange?: (count: number) => void;
  /**
   * `lc.set` 을 **보낸 직후** 통지 (16-13).
   *
   * ★ 상위가 이걸 알아야 하는 이유는 두 가지이고 둘 다 오해를 막는 장치다:
   *   ① **3초 무응답 판정** — 보낸 시각을 모르면 「미반영」을 셀 수 없다. 그래도 **자동
   *      재전송은 하지 않는다**(T-16-10): 재전송은 사용자가 누르지 않은 두 번째 등록이다.
   *   ② **에코의 출처** — 내가 보낸 요청의 에코와 다른 단말의 변경을 구분하지 못하면
   *      내 「수정」이 반영될 때마다 「다른 단말에서 변경됐어요」가 뜬다.
   */
  onSent?: (cfg: RelayLimitChaserInput) => void;
  /**
   * 에코가 도착해 폼을 서버값으로 덮었을 때 통지 (16-13, D-11).
   *
   * `overwrittenDirty` 는 그중 **사용자가 고치던** 필드 수다 — 배너 문구
   * 「수정하던 값 {N}개가 서버 값으로 바뀌었어요」의 N 이고, **이 폼만이 알 수 있다**
   * (상위는 폼 값을 갖고 있지 않다).
   */
  onServerEcho?: (info: { changed: number; overwrittenDirty: number }) => void;
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
  onDirtyCountChange,
  onSent,
  onServerEcho,
  className,
}: LimitChaserFormProps) {
  const { send } = useRelayContext();
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  /**
   * 하단 액션 바 포털의 SSR 가드 — 서버 렌더에는 `document` 가 없다.
   * 마운트 뒤 한 번만 true 가 되고 다시 false 로 돌아가지 않는다.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [submitting, setSubmitting] = useState(false);
  /**
   * 전송 직전 가드가 막았거나(무장 불가) 소켓이 받아 주지 않았을 때의 사유 1줄.
   * 토스트를 쓰지 않으므로(파일 상단 ⑥) 화면에 남는 문장이 유일한 통보 수단이다.
   */
  const [submitError, setSubmitError] = useState('');
  const [flash, setFlash] = useState<ReadonlySet<string>>(EMPTY_FLASH);

  const [form, setForm] = useState<LimitChaserFormValues>(() => {
    const base = defaultLimitChaserForm();
    if (server != null) return formFromServer(server, base);
    // 상한가 5칸 시딩은 **신규 폼 1회**다(`SeedFromUpperLimitOnce`). 매 렌더 걸면 에코가
    // 덮은 값을 다시 상한가로 되돌린다.
    return upperLimit != null && upperLimit > 0 ? { ...base, ...seedFromUpperLimit(upperLimit) } : base;
  });

  const flashTimer = useRef<number | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  /**
   * 직전 에코. **더티 기준선**이라 에코 효과 안에서만 갱신한다 —
   * 「덮이기 직전에 사용자가 고치고 있던 필드」를 세려면 새 서버값이 아니라 옛 서버값과
   * 비교해야 한다. 렌더 시점의 `dirty` 를 쓰면 이미 새 서버값으로 계산돼 있어 어긋난다.
   */
  const prevServerRef = useRef<RelayLimitChaser | null>(null);
  const echoNotifyRef = useRef(onServerEcho);
  echoNotifyRef.current = onServerEcho;

  /*
    D-11 — 에코가 도착하면 **서버가 이긴다.** 더티 필드도 덮는다.
    보류 큐도, 「편집 중이니 나중에」도 없다. 덮은 필드만 ≤150ms 플래시로 알린다.
  */
  useEffect(() => {
    if (server == null) return;
    const prev = formRef.current;
    const prevServer = prevServerRef.current;
    prevServerRef.current = server;
    // 덮이기 **직전**의 더티 집합. 상위 배너의 「수정하던 값 {N}개」가 이 수다.
    const wasDirty = new Set<string>(dirtyFieldsOf(prevServer, prev));
    const next = formFromServer(server, prev);
    const changed = new Set<string>();
    for (const k of Object.keys(next) as (keyof LimitChaserFormValues)[]) {
      if (next[k] !== prev[k]) changed.add(k);
    }
    setForm(next);
    echoNotifyRef.current?.({
      changed: changed.size,
      overwrittenDirty: [...changed].filter((k) => wasDirty.has(k)).length,
    });
    if (changed.size === 0) return;
    setFlash(changed);
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(EMPTY_FLASH), 150);
  }, [server]);

  useEffect(
    () => () => {
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const dirty = useMemo(() => dirtyFieldsOf(server, form), [server, form]);
  const dirtySet = useMemo(() => new Set<string>(dirty), [dirty]);

  const notifyDirty = useRef(onDirtyCountChange);
  notifyDirty.current = onDirtyCountChange;
  useEffect(() => {
    notifyDirty.current?.(dirty.length);
  }, [dirty.length]);

  /**
   * 폼 값 → 와이어 `cfg` (33필드). **조립 지점은 여기 하나다.**
   *
   * `crud` 는 `crudOf(values)` 다 — 「수정」 경로에서도 클라가 `"C"` 를 박지 않는다.
   * 자동취소 체크박스는 스위치가 아니라 **값**이라 「수정」으로만 꺼지는데, 그때 매수·매도가
   * 이미 꺼져 있으면 그 「수정」이 곧 삭제다. `"C"` 를 박으면 서버가 어차피 `"D"` 로
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

  const setField = useCallback(<K extends keyof LimitChaserFormValues>(key: K, value: LimitChaserFormValues[K]) => {
    // ★ 여기서 전송하지 않는다(D-06). 디바운스도 타이머도 없다 — 「수정」 버튼이 유일한 출구다.
    setForm((prev) => ({ ...prev, [key]: value }));
    /*
      ★ **원인을 고치면 문구가 접힌다** (R2-IN-01 / T-16-86). 옛 동작에서 `submitError` 는
        (a) 다음 성공 전송 (b) `[server]` 에코 두 곳에서만 지워졌다. 그래서 「주문금액이
        매수가격보다 작아 주문수량이 0 주예요」를 보고 **금액을 올려도** `role="alert"` 문구가
        그대로 남았다. 상시 표시되는 안전 문구는 다음번에 읽히지 않고, 그때 진짜 경고도 함께
        죽는다.
        **값 변경만을 트리거로 삼는다** — 「수정」 실패 직후에 스스로 지워지면 사용자가 읽을
        시간이 없다. `handleSubmit`·`toggleGate` 는 `setField` 를 거치지 않으므로 방금 띄운
        문구가 같은 렌더에서 지워질 경로가 없다. `[server]` 이펙트의 해제는 그대로 둔다.
    */
    setSubmitError('');
  }, []);

  /**
   * 스위치 3종 — **확인 없이 즉시 전송**(D-05).
   *
   * cfg 에는 뒤집힌 게이트뿐 아니라 **그 시점 폼 전체(더티 포함)** 가 실린다. 액션 바
   * 보조문이 그 사실을 상시 고지하고 있으므로 여기서 더티를 걸러내지 않는다 — 걸러내면
   * 「스위치를 켰는데 방금 고친 값이 안 갔다」가 된다.
   */
  const sentNotifyRef = useRef(onSent);
  sentNotifyRef.current = onSent;

  /*
    ★ **무장 가능 판정** (WR-06) — 발주할 수 없는 전략은 켜지지 않는다.

    `mergeMasterAndQuote` 는 `stock_quotes` 행이 없으면 `upperLimit: 0`·`price: 0` 을 돌려주고,
    그런 종목을 고르면 상한가 시딩이 가격 칸을 전부 0 으로 채운다. 그 상태로 매수를 켜면
    `{buyEnabled:true, buyOrderPrice:0, buyOrderQty:0}` 이 나가고(`UIntSchema` 는 0 을
    통과시킨다) 화면에는 「무장」 배지가 뜬다 — 사용자는 무장했다고 믿지만 그 전략은 영원히
    발주하지 않는다. 조용한 실패다.

    ★ 산출식을 **복제하지 않는다**. 아래 `buyQty` 파생값을 그대로 읽는다 —
      `lib/limit-chaser.ts` 가 유일 지점이다.
  */
  const buyQty = buyOrderQtyFromAmount(form.buyOrderAmount, form.buyOrderPrice);

  const canArmBuy = form.buyOrderPrice > 0 && buyQty > 0;
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
  const canArmSell = form.sellOrderPrice > 0 && form.sellWatchQty > 0;
  /*
    한방(스윕)은 **매수 발주를 재계산**하는 보조 트리거다. `crudOf` 의 게이트 4종
    (`buyEnabled`·`sellEnabled`·`cancelQtyEnabled`·`cancelTradeEnabled`)에 `sweepEnabled` 가
    없다는 사실이 그것을 말한다 — 한방만 켠 전략은 서버가 삭제(`crud "D"`)로 정규화한다.
    그래서 한방은 **자기 감시가(`sweepWatchPrice`) + 매수 무장 조건**을 함께 요구한다.
    매수를 못 켜는 상태에서 한방만 켜는 것은 정의상 아무 발주도 만들지 못한다.
  */
  const canArmSweep = form.sweepWatchPrice > 0 && canArmBuy;

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

  const toggleGate = useCallback(
    (key: GateKey, next: boolean) => {
      // 세션 가드(`disabled`)와 무장 가드가 **같은 함수** 안에 있다 — `disabled` ←
      // `limit-chaser-client.tsx` 의 `LimitChaserSurface`(`status !== 'ready'`, 16-19 감사).
      if (gateBlocked(key, next)) return;
      const values: LimitChaserFormValues = { ...formRef.current, [key]: next };
      const cfg = buildCfg(values);
      /*
        ★ **`setForm` 을 전송 뒤로 옮겼다** (GC-WR-06 / T-16-59). 옛 순서는 낙관 반영이
          먼저였고, 그러면 소켓이 받지 않은 요청에도 스위치가 켜진 것처럼 보인다 — 이 화면
          최악의 결과다(사용자는 무장했다고 믿고 시장은 계속 움직인다). `send` 가 `false`
          면 **보내지 않았음이 확실**하므로(`use-relay-socket.ts:863`) 폼도 그대로 둔다.
      */
      if (!send({ t: 'lc.set', cfg })) {
        setSubmitError(SEND_FAILED_TEXT.gate);
        return;
      }
      setForm(values);
      setSubmitError('');
      sentNotifyRef.current?.(cfg);
    },
    [gateBlocked, send, buildCfg],
  );

  /** 「수정」 — 표시값 전체를 한 번에 보낸다. 부분 갱신이 없다(D-06). */
  const handleSubmit = useCallback(() => {
    if (submitting || disabled) return; // 중복 제출 가드 + 세션 가드
    const values = formRef.current;
    /*
      ★ **무장 판정은 「수정」에도 걸린다** (GC-WR-09 / T-16-60).
        서버 에코로 `buyEnabled: true` 를 받은 뒤 시세가 끊겨 가격 칸이 0 이 되면, 이 cfg 는
        relay 의 `#strategyArmable` 에 **통째로** 거부된다 — 사용자는 함께 실린 다른 값까지
        하나도 저장하지 못한 채 일반 거부 프레임 한 줄만 본다. 그 전에 화면이 사유를 말한다.
        ★ **켜져 있는 게이트만** 본다(`values[key]`). 끄는 방향은 여기서도 막지 않는다
          (T-16-44) — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나가야 한다.
        `setSubmitting(true)` **앞**이다. 잠근 뒤에 막으면 버튼이 영구히 잠긴다.
    */
    /*
      ★★ **철거 면제** (R2-WR-02 / T-16-44). 게이트 4종(`buyEnabled`·`sellEnabled`·
        `cancelQtyEnabled`·`cancelTradeEnabled`)이 전부 꺼진 「수정」은 **전략을 내리는**
        요청이다. 여기서 막으면 안 된다:
        · relay 는 이 요청을 **받아 준다** — `fanout.ts` `#strategyArmable` 첫 줄이
          `if (this.#isTeardown(cfg)) return true;` 로 면제한다(16-36 이 그 줄을 남긴 이유가
          정확히 이것이다). **첫 관문이 마지막 관문보다 엄격하면** 사용자는 전략을 내리려는데
          화면이 막고, 그 사이 시장은 계속 움직인다 — 자산을 인질로 잡는 방향이다.
        · `sweepEnabled` 는 삭제 판정 4종에 **들어 있지 않다.** 그래서 「게이트 4종 OFF +
          한방 ON + 시세 끊겨 `buyOrderPrice === 0`」이 정확히 이 함정이다 — 아래 `find` 가
          `sweepEnabled` 를 짚어 철거를 거부한다.
        · 바로 위 ★ 가 적어 둔 T-16-44(「끄는 방향은 여기서도 막지 않는다」)의 **누락된
          나머지 절반**이다. 그쪽은 게이트 하나하나를 보고, 이쪽은 **전략 전체를 내리는
          의도**를 본다.
    */
    const teardown = isDeleteIntent(values);
    const blocked = teardown
      ? undefined
      : GATE_KEYS.find((key) => values[key] && gateBlocked(key, true));
    if (blocked !== undefined) {
      setSubmitError(
        `${GATE_LABEL[blocked]}${ARM_BLOCKED_SEP}${armBlockedTextOf(blocked, values)}`,
      );
      return;
    }
    setSubmitting(true);
    const cfg = buildCfg(values);
    // ★ `DirtyActionBar` 의 「수정」 버튼은 `submitting` 으로만 잠긴다 — 세션 판정은
    //   **여기**서 한다. `disabled` ← `limit-chaser-client.tsx` `LimitChaserSurface`
    //   (`status !== 'ready'`). 이 줄을 지우면 단절 중 클릭이 0바이트가 된다(16-19 감사).
    if (!send({ t: 'lc.set', cfg })) {
      /*
        보내지 **않았음**이 확실하다 — `submitting` 을 되돌린다(GC-WR-06 / T-16-59).
        남겨 두면 잠금을 푸는 신호가 60 에코인데 그 에코는 영영 오지 않는다.
      */
      setSubmitting(false);
      setSubmitError(SEND_FAILED_TEXT.submit);
      return;
    }
    setSubmitError('');
    sentNotifyRef.current?.(cfg);
  }, [submitting, disabled, send, buildCfg, gateBlocked]);

  /** 「되돌리기」 — 서버값 복귀. **전송하지 않는다.** */
  const handleRevert = useCallback(() => {
    if (server == null) return;
    setForm((prev) => formFromServer(server, prev));
  }, [server]);

  // 에코가 도착하면 전송 잠금을 푼다 — 응답(또는 상위의 타임아웃) 전까지 열지 않는다.
  // 실패 문구도 같이 접는다: 에코가 왔다는 것은 그 사건이 이미 지나갔다는 뜻이다.
  useEffect(() => {
    setSubmitting(false);
    setSubmitError('');
  }, [server]);

  const shared = { dirty: dirtySet, flash, disabled };

  /*
    「켤 수 없는 이유」는 **카드 맨 아래 한 곳**에만 모인다 (260911-w5h).
    옛 구조는 그룹 헤더 바로 아래에 사유 `<p>` 를 끼워 넣어, 사유가 뜨거나 사라질 때마다
    **그 아래 입력 행 전체가 세로로 밀렸다** — 숫자를 치는 도중 행이 움직이는 화면이었다.
    카드 마지막 자식으로 옮기면 위쪽 입력의 세로 위치가 사유 유무와 무관해진다.
  */
  const buyReasons = armBlockedGroupsOf(BUY_CARD_GATES, form, canArm, disabled);
  const sellReasons = armBlockedGroupsOf(SELL_CARD_GATES, form, canArm, disabled);

  const buyCard = (
    <Card side="buy">
      <Group
        slot="buy"
        tone="buy"
        title="매수주문"
        status={buyStatusText}
        led={form.buyEnabled ? 'on' : 'off'}
        hint="비교가격의 감시잔량이 위 값 이하로 줄면 매수 발주"
        switchProps={{
          label: '매수주문 켜기',
          checked: form.buyEnabled,
          onChange: (v) => toggleGate('buyEnabled', v),
          // ★ 켜는 방향만 막는다 — `!form.buyEnabled` 를 넘기므로 **켜져 있으면 언제나 끌 수 있다**.
          disabled: gateBlocked('buyEnabled', !form.buyEnabled),
        }}
      >
        <NumField
          id="lc-buy-watch-price"
          label="비교가격"
          unit="원"
          field="buyWatchPrice"
          value={form.buyWatchPrice}
          onChange={setField}
          {...shared}
        />
        {/*
          ★ 「감시 대상」 세그먼트는 `Row`/`CheckRow` 와 **같은 2열 그리드의 오른쪽 칸**에
            들어간다 (quick-260912-mvo Q-03). 1열은 **빈 칸**이다 — 시각 라벨은 여전히 없고,
            폭 정렬만 이웃 행과 맞춘다.
            ↳ 이력: 260911-w5h 에서는 `Row` 밖 단독 행(`w-full`)이었다. 그때는 `Row` 안에
              넣으면 라벨 칸(`--lw`)이 폭을 먹어 390px 에서 「매도잔량」 4글자가 두 줄로
              접혔기 때문이다. 그 폭 예산은 **라벨 글꼴이 11px 이던 시절**의 것이고, 13px 로
              오르면서 `--lw` 가 76/104px 로 재산정됐다(위 `Card` 주석 참조). 새 예산에서
              실측하면 버튼이 폰 67px · 와이드 78px 로 서고 접힘·잘림이 0 이다.
              **왜 예전에 접혔는지를 지우지 마라** — 지우면 다음 사람이 단독 행으로 되돌린다.
            ↳ 행 간격: `mt-[var(--s-1)]` 은 **래퍼**가 갖는다. 그룹 자신에게 남기면 행 간격이
              두 배가 된다. `w-full` 은 남는다 — 이제 「칸 폭을 채운다」는 뜻이다.
          ★ **선택된 버튼의 색은 그 선택지의 방향색**이다 (260912-gyz). 감시 대상은 「어느 쪽
            호가 잔량을 보는가」이므로 색은 그룹(매수주문 = `--up`)이 아니라 **그 호가의 방향**을
            따라야 한다 — 매도잔량 = `--down` · 매수잔량 = `--up` 으로, 호가창
            (`orderbook-ladder`)의 매도=파랑 / 매수=빨강 축과 **같은 축**이다. 그룹 색을 그대로
            쓰면 매도호가 잔량을 감시하는데 화면은 빨강이라고 말한다.
          ★ 파일 상단 ②-1 의 「색·위치·문구 3중 일치」는 **게이트 스위치와 매수/매도 탭**에 대한
            규율이고 이 세그먼트는 그 대상이 아니다 — 두 규율은 충돌하지 않는다.
          ★ 시각 라벨만 없앤 것이지 **접근성 이름을 없앤 것이 아니다** — `role="group"` +
            `aria-label="감시 대상"` 은 그대로다.
          ★ 라벨이 사라지면서 더티 표현(라벨 `● ` + `--primary` 색)도 함께 사라진다. 그것을
            **세그먼트 테두리**로 옮긴다 — 더티가 조용히 사라지면 사용자는 바꾼 줄 모른다.
            `NumInput` 과 같은 규율로 **테두리 한 겹뿐**이고 링은 걸지 않는다.
        */}
        <div className="mt-[var(--s-1)] grid min-h-[38px] min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-1.5 @min-[992px]/lc:gap-[var(--s-2)]">
          <span aria-hidden="true" />
          <div
            role="group"
            aria-label="감시 대상"
            className={cn(
              'flex h-[38px] w-full min-w-0 overflow-hidden rounded-[var(--r)] border',
              dirtySet.has('buyWatchSide')
                ? 'border-[var(--primary)]'
                : 'border-[var(--border)]',
            )}
          >
            {(['0', '1'] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={form.buyWatchSide === side}
                disabled={disabled}
                onClick={() => setField('buyWatchSide', side)}
                className={cn(
                  'min-w-0 flex-1 px-1 text-[13px] font-semibold whitespace-nowrap',
                  form.buyWatchSide !== side
                    ? 'bg-transparent text-[var(--muted-fg)]'
                    : side === '0'
                      ? 'bg-[var(--down-bg)] text-[var(--down)]'
                      : 'bg-[var(--up-bg)] text-[var(--up)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {side === '0' ? '매도잔량' : '매수잔량'}
              </button>
            ))}
          </div>
        </div>
        <NumField
          id="lc-buy-watch-qty"
          label="잔량"
          unit="주"
          field="buyWatchQty"
          value={form.buyWatchQty}
          onChange={setField}
          {...shared}
        />
        <CheckRow
          id="lc-buy-trade"
          label="체결"
          checked={form.buyTradeQtyEnabled}
          onCheckedChange={(v) => setField('buyTradeQtyEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('buyTradeQtyEnabled')}
        >
          <NumInput
            id="lc-buy-min-trade-qty"
            aria-label="매수 체결 수량"
            unit="주"
            value={form.buyMinTradeQty}
            onValueChange={(v) => setField('buyMinTradeQty', v)}
            disabled={disabled || !form.buyTradeQtyEnabled}
            dirty={dirtySet.has('buyMinTradeQty')}
            flash={flash.has('buyMinTradeQty')}
          />
        </CheckRow>
      </Group>

      {/* 제목 없음 — 첫 `NumField` 라벨이 「매수가격」이라 그룹 제목이 같은 말의 반복이었다. */}
      <Group slot="buy-price" tone="buy">
        <NumField
          id="lc-buy-order-price"
          label="매수가격"
          unit="원"
          field="buyOrderPrice"
          value={form.buyOrderPrice}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-buy-order-amount"
          label="주문금액"
          unit="만원"
          field="buyOrderAmount"
          value={form.buyOrderAmount}
          onChange={setField}
          {...shared}
        />
      </Group>

      <Group
        slot="sweep"
        tone="buy"
        title="한방체결"
        switchProps={{
          label: '한방체결 켜기',
          checked: form.sweepEnabled,
          onChange: (v) => toggleGate('sweepEnabled', v),
          disabled: gateBlocked('sweepEnabled', !form.sweepEnabled),
        }}
      >
        <NumField
          id="lc-sweep-tick"
          label="호가변경"
          unit="건"
          field="sweepMinTickCount"
          value={form.sweepMinTickCount}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-sweep-watch-price"
          label="한방가격"
          unit="원"
          field="sweepWatchPrice"
          value={form.sweepWatchPrice}
          onChange={setField}
          {...shared}
        />
      </Group>
      <ArmBlockedPanel groups={buyReasons} />
    </Card>
  );

  const sellCard = (
    <Card side="sell">
      <Group
        slot="sell"
        tone="sell"
        title="매도주문"
        status={sellStatusText}
        led={form.sellEnabled ? 'watch' : 'off'}
        switchProps={{
          label: '매도주문 켜기',
          checked: form.sellEnabled,
          onChange: (v) => toggleGate('sellEnabled', v),
          disabled: gateBlocked('sellEnabled', !form.sellEnabled),
        }}
      >
        <NumField
          id="lc-sell-watch-price"
          label="비교가격"
          unit="원"
          field="sellWatchPrice"
          value={form.sellWatchPrice}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-sell-watch-qty"
          label="호가잔량"
          unit="주"
          field="sellWatchQty"
          value={form.sellWatchQty}
          onChange={setField}
          {...shared}
        />
        <CheckRow
          id="lc-sell-qty-track"
          label="잔량추적"
          checked={form.sellQtyTrackEnabled}
          onCheckedChange={(v) => setField('sellQtyTrackEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('sellQtyTrackEnabled')}
        >
          <NumInput
            id="lc-sell-qty-track-ratio"
            aria-label="매도 잔량추적 비율"
            unit="%"
            value={form.sellQtyTrackRatio}
            onValueChange={(v) => setField('sellQtyTrackRatio', v)}
            disabled={disabled || !form.sellQtyTrackEnabled}
            dirty={dirtySet.has('sellQtyTrackRatio')}
            flash={flash.has('sellQtyTrackRatio')}
          />
        </CheckRow>
        <CheckRow
          id="lc-sell-trade"
          label="체결"
          checked={form.sellTradeQtyEnabled}
          onCheckedChange={(v) => setField('sellTradeQtyEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('sellTradeQtyEnabled')}
        >
          <NumInput
            id="lc-sell-min-trade-qty"
            aria-label="매도 체결 수량"
            unit="주"
            value={form.sellMinTradeQty}
            onValueChange={(v) => setField('sellMinTradeQty', v)}
            disabled={disabled || !form.sellTradeQtyEnabled}
            dirty={dirtySet.has('sellMinTradeQty')}
            flash={flash.has('sellMinTradeQty')}
          />
        </CheckRow>
        {/* 잔량추적 기준선은 **S→C 전용**이다 — 서버가 매도 진입을 래치한 뒤에만 존재한다. */}
        {server?.sellEntryLatched ? (
          <Derived
            label="잔량추적 기준선"
            value={`${NUM.format(server.sellQtyTrackBaseline)}주`}
          />
        ) : null}
      </Group>

      {/* 제목 없음 — 「매수가격」 그룹과 같은 이유(첫 라벨이 「매도가격」이다). */}
      <Group slot="sell-price" tone="sell">
        <NumField
          id="lc-sell-order-price"
          label="매도가격"
          unit="원"
          field="sellOrderPrice"
          value={form.sellOrderPrice}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-sell-order-ratio"
          label="매도비율"
          unit="%"
          field="sellOrderRatio"
          value={form.sellOrderRatio}
          onChange={setField}
          {...shared}
        />
      </Group>

      {/*
        ★ 이 그룹은 **가드**다 — 중립색(좌측 3px `--border`)이고 방향색을 쓰지 않는다.
        경고 전용 색 토큰은 이 저장소에 없다(UI-SPEC C1/FLAG-1). 이 근거는 그대로 유효하다.
        ★ quick-260912-u58 ② — 「가드」를 **캡션으로 화면에 적던 것**을 걷었다(사용자 지시:
          「매수 미체결 자동취소가드 → 매수취소」 — 캡션까지 포함한 덩어리가 대상이었다).
          가드라는 성격은 위 중립색이 계속 말하고, 라벨은 짧아졌다.
        ★ `strategy-log.tsx` 의 「매수 미체결 자동취소 무장/해제」 **로그 문구는 그대로다** —
          그 줄은 다른 표면이고 문장으로서 여전히 정확하다. 여기 라벨을 줄였다고 로그까지
          따라가면 안 된다.
      */}
      <Group slot="cancel" tone="neutral" title="매수취소">
        <CheckRow
          id="lc-cancel-qty"
          label="취소잔량"
          checked={form.cancelQtyEnabled}
          onCheckedChange={(v) => setField('cancelQtyEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('cancelQtyEnabled')}
        >
          <NumInput
            id="lc-cancel-watch-qty"
            aria-label="취소 감시 잔량"
            unit="주"
            value={form.cancelWatchQty}
            onValueChange={(v) => setField('cancelWatchQty', v)}
            disabled={disabled || !form.cancelQtyEnabled}
            dirty={dirtySet.has('cancelWatchQty')}
            flash={flash.has('cancelWatchQty')}
          />
        </CheckRow>
        <CheckRow
          id="lc-cancel-trade"
          label="체결"
          checked={form.cancelTradeEnabled}
          onCheckedChange={(v) => setField('cancelTradeEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('cancelTradeEnabled')}
        />
        {/* 취소 잔량추적은 **취소잔량과 함께만** 동작한다 — 미체크면 비활성(A9). */}
        <CheckRow
          id="lc-cancel-qty-track"
          label="잔량추적"
          checked={form.cancelQtyTrackEnabled}
          onCheckedChange={(v) => setField('cancelQtyTrackEnabled', v)}
          disabled={disabled || !form.cancelQtyEnabled}
          dimmed={!form.cancelQtyEnabled}
          dirty={dirtySet.has('cancelQtyTrackEnabled')}
        />
      </Group>
      <ArmBlockedPanel groups={sellReasons} />
    </Card>
  );

  return (
    <div data-slot="limit-chaser-form" className={cn('min-w-0', className)}>
      {submitError === '' ? null : (
        /*
          눌렀는데 못 나갔거나 무장 판정에 막혔다 — 화면이 그 사실을 말한다.
          ★ **폼 맨 위**다. 「수정」 버튼은 화면 하단 고정 바(`DirtyActionBar`)에 있고 그 바는
            `dirtyCount === 0` 이면 아예 렌더되지 않으므로(스위치 실패가 정확히 그 경우다)
            바 안에 넣으면 사유가 통째로 사라진다. `role="alert"` 이라 스크롤 위치와 무관하게
            읽힌다. 토스트를 쓰지 않는 근거는 파일 상단 ⑥.
        */
        <p
          data-slot="lc-submit-error"
          role="alert"
          className="mb-[var(--s-2)] m-0 text-[11px] leading-normal text-[var(--destructive)]"
        >
          {submitError}
        </p>
      )}
      {/*
        모바일 세그먼트 탭 — `order-panel.tsx:426~449` 마크업 승계.
        Radix `ToggleGroup` 을 쓰지 않는 근거는 파일 상단 ⑧.
      */}
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
              'h-9 min-w-0 rounded-[var(--r)] border text-[length:var(--t-sm)] font-semibold',
              tab === t && t === 'buy' && 'border-[var(--up)] bg-[var(--up-bg)] text-[var(--up)]',
              tab === t && t === 'sell' && 'border-[var(--down)] bg-[var(--down-bg)] text-[var(--down)]',
              tab !== t && 'border-[var(--border)] bg-transparent text-[var(--muted-fg)]',
            )}
          >
            {t === 'buy' ? '매수' : '매도'}
          </button>
        ))}
      </div>

      {/* 매수·매도 두 컬럼(본문 700~). **그리드 자식 전부 `min-w-0`**(lessons.md). */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--s-2)] @min-[700px]/lc:grid-cols-2 @min-[992px]/lc:gap-[var(--s-4)] [&>*]:min-w-0">
        {/*
          ★ 비활성 pane 숨김은 **CSS 클래스**다 (260912-k2x). 뷰포트를 재던 경로는 사라졌다 —
            이제 「탭이냐 2열이냐」를 가르는 것은 뷰포트가 아니라 **본문 폭**인데, 본문 폭은
            미디어 질의 API 로 관측할 수 없다(그 API 는 뷰포트만 본다). 폭 판정을 CSS 에
            통째로 넘기고 JS 는 「어느 탭이 선택됐나」만 안다.
          ★ `display:none` 은 접근성 트리에서도 빠지므로, 안 보이는 폼을 스크린리더가 읽지
            않는다는 성질은 그대로다.
          ★ **조건부 렌더로 바꾸지 마라.** 언마운트하면 탭을 옮길 때마다 매도 설정이 초기화되고
            더티 카운트·에코 덮어쓰기 계산이 함께 망가진다. 두 pane 은 언제나 마운트돼 있고
            바뀌는 것은 클래스뿐이다.
          ★ 탭 마크업(`role`·`aria-selected`·버튼 요소)은 **이미 계약을 만족하므로 그대로**다 —
            버튼이라 Tab+Enter 가 이미 동작한다.
        */}
        <div
          data-pane="buy"
          className={cn('min-w-0', tab !== 'buy' && 'hidden @min-[700px]/lc:block')}
        >
          {buyCard}
        </div>
        <div
          data-pane="sell"
          className={cn('min-w-0', tab !== 'sell' && 'hidden @min-[700px]/lc:block')}
        >
          {sellCard}
        </div>
      </div>

      {/*
        ★ 액션 바는 `document.body` **로 포털한다 — 장식이 아니라 필수다** (260912-k2x).
          상따 본문 래퍼가 `container-type:inline-size` 를 쓰는데, 그것은 layout containment
          를 걸고 layout containment 가 걸린 요소는 `position:fixed` 자손의 **컨테이닝 블록**
          이 된다. 포털을 걷으면 이 바가 뷰포트 하단이 아니라 **본문 끝**에 앉고, 그때부터
          사용자는 화면을 끝까지 스크롤해야만 「수정」을 누를 수 있다 — 이 화면의 1차 CTA 가
          사실상 사라진다. 「불필요한 포털」로 보고 지우지 마라.
        ★ 공유 컴포넌트(`dirty-action-bar.tsx`)는 한 줄도 고치지 않았다 — VI 설정 화면도 같은
          바를 쓰고 그쪽은 컨테이너 안이 아니다. 포털은 **이 호출부의 사정**이다.
        ★ SSR 가드 — 서버 렌더에는 `document` 가 없다. 마운트된 뒤에만 포털을 만든다.
        ★ 더티 0 이면 렌더하지 않는 규율은 **바 자신**이 이미 지킨다(`dirtyCount <= 0 → null`).
          여기서 다시 판정하면 그 규율이 두 곳이 되고, 언젠가 한쪽만 고쳐진다.
      */}
      {mounted &&
        createPortal(
          <DirtyActionBar
            dirtyCount={dirty.length}
            submitting={submitting}
            onSubmit={handleSubmit}
            onRevert={handleRevert}
            hint={DIRTY_HINT}
          />,
          document.body,
        )}
    </div>
  );
}

/* ───────────────────────── 폼 구성 요소 ───────────────────────── */

/**
 * `.fcard` — 라벨 컬럼 폭(`--lw`)을 카드 안에서 공유한다. 그룹을 카드로 쪼개면 그 공유가 깨진다.
 *
 * ★ `--lw` 는 `Row` 와 `CheckRow` **둘 다**의 1열 폭이다. `CheckRow` 의 1열에는 체크박스와
 *   간격이 라벨과 함께 들어가므로, 순수 라벨만 담는 `Row` 기준 폭으로는 4글자 라벨
 *   (「잔량추적」·「취소잔량」)이 잘린다 — 그래서 모바일 **76px** · 데스크톱 **104px** 이다.
 *   그 값의 근거(260912-gyz): 라벨 글꼴이 11px → **13px** 로 올라가면서 4글자가 체크박스
 *   **17px + gap** 과 함께 옛 64/88px 에 더 이상 들어가지 않아 조용히 잘린다. 잘린 라벨은
 *   사용자가 「잔량추적」과 「취소잔량」을 구분하지 못하게 만들고, 그 혼동이 곧 오발주다.
 *   목업 `260912-chaser-desktop.html`(`.mform.big` `--lw:76px` · `.form.big` `--lw:104px`)이
 *   390px·1152px 실폭에서 렌더해 확인한 값이다 — 모바일 76px 에서도 `10,000,000` + 단위가
 *   잘리지 않는다(입력 글꼴 16px 유지가 그 조건의 일부다).
 *
 * ★ 카드 **크롬(테두리·배경·radius)은 데스크톱에만** 있다. 390px 에서는 본문 여백(8px) 안에
 *   카드 테두리와 그룹 패딩이 겹겹이 들어와 입력 폭을 먹었다 — 모바일에서는 카드가 화면
 *   자체이므로 테두리가 구분하는 「바깥」이 없다.
 *
 * ## 방향색 틴트 (quick-260912-mvo Q-06, 사용자 채택 C안)
 * ⓐ **2열부터만** 칠한다(`@min-[700px]/lc:`). 폰(≤699)은 매수/매도 **탭**이 이미 어느 쪽인지
 *    말하므로 틴트가 중복이고, 좁은 폭에서 배경색은 입력 대비만 깎는다.
 * ⓑ 배경 선언은 **한 줄뿐**이어야 한다. 예전에는 `@min-[992px]/lc:bg-[var(--card)]` 가 있어
 *    ≥992 에서 두 배경이 캐스케이드로 다퉜다(어느 쪽이 이기는지 클래스 문자열 순서로
 *    정해지지 않는다). 그래서 카드색을 **변수 스위치**(`--card-base`)로 바꿨다 —
 *    기본 `transparent`, ≥992 에서 `var(--card)`. 틴트는 그 위에 5% 를 섞는다.
 *    결과: 폰 = 틴트 없음 · 컴팩트/와이드 = 투명 위 5% · 데스크톱 = `--card` 위 5%.
 *    **배경만** 틴트가 되고 테두리는 `--border` 그대로라 더티 테두리(`--primary`)와 다투지 않는다.
 * ⓒ 가로 패딩 8px×2 가 카드 **안쪽 폼 폭을 16px 줄인다.** 본문 700px 경계의 잘림 여유를
 *    그만큼 갉아먹는다 — jsdom 에 레이아웃이 없어 유닛으로 증명할 수 없다(WINDOWS 등재).
 * ⓓ 5% 는 목업(`260912-buysell-ladder.html` `.vC .fcard`)에서 검증된 값이다. **올리지 마라** —
 *    그 위에 흰 입력칸이 얹힌다. 그리고 색은 유일 채널이 아니다: 그룹 제목(「매수주문」/
 *    「매도주문」)과 폰 탭 문구가 글자로 말한다(WCAG 1.4.1) — 그 문구를 지우면 이 틴트는 위반이 된다.
 */
function Card({
  children,
  side,
}: {
  children: ReactNode;
  /** 방향색 틴트 대상. 없으면 틴트 없이 기본 카드 크롬만. */
  side?: 'buy' | 'sell';
}) {
  return (
    <div
      data-side={side}
      className={cn(
        'min-w-0 overflow-hidden [--card-base:transparent] [--lw:76px]',
        '@min-[992px]/lc:rounded-[var(--r-lg)] @min-[992px]/lc:border @min-[992px]/lc:border-[var(--border)] @min-[992px]/lc:[--card-base:var(--card)] @min-[992px]/lc:[--lw:104px]',
        'bg-[var(--card-base)]',
        side === 'buy' &&
          '@min-[700px]/lc:rounded-[var(--r-md)] @min-[700px]/lc:bg-[color-mix(in_oklch,var(--up)_5%,var(--card-base))] @min-[700px]/lc:px-2 @min-[700px]/lc:py-1.5',
        side === 'sell' &&
          '@min-[700px]/lc:rounded-[var(--r-md)] @min-[700px]/lc:bg-[color-mix(in_oklch,var(--down)_5%,var(--card-base))] @min-[700px]/lc:px-2 @min-[700px]/lc:py-1.5',
      )}
    >
      {children}
    </div>
  );
}

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
      className="mt-[var(--s-2)] border-t border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5"
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

interface GroupSwitchProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 이 스위치를 지금 누를 수 없는가. 판정은 호출부의 `gateBlocked` 하나다(WR-06). */
  disabled?: boolean;
}

/**
 * `.grp` — 헤더(LED · 제목 · 상태문구 · 우측 끝 스위치) + 행들.
 *
 * ★ 좌측 3px 세로 액센트 바는 260911-w5h 에서 사라졌다. 매수/매도 축을 카드 안에서 잇는
 *   일은 이제 **상단 세그먼트 탭**(선택 시 매수 `--up` / 매도 `--down`) + **게이트 스위치
 *   색**(`tone`) + **그룹 소제목**(「매수주문」/「매도주문」) 셋이 함께 한다 — 파일 상단 ② 1.
 */
function Group({
  slot,
  tone,
  title,
  status,
  led,
  hint,
  switchProps,
  children,
}: {
  slot: 'buy' | 'buy-price' | 'sweep' | 'sell' | 'sell-price' | 'cancel';
  tone: 'buy' | 'sell' | 'neutral';
  /**
   * 그룹 제목. **없어도 된다** — 첫 행 라벨이 곧 제목인 그룹(매수가격·매도가격)은 제목이
   * 같은 말의 반복이었다. 헤더 줄에 보여 줄 것이 하나도 없으면 줄 자체를 렌더하지 않는다
   * (빈 24px 줄이 남으면 그것이 곧 정체 모를 여백이다).
   */
  title?: string;
  status?: string;
  /*
    ★ 묘비 — `caption?: string` 은 quick-260912-u58 ② 에서 걷혔다. 마지막 호출부는 취소
      그룹의 `caption="가드"` 하나였고, 사용자가 그 라벨을 「매수취소」 한 덩어리로 줄이면서
      0 이 됐다(편집 후 재확인: 호출부 0건). 쓰는 곳이 없는 표현 장치를 남겨 두면 다음
      사람이 「자리가 있으니 채우자」로 다시 건다.
  */
  led?: 'on' | 'off' | 'watch';
  /** 그룹 전체 툴팁(`<section title>`). **화면에는 렌더하지 않는다** — 고밀도 폼에서 한 줄이 컬럼 정렬을 깬다. */
  hint?: string;
  switchProps?: GroupSwitchProps;
  children: ReactNode;
}) {
  // 헤더 줄에 보여 줄 것이 하나라도 있어야 줄을 만든다 — 없으면 빈 24px 줄만 남는다.
  const hasHeader = title != null || status != null || led != null || switchProps != null;
  return (
    <section
      data-slot={`lc-group-${slot}`}
      title={hint}
      className="min-w-0 border-t border-[var(--border)] px-0 py-1.5 first:border-t-0 @min-[992px]/lc:px-[var(--s-3)] @min-[992px]/lc:py-[var(--s-2)]"
    >
      {hasHeader ? (
      <div className="flex min-h-6 min-w-0 items-center gap-[var(--s-2)]">
        {led != null ? (
          <span
            aria-hidden="true"
            className={cn(
              'size-2 flex-none rounded-full',
              led === 'on' && 'bg-[var(--up)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--up)_25%,transparent)]',
              led === 'watch' &&
                'bg-[var(--down)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--down)_25%,transparent)]',
              led === 'off' && 'border-[1.5px] border-[var(--muted-fg)] bg-transparent opacity-60',
            )}
          />
        ) : null}
        <span className="min-w-0 flex-1 leading-normal">
          {title ? (
            <span className="text-[13px] font-semibold tracking-[0.06em] text-[var(--muted-fg)]">
              {title}
            </span>
          ) : null}
          {status ? <span className="ml-1 text-[11px] text-[var(--muted-fg)]">{status}</span> : null}
        </span>
        {/*
          ★ 스위치는 그룹 헤더 **우측 끝 고정**(`ml-auto`)이다 — 크기(44×26)·간격(gap 8px)과
            함께 이 화면의 유일한 오터치 방어다(파일 상단 ② 3).
        */}
        {switchProps != null ? <GateSwitch tone={tone} {...switchProps} /> : null}
      </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * 게이트 스위치 — **44×26**. 누르면 확인 없이 즉시 전송된다(D-05).
 *
 * 순수 버튼인 이유는 파일 상단 ⑧. `role="switch"` + `aria-checked` 로 Radix 와 같은
 * 접근성 계약을 그대로 만족한다.
 */
function GateSwitch({
  tone,
  label,
  checked,
  onChange,
  disabled = false,
}: GroupSwitchProps & { tone: 'buy' | 'sell' | 'neutral' }) {
  const on = tone === 'buy' ? 'var(--up)' : tone === 'sell' ? 'var(--down)' : 'var(--primary)';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative ml-auto h-[26px] w-[44px] flex-none rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: checked ? on : 'var(--border)' }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] size-5 rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/.3)] transition-[left]',
          checked ? 'left-[21px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

/** `.fr` — 「라벨 | 입력」 한 줄. 라벨 폭은 카드가 정한 `--lw` 를 공유한다. */
function Row({
  label,
  htmlFor,
  dirty = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  dirty?: boolean;
  children: ReactNode;
}) {
  /*
    ★ 행 최소 높이는 **입력 높이를 따른다** (260912-gyz). 입력이 38px 로 양쪽 폭에서
      같아졌으므로, 입력이 없는 행만 36/32px 로 남으면 그 행에서만 세로 리듬이 끊긴다.
  */
  return (
    <div className="mt-[var(--s-1)] grid min-h-[38px] min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-1.5 @min-[992px]/lc:gap-[var(--s-2)]">
      <label
        htmlFor={htmlFor}
        className={cn(
          'truncate text-[13px]',
          dirty ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted-fg)]',
        )}
      >
        {/* 더티 표시는 색만이 아니라 **문자**로도 남긴다(WCAG 1.4.1). */}
        {dirty ? '● ' : ''}
        {label}
      </label>
      {children}
    </div>
  );
}

/** 숫자 입력 — 천단위 구분자 표시, 입력은 숫자만 남긴다. */
function NumInput({
  id,
  unit,
  value,
  onValueChange,
  disabled,
  dirty,
  flash,
  className,
  ...rest
}: {
  id: string;
  unit?: string;
  value: number;
  onValueChange: (next: number) => void;
  disabled?: boolean;
  dirty?: boolean;
  flash?: boolean;
  className?: string;
} & Pick<React.ComponentProps<'input'>, 'aria-label'>) {
  return (
    <div
      className={cn(
        /*
          ★ 포커스·더티 표현은 **테두리 한 겹뿐**이다 (260911-w5h). 옛 더티 표현의 2px 링
            그림자를 걷었다 — 고밀도 폼에서 링이 이웃 행과 겹쳐 어느 입력이 더티인지가 오히려
            흐려졌다. 비색 경로는 그대로 남는다: `Row`/`CheckRow` 라벨의 `● ` 접두 + `--primary`
            라벨색이 색 단독 전달을 막는다(WCAG 1.4.1).
          ★ `focus-within:` 은 의사클래스가 붙어 특이도가 더 높으므로, 더티 테두리와 동시에
            걸려도 **포커스색 하나**가 이긴다 — 순서로 다투지 않는다.
        */
        'flex h-[38px] min-w-0 items-center gap-1 rounded-[var(--r)] border bg-[var(--bg)] px-1.5 focus-within:border-[var(--ring)]',
        dirty ? 'border-[var(--primary)]' : 'border-[var(--input)]',
        flash && 'motion-safe:bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]',
        disabled && 'opacity-45',
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        /*
          ★ quick-260912-mvo Q-02 — 전역 Double-Ring 해제. 포커스 표시는 위 래퍼의
            `focus-within:border-[var(--ring)]` 한 겹이다. 둘은 **한 쌍**이라 한쪽만 남으면
            포커스가 두 겹으로 보이거나 통째로 사라진다(WCAG 2.4.7).
        */
        data-focus-ring="seamless"
        disabled={disabled}
        value={NUM.format(value)}
        onChange={(e) => onValueChange(parseDigits(e.target.value))}
        /*
          ★ 누르면 값이 **통째로 선택**된다 — 상따에서 값을 고치는 동작은 거의 언제나 「전부
            지우고 새로 친다」이고, 커서만 놓이면 사용자가 백스페이스를 7번 눌러야 한다.
          ★ `e.currentTarget` 을 먼저 캡처해야 한다 — 핸들러가 끝나면 `null` 이 되므로 타이머
            안에서 바로 읽으면 터진다. iOS 는 `onFocus` 안의 `select()` 가 곧바로 풀리는 경우가
            있어 **직후 1회 더** 부르는 것이 실효 처리다.
        */
        onFocus={(e) => {
          const el = e.currentTarget;
          el.select();
          window.setTimeout(() => el.select(), 0);
        }}
        onClick={(e) => e.currentTarget.select()}
        /*
          ★ 모바일 글꼴이 **16px** 인 이유: iOS Safari 는 글꼴 16px 미만 입력에 포커스하면
            화면을 자동 확대하고 **되돌리지 않는다**. 16px 이면 확대가 아예 일어나지 않으므로
            `viewport` 에 `user-scalable=no` / `maximum-scale=1` 을 걸어 핀치줌을 죽일 필요가
            없다 — 접근성을 유지한 채 「확대되고 안 돌아옴」을 없애는 유일한 근본 해결이다.
          ★ 260912-gyz 에서 **데스크톱만 15px 로 올렸고 모바일 16px 은 그대로 두었다.** 이 값이
            그 문제를 막는 **유일한 장치**이므로, 뒤에 오는 어떤 「데스크톱과 통일하자」 변경도
            모바일 값을 16px 미만으로 내려서는 안 된다.
        */
        className="mono min-w-0 flex-1 bg-transparent text-right text-[16px] text-[var(--fg)] outline-none disabled:cursor-not-allowed @min-[992px]/lc:text-[15px]"
        {...rest}
      />
      {unit ? (
        <span className="flex-none text-[13px] text-[var(--muted-fg)] @min-[992px]/lc:text-[12px]">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

/** 「라벨 | 숫자 입력」 한 줄 — 더티·플래시 배선을 한 곳에 모은다. */
function NumField<K extends keyof LimitChaserFormValues>({
  id,
  label,
  unit,
  field,
  value,
  onChange,
  dirty,
  flash,
  disabled,
}: {
  id: string;
  label: string;
  unit: string;
  field: K & LimitChaserDirtyField;
  value: number;
  onChange: (key: K, value: LimitChaserFormValues[K]) => void;
  dirty: ReadonlySet<string>;
  flash: ReadonlySet<string>;
  disabled: boolean;
}) {
  const isDirty = dirty.has(field);
  return (
    <Row label={label} htmlFor={id} dirty={isDirty}>
      <NumInput
        id={id}
        unit={unit}
        value={value}
        onValueChange={(v) => onChange(field, v as LimitChaserFormValues[K])}
        disabled={disabled}
        dirty={isDirty}
        flash={flash.has(field)}
      />
    </Row>
  );
}

/**
 * `.ck` — 체크박스 한 줄. **`Row` 와 같은 2열 그리드**(`--lw | 1fr`)를 쓴다.
 *
 * 1열에 체크박스 + 라벨을 묶고 2열에 입력을 둔다 — 그래야 위쪽 「라벨 | 입력」 행과 입력의
 * 좌우 끝·폭이 정확히 맞는다(예전 `flex flex-wrap` + 입력 고정폭 104px 은 끝이 어긋났다).
 * 입력이 없는 행은 2열이 비어도 무방하다.
 */
function CheckRow({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
  dimmed = false,
  dirty = false,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** 선행 조건이 꺼져 있을 때 — 비활성 + `opacity:.45`(A9). */
  dimmed?: boolean;
  dirty?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        // 행 최소 높이가 입력 높이(38px)를 따른다 — 근거는 `Row` 의 같은 자리 주석.
        'mt-[var(--s-1)] grid min-h-[38px] min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-1.5 @min-[992px]/lc:gap-[var(--s-2)]',
        dimmed && 'opacity-45',
      )}
    >
      <span className="flex min-w-0 items-center gap-[3px] @min-[992px]/lc:gap-[var(--s-1)]">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="size-[17px] flex-none accent-[var(--primary)] disabled:cursor-not-allowed"
        />
        {/*
          ★ quick-260912-ok2 ⑤ — 비더티 색이 `Row` 와 **같은 `--muted-fg`** 다.
            여기만 `--fg` 이던 시절 브라우저 실측이 `lab(5.26802 0 0)` vs `Row` 의
            `lab(42 0 0)` 이었다 — 같은 카드 안 같은 위계의 라벨이 두 색으로 읽혀,
            체크박스 행만 강조된 것처럼 보였다. 라벨의 위계는 문구가 아니라 색이 말한다.
          ★ 더티 표현 3종(`● ` + `--primary` + `font-semibold`)은 **그대로다.** 색 하나로만
            더티를 말하면 WCAG 1.4.1 위반이고, 이 화면에서 「바꾼 줄 몰랐다」는 곧 오발주다.
        */}
        <label
          htmlFor={id}
          className={cn(
            'min-w-0 truncate text-[13px]',
            dirty ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted-fg)]',
          )}
        >
          {/* 더티 표시는 색만이 아니라 **문자**로도 남긴다(WCAG 1.4.1) — `Row` 와 같은 규율. */}
          {dirty ? '● ' : ''}
          {label}
        </label>
      </span>
      {children}
    </div>
  );
}

/** `.drv` — 읽기 전용 파생값. 서버 계산값이 정본이라는 사실을 숨기지 않는다. */
function Derived({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="mt-[var(--s-1)] flex min-w-0 items-baseline justify-between gap-[var(--s-2)] text-[11px] text-[var(--muted-fg)]">
      <span className="min-w-0">
        {label}
        {note ? <span className="ml-1 opacity-80">· {note}</span> : null}
      </span>
      <b className="mono flex-none font-semibold text-[var(--fg)]">{value}</b>
    </div>
  );
}

/** 입력 문자열에서 숫자만 남겨 정수로. 빈 값은 0 이다(「모름」이 아니라 0 이다). */
function parseDigits(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? 0 : Number(digits);
}
