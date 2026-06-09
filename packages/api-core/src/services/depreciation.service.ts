import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { FixedAssetRepository } from '../repositories/fixed-asset.repository.js';
import { DepreciationScheduleRepository } from '../repositories/depreciation.repository.js';
import { NotFoundError, ValidationError } from '../errors/service-errors.js';

export class DepreciationService {
  private assetRepo:    FixedAssetRepository;
  private scheduleRepo: DepreciationScheduleRepository;

  constructor(db: SupabaseClient<Database>) {
    this.assetRepo    = new FixedAssetRepository(db);
    this.scheduleRepo = new DepreciationScheduleRepository(db);
  }

  async generateSchedule(ctx: TenantContext, assetId: string) {
    const asset = await this.assetRepo.findById(ctx, assetId);
    if (!asset) throw new NotFoundError('FixedAsset', assetId);
    if (asset.status === 'disposed') {
      throw new ValidationError(`Cannot generate schedule for disposed asset ${assetId}`);
    }
    const count = await this.scheduleRepo.generateSchedule(ctx, assetId);
    return { assetId, linesGenerated: count };
  }

  async getSchedule(ctx: TenantContext, assetId: string) {
    const asset = await this.assetRepo.findById(ctx, assetId);
    if (!asset) throw new NotFoundError('FixedAsset', assetId);
    const lines = await this.scheduleRepo.findByAsset(ctx, assetId);
    return { asset, lines };
  }

  async postPeriod(ctx: TenantContext, assetId: string, periodId: string) {
    const asset = await this.assetRepo.findById(ctx, assetId);
    if (!asset) throw new NotFoundError('FixedAsset', assetId);
    if (asset.status !== 'active' && asset.status !== 'impaired') {
      throw new ValidationError(
        `Asset ${assetId} has status '${asset.status}' — only active or impaired assets can be depreciated`
      );
    }
    const journalEntryId = await this.scheduleRepo.postPeriod(ctx, assetId, periodId);
    const updated = await this.assetRepo.findById(ctx, assetId);
    return { journalEntryId, asset: updated };
  }

  async postImpairment(
    ctx: TenantContext,
    params: {
      assetId:          string;
      periodId:         string;
      impairmentDate:   string;
      impairmentAmount: number;
      reason?:          string | null;
    }
  ) {
    const asset = await this.assetRepo.findById(ctx, params.assetId);
    if (!asset) throw new NotFoundError('FixedAsset', params.assetId);
    if (asset.status !== 'active' && asset.status !== 'impaired') {
      throw new ValidationError(
        `Asset ${params.assetId} must be active or impaired for an impairment adjustment`
      );
    }
    if (params.impairmentAmount <= 0) {
      throw new ValidationError('impairmentAmount must be positive');
    }
    const depreciableNbv = asset.net_book_value - asset.residual_value;
    if (params.impairmentAmount > depreciableNbv) {
      throw new ValidationError(
        `impairmentAmount (${params.impairmentAmount}) exceeds depreciable NBV (${depreciableNbv})`
      );
    }
    const journalEntryId = await this.scheduleRepo.postImpairment(ctx, params);
    const updated = await this.assetRepo.findById(ctx, params.assetId);
    return { journalEntryId, asset: updated };
  }
}
