import { execute } from "../db";

export type Role = "USER" | "ADMIN";

export type UserProfile = {
  userId: string;
  email: string | null;
  role: Role;
  createdAt: number;
  updatedAt: number;
};

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const r = await execute(`SELECT * FROM UserProfile WHERE userId=? LIMIT 1`, [userId]);
  return (r.rows?.[0] as UserProfile) ?? null;
}

export async function ensureProfile(userId: string, email: string | null): Promise<UserProfile> {
  const now = Date.now();
  const existing = await getProfile(userId);
  if (existing) return existing;

  const role: Role = "USER";
  await execute(
    `INSERT INTO UserProfile (userId, email, role, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, email, role, now, now]
  );

  return { userId, email, role, createdAt: now, updatedAt: now };
}

// pentru test / demo (îl folosim să “promovăm” contul tău)
export async function setRole(userId: string, role: Role) {
  const now = Date.now();
  await execute(
    `UPDATE UserProfile SET role=?, updatedAt=? WHERE userId=?`,
    [role, now, userId]
  );
}
