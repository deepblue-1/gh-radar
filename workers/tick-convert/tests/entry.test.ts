import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MODES, parseArgv } from "../src/index";
import { UsageError } from "../src/modes/request";

/**
 * 이미지 진입점 — Dockerfile ENTRYPOINT/CMD 를 읽어 Cloud Run 합성 규칙으로 컨테이너 argv 를 만들고, 앞 두 원소가 실행 파일
 * (`node dist/index.js`)이며 나머지가 모드로 파싱되는지 본다. 실행 파일을 CMD 쪽에 두면 args 오버라이드가 `node` 까지 지워
 * 모드 이름(`request`)을 실행 파일로 부르는 회귀를 잡는다(D-03 · D-02 · D-07).
 *
 * Cloud Run 규칙: 컨테이너 `command` 는 ENTRYPOINT 를, `args` 는 CMD 를 대체한다. Job 실행 overrides(`containerOverrides[].args`)
 * · `gcloud run jobs execute --args` 는 args 만 바꾼다 — ENTRYPOINT 는 그대로다.
 */
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

/** `#` 주석 줄을 뺀 뒤 그 지시어의 JSON 배열(exec 꼴). 없으면 null · 둘 이상이면 마지막(Docker 규칙). */
function execForm(directive: "ENTRYPOINT" | "CMD"): string[] | null {
  const lines = dockerfile.split("\n").filter((l) => !l.trimStart().startsWith("#"));
  let found: string[] | null = null;
  for (const l of lines) {
    const m = new RegExp(`^\\s*${directive}\\s+(\\[.*\\])\\s*$`).exec(l);
    if (m) found = JSON.parse(m[1]!) as string[];
  }
  return found;
}

/** Cloud Run 합성 — args 오버라이드가 있으면 CMD 를 대체 · ENTRYPOINT 는 그대로. */
function containerArgv(entrypoint: string[], cmd: string[], overrideArgs?: string[]): string[] {
  return [...entrypoint, ...(overrideArgs ?? cmd)];
}

describe("이미지 진입점 — ENTRYPOINT [node, dist/index.js] + CMD [nightly]", () => {
  const entrypoint = execForm("ENTRYPOINT");
  const cmd = execForm("CMD");

  it("실행 파일과 모드를 나눈다", () => {
    expect(entrypoint).toEqual(["node", "dist/index.js"]);
    expect(cmd).toEqual(["nightly"]);
    expect(dockerfile).toMatch(/^FROM node:24-alpine AS builder$/m);
    expect(dockerfile.split("\n").filter((l) => /^FROM /.test(l)).every((l) => l.startsWith("FROM node:24-alpine"))).toBe(true);
  });

  const cases: { name: string; override?: string[]; want: { mode: string; date?: string; ex?: string } }[] = [
    { name: "오버라이드 없음(Scheduler 23:30 · 01:30)", want: { mode: "nightly" } },
    {
      name: "server 요청 변환(37-07 containerOverrides[].args)",
      override: ["request", "--date", "20261030", "--ex", "KRX"],
      want: { mode: "request", date: "20261030", ex: "KRX" },
    },
    {
      name: "스모크(gcloud run jobs execute --args=nightly,--date,D)",
      override: ["nightly", "--date", "20261030"],
      want: { mode: "nightly", date: "20261030" },
    },
    { name: "승격 Job(--args=promote · Scheduler 20:10 · 20:40)", override: ["promote"], want: { mode: "promote" } },
    { name: "팀 값 백필(--args=backfill-team,--dry-run · quick 261103-j4d)", override: ["backfill-team", "--dry-run"], want: { mode: "backfill-team" } },
    { name: "발사 값 백필(--args=backfill-launch,--dry-run · quick 261103-pei)", override: ["backfill-launch", "--dry-run"], want: { mode: "backfill-launch" } },
  ];

  for (const c of cases) {
    it(`${c.name} → node dist/index.js ${c.want.mode} …`, () => {
      const argv = containerArgv(entrypoint!, cmd!, c.override);
      expect(argv.slice(0, 2)).toEqual(["node", "dist/index.js"]);
      // index.ts CLI 가드(`/index\.(js|ts)$/` on argv[1])가 이 argv 에서 main 을 돌린다
      expect(/index\.(js|ts)$/.test(argv[1]!)).toBe(true);
      const parsed = parseArgv(argv.slice(2)); // process.argv.slice(2)
      expect({ mode: parsed.mode, date: parsed.date, ex: parsed.ex }).toEqual({
        mode: c.want.mode,
        date: c.want.date,
        ex: c.want.ex,
      });
    });
  }

  it("실행 파일이 CMD 에 있던 꼴(회귀)이면 오버라이드가 모드를 실행 파일 자리에 둔다 — 이 시험이 잡는 모양", () => {
    const broken = containerArgv([], ["node", "dist/index.js", "nightly"], ["request", "--date", "20261030", "--ex", "KRX"]);
    expect(broken[0]).toBe("request");
    expect(() => parseArgv(["--date", "20261030"])).toThrow(/모드가 없다/);
  });
});

describe("parseArgv — backfill-team(quick 261103-j4d)", () => {
  it("MODES 에 backfill-team 이 있다", () => {
    expect(Object.keys(MODES)).toEqual(["request", "nightly", "promote", "backfill-team", "backfill-launch"]);
  });
  it("--from · --to 값 플래그 + 한 칸짜리 --dry-run(어느 자리든)", () => {
    expect(parseArgv(["backfill-team", "--from", "20261020", "--to", "20261103", "--dry-run"])).toEqual({
      mode: "backfill-team",
      from: "20261020",
      to: "20261103",
      dryRun: true,
      rest: ["--from", "20261020", "--to", "20261103", "--dry-run"],
    });
    expect(parseArgv(["backfill-team", "--dry-run", "--from", "20261020"])).toMatchObject({ from: "20261020", dryRun: true });
  });
  it("모르는 플래그 · 값 없는 --from 은 여전히 UsageError", () => {
    expect(() => parseArgv(["backfill-team", "--bogus"])).toThrow(UsageError);
    expect(() => parseArgv(["backfill-team", "--from"])).toThrow(UsageError);
    expect(() => parseArgv(["backfill-team", "--from", "--dry-run"])).toThrow(UsageError);
  });
});

describe("parseArgv — backfill-launch(quick 261103-pei)", () => {
  it("--from · --to · --dry-run 을 backfill-team 과 같은 공통 플래그로 받는다", () => {
    expect(parseArgv(["backfill-launch", "--dry-run", "--to", "20261103"])).toMatchObject({
      mode: "backfill-launch",
      to: "20261103",
      dryRun: true,
    });
  });
  it("모르는 플래그 → UsageError", () => {
    expect(() => parseArgv(["backfill-launch", "--bogus"])).toThrow(UsageError);
  });
});
