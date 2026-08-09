import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonBooking, LessonSlot, CancellationCategory, BookingStatus } from '@platform/types';
import { slotKeys } from './useSlots.js';
import { bookingKeys } from './useBookings.js';
import { waitlistKeys } from './useWaitlist.js';
import { extractFunctionErrorMessage } from '@modules/platform/lib/provisioningSchema.js';

// ─── Create slot types ────────────────────────────────────────────────────────

export interface CreateSlotInput {
  instructor_id:   string;
  lesson_type_id:  string;
  starts_at:       string;
  ends_at:         string;
  max_bookings?:   number;
  vehicle_id?:     string | null;
  notes?:          string | null;
}

export interface CreateSlotsBatchResult {
  succeeded: number;
  failed:    number;
  errors:    string[];
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  slot_id:    string;
  student_id: string;
  price_sek?: number | null;
  // Required only when the slot itself has no lesson_type_id (a generic
  // availability slot) — the backend rejects with LESSON_TYPE_REQUIRED otherwise.
  lesson_type_id?: string;
  // Defaults to 'confirmed' (an instant, final staff booking). Pass 'reserved'
  // for a temporary hold — the backend auto-expires unconfirmed reservations
  // after ~30 min via expire_stale_reservations().
  status?:    Extract<BookingStatus, 'confirmed' | 'reserved'>;
}

export interface CancelBookingInput {
  id:                      string;
  slot_id:                 string;
  cancellation_reason?:    string | null;
  cancellation_category?:  CancellationCategory | null;
}

// credit_reversal_failed is only ever present (and true) when the booking had
// consumed a package credit and the automatic reversal on cancel failed —
// the cancellation itself still succeeded, so callers should warn, not block.
export type CancelBookingResult = LessonBooking & { credit_reversal_failed?: boolean };

export interface UpdateBookingStatusInput {
  id:      string;
  slot_id: string;
  status:  BookingStatus;
}

export interface RescheduleBookingInput {
  id:          string;
  slot_id:     string;   // original slot — required for correct cache invalidation
  new_slot_id: string;
}

export interface UpdateSlotTimingInput {
  id:        string;
  starts_at: string;
  ends_at:   string;
}

export interface UpdateSlotVehicleInput {
  id:         string;
  vehicle_id: string | null;
}

export interface UpdateSlotInstructorInput {
  id:            string;
  instructor_id: string;
}

export interface UpdateSlotNotesInput {
  id:    string;
  notes: string | null;
}

export interface UpdateSlotCapacityInput {
  id:           string;
  max_bookings: number;
}

export interface UpdateSlotStatusInput {
  id:     string;
  status: 'open' | 'blocked';
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiCreateSlot(input: CreateSlotInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>('slots', {
    method: 'POST',
    body:   input,
  });
  // supabase-js's raw error.message on a non-2xx response is a generic
  // "Edge Function returned a non-2xx status code" — it never surfaces the
  // specific reason (e.g. "Instructor is not available during this time
  // window") that slots/index.ts already computes and returns in the body.
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skapa pass'));
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

// ─── Original API helpers ─────────────────────────────────────────────────────

async function apiCreateBooking(input: CreateBookingInput): Promise<LessonBooking> {
  const body: Record<string, unknown> = {
    slot_id:    input.slot_id,
    student_id: input.student_id,
    // Staff booking directly from the calendar has no pending checkout step —
    // unlike the backend's 'reserved' default (a temporary hold, auto-cancelled
    // by expire_stale_reservations() after ~30 min), this booking is final the
    // moment staff creates it, so it must skip the hold state entirely.
    // Callers may explicitly pass 'reserved' for a deliberate temporary hold.
    status:     input.status ?? 'confirmed',
  };
  if (input.price_sek !== undefined) body['price_sek'] = input.price_sek;
  if (input.lesson_type_id !== undefined) body['lesson_type_id'] = input.lesson_type_id;

  const { data, error } = await supabase.functions.invoke<{ data: LessonBooking }>('bookings', {
    method: 'POST',
    body,
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skapa bokning'));
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiCancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
  const body: Record<string, unknown> = {};
  if (input.cancellation_reason   !== undefined) body['cancellation_reason']   = input.cancellation_reason;
  if (input.cancellation_category !== undefined) body['cancellation_category'] = input.cancellation_category;

  const { data, error } = await supabase.functions.invoke<{ data: CancelBookingResult }>(`bookings/${input.id}/cancel`, {
    method: 'PATCH',
    body,
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateBookingStatus(input: UpdateBookingStatusInput): Promise<LessonBooking> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonBooking }>(`bookings/${input.id}`, {
    method: 'PATCH',
    body: { status: input.status },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiRescheduleBooking(input: RescheduleBookingInput): Promise<LessonBooking> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonBooking }>(`bookings/${input.id}/reschedule`, {
    method: 'PATCH',
    body: { new_slot_id: input.new_slot_id },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateSlotTiming(input: UpdateSlotTimingInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${input.id}`, {
    method: 'PATCH',
    body: { starts_at: input.starts_at, ends_at: input.ends_at },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateSlotNotes(input: UpdateSlotNotesInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${input.id}`, {
    method: 'PATCH',
    body: { notes: input.notes },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateSlotVehicle(input: UpdateSlotVehicleInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${input.id}`, {
    method: 'PATCH',
    body: { vehicle_id: input.vehicle_id },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateSlotInstructor(input: UpdateSlotInstructorInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${input.id}`, {
    method: 'PATCH',
    body: { instructor_id: input.instructor_id },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateSlotCapacity(input: UpdateSlotCapacityInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${input.id}`, {
    method: 'PATCH',
    body: { max_bookings: input.max_bookings },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte uppdatera antal platser'));
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateSlotStatus(input: UpdateSlotStatusInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${input.id}`, {
    method: 'PATCH',
    body: { status: input.status },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte uppdatera passets status'));
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiDeleteSlot(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke(`slots/${id}`, { method: 'DELETE' });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte ta bort passet'));
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiCreateBooking,
    onSuccess: (_data, { slot_id }) => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(slot_id) });
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiCancelBooking,
    onSuccess: (_data, { id, slot_id }) => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(slot_id) });
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateBookingStatus,
    onSuccess: (_data, { id, slot_id }) => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(slot_id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRescheduleBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiRescheduleBooking,
    onSuccess: (_data, { id, slot_id, new_slot_id }) => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(new_slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(new_slot_id) });
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateSlotTiming() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateSlotTiming,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateSlotNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateSlotNotes,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
    },
  });
}

export function useUpdateSlotVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateSlotVehicle,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
    },
  });
}

export function useUpdateSlotInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateSlotInstructor,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
    },
  });
}

export function useUpdateSlotCapacity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateSlotCapacity,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
    },
  });
}

export function useUpdateSlotStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateSlotStatus,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiDeleteSlot,
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiCreateSlot,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateSlotsBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: CreateSlotInput[]): Promise<CreateSlotsBatchResult> => {
      const results = await Promise.allSettled(inputs.map(apiCreateSlot));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => (r.reason instanceof Error ? r.reason.message : 'Okänt fel'));
      return { succeeded, failed: errors.length, errors };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Sick-day instructor substitution ────────────────────────────────────────

export interface ReassignSlotsInput {
  fromInstructorId: string;
  toInstructorId:   string;
  fromDate:         string;
  toDate:           string;
}

export interface ReassignSlotsResult {
  count: number;
}

async function apiReassignInstructorSlots(input: ReassignSlotsInput): Promise<ReassignSlotsResult> {
  const fromTs = `${input.fromDate}T00:00:00`;
  const toTs   = `${input.toDate}T23:59:59`;

  const { count, error } = await supabase
    .from('lesson_slots')
    .update({ instructor_id: input.toInstructorId } as never)
    .eq('instructor_id', input.fromInstructorId)
    .gte('starts_at', fromTs)
    .lte('starts_at', toTs)
    .is('deleted_at', null)
    .not('status', 'in', '(completed,cancelled,blocked)')
    .select('id');

  if (error) throw new Error(error.message);
  return { count: count ?? 0 };
}

export function useReassignInstructorSlots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiReassignInstructorSlots,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
