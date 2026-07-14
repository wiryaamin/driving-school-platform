import { FunctionsHttpError } from '@supabase/supabase-js';

// ─── Approved integration status vocabulary (ADR-009 / Sprint 6A) ────────────
//
// Every integration status card in the External Services hub renders one of
// exactly these six values — never a raw HTTP code or error message. New
// integrations must map onto this vocabulary rather than inventing a new one.

export type IntegrationStatus =
  | 'connected'
  | 'not_connected'
  | 'subscription_required'
  | 'platform_managed'
  | 'coming_soon'
  | 'unknown_error';

export interface IntegrationStatusResolution {
  status:   IntegrationStatus;
  message:  string;
}

// Maps a thrown error from an integration status query onto the approved
// vocabulary plus a user-safe, non-technical explanation. A subscription
// restriction (HTTP 402) is a business state, not a failure, and must never
// be presented as one.
export function resolveIntegrationStatusError(error: unknown): IntegrationStatusResolution {
  if (error instanceof FunctionsHttpError) {
    switch (error.context.status) {
      case 402:
        return {
          status:  'subscription_required',
          message: 'Den här integrationen ingår i en högre prenumerationsplan.',
        };
      case 401:
        return {
          status:  'unknown_error',
          message: 'Sessionen kunde inte verifieras. Prova att logga in igen.',
        };
      case 403:
        return {
          status:  'unknown_error',
          message: 'Din roll saknar behörighet att visa den här statusen.',
        };
      case 404:
        return {
          status:  'unknown_error',
          message: 'Tjänsten kunde inte hittas just nu.',
        };
      default:
        return {
          status:  'unknown_error',
          message: 'Ett oväntat tekniskt fel uppstod. Försök igen senare.',
        };
    }
  }
  // Network failure, timeout, or any other non-HTTP error (FunctionsFetchError,
  // FunctionsRelayError, aborted request, offline, etc.) — no HTTP status to
  // read, so it is always an unexpected technical problem.
  return {
    status:  'unknown_error',
    message: 'Kunde inte nå tjänsten. Kontrollera anslutningen och försök igen.',
  };
}
