import type { PagedResult } from '@platform/types';
import type { Invoice, InvoiceLineItem } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { InvoiceRepository } from '../repositories/invoice.repository.js';
import type {
  CreateInvoiceDraftInput,
  AddInvoiceLineItemInput,
  IssueInvoiceInput,
  VoidInvoiceInput,
  InvoiceListQueryInput,
} from '@platform/types';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError, ConflictError } from '../errors/service-errors.js';

export class InvoiceService {
  constructor(private readonly invoiceRepo: InvoiceRepository) {}

  async listInvoices(ctx: TenantContext, query: InvoiceListQueryInput): Promise<PagedResult<Invoice>> {
    assertPermission(ctx, 'finance:invoice:read');
    return this.invoiceRepo.listInvoices(ctx, query);
  }

  async getInvoice(ctx: TenantContext, invoiceId: string): Promise<Invoice> {
    assertPermission(ctx, 'finance:invoice:read');
    const invoice = await this.invoiceRepo.findById(ctx, invoiceId);
    if (invoice === null) throw new NotFoundError('Invoice', invoiceId);
    return invoice;
  }

  async getInvoiceWithLines(
    ctx: TenantContext,
    invoiceId: string
  ): Promise<{ invoice: Invoice; line_items: InvoiceLineItem[] }> {
    assertPermission(ctx, 'finance:invoice:read');
    const invoice = await this.invoiceRepo.findByIdOrThrow(ctx, invoiceId);
    const line_items = await this.invoiceRepo.listLineItems(ctx, invoiceId);
    return { invoice, line_items };
  }

  async createDraft(ctx: TenantContext, dto: CreateInvoiceDraftInput): Promise<Invoice> {
    assertPermission(ctx, 'finance:invoice:create');
    return this.invoiceRepo.insert(ctx, {
      student_id:         dto.student_id,
      student_package_id: dto.student_package_id ?? null,
      currency:           dto.currency ?? 'SEK',
      due_date:           dto.due_date ?? null,
      notes:              dto.notes ?? null,
      metadata:           dto.metadata ?? {},
      created_by:         ctx.actorId ?? null,
    });
  }

  async addLineItem(ctx: TenantContext, dto: AddInvoiceLineItemInput): Promise<InvoiceLineItem> {
    assertPermission(ctx, 'finance:invoice:create');

    const invoice = await this.invoiceRepo.findByIdOrThrow(ctx, dto.invoice_id);
    if (invoice.status !== 'draft') {
      throw new ConflictError(`Cannot add line items to a ${invoice.status} invoice`);
    }

    return this.invoiceRepo.addLineItem(ctx, {
      invoice_id:         dto.invoice_id,
      student_package_id: dto.student_package_id ?? null,
      line_type:          dto.line_type ?? 'package',
      description:        dto.description,
      quantity:           dto.quantity ?? 1,
      unit_price:         dto.unit_price,
      vat_rate:           dto.vat_rate ?? 0.25,
      vat_amount:         (dto.quantity ?? 1) * dto.unit_price * (dto.vat_rate ?? 0.25),
      line_total:         (dto.quantity ?? 1) * dto.unit_price,
      sort_order:         dto.sort_order ?? 0,
      metadata:           {},
    });
  }

  async issueInvoice(ctx: TenantContext, dto: IssueInvoiceInput): Promise<string> {
    assertPermission(ctx, 'finance:invoice:approve');
    if (ctx.actorId === null) throw new Error('Actor context required');

    // Validate invoice exists and belongs to org before calling RPC
    await this.invoiceRepo.findByIdOrThrow(ctx, dto.invoice_id);
    return this.invoiceRepo.issueViaRpc(ctx, dto.invoice_id);
  }

  async voidInvoice(ctx: TenantContext, dto: VoidInvoiceInput): Promise<string> {
    assertPermission(ctx, 'finance:invoice:void');
    if (ctx.actorId === null) throw new Error('Actor context required');

    await this.invoiceRepo.findByIdOrThrow(ctx, dto.invoice_id);
    return this.invoiceRepo.voidViaRpc(ctx, dto.invoice_id, dto.reason);
  }
}
