import type { AxiosInstance } from "axios";
import { SHORT_CODE_RE } from "@gh-radar/shared";
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
 * 단축코드 필터 (2026-09-08 정정):
 *   과거 주석은 "키움 ka10027 이 6자리 숫자만 반환하므로 alphanumeric ETF/ELW 는 등록해도
 *   매칭 불가" 라고 적었지만, 그건 **우리 쪽 매퍼가 숫자 코드만 통과시켜서 그렇게 보였을 뿐**
 *   이었다. KRX 는 숫자 6자리 소진으로 2025년부터 영문 포함 단축코드를 발급하고, 키움도
 *   이를 그대로 반환한다.
 *   숫자 전용 필터를 유지하면 영문코드 ETF/ETN 이 마스터에 없는 상태가 되고, intraday-sync
 *   bootstrap 이 이들을 '미확인' 종목으로 새로 넣게 된다 — 즉 마스터가 ETP 를 ETP 라고
 *   말해줄 수 없다. 그래서 `SHORT_CODE_RE`(`^[0-9A-Z]{6}$`) 로 넓힌다.
 *   (quick-260908-fis 회귀: 영문코드 ETF 297종이 마스터 밖에 있던 탓에 SK하이닉스 단일종목
 *    레버리지·원자력 ETF 가 스캐너 top_movers 에 유입됐다.)
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
    if (!SHORT_CODE_RE.test(code)) continue; // 6자 단축코드(숫자+대문자) 아닌 값·빈값 제외
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
