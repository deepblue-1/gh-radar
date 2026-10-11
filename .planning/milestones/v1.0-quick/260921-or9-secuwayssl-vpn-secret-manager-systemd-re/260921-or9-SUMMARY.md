---
quick_id: 260921-or9
slug: secuwayssl-vpn-secret-manager-systemd-re
date: 2026-09-21
status: complete
title: 교보 SecuwaySSL VPN radar-gw 상시화 (Secret Manager + systemd)
---

# SUMMARY — 교보 SecuwaySSL VPN 상시화

## 결과: 완료·실증
radar-gw 에서 교보 SecuwaySSL VPN 이 systemd 상시 서비스로 동작한다. 부팅 자동기동, 터널 사멸 시 자동 재연결.

## 구현
- **Secret Manager** `kyobo-vpn-cred`(2줄) 생성, VM SA `gh-radar-relay-sa` 에 `secretAccessor` 부여. 값 미기록.
- **repo `infra/relay/secuway/`**: `secuway-fetch-secret`·`secuway-connect`·`secuway-watchdog`·`securwayssl.service`·`securwayssl-watchdog.{service,timer}`·`install.sh`.
- **VM 설치**: `/usr/local/sbin/*`, `/etc/systemd/system/*`, `daemon-reload`, `enable`(부팅 자동기동).
- **프로세스 모델**: `SecuwaySSLU_client` 는 런처(인증 후 `sbin/sslvpn` 띄우고 종료). `secuway-connect` 가 런처를 백그라운드로 돌린 뒤 `sslvpn` PID 에 blocking → `MainPID` = 래퍼. Type=simple + Restart=always 로 결정적 재연결. (Type=forking 은 프로세스 3개로 `MainPID=0` → 폐기.)

## 검증 (실측 2026-09-21)
- `securwayssl.service` active + enabled, MainPID = `/usr/local/sbin/secuway-connect`.
- `securwayssl-watchdog.timer` active + enabled(3분 주기).
- 교보 서버 `10.16.207.112`·`10.16.207.119` `:22` open, `tun1` up.
- 기본 경로 `dev ens4` 유지, KB `tun0`·`wg0` 무영향(라우팅 격리).
- **죽음→재연결 실증**: `pkill -x sslvpn` → NRestarts 0→1, 새 PID 재기동, 55초 내 도달성 복구.
- `/run/secuway.cred` 0600 root.

## 문서화
`infra/relay/README.md`: 운영 상태 표에 2유닛 추가 + 「교보 SecuwaySSL VPN — 상시 DMA 터널」 섹션(구성·프로세스 모델·조작·MAC 바인딩·**데스크톱 동시접속 금지 상호배제 경고**).

## 위생
평문 자격증명 `client.stdout` 삭제, VM `/tmp` 배포 임시파일 정리.

## 미해결·주의
- **동시접속 금지**: VM 과 데스크톱이 동일 등록 MAC(`42:01:0a:0a:00:05`). 동시 접속 시 세션 끊김/계정 잠금 위험.
- VM 재생성 시 MAC 변경 → 교보 재등록 필요. systemd 유닛은 메타데이터 미등록이라 VM 재생성 시 소멸(재설치 필요).
- 세션 권한 규칙(`Bash(gcloud compute ssh radar-gw:*)` 등)은 사용자가 settings 에 추가함.
