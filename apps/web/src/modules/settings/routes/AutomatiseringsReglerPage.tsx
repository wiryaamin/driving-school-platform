import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, Bell, Clock, AlertTriangle, CheckCircle2, ListOrdered, Zap,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type AutoRuleType =
  | 'reminder_24h'
  | 'reminder_2h'
  | 'reminder_1h'
  | 'reservation_expiry'
  | 'auto_confirm'
  | 'waitlist_promotion';

interface AutomationRule {
  id:         string;
  rule_type:  AutoRuleType;
  enabled:    boolean;
  config:     Record<string, unknown>;
}

// ─── Rule metadata ────────────────────────────────────────────────────────────

interface RuleMeta {
  labelSv:       string;
  description:   string;
  icon:          LucideIcon;
  iconBg:        string;
  configKey?:    string;
  configLabel?:  string;
  configMin?:    number;
  configMax?:    number;
  configSuffix?: string;
  defaultConfig: Record<string, unknown>;
}

const RULE_META: Record<AutoRuleType, RuleMeta> = {
  reminder_24h: {
    labelSv:      'Påminnelse 24 timmar innan',
    description:  'Skickar automatiskt en påminnelse till eleven 24 timmar innan bokad lektion.',
    icon:         Bell,
    iconBg:       'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    defaultConfig: { offset_minutes: 1440 },
  },
  reminder_2h: {
    labelSv:      'Påminnelse 2 timmar innan',
    description:  'Skickar automatiskt en påminnelse till eleven 2 timmar innan bokad lektion.',
    icon:         Bell,
    iconBg:       'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    defaultConfig: { offset_minutes: 120 },
  },
  reminder_1h: {
    labelSv:      'Påminnelse 1 timme innan',
    description:  'Skickar automatiskt en sista påminnelse till eleven 1 timme innan lektionen börjar.',
    icon:         Clock,
    iconBg:       'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    defaultConfig: { offset_minutes: 60 },
  },
  reservation_expiry: {
    labelSv:       'Automatisk avbokning av reservationer',
    description:   'Avbokar automatiskt reservationer som inte bekräftats inom den angivna tidsfristen.',
    icon:          AlertTriangle,
    iconBg:        'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    configKey:     'timeout_minutes',
    configLabel:   'Tidsgräns',
    configMin:     15,
    configMax:     1440,
    configSuffix:  'min',
    defaultConfig: { timeout_minutes: 30 },
  },
  auto_confirm: {
    labelSv:      'Automatisk bekräftelse av bokningar',
    description:  'Bekräftar nya bokningar automatiskt utan att personalen behöver godkänna dem manuellt.',
    icon:         CheckCircle2,
    iconBg:       'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    defaultConfig: {},
  },
  waitlist_promotion: {
    labelSv:       'Automatisk väntelistepromovering',
    description:   'Meddelar nästa person på väntelistan automatiskt när en ledigblir ledig, och ger dem en tidsfrist att svara.',
    icon:          ListOrdered,
    iconBg:        'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    configKey:     'reservation_deadline_minutes',
    configLabel:   'Svarstid',
    configMin:     15,
    configMax:     480,
    configSuffix:  'min',
    defaultConfig: { reservation_deadline_minutes: 60 },
  },
};

const RULE_ORDER: AutoRuleType[] = [
  'reminder_24h',
  'reminder_2h',
  'reminder_1h',
  'reservation_expiry',
  'auto_confirm',
  'waitlist_promotion',
];

// ─── Query / mutation ─────────────────────────────────────────────────────────

const QUERY_KEY = ['settings-automation-rules'] as const;

function useAutomationRules(orgId: string | undefined) {
  return useQuery<AutomationRule[]>({
    queryKey: QUERY_KEY,
    queryFn:  async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('automation_rules')
        .select('id, rule_type, enabled, config')
        .eq('organization_id', orgId);
      if (error) throw error;
      return (data ?? []) as AutomationRule[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });
}

function useUpsertRule(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ruleType,
      enabled,
      config,
    }: { ruleType: AutoRuleType; enabled: boolean; config: Record<string, unknown> }) => {
      if (!orgId) throw new Error('No org');
      const { error } = await supabase
        .from('automation_rules')
        .upsert(
          { organization_id: orgId, rule_type: ruleType, enabled, config } as never,
          { onConflict: 'organization_id,rule_type' },
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  );
}

// ─── RuleCard ─────────────────────────────────────────────────────────────────

function RuleCard({
  ruleType,
  rule,
  onToggle,
  onConfigChange,
  isPending,
}: {
  ruleType:       AutoRuleType;
  rule:           AutomationRule | undefined;
  onToggle:       () => void;
  onConfigChange: (val: number) => void;
  isPending:      boolean;
}) {
  const meta    = RULE_META[ruleType];
  const Icon    = meta.icon;
  const enabled = rule?.enabled ?? false;

  const configVal = meta.configKey
    ? ((rule?.config?.[meta.configKey] as number | undefined)
        ?? (meta.defaultConfig[meta.configKey] as number))
    : undefined;

  const [localVal, setLocalVal] = useState<string>(String(configVal ?? ''));

  function handleConfigBlur() {
    const n = parseInt(localVal, 10);
    if (!isNaN(n) && n >= (meta.configMin ?? 0) && n <= (meta.configMax ?? 9999)) {
      onConfigChange(n);
    } else {
      setLocalVal(String(configVal ?? ''));
    }
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 flex items-start gap-4 transition-all',
      enabled ? 'border-border' : 'border-border/50 opacity-70',
    )}>
      {/* Icon */}
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5', meta.iconBg)}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground leading-snug">{meta.labelSv}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</p>
          </div>
          {isPending
            ? <Loader2 className="w-5 h-5 shrink-0 animate-spin text-muted-foreground mt-0.5" />
            : <Toggle checked={enabled} onChange={onToggle} disabled={isPending} />}
        </div>

        {/* Config input (for rules that have configurable params) */}
        {meta.configKey && enabled && (
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {meta.configLabel}
            </label>
            <input
              type="number"
              value={localVal}
              onChange={e => setLocalVal(e.target.value)}
              onBlur={handleConfigBlur}
              min={meta.configMin}
              max={meta.configMax}
              disabled={isPending}
              className="w-20 h-7 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <span className="text-xs text-muted-foreground">{meta.configSuffix}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AutomatiseringsReglerPage ────────────────────────────────────────────────

export function AutomatiseringsReglerPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: rules = [], isLoading } = useAutomationRules(orgId);
  const upsert = useUpsertRule(orgId);

  function getRuleByType(t: AutoRuleType): AutomationRule | undefined {
    return rules.find(r => r.rule_type === t);
  }

  function handleToggle(ruleType: AutoRuleType) {
    const existing = getRuleByType(ruleType);
    const meta     = RULE_META[ruleType];
    upsert.mutate({
      ruleType,
      enabled: !existing?.enabled,
      config:  existing?.config ?? meta.defaultConfig,
    });
  }

  function handleConfigChange(ruleType: AutoRuleType, val: number) {
    const existing = getRuleByType(ruleType);
    const meta     = RULE_META[ruleType];
    if (!meta.configKey) return;
    upsert.mutate({
      ruleType,
      enabled: existing?.enabled ?? false,
      config:  { ...(existing?.config ?? meta.defaultConfig), [meta.configKey]: val },
    });
  }

  const activeCount = RULE_ORDER.filter(rt => getRuleByType(rt)?.enabled).length;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/settings/communication/config" className="hover:text-foreground">Kommunikation</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Automationsregler</span>
      </nav>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 flex items-center justify-center">
          <Zap className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Automationsregler</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Aktivera eller inaktivera automatiska påminnelser, bekräftelser och workflows för din körskola.
        </p>
        {!isLoading && (
          <p className="text-xs text-muted-foreground">
            {activeCount} av {RULE_ORDER.length} regler aktiva
          </p>
        )}
      </div>

      {/* Rules */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {RULE_ORDER.map(ruleType => (
            <RuleCard
              key={ruleType}
              ruleType={ruleType}
              rule={getRuleByType(ruleType)}
              onToggle={() => handleToggle(ruleType)}
              onConfigChange={val => handleConfigChange(ruleType, val)}
              isPending={upsert.isPending && upsert.variables?.ruleType === ruleType}
            />
          ))}
        </div>
      )}

      {upsert.isError && (
        <p className="text-xs text-destructive px-1">
          Kunde inte spara — kontrollera att du har behörighet att ändra inställningar.
        </p>
      )}
    </div>
  );
}
