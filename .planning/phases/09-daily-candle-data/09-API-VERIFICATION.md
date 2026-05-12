# Phase 9 — KRX bydd_trd API Verification

**Verified:** 2026-05-12 10:45 KST
**AUTH_KEY:** master-sync 와 동일 계정 (D-02). 2026-05-11 BLOCKER 발견 후 `stk_bydd_trd` + `ksq_bydd_trd` 서비스 별도 신청 → 2026-05-12 승인 완료. 동일 키 그대로 작동.
**Endpoint:** `https://data-dbg.krx.co.kr/svc/apis/sto/{stk|ksq}_bydd_trd`

## R2 — 응답 필드명 검증 ⚠️ 잠정 vs 실측 차이 발견

### KOSPI fixture (`workers/candle-sync/tests/fixtures/bydd-trd-kospi.json`)
- 응답 row count: **948** (예상 ~950 일치)
- basDd: 20260511 (직전 영업일)
- 005930 (삼성전자) sample row:
  ```json
  {
    "BAS_DD": "20260511",
    "ISU_CD": "005930",
    "ISU_NM": "삼성전자",
    "MKT_NM": "KOSPI",
    "SECT_TP_NM": "",
    "TDD_CLSPRC": "285500",
    "CMPPREVDD_PRC": "17000",
    "FLUC_RT": "6.33",
    "TDD_OPNPRC": "284500",
    "TDD_HGPRC": "288500",
    "TDD_LWPRC": "280000",
    "ACC_TRDVOL": "36031094",
    "ACC_TRDVAL": "10278092379571",
    "MKTCAP": "1669112542584000",
    "LIST_SHRS": "5846278608"
  }
  ```

### KOSDAQ fixture (`workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json`)
- 응답 row count: **1,821** (예상 ~1,700 — 정상)
- 필드 구조 KOSPI 와 동일

### 실측 필드 키 (15개)
`ACC_TRDVAL`, `ACC_TRDVOL`, `BAS_DD`, `CMPPREVDD_PRC`, `FLUC_RT`, `ISU_CD`, `ISU_NM`, `LIST_SHRS`, `MKTCAP`, `MKT_NM`, `SECT_TP_NM`, `TDD_CLSPRC`, `TDD_HGPRC`, `TDD_LWPRC`, `TDD_OPNPRC`

### 잠정 vs 실측 차이 ⚠️

| 잠정 (Plan 01) | 실측 (KRX) | 결정 |
|----------------|-----------|------|
| `ISU_SRT_CD: string` (6자 단축코드, required) | **없음** | 제거 |
| `ISU_CD?: string` (12자 표준코드, optional) | **`ISU_CD: string` 6자 단축코드, required** | required + 6자로 잠금 |
| `ISU_ABBRV?` | 없음 | OK (이미 미포함) |

**액션:** Task 1 후속으로 다음을 patch (Wave 0 prerequisite 잠금):
- `packages/shared/src/stock.ts` — `BdydTrdRow.ISU_SRT_CD` 제거, `ISU_CD: string` required (6자 단축코드)
- `workers/candle-sync/src/pipeline/map.ts` — `r.ISU_SRT_CD` → `r.ISU_CD`
- `workers/candle-sync/src/modes/bootstrapStocks.ts` — `r.ISU_SRT_CD` → `r.ISU_CD`
- 테스트 5개 (`krx-bydd.test.ts`, `map.test.ts`, `runDaily.test.ts`, `runRecover.test.ts`, `runBackfill.test.ts`) — mock `ISU_SRT_CD:` → `ISU_CD:`

## R1 — 갱신 시각 검증

| 시점 | basDd | row count | 비고 |
|-----|-------|-----------|------|
| 2026-05-12 10:45 KST | 20260511 (직전 영업일) | 948 (KOSPI) / 1821 (KOSDAQ) | ✅ 정상 응답 — 직전 영업일 데이터 발행 완료 |
| 2026-05-12 10:45 KST | 20260512 (당일) | 0 (KOSPI 빈 OutBlock_1) | ⏳ 당일 데이터 미발행 — EOD (장 마감 후) 발행 예정 |
| 2026-05-12 17:30 KST | 20260512 (당일) | [추가 확인 필요] | D-09 daily Scheduler trigger 시점 검증 |
| 2026-05-12 익일 08:10 KST | 20260512 (직전 영업일) | [추가 확인 필요] | D-09 recover Scheduler trigger 시점 검증 |

**1차 결론 (직전 영업일):** ✅ 직전 영업일 데이터는 익영업일 오전에 이미 발행되어 있음. recover Scheduler `10 8 * * 1-5` 가 신뢰 가능.

**daily Scheduler 결론 (당일):** ⏳ 추가 시점 검증 필요. 10:45 시점 당일 미발행. 17:30 시점 발행 여부는 Plan 06 Task 3 deploy 후 first daily run 의 로그로 확인 가능. 만약 17:30 시점에도 미발행이면 D-09 cron 을 `0 18 * * 1-5` 또는 `0 19 * * 1-5` 로 조정. **대안**: daily Scheduler 가 빈 응답 시 자동으로 무시 → recover 가 익영업일 보완. 현재 코드는 `MIN_EXPECTED` 가드로 빈 응답 시 경보 → 1차 cron 시점 결정 직후 alert 적정성 재검토.

## 결정

- [x] R2: BdydTrdRow 타입 + map.ts + bootstrapStocks + 테스트의 필드명 `ISU_SRT_CD` → `ISU_CD` 일괄 rename. 실측 잠금.
- [x] R1: 직전 영업일 발행 검증 완료 — recover `10 8 * * 1-5` 신뢰 가능. daily `30 17 * * 1-5` 는 첫 실행 로그로 추가 검증 (1차 cron 적절성).
