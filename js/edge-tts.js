/* AudioVerse Edge Neural TTS
   Frontend owns the complete known Edge voice catalog.
   Vercel /api/voices refreshes it when deployed; /api/tts performs synthesis.
*/
const EdgeTTS=(()=>{
  const API=(window.AUDIOVERSE_API_BASE||'/api').replace(/\/$/,'');
  const CATALOG_KEY='audioverse.edge.voiceCatalog.v5';

  // Complete known Microsoft Edge Neural voice map bundled into the frontend.
  // The API can refresh this catalog after deployment without ever blanking it.
  const VOICE_MAP={
    'af-ZA':['af-ZA-AdriNeural','af-ZA-WillemNeural'],
    'am-ET':['am-ET-AmehaNeural','am-ET-MekdesNeural'],
    'ar-AE':['ar-AE-FatimaNeural','ar-AE-HamdanNeural'], 'ar-BH':['ar-BH-AliNeural','ar-BH-LailaNeural'],
    'ar-DZ':['ar-DZ-AminaNeural','ar-DZ-IsmaelNeural'], 'ar-EG':['ar-EG-SalmaNeural','ar-EG-ShakirNeural'],
    'ar-IQ':['ar-IQ-BasselNeural','ar-IQ-RanaNeural'], 'ar-JO':['ar-JO-SanaNeural','ar-JO-TaimNeural'],
    'ar-KW':['ar-KW-FahedNeural','ar-KW-NouraNeural'], 'ar-LB':['ar-LB-LaylaNeural','ar-LB-RamiNeural'],
    'ar-LY':['ar-LY-ImanNeural','ar-LY-OmarNeural'], 'ar-MA':['ar-MA-JamalNeural','ar-MA-MounaNeural'],
    'ar-OM':['ar-OM-AbdullahNeural','ar-OM-AyshaNeural'], 'ar-QA':['ar-QA-AmalNeural','ar-QA-MoazNeural'],
    'ar-SA':['ar-SA-HamedNeural','ar-SA-ZariyahNeural'], 'ar-SY':['ar-SY-AmanyNeural','ar-SY-LaithNeural'],
    'ar-TN':['ar-TN-HediNeural','ar-TN-ReemNeural'], 'ar-YE':['ar-YE-MaryamNeural','ar-YE-SalehNeural'],
    'az-AZ':['az-AZ-BabekNeural','az-AZ-BanuNeural'], 'bg-BG':['bg-BG-BorislavNeural','bg-BG-KalinaNeural'],
    'bn-BD':['bn-BD-NabanitaNeural','bn-BD-PradeepNeural'], 'bn-IN':['bn-IN-BashkarNeural','bn-IN-TanishaaNeural'],
    'bs-BA':['bs-BA-GoranNeural','bs-BA-VesnaNeural'], 'ca-ES':['ca-ES-EnricNeural','ca-ES-JoanaNeural'],
    'cs-CZ':['cs-CZ-AntoninNeural','cs-CZ-VlastaNeural'], 'cy-GB':['cy-GB-AledNeural','cy-GB-NiaNeural'],
    'da-DK':['da-DK-ChristelNeural','da-DK-JeppeNeural'], 'de-AT':['de-AT-IngridNeural','de-AT-JonasNeural'],
    'de-CH':['de-CH-JanNeural','de-CH-LeniNeural'],
    'de-DE':['de-DE-AmalaNeural','de-DE-ConradNeural','de-DE-FlorianMultilingualNeural','de-DE-KatjaNeural','de-DE-KillianNeural','de-DE-SeraphinaMultilingualNeural'],
    'el-GR':['el-GR-AthinaNeural','el-GR-NestorasNeural'], 'en-AU':['en-AU-NatashaNeural','en-AU-WilliamNeural'],
    'en-CA':['en-CA-ClaraNeural','en-CA-LiamNeural'],
    'en-GB':['en-GB-LibbyNeural','en-GB-MaisieNeural','en-GB-RyanNeural','en-GB-SoniaNeural','en-GB-ThomasNeural'],
    'en-HK':['en-HK-SamNeural','en-HK-YanNeural'], 'en-IE':['en-IE-ConnorNeural','en-IE-EmilyNeural'],
    'en-IN':['en-IN-NeerjaExpressiveNeural','en-IN-NeerjaNeural','en-IN-PrabhatNeural'],
    'en-KE':['en-KE-AsiliaNeural','en-KE-ChilembaNeural'], 'en-NG':['en-NG-AbeoNeural','en-NG-EzinneNeural'],
    'en-NZ':['en-NZ-MitchellNeural','en-NZ-MollyNeural'], 'en-PH':['en-PH-JamesNeural','en-PH-RosaNeural'],
    'en-SG':['en-SG-LunaNeural','en-SG-WayneNeural'], 'en-TZ':['en-TZ-ElimuNeural','en-TZ-ImaniNeural'],
    'en-US':['en-US-AnaNeural','en-US-AndrewMultilingualNeural','en-US-AndrewNeural','en-US-AriaNeural','en-US-AvaMultilingualNeural','en-US-AvaNeural','en-US-BrianMultilingualNeural','en-US-BrianNeural','en-US-ChristopherNeural','en-US-EmmaMultilingualNeural','en-US-EmmaNeural','en-US-EricNeural','en-US-GuyNeural','en-US-JennyNeural','en-US-MichelleNeural','en-US-RogerNeural','en-US-SteffanNeural'],
    'es-AR':['es-AR-ElenaNeural','es-AR-TomasNeural'], 'es-BO':['es-BO-MarceloNeural','es-BO-SofiaNeural'],
    'es-CL':['es-CL-CatalinaNeural','es-CL-LorenzoNeural'], 'es-CO':['es-CO-GonzaloNeural','es-CO-SalomeNeural'],
    'es-CR':['es-CR-JuanNeural','es-CR-MariaNeural'], 'es-CU':['es-CU-BelkysNeural','es-CU-ManuelNeural'],
    'es-DO':['es-DO-EmilioNeural','es-DO-RamonaNeural'], 'es-EC':['es-EC-AndreaNeural','es-EC-LuisNeural'],
    'es-ES':['es-ES-AlvaroNeural','es-ES-ElviraNeural','es-ES-XimenaNeural'], 'es-US':['es-US-AlonsoNeural','es-US-PalomaNeural'],
    'et-EE':['et-EE-AnuNeural','et-EE-KertNeural'], 'fa-IR':['fa-IR-DilaraNeural','fa-IR-FaridNeural'],
    'fi-FI':['fi-FI-HarriNeural','fi-FI-NooraNeural'], 'fil-PH':['fil-PH-AngeloNeural','fil-PH-BlessicaNeural'],
    'fr-BE':['fr-BE-CharlineNeural','fr-BE-GerardNeural'], 'fr-CA':['fr-CA-AntoineNeural','fr-CA-JeanNeural','fr-CA-SylvieNeural','fr-CA-ThierryNeural'],
    'fr-CH':['fr-CH-ArianeNeural','fr-CH-FabriceNeural'],
    'fr-FR':['fr-FR-DeniseNeural','fr-FR-EloiseNeural','fr-FR-HenriNeural','fr-FR-RemyMultilingualNeural','fr-FR-VivienneMultilingualNeural'],
    'ga-IE':['ga-IE-ColmNeural','ga-IE-OrlaNeural'], 'gl-ES':['gl-ES-RoiNeural','gl-ES-SabelaNeural'],
    'gu-IN':['gu-IN-DhwaniNeural','gu-IN-NiranjanNeural'], 'he-IL':['he-IL-AvriNeural','he-IL-HilaNeural'],
    'hi-IN':['hi-IN-MadhurNeural','hi-IN-SwaraNeural'], 'hr-HR':['hr-HR-GabrijelaNeural','hr-HR-SreckoNeural'],
    'hu-HU':['hu-HU-NoemiNeural','hu-HU-TamasNeural'], 'id-ID':['id-ID-ArdiNeural','id-ID-GadisNeural'],
    'is-IS':['is-IS-GudrunNeural','is-IS-GunnarNeural'],
    'it-IT':['it-IT-DiegoNeural','it-IT-ElsaNeural','it-IT-GiuseppeMultilingualNeural','it-IT-IsabellaNeural'],
    'iu-Cans-CA':['iu-Cans-CA-SiqiniqNeural','iu-Cans-CA-TaqqiqNeural'], 'iu-Latn-CA':['iu-Latn-CA-SiqiniqNeural','iu-Latn-CA-TaqqiqNeural'],
    'ja-JP':['ja-JP-KeitaNeural','ja-JP-NanamiNeural'], 'jv-ID':['jv-ID-DimasNeural','jv-ID-SitiNeural'],
    'ka-GE':['ka-GE-EkaNeural','ka-GE-GiorgiNeural'], 'kk-KZ':['kk-KZ-AigulNeural','kk-KZ-DauletNeural'],
    'km-KH':['km-KH-PisethNeural','km-KH-SreymomNeural'], 'kn-IN':['kn-IN-GaganNeural','kn-IN-SapnaNeural'],
    'ko-KR':['ko-KR-HyunsuMultilingualNeural','ko-KR-InJoonNeural','ko-KR-SunHiNeural'],
    'lo-LA':['lo-LA-ChanthavongNeural','lo-LA-KeomanyNeural'], 'lt-LT':['lt-LT-LeonasNeural','lt-LT-OnaNeural'],
    'lv-LV':['lv-LV-EveritaNeural','lv-LV-NilsNeural'], 'mk-MK':['mk-MK-AleksandarNeural','mk-MK-MarijaNeural'],
    'ml-IN':['ml-IN-MidhunNeural','ml-IN-SobhanaNeural'], 'mn-MN':['mn-MN-BataaNeural','mn-MN-YesuiNeural'],
    'mr-IN':['mr-IN-AarohiNeural','mr-IN-ManoharNeural'], 'ms-MY':['ms-MY-OsmanNeural','ms-MY-YasminNeural'],
    'mt-MT':['mt-MT-GraceNeural','mt-MT-JosephNeural'], 'my-MM':['my-MM-NilarNeural','my-MM-ThihaNeural'],
    'nb-NO':['nb-NO-FinnNeural','nb-NO-PernilleNeural'], 'ne-NP':['ne-NP-HemkalaNeural','ne-NP-SagarNeural'],
    'nl-BE':['nl-BE-ArnaudNeural','nl-BE-DenaNeural'], 'nl-NL':['nl-NL-ColetteNeural','nl-NL-FennaNeural','nl-NL-MaartenNeural'],
    'pl-PL':['pl-PL-MarekNeural','pl-PL-ZofiaNeural'], 'ps-AF':['ps-AF-GulNawazNeural','ps-AF-LatifaNeural'],
    'pt-BR':['pt-BR-AntonioNeural','pt-BR-FranciscaNeural','pt-BR-ThalitaMultilingualNeural'], 'pt-PT':['pt-PT-DuarteNeural','pt-PT-RaquelNeural'],
    'ro-RO':['ro-RO-AlinaNeural','ro-RO-EmilNeural'], 'ru-RU':['ru-RU-DmitryNeural','ru-RU-SvetlanaNeural'],
    'si-LK':['si-LK-SameeraNeural','si-LK-ThiliniNeural'], 'sk-SK':['sk-SK-LukasNeural','sk-SK-ViktoriaNeural'],
    'sl-SI':['sl-SI-PetraNeural','sl-SI-RokNeural'], 'so-SO':['so-SO-MuuseNeural','so-SO-UbaxNeural'],
    'sq-AL':['sq-AL-AnilaNeural','sq-AL-IlirNeural'], 'sr-RS':['sr-RS-NicholasNeural','sr-RS-SophieNeural'],
    'su-ID':['su-ID-JajangNeural','su-ID-TutiNeural'], 'sv-SE':['sv-SE-MattiasNeural','sv-SE-SofieNeural'],
    'sw-KE':['sw-KE-RafikiNeural','sw-KE-ZuriNeural'], 'sw-TZ':['sw-TZ-DaudiNeural','sw-TZ-RehemaNeural'],
    'ta-IN':['ta-IN-PallaviNeural','ta-IN-ValluvarNeural'], 'ta-LK':['ta-LK-KumarNeural','ta-LK-SaranyaNeural'],
    'ta-MY':['ta-MY-KaniNeural','ta-MY-SuryaNeural'], 'ta-SG':['ta-SG-AnbuNeural','ta-SG-VenbaNeural'],
    'te-IN':['te-IN-MohanNeural','te-IN-ShrutiNeural'], 'th-TH':['th-TH-NiwatNeural','th-TH-PremwadeeNeural'],
    'tr-TR':['tr-TR-AhmetNeural','tr-TR-EmelNeural'], 'uk-UA':['uk-UA-OstapNeural','uk-UA-PolinaNeural'],
    'ur-IN':['ur-IN-GulNeural','ur-IN-SalmanNeural'], 'ur-PK':['ur-PK-AsadNeural','ur-PK-UzmaNeural'],
    'uz-UZ':['uz-UZ-MadinaNeural','uz-UZ-SardorNeural'], 'vi-VN':['vi-VN-HoaiMyNeural','vi-VN-NamMinhNeural'],
    'zh-CN':['zh-CN-XiaoxiaoNeural','zh-CN-XiaoyiNeural','zh-CN-YunjianNeural','zh-CN-YunxiNeural','zh-CN-YunxiaNeural','zh-CN-YunyangNeural','zh-CN-liaoning-XiaobeiNeural','zh-CN-shaanxi-XiaoniNeural'],
    'zh-HK':['zh-HK-HiuGaaiNeural','zh-HK-HiuMaanNeural','zh-HK-WanLungNeural'],
    'zh-TW':['zh-TW-HsiaoChenNeural','zh-TW-HsiaoYuNeural','zh-TW-YunJheNeural'],
    'zu-ZA':['zu-ZA-ThandoNeural','zu-ZA-ThembaNeural']
  };

  const friendlyLocale=locale=>{
    try{return new Intl.DisplayNames(['en'],{type:'language'}).of(locale.split('-')[0])||locale}catch{return locale}
  };
  // Group by base language, not locale/region.
  // Example: en-US, en-GB, en-IN, en-AU ... all become one "English" entry.
  // Every voice from every regional locale is kept inside that single language.
  const makeCatalog=()=>{
    const out={};
    for(const [locale, names] of Object.entries(VOICE_MAP)){
      const label=friendlyLocale(locale);
      (out[label]??=[]).push(...names);
    }
    for(const key of Object.keys(out)) out[key]=[...new Set(out[key])].sort();
    return out;
  };
  const normalizeVoice=v=>{
    if(typeof v==='string') return {shortName:v,locale:v.match(/^[a-z]{2,3}(?:-[A-Za-z]+)?-[A-Z]{2}/)?.[0]||v.slice(0,5),friendlyName:v};
    const shortName=v?.ShortName||v?.shortName||v?.Name||v?.name||'';
    if(!shortName)return null;
    return {shortName,locale:v?.Locale||v?.locale||shortName.split('-').slice(0,2).join('-'),friendlyName:v?.FriendlyName||v?.friendlyName||shortName,gender:v?.Gender||v?.gender||''};
  };

  let catalog=makeCatalog();
  let voices=Object.entries(VOICE_MAP).flatMap(([locale,names])=>names.map(shortName=>({shortName,locale,friendlyName:shortName})));

  try{
    const cached=JSON.parse(localStorage.getItem(CATALOG_KEY)||'null');
    if(Array.isArray(cached?.voices)&&cached.voices.length){
      const cachedVoices=cached.voices.map(normalizeVoice).filter(Boolean);
      // Cache is only accepted when it is at least as complete as the bundled catalog.
      if(cachedVoices.length>=voices.length){voices=cachedVoices;catalog=catalogFromVoices(voices);}
    }
  }catch{}

  function catalogFromVoices(list){
    const out={};
    for(const v of list){
      // Use only the base language name for the UI. Regional variants are
      // intentionally merged into the same language dropdown option.
      const label=friendlyLocale(v.locale);
      (out[label]??=[]).push(v.shortName);
    }
    for(const k of Object.keys(out))out[k]=[...new Set(out[k])].sort();
    return out;
  }

  async function loadVoices(){
    try{
      const r=await fetch(API+'/voices',{cache:'no-store'});
      if(!r.ok)throw new Error('Voice catalog request failed');
      const data=await r.json();
      if(!Array.isArray(data.voices)||data.voices.length<voices.length)throw new Error('Live catalog is incomplete');
      const live=data.voices.map(normalizeVoice).filter(Boolean);
      if(live.length>=voices.length){
        voices=live;
        catalog=catalogFromVoices(voices);
        try{localStorage.setItem(CATALOG_KEY,JSON.stringify({updatedAt:Date.now(),voices}));}catch{}
        window.dispatchEvent(new CustomEvent('audioverse:voices-updated',{detail:{count:voices.length}}));
      }
      return voices;
    }catch(err){
      // Keep bundled catalog. Never blank the UI because the API is unavailable.
      return voices;
    }
  }

  async function synthesize(text,voice,rate,pitch,onProgress){
    if(!text.trim())throw Error('Enter narration text first.');
    if(!voice)throw Error('Select a voice first.');
    onProgress?.(5);

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),180000);
    let r;
    try{
      r=await fetch(API+'/tts',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text,voice,rate,pitch}),
        cache:'no-store',
        signal:controller.signal
      });
    }catch(e){
      if(e?.name==='AbortError') throw Error('Microsoft Edge Neural TTS timed out after 180 seconds. Try a shorter text or retry.');
      throw Error('AudioVerse TTS backend is unavailable. Deploy this project to Vercel and try again.');
    }finally{
      clearTimeout(timeout);
    }

    if(!r.ok){
      let msg='Microsoft Edge Neural TTS failed.';
      try{const j=await r.json();if(j.error)msg=j.error;if(j.detail)msg += ' '+j.detail;}catch{}
      throw Error(msg);
    }

    // Consume the response progressively instead of waiting on response.blob().
    // This removes the old 70% "stuck" state for long narrations.
    const reader=r.body?.getReader();
    const total=Number(r.headers.get('content-length'))||0;
    const chunks=[];
    let received=0;

    if(reader){
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(value?.byteLength){
          chunks.push(value);
          received+=value.byteLength;
          if(total){
            const pct=70+Math.min(29,(received/total)*29);
            onProgress?.(Math.round(pct));
          }else{
            // No content length: show steady progress without falsely claiming completion.
            onProgress?.(72+Math.min(26,Math.floor(received/65536)));
          }
        }
      }
    }else{
      const blob=await r.blob();
      if(!blob.size)throw Error('Microsoft Edge returned no audio data.');
      onProgress?.(100);
      return new Blob([blob],{type:'audio/mpeg'});
    }

    const blob=new Blob(chunks,{type:r.headers.get('content-type')||'audio/mpeg'});
    if(!blob.size)throw Error('Microsoft Edge returned no audio data.');
    onProgress?.(100);
    return blob;
  }

  return {loadVoices,get catalog(){return catalog},get voices(){return voices},synthesize};
})();
