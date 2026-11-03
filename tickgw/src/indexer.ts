/**
 * 119 인덱서 ssh 강제 명령 어댑터 (Phase 37 · D-05 · D-07).
 *
 * ── 계약 = 37-01 제안(①~⑤) + gh-trade 1차 회신(docs/inbox/from-gh-trade/261102-tick-viewer-contract-1.md) ──
 *   정본: gh-trade server/tools/indexer/README.md 「조회 계약 (gh-radar Phase 37 ②)」 — 글자가 어긋나면 README 가 맞다.
 *   명령     119 `authorized_keys` 강제 명령 `/home/smok95/gh-trade-server/bin/tick-indexer --query`(taskset 코어 0 · nice 19 ·
 *            ionice idle) — 인자는 `SSH_ORIGINAL_COMMAND` 를 공백 · 탭으로 나눠 받는다(모두 [A-Z0-9] 라 안전)
 *   인자     `<isin(12)> <KRX|NXT> <YYYYMMDD(오늘 · 119 로컬 KST)> <from_ns> <to_ns>` — recv epoch ns 십진 ·
 *            from 포함 · to 배타 · to_ns 0 = 지금까지 · 다른 날짜는 64
 *   stdout   **항상 정확히 zstd 프레임 1개**(0건이면 빈 프레임 · has_more 로 끊은 응답도 1개 — 응답 N 개 = 프레임 N 개) ·
 *            내용 = pcap-ns 레코드 `<IIII>` 16B + UDP 페이로드 반복(전역 헤더 없음 · recv 순) ·
 *            압축 16MB **엄격** 상한(넘기 전에 레코드 경계에서 끊는다)
 *   stderr   **마지막 줄** JSON(공백 없음 · ns 는 문자열) `{"fmt":"pcapns-rec/1","records":N,"first_recv_ns":"…",
 *            "last_recv_ns":"…","has_more":bool,"next_from_ns":"…","compressed_files_skipped":N,"skipped_records":N}` —
 *            next_from_ns = 보내지 않은 첫 레코드 recv_ns(포함 커서 · 같은 recv_ns 묶음은 가르지 않는다) ·
 *            compressed_files_skipped = 20:00 뒤 `.pcap.zst` 로 바뀌어 건너뛴 파일 수(그날 밤부터는 GCS 변환 몫) ·
 *            skipped_records = 범위 안인데 싣지 못한 레코드 수(파일표에 없는 file_id · 헤더/본문 읽기 실패 · 페이로드 없음 —
 *            gh-trade 4e9de34b · docs/inbox/from-gh-trade/261104-tickgw-redeploy-reply.md ①) — 둘 다 > 0 이면 미완결
 *   종료코드 0 정상(0건 포함) · 75 다시(EX_TEMPFAIL — 동시 1 flock 바쁨 · 색인 준비 안 됨: 오늘 files.tsv 없음 ·
 *            serve 따라잡는 중) · 64 인자 오류 · 1 원본 열기 실패(ENOENT 아닌 것) · 그 밖 실패(질의 60초 한도 SIGALRM 포함) ·
 *            ssh 자체 오류는 255
 *
 *   회신 차이 2건(compressed_files_skipped · 0건 빈 프레임)은 프레이밍을 바꾸지 않는다 — poller 는 records > 0 일 때만
 *   캐시에 붙이므로 빈 프레임은 버려지고, 37-09 「원본 zstd 그대로 · 재압축 없음」 규칙에 예외가 없다.
 *   poller · cache · server 는 `IndexerArgs` · `IndexerMeta` · `IndexerResult` 모양만 안다.
 *
 * ── ssh 규율 ──────────────────────────────────────────────────────
 *   ControlMaster=auto + ControlPersist=120 — 연결 하나를 유지하고 채널만 다중화한다(5초마다 새 핸드셰이크 금지).
 *   BatchMode(비밀번호 프롬프트 없음) · StrictHostKeyChecking=yes + 고정 known_hosts(install.sh 가 지문 대조 후 기록) ·
 *   IdentitiesOnly(tickpull 키만).
 *
 * ── 종료 판정 ─────────────────────────────────────────────────────
 *   ControlPersist 로 배경에 남는 마스터 프로세스가 stderr 를 늦게 닫는 OpenSSH 판이 있다. 'close' 만 기다리면
 *   첫 호출이 마스터 수명(120초)만큼 묶일 수 있어 「종료 + stdout 끝」 이면 끝내고 stderr 는 짧게(200ms)만 더 기다린다.
 *   시간 초과면 SIGKILL · code −1. stdout 이 상한(기본 20MB — 계약 16MB 엄격 상한 + 4MB 여유 · 계약 위반 방어)을 넘으면
 *   kill · code −1(컨테이너 256MB 보호 · WR-31).
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
  /** 20:00 뒤 압축돼 건너뛴 원본 파일 수(gh-trade 회신 차이 ①) — 없으면 0. > 0 이면 poller 가 그 키를 complete=false 로(CR-31). */
  compressedFilesSkipped: number;
  /** 범위 안인데 싣지 못한 레코드 수(gh-trade 4e9de34b `skipped_records`) — 옛 응답(필드 없음)이면 0. > 0 이면 complete=false. */
  skippedRecords: number;
  /**
   * 건너뜀 수 필드가 **있는데** 형식이 틀린(음 아닌 안전 정수가 아닌) 필드 이름 — 그 값은 0 으로 두되 poller 가 그 키를
   * complete=false(승격 안 함) + warn 로 다룬다(R2-IN-01 · 계약 표류를 조용히 0 으로 삼키지 않는다). 없으면 생략.
   */
  badCounts?: string[];
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

/** ssh stdout 상한 기본값 — 계약 16MB 엄격 상한 + 4MB 여유(WR-31). */
export const DEFAULT_MAX_STDOUT_BYTES = 20 * 1024 * 1024;

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

/**
 * 건너뜀 수 필드 — 없으면(옛 응답 · gh-trade 허용) 0, 음 아닌 안전 정수면 그 값, 그 밖(문자열 · 음수 · 소수 · null)은 null
 * (형식 오류 — 호출부가 badCounts 에 담는다 · R2-IN-01).
 */
function countField(v: unknown): number | null {
  if (v === undefined) return 0;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
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
  const bad: string[] = [];
  const count = (name: string): number => {
    const v = countField(r[name]);
    if (v === null) bad.push(name);
    return v ?? 0;
  };
  const compressedFilesSkipped = count("compressed_files_skipped");
  const skippedRecords = count("skipped_records");
  return {
    fmt: r.fmt,
    records: r.records,
    firstRecvNs: nsOrNull(r.first_recv_ns),
    lastRecvNs: nsOrNull(r.last_recv_ns),
    hasMore: r.has_more,
    nextFromNs: nsOrNull(r.next_from_ns),
    compressedFilesSkipped,
    skippedRecords,
    ...(bad.length > 0 ? { badCounts: bad } : {}),
  };
}

export function runIndexer(args: IndexerArgs, opts: IndexerOptions): Promise<IndexerResult> {
  const maxStdout = opts.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
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
        // 상한 초과 · 시간 초과(kill)면 버린다 — 모은 청크를 다시 복사하지 않는다(IN-30)
        stdout: forced ? Buffer.alloc(0) : Buffer.concat(chunks, size),
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
      if (forced) return;
      // size 는 chunks 에 실제로 넣은 바이트만 센다(IN-30 — 넘친 마지막 청크를 size 에만 더해 0 꼬리를 할당하던 것)
      if (size + b.length > maxStdout) {
        kill();
        chunks.length = 0;
        size = 0;
        return;
      }
      size += b.length;
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
    child.on("exit", (code) => {
      exitCode = code ?? -1; // 신호로 끝나면 code null → −1
      if (forced) {
        // kill 뒤에는 파이프 끝을 기다리지 않는다
        stdoutEnded = true;
        stderrEnded = true;
      }
      maybeFinish();
    });
  });
}
