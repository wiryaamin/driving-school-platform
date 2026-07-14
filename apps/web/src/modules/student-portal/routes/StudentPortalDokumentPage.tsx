import { FileText, Download, ShieldCheck, AlertCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { usePortalDocuments } from '../hooks/useStudentPortal.js';
import type { PortalDocument } from '../hooks/useStudentPortal.js';

const BRAND = '#684EFF';

// ─── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  identity_document:   'ID-handling',
  medical_clearance:   'Läkarintyg',
  theory_result:       'Kunskapsprov',
  risk_education:      'Riskutbildning',
  practical_result:    'Körprov',
  licence_copy:        'Körkortskopia',
  enrollment_contract: 'Utbildningsavtal',
  other:               'Övrigt',
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  identity_document:   FileText,
  medical_clearance:   ShieldCheck,
  theory_result:       FileText,
  risk_education:      ShieldCheck,
  practical_result:    FileText,
  licence_copy:        FileText,
  enrollment_contract: FileText,
  other:               FileText,
};

const CATEGORY_COLOR: Record<string, string> = {
  identity_document:   'bg-blue-50 text-blue-600',
  medical_clearance:   'bg-green-50 text-green-600',
  theory_result:       'bg-purple-50 text-purple-600',
  risk_education:      'bg-green-50 text-green-600',
  practical_result:    'bg-indigo-50 text-indigo-600',
  licence_copy:        'bg-blue-50 text-blue-600',
  enrollment_contract: 'bg-amber-50 text-amber-600',
  other:               'bg-gray-50 text-gray-500',
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Document card ────────────────────────────────────────────────────────────

function DocumentCard({ doc }: { doc: PortalDocument }) {
  const Icon  = CATEGORY_ICON[doc.category]  ?? FileText;
  const color = CATEGORY_COLOR[doc.category] ?? 'bg-gray-50 text-gray-500';
  const label = CATEGORY_LABELS[doc.category] ?? doc.category;
  const isExpired = doc.expires_at ? new Date(doc.expires_at) < new Date() : false;

  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-50 last:border-0">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
          {doc.file_name}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{label}</span>
          {doc.file_size_bytes && (
            <span className="text-xs text-gray-400">{formatBytes(doc.file_size_bytes)}</span>
          )}
          {doc.description && (
            <span className="text-xs text-gray-400">— {doc.description}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
          {doc.expires_at && (
            <span className={cn('text-xs flex items-center gap-0.5', isExpired ? 'text-red-500' : 'text-amber-500')}>
              <Clock className="w-3 h-3" />
              {isExpired ? 'Utgånget' : `Giltigt t.o.m. ${formatDate(doc.expires_at)}`}
            </span>
          )}
        </div>
      </div>

      {doc.download_url && (
        <a
          href={doc.download_url}
          download={doc.file_name}
          target="_blank"
          rel="noreferrer"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          title="Ladda ned"
        >
          <Download className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}

// ─── StudentPortalDokumentPage ────────────────────────────────────────────────

export function StudentPortalDokumentPage() {
  const { data: documents, isLoading, error } = usePortalDocuments();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dokument</h1>
        <p className="text-sm text-gray-400 mt-0.5">Avtal, intyg och kvitton</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="bg-red-50 rounded-2xl border border-red-100 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">Kunde inte ladda dokument. Försök igen senare.</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && documents?.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center space-y-3">
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: `${BRAND}10` }}
          >
            <FileText className="w-8 h-8" style={{ color: BRAND }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Inga dokument uppladdade ännu</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
              När trafikskolan laddar upp avtal, intyg eller kvitton kopplade till ditt konto
              visas de här för nedladdning.
            </p>
          </div>
        </div>
      )}

      {/* Document list */}
      {!isLoading && !error && documents && documents.length > 0 && (
        <div>
          <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide mb-2">
            Dina dokument ({documents.length})
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {documents.map(doc => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">Behöver du ett dokument?</span> Kontakta din trafikskola
          direkt så kan de ladda upp det till ditt konto.
        </p>
      </div>
    </div>
  );
}
