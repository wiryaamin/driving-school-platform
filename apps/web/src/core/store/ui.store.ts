import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface UiState {
  sidebarCollapsed: boolean;
  activeModuleKey: string | null;
  isMobileMenuOpen: boolean;
  theme: Theme;
}

interface UiActions {
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveModule: (key: string | null) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

type UiStore = UiState & UiActions;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUiStore = create<UiStore>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        activeModuleKey: null,
        isMobileMenuOpen: false,
        theme: 'light',

        toggleSidebarCollapsed: () =>
          set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

        setActiveModule: (key) => set({ activeModuleKey: key }),

        toggleMobileMenu: () =>
          set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),

        closeMobileMenu: () => set({ isMobileMenuOpen: false }),

        setTheme: (theme) => set({ theme }),

        toggleTheme: () =>
          set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      }),
      {
        name: 'platform-ui',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
          theme: state.theme,
        }),
      }
    ),
    { name: 'UiStore' }
  )
);
