import {
  ApiErrorCode,
  type ServiceResult,
  type PagedResult,
  type Notification,
  type NotificationPreference,
  type CreateNotificationInput,
  type NotificationInsert,
  type NotificationListQueryInput,
  type UpsertPreferenceInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { requireOrgContext } from '../context/tenant-context.js';
import { assertPermission, requireActor } from '../middleware/rbac.middleware.js';
import { ok, fail, fromError } from '../utils/result.js';
import { OutboxPublisher } from '../events/outbox.publisher.js';
import { NotificationRepository } from '../repositories/notification.repository.js';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository.js';

export class NotificationService {
  constructor(
    private readonly notifRepo: NotificationRepository,
    private readonly prefRepo: NotificationPreferenceRepository,
    private readonly outbox: OutboxPublisher,
  ) {}

  async createNotification(
    ctx: TenantContext,
    input: CreateNotificationInput,
  ): Promise<ServiceResult<Notification>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'notifications:write');

      // Deduplication: if an idempotency_key is provided and a record already
      // exists, return the existing record rather than inserting a duplicate.
      if (input.idempotency_key !== undefined && input.idempotency_key !== null) {
        const existing = await this.notifRepo.findByIdempotencyKey(ctx, input.idempotency_key);
        if (existing !== null) return ok(existing);
      }

      const insertDto: NotificationInsert = {
        ...input,
        status: 'pending',
      };

      const notification = await this.notifRepo.insert(ctx, insertDto);

      await this.outbox.publish(ctx, {
        eventType: 'Notification.Delivered',
        channel:   'internal',
        payload: {
          notification_id: notification.id,
          recipient_id:    notification.recipient_id,
          template_key:    notification.template_key,
          channel:         notification.channel,
        },
        targetId: notification.id,
      });

      return ok(notification);
    } catch (err) {
      return fromError(err);
    }
  }

  async listNotifications(
    ctx: TenantContext,
    query: NotificationListQueryInput,
  ): Promise<ServiceResult<PagedResult<Notification>>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'notifications:read');

      const result = await this.notifRepo.listNotifications(ctx, query);
      return ok(result);
    } catch (err) {
      return fromError(err);
    }
  }

  async getNotification(
    ctx: TenantContext,
    id: string,
  ): Promise<ServiceResult<Notification>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'notifications:read');

      const notification = await this.notifRepo.findByIdOrThrow(ctx, id);
      return ok(notification);
    } catch (err) {
      return fromError(err);
    }
  }

  async getPreferences(
    ctx: TenantContext,
    profileId: string,
  ): Promise<ServiceResult<NotificationPreference[]>> {
    try {
      requireOrgContext(ctx);

      const prefs = await this.prefRepo.findByProfile(ctx, profileId);
      return ok(prefs);
    } catch (err) {
      return fromError(err);
    }
  }

  async upsertPreference(
    ctx: TenantContext,
    input: UpsertPreferenceInput,
  ): Promise<ServiceResult<NotificationPreference>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);

      const actorId = ctx.actorId;
      // Allow updating own preferences or if the actor has admin permission
      const isSelf = actorId === input.profile_id;
      if (!isSelf) {
        assertPermission(ctx, 'notifications:preferences:manage');
      }

      const pref = await this.prefRepo.upsert(
        ctx,
        input.profile_id,
        input.channel,
        input.notification_type,
        input.enabled,
      );
      return ok(pref);
    } catch (err) {
      return fromError(err);
    }
  }

  async cancelNotification(
    ctx: TenantContext,
    id: string,
  ): Promise<ServiceResult<Notification>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'notifications:write');

      const existing = await this.notifRepo.findByIdOrThrow(ctx, id);

      if (!['pending', 'failed'].includes(existing.status)) {
        return fail(
          ApiErrorCode.CONFLICT,
          `Cannot cancel a notification in '${existing.status}' status`
        );
      }

      const updated = await this.notifRepo.update(ctx, id, {
        status:            'cancelled',
        status_changed_at: new Date().toISOString(),
      });
      return ok(updated);
    } catch (err) {
      return fromError(err);
    }
  }
}
