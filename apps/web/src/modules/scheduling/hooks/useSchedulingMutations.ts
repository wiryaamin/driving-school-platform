import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonBooking, LessonSlot, CancellationCategory, BookingStatus } from '@platform/types';
import { slotKeys } from './useSlots.js';
import { bookingKeys } from './useBookings.js';
import { waitlistKeys } from './useWaitlist.js';

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

// ─── API helpers ──────────────────────────────────────────────────────────────

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
      // Slot filling up may affect waitlist visibility
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
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
      // Cancellation may trigger waitlist promotion — refresh waitlist state
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
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
      // Invalidate both the old and new slot's booking lists
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(slot_id) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.bySlot(new_slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(slot_id) });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(new_slot_id) });
      // Rescheduling frees the old slot — waitlist may be promoted
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
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
    },
  });
}
