import type { Market, StockMaster } from "@gh-radar/shared";
import type { KrxBaseInfoRow } from "../krx/fetchBaseInfo";

function parseListingDate(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * KRX `ISU_CD`(표준코드 12자, 예: KR7005930003) → `stocks.isin` (D-28).
 *
 * 12자 정규식 가드를 두는 이유 (RESEARCH Pitfall 13):
 *   `fetchEtpBaseInfo.ts` 는 ETP 매매정보 응답의 `ISU_CD` 가 **단축코드 6자**라서
 *   그것을 `ISU_SRT_CD` 로 옮겨 담고 `ISU_CD` 는 비워둔다. 그래도 endpoint 계약이
 *   바뀌어 6자 값이 이 경로로 새어 들어오면 주문 라우팅 키가 오염된다(T-15-31).
 *   여기서 형태로 한 번, DB 의 `stocks_isin_len` CHECK 로 한 번 — 이중 방어.
 *
 * 형태는 ISO 6166: 국가코드 2자(대문자) + 영숫자 9자 + 체크digit 1자 = 12자.
 * 한국 종목은 전부 `KR` 로 시작하지만 국가코드를 `KR` 로 못박지 않는다 —
 * 외국주권(SECUGRP_NM='외국주권') 이 다른 국가코드를 갖는 경우를 배제할 근거가 없다.
 */
function parseIsin(isuCd: string | undefined): string | null {
  if (!isuCd) return null;
  const t = isuCd.trim();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(t) ? t : null;
}

function parseBigint(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // DB column is bigint — truncate fractional values (e.g. PARVAL "0.25")
  return Math.trunc(n);
}

export function krxToMasterRow(r: KrxBaseInfoRow): StockMaster {
  if (!r.ISU_SRT_CD) {
    throw new Error(`KRX row missing ISU_SRT_CD: ${JSON.stringify(r)}`);
  }
  // C1 옵션 A: KRX 응답에 업종(sector) 정보 없음 — 항상 NULL.
  //           후속 phase 에서 KIS inquirePrice.bstp_kor_isnm 으로 보강.
  //           KOSDAQ 소속부(SECT_TP_NM) 는 kosdaqSegment 로 분리 보존.
  // C2: 종목구분은 KIND_STKCERT_TP_NM (보통주/우선주), SECUGRP_NM 은 증권그룹.
  const kosdaqSegment =
    r.SECT_TP_NM && r.SECT_TP_NM.trim().length > 0 ? r.SECT_TP_NM.trim() : null;
  return {
    code: r.ISU_SRT_CD,
    name: r.ISU_ABBRV ?? r.ISU_NM ?? r.ISU_SRT_CD,
    isin: parseIsin(r.ISU_CD),                     // D-28: 12자 표준코드만 통과 (Pitfall 13)
    market: r.market as Market,
    sector: null,                                  // KRX 응답에 업종 정보 없음 (C1)
    kosdaqSegment,                                 // KOSPI 는 null, KOSDAQ 소속부
    securityType: r.KIND_STKCERT_TP_NM ?? "보통주", // C2: KIND_STKCERT_TP_NM (SECUGRP_NM 아님)
    securityGroup: r.SECUGRP_NM ?? "주권",         // C2 보존: 증권그룹
    englishName: r.ISU_ENG_NM ?? null,
    listingDate: parseListingDate(r.LIST_DD),
    parValue: parseBigint(r.PARVAL),
    listingShares: parseBigint(r.LIST_SHRS),
    isDelisted: false,
    updatedAt: new Date().toISOString(),
  };
}
