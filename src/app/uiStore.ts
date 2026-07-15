import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  showWeekends: boolean;
  weekView: 'teaching' | 'calendar' | 'personal' | 'everything';
  toggleSidebar: () => void;
  setShowWeekends: (value: boolean) => void;
  setWeekView: (value: UiState['weekView']) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  showWeekends: false,
  weekView: 'teaching',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setShowWeekends: (showWeekends) => set({ showWeekends }),
  setWeekView: (weekView) => set({ weekView }),
}));
