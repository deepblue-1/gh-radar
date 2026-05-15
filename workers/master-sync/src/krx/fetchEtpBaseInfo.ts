import type { AxiosInstance } from "axios";
import type { KrxBaseInfoRow } from "./fetchBaseInfo";

/**
 * KRX OpenAPI ETP (Exchange Traded Products) 매매정보 endpoint 3종.
 * - /svc/apis/etp/etf_bydd_trd  → ETF
 * - /svc/apis/etp/etn_bydd_trd  → ETN
 * - /svc/apis/etp/elw_bydd_trd  → ELW
 *
 * 배경:
 *   KRX 가 "주식" (`/sto/*`) 과 "증권상품" (`/etp/*`) 을 카테고리 분리 운영하므로
 *   `stk_isu_base_info` + `ksq_isu_base_info` 만으로는 ETF/ETN/ELW 가 stocks 마스터에
 *   누락되어 intraday-sync 의 bootstrapStocks 가 `security_group="주권"` placeholder 로
 *   잘못 등록 → top_movers 에 ETN 노출. 본 endpoint 3종을 추가 호출해 정확한 분류.
 *
 * 매매정보 응답 필드:
 *   ISU_CD  : 단축코드 (보통 6자리 숫자, ETF/ELW 일부 alphanumeric)
 *   ISU_NM  : 종목명
 *   BAS_DD  : 기준일
 *   (그 외 시세 컬럼: TDD_CLSPRC, FLUC_RT, ACC_TRDVOL, ACC_TRDVAL, MKTCAP, LIST_SHRS 등)
 *
 * 6자리 숫자 코드 필터:
 *   키움 ka10027 응답이 6자리 숫자 코드만 반환하므로, alphanumeric 종목 (ETF "0184E0",
 *   ELW "58L001" 등) 은 stocks 에 등록해도 키움 사이드와 매칭 불가 → 노이즈만 됨.
 *   regex `^\d{6}$` 통과 종목만 마스터 저장.
 *
 * market 결정:
 *   ETP 매매정보 응답에 시장구분 field 없음. 한국 ETF/ETN/ELW 는 거의 모두 KOSPI
 *   상장이므로 'KOSPI' 일괄 분류. stocks CHECK constraint `market IN ('KOSPI','KOSDAQ')`
 *   충족.
 *
 * security_group 매핑:
 *   ETF → 'ETF', ETN → 'ETN', ELW → 'ELW' (신규 값).
 *   rebuildTopMovers 화이트리스트가 이 값들을 차단하면 자동으로 top_movers 제외.
 */

type EtpKind = "etf" | "etn" | "elw";

type EtpResponse = {
  OutBlock_1?: Array<{
    BAS_DD?: string;
    ISU_CD?: string;
    ISU_NM?: string;
  }>;
};

const CODE_RE = /^\d{6}$/;

const SECURITY_GROUP_BY_KIND: Record<EtpKind, string> = {
  etf: "ETF",
  etn: "ETN",
  elw: "ELW",
};

async function fetchOneKind(
  client: AxiosInstance,
  kind: EtpKind,
  basDd: string,
): Promise<KrxBaseInfoRow[]> {
  let res;
  try {
    res = await client.get<EtpResponse>(`/etp/${kind}_bydd_trd`, {
      params: { basDd },
    });
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 401) {
      throw new Error(
        `KRX 401 — ${kind}_bydd_trd 서비스 미승인 또는 AUTH_KEY 오류. openapi.krx.co.kr 활용 신청 확인 필요.`,
      );
    }
    throw err;
  }
  const rows = res.data.OutBlock_1 ?? [];
  const out: KrxBaseInfoRow[] = [];
  const dedupe = new Set<string>();
  for (const r of rows) {
    const code = (r.ISU_CD ?? "").trim();
    if (!CODE_RE.test(code)) continue; // alphanumeric / 빈값 제외
    if (dedupe.has(code)) continue;
    dedupe.add(code);
    out.push({
      ISU_SRT_CD: code,
      ISU_NM: r.ISU_NM,
      ISU_ABBRV: r.ISU_NM, // 매매정보 endpoint 는 ABBRV 미제공 — ISU_NM 으로 대체
      SECUGRP_NM: SECURITY_GROUP_BY_KIND[kind],
      KIND_STKCERT_TP_NM: SECURITY_GROUP_BY_KIND[kind], // ETF/ETN/ELW 는 보통주/우선주 구분 없음
      market: "KOSPI", // ETP 매매정보에 시장구분 없음 — 한국 ETP 거의 모두 KOSPI 상장
    });
  }
  return out;
}

export async function fetchEtpMastersFromKrx(
  client: AxiosInstance,
  basDd: string,
): Promise<KrxBaseInfoRow[]> {
  const [etfs, etns, elws] = await Promise.all([
    fetchOneKind(client, "etf", basDd),
    fetchOneKind(client, "etn", basDd),
    fetchOneKind(client, "elw", basDd),
  ]);
  return [...etfs, ...etns, ...elws];
}
