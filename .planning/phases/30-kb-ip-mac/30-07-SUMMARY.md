---
phase: 30-kb-ip-mac
plan: 07
subsystem: ops-deploy-inbox
tags: [deploy, relay, cloud-run, vercel, uat, inbox, gh-trade, order-ip-mac, shared-account]
status: complete

requires:
  - phase: 30-01
    provides: "R3-01 op 1/3 직전 op 5 재조회 · R3-02 공유 계좌 IP/MAC 되싣기(D-15 · D-16)"
  - phase: 30-06
    provides: "P30 E2E · 전 워크스페이스 회귀 게이트(첫 배포 전제)"
  - phase: 30-08
    provides: "IP/MAC 표시 표기 formatOrderIp · formatOrderMac(D-17)"
  - phase: 30-09
    provides: "공유 계좌 안내 줄 · findSharedAccountHolders · 저장 뒤 재조회(D-18)"
provides:
  - "프로덕션 배포 기록 — relay relay:2234a1b5 · server gh-radar-server-00061-fvv · webapp 5dfb884c..2234a1b5 · 갭 클로징 webapp 2234a1b5..34f145b1"
  - "실서버 확인 2라운드 — R3-01 op 5 재조회 · 「변경 없음」 · 짝 검증 · D-17 표시 표기 · D-18 안내 줄 · KB120 공유 계좌 IP/MAC 동시 반영"
  - "인박스 261010-kb-order-ip-mac.md 닫힘 — 질문 3개 답 · KB IP/MAC 설정 보류 권고 해제 · status done · done_commit 5687c282"
  - "30-UAT.md complete — gap 2건 resolved · Round 2 표"
affects: [gh-trade-inbox, phase-31, kb121-enable, admin-users]

actuals:
  tokens: 1269
  tasks: 3
  commits: 2
plan_head_before: 34f145b127f06709d4662c58381aec20353dc5da
plan_head_after: 13355b7758e2abf7a8943bba8e948ee0317257ea

tech-stack:
  added: []
  patterns:
    - "갭 클로징 재배포 범위는 `git diff --stat <첫 배포 태그>..HEAD -- relay/src server/src` 로 정한다 — 빈 출력이면 webapp push 하나"
    - "인박스 노트 회신은 질문 번호와 1:1 번호 목록 · 진행 단락의 보류 문장은 대체(공존 금지) · done_commit 은 마지막 코드 커밋(`git log -1 -- relay server packages webapp`)"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-07-SUMMARY.md
  modified:
    - docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md
    - .planning/phases/30-kb-ip-mac/30-UAT.md

key-decisions:
  - "인박스 ① 답은 공유 계좌 저장이 이미 된다는 사실을 그대로 적는다 — gh-trade 261011 이 KB120 에 배포되고 2026-10-11 사용자가 확인. 플랜의 「이미 된다고 쓰지 말라」 금지는 미배포 상태 전제라 오케스트레이터 override 로 대체 · KB121 은 「gh-trade 배포 여부 확인 필요」"
  - "done_commit = 5687c282(30-09 E2E 커밋) — 이 phase 마지막 gh-radar 코드 커밋. 문서 · 계획 커밋 제외"
  - "code 7 문장 대조 재확인은 제품 소스만(__tests__ · *.test.* · *.spec.* · e2e 픽스처 제외) — 0건. 테스트의 code 7 원문 상수는 목 응답이라 대조가 아니다"
  - "주문 전문(TCHODR1000 orderInfo · macAddr)에 IP/MAC 이 실제로 실리는지 회선 관측은 남은 확인(비차단) — 인박스 노트와 30-UAT 에도 같은 줄"

patterns-established:
  - "외부 저장소 몫(gh-trade)이 끼는 gap 은 UAT 에 resolved_by · retest 와 배포 서버별 범위(KB120 확인 · KB121 미확인)를 함께 적는다"

requirements-completed: [IPMAC-04, IPMAC-01, IPMAC-02]

coverage:
  - id: D1
    description: "인박스 261010 회신 — ① code 7 넓혀 달라 + 261011 공유 계좌 동시 반영(KB120 배포 · 확인) ② 원문 전송 · 표시 표기(D-17) · 저장/비교 정규화값 ③ ipconfig /all 수기 입력 · 보류 권고 해제 · 표시 지연 · R3-02 · status done · done_commit"
    requirement: IPMAC-04
    verification:
      - kind: other
        ref: "grep -qE '^status: done$' && grep -qE '^done_commit: [0-9a-f]{7,}' && git cat-file -e <hash>^{commit} (docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md)"
        status: pass
      - kind: other
        ref: "grep -c '## 회신'=1 · ipconfig /all · 보류 권고 해제 · 261011-shared-account-ipmac · 1C:FD:08:7D:97:8E · '보류 권고는 유지' 0건 · git show --stat HEAD 1 파일"
        status: pass
    human_judgment: false
  - id: D2
    description: "R3-01 실서버 — 계좌명만 저장 6건 모두 op 5(87) 재조회 ~30ms 뒤 op 3 code 0 · IP/MAC 보존 · 「변경 없음」 · IP 만 입력 시 저장 꺼짐"
    requirement: IPMAC-01
    verification:
      - kind: manual_procedural
        ref: "relay_docker 07:22:36Z~07:23:59Z `users.toml 스냅샷 수신(87)` → `명령 결과(86) op 3 code 0` (30-UAT 1 · 3 · 4)"
        status: pass
    human_judgment: true
    rationale: "프로덕션 KB 서버 · Cloud Logging 관측 — 메인 세션 · 사용자가 확인"
  - id: D3
    description: "프로덕션 /admin/users KB 카드 읽기 줄 · 편집 초깃값 표기 10.41.1.124 · 1C:FD:08:7D:97:8E (D-17)"
    requirement: IPMAC-02
    verification:
      - kind: manual_procedural
        ref: "30-UAT Round 2 R2-1 (사용자 · 2026-10-11)"
        status: pass
    human_judgment: true
    rationale: "프로덕션 화면 확인 — 사용자 판정"
  - id: D4
    description: "공유 계좌(junysim 37728502101) 편집 안내 줄 · KB120 공유 계좌 IP/MAC 저장 + 함께 쓰는 사용자 카드 동시 갱신(D-18 · gh-trade 261011)"
    requirement: IPMAC-02
    verification:
      - kind: manual_procedural
        ref: "30-UAT Round 2 R2-2 · R2-3 (사용자 · 2026-10-11 · KB120)"
        status: pass
    human_judgment: true
    rationale: "외부 서버(gh-trade KB120) 배포 뒤 실서버 동작 — 사용자 확인. KB121 은 gh-trade 배포 여부 미확인"
  - id: D5
    description: "배포 — 첫 배포(relay:2234a1b5 · server 00061-fvv · webapp 2234a1b5) · 갭 클로징 webapp push 2234a1b5..34f145b1"
    verification:
      - kind: manual_procedural
        ref: "smoke-relay 11 PASS/0 FAIL/2 SKIP · smoke-server 15/15 · Vercel Ready(16:06 KST · gh-radar-webapp-16xyl2l3y)"
        status: pass
    human_judgment: true
    rationale: "배포는 메인 세션이 실행(서브에이전트 배포 분류기 차단) — executor 는 기록만"

duration: 3 min (continuation — Task 1 · 2 는 메인 세션 · 사용자)
completed: 2026-10-11
---

# Phase 30 Plan 07: 배포 · 실서버 확인 · 인박스 261010 닫기 Summary

**KB 계좌별 주문자 IP/MAC 을 프로덕션에 내보내고(relay:2234a1b5 · server 00061-fvv · webapp 34f145b1) 실서버 2라운드로 R3-01 재조회 · 표시 표기 · 공유 계좌 동시 반영(KB120)을 확인한 뒤, gh-trade 인박스 261010 을 질문 3개 답 · 보류 권고 해제와 함께 done(5687c282)으로 닫았다**

## Performance

- **Duration:** 3 min (이 continuation 실행 — Task 1 · 2 는 메인 세션 · 사용자가 2026-10-11 오후에 처리)
- **Started:** 2026-10-11T09:57:11Z
- **Completed:** 2026-10-11T09:58:39Z
- **Tasks:** 3 (1 · 2 체크포인트 해결 · 3 executor)
- **Files modified:** 2 (+ 이 SUMMARY)

## Accomplishments

- **첫 배포(2026-10-11 · 메인 세션):** relay `relay:2234a1b5`(smoke 11 PASS · 0 FAIL · 2 SKIP · adminConns KB120 · KYOBO119 ready) · server `gh-radar-server-00061-fvv`(smoke 15/15) · webapp push `5dfb884c..2234a1b5` → Vercel 프로덕션 Ready 16:06 KST.
- **갭 클로징 재배포(메인 세션):** `git diff --stat 2234a1b5..HEAD -- relay/src server/src` 빈 출력 → relay · server 재배포 없음 · webapp push `2234a1b5..34f145b1` → Vercel 프로덕션 Ready(deployment `gh-radar-webapp-16xyl2l3y`).
- **실서버 1라운드(30-UAT):** 계좌명만 저장 6건 모두 relay_docker 에서 `users.toml 스냅샷 수신(87)` 뒤 ~30ms 에 `명령 결과(86) op 3 code 0`(07:22:36Z~07:23:59Z · 카드 IP/MAC 그대로) — R3-01 해제 근거. 같은 값 재저장 「변경 없음」 · IP 만 입력 시 저장 꺼짐 + 짝 오류 문구 pass. 표시 표기(gap 1 → 30-08) · 공유 계좌 code 7(gap 2 → 30-09 + gh-trade 261011) 진단.
- **실서버 2라운드(사용자 · 30-08/30-09 push 뒤):** (1) D-17 — 카드 읽기 줄 · 편집 초깃값 `10.41.1.124` · `1C:FD:08:7D:97:8E` pass. (2) D-18 — `junysim` `37728502101` 편집 모드 공유 계좌 안내 줄 pass. (3) gh-trade 261011(op 3 원자적 전파 · gh-trade master `46a10ce9` · 노트 done_commit `d5a20cfb`)을 사용자가 **KB120 에 배포**했고, 공유 계좌 IP/MAC 저장 + 함께 쓰는 사용자 카드 동시 갱신 pass(KB120). **KB121 은 gh-trade 배포 여부 확인 필요**(261011 처리 결과 기준 KB121 은 현재 미가동). → D-18 은 더 이상 pending-on-gh-trade 가 아니다.
- **인박스 261010 닫힘(Task 3):** 질문 ①②③ 답(번호 1:1 · 순서 그대로) · 「진행」 단락 보류 권고 → 「KB 운영 서버 값 설정 보류 권고 해제」(유지 문장 삭제) · 항목 4 완료 · 표시 지연 · R3-02 · 261011 답 반영(지점번호/거래자ID 비전파 · 다른 사용자 BUSY 없음 · 추가 경로는 같은 IP/MAC 필요 — R3-02 가 이미 되싣음) · 남은 회선 확인 · `status: done` · `done_commit: 5687c282`.
- **30-UAT.md complete:** gap 2건 resolved(resolved_by · retest) · Summary 5/5 · Round 2 표.

## Task Commits

1. **Task 1: 배포 — 첫 배포 기록 + 갭 클로징 webapp push** — 메인 세션 실행(커밋 없음 · 배포 기록은 위)
2. **Task 2: 실서버 재확인(D-17 · D-18)** — 메인 세션 · 사용자(커밋 없음 · 결과는 30-UAT)
3. **Task 3: 인박스 노트 회신 · 보류 권고 해제 · done** — `76be2944` (docs)

추가: `13355b77` (docs — 30-UAT 완료 · gap resolved · Round 2)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` — status done · done_commit 5687c282 · 진행 단락 보류 해제 · 「## 회신」 절
- `.planning/phases/30-kb-ip-mac/30-UAT.md` — status complete · 갭 클로징 배포 · gh-trade 261011 KB120 · tests 2 · 5 retest pass · gaps resolved · Round 2
- `.planning/phases/30-kb-ip-mac/30-07-SUMMARY.md` — 이 문서

## Decisions Made

- 인박스 ① 줄은 공유 계좌 저장이 **KB120 에서 이미 된다**고 적었다 — 플랜 prohibition(IPMAC-04 「이미 된다고 쓰지 말라」)은 gh-trade 미배포 상태 전제였고, 오케스트레이터 override 로 사실(KB120 배포 · 2026-10-11 사용자 확인 · KB121 미확인)을 정확히 적는 쪽으로 대체.
- ① 근거 재확인: `grep -rn --exclude-dir=__tests__ --exclude='*.test.*' --exclude='*.spec.*' -e "다른 지점번호" -e "거래자ID 로 보유" -e "거래자ID/주문자" webapp/src server/src relay/src packages/shared/src` → 0건. 문장이 남은 곳은 `webapp/e2e/fixtures/admin.ts` · `webapp/src/components/admin/__tests__/account-editor.test.tsx` 의 목 응답 상수뿐(대조 아님 · 설계상 원문 보관).
- done_commit = `git log -1 --format=%h -- relay server packages webapp` = `5687c282`.

## Deviations from Plan

### Override (오케스트레이터)

**1. IPMAC-04 prohibition 대체 — 공유 계좌 저장 동작 사실 기록**
- **Found during:** Task 3
- **Issue:** 플랜은 「공유 계좌 IP/MAC 저장이 이미 된다고 쓰지 말라 · pending-on-gh-trade 로 적어라」. 실행 시점 사실은 gh-trade 261011 이 KB120 에 배포 · 사용자 확인 완료.
- **Fix:** 인박스 노트 · 30-UAT · 이 SUMMARY 에 「KB120 배포 · 확인(2026-10-11) · KB121 은 gh-trade 배포 여부 확인 필요」 로 기록. pending-on-gh-trade 표기는 쓰지 않음.
- **Committed in:** `76be2944` · `13355b77`

### Auto-fixed Issues

**1. [Rule 1 - Bug] 30-UAT Summary 숫자와 테스트 result 불일치**
- **Found during:** 30-UAT 갱신
- **Issue:** Summary 를 passed 5 로 바꾸면 tests 2 · 5 의 `result: issue` 와 어긋난다.
- **Fix:** 두 테스트를 `result: pass` + `first_result: issue`(이력 보존) · `resolved_by` · `retest` 로.
- **Committed in:** `13355b77`

---

**Total deviations:** 1 override + 1 auto-fixed (Rule 1). **Impact:** 사실 정확성만 — 범위 추가 없음.

## Issues Encountered

None.

## User Setup Required

None — 배포 · 실서버 확인은 메인 세션 · 사용자가 끝냈다. push · 배포는 이 executor 가 하지 않았다(이 continuation 의 커밋 3개는 메인 세션이 push).

## Next Phase Readiness

- Phase 30 플랜 9/9 완료 — 다음은 `/gsd-verify-work 30`(또는 phase 검증) · 그 뒤 Phase 31(상따 금액 단위).
- **KB121:** gh-trade 261011 배포 여부 확인 필요 — 261011 처리 결과 기준 KB121 은 현재 미가동. 켤 때 공유 계좌 IP/MAC 저장을 KB121 에서도 한 번 확인.
- **남은 확인(비차단 · 열린 후속):** KB 주문 전문(TCHODR1000 orderInfo · macAddr)에 설정한 IP/MAC 이 실제로 실리는지 회선 관측은 아직 없다 — gh-trade 로그는 설계상 값을 찍지 않고, 지금은 gh-trade 단위 테스트 `server/tests/test_kb_endpoint_race.cpp` 만이 덮는다. 사용자에게 넘긴 선택지:
  1. KB증권 DMA 담당에 주문번호로 주문자식별정보/MAC 조회 요청
  2. KB120 주문 회선 패킷 캡처로 평문 필드 확인(gh-trade 몫)
  3. gh-trade 진단 로그 — 값 없이 엔드포인트 출처(계좌 설정 vs 서버 캐시)만 남기기
- STATE Blockers 의 「[Phase 29 → Phase 30] KB 운영 서버 계좌별 IP/MAC 설정 보류 (R3-01)」 는 해제됐다(인박스 노트 status done).

---
*Phase: 30-kb-ip-mac*
*Completed: 2026-10-11*

## Self-Check: PASSED

- FOUND: 76be2944 · 13355b77 · 5687c282(done_commit)
- FOUND: docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md · 30-UAT.md · 30-07-SUMMARY.md
- Task 3 verify 2종 · acceptance(1 파일 · 보류 유지 줄 삭제 줄) PASS
