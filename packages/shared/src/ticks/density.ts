/**
 * Phase 37 (D-00 ① 슬라이더) 5분 거래대금 밀도 · VI 구간.
 *
 * RESEARCH Pattern 7 「5분 밀도」: 08:00~20:00 = 144칸. 칸 값 = 그 칸에 **수신된** A3 `px × qty` 합(그 거래소 ·
 * 모든 보드 · 단일가 포함) — 슬라이더가 수신 시간축이라 칸도 수신 시각 기준이다(체결 시각 아님). 막대 높이 정규화
 * (√ · log)는 화면 몫이다. VI 눈금 = R8 `vi_status` '1' 발동 ~ '2' 해제의 수신 시각.
 */
import { decodeFields, numOf as num, type FieldValue } from "./decode";
import { R8_LAYOUT } from "./layouts";
import { TAG_CODE, payloadOf, recvOrderOf, type A3Columns, type TickIndex } from "./record-index";
import { dayStartNs } from "./tick-time";

/** 08:00~20:00 5분 칸 수. */
export const DENSITY_BUCKETS = 144;
/** 칸 폭 5분(ns). */
export const DENSITY_BUCKET_NS = 300_000_000_000n;

/** 칸마다 A3 px × qty 합(원). recv 가 [08:00, 20:00) 밖인 체결은 뺀다. */
export function densityOf(a3: A3Columns, index: TickIndex, ymd: string): Float64Array {
  const out = new Float64Array(DENSITY_BUCKETS);
  const start = dayStartNs(ymd, "0800");
  const span = DENSITY_BUCKET_NS * BigInt(DENSITY_BUCKETS);
  for (let j = 0; j < a3.n; j++) {
    const d = index.recvNs[a3.rec[j]!]! - start;
    if (d < 0n || d >= span) continue;
    out[Number(d / DENSITY_BUCKET_NS)]! += a3.px[j]! * a3.qty[j]!;
  }
  return out;
}

/** VI 한 구간 — 발동 R8 수신 ~ 해제 R8 수신. 해제가 아직 없으면 endNs · endRec null(진행 중). */
export interface ViSpan {
  startNs: bigint;
  endNs: bigint | null;
  startRec: number;
  endRec: number | null;
  /** '1' 정적 · '2' 동적 · '3' 정적+동적 · '4' NXT VI연장(발동 전문 값). */
  viType: string;
  /** 발동 전문의 trigger_price. */
  triggerPx: number;
}

/**
 * R8 ∧ ok 를 수신순으로 보며 '1' 이면 구간을 열고, 이어 오는 '2' 로 닫는다. 열린 구간이 있는데 다시 온 '1'(연장 ·
 * 재송신)은 같은 구간으로 본다 · 짝 없는 '2' 는 무시한다.
 */
export function viSpansOf(buf: Uint8Array, index: TickIndex): ViSpan[] {
  const out: ViSpan[] = [];
  let open: ViSpan | null = null;
  const order = recvOrderOf(index);
  for (let p = 0; p < order.length; p++) {
    const r = order[p]!;
    if (index.tag[r] !== TAG_CODE.R8 || index.ok[r] !== 1) continue;
    const row = decodeFields(R8_LAYOUT, payloadOf(buf, index, r), index.recvNs[r]!, index.label);
    const status = row["vi_status"];
    if (status === "1") {
      if (open !== null) continue;
      open = {
        startNs: index.recvNs[r]!,
        endNs: null,
        startRec: r,
        endRec: null,
        viType: typeof row["vi_type"] === "string" ? row["vi_type"] : "",
        triggerPx: num(row["trigger_price"]),
      };
      out.push(open);
    } else if (status === "2" && open !== null) {
      open.endNs = index.recvNs[r]!;
      open.endRec = r;
      open = null;
    }
  }
  return out;
}
