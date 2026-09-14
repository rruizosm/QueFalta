"""Vídeo de marca, 20 s, con ilustraciones locales y música sintetizada original."""
from pathlib import Path
import math, sys, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
W, H, FPS, SECONDS = 1080, 1920, 30, 20
BLUE, INK, CREAM, LIME = '#2879ED', '#102A51', '#F8F6F0', '#D9F89B'
FONT = ROOT / 'node_modules/@expo-google-fonts/space-grotesk'
fonts = {}
def font(size, bold=True):
    key = (size, bold)
    if key not in fonts:
        face = '700Bold' if bold else '400Regular'
        fonts[key] = ImageFont.truetype(str(FONT / face / f'SpaceGrotesk_{face}.ttf'), size)
    return fonts[key]

def asset(path, width):
    im = Image.open(ROOT/path).convert('RGBA')
    im = im.crop(im.getchannel('A').getbbox())
    return im.resize((width, round(im.height*width/im.width)), Image.Resampling.LANCZOS)
cart = asset('assets/mascot/berenjena-carrito.png', 590)
cart_small = asset('assets/mascot/berenjena-carrito.png', 330)
friends = asset('assets/mascot/berenjena-amigos.png', 810)
logo = asset('assets/quefalta-logo-blue.png', 190)
def ease(x):
    x = max(0, min(1, x)); return 1-(1-x)**3
def text(im, s, x, y, size, fill=INK, bold=True, center=False):
    d=ImageDraw.Draw(im)
    if center: x -= d.textlength(s,font=font(size,bold))/2
    d.text((round(x),round(y)),s,font=font(size,bold),fill=fill,stroke_width=0)
def paste(im, a, x,y): im.alpha_composite(a,(round(x),round(y)))
def roundbox(im, box, color, radius=32, outline=None, width=1):
    ImageDraw.Draw(im).rounded_rectangle(tuple(round(v) for v in box),radius,fill=color,outline=outline,width=width)
def check(im,x,y,scale=1, color=BLUE):
    ImageDraw.Draw(im).line([(x,y+12*scale),(x+11*scale,y+23*scale),(x+34*scale,y)],fill=color,width=round(6*scale),joint='curve')
def bg(t,dark=False):
    im=Image.new('RGBA',(W,H),BLUE if dark else CREAM)
    d=ImageDraw.Draw(im)
    for i,(x,y,r) in enumerate([(970,300,390),(-150,1350,450),(1020,1830,460)]):
        dx=math.sin(t*.5+i)*35
        d.ellipse((x-r+dx,y-r,x+r+dx,y+r),fill=('#3282F1' if dark else '#EAF0F7'))
    d.arc((-410,100,1440,1900),260,355,fill='#66A1F2' if dark else '#D4E1F1',width=3)
    return im
def label(im, s, dark=False):
    text(im,'QuéFalta',90,142,38,'white' if dark else INK)
    text(im,s,90,1550,29,'#DCEAFF' if dark else '#4F6584',False)
def bubble(im,s,x,y,width,light=True):
    roundbox(im,(x+4,y+12,x+width+4,y+147),'#DCE3EB',38)
    roundbox(im,(x,y,x+width,y+135),'white' if light else INK,38)
    text(im,s,x+32,y+40,37,INK if light else 'white',False)
def phone(im,u):
    x,y=252,580+45*(1-ease(u*2))
    roundbox(im,(x+14,y+20,x+564,y+900),'#CFDCEC',72)
    roundbox(im,(x,y,x+550,y+880),INK,68)
    roundbox(im,(x+12,y+12,x+538,y+868),'white',58)
    roundbox(im,(x+195,y+24,x+355,y+57),INK,22)
    text(im,'Casa',x+38,y+105,49)
    text(im,'Nuestra lista compartida',x+38,y+174,24,'#677A92',False)
    for k,c in enumerate([BLUE,'#A886E5','#FCB56C']):
        ImageDraw.Draw(im).ellipse((x+38+k*44,y+220,x+89+k*44,y+271),fill=c,outline='white',width=3)
        text(im,['A','M','T'][k],x+63+k*44,y+228,23,'white',center=True)
    rows=[('Pan','1 unidad'),('Leche','2 unidades'),('Tomates','1 kg')]
    for k,(name,qty) in enumerate(rows):
        appear=ease((u-k*.45)*3)
        if appear<=0: continue
        ry=y+315+k*135+35*(1-appear)
        done=u>2.7+k*.5
        roundbox(im,(x+27,ry,x+523,ry+113),'#EDF7DD' if done else '#F1F5FA',22)
        roundbox(im,(x+48,ry+36,x+88,ry+76),LIME if done else 'white',12,outline='#CCD9E9',width=2)
        if done: check(im,x+53,ry+46,.7,INK)
        text(im,name,x+112,ry+18,35)
        text(im,qty,x+112,ry+65,24,'#65758D',False)
    if u>1.6:
        a=ease((u-1.6)*3)
        bx=x-70+30*(1-a)
        roundbox(im,(bx,y+737,bx+500,y+827),BLUE,24)
        text(im,'Ana ha añadido leche',bx+27,y+762,29,'white')

def frame(t):
    scene=0 if t<3 else 1 if t<6 else 2 if t<12 else 3 if t<16 else 4
    start=[0,3,6,12,16][scene]; u=t-start
    im=bg(t,scene in (1,4)); d=ImageDraw.Draw(im)
    enter=50*(1-ease(u*3))
    if scene==0:
        label(im,'MENOS MENSAJES. MÁS ORGANIZACIÓN.')
        text(im,'¿Quién compraba',90,290+enter,88)
        text(im,'el pan?',90,400+enter,120)
        bubble(im,'¿Qué falta en casa?',100+50*(1-ease(u*3)),650,670)
        if u>.45: bubble(im,'Yo ya he comprado pan',220,850+50*(1-ease((u-.45)*3)),670,False)
        if u>1.15: bubble(im,'Pues yo también…',100,1050+50*(1-ease((u-1.15)*3)),625)
        if u>1.8:
            roundbox(im,(100,1305,780,1420),LIME,30)
            text(im,'Os falta una lista común.',132,1340,37)
    elif scene==1:
        label(im,'TU LISTA DE LA COMPRA COMPARTIDA',True)
        text(im,'Para eso está',90,290+enter,73,'white')
        text(im,'QuéFalta.',85,385+enter,136,'white')
        d.ellipse((200,660,890,1350),fill='#4B92F1')
        paste(im,cart,235+160*(1-ease(u*2)),660+math.sin(u*2)*12)
        roundbox(im,(92,1415,875,1510),LIME,30)
        text(im,'Una lista. Todos al día.',130,1440,44)
    elif scene==2:
        label(im,'REPRESENTACIÓN ILUSTRATIVA · LISTA COMPARTIDA')
        text(im,'Añade. Comparte.',90,285+enter,86)
        text(im,'Marca lo comprado.',90,390+enter,75,BLUE)
        phone(im,u)
        if u>3:
            roundbox(im,(98,790,255,878),LIME,26)
            text(im,'¡Listo!',121,812,35)
    elif scene==3:
        label(im,'CON TU PAREJA, FAMILIA O COMPAÑEROS')
        text(im,'La compra,',90,295+enter,105)
        text(im,'en equipo.',90,420+enter,110,BLUE)
        d.ellipse((100,730,935,1530),fill='#E2ECCF')
        paste(im,friends,110+100*(1-ease(u*2)),690+math.sin(u*2)*12)
        roundbox(im,(110,1360,900,1480),INK,34)
        text(im,'Cada uno suma.',505,1393,51,'white',center=True)
    else:
        label(im,'ORGANIZA LA PRÓXIMA COMPRA',True)
        paste(im,logo,90,265+enter)
        text(im,'QuéFalta',90,475+enter,132,'white')
        text(im,'Lo que falta,',90,660,75,'white')
        text(im,'lo tienes claro.',90,753,75,'white')
        paste(im,cart_small,330,868+math.sin(u*2)*8)
        roundbox(im,(90,1330,872,1450),LIME,40)
        text(im,'Descubre la app',481,1363,51,INK,center=True)
        text(im,'quefalta.es',481,1470,48,'white',center=True)
    # Subtle progress indicator, clear of platform controls.
    d=ImageDraw.Draw(im)
    for i in range(5):
        d.rounded_rectangle((90+i*160,1660,225+i*160,1666),3,fill=(LIME if scene in (1,4) else BLUE) if i<=scene else ('#73A7EE' if scene in (1,4) else '#D5DDE6'))
    return im.convert('RGB')

def music():
    sr=48000; n=sr*SECONDS; mix=np.zeros(n,dtype=np.float64)
    rng=np.random.default_rng(24)
    def add(start,v,gain=1):
        j=int(start*sr); count=min(len(v),n-j)
        if count>0: mix[j:j+count]+=v[:count]*gain
    chords=[(261.63,329.63,392),(220,261.63,329.63),(174.61,220,261.63),(196,246.94,293.66),(261.63,329.63,392)]
    for beat in range(40):
        when=beat*.5; chord=chords[min(4,int(when//4))]
        tt=np.arange(int(.42*sr))/sr
        kick=np.sin(2*np.pi*(52*tt+45*.028*(1-np.exp(-tt/.028))))*np.exp(-tt*15)
        add(when,kick,.29)
        if beat%2:
            sn=rng.normal(0,1,len(tt))*np.exp(-tt*35)
            add(when,sn,.09)
        bass=np.sin(2*np.pi*(chord[0]/2)*tt)*np.exp(-tt*8)
        add(when,bass,.18)
        for off in [0,.25]:
            ht=np.arange(int(.09*sr))/sr
            noise=rng.normal(0,1,len(ht)); noise=np.diff(noise,prepend=0)
            add(when+off,noise*np.exp(-ht*75),.018)
        for j in range(2):
            pt=np.arange(int(.5*sr))/sr; freq=chord[(beat+j)%3]*2
            pluck=(np.sin(2*np.pi*freq*pt)+.22*np.sin(2*np.pi*freq*2*pt))*np.exp(-pt*10)*(1-np.exp(-pt*180))
            add(when+j*.25,pluck,.10)
    for start in [3,6,12,16]:
        tt=np.arange(int(.25*sr))/sr
        add(start,.12*np.sin(2*np.pi*(600*tt+1100*tt*tt))*np.exp(-tt*20))
    mix*=np.minimum(1,np.arange(n)/(.025*sr))*np.minimum(1,(n-np.arange(n))/(.7*sr))
    mix=np.tanh(mix)*.83
    stereo=np.column_stack([mix,np.roll(mix,180)*.97])
    with wave.open(str(OUT/'musica-original.wav'),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())

if __name__=='__main__':
    times=[1.9,4.5,8.5,10.9,14,18]
    sheet=Image.new('RGB',(1080,1280),'white')
    for i,t in enumerate(times):
        sheet.paste(frame(t).resize((360,640),Image.Resampling.LANCZOS),((i%3)*360,(i//3)*640))
    sheet.save(OUT/'storyboard.jpg',quality=93)
    frame(4.5).save(OUT/'portada.jpg',quality=95)
    if '--preview' in sys.argv: sys.exit()
    import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    music()
    cmd=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r',str(FPS),'-i','-','-i',str(OUT/'musica-original.wav'),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-t',str(SECONDS),str(OUT/'quefalta-promo-vertical.mp4')]
    with open(OUT/'render.log','w') as log:
        p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        for i in range(FPS*SECONDS):
            p.stdin.write(frame(i/FPS).tobytes())
            if i%90==0: print(f'{i//FPS}/{SECONDS} s',flush=True)
        p.stdin.close()
        if p.wait(): raise RuntimeError('Consulta render.log')
    print('Exportación completa',flush=True)
