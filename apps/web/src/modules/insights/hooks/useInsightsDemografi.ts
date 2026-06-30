import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenderBreakdown { men: number; women: number; unknown: number; total: number }

export interface AgeGroup { label: string; men: number; women: number; total: number }

export interface CityCount { city: string; count: number }

export interface DemografiData {
  gender:   GenderBreakdown;
  ageGroups: AgeGroup[];
  cities:   CityCount[];
  total:    number;
}

// ─── Age bucket definitions ───────────────────────────────────────────────────

const AGE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '14 År', min: 14, max: 14 },
  { label: '15 År', min: 15, max: 15 },
  { label: '16 År', min: 16, max: 16 },
  { label: '17 År', min: 17, max: 17 },
  { label: '18 År', min: 18, max: 18 },
  { label: '19 År', min: 19, max: 19 },
  { label: '20 År', min: 20, max: 20 },
  { label: '21-25 År', min: 21, max: 25 },
  { label: '25-30 År', min: 26, max: 30 },
  { label: '30-40 År', min: 31, max: 40 },
  { label: '40-50 År', min: 41, max: 50 },
  { label: '50-65 År', min: 51, max: 65 },
  { label: '65+ År',  min: 66, max: 999 },
];

// In Swedish personnummer, the 3rd digit of the last-4 (NNNK) is odd for male, even for female.
function deriveGender(last4: string | null): 'man' | 'woman' | 'unknown' {
  if (!last4 || last4.length < 3) return 'unknown';
  const digit = parseInt(last4[2] ?? '', 10);
  if (isNaN(digit)) return 'unknown';
  return digit % 2 === 1 ? 'man' : 'woman';
}

function calcAge(dob: string): number {
  const today = new Date();
  const d = new Date(dob);
  let age = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const demografiKey = (category: string) =>
  ['insights', 'demografi', category] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInsightsDemografi(licenceCategory = 'all') {
  return useQuery({
    queryKey: demografiKey(licenceCategory),
    queryFn: async (): Promise<DemografiData> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as unknown as any)
        .from('students')
        .select('id, date_of_birth, city, personnummer_last4, target_licence_category')
        .is('deleted_at', null)
        .in('status', ['active', 'onboarding', 'paused', 'completed', 'lead']);

      if (licenceCategory !== 'all') q = q.eq('target_licence_category', licenceCategory);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const students = (data ?? []) as {
        id: string;
        date_of_birth: string | null;
        city: string | null;
        personnummer_last4: string | null;
        target_licence_category: string;
      }[];

      // Gender breakdown
      const gender: GenderBreakdown = { men: 0, women: 0, unknown: 0, total: students.length };
      for (const s of students) {
        const g = deriveGender(s.personnummer_last4);
        if (g === 'man')   gender.men++;
        else if (g === 'woman') gender.women++;
        else               gender.unknown++;
      }

      // Age groups — initialise with zeros
      const ageGroupMap = new Map<string, AgeGroup>(
        AGE_BUCKETS.map((b) => [b.label, { label: b.label, men: 0, women: 0, total: 0 }]),
      );

      for (const s of students) {
        if (!s.date_of_birth) continue;
        const age    = calcAge(s.date_of_birth);
        const bucket = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max);
        if (!bucket) continue;
        const entry  = ageGroupMap.get(bucket.label)!;
        const g      = deriveGender(s.personnummer_last4);
        entry.total++;
        if (g === 'man')   entry.men++;
        else if (g === 'woman') entry.women++;
      }

      // City distribution — top 15
      const cityMap = new Map<string, number>();
      for (const s of students) {
        if (!s.city) continue;
        const key = s.city.trim().toUpperCase();
        cityMap.set(key, (cityMap.get(key) ?? 0) + 1);
      }

      const cities = [...cityMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([city, count]) => ({ city, count }));

      return {
        gender,
        ageGroups: [...ageGroupMap.values()],
        cities,
        total: students.length,
      };
    },
    staleTime: 120_000,
  });
}
