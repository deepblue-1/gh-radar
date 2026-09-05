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

### 방화벽 3규칙 (`gh-radar-vpc` 최초 규칙)

| 규칙 | 포트 | 출발지 | 목적 |
|------|------|--------|------|
| `relay-allow-https` | tcp:443 | `0.0.0.0/0` | Caddy TLS 종단. 유일한 공인 인바운드 |
| `relay-allow-iap-ssh` | tcp:22 | `35.235.240.0/20` | IAP 터널 SSH 전용 |
| `relay-allow-internal-order` | tcp:8091 | 서브넷 대역 | Cloud Run → 주문 경로 |

포트 80 은 열지 않는다 — Caddy 는 TLS-ALPN-01(443)로 인증서를 발급받는다.

> `relay-allow-internal-order` 는 네트워크 태그가 아니라 출발지 대역으로만 좁혀져 있다.
> **Cloud Run 워크로드에는 네트워크 태그를 붙일 수 없기 때문**이다.
> 서브넷 전체가 허용되므로 방화벽만으로는 부족하고,
> relay OrderApi 의 공유 비밀 헤더(`gh-radar-relay-order-secret`)가 두 번째 방어선이다.

---

## 현재 배포 상태

> 15-07 Task 1 실측 (2026-09-05T13:45Z). `setup-relay-iam.sh` 최초 실제 실행 결과다.
> 인증서 행은 Task 3(D-06 DNS 게이트) 통과 후에 채운다.

| 항목 | 값 | 확인 시각 |
|------|-----|-----------|
| 외부 고정 IP (`gh-radar-relay-ip`) | `34.22.79.103` — status `IN_USE` | 2026-09-05T13:45Z |
| 내부 고정 IP (`gh-radar-relay-internal`) | `10.10.0.5` | 2026-09-05T13:45Z |
| VM 상태 | `radar-gw` **RUNNING** · `canIpForward=False` | 2026-09-05T13:45Z |
| 존 / 머신 타입 | `asia-northeast3-a` / `e2-micro` | 2026-09-05T13:45Z |
| 이미지 | `debian-12-bookworm-v20260902` | 2026-09-05T13:45Z |
| 부팅 디스크 | 20GB · `pd-balanced` | 2026-09-05T13:45Z |
| Shielded VM | secure-boot · vTPM · integrity-monitoring 모두 on | 2026-09-05T13:45Z |
| 방화벽 (`gh-radar-vpc`) | 정확히 3규칙 — 443 공인 / 22 IAP대역 / 8091 서브넷 | 2026-09-05T13:45Z |
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

### Secret 3종 상태

값은 어디에도 기록하지 않는다. 버전 **개수**만 상태 지표로 남긴다.

| Secret | ENABLED 버전 | 주입 주체 |
|--------|-------------|-----------|
| `gh-radar-dma-cred-key` | 1 | 15-07 이 `openssl rand -base64 32` 로 로컬 생성해 주입 |
| `gh-radar-relay-order-secret` | 1 | 15-07 이 `openssl rand -base64 32` 로 로컬 생성해 주입 |
| `gh-radar-kb-vpn-password` | **0 (비어 있음)** | **사용자가 직접 주입** — D-03 선검증의 전제 |

> ⚠️ `gcloud secrets list --filter='name~gh-radar-(a|b|c)'` 형태는 쓰지 말 것.
> gcloud 필터 문법이 선행 `(` 를 그룹 토큰으로 해석해 조용히 0건을 반환한다.
> 검증에는 `--filter='name~A OR name~B OR name~C'` 를 쓴다.

### D-03 선검증을 막고 있는 미충족 전제

1. **`/etc/kbvpn.env` 부재** — `KBVPN_SERVER` · `KBVPN_AUTHGROUP` · `KBVPN_SERVERCERT` · `KBVPN_USER` 4키가 필요하다. `startup.sh` 는 경고만 남기고 부팅을 계속하므로 VM 은 정상이지만 VPN 은 시작할 수 없다.
2. **`gh-radar-kb-vpn-password` 값 부재** — `ExecStartPre` 의 Secret 페치가 실패한다.

두 전제가 모두 채워지기 전에는 `systemctl start openconnect@kb` 를 시도하지 않는다
(무의미한 실패가 `StartLimitBurst=5/1h` 예산과 KB 계정 시도 횟수를 함께 소모한다).

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

부팅 자동 기동은 **의도적으로 등록하지 않았다.** 항상 수동으로 시작한다.

```bash
sudo systemctl start openconnect@kb      # 시작
sudo systemctl stop  openconnect@kb      # 중지
systemctl is-active  openconnect@kb      # 상태
journalctl -u openconnect@kb -n 50       # 최근 로그
journalctl -u openconnect@kb -f          # 실시간 관찰

ip -br addr show tun0                    # 터널 IP
ip route                                 # 기본 경로가 ens4 인지 확인
```

### 재시도 상한

유닛은 `StartLimitIntervalSec=3600` + `StartLimitBurst=5` 로 **1시간 5회** 상한을 갖는다.
상한 초과 시 유닛이 `failed` 로 멈추는 것은 **의도된 동작**이다 —
반복 인증 실패가 KB 계정 잠금으로 이어지는 것을 막는다.
상한에 걸린 뒤 다시 켜려면:

```bash
sudo systemctl reset-failed openconnect@kb
```

> 상한에 걸렸다는 것은 무언가 잘못됐다는 뜻이다. 원인을 확인하기 전에 리셋하고
> 다시 시도하지 말 것. 시도 횟수는 계속 누적해서 세야 한다.

### 3분 라우팅 안전장치

부팅 180초 뒤 `kbvpn-route-guard` 가 1회 실행되어, 기본 경로가 `tun*` 로 넘어가 있으면
`openconnect@*` 를 자동으로 중지한다. 로그는 `journalctl -t kbvpn-route-guard`.

---

## D-03 VPN 선검증 체크리스트 (7항목)

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

### D-27 경고

실서버 게이트웨이(`10.41.1.120:9100`) 에 대한 **로그인·주문은 사용자의 명시적 지시가 있기 전까지 금지**한다.
선검증에서 허용되는 것은 `nc -zv` 도달성 확인까지다.
그 전 모든 기능 검증은 mock 브로커로 수행한다.

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
