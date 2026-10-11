# KIS 등락률 순위 API 실증 결과

**테스트 일시:** 2026-04-13 월요일 09:46 KST (장 시작 직후)
**Base URL:** `https://openapi.koreainvestment.com:9443` (실계좌)
**TR ID:** `FHPST01700000` (국내주식 등락률 순위)
**엔드포인트:** `GET /uapi/domestic-stock/v1/ranking/fluctuation`

## 1. 토큰 발급

- `POST /oauth2/tokenP` 정상
- `expires_in: 86400` (24시간)
- `token_type: Bearer`
- 응답 키: `access_token`, `access_token_token_expired`, `token_type`, `expires_in`

## 2. KOSPI 등락률 순위

- **마켓 코드:** `J` (성공)
- **파라미터 키:** `fid_cond_mrkt_div_code: "J"`
- **응답 행 수:** 30 (상위 30개만 반환)
- **rt_cd:** `0` (정상)

### 응답 필드 목록

```
stck_shrn_iscd        — 종목 단축코드 (6자리, 예: "368600")
data_rank             — 순위
hts_kor_isnm          — 종목 한글명
stck_prpr             — 현재가
prdy_vrss             — 전일대비
prdy_vrss_sign        — 전일대비 부호 (1=상승, 2=보합, 5=하락 등)
prdy_ctrt             — 전일대비 등락률 (%, 예: "30.00")
acml_vol              — 누적 거래량
stck_hgpr             — 당일 고가
hgpr_hour             — 고가 시각
acml_hgpr_date        — 고가 일자 (YYYYMMDD, 예: "20260413")
stck_lwpr             — 당일 저가
lwpr_hour             — 저가 시각
acml_lwpr_date        — 저가 일자
lwpr_vrss_prpr_rate   — 저가 대비 현재가 등락률
dsgt_date_clpr_vrss_prpr_rate — 지정일 종가 대비 등락률
cnnt_ascn_dynu        — 연속 상승일수
hgpr_vrss_prpr_rate   — 고가 대비 현재가 등락률
cnnt_down_dynu        — 연속 하락일수
oprc_vrss_prpr_sign   — 시가 대비 부호
oprc_vrss_prpr        — 시가 대비
oprc_vrss_prpr_rate   — 시가 대비 등락률
prd_rsfl              — 기간수익
prd_rsfl_rate         — 기간수익률
```

### 없는 필드 (PLAN.md 대비)

- ❌ `stck_mxpr` (상한가) — 이 엔드포인트에 없음
- ❌ `stck_llam` (하한가) — 이 엔드포인트에 없음
- ❌ `stck_avls` (시가총액) — 이 엔드포인트에 없음
- ❌ `stck_oprc` (시가) — 이 엔드포인트에 없음 (고가/저가는 있음)
- ❌ `mrkt_div_cls_code` (시장구분코드) — 이 엔드포인트에 없음
- ❌ `bsop_date` (영업일) — 이 엔드포인트에 없음

### 있지만 PLAN에서 예상 못 한 필드

- ✅ `acml_hgpr_date` — **거래일 판별에 사용 가능** (YYYYMMDD)
- ✅ `data_rank` — 순위 (PLAN에 없었으나 유용)
- ✅ `prdy_vrss_sign` — 등락 부호 (양수/음수 구분용)
- ✅ `cnnt_ascn_dynu` / `cnnt_down_dynu` — 연속 상승/하락일

## 3. KOSDAQ 등락률 순위

- **마켓 코드 `Q`:** ❌ 실패 (`OPSQ2001 ERROR INVALID FID_COND_MRKT_DIV_CODE`)
- **마켓 코드 `NX`:** ✅ 성공 (30행 반환)
- **추가 테스트:** `K`, `JQ` 모두 실패. 유효한 마켓 코드는 `J`(KOSPI)와 `NX`(KOSDAQ)뿐.

**확정:** `fid_cond_mrkt_div_code` → `"J"` (KOSPI), `"NX"` (KOSDAQ)

## 4. 휴장일 감지 방식 수정

PLAN.md D-12는 `bsop_date` 필드 기반 감지를 명시했으나, 이 엔드포인트에는
`bsop_date` 필드가 없다.

**대안:** `acml_hgpr_date` (고가 일자)를 사용.
- 거래일이면 오늘 날짜 → `acml_hgpr_date === 오늘(KST) YYYYMMDD`
- 휴장일이면 전 영업일 날짜가 들어옴 (또는 빈 값)
- 주말 실증 테스트에서 이 가설을 확인해야 함 (D-13 미완)

## 5. 상한가/하한가/시가/시가총액 보충 방안

등락률 순위 엔드포인트에 상한가(stck_mxpr), 하한가(stck_llam),
시가(stck_oprc), 시가총액(stck_avls) 필드가 없으므로, 별도 시세 API로
보충해야 한다.

**후보:** `GET /uapi/domestic-stock/v1/quotations/inquire-price`
(TR ID: `FHKST01010100`, 국내주식 현재가 조회)

이 엔드포인트는 개별 종목 코드로 조회하며 모든 필드를 포함.
단, 30~60개 종목에 대해 개별 호출이 필요 → rate limiter 15 req/sec로
2~4초 소요.

**전략:** 등락률 순위(30행) → 각 종목 현재가 조회(상한가/하한가 보충)
→ 병합 후 upsert. Phase 1에서 이 파이프라인을 구현.

## 6. 마켓 구분 처리

등락률 순위 응답에 시장구분코드 필드가 없다. KOSPI/KOSDAQ은
**요청 파라미터** (`fid_cond_mrkt_div_code`)로 분리 조회하므로,
파이프라인에서 마켓 정보를 요청 시점에 태깅하면 된다.

```
fetchRanking("J") → 결과에 market: "KOSPI" 태깅
fetchRanking("??") → 결과에 market: "KOSDAQ" 태깅 (마켓코드 확인 후)
```

## 7. 다음 단계

1. KOSDAQ 마켓 코드 확인 (KIS 문서 또는 추가 실증)
2. 주말에 재실행하여 `acml_hgpr_date` 기반 휴장일 감지 검증
3. `inquire-price` API로 상한가/하한가 보충 파이프라인 설계
4. `packages/shared/src/kis.ts` 타입을 실증 결과에 맞춰 갱신

---
*실증 테스트: 2026-04-13*
*스크립트: `workers/ingestion/scripts/empirical-test.ts`*
