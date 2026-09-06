import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { StoreSelection } from '../components/StoreDropdown';
import { useAuth } from './AuthContext';

interface CatalogStoreContextValue {
  store: StoreSelection;
  setStore: React.Dispatch<React.SetStateAction<StoreSelection>>;
}

const CatalogStoreContext = createContext<CatalogStoreContextValue | null>(null);

/**
 * Seleccion unica para las cuatro vistas del catalogo. Vive por encima de los
 * navegadores Home/Catalog para que cambiar de pestaña o abrir una pantalla de
 * novedades no reinicie el supermercado activo.
 */
export function CatalogStoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [store, setStore] = useState<StoreSelection>('mercadona');

  // El estado es de sesion, no una preferencia compartida entre cuentas que
  // usen el mismo dispositivo.
  useEffect(() => {
    setStore('mercadona');
  }, [userId]);

  const value = useMemo(() => ({ store, setStore }), [store]);
  return <CatalogStoreContext.Provider value={value}>{children}</CatalogStoreContext.Provider>;
}

export function useCatalogStore(): CatalogStoreContextValue {
  const context = useContext(CatalogStoreContext);
  if (!context) throw new Error('useCatalogStore must be used within CatalogStoreProvider');
  return context;
}
