import { z } from "zod";

/**
 * Phase 13 — GET /api/home 쿼리 검증 (HOME-01, T-13-10 Input Validation).
 *
 * 두 파라미터 모두 optional — 파라미터 조합으로 대상 스냅샷을 선택한다:
 *   - 없음        → 오늘(최신 captured_at) 스냅샷
 *   - date 만     → 해당 거래일의 최신 captured_at 스냅샷
 *   - capturedAt  → 정확히 그 시점 스냅샷 (date 무시 — 우선순위는 route 에서 처리)
 *
 * date 는 YYYY-MM-DD 형식만, capturedAt 은 ISO datetime 만 허용해 PostgREST
 * 바인딩 전에 형식 검증으로 injection/오류 입력을 차단한다 (limitUp/scanner 정규식 톤).
 */
export const HomeQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  capturedAt: z.string().datetime().optional(),
});

export type HomeQueryT = z.infer<typeof HomeQuery>;
