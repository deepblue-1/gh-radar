---
phase: quick-260608-g0k
plan: 01
subsystem: docs
tags: [docs, legal, claude-md, korean-crawling]
requires: []
provides:
  - 정정된 한국 크롤링 법적 사실관계 (2021도1533 / 2017다224395 분리)
  - 한국 크롤링 운영 5원칙 (배치 캡 / 24h 캐싱+해시 / on-demand 금지 / 429·403 backoff / 출처+부분 캐싱)
affects:
  - CLAUDE.md (line 69~70, 121~135)
tech_stack:
  added: []
  patterns:
    - "Legal posture 명문화 패턴 (CLAUDE.md 안에 형사/민사 분리 사실관계 + 코드화 가능한 운영 원칙)"
key_files:
  created: []
  modified:
    - CLAUDE.md
decisions:
  - "2021도1533 (형사 무죄, 여기어때 v. 야놀자, 2022.5.12) 와 2017다224395 (민사 DB권 침해 인정, 잡코리아 v. 사람인) 를 동일 문서 안에서 명확히 분리 — 향후 LLM 컨텍스트가 잘못된 전제 (형사 책임 성립) 로 의사결정하지 않도록"
  - "보수적 운영 근거를 '형사 처벌 회피' → '민사 DB제작자 권리 침해 회피' 로 재정의"
  - "운영 5원칙을 'Naver 종목토론방 Scraping Risk' 섹션에 박아두되, 마지막 줄에 '한국 크롤링 일반에 동일 적용' 일반화 문장 명시 (향후 추가 source 점검 체크리스트로 활용)"
  - "criminal liability 단어는 의도적으로 부정문 (`is **not** established`) 으로 보존 — 검색 가능성 유지 + 향후 LLM 컨텍스트 토큰 일치 회피"
metrics:
  duration: "~5분"
  completed_at: "2026-06-08"
  tasks_total: 2
  tasks_completed: 2
  files_changed: 1
  lines_changed: "+19 / -1"
---

# Quick Task 260608-g0k: CLAUDE.md 한국 크롤링 법적 진술 정정 Summary

## One-liner

CLAUDE.md 의 잘못된 한국 크롤링 형사 책임 진술 (2021도1533) 을 사실관계에 맞게 정정 (형사 무죄 + 민사 DB권 침해 별도 명시) 하고, 한국 크롤링 일반에 적용할 운영 5원칙을 명문화.

## What Was Built

CLAUDE.md 1개 파일을 직접 편집하여 두 변경을 적용:

1. **Line 69 — 잘못된 형사 책임 진술 → 사실관계 정정 (2줄로 확장)**
   - 잘못된 원문: `대법원 2022. 5. 12. 선고 2021도1533 판결 established that violating terms of service during scraping can constitute criminal liability` (사실과 정반대 — 해당 사건은 무죄 확정)
   - 정정 후:
     - Line 69: `2021도1533` 을 `acquitted` / `is **not** established` 로 재기술 (여기어때 v. 야놀자, 형사, 정보통신망법·컴퓨터등장애업무방해·저작권법 3개 쟁점 모두 무죄)
     - Line 70 (신규): `2017다224395` (잡코리아 v. 사람인, 민사) 가 DB제작자 권리 침해를 인정해 거액 손배를 명한 사실을 분리 명시 — "real, live risk for Naver scraping is **civil**, not criminal" 결론

2. **Line 119 — `### Naver 종목토론방 Scraping Risk` 빈 섹션에 본문 추가 (Line 121~135)**
   - `**Legal posture (정정 요약).**` 단락: 보수적 운영의 진짜 근거는 민사 DB권 침해 회피임을 1단락으로 요약
   - `**Operational 5 rules — 모든 한국 크롤링 (Naver 종목토론방 포함) 에 적용.**` 헤더
   - 5번 번호 매김 리스트 (각 항목 `**키워드.**` 패턴):
     1. **일 1~2회 배치 캡** — 장중 폴링 금지, 사용자 수와 분리된 고정 배치
     2. **24h 캐싱 + 콘텐츠 해시 변경 감지 시에만 갱신** — Supabase 24h TTL + 해시/last-modified/etag 기반
     3. **사용자 클릭 시 on-demand fetch 금지** — O(N) 호출 패턴 전면 금지, 서버측 배치 캐시만 read
     4. **HTTP 429 / 403 감지 시 즉시 24h backoff** — 차단 신호 = 명시 차단, 자동 재시도/지수 backoff 으로 두드리지 않음
     5. **출처 표기 + 부분 캐싱 (전체 DB 덤프 보관 금지)** — 표시/요약 최소 필드만 저장, "상당한 부분 복제" 의 구조적 회피
   - 마지막 인용문 (`>` 블록): 5원칙은 Naver 종목토론방뿐 아니라 Naver Search API · 향후 추가 한국 데이터 소스에도 동일 적용. 새 source 추가 시 본 5원칙 점검 의무화

## Why It Matters

- **사실관계 오류 제거.** 기존 CLAUDE.md 는 한국 대법원 2021도1533 을 "형사 책임 성립" 근거로 인용했으나 실제로는 무죄 확정 사건. 본 문서를 컨텍스트로 받는 향후 모든 Claude 세션이 잘못된 전제 (예: "형사 처벌 회피를 위해 크롤링 축소") 로 의사결정하지 않도록 명시적 정정.
- **진짜 리스크 명시.** 실존하는 법적 리스크는 민사 DB제작자 권리 침해 (2017다224395). 이 리스크는 "전체의 상당한 부분 복제" / "반복적 체계적 수집" / "원본 서비스 시장가치 잠식" 에서 발생하므로, 운영 설계가 이 3가지를 구조적으로 회피하도록 5원칙을 박아둠.
- **코드 변경 가능한 형태로 박아둔 5원칙.** 향후 새로운 한국 데이터 소스 추가 시 (예: 뉴스 본문 scraping, 다른 게시판) 본 5원칙을 점검 체크리스트로 사용. 일반화 문장 명시로 "Naver 종목토론방 전용" 이 아님을 명확히.

## Plan Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Discussion board bullet 의 잘못된 형사 책임 진술 정정 (사실관계 + 민사 분리) | CLAUDE.md (line 69 → 69~70) | OK |
| 2 | 'Naver 종목토론방 Scraping Risk' 빈 섹션에 한국 크롤링 운영 5원칙 본문 추가 | CLAUDE.md (line 119 아래 → 121~135) | OK |

두 task 는 단일 파일 동일 의도 (한국 크롤링 법적 진술 정정 + 운영 원칙 명문화) 라 atomic single commit 으로 묶음.

## Verification Results (Plan 의 verify 블록 전부 실행)

| 검증 항목 | 결과 | 증거 |
|---|---|---|
| `! grep "can constitute criminal liability" CLAUDE.md` (잘못된 진술 제거) | PASS | "OK (not found)" |
| `grep "2017다224395" CLAUDE.md` (정정된 사실관계 추가) | PASS | line 70 + line 121 (2회 등장) |
| `grep "acquitted" CLAUDE.md` (무죄 명시) | PASS | line 69 |
| `grep "Operational 5 rules" CLAUDE.md` (5원칙 헤더) | PASS | line 123 |
| `grep "일 1~2회 배치 캡" CLAUDE.md` | PASS | line 125 |
| `grep "콘텐츠 해시" CLAUDE.md` | PASS | line 127 |
| `grep "on-demand fetch 금지" CLAUDE.md` | PASS | line 129 |
| `grep "24h backoff" CLAUDE.md` | PASS | line 131 |
| `grep "전체 DB 덤프 보관 금지" CLAUDE.md` | PASS | line 133 |
| `grep "Legal posture" CLAUDE.md` (보조 헤더) | PASS | line 121 |
| `grep -c "^[0-9]\. \*\*" CLAUDE.md` (5번 번호 글머리) | PASS | count=5 (line 125, 127, 129, 131, 133) |
| `git diff --stat` (영향 범위 = CLAUDE.md 만) | PASS | `CLAUDE.md \| 20 +++++++++++++++++++- / 1 file changed, 19 insertions(+), 1 deletion(-)` |
| GSD 마커 보존 (project-start/end, stack-start/end, profile-start/end) | PASS | line 1, 16, 18, 160, 195, 200 — 모두 그대로 |

## Success Criteria 검증

- [x] CLAUDE.md 에 "2021도1533 → 형사 책임 성립" 진술이 더 이상 없다 — line 69 가 `acquitted` / `is **not** established` 로 교체됨, `can constitute criminal liability` 0회.
- [x] CLAUDE.md 에 2021도1533 (형사 무죄) 와 2017다224395 (민사 DB권 침해 인정) 가 구분되어 명시된다 — line 69 (형사 무죄), line 70 + line 121 (민사 DB권).
- [x] CLAUDE.md 의 `### Naver 종목토론방 Scraping Risk` 섹션에 5원칙 본문이 존재한다 (배치 캡 / 캐싱·해시 / on-demand 금지 / 429·403 backoff / 부분 캐싱) — line 125~133 1~5 모두.
- [x] 5원칙은 한국 크롤링 일반에 적용된다는 일반화 문장 포함 — line 123 `**Operational 5 rules — 모든 한국 크롤링 ... 에 적용.**` + line 135 `> 이 5원칙은 Naver 종목토론방뿐 아니라 ... 새로운 source 추가 시 ...`.
- [x] diff 는 CLAUDE.md 만 변경하고 코드 / 다른 문서는 0 변경 — `git diff --stat` = `CLAUDE.md | 20 +++++++++++++++++++-` 단일 파일.
- [x] GSD 마커 구조 보존 — project-start/end, stack-start/end, conventions-start/end, architecture-start/end, skills-start/end, workflow-start/end, profile-start/end 7쌍 모두 무변경.

## Deviations from Plan

None — plan 이 명시한 두 Edit 을 그대로 실행. 추가 자동 수정 (Rule 1/2/3) 없음, 아키텍처 결정 (Rule 4) 없음. PLAN 본문에 `line 118 → ### Naver 종목토론방 Scraping Risk` 라 적혔으나 실제 worktree 의 CLAUDE.md 상 해당 heading 은 line 119 였음 (line 1 부터 frontmatter 가 없는 무관 사항, Edit 은 unique string anchor 로 진행해 영향 없음).

## Files Changed

| File | Change | Lines |
|---|---|---|
| CLAUDE.md | modified | +19 / -1 (line 69 1줄 → 69~70 2줄 / line 119 다음에 본문 15줄 + 빈줄 삽입) |

## Commits

| # | Hash | Message | Files |
|---|------|---------|-------|
| 1 | `e97e436` | docs(CLAUDE.md): 한국 크롤링 법적 진술 정정 + 운영 5원칙 추가 | CLAUDE.md |

(Task 1 + Task 2 atomic 단일 commit — plan 의 constraint 에 명시된 대로 두 task 가 같은 파일·같은 의도라 묶음.)

SUMMARY.md / PLAN.md 등 docs artifact 는 본 commit 에 포함하지 않음 (constraint 준수, orchestrator 가 별도 처리).

## Self-Check

### Files Created/Modified

- MODIFIED: `CLAUDE.md` — line 69-70 + line 121-135 (verified via grep + `git diff --stat`)
- CREATED: `.planning/quick/260608-g0k-claude-md-5/260608-g0k-SUMMARY.md` (본 파일)

### Commits

- FOUND: `e97e436` — `git log --oneline -1` 결과 `e97e436 docs(CLAUDE.md): 한국 크롤링 법적 진술 정정 + 운영 5원칙 추가`

## Self-Check: PASSED
