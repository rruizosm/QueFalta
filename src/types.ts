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
  /** id de la categoría N1 de Mercadona como string */
  refId: string;
  name: string;
  emoji: string;
  color: string;
}

export interface FavoriteProduct {
  /** id de producto de Mercadona */
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
  Profile: undefined;
  EditProfile: undefined;
  PrivacySecurity: undefined;
  DefaultGroup: undefined;
  CatalogStores: undefined;
  Appearance: undefined;
  History: undefined;
  Friends: undefined;
};

export type CatalogStackParamList = {
  CatalogHome: undefined;
  SubCategory: {
    categoryName: string;
    emoji?: string;
    color?: string;
    /** Subcategorías N2. Mercadona usa ids numéricos; Bonpreu/Carrefour/bonÀrea/Consum/Dia, ids string. */
    subcategories: { id: string | number; name: string }[];
    retailer?: 'mercadona' | 'esclat' | 'carrefour' | 'bonarea' | 'consum' | 'dia';
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
};

export type GroupsStackParamList = {
  GroupsHome: undefined;
  GroupDetail: { groupId: string };
  GroupMembers: { groupId: string };
  AddMember: { groupId: string };
};
