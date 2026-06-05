import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type CatalogStackParamList = {
  CatalogHome: undefined;
  Subcategories: { categoryId: number; categoryName: string };
  Products: {
    subcategoryId: number;
    subcategoryName: string;
    categoryName: string;
  };
};

export type GroupsStackParamList = {
  GroupsList: undefined;
  GroupDetail: { groupId: string };
};

export type CatalogHomeProps = NativeStackScreenProps<CatalogStackParamList, 'CatalogHome'>;
export type SubcategoriesProps = NativeStackScreenProps<CatalogStackParamList, 'Subcategories'>;
export type ProductsProps = NativeStackScreenProps<CatalogStackParamList, 'Products'>;
export type GroupsListProps = NativeStackScreenProps<GroupsStackParamList, 'GroupsList'>;
export type GroupDetailProps = NativeStackScreenProps<GroupsStackParamList, 'GroupDetail'>;
