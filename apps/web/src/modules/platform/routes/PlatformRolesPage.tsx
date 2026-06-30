import { Shield, Users, CheckCircle } from 'lucide-react';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformAdminsDetail } from '../hooks/usePlatformOpsCenter.js';

// ─── Static role catalog ──────────────────────────────────────────────────────

interface RoleDef {
  key:         string;
  label:       string;
  description: string;
  permissions: string[];
  colorClass:  string;
}

const PLATFORM_ROLES: RoleDef[] = [
  {
    key:         'platform_superadmin',
    label:       'Super Admin',
    description: 'Fullständig kontroll över hela plattformen. Kan hantera alla administratörer, organisationer och systeminställningar.',
    permissions: [
      'Alla administratörsrättigheter',
      'Hantera plattformsadmins',
      'Stänga av och ta bort organisationer',
      'Ändra abonnemangsplaner',
      'Fullständig granskningslogg',
      'Systemkonfiguration',
    ],
    colorClass: 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10',
  },
  {
    key:         'platform_admin',
    label:       'Platform Admin',
    description: 'Bred administrativ åtkomst. Hanterar organisationer, prenumerationer och plattformsöversikt. Kan inte hantera andra admins.',
    permissions: [
      'Hantera organisationer',
      'Hantera prenumerationer',
      'Support Workspace',
      'Granskningslogg (läsbehörighet)',
      'Säkerhetshändelser (läsbehörighet)',
      'Plattformsdashboard',
    ],
    colorClass: 'border-purple-200 bg-purple-50 dark:border-purple-900/40 dark:bg-purple-900/10',
  },
  {
    key:         'platform_support',
    label:       'Support',
    description: 'Läsbehörighet till organisations- och användardata för kundsupport. Kan inte ändra abonnemang eller roller.',
    permissions: [
      'Organisationsöversikt (läsbehörighet)',
      'Support Workspace',
      'Prenumerationsöversikt (läsbehörighet)',
      'Granskningslogg (begränsad)',
    ],
    colorClass: 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10',
  },
  {
    key:         'platform_billing',
    label:       'Billing',
    description: 'Fakturerings- och abonnemangshantering. Ser finansiella uppgifter och prenumerationsstatus utan tillgång till organisationsdata.',
    permissions: [
      'Prenumerationsöversikt',
      'Abonnemangsändringar',
      'Faktureringsinformation',
      'Ekonomiska rapporter',
    ],
    colorClass: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10',
  },
  {
    key:         'platform_read_only',
    label:       'Read Only',
    description: 'Läsbehörighet till plattformsdashboard och organisationsöversikt. Ingen ändringsbehörighet.',
    permissions: [
      'Plattformsdashboard (läsbehörighet)',
      'Organisationslista (läsbehörighet)',
    ],
    colorClass: 'border-gray-200 bg-gray-50 dark:border-gray-700/40 dark:bg-gray-800/10',
  },
];

const ROLE_BADGE_CLASS: Record<string, string> = {
  platform_superadmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  platform_admin:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  platform_support:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  platform_billing:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  platform_read_only:  'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformRolesPage() {
  const { data: admins } = usePlatformAdminsDetail();

  function activeCountFor(roleKey: string) {
    return (admins ?? []).filter(a => a.role === roleKey && a.is_active).length;
  }

  return (
    <PageLayout>
      <PageHeader
        title="Plattformsroller"
        description="Definitioner och behörigheter för plattformsadministratörsroller"
      />

      <div className="space-y-4">
        {PLATFORM_ROLES.map(role => {
          const count = activeCountFor(role.key);
          return (
            <div
              key={role.key}
              className={`rounded-xl border p-5 ${role.colorClass}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-background/80 flex items-center justify-center shrink-0 border border-border/60">
                    <Shield className="w-4.5 h-4.5 text-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{role.label}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_BADGE_CLASS[role.key]}`}>
                        {role.key}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">{role.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
                  <span className="text-xs text-muted-foreground">aktiva</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {role.permissions.map(perm => (
                  <div key={perm} className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-foreground/50 shrink-0" />
                    <span className="text-xs text-foreground/80">{perm}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Obs:</span>{' '}
          Rolltilldelning sker via direkt databasoperation (bootstrap SQL).
          Hantering av plattformsadministratörer via UI implementeras i en framtida fas.
          Alla rollkontroller sker via JWT-claims vid inloggning.
        </p>
      </div>
    </PageLayout>
  );
}
