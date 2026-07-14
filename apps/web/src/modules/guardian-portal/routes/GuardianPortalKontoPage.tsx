import { useState } from 'react';
import { User, Mail, Phone, Shield, AlertCircle, CheckCircle2, Pencil, X, Check, LogOut } from 'lucide-react';
import { useGuardianMe, useUpdateGuardianMe, clearGuardianSession } from '../hooks/useGuardianPortal.js';
import { useGuardianSession } from './GuardianPortalLayout.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#2D5BE3';

// ─── GuardianPortalKontoPage ──────────────────────────────────────────────────

export function GuardianPortalKontoPage() {
  const session    = useGuardianSession();
  const { data: me, isLoading, isError } = useGuardianMe();
  const updateMut  = useUpdateGuardianMe();

  const [editing,   setEditing]   = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [saved,     setSaved]     = useState(false);

  function startEdit() {
    if (!me) return;
    setFirstName(me.guardian.first_name);
    setLastName(me.guardian.last_name);
    setPhone(me.guardian.phone ?? '');
    setEditing(true);
    setSaved(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function handleSave() {
    if (!me) return;
    const updates: { first_name?: string; last_name?: string; phone?: string | null } = {};
    if (firstName.trim() && firstName.trim() !== me.guardian.first_name) updates.first_name = firstName.trim();
    if (lastName.trim() && lastName.trim() !== me.guardian.last_name)    updates.last_name  = lastName.trim();
    const cleanPhone = phone.trim() || null;
    if (cleanPhone !== (me.guardian.phone ?? null))                       updates.phone      = cleanPhone;

    if (Object.keys(updates).length === 0) { setEditing(false); return; }

    updateMut.mutate(updates, {
      onSuccess: () => {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      },
    });
  }

  function handleLogout() {
    clearGuardianSession();
    window.location.href = '/guardian';
  }

  const expiresAt       = new Date(session.expires_at);
  const expiryDaysLeft  = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  const expiryFormatted = expiresAt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  const expirySoon      = expiryDaysLeft > 0 && expiryDaysLeft <= 7;
  const expiryExpired   = expiryDaysLeft <= 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-600">Kunde inte hämta kontoinformation.</p>
      </div>
    );
  }

  const guardian = me.guardian;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: BRAND }}>Mitt konto</p>
        <p className="text-xs text-gray-400">Hantera dina uppgifter och din åtkomst till Föräldraskollen.</p>
      </div>

      {/* Save confirmation */}
      {saved && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-2xl">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-700">Uppgifter sparade.</p>
        </div>
      )}

      {/* Error from mutation */}
      {updateMut.isError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">
            {updateMut.error instanceof Error ? updateMut.error.message : 'Kunde inte spara uppgifter.'}
          </p>
        </div>
      )}

      {/* Contact info card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Kontaktuppgifter</span>
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Redigera
            </button>
          )}
        </div>

        {editing ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Förnamn</label>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-xl border border-input bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Efternamn</label>
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-xl border border-input bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Telefon</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                type="tel"
                placeholder="+46 70 000 00 00"
                className="w-full h-9 px-3 text-sm rounded-xl border border-input bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={updateMut.isPending || !firstName.trim() || !lastName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-colors"
                style={{ background: BRAND }}
              >
                <Check className="w-3.5 h-3.5" />
                {updateMut.isPending ? 'Sparar...' : 'Spara'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={updateMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            <InfoRow icon={User} label="Namn" value={`${guardian.first_name} ${guardian.last_name}`} />
            <InfoRow icon={Mail} label="E-post" value={guardian.email} note="Kontakta trafikskolan för att ändra e-post." />
            <InfoRow icon={Phone} label="Telefon" value={guardian.phone ?? '—'} />
            {guardian.relation && (
              <InfoRow icon={Shield} label="Relation" value={guardian.relation} />
            )}
          </div>
        )}
      </div>

      {/* Student info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
          <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Elev</span>
        </div>
        <div className="divide-y divide-gray-50">
          <InfoRow
            icon={User}
            label="Namn"
            value={`${me.student.first_name} ${me.student.last_name}`}
          />
          {me.student.target_licence_category && (
            <InfoRow
              icon={Shield}
              label="Körkortsbehörighet"
              value={`Behörighet ${me.student.target_licence_category}`}
            />
          )}
          <InfoRow
            icon={Shield}
            label="Din åtkomst"
            value={guardian.can_pay ? 'Kontakt + Ekonomi' : 'Kontakt'}
          />
        </div>
      </div>

      {/* Session info */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Session</p>
        <p className="text-xs text-gray-500">
          Inloggad som <span className="font-medium text-gray-700">{session.guardian_name}</span>
        </p>
        <p className={cn('text-xs', expirySoon ? 'text-amber-600' : expiryExpired ? 'text-red-600' : 'text-gray-500')}>
          Åtkomst giltig till{' '}
          <span className={cn(
            'font-medium',
            expirySoon ? 'text-amber-700' : expiryExpired ? 'text-red-700' : 'text-gray-700',
          )}>
            {expiryFormatted}
          </span>
        </p>
        {expirySoon && (
          <>
            <p className="text-[10px] text-amber-600">
              ⚠ Länken går ut om {expiryDaysLeft} dag{expiryDaysLeft > 1 ? 'ar' : ''} — kontakta skolan för förnyelse.
            </p>
            {me.organization.email && (
              <a
                href={`mailto:${me.organization.email}?subject=${encodeURIComponent(
                  `Ny åtkomst till Föräldraskollen — ${me.student.first_name} ${me.student.last_name}`
                )}&body=${encodeURIComponent('Hej,\n\nMin åtkomstlänk till Föräldraskollen håller på att gå ut. Kan ni skicka en ny länk?\n\nMed vänliga hälsningar')}`}
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 underline hover:text-amber-800"
              >
                <Mail className="w-3 h-3" />
                Begär ny länk via e-post
              </a>
            )}
          </>
        )}
        {expiryExpired && (
          <p className="text-[10px] text-red-600">
            Länken har gått ut — kontakta trafikskolan för ny åtkomst.
          </p>
        )}
        <p className="text-[10px] text-gray-400">
          Åtkomstlänkar är personliga och ska inte delas med andra.
        </p>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 px-4',
          'rounded-2xl border border-red-100 bg-red-50 text-red-600',
          'text-sm font-semibold hover:bg-red-100 transition-colors',
        )}
      >
        <LogOut className="w-4 h-4" />
        Logga ut ur Föräldraskollen
      </button>

    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon:   React.ElementType;
  label:  string;
  value:  string;
  note?:  string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 font-medium mt-0.5 break-words">{value}</p>
        {note && <p className="text-[10px] text-gray-400 mt-0.5">{note}</p>}
      </div>
    </div>
  );
}
