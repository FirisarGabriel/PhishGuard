import type { User } from "@supabase/supabase-js";

import { execute } from "../db";
import { supabase } from "../auth/supabase";
import {
  cacheOrganizationMembers,
  cacheOrganizations,
  getOrganizationsForUser,
  type OrganizationWithMembership,
} from "./b2b";

export type Role = "USER" | "ADMIN";

export type UserProfile = {
  userId: string;
  email: string | null;
  role: Role;
  createdAt: number;
  updatedAt: number;
};

type RemoteProfileRow = {
  id: string;
  email?: string | null;
  platform_role?: Role | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RemoteOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

type RemoteOrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationWithMembership["membershipRole"];
  status: OrganizationWithMembership["membershipStatus"];
  joined_at?: string | null;
  created_at: string;
  updated_at: string;
};

function toMillis(value?: string | null): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapRemoteProfile(row: RemoteProfileRow, fallbackEmail: string | null): UserProfile {
  return {
    userId: row.id,
    email: row.email ?? fallbackEmail,
    role: row.platform_role ?? "USER",
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at),
  };
}

async function upsertLocalProfile(profile: UserProfile): Promise<void> {
  await execute(
    `
    INSERT OR REPLACE INTO UserProfile (userId, email, role, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      profile.userId,
      profile.email,
      profile.role,
      profile.createdAt,
      profile.updatedAt,
    ]
  );
}

export async function cacheUserProfiles(profiles: UserProfile[]): Promise<void> {
  for (const profile of profiles) {
    await upsertLocalProfile(profile);
  }
}

async function fetchRemoteProfiles(userIds: string[]): Promise<void> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, platform_role, created_at, updated_at")
    .in("id", ids);

  if (error) {
    throw error;
  }

  await cacheUserProfiles(
    ((data ?? []) as RemoteProfileRow[]).map((row) => mapRemoteProfile(row, row.email ?? null))
  );
}

async function fetchRemoteMemberships(
  userId: string
): Promise<OrganizationWithMembership[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `
      id,
      organization_id,
      user_id,
      role,
      status,
      joined_at,
      created_at,
      updated_at
      `
    )
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as RemoteOrganizationMemberRow[];
  const organizationIds = Array.from(new Set(rows.map((row) => row.organization_id).filter(Boolean)));

  let organizations: Array<{
    id: string;
    name: string;
    slug: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    archivedAt: number | null;
    pendingSync: 0;
  }> = [];

  if (organizationIds.length) {
    const { data: organizationRows, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name, slug, created_by, created_at, updated_at, archived_at")
      .in("id", organizationIds);

    if (organizationError) {
      throw organizationError;
    }

    organizations = ((organizationRows ?? []) as RemoteOrganizationRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdBy: row.created_by,
      createdAt: toMillis(row.created_at),
      updatedAt: toMillis(row.updated_at),
      archivedAt: row.archived_at ? toMillis(row.archived_at) : null,
      pendingSync: 0 as const,
    }));
  }

  const members = rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at ? toMillis(row.joined_at) : null,
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at),
    pendingSync: 0 as const,
  }));

  await cacheOrganizations(organizations);
  await cacheOrganizationMembers(members);
  await fetchRemoteProfiles(rows.map((row) => row.user_id));

  return getOrganizationsForUser(userId);
}

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

export async function ensureRemoteProfile(user: User): Promise<UserProfile> {
  const email = user.email ?? null;

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id, email, platform_role, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const profile = mapRemoteProfile(existing as RemoteProfileRow, email);
    await upsertLocalProfile(profile);
    return profile;
  }

  const fullName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email,
      full_name: fullName,
      platform_role: "USER",
    })
    .select("id, email, platform_role, created_at, updated_at")
    .single();

  if (insertError) {
    throw insertError;
  }

  const profile = mapRemoteProfile(inserted as RemoteProfileRow, email);
  await upsertLocalProfile(profile);
  return profile;
}

export async function getCachedOrganizationsForUser(
  userId: string
): Promise<OrganizationWithMembership[]> {
  return getOrganizationsForUser(userId);
}

export async function hydrateRemoteAuthState(user: User): Promise<{
  profile: UserProfile;
  organizations: OrganizationWithMembership[];
}> {
  const profile = await ensureRemoteProfile(user);
  const organizations = await fetchRemoteMemberships(user.id);
  return { profile, organizations };
}

export async function hydrateCachedAuthState(user: User): Promise<{
  profile: UserProfile;
  organizations: OrganizationWithMembership[];
}> {
  let profile = await getProfile(user.id);
  if (!profile) {
    profile = await ensureProfile(user.id, user.email ?? null);
  }

  const organizations = await getCachedOrganizationsForUser(user.id);
  return { profile, organizations };
}

// pentru test / demo (îl folosim să “promovăm” contul tău)
export async function setRole(userId: string, role: Role) {
  const now = Date.now();
  await execute(
    `
    INSERT INTO UserProfile (userId, email, role, createdAt, updatedAt)
    VALUES (?, NULL, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET role=excluded.role, updatedAt=excluded.updatedAt
    `,
    [userId, role, now, now]
  );

  await execute(
    `UPDATE UserProfile SET role=?, updatedAt=? WHERE userId=?`,
    [role, now, userId]
  );

  await supabase.from("profiles").upsert({
    id: userId,
    platform_role: role,
  });
}
