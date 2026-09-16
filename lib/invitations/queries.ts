import "server-only";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import type { AppRole } from "@/types/domain";
import { generateInviteToken, hashInviteToken } from "./tokens";

/** Invitations are valid for two weeks after they are created. */
export const INVITE_TTL_DAYS = 14;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateInvitationInput = {
  organizationId: string;
  email: string;
  role: AppRole;
  createdBy: string;
};

export type CreateInvitationResult = {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  expiresAt: string;
};

/**
 * Create (or refresh) an invitation for an email into a specific organization.
 * Any previous un-accepted invite for the same email+org is discarded so only
 * the newest link works. Refuses to invite someone who is already an active
 * member. Returns the raw token exactly once — the caller turns it into a link.
 */
export async function createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");

  // Already a member of THIS organization? (A user may exist in another org.)
  const existingUser = await prisma.users.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const membership = await prisma.organization_members.findUnique({
      where: { organization_id_user_id: { organization_id: input.organizationId, user_id: existingUser.id } },
      select: { id: true },
    });
    if (membership) throw new Error("That person is already a member of this workspace.");
    throw new Error("An account with that email already exists. They can be added by an administrator.");
  }

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitations.deleteMany({
      where: { organization_id: input.organizationId, email, accepted_at: null },
    });
    const created = await tx.invitations.create({
      data: {
        organization_id: input.organizationId,
        email,
        role: input.role,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: input.createdBy,
      },
      select: { id: true, email: true, role: true, expires_at: true },
    });
    await tx.audit_history.create({
      data: {
        entity_type: "invitation",
        entity_id: created.id,
        action: "create",
        actor_user_id: input.createdBy,
        organization_id: input.organizationId,
        metadata: { email, role: input.role },
      },
    });
    return created;
  });

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token,
    expiresAt: invitation.expires_at.toISOString(),
  };
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: AppRole;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
};

/** Un-accepted invitations for an org, newest first (for the admin/onboarding UI). */
export async function listPendingInvitations(organizationId: string): Promise<PendingInvitation[]> {
  const rows = await prisma.invitations.findMany({
    where: { organization_id: organizationId, accepted_at: null },
    orderBy: { created_at: "desc" },
    select: { id: true, email: true, role: true, expires_at: true, created_at: true },
  });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: r.expires_at.toISOString(),
    isExpired: r.expires_at.getTime() < now,
    createdAt: r.created_at.toISOString(),
  }));
}

/** Revoke a pending invitation. Scoped to the org so cross-tenant ids 404. */
export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
  actorUserId: string,
): Promise<void> {
  const result = await prisma.invitations.deleteMany({
    where: { id: invitationId, organization_id: organizationId, accepted_at: null },
  });
  if (result.count === 0) throw new Error("That invitation no longer exists.");
  await prisma.audit_history.create({
    data: {
      entity_type: "invitation",
      entity_id: invitationId,
      action: "revoke",
      actor_user_id: actorUserId,
      organization_id: organizationId,
    },
  });
}

export type InvitationOrg = {
  name: string;
  slug: string;
  primaryColor: string | null;
  accentColor: string | null;
  hasLogo: boolean;
};

export type InvitationLookup =
  | { status: "valid"; email: string; role: AppRole; organization: InvitationOrg }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "accepted" };

/**
 * Look up an invitation by its raw token (hashed before comparison) for the
 * branded accept page. Never reveals which of "wrong token" vs "no such invite"
 * occurred beyond an "invalid" status.
 */
export async function findInvitationByToken(token: string): Promise<InvitationLookup> {
  if (!token) return { status: "invalid" };
  const invitation = await prisma.invitations.findUnique({
    where: { token_hash: hashInviteToken(token) },
    select: {
      email: true,
      role: true,
      expires_at: true,
      accepted_at: true,
      organization: {
        select: {
          name: true,
          slug: true,
          branding: { select: { primary_color: true, accent_color: true, logo_updated_at: true } },
        },
      },
    },
  });

  if (!invitation) return { status: "invalid" };
  if (invitation.accepted_at) return { status: "accepted" };
  if (invitation.expires_at.getTime() < Date.now()) return { status: "expired" };

  return {
    status: "valid",
    email: invitation.email,
    role: invitation.role,
    organization: {
      name: invitation.organization.name,
      slug: invitation.organization.slug,
      primaryColor: invitation.organization.branding?.primary_color ?? null,
      accentColor: invitation.organization.branding?.accent_color ?? null,
      hasLogo: Boolean(invitation.organization.branding?.logo_updated_at),
    },
  };
}

export type AcceptInvitationResult = { email: string; slug: string };

/**
 * Accept an invitation: create the user (with the invited role), their tenant
 * membership, and an employee profile — all in one transaction — then mark the
 * invitation accepted. Re-validates the token, expiry, and that the email is
 * still free server-side, so a stale or replayed client submission cannot
 * create a second account or bypass expiry.
 */
export async function acceptInvitation(input: {
  token: string;
  fullName: string;
  password: string;
}): Promise<AcceptInvitationResult> {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Enter your name.");
  if (input.password.length < 8) throw new Error("Choose a password with at least 8 characters.");

  const tokenHash = hashInviteToken(input.token);
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitations.findUnique({
      where: { token_hash: tokenHash },
      select: {
        id: true,
        email: true,
        role: true,
        expires_at: true,
        accepted_at: true,
        organization_id: true,
        organization: { select: { slug: true, timezone: true } },
      },
    });

    if (!invitation) throw new Error("This invitation link is not valid.");
    if (invitation.accepted_at) throw new Error("This invitation has already been used.");
    if (invitation.expires_at.getTime() < Date.now()) throw new Error("This invitation has expired.");

    const email = invitation.email.toLowerCase();
    const emailTaken = await tx.users.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) throw new Error("An account with this email already exists. Please sign in instead.");

    const user = await tx.users.create({
      data: { email, role: invitation.role, is_active: true, password_hash: passwordHash },
      select: { id: true },
    });

    await tx.organization_members.create({
      data: {
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
        is_active: true,
      },
    });

    await tx.employee_profiles.create({
      data: {
        user_id: user.id,
        organization_id: invitation.organization_id,
        full_name: fullName,
        timezone: invitation.organization.timezone,
        can_approve: invitation.role === "manager" || invitation.role === "admin",
      },
    });

    await tx.invitations.update({
      where: { id: invitation.id },
      data: { accepted_at: new Date() },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "invitation",
        entity_id: invitation.id,
        action: "accept",
        actor_user_id: user.id,
        organization_id: invitation.organization_id,
        metadata: { email },
      },
    });

    return { email, slug: invitation.organization.slug };
  });
}
