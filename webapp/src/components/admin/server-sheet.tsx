"use client";

import { useState, type ReactNode } from "react";
import {
  brokerOfServerKey,
  SERVER_KEY_RE,
  type AdminServerView,
  type DmaBroker,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { patchAdminServer, upsertAdminServer } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AdminSheet } from "./admin-sheet";
import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY } from "./reflect-chip";
import { ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT } from "./role-segment";
import { useFieldSave } from "./use-field-save";

/**
 * ServerSheet — `/admin/servers` 서버 편집 · 추가 시트 (Phase 29 D-09 · D-17 · 목업 A 「카드 탭 → 편집 시트(키 · 증권사 ·
 * 주소 · 포트)」).
 *
 * - **편집**(`mode="edit"`): 키 · 증권사는 읽기 전용(키를 바꾸는 것은 다른 서버다 — 증권사 변경은 서버도 400). host · port 만
 *   고친다. 사용자 시트(29-17)와 달리 필드별 즉시 저장이 아니라 **폼 단위 제출 1건**이다 — 주소와 포트는 함께 맞아야 relay
 *   가 붙을 수 있는 한 쌍이라, 반쯤 고친 주소가 즉시 재적재되면 안 된다. → `patchAdminServer(key, { host, port })`.
 * - **추가**(`mode="create"`): 키 · 증권사 세그먼트 · host · port → `upsertAdminServer` 1건. 새 서버는 사용 꺼짐으로 생긴다
 *   (DB 기본 — `enabled` 를 보내지 않는다). 켜기는 카드 토글에서 한다.
 * - **검증**(서버 스키마와 같은 규칙 · 버튼 비활성 + 칸 아래 한 줄): 키 = `SERVER_KEY_RE`(KB/KYOBO + 숫자 1~3자리) ·
 *   키 접두 = 증권사 · port 정수 1~65535 · host 공백 금지. 그 밖(IPv4 범위 · 호스트명 형식)은 서버가 400 으로 말하고
 *   그 문구를 시트 안 한 줄로 보인다. `SERVER_EXISTS`(409) 도 같은 자리다.
 * - 성공 → `onSaved`(재조회) · `onClose`. 토스트 없음.
 */

export const SERVER_SHEET_TEXT = {
  createTitle: "서버 추가",
  key: "키",
  broker: "증권사",
  host: "주소",
  port: "포트",
  save: "저장",
  create: "추가",
  cancel: "취소",
  keyInvalid: "키는 KB 또는 KYOBO 뒤에 숫자 1~3자리예요",
  brokerMismatch: "키 접두와 증권사가 달라요",
  hostInvalid: "주소에 공백을 넣을 수 없어요",
  portInvalid: "포트는 1~65535 예요",
  createNote: "새 서버는 사용 꺼짐으로 추가된다 — 카드에서 켠다.",
  saveFailed: "저장하지 못했어요",
} as const;

const BROKERS: readonly DmaBroker[] = ["KB", "KYOBO"];
const BROKER_LABEL: Readonly<Record<DmaBroker, string>> = { KB: "KB", KYOBO: "교보" };

const LABEL = "text-[12.5px] font-semibold text-[var(--muted-fg)]";
const ERROR_LINE = "text-[12.5px] leading-[1.45] break-keep text-[var(--destructive)]";
const READ_ONLY = "text-[15px] font-semibold text-[var(--fg)]";
const FORM_ID = "admin-server-sheet-form";

/** port 문자열 → 1~65535 정수 · 아니면 null. */
function parsePort(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 65535 ? n : null;
}

interface FieldProps {
  label: string;
  slot: string;
  error?: string | null;
  children: ReactNode;
}

function Field({ label, slot, error = null, children }: FieldProps) {
  return (
    <div data-slot={`server-sheet-field-${slot}`} className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      {children}
      {error && (
        <p data-slot={`server-sheet-error-${slot}`} className={ERROR_LINE}>
          {error}
        </p>
      )}
    </div>
  );
}

type SubmitBody =
  | { mode: "edit"; key: string; host: string; port: number }
  | { mode: "create"; key: string; broker: DmaBroker; host: string; port: number };

export interface ServerSheetProps {
  mode: "edit" | "create";
  /** edit 일 때 대상 서버. */
  server?: AdminServerView;
  /** 저장 성공 → 재조회. */
  onSaved: () => void;
  onClose: () => void;
}

export function ServerSheet({ mode, server, onSaved, onClose }: ServerSheetProps) {
  const edit = mode === "edit" && server !== undefined;
  const [key, setKey] = useState(edit ? server.key : "");
  const [broker, setBroker] = useState<DmaBroker>(edit ? server.broker : "KB");
  const [host, setHost] = useState(edit ? server.host : "");
  const [portText, setPortText] = useState(edit ? String(server.port) : "");

  const save = useFieldSave<SubmitBody>(
    async (body) => {
      if (body.mode === "edit") await patchAdminServer(body.key, { host: body.host, port: body.port });
      else await upsertAdminServer({ key: body.key, broker: body.broker, host: body.host, port: body.port });
    },
    {
      retainValue: false,
      onSuccess: () => {
        onSaved();
        onClose();
      },
      describeError: (err) => (err instanceof ApiClientError && err.message ? err.message : SERVER_SHEET_TEXT.saveFailed),
    },
  );

  const hostTrim = host.trim();
  const port = parsePort(portText.trim());
  const keyError = !edit && key !== "" && !SERVER_KEY_RE.test(key) ? SERVER_SHEET_TEXT.keyInvalid : null;
  const brokerError =
    !edit && SERVER_KEY_RE.test(key) && brokerOfServerKey(key) !== broker ? SERVER_SHEET_TEXT.brokerMismatch : null;
  const hostError = /\s/.test(hostTrim) ? SERVER_SHEET_TEXT.hostInvalid : null;
  const portError = portText.trim() !== "" && port === null ? SERVER_SHEET_TEXT.portInvalid : null;
  const changed = !edit || hostTrim !== server.host || port !== server.port;
  const ready =
    (edit || SERVER_KEY_RE.test(key)) &&
    brokerError === null &&
    hostTrim !== "" &&
    hostError === null &&
    port !== null &&
    changed &&
    save.state !== "saving";

  const submit = () => {
    if (!ready || port === null) return;
    save.run(
      edit
        ? { mode: "edit", key: server.key, host: hostTrim, port }
        : { mode: "create", key, broker, host: hostTrim, port },
    );
  };

  return (
    <AdminSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={edit ? server.key : SERVER_SHEET_TEXT.createTitle}
      footer={
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onClose}
            className={cn(ADMIN_BUTTON_SECONDARY, "ml-auto")}
          >
            {SERVER_SHEET_TEXT.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} size="sm" disabled={!ready} className={ADMIN_BUTTON_PRIMARY}>
            {edit ? SERVER_SHEET_TEXT.save : SERVER_SHEET_TEXT.create}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        data-slot="server-sheet"
        data-mode={edit ? "edit" : "create"}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4 pt-2"
      >
        {edit ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={SERVER_SHEET_TEXT.key} slot="key">
              <span data-slot="server-sheet-key" className={READ_ONLY}>
                {server.key}
              </span>
            </Field>
            <Field label={SERVER_SHEET_TEXT.broker} slot="broker">
              <span data-slot="server-sheet-broker" className={READ_ONLY}>
                {BROKER_LABEL[server.broker]}
              </span>
            </Field>
          </div>
        ) : (
          <>
            <Field label={SERVER_SHEET_TEXT.broker} slot="broker" error={brokerError}>
              <ToggleGroup
                type="single"
                variant="outline"
                value={broker}
                aria-label={SERVER_SHEET_TEXT.broker}
                onValueChange={(v) => {
                  if (v === "KB" || v === "KYOBO") setBroker(v);
                }}
                className={cn(ADMIN_SEGMENT_ROOT, "self-start")}
              >
                {BROKERS.map((b) => (
                  <ToggleGroupItem key={b} value={b} className={ADMIN_SEGMENT_ITEM}>
                    {BROKER_LABEL[b]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field label={SERVER_SHEET_TEXT.key} slot="key" error={keyError}>
              <Input
                aria-label={SERVER_SHEET_TEXT.key}
                placeholder={broker === "KB" ? "KB122" : "KYOBO130"}
                autoComplete="off"
                maxLength={8}
                value={key}
                aria-invalid={keyError !== null || brokerError !== null || undefined}
                onChange={(e) => setKey(e.target.value.trim().toUpperCase())}
              />
            </Field>
          </>
        )}

        <Field label={SERVER_SHEET_TEXT.host} slot="host" error={hostError}>
          <Input
            aria-label={SERVER_SHEET_TEXT.host}
            placeholder="192.0.2.10"
            autoComplete="off"
            spellCheck={false}
            maxLength={253}
            value={host}
            aria-invalid={hostError !== null || undefined}
            onChange={(e) => setHost(e.target.value)}
          />
        </Field>
        <Field label={SERVER_SHEET_TEXT.port} slot="port" error={portError}>
          <Input
            aria-label={SERVER_SHEET_TEXT.port}
            placeholder="9100"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            value={portText}
            aria-invalid={portError !== null || undefined}
            onChange={(e) => setPortText(e.target.value)}
            className="tabular-nums"
          />
        </Field>

        {!edit && <p className="text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]">{SERVER_SHEET_TEXT.createNote}</p>}
        {save.error && (
          <p role="alert" data-slot="server-sheet-error" className={ERROR_LINE}>
            {save.error}
          </p>
        )}
      </form>
    </AdminSheet>
  );
}
