/**
 * Phase 41 — 한투(KIS) 「종합 시황/공시 제목」(news-title · tr_id FHKST01011800) 응답 `output[]` 한 행.
 *
 * - 2026-11-11 실측 표본(`tests/fixtures/kis-news-title-sample.json` · `steps.<이름>.output[]`)
 *   행의 키 27개를 같은 이름 그대로 옮겼다. 값은 모두 문자열로 온다.
 * - 41-12 분류(`toIngestRows`)와 41-13 페이징(`pageUntilSeen` · `cursorOf`)이 같이 쓴다.
 * - 종목코드는 기사당 1개만 차 온다(`iscd1`) — 나머지 `iscd2..10` 은 빈 칸 `""`.
 *   이름 칸(`kor_isnm*`)은 종목이 없어도 `" "`(공백 한 칸)일 수 있으니 trim 해서 본다.
 */
export interface KisNewsTitleRow {
  /** 내용 조회용 일련번호 — 행 고유 키 · 페이징 커서(예 `"2026111121033582539"`) */
  cntt_usiq_srno: string;
  /** 뉴스 제공 업체 코드(예 `"6"` = 연합뉴스) */
  news_ofer_entp_code: string;
  /** 작성 일자 `YYYYMMDD` (KST) */
  data_dt: string;
  /** 작성 시각 `HHMMSS` (KST) */
  data_tm: string;
  /** HTS 공시 제목 내용 — 제목(길면 잘려 온다) */
  hts_pbnt_titl_cntt: string;
  /** 뉴스 대구분 코드 */
  news_lrdv_code: string;
  /** 자료 원천(제공처 이름 · 예 `"연합뉴스"`) */
  dorg: string;
  iscd1: string;
  iscd2: string;
  iscd3: string;
  iscd4: string;
  iscd5: string;
  iscd6: string;
  iscd7: string;
  iscd8: string;
  iscd9: string;
  iscd10: string;
  kor_isnm1: string;
  kor_isnm2: string;
  kor_isnm3: string;
  kor_isnm4: string;
  kor_isnm5: string;
  kor_isnm6: string;
  kor_isnm7: string;
  kor_isnm8: string;
  kor_isnm9: string;
  kor_isnm10: string;
}
