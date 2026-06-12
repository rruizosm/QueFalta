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
import { useTheme } from '../context/ThemeContext';

type SubCategoryRouteProp = RouteProp<CatalogStackParamList, 'SubCategory'>;
type Subcat = { id: string | number; name: string };

export default function SubCategoryScreen() {
  // Suscripción al tema: el color por defecto (colors.accent) se refresca si
  // cambia el accent mientras la pantalla sigue montada en otra pestaña.
  useTheme();
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
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{categoryName}</Text>
          <Text style={styles.sub}>{subcategories.length} subcategorías</Text>
        </View>
      </View>

      <FlatList
        data={subcategories}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  headerArea: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16,
    paddingTop: 52, paddingBottom: 16,
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
