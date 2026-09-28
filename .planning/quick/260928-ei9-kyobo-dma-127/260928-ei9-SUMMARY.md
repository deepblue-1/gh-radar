---
phase: quick-260928-ei9
plan: 01
subsystem: infra/relay (radar-gw wg0 · 교보 SecuwaySSL)
tags: [wireguard, nftables, iptables, docker-user, kyobo, dma, radar-gw]
status: complete
task1_status: complete
task2_status: complete (2026-09-28 14:06 교보 ACL 반영 후 (c)(d) 재개 · 2026-09-29 08:47 KST 끝단 검증)
requires: [quick-260921-or9, quick-260926-bwu]
provides:
  - "startup.sh §8 nft wgfwd 교보 세트 3원소 (.112 · .119 · .127)"
  - "wg0.conf DOCKER-USER .127 규칙 6줄 (.119 거울)"
  - "README 교보 절 「DMA 서버 추가 절차」 소절"
affects: [radar-gw startup-script 메타데이터 (Task 2), alex-mac KB-DMA.conf (Task 2)]
tech-stack:
  added: []
  patterns: ["교보 DMA 서버는 IP 하드코딩 3층(nft · DOCKER-USER · Mac AllowedIPs) 대칭 확장"]
key-files:
  created: []
  modified:
    - infra/relay/startup.sh
    - infra/relay/README.md
    - infra/relay/secuway/securwayssl.service
decisions:
  - "교보 호스트 라우트는 OpenVPN PUSH_REPLY 가 아니라 로그인 응답에서 온다 — README 도달 대상 행과 unit 헤더의 「서버 푸시」 표기를 정정"
metrics:
  completed: 2026-09-28
  duration: "~35m (Task 1 ~10m · Task 2 라이브 ~25m)"
actuals:
  tasks: 1
  commits: 1
  tokens: 9000
plan_head_before: 136d4d874b09287f1b0e60ac5b405fc8b6034a1d
commits: 1
---

# Quick 260928-ei9 Plan 01: 교보 DMA 신규 서버 10.16.207.127 개통 Summary

radar-gw 의 nft wgfwd 교보 세트 5곳을 `.112 · .119 · .127` 3원소로 넓히고, wg0.conf DOCKER-USER 에 `.119` 줄의 정확한 거울인 `.127` 규칙 6줄을 추가했다. README 교보 절과 securwayssl.service 헤더도 「로그인 응답 라우트 · 재접속 때만 갱신」 기준으로 정정했다. 저장소 편집과 로컬 커밋만 했고, VM · Mac 반영은 Task 2(메인 세션) 몫이다.

## Task 1 — 저장소 편집 + 커밋 (완료)

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | startup.sh §8 · README 교보 절 · securwayssl.service 헤더에 10.16.207.127 대칭 추가 | d15bc821 | infra/relay/startup.sh, infra/relay/README.md, infra/relay/secuway/securwayssl.service |

- 커밋: `d15bc821 feat(quick-260928-ei9): 교보 DMA 신규 서버 10.16.207.127 개통 — radar-gw wg0 전달 규칙·문서`. 3경로만 담았고, 한글 메시지이며, 공동 저자 줄이 없다. push 하지 않았다.
- startup.sh 변경 내용
  - nft heredoc: 2원소 세트 5줄(MSS 2 · accept · established · masquerade)을 제자리에서 3원소로 치환했다. 순서가 그대로라 교보 accept 는 여전히 ④ drop 앞에 있다.
  - wg0.conf heredoc: `.127` 유입 쌍은 `.119` 유입 삽입 줄 뒤에, 응답 쌍은 `.119` 응답 삽입 줄 뒤에 넣었다. PostDown 2줄도 각 `.119` 줄 뒤에 넣었다. 선삭제에는 모두 `2>/dev/null || true` 꼬리가 있고, `nft delete table` 줄은 맨 끝 그대로다.
  - 주석: §8 헤더(「세 /32」), ③-b, wg0.conf 교보 주석에 `.127` 과 태그를 넣었다.
- README 변경 내용: 도달 대상 행(로그인 응답 라우트 3호스트, `.127` 도달 확인 문구는 넣지 않음), 도달성 루프 3호스트, wg 검증 주석 「ACCEPT 아홉 줄」, 새 소절 `### DMA 서버 추가 절차 (quick-260928-ei9)` 5항목. 2026-09-26 사건 기록은 바이트 불변이다.
- securwayssl.service: 헤더 주석 2-7행만 바꿨다. `[Unit]` 이하는 바이트 불변이다.

### 검증 출력

- `bash -n infra/relay/startup.sh` → `BASH_N_OK`
- 비주석 줄 수: `.127=11 .119=11`
- 하네스 `rules` → ALL PASS. 부팅 모의 `OK 21`, `-D` 18/18 꼬리, `-I` 9, 3원소 세트 5 · 2원소 0, `.127` 6줄 = `.119` 거울, 기준 대비 비주석 삭제 `5 5` · 추가 `11 11`
- 하네스 `docs` → ALL PASS. 도달 대상 행 · 파이프 3 · 루프 3호스트 · ACCEPT 아홉 줄 · 추가 절차 위치(1192 < 1248 < 1271)와 키워드 10개 · 사건 기록 바이트 불변 · unit 비주석 본문 불변 · watchdog 불변(HOST=.112)
- 하네스 `commit` → ALL PASS. feat 커밋 1건, 경로 정확히 3개, 공동 저자 줄 0, 제목에 10.16.207.127
- 하네스 `all` → PASS 48줄, ALL PASS

## Deviations from Plan

None - plan executed exactly as written.

하나 짚어 둔다. ③-b 주석과 wg0.conf 교보 주석에 태그를 병기하면서 줄이 길어져, 계획 (3)의 「주석 줄 폭은 주변과 비슷하게」에 맞춰 각각 한 줄씩 나눴다. 주석만 바뀌므로 Task 2 (a) 드리프트 게이트(`10.16.207` 포함 줄이거나 주석 줄)는 그대로 성립한다. 다만 wg0.conf diff 의 주석 줄 수는 계획 기대치(주석 1 양쪽)보다 한 줄 많아진다(삭제 1 · 추가 2).

## Known Stubs

None.

## Task 2 (main-session) — pending

**미실행.** gsd-executor 는 gcloud · ssh · sudo 를 한 번도 호출하지 않았다. radar-gw 라이브 반영, startup-script 메타데이터 갱신, securwayssl 재접속, Mac KB-DMA.conf AllowedIPs 수정과 재연결, 끝단 도달 검증은 모두 메인 세션 몫이다. 메인 세션이 끝나면 이 아래에 「라이브 반영 결과」 절을 덧붙인다.

## 라이브 반영 결과 (Task 2 · 메인 세션 · 2026-09-28 KST)

**판정: (c) 멈춤 분기 — 교보 측 계정 69990022 ACL 미갱신.** 저장소 규칙 · VM 규칙 · startup-script 메타데이터는 모두 반영돼 대기 상태다. 교보가 `.127` 을 ACL 에 넣어 주면 (c) 재접속과 (d) Mac 단계만 다시 하면 된다.

| 단계 | KST | 결과 |
|------|-----|------|
| (0) 사전 점검 | 10:46 | 장중. 데스크톱 SecuwaySSL 프로세스 없음(`pgrep -fil secuway` 비어 있음). Mac `sudo -n` 은 비밀번호 필요(헬퍼 kbdma-connect/disconnect 만 NOPASSWD) |
| (a) 드리프트 게이트 | 10:47 | VM `/etc/wireguard/wgfwd.nft` · `wg0.conf` 와 저장소 생성물 diff 는 `10.16.207` 줄과 주석 줄만(wgfwd 세트 5 + 주석 3, wg0.conf 추가 6 + 주석 1→2). `nft -c` NFT_SYNTAX_OK |
| (a) 적용 | 10:48 | `install` 두 파일 → `nft -f` 원자 교체 → wg0.conf 의 `.127` PostUp 4줄 실행(1차 호출은 `grep` 에 sudo 가 빠져 Permission denied, 2차에 `sudo grep` 으로 실행). 확인: nft `.127` 5 · DOCKER-USER ACCEPT 9 · `.127` 2 · wg-quick@wg0 active · 기본 경로 `dev ens4` 유지. wg0 재시작 안 함 |
| (b) 메타데이터 | 10:48 | `add-metadata … startup-script=infra/relay/startup.sh` Updated. VM 메타데이터 sha256 = 로컬 `d329df3e…bb5fac` 일치 |
| (c) 재접속 | 10:50~10:52 | 사용자 확인 후 `systemctl restart securwayssl.service` 1회(10:50:51). 첫 로그인 시도는 exit 1 로 실패(10:51:23) → Restart=always 30초 뒤 재기동(10:51:53) → `client connected!!`(10:51:57). NRestarts=1. `.112` 라우트 복귀 10:51:58 |
| (c) 판정 | 10:52 | `ip route`: `.112` · `.119` via 10.212.0.1 만. **`.127` 라우트 없음.** `.112:22` · `.119:22` open, `.127:22` unreachable, `.127:9100` unreachable. client.log `route add` 도 `.119` · `.112` 두 줄만 |
| (d) Mac | — | **미실행**(계획 분기 규칙). AllowedIPs 는 아직 `.112/32, .119/32` |

- 재시작을 반복하지 않았고 `ip route add` 우회도 하지 않았다(T-ei9-06).
- 재접속으로 교보 DMA(.112/.119) 세션은 10:50:51~10:51:58 약 67초 끊겼다.
- 저장소 변경은 Task 1 커밋 `d15bc821` 뿐이다. push 와 브랜치 병합은 이 quick 범위 밖이다.
- 부수 관찰: Mac 게이트웨이 터널(utun4)이 떠 있는데 10.20.0.1 · 10.41.1.120 · 10.16.207.112 모두 불통 — 핸드셰이크 정지로 보임. 이 quick 과 무관하며 (d) 때 재연결로 함께 해소될 가능성이 있다.

### 재개 결과 (2026-09-28 14:06 ~ 2026-09-29 08:47 KST)

- 교보 측이 계정 정책에 `.127` 을 추가한 뒤(14:00 KST 무렵 통보), 재접속 전 임시 라우트 시험에서 이미 `.127:22` 접속됨 · ping 2.7ms — 게이트웨이 정책 변경이 확정 원인이었다(진단 근거: 11:53 KST 임시 라우트 + tun1 캡처에서 SYN 15 / 응답 0, 같은 터널 .112 는 2.5ms).
- (c) 14:06:43 `systemctl restart securwayssl.service` 1회 → 5초 내 복귀, 로그인 응답 라우트 3개(.112 · .119 · .127 via 10.212.0.1). VM→.112/.119/.127:22 모두 open. `.127:9100` 은 당시 서버 미배포로 응답 없음 → 09-28 22:25 gh-trade 가 kyobo127 배포 후 09-29 08:40 KST VM·relay 컨테이너에서 :9100 접속 확인.
- (d) 14:09 KST 사용자가 `mac-add-127.sh` 실행: KB-DMA.conf AllowedIPs 에 `10.16.207.127/32` 추가, `kbdma-disconnect/connect` 재연결(kbdma.log 에 .127 route add 확인).
- 끝단 검증 09-29 08:47 KST(Mac, 샌드박스 밖): `.127:22` open · 대조군 `.112:22` open · `10.41.1.120:9100` open. ping 은 nft 가 tcp 22/9100 만 허용해 무응답이 정상. 주의: Claude 세션 샌드박스 안에서는 사설망뿐 아니라 공인 TCP(1.1.1.1:443)도 막혀 도달성 시험이 전부 실패로 보인다 — 도달성은 반드시 샌드박스 밖에서 재라.
- 계획 `<verify>` 한 줄 기준: VM 쪽 nft .127 5 · ACCEPT 9 · 라우트 3줄 · 127:22 open, Mac 쪽 utun4 라우트 + nc 3건 성공 — **전부 충족.**

### 재개 절차 (교보 ACL 반영 뒤)

1. VM: `sudo systemctl restart securwayssl.service` 1회 → `ip route show | grep 10.16.207` 에 `.127` 확인 → `timeout 3 bash -c '</dev/tcp/10.16.207.127/22'`.
2. Mac: KB-DMA.conf AllowedIPs 에 `10.16.207.127/32` 추가(계획 (d) 의 멱등 sed, sudo 비밀번호 필요) → `kbdma-disconnect` · `kbdma-connect` → `nc -z -G 3 10.16.207.127 22` + 대조군 `.112:22` · `10.41.1.120:9100`.

## Self-Check: PASSED

- FOUND: infra/relay/startup.sh · infra/relay/README.md · infra/relay/secuway/securwayssl.service (커밋 d15bc821 에 포함)
- FOUND: commit d15bc821 (`git rev-list --count 136d4d87..HEAD` = 1)
