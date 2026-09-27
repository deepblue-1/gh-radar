#!/usr/bin/env node
/*
 * D-14 — 옛 서버 `lc.snap` 에서 「감시대상 = 매수잔량」(`buyWatchSide === "1"`) 전략을 뽑는다.
 * 보고 전용 · 읽기 전용 · 제품 코드 아님.
 *
 * 왜: 새 gh-trade 서버(24-12 재기동 뒤)는 에코 · 열거(64) · 상태 파일 어디에도 `buy_watch_side` 를
 *     싣지 않는다(24-RESEARCH F-3). 옛 「매수잔량 기준」 전략은 새 서버에서 선매수로 읽히므로
 *     (gh-trade D-24), 사용자가 재기동 **전에** 목록을 받아 두고 재기동 뒤 직접 다시 설정한다.
 *     이 목록은 지금 가동 중인 옛 relay + 옛 서버가 내려주는 `lc.snap` 에서만 얻을 수 있다.
 *
 * 읽기 전용 근거: 네트워크 모듈(ws · net · http · https)을 require 하지 않는다. 입력은 표준입력
 *     JSON 뿐이고 파일도 쓰지 않는다 — relay · 게이트웨이에 어떤 프레임(lc.set · lc.arm · sub ·
 *     auth)도 보낼 경로가 없다. 인증 토큰은 받지도 다루지도 않는다 — 브라우저가 이미 받은 프레임을
 *     DevTools 에서 복사해 붙여 넣을 뿐이다.
 * 계좌: 끝 4자리만 남기고 앞은 같은 길이의 `*` 다. 출력 직전에 원문 계좌가 섞였는지 한 번 더 보고,
 *     섞였으면 아무것도 출력하지 않고 종료 코드 2 로 끝낸다(T-24-07).
 *
 * 사용법 (저장소 루트에서):
 *   pbpaste | node .planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs
 *   node .planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs --self-test
 *
 * 입력: DevTools Network(WS) → Messages 의 `{"t":"lc.snap",…}` 한 건 「Copy message」(한 줄 JSON).
 *     여러 프레임을 줄바꿈으로 이어 붙였거나 프레임 배열이면 `t === "lc.snap"` 인 마지막 것을 쓴다.
 * 출력: stdout = 결과 · stderr = 오류/경고 사유. 오류는 종료 코드 2.
 *     `process.exit` 을 부르지 않고 `exitCode` 만 세운다 — 파이프 stdout 이 다 쓰이기 전에 끊지
 *     않는다(scripts/smoke-relay.sh INV-9 의 「쓰기 완료 전 종료 금지」 규율).
 *
 * 폐기 시점: gh-trade 가 `buy_watch_side` 를 봉인(24-12 재기동)한 뒤에는 옛 `lc.snap` 이 더 없으므로
 *     이 파일은 의미가 없다.
 */
"use strict";

const fs = require("node:fs");

const NOT_LC_SNAP =
  "lc.snap 프레임이 아닙니다 — DevTools WS 메시지에서 lc.snap 한 건을 복사해 주세요";

/** 사용자에게 사유 한 줄로 보여 줄 입력 오류. 메시지에 입력 원문을 싣지 않는다. */
class AuditInputError extends Error {}

/** 끝 4자리만 남기고 앞은 같은 길이의 `*` — 4자리 이하면 전부 `*`. */
function maskAccount(accountNo) {
  return String(accountNo); // RED: 아직 마스킹하지 않는다
}

/** 표준입력 원문 → `t === "lc.snap"` 인 마지막 프레임. 못 찾으면 AuditInputError. */
function parseInput(text) {
  return JSON.parse(text); // RED: 여러 줄 · 배열 · 거부 경로 없음
}

/** `lc.snap` 프레임 → 매수잔량 기준(`buyWatchSide === "1"`) 목록과 총 건수. */
function auditLcSnap(frame) {
  return { total: 0, matches: [], missingSide: 0 }; // RED: 아직 거르지 않는다
}

/** 감사 결과 → stdout 본문(한국어). */
function formatAudit(result) {
  return "";
}

/** 출력 본문에 원문 계좌(5자 이상)가 섞였으면 AuditInputError. */
function assertNoRawAccount(text, frame) {}

function selfTest() {
  const { test } = require("node:test");
  const assert = require("node:assert/strict");

  // 가짜 계좌 `1234567801` 결 — 실계좌가 아니다.
  const SAMPLE = {
    t: "lc.snap",
    items: [
      {
        key: "KR7005930003:1234567801:KRX",
        isin: "KR7005930003",
        accountNo: "1234567801",
        exchange: "KRX",
        name: "삼성전자",
        buyWatchSide: "1",
        buyEnabled: true,
        sellEnabled: false,
      },
      {
        key: "KR7000660001:1234567801:NXT",
        isin: "KR7000660001",
        accountNo: "1234567801",
        exchange: "NXT",
        buyWatchSide: "1",
        buyEnabled: false,
        sellEnabled: true,
      },
      {
        key: "KR7035420009:1234567801:KRX",
        isin: "KR7035420009",
        accountNo: "1234567801",
        exchange: "KRX",
        name: "NAVER",
        buyWatchSide: "0",
        buyEnabled: true,
        sellEnabled: true,
      },
    ],
  };

  const sampleOut = formatAudit(auditLcSnap(SAMPLE));
  process.stdout.write(sampleOut);

  test('표본 3건 중 buyWatchSide "1" 2건만 고른다', () => {
    const r = auditLcSnap(SAMPLE);
    assert.equal(r.total, 3);
    assert.equal(r.matches.length, 2);
    assert.deepEqual(
      r.matches.map((m) => m.isin),
      ["KR7005930003", "KR7000660001"],
    );
    assert.ok(sampleOut.startsWith("옛 서버 lc.snap — 총 3건 · 매수잔량 기준 2건\n"));
  });

  test("계좌는 끝 4자리만 — 원문 계좌가 출력에 없다", () => {
    assert.equal(maskAccount("1234567801"), "******7801");
    assert.ok(!sampleOut.includes("1234567801"));
    assert.ok(sampleOut.includes("******7801"));
  });

  test("4자리 이하 계좌는 전부 *", () => {
    assert.equal(maskAccount("7801"), "****");
    assert.equal(maskAccount("12"), "**");
    assert.equal(maskAccount(""), "");
  });

  test("name 이 없으면 ISIN 을 라벨로 · 무장 여부를 ON/OFF 로 적는다", () => {
    const lines = sampleOut.trimEnd().split("\n");
    assert.equal(lines[1], "삼성전자 · KR7005930003 · KRX · ******7801 · 매수 ON · 매도 OFF");
    assert.equal(lines[2], "KR7000660001 · KR7000660001 · NXT · ******7801 · 매수 OFF · 매도 ON");
  });

  test("빈 items 는 총 0건 · 매수잔량 기준 0건", () => {
    const out = formatAudit(auditLcSnap(parseInput('{"t":"lc.snap","items":[]}')));
    assert.equal(out, "옛 서버 lc.snap — 총 0건 · 매수잔량 기준 0건\n매수잔량 기준 전략이 없습니다\n");
  });

  test('여러 줄 입력은 t === "lc.snap" 인 마지막 줄을 쓴다', () => {
    const text = [
      '{"t":"state","s":"ready"}',
      JSON.stringify({ t: "lc.snap", items: [] }),
      JSON.stringify(SAMPLE),
      '{"t":"vi.list","items":[]}',
      "",
    ].join("\n");
    assert.equal(parseInput(text).items.length, 3);
    assert.equal(parseInput(JSON.stringify([SAMPLE, { t: "vi.list" }])).items.length, 3);
  });

  test("lc.snap 이 아니면 거부한다", () => {
    for (const bad of ['{"t":"vi.snap"}', "[]", "42", "not json", '{"t":"lc.snap"}']) {
      assert.throws(() => parseInput(bad), { name: "Error", message: NOT_LC_SNAP });
    }
  });

  test("출력에 원문 계좌가 섞이면 거부한다", () => {
    assert.throws(() => assertNoRawAccount("x 1234567801 y", SAMPLE), AuditInputError);
    assert.doesNotThrow(() => assertNoRawAccount(sampleOut, SAMPLE));
  });

  test('buyWatchSide 가 없는 항목 수를 센다 (옛 스냅샷 판별)', () => {
    const r = auditLcSnap({ t: "lc.snap", items: [{ isin: "KR7005930003", accountNo: "1234567801" }] });
    assert.equal(r.missingSide, 1);
    assert.equal(r.matches.length, 0);
  });
}

function main(argv) {
  if (argv.includes("--self-test")) {
    selfTest();
    return;
  }
  if (process.stdin.isTTY) {
    throw new AuditInputError(
      "표준입력이 비었습니다 — pbpaste | node .planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs",
    );
  }
  const frame = parseInput(fs.readFileSync(0, "utf8"));
  const result = auditLcSnap(frame);
  const out = formatAudit(result);
  assertNoRawAccount(out, frame);
  if (result.missingSide > 0) {
    process.stderr.write(
      `경고: buyWatchSide 가 없는 항목 ${result.missingSide}건 — 옛 relay·옛 서버 스냅샷이 아니면 이 목록은 판정할 수 없습니다\n`,
    );
  }
  process.stdout.write(out);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    // 입력 오류가 아닌 예외는 이름만 적는다 — 메시지에 입력 원문(계좌)이 섞일 수 있다.
    const why = err instanceof AuditInputError ? err.message : `예기치 못한 오류 (${err && err.name})`;
    process.stderr.write(`${why}\n`);
    process.exitCode = 2;
  }
}

module.exports = { maskAccount, parseInput, auditLcSnap, formatAudit, assertNoRawAccount };
