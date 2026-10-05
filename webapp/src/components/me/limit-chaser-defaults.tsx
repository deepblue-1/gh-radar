"use client";

/**
 * LimitChaserDefaultsSection — `/me` 「상따 기본설정」 섹션 (Phase 27 D-10 · D-12 · D-13 · 인박스 Q1/Q2 ·
 * 채택 목업 `reference/mockup-user-settings.html` 변형 C).
 *
 * ① 자리(D-10): 계정 카드 → 상태줄 → **이 섹션** → 전략 현황. DMA 게이트 화면에는 그리지 않는다(84 가 올 수 없다).
 *    상따 화면에는 진입점을 두지 않는다(⚙ 진입점은 Deferred).
 *
 * ② 값의 원천은 84 캐시(`useRelayContext().userSettings`) 하나다 — 3상태(77 `queuedWindow` 규율):
 *    - `undefined` = 84 를 아직 못 받았다 → 「불러오는 중」 · 행 흐림 · 편집 불가. 기본값을 지어내지 않는다.
 *    - `present: true`  = 서버 저장값 → 「서버 저장값」(ok).
 *    - `present: false` = 저장값 없음 → 「서버 저장값 없음 · 내장 기본값」(warn). 84 가 실은 내장 기본값을 그대로
 *      보이고, **42 를 자동으로 보내지 않는다**(인박스 Q2 — 이전 없음). 사용자가 행을 확정할 때만 42.
 *
 * ③ 행 문법은 상따 카드와 같다 — 「라벨 ─ 값 ›」 44px `SettingRow` · 방법 기본값은 27-04 `ChoiceRow`.
 *    새 입력 컴포넌트를 만들지 않는다. 카드 행의 폭 규칙(쉐브런 · 좌우 패딩)이 `@container/lc` 를 재므로 행 목록에
 *    같은 컨테이너 선언을 단다(`LC_CONTAINER_CLASS` — 문자열 재기재 금지).
 *
 * ④ 문구는 목업 원문 그대로다(D-13) — 칩 3 · 안내 3 은 `USER_SETTINGS_STATUS_TEXT` 한 곳.
 *
 * ⑤ 저장 = 행 확정마다 즉시 42(D-12 변형 C · 저장 버튼 없음 · 낙관 반영 없음) — `useUserSettingsSave`.
 *    - 조립 = **84 캐시 11값 + 바뀐 1칸**(화면 로컬 값 금지 · T-20-03 동형 — 다른 탭이 바꾼 칸을 덮지 않는다).
 *    - 한 번에 1건 비행. 비행 중 다른 행 확정은 행당 1건 대기열(같은 행 재확정은 값만 교체)에 서고, 앞 건의 84 를
 *      받은 **뒤 새 캐시로 다시 조립**해 보낸다(RESEARCH Pitfall 8 — 낡은 캐시로 앞 칸을 되돌리지 않는다).
 *    - 성공 = 보낸 칸 값이 실린 84 → 그 행 초록 플래시 ~0.7초. 다른 탭의 42 로 값이 바뀐 행도 플래시한다(목업).
 *    - 3초 안에 84 · 거부가 없으면 그 행 실패 · 재전송 없음 · 대기 건은 보내지 않고 실패로 접는다.
 *    - 거부 = 비행 중 도착한 54 `lv ERROR · src "SetUserSettings"` — 원문을 섹션 아래 빨간 한 줄로, 비행 중인 행에
 *      귀속한다. 본문을 파싱해 어느 칸인지 판정하지 않는다. 비행 밖(다른 탭) 거부는 줄을 세우지 않는다.
 *    - 범위는 시트 · 인라인에서 미리 막는다 — shared `USER_SETTINGS_RANGES`(서버 42 범위 정본) · 문구 「{min}~{max}{단위}
 *      사이여야 해요」(목업). 범위 밖 42 는 relay zod 가 소켓을 닫는다(4400).
 *    - 저장 이력(로그)은 남기지 않는다(Deferred).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_SELL_METHOD_LABELS,
  AUTO_SELL_METHOD_ORDER,
  USER_SETTINGS_RANGES,
  type RelayInbound,
  type RelayUserSettingsMsg,
  type RelayUserSettingsValues,
} from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { ACK_TIMEOUT_MS, LC_CONTAINER_CLASS } from "@/components/trading/card/strategy-card";
import { InlineValueEditor } from "@/components/trading/lc/inline-value-editor";
import { NumberPadSheet } from "@/components/trading/lc/number-pad-sheet";
import { ChoiceRow, SettingRow } from "@/components/trading/lc/setting-group";
import { LC_COMMIT_TEXT } from "@/components/trading/lc/use-lc-field-commit";
import type { PadUnit } from "@/lib/numpad";
import { useRelayContext } from "@/lib/relay-provider";
import type { RelayServerMessageEntry } from "@/lib/use-relay-socket";
import { useEditMode } from "@/lib/use-edit-mode";
import { cn } from "@/lib/utils";

export type UserSettingsKey = keyof RelayUserSettingsValues;

export type UserSettingsGroup = "매수 금액" | "후매수" | "매도" | "자동매도";

export interface UserSettingsRowSpec {
  key: UserSettingsKey;
  label: string;
  /** 숫자 행 단위 — 방법 기본값(3택)은 `null`. */
  unit: PadUnit | null;
  group: UserSettingsGroup;
  /** 행 식별자(`data-lc-field`) — `me-lc-` + 키 kebab. */
  id: string;
}

/** 묶음 순서(D-13 · 목업 `GROUPS`). */
export const USER_SETTINGS_GROUPS: readonly UserSettingsGroup[] = ["매수 금액", "후매수", "매도", "자동매도"];

/**
 * 11행 표(목업 `F` · `GROUPS` 그대로 · 금액 3칸은 만원 — 인박스 Q1). 순서 = 화면 순서. 범위는 여기 두지 않는다 —
 * shared `USER_SETTINGS_RANGES`(서버 42 범위 정본) 하나를 읽는다.
 */
export const USER_SETTINGS_ROWS: readonly UserSettingsRowSpec[] = [
  { key: "preBuyAmount", label: "선매수 금액", unit: "만원", group: "매수 금액", id: "me-lc-pre-buy-amount" },
  { key: "addBuyAmount", label: "추가매수 금액", unit: "만원", group: "매수 금액", id: "me-lc-add-buy-amount" },
  { key: "postBuyAmount", label: "후매수 금액", unit: "만원", group: "매수 금액", id: "me-lc-post-buy-amount" },
  { key: "postBuyMaxCount", label: "후매수 최대", unit: "회", group: "후매수", id: "me-lc-post-buy-max-count" },
  { key: "postBuyFloorQty", label: "후매수 하한잔량", unit: "주", group: "후매수", id: "me-lc-post-buy-floor-qty" },
  { key: "postBuyReboundPct", label: "후매수 반등", unit: "%", group: "후매수", id: "me-lc-post-buy-rebound-pct" },
  { key: "sellQtyTrackRatio", label: "매도 잔량추적", unit: "%", group: "매도", id: "me-lc-sell-qty-track-ratio" },
  { key: "autoSellPeriodSec", label: "매도 주기", unit: "초", group: "자동매도", id: "me-lc-auto-sell-period-sec" },
  {
    key: "auctionSellRatioPct",
    label: "동시호가 매도비율",
    unit: "%",
    group: "자동매도",
    id: "me-lc-auction-sell-ratio-pct",
  },
  {
    key: "autoSellRatioDefaultPct",
    label: "비율 기본값",
    unit: "%",
    group: "자동매도",
    id: "me-lc-auto-sell-ratio-default-pct",
  },
  {
    key: "autoSellMethodDefault",
    label: "방법 기본값",
    unit: null,
    group: "자동매도",
    id: "me-lc-auto-sell-method-default",
  },
];

export type UserSettingsStatus = "loading" | "present" | "absent";

/** 칩 · 안내 원문(D-13 · 목업 `section()` 그대로). */
export const USER_SETTINGS_STATUS_TEXT: Readonly<Record<UserSettingsStatus, { chip: string; note: string }>> = {
  loading: { chip: "불러오는 중", note: "DMA 세션이 준비되면 서버 설정(84)을 불러와요" },
  present: {
    chip: "서버 저장값",
    note: "새 전략 폼의 기본값이에요 · 매도 주기 · 동시호가 비율은 서버가 다음 주기부터 바로 써요",
  },
  absent: {
    chip: "서버 저장값 없음 · 내장 기본값",
    note: "아직 저장한 적이 없어요 · 저장하면 이 사용자(DMA 계정)의 모든 화면에 적용돼요",
  },
};

/** 칩 톤 — 목업 `.chip.ok/.warn` 결을 기존 LED 토큰으로(새 색 토큰 0). */
const CHIP_TONE_CLASS: Readonly<Record<UserSettingsStatus, string>> = {
  loading: "bg-[var(--muted)] text-[var(--muted-fg)]",
  present: "bg-[color-mix(in_srgb,var(--led-armed)_16%,transparent)] text-[var(--led-armed)]",
  absent: "bg-[color-mix(in_srgb,var(--led-latent)_18%,transparent)] text-[var(--led-latent)]",
};
const CHIP_TONE_ATTR: Readonly<Record<UserSettingsStatus, string>> = {
  loading: "loading",
  present: "ok",
  absent: "warn",
};

const METHOD_OPTIONS = AUTO_SELL_METHOD_ORDER.map((value) => ({
  value,
  label: AUTO_SELL_METHOD_LABELS[value] ?? String(value),
}));

const NUM = new Intl.NumberFormat("ko-KR");

/** 성공 플래시 시간(D-12 「~0.7초」 · 목업 `setTimeout(…, 700)`). */
export const USER_SETTINGS_FLASH_MS = 700;

/** 저장 실패 문구 — 끊김은 상따 카드와 같은 원문(`LC_COMMIT_TEXT`). */
export const USER_SETTINGS_SAVE_TEXT = {
  timeout: "반영되지 않았어요",
  disconnected: LC_COMMIT_TEXT.disconnected,
} as const;

/** 시트 · 인라인 범위 문구(목업 `${lo}~${fmt(hi)}${u} 사이여야 해요` · 천단위 쉼표). */
export function rangeSentence(min: number, max: number, unit: string): string {
  return `${NUM.format(min)}~${NUM.format(max)}${unit} 사이여야 해요`;
}

/** 시트 설명 줄 — 범위 표기(fbs 주석 그대로 · 「1~60초」). */
export function rangeLabel(key: UserSettingsKey, unit: string): string {
  const r = USER_SETTINGS_RANGES[key];
  return `${NUM.format(r.min)}~${NUM.format(r.max)}${unit}`;
}

/** 범위 밖이면 문장 · 안이면 null. 범위 정본은 shared `USER_SETTINGS_RANGES` 하나다. */
export function userSettingsRangeIssue(key: UserSettingsKey, value: number, unit: string): string | null {
  const r = USER_SETTINGS_RANGES[key];
  return value < r.min || value > r.max ? rangeSentence(r.min, r.max, unit) : null;
}

/** 84 에서 42 본문 11값만 뽑는다(`t` · `present` 제외 — `present` 는 84 전용). */
export function userSettingsValuesOf(s: RelayUserSettingsMsg): RelayUserSettingsValues {
  return {
    preBuyAmount: s.preBuyAmount,
    addBuyAmount: s.addBuyAmount,
    postBuyAmount: s.postBuyAmount,
    postBuyMaxCount: s.postBuyMaxCount,
    postBuyFloorQty: s.postBuyFloorQty,
    postBuyReboundPct: s.postBuyReboundPct,
    sellQtyTrackRatio: s.sellQtyTrackRatio,
    autoSellPeriodSec: s.autoSellPeriodSec,
    auctionSellRatioPct: s.auctionSellRatioPct,
    autoSellRatioDefaultPct: s.autoSellRatioDefaultPct,
    autoSellMethodDefault: s.autoSellMethodDefault,
  };
}

/** 42 거부 판정 — 동등 비교만(본문은 읽지 않는다). 비행 중 창 안에서만 묻는다. */
export function isSetUserSettingsRejection(msg: { lv: string; src: string }): boolean {
  return msg.lv === "ERROR" && msg.src === "SetUserSettings";
}

const EMPTY_KEYS: ReadonlySet<UserSettingsKey> = new Set();

/**
 * 실패한 행 1건 — 말풍선 문구와 **시도한 값**(27-REVIEW WR-05). 늦게 온 84 가 그 값을 실으면 서버 저장은
 * 성공한 것이라 실패를 거둔다(상따 카드 「③ 늦은 에코」와 같은 대응).
 */
type UserSettingsFailure = { text: string; value: number };
type UserSettingsFailures = Partial<Record<UserSettingsKey, UserSettingsFailure>>;

type SaveOutcome = "noop" | "sent" | "disconnected";

interface UserSettingsSave {
  /** 행 확정 1건 — 84 미수신이면 무시 · 비행 중이면 대기열 · 아니면 즉시 42. */
  commit: (key: UserSettingsKey, value: number) => void;
  inflightKey: UserSettingsKey | null;
  queuedKeys: ReadonlySet<UserSettingsKey>;
  /** 실패한 행 → 말풍선 문구(빈 문자열 = 링만 — 거부 원문은 섹션 아래 한 줄이 말한다). */
  failures: Partial<Record<UserSettingsKey, string>>;
  flashKeys: ReadonlySet<UserSettingsKey>;
  rejectText: string | null;
}

/**
 * 42 저장 기계(D-12 · ⑤) — 섹션 로컬 상태. 상따 카드 41/lc.arm in-flight 구조(`strategy-card.tsx`)의 복제다:
 * 54 스트림 이펙트가 동기로 읽는 값은 ref 가 정본이고 렌더용 state 는 그 거울이다.
 */
function useUserSettingsSave(
  userSettings: RelayUserSettingsMsg | undefined,
  send: (msg: RelayInbound) => boolean,
  messages: readonly RelayServerMessageEntry[],
): UserSettingsSave {
  const inflightRef = useRef<{ key: UserSettingsKey; value: number } | null>(null);
  const queueRef = useRef(new Map<UserSettingsKey, number>());
  const ackTimer = useRef<number | null>(null);
  const flashTimers = useRef(new Map<UserSettingsKey, number>());
  const [inflightKey, setInflightKey] = useState<UserSettingsKey | null>(null);
  const [queuedKeys, setQueuedKeys] = useState<ReadonlySet<UserSettingsKey>>(EMPTY_KEYS);
  const [failureEntries, setFailures] = useState<UserSettingsFailures>({});
  /** 렌더 계약은 문구만 — 시도 값은 84 늦은 성공 판정 전용이다. */
  const failures = useMemo(() => {
    const out: Partial<Record<UserSettingsKey, string>> = {};
    for (const [k, f] of Object.entries(failureEntries) as [UserSettingsKey, UserSettingsFailure][]) out[k] = f.text;
    return out;
  }, [failureEntries]);
  const [flashKeys, setFlashKeys] = useState<ReadonlySet<UserSettingsKey>>(EMPTY_KEYS);
  const [rejectText, setRejectText] = useState<string | null>(null);

  const syncQueue = useCallback(() => {
    setQueuedKeys(queueRef.current.size === 0 ? EMPTY_KEYS : new Set(queueRef.current.keys()));
  }, []);

  const flash = useCallback((key: UserSettingsKey) => {
    const prev = flashTimers.current.get(key);
    if (prev !== undefined) window.clearTimeout(prev);
    setFlashKeys((cur) => new Set(cur).add(key));
    flashTimers.current.set(
      key,
      window.setTimeout(() => {
        flashTimers.current.delete(key);
        setFlashKeys((cur) => {
          const next = new Set(cur);
          next.delete(key);
          return next.size === 0 ? EMPTY_KEYS : next;
        });
      }, USER_SETTINGS_FLASH_MS),
    );
  }, []);

  /** 비행을 닫는다 — ref · state · 3초 타이머를 함께. 결과 표시는 호출자가 정한다. */
  const endInflight = useCallback(() => {
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
    inflightRef.current = null;
    setInflightKey(null);
  }, []);

  /** 대기 건을 보내지 않고 실패로 접는다(재전송 없음). */
  const failQueue = useCallback(
    (text: string) => {
      if (queueRef.current.size === 0) return;
      const entries = [...queueRef.current.entries()];
      queueRef.current.clear();
      syncQueue();
      setFailures((f) => {
        const next = { ...f };
        for (const [k, value] of entries) next[k] = { text, value };
        return next;
      });
    },
    [syncQueue],
  );

  /** 42 한 건 — `base`(84 캐시) + 바뀐 1칸. 서버 값과 같으면 보내지 않는다. */
  const dispatchOne = useCallback(
    (key: UserSettingsKey, value: number, base: RelayUserSettingsMsg): SaveOutcome => {
      if (base[key] === value) return "noop";
      const s: RelayUserSettingsValues = { ...userSettingsValuesOf(base), [key]: value };
      if (!send({ t: "user.settings.set", s })) {
        // 소켓이 받지 않았다 — 비행을 세우지 않는다(답이 올 수 없다) · 재전송 없음.
        setFailures((f) => ({ ...f, [key]: { text: USER_SETTINGS_SAVE_TEXT.disconnected, value } }));
        failQueue(USER_SETTINGS_SAVE_TEXT.disconnected);
        return "disconnected";
      }
      setRejectText(null);
      inflightRef.current = { key, value };
      setInflightKey(key);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      // ★ 표시만 한다 — 타이머가 끝나도 아무것도 다시 보내지 않는다(T-16-10).
      ackTimer.current = window.setTimeout(() => {
        ackTimer.current = null;
        if (inflightRef.current?.key !== key) return;
        inflightRef.current = null;
        setInflightKey(null);
        setFailures((f) => ({ ...f, [key]: { text: USER_SETTINGS_SAVE_TEXT.timeout, value } }));
        failQueue(USER_SETTINGS_SAVE_TEXT.timeout);
      }, ACK_TIMEOUT_MS);
      return "sent";
    },
    [send, failQueue],
  );

  /** 대기열 앞 건부터 **새 캐시**로 다시 조립해 보낸다. 이미 그 값(no-op)이면 성공으로 접고 다음 건. */
  const drain = useCallback(
    (base: RelayUserSettingsMsg) => {
      while (queueRef.current.size > 0) {
        const [key, value] = queueRef.current.entries().next().value as [UserSettingsKey, number];
        queueRef.current.delete(key);
        const outcome = dispatchOne(key, value, base);
        if (outcome === "sent" || outcome === "disconnected") break;
        flash(key);
      }
      syncQueue();
    },
    [dispatchOne, flash, syncQueue],
  );

  const commit = useCallback(
    (key: UserSettingsKey, value: number) => {
      if (userSettings === undefined) return;
      setFailures((f) => {
        if (!(key in f)) return f;
        const next = { ...f };
        delete next[key];
        return next;
      });
      if (inflightRef.current !== null) {
        queueRef.current.set(key, value);
        syncQueue();
        return;
      }
      dispatchOne(key, value, userSettings);
    },
    [userSettings, dispatchOne, syncQueue],
  );

  /* ── 84 — 성공 판정 · 바뀐 행 플래시 · 대기열 ─────────────────────────── */
  const prevSettingsRef = useRef(userSettings);
  useEffect(() => {
    const prev = prevSettingsRef.current;
    prevSettingsRef.current = userSettings;
    if (userSettings === undefined) {
      // reset(로그아웃 · 비활성화) — 답이 올 수 없다. 표시 없이 접는다.
      endInflight();
      queueRef.current.clear();
      syncQueue();
      return;
    }
    if (prev === undefined || prev === userSettings) return;
    for (const row of USER_SETTINGS_ROWS) {
      if (prev[row.key] !== userSettings[row.key]) flash(row.key);
    }
    /*
      ★ 늦은 성공(27-REVIEW WR-05) — 3초 무응답 · 거부로 실패를 박은 행도 84 가 **시도한 그 값**을 실으면 서버에
        저장된 것이다. 실패를 거둔다 — 안 거두면 새 값과 「반영되지 않았어요」가 동시에 선다. 재전송은 없다.
    */
    setFailures((f) => {
      let next: UserSettingsFailures | null = null;
      for (const [k, entry] of Object.entries(f) as [UserSettingsKey, UserSettingsFailure][]) {
        if (userSettings[k] !== entry.value) continue;
        next ??= { ...f };
        delete next[k];
      }
      return next ?? f;
    });
    const inflight = inflightRef.current;
    if (inflight !== null && userSettings[inflight.key] === inflight.value) {
      flash(inflight.key);
      endInflight();
      drain(userSettings);
    }
  }, [userSettings, endInflight, flash, drain, syncQueue]);

  /* ── 54 — 비행 중 SetUserSettings 거부만 ────────────────────────────── */
  // 마운트 시점의 목록은 이미 본 것으로 둔다(그 전의 거부가 다음 비행에 붙지 않게).
  const lastMsgRef = useRef<RelayServerMessageEntry | null>(messages[0] ?? null);
  useEffect(() => {
    if (messages.length === 0) return;
    const seen = lastMsgRef.current;
    const idx = seen === null ? -1 : messages.indexOf(seen);
    // 못 찾으면(상한 20 을 넘겨 밀려났다) 지금 목록 전체가 새것이다.
    const fresh = idx < 0 ? messages : messages.slice(0, idx);
    lastMsgRef.current = messages[0] ?? null;
    for (const msg of [...fresh].reverse()) {
      const inflight = inflightRef.current;
      if (inflight === null || !isSetUserSettingsRejection(msg)) continue;
      // 원문 그대로 · 비행 중인 행에 귀속 · 화면 값은 84 그대로(낙관 반영이 없어 되돌릴 값이 없다).
      setRejectText(msg.m);
      setFailures((f) => ({ ...f, [inflight.key]: { text: "", value: inflight.value } }));
      endInflight();
      failQueue(USER_SETTINGS_SAVE_TEXT.timeout);
    }
  }, [messages, endInflight, failQueue]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  return { commit, inflightKey, queuedKeys, failures, flashKeys, rejectText };
}

/** 플래시 — 값 글자(값 행)와 선택된 세그먼트를 성공 토큰(`--led-armed`)으로. 색만 바뀐다(움직임 없음). */
const FLASH_CLASS =
  "[&_[data-slot=lc-row-value]]:text-[var(--led-armed)]! [&_[role=radio][aria-checked=true]]:text-[var(--led-armed)]!";

export function userSettingsStatusOf(s: RelayUserSettingsMsg | undefined): UserSettingsStatus {
  if (s === undefined) return "loading";
  return s.present ? "present" : "absent";
}

export function LimitChaserDefaultsSection() {
  const { userSettings, send, messages } = useRelayContext();
  const status = userSettingsStatusOf(userSettings);
  const loading = userSettings === undefined;
  const text = USER_SETTINGS_STATUS_TEXT[status];
  const save = useUserSettingsSave(userSettings, send, messages);

  const editMode = useEditMode();
  /** 인라인 편집 중인 행(마우스 기기). */
  const [editingKey, setEditingKey] = useState<UserSettingsKey | null>(null);
  /** 키패드 시트를 연 행(터치 기기). */
  const [sheetKey, setSheetKey] = useState<UserSettingsKey | null>(null);
  const sheetReturnRef = useRef<HTMLElement | null>(null);
  const sheetRow = sheetKey === null ? null : (USER_SETTINGS_ROWS.find((r) => r.key === sheetKey) ?? null);
  const sheetUnit: PadUnit = sheetRow?.unit ?? "%";

  const busyOf = (key: UserSettingsKey) => save.inflightKey === key || save.queuedKeys.has(key);
  const activate = (key: UserSettingsKey, el: HTMLElement) => {
    if (loading || busyOf(key)) return;
    if (editMode === "sheet") {
      sheetReturnRef.current = el;
      setSheetKey(key);
    } else {
      setEditingKey(key);
    }
  };
  const numericRows = USER_SETTINGS_ROWS.filter((r) => r.unit !== null);
  const navigate = (key: UserSettingsKey, dir: "next" | "prev") => {
    const i = numericRows.findIndex((r) => r.key === key);
    const to = numericRows[dir === "next" ? i + 1 : i - 1];
    setEditingKey(to === undefined || busyOf(to.key) ? null : to.key);
  };

  return (
    <section
      data-slot="me-lc-defaults"
      aria-labelledby="me-lc-defaults-title"
      className={cn(CARD, "flex min-w-0 flex-col px-2.5 pt-3 pb-1.5")}
    >
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-2 gap-y-1 px-1.5 pb-1.5">
        <h2 id="me-lc-defaults-title" className="text-[15px] font-semibold text-[var(--fg)]">
          상따 기본설정
        </h2>
        <span
          data-slot="me-lc-defaults-chip"
          data-tone={CHIP_TONE_ATTR[status]}
          className={cn(
            "rounded-full px-[7px] py-[2px] text-[11px] font-semibold whitespace-nowrap",
            CHIP_TONE_CLASS[status],
          )}
        >
          {text.chip}
        </span>
      </div>
      <p
        data-slot="me-lc-defaults-note"
        className="px-1.5 pt-0.5 pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]"
      >
        {text.note}
      </p>

      <div
        data-slot="me-lc-defaults-rows"
        data-dim={loading ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        className={cn(LC_CONTAINER_CLASS, "min-w-0", loading && "opacity-45")}
      >
        {USER_SETTINGS_GROUPS.map((group) => (
          <div key={group} role="group" aria-label={group} className="min-w-0">
            <div
              data-slot="me-lc-defaults-group"
              className="px-1.5 pt-2.5 pb-0.5 text-[12px] font-semibold text-[var(--muted-fg)]"
            >
              {group}
            </div>
            {USER_SETTINGS_ROWS.filter((r) => r.group === group).map((row) => {
              const flashing = save.flashKeys.has(row.key);
              const failure = save.failures[row.key];
              const failed = failure !== undefined;
              const busy = busyOf(row.key);
              return (
                <div
                  key={row.key}
                  data-slot="me-lc-defaults-row"
                  data-label={row.label}
                  data-field={row.id}
                  data-flash={flashing ? "ok" : undefined}
                  data-failed={failed ? "true" : undefined}
                  className={cn("min-w-0", flashing && FLASH_CLASS)}
                >
                  {row.unit === null ? (
                    <ChoiceRow
                      id={row.id}
                      label={row.label}
                      value={userSettings?.[row.key] ?? 0}
                      options={METHOD_OPTIONS}
                      onSelect={(v) => save.commit(row.key, v)}
                      a11yName={row.label}
                      description="새 전략의 자동매도 방법 초기값이에요"
                      disabled={loading || busy}
                      busy={busy}
                      failureText={failure || null}
                      segmentAlways
                    />
                  ) : (
                    <SettingRow
                      id={row.id}
                      label={row.label}
                      unit={row.unit}
                      value={userSettings?.[row.key] ?? null}
                      disabled={loading}
                      busy={busy}
                      failed={failed}
                      failureText={failure || null}
                      editing={editingKey === row.key && userSettings !== undefined}
                      hasPopup={editMode === "sheet"}
                      editor={
                        userSettings === undefined ? null : (
                          <InlineValueEditor
                            id={row.id}
                            label={row.label}
                            unit={row.unit}
                            initialValue={userSettings[row.key]}
                            validate={(v) => userSettingsRangeIssue(row.key, v, row.unit ?? "")}
                            onSave={(v) => {
                              save.commit(row.key, v);
                              setEditingKey(null);
                            }}
                            onCancel={() => setEditingKey(null)}
                            onDismiss={() => setEditingKey(null)}
                            onNavigate={(dir) => navigate(row.key, dir)}
                          />
                        )
                      }
                      onActivate={(el) => activate(row.key, el)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {save.rejectText !== null && (
        <p
          data-slot="me-lc-defaults-reject"
          role="alert"
          className="px-1.5 pt-1 pb-1.5 text-[12.5px] leading-[1.45] break-keep text-[var(--destructive)]"
        >
          {save.rejectText}
        </p>
      )}

      {/* 터치 기기 키패드 — 섹션에 한 개(포털). 범위 밖은 적용 비활성 + 빨간 한 줄(목업 문구). */}
      <NumberPadSheet
        open={sheetRow !== null && userSettings !== undefined}
        title={sheetRow?.label ?? ""}
        description={sheetRow === null ? "" : rangeLabel(sheetRow.key, sheetUnit)}
        unit={sheetUnit}
        purpose="apply"
        initialValue={sheetRow === null || userSettings === undefined ? null : userSettings[sheetRow.key]}
        serverValue={sheetRow === null || userSettings === undefined ? null : userSettings[sheetRow.key]}
        ctx={{ current: 0, upper: 0 }}
        validate={(v) => (sheetRow === null ? null : userSettingsRangeIssue(sheetRow.key, v, sheetUnit))}
        returnFocusRef={sheetReturnRef}
        onConfirm={(v) => {
          if (sheetRow !== null) save.commit(sheetRow.key, v);
          setSheetKey(null);
        }}
        onClose={() => setSheetKey(null)}
      />
    </section>
  );
}
