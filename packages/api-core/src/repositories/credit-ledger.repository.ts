import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type {
  CreditLedgerEntry,
  CreditBalanceCache,
  LessonCategory,
  WalletCategoryBalance,
  StudentWallet,
  CreditLedgerListQueryInput,
  GrantCreditInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

// Stub types — credit_ledger is append-only via SECURITY DEFINER functions
type LedgerInsert = Record<string, never>;
type LedgerUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class CreditLedgerRepository extends BaseRepository<CreditLedgerEntry, LedgerInsert, LedgerUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'credit_ledger');
  }

  // Append-only: application code must not INSERT directly into credit_ledger.
  override async insert(_ctx: TenantContext, _dto: LedgerInsert): Promise<CreditLedgerEntry> {
    throw new InternalError('CreditLedger is append-only — use consume_credit() or purchase_package() RPCs');
  }

  override async update(_ctx: TenantContext, _id: string, _dto: LedgerUpdate): Promise<CreditLedgerEntry> {
    throw new InternalError('CreditLedger is append-only — entries cannot be updated');
  }

  override async softDelete(_ctx: TenantContext, _id: string): Promise<void> {
    throw new InternalError('CreditLedger is append-only — entries cannot be deleted');
  }

  async getWallet(ctx: TenantContext, studentId: string): Promise<StudentWallet> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const { data, error } = await (this.db as AnyClient)
      .from('credit_balance_cache')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId);

    if (error) throw mapDbError(error as Error);

    const rows = (data ?? []) as CreditBalanceCache[];
    const balances: WalletCategoryBalance[] = rows.map(r => ({
      lesson_category:  r.lesson_category,
      balance:          r.balance,
      expires_soonest:  null,
    }));

    return {
      student_id:    studentId,
      balances,
      total_credits: balances.reduce((s, b) => s + b.balance, 0),
    };
  }

  async getBalance(
    ctx: TenantContext,
    studentId: string,
    lessonCategory: LessonCategory
  ): Promise<number> {
    if (ctx.organizationId === null) return 0;

    const { data, error } = await (this.db as AnyClient)
      .from('credit_balance_cache')
      .select('balance')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId)
      .eq('lesson_category', lessonCategory)
      .maybeSingle();

    if (error) throw mapDbError(error as Error);
    return (data as CreditBalanceCache | null)?.balance ?? 0;
  }

  async getLedger(
    ctx: TenantContext,
    query: CreditLedgerListQueryInput
  ): Promise<PagedResult<CreditLedgerEntry>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('credit_ledger')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', query.student_id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.lesson_category !== undefined) q = q.eq('lesson_category', query.lesson_category);
    if (query.entry_type      !== undefined) q = q.eq('entry_type',      query.entry_type);
    if (query.from            !== undefined) q = q.gte('created_at',     query.from);
    if (query.to              !== undefined) q = q.lte('created_at',     query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<CreditLedgerEntry>((data ?? []) as CreditLedgerEntry[], normalized, count ?? 0);
  }

  async consumeViaRpc(
    _ctx: TenantContext,
    orgId: string,
    studentId: string,
    bookingId: string,
    category: LessonCategory,
    quantity = 1
  ): Promise<string> {
    const { data, error } = await this.rpc('consume_credit', {
      p_org_id:     orgId,
      p_student_id: studentId,
      p_booking_id: bookingId,
      p_category:   category,
      p_quantity:   quantity,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async grantBonus(
    ctx: TenantContext,
    actorId: string,
    dto: GrantCreditInput
  ): Promise<void> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    // Bonus grants are inserted directly (service role bypasses RLS)
    const { error } = await (this.db as AnyClient)
      .from('credit_ledger')
      .insert({
        organization_id: ctx.organizationId,
        student_id:      dto.student_id,
        lesson_category: dto.lesson_category,
        entry_type:      'bonus',
        quantity:        dto.quantity,
        currency:        'SEK',
        reference_type:  'admin_adjust',
        description:     dto.description ?? 'Manual bonus credit grant',
        actor_id:        actorId,
        expires_at:      dto.expires_at ?? null,
        metadata:        dto.metadata ?? {},
      });

    if (error) throw mapDbError(error as Error);
  }

  async expireStaleCreditsViaRpc(_ctx: TenantContext, limit = 50): Promise<number> {
    const { data, error } = await this.rpc('expire_stale_credits', { p_limit: limit });
    if (error) throw mapDbError(error as Error);
    return (data as number) ?? 0;
  }
}
