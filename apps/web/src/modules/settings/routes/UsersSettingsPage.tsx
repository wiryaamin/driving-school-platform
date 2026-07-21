import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Users, Search, Pencil, UserX, UserCheck,
  Mail, Plus, Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Skeleton, Label, Switch,
  Card, CardContent,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  toast,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type MembershipStatus = 'active' | 'suspended' | 'removed';

interface ProfileRow {
  id:           string;
  first_name:   string;
  last_name:    string;
  email:        string;
  phone:        string | null;
  is_active:    boolean;
  last_seen_at: string | null;
  created_at:   string;
}

interface MembershipRow {
  user_id:   string;
  status:    MembershipStatus;
  joined_at: string;
}

interface UserRow extends ProfileRow {
  membership: MembershipRow | undefined;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_EDIT: EditForm = {
  first_name: '', last_name: '', phone: '', is_active: true,
};

const EMPTY_INVITE: InviteForm = {
  email: '', first_name: '', last_name: '',
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(u: ProfileRow): string {
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

// ─── UsersSettingsPage ────────────────────────────────────────────────────────

export function UsersSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const [search,        setSearch]       = useState('');
  const [sheetOpen,     setSheetOpen]    = useState(false);
  const [editTarget,    setEditTarget]   = useState<UserRow | null>(null);
  const [editForm,      setEditForm]     = useState<EditForm>(EMPTY_EDIT);
  const [editErrors,    setEditErrors]   = useState<Record<string, string>>({});
  const [inviteOpen,    setInviteOpen]   = useState(false);
  const [inviteForm,    setInviteForm]   = useState<InviteForm>(EMPTY_INVITE);
  const [inviteErrors,  setInviteErrors] = useState<Record<string, string>>({});

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<MembershipRow[]>({
    queryKey: ['settings-users-memberships', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('memberships')
        .select('user_id, status, joined_at')
        .eq('organization_id', orgId)
        .neq('status', 'removed');
      if (error) throw error;
      return (data ?? []) as MembershipRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // profiles has no organization_id column (removed in Phase 1B.2 — org
  // context flows through memberships only, see packages/types/auth.types.ts).
  // Scope by the member ids already resolved above, not a direct org filter.
  const memberIds = useMemo(() => memberships.map(m => m.user_id), [memberships]);

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<ProfileRow[]>({
    queryKey: ['settings-users-profiles', orgId, memberIds],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_active, last_seen_at, created_at')
        .in('id', memberIds)
        .is('deleted_at', null)
        .order('first_name');
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!orgId && !membershipsLoading,
    staleTime: 30_000,
  });

  const isLoading = profilesLoading || membershipsLoading;

  const users = useMemo<UserRow[]>(() => {
    const memberMap = new Map<string, MembershipRow>(
      memberships.map(m => [m.user_id, m])
    );
    return profiles.map(p => ({
      ...p,
      membership: memberMap.get(p.id),
    }));
  }, [profiles, memberships]);

  const filtered = useMemo(() =>
    !search.trim()
      ? users
      : users.filter(u =>
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
        ),
    [users, search]
  );

  const activeCount = users.filter(u => u.is_active).length;

  // ── Invalidation ─────────────────────────────────────────────────────────

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['settings-users-profiles', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['settings-users-memberships', orgId] });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!orgId || !editTarget) return;
      const errors = validateEdit(editForm);
      if (Object.keys(errors).length > 0) { setEditErrors(errors); throw new Error('validation'); }
      // No organization_id filter here (see the profiles query above for why) —
      // editTarget only ever comes from this page's already org-scoped `users`
      // list, so there is no cross-tenant risk in targeting by id alone.
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: editForm.first_name.trim(),
          last_name:  editForm.last_name.trim(),
          phone:      editForm.phone.trim() || null,
          is_active:  editForm.is_active,
        } as never)
        .eq('id', editTarget.id);
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
      if (!orgId) return;
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
      const { error } = await supabase.functions.invoke('invite-user', {
        body: {
          email:           inviteForm.email.trim(),
          first_name:      inviteForm.first_name.trim(),
          last_name:       inviteForm.last_name.trim(),
          organization_id: orgId,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setInviteOpen(false);
      setInviteForm(EMPTY_INVITE);
      toast({
        title: 'Inbjudan skickad',
        description: `En inbjudan har skickats till ${inviteForm.email}.`,
      });
    },
    onError: (e: Error) => {
      if (e.message !== 'validation')
        toast({
          title:       'Fel vid inbjudan',
          description: 'Kontrollera att invite-user-funktionen är driftsatt.',
          variant:     'destructive',
        });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openEdit(u: UserRow) {
    setEditTarget(u);
    setEditForm({
      first_name: u.first_name,
      last_name:  u.last_name,
      phone:      u.phone ?? '',
      is_active:  u.is_active,
    });
    setEditErrors({});
    setSheetOpen(true);
  }

  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteErrors({});
    setInviteOpen(true);
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
              <p className="text-xl font-semibold tabular-nums text-foreground">{users.length}</p>
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
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Senast aktiv</th>
                <th scope="col" className="px-4 py-3 text-right" aria-label="Åtgärder" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {filtered.map(u => (
                <UserListRow
                  key={u.id}
                  user={u}
                  onEdit={() => openEdit(u)}
                  onToggleActive={() => toggleActive.mutate({ id: u.id, active: !u.is_active })}
                  isMutating={toggleActive.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Sheet ──────────────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col overflow-hidden p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <SheetTitle>Redigera användare</SheetTitle>
            {editTarget && (
              <SheetDescription>
                {editTarget.first_name} {editTarget.last_name}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

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

            {/* Åtkomst */}
            <section aria-label="Åtkomst" className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Åtkomst
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
                    <span className="text-foreground">{formatLastSeen(editTarget.last_seen_at)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Medlem sedan</span>
                    <span className="text-foreground">
                      {editTarget.membership?.joined_at
                        ? new Date(editTarget.membership.joined_at).toLocaleDateString('sv-SE')
                        : '—'}
                    </span>
                  </div>
                </div>
              </section>
            )}
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Sparar…' : 'Spara ändringar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
  user:           UserRow;
  onEdit:         () => void;
  onToggleActive: () => void;
  isMutating:     boolean;
}) {
  const isActive = user.is_active && user.membership?.status !== 'suspended';
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
          isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100   text-red-600   dark:bg-red-900/30   dark:text-red-400',
        )}>
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
        {formatLastSeen(user.last_seen_at)}
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
