import { CheckCircle2, Bell, BellOff } from 'lucide-react';
import { useState } from 'react';
import { useInstructorPortalSession } from './InstructorPortalLayout.js';
import { useInstructorPortalMe, useRegisterInstructorPushToken, useRevokeInstructorPushToken } from '../hooks/useInstructorPortal.js';
import { usePushSubscription } from '@shared/hooks/usePushSubscription.js';
import { useUiStore } from '@core/store/ui.store.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

const PUSH_STATUS_LABEL: Record<string, string> = {
  not_configured: 'Push-notiser är inte tillgängliga just nu',
  unsupported:    'Din webbläsare stöder inte push-notiser',
  denied:         'Du har blockerat notiser för denna webbläsare',
  registering:    'Aktiverar...',
  error:          'Något gick fel — försök igen',
};

function InstructorNotificationsCard() {
  const registerMutation = useRegisterInstructorPushToken();
  const revokeMutation   = useRevokeInstructorPushToken();
  const { status, error, subscribe, unsubscribe } = usePushSubscription({
    storageNamespace: 'instructor-portal',
    register:   (input) => registerMutation.mutateAsync(input),
    unregister: (tokenId) => revokeMutation.mutateAsync(tokenId),
  });

  const isGranted = status === 'granted';
  const canEnable = status === 'default' || status === 'error';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', isGranted ? 'bg-green-100' : 'bg-gray-100')}>
          {isGranted ? <Bell className="w-5 h-5 text-green-600" /> : <BellOff className="w-5 h-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Push-notiser</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isGranted ? 'Aktiverade för denna enhet.' : (PUSH_STATUS_LABEL[status] ?? 'Få notiser om bokningar och schema.')}
          </p>
        </div>
        {canEnable && (
          <button
            onClick={() => void subscribe()}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border hover:bg-blue-50 transition-colors shrink-0"
            style={{ color: BRAND, borderColor: `${BRAND}40` }}
          >
            Aktivera
          </button>
        )}
        {isGranted && (
          <button
            onClick={() => void unsubscribe()}
            className="text-xs font-semibold text-gray-500 px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
          >
            Inaktivera
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </div>
  );
}

type Tab       = 'allmant' | 'utseende';
// P2-3: this used to write 'instructor_portal_theme_mode' to localStorage —
// a key nothing else in the app reads, so picking a theme here had zero
// visible effect. Wired to the real app-wide useUiStore/ThemeProvider theme
// instead (the same one used elsewhere in the app), which only supports
// 'light'/'dark' — the "Systempreferens" card is dropped rather than kept as
// a third option the store can't represent.
type ThemeMode = 'dark' | 'light';

const THEME_CARDS: { key: ThemeMode; label: string; dots: string[] }[] = [
  {
    key: 'dark',
    label: 'Mörk',
    dots: ['#000000', '#0a1628', '#0d3080', '#1055C9', '#4a8aff'],
  },
  {
    key: 'light',
    label: 'Ljus',
    dots: ['#ffffff', '#f0f4f8', '#dbeafe', '#93c5fd', '#1055C9'],
  },
];

function ThemeCard({
  mode: _mode,
  label,
  dots,
  selected,
  onSelect,
}: {
  mode:     ThemeMode;
  label:    string;
  dots:     string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-2xl border-2 p-3 transition-all flex flex-col items-center gap-2',
        selected ? 'border-[#1055C9] bg-blue-50' : 'border-gray-100 bg-white',
      )}
    >
      <div className="flex gap-1">
        {dots.map((c, i) => (
          <div key={i} className="w-4 h-4 rounded-full" style={{ background: c }} />
        ))}
      </div>
      <p className={cn('text-xs font-semibold', selected ? 'text-[#1055C9]' : 'text-gray-800')}>{label}</p>
      {selected && <CheckCircle2 className="w-4 h-4 text-[#1055C9]" />}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value || '—'}</p>
    </div>
  );
}

export function InstructorPortalInstallningarPage() {
  const session  = useInstructorPortalSession();
  const { data: me } = useInstructorPortalMe();

  const [activeTab, setActiveTab] = useState<Tab>('allmant');
  const { theme, setTheme } = useUiStore();

  const TABS: { key: Tab; label: string }[] = [
    { key: 'allmant',  label: 'Allmänt'  },
    { key: 'utseende', label: 'Utseende' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND }}>
          INSTÄLLNINGAR
        </p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">
          {activeTab === 'allmant' ? 'Allmänt' : 'Utseende'}
        </h1>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
              activeTab === key
                ? 'border-[#1055C9] text-[#1055C9]'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Allmänt tab */}
      {activeTab === 'allmant' && (
        <div className="space-y-4">
          {/* Profile */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-white text-xl font-bold"
                style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #0d48b2 100%)` }}
              >
                {(session.instructor_name ?? 'L')[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-gray-900">{session.instructor_name}</p>
              </div>
            </div>

            <InfoRow label="Förnamn"       value={me?.first_name ?? session.instructor_name.split(' ')[0] ?? ''} />
            <InfoRow label="Efternamn"     value={me?.last_name  ?? session.instructor_name.split(' ').slice(1).join(' ') ?? ''} />
            <InfoRow label="E-post"        value={me?.email ?? ''} />
            <InfoRow label="Telefon"       value={me?.phone ?? ''} />
            <InfoRow label="Anställning"   value={me?.employment_type ?? ''} />
            <InfoRow label="Kategorier"    value={(me?.teaching_categories ?? []).join(', ')} />
            <InfoRow label="Talade språk"  value={(me?.languages_spoken ?? []).join(', ')} />
            <InfoRow label="Trafikskola"   value={session.organization_name} />
          </div>

          {/* Notifications */}
          <InstructorNotificationsCard />

          {/* Security note */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-800 mb-1.5">Inloggning & säkerhet</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Din inloggning sker via en engångslänk skickad av trafikskolan.
              Kontakta administratören om du behöver en ny inloggningslänk.
            </p>
          </div>
        </div>
      )}

      {/* Utseende tab */}
      {activeTab === 'utseende' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
          <p className="text-sm font-semibold text-gray-800">Temainställning</p>
          <div className="flex gap-2">
            {THEME_CARDS.map(({ key, label, dots }) => (
              <ThemeCard
                key={key}
                mode={key}
                label={label}
                dots={dots}
                selected={theme === key}
                onSelect={() => setTheme(key)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Temat gäller i hela appen och sparas på denna enhet.
          </p>
        </div>
      )}
    </div>
  );
}
