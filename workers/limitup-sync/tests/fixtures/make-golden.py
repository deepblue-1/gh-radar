"""파생 2표 골든 — gh-trade 보고서 함수로 픽스처 하루의 기대값을 만든다(28-06 · RESEARCH Pitfall 11).

실행(CI 에서 돌리지 않는다 — 출력 JSON 을 커밋한다):
    /Users/alex/repos/gh-trade/server/tools/analysis/.venv/bin/python \
        workers/limitup-sync/tests/fixtures/make-golden.py

gh-trade `server/tools/analysis` 를 sys.path 에 넣어 `tickana.report` · `tickana.facts` 를 그대로 import 한다
(gh-trade 파일은 읽기만). 출력: `export/20261002/expected-derive.json`
    { member_daily: [{ member, name, n, entry_sum, entry_cnt, lock_buy_sum, lock_buy_cnt,
                       pre_sell_sum, pre_sell_cnt, lead, n_broke, n_lock, n_held }],   # 회원번호 정렬
      grid_summary: [{ isin, q_max_krw, q_max_ms, sell_share_60s }] }               # isin 정렬

정의 출처: report.py `fingerprint_agg`(창구 기여분) · `_sell_share_after` + `_sec(min start_ns)`(+60초 매도) ·
`max(q_krw) FROM grid`(최대 잔량 — 여기서는 export 격자 coarse ∪ fine). `name` · `q_max_ms` 는 gh-radar 쪽
보조 열(창구 alloc 행의 마지막 non-null name · 최대 잔량 점의 t_ms, 동률은 이른 시각)이다.

**int64 넘침 보정(28-06 발견 · gh-trade 에 알릴 것).** gh-trade `facts.member_top` 은
`d_value.astype("int64") * ov`(ov = 겹친 길이 ns)를 numpy int64 로 곱한다. d_value 10억 × 겹침 60초(6e10 ns)
= 6e19 > 2^63 이라 값이 조용히 감겨(wrap) 비중이 틀린다 — 이 픽스처 하루에서도 창구 5곳의 숫자가 갈린다.
docstring 정의(「d_value 를 겹친 길이 ÷ 구간 길이로 가중」)는 그대로 두고 곱셈만 float64 로 하는 `member_top_f64` 로
`tickana.report.member_top` 을 바꿔 끼운 뒤 `fingerprint_agg` 를 부른다. 원본(int64)과 갈리는 창구는 실행 때
stderr 에 찍는다 — gh-trade 가 같은 한 줄(float 곱셈)을 고치면 두 값이 같아진다.
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

GH_TRADE_ANALYSIS = Path("/Users/alex/repos/gh-trade/server/tools/analysis")
sys.path.insert(0, str(GH_TRADE_ANALYSIS))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import tickana.report as report  # noqa: E402
from tickana.facts import member_top as member_top_int64  # noqa: E402
from tickana.report import _sec, _sell_share_after, fingerprint_agg  # noqa: E402


def member_top_f64(alloc, side, lo, hi, n=3):
    """facts.member_top 원문과 같다 — 가중 곱셈만 float64(int64 넘침 방지)."""
    if alloc is None or not len(alloc):
        return []
    a = alloc[alloc["side"] == side]
    if not len(a):
        return []
    s, e = a["start_ns"].astype("int64").to_numpy(), a["end_ns"].astype("int64").to_numpy()
    ov = np.clip(np.minimum(e, int(hi)) - np.maximum(s, int(lo)), 0, None)
    w = a["d_value"].astype("float64").to_numpy() * ov.astype("float64") / np.maximum(e - s, 1)
    names = {str(m): (None if pd.isna(nm) else str(nm)) for m, nm in zip(a["member"], a["name"])}
    by = pd.Series(w, index=a["member"].astype(str).to_numpy()).groupby(level=0).sum()
    by = by[by > 0]
    if not len(by):
        return []
    tot = float(by.sum())
    ranked = sorted(by.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    return [(m, names.get(m), v / tot) for m, v in ranked]

HERE = Path(__file__).resolve().parent
DAY = HERE / "export" / "20261002"
DATE = "20261002"
MS_TO_NS = 1_000_000


def read_tbl(name: str) -> pd.DataFrame:
    with gzip.open(DAY / f"{name}.ndjson.gz", "rt", encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    df = pd.DataFrame(rows)
    # gh-trade 함수는 *_ns 열을 기대한다 — ms × 1e6 을 정수 그대로(nullable Int64 · float 반올림 없음).
    for col in [c for c in df.columns if c.endswith("_ms")]:
        raw = [r.get(col) for r in rows]  # DataFrame 열(float NaN)이 아니라 원문 값에서 — 정수 그대로
        df[col[:-3] + "_ns"] = pd.array([None if v is None else int(v) * MS_TO_NS for v in raw], dtype="Int64")
    if "detect_rate_pct" in df.columns:
        df["detect_rate_pct"] = pd.array([r.get("detect_rate_pct") for r in rows], dtype="Int64")
    return df


entries = read_tbl("entries")
locks = read_tbl("locks")
alloc = read_tbl("member_alloc")

# ⓐ 창구 기여분 — fingerprint_agg 를 날짜 하루로 부르고 sum · cnt 로 접는다(지문표 평균 = 90일 SUM ÷ SUM).
with np.errstate(over="ignore"):
    report.member_top = member_top_int64
    agg_int64 = fingerprint_agg(alloc, locks, entries, DATE)
report.member_top = member_top_f64
agg = fingerprint_agg(alloc, locks, entries, DATE)
report.member_top = member_top_int64
diverged = sorted(
    m for m in set(agg) | set(agg_int64)
    if m not in agg or m not in agg_int64
    or any(abs(sum(agg[m][k]) - sum(agg_int64[m][k])) > 1e-12 for k in ("entry", "lock_buy", "pre_sell"))
    or any(agg[m][k] != agg_int64[m][k] for k in ("n", "lead", "n_broke", "n_lock", "n_held"))
)
if diverged:
    print(f"[int64 넘침] gh-trade member_top 원본과 갈리는 창구 {len(diverged)}곳: {diverged}", file=sys.stderr)
names: dict[str, str | None] = {}
for m, nm in zip(alloc["member"].astype(str), alloc["name"]):
    if nm is not None and not pd.isna(nm):
        names[m] = str(nm)
member_daily = []
for m in sorted(agg):
    x = agg[m]
    member_daily.append(
        dict(
            member=m,
            name=names.get(m),
            n=x["n"],
            entry_sum=float(sum(x["entry"])),
            entry_cnt=len(x["entry"]),
            lock_buy_sum=float(sum(x["lock_buy"])),
            lock_buy_cnt=len(x["lock_buy"]),
            pre_sell_sum=float(sum(x["pre_sell"])),
            pre_sell_cnt=len(x["pre_sell"]),
            lead=int(x["lead"]),
            n_broke=int(x["n_broke"]),
            n_lock=int(x["n_lock"]),
            n_held=int(x["n_held"]),
        )
    )

# ⓑ 격자 요약 — fine 창을 sec + cols DataFrame 으로 펼쳐 _sell_share_after(fine, _sec(min start_ns)).
grid_summary = []
for p in sorted((DAY / "grid").glob("*.json.gz")):
    g = json.load(gzip.open(p, "rt", encoding="utf-8"))
    isin = g["isin"]
    frames = [pd.DataFrame({"sec": w["sec"], **w["cols"]}) for w in g["fine"]["windows"]]
    fine = pd.concat(frames, ignore_index=True).drop_duplicates("sec", keep="first") if frames else pd.DataFrame()
    coarse = pd.DataFrame({"sec": g["coarse"]["sec"], **g["coarse"]["cols"]})
    lk = locks[locks["isin"] == isin]
    s60 = None
    if len(lk) and pd.notna(lk["start_ns"].min()):
        s0 = _sec(lk["start_ns"].min())
        s60 = _sell_share_after(fine[(fine["sec"] >= s0 + 1) & (fine["sec"] <= s0 + 60)] if len(fine) else fine, s0)
    pts = pd.concat([coarse[["t_ms", "q_krw"]], fine[["t_ms", "q_krw"]]] if len(fine) else [coarse[["t_ms", "q_krw"]]])
    pts = pts[pts["q_krw"].notna()]
    if len(pts):
        q_max = pts["q_krw"].max()
        q_max_ms = int(pts[pts["q_krw"] == q_max]["t_ms"].min())
        q_max = int(q_max)
    else:
        q_max, q_max_ms = None, None
    grid_summary.append(dict(isin=isin, q_max_krw=q_max, q_max_ms=q_max_ms, sell_share_60s=s60))

out = dict(member_daily=member_daily, grid_summary=grid_summary)
(DAY / "expected-derive.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"member_daily {len(member_daily)} · grid_summary {len(grid_summary)}")
for r in grid_summary:
    print(r)
