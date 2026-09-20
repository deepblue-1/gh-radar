---
phase: quick-260920-pik
plan: 01
subsystem: infra/relay
tags: [netcut, wg-probe, 측정기, 문서, 인프라-자산, 네트워크-단절]
status: complete

requires:
  - "infra/relay/README.md §터널 정지 판정 절차 — wg-probe (상호참조 대상)"
  - "infra/relay/README.md §현재 운영 상태 · §파일 맵 (행 추가 대상)"
provides:
  - "infra/relay/netcut-probe.sh — 5축 외부 경로 단절 측정기 (VM 배치본과 sha256 동일)"
  - "infra/relay/netcut-daily.sh · netcut-daily.service · netcut-daily.timer — 평일 자동 측정 유닛 3종"
  - "infra/relay/README.md §외부 경로 단절 판정 — netcut (조회·분석법 · 사건 기록 · 운영 한계)"
affects:
  - "VM radar-gw 재생성 시 netcut 4종 재배치 절차 (문서로만 — 이번에 실행하지 않음)"

tech-stack:
  added: []
  patterns:
    - "측정기 자산은 저장소가 정본이고 sha256 이 VM 배치본과의 동일성을 기계로 증명한다 (wg-probe 선례를 따름)"
    - "표는 복사하지 않고 가리킨다 (CLAUDE.md §Conventions — 표가 둘이 되면 갈라진다)"

key-files:
  created:
    - infra/relay/netcut-probe.sh
    - infra/relay/netcut-daily.sh
    - infra/relay/netcut-daily.service
    - infra/relay/netcut-daily.timer
    - .planning/quick/260920-pik-netcut-61/260920-pik-SUMMARY.md
  modified:
    - infra/relay/README.md

decisions:
  - "§현재 운영 상태 표에 netcut-daily.timer 행을 더했다 — 그 표가 운영 유닛의 정본이고 wg-probe 도 거기 있다. 거기 없는 상시 유닛은 없는 것으로 읽힌다"
  - "설치 날짜를 지어내지 않았다 — 자산이 언제 VM 에 올라갔는지는 주어진 사실에 없어 시점 근거는 새 절이 진다"
  - "wg-probe 의 §임계값 표·§판정 표·§3자 대조 표를 복사하지 않고 포인터로만 가리켰다"
  - "sha256 을 맞추려고 자산 내용을 고치지 않았다 — 4종 모두 첫 작성에서 그대로 일치했다"

metrics:
  duration: "~10분"
  completed: "2026-09-20"
  tasks: 3
  commits: 1

actuals:
  tokens: 3885
  tasks: 3
  commits: 1
  plan_head_before: 98e6cd648e59574b9238879aa83fe24ca1d3a046
---

# Quick 260920-pik: netcut 측정기 박제 + 61분 주기 국내 단절 사건 기록 Summary

2026-09-17~18 「61분 주기 국내 방향 단절」을 잰 5축 측정기 4종을 VM 배치본과 **sha256 바이트 동일**하게 저장소에 박제하고, 그 사건의 측정된 사실·무혐의 근거·판정과 「VM 재생성 시 사라진다」는 한계를 `infra/relay/README.md` 에 기록했다. 코드 동작 변경 0 · VM 상태 변경 0 · 푸시 0.

## ① sha256 대조 실측 결과 (4건 전부 OK)

| 파일 | 기대 sha256 | 결과 |
|------|-------------|------|
| `infra/relay/netcut-probe.sh` | `76e24b9e652c779ed9ae71bb670687696c0e2387172870aaa9baa9f08c101d4a` | **OK** |
| `infra/relay/netcut-daily.service` | `3e6dccf7032f858f80b54bbfb0754b1c8e11fada190ddc969b8654f689962517` | **OK** |
| `infra/relay/netcut-daily.timer` | `812829f52cb0517756cbe5311c62d6d8a8cde891008191b6836587dde5866c45` | **OK** |
| `infra/relay/netcut-daily.sh` | VM 접두 `40688e0e` **+** 복사충실도 전체값 `40688e0e7b332005d6f123b4a8d3b01eae2c49601ba53f02d674dcf7cfaec327` | **OK (둘 다)** |

**네 파일 모두 첫 작성에서 그대로 맞았다.** 플랜이 허용한 조정 3종(파일 끝 개행 · CRLF · 줄 끝 공백)을
**한 번도 쓰지 않았고**, sha 를 맞추려고 내용을 고친 곳은 **없다**.

**VM 원본을 내려받지 않았다.** 플랜이 선택적 복구 경로로 허용한
`gcloud compute ssh radar-gw … sudo cat <경로>` 는 **실행하지 않았다** — 첫 대조에서 4건이 전부
통과해 필요가 없었다. 이 작업 전체에서 **`gcloud` 호출 0회**이며 VM 상태는 읽기조차 하지 않았다.

**tracer 순서를 지켰다.** 가장 길고 줄바꿈 사고 가능성이 큰 `netcut-probe.sh` **하나만** 먼저 쓰고
「쓰기 → `shasum` 대조 → `bash -n`」 파이프라인이 실제로 통과하는 것을 확인한 뒤 나머지 3종으로 확장했다.

**부가 게이트.** `bash -n` 2종 exit 0 · `grep -c '10\.41\.1\.120' netcut-probe.sh` = **1**.
파일 모드는 저장소 선례대로 셸 2종 `100755`(`kbvpn-*.sh` 와 같음) · 유닛 2종 `100644`(`wg-probe.service` 와 같음).

## ② README 편집 네 곳 (순수 추가 · 삭제 0줄)

`git diff --numstat` = **`196  0`** — **삭제 줄 0**. 기존 줄을 지우거나 고쳐 쓴 곳이 없다.

| # | 위치 | 무엇 |
|---|------|------|
| (1) | `## 외부 경로 단절 판정 — netcut` (README:784, §적용 런북 바로 앞 구분선 앞) | 신설. 소절 5개 — 왜 있는가/5축 · 어떻게 도는가 · 조회·분석법 · 사건 기록 · 운영 한계 |
| (2) | §현재 운영 상태 표 (README:66) | `netcut-daily.timer` 행 1개 — `wg-probe` 행 바로 아래 |
| (3) | §파일 맵 표 (README:1373~1376) + 주석 블록 | 4행 + **예외 4** |
| (4) | §터널 정지 판정 절차 — wg-probe 의 §판정 끝 (README:730, §장 마감 후 런북 바로 앞) | 상호참조 인용 블록 1덩어리 |

**§현재 운영 상태 표에 행을 더하기로 한 결정과 그 이유.** 그 표가 **운영 유닛의 정본**이고 `wg-probe`
도 거기 있다. **거기 없는 상시 유닛은 없는 것으로 읽힌다** — 다음 사람이 `systemctl list-timers` 에서
낯선 타이머를 보고 「이게 뭐지, 지워도 되나」를 묻게 된다. 값 칸에 `enabled` · 예약
(`Mon-Fri 08:00 KST`) · 새 절 참조 · **메타데이터 미등록이라 VM 재생성 시 소멸**을 함께 적었고,
확인 방법 칸에는 `systemctl is-enabled netcut-daily.timer` 와 `systemctl list-timers 'netcut-*' --all` 을 뒀다.
**설치 날짜는 지어내지 않았다** — 자산이 언제 VM 에 올라갔는지는 주어진 사실에 없다. 시점 근거는 새 절이 진다.

**사건 절은 `<incident_facts>` 의 사실만으로 썼다.** 거기 없는 수치·시각·원인을 만들지 않았고,
재지 못한 것은 재지 못했다고 적었다 — 예: 「왜 멎었는지는 재지 못했다 — 상위 구간은 이쪽에서
관측할 수 없다」. 판정(**GCP 서울 ↔ 국내 ISP 피어링/전달 구간**)과 그 근거(**같은 순간 `8.8.8.8`·
메타데이터 무응답 0**)를 절 맨 앞 인용 블록에 가장 눈에 띄게 뒀다.

**문서의 awk 가 실제로 문다.** 끊긴-구간 검출 awk 는 README 안에서 **물리적으로 한 줄**(README:842)
이고 4개 로그에 `for` 로 돌린다 — 같은 식을 네 번 적지 않았다. 게이트가 **README 원문에서 그 한 줄을
뽑아** 합성 로그에 실행해 `101.000  gap 9.0s` **1건**을 검출했다(손으로 옮겨 적은 스니펫이 아니다).

## ③ 복사하지 않고 가리킨 곳 (이 작업의 실패 모드를 피한 자리)

| 가리킨 대상 | 어디서 |
|-------------|--------|
| wg-probe **§임계값 표** | 새 절에 옮기지 않음. `§임계값 표` 문자열 등장 **베이스라인 2건 = 작업 후 2건**(늘지 않음) |
| wg-probe **§판정 표** | 새 절 대신 (4) 상호참조가 「위 §판정 표에서 … 귀속이 의심되면」으로 가리킴 |
| wg-probe **§3자 대조 표** | 새 절에 옮기지 않음 |
| **시계 규약(VM 은 UTC · KST = UTC+9)** | 「§터널 정지 판정 절차 — wg-probe 의 §조회 가 정본이다 — 여기 다시 적지 않는다」 |
| **장중 금지 런북** | 「`startup.sh` 전체 재적용(**장중 금지** — §장 마감 후 재부팅 생존 반영 런북)을 요구하지 않는다」 |
| **되돌리는 배치 절차** | §파일 맵 예외 4 가 「§외부 경로 단절 판정 — netcut 의 §운영 한계 ⓑ」로 가리킴 (절차 본문은 한 곳에만) |

**비밀 값·피어 공개키·피어 엔드포인트 주소는 새 절에 한 글자도 넣지 않았다.**
게이트: base64 44자 패턴 `[A-Za-z0-9+/]{43}=` **0건**(베이스라인도 0건).
새 절이 적은 주소는 공개 DNS 2곳(`168.126.63.1`·`164.124.101.2`) · `8.8.8.8` ·
`169.254.169.254` · 이미 문서 전반에 있는 `10.41.1.120` 뿐이다.

## ④ `10.41.1.120` 리터럴 1건의 성격

`netcut-probe.sh` 가 저장소에 `10.41.1.120` 리터럴을 **한 번** 들여온다
(`timeout $DUR ping … -I tun0 10.41.1.120`). 이것은 **`tun0` 경유 ICMP 도달성 측정**이며
**DMA 로그인·주문 경로가 아니다** — 로그인 프레임도 주문 프레임도 보내지 않고, 응답 시각만 기록한다.
**D-27 의 「접속 경로 0건」 계약은 유지된다.** 바이트 동일성이 이 리터럴을 강제하므로 제거할 수 없고,
그래서 PLAN §threat_model 의 **T-PIK-03 은 `accept`** 로 처분됐다 — 성격을 여기와 문서에 명시하는 것이 그 수용 조건이다.

## ⑤ 하지 않은 것 (정직 기록)

- **`systemd-analyze verify` 미실행** — macOS 로컬에 systemd 가 없다. 유닛 2종의 검증은 **sha 동일성으로 대신**했다(VM 에서 이미 가동 중인 바이트이기 때문).
- **§메모리 예산 표 미갱신** — netcut 의 RSS 를 실측한 적이 없다. 행을 비워 두는 대신 **왜 비었는지**를 §운영 한계 ⓓ 에 적었고, 다음 VM 접속 때 `MemoryCurrent` 로 재라고 남겼다.
- **VM 상태 변경 0 · `gcloud` 호출 0회** — 읽기조차 하지 않았다. 배치 절차는 **문서로만** 남겼고 실행하지 않았다.
- **VM 실측 권한 미확인** — §운영 한계 ⓒ 에 「배치 명령의 모드(0700/0700/0644/0644)가 정본이다」라고 명시했다. 현재 VM 파일의 실제 권한을 읽어 대조한 적이 없다.
- **푸시 미실행** — 사용자 확인 후 오케스트레이터 몫.
- **`.planning/STATE.md` · `ROADMAP.md` 미변경** — 오케스트레이터 몫.
- **네트워크 등급 전환 미실행·미권고** — §운영 한계 ⓔ 에 **비용 관점의 별건**이자 **단절 회피 효과 미검증**으로 남겼다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2 게이트의 임계값 정본 문자열이 애초에 매칭 불가였다 — 게이트를 고쳤고 문서는 고치지 않았다**

- **Found during:** Task 2 게이트 실행
- **Issue:** 플랜의 게이트는
  `test "$(grep -c 'wg-probe.py 헤더 주석 §임계값 표' infra/relay/README.md)" = "1"` 인데,
  README 의 실제 문장은 ``> **임계값 표의 정본은 `infra/relay/wg-probe.py` 헤더 주석 §임계값 표 다.**``
  로 `wg-probe.py` **뒤에 백틱**이 있다. 그래서 이 리터럴은 **내 편집 전 베이스라인에서도 0건**이었다
  (`git show HEAD:infra/relay/README.md | grep -c …` = **0**). 즉 **만족 불가능한 게이트**다.
- **Fix:** **README 를 게이트에 맞추지 않았다** — 그것은 「sha 를 맞추려고 내용을 고치는 것」과 같은
  종류의 오류다. 대신 게이트의 **의도**(「임계값 정본 문장이 복사되지 않고 여전히 1건인가」)를 그대로
  재는 리터럴로 교체해 실행했다:
  - `grep -c '헤더 주석 §임계값 표'` → **베이스라인 1 = 작업 후 1** (정본 문장 그대로, 복사 0)
  - `grep -c '§임계값 표'` → **베이스라인 2 = 작업 후 2** (임계값 표 참조를 **하나도 늘리지 않았다**는 더 강한 증거)
- **Files modified:** 없음 (검증 절차만 정정)
- **Note:** 후속 세션이 이 게이트를 다시 쓸 때는 **백틱을 포함**하거나 `'헤더 주석 §임계값 표'` 로 쓸 것.

### 관측 사실 (수정 아님)

**2. 실행 중 `master` HEAD 가 다른 세션에 의해 3커밋 전진했다**

- 오케스트레이터가 알려준 시작 HEAD 는 `b0d5ae6` 였으나, Task 1~2 진행 중 **동시 실행된 17-10 세션**이
  `203452a` · `f73312c` · `98e6cd6` 을 `master` 에 올렸다. 내 커밋의 부모는 `98e6cd6` 이다.
- **충돌 없음을 실측으로 확인했다:** `git diff --stat b0d5ae6..98e6cd6 -- infra/relay` **출력 0줄**
  (17-10 은 `webapp/` 만 만졌다). 내 README 편집의 기준 줄 번호는 영향받지 않았다.
- **오염 방지:** 커밋 직전 인덱스가 비어 있음을 확인했고(`git diff --cached --name-only` 출력 0줄),
  스테이징을 **경로 명시**로만 했다. 작업 트리에 남아 있던 17-10 의 미커밋 변경
  (`webapp/src/lib/__tests__/order-notices.test.ts`)과 `.planning/milestone.lock` 은 **커밋에 들어가지 않았다.**
- **`.planning/quick/260920-pik-netcut-61/` 는 이번 커밋 전까지 미추적이었다** — 그래서 이 실행은
  worktree 격리 없이 메인 트리에서 순차 수행했다(오케스트레이터 지시).

## Known Stubs

없음. 이 작업은 문서와 자산 박제뿐이고 실행 코드 경로를 만들지 않았다.

## Threat Flags

없음. 새로 생긴 네트워크 엔드포인트·인증 경로·스키마 변경이 없다.
PLAN §threat_model 의 4건은 그대로 처분됐다 — T-PIK-01 `mitigate`(sha 게이트 4건 통과) ·
T-PIK-02 `mitigate`(base64 44자 0건) · T-PIK-03 `accept`(위 ④) · T-PIK-04 `mitigate`(중복 측정 경고를 런북에 명기).
패키지 설치 **0건**(T-PIK-SC 비해당).

## 남은 일 (다음 VM 접속 때)

1. `systemctl show netcut-daily.service -p MemoryCurrent` → §메모리 예산 표에 netcut 행 채우기 (한계 ⓓ)
2. `stat -c '%a %n' /usr/local/sbin/netcut-* /etc/systemd/system/netcut-daily.*` → 실제 권한 대조 (한계 ⓒ)
3. `sha256sum /usr/local/sbin/netcut-probe-260917 /usr/local/sbin/netcut-daily` → 저장소와 재대조
4. (선택) `setup-relay-iam.sh` 에 메타데이터 키를 더해 VM 재생성 생존까지 확보 — **별건이며 장 마감 후에만**
