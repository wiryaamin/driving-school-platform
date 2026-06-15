// ─── Routes ───────────────────────────────────────────────────────────────────
export { SchedulingPage } from './routes/SchedulingPage.js';
export { SchedulingCalendarPage } from './routes/SchedulingCalendarPage.js';
export { MySchedulePage } from './routes/MySchedulePage.js';
export { BookingListPage } from './routes/BookingListPage.js';
export { BokningarPage } from './routes/BokningarPage.js';
export { WaitlistPage } from './routes/WaitlistPage.js';
export { TrafikPlatsPage } from './routes/TrafikPlatsPage.js';

// ─── Slot query hooks + keys ──────────────────────────────────────────────────
export { useSlot, useSlotList, useInstructorUpcomingSlots, slotKeys } from './hooks/useSlots.js';
export type { SlotListResponse, SlotListMeta } from './hooks/useSlots.js';

// ─── Booking query hooks + keys ───────────────────────────────────────────────
export { useBooking, useBookingList, useBookingsForSlot, useStudentUpcomingBookings, useInstructorUpcomingBookings, bookingKeys } from './hooks/useBookings.js';
export type { BookingListResponse, BookingListMeta } from './hooks/useBookings.js';

// ─── Waitlist query hooks + keys ──────────────────────────────────────────────
export { useWaitlistForSlot, useWaitlistList, waitlistKeys } from './hooks/useWaitlist.js';
export type {
  WaitlistEntry, WaitlistStatus, WaitlistTab,
  WaitlistEntryRich, WaitlistListParams, WaitlistListResponse,
} from './hooks/useWaitlist.js';

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
export { StudentBookingDialog } from './components/StudentBookingDialog.js';
export type { SlotDropInfo } from './components/SchedulingCalendar.js';
