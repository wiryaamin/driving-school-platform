import type { ReactNode } from 'react';
import {
  FileSpreadsheet, FileDown, Eye, ExternalLink,
  Users, ChevronDown,
} from 'lucide-react';
import { Button, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── Action toast ─────────────────────────────────────────────────────────────

export function reportToast() {
  toast({ title: 'Förbereder rapport…', description: 'Exportfunktionen aktiveras inom kort.' });
}

// ─── CSV download ─────────────────────────────────────────────────────────────

export function csvDownload(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) {
    toast({ title: 'Inga data', description: 'Inga rader att exportera för den valda perioden.' });
    return;
  }
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[;"'\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const keys = Object.keys(rows[0]!);
  const csv  = [keys.join(';'), ...rows.map((r) => keys.map((k) => esc(r[k])).join(';'))].join('\r\n');
  const url  = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${filename}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Print report ─────────────────────────────────────────────────────────────

export function printReport(title: string, headers: string[], rows: unknown[][]) {
  const e  = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const th = headers.map((h) => `<th>${e(h)}</th>`).join('');
  const tb = rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('');
  const html = `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><title>${e(title)}</title>`
    + `<style>body{font:12px Arial,sans-serif;margin:16px}h1{font-size:15px;margin-bottom:10px}`
    + `table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px}`
    + `th{background:#eee}tr:nth-child(even){background:#f8f8f8}@media print{body{margin:0}}</style>`
    + `</head><body><h1>${e(title)}</h1>`
    + `<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></body></html>`;
  const w = window.open('', '_blank', 'width=900,height=650');
  if (!w) {
    toast({ title: 'Tillåt popup-fönster', description: 'Popup blockerades — ändra webbläsarinställningar.' });
    return;
  }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 350);
}

// ─── Export format buttons (pill style, not hyperlinks) ───────────────────────

export function ExcelBtn({ onClick = reportToast }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100
        dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60"
    >
      <FileSpreadsheet className="w-3.5 h-3.5" />
      Excel
    </button>
  );
}

export function PdfBtn({ onClick = reportToast }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100
        dark:border-rose-800 dark:text-rose-300 dark:bg-rose-950/40 dark:hover:bg-rose-900/60"
    >
      <FileDown className="w-3.5 h-3.5" />
      PDF
    </button>
  );
}

export function OpenBtn({ label = 'Öppna', onClick = reportToast }: { label?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-border text-foreground bg-background hover:bg-accent
        dark:hover:bg-accent/60"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

export function VisaBtn({ onClick = reportToast }: { onClick?: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} className="h-8 px-3 text-xs gap-1.5">
      <Eye className="w-3.5 h-3.5" />
      Visa
    </Button>
  );
}

export function SegmentBtn({ onClick = reportToast }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-border text-foreground bg-background hover:bg-accent"
    >
      <Users className="w-3.5 h-3.5" />
      Segment
    </button>
  );
}

// ─── ReportCard ───────────────────────────────────────────────────────────────

interface ReportCardProps {
  title:        string;
  description?: ReactNode;
  children?:    ReactNode;
  actions:      ReactNode;
  className?:   string;
}

export function ReportCard({ title, description, children, actions, className }: ReportCardProps) {
  return (
    <div className={cn(
      'rounded-xl border border-border bg-card shadow-sm flex flex-col',
      className,
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description != null && (
          <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</div>
        )}
      </div>

      {/* Parameters */}
      {children && (
        <>
          <div className="mx-4 border-t border-border/50" />
          <div className="px-4 py-3 flex-1 space-y-2.5">
            {children}
          </div>
        </>
      )}

      {/* Actions */}
      <div className={cn(
        'px-4 pb-4 flex flex-wrap items-center gap-2',
        children ? 'pt-3 border-t border-border/50 mt-auto' : 'pt-0 mt-auto',
      )}>
        {actions}
      </div>
    </div>
  );
}

// ─── Date inputs ──────────────────────────────────────────────────────────────

interface DateFieldProps { label?: string; value: string; onChange: (v: string) => void; }

export function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <div className="flex-1 min-w-0">
      {label && (
        <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </span>
      )}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full px-2 text-xs border border-border rounded-md bg-background text-foreground
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
      />
    </div>
  );
}

// Backward-compatible alias (no label)
export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <DateField value={value} onChange={onChange} />;
}

// Labeled Från/Till pair — preferred for all date range reports
export function DateRange({
  from, to, onFromChange, onToChange,
}: {
  from: string; to: string;
  onFromChange: (v: string) => void;
  onToChange:   (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <DateField label="Från" value={from} onChange={onFromChange} />
      <DateField label="Till"  value={to}   onChange={onToChange} />
    </div>
  );
}

// ─── Select input ─────────────────────────────────────────────────────────────

export function SelectInput({
  value, onChange, options, label,
}: {
  value:    string;
  onChange: (v: string) => void;
  options:  { value: string; label: string }[];
  label?:   string;
}) {
  return (
    <div>
      {label && (
        <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </span>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full pl-2.5 pr-7 text-xs border border-border rounded-md bg-background text-foreground
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 appearance-none transition-colors"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}
