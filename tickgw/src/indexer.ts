/**
 * 119 인덱서 ssh 강제 명령 어댑터 (Phase 37 · D-05 · D-07).
 *
 * ── 계약 = 37-01 인계 노트 ② 제안(gh-trade 회신 전) ─────────────────────
 *   노트: gh-trade docs/inbox/from-gh-radar/261102-tick-viewer-contract.md ②
 *   인자     `<isin(12)> <KRX|NXT> <YYYYMMDD(오늘)> <from_ns> <to_ns>` — ns 는 recv 시각 epoch ns 십진 문자열 · to_ns 0 = 지금까지
 *            강제 명령이라 119 쪽은 `SSH_ORIGINAL_COMMAND` 로 받는다(ssh 가 인자를 공백으로 이어 보낸다 — 모두 [A-Z0-9] 라 안전)
 *   stdout   zstd 프레임 하나 이상 · 내용 = pcap-ns 레코드 `<IIII>` 16B + UDP 페이로드 반복(전역 헤더 없음 · recv 순)
 *   stderr   **마지막 줄** JSON `{"fmt":"pcapns-rec/1","records":N,"first_recv_ns":"…","last_recv_ns":"…","has_more":bool,"next_from_ns":"…"}`
 *   종료코드 0 정상(0건 포함) · 75 바쁨(EX_TEMPFAIL) · 64 인자 오류 · 그 밖 실패 · ssh 자체 오류는 255
 *
 *   **회신 차이(명령 경로 · 인자 · JSON 키 · 종료코드)는 37-17 이 이 파일만 고친다.** poller · cache · server 는
 *   `IndexerArgs` · `IndexerMeta` · `IndexerResult` 모양만 안다.
 *
 * ── ssh 규율 ──────────────────────────────────────────────────────
 *   ControlMaster=auto + ControlPersist=120 — 연결 하나를 유지하고 채널만 다중화한다(5초마다 새 핸드셰이크 금지).
 *   BatchMode(비밀번호 프롬프트 없음) · StrictHostKeyChecking=yes + 고정 known_hosts(install.sh 가 지문 대조 후 기록) ·
 *   IdentitiesOnly(tickpull 키만).
 *
 * ── 종료 판정 ─────────────────────────────────────────────────────
 *   ControlPersist 로 배경에 남는 마스터 프로세스가 stderr 를 늦게 닫는 OpenSSH 판이 있다. 'close' 만 기다리면
 *   첫 호출이 마스터 수명(120초)만큼 묶일 수 있어 「종료 + stdout 끝」 이면 끝내고 stderr 는 짧게(200ms)만 더 기다린다.
 *   시간 초과면 SIGKILL · code −1. stdout 이 상한(기본 32MB — 계약 16MB 의 두 배)을 넘으면 kill · code −1(컨테이너 256MB 보호).
 */

import { spawn } from "node:child_process";

export type Exchange = "KRX" | "NXT";

export interface IndexerArgs {
  isin: string;
  ex: Exchange;
  date: string;
  fromNs: bigint;
  toNs: bigint;
}

export interface IndexerMeta {
  fmt: string;
  records: number;
  firstRecvNs: bigint | null;
  lastRecvNs: bigint | null;
  hasMore: boolean;
  nextFromNs: bigint | null;
}

export interface IndexerResult {
  /** 프로세스 종료코드 · 시간 초과/상한 초과/실행 실패는 −1. */
  code: number;
  stdout: Buffer;
  /** stderr 마지막 줄 JSON — 없거나 깨졌으면 null. */
  meta: IndexerMeta | null;
  /** stderr 끝 일부(최대 500자) — 연결 실패 판정 · 로그용. */
  stderrTail: string;
}

export interface IndexerOptions {
  sshBin: string;
  host: string;
  key: string;
  knownHosts: string;
  timeoutMs: number;
  maxStdoutBytes?: number;
}

export type RunIndexer = (args: IndexerArgs) => Promise<IndexerResult>;

/** 계약이 기대하는 stderr JSON fmt. */
export const INDEXER_FMT = "pcapns-rec/1";

/** ssh 인자 — 옵션 · 호스트 · 강제 명령 인자 5개 순서. 시험이 이 순서를 단언한다. */
export function sshArgv(args: IndexerArgs, opts: IndexerOptions): string[] {
  return [
    "-i", opts.key,
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${opts.knownHosts}`,
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=/tmp/tp-%C",
    "-o", "ControlPersist=120",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=15",
    opts.host,
    args.isin,
    args.ex,
    args.date,
    String(args.fromNs),
    String(args.toNs),
  ];
}

function nsOrNull(v: unknown): bigint | null {
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return null;
}

/** stderr 전체에서 마지막 비어 있지 않은 줄을 JSON 으로 읽는다. 아니면 null. */
export function parseMeta(stderr: string): IndexerMeta | null {
  const lines = stderr.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const last = lines[lines.length - 1];
  if (!last || !last.startsWith("{")) return null;
  let o: unknown;
  try {
    o = JSON.parse(last);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.fmt !== "string") return null;
  if (typeof r.records !== "number" || !Number.isSafeInteger(r.records) || r.records < 0) return null;
  if (typeof r.has_more !== "boolean") return null;
  return {
    fmt: r.fmt,
    records: r.records,
    firstRecvNs: nsOrNull(r.first_recv_ns),
    lastRecvNs: nsOrNull(r.last_recv_ns),
    hasMore: r.has_more,
    nextFromNs: nsOrNull(r.next_from_ns),
  };
}

export function runIndexer(args: IndexerArgs, opts: IndexerOptions): Promise<IndexerResult> {
  const maxStdout = opts.maxStdoutBytes ?? 32 * 1024 * 1024;
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = "";
    let exitCode: number | null = null;
    let forced = false;
    let stdoutEnded = false;
    let stderrEnded = false;
    let settled = false;
    let stderrGrace: NodeJS.Timeout | null = null;

    let child;
    try {
      child = spawn(opts.sshBin, sshArgv(args, opts), { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: -1, stdout: Buffer.alloc(0), meta: null, stderrTail: String((e as Error).message ?? e).slice(-500) });
      return;
    }

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stderrGrace) clearTimeout(stderrGrace);
      const code = forced ? -1 : (exitCode ?? -1);
      resolve({
        code,
        stdout: Buffer.concat(chunks, size),
        meta: code === 0 ? parseMeta(stderr) : null,
        stderrTail: stderr.slice(-500),
      });
    };

    const maybeFinish = () => {
      if (exitCode === null || !stdoutEnded) return;
      if (stderrEnded) return finish();
      if (!stderrGrace) stderrGrace = setTimeout(finish, 200);
    };

    const kill = () => {
      forced = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* 이미 끝남 */
      }
    };

    const timer = setTimeout(kill, opts.timeoutMs);

    child.stdout.on("data", (b: Buffer) => {
      size += b.length;
      if (size > maxStdout) {
        kill();
        return;
      }
      chunks.push(b);
    });
    child.stdout.on("end", () => {
      stdoutEnded = true;
      maybeFinish();
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (s: string) => {
      stderr += s;
      // 앞 줄은 자유 로그 — 끝 줄 JSON 만 쓰므로 너무 길면 앞을 버린다
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-16 * 1024);
    });
    child.stderr.on("end", () => {
      stderrEnded = true;
      maybeFinish();
    });
    child.on("error", (e) => {
      stderr += `\nspawn error: ${e.message}`;
      forced = true;
      stdoutEnded = true;
      stderrEnded = true;
      exitCode = -1;
      finish();
    });
    child.on("exit", (code, signal) => {
      exitCode = code ?? (signal ? -1 : -1);
      if (forced) {
        // kill 뒤에는 파이프 끝을 기다리지 않는다
        stdoutEnded = true;
        stderrEnded = true;
      }
      maybeFinish();
    });
  });
}
