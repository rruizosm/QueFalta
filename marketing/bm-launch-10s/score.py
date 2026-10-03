"""Original 120 BPM BM launch cue and synchronized UI sound design; no sampled music."""
from pathlib import Path
import numpy as np, wave, json
SR=48000; DUR=10; BEAT=60/120; N=int(SR*DUR)
OUT=Path(__file__).resolve().parent
rng=np.random.default_rng(29926)
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

# Five bars in C major. Original bass, Rhodes-like chords and a bright marimba motif.
roots=[36,41,43,33,36]
chords=[[60,64,67,71,74],[60,64,65,69,72],[59,62,67,69,74],[60,64,69,71,76],[60,64,67,72,76]]
k=kick();cl=clap()
for b in range(18):
 at=b*BEAT
 add(k,at,.48)
 if b%2:add(cl,at,.105,.10 if b%4==1 else -.10)
 if b<17:
  add(hat(),at+BEAT*.5,.044,.33 if b%2 else -.33)
  if b%2:add(hat(True),at+BEAT*.75,.022,-.2)
for bar,(root,ch) in enumerate(zip(roots,chords)):
 for offset,m,amp in [(0,root,.29),(.75,root+12,.14),(1.5,root,.22),(2.5,root+7,.16),(3,root,.22)]:
  at=(bar*4+offset)*BEAT
  if at<8.5:add(bass(m,.36),at,amp)
 for offset,gain in [(0,.31),(1.5,.22),(2.75,.25)]:
  at=(bar*4+offset)*BEAT
  if at<8.5:
   v=keys(ch,1.65);add(v,at,gain);add(v,at+.375,gain*.2)
melody=[(0,76),(.5,79),(1.5,81),(2.5,79),(3,76),(4.5,77),(5.5,81),(6.5,79),(7,76),
 (8,74),(8.5,79),(9.5,81),(10.5,83),(11.5,79),(12,76),(13,81),(14,79),(15,76),(16,79),(17,84)]
for i,(beat,m) in enumerate(melody):
 at=beat*BEAT;v=pluck(m,.7);pan=.15*np.sin(i*1.9);add(v,at,.16,pan);add(v,at+.375,.037,-pan)
# End card resolves on Cmaj9, with no further drums. A clean natural tail is audible to 10 s.
add(keys([60,64,67,72,76],1.5),8.5,.42)
add(bass(36,.6),8.5,.30)
# Transition swishes and short UI tones align with editorial changes, not invented UI actions.
for at in [1.5,3.5,6.8,8.5]:
 d=.18;t=time(d);sweep=filt_noise(d,1900,9500)*(t/d)**2*np.minimum(1,(d-t)*200)
 add(sweep,at-d,.060,-.10,fx)
 t=time(.25);impact=np.sin(2*np.pi*(48*t+42*.025*(1-np.exp(-t/.025))))*np.exp(-t*19)
 add(impact,at,.14,0,fx)
for at,m in [(0,84),(1.72,88),(3.50,84),(4.22,88),(4.96,91),(6.8,88),(8.5,96)]:
 add(pluck(m,.28),at,.085,.16,fx)
wet=np.zeros_like(mix)
for delay,gain in [(.041,.065),(.073,.055),(.109,.04),(.173,.027),(.251,.02)]:
 n=round(delay*SR);wet[n:]+=mix[:-n,::-1]*gain
mix=np.tanh((mix+wet+fx)*1.25)
fade=np.minimum(1,np.arange(N)/192)*np.minimum(1,(N-1-np.arange(N))/(SR*.32))
mix*=fade[:,None]
mix*=10**(-1.3/20)/np.max(np.abs(mix))
with wave.open(str(OUT/'bm-original-score.wav'),'wb') as f:
 f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR);f.writeframes((mix*32767).astype('<i2').tobytes())
report={'duration':DUR,'sampleRate':SR,'channels':2,'bpm':120,'peak_dbfs':round(20*np.log10(np.max(np.abs(mix))),2),'rms_dbfs':round(20*np.log10(np.sqrt(np.mean(mix**2))),2),'transition_seconds':[1.5,3.5,6.8,8.5],'benefit_seconds':[3.5,4.22,4.96],'source':'Original procedural score and sound effects. No third-party samples. No voiceover.'}
(OUT/'audio-report.json').write_text(json.dumps(report,indent=2));print(report)
