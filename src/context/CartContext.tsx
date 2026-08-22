import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getOrCreateGroupList, addItemsToList, type NewListItem } from '../api/lists';
import { fetchMyGroups } from '../api/groups';
import { primeTabCaches, startupKeys, writeStartupCache } from '../lib/startupCache';

// Clave base. El carrito activo se persiste POR USUARIO (`${KEY}:${userId}`)
// para que NO se filtre entre cuentas del mismo dispositivo. La clave global
// antigua se limpia al restaurar (legacy).
const STORAGE_KEY = 'activeCart';
// Clave legacy del "grupo por defecto" (feature eliminada): se limpia al restaurar.
const DEFAULT_GROUP_KEY = 'defaultGroup';

interface ActiveCart {
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  listId: string;
}

interface CartContextValue {
  activeCart: ActiveCart | null;
  /** Marks a group's cart as the active one (only one can be active per user). */
  activateCart: (groupId: string, groupName: string, groupIcon?: string | null) => Promise<void>;
  /** Actualiza el icono cacheado si el grupo editado es el carrito activo. */
  updateActiveCartIcon: (groupId: string, groupIcon: string) => Promise<void>;
  /** Clears the active cart selection. */
  deactivateCart: () => Promise<void>;
  /** Adds items to the active cart. Throws if no cart is active. */
  addToActiveCart: (items: NewListItem[]) => Promise<void>;
  /** Activates a group's cart and loads the given items into it (e.g. "repeat purchase"). */
  loadItemsIntoGroupCart: (groupId: string, groupName: string, items: NewListItem[], groupIcon?: string | null) => Promise<void>;
  isActive: (groupId: string) => boolean;
  busy: boolean;
  /** AsyncStorage del carrito y snapshots de pestañas ya está hidratado. */
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue>({
  activeCart: null,
  activateCart: async () => {},
  updateActiveCartIcon: async () => {},
  deactivateCart: async () => {},
  addToActiveCart: async () => {},
  loadItemsIntoGroupCart: async () => {},
  isActive: () => false,
  busy: false,
  hydrated: false,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  // Clave por usuario (evita que el carrito se filtre entre cuentas).
  const cartKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  const dgKey   = userId ? `${DEFAULT_GROUP_KEY}:${userId}` : DEFAULT_GROUP_KEY;

  const [activeCart, setActiveCart] = useState<ActiveCart | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  const activateCart = async (groupId: string, groupName: string, groupIcon?: string | null) => {
    if (!userId) return;
    setBusy(true);
    try {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const next = {
        groupId,
        groupName,
        groupIcon: groupIcon === undefined && activeCart?.groupId === groupId
          ? activeCart.groupIcon ?? null
          : groupIcon ?? null,
        listId,
      };
      setActiveCart(next);
      await AsyncStorage.setItem(cartKey, JSON.stringify(next));
    } finally {
      setBusy(false);
    }
  };

  // Restore persisted active cart on launch / login.
  useEffect(() => {
    if (!userId) { setActiveCart(null); setHydratedUserId(null); return; }
    let cancelled = false;

    (async () => {
      // Limpia las claves globales heredadas (esquema antiguo, compartido entre
      // cuentas) y la clave legacy del "grupo por defecto" (feature eliminada).
      AsyncStorage.multiRemove([STORAGE_KEY, DEFAULT_GROUP_KEY, dgKey]).catch(() => {});

      const cartRaw = await AsyncStorage.getItem(cartKey);
      if (cancelled) return;

      let restoredCart: ActiveCart | null = null;
      if (cartRaw) {
        try {
          const parsed = JSON.parse(cartRaw) as Partial<ActiveCart>;
          if (parsed.groupId && parsed.groupName && parsed.listId) {
            restoredCart = {
              groupId: parsed.groupId,
              groupName: parsed.groupName,
              groupIcon: parsed.groupIcon ?? null,
              listId: parsed.listId,
            };
          }
        } catch { /* ignore */ }
      }

      // Optimista (la clave ya es por-usuario → en el caso normal es válida).
      setActiveCart(restoredCart);

      // Antes de montar Home, precarga del disco todo lo que consumen las
      // pestañas. Es lectura local y evita que cada pantalla nazca vacía.
      await primeTabCaches(userId, restoredCart);
      if (cancelled) return;
      setHydratedUserId(userId);

      // Valida que siga apuntando a un grupo REAL del usuario: cubre el grupo
      // borrado o del que se salió. Si la red falla, conserva lo guardado.
      if (restoredCart) {
        try {
          const groups = await fetchMyGroups(userId);
          writeStartupCache(startupKeys.groups(userId), groups);
          if (cancelled) return;
          const restoredGroup = groups.find((g) => g.id === restoredCart.groupId);
          if (!restoredGroup) {
            await AsyncStorage.removeItem(cartKey);
            if (!cancelled) setActiveCart(null);
          } else {
            const synced = {
              ...restoredCart,
              groupName: restoredGroup.name,
              groupIcon: restoredGroup.iconEmoji ?? null,
            };
            if (!cancelled) setActiveCart(synced);
            await AsyncStorage.setItem(cartKey, JSON.stringify(synced));
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

  const updateActiveCartIcon = async (groupId: string, groupIcon: string) => {
    if (!activeCart || activeCart.groupId !== groupId) return;
    const next = { ...activeCart, groupIcon };
    setActiveCart(next);
    await AsyncStorage.setItem(cartKey, JSON.stringify(next));
  };

  const addToActiveCart = async (items: NewListItem[]) => {
    if (!activeCart || !userId) throw new Error('No hay carrito activo');
    await addItemsToList(activeCart.listId, items, userId);
  };

  const loadItemsIntoGroupCart = async (
    groupId: string,
    groupName: string,
    items: NewListItem[],
    groupIcon?: string | null,
  ) => {
    if (!userId) return;
    setBusy(true);
    try {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const next = {
        groupId,
        groupName,
        groupIcon: groupIcon === undefined && activeCart?.groupId === groupId
          ? activeCart.groupIcon ?? null
          : groupIcon ?? null,
        listId,
      };
      setActiveCart(next);
      await AsyncStorage.setItem(cartKey, JSON.stringify(next));
      await addItemsToList(listId, items, userId);
    } finally {
      setBusy(false);
    }
  };

  const isActive = (groupId: string) => activeCart?.groupId === groupId;
  // Al cambiar de cuenta, no reutilices durante un render el estado hidratado
  // de la anterior: el id resuelto debe coincidir con la sesión actual.
  const hydrated = !userId || hydratedUserId === userId;

  return (
    <CartContext.Provider
      value={{
        activeCart, activateCart, updateActiveCartIcon, deactivateCart, addToActiveCart, loadItemsIntoGroupCart, isActive, busy, hydrated,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  return useContext(CartContext);
}
