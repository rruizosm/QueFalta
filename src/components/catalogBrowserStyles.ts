// Shared catalog surfaces for browsing and the pantry product picker.
import { StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';

export const catalogBrowserStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  pickerClose: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
  pickerStores: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  pickerStore: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 46, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  pickerStoreActive: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
  pickerStoreLocked: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  pickerStoreLogo: { width: 28, height: 28, borderRadius: 8 },
  lidlStoreLogo: { borderRadius: 0 },
  pickerStoreName: { fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft },
  pickerStoreNameActive: { color: colors.accent },

  headerArea: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 16, paddingBottom: 10,
    // paddingTop inline (useHeaderTopPadding)
  },
  titleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  title: {
    flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3,
  },

  // ── Store selector (avatar redondo con logo, sin anillo) ───────
  selector: {
    width: 48, height: 48, borderRadius: 24, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  selectorLogo: { width: '100%', height: '100%' },

  // ── Panel de tiendas: rejilla a pantalla completa (2 columnas) ─
  storeSheet: { flex: 1, backgroundColor: colors.paper },
  storeSheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  storeSheetTitle: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  storeCloseBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  storeGrid: { padding: 16 },
  storeGridRow: { gap: 12, marginBottom: 12 },
  storeAllCardBackground: {
    height: 78,
    marginBottom: 12,
  },
  storeAllInfoButton: {
    position: 'absolute', left: 8, bottom: 4,
    zIndex: 1,
  },
  storeAllCard: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderRadius: 20,
  },
  storeAllCardSelected: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  storeAllCardLocked: { backgroundColor: colors.surfaceAlt },
  storeAllCardUnlocked: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storeAllCardUnlockedSelected: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
  },
  storeAllIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  storeCard: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  storeCardBackground: { flex: 1, aspectRatio: 1 },
  storeCardPlaceholder: { flex: 1, aspectRatio: 1 },
  storeCardActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  storeCardLocked: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  storeCardPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  storeCardLock: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  storeCardCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  storeCardLogoWrap: {
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  lidlStoreLogoWrap: { borderRadius: 0, overflow: 'visible' },
  storeCardLogo: { width: '100%', height: '100%' },
  storeCardName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.ink, textAlign: 'center' },
  storeCardNameActive: { color: colors.accent },
  storeLidlInfoButton: {
    position: 'absolute', left: 4, bottom: 4,
    zIndex: 1,
  },
  storeFavoriteButton: {
    position: 'absolute', right: 4, bottom: 4,
    zIndex: 1,
  },
  // ── Fila de pestañas + selector de súper (un bloque aparte) ───
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12,
  },

  // ── Segmentado Productos/Categorías (pastilla blanca, Claude Design) ─
  seg: {
    flex: 1, flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16, padding: 5, gap: 6,
  },
  segBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: 12,
  },
  segBtnOn: {
    backgroundColor: colors.white,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTxt: { fontSize: 14 },
  segTxtOn: { fontFamily: fonts.bold, color: colors.accent },
  segTxtOff: { fontFamily: fonts.semibold, color: colors.inkSoft },
  filterBtn: {
    width: 44, height: 44, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  filterBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },

  // ── Toggle lista/cuadrícula (pastilla redondeada, Claude Design) ─
  viewToggle: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.surfaceAlt,
    padding: 5, borderRadius: 14,
  },
  viewBtn: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  viewBtnOn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // ── Search ────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 16, paddingVertical: 13,
    gap: 11,
    borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  searchInput: {
    flex: 1, fontSize: 14, color: colors.ink, padding: 0,
    fontFamily: fonts.medium,
  },
  // La búsqueda de categorías ocupa la misma altura que la fila de productos.
  categorySearchBox: { paddingVertical: 0 },
  // Bloque de búsqueda: la consulta activa aparece bajo la lupa al desplazar.
  prodSearchBlock: {
    marginHorizontal: 16, marginBottom: 8,
  },
  // Fila de búsqueda de productos: barra (flex) + orden + lista/cuadrícula.
  prodSearchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  prodSearchQueryClip: { overflow: 'hidden' },
  prodSearchQuery: {
    marginTop: 4,
    fontSize: 13, lineHeight: 20,
    fontFamily: fonts.medium, fontStyle: 'italic',
    color: colors.inkSoft,
  },
  // La barra dentro de la fila no lleva márgenes propios (los pone la fila).
  prodSearchBox: {
    marginHorizontal: 0, marginBottom: 0, minWidth: 0,
    // La altura debe coincidir con los controles contraídos: si se deja que
    // padding + tipografía la calculen, el chrome crece al abrir el buscador.
    paddingVertical: 0,
    borderRadius: 999,
  },
  prodSearchBoxExpanded: { flex: 1 },
  prodSearchBoxCollapsed: {
    width: 40, height: 40,
    paddingHorizontal: 0,
    gap: 0,
    justifyContent: 'center',
  },
  searchBoxGlass: { height: 40 },
  searchBoxFallback: { height: 44 },
  prodSearchActivator: { ...StyleSheet.absoluteFill },
  prodSortGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prodViewGroup: { alignItems: 'center', justifyContent: 'center' },
  prodToggleDense: { padding: 3, gap: 3, borderRadius: 12 },
  prodViewBtn: { width: 32, height: 38, borderRadius: 9 },
  prodUnitSortText: { fontSize: 10, fontFamily: fonts.bold },
  prodUnitSortLockedBackgroundGlass: {
    width: 72, height: 40, borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.11, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  prodUnitSortLockedBackgroundGlassLight: {
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderColor: 'rgba(43,37,33,0.10)',
  },
  prodUnitSortLockedBackgroundGlassDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.20)',
  },
  prodUnitSortLockedHighlight: {
    position: 'absolute', top: 1, left: 10, right: 10,
    height: 1, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  prodUnitSortLockedBackgroundFallback: {
    width: 73, height: 44, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  prodUnitSortLockedBackgroundAndroid: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  prodUnitSortLockedButtons: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  prodUnitSortLockedButtonsGlass: { padding: 3 },
  prodUnitSortLockedButtonsFallback: { padding: 3, gap: 3 },
  prodUnitSortLockedBtn: {
    width: 32, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  prodUnitSortLockedBtnGlass: { height: 32 },
  prodUnitSortLockedBtnFallback: { height: 38, borderRadius: 9 },
  prodUnitSortLockedBtnFirst: { borderTopLeftRadius: 17, borderBottomLeftRadius: 17 },
  prodUnitSortLockedBtnLast: { borderTopRightRadius: 17, borderBottomRightRadius: 17 },
  prodUnitSortLockedTextWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
  },
  prodUnitSortLockedText: {
    fontSize: 10, lineHeight: 12, fontFamily: fonts.bold,
    color: colors.accent, textAlign: 'center', includeFontPadding: false,
  },

  // ── Category rows ─────────────────────────────────────────────
  list: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 11, gap: 12,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  categoryStoreRow: {
    minHeight: 64,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 18,
  },
  categoryStoreLogoWrap: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  categoryStoreLogo: { width: '100%', height: '100%' },
  categoryStoreName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  thumbnail: {
    width: 42, height: 42,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 21 },
  rowContent: { flex: 1 },
  rowName: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  rowSub: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  favStar: { marginRight: 4 },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  chromeGlass: { paddingBottom: 2 },
  chromeBackdrop: { ...StyleSheet.absoluteFill },
});
