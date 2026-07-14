// ─── Routes ───────────────────────────────────────────────────────────────────
export { SchedulingPage } from './routes/SchedulingPage.js';
export { SchedulingCalendarPage } from './routes/SchedulingCalendarPage.js';
export { MySchedulePage } from './routes/MySchedulePage.js';
export { BookingListPage } from './routes/BookingListPage.js';
export { BokningarPage } from './routes/BokningarPage.js';
export { WaitlistPage } from './routes/WaitlistPage.js';
export { TrafikPlatsPage } from './routes/TrafikPlatsPage.js';
export { SchedulingGenerationPage } from './routes/SchedulingGenerationPage.js';
export { SlotTemplatesPage } from './routes/SlotTemplatesPage.js';
export { SchedulingStatistikPage } from './routes/SchedulingStatistikPage.js';
export { KursoverSiktPage } from './routes/KursoverSiktPage.js';
export { InstructorIcalPage } from './routes/InstructorIcalPage.js';
export { useSlotTemplates, useCreateSlotTemplate, useToggleSlotTemplate, useDeleteSlotTemplate, useGenerateSlotsFromTemplates, templateKeys } from './hooks/useSlotTemplates.js';
export type { SlotTemplate, CreateSlotTemplateInput } from './hooks/useSlotTemplates.js';

// ─── Slot query hooks + keys ──────────────────────────────────────────────────
export { useSlot, useSlotList, useInstructorUpcomingSlots, slotKeys } from './hooks/useSlots.js';
export type { SlotListResponse, SlotListMeta } from './hooks/useSlots.js';

// ─── Booking query hooks + keys ───────────────────────────────────────────────
export { useBooking, useBookingList, useBookingsForSlot, useStudentUpcomingBookings, useInstructorUpcomingBookings, bookingKeys } from './hooks/useBookings.js';
export type { LessonBooking, BookingListResponse, BookingListMeta } from './hooks/useBookings.js';

// ─── Waitlist query hooks + keys ──────────────────────────────────────────────
export { useWaitlistForSlot, useWaitlistList, usePromoteFromWaitlist, useMarkWaitlistNotified, useRemoveFromWaitlist, waitlistKeys } from './hooks/useWaitlist.js';
export type {
  WaitlistEntry, WaitlistStatus, WaitlistTab,
  WaitlistEntryRich, WaitlistStudentRef, WaitlistListParams, WaitlistListResponse,
  PromoteFromWaitlistInput,
} from './hooks/useWaitlist.js';

// ─── Scheduling mutation hooks ────────────────────────────────────────────────
export {
  useCreateBooking,
  useCancelBooking,
  useUpdateBookingStatus,
  useRescheduleBooking,
  useUpdateSlotTiming,
  useUpdateSlotVehicle,
  useUpdateSlotNotes,
  useReassignInstructorSlots,
} from './hooks/useSchedulingMutations.js';
export type {
  CreateBookingInput,
  CancelBookingInput,
  UpdateBookingStatusInput,
  RescheduleBookingInput,
  UpdateSlotTimingInput,
  UpdateSlotVehicleInput,
  UpdateSlotNotesInput,
  ReassignSlotsInput,
  ReassignSlotsResult,
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
export { CancelBookingDialog } from './components/CancelBookingDialog.js';
export { RescheduleBookingDialog } from './components/RescheduleBookingDialog.js';
export { GroupEnrollmentSheet } from './components/GroupEnrollmentSheet.js';
export type { SlotDropInfo } from './components/SchedulingCalendar.js';
