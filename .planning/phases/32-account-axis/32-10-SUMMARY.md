---
phase: 32-account-axis
plan: 10
subsystem: webapp
tags: [webapp, relay, e2e, playwright, backstop, deploy, vercel, live-uat]

requires:
  - phase: 32-account-axis
    provides: "32-01~32-09 — 웨이브 ①~③ 코드(계좌 축 카드 · 스트립 · 토스트 · 사이드바 · /me 칩 · 「이 계좌 끄기」 · 84 서버 축 · 설정 탭 서버키 칩)"
provides:
  - "E2E P32-backstop 묶음(S1 · S3 · S4 · S9 · S13 · S8′ 제목 줄) — webapp/e2e/specs/account-axis-backstop.spec.ts"
  - "relay 프로덕션 = 55459fe5(계좌 끄기 새 타입 · 84 서버 축) · 롤백 태그 eb145551"
  - "webapp 프로덕션 = push 55459fe5 · Vercel dpl_6HtxQXMJBs9GFYLF2GWxDfxaK9w5(trade.jx1.io)"
  - "라이브 UAT ①~⑥ 통과 기록(KB120 · KYOBO119 서버별 매매설정 = ROADMAP SC5)"
affects: [32-11, 32-12, 32-13, 32-14]

actuals:
  tokens: 9400
  tasks: 3
  commits: 3
plan_head_before: f29572a5dcd1f0dfceb36c471d3e6b8c8e7adc11
plan_head_after: 3a6e75fa

tech-stack:
  added: []
  patterns:
    - "폭 백스톱 최악값 주입 — 하네스가 못 띄우는 서버키(KYOBO127)는 page.evaluate 로 칩 글자만 바꿔 레이아웃을 다시 잰다"
    - "「주문 끊김 · 다시 연결」 재현 — page.routeWebSocket 으로 브라우저 쪽 소켓을 4400 으로 닫는다"

key-files:
  created:
    - webapp/e2e/specs/account-axis-backstop.spec.ts
  modified:
    - .planning/phases/32-account-axis/deferred-items.md

key-decisions:
  - "relay 를 20:00 KST 전(NXT 애프터마켓 중 · 17:16 KST)에 배포 — 사용자 명시 지시(「지금 배포하자」). 플랜의 20:00 규칙보다 사용자 지시가 우선, 롤백 태그 eb145551 확보 뒤 진행"
  - "relay 는 detached worktree(55459fe5 = push HEAD)에서 빌드 — 동시 세션 커밋 · 미커밋 변경이 메인 트리에 섞이지 않게"
  - "KYOBO127 최악값은 page.evaluate 글자 치환으로 측정(하네스 세션 서버키는 KB · KYOBO 만 가능) — 플랜 Flagged assumption 의 대체 경로 그대로"
  - "드로어는 실제 폭이 280 이 되는 뷰포트 373 에서 측정 — 기본 390 에서는 shadcn data-[side=left]:w-3/4 가 이겨 293 이 된다(기존 동작 · deferred)"

patterns-established:
  - "배포 플랜 SUMMARY 에 relay 태그 · 롤백 태그 · push 해시 · Vercel 배포 ID · push 에 같이 실린 남의 커밋을 함께 적는다"

requirements-completed: [AXIS-01, AXIS-02, AXIS-03, AXIS-04, AXIS-05]

coverage:
  - id: D1
    description: "S1 작업대 상단 줄 — 뷰포트 344 · 685 · 830 · 992(본문 328 · 669 · 798 · 960)에서 최악값 셀렉트 라벨 · KYOBO127 · 「주문 끊김 · 다시 연결」 · 세그먼트 잘림 0 · 가로 스크롤 0 · 344 에서만 두 줄 줄바꿈"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/account-axis-backstop.spec.ts#P32-backstop S1 작업대 상단 줄"
        status: pass
    human_judgment: false
  - id: D2
    description: "S3 사이드바 240 · 드로어 280 — 최악값 상품명 소제목 말줄임 + title · KYOBO127 칩 · LED 3점 잘림 0"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/account-axis-backstop.spec.ts#P32-backstop S3 사이드바 240 · 드로어 280"
        status: pass
    human_judgment: false
  - id: D3
    description: "S4 토스트 계좌 줄 — 폰 366 · ≥700 폭 340 · 계좌 줄 두 줄 이내 · 「이 계좌 보기 ›」 잘림 0"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/account-axis-backstop.spec.ts#P32-backstop S4 토스트 계좌 줄"
        status: pass
    human_judgment: false
  - id: D4
    description: "S9 「이 기기」 카드 — 켜짐 ∧ 차단 · /me 본문 334 에서 「클릭해 활성화」 + 스위치 한 줄 · 잘림 0"
    requirement: AXIS-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/account-axis-backstop.spec.ts#P32-backstop S9 「이 기기」 카드"
        status: pass
    human_judgment: false
  - id: D5
    description: "S13 /me 계좌 칩 줄 — 본문 334 · 계좌 4개 가로 스크롤 한 줄 · 칩 글자 잘림 0 · 페이지 가로 스크롤 0 · 새로고침 뒤 마지막 칩이 보이는 영역 안"
    requirement: AXIS-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/account-axis-backstop.spec.ts#P32-backstop S13 /me 계좌 칩 줄"
        status: pass
    human_judgment: false
  - id: D6
    description: "S8′ /me 설정 탭 제목 줄 — 본문 334 에서 「상따 기본설정」 + KYOBO127 칩 + 상태 칩 한 줄"
    requirement: AXIS-05
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/account-axis-backstop.spec.ts#P32-backstop S8′ /me 설정 탭 제목 줄"
        status: pass
    human_judgment: false
  - id: D7
    description: "웨이브 ①~③ 전 워크스페이스 회귀 — shared 646/646 · relay 1602/1602 · webapp 4201 통과(1 skip) · 타입체크 깨끗 · E2E 7 spec 169 통과(1 실패 = 기존 P31-3)"
    verification:
      - kind: unit
        ref: "shared · relay · webapp vitest 전 워크스페이스"
        status: pass
      - kind: e2e
        ref: "playwright trading-workbench · me · a11y · sidebar-tree · order-log · unfilled-progress · stock-detail-tabs (--workers=1)"
        status: unknown
    human_judgment: false
  - id: D8
    description: "배포 — relay 55459fe5 · smoke PASS 11 · FAIL 0 · SKIP 2 · push 55459fe5 · Vercel dpl_6HtxQXMJBs9GFYLF2GWxDfxaK9w5 Ready"
    verification:
      - kind: other
        ref: "bash scripts/smoke-relay.sh · git log origin/master..HEAD -- relay webapp packages = 빈 출력(PUSHED)"
        status: pass
    human_judgment: false
  - id: D9
    description: "라이브 UAT ①~⑥ — KB120 · KYOBO119 서버별 「상따 기본설정」 · 저장 serverKey · 작업대 스코프 · 사이드바 · /me 계좌 스코프 · 「이 계좌 끄기」"
    requirement: AXIS-05
    verification:
      - kind: manual_procedural
        ref: "trade.jx1.io 사용자 확인 2026-10-16 — 「다 잘돼」"
        status: pass
    human_judgment: true
    rationale: "실서버 2대(KB120 · KYOBO119)와 실계좌가 필요하다 — 웹 E2E 하네스는 단일 세션이다(RESEARCH A6)"

duration: 약 49분
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 10: 웨이브 ①~③ 폭 백스톱 · 회귀 · 배포 · 라이브 UAT Summary

**계좌 축 웨이브 ①~③ 이 프로덕션에 나갔다. 순서는 relay 55459fe5 → smoke 11 PASS → push 55459fe5 → Vercel dpl_6HtxQXMJBs9GFYLF2GWxDfxaK9w5 이다. UI-SPEC 백스톱 6행(S1 · S3 · S4 · S9 · S13 · S8′)은 최악값(KYOBO127 · 15자 상품명) 실측 E2E 로 잠갔다. 실서버 KB120 · KYOBO119 의 서버별 매매설정(ROADMAP SC5)을 포함한 라이브 UAT 6항목도 사용자 확인으로 통과했다.**

## Performance

- **Duration:** 약 49분(Task 1 실행 · 배포 대기 · UAT 포함)
- **Started:** 2026-10-16T07:40:00Z (ledger 기준 `f29572a5`)
- **Completed:** 2026-10-16T08:28:36Z
- **Tasks:** 3 (auto 1 · 배포 체크포인트 1 · 확인 · 기록 1)
- **Files modified:** 2 (spec 신규 1 · deferred-items 1)

## Accomplishments

- **폭 백스톱 spec(Task 1):** `account-axis-backstop.spec.ts` 는 7/7 녹색이다(serial · 로컬 relay). 행별 실측은 아래 표에 있다.
- **전 워크스페이스 회귀(Task 1):** 단위 · 타입은 전부 녹색이다. E2E 7 spec 의 유일한 실패는 Phase 32 이전부터 있던 P31-3 이다.
- **배포(Task 2 · 메인 세션):** relay 먼저 → smoke → push 순서를 지켰다. 시각만 플랜과 다르다. 사용자 지시로 20:00 KST 전(17:16 KST)에 배포했다(아래 「배포 기록」).
- **라이브 UAT(Task 3):** human-check ①~⑥ 을 프로덕션에서 사용자가 확인했고 전부 통과했다.

### 폭 백스톱 실측

| 행 | 조건 | 실측 | 판정 |
|----|------|------|------|
| S1 작업대 상단 줄 | 뷰포트 344 · 685 · 830 · 992 → 본문 328 · 669 · 798 · 960 | 344 에서만 두 줄(flex-wrap · 세그먼트 오른쪽 끝), 나머지 한 줄. ready 상태와 「주문 끊김 · 다시 연결」 상태 모두 잘림 0 · 가로 스크롤 0 | 통과 |
| S3 사이드바 · 드로어 | 사이드바 240 · 드로어 280(뷰포트 373) | 상품명 소제목 말줄임 + title · KYOBO127 칩 · LED 3점 잘림 0 | 통과 |
| S4 토스트 계좌 줄 | 폰 전폭 366 · ≥700 폭 340 | 계좌 줄 두 줄 · 힌트 58px · 「이 계좌 보기 ›」 잘림 0 | 통과 |
| S9 「이 기기」 카드 | /me 본문 334(뷰포트 350) · 켜짐 ∧ 차단 | 「클릭해 활성화」 + 스위치 한 줄 | 통과 |
| S13 /me 계좌 칩 줄 | 본문 334 · 계좌 4개 | 칩 줄 폭 334 · 스크롤 콘텐츠 1190 · 칩 글자 잘림 0 · 페이지 가로 스크롤 0 · 마지막 칩 고른 뒤 새로고침 → scrollLeft 693(보이는 영역 안) | 통과 |
| S8′ 설정 탭 제목 줄 | 본문 334 · 「상따 기본설정」 + KYOBO127 + 상태 칩 | 한 줄 | 통과 |

**측정 방법:**
- **KYOBO127 최악값:** 웹 E2E 하네스의 세션 서버키는 KB · KYOBO 만 띄울 수 있다. 그래서 측정 직전에 `page.evaluate` 로 서버키 칩 글자만 KYOBO127 로 바꾸고 레이아웃을 다시 쟀다(플랜 Flagged assumption 의 대체 경로).
- **「주문 끊김 · 다시 연결」:** `page.routeWebSocket` 으로 브라우저 쪽 소켓을 코드 4400 으로 닫아 재현했다.
- **드로어 280:** 기본 뷰포트 390 에서는 드로어가 293 이다. 그래서 280 이 되는 뷰포트 373 에서 쟀다(`DRAWER_280` 주석). 더 넓은 드로어가 더 여유로우므로 잘림 판정에는 영향이 없다.

### 회귀 결과

- **shared:** 646/646
- **relay:** 1602/1602
  - 첫 실행에서 `journal-boot.test.ts` 가 5000ms 타임아웃으로 1건 실패했다(load average 약 20 · 동시 세션 부하).
  - 단독 실행과 재실행에서는 통과했다. 부하 flake 이고 코드 결함이 아니다.
- **webapp vitest:** 4201 통과 · 1 skip
- **타입체크:** 전 워크스페이스 깨끗
- **E2E 7 spec**(trading-workbench · me · a11y · sidebar-tree · order-log · unfilled-progress · stock-detail-tabs, `--workers=1`)
  - 169 통과 · 1 실패 · 3 미실행
  - 실패 1건은 기존 P31-3 이다(「777주」 ≠ 「비교가격 필요」). 아래 「Deferred」 참고.
  - 미실행 3건은 serial 묶음이라 실행되지 않았다. 줄 지정 재실행에서 4/4 통과했다(setup 포함).
- 로그: `/private/tmp/claude-501/-Users-alex-repos-gh-radar/d3194da7-252f-41be-98aa-91cb85af3990/scratchpad/{bs4.log,unit.log,unit2.log,e2e7.log,e2e3.log}`

## 배포 기록 (Task 2 · 메인 세션)

| 항목 | 값 |
|------|-----|
| relay 이미지 태그 | `55459fe5` (= push HEAD) — detached worktree 에서 빌드 · 배포 |
| 롤백 태그 | `eb145551` (직전 라이브 APP_VERSION) |
| relay 배포 시각 | 2026-10-16 약 17:16 KST — NXT 애프터마켓 중, 사용자 명시 지시(「지금 배포하자」) |
| healthz | version 55459fe5 · vpn/dma true · KB120 · KYOBO119 adminConns ready |
| smoke-relay.sh | PASS 11 · FAIL 0 · SKIP 2 (INV-9 는 SMOKE_AUTH_TOKEN, INV-10 은 service role key 가 필요해 평소처럼 skip) |
| Cloud Logging `relay_docker` | 배포 뒤 92줄 · 「인바운드 스키마 위반」/error 0건 |
| push | `git push origin master` `974dc480..55459fe5` |
| Vercel | `dpl_6HtxQXMJBs9GFYLF2GWxDfxaK9w5` Ready · trade.jx1.io alias(생성 17:18:55 KST) |
| 후속 push | docs 전용 `3a6e75fa`(STATE 배포 기록) — Vercel ignoreCommand 대상 |

**push 에 같이 실린 다른 세션 커밋:**
- quick-261016-miy: `37c66e94` · `6bc8b6e9` · `e44cf64f` · `a870dbf7`. worker · migration 코드라 push 로는 배포되지 않는다. 워커 배포 · DB 마이그레이션은 그 quick 의 몫이다.
- `425eaeec` docs(33): 문서만 있다.

**Task 3 자동 확인:** `git fetch -q origin && test -z "$(git log origin/master..HEAD --oneline -- relay webapp packages)" && echo PUSHED` → `PUSHED`.

## 라이브 UAT (Task 3 human-check · trade.jx1.io)

사용자 답은 「다 잘돼」 이다. 6항목 모두 프로덕션에서 통과했다.

| # | 항목 | 결과 |
|---|------|------|
| ① | /me 계좌 칩 KB 계좌 → 설정 탭 KB120 · 교보 계좌 → KYOBO119, 두 서버 「상따 기본설정」 값이 각 서버 저장값 | 통과 |
| ② | 교보 계좌에서 한 행 저장 → 플래시 · KB 계좌로 돌아가면 KB120 값 그대로 · 42 serverKey KYOBO119 | 통과 |
| ③ | 작업대 상단 줄 A · 계좌 전환 시 그 계좌 카드만 · 토스트 계좌 줄 | 통과 |
| ④ | 사이드바 계좌 묶음 | 통과 |
| ⑤ | /me 현황 · 잔고 · 주문이 고른 계좌만 | 통과 |
| ⑥ | 「이 계좌 끄기」 | 통과(사용자 보고 — 별도 세부 기록 없음) |

ROADMAP SC5(AXIS-05 라이브 · KB120 · KYOBO119 서버별 매매설정)는 ①② 로 확인됐다.

## Task Commits

1. **Task 1: 폭 백스톱 spec · 전 워크스페이스 회귀** — `55a89ebc` (test). deferred-items 갱신을 포함한다.
2. **Task 2: 배포(메인 세션)** — 코드 커밋 없음. 오케스트레이터 docs 커밋은 `55459fe5`(상태 갱신 · relay 와 push 의 HEAD)와 `3a6e75fa`(배포 기록)이다.
3. **Task 3: 배포 확인 · 라이브 UAT 기록** — 코드 변경 없음. 이 SUMMARY 커밋이다.

**커밋 수 측정:** ledger 범위 `f29572a5..3a6e75fa` 의 `rev-list --count` 는 3 이다. 이 플랜 코드 커밋은 `55a89ebc` 1건이고, 나머지 2건은 오케스트레이터의 docs(32) 상태 · 배포 기록 커밋이다. 다른 세션 커밋은 이 범위에 없다(이미 `f29572a5` 이전에 들어왔다). 토큰 추정(약 9,400)은 spec 36,622자와 deferred-items 추가분을 chars/4 로 잰 값이다.

## Files Created/Modified

- `webapp/e2e/specs/account-axis-backstop.spec.ts` (신규 · 653줄): `P32-backstop` S1 · S3 · S4 · S9 · S13 · S8′ 와 측정 기록(`record`)이 있다. `P32-backstop` 15회 · `KYOBO127` 8줄(수락 grep 충족).
- `.planning/phases/32-account-axis/deferred-items.md`: 「32-10 실행 중」 절을 추가했다(P31-3 재확인 · 드로어 실제 폭).

## Decisions Made

frontmatter `key-decisions` 참고.

## Deviations from Plan

**1. [사용자 지시] relay 를 20:00 KST 전에 배포**
- 플랜 must_have 와 prohibition 은 「08:00~20:00 KST 에 relay 를 재시작하지 않는다」 이다.
- 사용자가 「지금 배포하자」 로 명시 지시해 17:16 KST(NXT 애프터마켓 중)에 메인 세션이 배포했다.
- 롤백 태그 `eb145551` 을 확보했다. healthz · smoke · Cloud Logging 이 모두 정상이었다.
- 순서(relay 먼저 · push 나중)는 지켰다.

**2. [플랜 대체 경로] KYOBO127 은 글자 치환으로 측정**
- 하네스가 KYOBO127 세션을 띄울 수 없어 플랜 Flagged assumption 의 두 번째 경로(`page.evaluate`)를 썼다.

그 밖의 변경은 없다. 코드 자동 수정도 없다.

## Issues Encountered

- **relay `journal-boot.test.ts` 부하 flake:** 1회 5000ms 타임아웃이 났고 재실행에서 통과했다(load avg 약 20). 반복되면 그 테스트 타임아웃 여유를 검토한다.

## Deferred (범위 밖 · deferred-items.md)

- **P31-3 「777주」 ≠ 「비교가격 필요」**(trading-workbench.spec): Phase 32 이전부터 있던 결함이다.
  - 아래 줄 규칙을 바꾼 261012 quick 커밋 `708c4772` · `03584822` · `e14695c2` · `6a628d3b` 는 모두 phase 기준 `4df49caf` 의 조상이다.
  - 유력 후보는 u04(`6a628d3b`)다. 고치지 않았다. 다음 상따 E2E 정리 quick 에서 다룬다.
- **드로어 실제 폭 = 뷰포트 75%:** shadcn `data-[side=left]:w-3/4` 가 `w-[min(280px,85vw)]` 를 이긴다. 기존 동작이다. 280 고정이 의도라면 셸 quick 에서 같은 변형 선택자로 맞춘다.

## Known Stubs

없음.

## User Setup Required

None.

## Next Phase Readiness

- 웨이브 ①~③ 이 프로덕션에 있다. 웨이브 ④(VI 계좌별)는 32-11~32-14 가 이어받는다.
- relay 라이브 버전은 `55459fe5`, 롤백 태그는 `eb145551` 이다. 32-11 이후 relay 를 바꾸면 이 태그가 직전 버전이 된다.

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*

## Self-Check: PASSED

- `webapp/e2e/specs/account-axis-backstop.spec.ts` 존재(653줄) · `P32-backstop` 15 · `KYOBO127` 8줄
- 커밋 `55a89ebc` · `55459fe5` · `3a6e75fa` 가 HEAD 조상에 있음. 다른 세션 커밋 `37c66e94` · `a870dbf7` · `425eaeec` 는 ledger 기준 `f29572a5` 의 조상(범위 밖)
- `git fetch -q origin && test -z "$(git log origin/master..HEAD --oneline -- relay webapp packages)"` → PUSHED
- STATE · ROADMAP · REQUIREMENTS · state.json 미변경(오케스트레이터 몫)
