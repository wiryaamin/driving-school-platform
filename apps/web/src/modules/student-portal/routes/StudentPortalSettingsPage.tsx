import { useState } from 'react';
import {
  User, GraduationCap, Flag, Camera,
  Lock, Sun, Moon, Monitor, ChevronRight, AlertTriangle,
  CheckCircle2, ClipboardCheck, Star, BookOpen, Award, Bell, BellOff,
} from 'lucide-react';
import { usePortalMe, useRegisterPushToken } from '../hooks/useStudentPortal.js';
import { usePortalSession } from './StudentPortalLayout.js';
import { usePushSubscription } from '@shared/hooks/usePushSubscription.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsTab = 'allmant' | 'utbildning' | 'rapporter';
type ThemeMode   = 'system' | 'dark' | 'light';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THEME_KEY = 'portal_theme_mode';

function loadTheme(): ThemeMode {
  try { return (localStorage.getItem(THEME_KEY) as ThemeMode) ?? 'system'; } catch { return 'system'; }
}
function saveTheme(m: ThemeMode) {
  try { localStorage.setItem(THEME_KEY, m); } catch { /* ignore */ }
}

const PERMIT_LABELS: Record<string, string> = {
  learner:   'Elev (aktiv)',
  risk1:     'Risk 1 genomförd',
  risk2:     'Risk 2 genomförd',
  theory:    'Teoriprovet godkänt',
  practical: 'Uppkörning godkänd',
  licensed:  'Körkort klart',
};

const PERMIT_STEPS = [
  { key: 'learner',   label: 'Påbörjad utbildning' },
  { key: 'risk1',     label: 'Risk 1' },
  { key: 'risk2',     label: 'Risk 2' },
  { key: 'theory',    label: 'Teoriprov' },
  { key: 'practical', label: 'Uppkörning' },
  { key: 'licensed',  label: 'Körkort' },
];

function stageIndex(stage: string | null | undefined): number {
  if (!stage) return 0;
  return PERMIT_STEPS.findIndex(s => s.key === stage);
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide mb-3">
      {children}
    </p>
  );
}

// ─── Info row (read-only field) ───────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-gray-50 last:border-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value ?? '—'}</p>
    </div>
  );
}

// ─── Theme card ───────────────────────────────────────────────────────────────

const THEME_DOTS: Record<ThemeMode, string[]> = {
  system: ['#0f172a', '#1e3a5f', '#684EFF', '#94a3b8', '#e2e8f0'],
  dark:   ['#000000', '#1a1a2e', '#16213e', '#0f3460', '#684EFF'],
  light:  ['#ffffff', '#f0f4f8', '#dbeafe', '#93c5fd', '#684EFF'],
};

function ThemeCard({
  mode, label, Icon, selected, onSelect,
}: {
  mode:     ThemeMode;
  label:    string;
  Icon:     React.ElementType;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left',
        selected
          ? 'border-[#684EFF] bg-blue-50'
          : 'border-gray-100 bg-white hover:border-gray-200',
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        selected ? 'bg-[#684EFF]' : 'bg-gray-100',
      )}>
        <Icon className={cn('w-5 h-5', selected ? 'text-white' : 'text-gray-500')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', selected ? 'text-[#684EFF]' : 'text-gray-800')}>{label}</p>
        <div className="flex items-center gap-1 mt-1.5">
          {THEME_DOTS[mode].map((color, i) => (
            <span
              key={i}
              className="w-4 h-4 rounded-full border border-white shadow-sm shrink-0"
              style={{ background: color }}
            />
          ))}
        </div>
      </div>
      {selected && <CheckCircle2 className="w-5 h-5 text-[#684EFF] shrink-0" />}
    </button>
  );
}

// ─── Notifications card ───────────────────────────────────────────────────────

const PUSH_STATUS_LABEL: Record<string, string> = {
  not_configured: 'Push-notiser är inte tillgängliga just nu',
  unsupported:    'Din webbläsare stöder inte push-notiser',
  denied:         'Du har blockerat notiser för denna webbläsare',
  registering:    'Aktiverar...',
  error:          'Något gick fel — försök igen',
};

function NotificationsCard() {
  const registerMutation = useRegisterPushToken();
  const { status, error, subscribe } = usePushSubscription({
    storageNamespace: 'student-portal',
    register: (input) => registerMutation.mutateAsync(input),
  });

  const isGranted = status === 'granted';
  const canEnable = status === 'default' || status === 'error';

  return (
    <div>
      <SectionHeading>Notiser</SectionHeading>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            isGranted ? 'bg-green-100' : 'bg-gray-100',
          )}>
            {isGranted ? <Bell className="w-5 h-5 text-green-600" /> : <BellOff className="w-5 h-5 text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Push-notiser</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isGranted
                ? 'Aktiverade för denna enhet — du får notiser om lektioner och bokningar.'
                : (PUSH_STATUS_LABEL[status] ?? 'Få notiser om bokningar och påminnelser direkt i webbläsaren.')}
            </p>
          </div>
          {canEnable && (
            <button
              onClick={() => void subscribe()}
              className="text-xs font-semibold text-[#684EFF] px-3 py-1.5 rounded-full border border-[#684EFF]/30 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0"
            >
              Aktivera
            </button>
          )}
        </div>
        {error && (
          <div className="px-4 py-2.5 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Allmänt tab ──────────────────────────────────────────────────────────────

function AllmantTab() {
  const session  = usePortalSession();
  const { data: me, isLoading } = usePortalMe();
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);

  const initials = session.student_name
    .split(' ')
    .map(w => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function selectTheme(m: ThemeMode) {
    setTheme(m);
    saveTheme(m);
  }

  return (
    <div className="space-y-6">

      {/* Personal information */}
      <div>
        <SectionHeading>Personlig information ({session.organization_name})</SectionHeading>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Avatar */}
          <div className="flex flex-col items-center pt-6 pb-4 border-b border-gray-50 gap-3">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm"
              style={{ background: 'linear-gradient(135deg, #684EFF 0%, #0d48b2 100%)' }}
            >
              {initials}
            </div>
            <button className="flex items-center gap-2 text-xs font-semibold text-[#684EFF] px-4 py-1.5 rounded-full border border-[#684EFF]/30 bg-blue-50 hover:bg-blue-100 transition-colors">
              <Camera className="w-3.5 h-3.5" />
              Byt profilbild
            </button>
          </div>

          {/* Fields */}
          {isLoading ? (
            <div className="px-5 space-y-3 py-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="px-5">
              <InfoRow label="Personnummer" value={me?.personnummer ?? '—'} />
              <InfoRow label="Förnamn"      value={me?.first_name ?? session.student_name.split(' ')[0]} />
              <InfoRow label="Efternamn"    value={me?.last_name  ?? session.student_name.split(' ').slice(1).join(' ')} />
              <InfoRow label="E-postadress" value={me?.email} />
              <InfoRow label="Telefonnummer" value={me?.phone} />
              <InfoRow label="Adress"       value={me?.address_line1} />
              <InfoRow label="Postnummer"   value={me?.postal_code} />
              <InfoRow label="Stad"         value={me?.city} />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Kontakta {session.organization_name} för att uppdatera personuppgifter.
        </p>
      </div>

      {/* Appearance */}
      <div>
        <SectionHeading>Utseende</SectionHeading>
        <div className="space-y-2">
          <ThemeCard mode="system" label="Systempreferens" Icon={Monitor} selected={theme === 'system'} onSelect={() => selectTheme('system')} />
          <ThemeCard mode="dark"   label="Mörk"            Icon={Moon}    selected={theme === 'dark'}   onSelect={() => selectTheme('dark')}   />
          <ThemeCard mode="light"  label="Ljus"            Icon={Sun}     selected={theme === 'light'}  onSelect={() => selectTheme('light')}  />
        </div>
      </div>

      {/* Notifications */}
      <NotificationsCard />

      {/* Security */}
      <div>
        <SectionHeading>Säkerhet</SectionHeading>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 p-4 border-b border-gray-50">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Byt lösenord</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Kontakta din trafikskola för att uppdatera dina inloggningsuppgifter.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
          <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                Portalen öppnas via en personlig länk från trafikskolan. Ny länk skickas på begäran.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Utbildning tab ───────────────────────────────────────────────────────────

function UtbildningTab() {
  const { data: me, isLoading } = usePortalMe();
  const stage = me?.permit_stage ?? null;
  const currentIdx = stageIndex(stage);

  return (
    <div className="space-y-6">

      {/* Licence category */}
      <div>
        <SectionHeading>Körkortstyp</SectionHeading>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {isLoading ? (
            <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                <Award className="w-7 h-7 text-[#684EFF]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {me?.target_licence_category?.toUpperCase() ?? 'B'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Körkortsbehörighet</p>
              </div>
              {stage && (
                <span className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-[#684EFF] border border-blue-100">
                  {PERMIT_LABELS[stage] ?? stage}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress steps */}
      <div>
        <SectionHeading>Utbildningssteg</SectionHeading>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {PERMIT_STEPS.map((step, i) => {
            const done    = i < currentIdx;
            const current = i === currentIdx;
            return (
              <div
                key={step.key}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0',
                  current ? 'bg-blue-50' : '',
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                  done    ? 'bg-green-500 text-white' :
                  current ? 'bg-[#684EFF] text-white' :
                            'bg-gray-100 text-gray-400',
                )}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <p className={cn(
                  'text-sm font-medium flex-1',
                  done    ? 'text-gray-500 line-through' :
                  current ? 'text-[#684EFF] font-semibold' :
                            'text-gray-400',
                )}>
                  {step.label}
                </p>
                {current && (
                  <span className="text-[10px] font-bold text-[#684EFF] bg-blue-100 px-2 py-0.5 rounded-full">
                    Nu
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Study resources */}
      <div>
        <SectionHeading>Studiematerial</SectionHeading>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {[
            { icon: BookOpen, label: 'Läs teoriböcker',    sub: 'Tillgängligt i Läsa-sektionen',        to: '/portal/material', color: 'bg-amber-100 text-amber-600' },
            { icon: Star,     label: 'Öva teorifrågor',    sub: 'Quiz och körkortstest',                to: '/portal/teori',    color: 'bg-purple-100 text-purple-600' },
            { icon: ClipboardCheck, label: 'Följ framsteg', sub: 'Se dina lektionskommentarer',         to: '/portal/framsteg', color: 'bg-teal-100 text-teal-600' },
          ].map(({ icon: Icon, label, sub, color }) => (
            <div key={label} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', color)}>
                <Icon className="w-4.5 h-4.5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Rapporter tab ────────────────────────────────────────────────────────────

function RapporterTab() {
  const session = usePortalSession();

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Dina rapporter</SectionHeading>

        {/* Empty state */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900">Du har inga rapporter att granska</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Här kommer du kunna se feedback från {session.organization_name} om din körutbildning.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What reports are */}
      <div>
        <SectionHeading>Om rapporter</SectionHeading>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {[
            { icon: ClipboardCheck, label: 'Lektionskommentarer', sub: 'Feedback från din instruktör efter varje lektion' },
            { icon: Star,           label: 'Bedömningar',         sub: 'Din instruktörs bedömning av dina körfärdigheter' },
            { icon: CheckCircle2,   label: 'Godkännanden',        sub: 'Moment som din instruktör har godkänt' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center pb-2">
        Rapporter skickas av {session.organization_name} efter dina lektioner.
      </p>
    </div>
  );
}

// ─── StudentPortalSettingsPage ────────────────────────────────────────────────

const TABS: { key: SettingsTab; label: string; Icon: React.ElementType }[] = [
  { key: 'allmant',    label: 'Allmänt',    Icon: User           },
  { key: 'utbildning', label: 'Utbildning', Icon: GraduationCap  },
  { key: 'rapporter',  label: 'Rapporter',  Icon: Flag           },
];

export function StudentPortalSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('allmant');

  return (
    <div className="space-y-0">

      {/* Page header */}
      <div className="mb-5">
        <p className="text-[#684EFF] text-[10px] font-bold uppercase tracking-widest">INSTÄLLNINGAR</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
          {activeTab === 'allmant'    ? 'Allmänt'    :
           activeTab === 'utbildning' ? 'Utbildning' :
                                       'Rapporter'}
        </h1>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-100">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors',
              activeTab === key
                ? 'border-[#684EFF] text-[#684EFF]'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            <Icon className="w-4 h-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'allmant'    && <AllmantTab />}
      {activeTab === 'utbildning' && <UtbildningTab />}
      {activeTab === 'rapporter'  && <RapporterTab />}
    </div>
  );
}
