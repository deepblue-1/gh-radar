'use client';

/**
 * useLcFieldCommit — 상따 설정 **필드 1회 확정 = `lc.set` 1회** 상태 기계 (Phase 20 D-04).
 *
 * ① 무엇을 대체하는가
 *   옛 모델은 「값을 고친다 → 더티가 쌓인다 → 하단 「수정」」이었다. 이 훅은 그 사이를 걷는다 —
 *   시트 「적용」·인라인 Enter/blur·체크·토글 **한 번**이 곧 전략 전체(cfg 조립 정본 = 폼 `buildCfg`) 전송 한 번이다.
 *   시트·인라인·체크·토글이 폼 인스턴스당 **이 훅 하나**를 공유한다(판정이 둘이면 한쪽만 고쳐진다).
 *
 * ② ★ cfg 기준값은 폼의 로컬 값이 아니라 **서버 동기값**이다 (T-20-03)
 *   `formFromServer(server, formRef.current)` + 바꾼 필드 1개. 로컬 값을 그대로 실으면, 다른 곳에서
 *   고치다 만 오래된 값이 이 확정에 얹혀 **사용자가 누르지 않은 필드**까지 서버에 덮인다.
 *
 * ③ ★ 거부를 성공으로 읽지 않는다 (D-06 · RESEARCH Pitfall 1)
 *   거부 통지도 카드의 `acceptAnswer()` 를 불러 `serverAnswerSeq` 를 올린다 — 거부에는 60 에코가
 *   없다. 그래서 **성공 = 에코의 그 필드 값 === 보낸 값**뿐이다. 답은 왔는데 값이 다르면 실패다.
 *   `serverAnswerSeq` 가 먼저 오르고 서버 값이 뒤따르는 순서(Pitfall 4)는 「늦은 에코」 전이가
 *   받는다 — 기록된 실패의 값이 서버에 서면 그 실패를 성공으로 바꾼다.
 *
 * ④ ★ 값 필드는 낙관 반영하지 않는다 (D-06)
 *   `kind: 'value'` 확정은 `setForm` 을 부르지 않는다. 목록 행은 에코가 오기 전까지 서버 값이다 —
 *   「보인 값 = 서버에 선 값」이 이 화면의 불변식이다.
 *   ★ 동반 값 필드도 예외 없음 — 동반은 **불리언만** 낙관 표시 · 되돌림한다(24-REVIEW IN-05). 토글 확정이 싣는
 *     매도 주문가격 · 비교가격 채움은 cfg 에만 실리고 에코가 올 때까지 폼에 들어가지 않는다.
 *
 * ⑤ ★ 재전송하지 않는다 (T-16-10)
 *   실패·타임아웃 뒤 이 훅은 **아무것도 다시 보내지 않는다.** 「다시 시도」는 사용자가 다시 누른
 *   새 `commit` 이다 — 사용자가 누르지 않은 두 번째 요청은 곧 두 번째 등록이다.
 *
 * ⑥ ★ 미등록 전략(server 없음)은 로컬 반영만 한다 (planner assumption A-P1 · RESEARCH Open Q1)
 *   값·체크·감시대상 확정을 보내면 `crudOf` 가 `'D'` 인 철거 프레임이 나가거나(존재하지 않는 키)
 *   게이트성 체크가 의도치 않은 등록을 만든다(Pitfall 2). 등록은 `LC_GATE_FIELDS` 만 한다 —
 *   Phase 16 D-05 「첫 스위치 = 등록」 그대로.
 *
 * ⑦ ★ 동시에 나가 있는 전송은 1건이다 (UI-SPEC §6 「직렬화」 · T-20-08)
 *   앞 건이 답을 받기 전의 확정은 **대기열**(필드당 1건, 순서 유지)에 선다. 같은 필드를 다시
 *   확정하면 값만 바뀌고 자리는 그대로다 — 전송량은 사용자 확정 수 이하다.
 *   ★ **꺼내는 시점이 핵심이다.** 카드는 성공 에코 한 번에 `acceptAnswer` 를 한 커밋 안에서
 *     1~2회 부르고(`strategy-card.tsx` 의 에코 스트림 · 서버 값 이펙트), 그 증가는 폼 이펙트보다
 *     **한 렌더 늦게** 보인다. 성공 렌더에서 곧바로 다음 건을 보내면 뒤따르는 증가가 그 새 건을
 *     「거부」로 오판한다. 그래서 성공 뒤 `serverAnswerSeq` 가 바뀐 렌더에서만 꺼낸다.
 *   ★ 꺼낼 때마다 no-op·무장 판정을 **새 서버 값**으로 다시 한다(앞 건이 서버를 바꿨다).
 *   ★ 앞 건이 실패하면 대기 건은 **하나도 보내지 않고** 각 필드를 실패로 표시한다 —
 *     자동 전송(⑤ 위반)도 조용한 드롭(사용자는 반영된 줄 안다)도 아니다.
 *   ★ **타임아웃은 「끝남」이 아니라 「결과 모름」이다** (20-REVIEW CR-02). 그 프레임은 이미 소켓에
 *     실렸고 서버에 늦게 닿을 수 있다(터널 정지로 수 초 지연이 실측된다). 그 사이 다른 필드를 곧바로
 *     보내면 그 cfg 는 **앞 건이 아직 반영되지 않은 서버 값**을 기준으로 해, 늦게 닿은 앞 건(무장 해제
 *     포함)을 조용히 되돌린다. 그래서 타임아웃 실패를 표시하되 **고아 장벽**(`orphanRef`)을 세워 새 확정을
 *     대기열에 세운다. 장벽은 다음 답 신호 · 서버 값 변화에서 풀리고(꺼낼 때 새 서버 값으로 다시 판정),
 *     `LC_ORPHAN_WAIT_MS` 안에 아무 신호도 없으면 대기 건을 **보내지 않고** 실패로 표시한 뒤 풀린다 —
 *     낡은 기준값 전송도, 시트가 「반영 중…」에 영구히 잠기는 것도 없다.
 *
 * ⑧ ★ 실패 판정 입력은 셋이다
 *   거부 = 답 신호(`serverAnswerSeq`)만 오르고 값 불일치 · 타임아웃 = 카드 `unacked`(3초 무응답,
 *   상태줄 「미반영」과 **같은 신호** — UI-SPEC A10) · 끊김 = `send` false.
 *   성공 = 에코의 그 필드 값 === 보낸 값, 예외 없음.
 *
 * ⑨ ★ 무장 불가 값은 보내지 않는다 (WR-06 · T-20-01)
 *   전송 직전 `armBlockOf(서버 동기값 + 바꾼 필드)` 가 문장을 돌려주면 막고 그 문장을 실패로 둔다.
 *   ★ **끄는 방향 게이트는 판정하지 않는다**(T-16-44) — 무장 해제를 막는 화면은 자산을 인질로 잡는다.
 *
 * ⑨-2 ★ relay 스키마 범위 밖 cfg 는 보내지 않는다 (20-REVIEW CR-01)
 *   relay 는 `lc.set` 스키마 위반 프레임을 받으면 **WebSocket 연결을 통째로 끊는다** — 모든 카드의 시세·
 *   에코가 멈추고 같은 소켓의 수동주문이 결과 모름에 걸린다. 시트·인라인이 편집 필드를 먼저 잠그지만
 *   cfg 는 전략 전체라, 전송 직전 `lcRangeIssue(cfg 기준값)` 로 **한 번 더** 막는다(마지막 방어선).
 *   ★ 이 가드는 끄는 방향도 막는다 — 범위 밖 프레임은 끄기조차 반영하지 못하고 연결만 끊는다.
 *
 * ⑨-3 ★ 구서버 에코(WR-02)는 끄기만 — `lcLegacyBlockOf`.
 *   구서버(`buy3Schema 0` · 판별은 lib `isLegacyBuySchema`)에 닿는 cfg 에는 `buy_watch_side` 슬롯이 없다(relay 가
 *   싣지 않는다 · 24-03). 끄는 방향 ∧ 결과 매수주문 OFF 가 아닌 확정은 보내지 않는다 — 시트·인라인 확정 전 검증(폼
 *   `validateCommit`)과 이 훅의 전송 직전 가드(대기열에서 꺼낼 때 포함)가 같은 함수를 읽는다. 매수주문 끄기는 늘 나가므로
 *   완전 해제 경로가 열려 있다(T-16-44).
 *   끄기 cfg 는 서버가 금액을 모르면(`isLegacyAmountUnknown` — 구서버 ∧ 선매수 금액 0) 금액 · 수량을 서버 값 그대로
 *   싣는다(D-04a 잔여 규칙) — `buildCfg` 가 폼 금액(클라 기본값)으로 수량을 다시 계산해 서버가 쥔 수량을 덮지 않게.
 *
 * ⑩ 토글 종류(스위치·체크·감시대상)는 전송 뒤(또는 대기 진입 시) 낙관 표시하고, 실패·폐기되면
 *   **지금 서버 값**(`baseNow()` — 서버 동기값)으로 되돌린다(미등록이면 확정 직전 값 · UI-SPEC E2 · GC-WR-02).
 *   누른 순간 값으로 되돌리면 그사이 서버가 바꾼 스위치(서버가 접은 선매수 · 다른 단말이 켠 매도)를 거짓으로 그린다 —
 *   「보인 값 = 서버에 선 값」(④)이 실패 · 폐기 뒤에도 선다. `send` 가 false 면 폼을 건드리지 않는다(GC-WR-06).
 *
 * ⑪ ★ 동반 필드(companions · Phase 24 D-01 · D-02) — **한 확정 = 한 `lc.set`** 을 지키며 여러 필드를 싣는다
 *   그룹 스위치를 켜면 마스터도 같은 제출에 켜지고(D-01), 마지막 그룹을 끄면 마스터도 같은 제출에 꺼진다(D-02).
 *   `commit(field, value, kind, companions)` 한 번 = 전송 한 번이고 cfg = 서버 동기값 + 동반 필드 + 주 필드다.
 *   ★ **성공 판정은 주 필드만**이다(`server[field] === value`) — 서버는 동반 필드를 부분 거부할 수 있고(예: 매도
 *     검증 실패 → `sell_enabled=false` + ERROR 원문 로그) 그것은 주 필드의 실패가 아니다.
 *   ★ 무장 가드(`armBlockOf`) · 범위 가드는 동반 필드를 **합친 값**으로 판정한다(실제로 나갈 cfg).
 *   ★ 낙관 표시 · 되돌림(거부 · 무응답 · 끊김 · 대기 폐기)은 주 필드와 동반 **불리언**을 **함께** 한다(값 필드는 ④).
 *     되돌림 값은 지금 서버 동기값이다(미등록이면 확정 직전 값 · ⑩ · GC-WR-02) — `revertToggle` 한 자리.
 *   ★ no-op 은 주 필드와 모든 동반 필드가 서버 값과 같을 때만이다 — 즉시 경로 · 꺼낼 때 · 앞 건 실패로 대기 건을
 *     접을 때(`failQueue`)가 같은 `sameAsServer` 규칙이다(주 필드만 같다고 성공으로 접지 않는다 — WR-04).
 *     단 `failQueue` 에서 주 필드만 서버 값이면 **주 필드는 성공**이고 동반은 서버 값으로 보인다(GC-WR-02 — 끄려던
 *     값이 이미 서 있는데 실패로 그리지 않는다 · 동반이 서지 않았다는 사실은 화면 값이 말한다).
 *   새 훅 · 새 전송 경로를 만들지 않는다(RESEARCH Don't Hand-Roll) — 직렬화 · 고아 장벽 · 늦은 에코가 그대로 돈다.
 *   ★ **동반은 값 또는 꺼낼 때 계산하는 함수다(`LcCompanions` · 24-REVIEW WR-03)** — 대기 건은 꺼내는 순간의 서버
 *     동기값으로 다시 계산한다. 누른 순간의 값으로 굳히면, 앞 확정이 in-flight 인 동안 사람이 방금 확정한 값(예: 매도
 *     주문가격)을 낡은 자동 채움이 덮고, 그사이 0 이 된 잔량에도 무장 플래그를 실어 relay 가 프레임 전체를 거부한다.
 *     판정 시점(확정의 no-op · 대기 진입의 낙관 표시와 되돌림 기준 · 같은 필드 재확정 · 꺼낼 때의 no-op · 전송 조립)
 *     마다 `companionsAt` 로 다시 계산하고, 계산 결과의 키가 바뀌면 빠진 키는 되돌리고 새 키의 되돌림 기준을 세운다
 *     (`reshow` 하나 — 두 경로가 같은 규칙). in-flight 기록에는 실제로 실은 계산 결과가 남는다.
 *
 * ⑫ 보낸 사유(`meta.cause`)는 `onSent(cfg, meta)` 로만 흐른다 — 카드가 에코 로그 귀속(24-05 「서버가 매수 그룹
 *   해제 — …」)에 쓴다. 성공 판정 · 되돌림 · 재시도 규칙(⑤)은 사유와 무관하게 같다.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

import { lcRangeIssue } from '@/components/trading/lc/lc-fields';
import type { StrategySubmitCause } from '@/components/trading/strategy-log';
import {
  formFromServer,
  isLegacyAmountUnknown,
  isLegacyBuySchema,
  type LimitChaserFormValues,
} from '@/lib/limit-chaser';

export type LcFieldKey = keyof LimitChaserFormValues;
/** `value` = 숫자 값(낙관 반영 없음) · `toggle` = 스위치·체크·감시대상(전송 뒤 낙관 표시). */
export type LcCommitKind = 'value' | 'toggle';
/**
 * `invalid` = relay 스키마 범위 밖이라 보내지 않았다(⑨-2 · CR-01).
 * `legacySchema` = 구서버 에코라 끄는 방향 ∧ 결과 매수주문 OFF 가 아닌 확정을 보내지 않았다(⑨-3 · WR-02 · `lcLegacyBlockOf`).
 */
export type LcFailReason = 'rejected' | 'timeout' | 'disconnected' | 'armBlocked' | 'invalid' | 'legacySchema';
export interface LcCommitFailure {
  reason: LcFailReason;
  /** 화면 문구 — 문구 원천은 `LC_COMMIT_TEXT`(무장 불가는 호출부의 `armBlockOf` 문장). */
  text: string;
  /** 사용자가 확정하려던 값 — 편집을 다시 열 때 이 값으로 연다(입력 보존). */
  value: unknown;
}
/**
 * `noop` 서버 값과 같다(전송 0) · `local` 미등록이라 로컬 반영만 · `sent` 전송함 ·
 * `queued` 앞 건 답을 기다린다 · `blocked` 막힘(무장 불가 · 범위 밖) · `disconnected` 소켓이 받지 않음
 * 또는 세션 미준비(비활성).
 */
export type LcCommitOutcome = 'noop' | 'local' | 'sent' | 'queued' | 'blocked' | 'disconnected';

/** 확정 뒤 값 글자 `--primary` 강조 시간 (UI-SPEC §2 · D-18). */
export const LC_FLASH_MS = 900;

/**
 * 타임아웃(카드 3초 무응답) 뒤 고아 장벽을 유지하는 최대 시간 (⑦ · CR-02). 전송부터 약 10초다.
 * 이 안에 답 신호가 오면 대기 건이 새 서버 값 기준으로 나가고, 안 오면 대기 건은 실패로 표시된다
 * (보내지 않는다). 짧게 잡으면 늦게 닿은 앞 건을 뒤 건이 되돌리는 창이 다시 열린다.
 */
export const LC_ORPHAN_WAIT_MS = 7_000;

/**
 * 전략을 **만들 수 있는** 필드 — 미등록 전략에서도 전송한다(첫 스위치 = 등록, Phase 16 D-05).
 * 매수주문(마스터) · 선매수 · 추가매수 · 후매수 · 매도주문 게이트 + 매수취소 그룹 스위치(`cancelQtyEnabled`, CONTEXT D-21).
 * 세 그룹 스위치는 미등록에서 켜면 D-01 로 마스터가 같은 제출에 켜진다 — 그것이 곧 등록이다.
 * ★ 한방(`sweepEnabled`)은 선매수 안 체크가 됐다 — 미등록에서 한방만 켜 보내면 게이트 4종 OFF → 서버가
 *   `D` 로 정규화한다(존재하지 않는 키의 철거 프레임 · RESEARCH webapp 1). 그래서 등록 필드가 아니다.
 */
export const LC_GATE_FIELDS = [
  'buyEnabled', 'preBuyEnabled', 'extraBuyEnabled', 'postBuyEnabled', 'sellEnabled', 'cancelQtyEnabled',
] as const satisfies readonly LcFieldKey[];

/** 문구 원천 — UI-SPEC Copywriting Contract 원문 그대로다. 다른 곳에서 다시 적지 않는다. */
export const LC_COMMIT_TEXT = {
  failed: '반영하지 못했어요',
  inlineFailed: '반영하지 못했어요 · Enter 로 다시 시도해 주세요',
  disconnected: '연결이 끊겨 보내지 못했어요',
  busy: '반영 중…',
  retry: '다시 시도',
  otherDevice: '다른 단말에서 바뀌었어요',
  armed: '감시 중 — 적용하면 바로 반영돼요',
  /** D-03 — 그룹 금액 0 에서 그 그룹 켜기를 막는 사전 검증 문구(`lcGroupAmountBlockOf`). */
  amountRequired: '주문금액을 먼저 입력해 주세요',
  /** 그룹 켜기 사전 검증 — 금액 < 주문가격이라 수량 0 (옛 무장 불가 「주문금액이 … 작아」의 자리). */
  qtyZero: '금액이 주문가격보다 작아 주문수량이 0주예요 — 금액을 올려 주세요',
  /** 추가매수 켜기 사전 검증 — 최대 ≠ 0 ∧ 최소 > 최대 (D-10). */
  minOverMax: '최소 잔량이 최대 잔량보다 커요 — 최대를 0(무제한)으로 하거나 최소를 낮춰 주세요',
  /** 후매수 켜기 사전 검증 — 반등 1~100 밖(레거시 에코 0 · D-20). */
  reboundRange: '반등을 1~100%로 입력해 주세요',
  /** 후매수 켜기 사전 검증 — 매도비율 0(레거시 에코 · D-27). */
  sellRatioRequired: '후매수는 매도비율이 있어야 켤 수 있어요 — 매도비율을 1~100%로 입력해 주세요',
  /** D-16 — 전략 로그 한 줄 원문(WinForms 합니다체 그대로 · 사전 검증 줄에는 쓰지 않는다). */
  extraBuyAtUpperLimit: '추가매수는 상한가 도달 전에만 켤 수 있습니다 — 매수1호가 == 비교가격',
  /** WR-02 — 구서버 에코 읽기 전용: 값 확정 · 켜는 방향을 막는 문구. 24-13 이 UI-SPEC 에 박제. */
  legacyReadOnly: '구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요',
  /** WR-02 — 구서버 에코 읽기 전용: 매수주문이 켜진 채 다른 것을 끄는 확정을 막는 문구. 24-13 이 UI-SPEC 에 박제. */
  legacyMasterFirst: '구서버 전략이라 매수주문부터 꺼 주세요',
} as const;

/**
 * WR-02 구서버 에코 편집 제한 — **판정 지점 하나**. 훅의 전송 직전 가드(대기열에서 꺼낼 때 포함)와 폼의 시트 ·
 * 인라인 확정 전 검증이 같이 읽는다. 막으면 문구, 아니면 null.
 *
 * 구서버(`buy3Schema 0` · 판별은 lib `isLegacyBuySchema`)에 닿는 cfg 에는 `buy_watch_side` 슬롯이 없다(relay 가
 * 싣지 않는다 · 24-03). 구서버는 그 부재를 `"0"` 으로 읽으므로, 매수가 켜진 채 cfg 를 다시 쓰면 「매수잔량 기준」
 * 전략의 감시 기준이 조용히 반대 호가로 뒤집힌다. 그래서 **끄는 방향(값 `false`) ∧ 결과 cfg 의 매수주문(마스터)
 * OFF** 만 보낸다 — 매수주문 끄기는 늘 여기에 들고, 그 뒤 매도 · 취소 · 체크 끄기와 철거(게이트 4종 OFF)가 든다.
 * 완전 해제 경로가 늘 열려 있어 무장 해제를 인질로 잡지 않는다(T-16-44). 판정 입력 `next` 는 실제로 나갈 값
 * (서버 동기값 + 동반 필드 + 바꾼 필드)이다. `field` 는 판정에 쓰지 않는다 — 끄는 방향이면 어느 필드든(체크 끄기 포함 ·
 * 철거의 `isDeleteIntent` 는 `cancelTradeEnabled` 도 본다) 결과 마스터만 본다. 호출부 두 곳이 같은 모양으로 부르게 받는다.
 */
export function lcLegacyBlockOf(
  legacy: boolean,
  field: LcFieldKey,
  value: unknown,
  next: LimitChaserFormValues,
): string | null {
  if (!legacy) return null;
  if (value !== false) return LC_COMMIT_TEXT.legacyReadOnly;
  if (next.buyEnabled) return LC_COMMIT_TEXT.legacyMasterFirst;
  return null;
}

/**
 * D-03 그룹 금액 — 그룹 스위치 → 그 그룹 금액 필드. 선매수도 같은 규칙이다 — buy3 에코의 선매수 금액 0 은
 * 미입력(D-03 · 24-REVIEW IN-04). 구서버 에코는 켜는 방향 전체가 `lcLegacyBlockOf` 로 막힌다(WR-02).
 */
const GROUP_AMOUNT_FIELD = {
  preBuyEnabled: 'buyOrderAmount',
  extraBuyEnabled: 'extraBuyOrderAmount',
  postBuyEnabled: 'postBuyOrderAmount',
} as const satisfies Partial<Record<LcFieldKey, LcFieldKey>>;

/**
 * D-03 — 선매수 · 추가매수 · 후매수 금액이 0 이면 **그 그룹 스위치를 켜는 방향만** 막는다(문구 = `amountRequired`).
 * 다른 행 확정은 자유롭다(금액 0 · 수량 0 은 서버 값 그대로 실린다 — 조용한 변경 없음). 끄는 방향 · 그 밖 필드는 null.
 * 선매수도 같은 규칙이다 — buy3 에코의 선매수 금액 0 은 미입력(D-03 · IN-04). 구서버 에코는 켜는 방향 전체가
 * `lcLegacyBlockOf` 로 막힌다(WR-02) — 훅 가드가 먼저다.
 */
export function lcGroupAmountBlockOf(values: LimitChaserFormValues, field: LcFieldKey, value: unknown): string | null {
  if (value !== true || !(field in GROUP_AMOUNT_FIELD)) return null;
  const amountField = GROUP_AMOUNT_FIELD[field as keyof typeof GROUP_AMOUNT_FIELD];
  return values[amountField] === 0 ? LC_COMMIT_TEXT.amountRequired : null;
}

export interface UseLcFieldCommitOptions {
  /** 서버 에코 1건. `null` 이면 미등록 전략(⑥). */
  server: RelayLimitChaser | null;
  /** 폼 값의 최신 참조 — `formFromServer` 의 `prev`(서버가 모르는 `buyOrderAmount` 보존)와 미등록 기준값. */
  formRef: { current: LimitChaserFormValues };
  setForm: Dispatch<SetStateAction<LimitChaserFormValues>>;
  /** 폼 값 → 와이어 cfg. 조립 지점은 폼의 `buildCfg` 하나다 — 여기서 복제하지 않는다. */
  buildCfg: (values: LimitChaserFormValues) => RelayLimitChaserInput;
  /** 소켓에 실었는가. false 면 **보내지 않았음이 확실**하다(`use-relay-socket.ts`). */
  send: (msg: RelayLcSetMsg) => boolean;
  /** 보낸 직후 통지 — 카드 `handleSent`(3초 무응답 판정 · 에코 출처 · 보낸 사유 ⑫). */
  onSent?: (cfg: RelayLimitChaserInput, meta?: LcCommitMeta) => void;
  /** 카드가 이 전략의 답을 접수한 횟수(`answerSeq`). 값이 아니라 **바뀌었다는 사실**만 쓴다. */
  serverAnswerSeq: number;
  /** 세션 미준비 등 — 확정 전체를 막는다. */
  disabled: boolean;
  /** 카드 3초 무응답(`unacked`) — in-flight 중 true 가 되면 타임아웃 실패(⑧). 기본 false. */
  unacked?: boolean;
  /** 무장 불가 사유 — 문장이면 전송하지 않는다(⑨). 폼의 `armBlockOf` 가 원천이다. */
  armBlockOf?: (values: LimitChaserFormValues) => string | null;
}

/**
 * 동반 필드(⑪) — 값 또는 **판정 시점의 기준값**(서버 동기값 `formFromServer(server, formRef.current)`, 미등록이면
 * 폼 값)으로 계산하는 함수. 함수는 대기열에서 꺼내는 순간에도 다시 불린다(WR-03) — 누른 순간의 값으로 굳히지 않는다.
 */
export type LcCompanions =
  | Partial<LimitChaserFormValues>
  | ((base: LimitChaserFormValues) => Partial<LimitChaserFormValues>);

/** 확정의 부가 정보 — 전송 · 로그 귀속에만 쓴다(⑫). */
export interface LcCommitMeta {
  /** 보낸 사유 — 24-05 `StrategySubmitCause`(`'serverFold'` = D-02 후반 서버 접힘 뒤 마스터 자동 끔). */
  cause?: StrategySubmitCause;
}

/** 확정 1건 — 대기열 항목이자 in-flight 의 원형. */
interface Pending {
  field: LcFieldKey;
  value: unknown;
  kind: LcCommitKind;
  /** 확정 직전 폼 값 — 미등록(서버 없음)일 때의 토글 되돌림 기준(⑩). 서버가 있으면 서버 동기값으로 되돌린다(GC-WR-02). */
  prevValue: unknown;
  /**
   * 같은 `lc.set` 에 함께 실을 필드(D-01 · D-02 마스터 · ⑪) — 값 또는 판정 시점에 계산하는 함수(WR-03).
   * 성공 판정은 주 필드만. in-flight 기록에는 실제로 실은 계산 결과(값)가 남는다.
   */
  companions?: LcCompanions;
  /** 지금 낙관 표시 · 되돌림 기준이 된 동반 계산 결과 — 다시 계산해 키가 바뀌면 `reshow` 가 맞춘다. */
  shownCompanions?: Partial<LimitChaserFormValues>;
  /** 되돌림용 — `shownCompanions` 키들의 확정 직전 폼 값(미등록일 때의 기준 · 서버가 있으면 서버 동기값 · GC-WR-02). */
  prevCompanions?: Partial<LimitChaserFormValues>;
  /** 보낸 사유(⑫) — `onSent` 로만 흐른다. */
  meta?: LcCommitMeta;
}

interface Inflight extends Pending {
  /** 보낼 때의 `serverAnswerSeq` — 이 값에서 바뀌면 답이 온 것이다. */
  answerSeqAtSend: number;
}

type FailureMap = Partial<Record<LcFieldKey, LcCommitFailure>>;

function isGateField(field: LcFieldKey): boolean {
  return (LC_GATE_FIELDS as readonly LcFieldKey[]).includes(field);
}

/**
 * 무장 해제 방향인가 — 게이트를 끄거나 한방 체크를 끈다(T-16-44: 끄는 쪽은 무장 가드를 지나지 않는다).
 * 한방은 등록 필드(`LC_GATE_FIELDS`)에서 빠졌지만 끄는 것은 여전히 무장 해제다 — 종전 면제를 그대로 둔다.
 */
function isDisarm(field: LcFieldKey, value: unknown): boolean {
  return value === false && (isGateField(field) || field === 'sweepEnabled');
}

/** 폼 값에서 `keys` 만 뽑는다 — 동반 필드 되돌림 기준(⑪). */
function pickValues(
  values: LimitChaserFormValues,
  keys: Partial<LimitChaserFormValues> | undefined,
): Partial<LimitChaserFormValues> | undefined {
  if (keys === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(keys) as LcFieldKey[]) out[k] = values[k];
  return out as Partial<LimitChaserFormValues>;
}

/**
 * 동반 중 **불리언 값만** — 낙관 표시 · 되돌림에 쓰는 몫이다(④ · IN-05). 값 필드(가격 등)는 cfg 에만 싣고 에코를 기다린다.
 */
function booleanCompanions(
  companions: Partial<LimitChaserFormValues> | undefined,
): Partial<LimitChaserFormValues> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(companions ?? {})) if (typeof v === 'boolean') out[k] = v;
  return out as Partial<LimitChaserFormValues>;
}

/**
 * 동반 필드를 이 판정 시점의 기준값으로 계산한다(⑪ · WR-03) — 함수면 부르고, 값이면 그대로, 없으면 undefined.
 * 판정할 때마다 부른다(대기 건은 꺼내는 순간의 서버 동기값으로 다시 계산된다).
 */
function companionsAt(
  p: { companions?: LcCompanions },
  base: LimitChaserFormValues,
): Partial<LimitChaserFormValues> | undefined {
  const c = p.companions;
  if (c === undefined) return undefined;
  return typeof c === 'function' ? c(base) : c;
}

/** 서버가 이미 이 확정 그대로인가 — 주 필드와 모든 동반 필드가 같을 때만(⑪). */
function sameAsServer(server: RelayLimitChaser, field: LcFieldKey, value: unknown, companions?: Partial<LimitChaserFormValues>): boolean {
  if (server[field] !== value) return false;
  if (companions === undefined) return true;
  return (Object.entries(companions) as [LcFieldKey, unknown][]).every(([k, v]) => server[k] === v);
}

function withoutField(map: FailureMap, field: LcFieldKey): FailureMap {
  if (!(field in map)) return map;
  const next = { ...map };
  delete next[field];
  return next;
}

export function useLcFieldCommit(o: UseLcFieldCommitOptions): {
  commit: <K extends LcFieldKey>(
    field: K,
    value: LimitChaserFormValues[K],
    kind: LcCommitKind,
    companions?: LcCompanions,
    meta?: LcCommitMeta,
  ) => LcCommitOutcome;
  inflightField: LcFieldKey | null;
  queuedFields: readonly LcFieldKey[];
  failures: FailureMap;
  flashField: LcFieldKey | null;
  successSeq: number;
  lastSuccessField: LcFieldKey | null;
  clearFailure: (field: LcFieldKey) => void;
  /**
   * ⑨-3 — 서버가 주문금액을 모른다(구서버 에코 ∧ 금액 0 · `isLegacyAmountUnknown`). 금액 행 「—」 표기용이다 —
   * 확정 제한은 `lcLegacyBlockOf`(WR-02)가 한다. buy3 에코의 금액 0 은 미입력(D-03)이라 false.
   */
  amountRequired: boolean;
} {
  // 콜백은 늘 최신 옵션을 읽는다 — 확정은 이벤트 핸들러에서, 판정은 이펙트에서 일어난다.
  const optsRef = useRef(o);
  optsRef.current = o;

  /** 나가 있는 전송 1건. 판정의 정본은 ref 다(같은 틱 두 번의 확정도 정확히 본다). */
  const inflightRef = useRef<Inflight | null>(null);
  const [inflightField, setInflightField] = useState<LcFieldKey | null>(null);
  /** 대기열 — 필드당 최대 1건, 확정 순서(⑦). */
  const queueRef = useRef<Pending[]>([]);
  const [queuedFields, setQueuedFields] = useState<readonly LcFieldKey[]>([]);
  /**
   * 성공 뒤 「다음 답 신호 증가를 기다린다」 — 그 증가를 본 렌더에서만 대기 건을 꺼낸다(⑦).
   * `null` 이 아니면 아직 한 건이 끝나지 않은 것으로 본다(새 확정도 대기로 선다).
   */
  const popAfterSeqRef = useRef<number | null>(null);
  /**
   * 고아 장벽 (CR-02) — 타임아웃으로 실패 처리했지만 **이미 소켓에 실린** 전송. `null` 이 아니면 새 확정은
   * 대기열에 선다. 다음 답 신호 · 서버 값 변화에서 풀리고, `LC_ORPHAN_WAIT_MS` 가 지나면 대기 건을
   * 실패로 두고 풀린다.
   */
  const orphanRef = useRef<{ field: LcFieldKey; answerSeqAtSend: number } | null>(null);
  const orphanTimer = useRef<number | null>(null);

  /** 지금(최신 옵션 기준) 서버가 금액을 모르는가 — 끄기 cfg 의 금액 · 수량을 서버 값으로 싣는 줄이 읽는다(⑨-3). */
  const amountUnknownNow = useCallback((): boolean => isLegacyAmountUnknown(optsRef.current.server), []);
  /** 판정 기준값(② · T-20-03) — 서버 동기값, 미등록이면 폼 값. 전송 조립 · 동반 계산(⑪)이 같은 식을 읽는다. */
  const baseNow = useCallback((): LimitChaserFormValues => {
    const { server, formRef } = optsRef.current;
    return server != null ? formFromServer(server, formRef.current) : formRef.current;
  }, []);

  const failuresRef = useRef<FailureMap>({});
  const [failures, setFailuresState] = useState<FailureMap>({});
  const writeFailures = useCallback((update: (prev: FailureMap) => FailureMap) => {
    const next = update(failuresRef.current);
    if (next === failuresRef.current) return;
    failuresRef.current = next;
    setFailuresState(next);
  }, []);
  const setFailure = useCallback(
    (field: LcFieldKey, reason: LcFailReason, text: string, value: unknown) =>
      writeFailures((prev) => ({ ...prev, [field]: { reason, text, value } })),
    [writeFailures],
  );

  const [flashField, setFlashField] = useState<LcFieldKey | null>(null);
  const [success, setSuccess] = useState<{ seq: number; field: LcFieldKey | null }>({
    seq: 0,
    field: null,
  });
  const flashTimer = useRef<number | null>(null);

  /** 성공 — 그 필드 실패를 거두고 값 글자를 900ms 강조한다. */
  const markSuccess = useCallback(
    (field: LcFieldKey) => {
      writeFailures((prev) => withoutField(prev, field));
      setFlashField(field);
      setSuccess((s) => ({ seq: s.seq + 1, field }));
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => {
        flashTimer.current = null;
        setFlashField(null);
      }, LC_FLASH_MS);
    },
    [writeFailures],
  );

  const setInflight = useCallback((next: Inflight | null) => {
    inflightRef.current = next;
    setInflightField(next === null ? null : next.field);
  }, []);

  const syncQueue = useCallback(() => {
    setQueuedFields(queueRef.current.map((q) => q.field));
  }, []);

  /**
   * 토글 낙관 표시 · 되돌림 — 값 필드에는 절대 부르지 않는다(④). 동반은 **불리언만** 같은 `setForm` 한 번에(⑪ · IN-05).
   */
  const showToggle = useCallback(
    (field: LcFieldKey, value: unknown, companions?: Partial<LimitChaserFormValues>) => {
      const shown = booleanCompanions(companions);
      optsRef.current.setForm((prev) => ({ ...prev, ...shown, [field]: value }));
    },
    [],
  );
  /** 이 확정의 낙관 표시(주 필드 + 동반 계산 결과). */
  const applyToggle = useCallback((p: Pending) => showToggle(p.field, p.value, p.shownCompanions), [showToggle]);
  /**
   * 이 확정의 토글 표시를 되돌린다(주 필드 + 동반 · 불리언만 — `showToggle` 이 거른다 · IN-05).
   * ★ 서버가 있으면 **지금 서버 값**이다(GC-WR-02) — 누른 순간 값으로 되돌리면 그사이 서버가 바꾼 스위치(서버가 접은
   *   선매수 · 다른 단말이 켠 매도)를 거짓으로 그린다. 미등록이면 확정 직전 폼 값이다(서버 값이 없다).
   *   실패 · 폐기의 모든 경로(in-flight 실패 · 대기 접기 · 꺼낼 때 막힘 · 끊김)가 이 한 자리를 지난다.
   *   기준값은 전송 조립과 같은 식(`baseNow()` = `formFromServer(server, formRef.current)`)이다.
   */
  const revertToggle = useCallback(
    (p: Pending) => {
      if (optsRef.current.server == null) {
        showToggle(p.field, p.prevValue, p.prevCompanions);
        return;
      }
      const base = baseNow();
      showToggle(p.field, base[p.field], pickValues(base, p.shownCompanions));
    },
    [baseNow, showToggle],
  );
  /**
   * 동반 계산 결과를 `next` 로 바꾼다(⑪ · WR-03) — 같은 필드 재확정과 꺼낼 때의 재계산이 같은 규칙이다.
   * 빠지는 키는 되돌리고(토글 — 이미 낙관 표시했다 · 불리언만 · IN-05 · 기준은 `revertToggle` 과 같다 — 서버가 있으면
   * 지금 서버 값, 없으면 확정 직전 값 · GC-WR-02), 새 키의 미등록 되돌림 기준은 지금 폼 값이다(이미 이 확정이 낙관
   * 표시한 키는 처음 잡은 기준을 유지한다).
   */
  const reshow = useCallback(
    (p: Pending, next: Partial<LimitChaserFormValues> | undefined) => {
      if (p.kind === 'toggle') {
        const base = optsRef.current.server != null ? baseNow() : null;
        const dropped: Record<string, unknown> = {};
        for (const k of Object.keys(p.shownCompanions ?? {}) as LcFieldKey[]) {
          if (next === undefined || !(k in next)) dropped[k] = base !== null ? base[k] : p.prevCompanions?.[k];
        }
        const revert = booleanCompanions(dropped as Partial<LimitChaserFormValues>);
        if (Object.keys(revert).length > 0) optsRef.current.setForm((prev) => ({ ...prev, ...revert }));
      }
      const oldPrev: Partial<LimitChaserFormValues> = p.prevCompanions ?? {};
      p.prevCompanions = pickValues({ ...optsRef.current.formRef.current, ...oldPrev }, next);
      p.shownCompanions = next;
    },
    [baseNow],
  );

  /**
   * 지금 보낸다 — 즉시 확정과 대기 꺼내기가 **같은 경로**다. 무장 판정(⑨)은 여기서만 한다.
   * `optimistic` = 이 토글을 이미 낙관 표시했는가(대기 진입 시) — 보내지 못하면 되돌린다.
   */
  const sendNow = useCallback(
    (p: Pending, optimistic: boolean): LcCommitOutcome => {
      const { server, buildCfg, send, onSent, serverAnswerSeq, armBlockOf } = optsRef.current;
      // ② 기준값 = 서버 동기값 + 동반 필드(⑪) + 바꾼 필드. 동반은 **지금** 기준값으로 다시 계산한다(WR-03 —
      //   대기 건이면 꺼내는 순간의 서버 값). 계산 결과가 낙관 표시한 것과 다르면 표시 · 되돌림 기준을 맞춘다.
      const base = baseNow();
      const companions = companionsAt(p, base);
      reshow(p, companions);
      const next: LimitChaserFormValues = { ...base, ...(companions ?? {}), [p.field]: p.value };
      // ⑨-2 범위 밖 cfg 는 연결을 끊는다 — 끄는 방향도 예외 없이 막는다(CR-01).
      const outOfRange = lcRangeIssue(next);
      if (outOfRange !== null) {
        setFailure(p.field, 'invalid', outOfRange, p.value);
        if (optimistic) revertToggle(p);
        return 'blocked';
      }
      // WR-02 구서버 에코는 끄기만 · 매수주문부터 — 대기열에서 꺼낼 때도 이 경로라 같은 가드다.
      const legacyBlocked = lcLegacyBlockOf(isLegacyBuySchema(server), p.field, p.value, next);
      if (legacyBlocked !== null) {
        setFailure(p.field, 'legacySchema', legacyBlocked, p.value);
        if (optimistic) revertToggle(p);
        return 'blocked';
      }
      const turningOff = isDisarm(p.field, p.value);
      const blocked = turningOff ? null : (armBlockOf?.(next) ?? null);
      if (blocked !== null) {
        setFailure(p.field, 'armBlocked', blocked, p.value);
        if (optimistic) revertToggle(p);
        return 'blocked';
      }
      let cfg = buildCfg(next);
      // ⑨-3 금액을 모르는 채 나가는 것은 끄기뿐이다(WR-02 가드를 지났다) — 금액·수량은 서버 값 그대로 싣는다
      //   (수량을 기본 금액으로 다시 계산해 덮지 않는다 · D-04a 잔여 규칙).
      if (server != null && amountUnknownNow()) {
        cfg = { ...cfg, buyOrderAmount: server.buyOrderAmount, buyOrderQty: server.buyOrderQty };
      }
      if (!send({ t: 'lc.set', cfg })) {
        setFailure(p.field, 'disconnected', LC_COMMIT_TEXT.disconnected, p.value);
        if (optimistic) revertToggle(p);
        return 'disconnected';
      }
      // 사유가 없으면 인자 하나로 부른다 — 받는 쪽에서 둘째 인자는 늘 `undefined` 다(⑫).
      if (p.meta === undefined) onSent?.(cfg);
      else onSent?.(cfg, p.meta);
      writeFailures((prev) => withoutField(prev, p.field));
      // in-flight 기록에는 실제로 실은 계산 결과가 남는다(함수가 아니라 값 · ⑪).
      setInflight({ ...p, companions, answerSeqAtSend: serverAnswerSeq });
      // ⑩ 토글은 전송 뒤 낙관 표시 — 대기 중 에코가 폼을 덮었을 수 있어 꺼낼 때도 다시 건다.
      if (p.kind === 'toggle') applyToggle(p);
      return 'sent';
    },
    [amountUnknownNow, applyToggle, baseNow, reshow, revertToggle, setFailure, setInflight, writeFailures],
  );

  /** 대기열에서 한 건을 보낼 때까지 꺼낸다 — no-op 은 건너뛰고, 끊기면 남은 건도 끊김이다. */
  const drain = useCallback(() => {
    const { server } = optsRef.current;
    while (queueRef.current.length > 0) {
      const p = queueRef.current.shift()!;
      // no-op 판정도 꺼내는 순간의 서버 값으로 동반을 다시 계산한다(⑪ · WR-03).
      if (server != null && sameAsServer(server, p.field, p.value, companionsAt(p, baseNow()))) {
        // 서버가 이미 사용자가 확정한 값이다 — 보낼 것은 없지만 **성공**이다(20-REVIEW WR-06). 성공 신호가
        // 없으면 `queued` 로 열려 기다리던 시트·인라인 편집기가 닫히지 않는다.
        markSuccess(p.field);
        continue;
      }
      // ⑥ 앞 건(등록)이 답을 받았는데도 여전히 미등록 — 게이트 밖 필드는 로컬 반영만 한다(보내면 존재하지
      //   않는 키의 철거 프레임이 나간다 · Pitfall 2). WR-01.
      if (server == null && !isGateField(p.field)) {
        optsRef.current.setForm((prev) => ({ ...prev, [p.field]: p.value }));
        markSuccess(p.field);
        continue;
      }
      const out = sendNow(p, p.kind === 'toggle');
      if (out === 'sent') break;
      if (out === 'disconnected') {
        for (const rest of queueRef.current) {
          setFailure(rest.field, 'disconnected', LC_COMMIT_TEXT.disconnected, rest.value);
          if (rest.kind === 'toggle') revertToggle(rest);
        }
        queueRef.current = [];
      }
    }
    syncQueue();
  }, [baseNow, markSuccess, revertToggle, sendNow, setFailure, syncQueue]);

  /** 대기 건 전부를 보내지 않고 실패로 표시한다 — 서버가 이미 그 값이면 실패라 말하지 않는다(⑦). */
  const failQueue = useCallback(
    (reason: 'rejected' | 'timeout') => {
      const { server } = optsRef.current;
      for (const q of queueRef.current) {
        // 서버가 이미 그 값이면 보낼 것이 없던 확정이다 — 실패가 아니라 성공이다(열린 시트·편집기를 닫는다 · WR-06).
        //   ★ 주 필드만 같다고 접지 않는다(WR-04) — drain · 즉시 경로와 같은 `sameAsServer` 로 동반까지 본다
        //     (동반은 지금 서버 동기값으로 계산 · WR-03). 보내지 않은 동반 마스터 OFF 를 낙관 표시로 남기지 않는다.
        if (server != null && sameAsServer(server, q.field, q.value, companionsAt(q, baseNow()))) {
          markSuccess(q.field);
          continue;
        }
        // 주 필드가 이미 서버 값이면 주 필드는 성공 · 동반만 서버 값으로 — 누른 순간 값으로 되돌리지 않는다(GC-WR-02).
        //   대기 건 전체를 성공으로 접는 것(WR-04 가 막은 것)과 다르다 — 서지 않은 동반(예: D-02 전반 마스터 OFF)은
        //   아래 `revertToggle` 이 서버 값(ON)으로 되돌려 보이고, 사람이 누른 주 필드에는 실패 말풍선이 붙지 않는다.
        if (server != null && sameAsServer(server, q.field, q.value)) markSuccess(q.field);
        else setFailure(q.field, reason, LC_COMMIT_TEXT.failed, q.value);
        // 두 갈래 모두 토글 표시는 지금 서버 값이다(⑩ · GC-WR-02).
        if (q.kind === 'toggle') revertToggle(q);
      }
      queueRef.current = [];
      syncQueue();
    },
    [baseNow, markSuccess, revertToggle, setFailure, syncQueue],
  );

  /** in-flight 실패 — 되돌리고, 대기 건은 보내지 않고 전부 실패로 표시한다(⑦). */
  const failInflight = useCallback(
    (inf: Inflight, reason: 'rejected' | 'timeout') => {
      setInflight(null);
      popAfterSeqRef.current = null;
      setFailure(inf.field, reason, LC_COMMIT_TEXT.failed, inf.value);
      if (inf.kind === 'toggle') revertToggle(inf);
      failQueue('rejected');
      // CR-02 — 타임아웃은 결과 모름이다. 그 프레임이 늦게 닿을 수 있으니 다음 답 신호까지 장벽을 둔다.
      if (reason === 'timeout') {
        orphanRef.current = { field: inf.field, answerSeqAtSend: inf.answerSeqAtSend };
        if (orphanTimer.current != null) window.clearTimeout(orphanTimer.current);
        orphanTimer.current = window.setTimeout(() => {
          orphanTimer.current = null;
          if (orphanRef.current === null) return;
          // 아무 답도 오지 않았다 — 대기 건은 낡은 기준값이라 보내지 않고 실패로 둔다(⑤ · CR-02).
          orphanRef.current = null;
          failQueue('timeout');
        }, LC_ORPHAN_WAIT_MS);
      }
    },
    [failQueue, revertToggle, setFailure, setInflight],
  );

  /** 고아 장벽을 푼다 — 답 신호가 왔다(결과가 서버 값에 드러났다). */
  const releaseOrphan = useCallback(() => {
    orphanRef.current = null;
    if (orphanTimer.current != null) window.clearTimeout(orphanTimer.current);
    orphanTimer.current = null;
  }, []);

  const commit = useCallback(
    <K extends LcFieldKey>(
      field: K,
      value: LimitChaserFormValues[K],
      kind: LcCommitKind,
      companions?: LcCompanions,
      meta?: LcCommitMeta,
    ): LcCommitOutcome => {
      const { server, formRef, setForm, disabled } = optsRef.current;
      // 세션이 준비되지 않았다(재접속·끊김) — 조용히 무시하지 않고 끊김 실패로 남긴다(20-REVIEW WR-04).
      //   시트·인라인 편집기가 열린 채 연결이 빠지면 「적용」/Enter 가 아무 반응도 없던 경로다. 시트는
      //   「연결이 끊겨 보내지 못했어요 · 다시 시도」, 인라인은 말풍선, 토글은 폼 맨 위 한 줄이 말한다.
      if (disabled) {
        setFailure(field, 'disconnected', LC_COMMIT_TEXT.disconnected, value);
        return 'disconnected';
      }

      // 동반 필드는 이 판정 시점의 기준값으로 계산한다(⑪ · WR-03 — 대기에 서면 꺼낼 때 다시 계산한다).
      const shown = companionsAt({ companions }, baseNow());

      // 같은 필드가 대기 중 — 값 · 동반 필드 · 사유만 바꾸고 자리는 그대로다(⑦ · ⑪).
      const queued = queueRef.current.find((q) => q.field === field);
      if (queued !== undefined) {
        // 빠지는 동반 필드는 확정 직전 값으로 되돌리고, 새 동반 필드의 되돌림 기준은 지금 폼 값이다(`reshow`).
        reshow(queued, shown);
        queued.value = value;
        queued.companions = companions;
        queued.meta = meta;
        if (kind === 'toggle') showToggle(field, value, shown);
        writeFailures((prev) => withoutField(prev, field));
        return 'queued';
      }

      const inflight = inflightRef.current;
      const orphan = orphanRef.current;
      // 서버 값과 같다 — 보낼 것이 없다(전송 0). 단 그 필드가 나가 있거나(in-flight · 결과 모름) 그 답 뒤에 판정한다.
      if (
        server != null &&
        sameAsServer(server, field, value, shown) &&
        inflight?.field !== field &&
        orphan?.field !== field
      ) {
        writeFailures((prev) => withoutField(prev, field));
        return 'noop';
      }
      // ⑦ 한 건이 끝나지 않았다(in-flight · 성공 뒤 답 신호 대기 · 타임아웃 뒤 결과 모름).
      //   ★ 결과 모름 장벽은 **다른 필드**만 세운다(CR-02). 같은 필드의 새 확정은 그 필드의 최신 의도를
      //     싣고, 같은 소켓이라 늦게 닿는 앞 건보다 뒤에 처리되므로 앞 건을 대체할 뿐 되돌리지 않는다 —
      //     타임아웃 뒤 「다시 시도」(같은 스위치 다시 누르기)가 곧바로 나가는 이유다.
      const orphanBlocks = orphan !== null && orphan.field !== field;
      const busy = inflight !== null || popAfterSeqRef.current !== null || orphanBlocks;
      // ⑥ 미등록 전략 — 게이트 4종 밖은 로컬 반영만 한다. ★ 단 등록 전송이 나가 있으면(busy) 대기열에 선다
      //   (20-REVIEW WR-01) — 지금 로컬 반영하고 성공 강조를 띄우면 곧 올 등록 에코(등록 cfg 시점 값)가 폼을
      //   덮어 사용자가 본 편집이 조용히 사라진다. 꺼낼 때 서버가 생겼으면 정상 전송, 여전히 없으면 로컬 반영.
      if (server == null && !isGateField(field) && !busy) {
        setForm((prev) => ({ ...prev, [field]: value }));
        markSuccess(field);
        return 'local';
      }

      const pending: Pending = { field, value, kind, prevValue: formRef.current[field], companions, meta };
      // 낙관 표시 · 되돌림 기준 = 지금 계산한 동반(⑪). 대기 건은 꺼낼 때 `sendNow` 가 다시 계산해 맞춘다.
      reshow(pending, shown);
      if (busy) {
        queueRef.current.push(pending);
        if (kind === 'toggle') applyToggle(pending);
        writeFailures((prev) => withoutField(prev, field));
        syncQueue();
        return 'queued';
      }
      const out = sendNow(pending, false);
      // 같은 필드의 새 확정이 결과 모름 건을 대체했다 — 이제 직렬화는 이 in-flight 가 맡는다.
      if (out === 'sent' && orphan !== null) releaseOrphan();
      return out;
    },
    [applyToggle, baseNow, markSuccess, releaseOrphan, reshow, sendNow, setFailure, showToggle, syncQueue, writeFailures],
  );

  const clearFailure = useCallback(
    (field: LcFieldKey) => writeFailures((prev) => withoutField(prev, field)),
    [writeFailures],
  );

  /*
    해소 — 서버 값 · 답 신호 · 무응답이 바뀐 렌더에서만 판정한다.
    ① in-flight 판정(성공은 값 비교로만) → ② 대기 꺼내기(성공 뒤 답 신호가 바뀐 렌더) →
    ③ 늦은 에코(실패를 성공으로). 순서가 곧 규칙이다 — 이번 실행에서 막 보낸 건을 같은
    실행에서 판정하지 않는다.
  */
  const unacked = o.unacked ?? false;
  const prevServerRef = useRef<RelayLimitChaser | null>(o.server);
  useEffect(() => {
    const server = o.server;
    const seq = o.serverAnswerSeq;
    const serverChanged = prevServerRef.current !== server;
    prevServerRef.current = server;

    // ① in-flight 판정.
    const inf = inflightRef.current;
    let drainNow = false;
    if (inf !== null) {
      const answered = seq !== inf.answerSeqAtSend;
      // ⑧ 성공 = 에코의 그 필드 값 === 보낸 값, 예외 없음.
      const matches = server != null && server[inf.field] === inf.value;
      if (matches) {
        setInflight(null);
        markSuccess(inf.field);
        // 서버 값이 이 렌더에 바뀌었다 = 카드의 답 신호 증가가 한 렌더 뒤에 온다 → 그때 꺼낸다.
        //   ★ 대기열이 비어 있어도 장벽을 세운다(20-REVIEW WR-02) — 성공 렌더와 증가 렌더 사이에 들어온 새
        //     확정이 증가 전 seq 로 나가면 뒤따르는 증가를 그 건의 「거부」로 오판한다. 그 확정은 증가까지 대기다.
        // 답 신호가 먼저 와 있었다(늦은 에코 뒤) = 더 올 증가가 없다 → 지금 꺼낸다.
        if (serverChanged) popAfterSeqRef.current = seq;
        else if (queueRef.current.length > 0) drainNow = true;
      } else if (unacked) {
        failInflight(inf, 'timeout');
      } else if (answered) {
        failInflight(inf, 'rejected');
      }
    }

    // ①-2 고아 장벽 해제 (CR-02) — 결과 모름이던 전송 뒤로 답 신호나 서버 값 변화가 왔다.
    //   서버 값이 이 렌더에 바뀌었으면 카드의 답 신호 증가가 한 렌더 뒤에 오므로 그때 꺼낸다(⑦).
    //   답 신호만 바뀌었으면(거부 등) 더 올 증가가 없다 → 지금 꺼낸다. 꺼낼 때 no-op·무장 판정은 새 서버 값이다.
    const orphan = orphanRef.current;
    if (inf === null && orphan !== null && (serverChanged || seq !== orphan.answerSeqAtSend)) {
      releaseOrphan();
      // 대기열이 비어 있어도 뒤따르는 증가를 기다린다 — 그 사이 새 확정이 그 증가를 거부로 읽지 않게(⑦).
      if (serverChanged) popAfterSeqRef.current = seq;
      else if (queueRef.current.length > 0) drainNow = true;
    }

    // ② 대기 꺼내기 — 성공 뒤 답 신호가 바뀐 렌더다.
    if (inf === null && popAfterSeqRef.current !== null && seq !== popAfterSeqRef.current) {
      popAfterSeqRef.current = null;
      drainNow = true;
    }
    if (drainNow) drain();

    // ③ 늦은 에코 — 보냈다가(또는 대기에서 폐기돼) 실패로 판정한 값이 서버에 섰다.
    //    보내지 않은 실패(끊김 · 무장 불가)는 대상이 아니다.
    if (serverChanged && server != null) {
      for (const [f, fail] of Object.entries(failuresRef.current) as [LcFieldKey, LcCommitFailure][]) {
        if (fail.reason !== 'rejected' && fail.reason !== 'timeout') continue;
        if (server[f] === fail.value) markSuccess(f);
      }
    }
  }, [o.server, o.serverAnswerSeq, unacked, drain, failInflight, markSuccess, releaseOrphan, setInflight]);

  useEffect(
    () => () => {
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
      if (orphanTimer.current != null) window.clearTimeout(orphanTimer.current);
    },
    [],
  );

  return {
    commit,
    inflightField,
    queuedFields,
    failures,
    flashField,
    successSeq: success.seq,
    lastSuccessField: success.field,
    clearFailure,
    amountRequired: isLegacyAmountUnknown(o.server),
  };
}
