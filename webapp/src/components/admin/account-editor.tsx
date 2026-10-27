"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  findSharedAccountHolders,
  formatManwonFloor,
  formatOrderIp,
  formatOrderMac,
  isValidAccountNoInput,
  normalizeAccountNo,
  normalizeOrderIp,
  normalizeOrderMac,
  parseBudgetManwon,
  parseCostPct,
  ppmToPct,
  REFLECT_LABEL,
  resolveEffectiveOrderServer,
  summarizeAccountCosts,
  summarizeOrderEndpoint,
  validateOrderEndpointInput,
  type AdminAccountInput,
  type AdminAccountView,
  type AdminPutAccountBody,
  type AdminServerResult,
  type AdminUsersOverview,
  type AdminUserView,
  type DmaBroker,
  type OrderEndpointMismatch,
  type OrderEndpointSummary,
  type ReflectTone,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  putDmaAccount,
  removeDmaAccount,
  setAccountBudget,
  setAccountFee,
  setAccountOrderServer,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE, ADMIN_TONE_CLASS, ReflectChip } from "./reflect-chip";
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
 * 「주문자 IP <ip> · MAC <mac>」(87 정규화값을 사람이 읽는 표기로 — D-17 shared `formatOrderIp/Mac` · 판정 · 비교는 정규화값) ·
 * 미설정 「… 미설정(서버 NIC 값)」 · 87 미확인 「… 확인 전」.
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
 * 편집 저장에서 온 결과 칩은 `source: "edit"` 로 표시해 영역 하단 `BusyLines` 에 다시 띄우지 않는다(칩 · title 은 그대로). 단 카드 결과 줄이
 * 지워지면(「취소」 · 다시 「편집」 · 입력 변경) 그 표시를 떼어 `BusyLines` 로 돌려보낸다 — 서버 문구가 화면에서 사라지지 않게(30 WR-04 · 터치 기기는 title 을 못 본다).
 * 이름 저장 성공 뒤 재조회 전의 서버 토글은 새 이름을 싣는다(`editSave.value` — 옛 이름으로 되돌리지 않는다). 저장 **비행 중**에는 싣지 않고
 * (실패하면 확정되지 않은 이름이 토글로 새어 들어간다 — 30 WR-03), 그동안 그 카드의 서버 토글 · 주문 서버 · 「제거」 를 잠근다(입력칸 readOnly 와 같이).
 *
 * **KB 주문자 IP/MAC 편집(Phase 30 30-05 · D-03 · D-04 · D-05 · D-06 · D-07 · D-10 · UI-SPEC §2-3 · §3).** KB 편집 블록은 계좌명 칸 아래
 * 「주문자 IP」 · 「MAC 주소」 2열 칸 + 도움말 한 줄(검증 오류가 보이면 그 자리를 오류 줄이 대신), 교보는 칸 대신 「해당 없음」 한 줄.
 * 초깃값 = 읽기 줄과 같은 출처(유효 주문 서버 87 값의 표시 표기 · D-17). 검증 규칙은 shared `validateOrderEndpointInput` 한 벌(웹에 정규식 없음).
 * 보내는 값은 입력 원문(trim) — 정규화는 「보낼지 · 변경 없음」 비교에만 쓴다(`editSaveBodyOf` · 양쪽 정규화). IP/MAC 은 두 칸이 정규화 비교로 바뀌었거나
 * 등록 서버 간 불일치(D-10 맞추기)일 때만 싣고, 계좌명만 바뀐 저장에는 싣지 않는다(화면 초깃값이 틀려도 87 값을 덮지 않는다).
 * 보낼 것이 없으면 요청 없이 편집을 닫고 「변경 없음」 한 줄(다음 「편집」 때 지움).
 *
 * **공유 계좌 안내(Phase 30 30-09 · D-18 · UI-SPEC Addendum A2).** KB 카드 편집 모드에서 개요(`users` prop)의 다른 DMA 사용자가 같은 증권사 ·
 * 같은 정규화 계좌번호를 이 계좌의 active 등록 서버와 겹치는 서버에 가지고 있으면, 불일치 줄 아래 · 「취소 · 저장」 위에 안내 한 줄
 * 「이 계좌를 함께 쓰는 사용자 {DMA id ' · '} — 주문자 IP · MAC 이 함께 바뀌어요」(`WARN_LINE` · role 없음). 판정은 shared
 * `findSharedAccountHolders` 한 벌 · 개요 데이터만 읽는다(추가 요청 없음). 함께 바꾸는 일은 gh-trade 서버가 op 3 하나로 원자적으로
 * 한다(웹은 이 사용자 PUT 1건만 · 다른 사용자 op 없음). 저장 결과는 기존 결과 줄 그대로 — gh-trade 배포 전 code 7 도 「<서버> 실패:
 * <서버 message 원문>」 이고 code 7 특수 처리 · 문장 대조는 없다(IPMAC-03 · D-12). 전부 ok 면 기존 `onChanged` 개요 재조회가 함께 쓰는
 * 사용자들의 같은 계좌 카드도 새 값으로 그린다. 읽기 카드 · 교보 · `users` 없음 · 함께 쓰는 사용자 0명이면 줄이 없다.
 */

/**
 * 서버 키 뒤 조사 은/는 — 키 끝 숫자의 한자어 읽기(36-UI-SPEC researcher decision 9): 0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 → 「은」,
 * 2 이 · 4 사 · 5 오 · 9 구 → 「는」. 숫자로 끝나지 않으면 「은」.
 */
export function josaEunNeun(serverKey: string): "은" | "는" {
  const last = serverKey.at(-1) ?? "";
  return "2459".includes(last) && last !== "" ? "는" : "은";
}

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
    `${serverKey} 값이 달라요(${m.state === "set" ? `IP ${formatOrderIp(m.orderIp)} · MAC ${formatOrderMac(m.orderMac)}` : "미설정"}) — 편집에서 저장하면 등록 서버가 모두 같아져요`,
  // ── Phase 30 (30-05) 편집칸 — UI-SPEC Copywriting 「그 밖 문구」 정본 ──
  ipLabel: "주문자 IP",
  macLabel: "MAC 주소",
  ipPlaceholder: "10.41.1.124",
  macPlaceholder: "1C:FD:08:7D:97:8E",
  /** D-05 도움말 — 검증 오류가 있으면 이 자리를 오류 줄이 대신한다. */
  ipmacHelp: "같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 IP · MAC 을 적으세요(ipconfig /all).",
  /** D-03 — 교보 계좌 편집 블록의 IP/MAC 칸 자리. */
  kyoboIpmacNa: "교보 계좌는 주문자 IP · MAC 해당 없음",
  ipInvalid: "IP 는 12자리 숫자 또는 10.41.1.124 형식이에요",
  macInvalid: "MAC 은 12자리 16진이에요(1C:FD:08:7D:97:8E)",
  pairInvalid: "IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요",
  /** D-06 — 정규화 비교로 지금 값과 같아 요청을 보내지 않았다(NOTE · 다음 「편집」 때 지움). */
  unchanged: "변경 없음",
  /** D-18 — 편집 모드 공유 계좌 안내(UI-SPEC Addendum A2 정본) · ids = 함께 쓰는 DMA id 오름차순. */
  sharedAccountNote: (ids: readonly string[]) =>
    `이 계좌를 함께 쓰는 사용자 ${ids.join(" · ")} — 주문자 IP · MAC 이 함께 바뀌어요`,
  // ── Phase 36 (36-UI-SPEC 문구 정본 ①) — 예수금 · 수수료 · 매도세 행 ──
  budgetLabel: "예수금",
  budgetUnit: "만원",
  /** KB · 교보 같은 문구(researcher decision 4). */
  costCaption: "예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제",
  /** 예수금이 미설정(0)일 때만 캡션 끝에. */
  costCaptionUnsetSuffix: " · 비우면 미설정",
  /** 결과 칩 — 실패(err) 낱말. 기존 `REFLECT_LABEL.err`(「실패 · BUSY」)는 users.toml 반영 칩 전용이라 따로 둔다. */
  costFailed: "실패",
  feeLabel: "수수료",
  sellTaxLabel: "매도세",
  pctUnit: "%",
  /** 서버 간 예수금 다름(D-03 · 원인 단정 없음) — v = 「500만」 또는 「미설정」. 키와 조사 사이 한 칸(목업). */
  costMismatchBudget: (serverKey: string, v: string) =>
    `${serverKey} ${josaEunNeun(serverKey)} ${v} — 저장하면 등록 서버가 모두 같아져요`,
  /** 서버 간 (수수료, 매도세) 다름 — 예수금 줄과 따로(둘 다 다르면 두 줄). fee · tax 는 % 문자열. */
  costMismatchFee: (serverKey: string, fee: string, tax: string) =>
    `${serverKey} ${josaEunNeun(serverKey)} ${fee}% · ${tax}% — 저장하면 등록 서버가 모두 같아져요`,
  costBudgetUnset: "미설정",
  costRangeInvalid: "수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요",
  /** 클라 판정으로 요청을 보내지 않았다(값이 서버 값과 같고 불일치 없음) — NOTE 줄 · 칩 「<키> · 변경 없음」. */
  costUnchanged: "변경 없음",
  costBusy: "보내는 중",
  /** gh-trade code 1(op 6/7 을 모르는 구 서버 · 범위 밖) — 칩 title 「서버 미지원 · <message>」 · 줄 아래 문형. */
  costUnsupported: "서버 미지원",
  costUnsupportedLine: (serverKey: string, message: string) =>
    `${serverKey} 실패: 서버 미지원${message ? ` · ${message}` : ""} — 서버 업데이트 뒤 다시 저장`,
} as const;

/** shared 검증 오류 종류 → 편집 블록 오류 줄 문구(규칙은 shared 한 벌 · 문구만 여기). */
const ORDER_ENDPOINT_ERROR_TEXT = {
  "ip-format": ACCOUNT_EDITOR_TEXT.ipInvalid,
  "mac-format": ACCOUNT_EDITOR_TEXT.macInvalid,
  pair: ACCOUNT_EDITOR_TEXT.pairInvalid,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 결과 → 칩
// ─────────────────────────────────────────────────────────────────────────────

/** 칩 1개의 그림 — 톤 · 서버 message(err · 사유 있는 warn) · `REFLECT_LABEL` 밖 낱말(있으면). */
export interface ChipView {
  tone: ReflectTone;
  message: string | null;
  label: string | null;
  /**
   * 카드 편집 저장에서 온 칩 — 그 실패는 카드 결과 줄이 말하므로 영역 하단 `BusyLines` 에 다시 띄우지 않는다(Phase 30 UI-SPEC §4).
   * 카드 결과 줄이 지워지는 순간(「취소」 · 다시 「편집」 · 입력 변경) 이 표시를 뗀다(`releaseEditChips` · 30 WR-04) — 그 뒤엔 `BusyLines` 가 말한다.
   */
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

/**
 * 계좌 1개의 편집 저장 칩에서 `source` 표시를 뗀다(30 WR-04) — 카드 결과 줄이 지워진 뒤에는 `BusyLines` 가 그 문구를 다시 말한다.
 * 뗄 것이 없으면 `prev` 그대로(입력마다 불려도 부모가 다시 그리지 않는다).
 */
function releaseEditChips(prev: Overlay, accountKey: string): Overlay {
  const prefix = `${accountKey}|`;
  let next: Map<string, ChipView> | null = null;
  for (const [slot, chip] of prev) {
    if (chip.source !== "edit" || !slot.startsWith(prefix)) continue;
    next ??= new Map(prev);
    next.set(slot, { tone: chip.tone, message: chip.message, label: chip.label });
  }
  return next ?? prev;
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
      {/* 계좌번호는 줄지 않는다 — 말줄임은 계좌명만(UI-SPEC E2). 30-06 폰 390 에서 40자 이름이 계좌번호를 「11…」 로 잘랐다. */}
      <span className="shrink-0 tabular-nums">{account.accountNo}</span>
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

/** KB 주문자 IP/MAC 읽기 줄(D-09 · UI-SPEC §1-3) — summary 의 87 정규화값을 사람이 읽는 표기로(D-17 · shared `formatOrderIp/Mac` · 판정 · 비교는 정규화값). */
function OrderEndpointLine({ summary }: { summary: OrderEndpointSummary }) {
  const T = ACCOUNT_EDITOR_TEXT;
  return (
    <p data-slot="admin-account-ipmac" className={IPMAC_LINE}>
      {summary.state === "set" ? (
        <>
          {`${T.ipmacLabel} `}
          <b className={IPMAC_VALUE}>{formatOrderIp(summary.orderIp)}</b>
          {` · ${T.ipmacMacLabel} `}
          <b className={IPMAC_VALUE}>{formatOrderMac(summary.orderMac)}</b>
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
// 예수금 · 수수료 · 매도세 행 (Phase 36 · D-00 ① · D-01 ~ D-07 · 36-UI-SPEC ①)
// ─────────────────────────────────────────────────────────────────────────────

/** ko-KR 천단위 콤마. */
const KO_NUM = new Intl.NumberFormat("ko-KR");

/** 예수금 입력 — 숫자만 남기고(최대 9자리 · 999,999,999만원) 콤마로 다시 쓴다(수동주문 폼 `formatDigits` 결). */
function formatBudgetInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
  return digits === "" ? "" : KO_NUM.format(Number(digits));
}

/** 원 → 칸 표시(만원 내림 콤마) — 0 은 빈 칸(입력 안내 글자가 대신 말한다). */
function budgetFieldText(krw: number): string {
  const manwon = Math.floor(Math.max(0, krw) / 10_000);
  return manwon === 0 ? "" : KO_NUM.format(manwon);
}

/** ppm → 칸 표시(% 끝 0 없음) — 0 은 빈 칸. */
function pctFieldText(ppm: number): string {
  return ppm === 0 ? "" : ppmToPct(ppm);
}

/** 비용 행 칩 1개 — 톤 · 보이는 글자 · title(서버 message 원문) · 보내는 중(스피너). */
interface CostChip {
  server: string;
  tone: ReflectTone;
  text: string;
  title: string | null;
  busy?: boolean;
}

/**
 * 응답 결과 1개 → 비용 행 칩(36-UI-SPEC ① 칩 표). ok = 키만 · failed = 「키 · 실패」(code 1 이면 title 「서버 미지원 · <message>」) ·
 * timeout · offline 은 기존 `RESULT_CHIP` 낱말 · skipped = 「키 · 미반영」. code 0 은 message 가 무엇이든 ok(D-06 — 문장 대조 없음).
 */
function costChipOf(r: AdminServerResult): CostChip {
  const chip = chipOfResult(r);
  const T = ACCOUNT_EDITOR_TEXT;
  const label = r.outcome === "failed" ? T.costFailed : chip.label;
  const text = chip.tone === "ok" ? r.server : `${r.server} · ${label ?? REFLECT_LABEL[chip.tone]}`;
  const unsupported = r.outcome === "failed" && r.code === 1;
  const title = unsupported ? (r.message ? `${T.costUnsupported} · ${r.message}` : T.costUnsupported) : chip.message;
  return { server: r.server, tone: chip.tone, text, title };
}

/** 비용 저장 결과 줄 1개 — err(role=alert) 실패 · warn 미반영. */
interface CostLine {
  server: string;
  tone: "err" | "warn";
  text: string;
}

/**
 * ok 가 아닌 결과 → 서버마다 한 줄(36-UI-SPEC ① 줄 표). code 1 = 「<키> 실패: 서버 미지원 · <message> — 서버 업데이트 뒤 다시 저장」 ·
 * 그 밖 err = 기존 `editFailedLine` · warn = 기존 `skippedLineText`(사유 없으면 「서버 연결 안 됨」). 분기는 `code === 1` 만.
 */
function costResultLines(results: readonly AdminServerResult[]): CostLine[] {
  const T = ACCOUNT_EDITOR_TEXT;
  const lines: CostLine[] = [];
  for (const r of results) {
    const chip = chipOfResult(r);
    if (r.outcome === "failed" && r.code === 1) {
      lines.push({ server: r.server, tone: "err", text: T.costUnsupportedLine(r.server, r.message ?? "") });
    } else if (chip.tone === "err") {
      const word = r.outcome === "failed" ? T.costFailed : chipStatusText(chip);
      lines.push({ server: r.server, tone: "err", text: T.editFailedLine(r.server, r.message || word) });
    } else if (chip.tone === "warn") {
      lines.push({ server: r.server, tone: "warn", text: skippedLineText(r.server, r.message || "서버 연결 안 됨") });
    }
  }
  return lines;
}

/** 칩 하나 — `ReflectChip` 과 같은 틀(톤 · `title`) + 보내는 중이면 9px CSS 스피너(글자와 4px · 움직임 줄이기면 정지). */
function CostChipView({ chip }: { chip: CostChip }) {
  return (
    <span
      data-slot="reflect-chip"
      data-tone={chip.tone}
      data-server={chip.server}
      title={chip.title ?? undefined}
      className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS[chip.tone], chip.busy && "inline-flex items-center gap-1")}
    >
      {chip.busy && (
        <span
          data-slot="admin-cost-spinner"
          aria-hidden="true"
          className="inline-block size-[9px] shrink-0 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      {chip.text}
    </span>
  );
}

/**
 * 칸 하나의 초안 — 포커스/편집 중이면 개요 재조회가 칸을 덮지 않는다(researcher decision 6).
 * `draft` null = 표시값을 따른다 · 포커스를 받으면 그 순간 표시값을 붙잡는다 · `edited` = 이번 포커스 뒤 고침(이탈 저장 조건).
 * `hold` = 마지막 시도가 전부 반영되지 않음(실패 · 미반영 · 범위 밖) — 입력값을 유지한다(상태 6종 「입력값 유지」).
 */
function useCostDraft(display: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [hold, setHold] = useState(false);
  const focused = useRef(false);
  return {
    text: draft ?? display,
    edited,
    onFocus: () => {
      focused.current = true;
      setEdited(false);
      setDraft((d) => d ?? display);
    },
    onChange: (v: string) => {
      setDraft(v);
      setEdited(true);
    },
    /** 이탈 — 고친 것이 없고 붙잡을 것도 없으면 표시값을 따른다(고쳤으면 호출자가 저장 시도). */
    onBlur: (willSave: boolean) => {
      focused.current = false;
      if (!willSave && !hold) setDraft(null);
    },
    /** 보냄 — 결과가 올 때까지 입력값을 그대로 둔다 · 이탈이 다시 보내지 않게. */
    markSent: () => setEdited(false),
    /** 시도가 끝남(결과 · 변경 없음 · 범위 밖). `keep` = 입력값 유지. */
    settle: (keep: boolean) => {
      setEdited(false);
      setHold(keep);
      if (!keep && !focused.current) setDraft(null);
    },
  };
}

interface AccountCostRowProps {
  account: AdminAccountView;
  dmaUserId: string;
  /** 이 계좌 증권사의 레지스트리(레지스트리 순) — 표시값 출처(유효 주문 서버) 판정. */
  registry: AdminUsersOverview["servers"];
  /** 카드 편집 저장 비행 중 — 세 칸 readOnly(30 WR-03 결 · researcher decision 6). */
  editSaving: boolean;
  onChanged: () => void;
}

type CostOp = "budget" | "fee";

/**
 * 계좌 카드 「예수금 · 수수료 · 매도세」 행(36-UI-SPEC ①). 편집 모드와 무관하게 늘 보인다 · 87 전용 흐린 줄에는 없다.
 *
 * - 표시값 · 출처 · 불일치는 shared `summarizeAccountCosts` 한 벌(67 live 우선 · 87 폴백 — 개요 `costs` · 출처 = 유효 주문 서버).
 *   불일치는 다른 서버마다 경고 한 줄(예수금 · 비용률 따로 · 원인 단정 없음 · D-03). 87 을 모르는 서버는 판정 밖 · 「확인 전」 칩.
 * - 저장은 칸마다 즉시(D-02 · 저장 버튼 없음) — 예수금 = op 6(`PUT …/budget`) · 수수료 · 매도세 = op 7(`PUT …/fee` 두 값 함께).
 *   Enter = 저장 시도 · 포커스 이탈 = 고쳤을 때만 · 값이 서버 값과 같고 불일치가 없으면 요청 없이 「변경 없음」 · 범위 밖 비용률은
 *   보내지 않고 `aria-invalid` + 범위 줄. 비행 중엔 그 op 칸만 readOnly · 카드 편집 저장 비행 중엔 세 칸 모두.
 * - 결과는 등록 서버마다 칩 1개(D-06 · 칩 자리 1벌 = 가장 최근에 끝난 저장) · 실패/미반영 줄은 op 별 · 그 op 칸을 다시 고치면 지운다.
 *   users.toml 반영 칩(서버 알약)은 바꾸지 않는다(D-04). 토스트 · alert · 확인창 없음.
 */
function AccountCostRow({ account, dmaUserId, registry, editSaving, onChanged }: AccountCostRowProps) {
  const T = ACCOUNT_EDITOR_TEXT;
  const budgetId = useId();
  const feeId = useId();
  const taxId = useId();
  const summary = summarizeAccountCosts({ account, registry });
  const known = summary.state === "known";
  const budgetMismatched = summary.budgetMismatches.length > 0;
  const feeMismatched = summary.feeMismatches.length > 0;

  // 칩 자리 1벌 — 가장 최근에 끝난 저장(결과 · 변경 없음)의 칩(researcher decision 7). null = 쉬는 상태.
  const [lastChips, setLastChips] = useState<CostChip[] | null>(null);
  const [lines, setLines] = useState<Record<CostOp, CostLine[]>>({ budget: [], fee: [] });
  const [unchanged, setUnchanged] = useState<CostOp | null>(null);
  const [invalid, setInvalid] = useState({ fee: false, tax: false });

  // 활성 등록 서버(레지스트리 순) — 쉬는 · 보내는 중 · 변경 없음 칩의 서버 목록.
  const order = registry.map((s) => s.key);
  const activeKeys = account.servers.filter((s) => s.state === "active").map((s) => s.serverKey);
  const active = [...order.filter((k) => activeKeys.includes(k)), ...activeKeys.filter((k) => !order.includes(k))];

  const finish = (op: CostOp, results: readonly AdminServerResult[]) => {
    setLastChips(results.map(costChipOf));
    setLines((prev) => ({ ...prev, [op]: costResultLines(results) }));
    return results.some((r) => r.outcome !== "ok");
  };

  const budget = useFieldSave<number>(
    (krw) => setAccountBudget(dmaUserId, account.broker, account.accountNo, krw),
    {
      releaseOn: account,
      onSuccess: (_v, res) => {
        budgetField.settle(finish("budget", res?.results ?? []));
        onChanged();
      },
    },
  );
  const cost = useFieldSave<{ feePpm: number; sellTaxPpm: number }>(
    (v) => setAccountFee(dmaUserId, account.broker, account.accountNo, v.feePpm, v.sellTaxPpm),
    {
      releaseOn: account,
      onSuccess: (_v, res) => {
        const keep = finish("fee", res?.results ?? []);
        feeField.settle(keep);
        taxField.settle(keep);
        onChanged();
      },
    },
  );

  // 표시값 — 저장이 쥔 의도 값(재조회 전) ?? 개요 값. 모르면(확인 전) 빈 칸 + 「—」.
  const budgetKnown = known || budget.value !== undefined;
  const feeKnown = known || cost.value !== undefined;
  const shownBudgetKrw = budget.value ?? summary.budgetKrw;
  const budgetField = useCostDraft(budgetKnown ? budgetFieldText(shownBudgetKrw) : "");
  const feeField = useCostDraft(feeKnown ? pctFieldText(cost.value?.feePpm ?? summary.feePpm) : "");
  const taxField = useCostDraft(feeKnown ? pctFieldText(cost.value?.sellTaxPpm ?? summary.sellTaxPpm) : "");

  const budgetBusy = budget.state === "saving";
  const feeBusy = cost.state === "saving";
  const budgetLocked = editSaving || budgetBusy;
  const feeLocked = editSaving || feeBusy;

  const markUnchanged = (op: CostOp) => {
    setUnchanged(op);
    setLastChips(active.map((k) => ({ server: k, tone: "only", text: `${k} · ${T.costUnchanged}`, title: null })));
  };

  const saveBudget = () => {
    if (budgetLocked) return;
    const parsed = parseBudgetManwon(budgetField.text);
    if (!parsed.ok) {
      budgetField.settle(true);
      return;
    }
    setUnchanged((u) => (u === "budget" ? null : u));
    // 서버 값과 같고 등록 서버 간 불일치가 없으면 요청 없이 「변경 없음」(불일치면 같은 값이어도 보낸다 — 맞추기).
    if (known && parsed.krw === summary.budgetKrw && !budgetMismatched) {
      markUnchanged("budget");
      budgetField.settle(false);
      return;
    }
    setLines((prev) => ({ ...prev, budget: [] }));
    budgetField.markSent();
    budget.run(parsed.krw);
  };

  const saveFee = () => {
    if (feeLocked) return;
    const fee = parseCostPct(feeField.text);
    const tax = parseCostPct(taxField.text);
    if (!fee.ok || !tax.ok) {
      // 범위 밖 · 소수 다섯째 자리 · 숫자 아님 — 보내지 않는다 · 입력값 유지(D-02).
      setInvalid({ fee: !fee.ok, tax: !tax.ok });
      feeField.settle(true);
      taxField.settle(true);
      return;
    }
    setInvalid({ fee: false, tax: false });
    setUnchanged((u) => (u === "fee" ? null : u));
    if (known && fee.ppm === summary.feePpm && tax.ppm === summary.sellTaxPpm && !feeMismatched) {
      markUnchanged("fee");
      feeField.settle(false);
      taxField.settle(false);
      return;
    }
    setLines((prev) => ({ ...prev, fee: [] }));
    feeField.markSent();
    taxField.markSent();
    cost.run({ feePpm: fee.ppm, sellTaxPpm: tax.ppm });
  };

  /** 칸을 고침 — 그 op 의 「변경 없음」 · 실패/미반영 줄을 지운다(researcher decision 7). */
  const touched = (op: CostOp) => {
    setUnchanged((u) => (u === op ? null : u));
    setLines((prev) => (prev[op].length === 0 ? prev : { ...prev, [op]: [] }));
  };

  const onEnter = (save: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    save();
  };

  const busyChips: CostChip[] = active.map((k) => ({
    server: k,
    tone: "only",
    text: `${k} · ${T.costBusy}`,
    title: null,
    busy: true,
  }));
  const idleChips: CostChip[] = active.map((k) =>
    account.costs?.[k] != null
      ? { server: k, tone: "ok", text: k, title: null }
      : { server: k, tone: "only", text: `${k} · ${T.ipmacUnknown}`, title: null },
  );
  const chips = budgetBusy || feeBusy ? busyChips : (lastChips ?? idleChips);

  const unset = budgetKnown && shownBudgetKrw === 0;
  const fieldBox = "h-9 px-2 text-right font-semibold tabular-nums sm:h-8";
  const label = (field: string, unit: string) => `${account.broker} ${account.accountNo} ${field}(${unit})`;
  const feePlaceholder = feeKnown ? "0" : "—";
  const errorLines = [...lines.budget, ...lines.fee];

  return (
    <div data-slot="admin-account-cost" data-account={account.accountNo}>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] leading-[1.5] text-[var(--muted-fg)]">
        <span data-slot="admin-account-cost-budget" className="flex basis-full items-center gap-1 sm:basis-auto">
          <label htmlFor={budgetId}>{T.budgetLabel}</label>
          <Input
            id={budgetId}
            size="sm"
            inputMode="numeric"
            autoComplete="off"
            aria-label={label(T.budgetLabel, T.budgetUnit)}
            placeholder="—"
            readOnly={budgetLocked}
            className={cn("w-24", fieldBox, budgetBusy && "opacity-50")}
            value={budgetField.text}
            onFocus={budgetField.onFocus}
            onChange={(e) => {
              budgetField.onChange(formatBudgetInput(e.target.value));
              touched("budget");
            }}
            onKeyDown={onEnter(saveBudget)}
            onBlur={() => {
              const willSave = budgetField.edited && !budgetLocked;
              budgetField.onBlur(willSave);
              if (willSave) saveBudget();
            }}
          />
          <span>{T.budgetUnit}</span>
          <span data-slot="admin-account-cost-sep" aria-hidden="true" className="hidden text-[var(--faint)] sm:inline">
            ·
          </span>
        </span>
        <span className="flex items-center gap-1">
          <label htmlFor={feeId}>{T.feeLabel}</label>
          <Input
            id={feeId}
            size="sm"
            inputMode="decimal"
            autoComplete="off"
            aria-label={label(T.feeLabel, T.pctUnit)}
            aria-invalid={invalid.fee || undefined}
            placeholder={feePlaceholder}
            readOnly={feeLocked}
            className={cn("w-16", fieldBox, feeBusy && "opacity-50")}
            value={feeField.text}
            onFocus={feeField.onFocus}
            onChange={(e) => {
              const v = e.target.value;
              feeField.onChange(v);
              touched("fee");
              if (invalid.fee) setInvalid((s) => ({ ...s, fee: !parseCostPct(v).ok }));
            }}
            onKeyDown={onEnter(saveFee)}
            onBlur={() => {
              const willSave = feeField.edited && !feeLocked;
              feeField.onBlur(willSave);
              if (willSave) saveFee();
            }}
          />
          <span>{T.pctUnit}</span>
        </span>
        <span aria-hidden="true" className="text-[var(--faint)]">
          ·
        </span>
        <span className="flex items-center gap-1">
          <label htmlFor={taxId}>{T.sellTaxLabel}</label>
          <Input
            id={taxId}
            size="sm"
            inputMode="decimal"
            autoComplete="off"
            aria-label={label(T.sellTaxLabel, T.pctUnit)}
            aria-invalid={invalid.tax || undefined}
            placeholder={feePlaceholder}
            readOnly={feeLocked}
            className={cn("w-16", fieldBox, feeBusy && "opacity-50")}
            value={taxField.text}
            onFocus={taxField.onFocus}
            onChange={(e) => {
              const v = e.target.value;
              taxField.onChange(v);
              touched("fee");
              if (invalid.tax) setInvalid((s) => ({ ...s, tax: !parseCostPct(v).ok }));
            }}
            onKeyDown={onEnter(saveFee)}
            onBlur={() => {
              const willSave = taxField.edited && !feeLocked;
              taxField.onBlur(willSave);
              if (willSave) saveFee();
            }}
          />
          <span>{T.pctUnit}</span>
        </span>
        <span data-slot="admin-account-cost-chips" className="inline-flex flex-wrap gap-1">
          {chips.map((c) => (
            <CostChipView key={c.server} chip={c} />
          ))}
        </span>
      </div>
      <p data-slot="admin-account-cost-caption" className={NOTE}>
        {T.costCaption}
        {unset ? T.costCaptionUnsetSuffix : null}
      </p>
      {summary.budgetMismatches.map((m) => (
        <p key={`b-${m.serverKey}`} data-slot="admin-account-cost-mismatch" data-server={m.serverKey} className={WARN_LINE}>
          {T.costMismatchBudget(m.serverKey, m.budgetKrw === 0 ? T.costBudgetUnset : formatManwonFloor(m.budgetKrw))}
        </p>
      ))}
      {summary.feeMismatches.map((m) => (
        <p key={`f-${m.serverKey}`} data-slot="admin-account-cost-mismatch" data-server={m.serverKey} className={WARN_LINE}>
          {T.costMismatchFee(m.serverKey, ppmToPct(m.feePpm), ppmToPct(m.sellTaxPpm))}
        </p>
      ))}
      {unchanged !== null && (
        <p data-slot="admin-account-cost-unchanged" className={NOTE}>
          {T.costUnchanged}
        </p>
      )}
      {(invalid.fee || invalid.tax) && (
        <p data-slot="admin-account-cost-invalid" className={EDIT_ERROR_LINE}>
          {T.costRangeInvalid}
        </p>
      )}
      {errorLines.map((l, i) =>
        l.tone === "err" ? (
          <p key={`${i}-${l.server}`} role="alert" data-slot="admin-account-cost-line" data-server={l.server} data-tone="err" className={EDIT_ERROR_LINE}>
            {l.text}
          </p>
        ) : (
          <p key={`${i}-${l.server}`} data-slot="admin-account-cost-line" data-server={l.server} data-tone="warn" className={WARN_LINE}>
            {l.text}
          </p>
        ),
      )}
      {[budget.error, cost.error].map((err, i) =>
        err ? (
          <p key={i} role="alert" data-slot="admin-account-cost-error" className={EDIT_ERROR_LINE}>
            {err}
          </p>
        ) : null,
      )}
    </div>
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
  /** 개요 사용자 전체 — D-18 공유 계좌 안내 판정용(`findSharedAccountHolders`). */
  users: readonly AdminUserView[];
  /** 이 카드가 편집 모드인가(부모 `editingKey` — 한 번에 한 카드 · D-01). */
  editing: boolean;
  /** 다른 카드가 편집 중 — 「편집」 비활성 · title 「다른 계좌 편집 중」. */
  editLocked: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onResults: (accountKey: string, results: readonly AdminServerResult[], source?: "edit") => void;
  /** 카드 결과 줄이 지워짐 — 그 계좌 편집 저장 칩을 `BusyLines` 로 돌려보낸다(30 WR-04). */
  onEditResultsCleared: (accountKey: string) => void;
  onChanged: () => void;
  onRemoveLast: () => void;
}

/**
 * 편집 모드 입력값. `ip` · `mac` 초깃값 = 읽기 줄과 같은 출처(유효 주문 서버 · D-10)의 87 값의 표시 표기(D-17) — 미설정 · 확인 전 · 교보는
 * 빈 문자열. 비교는 양쪽 정규화(`editSaveBodyOf`).
 * 초안은 입력 원문 그대로 쥔다(보낼 때 trim 만 · 정규화는 비교에만 — D-07).
 */
interface EditFields {
  name: string;
  ip: string;
  mac: string;
}

/**
 * 카드 편집 저장 본문(UI-SPEC §3 「보내는 값」 · D-06 · D-07 · D-10) — `null` = 보낼 것 없음(「변경 없음」).
 *
 * - 계좌명은 `trim()` 해서 · 나머지 계좌 필드는 개요 값 · `servers` 는 지금 active 등록 서버 그대로(서버 집합을 바꾸지 않는다).
 * - IP/MAC 은 KB 이고 (두 칸이 정규화 비교로 초깃값과 다름 || 등록 서버 간 불일치) 일 때만 최상위 `orderEndpoint` 로 싣는다.
 *   보내는 값은 입력 원문(trim) — 정규화값을 보내지 않는다(D-07 · gh-trade 가 정규화). 두 칸 비움 = 빈 문자열 둘(미설정으로 되돌리기 · D-04).
 * - 초깃값은 87 값의 표시 표기(D-17) 또는 빈 문자열 — 비교는 양쪽 정규화(표시 표기는 왕복 항등이라 정규화하면 87 값 그대로)여서
 *   「서버 값과 같음」 이다. 정규화가 null 인 값(형식 오류 입력)은 원문으로 비교한다(호출자가 검증 오류면 저장을 막는다).
 * - 「확인 전」(87 미확인 · relay 재시작 · 개요의 relay 조회 실패)에서 연 편집은 초깃값이 빈 칸이라 두 칸을 비운 채 저장하면 「변경 없음」 —
 *   이 상태에서는 「미설정으로 되돌리기」 를 보낼 수 없다(30 IN-06 · 의도된 fail-safe). 실제로는 값이 있을지 모르는 87 을 빈 값으로
 *   덮지 않는다(IPMAC-01 「relay 밖 값을 지우지 않는다」 와 같은 쪽). 값을 적으면 그대로 보낸다 · 비우기는 87 이 확인된 뒤 다시 연다.
 */
function editSaveBodyOf(input: {
  account: AdminAccountView;
  servers: string[];
  initial: EditFields;
  draft: EditFields;
  mismatched: boolean;
}): AdminPutAccountBody | null {
  const { account, servers, initial, draft, mismatched } = input;
  const kb = account.broker === "KB";
  // 정규화하되 실패(null)면 원문 — 초깃값(표시 표기)과 칸 값을 같은 잣대로 비교한다(D-17 · 표시 표기를 87 값처럼 비교하지 않는다).
  const norm = (normalize: (raw: string) => string | null, raw: string) => normalize(raw) ?? raw;
  const ip = draft.ip.trim();
  const mac = draft.mac.trim();
  const endpointChanged =
    kb &&
    (norm(normalizeOrderIp, ip) !== norm(normalizeOrderIp, initial.ip) ||
      norm(normalizeOrderMac, mac) !== norm(normalizeOrderMac, initial.mac));
  const sendEndpoint = kb && (endpointChanged || mismatched);
  const nameChanged = draft.name.trim() !== initial.name.trim();
  if (!nameChanged && !sendEndpoint) return null;
  return {
    account: { ...accountInputOf(account), name: draft.name.trim() },
    servers,
    ...(sendEndpoint ? { orderEndpoint: { orderIp: draft.ip.trim(), orderMac: draft.mac.trim() } } : {}),
  };
}

function AccountRow({
  account,
  dmaUserId,
  candidates,
  registry,
  overlay,
  last,
  users,
  editing,
  editLocked,
  onEditStart,
  onEditEnd,
  onResults,
  onEditResultsCleared,
  onChanged,
  onRemoveLast,
}: AccountRowProps) {
  const T = ACCOUNT_EDITOR_TEXT;
  const key = accountKeyOf(account.broker, account.accountNo);
  const nameId = useId();
  const ipId = useId();
  const macId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // 편집 초깃값 · 초안 — 「편집」 을 누른 순간 고정한다(이후 재조회 props 가 덮지 않는다 · UI-SPEC §5).
  const [draft, setDraft] = useState<{ initial: EditFields; value: EditFields } | null>(null);
  const isEditing = editing && draft !== null;
  // 저장 결과 줄(서버별) · HTTP 오류 줄 표시 — 입력을 고치거나 「취소」 · 다시 열면 지운다(목업 B `delete MSG`).
  const [editLines, setEditLines] = useState<EditResultLine[]>([]);
  const [editErrorShown, setEditErrorShown] = useState(false);
  // 「변경 없음」(D-06) — 요청 없이 편집을 닫은 뒤 읽기 카드에 한 줄. 다음 「편집」 을 열 때 지운다.
  const [editNote, setEditNote] = useState<"unchanged" | null>(null);
  const clearEditResult = () => {
    setEditLines([]);
    setEditErrorShown(false);
    // 30 WR-04 — 카드 결과 줄이 사라지면 편집 저장 칩의 문구는 영역 하단 BusyLines 가 이어 말한다.
    onEditResultsCleared(key);
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
  // 30 WR-03 — `editSave.value` 는 저장을 **시작할 때** 채워진다. 비행 중에는 싣지 않는다(실패하면 확정 안 된 이름이 토글로 커밋된다).
  // 비행 중 토글은 UI 가 잠그지만, 그 전에 대기열에 들어간 토글이 이 사이에 나갈 수 있어 여기서도 막는다.
  const confirmedName = () =>
    editSave.state !== "saving" && editSave.value !== undefined ? editSave.value.account.name : account.name;
  const toggle = useFieldSave<string[]>(
    (servers) =>
      putDmaAccount(dmaUserId, {
        account: { ...accountInputOf(account), name: confirmedName() },
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
    if (editSave.state === "saving") return; // 30 WR-03 — 편집 저장 비행 중엔 같은 계좌 쓰기를 잠근다(컨트롤도 비활성).
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
  const kb = account.broker === "KB";
  // D-09 · D-10 — 표시값 · 출처 · 불일치는 shared 판정 한 벌(relay 라우팅과 같은 유효 주문 서버 규칙).
  const endpoint = kb ? summarizeOrderEndpoint({ account, registry }) : null;
  const mismatched = endpoint !== null && endpoint.mismatches.length > 0;
  // D-18 — 이 계좌를 함께 쓰는 다른 DMA 사용자(서버 겹침 기준 · 개요 데이터만). 편집 블록 안내 줄 한 줄.
  const sharedWith = kb
    ? findSharedAccountHolders({ users, dmaUserId, broker: account.broker, accountNo: account.accountNo, servers: intent }).map(
        (h) => h.dmaUserId,
      )
    : [];

  const editSaving = editSave.state === "saving";
  // 「바뀜」(저장 버튼 기준 · UI-SPEC §3) = 계좌명 trim · IP/MAC 원문(trim) 이 초깃값(표시 표기)과 다름. 다른 표기로 같은 값을 다시 적어도 「바뀜」(누르면 「변경 없음」).
  const endpointEdited =
    kb && draft !== null && (draft.value.ip.trim() !== draft.initial.ip || draft.value.mac.trim() !== draft.initial.mac);
  const editChanged = draft !== null && (draft.value.name.trim() !== draft.initial.name.trim() || endpointEdited);
  // 검증은 shared 한 벌(D-04 · 서버 규칙 그대로 · 우선순위 IP → MAC → 짝). 교보는 IP/MAC 이 없어 검증하지 않는다.
  const validation = kb && draft !== null ? validateOrderEndpointInput({ ip: draft.value.ip, mac: draft.value.mac }) : null;
  // 30 IN-01 — 검증은 IP/MAC 을 실을 수 있는 저장(칸을 고쳤거나 D-10 불일치 맞추기 · `editSaveBodyOf` 의 sendEndpoint 상위 집합)만 막는다.
  // 계좌명만 바꾼 저장은 IP/MAC 을 싣지 않으므로 87 초깃값이 웹 규칙 밖(한쪽만 설정 · 정규화 불가 레거시 값)이어도 막지 않는다.
  // 막을 때는 오류 줄 · 빨간 테두리가 언제나 이유를 보인다 — 이유 없이 「저장」 만 꺼지는 일이 없다. 칸을 고치지 않은 일반 카드는
  // 열자마자 빨갛게 시작하지 않는다(E4 empty) · 불일치 카드는 초깃값이 규칙 밖이면 바로 오류 줄(그대로 저장하면 code 13 이라서).
  const shownInvalid = validation !== null && !validation.ok && (endpointEdited || mismatched) ? validation : null;
  const endpointValid = shownInvalid === null;
  // 「저장」 = 오류 없음 · (바뀜 또는 D-10 불일치 맞추기) · 저장 중 아님.
  const canSave = draft !== null && !editSaving && endpointValid && (editChanged || mismatched);

  const openEdit = () => {
    const set = endpoint?.state === "set";
    const initial: EditFields = {
      name: account.name,
      // D-17 — 칸에는 표시 표기(형식 밖은 원문). 비교는 editSaveBodyOf 가 양쪽 정규화로.
      ip: set ? formatOrderIp(endpoint.orderIp) : "",
      mac: set ? formatOrderMac(endpoint.orderMac) : "",
    };
    setDraft({ initial, value: initial });
    clearEditResult();
    setEditNote(null);
    onEditStart();
  };
  const cancelEdit = () => {
    if (editSaving) return;
    clearEditResult();
    onEditEnd();
  };
  const submitEdit = () => {
    if (draft === null || !canSave) return;
    // servers = 지금 그리는 active 등록 서버(토글 비행 중이면 그 값) — 서버 집합을 바꾸지 않는다.
    const body = editSaveBodyOf({ account, servers: intent, initial: draft.initial, draft: draft.value, mismatched });
    if (body === null) {
      // D-06 — 정규화 비교로 지금 값과 같고 D-10 불일치도 없다: 요청 없이 닫고 「변경 없음」.
      clearEditResult();
      setEditNote("unchanged");
      onEditEnd();
      return;
    }
    setEditLines([]);
    setEditErrorShown(true);
    editSave.run(body);
  };
  const setDraftField = (field: keyof EditFields, v: string) => {
    setDraft((d) => (d ? { ...d, value: { ...d.value, [field]: v } } : d));
    clearEditResult();
  };

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
          // 30 WR-03 — 편집 저장 비행 중엔 잠근다(같은 계좌 쓰기 경합 · 확정 안 된 이름).
          disabled={remove.state === "saving" || editSaving}
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
            onChange={(e) => setDraftField("name", e.target.value)}
          />
          {kb ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label htmlFor={ipId} className="mb-1 block text-[12px] text-[var(--muted-fg)]">
                    {T.ipLabel}
                  </label>
                  <Input
                    id={ipId}
                    size="sm"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={T.ipPlaceholder}
                    readOnly={editSaving}
                    aria-invalid={shownInvalid?.field === "ip" || undefined}
                    className="tabular-nums"
                    value={draft.value.ip}
                    onChange={(e) => setDraftField("ip", e.target.value)}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor={macId} className="mb-1 block text-[12px] text-[var(--muted-fg)]">
                    {T.macLabel}
                  </label>
                  <Input
                    id={macId}
                    size="sm"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="characters"
                    placeholder={T.macPlaceholder}
                    readOnly={editSaving}
                    aria-invalid={shownInvalid?.field === "mac" || undefined}
                    className="tabular-nums"
                    value={draft.value.mac}
                    onChange={(e) => setDraftField("mac", e.target.value)}
                  />
                </div>
              </div>
              {/* 도움말 자리 — 검증 오류가 보이면 오류 줄이 대신한다(둘이 동시에 나오지 않는다). 입력마다 바뀌는 줄이라 role=alert 없음. */}
              {shownInvalid ? (
                <p data-slot="admin-account-edit-invalid" className={EDIT_ERROR_LINE}>
                  {ORDER_ENDPOINT_ERROR_TEXT[shownInvalid.error]}
                </p>
              ) : (
                <p data-slot="admin-account-edit-help" className={NOTE}>
                  {T.ipmacHelp}
                </p>
              )}
            </>
          ) : (
            <p data-slot="admin-account-edit-na" className={NOTE}>
              {T.kyoboIpmacNa}
            </p>
          )}
          {endpoint && <OrderEndpointMismatchLines summary={endpoint} />}
          {sharedWith.length > 0 && (
            <p data-slot="admin-account-edit-shared" className={WARN_LINE}>
              {T.sharedAccountNote(sharedWith)}
            </p>
          )}
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
              disabled={!canSave}
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
        <>
          {endpoint && (
            <>
              <OrderEndpointLine summary={endpoint} />
              <OrderEndpointMismatchLines summary={endpoint} />
            </>
          )}
          {editNote === "unchanged" && (
            <p data-slot="admin-account-edit-result" data-tone="note" className={NOTE}>
              {T.unchanged}
            </p>
          )}
        </>
      )}
      <AccountCostRow
        account={account}
        dmaUserId={dmaUserId}
        registry={registry}
        editSaving={editSaving}
        onChanged={onChanged}
      />
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
                disabled={locked || editSaving}
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
      <OrderServerControl account={account} registry={registry} save={order} disabled={editSaving} />
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
  disabled = false,
}: {
  account: AdminAccountView;
  registry: AdminUsersOverview["servers"];
  save: FieldSave<string | null>;
  /** 카드 편집 저장 비행 중(30 WR-03) — 세그먼트 전체를 잠근다. */
  disabled?: boolean;
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
          disabled={disabled}
          onValueChange={(v) => {
            // 켜진 칸을 다시 누르면 Radix 가 "" 를 준다 — 해제는 없다(늘 하나).
            if (v === "" || disabled) return;
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
  /** 개요 사용자 전체(`AdminUsersOverview.users`) — D-18 공유 계좌 안내 판정용 · 없으면 안내 없음. */
  users?: readonly AdminUserView[];
}

/** `users` 기본값 — 렌더마다 새 배열을 만들지 않는다. */
const NO_USERS: readonly AdminUserView[] = [];

export function AccountEditor({
  dmaUserId,
  accounts,
  servers,
  onChanged,
  onRemoveLast,
  serverResults = null,
  users = NO_USERS,
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
  const onEditResultsCleared = (accountKey: string) => setOverlay((prev) => releaseEditChips(prev, accountKey));

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
  // 두 번 띄우지 않는다(칩 · title 은 그대로 · UI-SPEC §4). 카드 결과 줄이 지워지면 표시가 떨어져 여기로 돌아온다(30 WR-04).
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
            users={users}
            editing={editingKey === k}
            editLocked={editingKey !== null && editingKey !== k}
            onEditStart={() => setEditingKey(k)}
            onEditEnd={() => setEditingKey((cur) => (cur === k ? null : cur))}
            onResults={onResults}
            onEditResultsCleared={onEditResultsCleared}
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
