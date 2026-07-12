import React from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { CatalogStackParamList } from '../types';
import { getSubcategoryEmoji } from '../constants/subcategoryEmojis';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useTourAnchor } from '../context/GuidedTourContext';
import { sortByName } from '../lib/sort';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ActiveCartBanner from '../components/ActiveCartBanner';

type SubCategoryRouteProp = RouteProp<CatalogStackParamList, 'SubCategory'>;
type Subcat = { id: string | number; name: string };

export default function SubCategoryScreen() {
  // useThemedStyles suscribe al tema (recrea estilos y refresca colors.accent /
  // colors.paper si cambian accent o modo mientras la pantalla sigue montada).
  const styles = useThemedStyles(themedStyles);
  const bottomPad = useTabBarBottomPadding(20);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<SubCategoryRouteProp>();
  const { categoryName, emoji = '🛒', color = colors.accent, subcategories = [], retailer = 'mercadona' } = route.params;
  const firstSubAnchor = useTourAnchor('firstSubcategory');

  const openSubcategory = (item: Subcat) => {
    if (retailer === 'esclat') {
      navigation.navigate('BonpreuProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'carrefour') {
      navigation.navigate('CarrefourProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'bonarea') {
      navigation.navigate('BonareaProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'consum') {
      navigation.navigate('ConsumProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'dia') {
      navigation.navigate('DiaProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'sorli') {
      navigation.navigate('SorliProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'eroski') {
      navigation.navigate('EroskiProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'caprabo') {
      navigation.navigate('CapraboProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'condis') {
      navigation.navigate('CondisProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'ametller') {
      navigation.navigate('AmetllerProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'aldi') {
      navigation.navigate('AldiProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else {
      navigation.navigate('Products', {
        subcategoryId: Number(item.id),
        subcategoryName: item.name,
        categoryName,
        emoji: getSubcategoryEmoji(item.name, emoji),
        color,
      });
    }
  };

  const renderItem = ({ item, index }: { item: Subcat; index: number }) => {
    const itemEmoji = getSubcategoryEmoji(item.name, emoji);
    const row = (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => openSubcategory(item)}
      >
        <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{itemEmoji}</Text>
        </View>
        <Text style={styles.rowName}>{item.name}</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
      </TouchableOpacity>
    );
    // La primera fila se envuelve en un View medible para anclar el resaltado del
    // tutorial (un TouchableOpacity no siempre expone measureInWindow).
    if (index !== 0) return row;
    return (
      <View ref={firstSubAnchor.ref} collapsable={false} onLayout={firstSubAnchor.onLayout}>
        {row}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ActiveCartBanner topInset />

      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{categoryName}</Text>
          <Text style={styles.sub}>{t('catalog.subcategories', { n: subcategories.length })}</Text>
        </View>
      </View>

      <FlatList
        data={sortByName(subcategories, (s) => s.name)}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  headerArea: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16,
    paddingTop: 4, paddingBottom: 16,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  sub: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 11, gap: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  thumbnail: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 21 },
  rowName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
});
