---
phase: quick-261010-ftq-tasks-lessons-md-lessons-archive-md-clau
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tasks/lessons.md
  - tasks/lessons-archive.md
autonomous: true
requirements:
  - quick-261010-ftq

estimate:
  tokens: 25000
  raw_tokens: 25000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "tasks/lessons.md 는 10240B 이하이고, 교훈 49건이 원문 순서대로 `- **` 한 줄씩 있으며, 머리말이 tasks/lessons-archive.md 를 가리킨다"
    - "tasks/lessons-archive.md 3행부터 끝까지가 261010-ftq-lessons-source.md 와 바이트 단위로 같다 — 메인 체크아웃 미커밋 교훈 2건(2026-10-06)을 포함한 49건 서사가 한 글자도 바뀌지 않고 보존된다"
    - "tasks/lessons.md 는 오케스트레이터 초안(261010-ftq-lessons-draft.md)과 바이트 단위로 같다 — 실행자가 문장을 다시 쓰지 않았다"
    - "루트 CLAUDE.md 는 HEAD 대비 변경 없음 · 17824B(≤20480) · GSD 마커 14개 그대로"
    - "Task 1 커밋은 tasks/lessons.md · tasks/lessons-archive.md 두 파일만 담고, 메시지는 한글이며 Co-Authored-By trailer 가 없다"
  artifacts:
    - path: tasks/lessons.md
      provides: "자동 로드되는 현행 규칙 한 줄 요약본(49줄)"
      max_bytes: 10240
    - path: tasks/lessons-archive.md
      provides: "교훈 49건 원문 보관소(머리 1줄 + 빈 줄 + source 원문)"
      contains: "# Lessons 원문 보관소"
  key_links:
    - from: tasks/lessons.md
      to: tasks/lessons-archive.md
      via: "머리말 3행의 경로 문자열 tasks/lessons-archive.md (같은 날짜·제목으로 대응)"
      pattern: "tasks/lessons-archive.md"
    - from: tasks/lessons-archive.md
      to: .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md
      via: "셸 리다이렉션 cat 으로 바이트 그대로 복제 — diff 빈 출력"
      pattern: "sed -n '3,$p' tasks/lessons-archive.md == source"
---

<objective>
매 대화에 자동으로 실리는 토큰을 줄인다. `tasks/lessons.md`(66048B)를 오케스트레이터가 원문 대조를 마친 한 줄 요약본(10226B)으로 바꾸고, 원문 서사 전부(메인 체크아웃 미커밋 2건 포함 49건)는 `tasks/lessons-archive.md` 로 바이트 그대로 옮긴다. 루트 `CLAUDE.md` 는 점검만 하고 실측을 기록한다(편집 없음).

Purpose: 규칙의 의미는 하나도 바꾸지 않고 위치만 옮긴다(사용자 지시 · gh-trade quick-261009-bw7 과 같은 방식). 자동 로드 비용 약 56KB 절감.
Output: `tasks/lessons.md`(요약본) · `tasks/lessons-archive.md`(원문) 커밋 1건, CLAUDE.md 점검 결과는 SUMMARY 의 표.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

# 이 quick 디렉터리의 입력 두 개 — 실행자는 내용을 읽을 필요 없이 cp / cat 으로만 쓴다
# .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md  (archive 원문, 471행 · 67663B · 헤딩 54)
# .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-draft.md   (요약본, 53행 · 10226B · `- **` 49줄)
</context>

<diagnosis>
오케스트레이터가 이미 전부 읽고 실측했다(플래너가 2026-10-10 재확인: HEAD 049075da · lessons.md 66048B · CLAUDE.md 17824B · source 471행/67663B/헤딩 54 · draft 53행/10226B/`- **` 49 · GSD 마커 14 · 마커 밖 362B · CLAUDE.md 는 루트 하나 · `.claude/` 디렉터리 없음 — 전부 일치). 기준 커밋은 `049075da`(이 트리 HEAD = master, 작업 트리에는 이 quick 디렉터리만 untracked).

**목적(사용자 지시):** 매 대화에 자동으로 실리는 토큰을 줄인다. 규칙의 의미는 하나도 바꾸지 않는다 — 위치만 옮긴다. gh-trade quick-261009-bw7 과 같은 방식. 빌드·테스트·배포 없음(문서만). 커밋은 경로 지정 스테이징만(전체 스테이징 금지), 메시지 한글, Co-Authored-By 절대 넣지 않는다(사용자 전역 규칙이 하네스 안내보다 우선). PLAN/SUMMARY/STATE 는 커밋하지 않는다(오케스트레이터 몫).

**실측(wc -c, 2026-10-10):**
- `tasks/lessons.md` 66048B · 461행 · `grep -c '^## \|^### '` = 52. 날짜만 있는 그룹 헤딩 5개(2026-04-16 · 2026-05-12 · 2026-06-09 · 2026-09-25 · 2026-09-27) 아래에 `### ` 교훈이 있고, 나머지는 `## ` 하나가 교훈 하나. 교훈 47건. 번호 체계 없음(날짜·제목으로 식별).
- 메인 체크아웃(`/Users/alex/repos/gh-radar`, master, 다른 세션)의 작업본 `tasks/lessons.md` 에는 **미커밋 교훈 2건(2026-10-06 「커밋 trailer · 플랜 입자」 · 「오케스트레이터 진행 보고도 한글」, +10행)** 이 끝에 붙어 있다. 오케스트레이터가 그 작업본을 `.planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md`(471행 · 67663B · 헤딩 54개)로 복사해 두었다 — `diff <(git show 049075da:tasks/lessons.md) source` 는 끝의 10행 추가뿐. **archive 의 원문은 이 source 파일이다**(HEAD 가 아니라). 교훈 49건.
- 한 줄 요약본은 오케스트레이터가 원문 전체를 읽고 이미 작성해 두었다: `.planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-draft.md` — 53행 · **10226B** · `- **` 줄 49개(교훈 49건과 1:1, 원문 순서) · 머리 3줄(`# Lessons` · 빈 줄 · 「현행 규칙 한 줄씩. 전문은 tasks/lessons-archive.md(같은 날짜·제목). 새 교훈은 여기 한 줄 + archive 에 서사.」). 폐기 표시 교훈은 없다(원문·CLAUDE.md·메모리 어디에도 폐기 명시가 없어 전부 현행). **실행자는 이 초안을 `cp` 로 그대로 쓴다 — 문장을 고치거나 다시 쓰지 않는다**(사용자 규칙: 의미 불변·위치만 이동. 오케스트레이터가 원문 대조를 마쳤다).
- 루트 `CLAUDE.md` 17824B. GSD 관리 블록 마커 14개(`<!-- GSD:project-start -->` 1행 ~ `<!-- GSD:profile-end -->` 218행; project · stack(18~174행, 14934B) · conventions · architecture · skills · workflow · profile). **마커 밖 바이트는 362B 뿐**(`## gh-trade 인박스` 절 1불릿 + 빈 줄). 즉 사용자 목표 20KB(20480B)는 이미 충족이고, GSD 블록을 한 바이트도 건드리지 않는다는 조건 아래 편집 가능한 바닥은 362B — 다이어트 여지 0. 하위 CLAUDE.md 는 없다(find 결과 루트 하나). 따라서 Task 2 는 **편집 없는 점검·기록 태스크**다(커밋 없음).
- `.planning/STATE.md` Quick Tasks 표 80행 → 아카이브 이동은 오케스트레이터가 Step 7~8 에서 한다(실행자 범위 밖).
- 순차 실행(ISOLATION none, 이 worktree 에서 직접). 경로는 전부 저장소 루트 상대.
</diagnosis>

<planning_notes>
- Assumption-delta 체크포인트: 해당 없음(quick 은 ROADMAP phase 가 아님 — scan skipped).
- Schema push 게이트: 해당 없음(스키마 파일 없음 · 문서만).
- Threat model: 생략(`.planning/config.json` workflow.security_enforcement=false).
- Tracer-first: 적용 안 함 — 레이어가 없는 문서 이관이고 오케스트레이터가 2태스크 명세를 고정했다.
- 정확 개수 게이트(`grep -c … -eq 49/54/14`)는 의도된 줄 수 측정이다: `^- \*\*` · `^## \|^### ` 는 행머리 고정이라 줄 수 = 교훈/헤딩 수, `GSD:` 는 마커 한 줄에 하나씩(플래너가 HEAD 에서 14 실측). Task 1 의 49/54 는 HEAD 에서 거짓인 것이 정상(사후 상태 단언), Task 2 의 14 는 HEAD 그대로임을 단언한다. 오케스트레이터 명세의 verify 문자열을 그대로 유지한다.
  <!-- plan-criteria-allow: R1 - anchored line-count gates are the intended measure (one lesson/heading/marker per line), verbatim from orchestrator spec -->
- CONTEXT.md D-XX 결정 없음(quick). 소스 커버리지: GOAL(자동 로드 다이어트 · lessons 한 줄 요약 · 서사 archive 이관 · 루트 CLAUDE.md 점검) → Task 1 · Task 2 / REQ quick-261010-ftq → 두 태스크 모두 / RESEARCH 없음. 누락 0.
- 후속 주의(실행자 범위 밖 · SUMMARY 에 기록만): 메인 체크아웃 작업본 `tasks/lessons.md` 의 미커밋 2건은 이번 커밋의 archive·요약본에 이미 들어간다. 이 브랜치가 master 로 합쳐질 때 메인 작업본의 그 미커밋 수정은 이 커밋과 충돌한다 — 내용이 보존됐으므로 메인 쪽 미커밋 수정은 버려도 된다는 사실을 SUMMARY 에 적는다. 실행자는 메인 체크아웃을 건드리지 않는다.
</planning_notes>

<tasks>

<task type="auto">
  <name>Task 1: tasks/lessons.md 를 한 줄 요약본으로 바꾸고 원문은 tasks/lessons-archive.md 로 바이트 그대로 이관</name>
  <files>tasks/lessons.md, tasks/lessons-archive.md</files>
  <precondition>`git rev-parse HEAD` 가 049075da 로 시작하고 `wc -c < tasks/lessons.md` 가 66048 이며, quick 디렉터리에 261010-ftq-lessons-source.md · 261010-ftq-lessons-draft.md 가 있다 — 하나라도 다르면 편집 없이 멈추고 보고한다.</precondition>
  <read_first>
    - .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-PLAN.md 의 diagnosis 블록(이미 실측 완료 — 원문·초안을 다시 읽거나 대조하지 않는다)
  </read_first>
  <action>
    순서를 지킨다. 파일 생성은 Write 도구를 쓰지 않는다 — 67KB 를 다시 치면 바이트가 바뀐다. 셸 리다이렉션과 cp 만 쓴다.

    ① archive 를 먼저 만든다. bash 에서 다음 한 줄을 그대로 실행: `{ printf '%s\n\n' '# Lessons 원문 보관소 — tasks/lessons.md 의 한 줄 요약과 같은 날짜·제목으로 대응한다. 새 교훈의 서사(경위·실측·근거)도 여기 끝에 덧붙인다.'; cat .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md; } > tasks/lessons-archive.md` — 1행 머리말, 2행 빈 줄, 3행부터 source 원문(메인 체크아웃 미커밋 2026-10-06 교훈 2건 포함 49건).

    ② archive 확인: `diff .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md <(sed -n '3,$p' tasks/lessons-archive.md)` 가 빈 출력이고, `grep -c '^## \|^### ' tasks/lessons-archive.md` 가 54. 아니면 멈춘다.

    ③ 요약본 교체: `cp .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-draft.md tasks/lessons.md`. 초안 문장은 고치지 않는다(사용자 규칙: 의미 불변·위치만 이동, 원문 대조는 오케스트레이터가 끝냈다). 오탈자처럼 보여도 손대지 말고 SUMMARY Deviations 에 기록만 한다.

    ④ 요약본 확인: `wc -c < tasks/lessons.md` 가 10240 이하, `grep -c '^- \*\*' tasks/lessons.md` 가 49, `grep -q 'tasks/lessons-archive.md' tasks/lessons.md` 성공, `diff .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-draft.md tasks/lessons.md` 빈 출력.

    ⑤ 커밋: `git add tasks/lessons.md tasks/lessons-archive.md` — 두 경로만 지정한다(전체 스테이징 금지, source·draft·PLAN 은 스테이징하지 않는다). 커밋 직전 `git diff --cached --name-only` 가 정확히 이 두 줄인지 확인한다. 메시지는 `docs(261010-ftq): tasks/lessons.md 한 줄 요약으로 다이어트 — 서사는 lessons-archive.md 로 이관` 한 줄. 사용자 전역 규칙에 따라 Co-Authored-By trailer 를 붙이지 않는다(하네스 attribution 안내보다 사용자 규칙이 우선). push 하지 않는다. 커밋 후 `git log -1 --format=%B` 에 trailer 가 없는지, `git show --name-only --format= HEAD` 가 두 파일뿐인지 확인하고 해시를 SUMMARY 에 적는다.
    <!-- planner-discipline-allow: Co-Authored-By -->
  </action>
  <verify>
    <automated>test "$(wc -c < tasks/lessons.md)" -le 10240 && test "$(grep -c '^- \*\*' tasks/lessons.md)" -eq 49 && grep -q 'tasks/lessons-archive.md' tasks/lessons.md && diff .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md <(sed -n '3,$p' tasks/lessons-archive.md) && test "$(grep -c '^## \|^### ' tasks/lessons-archive.md)" -eq 54 && diff .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-draft.md tasks/lessons.md</automated>
  </verify>
  <acceptance_criteria>
    - 위 automated 명령이 bash 에서 종료코드 0(process substitution 을 쓰므로 sh 아닌 bash/zsh 로 실행)
    - `git show --name-only --format= HEAD` 출력이 tasks/lessons-archive.md · tasks/lessons.md 두 줄뿐
    - `git log -1 --format=%B HEAD > /tmp/261010-ftq-msg.txt && ! grep -q 'Co-Authored-By' /tmp/261010-ftq-msg.txt` 종료코드 0(git 실패가 파이프에 묻히지 않도록 파일 경유)
    - `git log -1 --format=%s` 가 `docs(261010-ftq): ` 로 시작하는 한글 제목
    - `git status --porcelain` 에 tasks/ 아래 미커밋 변경이 없다(quick 디렉터리 untracked 는 정상)
  </acceptance_criteria>
  <done>tasks/lessons.md 가 10226B 요약본(49줄 · archive 포인터)이고, tasks/lessons-archive.md 가 머리 2줄 + source 원문 바이트 그대로(헤딩 54)이며, 두 파일만 담은 한글 커밋 1건(trailer 없음, push 없음)이 생겼다.</done>
</task>

<task type="auto">
  <name>Task 2: 루트 CLAUDE.md 점검 — 편집·커밋 없이 실측만 SUMMARY 에 기록</name>
  <files>(없음 — 읽기만. CLAUDE.md 는 수정하지 않는다)</files>
  <read_first>
    - ./CLAUDE.md 는 읽지 않아도 된다 — 아래 명령의 출력만 기록한다
  </read_first>
  <action>
    다음 다섯 측정을 실행해 출력을 SUMMARY 에 기록한다: `wc -c < CLAUDE.md`(기대 17824) · `grep -c 'GSD:' CLAUDE.md`(기대 14) · 마커 밖 바이트 `awk '/<!-- GSD:.*-start/{inb=1} !inb{print} /<!-- GSD:.*-end/{inb=0}' CLAUDE.md | wc -c`(기대 362) · `git diff --quiet HEAD -- CLAUDE.md` 종료코드 0(변경 없음) · `find . -name CLAUDE.md -not -path '*/node_modules/*' -not -path './.git/*'` 결과가 `./CLAUDE.md` 하나.

    결론을 SUMMARY 에 표로 남긴다: 하드 상한을 정할 실측 바닥 = GSD 관리 블록 17462B(17824−362) · 편집 가능 362B(`## gh-trade 인박스` 절 — 에이전트가 매 세션 실행하는 규칙이라 남긴다) · 사용자 목표 20480B 이미 충족 · 추가 다이어트는 GSD 블록(특히 stack 블록 14934B, 원천 `.planning/research/STACK.md`)을 열어야만 가능하며 그건 사용자 결정 사항으로 남긴다.

    CLAUDE.md 를 편집하지 않는다. 이 태스크는 커밋하지 않는다. 기대값과 다르면 편집으로 맞추지 말고 실측값을 그대로 SUMMARY Deviations 에 적는다.
  </action>
  <verify>
    <automated>test "$(wc -c < CLAUDE.md)" -le 20480 && test "$(grep -c 'GSD:' CLAUDE.md)" -eq 14 && git diff --quiet HEAD -- CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - 위 automated 명령 종료코드 0
    - SUMMARY 에 CLAUDE.md 실측 5항목(바이트 · 마커 수 · 마커 밖 바이트 · 변경 없음 · CLAUDE.md 개수)과 결론 표가 있다
    - Task 2 로 인한 새 커밋이 없다(`git log --oneline 049075da..HEAD` 가 Task 1 커밋 1줄뿐)
  </acceptance_criteria>
  <done>CLAUDE.md 는 HEAD 그대로이고, 실측 5항목과 「GSD 블록 17462B 가 바닥 · 편집 가능 362B 는 유지 · 목표 이미 충족 · 추가 절감은 사용자 결정」 결론이 SUMMARY 표로 남았다.</done>
</task>

</tasks>

<verification>
- `test "$(wc -c < tasks/lessons.md)" -le 10240 && test "$(grep -c '^- \*\*' tasks/lessons.md)" -eq 49 && grep -q 'tasks/lessons-archive.md' tasks/lessons.md`
- `diff .planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-lessons-source.md <(sed -n '3,$p' tasks/lessons-archive.md)` 빈 출력
- `test "$(wc -c < CLAUDE.md)" -le 20480 && test "$(grep -c 'GSD:' CLAUDE.md)" -eq 14 && git diff --quiet HEAD -- CLAUDE.md`
- `git log --oneline 049075da..HEAD` 가 1줄(Task 1 커밋), `git show --name-only --format= HEAD` 가 두 파일뿐
</verification>

<success_criteria>
- 자동 로드 lessons 비용 66048B → 10226B(약 56KB 절감), 의미 변경 0(요약본은 초안 바이트 그대로, 원문은 source 바이트 그대로)
- 교훈 49건 서사 전부 tasks/lessons-archive.md 에 보존(메인 체크아웃 미커밋 2026-10-06 2건 포함)
- 루트 CLAUDE.md 무변경 · 17824B · 20480B 목표 충족 확인 · 추가 절감 여지가 GSD 블록뿐이라는 결론 기록
- 커밋 1건: 두 파일 경로 지정 · 한글 메시지 · Co-Authored-By 없음 · push 없음 · PLAN/SUMMARY/STATE 미커밋
</success_criteria>

<output>
Create `.planning/quick/261010-ftq-tasks-lessons-md-lessons-archive-md-clau/261010-ftq-SUMMARY.md` when done (커밋하지 않는다 — 오케스트레이터 몫).

SUMMARY 필수 구성:
- frontmatter `status: complete`
- 커밋 표: Task 1 해시 · 제목 · 파일 2개
- 실측 표: tasks/lessons.md 전(66048B · 461행) / 후(바이트 · 행 · `- **` 49) · tasks/lessons-archive.md(바이트 · 행 · 헤딩 54) · CLAUDE.md(17824B · 변경 없음)
- 「이관한 세부」 절: 교훈 49건 서사 → archive. 그중 2건(2026-10-06 「커밋 trailer · 플랜 입자」 · 「오케스트레이터 진행 보고도 한글」)은 메인 체크아웃 작업본에만 있던 미커밋분이며 source 경유로 포함됐다는 사실. 메인 작업본의 그 미커밋 수정은 이 커밋에 보존됐으므로 병합 시 버려도 된다는 후속 주의 한 줄
- Task 2 결론 표: GSD 블록 17462B(바닥) · 편집 가능 362B(gh-trade 인박스 — 유지) · 목표 20480B 충족 · 추가 절감은 stack 블록 14934B(원천 .planning/research/STACK.md) 를 열어야 함 — 사용자 결정 사항
- Deviations 절(없으면 「없음」)
</output>
