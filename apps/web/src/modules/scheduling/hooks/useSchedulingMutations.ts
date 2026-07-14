import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonBooking, LessonSlot, CancellationCategory, BookingStatus } from '@platform/types';
import { slotKeys } from './useSlots.js';
import { bookingKeys } from './useBookings.js';
import { waitlistKeys } from './useWaitlist.js';

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
}

export interface CancelBookingInput {
  id:                      string;
  slot_id:                 string;
  cancellation_reason?:    string | null;
  cancellation_category?:  CancellationCategory | null;
}

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

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiCreateSlot(input: CreateSlotInput): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>('slots', {
    method: 'POST',
    body:   input,
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

// ─── Original API helpers ─────────────────────────────────────────────────────

async function apiCreateBooking(input: CreateBookingInput): Promise<LessonBooking> {
  const body: Record<string, unknown> = {
    slot_id:    input.slot_id,
    student_id: input.student_id,
  };
  if (input.price_sek !== undefined) body['price_sek'] = input.price_sek;

  const { data, error } = await supabase.functions.invoke<{ data: LessonBooking }>('bookings', {
    method: 'POST',
    body,
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiCancelBooking(input: CancelBookingInput): Promise<LessonBooking> {
  const body: Record<string, unknown> = {};
  if (input.cancellation_reason   !== undefined) body['cancellation_reason']   = input.cancellation_reason;
  if (input.cancellation_category !== undefined) body['cancellation_category'] = input.cancellation_category;

  const { data, error } = await supabase.functions.invoke<{ data: LessonBooking }>(`bookings/${input.id}/cancel`, {
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
