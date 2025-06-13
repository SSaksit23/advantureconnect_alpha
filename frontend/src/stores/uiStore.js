import { create } from 'zustand';

// --- Initial State Definition ---
const initialUiState = {
  // Modals: Store which modal is open and any props it needs
  // Example: { loginModal: { isOpen: false, props: {} }, profileModal: { isOpen: false, props: {} } }
  modals: {},

  // Global loading indicator (e.g., for full-page transitions or critical operations)
  // Can be a boolean or an object like { isActive: false, message: '' } for more context
  globalLoading: {
    isActive: false,
    message: null,
  },

  // Sidebar state
  sidebar: {
    isOpen: false,
    contentType: null, // e.g., 'notifications', 'userMenu', 'tripDetails'
    contextData: null, // Any data the sidebar content might need
  },

  // Theme (if your app supports light/dark mode managed globally)
  theme: 'light', // 'light' or 'dark'

  // Generic UI flags or states
  // Example: isMobileMenuOpen: false,
  // Example: currentOverlay: null, // For managing a stack of overlays
};

// --- Zustand Store Definition ---
export const useUiStore = create((set, get) => ({
  // --- State ---
  ...initialUiState,

  // --- Actions for Modals ---
  openModal: (modalId, props = {}) => {
    set((state) => ({
      modals: {
        ...state.modals,
        [modalId]: { isOpen: true, props },
      },
    }));
  },

  closeModal: (modalId) => {
    set((state) => ({
      modals: {
        ...state.modals,
        [modalId]: { isOpen: false, props: {} },
      },
    }));
  },

  closeAllModals: () => {
    set((state) => {
      const newModalsState = {};
      for (const modalId in state.modals) {
        newModalsState[modalId] = { isOpen: false, props: {} };
      }
      return { modals: newModalsState };
    });
  },

  // --- Actions for Global Loading ---
  setGlobalLoading: (isActive, message = null) => {
    set({ globalLoading: { isActive, message } });
  },

  // --- Actions for Sidebar ---
  openSidebar: (contentType = null, contextData = null) => {
    set({ sidebar: { isOpen: true, contentType, contextData } });
  },

  closeSidebar: () => {
    set({ sidebar: { isOpen: false, contentType: null, contextData: null } });
  },

  toggleSidebar: (contentType = null, contextData = null) => {
    set((state) => ({
      sidebar: state.sidebar.isOpen
        ? { isOpen: false, contentType: null, contextData: null }
        : { isOpen: true, contentType, contextData },
    }));
  },

  setSidebarContent: (contentType, contextData = null) => {
    set((state) => ({
      sidebar: { ...state.sidebar, contentType, contextData },
    }));
  },

  // --- Actions for Theme ---
  setTheme: (newTheme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      set({ theme: newTheme });
      // You might want to persist this to localStorage and update document.body class
      localStorage.setItem('adventureconnect-theme', newTheme);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newTheme);
    }
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('adventureconnect-theme', newTheme);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newTheme);
      return { theme: newTheme };
    });
  },
  
  // Initialize theme from localStorage or system preference
  initializeTheme: () => {
    const storedTheme = localStorage.getItem('adventureconnect-theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    set({ theme: initialTheme });
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(initialTheme);

    // Listen for changes in system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
        // Only change if no theme is explicitly stored by user
        if (!localStorage.getItem('adventureconnect-theme')) {
            const newSystemTheme = e.matches ? 'dark' : 'light';
            set({ theme: newSystemTheme });
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add(newSystemTheme);
        }
    };
    mediaQuery.addEventListener('change', handleChange);
    // Return a cleanup function for when the store is unmounted (though Zustand stores are global)
    // This is more relevant if this logic were in a React component's useEffect.
    // For a global store, this listener might live for the app's lifetime.
    // Consider if this listener needs to be removed if the app has a way to "unload" the store.
  },


  // --- Reset UI State ---
  resetUiState: () => {
    set(initialUiState);
    // Re-initialize theme as it might have a persisted value
    get().initializeTheme();
  },
}));

// --- Utility Hooks for Easy Access ---

// Actions hook
export const useUiActions = () => {
  const actions = useUiStore(
    (state) => ({
      openModal: state.openModal,
      closeModal: state.closeModal,
      closeAllModals: state.closeAllModals,
      setGlobalLoading: state.setGlobalLoading,
      openSidebar: state.openSidebar,
      closeSidebar: state.closeSidebar,
      toggleSidebar: state.toggleSidebar,
      setSidebarContent: state.setSidebarContent,
      setTheme: state.setTheme,
      toggleTheme: state.toggleTheme,
      initializeTheme: state.initializeTheme,
      resetUiState: state.resetUiState,
    }),
    // Shallow equality check for object of actions
    (oldState, newState) => Object.keys(oldState).every(key => oldState[key] === newState[key])
  );
  return actions;
};

// Selectors for specific parts of the UI state
export const useModalState = (modalId) => useUiStore((state) => state.modals[modalId] || { isOpen: false, props: {} });
export const useGlobalLoading = () => useUiStore((state) => state.globalLoading);
export const useSidebarState = () => useUiStore((state) => state.sidebar);
export const useCurrentTheme = () => useUiStore((state) => state.theme);

// Initialize theme when store is first imported/used.
// This ensures theme is set up as early as possible.
if (typeof window !== 'undefined') { // Check if running in browser
    useUiStore.getState().initializeTheme();
}

// Example Usage in a component:
/*
import { useUiStore, useUiActions, useModalState } from './stores/uiStore';

function MyComponent() {
  const { openModal, setGlobalLoading } = useUiActions();
  const { isOpen: isLoginModalOpen, props: loginModalProps } = useModalState('loginModal');
  const globalLoadingState = useGlobalLoading();

  const handleOpenLogin = () => {
    openModal('loginModal', { initialEmail: 'test@example.com' });
  };

  if (globalLoadingState.isActive) {
    return <p>Loading... {globalLoadingState.message}</p>;
  }

  return (
    <div>
      <button onClick={handleOpenLogin}>Open Login</button>
      {isLoginModalOpen && <LoginModal {...loginModalProps} />}
    </div>
  );
}
*/
