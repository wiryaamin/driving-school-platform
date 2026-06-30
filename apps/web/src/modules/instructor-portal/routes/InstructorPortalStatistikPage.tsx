import { useMemo } from 'react';
import { ChartBar, Clock, Users, CalendarCheck, TrendingUp, UserCheck } from 'lucide-react';
import { useInstructorPortalStats, useInstructorPortalTodayBookings } from '../hooks/useInstructorPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  isLoading,
}: {
  label:     string;
  value:     string | number;
  sub?:      string;
  icon:      React.ElementType;
  iconBg:    string;
  iconColor: string;
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', iconBg)}>
        <Icon className={cn('w-5 h-5', iconColor)} strokeWidth={1.75} />
      </div>
      {isLoading ? (
        <div className="h-7 w-16 bg-gray-100 rounded animate-pulse mb-1" />
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
      <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function InstructorPortalStatistikPage() {
  const { data: stats, isLoading, isError } = useInstructorPortalStats();
  const { data: todayBookings = [] }         = useInstructorPortalTodayBookings();

  const attendance = useMemo(() => {
    const marked  = todayBookings.filter(b => b.attendance_status !== null);
    const present = marked.filter(b => b.attendance_status === 'present');
    return {
      rate:    marked.length > 0 ? Math.round(present.length / marked.length * 100) : null,
      present: present.length,
      total:   marked.length,
    };
  }, [todayBookings]);

  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Statistik</h1>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">
          Kunde inte hämta statistik. Försök igen senare.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Statistik</h1>
        <p className="text-sm text-gray-400 mt-0.5">Din undervisningsöversikt</p>
      </div>

      {/* Today */}
      <div>
        <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-3">Idag</p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Lektioner idag"
            value={stats?.lessons_today ?? 0}
            icon={CalendarCheck}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            isLoading={isLoading}
          />
          <StatCard
            label="Kommande"
            value={stats?.upcoming_count ?? 0}
            sub="oavklarade"
            icon={TrendingUp}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            isLoading={isLoading}
          />
        </div>

        {/* Attendance rate — derived from today's bookings */}
        {attendance.total > 0 && (
          <div className="mt-3 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-green-50 flex items-center justify-center">
                  <UserCheck className="w-4 h-4 text-green-600" strokeWidth={1.75} />
                </div>
                <p className="text-xs text-gray-500 font-medium">Närvaro (markerade lektioner)</p>
              </div>
              <p className={cn(
                'text-sm font-bold tabular-nums',
                attendance.rate !== null && attendance.rate >= 85 ? 'text-green-600'
                  : attendance.rate !== null && attendance.rate >= 70 ? 'text-amber-500'
                  : 'text-red-500',
              )}>
                {attendance.rate !== null ? `${attendance.rate}%` : '—'}
              </p>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-green-500"
                style={{ width: `${attendance.rate ?? 0}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {attendance.present} av {attendance.total} elever närvarade
            </p>
          </div>
        )}
      </div>

      {/* This week */}
      <div>
        <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-3">Denna vecka</p>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <ProgressBar
                label="Lektioner"
                value={stats?.lessons_this_week ?? 0}
                max={20}
                color={BRAND}
              />
            </div>
          )}
        </div>
      </div>

      {/* This month */}
      <div>
        <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-3">Denna månad</p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Lektioner"
            value={stats?.lessons_this_month ?? 0}
            icon={CalendarCheck}
            iconBg="bg-green-50"
            iconColor="text-green-600"
            isLoading={isLoading}
          />
          <StatCard
            label="Timmar"
            value={`${stats?.total_hours_this_month ?? 0}h`}
            icon={Clock}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
            isLoading={isLoading}
          />
          <StatCard
            label="Unika elever"
            value={stats?.unique_students ?? 0}
            icon={Users}
            iconBg="bg-rose-50"
            iconColor="text-rose-600"
            isLoading={isLoading}
          />
          <StatCard
            label="Lektioner/dag"
            value={stats ? (stats.lessons_this_month / 22).toFixed(1) : '—'}
            sub="genomsnitt (22 dagar)"
            icon={ChartBar}
            iconBg="bg-teal-50"
            iconColor="text-teal-600"
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max:   number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs font-medium mb-1.5">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-900">{value} / {max}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
