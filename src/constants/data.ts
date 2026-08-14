import { Category, Subcategory, Product, ShoppingList, Group } from '../types';

export const CATEGORIES: Category[] = [
  { id: 'c1', name: 'Frutas y verduras', subcategoryCount: 8, emoji: '🥦', color: '#2f9e44' },
  { id: 'c2', name: 'Carnes y pescados', subcategoryCount: 6, emoji: '🥩', color: '#e03131' },
  { id: 'c3', name: 'Lácteos y huevos', subcategoryCount: 5, emoji: '🥛', color: '#1971c2' },
  { id: 'c4', name: 'Panadería', subcategoryCount: 4, emoji: '🍞', color: '#e8590c' },
  { id: 'c5', name: 'Bebidas', subcategoryCount: 7, emoji: '🧃', color: '#0c8599' },
  { id: 'c6', name: 'Conservas y legumbres', subcategoryCount: 9, emoji: '🥫', color: '#f08c00' },
  { id: 'c7', name: 'Aceites y salsas', subcategoryCount: 5, emoji: '🫙', color: '#9c36b5' },
  { id: 'c8', name: 'Pasta, arroz y cereales', subcategoryCount: 6, emoji: '🍝', color: '#e8590c' },
  { id: 'c9', name: 'Snacks y frutos secos', subcategoryCount: 4, emoji: '🥜', color: '#f08c00' },
  { id: 'c10', name: 'Higiene y cuidado personal', subcategoryCount: 10, emoji: '🧴', color: '#1971c2' },
  { id: 'c11', name: 'Limpieza del hogar', subcategoryCount: 8, emoji: '🧹', color: '#0c8599' },
  { id: 'c12', name: 'Congelados', subcategoryCount: 5, emoji: '🧊', color: '#1971c2' },
];

export const SUBCATEGORIES: Subcategory[] = [
  { id: 's1', categoryId: 'c9', name: 'Frutos secos' },
  { id: 's2', categoryId: 'c9', name: 'Snacks salados' },
  { id: 's3', categoryId: 'c9', name: 'Palomitas y aperitivos' },
  { id: 's4', categoryId: 'c9', name: 'Fruta deshidratada' },
  { id: 's5', categoryId: 'c1', name: 'Frutas' },
  { id: 's6', categoryId: 'c1', name: 'Verduras' },
  { id: 's7', categoryId: 'c1', name: 'Ensaladas' },
  { id: 's8', categoryId: 'c3', name: 'Leche' },
  { id: 's9', categoryId: 'c3', name: 'Yogures' },
  { id: 's10', categoryId: 'c3', name: 'Quesos' },
];

export const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Almendras tostadas', unit: '200 g', price: 2.75, subcategoryId: 's1', quantity: 0 },
  { id: 'p2', name: 'Nueces peladas', unit: '200 g', price: 3.15, subcategoryId: 's1', quantity: 0 },
  { id: 'p3', name: 'Anacardos tostados', unit: '150 g', price: 2.95, subcategoryId: 's1', quantity: 0 },
  { id: 'p4', name: 'Pistachos sin cáscara', unit: '130 g', price: 3.45, subcategoryId: 's1', quantity: 0 },
  { id: 'p5', name: 'Mix de frutos secos', unit: '250 g', price: 3.20, subcategoryId: 's1', quantity: 0 },
  { id: 'p6', name: 'Cacahuetes tostados', unit: '300 g', price: 1.85, subcategoryId: 's1', quantity: 0 },
  { id: 'p7', name: 'Avellanas enteras', unit: '200 g', price: 2.65, subcategoryId: 's1', quantity: 0 },
  { id: 'p8', name: 'Pipas de girasol', unit: '170 g', price: 1.15, subcategoryId: 's1', quantity: 0 },
];

export const ACTIVE_LIST: ShoppingList = {
  id: 'l1',
  name: 'Compra semanal',
  createdAt: new Date(),
  items: [
    { id: 'i1', productName: 'Leche entera', quantity: 2, unit: 'l', inCart: true, categoryEmoji: '🥛' },
    { id: 'i2', productName: 'Plátanos', quantity: 6, unit: 'ud', inCart: true, categoryEmoji: '🍌' },
    { id: 'i3', productName: 'Pan de molde', quantity: 1, unit: 'ud', inCart: false, categoryEmoji: '🍞' },
    { id: 'i4', productName: 'Huevos camperos', quantity: 12, unit: 'ud', inCart: false, categoryEmoji: '🥚' },
    { id: 'i5', productName: 'Almendras tostadas', quantity: 1, unit: 'bolsa', inCart: true, categoryEmoji: '🥜' },
    { id: 'i6', productName: 'Yogur natural', quantity: 4, unit: 'ud', inCart: false, categoryEmoji: '🥛' },
    { id: 'i7', productName: 'Tomates cherry', quantity: 1, unit: 'bandeja', inCart: false, categoryEmoji: '🍅' },
    { id: 'i8', productName: 'Café molido', quantity: 1, unit: 'paquete', inCart: true, categoryEmoji: '☕' },
  ],
};

export const GROUPS: Group[] = [
  {
    id: 'g1',
    name: 'Casa',
    listId: 'l1',
    totalItems: 20,
    doneItems: 12,
    lastActivity: 'hace 5 min',
    members: [
      { id: 'm1', name: 'Rubén', initials: 'RU', color: '#2f9e44' },
      { id: 'm2', name: 'María', initials: 'MA', color: '#1971c2' },
      { id: 'm3', name: 'Carlos', initials: 'CA', color: '#e8590c' },
      { id: 'm4', name: 'Laura', initials: 'LA', color: '#9c36b5' },
    ],
    activity: [
      { id: 'a1', memberId: 'm2', memberName: 'María', memberInitials: 'MA', memberColor: '#1971c2', action: 'añadió', item: 'Leche entera ×2', time: 'hace 5 min' },
      { id: 'a2', memberId: 'm1', memberName: 'Rubén', memberInitials: 'RU', memberColor: '#2f9e44', action: 'marcó como recogido', item: 'Café molido', time: 'hace 12 min' },
      { id: 'a3', memberId: 'm3', memberName: 'Carlos', memberInitials: 'CA', memberColor: '#e8590c', action: 'se unió al grupo', time: 'hace 1 h' },
    ],
  },
  {
    id: 'g2',
    name: 'Fiesta cumple Leo',
    listId: 'l2',
    totalItems: 15,
    doneItems: 3,
    lastActivity: 'hace 2 h',
    members: [
      { id: 'm1', name: 'Rubén', initials: 'RU', color: '#2f9e44' },
      { id: 'm5', name: 'Leo', initials: 'LE', color: '#f08c00' },
      { id: 'm6', name: 'Ana', initials: 'AN', color: '#e03131' },
      { id: 'm7', name: 'Pedro', initials: 'PE', color: '#0c8599' },
      { id: 'm8', name: 'Noe', initials: 'NO', color: '#9c36b5' },
      { id: 'm9', name: 'Sara', initials: 'SA', color: '#e8590c' },
    ],
    activity: [
      { id: 'a4', memberId: 'm5', memberName: 'Leo', memberInitials: 'LE', memberColor: '#f08c00', action: 'añadió', item: 'Vino tinto ×3', time: 'hace 2 h' },
    ],
  },
  {
    id: 'g3',
    name: 'Oficina',
    listId: 'l3',
    totalItems: 8,
    doneItems: 8,
    lastActivity: 'ayer',
    members: [
      { id: 'm1', name: 'Rubén', initials: 'RU', color: '#2f9e44' },
      { id: 'm2', name: 'María', initials: 'MA', color: '#1971c2' },
      { id: 'm10', name: 'Jorge', initials: 'JO', color: '#0c8599' },
    ],
    activity: [],
  },
  {
    id: 'g4',
    name: 'Finde escapada',
    listId: 'l4',
    totalItems: 12,
    doneItems: 0,
    lastActivity: 'hace 3 días',
    members: [
      { id: 'm1', name: 'Rubén', initials: 'RU', color: '#2f9e44' },
    ],
    activity: [],
  },
];
