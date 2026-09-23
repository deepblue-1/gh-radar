#!/usr/bin/env python3
"""quick-260924-blo — STATE.md 분할 결과 검증 .

검사 하나당 PASS/FAIL 한 줄. 하나라도 FAIL 이면 exit 1.
원본은 `git show BASE:.planning/STATE.md`.
"""
import json
import os
import re
import subprocess
import sys

BASE = "6d23e2da3a8c868f763aa19e82a4300810892ff4"
ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
GSD_LIB = os.path.expanduser("~/.claude/gsd-core/bin/lib")

P_STATE = ".planning/STATE.md"
P_RELAY = "docs/relay-operations.md"
P_ARCH = ".planning/STATE-ARCHIVE.md"
P_DEC = ".planning/DECISIONS-ARCHIVE.md"
P_GAP = ".planning/phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md"
NEW_FILES = [P_STATE, P_ARCH, P_DEC, P_GAP, P_RELAY]

SCAFFOLD_HEADINGS = [
    "## Current Position",
    "## Performance Metrics",
    "## Accumulated Context",
    "### Roadmap Evolution",
    "### Decisions",
    "### Pending Todos",
    "### Blockers/Concerns",
    "### Quick Tasks Completed",
    "## Session Continuity",
]
TABLE_HEADERS = [
    "| Phase | Plans | Duration | Status |",
    "| Plan | Duration | Tasks | Files |",
    "| # | Description | Date | Commit | Directory |",
]
RELAY_HEADING = "### Phase 17 이 남긴 재사용 가능한 사실 (2026-09-20)"

failures = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def split_fm(text):
    lines = text.split("\n")
    end = lines.index("---", 1)
    fm = "\n".join(lines[: end + 1]) + "\n"
    return fm, text[len(fm):]


def headings(text):
    out = []
    fence = False
    for line in text.split("\n"):
        if line.startswith("```"):
            fence = not fence
            continue
        if not fence and re.match(r"^#{1,6} ", line):
            out.append(line)
    return out


def trim(lines):
    lines = list(lines)
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def section_lines(text, heading, stop_level=None):
    """펜스 밖 헤딩 `heading` 의 본문 줄(다음 헤딩 전까지, 레벨 무관)."""
    lines = text.split("\n")
    fence = False
    start = None
    for i, line in enumerate(lines):
        if line.startswith("```"):
            fence = not fence
            continue
        if fence or not re.match(r"^#{1,6} ", line):
            continue
        if start is not None:
            level = len(line) - len(line.lstrip("#"))
            if stop_level is None or level <= stop_level:
                return lines[start:i]
        if line == heading and start is None:
            start = i + 1
    if start is None:
        return None
    return lines[start:]


def slug(text):
    s = text.strip().lower()
    s = re.sub(r"[^\w\- ]", "", s)
    return s.replace(" ", "-")


orig = subprocess.check_output(["git", "show", f"{BASE}:{P_STATE}"], cwd=ROOT).decode("utf-8")
state = read(P_STATE)
relay = read(P_RELAY)
orig_fm, orig_body = split_fm(orig)
state_fm, state_body = split_fm(state)

# ── frontmatter ──────────────────────────────────────────────────────────
check("frontmatter 바이트 동일", orig_fm.encode("utf-8") == state_fm.encode("utf-8"))
check("STATE.md LF · BOM 없음 · 끝 개행 1개",
      "\r" not in state and not state.startswith(chr(0xFEFF)) and state.endswith("\n") and not state.endswith("\n\n"))

# ── 스캐폴드 ─────────────────────────────────────────────────────────────
hs = headings(state)
for h in SCAFFOLD_HEADINGS:
    check(f"스캐폴드 헤딩 1회: {h}", hs.count(h) == 1, f"count={hs.count(h)}")
state_lines = state.split("\n")
for t in TABLE_HEADERS:
    check(f"표 헤더 존재: {t}", state_lines.count(t) >= 1)

# ── relay 경로 ───────────────────────────────────────────────────────────
relay_body = "\n".join(trim(section_lines(orig, RELAY_HEADING)))
check("relay 본문 원문 ⊂ docs/relay-operations.md", relay_body in relay)
check("relay 불릿 10개", sum(1 for l in relay_body.split("\n") if l.startswith("- ")) == 10)
check("relay 헤딩이 STATE.md 에서 빠짐", RELAY_HEADING not in hs)
src_line = [l for l in relay.split("\n") if l.startswith("출처:")]
check("relay 헤딩 텍스트가 출처 줄에 보존", bool(src_line) and RELAY_HEADING[4:] in src_line[0])
check("relay 문서 제목", relay.startswith("# relay 운영 지식 (Phase 17)\n"))
check("docs/dma-tunnel-guide.md 변경 0",
      subprocess.call(["git", "diff", "--quiet", "HEAD", "--", "docs/dma-tunnel-guide.md"], cwd=ROOT) == 0)

# ── 링크 ─────────────────────────────────────────────────────────────────
LINK_FILES = NEW_FILES


def check_links(path):
    text = read(path)
    base = os.path.dirname(os.path.join(ROOT, path))
    links = re.findall(r"\]\((\.\.?/[^)\s]+)\)", text)
    for link in links:
        target, _, anchor = link.partition("#")
        full = os.path.normpath(os.path.join(base, target))
        # 대상은 파일 또는 디렉터리(Quick Tasks 표의 `./quick/<dir>/` 링크) — 앵커는 파일에만.
        exists = os.path.isfile(full) or (os.path.isdir(full) and not anchor)
        ok = exists
        detail = "" if exists else "대상 없음"
        if exists and anchor:
            with open(full, encoding="utf-8") as f:
                slugs = [slug(h.lstrip("#")) for h in headings(f.read())]
            ok = anchor in slugs
            detail = "" if ok else f"앵커 없음 (slugs 일부: {slugs[:8]})"
        check(f"링크 {path} → {link}", ok, detail)
    return len(links)


n_links = sum(check_links(p) for p in LINK_FILES)
state_new_links = [l for l in re.findall(r"\]\((\.\.?/[^)\s]+)\)", state) if not l.startswith("./quick/")]
check("STATE.md 새 상대 링크 = 5종(8개 — 닫힘 링크 2번 · 아카이브 3앵커 · 결정 · 갭 로그 · relay)",
      sorted(set(state_new_links)) == sorted([
          "../docs/relay-operations.md", "./DECISIONS-ARCHIVE.md",
          "./STATE-ARCHIVE.md#performance-metrics", "./STATE-ARCHIVE.md#quick-tasks-completed",
          "./STATE-ARCHIVE.md#낡은-섹션-원문", "./STATE-ARCHIVE.md#닫힌-todo--blocker",
          "./phases/16-trading-limit-chaser-vi-my-page/16-GAP-CLOSURE-LOG.md"]), str(sorted(set(state_new_links))))

# ── gsd-tools 호환 dry-run (순수 함수) ───────────────────────────────────
NODE = r"""
const lib = process.argv[1];
const mt = require(lib + '/markdown-table.cjs');
const ms = require(lib + '/markdown-sectionizer.cjs');
const sd = require(lib + '/state-document.cjs');
const { neu, orig, neuBody, origBody } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = {};
const r = mt.appendQuickTaskRow(neu, { quickId: 'VERIFY', description: 'dry-run', date: '2026-09-24', commit: '-', directory: '—' });
out.appendOk = !!r.ok;
out.appendReason = r.ok ? null : r.reason;
if (r.ok) {
  const c = r.value.content;
  const lines = c.split('\n');
  const rowIdx = lines.indexOf(r.value.row);
  const qIdx = lines.indexOf('### Quick Tasks Completed');
  const sIdx = lines.indexOf('## Session Continuity');
  out.rowBetween = rowIdx > qIdx && rowIdx < sIdx && qIdx >= 0;
  out.rowPrevIsTable = rowIdx > 0 && lines[rowIdx - 1].trim().startsWith('|');
  out.rowPrev = rowIdx > 0 ? lines[rowIdx - 1].slice(0, 40) : null;
}
const pm = ms.collectSection(neu, h => /^performance metrics$/i.test(h.text.trim()));
out.pmHasPerPlan = false;
if (pm) {
  const bl = pm.body.split('\n');
  const i = bl.indexOf('| Plan | Duration | Tasks | Files |');
  out.pmHasPerPlan = i >= 0 && /^\|[-| :]+\|$/.test((bl[i + 1] || '').trim());
}
out.decisionsH3 = ms.tokenizeHeadings(neu).filter(h => h.level === 3 && h.text === 'Decisions').length;
out.fields = {};
for (const f of ['Phase', 'Progress', 'Stopped at', 'Resume file']) {
  out.fields[f] = [sd.stateExtractField(orig, f), sd.stateExtractField(neu, f)];
}
out.bodyFields = {};
for (const f of ['Status', 'Last activity']) {
  out.bodyFields[f] = [sd.stateExtractField(origBody, f), sd.stateExtractField(neuBody, f)];
}
process.stdout.write(JSON.stringify(out));
"""


def gsd_dry_run(neu, orig_text):
    p = subprocess.run(["node", "-e", NODE, GSD_LIB], input=json.dumps({"neu": neu, "orig": orig_text, "neuBody": split_fm(neu)[1], "origBody": split_fm(orig_text)[1]}),
                       capture_output=True, text=True)
    if p.returncode != 0:
        check("gsd dry-run node 실행", False, p.stderr.strip()[:300])
        return None
    return json.loads(p.stdout)


dr = gsd_dry_run(state, orig)
if dr:
    check("gsd appendQuickTaskRow ok", dr["appendOk"], str(dr.get("appendReason")))
    check("gsd 새 quick 행이 Quick Tasks ~ Session Continuity 사이", bool(dr.get("rowBetween")))
    check("gsd 새 quick 행이 기존 표 마지막 행 바로 뒤", bool(dr.get("rowPrevIsTable")), str(dr.get("rowPrev")))
    check("gsd Performance Metrics 안 Per-Plan 헤더+구분선", dr["pmHasPerPlan"])
    check("gsd level-3 Decisions 정확히 1개", dr["decisionsH3"] == 1, str(dr["decisionsH3"]))
    for f, (a, b) in dr["fields"].items():
        check(f"gsd stateExtractField('{f}') 원본과 동일", a == b and a is not None, f"{a!r} != {b!r}")

# ══ T2 — 전체 무손실 · 구조 검사 ═════════════════════════════════════════
arch = read(P_ARCH)
dec_arch = read(P_DEC)
gap = read(P_GAP)
files_text = {p: read(p) for p in NEW_FILES}

ob = orig_body.split("\n")
# 펜스 밖 헤딩만(펜스 안 `#` 줄 오검출 방지)
o_heads = []
_fence = False
for i, l in enumerate(ob):
    if l.startswith("```"):
        _fence = not _fence
        continue
    if not _fence and re.match(r"^#{1,6} ", l):
        o_heads.append(i)
check("원본 헤딩 24개", len(o_heads) == 24, str(len(o_heads)))
O_H = [ob[i] for i in o_heads]


def ospan(a, b=None):
    b = a if b is None else b
    end = o_heads[b] if b < len(o_heads) else len(ob)
    return trim(ob[o_heads[a - 1]:end])


def ocontent(n):
    return trim(ospan(n)[1:])


def joined(lines):
    return "\n".join(lines)


# ── 블록 무손실(부분문자열) ──────────────────────────────────────────────
check("블록: 헤딩 6~9(갭 클로징 4절) ⊂ 16-GAP-CLOSURE-LOG.md", joined(ospan(6, 9)) in gap)
check("블록: 헤딩 4(Phase 17 배포 절, 펜스 포함) ⊂ STATE-ARCHIVE.md", joined(ospan(4)) in arch)
check("블록: 헤딩 10~12(Production State 3절) ⊂ STATE-ARCHIVE.md", joined(ospan(10, 12)) in arch)
sc_demoted = [("#" + l) if l in O_H[12:15] else l for l in ospan(13, 15)]
check("블록: 헤딩 13~15(SC 3절, ### 강등) ⊂ STATE-ARCHIVE.md", joined(sc_demoted) in arch)
o_cp = ocontent(3)
o_status = next(l for l in o_cp if l.startswith("Status: "))
o_last = next(l for l in o_cp if l.startswith("Last activity: "))
arch_lines = arch.split("\n")
check("블록: 원본 Status 줄 ⊂ STATE-ARCHIVE.md", o_status in arch_lines)
check("블록: 원본 Last activity 줄 ⊂ STATE-ARCHIVE.md", o_last in arch_lines)
o_pm = ocontent(16)
o_velocity = trim(o_pm[o_pm.index("**Velocity:**"):o_pm.index("**By Phase:**")])
o_perplan = trim(o_pm[o_pm.index("**Per-Plan Metrics:**"):])
for name, blk in [("Project Reference", ospan(2)), ("★ 그 외 남은 것", ospan(5)), ("Velocity", o_velocity),
                  ("Per-Plan 표 전체", o_perplan), ("Roadmap Evolution", ospan(19)), ("Session Continuity", ospan(24))]:
    check(f"블록: {name} 원문 ⊂ 새 STATE.md", joined(blk) in state)

# ── 전역 줄 커버리지 ─────────────────────────────────────────────────────
union = set()
for txt in files_text.values():
    union.update(txt.split("\n"))
ALLOWED_MISSING = {"Decisions are logged in PROJECT.md Key Decisions table.",
                   "Recent decisions affecting current work:", O_H[17]}
missing = [l for l in orig.split("\n") if l.strip() and l not in union and ("#" + l) not in union]
unexpected = [l for l in missing if l not in ALLOWED_MISSING]
check(f"전역 줄 커버리지: 원본 비공백 줄 전부 존재(허용 예외 3줄, 실제 누락 {len(set(missing))}종)",
      not unexpected and set(missing) == ALLOWED_MISSING,
      "; ".join(l[:120] for l in unexpected[:5]) or f"허용 예외 불일치: {set(missing) ^ ALLOWED_MISSING}")

# ── Decisions ─────────────────────────────────────────────────────────────
o_dec = [l for l in ocontent(20) if l.startswith("- ")]
check("Decisions: 원문 290건", len(o_dec) == 290, str(len(o_dec)))
o_recent = [l for l in o_dec if l.startswith("- [Phase 18]")][-10:]
s_dec = [l for l in trim(section_lines(state, "### Decisions")) if l.startswith("- ")]
check("Decisions: STATE.md = 원문 마지막 [Phase 18] 10건(순서 동일)", s_dec == o_recent)
ids = [re.match(r"^- \[Phase 18\]: (18-\d+)", l).group(1) for l in s_dec] if len(s_dec) == 10 else []
check("Decisions: 10건 plan 순서 18-28×2·30·29·31×2·33·34·35×2",
      ids == ["18-28", "18-28", "18-30", "18-29", "18-31", "18-31", "18-33", "18-34", "18-35", "18-35"], str(ids))
a_dec = [l for l in dec_arch.split("\n") if l.startswith("- ")]
check("Decisions: 아카이브 다중집합 = 원문 290건", sorted(a_dec) == sorted(o_dec))
EXPECTED_GROUPS = [("01", 6), ("02", 1), ("04", 3), ("05.1", 2), ("06", 5), ("09", 5), ("09.1", 32), ("09.2", 4),
                   ("10", 26), ("12", 5), ("13", 9), ("14", 14), ("16", 82), ("17", 26), ("18", 70)]
groups = []
cur = None
for l in dec_arch.split("\n"):
    m = re.match(r"^## Phase (\S+)$", l)
    if m:
        cur = [m.group(1), []]
        groups.append(cur)
    elif l.startswith("- ") and cur is not None:
        cur[1].append(l)
check("Decisions: 아카이브 ## Phase NN 15개 · 순서 · 개수",
      [(k, len(v)) for k, v in groups] == EXPECTED_GROUPS, str([(k, len(v)) for k, v in groups]))
pos = {}
for i, l in enumerate(o_dec):
    pos.setdefault(l, []).append(i)
in_order = all(all(l in pos for l in v) and [min(pos[l]) for l in v] == sorted(min(pos[l]) for l in v) for _, v in groups)
check("Decisions: 각 묶음 안 순서 = 원문 상대 순서", in_order)
check("Decisions: 아카이브 서두에 `- ` 불릿 없음(결정 줄만 `- `)", len(a_dec) == 290)

# ── Performance Metrics ──────────────────────────────────────────────────


def table_rows(lines, header):
    """header 줄 다음 구분선 뒤의 연속 `|` 행."""
    i = lines.index(header)
    rows = []
    for l in lines[i + 2:]:
        if not l.startswith("|"):
            break
        rows.append(l)
    return rows


s_pm = section_lines(state, "## Performance Metrics", stop_level=2)
o_bp = table_rows(o_pm, "| Phase | Plans | Duration | Status |")
o_pp = table_rows(o_pm, "| Plan | Duration | Tasks | Files |")
check("메트릭: 원본 By Phase 87행 · Per-Plan 47행", len(o_bp) == 87 and len(o_pp) == 47, f"{len(o_bp)}/{len(o_pp)}")
check("메트릭: 새 STATE.md By Phase 데이터 0행", table_rows(s_pm, "| Phase | Plans | Duration | Status |") == [])
check("메트릭: 새 STATE.md Per-Plan 47행 원문·순서 동일", table_rows(s_pm, "| Plan | Duration | Tasks | Files |") == o_pp)
a_pm = section_lines(arch, "## Performance Metrics", stop_level=2)
check("메트릭: 아카이브 By Phase 87행 원문·순서 동일", table_rows(a_pm, "| Phase | Plans | Duration | Status |") == o_bp)

# ── Quick Tasks ──────────────────────────────────────────────────────────
QH = "| # | Description | Date | Commit | Directory |"
CELL = re.compile(r"(?<!\\)\|")
o_q = table_rows(ocontent(23), QH)
s_q = table_rows(section_lines(state, "### Quick Tasks Completed"), QH)
a_q = table_rows(section_lines(arch, "## Quick Tasks Completed", stop_level=2), QH)
RECENT = ["260923-nvr", "260923-m23", "260923-onn", "260923-p3k", "260923-pgu",
          "260923-pgv", "260923-pq2", "260923-que", "85", "86"]
check("Quick: 원본 86행", len(o_q) == 86, str(len(o_q)))
check("Quick: 새 STATE.md 10행 첫 셀 순서", [CELL.split(r)[1].strip() for r in s_q] == RECENT,
      str([CELL.split(r)[1].strip() for r in s_q]))
check("Quick: 아카이브 76행 = 나머지 원문 순서", a_q == [r for r in o_q if r not in s_q] and len(a_q) == 76, str(len(a_q)))
check("Quick: 두 쪽 합 = 원문 86행 다중집합", sorted(s_q + a_q) == sorted(o_q))
q_sec = trim(section_lines(state, "### Quick Tasks Completed"))
check("Quick: 링크 줄은 `|` 로 시작하지 않고 표가 섹션 끝", not q_sec[0].startswith("|") and q_sec[-1] == s_q[-1])

# ── Todos / Blockers ─────────────────────────────────────────────────────
o_todo = [l for l in ocontent(21) if l.startswith("- ")]
o_blk = [l for l in ocontent(22) if l.startswith("- ")]
KEEP = ["- Supabase/KIS/Naver 시크릿 로테이션", "- Infra: `gh-radar-deployer` SA key", "- DI-03:", "- DI-04:"]
o_keep = [l for l in o_todo if any(l.startswith(k) for k in KEEP)]
o_closed = [l for l in o_todo if l not in o_keep] + o_blk
s_todo = [l for l in section_lines(state, "### Pending Todos") if l.startswith("- ")]
check("Todo: 새 STATE.md Pending Todos = 남는 4건 원문 순서", s_todo == o_keep and len(o_keep) == 4)
s_blk_sec = trim(section_lines(state, "### Blockers/Concerns"))
check("Blocker: 새 STATE.md 불릿 0 · `None yet.`",
      not [l for l in s_blk_sec if l.startswith("- ")] and s_blk_sec[-1] == "None yet.")
a_closed = section_lines(arch, "## 닫힌 Todo · Blocker", stop_level=2) or []
ok = len(o_closed) == 5
for l in o_closed:
    if l not in a_closed:
        ok = False
        continue
    i = a_closed.index(l)
    ok = ok and i + 1 < len(a_closed) and a_closed[i + 1].startswith("  - 닫힘 근거 (2026-09-24): ")
check("Todo/Blocker: 닫힌 5줄 원문 + 바로 밑 「닫힘 근거」 하위 불릿", ok)

# ── Current Position ─────────────────────────────────────────────────────
NEW_STATUS = ("라운드 4 실행 완료 · 재검증(-R4) 대기 · relay 미배포 — 18-36 전량 게이트 green · "
              "18-VALIDATION §Gap Closure R4 7행 전부 닫힘 · TRADE-06~09 Pending 유지")
if dr:
    o_last_v, s_last_v = dr["bodyFields"]["Last activity"]
    check("Current Position: Last activity = 원본 첫 조각", s_last_v == o_last_v.split(" / 이전: ")[0], repr(s_last_v))
    check("Current Position: Status = 새 Status", dr["bodyFields"]["Status"][1] == NEW_STATUS,
          repr(dr["bodyFields"]["Status"][1]))
check("Current Position: 새 STATE.md 에 ` / 이전: ` 0회", state.count(" / 이전: ") == 0)
tail = o_status.split("· 배포 순서 ", 1)[1]
check("Current Position: `배포 순서:` 줄 = 원본 꼬리", ("배포 순서: " + tail) in state_lines)
check("Current Position: 굵은 필드(**Status:** 류) 새로 만들지 않음",
      not re.search(r"\*\*(Status|Last activity|Phase|Plan|Progress|Stopped at):\*\*", state))

# ── 아카이브 앵커 ────────────────────────────────────────────────────────
a_h2 = [h for h in headings(arch) if h.startswith("## ")]
check("아카이브 앵커 4개 · 각 1번 · 순서",
      a_h2 == ["## Performance Metrics", "## Quick Tasks Completed", "## 낡은 섹션 원문", "## 닫힌 Todo · Blocker"],
      str(a_h2))

# ── 삭제 확인 ────────────────────────────────────────────────────────────
gone = [O_H[i] for i in list(range(5, 15)) + [17]]
check("삭제: 원본 헤딩 6~15 · 18 이 새 STATE.md 에 없음", not [h for h in gone if h in hs])
check("STATE.md 헤딩 = 스캐폴드 9 + Project State · Reference · Phase 17 · ★",
      sorted(hs) == sorted(SCAFFOLD_HEADINGS + [O_H[0], O_H[1], O_H[3], O_H[4]]), str(hs))

# ── 크기 ─────────────────────────────────────────────────────────────────
o_bytes = len(orig.encode("utf-8"))
sizes = {p: (txt.count("\n"), len(txt.encode("utf-8"))) for p, txt in files_text.items()}
print(f"      원본 STATE.md: {orig.count(chr(10))}줄 · {o_bytes}B")
for p, (n, b) in sizes.items():
    print(f"      {p}: {n}줄 · {b}B")
total = sum(b for _, b in sizes.values())
print(f"      합계: {total}B")
check("크기: 새 파일 5개 합계 ≥ 원본 바이트", total >= o_bytes, f"{total} < {o_bytes}")
check("크기: 새 STATE.md ≤ 230줄 · < 50,000B", sizes[P_STATE][0] <= 230 and sizes[P_STATE][1] < 50000, str(sizes[P_STATE]))
check("파일 머리: 갭 로그 · 결정 아카이브 · STATE 아카이브 제목",
      gap.startswith("# Phase 16 갭 클로징 이력\n") and dec_arch.startswith("# 결정 로그 아카이브\n")
      and arch.startswith("# STATE 아카이브\n"))
for p, txt in files_text.items():
    check(f"인코딩: {p} LF · BOM 없음 · 끝 개행 1개",
          "\r" not in txt and not txt.startswith(chr(0xFEFF)) and txt.endswith("\n") and not txt.endswith("\n\n"))

print()
if failures:
    print(f"verify.py: FAIL {len(failures)}건")
    sys.exit(1)
print("verify.py: 전부 PASS")
