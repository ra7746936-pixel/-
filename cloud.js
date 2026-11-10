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
  if(locked){ $('#cloud').hidden = true; hideLock(); }
  updateNote(Math.ceil((c.exp-now)/86400000));
  renderCloudInfo();
}
function cloudVerify(u){
  var cache = cloudLoadCache();
  if(cache && cache.uid!==u.uid) cache = null;
  return FB.get('users/'+u.uid).then(function(us){
    if(!us || !us.shopId) return {err:'noshop'};
    return FB.get('shops/'+us.shopId).then(function(sh){
      if(!sh) return {err:'noshop'};
      return {info:{uid:u.uid,email:u.email,shopId:us.shopId,name:sh.name||'',exp:+sh.expiresAt||0,status:sh.status||'active',checked:Date.now()}};
    });
  }).then(function(r){
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
function renderCloudInfo(){
  var box = $('#cloud-info');
  if(!box) return;
  if(!window.CLOUD_ON || !cloudInfo){ box.hidden = true; return; }
  var left = Math.ceil((cloudInfo.exp-Date.now())/86400000);
  $('#cd-info').textContent = (cloudInfo.name ? cloudInfo.name+' · ' : '')+cloudInfo.email+' · الاشتراك لحد '+cloudDate(cloudInfo.exp)+' (باقي '+Math.max(left,0)+' يوم) · آخر تحقق من السيرفر '+cloudDate(cloudInfo.checked);
  box.hidden = false;
}

$('#cd-go').addEventListener('click',function(){
  var em = $('#cd-email').value.trim(), pw = $('#cd-pass').value, err = $('#cd-err');
  err.textContent = '';
  if(!em || !pw){ err.textContent = 'اكتب الإيميل والباسورد.'; return; }
  if(!window.FB){ err.textContent = 'مفيش اتصال بالنت.'; return; }
  FB.signIn(em,pw).then(null,function(e){ err.textContent = cloudErrMsg(e); });
});
$('#cd-pass').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('#cd-go').click(); } });
$('#cd-forgot').addEventListener('click',function(){
  var em = $('#cd-email').value.trim(), err = $('#cd-err');
  if(!em){ err.textContent = 'اكتب الإيميل الأول.'; return; }
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
  if(window.FB) FB.signOut();
});
$('#cd-logout2').addEventListener('click',function(){
  if(!window.confirm('تسجّل خروج من حساب المحل؟ هتحتاج الإيميل والباسورد ونت عشان تدخل تاني.')) return;
  try{ localStorage.removeItem(CLOUD_KEY); }catch(e){}
  if(window.FB) FB.signOut();
});