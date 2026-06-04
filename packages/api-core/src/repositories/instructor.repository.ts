import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Instructor, InstructorInsert, InstructorUpdate } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

export class InstructorRepository extends BaseRepository<Instructor, InstructorInsert, InstructorUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'instructors');
  }

  async findByEmail(ctx: TenantContext, email: string): Promise<Instructor | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as any)
      .from('instructors')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null);

    if (ctx.organizationId !== null) {
      query = query.eq('organization_id', ctx.organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error as Error);
    return data as Instructor | null;
  }

  async findByPersonnummerHash(ctx: TenantContext, hash: string): Promise<Instructor | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as any)
      .from('instructors')
      .select('*')
      .eq('personnummer_hash', hash)
      .is('deleted_at', null);

    if (ctx.organizationId !== null) {
      query = query.eq('organization_id', ctx.organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error as Error);
    return data as Instructor | null;
  }
}
