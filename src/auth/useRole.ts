import { useAuth } from "./AuthProvider";
import type { Role } from "../repos/profile";

export function useRole() {
  const { platformRole, loading } = useAuth();
  return { role: (platformRole as Role | null) ?? null, loading };
}
