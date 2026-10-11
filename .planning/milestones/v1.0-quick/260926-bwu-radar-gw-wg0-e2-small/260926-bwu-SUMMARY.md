---
phase: quick-260926-bwu
plan: 01
subsystem: infra/relay (radar-gw VM)
tags: [wireguard, wg0, iptables, startup-script, e2-small, docs]
status: complete
requires: []
provides:
  - "wg0.conf PostUp 선삭제 14줄 전부 오류 무시 꼬리 — 부팅 직후(규칙 0개)에도 PostUp 17개 성공"
  - "README e2-small 반영 + 2026-09-26 사건 기록 + 막힐 때 행 + DOCKER-USER ACCEPT 7줄"
  - "setup-relay-iam.sh VM 생성 분기 e2-small"
affects: [radar-gw 다음 재부팅, gh-trade 클라이언트·alex-mac DMA 직결]
tech-stack:
  added: []
  patterns: ["PostUp 선삭제(-D)는 꼬리 필수, 삽입(-I)은 꼬리 금지"]
key-files:
  created: []
  modified:
    - infra/relay/startup.sh
    - infra/relay/README.md
    - scripts/setup-relay-iam.sh
decisions:
  - "wg0.conf PostUp 의 모든 iptables -D 는 2>/dev/null || true 로 끝나야 하고, iptables -I 에는 붙이지 않는다(삽입 실패는 숨기지 않음)"
  - "README 의 날짜 박힌 과거 실측(09-05 머신 타입 · 09-06 free -m · 9/22 netcut 부하)은 보존하고 현재형 기술만 e2-small 로 갱신"
metrics:
  duration: "약 3분 (2026-09-25T23:46Z–23:49Z)"
  completed: 2026-09-26
actuals:
  tokens: 3500
  tasks: 2
  commits: 1
commits: 1
plan_head_before: ca3b570149862c52efd509e59b8c1179147ad5bc
---

# Phase quick-260926-bwu Plan 01: radar-gw wg0 부팅 실패 수정 · e2-small 전환 문서 반영 Summary

startup.sh 559행(교보 10.16.207.119 응답 규칙 선삭제)에 빠져 있던 `2>/dev/null || true` 꼬리를 형제 줄과 같게 붙이고 §8.5 주석 가드로 규칙을 박아, 부팅 직후 PostUp 17개가 전부 성공하도록 고쳤다(하네스 부팅 모의 `OK 17`). README 와 setup-relay-iam.sh 도 e2-small 현실에 맞췄다. VM 반영은 사용자가 한다.

## 하네스 결과 (RED → GREEN)

- **RED (수정 전, afe26e2 = ca3b570 기준 원본):** `wg0` → SOME FAILED — `부팅 모의: 기대 [OK 17] 실측 [HOOK-FAIL iptables -D DOCKER-USER -o wg0 -s 10.16.207.119 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT]` · 꼬리 13/14 · 비주석 변경 0 · 태그 0. 09-26 실제 장애와 같은 줄이다.
- **GREEN (Task 1 후):** `wg0` → ALL PASS — 부팅 모의 OK 17 · -D 14/14 꼬리 · -I 7 꼬리 없음 · nft PostDown 불변 · 비주석 변경 2(559행 -1 +1) · 태그 1.
- **최종 (커밋 후):** `all` → ALL PASS (PASS 46개: wg0 8 + docs 34+ + commit 4 — 미push fix 커밋 1건 · 경로 정확히 3개 · 공동 저자 0 · 제목 요지).

**하네스 기준 커밋:** 하네스는 `BASE_REF=afe26e2` 로 고정돼 있고 실행 시작 시 HEAD 는 ca3b570 이었다. `git diff --stat afe26e2 ca3b570 -- infra/relay/startup.sh infra/relay/README.md scripts/setup-relay-iam.sh` 결과 변경이 없어 하네스 기준은 **고치지 않았다**.

## 커밋

- `94e40a3` (전체 `94e40a3200e076551a557c7d4a43cd1f1c3e9272`), master, **push 안 함**

```
fix(quick-260926-bwu): radar-gw wg0 부팅 실패 수정 · e2-small 전환 문서 반영

- startup.sh: wg0.conf PostUp 교보 119 응답 규칙 선삭제에 오류 무시 꼬리 누락 → 부팅 직후 Bad rule 로 wg-quick 이 wg0 삭제, 형제 줄과 같은 형태로 수정 + §8.5 주석 가드
- README: 머신 타입 e2-small(2026-09-26 전환) · 메모리 예산 · DOCKER-USER ACCEPT 7줄 · 막힐 때 행 · 교보 절 사건 기록(VM 반영 대기)
- setup-relay-iam.sh: VM 생성 머신 타입 e2-small
```

경로 지정 커밋(`git commit -F … -- <3개 경로>`)을 썼다. 공동 저자 트레일러는 없다(사용자 CLAUDE.md 규칙).
**commits 측정 메모:** `git rev-list --count ca3b570..HEAD` = 2 이지만, 그중 `ef122d2 test(21-15): …` 는 내 커밋 직후 다른 세션(Phase 21-15)이 만든 커밋이다. 이 플랜의 커밋은 `94e40a3` 1건이다.

## 변경 내용

**Task 1 — infra/relay/startup.sh**
- 559행(현재 562행): `PostUp = iptables -D DOCKER-USER -o wg0 -s 10.16.207.119 … -j ACCEPT` 뒤에 ` 2>/dev/null || true` 를 붙였다. 557행(112 판)과 같은 형태다.
- §8.5 주석 블록의 기존 ⚠️ 두 줄 아래에 주석 3줄을 더했다. 선삭제는 꼬리가 필수라는 것, 그 이유(부팅 직후 규칙이 없고, wg-quick 은 PostUp 하나만 실패해도 wg0 를 지운다), -I 에는 꼬리를 붙이지 않는다는 것, 태그 `2026-09-26 재부팅 · quick-260926-bwu` 를 담았다. heredoc 안은 그 한 줄 외에 바꾸지 않았다.

**Task 2 — infra/relay/README.md**
- A1 §구성 개요 머신 타입 행 → e2-small (2 vCPU 공유 / 2048 MB · 보장 0.5코어) — 2026-09-26 전환
- A2 09-05 머신 타입 행 · 09-06 free -m 행 · 9/22 netcut 부하 줄은 그대로 뒀다(하네스 불변 게이트 PASS)
- A3 `sudo iptables -S DOCKER-USER` 주석 → ACCEPT 일곱 줄 (120 · alex-mac 전용 121 · tun0 응답 · 교보 112·119 · 교보 응답 2)
- A4 §막힐 때 에 「(A) VM 재부팅 후 `wg0` 자체가 없음」 행을 넣었다(셀 안 파이프 0, 칸 구분 파이프 3)
- A5 재부팅 런북 「② 가 장중 금지인 이유」 1번 → 공유코어 VM(현재 e2-small)
- A6 §교보 SecuwaySSL VPN 끝(MAC 바인딩 인용 다음, D-03 앞)에 `### 사건 기록 — 2026-09-26 재부팅 시 wg0 기동 실패` 를 넣었다: 반영 상태 인용 · 경위 · 원인(c6d1594 · quick-260921-or9) · 규칙 · 반영 절차. 키·공개키·wg show 출력은 넣지 않았다.
- A7 §메모리 예산: 헤딩 `(2048 MB · e2-small — 2026-09-26 전환)` · 합계 여유 1350–1640 MB(e2-micro 시절 326–616 MB 병기) · 조건부 문단을 `**2026-09-26 e2-small 전환.**` 단락과 절차 단락으로 교체 · gcloud 3줄 블록 유지 · IP 문장 뒤에 ens4 MAC 유지와 재기동 후 6개 유닛 active 확인을 더했다

**Task 2 — scripts/setup-relay-iam.sh**
- D-07 아래에 주석 `(2026-09-26 e2-small 로 전환 — 근거 infra/relay/README.md §메모리 예산)` 을 더했다. D-07 원문은 그대로다.
- VM 생성 분기의 `creating VM` 안내문과 `--machine-type=` 을 e2-small 로 바꿨다. 메타데이터 갱신 분기는 그대로다. 스크립트는 실행하지 않았다.

## Deviations from Plan

None - plan executed exactly as written.

실행 메모 (계획과 다르게 한 것은 없음):
- 실행 중 gcloud · ssh · VM 조작은 0회다.
- 커밋 전 GSD pre-commit 보호 브랜치 검사에서 master 가 protected=true 로 나왔다. 오케스트레이터 지시(isolation: none, main tree 순차 실행)와 이 프로젝트의 master 직접 작업 관례에 따라 3개 경로만 경로 지정으로 커밋했다.
- 동시 세션의 변경(`.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock` · 새로 생긴 `webapp/src/lib/native/__tests__/native-google-login.test.ts`)은 스테이징하지 않았다.

## 사용자 반영 절차 (VM — 사용자 실행)

장 마감 **20:00 KST 이후 또는 주말**에:
1. `GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh` — 기존 VM 이면 startup-script 메타데이터만 재적용된다
2. VM 재부팅 — startup.sh 가 매 부팅 wg0.conf 를 재작성한다
3. 확인 3항목: `systemctl is-active wg-quick@wg0` = active · `sudo iptables -S DOCKER-USER` 에 ACCEPT 7줄 · `ip route show default` = `dev ens4`

반영 뒤 README 사건 기록의 「반영 상태: … VM 반영 대기」 인용 줄을 반영 완료로 바꾸면 된다.

## VM 반영 결과 (2026-09-26, 오케스트레이터 · 사용자)

1. 사용자 실행 `wg0-rollout.sh` (08:5x KST): startup-script 메타데이터만 단일 키 재적용 → VM 생성물 wg0.conf 26행 동일 수정(diff 1줄) → `wg-quick@wg0` 재기동. active · peers 5/5 · DOCKER-USER ACCEPT 7. 메타데이터 startup-script == 저장소 startup.sh 확인.
2. 재부팅 검증 (08:58 KST, stop/start): 30초 안에 relay healthz ok(vpn·dma true) · `wg-quick@wg0` active · 부팅 저널 Bad rule/FAILURE 0 · peers 5 · 핸드셰이크 3(부팅 전에도 수일 무접속이던 2개 제외) · ACCEPT 7 · ens4 MAC 42:01:0a:0a:00:05 불변 · e2-small RAM 1976MB(사용 507).
3. README 사건 기록의 반영 상태 인용 줄을 「완료」로 갱신(docs 커밋에 포함).

## 후속 후보 (범위 밖 — 손대지 않음)

- `infra/relay/startup.sh` 55행 swap 주석: 옛 머신 타입(e2-micro) 기준 설명
- `scripts/deploy-relay.sh` 416행 · 455행 주석: 옛 머신 타입 기준 설명
- 원격 push: 사용자 몫(push 가 webapp 프로덕션 배포를 겸한다)

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: infra/relay/startup.sh (태그 quick-260926-bwu 포함)
- FOUND: infra/relay/README.md (사건 기록 헤딩 포함)
- FOUND: scripts/setup-relay-iam.sh (--machine-type=e2-small)
- FOUND: commit 94e40a3 (git log 에 있음, 경로 3개)
- 하네스 `all` ALL PASS (커밋 후 재실행)
