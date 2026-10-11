---
phase: 22-gh-trade-ios-testflight-android-play
plan: 02
subsystem: legal-docs
tags: [privacy-policy, 개인정보처리방침, pipa, app-store, play-store]

requires:
  - phase: 22-gh-trade-ios-testflight-android-play
    provides: "22-RESEARCH 의 코드 근거 수집 항목 표(11행) · 22-CONTEXT D-04 · D-11 · D-12"
provides:
  - "승인된 한글 개인정보처리방침 문안(13절 · 항목표 12행) — 22-PRIVACY-DRAFT.md (status: approved)"
  - "검토자용 코드 근거 부록 A · 부록 B 답 기록(사용자 답 / 오케스트레이터 결정 구분)"
  - "시행일 22-07 인계 자리표시(effective_date: TBD-22-07-push · 13절 「2026년 ○월 ○일」)"
affects: [22-03, 22-07, 정식 출시 phase(Play 데이터 보안 · App Store 앱 개인정보 양식)]

actuals:
  tokens: 3500     # chars/4 — 이 플랜이 바꾼 유일한 파일 22-PRIVACY-DRAFT.md 전체
  tasks: 3
  commits: 3       # MEASURED: git rev-list --count 1e7c3af4..HEAD — 이 중 1594d546 은 같은 wave 의 22-01 커밋(22-02 자체는 87ce275d · b26ea0f6 2개)
plan_head_before: 1e7c3af45958c43fafd51fc6e26b9534c497101e

tech-stack:
  added: []
  patterns:
    - "법적 문구는 계획 문서(.planning/)에서 승인까지 마친 뒤 웹 코드로 옮긴다 — .planning/ push 는 웹 빌드를 유발하지 않는다"
    - "승인 답은 부록 B 질문 옆에 「사용자 답」 / 「오케스트레이터 결정」 으로 출처를 구분해 남긴다"

key-files:
  created: []
  modified:
    - .planning/phases/22-gh-trade-ios-testflight-android-play/22-PRIVACY-DRAFT.md

key-decisions:
  - "22-02: 개인정보처리방침 운영자·보호책임자 표기 「GH Trade 운영자」, 공개 연락처 alex@jx1.io(사용자 승인 값)"
  - "22-02: 시행일은 22-07 이 웹을 push 하는 날로 채운다 — 지금은 effective_date: TBD-22-07-push · 13절 「2026년 ○월 ○일」 인계 자리표시"
  - "22-02: Supabase 는 서울 리전(ap-northeast-2)이라 국외 이전 표에서 제외, 5절 위탁 표에 서울 저장 명시(오케스트레이터 결정)"
  - "22-02: Vercel 은 로그 저장 국가 미공개라 「미국 등 Vercel 이 운영하는 국가」 로 보수적 고지, Google Cloud 는 Cloud Logging global 버킷이라 접속 기록(서버 로그)만 이전 항목으로 남김(오케스트레이터 결정)"
  - "22-02: 4절 제3자 제공은 「본인 지시에 따른 증권회사 전달」 문구 유지, 별도 제공 항목 없음(오케스트레이터 결정)"

patterns-established:
  - "개인정보처리방침 국외 이전 표에 연락처 열을 둔다(각 사 개인정보 문의처)"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "승인된 한글 개인정보처리방침 문안 — 13절 제목 고정 · 부록 A·B · status approved · 미정 표식 0"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "22-02 Task 3 verify(effective_date 정규식만 TBD-22-07-push 허용으로 조정) → APPROVED OK"
        status: pass
      - kind: other
        ref: "22-02 Task 1 verify 1 — 13절 제목 + 부록 A·B 문자열 grep(재실행, MISSING 0)"
        status: pass
    human_judgment: true
    rationale: "방침은 법적 문구이고 법률 검토를 거치지 않았다(RESEARCH A7 · LOW 신뢰). 문안 적합성은 운영자 판단이며, 사용자가 Task 2 문안 검토 게이트에서 승인했다."
  - id: D2
    description: "코드 근거 재확인 — 새 저장 키 0 · 분석/광고 SDK 0 · 계정 삭제 기능 0 · 접속 기록 행 추가 · 계좌 기준 주문 테이블 분리"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "22-02 Task 1 verify 2 — 근거 파일 7개 test -f → EVIDENCE OK (87ce275d 에서 실행)"
        status: pass
    human_judgment: false

duration: 약 55분(Task 2 문안 검토 대기 포함)
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 02: 개인정보처리방침 한글 초안 · 문안 검토 게이트 · 승인 반영 Summary

**코드 근거 12행 항목표를 가진 13절 한글 개인정보처리방침을 사용자 승인(2026-09-27)으로 확정 — Supabase 서울 리전 제외 · Vercel/Google Cloud 보수적 국외 이전 고지 · Anthropic 30일 보관 문구 · 시행일은 22-07 push 일로 인계**

## Performance

- **Duration:** 약 55분(2026-09-27 01:53 KST 시작 · Task 2 사용자 검토 대기 포함)
- **Started:** 2026-09-26T16:53Z (플랜 커밋 원장 생성 시각)
- **Completed:** 2026-09-26T17:49Z (2026-09-27 02:49 KST)
- **Tasks:** 3/3 (Task 1 초안 · Task 2 문안 검토 게이트 승인 · Task 3 승인 반영)
- **Files modified:** 1 (`22-PRIVACY-DRAFT.md`) — 웹 코드(`webapp/`) 변경 0

## Accomplishments

- 코드 근거를 다시 대조한 한글 개인정보처리방침 초안(13절 · 2절 항목표 12행 · 부록 A 코드 근거 · 부록 B 질문표)을 작성했다.
- 사용자가 문안 검토 게이트(D-11)에서 승인하고 B1~B10 에 답했다. 수정 라운드는 0회다.
- 본문의 미정 표식을 전부 치환했고(`grep -c '\[확인 필요\]'` = 0), frontmatter 를 `status: approved` · `approved: 2026-09-27` · `contact: alex@jx1.io` · `effective_date: TBD-22-07-push` 로 바꿨다.
- 부록 B 각 질문 옆에 답을 적고 출처를 「사용자 답」 / 「오케스트레이터 결정」 으로 구분했다. 22-03 · 22-07 시행일 인계 메모도 더했다.

## Task Commits

1. **Task 1: 코드 근거 재확인 + 한글 개인정보처리방침 초안 작성** — `87ce275d` (docs)
2. **Task 2: 문안 검토 게이트(D-11)** — 커밋 없음(사용자 승인 · blocking-human)
3. **Task 3: 승인 반영 — 미정 표식 치환 · status approved** — `b26ea0f6` (docs)

**Plan metadata:** 이 SUMMARY 커밋(docs: complete plan)

## Files Created/Modified

- `.planning/phases/22-gh-trade-ios-testflight-android-play/22-PRIVACY-DRAFT.md` — 승인된 방침 문안 + 부록 A(코드 근거) · 부록 B(질문과 답). 22-03 이 1~13절을 `/privacy` 페이지로 옮긴다(부록 제외).

## Task 1 ① 코드 근거 재확인 결과(RESEARCH 대비)

- 근거 파일 7개 모두 존재(`EVIDENCE OK`).
- **새 저장 키 없음** — `localStorage.setItem` · `sessionStorage.setItem` 호출 6곳이 RESEARCH 8행 목록과 같다. `sessionStorage` · `indexedDB` · `document.cookie` 직접 사용 0건.
- **분석·광고 SDK 0건** — `@vercel/analytics` · `@sentry` · `gtag(` 없음.
- **계정 삭제 기능 0건** — `deleteUser` · `회원 탈퇴` 없음(일치는 테마 삭제 `deleteUserTheme` 뿐). 7절에서 이메일 요청으로 처리한다고 적었다.
- **차이 1:** 주문 기록 중 `dma_journal_events` · `dma_account_orders` · `dma_account_access` 는 `user_id` 없는 계좌 기준 테이블이라 계정 삭제로 지워지지 않는다 → 3절 4항을 따로 적었다.
- **차이 2:** 접속 기록(서버 요청 로그 · IP 기준 요청 제한 · 호스팅·인증 로그)이 RESEARCH 11행에 없었다 → 2절 12번째 행으로 추가했다.
- `theme_admins`(운영자 본인 이메일만 담는 관리자 허용 목록)는 이용자 수집 항목에서 뺐다.

## 부록 B 답(승인 2026-09-27 · 수정 라운드 0회)

| 번호 | 항목 | 답 | 출처 |
|------|------|----|------|
| B1 | 운영자 표기 | 「GH Trade 운영자」 | 사용자 답 |
| B2 | 개인정보 보호책임자 | B1 과 같음 → 「GH Trade 운영자」 | 사용자 답 |
| B3 | 연락처(공개 게시 승인 값) | alex@jx1.io (frontmatter `contact` 동일) | 사용자 답 |
| B4 | 시행일 | 22-07 에서 웹을 push 하는 날 — 지금은 `effective_date: TBD-22-07-push` · 13절 「2026년 ○월 ○일」 인계 자리표시 | 사용자 답(제안 동의) |
| B5 | AI 대화 보관 | A안 — 자동 삭제 주기 없이 계정 삭제 시까지 보관 | 사용자 답 |
| B6 | 계좌 기준 주문·체결 기록 | 매매 내역 확인에 필요한 기간 보관 · 허용 사용자 요청 시 파기 | 사용자 답(제안 동의) |
| B7 | 접속 기록 | 각 호스팅 사업자 기본 로그 보관 기간 후 자동 삭제 · 예시 Google Cloud 30일(감사 400일) · Vercel 런타임 1시간 · Supabase 는 숫자 없음 | 사용자 답(제안 동의) |
| B8 | 4절 제3자 제공 | 초안 문구 유지(본인 지시에 따른 증권회사 전달) · 별도 항목 없음 | 오케스트레이터 결정 |
| B9 ① | Supabase 리전 | ap-northeast-2(서울) 확인 → 6절에서 제외 · 5절에 「데이터는 서울 리전에 저장」 | 확인값: 사용자 · 반영: 오케스트레이터 결정 |
| B9 ② | Vercel | 「미국 등 Vercel 이 운영하는 국가(웹 처리 지역은 대한민국 서울)」 · 런타임 로그 1시간 | 확인값: 사용자 · 반영: 오케스트레이터 결정(보수적 고지) |
| B9 ③ | Google Cloud | 6절 유지 · 이전 항목 「접속 기록(서버 로그)」 로 좁힘(주문 정보 제외) · 국가 「Google 의 글로벌 로그 저장소(국가 특정 불가, 서버는 대한민국 서울)」 · 30일(감사 400일) | 확인값: 사용자 · 반영: 오케스트레이터 결정 |
| B9 ④ | 6절 연락처 열 | 추가 — Anthropic · Vercel 개인정보 문의 이메일, Google Cloud 는 Google 개인정보 보호 도움말 센터 문의 페이지. 선택 사항이던 Supabase 연락처의 5절 추가는 하지 않음 | 오케스트레이터 결정 |
| B10 | Anthropic 문구 | 입력·출력을 기본적으로 모델 학습에 쓰지 않음 · 받은 뒤 30일 이내 자동 삭제 · 정책 집행·법률 준수 시 더 오래 보관 가능. 출처 Anthropic Privacy Center 두 문서(확인 2026-09-27) | 사용자 확인값 |

6절 마지막 문단(「국외 이전을 원하지 않으시면 …」)은 유지했다.

## Task 3 치환 목록(`git diff 87ce275d b26ea0f6`)

- frontmatter 4키: `status` · `approved`(신규) · `effective_date` · `contact`
- 머리말 B1 · 2절 표 접속 기록 보유 기간 B7 · 3절 3항 B5 · 4항 B6 · 5항 B7 · 4절 B8 표식 제거 · 11절 B2 · B3 · 13절 B4
- 5절 Supabase 행에 서울 리전 문구(B9 ①)
- 6절 표: 연락처 열 추가(B9 ④) · Supabase 행 삭제(B9 ①) · Vercel 행(B9 ②) · Google Cloud 행(B9 ③) · Anthropic 행 보유 기간(B10)
- 부록 B: 머리 문장을 「질문표와 답」 으로 바꾸고(미정 표식 문자열이 검증 grep 에 걸리지 않게) 각 질문 옆에 답 기록 · 「그 밖의 메모」 에 22-03 · 22-07 시행일 인계 한 줄
- 그 밖의 본문 문구 변경 없음

## Decisions Made

- 위 부록 B 답 표 그대로. 「오케스트레이터 결정」 항목(B8 · B9 ①~④)은 사용자가 맡기거나 하위 선택을 열어 둔 것을 오케스트레이터가 정한 것이다.

## Deviations from Plan

### 1. [계획 편차 — 검증 조건] Task 3 verify 의 `effective_date` 날짜 정규식

- **발견:** Task 3
- **문제:** 플랜 verify 는 `^effective_date: [0-9]{4}-[0-9]{2}-[0-9]{2}` 를 요구하지만, 사용자 답 B4 는 시행일을 22-07 push 날로 정했고 지금은 날짜가 없다. 날짜를 지어 넣을 수 없다.
- **처리:** `effective_date: TBD-22-07-push` 인계 자리표시를 두고, verify 의 그 한 조건만 `([0-9]{4}-[0-9]{2}-[0-9]{2}|TBD-22-07-push)` 로 넓혀 돌렸다 → `APPROVED OK`. 원래 verify 는 이 조건 하나만 실패하고 나머지(status · approved 날짜 · 미정 표식 0)는 통과한다. 자리표시는 「[확인 필요]」 형식이 아니라 미정 표식 grep 에 걸리지 않는다.
- **후속:** 22-07 이 push 를 결정하면 frontmatter · 13절 · `webapp/src/app/privacy/page.tsx` 시행일을 그 날짜로 채운다. 채운 뒤에는 원래 verify 가 그대로 통과한다.

### 2. [계획 편차 — 커밋 브랜치] master 에 직접 커밋

- `gsd-tools git.base-branch --is-protected master` 는 `true` 지만, 오케스트레이터가 이 플랜을 메인 체크아웃 master 에서 순차 실행하도록 지시했고(`branching_strategy: none`), Task 1 커밋도 master 에 있다. 지시대로 master 에 커밋했고 push 는 하지 않았다.

**Total deviations:** 2(검증 조건 1 · 커밋 브랜치 1). **Impact:** 문안 내용은 사용자 답 범위를 벗어나지 않았다.

## Issues Encountered

- **22-03 인계 주의:** 22-03 behavior 「13절에 초안 `effective_date` 날짜 문자열이 있다」 는 지금 문자 그대로는 맞출 수 없다(날짜가 22-07 에 정해진다). 22-03 은 13절 자리표시(「2026년 ○월 ○일」)를 그대로 옮기고, 이 단언을 자리표시 문자열 기준으로 두거나 22-07 에서 날짜를 채울 때 같이 고쳐야 한다.
- **22-07 인계 주의:** 22-07 은 「코드 변경 없음」 으로 계획됐지만, push 전에 시행일 날짜를 문안과 `page.tsx` 에 채워야 한다(`page.tsx` 는 22-07 의 웹 변경 허용 7개 안에 있다).

## 법률 검토 미실시

이 방침은 법률 검토를 거치지 않은 문안이다(RESEARCH A7 · LOW 신뢰). 승인은 운영자 판단이며, 정식 출시 phase 에서 Play 데이터 보안 양식 · App Store 앱 개인정보 양식(D-12)을 쓸 때 이 항목표를 재사용하면서 다시 점검하는 것이 좋다. 앱 안 계정 삭제 기능(App Store 5.1.1(v))도 정식 심사 phase 로 이연돼 있다.

## User Setup Required

없음.

## Next Phase Readiness

- 22-03 이 `/privacy` 페이지로 옮길 수 있다(precondition `status: approved` 충족). 1~13절만 옮기고 부록은 제외한다.
- 22-07 은 push 결정 시 시행일 채우기를 먼저 한다.

## Self-Check: PASSED

- FOUND: 22-02-SUMMARY.md · 22-PRIVACY-DRAFT.md
- FOUND: 87ce275d · b26ea0f6
