-- ============================================================
-- Phase 15 Plan 09 — RELAY-01 / RELAY-02: stocks.isin 컬럼 추가 (D-28).
--
-- DMA 게이트웨이의 종목 키는 **12자 표준코드(ISIN)** 인데 gh-radar 는 전 구간이
-- 6자 단축코드다. 시세 구독 키(D-33 `isin + exchange`)와 주문 전문이 모두 ISIN 을
-- 요구하므로 `stocks` 마스터에 매핑 컬럼을 두고, 서버 주문 라우트·호가창이 이 컬럼을
-- 조회해 변환한다.
--
-- 결정 근거:
--   D-28: 매핑은 gh-radar `stocks` 마스터로 해결한다. 단축코드에서 ISIN 을 **산술로
--         유도하지 않는다** — 우선주·신주인수권 등에서 규칙이 어긋난다. 게이트웨이의
--         `GetSymbolMasterReq(27)` 도 쓰지 않는다(다운로드는 본 phase 범위 밖).
--         원천은 KRX 기본정보 응답의 `ISU_CD`(표준코드 12자)이고 master-sync 가 채운다.
--   T-15-31 (Tampering — isin 오염): `CHECK (isin IS NULL OR length(isin) = 12)` 로
--         **6자 단축코드가 isin 에 들어가는 경로를 DB 레벨에서 차단**한다.
--         RESEARCH Pitfall 13 — ETP 기본정보 응답의 `ISU_CD` 는 표준코드가 아니라
--         단축코드 6자다. 애플리케이션이 실수로 그 값을 넘기면 여기서 터져야 한다.
--         부분 유니크 인덱스는 서로 다른 두 종목이 같은 ISIN 을 갖는 오염도 막는다.
--
-- 영향 범위:
--   - nullable 컬럼 추가 → 기존 전 종목 행은 isin=NULL 로 유지된다. **백필 없음.**
--     실제 값 채우기는 master-sync 매핑 + 1회 실행(15-10) 소관이다. 그때까지
--     주문·구독은 isin 이 있는 종목에 한해 동작한다.
--   - `stocks` 는 공개 읽기 테이블이고 기존 SELECT 정책은 컬럼 단위가 아니므로
--     새 컬럼이 자동으로 함께 노출된다. **새 접근 정책이 필요 없다** — 표준코드는
--     KRX 가 공시하는 공개 식별자라 노출이 무해하다.
--   - 훗날 `stocks` 에 접근 정책을 새로 추가할 일이 생기면 **`TO anon, authenticated`
--     둘 다 명시**할 것. `TO anon` 만 쓰면 로그인 사용자가 default-deny 로 0행을 받는다
--     (`20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql` 이 그 사고의 기록).
--
-- 하지 않는 것:
--   - 값 백필(UPDATE). 15-10 이 master-sync 를 고쳐 정상 경로로 채운다.
--   - NOT NULL 승격. 채워지지 않은 종목이 있는 동안 승격하면 master-sync 가 멈춘다.
--   - `dma_orders.isin` 에 대한 FK. isin 이 아직 대부분 NULL 이라 참조 대상이 없다.
--
-- 멱등: 컬럼·제약·인덱스 3건 모두 존재 시 skip 한다 (재적용 안전).
-- ============================================================

BEGIN;

-- 12자 KRX 표준코드(예: KR7005930003). 미백필 종목은 NULL (15-10 이 채운다).
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS isin text;

-- ADD CONSTRAINT 에는 IF NOT EXISTS 가 없다 → 카탈로그를 직접 보고 가드한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stocks'::regclass
      AND conname  = 'stocks_isin_len'
  ) THEN
    ALTER TABLE public.stocks
      ADD CONSTRAINT stocks_isin_len CHECK (isin IS NULL OR length(isin) = 12);
  END IF;
END
$$;

-- 부분 유니크 — NULL 은 여러 행이 가질 수 있고, 값이 있으면 종목 간 중복 불가.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_isin
  ON public.stocks (isin)
  WHERE isin IS NOT NULL;

COMMIT;
