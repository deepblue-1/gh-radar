-- ============================================================
-- quick 261001-bnc — stock_quotes.rate_updated_at 컬럼 추가 (등락률 기준 시각).
--
-- 무엇 / 왜:
--   2026-10-01 00:28 KST, server `GET /api/stocks/:code` 상세 on-demand 가 키움 ka10001 의
--   전일 스냅샷(동일스틸럭스 023790 +29.99%, 9/30 상한가)을 `updated_at = now` 로 기록했다.
--   home-sync loadSurges 는 "updated_at >= 오늘 KST 자정 이면 change_rate 도 오늘 값" 이라고
--   가정했기 때문에 08:00~08:04 홈 「오늘의 급등 테마」 스냅샷에 전일 상한가 종목이 실렸다.
--   updated_at 은 "행을 마지막으로 쓴 시각" 일 뿐이다 (intraday-sync STEP2 hot set UPDATE 도
--   change_rate 를 건드리지 않고 updated_at 만 올린다 — 같은 부류의 잠복 경로).
--   → 행 쓰기 시각(updated_at)과 등락률 기준 시각(rate_updated_at)을 분리한다.
--     change_rate 를 오늘 값으로 보증할 수 있는 writer 만 rate_updated_at 을 찍는다:
--       - intraday-sync STEP1(ka10027) — 휴장일 가드 + detectStaleSnapshot 가드 뒤에서만 실행.
--       - server 상세 on-demand — KRX 거래일 KST 08:00 ≤ t < 20:00 세션 창 안에서만 upsert.
--     home-sync 는 rate_updated_at 으로 급등 신선도를 판정한다.
--
-- 결정:
--   - 백필 없음 (NULL 유지). NULL = "등락률 기준 시각 미상" → home-sync 가 제외하는 fail-safe.
--     updated_at 으로 백필하면 적용 시점에 이미 오염된 행(야간 on-demand 기록)이 그대로
--     "오늘" 로 복사되어 다음 날 08:00~09:00 에 같은 버그가 한 번 더 난다.
--     최악의 비용은 intraday-sync 한 사이클(장중 1분) 동안의 급등 미탐.
--   - 새 인덱스 없음. 급등 쿼리는 change_rate >= 20 으로 기존 idx_stock_quotes_change_rate_desc
--     가 수십 행으로 좁히고 테이블은 약 2~3천 행이다. 인덱스를 더하면 STEP1 이 매분 약
--     1,900행 UPSERT 할 때마다 쓰기 증폭만 생긴다.
--   - 정책 · 뷰 · RPC 변경 없음. RLS 는 행 단위라 기존 SELECT 정책이 새 컬럼을 그대로 덮는다.
--     stock_quotes.updated_at 이나 `*` 를 참조하는 뷰/RPC 는 없다.
--
-- 적용 순서:
--   **이 파일을 프로덕션에 먼저 적용한 뒤** intraday-sync · server · home-sync 를 배포한다
--   (없는 컬럼을 쓰는 PostgREST upsert 는 실패한다). home-sync 는 마지막.
--
-- 멱등: ADD COLUMN IF NOT EXISTS · COMMENT ON 은 재적용 안전.
-- ============================================================

BEGIN;

ALTER TABLE public.stock_quotes
  ADD COLUMN IF NOT EXISTS rate_updated_at timestamptz;

COMMENT ON COLUMN public.stock_quotes.rate_updated_at IS
  'change_rate 기준 시각. 오늘 등락률로 보증되는 writer 만 기록 — intraday-sync STEP1 · server on-demand(세션 창 안). updated_at 은 행 쓰기 시각이라 신선도 판정에 쓰지 말 것';

COMMIT;
