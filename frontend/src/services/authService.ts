import type { AuthUser } from "@/lib/types";
import { apiClient } from "@/lib/apiClient";

const AUTH_KEYS = ["token", "userId", "role", "username"] as const;

export function clearAuthStorage() {
  AUTH_KEYS.forEach((k) => localStorage.removeItem(k));
}

interface LoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
}

export const authService = {
  async login(username: string, password: string): Promise<AuthUser> {
    const data = await apiClient.post<LoginResponse>("/auth/login", { username, password });
    const user: AuthUser = data.user;
    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", String(user.id));
    localStorage.setItem("role", user.role);
    localStorage.setItem("username", user.username);
    return user;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout", {});
    } catch {
      
    }
    clearAuthStorage();
  },

  getStoredUser(): AuthUser | null {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const role = localStorage.getItem("role") as AuthUser["role"] | null;
    const username = localStorage.getItem("username");
    if (!token || !userId || !role || !username) return null;
    return { id: Number(userId), username, role, department: null };
  },
};
