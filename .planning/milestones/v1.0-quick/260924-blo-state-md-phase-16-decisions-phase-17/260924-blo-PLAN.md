---
phase: quick-260924-blo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/STATE.md
  - .planning/STATE-ARCHIVE.md
  - .planning/DECISIONS-ARCHIVE.md
  - .planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md
  - docs/relay-operations.md
  - .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py
  - .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py
autonomous: true
requirements: [BLO-A, BLO-B1, BLO-B2, BLO-B3, BLO-B4, BLO-C, BLO-D, BLO-E]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "STATE.md 가 약 216줄 · 50,000 바이트 미만으로 줄고(원본 966줄 · 259,838 바이트), frontmatter 는 BASE 원본과 바이트 단위로 같다 (BLO-A · BLO-D)"
    - "gsd-tools 가 찾는 헤딩 9개(`## Current Position` · `## Performance Metrics` · `## Accumulated Context` · `### Roadmap Evolution` · `### Decisions` · `### Pending Todos` · `### Blockers/Concerns` · `### Quick Tasks Completed` · `## Session Continuity`)와 표 헤더 3개(`| Phase | Plans | Duration | Status |` · `| Plan | Duration | Tasks | Files |` · `| # | Description | Date | Commit | Directory |`)가 STATE.md 에 각 1번씩 남고, gsd-core 순수 함수 dry-run(`appendQuickTaskRow` ok · Performance Metrics 안 Per-Plan 헤더 · level-3 `Decisions`)이 통과한다 (BLO-D)"
    - "원본 STATE.md 의 모든 비공백 줄이 새 파일 5개(STATE.md · STATE-ARCHIVE.md · DECISIONS-ARCHIVE.md · 16-GAP-CLOSURE-LOG.md · docs/relay-operations.md) 합집합에 원문 그대로 존재한다 — 예외는 Decisions 서두 템플릿 2줄과 relay 절 헤딩 1줄(출처 줄에 텍스트로 보존)뿐, `## Phase N Success Criteria 검증` 3줄은 `###` 강등본으로 존재 (BLO-B · BLO-C · BLO-D)"
    - "이관 블록은 요약·재작성 없이 원문 부분문자열로 목적지에 있다: 갭 클로징 4개 절 → 16-GAP-CLOSURE-LOG.md, relay 사실 본문 → docs/relay-operations.md, Phase 17 배포 절·Phase 15/10/9 Production State·Phase 1~3 Success Criteria·Current Position 원 Status/Last activity 줄 → STATE-ARCHIVE.md `## 낡은 섹션 원문` (BLO-B1 · BLO-B3 · BLO-B4 · BLO-C)"
    - "Decisions: STATE.md 에는 링크 1줄 + 원문 마지막 `[Phase 18]` 10건(18-28 ~ 18-35)만, DECISIONS-ARCHIVE.md 에는 290건 전량이 `## Phase 01` ~ `## Phase 18` 15개 헤딩 아래 원문 순서로 있다 (BLO-B2)"
    - "Performance Metrics: By Phase 표는 헤더만 남고 원래 87행은 아카이브 `## Performance Metrics` 로, Per-Plan 표(Phase 17·18 47행)는 그대로 · Quick Tasks: STATE.md 에 최근 10행, 나머지 76행은 아카이브 `## Quick Tasks Completed` 로 (BLO-A · BLO-B4)"
    - "Pending Todos 는 DI-03 · DI-04 · 시크릿 로테이션 · deployer SA key 4건만, Blockers/Concerns 는 비어 있고(`None yet.`), 닫힌 5건은 아카이브 `## 닫힌 Todo · Blocker` 에 닫힘 근거와 함께 있다 (BLO-E)"
    - "STATE.md 의 상대 링크 5개가 실제 파일과 GitHub 앵커(`#performance-metrics` · `#quick-tasks-completed` · `#낡은-섹션-원문` · `#닫힌-todo--blocker`)를 가리킨다 (BLO-A · BLO-B)"
    - "커밋 1개로 위 7개 경로만 들어가고 push 는 하지 않는다 · `docs/dma-tunnel-guide.md` 는 변경 0 (BLO-D)"
  artifacts:
    - path: ".planning/STATE.md"
      provides: "150~220줄 digest — 현재 위치 · Phase 17 배포 요약 · 남은 것 · 메트릭 · 로드맵 진화 · 최근 결정 10 · 살아 있는 Todo · 최근 quick 10 · 세션"
      contains: "STATE-ARCHIVE.md#quick-tasks-completed"
    - path: ".planning/STATE-ARCHIVE.md"
      provides: "앵커 4개 고정 — `## Performance Metrics` · `## Quick Tasks Completed` · `## 낡은 섹션 원문` · `## 닫힌 Todo · Blocker`"
      contains: "## 닫힌 Todo · Blocker"
    - path: ".planning/DECISIONS-ARCHIVE.md"
      provides: "결정 290건 전량, phase 별 `## Phase NN` 15개 묶음"
      contains: "## Phase 09.1"
    - path: ".planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md"
      provides: "Phase 16 갭 클로징 3라운드 · 2라운드 · DMA_HOST 배포 회귀 · Gap Closure State(16-26) 원문"
      contains: "### Phase 16 Gap Closure 3라운드"
    - path: "docs/relay-operations.md"
      provides: "relay 운영 지식 (Phase 17) — 재사용 가능한 사실 10개 원문"
      contains: "# relay 운영 지식 (Phase 17)"
    - path: ".planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py"
      provides: "`git show BASE:.planning/STATE.md` 에서 헤딩 경계로 분할·재조립하는 멱등 스크립트"
    - path: ".planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py"
      provides: "무손실 · 스캐폴드 · frontmatter · 링크 · gsd-tools 호환 검증(실패 시 exit 1)"
  key_links:
    - from: ".planning/STATE.md `### Quick Tasks Completed`"
      to: "gsd-core `appendQuickTaskRow` (markdown-table.cjs)"
      via: "섹션 본문의 첫 `|` 줄이 표 헤더여야 한다 — 링크 줄은 `|` 로 시작하지 않고, 표 뒤에 다른 `|` 줄이 없어야 새 행이 마지막 행 뒤에 붙는다"
    - from: ".planning/STATE.md `## Performance Metrics`"
      to: "gsd-core `state record-metric` (state.cjs)"
      via: "`| Plan | Duration | Tasks | Files |` 헤더 + 구분선이 섹션 안에 있어야 새 행이 Per-Plan 표 끝에 붙는다(By Phase 표가 비어도 무관)"
    - from: ".planning/STATE.md 링크 줄 5개"
      to: "STATE-ARCHIVE.md 앵커 · DECISIONS-ARCHIVE.md · 16-GAP-CLOSURE-LOG.md · ../docs/relay-operations.md"
      via: "상대 경로(STATE.md 디렉터리 기준) + GitHub 슬러그 앵커"
---

<objective>
`.planning/STATE.md`(966줄 · 259,838 바이트)를 gsd 템플릿의 「digest」 원칙대로 줄인다. 낡은 섹션은 지우되 원문은 `STATE-ARCHIVE.md` 로 옮기고, Phase 16 갭 클로징 로그 · 결정 전량 · Phase 17 relay 운영 지식은 각자 제자리 문서로 분리한 뒤 STATE.md 에서 링크한다. 사용자 승인 분리 기준(결정 A~E)을 그대로 따른다 — 재논의 없음.

Purpose: 모든 GSD 워크플로우가 가장 먼저 읽는 파일이 260KB 라 "한 번 읽고 위치를 안다"가 깨졌다. 이관은 한 글자도 잃지 않아야 하고, gsd-tools 의 헤딩 기반 append 가 계속 동작해야 한다.
Output: 축약된 STATE.md + 새 문서 4개 + 분할·검증 스크립트 2개(재현 증거), 커밋 1개.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@~/.claude/gsd-core/templates/state.md

# .planning/STATE.md 는 966줄 · 260KB 다. 통째로 Read 하지 말 것.
# 헤딩 지도는 `grep -n '^#' .planning/STATE.md`, 구간은 `sed -n 'A,Bp'`, 긴 줄은 `awk '{print substr($0,1,140)}'` 로 잘라 본다.

## 계획 시점 실측(STATE.md blob 53655e543c8f1c2de4fcdd42581dcba53b1c1097, HEAD 6d23e2d) — 줄 번호는 참고용, 스크립트는 헤딩 텍스트로 찾는다

헤딩 24개(원문 순서, 줄 번호):
1. `# Project State` (20)
2. `## Project Reference` (22)
3. `## Current Position` (29)
4. `### ✅ Phase 17 프로덕션 배포 완결 (2026-09-20 20:31 KST)` (40) — 안에 ``` 펜스 1개(42~44), 펜스 안에 `#` 줄 없음
5. `### ★ 그 외 남은 것 1건` (55)
6. `### Phase 16 Gap Closure 3라운드 (2026-09-09, 16-36~16-46)` (59)
7. `### Phase 16 Gap Closure 2라운드 (2026-09-09, 16-27~16-35)` (174)
8. `### DMA_HOST 배포 회귀 — 발견·수정 (2026-09-09, 갭 클로징 2라운드 직후)` (268)
9. `### Phase 16 Gap Closure State (2026-09-09, 16-26)` (289)
10. `### Phase 15 Production State (2026-09-08)` (300)
11. `### Phase 10 Production State (2026-06-09)` (309)
12. `### Phase 9 Production State (2026-05-12 12:24 KST)` (317)
13. `## Phase 1 Success Criteria 검증` (325)
14. `## Phase 2 Success Criteria 검증` (334)
15. `## Phase 3 Success Criteria 검증` (344)
16. `## Performance Metrics` (354)
17. `## Accumulated Context` (507)
18. `### Phase 17 이 남긴 재사용 가능한 사실 (2026-09-20)` (509)
19. `### Roadmap Evolution` (522)
20. `### Decisions` (548)
21. `### Pending Todos` (844)
22. `### Blockers/Concerns` (854)
23. `### Quick Tasks Completed` (859)
24. `## Session Continuity` (950)

Current Position 필드: `Phase:`·`Status:`·`Progress:`·`Last activity:`·`Stopped at:` 는 본문 전체에 각각 평문 1회, `**Field:**` 굵은 형식은 `**Resume file:**` 1회뿐(gsd `stateExtractField` 는 굵은 형식을 평문보다 먼저 잡는다 — 새 텍스트에 `**Status:**` 류를 만들지 말 것). 파일은 LF · BOM 없음 · 마지막 줄 개행 있음.

Performance Metrics: `**Velocity:**` 블록(356~362) → `**By Phase:**` → 표 `| Phase | Plans | Duration | Status |`(366) + 구분선 + 데이터 **87행**(368 `| 1. Data Foundation |…` ~ 454 `| Phase 16 P44 |…`, Phase 17·18 행 0개) → 빈 줄 없이 바로 `**Per-Plan Metrics:**`(455) → 표 `| Plan | Duration | Tasks | Files |`(457) + 구분선 + **47행**(459 `| Phase 17 P01 |` ~ 505 `| Phase 18 P36 |`, 전부 Phase 17·18).

Decisions(549~843): 서두 템플릿 2줄(`Decisions are logged in PROJECT.md Key Decisions table.` · `Recent decisions affecting current work:`) + `- ` 로 시작하는 결정 **290건**(연속 줄 없음). 형식 3종 — `- [Phase 16 Plan 42]: …` · `- [Phase 09-daily-candle-data]: …` · 괄호 없는 `- Phase 1: …` / `- Phase 2 준비: …`. 원문 순서는 phase 순이 아니다(맨 앞이 Phase 16 Plan 42·26·18, 그다음 Phase 1·2, 04 … 14, 다시 16, 17, 18). phase 별 개수: 01:6 · 02:1 · 04:3 · 05.1:2 · 06:5 · 09:5 · 09.1:32 · 09.2:4 · 10:26 · 12:5 · 13:9 · 14:14 · 16:82 · 17:26 · 18:70. 원문 마지막 `[Phase 18]` 10건 = 18-28 두 건 · 18-30 · 18-29 · 18-31 두 건 · 18-33 · 18-34 · 18-35 두 건(원문 순서 그대로).

Quick Tasks(861~948): 헤더 + 구분선 + **86행**, 셀 5개(설명 안 `\|` 이스케이프 있음 — 분할은 `(?<!\\)\|`). 표 순서는 시간순이 아니다(863~903 내림차순, 904~943 오름차순, 944~948 fast 번호행 51·54·60·85·86). 커밋 시각 기준 최근 10건 = `260923-nvr`(15:15) · `260923-m23`(16:16) · `260923-onn`(18:13) · `260923-p3k`(18:34) · `260923-pgu`(18:53) · `260923-pgv`(19:04) · `260923-pq2`(19:11) · `260923-que`(19:25) · `85`(20:00 0ae774a) · `86`(20:43 797d468). 그다음이 `260923-mrf`(14:51) — 아카이브로 간다.

Pending Todos(846~852) 7건 · Blockers/Concerns(856~857) 2건 — 판정은 결정 E(아래 T2).

gsd-core 가 STATE.md 를 만지는 방식(읽고 맞출 것 — 수정 금지):
- `~/.claude/gsd-core/bin/lib/markdown-table.cjs` `appendQuickTaskRow` (710행 부근) · `parseMarkdownTable` (139행 부근): Quick Tasks 섹션 본문에서 `|` 로 시작하는 첫 줄을 헤더로 본다(앞의 산문 줄은 무시) · 새 행은 섹션 안 마지막 `|` 줄 뒤에 삽입 · 모든 행 셀 수가 헤더와 같아야 함 · `#` 미지정 행 번호 = 현재 행 수 + 1.
- `~/.claude/gsd-core/bin/lib/state.cjs` record-metric (885~1000행 부근): `## Performance Metrics` 안에서 헤더가 정확히 `Plan | Duration | Tasks | Files` 인 표를 찾아 마지막 행 뒤에 붙인다. add-decision(1235행 부근): level 2/3 `Decisions` 섹션 끝에 붙인다. add-blocker(1306행 부근): 섹션의 `None.`/`None yet.` 을 지우고 끝에 붙인다.
- `~/.claude/gsd-core/bin/lib/state-document.cjs` `stateExtractField` · `~/.claude/gsd-core/bin/lib/markdown-sectionizer.cjs` `collectSection`/`tokenizeHeadings` — 순수 함수, dry-run 검증에 쓴다.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: 트레이서 — 분할·검증 스크립트 뼈대 + 「relay 운영 지식」 한 경로 end-to-end (원본 → docs/relay-operations.md → STATE.md 링크 → 검증)</name>
  <files>.planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py, .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py, docs/relay-operations.md, .planning/STATE.md</files>
  <precondition>`git hash-object .planning/STATE.md` 가 53655e543c8f1c2de4fcdd42581dcba53b1c1097 이고 `git diff --quiet HEAD -- .planning/STATE.md` 가 0 — 계획 시점 STATE.md 그대로다. 다르면(다른 세션이 STATE.md 를 바꿈) 손대지 말고 멈춰서 차이를 보고한다.</precondition>
  <read_first>
    - .planning/STATE.md 헤딩 지도만: `grep -n '^#' .planning/STATE.md` 와 `sed -n '1,20p'`, `sed -n '505,523p'`(relay 절 경계)
    - ~/.claude/gsd-core/bin/lib/markdown-table.cjs 의 appendQuickTaskRow · parseMarkdownTable
    - ~/.claude/gsd-core/bin/lib/state-document.cjs 의 stateExtractField (굵은 형식 우선)
  </read_first>
  <action>
결정 B3·D 의 가장 얇은 경로를 끝까지 한 번 통과시킨다. 이 태스크에서 만든 파서·출력기·검증 하네스를 T2 가 그대로 확장한다. 커밋은 T3 에서 한 번만 한다(중간 커밋 금지 — 반쯤 줄인 STATE.md 가 이력에 남지 않게).

(1) BASE 고정. 작업 시작 시 `git rev-parse HEAD` 값을 두 스크립트 상단 상수 BASE 에 박는다. 원본은 언제나 `git show BASE:.planning/STATE.md` 로 읽는다 — 작업 트리의 STATE.md 를 입력으로 쓰지 않는다. 그래서 split.py 는 몇 번 다시 돌려도 결과가 같다(멱등, 수정 누적 없음). 966줄을 Edit 로 손대지 말 것 — 모든 변경은 이 스크립트 출력이다.

(2) split.py 파서. frontmatter = 파일 처음부터 두 번째 `---` 줄(개행 포함)까지 — 바이트 그대로 통과시키고 절대 가공하지 않는다(결정 D). 본문은 줄 단위로 나누고, ``` 로 시작하는 줄에서 펜스 상태를 토글하며, 펜스 밖에서 `^#{1,6} ` 에 맞는 줄을 헤딩으로 잡는다. 각 헤딩의 블록 = 그 헤딩 줄부터 다음 헤딩 직전 줄까지, 본문 = 헤딩 다음 줄부터 다음 헤딩 직전까지의 앞뒤 빈 줄을 뺀 것. 잡힌 헤딩 목록이 context 의 24개와 순서·텍스트가 정확히 같지 않으면 즉시 예외로 중단한다(fail loud — 조용히 넘어가면 이관 누락이 된다). 출력은 UTF-8 · LF · BOM 없음 · 파일 끝 개행 1개.

(3) 이 태스크의 한 경로(결정 B3). `docs/relay-operations.md` = 첫 줄 `# relay 운영 지식 (Phase 17)` · 빈 줄 · 출처 1줄 「출처: `.planning/STATE.md` §「Phase 17 이 남긴 재사용 가능한 사실 (2026-09-20)」에서 2026-09-24 이관(quick-260924-blo) — 본문은 원문 그대로다.」 · 빈 줄 · 헤딩 18 의 본문(불릿 10개) 원문. 기존 `docs/dma-tunnel-guide.md` 는 열지도 바꾸지도 않는다.

(4) STATE.md(이 단계). 원본에서 헤딩 18 블록만 빼고, `## Accumulated Context` 헤딩 + 빈 줄 바로 다음에 링크 1줄 「relay 운영 지식(Phase 17 이 남긴 재사용 가능한 사실): [docs/relay-operations.md](../docs/relay-operations.md)」 + 빈 줄을 넣는다. 나머지는 원문 그대로 둔다(T2 가 이어서 줄인다).

(5) verify.py 뼈대 — 검사 하나당 PASS/FAIL 한 줄을 찍고 하나라도 FAIL 이면 exit 1. 원본은 역시 `git show BASE:.planning/STATE.md`. 이 태스크에서 넣을 검사:
 - frontmatter: 새 STATE.md 의 frontmatter 가 원본과 바이트 동일.
 - 스캐폴드: must_haves 의 헤딩 9개가 새 STATE.md 에 각 정확히 1번(펜스 밖 헤딩 기준), 표 헤더 3줄이 각 1번 이상.
 - relay 경로: 원본 헤딩 18 본문이 docs/relay-operations.md 의 부분문자열 · 헤딩 18 줄이 새 STATE.md 의 헤딩 목록에 없음 · 헤딩 18 텍스트(`### ` 뺀 것)가 relay 문서 출처 줄 안에 있음.
 - 링크: 새 STATE.md(와 이후 새 문서들)의 `](./…)`·`](../…)` 링크마다 파일이 있고, `#앵커` 가 있으면 대상 파일에 GitHub 슬러그가 같은 헤딩이 있음. 슬러그 = 헤딩 텍스트 소문자화 → 유니코드 단어 문자·공백·하이픈 외 제거 → 공백을 `-` 로(예: `닫힌 Todo · Blocker` → `닫힌-todo--blocker`, `낡은 섹션 원문` → `낡은-섹션-원문`).
 - gsd-tools 호환 dry-run: `node` 하위 프로세스로 `~/.claude/gsd-core/bin/lib/` 의 markdown-table.cjs · markdown-sectionizer.cjs · state-document.cjs 를 require 해서, 새 STATE.md 문자열에 대해 ① `appendQuickTaskRow(content, {quickId:'VERIFY', description:'dry-run', date:'2026-09-24', commit:'-', directory:'—'})` 가 ok:true 이고 반환 content 에서 그 행이 `### Quick Tasks Completed` 와 `## Session Continuity` 사이에 있음 ② `collectSection(content, h => /^performance metrics$/i.test(h.text.trim()))` 본문에 `| Plan | Duration | Tasks | Files |` 줄과 바로 다음 구분선이 있음 ③ `tokenizeHeadings(content)` 에 level 3 `Decisions` 가 정확히 1개 ④ `stateExtractField` 로 뽑은 `Phase` · `Progress` · `Stopped at` · `Resume file` 값이 원본과 같음. 파일은 쓰지 않는다(순수 함수만).

split.py 실행 → verify.py 실행이 초록이면 이 태스크 끝.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && python3 .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py && python3 .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py</automated>
  </verify>
  <done>docs/relay-operations.md 가 제목·출처·원문 불릿 10개로 생겼고, STATE.md 에서 relay 절이 빠지고 Accumulated Context 에 링크 1줄이 생겼으며, verify.py 의 frontmatter · 스캐폴드 · relay 무손실 · 링크 · gsd-tools dry-run 검사가 전부 PASS(exit 0). 헤딩 목록이 24개와 다르면 split.py 가 예외로 멈춘다.</done>
</task>

<task type="auto">
  <name>Task 2: 확장 — 갭 클로징 로그 · 결정 아카이브 · STATE 아카이브 생성 + STATE.md 축약본 재조립 + 전체 무손실 검증</name>
  <files>.planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py, .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py, .planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md, .planning/DECISIONS-ARCHIVE.md, .planning/STATE-ARCHIVE.md, .planning/STATE.md</files>
  <read_first>
    - .planning/STATE.md 는 여전히 통째로 읽지 않는다. 필요한 구간만: `sed -n '29,58p'`(Current Position · Phase 17 배포 · ★), `sed -n '354,370p'` · `sed -n '450,460p'`(메트릭 표 경계), `sed -n '548,556p'` · `sed -n '830,866p'`(Decisions 끝 · Todos · Blockers · Quick 머리), `sed -n '940,966p'`(Quick 끝 · Session) — 긴 줄은 `cut -c1-160`
    - supabase/migrations/20260702160000_security_perf_advisor_fixes.sql 60~70행(DI-01 근거) · scripts/smoke-master-sync.sh 68~74행(DI-02 근거) · supabase/migrations/20260413120100_rls_policies.sql 14~23행(DI-03 미해결 근거)
  </read_first>
  <action>
T1 의 split.py 에 나머지 변환을 모두 더한다. 원문을 옮기는 곳은 전부 원본 줄을 그대로 복사한다 — 요약·재작성·공백 정리 금지(결정 B). 새로 쓰는 문장은 파일 머리의 출처·설명 줄, 링크 줄, Phase 17 배포 요약 4줄, Status/배포 순서 2줄, 닫힘 근거 줄뿐이다.

A. `.planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md`(결정 B1): `# Phase 16 갭 클로징 이력` · 빈 줄 · 출처 1줄 「출처: `.planning/STATE.md` 에서 2026-09-24 이관(quick-260924-blo) — 아래 4개 절은 원문 그대로다.」 · 설명 1줄 「Phase 16 갭 클로징 1~3라운드(16-18~16-46)와 DMA_HOST 배포 회귀의 진행·판정 기록. 처리 결과 정본은 `16-VALIDATION.md` §Gap Closure 표다.」 · 빈 줄 · 원본 헤딩 6 줄부터 헤딩 10 직전까지(헤딩 6·7·8·9 블록 연속, 끝 빈 줄 제거) 그대로. `###` 헤딩 레벨도 그대로 둔다.

B. `.planning/DECISIONS-ARCHIVE.md`(결정 B2): `# 결정 로그 아카이브` · 빈 줄 · 출처·설명 2줄(불릿 금지 — `- ` 로 시작하지 않는 산문 줄로) 「출처: `.planning/STATE.md` `### Decisions` 에서 2026-09-24 이관(quick-260924-blo). 항목은 원문 그대로이고, phase 별로 묶었으며 각 묶음 안은 원문 순서다.」 · 「STATE.md 에는 Phase 18 최근 10건만 남는다 — 이 파일은 그 10건을 포함한 전량(290건)이다. 새 결정은 계속 STATE.md `### Decisions` 에 쌓인다.」 · 빈 줄 · 묶음들. 묶음 키: 줄이 `^- \[Phase (\d+(?:\.\d+)?)` 또는 `^- Phase (\d+(?:\.\d+)?)` 에 맞으면 그 번호, 정수부를 2자리 0 채움(`1`→`01`, `9`→`09`, `05.1` 그대로, `09-daily-candle-data`→`09`, `10-theme-classification`→`10`, `16 Plan 42`→`16`). 어느 쪽에도 안 맞는 `- ` 줄이 있으면 예외로 중단. 헤딩 `## Phase NN` 은 번호 오름차순(01 · 02 · 04 · 05.1 · 06 · 09 · 09.1 · 09.2 · 10 · 12 · 13 · 14 · 16 · 17 · 18 — 15개), 각 묶음 안은 원문 등장 순서. 헤딩 사이 빈 줄 1개. 해석 근거(Claude 재량): 「phase 별로 묶기」와 「원문 순서 유지」를 동시에 만족하려면 묶음 순서는 phase 순, 묶음 안은 원문 순서여야 한다 — 원문은 Phase 16 이 맨 앞과 중간에 흩어져 있다.

C. `.planning/STATE-ARCHIVE.md`(결정 B4 · C · E): `# STATE 아카이브` · 빈 줄 · 출처 1줄 「출처: `.planning/STATE.md` 에서 2026-09-24 이관(quick-260924-blo). 표 행과 섹션은 원문 그대로다. 현재 상태는 [STATE.md](./STATE.md).」 · 빈 줄 · 아래 네 절을 이 순서·이 헤딩 텍스트 그대로(STATE.md 링크가 앵커로 참조한다):
 - `## Performance Metrics` — 설명 1줄 「Phase 17 이전 By Phase 표 행 전부(원문 순서).」 + 원본 By Phase 헤더·구분선 2줄 + 데이터 87행 그대로.
 - `## Quick Tasks Completed` — 설명 1줄 「STATE.md 에 남긴 최근 10행을 뺀 quick 이력 전부(원문 표 순서).」 + 원본 헤더·구분선 + 최근 10건을 뺀 76행을 원래 표 순서대로.
 - `## 낡은 섹션 원문` — 하위 절 순서: ① 새 헤딩 `### Current Position 원문 — Status · Last activity (2026-09-24 축약 전)` 아래 원본 `Status:` 줄과 `Last activity:` 줄 그대로(각각 한 줄, 빈 줄로 구분) ② 원본 헤딩 4 블록(`### ✅ Phase 17 프로덕션 배포 완결 …` — 펜스 포함) 그대로 ③ 원본 헤딩 10·11·12 블록(Phase 15 · 10 · 9 Production State) 그대로 ④ 원본 헤딩 13·14·15 블록(Phase 1~3 Success Criteria) — 헤딩 줄 3개만 `## ` → `### ` 로 강등(이 절 아래에 들어가야 앵커 구조가 유지된다), 표·본문은 그대로.
 - `## 닫힌 Todo · Blocker` — `### Pending Todos 에서 닫힌 것` 아래 원본 줄 그대로 + 바로 밑 들여쓴 하위 불릿 「  - 닫힘 근거 (2026-09-24): …」, `### Blockers/Concerns 에서 닫힌 것` 도 같은 형식. 닫힌 5건과 근거(결정 E — 파일 행 번호는 grep -n 으로 다시 확인해 실제 값으로 쓴다):
   · 「주말 KIS 실증 테스트 (휴장일 acml_hgpr_date 검증)」 — 2026-05 이전 항목, 낡음. KIS ingestion 은 Phase 09.1(2026-05-15)에서 키움 REST 로 폐기돼 검증 대상이 없다(STATE.md Roadmap Evolution 「Phase 09.1 complete 2026-05-15」).
   · 「DI-01 incr_api_usage REVOKE」 — `supabase/migrations/20260702160000_security_perf_advisor_fixes.sql` 66~68행 `REVOKE EXECUTE ON FUNCTION public.incr_api_usage(text, date, integer)` FROM PUBLIC · anon · authenticated 적용.
   · 「DI-02 smoke-master-sync INV-4 CR 파싱」 — `scripts/smoke-master-sync.sh` 72행 `tr -d '\r'` 로 CR 제거 적용.
   · Blocker 「네이버 종목토론방 SSR vs CSR」 — Phase 8 POC(08-00)에서 JSON API 로 해소(Roadmap Evolution 「Phase 08 complete 2026-04-18 … POC PIVOT」).
   · Blocker 「Cloud Run min-instances=1 월 비용」 — Phase 2 배포(2026-04-13) 시점 항목, 낡음.

D. 새 `.planning/STATE.md`(결정 A · C · D · E) — 아래 순서로 재조립, 각 헤딩 뒤 빈 줄 1개·절 사이 빈 줄 1개:
 1. frontmatter 바이트 그대로 · 원본 `# Project State` 와 `## Project Reference` 블록 그대로.
 2. `## Current Position` — 원본 `Phase:` · `Plan:` · `Plans completed:` 줄 그대로 → 새 `Status:` 한 줄 「Status: 라운드 4 실행 완료 · 재검증(-R4) 대기 · relay 미배포 — 18-36 전량 게이트 green · 18-VALIDATION §Gap Closure R4 7행 전부 닫힘 · TRADE-06~09 Pending 유지」 → 새 줄 「배포 순서: 」 + 원본 Status 줄에서 `· 배포 순서 ` 뒤 꼬리 전체(`DB(완료 · R4 변경 0) → relay(… R4 18-33) → 검증 → webapp push (18-26 webapp 은 relay 18-26 뒤에만 · R4 webapp 새 결합 없음)`) 그대로 → 원본 `Production URL:` 줄 그대로 → `Last activity:` 는 원본 줄을 구분자 ` / 이전: ` 로 잘라 첫 조각만(= `Last activity: 2026-09-23 — Completed quick task 260923-que: ✕ 결과 모름 경고에서 다른 카드가 보여주는 키 제외`) → 빈 줄 → 원본 `Progress:` 줄 → 빈 줄 → 링크 1줄 「Phase 16 갭 클로징 이력: [16-GAP-CLOSURE-LOG.md](./phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md)」. 새 줄 어디에도 `**Status:**` 같은 굵은 필드 형식을 쓰지 않는다(gsd `stateExtractField` 가 평문보다 먼저 잡는다).
 3. 원본 헤딩 4 텍스트 그대로(`### ✅ Phase 17 프로덕션 배포 완결 (2026-09-20 20:31 KST)`) + 요약 불릿 4줄(펜스 없이): 「webapp = relay = `ef1499a`(같은 커밋) · `/healthz` → `status:"ok"` · `vpn:true` · `dma:true` · `stalledCount:0` · `DMA_HOST=10.41.1.120` 보존(미주입).」 / 「`smoke-relay.sh` **PASS 12 · FAIL 0 · SKIP 1**(INV-9 는 `SMOKE_AUTH_TOKEN` 미설정 시 SKIP 이 정상).」 / 「**교훈 — 이 저장소에서 `git push` 는 곧 webapp 프로덕션 배포다.** 배포 순서는 **relay 먼저 → 검증 → push**, 백엔드 배포가 막히면 push 하지 않는다.」 / 「원문(반쪽 배포 25분 경위 · 방화벽 가드 `4225a6f`): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#낡은-섹션-원문)」.
 4. 원본 헤딩 5 블록(`### ★ 그 외 남은 것 1건`) 그대로.
 5. `## Performance Metrics` — 원본 `**Velocity:**` 블록 그대로 → `**By Phase:**` → 빈 줄 → 링크 1줄 「이전 phase 행: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#performance-metrics)」 → 빈 줄 → 원본 By Phase 헤더·구분선 2줄(데이터 행 0 — 원래 87행 전부 Phase 16 이하라 아카이브로 감) → 빈 줄(원본엔 없던 빈 줄 — 표 끝을 분명히 한다) → 원본 `**Per-Plan Metrics:**` 부터 Per-Plan 표 47행 끝까지 그대로.
 6. `## Accumulated Context` → T1 의 relay 링크 줄.
 7. 원본 헤딩 19 블록(`### Roadmap Evolution`) 그대로.
 8. `### Decisions` → 링크 1줄 「전체 결정 로그: [DECISIONS-ARCHIVE.md](./DECISIONS-ARCHIVE.md)」 → 빈 줄 → 원문 마지막 `- [Phase 18]` 10건을 원문 순서로. 서두 템플릿 2줄은 싣지 않는다(결정이 아닌 템플릿 문구 — 검증 허용 예외).
 9. `### Pending Todos` → 링크 1줄 「닫힌 항목(근거 포함): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#닫힌-todo--blocker)」 → 빈 줄 → 남는 4건 원문 그대로, 원문 순서(시크릿 로테이션 · `gh-radar-deployer` SA key · DI-03 · DI-04). DI-03 은 `20260413120100_rls_policies.sql` 에 여전히 `TO anon` 만이라 미해결 — 그대로 둔다.
 10. `### Blockers/Concerns` → 같은 링크 1줄 → 빈 줄 → `None yet.`(gsd add-blocker 가 이 자리표시를 지우고 붙인다).
 11. `### Quick Tasks Completed` → 링크 1줄 「이전 quick 이력: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#quick-tasks-completed)」(`|` 로 시작하면 안 됨) → 빈 줄 → 원본 헤더·구분선 → 최근 10행을 오래된 것부터: `260923-nvr` · `260923-m23` · `260923-onn` · `260923-p3k` · `260923-pgu` · `260923-pgv` · `260923-pq2` · `260923-que` · `85` · `86`. 행은 첫 셀(`#`) 정확 일치로 골라 원문 그대로 옮긴다. 순서 근거(Claude 재량): gsd `appendQuickTaskRow` 가 새 행을 표 끝에 붙이므로 오래된 것→최신 순이어야 이후 행과 시간순이 맞는다. 알려진 부작용(조치 없음): `#` 없이 붙는 fast 행 번호가 행 수 기반이라 12부터 다시 매겨진다 — 아카이브의 51·54·60·85·86 과 당분간 겹치지 않는다.
 12. 원본 헤딩 24 블록(`## Session Continuity`) 그대로.
 결과 예상: 약 216줄 · 약 37KB.

E. verify.py 확장(T1 검사 유지 + 추가, 원본은 BASE):
 - 블록 무손실(부분문자열): 헤딩 6~9 연속 블록 ⊂ 갭 로그 · 헤딩 4 블록 ⊂ 아카이브 · 헤딩 10~12 연속 블록 ⊂ 아카이브 · 헤딩 13~15 연속 블록(헤딩 3줄 `###` 강등본) ⊂ 아카이브 · 원본 Status 줄·Last activity 줄 ⊂ 아카이브 · 원본에서 그대로 남는 블록(Project Reference · ★ · Velocity · Per-Plan 표 전체 · Roadmap Evolution · Session Continuity) ⊂ 새 STATE.md. 비교 전 블록 끝 빈 줄은 뗀다.
 - 전역 줄 커버리지: 원본(frontmatter 포함) 비공백 줄마다 5개 파일 합집합의 줄 집합에 그대로 있거나 `#` 을 앞에 붙인 강등본이 있어야 한다. 허용 예외는 정확히 3줄 — Decisions 서두 2줄 · 헤딩 18 줄(대신 그 텍스트가 relay 문서 출처 줄에 있어야 함). 빠진 줄은 앞 120자를 찍고 FAIL.
 - Decisions: 새 STATE.md `### Decisions` 의 `- ` 줄 = 원문 마지막 `[Phase 18]` 10건과 순서까지 동일 · 아카이브의 `- ` 줄 다중집합 = 원문 290건 · 아카이브 `## Phase NN` 헤딩 15개가 context 의 순서·개수(01:6 … 18:70)와 일치 · 각 묶음 안 순서가 원문 상대 순서와 일치.
 - 메트릭: 새 STATE.md By Phase 표 데이터 0행 · Per-Plan 표 47행이 원문과 순서까지 동일 · 아카이브 `## Performance Metrics` 표 87행이 원문과 순서까지 동일.
 - Quick: 새 STATE.md 10행의 첫 셀 순서 = 위 목록 · 아카이브 76행 = 나머지 원문 순서 · 두 쪽 합 = 원문 86행 다중집합.
 - Todos/Blockers: 새 STATE.md Pending Todos 불릿 = 남는 4건 원문 순서 · Blockers/Concerns 불릿 0 · 아카이브 `## 닫힌 Todo · Blocker` 안에 닫힌 5줄 원문 + 각 줄 바로 밑 「닫힘 근거」 하위 불릿.
 - Current Position: `stateExtractField` 로 뽑은 `Last activity` = 원본 첫 조각, `Status` = 새 Status 문자열, 새 STATE.md 안에 ` / 이전: ` 구분자 0회, `배포 순서:` 줄이 원본 꼬리와 일치. <!-- planner-discipline-allow:  / 이전:  -->
 - 아카이브 앵커: `## Performance Metrics` · `## Quick Tasks Completed` · `## 낡은 섹션 원문` · `## 닫힌 Todo · Blocker` 가 각 1번, 이 순서.
 - 삭제 확인: 원본 헤딩 6~15 · 18 이 새 STATE.md 헤딩 목록에 없음.
 - 크기: `wc -c` 로 원본 바이트 · 새 파일 5개 각 바이트 · 합계를 찍고, 합계 ≥ 원본 바이트(이관은 복사 + 머리글 추가이므로 줄 수 없다). 새 STATE.md 는 230줄 이하 · 50,000 바이트 미만.
 - 무관 파일: `git diff --quiet HEAD -- docs/dma-tunnel-guide.md`.
 과거 PLAN/SUMMARY 가 적어 둔 「`STATE.md` §DMA_HOST 배포 회귀」 같은 참조는 역사 기록이라 고치지 않는다 — 원 헤딩이 이관 문서에 그대로 있어 찾을 수 있다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && python3 .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py && python3 .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py && wc -l -c .planning/STATE.md .planning/STATE-ARCHIVE.md .planning/DECISIONS-ARCHIVE.md .planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md docs/relay-operations.md</automated>
  </verify>
  <done>새 문서 3개(갭 로그 · 결정 아카이브 · STATE 아카이브)가 지정 경로·헤딩·앵커로 생기고, STATE.md 가 결정 A 의 12개 구성으로 약 216줄 · 50KB 미만이 됐으며, verify.py 의 전 검사(블록 무손실 · 전역 줄 커버리지 · Decisions 290/10 · 메트릭 87/0/47 · Quick 76/10 · Todo 4/닫힘 5 · Current Position 필드 · 앵커 · 크기 · 링크 · gsd-tools dry-run · frontmatter)가 PASS(exit 0).</done>
</task>

<task type="auto">
  <name>Task 3: 최종 게이트 + 커밋 1개(7개 경로만 · push 없음)</name>
  <files>.planning/STATE.md, .planning/STATE-ARCHIVE.md, .planning/DECISIONS-ARCHIVE.md, .planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md, docs/relay-operations.md, .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-split.py, .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py</files>
  <read_first>
    - `git status -sb` 출력 · `git log -3 --oneline`
  </read_first>
  <action>
결정 D 의 커밋 규칙대로 마무리한다(worktree 격리 없음 — main tree 에서 직접).

(1) 동시 세션 경합 확인: `git status -sb` 를 다시 본다. `git rev-parse HEAD` 가 BASE 와 다르면, 그 사이 들어온 커밋이 STATE.md 를 바꿨는지 `git diff --quiet BASE HEAD -- .planning/STATE.md .planning/STATE-ARCHIVE.md .planning/DECISIONS-ARCHIVE.md docs/relay-operations.md` 로 본다 — 바뀌었으면 커밋하지 말고 멈춰서 보고한다(다른 세션의 STATE 기록을 덮어쓰게 된다). 우리 7개 경로 밖의 변경·미추적 파일(오케스트레이터의 PLAN.md 등)은 건드리지도 스테이징하지도 않는다.

(2) verify.py 를 한 번 더 돌려 초록인지 확인한다.

(3) 7개 경로만 명시적으로 `git add` 한다(`git add -A`·`git add .` 금지). 커밋 메시지는 한글, 제목 「docs(quick-260924-blo): STATE.md 정리 — 낡은 섹션 이관 · 갭 클로징 로그 · 결정 아카이브 · relay 운영 지식 분리」, 본문에 새 문서 4개 경로와 STATE.md 줄/바이트 전후(966줄 259,838B → 실제 값)를 적는다. Co-Authored-By 줄은 넣지 않는다(사용자 전역 규칙이 우선). 

(4) push 하지 않는다 — 이 저장소에서 push 는 webapp 프로덕션 배포 경로이고, push 여부는 오케스트레이터가 최종 docs 커밋(Quick Tasks 행 추가분) 뒤에 사용자 규칙에 따라 정한다.

(5) SUMMARY 에 남길 것: BASE SHA · 커밋 SHA · wc 전후 표 · verify.py PASS 목록 · Claude 재량 결정 3건(결정 묶음 순서 해석 · Quick 10행 오름차순 · SC 헤딩 `###` 강등) · 알려진 부작용(fast 행 번호 12부터) · verify.py 의 정확 개수 검사(10행 등)는 이 커밋 스냅샷 기준이며 오케스트레이터가 행을 더한 뒤에는 다시 돌리지 않는다는 점.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && python3 .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py && git show --stat --format='%s' HEAD && FILES="$(git show --name-only --format= HEAD)" && test "$(printf '%s\n' "$FILES" | sed '/^$/d' | wc -l | tr -d ' ')" = 7</automated>
  </verify>
  <done>HEAD 커밋 하나에 정확히 7개 경로(STATE.md · STATE-ARCHIVE.md · DECISIONS-ARCHIVE.md · 16-GAP-CLOSURE-LOG.md · docs/relay-operations.md · split.py · verify.py)가 들어갔고, 메시지는 한글 · Co-Authored-By 없음, push 없음, 커밋 직후 verify.py 가 여전히 exit 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 원본 STATE.md → 분할 스크립트 → 새 파일 5개 | 사람이 매일 읽는 기록이 기계 변환을 거친다 — 누락·변형이 곧 기록 손실 |
| 이 세션 ↔ 동시에 도는 다른 Claude 세션 | 같은 main tree 의 STATE.md 를 두 세션이 쓸 수 있다 |
| STATE.md ↔ gsd-tools | 헤딩·표 모양이 바뀌면 이후 append 가 조용히 다른 곳에 쓰거나 실패한다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-blo-01 | Tampering | split.py 이관(원문 누락·변형) | high | mitigate | 원본은 `git show BASE:` 로만 읽고 멱등 재생성 · verify.py 블록 부분문자열 + 전역 비공백 줄 커버리지(허용 예외 3줄 고정) + 표 행 다중집합 비교 · 헤딩 목록 불일치 시 예외 중단 |
| T-blo-02 | Tampering | frontmatter | medium | mitigate | 바이트 그대로 통과 + verify.py 바이트 비교 |
| T-blo-03 | Denial of Service | gsd-tools 헤딩 기반 append(quick 행 · 메트릭 · 결정 · blocker) | high | mitigate | 헤딩 9개·표 헤더 3개 존재 검사 + gsd-core 순수 함수 dry-run(appendQuickTaskRow ok · Per-Plan 헤더 · Decisions H3 · stateExtractField 필드 동등) · 링크 줄은 `|` 로 시작하지 않음 · 굵은 필드 형식 금지 |
| T-blo-04 | Repudiation | 동시 세션 커밋 경합 | medium | mitigate | T1 precondition(blob 53655e5) · T3 커밋 직전 `git status -sb` + BASE..HEAD STATE 변경 검사 · 7개 경로 명시 add(`-A` 금지) |
| T-blo-05 | Information Disclosure | `docs/` 로 옮겨지는 relay 운영 사실(내부 IP·경로) | low | accept | 이미 같은 저장소 `.planning/STATE.md` 에 커밋돼 있던 내용이라 노출 범위 변화 없음 · 시크릿 값은 포함돼 있지 않음 |
| T-blo-06 | Elevation of Privilege | push = webapp 프로덕션 배포 | medium | mitigate | executor 는 push 하지 않음 — 오케스트레이터가 사용자 규칙에 따라 결정 |
</threat_model>

<verification>
- `python3 .planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-verify.py` exit 0 (모든 검사 PASS 출력)
- `wc -l -c` 전후: STATE.md 966줄 · 259,838B → 약 216줄 · 50,000B 미만, 새 파일 5개 합계 ≥ 원본 바이트
- `grep -n '^#' .planning/STATE.md` 에 헤딩 스캐폴드 9개 + `# Project State` · `## Project Reference` · `### ✅ Phase 17 …` · `### ★ …` 만
- `git show --stat HEAD` 에 7개 경로만, push 없음
</verification>

<success_criteria>
- STATE.md 가 결정 A 의 구성으로 줄었고 frontmatter 변경 0
- 결정 B 의 새 문서 4개가 지정 경로·제목·출처 줄·앵커로 존재하고, 옮긴 내용은 원문 그대로(검증 스크립트가 증명)
- 결정 C 의 낡은 섹션 6개가 STATE.md 에서 빠지고 STATE-ARCHIVE.md `## 낡은 섹션 원문` 에 있음
- 결정 D 의 스캐폴드·gsd-tools 호환·무손실·커밋 규칙 충족
- 결정 E 대로 Todo 4건 유지 · 닫힌 5건 근거와 함께 아카이브
</success_criteria>

<output>
Create `.planning/quick/260924-blo-state-md-phase-16-decisions-phase-17/260924-blo-SUMMARY.md` when done
</output>
