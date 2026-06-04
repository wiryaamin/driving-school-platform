import {
  ApiErrorCode,
  type ServiceResult,
  type PagedResult,
  type Student,
  type StudentInsert,
  type CreateStudentInput,
  type UpdateStudentInput,
  type StudentListQueryInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { requireOrgContext } from '../context/tenant-context.js';
import { assertPermission, requireActor } from '../middleware/rbac.middleware.js';
import { ok, fail, fromError } from '../utils/result.js';
import { OutboxPublisher } from '../events/outbox.publisher.js';
import { StudentRepository } from '../repositories/student.repository.js';

export class StudentService {
  constructor(
    private readonly repo: StudentRepository,
    private readonly outbox: OutboxPublisher,
  ) {}

  async createStudent(
    ctx: TenantContext,
    input: CreateStudentInput
  ): Promise<ServiceResult<Student>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'students:student:create');

      if (input.email !== undefined && input.email !== null) {
        const dup = await this.repo.findByEmail(ctx, input.email);
        if (dup !== null) {
          return fail(ApiErrorCode.CONFLICT, `A student with email ${input.email} already exists in this organisation`);
        }
      }

      if (input.personnummer_hash !== undefined && input.personnummer_hash !== null) {
        const dup = await this.repo.findByPersonnummerHash(ctx, input.personnummer_hash);
        if (dup !== null) {
          return fail(ApiErrorCode.DUPLICATE_PERSONAL_NUMBER, 'A student with this personnummer is already registered in this organisation');
        }
      }

      const insertDto: StudentInsert = {
        ...input,
        created_by: ctx.actorId,
        updated_by: ctx.actorId,
      };

      const student = await this.repo.insert(ctx, insertDto);

      await this.outbox.publish(ctx, {
        eventType: 'Student.Created',
        channel:   'internal',
        payload:   { student_id: student.id, status: student.status },
        targetId:  student.id,
      });

      return ok(student as Student);
    } catch (err) {
      return fromError(err);
    }
  }

  async updateStudent(
    ctx: TenantContext,
    id: string,
    input: UpdateStudentInput
  ): Promise<ServiceResult<Student>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'students:student:update');

      if (input.email !== undefined && input.email !== null) {
        const dup = await this.repo.findByEmail(ctx, input.email);
        if (dup !== null && dup.id !== id) {
          return fail(ApiErrorCode.CONFLICT, `A student with email ${input.email} already exists in this organisation`);
        }
      }

      if (input.personnummer_hash !== undefined && input.personnummer_hash !== null) {
        const dup = await this.repo.findByPersonnummerHash(ctx, input.personnummer_hash);
        if (dup !== null && dup.id !== id) {
          return fail(ApiErrorCode.DUPLICATE_PERSONAL_NUMBER, 'A student with this personnummer is already registered in this organisation');
        }
      }

      const student = await this.repo.update(ctx, id, {
        ...input,
        updated_by: ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Student.Updated',
        channel:   'internal',
        payload:   { student_id: student.id, status: student.status },
        targetId:  student.id,
      });

      return ok(student as Student);
    } catch (err) {
      return fromError(err);
    }
  }

  async getStudent(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<Student>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'students:student:read');

      const student = await this.repo.findByIdOrThrow(ctx, id);
      return ok(student as Student);
    } catch (err) {
      return fromError(err);
    }
  }

  async listStudents(
    ctx: TenantContext,
    query: StudentListQueryInput
  ): Promise<ServiceResult<PagedResult<Student>>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'students:student:read');

      const filters: Record<string, string | number | boolean | null> = {};
      if (query.status !== undefined)           filters['status']                   = query.status;
      if (query.instructor_id !== undefined)    filters['assigned_instructor_id']   = query.instructor_id;
      if (query.permit_stage !== undefined)     filters['permit_stage']             = query.permit_stage;
      if (query.licence_category !== undefined) filters['target_licence_category']  = query.licence_category;

      const result = await this.repo.list(ctx, {
        sort_by:       query.sort_by ?? 'created_at',
        sort_dir:      query.sort_dir ?? 'desc',
        searchColumns: ['first_name', 'last_name', 'email'],
        filters,
        ...(query.page     !== undefined && { page:     query.page }),
        ...(query.per_page !== undefined && { per_page: query.per_page }),
        ...(query.search   !== undefined && { search:   query.search }),
      });

      return ok(result as PagedResult<Student>);
    } catch (err) {
      return fromError(err);
    }
  }

  async archiveStudent(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'students:student:delete');

      // Confirm the record exists and is in scope before soft-deleting
      await this.repo.findByIdOrThrow(ctx, id);
      await this.repo.softDelete(ctx, id);

      await this.outbox.publish(ctx, {
        eventType: 'Student.Archived',
        channel:   'internal',
        payload:   { student_id: id, archived_by: ctx.actorId },
        targetId:  id,
      });

      return ok(undefined);
    } catch (err) {
      return fromError(err);
    }
  }
}
