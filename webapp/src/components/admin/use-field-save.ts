"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminCommandResponse, AdminServerResult } from "@gh-radar/shared";

import { ApiClientError } from "@/lib/api";

/**
 * useFieldSave — Admin 편집 시트의 「필드 1개 = 즉시 저장 1건」 규율 (Phase 29 D-15 · Phase 27 D-13 동형).
 *
 * `limit-chaser-defaults` 의 행 단위 즉시 저장을 필드 1개짜리 훅으로 옮겼다. 시트의 필드(역할 · 계좌 1개의 등록 서버
 * 집합 · 계좌 추가 · 비밀번호 · 다시 반영 …)마다 하나씩 쓴다.
 *
 * - **한 번에 1건 비행.** 비행 중 같은 필드를 다시 조작하면 보내지 않고 **마지막 값 1개만** 대기열에 둔다(값만 교체).
 *   앞 건 응답이 오면 대기 값을 보낸다 — 사이 값(중간에 눌렀다 바꾼 값)은 서버에 가지 않는다.
 * - **조작은 막지 않는다.** 비행 중에도 컨트롤은 살아 있다(대기열이 받는다) — `state` 는 표시용이다.
 * - **성공** = 마지막 건까지 끝났을 때 `flash`(0.7초 — `ADMIN_FIELD_FLASH_MS`) → `idle` · `onSuccess` 1회.
 *   응답의 서버별 결과 배열(`results`)은 보관해 칩을 그리게 한다(서버 일부 실패도 HTTP 성공이다 — 의도는 저장됐다, D-05).
 * - **실패**(HTTP 오류 · 409 · 502 …) = `error` + 한 줄 문구. 대기 값은 보내지 않고 접는다(precedent: 「대기 건은 보내지 않고
 *   실패로 접는다」) — 표시 값은 서버 값으로 돌아간다(`value` = undefined).
 * - **토스트 없음.** 결과는 그 자리(칩 · 한 줄)에만 보인다.
 * - 언마운트 뒤 도착한 응답은 버린다(상태 갱신 · 콜백 없음).
 *
 * `value` 는 화면이 그릴 「의도 값」 이다 — 비행 · 대기 중이면 마지막으로 누른 값, 성공 뒤에는 마지막으로 저장된 값,
 * 실패 · 아직 조작 전이면 `undefined`(부모가 서버 값을 그린다). 비밀번호처럼 값을 들고 있으면 안 되는 필드는
 * `retainValue: false` 로 끈다(D-06 — 상태에 남기지 않는다).
 */

/** 성공 플래시 시간 — `USER_SETTINGS_FLASH_MS`(Phase 27 D-12 「~0.7초」)와 같은 값. */
export const ADMIN_FIELD_FLASH_MS = 700;

export type FieldSaveState = "idle" | "saving" | "flash" | "error";

export interface UseFieldSaveOptions<T> {
  /** 마지막 건까지 성공한 뒤 1회 — 목록 재조회 등. */
  onSuccess?: (value: T, response: AdminCommandResponse | void) => void;
  /** 오류 → 한 줄 문구. 기본: 「저장하지 못했어요 · <서버 message>」. */
  describeError?: (err: unknown) => string;
  /** 값을 상태에 남길지(기본 true). 비밀번호는 false. */
  retainValue?: boolean;
}

export interface FieldSave<T> {
  state: FieldSaveState;
  /** 조작 1회 — 비행 중이면 마지막 값만 대기열에. */
  run: (value: T) => void;
  /** 마지막 응답의 서버별 결과(응답에 없으면 null). */
  results: AdminServerResult[] | null;
  /** 실패 한 줄(그 밖은 null). */
  error: string | null;
  /** 실패의 서버 오류 코드(`SELF_LOCKOUT` · `LAST_ACCOUNT` …) — 없으면 null. */
  errorCode: string | null;
  /** 화면이 그릴 의도 값(위 주석). */
  value: T | undefined;
}

export function defaultSaveErrorText(err: unknown): string {
  const detail = err instanceof ApiClientError ? err.message : null;
  return detail ? `저장하지 못했어요 · ${detail}` : "저장하지 못했어요";
}

const NONE = Symbol("none");

export function useFieldSave<T>(
  save: (value: T) => Promise<AdminCommandResponse | void>,
  options: UseFieldSaveOptions<T> = {},
): FieldSave<T> {
  const retain = options.retainValue ?? true;
  const [state, setState] = useState<FieldSaveState>("idle");
  const [results, setResults] = useState<AdminServerResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [value, setValue] = useState<T | undefined>(undefined);

  // 최신 save · 옵션 — 대기 건을 보낼 때도 마지막 렌더의 함수를 쓴다.
  const saveRef = useRef(save);
  const optsRef = useRef(options);
  useEffect(() => {
    saveRef.current = save;
    optsRef.current = options;
  });

  const inflight = useRef(false);
  const queued = useRef<T | typeof NONE>(NONE);
  const mounted = useRef(true);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    };
  }, []);

  const dispatch = useCallback(
    (v: T) => {
      inflight.current = true;
      if (flashTimer.current !== null) {
        clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
      setState("saving");
      setError(null);
      setErrorCode(null);
      saveRef.current(v).then(
        (res) => {
          if (!mounted.current) return;
          const next = queued.current;
          if (next !== NONE) {
            // 마지막 값이 기다린다 — 그것을 보낸다. 플래시 · 콜백은 마지막 건 뒤 1회.
            queued.current = NONE;
            dispatch(next);
            return;
          }
          inflight.current = false;
          setResults(res && Array.isArray(res.results) ? res.results : null);
          setState("flash");
          flashTimer.current = setTimeout(() => {
            flashTimer.current = null;
            if (mounted.current) setState((s) => (s === "flash" ? "idle" : s));
          }, ADMIN_FIELD_FLASH_MS);
          optsRef.current.onSuccess?.(v, res);
        },
        (err: unknown) => {
          if (!mounted.current) return;
          inflight.current = false;
          queued.current = NONE;
          setValue(undefined);
          setState("error");
          setErrorCode(err instanceof ApiClientError ? err.code : null);
          setError((optsRef.current.describeError ?? defaultSaveErrorText)(err));
        },
      );
    },
    [],
  );

  const run = useCallback(
    (v: T) => {
      if (retain) setValue(v);
      if (inflight.current) {
        queued.current = v;
        return;
      }
      dispatch(v);
    },
    [dispatch, retain],
  );

  return { state, run, results, error, errorCode, value };
}
