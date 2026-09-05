---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 06
subsystem: infra
tags: [gcp, gce, gcloud, systemd, openconnect, vpn, caddy, docker, secret-manager, iap, debian-12]

# Dependency graph
requires:
  - phase: 15-01
    provides: relay 워크스페이스 골격 · 내부 포트(8090 wss / 8091 order·health) 계약
provides:
  - "scripts/setup-relay-iam.sh — SA·Secret 3종·외부/내부 고정 IP·방화벽 3규칙·VM `radar-gw` 를 만드는 멱등 프로비저닝 스크립트 (--dry-run 지원)"
  - "infra/relay/startup.sh — 매 부팅 실행되는 멱등 startup-script (swap·docker·Caddy·VPN 자산 배치·3분 라우팅 안전장치)"
  - "infra/relay/openconnect@.service — 재시도 상한 5회/1h 를 가진 KB VPN systemd 유닛"
  - "infra/relay/kbvpn-vpnc-wrapper.sh — CISCO_SPLIT_INC 로 10.41.0.0/16 만 터널링하는 split-tunnel 강제 래퍼"
  - "infra/relay/kbvpn-fetch-secret.sh — 메타데이터 토큰 → Secret Manager REST → /run tmpfs 0600 (gcloud·jq 무의존)"
  - "infra/relay/kbvpn-connect.sh — 포그라운드 openconnect 실행, 비밀은 stdin 으로만"
  - "infra/relay/Caddyfile — dma.jx1.io TLS 종단 + 127.0.0.1:8090 리버스 프록시"
  - "infra/relay/README.md — IAP SSH·직렬 콘솔 복구·Secret 주입·D-03 선검증 7항목·메모리 예산 운영 문서"
affects: [15-07, 15-08, 15-09]

# Tech tracking
tech-stack:
  added: [gcloud-compute, systemd-unit, openconnect, vpnc-scripts, caddy-v2, docker.io, unattended-upgrades]
  patterns:
    - "인프라를 파일로 먼저 정의하고 실행은 별도 체크포인트 plan 이 담당 (정의/실행 분리)"
    - "VM 자산은 저장소가 단일 정본 — 인스턴스 메타데이터로 실어 보내고 startup-script 가 배치"
    - "GCP 접근에 gcloud 를 가정하지 않고 메타데이터 토큰 + REST 무의존 경로 사용"

key-files:
  created:
    - scripts/setup-relay-iam.sh
    - infra/relay/startup.sh
    - infra/relay/Caddyfile
    - infra/relay/openconnect@.service
    - infra/relay/kbvpn-vpnc-wrapper.sh
    - infra/relay/kbvpn-fetch-secret.sh
    - infra/relay/kbvpn-connect.sh
    - infra/relay/README.md
  modified: []

key-decisions:
  - "split-tunnel 은 CISCO_SPLIT_INC 래퍼(1순위, 추가 패키지 0)를 채택하고 vpn-slice 자동 설치 코드는 넣지 않았다"
  - "Artifact Registry 인증은 docker-credential-gcr 대신 메타데이터 토큰 + docker login — Debian 이미지에 gcloud 존재를 가정할 수 없다"
  - "VM 자산 6종을 인스턴스 메타데이터로 전달 — 저장소/VM 이중 관리를 피하고 add-metadata 로 갱신"
  - "3분 라우팅 안전장치는 transient 타이머(systemd-run --on-active)로 예약 — 유닛 파일도 자동 기동 등록도 필요 없다"
  - "Caddy·openconnect 모두 자동 기동을 등록하지 않는다 — ACME rate limit 과 라우팅 탈취를 사람이 관찰하며 통과시켜야 한다"
  - "secretmanager.secretAccessor 를 프로젝트 레벨이 아니라 Secret 단위로 바인딩"

patterns-established:
  - "gcloud 가드 머리 + describe→create 멱등 + ✓ 확인 출력 (setup-intraday-sync-iam.sh 계보 유지)"
  - "--dry-run 래퍼 함수로 모든 mutating gcloud 호출을 감싸 실행 계획을 먼저 검토"
  - "비밀 값은 tmpfs(/run) 0600 에만 존재하고 ExecStopPost 가 삭제 — 유닛 파일·인자·로그·커밋 어디에도 없음"

requirements-completed: [RELAY-03]

# Metrics
duration: 17min
completed: 2026-09-05
---

# Phase 15 Plan 06: relay VM 인프라 정의 Summary

**GCE `radar-gw` 프로비저닝 스크립트와 VM 자산 6종(startup-script · Caddyfile · openconnect 유닛 · VPN 래퍼 3종)을 파일로만 정의했다 — GCP 리소스 변경 0건, 저장소 내 비밀 값 0건.**

## Performance

- **Duration:** 약 17분
- **Started:** 2026-09-05T12:23Z
- **Completed:** 2026-09-05T12:40Z
- **Tasks:** 3/3
- **Files created:** 8 (셸 4 · systemd 유닛 1 · Caddyfile 1 · 문서 1 · 프로비저닝 스크립트 1, 총 1,091행)

## Accomplishments

- **SC-2 정의부 완성.** `scripts/setup-relay-iam.sh` 하나로 SA·Secret 3종·외부/내부 고정 IP·방화벽 3규칙·VM 을 멱등 생성할 수 있고, `--dry-run` 으로 실행 전 계획 검토가 가능하다. `gh-radar-vpc` 의 방화벽 규칙이 0개라 IAP SSH 조차 안 되는 상태(Pitfall 12)를 VM 생성 전 가드로 못박았다.
- **이 phase 최대 미검증 리스크(Pitfall 10)를 코드로 선차단.** openconnect 가 기본 경로를 가져가면 Secret Manager·Artifact Registry·ACME·IAP SSH 가 동시에 죽고 복구 수단까지 잃는다. `CISCO_SPLIT_INC` 래퍼(강제 split-tunnel) + 3분 자동 중지 안전장치 + 직렬 콘솔 복구 절차 문서화의 3중 대비를 15-07 의 1회성 시도 전에 배치했다.
- **비밀 취급 규율을 구조로 고정.** VPN 자격증명은 Secret Manager → `/run`(tmpfs) 0600 → `ExecStopPost` 삭제 경로로만 흐른다. 유닛 파일에는 `password`/`passwd` 문자열조차 없고(`systemctl show`·`ps` 노출 차단), 저장소 전체 비밀 값 스캔 0건이다.

## Task Commits

1. **Task 1: setup-relay-iam.sh — SA·Secret·고정 IP·방화벽 3규칙·VM** — `c7f2d68` (feat)
2. **Task 2: VPN 자산 — openconnect 유닛 + split-tunnel 래퍼 + Secret 페치** — `eb98d31` (feat)
3. **Task 3: startup.sh + Caddyfile + infra README** — `bb1f636` (feat)

## Files Created

| 파일 | 역할 |
|------|------|
| `scripts/setup-relay-iam.sh` (345행) | 멱등 프로비저닝. gcloud 가드 → API enable → SA → Secret 3종 + 단위 바인딩 → 고정 IP 2종 → 방화벽 3규칙 → VM. `--dry-run` 지원 |
| `infra/relay/startup.sh` (220행) | GCE startup-script. swap 1GB · 패키지 · docker 로그 로테이션 · Caddy 설치(정지 유지) · VPN 자산 배치 · AR 로그인 헬퍼 · 3분 라우팅 안전장치 |
| `infra/relay/openconnect@.service` (49행) | `StartLimitIntervalSec=3600` + `StartLimitBurst=5`, `ExecStartPre` 페치 / `ExecStopPost` 삭제 |
| `infra/relay/kbvpn-vpnc-wrapper.sh` (45행) | stock `vpnc-script` 호출 전 `CISCO_SPLIT_INC_*` 를 export 해 서버 푸시 라우트를 덮어씀 |
| `infra/relay/kbvpn-fetch-secret.sh` (80행) | 메타데이터 토큰 → Secret Manager REST → `/run/kbvpn.cred` 0600. curl + python3 만 사용 |
| `infra/relay/kbvpn-connect.sh` (64행) | 포그라운드 openconnect. 계정은 cred 1행, 비밀은 stdin(2행 이후). 래퍼 미존재 시 연결 전 중단 |
| `infra/relay/Caddyfile` (51행) | `dma.jx1.io` TLS 종단 → `127.0.0.1:8090`, `/healthz` 만 `:8091` 노출 |
| `infra/relay/README.md` (237행) | IAP SSH·직렬 콘솔 복구·Secret 주입·VPN 조작·D-03 선검증 7항목·D-27 경고·메모리 예산·자산 갱신 절차 |

## Decisions Made

- **split-tunnel 1순위 채택.** `CISCO_SPLIT_INC` 환경변수 래퍼는 추가 패키지가 0이다. 2순위 `vpn-slice` 는 Debian 저장소에 없어 PyPI(pipx) 경유가 필요해 공급망 표면이 늘어난다 — 자동 설치 코드를 넣지 않고, 전환이 필요하면 별도 승인을 받도록 래퍼 주석에 남겼다 (T-15-SC).
- **Artifact Registry 인증 경로.** `docker-credential-gcr` 설치 대신 메타데이터 토큰 + `docker login -u oauth2accesstoken` 을 택했다. Debian 공개 이미지에 gcloud 가 항상 있다고 확정할 수 없고(RESEARCH A4), `kbvpn-fetch-secret` 과 동일한 "추가 의존 0" 경로로 통일하는 편이 부팅 시간·디스크·공급망 모두에서 유리하다. 토큰이 1시간 만료라 pull 직전 재실행이 필요하므로 재사용 가능한 `/usr/local/sbin/relay-docker-login` 헬퍼로 분리해 15-08 이 호출할 수 있게 했다.
- **3분 안전장치를 transient 타이머로.** `systemd-run --on-active=180` 은 유닛 파일 생성도 부팅 자동 기동 등록도 필요 없어, "자동 기동 금지" 규율과 충돌하지 않으면서 부팅 3분 뒤 1회 점검을 보장한다.
- **`CADDY_EMAIL` 은 systemd 드롭인으로 주입.** 공식 Caddy Debian 패키지 유닛은 `EnvironmentFile` 을 읽지 않으므로 `/etc/systemd/system/caddy.service.d/10-env.conf` 를 쓴다. 메타데이터 `caddy-email` 이 없으면 만료 알림 없이 발급을 진행한다(동작 지장 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 블로킹 이슈] VM 자산이 VM 에 도달할 경로가 없었다**

- **Found during:** Task 3 (startup.sh 작성 중)
- **Issue:** plan 은 `setup-relay-iam.sh` 가 `--metadata-from-file=startup-script=infra/relay/startup.sh` 만 전달하도록 명시했는데, `startup.sh` 는 `kbvpn-*.sh` 3종·`openconnect@.service`·`Caddyfile` 을 VM 에 "배치" 해야 한다. 이 파일들이 VM 에 전달될 경로가 어디에도 없어, 작성된 startup-script 가 실행 즉시 실패할 상태였다. 15-07 이 그대로 실행하면 VM 은 뜨지만 VPN·Caddy 자산이 전부 비어 있게 된다.
- **Fix:** 저장소를 단일 정본으로 유지하기 위해 자산을 startup.sh 안에 복제하지 않고, `setup-relay-iam.sh` 가 6종 파일을 인스턴스 커스텀 메타데이터(`kbvpn-fetch-secret`·`kbvpn-connect`·`kbvpn-vpnc-wrapper`·`openconnect-service`·`caddyfile` + `startup-script`)로 실어 보내도록 보강했다. `startup.sh` 는 메타데이터 서버에서 읽어 `install` 로 배치한다(`install_asset` 헬퍼). 기존 VM 에는 `gcloud compute instances add-metadata` 로 갱신하는 멱등 경로도 추가했다. 자산 존재 확인 가드도 6종 전체로 확장했다.
- **Files modified:** `scripts/setup-relay-iam.sh`, `infra/relay/startup.sh`
- **Verification:** `bash -n` 통과. Task 1 의 acceptance 전항목 재검증 통과(`startup-script` 패턴 유지, `35.235.240.0/20`·`10.10.0.0/26` 각 1건 유지). 메타데이터 값 상한(속성당 256KB)에 비해 자산 합계는 수 KB 수준이라 여유가 크다.
- **Committed in:** `bb1f636` (Task 3 커밋에 포함)

---

**Total deviations:** 1건 자동 수정 (Rule 3 × 1)
**Impact on plan:** 범위 확대 없음. plan 이 요구한 산출물 목록·파일 경로·acceptance 는 그대로이고, 정의된 자산이 실제로 동작하게 만드는 배선만 채웠다. 오히려 "저장소가 단일 정본" 원칙을 지켜 startup.sh 내 사본 복제(드리프트 위험)를 피했다.

## Issues Encountered

- **`--can-ip-forward` 문자열이 주석에서 acceptance 를 위반.** "붙이지 않는다" 는 설명 주석에 리터럴이 들어가 `grep -c 'can-ip-forward' == 0` 이 1로 나왔다. 주석을 "IP forwarding 옵션은 의도적으로 붙이지 않는다" 로 바꿔 의미는 유지하고 리터럴만 제거했다. (RESEARCH 초안에는 `--can-ip-forward` 가 있었으나 최소권한 권고에 따라 실제로 미부여)
- **`systemctl enable` 금지와 3분 타이머 배치의 충돌.** 타이머를 영구 유닛으로 만들면 자동 기동 등록이 필요해 "자동 기동 금지" 규율과 충돌한다. `systemd-run --on-active` transient 타이머로 해결했다.
- **Python 파서 사전 검증.** 메타데이터 토큰 파서와 Secret payload base64 디코더를 가짜 JSON 으로 로컬 실행해 동작을 확인했다(비밀 값 미사용). Secret 값의 후행 개행이 중복되지 않고 정확히 1개로 정규화되는 것까지 확인했다.

## Threat Model 대응

| Threat ID | 대응 위치 | 상태 |
|-----------|-----------|------|
| T-15-12 (내부 포트 노출) | `relay-allow-internal-order` 가 서브넷 출발지로만 허용, 공인 개방 규칙 없음 | 정의 완료 (능동 검증은 15-08 INV-7) |
| T-15-11 (관리 경로 상실) | `CISCO_SPLIT_INC` 래퍼 + 3분 자동 중지 + 직렬 콘솔 복구 문서화 | 정의 완료 (검증은 15-07) |
| T-15-10 (KB 계정 잠금) | `StartLimitIntervalSec=3600` / `StartLimitBurst=5` / `RestartSec=30`, 자동 기동 미등록 | 완료 |
| T-15-13 (ACME rate limit) | Caddy 를 `disable --now` 로 두고 DNS 확인 후 15-07 이 수동 기동. 80 미개방 | 정의 완료 |
| T-15-26 (비밀 노출) | Secret Manager → tmpfs 0600 → `ExecStopPost` 삭제. 유닛·인자·로그·커밋에 값 0건 | 완료 (grep 검증 3건 통과) |
| T-15-27 (권한 상승) | `secretAccessor` 를 Secret 단위 바인딩, IP forwarding 미부여, Shielded VM 3옵션 | 완료 |
| T-15-SC (vpn-slice 공급망) | 1순위 무의존 래퍼 채택, 자동 설치 코드 미포함 | accept 유지 |

## Verification

| 검증 | 결과 |
|------|------|
| `bash -n` (셸 스크립트 4종 + 프로비저닝 1종) | 전부 통과 |
| Task 1 acceptance 9항목 | 전부 통과 |
| Task 2 acceptance 9항목 | 전부 통과 |
| Task 3 acceptance 9항목 | 전부 통과 |
| 비밀 값 패턴 스캔 (`infra/relay/` + `scripts/setup-relay-iam.sh`) | 0건 — plan verification 절의 `grep -rniE` 명령 그대로 실행 |
| **GCP 리소스 변경** | **0건** — 읽기 전용 확인 결과 `compute instances list` = 0 items, `gh-radar-vpc` 방화벽 = 0개로 리서치 실측 기준선과 동일 |

## User Setup Required

이 plan 자체는 외부 설정을 요구하지 않는다(파일 정의만). 다만 15-07 이 다음 2건의 사용자 참여를 요구한다:

1. **[BLOCKING · D-06] `jx1.io` 에 `dma` A 레코드 등록** — `setup-relay-iam.sh` 가 출력하는 외부 고정 IP 값으로. `dig +short dma.jx1.io` 확인 전에는 Caddy 를 켜지 않는다.
2. **[BLOCKING · D-03] KB VPN 선검증** — VM 에서 최초 1회 연결을 사용자와 함께 관찰. 시도 최대 3회, 실패해도 자동 재시도 금지.
3. `gh-radar-kb-vpn-password` Secret 값 주입은 사용자가 직접 수행한다(Claude 가 값을 묻지 않는다). 나머지 2종은 15-07 이 로컬 생성해 주입한다.

## Next Phase Readiness

**15-07 이 즉시 실행 가능하다.** 15-07 이 참조하는 인터페이스가 모두 존재하고 이름·경로가 일치한다:

- `scripts/setup-relay-iam.sh` — `--dry-run` 지원 확인. 15-07 Task 1 의 "dry-run 출력에 `gh-radar-static-ip` 재사용이나 `--can-ip-forward` 가 있으면 중단" 조건을 구조적으로 만족한다(전자는 재사용 금지 주석뿐, 후자는 0건).
- `infra/relay/README.md` — "현재 배포 상태" 절을 미리 만들어 두어 15-07 Task 1 이 실측 값만 채우면 된다. D-03 선검증 7항목 표도 그대로 옮겨져 있다.
- 15-07 acceptance 의 `canIpForward == False`, `systemctl is-enabled caddy` 가 enabled 아님, 방화벽 정확히 3행 — 모두 이 plan 의 정의와 정합한다.

**주의 사항 (15-07 에 인계):**

- `/etc/kbvpn.env`(서버 주소·authgroup·인증서 핀·계정 ID)는 아직 어디에도 없다. `startup.sh` 는 메타데이터 `kbvpn-env` 속성이 있으면 배치하고 없으면 경고만 남기고 부팅을 계속한다. **D-03 선검증 전에 반드시 채워야 한다** — 값은 Mac 참조 스크립트에서 확인 가능하나 저장소·문서에 기록하지 않는다.
- `setup-relay-iam.sh` 는 아직 **한 번도 실행되지 않았다**. 15-07 은 반드시 `--dry-run` 을 먼저 돌려 계획을 검토할 것.
- VPN 최초 연결 시 직렬 콘솔을 별도 터미널에 미리 열어 둘 것. 3분 안전장치는 부팅 후 180초 1회만 동작하므로, 부팅한 지 오래된 VM 에서 VPN 을 켜면 안전망이 없다.

## Self-Check: PASSED

- 생성 주장 파일 8종 전부 디스크에 존재 확인
- 커밋 3건(`c7f2d68` · `eb98d31` · `bb1f636`) 전부 git 이력에 존재 확인
- 커밋 전 구간 파일 삭제 0건 (`git diff --diff-filter=D` 결과 없음)
- SUMMARY 자체 비밀 값 스캔 0건

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-05*
