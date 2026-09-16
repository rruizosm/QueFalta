import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomTabsPager, PagerScrollView, type PageContext, type PagerTab } from '../../components/bottom-tabs-pager';
import { contentBlurAvailable } from '../../components/bottom-tabs-pager/ContentBlur';

const palettes = [
  ['#d9cabc', '#aa8670'], ['#bfd2d5', '#54838f'], ['#e7bcaf', '#b56c5d'],
  ['#d6d8bd', '#879570'], ['#c9c5dc', '#847998'], ['#e8d4a9', '#b79254'],
] as const;
const names = ['Tu historia', 'Lucía', 'Alex', 'Mar', 'Nico'];

function Artwork({ index, tall = false }: { index: number; tall?: boolean }) {
  return (
    <LinearGradient colors={palettes[index % palettes.length]} style={[s.art, tall && s.artTall]}>
      <View style={s.orbit} />
      <View style={[s.arch, { transform: [{ rotate: `${index % 2 ? -18 : 16}deg` }] }]} />
      <View style={s.sun} />
      <Text style={s.artNumber}>{String(index + 1).padStart(2, '0')}</Text>
      <Text style={s.artCaption}>{['SLOW MORNINGS', 'A LITTLE ESCAPE', 'EVERYDAY COLOUR'][index % 3]}</Text>
    </LinearGradient>
  );
}

function Avatar({ index, large = false }: { index: number; large?: boolean }) {
  return <LinearGradient colors={palettes[index % palettes.length]} style={[s.avatar, large && s.avatarLarge]}>
    <Feather name="user" color="#fff" size={large ? 40 : 22} />
  </LinearGradient>;
}

function Page({ context, title, eyebrow, children }: {
  context: PageContext; title: string; eyebrow: string; children: React.ReactNode;
}) {
  return <PagerScrollView pagerGesture={context.pagerGesture} style={s.page}
    contentContainerStyle={{ paddingTop: context.topInset + 22, paddingBottom: context.bottomInset,
      paddingHorizontal: context.horizontalInset + 22 }} showsVerticalScrollIndicator={false}>
    <View style={s.header}><View><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text></View>
      <View style={s.headerMark}><Feather name="aperture" size={25} color="#28333b" /></View></View>
    {children}
  </PagerScrollView>;
}

function Post({ index }: { index: number }) {
  const [liked, setLiked] = useState(false);
  return <View style={s.post}>
    <View style={s.postHeader}><Avatar index={index} /><View style={s.flex}><Text style={s.name}>{['lucia.studio', 'alex.elsewhere', 'mar.creates'][index % 3]}</Text>
      <Text style={s.secondary}>Pequeños momentos, grandes historias</Text></View><Feather name="more-horizontal" size={22} /></View>
    <Artwork index={index} />
    <View style={s.postActions}>
      <Pressable onPress={() => setLiked(!liked)} accessibilityRole="button" accessibilityLabel={liked ? 'Quitar Me gusta' : 'Me gusta'}
        accessibilityState={{ selected: liked }} style={s.action}>
        <Feather name="heart" size={23} color={liked ? '#ba5e59' : '#28333b'} />
      </Pressable>
      <Text style={s.name}>{128 + index * 47 + Number(liked)} me gusta</Text>
      <Feather name="bookmark" size={21} style={s.bookmark} color="#28333b" />
    </View>
    <Text style={s.caption}>Un lugar para detenerse un momento. Y seguir explorando.</Text>
  </View>;
}

function Home(context: PageContext) {
  return <Page context={context} title="frame." eyebrow="TU DOSIS DE INSPIRACIÓN">
    <View style={s.stories}>{names.map((name, index) => <View key={name} style={s.story}>
      <View style={s.storyRing}><Avatar index={index} /></View><Text numberOfLines={1} style={s.storyName}>{name}</Text>
    </View>)}</View>
    <View style={s.hint}><Feather name="move" size={17} color="#63747e" /><Text style={s.hintText}>Desliza la página o toca una pestaña</Text></View>
    {!contentBlurAvailable && <Text style={s.notice}>Blur de contenido no disponible en este runtime. En iOS, compila el módulo PagerBlur; en Android requiere Android 12 o posterior.</Text>}
    {[0, 1, 2].map((index) => <Post key={index} index={index} />)}
  </Page>;
}

function Reels(context: PageContext) {
  return <Page context={context} title="En movimiento" eyebrow="REELS · PARA TI">
    <Text style={s.intro}>Ideas que merecen unos segundos más.</Text>
    {[1, 3].map((index) => <View style={s.reel} key={index}><Artwork index={index} tall />
      <View pointerEvents="none" style={s.reelOverlay}><View style={s.play}><Feather name="play" size={28} color="#fff" /></View>
        <Text style={s.reelTitle}>El arte de mirar despacio.</Text><Text style={s.reelByline}>@alex.elsewhere · Escena de demostración</Text></View>
    </View>)}
  </Page>;
}

function Messages(context: PageContext) {
  return <Page context={context} title="Conversaciones" eyebrow="MENSAJES">
    <View style={s.search}><Feather name="search" size={19} color="#728089" /><Text style={s.secondary}>Tus personas, más cerca</Text></View>
    {['Lucía Moreno', 'Alex Rivera', 'Mar Costa', 'Nico Torres', 'Studio friends', 'Clara Vidal', 'Dani Soler', 'Emma Martín'].map((name, index) =>
      <View key={name} style={s.message}><Avatar index={index} /><View style={s.flex}>
        <View style={s.messageHeading}><Text style={s.name}>{name}</Text><Text style={s.time}>{index + 1} h</Text></View>
        <Text style={s.secondary} numberOfLines={1}>{['¡Tenemos que ir a este sitio!', 'Te he enviado una nueva idea.', 'Qué bonita la luz de esta mañana.'][index % 3]}</Text>
      </View>{index < 2 && <View style={s.unread} />}</View>)}
    <Text style={s.footerNote}>Conversaciones ficticias para probar el scroll.</Text>
  </Page>;
}

function Grid({ offset = 0 }: { offset?: number }) {
  return <View style={s.grid}>{Array.from({ length: 12 }, (_, i) =>
    <View style={s.gridCell} key={i}><Artwork index={i + offset} /></View>)}</View>;
}

function Search(context: PageContext) {
  return <Page context={context} title="Algo por descubrir" eyebrow="SEARCH · EXPLORA">
    <View style={s.search}><Feather name="search" size={19} color="#728089" /><Text style={s.secondary}>Encuentra tu próxima inspiración</Text></View>
    <View style={s.tags}>{['Para ti', 'Diseño', 'Lugares', 'Arte'].map((tag, index) =>
      <View key={tag} style={[s.tag, index === 0 && s.tagSelected]}><Text style={s.tagText}>{tag}</Text></View>)}</View>
    <Grid />
  </Page>;
}

function Profile(context: PageContext) {
  return <Page context={context} title="Tu pequeño universo" eyebrow="PROFILE">
    <View style={s.profile}><Avatar index={4} large /><Text style={s.profileName}>Alex Morgan</Text>
      <Text style={s.secondary}>@alex.morgan</Text><Text style={s.bio}>Coleccionando luz, lugares y buenos momentos.</Text>
      <View style={s.stats}>{[['24', 'posts'], ['1,2k', 'seguidores'], ['386', 'siguiendo']].map(([value, label]) =>
        <View style={s.stat} key={label}><Text style={s.statValue}>{value}</Text><Text style={s.secondary}>{label}</Text></View>)}</View>
    </View>
    <View style={s.sectionTitle}><Feather name="grid" size={18} color="#28333b" /><Text style={s.name}>Momentos guardados</Text></View>
    <Grid offset={3} />
  </Page>;
}

const tabs: readonly PagerTab[] = [
  { key: 'home', label: 'Home', icon: 'home', renderPage: (context) => <Home {...context} /> },
  { key: 'reels', label: 'Reels', icon: 'play-circle', renderPage: (context) => <Reels {...context} /> },
  { key: 'messages', label: 'Mensajes', icon: 'message-circle', renderPage: (context) => <Messages {...context} /> },
  { key: 'search', label: 'Search', icon: 'search', renderPage: (context) => <Search {...context} /> },
  { key: 'profile', label: 'Profile', icon: 'user', renderPage: (context) => <Profile {...context} /> },
];

/** Standalone entry: no session, backend, fonts, or remote images required. */
export default function BottomTabsDemo() {
  return <GestureHandlerRootView style={s.flex}><SafeAreaProvider>
    <StatusBar style="dark" /><BottomTabsPager tabs={tabs} />
  </SafeAreaProvider></GestureHandlerRootView>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#f6f5f2' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, gap: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', color: '#7d898e', marginBottom: 8 },
  title: { fontSize: 27, fontWeight: '700', color: '#28333b', letterSpacing: -1 },
  headerMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eeede8', alignItems: 'center', justifyContent: 'center' },
  stories: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 20 },
  story: { flex: 1, alignItems: 'center', gap: 7 }, storyRing: { padding: 3, borderRadius: 32, borderWidth: 1.5, borderColor: '#bcb4ab' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLarge: { width: 88, height: 88, borderRadius: 44 }, storyName: { fontSize: 10, color: '#626e75' },
  hint: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 24 }, hintText: { fontSize: 12, color: '#63747e', flexShrink: 1 },
  notice: { color: '#825b30', fontSize: 12, lineHeight: 18, marginBottom: 18 },
  post: { marginBottom: 28 }, postHeader: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 },
  name: { fontSize: 13, fontWeight: '600', color: '#28333b' }, secondary: { fontSize: 11, color: '#849096', marginTop: 4 },
  art: { aspectRatio: 1, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end', padding: 16 }, artTall: { aspectRatio: 0.66 },
  orbit: { position: 'absolute', width: '85%', aspectRatio: 1, top: '-10%', right: '-20%', borderRadius: 200, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  arch: { position: 'absolute', width: '50%', height: '77%', bottom: '-10%', left: '15%', borderTopLeftRadius: 130, borderTopRightRadius: 130, backgroundColor: 'rgba(255,255,255,0.26)' },
  sun: { position: 'absolute', width: '27%', aspectRatio: 1, borderRadius: 100, right: '14%', top: '19%', backgroundColor: 'rgba(255,255,255,0.42)' },
  artNumber: { fontSize: 40, color: 'rgba(255,255,255,0.9)', fontWeight: '200' },
  artCaption: { fontSize: 8, letterSpacing: 2, color: '#fff', marginTop: 4 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 4 }, action: { width: 44, height: 44, justifyContent: 'center' },
  bookmark: { marginLeft: 'auto' }, caption: { fontSize: 12, lineHeight: 19, color: '#657079' },
  intro: { fontSize: 13, color: '#849096', marginBottom: 22 }, reel: { marginBottom: 20 },
  reelOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 22, justifyContent: 'flex-end' },
  play: { position: 'absolute', alignSelf: 'center', top: '43%', width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  reelTitle: { color: '#fff', fontSize: 23, fontWeight: '600' }, reelByline: { color: '#fff', fontSize: 11, marginTop: 8 },
  search: { flexDirection: 'row', gap: 10, padding: 15, backgroundColor: '#eaece9', borderRadius: 18, alignItems: 'center', marginBottom: 22 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#e7e8e5' },
  messageHeading: { flexDirection: 'row', justifyContent: 'space-between' }, time: { fontSize: 10, color: '#9aa3a6' },
  unread: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#839b9c' }, footerNote: { textAlign: 'center', fontSize: 11, color: '#949e9e', marginTop: 30 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 22 }, tag: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 18, backgroundColor: '#eaece9' },
  tagSelected: { backgroundColor: '#d7dfdc' }, tagText: { fontSize: 11, color: '#53615f' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, gridCell: { width: '48%', flexGrow: 1 },
  profile: { alignItems: 'center', marginTop: 8, marginBottom: 30 }, profileName: { fontSize: 22, fontWeight: '700', color: '#28333b', marginTop: 16 },
  bio: { fontSize: 12, color: '#849096', marginTop: 15, textAlign: 'center' },
  stats: { flexDirection: 'row', width: '100%', marginTop: 28 }, stat: { flex: 1, alignItems: 'center' }, statValue: { fontSize: 20, fontWeight: '600', color: '#28333b' },
  sectionTitle: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 18 },
});
