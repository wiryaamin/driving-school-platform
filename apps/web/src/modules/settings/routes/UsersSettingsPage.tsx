import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Users, Search, Pencil, UserX, UserCheck,
  Mail, Plus, Loader2, RotateCw, Ban, KeyRound, History, AlertTriangle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { humanizeIdentifier } from '@platform/utils';
import {
  Button, Skeleton, Label, Switch,
  Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import type { InvitableRole } from '@platform/validation';
import { cn } from '@/lib/utils.js';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { invokeFunctionWithRetry, isGatewayRoutingError } from '@shared/lib/edgeFunctionRetry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvitationStatus = 'pending' | 'accepted' | 'expired';

interface StaffRow {
  user_id:           string;
  email:             string;
  first_name:        string;
  last_name:         string;
  is_active:         boolean;
  role:              string;
  role_display:      string;
  membership_status: string;
  invitation_status: 'pending' | 'accepted';
  invited_at:        string | null;
  last_sign_in_at:   string | null;
  joined_at:         string;
}

interface IdentityEventRow {
  id:          string;
  event_type:  string;
  severity:    string;
  occurred_at: string;
  metadata:    Record<string, unknown>;
}

interface EditForm {
  first_name: string;
  last_name:  string;
  phone:      string;
  is_active:  boolean;
}

interface InviteForm {
  email:      string;
  first_name: string;
  last_name:  string;
  role:       InvitableRole;
}

const ROLE_LABELS: Record<InvitableRole, string> = {
  org_admin:         'Administratör',
  org_manager:       'Chef',
  instructor:        'Lärare',
  instructor_senior: 'Lärare (Senior)',
  receptionist:      'Receptionist',
  finance_admin:     'Ekonomi',
  student_admin:     'Elevadmin',
  reporting_viewer:  'Rapportläsare',
  corporate_contact: 'Företagskontakt',
};

// Invite links created via auth.admin.inviteUserByEmail / generateLink expire
// 24h after issuance on this project's Supabase Auth configuration — matches
// the same threshold documented for the platform-admin equivalent. Purely a
// display heuristic (not enforced here); the real expiry is Supabase's.
const INVITATION_EXPIRY_HOURS = 24;

const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pending:  'Väntar',
  accepted: 'Accepterad',
  expired:  'Utgången',
};

const INVITATION_STATUS_CLASS: Record<InvitationStatus, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expired:  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const IDENTITY_EVENT_LABEL: Record<string, string> = {
  'invite.created':          'Inbjudan skickad',
  'invite.resent':           'Inbjudan skickad igen',
  'invite.cancelled':        'Inbjudan avbruten',
  'invite.email_changed':    'E-postadress ändrad',
  'invite.existing_user_added': 'Tillagd i organisationen',
  'password_reset.sent':     'Lösenordsåterställning skickad',
  'password_reset.forced':   'Lösenord tvångsåterställt',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_EDIT: EditForm = {
  first_name: '', last_name: '', phone: '', is_active: true,
};

const EMPTY_INVITE: InviteForm = {
  email: '', first_name: '', last_name: '', role: 'instructor',
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEdit(f: EditForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.first_name.trim()) e['first_name'] = 'Förnamn krävs.';
  if (!f.last_name.trim())  e['last_name']  = 'Efternamn krävs.';
  return e;
}

function validateInvite(f: InviteForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.email.trim())
    e['email'] = 'E-postadress krävs.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    e['email'] = 'Ange en giltig e-postadress.';
  if (!f.first_name.trim()) e['first_name'] = 'Förnamn krävs.';
  if (!f.last_name.trim())  e['last_name']  = 'Efternamn krävs.';
  return e;
}

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'E-postadress krävs.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ange en giltig e-postadress.';
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(u: StaffRow): string {
  return `${u.first_name[0] ?? ''}${u.last_name[0] ?? ''}`.toUpperCase();
}

function formatLastSeen(ts: string | null): string {
  if (!ts) return 'Aldrig';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'Nyss';
  if (mins < 60) return `${mins} min sedan`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} tim sedan`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} dag${days > 1 ? 'ar' : ''} sedan`;
  return new Date(ts).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function computeInvitationStatus(u: StaffRow): InvitationStatus {
  if (u.invitation_status === 'accepted') return 'accepted';
  if (u.invited_at) {
    const ageHours = (Date.now() - new Date(u.invited_at).getTime()) / 3_600_000;
    if (ageHours > INVITATION_EXPIRY_HOURS) return 'expired';
  }
  return 'pending';
}

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | undefined)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json() as { message?: string };
      if (body.message) return body.message;
    } catch { /* fall through to fallback */ }
  }
  return fallback;
}

// ─── UsersSettingsPage ────────────────────────────────────────────────────────

export function UsersSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const [search,        setSearch]       = useState('');
  const [sheetOpen,     setSheetOpen]    = useState(false);
  const [editTarget,    setEditTarget]   = useState<StaffRow | null>(null);
  const [editForm,      setEditForm]     = useState<EditForm>(EMPTY_EDIT);
  const [editErrors,    setEditErrors]   = useState<Record<string, string>>({});
  const [inviteOpen,    setInviteOpen]   = useState(false);
  const [inviteForm,    setInviteForm]   = useState<InviteForm>(EMPTY_INVITE);
  const [inviteErrors,  setInviteErrors] = useState<Record<string, string>>({});
  const [emailEditing,  setEmailEditing] = useState(false);
  const [emailDraft,    setEmailDraft]   = useState('');
  const [emailError,    setEmailError]   = useState<string | undefined>(undefined);
  const [historyOpen,   setHistoryOpen]  = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: staff = [], isLoading } = useQuery<StaffRow[]>({
    queryKey: ['settings-staff-invitations', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ data: StaffRow[] }>(
        'invite-user/list',
        { method: 'GET' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte hämta användare'));
      return data?.data ?? [];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const filtered = useMemo(() =>
    !search.trim()
      ? staff
      : staff.filter(u =>
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
        ),
    [staff, search]
  );

  const activeCount = staff.filter(u => u.is_active).length;

  const { data: historyEvents = [], isLoading: historyLoading } = useQuery<IdentityEventRow[]>({
    queryKey: ['settings-staff-history', editTarget?.user_id],
    queryFn: async () => {
      if (!editTarget) return [];
      const { data, error } = await supabase
        .from('identity_security_events')
        .select('id, event_type, severity, occurred_at, metadata')
        .eq('user_id', editTarget.user_id)
        .order('occurred_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as IdentityEventRow[];
    },
    enabled: historyOpen && !!editTarget,
  });

  // ── Invalidation ─────────────────────────────────────────────────────────

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['settings-staff-invitations', orgId] });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!orgId || !editTarget) return;
      const errors = validateEdit(editForm);
      if (Object.keys(errors).length > 0) { setEditErrors(errors); throw new Error('validation'); }
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: editForm.first_name.trim(),
          last_name:  editForm.last_name.trim(),
          phone:      editForm.phone.trim() || null,
          is_active:  editForm.is_active,
        } as never)
        .eq('id', editTarget.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
      toast({ title: 'Användaren uppdaterades' });
    },
    onError: (e: Error) => {
      if (e.message !== 'validation')
        toast({ title: 'Fel vid uppdatering', variant: 'destructive' });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: active } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidate();
      toast({ title: vars.active ? 'Användaren aktiverades' : 'Användaren inaktiverades' });
    },
    onError: () => toast({ title: 'Fel vid statusändring', variant: 'destructive' }),
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const errors = validateInvite(inviteForm);
      if (Object.keys(errors).length > 0) { setInviteErrors(errors); throw new Error('validation'); }

      const { data, errorBody, opaqueFailure } = await invokeFunctionWithRetry<
        { data: { status: 'invited' | 'added_existing_user' } },
        { code?: string; message?: string }
      >(
        'invite-user',
        {
          email:      inviteForm.email.trim(),
          first_name: inviteForm.first_name.trim(),
          last_name:  inviteForm.last_name.trim(),
          role:       inviteForm.role,
        },
        isGatewayRoutingError,
      );

      if (opaqueFailure) throw new Error('Kunde inte nå invite-user-funktionen. Försök igen.');
      if (errorBody) throw new Error(errorBody.message ?? 'Inbjudan misslyckades.');
      return data?.data.status ?? 'invited';
    },
    onSuccess: (status) => {
      invalidate();
      setInviteOpen(false);
      setInviteForm(EMPTY_INVITE);
      toast(
        status === 'added_existing_user'
          ? {
              title: 'Användare tillagd',
              description: `${inviteForm.email} har redan ett konto och har lagts till i organisationen direkt.`,
            }
          : {
              title: 'Inbjudan skickad',
              description: `En inbjudan har skickats till ${inviteForm.email}.`,
            },
      );
    },
    onError: (e: Error) => {
      if (e.message === 'validation') return;
      toast({ title: 'Fel vid inbjudan', description: e.message, variant: 'destructive' });
    },
  });

  const resendInvitation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/resend-invitation`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka inbjudan igen'));
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Inbjudan skickad igen' });
    },
    onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
  });

  const cancelInvitation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/cancel-invitation`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte avbryta inbjudan'));
    },
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
      toast({ title: 'Inbjudan avbruten' });
    },
    onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
  });

  const sendPasswordReset = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/send-password-reset`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka lösenordsåterställning'));
    },
    onSuccess: () => toast({ title: 'Lösenordsåterställning skickad' }),
    onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
  });

  const changeEmail = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/change-email`, { method: 'POST', body: { email } });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte ändra e-postadressen'));
    },
    onSuccess: (_, vars) => {
      invalidate();
      setEmailEditing(false);
      setEditTarget(prev => prev ? { ...prev, email: vars.email } : prev);
      toast({ title: 'E-postadress ändrad', description: 'En ny inbjudan har skickats till den nya adressen.' });
    },
    onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openEdit(u: StaffRow) {
    setEditTarget(u);
    setEditForm({
      first_name: u.first_name,
      last_name:  u.last_name,
      phone:      '',
      is_active:  u.is_active,
    });
    setEditErrors({});
    setEmailEditing(false);
    setEmailDraft(u.email);
    setEmailError(undefined);
    setHistoryOpen(false);
    setSheetOpen(true);
  }

  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteErrors({});
    setInviteOpen(true);
  }

  function handleSaveEmail() {
    if (!editTarget) return;
    const err = validateEmail(emailDraft);
    if (err) { setEmailError(err); return; }
    changeEmail.mutate({ userId: editTarget.user_id, email: emailDraft.trim() });
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-10 rounded-lg" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  const editStatus = editTarget ? computeInvitationStatus(editTarget) : 'pending';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PermissionGate permission={Permissions.ADMIN_USER_READ}>
    <div className="max-w-3xl space-y-5">

      {/* Breadcrumb */}
      <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <span className="text-foreground font-medium">Användare</span>
      </nav>

      {/* Header card */}
      <Card>
        <CardContent className="p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-violet-600 dark:text-violet-400" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Användare</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hantera organisationens användare, bjud in nya och ändra åtkomst.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xl font-semibold tabular-nums text-foreground">{staff.length}</p>
              <p className="text-xs text-muted-foreground">{activeCount} aktiva</p>
            </div>
            <Button size="sm" onClick={openInvite}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Bjud in
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Sök namn eller e-post…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Sök användare"
        />
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-10 h-10 mb-3 text-muted-foreground opacity-30" aria-hidden="true" />
          <p className="font-medium text-foreground">
            {search ? 'Ingen användare matchar sökningen.' : 'Inga användare registrerade.'}
          </p>
          {!search && (
            <p className="text-sm text-muted-foreground mt-1">
              Bjud in din första användare för att komma igång.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Namn</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">E-post</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Inbjudan</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Konto</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Senast aktiv</th>
                <th scope="col" className="px-4 py-3 text-right" aria-label="Åtgärder" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {filtered.map(u => (
                <UserListRow
                  key={u.user_id}
                  user={u}
                  onEdit={() => openEdit(u)}
                  onToggleActive={() => toggleActive.mutate({ id: u.user_id, active: !u.is_active })}
                  isMutating={toggleActive.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <DialogTitle>Redigera användare</DialogTitle>
            {editTarget && (
              <DialogDescription>
                {editTarget.first_name} {editTarget.last_name} · {editTarget.role_display}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Invitation & Access */}
            {editTarget && (
              <section aria-label="Inbjudan och åtkomst" className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Inbjudan &amp; åtkomst
                  </p>
                  <span className={cn(
                    'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
                    INVITATION_STATUS_CLASS[editStatus],
                  )}>
                    {INVITATION_STATUS_LABEL[editStatus]}
                  </span>
                </div>

                <div className="space-y-2 text-sm rounded-lg border border-border p-3 bg-muted/20">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Inbjudan skickad</span>
                    <span className="text-foreground">{formatDateTime(editTarget.invited_at)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {editStatus === 'accepted' ? 'Aktiverad / senast inloggad' : 'Aktiverad'}
                    </span>
                    <span className="text-foreground">{formatDateTime(editTarget.last_sign_in_at)}</span>
                  </div>
                </div>

                {/* Pending-only actions */}
                {editStatus !== 'accepted' && (
                  <div className="space-y-2">
                    {emailEditing ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="edit_pending_email" className="text-xs">Ny e-postadress</Label>
                        <div className="flex gap-2">
                          <input
                            id="edit_pending_email"
                            type="email"
                            value={emailDraft}
                            onChange={e => { setEmailDraft(e.target.value); setEmailError(undefined); }}
                            className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <Button size="sm" onClick={handleSaveEmail} disabled={changeEmail.isPending}>
                            {changeEmail.isPending ? 'Sparar…' : 'Spara'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setEmailEditing(false); setEmailDraft(editTarget.email); setEmailError(undefined); }}>
                            Avbryt
                          </Button>
                        </div>
                        {emailError && <p className="text-xs text-destructive" role="alert">{emailError}</p>}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => resendInvitation.mutate(editTarget.user_id)}
                          disabled={resendInvitation.isPending}
                        >
                          <RotateCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                          Skicka igen
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setEmailEditing(true)}
                        >
                          <Mail className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                          Byt e-post
                        </Button>
                      </div>
                    )}
                    <Button
                      size="sm" variant="outline"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => cancelInvitation.mutate(editTarget.user_id)}
                      disabled={cancelInvitation.isPending}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                      {cancelInvitation.isPending ? 'Avbryter…' : 'Avbryt inbjudan'}
                    </Button>
                  </div>
                )}

                {/* Accepted-only action */}
                {editStatus === 'accepted' && (
                  <Button
                    size="sm" variant="outline" className="w-full"
                    onClick={() => sendPasswordReset.mutate(editTarget.user_id)}
                    disabled={sendPasswordReset.isPending}
                  >
                    <KeyRound className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    {sendPasswordReset.isPending ? 'Skickar…' : 'Skicka lösenordsåterställning'}
                  </Button>
                )}

                {/* Invitation history */}
                <div>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <History className="w-3.5 h-3.5" aria-hidden="true" />
                    {historyOpen ? 'Dölj inbjudningshistorik' : 'Visa inbjudningshistorik'}
                  </button>
                  {historyOpen && (
                    <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto rounded-lg border border-border p-2.5 bg-muted/10">
                      {historyLoading ? (
                        <p className="text-xs text-muted-foreground">Laddar…</p>
                      ) : historyEvents.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Ingen historik ännu.</p>
                      ) : (
                        historyEvents.map(ev => (
                          <div key={ev.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-foreground">{IDENTITY_EVENT_LABEL[ev.event_type] ?? humanizeIdentifier(ev.event_type)}</span>
                            <span className="text-muted-foreground shrink-0">{formatDateTime(ev.occurred_at)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Personuppgifter */}
            <section aria-label="Personuppgifter" className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Personuppgifter
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field id="edit_first_name" label="Förnamn" required error={editErrors['first_name']}>
                  <input
                    id="edit_first_name"
                    type="text"
                    value={editForm.first_name}
                    onChange={e => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Förnamn"
                    aria-required="true"
                  />
                </Field>
                <Field id="edit_last_name" label="Efternamn" required error={editErrors['last_name']}>
                  <input
                    id="edit_last_name"
                    type="text"
                    value={editForm.last_name}
                    onChange={e => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Efternamn"
                    aria-required="true"
                  />
                </Field>
              </div>
              <Field id="edit_phone" label="Telefon">
                <input
                  id="edit_phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="t.ex. 070-123 45 67"
                />
              </Field>
            </section>

            {/* Kontostatus */}
            <section aria-label="Kontostatus" className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Kontostatus
              </p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="edit_is_active" className="text-sm font-medium">Aktiv</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inaktiva användare kan inte logga in.
                  </p>
                </div>
                <Switch
                  id="edit_is_active"
                  checked={editForm.is_active}
                  onCheckedChange={v => setEditForm(prev => ({ ...prev, is_active: v }))}
                  aria-label="Aktiv status"
                />
              </div>
              {editStatus !== 'accepted' && editForm.is_active === false && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  Denna användare har inte aktiverat sitt konto än — inaktivering blockerar inloggning
                  men avbryter inte själva inbjudan. Använd &quot;Avbryt inbjudan&quot; ovan för att helt ta bort den.
                </p>
              )}
            </section>

            {/* Info (read-only) */}
            {editTarget && (
              <section aria-label="Information" className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Information
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">E-post</span>
                    <span className="text-foreground font-medium truncate">{editTarget.email}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Senast aktiv</span>
                    <span className="text-foreground">{formatLastSeen(editTarget.last_sign_in_at)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Medlem sedan</span>
                    <span className="text-foreground">
                      {new Date(editTarget.joined_at).toLocaleDateString('sv-SE')}
                    </span>
                  </div>
                </div>
              </section>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Sparar…' : 'Spara ändringar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bjud in användare</DialogTitle>
            <DialogDescription>
              En inbjudan med en länk för att skapa konto skickas till den angivna e-postadressen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field id="inv_first_name" label="Förnamn" required error={inviteErrors['first_name']}>
                <input
                  id="inv_first_name"
                  type="text"
                  value={inviteForm.first_name}
                  onChange={e => setInviteForm(prev => ({ ...prev, first_name: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Förnamn"
                  aria-required="true"
                />
              </Field>
              <Field id="inv_last_name" label="Efternamn" required error={inviteErrors['last_name']}>
                <input
                  id="inv_last_name"
                  type="text"
                  value={inviteForm.last_name}
                  onChange={e => setInviteForm(prev => ({ ...prev, last_name: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Efternamn"
                  aria-required="true"
                />
              </Field>
            </div>
            <Field id="inv_email" label="E-postadress" required error={inviteErrors['email']}>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="inv_email"
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-9 pr-3 h-9 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="namn@foretag.se"
                  aria-required="true"
                />
              </div>
            </Field>
            <Field id="inv_role" label="Roll" required>
              <Select
                value={inviteForm.role}
                onValueChange={(v) => setInviteForm(prev => ({ ...prev, role: v as InvitableRole }))}
              >
                <SelectTrigger id="inv_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={() => inviteUser.mutate()} disabled={inviteUser.isPending}>
              {inviteUser.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                  Skickar…
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Skicka inbjudan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </PermissionGate>
  );
}

// ─── UserListRow ──────────────────────────────────────────────────────────────

function UserListRow({
  user, onEdit, onToggleActive, isMutating,
}: {
  user:           StaffRow;
  onEdit:         () => void;
  onToggleActive: () => void;
  isMutating:     boolean;
}) {
  const isActive = user.is_active && user.membership_status !== 'suspended';
  const invitationStatus = computeInvitationStatus(user);
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-xs font-semibold text-violet-700 dark:text-violet-300 shrink-0 select-none"
            aria-hidden="true"
          >
            {getInitials(user)}
          </div>
          <span className="font-medium text-foreground truncate max-w-[140px]">
            {user.first_name} {user.last_name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell truncate max-w-[180px]">
        {user.email}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
          INVITATION_STATUS_CLASS[invitationStatus],
        )}>
          {INVITATION_STATUS_LABEL[invitationStatus]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
          isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100   text-red-600   dark:bg-red-900/30   dark:text-red-400',
        )}>
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
        {formatLastSeen(user.last_sign_in_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label={`Redigera ${user.first_name} ${user.last_name}`}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            disabled={isMutating}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={
              user.is_active
                ? `Inaktivera ${user.first_name} ${user.last_name}`
                : `Aktivera ${user.first_name} ${user.last_name}`
            }
          >
            {user.is_active
              ? <UserX      className="w-3.5 h-3.5" aria-hidden="true" />
              : <UserCheck  className="w-3.5 h-3.5" aria-hidden="true" />
            }
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  id, label, required, error, children,
}: {
  id:        string;
  label:     string;
  required?: boolean | undefined;
  error?:    string | undefined;
  children:  ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required === true && (
          <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        )}
      </Label>
      {children}
      {error !== undefined && error !== '' && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
