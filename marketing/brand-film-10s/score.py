"""Original 144 BPM electronic cue and synchronized UI sound design; no sampled music."""
from pathlib import Path
import numpy as np, wave, json
SR=48000; DUR=10; BEAT=60/144; N=int(SR*DUR)
OUT=Path(__file__).resolve().parent
rng=np.random.default_rng(5719)
mix=np.zeros((N,2)); fx=np.zeros_like(mix)
def note(n):return 440*2**((n-69)/12)
def add(v,at,amp=1,pan=0,bus=mix):
 start=round(at*SR);end=min(N,start+len(v));skip=max(0,-start);start=max(0,start)
 if end<=start:return
 v=v[skip:skip+end-start]*amp
 if v.ndim==1:v=np.column_stack((v*np.sqrt((1-pan)/2),v*np.sqrt((1+pan)/2)))
 bus[start:end]+=v

def time(d):return np.arange(round(d*SR))/SR
def filt_noise(d,lo=1000,hi=15000):
 n=round(d*SR);a=rng.normal(0,1,n);s=np.fft.rfft(a);f=np.fft.rfftfreq(n,1/SR);s*=np.minimum(1,(f/max(1,lo))**3)*np.minimum(1,(hi/np.maximum(f,1))**4);v=np.fft.irfft(s,n);return v/(np.std(v)+1e-6)
def kick():
 t=time(.43);phase=2*np.pi*(48*t+103*.027*(1-np.exp(-t/.027)));v=np.sin(phase)*np.exp(-t*11);v+=filt_noise(.43,2600,7500)*np.exp(-t*350)*.09;return np.tanh(v*1.6)*.75

def clap():
 t=time(.23);v=filt_noise(.23,1100,9000);env=np.exp(-t*26)*.36
 for a in [0,.009,.019]:env+=np.where(t>=a,np.exp(-np.maximum(t-a,0)*210),0)*.64
 return v*env

def hat(open=False):
 d=.19 if open else .065;t=time(d);v=filt_noise(d,6500,15500);return v*np.exp(-t*(21 if open else 90))*(1-np.exp(-t*1600))

def bass(m,d=.28):
 t=time(d);f=note(m);v=np.zeros(len(t))
 for k in range(1,8):v+=np.sin(2*np.pi*f*k*t+.15/k)/k**1.9*np.exp(-t*k*3)
 env=(1-np.exp(-t*330))*np.exp(-t*5)*np.minimum(1,(d-t)*60);return np.tanh(v*1.5)*env

def keys(notes,d=1.3):
 t=time(d);v=np.zeros((len(t),2))
 for i,m in enumerate(notes):
  f=note(m)
  for ch,det in enumerate([.999,1.001]):
   wave1=np.sin(2*np.pi*f*det*t)+.24*np.sin(2*np.pi*f*2*det*t)*np.exp(-t*5)+.08*np.sin(2*np.pi*f*3*det*t)*np.exp(-t*9)
   env=(1-np.exp(-t*180))*np.exp(-t*3.1)*np.minimum(1,(d-t)*20)
   v[:,ch]+=wave1*env/len(notes)
 return v

def pluck(m,d=.65):
 t=time(d);f=note(m);v=np.sin(2*np.pi*f*t+1.3*np.sin(2*np.pi*f*2*t)*np.exp(-t*19));v+=.22*np.sin(2*np.pi*f*3*t)*np.exp(-t*12)
 return v*np.exp(-t*8.5)*(1-np.exp(-t*850))*np.minimum(1,(d-t)*40)

# Six bars. The last half-bar leaves space for the end-card and musical decay.
roots=[38,34,41,36,34,38]
chords=[[62,65,69,72,76],[58,62,65,69,72],[60,65,69,72,76],[60,64,67,74],[58,62,65,69,72],[62,65,69,72,76]]
k=kick();cl=clap()
for b in range(23):
 at=b*BEAT
 if b<20 or b in [20,22]:add(k,at,.65)
 if b%2 and b<22:add(cl,at,.155,(-.1 if b%4==1 else .1))
 if b<22:
  add(hat(),at+BEAT*.5,.065,.36 if b%2 else -.36)
  add(hat(True),at+BEAT*.75,.034,-.22)
  if b%4 in [2,3]:add(hat(),at+BEAT*.25,.025,.55)
for bar in range(6):
 r=roots[bar];ch=chords[bar]
 for off,m,vel in [(0,r,.25),(.75,r,.18),(1.5,r+12,.19),(2,r,.26),(2.75,r+7,.14),(3.5,r,.21)]:
  at=(bar*4+off)*BEAT
  if at<9.2:add(bass(m),at,vel,-.04)
 for off,gain in [(.5,.24),(1.75,.16),(2.5,.25),(3.5,.14)]:
  at=(bar*4+off)*BEAT
  if at<9.1:
   v=keys(ch);add(v,at,gain)
   add(v,at+BEAT*.75,gain*.21)
 # Airy sustained chord bed with ducking from the kick.
 tt=time(1.95);pad=np.zeros((len(tt),2))
 for j,m in enumerate(ch):
  for channel,det in enumerate([.9988,1.0012]):pad[:,channel]+=np.sin(2*np.pi*note(m)*det*tt+j*.31)
 env=np.minimum(1,tt/.17)*np.minimum(1,(1.95-tt)/.7)*.038/len(ch)
 duck=.35+.65*np.minimum(1,(tt%BEAT)/.17)
 add(pad*(env*duck)[:,None],bar*4*BEAT)
# Catchy repeating topline, resolving to the tonic on the logo reveal.
melody=[(0,74),(1.5,77),(2.5,81),(3.25,79),(4.5,77),(5.5,74),(6.5,72),(7.25,74),
 (8,77),(9.5,81),(10.5,84),(11.25,81),(12,79),(13,76),(14,77),(15.5,74),(16,72),(17,69),(18,74),(19.5,77),(20.5,74)]
for j,(b,m) in enumerate(melody):
 at=b*BEAT;v=pluck(m);pan=.16*np.sin(j*1.7);add(v,at,.135,pan)
 add(v,at+BEAT*.75,.035,-pan-.25);add(v,at+BEAT*1.5,.018,.35)
# Precisely placed transition sweeps, UI ticks and a low brand impact.
transitions=[4,8,14,18]
for b in transitions:
 at=b*BEAT;d=.24;t=time(d);n=filt_noise(d,1800,11500);v=n*(t/d)**2*np.minimum(1,(d-t)*200)
 add(v,at-d,.085,-.1,fx)
 t=time(.3);impact=np.sin(2*np.pi*(43*t+50*.03*(1-np.exp(-t/.03))))*np.exp(-t*17)
 add(impact,at,.20,0,fx)
 t=time(.32);spark=np.sin(2*np.pi*(1500*t-1200*t*t))*np.exp(-t*30)
 add(spark,at,.018,.2,fx)
for at,m in [(2.56,91),(4.166667,86),(4.583333,91),(7.95,86),(8.15,93)]:
 add(pluck(m,.25),at,.07,.25,fx)
# A short stereo room and filtered ping-pong tail glue the instruments together.
wet=np.zeros_like(mix)
for delay,gain in [(.039,.07),(.067,.06),(.107,.045),(.157,.032),(.229,.027),(.313,.022)]:
 n=round(delay*SR);wet[n:]+=mix[:-n,::-1]*gain
mix+=wet+fx
# Gentle saturation, controlled crest factor, no clipping; complete fade within 10 seconds.
mix=np.tanh(mix*1.34)
fade=np.minimum(1,np.arange(N)/480)*np.minimum(1,((N-1-np.arange(N))/(SR*.42)))
mix*=fade[:,None]
mix*=10**(-1/20)/np.max(np.abs(mix))
with wave.open(str(OUT/'quefalta-original-score.wav'),'wb') as f:
 f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR);f.writeframes((mix*32767).astype('<i2').tobytes())
report={'duration':DUR,'sampleRate':SR,'bpm':144,'beats':24,'peak_dbfs':round(20*np.log10(np.max(np.abs(mix))),2),'rms_dbfs':round(20*np.log10(np.sqrt(np.mean(mix**2))),2),'transition_seconds':[round(b*BEAT,6) for b in transitions],'source':'Original procedural composition. No third-party recordings.'}
(OUT/'audio-report.json').write_text(json.dumps(report,indent=2));print(report)
