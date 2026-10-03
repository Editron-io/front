const $=id=>document.getElementById(id);


/* ============================================================
   AUDIOVERSE STATE
   ============================================================ */

let state={
  name:'Horror Story 01',

  media:[],

  timeline:[],

  selected:null,

  audioTracks:[],

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

let timelinePlaybackActive=false;

let ffmpegInstance=null;
let ffmpegLoading=null;

/*
  Cached same-origin blob URL for the FFmpeg worker.
*/
let ffmpegWorkerBlobURL=null;


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
    ?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    :`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};


function fmtPrecise(ms){

  ms=Math.max(0,Number(ms)||0);

  const totalTenths=Math.round(ms/100);

  const tenths=totalTenths%10;

  const totalSeconds=Math.floor(totalTenths/10);

  const h=Math.floor(totalSeconds/3600);

  const m=Math.floor((totalSeconds%3600)/60);

  const sec=totalSeconds%60;

  const base=h
    ?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    :`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;

  return `${base}.${tenths}`;
}


function escapeHTML(s){

  return String(s).replace(
    /[&<>"']/g,
    c=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c])
  );
}


function toast(msg,error=false){

  const stack=$('toastStack');

  if(!stack)return;

  const t=document.createElement('div');

  t.className='toast'+(error?' error':'');
  t.textContent=msg;

  stack.appendChild(t);

  setTimeout(
    ()=>t.remove(),
    2600
  );
}


function ripple(e){

  const b=e.currentTarget;

  if(!b)return;

  const d=document.createElement('span');

  d.className='ripple-dot';

  const r=b.getBoundingClientRect();

  const s=Math.max(r.width,r.height)*.55;

  d.style.width=d.style.height=s+'px';

  d.style.left=
    (e.clientX-r.left-s/2)+'px';

  d.style.top=
    (e.clientY-r.top-s/2)+'px';

  b.appendChild(d);

  setTimeout(
    ()=>d.remove(),
    550
  );
}


function busy(btn,on=true){

  if(!btn)return;

  btn.classList.toggle(
    'loading',
    on
  );

  btn.disabled=on;
}


function normalizeSpeedSetting(value){

  const n=Number(value);

  if(!Number.isFinite(n))return 100;

  if(n===0)return 100;

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
   AUDIO QUEUE NORMALIZATION
   ============================================================ */

function normalizeAudioTracks(){

  if(!Array.isArray(state.audioTracks)){
    state.audioTracks=[];
  }

  if(
    !state.audioTracks.length &&
    state.audio
  ){
    state.audioTracks=[
      {
        ...state.audio
      }
    ];
  }

  state.audioTracks=
    state.audioTracks
      .filter(x=>x&&x.mediaId);

  state.audio=
    state.audioTracks[0]||
    null;
}


function syncPrimaryAudio(){

  normalizeAudioTracks();

  state.audio=
    state.audioTracks[0]||
    null;
}


function audioTrackMedia(track){

  if(!track?.mediaId)return null;

  return state.media.find(
    m=>m.id===track.mediaId
  )||null;
}


function activeAudioTracks(){

  normalizeAudioTracks();

  return state.audioTracks
    .map(track=>({
      track,
      media:audioTrackMedia(track)
    }))
    .filter(x=>x.media);
}


function totalNarrationDurationMs(){

  return activeAudioTracks().reduce(
    (total,x)=>{

      const d=
        Number(
          x.media.duration||
          x.track.duration||
          0
        )||0;

      return total+d;

    },
    0
  );
}


function audioStartMs(){

  return Math.max(
    0,
    Math.round(
      (Number($('audioStart')?.value)||0)*1000
    )
  );
}


function audioEndPaddingMs(){

  return Math.max(
    0,
    Math.round(
      (Number($('audioEnd')?.value)||0)*1000
    )
  );
}


function audioDurationMs(){

  return totalNarrationDurationMs();
}


function requiredVideoDurationMs(){

  return(
    audioStartMs()+
    audioDurationMs()+
    audioEndPaddingMs()
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

  normalizeAudioTracks();

  timelineZoom=
    Number(
      state.settings.timelineZoom
    )||70;

  const z=$('timelineZoom');

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

    return`
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

  return`
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

function mediaIsActive(m){

  if(!m)return false;

  return(
    state.timeline.some(
      x=>x.mediaId===m.id
    )||
    state.audioTracks.some(
      x=>x.mediaId===m.id
    )
  );
}


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
    .forEach(m=>{

      const active=
        mediaIsActive(m);

      const d=
        document.createElement('div');

      d.className=
        'media-item '+
        (active?'selected':'');

      d.title=m.name;

      const isAudio=
        m.type?.startsWith('audio');

      d.innerHTML=`
        <div class="thumb">
          ${thumbHTML(m)}
        </div>

        <div class="media-copy">
          <b>${escapeHTML(m.name)}</b>

          <small>
            ${
              isAudio
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
            active
            ?'Remove from project'
            :'Add to project'
          }"
          title="${
            active
            ?'Remove from project'
            :'Add to project'
          }">
          ${active?'✓':'+'}
        </button>
      `;

      d.onclick=()=>{

        if(isAudio){

          useImportedAudio(
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

          if(isAudio){

            if(
              state.audioTracks.some(
                x=>x.mediaId===m.id
              )
            ){

              await removeAudioTrack(
                m.id
              );

            }else{

              await useImportedAudio(
                m.id
              );
            }

          }else{

            if(
              state.timeline.some(
                x=>x.mediaId===m.id
              )
            ){

              removeMediaFromTimeline(
                m.id
              );

            }else{

              await addToTimeline(
                m.id
              );
            }
          }
        };

      list.appendChild(d);

      hardenMediaVideo(
        d.querySelector('video')
      );
    });
}


/* ============================================================
   VIDEO PREVIEW
   ============================================================ */

function loadLibraryPreview(m){

  if(!m)return;

  if(
    m.type?.startsWith('audio')
  ){

    useImportedAudio(m.id);
    return;
  }

  loadPreview(m);
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

  const v=$('previewVideo');

  if(!v)return;

  v.src=currentURL;

  hardenMediaVideo(v);

  if($('emptyPreview')){
    $('emptyPreview').style.display='none';
  }

  if($('previewStatus')){
    $('previewStatus').textContent=
      m.name;
  }

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
        x.id===state.selected&&
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
   AUDIO QUEUE
   ============================================================ */

async function addAudioTrack(
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

  if(
    state.audioTracks.some(
      x=>x.mediaId===id
    )
  ){

    toast(
      'This audio is already in the narration queue.'
    );

    return;
  }

  state.audioTracks.push({
    mediaId:id,
    name:m.name,
    duration:dur,
    volume:
      Number(
        $('addVol')?.value
      )||100,
    generated:!!generated
  });

  syncPrimaryAudio();

  updateAudioStateFromControls();

  await saveState();

  setAudioPreview(
    currentAudioMedia()
  );

  renderTimeline();
  renderMedia();

  switchTab('audio');
}


async function removeAudioTrack(
  id
){

  const index=
    state.audioTracks.findIndex(
      x=>x.mediaId===id
    );

  if(index<0)return;

  state.audioTracks.splice(
    index,
    1
  );

  syncPrimaryAudio();

  await saveState();

  renderTimeline();
  renderMedia();

  syncAudioPreview();

  toast(
    'Audio removed from narration queue'
  );
}


function reorderAudioTracks(
  from,
  to
){

  if(
    from<0||
    to<0||
    from>=state.audioTracks.length||
    to>=state.audioTracks.length
  ){
    return;
  }

  const [item]=
    state.audioTracks.splice(
      from,
      1
    );

  state.audioTracks.splice(
    to,
    0,
    item
  );

  syncPrimaryAudio();

  saveState().catch(()=>{});

  renderTimeline();
  renderMedia();
}


/* ============================================================
   RENDER AUDIO QUEUE
   ============================================================ */

function renderAudioQueue(){

  const list=
    $('audioQueue')||
    $('narrationQueue')||
    $('ttsQueue');

  if(!list)return;

  list.innerHTML='';

  state.audioTracks.forEach(
    (track,index)=>{

      const m=
        audioTrackMedia(track);

      if(!m)return;

      const row=
        document.createElement('div');

      row.className=
        'audio-queue-row';

      row.innerHTML=`
        <span>
          <b>${index+1}.</b>
          ${escapeHTML(m.name)}
          <small>
            ${fmtPrecise(m.duration||0)}
          </small>
        </span>

        <div>
          <button
            type="button"
            data-up>
            ↑
          </button>

          <button
            type="button"
            data-down>
            ↓
          </button>

          <button
            type="button"
            data-remove>
            ×
          </button>
        </div>
      `;

      row.querySelector(
        '[data-up]'
      ).onclick=()=>{
        if(index>0){
          reorderAudioTracks(
            index,
            index-1
          );
        }
      };

      row.querySelector(
        '[data-down]'
      ).onclick=()=>{
        if(
          index<
          state.audioTracks.length-1
        ){
          reorderAudioTracks(
            index,
            index+1
          );
        }
      };

      row.querySelector(
        '[data-remove]'
      ).onclick=()=>{
        removeAudioTrack(
          m.id
        );
      };

      list.appendChild(row);
    }
  );
}


/* ============================================================
   AUDIO TIMING
   ============================================================ */

function normalizeAudioTiming(){

  normalizeAudioTracks();

  const s=
    state.settings||{};

  const start=
    Number(s.start)||0;

  const end=
    Number(s.end)||0;

  const total=
    totalNarrationDurationMs();

  if(
    total>0 &&
    start>3600
  ){
    s.start=
      start/1000;
  }

  if(
    total>0 &&
    end>3600
  ){
    s.end=
      end/1000;
  }

  state.settings=s;

  updateAudioStateFromControls();
}


function updateAudioStateFromControls(){

  normalizeAudioTracks();

  const start=
    audioStartMs();

  const endPadding=
    audioEndPaddingMs();

  state.audioTracks=
    state.audioTracks.map(
      track=>({
        ...track,
        start,
        endPadding,
        volume:
          Number(
            $('addVol')?.value
          )||100
      })
    );

  syncPrimaryAudio();
}


/* ============================================================
   HTML5 AUDIO PREVIEW
   ============================================================ */

function setAudioPreview(m){

  const a=$('ttsAudio');

  if(!a||!m?.blob)return;

  if(a._audioverseURL){

    try{
      URL.revokeObjectURL(
        a._audioverseURL
      );
    }catch{}

    a._audioverseURL=null;
  }

  try{
    a.pause();
  }catch{}

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

  a.load();
}


function clearAudioPreview(){

  const a=$('ttsAudio');

  if(!a)return;

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

  try{
    a.removeAttribute('src');
    a.load();
  }catch{}
}


function loadBlobIntoHTML5Audio(
  blob
){

  return new Promise(
    (resolve,reject)=>{

      const audio=$('ttsAudio');

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

      try{
        audio.pause();
      }catch{}

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
            Math.round(
              d*1000
            )
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


function waitForHTML5AudioMetadata(
  audio
){

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
            Math.round(
              d*1000
            )
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
                Math.round(
                  d*1000
                )
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

      check();
    }
  );
}


/* ============================================================
   SEQUENTIAL AUDIO PREVIEW
   ============================================================ */

function getSequentialAudioOffset(
  index
){

  let offset=0;

  for(
    let i=0;
    i<index;
    i++
  ){

    const track=
      state.audioTracks[i];

    const m=
      audioTrackMedia(track);

    offset+=
      Number(
        m?.duration||
        track?.duration||
        0
      )||0;
  }

  return offset;
}


function findAudioTrackAtMs(ms){

  const start=
    audioStartMs();

  const relative=
    Math.max(
      0,
      ms-start
    );

  let cursor=0;

  for(
    let i=0;
    i<state.audioTracks.length;
    i++
  ){

    const track=
      state.audioTracks[i];

    const m=
      audioTrackMedia(track);

    const d=
      Number(
        m?.duration||
        track?.duration||
        0
      )||0;

    if(
      relative<
      cursor+d||
      i===state.audioTracks.length-1
    ){

      return{
        index:i,
        track,
        media:m,
        offset:
          Math.max(
            0,
            Math.min(
              d,
              relative-cursor
            )
          )
      };
    }

    cursor+=d;
  }

  return null;
}


function timelineAudioTargetMs(){

  if(
    !state.audioTracks.length
  ){
    return null;
  }

  const start=
    audioStartMs();

  const duration=
    audioDurationMs();

  const end=
    start+
    duration+
    audioEndPaddingMs();

  const t=
    timelinePlayheadMs;

  if(
    t<start||
    t>end
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


async function ensureSequentialAudioLoaded(
  targetMs=0
){

  const audio=$('ttsAudio');

  if(!audio)return null;

  const hit=
    findAudioTrackAtMs(
      audioStartMs()+targetMs
    );

  if(!hit)return null;

  if(
    audio._audioverseMediaId===
    hit.media.id
  ){

    return hit;
  }

  try{
    audio.pause();
  }catch{}

  setAudioPreview(
    hit.media
  );

  audio._audioverseMediaId=
    hit.media.id;

  try{
    await waitForHTML5AudioMetadata(
      audio
    );
  }catch{}

  return hit;
}


function syncTimelineAudio(){

  const audio=$('ttsAudio');

  if(
    !audio||
    !state.audioTracks.length
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

  const hit=
    findAudioTrackAtMs(
      audioStartMs()+target
    );

  if(!hit)return;

  const targetSec=
    hit.offset/1000;

  if(
    audio._audioverseMediaId!==
    hit.media.id
  ){

    setAudioPreview(
      hit.media
    );

    audio._audioverseMediaId=
      hit.media.id;

    audio.addEventListener(
      'loadedmetadata',
      ()=>{
        if(
          timelinePlaybackActive
        ){
          try{
            audio.currentTime=
              targetSec;

            audio.play().catch(()=>{});
          }catch{}
        }
      },
      {once:true}
    );

    return;
  }

  if(
    !Number.isFinite(
      audio.currentTime
    )||
    Math.abs(
      audio.currentTime-targetSec
    )>0.12
  ){

    try{
      audio.currentTime=
        targetSec;
    }catch{}
  }
}


function playTimelineAudio(){

  const audio=$('ttsAudio');

  if(
    !audio||
    !state.audioTracks.length
  ){
    return;
  }

  const target=
    timelineAudioTargetMs();

  if(target===null)return;

  const hit=
    findAudioTrackAtMs(
      audioStartMs()+target
    );

  if(!hit)return;

  const targetSec=
    hit.offset/1000;

  const startPlayback=()=>{

    try{

      audio.currentTime=
        targetSec;

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

      audio.play().catch(()=>{});

    }catch{}
  };


  if(
    audio._audioverseMediaId===
    hit.media.id
  ){

    startPlayback();

    return;
  }


  setAudioPreview(
    hit.media
  );

  audio._audioverseMediaId=
    hit.media.id;

  audio.addEventListener(
    'loadedmetadata',
    startPlayback,
    {once:true}
  );

  try{
    audio.load();
  }catch{}
}


function pauseTimelineAudio(){

  const audio=$('ttsAudio');

  if(audio){

    try{
      audio.pause();
    }catch{}
  }
}


function stopTimelineAudio(){

  const audio=$('ttsAudio');

  if(audio){

    try{
      audio.pause();
      audio.currentTime=0;
    }catch{}
  }
}


/* ============================================================
   AUDIO ELEMENT EVENTS
   ============================================================ */

$('ttsAudio')?.addEventListener(
  'ended',
  ()=>{

    if(!timelinePlaybackActive){

      if($('ttsStatus')){
        $('ttsStatus').textContent=
          'Audio preview finished.';
      }

      return;
    }

    const currentId=
      $('ttsAudio')._audioverseMediaId;

    const index=
      state.audioTracks.findIndex(
        x=>x.mediaId===currentId
      );

    if(
      index>=0&&
      index<
      state.audioTracks.length-1
    ){

      const next=
        state.audioTracks[index+1];

      const nextMedia=
        audioTrackMedia(next);

      if(nextMedia){

        const nextTimeline=
          audioStartMs()+
          getSequentialAudioOffset(
            index+1
          );

        setTimelinePlayhead(
          nextTimeline,
          {
            preview:false,
            scroll:false
          }
        );

        setAudioPreview(
          nextMedia
        );

        $('ttsAudio')._audioverseMediaId=
          nextMedia.id;

        const playNext=()=>{

          if(
            !timelinePlaybackActive
          ){
            return;
          }

          try{
            $('ttsAudio').currentTime=0;
            $('ttsAudio').play().catch(()=>{});
          }catch{}
        };

        $('ttsAudio').addEventListener(
          'loadedmetadata',
          playNext,
          {once:true}
        );

        try{
          $('ttsAudio').load();
        }catch{}
      }

    }else{

      timelinePlaybackActive=false;

      if($('playBtn')){
        $('playBtn').textContent='▶';
      }

      if($('ttsStatus')){
        $('ttsStatus').textContent=
          'Narration playback finished.';
      }
    }
  }
);


/* ============================================================
   AUDIO SYNC
   ============================================================ */

function syncAudioPreview(){

  normalizeAudioTracks();

  const first=
    audioTrackMedia(
      state.audioTracks[0]
    );

  if(first){

    setAudioPreview(
      first
    );

    const audio=$('ttsAudio');

    if(audio){
      audio._audioverseMediaId=
        first.id;
    }

  }else if(ttsBlob){

    loadBlobIntoHTML5Audio(
      ttsBlob
    ).catch(()=>{});

  }else{

    clearAudioPreview();
  }

  renderAudioQueue();
}


/* ============================================================
   PRECISE TIME
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
      it===
      state.timeline[
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
        state.selected!==hit.it.id
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
          $('previewStatus')?.textContent!==m.name
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

    syncTimelineAudio();
  }

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


/* ============================================================
   TIMELINE RULER
   ============================================================ */

function buildRuler(totalMs){

  const ruler=$('ruler');

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
          Math.round(sec/majorStep)
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


/* ============================================================
   TIMELINE
   ============================================================ */

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
      total/1000*
      timelineZoom+
      120
    );

  canvas.style.width=
    minWidth+'px';

  canvas.style.minWidth=
    minWidth+'px';

  buildRuler(total);

  const t=$('timeline');

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

      d.dataset.id=it.id;

      d.innerHTML=`
        <b>${escapeHTML(it.name)}</b>

        <small>
          ${fmtPrecise(dur)}
        </small>

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

      tv?.appendChild(d);
    }
  );


  const a=
    $('track-audio');


  if(
    a&&
    state.audioTracks.length
  ){

    const d=
      document.createElement(
        'div'
      );

    d.className='audio-block';

    const dur=
      requiredVideoDurationMs();

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

    d.innerHTML=`
      <div class="wave"></div>
    `;

    d.title=
      state.audioTracks
        .map(
          (x,i)=>
            `${i+1}. ${x.name||'Audio'}`
        )
        .join('\n');

    d.onclick=()=>{

      timelinePlaybackActive=false;

      $('previewVideo')?.pause();

      setTimelinePlayhead(
        audioStartMs(),
        {
          preview:false,
          scroll:false
        }
      );

      playTimelineAudio();
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

  renderAudioQueue();
}


/* ============================================================
   INSPECTOR
   ============================================================ */

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
      +$('audioStart')?.value||0
    );

  const endSec=
    Math.max(
      0,
      +$('audioEnd')?.value||0
    );

  state.settings={
    ...state.settings,

    language:
      $('language')?.value||
      state.settings.language,

    voice:
      $('voice')?.value||
      state.settings.voice,

    rate:
      normalizeSpeedSetting(
        $('speed')?.value||
        state.settings.rate
      ),

    pitch:
      +$('pitch')?.value||0,

    origVol:
      +$('origVol')?.value||100,

    addVol:
      +$('addVol')?.value||100,

    start:startSec,

    end:endSec,

    musicVol:
      +$('musicVol')?.value||35,

    timelineZoom,

    playheadMs:
      timelinePlayheadMs
  };


  normalizeAudioTracks();

  state.audioTracks=
    state.audioTracks.map(
      track=>({

        ...track,

        start:
          Math.round(
            startSec*1000
          ),

        endPadding:
          Math.round(
            endSec*1000
          ),

        volume:
          +$('addVol')?.value||100
      })
    );


  syncPrimaryAudio();


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

      audioTracks:
        state.audioTracks,

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

function parseMp3DurationFromBuffer(
  buffer
){

  try{

    const bytes=
      new Uint8Array(buffer);

    if(bytes.length<4)return 0;

    let pos=0;

    if(
      bytes.length>=10&&
      bytes[0]===0x49&&
      bytes[1]===0x44&&
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
      i+4<bytes.length&&
      frames<200000;
    ){

      if(
        bytes[i]!==0xff||
        (bytes[i+1]&0xe0)!==0xe0
      ){

        i++;
        continue;
      }

      const b1=bytes[i+1];
      const b2=bytes[i+2];

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
        bitratesV1[version][
          bitrateIndex
        ];


      const sr=
        sampleRates[
          version===1
          ?0
          :(version===2?1:2)
        ][
          srIndex
        ];


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

      bytesTotal+=frameLen;

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
          (file.type||'').startsWith(
            'video/'
          )||
          /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(
            file.name||''
          );


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

          const n=Number(d);

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
    (file.name||'')
      .toLowerCase();


  if(
    t.startsWith('video/')||
    /\.(mp4|webm|mov|mkv|m4v|avi|mpeg|mpg)$/i.test(n)
  ){

    return 'video';
  }


  if(
    t.startsWith('audio/')||
    /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(n)
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
              kind+
              '/' +
              (
                kind==='video'
                ?'mp4'
                :'mpeg'
              )
            ),

          size:
            file.size,

          duration,

          blob:file
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
   IMPORT MULTIPLE NARRATION FILES
   ============================================================ */

async function importNarrationFiles(
  files
){

  const list=
    Array.from(files||[]);

  if(!list.length)return;

  let added=0;
  let skipped=0;


  for(
    const file of list
  ){

    if(
      !fileKind(file)||
      fileKind(file)!=='audio'
    ){

      skipped++;

      continue;
    }


    try{

      const duration=
        await mediaDuration(
          file
        );

      if(!duration){

        throw new Error(
          `Could not determine duration of ${file.name}`
        );
      }


      const id=
        crypto.randomUUID();


      await AVDB.put(
        'media',
        {
          id,

          name:
            file.name,

          type:
            file.type||
            'audio/mpeg',

          size:
            file.size,

          duration,

          blob:file
        }
      );


      state.media=
        await AVDB.getAll(
          'media'
        );


      await addAudioTrack(
        id,
        false
      );


      added++;

    }catch(err){

      console.error(
        err
      );

      skipped++;
    }
  }


  renderMedia();
  renderTimeline();
  renderAudioQueue();
  syncAudioPreview();


  if(added){

    toast(
      `${added} narration file${added===1?'':'s'} added in sequence`
    );
  }


  if(skipped){

    toast(
      `${skipped} narration file${skipped===1?' was':'s were'} skipped`,
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


  (state.music||[])
    .forEach(
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

        name:
          file.name,

        type:
          file.type,

        size:
          file.size,

        duration,

        blob:file
      }
    );


    state.music.push({
      mediaId:mid,
      name:file.name,
      duration,

      volume:
        +$('musicVol')?.value||
        35
    });
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


  if($('speed')){

    $('speed').value=
      normalizeSpeedSetting(
        s.rate
      );
  }


  if($('pitch')){
    $('pitch').value=
      s.pitch??0;
  }


  if($('origVol')){
    $('origVol').value=
      s.origVol??100;
  }


  if($('addVol')){
    $('addVol').value=
      s.addVol??100;
  }


  if($('audioStart')){
    $('audioStart').value=
      s.start??0;
  }


  if($('audioEnd')){
    $('audioEnd').value=
      s.end??0;
  }


  if($('musicVol')){
    $('musicVol').value=
      s.musicVol??35;
  }


  updateLabels();


  if($('projectName')){
    $('projectName').textContent=
      state.name||
      'Untitled Project';
  }
}


function updateLabels(){

  if($('speed')){

    $('speedValue').textContent=
      normalizeSpeedSetting(
        $('speed').value
      )+'%';
  }


  if($('pitch')){

    $('pitchValue').textContent=
      (
        +$('pitch').value>=0
        ?'+'
        :''
      )+
      $('pitch').value+
      ' Hz';
  }


  if($('origVol')){

    $('origVolValue').textContent=
      $('origVol').value+'%';
  }


  if($('addVol')){

    $('addVolValue').textContent=
      $('addVol').value+'%';
  }


  if($('musicVol')){

    $('musicVolValue').textContent=
      $('musicVol').value+'%';
  }
}


/* ============================================================
   TTS VOICES
   ============================================================ */

async function setupTTS(){

  const langEl=$('language');
  const voiceEl=$('voice');

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

    saveState().catch(()=>{});
  };


  voiceEl.onchange=()=>{

    state.settings.voice=
      voiceEl.value;

    invalidateTTSDraft();

    saveState().catch(()=>{});
  };


  window.addEventListener(
    'audioverse:voices-updated',
    ()=>{

      populateLanguages();

      saveState().catch(()=>{});
    }
  );


  populateLanguages();


  EdgeTTS.loadVoices()
    .then(
      ()=>{
        populateLanguages();

        saveState().catch(()=>{});
      }
    )
    .catch(()=>{});
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

  if($('ttsProgress')){
    $('ttsProgress').style.width=
      p+'%';
  }

  if($('ttsProgressPct')){
    $('ttsProgressPct').textContent=
      Math.round(p)+'%';
  }

  if($('ttsProgressLabel')){
    $('ttsProgressLabel').textContent=
      label;
  }
}


/* ============================================================
   TTS DRAFT
   ============================================================ */

function getCurrentTTSParameters(){

  return{

    text:
      $('ttsText')?.value||
      '',

    voice:
      $('voice')?.value||
      '',

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

  if(
    state.audioTracks?.length
  ){

    const first=
      audioTrackMedia(
        state.audioTracks[0]
      );

    if(first){

      setAudioPreview(
        first
      );

      return;
    }
  }

  clearAudioPreview();
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

    Number(ttsDraft.rate)===
      Number(current.rate)&&

    Number(ttsDraft.pitch)===
      Number(current.pitch)
  );
}


/* ============================================================
   TTS CREATION
   ============================================================ */

async function generateTTS(){

  const text=
    $('ttsText')?.value||'';

  if(!text.trim()){

    toast(
      'Enter narration text first.',
      true
    );

    return null;
  }


  const voice=
    $('voice')?.value||'';


  const rate=
    normalizeSpeedSetting(
      $('speed')?.value
    );


  const pitch=
    +$('pitch')?.value||0;


  setTTSProgress(
    3,
    'Connecting to voice…'
  );


  if($('ttsStatus')){
    $('ttsStatus').textContent=
      'Generating voice…';
  }


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


    if($('audioEnd')){
      $('audioEnd').value='0';
    }


    if($('ttsStatus')){

      $('ttsStatus').textContent=
        `Voice ready — ${fmtPrecise(dur)}. Press Preview to hear it.`;
    }


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


    if($('ttsStatus')){
      $('ttsStatus').textContent=
        e.message||
        'Voice generation failed.';
    }


    setTTSProgress(
      0,
      'Voice generation failed'
    );


    throw e;
  }
}


/* ============================================================
   IMPORT CURRENT TTS
   ============================================================ */

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

      type:'audio/mpeg',

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
        draft.rate,

      pitch:
        draft.pitch
    }
  );


  state.media=
    await AVDB.getAll(
      'media'
    );


  await addAudioTrack(
    id,
    true
  );


  renderMedia();

  renderTimeline();

  syncAudioPreview();


  toast(
    'Narration imported into the project successfully.'
  );


  return id;
}


/* ============================================================
   TTS OPERATION
   ============================================================ */

async function doTTS(
  use=false
){

  const text=
    $('ttsText')?.value||'';


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

      if($('ttsStatus')){
        $('ttsStatus').textContent=
          'Preparing narration…';
      }

      await importCurrentTTSDraft();

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

    if($('ttsStatus')){
      $('ttsStatus').textContent=
        e.message||
        'TTS operation failed.';
    }

    setTTSProgress(
      0,
      'Voice operation failed'
    );

    toast(
      e.message||
      'TTS operation failed',
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
          ?.classList
          .add('hidden');
      },
      900
    );
  }
}


/* ============================================================
   AUDIO ATTACHMENT
   ============================================================ */

async function attachMediaAsAudio(
  id,
  generated=false
){

  await addAudioTrack(
    id,
    generated
  );
}


/* ============================================================
   IMPORTED AUDIO
   ============================================================ */

async function useImportedAudio(
  id){

  const m=
    state.media.find(
      x=>x.id===id
    );

  if(!m)return;


  await addAudioTrack(
    id,
    !!m.generated
  );


  toast(
    'Audio added to narration queue — files play after each other.'
  );
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

    if(
      state.audioTracks.length
    ){

      setTimelinePlayhead(
        audioStartMs(),
        {
          preview:false,
          scroll:false
        }
      );

      timelinePlaybackActive=true;

      playTimelineAudio();

      if($('ttsStatus')){
        $('ttsStatus').textContent=
          'Playing narration queue…';
      }

      return;
    }


    if(ttsBlob){

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


    await audio.play();


    if($('ttsStatus')){
      $('ttsStatus').textContent=
        'Playing narration…';
    }

  }catch(e){

    console.error(e);

    if($('ttsStatus')){
      $('ttsStatus').textContent=
        'Could not play audio: '+
        e.message;
    }

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

$('importBtn').onclick=
  ()=>
    $('fileInput')?.click();


$('importNarrationBtn').onclick=
  ()=>
    $('narrationInput')?.click();


if($('narrationInput')){

  $('narrationInput').multiple=true;

  $('narrationInput').accept=
    'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus';
}


$('narrationInput').onchange=
  async e=>{

    const files=
      e.target.files;

    if(!files?.length)return;

    try{

      await importNarrationFiles(
        files
      );

    }catch(err){

      toast(
        'Could not import audio: '+
        err.message,
        true
      );

    }

    e.target.value='';
  };


$('folderBtn').onclick=
  ()=>
    $('folderInput')?.click();


$('fileInput').onchange=
  e=>{

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


$('folderInput').onchange=
  e=>{

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


$('musicImportBtn').onclick=
  ()=>
    $('musicInput')?.click();


$('musicInput').onchange=
  e=>
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


$('playBtn').onclick=()=>{

  const v=
    $('previewVideo');

  const audio=
    $('ttsAudio');


  if(!v)return;


  if(
    !v.paused||
    timelinePlaybackActive
  ){

    timelinePlaybackActive=false;

    v.pause();

    pauseTimelineAudio();

    if($('playBtn')){
      $('playBtn').textContent='▶';
    }

    return;
  }


  timelinePlaybackActive=true;


  if(state.timeline.length){

    const hit=
      clipAtTimelineMs(
        timelinePlayheadMs
      );


    if(hit){

      const m=
        state.media.find(
          x=>x.id===hit.it.mediaId
        );

      if(m){

        loadPreview(m);

        try{
          v.currentTime=
            (
              hit.it.inMs+
              hit.offset
            )/1000;
        }catch{}
      }

    }else{

      setTimelinePlayhead(
        0,
        {
          preview:true,
          scroll:false
        }
      );
    }
  }


  v.play().catch(()=>{});

  playTimelineAudio();


  if($('playBtn')){
    $('playBtn').textContent='❚❚';
  }
};


$('stopBtn').onclick=()=>{

  timelinePlaybackActive=false;

  const v=
    $('previewVideo');

  if(v){

    v.pause();

    try{
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


  if($('playBtn')){
    $('playBtn').textContent='▶';
  }
};


$('prevBtn').onclick=()=>{

  const v=
    $('previewVideo');

  if(!v)return;

  const next=
    Math.max(
      0,
      v.currentTime-5
    );

  v.currentTime=
    next;
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
    state.selected===hit.it.id&&
    !playheadDragging
  ){

    const rel=
      Math.max(
        0,
        Math.min(
          hit.it.outMs-
          hit.it.inMs,

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


    if($('playheadTime')){

      $('playheadTime').value=
        (
          timelinePlayheadMs/1000
        ).toFixed(1);
    }
  }


  if(
    timelinePlaybackActive
  ){

    syncTimelineAudio();
  }
};


$('previewVideo').onended=()=>{

  if(
    timelinePlaybackActive
  ){

    const total=
      timelineTotalMs();

    if(
      timelinePlayheadMs<
      total
    ){

      const next=
        Math.min(
          total,
          timelinePlayheadMs+100
        );

      setTimelinePlayhead(
        next,
        {
          preview:true,
          scroll:false
        }
      );

      const hit=
        clipAtTimelineMs(next);

      if(hit){

        const m=
          state.media.find(
            x=>x.id===hit.it.mediaId
          );

        if(m){

          loadPreview(m);

          const v=
            $('previewVideo');

          try{
            v.currentTime=
              (
                hit.it.inMs+
                hit.offset
              )/1000;
          }catch{}

          v.play().catch(()=>{});
        }
      }

    }else{

      timelinePlaybackActive=false;

      pauseTimelineAudio();

      if($('playBtn')){
        $('playBtn').textContent='▶';
      }
    }
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


$('fullscreenBtn').onclick=
  ()=>
    $('previewVideo')
      ?.requestFullscreen?.();


$('timelineFullscreen').onclick=
  ()=>
    document.documentElement
      .requestFullscreen?.();


$('timelineVolume').oninput=
  e=>
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
        id==='addVol'&&
        $('ttsAudio')
      ){

        $('ttsAudio').volume=
          (
            +$('addVol').value||
            100
          )/100;
      }


      if(
        id==='speed'||
        id==='pitch'
      ){

        invalidateTTSDraft();
      }


      updateLabels();

      saveState();

      renderTimeline();
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
        x=>x.id!==state.selected
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
    rel>=it.outMs-it.inMs
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
    state.timeline.indexOf(
      it
    );


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
    `Clip split at ${fmtPrecise(
      timelinePlayheadMs
    )}`
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

      state={
        ...state,

        name:
          'Untitled Project',

        timeline:[],

        selected:null,

        audioTracks:[],

        audio:null,

        music:[],

        settings:{
          ...state.settings,
          rate:100
        }
      };


      timelinePlayheadMs=0;

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

      for(
        const m of await AVDB.getAll('media')
      ){

        await AVDB.del(
          'media',
          m.id
        );
      }


      state.media=[];

      state.timeline=[];

      state.audioTracks=[];

      state.audio=null;

      state.music=[];

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

  switchTab(
    'audio'
  );

  $('ttsText')?.focus();
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


  $('audioTab')?.classList.toggle(
    'hidden',
    name!=='audio'
  );


  $('textTab')?.classList.toggle(
    'hidden',
    name!=='text'
  );


  $('musicTab')?.classList.toggle(
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
        n+(m.size||0),
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

$('timelineZoom').oninput=
  e=>{

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

$('playheadTime').oninput=
  e=>{

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
  };


$('playheadTime').onchange=
  ()=>{
    saveState().catch(()=>{});
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

      saveState().catch(()=>{});
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
    }
  }
);


/* ============================================================
   DUPLICATE CLIP
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

    duration:
      d
  };
}


async function duplicateSelectedClip(){

  const idx=
    state.timeline.findIndex(
      x=>x.id===state.selected
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

  if(!state.audioTracks.length){

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
      let i=state.timeline.length-1;
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

        it.outMs-=excess;

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
        timelineItemDuration(
          copy
        );


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

function askRepeatableClips(
  items
){

  return new Promise(
    resolve=>{

      const overlay=
        document.createElement(
          'div'
        );


      overlay.style.cssText=`
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


      box.style.cssText=`
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


      box.innerHTML=`
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


      list.style.display=
        'grid';

      list.style.gap=
        '8px';


      items.forEach(
        (it,i)=>{

          const row=
            document.createElement(
              'label'
            );


          row.style.cssText=`
            display:flex;
            gap:10px;
            align-items:center;
            padding:9px;
            border:1px solid rgba(127,127,127,.25);
            border-radius:9px
          `;


          row.innerHTML=`
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


      actions.style.cssText=`
        display:flex;
        gap:8px;
        justify-content:flex-end;
        margin-top:16px
      `;


      actions.innerHTML=`
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


      overlay.appendChild(
        box
      );


      document.body.appendChild(
        overlay
      );


      actions
        .querySelector(
          '[data-act="all"]'
        )
        .onclick=()=>
          list
            .querySelectorAll(
              'input'
            )
            .forEach(
              x=>
                x.checked=true
            );


      actions
        .querySelector(
          '[data-act="none"]'
        )
        .onclick=()=>
          list
            .querySelectorAll(
              'input'
            )
            .forEach(
              x=>
                x.checked=false
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


  overlay.style.cssText=`
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


  box.style.cssText=`
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


  box.innerHTML=`
    <h2 style="margin-top:0">
      New Playback Queue
    </h2>

    <p>
      Review the exact clip and narration order before export.
    </p>
  `;


  const list=
    document.createElement(
      'ol'
    );


  list.style.lineHeight=
    '1.8';


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


  if(
    state.audioTracks.length
  ){

    const title=
      document.createElement(
        'h3'
      );

    title.textContent=
      'Narration order';

    box.appendChild(
      title
    );


    const audioList=
      document.createElement(
        'ol'
      );


    state.audioTracks.forEach(
      (track,i)=>{

        const m=
          audioTrackMedia(track);

        if(!m)return;

        const li=
          document.createElement(
            'li'
          );

        li.textContent=
          `${m.name} — ${fmtPrecise(
            m.duration||0
          )}`;

        audioList.appendChild(li);
      }
    );


    box.appendChild(
      audioList
    );
  }


  const close=
    document.createElement(
      'button'
    );


  close.textContent=
    'Close';


  close.style.marginTop=
    '14px';


  close.onclick=
    ()=>overlay.remove();


  box.insertBefore(
    list,
    box.children[2]||
    null
  );


  box.append(
    close
  );


  overlay.appendChild(
    box
  );


  document.body.appendChild(
    overlay
  );
}


/* ============================================================
   SRT
   ============================================================ */

function generateApproxSRT(){

  const tracks=
    activeAudioTracks();

  if(!tracks.length)return '';


  const text=
    tracks
      .map(
        x=>
          x.media.narrationText||
          ''
      )
      .filter(Boolean)
      .join('\n');


  if(!text.trim())return '';


  const words=
    text
      .trim()
      .split(/\s+/);


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


        const num=a[0];

        const times=a[1];

        const caption=a[2];


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

  const tracks=
    activeAudioTracks();


  const text=
    tracks
      .map(
        x=>
          x.media.narrationText||
          ''
      )
      .filter(Boolean)
      .join('\n');


  if(!tracks.length){

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


  if(
    tracks.length===1&&
    tracks[0].media.generated
  ){

    const m=
      tracks[0].media;


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


  const srt=
    generateApproxSRT();


  if(!srt)return '';


  state.srt={
    text:srt,
    name:'AudioVerse_narration.srt'
  };


  await saveState();


  toast(
    'SRT created for the sequential narration queue.'
  );


  return srt;
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

  if(
    window.showSaveFilePicker
  ){

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
   FFmpeg (client-only, cross-origin-safe)
   ============================================================ */

/*
  Fetch a remote JS file and turn it into a same-origin Blob URL.
  This bypasses:
    "Failed to construct 'Worker': Script at '...' cannot be
     accessed from origin '...'"
*/
async function makeBlobURLFromRemoteScript(url){
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Could not fetch ${url} (HTTP ${res.status})`);
  }
  const code = await res.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}


async function getFFmpeg(){

  if(ffmpegInstance){
    return ffmpegInstance;
  }

  if(ffmpegLoading){
    return ffmpegLoading;
  }

  ffmpegLoading = (async () => {

    /*
      Load the FFmpeg wrapper + util from CDN.
    */
    const mod  = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm');
    const util = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm');

    const { FFmpeg } = mod;
    const { toBlobURL } = util;

    const ff = new FFmpeg();

    /*
      ------------------------------------------------------------
      IMPORTANT: use the ESM core, not UMD.
      ------------------------------------------------------------
      The FFmpeg worker does `import(coreURL)` internally, which
      requires an ES module. The UMD build does NOT export a
      default and causes "failed to import ffmpeg-core.js".
    */
    const coreBase =
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

    const coreURL = await toBlobURL(
      `${coreBase}/ffmpeg-core.js`,
      'text/javascript'
    );

    const wasmURL = await toBlobURL(
      `${coreBase}/ffmpeg-core.wasm`,
      'application/wasm'
    );

    /*
      ------------------------------------------------------------
      Same-origin worker (fixes cross-origin Worker block).
      ------------------------------------------------------------
      Try ESM worker first (matches the ESM core we just loaded),
      then fall back to UMD worker bundles if needed.
    */
    if (!ffmpegWorkerBlobURL) {

      const candidates = [
        // ESM worker (best match with ESM core):
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js',
        // UMD fallbacks:
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js'
      ];

      let lastErr = null;

      for (const url of candidates) {
        try {
          ffmpegWorkerBlobURL = await makeBlobURLFromRemoteScript(url);
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!ffmpegWorkerBlobURL) {
        throw lastErr || new Error('Could not load FFmpeg worker script.');
      }
    }

    await ff.load({
      coreURL,
      wasmURL,
      classWorkerURL: ffmpegWorkerBlobURL
    });

    ffmpegInstance = ff;

    return ff;

  })();

  try{
    return await ffmpegLoading;
  }finally{
    ffmpegLoading=null;
  }
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


  if(!state.audioTracks.length){

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


    /* ========================================================
       1. RENDER VIDEO CLIPS
       ======================================================== */

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
          x=>x.id===it.mediaId
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


    /* ========================================================
       2. CONCAT VIDEO
       ======================================================== */

    const concat=
      clips
        .map(
          f=>
            `file '${f}'`
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


    /* ========================================================
       3. WRITE NARRATION FILES
       ======================================================== */

    const tracks=
      activeAudioTracks();


    if(!tracks.length){

      throw new Error(
        'Active narration audio is missing.'
      );
    }


    const narrationFiles=[];


    for(
      let i=0;
      i<tracks.length;
      i++
    ){

      const {
        media
      }=
        tracks[i];


      const ext=
        (
          media.name.match(
            /\.([a-z0-9]+)$/i
          )?.[1]||
          'mp3'
        ).toLowerCase();


      const fn=
        `narration_${i}.${ext}`;


      await ff.writeFile(
        fn,
        new Uint8Array(
          await media.blob.arrayBuffer()
        )
      );


      narrationFiles.push(fn);


      $('globalStatus').textContent=
        `Preparing narration ${i+1}/${tracks.length}`;
    }


    /* ========================================================
       4. CONCAT NARRATION SEQUENTIALLY
       ======================================================== */

    const narrationConcat=
      narrationFiles
        .map(
          f=>
            `file '${f}'`
        )
        .join('\n')+
      '\n';


    await ff.writeFile(
      'narration_concat.txt',
      new TextEncoder().encode(
        narrationConcat
      )
    );


    await ff.exec(
      [

        '-f',

        'concat',

        '-safe',

        '0',

        '-i',

        'narration_concat.txt',

        '-vn',

        '-ar',

        '48000',

        '-ac',

        '2',

        '-c:a',

        'aac',

        '-b:a',

        '192k',

        'narration_queue.m4a'
      ]
    );


    /* ========================================================
       5. FINAL AUDIO MIX
       ======================================================== */

    const inputArgs=[

      '-i',

      'video_only.mp4',

      '-i',

      'narration_queue.m4a'
    ];


    const filters=[];


    filters.push(
      `[0:a]volume=${
        (
          Number(
            $('origVol')?.value
          )||100
        )/100
      }[orig]`
    );


    filters.push(
      `[1:a]adelay=${
        audioStartMs()
      }:all=1,volume=${
        (
          Number(
            $('addVol')?.value
          )||100
        )/100
      }[nar]`
    );


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
          x=>x.id===music.mediaId
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
          Number(
            $('musicVol')?.value
          )||
          35
        )/100;


      filters.push(
        `[${musicInputIndex}:a]`+
        `atrim=0:${(
          target/1000
        ).toFixed(3)},`+
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


    /* ========================================================
       6. FINAL MP4
       ======================================================== */

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

        (
          target/1000
        ).toFixed(3),

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


    /* ========================================================
       7. READ FINAL FILE SAFELY
       ======================================================== */

    const data=
      await ff.readFile(
        'final.mp4'
      );


    const blob=
      new Blob(
        [data],
        {
          type:'video/mp4'
        }
      );


    if(
      !blob.size
    ){

      throw new Error(
        'FFmpeg produced an empty MP4 file.'
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

    console.error(
      e
    );


    $('globalStatus').textContent=
      'Export failed';


    $('workerStatus').innerHTML=
      '<i></i> Error';


    toast(
      `Export failed: ${
        e.message||e
      }`,
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
      timelinePlaybackActive
    ){

      const audio=
        $('ttsAudio');

      const id=
        audio?._audioverseMediaId;

      const index=
        state.audioTracks.findIndex(
          x=>x.mediaId===id
        );


      if(index>=0){

        const globalMs=
          audioStartMs()+
          getSequentialAudioOffset(index)+
          audio.currentTime*1000;


        timelinePlayheadMs=
          Math.max(
            0,
            Math.min(
              timelineTotalMs(),
              Math.round(
                globalMs/100
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
  }
);


$('ttsAudio')?.addEventListener(
  'error',
  ()=>{
    /* Intentionally silent */
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
    .catch(()=>{});
}
