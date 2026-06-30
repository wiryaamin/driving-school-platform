import { useState } from 'react';
import { User, Building2, Shield, Key, Check, Loader2, AlertCircle } from 'lucide-react';
import { useSessionStore } from '@core/store/session.store.js';
import { supabase } from '@core/api/supabase.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { cn } from '@/lib/utils.js';

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  org_owner:         'Ägare',
  org_admin:         'Administratör',
  org_manager:       'Chef',
  instructor:        'Lärare',
  instructor_senior: 'Lärare (Senior)',
  receptionist:      'Receptionist',
  finance_admin:     'Ekonomi',
  student_admin:     'Elevadmin',
  reporting_viewer:  'Rapportläsare',
};

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, children }: {
  icon:     React.ElementType;
  title:    string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium text-foreground', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, profile, organization } = useSessionStore();

  const [firstName,   setFirstName]   = useState(profile?.first_name ?? '');
  const [lastName,    setLastName]    = useState(profile?.last_name  ?? '');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError,   setNameError]   = useState<string | null>(null);

  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [pwdLoading,  setPwdLoading]  = useState(false);
  const [pwdError,    setPwdError]    = useState<string | null>(null);

  const initials = profile
    ? `${profile.first_name[0] ?? ''}${profile.last_name[0] ?? ''}`.toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? '?');

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : (user?.email ?? '—');

  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? (user?.role ?? '');

  // ── Save name ─────────────────────────────────────────────────────────────

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setNameLoading(true);
    setNameError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name:  firstName.trim(),
        last_name:   lastName.trim(),
        updated_at:  new Date().toISOString(),
      } as never)
      .eq('id', user.id);
    setNameLoading(false);
    if (error) {
      setNameError('Kunde inte spara ändringarna. Försök igen.');
    } else {
      toast({ title: 'Profil uppdaterad' });
    }
  }

  // ── Change password ───────────────────────────────────────────────────────

  async function handleChangePwd(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    if (newPwd.length < 8) {
      setPwdError('Lösenordet måste vara minst 8 tecken.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('Lösenorden matchar inte.');
      return;
    }
    setPwdLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdLoading(false);
    if (error) {
      setPwdError(error.message);
    } else {
      toast({ title: 'Lösenord ändrat' });
      setNewPwd('');
      setConfirmPwd('');
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Min profil"
        description="Hantera dina personuppgifter och säkerhetsinställningar"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Min profil' }]}
      />

      <PageContent>
        <div className="max-w-2xl space-y-6">

          {/* ── Identity card ──────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-primary-foreground">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email ?? '—'}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {roleLabel && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {roleLabel}
                  </span>
                )}
                {organization?.name && (
                  <span className="text-xs text-muted-foreground">{organization.name}</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Edit name ──────────────────────────────────────────────────── */}
          <SectionCard icon={User} title="Personuppgifter">
            <form onSubmit={handleSaveName} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Förnamn</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Efternamn</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">E-postadress</label>
                <input
                  value={user?.email ?? ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-sm text-muted-foreground cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">E-postadressen ändras via kontohantering.</p>
              </div>
              {nameError && (
                <div className="flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {nameError}
                </div>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={nameLoading}>
                  {nameLoading
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Check   className="w-4 h-4 mr-2" />}
                  Spara ändringar
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* ── Change password ────────────────────────────────────────────── */}
          <SectionCard icon={Key} title="Byt lösenord">
            <form onSubmit={handleChangePwd} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Nytt lösenord</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Minst 8 tecken"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Bekräfta nytt lösenord</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Upprepa lösenordet"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {pwdError && (
                <div className="flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {pwdError}
                </div>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={pwdLoading || !newPwd}>
                  {pwdLoading
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Key     className="w-4 h-4 mr-2" />}
                  Byt lösenord
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* ── Organization ───────────────────────────────────────────────── */}
          {organization && (
            <SectionCard icon={Building2} title="Organisation">
              <div className="divide-y divide-border">
                <FieldRow label="Trafikskola"    value={organization.name} />
                <FieldRow label="Roll"            value={roleLabel || '—'} />
                <FieldRow
                  label="Kontostatus"
                  value={
                    organization.subscription_status === 'active'   ? 'Aktiv' :
                    organization.subscription_status === 'trialing' ? 'Testperiod' :
                    organization.subscription_status === 'past_due' ? 'Betalning försenad' :
                    (organization.subscription_status ?? '—')
                  }
                />
              </div>
            </SectionCard>
          )}

          {/* ── Security note ──────────────────────────────────────────────── */}
          <SectionCard icon={Shield} title="Säkerhet">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ditt konto skyddas av Supabase Auth med JWT-baserad sessionshantering.
              Alla sessionstokens är knutna till organisationens identitet och löper ut automatiskt.
              Kontakta systemadministratören vid misstänkt aktivitet.
            </p>
          </SectionCard>

        </div>
      </PageContent>
    </PageLayout>
  );
}
