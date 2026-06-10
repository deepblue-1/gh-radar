-- 기존 theme_stocks 중 "일반 주식이 아닌" 종목(스팩·ETP) 링크를 일회성 soft-retire.
--
-- 배경:
--   theme-sync 의 upsertThemes(isThemeEligible) 가 향후 스팩·ETP 의 테마 재편입을 막지만,
--   스크랩 콘텐츠 해시가 바뀌기 전까지는 upsert 자체가 skip(5원칙 #2)되어 기존 링크가
--   남아있는다. 이 마이그레이션이 즉시 정리한다.
--
-- 판별 기준 — 코드의 isThemeEligible 과 정확히 일치:
--   1. ETP(ETF/ETN/ELW) — security_group(KRX SECUGRP_NM).
--   2. 스팩 — kosdaq_segment 'SPAC%' (KRX SECT_TP_NM) 또는 종목명 '스팩'(관리종목 전환 스팩 보강).
--
-- 보존:
--   - effective_to IS NOT NULL (이미 제외된 이력) 은 건드리지 않음 — 멱등.
--   - manual_override='included' (운영자가 명시 핀) 은 retire 제외 — retireRemovedStocks 와 동일 정책.

UPDATE theme_stocks ts
SET effective_to = now()
FROM stocks s
WHERE ts.stock_code = s.code
  AND ts.effective_to IS NULL
  AND ts.manual_override IS DISTINCT FROM 'included'
  AND (
    s.security_group IN ('ETF', 'ETN', 'ELW')
    OR s.kosdaq_segment LIKE 'SPAC%'
    OR s.name LIKE '%스팩%'
  );
