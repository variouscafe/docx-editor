import { authHttp, authFetchRaw, API_URL } from "./client";
import type {
  Report,
  ReportListItem,
  CreateReportBody,
  UpdateReportBody,
  Revision,
  RevisionListItem,
  CreateRevisionBody,
  PublicShareState,
  PublicReportView,
  UpdatePublicShareBody,
} from "@shared/report";
import type { ReportShare, CreateReportShareBody } from "@shared/groups";

export async function listReports(q?: string): Promise<ReportListItem[]> {
  const res = await authHttp.get<{ items: ReportListItem[] }>("/api/reports", {
    query: q ? { q } : undefined,
  });
  return res.items;
}

export async function getReport(id: string): Promise<Report> {
  return authHttp.get<Report>(`/api/reports/${id}`);
}

export async function createReport(body: CreateReportBody): Promise<Report> {
  return authHttp.post<Report>("/api/reports", { body });
}

export async function updateReport(id: string, body: UpdateReportBody): Promise<Report> {
  return authHttp.patch<Report>(`/api/reports/${id}`, { body });
}

export async function deleteReport(id: string): Promise<void> {
  await authHttp.del(`/api/reports/${id}`);
}

/* ── 공유(그룹 단위, 읽기 전용) ─────────────────────────────────── */
export async function listReportShares(reportId: string): Promise<ReportShare[]> {
  const res = await authHttp.get<{ items: ReportShare[] }>(`/api/reports/${reportId}/shares`);
  return res.items;
}

export async function shareReport(
  reportId: string,
  body: CreateReportShareBody,
): Promise<ReportShare> {
  return authHttp.post<ReportShare>(`/api/reports/${reportId}/shares`, { body });
}

export async function unshareReport(reportId: string, shareId: string): Promise<void> {
  await authHttp.del(`/api/reports/${reportId}/shares/${shareId}`);
}

/* ── 퍼블릭 링크 공유(로그인 없이 읽기 전용) ───────────────────── */

/** 퍼블릭 공유 상태 조회(owner). */
export async function getPublicShare(reportId: string): Promise<PublicShareState> {
  return authHttp.get<PublicShareState>(`/api/reports/${reportId}/public-share`);
}

/** 퍼블릭 공유 토글·토큰 재생성(owner). */
export async function setPublicShare(
  reportId: string,
  body: UpdatePublicShareBody,
): Promise<PublicShareState> {
  return authHttp.put<PublicShareState>(`/api/reports/${reportId}/public-share`, { body });
}

/**
 * 퍼블릭 링크로 보고서 읽기(로그인 없음) — authHttp 미사용(Bearer/refresh 없음).
 * 404(무효·해제된 링크) 시 status 를 담은 에러를 throw.
 */
export async function getPublicReport(token: string): Promise<PublicReportView> {
  const res = await fetch(`${API_URL}/api/public/reports/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error(body?.error?.message ?? "보고서를 불러올 수 없습니다.") as Error & {
      status: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as PublicReportView;
}

/** DOCX 내보내기 — BE 가 저장된 JSON+템플릿으로 생성한 Blob 반환. */
export async function exportReport(id: string): Promise<Blob> {
  const res = await authFetchRaw(`/api/reports/${id}/export`, { method: "POST" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.blob();
}

/* ── 리비전(버전 기록) ─────────────────────────────────────────── */
export async function listRevisions(reportId: string): Promise<RevisionListItem[]> {
  const res = await authHttp.get<{ items: RevisionListItem[] }>(
    `/api/reports/${reportId}/revisions`,
  );
  return res.items;
}

export async function getRevision(reportId: string, rid: string): Promise<Revision> {
  return authHttp.get<Revision>(`/api/reports/${reportId}/revisions/${rid}`);
}

export async function createRevision(
  reportId: string,
  body: CreateRevisionBody = {},
): Promise<Revision> {
  return authHttp.post<Revision>(`/api/reports/${reportId}/revisions`, { body });
}

export async function restoreRevision(reportId: string, rid: string): Promise<Report> {
  return authHttp.post<Report>(`/api/reports/${reportId}/revisions/${rid}/restore`);
}

export async function deleteRevision(reportId: string, rid: string): Promise<void> {
  await authHttp.del(`/api/reports/${reportId}/revisions/${rid}`);
}
