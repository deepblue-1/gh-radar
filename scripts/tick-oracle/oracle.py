"""틱 디코더 오라클 생성기 (Phase 37 D-19 — gh-radar TS 디코더 골든 픽스처).

목적: gh-trade tickana 의 파이썬 정본(LAYOUTS · pcap2parquet)을 돌려 gh-radar `packages/shared/src/ticks/` 의
TS 이식이 같은 결과를 내는지 대조할 픽스처를 만든다. 「이식은 창작이 아니라 번역」 — 기대값을 손으로 쓰지 않는다.

정본(2026-11-02 원문 기준 — 어긋나면 함수 이름으로 찾는다):
  gh-trade server/tools/analysis/tickana/packets.py:34-275   Field · Layout · check_layout · LAYOUTS
  gh-trade server/tools/analysis/tickana/pcap2parquet.py:34-43  _REC · _GHDR · PCAP_MAGIC_NS
  gh-trade server/tools/analysis/tickana/pcap2parquet.py:84-101 output_stem(라벨 = 부모 디렉터리 이름) · target_path
  gh-trade server/tools/analysis/tickana/pcap2parquet.py:230-345 convert_file · 레코드 루프 · 이더넷/IPv4/UDP 벗김
  gh-trade server/tools/analysis/README.md 「Parquet 표 스키마」
  gh-trade server/tools/analysis/tickana/teamflow.py:68-86 load_day_parquet · :96-134 classify_orders · :242-258 prepare_frame
  gh-trade server/tools/analysis/tickana/nxt_runs.py:44-127 load_g1 · tag_runs · run_stats · :172-182 summary_line
  gh-trade server/tools/analysis/tickana/nxt_fixture.py:94-134 TeamOrder · classify_nxt_team_orders · :434-446 nxt_window
  gh-trade server/tools/analysis/tickana/teamflow.py:650-699 team_pnl · :259-277 analyze_stock last_px
  gh-trade server/tools/analysis/tickana/teamflow_accum.py:282-300 load_day_a3 · :470-485 last_px · prepare_frame 호출

부명령:
  layouts --out <json>
      LAYOUTS 를 {"<tag>:<size>": [[name, offset, length, kind], …]} 로 덤프(키 정렬 · 들여쓰기 1).
  decode <pcap.zst> --label krx|nxt [--limit N] --out-prefix <경로 접두>
      ① pcap2parquet.convert_file 로 표별 Parquet 를 만든다(정본 출력).
      ② 같은 파일을 같은 레코드 규칙 · 같은 프레임 수 상한으로 읽어 UDP 페이로드마다
         `<IIII>`(ts_s, ts_ns, plen, plen) + payload 를 이어 붙여 zstd-19 로 <접두>.ticks.zst 에 쓴다
         (전역 헤더 없음 — gh-radar 격자 파일 형식 `pcapns-rec+zstd/1`).
      ③ 표마다 {rows, columns: {<열>: {sha256, nulls}}, head: [앞 30행 canon 값]} 을 <접두>.decode.json 에 쓴다.
         dst_ip · dst_port 는 뺀다(레코드 프레이밍에 IP/포트가 없다).
  orders <pcap.zst> --out <json>                                    (37-03 Task 1)
      컷 KRX pcap → convert_file → teamflow.load_day_parquet 와 같은 열 · 조건(`board_id='G1' and exchange='KRX'`
      · `order by isin, msg_seq`) → teamflow.prepare_frame → 주문별 [msg_seq, oid, kind, team] JSON.
      (isin, msg_seq) 동률이 있으면 duckdb 정렬이 비결정이라 종료 1.
  runs --krx <pcap.zst> --nxt <pcap.zst> --out <json>                 (37-03 Task 2)
      컷 KRX · NXT 각각 → nxt_runs.load_g1 → tag_runs → run_stats → summary_line + 런별 통계 행.
  window <nxt pcap.zst> --from HH:MM:SS --to HH:MM:SS --out <json> [--expect N,BQ,BV,SQ,SV]   (37-03 Task 2)
      NXT nxt_fixture.nxt_window(마지막 조각 시각 µs 양끝 포함) → classify_nxt_team_orders → 팀 주문 · 매수/매도 합.
      --expect 와 다르면 종료 1(AccumNxtFixtures.h kAccumNxt_Expect 원천 확인).
  pnl --isin I --date D --pcap-dir DIR --export EXPDIR --out-prefix P [--hours HHMM,…]   (37-03 Task 3)
      시간 파일(이름순)에서 그 ISIN 의 A3 전문만(태그 A3 · 오프셋 17 ISIN · 길이 무관) 레코드 프레이밍으로 이어 <P>-a3.ticks.zst.
      같은 레코드로 합성 pcap 을 만들어 convert_file → teamflow · accum 두 범위 prepare_frame → team_pnl 을 다시 계산하고,
      export team_flow · accum_flow 의 그 ISIN payload.pnl 과 다르면 종료 1(원천 확인). <P>.pnl.json = export 원문.
  g4cut --isin I --date D --pcap-dir DIR --hours HHMM,… --out-prefix P                     (37-03 Task 3)
      pnl 과 같은 추출 → <P>.ticks.zst · 두 범위(accum = G1+G4 (t, seq) 순 · teamflow = G1 seq 순) 주문별 행 + team_pnl
      → <P>.golden.json. 범위 안 G4 체결이 0 이면 종료 1(골든이 아니다 — 시간을 넓혀 다시).

정규화(canon) — TS `packages/shared/src/__tests__/helpers/tick-digest.ts` 와 한 글자도 다르지 않게:
  null/NaN → "~" · bool → "1"/"0" · 정수 → 10진 문자열 · 부동소수(dec6) → format(v, ".6f") · 문자열 → 그대로.
  열 digest = 행 순서대로 canon 값을 "\\n" 으로 이은 UTF-8 의 sha256 hex.
  head 의 값도 canon 문자열이다(recv_ns 가 2^53 을 넘어 JSON 숫자로 두면 TS 에서 뭉개진다).

실행(맥 전용 — gh-trade venv · 로컬 원본 pcap 이 있어야 한다. 생성물만 커밋하고 원본은 커밋하지 않는다):
  bash scripts/tick-oracle/gen-fixtures.sh decode
  "$GH_TRADE_ANALYSIS/.venv/bin/python" -I scripts/tick-oracle/oracle.py layouts --out <json>
환경변수: GH_TRADE_ANALYSIS(기본 /Users/alex/repos/gh-trade/server/tools/analysis)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import sys
import tempfile
from pathlib import Path

GH_TRADE_ANALYSIS = os.environ.get("GH_TRADE_ANALYSIS", "/Users/alex/repos/gh-trade/server/tools/analysis")
sys.path.insert(0, GH_TRADE_ANALYSIS)

import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402
from compression import zstd  # noqa: E402  (Python 3.14 표준)

from tickana import nxt_fixture, nxt_runs, packets, pcap2parquet, teamflow  # noqa: E402
from tickana.teamflow_fixture import parse_hms_us  # noqa: E402

HEAD_ROWS = 30
DROP_COLUMNS = ("dst_ip", "dst_port")
_REC = struct.Struct("<IIII")
_UDP = struct.Struct(">HHH")


# ---------------------------------------------------------------------------
# layouts
# ---------------------------------------------------------------------------


def cmd_layouts(a: argparse.Namespace) -> int:
    dump = {
        f"{t}:{s}": [[f.name, f.offset, f.length, f.kind] for f in lay.fields]
        for (t, s), lay in packets.LAYOUTS.items()
    }
    text = json.dumps(dump, sort_keys=True, indent=1, ensure_ascii=False) + "\n"
    Path(a.out).write_text(text, encoding="utf-8")
    print(f"[oracle] layouts → {a.out} ({len(dump)} 레이아웃)", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# decode
# ---------------------------------------------------------------------------


def extract_records(path: Path, limit: int | None) -> tuple[bytes, int, int]:
    """pcap2parquet.convert_file 레코드 루프(:268-334)와 같은 규칙 · 같은 프레임 수 상한으로 UDP 페이로드를 뽑아
    레코드 프레이밍(<IIII> + payload) 바이트를 돌려준다. (바이트, 프레임 수, 레코드 수)."""
    out = bytearray()
    frames = 0
    records = 0
    with pcap2parquet._open(path) as f:
        pcap2parquet._read_global_header(f)
        tail = b""
        stop = False
        while not stop:
            chunk = f.read(pcap2parquet.CHUNK)
            if not chunk:
                break
            buf = tail + chunk if tail else chunk
            n = len(buf)
            pos = 0
            while pos + 16 <= n:
                ts_s, ts_ns, incl, _orig = _REC.unpack_from(buf, pos)
                fr = pos + 16
                end = fr + incl
                if end > n:
                    break
                pos = end
                frames += 1
                if incl < 14 or buf[fr + 12] != 0x08 or buf[fr + 13] != 0x00:
                    pass  # non_ipv4
                elif incl < 34 or buf[fr + 23] != 17:
                    pass  # bad_frame · non_udp
                else:
                    ihl = (buf[fr + 14] & 0x0F) * 4
                    udp = fr + 14 + ihl
                    if ihl < 20 or udp + 8 > end:
                        pass  # bad_frame
                    else:
                        _sp, _dport, ulen = _UDP.unpack_from(buf, udp)
                        p = udp + 8
                        q = udp + ulen
                        if ulen < 8 or q > end:
                            pass  # bad_frame
                        else:
                            plen = q - p
                            out += _REC.pack(ts_s, ts_ns, plen, plen)
                            out += buf[p:q]
                            records += 1
                if limit is not None and frames >= limit:
                    stop = True
                    break
            tail = buf[pos:]
    return bytes(out), frames, records


def canon(v: object) -> str:
    if v is None:
        return "~"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if math.isnan(v):
            return "~"
        return format(v, ".6f")
    if isinstance(v, str):
        return v
    raise TypeError(f"canon: 알 수 없는 값 {type(v).__name__} {v!r}")


def column_digest(values: list[str]) -> str:
    return hashlib.sha256("\n".join(values).encode("utf-8")).hexdigest()


def table_summary(t: pa.Table) -> dict:
    names = [n for n in t.column_names if n not in DROP_COLUMNS]
    cols: dict[str, dict] = {}
    canon_cols: dict[str, list[str]] = {}
    for name in names:
        vals = [canon(v) for v in t.column(name).to_pylist()]
        canon_cols[name] = vals
        cols[name] = {"sha256": column_digest(vals), "nulls": sum(1 for v in vals if v == "~")}
    head = [{name: canon_cols[name][i] for name in names} for i in range(min(HEAD_ROWS, t.num_rows))]
    return {"rows": t.num_rows, "columns": cols, "head": head}


def cmd_decode(a: argparse.Namespace) -> int:
    src = Path(a.input).expanduser().resolve()
    prefix = Path(a.out_prefix)
    prefix.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tick-oracle-") as tmp:
        tmpd = Path(tmp)
        link_dir = tmpd / a.label
        link_dir.mkdir()
        link = link_dir / src.name  # pcap2parquet output_stem 은 부모 디렉터리 이름을 라벨로 쓴다
        link.symlink_to(src)
        out = tmpd / "out"
        counters = pcap2parquet.convert_file(link, out, limit=a.limit, force=True, log=False)

        data, frames, records = extract_records(link, a.limit)
        if frames != counters["packets"]:
            print(f"[oracle] 프레임 수 불일치 — 추출 {frames} ≠ pcap2parquet {counters['packets']}", file=sys.stderr)
            return 1

        tables: dict[str, dict] = {}
        total_rows = 0
        for table in pcap2parquet.ALL_TABLES:
            p = pcap2parquet.target_path(out, table, counters["date"], counters["label"], counters["hhmm"])
            if not p.exists():
                continue
            t = pq.read_table(p)
            tables[table] = table_summary(t)
            total_rows += t.num_rows
        if total_rows != records:
            print(f"[oracle] 레코드 수 불일치 — 추출 {records} ≠ 표 행 합 {total_rows}", file=sys.stderr)
            return 1

    zst_path = prefix.with_name(prefix.name + ".ticks.zst")
    zst_path.write_bytes(zstd.compress(data, level=19))
    doc = {
        "source": {
            "file": src.name,
            "label": a.label,
            "limit": a.limit,
            "frames": frames,
            "records": records,
            "counters": {
                k: counters[k] for k in ("non_ipv4", "non_udp", "bad_frame", "truncated")
            },
        },
        "tables": tables,
    }
    json_path = prefix.with_name(prefix.name + ".decode.json")
    json_path.write_text(json.dumps(doc, sort_keys=True, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    rows = " ".join(f"{k}={v['rows']}" for k, v in tables.items())
    print(
        f"[oracle] decode {src.name} label={a.label} frames={frames} records={records} {rows} "
        f"non_ipv4={counters['non_ipv4']} non_udp={counters['non_udp']} bad_frame={counters['bad_frame']}",
        file=sys.stderr,
    )
    return 0


# ---------------------------------------------------------------------------
# 공용 (37-03) — 임시 라벨 디렉터리 변환 · 짧은 행 JSON
# ---------------------------------------------------------------------------


def convert_into(src: Path, label: str, tmpd: Path, out: Path) -> dict:
    """src 를 <tmpd>/<label>/ 아래 심볼릭 링크로 두고(pcap2parquet output_stem 은 부모 디렉터리 이름을 라벨로 쓴다)
    convert_file 로 <out> 에 표별 Parquet 를 만든다. 카운터를 돌려준다."""
    link_dir = tmpd / label
    link_dir.mkdir(exist_ok=True)
    link = link_dir / src.name
    link.symlink_to(src)
    return pcap2parquet.convert_file(link, out, force=True, log=False)


def table_file(out: Path, table: str, counters: dict) -> Path:
    return pcap2parquet.target_path(out, table, counters["date"], counters["label"], counters["hhmm"])


def _json_enc(v: object, ind: int) -> str:
    """indent 1 JSON · 키 정렬 — 단 「리스트의 리스트」(행 배열)는 행마다 한 줄로 쓴다(diff 가 행 단위로 읽히게)."""
    pad = " " * ind
    if isinstance(v, dict):
        if not v:
            return "{}"
        items = [f"{pad} {json.dumps(k, ensure_ascii=False)}: {_json_enc(v[k], ind + 1)}" for k in sorted(v)]
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(v, list) and v and all(isinstance(x, list) for x in v):
        lines = [pad + " " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in v]
        return "[\n" + ",\n".join(lines) + "\n" + pad + "]"
    if isinstance(v, list):
        return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))
    return json.dumps(v, ensure_ascii=False)


def write_json(path: Path, doc: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_json_enc(doc, 0) + "\n", encoding="utf-8")


def _py(v: object) -> object:
    """numpy 스칼라 → 파이썬 기본형(JSON 용)."""
    return v.item() if hasattr(v, "item") else v


A3_SELECT = """select isin, msg_seq, trade_time_ns t, price_change_type pct, price_change chg, trade_price px, trade_qty qty,
        final_bs_code bs, ask1_px a1, bid1_px b1, market"""


def read_krx_a3(a3_glob: str, scope: str):
    """teamflow(G1 · isin, msg_seq 순 — teamflow.load_day_parquet) 또는 accum(G1+G4 · isin, trade_time_ns, msg_seq 순 —
    teamflow_accum.load_day_a3) 와 같은 열 · 조건 · 순서로 A3 를 읽는다. duckdb 기본 정렬은 NULLS LAST."""
    import duckdb

    if scope == "teamflow":
        where, order = "board_id='G1' and exchange='KRX'", "isin, msg_seq"
    elif scope == "accum":
        where, order = "board_id in ('G1','G4') and exchange='KRX'", "isin, trade_time_ns, msg_seq"
    else:
        raise ValueError(scope)
    A = duckdb.sql(f"{A3_SELECT} from '{a3_glob}' where {where} order by {order}").df()
    key = ["isin", "msg_seq"] if scope == "teamflow" else ["isin", "t", "msg_seq"]
    dup = int(A.duplicated(subset=key, keep=False).sum())
    return A, dup


def order_rows(P) -> tuple[dict, list[list]]:
    """prepare_frame 결과 → (요약, 행 [msg_seq, oid, kind, team]). 종류 분포는 주문 단위."""
    O = P.groupby("oid", sort=True).agg(kind=("kind", "first"), team=("team", "first"))
    kinds: dict[str, int] = {}
    for k in O["kind"].tolist():
        kinds[k] = kinds.get(k, 0) + 1
    summary = {"orders": int(len(O)), "kinds": kinds, "team_orders": int(O["team"].sum())}
    rows = [
        [int(sq), int(o), str(k), int(bool(t))]
        for sq, o, k, t in zip(P["msg_seq"].tolist(), P["oid"].tolist(), P["kind"].tolist(), P["team"].tolist())
    ]
    return summary, rows


# ---------------------------------------------------------------------------
# orders (37-03 Task 1)
# ---------------------------------------------------------------------------


def cmd_orders(a: argparse.Namespace) -> int:
    src = Path(a.input).expanduser().resolve()
    with tempfile.TemporaryDirectory(prefix="tick-oracle-") as tmp:
        tmpd = Path(tmp)
        out = tmpd / "out"
        counters = convert_into(src, "krx", tmpd, out)
        A, dup = read_krx_a3(str(table_file(out, "a3", counters)), "teamflow")
    if dup:
        print(f"[oracle] orders: (isin, msg_seq) 동률 {dup}행 — duckdb 정렬이 비결정이라 골든을 만들 수 없다", file=sys.stderr)
        return 1
    P, base, upper = teamflow.prepare_frame(A)
    summary, rows = order_rows(P)
    summary.update(base=int(base), upper=int(upper), rows=len(rows), isins=sorted(set(P["isin"].tolist())))
    doc = {"source": {"file": src.name, "scope": "teamflow", "select": "board_id='G1' and exchange='KRX' order by isin, msg_seq"},
           "summary": summary, "rows": rows}
    write_json(Path(a.out), doc)
    print(f"[oracle] orders {src.name} {json.dumps(summary, ensure_ascii=False)}", file=sys.stderr)
    return 0



# ---------------------------------------------------------------------------
# runs · window (37-03 Task 2)
# ---------------------------------------------------------------------------

RUN_COLUMNS = ["run", "n", "bs", "nbs", "npx", "maxsame", "multi_px", "zz", "first_seq", "last_seq", "last_px",
               "closing_b6_ok", "late_pieces", "all_late"]


def _tagged(src: Path, label: str, tmpd: Path):
    out = tmpd / f"out-{label}"
    counters = convert_into(src, label, tmpd, out)
    M = nxt_runs.load_g1(table_file(out, "a3", counters), table_file(out, "b6", counters))
    M = nxt_runs.tag_runs(M)
    return M, nxt_runs.run_stats(M)


def _summary(label: str, M, S) -> dict:
    line = nxt_runs.summary_line(label, M, S)
    multi = S[S["n"] >= 2]
    multi_ok = multi[multi["closing_b6_ok"]]
    return {
        "line": line,
        "isins": int(M["isin"].nunique()),
        "a3": int((M["k"] == "A").sum()),
        "b6": int((M["k"] == "B").sum()),
        "runs_ge2": int(len(multi)),
        "smp": int((S["maxsame"] >= 2).sum()),
        "closing_ok": int(S["closing_b6_ok"].sum()),
        "runs": int(len(S)),
        "inverted": int((multi_ok["late_pieces"] > 0).sum()),
        "inverted_of": int(len(multi_ok)),
        "all_late": int(multi["all_late"].sum()),
    }


def _run_rows(S) -> list[list]:
    rows = []
    for rid, r in S.iterrows():
        rows.append([int(rid), int(r["n"]), str(r["bs"]), int(r["nbs"]), int(r["npx"]), int(r["maxsame"]), int(r["multi_px"]),
                     int(r["zz"]), int(r["first_seq"]), int(r["last_seq"]), int(r["last_px"]), int(bool(r["closing_b6_ok"])),
                     int(r["late_pieces"]), int(bool(r["all_late"]))])
    return rows


def cmd_runs(a: argparse.Namespace) -> int:
    doc: dict = {"columns": RUN_COLUMNS}
    with tempfile.TemporaryDirectory(prefix="tick-oracle-") as tmp:
        tmpd = Path(tmp)
        for label, path in (("krx", a.krx), ("nxt", a.nxt)):
            src = Path(path).expanduser().resolve()
            M, S = _tagged(src, label, tmpd)
            summ = _summary(label, M, S)
            doc[label] = {"file": src.name, "summary": summ, "runs": _run_rows(S)}
            print(f"[oracle] runs {summ['line']}", file=sys.stderr)
    write_json(Path(a.out), doc)
    return 0


def cmd_window(a: argparse.Namespace) -> int:
    src = Path(a.input).expanduser().resolve()
    lo_us, hi_us = parse_hms_us(a.t_from), parse_hms_us(a.t_to)
    with tempfile.TemporaryDirectory(prefix="tick-oracle-") as tmp:
        M, S = _tagged(src, "nxt", Path(tmp))
    W = nxt_fixture.nxt_window(M, S, lo_us, hi_us)
    orders = nxt_fixture.classify_nxt_team_orders(W)
    rows = [[str(o.t_ns), o.t_us, o.side, o.qty, o.krw, o.px, o.maxsame, o.pieces, o.n_px, o.first_seq, o.last_seq] for o in orders]
    buy = [o for o in orders if o.side == "2"]
    sell = [o for o in orders if o.side == "1"]
    summary = {
        "team_orders": len(orders),
        "buy_qty": sum(o.qty for o in buy), "buy_krw": sum(o.krw for o in buy),
        "sell_qty": sum(o.qty for o in sell), "sell_krw": sum(o.krw for o in sell),
    }
    doc = {
        "source": {"file": src.name, "from": a.t_from, "to": a.t_to, "lo_us": lo_us, "hi_us": hi_us,
                   "rule": "nxt_window(마지막 조각 체결 시각 당일 µs ∈ [lo, hi]) → classify_nxt_team_orders"},
        "summary": summary,
        "columns": ["t_ns", "t_us", "side", "qty", "krw", "px", "maxsame", "pieces", "n_px", "first_seq", "last_seq"],
        "orders": rows,
    }
    write_json(Path(a.out), doc)
    print(f"[oracle] window {src.name} {a.t_from}~{a.t_to} {json.dumps(summary)}", file=sys.stderr)
    if a.expect:
        want = [int(x) for x in a.expect.split(",")]
        got = [summary[k] for k in ("team_orders", "buy_qty", "buy_krw", "sell_qty", "sell_krw")]
        if got != want:
            print(f"[oracle] window: 기대값 {want} ≠ {got} — AccumNxtFixtures.h 원천과 어긋난다", file=sys.stderr)
            return 1
    return 0


# ---------------------------------------------------------------------------
# pnl · g4cut (37-03 Task 3) — 그 ISIN A3 만 추출 → 합성 pcap → convert_file → 두 범위 판정 · 손익
# ---------------------------------------------------------------------------

A3_ISIN_OFFSET = 17
_IPV4_UDP = struct.Struct(">BBHHHBBH4s4s")
_UDP_HDR = struct.Struct(">HHHH")
_ETH = b"\x01\x00\x5e\x00\x00\x01" + b"\x00" * 6 + b"\x08\x00"


def extract_isin_a3(paths: list[Path], isin: str) -> tuple[bytes, int, int]:
    """시간 파일(주어진 순서)의 UDP 페이로드 중 태그 A3 ∧ 오프셋 17 ISIN 일치(길이 무관)만 레코드 프레이밍으로 잇는다.
    프레임 판정은 extract_records · pcap2parquet 레코드 루프와 같다. (바이트, 레코드 수, 전체 프레임 수)."""
    isin_b = isin.encode("ascii")
    out = bytearray()
    n = 0
    frames = 0
    for path in paths:
        with pcap2parquet._open(path) as f:
            pcap2parquet._read_global_header(f)
            tail = b""
            while True:
                chunk = f.read(pcap2parquet.CHUNK)
                if not chunk:
                    break
                buf = tail + chunk if tail else chunk
                nb = len(buf)
                pos = 0
                while pos + 16 <= nb:
                    ts_s, ts_ns, incl, _orig = _REC.unpack_from(buf, pos)
                    fr = pos + 16
                    end = fr + incl
                    if end > nb:
                        break
                    pos = end
                    frames += 1
                    if incl < 34 or buf[fr + 12] != 0x08 or buf[fr + 13] != 0x00 or buf[fr + 23] != 17:
                        continue
                    ihl = (buf[fr + 14] & 0x0F) * 4
                    udp = fr + 14 + ihl
                    if ihl < 20 or udp + 8 > end:
                        continue
                    ulen = (buf[udp + 4] << 8) | buf[udp + 5]
                    p = udp + 8
                    q = udp + ulen
                    if ulen < 8 or q > end:
                        continue
                    if (q - p >= A3_ISIN_OFFSET + 12 and buf[p] == 0x41 and buf[p + 1] == 0x33
                            and buf[p + A3_ISIN_OFFSET : p + A3_ISIN_OFFSET + 12] == isin_b):
                        plen = q - p
                        out += _REC.pack(ts_s, ts_ns, plen, plen)
                        out += buf[p:q]
                        n += 1
                tail = buf[pos:]
    return bytes(out), n, frames


def write_synthetic_pcap(records: bytes, path: Path) -> int:
    """레코드 프레이밍 → pcap-ns(이더넷 + IPv4 + UDP 로 감싼다). convert_file 이 같은 페이로드 · 같은 recv_ns 를 본다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(path, "wb") as f:
        f.write(pcap2parquet._GHDR.pack(pcap2parquet.PCAP_MAGIC_NS, 2, 4, 0, 0, 262144, pcap2parquet.LINKTYPE_ETHERNET))
        pos = 0
        while pos < len(records):
            ts_s, ts_ns, plen, _ = _REC.unpack_from(records, pos)
            pos += 16
            payload = records[pos : pos + plen]
            pos += plen
            ip = _IPV4_UDP.pack(0x45, 0, 28 + plen, 0, 0, 64, 17, 0, b"\x0a\x00\x00\x01", b"\xe0\x00\x00\x01")
            frame = _ETH + ip + _UDP_HDR.pack(1, 1, 8 + plen, 0) + payload
            f.write(_REC.pack(ts_s, ts_ns, len(frame), len(frame)))
            f.write(frame)
            n += 1
    return n


def hour_files(pcap_dir: Path, date: str, hours: list[str] | None) -> list[Path]:
    d = Path(pcap_dir).expanduser()
    if hours:
        files = [d / f"{date}-{h}.pcap.zst" for h in hours]
        missing = [str(x) for x in files if not x.exists()]
        if missing:
            raise SystemExit(f"[oracle] 원본 없음: {missing}")
        return files
    files = sorted(d.glob(f"{date}-*.pcap.zst"))
    if not files:
        raise SystemExit(f"[oracle] 원본 없음: {d}/{date}-*.pcap.zst")
    return files


def scoped_frames(records: bytes, date: str, tmpd: Path) -> dict:
    """합성 pcap → convert_file → 범위 두 벌 {scope: (prepare_frame 결과 P, last_px, g4_trades)}."""
    import duckdb

    syn = tmpd / "syn" / "krx" / f"{date}-0000.pcap"
    write_synthetic_pcap(records, syn)
    out = tmpd / "out"
    counters = pcap2parquet.convert_file(syn, out, force=True, log=False)
    a3 = str(table_file(out, "a3", counters))
    res = {}
    for scope in ("teamflow", "accum"):
        A, dup = read_krx_a3(a3, scope)
        if dup:
            raise SystemExit(f"[oracle] {scope}: 정렬 키 동률 {dup}행 — duckdb 정렬이 비결정이라 골든을 만들 수 없다")
        if A.empty:
            res[scope] = None
            continue
        P = teamflow.prepare_frame(A)[0]
        last_px = int(A["px"].iat[-1])
        res[scope] = (P, last_px)
    g4 = duckdb.sql(f"select count(*) from '{a3}' where board_id='G4' and exchange='KRX'").fetchone()[0]
    res["g4_trades"] = int(g4)
    res["a3_rows"] = int(duckdb.sql(f"select count(*) from '{a3}'").fetchone()[0])
    return res


def _pnl_json(pnl: dict | None) -> dict | None:
    return None if pnl is None else {k: _py(v) for k, v in pnl.items()}


def export_row(export_dir: Path, kind: str, isin: str) -> dict:
    import gzip

    path = Path(export_dir).expanduser() / f"{kind}.ndjson.gz"
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if r.get("isin") == isin:
                return r
    raise SystemExit(f"[oracle] {path}: {isin} 행 없음")


def cmd_pnl(a: argparse.Namespace) -> int:
    files = hour_files(a.pcap_dir, a.date, a.hours.split(",") if a.hours else None)
    data, n, frames = extract_isin_a3(files, a.isin)
    prefix = Path(a.out_prefix)
    with tempfile.TemporaryDirectory(prefix="tick-oracle-") as tmp:
        res = scoped_frames(data, a.date, Path(tmp))
    tf = export_row(a.export, "team_flow", a.isin)
    ac = export_row(a.export, "accum_flow", a.isin)
    bad = 0
    got: dict = {}
    for scope, ex in (("teamflow", tf), ("accum", ac)):
        P, last_px = res[scope]
        mine = _pnl_json(teamflow.team_pnl(P, last_px))
        got[scope] = {"last_px": last_px, "pnl": mine}
        want = ex["payload"].get("pnl")
        if mine != want:
            print(f"[oracle] pnl {scope}: 재계산 {mine} ≠ export {want}", file=sys.stderr)
            bad = 1
        if int(ex["last_px"]) != last_px:
            print(f"[oracle] pnl {scope}: last_px 재계산 {last_px} ≠ export {ex['last_px']}", file=sys.stderr)
            bad = 1
    if bad:
        return 1
    zst = prefix.with_name(prefix.name + "-a3.ticks.zst")
    zst.write_bytes(zstd.compress(data, level=19))
    doc = {
        "source": {"isin": a.isin, "date": a.date, "files": [f.name for f in files], "frames": frames, "a3_records": n,
                   "a3_rows": res["a3_rows"], "g4_trades": res["g4_trades"],
                   "export": {"dir": str(Path(a.export).name), "team_flow": "payload.pnl", "accum_flow": "payload.pnl"}},
        "teamflow": tf["payload"]["pnl"],
        "accum": ac["payload"]["pnl"],
        "base": int(tf["base"]),
        "upper": int(tf["upper"]),
        "last_px": {"teamflow": got["teamflow"]["last_px"], "accum": got["accum"]["last_px"]},
    }
    write_json(prefix.with_name(prefix.name + ".pnl.json"), doc)
    print(f"[oracle] pnl {a.isin} {a.date} files={len(files)} frames={frames} a3={n} g4={res['g4_trades']} "
          f"teamflow={json.dumps(doc['teamflow'])} accum_buy_val={doc['accum'] and doc['accum']['buy_val']} "
          f"{zst.name}={zst.stat().st_size}B", file=sys.stderr)
    return 0


def cmd_g4cut(a: argparse.Namespace) -> int:
    hours = a.hours.split(",")
    files = hour_files(a.pcap_dir, a.date, hours)
    data, n, frames = extract_isin_a3(files, a.isin)
    prefix = Path(a.out_prefix)
    with tempfile.TemporaryDirectory(prefix="tick-oracle-") as tmp:
        res = scoped_frames(data, a.date, Path(tmp))
    if res["g4_trades"] == 0:
        print(f"[oracle] g4cut: {a.isin} {hours} 에 G4 체결이 없다 — 골든이 아니다(시간을 넓혀 다시)", file=sys.stderr)
        return 1
    doc: dict = {"source": {"isin": a.isin, "date": a.date, "hours": hours, "files": [f.name for f in files], "frames": frames,
                            "a3_records": n, "a3_rows": res["a3_rows"], "g4_trades": res["g4_trades"]}}
    for scope in ("accum", "teamflow"):
        P, last_px = res[scope]
        summary, rows = order_rows(P)
        summary.update(rows=len(rows), last_px=last_px)
        doc[scope] = {"summary": summary, "rows": rows}
        doc[f"pnl_{scope}"] = _pnl_json(teamflow.team_pnl(P, last_px))
    zst = prefix.with_name(prefix.name + ".ticks.zst")
    zst.write_bytes(zstd.compress(data, level=19))
    write_json(prefix.with_name(prefix.name + ".golden.json"), doc)
    print(f"[oracle] g4cut {a.isin} {a.date} {hours} frames={frames} a3={n} g4={res['g4_trades']} "
          f"accum={json.dumps(doc['accum']['summary'], ensure_ascii=False)} "
          f"teamflow={json.dumps(doc['teamflow']['summary'], ensure_ascii=False)} "
          f"pnl_accum.buy_val={doc['pnl_accum'] and doc['pnl_accum']['buy_val']} "
          f"pnl_teamflow.buy_val={doc['pnl_teamflow'] and doc['pnl_teamflow']['buy_val']} {zst.name}={zst.stat().st_size}B",
          file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="oracle.py", description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_l = sub.add_parser("layouts", help="LAYOUTS 덤프")
    p_l.add_argument("--out", required=True)
    p_l.set_defaults(fn=cmd_layouts)
    p_d = sub.add_parser("decode", help="pcap2parquet 골든 + 레코드 프레이밍 픽스처")
    p_d.add_argument("input")
    p_d.add_argument("--label", required=True, choices=["krx", "nxt"])
    p_d.add_argument("--limit", type=int, default=None)
    p_d.add_argument("--out-prefix", required=True)
    p_d.set_defaults(fn=cmd_decode)
    p_o = sub.add_parser("orders", help="KRX G1 classify_orders 주문별 골든")
    p_o.add_argument("input")
    p_o.add_argument("--out", required=True)
    p_o.set_defaults(fn=cmd_orders)
    p_r = sub.add_parser("runs", help="NXT 런(D-01) 요약 · 런별 통계 — KRX · NXT")
    p_r.add_argument("--krx", required=True)
    p_r.add_argument("--nxt", required=True)
    p_r.add_argument("--out", required=True)
    p_r.set_defaults(fn=cmd_runs)
    p_w = sub.add_parser("window", help="NXT 단독 창 팀 주문(D-04)")
    p_w.add_argument("input")
    p_w.add_argument("--from", dest="t_from", required=True)
    p_w.add_argument("--to", dest="t_to", required=True)
    p_w.add_argument("--expect", default=None)
    p_w.add_argument("--out", required=True)
    p_w.set_defaults(fn=cmd_window)
    p_p = sub.add_parser("pnl", help="그 ISIN A3 추출 + export payload.pnl(두 범위) 골든")
    p_g = sub.add_parser("g4cut", help="G4 포함 조각 — 두 범위 주문별 행 + team_pnl 골든")
    for sp in (p_p, p_g):
        sp.add_argument("--isin", required=True)
        sp.add_argument("--date", required=True)
        sp.add_argument("--pcap-dir", required=True)
        sp.add_argument("--out-prefix", required=True)
    p_p.add_argument("--export", required=True)
    p_p.add_argument("--hours", default=None)
    p_p.set_defaults(fn=cmd_pnl)
    p_g.add_argument("--hours", required=True)
    p_g.set_defaults(fn=cmd_g4cut)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
