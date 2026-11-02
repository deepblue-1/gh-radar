import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { isDayReady, isLabelReady, kstYmdDaysAgo, listDayObjects, READY_GRACE_DAYS } from "../src/archive";
import { kstNs, makeSynthArchive, type SynthArchive } from "./helpers/synth-archive";

const D = "20261030";

/**
 * 10/30 실측 객체 이름(`gcloud storage ls gs://gh-trade-tick-archive/raw/{krx,nxt}/20261030/` · 2026-11-02 ·
 * RESEARCH Pattern 11 「10/30 시각 집합」) — KRX · NXT 각 24객체 · 00~23시 매시 1개 · `-N` 없음. 두 라벨의 이름 목록이 같다.
 */
const OCT30_NAMES: readonly string[] = [
  "20261030-0000.pcap.zst",
  "20261030-0100.pcap.zst",
  "20261030-0200.pcap.zst",
  "20261030-0300.pcap.zst",
  "20261030-0400.pcap.zst",
  "20261030-0500.pcap.zst",
  "20261030-0600.pcap.zst",
  "20261030-0700.pcap.zst",
  "20261030-0800.pcap.zst",
  "20261030-0900.pcap.zst",
  "20261030-1000.pcap.zst",
  "20261030-1100.pcap.zst",
  "20261030-1200.pcap.zst",
  "20261030-1300.pcap.zst",
  "20261030-1400.pcap.zst",
  "20261030-1500.pcap.zst",
  "20261030-1600.pcap.zst",
  "20261030-1700.pcap.zst",
  "20261030-1800.pcap.zst",
  "20261030-1900.pcap.zst",
  "20261030-2000.pcap.zst",
  "20261030-2100.pcap.zst",
  "20261030-2200.pcap.zst",
  "20261030-2300.pcap.zst",
];
const OCT30_OBJECTS = { krx: OCT30_NAMES, nxt: OCT30_NAMES } as const;

const hhmmOf = (name: string) => name.slice(9, 13);
const without = (names: readonly string[], drop: readonly string[]) =>
  names.filter((n) => !drop.includes(hhmmOf(n))).map(hhmmOf);

let arch: SynthArchive | null = null;
afterEach(() => {
  arch?.cleanup();
  arch = null;
});

function oct30(over: { krx?: string[]; nxt?: string[]; extra?: Parameters<typeof makeSynthArchive>[0]["extra"] } = {}) {
  arch = makeSynthArchive({
    date: D,
    hours: { krx: over.krx ?? OCT30_OBJECTS.krx.map(hhmmOf), nxt: over.nxt ?? OCT30_OBJECTS.nxt.map(hhmmOf) },
    extra: over.extra,
  });
  return arch.root;
}

describe("listDayObjects", () => {
  it("05~20시만 · (HHMM, N) 순 · 다른 날짜 · 다른 이름은 무시", () => {
    const root = oct30({
      krx: ["0400", "0500", "0900", "1300", "2000", "2100"],
      nxt: [],
      extra: [
        { label: "krx", name: `${D}-0900-2.pcap.zst`, firstRecvNs: kstNs(D, "0900", 2000) },
        { label: "krx", name: `${D}-0900-1.pcap.zst`, firstRecvNs: kstNs(D, "0900", 1000) },
      ],
    });
    // 다른 날짜 디렉터리 · 엉뚱한 이름
    mkdirSync(join(root, "krx", "20261031"), { recursive: true });
    writeFileSync(join(root, "krx", "20261031", "20261031-0900.pcap.zst"), "x");
    writeFileSync(join(root, "krx", D, "20261031-1000.pcap.zst"), "x");
    writeFileSync(join(root, "krx", D, `${D}-1000.pcap`), "x");
    writeFileSync(join(root, "krx", D, "README.txt"), "x");

    expect(listDayObjects(root, "krx", D).map((p) => basename(p))).toEqual([
      `${D}-0500.pcap.zst`,
      `${D}-0900.pcap.zst`,
      `${D}-0900-1.pcap.zst`,
      `${D}-0900-2.pcap.zst`,
      `${D}-1300.pcap.zst`,
      `${D}-2000.pcap.zst`,
    ]);
    expect(listDayObjects(root, "nxt", D)).toEqual([]);
  });

  it("같은 HHMM 의 `-N` 은 첫 레코드 수신 시각순(N 순과 다르면 시각이 이긴다)", () => {
    const root = oct30({
      krx: ["0900"],
      nxt: [],
      extra: [
        { label: "krx", name: `${D}-0900-1.pcap.zst`, firstRecvNs: kstNs(D, "0900", 3000) },
        { label: "krx", name: `${D}-0900-2.pcap.zst`, firstRecvNs: kstNs(D, "0900", 600) },
      ],
    });
    expect(listDayObjects(root, "krx", D).map((p) => basename(p))).toEqual([
      `${D}-0900.pcap.zst`,
      `${D}-0900-2.pcap.zst`,
      `${D}-0900-1.pcap.zst`,
    ]);
  });

  it("날짜 디렉터리가 없으면 []", () => {
    const root = mkdtempSync(join(tmpdir(), "tick-empty-"));
    try {
      expect(listDayObjects(root, "krx", D)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("업로드 판정 — isLabelReady · isDayReady (08~20시 매시 존재)", () => {
  it("10/30 실측 24객체 목록(두 라벨) → isLabelReady(krx) · isLabelReady(nxt) · isDayReady 모두 true", () => {
    const root = oct30();
    expect(isLabelReady(root, "krx", D)).toBe(true);
    expect(isLabelReady(root, "nxt", D)).toBe(true);
    expect(isDayReady(root, D)).toBe(true);
  });

  it("같은 목록에서 KRX -1300 하나만 빼면 isLabelReady(krx) false · isDayReady false (nxt 는 true)", () => {
    const root = oct30({ krx: without(OCT30_OBJECTS.krx, ["1300"]) });
    expect(isLabelReady(root, "krx", D)).toBe(false);
    expect(isLabelReady(root, "nxt", D)).toBe(true);
    expect(isDayReady(root, D)).toBe(false);
  });

  it.each(["0800", "0900", "1000", "1100", "1200", "1300", "1400", "1500", "1600", "1700", "1800", "1900", "2000"])(
    "08~20시 중 %s 하나가 빠지면 false",
    (hhmm) => {
      const root = oct30({ nxt: without(OCT30_OBJECTS.nxt, [hhmm]) });
      expect(isLabelReady(root, "nxt", D)).toBe(false);
      expect(isDayReady(root, D)).toBe(false);
    },
  );

  it("-2100~-2300 · -0000~-0700 을 빼도 true(판정 밖 시각)", () => {
    const drop = ["2100", "2200", "2300", "0000", "0100", "0200", "0300", "0400", "0500", "0600", "0700"];
    const root = oct30({ krx: without(OCT30_OBJECTS.krx, drop), nxt: without(OCT30_OBJECTS.nxt, drop) });
    expect(isLabelReady(root, "krx", D)).toBe(true);
    expect(isDayReady(root, D)).toBe(true);
  });

  it("-1300 대신 -1300-1 만 있으면 true(기록기 재기동 접미)", () => {
    const root = oct30({
      krx: without(OCT30_OBJECTS.krx, ["1300"]),
      extra: [{ label: "krx", name: `${D}-1300-1.pcap.zst` }],
    });
    expect(isLabelReady(root, "krx", D)).toBe(true);
    expect(isDayReady(root, D)).toBe(true);
  });

  it("디렉터리 없음 → false", () => {
    const root = oct30({ krx: [], nxt: OCT30_OBJECTS.nxt.map(hhmmOf) });
    expect(isLabelReady(root, "krx", D)).toBe(false);
    expect(isDayReady(root, D)).toBe(false);
  });
});

describe("kstYmdDaysAgo · READY_GRACE_DAYS", () => {
  it("유예 2일", () => {
    expect(READY_GRACE_DAYS).toBe(2);
  });
  it("KST 날짜 경계 — UTC 15:00 이 KST 다음 날 00:00", () => {
    expect(kstYmdDaysAgo(new Date("2026-11-01T14:59:59Z"), 0)).toBe("20261101");
    expect(kstYmdDaysAgo(new Date("2026-11-01T15:00:00Z"), 0)).toBe("20261102");
    expect(kstYmdDaysAgo(new Date("2026-11-02T03:00:00Z"), 2)).toBe("20261031");
    expect(kstYmdDaysAgo(new Date("2026-11-01T03:00:00Z"), 2)).toBe("20261030");
    expect(kstYmdDaysAgo(new Date("2026-03-01T03:00:00Z"), 1)).toBe("20260228");
  });
});
