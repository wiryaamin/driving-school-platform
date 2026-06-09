// ─── Routes ───────────────────────────────────────────────────────────────────
export { SchedulingPage } from './routes/SchedulingPage.js';
export { SchedulingCalendarPage } from './routes/SchedulingCalendarPage.js';

// ─── Slot query hooks + keys ──────────────────────────────────────────────────
export { useSlot, useSlotList, slotKeys } from './hooks/useSlots.js';
export type { SlotListResponse, SlotListMeta } from './hooks/useSlots.js';

// ─── Booking query hooks + keys ───────────────────────────────────────────────
export { useBooking, useBookingList, useBookingsForSlot, bookingKeys } from './hooks/useBookings.js';
export type { BookingListResponse, BookingListMeta } from './hooks/useBookings.js';

// ─── Waitlist query hooks + keys ──────────────────────────────────────────────
export { useWaitlistForSlot, waitlistKeys } from './hooks/useWaitlist.js';
export type { WaitlistEntry, WaitlistStatus } from './hooks/useWaitlist.js';

// ─── Scheduling mutation hooks ────────────────────────────────────────────────
export {
  useCreateBooking,
  useCancelBooking,
  useUpdateBookingStatus,
  useRescheduleBooking,
  useUpdateSlotTiming,
} from './hooks/useSchedulingMutations.js';
export type {
  CreateBookingInput,
  CancelBookingInput,
  UpdateBookingStatusInput,
  RescheduleBookingInput,
  UpdateSlotTimingInput,
} from './hooks/useSchedulingMutations.js';

// ─── Calendar utilities ───────────────────────────────────────────────────────
export {
  slotToCalendarEvent,
  formatSlotDate,
  formatSlotTime,
  slotDurationMinutes,
  isSlotFull,
  formatCapacity,
  getSlotStatusConfig,
  SLOT_STATUS_CONFIG,
} from './lib/calendarUtils.js';
export type { SlotStatusConfig } from './lib/calendarUtils.js';

// ─── Components ───────────────────────────────────────────────────────────────
export { SlotStatusBadge, slotStatusLabel, SLOT_STATUS_OPTIONS } from './components/SlotStatusBadge.js';
export {
  BookingStatusBadge,
  bookingStatusLabel,
  isTerminalBookingStatus,
  BOOKING_STATUS_CONFIG,
} from './components/BookingStatusBadge.js';
export type { SlotDropInfo } from './components/SchedulingCalendar.js';
