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
const viewModeToggle = read('src/components/ViewModeToggle.tsx');

test('Cesta no anima una altura por fila y expone controles accesibles', () => {
  assert.doesNotMatch(listScreen, /AnimatedZoneRow|ZONE_STAGGER_WINDOW_MS|useNativeDriver:\s*false/);
  assert.match(listScreen, /data: zoneCollapsed \? EMPTY_CART_ITEMS : zoneGroup\.data/);
  assert.match(listScreen, /accessibilityRole="checkbox"/);
  assert.match(listScreen, /checked: item\.inCart \|\| item\.deferredToNextPurchase/);
  assert.match(listScreen, /accessibilityLabel=\{t\('list\.assignAllTitle'\)\}/);
  assert.match(listScreen, /accessibilityLabel=\{t\('list\.clearConfirm'\)\}/);
});

test('Cesta mantiene una cabecera compacta con las acciones junto al título', () => {
  const header = listScreen.match(/const header = \([\s\S]*?const screenState =/)?.[0] ?? '';
  const titleRow = header.match(/<View style=\{styles\.titleWrap\}>[\s\S]*?<\/View>\n\s*<\/View>/)?.[0] ?? '';

  assert.doesNotMatch(header, /list\.subtitle|styles\.subtitleRow/);
  assert.match(titleRow, /styles\.headerActions/);
  assert.match(titleRow, /person-add-outline/);
  assert.match(titleRow, /trash-outline/);
});

test('Detalle de grupo virtualiza una sola copia de la cesta', () => {
  assert.match(groupDetail, /const merged = useMemo\(\(\) => mergeCartItems\(items\)/);
  assert.match(groupDetail, /<SectionList/);
  assert.match(groupDetail, /\{!cartExpanded && \(/);
  assert.doesNotMatch(groupDetail, /<ScrollView/);
  assert.match(groupDetail, /accessibilityLabel=\{t\('group\.expandCartA11y'\)\}/);
  assert.match(groupDetail, /accessibilityLabel=\{t\('group\.collapseCartA11y'\)\}/);
});

test('La cesta expandida conserva completos el progreso y los extremos del contenido', () => {
  assert.match(groupDetail, /modalProgress: \{[^}]*paddingTop: 12/);
  assert.match(groupDetail, /first && styles\.cartRowsSurfaceFirst/);
  assert.match(groupDetail, /section\.key === cartSections\[0\]\?\.key/);
  assert.match(groupDetail, /isLastCartItem && styles\.cartRowsSurfaceLast/);
  assert.match(groupDetail, /style=\{styles\.modalList\}/);
  assert.match(groupDetail, /cartRowsSurfaceFirst: \{[\s\S]*borderTopWidth: 1/);
  assert.match(groupDetail, /modalList: \{ flex: 1 \}/);
});

test('Altas y acciones sensibles de miembros están serializadas y confirmadas', () => {
  assert.match(addMember, /const \[nextFriends, members\] = await Promise\.all/);
  assert.match(addMember, /setLoadError\(true\)/);
  assert.match(addMember, /if \(addingRef\.current \|\| memberIds\.has\(f\.id\)\) return/);
  assert.match(addMember, /disabled=\{addingId !== null\}/);
  assert.match(groupMembers, /pendingMemberAction/);
  assert.match(groupMembers, /requestMemberAction\(actionMember\.isAdmin \? 'demote' : 'promote'/);
  assert.match(groupMembers, /requestMemberAction\('remove'/);
  assert.match(groupMembers, /visible=\{!!pendingMemberAction\}/);
  assert.match(groupMembers, /const isCreator = group\?\.createdBy === userId/);
  assert.match(groupMembers, /isMemberCreator \|\| isMemberAdmin/);
});

test('Catálogo responde al ancho actual y mantiene fallback visual', () => {
  assert.match(productList, /useWindowDimensions\(\)/);
  assert.doesNotMatch(productList, /Dimensions\.get\('window'\)/);
  assert.match(productList, /key=\{`grid-\$\{gridColumns\}`\}/);
  assert.match(catalog, /<ViewModeToggle value=\{prodViewMode\} onChange=\{setProdViewMode\}/);
  assert.match(viewModeToggle, /accessibilityRole="button"/);
  assert.match(viewModeToggle, /accessibilityLabel=\{t\(value === 'list' \? 'product\.viewList' : 'product\.viewGrid'\)\}/);
  assert.match(viewModeToggle, /accessibilityHint=\{t\(next === 'list' \? 'product\.switchToList' : 'product\.switchToGrid'\)\}/);
  assert.match(productList, /prepareProductImages\(firstImageUris\)/);
  assert.match(productList, /loading \|\| awaitingInitialImages/);
  assert.match(productImage, /onError=\{\(\) => setFailure\(\{ request: optimizedUri, source \}\)\}/);
  assert.match(productImage, /\{failed \? \(fallback \?\?/);
  assert.match(productImage, /name="basket-outline"/);
});
