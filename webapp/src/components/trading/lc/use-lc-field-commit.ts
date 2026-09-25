'use client';

/**
 * useLcFieldCommit — 상따 설정 **필드 1회 확정 = `lc.set` 1회** 상태 기계 (Phase 20 D-04).
 *
 * ① 무엇을 대체하는가
 *   옛 모델은 「값을 고친다 → 더티가 쌓인다 → 하단 「수정」」이었다. 이 훅은 그 사이를 걷는다 —
 *   시트 「적용」·인라인 Enter/blur·체크·토글 **한 번**이 곧 전략 전체(32필드) 전송 한 번이다.
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
 *
 * ⑤ ★ 재전송하지 않는다 (T-16-10)
 *   실패·타임아웃 뒤 이 훅은 **아무것도 다시 보내지 않는다.** 「다시 시도」는 사용자가 다시 누른
 *   새 `commit` 이다 — 사용자가 누르지 않은 두 번째 요청은 곧 두 번째 등록이다.
 *
 * ⑥ ★ 미등록 전략(server 없음)은 로컬 반영만 한다 (planner assumption A-P1 · RESEARCH Open Q1)
 *   값·체크·감시대상 확정을 보내면 `crudOf` 가 `'D'` 인 철거 프레임이 나가거나(존재하지 않는 키)
 *   게이트성 체크가 의도치 않은 등록을 만든다(Pitfall 2). 등록은 그룹 스위치 4개
 *   (`LC_GATE_FIELDS`)만 한다 — Phase 16 D-05 「첫 스위치 = 등록」 그대로.
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
 *   특례: `buyOrderAmount` 에코가 0 이면 「서버가 모른다」(`lib/limit-chaser.ts`)라 답 도착만으로 성공.
 *
 * ⑨ ★ 무장 불가 값은 보내지 않는다 (WR-06 · T-20-01)
 *   전송 직전 `armBlockOf(서버 동기값 + 바꾼 필드)` 가 문장을 돌려주면 막고 그 문장을 실패로 둔다.
 *   ★ **끄는 방향 게이트는 판정하지 않는다**(T-16-44) — 무장 해제를 막는 화면은 자산을 인질로 잡는다.
 *
 * ⑨-2 ★ relay 스키마 범위 밖 cfg 는 보내지 않는다 (20-REVIEW CR-01)
 *   relay 는 `lc.set` 스키마 위반 프레임을 받으면 **WebSocket 연결을 통째로 끊는다** — 모든 카드의 시세·
 *   에코가 멈추고 같은 소켓의 수동주문이 결과 모름에 걸린다. 시트·인라인이 편집 필드를 먼저 잠그지만
 *   cfg 는 32필드 전부라, 전송 직전 `lcRangeIssue(cfg 기준값)` 로 **한 번 더** 막는다(마지막 방어선).
 *   ★ 이 가드는 끄는 방향도 막는다 — 범위 밖 프레임은 끄기조차 반영하지 못하고 연결만 끊는다.
 *
 * ⑩ 토글 종류(스위치·체크·감시대상)는 전송 뒤(또는 대기 진입 시) 낙관 표시하고, 실패·폐기되면
 *   확정 직전 값으로 되돌린다(UI-SPEC E2). `send` 가 false 면 폼을 건드리지 않는다(GC-WR-06).
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

import { lcRangeIssue } from '@/components/trading/lc/lc-fields';
import { formFromServer, type LimitChaserFormValues } from '@/lib/limit-chaser';

export type LcFieldKey = keyof LimitChaserFormValues;
/** `value` = 숫자 값(낙관 반영 없음) · `toggle` = 스위치·체크·감시대상(전송 뒤 낙관 표시). */
export type LcCommitKind = 'value' | 'toggle';
/** `invalid` = relay 스키마 범위 밖이라 보내지 않았다(⑨-2 · CR-01). */
export type LcFailReason = 'rejected' | 'timeout' | 'disconnected' | 'armBlocked' | 'invalid';
export interface LcCommitFailure {
  reason: LcFailReason;
  /** 화면 문구 — 문구 원천은 `LC_COMMIT_TEXT`(무장 불가는 호출부의 `armBlockOf` 문장). */
  text: string;
  /** 사용자가 확정하려던 값 — 편집을 다시 열 때 이 값으로 연다(입력 보존). */
  value: unknown;
}
/**
 * `noop` 서버 값과 같다(전송 0) · `local` 미등록이라 로컬 반영만 · `sent` 전송함 ·
 * `queued` 앞 건 답을 기다린다 · `blocked` 막힘(비활성·무장 불가) · `disconnected` 소켓이 받지 않음.
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
 * 매수주문 · 한방체결 · 매도주문 게이트 + 매수취소 그룹 스위치(`cancelQtyEnabled`, CONTEXT D-21).
 */
export const LC_GATE_FIELDS = ['buyEnabled', 'sweepEnabled', 'sellEnabled', 'cancelQtyEnabled'] as const satisfies readonly LcFieldKey[];

/** 문구 원천 — UI-SPEC Copywriting Contract 원문 그대로다. 다른 곳에서 다시 적지 않는다. */
export const LC_COMMIT_TEXT = {
  failed: '반영하지 못했어요',
  inlineFailed: '반영하지 못했어요 · Enter 로 다시 시도해 주세요',
  disconnected: '연결이 끊겨 보내지 못했어요',
  busy: '반영 중…',
  retry: '다시 시도',
  otherDevice: '다른 단말에서 바뀌었어요',
  armed: '감시 중 — 적용하면 바로 반영돼요',
} as const;

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
  /** 보낸 직후 통지 — 카드 `handleSent`(3초 무응답 판정 · 에코 출처). */
  onSent?: (cfg: RelayLimitChaserInput) => void;
  /** 카드가 이 전략의 답을 접수한 횟수(`answerSeq`). 값이 아니라 **바뀌었다는 사실**만 쓴다. */
  serverAnswerSeq: number;
  /** 세션 미준비 등 — 확정 전체를 막는다. */
  disabled: boolean;
  /** 카드 3초 무응답(`unacked`) — in-flight 중 true 가 되면 타임아웃 실패(⑧). 기본 false. */
  unacked?: boolean;
  /** 무장 불가 사유 — 문장이면 전송하지 않는다(⑨). 폼의 `armBlockOf` 가 원천이다. */
  armBlockOf?: (values: LimitChaserFormValues) => string | null;
}

/** 확정 1건 — 대기열 항목이자 in-flight 의 원형. */
interface Pending {
  field: LcFieldKey;
  value: unknown;
  kind: LcCommitKind;
  /** 확정 직전 폼 값 — 토글 되돌림 기준(⑩). */
  prevValue: unknown;
}

interface Inflight extends Pending {
  /** 보낼 때의 `serverAnswerSeq` — 이 값에서 바뀌면 답이 온 것이다. */
  answerSeqAtSend: number;
}

type FailureMap = Partial<Record<LcFieldKey, LcCommitFailure>>;

function isGateField(field: LcFieldKey): boolean {
  return (LC_GATE_FIELDS as readonly LcFieldKey[]).includes(field);
}

function withoutField(map: FailureMap, field: LcFieldKey): FailureMap {
  if (!(field in map)) return map;
  const next = { ...map };
  delete next[field];
  return next;
}

export function useLcFieldCommit(o: UseLcFieldCommitOptions): {
  commit: <K extends LcFieldKey>(field: K, value: LimitChaserFormValues[K], kind: LcCommitKind) => LcCommitOutcome;
  inflightField: LcFieldKey | null;
  queuedFields: readonly LcFieldKey[];
  failures: FailureMap;
  flashField: LcFieldKey | null;
  successSeq: number;
  lastSuccessField: LcFieldKey | null;
  clearFailure: (field: LcFieldKey) => void;
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

  /** 토글 낙관 표시 · 되돌림 — 값 필드에는 절대 부르지 않는다(④). */
  const showToggle = useCallback((field: LcFieldKey, value: unknown) => {
    optsRef.current.setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * 지금 보낸다 — 즉시 확정과 대기 꺼내기가 **같은 경로**다. 무장 판정(⑨)은 여기서만 한다.
   * `optimistic` = 이 토글을 이미 낙관 표시했는가(대기 진입 시) — 보내지 못하면 되돌린다.
   */
  const sendNow = useCallback(
    (p: Pending, optimistic: boolean): LcCommitOutcome => {
      const { server, formRef, buildCfg, send, onSent, serverAnswerSeq, armBlockOf } = optsRef.current;
      // ② 기준값 = 서버 동기값 + 바꾼 필드 1개.
      const base = server != null ? formFromServer(server, formRef.current) : formRef.current;
      const next: LimitChaserFormValues = { ...base, [p.field]: p.value };
      // ⑨-2 범위 밖 cfg 는 연결을 끊는다 — 끄는 방향도 예외 없이 막는다(CR-01).
      const outOfRange = lcRangeIssue(next);
      if (outOfRange !== null) {
        setFailure(p.field, 'invalid', outOfRange, p.value);
        if (optimistic) showToggle(p.field, p.prevValue);
        return 'blocked';
      }
      const turningOff = isGateField(p.field) && p.value === false;
      const blocked = turningOff ? null : (armBlockOf?.(next) ?? null);
      if (blocked !== null) {
        setFailure(p.field, 'armBlocked', blocked, p.value);
        if (optimistic) showToggle(p.field, p.prevValue);
        return 'blocked';
      }
      const cfg = buildCfg(next);
      if (!send({ t: 'lc.set', cfg })) {
        setFailure(p.field, 'disconnected', LC_COMMIT_TEXT.disconnected, p.value);
        if (optimistic) showToggle(p.field, p.prevValue);
        return 'disconnected';
      }
      onSent?.(cfg);
      writeFailures((prev) => withoutField(prev, p.field));
      setInflight({ ...p, answerSeqAtSend: serverAnswerSeq });
      // ⑩ 토글은 전송 뒤 낙관 표시 — 대기 중 에코가 폼을 덮었을 수 있어 꺼낼 때도 다시 건다.
      if (p.kind === 'toggle') showToggle(p.field, p.value);
      return 'sent';
    },
    [setFailure, setInflight, showToggle, writeFailures],
  );

  /** 대기열에서 한 건을 보낼 때까지 꺼낸다 — no-op 은 건너뛰고, 끊기면 남은 건도 끊김이다. */
  const drain = useCallback(() => {
    const { server } = optsRef.current;
    while (queueRef.current.length > 0) {
      const p = queueRef.current.shift()!;
      if (server != null && server[p.field] === p.value) {
        writeFailures((prev) => withoutField(prev, p.field));
        continue;
      }
      const out = sendNow(p, p.kind === 'toggle');
      if (out === 'sent') break;
      if (out === 'disconnected') {
        for (const rest of queueRef.current) {
          setFailure(rest.field, 'disconnected', LC_COMMIT_TEXT.disconnected, rest.value);
          if (rest.kind === 'toggle') showToggle(rest.field, rest.prevValue);
        }
        queueRef.current = [];
      }
    }
    syncQueue();
  }, [sendNow, setFailure, showToggle, syncQueue, writeFailures]);

  /** 대기 건 전부를 보내지 않고 실패로 표시한다 — 서버가 이미 그 값이면 실패라 말하지 않는다(⑦). */
  const failQueue = useCallback(
    (reason: 'rejected' | 'timeout') => {
      const { server } = optsRef.current;
      for (const q of queueRef.current) {
        // 서버가 이미 그 값이면 보낼 것이 없던 확정이다 — 실패라고 말하지 않는다.
        if (server != null && server[q.field] === q.value) continue;
        setFailure(q.field, reason, LC_COMMIT_TEXT.failed, q.value);
        if (q.kind === 'toggle') showToggle(q.field, q.prevValue);
      }
      queueRef.current = [];
      syncQueue();
    },
    [setFailure, showToggle, syncQueue],
  );

  /** in-flight 실패 — 되돌리고, 대기 건은 보내지 않고 전부 실패로 표시한다(⑦). */
  const failInflight = useCallback(
    (inf: Inflight, reason: 'rejected' | 'timeout') => {
      setInflight(null);
      popAfterSeqRef.current = null;
      setFailure(inf.field, reason, LC_COMMIT_TEXT.failed, inf.value);
      if (inf.kind === 'toggle') showToggle(inf.field, inf.prevValue);
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
    [failQueue, setFailure, setInflight, showToggle],
  );

  /** 고아 장벽을 푼다 — 답 신호가 왔다(결과가 서버 값에 드러났다). */
  const releaseOrphan = useCallback(() => {
    orphanRef.current = null;
    if (orphanTimer.current != null) window.clearTimeout(orphanTimer.current);
    orphanTimer.current = null;
  }, []);

  const commit = useCallback(
    <K extends LcFieldKey>(field: K, value: LimitChaserFormValues[K], kind: LcCommitKind): LcCommitOutcome => {
      const { server, formRef, setForm, disabled } = optsRef.current;
      if (disabled) return 'blocked';

      // 같은 필드가 대기 중 — 값만 바꾸고 자리는 그대로다(⑦).
      const queued = queueRef.current.find((q) => q.field === field);
      if (queued !== undefined) {
        queued.value = value;
        if (kind === 'toggle') showToggle(field, value);
        writeFailures((prev) => withoutField(prev, field));
        return 'queued';
      }

      const inflight = inflightRef.current;
      const orphan = orphanRef.current;
      // 서버 값과 같다 — 보낼 것이 없다(전송 0). 단 그 필드가 나가 있거나(in-flight · 결과 모름) 그 답 뒤에 판정한다.
      if (server != null && server[field] === value && inflight?.field !== field && orphan?.field !== field) {
        writeFailures((prev) => withoutField(prev, field));
        return 'noop';
      }
      // ⑥ 미등록 전략 — 게이트 4종 밖은 로컬 반영만 한다.
      if (server == null && !isGateField(field)) {
        setForm((prev) => ({ ...prev, [field]: value }));
        markSuccess(field);
        return 'local';
      }

      const pending: Pending = { field, value, kind, prevValue: formRef.current[field] };
      // ⑦ 한 건이 끝나지 않았다(in-flight · 성공 뒤 답 신호 대기 · 타임아웃 뒤 결과 모름) — 대기열에 선다.
      //   ★ 결과 모름 장벽은 **다른 필드**만 세운다(CR-02). 같은 필드의 새 확정은 그 필드의 최신 의도를
      //     싣고, 같은 소켓이라 늦게 닿는 앞 건보다 뒤에 처리되므로 앞 건을 대체할 뿐 되돌리지 않는다 —
      //     타임아웃 뒤 「다시 시도」(같은 스위치 다시 누르기)가 곧바로 나가는 이유다.
      const orphanBlocks = orphan !== null && orphan.field !== field;
      if (inflight !== null || popAfterSeqRef.current !== null || orphanBlocks) {
        queueRef.current.push(pending);
        if (kind === 'toggle') showToggle(field, value);
        writeFailures((prev) => withoutField(prev, field));
        syncQueue();
        return 'queued';
      }
      const out = sendNow(pending, false);
      // 같은 필드의 새 확정이 결과 모름 건을 대체했다 — 이제 직렬화는 이 in-flight 가 맡는다.
      if (out === 'sent' && orphan !== null) releaseOrphan();
      return out;
    },
    [markSuccess, releaseOrphan, sendNow, showToggle, syncQueue, writeFailures],
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
      const matches =
        server != null &&
        (server[inf.field] === inf.value ||
          // ⑧ 특례 — 서버가 금액을 모른다(0). 답이 온 것만으로 성공이다.
          (inf.field === 'buyOrderAmount' && server.buyOrderAmount === 0 && answered));
      if (matches) {
        setInflight(null);
        markSuccess(inf.field);
        if (queueRef.current.length > 0) {
          // 서버 값이 이 렌더에 바뀌었다 = 카드의 답 신호 증가가 한 렌더 뒤에 온다 → 그때 꺼낸다.
          // 답 신호가 먼저 와 있었다(금액 특례) = 더 올 증가가 없다 → 지금 꺼낸다.
          if (serverChanged) popAfterSeqRef.current = seq;
          else drainNow = true;
        }
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
  };
}
