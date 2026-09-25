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
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

import { formFromServer, type LimitChaserFormValues } from '@/lib/limit-chaser';

export type LcFieldKey = keyof LimitChaserFormValues;
/** `value` = 숫자 값(낙관 반영 없음) · `toggle` = 스위치·체크·감시대상(전송 뒤 낙관 표시). */
export type LcCommitKind = 'value' | 'toggle';
export type LcFailReason = 'rejected' | 'timeout' | 'disconnected' | 'armBlocked';
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
}

interface Inflight {
  field: LcFieldKey;
  value: unknown;
  kind: LcCommitKind;
  /** 보낼 때의 `serverAnswerSeq` — 이 값에서 바뀌면 답이 온 것이다. */
  answerSeqAtSend: number;
}

type FailureMap = Partial<Record<LcFieldKey, LcCommitFailure>>;

const NO_FIELDS: readonly LcFieldKey[] = [];

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

  const failuresRef = useRef<FailureMap>({});
  const [failures, setFailuresState] = useState<FailureMap>({});
  const writeFailures = useCallback((update: (prev: FailureMap) => FailureMap) => {
    const next = update(failuresRef.current);
    if (next === failuresRef.current) return;
    failuresRef.current = next;
    setFailuresState(next);
  }, []);

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

  const commit = useCallback(
    <K extends LcFieldKey>(field: K, value: LimitChaserFormValues[K], kind: LcCommitKind): LcCommitOutcome => {
      const { server, formRef, setForm, buildCfg, send, onSent, serverAnswerSeq, disabled } =
        optsRef.current;
      if (disabled) return 'blocked';
      // 같은 필드가 아직 나가 있다 — 행은 반영 중에 다시 열리지 않으므로 여기 닿는 경로가 없다.
      if (inflightRef.current?.field === field) return 'blocked';
      // 서버 값과 같다 — 보낼 것이 없다(전송 0). 남아 있던 실패 표시도 거둔다.
      if (server != null && server[field] === value) {
        writeFailures((prev) => withoutField(prev, field));
        return 'noop';
      }
      // ⑥ 미등록 전략 — 게이트 4종 밖은 로컬 반영만 한다.
      if (server == null && !isGateField(field)) {
        setForm((prev) => ({ ...prev, [field]: value }));
        markSuccess(field);
        return 'local';
      }
      // ② 기준값 = 서버 동기값 + 바꾼 필드 1개.
      const base = server != null ? formFromServer(server, formRef.current) : formRef.current;
      const cfg = buildCfg({ ...base, [field]: value });
      if (!send({ t: 'lc.set', cfg })) {
        writeFailures((prev) => ({
          ...prev,
          [field]: { reason: 'disconnected', text: LC_COMMIT_TEXT.disconnected, value },
        }));
        return 'disconnected';
      }
      onSent?.(cfg);
      writeFailures((prev) => withoutField(prev, field));
      setInflight({ field, value, kind, answerSeqAtSend: serverAnswerSeq });
      return 'sent';
    },
    [markSuccess, setInflight, writeFailures],
  );

  const clearFailure = useCallback(
    (field: LcFieldKey) => writeFailures((prev) => withoutField(prev, field)),
    [writeFailures],
  );

  /*
    해소 — 서버 값이나 답 신호가 바뀐 렌더에서만 판정한다.
    ③ 성공은 값 비교로만 · 답만 오면 거부 · 늦은 에코는 실패를 성공으로.
  */
  const prevServerRef = useRef<RelayLimitChaser | null>(o.server);
  useEffect(() => {
    const server = o.server;
    const serverChanged = prevServerRef.current !== server;
    prevServerRef.current = server;

    const inf = inflightRef.current;
    if (inf !== null) {
      if (server != null && server[inf.field] === inf.value) {
        setInflight(null);
        markSuccess(inf.field);
      } else if (o.serverAnswerSeq !== inf.answerSeqAtSend) {
        setInflight(null);
        writeFailures((prev) => ({
          ...prev,
          [inf.field]: { reason: 'rejected', text: LC_COMMIT_TEXT.failed, value: inf.value },
        }));
      }
    }

    // 늦은 에코 — 보냈다가 실패로 판정한 값이 서버에 섰다. 보내지 않은 실패(끊김)는 대상이 아니다.
    if (serverChanged && server != null) {
      for (const [f, fail] of Object.entries(failuresRef.current) as [LcFieldKey, LcCommitFailure][]) {
        if (fail.reason !== 'rejected' && fail.reason !== 'timeout') continue;
        if (server[f] === fail.value) markSuccess(f);
      }
    }
  }, [o.server, o.serverAnswerSeq, markSuccess, setInflight, writeFailures]);

  useEffect(
    () => () => {
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  return {
    commit,
    inflightField,
    queuedFields: NO_FIELDS,
    failures,
    flashField,
    successSeq: success.seq,
    lastSuccessField: success.field,
    clearFailure,
  };
}
