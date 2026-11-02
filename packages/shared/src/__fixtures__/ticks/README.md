# 틱 디코더 골든 픽스처 (Phase 37 · D-19)

gh-trade tickana 파이썬 정본(`packets.py` LAYOUTS · `pcap2parquet.py`)이 낸 기대값이다. 손으로 고치지 않는다 —
원본에서 다시 생성한다. 원본 `.pcap.zst` 는 커밋하지 않는다(gh-trade `AccumNxtFixtures.h` 선례). 테스트는 이 디렉터리의
커밋된 파일만 읽는다(CI 에 gh-trade venv 불필요).

## 재생성 (맥 전용)

```bash
bash scripts/tick-oracle/gen-fixtures.sh decode
```

전제: gh-trade venv `$GH_TRADE_ANALYSIS/.venv`(기본 `/Users/alex/repos/gh-trade/server/tools/analysis`, Python 3.14 ·
`compression.zstd` · pyarrow)와 아래 로컬 원본. 같은 원본 · 같은 venv 면 다시 돌려도 바이트가 같다
(`git status --porcelain packages/shared/src/__fixtures__/ticks` 빈 출력).

## 파일

| 파일 | 원천 | 내용 |
|------|------|------|
| `layouts.json` | `packets.LAYOUTS` | `{"<tag>:<size>": [[name, offset, length, kind], …]}` — TS `LAYOUTS` 동일성 기대값 |
| `cut1300-krx.ticks.zst` · `.decode.json` | `~/ticks/cut-101360/src/krx/krx-1300.pcap.zst` | 에코앤드림 KR7101360006 10/16 13시 컷 KRX(A3 · B6) |
| `cut1300-nxt.ticks.zst` · `.decode.json` | `~/ticks/cut-101360/src/nxt/nxt-1300.pcap.zst` | 같은 컷 NXT(A3 · B6) |
| `raw20k-0900.ticks.zst` · `.decode.json` | `~/ticks/team-follow/rawpcap/20261014/20261014-0900.pcap.zst` 첫 20,000 프레임 | 10/14 09시 무필터 조각 — 모든 태그 + raw |

- `*.ticks.zst` = 레코드 프레이밍 `pcapns-rec+zstd/1`(레코드 헤더 `<IIII>` 16B + UDP 페이로드 · 전역 헤더 없음 · zstd-19 한 프레임).
  pcap2parquet 레코드 루프와 같은 규칙 · 같은 프레임 수 상한으로 뽑았다.
- `*.decode.json` = pcap2parquet 표별 Parquet 를 읽은 요약 — `source`(파일 · 라벨 · limit · 프레임 · 레코드 · 카운터) ·
  `tables.<표>`(`rows` · `columns.<열>.{sha256, nulls}` · `head` 앞 30행). 행이 0 인 표는 없다. `dst_ip` · `dst_port` 는 뺐다.
- 정규화(canon) · 열 digest 규칙은 `scripts/tick-oracle/oracle.py` 머리 주석과 `src/__tests__/helpers/tick-digest.ts` 가 같다.
- 크기 상한: `.ticks.zst` 하나당 1.5MB. 넘으면 `RAW_LIMIT=10000 bash scripts/tick-oracle/gen-fixtures.sh decode`.

생성일: 2026-11-02 (gh-trade tickana 2026-11-02 원문).
