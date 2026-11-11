/* مخزني: خدمة التشغيل بدون نت. الملفات بتتحمّل من النت لو موجود، ولو مفيش بتتفتح من النسخة المحفوظة على الجهاز. */
var VER = 'mk-v6';
self.addEventListener('install',function(e){ self.skipWaiting(); });
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k!==VER; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
function okHost(u){ return u.origin===self.location.origin || u.hostname==='www.gstatic.com' || u.hostname==='fonts.gstatic.com' || u.hostname==='fonts.googleapis.com'; }
self.addEventListener('fetch',function(e){
  var r = e.request;
  if(r.method!=='GET') return;
  var u = new URL(r.url);
  if(!okHost(u)) return;
  e.respondWith(
    new Promise(function(res,rej){
      var done = false, t = setTimeout(function(){ if(!done){ done = true; rej(new Error('slow')); } },r.mode==='navigate' ? 5000 : 8000);
      fetch(r).then(function(x){ if(!done){ done = true; clearTimeout(t); res(x); } },function(err){ if(!done){ done = true; clearTimeout(t); rej(err); } });
    }).then(function(resp){
      if(resp && (resp.ok || resp.type==='opaque')){
        var copy = resp.clone();
        caches.open(VER).then(function(c){ c.put(r,copy); }).catch(function(){});
      }
      return resp;
    }).catch(function(){
      return caches.match(r,{ignoreSearch:r.mode==='navigate'}).then(function(m){
        return m || (r.mode==='navigate' ? caches.match('index.html',{ignoreSearch:true}) : Response.error());
      });
    })
  );
});