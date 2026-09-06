import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { STORE_META } from '../constants/stores';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import type { UIProduct } from '../lib/productAdapters';
import CatalogScreen from '../screens/CatalogScreen';

interface Props {
  selectedKeys: ReadonlySet<string>;
  onSelect: (product: UIProduct) => void;
  onClose: () => void;
}

export default function RecipeIngredientPickerModal({ selectedKeys, onSelect, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 10 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <CatalogScreen
            productSelection={{
              title: t('queCocino.creator.selectIngredient'),
              selectedKeys,
              onSelect,
              onClose,
              bottomInset: insets.bottom,
              accessibilityLabel: (product) => selectedKeys.has(`${product.store}:${product.id}`)
                ? t('queCocino.creator.selectedIngredient', { name: product.name })
                : t('queCocino.creator.addIngredient', { name: product.name, store: STORE_META[product.store].name }),
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    flex: 1, overflow: 'hidden', backgroundColor: colors.paper,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
});
