# @gh-radar/relay

KB DMA 게이트웨이 ↔ 브라우저 시세 중계 프로세스 (Phase 15).

브라우저는 `wss` 로 이 프로세스에 붙고, 이 프로세스는 사용자별 DMA TCP 세션 1개를 잡아
호가·체결을 팬아웃한다. TLS 는 앞단 Caddy 가 종단하므로 relay 자신은 평문 두 포트만 연다.

| 포트 | 용도 | 노출 범위 |
|------|------|-----------|
| 8090 | 브라우저 ws (경로 `/ws`) | Caddy 리버스 프록시 뒤 |
| 8091 | 내부 HTTP (`/healthz`, 주문 릴레이) | VPC 내부 + `X-Relay-Secret` |

---

## 실서버 접속 경고 (D-27)

> **기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 실계좌 접속은
> 사용자의 명시적 지시가 있을 때만 한다.**
>
> 실서버 주소는 **배포 env 로만** 주입한다. 코드·`.env.example`·이 문서 어디에도 기본값으로
> 넣지 않는다 — 로컬에서 env 를 깜빡한 실행이 곧바로 KB 사내망 게이트웨이에 붙는 사고를
> 구조적으로 막기 위해서다 (T-15-25). 접속에는 VPN 이 필요하고, VPN 은 host systemd 소관이라
> 컨테이너가 스스로 올리지 않는다.
>
> DMA 계정 id·비밀번호 같은 자격증명 값은 이 저장소 어디에도 기록하지 않는다.
> 등록은 `scripts/dma-credentials.ts` 로만 한다 (아래 참조).

---

## 로컬 실행

### 1) mock 게이트웨이 기동

relay 는 붙을 상대가 있어야 의미가 있다. VPN 없이 검증하려면 gh-trade 의 mock 브로커를 쓴다 (D-40).

```bash
cd ../gh-trade/server
./scripts/build.sh
./scripts/run-mac.sh          # 포트 9100, [broker] name="mock"
```

mock 은 무인증 로그인을 받아 주고 계좌 목록은 빈 벡터로 응답한다(gh-trade 17 완료 전 현행 스키마).
가격 0 주문에는 거부를 돌려주므로 거부 경로도 검증할 수 있다.

**9100 포트 충돌 시:** 다른 개발 서버가 이미 9100 을 잡고 있으면 mock 을 죽이지 말고
UAT 사본 toml 을 만들어 포트를 옮긴다. relay 쪽은 `DMA_PORT` 로 맞춘다.

```bash
cp server/config.toml server/config.uat.toml
# config.uat.toml 의 listen 포트를 9101 등으로 변경 후
./scripts/run-mac.sh --config server/config.uat.toml
```

### 2) 가짜 호가 주입

```bash
cd ../gh-trade
python3 server/scripts/uat/inject_b6.py --send
```

### 3) relay 기동

```bash
# 저장소 루트에서 — webapp:3100 · server:8080 과 함께
./dev.sh --with-relay

# relay 만
DMA_HOST=127.0.0.1 DMA_PORT=9100 pnpm --filter @gh-radar/relay run dev
```

확인:

```bash
curl -s http://localhost:8091/healthz
# {"status":"ok","vpn":true,"dma":true,"version":"dev","sessionCount":0}
```

웹앱이 붙게 하려면 `webapp/.env.local` 에 다음을 넣는다 (D-41):

```
NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:8090/ws
```

### mock 없이 검증하기

단위·통합 테스트는 게이트웨이를 띄우지 않아도 된다. `relay/tests/helpers/fake-gateway.ts`
가 순수 `net` 스텁으로 프레임 결합/분할·로그인 응답·핑·재접속을 재현한다.

```bash
pnpm --filter @gh-radar/relay test
pnpm --filter @gh-radar/relay run typecheck
pnpm --filter @gh-radar/relay run typecheck:tests
```

---

## 환경변수

### 필수 (없으면 기동 즉시 실패)

| 이름 | 설명 |
|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스롤 키. 토큰 검증 + `dma_credentials` 조회 겸용 (D-02/D-19) |
| `DMA_CRED_KEY` | base64 32B AES-256-GCM 키. Secret Manager `gh-radar-dma-cred-key` |
| `RELAY_ORDER_SECRET` | server → relay 공유 비밀. `X-Relay-Secret` 헤더로 검증 (D-22) |

### 선택 (기본값 있음)

| 이름 | 기본값 | 설명 |
|------|--------|------|
| `WS_PORT` | `8090` | 브라우저 ws 포트 |
| `ORDER_API_PORT` | `8091` | 내부 HTTP 포트 |
| `DMA_HOST` | `127.0.0.1` | **로컬 mock 이 기본.** 실서버는 배포 env 로만 (D-27) |
| `DMA_PORT` | `9100` | 게이트웨이 TCP 포트 |
| `DMA_BROKER` | `KB` | `LoginReq.broker` |
| `SESSION_GRACE_MS` | `300000` | 마지막 소켓이 끊긴 뒤 DMA 세션 유지 유예(5분) |
| `LOG_LEVEL` | `info` | pino 레벨 |
| `APP_VERSION` | `dev` | 이미지 빌드 시 `GIT_SHA` 주입 |

> 시크릿 4종은 VM 기동 시 Secret Manager 에서 env 로 주입된다. 값은 저장소에 두지 않는다.

---

## 자격증명 등록 (관리자 전용)

웹앱에는 입력 UI 가 없다 (D-18 — v1 은 관리자 수기 등록). `dma_credentials` 행의
**존재 자체가 allowlist** 이므로 (D-12), 행이 없는 로그인 사용자는 wss 인증 후
`unauthorized` 상태 프레임을 받고 호가창이 "권한 없음"을 표시한다.

```bash
# 등록/갱신 — 비밀번호는 화면에 표시되지 않는 프롬프트로 입력한다
pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts \
  --email <gh-radar 계정 이메일> --dma-user <DMA user_id>

# 등록 현황
pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts --list
```

- 비밀번호는 인자·환경변수로 받지 않는다 — shell history 에 남기지 않기 위해서다 (T-15-05).
- AES 키는 `DMA_CRED_KEY` env 또는 Secret Manager 에서 읽으며 화면에 출력하지 않는다.
- **D-17:** gh-radar 용 DMA `user_id` 는 WinForms 클라이언트가 쓰는 값과 **달라야 한다.**
  게이트웨이가 user_id + broker 로 세션을 합류시키므로 같은 값을 쓰면 전략 상태와 계좌
  범위가 섞인다. 값 발급은 gh-trade 측 users.toml 운영 절차이며 여기에 적지 않는다.
- `dma_credentials` 테이블은 15-09 마이그레이션이 만든다. 그 전에는 DB 오류로 끝난다.

---

## 컨테이너

빌드 컨텍스트는 **저장소 루트**다 (pnpm 워크스페이스라 lockfile·shared 가 필요하다).

```bash
docker build --platform=linux/amd64 --build-arg GIT_SHA=$(git rev-parse --short HEAD) \
  -f relay/Dockerfile -t gh-radar-relay:local .
```

- 멀티스테이지 + `pnpm deploy --prod` 로 dev 의존성이 최종 이미지에 들어가지 않는다.
- `USER app` non-root 로 실행한다 (T-15-23).
- VM 에서는 `--restart=always` 로 돌고, openconnect 는 host systemd 소관이라 컨테이너
  재시작이 VPN 터널을 흔들지 않는다 (D-07).
- 종료 시 wss 를 `1001`(going away)로 닫고 DMA 세션을 정리한다 — 재시작마다 게이트웨이에
  고아 세션이 쌓이지 않게 하는 것이 목적이다.

---

## 구조

```
src/
  index.ts              부팅 결선 + graceful shutdown
  config.ts             env 로더 (유일한 env 진입점)
  logger.ts             pino + GCP 포맷 + 비밀 redact
  dma/                  DmaClient(TCP 수명) · DmaSession(상태기계) · SessionManager(참조계수)
  hub/                  SubscriptionHub — 구독 참조계수 · 스냅샷 캐시 · 체결 배치
  ws/                   WsFanout(첫 메시지 인증 · 백프레셔) · protocol(zod)
  auth/                 verifyToken
  store/                supabase 클라 팩토리 · dma_credentials 암/복호
  order/                order-api — /healthz + 공유 비밀 관문
  generated/            flatc 산출물 (D-26 — 수정 금지, sync-relay-schema.sh 가 관리)
```
