---
quick_id: 260915-doz
status: complete
requirements: [DOZ-01, DOZ-02, DOZ-03]
completed: 2026-09-15
---

# Quick 260915-doz: radar-gw WireGuard — alex-mac 전용 KB 121(22·9100) 영구 반영

## One-liner

사용자가 런타임으로만 넣어 뒀던 alex-mac(10.20.0.2)→KB 121(10.41.1.121) 방화벽 규칙을 `infra/relay/startup.sh` 섹션 8 에 영구 반영하고, VM 메타데이터에 실어 재부팅에도 살아남게 했다. 라이브 wg0 는 건드리지 않았다.

## 커밋

| 해시 | 메시지 | 변경 파일 |
|------|--------|-----------|
| `5625273` | `feat(quick-260915-doz): radar-gw WireGuard 에서 alex-mac(10.20.0.2)만 KB 121 의 22·9100 에 닿게 startup.sh 섹션 8 규칙 추가` | `infra/relay/startup.sh` |
| `0b2b8a3` | `docs(quick-260915-doz): WireGuard 허용 범위 문서에 alex-mac 전용 KB 121(22·9100) 예외 반영` | `infra/relay/README.md`, `docs/dma-tunnel-guide.md`, `scripts/setup-relay-iam.sh` |

두 커밋 모두 `Co-Authored-By` 트레일러 없음, **push 하지 않았다** — 로컬 `master` 에 다른 세션의 미푸시 커밋 위에 쌓였다 (`git log --oneline origin/master..master` 확인).

## Task 1 — startup.sh 규칙 + 메타데이터 반영 + 라이브 확인

- **로컬 게이트:** `T1_LOCAL_OK` (nft 121 규칙 1줄·iptables 121 규칙 3줄·120 규칙 불변·순서 120→121→established→drop·wg0.conf 순서 120→121→conntrack, PostDown 순서·범위 문구 줄마다 121 동반 확인)
- **VM nft 문법 확인:** `NFT_CHECK_OK` (`sudo nft -c -f /dev/stdin`, 읽기 전용 check 모드)
- **메타데이터 반영:** `gcloud compute instances add-metadata radar-gw --metadata-from-file=startup-script=infra/relay/startup.sh` 성공 (`Updated […]`)
- **메타데이터 되읽기:** `META_MATCH` — 커밋된 파일과 VM 메타데이터가 끝 개행 차이 외에 동일
- **라이브 읽기 전용 확인 (재부팅·wg-quick 재시작·라이브 규칙 변경 없음):**
  - nft `chain forward`: 120 규칙 뒤·established 앞에 `iifname "wg0" oifname "tun0" ip saddr 10.20.0.2 ip daddr 10.41.1.121 tcp dport { 22, 9100 } accept` 정확히 1줄 — **이미 라이브에 있었다** (사용자가 오늘 런타임으로 넣어 둔 규칙, 이번 작업 전부터 존재)
  - forward 규칙 수: 파일 7 = 라이브 7 (편집 전 6, 121 규칙 추가로 +1)
  - `iptables -S DOCKER-USER`: 세 문자열(120 · alex-mac 전용 121 · established) 각 정확히 1줄
  - 피어 결속: `10.20.0.2/32` 를 가진 피어는 정확히 1개(라벨 `# alex-mac`), 5개 피어 전부 `AllowedIPs` `/32`
  - 기본 경로: `default via 10.10.0.1 dev ens4 …` — `ens4` 확인, `tun0` 아님
  - 공개키는 앞 6자만 기록: `jXmbac…`(10.20.0.2) · `STnFj6…`(10.20.0.3) · `QVQMew…`(10.20.0.4) · `UCQBg7…`(10.20.0.5) · `sJKTKi…`(10.20.0.6)

## Task 2 — 문서 5곳 갱신

- **게이트:** `T2_OK`
- `infra/relay/README.md`(인용문·§A 문단 2줄·검증 명령 ACCEPT 개수·자동 업데이트 절) · `docs/dma-tunnel-guide.md`(§0 표 「닿는 곳」 행) · `scripts/setup-relay-iam.sh`((d) WireGuard 주석) — 편집 전 게이트 정규식에 걸리던 5줄 전부가 같은 줄에 121 예외를 담도록 고쳤다.
- README §A 문단 끝에 `scripts/install-vpn-menubar.sh` 재실행 시 `KB-DMA.conf` 의 `AllowedIPs` 가 게이트웨이 `/32` 하나로 통째로 다시 쓰여 alex-mac 의 `10.41.1.121/32` 가 사라진다는 주의 1줄을 남겼다.
- `grep -rn 'junysim' infra/relay/README.md docs/dma-tunnel-guide.md` — 결과 없음. 다른 피어로 허용 범위를 넓히지 않았다.

## 사용자 조치

없음 — gcloud/nft 확인 명령이 모두 통과했고 권한 분류기에 막힌 단계가 없었다.

## 후속 제안 (범위 밖)

`scripts/install-vpn-menubar.sh`(약 345줄)는 재실행할 때마다 `$(brew --prefix)/etc/wireguard/KB-DMA.conf` 의 `AllowedIPs` 를 `10.41.1.120/32` 한 줄로 통째로 다시 쓴다. alex-mac 이 손으로 더한 `10.41.1.121/32` 는 그 순간 사라진다. 스크립트가 기존에 있던 추가 `AllowedIPs` 항목(게이트웨이 `/32` 이외의 것)을 보존하게 고칠지는 사용자 결정 사항으로 남긴다 — 이번 작업 범위 밖이라 손대지 않았다.

## Self-Check

- `infra/relay/startup.sh` — FOUND (커밋 `5625273`)
- `infra/relay/README.md` — FOUND (커밋 `0b2b8a3`)
- `docs/dma-tunnel-guide.md` — FOUND (커밋 `0b2b8a3`)
- `scripts/setup-relay-iam.sh` — FOUND (커밋 `0b2b8a3`)
- `git log --oneline --all | grep 5625273` — FOUND
- `git log --oneline --all | grep 0b2b8a3` — FOUND

## Self-Check: PASSED
