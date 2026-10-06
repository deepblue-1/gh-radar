"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeDmaPassword } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

import { ResultChips } from "./account-editor";
import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY } from "./reflect-chip";
import { useFieldSave } from "./use-field-save";

/**
 * PasswordChange — 편집 시트 「DMA 사용자 id (모든 서버 공통)」 필드 본문 (Phase 29 D-06 · D-08 · 목업 A `editor()`).
 *
 * id · 「비밀번호 변경」 · 목업 안내 문장 → 펼치면 입력 + 확인 칸 1개. 둘이 같을 때만 「변경」 이 켜진다.
 * 「변경」 = `POST …/password` 1건 — **누르는 즉시 두 칸을 비운다**(값을 상태 · 로그에 들고 있지 않는다 · D-06 —
 * 저장 뒤 다시 보여 주지 않는다). 응답의 서버별 결과는 그 자리 칩(「키 · 상태」)으로. 열린 세션은 유지되고 다음
 * 로그인부터 새 비밀이다(D-08 — 안내 문장이 말한다).
 */

export const PASSWORD_CHANGE_TEXT = {
  open: "비밀번호 변경",
  note: "비밀번호는 저장 뒤 다시 볼 수 없다. 변경해도 열린 세션은 유지되고 다음 로그인부터 적용.",
  password: "새 비밀번호",
  confirm: "비밀번호 확인",
  mismatch: "두 값이 달라요",
  submit: "변경",
  close: "닫기",
} as const;

const NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";

export function PasswordChange({ dmaUserId }: { dmaUserId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const save = useFieldSave<string>((pw) => changeDmaPassword(dmaUserId, pw), { retainValue: false });

  const mismatch = password !== "" && confirm !== "" && password !== confirm;
  const ready = password !== "" && password === confirm && save.state !== "saving";

  const submit = () => {
    if (!ready) return;
    const pw = password;
    setPassword("");
    setConfirm("");
    save.run(pw);
  };

  return (
    <div data-slot="admin-password" data-state={save.state}>
      <div className="flex items-center gap-2">
        <b className="min-w-0 truncate text-[15px] font-bold text-[var(--fg)]">{dmaUserId}</b>
        <span className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(ADMIN_BUTTON_SECONDARY, "h-7 px-2.5")}
        >
          {PASSWORD_CHANGE_TEXT.open}
        </Button>
      </div>
      <p className={NOTE}>{PASSWORD_CHANGE_TEXT.note}</p>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-2.5 flex flex-col gap-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              size="sm"
              type="password"
              aria-label={PASSWORD_CHANGE_TEXT.password}
              placeholder={PASSWORD_CHANGE_TEXT.password}
              autoComplete="new-password"
              maxLength={64}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              size="sm"
              type="password"
              aria-label={PASSWORD_CHANGE_TEXT.confirm}
              placeholder={PASSWORD_CHANGE_TEXT.confirm}
              autoComplete="new-password"
              maxLength={64}
              value={confirm}
              aria-invalid={mismatch || undefined}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {mismatch && <p className="text-[12.5px] text-[var(--destructive)]">{PASSWORD_CHANGE_TEXT.mismatch}</p>}
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setPassword("");
                setConfirm("");
                setOpen(false);
              }}
              className={cn(ADMIN_BUTTON_SECONDARY, "h-7 px-2.5")}
            >
              {PASSWORD_CHANGE_TEXT.close}
            </Button>
            <Button type="submit" size="sm" disabled={!ready} className={cn(ADMIN_BUTTON_PRIMARY, "h-7 px-2.5")}>
              {PASSWORD_CHANGE_TEXT.submit}
            </Button>
          </div>
        </form>
      )}

      {save.results && save.results.length > 0 && (
        <div data-slot="admin-password-results" className="mt-2">
          <ResultChips results={save.results} />
        </div>
      )}
      {save.error && (
        <p role="alert" className="mt-1.5 text-[12.5px] break-keep text-[var(--destructive)]">
          {save.error}
        </p>
      )}
    </div>
  );
}
