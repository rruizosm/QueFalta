import type { CatalogStore } from './constants/stores';

// ─── Mercadona API types ──────────────────────────────────────────────────────

export interface CategoriesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: N1Category[];
}

export interface N1Category {
  id: number;
  name: string;
  order: number;
  is_extended: boolean;
  categories: N2CategoryBrief[];
}

export interface N2CategoryBrief {
  id: number;
  name: string;
  order: number;
  layout: number;
  published: boolean;
}

export interface N2CategoryDetail {
  id: number;
  name: string;
  categories: ProductGroup[];
}

export interface ProductGroup {
  id: number;
  name: string;
  products: MercadonaProduct[];
}

export interface MercadonaProduct {
  id: string;
  slug: string;
  display_name: string;
  packaging: string;
  thumbnail: string;
  price_instructions: PriceInstructions;
  published: boolean;
  /** No viene en el listado de la API; lo adjunta el espejo (api/catalog) con la
   *  categoría N2 bajo la que se sincronizó, para que la Lista agrupe por zona al
   *  añadir desde búsqueda/navegación. El detalle (MercadonaProductDetail) sí la trae. */
  categories?: { id: number; name: string }[];
  /** CCAA donde el producto es EXCLUSIVO (no está en el almacén nacional mad1), o
   *  null/[] si es nacional. Lo adjunta el espejo desde la columna `regions`
   *  (calculada por el sync multi-almacén). Dispara la insignia de exclamación. */
  regions?: string[] | null;
}

export interface PriceInstructions {
  unit_price: string;
  bulk_price: string;
  unit_size: number;
  size_format: string;
  reference_price: string;
  reference_format: string;
}

/** Full product detail from GET /api/products/{id}/. Fields are defensive (optional). */
export interface MercadonaProductDetail {
  id: string;
  slug?: string;
  ean?: string;
  display_name: string;
  thumbnail?: string;
  packaging?: string;
  brand?: string | null;
  origin?: string | null;
  share_url?: string;
  price_instructions: PriceInstructions;
  photos?: ProductPhoto[];
  categories?: { id: number; name: string }[];
  details?: ProductDetails;
  nutrition_information?: {
    allergens?: string | null;
    ingredients?: string | null;
  };
}

export interface ProductPhoto {
  thumbnail?: string;
  regular?: string;
  zoom?: string;
  perspective?: number;
}

export interface ProductDetails {
  description?: string | null;
  counter_info?: string | null;
  legal_name?: string | null;
  usage_instructions?: string | null;
  storage_instructions?: string | null;
  brand?: string | null;
  origin?: string | null;
  suppliers?: { name: string }[];
  mandatory_mentions?: string | null;
  danger_mentions?: string | null;
}

// ─── App UI types (existing screens) ─────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  subcategoryCount: number;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number;
  subcategoryId: string;
  quantity: number;
}

export interface ListItem {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  inCart: boolean;
  categoryEmoji: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  createdAt: Date;
  items: ListItem[];
  groupId?: string;
}

export interface GroupMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string | null;
  /** Cuenta verificada (insignia dorada). Ver profile_verified.sql. */
  verified?: boolean;
}

export interface ActivityEntry {
  id: string;
  memberId: string;
  memberName: string;
  memberInitials: string;
  memberColor: string;
  action: string;
  item?: string;
  time: string;
}

export interface Group {
  id: string;
  name: string;
  listId: string;
  totalItems: number;
  doneItems: number;
  lastActivity: string;
  members: GroupMember[];
  activity: ActivityEntry[];
}

// ─── Favoritos ────────────────────────────────────────────────────────────────

export interface FavoriteCategory {
  /** Súper al que pertenece la categoría (parte de la identidad del favorito). */
  store: CatalogStore;
  /** id de la categoría (N1 de Mercadona o id del espejo) como string */
  refId: string;
  name: string;
  emoji: string;
  color: string;
}

export interface FavoriteProduct {
  /** Súper al que pertenece el producto (parte de la identidad del favorito). */
  store: CatalogStore;
  /** id de producto en su súper */
  refId: string;
  name: string;
  imageUrl?: string | null;
  /** unit_price tal cual lo da la API (snapshot) */
  price?: string | null;
}

// ─── Navigation param types ───────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Catalog: undefined;
  List: undefined;
  Groups: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Favorites: undefined;
  NewArrivals: undefined;
  PriceChanges: undefined;
  Offers: undefined;
  Profile: undefined;
  EditProfile: undefined;
  PrivacySecurity: undefined;
  CatalogStores: undefined;
  Appearance: undefined;
  Language: undefined;
  History: undefined;
  Friends: undefined;
  Help: undefined;
  About: undefined;
};

export type CatalogStackParamList = {
  CatalogHome: undefined;
  SubCategory: {
    categoryName: string;
    emoji?: string;
    color?: string;
    /** Subcategorías N2. Mercadona usa ids numéricos; el resto de espejos, ids string. */
    subcategories: { id: string | number; name: string }[];
    retailer?: 'mercadona' | 'esclat' | 'carrefour' | 'bonarea' | 'consum' | 'dia' | 'sorli' | 'eroski' | 'caprabo';
  };
  Products: {
    subcategoryId: number;
    subcategoryName: string;
    categoryName: string;
    emoji?: string;
    color?: string;
  };
  /** Productos de una subcategoría de BonpreuEsclat (lee del espejo). */
  BonpreuProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de Carrefour (lee del espejo). */
  CarrefourProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de bonÀrea (lee del espejo). */
  BonareaProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de Consum (lee del espejo). */
  ConsumProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de Dia (lee del espejo). */
  DiaProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de Sorli (lee del espejo). */
  SorliProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de Eroski (lee del espejo). */
  EroskiProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
  /** Productos de una subcategoría de Caprabo (lee del espejo). */
  CapraboProducts: {
    categoryId: string;
    categoryName: string;
    parentName?: string;
  };
};

export type GroupsStackParamList = {
  GroupsHome: undefined;
  GroupDetail: { groupId: string };
  GroupMembers: { groupId: string };
  AddMember: { groupId: string };
};

/** Asistente de bienvenida (primera vez). Se muestra cuando hay sesión pero el
 *  perfil aún no tiene onboarded_at. Empieza por el idioma (Language), luego
 *  pasos obligatorios (Username, Stores) y opcionales (Avatar, Friends, Group).
 *  Ver src/screens/onboarding/. */
export type OnboardingStackParamList = {
  Welcome: undefined;
  Language: undefined;
  Name: undefined;
  Username: undefined;
  Stores: undefined;
  Avatar: undefined;
  Friends: undefined;
  Group: undefined;
  Done: undefined;
};
