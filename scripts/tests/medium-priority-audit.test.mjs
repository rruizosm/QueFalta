import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const listScreen = read('src/screens/ListScreen.tsx');
const groupDetail = read('src/screens/GroupDetailScreen.tsx');
const addMember = read('src/screens/AddMemberScreen.tsx');
const groupMembers = read('src/screens/GroupMembersScreen.tsx');
const productList = read('src/components/StoreProductList.tsx');
const productImage = read('src/components/ProductImage.tsx');
const catalog = read('src/screens/CatalogScreen.tsx');

test('Cesta no anima una altura por fila y expone controles accesibles', () => {
  assert.doesNotMatch(listScreen, /AnimatedZoneRow|ZONE_STAGGER_WINDOW_MS|useNativeDriver:\s*false/);
  assert.match(listScreen, /data: zoneCollapsed \? EMPTY_CART_ITEMS : zoneGroup\.data/);
  assert.match(listScreen, /accessibilityRole="checkbox"/);
  assert.match(listScreen, /accessibilityState=\{\{ checked: item\.inCart/);
  assert.match(listScreen, /accessibilityLabel=\{t\('list\.assignAllTitle'\)\}/);
  assert.match(listScreen, /accessibilityLabel=\{t\('list\.clearConfirm'\)\}/);
});

test('Detalle de grupo virtualiza una sola copia de la cesta', () => {
  assert.match(groupDetail, /const merged = useMemo\(\(\) => mergeCartItems\(items\)/);
  assert.match(groupDetail, /<SectionList/);
  assert.match(groupDetail, /\{!cartExpanded && \(/);
  assert.doesNotMatch(groupDetail, /<ScrollView/);
  assert.match(groupDetail, /accessibilityLabel=\{t\('group\.expandCartA11y'\)\}/);
  assert.match(groupDetail, /accessibilityLabel=\{t\('group\.collapseCartA11y'\)\}/);
});

test('Altas y acciones sensibles de miembros están serializadas y confirmadas', () => {
  assert.match(addMember, /const \[nextFriends, members\] = await Promise\.all/);
  assert.match(addMember, /setLoadError\(true\)/);
  assert.match(addMember, /if \(addingRef\.current \|\| memberIds\.has\(f\.id\)\) return/);
  assert.match(addMember, /disabled=\{addingId !== null\}/);
  assert.match(groupMembers, /pendingMemberAction/);
  assert.match(groupMembers, /requestMemberAction\('transfer'/);
  assert.match(groupMembers, /requestMemberAction\('remove'/);
  assert.match(groupMembers, /visible=\{!!pendingMemberAction\}/);
});

test('Catálogo responde al ancho actual y mantiene fallback visual', () => {
  assert.match(productList, /useWindowDimensions\(\)/);
  assert.doesNotMatch(productList, /Dimensions\.get\('window'\)/);
  assert.match(productList, /key=\{`grid-\$\{gridColumns\}`\}/);
  assert.match(catalog, /accessibilityLabel: t\('product\.viewList'\)/);
  assert.match(catalog, /accessibilityLabel: t\('product\.viewGrid'\)/);
  assert.match(productImage, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(productImage, /name="basket-outline"/);
});
