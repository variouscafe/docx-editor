/**
 * 보고서/템플릿 도메인 타입 — DB 행 + API 요청/응답 shape.
 * FE·BE 공용. snake_case DB 컬럼은 BE 라우트에서 camelCase 로 매핑.
 */
import { JSONContent } from "./runs";
import { DocxOptions } from "./options";

export type ReportStatus = "draft" | "published";

export interface Report {
  id: string;
  userId: string;
  title: string;
  /** 정규 콘텐츠 — ProseMirror/TipTap JSON (포맷 속성은 marks 로 내장) */
  content: JSONContent;
  /** best-effort 마크다운 미러 (검색/AI/이식용). JSON 이 소스 오브 트루스. */
  contentMd: string | null;
  /** 저장 시점 DocxOptions 스냅샷 — 템플릿이 변경돼도 문서 모양 고정 */
  templateOptions: DocxOptions;
  /** 출처 템플릿 표시용 (선택). 렌더링은 templateOptions 가 기준. */
  templateId: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

/** 템플릿 공개 범위. private=소유자만, public=사내 전체(읽기/복제 가능, 편집·삭제는 소유자). */
export type TemplateVisibility = "private" | "public";

export interface ReportTemplateRow {
  id: string;
  userId: string | null;
  name: string;
  options: DocxOptions;
  isDefault: boolean;
  visibility: TemplateVisibility;
  /** 현재 호출 사용자가 소유자인지(서버 계산). false면 읽기/복제만 가능. */
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 목록 응답용 경량 shape (content 제외) */
export interface ReportListItem {
  id: string;
  title: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportBody {
  title: string;
  content: JSONContent;
  contentMd?: string;
  templateOptions: DocxOptions;
  templateId?: string | null;
  status?: ReportStatus;
}

export type UpdateReportBody = Partial<CreateReportBody>;

export interface CreateTemplateBody {
  name: string;
  options: DocxOptions;
  isDefault?: boolean;
  visibility?: TemplateVisibility;
}

export type UpdateTemplateBody = Partial<CreateTemplateBody>;

/* ── 리비전(버전 기록) ─────────────────────────────────────────── */
export interface Revision {
  id: string;
  reportId: string;
  content: JSONContent;
  contentMd: string | null;
  templateOptions: DocxOptions;
  label: string | null;
  isManual: boolean;
  createdAt: string;
}

/** 목록 응답용 경량 shape (content 제외) */
export interface RevisionListItem {
  id: string;
  reportId: string;
  label: string | null;
  isManual: boolean;
  createdAt: string;
}

export interface CreateRevisionBody {
  label?: string;
}
