import type { PagedResult } from '@platform/types';
import type { PackageCatalog, PackageOffering, StudentPackage } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { PackageCatalogRepository } from '../repositories/package-catalog.repository.js';
import type { PackageOfferingRepository } from '../repositories/package-offering.repository.js';
import type { StudentPackageRepository } from '../repositories/student-package.repository.js';
import type {
  CreatePackageCatalogInput,
  PackageCatalogUpdate,
  CreatePackageOfferingInput,
  UpdatePackageOfferingInput,
  PackageOfferingListQueryInput,
  PurchasePackageInput,
  StudentPackageListQueryInput,
} from '@platform/types';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError } from '../errors/service-errors.js';

export class PackageService {
  constructor(
    private readonly catalogRepo:    PackageCatalogRepository,
    private readonly offeringRepo:   PackageOfferingRepository,
    private readonly packageRepo:    StudentPackageRepository,
  ) {}

  // ─── Catalog ────────────────────────────────────────────────────────────────

  async listCatalog(ctx: TenantContext): Promise<PackageCatalog[]> {
    assertPermission(ctx, 'finance:package:read');
    return this.catalogRepo.listActive(ctx);
  }

  async createCatalogEntry(ctx: TenantContext, dto: CreatePackageCatalogInput): Promise<PackageCatalog> {
    assertPermission(ctx, 'finance:package:create');
    return this.catalogRepo.insert(ctx, {
      ...dto,
      organization_id: ctx.organizationId,
      created_by:      ctx.actorId ?? null,
    } as Parameters<typeof this.catalogRepo.insert>[1]);
  }

  async updateCatalogEntry(ctx: TenantContext, id: string, dto: PackageCatalogUpdate): Promise<PackageCatalog> {
    assertPermission(ctx, 'finance:package:update');
    return this.catalogRepo.update(ctx, id, { ...dto, updated_by: ctx.actorId ?? null });
  }

  // ─── Offerings ──────────────────────────────────────────────────────────────

  async listOfferings(ctx: TenantContext, query: PackageOfferingListQueryInput): Promise<PagedResult<PackageOffering>> {
    assertPermission(ctx, 'finance:package:read');
    return this.offeringRepo.listOfferings(ctx, query);
  }

  async getOffering(ctx: TenantContext, id: string): Promise<PackageOffering> {
    assertPermission(ctx, 'finance:package:read');
    const offering = await this.offeringRepo.findById(ctx, id);
    if (offering === null) throw new NotFoundError('PackageOffering', id);
    return offering;
  }

  async createOffering(ctx: TenantContext, dto: CreatePackageOfferingInput): Promise<PackageOffering> {
    assertPermission(ctx, 'finance:package:create');
    return this.offeringRepo.insert(ctx, {
      ...dto,
      bundle_credits: dto.bundle_credits ?? [],
      created_by:     ctx.actorId ?? null,
    } as Parameters<typeof this.offeringRepo.insert>[1]);
  }

  async updateOffering(ctx: TenantContext, id: string, dto: UpdatePackageOfferingInput): Promise<PackageOffering> {
    assertPermission(ctx, 'finance:package:update');
    return this.offeringRepo.update(ctx, id, { ...dto, updated_by: ctx.actorId ?? null });
  }

  async archiveOffering(ctx: TenantContext, id: string): Promise<PackageOffering> {
    assertPermission(ctx, 'finance:package:archive');
    if (ctx.actorId === null) throw new Error('Actor context required');
    return this.offeringRepo.archiveOffering(ctx, id, ctx.actorId);
  }

  // ─── Student packages ────────────────────────────────────────────────────────

  async listStudentPackages(
    ctx: TenantContext,
    query: StudentPackageListQueryInput
  ): Promise<PagedResult<StudentPackage>> {
    assertPermission(ctx, 'finance:wallet:read');
    return this.packageRepo.listPackages(ctx, query);
  }

  async getStudentPackage(ctx: TenantContext, id: string): Promise<StudentPackage> {
    assertPermission(ctx, 'finance:wallet:read');
    const pkg = await this.packageRepo.findById(ctx, id);
    if (pkg === null) throw new NotFoundError('StudentPackage', id);
    return pkg;
  }

  async purchasePackage(ctx: TenantContext, dto: PurchasePackageInput): Promise<string> {
    assertPermission(ctx, 'finance:package:read');
    if (ctx.actorId === null) throw new Error('Actor context required');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    return this.packageRepo.purchaseViaRpc(ctx, dto.student_id, dto.offering_id, ctx.actorId);
  }
}
