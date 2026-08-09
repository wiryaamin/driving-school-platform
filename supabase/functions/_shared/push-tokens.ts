/**
 * push-tokens — FCM device registration token lifecycle.
 *
 * Shared by every portal Edge Function (student-portal, instructor-portal,
 * guardian-portal) and the staff-facing communications function. Each caller
 * validates its own session/JWT before calling into here; this module only
 * knows about the (organization_id, ownerColumn, ownerId) tuple, mirroring
 * the decoupled-from-business-modules pattern already used by
 * communication-worker.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type PushTokenOwnerColumn = 'user_id' | 'student_id' | 'instructor_id' | 'guardian_id';

export interface RegisterPushTokenInput {
  organizationId: string;
  ownerColumn:    PushTokenOwnerColumn;
  ownerId:        string;
  token:          string;
  provider?:      'firebase' | 'onesignal';
  platform?:      'web' | 'ios' | 'android';
  userAgent?:     string | null;
}

export interface PushTokenRow {
  id: string;
  token: string;
}

/**
 * Registers a device token, or refreshes it if the caller already holds one
 * for this device. Firebase issues a *new* token string on refresh (there is
 * no "update in place" concept client-side).
 *
 * Deliberately NOT implemented as `.upsert(..., {onConflict:'token'})`: the
 * uniqueness constraint on `token` is a *partial* index
 * (`WHERE revoked_at IS NULL`, see the migration), and Postgres can only use
 * a partial index as an ON CONFLICT arbiter if the conflict clause repeats
 * the same predicate — something Supabase-js's `onConflict` option cannot
 * express. A plain `ON CONFLICT (token)` against a partial-unique column
 * fails on every call ("no unique or exclusion constraint matching the ON
 * CONFLICT specification"), not just on an actual conflict. Select-then-
 * branch avoids this entirely.
 *
 * Ordering: the new token is written (or the existing active row refreshed)
 * *before* the previous token is revoked, so a failure partway through never
 * leaves the caller with zero active tokens.
 */
export async function registerPushToken(
  supabase: SupabaseClient,
  input: RegisterPushTokenInput,
  previousToken?: string,
): Promise<{ id: string } | { error: string }> {
  if (!input.token || input.token.length < 16) {
    return { error: 'Invalid device token' };
  }

  const { data: existing } = await supabase
    .from('push_device_tokens')
    .select('id')
    .eq('token', input.token)
    .is('revoked_at', null)
    .maybeSingle();

  const row = {
    organization_id:    input.organizationId,
    [input.ownerColumn]: input.ownerId,
    provider:            input.provider ?? 'firebase',
    platform:            input.platform ?? 'web',
    user_agent:          input.userAgent ?? null,
    last_refreshed_at:   new Date().toISOString(),
  };

  const { data, error } = existing
    ? await supabase.from('push_device_tokens').update(row).eq('id', existing.id).select('id').single()
    : await supabase.from('push_device_tokens').insert({ ...row, token: input.token }).select('id').single();

  if (error || !data) return { error: error?.message ?? 'Failed to register device token' };

  if (previousToken && previousToken !== input.token) {
    await revokePushTokenByValue(supabase, input.organizationId, input.ownerColumn, input.ownerId, previousToken, 'client_refreshed');
  }

  return { id: data.id as string };
}

/**
 * Marks a token revoked by its own row id — used for explicit unsubscribe
 * (logout, permission revoked). Requires the caller's own owner identity
 * (ownerColumn/ownerId) to match the token's owner — without this, any
 * authenticated same-tenant user could revoke any other user's device by
 * guessing/observing its row id.
 */
export async function revokePushToken(
  supabase: SupabaseClient,
  organizationId: string,
  ownerColumn: PushTokenOwnerColumn,
  ownerId: string,
  tokenId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase
    .from('push_device_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('id', tokenId)
    .eq('organization_id', organizationId)
    .eq(ownerColumn, ownerId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Token not found' };
  return { ok: true };
}

/**
 * Marks a token revoked by its token string — used internally for refresh
 * replacement and provider-reported invalid tokens. Same ownership scoping
 * as revokePushToken() and for the same reason: `previousToken` on the
 * register call is a raw string taken from the request body, so without an
 * ownership check a caller could revoke another user's token by value.
 */
export async function revokePushTokenByValue(
  supabase: SupabaseClient,
  organizationId: string,
  ownerColumn: PushTokenOwnerColumn,
  ownerId: string,
  token: string,
  reason: string,
): Promise<void> {
  await supabase
    .from('push_device_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('organization_id', organizationId)
    .eq(ownerColumn, ownerId)
    .eq('token', token)
    .is('revoked_at', null);
}

/** All active (non-revoked) device tokens for a recipient — dispatch fans out to every one. */
export async function getActivePushTokens(
  supabase: SupabaseClient,
  organizationId: string,
  ownerColumn: PushTokenOwnerColumn,
  ownerId: string,
): Promise<PushTokenRow[]> {
  const { data, error } = await supabase
    .from('push_device_tokens')
    .select('id, token')
    .eq('organization_id', organizationId)
    .eq(ownerColumn, ownerId)
    .is('revoked_at', null);

  if (error || !data) return [];
  return data as PushTokenRow[];
}

/** Best-effort last_used_at touch after a successful dispatch — not awaited by callers. */
export async function touchPushToken(supabase: SupabaseClient, tokenId: string): Promise<void> {
  await supabase
    .from('push_device_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenId);
}
