export interface Category {
  id: string;
  name: string;
  subcategoryCount: number;
  emoji: string;
  color: string;
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
  items: ListItem[];
  createdAt: Date;
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
  members: GroupMember[];
  listId: string;
  totalItems: number;
  doneItems: number;
  lastActivity: string;
  activity: ActivityEntry[];
}

export type RootTabParamList = {
  Home: undefined;
  Catalog: undefined;
  List: undefined;
  Groups: undefined;
};

export type CatalogStackParamList = {
  CatalogHome: undefined;
  SubCategory: { categoryId: string; categoryName: string };
};

export type GroupsStackParamList = {
  GroupsHome: undefined;
  GroupDetail: { groupId: string };
};
