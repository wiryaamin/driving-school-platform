import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { LucideIcon } from 'lucide-react';

type Theme = 'light' | 'dark';

export interface PageTitle {
  text: string;
  icon?: LucideIcon | undefined;
}

// ─── State Shape ──────────────────────────────────────────────────────────────

interface UiState {
  sidebarCollapsed: boolean;
  activeModuleKey: string | null;
  isMobileMenuOpen: boolean;
  theme: Theme;
  /** Current workspace's page title (+ optional icon), rendered by TopBar to
   * the left of the search pill — set by WorkspaceTabsLayout, cleared on
   * unmount. Ephemeral, not persisted. */
  pageTitle: PageTitle | null;
}

interface UiActions {
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveModule: (key: string | null) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setPageTitle: (title: PageTitle | null) => void;
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
        pageTitle: null,

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

        setPageTitle: (title) => set({ pageTitle: title }),
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
