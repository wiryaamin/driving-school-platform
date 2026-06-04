import {
  ApiErrorCode,
  type ServiceResult,
  type PagedResult,
  type Instructor,
  type InstructorInsert,
  type CreateInstructorInput,
  type UpdateInstructorInput,
  type InstructorListQueryInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { requireOrgContext } from '../context/tenant-context.js';
import { assertPermission, requireActor } from '../middleware/rbac.middleware.js';
import { ok, fail, fromError } from '../utils/result.js';
import { OutboxPublisher } from '../events/outbox.publisher.js';
import { InstructorRepository } from '../repositories/instructor.repository.js';

export class InstructorService {
  constructor(
    private readonly repo: InstructorRepository,
    private readonly outbox: OutboxPublisher,
  ) {}

  async createInstructor(
    ctx: TenantContext,
    input: CreateInstructorInput
  ): Promise<ServiceResult<Instructor>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'instructors:instructor:create');

      const dupEmail = await this.repo.findByEmail(ctx, input.email);
      if (dupEmail !== null) {
        return fail(ApiErrorCode.CONFLICT, `An instructor with email ${input.email} already exists in this organisation`);
      }

      if (input.personnummer_hash !== undefined && input.personnummer_hash !== null) {
        const dupPnr = await this.repo.findByPersonnummerHash(ctx, input.personnummer_hash);
        if (dupPnr !== null) {
          return fail(ApiErrorCode.DUPLICATE_PERSONAL_NUMBER, 'An instructor with this personnummer is already registered in this organisation');
        }
      }

      const insertDto: InstructorInsert = {
        ...input,
        created_by: ctx.actorId,
        updated_by: ctx.actorId,
      };

      const instructor = await this.repo.insert(ctx, insertDto);

      await this.outbox.publish(ctx, {
        eventType: 'Instructor.Created',
        channel:   'internal',
        payload:   { instructor_id: instructor.id, employment_type: instructor.employment_type },
        targetId:  instructor.id,
      });

      return ok(instructor as Instructor);
    } catch (err) {
      return fromError(err);
    }
  }

  async updateInstructor(
    ctx: TenantContext,
    id: string,
    input: UpdateInstructorInput
  ): Promise<ServiceResult<Instructor>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'instructors:instructor:update');

      if (input.email !== undefined) {
        const dup = await this.repo.findByEmail(ctx, input.email);
        if (dup !== null && dup.id !== id) {
          return fail(ApiErrorCode.CONFLICT, `An instructor with email ${input.email} already exists in this organisation`);
        }
      }

      if (input.personnummer_hash !== undefined && input.personnummer_hash !== null) {
        const dup = await this.repo.findByPersonnummerHash(ctx, input.personnummer_hash);
        if (dup !== null && dup.id !== id) {
          return fail(ApiErrorCode.DUPLICATE_PERSONAL_NUMBER, 'An instructor with this personnummer is already registered in this organisation');
        }
      }

      const instructor = await this.repo.update(ctx, id, {
        ...input,
        updated_by: ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Instructor.Updated',
        channel:   'internal',
        payload:   { instructor_id: instructor.id, employment_type: instructor.employment_type },
        targetId:  instructor.id,
      });

      return ok(instructor as Instructor);
    } catch (err) {
      return fromError(err);
    }
  }

  async getInstructor(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<Instructor>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'instructors:instructor:read');

      const instructor = await this.repo.findByIdOrThrow(ctx, id);
      return ok(instructor as Instructor);
    } catch (err) {
      return fromError(err);
    }
  }

  async listInstructors(
    ctx: TenantContext,
    query: InstructorListQueryInput
  ): Promise<ServiceResult<PagedResult<Instructor>>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'instructors:instructor:read');

      const filters: Record<string, string | number | boolean | null> = {};
      if (query.employment_type !== undefined) filters['employment_type']     = query.employment_type;
      if (query.location_id     !== undefined) filters['primary_location_id'] = query.location_id;

      const result = await this.repo.list(ctx, {
        sort_by:       query.sort_by  ?? 'last_name',
        sort_dir:      query.sort_dir ?? 'asc',
        searchColumns: ['first_name', 'last_name', 'email'],
        filters,
        ...(query.page     !== undefined && { page:     query.page }),
        ...(query.per_page !== undefined && { per_page: query.per_page }),
        ...(query.search   !== undefined && { search:   query.search }),
      });

      return ok(result as PagedResult<Instructor>);
    } catch (err) {
      return fromError(err);
    }
  }

  async archiveInstructor(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'instructors:instructor:delete');

      await this.repo.findByIdOrThrow(ctx, id);
      await this.repo.softDelete(ctx, id);

      await this.outbox.publish(ctx, {
        eventType: 'Instructor.Archived',
        channel:   'internal',
        payload:   { instructor_id: id, archived_by: ctx.actorId },
        targetId:  id,
      });

      return ok(undefined);
    } catch (err) {
      return fromError(err);
    }
  }
}
