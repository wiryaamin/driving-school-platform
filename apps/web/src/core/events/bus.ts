import type { DomainEventType } from '@platform/types';
import { logger } from '@platform/utils';

type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/**
 * In-process event bus for client-side domain event coordination.
 * This decouples modules — e.g., when a lesson is booked, the scheduling
 * module emits an event and the notification module reacts, without
 * scheduling importing anything from notifications.
 */
class EventBus {
  private readonly handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * Subscribe to a domain event.
   * Returns an unsubscribe function — call it in useEffect cleanup.
   *
   * @example
   * useEffect(() => {
   *   return eventBus.on('Scheduling.Lesson.Booked', (payload) => {
   *     queryClient.invalidateQueries({ queryKey: schedulingKeys.all });
   *   });
   * }, []);
   */
  on<T>(event: DomainEventType | string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.off(event, handler as EventHandler);
  }

  /**
   * Emit a domain event — triggers all registered handlers.
   */
  emit<T>(event: DomainEventType | string, payload: T): void {
    const handlers = this.handlers.get(event);
    if (!handlers?.size) return;

    handlers.forEach((handler) => {
      try {
        void handler(payload);
      } catch (err) {
        logger.error(`Event bus handler error for "${event}"`, err);
      }
    });
  }

  /**
   * Unsubscribe a specific handler or all handlers for an event.
   */
  off(event: string, handler?: EventHandler): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }
}

export const eventBus = new EventBus();
