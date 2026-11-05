-- ============================================================
-- 일회성 데이터 정정 — 2026-11-05 KB120 09:00:30 'N' 코스닥 회차 조각 3개 무응답 → 접수.
--
-- 정본: gh-trade 인계 노트 `docs/inbox/from-gh-trade/261105-launch-noresp-fix.md`(from_commit 857e42a5).
--
-- 왜: 서버가 조각 결과(kind 17)를 발사 + 1초(09:00:30.999)에 기록했는데, 그날 KB 통보가 건당 18 ~ 25ms 로 밀려
--   접수 확인이 1초 뒤(09:00:31.468 · 31.781 · 32.786)에 도착했다. 셋 다 실제로는 KB 접수(2 · 3 은 전량 체결,
--   4 는 무체결 IOC 취소). 서버 재발 방지는 gh-trade quick-261105-e41(기록 시점 발사 + 5초 · 형식 무변경).
--   이 행들은 source = journal 이라 백필(ndjson)로 덮이지 않는다 → 이 마이그레이션으로 고친다.
--
-- 무엇(나머지 칸 무변경):
--   launch_pieces  키 (2026-11-05 · KB120 · N · NXT · 09:00:30 · Q) wire 2 · 3 · 4 — result 무응답 → 접수 · result_code null.
--                  accept_time 은 그대로(0/null = 모름 — 늦게 온 확인의 접수시각을 서버가 남기지 않았다 · 추정값 금지).
--   launch_heads   같은 회차 n_accepted 2 → 5(조각 5 · 515 0 · 기타 0 · 무응답 0). first_accept_idx 그대로.
--   건드리지 않음: 같은 날 코스피(K) wire 4(3404000052 · KB 거부 rc 702 · 「기타」).
--
-- 안전장치: 조각은 order_no · 현재 result 무응답일 때만, 머리는 n_accepted 2 일 때만 바꾼다. 그 회차 머리가 있는데
--   바뀐 수가 기대(조각 3 · 머리 1)와 다르면 RAISE — 조용히 일부만 고치지 않는다. 머리가 없으면(로컬 · 새 DB) 아무것도 안 한다.
-- 주의: `SELECT public.launch_reproject();` 를 다시 돌리면 원문(kind 17 queue_case 4)으로 이 3행이 무응답으로 되돌아간다
--   (journal upsert 는 seq >= 이면 덮는다). 재투영 뒤에는 이 파일의 UPDATE 를 다시 실행할 것.
-- 원격 적용: 메인 세션 `supabase db push --linked --yes`.
-- 되돌리기: 같은 키 wire 2 · 3 · 4 를 result '무응답' 으로 · 머리 n_accepted 2 로.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_head  boolean;
  v_piece integer;
  v_heads integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.launch_heads
     WHERE trade_date = DATE '2026-11-05' AND gateway = 'KB120' AND profile = 'N'
       AND fire_exchange = 'NXT' AND fire_base = TIME '09:00:30' AND market = 'Q'
  ) INTO v_head;
  IF NOT v_head THEN
    RAISE NOTICE 'launch_noresp_fix_261105: 대상 회차 없음 — 건너뜀';
    RETURN;
  END IF;

  UPDATE public.launch_pieces
     SET result = '접수', result_code = NULL, updated_at = now()
   WHERE trade_date = DATE '2026-11-05' AND gateway = 'KB120' AND profile = 'N'
     AND fire_exchange = 'NXT' AND fire_base = TIME '09:00:30' AND market = 'Q'
     AND result = '무응답'
     AND (wire, order_no) IN ((2, '3405000025'), (3, '3405000026'), (4, '3405000029'));
  GET DIAGNOSTICS v_piece = ROW_COUNT;

  UPDATE public.launch_heads
     SET n_accepted = 5, updated_at = now()
   WHERE trade_date = DATE '2026-11-05' AND gateway = 'KB120' AND profile = 'N'
     AND fire_exchange = 'NXT' AND fire_base = TIME '09:00:30' AND market = 'Q'
     AND n_accepted = 2;
  GET DIAGNOSTICS v_heads = ROW_COUNT;

  IF v_piece <> 3 OR v_heads <> 1 THEN
    RAISE EXCEPTION 'launch_noresp_fix_261105: 기대 조각 3 · 머리 1 인데 조각 % · 머리 % — 현재 값이 노트와 다르다', v_piece, v_heads;
  END IF;
  RAISE NOTICE 'launch_noresp_fix_261105: 조각 % · 머리 % 정정', v_piece, v_heads;
END;
$$;

COMMIT;
