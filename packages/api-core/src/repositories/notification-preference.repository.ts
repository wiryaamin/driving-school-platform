import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { NotificationPreference } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

type NotificationPreferenceInsert = {
  profile_id:        string;
  channel:           string;
  notification_type: string;
  enabled?:          boolean;
};

type NotificationPreferenceUpdate = Partial<NotificationPreferenceInsert>;

export class NotificationPreferenceRepository extends BaseRepository<
  NotificationPreference,
  NotificationPreferenceInsert,
  NotificationPreferenceUpdate
> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'notification_preferences');
  }

  async findByProfile(
    ctx: TenantContext,
    profileId: string
  ): Promise<NotificationPreference[]> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    const { data, error } = await (this.db as AnyClient)
      .from('notification_preferences')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('profile_id', profileId)
      .order('channel', { ascending: true });

    if (error) throw mapDbError(error as Error);
    return (data ?? []) as NotificationPreference[];
  }

  async upsert(
    ctx: TenantContext,
    profileId: string,
    channel: string,
    notificationType: string,
    enabled: boolean
  ): Promise<NotificationPreference> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    const { data, error } = await (this.db as AnyClient)
      .from('notification_preferences')
      .upsert(
        {
          organization_id:   ctx.organizationId,
          profile_id:        profileId,
          channel,
          notification_type: notificationType,
          enabled,
          updated_at:        new Date().toISOString(),
        },
        { onConflict: 'profile_id,channel,notification_type' }
      )
      .select()
      .single();

    if (error) throw mapDbError(error as Error);
    return data as NotificationPreference;
  }
}
