#!/usr/bin/env python3
"""quick-260924-blo — STATE.md 분할·재조립 스크립트 .

원본은 언제나 `git show BASE:.planning/STATE.md` 로 읽는다. 작업 트리의 STATE.md 는
입력으로 쓰지 않으므로 몇 번 다시 돌려도 결과가 같다(멱등).
"""
import os
import re
import subprocess
import sys
from collections import OrderedDict

BASE = "6d23e2da3a8c868f763aa19e82a4300810892ff4"
ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()

EXPECTED_HEADINGS = [
    "# Project State",
    "## Project Reference",
    "## Current Position",
    "### ✅ Phase 17 프로덕션 배포 완결 (2026-09-20 20:31 KST)",
    "### ★ 그 외 남은 것 1건",
    "### Phase 16 Gap Closure 3라운드 (2026-09-09, 16-36~16-46)",
    "### Phase 16 Gap Closure 2라운드 (2026-09-09, 16-27~16-35)",
    "### DMA_HOST 배포 회귀 — 발견·수정 (2026-09-09, 갭 클로징 2라운드 직후)",
    "### Phase 16 Gap Closure State (2026-09-09, 16-26)",
    "### Phase 15 Production State (2026-09-08)",
    "### Phase 10 Production State (2026-06-09)",
    "### Phase 9 Production State (2026-05-12 12:24 KST)",
    "## Phase 1 Success Criteria 검증",
    "## Phase 2 Success Criteria 검증",
    "## Phase 3 Success Criteria 검증",
    "## Performance Metrics",
    "## Accumulated Context",
    "### Phase 17 이 남긴 재사용 가능한 사실 (2026-09-20)",
    "### Roadmap Evolution",
    "### Decisions",
    "### Pending Todos",
    "### Blockers/Concerns",
    "### Quick Tasks Completed",
    "## Session Continuity",
]


def die(msg):
    raise SystemExit(f"split.py: 중단 — {msg}")


def load_original():
    raw = subprocess.check_output(["git", "show", f"{BASE}:.planning/STATE.md"], cwd=ROOT).decode("utf-8")
    if raw.startswith("\ufeff") or "\r" in raw or not raw.endswith("\n"):
        die("원본 인코딩/개행 가정(LF · BOM 없음 · 끝 개행) 불일치")
    lines = raw.split("\n")[:-1]
    if lines[0] != "---":
        die("frontmatter 시작 `---` 없음")
    fm_end = lines.index("---", 1)
    frontmatter = "\n".join(lines[: fm_end + 1]) + "\n"
    if not raw.startswith(frontmatter):
        die("frontmatter 바이트 추출 실패")
    body = lines[fm_end + 1 :]
    heads = []
    fence = False
    for i, line in enumerate(body):
        if line.startswith("```"):
            fence = not fence
            continue
        if not fence and re.match(r"^#{1,6} ", line):
            heads.append(i)
    got = [body[i] for i in heads]
    if got != EXPECTED_HEADINGS:
        die(f"헤딩 목록이 계획 시점 24개와 다르다 (got {len(got)}): {got}")
    return raw, frontmatter, body, heads


def trim(lines):
    lines = list(lines)
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


class Doc:
    def __init__(self, body, heads):
        self.body = body
        self.heads = heads

    def span(self, a, b=None):
        """헤딩 a 줄부터 헤딩 b 블록 끝까지(1-based, 포함) — 끝 빈 줄 제거."""
        b = a if b is None else b
        start = self.heads[a - 1]
        end = self.heads[b] if b < len(self.heads) else len(self.body)
        return trim(self.body[start:end])

    def block(self, n):
        return self.span(n)

    def content(self, n):
        """헤딩 n 의 본문(헤딩 줄 제외, 앞뒤 빈 줄 제거)."""
        return trim(self.span(n)[1:])


def write(path, lines):
    text = "\n".join(lines).rstrip("\n") + "\n"
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


QUICK_RECENT = ["260923-nvr", "260923-m23", "260923-onn", "260923-p3k", "260923-pgu",
                "260923-pgv", "260923-pq2", "260923-que", "85", "86"]
TODO_CLOSED = OrderedDict([
    ("- 주말 KIS 실증 테스트 (휴장일 acml_hgpr_date 검증)",
     "  - 닫힘 근거 (2026-09-24): 2026-05 이전 항목이라 낡았다. KIS ingestion 은 Phase 09.1(2026-05-15)에서 키움 REST 로 교체·폐기돼 검증 대상이 없다(STATE.md `### Roadmap Evolution` 「Phase 09.1 complete 2026-05-15」)."),
    ("- DI-01:",
     "  - 닫힘 근거 (2026-09-24): `supabase/migrations/20260702160000_security_perf_advisor_fixes.sql` 66~68행 `REVOKE EXECUTE ON FUNCTION public.incr_api_usage(text, date, integer)` FROM PUBLIC · anon · authenticated 로 적용됐다."),
    ("- DI-02:",
     "  - 닫힘 근거 (2026-09-24): `scripts/smoke-master-sync.sh` 72행 `tr -d '\\r'` 로 CR 제거가 적용됐다."),
])
BLOCKER_CLOSED = OrderedDict([
    ("- 네이버 종목토론방 현재 렌더링 방식(SSR vs CSR)",
     "  - 닫힘 근거 (2026-09-24): Phase 8 POC(08-00)에서 JSON API 로 해소됐다(STATE.md `### Roadmap Evolution` 「Phase 08 complete 2026-04-18 … POC PIVOT」)."),
    ("- Cloud Run min-instances=1 정확한 월 비용",
     "  - 닫힘 근거 (2026-09-24): Phase 2 배포(2026-04-13) 시점 항목이라 낡았다."),
])
TODO_KEEP_PREFIXES = ["- Supabase/KIS/Naver 시크릿 로테이션", "- Infra: `gh-radar-deployer` SA key", "- DI-03:", "- DI-04:"]
DECISION_TEMPLATE = ["Decisions are logged in PROJECT.md Key Decisions table.", "Recent decisions affecting current work:"]
NEW_STATUS = ("Status: 라운드 4 실행 완료 · 재검증(-R4) 대기 · relay 미배포 — 18-36 전량 게이트 green · "
              "18-VALIDATION §Gap Closure R4 7행 전부 닫힘 · TRADE-06~09 Pending 유지")
PHASE17_SUMMARY = [
    "- webapp = relay = `ef1499a`(같은 커밋) · `/healthz` → `status:\"ok\"` · `vpn:true` · `dma:true` · `stalledCount:0` · `DMA_HOST=10.41.1.120` 보존(미주입).",
    "- `smoke-relay.sh` **PASS 12 · FAIL 0 · SKIP 1**(INV-9 는 `SMOKE_AUTH_TOKEN` 미설정 시 SKIP 이 정상).",
    "- **교훈 — 이 저장소에서 `git push` 는 곧 webapp 프로덕션 배포다.** 배포 순서는 **relay 먼저 → 검증 → push**, 백엔드 배포가 막히면 push 하지 않는다.",
    "- 원문(반쪽 배포 25분 경위 · 방화벽 가드 `4225a6f`): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#낡은-섹션-원문)",
]
PERF_BY_PHASE_HEADER = "| Phase | Plans | Duration | Status |"
PERF_PER_PLAN_HEADER = "| Plan | Duration | Tasks | Files |"
QUICK_HEADER = "| # | Description | Date | Commit | Directory |"
CELL_SPLIT = re.compile(r"(?<!\\)\|")


def one(lines, pred, what):
    hits = [l for l in lines if pred(l)]
    if len(hits) != 1:
        die(f"{what}: {len(hits)}개 (1개여야 함)")
    return hits[0]


def decision_key(line):
    m = re.match(r"^- \[Phase (\d+(?:\.\d+)?)", line) or re.match(r"^- Phase (\d+(?:\.\d+)?)", line)
    if not m:
        die(f"phase 를 알 수 없는 결정 줄: {line[:120]}")
    num = m.group(1)
    ip, _, frac = num.partition(".")
    key = f"{int(ip):02d}" + (f".{frac}" if frac else "")
    return key, (int(ip), int(frac) if frac else -1)


def quick_id(row):
    return CELL_SPLIT.split(row)[1].strip()


def main():
    raw, frontmatter, body, heads = load_original()
    d = Doc(body, heads)

    # ── 원본에서 필요한 조각 추출 ─────────────────────────────────────────
    cp = d.content(3)
    ln_phase = one(cp, lambda l: l.startswith("Phase: "), "Phase:")
    ln_plan = one(cp, lambda l: l.startswith("Plan: "), "Plan:")
    ln_plans_done = one(cp, lambda l: l.startswith("Plans completed: "), "Plans completed:")
    ln_status = one(cp, lambda l: l.startswith("Status: "), "Status:")
    ln_url = one(cp, lambda l: l.startswith("Production URL: "), "Production URL:")
    ln_last = one(cp, lambda l: l.startswith("Last activity: "), "Last activity:")
    ln_progress = one(cp, lambda l: l.startswith("Progress: "), "Progress:")
    if ln_status.count("· 배포 순서 ") != 1:
        die("Status 줄의 `· 배포 순서 ` 구분자가 1개가 아님")
    deploy_tail = ln_status.split("· 배포 순서 ", 1)[1]
    last_first = ln_last.split(" / 이전: ")[0]

    pm = d.content(16)
    i_vel = pm.index("**Velocity:**")
    i_byp = pm.index("**By Phase:**")
    i_bph = pm.index(PERF_BY_PHASE_HEADER)
    i_ppm = pm.index("**Per-Plan Metrics:**")
    velocity = trim(pm[i_vel:i_byp])
    by_phase_hs = pm[i_bph:i_bph + 2]
    by_phase_rows = pm[i_bph + 2:i_ppm]
    if not all(r.startswith("|") for r in by_phase_rows) or len(by_phase_rows) != 87:
        die(f"By Phase 데이터 행 {len(by_phase_rows)}개 (87 이어야 함)")
    per_plan = trim(pm[i_ppm:])
    pp_rows = per_plan[per_plan.index(PERF_PER_PLAN_HEADER) + 2:]
    if len(pp_rows) != 47 or not all(r.startswith("| Phase 1") for r in pp_rows):
        die(f"Per-Plan 행 {len(pp_rows)}개 (47 이어야 함)")

    if d.content(17):
        die("## Accumulated Context 직속 본문이 비어 있지 않다")

    dec = [l for l in d.content(20) if l.strip()]
    if dec[:2] != DECISION_TEMPLATE:
        die("Decisions 서두 템플릿 2줄 불일치")
    decisions = dec[2:]
    if len(decisions) != 290 or not all(l.startswith("- ") for l in decisions):
        die(f"결정 {len(decisions)}건 (290 이어야 함)")
    recent_dec = [l for l in decisions if l.startswith("- [Phase 18]")][-10:]

    todos = [l for l in d.content(21) if l.strip()]
    blockers = [l for l in d.content(22) if l.strip()]
    if len(todos) != 7 or len(blockers) != 2 or not all(l.startswith("- ") for l in todos + blockers):
        die("Pending Todos 7 / Blockers 2 가정 불일치")
    todo_closed = [(one(todos, lambda l, p=p: l.startswith(p), p), r) for p, r in TODO_CLOSED.items()]
    blocker_closed = [(one(blockers, lambda l, p=p: l.startswith(p), p), r) for p, r in BLOCKER_CLOSED.items()]
    todo_keep = [l for l in todos if l not in [c for c, _ in todo_closed]]
    if [next(p for p in TODO_KEEP_PREFIXES if l.startswith(p)) for l in todo_keep] != TODO_KEEP_PREFIXES:
        die("남는 Todo 4건 순서 불일치")

    q = d.content(23)
    if q[0] != QUICK_HEADER:
        die("Quick Tasks 헤더 불일치")
    q_hs = q[:2]
    q_rows = q[2:]
    if len(q_rows) != 86 or not all(r.startswith("|") for r in q_rows):
        die(f"Quick 행 {len(q_rows)}개 (86 이어야 함)")
    ncell = len(CELL_SPLIT.split(QUICK_HEADER))
    if any(len(CELL_SPLIT.split(r)) != ncell for r in q_rows):
        die("Quick 행 셀 수 불일치")
    by_id = {}
    for r in q_rows:
        by_id.setdefault(quick_id(r), []).append(r)
    recent_rows = []
    for qid in QUICK_RECENT:
        if len(by_id.get(qid, [])) != 1:
            die(f"quick `{qid}` 행이 정확히 1개가 아님")
        recent_rows.append(by_id[qid][0])
    older_rows = [r for r in q_rows if r not in recent_rows]

    # ── docs/relay-operations.md (결정 B3) ────────────────────────────────
    relay_heading = EXPECTED_HEADINGS[17][len("### "):]
    write("docs/relay-operations.md", [
        "# relay 운영 지식 (Phase 17)",
        "",
        f"출처: `.planning/STATE.md` §「{relay_heading}」에서 2026-09-24 이관(quick-260924-blo) — 본문은 원문 그대로다.",
        "",
        *d.content(18),
    ])

    # ── 16-GAP-CLOSURE-LOG.md (결정 B1) ───────────────────────────────────
    write(".planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md", [
        "# Phase 16 갭 클로징 이력",
        "",
        "출처: `.planning/STATE.md` 에서 2026-09-24 이관(quick-260924-blo) — 아래 4개 절은 원문 그대로다.",
        "Phase 16 갭 클로징 1~3라운드(16-18~16-46)와 DMA_HOST 배포 회귀의 진행·판정 기록. 처리 결과 정본은 `16-VALIDATION.md` §Gap Closure 표다.",
        "",
        *d.span(6, 9),
    ])

    # ── DECISIONS-ARCHIVE.md (결정 B2) ────────────────────────────────────
    groups = OrderedDict()
    order = {}
    for l in decisions:
        key, sort_key = decision_key(l)
        groups.setdefault(key, []).append(l)
        order[key] = sort_key
    da = [
        "# 결정 로그 아카이브",
        "",
        "출처: `.planning/STATE.md` `### Decisions` 에서 2026-09-24 이관(quick-260924-blo). 항목은 원문 그대로이고, phase 별로 묶었으며 각 묶음 안은 원문 순서다.",
        "STATE.md 에는 Phase 18 최근 10건만 남는다 — 이 파일은 그 10건을 포함한 전량(290건)이다. 새 결정은 계속 STATE.md `### Decisions` 에 쌓인다.",
    ]
    for key in sorted(groups, key=lambda k: order[k]):
        da += ["", f"## Phase {key}", "", *groups[key]]
    write(".planning/DECISIONS-ARCHIVE.md", da)

    # ── STATE-ARCHIVE.md (결정 B4 · C · E) ────────────────────────────────
    sc = [("#" + l) if l in EXPECTED_HEADINGS[12:15] else l for l in d.span(13, 15)]
    sa = [
        "# STATE 아카이브",
        "",
        "출처: `.planning/STATE.md` 에서 2026-09-24 이관(quick-260924-blo). 표 행과 섹션은 원문 그대로다. 현재 상태는 [STATE.md](./STATE.md).",
        "",
        "## Performance Metrics",
        "",
        "Phase 17 이전 By Phase 표 행 전부(원문 순서).",
        "",
        *by_phase_hs, *by_phase_rows,
        "",
        "## Quick Tasks Completed",
        "",
        "STATE.md 에 남긴 최근 10행을 뺀 quick 이력 전부(원문 표 순서).",
        "",
        *q_hs, *older_rows,
        "",
        "## 낡은 섹션 원문",
        "",
        "### Current Position 원문 — Status · Last activity (2026-09-24 축약 전)",
        "",
        ln_status,
        "",
        ln_last,
        "",
        *d.block(4),
        "",
        *d.span(10, 12),
        "",
        *sc,
        "",
        "## 닫힌 Todo · Blocker",
        "",
        "### Pending Todos 에서 닫힌 것",
        "",
    ]
    for line, reason in todo_closed:
        sa += [line, reason]
    sa += ["", "### Blockers/Concerns 에서 닫힌 것", ""]
    for line, reason in blocker_closed:
        sa += [line, reason]
    write(".planning/STATE-ARCHIVE.md", sa)

    # ── 새 STATE.md (결정 A · C · D · E) ──────────────────────────────────
    closed_link = "닫힌 항목(근거 포함): [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#닫힌-todo--blocker)"
    st = list(body[: heads[0]])
    st += [*d.block(1), "", *d.block(2), ""]
    st += [
        "## Current Position",
        "",
        ln_phase, ln_plan, ln_plans_done,
        NEW_STATUS,
        "배포 순서: " + deploy_tail,
        ln_url,
        last_first,
        "",
        ln_progress,
        "",
        "Phase 16 갭 클로징 이력: [16-GAP-CLOSURE-LOG.md](./phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md)",
        "",
        EXPECTED_HEADINGS[3],
        "",
        *PHASE17_SUMMARY,
        "",
        *d.block(5),
        "",
        "## Performance Metrics",
        "",
        *velocity,
        "",
        "**By Phase:**",
        "",
        "이전 phase 행: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#performance-metrics)",
        "",
        *by_phase_hs,
        "",
        *per_plan,
        "",
        "## Accumulated Context",
        "",
        "relay 운영 지식(Phase 17 이 남긴 재사용 가능한 사실): [docs/relay-operations.md](../docs/relay-operations.md)",
        "",
        *d.block(19),
        "",
        "### Decisions",
        "",
        "전체 결정 로그: [DECISIONS-ARCHIVE.md](./DECISIONS-ARCHIVE.md)",
        "",
        *recent_dec,
        "",
        "### Pending Todos",
        "",
        closed_link,
        "",
        *todo_keep,
        "",
        "### Blockers/Concerns",
        "",
        closed_link,
        "",
        "None yet.",
        "",
        "### Quick Tasks Completed",
        "",
        "이전 quick 이력: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#quick-tasks-completed)",
        "",
        *q_hs, *recent_rows,
        "",
        *d.block(24),
    ]
    state_text = frontmatter + "\n".join(st).rstrip("\n") + "\n"
    with open(os.path.join(ROOT, ".planning/STATE.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write(state_text)
    print(f"split.py: 완료 — STATE.md {state_text.count(chr(10))}줄 · {len(state_text.encode('utf-8'))}B")


if __name__ == "__main__":
    main()
