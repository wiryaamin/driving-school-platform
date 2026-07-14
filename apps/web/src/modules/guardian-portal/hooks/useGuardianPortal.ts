import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const PORTAL_API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/guardian-portal`;
const ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const SESSION_KEY = 'guardian_portal_session';

// ─── Session types ────────────────────────────────────────────────────────────

export interface GuardianSession {
  token:             string;
  guardian_id:       string;
  guardian_name:     string;
  student_id:        string;
  organization_id:   string;
  organization_name: string;
  expires_at:        string;
}

export function getStoredGuardianSession(): GuardianSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GuardianSession;
    if (new Date(s.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function storeGuardianSession(s: GuardianSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearGuardianSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface GuardianMe {
  guardian: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
    phone:      string | null;
    relation:   string | null;
    can_pay:    boolean;
  };
  student: {
    id:                      string;
    first_name:              string;
    last_name:               string;
    permit_stage:            string;
    target_licence_category: string;
  };
  organization: {
    id:    string;
    name:  string;
    phone: string | null;
    email: string | null;
  };
}

export interface GuardianBooking {
  id:          string;
  status:      string;
  lesson_slots: {
    starts_at:               string;
    ends_at:                 string;
    notes:                   string | null;
    lesson_types:            { name: string } | null;
    instructors:             { first_name: string; last_name: string } | null;
    organization_locations:  { name: string; address_line1: string; city: string } | null;
    vehicles:                { make: string; model: string; registration_number: string } | null;
  } | null;
}

export interface GuardianBalancePackage {
  id:                 string;
  name:               string;
  package_type:       string;
  quantity_granted:   number;
  quantity_consumed:  number;
  quantity_remaining: number;
  expires_at:         string | null;
  status:             string;
}

export interface GuardianBalance {
  balance: {
    balance_sek:     number;
    credit_used_sek: number;
    total_paid_sek:  number;
  };
  invoices: Array<{
    id:             string;
    invoice_number: string;
    amount_sek:     number;
    due_date:       string | null;
    status:         string;
  }>;
  packages: GuardianBalancePackage[];
}

export interface GuardianProgress {
  permit_stage:          string;
  theory_passed_at:      string | null;
  practical_passed_at:   string | null;
  risk1_completed_at:    string | null;
  risk2_completed_at:    string | null;
  completed_count:       number;
  upcoming_count:        number;
  cancelled_count:       number;
  no_show_count:         number;
}

export interface GuardianAssessment {
  id:              string;
  instructor_name: string;
  competencies:    Record<string, string>;
  readiness:       Record<string, boolean>;
  notes:           string | null;
  updated_at:      string;
}

// ─── Alert computation (client-side, uses existing endpoint data) ─────────────

export type AlertLevel = 'warning' | 'info';

export interface GuardianAlert {
  id:      string;
  level:   AlertLevel;
  title:   string;
  message: string;
}

export function computeGuardianAlerts(
  progress:  GuardianProgress | undefined,
  bookings:  GuardianBooking[],
): GuardianAlert[] {
  if (!progress) return [];
  const alerts: GuardianAlert[] = [];
  const now = Date.now();

  const upcoming = bookings.filter(b =>
    (b.status === 'confirmed' || b.status === 'reserved') &&
    b.lesson_slots &&
    new Date(b.lesson_slots.starts_at).getTime() > now,
  );

  if (upcoming.length === 0 && progress.completed_count > 0 && !progress.practical_passed_at) {
    alerts.push({
      id:      'no-upcoming',
      level:   'warning',
      title:   'Inga kommande lektioner',
      message: 'Eleven har inga bokade lektioner. Kontakta trafikskolan för att boka nästa tillfälle.',
    });
  }

  if (progress.no_show_count > 0) {
    alerts.push({
      id:      'no-show',
      level:   'warning',
      title:   `${progress.no_show_count} uteblivet tillfälle${progress.no_show_count > 1 ? 'n' : ''}`,
      message: 'Eleven har uteblivit från en bokad lektion. Kontakta trafikskolan om det finns problem.',
    });
  }

  if (!progress.risk1_completed_at && progress.completed_count >= 8) {
    const r1Booked = upcoming.some(b => {
      const n = b.lesson_slots?.lesson_types?.name?.toLowerCase() ?? '';
      return n.includes('risk 1') || n.includes('risk1') || n.includes('halk');
    });
    if (!r1Booked) {
      alerts.push({
        id:      'risk1-missing',
        level:   'info',
        title:   'Risk 1 ej bokad',
        message: 'Eleven har genomfört flera lektioner men Risk 1 är inte bokad. Risk 1 krävs för att ta körprov.',
      });
    }
  }

  if (progress.risk1_completed_at && !progress.risk2_completed_at) {
    const r2Booked = upcoming.some(b => {
      const n = b.lesson_slots?.lesson_types?.name?.toLowerCase() ?? '';
      return n.includes('risk 2') || n.includes('risk2') || n.includes('mörk');
    });
    if (!r2Booked) {
      alerts.push({
        id:      'risk2-missing',
        level:   'info',
        title:   'Risk 2 ej bokad',
        message: 'Risk 1 är avklarad — nu är det dags att boka Risk 2 för att slutföra riskutbildningen.',
      });
    }
  }

  if (progress.risk2_completed_at && !progress.theory_passed_at) {
    alerts.push({
      id:      'theory-pending',
      level:   'info',
      title:   'Teoriprov kvarstår',
      message: 'Riskutbildningen är klar. Uppmuntra eleven att boka och förbereda teoriprov.',
    });
  }

  if (progress.theory_passed_at && !progress.practical_passed_at) {
    alerts.push({
      id:      'practical-pending',
      level:   'info',
      title:   'Uppkörning kvarstår',
      message: 'Eleven har klarat teorin — sista steget är att boka och genomföra körprovet.',
    });
  }

  return alerts;
}

// ─── Demo mode ────────────────────────────────────────────────────────────────

function guardianDemoResponse<T>(path: string): T {
  const now = Date.now();
  const DAY = 86_400_000;

  const me: GuardianMe = {
    guardian: {
      id:         'demo-guardian',
      first_name: 'Eva',
      last_name:  'Johansson',
      email:      'eva.johansson@demo.se',
      phone:      '+46701234567',
      relation:   'Förälder',
      can_pay:    true,
    },
    student: {
      id:                      'demo-student',
      first_name:              'Axel',
      last_name:               'Johansson',
      permit_stage:            'risk1_completed',
      target_licence_category: 'B',
    },
    organization: { id: 'demo-org', name: 'Demo Trafikskola AB', phone: '+46 8 123 456 78', email: 'info@demotrafikskola.se' },
  };

  const progress: GuardianProgress = {
    permit_stage:          'risk1_completed',
    theory_passed_at:      null,
    practical_passed_at:   null,
    risk1_completed_at:    '2025-03-15T10:00:00.000Z',
    risk2_completed_at:    null,
    completed_count:       14,
    upcoming_count:        3,
    cancelled_count:       1,
    no_show_count:         0,
  };

  const bookings: GuardianBooking[] = [
    {
      id:     'demo-b1',
      status: 'confirmed',
      lesson_slots: {
        starts_at:               new Date(now + 2 * DAY).toISOString(),
        ends_at:                 new Date(now + 2 * DAY + 5_400_000).toISOString(),
        notes:                   null,
        lesson_types:            { name: 'Körlektion' },
        instructors:             { first_name: 'Maria', last_name: 'Lindström' },
        organization_locations:  { name: 'Demo Trafikskola', address_line1: 'Storgatan 12', city: 'Stockholm' },
        vehicles:                { make: 'Volvo', model: 'V60', registration_number: 'ABC123' },
      },
    },
    {
      id:     'demo-b2',
      status: 'confirmed',
      lesson_slots: {
        starts_at:               new Date(now + 5 * DAY).toISOString(),
        ends_at:                 new Date(now + 5 * DAY + 5_400_000).toISOString(),
        notes:                   null,
        lesson_types:            { name: 'Motorvägskörning' },
        instructors:             { first_name: 'Maria', last_name: 'Lindström' },
        organization_locations:  { name: 'Demo Trafikskola', address_line1: 'Storgatan 12', city: 'Stockholm' },
        vehicles:                { make: 'Volvo', model: 'V60', registration_number: 'ABC123' },
      },
    },
    {
      id:     'demo-b3',
      status: 'confirmed',
      lesson_slots: {
        starts_at:               new Date(now + 9 * DAY).toISOString(),
        ends_at:                 new Date(now + 9 * DAY + 5_400_000).toISOString(),
        notes:                   null,
        lesson_types:            { name: 'Backkörning' },
        instructors:             { first_name: 'Maria', last_name: 'Lindström' },
        organization_locations:  null,
        vehicles:                { make: 'Volvo', model: 'V60', registration_number: 'ABC123' },
      },
    },
    {
      id:     'demo-b4',
      status: 'completed',
      lesson_slots: {
        starts_at:               new Date(now - 3 * DAY).toISOString(),
        ends_at:                 new Date(now - 3 * DAY + 5_400_000).toISOString(),
        notes:                   'Bra framsteg på rondellkörning. Fortsätt öva ögonkontakt vid filbyte.',
        lesson_types:            { name: 'Körlektion' },
        instructors:             { first_name: 'Maria', last_name: 'Lindström' },
        organization_locations:  null,
        vehicles:                null,
      },
    },
    {
      id:     'demo-b5',
      status: 'completed',
      lesson_slots: {
        starts_at:               new Date(now - 7 * DAY).toISOString(),
        ends_at:                 new Date(now - 7 * DAY + 5_400_000).toISOString(),
        notes:                   null,
        lesson_types:            { name: 'Parkeringskörning' },
        instructors:             { first_name: 'Maria', last_name: 'Lindström' },
        organization_locations:  null,
        vehicles:                null,
      },
    },
    {
      id:     'demo-b6',
      status: 'cancelled',
      lesson_slots: {
        starts_at:               new Date(now - 11 * DAY).toISOString(),
        ends_at:                 new Date(now - 11 * DAY + 5_400_000).toISOString(),
        notes:                   null,
        lesson_types:            { name: 'Stadskörning' },
        instructors:             { first_name: 'Maria', last_name: 'Lindström' },
        organization_locations:  null,
        vehicles:                null,
      },
    },
  ];

  const balance: GuardianBalance = {
    balance: {
      balance_sek:     3_000,
      credit_used_sek: 11_000,
      total_paid_sek:  14_000,
    },
    invoices: [
      {
        id:             'demo-inv1',
        invoice_number: 'F-2025-042',
        amount_sek:     2_500,
        due_date:       new Date(now + 14 * DAY).toISOString().slice(0, 10),
        status:         'issued',
      },
    ],
    packages: [
      {
        id:                 'demo-pkg1',
        name:               '15 Körlektioner',
        package_type:       'driving',
        quantity_granted:   15,
        quantity_consumed:  12,
        quantity_remaining: 3,
        expires_at:         new Date(now + 60 * DAY).toISOString(),
        status:             'active',
      },
    ],
  };

  const assessments: GuardianAssessment[] = [
    {
      id:              'demo-ass1',
      instructor_name: 'Maria Lindström',
      competencies: {
        stadskorning: 'mastered',
        landsvag:     'in_progress',
        motorvag:     'not_started',
        parkering:    'in_progress',
        backning:     'mastered',
        cirkulation:  'in_progress',
        morker:       'not_started',
        halka:        'not_started',
      },
      readiness: {
        risk1:      true,
        risk2:      false,
        theory:     false,
        practical:  false,
      },
      notes:      'Axel visar god framsteg i stadskörning och backning. Fokusera nu på landsväg och cirkulation.',
      updated_at: new Date(now - 3 * DAY).toISOString(),
    },
  ];

  const documents: GuardianDocument[] = [
    {
      id:              'demo-doc1',
      category:        'contract',
      file_name:       'Utbildningsavtal_Axel_Johansson.pdf',
      mime_type:       'application/pdf',
      file_size_bytes: 245120,
      description:     'Signerat utbildningsavtal för körkortsbehörighet B',
      expires_at:      null,
      created_at:      new Date(now - 60 * DAY).toISOString(),
      download_url:    null,
    },
    {
      id:              'demo-doc2',
      category:        'certificate',
      file_name:       'Risk1_Intyg.pdf',
      mime_type:       'application/pdf',
      file_size_bytes: 98304,
      description:     'Intyg för genomförd riskutbildning del 1 (Risk 1)',
      expires_at:      null,
      created_at:      new Date(now - 30 * DAY).toISOString(),
      download_url:    null,
    },
    {
      id:              'demo-doc3',
      category:        'theory',
      file_name:       'Trafikens_grunder.pdf',
      mime_type:       'application/pdf',
      file_size_bytes: 512000,
      description:     'Sammanfattning av trafikens grunder och vägmärken',
      expires_at:      null,
      created_at:      new Date(now - 45 * DAY).toISOString(),
      download_url:    null,
    },
  ];

  const MAP: Record<string, unknown> = {
    '/me':          me,
    '/progress':    progress,
    '/bookings':    bookings,
    '/balance':     balance,
    '/assessments': assessments,
    '/documents':   documents,
  };
  return (MAP[path] ?? { success: true }) as T;
}

// ─── Guardian fetch helper ────────────────────────────────────────────────────

async function guardianFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const session = getStoredGuardianSession();
  if (!session) throw new Error('No guardian session');

  if (session.token === 'demo') return guardianDemoResponse<T>(path);

  const res = await fetch(`${PORTAL_API}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.token}`,
      'apikey':        ANON_KEY,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((body['error'] as string | undefined) ?? `Request failed: ${res.status}`);
  }
  return body['data'] as T;
}

// ─── Portal data hooks ────────────────────────────────────────────────────────

export function useGuardianMe() {
  return useQuery({
    queryKey: ['guardian', 'me'],
    queryFn:  (): Promise<GuardianMe> => guardianFetch<GuardianMe>('/me'),
    staleTime: 5 * 60_000,
  });
}

export function useGuardianBookings() {
  return useQuery({
    queryKey: ['guardian', 'bookings'],
    queryFn:  (): Promise<GuardianBooking[]> => guardianFetch<GuardianBooking[]>('/bookings'),
    staleTime: 60_000,
  });
}

export function useGuardianBalance() {
  return useQuery({
    queryKey: ['guardian', 'balance'],
    queryFn:  (): Promise<GuardianBalance> => guardianFetch<GuardianBalance>('/balance'),
    staleTime: 60_000,
  });
}

export function useGuardianProgress() {
  return useQuery({
    queryKey: ['guardian', 'progress'],
    queryFn:  (): Promise<GuardianProgress> => guardianFetch<GuardianProgress>('/progress'),
    staleTime: 2 * 60_000,
  });
}

export interface GuardianDocument {
  id:              string;
  category:        string;
  file_name:       string;
  mime_type:       string | null;
  file_size_bytes: number | null;
  description:     string | null;
  expires_at:      string | null;
  created_at:      string;
  download_url:    string | null;
}

export function useGuardianDocuments() {
  return useQuery({
    queryKey: ['guardian', 'documents'],
    queryFn:  (): Promise<GuardianDocument[]> => guardianFetch<GuardianDocument[]>('/documents'),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function useGuardianAssessments() {
  return useQuery({
    queryKey: ['guardian', 'assessments'],
    queryFn:  (): Promise<GuardianAssessment[]> => guardianFetch<GuardianAssessment[]>('/assessments'),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useUpdateGuardianMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { first_name?: string; last_name?: string; phone?: string | null }) =>
      guardianFetch<GuardianMe['guardian']>('/me', {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['guardian', 'me'] });
    },
  });
}

// ─── Admin hooks (uses Supabase JWT, not guardian token) ─────────────────────

import { supabase } from '@core/api/supabase.js';

export interface Guardian {
  id:         string;
  first_name: string;
  last_name:  string;
  email:      string;
  phone:      string | null;
  relation:   string | null;
  can_pay:    boolean;
  created_at: string;
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch(`${PORTAL_API}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey':        ANON_KEY,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((body['error'] as string | undefined) ?? `Request failed: ${res.status}`);
  return body['data'] as T;
}

export function useStudentGuardians(studentId: string | undefined) {
  return useQuery({
    queryKey: ['guardians', studentId],
    queryFn:  (): Promise<Guardian[]> => adminFetch<Guardian[]>(`/guardians?student_id=${studentId}`),
    enabled:  Boolean(studentId),
    staleTime: 60_000,
  });
}

export function useCreateGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      student_id: string;
      first_name: string;
      last_name:  string;
      email:      string;
      phone?:     string | undefined;
      relation?:  string | undefined;
      can_pay?:   boolean | undefined;
    }): Promise<Guardian> => adminFetch<Guardian>('/guardians', {
      method: 'POST',
      body:   JSON.stringify(data),
    }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['guardians', vars.student_id] });
    },
  });
}

export function useDeleteGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guardianId }: { guardianId: string; studentId: string }): Promise<{ success: boolean }> =>
      adminFetch<{ success: boolean }>(`/guardians/${guardianId}`, { method: 'DELETE' }),
    onSuccess: (_, { studentId }) => {
      void qc.invalidateQueries({ queryKey: ['guardians', studentId] });
    },
  });
}

export function useUpdateGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      guardianId: string;
      studentId:  string;
      first_name: string;
      last_name:  string;
      email:      string;
      phone:      string | null;
      relation:   string | null;
      can_pay:    boolean;
    }): Promise<Guardian> =>
      adminFetch<Guardian>(`/guardians/${vars.guardianId}`, {
        method: 'PATCH',
        body:   JSON.stringify({
          first_name: vars.first_name,
          last_name:  vars.last_name,
          email:      vars.email,
          phone:      vars.phone,
          relation:   vars.relation,
          can_pay:    vars.can_pay,
        }),
      }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['guardians', vars.studentId] });
    },
  });
}

export function useGenerateGuardianToken() {
  return useMutation({
    mutationFn: (guardianId: string): Promise<{
      token: string; url: string; expires_at: string; guardian_name: string;
    }> => adminFetch('/generate-token', {
      method: 'POST',
      body:   JSON.stringify({ guardian_id: guardianId }),
    }),
  });
}

