---
phase: quick-261010-ftq-tasks-lessons-md-lessons-archive-md-clau
plan: 01
subsystem: docs
tags: [lessons, auto-load, token-diet, claude-md]
status: complete
requires: []
provides:
  - "tasks/lessons.md 한 줄 요약본(49줄 · 10226B)"
  - "tasks/lessons-archive.md 교훈 49건 원문 보관소"
affects:
  - "매 대화 자동 로드 토큰(lessons 66048B → 10226B)"
tech-stack:
  added: []
  patterns: ["요약본 + 원문 archive 분리(gh-trade quick-261009-bw7 와 같은 방식)"]
key-files:
  created:
    - tasks/lessons-archive.md
  modified:
    - tasks/lessons.md
decisions:
  - "루트 CLAUDE.md 는 편집하지 않는다 — 마커 밖 362B(gh-trade 인박스)만 편집 가능하고 목표 20480B 는 이미 충족. 추가 절감은 GSD stack 블록을 열어야 하므로 사용자 결정 사항"
metrics:
  duration: "약 3분"
  completed: 2026-10-10
actuals:
  tokens: 19520
  tasks: 2
  commits: 1
plan_head_before: 049075da375c1edd46e2185325bd43867708ac00
plan_head_after: c9478b60b128d6bf19daba326b50d7efaaf09cbb
---

# Quick 261010-ftq Plan 01: tasks/lessons.md 다이어트 Summary

자동 로드되는 `tasks/lessons.md` 를 66048B 에서 10226B 로 줄였습니다. 오케스트레이터 초안을 바이트 그대로 옮긴 한 줄 요약본이고 49줄입니다. 교훈 49건의 원문 서사는 `tasks/lessons-archive.md` 로 바이트 그대로 옮겼습니다. 루트 CLAUDE.md 는 측정만 하고 고치지 않았습니다(이미 목표 이하).

## 커밋

| Task | 해시 | 제목 | 파일 |
|------|------|------|------|
| 1 | c9478b60 | docs(261010-ftq): tasks/lessons.md 한 줄 요약으로 다이어트 — 서사는 lessons-archive.md 로 이관 | tasks/lessons.md · tasks/lessons-archive.md |
| 2 | (커밋 없음) | 점검·기록만 | — |

Co-Authored-By trailer 는 없습니다(`/tmp/261010-ftq-msg.txt` grep 으로 확인). push 하지 않았습니다. 이번 커밋으로 삭제된 파일은 없습니다.

## 실측

| 대상 | 전 | 후 |
|------|----|----|
| tasks/lessons.md | 66048B · 461행 · 헤딩 52 | 10226B · 53행 · `- **` 49줄 · archive 포인터 있음 · draft 와 diff 빈 출력 |
| tasks/lessons-archive.md | (없음) | 67852B · 473행 · 헤딩(`## `/`### `) 54 · 3행~끝이 source 와 diff 빈 출력 |
| CLAUDE.md | 17824B | 17824B · 변경 없음 |

## 이관한 세부

- 교훈 49건의 서사(경위·실측·근거) 전부를 `tasks/lessons-archive.md` 로 옮겼습니다. 1행 머리말, 2행 빈 줄, 3행부터 `261010-ftq-lessons-source.md` 원문입니다. 셸 리다이렉션으로만 만들었습니다.
- 49건 가운데 2건(2026-10-06 「커밋 trailer · 플랜 입자」, 「오케스트레이터 진행 보고도 한글」)은 메인 체크아웃 작업본에만 있던 미커밋분입니다. source 파일을 거쳐 archive 와 요약본 양쪽에 들어갔습니다.
- **후속 주의:** 메인 체크아웃(`/Users/alex/repos/gh-radar`)의 작업본 `tasks/lessons.md` 에 남은 그 미커밋 수정은 이 브랜치를 master 로 합칠 때 충돌합니다. 내용은 이 커밋에 보존됐으므로 메인 쪽 미커밋 수정은 버려도 됩니다. 실행자는 메인 체크아웃을 건드리지 않았습니다.

## Task 2 — 루트 CLAUDE.md 점검

| 측정 | 기대 | 실측 |
|------|------|------|
| `wc -c < CLAUDE.md` | 17824 | 17824 |
| `grep -c 'GSD:'` | 14 | 14 |
| GSD 마커 밖 바이트 | 362 | 362 |
| `git diff --quiet HEAD -- CLAUDE.md` | 0 | 0(변경 없음) |
| CLAUDE.md 개수(find) | `./CLAUDE.md` 1개 | `./CLAUDE.md` 1개 |

| 결론 | 값 |
|------|----|
| 실측 바닥(GSD 관리 블록) | 17462B(17824 − 362) |
| 편집 가능 영역 | 362B(`## gh-trade 인박스` 절). 에이전트가 매 세션 실행하는 규칙이라 그대로 둡니다 |
| 사용자 목표 20480B | 이미 충족 |
| 추가 절감 | GSD stack 블록(14934B, 원천 `.planning/research/STACK.md`)을 열어야만 가능합니다. 사용자가 결정할 사항입니다 |

## Deviations from Plan

계획 문장과 측정은 바꾼 것이 없습니다. 초안 문장도 고치지 않았습니다.

- 참고: 실행자 커밋 프로토콜의 worktree 브랜치 허용 목록(`agent-*` · `worktree-agent-*` · `worktree-wf_*`)은 이 브랜치 이름(`worktree-bridge-cse_01SExVVH7cbdM6srBVWpgRCa`)과 맞지 않습니다. 이 목록은 병렬 per-agent worktree 용입니다. 오케스트레이터가 이 worktree 에서 순차로 직접 커밋하라고 지시했고 보호 브랜치도 아니어서 그대로 커밋했습니다.

## Known Stubs

없음(문서만).

## Self-Check: PASSED

- FOUND: tasks/lessons.md (10226B)
- FOUND: tasks/lessons-archive.md (67852B)
- FOUND: c9478b60 (HEAD 의 조상, `git log --oneline 049075da..HEAD` 1줄)
