"""Build a self-contained editable HTML, the cover, contact sheet and source archive."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import base64, json, mimetypes, struct, zipfile

base=Path(__file__).resolve().parent
html=(base/'film.html').read_text()
def data_uri(path):
    mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
for name in ['Anton-Regular.ttf','SpaceGrotesk-Medium.ttf']:
    html=html.replace('url(assets/'+name+')','url('+data_uri(base/'assets'/name)+')')
images={p.name:data_uri(p) for p in (base/'assets').iterdir() if p.suffix in ['.jpg','.png']}
html=html.replace('const A={},TAU=', 'const embeddedAssets='+json.dumps(images)+';\nconst A={},TAU=')
html=html.replace("A[name].src='assets/'+file",'A[name].src=embeddedAssets[file]')
html=html.replace("new Audio('bm-original-score.wav')",'new Audio('+json.dumps(data_uri(base/'bm-original-score.wav'))+')')
(base/'bm-quefalta-editable.html').write_text(html)

Image.open(base/'review/final-00.70.jpg').save(base/'portada.jpg',quality=97,subsampling=0)
times=[.7,2.9,4.7,5.5,7.6,9.5]
sheet=Image.new('RGB',(1080,1300),'#F8F7EE');draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype(str(base/'assets/SpaceGrotesk-Medium.ttf'),24)
for i,t in enumerate(times):
    im=Image.open(base/'review'/f'final-{t:05.2f}.jpg');im.thumbnail((360,640))
    x=i%3*360;y=i//3*650;sheet.paste(im,(x,y))
    draw.rectangle((x+14,y+594,x+105,y+632),fill='#1D1D1B')
    draw.text((x+25,y+598),f'{t:.1f} s',fill='#F9EC23',font=font)
sheet.save(base/'storyboard.jpg',quality=95)

atoms=[];mp4=base/'bm-quefalta-10s.mp4';total=mp4.stat().st_size
with mp4.open('rb') as f:
    while f.tell()+8<=total:
        offset=f.tell();size,kind=struct.unpack('>I4s',f.read(8))
        if size==1:size=struct.unpack('>Q',f.read(8))[0]
        if size==0:size=total-offset
        atoms.append({'type':kind.decode('ascii'),'offset':offset,'size':size});f.seek(offset+size)
fast=next(a['offset'] for a in atoms if a['type']=='moov')<next(a['offset'] for a in atoms if a['type']=='mdat')
(base/'container-check.json').write_text(json.dumps({'fast_start':fast,'file_bytes':total,'atoms':atoms},indent=2))
assert fast
include=['README.md','film.html','render.mjs','score.py','encode.swift','verify.swift','package.py','download-assets.mjs','provenance.json','prompt-video.md','bm-original-score.wav','audio-report.json','video-report.json','verification.json','container-check.json','portada.jpg','storyboard.jpg','bm-quefalta-editable.html']
with zipfile.ZipFile(base/'bm-quefalta-editable.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in include:z.write(base/name,'bm-launch-60fps/'+name)
    for p in (base/'assets').iterdir():z.write(p,'bm-launch-60fps/assets/'+p.name)
print(json.dumps({'editable_html_bytes':(base/'bm-quefalta-editable.html').stat().st_size,'source_zip_bytes':(base/'bm-quefalta-editable.zip').stat().st_size,'video_bytes':total,'fast_start':fast}))
