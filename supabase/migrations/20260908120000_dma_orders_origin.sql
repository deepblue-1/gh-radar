-- ============================================================
-- Phase 16 Plan 01 — TRADE-03: dma_orders 주문 출처 컬럼 (D-03).
--
-- 한 행이 수동 주문인지 상따(LimitChaser)·VI 자동주문인지 구분한다.
-- My page 전략 현황과 주문내역이 "내가 낸 주문" 과 "전략이 낸 주문" 을 갈라 보여줘야 하고,
-- 사후 추적에서도 그 구분이 없으면 자동매매 행위를 재구성할 수 없다.
--
-- 결정 근거:
--   D-03: `dma_orders` 의 insert·update 를 **relay 가 전담**한다(server `POST /api/orders` 제거,
--         GET 만 남는다). 상따·VI 자동주문은 relay 가 요청을 만들지 않으므로 대응하는 행이
--         아예 없다 — 51(`OrderResp`) 통보를 받는 시점에 relay 가 **새 행을 insert** 한다.
--         그 행이 수동 주문과 섞이지 않도록 출처를 컬럼으로 못 박는다.
--   출처 원천은 `OrderResp.origin` 이다 — `"Manual"` / `"LimitChaser"` / `"VITrigger"`
--         (`WireCodes.FromWireOrigin`). relay 가 이 셋을 'manual'/'limit_chaser'/'vi' 로 매핑한다.
--   CHECK 로 세 값만 허용한다. 네 번째 전략이 생기면 마이그레이션이 강제되는 편이,
--         알 수 없는 문자열이 조용히 쌓여 집계가 틀리는 것보다 낫다.
--
-- 함정:
--   - 구 게이트웨이는 `origin` 을 **빈 값**으로 보낼 수 있다. 그래서 DEFAULT 는 `'manual'` 이고
--     NOT NULL 이다 — relay 가 빈 값을 그대로 넣어 CHECK 위반으로 감사 기록을 통째로 잃는 것보다,
--     보수적으로 수동으로 분류해 두고 기록을 남기는 편이 낫다.
--   - 51 통보의 `order_no` 셀렉터로 update 했는데 **0행이 갱신돼도 PostgREST 는 에러가 아니다.**
--     자동주문은 애초에 대상 행이 없으므로 여기서 조용한 기록 결손이 난다 — relay 는 update 결과
--     행수를 보고 0이면 insert 로 넘어가야 한다(TRADE-03 소관).
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** 이 테이블은 정책 0개 default-deny 가 의도다
--     (T-15-01 / T-16-08). 컬럼이 늘었다고 브라우저에 열어 줄 이유가 생기지 않는다.
--   - 권한 회수·부여 구문을 다시 실행하지 않는다. 테이블 단위 권한은 20260905120200 에서 이미
--     확정됐고, Postgres 의 테이블 권한은 컬럼 추가로 바뀌지 않는다.
--   - 데이터 마이그레이션을 하지 않는다. 기존 행은 DEFAULT `'manual'` 로 채워진다 —
--     Phase 15 시점에는 수동 주문 경로밖에 없었으므로 그 값이 사실과 맞는다.
-- ============================================================

BEGIN;

ALTER TABLE public.dma_orders
  ADD COLUMN origin text NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual','limit_chaser','vi'));

COMMENT ON COLUMN public.dma_orders.origin IS '주문 출처: manual=사용자가 직접 낸 주문 / limit_chaser=상따 전략 자동주문 / vi=VI 종합주문 자동주문. 원천은 OrderResp.origin (Manual/LimitChaser/VITrigger), 빈 값은 manual 로 본다.';

COMMIT;
