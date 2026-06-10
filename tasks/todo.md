# 스캐너 ETF/ETN 노출 버그 — 근본 원인 해결

## 근본 원인 (확정)

스캐너의 ETF/ETN/ELW 제외는 `intraday-sync`의 `security_group` 화이트리스트
(`ELIGIBLE_SECGROUPS`)로 동작한다. 이 필터가 제대로 걸리려면 `stocks` 마스터에서
ETN이 `security_group='ETN'`으로 분류돼 있어야 한다.

그 분류를 채우는 `fetchEtpMastersFromKrx`(KRX `/etp/*` 엔드포인트 호출)가
**2026-05-16에 의도적으로 비활성화**됐다 (master-sync/index.ts:38-41). 이유는
candle-sync `recover` 모드의 결측 임계(`활성 × 0.9`) 오탐 방지.

결과 인과:
1. master-sync는 주식(주권)만 등록 → ETN은 `stocks`에 분류 정보 없음
2. ETN이 ka10027 등락률 순위에 등장 → `bootstrapMissingStocks`가 FK orphan 회피용으로
   `security_group="주권"` placeholder로 등록 (bootstrapStocks.ts:36)
3. master-sync가 ETP를 안 가져오므로 이 값이 영원히 갱신 안 됨
4. `eligibleCodes` 화이트리스트에 "주권"이 있음 → ETN 통과 → top_movers/스캐너 노출
5. topMovers.ts:15 주석은 "master-sync가 /etp/*로 정확히 등록"이라 적혀 있으나 현재 거짓 (stale)

## 검증 완료
- KRX `/etp/etn_bydd_trd`, `/etp/etf_bydd_trd` 우리 계정에 **승인됨** (HTTP 200)
- ETN 380건, 코드 580xxx 6자리 숫자 → ka10027 코드와 매칭 가능
- `krxToMasterRow`가 `SECUGRP_NM='ETN'` → `securityGroup` 정상 매핑 확인
- stock_quotes / intraday close / stock_daily_ohlcv 모두 FK REFERENCES stocks(code)
  → ETN은 반드시 stocks에 존재해야 함 (bootstrap 생략 불가, 분류만 교정해야 함)

## 해결책 (근본 원인 — 2개 워커 조정)

### 1. master-sync/src/index.ts — ETP 마스터 동기화 재활성화
- [ ] `fetchEtpMastersFromKrx` import + 호출 (try/catch fault-tolerant:
      실패 시 warn 로그 + 주식-only로 계속 진행 → 핵심 주식 sync 절대 안 깨짐)
- [ ] ETP 마스터를 주식 masters와 병합하여 upsert (security_group='ETF'/'ETN'/'ELW' 등록)
- [ ] delist-sweep의 `activeCodes`에 ETP 코드 포함 → 매 실행 ETP 오삭제(churn) 방지
- [ ] MIN_EXPECTED_MASTERS 가드는 주식(krxRows)에만 유지 (ETP 0건이어도 정상)
- [ ] 2026-05-16 주석을 "ETP 재활성화 + candle 분모 제외로 오탐 방지" 로 갱신

### 2. candle-sync/src/pipeline/missingDates.ts — recover 분모에서 ETP 제외
- [ ] `activeCount` 쿼리에 `security_group NOT IN ('ETF','ETN','ELW')` 추가
      → stock_daily_ohlcv(주식만 적재)와 분모 universe 일치 → recover 오탐 방지
      (이것이 2026-05-16 비활성화가 회피하던 바로 그 문제의 정확한 해결)

### 3. 주석/테스트 정리
- [ ] topMovers.ts:15 주석 — 수정 후 사실과 일치 (필요 시 미세 보정)
- [ ] master-sync 테스트: ETP 병합 + delist activeCodes 포함 검증
- [ ] candle-sync missingDates 테스트: ETP 제외 분모 검증

### 4. 배포 후 자가 치유
- 기존 잘못 라벨된 ETN("주권")은 다음 master-sync(매일 08:10 KST) upsert에서
  'ETN'으로 덮어써져 자동 교정. 즉시 교정하려면 배포 후 master-sync 1회 수동 실행.

## 리뷰

구현 완료 + 프로덕션 검증.

### 변경 파일
- `workers/master-sync/src/index.ts` — `fetchEtpMastersFromKrx` 재활성화(fault-tolerant),
  주식+ETP 병합 upsert, delist activeCodes 에 ETP 포함, 2026-05-16 stale 주석 갱신
- `workers/candle-sync/src/pipeline/missingDates.ts` — 활성 count 분모에서 ETP 제외
  (`security_group NOT IN ('ETF','ETN','ELW')`)
- 테스트: master-sync(ETP 병합 + fault-tolerant) 2건, candle-sync(ETP 분모 제외) 1건 추가

### 검증
- 타입체크: master-sync / candle-sync 모두 통과
- 테스트: master-sync 25/25, candle-sync 53/53 통과
- KRX `/etp/*` 엔드포인트 우리 계정 승인 확인 (ETN 380, ETF 200 OK)
- 프로덕션 master-sync 1회 실행(basDd=20260609): 주식 2770 + ETP 1251 upsert,
  **delistedCount=0** (오삭제 churn 없음 — activeCodes 에 ETP 포함 검증)
- 데이터 교정: 580074 "KB BYD ETN" security_group "주권"→"ETN", ETN 397 / ETF 874 분류
- **end-to-end**: 직전 top_movers 에 있던 ETN 2건(520102, 580088) 이 다음 intraday
  사이클(14:01 KST)에서 자동 제외 → top_movers 100건 중 ETP 0건 확인

### 후속(자가 치유)
- 매일 master-sync(08:10 KST) 가 ETP 분류 유지. 신규 ETN 도 bootstrap placeholder 후
  익일 master-sync 에서 'ETN' 으로 교정.
