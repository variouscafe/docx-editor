/**
 * 보고서/템플릿 도메인 타입 — DB 행 + API 요청/응답 shape.
 * FE·BE 공용. snake_case DB 컬럼은 BE 라우트에서 camelCase 로 매핑.
 */
import { JSONContent } from "./runs";
import { DocxOptions } from "./options";

export type ReportStatus = "draft" | "published";

/** 보고서 접근 권한. owner=작성자(전 권한), view=공유받은 그룹원(읽기·내보내기만). */
export type ReportPermission = "owner" | "view";

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
  /** 현재 호출 사용자의 접근 권한(서버 계산). */
  permission: ReportPermission;
  /** 공유받아 보는 경우 작성자 표시용(서버 join, optional). */
  ownerName?: string | null;
  /** 공유받아 보는 경우 그룹명 표시용(서버 join, optional). */
  groupName?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 휴지통(소프트 삭제) 시각 — null=정상. 목록 ?trash=1 응답에서만 값 가짐. */
  deletedAt?: string | null;
}

/**
 * 템플릿 공개 범위.
 * - private=소유자만
 * - public=사내 전체(읽기/복제 가능, 편집·삭제는 소유자)
 * - group=지정 그룹원(읽기/복제/적용 가능, 편집·삭제는 소유자). groupId 필수.
 */
export type TemplateVisibility = "private" | "public" | "group";

export interface ReportTemplateRow {
  id: string;
  userId: string | null;
  name: string;
  options: DocxOptions;
  isDefault: boolean;
  visibility: TemplateVisibility;
  /** 현재 호출 사용자가 소유자인지(서버 계산). false면 읽기/복제만 가능. */
  isOwner: boolean;
  /** visibility='group' 일 때의 대상 그룹 id. */
  groupId?: string | null;
  /** 표시용 그룹명(서버 join). group 템플릿 표시용. */
  groupName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 목록 응답용 경량 shape (content 제외) */
export interface ReportListItem {
  id: string;
  title: string;
  status: ReportStatus;
  /** 현재 호출 사용자의 접근 권한(서버 계산). */
  permission: ReportPermission;
  /** 공유받은 보고서의 작성자명(서버 join, optional). */
  ownerName?: string | null;
  /** 공유받은 보고서의 공유 그룹명(서버 join, optional). */
  groupName?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 휴지통(소프트 삭제) 시각 — null=정상. 목록 ?trash=1 응답에서만 값 가짐. */
  deletedAt?: string | null;
  /** 본문(content_md) 검색 매치 발췌 — ?q= 검색에서 제목이 아닌 본문에 hit 했을 때만 값. */
  snippet?: string | null;
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
  /** visibility='group' 일 때 대상 그룹 id. */
  groupId?: string | null;
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

/* ── 퍼블릭 링크 공유(로그인 없이 읽기 전용) ───────────────────── */

/** 보고서 1개의 퍼블릭 공유 상태(소유자용). 토큰은 추측 불가 capability. */
export interface PublicShareState {
  enabled: boolean;
  token: string | null;
}

/** 퍼블릭 링크로 노출되는 보고서 응답(로그인 없음) — 렌더링 최소 subset. */
export interface PublicReportView {
  title: string;
  content: JSONContent;
  templateOptions: DocxOptions;
  updatedAt: string;
}

/** 퍼블릭 공유 토글·재생성 요청 body. */
export interface UpdatePublicShareBody {
  /** true=활성화(토큰 없으면 발급), false=비활성화(토큰 유지). */
  enabled?: boolean;
  /** true=새 토큰 발급(이전 링크 즉시 무효, 활성 상태는 유지). */
  regenerate?: boolean;
}
