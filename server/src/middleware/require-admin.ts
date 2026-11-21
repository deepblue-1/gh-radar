import type { RequestHandler, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminMenu } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 29 (D-01 · D-02 · D-07) — Admin 라우트의 역할 관문. 반드시 `requireAuth()` **뒤에** 체인한다
 * (`req.userEmail` 은 requireAuth 가 토큰 검증 뒤 싣는다).
 *
 * 판정: service role 로 `app_users` 를 이메일(소문자 · trim) 키 1회 조회 → `role = 'admin'` 만 통과.
 *   - 이메일이 없는 토큰 · 표에 없음(승인 대기) · trader · viewer → 403 `FORBIDDEN` 「관리자만 사용할 수 있어요.」
 *   - 조회 오류 → 500 `DB_ERROR`(고정 문구 · 원문은 errorHandler 의 warn 로그에만). **권한 없음으로 위장하지 않는다** —
 *     DB 가 흔들릴 때 Admin 이 「권한 없음」 을 보면 원인을 엉뚱한 데서 찾는다.
 *
 * ★ 역할 원천은 DB 하나다 — webapp middleware(`my_app_access()` · 29-12) · relay(app-access 재적재 · 29-06)와
 *   **같은 표**를 본다. JWT 커스텀 클레임을 쓰지 않는 이유: 강등이 다음 요청부터 즉시여야 한다(D-04).
 *
 * 통과하면 `req.adminEmail`(정규화 이메일)을 싣는다 — 자기 보호 · 감사 로그 · relay `x-admin-email` 이 이 값만 쓴다.
 */
export function requireAdmin(): RequestHandler {
  return async (req, res, next) => {
    try {
      const email = req.userEmail?.trim().toLowerCase();
      if (!email) {
        forbid(res);
        return;
      }

      const supabase = req.app.locals.supabase as SupabaseClient;
      const { data, error } = await supabase
        .from("app_users")
        .select("role")
        .eq("email", email)
        .maybeSingle();
      if (error) throw new ApiError(500, "DB_ERROR", "권한 확인에 실패했습니다.", error);

      if ((data as { role?: string } | null)?.role !== "admin") {
        forbid(res);
        return;
      }

      req.adminEmail = email;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * quick 261121-n1b — 「admin 또는 그 메뉴가 열린 trader」 관문. `requireAdmin()` 과 같은 자리(`requireAuth()` 뒤)에 체인한다.
 * 지금 쓰는 곳은 `/api/admin/pnl`(`"pnl"`) · `/api/admin/settlement*`(`"settlement"` — 보기 + 모든 쓰기) 둘뿐이다.
 *
 * 판정(server · webapp middleware · 사이드바가 같은 규칙 — 정본 한 줄: 메뉴는 role = trader 일 때만 효력):
 *   - `app_users` 를 이메일(소문자 · trim) 키로 1회 조회(`role, admin_menus`).
 *   - role = admin → 통과. role = trader 이고 `admin_menus` 가 배열이며 `menu` 를 담고 있음 → 통과.
 *   - 그 밖(메뉴 없는 trader · viewer — 저장값이 있어도 · 표에 없음 · 이메일 없는 토큰) → 403 `FORBIDDEN`(requireAdmin 과 같은 문구).
 *   - `admin_menus` 가 없거나 배열이 아니면 메뉴 없음으로 본다(fail closed).
 *   - 조회 오류 → 500 `DB_ERROR` — 권한 없음으로 위장하지 않는다(requireAdmin 과 같은 이유).
 *
 * 통과하면 `req.adminEmail`(정규화 이메일)을 싣는다 — **admin 이 아닌 사람의 이메일도 실린다**(감사 기록 = 실제로 누른 사람).
 * 정산 쓰기의 RPC `p_by` · relay `x-admin-email` 헤더가 이 값을 쓴다(relay 는 헤더 존재만 본다).
 */
export function requireAdminOrMenu(menu: AdminMenu): RequestHandler {
  return async (req, res, next) => {
    try {
      const email = req.userEmail?.trim().toLowerCase();
      if (!email) {
        forbid(res);
        return;
      }

      const supabase = req.app.locals.supabase as SupabaseClient;
      const { data, error } = await supabase
        .from("app_users")
        .select("role, admin_menus")
        .eq("email", email)
        .maybeSingle();
      if (error) throw new ApiError(500, "DB_ERROR", "권한 확인에 실패했습니다.", error);

      const row = data as { role?: string; admin_menus?: unknown } | null;
      const menus: unknown[] = Array.isArray(row?.admin_menus) ? row.admin_menus : [];
      const allowed = row?.role === "admin" || (row?.role === "trader" && menus.includes(menu));
      if (!allowed) {
        forbid(res);
        return;
      }

      req.adminEmail = email;
      next();
    } catch (e) {
      next(e);
    }
  };
}

function forbid(res: Response): void {
  res.status(403).json({
    error: { code: "FORBIDDEN", message: "관리자만 사용할 수 있어요." },
  });
}
