"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  isValidAccountNoInput,
  normalizeAccountNo,
  REFLECT_LABEL,
  resolveEffectiveOrderServer,
  summarizeOrderEndpoint,
  type AdminAccountInput,
  type AdminAccountView,
  type AdminPutAccountBody,
  type AdminServerResult,
  type AdminUsersOverview,
  type DmaBroker,
  type OrderEndpointMismatch,
  type OrderEndpointSummary,
  type ReflectTone,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { putDmaAccount, removeDmaAccount, setAccountOrderServer } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY, ReflectChip } from "./reflect-chip";
import { ADMIN_FLASH_CLASS, ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT } from "./role-segment";
import { useFieldSave, type FieldSave } from "./use-field-save";

/**
 * AccountEditor — 편집 시트 「계좌 · 등록 서버」 (Phase 29 D-14 · D-15 · D-23 ③④⑤ · 목업 A `acct()`).
 *
 * 계좌 줄 = 증권사 · 계좌번호 · 계좌명 · 「제거」 + 지점 · 트레이더(교보는 「해당 없음」 — D-23 ③) + **그 증권사 서버만**
 * 체크 토글(목업 `.sv` — 체크 · 서버 키 · 상태 칩). 87 에만 있는 계좌는 흐린 「서버에만 있음」 줄로 보기만 한다(D-23 ⑤).
 *
 * 저장은 전부 즉시 · 1요청(D-15): 토글 1회 = `PUT …/accounts { account, servers }`(계좌 단위로 서버 집합 전체) ·
 * 「제거」 = `DELETE …/accounts/:broker/:accountNo` · 「+ 계좌 추가」 = `PUT` 1건. 계좌마다 `useFieldSave` 를 둬
 * 한 번에 1건 · 마지막 값 대기 규율을 지킨다.
 *
 * 응답의 서버별 결과 배열 → **그 계좌 · 그 서버 칩**(`chipOfResult` — 아래 표). 결과 칩은 이 시트가 열려 있는 동안
 * 개요 칩보다 앞선다(응답이 87 스냅샷보다 새 소식이다). 실패 칩은 서버 한국어 message 를 `title` 로 싣고, 줄 아래
 * 「<서버> 실패 · BUSY: <message 원문> — 정리 뒤 「다시 반영」」 한 줄을 세운다(D-23 ④ — 토스트 없음). 꺼진 등록 서버의
 * 미반영(warn)도 relay 가 사유를 실으면 같은 자리에 「<서버> 미반영: <사유>」 한 줄(29-34 WR-04 — 톤만 warn).
 *
 * 마지막 계좌 「제거」 는 서버 409 `LAST_ACCOUNT` 를 기다리지 않고 화면이 먼저 안다 — `onRemoveLast`(시트가 확인 1회 뒤
 * 사용자 삭제). 켜진 서버가 1대인 계좌는 그 토글을 끌 수 없다 — 비활성 + `title` 「계좌는 서버 1대 이상」, 안내 문장은
 * 계좌마다 되풀이하지 않고 영역 아래 한 번(목업 하단 note 자리).
 *
 * **주문 서버(29-38 G-1 ⑦ · 29-30 채택 admin-control A — `mockup-g1-account-order-server.html` 변형 A).** 서버 칩 줄 아래 한 줄
 * `주문 서버 [기본 · KB120][KB120][KB121]` 세그먼트. 칸 = 「기본 · <증권사 기본 주문 서버>」 + 그 계좌의 **active 등록 서버**(레지스트리
 * 순 — removing · 미등록 · 다른 증권사 서버는 칸이 없다). 무엇이 주문 서버인지는 relay 와 같은 shared 규칙 한 벌
 * (`resolveEffectiveOrderServer` — 29-46 · GC-06: 지정 ?? 기본 서버에 등록돼 있으면 기본 ?? 등록 서버가 1대면 그 서버 ?? 없음)로 판정한다 —
 * 등록 = 켜진 active 등록 서버. 등록 서버가 1대면 세그먼트 없이 「주문 서버 <키>」 글자만, 「(기본)」 꼬리표는 규칙이 기본 갈래일 때만.
 * 기본 서버에 계좌가 없으면(여러 대) 「기본」 칸을 잠그고, 지정도 없으면 「기본 <키> 에 등록되지 않은 계좌 — 주문 서버를 고르세요」 한 줄. 꺼진 서버 칸은
 * 취소선 · 흐림 · 누를 수 없음 · 꺼진 서버가 지정돼 있으면 그 칸이 켜진 채 경고색 + 카드 아래 「<키> 꺼짐 — 기본 <기본> 으로」(relay 는
 * 기본값으로 보낸다). 고르면 즉시 `PUT …/order-server` 1건(D-15 · `useFieldSave` — 비행 중엔 마지막 값만) · 409 등은 계좌 오류 줄 ·
 * 저장 뒤 첫 재조회 값이 정본(`releaseOn` = 계좌 뷰). 87 에만 있는 계좌 줄에는 없다(D-23 ⑤ 보기만).
 * 영역 안내 문장은 목업 A 문장(답 이전)이 아니라 gh-trade-84 ②(가) 뒤 문장이다 — 전략은 relay 가 끈다 · 되돌릴 때 클라(OCX) 대사.
 *
 * **주문자 IP/MAC 읽기 줄(Phase 30 D-09 · D-10 · 30-UI-SPEC §1 · 목업 B).** KB 계좌만 지점 · 트레이더 줄 아래 한 줄 — 설정됨
 * 「주문자 IP <ip> · MAC <mac>」(87 정규화값 그대로 · 재정규화 금지) · 미설정 「… 미설정(서버 NIC 값)」 · 87 미확인 「… 확인 전」.
 * 값 · 출처 서버 · 등록 서버 간 불일치는 shared `summarizeOrderEndpoint`(relay 라우팅과 같은 유효 주문 서버 규칙 한 벌) 결과만
 * 그린다 — 웹은 별도 판정을 하지 않는다. 불일치는 다른 서버마다 경고 한 줄(`WARN_LINE`). 빈 계좌명은 제목줄에 흐린 「이름 없음」
 * (87 전용 흐린 줄은 편집 대상이 아니라 그대로).
 *
 * **「편집」 → 카드 편집 모드(Phase 30 D-01 · D-02 · IPMAC-05 · UI-SPEC §2 · §5).** 제목줄 「제거」 왼쪽 「편집」 을 누르면 그 카드만
 * `--primary` 테두리 편집 모드 — 계좌명 입력칸(첫 포커스) · 「취소 · 저장」. 한 번에 한 카드(부모 `editingKey` — 다른 카드 「편집」 은
 * 비활성 · 「다른 계좌 편집 중」). 초깃값은 연 순간 고정(재조회가 덮지 않는다). 「저장」 1회 = `PUT …/accounts` 1건
 * `{ account(새 이름 · 나머지 개요 값), servers(지금 active 등록 서버) }` — 계좌명만 바뀐 저장은 IP/MAC 을 싣지 않는다(relay 가 87 값을
 * 보존 · IPMAC-01). 서버 전부 ok 면 닫히고 포커스가 「편집」 으로 돌아온다. 서버 토글 · 주문 서버 · 「제거」 의 즉시 저장은 그대로.
 * 하나라도 ok 가 아니면 편집 · 입력값을 유지하고 동작 줄 아래 결과 줄에 서버마다 「<서버> 실패: <서버 message 원문>」(err ·
 * `role="alert"`) 또는 「<서버> 미반영: <사유>」(warn) — 서버 문구는 바꾸거나 대조하지 않는다(IPMAC-03 · D-12). HTTP 오류도 같은 자리.
 * 편집 저장에서 온 결과 칩은 `source: "edit"` 로 표시해 영역 하단 `BusyLines` 에 다시 띄우지 않는다(칩 · title 은 그대로).
 * 이름 저장 성공 뒤 재조회 전의 서버 토글은 새 이름을 싣는다(`editSave.value` — 옛 이름으로 되돌리지 않는다).
 */

export const ACCOUNT_EDITOR_TEXT = {
  remove: "제거",
  add: "+ 계좌 추가",
  notApplicable: "해당 없음",
  minOneServer: "계좌는 서버 1대 이상",
  lastAccountNote: "마지막 계좌 제거는 유저 삭제로 이어진다.",
  accountNoInvalid: "계좌번호는 1~12자예요",
  branchInvalid: "KB 지점번호는 5자예요",
  traderInvalid: "KB 트레이더 id 는 6자예요",
  submit: "추가",
  cancel: "취소",
  duplicate: "이미 있는 계좌 — 위 계좌 줄에서 서버를 고르세요",
  /** 계좌 줄 컨트롤 이름(29-38) — 증권사 단위는 /admin/servers 의 「기본 주문 서버」. */
  orderServer: "주문 서버",
  orderServerDefault: (defaultKey: string | null) => (defaultKey ? `기본 · ${defaultKey}` : "기본"),
  orderServerDefaultSuffix: "(기본)",
  orderServerOff: (key: string, defaultKey: string | null) => `${key} 꺼짐 — 기본 ${defaultKey ?? "서버"} 으로`,
  /** 29-55 GC-06 — 기본 서버에 등록되지 않은 계좌(여러 대 · 지정 없음): relay 는 어느 서버로도 보내지 않는다. */
  orderServerNoDefault: (defaultKey: string | null) =>
    defaultKey ? `기본 ${defaultKey} 에 등록되지 않은 계좌 — 주문 서버를 고르세요` : "기본 주문 서버가 없는 계좌 — 주문 서버를 고르세요",
  /** gh-trade-84 ②(가) 뒤 문장 — 목업 A 의 「옛 서버의 미체결 · 전략은 그 서버에서 …」 는 답 이전 것이라 바꿨다. */
  orderServerNote:
    "주문 서버를 바꾸면 relay 가 옛 서버에 남은 그 계좌의 활성 전략(상따 · VI · 자동매도)을 끄고 새 서버로 바로 재접속해요 — 옛 서버의 미체결은 그 서버(클라)에서 정리하고, 옛 서버로 되돌릴 때는 클라(OCX) 대사로 잔고를 맞추세요.",
  // ── Phase 30 (30-UI-SPEC Copywriting 정본) ──
  /** 편집 모드 CTA — 보이는 글자는 목업 B, 접근 이름은 「{증권사} {계좌번호} 편집 / 편집 취소 / 편집 저장」(UI-SPEC CTA 표). */
  edit: "편집",
  save: "저장",
  editCancel: "편집 취소",
  editSave: "편집 저장",
  /** 다른 카드가 편집 중일 때 「편집」 의 title(D-01 · 한 번에 한 카드). */
  editLocked: "다른 계좌 편집 중",
  nameLabel: "계좌명",
  namePlaceholder: "계좌명(선택)",
  /** 편집 저장 결과 줄 — 실패 서버 한 줄(message 는 서버 원문 그대로). */
  editFailedLine: (serverKey: string, message: string) => `${serverKey} 실패: ${message}`,
  /** 계좌명이 빈 값인 읽기 카드 제목줄(--faint). */
  noName: "이름 없음",
  ipmacLabel: "주문자 IP",
  ipmacMacLabel: "MAC",
  /** 87 값이 빈 값(서버 NIC 값으로 주문) — --faint. */
  ipmacUnset: "미설정(서버 NIC 값)",
  /** 어느 등록 서버의 87 에도 그 계좌가 아직 없음 — 「미설정」 으로 보이면 실제 서버 값과 어긋난다. */
  ipmacUnknown: "확인 전",
  /** D-10 — 출처 서버와 값이 다른 다른 등록 서버 한 줄. */
  ipmacMismatch: (serverKey: string, m: Pick<OrderEndpointMismatch, "state" | "orderIp" | "orderMac">) =>
    `${serverKey} 값이 달라요(${m.state === "set" ? `IP ${m.orderIp} · MAC ${m.orderMac}` : "미설정"}) — 편집에서 저장하면 등록 서버가 모두 같아져요`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 결과 → 칩
// ─────────────────────────────────────────────────────────────────────────────

/** 칩 1개의 그림 — 톤 · 서버 message(err · 사유 있는 warn) · `REFLECT_LABEL` 밖 낱말(있으면). */
export interface ChipView {
  tone: ReflectTone;
  message: string | null;
  label: string | null;
  /** 카드 편집 저장에서 온 칩 — 그 실패는 카드 결과 줄이 말하므로 영역 하단 `BusyLines` 에 다시 띄우지 않는다(Phase 30 UI-SPEC §4). */
  source?: "edit";
}

/**
 * 응답 outcome → 칩. ok 반영됨 · failed 실패 · BUSY(message 원문) · timeout 응답 없음(err) · offline 서버 연결 안 됨(warn) ·
 * skipped 미반영(warn). warn 도 서버가 사유 message 를 실었으면(29-34 WR-04 — 꺼진 등록 서버) 칩 `title` · 아래 줄에 싣는다.
 */
export const RESULT_CHIP: Readonly<Record<AdminServerResult["outcome"], Omit<ChipView, "message">>> = {
  ok: { tone: "ok", label: null },
  failed: { tone: "err", label: null },
  timeout: { tone: "err", label: "응답 없음" },
  offline: { tone: "warn", label: "서버 연결 안 됨" },
  skipped: { tone: "warn", label: null },
};

export function chipOfResult(r: AdminServerResult): ChipView {
  const base = RESULT_CHIP[r.outcome] ?? RESULT_CHIP.failed;
  return { ...base, message: base.tone === "ok" ? null : (r.message ?? null) };
}

/** 상태 낱말만(서버 키가 옆에 있는 자리). */
export function chipStatusText(chip: ChipView): string {
  return chip.label ?? REFLECT_LABEL[chip.tone];
}

/** 「키 · 상태」(반영됨은 키만) — 서버 키가 옆에 없는 자리(비밀번호 · 삭제 결과). */
export function chipFullText(serverKey: string, chip: ChipView): string {
  if (chip.label) return `${serverKey} · ${chip.label}`;
  return chip.tone === "ok" ? serverKey : `${serverKey} · ${REFLECT_LABEL[chip.tone]}`;
}

/** 결과 배열 → 「키 · 상태」 칩 줄(비밀번호 · 사용자 삭제 결과). */
export function ResultChips({ results }: { results: readonly AdminServerResult[] }) {
  if (results.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {results.map((r) => {
        const chip = chipOfResult(r);
        return (
          <ReflectChip
            key={r.server}
            serverKey={r.server}
            tone={chip.tone}
            message={chip.message}
            text={chipFullText(r.server, chip)}
          />
        );
      })}
    </span>
  );
}

/** BUSY 안내 한 줄 — 목업 「KB121 실패 · BUSY: … 정리 뒤 「다시 반영」」(message 는 서버 원문 그대로). */
export function busyLineText(serverKey: string, message: string, after = "정리 뒤 「다시 반영」"): string {
  return `${serverKey} 실패 · BUSY: ${message} — ${after}`;
}

/** 미반영 사유 한 줄(29-34 WR-04) — 「KB121 미반영: <사유>」. 사유 문장이 할 일을 이미 말하므로 뒤 안내를 붙이지 않는다. */
export function skippedLineText(serverKey: string, message: string): string {
  return `${serverKey} ${REFLECT_LABEL.warn}: ${message}`;
}

const LINE_TONE_CLASS: Readonly<Record<"err" | "warn", string>> = {
  err: "text-[var(--destructive)]",
  warn: "text-[var(--led-latent)]",
};

export function BusyLines({
  chips,
  after,
}: {
  chips: readonly { serverKey: string; tone: ReflectTone; message: string | null }[];
  after?: string;
}) {
  const seen = new Set<string>();
  const lines: { key: string; tone: "err" | "warn"; text: string }[] = [];
  for (const c of chips) {
    if ((c.tone !== "err" && c.tone !== "warn") || !c.message) continue;
    const k = `${c.serverKey}\u0000${c.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const text = c.tone === "err" ? busyLineText(c.serverKey, c.message, after) : skippedLineText(c.serverKey, c.message);
    lines.push({ key: k, tone: c.tone, text });
  }
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((l) => (
        <p
          key={l.key}
          data-slot="admin-busy-line"
          data-tone={l.tone}
          className={cn("mt-1.5 text-[12px] leading-[1.5] break-keep", LINE_TONE_CLASS[l.tone])}
        >
          {l.text}
        </p>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 키 · 결과 덮개
// ─────────────────────────────────────────────────────────────────────────────

export function accountKeyOf(broker: DmaBroker, accountNo: string): string {
  return `${broker}:${normalizeAccountNo(accountNo)}`;
}

const slotKey = (accountKey: string, serverKey: string) => `${accountKey}|${serverKey}`;

type Overlay = ReadonlyMap<string, ChipView>;

function viewChipOf(account: AdminAccountView, serverKey: string): ChipView | null {
  const s = account.servers.find((x) => x.serverKey === serverKey);
  return s ? { tone: s.tone, message: s.message, label: null } : null;
}

/** 계좌 1개에 온 결과 — 그 계좌 · 그 서버 칩을 그대로 바꾼다(PUT · 계좌 DELETE · 계좌 추가 · 카드 편집 저장 = `source` "edit"). */
function applyAccountResults(
  prev: Overlay,
  accountKey: string,
  results: readonly AdminServerResult[],
  source?: "edit",
): Overlay {
  const next = new Map(prev);
  for (const r of results) {
    const chip = chipOfResult(r);
    next.set(slotKey(accountKey, r.server), source ? { ...chip, source } : chip);
  }
  return next;
}

/** 카드 편집 저장 결과 줄 1개(UI-SPEC §4) — err 실패 · 응답 없음 / warn 미반영. */
interface EditResultLine {
  server: string;
  tone: "err" | "warn";
  text: string;
}

/**
 * ok 가 아닌 결과 → 서버마다 한 줄. err = 「<서버> 실패: <message 원문 · 없으면 칩 낱말(응답 없음 · 실패 · BUSY)>」 ·
 * warn = 「<서버> 미반영: <사유 원문 · 없으면 서버 연결 안 됨>」. 서버 문구는 바꾸거나 대조하지 않는다(D-12).
 */
function editResultLines(results: readonly AdminServerResult[]): EditResultLine[] {
  const lines: EditResultLine[] = [];
  for (const r of results) {
    const chip = chipOfResult(r);
    if (chip.tone === "err") {
      lines.push({ server: r.server, tone: "err", text: ACCOUNT_EDITOR_TEXT.editFailedLine(r.server, r.message || chipStatusText(chip)) });
    } else if (chip.tone === "warn") {
      lines.push({ server: r.server, tone: "warn", text: skippedLineText(r.server, r.message || "서버 연결 안 됨") });
    }
  }
  return lines;
}

/**
 * 사용자 전체에 온 결과(다시 반영) — 서버 S 의 결과는 S 에 등록된 계좌 전부에 닿는다. ok 면 반영됨, 실패면 **아직 반영되지 않은
 * 계좌만** 실패로(이미 반영된 계좌까지 실패로 칠하지 않는다 — shared `pendingTone` 과 같은 판정).
 */
function applyServerWideResults(
  prev: Overlay,
  accounts: readonly AdminAccountView[],
  results: readonly AdminServerResult[],
): Overlay {
  const next = new Map(prev);
  for (const r of results) {
    const chip = chipOfResult(r);
    for (const a of accounts) {
      const k = slotKey(accountKeyOf(a.broker, a.accountNo), r.server);
      const current = prev.get(k) ?? viewChipOf(a, r.server);
      if (current === null) continue;
      if (chip.tone === "ok" || current.tone !== "ok") next.set(k, chip);
    }
  }
  return next;
}

function accountInputOf(a: AdminAccountView): AdminAccountInput {
  return {
    broker: a.broker,
    accountNo: a.accountNo,
    name: a.name,
    branchNo: a.branchNo,
    traderId: a.traderId,
    priority: a.priority,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 모양
// ─────────────────────────────────────────────────────────────────────────────

/** 계좌 카드 — 목업 `.acct`(hairline · r12 · 12px 14px). */
const ACCOUNT_CARD = "mt-2.5 rounded-[12px] border border-[var(--border-subtle)] px-3.5 py-3";
/** 증권사 배지 — 목업 `.acct .t .bk`. */
const BROKER_BADGE = "rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--fg-2)]";
/**
 * 계좌 버튼(「제거」 · 「+ 계좌 추가」 · 추가 폼 「취소」 · 「추가」) 높이 — 폰(640 미만) 36px 터치 타깃 · 데스크톱 종전 28px
 * (29-31 UI-REVIEW-3).
 */
const ACCOUNT_BUTTON = "h-9 px-2.5 sm:h-7";
/** 서버 토글 알약 — 목업 `.sv`(12.5px · 5px 9px · 둥근 알약 · hairline). 폰은 최소 36px(29-31 · 데스크톱 종전 높이). */
const SERVER_PILL =
  "inline-flex min-h-9 sm:min-h-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[12.5px] text-[var(--fg-2)] has-disabled:cursor-default";
/** 상태 칩(알약 안) — 목업 `.sv .st`(10.5px · 1px 5px · r4). */
const PILL_CHIP = "rounded-[4px] px-[5px] py-px text-[10.5px]";
const NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
const ERROR_LINE = "mt-1.5 text-[12.5px] break-keep text-[var(--destructive)]";
/**
 * 주문 서버 세그먼트 칸 — 역할 세그먼트(`ADMIN_SEGMENT_ITEM` · 폰 36px · 데스크톱 28px)에 목업 A `.ord .seg span`(12.5px · 4px 10px).
 * 꺼진 칸 = 취소선 · `--faint` · 누를 수 없음 / 꺼졌는데 지정된 칸 = 켜진 채 경고색(`--led-latent`).
 */
const ORDER_SEGMENT_ITEM = cn(ADMIN_SEGMENT_ITEM, "px-2.5 text-[12.5px] disabled:opacity-100");
const ORDER_ITEM_OFF = "line-through text-[var(--faint)]";
const ORDER_ITEM_OFF_ON = "line-through text-[var(--led-latent)]! data-[state=on]:text-[var(--led-latent)]!";
const WARN_LINE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--led-latent)]";
/** 카드 편집 블록의 오류 줄(Phase 30 UI-SPEC 유일한 새 상수) — 12px(도움말 자리와 같은 크기 · `BusyLines` err 줄과 같은 조합). */
const EDIT_ERROR_LINE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--destructive)]";
/** 주문자 IP/MAC 읽기 줄(Phase 30 D-09) — 12px · muted · 숫자 tabular · 값은 600 · --fg-2. */
const IPMAC_LINE = "mt-1 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)] tabular-nums";
const IPMAC_VALUE = "font-semibold text-[var(--fg-2)]";
/** 「기본」 칸의 토글 값 — Radix 단일 토글의 "" 는 「선택 해제」 라 따로 둔다. */
const ORDER_DEFAULT_VALUE = "__default__";

/** 성공 플래시 — 켜진 체크 칸을 성공 토큰으로 0.7초. */
const ROW_FLASH = "[&_[data-state=checked]]:border-[var(--led-armed)]! [&_[data-state=checked]]:bg-[var(--led-armed)]!";

function brokerLabel(b: DmaBroker): string {
  return b;
}

function BranchTrader({ account }: { account: Pick<AdminAccountView, "broker" | "branchNo" | "traderId"> }) {
  const na = ACCOUNT_EDITOR_TEXT.notApplicable;
  const kb = account.broker === "KB";
  return (
    <p data-slot="admin-account-branch" className="mt-1 text-[12px] text-[var(--muted-fg)]">
      지점 {kb ? account.branchNo || "—" : na} · 트레이더 {kb ? account.traderId || "—" : na}
    </p>
  );
}

function AccountTitle({
  account,
  noNamePlaceholder = false,
  hideName = false,
  children,
}: {
  account: AdminAccountView;
  /** 계좌명이 빈 값이면 그 자리에 흐린 「이름 없음」(편집 가능한 계좌 카드만 — 87 전용 줄은 넘기지 않는다). */
  noNamePlaceholder?: boolean;
  /** 편집 모드 — 계좌명은 아래 입력칸으로 옮겨 가므로 제목줄에서 숨긴다(UI-SPEC §2-1). */
  hideName?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--fg)]">
      <span className={BROKER_BADGE}>{brokerLabel(account.broker)}</span>
      <span className="min-w-0 truncate tabular-nums">{account.accountNo}</span>
      {hideName ? null : account.name ? (
        <span className="min-w-0 truncate font-medium text-[var(--muted-fg)]">{account.name}</span>
      ) : noNamePlaceholder ? (
        <span className="min-w-0 truncate font-medium text-[var(--faint)]">{ACCOUNT_EDITOR_TEXT.noName}</span>
      ) : null}
      <span className="flex-1" />
      {children}
    </div>
  );
}

/** KB 주문자 IP/MAC 읽기 줄(D-09 · UI-SPEC §1-3) — summary 값 그대로(재정규화 금지). */
function OrderEndpointLine({ summary }: { summary: OrderEndpointSummary }) {
  const T = ACCOUNT_EDITOR_TEXT;
  return (
    <p data-slot="admin-account-ipmac" className={IPMAC_LINE}>
      {summary.state === "set" ? (
        <>
          {`${T.ipmacLabel} `}
          <b className={IPMAC_VALUE}>{summary.orderIp}</b>
          {` · ${T.ipmacMacLabel} `}
          <b className={IPMAC_VALUE}>{summary.orderMac}</b>
        </>
      ) : (
        <>
          {`${T.ipmacLabel} · ${T.ipmacMacLabel} `}
          <span className="text-[var(--faint)]">{summary.state === "unset" ? T.ipmacUnset : T.ipmacUnknown}</span>
        </>
      )}
    </p>
  );
}

/** 등록 서버 간 87 값 불일치(D-10 · UI-SPEC §1-4) — 다른 서버마다 한 줄 · 0줄 = 일치 · 87 을 모르는 서버는 summary 가 빼 둔다. */
function OrderEndpointMismatchLines({ summary }: { summary: OrderEndpointSummary }) {
  return (
    <>
      {summary.mismatches.map((m) => (
        <p key={m.serverKey} data-slot="admin-account-ipmac-mismatch" data-server={m.serverKey} className={WARN_LINE}>
          {ACCOUNT_EDITOR_TEXT.ipmacMismatch(m.serverKey, m)}
        </p>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 줄
// ─────────────────────────────────────────────────────────────────────────────

interface AccountRowProps {
  account: AdminAccountView;
  dmaUserId: string;
  /** 이 계좌 증권사의 서버 키(레지스트리 순). */
  candidates: readonly string[];
  /** 이 계좌 증권사의 레지스트리 전체(꺼진 서버 포함 · 레지스트리 순) — 주문 서버 칸 순서 · 꺼짐 판정. */
  registry: AdminUsersOverview["servers"];
  overlay: Overlay;
  /** 이 계좌가 마지막 계좌인가 — 「제거」 가 사용자 삭제로 간다. */
  last: boolean;
  /** 이 카드가 편집 모드인가(부모 `editingKey` — 한 번에 한 카드 · D-01). */
  editing: boolean;
  /** 다른 카드가 편집 중 — 「편집」 비활성 · title 「다른 계좌 편집 중」. */
  editLocked: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onResults: (accountKey: string, results: readonly AdminServerResult[], source?: "edit") => void;
  onChanged: () => void;
  onRemoveLast: () => void;
}

/** 편집 모드 입력값(30-05 가 ip · mac 을 더한다). */
interface EditFields {
  name: string;
}

function AccountRow({
  account,
  dmaUserId,
  candidates,
  registry,
  overlay,
  last,
  editing,
  editLocked,
  onEditStart,
  onEditEnd,
  onResults,
  onChanged,
  onRemoveLast,
}: AccountRowProps) {
  const T = ACCOUNT_EDITOR_TEXT;
  const key = accountKeyOf(account.broker, account.accountNo);
  const nameId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // 편집 초깃값 · 초안 — 「편집」 을 누른 순간 고정한다(이후 재조회 props 가 덮지 않는다 · UI-SPEC §5).
  const [draft, setDraft] = useState<{ initial: EditFields; value: EditFields } | null>(null);
  const isEditing = editing && draft !== null;
  // 저장 결과 줄(서버별) · HTTP 오류 줄 표시 — 입력을 고치거나 「취소」 · 다시 열면 지운다(목업 B `delete MSG`).
  const [editLines, setEditLines] = useState<EditResultLine[]>([]);
  const [editErrorShown, setEditErrorShown] = useState(false);
  const clearEditResult = () => {
    setEditLines([]);
    setEditErrorShown(false);
  };

  // 카드 저장 1건(D-02) — 서버 일부 실패도 HTTP 성공이라 onSuccess 가 불린다: 전부 ok 일 때만 편집을 닫는다.
  const editSave = useFieldSave<AdminPutAccountBody>((body) => putDmaAccount(dmaUserId, body), {
    releaseOn: account,
    onSuccess: (_body, res) => {
      if (res) onResults(key, res.results, "edit");
      onChanged();
      const lines = res ? editResultLines(res.results) : [];
      setEditLines(lines);
      if (lines.length === 0) onEditEnd();
    },
  });

  // 편집이 닫히면(취소 · 저장 성공) 포커스를 그 카드 「편집」 으로 돌린다.
  const wasEditing = useRef(isEditing);
  useEffect(() => {
    if (wasEditing.current && !isEditing) editButtonRef.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);

  // 이름은 「편집 저장이 쥔 새 이름 ?? 개요 이름」 — 저장 성공 뒤 재조회(`releaseOn`) 전 토글이 옛 이름으로 되돌리지 않게(Pitfall 4).
  const toggle = useFieldSave<string[]>(
    (servers) =>
      putDmaAccount(dmaUserId, {
        account: { ...accountInputOf(account), name: editSave.value?.account.name ?? account.name },
        servers,
      }),
    {
      onSuccess: (_v, res) => {
        if (res) onResults(key, res.results);
        onChanged();
      },
    },
  );
  const remove = useFieldSave<true>(() => removeDmaAccount(dmaUserId, account.broker, account.accountNo), {
    retainValue: false,
    onSuccess: (_v, res) => {
      if (res) onResults(key, res.results);
      onChanged();
    },
  });

  const intent =
    toggle.value ?? account.servers.filter((s) => s.state === "active").map((s) => s.serverKey);
  const shown = [...candidates, ...intent.filter((k) => !candidates.includes(k))];

  const setServer = (serverKey: string, on: boolean) => {
    const next = shown.filter((k) => (k === serverKey ? on : intent.includes(k)));
    if (next.length === 0) return; // 계좌는 서버 1대 이상
    toggle.run(next);
  };

  const chipFor = (serverKey: string, checked: boolean): ChipView | null => {
    const o = overlay.get(slotKey(key, serverKey));
    if (o) return o;
    const s = account.servers.find((x) => x.serverKey === serverKey);
    if (s && (checked || s.state === "removing")) return { tone: s.tone, message: s.message, label: null };
    if (account.serverOnlyOn.includes(serverKey)) return { tone: "only", message: null, label: null };
    return null;
  };

  const order = useFieldSave<string | null>(
    async (serverKey) => {
      await setAccountOrderServer(dmaUserId, account.broker, account.accountNo, serverKey);
    },
    { onSuccess: () => onChanged(), releaseOn: account },
  );

  const error = order.error ?? toggle.error ?? remove.error;
  const editSaving = editSave.state === "saving";
  const editChanged = draft !== null && draft.value.name.trim() !== draft.initial.name.trim();

  const openEdit = () => {
    const initial: EditFields = { name: account.name };
    setDraft({ initial, value: initial });
    clearEditResult();
    onEditStart();
  };
  const cancelEdit = () => {
    if (editSaving) return;
    clearEditResult();
    onEditEnd();
  };
  const submitEdit = () => {
    if (draft === null || !editChanged || editSaving) return;
    setEditLines([]);
    setEditErrorShown(true);
    // servers = 지금 그리는 active 등록 서버(토글 비행 중이면 그 값) — 서버 집합을 바꾸지 않는다. orderEndpoint 는 싣지 않는다.
    editSave.run({ account: { ...accountInputOf(account), name: draft.value.name.trim() }, servers: intent });
  };
  const kb = account.broker === "KB";
  // D-09 · D-10 — 표시값 · 출처 · 불일치는 shared 판정 한 벌(relay 라우팅과 같은 유효 주문 서버 규칙).
  const endpoint = kb ? summarizeOrderEndpoint({ account, registry }) : null;

  return (
    <div
      data-slot="admin-account"
      data-account={account.accountNo}
      data-broker={account.broker}
      data-state={remove.state === "saving" ? "saving" : toggle.state}
      data-editing={isEditing ? "true" : undefined}
      className={cn(
        ACCOUNT_CARD,
        isEditing && "border-[var(--primary)]",
        (toggle.state === "flash" || editSave.state === "flash") && ROW_FLASH,
      )}
    >
      <AccountTitle account={account} noNamePlaceholder hideName={isEditing}>
        {!isEditing && (
          <Button
            ref={editButtonRef}
            type="button"
            size="sm"
            variant="secondary"
            aria-label={`${account.broker} ${account.accountNo} ${T.edit}`}
            disabled={editLocked}
            title={editLocked ? T.editLocked : undefined}
            onClick={openEdit}
            className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}
          >
            {T.edit}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label={`${account.broker} ${account.accountNo} ${ACCOUNT_EDITOR_TEXT.remove}`}
          disabled={remove.state === "saving"}
          onClick={() => (last ? onRemoveLast() : remove.run(true))}
          className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}
        >
          {ACCOUNT_EDITOR_TEXT.remove}
        </Button>
      </AccountTitle>
      <BranchTrader account={account} />
      {isEditing ? (
        <form
          data-slot="admin-account-edit"
          className="mt-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit();
          }}
        >
          <label htmlFor={nameId} className="mb-1 block text-[12px] text-[var(--muted-fg)]">
            {T.nameLabel}
          </label>
          <Input
            id={nameId}
            size="sm"
            // UI-SPEC §2 — 「편집」 을 누르면 첫 포커스는 계좌명 칸(편집 블록은 그때 마운트된다).
            autoFocus
            maxLength={40}
            autoComplete="off"
            placeholder={T.namePlaceholder}
            readOnly={editSaving}
            value={draft.value.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => (d ? { ...d, value: { ...d.value, name } } : d));
              clearEditResult();
            }}
          />
          {endpoint && <OrderEndpointMismatchLines summary={endpoint} />}
          <div className="mt-2.5 flex justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label={`${account.broker} ${account.accountNo} ${T.editCancel}`}
              disabled={editSaving}
              onClick={cancelEdit}
              className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}
            >
              {T.cancel}
            </Button>
            <Button
              type="submit"
              size="sm"
              aria-label={`${account.broker} ${account.accountNo} ${T.editSave}`}
              disabled={!editChanged || editSaving}
              className={cn(ADMIN_BUTTON_PRIMARY, ACCOUNT_BUTTON)}
            >
              {T.save}
            </Button>
          </div>
          {editErrorShown && editSave.error && (
            <p role="alert" data-slot="admin-account-edit-result" data-tone="err" className={EDIT_ERROR_LINE}>
              {editSave.error}
            </p>
          )}
          {editLines.map((l) =>
            l.tone === "err" ? (
              <p key={l.server} role="alert" data-slot="admin-account-edit-result" data-server={l.server} data-tone="err" className={EDIT_ERROR_LINE}>
                {l.text}
              </p>
            ) : (
              <p key={l.server} data-slot="admin-account-edit-result" data-server={l.server} data-tone="warn" className={WARN_LINE}>
                {l.text}
              </p>
            ),
          )}
        </form>
      ) : (
        endpoint && (
          <>
            <OrderEndpointLine summary={endpoint} />
            <OrderEndpointMismatchLines summary={endpoint} />
          </>
        )
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {shown.map((serverKey) => {
          const checked = intent.includes(serverKey);
          const chip = chipFor(serverKey, checked);
          const locked = checked && intent.length === 1;
          return (
            <label
              key={serverKey}
              data-slot="admin-server-toggle"
              data-server={serverKey}
              title={locked ? ACCOUNT_EDITOR_TEXT.minOneServer : undefined}
              className={SERVER_PILL}
            >
              <Checkbox
                aria-label={serverKey}
                checked={checked}
                disabled={locked}
                onCheckedChange={(v) => setServer(serverKey, v === true)}
                className="disabled:opacity-100"
              />
              <span>{serverKey}</span>
              {chip && (
                <ReflectChip
                  serverKey={serverKey}
                  tone={chip.tone}
                  message={chip.message}
                  text={chipStatusText(chip)}
                  className={PILL_CHIP}
                />
              )}
            </label>
          );
        })}
      </div>
      <OrderServerControl account={account} registry={registry} save={order} />
      {error && (
        <p role="alert" data-slot="admin-account-error" className={ERROR_LINE}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 계좌 줄 「주문 서버」(29-38 · 채택 A) — 칸 = 「기본 · <기본 키>」 + active 등록 서버(레지스트리 순) · 1대면 글자만 · 꺼진 칸 잠금 ·
 * 꺼진 지정 경고 줄. 값 = 누른 값(비행 · 재조회 전) ?? 개요 `orderServer` ?? 기본(null).
 * 29-55 GC-06 — 「(기본)」 꼬리표 · 「기본」 칸 잠금 · 미등록 경고는 shared `resolveEffectiveOrderServer`(relay 와 한 벌) 결과로만 정한다.
 */
function OrderServerControl({
  account,
  registry,
  save,
}: {
  account: AdminAccountView;
  registry: AdminUsersOverview["servers"];
  save: FieldSave<string | null>;
}) {
  const T = ACCOUNT_EDITOR_TEXT;
  const active = new Set(account.servers.filter((s) => s.state === "active").map((s) => s.serverKey));
  if (active.size === 0) return null;
  const order = registry.map((s) => s.key);
  const registered = [...order.filter((k) => active.has(k)), ...[...active].filter((k) => !order.includes(k))];
  const enabled = (k: string) => registry.find((s) => s.key === k)?.enabled ?? true;
  const defaultKey = account.defaultOrderServer ?? null;
  const saved = account.orderServer ?? null;
  const current = save.value !== undefined ? save.value : saved;
  // GC-06 — relay 와 같은 규칙 한 벌. 등록 = 켜진 active 등록 서버 · 지정 = 지금 값이 그 안에 있을 때만(꺼진 지정은 relay 도 무시).
  const enabledRegistered = registered.filter(enabled);
  const effective = resolveEffectiveOrderServer({
    designated: current !== null && enabledRegistered.includes(current) ? current : null,
    defaultKey,
    registered: enabledRegistered,
  });
  const defaultLocked = defaultKey === null || !enabledRegistered.includes(defaultKey);

  const offWarning =
    saved !== null && active.has(saved) && !enabled(saved) ? (
      <p data-slot="admin-order-server-off" className={WARN_LINE}>
        {T.orderServerOff(saved, defaultKey)}
      </p>
    ) : null;

  if (registered.length === 1) {
    const only = registered[0];
    return (
      <>
        <div data-slot="admin-order-server" data-account={account.accountNo} className="mt-2.5 text-[12.5px] text-[var(--muted-fg)]">
          {T.orderServer} <b className="font-semibold text-[var(--fg)]">{only}</b>
          {effective?.via === "default" && effective.key === only ? T.orderServerDefaultSuffix : null}
        </div>
        {offWarning}
      </>
    );
  }

  return (
    <>
      <div
        data-slot="admin-order-server"
        data-account={account.accountNo}
        data-state={save.state}
        className="mt-2.5 flex flex-wrap items-center gap-2"
      >
        <span className="text-[12px] text-[var(--muted-fg)]">{T.orderServer}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={current ?? ORDER_DEFAULT_VALUE}
          aria-label={`${account.broker} ${account.accountNo} ${T.orderServer}`}
          onValueChange={(v) => {
            // 켜진 칸을 다시 누르면 Radix 가 "" 를 준다 — 해제는 없다(늘 하나).
            if (v === "") return;
            const next = v === ORDER_DEFAULT_VALUE ? null : v;
            if (next !== current) save.run(next);
          }}
          className={cn(ADMIN_SEGMENT_ROOT, save.state === "flash" && ADMIN_FLASH_CLASS)}
        >
          <ToggleGroupItem
            value={ORDER_DEFAULT_VALUE}
            disabled={defaultLocked}
            data-off={defaultLocked ? "true" : undefined}
            className={cn(ORDER_SEGMENT_ITEM, defaultLocked && (current === null ? ORDER_ITEM_OFF_ON : ORDER_ITEM_OFF))}
          >
            {T.orderServerDefault(defaultKey)}
          </ToggleGroupItem>
          {registered.map((k) => {
            const off = !enabled(k);
            return (
              <ToggleGroupItem
                key={k}
                value={k}
                disabled={off}
                data-off={off ? "true" : undefined}
                className={cn(ORDER_SEGMENT_ITEM, off && (current === k ? ORDER_ITEM_OFF_ON : ORDER_ITEM_OFF))}
              >
                {k}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>
      {offWarning}
      {effective === null && (
        <p data-slot="admin-order-server-no-default" className={WARN_LINE}>
          {T.orderServerNoDefault(defaultKey)}
        </p>
      )}
    </>
  );
}

/** 87 에만 있는 계좌 — 흐린 줄 · 보기만(D-23 ⑤ — 지우지 않는다). */
function ServerOnlyAccountRow({ account }: { account: AdminAccountView }) {
  return (
    <div
      data-slot="admin-account"
      data-account={account.accountNo}
      data-broker={account.broker}
      data-server-only="true"
      className={cn(ACCOUNT_CARD, "border-dashed opacity-60")}
    >
      <AccountTitle account={account} />
      <div className="mt-2 flex flex-wrap gap-1">
        {account.serverOnlyOn.map((serverKey) => (
          <ReflectChip key={serverKey} serverKey={serverKey} tone="only" />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 추가
// ─────────────────────────────────────────────────────────────────────────────

const BROKERS: readonly DmaBroker[] = ["KB", "KYOBO"];

interface AccountAddFormProps {
  dmaUserId: string;
  /**
   * 이미 있는 의도 계좌의 키(`accountKeyOf`) — 「추가」 는 PUT upsert 1건이라 같은 키를 넣으면 그 계좌의 이름 · 지점 · 등록 서버를
   * 조용히 덮는다(WR-06). 이 집합에 있으면 막고 계좌 줄로 안내한다. 87 에만 있는 계좌(의도 없음)는 넣지 않는다 — 막지 않는다.
   * 서버 쪽 create-only 플래그는 두지 않는다: Admin 1명 운영이라 동시 추가 경합이 없고, RPC 시그니처를 바꾸면 오버로드가 생긴다.
   */
  existingKeys: ReadonlySet<string>;
  serverKeysOf: (broker: DmaBroker) => string[];
  nextPriority: number;
  onResults: (accountKey: string, results: readonly AdminServerResult[]) => void;
  onChanged: () => void;
  onClose: () => void;
}

function AccountAddForm({
  dmaUserId,
  existingKeys,
  serverKeysOf,
  nextPriority,
  onResults,
  onChanged,
  onClose,
}: AccountAddFormProps) {
  const [broker, setBroker] = useState<DmaBroker>("KB");
  const [accountNo, setAccountNo] = useState("");
  const [name, setName] = useState("");
  const [branchNo, setBranchNo] = useState("");
  const [traderId, setTraderId] = useState("");
  const [servers, setServers] = useState<string[]>([]);

  const save = useFieldSave<AdminPutAccountBody>((body) => putDmaAccount(dmaUserId, body), {
    retainValue: false,
    onSuccess: (body, res) => {
      if (res) onResults(accountKeyOf(body.account.broker, body.account.accountNo), res.results);
      onChanged();
      onClose();
    },
  });

  const kb = broker === "KB";
  const candidates = serverKeysOf(broker);
  const noInvalid = accountNo.trim() !== "" && !isValidAccountNoInput(accountNo);
  const branchInvalid = kb && branchNo !== "" && branchNo.length !== 5;
  const traderInvalid = kb && traderId !== "" && traderId.length !== 6;
  // 정규화(공백 · 앞 0)한 같은 키의 의도 계좌가 있으면 막는다 — 입력 안내 한 줄(오류 경보 아님).
  const duplicate = isValidAccountNoInput(accountNo) && existingKeys.has(accountKeyOf(broker, accountNo));
  const ready =
    isValidAccountNoInput(accountNo) &&
    !duplicate &&
    servers.length > 0 &&
    (!kb || (branchNo.length === 5 && traderId.length === 6)) &&
    save.state !== "saving";

  const submit = () => {
    if (!ready) return;
    save.run({
      account: {
        broker,
        accountNo: normalizeAccountNo(accountNo),
        name: name.trim(),
        branchNo: kb ? branchNo : "",
        traderId: kb ? traderId : "",
        priority: nextPriority,
      },
      servers: candidates.filter((k) => servers.includes(k)),
    });
  };

  return (
    <form
      data-slot="admin-account-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(ACCOUNT_CARD, "flex flex-col gap-2.5")}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={broker}
        aria-label="증권사"
        onValueChange={(v) => {
          if (v === "KB" || v === "KYOBO") {
            setBroker(v);
            setServers([]);
          }
        }}
        className={ADMIN_SEGMENT_ROOT}
      >
        {BROKERS.map((b) => (
          <ToggleGroupItem key={b} value={b} className={ADMIN_SEGMENT_ITEM}>
            {brokerLabel(b)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-2 gap-2">
        <Input
          size="sm"
          aria-label="계좌번호"
          placeholder="계좌번호"
          inputMode="numeric"
          autoComplete="off"
          value={accountNo}
          aria-invalid={noInvalid || undefined}
          onChange={(e) => setAccountNo(e.target.value)}
        />
        <Input
          size="sm"
          aria-label="계좌명"
          placeholder="계좌명"
          autoComplete="off"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {kb && (
          <>
            <Input
              size="sm"
              aria-label="지점"
              placeholder="지점 (5자)"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={branchNo}
              aria-invalid={branchInvalid || undefined}
              onChange={(e) => setBranchNo(e.target.value.trim())}
            />
            <Input
              size="sm"
              aria-label="트레이더"
              placeholder="트레이더 (6자)"
              autoComplete="off"
              maxLength={6}
              value={traderId}
              aria-invalid={traderInvalid || undefined}
              onChange={(e) => setTraderId(e.target.value.trim())}
            />
          </>
        )}
      </div>
      {noInvalid && <p className={ERROR_LINE}>{ACCOUNT_EDITOR_TEXT.accountNoInvalid}</p>}
      {duplicate && (
        <p data-slot="admin-account-dup" className={ERROR_LINE}>
          {ACCOUNT_EDITOR_TEXT.duplicate}
        </p>
      )}
      {branchInvalid && <p className={ERROR_LINE}>{ACCOUNT_EDITOR_TEXT.branchInvalid}</p>}
      {traderInvalid && <p className={ERROR_LINE}>{ACCOUNT_EDITOR_TEXT.traderInvalid}</p>}

      <div className="flex flex-wrap gap-1.5">
        {candidates.map((serverKey) => (
          <label key={serverKey} data-slot="admin-server-toggle" data-server={serverKey} className={SERVER_PILL}>
            <Checkbox
              aria-label={serverKey}
              checked={servers.includes(serverKey)}
              onCheckedChange={(v) =>
                setServers((prev) => (v === true ? [...prev, serverKey] : prev.filter((k) => k !== serverKey)))
              }
            />
            <span>{serverKey}</span>
          </label>
        ))}
      </div>

      {save.error && (
        <p role="alert" className={ERROR_LINE}>
          {save.error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="secondary" onClick={onClose} className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}>
          {ACCOUNT_EDITOR_TEXT.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={!ready} className={cn(ADMIN_BUTTON_PRIMARY, ACCOUNT_BUTTON)}>
          {ACCOUNT_EDITOR_TEXT.submit}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AccountEditor
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountEditorProps {
  dmaUserId: string;
  accounts: readonly AdminAccountView[];
  servers: AdminUsersOverview["servers"];
  /** 쓰기 성공 뒤 목록 재조회. */
  onChanged: () => void;
  /** 마지막 계좌 「제거」 — 시트가 확인 1회 뒤 사용자 삭제로 간다. */
  onRemoveLast: () => void;
  /** 사용자 전체 결과(「다시 반영」) — `id` 가 바뀔 때마다 한 번 반영한다. */
  serverResults?: { id: number; results: readonly AdminServerResult[] } | null;
}

export function AccountEditor({
  dmaUserId,
  accounts,
  servers,
  onChanged,
  onRemoveLast,
  serverResults = null,
}: AccountEditorProps) {
  const [overlay, setOverlay] = useState<Overlay>(() => new Map());
  const [adding, setAdding] = useState(false);
  const [appliedId, setAppliedId] = useState<number | null>(null);
  // 편집 중인 카드(계좌 키) — 한 번에 한 카드(D-01 · UI-SPEC §5).
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // 「다시 반영」 결과 — props 로 온 새 묶음을 렌더 중 한 번 반영한다(React 「props 변화로 state 조정」 패턴).
  if (serverResults && serverResults.id !== appliedId) {
    setAppliedId(serverResults.id);
    setOverlay((prev) => applyServerWideResults(prev, accounts, serverResults.results));
  }

  const onResults = (accountKey: string, results: readonly AdminServerResult[], source?: "edit") =>
    setOverlay((prev) => applyAccountResults(prev, accountKey, results, source));

  const serverKeysOf = (broker: DmaBroker) =>
    servers.filter((s) => s.broker === broker && s.enabled).map((s) => s.key);

  const editable = accounts.filter((a) => a.servers.length > 0);
  // 편집 중인 카드가 목록에서 사라지면(제거 · 재조회) 잠금을 푼다 — 렌더 중 「props 변화로 state 조정」.
  if (editingKey !== null && !editable.some((a) => accountKeyOf(a.broker, a.accountNo) === editingKey)) {
    setEditingKey(null);
  }
  const activeCount = accounts.filter((a) => a.servers.some((s) => s.state === "active")).length;
  const nextPriority = Math.min(999, accounts.reduce((m, a) => Math.max(m, a.priority), 0) + 1);

  // BUSY 줄 — 지금 그려진 실패 칩(결과 덮개가 개요보다 앞선다). 카드 편집 저장 칩(source "edit")은 카드 결과 줄이 이미 말한다 —
  // 두 번 띄우지 않는다(칩 · title 은 그대로 · UI-SPEC §4).
  const shownChips: { serverKey: string; tone: ReflectTone; message: string | null }[] = [];
  for (const a of editable) {
    const k = accountKeyOf(a.broker, a.accountNo);
    const keys = new Set([...a.servers.map((s) => s.serverKey)]);
    for (const slot of overlay.keys()) if (slot.startsWith(`${k}|`)) keys.add(slot.slice(k.length + 1));
    for (const serverKey of keys) {
      const chip = overlay.get(slotKey(k, serverKey)) ?? viewChipOf(a, serverKey);
      if (chip?.source === "edit") continue;
      if (chip) shownChips.push({ serverKey, tone: chip.tone, message: chip.message });
    }
  }

  return (
    <div data-slot="admin-accounts">
      {accounts.map((a) => {
        const k = accountKeyOf(a.broker, a.accountNo);
        if (a.servers.length === 0) return <ServerOnlyAccountRow key={k} account={a} />;
        const isActive = a.servers.some((s) => s.state === "active");
        return (
          <AccountRow
            key={k}
            account={a}
            dmaUserId={dmaUserId}
            candidates={serverKeysOf(a.broker)}
            registry={servers.filter((s) => s.broker === a.broker)}
            overlay={overlay}
            last={isActive && activeCount <= 1}
            editing={editingKey === k}
            editLocked={editingKey !== null && editingKey !== k}
            onEditStart={() => setEditingKey(k)}
            onEditEnd={() => setEditingKey((cur) => (cur === k ? null : cur))}
            onResults={onResults}
            onChanged={onChanged}
            onRemoveLast={onRemoveLast}
          />
        );
      })}

      {adding ? (
        <AccountAddForm
          dmaUserId={dmaUserId}
          existingKeys={new Set(editable.map((a) => accountKeyOf(a.broker, a.accountNo)))}
          serverKeysOf={serverKeysOf}
          nextPriority={nextPriority}
          onResults={onResults}
          onChanged={onChanged}
          onClose={() => setAdding(false)}
        />
      ) : (
        <div className="mt-2.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAdding(true)}
            className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}
          >
            {ACCOUNT_EDITOR_TEXT.add}
          </Button>
        </div>
      )}

      <BusyLines chips={shownChips} />
      <p data-slot="admin-accounts-note" className={NOTE}>
        {ACCOUNT_EDITOR_TEXT.minOneServer} — 마지막 서버는 끌 수 없다. {ACCOUNT_EDITOR_TEXT.lastAccountNote}{" "}
        {ACCOUNT_EDITOR_TEXT.orderServerNote}
      </p>
    </div>
  );
}
