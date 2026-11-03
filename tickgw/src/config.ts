/**
 * tickgw 설정 · KST 경계 함수 (Phase 37 · D-05 · D-06 · D-07).
 *
 * ── 의존성 0 ───────────────────────────────────────────────────────
 *   tickgw 는 node 내장만 쓴다(radar-gw 공유 호스트 · 이미지 최소). 그래서 shared `dayStartNs`(37-05)를
 *   import 하지 않고 같은 정의를 여기 복제한다: `Date.UTC(y, m−1, d, hh, mm) − 9h` 를 ms 로, ×1e6 BigInt 로.
 *   두 정의가 어긋나지 않게 tests/poller.test.ts 가 승격 Job(37-12 · shared `dayStartNs`)과 같은 리터럴
 *   (`kstDayStartNs("20261030")` = 1793314800000000000n 등)을 단언한다.
 *
 * ── 환경변수 ───────────────────────────────────────────────────────
 *   TICKGW_SECRET          필수 · 32자 이상 — server ↔ tickgw 공유 비밀(헤더 X-Tickgw-Secret)
 *   TICKGW_PORT            기본 8092
 *   TICKGW_INDEXER_HOST    기본 smok95@10.16.207.119 (119 강제 명령 계정)
 *   TICKGW_SSH_KEY         기본 /ssh/id_ed25519 (radar-gw /var/lib/tickpull/.ssh 읽기 전용 마운트)
 *   TICKGW_KNOWN_HOSTS     기본 /ssh/known_hosts
 *   TICKGW_SSH_BIN         기본 ssh — 시험이 가짜 인덱서로 바꾼다
 *   TICKGW_POLL_MS         기본 5000 — 키당 증분 간격(± TICKGW_POLL_JITTER_MS)
 *   TICKGW_POLL_JITTER_MS  기본 500
 *   TICKGW_LEASE_MS        기본 30000 — server 요청이 이 시간 안 오면 그 키 폴링을 멈춘다
 *   TICKGW_CACHE_BYTES     기본 100663296(96MB) — 전체 캐시 LRU 상한. 컨테이너 `--memory=256m` 의 ≤ 40%(WR-31):
 *                          캐시 96 + Node 기본 ~50 + ssh stdout 모음(≤ 20MB · 끝 concat 한 번 더) + 응답(복사 없음) 여유
 *   TICKGW_MAX_KEYS        기본 8 — 활성 키 상한(넘으면 「대기 k건」)
 *   TICKGW_IDLE_MS         기본 900000(15분) — 유휴 키 삭제
 *   TICKGW_CLOSE_DELAY_MS  기본 60000 — KST 20:00 + 이 값 뒤 마감 마무리 1회
 *   TICKGW_KEEP_UNTIL      기본 21:00 — 오늘 complete 키는 이 KST 시각까지 유휴 삭제 면제(승격 입력)
 *   TICKGW_CATCHUP_AT      기본 19:55 — 이 KST 시각부터 19:59 전까지 하루 한 번, 리스가 끝난 오늘 complete 키를 따라잡는다
 *                          (poller.ts 「19:55 따라잡기」 · CR-31 후속). `off` 면 끈다. 19:59 이후 값은 거부(창 끝이 19:59 라
 *                          창이 비어 뜻이 없다 · gh-trade 회신 261104-tickgw-catchup-1955-reply)
 *   TICKGW_INDEXER_TIMEOUT_MS 기본 60000 — ssh 한 번의 상한(넘으면 kill · 실패로 센다)
 *   LOG_LEVEL              info(기본) | silent
 *
 *   로그에 비밀 · 키 경로 밖의 값을 찍지 않는다(log.ts).
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `YYYYMMDD` 의 KST `hhmm`(기본 08:00) 을 epoch ns BigInt 로. 형식이 틀리면 throw. */
export function kstDayStartNs(ymd: string, hhmm = "0800"): bigint {
  return BigInt(kstMs(ymd, hhmm)) * 1_000_000n;
}

/** `YYYYMMDD` 의 KST `hhmm` 을 epoch ms 로. */
export function kstMs(ymd: string, hhmm = "0800"): number {
  if (!/^\d{8}$/.test(ymd)) throw new Error(`bad ymd: ${ymd}`);
  if (!/^\d{4}$/.test(hhmm)) throw new Error(`bad hhmm: ${hhmm}`);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const hh = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(2, 4));
  return Date.UTC(y, m - 1, d, hh, mm) - KST_OFFSET_MS;
}

/** epoch ms 의 KST 날짜 `YYYYMMDD`. */
export function kstToday(nowMs: number): string {
  const d = new Date(nowMs + KST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** epoch ms 의 KST 시각을 hhmm 정수로(예: 20:05 → 2005). */
export function kstHhmm(nowMs: number): number {
  const d = new Date(nowMs + KST_OFFSET_MS);
  return d.getUTCHours() * 100 + d.getUTCMinutes();
}

export interface TickgwConfig {
  port: number;
  secret: string;
  indexerHost: string;
  sshKey: string;
  knownHosts: string;
  sshBin: string;
  indexerTimeoutMs: number;
  pollMs: number;
  pollJitterMs: number;
  leaseMs: number;
  cacheBytes: number;
  maxKeys: number;
  idleMs: number;
  closeDelayMs: number;
  /** KST hhmm 정수(기본 2100) — TICKGW_KEEP_UNTIL `HH:MM`. */
  keepUntilHhmm: number;
  /** KST hhmm 정수(기본 1955) — TICKGW_CATCHUP_AT `HH:MM` · `off` 면 null(따라잡기 없음). */
  catchupHhmm: number | null;
}

export class ConfigError extends Error {}

function posInt(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return def;
  if (!/^\d+$/.test(raw.trim())) throw new ConfigError(`${name} must be a positive integer`);
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n <= 0) throw new ConfigError(`${name} must be a positive integer`);
  return n;
}

function nonNegInt(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return def;
  if (!/^\d+$/.test(raw.trim())) throw new ConfigError(`${name} must be a non-negative integer`);
  return Number(raw.trim());
}

function str(env: NodeJS.ProcessEnv, name: string, def: string): string {
  const raw = env[name]?.trim();
  return raw ? raw : def;
}

/** `HH:MM` → hhmm 정수. `name` 은 오류 문구의 환경변수 이름. */
export function parseHhmm(raw: string, name = "TICKGW_KEEP_UNTIL"): number {
  const m = /^(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) throw new ConfigError(`${name} must be HH:MM`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw new ConfigError(`${name} must be HH:MM`);
  return hh * 100 + mm;
}

/** TICKGW_CATCHUP_AT — `off` → null · 그 밖은 19:59 전 `HH:MM`(19:55 따라잡기 창 = [값, 19:59) · gh-trade 회신). */
export function parseCatchupAt(raw: string): number | null {
  if (raw.trim().toLowerCase() === "off") return null;
  const hhmm = parseHhmm(raw, "TICKGW_CATCHUP_AT");
  if (hhmm >= 1959) throw new ConfigError("TICKGW_CATCHUP_AT must be before 19:59 (or off)");
  return hhmm;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TickgwConfig {
  const secret = env.TICKGW_SECRET ?? "";
  if (secret.length < 32) throw new ConfigError("TICKGW_SECRET is required (32+ chars)");
  return {
    port: posInt(env, "TICKGW_PORT", 8092),
    secret,
    indexerHost: str(env, "TICKGW_INDEXER_HOST", "smok95@10.16.207.119"),
    sshKey: str(env, "TICKGW_SSH_KEY", "/ssh/id_ed25519"),
    knownHosts: str(env, "TICKGW_KNOWN_HOSTS", "/ssh/known_hosts"),
    sshBin: str(env, "TICKGW_SSH_BIN", "ssh"),
    indexerTimeoutMs: posInt(env, "TICKGW_INDEXER_TIMEOUT_MS", 60_000),
    pollMs: posInt(env, "TICKGW_POLL_MS", 5_000),
    pollJitterMs: nonNegInt(env, "TICKGW_POLL_JITTER_MS", 500),
    leaseMs: posInt(env, "TICKGW_LEASE_MS", 30_000),
    cacheBytes: posInt(env, "TICKGW_CACHE_BYTES", 96 * 1024 * 1024),
    maxKeys: posInt(env, "TICKGW_MAX_KEYS", 8),
    idleMs: posInt(env, "TICKGW_IDLE_MS", 15 * 60 * 1000),
    closeDelayMs: nonNegInt(env, "TICKGW_CLOSE_DELAY_MS", 60_000),
    keepUntilHhmm: parseHhmm(str(env, "TICKGW_KEEP_UNTIL", "21:00")),
    catchupHhmm: parseCatchupAt(str(env, "TICKGW_CATCHUP_AT", "19:55")),
  };
}
