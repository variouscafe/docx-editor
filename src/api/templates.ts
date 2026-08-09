import { authHttp } from "./client";
import type {
  ReportTemplateRow,
  CreateTemplateBody,
  UpdateTemplateBody,
} from "@shared/report";

/** 템플릿 목록 — 내 템플릿 + 타인 공개 템플릿(isOwner 로 구분). */
export async function listTemplates(): Promise<ReportTemplateRow[]> {
  const res = await authHttp.get<{ items: ReportTemplateRow[] }>("/api/templates");
  return res.items;
}

/** 내 기본 템플릿 — 새 보고서 초기화용. 미지정(204)이면 null. */
export async function getDefaultTemplate(): Promise<ReportTemplateRow | null> {
  const r = await authHttp.get<ReportTemplateRow>("/api/templates/default");
  return r ?? null;
}

export async function createTemplate(body: CreateTemplateBody): Promise<ReportTemplateRow> {
  return authHttp.post<ReportTemplateRow>("/api/templates", { body });
}

export async function updateTemplate(
  id: string,
  body: UpdateTemplateBody,
): Promise<ReportTemplateRow> {
  return authHttp.patch<ReportTemplateRow>(`/api/templates/${id}`, { body });
}

export async function deleteTemplate(id: string): Promise<void> {
  await authHttp.del(`/api/templates/${id}`);
}
