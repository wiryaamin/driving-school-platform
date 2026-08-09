import type { DemoRequestFormFields } from './demoRequestSchema.js';

/**
 * The payload shape sent to the `demo-requests` Edge Function — real types
 * (numbers, not numeric strings), not the raw form-field shape.
 */
export interface DemoRequestPayload {
  name: string;
  schoolName: string;
  email: string;
  phone: string;
  municipality: string;
  locationCount: number;
  studentCount: number;
  currentSystem: string;
  message: string;
  /**
   * Honeypot — always empty for a real visitor (the field is hidden and
   * never rendered interactively; see DemoPage.tsx). A bot that auto-fills
   * every input trips it. Included in the payload type (not bolted on ad
   * hoc) so it's visible as part of the contract, not a hidden side channel.
   */
  website: string;
}

export function toDemoRequestPayload(fields: DemoRequestFormFields, honeypot: string): DemoRequestPayload {
  return {
    name: fields.name,
    schoolName: fields.schoolName,
    email: fields.email,
    phone: fields.phone,
    municipality: fields.municipality,
    locationCount: Number.parseInt(fields.locationCount, 10),
    studentCount: Number.parseInt(fields.studentCount, 10),
    currentSystem: fields.currentSystem,
    message: fields.message,
    website: honeypot,
  };
}

export interface DemoRequestResult {
  id: string;
  createdAt: string;
}

/** Thrown when the `demo-requests` Edge Function rejects a submission — carries the real, server-supplied message. */
export class DemoRequestError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DemoRequestError';
  }
}

const API_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/demo-requests`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Submits a Demo Request to the real backend — Release 2.0 Epic 2.
 *
 * URL shape and anon-key usage match the existing convention in
 * apps/web/src/modules/leads/routes/PublicBookingPage.tsx
 * (`${VITE_SUPABASE_URL}/functions/v1/<name>`). One deliberate departure,
 * verified against the live deployed function, not assumed: this request
 * also sends `Authorization: Bearer <anon key>` alongside `apikey`.
 * Supabase Edge Functions default to `verify_jwt = true` at the platform
 * gateway (this project sets no config.toml override for `demo-requests`,
 * matching `public-booking`, which also has none) — the gateway requires a
 * signed JWT in `Authorization`, and rejects a request carrying only
 * `apikey` with `401 UNAUTHORIZED_NO_AUTH_HEADER` before the function body
 * ever runs. Curl-testing the deployed `public-booking` function exactly as
 * `PublicBookingPage.tsx` calls it reproduces the same 401 — an existing,
 * separate latent bug in that page, out of this epic's scope to fix, but
 * not one to copy here now that it's been found.
 *
 * Throws `DemoRequestError` on any non-2xx response, carrying the server's
 * real error code and message (not a generic "something went wrong") so
 * DemoPage.tsx can show it. Network failures (fetch itself rejecting) throw
 * a plain Error, distinguished by the caller if needed via `instanceof`.
 */
export async function submitDemoRequest(payload: DemoRequestPayload): Promise<DemoRequestResult> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json()) as
    | { data: { id: string; created_at: string } }
    | { code: string; message: string; trace_id: string };

  if (!res.ok || !('data' in body)) {
    const errorBody = body as { code: string; message: string };
    throw new DemoRequestError(
      errorBody.message ?? 'Något gick fel. Försök igen.',
      errorBody.code ?? 'UNKNOWN_ERROR',
    );
  }

  return { id: body.data.id, createdAt: body.data.created_at };
}
