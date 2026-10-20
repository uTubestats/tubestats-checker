(function(){
'use strict';
var ID=/^[\w-]{11}$/;
function parseVideoId(input){
  var s=(input||'').trim();
  if(!s)return null;
  if(ID.test(s))return{id:s,kind:'video'};
  var u;
  try{u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s);}catch(e){return null;}
  var host=u.hostname.toLowerCase().replace(/^(www|m|music)\./,'');
  var id=null,kind='video',p=u.pathname.split('/').filter(Boolean);
  if(host==='youtu.be'){id=p[0];}
  else if(host==='youtube.com'||host==='youtube-nocookie.com'){
    if(p[0]==='watch')id=u.searchParams.get('v');
    else if(['shorts','embed','live','v'].indexOf(p[0])>-1){id=p[1];if(p[0]==='shorts')kind='short';}
  }
  return id&&ID.test(id)?{id:id,kind:kind}:null;
}
var form=document.getElementById('form'),input=document.getElementById('url'),btn=document.getElementById('go'),
    urlErr=document.getElementById('url-err'),statusEl=document.getElementById('status'),out=document.getElementById('result');
if(!form)return;
var nf=new Intl.NumberFormat(),cf=new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1});
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function showStatus(msg,isErr){statusEl.hidden=false;statusEl.className='status'+(isErr?' error':'');statusEl.textContent=msg;}
function hideStatus(){statusEl.hidden=true;statusEl.textContent='';}
var ERR={
  invalid_id:'That does not look like a valid YouTube video ID. Check the link and try again.',
  not_found:'No public video was found for that link. It may be private, removed, or the ID may be wrong.',
  quota:'The daily limit for YouTube lookups has been reached. Please try again later.',
  not_configured:'This site is not fully set up yet: the YouTube API key is missing or not accepted. If you run this site, see the README.',
  upstream:'YouTube did not respond as expected. Please try again in a minute.',
  network:'Could not reach the server. Check your connection and try again.'
};
function statCard(label,value,note,key){
  var d=el('div','stat'+(key?' key':'')),dt=el('dt',null,label),dd=el('dd',value==null?'na':'');
  if(value==null){dd.textContent='Not available';}else{dd.textContent=value.main;}
  d.appendChild(dt);d.appendChild(dd);
  var n=value==null?note:(value.sub||'');
  if(n){dd.appendChild(el('small',null,n));}
  return d;
}
function render(v,kind){
  out.textContent='';
  var card=el('div','card vid'),img=el('img','thumb');
  img.alt='Thumbnail of '+v.title;img.width=480;img.height=270;img.decoding='async';
  if(v.thumbnail)img.src=v.thumbnail;
  var info=el('div'),h=el('h2',null,v.title);
  info.appendChild(h);
  var tags=el('p','meta');
  tags.appendChild(el('span','tag',kind==='short'?'Shorts link':'Video link'));
  var ch=v.channelId?el('a',null,v.channelTitle):el('span',null,v.channelTitle);
  if(v.channelId){ch.href='https://www.youtube.com/channel/'+encodeURIComponent(v.channelId);ch.rel='noopener';}
  tags.appendChild(ch);info.appendChild(tags);
  var pub=el('p','meta','Published '+new Intl.DateTimeFormat(undefined,{dateStyle:'long'}).format(new Date(v.publishedAt)));
  info.appendChild(pub);
  var yt=el('a',null,'Open on YouTube');yt.href='https://www.youtube.com/watch?v='+encodeURIComponent(v.id);yt.rel='noopener';
  var p2=el('p','meta');p2.appendChild(yt);info.appendChild(p2);
  card.appendChild(img);card.appendChild(info);out.appendChild(card);
  var fmt=function(n){return n==null?null:{main:cf.format(n),sub:nf.format(n)+' exact'};};
  var ratio=null;
  if(v.viewCount>0&&v.likeCount!=null)ratio={main:(v.likeCount/v.viewCount*100).toFixed(2)+'%',sub:'likes ÷ views'};
  var dl=el('dl','stats');
  dl.appendChild(statCard('Views',fmt(v.viewCount),'Not returned by the API.'));
  dl.appendChild(statCard('Likes',fmt(v.likeCount),'Hidden by the creator or not returned.'));
  dl.appendChild(statCard('Comments',fmt(v.commentCount),'Comments may be turned off.'));
  dl.appendChild(statCard('Like-to-view ratio',ratio,'Needs both views and likes.',true));
  out.appendChild(dl);
  var act=el('div','actions card');
  var copy=el('button','ghost','Copy results link');copy.type='button';
  var msg=el('span','meta');msg.setAttribute('role','status');
  copy.addEventListener('click',function(){
    var link=location.origin+location.pathname+'?v='+encodeURIComponent(v.id);
    var done=function(ok){msg.textContent=ok?'Link copied.':'Could not copy. Copy it from the address bar.';};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(function(){done(true);},function(){done(false);});}
    else{var t=document.createElement('textarea');t.value=link;document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}document.body.removeChild(t);done(ok);}
  });
  act.appendChild(copy);act.appendChild(msg);
  act.appendChild(el('span','meta','Fetched '+new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v.fetchedAt))+'. The link re-checks live numbers.'));
  out.appendChild(act);out.hidden=false;
}
function check(raw){
  urlErr.hidden=true;
  var p=parseVideoId(raw);
  if(!p){out.hidden=true;hideStatus();urlErr.textContent='Enter a valid YouTube link, for example https://youtu.be/VIDEO_ID or https://www.youtube.com/shorts/VIDEO_ID.';urlErr.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
  input.removeAttribute('aria-invalid');
  btn.disabled=true;btn.textContent='Checking…';out.hidden=true;
  showStatus('Fetching public statistics…',false);
  fetch('/api/video?id='+encodeURIComponent(p.id),{headers:{Accept:'application/json'}})
    .then(function(r){return r.json().catch(function(){return{error:'upstream'};}).then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){
      if(!x.ok||x.j.error){showStatus(ERR[x.j.error]||ERR.upstream,true);return;}
      hideStatus();render(x.j,p.kind);
      history.replaceState(null,'','?v='+encodeURIComponent(p.id));
      out.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    })
    .catch(function(){showStatus(ERR.network,true);})
    .then(function(){btn.disabled=false;btn.textContent='Check Video';});
}
form.addEventListener('submit',function(e){e.preventDefault();check(input.value);});
var q=new URLSearchParams(location.search).get('v');
if(q&&ID.test(q)){input.value='https://www.youtube.com/watch?v='+q;check(q);}
window.__parseVideoId=parseVideoId;
})();
