import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Student, StudentInsert, StudentUpdate } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

export class StudentRepository extends BaseRepository<Student, StudentInsert, StudentUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'students');
  }

  async findByEmail(ctx: TenantContext, email: string): Promise<Student | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as any)
      .from('students')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null);

    if (ctx.organizationId !== null) {
      query = query.eq('organization_id', ctx.organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error as Error);
    return data as Student | null;
  }

  async findByPersonnummerHash(ctx: TenantContext, hash: string): Promise<Student | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as any)
      .from('students')
      .select('*')
      .eq('personnummer_hash', hash)
      .is('deleted_at', null);

    if (ctx.organizationId !== null) {
      query = query.eq('organization_id', ctx.organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error as Error);
    return data as Student | null;
  }
}
