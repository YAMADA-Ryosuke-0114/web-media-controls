import test from 'node:test';
import assert from 'node:assert/strict';
import {createMediaController,shouldPlay,bindForegroundPause} from '../src/index.js';
class Video extends EventTarget {
  paused=true;ended=false;attrs=new Map();plays=0;loads=0;
  play(){this.paused=false;this.plays++;this.dispatchEvent(new Event('play'));return Promise.resolve();}
  pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
  load(){this.loads++;}getAttribute(k){return this.attrs.get(k)||null;}
  setAttribute(k,v){this.attrs.set(k,v);}removeAttribute(k){this.attrs.delete(k);}
}
function fixture({reduce=false,save=false,observer=true}={}) {
  const doc=new EventTarget();doc.hidden=false;
  const mq=new EventTarget();mq.matches=reduce;
  const connection=new EventTarget();connection.saveData=save;
  let io;
  class IO {constructor(fn){this.fn=fn;io=this;}observe(v){this.video=v;}disconnect(){this.disconnected=true;}show(visible){this.fn([{target:this.video,isIntersecting:visible}]);}}
  const v=new Video();const c=createMediaController(v,{src:'fixture.mp4',environment:{document:doc,matchMedia:()=>mq,connection,IntersectionObserver:observer?IO:undefined}});
  return {v,c,doc,mq,connection,get io(){return io;}};
}
test('offscreen video has no source and visible video loads once',async()=>{
  const f=fixture();assert.equal(f.v.getAttribute('src'),null);f.io.show(true);await Promise.resolve();
  assert.equal(f.v.paused,false);assert.equal(f.v.loads,1);f.io.show(false);assert.equal(f.v.paused,true);f.io.show(true);assert.equal(f.v.loads,1);f.c.destroy();
});
test('initial reduced motion can later change without recreating the controller',()=>{
  const f=fixture({reduce:true});f.io.show(true);assert.equal(f.v.getAttribute('src'),null);
  f.mq.matches=false;f.mq.dispatchEvent(new Event('change'));assert.equal(f.v.paused,false);f.c.destroy();
});
test('dynamic Save-Data unloads and re-enables playback',()=>{
  const f=fixture();f.io.show(true);f.connection.saveData=true;f.connection.dispatchEvent(new Event('change'));
  assert.equal(f.v.getAttribute('src'),null);assert.equal(f.v.paused,true);
  f.connection.saveData=false;f.connection.dispatchEvent(new Event('change'));assert.equal(f.v.paused,false);f.c.destroy();
});
test('tab visibility and explicit pause do not fight each other',()=>{
  const f=fixture();f.io.show(true);f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.v.paused,true);
  f.c.pause();f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.v.paused,true);
  f.c.resume();assert.equal(f.v.paused,false);f.c.destroy();
});
test('missing observer leaves the poster and no source fetch',()=>{
  const f=fixture({observer:false});f.c.resume();assert.equal(f.v.getAttribute('src'),null);f.c.destroy();
});
test('foreground videos pause the background and each other',()=>{
  const f=fixture();f.io.show(true);const a=new Video(),b=new Video();const stop=bindForegroundPause(f.c,[a,b,a]);
  a.play();assert.equal(f.v.paused,true);b.play();assert.equal(a.paused,true);assert.equal(f.v.paused,true);
  b.pause();assert.equal(f.v.paused,false);stop();f.c.destroy();
});
test('teardown removes observers and listeners, and late play promises stay paused',async()=>{
  const f=fixture();f.io.show(true);f.c.destroy();await Promise.resolve();assert.equal(f.v.paused,true);assert.equal(f.io.disconnected,true);
  const plays=f.v.plays;f.mq.dispatchEvent(new Event('change'));f.io.show(true);f.c.resume();assert.equal(f.v.plays,plays);
});
test('each independent blocker must be released before background playback resumes',()=>{
  const f=fixture();f.io.show(true);f.c.setBlocked('a',true);f.c.setBlocked('b',true);f.c.setBlocked('a',false);
  assert.equal(f.v.paused,true);f.c.setBlocked('b',false);assert.equal(f.v.paused,false);f.c.destroy();
});
test('pure policy never starts playback while a user preference suppresses it',()=>{
  const s={visible:true,hidden:false,reducedMotion:false,saveData:false,userPaused:false,blocked:false};
  assert.equal(shouldPlay(s),true);for(const k of ['hidden','reducedMotion','saveData','userPaused','blocked'])assert.equal(shouldPlay({...s,[k]:true}),false);
});
