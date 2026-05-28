import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface UiState {
  sidebarCollapsed: boolean;
  activeModuleKey: string | null;
  isMobileMenuOpen: boolean;
}

interface UiActions {
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveModule: (key: string | null) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
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

        toggleSidebarCollapsed: () =>
          set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

        setActiveModule: (key) => set({ activeModuleKey: key }),

        toggleMobileMenu: () =>
          set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),

        closeMobileMenu: () => set({ isMobileMenuOpen: false }),
      }),
      {
        name: 'platform-ui',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      }
    ),
    { name: 'UiStore' }
  )
);
