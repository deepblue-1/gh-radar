-- ============================================================
-- Phase 40 리뷰 수정(WR-07 · IN-05) — 푸시 기기 RPC 보강 pgTAP.
--
-- 잠그는 것:
--   | 절 | 무엇                                                                                              | 리뷰  |
--   |----|---------------------------------------------------------------------------------------------------|-------|
--   | 1  | handover — 같은 토큰의 남의 행 · 같은 기기 키의 남의 행 삭제 · 지금 (사용자, 키) 행 · 무관한 행 남음 · 반환 = 지운 수 | WR-07 |
--   | 2  | handover — 기기 키 NULL(로그아웃 정리 실패로 웹이 키를 버림) → 같은 토큰의 내 옛 행도 삭제                   | WR-07 |
--   | 3  | handover — 지울 행이 없으면 0 · 빈 토큰은 예외                                                         | WR-07 |
--   | 4  | handover EXECUTE (anon, authenticated, service_role) = (f, f, t)                                   | WR-07 |
--   | 5  | refresh_token — 켜진 행: 토큰 · 이름 · last_seen_at 갱신 · enabled 그대로 · 같은 토큰의 다른 행 삭제 · 반환 6키 | IN-05 |
--   | 6  | refresh_token — 꺼진 행 · 없는 키 · 남의 키 → NULL · 꺼진 행 그대로(다시 켜지 않는다) · 남의 행 불변        | IN-05 |
--   | 7  | refresh_token EXECUTE (anon, authenticated, service_role) = (f, f, t)                              | IN-05 |
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_devices_review_fixes.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유·원격 DB 접촉 0). 끝에서 ROLLBACK.
--
-- 사용자: U1 = …4101(앞 사용자) · U2 = …4102(같은 폰에 새로 로그인) · U3 = …4103(무관한 사람).
-- 기기 키: KP = aaaaaaaa-…(이 폰) · KO = bbbbbbbb-…(U3 의 다른 폰) · KN = cccccccc-…(U1 이 같은 폰에서 쓰던 옛 키).
-- 토큰: TP = repeat('p', 64)(이 폰) · TO = repeat('o', 64)(U3 의 폰) · TQ = repeat('q', 64)(이 폰의 옛 토큰).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(26);

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004101', 'push-rf-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000004102', 'push-rf-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000004103', 'push-rf-u3@example.invalid');

CREATE TEMP TABLE t_n (label text PRIMARY KEY, n integer) ON COMMIT DROP;

-- U1 이 이 폰(KP · TP)에서 켠 채 로그아웃 정리에 실패했다 · U1 이 같은 폰의 옛 키(KN)에 옛 토큰(TQ) 행도 남겼다 ·
-- U3 은 자기 폰(KO · TO). U2 는 이 폰에서 이미 켠 행(KP · 새 토큰은 아직 없음)이 없다.
INSERT INTO public.dma_push_devices (user_id, device_key, platform, token, label, enabled) VALUES
  ('00000000-0000-4000-8000-000000004101', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ios', repeat('p', 64), 'U1 이 폰', true),
  ('00000000-0000-4000-8000-000000004101', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ios', repeat('q', 64), 'U1 옛 키', true),
  ('00000000-0000-4000-8000-000000004103', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'android', repeat('o', 64), 'U3 폰', true);

-- ── 1. U2 로그인 → handover(TP, KP) ──────────────────────────────
INSERT INTO t_n VALUES ('u2_login', public.dma_push_device_handover(
  '00000000-0000-4000-8000-000000004102', repeat('p', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

SELECT is((SELECT n FROM t_n WHERE label = 'u2_login'), 1, '(U2, KP, TP) 반환 = 지운 행 수 1');
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004101' AND device_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0, '(U1, KP) 같은 토큰 · 같은 키의 앞 사용자 행 삭제 — 앞 사람 체결이 이 폰으로 가지 않는다'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004103'),
  1, '(U3, KO, TO) 무관한 폰 행은 남는다'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004101' AND device_key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1, '(U1, KN, TQ) 토큰도 키도 다르면 남는다(이 폰이라는 증거 없음)'
);

-- 기기 키만 같은 남의 행(토큰이 OS 갱신으로 바뀐 뒤) — U1 이 KP 에 옛 토큰 TQ' 로 다시 남아 있다고 치고 U2 가 새 토큰으로 handover.
INSERT INTO public.dma_push_devices (user_id, device_key, platform, token, label, enabled) VALUES
  ('00000000-0000-4000-8000-000000004101', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ios', repeat('r', 64), 'U1 이 폰(옛 토큰)', true);
INSERT INTO t_n VALUES ('u2_key_only', public.dma_push_device_handover(
  '00000000-0000-4000-8000-000000004102', repeat('p', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
SELECT is((SELECT n FROM t_n WHERE label = 'u2_key_only'), 1, '(U2, KP, 토큰 다름) 기기 키만 같은 앞 사용자 행도 1 삭제');

-- 지금 (사용자, 기기 키) 행은 남는다 — U2 가 KP 로 켠 뒤 다시 handover.
INSERT INTO public.dma_push_devices (user_id, device_key, platform, token, label, enabled) VALUES
  ('00000000-0000-4000-8000-000000004102', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ios', repeat('p', 64), 'U2 이 폰', true);
INSERT INTO t_n VALUES ('u2_self', public.dma_push_device_handover(
  '00000000-0000-4000-8000-000000004102', repeat('p', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
SELECT is((SELECT n FROM t_n WHERE label = 'u2_self'), 0, '(U2, KP, TP) 내 지금 행만 있으면 0');
SELECT is(
  (SELECT enabled FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004102' AND device_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true, '(U2, KP) 내 지금 행은 남고 enabled 그대로'
);

-- ── 2. 기기 키 NULL — 로그아웃 정리 실패로 키를 버린 뒤 U1 이 다시 로그인 ───
INSERT INTO t_n VALUES ('u1_null_key', public.dma_push_device_handover(
  '00000000-0000-4000-8000-000000004101', repeat('q', 64), NULL));
SELECT is((SELECT n FROM t_n WHERE label = 'u1_null_key'), 1, '(U1, 키 NULL, TQ) 같은 토큰의 내 옛 행 1 삭제');
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE token = repeat('q', 64)),
  0, '(TQ) 남은 행 0 — 성공한 로그아웃 DELETE 와 같은 결과'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004103'),
  1, '(U3) 키 NULL 이어도 토큰이 다른 행은 남는다'
);

-- ── 3. 지울 것 없음 · 빈 토큰 ───────────────────────────────────
SELECT is(
  public.dma_push_device_handover('00000000-0000-4000-8000-000000004103', repeat('z', 64), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  0, '(U3, 없는 토큰 · 없는 키) 0'
);
SELECT throws_ok(
  $$SELECT public.dma_push_device_handover('00000000-0000-4000-8000-000000004103', '', NULL)$$,
  '22004', NULL, '(U3, 빈 토큰) 22004 — 빈 토큰으로 넓게 지우지 않는다'
);

-- ── 4. 권한 ─────────────────────────────────────────────────────
SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.dma_push_device_handover(uuid, text, text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_push_device_handover(uuid, text, text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_push_device_handover(uuid, text, text)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  'handover EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.dma_push_device_handover(uuid, text, text)', 'EXECUTE'),
  'handover EXECUTE PUBLIC 없음'
);

-- ── 5. refresh_token — 켜진 행 (IN-05) ────────────────────────────
-- 지금 표: (U2, KP, TP, 켜짐) · (U3, KO, TO, 켜짐). U3 이 OS 갱신으로 받은 새 토큰이 우연히 남의 옛 토큰과 같다고 치고
-- 토큰 UNIQUE 정리를 보려고 (U1, KN, TS) 행을 하나 넣는다.
INSERT INTO public.dma_push_devices (user_id, device_key, platform, token, label, enabled) VALUES
  ('00000000-0000-4000-8000-000000004101', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ios', repeat('s', 64), 'U1 옛 키', false);
UPDATE public.dma_push_devices SET last_seen_at = now() - interval '1 day'
 WHERE user_id = '00000000-0000-4000-8000-000000004103';

CREATE TEMP TABLE t_r (label text PRIMARY KEY, r jsonb) ON COMMIT DROP;
INSERT INTO t_r VALUES ('u3_refresh', public.dma_push_device_refresh_token(
  '00000000-0000-4000-8000-000000004103', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'android', repeat('s', 64), 'Pixel 9'));

SELECT is(
  (SELECT token FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004103'),
  repeat('s', 64), '(U3, KO, 켜짐) 토큰이 새 값으로 갱신'
);
SELECT is(
  (SELECT enabled FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004103'),
  true, '(U3, KO) enabled 그대로 true'
);
SELECT ok(
  (SELECT last_seen_at > now() - interval '1 minute' FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004103'),
  '(U3, KO) last_seen_at 이 지금으로 갱신'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004101'),
  0, '(U1, KN, 같은 새 토큰) 토큰 UNIQUE — 같은 토큰의 다른 행 삭제'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM t_r, jsonb_object_keys(r) k WHERE label = 'u3_refresh'),
  ARRAY['createdAt', 'deviceKey', 'enabled', 'label', 'lastSeenAt', 'platform'],
  '(U3 갱신 반환) 키 집합 = shared PushDevice 6키 · token 없음'
);
SELECT is((SELECT r->>'label' FROM t_r WHERE label = 'u3_refresh'), 'Pixel 9', '(U3 갱신 반환) label 갱신');

-- ── 6. refresh_token — 꺼진 행 · 없는 키 · 남의 키 (IN-05) ─────────
-- PC 웹에서 U2 의 이 폰(KP)을 끈 뒤 앱의 시작 갱신이 도착했다.
SELECT ok(public.dma_push_device_disable('00000000-0000-4000-8000-000000004102', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '(U2, KP) PC 에서 끄기');
SELECT is(
  public.dma_push_device_refresh_token('00000000-0000-4000-8000-000000004102', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ios', repeat('t', 64), 'iPhone'),
  NULL::jsonb, '(U2, KP, 꺼짐) 시작 갱신 → NULL'
);
SELECT is(
  (SELECT ARRAY[enabled::text, token] FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004102' AND device_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ARRAY['false', repeat('p', 64)], '(U2, KP) 꺼진 채 · 토큰도 그대로 — 끈 기기를 되살리지 않는다'
);
SELECT is(
  public.dma_push_device_refresh_token('00000000-0000-4000-8000-000000004102', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'android', repeat('u', 64), 'x'),
  NULL::jsonb, '(U2, KO = U3 의 키) 남의 키 → NULL'
);
SELECT is(
  (SELECT token FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004103'),
  repeat('s', 64), '(U3, KO) 남의 갱신 시도 뒤에도 토큰 그대로'
);

-- ── 7. 권한 ─────────────────────────────────────────────────────
SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.dma_push_device_refresh_token(uuid, text, text, text, text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_push_device_refresh_token(uuid, text, text, text, text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_push_device_refresh_token(uuid, text, text, text, text)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  'refresh_token EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish(true);

ROLLBACK;
