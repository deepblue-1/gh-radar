import type { Market, StockMaster } from "@gh-radar/shared";
import type { KrxBaseInfoRow } from "../krx/fetchBaseInfo";

function parseListingDate(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function parseBigint(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
