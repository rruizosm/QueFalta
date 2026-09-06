export function mapJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function lidlMapHtml(logo: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>html,body,#map{height:100%;margin:0} .store{border:3px solid white;border-radius:12px;background:white;box-shadow:0 2px 8px #0005} .store.selected{border-color:#0050aa;box-shadow:0 0 0 4px #ffdd00} .store img{width:100%;height:100%;border-radius:8px} .leaflet-control-attribution{font-size:10px}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
const send = value => window.ReactNativeWebView.postMessage(JSON.stringify(value));
try {
const map = L.map('map').setView([40.2,-3.7],6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map).on('tileerror',()=>send({type:'tilesError'}));
const layer = L.layerGroup().addTo(map);
const logo = ${mapJson(logo)};
window.updateStores = (stores, selected) => {
  layer.clearLayers();
  stores.forEach(s => {
    const marker=L.marker([s.latitude,s.longitude],{title:s.name+' · '+s.city+' · '+s.postalCode,icon:L.divIcon({className:'store'+(s.id===selected?' selected':''),html:'<img alt="Lidl" src="'+logo+'">',iconSize:[36,36],iconAnchor:[18,18]}),zIndexOffset:s.id===selected?1000:0}).addTo(layer);
    marker.on('click',()=>send({type:'select',id:s.id}));
  });
};
window.centerPostal = (point, zoom) => map.setView([point.latitude,point.longitude],zoom);
send({type:'ready'});
} catch(e) {send({type:'error'});}
</script></body></html>`;
}
