import { authHttp } from "./client";
import type {
  AddMemberBody,
  AddMemberResult,
  CreateGroupBody,
  Group,
  GroupDetailResponse,
  GroupMember,
  UpdateGroupBody,
  UpdateMemberBody,
} from "@shared/groups";

/** 내 그룹 목록(역할·멤버수). 호출 시 pending 초대 자동 수락. */
export async function listGroups(): Promise<Group[]> {
  const res = await authHttp.get<{ items: Group[] }>("/api/groups");
  return res.items;
}

export async function createGroup(body: CreateGroupBody): Promise<Group> {
  return authHttp.post<Group>("/api/groups", { body });
}

export async function getGroup(id: string): Promise<GroupDetailResponse> {
  return authHttp.get<GroupDetailResponse>(`/api/groups/${id}`);
}

export async function updateGroup(id: string, body: UpdateGroupBody): Promise<Group> {
  return authHttp.patch<Group>(`/api/groups/${id}`, { body });
}

export async function deleteGroup(id: string): Promise<void> {
  await authHttp.del(`/api/groups/${id}`);
}

/** 멤버 추가(이메일). 즉시 등록 또는 pending 초대 결과 반환. */
export async function addMember(groupId: string, body: AddMemberBody): Promise<AddMemberResult> {
  return authHttp.post<AddMemberResult>(`/api/groups/${groupId}/members`, { body });
}

export async function updateMemberRole(
  groupId: string,
  uid: string,
  body: UpdateMemberBody,
): Promise<GroupMember> {
  return authHttp.patch<GroupMember>(`/api/groups/${groupId}/members/${uid}`, { body });
}

/** 멤버 제거 / 본인 탈퇴. */
export async function removeMember(groupId: string, uid: string): Promise<void> {
  await authHttp.del(`/api/groups/${groupId}/members/${uid}`);
}

export async function revokeInvitation(groupId: string, invId: string): Promise<void> {
  await authHttp.post(`/api/groups/${groupId}/invitations/${invId}/revoke`, { body: {} });
}
