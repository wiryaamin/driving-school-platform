import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { AuthUser, Organization, UserProfile } from '@platform/types';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface SessionState {
  user:           AuthUser | null;
  profile:        UserProfile | null;
  organization:   Organization | null;   // null for platform admins
  permissions:    string[];
  isAuthenticated: boolean;
  isLoading:      boolean;
}

interface SessionActions {
  // organization is null for platform admins who belong to no org
  setSession:          (user: AuthUser, profile: UserProfile, organization: Organization | null) => void;
  clearSession:        () => void;
  setLoading:          (loading: boolean) => void;
  hasPermission:       (permission: string) => boolean;
  hasAnyPermission:    (permissions: string[]) => boolean;
  hasAllPermissions:   (permissions: string[]) => boolean;
}

type SessionStore = SessionState & SessionActions;

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: SessionState = {
  user:            null,
  profile:         null,
  organization:    null,
  permissions:     [],
  isAuthenticated: false,
  isLoading:       true,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setSession: (user, profile, organization) => {
          set({
            user,
            profile,
            organization,
            permissions:     user.permissions,
            isAuthenticated: true,
            isLoading:       false,
          });
        },

        clearSession: () => {
          set({ ...initialState, isLoading: false });
        },

        setLoading: (loading) => set({ isLoading: loading }),

        hasPermission: (permission) => {
          return get().permissions.includes(permission);
        },

        hasAnyPermission: (permissions) => {
          const userPerms = get().permissions;
          return permissions.some((p) => userPerms.includes(p));
        },

        hasAllPermissions: (permissions) => {
          const userPerms = get().permissions;
          return permissions.every((p) => userPerms.includes(p));
        },
      }),
      {
        name: 'platform-session',
        // Nothing is persisted — all session state is rebuilt from the JWT on
        // every page load via syncSessionToStore. Persisting organization caused
        // stale org data to survive tenant switches and token refreshes.
        partialize: () => ({}),
      },
    ),
    { name: 'SessionStore' },
  ),
);
