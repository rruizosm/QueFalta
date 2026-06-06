import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getOrCreateGroupList, addItemsToList, type NewListItem } from '../api/lists';

const STORAGE_KEY = 'activeCart';
const DEFAULT_GROUP_KEY = 'defaultGroup';

interface ActiveCart {
  groupId: string;
  groupName: string;
  listId: string;
}

interface DefaultGroup {
  groupId: string;
  groupName: string;
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
  /** Grupo por defecto: su carrito se auto-activa al abrir si no hay otro activo. */
  defaultGroup: DefaultGroup | null;
  setDefaultGroup: (groupId: string, groupName: string) => Promise<void>;
  clearDefaultGroup: () => Promise<void>;
}

const CartContext = createContext<CartContextValue>({
  activeCart: null,
  activateCart: async () => {},
  deactivateCart: async () => {},
  addToActiveCart: async () => {},
  loadItemsIntoGroupCart: async () => {},
  isActive: () => false,
  busy: false,
  defaultGroup: null,
  setDefaultGroup: async () => {},
  clearDefaultGroup: async () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [activeCart, setActiveCart] = useState<ActiveCart | null>(null);
  const [defaultGroup, setDefaultGroupState] = useState<DefaultGroup | null>(null);
  const [busy, setBusy] = useState(false);

  const activateCart = async (groupId: string, groupName: string) => {
    if (!userId) return;
    setBusy(true);
    try {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const next = { groupId, groupName, listId };
      setActiveCart(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } finally {
      setBusy(false);
    }
  };

  // Restore persisted state on launch / login, then auto-activate the default
  // group's cart if nothing else is active.
  useEffect(() => {
    if (!userId) { setActiveCart(null); setDefaultGroupState(null); return; }
    let cancelled = false;

    (async () => {
      const [cartRaw, dgRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(DEFAULT_GROUP_KEY),
      ]);
      if (cancelled) return;

      let restoredCart: ActiveCart | null = null;
      if (cartRaw) { try { restoredCart = JSON.parse(cartRaw); } catch { /* ignore */ } }
      let dg: DefaultGroup | null = null;
      if (dgRaw) { try { dg = JSON.parse(dgRaw); } catch { /* ignore */ } }

      setActiveCart(restoredCart);
      setDefaultGroupState(dg);

      if (!restoredCart && dg) {
        activateCart(dg.groupId, dg.groupName).catch(() => { /* ignore */ });
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const setDefaultGroup = async (groupId: string, groupName: string) => {
    const dg = { groupId, groupName };
    setDefaultGroupState(dg);
    await AsyncStorage.setItem(DEFAULT_GROUP_KEY, JSON.stringify(dg));
  };

  const clearDefaultGroup = async () => {
    setDefaultGroupState(null);
    await AsyncStorage.removeItem(DEFAULT_GROUP_KEY);
  };

  const deactivateCart = async () => {
    setActiveCart(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
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
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
        defaultGroup, setDefaultGroup, clearDefaultGroup,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  return useContext(CartContext);
}
