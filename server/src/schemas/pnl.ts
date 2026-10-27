import { z } from "zod";

/**
 * Phase 36 D-17 ~ D-19 — 일자별 매매손익 조회 입력 검증 (`GET /api/pnl` · `GET /api/admin/pnl`).
 *
 * - `account` = 계좌번호(gh-trade 정규화값 ≤ 12자 · `dma_user_accounts.account_no` CHECK 와 같은 상한). 가시성 판정은
 *   RPC 안의 `dma_visible_accounts` 조인이 정본이라 여기서는 길이만 본다 — 남의 계좌는 200 `groups: []`.
 * - `group`(어드민) = 묶음 기준(shared `PnlGroupBy`) — `user`(dma_user_id) | `account`(account_no) · 기본 user.
 * - `range` = 기간 칩(shared `PnlRange`) · 기본 30. 그 밖 값은 400 · RPC 0회.
 */
const PnlRangeParam = z.enum(["7", "30", "90", "month"]).default("30");

export const PnlQuery = z.object({
  account: z.string().trim().min(1).max(12),
  range: PnlRangeParam,
});
export type PnlQueryT = z.infer<typeof PnlQuery>;

export const AdminPnlQuery = z.object({
  group: z.enum(["user", "account"]).default("user"),
  range: PnlRangeParam,
});
export type AdminPnlQueryT = z.infer<typeof AdminPnlQuery>;
