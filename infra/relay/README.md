# radar-gw — DMA relay VM 운영 문서

Phase 15 (RELAY-03) 의 IaaS 자산. gh-radar 최초의 GCE VM 이다.

> **비밀 값은 이 문서에 절대 적지 않는다.** 계정 ID·접속 비밀 값·인증서 핀·공유 비밀은
> 전부 Secret Manager 또는 VM 의 `/etc/kbvpn.env`(0600) 에만 존재한다.

---

## 구성 개요

| 항목 | 값 |
|------|-----|
| VM 이름 | `radar-gw` |
| 존 / 리전 | `asia-northeast3-a` / `asia-northeast3` |
| 머신 타입 | `e2-micro` (2 vCPU 공유 / 1024 MB) |
| 이미지 | `debian-12` (debian-cloud) |
| 부팅 디스크 | 20GB `pd-balanced` |
| 네트워크 | `gh-radar-vpc` / `gh-radar-subnet-an3` |
| 내부 고정 IP | `10.10.0.5` (`gh-radar-relay-internal`) |
| 외부 고정 IP | `gh-radar-relay-ip` (Cloud NAT 용 `gh-radar-static-ip` 와 **별개**) |
| 네트워크 태그 | `radar-gw` |
| 서비스 계정 | `gh-radar-relay-sa@gh-radar.iam.gserviceaccount.com` |
| 호스트명 | `dma.jx1.io` (443) |

### 방화벽 4규칙 (`gh-radar-vpc` 최초 규칙)

| 규칙 | 포트 | 출발지 | 목적 |
|------|------|--------|------|
| `relay-allow-https` | tcp:443 | `0.0.0.0/0` | Caddy TLS 종단 |
| `relay-allow-iap-ssh` | tcp:22 | `35.235.240.0/20` | IAP 터널 SSH 전용 |
| `relay-allow-internal-order` | tcp:8091 | 서브넷 대역 | Cloud Run → 주문 경로 |
| `relay-allow-wireguard` | udp:51820 | `0.0.0.0/0` | 개발기 WireGuard 직결 (인증은 피어 공개키) |

포트 80 은 열지 않는다 — Caddy 는 TLS-ALPN-01(443)로 인증서를 발급받는다.

> `relay-allow-wireguard` 의 출발지를 좁히지 않은 이유: 개발기의 공인 IP 가 유동이라
> 대역을 고정할 수 없고, **실제 인증은 피어 공개키**이기 때문이다 — WireGuard 는 유효한
> 키로 서명되지 않은 UDP 에 아무 응답도 하지 않고 버리므로(silent drop) 포트 스캔에
> 노출 표면이 생기지 않는다. 통과한 트래픽이 어디까지 가는지는 VM 의 nft 규칙이 따로
> 좁힌다(게이트웨이 한 대의 9100·22 만 — §DMA 터널).

> `relay-allow-internal-order` 는 네트워크 태그가 아니라 출발지 대역으로만 좁혀져 있다.
> **Cloud Run 워크로드에는 네트워크 태그를 붙일 수 없기 때문**이다.
> 서브넷 전체가 허용되므로 방화벽만으로는 부족하고,
> relay OrderApi 의 공유 비밀 헤더(`gh-radar-relay-order-secret`)가 두 번째 방어선이다.

---

## 현재 운영 상태 (2026-09-08 실측)

> **이 절이 현재값 정본이다.** 아래의 날짜 붙은 절들(`현재 배포 상태` · `Phase 15 종결 상태` 등)은
> 그 시점의 스냅샷이며 증거로 보존한다 — 값이 다르면 이 절이 이긴다.

| 항목 | 값 | 확인 방법 |
|------|-----|-----------|
| relay 이미지 | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:a2c5238` | `docker inspect … .Config.Image` |
| `/healthz` | `200` · `{"status":"ok","vpn":true,"dma":true,"version":"a2c5238","sessionCount":1}` | `curl -s https://dma.jx1.io/healthz` |
| **`DMA_HOST` 실측 분류** | **실 게이트웨이 (`10.41.1.120`)** — mock 아님. **주문이 실계좌로 나간다** | `docker inspect … \| sed -n 's/^DMA_HOST=//p'` (키 하나만 추출) |
| `openconnect@kb` | `active` + **`enabled`** — 상시 유지가 정책이다 | `systemctl is-active` / `is-enabled` |
| `kbvpn-*` 타이머 | **2개** — `kbvpn-watchdog.timer`(10분 주기 회수) · `kbvpn-renew.timer`(일 06:00 KST 예약 재접속) | `systemctl list-timers 'kbvpn-*' --all` |
| 세션 인증 만료 예정 | `2026-09-20 04:03:55 UTC` (= 마지막 접속 `2026-09-06 04:03:55 UTC` + 14일) | `journalctl -u openconnect@kb \| grep -i 'Session authentication will expire'` 마지막 줄 |
| 기본 경로 | `default via 10.10.0.1 dev ens4` — 터널이 기본 경로를 탈취하지 않았다 | `ip route show default` |
| `caddy` | `active` | `systemctl is-active caddy` |

> 이 표의 값은 2026-09-08 19:0x KST 에 읽기 명령만으로 수집했다(quick-260908-py9).
> 라이브 전환 경위는 §실서버 라이브 상태, VPN 정책은 §VPN 조작 을 보라.

---

## 현재 배포 상태

> 15-07 Task 1 실측 (2026-09-05T13:45Z). `setup-relay-iam.sh` 최초 실제 실행 결과다.
> 인증서 행은 Task 3(D-06 DNS 게이트) 통과 후에 채운다.
> **이 절은 프로비저닝 시점 스냅샷이다.** 현재값은 위 §현재 운영 상태 가 정본.

| 항목 | 값 | 확인 시각 |
|------|-----|-----------|
| 외부 고정 IP (`gh-radar-relay-ip`) | `34.22.79.103` — status `IN_USE` | 2026-09-05T13:45Z |
| 내부 고정 IP (`gh-radar-relay-internal`) | `10.10.0.5` | 2026-09-05T13:45Z |
| VM 상태 | `radar-gw` **RUNNING** · `canIpForward=False` | 2026-09-05T13:45Z |
| 존 / 머신 타입 | `asia-northeast3-a` / `e2-micro` | 2026-09-05T13:45Z |
| 이미지 | `debian-12-bookworm-v20260902` | 2026-09-05T13:45Z |
| 부팅 디스크 | 20GB · `pd-balanced` | 2026-09-05T13:45Z |
| Shielded VM | secure-boot · vTPM · integrity-monitoring 모두 on | 2026-09-05T13:45Z |
| 방화벽 (`gh-radar-vpc`) | 정확히 3규칙 — 443 공인 / 22 IAP대역 / 8091 서브넷 *(당시 — 현재는 4규칙, §구성 개요)* | 2026-09-05T13:45Z |
| `free -m` 여유 | total 969 · used 417 · **available 552** · swap 1024M(사용 11M) | 2026-09-05T13:45Z |
| 툴체인 | docker 20.10.24 · openconnect **v9.01-3** · caddy **v2.11.4** | 2026-09-05T13:45Z |
| `caddy` | `enabled` + `active` — D-06 DNS 게이트 통과 후 기동 | 2026-09-05T14:16Z |
| `openconnect@kb` | `disabled` + `inactive` — D-03 선검증 대기 | 2026-09-05T14:16Z |
| startup-script | `google-startup-scripts` 정상 종료 · 오류 0건 · 자산 6종 배치 완료 | 2026-09-05T14:15Z |
| DNS `dma.jx1.io` | `34.22.79.103` 단일 A 레코드 (로컬·8.8.8.8·1.1.1.1 3개 리졸버 일치) | 2026-09-05T14:10Z |
| 인증서 issuer | `C=US, O=Let's Encrypt, CN=YE1` · 챌린지 `tls-alpn-01` | 2026-09-05T14:16Z |
| 인증서 subject | `CN=dma.jx1.io` | 2026-09-05T14:16Z |
| 인증서 notBefore / **notAfter** | `2026-09-05 13:17:21 GMT` / **`2026-12-04 13:17:20 GMT`** | 2026-09-05T14:16Z |
| 외부 TLS 검증 | `curl` 체인 검증 통과 (`ssl_verify_result=0`) · `/healthz` 는 502 (relay 컨테이너 미배포 — 정상) | 2026-09-05T14:16Z |
| 포트 80 방화벽 규칙 | **0건** — 임시 개방 없이 TLS-ALPN-01 로 1회에 발급 성공 | 2026-09-05T14:16Z |

### relay 컨테이너 (15-08 배포)

> 15-08 Task 3 실측 (2026-09-06). `deploy-relay.sh` 최초 실제 실행 결과다.
> 이 배포의 `DMA_HOST` 는 **로컬 mock(`127.0.0.1`)** 이다 — 실서버 접속은 D-27 상 15-20 소관.
>
> ⚠️ **superseded:** 이 문장은 2026-09-06 시점 기록이다. 현재 `DMA_HOST` 는 **실 게이트웨이**다 — §현재 운영 상태.

| 항목 | 값 | 확인 시각 |
|------|-----|-----------|
| 이미지 | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:e6f39e5` (+ `:latest`) | 2026-09-06 |
| 컨테이너 | `gh-radar-relay` — **Up** · `restart=always` · `network=host` | 2026-09-06 |
| 메모리 상한 | `--memory=384m` / `--memory-swap=768m` (`Memory=402653184`, `MemorySwap=805306368`) | 2026-09-06 |
| 로그 | `json-file` · `max-size=10m` · `max-file=3` (Ops Agent 미설치 — Pitfall 11) | 2026-09-06 |
| 주입 env | `NODE_ENV=production` · `APP_VERSION=e6f39e5` · `WS_PORT=8090` · `ORDER_API_PORT=8091` · **`DMA_HOST=127.0.0.1`** · `DMA_PORT=9100` · `DMA_BROKER=KB` | 2026-09-06 |
| 비밀 주입 경로 | VM 안에서 메타데이터 토큰 → Secret Manager REST → **tmpfs env-file(0600)** → `--env-file` → 즉시 삭제 (T-15-29) | 2026-09-06 |
| 공개 `/healthz` | **200** · `{"status":"ok","vpn":true,"dma":true,"version":"e6f39e5","sessionCount":0}` · `ssl_verify_result=0` · 계좌·사용자 식별자 **미포함** | 2026-09-06 |
| `free -m` (컨테이너 기동 후) | total 969 · used **491** · available 478 — 700MB 기준 **여유. e2-small 전환 불필요** | 2026-09-06 |
| `docker stats` | `48.85MiB / 384MiB` · cpu 0.03% (세션 0개 기준) | 2026-09-06 |
| uptime check | `gh-radar-relay-healthz` — https / 443 `/healthz` · period 1분 · `validate-ssl` · 2xx | 2026-09-06 |
| 알림 정책 | `gh-radar-relay-down` (`projects/gh-radar/alertPolicies/7995724305267722560`) · enabled · 채널 결선됨 | 2026-09-06 |
| `smoke-relay.sh` | **PASS 9 / FAIL 0 / SKIP 1** — INV-4 는 `openconnect@kb=inactive` 로 SKIP | 2026-09-06 |
| 내부 포트 공인 노출 | `8091` · `9100` 둘 다 **차단 확인** (INV-7, `nc` 실패해야 PASS) | 2026-09-06 |

**배포 / 롤백:**

```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://<ref>.supabase.co \
NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh

bash scripts/deploy-relay.sh --rollback <이전 SHA>   # 빌드 없이 태그만 되돌린다
bash scripts/smoke-relay.sh                           # INV-1~10
bash scripts/smoke-relay.sh --check-tls               # 인증서만 (익일 재확인용)
```

> 🚨 **재배포 함정 — `DMA_HOST` 를 반드시 넘겨라.**
> `deploy-relay.sh` 는 `DMA_HOST` 미지정 시 `127.0.0.1`(로컬 mock)을 기본값으로 쓴다(스크립트 95행).
> **현재 라이브는 실 게이트웨이로 떠 있으므로, 넘기지 않고 재배포하면 조용히 mock 으로 되돌아가
> 라이브가 죽는다.** 배포 끝에 스크립트가 출력하는 `LIVE_DMA_HOST` 값을 매번 눈으로 확인할 것.
> 반대로 실서버 주소를 넘기면 스크립트가 경고를 출력한다 — 그 경고는 이제 정상 경로의 일부다.

### 주문 경로 결선 (15-19 재배포)

> 15-19 Task 2 실측 (2026-09-06). relay·server 를 최신 코드로 재배포하고 주문 경로를
> 결선했다. 이 배포의 `DMA_HOST` 도 **로컬 mock(`127.0.0.1`)** 이다 — 실서버 접속은 D-27 상 15-20 소관.
>
> ⚠️ **superseded:** 이 문장도 2026-09-06 시점 기록이다. 현재는 실 게이트웨이 라이브 — §현재 운영 상태.

| 항목 | 값 | 확인 시각 |
|------|-----|-----------|
| relay 이미지 | `…/relay:4ba6f83` (+ `:latest`) — 이전 `e6f39e5` 에서 교체 | 2026-09-06 |
| relay `/healthz` | **200** · `{"status":"ok","vpn":true,"dma":true,"version":"4ba6f83","sessionCount":0}` | 2026-09-06 |
| relay 컨테이너 | `Up` · `restart=always` · `48.4MiB / 384MiB` · `free -m` available 482 | 2026-09-06 |
| server 이미지 | `…/server:2bf2c0a` | 2026-09-06 |
| server 리비전 | **`gh-radar-server-00038-kc6`** — 트래픽 100% | 2026-09-06 |
| server `/api/health` | **200** · `version:"2bf2c0a"` | 2026-09-06 |
| **env 항목 수** | **17 → 20** (감소 0). 신규 3종 = `RELAY_INTERNAL_URL` · `ORDER_TIMEOUT_MS` · `RELAY_ORDER_SECRET` | 2026-09-06 |
| 기존 env 잔존 | `SUPABASE_URL` · `ANTHROPIC_API_KEY` · `DISCUSSION_CLASSIFY_ENABLED(false)` 모두 유지 — 전량 치환 소실 0건 (T-15-55) | 2026-09-06 |
| `RELAY_INTERNAL_URL` | `http://10.10.0.5:8091` (VM 내부 고정 IP) | 2026-09-06 |
| `RELAY_ORDER_SECRET` | Secret Manager `gh-radar-relay-order-secret:latest` 참조 바인딩 (값 미기록) | 2026-09-06 |
| relay 클라이언트 부팅 | 기동 로그에 `RELAY_… not set` 경고 **0건** → `createRelayClient` 성공 = 사설 대역 가드(10.10.0.0/26) 통과 | 2026-09-06 |
| `POST /api/orders` 미인증 | **401 UNAUTHENTICATED** (라우트 결선 + 인증 관문 확인) | 2026-09-06 |
| `GET /api/orders` 미인증 | **401 UNAUTHENTICATED** | 2026-09-06 |
| `smoke-server.sh` | **PASS 14 / FAIL 0 / SKIP 0** | 2026-09-06 |
| `smoke-relay.sh` | **PASS 11 / FAIL 0 / SKIP 2** — INV-4(VPN 수동 유닛) · INV-9(아래) | 2026-09-06 |
| 내부 포트 공인 노출 | `8091` · `9100` 둘 다 **여전히 차단** — 이번 배포로 열리지 않았다 (INV-7 재확인) | 2026-09-06 |
| 방화벽 | 여전히 정확히 3규칙 (443 / 22 / 8091). **포트 80 규칙 0건** *(당시 — 현재는 4규칙, §구성 개요)* | 2026-09-06 |
| `dma_orders` 접근 경계 | service_role 조회 성공 · **anon 차단** (INV-10, RLS 회귀 없음) | 2026-09-06 |

#### ⚠️ 미측정: Cloud Run → VM 8091 도달성 (INV-9 = SKIP)

`POST /api/orders` 는 relay 를 부르기 **전에** allowlist 를 지난다 —
`dma_credentials` 행이 있어야 통과한다(D-12). 현재 이 테이블은 **0행**이라,
인증 토큰이 있어도 요청이 `403 DMA_NOT_ALLOWED` 로 끊겨 **relay 까지 가지 않는다.**
따라서 `409 SESSION_NOT_READY`(= 도달성의 증거)는 아직 관측되지 않았다.

- 이것은 **실패가 아니라 미측정**이다. `503 RELAY_UNAVAILABLE` 은 한 번도 나오지 않았고,
  설정 측 근거(부팅 시 relay 클라이언트 구성 성공 · env 결선 · 방화벽 8091 서브넷 허용)는 모두 확인됐다.
- 측정하려면 **`dma_credentials` 행 1개 + 그 사용자의 로그인 토큰**이 필요하다.
  자격증명 등록은 실계정 비밀번호를 다루므로 15-19 범위 밖이며 **15-20 소관**이다.
- 등록 후 재측정:
  ```bash
  SMOKE_AUTH_TOKEN=<로그인 access_token> bash scripts/smoke-relay.sh   # INV-9
  ```
  기대값은 **409 `SESSION_NOT_READY`** 다. `503 RELAY_UNAVAILABLE` 이면 env 미주입 또는 방화벽 문제다.

### Secret 3종 상태

값은 어디에도 기록하지 않는다. 버전 **개수**만 상태 지표로 남긴다.

| Secret | ENABLED 버전 | 주입 주체 |
|--------|-------------|-----------|
| `gh-radar-dma-cred-key` | 1 | 15-07 이 `openssl rand -base64 32` 로 로컬 생성해 주입 |
| `gh-radar-relay-order-secret` | 1 | 15-07 이 `openssl rand -base64 32` 로 로컬 생성해 주입 |
| `gh-radar-kb-vpn-password` | 1 | **사용자가 직접 주입** (15-07 완료) — D-03 선검증의 전제 |

relay 컨테이너는 위 3종 중 `dma-cred-key` · `relay-order-secret` 2종에 더해
**`gh-radar-supabase-service-role`** 도 읽는다(wss 토큰 검증 + `dma_credentials` 조회).
15-06/15-07 의 Secret 단위 바인딩 목록에 이 4번째가 빠져 있어 15-08 이 추가했다 —
`setup-relay-iam.sh` 는 이 Secret 을 **생성하지 않고 바인딩만** 한다(워커들이 공유하는 기존 자산).

> ⚠️ **컨테이너 env 를 넓은 패턴으로 grep 하지 말 것.**
> `docker inspect ... .Config.Env | grep -E 'DMA_'` 같은 조회는 `DMA_CRED_KEY` 값까지
> 화면·로그에 그대로 띄운다. 확인이 필요하면 **키 이름만** 뽑을 것:
>
> ```bash
> sudo docker inspect gh-radar-relay --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1
> ```
>
> 값 확인이 꼭 필요하면 대상 키 하나만 지정하고, 출력은 파일로 받아 즉시 지운다.

> ⚠️ `gcloud secrets list --filter='name~gh-radar-(a|b|c)'` 형태는 쓰지 말 것.
> gcloud 필터 문법이 선행 `(` 를 그룹 토큰으로 해석해 조용히 0건을 반환한다.
> 검증에는 `--filter='name~A OR name~B OR name~C'` 를 쓴다.

### D-03 선검증 전제 — **해소 완료 (2026-09-05, 15-07)**

> 아래 두 전제는 15-07 Task 2 착수 전에 채워졌고, 선검증은 **시도 1회 / 상한 3** 으로 통과했다.
> 결과는 `.planning/phases/15-…/15-VPN-PREFLIGHT.md` 에 있다. 이 절은 이력으로 남긴다.

1. ~~`/etc/kbvpn.env` 부재~~ → **배치 완료.** `KBVPN_SERVER` · `KBVPN_AUTHGROUP` · `KBVPN_SERVERCERT` · `KBVPN_USER` 4키가 VM 에 0600 으로 존재한다(값은 저장소에 없다).
2. ~~`gh-radar-kb-vpn-password` 값 부재~~ → **주입 완료.** 사용자가 직접 넣었고 ENABLED 버전 1개.

전제가 다시 깨지지 않는 한 `systemctl start openconnect@kb` 는 실행 가능하다. 다만
**무의미한 재시도는 금지**한다 — 실패가 `StartLimitBurst=5/1h` 예산과 KB 계정 시도 횟수를
함께 소모한다.

---

## Phase 15 종결 상태 (15-20, 2026-09-06)

> phase 를 닫는 시점의 운영 상태다. 성공 기준 SC-1~SC-8 의 집계와 미증명 항목은
> `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md` 가 정본이다.
>
> ⚠️ **이 절은 2026-09-06 종결 시점의 스냅샷이다.** 이후 변경(VPN 상시 유지 전환 · 실서버 라이브 전환)은
> 반영돼 있지 않다 — 아래 표의 `VPN 기동 정책 = 수동 전용` · `kbvpn-* 타이머 0건` · `DMA_HOST = 127.0.0.1`
> 세 행은 **모두 현재 사실이 아니다.** 현재값은 §현재 운영 상태 가 정본이다.
> 날짜 붙은 행 자체는 그 시점의 증거이므로 지우지 않는다.

| 항목 | 값 | 확인 방법 |
|------|-----|-----------|
| relay 이미지 | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:4ba6f83` | `/healthz` 의 `version` |
| **`DMA_HOST` 현재 값** | **`127.0.0.1` (로컬 mock)** — 실서버 주소 아님 | `docker inspect` 에서 `DMA_HOST` 키 하나만 추출 |
| 컨테이너 env 안의 `10.41.1.120` | **0건** | `docker inspect … \| grep -c '10\.41\.1\.120'` |
| relay `/healthz` | `200` · `{"status":"ok","vpn":true,"dma":true,"version":"4ba6f83","sessionCount":0}` · `ssl_verify_result=0` | `curl https://dma.jx1.io/healthz` |
| server 리비전 | `gh-radar-server-00038-kc6` (트래픽 100%) | `gcloud run services describe gh-radar-server` |
| **VPN 기동 정책** | **수동 전용.** `openconnect@kb` = `disabled` + `inactive`. 자동 기동 미등록 — 장중 외 내려가 있는 것이 정상이며 `smoke-relay.sh` 는 이를 FAIL 이 아니라 **SKIP(INV-4)** 으로 센다 | `systemctl is-active` / `is-enabled` |
| 기본 경로 | `default via 10.10.0.1 dev ens4` · `tun0` 없음 · `kbvpn-*` 타이머 0건 | `ip route show default` |
| 알림 정책 | **`gh-radar-relay-down`** — `projects/gh-radar/alertPolicies/7995724305267722560` · `enabled=True` · uptime check `gh-radar-relay-healthz` 결선 | `gcloud alpha monitoring policies list` |
| 방화벽 | 정확히 **3규칙** (`443 ← 0.0.0.0/0` · `22 ← 35.235.240.0/20` · `8091 ← 10.10.0.0/26`). **포트 80 규칙 0건** *(당시 — 현재는 4규칙, §구성 개요)* | `gcloud compute firewall-rules list` |
| 고정 IP | `gh-radar-relay-ip 34.22.79.103` · `gh-radar-relay-internal 10.10.0.5` — 둘 다 `IN_USE` | `gcloud compute addresses list` |
| `smoke-relay.sh` | **11 PASS / 0 FAIL / 2 SKIP** (INV-4 VPN 수동 유닛 · INV-9 로그인 토큰 필요) | — |
| `smoke-server.sh` | **14 PASS / 0 FAIL / 0 SKIP** | — |
| `smoke-relay.sh --check-isin` | 3 PASS / **1 FAIL** — 활성 주식 2,749 중 isin NULL **42종목**(커버리지 98.5%). 근본 원인은 `master-sync` 의 `basDd` 선재 결함 | — |

### 인증서 **익일 재확인** (`--check-tls`)

발급 2026-09-05 → 재확인 **2026-09-06**. 15-VALIDATION 의 "배포 직후 1회 + 다음 날 1회" 규약 이행.

```
subject = CN=dma.jx1.io
issuer  = C=US, O=Let's Encrypt, CN=YE1
notBefore = Sep  5 13:17:21 2026 GMT
notAfter  = Dec  4 13:17:20 2026 GMT     ← 갱신 여유 89일
```

```bash
bash scripts/smoke-relay.sh --check-tls   # 인증서만 재확인
```

### 🔴 실서버 라이브 상태 (D-27 해제됨)

**relay 는 현재 실 DMA 게이트웨이(`10.41.1.120:9100`)에 붙어 라이브로 돌고 있다.**

- 15-20 종결 시점에는 A안(`skip-live`)이라 mock 이었다. 그 뒤 커밋 `f13eb7d` 로 **D-17
  (gh-radar 전용 DMA `user_id`)이 철회**돼 웹이 WinForms 와 **동일 세션에 합류**했고,
  `DMA_HOST` 가 실 게이트웨이로 전환됐다. 게이트웨이가 세션(user_id+broker) 단위로 모든
  연결에 응답을 팬아웃하므로 웹과 WinForms 가 같은 전략·계좌 상태를 본다.
- 근거(2026-09-08 18:34 KST 실측): `curl https://dma.jx1.io/healthz`
  → `{"status":"ok","vpn":true,"dma":true,"version":"a2c5238","sessionCount":1}`

> 🚨 **실계좌 경고.** 주문 경로가 이제 **실계좌**에 닿는다. 장중 조작·스모크·디버깅에서
> `POST /api/orders` · relay `OrderApi` · DMA 로그인 호출을 **하지 않는다.**
> 읽기(`/healthz` · `systemctl` · `journalctl` · `docker inspect`)만으로 확인한다.
> 주문을 실제로 넣어야 하는 검증은 사용자의 명시 지시가 있을 때만, 그 자리에서 수행한다.

---

## VM 접근 — IAP 터널 SSH

공인망에 22 를 열지 않으므로 SSH 는 IAP 터널로만 가능하다.

```bash
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a
```

접속이 거부되면 실행 주체에 `roles/iap.tunnelResourceAccessor` 가 있는지 확인한다.

**라우팅이 탈취되어 IAP SSH 조차 막힌 경우의 복구 경로 = 직렬 콘솔.**
VPN 을 처음 켤 때는 반드시 별도 터미널에 직렬 콘솔을 미리 열어 둔다.

```bash
gcloud compute connect-to-serial-port radar-gw --zone=asia-northeast3-a
```

---

## DMA 터널 — 개발기에서 게이트웨이 직결

개발기(Mac / Windows)가 KB VPN 없이 **`10.41.1.120:9100` 에 주소 그대로** 붙게 한다.
radar-gw 가 이미 VPN 을 상시 물고 있으므로(§VPN 조작) 그 세션을 빌린다.

경로가 **두 갈래**다. 기본은 A(WireGuard)이고, UDP 51820 이 막힌 망에서만 B(IAP)로 간다.
**사용자 관점 절차(설치 → 등록 → 연결 → 확인, Mac / Windows 구분)는 [`docs/dma-tunnel-guide.md`](../../docs/dma-tunnel-guide.md) 에 있다.**

| 갈래 | 경로 | 언제 |
|------|------|------|
| **A. WireGuard (기본)** | 개발기 WireGuard (mac: `brew wireguard-tools` · win: 공식 앱) → UDP 51820 → radar-gw `wg0` → `tun0` → 게이트웨이 | 평소. gcloud·별칭·포워딩 프로세스가 필요 없다 |
| **B. IAP 터널 (폴백)** | `scripts/dma-tunnel.sh` / `.ps1` → IAP → radar-gw → `tun0` → 게이트웨이 | UDP 51820 이 막힌 망 (사내 방화벽·일부 호텔/공용 Wi-Fi) |

> 🔴 **이 터널 너머는 실계좌가 걸린 실 게이트웨이다** (§실서버 라이브 상태).
> **두 갈래 모두**, 도구는 **TCP connect 후 즉시 close** 하는 도달성 확인까지만 한다 —
> 로그인·주문 프레임을 보내지 않는다 (D-27). 터널을 연 다음 무엇을 보내는지는 사용자 책임이다.

---

### A. WireGuard 직결 (기본)

> 🔴 **터널 너머는 실계좌 실 게이트웨이다.** 도달성 확인(`nc -z`)까지만. 로그인·주문 금지 (D-27).

VM 쪽 자산은 `infra/relay/startup.sh` **섹션 8** 이 부팅마다 멱등하게 만든다
(`wg0` = `10.20.0.1/24` · UDP 51820 · nft `wgfwd` · `DOCKER-USER` 우회 · `wg-peer-add`).
피어가 닿을 수 있는 곳은 **`10.41.1.120` 의 `9100`·`22` 두 포트뿐**이고, 그 외 `wg0` 출입은
명시적으로 drop 된다. 클라이언트 `AllowedIPs` 도 `/32` 하나라 기본 경로를 뺏지 않는다.

발급 절차는 **OS 별로 갈린다.** mac 은 GUI 앱을 쓰지 않고 `brew wireguard-tools` 를
메뉴바 앱이 직접 몬다. Windows 는 공식 앱 + 템플릿 방식을 그대로 쓴다.

#### Mac (권장 — 앱 설치 불필요, 최초 1회)

1. 도구를 설치한다. `wireguard-go` 와 brew `bash` 를 함께 끌고 온다:

   ```bash
   brew install wireguard-tools
   ```

2. 관리자에게 **서버 공개키**와 **배정 주소 `10.20.0.<N>`** 을 받는다.
   관리자 쪽 확인 명령:

   ```bash
   sudo wg show wg0 public-key
   ```

3. 설치 스크립트를 실행하고, 진행 중 물어보는 두 값을 입력한다:

   ```bash
   bash scripts/install-vpn-menubar.sh
   ```

   스크립트가 키쌍을 만든다. **개인키는 `$(brew --prefix)/etc/wireguard/KB-DMA.conf`
   (root:wheel 0600) 안에만** 들어가고 화면·로그·클립보드에 나오지 않는다.
   화면에 뜨는 것은 **공개키 하나뿐**이다.
4. 그 공개키를 관리자에게 전달한다. 관리자가 VM 에서 등록한다:

   ```bash
   sudo /usr/local/sbin/wg-peer-add <이름> <공개키> 10.20.0.<N>
   ```

   `wg-peer-add` 는 공개키 형식·주소 범위를 검증하고, **같은 공개키나 같은 주소가 이미
   있으면 거부한다**(주소 중복은 오류 없이 라우팅만 조용히 망가지기 때문이다).
5. 등록이 끝나면 **스크립트를 다시 실행할 필요 없이** 메뉴바에서 터널을 토글한다.
6. 연결 후 도달성만 확인한다:

   ```bash
   nc -z 10.41.1.120 9100 && echo reachable
   ```

> 2번 값을 아직 못 받았다면 3번은 WARN 을 내고 **설정 파일을 만들지 않는다**
> (자리표시자를 쓰지 않는다). 그동안 터널 메뉴는 비활성이고 KB VPN 직결·교보는 그대로 동작한다.
> 값을 받은 뒤 **스크립트를 다시 실행**하면 채워진다. 재실행해도 **키는 재생성되지 않아**
> 이미 등록된 피어가 그대로 살아 있다.

#### Windows (공식 앱, 최초 1회)

1. WireGuard 공식 앱 설치 (<https://www.wireguard.com/install/>).
2. 앱에서 **「빈 터널 만들기 (Add empty tunnel)」** 로 키쌍을 생성한다.
   → 개인키가 개발기 밖으로 나가지 않는 유일한 방법이다.
3. 화면에 뜬 **공개키만** 관리자에게 전달한다.
4. 관리자가 VM 에서 피어를 등록한다 (`wg-peer-add`, 위 Mac 4번과 같은 명령).
5. 관리자가 `sudo wg show wg0 public-key` 로 서버 공개키를 확인해 회신한다.
6. `infra/relay/wireguard/client.conf.template` 을 받은 값으로 채워 앱에 import 한다.
   <!-- 템플릿 상단의 "Mac / Windows 공용" · 메뉴바 관련 문구는 v3.5 시절 표현이다.
        mac 은 v3.6 부터 템플릿을 쓰지 않는다 (설치 스크립트가 conf 를 만든다).
        파일 자체는 Windows 용으로 계속 유지한다. -->
7. 연결 후 도달성만 확인한다:

   ```powershell
   Test-NetConnection 10.41.1.120 -Port 9100
   ```

   (WSL·git-bash 라면 `nc -z 10.41.1.120 9100`)

> ⚠️ **개인키·공개키의 실값을 이 문서나 저장소 어디에도 적지 않는다.**
> 서버 개인키는 VM 의 `/etc/wireguard/wg0.key`(0600) 안에만 존재한다. 클라이언트 개인키는
> **mac** 은 `$(brew --prefix)/etc/wireguard/KB-DMA.conf`(root:wheel 0600),
> **win** 은 WireGuard 앱의 로컬 저장소 안에만 존재한다. 템플릿에는 플레이스홀더만 둔다.

**메뉴바 앱 (macOS, v3.6)** — 개인 설치 스크립트 `scripts/install-vpn-menubar.sh`
(**git 미추적 개인 파일** — KB VPN 접속 파라미터가 들어 있어 저장소에 넣지 않는다)
가 만드는 `VPN.app` 이 터널을 직접 올리고 내린다:

```
VPN.app → sudo -n /usr/local/sbin/kbdma-connect
        → wg-quick up $(brew --prefix)/etc/wireguard/KB-DMA.conf
```

- **상태 판정 축은 하나** — utun 인터페이스에 `10.20.0.x` 가 붙어 있으면 연결됨이다.
- **선행 점검 5항목** — ① `wg-quick` 설치 ② `KB-DMA.conf` 존재 ③ `sudo -n` 면제 등록
  ④ VM 쪽 VPN 활성(`/healthz` 의 `"vpn":true`) ⑤ 로컬 KB VPN 충돌 없음.
  점검은 아무것도 바꾸지 않는다.
- **재연결을 대신해 줄 GUI 앱이 없다.** `PersistentKeepalive = 25` 로 NAT 만료를 늦추지만,
  세션이 죽으면 사용자가 메뉴에서 다시 토글해야 한다.
- KB VPN 직결과 터널은 **동시에 쓸 수 없다** (라우팅이 겹친다). 한쪽이 켜지면 다른 쪽이 잠긴다.

**mac 클라이언트 자산** (설치 스크립트가 만든다)

| 경로 | 소유 · 권한 | 역할 |
|------|-------------|------|
| `/usr/local/sbin/kbdma-connect` | root:wheel 0755 | 인자 없음. PATH 를 고정하고 `wg-quick up` |
| `/usr/local/sbin/kbdma-disconnect` | root:wheel 0755 | 인자 없음. `wg-quick down` 후 항상 `exit 0` |
| `$(brew --prefix)/etc/wireguard/` | root:wheel **0755** | 사용자 프로세스(앱)가 conf **존재만** 확인할 수 있어야 한다 |
| `$(brew --prefix)/etc/wireguard/KB-DMA.conf` | root:wheel **0600** | 클라이언트 **개인키가 여기에만** 있다. 앱도 읽지 못한다 |
| `/etc/sudoers.d/kbvpn` | 0440 | NOPASSWD 4개 — VPN 직결 2 + DMA 터널 2 |
| `/var/log/kbdma.log` | 0644 | `wg-quick` 출력. 터널 실패 알림이 이 경로를 지목한다 |

> 디렉터리를 0700 으로 잠그지 않는 이유: 0700 root 디렉터리는 사용자 권한으로 도는 앱의
> traverse 자체를 막아 "conf 존재" 점검이 **항상 거짓**이 되고 터널 메뉴가 영구 비활성이 된다.
> 개인키의 비공개는 **파일 0600** 이 지키고, 디렉터리에서 드러나는 것은 이 문서에도 적혀 있는
> 파일명 하나뿐이다.

---

### B. IAP 터널 (폴백)

> 🔴 **터널 너머는 실계좌 실 게이트웨이다.** 도달성 확인까지만. 로그인·주문 금지 (D-27).

**UDP 51820 이 막힌 망**에서 쓴다. A 의 핸드셰이크가 아예 성립하지 않을 때가 그 신호다.

| 스크립트 | 대상 | IAP 경유 방식 |
|----------|------|---------------|
| `scripts/dma-tunnel.sh` | macOS | `gcloud compute ssh --tunnel-through-iap -- -N -L …` (1단) |
| `scripts/dma-tunnel.ps1` | Windows (PowerShell 5.1, 관리자) | `start-iap-tunnel` + 내장 `ssh.exe` (2단) |

#### 왜 `127.0.0.1` 이 아니라 주소 별칭인가

소비자(gh-trade WinForms `settings.ini` 의 `[DMA] Host=10.41.1.120`, relay 의 `DMA_HOST`)의
설정을 **하나도 바꾸지 않기 위해서**다. 로컬에 `10.41.1.120/32` 별칭을 붙이고 그 주소에
바인딩된 포워딩을 열면, 터널의 on/off 가 KB VPN 직결과 동치가 된다.
(A 는 별칭이 필요 없다 — 실제 라우팅이 그 주소로 가기 때문이다.)

- macOS: `sudo ifconfig lo0 alias 10.41.1.120 255.255.255.255` — 소유권 표식은 `lo0` + `netmask 0xffffffff`. VPN 은 절대 `lo0` 에 주소를 얹지 않는다.
- Windows: `New-NetIPAddress -PrefixLength 32 -SkipAsSource $true` (루프백 의사 인터페이스 우선, 실패 시 기본 경로 어댑터). `-SkipAsSource` 는 이 주소가 **나가는** 트래픽의 출발지로 뽑혀 로컬 통신이 깨지는 것을 막는다.

별칭은 종료 시(`Ctrl+C` 포함) 제거된다. 창을 강제 종료해 잔여물이 남으면 `--stop` / `-Stop` 이 복구 경로다.

#### 사용법

```bash
bash scripts/dma-tunnel.sh --check      # 아무것도 바꾸지 않고 선행 점검만
bash scripts/dma-tunnel.sh              # 터널 개설 후 Ctrl+C 까지 유지
bash scripts/dma-tunnel.sh --stop       # 잔여 별칭·프로세스 정리
```

```powershell
.\scripts\dma-tunnel.ps1 -Check        # 관리자 PowerShell 에서
.\scripts\dma-tunnel.ps1
.\scripts\dma-tunnel.ps1 -Stop
```

Windows 는 최초 1회 SSH 키가 필요하다. 없으면 스크립트가 아래를 안내하고 멈춘다
(**스크립트가 GCP 메타데이터를 직접 고치지 않는다** — 부수효과를 스크립트에 넣지 않는 원칙):

```powershell
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --project=gh-radar --command="echo ok"
```

#### 선행 점검 (`--check` / `-Check` 가 출력하는 항목)

| ID | 항목 | 실패 시 |
|----|------|---------|
| P1 | `gcloud` 존재 | exit 2 |
| P2 | 활성 인증 계정 | exit 2 |
| P3 | ssh 클라이언트 (win: OpenSSH 클라이언트 선택적 기능) | exit 2 |
| P4 | `radar-gw` = RUNNING | exit 2 |
| P5 | `/healthz` 의 `"vpn":true` — VM 쪽 VPN 이 죽었으면 터널이 무의미 | exit 2 |
| P6 | 로컬 KB VPN 충돌 없음 | **exit 3** |
| P7 | 권한 (mac: 대화형 sudo 가능하므로 WARN / win: 관리자 필수) | win 만 exit 2 |
| P8 | (win) SSH 개인키 존재 | exit 2 |

`--check` 는 **아무것도 바꾸지 않는다**(별칭 미생성·프로세스 미기동). 그래서 첫 실패에서 멈추지 않고
전 항목을 평가한 뒤 `PASS: n  FAIL: n` 요약을 낸다 — P6 이 먼저 걸려도 나머지 항목을 관측할 수 있다.

**종료 코드:** 0 성공 / 1 인자 오류 / 2 선행 점검 실패 / 3 로컬 KB VPN 충돌 / 4 별칭 추가 실패 / 5 재연결 상한(5회) 도달.

> **실측 근거 (2026-09-09, quick-260909-el9):** VM sshd 는 `allowtcpforwarding yes` · `permitopen any`
> 라 `-L` 목적지로 `10.41.1.120:9100` 을 지정할 수 있다. Mac 에서
> `gcloud compute ssh radar-gw --tunnel-through-iap -- -N -L 19100:10.41.1.120:9100` 로
> 게이트웨이까지 TCP 연결이 성립하는 것을 확인했다(로그인·주문 없음).

---

### 검증 명령

**VM 에서 (읽기만):**

```bash
systemctl is-active wg-quick@wg0        # active 여야 한다
sudo wg show                            # 핸드셰이크 시각 · 피어 수 · 전송량
sudo nft list table inet wgfwd          # forward 4규칙 + postrouting masquerade
sudo iptables -S DOCKER-USER            # ACCEPT 두 줄이 있어야 한다
ip route show default                   # 반드시 `dev ens4` — tun0 면 즉시 중단
```

> ⚠️ `wg show` 는 **서버 공개키와 피어 공개키를 화면에 출력한다.** 로그·이슈·문서에
> 붙여 넣지 말 것. 개인키는 출력되지 않지만, 공개키도 피어 식별자이므로 남기지 않는다.

**클라이언트에서:**

```bash
nc -z 10.41.1.120 9100 && echo reachable   # connect 후 즉시 close. 프레임 없음
```

---

### 막힐 때

| 증상 | 원인 · 조치 |
|------|-------------|
| (A) 핸드셰이크는 되는데 `9100` 이 안 열림 | **docker 재시작으로 `DOCKER-USER` 규칙이 날아갔다.** `sudo systemctl restart wg-quick@wg0` 로 PostUp 재삽입 |
| (A) 핸드셰이크 자체가 없음 (`wg show` 에 latest handshake 없음) | 방화벽 `relay-allow-wireguard` 미생성, 또는 이 망이 UDP 51820 을 막는다 → **B(IAP 폴백)** 로 간다 |
| (A) 연결은 되는데 대용량 응답에서 멈춤 | MSS 클램프가 빠졌다. `sudo nft list table inet wgfwd` 에 `maxseg` 두 줄이 있는지 확인 |
| (A) `tun0` 재생성 후 무반응 | nft 규칙은 인터페이스 **이름** 기준이라 재생성에 영향받지 않는다 → openconnect 상태부터 확인 (§VPN 조작) |
| (A) 메뉴바 앱 터널 버튼이 잠김 | **mac**: `wireguard-tools` 미설치이거나 `KB-DMA.conf` 미생성 → `brew install wireguard-tools` 후 설치 스크립트 재실행. **win**: 프로필 이름 확인 |
| (A·mac) 토글은 눌리는데 즉시 실패 | `sudo -n /usr/local/sbin/kbdma-connect` 면제가 없거나, `wg-quick` 이 PATH 에서 `wireguard-go` 를 못 찾는다 → `/var/log/kbdma.log` 확인 후 설치 스크립트 재실행 |
| `deploy-relay.sh` 가 방화벽 불일치로 `exit 1` | 기대값이 4규칙인데 GCP 에 3번째까지만 있다 → **방화벽 4번째 규칙을 먼저 만든다** (§적용 런북 ①) |
| (B) `exit 3` 로 거부 | 설계다. 이미 KB VPN 직결이라 터널이 불필요하고 `10.41.0.0/16` 라우팅이 겹친다. VPN 을 내리고 재실행 |
| (B) P5 FAIL | VM 쪽 VPN 이 죽었다 → §VPN 조작 의 회수·재접속 절차 |
| (B) IAP 접속 거부 | 실행 주체에 `roles/iap.tunnelResourceAccessor` 확인 (§VM 접근) |
| (B) 창 강제 종료 후 잔여 별칭 | `--stop` / `-Stop` |

---

## 적용 런북 — WireGuard 최초 반영

> **실행 주체는 사용자 확인 후 오케스트레이터다.** 순서를 지킨다 — ① 을 건너뛰면 ② 이후의
> 배포·스모크가 방화벽 불일치로 막힌다.

```bash
# ① 방화벽 4번째 규칙 (deploy-relay.sh 게이트가 이 규칙을 기대하므로 반드시 먼저)
GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh

# ② 메타데이터 갱신은 ① 이 함께 수행한다. VM 재적용:
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo google_metadata_script_runner startup'

# ③ 확인 (읽기만)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='systemctl is-active wg-quick@wg0; sudo wg show wg0 public-key; sudo nft list table inet wgfwd; ip route show default'

# ④ 피어 등록 (사용자 공개키를 받은 뒤)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo /usr/local/sbin/wg-peer-add <이름> <공개키> 10.20.0.<N>'
```

- ③ 에서 `ip route show default` 가 **`dev ens4` 가 아니면 즉시 중단**하고 §VPN 조작 의
  복구 절차(라우팅 안전장치 · 직렬 콘솔)로 간다. 기본 경로를 잃으면 IAP SSH 도 막힌다.
- ③ 의 `sudo wg show wg0 public-key` 출력은 **클라이언트 프로필에 넣을 값**이다.
  사용자에게 직접 전달하고 문서·로그에는 남기지 않는다.
- ② 를 돌릴 때 `wg0` 이 **이미 떠 있었다면** `startup.sh` 는 재기동하지 않는다(끊김 방지).
  설정 재작성분을 반영하려면 `sudo systemctl restart wg-quick@wg0` 를 따로 실행한다.

---

## Secret 3종 값 주입

`setup-relay-iam.sh` 는 **빈 Secret 만 만든다.** 값은 사람이 넣는다.
값을 대화 로그·커밋·문서에 남기지 않는다.

```bash
# 애플리케이션이 쓰는 두 키는 로컬에서 생성해 바로 주입한다 (화면에 출력하지 않는다)
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add gh-radar-dma-cred-key      --data-file=-
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add gh-radar-relay-order-secret --data-file=-

# KB VPN 접속 비밀 값은 사용자가 직접 입력한다 (Claude 가 값을 묻지 않는다)
gcloud secrets versions add gh-radar-kb-vpn-password --data-file=-
```

### `/etc/kbvpn.env` (VM, 0600)

비밀 값이 아닌 접속 파라미터. 없으면 VPN 스크립트가 시작 전에 중단한다.

```sh
KBVPN_SERVER=https://<서버>:<포트>
KBVPN_AUTHGROUP=<authgroup>
KBVPN_SERVERCERT=pin-sha256:<인증서 핀>
KBVPN_USER=<접속 계정 ID>
```

---

## VPN 조작

**상시 유지가 정책이다.** `openconnect@kb` 는 `enabled`(부팅 자동 기동)이며, 워치독이
10분마다 점검해 `active` 가 아니면 1회 회수한다. 상시 접속이 아니면 사용자가 호가주문
탭을 열었을 때 relay 가 게이트웨이에 닿지 못한다.

정책 전환 근거: `1ef7cc7`(부팅 자동기동 + failed 회수 워치독) → `f9ca062`(재접속 상한 철회,
상시 유지 · 재부팅 후 조용히 죽던 구조 수정). **최초 연결만** 사람이 직렬 콘솔을 열고
관찰했고(15-07 D-03 선검증), 그 뒤로는 전부 자동이다.

```bash
systemctl is-active  openconnect@kb      # 상태
systemctl is-enabled openconnect@kb      # 부팅 자동 기동 여부 (enabled 가 정상)
sudo systemctl restart openconnect@kb    # 즉시 재접속 (세션 창을 지금 갱신)
sudo systemctl start openconnect@kb      # 시작
sudo systemctl stop  openconnect@kb      # 중지 — 워치독이 10분 안에 다시 켠다
journalctl -u openconnect@kb -n 50       # 최근 로그
journalctl -u openconnect@kb -f          # 실시간 관찰

journalctl -t kbvpn-watchdog -t kbvpn-renew --since '-7d'   # 자동 회수·주간 갱신 이력
systemctl list-timers 'kbvpn-*' --all                       # 타이머 2개가 정상

ip -br addr show tun0                    # 터널 IP
ip route                                 # 기본 경로가 ens4 인지 확인
```

> `stop` 은 영구 정지가 아니다. 워치독이 "active 가 아니면 켠다" 로 판정하므로 10분 안에
> 다시 올라온다. 정말로 내려 둬야 하면 워치독 타이머까지 멈춰야 한다
> (`sudo systemctl stop kbvpn-watchdog.timer`) — 그리고 **반드시 다시 켤 것.**

### 재시도 상한 — 이중 상한이며 회수는 자동이 기본이다

유닛의 `StartLimitIntervalSec=3600` + `StartLimitBurst=5` (**1시간 5회** 상한)는
**여전히 유효하고 그대로 유지한다.** 반복 인증 실패가 KB 계정 잠금으로 이어지는 것을 막는
안전장치다. 상한 초과 시 유닛이 `failed` 로 멈추는 것은 의도된 동작이다.

바뀐 것은 **그 상태를 사람이 아니라 워치독이 회수한다**는 점이다:

- `kbvpn-watchdog` 가 10분마다 돌며 `active` 가 아니면 `reset-failed` + `start` 를 **1회** 한다.
- 다만 **직전 회수로부터 1시간이 지나야** 다시 회수한다(스크립트 자체 상한).
- 따라서 상한은 이중이다 — **스크립트 시간당 1회** + **유닛 5회/1h**. 둘 다 계정 잠금
  보호 목적이므로 **어느 쪽도 완화하지 않는다.**

사람이 직접 리셋하는 것은 **원인을 확인한 뒤 즉시 복구가 필요할 때만** 한다
(워치독을 최대 10분 기다리는 대신):

```bash
sudo systemctl reset-failed openconnect@kb
sudo systemctl start openconnect@kb
```

> 상한에 걸렸다는 것은 무언가 잘못됐다는 뜻이다. 원인을 확인하기 전에 리셋하고
> 다시 시도하지 말 것. 시도 횟수는 계속 누적해서 세야 한다.

### 주간 예약 재접속 (`kbvpn-renew`)

| 항목 | 값 |
|------|-----|
| 왜 | 세션 인증이 **접속 시각 + 14일 롤링**으로 만료된다. 갱신하지 않으면 그 창이 언젠가 **장중에** 온다 |
| 언제 | 매주 일요일 06:00 KST — 유닛 값 `OnCalendar=Sun 06:00 Asia/Seoul` (systemd 252 가 캘린더 타임존을 직접 지원한다. VM 시계는 UTC 라 `list-timers` 에는 토요일 21:00 UTC 로 보인다) |
| 무엇을 | `systemctl restart openconnect@kb` **1회** + `logger -t kbvpn-renew` 로 시작·성공/실패 기록 |
| 실패 시 | **자체 재시도·백오프 없음.** 워치독(10분 주기)이 회수한다. 여기서 또 돌리면 `StartLimitBurst=5/1h` 예산과 KB 계정 시도 횟수를 이중으로 태운다 |
| 밀린 발화 따라잡기(`Persistent=true`) | **의도적으로 쓰지 않는다.** VM 이 며칠 꺼져 있다 장중에 부팅하면 놓친 발화가 그 자리에서 몰려 실행돼 **장중 재접속**이 걸린다. 한 주를 건너뛰어도 14일 창 안이라 손해가 없다 |
| 정본 | `infra/relay/startup.sh` 의 `install_renew_timer()` — VM 유닛은 이 함수가 매 부팅 재작성한다 |

```bash
systemctl list-timers 'kbvpn-*' --all    # watchdog + renew 2개가 정상
systemctl cat kbvpn-renew.timer          # OnCalendar 확인
journalctl -t kbvpn-renew --since '-30d' # 발화 이력
```

### 세션 인증 14일 롤링 — 만료 시 복구 경로

**만료는 계정 만료가 아니다.** KB 게이트웨이가 **접속 시각 + 14일**로 세션 인증 창을 준다.
재접속하면 그 시점부터 다시 14일이다. 확인은 마지막 줄만 보면 된다:

```bash
sudo journalctl -u openconnect@kb | grep -i 'Session authentication will expire' | tail -1
```

실측 2건 (로그 시각은 UTC):

```
Sep 05 14:28 접속 → Session authentication will expire at ... Sep 19 14:28
Sep 06 04:03 접속 → Session authentication will expire at ... Sep 20 04:03
```

**만료가 오면 이렇게 복구된다 (사람 개입 없이):**

1. 세션 인증 만료 → 게이트웨이가 세션 종료
2. `openconnect` 프로세스 종료 → 유닛이 `inactive` 또는 `failed`
3. **`kbvpn-watchdog` 가 10분 주기로 감지**
4. `systemctl reset-failed` + `systemctl start` **1회**
5. 새 14일 창 시작

**최악 지연 = 10분.** 단 직전 회수로부터 1시간이 지나지 않았다면 최대 **1시간** 대기한다
(워치독 자체 상한). **그 사이 호가·주문 경로가 끊긴다.**
→ 그래서 위의 **주간 예약 재접속**으로 만료가 장중에 오지 않게 창을 미리 민다.

즉시 수동 갱신이 필요하면:

```bash
sudo systemctl restart openconnect@kb    # KB 계정 인증 시도 예산을 1회 소모한다
```

### 3분 라우팅 안전장치

부팅 180초 뒤 `kbvpn-route-guard` 가 1회 실행되어, 기본 경로가 `tun*` 로 넘어가 있으면
`openconnect@*` 를 자동으로 중지한다. 로그는 `journalctl -t kbvpn-route-guard`.

---

## D-03 VPN 선검증 체크리스트 (7항목)

> ⚠️ **이 절은 2026-09-05 에 통과한 1회성 게이트의 이력이다** — 지금 실행할 절차가 아니다.
> 검증 결과는 `15-VPN-PREFLIGHT.md`, 현재 VPN 정책은 §VPN 조작 이 정본이다.
> 마지막 줄의 "검증이 끝나면 반드시 내린다"도 그 시점 규율이며, **지금은 상시 유지가 정책**이다.
>
> **[BLOCKING] 체크포인트.** 15-07 Task 2 에서 사용자와 함께 수행한다.
> **시도는 수동 최대 3회. 실패해도 자동 재시도하지 않는다** — 반복 실패는 KB 계정 잠금이다.
> 시작 전에 직렬 콘솔을 별도 터미널에 열어 두고, 연결 전 `ip route` / `curl -s ifconfig.me` 를 먼저 기록한다.

| # | 확인 항목 | 방법 | 판정 |
|---|-----------|------|------|
| 1 | 연결 성립 | `sudo systemctl start openconnect@kb` 후 `ip -br addr show tun0` | 주소가 잡히면 OK |
| 2 | 터널 IP | `ip -4 addr show tun0` | 값 기록 (Mac 실측은 3회 모두 동일 — 계정 고정 추정) |
| 3 | 출발지 공인 IP 제한 여부 | GCE 외부 IP 에서 연결 시도 | 성공 = 제한 없음. 실패 = **KB 문의로 전환** |
| 4 | Mac 세션과 동시 접속 | Mac 터널을 유지한 채 VM 에서 연결 | 둘 다 유지되는지 / 한쪽이 끊기는지 기록 |
| 5 | 라우팅 영향 | 연결 전후 `ip route` diff + `curl -s ifconfig.me` + `curl -sI https://secretmanager.googleapis.com` | 기본 경로가 `ens4` 유지 + 공인 IP 그대로 + 응답 있음. 무응답이면 **즉시 `sudo systemctl stop openconnect@kb`** |
| 6 | 게이트웨이 도달성 | `nc -zv 10.41.1.120 9100` | **연결만 확인, 로그인·주문 금지** (D-27). 포트가 열려 있는지만 본다 |
| 7 | 실패 처리 | 자동 재시도 없이 중단 | 시도 횟수 기록 후 즉시 사용자 보고. 3회 초과 금지 |

검증이 끝나면 반드시 내린다: `sudo systemctl stop openconnect@kb`
결과는 `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-VPN-PREFLIGHT.md` 에 기록한다.

### D-27 경고 — 현재 상태로 갱신

> 원문(2026-09-05, 선검증 시점): *실서버 게이트웨이(`10.41.1.120:9100`) 에 대한 로그인·주문은
> 사용자의 명시적 지시가 있기 전까지 금지한다. 선검증에서 허용되는 것은 `nc -zv` 도달성 확인까지다.*

**현재는 그 지시가 있었고 relay 가 실 게이트웨이에 붙어 라이브다**(§실서버 라이브 상태).
따라서 남는 금지는 하나로 좁혀진다:

🚨 **주문을 실제로 발생시키지 않는다.** 운영·디버깅·스모크 어느 경로에서도
`POST /api/orders` · relay `OrderApi` 호출을 하지 않는다. 주문 왕복 검증이 필요하면
사용자의 명시 지시를 받고 그 자리에서만 수행한다(절차는 `15-LIVE-VERIFICATION.md` §7 의
C안 안전 규율 — 1주 · 체결 불가 지정가 · 접수 즉시 취소).

---

## Caddy / TLS

DNS A 레코드가 확인되기 **전에는 절대 켜지 않는다.** Let's Encrypt rate limit 을 소진한다.

```bash
dig +short dma.jx1.io                    # 예약 고정 IP 와 일치하는지 먼저 확인
sudo systemctl enable --now caddy        # 일치 확인 후에만
journalctl -u caddy -n 50                # 발급 로그

echo | openssl s_client -connect dma.jx1.io:443 -servername dma.jx1.io 2>/dev/null \
  | openssl x509 -noout -issuer -dates
```

발급이 실패하면 **반복 시도하지 않는다.** 원인(전파 미완료 / 443 방화벽 / TLS-ALPN)을 먼저 확인하고,
필요하면 staging CA 로 검증한 뒤 프로덕션으로 전환한다.

### 기동 전에 반드시 설정을 먼저 검증한다

`caddy validate` 는 ACME 요청을 보내지 않으므로 rate limit 을 소모하지 않는다.
**설정 오류로 인한 기동 실패를 ACME 시도 전에 걸러낸다.**

```bash
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

> ⚠️ **`sudo caddy validate` (root) 로 실행하지 말 것.**
> validate 는 파일 로거 모듈을 실제로 provisioning 하기 때문에
> `/var/log/caddy/dma.log` 를 `root:root 0600` 으로 만들어 버린다.
> 그 상태로 caddy(`User=caddy`)가 기동하면 `permission denied` 로
> **설정 로드 자체가 실패**한다. 반드시 `sudo -u caddy` 로 실행한다.
> (startup.sh 가 매 부팅 `chown -R caddy:caddy /var/log/caddy` 로 자가 치유하지만,
> 재부팅 없이 복구하려면 직접 `sudo chown caddy:caddy /var/log/caddy/dma.log`.)

### 챌린지는 TLS-ALPN-01 로 고정돼 있다

포트 80 은 D-09 에 따라 영구 차단이라 HTTP-01 은 **절대 성공할 수 없다.**
Caddyfile 의 `issuer acme { disable_http_challenge }` 가 이를 명시적으로 꺼서
갱신 때마다 실패 검증이 누적되는 것을 막는다 (T-15-13).
이 설정을 지우면 갱신마다 무의미한 실패가 쌓인다.

설정을 리로드하면 진행 중인 WebSocket 이 강제 종료되므로 **장중 변경은 하지 않는다.**

---

## 자산 갱신 절차

`infra/relay/` 의 파일이 단일 정본이다. VM 에는 사본을 두지 않는다.
자산을 수정한 뒤:

```bash
GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh   # 메타데이터 갱신
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo google_metadata_script_runner startup'  # 재적용
```

`startup.sh` 는 매 부팅 실행되며 전 단계가 멱등이다.

WireGuard(섹션 8)를 **처음** 반영할 때는 방화벽 규칙이 먼저 필요하다 — §적용 런북 을 따른다.

---

## 메모리 예산 (1024 MB)

| 구성요소 | 추정 RSS |
|----------|----------|
| Debian 12 + systemd + sshd + guest agent | 120–180 MB |
| dockerd + containerd | 120–180 MB |
| Caddy | 30–60 MB |
| openconnect | 10–20 MB |
| relay (Node 22, 5 세션 + ws + deflate) | 120–250 MB |
| **합계** | **400–690 MB** (여유 330–620 MB) |

Ops Agent 는 설치하지 않는다(+150–250 MB 로 위험 구간 진입). 대신 Docker `json-file`
로그 로테이션 + Cloud Monitoring uptime check 로 관측한다.

**압박이 실측되면**(`dmesg | grep -i oom`, 컨테이너 재시작 반복) 머신타입만 올린다:

```bash
gcloud compute instances stop  radar-gw --zone=asia-northeast3-a
gcloud compute instances set-machine-type radar-gw --zone=asia-northeast3-a --machine-type=e2-small
gcloud compute instances start radar-gw --zone=asia-northeast3-a
```

외부/내부 고정 IP 는 예약되어 있으므로 재시작해도 주소는 바뀌지 않는다.

---

## 파일 맵

| 저장소 파일 | VM 배치 위치 | 권한 |
|-------------|--------------|------|
| `startup.sh` | 인스턴스 메타데이터 `startup-script` | — |
| `kbvpn-fetch-secret.sh` | `/usr/local/sbin/kbvpn-fetch-secret` | 0700 |
| `kbvpn-connect.sh` | `/usr/local/sbin/kbvpn-connect` | 0700 |
| `kbvpn-vpnc-wrapper.sh` | `/usr/local/sbin/kbvpn-vpnc-wrapper` | 0700 |
| `openconnect@.service` | `/etc/systemd/system/openconnect@.service` | 0644 |
| `Caddyfile` | `/etc/caddy/Caddyfile` | 0644 |
| _(생성됨)_ | `/usr/local/sbin/kbvpn-route-guard` | 0700 |
| _(생성됨)_ | `/usr/local/sbin/relay-docker-login` | 0700 |
| _(생성됨)_ | `/usr/local/sbin/kbvpn-watchdog` | 0700 |
| _(생성됨)_ | `/etc/systemd/system/kbvpn-watchdog.service` | 0644 |
| _(생성됨)_ | `/etc/systemd/system/kbvpn-watchdog.timer` | 0644 |
| _(생성됨)_ | `/usr/local/sbin/kbvpn-renew` | 0700 |
| _(생성됨)_ | `/etc/systemd/system/kbvpn-renew.service` | 0644 |
| _(생성됨)_ | `/etc/systemd/system/kbvpn-renew.timer` | 0644 |
| _(생성됨)_ | `/etc/wireguard/wg0.conf` | 0600 |
| _(생성됨)_ | `/etc/wireguard/wgfwd.nft` | 0600 |
| _(생성됨)_ | `/usr/local/sbin/wg-peer-add` | 0700 |
| _(생성됨)_ | `/etc/sysctl.d/99-wireguard.conf` | 0644 |
| _(생성됨)_ | `/etc/systemd/system/wg-quick@wg0.service.d/10-after-docker.conf` | 0644 |
| **(VM 이 1회 생성 — 재작성하지 않는다)** | `/etc/wireguard/wg0.key` | 0600 |
| **(사람이 관리 — 없으면 빈 파일만 만든다)** | `/etc/wireguard/peers.conf` | 0600 |
| `wireguard/client.conf.template` | **VM 배치 없음** — 개발기에서 채워 쓰는 템플릿 | — |

> `_(생성됨)_` 항목은 `startup.sh` 가 **매 부팅마다 재작성**한다(멱등).
> VM 에서 직접 고치지 말 것 — 다음 부팅에 덮어쓰인다. 저장소가 단일 정본이다.
>
> **예외 2종.** `/etc/wireguard/wg0.key` 는 **없을 때만 1회 생성**한다 — 재생성하면 서버
> 공개키가 바뀌어 배포된 모든 클라이언트 프로필이 한꺼번에 무효가 된다.
> `/etc/wireguard/peers.conf` 는 **사람(관리자)이 `wg-peer-add` 로 관리**하며,
> `startup.sh` 는 파일이 없을 때만 빈 목록을 만들고 있으면 손대지 않는다.
