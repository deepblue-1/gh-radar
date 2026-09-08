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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑥ ★ relay 를 쓰는 spec 의 규약 — **여기 한 곳이 정본이다** (Phase 16)
 *
 *   현재 대상: `orderbook` · `trading-limit-chaser` · `trading-vi` · `me` · `sidebar-tree`.
 *   새 spec 을 추가할 때 아래 4줄을 그대로 지킨다. 하나라도 빠지면 증상이 그 spec 이
 *   아니라 **다른 spec 에서** 터져 원인 추적이 몇 배로 비싸진다.
 *
 *     test.describe.configure({ mode: 'serial' });          // 파일 내부 직렬
 *     test.beforeAll(async () => { relay = await withLocalRelay(); });   // 1회만
 *     test.afterAll(async () => { await relay.stop(); });    // 반드시 (T-15-46)
 *     test.beforeEach(() => { relay.reset(); });             // 시드 누수 차단
 *
 *   `mode: 'serial'` 은 **파일 내부만** 직렬화한다. 파일 **간** 충돌(8090 EADDRINUSE)은
 *   `playwright.config.ts` 의 단일 워커 고정이 막는다 — 두 장치가 같이 있어야 성립한다.
 *
 *   `withLocalRelay()` 를 `beforeEach` 에 두면 매 테스트 relay 프로세스를 새로 띄워
 *   spec 하나가 수십 초씩 늘어나고, 종료가 밀리면 다음 파일이 8090 을 못 잡는다.
 *
 *   ★ 실서버 IP·실계좌 리터럴을 spec·픽스처·주석 어디에도 적지 않는다 (D-27).
 *   게이트웨이는 늘 `127.0.0.1` 의 스텁이고, 계좌는 `relay/tests/helpers/frames.ts` 의
 *   `SAMPLE_ACCOUNT_NO` 를 쓴다.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

import {
  readQuoteRequestKey,
  readViConfirmRequest,
  readViSetRequest,
  startFakeGateway,
  type FakeGateway,
  type StrategyRequest,
  type ViConfirmRequest,
  type ViSetRequest,
} from '../../../relay/tests/helpers/fake-gateway.js';
import {
  buildAccountStateFrame,
  buildServerMessageFrame,
} from '../../../relay/tests/helpers/frames.js';
import type {
  FakeAccountStateInput,
  FakeLimitChaserInput,
  FakeOrderRespInput,
  FakeServerMessageInput,
  FakeViOrderItemInput,
  FakeViTriggerInput,
} from '../../../relay/tests/helpers/frames.js';
import { encryptDmaPassword } from '../../../relay/src/store/credentials.js';
import { MSG } from '../../../relay/src/dma/msg-type.js';

/**
 * DMA `msg_type` 상수 재export — spec 이 relay 내부 경로를 다시 import 하지 않게 한다.
 * 구독 왕복(28 GetQuoteReq / 29 SubscribeQuoteReq)을 요청 로그로 세는 데 쓴다.
 */
export { MSG as DMA_MSG };

/**
 * 전략 요청 페이로드 파서 재export — spec 이 relay 내부 경로를 다시 import 하지 않게 한다.
 *
 * `flatbuffers` 는 relay 패키지 의존성이라 spec 이 직접 프레임을 열 수 없다. 그렇다고
 * msg_type 만 세면 **「보냈다」까지밖에 못 본다** — 「무엇을 보냈는가」(`run` 유지 · 확인
 * on/off)는 페이로드가 유일한 증거다.
 */
export { readViConfirmRequest, readViSetRequest };
export type { StrategyRequest, ViConfirmRequest, ViSetRequest };

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

/**
 * 스텁 게이트웨이 `LoginResp` 가 돌려주는 계좌번호 (`SAMPLE_ACCOUNTS[0]`).
 * 계좌 상태 프레임의 계좌와 **같아야** 브라우저 계좌 패널이 그 상태를 그린다.
 */
export const E2E_ACCOUNT_NO = '1234567801';

/**
 * 이름이 **긴** 두 번째 종목의 ISIN. 모바일 카드 행의 리플로우 스트레스 케이스다 —
 * 짧은 이름만으로 검증하면 「종목명만 신축」 규율을 지워도 아무것도 넘치지 않아
 * 잘림 단언이 공허해진다(실측으로 확인한 함정).
 */
export const E2E_LONG_NAME_ISIN = 'KR7000660001';

/** `stocks` 스텁 — relay `SymbolMap` 이 ISIN → 단축코드·시장을 여기서 푼다(D-28). */
const E2E_STOCK_ROWS = [
  {
    code: '005930',
    name: '삼성전자',
    isin: E2E_ISIN,
    // `toOrderMarket` 이 "KOSPI"/"KOSDAQ" 원문만 받는다 — 1자 코드를 지어내면 주문이 거부된다.
    market: 'KOSPI',
    is_delisted: false,
  },
  {
    code: '000660',
    // 한국 종목명은 실제로 이만큼 길어진다(우선주·스팩·리츠 접미사). 390px 카드 행에서
    // 이 이름이 숫자를 밀어내지 않는지가 C7 규율의 진짜 시험이다.
    name: '한국제7호기업인수목적우선주식회사',
    isin: E2E_LONG_NAME_ISIN,
    market: 'KOSDAQ',
    is_delisted: false,
  },
];

/** 거래소별 호가 오프셋 — NXT 를 KRX 와 **다른 숫자**로 만들어 전환을 눈으로 증명한다. */
const EXCHANGE_PRICE_OFFSET: Record<string, number> = { KRX: 0, NXT: 1_000 };

/** relay 부팅 대기 상한(ms). tsx 첫 실행 + 포트 2개 listen 여유. */
const RELAY_BOOT_TIMEOUT_MS = 30_000;

/**
 * 전략 프레임 주입 시 게이트웨이 소켓 대기 상한(ms).
 *
 * relay 는 브라우저 인증이 끝난 뒤 DMA 세션을 연다. 브라우저 왕복 + 로그인 응답까지
 * 여유를 두되, 영원히 매달리지 않게 상한을 둔다 — 여기서 멈추면 Playwright 타임아웃이
 * 대신 터지고 원인이 "테스트가 느림"으로 잘못 읽힌다.
 */
const RELAY_GATEWAY_WAIT_MS = 10_000;

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
  /**
   * 전략 **명령** 프레임(10·11·14·33) 전량 — 페이로드 포함(송신 순서 그대로).
   *
   * `requestLog()` 는 「보냈다」만 말한다. 「무엇을 보냈는가」가 계약인 자리
   * (VI 「수정」이 `run` 을 유지하는가 · 확인 체크가 on/off 중 무엇을 보냈는가)는
   * `readViSetRequest`/`readViConfirmRequest` 로 이 페이로드를 열어야 확인된다.
   */
  strategyRequests(): StrategyRequest[];
  /** 자동 호가 응답을 켤 거래소 목록. 빈 배열이면 어떤 거래소에도 응답하지 않는다. */
  setRespondingExchanges(exchanges: readonly string[]): void;

  // --- 전략 (Phase 16) ---
  //
  // 스텁 게이트웨이의 주입 API 를 spec 에 **소켓 없이** 노출한다. 현재 연결된 게이트웨이
  // 소켓은 픽스처가 알고 있으므로(호가 주입 경로와 동일) spec 이 `net.Socket` 을 다루지
  // 않는다 — 다루게 하면 spec 마다 연결 대기 코드를 복붙하게 되고, 그 복붙이 어긋나는
  // 순간 "가끔 실패하는 E2E" 가 된다.

  /** 상따 목록 조회(24) 응답 내용을 심는다. 다음 `reset()` 까지 유지된다. */
  seedLimitChasers(items: FakeLimitChaserInput[]): void;
  /** VI 트리거 조회(21) 응답 내용을 심는다. `null` 이면 미등록(빈 61). */
  seedViTrigger(cfg: FakeViTriggerInput | null): void;
  /** VI 주문 목록 조회(34) 응답 내용을 심는다. */
  seedViOrders(items: FakeViOrderItemInput[]): void;
  /** 상따 Set 에코(60)를 지금 밀어 넣는다. 게이트웨이 연결이 설 때까지 기다린다. */
  pushLimitChaserEcho(cfg?: FakeLimitChaserInput): Promise<void>;
  /** VI 주문 목록을 지금 밀어 넣는다 (`snap`=true → 72 전량 교체 / false → 73 upsert). */
  pushViOrderList(items: FakeViOrderItemInput[], snap: boolean): Promise<void>;
  /** 주문 통보(51)를 지금 밀어 넣는다 — 상따·VI 발주 결과 상관 검증용. */
  pushOrderResp(input?: FakeOrderRespInput): Promise<void>;
  /**
   * 계좌 상태(66 스냅샷 / 67 델타)를 지금 밀어 넣는다 — 미체결·잔고 표면 검증용.
   * 계좌번호 기본값은 `E2E_ACCOUNT_NO` 다(로그인 응답의 계좌와 같아야 화면에 뜬다).
   */
  pushAccountState(input?: FakeAccountStateInput): Promise<void>;
  /**
   * 서버 통지(54)를 지금 밀어 넣는다 — **거부 표시 검증의 유일한 경로**다 (T-16-07).
   *
   * 서버는 전략 등록 거부를 응답 코드로 주지 않는다. `ServerMessage(level:"ERROR")` 만
   * 오고 에코는 아예 안 온다. 이 주입구가 없으면 「조용한 거부」 경로를 E2E 가 볼 수 없고,
   * 그 경로는 화면이 아무것도 말하지 않아도 통과해 버리는 대표 구간이다.
   *
   * `isin` 이 **비면 브로드캐스트**다 — 상따/VI 몫 판정(Pitfall 9)의 입력이므로 기본값을
   * 채우지 않는다. spec 이 의도한 값을 그대로 실어 보낸다.
   */
  pushServerMessage(input?: FakeServerMessageInput): Promise<void>;
  /**
   * `dma_orders` 스텁에 들어온 insert 바디 누적 (D-03).
   * 「주문이 나갔는데 기록이 없다」를 spec 이 확인할 수 있게 남긴다 — 스텁이 감사 기록을
   * 블랙홀로 삼키면 그 결손이 E2E 에서 보이지 않는다.
   */
  orderInserts(): Record<string, unknown>[];

  /**
   * 테스트 간 상태 오염 제거 — 요청 로그·응답 거래소·자격증명·**전략 시드 3종**을
   * 기본값으로 되돌린다. 전략 시드가 새면 다음 spec 이 남의 전략을 보고 통과한다.
   */
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
  /** `POST /rest/v1/dma_orders` 로 들어온 바디 누적 (감사 기록 결손 확인용). */
  orderInserts: Record<string, unknown>[];
  close(): Promise<void>;
}

/**
 * 최소 Supabase 스텁 — relay 가 실제로 부르는 경로만 흉내 낸다.
 *
 *   GET   /auth/v1/user               → 토큰이 비어 있지 않으면 고정 사용자
 *   GET   /rest/v1/dma_credentials?…  → 시드된 행 배열(0 또는 1건)
 *   GET   /rest/v1/stocks?…           → `SymbolMap` 이 ISIN→단축코드·시장을 푸는 1행 (D-28)
 *   POST  /rest/v1/dma_orders         → 주문 요청 행 insert, 새 `id` 반환 (D-03)
 *   PATCH /rest/v1/dma_orders?…       → 수명주기 갱신 (0행이어도 정상)
 *   GET   /rest/v1/dma_orders?…       → `order_no` 조회 (없으면 빈 배열)
 *
 * ★ `stocks` / `dma_orders` 가 없으면 **모든 주문이 거부된다** — relay 는 ISIN 을 못 풀면
 *   「이 종목은 지금 주문할 수 없습니다」, insert 가 실패하면 「주문 기록에 실패했습니다」로
 *   막는다(둘 다 게이트웨이로 나가기 **전에** 끝난다). 그 두 방어선이 살아 있는 채로
 *   주문 왕복을 보려면 이 두 라우트가 반드시 있어야 한다.
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
  const orderInserts: Record<string, unknown>[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    /*
      postgrest-js 는 `.single()` 에서 `Accept: application/vnd.pgrst.object+json` 을 보내고
      그때는 **객체**를 기대한다. 배열로 답하면 파싱이 깨져 relay 가 insert 실패로 읽고
      주문을 보내지 않는다 — 헤더를 보고 모양을 맞춘다(추측하지 않는다).
    */
    const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
    const readBody = (): Promise<string> =>
      new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        req.on('end', () => resolve(raw));
      });

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

    if (url.pathname === '/rest/v1/stocks') {
      // `SymbolMap.refresh()` 의 페이징 루프는 PAGE_SIZE 미만 응답에서 멈춘다.
      json(200, E2E_STOCK_ROWS);
      return;
    }

    if (url.pathname === '/rest/v1/dma_orders') {
      if (req.method === 'POST') {
        void readBody().then((raw) => {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object') {
              orderInserts.push(parsed as Record<string, unknown>);
            }
          } catch {
            // 바디를 못 읽어도 insert 자체는 성공시킨다 — 여기서 막으면 원인이
            // 「스텁이 바디를 못 읽었다」가 아니라 「주문 기록 실패」로 보인다.
          }
          const row = { id: randomUUID() };
          json(201, wantsObject ? row : [row]);
        });
        return;
      }
      // PATCH(수명주기 갱신) · GET(order_no 조회) — 둘 다 0행이 정상이다.
      json(200, []);
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
    orderInserts,
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
  /**
   * 전략 명령 누적의 **테스트 시작점**. 스텁 게이트웨이는 프로세스 수명 내내 쌓아 두므로
   * (`reset()` 이 닿지 않는다) 여기서 잘라 주지 않으면 다음 테스트가 **앞 테스트의
   * 전송분을 보고 통과**한다.
   */
  let strategyBaseline = 0;

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

  /**
   * 지금 살아 있는 게이트웨이 소켓. 없으면 **설 때까지 기다린다**.
   *
   * relay 는 브라우저가 붙고 인증이 끝난 **뒤에야** DMA 세션을 연다. spec 이
   * `page.goto` 직후 주입하면 그 사이 소켓이 아직 없을 수 있는데, 여기서 그냥 던지면
   * "가끔 실패하는 E2E" 가 된다. 대기 상한을 넘기면 원인을 말하고 실패한다.
   */
  const gatewaySocket = async (): Promise<Parameters<FakeGateway['pushQuote']>[0]> => {
    try {
      return await gateway.waitForConnection(RELAY_GATEWAY_WAIT_MS);
    } catch {
      throw new Error(
        `DMA 게이트웨이 연결이 ${RELAY_GATEWAY_WAIT_MS}ms 안에 서지 않았습니다. ` +
          'relay 가 세션을 열기 전에 주입했을 수 있습니다 — 페이지를 열고 wss 인증·구독이 ' +
          `끝난 뒤에 호출하세요.\n--- relay 로그 ---\n${output}`,
      );
    }
  };

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
    strategyRequests() {
      return gateway.strategyRequests().slice(strategyBaseline);
    },
    setRespondingExchanges(exchanges) {
      responding = new Set(exchanges);
    },
    seedLimitChasers(items) {
      gateway.respondLimitChaserList(items);
    },
    seedViTrigger(cfg) {
      gateway.respondViTrigger(cfg);
    },
    seedViOrders(items) {
      gateway.respondViOrderList(items);
    },
    async pushLimitChaserEcho(cfg) {
      gateway.pushLimitChaserEcho(await gatewaySocket(), cfg);
    },
    async pushViOrderList(items, snap) {
      gateway.pushViOrderList(await gatewaySocket(), items, snap);
    },
    async pushOrderResp(input) {
      gateway.pushOrderResp(await gatewaySocket(), input);
    },
    async pushAccountState(input) {
      gateway.sendFrame(
        await gatewaySocket(),
        buildAccountStateFrame({ accountNo: E2E_ACCOUNT_NO, ...input }),
      );
    },
    async pushServerMessage(input) {
      gateway.sendFrame(await gatewaySocket(), buildServerMessageFrame(input));
    },
    orderInserts() {
      return [...supabase.orderInserts];
    },
    reset() {
      requests.length = 0;
      strategyBaseline = gateway.strategyRequests().length;
      supabase.orderInserts.length = 0;
      responding = new Set(['KRX', 'NXT']);
      supabase.rows.clear();
      seedDmaCredential();
      // 전략 시드 3종도 되돌린다 — 남으면 다음 spec 이 남의 전략을 본다.
      gateway.respondLimitChaserList([]);
      gateway.respondViTrigger(null);
      gateway.respondViOrderList([]);
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
