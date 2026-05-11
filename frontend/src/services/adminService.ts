import { apiClient } from "@/lib/apiClient";
import type { AdminUser, Group } from "@/lib/types";

export const adminService = {
  
  async listUsers(search?: string): Promise<AdminUser[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiClient.get<AdminUser[]>(`/admin/users${qs}`);
  },

  async getUser(id: number): Promise<AdminUser> {
    return apiClient.get<AdminUser>(`/admin/users/${id}`);
  },

  async createUser(body: {
    username: string;
    password: string;
    role?: string;
    department?: string;
  }): Promise<{ success: boolean; userId: number }> {
    return apiClient.post(`/admin/users`, body);
  },

  async updateUser(
    id: number,
    body: Partial<{ username: string; role: string; department: string; password: string; is_active: boolean }>
  ): Promise<AdminUser> {
    return apiClient.put(`/admin/users/${id}`, body);
  },

  async deleteUser(id: number): Promise<void> {
    await apiClient.delete(`/admin/users/${id}`);
  },

  async setUserStatus(id: number, is_active: boolean): Promise<void> {
    await apiClient.put(`/admin/users/${id}/status`, { is_active });
  },

  async listGroups(): Promise<Group[]> {
    return apiClient.get<Group[]>(`/groups/`);
  },

  async getGroup(id: number): Promise<Group> {
    return apiClient.get<Group>(`/groups/${id}`);
  },

  async createGroup(body: { name: string; description?: string }): Promise<Group> {
    return apiClient.post(`/groups/`, body);
  },

  async updateGroup(id: number, body: { name?: string; description?: string }): Promise<Group> {
    return apiClient.put(`/groups/${id}`, body);
  },

  async deleteGroup(id: number): Promise<void> {
    await apiClient.delete(`/groups/${id}`);
  },

  async assignUsersToGroup(groupId: number, userIds: number[]): Promise<void> {
    await apiClient.post(`/groups/${groupId}/assign`, { user_ids: userIds });
  },

  async listDepartments(): Promise<string[]> {
    return apiClient.get<string[]>(`/departments`);
  },
};
