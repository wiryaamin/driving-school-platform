import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import {
  FixedAssetClassRepository,
  FixedAssetRepository,
  AssetDisposalRepository,
} from '../repositories/fixed-asset.repository.js';
import { NotFoundError, ValidationError } from '../errors/service-errors.js';

export class FixedAssetService {
  private classRepo:    FixedAssetClassRepository;
  private assetRepo:    FixedAssetRepository;
  private disposalRepo: AssetDisposalRepository;

  constructor(db: SupabaseClient<Database>) {
    this.classRepo    = new FixedAssetClassRepository(db);
    this.assetRepo    = new FixedAssetRepository(db);
    this.disposalRepo = new AssetDisposalRepository(db);
  }

  async listClasses(ctx: TenantContext) {
    return this.classRepo.findActive(ctx);
  }

  async getClass(ctx: TenantContext, id: string) {
    const cls = await this.classRepo.findById(ctx, id);
    if (!cls) throw new NotFoundError('FixedAssetClass', id);
    return cls;
  }

  async registerAsset(
    ctx: TenantContext,
    params: {
      periodId:          string;
      assetClassId:      string;
      assetCode:         string;
      assetName:         string;
      acquisitionDate:   string;
      acquisitionCost:   number;
      residualValue?:    number;
      usefulLifeMonths?: number;
      depreciationMethod?: string;
      creditAccount?:    string;
      description?:      string | null;
      notes?:            string | null;
    }
  ) {
    if (params.acquisitionCost <= 0) {
      throw new ValidationError('acquisitionCost must be positive');
    }
    const assetId = await this.assetRepo.register(ctx, params);
    const asset = await this.assetRepo.findById(ctx, assetId);
    if (!asset) throw new NotFoundError('FixedAsset', assetId);
    return asset;
  }

  async getAsset(ctx: TenantContext, id: string) {
    const asset = await this.assetRepo.findById(ctx, id);
    if (!asset) throw new NotFoundError('FixedAsset', id);
    return asset;
  }

  async listAssets(
    ctx: TenantContext,
    params: { status?: string; assetClassId?: string; limit?: number; offset?: number }
  ) {
    if (params.status)       return this.assetRepo.findByStatus(ctx, params.status);
    if (params.assetClassId) return this.assetRepo.findByClass(ctx, params.assetClassId);
    return this.assetRepo.findAll(ctx, params.limit, params.offset);
  }

  async disposeAsset(
    ctx: TenantContext,
    params: {
      assetId:      string;
      periodId:     string;
      disposalType: string;
      disposalDate: string;
      proceeds?:    number;
      notes?:       string | null;
    }
  ) {
    const asset = await this.assetRepo.findById(ctx, params.assetId);
    if (!asset) throw new NotFoundError('FixedAsset', params.assetId);
    if (asset.status === 'disposed') {
      throw new ValidationError(`Asset ${params.assetId} is already disposed`);
    }
    if (asset.status === 'draft') {
      throw new ValidationError(`Cannot dispose a draft asset`);
    }
    const disposalId = await this.disposalRepo.postDisposal(ctx, params);
    const disposal = await this.disposalRepo.findById(ctx, disposalId);
    if (!disposal) throw new NotFoundError('AssetDisposal', disposalId);
    return disposal;
  }

  async getDisposal(ctx: TenantContext, id: string) {
    const disposal = await this.disposalRepo.findById(ctx, id);
    if (!disposal) throw new NotFoundError('AssetDisposal', id);
    return disposal;
  }

  async listDisposals(ctx: TenantContext, params: { limit?: number; offset?: number }) {
    return this.disposalRepo.findByOrg(ctx, params.limit, params.offset);
  }
}
