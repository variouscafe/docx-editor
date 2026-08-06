/**
 * 그룹·멤버십·초대·보고서 공유 도메인 타입 — DB 행 + API 요청/응답 shape.
 * FE·BE 공용. snake_case DB 컬럼은 BE 라우트에서 camelCase 로 매핑.
 */

/** 그룹 내 역할. owner=그룹 생성자(전 권한), admin=멤버 관리 위임, member=공유 리소스 사용. */
export type GroupRole = "owner" | "admin" | "member";

/** 초대 가능한 역할(owner 는 생성자로 고정되므로 초대/변경 대상에서 제외). */
export type InviteRole = "admin" | "member";

export type InvitationStatus = "pending" | "accepted" | "revoked";

/** 그룹 목록/상위 응답의 그룹 단위. myRole/memberCount 는 서버 계산. */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  /** 현재 호출 사용자의 역할(서버 계산). */
  myRole: GroupRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 그룹 멤버. users 캐시 join 으로 email/name 포함. isMe 는 FE 편의. */
export interface GroupMember {
  id: string; // membership id
  groupId: string;
  userId: string;
  email: string;
  name: string | null;
  role: GroupRole;
  joinedAt: string;
  /** 현재 호출 사용자인지(FE 하이라이트/셀프 제약용). */
  isMe: boolean;
}

/** 이메일 기반 초대. 미가입자는 pending → 로그인 시 자동 수락. */
export interface GroupInvitation {
  id: string;
  groupId: string;
  email: string;
  role: InviteRole;
  invitedBy: string;
  status: InvitationStatus;
  createdAt: string;
  acceptedAt: string | null;
}

/** 보고서 공유(그룹 단위, 읽기 전용). permission 은 현재 'view' 고정(확장 대비 컬럼 유지). */
export interface ReportShare {
  id: string;
  reportId: string;
  groupId: string;
  /** 표시용 그룹명(서버 join). */
  groupName: string;
  sharedBy: string;
  permission: "view";
  createdAt: string;
}

/** 그룹 상세 응답 — 그룹 + 멤버 + pending 초대. */
export interface GroupDetailResponse {
  group: Group;
  members: GroupMember[];
  invitations: GroupInvitation[];
}

/** 멤버 추가 결과 — 즉시 등록(이미 캐시에 있는 사용자) 또는 pending 초대. */
export interface AddMemberResult {
  member?: GroupMember;
  invitation?: GroupInvitation;
}

/* ── 요청 body ─────────────────────────────────────────────────── */
export interface CreateGroupBody {
  name: string;
  description?: string;
}

export interface UpdateGroupBody {
  name?: string;
  description?: string | null;
}

export interface AddMemberBody {
  email: string;
  role: InviteRole;
}

export interface UpdateMemberBody {
  role: InviteRole;
}

export interface CreateReportShareBody {
  groupId: string;
}
