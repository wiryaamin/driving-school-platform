import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

export interface GuardianListItem {
  id:         string;
  first_name: string;
  last_name:  string;
  email:      string;
  phone:      string | null;
  relation:   string | null;
  can_pay:    boolean;
  created_at: string;
  student_id: string;
  students: {
    id:         string;
    first_name: string;
    last_name:  string;
  } | null;
}

export function useAllGuardians() {
  return useQuery({
    queryKey: ['guardians', 'all'],
    queryFn: async (): Promise<GuardianListItem[]> => {
      const { data, error } = await supabase
        .from('student_guardians')
        .select('id, first_name, last_name, email, phone, relation, can_pay, created_at, student_id, students(id, first_name, last_name)')
        .is('deleted_at', null)
        .order('last_name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as GuardianListItem[];
    },
    staleTime: 60_000,
  });
}
