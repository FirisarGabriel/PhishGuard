import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ensureProfile, getProfile, Role } from "../repos/profile";

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        if (!user?.id) {
          if (alive) {
            setRole(null);
            setLoading(false);
          }
          return;
        }

        let p = await getProfile(user.id);


        if (!p) {
          await ensureProfile(user.id, user.email ?? null);
          p = await getProfile(user.id);
        }

        if (alive) {

          setRole((p?.role as Role) ?? "USER");
          setLoading(false);
        }
      } catch {

        if (alive) {
          setRole("USER");
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id, user?.email]);

  return { role, loading };
}
