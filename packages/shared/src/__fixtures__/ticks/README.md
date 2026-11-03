# 틱 디코더 골든 픽스처 (Phase 37 · D-19)

gh-trade tickana 파이썬 정본(`packets.py` LAYOUTS · `pcap2parquet.py`)이 낸 기대값이다. 손으로 고치지 않는다 —
원본에서 다시 생성한다. 원본 `.pcap.zst` 는 커밋하지 않는다(gh-trade `AccumNxtFixtures.h` 선례). 테스트는 이 디렉터리의
커밋된 파일만 읽는다(CI 에 gh-trade venv 불필요).

## 재생성 (맥 전용)

```bash
bash scripts/tick-oracle/gen-fixtures.sh decode   # 디코더 골든(37-02)
bash scripts/tick-oracle/gen-fixtures.sh orders   # KRX 주문 묶기 · 팀 판정 골든(37-03)
bash scripts/tick-oracle/gen-fixtures.sh runs     # NXT 런 · 단독 창 골든(37-03)
bash scripts/tick-oracle/gen-fixtures.sh pnl      # 천일 10/14 팀 손익 골든(37-03 · 로컬 원본 08~15시 ≈ 3.4GB 통독 ≈ 50초)
bash scripts/tick-oracle/gen-fixtures.sh g4cut    # 빅텍 10/22 G4 조각 골든(37-03 · GCS 원본 3시간 먼저 받기)
bash scripts/tick-oracle/gen-fixtures.sh pnl --bigtech   # (선택) 빅텍 10/22 하루 — GCS 원본 ≈ 3.4GB
pnpm --filter @gh-radar/shared build && node scripts/tick-oracle/gen-own-fixtures.mjs   # 10/30 우리 체결 오라클(38-02 · 아래 own1030 행)
node scripts/tick-oracle/gen-own-fixtures.mjs --check   # 같은 입력 = 같은 바이트 확인(다르면 exit 1)
bash scripts/tick-oracle/gen-fixtures.sh launch   # 발사 대기열 · 체결 런 골든 조각 4개(quick 261103-pei · 아래 launch10* 행)
```

`gen-own-fixtures.mjs` 는 gh-trade venv 가 필요 없다 — 빌드된 `packages/shared/dist` 와 저장소 밖 로컬 사본
`/Users/alex/gh-radar-own-probe-1030/`(또는 `--in` · `$OWN_PROBE_DIR`)만 읽는다(원격 접근 없음). 원 출처인 Storage 10/30 격자는
보존 90일이라 2027-01-28 무렵 purge 된다.

GCS 원본(빅텍 10/22 — 맥 `~/ticks/team-follow/rawpcap/` 에는 08~15시만 있다)은 deployer SA 로 읽기만 한다:

```bash
mkdir -p ~/ticks/oracle/20261022/krx
GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar \
  gcloud storage cp gs://gh-trade-tick-archive/raw/krx/20261022/20261022-1500.pcap.zst \
    gs://gh-trade-tick-archive/raw/krx/20261022/20261022-1600.pcap.zst \
    gs://gh-trade-tick-archive/raw/krx/20261022/20261022-1700.pcap.zst ~/ticks/oracle/20261022/krx/
```

g4cut 세 시간 = 212,358,419 + 94,934,883 + 85,724,009 = 393,017,311B(≈ 0.39GB · Archive 꺼내기 + 송신 ≈ $0.07 일회 ·
2026-11-02 실측). 하루 전체(`--bigtech`)는 `gcloud storage du -s gs://gh-trade-tick-archive/raw/krx/20261022/` = 3,578,935,444B.

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
| `cut1300-krx.orders.json` | 컷 KRX(위 `cut1300-krx.ticks.zst` 와 같은 원본) → `teamflow.prepare_frame` | KRX G1 · msg_seq 순 주문별 `[msg_seq, oid, kind, team]` + 요약(주문 2,687 · 팀 126 · 기준가 8,200 · 상한가 10,660) |
| `cut1300-runs.json` | 컷 KRX · NXT → `nxt_runs.load_g1` · `tag_runs` · `run_stats` · `summary_line` | 런별 통계 행(`columns`) + 요약 줄 원문(NXT runs>=2=179 smp=65 · KRX 182/70). run 번호는 파이썬 1부터 |
| `cut1300-nxt.window.json` | 컷 NXT → `nxt_fixture.nxt_window` 13:30:00~13:40:00 → `classify_nxt_team_orders` | 팀 주문 13 · 매수 7,901주/82,023,350원 · 매도 4,632주/49,348,980원(gh-trade `AccumNxtFixtures.h` kAccumNxt_Expect — 다르면 생성기 종료 1) |
| `chunil-1014-a3.ticks.zst` | `~/ticks/team-follow/rawpcap/20261014/20261014-{0800..1500}.pcap.zst` | 천일고속 KR7000650002 10/14 — 그 ISIN A3 전문만(태그 A3 · 오프셋 17 ISIN · 길이 무관) 10,168건 |
| `chunil-1014.pnl.json` | `~/ticks/research/export/20261014/{team_flow,accum_flow}.ndjson.gz` | 그 ISIN `payload.pnl` 원문 두 범위 + base · upper · last_px. 같은 A3 로 파이썬 team_pnl 을 다시 계산해 export 와 같음을 생성기가 확인 |
| `bigtech-1022-g4.ticks.zst` | GCS `raw/krx/20261022/20261022-{1500,1600,1700}.pcap.zst` | 빅텍 KR7065450009 10/22 15~17시 — 그 ISIN A3 만 17,100건(G4 체결 13,792) |
| `bigtech-1022-g4.golden.json` | 같은 조각 → 합성 pcap → convert_file → 두 범위 `prepare_frame` · `team_pnl` | accum(G1+G4 · (t, seq) 순) · teamflow(G1 · seq 순) 주문별 행 + `pnl_accum` · `pnl_teamflow`. G4 체결 0 이면 생성기 종료 1 |
| `own1030-krx-KR7184230001.ticks.zst` | `/Users/alex/gh-radar-own-probe-1030/KRX_KR7184230001.zst` 사본(원 출처 Storage `tick-grid/grid/20261030/KRX/KR7184230001.nightly.ticks.zst`) | 10/30 창 격자 — 원본 11,130 → 2,199 레코드. 창 = A3∧ok(체결 g 기준 A3 시각 [g−3000, g+1000] ∨ 이벤트 e 기준 수신 [e−3500, e+500] ∨ 이벤트 cum_volume · ev_qty_after 와 같은 cumVolume ∨ 주기매도 (before, after]) + B6∧ok(이벤트 수신 창) |
| `own1030-krx-KR7011080009.ticks.zst` | 같은 사본 `KRX_KR7011080009.zst`(Storage `…/20261030/KRX/KR7011080009.nightly.ticks.zst`) | 같은 창 규칙 — 6,421 → 460 |
| `own1030-krx-KR7051630002.ticks.zst` | 같은 사본 `KRX_KR7051630002.zst`(Storage `…/20261030/KRX/KR7051630002.nightly.ticks.zst`) | 같은 창 규칙 — 126,135 → 476 |
| `own1030-krx-KR7092190008.ticks.zst` | 같은 사본 `KRX_KR7092190008.zst`(Storage `…/20261030/KRX/KR7092190008.nightly.ticks.zst`) | 같은 창 규칙 — 118,990 → 4,458 |
| `own1030-nxt-KR7046890000.ticks.zst` | 같은 사본 `NXT_KR7046890000.zst`(Storage `…/20261030/NXT/KR7046890000.nightly.ticks.zst`) | 같은 창 규칙 — 587,383 → 7,108 |
| `own1030.journal.json` | 같은 사본 `fills1030.json`(`dma_journal_events` 10/30 E 행) · `strat1030.json`(`dma_strategy_events` 10/30 kind 3·6) | 위 5키 체결 406(exec_qty > 0) · 이벤트 124 — (gw_time_ms, gateway, seq) 정렬 · seq = 사본 배열 색인 · 계좌 익명 `ACC1…`(체결 첫 등장 순 · 원본 계좌번호 · dma_user_id 없음). 생성기가 키마다 원본 격자와 창 격자의 `matchOwnFills` 결과가 같음을 확인한다(다르면 종료 1) |

| `launch1022-krx-g4.ticks.zst` | GCS `raw/krx/20261022/20261022-{1600..2000}.pcap.zst` | 060900 KR7060900008 10/22 G4 A3 · B6(수신 15:59~) — 그날 G4 세션 전부(체결 4,405 = KB #1 filled_qty) |
| `launch1030-krx-g4.ticks.zst` | `~/ticks/queue-spike/1030/krx-1600.pcap.zst` | 184230 KR7184230001 10/30 G4 A3 · B6(16:00~16:59) |
| `launch1030-krx-0900.ticks.zst` | `~/ticks/queue-spike/1030/krx-0900.pcap.zst` | 10/30 KRX A 8종목 A3 · B6 수신 09:00:26~09:00:31.500 |
| `launch1030-nxt-0900.ticks.zst` | `~/ticks/queue-spike/1030/nxt-0900.pcap.zst` | 10/30 NXT N 6종목 A3 · B6 수신 09:00:29.500~09:00:32 |

- `*.ticks.zst` = 레코드 프레이밍 `pcapns-rec+zstd/1`(레코드 헤더 `<IIII>` 16B + UDP 페이로드 · 전역 헤더 없음 · zstd-19 한 프레임).
  pcap2parquet 레코드 루프와 같은 규칙 · 같은 프레임 수 상한으로 뽑았다.
- `*.decode.json` = pcap2parquet 표별 Parquet 를 읽은 요약 — `source`(파일 · 라벨 · limit · 프레임 · 레코드 · 카운터) ·
  `tables.<표>`(`rows` · `columns.<열>.{sha256, nulls}` · `head` 앞 30행). 행이 0 인 표는 없다. `dst_ip` · `dst_port` 는 뺐다.
- 정규화(canon) · 열 digest 규칙은 `scripts/tick-oracle/oracle.py` 머리 주석과 `src/__tests__/helpers/tick-digest.ts` 가 같다.
- `pnl` · `g4cut` 의 파이썬 쪽은 추출한 레코드를 이더넷/IPv4/UDP 로 다시 감싼 **합성 pcap** 을 `convert_file` 에 넣는다 —
  TS 테스트가 읽는 `.ticks.zst` 와 바이트 · recv_ns 가 같은 입력이다. 범위 조건 · 정렬은 `teamflow.load_day_parquet`(teamflow) ·
  `teamflow_accum.load_day_a3`(accum) 와 같은 SQL 이다.
- 빅텍 10/22 하루 골든(`bigtech-1022-a3.ticks.zst` · `bigtech-1022.pnl.json`)은 선택이다. 없으면 `ticks-pnl.golden.test.ts` 의
  해당 블록만 skip 한다(G4 조각 골든은 skip 없음).
- `*.orders.json` 등 행 배열 JSON 은 행마다 한 줄(키 정렬 · indent 1) — diff 가 행 단위로 읽힌다. (isin, msg_seq) 동률이 있으면
  duckdb 정렬이 비결정이라 오라클이 종료 1 한다.
- 크기 상한: `.ticks.zst` 하나당 1.5MB. 넘으면 `RAW_LIMIT=10000 bash scripts/tick-oracle/gen-fixtures.sh decode`.

생성일: 2026-11-02 (gh-trade tickana 2026-11-02 원문). `own1030-*` · `own1030.journal.json` 생성일: 2026-11-03 (Phase 38-02).
