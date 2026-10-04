-- ============================================================
-- 19-REVIEW WR-06 — 「오늘 주문」 조회를 jsonb 단일 값으로 (PostgREST max_rows 절단 방지).
--
-- 무엇을 바꾸는가:
--   dma_journal_orders_for_user(uuid, date) 는 set-returning 함수라 server 의 supabase.rpc 결과에도 PostgREST
--   max_rows(= supabase/config.toml 1000)가 적용된다. 정렬이 created_at DESC 라 1000건을 넘는 날은 **가장 오래된
--   주문부터 오류 없이** 사라진다. 행 모델이 계좌 기준이라 공유 계좌(여러 DMA 사용자 · WinForms · 상따 자동주문)의
--   주문이 한 응답에 모두 합쳐지므로 상따 활동이 많은 날(9/28~10/2 이벤트 약 1,200건/일) 현실적인 상한이다.
--   이 파일은 같은 행 · 같은 정렬을 **jsonb 배열 하나**로 돌려주는 래퍼를 더한다 — 스칼라 반환이라 max_rows 에
--   잘리지 않는다(server themes.ts 「jsonb 단일 값이라 max_rows 에 잘리지 않는다」 패턴과 같다).
--
-- 결정 근거:
--   - 가시성 · 반환 25칸 · 정렬의 정본은 그대로 dma_journal_orders_for_user(20260929190000 본문)다. 이 함수는 그 결과를
--     jsonb_agg 로 접기만 한다 — 규칙을 두 벌 두지 않는다(가시성 뷰 dma_visibility_identities 한 곳 유지).
--   - 원소 모양은 to_jsonb(행) 이다 — dma_journal_apply 가 푸시 행을 만드는 방식(to_jsonb(r))과 같아 공유 매퍼
--     toJournalOrderRow 가 그대로 읽는다(timestamptz · date 의 JSON 표기가 PostgREST 응답과 같다).
--   - 기존 SETOF 함수는 지우지 않는다 — server 배포 전후 어느 쪽에서도 조회가 끊기지 않게(배포 순서: 이 마이그레이션 →
--     server). 이후 server 가 이 함수만 부른다.
--   - service_role 전용(T-19-01): PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--     (메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」 — 플랫폼 auto-grant 가 PUBLIC REVOKE 를 덮는다).
--   - SECURITY INVOKER(호출자는 service_role).
--
-- 되돌리기(수동): DROP FUNCTION public.dma_journal_orders_for_user_json(uuid, date); 후 server 를 이전 커밋으로.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_journal_orders_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.last_seq DESC), '[]'::jsonb)
    FROM public.dma_journal_orders_for_user(p_user_id, p_trade_date) r;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_orders_for_user_json(uuid, date) TO service_role;

COMMIT;
