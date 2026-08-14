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
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { CatalogStackParamList } from '../types';
import { getSubcategoryEmoji } from '../constants/subcategoryEmojis';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { sortByName } from '../lib/sort';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import GlassSurface from '../components/GlassSurface';

type SubCategoryRouteProp = RouteProp<CatalogStackParamList, 'SubCategory'>;
type Subcat = { id: string | number; name: string };

export default function SubCategoryScreen() {
  // useThemedStyles suscribe al tema (recrea estilos y refresca colors.accent /
  // colors.paper si cambian accent o modo mientras la pantalla sigue montada).
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(20);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<SubCategoryRouteProp>();
  const { categoryName, emoji = '🛒', color = colors.accent, subcategories = [], retailer = 'mercadona' } = route.params;

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
    } else if (retailer === 'gadis') {
      navigation.navigate('GadisProducts', {
        categoryId: String(item.id), categoryName: item.name, parentCategoryName: categoryName,
      });
    } else if (retailer === 'ahorramas') {
      navigation.navigate('AhorramasProducts', {
        categoryId: String(item.id), categoryName: item.name, parentCategoryName: categoryName,
      });
    } else if (retailer === 'hiperdino') {
      navigation.navigate('HiperdinoProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'alcampo') {
      navigation.navigate('AlcampoProducts', {
        categoryId: String(item.id),
        categoryName: item.name,
        parentName: categoryName,
      });
    } else if (retailer === 'plusfresc') {
      navigation.navigate('PlusfrescProducts', {
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

  const renderItem = ({ item }: { item: Subcat }) => {
    const itemEmoji = getSubcategoryEmoji(item.name, emoji);
    return (
      <GlassSurface style={styles.row} fallbackColor={colors.white}>
        <TouchableOpacity
          style={styles.rowBody}
          activeOpacity={0.8}
          onPress={() => openSubcategory(item)}
        >
          <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
            <Text style={styles.thumbnailEmoji}>{itemEmoji}</Text>
          </View>
          <Text style={styles.rowName}>{item.name}</Text>
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={17} color={colors.inkSoft} />
          </View>
        </TouchableOpacity>
      </GlassSurface>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={[styles.headerArea, { paddingTop: headerTop }]}>
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
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11 },
  thumbnail: {
    width: 42, height: 42,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 21 },
  rowName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  chevronWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
});
