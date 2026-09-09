---
plan: 260909-el9-PLAN.md
status: complete
completed: 2026-09-09
tasks_completed: 3
files_changed: 3
---

# Quick 260909-el9 — DMA 게이트웨이 터널 스크립트 2종

## 무엇을 만들었나

개발기가 KB VPN 없이 **`10.41.1.120:9100` 에 주소 그대로** 붙게 하는 터널 스크립트 2종.
radar-gw 가 이미 VPN 을 상시 물고 있으므로 그 세션을 IAP SSH 로 빌린다.

| 파일 | 대상 | 구조 |
|------|------|------|
| `scripts/dma-tunnel.sh` | macOS | `sudo ifconfig lo0 alias 10.41.1.120/32` + `gcloud compute ssh --tunnel-through-iap -- -N -L 10.41.1.120:9100:10.41.1.120:9100` (1단) |
| `scripts/dma-tunnel.ps1` | Windows (PS 5.1, 관리자) | `New-NetIPAddress -SkipAsSource` + `start-iap-tunnel` → 내장 `ssh.exe` (2단) |
| `infra/relay/README.md` | 문서 | `## DMA 터널` 절 **추가만** (80줄 삽입 / 삭제 0) |

**설계의 핵심 — 왜 `127.0.0.1` 이 아닌가.** 소비자(gh-trade WinForms `settings.ini` 의
`[DMA] Host=10.41.1.120`, relay 의 `DMA_HOST`)의 설정을 하나도 바꾸지 않기 위해서다.
로컬에 `/32` 별칭을 붙이고 그 주소에 바인딩된 포워딩을 열면 터널의 on/off 가 VPN 직결과 동치다.

**Windows 만 2단인 이유.** Windows 의 `gcloud compute ssh` 는 PuTTY(plink) 의존이고 batch 모드
host-key 프롬프트에서 멈출 수 있다. `start-iap-tunnel` 은 순수 파이썬이라 OS 차이가 없다.

## 계약 (양쪽 동일)

- 종료 코드: 0 성공 / 1 인자 오류 / 2 선행 점검 실패 / 3 로컬 KB VPN 충돌 / 4 별칭 추가 실패 / 5 재연결 상한
- 선행 점검 P1~P8, 상태 파일(`gh-radar-dma-tunnel.state`), 소유권 표식(mac `lo0`+`netmask 0xffffffff` / win `PrefixLength 32`+`SkipAsSource`)
- `--check`/`-Check` 는 **무변경**(별칭 미생성·프로세스 미기동)이라 sudo/관리자 없이 비대화형으로 돈다
- 정리는 `trap`(bash) / `try-finally` + `PowerShell.Exiting`(ps1), 복구 경로는 `--stop`/`-Stop`
- 안전: 실계좌 경고 배너 + **TCP connect 후 즉시 close** 까지만. 로그인·주문 프레임 없음 (D-27)

## 검증 (실측)

| 항목 | 결과 |
|------|------|
| 전송 경로 자체 | **성립** — `gcloud compute ssh radar-gw --tunnel-through-iap -- -N -L 19100:10.41.1.120:9100` 후 `nc -z 127.0.0.1 19100` 성공. Mac→IAP→radar-gw→tun0→게이트웨이 (로그인·주문 없음) |
| VM sshd 정책 | `allowtcpforwarding yes` · `permitopen any` · `gatewayports no` — `-L` 목적지 지정 가능 |
| `bash -n` | 통과 |
| 인자 오류 | `--bogus` → usage + exit 1 |
| `--stop` (깨끗한 상태) | 「정리할 잔여물 없음」 + exit 0, 무변경 |
| `--check` | P1~P5 PASS · **P6 FAIL → exit 3** (로컬 KB VPN `utun4 10.41.1.126` 을 실제로 잡음 = 가드 발화 실증). 실행 후 `lo0` 별칭 0개 = 무변경 증명 |
| `.ps1` 구조 | 토큰 10종 존재 · 종료 코드 1~5 사용 · PS7 전용 구문 0건 |

## 미검증 (정직하게 남김)

| 항목 | 이유 | 누가 언제 |
|------|------|-----------|
| `.sh` 전체 경로(별칭 추가 + 별칭 바인딩 포워딩) | ① 별칭 추가에 대화형 sudo 필요 ② 지금 Mac 에 KB VPN 이 올라와 있어 P6 가 **정당하게** 거부 | 사용자가 VPN 내린 뒤 1회 |
| `.ps1` 구문·런타임 | 개발기에 `pwsh` 없음 → 구조 grep 까지만 | 사용자 Windows 에서 `-Check` 1회 |
| shellcheck | 미설치 | SKIP |

## 이탈 / 판단

1. **P5 를 `curl -sf` 로 짜지 않았다.** relay 의 DMA 세션이 degraded 면 `/healthz` 는 **503 과 함께**
   본문을 돌려준다(실측: `{"status":"degraded","vpn":true,"dma":false,...}`). `-f` 를 쓰면 본문을 버려
   「VM VPN 이 죽었다」로 오판한다. 우리가 볼 것은 `vpn` 한 필드뿐이므로 상태 코드로 판정하지 않는다.
2. **`ssh` 와 IAP 터널의 로그 파일을 분리**했다 — 같은 파일을 두 프로세스가 잡으면 `Start-Process`
   리다이렉트가 실패한다.
3. **STATE.md 의 `Last activity` 는 건드리지 않았다.** 다른 세션이 Phase 16 갭 클로징을 진행 중이라
   그 줄이 phase 진행 상황을 가리키고 있다. Quick Tasks 표에 행만 추가(append)했다.
