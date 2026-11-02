"""틱 디코더 오라클 생성기 (Phase 37 D-19 — gh-radar TS 디코더 골든 픽스처).

목적: gh-trade tickana 의 파이썬 정본(LAYOUTS · pcap2parquet)을 돌려 gh-radar `packages/shared/src/ticks/` 의
TS 이식이 같은 결과를 내는지 대조할 픽스처를 만든다. 「이식은 창작이 아니라 번역」 — 기대값을 손으로 쓰지 않는다.

정본(2026-11-02 원문 기준 — 어긋나면 함수 이름으로 찾는다):
  gh-trade server/tools/analysis/tickana/packets.py:34-275   Field · Layout · check_layout · LAYOUTS
  gh-trade server/tools/analysis/tickana/pcap2parquet.py:34-43  _REC · _GHDR · PCAP_MAGIC_NS
  gh-trade server/tools/analysis/tickana/pcap2parquet.py:84-101 output_stem(라벨 = 부모 디렉터리 이름) · target_path
  gh-trade server/tools/analysis/tickana/pcap2parquet.py:230-345 convert_file · 레코드 루프 · 이더넷/IPv4/UDP 벗김
  gh-trade server/tools/analysis/README.md 「Parquet 표 스키마」

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

from tickana import packets, pcap2parquet  # noqa: E402

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
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
