/**
 * AppContext — reserved for future global state (e.g. persistent cart).
 * Currently unused by existing screens; they read from constants/data directly.
 * Internal types are kept separate from src/types.ts to avoid conflicts.
 */
import React, { createContext, useContext } from 'react';

interface AppContextValue {
  placeholder: true;
}

const AppContext = createContext<AppContextValue>({ placeholder: true });

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppContext.Provider value={{ placeholder: true }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  return useContext(AppContext);
}
