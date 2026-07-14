import { useState } from 'react';
import {
  Car, Plus, Trash2, Clock, Calendar, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  usePortalPracticeLog,
  usePortalAddPractice,
  usePortalDeletePractice,
} from '../hooks/useStudentPortal.js';
const BRAND = '#684EFF';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  }).replace(/^./, c => c.toUpperCase());
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} tim`;
  return `${h} tim ${m} min`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Add entry form ───────────────────────────────────────────────────────────

function AddEntryForm({ onClose }: { onClose: () => void }) {
  const addPractice = usePortalAddPractice();
  const [date,     setDate]     = useState(todayStr());
  const [hours,    setHours]    = useState('1');
  const [minutes,  setMinutes]  = useState('0');
  const [notes,    setNotes]    = useState('');
  const [error,    setError]    = useState('');

  function handleSubmit() {
    const h = parseInt(hours,   10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const totalMinutes = h * 60 + m;
    if (!date) { setError('Ange ett datum.'); return; }
    if (totalMinutes < 5) { setError('Minsta tid är 5 minuter.'); return; }
    setError('');

    addPractice.mutate(
      { practice_date: date, duration_minutes: totalMinutes, notes: notes || undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
      <p className="text-sm font-bold text-gray-900">Registrera övningskörning</p>

      {/* Date */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Datum</label>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={e => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Duration */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Tid</label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <select
              value={hours}
              onChange={e => setHours(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {Array.from({ length: 13 }, (_, i) => (
                <option key={i} value={i}>{i} tim</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <select
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {[0, 15, 30, 45].map(m => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Anteckningar (valfritt)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="T.ex. körde på motorvägen..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Avbryt
        </button>
        <button
          onClick={handleSubmit}
          disabled={addPractice.isPending}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: BRAND }}
        >
          {addPractice.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Spara
        </button>
      </div>
    </div>
  );
}

// ─── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
}: {
  entry: {
    id:               string;
    practice_date:    string;
    duration_minutes: number;
    notes:            string | null;
    created_at:       string;
  };
}) {
  const deletePractice = usePortalDeletePractice();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${BRAND}15` }}
        >
          <Car className="w-5 h-5" style={{ color: BRAND }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {formatDate(entry.practice_date)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatHours(entry.duration_minutes)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {entry.notes && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => deletePractice.mutate(entry.id)}
            disabled={deletePractice.isPending}
            className="p-2 rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && entry.notes && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
            {entry.notes}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── StudentPortalOvningkorningPage ───────────────────────────────────────────

export function StudentPortalOvningkorningPage() {
  const { data: entries, isLoading, isError } = usePortalPracticeLog();
  const [showForm, setShowForm] = useState(false);

  const totalMinutes = (entries ?? []).reduce((sum, e) => sum + e.duration_minutes, 0);
  const hasEntries   = (entries?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Övningskörning</h1>
          <p className="text-sm text-gray-400 mt-0.5">Logga dina övningstillfällen</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: BRAND }}
          >
            <Plus className="w-4 h-4" />
            Lägg till
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && <AddEntryForm onClose={() => setShowForm(false)} />}

      {/* Stats summary (when entries exist) */}
      {hasEntries && !isLoading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4" style={{ color: BRAND }} />
              <p className="text-xs text-gray-500 font-medium">Tillfällen</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{entries!.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4" style={{ color: BRAND }} />
              <p className="text-xs text-gray-500 font-medium">Total tid</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatHours(totalMinutes)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">
          Kunde inte hämta övningskörningslogg. Försök igen senare.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && !hasEntries && !showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: `${BRAND}10` }}>
            <Car className="w-8 h-8" style={{ color: BRAND }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Du har ännu inte registrerat någon övningskörning.</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              Logga dina övningstillfällen här för att hålla koll på hur mycket du kört och din framsteg mot körkortet.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: BRAND }}
          >
            <Plus className="w-4 h-4" />
            Registrera övningskörning
          </button>
        </div>
      )}

      {/* Entry list */}
      {!isLoading && hasEntries && (
        <div>
          <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide mb-2">
            Logg ({entries!.length} tillfällen)
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {entries!
              .slice()
              .sort((a, b) => b.practice_date.localeCompare(a.practice_date))
              .map(entry => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">Tips:</span> Registrera varje övningstillfälle direkt efter körningen.
          Ange hur länge du körde och lägg gärna till en anteckning om vad ni övade på.
        </p>
      </div>
    </div>
  );
}
