/**
 * Phase 25 — 전략 이벤트 표시명 표의 **유일한 정본** (D-10).
 *
 * 서버(relay · server)는 이 표로 표시명만 고르고 문장을 만들지 않는다 — 문장 조립은
 * `strategy-event-text.ts` 한 곳(D-09). 모르는 코드(v0.1 밖 말미 추가 · 미래 값)는 전부 **원문 숫자**
 * `String(code)` 로 그린다 — 방향이나 뜻을 지어내지 않는다(D-10).
 *
 * 연산자(≤ · ≥ · = · < · >)는 `cond_metric` 이 아니라 **`reason_code` 원문**으로 정한다 — 같은 지표도
 * 사유마다 방향이 다르다(v0.1 · gh-trade 선답). 키는 gh-trade
 * `server/src/trade/strategy/LimitChaser.h:204-247` `OrderReasonName` 반환 문자열 **원문 전체**이고,
 * 정확 일치로만 조회한다 — 문구를 쪼개 읽지 않는다(D-36). 폐기 · FillHook · 인수 · 후속 · 포기 ·
 * 재진입 · 소진 · 마스터 해제 · "" 는 조건식이 없어 표에 없다.
 *
 * 출처 문구 표(`ORDER_GROUP_ORIGIN_TEXTS`) — 조건이 빈 수동(7) · VI(8) 주문 줄의 조건 자리 문구. gh-trade
 * WinForms 문구 글자 그대로(quick-260930-e73). 방향은 group + kind 한 함수(`strategyEventSide`)로만 읽는다.
 */

/** `StrategyEventKind` 표시명 — 로그 줄의 「행위 단어」(시세 이벤트는 구분 칸 이름). */
export const STRATEGY_EVENT_KIND_LABELS: Readonly<Record<number, string>> = {
  1: "상한가노출",
  2: "상한가진입",
  3: "주문",
  4: "대기",
  5: "체결",
  6: "주문",
  7: "취소",
  8: "거부",
  // 9 — 상태전이(Phase 39 D-10 · 계좌 이벤트 · 방향 없음). 행위 단어는 사유 문구(`stateReasonLabel`).
  9: "상태전이",
  10: "버스트 상한가",
  // 11~13 — gh-trade Phase 28 자동매도(Phase 27 D-15). 14 는 표 밖 — `cond_actual` 로 행위가 갈린다
  // (`AUTO_SELL_PAUSE_LABELS`).
  11: "발동",
  12: "정정",
  13: "상태",
  // 15 — 상한가 특징(gh-trade Phase 27 · 시세 이벤트). 붙여 쓴다 — 주문로그 구분 칩(D-07). 문장 조립은 28-09.
  15: "상한가특징",
  // 16 — 매집감지(gh-trade Phase 34 · 시세 이벤트). 주문로그에는 오지 않는다(작업대 「매집」 패널 전용 · quick-261018-rfy).
  16: "매집감지",
  // 17 · 18 — 발사 조각 · 머리(gh-trade Phase 43 · 관찰자 저널 전용). 주문로그 · ws 에는 오지 않는다 — 어드민 전용(Phase 35).
  17: "발사조각",
  18: "발사머리",
};

/** `OrderGroup` 표시명 — 로그 줄의 「구분」 칸. 0(None)은 표에 없다. */
export const ORDER_GROUP_LABELS: Readonly<Record<number, string>> = {
  1: "선매수",
  2: "줄매수",
  3: "후매수",
  4: "호가매도",
  5: "체결매도",
  6: "체결훅",
  7: "수동",
  8: "VI",
  9: "자동매도",
};

/**
 * `OrderGroup` 출처 문구 — 조건이 빈(cond_metric 0) 수동 · VI 주문 줄의 조건 자리에 그린다.
 * gh-trade WinForms 문구 글자 그대로. 0~6(상따)은 표에 없다 — 조건이 비면 조각을 생략한다.
 */
export const ORDER_GROUP_ORIGIN_TEXTS: Readonly<Record<number, string>> = {
  7: "수동 주문",
  8: "VI 자동주문",
};

/** `CondMetric` 표시명 — 「조건 {지표}{연산자}{설정값}」 의 지표. */
export const COND_METRIC_LABELS: Readonly<Record<number, string>> = {
  1: "매도잔량",
  2: "매수잔량",
  3: "단건 체결",
  4: "가격",
  5: "체결 누적",
  6: "스윕 호가변경",
  7: "상승률",
};

/** `EvidenceKind` 표시명 — 「근거 {종류}(…)」. */
export const EVIDENCE_KIND_LABELS: Readonly<Record<number, string>> = {
  1: "호가",
  2: "체결",
  3: "체결통보",
};

/**
 * 체결 근거(ev_kind 2)가 단건이 아니라 주기매도 구간(cumVolume ∈ (before, after])일 때의 근거 종류 낱말
 * (Phase 38 D-11 · 틱 뷰어 주문 줄 「근거 체결 구간 ↑」 · 카드 「체결 구간 n건 · …」). `EvidenceKind` 값이 아니라 표시 구분이다.
 */
export const EVIDENCE_RANGE_LABEL = "체결 구간";

/**
 * `CancelReason` 표시명 (7~9 는 v0.1 밖 말미 추가 — 서버 취소 경로 1:1 · G1 ⓓ). 10 · 11 은 자동매도
 * (gh-trade Phase 28 · 인박스 Q3 답 · WinForms 같은 낱말 — Phase 27 D-16). 12 는 줄매수 「버스트 해제」 —
 * 버스트 상한가 판정으로 서버가 취소한 매수 미체결(gh-trade quick-261007-edj/gwv · 인박스 261007). 인박스 261008
 * (gh-trade quick-261008-ks9)부터 범위가 그 계좌·종목·거래소 매수 미체결 전부라 group 1·2·3 뿐 아니라 수동 7 · VI 8
 * 행에도 붙는다 — 표시명은 group 과 무관하게 같다. 종전에는 9 「기타」로 나갔다. 낱말은 kind 10 표시명 「버스트 상한가」와 같다.
 */
export const CANCEL_REASON_LABELS: Readonly<Record<number, string>> = {
  1: "수동 취소",
  2: "이탈 매도",
  3: "매수1 잔량",
  4: "VI 감시",
  5: "거래소 취소",
  6: "마감 정리",
  7: "체결 감시",
  8: "재취소",
  9: "기타",
  10: "매수 우선 취소",
  11: "동시호가 감축",
  12: "버스트 상한가",
};

/**
 * 자동매도 상태(`auto_sell_state` 에코 · kind 13 cond_threshold/cond_actual) 표시명. 카드 칩 · 헤더 LED ·
 * kind 13 본문 · 서버 54 문구가 **같은 낱말**이다 — 0 은 「꺼짐」(서버 54 「자동매도 꺼짐 → 대기」 · WinForms
 * 동형 · Phase 27 정보성 반영 Q6). 표 밖 값은 원문 숫자(`autoSellStateLabel`).
 */
export const AUTO_SELL_STATE_LABELS: Readonly<Record<number, string>> = {
  0: "꺼짐",
  1: "대기",
  2: "감시",
  3: "매도중",
  4: "완료",
};

/** 자동매도 기준 종류(`auto_sell_basis` · kind 11/13 queue_case). 0 = 미정 — 낱말은 `autoSellBasisLabel`. */
export const AUTO_SELL_BASIS_LABELS: Readonly<Record<number, string>> = {
  1: "상한가",
  2: "매수가",
};

/** 자동매도 방법(`auto_sell_method` 와이어 값) 표시명. 화면 순서는 `AUTO_SELL_METHOD_ORDER`. */
export const AUTO_SELL_METHOD_LABELS: Readonly<Record<number, string>> = {
  3: "양쪽",
  1: "매도1호가",
  2: "매수1호가",
};

/** 방법 콤보 · 세그먼트 순서 — 「양쪽 / 매도1호가 / 매수1호가」(gh-trade 28-12 VM 검토 4차). */
export const AUTO_SELL_METHOD_ORDER = [3, 1, 2] as const;

/** kind 14 `cond_actual` → 행위 단어(멈춤 · 재개). 표 밖 값은 원문 숫자. */
export const AUTO_SELL_PAUSE_LABELS: Readonly<Record<number, string>> = {
  1: "VI 멈춤",
  2: "동시호가 멈춤",
  3: "재개",
};

/*
 * kind 9 상태전이(Phase 39 D-09 · D-10) — 초안 낱말. gh-trade 구현 노트 회신 뒤 낱말로 맞춘다(D-10).
 * 2차 토큰(매도 · 취소 진입 래치 · 게이트 · VI 미발주)은 넣지 않는다(D-09 Deferred) — 오면 원문 토큰 그대로.
 * 토큰 정본은 39-RESEARCH §Pattern 9 사유 토큰 표(= 39-01 노트) — 접두 대역 Cfg* 사람 · Auto* 서버 판정 · Sys* 서버 운영.
 */

/** kind 9 `reason_code` 사유 토큰(1차 17개 + SysDisableOne · gh-trade quick-261106-tf8) → 행위 문구. 정확 일치 조회 전용(`stateReasonLabel`). */
export const STATE_REASON_LABELS: Readonly<Record<string, string>> = {
  CfgSubmit: "설정 재제출",
  CfgRearm: "설정 재제출 · 재무장",
  AutoPreBuyOff: "선매수 꺼짐(1회 발주)",
  AutoAddBuyOff: "줄매수 꺼짐(발주)",
  AutoAddBuyGiveUp: "줄매수 포기(최대 초과)",
  AutoAddBuyRecheck: "줄매수 자동 재체크",
  AutoPostBuyUnlock: "후매수 잠금해제",
  AutoPostBuyRelock: "후매수 다시 잠김",
  AutoPostBuyFire: "후매수 발동",
  AutoMasterOff: "마스터 해제",
  AutoRiskLatchOn: "위험도 래치 켜짐",
  AutoRiskLatchReset: "위험도 래치 리셋",
  AutoRiskFire: "위험도 발동",
  SysDisableOne: "해제",
  SysCloseOff: "마감 정리",
  SysKillSwitch: "전부 정지",
  SysRestore: "재기동 복원",
  SysCommand: "서버 명령",
};

/**
 * kind 9 스위치 비트셋(`ahead_qty` 전 · `expected_cum` 후) 비트 라벨 — index = bit(0~13). 14~63 은 예약
 * (append-only) — 표 밖 비트는 문장에 넣지 않는다(뜻을 지어내지 않는다 · D-10).
 */
export const STATE_SWITCH_BIT_LABELS: readonly string[] = [
  "매수",
  "선매수",
  "줄매수",
  "후매수",
  "매도",
  "취소",
  "자동매도",
  "SOR 매수",
  "SOR 매도",
  "위험도",
  "선매수 체결량",
  "선매수 한방",
  "줄매수 자동",
  "후매수 자동",
];

/** kind 9 후매수 단계(`cond_threshold` 전 → `cond_actual` 후 · `AutoPostBuy*` 사유). 표 밖 값은 원문 숫자. */
export const POST_BUY_STAGE_LABELS: Readonly<Record<number, string>> = {
  0: "꺼짐",
  1: "감시",
  2: "보유중",
  3: "소진",
};

/** kind 9 위험도 래치(`cond_threshold` 전 → `cond_actual` 후 · `AutoRisk*` 사유). 표 밖 값은 원문 숫자. */
export const RISK_LATCH_LABELS: Readonly<Record<number, string>> = {
  0: "대기",
  1: "무장",
  2: "발동",
};

/**
 * 자동매도 `reason_code` 첫 토큰 13종 — gh-trade `server/src/trade/strategy/LimitChaser.h:388-400`
 * `OrderReasonName` 원문의 첫 공백 앞. 판정은 `isAutoSellReason`(첫 토큰 **정확 일치** — 꼬리 문구는 읽지
 * 않는다 · D-36 · gh-trade 교훈 24). 원문 전체 일치 표 `REASON_CODE_OPERATORS` 에는 넣지 않는다.
 */
export const AUTO_SELL_REASON_TOKENS: Readonly<Record<string, true>> = {
  AutoSellAsk1: true,
  AutoSellBid1: true,
  AutoSellTrigger0: true,
  AutoSellTriggerN: true,
  AutoSellModify: true,
  AutoSellStateChange: true,
  AutoSellPauseVI: true,
  AutoSellPauseAuction: true,
  AutoSellResume: true,
  AutoSellStartCancel: true,
  AutoSellBuyFirstCancel: true,
  AutoSellAuctionTrimCancel: true,
  AutoSellAuctionOrder: true,
};

/** 매도주문 「방식」 (`order_condition` 원문 → 표시명). */
export const ORDER_CONDITION_LABELS: Readonly<Record<string, string>> = {
  "0": "지정가",
};

/** `reason_code` 원문 전체 → 조건 연산자. 정확 일치 조회 전용(`reasonOperator`). */
export const REASON_CODE_OPERATORS: Readonly<Record<string, string>> = {
  "PreBuy B6Buy5 가격돌파(매도1호가>감시가)": ">",
  "PreBuy B6Buy4 상한가도달(매수1호가==감시가)": "=",
  "PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)": "≤",
  "PreBuy A3 체결수량(체결가>=감시가 && 체결수량>=최소)": "≥",
  "PreBuy A3 버스트매수누적(체결가>=감시가 && 누적>=최소)": "≥",
  "PreBuy A3Buy4 상한가안착(A3 매수1호가==상한가)": "=",
  "PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)": "≥",
  "PreBuy A3 버스트횟수+상승률(횟수>=최소 && 상승률>=최소)": "≥",
  "PreBuy A3 차감재평가(매도1잔량-체결수량<=감시수량)": "≤",
  "B6Sell1 잔량(매수1호가==감시가 && 잔량<=임계)": "≤",
  "B6Sell2 가격이탈(매수1호가<감시가)": "<",
  "A3 체결수량(체결가==감시가 && 체결수량>=최소)": "≥",
  "A3 버스트매도누적(체결가==감시가 && 누적>=최소)": "≥",
  "A3 차감재평가(매수1잔량-체결수량<=임계)": "≤",
  "B6Cancel1 잔량(매수1호가==매도비교가 && 잔량<=임계)": "≤",
  "A3Cancel 매도체결수량(체결가==매도비교가 && 체결수량>=최소)": "≥",
  "A3Cancel 버스트매도누적(체결가==매도비교가 && 누적>=최소)": "≥",
  "A3Cancel 차감재평가(매수1잔량-체결수량<=임계)": "≤",
  "AddBuy 구간(매수1호가==감시가 && 하한<=잔량<=상한)": "≥",
  "PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량)": ">",
};

/** 종류 표시명. 모르면 원문 숫자(D-10). */
export function strategyKindLabel(code: number): string {
  return STRATEGY_EVENT_KIND_LABELS[code] ?? String(code);
}

/** 그룹 표시명. 0(None)이면 null — 모르는 값은 원문 숫자(D-10). */
export function orderGroupLabel(code: number): string | null {
  if (code === 0) return null;
  return ORDER_GROUP_LABELS[code] ?? String(code);
}

/** 그룹 출처 문구(7 수동 주문 · 8 VI 자동주문). 표에 없으면 null — 지어내지 않는다. */
export function orderGroupOriginText(group: number): string | null {
  return ORDER_GROUP_ORIGIN_TEXTS[group] ?? null;
}

/** 전략 이벤트 방향 — 구분 칸 색 · 「매도체결」 · 「단건 매도체결」 판정의 유일한 근거. */
export type StrategyEventSide = "buy" | "sell";

/**
 * 이벤트 방향 = group + kind.
 *   - 1~3 매수 · 4~6 매도 — kind 무관(상따 그룹은 그룹이 곧 방향).
 *   - 8 VI 자동주문 — 매수 전용이라 kind 무관 매수.
 *   - 9 자동매도 — 매도 전용이라 kind 무관 매도(Phase 27 D-14 — 배지 · 줄은 매도 색).
 *   - 7 수동 — 매수 · 매도 겸용이라 kind 로 정한다: 6 매도주문 → 매도 · 3 매수주문 · 4 대기 · 5 첫체결 ·
 *     7 취소 → 매수(대기 · 체결 · 취소는 매수 흐름에서만 온다) · 그 밖(8 거부 등) null.
 *   - 그 밖 group(0 포함 · 모르는 값) null — 방향을 지어내지 않는다(D-10).
 *   - kind 9 상태전이는 group 과 무관하게 null — 설정 · 자동 전이 이력이지 주문 방향이 아니다(39 D-10).
 *     `STRATEGY_EVENT_KIND` 는 import 하지 않는다 — 이 파일은 의존 0 의 표 정본이라 숫자 9 와 주석으로 쓴다.
 */
export function strategyEventSide(group: number, kind: number): StrategyEventSide | null {
  if (kind === 9) return null; // 상태전이는 방향이 없다 — group 이 1~3 이어도 매수 색 금지(39 D-10 · Pitfall 6).
  if (group >= 1 && group <= 3) return "buy";
  if (group >= 4 && group <= 6) return "sell";
  if (group === 8) return "buy";
  if (group === 9) return "sell";
  if (group === 7) {
    if (kind === 6) return "sell";
    if (kind === 3 || kind === 4 || kind === 5 || kind === 7) return "buy";
    return null;
  }
  return null;
}

/** 조건 지표 표시명. 3(TradeQty)은 매도 방향이면 「단건 매도체결」. 모르면 원문 숫자. */
export function condMetricLabel(code: number, side: StrategyEventSide | null): string {
  if (code === 3 && side === "sell") return "단건 매도체결";
  return COND_METRIC_LABELS[code] ?? String(code);
}

/** 취소 사유 표시명. 모르면 원문 숫자. */
export function cancelReasonLabel(code: number): string {
  return CANCEL_REASON_LABELS[code] ?? String(code);
}

/** `reason_code` 원문 → 연산자. 정확 일치가 아니면 null(D-36 — 쪼개 읽지 않는다). */
export function reasonOperator(reasonCode: string): string | null {
  // 게이트웨이 원문이라 `"constructor"` 같은 프로토타입 키가 올 수 있다 — 자기 키만 본다.
  return Object.hasOwn(REASON_CODE_OPERATORS, reasonCode) ? (REASON_CODE_OPERATORS[reasonCode] ?? null) : null;
}

/** 매도주문 방식 표시명. 모르면 원문 그대로(자기 키만 본다 — 원문 문자열이 프로토타입 키일 수 있다). */
export function orderConditionLabel(code: string): string {
  return Object.hasOwn(ORDER_CONDITION_LABELS, code) ? (ORDER_CONDITION_LABELS[code] ?? code) : code;
}

/** `reason_code` 첫 토큰 — 첫 공백 앞, 공백이 없으면 전체. 자동매도 판정 전용(꼬리 문구는 읽지 않는다). */
export function reasonToken(reasonCode: string): string {
  const i = reasonCode.indexOf(" ");
  return i < 0 ? reasonCode : reasonCode.slice(0, i);
}

/**
 * 자동매도 사유인가 — 첫 토큰이 13종 집합과 **정확 일치**할 때만 참. 게이트웨이 원문이라 `"toString"` 같은
 * 프로토타입 키가 올 수 있다 — 자기 키만 본다(`Object.hasOwn` · `reasonOperator` 와 같은 규율).
 */
export function isAutoSellReason(reasonCode: string): boolean {
  return Object.hasOwn(AUTO_SELL_REASON_TOKENS, reasonToken(reasonCode));
}

/** 자동매도 상태 낱말(0 꺼짐 · 1 대기 · 2 감시 · 3 매도중 · 4 완료). 표 밖은 원문 숫자(D-10). */
export function autoSellStateLabel(state: number): string {
  return AUTO_SELL_STATE_LABELS[state] ?? String(state);
}

/** 자동매도 기준 낱말 — 2 만 「매수가」, 그 밖(0 미정 포함)은 「상한가」(WinForms 「기준 낱말은 basis 만 본다」). */
export function autoSellBasisLabel(basis: number): string {
  return basis === 2 ? "매수가" : "상한가";
}

/**
 * kind 9 사유 문구 — 1차 사전에 있으면 문구, 없으면 원문 토큰 그대로(2차 · 미래 토큰 · D-10), 빈 문자열이면
 * 「상태전이」. 게이트웨이 원문이라 `"constructor"` 같은 프로토타입 키가 올 수 있다 — 자기 키만 본다.
 */
export function stateReasonLabel(token: string): string {
  if (token === "") return "상태전이";
  return Object.hasOwn(STATE_REASON_LABELS, token) ? (STATE_REASON_LABELS[token] ?? token) : token;
}

/**
 * kind 9 스위치 변화 — bit 0~13 중 전 → 후가 바뀐 비트마다 `${라벨} 켜짐`(0→1) / `${라벨} 꺼짐`(1→0), bit 순서.
 * 비트 판정은 `Math.floor(v / 2 ** bit) % 2` — 14비트 안이라 Number 로 안전(비트 연산자는 32비트로 잘린다).
 */
export function stateSwitchChanges(before: number, after: number): string[] {
  const out: string[] = [];
  STATE_SWITCH_BIT_LABELS.forEach((label, bit) => {
    const b = Math.floor(before / 2 ** bit) % 2;
    const a = Math.floor(after / 2 ** bit) % 2;
    if (b !== a) out.push(`${label} ${a === 1 ? "켜짐" : "꺼짐"}`);
  });
  return out;
}
