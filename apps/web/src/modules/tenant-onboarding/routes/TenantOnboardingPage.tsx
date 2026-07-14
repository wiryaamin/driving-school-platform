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

interface StepMeta {
  title:       string;
  description: string;
  linkPath?:   string;
  linkLabel?:  string;
}

const STEP_META: Record<string, StepMeta> = {
  organization_profile: {
    title: 'Organisationsprofil',
    description: 'Fyll i juridiskt namn och organisationsnummer i företagsuppgifterna.',
    linkPath: '/settings/company', linkLabel: 'Gå till Företagsuppgifter',
  },
  locations: {
    title: 'Filialer',
    description: 'Lägg till er första filial.',
    linkPath: '/settings/locations', linkLabel: 'Gå till Filialer',
  },
  booking_configuration: {
    title: 'Bokningsinställningar',
    description: 'Skapa minst en passmall eller lektionstyp innan ni kan ta emot riktiga bokningar.',
    linkPath: '/scheduling/mallar', linkLabel: 'Gå till Passmallar',
  },
  vehicles_instructors: {
    title: 'Fordon & lärare',
    description: 'Registrera minst ett fordon och en lärare.',
    linkPath: '/resources', linkLabel: 'Gå till Fordon & Platser',
  },
  finance_configuration: {
    title: 'Ekonomiinställningar',
    description: 'Skapa kontoplan och en aktuell momsperiod.',
    linkPath: '/finance/settings', linkLabel: 'Gå till Ekonomiinställningar',
  },
  communication_configuration: {
    title: 'Kommunikationsinställningar',
    description: 'Aktivera minst en kommunikationskanal.',
    linkPath: '/communication/settings', linkLabel: 'Gå till Kanalinställningar',
  },
  staff_invitations: {
    title: 'Bjud in personal',
    description: 'Bjud in ytterligare personal till organisationen, om er skola har fler än en operatör.',
    linkPath: '/settings/users', linkLabel: 'Gå till Användare',
  },
  data_migration: {
    title: 'Dataimport',
    description: 'Importera data från ert tidigare system, om ni har sådan att föra över.',
    linkPath: '/settings/data-migration', linkLabel: 'Gå till Dataimport',
  },
};

const CATEGORY_META: Record<Exclude<OnboardingStepCategory, 'system'>, { title: string; description: string }> = {
  go_live_requirement: {
    title: 'Krav för driftsättning',
    description: 'Dessa steg måste vara klara innan TrafikskolaOS kan godkänna driftsättning.',
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
        title="Kom igång med TrafikskolaOS"
        description={`${progress.organization.name} — ${completedCount} av ${totalCount} krav klara`}
      />

      {progress.is_live ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <PartyPopper className="w-10 h-10 text-primary" />
            <p className="text-lg font-semibold">Er skola är live!</p>
            <p className="text-sm text-muted-foreground">Installationen är klar och godkänd av TrafikskolaOS.</p>
          </CardContent>
        </Card>
      ) : progress.ready_for_go_live ? (
        <Card>
          <CardContent className="py-6 flex items-center gap-3">
            <Rocket className="w-6 h-6 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">Alla krav är klara</p>
              <p className="text-sm text-muted-foreground">TrafikskolaOS granskar och godkänner driftsättning inom kort.</p>
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
          <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>

          {meta.linkPath && (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to={meta.linkPath}>
                {meta.linkLabel}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
