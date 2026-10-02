const $=id=>document.getElementById(id);

let state={
  name:'Horror Story 01',
  media:[],
  timeline:[],
  selected:null,
  audio:null,
  music:[],
  settings:{
    language:'en-US',
    voice:'en-US-AriaNeural',
    rate:100,
    pitch:0,
    origVol:100,
    addVol:100,
    start:0,
    end:0,
    musicVol:35,
    timelineZoom:70,
    playheadMs:0
  }
};

let currentURL=null;
let ttsBlob=null;
let ttsDraft=null;

let timelinePlayheadMs=0;
let timelineZoom=70;
let playheadDragging=false;

/*
  true while the main Play button is controlling
  synchronized timeline playback.
*/
let timelinePlaybackActive=false;


/* ============================================================
   BASIC HELPERS
   ============================================================ */

const fmt=ms=>{
  ms=Math.max(0,ms||0);

  let s=Math.floor(ms/1000);
  let h=Math.floor(s/3600);

  s%=3600;

  let m=Math.floor(s/60);
  s%=60;

  return h
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function toast(msg,error=false){
  const stack=$('toastStack');
  if(!stack)return;

  const t=document.createElement('div');

  t.className='toast'+(error?' error':'');
  t.textContent=msg;

  stack.appendChild(t);

  setTimeout(()=>t.remove(),2600);
}

function ripple(e){
  const b=e.currentTarget;
  if(!b)return;

  const d=document.createElement('span');
  d.className='ripple-dot';

  const r=b.getBoundingClientRect();
  const s=Math.max(r.width,r.height)*.55;

  d.style.width=d.style.height=s+'px';
  d.style.left=(e.clientX-r.left-s/2)+'px';
  d.style.top=(e.clientY-r.top-s/2)+'px';

  b.appendChild(d);

  setTimeout(()=>d.remove(),550);
}

function busy(btn,on=true){
  if(!btn)return;

  btn.classList.toggle('loading',on);
  btn.disabled=on;
}


/* ============================================================
   SPEED NORMALIZATION
   ============================================================ */

function normalizeSpeedSetting(value){

  const n=Number(value);

  if(!Number.isFinite(n)){
    return 100;
  }

  /*
    Old version used 0 as normal speed.
    New version uses 100 as normal speed.
  */
  if(n===0){
    return 100;
  }

  return Math.max(
    50,
    Math.min(
      200,
      Math.round(n)
    )
  );
}


/* ============================================================
   THEME
   ============================================================ */

function applyTheme(theme){

  const t=
    theme==='light'
    ?'light'
    :'dark';

  document.documentElement.dataset.theme=t;

  localStorage.setItem(
    'audioverse-theme',
    t
  );

  const icon=$('themeIcon');
  const text=$('themeText');

  if(icon){
    icon.textContent=
      t==='dark'
      ?'☀'
      :'☾';
  }

  if(text){
    text.textContent=
      t==='dark'
      ?'Light'
      :'Dark';
  }

  const meta=
    document.querySelector(
      'meta[name=theme-color]'
    );

  if(meta){
    meta.content=
      t==='dark'
      ?'#20242a'
      :'#f7f9fc';
  }
}

function initTheme(){

  const saved=
    localStorage.getItem(
      'audioverse-theme'
    );

  applyTheme(
    saved||'dark'
  );

  $('themeBtn')?.addEventListener(
    'click',
    ()=>{

      const next=
        document.documentElement.dataset.theme==='dark'
        ?'light'
        :'dark';

      applyTheme(next);

      toast(
        next==='dark'
        ?'Dark mode enabled'
        :'Light mode enabled'
      );
    }
  );
}


/* ============================================================
   REFRESH / STATE
   ============================================================ */

async function refresh(){

  state.media=
    await AVDB.getAll('media');

  const p=
    await AVDB.get(
      'projects',
      'current'
    );

  if(p){

    state={
      ...state,
      ...p,
      settings:{
        ...state.settings,
        ...(p.settings||{})
      }
    };
  }

  state.settings.rate=
    normalizeSpeedSetting(
      state.settings.rate
    );

  timelineZoom=
    Number(
      state.settings.timelineZoom
    )||70;

  const z=
    $('timelineZoom');

  if(z){
    z.value=timelineZoom;
  }

  timelinePlayheadMs=
    Math.max(
      0,
      Number(
        state.settings.playheadMs
      )||0
    );

  normalizeAudioTiming();

  renderMedia();
  renderTimeline();
  renderMusic();
  renderSettings();

  setTimelinePlayhead(
    timelinePlayheadMs,
    {
      preview:false,
      scroll:false
    }
  );

  updateStorage();

  syncAudioPreview();
}


/* ============================================================
   MEDIA THUMBNAILS
   ============================================================ */

function thumbHTML(m){

  const src=
    URL.createObjectURL(
      m.blob
    );

  setTimeout(
    ()=>{
      try{
        URL.revokeObjectURL(src);
      }catch{}
    },
    30000
  );

  if(
    m.type?.startsWith('video')
  ){

    return `
      <video
        src="${src}"
        muted
        preload="metadata"
        disableRemotePlayback
        disablePictureInPicture
        playsinline
        x-webkit-airplay="deny">
      </video>
    `;
  }

  return `
    <div style="
      height:100%;
      display:grid;
      place-items:center;
      color:#174a7b;
      font-size:25px
    ">♪</div>
  `;
}

function hardenMediaVideo(el){

  if(!el)return;

  el.disableRemotePlayback=true;
  el.disablePictureInPicture=true;
  el.controls=false;

  el.setAttribute(
    'playsinline',
    ''
  );

  el.setAttribute(
    'disableRemotePlayback',
    ''
  );

  el.setAttribute(
    'disablePictureInPicture',
    ''
  );

  el.setAttribute(
    'x-webkit-airplay',
    'deny'
  );
}


/* ============================================================
   MEDIA LIBRARY
   ============================================================ */

function renderMedia(){

  const search=$('mediaSearch');

  const q=
    search
    ?search.value.toLowerCase()
    :'';

  const list=$('mediaList');

  if(!list)return;

  list.innerHTML='';

  state.media
    .filter(
      x=>
        String(x.name||'')
          .toLowerCase()
          .includes(q)
    )
    .forEach(
      m=>{

        const inTimeline=
          state.timeline.some(
            x=>x.mediaId===m.id
          );

        /*
          Important:
          The active narration is also considered attached.
        */
        const isActiveAudio=
          !!(
            state.audio &&
            state.audio.mediaId===m.id
          );

        const attached=
          inTimeline||
          isActiveAudio;

        const d=
          document.createElement('div');

        d.className=
          'media-item '+
          (attached?'selected':'');

        d.title=m.name;

        d.innerHTML=`
          <div class="thumb">
            ${thumbHTML(m)}
          </div>

          <div class="media-copy">
            <b>${escapeHTML(m.name)}</b>

            <small>
              ${
                m.type?.startsWith('audio')
                ?'Audio'
                :'Video'
              }
              •
              ${fmt(m.duration||0)}
            </small>
          </div>

          <button
            type="button"
            class="media-check"
            aria-label="${
              isActiveAudio
              ?'Remove active audio'
              :inTimeline
              ?'Remove from timeline'
              :'Add to timeline'
            }"
            title="${
              isActiveAudio
              ?'Remove active audio'
              :inTimeline
              ?'Remove from timeline'
              :'Add to timeline'
            }">
            ${
              attached
              ?'✓'
              :'+'
            }
          </button>
        `;

        d.onclick=async()=>{

          if(
            m.type?.startsWith('audio')
          ){

            await useImportedAudio(
              m.id
            );

          }else{

            loadLibraryPreview(m);
          }
        };

        d.querySelector(
          '.media-check'
        ).onclick=
          async e=>{

            e.stopPropagation();

            if(
              m.type?.startsWith('audio')
            ){

              if(isActiveAudio){

                await detachAudioFromProject();

              }else{

                await useImportedAudio(
                  m.id
                );
              }

              return;
            }

            if(inTimeline){

              removeMediaFromTimeline(
                m.id
              );

            }else{

              await addToTimeline(
                m.id
              );
            }
          };

        list.appendChild(d);

        hardenMediaVideo(
          d.querySelector('video')
        );
      }
    );
}


/* ============================================================
   VIDEO PREVIEW
   ============================================================ */

function loadLibraryPreview(m){

  if(!m)return;

  if(
    m.type?.startsWith('audio')
  ){

    useImportedAudio(
      m.id
    );

    return;
  }

  if(currentURL){

    try{
      URL.revokeObjectURL(
        currentURL
      );
    }catch{}
  }

  currentURL=
    URL.createObjectURL(
      m.blob
    );

  const v=
    $('previewVideo');

  if(!v)return;

  v.src=currentURL;

  hardenMediaVideo(v);

  $('emptyPreview').style.display=
    'none';

  $('previewStatus').textContent=
    m.name;

  v.load();

  try{
    v.currentTime=0;
  }catch{}

  v.play().catch(()=>{});

  toast(
    'Previewing '+m.name
  );
}

function loadPreview(m){

  if(!m)return;

  if(currentURL){

    try{
      URL.revokeObjectURL(
        currentURL
      );
    }catch{}
  }

  currentURL=
    URL.createObjectURL(
      m.blob
    );

  const v=
    $('previewVideo');

  if(!v)return;

  v.src=currentURL;

  hardenMediaVideo(v);

  $('emptyPreview').style.display=
    'none';

  $('previewStatus').textContent=
    m.name;

  v.load();

  try{
    v.currentTime=0;
  }catch{}

  v.play().catch(()=>{});
}


/* ============================================================
   TIMELINE MEDIA
   ============================================================ */

async function addToTimeline(id){

  const m=
    state.media.find(
      x=>x.id===id
    );

  if(
    !m||
    m.type?.startsWith('audio')
  ){
    return;
  }

  const it={
    id:crypto.randomUUID(),
    mediaId:id,
    name:m.name,
    inMs:0,
    outMs:m.duration||0,
    duration:m.duration||0
  };

  state.timeline.push(it);

  state.selected=it.id;

  await saveState();

  renderTimeline();
  renderMedia();

  loadPreview(m);

  toast(
    'Clip added to timeline'
  );
}

async function removeMediaFromTimeline(
  mediaId
){

  const current=
    state.timeline.find(
      x=>
        x.id===state.selected &&
        x.mediaId===mediaId
    );

  state.timeline=
    state.timeline.filter(
      x=>x.mediaId!==mediaId
    );

  if(current){
    state.selected=null;
  }

  await saveState();

  renderTimeline();
  renderMedia();

  toast(
    'Clip removed from timeline'
  );
}


/* ============================================================
   AUDIO TIMING
   ============================================================ */

function normalizeAudioTiming(){

  const s=
    state.settings||{};

  const end=
    Number(s.end)||0;

  const start=
    Number(s.start)||0;

  const duration=
    Number(
      state.audio?.duration||
      state.audio?.end||
      0
    );

  if(
    duration>0 &&
    end>duration/1000*1.5
  ){

    s.start=
      start/1000;

    s.end=
      end/1000;

    state.settings=s;
  }

  if(
    state.audio &&
    !state.audio.duration
  ){

    state.audio.duration=
      duration;
  }

  /*
    Ensure old projects have the
    new speed semantics.
  */
  s.rate=
    normalizeSpeedSetting(
      s.rate
    );
}


/* ============================================================
   HTML5 AUDIO PREVIEW
   ============================================================ */

function loadBlobIntoHTML5Audio(blob){

  return new Promise(
    (resolve,reject)=>{

      const audio=
        $('ttsAudio');

      if(!audio){

        reject(
          new Error(
            'The TTS audio player was not found in the page.'
          )
        );

        return;
      }

      if(!blob){

        reject(
          new Error(
            'No audio was generated.'
          )
        );

        return;
      }

      if(audio._audioverseURL){

        try{
          URL.revokeObjectURL(
            audio._audioverseURL
          );
        }catch{}

        audio._audioverseURL=null;
      }

      const url=
        URL.createObjectURL(
          blob
        );

      audio._audioverseURL=url;

      let finished=false;

      const cleanup=()=>{

        audio.removeEventListener(
          'loadedmetadata',
          onMetadata
        );

        audio.removeEventListener(
          'durationchange',
          onDuration
        );

        audio.removeEventListener(
          'canplay',
          onCanPlay
        );

        audio.removeEventListener(
          'error',
          onError
        );

        clearTimeout(timer);
      };

      const finish=()=>{

        if(finished)return;

        const d=
          Number(
            audio.duration
          );

        if(
          Number.isFinite(d)&&
          d>0
        ){

          finished=true;

          cleanup();

          resolve(
            Math.round(d*1000)
          );
        }
      };

      const onMetadata=()=>{
        finish();
      };

      const onDuration=()=>{
        finish();
      };

      const onCanPlay=()=>{
        finish();
      };

      const onError=()=>{

        if(finished)return;

        finished=true;

        cleanup();

        reject(
          new Error(
            'The generated audio could not be loaded by the browser.'
          )
        );
      };

      const timer=
        setTimeout(
          ()=>{

            if(finished)return;

            const d=
              Number(
                audio.duration
              );

            if(
              Number.isFinite(d)&&
              d>0
            ){

              finish();

            }else{

              finished=true;

              cleanup();

              reject(
                new Error(
                  'The generated audio loaded, but HTML5 could not determine its duration.'
                )
              );
            }

          },
          15000
        );

      audio.addEventListener(
        'loadedmetadata',
        onMetadata
      );

      audio.addEventListener(
        'durationchange',
        onDuration
      );

      audio.addEventListener(
        'canplay',
        onCanPlay
      );

      audio.addEventListener(
        'error',
        onError
      );

      audio.preload='auto';

      audio.volume=
        Math.max(
          0,
          Math.min(
            1,
            (
              Number(
                $('addVol')?.value
              )||100
            )/100
          )
        );

      audio.src=url;

      try{
        audio.load();
      }catch{
        onError();
      }
    }
  );
}

function setAudioPreview(m){

  const a=
    $('ttsAudio');

  if(
    !a||
    !m?.blob
  ){
    return;
  }

  try{
    a.pause();
  }catch{}

  if(a._audioverseURL){

    try{
      URL.revokeObjectURL(
        a._audioverseURL
      );
    }catch{}

    a._audioverseURL=null;
  }

  const url=
    URL.createObjectURL(
      m.blob
    );

  a._audioverseURL=url;

  a.src=url;
  a.preload='auto';

  a.volume=
    Math.max(
      0,
      Math.min(
        1,
        (
          Number(
            $('addVol')?.value
          )||100
        )/100
      )
    );

  try{
    a.load();
  }catch{}
}

function waitForHTML5AudioMetadata(audio){

  return new Promise(
    (resolve,reject)=>{

      if(!audio){

        reject(
          new Error(
            'Audio player not found.'
          )
        );

        return;
      }

      const check=()=>{

        const d=
          Number(
            audio.duration
          );

        if(
          Number.isFinite(d)&&
          d>0
        ){

          cleanup();

          resolve(
            Math.round(d*1000)
          );
        }
      };

      const onError=()=>{

        cleanup();

        reject(
          new Error(
            'Browser could not read the audio file.'
          )
        );
      };

      const cleanup=()=>{

        audio.removeEventListener(
          'loadedmetadata',
          check
        );

        audio.removeEventListener(
          'durationchange',
          check
        );

        audio.removeEventListener(
          'canplay',
          check
        );

        audio.removeEventListener(
          'error',
          onError
        );

        clearTimeout(timer);
      };

      audio.addEventListener(
        'loadedmetadata',
        check
      );

      audio.addEventListener(
        'durationchange',
        check
      );

      audio.addEventListener(
        'canplay',
        check
      );

      audio.addEventListener(
        'error',
        onError
      );

      const timer=
        setTimeout(
          ()=>{

            const d=
              Number(
                audio.duration
              );

            if(
              Number.isFinite(d)&&
              d>0
            ){

              cleanup();

              resolve(
                Math.round(d*1000)
              );

            }else{

              cleanup();

              reject(
                new Error(
                  'Audio duration could not be determined.'
                )
              );
            }

          },
          15000
        );

      check();
    }
  );
}


/* ============================================================
   PRECISE TIME
   ============================================================ */

function fmtPrecise(ms){

  ms=
    Math.max(
      0,
      Number(ms)||0
    );

  const totalTenths=
    Math.round(ms/100);

  const tenths=
    totalTenths%10;

  const totalSeconds=
    Math.floor(
      totalTenths/10
    );

  const h=
    Math.floor(
      totalSeconds/3600
    );

  const m=
    Math.floor(
      (totalSeconds%3600)/60
    );

  const sec=
    totalSeconds%60;

  const base=
    h
    ?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    :`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;

  return `${base}.${tenths}`;
}


/* ============================================================
   TIMELINE
   ============================================================ */

function timelineTotalMs(){

  return state.timeline.reduce(
    (x,it)=>
      x+
      Math.max(
        0,
        (it.outMs||0)-
        (it.inMs||0)
      ),
    0
  );
}

function clipAtTimelineMs(ms){

  let cursor=0;

  for(
    const it of state.timeline
  ){

    const dur=
      Math.max(
        0,
        (it.outMs||0)-
        (it.inMs||0)
      );

    if(
      ms<=cursor+dur||
      it===state.timeline[
        state.timeline.length-1
      ]
    ){

      return{
        it,
        start:cursor,
        offset:
          Math.max(
            0,
            Math.min(
              dur,
              ms-cursor
            )
          )
      };
    }

    cursor+=dur;
  }

  return null;
}


/* ============================================================
   TIMELINE AUDIO SYNCHRONIZATION
   ============================================================ */

function timelineAudioTargetMs(){

  if(!state.audio){
    return null;
  }

  const start=
    audioStartMs();

  const duration=
    audioDurationMs();

  const endPadding=
    audioEndPaddingMs();

  const total=
    start+
    duration+
    endPadding;

  const t=
    timelinePlayheadMs;

  if(
    t<start||
    t>total
  ){
    return null;
  }

  return Math.max(
    0,
    Math.min(
      duration,
      t-start
    )
  );
}

function syncTimelineAudio(){

  const audio=
    $('ttsAudio');

  if(
    !audio||
    !state.audio
  ){
    return;
  }

  const target=
    timelineAudioTargetMs();

  if(target===null){

    try{
      audio.pause();
    }catch{}

    return;
  }

  const targetSec=
    target/1000;

  if(
    !Number.isFinite(
      audio.currentTime
    )||
    Math.abs(
      audio.currentTime-
      targetSec
    )>0.12
  ){

    try{
      audio.currentTime=
        targetSec;
    }catch{}
  }
}

function playTimelineAudio(){

  const audio=
    $('ttsAudio');

  if(
    !audio||
    !state.audio
  ){
    return;
  }

  const target=
    timelineAudioTargetMs();

  if(target===null){
    return;
  }

  try{

    const targetSec=
      target/1000;

    if(
      !Number.isFinite(
        audio.currentTime
      )||
      Math.abs(
        audio.currentTime-
        targetSec
      )>0.15
    ){

      audio.currentTime=
        targetSec;
    }

    audio.volume=
      Math.max(
        0,
        Math.min(
          1,
          (
            Number(
              $('addVol')?.value
            )||100
          )/100
        )
      );

    audio.play().catch(
      ()=>{}
    );

  }catch{}
}

function pauseTimelineAudio(){

  const audio=
    $('ttsAudio');

  if(audio){

    try{
      audio.pause();
    }catch{}
  }
}

function stopTimelineAudio(){

  const audio=
    $('ttsAudio');

  if(audio){

    try{

      audio.pause();

      audio.currentTime=0;

    }catch{}
  }
}

function seekTimelineAudio(){

  syncTimelineAudio();

  if(
    timelinePlaybackActive
  ){
    playTimelineAudio();
  }
}


function setTimelinePlayhead(
  ms,
  {
    preview=true,
    scroll=true,
    save=false
  }={}
){

  const total=
    timelineTotalMs();

  timelinePlayheadMs=
    Math.max(
      0,
      Math.min(
        total,
        Math.round(
          (Number(ms)||0)/100
        )*100
      )
    );

  const field=
    $('playheadTime');

  if(field){
    field.value=
      (
        timelinePlayheadMs/1000
      ).toFixed(1);
  }

  const ph=
    $('timelinePlayhead');

  if(ph){

    ph.style.left=
      (
        88+
        timelinePlayheadMs/1000*
        timelineZoom
      )+'px';
  }

  if(preview){

    const hit=
      clipAtTimelineMs(
        timelinePlayheadMs
      );

    if(hit){

      if(
        state.selected!==
        hit.it.id
      ){

        state.selected=
          hit.it.id;

        renderTimeline();
        renderMedia();
        renderInspector();
      }

      const m=
        state.media.find(
          x=>x.id===hit.it.mediaId
        );

      if(m){

        const previewVideo=
          $('previewVideo');

        if(
          !previewVideo.src||
          $('previewStatus').textContent!==m.name
        ){

          loadPreview(m);
        }

        try{

          previewVideo.currentTime=
            Math.max(
              0,
              (
                hit.it.inMs+
                hit.offset
              )/1000
            );

        }catch{}
      }
    }
  }

  /*
    This is the important audio synchronization point.
  */
  syncTimelineAudio();

  if(scroll){

    const sc=
      $('timelineScroll');

    if(sc){

      const x=
        88+
        timelinePlayheadMs/1000*
        timelineZoom;

      const left=
        sc.scrollLeft;

      const right=
        left+
        sc.clientWidth;

      if(
        x<left+100||
        x>right-100
      ){

        sc.scrollLeft=
          Math.max(
            0,
            x-sc.clientWidth*.45
          );
      }
    }
  }

  if(save){
    saveState().catch(()=>{});
  }
}

function buildRuler(totalMs){

  const ruler=
    $('ruler');

  if(!ruler)return;

  ruler.innerHTML='';

  const totalSec=
    Math.max(
      1,
      totalMs/1000
    );

  const minorStep=
    totalSec<=120
    ?0.1
    :(totalSec<=600?0.5:1);

  const majorStep=
    totalSec<=60
    ?1
    :(totalSec<=600?5:10);

  const count=
    Math.ceil(
      totalSec/minorStep
    );

  const frag=
    document.createDocumentFragment();

  for(
    let i=0;
    i<=count;
    i++
  ){

    const sec=
      Math.min(
        totalSec,
        i*minorStep
      );

    const x=
      88+
      sec*timelineZoom;

    const tick=
      document.createElement(
        'span'
      );

    tick.className=
      'ruler-tick '+
      (
        Math.abs(
          sec/majorStep-
          Math.round(
            sec/majorStep
          )
        )<1e-6
        ?'major'
        :'minor'
      );

    tick.style.left=
      x+'px';

    if(
      tick.classList.contains(
        'major'
      )
    ){

      tick.dataset.label=
        fmtPrecise(
          sec*1000
        );
    }

    frag.appendChild(tick);
  }

  ruler.appendChild(frag);

  ruler.style.width=
    (
      88+
      totalSec*timelineZoom+
      40
    )+'px';
}

function renderTimeline(){

  const sc=
    $('timelineScroll');

  const savedLeft=
    sc?sc.scrollLeft:0;

  const savedTop=
    sc?sc.scrollTop:0;

  const total=
    timelineTotalMs();

  const canvas=
    $('timelineCanvas');

  if(!canvas)return;

  const minWidth=
    Math.max(
      820,
      88+
      (total/1000)*
      timelineZoom+
      120
    );

  canvas.style.width=
    minWidth+'px';

  canvas.style.minWidth=
    minWidth+'px';

  buildRuler(total);

  const t=
    $('timeline');

  t.innerHTML='';

  const tracks=[
    ['Video','video'],
    ['Audio','audio']
  ];

  tracks.forEach(
    ([name,type])=>{

      const row=
        document.createElement(
          'div'
        );

      row.className='track';

      row.innerHTML=`
        <div class="track-label">
          ${type==='audio'?'🔊':'🎬'} ${name}
        </div>

        <div
          class="track-content"
          id="track-${type}">
        </div>
      `;

      t.appendChild(row);
    }
  );

  const tv=
    $('track-video');

  state.timeline.forEach(
    it=>{

      const d=
        document.createElement(
          'div'
        );

      d.className=
        'clip-block '+
        (
          it.id===state.selected
          ?'selected'
          :''
        );

      const dur=
        Math.max(
          0,
          it.outMs-it.inMs
        );

      d.style.width=
        Math.max(
          6,
          dur/1000*
          timelineZoom
        )+'px';

      d.dataset.id=
        it.id;

      d.innerHTML=`
        <b>${escapeHTML(it.name)}</b>
        <small>${fmtPrecise(dur)}</small>

        <i class="trim-handle left"></i>
        <i class="trim-handle right"></i>
      `;

      d.onclick=e=>{

        if(
          e.target.classList.contains(
            'trim-handle'
          )
        ){
          return;
        }

        state.selected=
          it.id;

        let start=0;

        for(
          const x of state.timeline
        ){

          if(x.id===it.id)break;

          start+=
            Math.max(
              0,
              x.outMs-x.inMs
            );
        }

        setTimelinePlayhead(
          start,
          {
            preview:true,
            scroll:false
          }
        );

        const m=
          state.media.find(
            x=>x.id===it.mediaId
          );

        if(m){
          loadPreview(m);
        }

        renderTimeline();
        renderMedia();
        renderInspector();
      };

      tv.appendChild(d);
    }
  );

  /*
    Render the active narration block.
  */
  const a=
    $('track-audio');

  if(
    a&&
    state.audio
  ){

    const d=
      document.createElement(
        'div'
      );

    d.className=
      'audio-block';

    const dur=
      Math.max(
        0,
        audioStartMs()+
        audioDurationMs()+
        audioEndPaddingMs()
      );

    d.style.width=
      Math.max(
        80,
        dur/1000*
        timelineZoom
      )+'px';

    d.style.marginLeft=
      (
        audioStartMs()/1000*
        timelineZoom
      )+'px';

    d.title=
      state.audio.name||
      'Narration';

    d.innerHTML=`
      <div class="wave"></div>
    `;

    d.onclick=async()=>{

      timelinePlaybackActive=false;

      const v=
        $('previewVideo');

      if(v){
        try{
          v.pause();
        }catch{}
      }

      setTimelinePlayhead(
        audioStartMs(),
        {
          preview:false,
          scroll:false
        }
      );

      const m=
        currentAudioMedia();

      if(m){
        setAudioPreview(m);
        await waitForHTML5AudioMetadata(
          $('ttsAudio')
        ).catch(()=>{});
      }

      playTimelineAudio();

      if($('ttsStatus')){
        $('ttsStatus').textContent=
          'Playing narration…';
      }
    };

    a.appendChild(d);
  }

  const durationLabel=
    $('durationLabel');

  if(durationLabel){
    durationLabel.textContent=
      fmtPrecise(total);
  }

  const ph=
    $('timelinePlayhead');

  if(ph){

    ph.style.left=
      (
        88+
        timelinePlayheadMs/1000*
        timelineZoom
      )+'px';
  }

  if(sc){

    sc.scrollLeft=
      savedLeft;

    sc.scrollTop=
      savedTop;
  }

  updateLabels();

  renderInspector();
}

function renderInspector(){

  const it=
    state.timeline.find(
      x=>x.id===state.selected
    );

  if($('clipTab')){

    $('clipInspector').innerHTML=
      it
      ?`
        <b>${escapeHTML(it.name)}</b><br>
        Start: ${fmtPrecise(it.inMs)}<br>
        End: ${fmtPrecise(it.outMs)}<br>
        Duration: ${fmtPrecise(
          Math.max(
            0,
            it.outMs-it.inMs
          )
        )}
      `
      :'Select a timeline clip.';
  }
}


/* ============================================================
   SAVE STATE
   ============================================================ */

async function saveState(){

  const startSec=
    Math.max(
      0,
      +$('audioStart').value||0
    );

  const endSec=
    Math.max(
      0,
      +$('audioEnd').value||0
    );

  state.settings={
    ...state.settings,

    language:
      $('language').value,

    voice:
      $('voice').value,

    rate:
      normalizeSpeedSetting(
        +$('speed').value
      ),

    pitch:
      +$('pitch').value,

    origVol:
      +$('origVol').value,

    addVol:
      +$('addVol').value,

    start:startSec,

    end:endSec,

    musicVol:
      +$('musicVol').value,

    timelineZoom,

    playheadMs:
      timelinePlayheadMs
  };

  if(state.audio){

    state.audio.start=
      Math.round(
        startSec*1000
      );

    state.audio.duration=
      Number(
        state.audio.duration||
        state.audio.end||
        0
      );

    state.audio.endPadding=
      Math.round(
        endSec*1000
      );

    state.audio.end=
      state.audio.duration;

    state.audio.volume=
      +$('addVol').value||100;
  }

  await AVDB.put(
    'projects',
    {
      id:'current',

      name:
        state.name,

      timeline:
        state.timeline,

      selected:
        state.selected,

      audio:
        state.audio,

      srt:
        state.srt||null,

      music:
        state.music,

      settings:
        state.settings
    }
  );

  const projectName=
    $('projectName');

  if(projectName){
    projectName.textContent=
      state.name;
  }
}


/* ============================================================
   MP3 DURATION FALLBACK
   ============================================================ */

function parseMp3DurationFromBuffer(buffer){

  try{

    const bytes=
      new Uint8Array(buffer);

    if(bytes.length<4)return 0;

    let pos=0;

    if(
      bytes.length>=10 &&
      bytes[0]===0x49 &&
      bytes[1]===0x44 &&
      bytes[2]===0x33
    ){

      const size=
        (
          (bytes[6]&0x7f)<<21
        )|
        (
          (bytes[7]&0x7f)<<14
        )|
        (
          (bytes[8]&0x7f)<<7
        )|
        (bytes[9]&0x7f);

      pos=
        10+
        size+
        (
          (bytes[5]&0x10)
          ?10
          :0
        );
    }

    const bitratesV1={
      1:[
        0,32,40,48,56,64,80,
        96,112,128,160,192,224,
        256,320
      ],

      2:[
        0,8,16,24,32,40,48,
        56,64,80,96,112,128,
        144,160
      ]
    };

    const sampleRates={
      0:[
        44100,
        48000,
        32000
      ],

      1:[
        22050,
        24000,
        16000
      ],

      2:[
        11025,
        12000,
        8000
      ]
    };

    let frames=0;
    let bytesTotal=0;
    let firstBitrate=0;
    let sampleRate=0;
    let samplesTotal=0;

    for(
      let i=pos;
      i+4<bytes.length &&
      frames<200000;
    ){

      if(
        bytes[i]!==0xff||
        (bytes[i+1]&0xe0)!==0xe0
      ){

        i++;
        continue;
      }

      const b1=
        bytes[i+1];

      const b2=
        bytes[i+2];

      const versionBits=
        (b1>>3)&3;

      const layer=
        (b1>>1)&3;

      const bitrateIndex=
        (b2>>4)&15;

      const srIndex=
        (b2>>2)&3;

      if(
        layer!==1||
        bitrateIndex===0||
        bitrateIndex===15||
        srIndex===3
      ){

        i++;
        continue;
      }

      const version=
        versionBits===3
        ?1
        :(versionBits===2?2:0);

      if(!version){

        i++;
        continue;
      }

      const kbps=
        bitratesV1[
          version
        ][bitrateIndex];

      const sr=
        sampleRates[
          version===1
          ?0
          :(version===2?1:2)
        ][srIndex];

      if(!kbps||!sr){

        i++;
        continue;
      }

      const padding=
        (b2>>1)&1;

      const samplesPerFrame=
        version===1
        ?1152
        :576;

      const frameLen=
        version===1
        ?Math.floor(
          144*
          kbps*
          1000/
          sr
        )+padding
        :Math.floor(
          72*
          kbps*
          1000/
          sr
        )+padding;

      if(
        frameLen<24||
        i+frameLen>bytes.length
      ){

        i++;
        continue;
      }

      if(!firstBitrate){
        firstBitrate=kbps;
      }

      sampleRate=sr;

      frames++;

      bytesTotal+=
        frameLen;

      samplesTotal+=
        samplesPerFrame;

      i+=frameLen;

      if(
        frames>=100&&
        bytesTotal>1024*1024&&
        i>bytes.length-4096
      ){

        break;
      }
    }

    if(
      !frames||
      !sampleRate
    ){

      return 0;
    }

    const byFrames=
      samplesTotal/
      sampleRate;

    if(
      Number.isFinite(byFrames)&&
      byFrames>0
    ){

      return byFrames;
    }

    if(firstBitrate){

      return(
        (bytes.length-pos)*8/
        (firstBitrate*1000)
      );
    }

  }catch(e){

    console.warn(
      'MP3 duration parser failed',
      e
    );
  }

  return 0;
}


/* ============================================================
   MEDIA DURATION
   ============================================================ */

async function mediaDuration(file){

  if(!file)return 0;

  const blob=
    file instanceof Blob
    ?file
    :new Blob([file]);

  const browserDuration=
    await new Promise(
      resolve=>{

        const isVideo=
          (file.type||'')
            .startsWith('video/')||
          /\.(mp4|webm|mov|mkv|m4v|avi)$/i
            .test(file.name||'');

        const el=
          document.createElement(
            isVideo
            ?'video'
            :'audio'
          );

        const u=
          URL.createObjectURL(
            blob
          );

        let settled=false;

        const finish=d=>{

          if(settled)return;

          const n=
            Number(d);

          if(
            Number.isFinite(n)&&
            n>0
          ){

            settled=true;

            cleanup();

            resolve(
              n*1000
            );
          }
        };

        const cleanup=()=>{

          clearTimeout(timer);

          el.onloadedmetadata=null;
          el.ondurationchange=null;
          el.onerror=null;

          try{
            URL.revokeObjectURL(u);
          }catch{}

          try{
            el.removeAttribute('src');
            el.load();
          }catch{}
        };

        const timer=
          setTimeout(
            ()=>{

              if(!settled){

                settled=true;

                cleanup();

                resolve(0);
              }

            },
            10000
          );

        el.preload='metadata';

        el.onloadedmetadata=
          ()=>finish(
            el.duration
          );

        el.ondurationchange=
          ()=>finish(
            el.duration
          );

        el.onerror=()=>{

          if(!settled){

            settled=true;

            cleanup();

            resolve(0);
          }
        };

        el.src=u;

        try{
          el.load();
        }catch{}
      }
    );

  if(browserDuration){

    return Math.round(
      browserDuration
    );
  }

  const type=
    (file.type||'')
      .toLowerCase();

  const name=
    (file.name||'')
      .toLowerCase();

  if(
    type.includes('mpeg')||
    type.includes('mp3')||
    /\.mp3$/i.test(name)
  ){

    const buffer=
      await blob.arrayBuffer();

    const parsed=
      parseMp3DurationFromBuffer(
        buffer
      );

    if(parsed){

      return Math.round(
        parsed*1000
      );
    }
  }

  try{

    const C=
      window.AudioContext||
      window.webkitAudioContext;

    if(C){

      const ctx=
        new C();

      const decoded=
        await ctx.decodeAudioData(
          await blob.arrayBuffer()
        );

      const d=
        Number(
          decoded?.duration
        )||0;

      try{
        await ctx.close();
      }catch{}

      if(
        Number.isFinite(d)&&
        d>0
      ){

        return Math.round(
          d*1000
        );
      }
    }

  }catch(e){

    console.warn(
      'Audio decode fallback failed',
      e
    );
  }

  return 0;
}


/* ============================================================
   FILE TYPE
   ============================================================ */

function fileKind(file){

  const t=
    (file.type||'')
      .toLowerCase();

  const n=
    file.name.toLowerCase();

  if(
    t.startsWith('video/')||
    /\.(mp4|webm|mov|mkv|m4v|avi|mpeg|mpg)$/i
      .test(n)
  ){

    return 'video';
  }

  if(
    t.startsWith('audio/')||
    /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i
      .test(n)
  ){

    return 'audio';
  }

  return null;
}


/* ============================================================
   IMPORT MEDIA
   ============================================================ */

async function importFiles(files){

  const list=
    Array.from(files||[]);

  if(!list.length)return;

  let imported=0;
  let skipped=0;
  let firstVideo=null;

  for(
    const file of list
  ){

    const kind=
      fileKind(file);

    if(!kind){

      skipped++;

      continue;
    }

    try{

      const id=
        crypto.randomUUID();

      const duration=
        await mediaDuration(
          file
        );

      await AVDB.put(
        'media',
        {
          id,

          name:
            file.name,

          type:
            file.type||
            (
              kind+'/' +
              (
                kind==='video'
                ?'mp4'
                :'mpeg'
              )
            ),

          size:
            file.size,

          duration,

          blob:
            file
        }
      );

      imported++;

      if(
        !firstVideo&&
        kind==='video'
      ){

        firstVideo={
          id,
          name:file.name,
          type:
            file.type||
            'video/mp4',
          duration,
          blob:file
        };
      }

    }catch(e){

      skipped++;

      console.error(e);
    }
  }

  await refresh();

  if(firstVideo){

    loadLibraryPreview(
      firstVideo
    );
  }

  if(imported){

    toast(
      `${imported} media item${imported===1?'':'s'} imported — click + to add video to timeline`
    );
  }

  if(skipped){

    toast(
      `${skipped} file${skipped===1?' was':'s were'} skipped`,
      true
    );
  }
}


/* ============================================================
   MUSIC
   ============================================================ */

function renderMusic(){

  const list=
    $('musicList');

  if(!list)return;

  list.innerHTML='';

  (state.music||[]).forEach(
    (m,i)=>{

      const d=
        document.createElement(
          'div'
        );

      d.className=
        'music-row';

      d.innerHTML=`
        <span>
          ♫ ${escapeHTML(m.name)}
        </span>

        <button
          data-i="${i}"
          title="Remove">
          ×
        </button>
      `;

      d.querySelector(
        'button'
      ).onclick=
        async()=>{

          state.music.splice(
            i,
            1
          );

          await saveState();

          renderMusic();

          toast(
            'Music removed'
          );
        };

      list.appendChild(d);
    }
  );
}

async function importMusic(files){

  const list=
    Array.from(files||[]);

  if(!list.length)return;

  for(
    const file of list
  ){

    const duration=
      await mediaDuration(
        file
      );

    const mid=
      crypto.randomUUID();

    await AVDB.put(
      'media',
      {
        id:mid,
        name:file.name,
        type:file.type,
        size:file.size,
        duration,
        blob:file
      }
    );

    state.music.push(
      {
        mediaId:mid,
        name:file.name,
        duration,
        volume:
          +$('musicVol').value
      }
    );
  }

  await saveState();

  renderMusic();

  toast(
    `${list.length} music file${list.length===1?'':'s'} added`
  );
}


/* ============================================================
   SETTINGS
   ============================================================ */

function renderSettings(){

  const s=
    state.settings||{};

  $('speed').value=
    normalizeSpeedSetting(
      s.rate
    );

  $('pitch').value=
    s.pitch??0;

  $('origVol').value=
    s.origVol??100;

  $('addVol').value=
    s.addVol??100;

  $('audioStart').value=
    s.start??0;

  $('audioEnd').value=
    s.end??0;

  $('musicVol').value=
    s.musicVol??35;

  updateLabels();

  const projectName=
    $('projectName');

  if(projectName){

    projectName.textContent=
      state.name||
      'Untitled Project';
  }
}

function updateLabels(){

  const speed=
    $('speed');

  if(speed){

    $('speedValue').textContent=
      normalizeSpeedSetting(
        speed.value
      )+'%';
  }

  $('pitchValue').textContent=
    (
      +$('pitch').value>=0
      ?'+'
      :''
    )+
    $('pitch').value+
    ' Hz';

  $('origVolValue').textContent=
    $('origVol').value+
    '%';

  $('addVolValue').textContent=
    $('addVol').value+
    '%';

  $('musicVolValue').textContent=
    $('musicVol').value+
    '%';
}


/* ============================================================
   TTS VOICES
   ============================================================ */

async function setupTTS(){

  const langEl=
    $('language');

  const voiceEl=
    $('voice');

  if(!langEl||!voiceEl)return;

  const populateLanguages=()=>{

    const langs=
      Object.keys(
        EdgeTTS.catalog
      ).sort(
        (a,b)=>
          a.localeCompare(b)
      );

    const current=
      langEl.value;

    langEl.innerHTML='';

    langs.forEach(
      lang=>{

        const o=
          document.createElement(
            'option'
          );

        o.value=lang;

        o.textContent=lang;

        langEl.appendChild(o);
      }
    );

    const preferred=
      state.settings.language||
      'English';

    langEl.value=
      langs.includes(current)
      ?current
      :(
        langs.includes(preferred)
        ?preferred
        :(
          langs.includes('English')
          ?'English'
          :(langs[0]||'')
        )
      );

    fillVoices();
  };

  function fillVoices(){

    const lang=
      langEl.value;

    const vs=
      [
        ...(EdgeTTS.catalog[lang]||[])
      ].sort(
        (a,b)=>
          a.localeCompare(b)
      );

    voiceEl.innerHTML='';

    vs.forEach(
      v=>{

        const o=
          document.createElement(
            'option'
          );

        o.value=v;

        const parts=
          v.split('-');

        const locale=
          parts
            .slice(0,2)
            .join('-');

        const name=
          parts
            .slice(2)
            .join('-')
            .replace(
              /Neural$/,
              ''
            );

        o.textContent=
          `${name} — ${locale}`;

        voiceEl.appendChild(o);
      }
    );

    voiceEl.value=
      vs.includes(
        state.settings.voice
      )
      ?state.settings.voice
      :(vs[0]||'');

    state.settings.language=
      lang;

    state.settings.voice=
      voiceEl.value;
  }

  langEl.onchange=()=>{

    fillVoices();

    invalidateTTSDraft();

    saveState().catch(
      ()=>{}
    );
  };

  voiceEl.onchange=()=>{

    state.settings.voice=
      voiceEl.value;

    invalidateTTSDraft();

    saveState().catch(
      ()=>{}
    );
  };

  window.addEventListener(
    'audioverse:voices-updated',
    ()=>{

      populateLanguages();

      saveState().catch(
        ()=>{}
      );
    }
  );

  populateLanguages();

  EdgeTTS.loadVoices()
    .then(
      ()=>{
        populateLanguages();

        saveState().catch(
          ()=>{}
        );
      }
    )
    .catch(
      ()=>{}
    );
}


/* ============================================================
   TTS PROGRESS
   ============================================================ */

function setTTSProgress(
  p,
  label='Generating voice…'
){

  const wrap=
    $('ttsProgressWrap');

  if(!wrap)return;

  wrap.classList.remove(
    'hidden'
  );

  $('ttsProgress').style.width=
    p+'%';

  $('ttsProgressPct').textContent=
    Math.round(p)+'%';

  $('ttsProgressLabel').textContent=
    label;
}


/* ============================================================
   TTS DRAFT MANAGEMENT
   ============================================================ */

function getCurrentTTSParameters(){

  return{
    text:
      $('ttsText')?.value||'',

    voice:
      $('voice')?.value||'',

    rate:
      normalizeSpeedSetting(
        $('speed')?.value
      ),

    pitch:
      +(
        $('pitch')?.value||
        0
      )
  };
}

function invalidateTTSDraft(){

  ttsBlob=null;
  ttsDraft=null;

  const audio=
    $('ttsAudio');

  if(!audio)return;

  /*
    IMPORTANT:
    Do not destroy the active project audio
    merely because the TTS text/settings changed.
  */
  const active=
    currentAudioMedia();

  if(active){

    setAudioPreview(
      active
    );

    return;
  }

  if(audio._audioverseURL){

    try{
      URL.revokeObjectURL(
        audio._audioverseURL
      );
    }catch{}

    audio._audioverseURL=null;
  }

  try{

    audio.pause();

    audio.removeAttribute(
      'src'
    );

    audio.load();

  }catch{}
}

function isCurrentTTSDraft(){

  if(
    !ttsBlob||
    !ttsDraft
  ){
    return false;
  }

  const current=
    getCurrentTTSParameters();

  return(
    ttsDraft.text===
      current.text&&

    ttsDraft.voice===
      current.voice&&

    normalizeSpeedSetting(
      ttsDraft.rate
    )===
    normalizeSpeedSetting(
      current.rate
    )&&

    Number(
      ttsDraft.pitch
    )===
    Number(
      current.pitch
    )
  );
}


/* ============================================================
   TTS CREATION
   ============================================================ */

async function generateTTS(){

  const text=
    $('ttsText').value;

  if(!text.trim()){

    toast(
      'Enter narration text first.',
      true
    );

    return null;
  }

  const voice=
    $('voice').value;

  const rate=
    normalizeSpeedSetting(
      $('speed').value
    );

  const pitch=
    +$('pitch').value;

  setTTSProgress(
    3,
    'Connecting to voice…'
  );

  $('ttsStatus').textContent=
    'Generating voice…';

  try{

    const blob=
      await EdgeTTS.synthesize(
        text,
        voice,
        rate,
        pitch,
        p=>
          setTTSProgress(
            p,
            'Generating voice…'
          )
      );

    if(!blob){

      throw new Error(
        'Voice generation returned no audio.'
      );
    }

    if(!(blob instanceof Blob)){

      throw new Error(
        'Voice generation returned invalid audio data.'
      );
    }

    if(blob.size<=0){

      throw new Error(
        'Generated audio file is empty.'
      );
    }

    ttsBlob=blob;

    ttsDraft={
      text,
      voice,
      rate,
      pitch,
      duration:0
    };

    const dur=
      await loadBlobIntoHTML5Audio(
        blob
      );

    if(!dur){

      throw new Error(
        'Audio was created but HTML5 could not determine its duration.'
      );
    }

    ttsDraft.duration=
      dur;

    $('audioEnd').value='0';

    $('ttsStatus').textContent=
      `Voice ready — ${fmtPrecise(dur)}. Press Preview to hear it.`;

    setTTSProgress(
      100,
      'Complete'
    );

    return{
      blob,
      duration:dur
    };

  }catch(e){

    console.error(
      'TTS generation error:',
      e
    );

    $('ttsStatus').textContent=
      e.message||
      'Voice generation failed.';

    setTTSProgress(
      0,
      'Voice generation failed'
    );

    throw e;
  }
}

async function importCurrentTTSDraft(){

  if(!isCurrentTTSDraft()){

    await generateTTS();
  }

  if(
    !ttsBlob||
    !ttsDraft
  ){

    throw new Error(
      'No generated narration is available.'
    );
  }

  const blob=
    ttsBlob;

  const draft=
    ttsDraft;

  let duration=
    Number(
      draft.duration
    )||0;

  if(!duration){

    duration=
      await loadBlobIntoHTML5Audio(
        blob
      );

    if(!duration){

      throw new Error(
        'The narration duration could not be determined.'
      );
    }

    draft.duration=
      duration;
  }

  const id=
    crypto.randomUUID();

  const now=
    new Date();

  const name=
    'Narration • '+
    now.toLocaleTimeString();

  await AVDB.put(
    'media',
    {
      id,

      name,

      type:
        'audio/mpeg',

      size:
        blob.size,

      duration,

      blob,

      generated:true,

      narrationText:
        draft.text,

      voice:
        draft.voice,

      rate:
        normalizeSpeedSetting(
          draft.rate
        ),

      pitch:
        draft.pitch
    }
  );

  state.media=
    await AVDB.getAll(
      'media'
    );

  await attachMediaAsAudio(
    id,
    true
  );

  renderMedia();

  syncAudioPreview();

  toast(
    'Narration imported into the project successfully.'
  );

  return id;
}

async function doTTS(use=false){

  const text=
    $('ttsText').value;

  if(!text.trim()){

    toast(
      'Enter narration text first.',
      true
    );

    return;
  }

  const btn=
    use
    ?$('ttsUse')
    :$('ttsCreate');

  busy(
    btn,
    true
  );

  try{

    if(use){

      setTTSProgress(
        3,
        'Preparing narration…'
      );

      $('ttsStatus').textContent=
        'Preparing narration…';

      await importCurrentTTSDraft();

      /*
        Because this call originates from the user's
        Use button click, the browser can normally allow
        playback here.
      */
      timelinePlaybackActive=true;

      setTimelinePlayhead(
        audioStartMs(),
        {
          preview:false,
          scroll:false
        }
      );

      await waitForHTML5AudioMetadata(
        $('ttsAudio')
      ).catch(
        ()=>{}
      );

      playTimelineAudio();

      if($('ttsStatus')){
        $('ttsStatus').textContent=
          'Narration imported and playing…';
      }

    }else{

      setTTSProgress(
        3,
        'Connecting to voice…'
      );

      await generateTTS();

      toast(
        'Voice created successfully — press Preview to listen.'
      );
    }

  }catch(e){

    console.error(e);

    $('ttsStatus').textContent=
      e.message||
      'TTS operation failed.';

    setTTSProgress(
      0,
      'Voice operation failed'
    );

    toast(
      e.message||
      'TTS operation failed.',
      true
    );

  }finally{

    busy(
      btn,
      false
    );

    setTimeout(
      ()=>{
        $('ttsProgressWrap')
          ?.classList.add(
            'hidden'
          );
      },
      900
    );
  }
}


/* ============================================================
   AUDIO ATTACHMENT
   ============================================================ */

function currentAudioMedia(){

  return state.audio?.mediaId
    ?state.media.find(
      m=>
        m.id===
        state.audio.mediaId
    )
    :null;
}

function audioDurationMs(){

  return Number(
    currentAudioMedia()?.duration||
    state.audio?.duration||
    0
  );
}

function audioStartMs(){

  return Math.max(
    0,
    Math.round(
      (
        Number(
          $('audioStart')?.value
        )||0
      )*1000
    )
  );
}

function audioEndPaddingMs(){

  return Math.max(
    0,
    Math.round(
      (
        Number(
          $('audioEnd')?.value
        )||0
      )*1000
    )
  );
}

function requiredVideoDurationMs(){

  return(
    audioDurationMs()+
    audioStartMs()+
    audioEndPaddingMs()
  );
}

function updateAudioStateFromControls(){

  if(!state.audio)return;

  state.audio.start=
    audioStartMs();

  state.audio.duration=
    audioDurationMs();

  state.audio.endPadding=
    audioEndPaddingMs();

  state.audio.end=
    state.audio.duration;

  state.audio.volume=
    Number(
      $('addVol')?.value
    )||100;
}


/* ============================================================
   ATTACH MEDIA AS AUDIO
   ============================================================ */

async function attachMediaAsAudio(
  id,
  generated=false
){

  const m=
    state.media.find(
      x=>x.id===id
    );

  if(!m)return;

  let dur=
    Number(m.duration)||0;

  if(!dur){

    dur=
      await mediaDuration(
        m.blob
      );
  }

  if(!dur){

    throw new Error(
      'The selected audio duration could not be determined.'
    );
  }

  m.duration=dur;

  state.audio={
    mediaId:id,
    name:m.name,

    start:0,

    duration:dur,

    endPadding:0,

    end:dur,

    volume:
      Number(
        $('addVol')?.value
      )||100,

    generated:!!generated
  };

  $('audioStart').value='0';
  $('audioEnd').value='0';

  /*
    Stop anything currently playing.
  */
  pauseTimelineAudio();

  setAudioPreview(m);

  $('ttsStatus').textContent=
    generated
    ?'Voice created and imported into the project.'
    :'Audio imported and ready.';

  updateAudioStateFromControls();

  await saveState();

  renderTimeline();
  renderMedia();

  switchTab('audio');

  /*
    Make sure the browser has loaded the audio
    before the user presses Preview.
  */
  await waitForHTML5AudioMetadata(
    $('ttsAudio')
  ).catch(
    ()=>{}
  );
}


/* ============================================================
   DETACH AUDIO
   ============================================================ */

async function detachAudioFromProject(){

  timelinePlaybackActive=false;

  pauseTimelineAudio();

  state.audio=null;

  $('audioStart').value='0';
  $('audioEnd').value='0';

  const audio=
    $('ttsAudio');

  if(audio){

    if(audio._audioverseURL){

      try{
        URL.revokeObjectURL(
          audio._audioverseURL
        );
      }catch{}

      audio._audioverseURL=null;
    }

    try{

      audio.pause();

      audio.removeAttribute(
        'src'
      );

      audio.load();

    }catch{}
  }

  await saveState();

  renderTimeline();
  renderMedia();

  toast(
    'Active audio removed from the project.'
  );
}


/* ============================================================
   IMPORTED AUDIO
   ============================================================ */

async function useImportedAudio(id){

  const m=
    state.media.find(
      x=>x.id===id
    );

  if(!m)return;

  await attachMediaAsAudio(
    id,
    !!m.generated
  );

  toast(
    'Audio imported and ready — press Preview to hear it'
  );
}

function syncAudioPreview(){

  const m=
    currentAudioMedia();

  if(m){

    setAudioPreview(m);

  }else if(ttsBlob){

    loadBlobIntoHTML5Audio(
      ttsBlob
    ).catch(
      ()=>{}
    );
  }
}


/* ============================================================
   TTS PREVIEW
   ============================================================ */

async function previewTTS(){

  const audio=
    $('ttsAudio');

  if(!audio){

    toast(
      'TTS audio player was not found.',
      true
    );

    return;
  }

  try{

    /*
      If an active project audio exists,
      it is the primary preview source.
    */
    const active=
      currentAudioMedia();

    if(active){

      setAudioPreview(
        active
      );

      await waitForHTML5AudioMetadata(
        audio
      );

    }else if(ttsBlob){

      await loadBlobIntoHTML5Audio(
        ttsBlob
      );

    }else{

      await generateTTS();
    }

    audio.currentTime=0;

    audio.volume=
      Math.max(
        0,
        Math.min(
          1,
          (
            Number(
              $('addVol')?.value
            )||100
          )/100
        )
      );

    timelinePlaybackActive=false;

    await audio.play();

    $('ttsStatus').textContent=
      'Playing narration…';

  }catch(e){

    console.error(e);

    $('ttsStatus').textContent=
      'Could not play audio: '+
      e.message;

    toast(
      'Could not play narration: '+
      e.message,
      true
    );
  }
}


/* ============================================================
   TTS BUTTONS / IMPORT CONTROLS
   ============================================================ */

$('importBtn').onclick=()=>
  $('fileInput').click();

$('importNarrationBtn').onclick=()=>
  $('narrationInput').click();

$('narrationInput').onchange=
  async e=>{

    const f=
      e.target.files?.[0];

    if(!f)return;

    try{

      const id=
        crypto.randomUUID();

      const duration=
        await mediaDuration(
          f
        );

      if(!duration){

        throw new Error(
          'The audio duration could not be determined.'
        );
      }

      await AVDB.put(
        'media',
        {
          id,
          name:f.name,
          type:
            f.type||
            'audio/mpeg',
          size:f.size,
          duration,
          blob:f
        }
      );

      state.media=
        await AVDB.getAll(
          'media'
        );

      await useImportedAudio(
        id
      );

      renderMedia();

    }catch(err){

      toast(
        'Could not import audio: '+
        err.message,
        true
      );

    }

    e.target.value='';
  };

$('folderBtn').onclick=()=>
  $('folderInput').click();

$('fileInput').onchange=e=>{

  importFiles(
    e.target.files
  ).catch(
    err=>
      toast(
        'Import failed: '+
        err.message,
        true
      )
  );

  e.target.value='';
};

$('folderInput').onchange=e=>{

  importFiles(
    e.target.files
  ).catch(
    err=>
      toast(
        'Folder import failed: '+
        err.message,
        true
      )
  );

  e.target.value='';
};

$('musicImportBtn').onclick=()=>
  $('musicInput').click();

$('musicInput').onchange=e=>
  importMusic(
    e.target.files
  );

$('mediaSearch').oninput=
  renderMedia;

$('ttsCreate').onclick=
  async()=>{

    try{
      await doTTS(false);
    }catch(e){
      console.error(e);
    }
  };

$('ttsPreview').onclick=
  previewTTS;

$('ttsUse').onclick=
  async()=>{

    try{
      await doTTS(true);
    }catch(e){
      console.error(e);
    }
  };


/* ============================================================
   VIDEO CONTROLS
   ============================================================ */

$('exportBtn').onclick=
  exportProject;


/*
  Main synchronized Play/Pause button.
*/
$('playBtn').onclick=async()=>{

  const v=
    $('previewVideo');

  const audio=
    $('ttsAudio');

  if(!v)return;

  if(
    timelinePlaybackActive
  ){

    timelinePlaybackActive=false;

    try{
      v.pause();
    }catch{}

    pauseTimelineAudio();

    $('playBtn').textContent='▶';

    return;
  }

  /*
    Start synchronized timeline playback.
  */
  timelinePlaybackActive=true;

  syncTimelineAudio();

  if(state.audio){

    const target=
      timelineAudioTargetMs();

    if(target!==null){

      playTimelineAudio();
    }
  }

  if(v.src){

    /*
      Position video according to timeline playhead.
    */
    const hit=
      clipAtTimelineMs(
        timelinePlayheadMs
      );

    if(hit){

      try{

        v.currentTime=
          (
            hit.it.inMs+
            hit.offset
          )/1000;

      }catch{}
    }

    v.play().catch(
      ()=>{
        timelinePlaybackActive=false;
      }
    );

  }else if(audio&&state.audio){

    audio.play().catch(
      ()=>{
        timelinePlaybackActive=false;
      }
    );
  }

  $('playBtn').textContent='❚❚';
};

$('stopBtn').onclick=()=>{

  timelinePlaybackActive=false;

  const v=
    $('previewVideo');

  if(v){

    try{
      v.pause();
      v.currentTime=0;
    }catch{}
  }

  stopTimelineAudio();

  setTimelinePlayhead(
    0,
    {
      preview:false,
      scroll:false
    }
  );

  $('playBtn').textContent='▶';
};

$('prevBtn').onclick=()=>{

  const v=
    $('previewVideo');

  if(!v)return;

  v.currentTime=
    Math.max(
      0,
      v.currentTime-5
    );

  if(
    state.timeline.length
  ){

    setTimelinePlayhead(
      timelinePlayheadMs-5000,
      {
        preview:false,
        scroll:false
      }
    );

    seekTimelineAudio();
  }
};

$('nextBtn').onclick=()=>{

  const v=
    $('previewVideo');

  if(!v)return;

  v.currentTime=
    Math.min(
      v.duration||0,
      v.currentTime+5
    );

  if(
    state.timeline.length
  ){

    setTimelinePlayhead(
      timelinePlayheadMs+5000,
      {
        preview:false,
        scroll:false
      }
    );

    seekTimelineAudio();
  }
};


/* ============================================================
   VIDEO TIMELINE PLAYBACK
   ============================================================ */

$('previewVideo').ontimeupdate=()=>{

  const v=
    $('previewVideo');

  if(!v)return;

  $('timeLabel').textContent=
    fmtPrecise(
      v.currentTime*1000
    )+
    ' / '+
    fmtPrecise(
      (v.duration||0)*1000
    );

  $('seek').value=
    v.duration
    ?Math.round(
      v.currentTime/
      v.duration*
      1000
    )
    :0;

  const hit=
    clipAtTimelineMs(
      timelinePlayheadMs
    );

  if(
    hit&&
    state.selected===
      hit.it.id&&
    !playheadDragging
  ){

    const rel=
      Math.max(
        0,
        Math.min(
          hit.it.outMs-hit.it.inMs,
          (
            v.currentTime*1000-
            hit.it.inMs
          )
        )
      );

    let start=0;

    for(
      const x of state.timeline
    ){

      if(x.id===hit.it.id)break;

      start+=
        Math.max(
          0,
          x.outMs-x.inMs
        );
    }

    timelinePlayheadMs=
      Math.round(
        (start+rel)/100
      )*100;

    const ph=
      $('timelinePlayhead');

    if(ph){

      ph.style.left=
        (
          88+
          timelinePlayheadMs/1000*
          timelineZoom
        )+'px';
    }

    $('playheadTime').value=
      (
        timelinePlayheadMs/1000
      ).toFixed(1);
  }

  /*
    Always keep narration synchronized
    with the current timeline playhead.
  */
  if(
    timelinePlaybackActive
  ){

    syncTimelineAudio();

    if(
      state.audio &&
      timelineAudioTargetMs()!==null
    ){

      playTimelineAudio();
    }
  }
};

$('previewVideo').onended=()=>{

  if(
    timelinePlaybackActive
  ){

    timelinePlaybackActive=false;

    pauseTimelineAudio();

    $('playBtn').textContent='▶';
  }
};

$('seek').oninput=()=>{

  const v=
    $('previewVideo');

  if(
    v&&
    v.duration
  ){

    v.currentTime=
      v.duration*
      $('seek').value/
      1000;
  }
};

$('seek').onchange=()=>{

  const v=
    $('previewVideo');

  if(
    v&&
    v.duration
  ){

    /*
      The seek control is for the current preview clip.
      Also keep the timeline audio reasonably synchronized.
    */
    if(state.timeline.length){

      const hit=
        clipAtTimelineMs(
          timelinePlayheadMs
        );

      if(hit){

        let start=0;

        for(
          const x of state.timeline
        ){

          if(x.id===hit.it.id)break;

          start+=
            Math.max(
              0,
              x.outMs-x.inMs
            );
        }

        const rel=
          v.currentTime*1000-
          hit.it.inMs;

        setTimelinePlayhead(
          start+
          Math.max(
            0,
            rel
          ),
          {
            preview:false,
            scroll:false
          }
        );

        seekTimelineAudio();
      }
    }
  }
};

$('muteBtn').onclick=()=>{

  const v=
    $('previewVideo');

  if(!v)return;

  v.muted=
    !v.muted;

  $('muteBtn').textContent=
    v.muted
    ?'🔇'
    :'🔊';
};

$('fullscreenBtn').onclick=()=>
  $('previewVideo')
    .requestFullscreen?.();

$('timelineFullscreen').onclick=()=>
  document.documentElement
    .requestFullscreen?.();

$('timelineVolume').oninput=e=>
  $('previewVideo').volume=
    e.target.value/100;

$('timelineMute').onclick=()=>{
  $('previewVideo').muted=
    !$('previewVideo').muted;
};


/* ============================================================
   SETTINGS INPUTS
   ============================================================ */

[
  'speed',
  'pitch',
  'origVol',
  'addVol',
  'musicVol',
  'audioStart',
  'audioEnd'
].forEach(
  id=>{

    const el=$(id);

    if(!el)return;

    el.oninput=()=>{

      if(
        id==='speed'
      ){

        el.value=
          normalizeSpeedSetting(
            el.value
          );

        /*
          Changing TTS speed invalidates only
          the temporary TTS draft.
        */
        invalidateTTSDraft();
      }

      if(
        id==='pitch'
      ){

        invalidateTTSDraft();
      }

      if(
        id==='addVol'&&
        $('ttsAudio')
      ){

        $('ttsAudio').volume=
          (
            +$('addVol').value||
            100
          )/100;
      }

      updateAudioStateFromControls();

      updateLabels();

      saveState().catch(
        ()=>{}
      );

      renderTimeline();

      /*
        Changing audio timing immediately updates
        audio position to the new timeline location.
      */
      syncTimelineAudio();
    };
  }
);


/* ============================================================
   TEXT CHANGES INVALIDATE OLD TTS
   ============================================================ */

$('ttsText')?.addEventListener(
  'input',
  ()=>{
    invalidateTTSDraft();
  }
);


/* ============================================================
   DELETE SELECTED CLIP
   ============================================================ */

$('deleteBtn').onclick=
  async()=>{

    if(!state.selected)return;

    state.timeline=
      state.timeline.filter(
        x=>
          x.id!==state.selected
      );

    state.selected=null;

    await saveState();

    renderTimeline();
    renderMedia();

    toast(
      'Clip removed'
    );
  };


/* ============================================================
   SPLIT CLIP
   ============================================================ */

$('splitBtn').onclick=()=>{

  const it=
    state.timeline.find(
      x=>x.id===state.selected
    );

  if(!it){

    return toast(
      'Select a clip first',
      true
    );
  }

  const hit=
    clipAtTimelineMs(
      timelinePlayheadMs
    );

  if(
    !hit||
    hit.it.id!==it.id
  ){

    return toast(
      'Move the red playhead inside the selected clip',
      true
    );
  }

  const rel=
    Math.round(
      hit.offset/100
    )*100;

  if(
    rel<=0||
    rel>=
      it.outMs-it.inMs
  ){

    return toast(
      'Move the playhead inside the clip',
      true
    );
  }

  const p=
    it.inMs+rel;

  const a={
    ...it,
    id:crypto.randomUUID(),
    outMs:p,
    duration:p-it.inMs
  };

  const b={
    ...it,
    id:crypto.randomUUID(),
    inMs:p,
    duration:it.outMs-p
  };

  const i=
    state.timeline.indexOf(it);

  state.timeline.splice(
    i,
    1,
    a,
    b
  );

  state.selected=
    b.id;

  setTimelinePlayhead(
    timelinePlayheadMs,
    {
      preview:false,
      scroll:false
    }
  );

  saveState();

  renderTimeline();

  toast(
    `Clip split at ${fmtPrecise(timelinePlayheadMs)}`
  );
};


/* ============================================================
   NEW PROJECT
   ============================================================ */

$('newProject').onclick=
  async()=>{

    if(
      confirm(
        'Start a new project?'
      )
    ){

      timelinePlaybackActive=false;

      pauseTimelineAudio();

      state={
        ...state,

        name:
          'Untitled Project',

        timeline:[],

        selected:null,

        audio:null,

        music:[],

        settings:
          state.settings
      };

      invalidateTTSDraft();

      await saveState();

      renderTimeline();
      renderMusic();
      renderMedia();

      toast(
        'New project created'
      );
    }
  };


/* ============================================================
   SAVE PROJECT
   ============================================================ */

$('saveProject').onclick=
  async()=>{

    await saveState();

    toast(
      'Project saved locally'
    );
  };


/* ============================================================
   CLEAR LIBRARY
   ============================================================ */

$('clearLibrary').onclick=
  async()=>{

    if(
      confirm(
        'Remove all local media?'
      )
    ){

      timelinePlaybackActive=false;

      pauseTimelineAudio();

      for(
        const m of
        await AVDB.getAll('media')
      ){

        await AVDB.del(
          'media',
          m.id
        );
      }

      state.media=[];
      state.timeline=[];
      state.music=[];
      state.audio=null;

      invalidateTTSDraft();

      await saveState();

      await refresh();

      toast(
        'Local library cleared'
      );
    }
  };


/* ============================================================
   FOCUS TEXT
   ============================================================ */

$('focusText').onclick=()=>{

  switchTab('audio');

  $('ttsText').focus();
};


/* ============================================================
   TABS
   ============================================================ */

document.querySelectorAll(
  '.tab'
).forEach(
  b=>
    b.onclick=
      ()=>switchTab(
        b.dataset.tab
      )
);

function switchTab(name){

  document.querySelectorAll(
    '.tab'
  ).forEach(
    b=>
      b.classList.toggle(
        'active',
        b.dataset.tab===name
      )
  );

  $('audioTab').classList.toggle(
    'hidden',
    name!=='audio'
  );

  $('textTab').classList.toggle(
    'hidden',
    name!=='text'
  );

  $('musicTab').classList.toggle(
    'hidden',
    name!=='music'
  );
}


/* ============================================================
   STORAGE
   ============================================================ */

function updateStorage(){

  const bytes=
    state.media.reduce(
      (n,m)=>
        n+
        (m.size||0),
      0
    );

  $('storageInfo').textContent=
    `${state.media.length} item${state.media.length===1?'':'s'} • `+
    (
      bytes>1e9
      ?(bytes/1e9).toFixed(1)+' GB'
      :(bytes/1e6).toFixed(0)+' MB'
    );
}


/* ============================================================
   BUTTON RIPPLE
   ============================================================ */

document.querySelectorAll(
  'button'
).forEach(
  b=>{

    b.classList.add(
      'ripple'
    );

    b.addEventListener(
      'click',
      ripple
    );
  }
);


/* ============================================================
   TIMELINE ZOOM
   ============================================================ */

$('timelineZoom').oninput=e=>{

  timelineZoom=
    +e.target.value;

  renderTimeline();

  setTimelinePlayhead(
    timelinePlayheadMs,
    {
      preview:false,
      scroll:false
    }
  );
};


/* ============================================================
   PLAYHEAD TIME
   ============================================================ */

$('playheadTime').oninput=e=>{

  const sec=
    Math.max(
      0,
      +e.target.value||0
    );

  setTimelinePlayhead(
    sec*1000,
    {
      preview:true,
      scroll:true,
      save:false
    }
  );

  /*
    If currently playing, immediately
    move narration to the new position.
  */
  if(
    timelinePlaybackActive
  ){

    playTimelineAudio();
  }
};

$('playheadTime').onchange=()=>{

  saveState().catch(
    ()=>{}
  );
};


/* ============================================================
   TIMELINE POINTER
   ============================================================ */

function timelinePointToMs(e){

  const canvas=
    $('timelineCanvas');

  const r=
    canvas.getBoundingClientRect();

  const x=
    e.clientX-
    r.left-
    88;

  return Math.max(
    0,
    x/timelineZoom*
    1000
  );
}

$('timelineCanvas').addEventListener(
  'pointerdown',
  e=>{

    if(
      e.target.closest(
        '.clip-block'
      )
    ){
      return;
    }

    playheadDragging=true;

    const ms=
      timelinePointToMs(e);

    setTimelinePlayhead(
      ms,
      {
        preview:true,
        scroll:false
      }
    );

    $('timelinePlayhead')
      .setPointerCapture?.(
        e.pointerId
      );
  }
);

$('timelinePlayhead').addEventListener(
  'pointerdown',
  e=>{

    e.stopPropagation();

    playheadDragging=true;

    $('timelinePlayhead')
      .setPointerCapture?.(
        e.pointerId
      );
  }
);

$('timelineCanvas').addEventListener(
  'pointermove',
  e=>{

    if(!playheadDragging)return;

    setTimelinePlayhead(
      timelinePointToMs(e),
      {
        preview:true,
        scroll:false
      }
    );
  }
);

window.addEventListener(
  'pointerup',
  ()=>{

    if(playheadDragging){

      playheadDragging=false;

      saveState().catch(
        ()=>{}
      );

      if(
        timelinePlaybackActive
      ){
        playTimelineAudio();
      }
    }
  }
);

$('timelineScroll').addEventListener(
  'wheel',
  e=>{

    if(e.shiftKey){

      e.preventDefault();

      $('timelineScroll').scrollLeft+=
        e.deltaY||
        e.deltaX;
    }
  },
  {
    passive:false
  }
);

$('timelinePlayhead').addEventListener(
  'keydown',
  e=>{

    if(
      e.key==='ArrowLeft'
    ){

      e.preventDefault();

      setTimelinePlayhead(
        timelinePlayheadMs-
        (
          e.shiftKey
          ?1000
          :100
        ),
        {
          preview:true
        }
      );

      if(
        timelinePlaybackActive
      ){
        playTimelineAudio();
      }
    }

    if(
      e.key==='ArrowRight'
    ){

      e.preventDefault();

      setTimelinePlayhead(
        timelinePlayheadMs+
        (
          e.shiftKey
          ?1000
          :100
        ),
        {
          preview:true
        }
      );

      if(
        timelinePlaybackActive
      ){
        playTimelineAudio();
      }
    }
  }
);


/* ============================================================
   INITIALIZE
   ============================================================ */

initTheme();

(async()=>{

  try{

    await refresh();

  }catch(e){

    console.error(e);

    toast(
      'Local library could not be opened: '+
      e.message,
      true
    );
  }

  try{

    await setupTTS();

  }catch(e){

    console.error(e);

    toast(
      'Voice list fallback loaded',
      true
    );
  }

  try{

    if(
      await navigator.storage?.persist
    ){

      await navigator.storage.persist();
    }

  }catch{}

  if($('globalStatus')){

    $('globalStatus').textContent=
      'Local processing • media stored in IndexedDB';
  }

})();

if(
  'serviceWorker' in navigator
){

  navigator.serviceWorker
    .register('./sw.js')
    .catch(
      ()=>{}
    );
}


/* ============================================================
   AudioVerse V17 COMPATIBILITY / EXPORT LAYER
   ============================================================ */

let ffmpegInstance=null;
let ffmpegLoading=null;

async function getFFmpeg(){

  if(ffmpegInstance){
    return ffmpegInstance;
  }

  if(ffmpegLoading){
    return ffmpegLoading;
  }

  ffmpegLoading=
    (async()=>{

      const mod=
        await import(
          'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm'
        );

      const util=
        await import(
          'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm'
        );

      const {FFmpeg}=
        mod;

      const {toBlobURL}=
        util;

      const ff=
        new FFmpeg();

      const coreBase=
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

      const coreURL=
        await toBlobURL(
          `${coreBase}/ffmpeg-core.js`,
          'text/javascript'
        );

      const wasmURL=
        await toBlobURL(
          `${coreBase}/ffmpeg-core.wasm`,
          'application/wasm'
        );

      await ff.load({
        coreURL,
        wasmURL
      });

      ffmpegInstance=ff;

      return ff;
    })();

  try{

    return await ffmpegLoading;

  }finally{

    ffmpegLoading=null;
  }
}


/* ============================================================
   AUDIO STATE
   ============================================================ */

function timelineItemDuration(it){

  return Math.max(
    0,
    Number(it.outMs||0)-
    Number(it.inMs||0)
  );
}

function cloneTimelineItem(
  it,
  partialMs=null
){

  const d=
    partialMs==null
    ?timelineItemDuration(it)
    :Math.min(
      timelineItemDuration(it),
      Math.max(
        0,
        partialMs
      )
    );

  return{
    ...it,

    id:
      crypto.randomUUID(),

    outMs:
      it.inMs+d,

    duration:d
  };
}


/* ============================================================
   DUPLICATE CLIP
   ============================================================ */

async function duplicateSelectedClip(){

  const idx=
    state.timeline.findIndex(
      x=>
        x.id===state.selected
    );

  if(idx<0){

    toast(
      'Select a timeline clip first.',
      true
    );

    return;
  }

  const copy=
    cloneTimelineItem(
      state.timeline[idx]
    );

  state.timeline.splice(
    idx+1,
    0,
    copy
  );

  state.selected=
    copy.id;

  await saveState();

  renderTimeline();
  renderMedia();

  toast(
    'Clip duplicated'
  );
}


/* ============================================================
   FIT TIMELINE TO AUDIO
   ============================================================ */

async function fitTimelineToAudio(){

  if(!state.audio){

    toast(
      'Create or import an audio track first.',
      true
    );

    return;
  }

  const target=
    requiredVideoDurationMs();

  if(!target){

    toast(
      'The audio duration is not available yet.',
      true
    );

    return;
  }

  let current=
    timelineTotalMs();

  if(!state.timeline.length){

    toast(
      'Add at least one video clip first.',
      true
    );

    return;
  }

  if(current>target){

    let excess=
      current-target;

    for(
      let i=
        state.timeline.length-1;
      i>=0&&excess>0;
      i--
    ){

      const it=
        state.timeline[i];

      const d=
        timelineItemDuration(it);

      if(
        d<=excess+0.5
      ){

        excess-=d;

        state.timeline.splice(
          i,
          1
        );

      }else{

        it.outMs-=
          excess;

        it.duration=
          timelineItemDuration(it);

        excess=0;
      }
    }

    state.selected=
      state.timeline.at(-1)?.id||
      null;

  }else if(current<target){

    const originals=
      state.timeline.map(
        x=>({...x})
      );

    const selected=
      await askRepeatableClips(
        originals
      );

    if(!selected.length){

      toast(
        'Select at least one clip that may repeat.',
        true
      );

      return;
    }

    let i=0;

    while(
      current<target&&
      i<100000
    ){

      const src=
        selected[
          i%selected.length
        ];

      const need=
        target-current;

      const copy=
        cloneTimelineItem(
          src,
          Math.min(
            timelineItemDuration(src),
            need
          )
        );

      const insertAt=
        Math.max(
          0,
          state.timeline.length-1
        );

      state.timeline.splice(
        insertAt,
        0,
        copy
      );

      current+=
        timelineItemDuration(copy);

      i++;

      if(
        timelineItemDuration(copy)<=0
      ){
        break;
      }
    }

    state.selected=
      state.timeline.at(-1)?.id||
      null;
  }

  await saveState();

  renderTimeline();
  renderMedia();

  showQueuePopup();
}


/* ============================================================
   REPEAT SELECTION
   ============================================================ */

function askRepeatableClips(items){

  return new Promise(
    resolve=>{

      const overlay=
        document.createElement(
          'div'
        );

      overlay.style.cssText=
        `
        position:fixed;
        inset:0;
        z-index:99999;
        background:rgba(0,0,0,.72);
        display:grid;
        place-items:center;
        padding:24px
        `;

      const box=
        document.createElement(
          'div'
        );

      box.style.cssText=
        `
        max-width:620px;
        width:100%;
        max-height:80vh;
        overflow:auto;
        background:var(--panel,#fff);
        color:inherit;
        border-radius:14px;
        padding:22px;
        box-shadow:0 25px 80px rgba(0,0,0,.45)
        `;

      box.innerHTML=
        `
        <h2 style="margin-top:0">
          Fit to Audio — Repeat Selection
        </h2>

        <p>
          Select the clips AudioVerse is allowed to repeat.
          Every original clip stays in the queue once.
        </p>
        `;

      const list=
        document.createElement(
          'div'
        );

      list.style.display='grid';
      list.style.gap='8px';

      items.forEach(
        (it,i)=>{

          const row=
            document.createElement(
              'label'
            );

          row.style.cssText=
            `
            display:flex;
            gap:10px;
            align-items:center;
            padding:9px;
            border:1px solid rgba(127,127,127,.25);
            border-radius:9px
            `;

          row.innerHTML=
            `
            <input
              type="checkbox"
              ${it.repeat===false?'':'checked'}>

            <span>
              ${i+1}.
              ${escapeHTML(it.name)}
              <small>
                (${fmtPrecise(
                  timelineItemDuration(it)
                )})
              </small>
            </span>
            `;

          list.appendChild(row);

          row._item=it;
        }
      );

      const actions=
        document.createElement(
          'div'
        );

      actions.style.cssText=
        `
        display:flex;
        gap:8px;
        justify-content:flex-end;
        margin-top:16px
        `;

      actions.innerHTML=
        `
        <button data-act="all">
          Select All
        </button>

        <button data-act="none">
          Clear
        </button>

        <button data-act="cancel">
          Cancel
        </button>

        <button
          data-act="build"
          class="primary">
          Build Queue
        </button>
        `;

      box.append(
        list,
        actions
      );

      overlay.appendChild(box);

      document.body.appendChild(
        overlay
      );

      actions
        .querySelector(
          '[data-act="all"]'
        )
        .onclick=()=>
          list
            .querySelectorAll('input')
            .forEach(
              x=>x.checked=true
            );

      actions
        .querySelector(
          '[data-act="none"]'
        )
        .onclick=()=>
          list
            .querySelectorAll('input')
            .forEach(
              x=>x.checked=false
            );

      actions
        .querySelector(
          '[data-act="cancel"]'
        )
        .onclick=()=>{

          overlay.remove();

          resolve([]);
        };

      actions
        .querySelector(
          '[data-act="build"]'
        )
        .onclick=()=>{

          const out=
            [...list.children]
              .filter(
                r=>
                  r.querySelector(
                    'input'
                  ).checked
              )
              .map(
                r=>r._item
              );

          overlay.remove();

          resolve(out);
        };
    }
  );
}


/* ============================================================
   QUEUE POPUP
   ============================================================ */

function showQueuePopup(){

  const overlay=
    document.createElement(
      'div'
    );

  overlay.style.cssText=
    `
    position:fixed;
    inset:0;
    z-index:99998;
    background:rgba(0,0,0,.72);
    display:grid;
    place-items:center;
    padding:24px
    `;

  const box=
    document.createElement(
      'div'
    );

  box.style.cssText=
    `
    max-width:700px;
    width:100%;
    max-height:80vh;
    overflow:auto;
    background:var(--panel,#fff);
    color:inherit;
    border-radius:14px;
    padding:22px;
    box-shadow:0 25px 80px rgba(0,0,0,.45)
    `;

  box.innerHTML=
    `
    <h2 style="margin-top:0">
      New Playback Queue
    </h2>

    <p>
      Review the exact clip order before export.
    </p>
    `;

  const list=
    document.createElement(
      'ol'
    );

  list.style.lineHeight='1.8';

  state.timeline.forEach(
    it=>{

      const li=
        document.createElement(
          'li'
        );

      li.textContent=
        `${it.name} — ${fmtPrecise(
          timelineItemDuration(it)
        )}`;

      list.appendChild(li);
    }
  );

  const close=
    document.createElement(
      'button'
    );

  close.textContent='Close';

  close.style.marginTop='14px';

  close.onclick=
    ()=>overlay.remove();

  box.append(
    list,
    close
  );

  overlay.appendChild(box);

  document.body.appendChild(
    overlay
  );
}


/* ============================================================
   SRT
   ============================================================ */

function generateApproxSRT(){

  const m=
    currentAudioMedia();

  if(!m)return '';

  const text=
    m.narrationText||
    $('ttsText').value||
    '';

  if(!text.trim())return '';

  const words=
    text.trim().split(/\s+/);

  const duration=
    audioDurationMs();

  const chunk=
    Math.max(
      1200,
      duration/
      Math.max(
        1,
        Math.ceil(
          words.length/8
        )
      )
    );

  const lines=[];

  let t=0;
  let n=1;

  for(
    let i=0;
    i<words.length;
    i+=8
  ){

    const part=
      words
        .slice(i,i+8)
        .join(' ');

    const start=t;

    const end=
      Math.min(
        duration,
        t+chunk
      );

    lines.push(
      `${n++}\n`+
      `${srtTime(start)} --> ${srtTime(end)}\n`+
      `${part}\n`
    );

    t=end;
  }

  const shift=
    audioStartMs();

  return lines
    .map(
      block=>{

        const a=
          block.split('\n');

        if(a.length<3){
          return block;
        }

        const num=
          a[0];

        const times=
          a[1];

        const caption=
          a[2];

        const [s,e]=
          times.split(
            ' --> '
          );

        return(
          `${num}\n`+
          `${srtTime(
            parseSrtTime(s)+shift
          )} --> ${srtTime(
            parseSrtTime(e)+shift
          )}\n`+
          `${caption}\n`
        );
      }
    )
    .join('\n');
}

function srtTime(ms){

  ms=
    Math.max(
      0,
      Math.round(ms)
    );

  const h=
    Math.floor(
      ms/3600000
    );

  const m=
    Math.floor(
      ms%3600000/60000
    );

  const s=
    Math.floor(
      ms%60000/1000
    );

  const x=
    ms%1000;

  return(
    `${String(h).padStart(2,'0')}:`+
    `${String(m).padStart(2,'0')}:`+
    `${String(s).padStart(2,'0')},`+
    `${String(x).padStart(3,'0')}`
  );
}

function parseSrtTime(s){

  const m=
    /(\d+):(\d+):(\d+),(\d+)/
      .exec(s)||[];

  return(
    (+m[1]||0)*3600000+
    (+m[2]||0)*60000+
    (+m[3]||0)*1000+
    (+m[4]||0)
  );
}


/* ============================================================
   CREATE SRT
   ============================================================ */

async function createSRT(){

  const m=
    currentAudioMedia();

  const text=
    m?.narrationText||
    $('ttsText').value||
    '';

  if(!m){

    toast(
      'Create or import audio first.',
      true
    );

    return '';
  }

  if(!text.trim()){

    toast(
      'SRT timing requires narration text.',
      true
    );

    return '';
  }

  try{

    const r=
      await fetch(
        (
          window.AUDIOVERSE_API_BASE||
          '/api'
        ).replace(/\/$/,'')+
        '/srt',
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/json'
          },

          body:JSON.stringify({

            text,

            voice:
              m.voice||
              $('voice').value,

            rate:
              m.rate??
              normalizeSpeedSetting(
                $('speed').value
              ),

            pitch:
              m.pitch??
              +$('pitch').value,

            startMs:
              audioStartMs()
          })
        }
      );

    const data=
      await r.json();

    if(
      !r.ok||
      !data.srt
    ){

      throw new Error(
        data.error||
        'Subtitle timing generation failed.'
      );
    }

    state.srt={
      text:data.srt,

      name:
        (
          m.name||
          'narration'
        ).replace(
          /\.[^.]+$/,
          ''
        )+
        '.srt'
    };

    await saveState();

    toast(
      'SRT created from Edge TTS word timings.'
    );

    return data.srt;

  }catch(e){

    toast(
      e.message,
      true
    );

    return '';
  }
}


/* ============================================================
   DOWNLOAD SRT
   ============================================================ */

async function downloadSRT(){

  const srt=
    state.srt?.text||
    await createSRT();

  if(!srt)return;

  const name=
    state.srt?.name||
    'AudioVerse_narration.srt';

  const blob=
    new Blob(
      [srt],
      {
        type:
          'application/x-subrip;charset=utf-8'
      }
    );

  const a=
    document.createElement(
      'a'
    );

  const url=
    URL.createObjectURL(
      blob
    );

  a.href=url;

  a.download=name;

  a.click();

  setTimeout(
    ()=>{
      URL.revokeObjectURL(url);
    },
    1000
  );
}


/* ============================================================
   EXPORT SAVE PATH
   ============================================================ */

async function chooseExportPath(
  defaultName
){

  if(window.showSaveFilePicker){

    try{

      return await window.showSaveFilePicker(
        {
          suggestedName:
            defaultName,

          types:[
            {
              description:
                'MP4 video',

              accept:{
                'video/mp4':[
                  '.mp4'
                ]
              }
            }
          ]
        }
      );

    }catch(e){

      if(
        e?.name==='AbortError'
      ){

        return null;
      }
    }
  }

  return null;
}

async function writeExportHandle(
  handle,
  blob,
  name
){

  if(handle){

    const w=
      await handle.createWritable();

    await w.write(blob);

    await w.close();

    return;
  }

  const a=
    document.createElement(
      'a'
    );

  const url=
    URL.createObjectURL(
      blob
    );

  a.href=url;

  a.download=name;

  a.click();

  setTimeout(
    ()=>{
      URL.revokeObjectURL(url);
    },
    1500
  );
}


/* ============================================================
   EXPORT PROJECT
   ============================================================ */

async function exportProject(){

  if(!state.timeline.length){

    toast(
      'Add video clips to the timeline first.',
      true
    );

    return;
  }

  if(!state.audio){

    toast(
      'Attach or create an audio track first.',
      true
    );

    return;
  }

  const target=
    requiredVideoDurationMs();

  const current=
    timelineTotalMs();

  if(current!==target){

    const ok=
      confirm(
        `Timeline duration is ${fmtPrecise(current)} but audio requires ${fmtPrecise(target)}. Fit the timeline to audio now?`
      );

    if(!ok)return;

    await fitTimelineToAudio();

    if(
      timelineTotalMs()!==target
    ){

      toast(
        'Timeline could not be matched to audio duration.',
        true
      );

      return;
    }
  }

  const enteredName=
    prompt(
      'Project / export name:',
      state.name||
      'AudioVerse Project'
    );

  if(enteredName===null){
    return;
  }

  state.name=
    enteredName.trim()||
    'AudioVerse Project';

  await saveState();

  const defaultName=
    (
      state.name||
      'AudioVerse Project'
    )
      .replace(
        /[\\/:*?"<>|]/g,
        '_'
      )||
    'AudioVerse Project';

  const finalName=
    defaultName+'.mp4';

  const handle=
    await chooseExportPath(
      finalName
    );

  if(
    !handle&&
    !window.showSaveFilePicker&&
    !confirm(
      'This browser cannot show a native Save As dialog. Export will download the MP4 to your Downloads folder. Continue?'
    )
  ){

    return;
  }

  const btn=
    $('exportBtn');

  busy(
    btn,
    true
  );

  $('workerStatus').innerHTML=
    '<i></i> Processing';

  $('globalStatus').textContent=
    'Loading local FFmpeg…';

  try{

    const ff=
      await getFFmpeg();

    const clips=[];

    for(
      let i=0;
      i<state.timeline.length;
      i++
    ){

      const it=
        state.timeline[i];

      const m=
        state.media.find(
          x=>
            x.id===
            it.mediaId
        );

      if(!m){

        throw new Error(
          `Missing media for timeline clip ${it.name}`
        );
      }

      const ext=
        (
          m.name.match(
            /\.([a-z0-9]+)$/i
          )?.[1]||
          'mp4'
        ).toLowerCase();

      const input=
        `in_${i}.${ext}`;

      const output=
        `seg_${i}.mp4`;

      await ff.writeFile(
        input,
        new Uint8Array(
          await m.blob.arrayBuffer()
        )
      );

      const segArgs=[
        '-ss',

        (
          it.inMs/1000
        ).toFixed(3),

        '-i',

        input,

        '-t',

        (
          timelineItemDuration(it)/1000
        ).toFixed(3),

        '-vf',

        'scale=trunc(iw/2)*2:trunc(ih/2)*2',

        '-c:v',
        'libx264',

        '-preset',
        'ultrafast',

        '-crf',
        '20',

        '-pix_fmt',
        'yuv420p',

        '-c:a',
        'aac',

        '-ar',
        '48000',

        '-ac',
        '2',

        output
      ];

      try{

        await ff.exec(
          segArgs
        );

      }catch{

        await ff.exec(
          [
            '-ss',

            (
              it.inMs/1000
            ).toFixed(3),

            '-i',

            input,

            '-f',
            'lavfi',

            '-i',
            'anullsrc=r=48000:cl=stereo',

            '-t',

            (
              timelineItemDuration(it)/1000
            ).toFixed(3),

            '-vf',

            'scale=trunc(iw/2)*2:trunc(ih/2)*2',

            '-map',
            '0:v:0',

            '-map',
            '1:a:0',

            '-c:v',
            'libx264',

            '-preset',
            'ultrafast',

            '-crf',
            '20',

            '-pix_fmt',
            'yuv420p',

            '-c:a',
            'aac',

            '-ar',
            '48000',

            '-ac',
            '2',

            '-shortest',

            output
          ]
        );
      }

      clips.push(output);

      $('globalStatus').textContent=
        `Rendering video ${i+1}/${state.timeline.length}`;
    }

    const concat=
      clips
        .map(
          f=>`file '${f}'`
        )
        .join('\n')+
      '\n';

    await ff.writeFile(
      'concat.txt',
      new TextEncoder().encode(
        concat
      )
    );

    await ff.exec(
      [
        '-f',
        'concat',

        '-safe',
        '0',

        '-i',
        'concat.txt',

        '-c',
        'copy',

        'video_only.mp4'
      ]
    );

    const am=
      currentAudioMedia();

    if(!am){

      throw new Error(
        'Active narration audio is missing.'
      );
    }

    const aext=
      (
        am.name.match(
          /\.([a-z0-9]+)$/i
        )?.[1]||
        'mp3'
      ).toLowerCase();

    await ff.writeFile(
      `audio.${aext}`,
      new Uint8Array(
        await am.blob.arrayBuffer()
      )
    );

    const inputArgs=[
      '-i',
      'video_only.mp4',

      '-i',
      `audio.${aext}`
    ];

    const filters=[
      `[0:a]volume=${(Number($('origVol').value)||100)/100}[orig]`,

      `[1:a]adelay=${audioStartMs()}:all=1,volume=${(Number($('addVol').value)||100)/100}[nar]`
    ];

    const mixInputs=[
      '[orig]',
      '[nar]'
    ];

    let musicInputIndex=2;

    for(
      let mi=0;
      mi<(state.music||[]).length;
      mi++
    ){

      const music=
        state.music[mi];

      const mm=
        state.media.find(
          x=>
            x.id===
            music.mediaId
        );

      if(!mm)continue;

      const ext=
        (
          mm.name.match(
            /\.([a-z0-9]+)$/i
          )?.[1]||
          'mp3'
        ).toLowerCase();

      const fn=
        `music_${mi}.${ext}`;

      await ff.writeFile(
        fn,
        new Uint8Array(
          await mm.blob.arrayBuffer()
        )
      );

      inputArgs.push(
        '-stream_loop',
        '-1',
        '-i',
        fn
      );

      const vol=
        (
          Number(music.volume)||
          Number($('musicVol').value)||
          35
        )/100;

      filters.push(
        `[${musicInputIndex}:a]`+
        `atrim=0:${(target/1000).toFixed(3)},`+
        `volume=${vol}`+
        `[m${mi}]`
      );

      mixInputs.push(
        `[m${mi}]`
      );

      musicInputIndex++;
    }

    filters.push(
      `${mixInputs.join('')}`+
      `amix=inputs=${mixInputs.length}:`+
      `duration=longest:`+
      `dropout_transition=0[a]`
    );

    await ff.exec(
      [
        ...inputArgs,

        '-filter_complex',
        filters.join(';'),

        '-map',
        '0:v:0',

        '-map',
        '[a]',

        '-t',
        (target/1000).toFixed(3),

        '-c:v',
        'copy',

        '-c:a',
        'aac',

        '-b:a',
        '192k',

        '-movflags',
        '+faststart',

        'final.mp4'
      ]
    );

    const data=
      await ff.readFile(
        'final.mp4'
      );

    /*
      IMPORTANT FIX:
      FFmpeg returns a Uint8Array.
      Using data.buffer can include bytes outside
      the actual Uint8Array view.

      Use the Uint8Array itself.
    */
    const blob=
      new Blob(
        [data],
        {
          type:'video/mp4'
        }
      );

    if(!blob.size){

      throw new Error(
        'FFmpeg produced an empty MP4.'
      );
    }

    await writeExportHandle(
      handle,
      blob,
      finalName
    );

    $('globalStatus').textContent=
      'Export complete';

    $('workerStatus').innerHTML=
      '<i></i> Ready';

    toast(
      'MP4 exported successfully.'
    );

  }catch(e){

    console.error(e);

    $('globalStatus').textContent=
      'Export failed';

    $('workerStatus').innerHTML=
      '<i></i> Error';

    toast(
      `Export failed: ${e.message||e}`,
      true
    );

  }finally{

    busy(
      btn,
      false
    );
  }
}


/* ============================================================
   EXTRA BUTTONS
   ============================================================ */

$('duplicateBtn')?.addEventListener(
  'click',
  duplicateSelectedClip
);

$('fitBtn')?.addEventListener(
  'click',
  fitTimelineToAudio
);

$('queueBtn')?.addEventListener(
  'click',
  showQueuePopup
);

$('srtBtn')?.addEventListener(
  'click',
  createSRT
);

$('downloadSrtBtn')?.addEventListener(
  'click',
  downloadSRT
);


/* ============================================================
   TTS AUDIO EVENTS
   ============================================================ */

$('ttsAudio')?.addEventListener(
  'loadedmetadata',
  ()=>{

    const audio=
      $('ttsAudio');

    if(!audio)return;

    const d=
      Number(
        audio.duration
      );

    if(
      Number.isFinite(d)&&
      d>0&&
      ttsDraft
    ){

      ttsDraft.duration=
        Math.round(
          d*1000
        );
    }
  }
);

$('ttsAudio')?.addEventListener(
  'timeupdate',
  ()=>{

    if(
      !timelinePlaybackActive||
      !state.audio
    ){
      return;
    }

    /*
      Audio can continue slightly ahead/behind
      the video. Keep the timeline playhead aligned
      to the actual narration position.
    */
    const target=
      timelineAudioTargetMs();

    if(target===null){
      return;
    }

    const timelinePosition=
      audioStartMs()+
      (
        $('ttsAudio').currentTime*
        1000
      );

    const total=
      timelineTotalMs();

    if(total>0){

      timelinePlayheadMs=
        Math.max(
          0,
          Math.min(
            total,
            Math.round(
              timelinePosition/100
            )*100
          )
        );

      const ph=
        $('timelinePlayhead');

      if(ph){

        ph.style.left=
          (
            88+
            timelinePlayheadMs/1000*
            timelineZoom
          )+'px';
      }

      if($('playheadTime')){

        $('playheadTime').value=
          (
            timelinePlayheadMs/1000
          ).toFixed(1);
      }
    }
  }
);

$('ttsAudio')?.addEventListener(
  'ended',
  ()=>{

    if(
      $('ttsStatus')
    ){

      $('ttsStatus').textContent=
        'Audio preview finished.';
    }

    /*
      If this was synchronized playback,
      stop the main playback state.
    */
    if(
      timelinePlaybackActive
    ){

      timelinePlaybackActive=false;

      const v=
        $('previewVideo');

      try{
        v?.pause();
      }catch{}

      if($('playBtn')){
        $('playBtn').textContent='▶';
      }
    }
  }
);

$('ttsAudio')?.addEventListener(
  'error',
  ()=>{
    /*
      Do not automatically overwrite the useful
      status unless the user is actually trying
      to play generated audio.
    */
  }
);
