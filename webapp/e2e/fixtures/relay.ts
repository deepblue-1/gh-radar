/**
 * Phase 15 Plan 14 Task 2 — E2E 픽스처: **로컬 relay + 스텁 게이트웨이** (RELAY-01, D-27/D-40).
 *
 * ① 무엇을 띄우는가 (전부 127.0.0.1)
 *     ┌ 브라우저 ─ ws ─→ relay(:8090/ws) ─ TCP ─→ 스텁 DMA 게이트웨이(임의 포트)
 *     └ relay ─ HTTP ─→ 스텁 Supabase(임의 포트)  ← 토큰 검증 + dma_credentials
 *
 *   relay 는 **진짜 프로세스**(`tsx relay/src/index.ts`)다. wss 경로·인증 순서·구독
 *   참조계수·상태 프레임이 전부 실제 코드로 돈다 — 이 층을 가짜로 채우면 E2E 가
 *   "우리가 만든 목업이 우리 목업과 잘 맞는다"만 증명하게 된다.
 *
 * ② ★ 실서버에 절대 붙지 않는다 (D-27 / T-15-28)
 *   `DMA_HOST=127.0.0.1` 을 명시하고, 게이트웨이 주소는 이 프로세스가 방금 띄운
 *   스텁의 임의 포트다. **KB 사내망 게이트웨이의 IP 는 이 파일과 spec 어디에도 문자열로
 *   존재하지 않는다** — acceptance 가 그 리터럴 0건을 grep 으로 검사하므로 주석에도
 *   적지 않는다. 실계좌 게이트웨이에 테스트가 붙는 사고는 되돌릴 수 없으므로
 *   기본값이 아니라 **명시 + 검사** 두 겹으로 막는다.
 *
 * ③ 왜 Supabase 도 스텁인가
 *   relay 는 ① 브라우저 토큰 검증(`auth.getUser`) ② `dma_credentials` 조회 두 가지로만
 *   Supabase 를 쓴다. 실 프로젝트를 쓰면 **실 DB 에 자격증명 행을 넣었다 빼야** 하고,
 *   allowlist 있음/없음 두 경로를 테스트가 결정론적으로 오갈 수 없다. 스텁이면 매핑을
 *   메모리에서 켜고 끄면 되고, E2E 가 실 DB 를 오염시킬 여지가 0 이 된다.
 *   (브라우저 쪽 Supabase 는 **실 프로젝트 그대로**다 — 로그인 세션은 진짜 토큰이다.)
 *
 * ④ 포트 (D-41 · dev.sh 규약)
 *   relay wss 는 **고정 8090** 이다. `NEXT_PUBLIC_RELAY_WS_URL` 은 빌드 시점에 번들로
 *   인라인되므로 테스트가 정한 임의 포트를 나중에 주입할 수 없기 때문이다.
 *   `relay-url.ts` 의 미설정 폴백도 같은 `ws://localhost:8090/ws` 라서, dev 서버를
 *   재사용하든(env 없음 → 폴백) 새로 띄우든(webServer.env) **같은 URL 로 수렴**한다.
 *
 * ⑤ 정리 (T-15-46)
 *   `stop()` 이 relay 프로세스(SIGTERM → 3초 뒤 SIGKILL) · 게이트웨이 · Supabase 스텁을
 *   전부 내린다. 하나라도 남으면 Playwright 가 종료하지 못하고 매달린다.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  readQuoteRequestKey,
  startFakeGateway,
  type FakeGateway,
} from '../../../relay/tests/helpers/fake-gateway.js';
import { encryptDmaPassword } from '../../../relay/src/store/credentials.js';
import { MSG } from '../../../relay/src/dma/msg-type.js';

/**
 * DMA `msg_type` 상수 재export — spec 이 relay 내부 경로를 다시 import 하지 않게 한다.
 * 구독 왕복(28 GetQuoteReq / 29 SubscribeQuoteReq)을 요청 로그로 세는 데 쓴다.
 */
export { MSG as DMA_MSG };

// ---------------------------------------------------------------------------
// 상수 — 값의 정본은 여기 한 곳이다
// ---------------------------------------------------------------------------

/** relay 브라우저 wss 포트 (D-41 · dev.sh). 고정이어야 하는 이유는 파일 상단 ④. */
export const RELAY_WS_PORT = 8090;

/** 브라우저가 붙는 주소. `relay-url.ts` 의 로컬 폴백과 **같은 문자열**이어야 한다. */
export const RELAY_WS_URL = `ws://localhost:${RELAY_WS_PORT}/ws`;

/** 스텁 Supabase 가 모든 토큰에 대해 돌려주는 사용자 id. 자격증명 시드 키이기도 하다. */
export const E2E_DMA_USER_ID = '00000000-0000-4000-8000-0000000000e2';

/** 삼성전자 12자 표준코드 — 구독 키(D-28). e2e 종목 픽스처의 `isin` 과 같아야 한다. */
export const E2E_ISIN = 'KR7005930003';

/** 기준가(전일 종가). 사다리 방향색·주문 패널 폴백의 기준이다. */
export const E2E_BASE_PRICE = 98_000;

/** 거래소별 호가 오프셋 — NXT 를 KRX 와 **다른 숫자**로 만들어 전환을 눈으로 증명한다. */
const EXCHANGE_PRICE_OFFSET: Record<string, number> = { KRX: 0, NXT: 1_000 };

/** relay 부팅 대기 상한(ms). tsx 첫 실행 + 포트 2개 listen 여유. */
const RELAY_BOOT_TIMEOUT_MS = 30_000;

/** 저장소 루트 (`webapp/e2e/fixtures` 에서 세 단계 위). */
const REPO_ROOT = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export interface LocalRelay {
  /** 브라우저가 붙어야 하는 wss URL. */
  readonly wsUrl: string;
  /** 스텁 DMA 게이트웨이 핸들 (`hardClose` / `pushQuote` 등 15-02 API 그대로). */
  readonly gateway: FakeGateway;
  /**
   * `dma_credentials` 매핑을 **켠다**(allowlist 포함). 암호화는 relay 런타임이 실제로
   * 복호하는 `encryptDmaPassword` 를 그대로 쓴다 — 포맷이 어긋나면 relay 가 던진다.
   */
  seedDmaCredential(userId?: string): void;
  /** 매핑을 **끈다**(allowlist 미포함 → 권한 없음 게이트 경로). */
  clearDmaCredentials(): void;
  /** 게이트웨이가 수신한 요청 `msg_type` 누적(송신 순서 그대로). */
  requestLog(): number[];
  /** 자동 호가 응답을 켤 거래소 목록. 빈 배열이면 어떤 거래소에도 응답하지 않는다. */
  setRespondingExchanges(exchanges: readonly string[]): void;
  /** 테스트 간 상태 오염 제거 — 요청 로그·응답 거래소·자격증명을 기본값으로 되돌린다. */
  reset(): void;
  /** relay 프로세스 stdout/stderr 누적 (실패 진단용). */
  logs(): string;
  /** 프로세스·소켓 전부 정리. 반드시 `afterAll` 에서 호출한다 (T-15-46). */
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// 내부 helper
// ---------------------------------------------------------------------------

/** 비어 있는 TCP 포트 1개를 잡아 돌려준다(잡자마자 닫는다 — 내부 HTTP 포트용). */
async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('빈 포트를 확인할 수 없습니다');
  }
  const { port } = address;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** 고정 포트가 이미 점유돼 있으면 **원인을 말하고** 실패한다(조용한 flake 방지). */
async function assertPortFree(port: number): Promise<void> {
  const inUse = await new Promise<boolean>((resolve) => {
    const probe = net.connect({ host: '127.0.0.1', port });
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
  if (inUse) {
    throw new Error(
      `포트 ${port} 가 이미 사용 중입니다. ./dev.sh --with-relay 로 띄운 relay 가 있다면 ` +
        `내린 뒤 다시 실행하세요 (E2E 는 자기 relay 를 :${port} 에 띄웁니다).`,
    );
  }
}

/** relay 내부 HTTP 의 `/healthz` 가 200 을 줄 때까지 기다린다. */
async function waitForRelay(port: number, deadlineMs: number): Promise<void> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/healthz', timeout: 1_000 },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.once('error', () => resolve(false));
      req.once('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    if (Date.now() > until) throw new Error('relay 기동 대기 시간 초과');
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
}

/** 스텁 Supabase 의 `dma_credentials` 행 형태 (relay 가 select 하는 두 열). */
type CredRow = { dma_user_id: string; dma_password_enc: string };

interface SupabaseStub {
  url: string;
  rows: Map<string, CredRow>;
  close(): Promise<void>;
}

/**
 * 최소 Supabase 스텁 — relay 가 실제로 부르는 **두 경로만** 흉내 낸다.
 *
 *   GET /auth/v1/user                → 토큰이 비어 있지 않으면 고정 사용자
 *   GET /rest/v1/dma_credentials?…   → 시드된 행 배열(0 또는 1건)
 *
 * `maybeSingle()` 은 postgrest-js 2.103 기준 **배열로 받아 클라이언트에서 개수를 센다**
 * (Accept 헤더를 바꾸지 않는다). 그래서 여기서는 늘 JSON 배열을 돌려준다.
 *
 * 토큰 내용은 검사하지 않는다 — 이 E2E 가 증명하려는 것은 Supabase 의 서명 검증이
 * 아니라 **브라우저 ↔ relay ↔ 게이트웨이 왕복**이다. 인증 실패 경로는 relay 단위
 * 테스트(`relay/tests/fanout.test.ts`)가 이미 4케이스로 잠근다.
 */
async function startSupabaseStub(): Promise<SupabaseStub> {
  const rows = new Map<string, CredRow>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/auth/v1/user') {
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
      if (token === '') {
        json(401, { code: 401, msg: 'invalid claim: missing sub claim' });
        return;
      }
      json(200, {
        id: E2E_DMA_USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e@gh-radar.local',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (url.pathname === '/rest/v1/dma_credentials') {
      // `user_id=eq.<uuid>` 에서 값만 꺼낸다. 그 외 필터는 이 스텁의 관심사가 아니다.
      const filter = url.searchParams.get('user_id') ?? '';
      const userId = filter.startsWith('eq.') ? filter.slice(3) : '';
      const row = rows.get(userId);
      json(200, row === undefined ? [] : [row]);
      return;
    }

    // 그 외 경로는 조용히 404 — relay 가 부르면 그 자체가 계약 변경 신호다.
    json(404, { message: `stub: no route ${url.pathname}` });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Supabase 스텁 포트를 확인할 수 없습니다');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    rows,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// ---------------------------------------------------------------------------
// 호가·체결 픽스처 주입
// ---------------------------------------------------------------------------

const TEN = (base: number, step: number): bigint[] =>
  Array.from({ length: 10 }, (_, i) => BigInt(base + step * i));

/**
 * 호가 10단 스냅샷 1건을 그 소켓으로 밀어 넣는다.
 *
 * 잔량은 10·20·…·100 등차라 **단계 최대 정규화**(L3=A)를 화면에서 눈으로 검산할 수 있고,
 * 가격은 거래소별로 어긋나게 두어 KRX/NXT 전환이 실제로 반영됐는지 문자열로 증명된다.
 */
export function pushQuoteFixture(
  gateway: FakeGateway,
  sock: Parameters<FakeGateway['pushQuote']>[0],
  opts: { isin: string; exchange: string },
): void {
  const off = EXCHANGE_PRICE_OFFSET[opts.exchange] ?? 0;
  gateway.pushQuote(sock, {
    isin: opts.isin,
    exchange: opts.exchange,
    snapshot: true,
    lastPrice: BigInt(98_100 + off),
    openPrice: BigInt(97_500 + off),
    highPrice: BigInt(99_000 + off),
    lowPrice: BigInt(97_000 + off),
    change: 100n,
    changeSign: '2',
    changeRate: 0.1,
    askPrices: TEN(98_100 + off, 100),
    askQtys: TEN(10, 10),
    bidPrices: TEN(97_900 + off, -100),
    bidQtys: TEN(10, 10),
    totalAskQty: 550n,
    totalBidQty: 550n,
    upperLimit: 127_400n,
    lowerLimit: 68_600n,
    basePrice: BigInt(E2E_BASE_PRICE),
    viUpPrice: 108_000n,
    viDownPrice: 88_000n,
    exchangeTime: '093015123456',
  });
}

/** 체결 3건(시간 오름차순 — 브라우저가 뒤집어 최신을 위로 올린다). */
export function pushTapeFixture(
  gateway: FakeGateway,
  sock: Parameters<FakeGateway['pushTape']>[0],
  opts: { isin: string; exchange: string },
): void {
  const off = EXCHANGE_PRICE_OFFSET[opts.exchange] ?? 0;
  gateway.pushTape(sock, {
    isin: opts.isin,
    exchange: opts.exchange,
    snapshot: true,
    entries: [
      { tradeTime: '093015123456', price: BigInt(98_100 + off), qty: 56n, cumVolume: 999_966n },
      { tradeTime: '093016123456', price: BigInt(97_900 + off), qty: 34n, cumVolume: 1_000_000n },
      { tradeTime: '093017123456', price: BigInt(98_100 + off), qty: 12n, cumVolume: 1_000_012n },
    ],
  });
}

// ---------------------------------------------------------------------------
// 본체
// ---------------------------------------------------------------------------

export async function withLocalRelay(): Promise<LocalRelay> {
  await assertPortFree(RELAY_WS_PORT);

  const gateway = await startFakeGateway();
  const supabase = await startSupabaseStub();
  const orderApiPort = await freePort();
  const credKey = randomBytes(32).toString('base64');

  /** 자동 호가 응답을 켤 거래소. 기본은 KRX·NXT 둘 다. */
  let responding = new Set<string>(['KRX', 'NXT']);
  const requests: number[] = [];

  /*
    스텁 게이트웨이는 업무 로직이 없다(15-02 설계). 그래서 "구독하면 호가가 온다"는
    거래소 동작을 여기서 **테스트가 지시**한다: relay 가 0→1 전이에서 보내는
    `GetQuoteReq(28)` / `GetTradeTapeReq(32)` 를 보고 그 키로 스냅샷을 되돌린다.
    이렇게 하면 "구독 → 응답" 순서가 실제 코드 경로로 이어져, 화면에 숫자가 뜬다는 것이
    곧 구독 왕복이 성립했다는 증거가 된다.
  */
  gateway.onFrame((msgType, payload, sock) => {
    requests.push(msgType);
    const key = readQuoteRequestKey(msgType, payload);
    if (key === null || !responding.has(key.exchange)) return;
    if (msgType === MSG.GetQuoteReq) pushQuoteFixture(gateway, sock, key);
    if (msgType === MSG.GetTradeTapeReq) pushTapeFixture(gateway, sock, key);
  });

  const tsxBin = path.join(REPO_ROOT, 'relay', 'node_modules', '.bin', 'tsx');
  // 타입은 추론에 맡긴다 — `stdio: ['ignore','pipe','pipe']` 는 stdin 이 null 인
  // `ChildProcessByStdio<null, Readable, Readable>` 라서 WithoutNullStreams 와 다르다.
  const child = spawn(
    tsxBin,
    [path.join(REPO_ROOT, 'relay', 'src', 'index.ts')],
    {
      cwd: path.join(REPO_ROOT, 'relay'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        APP_VERSION: 'e2e',
        SUPABASE_URL: supabase.url,
        SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role-key',
        DMA_CRED_KEY: credKey,
        RELAY_ORDER_SECRET: 'e2e-relay-order-secret',
        WS_PORT: String(RELAY_WS_PORT),
        ORDER_API_PORT: String(orderApiPort),
        // ★ D-27 — 게이트웨이는 방금 띄운 로컬 스텁이다. 실서버 주소는 여기에 없다.
        DMA_HOST: '127.0.0.1',
        DMA_PORT: String(gateway.port),
        // 마지막 소켓이 끊기면 DMA 세션도 즉시 반납 — 테스트 간 세션이 새지 않게.
        SESSION_GRACE_MS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  const collect = (chunk: Buffer): void => {
    output += chunk.toString();
    if (process.env.E2E_RELAY_DEBUG) process.stderr.write(`[relay] ${chunk.toString()}`);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  let exited = false;
  child.once('exit', () => {
    exited = true;
  });

  try {
    await waitForRelay(orderApiPort, RELAY_BOOT_TIMEOUT_MS);
  } catch (err) {
    child.kill('SIGKILL');
    await gateway.close();
    await supabase.close();
    throw new Error(`relay 기동 실패: ${(err as Error).message}\n--- relay 로그 ---\n${output}`);
  }

  const seedDmaCredential = (userId: string = E2E_DMA_USER_ID): void => {
    supabase.rows.set(userId, {
      dma_user_id: 'e2e-dma-user',
      dma_password_enc: encryptDmaPassword('e2e-dma-password', userId, credKey),
    });
  };

  // 기본은 **허용**이다. 권한 없음 경로는 테스트가 `clearDmaCredentials()` 로 만든다.
  seedDmaCredential();

  return {
    wsUrl: RELAY_WS_URL,
    gateway,
    seedDmaCredential,
    clearDmaCredentials() {
      supabase.rows.clear();
    },
    requestLog() {
      return [...requests];
    },
    setRespondingExchanges(exchanges) {
      responding = new Set(exchanges);
    },
    reset() {
      requests.length = 0;
      responding = new Set(['KRX', 'NXT']);
      supabase.rows.clear();
      seedDmaCredential();
    },
    logs() {
      return output;
    },
    async stop() {
      if (!exited) {
        child.kill('SIGTERM');
        // graceful shutdown 은 5초 데드맨이 있다. 그보다 짧게 기다린 뒤 강제 종료한다 —
        // 여기서 매달리면 Playwright 프로세스가 끝나지 않는다(T-15-46).
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 3_000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      await gateway.close();
      await supabase.close();
    },
  };
}
