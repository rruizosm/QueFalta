import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { LidlStoreCandidate } from '../api/lidlStores';
import { fetchPostalLocation } from '../api/postalLocation';
import { lidlMapHtml, mapJson } from '../lib/lidlMap';
import { lidlMapLogo } from '../lib/lidlMapLogo';
import { useTranslation } from '../context/LanguageContext';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';

export default function LidlStoreMap({ stores, postalCode, selectedStoreId, onSelect }: {
  stores: LidlStoreCandidate[];
  postalCode: string | null;
  selectedStoreId: string | null;
  onSelect: (id: string) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [postalMissing, setPostalMissing] = useState(false);
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const { t } = useTranslation();
  const source = useMemo(() => ({ html: lidlMapHtml(lidlMapLogo), baseUrl: 'https://quefalta.es/' }), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let active = true;
    setCenter(null);
    setPostalMissing(false);
    fetchPostalLocation(postalCode ?? '', controller.signal)
      .then(point => { if (active) { setCenter(point); setPostalMissing(!point); } })
      .catch(() => { if (active) setPostalMissing(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [postalCode]);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const valid = stores.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
    web.current?.injectJavaScript(`window.updateStores(${mapJson(valid)},${mapJson(selectedStoreId)});true;`);
  }, [ready, stores, selectedStoreId]);

  useEffect(() => {
    if (ready && center) web.current?.injectJavaScript(`window.centerPostal(${mapJson(center)},13);true;`);
  }, [ready, center]);

  return <View style={styles.container}>
    <WebView ref={web} source={source} originWhitelist={['*']} style={styles.map}
      geolocationEnabled={false} javaScriptCanOpenWindowsAutomatically={false}
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'about:blank' || request.url === 'https://quefalta.es/') return true;
        if (request.url === 'https://www.openstreetmap.org/copyright') void Linking.openURL(request.url);
        return false;
      }}
      onError={() => setFailed(true)}
      onMessage={event => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'ready') { setReady(true); setFailed(false); }
          if (message.type === 'error' || message.type === 'tilesError') setFailed(true);
          if (message.type === 'select' && stores.some(s => s.id === message.id)) onSelect(message.id);
        } catch { /* Ignore malformed map messages. */ }
      }} />
    {!ready && !failed ? <View style={styles.loading}><ActivityIndicator /></View> : null}
    {failed || postalMissing ? <Text style={styles.notice}>{t(failed ? 'region.lidlMapError' : 'region.lidlMapPostalMissing')}</Text> : null}
  </View>;
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, minHeight: 240 },
  map: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  notice: { padding: 10, color: colors.ink, backgroundColor: colors.paper, fontSize: 12 },
});
