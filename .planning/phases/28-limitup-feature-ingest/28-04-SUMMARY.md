---
phase: 28-limitup-feature-ingest
plan: 04
subsystem: infra (radar-gw 운반기 — 119 상한가 export → GCS)
tags: [radar-gw, systemd, rsync, rrsync, gcloud-storage, gcs, bash, install-kit]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-03 워커가 읽을 export 레이아웃(<D>/manifest.json · ndjson.gz · grid) — 운반기는 그 디렉터리를 그대로 나른다"
provides:
  - "infra/relay/limitup-pull/limitup-pull.sh — 119 rrsync(~/ticks/export) → 로컬 미러 → gcloud storage rsync 2단(데이터 → manifest) · --self-test(13건) · --check · --dry-run · --allow-daytime · 종료 0/1/2"
  - "limitup-pull.service(oneshot · limitpull · Nice 19 · IO idle · MemoryMax 300M · OOMScoreAdjust 500 · [Install] 없음) · limitup-pull.timer(Mon..Fri 21:00:00 Asia/Seoul · Persistent 없음)"
  - "install.sh — root 멱등 설치기: 지문 대조(불일치 종료 2) → rsync → limitpull → 키(없을 때만, 주석 radar-gw-pull) → known_hosts → env → 유닛 → (--enable-timer) → 키 지문"
  - "docs/relay-operations.md 「radar-gw 호스트 공유」 아래 「gh-radar 상한가 export 운반기 (Phase 28)」"
affects: [28-08, 28-14, 28-15]

plan_head_before: a4955b1ea88db6f360c8f61a319dc68ad28615cc
actuals:
  tokens: 7170    # chars/4 over infra/relay/limitup-pull/* 4파일 + docs/relay-operations.md diff
  tasks: 2
  commits: 2      # MEASURED: git rev-list --count a4955b1e..HEAD (SUMMARY 커밋 전)

tech-stack:
  added: []
  patterns:
    - "radar-gw 운반기 = gh-trade tick-archive 한 벌 문법(전용 nologin 사용자 · 지문 대조 · 키는 없을 때만 · 자원 상한 · Asia/Seoul 타이머 · Persistent 없음 · 장중 가드 · flock)"
    - "GCS 업로드 2단 — ① --exclude='(^|.*/)manifest\\.json$' 데이터 ② 전체(manifest 만 오른다). --delete-unmatched-destination-objects 금지(D-16)"
    - "flock 잠금은 --delete 미러 밖(${LOCAL_DIR}.lock) — 미러 안에 두면 rsync --delete 가 잠금 파일을 지워 다음 회차가 다른 inode 를 잠근다"

key-files:
  created:
    - infra/relay/limitup-pull/limitup-pull.sh
    - infra/relay/limitup-pull/limitup-pull.service
    - infra/relay/limitup-pull/limitup-pull.timer
    - infra/relay/limitup-pull/install.sh
  modified:
    - docs/relay-operations.md

key-decisions:
  - "28-04: 운반기 flock 잠금을 미러 밖 /var/lib/limitpull/export.lock 에 둔다 — 미러 안 .lock 은 rsync --delete 가 지운다(플랜 문구 $LOCAL_DIR/.lock 에서 이탈, gcloud exclude 의 .lock 항목도 불필요해져 뺐다)"
  - "28-04: limitup-pull.service MemoryMax 300M · TimeoutStartSec 1h — 하루 약 4MB 의 작은 파일, tick-archive(600M · 6h)의 축소판"

patterns-established:
  - "radar-gw 호스트 설치 키트는 저장소에 파일만 — 설치 · 키 생성 · 119 등록 · 타이머 활성은 메인 세션/사용자 체크포인트(28-14/15)"

requirements-completed: [D-13, D-16, D-21]

coverage:
  - id: D1
    description: "운반 스크립트 순수 함수(date_dirs · dates_summary · daytime_blocked) 단언 통과 — manifest 있는 YYYYMMDD 만, .tmp 제외, 평일 06:30~20:30 KST 차단"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "bash infra/relay/limitup-pull/limitup-pull.sh --self-test → self-test OK 13 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "본 실행 경로 — rsync 실패 시 업로드 없이 종료 1 · 업로드 1단/2단 실패 종료 1 · 성공 요약 줄 · 잠금 경합 건너뜀 종료 0 · 장중 가드 종료 0 · BUCKET 형식 오류 종료 2"
    requirement: "D-13"
    verification:
      - kind: integration
        ref: "PATH 스텁(rsync · gcloud · flock)으로 do_pull 5경로 실행 — 기대 종료코드 · 요약 줄 일치(scratchpad)"
        status: pass
      - kind: other
        ref: "실 gcloud 558 로컬→로컬 rsync 나열 수: exclude 없음 listed 3 · exclude='(^|.*/)manifest\\.json$' listed 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "유닛 줄 단언 — OnCalendar=Mon..Fri 21:00:00 Asia/Seoul · Unit=limitup-pull.service · Persistent 없음 · OOMScoreAdjust=500 · MemoryMax=300M · User=limitpull · 서비스 [Install] 없음 · 코드에 delete-unmatched 0"
    requirement: "D-16"
    verification:
      - kind: other
        ref: "plan Task 1 <verify> grep 체인 + acceptance_criteria 4건"
        status: pass
    human_judgment: false
  - id: D4
    description: "설치기(키 주석 radar-gw-pull · 키는 없을 때만 · 지문 불일치 시 아무것도 쓰지 않고 종료 2 · --enable-timer 일 때만 활성 · tick-archive 소유물 무접촉) + 운영 문서 절"
    requirement: "D-21"
    verification:
      - kind: other
        ref: "bash -n install.sh · plan Task 2 <verify> grep 체인 + acceptance_criteria 4건 · 인자 오류/비root 종료 2"
        status: pass
    human_judgment: false
  - id: D5
    description: "radar-gw 실제 설치 · systemd 유닛 해석(systemd-analyze calendar/verify) · 119 키 등록 · 실 GCS 2단 업로드 · 덮어쓰기 권한"
    verification: []
    human_judgment: true
    rationale: "맥에는 systemd 가 없고 executor 는 radar-gw 접속 금지 — 28-14 Task 3 · 28-15 Task 2 체크포인트(메인 세션/사용자)에서 실측"

duration: 7min
completed: 2026-10-05
---

# Phase 28 Plan 04: radar-gw 상한가 export 운반기 Summary

**119 `~/ticks/export` 를 평일 21:00 KST 에 rrsync 읽기 전용 키(radar-gw-pull)로 미러링하고 `gcloud storage rsync` 2단(데이터 → manifest)으로 `gs://gh-radar-limitup-export/export` 에 올리는 systemd oneshot 한 벌 · 멱등 설치기 · 운영 문서 절 — tick-archive 문법 그대로, 저장소 파일만**

## Performance

- **Duration:** 약 7분
- **Started:** 2026-10-05T08:54:23Z
- **Completed:** 2026-10-05T09:01Z
- **Tasks:** 2
- **Files modified:** 5 (생성 4 · 수정 1)

## Accomplishments

- `limitup-pull.sh` — 순수 함수 `date_dirs`(manifest 있는 YYYYMMDD 만 · `.tmp` 제외) · `dates_summary` · `daytime_blocked`, 모드 `--self-test`(13건) · `--check`(원격 루트 · 버킷 `export/` 조회, 빈 버킷은 정상) · `--dry-run`(받을 날짜 · 올릴 객체 수) · 본 실행(flock → 장중 가드 → rsync → 2단 업로드 → 요약 줄 `[limitup-pull] dates=N latest=D rsync=ok upload=ok`). GCS 객체 삭제 명령 없음(D-16).
- `limitup-pull.service`/`.timer` — relay 에 양보하는 자원 상한, UTC 호스트용 `Asia/Seoul` 접미사, Persistent 없음, 서비스 `[Install]` 없음.
- `install.sh` — 설치 단계 ①~⑨: ① `ssh-keyscan` 지문 대조(불일치 「아무것도 쓰지 않았다」 종료 2) ② rsync(없을 때만) · rsync/flock/gcloud 확인 ③ `limitpull` 사용자 · 홈 750 · `.ssh` 700 · `export` 750 ④ 키(없을 때만, `-C radar-gw-pull`) ⑤ known_hosts 고정 0644 ⑥ `/etc/limitup-pull.env`(BUCKET · REMOTE) ⑦ 스크립트 0755 · 유닛 0644 · daemon-reload ⑧ `--enable-timer` 일 때만 `enable --now` ⑨ 키 지문 · 공개키 위치 안내 · 타이머 상태.
- `docs/relay-operations.md` — 소유물 · 지우지 말 것 · 버킷(relay SA `objectUser` 근거 = D+1 덮어쓰기 · 워커 `objectViewer` · 28-08 스크립트) · 설치/재설치 명령 · 키 등록(지문만, 본문은 인박스) · 확인 · gh-trade 알림/되돌리기. 같은 절 마지막 gh-trade 불릿의 경로 문장도 GCS 경유로 고쳤다.

## Task Commits

1. **Task 1: 운반 스크립트 + 유닛** — `b1a3fa1b` (feat)
2. **Task 2: 멱등 설치기 + 운영 문서 절** — `b7b4f9c8` (feat)

**Plan metadata:** (이 SUMMARY 커밋)

TDD 메모(Task 1 `tdd="true"`): 플랜이 「self-test · bash -n green 뒤 한 커밋」을 지정해 test/feat 분리 커밋은 하지 않았다. RED 증거는 세션 안에서 확보 — 스텁 `date_dirs`(빈 출력)로 `--self-test` 실행 → `self-test FAIL date_dirs` · 기대 `20261002` · 실제 빈값 · 종료 1(대상 단언 실패, 구문 오류 아님). 이어 구현 → `self-test OK 13 cases`.

## Files Created/Modified

- `infra/relay/limitup-pull/limitup-pull.sh` — 운반 스크립트(radar-gw bash 5, 맥 bash 5.3 에서 self-test 통과)
- `infra/relay/limitup-pull/limitup-pull.service` — oneshot 유닛(자원 상한)
- `infra/relay/limitup-pull/limitup-pull.timer` — 평일 21:00 KST
- `infra/relay/limitup-pull/install.sh` — root 멱등 설치기
- `docs/relay-operations.md` — 「gh-radar 상한가 export 운반기 (Phase 28)」 하위 절 + gh-trade 불릿 한 문장 수정

## Decisions Made

- flock 잠금을 미러 밖 `${LOCAL_DIR}.lock`(= `/var/lib/limitpull/export.lock`)에 둔다 — 아래 이탈 1.
- 서비스 `MemoryMax=300M` · `TimeoutStartSec=1h`(플랜 값 그대로), 스크립트 ssh 에 `ConnectTimeout=15 · ServerAliveInterval=30` 추가(tick-archive 와 같은 값 — 119 무응답 시 1h 타임아웃까지 매달리지 않게).
- 설치기 사용법 오류(인자 · 비root · 형식)는 종료 2 — 스크립트 종료코드 규약(2 = 사용법·설정)과 맞춤(tick-archive 설치기는 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] flock 잠금 파일을 --delete 미러 밖으로 이동**
- **Found during:** Task 1
- **Issue:** 플랜은 `exec 9>"$LOCAL_DIR/.lock"` 이었다. 그런데 `rsync -az --delete "$REMOTE:/" "$LOCAL_DIR/"` 는 원격에 없는 `.lock` 을 지운다 — 잠금을 쥔 회차가 도는 동안 파일이 사라지고, 다음 회차는 새 inode 를 잠가 잠금이 무력해진다.
- **Fix:** `LOCK_FILE=${LOCAL_DIR}.lock`(미러의 형제 경로). 업로드 대상에 `.lock` 이 생기지 않으므로 gcloud `--exclude` 의 `.lock` 항목은 뺐다(1단 exclude = manifest 만, 2단 exclude 없음).
- **Files modified:** infra/relay/limitup-pull/limitup-pull.sh, docs/relay-operations.md(잠금 경로 표기)
- **Verification:** 스텁 실행 뒤 `ls -a` — `export/` 와 `export.lock` 이 나란히 있음 · 잠금 경합 경로 「다른 회차가 실행 중 — 건너뜀」 종료 0
- **Committed in:** b1a3fa1b

---

**Total deviations:** 1 auto-fixed (Rule 1 버그 1)
**Impact on plan:** 정확성 보정. 범위 확장 없음.

## Issues Encountered

- 맥에는 `systemd-analyze` 가 없어 `OnCalendar=Mon..Fri 21:00:00 Asia/Seoul` 해석과 유닛 문법을 이 자리에서 기계 검증하지 못했다 — 운영 문서 설치 블록에 `systemd-analyze calendar '…'` 를 넣어 28-14 설치 때 radar-gw(systemd 252)에서 확인하게 했다.
- `gcloud storage rsync` 는 로컬→로컬 복사를 거부한다 — exclude 정규식은 그 거부 직전 「listed N」 나열 수(3 → 2)로 확인했고, 실 버킷 업로드는 28-14/15 smoke 몫.
- 커밋 위치: 이 저장소 설정상 master 는 보호 브랜치로 판정되지만(`git.base-branch --is-protected master` = true), 오케스트레이터가 master 순차 실행으로 지시했고 사용자 규칙이 「작업은 master 에서」 라 28-01~03 과 같이 master 에 커밋했다. push 는 하지 않았다.

## User Setup Required

없음(이 플랜은 저장소 파일만). 실제 설치 · 키 생성 · 119 등록 · 타이머 활성은 28-14 Task 3 · 28-15 Task 2 체크포인트.

## Next Phase Readiness

- 28-08 IAM 스크립트가 버킷 `gs://gh-radar-limitup-export`(asia-northeast3 · STANDARD · 균일 · 공개 접근 방지)와 relay SA `roles/storage.objectUser` · 워커 SA `objectViewer` 를 만들어야 운반기가 동작한다.
- 28-14: radar-gw 에 4파일 복사 → `install.sh --bucket … --host-fp SHA256:7s4iOps…`(tickarc known_hosts 로 대조) → `--self-test` · `systemd-analyze calendar` → 공개키 본문을 인박스 노트에 추기. 28-15: gh-trade 사용자 119 등록 뒤 `--check` · `--allow-daytime` 시험 1회 · 같은 경로 재업로드(덮어쓰기 403 없음) 확인 → `--enable-timer`.
- 다음 플랜: 28-05.

## Self-Check: PASSED

- FOUND: infra/relay/limitup-pull/limitup-pull.sh · limitup-pull.service · limitup-pull.timer · install.sh · docs/relay-operations.md 항목(112행 > 절 제목 101행)
- FOUND: b1a3fa1b · b7b4f9c8
- 재실행: `--self-test` OK 13 · Task 1/2 `<verify>` PASS · acceptance 8건 PASS

---
*Phase: 28-limitup-feature-ingest*
*Completed: 2026-10-05*
