---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 07
subsystem: infra
tags: [gcp, gce, letsencrypt, caddy, acme, tls-alpn-01, openconnect, vpn, split-tunnel, dns, iap, secret-manager]

# Dependency graph
requires:
  - phase: 15-06
    provides: "setup-relay-iam.sh 프로비저닝 스크립트 + VM 자산 6종(startup-script·Caddyfile·openconnect 유닛·VPN 래퍼 3종)"
provides:
  - "실제 가동 중인 GCE `radar-gw` — 외부 고정 IP 34.22.79.103 · 내부 10.10.0.5 · 방화벽 3규칙 · Shielded VM"
  - "https://dma.jx1.io — Let's Encrypt 인증서(notAfter 2026-12-04)로 응답하는 TLS 종단. 15-08 relay 컨테이너의 진입점"
  - "Secret 3종 실체화 — dma-cred-key·relay-order-secret 값 주입 완료, kb-vpn-password 사용자 주입 완료"
  - "D-03 선검증 통과 기록(15-VPN-PREFLIGHT.md) — 출발지 IP 제한 없음 · Mac 동시 세션 가능 · split-tunnel 성립 실증"
  - "터널 IP 풀 할당 확정 — 후속 plan 이 고정값 가정을 하지 않도록 반증 근거 확보"
affects: [15-08, 15-09, 15-10, 15-14, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: [letsencrypt-acme, tls-alpn-01, caddy-v2-runtime, openconnect-runtime]
  patterns:
    - "ACME 시도 전에 `caddy validate` 로 설정 오류를 먼저 걸러 rate limit 소모를 0으로 유지"
    - "위험한 1회성 조작은 조건부 가드 + 무조건 데드맨의 2중 안전장치를 먼저 예약하고 시작"
    - "라우팅을 바꾸는 조작은 실행 SSH 호출과 관측 SSH 호출을 분리 (탈취 시 실행 호출 자체가 끊기므로)"

key-files:
  created:
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-VPN-PREFLIGHT.md
  modified:
    - infra/relay/README.md
    - infra/relay/Caddyfile
    - infra/relay/startup.sh
    - scripts/setup-relay-iam.sh

key-decisions:
  - "ACME 이메일은 선택 항목이므로 Caddyfile 전역 블록을 제거하고, 메타데이터가 있을 때만 startup.sh 가 주입 — 환경변수 부재가 파싱 실패로 이어지던 구조를 제거"
  - "챌린지를 TLS-ALPN-01 로 고정(disable_http_challenge) — 포트 80 이 D-09 상 영구 차단이라 HTTP-01 은 갱신마다 실패만 누적시킨다"
  - "IAM 바인딩은 재시도 래퍼로 감싼다 — IAM 최종 일관성과 정책 read-modify-write 충돌은 시간이 지나면 해소되는 일시적 실패다"
  - "VPN 선검증에 무조건 정지 데드맨을 추가 — 기존 route-guard 는 기본 경로 탈취만 잡고 관리 경로만 죽는 부분 탈취는 못 잡는다"
  - "터널 IP 는 런타임 조회 대상으로 확정 — 계정 고정이 아니라 풀 할당임이 실측으로 반증됐다"

patterns-established:
  - "선검증 문서는 판정 결과뿐 아니라 연결 전/후 라우팅 diff 원문을 남긴다 — split-tunnel 성립의 유일한 직접 증거"
  - "비밀에 준하는 접속 파라미터(서버 주소·authgroup·인증서 핀)도 산출물에서 마스킹 — grep acceptance 는 계정 ID 만 보지만 실제 기준은 더 넓다"

requirements-completed: [RELAY-03]

# Metrics
duration: 56min
completed: 2026-09-05
---

# Phase 15 Plan 07: relay 인프라 실행 + 2개 외부 게이트 해소 Summary

**15-06 이 파일로만 정의했던 인프라를 실제 GCP 리소스로 가동시키고, 이 phase 의 두 외부 좌표(사용자 도메인·KB 계정)를 모두 해소했다 — `https://dma.jx1.io` 가 Let's Encrypt 인증서로 응답하고, KB VPN 선검증 7항목이 시도 1회로 전부 통과했다.**

## Performance

- **Duration:** 약 56분
- **Started:** 2026-09-05T13:36Z
- **Completed:** 2026-09-05T14:33Z
- **Tasks:** 3/3 (checkpoint 2건 포함)
- **Files created:** 1 · **modified:** 4

## Accomplishments

- **SC-2 전부 충족.** `radar-gw` 가 RUNNING 이고 방화벽 3규칙·외부 고정 IP `34.22.79.103`·내부 `10.10.0.5` 가 결선됐다. `gh-radar-vpc` 는 이 plan 이전까지 방화벽 규칙이 0개라 IAP SSH 조차 불가능했는데(Pitfall 12), 이제 IAP 터널 SSH 가 실제로 동작한다. Cloud NAT 용 `gh-radar-static-ip`(34.64.195.151) 는 **손대지 않았다** — dry-run 사전 검토에서 재사용 0건을 확인하고 진행했다.
- **이 phase 최대 미검증 리스크(Pitfall 10 / T-15-11)가 실측으로 해소됐다.** openconnect 연결 중에도 기본 경로가 `ens4` 로 유지되고 공인 IP·Secret Manager·메타데이터 서버·IAP SSH 가 전부 살아 있었다. `CISCO_SPLIT_INC` 래퍼가 서버 푸시 라우트를 덮어쓰는 데 성공해 터널로 가는 것은 KB 대역(`10.41.0.0/16`)뿐이었고, 정지 후 경로는 기준선과 **완전히 동일하게** 복원됐다.
- **phase 재설계 분기를 닫았다.** D-03 의 두 위험 항목 — ③ 출발지 공인 IP 제한, ④ Mac 세션 동시 접속 — 이 모두 "제약 없음" 으로 나왔다. GCE 외부 IP 에서 인증이 성공했고, Mac(`10.41.1.126`)과 VM(`10.41.1.124`)이 동시에 살아 있었다. 전용 계정 발급이나 "Mac 상시 릴레이" 대안으로 갈 이유가 사라져 15-08 이하가 계획대로 진행 가능하다.
- **인증서를 실패 0회로 발급받았다.** DNS 확인 → 설정 검증 → 기동 순서를 지켜 TLS-ALPN-01 로 **1회에** 성공했고, 포트 80 은 임시로도 열지 않았다. Let's Encrypt rate limit 소모는 실패 검증 0건이다.

## Task Commits

1. **Task 1: GCP 인프라 생성 + IAP SSH 도달 확인** — `ae325f4` (feat)
2. **Task 2: [BLOCKING] KB VPN 선검증 (D-03)** — `dcc7ba3` (docs)
3. **Task 3: [BLOCKING] DNS A 레코드 + Caddy 기동·인증서 발급 (D-06)** — `8b9c095` (feat)

> 실행 순서는 1 → 3 → 2 다. Task 3(DNS)이 Task 2(VPN)보다 먼저 게이트가 열려 오케스트레이터 지시로 순서를 바꿨다. 두 태스크는 서로 독립이라 순서 교환에 부작용이 없다.

## 실측 결과

### 인프라 (Task 1)

| 항목 | 값 |
|------|-----|
| VM | `radar-gw` RUNNING · `canIpForward=False` · Shielded 3옵션 on |
| 이미지 / 디스크 | `debian-12-bookworm-v20260902` / 20GB pd-balanced |
| 외부 / 내부 고정 IP | `34.22.79.103` (IN_USE) / `10.10.0.5` |
| 방화벽 | 정확히 3규칙 — 443 공인 / 22 IAP대역 / 8091 서브넷 |
| 메모리 | total 969MB · available 552MB · swap 1024MB |
| 툴체인 | docker 20.10.24 · openconnect v9.01-3 · caddy v2.11.4 |
| Secret | 3종 존재. `dma-cred-key`·`relay-order-secret` 각 1버전(로컬 생성 주입), `kb-vpn-password` 1버전(사용자 주입) |

### TLS (Task 3)

| 항목 | 값 |
|------|-----|
| DNS | `dma.jx1.io` → `34.22.79.103` (로컬·8.8.8.8·1.1.1.1 3개 리졸버 일치, 단일 A) |
| issuer / subject | `C=US, O=Let's Encrypt, CN=YE1` / `CN=dma.jx1.io` |
| notBefore / notAfter | `2026-09-05 13:17:21 GMT` / **`2026-12-04 13:17:20 GMT`** |
| 챌린지 | `tls-alpn-01` — **1회 성공**, 실패 검증 0건 |
| 외부 검증 | `curl` 체인 검증 통과(`ssl_verify_result=0`) · `/healthz` 502 (relay 미배포 — 정상) |
| 포트 80 규칙 | **0건** (임시 개방조차 없음) |

### VPN 선검증 (Task 2) — 7항목 전부 통과, **시도 1 / 상한 3**

상세는 `15-VPN-PREFLIGHT.md`. 요약하면 ① 연결 성립(약 1초, CSTP+DTLS) ② 터널 IP `10.41.1.124` ③ 출발지 IP 제한 없음 ④ Mac 동시 접속 유지 ⑤ split-tunnel 성립 ⑥ 게이트웨이 `10.41.1.120:9100` 도달(도달성만) ⑦ 실패 없음.

## Decisions Made

- **ACME 이메일 주입 방식을 바꿨다.** Caddyfile 전역 블록에서 환경변수 placeholder 로 받던 구조를 버리고, 메타데이터가 있을 때만 startup.sh 가 전역 블록을 덧붙이도록 했다. 이메일은 선택 항목인데 "없으면 파싱 실패" 라는 잘못된 결합이 있었다.
- **챌린지를 TLS-ALPN-01 로 고정했다.** 포트 80 은 D-09 상 영구 차단이므로 HTTP-01 은 구조적으로 성공할 수 없다. 기본값으로 두면 갱신(약 60일 주기)마다 무의미한 실패 검증이 쌓이므로 `disable_http_challenge` 로 명시적으로 껐다 (T-15-13).
- **선검증에 무조건 정지 데드맨을 추가했다.** 기존 `kbvpn-route-guard` 는 "기본 경로가 `tun*` 로 넘어간 경우" 만 잡는다. 기본 경로는 유지되면서 GCP 관리 경로만 죽는 **부분 탈취**는 못 잡으므로, 10분 뒤 조건 없이 VPN 을 내리는 타이머를 하나 더 걸고 시작했다. 검증 정상 종료 후 해제했다(`0 timers` 확인).
- **연결과 관측을 별도 SSH 호출로 분리했다.** 라우팅이 탈취되면 그 SSH 호출 자체가 끊긴다. 한 호출에 몰아넣으면 안전장치 예약과 관측이 함께 사라진다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 블로킹 이슈] IAM 최종 일관성으로 프로비저닝 스크립트가 중단됐다**

- **Found during:** Task 1 (`setup-relay-iam.sh` 최초 실행)
- **Issue:** SA 생성 직후 `projects add-iam-policy-binding` 이 `Service account ... does not exist` 로 실패해 스크립트가 첫 역할 바인딩에서 죽었다. SA 자체는 생성돼 있었고 `describe` 도 성공했다 — IAM 정책 백엔드로의 전파가 늦은 것이다.
- **Fix:** IAM 바인딩 전용 `run_retry` 래퍼(10초 간격 6회 상한)를 추가하고 3개 호출부에 적용했다. 정책 read-modify-write 충돌(409 ABORTED)도 같이 흡수한다.
- **Files modified:** `scripts/setup-relay-iam.sh`
- **Verification:** 재실행으로 전 구간 통과, Task 1 acceptance 8항목 전부 통과
- **Committed in:** `ae325f4`

**2. [Rule 1 - 버그] Caddy 가 설정 파싱 단계에서 기동 불가였다**

- **Found during:** Task 3 (기동 전 `caddy validate`)
- **Issue:** Caddyfile 전역 블록의 `email {$CADDY_EMAIL}` 이 환경변수 부재 시 인자 0개짜리 `email` 로 전개돼 **설정 파싱이 통째로 실패**했다. `caddy-email` 메타데이터가 없어 startup.sh 는 드롭인을 만들지 않았고, 15-06 은 이 상태를 "만료 알림 없이 발급 진행(동작에는 지장 없음)" 으로 잘못 기록했다. 실제로는 Caddy 가 아예 뜨지 못한다.
- **Fix:** 전역 블록을 제거하고, 메타데이터가 있을 때만 startup.sh 가 블록을 덧붙이도록 변경. 쓸모없어진 systemd 드롭인 생성 로직은 제거하고 잔재 정리 코드를 넣었다.
- **Files modified:** `infra/relay/Caddyfile`, `infra/relay/startup.sh`
- **Verification:** `caddy validate` → `Valid configuration`
- **Committed in:** `8b9c095`

**3. [Rule 1 - 버그] 로그 파일 소유권 때문에 Caddy 기동 실패**

- **Found during:** Task 3 (첫 `systemctl enable --now caddy`)
- **Issue:** `open /var/log/caddy/dma.log: permission denied` 로 서비스가 죽었다. 원인은 **내가 앞서 `sudo caddy validate` 를 실행한 것**이다 — validate 는 파일 로거 모듈을 실제로 provisioning 하므로 root 로 돌리면 `dma.log` 를 `root:root 0600` 으로 만들어 버리고, `User=caddy` 인 서비스가 그 파일을 못 연다.
- **Fix:** startup.sh 에 `chown -R caddy:caddy /var/log/caddy` 자가 치유를 추가하고, README 에 **`sudo -u caddy` 로 validate 하라**는 경고를 박았다.
- **Files modified:** `infra/relay/startup.sh`, `infra/relay/README.md`
- **Verification:** 재기동 후 `active`, 로그 파일 `caddy:caddy`
- **Committed in:** `8b9c095`
- **중요:** 두 실패 모두 **ACME 요청 이전 단계**였다. Let's Encrypt rate limit 소모는 0건이다.

### 계획 보강 (범위 내)

**4. [Rule 2 - 누락된 필수 기능] HTTP-01 챌린지가 영구히 실패하도록 방치돼 있었다**

포트 80 이 D-09 상 영구 차단이라 HTTP-01 은 절대 성공할 수 없는데 기본값으로 켜져 있었다. 갱신마다 실패 검증이 누적된다(T-15-13 이 명시적으로 경계하는 사항). `issuer acme { disable_http_challenge }` 로 TLS-ALPN-01 에 고정했다. 커밋 `8b9c095`.

**5. [Rule 2 - 누락된 필수 기능] 부분 라우팅 탈취용 안전장치 부재**

`kbvpn-route-guard` 는 기본 경로 탈취만 감지한다. 무조건 정지 데드맨 타이머를 추가로 걸고 선검증을 진행했다. 커밋 `dcc7ba3` 문서에 운용 기록.

**Total deviations:** 5건 (Rule 3 × 1, Rule 1 × 2, Rule 2 × 2). 전부 자동 수정 — 아키텍처 변경 없음.

## 발견 사항 — 후속 plan 에 인계

### ⚠️ 터널 IP 는 고정이 아니다 (플랜 정정)

plan·CONTEXT 는 *"Mac 실측 3회 모두 `10.41.1.124` → 계정 고정 추정"* 이라 기록했으나 **반증됐다.**

| 시점 | Mac (`utun4`) | VM (`tun0`) |
|------|---------------|-------------|
| 선검증 중 (동시) | `10.41.1.126` | `10.41.1.124` |

Mac 이 과거 `.124` 를 받은 것은 그때 그 주소가 비어 있었기 때문이고, 이번엔 **VM 이** `.124` 를 받았다. **후속 plan 은 터널 IP 를 하드코딩하거나 allow-list 에 넣으면 안 된다** — 필요하면 `ip -4 addr show tun0` 로 런타임 조회할 것. 게이트웨이 `10.41.1.120` 은 서버측 고정값이라 상수 취급 가능하다.

### 세션 인증 만료 14일

서버가 통보한 세션 인증 만료는 **2026-09-19** (약 14일). 상시 운용 시 재인증 주기 설계가 필요하다 — 15-08 이후에서 다룰 것.

### 운영 함정 2건 (README 에 박아 둠)

- `sudo caddy validate` 는 로그 파일을 root 소유로 만들어 Caddy 기동을 막는다. 반드시 `sudo -u caddy` 로 실행.
- `gcloud ... --filter='name~prefix-(a|b|c)'` 는 gcloud 필터 문법이 선행 `(` 를 그룹 토큰으로 해석해 **조용히 0건**을 반환한다. plan 의 Secret 검증 one-liner 가 이 형태여서 리소스가 정상인데도 0 이 나왔다. `name~A OR name~B OR name~C` 를 쓸 것. (플랜 acceptance 명령의 결함이며 리소스 문제가 아니었다)

## Threat Model 대응

| Threat ID | 대응 | 상태 |
|-----------|------|------|
| T-15-10 (KB 계정 잠금) | 수동 1회 시도로 성립. 자동 재시도 0회. 상한 3회 미도달 | **완료** |
| T-15-11 (관리 경로 상실) | split-tunnel 실증 — 기본 경로·공인 IP·Secret Manager·메타데이터·IAP SSH 전부 생존. 조건부 가드 + 무조건 데드맨 2중 무장 후 진행 | **완료 (실증)** |
| T-15-13 (ACME rate limit) | DNS 확인 후에만 기동, 기동 전 `validate` 로 설정 오류 선차단, TLS-ALPN-01 고정. 실패 검증 **0건** | **완료** |
| T-15-26 (비밀 노출) | `/run/kbvpn.cred` 가 `ExecStopPost` 로 삭제되는 것을 실증. 산출물 비밀 스캔 0건 | **완료 (실증)** |
| T-15-28 (실서버 오조작) | `nc -zv` 도달성만. 로그인·주문 0건. 문서에 명시 문구 기록 | **완료** |
| T-15-12 (임시 80 개방) | 임시 개방 자체를 하지 않음. 80 규칙 0건 | **완료** |

## Verification

| 검증 | 결과 |
|------|------|
| Task 1 acceptance 8항목 | 전부 통과 |
| Task 2 acceptance 6항목 | 전부 통과 |
| Task 3 acceptance 6항목 | 전부 통과 |
| `15-VPN-PREFLIGHT.md` 계정 ID·비밀 패턴 grep (plan acceptance 명령 그대로) | **0건** |
| 접속 파라미터 유출 (서버 주소·authgroup·인증서 핀) | **0건** (문서에서 마스킹) |
| `infra/`·`scripts/` 내 계정 ID | **0건** |
| 검증 종료 후 `openconnect@kb` | `inactive` |
| 검증 종료 후 안전 타이머 | `0 timers` (전부 해제) |
| 커밋 전 구간 파일 삭제 | 0건 |

## User Setup Required

이 plan 에서 사용자가 수행한 작업(완료됨):

1. `jx1.io` 에 `dma` A 레코드 등록 → `34.22.79.103`. 초기 Cloudflare 프록시(주황 구름) 상태를 **DNS only**(회색 구름)로 전환해 오리진 IP 가 직접 응답하도록 조정했다 — 프록시 상태였다면 TLS-ALPN-01 이 성립하지 않았다.
2. `gh-radar-kb-vpn-password` Secret 값 주입.
3. VM `/etc/kbvpn.env` 4키 배치 (`root:root 0600`).

**남은 사용자 작업 없음.**

## Next Phase Readiness

**15-08(relay 컨테이너 배포)이 즉시 실행 가능하다.**

- `https://dma.jx1.io` 가 유효 인증서로 응답하고, Caddy 가 `127.0.0.1:8090`(wss) / `127.0.0.1:8091`(healthz) 로 리버스 프록시하도록 이미 설정돼 있다. 현재 502 는 업스트림 부재 때문이며 컨테이너가 뜨면 해소된다.
- Artifact Registry 인증 헬퍼 `/usr/local/sbin/relay-docker-login` 이 배치돼 있어 15-08 이 호출하면 된다(토큰 1시간 만료라 pull 직전 실행 필요).
- `gh-radar-relay-order-secret` 값이 주입돼 있어 OrderApi 공유 비밀 헤더 검증을 바로 붙일 수 있다.
- VPN 은 여전히 **자동 기동 미등록 + `inactive`** 다. 상시 기동 여부는 15-08 에서 결정한다.
- 가용 메모리 552MB — e2-micro 예산 안에서 relay 컨테이너를 올릴 여유가 있으나, 15-08 은 컨테이너 메모리 상한을 명시해야 한다.

## Self-Check: PASSED

- `15-VPN-PREFLIGHT.md` 디스크 존재 확인
- 수정 주장 파일 4종(`README.md`·`Caddyfile`·`startup.sh`·`setup-relay-iam.sh`) 전부 존재 확인
- 커밋 3건(`ae325f4` · `8b9c095` · `dcc7ba3`) 전부 git 이력에 존재 확인
- 커밋 전 구간 파일 삭제 0건
- SUMMARY 자체 비밀 값 스캔 0건 (접속 파라미터 마스킹 유지)

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-05*
