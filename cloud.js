window.APP_VER = 'v9';
/* مخزني — حساب المحل والاشتراك من السحابة (المرحلة 1).
   الدخول بإيميل وباسورد مرة واحدة على الجهاز، والاشتراك بيتقرا من السيرفر ويتجدد من لوحة الإدارة. */
var CLOUD_KEY = 'makhzani-cloud';
var CLOUD_STALE_MS = 7*86400000;
var cloudInfo = null, cloudInited = false, cloudDone = false;

function cloudLoadCache(){
  try{ var r = localStorage.getItem(CLOUD_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; }
}
function cloudSaveCache(c){ try{ localStorage.setItem(CLOUD_KEY,JSON.stringify(c)); }catch(e){} }
function cloudDate(ms){
  var d = new Date(ms), z = function(n){ n = String(n); return n.length<2 ? '0'+n : n; };
  return z(d.getDate())+'/'+z(d.getMonth()+1)+'/'+d.getFullYear();
}
function cloudShow(st,title,msg){
  locked = true;
  document.documentElement.className = (document.documentElement.className.replace(/\blocked\b/g,'')+' locked').replace(/\s+/g,' ');
  $('#lock').hidden = true; $('#auth').hidden = true; setAuthClass(false);
  $('#cloud').hidden = false;
  $('#cd-title').textContent = title;
  $('#cd-msg').textContent = msg || '';
  $('#cd-form').hidden = st!=='login';
  $('#cd-retry').hidden = !(st==='blocked' || st==='offline');
  $('#cd-out').hidden = st!=='blocked';
  $('#cd-err').textContent = '';
  $('#cd-contact').textContent = CONTACT;
  if(st==='login'){ try{ $('#cd-email').focus(); }catch(e){} }
}
function cloudErrMsg(e){
  var c = (e && e.code) || '';
  if(c==='auth/invalid-credential' || c==='auth/wrong-password' || c==='auth/user-not-found' || c==='auth/invalid-email') return 'الإيميل أو الباسورد غلط.';
  if(c==='auth/too-many-requests') return 'محاولات كتير. استنى شوية وجرّب تاني.';
  if(c==='auth/network-request-failed') return 'مفيش اتصال بالنت.';
  if(c==='auth/unauthorized-domain') return 'العنوان ده مش مسموح في Firebase. ضيفه من Authentication ثم Settings ثم Authorized domains.';
  if(c==='auth/operation-not-allowed') return 'تسجيل الدخول بالإيميل مش متفعّل في Firebase.';
  return 'حصلت مشكلة'+(c ? ' ('+c+')' : '')+'. جرّب تاني.';
}
function cloudDecide(c,fromCache){
  var now = Date.now(), seen = 0;
  try{ seen = +localStorage.getItem(SEEN_KEY) || 0; }catch(e){}
  if(now < seen - 2*86400000){ cloudShow('blocked','تاريخ الجهاز غلط','ساعة الجهاز راجعة لورا. اظبط التاريخ والوقت وبعدها اضغط تحقق تاني.'); return; }
  if(c.status==='suspended'){ cloudShow('blocked','الاشتراك موقوف','الاشتراك موقوف. كلّم الدعم.'); return; }
  if(!c.exp || now > c.exp){ cloudShow('blocked','انتهى الاشتراك','الاشتراك انتهى يوم '+(c.exp ? cloudDate(c.exp) : '—')+'. بعد ما تجدد اضغط تحقق تاني.'); return; }
  if(fromCache && now - c.checked > CLOUD_STALE_MS){ cloudShow('offline','لازم تتصل بالنت','الجهاز مش اتصل بالإنترنت بقاله أكتر من 7 أيام. وصّله بالنت وبعدين اضغط تحقق تاني.'); return; }
  try{ if(now>seen) localStorage.setItem(SEEN_KEY,String(now)); }catch(e){}
  if(cloudDataStart(c.shopId)===false) return;
  if(locked){ $('#cloud').hidden = true; hideLock(); }
  updateNote(Math.ceil((c.exp-now)/86400000));
  renderCloudInfo();
}
function cloudVerify(u){
  var cache = cloudLoadCache();
  if(cache && cache.uid!==u.uid) cache = null;
  return FB.get('users/'+u.uid).then(function(us){
    if(!us || !us.shopId) return {err:'noshop'};
    if(us.disabled===true) return {err:'disabled'};
    return FB.get('shops/'+us.shopId).then(function(sh){
      if(!sh) return {err:'noshop'};
      return {info:{uid:u.uid,email:u.email,shopId:us.shopId,name:sh.name||'',exp:+sh.expiresAt||0,status:sh.status||'active',checked:Date.now(),role:us.role||'owner',uname:us.name||''}};
    });
  }).then(function(r){
    if(r.err==='disabled'){ cloudShow('blocked','الحساب موقوف','المالك أوقف الحساب ده. كلّمه.'); return; }
    if(r.err){ cloudShow('blocked','الحساب مش مربوط بمحل','الحساب ده مش متسجّل كمحل. كلّم الدعم.'); return; }
    cloudSaveCache(r.info); cloudInfo = r.info; cloudDecide(r.info,false);
  },function(e){
    var code = (e && e.code) || '';
    if(code==='permission-denied'){ cloudShow('blocked','مفيش صلاحية','الحساب ده ملوش صلاحية على بيانات المحل. كلّم الدعم.'); return; }
    if(cache){ cloudInfo = cache; cloudDecide(cache,true); }
    else { try{ console.error('cloud verify failed',e); }catch(x){} cloudShow('offline','لازم نت أول مرة','مقدرناش نتحقق من الاشتراك. وصّل الجهاز بالنت وجرّب تاني.'+(code ? ' (الكود: '+code+')' : '')); }
  });
}
function cloudOffline(){
  var cache = cloudLoadCache();
  if(cache){ cloudInfo = cache; cloudDecide(cache,true); }
  else cloudShow('offline','لازم نت أول مرة','التطبيق محتاج نت أول مرة عشان تسجّل دخول المحل. وصّل الجهاز بالنت وجرّب تاني.');
}
function cloudInit(){
  if(cloudInited) return;
  cloudInited = true;
  var first = true;
  FB.onUser(function(u){
    if(!u){
      cloudInfo = null; first = false;
      cloudShow('login','تسجيل دخول المحل','اكتب إيميل وباسورد حساب الاشتراك. بتعملها مرة واحدة بس على الجهاز ده.');
      return;
    }
    first = false;
    cloudVerify(u);
  });
}
function cloudStart(){
  cloudShow('wait','بيتصل بحساب المحل…','');
  if(window.FB){ cloudInit(); }
  window.addEventListener('fb-ready',function(){ cloudDone = true; cloudInit(); });
  window.addEventListener('fb-failed',function(){ if(!cloudInited && !cloudDone){ cloudDone = true; cloudOffline(); } });
  setTimeout(function(){ if(!cloudInited && !cloudDone){ cloudDone = true; cloudOffline(); } },12000);
  setInterval(cloudRecheck,30*60000);
  window.addEventListener('online',cloudRecheck);
}
function cloudRecheck(){
  if(window.FB && FB.user && FB.user() && cloudInited) cloudVerify(FB.user());
}
function cloudReauth(pw){
  if(!window.FB || !FB.reauth) return Promise.reject({code:'auth/network-request-failed'});
  return FB.reauth(pw);
}
/* ---------- بيانات المحل في السحابة ---------- */
var cloudStarted = false, cloudGot = {p:false,s:false,u:false}, MIG_KEY = 'makhzani-migrated', cloudErrAt = 0;
function cloudDataStart(shopId){
  if(cloudStarted) return true;
  if(!window.FB || !FB.shopDb){
    cloudShow('offline','لازم نت','بيانات المحل في السحابة. وصّل الجهاز بالنت وجرّب تاني.');
    return false;
  }
  cloudStarted = true;
  var cashier = !!(cloudInfo && cloudInfo.role==='cashier');
  db = FB.shopDb(shopId);
  mode = 'pending';
  products = new Map(); sales = []; suppliers = new Map();
  var fail = function(err){ toast('مشكلة في المزامنة: '+((err && (err.code || err.message)) || ''),true); };
  var got = function(k){
    cloudGot[k] = true;
    if(cloudGot.p && cloudGot.s && cloudGot.u && cloudGot.m && mode==='pending'){
      mode = 'cloud';
      if(cashier && !sess){ sess = {role:'cashier',id:cloudInfo.uid,name:cloudInfo.uname||'كاشير',server:true}; logA('login','دخول كاشير'); afterLogin(); }
      render(); gate();
    }
    else render();
  };
  db.collection('products').onSnapshot(function(snap){
    var m = new Map();
    snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
    products = m; cloudMeta('p',snap); got('p');
  },fail);
  db.collection('sales').where('ts','>=',Date.now()-CLOUD_DAYS*86400000).orderBy('ts','desc').limit(1500).onSnapshot(function(snap){
    sales = snap.docs.map(function(d){ return Object.assign({},d.data(),{id:d.id}); });
    setTimeout(cloudNumberPending,300);
    var mx = invSeq; sales.forEach(function(s){ if(s.no>mx) mx = s.no; }); invSeq = mx; cloudMeta('s',snap);
    got('s');
  },fail);
  if(cashier){
    /* الكاشير: مفيش موردين ولا سجل أمان ولا إعدادات حماية. بيقرا بيانات الفاتورة المطبوعة بس */
    cloudGot.u = true; cloudGot.m = true;
    sec = {v:1,owner:null,users:[],cfg:{pinInv:true,pinStock:true,autoLock:0,phone:''},used:[]};
    db.watch('meta/print',function(s){
      var pc = s.exists() ? s.data() : null;
      if(pc){ shopCfg = {name:pc.name||'',foot:pc.foot||'',w:pc.w==='58' ? '58' : '80'}; }
    },function(){});
  } else {
  db.collection('suppliers').onSnapshot(function(snap){
    var m = new Map();
    snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
    m.forEach(function(v){ if(v.entries) v.entries.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); });
    suppliers = m; cloudMeta('u',snap); got('u');
  },fail);
  /* الـ PIN وحسابات الكاشيرين: على السيرفر */
  /* مهم: جهاز جديد ممكن ياخد أول لقطة فاضية من الكاش. مبنقرّرش إن مفيش PIN غير لما السيرفر يأكّد
     (أو بعد 5 ثواني لو النت قاطع) عشان مانكتبش PIN جديد فوق القديم. */
  var metaOk = false;
  var metaTimer = setTimeout(function(){ if(!metaOk){ metaOk = true; got('m'); } },5000);
  db.collection('meta').onSnapshot(function(snap){
    var cd = null, fc = !!(snap.metadata && snap.metadata.fromCache);
    snap.docs.forEach(function(d){
      if(d.id==='sec'){ try{ cd = JSON.parse(d.data().data); }catch(e){} }
      if(d.id==='backup'){ cloudLastBackup = +d.data().ts || 0; try{ renderBackup(); }catch(e){} }
      if(d.id==='print'){ var pc = d.data(); shopCfg = {name:pc.name||'',foot:pc.foot||'',w:pc.w==='58' ? '58' : '80'}; cloudPrintFill(); }
    });
    cloudSecSync(cd,shopId,!fc);
    if(!metaOk && (!fc || cd)){ metaOk = true; clearTimeout(metaTimer); got('m'); }
  },fail);
  /* سجل الأمان: على السيرفر، بيظهر على كل الأجهزة */
  db.collection('audit').orderBy('ts','desc').limit(400).onSnapshot(function(snap){
    var list = snap.docs.map(function(d){ return Object.assign({},d.data(),{id:d.id}); }).reverse();
    list.forEach(function(e,i){ e.n = i+1; });
    aud = list; cloudMeta('a',snap); cloudAuditMigrate(shopId);
    render();
  },fail);
  /* حسابات الكاشيرين (للمالك بس) */
  db.collection('staff').onSnapshot(function(snap){
    cloudCashiers = snap.docs.map(function(d){ return Object.assign({},d.data(),{id:d.id}); });
    renderCloudCashiers();
  },function(){});
  }
  /* أخطاء الكتابة (اشتراك منتهي، صنف اتمسح…) تظهر للمستخدم */
  window.FB_ONERR = function(e){
    var now = Date.now(); if(now-cloudErrAt<4000) return; cloudErrAt = now;
    var c = (e && e.code) || '';
    toast(c==='permission-denied' ? (cashier ? 'العملية دي مش مسموحة للكاشير، أو الاشتراك موقوف.' : 'الحفظ اترفض: الاشتراك منتهي أو موقوف.') : c==='not-found' ? 'الصنف اتمسح من جهاز تاني.' : 'مشكلة في الحفظ ('+(c||(e&&e.message)||'؟')+')',true);
  };
  return true;
}
/* مرة واحدة: سجل الأمان القديم المحفوظ على الجهاز بيترفع للسحابة (بنفس المعرّفات فمفيش تكرار) */
function cloudSecSync(cd,shopId,confirmed){
  var flag = 'makhzani-sec-migrated', done = false, loc = sec;
  try{ done = localStorage.getItem(flag)===shopId; }catch(e){}
  var mark = function(){ try{ localStorage.setItem(flag,shopId); }catch(e){} };
  if(!cd){
    if(!confirmed) return;
    /* السيرفر فاضي: بنرفع اللي على الجهاز (لو فيه) */
    if(loc){ mark(); secPush(); }
    return;
  }
  var changed = false;
  if(!done){
    /* أول مرة: كاشيرين الجهاز اللي مش موجودين على السيرفر بينضموا ليه */
    if(loc && loc.users){
      cd.users = cd.users || [];
      loc.users.forEach(function(u){ if(!cd.users.some(function(x){ return x.id===u.id; })){ cd.users.push(u); changed = true; } });
    }
    mark();
  }
  secApply(cd);
  if(changed) secPush();
  /* لو الكاشير اللي داخل اتمسح من جهاز تاني بنقفله */
  if(sess && sess.role!=='owner' && !sec.users.some(function(u){ return u.id===sess.id; })){ logout('الحساب اتمسح'); }
  render();
}
/* ---- إعدادات الفاتورة المطبوعة (مشتركة) ---- */
function cloudPrintFill(){
  var a = document.activeElement;
  if(a && /^ps-/.test(a.id||'')) return;
  try{ $('#ps-name').value = shopCfg.name||''; $('#ps-foot').value = shopCfg.foot||''; $('#ps-w').value = shopCfg.w==='58' ? '58' : '80'; }catch(e){}
}
/* ---- رقم الجهاز + ترقيم فواتير الأوفلاين ---- */
function cloudDevId(){
  var k = 'makhzani-dev2', v = null;
  try{ v = localStorage.getItem(k); if(!v){ v = Math.random().toString(36).slice(2,10); localStorage.setItem(k,v); } }catch(e){}
  return v || 'x';
}
var cloudNumBusy = false;
function cloudNumberPending(){
  if(cloudNumBusy || mode!=='cloud' || !db || navigator.onLine===false) return;
  var me = cloudDevId(), todo = sales.filter(function(s){ return s.pn && s.dev===me; }).sort(function(a,b){ return a.ts-b.ts; });
  if(!todo.length) return;
  cloudNumBusy = true;
  (function next(){
    var s = todo.shift();
    if(!s){ cloudNumBusy = false; return; }
    var floor = 0; sales.forEach(function(x){ if(x.no>floor) floor = x.no; });
    db.nextNo(floor).then(function(n){
      db.upd('sales/'+s.id,{no:n,pn:false});
      sales.forEach(function(x){ if(x.id===s.id){ x.no = n; x.pn = false; } });
      if(n>invSeq) invSeq = n;
      render(); next();
    },function(e){
      cloudNumBusy = false;
      var c = (e && (e.code||e.message)) || '?';
      if(window.cloudNumErr!==c){ window.cloudNumErr = c; toast('ترقيم الفاتورة واقف ('+c+'). هحاول تاني لوحدي.',true); }
    });
  })();
}
window.addEventListener('online',function(){ setTimeout(cloudNumberPending,800); });
setInterval(function(){ cloudNumberPending(); },15000);
/* الفواتير والسجل بيتحمّلوا لآخر فترة بس عشان نوفّر قراءات. النسخة الاحتياطية بتجيب كله من السيرفر. */
var CLOUD_DAYS = 45;
/* لرفع النسخ على جوجل درايف: الصق هنا الـ Client ID بتاع Google Cloud (مش سر). سيبه فاضي لو مش عايز الخاصية. */
var GDRIVE_CLIENT_ID = '24820958119-neg9lenq17cr9859mvlhf8idi8c0mgno.apps.googleusercontent.com';
function cloudAll(cb){
  if(mode!=='cloud' || !db || !db.listAll){ cb(sales,aud); return; }
  toast('بجيب كل البيانات من السيرفر…');
  Promise.all([db.listAll('sales'),db.listAll('audit')]).then(function(r){
    var A = r[1].sort(function(a,b){ return a.ts-b.ts; }); A.forEach(function(e,i){ e.n = i+1; });
    cb(r[0].sort(function(a,b){ return b.ts-a.ts; }),A,true);
  },function(){ toast('محتاج نت عشان أجيب النسخة الكاملة. جرّب تاني لما النت يرجع.',true); });
}
var cloudLastBackup = 0;
function cloudMarkBackup(){ if(mode==='cloud' && db){ cloudLastBackup = Date.now(); db.doc('meta/backup').set({ts:cloudLastBackup}); } }
var cloudAudDone = false;
function cloudAuditMigrate(shopId){
  if(cloudAudDone) return; cloudAudDone = true;
  try{
    var flag = 'makhzani-aud-migrated', key = localStorage.getItem(flag);
    if(key===shopId) return;
    var r = localStorage.getItem('makhzani-audit'), o = r ? JSON.parse(r) : null, list = (o && o.list) || [];
    list.forEach(function(e){
      var c = {ts:e.ts,who:e.who,role:e.role||'',act:e.act,txt:e.txt};
      if(e.x!=null) c.x = e.x;
      c.old = true;
      db.doc('audit/'+e.ts+'-L'+e.n).set(c);
    });
    localStorage.setItem(flag,shopId);
  }catch(x){}
}
/* استرجاع نسخة احتياطية في السحابة: بيمسح اللي مش في الملف ويكتب اللي فيه */
function cloudRestoreWrite(d,old){
  var keep = {p:{},s:{},u:{}};
  d.products.forEach(function(p){ keep.p[p.id] = 1; db.doc('products/'+p.id).set(p); });
  d.sales.forEach(function(s){ keep.s[s.id] = 1; db.doc('sales/'+s.id).set(s); });
  d.suppliers.forEach(function(s){ keep.u[s.id] = 1; db.doc('suppliers/'+s.id).set(s); });
  old.p.forEach(function(id){ if(!keep.p[id]) db.doc('products/'+id).delete(); });
  old.s.forEach(function(id){ if(!keep.s[id]) db.doc('sales/'+id).delete(); });
  old.u.forEach(function(id){ if(!keep.u[id]) db.doc('suppliers/'+id).delete(); });
  var mx = Math.max(invSeq,d.seq||0); d.sales.forEach(function(s){ if(s.no>mx) mx = s.no; });
  db.doc('meta/counter').set({seq:mx});
}
function cloudLocalData(){
  try{
    var raw = localStorage.getItem('makhzani-v1'); if(!raw) return null;
    var d = JSON.parse(raw);
    var r = {products:d.products||[],sales:d.sales||[],suppliers:d.suppliers||[],seq:+d.seq||0};
    return (r.products.length || r.sales.length || r.suppliers.length) ? r : null;
  }catch(e){ return null; }
}
function cloudMigrate(){
  if(!isOwner() || mode!=='cloud' || !cloudInfo) return;
  var loc = cloudLocalData();
  if(!loc) return;
  if(products.size || sales.length || suppliers.size){ toast('السحابة فيها بيانات بالفعل. مينفعش ننقل فوقها.',true); return; }
  if(!window.confirm('تنقل '+loc.products.length+' صنف و '+loc.sales.length+' فاتورة و '+loc.suppliers.length+' مورد من الجهاز ده للسحابة؟ بيانات الجهاز هتفضل عندك كنسخة.')) return;
  var mx = loc.seq;
  loc.sales.forEach(function(s){ if(s.no>mx) mx = s.no; });
  loc.sales.filter(function(s){ return !(s.no>0); }).sort(function(a,b){ return a.ts-b.ts; }).forEach(function(s){ s.no = ++mx; });
  loc.products.forEach(function(p){ db.doc('products/'+p.id).set(p); });
  loc.sales.forEach(function(s){ db.doc('sales/'+s.id).set(s); });
  loc.suppliers.forEach(function(s){ db.doc('suppliers/'+s.id).set(s); });
  db.doc('meta/counter').set({seq:mx});
  try{ localStorage.setItem(MIG_KEY,cloudInfo.shopId); }catch(e){}
  logA('cfg','نقل بيانات الجهاز للسحابة: '+loc.products.length+' صنف و '+loc.sales.length+' فاتورة و '+loc.suppliers.length+' مورد');
  toast('اتنقلت البيانات للسحابة');
  render();
}
function renderCloudMigrate(){
  var m = $('#cloud-migrate');
  if(!m) return;
  var loc = null;
  if(window.CLOUD_ON && mode==='cloud' && cloudInfo && isOwner()){
    var done = null; try{ done = localStorage.getItem(MIG_KEY); }catch(e){}
    if(done!==cloudInfo.shopId) loc = cloudLocalData();
  }
  if(!loc){ m.hidden = true; return; }
  var empty = !(products.size || sales.length || suppliers.size);
  $('#cd-mig-txt').textContent = 'في بيانات قديمة على الجهاز ده: '+loc.products.length+' صنف و '+loc.sales.length+' فاتورة و '+loc.suppliers.length+' مورد. '+(empty ? 'تنقلها للسحابة عشان كل الأجهزة تشوفها؟' : 'السحابة فيها بيانات بالفعل، فمينفعش ننقل فوقها.');
  $('#cd-migrate').hidden = !empty;
  m.hidden = false;
}
var cloudDiag = {};
function cloudMeta(k,snap){
  var m = snap && snap.metadata;
  cloudDiag[k] = {c:m ? (m.fromCache ? 'جهاز' : 'سيرفر') : '?', w:m ? m.hasPendingWrites : false};
}
function cloudDiagText(){
  var d = cloudDiag, z = function(k){ return d[k] ? d[k].c+(d[k].w ? '+معلّق' : '') : '-'; };
  return 'تشخيص: محل '+(cloudInfo && cloudInfo.shopId ? cloudInfo.shopId.slice(0,6) : '?')+' · أصناف '+products.size+' ('+z('p')+') · فواتير '+sales.length+' ('+z('s')+') · موردين '+suppliers.size+' ('+z('u')+') · آخر رقم '+invSeq;
}
function renderCloudInfo(){
  renderCloudMigrate();
  var box = $('#cloud-info');
  if(!box) return;
  if(!window.CLOUD_ON || !cloudInfo){ box.hidden = true; return; }
  var left = Math.ceil((cloudInfo.exp-Date.now())/86400000);
  $('#cd-info').textContent = (cloudInfo.name ? cloudInfo.name+' · ' : '')+cloudInfo.email+' · الاشتراك لحد '+cloudDate(cloudInfo.exp)+' (باقي '+Math.max(left,0)+' يوم) · آخر تحقق من السيرفر '+cloudDate(cloudInfo.checked)+'\n'+cloudDiagText();
  box.hidden = false;
}

$('#cd-go').addEventListener('click',function(){
  var em = $('#cd-email').value.trim(), pw = $('#cd-pass').value, err = $('#cd-err');
  err.textContent = '';
  if(!em || !pw){ err.textContent = 'اكتب الإيميل (أو اسم الدخول) والباسورد.'; return; }
  if(em.indexOf('@')<0) em = em.toLowerCase().replace(/\s+/g,'')+'@makhzani.app';
  if(!window.FB){ err.textContent = 'مفيش اتصال بالنت.'; return; }
  FB.signIn(em,pw).then(null,function(e){ err.textContent = cloudErrMsg(e); });
});
$('#cd-pass').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('#cd-go').click(); } });
$('#cd-forgot').addEventListener('click',function(){
  var em = $('#cd-email').value.trim(), err = $('#cd-err');
  if(!em){ err.textContent = 'اكتب الإيميل الأول.'; return; }
  if(em.indexOf('@')<0 || /@makhzani\.app$/i.test(em)){ err.textContent = 'لو نسيت الباسورد، اطلب من المالك يعملك حساب جديد.'; return; }
  if(!window.FB){ err.textContent = 'مفيش اتصال بالنت.'; return; }
  FB.reset(em).then(function(){ err.textContent = 'لو الإيميل مسجّل هيوصله رابط لتغيير الباسورد.'; },function(e){ err.textContent = cloudErrMsg(e); });
});
$('#cd-retry').addEventListener('click',function(){
  if(window.FB && FB.user && FB.user()){
    cloudShow('wait','بيتحقق من الاشتراك…','');
    cloudVerify(FB.user());
  } else location.reload();
});
$('#cd-out').addEventListener('click',function(){
  try{ localStorage.removeItem(CLOUD_KEY); }catch(e){}
  if(window.FB) FB.signOut().then(function(){ if(cloudStarted) location.reload(); });
});
$('#cd-migrate').addEventListener('click',cloudMigrate);
window.addEventListener('online',function(){ if(typeof renderStatus==='function') renderStatus(); });
window.addEventListener('offline',function(){ if(typeof renderStatus==='function') renderStatus(); });
$('#cd-logout2').addEventListener('click',function(){
  if(!window.confirm('تسجّل خروج من حساب المحل؟ هتحتاج الإيميل والباسورد ونت عشان تدخل تاني.')) return;
  try{ localStorage.removeItem(CLOUD_KEY); }catch(e){}
  if(window.FB) FB.signOut().then(function(){ if(cloudStarted) location.reload(); });
});

window.addEventListener('fb-pend',function(){ if(typeof renderStatus==='function') renderStatus(); });

/* تشغيل بدون نت: خدمة التخزين على الجهاز (بتشتغل على https بس) */
try{
  if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){
    window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js?v=9').catch(function(){}); });
  }
}catch(e){}

/* ---------- حسابات الكاشيرين على السيرفر (المالك بس) ---------- */
var cloudCashiers = [];
function cloudSignOut(){
  try{ localStorage.removeItem(CLOUD_KEY); }catch(e){}
  var done = function(){ location.reload(); };
  try{ FB.signOut().then(done,done); }catch(e){ done(); }
}
function renderCloudCashiers(){
  var p = $('#cc-panel'); if(!p) return;
  var on = (mode==='cloud' && isOwner() && cloudInfo && cloudInfo.role!=='cashier');
  p.hidden = !on;
  var old = $('#u-panel'); if(old) old.hidden = !!window.CLOUD_ON;
  if(!on) return;
  var l = cloudCashiers.slice().sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); });
  $('#cc-list').innerHTML = l.length ? l.map(function(u){
    return '<li class="item"><div class="item-head"><strong>'+esc(u.name)+'</strong>'+(u.disabled ? '<span class="chip local">موقوف</span>' : '<span class="chip db">شغال</span>')+'</div>'+
      '<div class="meta">اسم الدخول: <b dir="ltr">'+esc(u.username)+'</b></div>'+
      '<div class="actions"><button class="btn" type="button" data-cc="'+esc(u.id)+'">'+(u.disabled ? 'فعّل' : 'وقّف')+'</button></div></li>';
  }).join('') : '<li class="empty"><p>لسه مفيش كاشيرين. ضيف أول كاشير من تحت.</p></li>';
}
function cloudCcCode(){ return String(cloudInfo.shopId||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,4); }
$('#cc-form').addEventListener('submit',function(e){
  e.preventDefault();
  if(!isOwner() || !cloudInfo){ return; }
  var name = $('#cc-name').value.trim(), base = $('#cc-user').value.trim().toLowerCase(), pw = $('#cc-pass').value;
  if(!name){ toast('اكتب اسم الكاشير',true); return; }
  if(!/^[a-z0-9]{3,16}$/.test(base)){ toast('اسم الدخول: حروف إنجليزي وأرقام بس (من 3 لـ 16)',true); return; }
  if(pw.length<6){ toast('كلمة السر 6 حروف أو أرقام على الأقل',true); return; }
  var login = base+'.'+cloudCcCode(), email = login+'@makhzani.app', btn = $('#cc-go');
  btn.disabled = true;
  FB.createUser(email,pw).then(function(uid){
    var prof = {shopId:cloudInfo.shopId,role:'cashier',name:name,username:login,email:email,disabled:false,createdAt:Date.now()};
    return FB.set('users/'+uid,prof).then(function(){
      return FB.set('shops/'+cloudInfo.shopId+'/staff/'+uid,{name:name,username:login,disabled:false,createdAt:prof.createdAt});
    }).then(function(){
      logA('cfg','إضافة كاشير: '+name+' ('+login+')');
      $('#cc-form').reset();
      toast('اتضاف الكاشير. اسم الدخول: '+login);
    });
  }).then(null,function(err){
    var c = (err && err.code) || '';
    toast(c==='auth/email-already-in-use' ? 'اسم الدخول ده مستخدم. جرّب اسم تاني.' : c==='permission-denied' ? 'مفيش صلاحية لإضافة كاشير (راجع القواعد في Firebase).' : 'معرفتش أضيف الكاشير ('+(c||'؟')+')',true);
  }).then(function(){ btn.disabled = false; });
});
$('#cc-list').addEventListener('click',function(e){
  var b = e.target.closest('[data-cc]'); if(!b || !isOwner()) return;
  var u = cloudCashiers.filter(function(x){ return x.id===b.dataset.cc; })[0]; if(!u) return;
  var dis = !u.disabled;
  if(dis && !window.confirm('توقيف حساب '+u.name+'؟ مش هيقدر يدخل ولا يبيع لحد ما تفعّله.')) return;
  FB.set('users/'+u.id,{disabled:dis},true).then(function(){
    return FB.set('shops/'+cloudInfo.shopId+'/staff/'+u.id,{disabled:dis},true);
  }).then(function(){ logA('cfg',(dis ? 'إيقاف' : 'تفعيل')+' كاشير: '+u.name); toast(dis ? 'اتوقّف الحساب' : 'اتفعّل الحساب'); },
    function(err){ toast('معرفتش أغيّر الحساب ('+((err&&err.code)||'؟')+')',true); });
});

/* ---------- رفع نسخة احتياطية على جوجل درايف (دريف المالك نفسه، فولدر «نسخ مخزني») ---------- */
var driveTok = null, driveTokExp = 0;
function driveMsg(t,bad){ var m = $('#b-drive-msg'); if(!m) return; m.hidden = !t; m.textContent = t||''; m.style.color = bad ? 'var(--bad-ink)' : ''; }
function driveLoadGis(cb){
  if(window.google && google.accounts && google.accounts.oauth2){ cb(); return; }
  var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = cb; s.onerror = function(){ driveMsg('معرفتش أوصل لجوجل. اتأكد من النت وجرّب تاني.',true); $('#b-drive').disabled = false; };
  document.head.appendChild(s);
}
function driveToken(cb){
  if(driveTok && Date.now() < driveTokExp){ cb(driveTok); return; }
  var tc = google.accounts.oauth2.initTokenClient({
    client_id: GDRIVE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file',
    callback: function(r){
      if(!r || r.error || !r.access_token){ driveMsg('اتلغى تسجيل الدخول لجوجل أو اترفض.',true); $('#b-drive').disabled = false; return; }
      driveTok = r.access_token; driveTokExp = Date.now() + (+r.expires_in||3000)*1000 - 60000; cb(driveTok);
    },
    error_callback: function(){ driveMsg('اتلغى تسجيل الدخول لجوجل.',true); $('#b-drive').disabled = false; }
  });
  tc.requestAccessToken({prompt: driveTok===null ? 'consent' : ''});
}
function driveApi(tok,url,opt){
  opt = opt || {}; opt.headers = Object.assign({Authorization:'Bearer '+tok},opt.headers||{});
  return fetch(url,opt).then(function(r){ return r.json().then(function(j){ if(!r.ok){ var e = new Error('drive'); e.status = r.status; e.body = j; throw e; } return j; }); });
}
function driveFolder(tok){
  var q = encodeURIComponent("name='نسخ مخزني' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  return driveApi(tok,'https://www.googleapis.com/drive/v3/files?q='+q+'&fields=files(id)&spaces=drive').then(function(j){
    if(j.files && j.files.length) return j.files[0].id;
    return driveApi(tok,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'نسخ مخزني',mimeType:'application/vnd.google-apps.folder'})}).then(function(f){ return f.id; });
  });
}
function driveUpload(tok,data){
  var d = new Date(), p2 = function(n){ return (n<10?'0':'')+n; };
  var name = 'makhzani-backup-'+d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+'-'+p2(d.getHours())+p2(d.getMinutes())+'.makhzani';
  return driveFolder(tok).then(function(fid){
    var b = '----mk'+Date.now();
    var body = '--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:name,parents:[fid]})+
      '\r\n--'+b+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(data)+'\r\n--'+b+'--';
    return driveApi(tok,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body:body});
  }).then(function(f){ return f.name || name; });
}
$('#b-drive').addEventListener('click',function(){
  if(!isOwner()) return;
  if(!GDRIVE_CLIENT_ID){ driveMsg('الخاصية دي لسه متظبطتش. محتاجة Client ID من Google Cloud (الخطوات عند المطوّر).',true); return; }
  if(!navigator.onLine){ driveMsg('مفيش نت دلوقتي. جرّب لما يرجع.',true); return; }
  var btn = $('#b-drive'); btn.disabled = true; driveMsg('بجهّز النسخة…');
  setTimeout(function(){ btn.disabled = false; },30000);
  driveLoadGis(function(){
    driveToken(function(tok){
      driveMsg('بجمّع البيانات…');
      mkBackupData(function(data){
        if(!data){ btn.disabled = false; return; }
        driveMsg('برفع على درايف…');
        driveUpload(tok,data).then(function(nm){
          mkBackupDone('جوجل درايف'); driveMsg('اترفعت على درايف بتاعك في فولدر «نسخ مخزني»: '+nm); toast('اترفعت النسخة على جوجل درايف');
        }).then(null,function(err){
          if(err && err.status===401){ driveTok = null; driveMsg('انتهت صلاحية الدخول. دوس تاني.',true); }
          else if(err && err.status===403){ driveMsg('جوجل رفضت. اتأكد إن Drive API متفعلة وإنك وافقت على الصلاحية.',true); }
          else driveMsg('معرفتش أرفع النسخة. جرّب تاني.',true);
        }).then(function(){ btn.disabled = false; });
      });
    });
  });
});