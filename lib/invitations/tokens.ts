import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Invitation tokens follow the same rule as password reset tokens: only a
 * SHA-256 *hash* of the token is ever stored (`invitations.token_hash`). The raw
 * token is returned exactly once to the admin who creates the invite (as a
 * copy-able link) and is never persisted, so a database read alone cannot be
 * used to accept an invitation.
 */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
