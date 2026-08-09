import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, CheckCircle2, Check } from 'lucide-react';
import { Button, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  useBusinessProfile, useSaveBusinessProfile, LICENCE_CATEGORY_OPTIONS,
  type Archetype, type BusinessType, type BusinessProfileInput, type CapabilityAssessment,
} from '../hooks/useTenantOnboarding.js';

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  solo:        'Enskild verksamhet',
  smallTeam:   'Litet team',
  multiBranch: 'Flera filialer',
  enterprise:  'Storskalig verksamhet',
};

const ARCHETYPE_DESCRIPTIONS: Record<Archetype, string> = {
  solo:        'En instruktör, en filial — vi håller dashboarden enkel och passgenerering är manuell tills ni växer.',
  smallTeam:   'Ett mindre team — standardvy för schema och rapporter.',
  multiBranch: 'Flera filialer — filialjämförelser aktiveras i rapporter och dashboard, och passgenerering kan schemaläggas automatiskt.',
  enterprise:  'Storskalig verksamhet — hela rapportkatalogen och automatiserad passgenerering aktiveras direkt.',
};

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  standard:      'Bilskola',
  motorcycle:    'MC-skola',
  heavy_vehicle: 'Skola för tunga fordon',
  mixed:         'Blandad verksamhet',
};

/**
 * Business Discovery — the tenant-facing entry point into the Intelligent
 * Tenant Provisioning Engine (Configuration Extraction → Business Rules →
 * Dependency → Provisioning; see supabase/functions/_shared/provisioning-*.ts).
 *
 * "Never ask what's already known" (Execution Direction, 2026-08-07):
 * branches/instructors/vehicles only render as editable inputs when the
 * platform genuinely doesn't know yet (no real location/instructor/vehicle
 * records exist). Once real records exist, the field becomes a read-only
 * confirmation — the backend would ignore a typed value here anyway
 * (resolveKnownCount() in provisioning-extraction.ts always prefers real
 * records), so hiding the input is just being honest about that in the UI.
 */
export function BusinessDiscoveryPage() {
  const navigate = useNavigate();
  const { data: existing, isLoading } = useBusinessProfile();
  const save = useSaveBusinessProfile();

  const [branches, setBranches]       = useState(1);
  const [instructors, setInstructors] = useState(1);
  const [vehicles, setVehicles]       = useState(1);
  const [duration, setDuration]       = useState(45);
  const [categories, setCategories]   = useState<string[]>([]);
  const [result, setResult]           = useState<{ archetype: Archetype; businessType: BusinessType; lessonTypesCreated: number; branchCreated: number; packageTemplatesCreated: number; capabilities: CapabilityAssessment[] } | null>(null);
  const notableCapabilities = result?.capabilities.filter((c) => c.active && c.key !== 'core_operations') ?? [];

  const known = existing?.known_counts;
  const branchesKnown    = known?.branches != null;
  const instructorsKnown = known?.instructors != null;
  const vehiclesKnown    = known?.vehicles != null;

  useEffect(() => {
    if (!existing || existing.analysis == null) return;
    setBranches(existing.branches ?? 1);
    setInstructors(existing.instructors ?? 1);
    setVehicles(existing.vehicles ?? 1);
    setDuration(existing.standard_lesson_duration_minutes ?? 45);
    setCategories(existing.licence_categories ?? []);
  }, [existing]);

  function toggleCategory(cat: string) {
    setCategories((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  }

  function handleSubmit() {
    if (categories.length === 0) {
      toast({ title: 'Välj minst en behörighet ni utbildar för', variant: 'destructive' });
      return;
    }
    const payload: BusinessProfileInput = {
      licence_categories: categories,
      standard_lesson_duration_minutes: duration,
      ...(branchesKnown ? {} : { branches }),
      ...(instructorsKnown ? {} : { instructors }),
      ...(vehiclesKnown ? {} : { vehicles }),
    };
    save.mutate(payload, {
      onSuccess: (data) => {
        setResult({
          archetype: data.business_profile.analysis.archetype,
          businessType: data.business_profile.analysis.business_type,
          lessonTypesCreated: data.lesson_types_created,
          branchCreated: data.branch_created,
          packageTemplatesCreated: data.package_templates_created,
          capabilities: data.business_profile.capabilities,
        });
        toast({ title: 'Sparat', description: 'Er verksamhetsprofil har sparats.' });
      },
      onError: (err) => toast({ title: 'Kunde inte spara', description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4 md:p-6">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/setup" className="hover:text-foreground">Kom igång</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Berätta om er verksamhet</span>
      </nav>

      <div className="rounded-xl border border-border bg-card p-6 space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Berätta om er verksamhet</h1>
        <p className="text-sm text-muted-foreground">
          Svara på några frågor om er trafikskola så konfigurerar Trafikcloud automatiskt det som går —
          till exempel lektionstyper för de behörigheter ni utbildar för. Vi frågar inte om sådant vi redan vet.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Laddar…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CountField
              label="Antal filialer" value={branches} known={branchesKnown} knownValue={known?.branches ?? null}
              min={1} onChange={(v) => setBranches(Math.max(1, v))}
            />
            <CountField
              label="Antal lärare" value={instructors} known={instructorsKnown} knownValue={known?.instructors ?? null}
              min={1} onChange={(v) => setInstructors(Math.max(1, v))}
            />
            <CountField
              label="Antal fordon" value={vehicles} known={vehiclesKnown} knownValue={known?.vehicles ?? null}
              min={0} onChange={(v) => setVehicles(Math.max(0, v))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Vilka behörigheter utbildar ni för? *</label>
            <div className="flex flex-wrap gap-2">
              {LICENCE_CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                    categories.includes(cat)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Trafikcloud skapar automatiskt en lektionstyp för varje vald behörighet, om ni inte redan har en.
            </p>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <label className="text-sm font-medium text-foreground">Normal längd på en körlektion (minuter)</label>
            <input
              type="number" min={15} max={240} step={5} value={duration}
              onChange={(e) => setDuration(Math.max(15, Number(e.target.value) || 45))}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button onClick={handleSubmit} disabled={save.isPending} className="bg-green-500 hover:bg-green-600 text-white">
              {save.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Spara och konfigurera automatiskt
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-sm font-semibold text-foreground">
              {ARCHETYPE_LABELS[result.archetype]} · {BUSINESS_TYPE_LABELS[result.businessType]}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">{ARCHETYPE_DESCRIPTIONS[result.archetype]}</p>
          {result.branchCreated > 0 && (
            <p className="text-sm text-foreground">
              Er första filial skapades automatiskt utifrån adressen i{' '}
              <Link to="/settings/company" className="text-primary hover:underline font-medium">
                Företagsinställningar
              </Link>.
            </p>
          )}
          {result.lessonTypesCreated > 0 && (
            <p className="text-sm text-foreground">
              {result.lessonTypesCreated} {result.lessonTypesCreated === 1 ? 'lektionstyp' : 'lektionstyper'} skapades automatiskt.
              Sätt pris under{' '}
              <Link to="/settings/finance/lesson-types" className="text-primary hover:underline font-medium">
                Ekonomi → Lektionstyper
              </Link>{' '}
              för att aktivera bokning.
            </p>
          )}
          {result.packageTemplatesCreated > 0 && (
            <p className="text-sm text-foreground">
              {result.packageTemplatesCreated} paketmallar skapades automatiskt (5, 10 och 20 lektioner). Sätt pris under{' '}
              <Link to="/packages" className="text-primary hover:underline font-medium">
                Paket
              </Link>{' '}
              för att aktivera för försäljning.
            </p>
          )}
          {notableCapabilities.length > 0 && (
            <div className="pt-1 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Det här har Trafikcloud upptäckt om er verksamhet:</p>
              <ul className="space-y-1">
                {notableCapabilities.map((cap) => (
                  <li key={cap.key} className="flex items-start gap-1.5 text-xs text-foreground">
                    <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    <span><span className="font-medium">{cap.name}</span> — {cap.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={() => navigate('/setup')}>Tillbaka till Kom igång</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Count field — editable input, or a read-only confirmation when the ────
// platform already knows the answer from real records.
function CountField({ label, value, known, knownValue, min, onChange }: {
  label: string; value: number; known: boolean; knownValue: number | null; min: number; onChange: (v: number) => void;
}) {
  if (known) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <div className="flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-border bg-muted/40 text-foreground">
          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-medium">{knownValue}</span>
          <span className="text-xs text-muted-foreground">(hämtat automatiskt)</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type="number" min={min} max={2000} value={value}
        onChange={(e) => onChange(Number(e.target.value) || min)}
        className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}
