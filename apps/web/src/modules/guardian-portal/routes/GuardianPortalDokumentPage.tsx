import { FileText, Download, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import { useGuardianDocuments, type GuardianDocument } from '../hooks/useGuardianPortal.js';

const BRAND = '#2D5BE3';

const CATEGORY_LABELS: Record<string, string> = {
  contract:      'Avtal',
  certificate:   'Intyg',
  invoice:       'Faktura',
  theory:        'Teori',
  practical:     'Körprov',
  risk:          'Riskutbildning',
  identification:'Legitimation',
  other:         'Övrigt',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

function DocCard({ doc }: { doc: GuardianDocument }) {
  const isExpired = doc.expires_at ? new Date(doc.expires_at) < new Date() : false;
  const expiresLabel = doc.expires_at
    ? `Giltig till ${formatDate(doc.expires_at)}`
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-4 py-3.5 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${BRAND}15` }}
      >
        <FileText className="w-[18px] h-[18px]" style={{ color: BRAND }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
          {doc.file_name}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {categoryLabel(doc.category)}
          </span>
          {doc.file_size_bytes && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {formatFileSize(doc.file_size_bytes)}
            </span>
          )}
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            {formatDate(doc.created_at)}
          </span>
        </div>
        {doc.description && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-snug line-clamp-2">
            {doc.description}
          </p>
        )}
        {expiresLabel && (
          <p className={`text-[11px] mt-0.5 font-medium ${isExpired ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
            {isExpired ? '⚠ Utgånget — ' : ''}{expiresLabel}
          </p>
        )}
      </div>

      {doc.download_url ? (
        <a
          href={doc.download_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-100 dark:border-gray-800 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shrink-0"
          aria-label={`Ladda ner ${doc.file_name}`}
        >
          <Download className="w-4 h-4" />
        </a>
      ) : (
        <div className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-100 dark:border-gray-800 text-gray-200 dark:text-gray-700 shrink-0">
          <Download className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

export function GuardianPortalDokumentPage() {
  const { data: docs, isLoading, isError } = useGuardianDocuments();

  const grouped = (docs ?? []).reduce<Record<string, GuardianDocument[]>>((acc, doc) => {
    const key = doc.category;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: BRAND }}>
          Dokument
        </p>
        <p className="text-xs text-gray-400">Godkända dokument för elevens utbildning</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Kunde inte ladda dokument. Försök igen senare.
        </div>
      )}

      {!isLoading && !isError && (docs ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: `${BRAND}15` }}
          >
            <FolderOpen className="w-7 h-7" style={{ color: BRAND }} />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inga dokument ännu</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
            Godkända dokument från trafikskolan visas här när de blivit tillgängliga.
          </p>
        </div>
      )}

      {!isLoading && !isError && Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 px-1">
            {categoryLabel(category)}
          </h2>
          <div className="space-y-2">
            {items.map(doc => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
