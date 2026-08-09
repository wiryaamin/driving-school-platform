import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight, Rocket, PartyPopper } from 'lucide-react';
import { Card, CardContent, Button, Badge, PageHeader, LoadingState } from '@platform/ui';
import {
  useOnboardingProgress, type OnboardingStep, type OnboardingStepCategory,
} from '../hooks/useTenantOnboarding.js';

// ─── Step presentation metadata ───────────────────────────────────────────────
// Purely presentational — every step's actual completion status comes from
// the tenant-onboarding Edge Function, which reads the owning module
// directly (Architecture Section 8). This map only supplies the Swedish
// label and the link to the owning module's real page. No step here has an
// action — every step is a pure, live-derived read (Architecture Section 8's
// second refinement note: Tenant Onboarding persists nothing except Go Live).

interface StepAction {
  labelIncomplete: string;
  labelComplete:   string;
  path:            string;
  // Reads this step's `detail` payload to show its own sub-status (✓/○) —
  // e.g. { vehicles: number, instructors: number } for vehicles_instructors —
  // so a combined requirement can still show which specific half is done.
  doneWhen?: (detail: Record<string, unknown>) => boolean;
}

interface StepMeta {
  title:                 string;
  // Shown while the step hasn't been completed yet — describes what to set up.
  descriptionIncomplete: string;
  // Shown once the step is "Klar" — reframes the same card as a maintenance
  // entry point (review/edit) instead of repeating first-time setup copy.
  descriptionComplete:   string;
  linkPath?:             string;
  linkLabelIncomplete?:  string;
  linkLabelComplete?:    string;
  // Set only when a single requirement spans more than one destination page
  // (e.g. "Fordon & lärare" needs both /resources and /instructors) — the
  // underlying requirement stays a single step, this only clarifies where
  // to go for each half. Takes precedence over linkPath/linkLabel when set.
  actions?: StepAction[];
}

const STEP_META: Record<string, StepMeta> = {
  organization_profile: {
    title: 'Organisationsprofil',
    descriptionIncomplete: 'Fyll i juridiskt namn och organisationsnummer i företagsuppgifterna.',
    descriptionComplete:   'Granska eller ändra juridiskt namn och organisationsnummer i företagsuppgifterna.',
    linkPath: '/settings/company',
    linkLabelIncomplete: 'Gå till Företagsuppgifter', linkLabelComplete: 'Granska företagsuppgifter',
  },
  locations: {
    title: 'Filialer',
    descriptionIncomplete: 'Lägg till er första filial.',
    descriptionComplete:   'Granska era filialer eller lägg till fler.',
    linkPath: '/settings/locations',
    linkLabelIncomplete: 'Gå till Filialer', linkLabelComplete: 'Hantera filialer',
  },
  booking_configuration: {
    title: 'Bokningsinställningar',
    descriptionIncomplete: 'Sätt pris på minst en lektionstyp — annars kan ingen elev bokas eller debiteras.',
    descriptionComplete:   'Granska eller uppdatera priser på era lektionstyper.',
    linkPath: '/settings/finance/lesson-types',
    linkLabelIncomplete: 'Gå till Lektionstyper', linkLabelComplete: 'Hantera lektionstyper',
  },
  vehicles_instructors: {
    title: 'Fordon & lärare',
    descriptionIncomplete: 'Registrera minst ett fordon och en lärare — två separata sidor, båda krävs.',
    descriptionComplete:   'Granska era fordon och lärare, eller lägg till fler.',
    actions: [
      {
        labelIncomplete: 'Lägg till fordon', labelComplete: 'Granska fordon',
        path: '/resources', doneWhen: (d) => Number(d['vehicles'] ?? 0) >= 1,
      },
      {
        labelIncomplete: 'Lägg till lärare', labelComplete: 'Granska lärare',
        path: '/instructors', doneWhen: (d) => Number(d['instructors'] ?? 0) >= 1,
      },
    ],
  },
  finance_configuration: {
    title: 'Ekonomiinställningar',
    descriptionIncomplete: 'Skapa kontoplan och en aktuell momsperiod.',
    descriptionComplete:   'Granska er kontoplan och momsperioder.',
    linkPath: '/finance/settings',
    linkLabelIncomplete: 'Gå till Ekonomiinställningar', linkLabelComplete: 'Hantera ekonomiinställningar',
  },
  communication_configuration: {
    title: 'Kommunikationsinställningar',
    descriptionIncomplete: 'Aktivera minst en kommunikationskanal.',
    descriptionComplete:   'Granska eller ändra era kommunikationskanaler.',
    linkPath: '/communication/settings',
    linkLabelIncomplete: 'Gå till Kanalinställningar', linkLabelComplete: 'Hantera kanalinställningar',
  },
  business_discovery: {
    title: 'Berätta om er verksamhet',
    descriptionIncomplete: 'Svara på några frågor om er trafikskola så konfigurerar Trafikcloud automatiskt det som går — till exempel lektionstyper för era behörigheter.',
    descriptionComplete:   'Er verksamhetsprofil är sparad. Uppdatera den om er verksamhet förändras.',
    linkPath: '/setup/business-discovery',
    linkLabelIncomplete: 'Berätta om er verksamhet', linkLabelComplete: 'Granska verksamhetsprofil',
  },
  staff_invitations: {
    title: 'Bjud in personal',
    descriptionIncomplete: 'Bjud in ytterligare personal till organisationen, om er skola har fler än en operatör.',
    descriptionComplete:   'Granska era användare eller bjud in fler medarbetare.',
    linkPath: '/settings/users',
    linkLabelIncomplete: 'Gå till Användare', linkLabelComplete: 'Hantera användare',
  },
  data_migration: {
    title: 'Dataimport',
    descriptionIncomplete: 'Importera data från ert tidigare system, om ni har sådan att föra över.',
    descriptionComplete:   'Granska er genomförda dataimport.',
    linkPath: '/settings/data-migration',
    linkLabelIncomplete: 'Gå till Dataimport', linkLabelComplete: 'Visa dataimport',
  },
  slot_generation: {
    title: 'Generera bokningsbara pass',
    descriptionIncomplete: 'Passmallar och lektionstyper är inte samma sak som riktiga lediga tider — generera bokningsbara pass så att elever och personal kan börja boka.',
    descriptionComplete:   'Bokningsbara pass finns framåt i tiden. Generera fler när det behövs.',
    linkPath: '/scheduling/generation',
    linkLabelIncomplete: 'Generera pass', linkLabelComplete: 'Hantera passgenerering',
  },
};

const CATEGORY_META: Record<Exclude<OnboardingStepCategory, 'system'>, { title: string; description: string }> = {
  go_live_requirement: {
    title: 'Krav för driftsättning',
    description: 'Dessa steg måste vara klara innan Trafikcloud kan godkänna driftsättning.',
  },
  recommended_configuration: {
    title: 'Rekommenderad konfiguration',
    description: 'Valfritt — relevant för de flesta skolor, men blockerar aldrig driftsättning.',
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TenantOnboardingPage() {
  const { data: progress, isLoading } = useOnboardingProgress();

  if (isLoading || !progress) {
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  }

  const requirementSteps = progress.steps.filter((s) => s.category === 'go_live_requirement');
  const recommendedSteps = progress.steps.filter((s) => s.category === 'recommended_configuration');
  const completedCount = requirementSteps.filter((s) => s.status === 'completed').length;
  const totalCount = requirementSteps.length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Kom igång med Trafikcloud"
        description={`${progress.organization.name} — ${completedCount} av ${totalCount} krav klara`}
      />

      {progress.is_live ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <PartyPopper className="w-10 h-10 text-primary" />
            <p className="text-lg font-semibold">Er skola är live!</p>
            <p className="text-sm text-muted-foreground">Installationen är klar och godkänd av Trafikcloud.</p>
          </CardContent>
        </Card>
      ) : progress.ready_for_go_live ? (
        <Card>
          <CardContent className="py-6 flex items-center gap-3">
            <Rocket className="w-6 h-6 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">Alla krav är klara</p>
              <p className="text-sm text-muted-foreground">Trafikcloud granskar och godkänner driftsättning inom kort.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <StepSection category="go_live_requirement" steps={requirementSteps} />
      <StepSection category="recommended_configuration" steps={recommendedSteps} />
    </div>
  );
}

// ─── Step section ─────────────────────────────────────────────────────────────

function StepSection({
  category, steps,
}: {
  category: Exclude<OnboardingStepCategory, 'system'>;
  steps:    OnboardingStep[];
}) {
  const meta = CATEGORY_META[category];
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{meta.title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
      </div>
      {steps.map((step) => <StepCard key={step.key} step={step} optional={category === 'recommended_configuration'} />)}
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, optional }: { step: OnboardingStep; optional: boolean }) {
  const meta = STEP_META[step.key];
  if (!meta) return null;
  const isComplete = step.status === 'completed';

  return (
    <Card>
      <CardContent className="py-4 flex items-start gap-3">
        {isComplete
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-0.5" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{meta.title}</p>
            <Badge variant={isComplete ? 'default' : 'secondary'}>
              {isComplete ? 'Klar' : optional ? 'Valfritt' : 'Kvarstår'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isComplete ? meta.descriptionComplete : meta.descriptionIncomplete}
          </p>

          {meta.actions ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {meta.actions.map((action) => {
                const actionDone = action.doneWhen?.(step.detail) ?? false;
                return (
                  <Button key={action.path} asChild variant="outline" size="sm">
                    <Link to={action.path}>
                      {actionDone
                        ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                        : <Circle className="w-3.5 h-3.5 mr-1.5 text-muted-foreground/40" />}
                      {actionDone ? action.labelComplete : action.labelIncomplete}
                    </Link>
                  </Button>
                );
              })}
            </div>
          ) : meta.linkPath && (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to={meta.linkPath}>
                {isComplete ? meta.linkLabelComplete : meta.linkLabelIncomplete}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
