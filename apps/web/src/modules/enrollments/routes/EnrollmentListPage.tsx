import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ClipboardList, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  useEnrollmentList,
  enrollmentStatusLabel,
  enrollmentStatusColor,
  type EnrollmentStatusType,
} from '../hooks/useEnrollments.js';

const STATUS_TABS: { value: EnrollmentStatusType | 'all'; label: string }[] = [
  { value: 'all',            label: 'Alla' },
  { value: 'submitted',      label: 'Inkomna' },
  { value: 'pending_review', label: 'Granskas' },
  { value: 'approved',       label: 'Godkända' },
  { value: 'rejected',       label: 'Nekade' },
  { value: 'converted',      label: 'Omvandlade' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatPrice(amount: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

export function EnrollmentListPage() {
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatusType | 'all'>('all');
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [page, setPage]                 = useState(1);

  const { data, isLoading, isError } = useEnrollmentList({
    status:   statusFilter,
    search:   search || undefined,
    page,
    per_page: 25,
  });

  const enrollments = data?.data  ?? [];
  const meta        = data?.meta;

  function handleStatusChange(s: EnrollmentStatusType | 'all') {
    setStatusFilter(s);
    setPage(1);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anmälningsförfrågningar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta?.total != null ? `${meta.total} anmälningar` : 'Laddar…'}
          </p>
        </div>
      </div>

      {/* Search + Status filter row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-sm flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Sök namn eller e-post…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Sök
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </form>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleStatusChange(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="animate-pulse p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-red-600">Kunde inte ladda anmälningar.</div>
        ) : enrollments.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Inga anmälningar hittades</p>
            {(search || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setSearchInput(''); setStatusFilter('all'); setPage(1); }}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                Rensa filter
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {enrollments.map((e) => (
              <Link
                key={e.id}
                to={`/enrollments/${e.id}`}
                className="flex items-center px-4 py-3.5 hover:bg-gray-50 transition-colors gap-4"
              >
                {/* Status badge */}
                <span className={`shrink-0 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${enrollmentStatusColor(e.status)}`}>
                  {enrollmentStatusLabel(e.status)}
                </span>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {e.first_name} {e.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{e.email}</p>
                </div>

                {/* Package */}
                <div className="hidden sm:block flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{e.package_name}</p>
                  {e.campaign_name && (
                    <p className="text-xs text-blue-600 truncate">{e.campaign_name}</p>
                  )}
                </div>

                {/* Price */}
                <div className="hidden md:block text-sm font-medium text-gray-700 whitespace-nowrap">
                  {formatPrice(e.final_price_incl_vat, e.currency)}
                </div>

                {/* Date */}
                <div className="text-xs text-gray-400 whitespace-nowrap hidden lg:block">
                  {formatDate(e.submitted_at)}
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.total > meta.per_page && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {((meta.page - 1) * meta.per_page) + 1}–{Math.min(meta.page * meta.per_page, meta.total)} av {meta.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.page <= 1}
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!meta.has_more}
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
