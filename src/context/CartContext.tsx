import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getOrCreateGroupList, addItemsToList, type NewListItem } from '../api/lists';
import { fetchMyGroups } from '../api/groups';

// Clave base. El carrito activo se persiste POR USUARIO (`${KEY}:${userId}`)
// para que NO se filtre entre cuentas del mismo dispositivo. La clave global
// antigua se limpia al restaurar (legacy).
const STORAGE_KEY = 'activeCart';
// Clave legacy del "grupo por defecto" (feature eliminada): se limpia al restaurar.
const DEFAULT_GROUP_KEY = 'defaultGroup';

interface ActiveCart {
  groupId: string;
  groupName: string;
  listId: string;
}

interface CartContextValue {
  activeCart: ActiveCart | null;
  /** Marks a group's cart as the active one (only one can be active per user). */
  activateCart: (groupId: string, groupName: string) => Promise<void>;
  /** Clears the active cart selection. */
  deactivateCart: () => Promise<void>;
  /** Adds items to the active cart. Throws if no cart is active. */
  addToActiveCart: (items: NewListItem[]) => Promise<void>;
  /** Activates a group's cart and loads the given items into it (e.g. "repeat purchase"). */
  loadItemsIntoGroupCart: (groupId: string, groupName: string, items: NewListItem[]) => Promise<void>;
  isActive: (groupId: string) => boolean;
  busy: boolean;
}

const CartContext = createContext<CartContextValue>({
  activeCart: null,
  activateCart: async () => {},
  deactivateCart: async () => {},
  addToActiveCart: async () => {},
  loadItemsIntoGroupCart: async () => {},
  isActive: () => false,
  busy: false,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  // Clave por usuario (evita que el carrito se filtre entre cuentas).
  const cartKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  const dgKey   = userId ? `${DEFAULT_GROUP_KEY}:${userId}` : DEFAULT_GROUP_KEY;

  const [activeCart, setActiveCart] = useState<ActiveCart | null>(null);
  const [busy, setBusy] = useState(false);

  const activateCart = async (groupId: string, groupName: string) => {
    if (!userId) return;
    setBusy(true);
    try {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const next = { groupId, groupName, listId };
      setActiveCart(next);
      await AsyncStorage.setItem(cartKey, JSON.stringify(next));
    } finally {
      setBusy(false);
    }
  };

  // Restore persisted active cart on launch / login.
  useEffect(() => {
    if (!userId) { setActiveCart(null); return; }
    let cancelled = false;

    (async () => {
      // Limpia las claves globales heredadas (esquema antiguo, compartido entre
      // cuentas) y la clave legacy del "grupo por defecto" (feature eliminada).
      AsyncStorage.multiRemove([STORAGE_KEY, DEFAULT_GROUP_KEY, dgKey]).catch(() => {});

      const cartRaw = await AsyncStorage.getItem(cartKey);
      if (cancelled) return;

      let restoredCart: ActiveCart | null = null;
      if (cartRaw) { try { restoredCart = JSON.parse(cartRaw); } catch { /* ignore */ } }

      // Optimista (la clave ya es por-usuario → en el caso normal es válida).
      setActiveCart(restoredCart);

      // Valida que siga apuntando a un grupo REAL del usuario: cubre el grupo
      // borrado o del que se salió. Si la red falla, conserva lo guardado.
      if (restoredCart) {
        try {
          const groups = await fetchMyGroups();
          if (cancelled) return;
          const ids = new Set(groups.map((g) => g.id));
          if (!ids.has(restoredCart.groupId)) {
            await AsyncStorage.removeItem(cartKey);
            if (!cancelled) setActiveCart(null);
          }
        } catch { /* sin red: mantener lo guardado */ }
      }
    })();

    return () => { cancelled = true; };
  }, [cartKey, dgKey, userId]);

  const deactivateCart = async () => {
    setActiveCart(null);
    await AsyncStorage.removeItem(cartKey);
  };

  const addToActiveCart = async (items: NewListItem[]) => {
    if (!activeCart || !userId) throw new Error('No hay carrito activo');
    await addItemsToList(activeCart.listId, items, userId);
  };

  const loadItemsIntoGroupCart = async (groupId: string, groupName: string, items: NewListItem[]) => {
    if (!userId) return;
    setBusy(true);
    try {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const next = { groupId, groupName, listId };
      setActiveCart(next);
      await AsyncStorage.setItem(cartKey, JSON.stringify(next));
      await addItemsToList(listId, items, userId);
    } finally {
      setBusy(false);
    }
  };

  const isActive = (groupId: string) => activeCart?.groupId === groupId;

  return (
    <CartContext.Provider
      value={{
        activeCart, activateCart, deactivateCart, addToActiveCart, loadItemsIntoGroupCart, isActive, busy,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  return useContext(CartContext);
}
