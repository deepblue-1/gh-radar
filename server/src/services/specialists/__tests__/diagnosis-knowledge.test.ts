import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { makeEndTurnFinalMessage, makeStreamMock } from "../../__tests__/anthropic-mock";

/**
 * Phase 39 (39-08) — 진단 전문가 지식 프롬프트. 원문 문자열 · 요청 system 블록 연결.
 * Opus 스트림은 `../anthropic-client` mock(실 API 0) — end_turn 1회만, 첫 스트림 호출 인자만 본다.
 */

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));

vi.mock("../anthropic-client", () => ({
  getChatAnthropicClient: () => ({ messages: { stream: streamMock } }),
  __resetChatClientForTests: () => {},
}));

import { consultDiagnosisSpecialist } from "../diagnosis/diagnosis-specialist";
import { DIAGNOSIS_KNOWLEDGE_SOURCE, DIAGNOSIS_SYSTEM_PROMPT } from "../diagnosis/diagnosis-knowledge";
import { MARKET_LEGEND } from "../diagnosis/diagnosis-market";

/**
 * gh-trade `docs/strategy/limit-chaser.md` §0-2 선매수 판정 표 9행의 로그 조건명 열 — 원문에서 복사(백틱 안 문자열).
 * `[OrderReason, OrderReasonName]` 순서.
 */
const PRE_BUY_CONDITIONS: ReadonlyArray<readonly [string, string]> = [
  ["BuyAskPriceBreak", "PreBuy B6Buy5 가격돌파(매도1호가>감시가)"],
  ["BuyBidAtWatch", "PreBuy B6Buy4 상한가도달(매수1호가==감시가)"],
  ["BuyAskQtyThin", "PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)"],
  ["BuyTradeQty", "PreBuy A3 체결수량(체결가>=감시가 && 체결수량>=최소)"],
  ["BuyBurstBuyQty", "PreBuy A3 버스트매수누적(체결가>=감시가 && 누적>=최소)"],
  ["BuyUpperLimitBid", "PreBuy A3Buy4 상한가안착(A3 매수1호가==상한가)"],
  ["BuySweepTick", "PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)"],
  ["BuySweepBurstRate", "PreBuy A3 버스트횟수+상승률(횟수>=최소 && 상승률>=최소)"],
  ["BuyRecalcAskThin", "PreBuy A3 차감재평가(매도1잔량-체결수량<=감시수량)"],
];

describe("DIAGNOSIS_SYSTEM_PROMPT — 시험 문항 ①·② 지식(Task 1)", () => {
  it("판정 근거 원문(스윕 조건명 · BuySweepTick · E 행 · b_ · VI 코드 · 시세 없음 · 상태전이 없음)을 담는다", () => {
    for (const s of [
      "PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)",
      "BuySweepTick",
      "E. bs 가 '1'/'2' 아님",
      "b_",
      "50·51·52·54",
      "시세 전문은 받지 못해 주문로그 기준으로 판단",
      "상태전이 기록 없음(아직 미적재)",
    ]) {
      expect(DIAGNOSIS_SYSTEM_PROMPT).toContain(s);
    }
  });

  it("선매수 판정 표 9행의 로그 조건명이 원문과 글자 그대로 같다(`토큰` — `문자열` 꼴 · 순서 유지)", () => {
    let from = 0;
    PRE_BUY_CONDITIONS.forEach(([token, name], i) => {
      const cell = `\`${token}\` — \`${name}\``;
      const at = DIAGNOSIS_SYSTEM_PROMPT.indexOf(cell, from);
      expect(at, `${i + 1}행 ${token}`).toBeGreaterThanOrEqual(0);
      expect(DIAGNOSIS_SYSTEM_PROMPT).toContain(`| ${i + 1} | `);
      from = at + cell.length;
    });
  });

  it("해석 규칙 원문 — F1 · F2 · 묶기 정본 · D-06 네 문장 · 시세 범례 · 동시호가 세션 코드 · 시계 경고", () => {
    for (const s of [
      "msg_seq 순서에서 B6 와 B6 사이에 붙은 A3 조각 묶음이 주문 하나다",
      "**묶음의 마지막이 아닌 조각은 전부 0/0**(매도1·매수1 = 0). 마지막 조각은 호가가 실린다.",
      "**정본: msg_seq 순서에서 B6 사이의 A3 묶음 = 주문 하나.**",
      "「A3 msg_seq 가 바로 앞 A3 + 1 이면 같은 주문, 1 넘게 벌어지면 경계」",
      "| E. bs 가 '1'/'2' 아님 | 단일가, 제외 | — |",
      "단일가 체결 bs 공백 `' '` = 선매수 A3 판정·누적 제외.",
      "0/0 조각 = 한 주문의 마지막 아닌 조각 · 마지막 조각만 호가가 실린다.",
      "스윕 = 연속 조각이 여러 가격을 훑음.",
      "서버 선매수 A3 판정은 bs `'2'` 만 본다.",
      MARKET_LEGEND,
      "KRX `10·20·30·80` / NXT `20·22·24·26`, VI 코드 `50·51·52·54` 는 뺀다",
      "40 접속",
      "몇 ms 차이로 「발주가 체결보다 먼저」 같은 인과를 단정하지 마세요",
    ]) {
      expect(DIAGNOSIS_SYSTEM_PROMPT).toContain(s);
    }
  });

  it("원천 표기(gh-trade 커밋 · 날짜)가 프롬프트에 있다", () => {
    expect(DIAGNOSIS_KNOWLEDGE_SOURCE).toMatch(/^gh-trade [0-9a-f]{7,} \(\d{4}-\d{2}-\d{2}\)$/);
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain(DIAGNOSIS_KNOWLEDGE_SOURCE);
  });
});

describe("DIAGNOSIS_SYSTEM_PROMPT — Opus 요청 system 블록(Task 1)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    delete process.env.CHAT_DIAGNOSIS_MODEL;
    delete process.env.CHAT_DIAGNOSIS_EFFORT;
    streamMock.mockReset();
  });

  it("첫 스트림 요청 system[0] 이 프롬프트 그대로 + cache_control ephemeral", async () => {
    streamMock.mockImplementation(() =>
      makeStreamMock({ textDeltas: [], finalMessage: { ...makeEndTurnFinalMessage("진단문"), model: "claude-opus-5-5" } }),
    );
    const rpc = vi.fn(async (fn: string) =>
      fn === "incr_api_usage" ? { data: 1, error: null } : { data: null, error: null },
    );
    const supabase = { rpc } as unknown as SupabaseClient;

    const out = await consultDiagnosisSpecialist(supabase, { question: "어제 주문 왜 나갔어?" }, {
      userId: "00000000-0000-4000-8000-000000003908",
    });

    expect(out.text).toBe("진단문");
    expect(streamMock).toHaveBeenCalledTimes(1);
    const params = streamMock.mock.calls[0][0] as {
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
    };
    expect(params.system[0].text).toBe(DIAGNOSIS_SYSTEM_PROMPT);
    expect(params.system[0].cache_control?.type).toBe("ephemeral");
  });
});
