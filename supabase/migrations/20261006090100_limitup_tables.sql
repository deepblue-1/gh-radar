-- ============================================================
-- Phase 28 Plan 03 — 상한가 특징 밤 export 적재 표 10개 (gh-trade Phase 27 export 계약 (C)).
--
-- 무엇: gh-trade 119 밤 배치가 만드는 `<YYYYMMDD>/{entries,locks,jumps,member_alloc,facts,touches}.ndjson.gz`
--   를 받는 표 6개 + 날짜 원자 교체용 stage + 적재 이력 + 보고서 파생 표 2개.
-- 왜: D-14(적재기 규칙 — 날짜 단위 교체 · 바뀐 날짜만) · D-15(표 6 = 인박스 표 그대로 · server 경유 읽기 ·
--   GIN 없음) · D-17(stage · 이력 · 파생 표를 같은 마이그레이션에).
--
-- 열 정본: 인박스 `docs/inbox/from-gh-trade/261005-limitup-feature-85.md` 「(C)」 표 = gh-trade
--   `server/tools/analysis/tickana/export.py` 실제 출력(locks 는 `LOCKS_EXPORT_COLS`). 열 이름 = ndjson 키 그대로
--   (적재 RPC 가 `jsonb_populate_record` 로 키 이름 = 열 이름 매핑을 쓴다 — 이름을 바꾸면 그 열이 조용히 NULL 이 된다).
--   - `date` 는 `YYYYMMDD` text(export 그대로 — 범위 비교 · 90일 정리는 문자열 비교로 정확).
--   - 예약어 두 개: `"foreign"`(member_alloc) · `"values"`(facts, jsonb) — DDL · RPC 본문 모두 따옴표(RESEARCH Pitfall 7).
--   - `*_ms` = epoch ms bigint · 비율은 소수(0~1, bp 아님) · 결측 null — PK 열 밖은 전부 NULL 허용.
--   - `facts."values"` 에 GIN 인덱스 없음(D-15 — 웹은 근거 키로 검색하지 않는다).
--
-- 날짜 원자 교체: 워커가 그날 행을 `limitup_stage`(payload = export 행 원문 jsonb)에 청크로 넣고
--   `limitup_commit_day` RPC(20261006090200) 한 번이 한 트랜잭션으로 「표별 행 수 대조 → 그날 DELETE → INSERT →
--   이력 upsert → stage 비움」 을 한다. 재처리로 행이 줄어도 옛 행이 남지 않는다.
-- 적재 이력 `limitup_loads`: 「적재된 날짜」 = `files_sig IS NOT NULL`(skip 만 있던 날짜는 null).
--   `files_sig` = manifest `files[]` 를 name 정렬한 `name:sha256` 줄의 sha256(finished_at 무시 — Pitfall 9).
--   `skip_streak` = 연속 skip 수(`limitup_record_skip` 이 올리고 성공 commit 이 0 으로) — 3연속 알림 판정은 28-16.
-- 파생 표: `limitup_grid_summary`(격자 coarse q_krw 스파크 · 최대 잔량 · +60초 매도 비중) ·
--   `limitup_member_daily`(창구 지문 날짜별 기여분) — 계산은 28-06 워커, 교체는 같은 commit RPC.
-- 보존(D-16 · D-19 90일 · member_alloc 30일)은 28-06 의 정리 RPC 가 한다 — 이 파일에는 없다.
--
-- 잠금(D-15): 표 10개 전부 RLS 활성 + 정책 0개 + PUBLIC · anon · authenticated 명시 REVOKE + service_role 4권한
--   (20260929180000_dma_strategy_events.sql 과 같은 4줄). server 가 service_role 로만 읽는다 —
--   **접근 규칙(POLICY)을 추가하지 말 것.** 자동 메모리 feedback_supabase_rpc_revoke: `FROM PUBLIC` 단독은 auto-grant 에 덮인다.
--
-- 원격 적용: 이 파일은 커밋만 — 원격은 28-14 `supabase db push`.
-- 되돌리기: DROP TABLE public.limitup_member_daily, public.limitup_grid_summary, public.limitup_loads,
--   public.limitup_stage, public.limitup_touches, public.limitup_facts, public.limitup_member_alloc,
--   public.limitup_jumps, public.limitup_locks, public.limitup_entries;  (RPC 20261006090200 을 먼저 DROP)
-- ============================================================

BEGIN;

-- ── 표 6개 — 인박스 「(C)」 표 열 순서 · 타입 · PK 그대로 ─────────────

-- entries (35열) — 종목별 그날 진입 요약
CREATE TABLE public.limitup_entries (
  date                  text             NOT NULL,
  isin                  text             NOT NULL,
  short_code            text,
  name                  text,
  base_px               bigint,
  upper_px              bigint,
  list_shares           bigint,
  mcap_krw              bigint,
  sec_group             text,
  max_rate              double precision,
  t15_ms                bigint,
  t20_ms                bigint,
  t25_ms                bigint,
  detect_rate_pct       integer,
  reached               boolean,
  first_upper_ms        bigint,
  entry_from_ms         bigint,
  wall_krw_before       bigint,
  wall_truncated_before boolean,
  wall_clear_s          double precision,
  max_burst_krw         bigint,
  max_burst_ms          bigint,
  max_burst_pieces      integer,
  entry_buy_member1     text,
  entry_buy_share1      double precision,
  entry_buy_member2     text,
  entry_buy_share2      double precision,
  entry_buy_member3     text,
  entry_buy_share3      double precision,
  close_px              bigint,
  close_ret             double precision,
  d1_date               text,
  d1_open               bigint,
  d1_ret                double precision,
  schema_version        integer,
  PRIMARY KEY (date, isin)
);

-- locks (22열, export.py LOCKS_EXPORT_COLS) — 잠김 구간
CREATE TABLE public.limitup_locks (
  date           text             NOT NULL,
  isin           text             NOT NULL,
  lock_id        integer          NOT NULL,
  exchange       text,
  board          text,
  short_code     text,
  name           text,
  upper_px       bigint,
  close_px       bigint,
  close_ret      double precision,
  start_ms       bigint,
  end_ms         bigint,                     -- 장 끝까지 잠김이면 null 가능
  dur_s          double precision,
  broke          boolean,
  outcome        text,                       -- '깨짐' / '유지'
  break_px       bigint,
  q0             bigint,
  d1_date        text,
  d1_open        bigint,
  d1_ret         double precision,
  data_end       text,                       -- KST 'HH:MM:SS.ffffff'
  schema_version integer,
  PRIMARY KEY (date, isin, lock_id)
);

-- jumps (17열) — 상한가 잔량 · 매도벽 급변
CREATE TABLE public.limitup_jumps (
  date           text             NOT NULL,
  isin           text             NOT NULL,
  jump_no        integer          NOT NULL,
  t_ms           bigint,
  kind           text,                       -- new · cancel · auction_fill · burst_buy · burst_sell · wall_eat
  qty            bigint,
  krw            bigint,
  px             bigint,
  pieces         integer,
  span_ms        double precision,
  q_before       bigint,
  q_after        bigint,
  wall_before    bigint,
  wall_after     bigint,
  lock_state     smallint,
  minute         integer,
  schema_version integer,
  PRIMARY KEY (date, isin, jump_no)
);

-- member_alloc (16열) — 창구 증분 배분 (추정, 분 단위)
CREATE TABLE public.limitup_member_alloc (
  date           text             NOT NULL,
  isin           text             NOT NULL,
  sweep_no       integer          NOT NULL,
  side           text             NOT NULL,
  member         text             NOT NULL,
  name           text,
  "foreign" boolean,                         -- 예약어 — JSON 키 foreign 과 1:1
  start_ms       bigint,
  end_ms         bigint,
  span_s         double precision,
  d_qty          bigint,
  d_value        bigint,
  share          double precision,
  trades_in_span integer,
  qty_in_span    bigint,
  schema_version integer,
  PRIMARY KEY (date, isin, sweep_no, side, member)
);

-- facts (10열) — 사실 문장 + 근거 수치
CREATE TABLE public.limitup_facts (
  date           text             NOT NULL,
  isin           text             NOT NULL,
  event_no       integer          NOT NULL,  -- 0 = 진입 구간, ≥1 = lock_id
  fact_no        integer          NOT NULL,
  t_ms           bigint,
  template_id    text,
  text           text,                       -- 완성 문장 — 그대로 표시
  "values" jsonb,                              -- 예약어 — 근거 수치 객체(GIN 없음 · D-15)
  source         text,                       -- 실측 / 추정(분 단위) / 모형
  schema_version integer,
  PRIMARY KEY (date, isin, event_no, fact_no)
);

-- touches (14열) — 상한가 첫 체결 접촉
CREATE TABLE public.limitup_touches (
  date           text             NOT NULL,
  isin           text             NOT NULL,
  touch_id       integer          NOT NULL,
  first_trade    text,                       -- KST 'HH:MM:SS.ffffff'
  first_recv     text,
  first_qty      bigint,
  last_trade     text,
  n_trades       integer,
  qty_at_upper   bigint,
  next_px        bigint,
  first_ms       bigint,
  last_ms        bigint,
  next_ms        bigint,
  schema_version integer,
  PRIMARY KEY (date, isin, touch_id)
);

-- ── stage — 날짜 원자 교체 전 그날 행 원문(모든 표 공용) ─────────────
CREATE TABLE public.limitup_stage (
  date    text    NOT NULL,
  tbl     text    NOT NULL CHECK (tbl IN ('entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches',
                                          'grid_summary', 'member_daily')),
  seq     integer NOT NULL,
  payload jsonb   NOT NULL,                  -- export 행 원문(키 = 대상 표 열 이름)
  PRIMARY KEY (date, tbl, seq)
);

-- ── 적재 이력 — 날짜별 files_sig · 연속 skip ─────────────────────────
CREATE TABLE public.limitup_loads (
  date             text        PRIMARY KEY,
  files_sig        text,                     -- NULL = 아직 적재 안 됨(skip 만 기록된 날짜)
  manifest_sha256  text,
  schema_version   integer,
  "rows"           jsonb,                    -- 표별 실제 삽입 행 수
  loaded_at        timestamptz,
  skip_streak      integer     NOT NULL DEFAULT 0,
  last_skip_reason text,
  last_skip_at     timestamptz
);

-- ── 파생 1 — 종목별 격자 요약(스파크라인 = coarse q_krw 그대로) ────────
CREATE TABLE public.limitup_grid_summary (
  date            text             NOT NULL,
  isin            text             NOT NULL,
  step_s          integer          NOT NULL,
  sec0            integer          NOT NULL,  -- 첫 coarse 초(그날 00:00 KST 기준)
  q_krw           bigint[]         NOT NULL,
  q_max_krw       bigint,
  q_max_ms        bigint,
  sell_share_60s  double precision,
  PRIMARY KEY (date, isin)
);

-- ── 파생 2 — 창구 지문 날짜별 기여분(90일 창 GROUP BY member 로 합산) ──
CREATE TABLE public.limitup_member_daily (
  date          text             NOT NULL,
  member        text             NOT NULL,
  name          text,
  n             integer          NOT NULL,
  entry_sum     double precision NOT NULL,
  entry_cnt     integer          NOT NULL,
  lock_buy_sum  double precision NOT NULL,
  lock_buy_cnt  integer          NOT NULL,
  pre_sell_sum  double precision NOT NULL,
  pre_sell_cnt  integer          NOT NULL,
  lead          integer          NOT NULL,
  n_broke       integer          NOT NULL,
  n_lock        integer          NOT NULL,
  n_held        integer          NOT NULL,
  PRIMARY KEY (date, member)
);

COMMENT ON TABLE public.limitup_entries      IS 'gh-trade 밤 export entries — 종목별 진입 요약(D-15, service_role 전용)';
COMMENT ON TABLE public.limitup_locks        IS 'gh-trade 밤 export locks — 잠김 구간(D-15, service_role 전용)';
COMMENT ON TABLE public.limitup_jumps        IS 'gh-trade 밤 export jumps — 잔량 · 매도벽 급변(D-15, service_role 전용)';
COMMENT ON TABLE public.limitup_member_alloc IS 'gh-trade 밤 export member_alloc — 창구 증분 배분(D-15, service_role 전용)';
COMMENT ON TABLE public.limitup_facts        IS 'gh-trade 밤 export facts — 사실 문장 + 근거 values(D-15, GIN 없음)';
COMMENT ON TABLE public.limitup_touches      IS 'gh-trade 밤 export touches — 상한가 첫 접촉(D-15, service_role 전용)';
COMMENT ON TABLE public.limitup_stage        IS 'limitup 날짜 원자 교체 stage — limitup_commit_day 가 비운다(D-17)';
COMMENT ON TABLE public.limitup_loads        IS 'limitup 적재 이력 — 날짜별 files_sig · 연속 skip(D-14 · D-20)';
COMMENT ON TABLE public.limitup_grid_summary IS 'limitup 파생 — 종목별 격자 요약 스파크 · 최대 잔량 · +60초 매도 비중(D-17)';
COMMENT ON TABLE public.limitup_member_daily IS 'limitup 파생 — 창구 지문 날짜별 기여분(D-17)';

-- ── 서비스롤 전용 잠금: RLS 활성 + 접근 규칙 0개 + 명시 REVOKE (표 10개) ──
ALTER TABLE public.limitup_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_entries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_entries TO service_role;

ALTER TABLE public.limitup_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_locks FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_locks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_locks TO service_role;

ALTER TABLE public.limitup_jumps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_jumps FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_jumps FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_jumps TO service_role;

ALTER TABLE public.limitup_member_alloc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_member_alloc FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_member_alloc FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_member_alloc TO service_role;

ALTER TABLE public.limitup_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_facts FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_facts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_facts TO service_role;

ALTER TABLE public.limitup_touches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_touches FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_touches FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_touches TO service_role;

ALTER TABLE public.limitup_stage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_stage FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_stage FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_stage TO service_role;

ALTER TABLE public.limitup_loads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_loads FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_loads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_loads TO service_role;

ALTER TABLE public.limitup_grid_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_grid_summary FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_grid_summary FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_grid_summary TO service_role;

ALTER TABLE public.limitup_member_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_member_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_member_daily FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_member_daily TO service_role;

COMMIT;
