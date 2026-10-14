/** Lifecycle helpers for muted decorative video. No analytics or remote service APIs. */
export function shouldPlay({ visible, hidden, reducedMotion, saveData, userPaused, blocked }) {
  return Boolean(visible && !hidden && !reducedMotion && !saveData && !userPaused && !blocked);
}

function browserEnvironment() {
  if (!globalThis.window || !globalThis.document) throw new Error('A browser environment is required.');
  return { document:globalThis.document, matchMedia:globalThis.window.matchMedia.bind(globalThis.window),
    connection:globalThis.navigator?.connection, IntersectionObserver:globalThis.IntersectionObserver };
}

export function createMediaController(video, { src, environment, rootMargin='120px 0px', threshold=0, onError }={}) {
  if (!video || typeof video.play!=='function' || typeof video.pause!=='function') throw new TypeError('A video element is required.');
  if (typeof src!=='string' || !src.trim()) throw new TypeError('A video source is required.');
  const env=environment ?? browserEnvironment();
  const reduced=env.matchMedia('(prefers-reduced-motion: reduce)');
  const blockers=new Set();
  let visible=false,userPaused=false,destroyed=false,observer;
  video.muted=true;video.playsInline=true;video.preload='none';

  const state=()=>({visible,hidden:Boolean(env.document.hidden),reducedMotion:Boolean(reduced.matches),
    saveData:Boolean(env.connection?.saveData),userPaused,blocked:blockers.size>0});

  const unload=()=>{
    video.pause();
    if(video.getAttribute('src')){video.removeAttribute('src');video.load();}
  };
  const sync=()=>{
    if(destroyed)return;
    const current=state();
    if(current.reducedMotion || current.saveData){unload();return;}
    if(!shouldPlay(current)){video.pause();return;}
    if(video.getAttribute('src')!==src){video.setAttribute('src',src);video.load();}
    if(!video.paused)return;
    try {
      Promise.resolve(video.play()).then(()=>{
        // A preference change or teardown can arrive while play() is pending.
        if(destroyed || !shouldPlay(state()))video.pause();
      },error=>{if(!destroyed && typeof onError==='function')onError(error);});
    } catch(error){if(typeof onError==='function')onError(error);}
  };
  reduced.addEventListener('change',sync);
  env.connection?.addEventListener?.('change',sync);
  env.document.addEventListener('visibilitychange',sync);
  if(typeof env.IntersectionObserver==='function'){
    observer=new env.IntersectionObserver(entries=>{
      if(destroyed)return;
      visible=entries.some(entry=>entry.target===video && entry.isIntersecting);sync();
    },{rootMargin,threshold});
    observer.observe(video);
  }
  // Missing IntersectionObserver keeps the poster; it does not start a hidden video.
  sync();
  return {
    pause(){if(!destroyed){userPaused=true;sync();}},
    resume(){if(!destroyed){userPaused=false;sync();}},
    setBlocked(key,blocked){if(destroyed)return;blocked?blockers.add(key):blockers.delete(key);sync();},
    getState:state,
    destroy(){
      if(destroyed)return;destroyed=true;observer?.disconnect();
      reduced.removeEventListener('change',sync);
      env.connection?.removeEventListener?.('change',sync);
      env.document.removeEventListener('visibilitychange',sync);video.pause();
    },
  };
}

/** Register explicit foreground videos. Each registration has its own pause key. */
export function bindForegroundPause(background, videos) {
  const key=Symbol('foreground-media');
  const list=[...new Set(videos)];
  const refresh=()=>background.setBlocked(key,list.some(v=>!v.paused&&!v.ended));
  const handlers=list.map(video=>{
    const play=()=>{
      background.setBlocked(key,true);
      list.forEach(other=>{if(other!==video)other.pause();});refresh();
    };
    video.addEventListener('play',play);video.addEventListener('pause',refresh);video.addEventListener('ended',refresh);
    return {video,play};
  });
  refresh();
  return ()=>{
    handlers.forEach(({video,play})=>{
      video.removeEventListener('play',play);video.removeEventListener('pause',refresh);video.removeEventListener('ended',refresh);
    });
    background.setBlocked(key,false);
  };
}
