import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  const activeCartRef = useRef<ActiveCart | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOperationsRef = useRef(0);
  const cartOperationVersionRef = useRef(0);

  const updateActiveCartState = useCallback((next: ActiveCart | null) => {
    activeCartRef.current = next;
    setActiveCart(next);
  }, []);

  /**
   * Serializa activación, desactivación, repetición y altas de productos. Así
   * una respuesta lenta nunca puede sobrescribir una selección posterior.
   */
  const runCartOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    cartOperationVersionRef.current += 1;
    pendingOperationsRef.current += 1;
    setBusy(true);
    const run = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = run.then(() => undefined, () => undefined);
    return run.finally(() => {
      pendingOperationsRef.current -= 1;
      if (pendingOperationsRef.current === 0) setBusy(false);
    });
  }, []);

  const activateCart = (groupId: string, groupName: string, groupIcon?: string | null) => {
    if (!userId) return Promise.resolve();
    return runCartOperation(async () => {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const current = activeCartRef.current;
      const next = {
        groupId,
        groupName,
        groupIcon: groupIcon === undefined && current?.groupId === groupId
          ? current.groupIcon ?? null
          : groupIcon ?? null,
        listId,
      };
      updateActiveCartState(next);
      await AsyncStorage.setItem(cartKey, JSON.stringify(next));
    });
  };

  // Restore persisted active cart on launch / login.
  useEffect(() => {
    if (!userId) { updateActiveCartState(null); setHydratedUserId(null); return; }
    let cancelled = false;
    const restoreOperationVersion = cartOperationVersionRef.current;

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

      // Una acción iniciada mientras se leía el disco tiene prioridad sobre la
      // restauración antigua (p. ej. activar desde un enlace profundo).
      if (cartOperationVersionRef.current === restoreOperationVersion) {
        updateActiveCartState(restoredCart);
      }

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
          const current = activeCartRef.current;
          if (
            cartOperationVersionRef.current !== restoreOperationVersion
            || current?.groupId !== restoredCart.groupId
            || current.listId !== restoredCart.listId
          ) return;
          const restoredGroup = groups.find((g) => g.id === restoredCart.groupId);
          if (!restoredGroup) {
            await AsyncStorage.removeItem(cartKey);
            if (!cancelled) updateActiveCartState(null);
          } else {
            const synced = {
              ...restoredCart,
              groupName: restoredGroup.name,
              groupIcon: restoredGroup.iconEmoji ?? null,
            };
            if (!cancelled) updateActiveCartState(synced);
            await AsyncStorage.setItem(cartKey, JSON.stringify(synced));
          }
        } catch { /* sin red: mantener lo guardado */ }
      }
    })();

    return () => { cancelled = true; };
  }, [cartKey, dgKey, updateActiveCartState, userId]);

  const deactivateCart = () => runCartOperation(async () => {
    updateActiveCartState(null);
    await AsyncStorage.removeItem(cartKey);
  });

  const updateActiveCartIcon = (groupId: string, groupIcon: string) => runCartOperation(async () => {
    const current = activeCartRef.current;
    if (!current || current.groupId !== groupId) return;
    const next = { ...current, groupIcon };
    updateActiveCartState(next);
    await AsyncStorage.setItem(cartKey, JSON.stringify(next));
  });

  const addToActiveCart = (items: NewListItem[]) => runCartOperation(async () => {
    const current = activeCartRef.current;
    if (!current || !userId) throw new Error('No hay carrito activo');
    await addItemsToList(current.listId, items, userId);
  });

  const loadItemsIntoGroupCart = async (
    groupId: string,
    groupName: string,
    items: NewListItem[],
    groupIcon?: string | null,
  ) => {
    if (!userId) return Promise.resolve();
    return runCartOperation(async () => {
      const listId = await getOrCreateGroupList(groupId, groupName, userId);
      const current = activeCartRef.current;
      const next = {
        groupId,
        groupName,
        groupIcon: groupIcon === undefined && current?.groupId === groupId
          ? current.groupIcon ?? null
          : groupIcon ?? null,
        listId,
      };
      updateActiveCartState(next);
      await AsyncStorage.setItem(cartKey, JSON.stringify(next));
      await addItemsToList(listId, items, userId);
    });
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
