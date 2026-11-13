-- ============================================================
-- Phase 43 Plan 01 — 공시 알림 받침 pgTAP.
--
-- 대상: 20261113200000_dart_alert.sql (표 dart_alerts · dart_alert_state · RPC dart_alert_lease_acquire ·
--       dart_alert_lease_release · dart_alert_insert · dart_alert_claim · dart_alert_mark) +
--       20261113300000_dart_alert_fix.sql (리뷰 IN-01 — dart_alert_outage 에 p_since · 3인자 함수는 지움).
--
-- 잠그는 것:
--   S. 모양 — 표 2 · 함수 5(인자 형 그대로 — 워커 어댑터 43-02 가 이 시그니처로 부른다)
--   L. 임대 — 빈 상태 A 획득(held · fresh) · B 거절 · A 연장(fresh false) · p_last_ok 병합(NULL 이면 그대로) ·
--      만료 뒤 B 넘겨받음(fresh) · 주인 아닌 해제 false(두 칸 그대로) · 주인 해제 true → 해제 뒤 두 칸 NULL ·
--      해제가 last_ok 를 건드리지 않음 · 인자 검증 22023
--   I. 한 번만 넣기(SC-2) — 새 행만 반환([{rcept_no, late}]) · 같은 rcept_no 다시 넣기 → [] 이고 표는 1행씩 ·
--      섞어 넣으면 새 것만 · seed → seeded · 빈 배열 → [] · 보유자 아니면 55000
--   C. 송신 차례 — 오늘 · pending · next_attempt_at <= now() 만 · priority → first_seen_at 순 · p_limit 개 ·
--      sending · claimed_by · attempts + 1 · 반환 키 집합 · 보유자 아님 · 임대 만료 → 55000 · p_limit 검증 22023
--   M. 결과 기록 — 성공 → sent · sent_at · message id · last_error NULL / 실패 → pending · last_error 300자 자름 ·
--      next_attempt_at = now + 재시도 초(1 ~ 3600 으로 잘라 맞춤) · claimed_by NULL / sending 아님 · 남의 claimed_by → false ·
--      보유자 아니면 55000
--   P. 권한 — 일곱 RPC(43-02 outage · ops_stats 포함) anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY INVOKER · search_path 고정 ·
--      두 표 anon · authenticated SELECT 불가 · service_role 가능 · RLS 켜짐
--   R. (43-02) 끊긴 송신 되살리기 — 새 임대(빈 임대 · 남의 만료 임대)는 오늘 sending → pending(reclaimed_after_takeover ·
--      반환 reclaimed) · 지난 날 pending/sending → expired(반환 expired · sent · seeded 그대로) · 연장 · 거절은 아무것도
--      바꾸지 않음 / 차례의 송신 기한 90초 — 기한 안 · 남이 잡은 sending 은 다시 주지 않고, 내가 잡고 기한이 지난
--      sending 은 다시 준다(stale true · attempts + 1 · reclaimed_stale_claim) · pending 과 같은 순서로 섞임
--   O. (43-02) 장애 짝 상태 dart_alert_outage — open 은 닫혀 있을 때만 열고(opened true · since) · 「멈췄습니다」 가
--      pending 이면 다음 open 도 opened true(처음 시각) · notice(sent/failed)는 열려 있고 pending 일 때 한 번만 ·
--      sent/failed 뒤 open → opened false · close 는 열려 있을 때만(notify = 「멈췄습니다」 가 실제로 나갔을 때만) ·
--      닫힌 뒤 세 칸 NULL · 사유 300자 자름 · 보유자 아님 · 임대 만료 55000 · 모르는 action · notice 값 22023 ·
--      (리뷰 IN-01) p_since — 새로 열 때 since = 워커 기준점 · 미래는 now · 하루보다 먼 과거는 now − 1일로 잘라 맞춤
--   ST. (43-02) 운영 수치 dart_alert_ops_stats — 키 집합 · 픽스처 값(오늘 호출 · 한도 의심 · 상태별 · 감시 대상별 ·
--      늦은 알림 · 지연 p50/p90 · 장애 · last_ok · 임대 보유자) · p_days 1 ~ 31 로 잘라 맞춤(0 · NULL → 1 · 1000 → 31)
--      (절 이름 S 는 43-01 의 모양 절이 이미 써서 운영 수치는 ST 로 적는다)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 트랜잭션 안 now() 는 고정이라 「n초 뒤」 는 now() + interval 로 그대로 비교한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(183);

-- ── S. 모양 ───────────────────────────────────────────────────────
SELECT has_table('public', 'dart_alerts', 'S1 표 dart_alerts');
SELECT has_table('public', 'dart_alert_state', 'S2 표 dart_alert_state');
SELECT has_function('public', 'dart_alert_lease_acquire', ARRAY['text', 'integer', 'jsonb'], 'S3 dart_alert_lease_acquire(text, integer, jsonb)');
SELECT has_function('public', 'dart_alert_lease_release', ARRAY['text'], 'S4 dart_alert_lease_release(text)');
SELECT has_function('public', 'dart_alert_insert', ARRAY['text', 'jsonb', 'boolean'], 'S5 dart_alert_insert(text, jsonb, boolean)');
SELECT has_function('public', 'dart_alert_claim', ARRAY['text', 'integer'], 'S6 dart_alert_claim(text, integer)');
SELECT has_function('public', 'dart_alert_mark', ARRAY['text', 'text', 'boolean', 'bigint', 'text', 'integer'],
                    'S7 dart_alert_mark(text, text, boolean, bigint, text, integer)');
SELECT has_function('public', 'dart_alert_outage', ARRAY['text', 'text', 'text', 'timestamptz'],
                    'S9 dart_alert_outage(text, text, text, timestamptz) — 리뷰 IN-01 p_since');
SELECT hasnt_function('public', 'dart_alert_outage', ARRAY['text', 'text', 'text'],
                      'S11 3인자 dart_alert_outage 는 없다(같이 있으면 PostgREST 가 호출을 못 고른다)');
SELECT has_function('public', 'dart_alert_ops_stats', ARRAY['integer'], 'S10 dart_alert_ops_stats(integer)');
SELECT is((SELECT count(*)::int FROM public.dart_alert_state), 1, 'S8 dart_alert_state 시작 행 1개(id = 1)');

-- ── 도우미 ────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql AS $$ SELECT (now() AT TIME ZONE 'Asia/Seoul')::date $$;

-- p_items 원소 하나 — 키 = 컬럼 이름(43-01 lap.ts InsertItem 과 같다)
CREATE FUNCTION pg_temp.item(p_rcept text, p_watch text, p_priority int, p_late boolean, p_dt date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'rcept_no', p_rcept, 'watch', p_watch, 'priority', p_priority,
    'rcept_dt', to_char(coalesce(p_dt, pg_temp.today()), 'YYYY-MM-DD'),
    'corp_cls', 'K', 'corp_name', '에스텍', 'stock_code', '069510',
    'report_nm', '공개매수신고서', 'flr_nm', '가람홀딩스', 'late', p_late)
$$;

-- 결과 배열의 rcept_no (순서 그대로)
CREATE FUNCTION pg_temp.rcepts(p_r jsonb) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(e->>'rcept_no' ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(p_r) WITH ORDINALITY AS x(e, i)
$$;

CREATE FUNCTION pg_temp.st() RETURNS public.dart_alert_state LANGUAGE sql AS $$
  SELECT * FROM public.dart_alert_state WHERE id = 1
$$;

-- ── L. 임대 ───────────────────────────────────────────────────────
SELECT is(public.dart_alert_lease_acquire('A', 90),
          '{"held": true, "fresh": true, "reclaimed": 0, "expired": 0}'::jsonb, 'L1 빈 상태 → A 획득 · fresh');
SELECT is((pg_temp.st()).lease_holder, 'A', 'L2 lease_holder = A');
SELECT is((pg_temp.st()).lease_until, now() + interval '90 seconds', 'L3 lease_until = now + TTL');
SELECT is(public.dart_alert_lease_acquire('B', 90),
          '{"held": false, "fresh": false, "reclaimed": 0, "expired": 0}'::jsonb, 'L4 살아 있는 임대 → B 거절');
SELECT is(public.dart_alert_lease_acquire('A', 120, '{"tender_offer": "2026-11-11T00:30:00Z"}'::jsonb),
          '{"held": true, "fresh": false, "reclaimed": 0, "expired": 0}'::jsonb, 'L5 같은 실행 연장 → held · fresh false');
SELECT is((pg_temp.st()).lease_until, now() + interval '120 seconds', 'L6 연장 → lease_until 갱신');
SELECT is((pg_temp.st()).last_ok, '{"tender_offer": "2026-11-11T00:30:00Z"}'::jsonb, 'L7 p_last_ok 저장');
SELECT is(public.dart_alert_lease_acquire('A', 120, '{"rights_merger": "2026-11-11T00:31:00Z"}'::jsonb)->'held',
          'true'::jsonb, 'L8 다른 감시 대상 last_ok 로 연장');
SELECT is((pg_temp.st()).last_ok,
          '{"tender_offer": "2026-11-11T00:30:00Z", "rights_merger": "2026-11-11T00:31:00Z"}'::jsonb,
          'L9 p_last_ok 병합(기존 키 유지)');
SELECT is(public.dart_alert_lease_acquire('A', 120, NULL)->'held', 'true'::jsonb, 'L10 p_last_ok NULL 로 연장');
SELECT is((pg_temp.st()).last_ok,
          '{"tender_offer": "2026-11-11T00:30:00Z", "rights_merger": "2026-11-11T00:31:00Z"}'::jsonb,
          'L11 p_last_ok NULL → last_ok 그대로');
SELECT is(public.dart_alert_lease_acquire('B', 90, '{"tender_offer": "B-WRITE"}'::jsonb)->'held', 'false'::jsonb,
          'L12 남의 살아 있는 임대 중 B 의 p_last_ok → 거절');
SELECT is((pg_temp.st()).last_ok->>'tender_offer', '2026-11-11T00:30:00Z', 'L13 거절된 B 는 last_ok 를 못 바꿈');
UPDATE public.dart_alert_state SET lease_until = now() - interval '1 second' WHERE id = 1;
SELECT is(public.dart_alert_lease_acquire('B', 90),
          '{"held": true, "fresh": true, "reclaimed": 0, "expired": 0}'::jsonb, 'L14 만료 뒤 → B 넘겨받음 · fresh');
SELECT is(public.dart_alert_lease_release('A'), false, 'L15 주인 아닌 해제 → false');
SELECT ok((pg_temp.st()).lease_holder = 'B' AND (pg_temp.st()).lease_until = now() + interval '90 seconds',
          'L16 주인 아닌 해제 뒤에도 두 칸 그대로(B · lease_until)');
SELECT is(public.dart_alert_lease_release('B'), true, 'L17 주인 해제 → true');
SELECT ok((pg_temp.st()).lease_holder IS NULL AND (pg_temp.st()).lease_until IS NULL,
          'L18 해제 뒤 두 칸 NULL(lease_holder · lease_until)');
SELECT is((pg_temp.st()).last_ok->>'rights_merger', '2026-11-11T00:31:00Z', 'L19 해제는 last_ok 를 건드리지 않음');
SELECT throws_ok($$SELECT public.dart_alert_lease_acquire('A', 0)$$, '22023', NULL, 'L20 TTL ≤ 0 → 22023');
SELECT throws_ok($$SELECT public.dart_alert_lease_acquire('', 90)$$, '22023', NULL, 'L21 빈 holder → 22023');
SELECT throws_ok($$SELECT public.dart_alert_lease_acquire('A', 90, '["x"]'::jsonb)$$, '22023', NULL,
                 'L22 p_last_ok 가 객체 아님 → 22023');

-- 이후 절의 보유자 H
SELECT is(public.dart_alert_lease_acquire('H', 300)->'held', 'true'::jsonb, 'L23 H 획득(이후 절의 보유자)');

-- ── I. 한 번만 넣기 ───────────────────────────────────────────────
SELECT is(public.dart_alert_insert('H', jsonb_build_array(
            pg_temp.item('20991231000001', 'tender_offer', 0, false),
            pg_temp.item('20991231000002', 'tender_offer', 0, true)), false),
          '[{"rcept_no": "20991231000001", "late": false}, {"rcept_no": "20991231000002", "late": true}]'::jsonb,
          'I1 새 2건 → 2행 반환 [{rcept_no, late}]');
SELECT ok((SELECT status = 'pending' AND attempts = 0 AND watch = 'tender_offer' AND priority = 0
                  AND rcept_dt = pg_temp.today() AND corp_cls = 'K' AND corp_name = '에스텍' AND stock_code = '069510'
                  AND report_nm = '공개매수신고서' AND flr_nm = '가람홀딩스' AND late = false
                  AND next_attempt_at = now() AND first_seen_at = now() AND claimed_by IS NULL
             FROM public.dart_alerts WHERE rcept_no = '20991231000001'),
          'I2 넣은 행 — pending · attempts 0 · 칸 그대로');
SELECT is(public.dart_alert_insert('H', jsonb_build_array(
            pg_temp.item('20991231000001', 'tender_offer', 0, true)), false),
          '[]'::jsonb, 'I3 같은 rcept_no 다시 넣기 → []');
SELECT is((SELECT count(*)::int FROM public.dart_alerts WHERE rcept_no IN ('20991231000001', '20991231000002')), 2,
          'I4 표는 그대로 1행씩');
SELECT is((SELECT late FROM public.dart_alerts WHERE rcept_no = '20991231000001'), false,
          'I5 다시 넣기는 기존 행을 바꾸지 않음(late 그대로)');
SELECT is(public.dart_alert_insert('H', jsonb_build_array(
            pg_temp.item('20991231000002', 'tender_offer', 0, false),
            pg_temp.item('20991231000003', 'rights_merger', 1, false)), false),
          '[{"rcept_no": "20991231000003", "late": false}]'::jsonb, 'I6 섞어 넣기 → 새 것만 반환');
SELECT is(public.dart_alert_insert('H', jsonb_build_array(
            pg_temp.item('20991231000004', 'tender_offer', 0, false)), true),
          '[{"rcept_no": "20991231000004", "late": false}]'::jsonb, 'I7 seed 넣기 → 반환');
SELECT is((SELECT status FROM public.dart_alerts WHERE rcept_no = '20991231000004'), 'seeded', 'I8 seed → seeded');
SELECT is(public.dart_alert_insert('H', '[]'::jsonb, false), '[]'::jsonb, 'I9 빈 배열 → []');
SELECT throws_ok($$SELECT public.dart_alert_insert('X', jsonb_build_array(pg_temp.item('20991231000005', 'tender_offer', 0, false)), false)$$,
                 '55000', NULL, 'I10 보유자 아님 → 55000');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.dart_alerts WHERE rcept_no = '20991231000005'), 'I11 거절된 넣기는 행을 남기지 않음');
SELECT throws_ok($$SELECT public.dart_alert_insert('H', '{"rcept_no": "x"}'::jsonb, false)$$, '22023', NULL,
                 'I12 p_items 가 배열 아님 → 22023');

-- ── C. 송신 차례 ──────────────────────────────────────────────────
DELETE FROM public.dart_alerts;
INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code, report_nm, flr_nm,
                                late, status, next_attempt_at, first_seen_at) VALUES
  ('20991231000011', 'tender_offer',  0, pg_temp.today(),     'K', '에스텍', '069510', '공개매수신고서', '가람홀딩스', false, 'pending', now(),                        now() - interval '10 seconds'),
  ('20991231000012', 'rights_merger', 1, pg_temp.today(),     'Y', '나래',   '000010', '주요사항보고서(유상증자결정)', '나래', true, 'pending', now() - interval '5 seconds', now() - interval '60 seconds'),
  ('20991231000013', 'rights_merger', 1, pg_temp.today(),     'Y', '다온',   '000020', '주요사항보고서(회사합병결정)', '다온', false, 'pending', now(),                     now() - interval '30 seconds'),
  ('20991231000014', 'tender_offer',  0, pg_temp.today(),     'K', '라온',   '000030', '공개매수신고서', '라온홀딩스', false, 'pending', now() + interval '30 seconds', now() - interval '90 seconds'),
  ('20991231000015', 'tender_offer',  0, pg_temp.today() - 1, 'K', '마루',   '000040', '공개매수신고서', '마루홀딩스', false, 'pending', now() - interval '1 day',   now() - interval '1 day'),
  ('20991231000016', 'tender_offer',  0, pg_temp.today(),     'K', '바다',   '000050', '공개매수신고서', '바다홀딩스', false, 'sent',    now(),                        now() - interval '120 seconds'),
  ('20991231000017', 'tender_offer',  0, pg_temp.today(),     'K', '사랑',   '000060', '공개매수신고서', '사랑홀딩스', false, 'seeded',  now(),                        now() - interval '120 seconds');

SELECT is(pg_temp.rcepts(public.dart_alert_claim('H', 2)), ARRAY['20991231000011', '20991231000012'],
          'C1 limit 2 → priority 0 먼저, 그다음 first_seen_at 이른 순');
SELECT ok((SELECT bool_and(status = 'sending' AND claimed_by = 'H' AND attempts = 1)
             FROM public.dart_alerts WHERE rcept_no IN ('20991231000011', '20991231000012')),
          'C2 잡은 행 → sending · claimed_by H · attempts 1');
CREATE TEMP TABLE c_out AS SELECT public.dart_alert_claim('H', 10) AS r;
SELECT is(pg_temp.rcepts((SELECT r FROM c_out)), ARRAY['20991231000013'],
          'C3 나머지 — 미래 next_attempt_at · 어제 · sent · seeded · 이미 sending 제외');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT r->0 FROM c_out)) k),
          ARRAY['attempts', 'corp_cls', 'corp_name', 'first_seen_at', 'flr_nm', 'late', 'rcept_no', 'report_nm', 'stale', 'stock_code', 'watch'],
          'C4 원소 키 집합(43-01 lap.ts ClaimedRow + 43-02 stale)');
SELECT ok((SELECT (r->0->>'watch') = 'rights_merger' AND (r->0->>'attempts')::int = 1 AND (r->0->>'late')::boolean = false
                  AND (r->0->>'first_seen_at')::timestamptz = now() - interval '30 seconds'
                  AND (r->0->>'report_nm') = '주요사항보고서(회사합병결정)'
             FROM c_out),
          'C5 원소 값 그대로(watch · attempts · late · first_seen_at · report_nm)');
SELECT is(public.dart_alert_claim('H', 10), '[]'::jsonb, 'C6 더 없음 → []');
SELECT ok((SELECT bool_and(status = 'pending' AND attempts = 0) FROM public.dart_alerts
            WHERE rcept_no IN ('20991231000014', '20991231000015')),
          'C7 미래 · 어제 행은 pending · attempts 0 그대로');
SELECT throws_ok($$SELECT public.dart_alert_claim('X', 10)$$, '55000', NULL, 'C8 보유자 아님 → 55000');
UPDATE public.dart_alert_state SET lease_until = now() - interval '1 second' WHERE id = 1;
SELECT throws_ok($$SELECT public.dart_alert_claim('H', 10)$$, '55000', NULL, 'C9 임대 만료(보유자 이름이 같아도) → 55000');
UPDATE public.dart_alert_state SET lease_until = now() + interval '300 seconds' WHERE id = 1;
SELECT throws_ok($$SELECT public.dart_alert_claim('H', 0)$$, '22023', NULL, 'C10 p_limit < 1 → 22023');

-- ── M. 결과 기록 ──────────────────────────────────────────────────
SELECT is(public.dart_alert_mark('H', '20991231000011', true, 777, NULL, 0), true, 'M1 성공 기록 → true');
SELECT ok((SELECT status = 'sent' AND telegram_message_id = 777 AND sent_at = now() AND last_error IS NULL
             FROM public.dart_alerts WHERE rcept_no = '20991231000011'),
          'M2 성공 → sent · message id · sent_at');
SELECT is(public.dart_alert_mark('H', '20991231000011', true, 778, NULL, 0), false, 'M3 이미 sent → false');
SELECT is((SELECT telegram_message_id FROM public.dart_alerts WHERE rcept_no = '20991231000011'), 777::bigint,
          'M4 두 번째 기록은 message id 를 바꾸지 않음');
SELECT is(public.dart_alert_mark('H', '20991231000012', false, NULL, repeat('e', 400), 30), true, 'M5 실패 기록 → true');
SELECT ok((SELECT status = 'pending' AND length(last_error) = 300 AND next_attempt_at = now() + interval '30 seconds'
                  AND claimed_by IS NULL AND attempts = 1 AND sent_at IS NULL
             FROM public.dart_alerts WHERE rcept_no = '20991231000012'),
          'M6 실패 → pending · last_error 300자 자름 · next_attempt_at 미래 · claimed_by NULL');
SELECT is(public.dart_alert_mark('H', '20991231000014', false, NULL, 'x', 5), false, 'M7 sending 아닌 행 → false');
UPDATE public.dart_alerts SET claimed_by = 'OTHER' WHERE rcept_no = '20991231000013';
SELECT is(public.dart_alert_mark('H', '20991231000013', true, 1, NULL, 0), false, 'M8 남의 claimed_by → false');
SELECT is((SELECT status FROM public.dart_alerts WHERE rcept_no = '20991231000013'), 'sending', 'M9 남의 행은 그대로 sending');
UPDATE public.dart_alerts SET claimed_by = 'H' WHERE rcept_no = '20991231000013';
SELECT is(public.dart_alert_mark('H', '20991231000013', false, NULL, 'rate:999', 99999), true, 'M10 큰 재시도 초 기록');
SELECT is((SELECT next_attempt_at FROM public.dart_alerts WHERE rcept_no = '20991231000013'), now() + interval '3600 seconds',
          'M11 재시도 초 상한 3600');
UPDATE public.dart_alerts SET status = 'sending', claimed_by = 'H' WHERE rcept_no = '20991231000014';
SELECT is(public.dart_alert_mark('H', '20991231000014', false, NULL, 'transient:0', 0), true, 'M12 0초 재시도 기록');
SELECT is((SELECT next_attempt_at FROM public.dart_alerts WHERE rcept_no = '20991231000014'), now() + interval '1 second',
          'M13 재시도 초 하한 1');
UPDATE public.dart_alerts SET status = 'sending', claimed_by = 'H' WHERE rcept_no = '20991231000012';
SELECT is(public.dart_alert_mark('H', '20991231000012', true, 900, NULL, 0), true, 'M14 실패 뒤 성공 기록');
SELECT is((SELECT last_error FROM public.dart_alerts WHERE rcept_no = '20991231000012'), NULL, 'M15 성공 → last_error 지움');
SELECT throws_ok($$SELECT public.dart_alert_mark('X', '20991231000013', true, 1, NULL, 0)$$, '55000', NULL,
                 'M16 보유자 아님 → 55000');

-- ── P. 권한 · 함수 속성 ────────────────────────────────────────────
SELECT is(has_function_privilege(r.role, f.sig, 'EXECUTE'), r.expect,
          format('P %s EXECUTE %s = %s', r.role, f.sig, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 CROSS JOIN (VALUES
   ('public.dart_alert_lease_acquire(text,integer,jsonb)'),
   ('public.dart_alert_lease_release(text)'),
   ('public.dart_alert_insert(text,jsonb,boolean)'),
   ('public.dart_alert_claim(text,integer)'),
   ('public.dart_alert_mark(text,text,boolean,bigint,text,integer)'),
   ('public.dart_alert_outage(text,text,text,timestamptz)'),
   ('public.dart_alert_ops_stats(integer)')) AS f(sig)
 ORDER BY f.sig, r.role;
SELECT ok(NOT (SELECT bool_or(prosecdef) FROM pg_proc
                WHERE oid IN ('public.dart_alert_lease_acquire(text,integer,jsonb)'::regprocedure,
                              'public.dart_alert_lease_release(text)'::regprocedure,
                              'public.dart_alert_insert(text,jsonb,boolean)'::regprocedure,
                              'public.dart_alert_claim(text,integer)'::regprocedure,
                              'public.dart_alert_mark(text,text,boolean,bigint,text,integer)'::regprocedure,
                              'public.dart_alert_outage(text,text,text,timestamptz)'::regprocedure,
                              'public.dart_alert_ops_stats(integer)'::regprocedure)),
          'P 일곱 함수 SECURITY INVOKER');
SELECT ok((SELECT bool_and('search_path=public, pg_temp' = ANY (proconfig)) FROM pg_proc
            WHERE oid IN ('public.dart_alert_lease_acquire(text,integer,jsonb)'::regprocedure,
                          'public.dart_alert_lease_release(text)'::regprocedure,
                          'public.dart_alert_insert(text,jsonb,boolean)'::regprocedure,
                          'public.dart_alert_claim(text,integer)'::regprocedure,
                          'public.dart_alert_mark(text,text,boolean,bigint,text,integer)'::regprocedure,
                          'public.dart_alert_outage(text,text,text,timestamptz)'::regprocedure,
                          'public.dart_alert_ops_stats(integer)'::regprocedure)),
          'P 일곱 함수 search_path 고정');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid = 'public.dart_alert_ops_stats(integer)'::regprocedure), 's',
          'P dart_alert_ops_stats 는 STABLE(읽기 전용)');
SELECT is(has_table_privilege(r.role, t.tbl, 'SELECT'), r.expect,
          format('P %s SELECT %s = %s', r.role, t.tbl, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 CROSS JOIN (VALUES ('public.dart_alerts'), ('public.dart_alert_state')) AS t(tbl)
 ORDER BY t.tbl, r.role;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dart_alerts'::regclass), 'P dart_alerts RLS 활성');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dart_alert_state'::regclass), 'P dart_alert_state RLS 활성');

-- ── R. 끊긴 송신 되살리기 · 지난 날 닫기 · 송신 기한(43-02) ────────────────
-- 빈 임대 + 죽은 실행이 남긴 행들
DELETE FROM public.dart_alerts;
UPDATE public.dart_alert_state SET lease_holder = NULL, lease_until = NULL WHERE id = 1;
INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code, report_nm, flr_nm,
                                status, attempts, claimed_by, next_attempt_at, first_seen_at) VALUES
  ('20991231000021', 'tender_offer',  0, pg_temp.today(),     'K', '에스텍', '069510', '공개매수신고서', '가람홀딩스', 'sending', 1, 'DEAD', now() - interval '20 seconds', now() - interval '60 seconds'),
  ('20991231000022', 'rights_merger', 1, pg_temp.today(),     'Y', '나래',   '000010', '주요사항보고서(유상증자결정)', '나래', 'sending', 2, 'DEAD', now() + interval '60 seconds', now() - interval '50 seconds'),
  ('20991231000023', 'tender_offer',  0, pg_temp.today(),     'K', '다온',   '000020', '공개매수신고서', '다온홀딩스', 'pending', 0, NULL,   now() + interval '30 seconds', now() - interval '40 seconds'),
  ('20991231000024', 'tender_offer',  0, pg_temp.today() - 1, 'K', '라온',   '000030', '공개매수신고서', '라온홀딩스', 'pending', 0, NULL,   now() - interval '1 day',      now() - interval '1 day'),
  ('20991231000025', 'tender_offer',  0, pg_temp.today() - 1, 'K', '마루',   '000040', '공개매수신고서', '마루홀딩스', 'sending', 1, 'DEAD', now() - interval '1 day',      now() - interval '1 day'),
  ('20991231000026', 'tender_offer',  0, pg_temp.today() - 1, 'K', '바다',   '000050', '공개매수신고서', '바다홀딩스', 'sent',    1, 'DEAD', now() - interval '1 day',      now() - interval '1 day'),
  ('20991231000027', 'tender_offer',  0, pg_temp.today() - 1, 'K', '사랑',   '000060', '공개매수신고서', '사랑홀딩스', 'seeded',  0, NULL,   now() - interval '1 day',      now() - interval '1 day');

SELECT is(public.dart_alert_lease_acquire('A', 90),
          '{"held": true, "fresh": true, "reclaimed": 2, "expired": 2}'::jsonb,
          'R1 빈 임대에서 A 획득 → 오늘 sending 2 되돌림 · 지난 날 2 닫힘');
SELECT ok((SELECT bool_and(status = 'pending' AND claimed_by IS NULL AND last_error = 'reclaimed_after_takeover'
                           AND next_attempt_at <= now())
             FROM public.dart_alerts WHERE rcept_no IN ('20991231000021', '20991231000022')),
          'R2 오늘 sending → pending · claimed_by NULL · reclaimed_after_takeover · 바로 차례');
SELECT is((SELECT array_agg(attempts ORDER BY rcept_no) FROM public.dart_alerts
            WHERE rcept_no IN ('20991231000021', '20991231000022')), ARRAY[1, 2],
          'R3 되돌림은 attempts 를 바꾸지 않음(흔적 그대로)');
SELECT is((SELECT array_agg(status ORDER BY rcept_no) FROM public.dart_alerts
            WHERE rcept_no IN ('20991231000024', '20991231000025')), ARRAY['expired', 'expired'],
          'R4 지난 날 pending · sending → expired');
SELECT is((SELECT array_agg(status ORDER BY rcept_no) FROM public.dart_alerts
            WHERE rcept_no IN ('20991231000026', '20991231000027')), ARRAY['sent', 'seeded'],
          'R5 지난 날 sent · seeded 는 그대로');
SELECT ok((SELECT status = 'pending' AND last_error IS NULL AND next_attempt_at = now() + interval '30 seconds'
             FROM public.dart_alerts WHERE rcept_no = '20991231000023'),
          'R6 오늘 pending 은 그대로(다음 시도 시각 · last_error)');

-- A 가 다시 하나를 잡은 상태 · 어제 미송신 1건이 새로 생김 → 연장 · 남의 시도는 아무것도 바꾸지 않는다
UPDATE public.dart_alerts SET status = 'sending', claimed_by = 'A', last_error = NULL WHERE rcept_no = '20991231000021';
INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code, report_nm, flr_nm, status)
VALUES ('20991231000028', 'tender_offer', 0, pg_temp.today() - 1, 'K', '아라', '000070', '공개매수신고서', '아라홀딩스', 'pending');
SELECT is(public.dart_alert_lease_acquire('A', 90),
          '{"held": true, "fresh": false, "reclaimed": 0, "expired": 0}'::jsonb, 'R7 A 연장 → reclaimed 0 · expired 0');
SELECT ok((SELECT status = 'sending' AND claimed_by = 'A' FROM public.dart_alerts WHERE rcept_no = '20991231000021')
          AND (SELECT status = 'pending' FROM public.dart_alerts WHERE rcept_no = '20991231000028'),
          'R8 연장은 내 sending · 지난 날 pending 을 건드리지 않음');
SELECT is(public.dart_alert_lease_acquire('B', 90),
          '{"held": false, "fresh": false, "reclaimed": 0, "expired": 0}'::jsonb, 'R9 남의 살아 있는 임대 → B 거절');
SELECT ok((SELECT status = 'sending' AND claimed_by = 'A' FROM public.dart_alerts WHERE rcept_no = '20991231000021')
          AND (SELECT status = 'pending' FROM public.dart_alerts WHERE rcept_no = '20991231000028'),
          'R10 거절된 B 는 아무 행도 바꾸지 않음');

-- A 의 임대가 만료 → B 가 넘겨받음
UPDATE public.dart_alert_state SET lease_until = now() - interval '1 second' WHERE id = 1;
SELECT is(public.dart_alert_lease_acquire('B', 90),
          '{"held": true, "fresh": true, "reclaimed": 1, "expired": 1}'::jsonb,
          'R11 만료된 A 의 임대를 B 가 넘겨받음 → fresh · A 의 sending 되돌림 · 지난 날 닫힘');
SELECT ok((SELECT status = 'pending' AND claimed_by IS NULL AND last_error = 'reclaimed_after_takeover'
             FROM public.dart_alerts WHERE rcept_no = '20991231000021'),
          'R12 A 가 잡아 둔 오늘 sending → pending');
SELECT is((SELECT status FROM public.dart_alerts WHERE rcept_no = '20991231000028'), 'expired', 'R13 지난 날 pending → expired');

-- 송신 기한 — B 를 풀고 A 가 새로 잡는다(되돌릴 sending 없음)
SELECT is(public.dart_alert_lease_release('B'), true, 'R14 B 해제');
SELECT is(public.dart_alert_lease_acquire('A', 300),
          '{"held": true, "fresh": true, "reclaimed": 0, "expired": 0}'::jsonb, 'R15 A 새로 잡음 · 되돌릴 것 없음 → 0 · 0');
DELETE FROM public.dart_alerts;
INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code, report_nm, flr_nm,
                                status, attempts, claimed_by, next_attempt_at, first_seen_at) VALUES
  ('20991231000031', 'tender_offer', 0, pg_temp.today(), 'K', '에스텍', '069510', '공개매수신고서', '가람홀딩스', 'pending', 0, NULL,        now(),                        now() - interval '30 seconds'),
  ('20991231000032', 'tender_offer', 0, pg_temp.today(), 'K', '나래',   '000010', '공개매수신고서', '나래홀딩스', 'sending', 1, 'other-run', now() - interval '1 second',  now() - interval '20 seconds');

CREATE TEMP TABLE r_out AS SELECT public.dart_alert_claim('A', 10) AS r;
SELECT is(pg_temp.rcepts((SELECT r FROM r_out)), ARRAY['20991231000031'],
          'R16 첫 차례 → pending 만(남이 잡은 기한 지난 sending 은 제외)');
SELECT is((SELECT r->0->'stale' FROM r_out), 'false'::jsonb, 'R17 처음 주는 행 → stale false');
SELECT ok((SELECT status = 'sending' AND claimed_by = 'A' AND attempts = 1
                  AND next_attempt_at = now() + interval '90 seconds'
             FROM public.dart_alerts WHERE rcept_no = '20991231000031'),
          'R18 sending · 송신 기한 next_attempt_at = now + 90초');
SELECT is(public.dart_alert_claim('A', 10), '[]'::jsonb, 'R19 기한 안에 다시 차례 → 주지 않음');

-- 90초 경과 흉내(mark 가 실패 · 던짐 · 응답 끊김으로 결과가 안 적힌 경우)
UPDATE public.dart_alerts SET next_attempt_at = now() - interval '1 second' WHERE rcept_no = '20991231000031';
DROP TABLE r_out;
CREATE TEMP TABLE r_out AS SELECT public.dart_alert_claim('A', 10) AS r;
SELECT is(pg_temp.rcepts((SELECT r FROM r_out)), ARRAY['20991231000031'], 'R20 기한 지난 내 sending → 다시 줌');
SELECT is((SELECT r->0->'stale' FROM r_out), 'true'::jsonb, 'R21 다시 준 행 → stale true');
SELECT ok((SELECT status = 'sending' AND claimed_by = 'A' AND attempts = 2 AND last_error = 'reclaimed_stale_claim'
                  AND next_attempt_at = now() + interval '90 seconds'
             FROM public.dart_alerts WHERE rcept_no = '20991231000031'),
          'R22 다시 준 행 → attempts 2 · reclaimed_stale_claim · 기한 새로');
SELECT ok((SELECT status = 'sending' AND claimed_by = 'other-run' AND attempts = 1 AND last_error IS NULL
             FROM public.dart_alerts WHERE rcept_no = '20991231000032'),
          'R23 남이 잡은 sending 은 그대로');
SELECT is(public.dart_alert_mark('A', '20991231000031', true, 555, NULL, 0), true, 'R24 다시 받은 행 성공 기록 → true');
SELECT ok((SELECT status = 'sent' AND telegram_message_id = 555 AND last_error IS NULL
             FROM public.dart_alerts WHERE rcept_no = '20991231000031'),
          'R25 → sent · last_error 지움');

-- 기한 지난 내 sending 과 pending 은 같은 순서(priority → first_seen_at)로 섞여 p_limit 안에서 나온다
INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code, report_nm, flr_nm,
                                status, attempts, claimed_by, next_attempt_at, first_seen_at) VALUES
  ('20991231000033', 'rights_merger', 1, pg_temp.today(), 'Y', '다온', '000020', '주요사항보고서(회사합병결정)', '다온', 'pending', 0, NULL, now(),                       now() - interval '100 seconds'),
  ('20991231000034', 'tender_offer',  0, pg_temp.today(), 'K', '라온', '000030', '공개매수신고서', '라온홀딩스',       'sending', 1, 'A',  now() - interval '1 second', now() - interval '10 seconds');
SELECT is(public.dart_alert_claim('A', 1)->0->>'rcept_no', '20991231000034', 'R26 limit 1 → priority 0 인 기한 지난 내 sending 먼저');
SELECT is((SELECT jsonb_agg(jsonb_build_array(e->>'rcept_no', e->'stale'))
             FROM jsonb_array_elements(public.dart_alert_claim('A', 1)) e),
          '[["20991231000033", false]]'::jsonb, 'R27 다음 limit 1 → pending(stale false)');

-- ── O. 장애 짝 상태(43-02 · D-16 · D-17) ──────────────────────────────
-- 보유자 A(R15 · 300초)
SELECT is(public.dart_alert_outage('A', 'open', 'DART 조회 실패 — 하루 조회 한도 초과(020)'),
          jsonb_build_object('opened', true, 'since', now()), 'O1 장애 없음 → open → opened true · since now');
SELECT ok((SELECT outage_since = now() AND outage_reason = 'DART 조회 실패 — 하루 조회 한도 초과(020)'
                  AND outage_notice = 'pending' FROM public.dart_alert_state WHERE id = 1),
          'O2 세 칸 채움(since · reason · notice pending)');
-- 연 실행이 「멈췄습니다」 를 못 남기고 죽은 경우 — 처음 시각을 과거로 옮겨 구분한다
UPDATE public.dart_alert_state SET outage_since = now() - interval '5 minutes' WHERE id = 1;
SELECT is(public.dart_alert_outage('A', 'open', '다른 사유'),
          jsonb_build_object('opened', true, 'since', now() - interval '5 minutes'),
          'O3 notice pending 인 채 open → opened true · since 처음 시각');
SELECT is((pg_temp.st()).outage_reason, 'DART 조회 실패 — 하루 조회 한도 초과(020)', 'O4 다시 연 open 은 처음 사유를 덮지 않음');
SELECT is(public.dart_alert_outage('A', 'notice', 'sent'), '{"noticed": true}'::jsonb, 'O5 notice sent → 기록');
SELECT is((pg_temp.st()).outage_notice, 'sent', 'O6 outage_notice = sent');
SELECT is(public.dart_alert_outage('A', 'open', 'DART 조회 실패'), '{"opened": false}'::jsonb,
          'O7 「멈췄습니다」 가 나간 뒤 open → opened false(글 한 번)');
SELECT is(public.dart_alert_outage('A', 'notice', 'failed'), '{"noticed": false}'::jsonb,
          'O8 이미 sent 인 notice 는 다시 적지 않음(한 번만)');
SELECT is(public.dart_alert_outage('A', 'close'),
          jsonb_build_object('closed', true, 'notify', true, 'since', now() - interval '5 minutes'),
          'O9 close — 「멈췄습니다」 sent → notify true · since');
SELECT ok((pg_temp.st()).outage_since IS NULL AND (pg_temp.st()).outage_reason IS NULL AND (pg_temp.st()).outage_notice IS NULL,
          'O10 닫힌 뒤 세 칸 NULL');
SELECT is(public.dart_alert_outage('A', 'close'), '{"closed": false}'::jsonb, 'O11 열려 있지 않으면 close → closed false');
SELECT is(public.dart_alert_outage('A', 'notice', 'sent'), '{"noticed": false}'::jsonb, 'O12 닫힌 상태 notice → 기록 안 함');
SELECT is((pg_temp.st()).outage_notice, NULL, 'O13 닫힌 상태 notice 는 칸을 채우지 않음');
-- 텔레그램도 죽어 「멈췄습니다」 를 못 보낸 경우(failed) — 다시 두드리지 않고, 복구 때도 알리지 않는다
SELECT is(public.dart_alert_outage('A', 'open', 'DART 연속 실패')->'opened', 'true'::jsonb, 'O14 새 장애 open');
SELECT is(public.dart_alert_outage('A', 'notice', 'failed'), '{"noticed": true}'::jsonb, 'O15 notice failed → 기록');
SELECT is((pg_temp.st()).outage_notice, 'failed', 'O16 outage_notice = failed');
SELECT is(public.dart_alert_outage('A', 'open', 'DART 연속 실패'), '{"opened": false}'::jsonb,
          'O17 failed 뒤 open → opened false(이메일이 덮는다)');
SELECT is(public.dart_alert_outage('A', 'close'),
          jsonb_build_object('closed', true, 'notify', false, 'since', now()), 'O18 failed 장애 close → notify false');
-- 「멈췄습니다」 가 pending 인 채 복구
SELECT is(public.dart_alert_outage('A', 'open', repeat('x', 400))->'opened', 'true'::jsonb, 'O19 사유 400자로 open');
SELECT is(length((pg_temp.st()).outage_reason), 300, 'O20 사유 300자 자름');
SELECT is(public.dart_alert_outage('A', 'close'),
          jsonb_build_object('closed', true, 'notify', false, 'since', now()), 'O21 pending 장애 close → notify false');
SELECT throws_ok($$SELECT public.dart_alert_outage('X', 'open', 'r')$$, '55000', NULL, 'O22 보유자 아님 → 55000');
SELECT is((pg_temp.st()).outage_since, NULL, 'O23 거절된 open 은 장애를 열지 않음');
SELECT throws_ok($$SELECT public.dart_alert_outage('A', 'reopen', NULL)$$, '22023', NULL, 'O24 모르는 action → 22023');
SELECT throws_ok($$SELECT public.dart_alert_outage('A', 'notice', 'maybe')$$, '22023', NULL, 'O25 notice 값이 sent/failed 밖 → 22023');
SELECT throws_ok($$SELECT public.dart_alert_outage('A', 'notice')$$, '22023', NULL, 'O26 notice 값 없음 → 22023');
UPDATE public.dart_alert_state SET lease_until = now() - interval '1 second' WHERE id = 1;
SELECT throws_ok($$SELECT public.dart_alert_outage('A', 'close')$$, '55000', NULL, 'O27 임대 만료(이름이 같아도) → 55000');
UPDATE public.dart_alert_state SET lease_until = now() + interval '300 seconds' WHERE id = 1;
-- (리뷰 IN-01) p_since — 「멈췄습니다」 · 「다시 동작」 의 시작 시각이 워커 기준점과 같아야 한다
SELECT is(public.dart_alert_outage('A', 'open', 'DART 조회 실패', now() - interval '7 minutes'),
          jsonb_build_object('opened', true, 'since', now() - interval '7 minutes'), 'O28 p_since → since = 워커 기준점');
SELECT is((pg_temp.st()).outage_since, now() - interval '7 minutes', 'O29 outage_since = 워커 기준점');
SELECT is(public.dart_alert_outage('A', 'close'),
          jsonb_build_object('closed', true, 'notify', false, 'since', now() - interval '7 minutes'),
          'O30 다른 실행이 닫아도 같은 시작 시각');
SELECT is(public.dart_alert_outage('A', 'open', 'r', now() + interval '1 hour')->'since', to_jsonb(now()),
          'O31 미래 p_since → now');
SELECT is(public.dart_alert_outage('A', 'close')->'since', to_jsonb(now()), 'O32 close since = now');
SELECT is(public.dart_alert_outage('A', 'open', 'r', now() - interval '3 days')->'since', to_jsonb(now() - interval '1 day'),
          'O33 하루보다 먼 과거 p_since → now − 1일');
SELECT is(public.dart_alert_outage('A', 'close')->'closed', 'true'::jsonb, 'O34 close');
SELECT is(public.dart_alert_outage('A', 'open', 'r', NULL)->'since', to_jsonb(now()), 'O35 p_since NULL → now(예전 동작)');
SELECT is(public.dart_alert_outage('A', 'close')->'closed', 'true'::jsonb, 'O36 close');

-- ── ST. 운영 수치(43-02 · SC-4 · SC-7) ───────────────────────────────
DELETE FROM public.dart_alerts;
INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code, report_nm, flr_nm,
                                late, status, first_seen_at, sent_at) VALUES
  ('20991231000041', 'tender_offer',  0, pg_temp.today(),      'K', '가', '000001', '공개매수신고서', '가', false, 'sent',    now() - interval '100 seconds', now() - interval '90 seconds'),
  ('20991231000042', 'tender_offer',  0, pg_temp.today(),      'K', '나', '000002', '공개매수신고서', '나', true,  'sent',    now() - interval '100 seconds', now() - interval '80 seconds'),
  ('20991231000043', 'rights_merger', 1, pg_temp.today(),      'Y', '다', '000003', '주요사항보고서(유상증자결정)', '다', false, 'sent', now() - interval '100 seconds', now() - interval '60 seconds'),
  ('20991231000044', 'tender_offer',  0, pg_temp.today(),      'K', '라', '000004', '공개매수신고서', '라', false, 'pending', now(), NULL),
  ('20991231000045', 'tender_offer',  0, pg_temp.today(),      'K', '마', '000005', '공개매수신고서', '마', false, 'seeded',  now(), NULL),
  ('20991231000046', 'rights_merger', 1, pg_temp.today(),      'Y', '바', '000006', '주요사항보고서(회사합병결정)', '바', false, 'seeded', now(), NULL),
  ('20991231000047', 'tender_offer',  0, pg_temp.today() - 2,  'K', '사', '000007', '공개매수신고서', '사', false, 'sent',    now() - interval '2 days', now() - interval '2 days'),
  ('20991231000048', 'tender_offer',  0, pg_temp.today() - 40, 'K', '아', '000008', '공개매수신고서', '아', false, 'expired', now() - interval '40 days', NULL);
INSERT INTO public.api_usage (service, usage_date, count) VALUES
  ('opendart_list', pg_temp.today(), 1234),
  ('opendart_list_quota_strike', pg_temp.today(), 1),
  ('opendart_list', pg_temp.today() - 1, 999)
ON CONFLICT (service, usage_date) DO UPDATE SET count = EXCLUDED.count;
UPDATE public.dart_alert_state
   SET last_ok = '{"tender_offer": "2026-11-12T01:00:00Z"}'::jsonb,
       outage_since = now(), outage_reason = 'DART 조회 실패', outage_notice = 'sent'
 WHERE id = 1;

CREATE TEMP TABLE st_out AS SELECT public.dart_alert_ops_stats(1) AS r;
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT r FROM st_out)) k),
          ARRAY['by_status', 'by_watch', 'calls_today', 'last_ok', 'late_count', 'latency_p50_s', 'latency_p90_s',
                'lease_holder', 'outage', 'strikes_today'],
          'ST1 키 집합');
SELECT is((SELECT r->'calls_today' FROM st_out), '1234'::jsonb, 'ST2 오늘 호출 수 = api_usage opendart_list 오늘');
SELECT is((SELECT r->'strikes_today' FROM st_out), '1'::jsonb, 'ST3 한도 의심 표시 수 = opendart_list_quota_strike 오늘');
SELECT is((SELECT r->'by_status' FROM st_out),
          '{"pending": 1, "sending": 0, "sent": 3, "seeded": 2, "expired": 0}'::jsonb, 'ST4 상태별(오늘)');
SELECT is((SELECT r->'by_watch' FROM st_out), '{"tender_offer": 4, "rights_merger": 2}'::jsonb, 'ST5 감시 대상별(오늘)');
SELECT is((SELECT r->'late_count' FROM st_out), '1'::jsonb, 'ST6 늦은 알림 수');
SELECT ok((SELECT (r->>'latency_p50_s')::numeric = 20 AND (r->>'latency_p90_s')::numeric = 36 FROM st_out),
          'ST7 처음 본 시각 → 송신 시각 지연 p50 20초 · p90 36초(sent 10 · 20 · 40초)');
SELECT is((SELECT r->'outage' FROM st_out),
          jsonb_build_object('since', now(), 'reason', 'DART 조회 실패', 'notice', 'sent'), 'ST8 장애 상태');
SELECT ok((SELECT r->'last_ok' = '{"tender_offer": "2026-11-12T01:00:00Z"}'::jsonb AND r->>'lease_holder' = 'A' FROM st_out),
          'ST9 last_ok · 임대 보유자');
SELECT is(public.dart_alert_ops_stats(3)->'by_status'->'sent', '4'::jsonb, 'ST10 p_days 3 → 그저께 sent 포함');
SELECT is(public.dart_alert_ops_stats(1000)->'by_status', public.dart_alert_ops_stats(31)->'by_status',
          'ST11 p_days 1000 → 31 로 잘라 맞춤');
SELECT is(public.dart_alert_ops_stats(1000)->'by_status'->'expired', '0'::jsonb, 'ST12 31일 밖(40일 전) 행은 빠짐');
SELECT is(public.dart_alert_ops_stats(0), (SELECT r FROM st_out), 'ST13 p_days 0 → 1');
SELECT is(public.dart_alert_ops_stats(NULL), (SELECT r FROM st_out), 'ST14 p_days NULL → 1');
SELECT is(public.dart_alert_ops_stats(), (SELECT r FROM st_out), 'ST15 기본값 1');
DELETE FROM public.dart_alerts;
DELETE FROM public.api_usage WHERE service IN ('opendart_list', 'opendart_list_quota_strike');
SELECT ok((SELECT r->'latency_p50_s' = 'null'::jsonb AND r->'latency_p90_s' = 'null'::jsonb
                  AND r->'calls_today' = '0'::jsonb AND r->'strikes_today' = '0'::jsonb
                  AND r->'by_watch' = '{}'::jsonb AND r->'late_count' = '0'::jsonb
             FROM (SELECT public.dart_alert_ops_stats(1) AS r) x),
          'ST16 빈 날 → 지연 null · 호출 0 · 감시 대상별 {} · 늦은 알림 0');

SELECT * FROM finish();
ROLLBACK;
