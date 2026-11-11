/* مخزني - الجزء 3 من 4: الأمان والصلاحيات وسجل العمليات (UTF-8، جنب index.html) */
  var SEC_KEY = 'makhzani-sec', AUD_KEY = 'makhzani-audit', FAIL_KEY = 'makhzani-fail';
  var sec = null, aud = [], audBase = '', audBaseN = 0, sess = null, lastAct = Date.now();
  var approveCb = null, pendingReset = null, auMode = 'login', pendingUserDel = null, userDelTimer = null;
  var countDraft = null, pendingCnt = false, cntTimer = null, audFilter = 'all', audShow = 60, secShown = false;
  var SENS = {cancel:1,edit:1,delp:1,editp:1,stock:1,fail:1,close:1,cfg:1,user:1,restore:1,count:1,reset:1,delsup:1,entdel:1,entedit:1,approve:1};
  var ACT_NAME = {login:'دخول',logout:'خروج',fail:'PIN غلط',cancel:'إلغاء فاتورة',edit:'تعديل فاتورة',print:'طباعة',addp:'إضافة صنف',editp:'تعديل صنف',delp:'مسح صنف',stock:'تعديل كمية',restock:'توريد',close:'قفل الدرج',cfg:'إعدادات',user:'حسابات',restore:'استرجاع نسخة',count:'جرد',reset:'فك PIN',sup:'مورد',delsup:'مسح مورد',entdel:'إلغاء حركة مورد',entedit:'تعديل حركة مورد',approve:'موافقة المالك',backup:'نسخة احتياطية'};
  var AUD_GROUPS = {
    sens: null,
    inv: {cancel:1,edit:1,print:1},
    stk: {addp:1,editp:1,delp:1,stock:1,restock:1,count:1},
    login: {login:1,logout:1,fail:1,reset:1,approve:1},
    close: {close:1}
  };

  /* ---------- هاش بسيط (للسجل) ---------- */
  function h53(str,seed){
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(var i = 0, ch; i < str.length; i++){ ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch,2654435761); h2 = Math.imul(h2 ^ ch,1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16),2246822507) ^ Math.imul(h2 ^ (h2 >>> 13),3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16),2246822507) ^ Math.imul(h1 ^ (h1 >>> 13),3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  function hh(str){ return h53(str,1)+h53(str,2); }

  function invCode(s){ return s.no>0 ? '#'+s.no : String(s.id).slice(-5).toUpperCase(); }
  function linesText(ls){ return ls.map(function(l){ return l.name+' ×'+fmt(l.qty)+' بـ '+fmt(l.price); }).join('، '); }
  function todayStart(){ var d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }

  /* ---------- تخزين ---------- */
  function secLoad(){
    try{ var r = localStorage.getItem(SEC_KEY); sec = r ? JSON.parse(r) : null; }catch(e){ sec = null; }
    if(sec){
      sec.users = sec.users || [];
      sec.used = sec.used || [];
      sec.cfg = Object.assign({pinInv:false,pinStock:false,autoLock:10,phone:''},sec.cfg || {});
    }
  }
  function secSave(){ try{ localStorage.setItem(SEC_KEY,JSON.stringify(sec)); }catch(e){} }
  function audLoad(){
    try{
      var r = localStorage.getItem(AUD_KEY), o = r ? JSON.parse(r) : null;
      aud = (o && o.list) || []; audBase = (o && o.base) || ''; audBaseN = (o && o.baseN) || 0;
    }catch(e){ aud = []; audBase = ''; audBaseN = 0; }
  }
  function audSave(){ try{ localStorage.setItem(AUD_KEY,JSON.stringify({base:audBase,baseN:audBaseN,list:aud})); }catch(e){} }

  /* ---------- سجل العمليات ---------- */
  function entryBody(e){ return e.n+'|'+e.ts+'|'+e.who+'|'+e.role+'|'+e.act+'|'+e.txt+'|'+(e.x==null ? '' : JSON.stringify(e.x)); }
  function logA(act,txt,x){
    if(mode==='db') return;
    /* في وضع السحابة: السجل بيتكتب على السيرفر ويظهر على كل الأجهزة، ومينفعش يتعدّل ولا يتمسح */
    if(mode==='cloud' && db){
      var ce = {ts:Date.now(),who:sess ? sess.name : '—',role:sess ? sess.role : '',act:act,txt:txt};
      if(x!=null) ce.x = x;
      db.doc('audit/'+ce.ts+'-'+Math.random().toString(36).slice(2,8)).set(ce);
      return;
    }
    var last = aud.length ? aud[aud.length-1] : null;
    var prev = last ? last.h : audBase;
    var e = {n:(last ? last.n : audBaseN)+1,ts:Date.now(),who:sess ? sess.name : '—',role:sess ? sess.role : '',act:act,txt:txt};
    if(x!=null) e.x = x;
    e.h = hh(prev+'#'+entryBody(e));
    aud.push(e);
    if(aud.length>6000){ var cut = aud.splice(0,2000); audBase = cut[cut.length-1].h; audBaseN = cut[cut.length-1].n; }
    audSave();
  }
  function audVerify(){
    var prev = audBase;
    for(var i = 0; i < aud.length; i++){
      var e = aud[i];
      if(hh(prev+'#'+entryBody(e))!==e.h) return i;
      if(i>0 && e.n!==aud[i-1].n+1) return i;
      prev = e.h;
    }
    return -1;
  }

  /* ---------- PIN ---------- */
  function newSalt(){
    var a = new Uint8Array(12), s = '', i;
    try{ crypto.getRandomValues(a); }catch(e){ for(i = 0; i < 12; i++) a[i] = Math.floor(Math.random()*256); }
    for(i = 0; i < 12; i++) s += ('0'+a[i].toString(16)).slice(-2);
    return s;
  }
  function pinHash(pin,salt){
    return new Promise(function(res){
      try{
        if(window.crypto && crypto.subtle){
          var enc = new TextEncoder();
          crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']).then(function(k){
            return crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:120000,hash:'SHA-256'},k,256);
          }).then(function(b){
            var u = new Uint8Array(b), s = '';
            for(var i = 0; i < u.length; i++) s += ('0'+u[i].toString(16)).slice(-2);
            res('p:'+s);
          }).catch(function(){ res('f:'+hh(salt+pin)); });
          return;
        }
      }catch(e){}
      res('f:'+hh(salt+pin));
    });
  }
  function pinCheck(pin,rec){
    if(!rec || !rec.hash) return Promise.resolve(false);
    if(rec.hash.indexOf('f:')===0) return Promise.resolve(rec.hash==='f:'+hh(rec.salt+pin));
    return pinHash(pin,rec.salt).then(function(h){ return h===rec.hash; });
  }
  function failState(){ try{ return JSON.parse(localStorage.getItem(FAIL_KEY) || '{}'); }catch(e){ return {}; } }
  function failSet(o){ try{ localStorage.setItem(FAIL_KEY,JSON.stringify(o)); }catch(e){} }
  function lockLeft(){ var f = failState(); return (f.until && f.until>Date.now()) ? Math.ceil((f.until-Date.now())/1000) : 0; }
  function noteFail(who){
    var f = failState(); f.n = (f.n || 0)+1;
    if(f.n>=5) f.until = Date.now()+60000*Math.min(10,f.n-4);
    failSet(f);
    logA('fail','PIN غلط: '+who);
  }
  function noteOk(){ failSet({}); }

  /* ---------- الصلاحيات ---------- */
  function isOwner(){ return !!sess && sess.role==='owner'; }
  function tabAllowed(v){
    if(!sess) return v==='sell';
    if(v==='sell' || v==='stock') return true;
    return sess.role==='owner';
  }
  function needApproval(kind){
    if(!sess || sess.role==='owner' || !sec) return false;
    return !!(kind==='inv' ? sec.cfg.pinInv : sec.cfg.pinStock);
  }
  function setAuthClass(on){
    var c = (' '+document.documentElement.className+' ').replace(/ authing /g,' ').replace(/\s+/g,' ').replace(/^ | $/g,'');
    document.documentElement.className = on ? (c ? c+' authing' : 'authing') : c;
  }
  function gate(){
    var au = $('#auth');
    if(mode==='db' || mode==='pending' || locked || sess){ au.hidden = true; setAuthClass(false); return; }
    showAuth();
  }
  function afterLogin(){
    lastAct = Date.now();
    $('#auth').hidden = true; setAuthClass(false);
    render(); focusQ();
  }
  function logout(reason){
    if(sess) logA('logout',reason || 'قفل');
    sess = null; secShown = false; countDraft = null;
    editSale = null; draft = []; editEnt = null; selSup = null; view = 'sell';
    gate(); render();
  }
  function renderRoleUI(){
    var own = isOwner();
    $('#print-set').hidden = !own;
    var pc = $('#f-cost').parentNode; if(pc) pc.hidden = !own;
    $('#who').textContent = sess ? 'المستخدم: '+sess.name : '';
    $('#lock-now').hidden = !sess || mode==='db';
  }

  /* ---------- شاشة الدخول ---------- */
  function showAuth(m){
    auMode = m || ((sec && sec.owner) ? 'login' : 'setup');
    $('#auth').hidden = false; setAuthClass(true);
    ['au-user-wrap','au-pin-wrap','au-pin2-wrap','au-phone-wrap','au-code-wrap','au-forgot','au-back'].forEach(function(id){ $('#'+id).hidden = true; });
    $('#au-err').textContent = ''; $('#au-pin').value = ''; $('#au-pin2').value = '';
    $('#au-pin-l').textContent = 'PIN';
    if(auMode==='setup'){
      $('#au-title').textContent = 'إعداد حماية المحل';
      $('#au-msg').textContent = 'اعمل PIN للمالك (من 4 لـ 8 أرقام). هو اللي بيفتح الأرباح والتقارير والإعدادات. متقولوش للكاشير.';
      $('#au-pin-wrap').hidden = false; $('#au-pin2-wrap').hidden = false; $('#au-phone-wrap').hidden = false;
      $('#au-go').textContent = 'احفظ وادخل';
    } else if(auMode==='recover'){
      $('#au-title').textContent = 'استرجاع PIN المالك';
      var cl = !!window.CLOUD_ON;
      $('#au-msg').textContent = cl ? 'اكتب باسورد حساب المحل (اللي بتدخل بيه على الإنترنت) عشان نفك PIN المالك. محتاج نت.' : (LICENSE_KEY_JWK ? 'ابعت رقم جهازك للمسؤول واطلب كود فك PIN، وبعدين الصقه هنا.' : 'النسخة دي مش متفعّل فيها استرجاع الـ PIN.');
      $('#au-dev').value = getDeviceId();
      $('#au-lic-fields').hidden = cl; $('#au-cloud-fields').hidden = !cl; $('#au-cpw').value = '';
      $('#au-code-wrap').hidden = false; $('#au-back').hidden = false;
      $('#au-go').textContent = 'تحقق من الكود';
    } else if(auMode==='recover2'){
      $('#au-title').textContent = 'PIN جديد للمالك';
      $('#au-msg').textContent = 'الكود اتقبل. اكتب PIN جديد.';
      $('#au-pin-l').textContent = 'PIN جديد';
      $('#au-pin-wrap').hidden = false; $('#au-pin2-wrap').hidden = false;
      $('#au-go').textContent = 'احفظ وادخل';
    } else {
      $('#au-title').textContent = 'تسجيل الدخول';
      $('#au-msg').textContent = 'اختار حسابك واكتب الـ PIN.';
      var opts = '<option value="owner">المالك</option>'+sec.users.map(function(u){ return '<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>'; }).join('');
      $('#au-user').innerHTML = opts;
      try{ var lu = localStorage.getItem('makhzani-lastuser'); if(lu){ $('#au-user').value = lu; if($('#au-user').value!==lu) $('#au-user').value = 'owner'; } }catch(e){}
      $('#au-user-wrap').hidden = false; $('#au-pin-wrap').hidden = false; $('#au-forgot').hidden = false;
      $('#au-go').textContent = 'دخول';
    }
    var f = auMode==='recover' ? (window.CLOUD_ON ? $('#au-cpw') : $('#au-code')) : $('#au-pin');
    if(f && f.focus) f.focus();
  }

  function doAuth(){
    var err = $('#au-err'); err.textContent = '';
    var pin = $('#au-pin').value.trim();
    if(auMode==='setup' || auMode==='recover2'){
      var pin2 = $('#au-pin2').value.trim();
      if(!/^\d{4,8}$/.test(pin)){ err.textContent = 'الـ PIN لازم يكون من 4 لـ 8 أرقام'; return; }
      if(pin!==pin2){ err.textContent = 'الـ PIN مش متطابق'; return; }
      var salt = newSalt(), wasSetup = (auMode==='setup');
      pinHash(pin,salt).then(function(h){
        if(wasSetup){
          sec = {v:1,owner:{salt:salt,hash:h},users:[],cfg:{pinInv:false,pinStock:false,autoLock:10,phone:$('#au-phone').value.replace(/\D/g,'')},used:[]};
          sess = {role:'owner',id:'owner',name:'المالك'};
          secSave();
          logA('cfg','تم إعداد حماية المحل وPIN المالك');
        } else {
          sec.owner = {salt:salt,hash:h};
          if(pendingReset){ sec.used.push(pendingReset); pendingReset = null; }
          sess = {role:'owner',id:'owner',name:'المالك'};
          secSave();
          logA('reset',window.CLOUD_ON ? 'اتفك PIN المالك بباسورد حساب المحل واتعمل PIN جديد' : 'اتفك PIN المالك بكود من المسؤول واتعمل PIN جديد');
        }
        noteOk(); afterLogin();
      });
      return;
    }
    if(auMode==='recover' && window.CLOUD_ON){
      var cpw = $('#au-cpw').value;
      if(!cpw){ err.textContent = 'اكتب باسورد حساب المحل'; return; }
      cloudReauth(cpw).then(function(){ pendingReset = null; showAuth('recover2'); },function(e){ err.textContent = cloudErrMsg(e); });
      return;
    }
    if(auMode==='recover'){
      if(!LICENSE_KEY_JWK){ err.textContent = 'النسخة دي مش متفعّل فيها استرجاع الـ PIN.'; return; }
      var code = $('#au-code').value.replace(/\s+/g,'');
      if(!code){ err.textContent = 'الصق الكود'; return; }
      verifyCode(code).then(function(r){
        if(r.nosub){ err.textContent = 'المتصفح ده مش بيدعم التحقق. افتح الملف بـ Chrome.'; return; }
        if(!r.ok){ err.textContent = 'الكود غلط. اتأكد إنك نسخته كله.'; return; }
        var p = r.p;
        if(p.t!=='pin' || String(p.d || '').toUpperCase()!==getDeviceId()){ err.textContent = 'الكود ده مش كود فك PIN لجهازك.'; return; }
        if(String(p.e || '')<todayStr()){ err.textContent = 'الكود منتهي. اطلب كود جديد.'; return; }
        var hc = hh(code);
        if((sec.used || []).indexOf(hc)>=0){ err.textContent = 'الكود ده اتستخدم قبل كده.'; return; }
        pendingReset = hc;
        showAuth('recover2');
      });
      return;
    }
    var left = lockLeft();
    if(left>0){ err.textContent = 'استنى '+left+' ثانية وجرّب تاني'; return; }
    var who = $('#au-user').value;
    var rec = who==='owner' ? sec.owner : sec.users.filter(function(u){ return u.id===who; })[0];
    if(!rec){ err.textContent = 'الحساب مش موجود'; return; }
    var nm = who==='owner' ? 'المالك' : rec.name;
    pinCheck(pin,rec).then(function(ok){
      if(!ok){
        noteFail(nm);
        var l = lockLeft();
        err.textContent = l>0 ? 'PIN غلط كتير. استنى '+l+' ثانية' : 'PIN غلط';
        $('#au-pin').value = '';
        return;
      }
      noteOk();
      try{ localStorage.setItem('makhzani-lastuser',who); }catch(e){}
      sess = {role:who==='owner' ? 'owner' : 'cashier',id:who,name:nm};
      logA('login','دخول');
      afterLogin();
    });
  }

  /* ---------- موافقة المالك ---------- */
  function askOwner(msg,cb){
    if(isOwner()){ cb(); return; }
    approveCb = {cb:cb,msg:msg};
    $('#ap-msg').textContent = msg; $('#ap-pin').value = ''; $('#ap-err').textContent = '';
    $('#approve').hidden = false;
    $('#ap-pin').focus();
  }
  function closeApprove(){ $('#approve').hidden = true; approveCb = null; }
  function doApprove(){
    var err = $('#ap-err'); err.textContent = '';
    if(!approveCb) return;
    var left = lockLeft();
    if(left>0){ err.textContent = 'استنى '+left+' ثانية'; return; }
    pinCheck($('#ap-pin').value.trim(),sec.owner).then(function(ok){
      if(!ok){
        noteFail('موافقة المالك');
        var l = lockLeft();
        err.textContent = l>0 ? 'PIN غلط كتير. استنى '+l+' ثانية' : 'PIN المالك غلط';
        $('#ap-pin').value = '';
        return;
      }
      noteOk();
      var a = approveCb; closeApprove();
      logA('approve','موافقة المالك على: '+a.msg);
      a.cb();
    });
  }

  /* ---------- قفل تلقائي ---------- */
  function idleCheck(){
    if(!sess || mode==='db' || !sec) return;
    var m = +sec.cfg.autoLock || 0;
    if(m>0 && Date.now()-lastAct>m*60000) logout('قفل تلقائي بعد خمول');
  }
  function initIdle(){
    ['click','keydown','input','touchstart'].forEach(function(ev){
      document.addEventListener(ev,function(){ lastAct = Date.now(); },true);
    });
    setInterval(idleCheck,15000);
  }

  /* ---------- قفل الدرج ---------- */
  function lastCloseTs(){
    for(var i = aud.length-1; i >= 0; i--){ if(aud[i].act==='close') return aud[i].ts; }
    return todayStart();
  }
  function doClose(){
    if(!ready()) return;
    var v = parseFloat($('#cl-amount').value);
    if(!(v>=0)){ toast('اكتب الفلوس اللي في الدرج',true); $('#cl-amount').focus(); return; }
    var op = parseFloat($('#cl-open').value); if(!(op>=0)) op = 0;
    var note = $('#cl-note').value.trim();
    var since = lastCloseTs(), exp = 0;
    sales.forEach(function(s){ if(s.ts>since) exp += s.total; });
    exp = round(exp);
    logA('close','قفل الدرج: عدّ '+money(v)+(note ? ' — '+note : ''),{counted:round(v),open:round(op),expected:exp,since:since});
    $('#cl-amount').value = ''; $('#cl-open').value = ''; $('#cl-note').value = '';
    toast(isOwner() ? 'اتسجّل القفل. الفرق '+money(round(v-op-exp)) : 'اتسجّل قفل الدرج');
    render();
  }

  /* ---------- فواتير النهارده (شاشة البيع) ---------- */
  function renderMine(){
    var el = $('#mine-list'); if(!el) return;
    var t0 = todayStart();
    var list = sales.filter(function(s){ return s.ts>=t0; }).slice(0,10);
    el.innerHTML = list.length ? list.map(function(s){
      var tag = (s.edits && s.edits.length) ? '<span class="pill warn">اتعدّلت</span>' : '';
      return '<li><span class="when">'+esc(invCode(s))+' · '+dt(s.ts)+(s.by ? ' · '+esc(s.by.name) : '')+'</span><span class="what">'+s.lines.map(function(l){ return esc(l.name)+' ×'+fmt(l.qty); }).join('، ')+'</span><span class="sum">'+money(s.total)+'</span>'+
        '<div class="inv-act"><button type="button" class="btn sm" data-act="editinv" data-sid="'+esc(s.id)+'">مرتجع / تعديل</button><button type="button" class="btn sm" data-act="print" data-sid="'+esc(s.id)+'">اطبع</button>'+tag+'</div></li>';
    }).join('') : '<li class="note">مفيش فواتير النهارده.</li>';
  }

  /* ---------- ملخص اليوم ---------- */
  function closeDiff(e){ var x = e.x || {}; return round((x.counted || 0)-(x.open || 0)-(x.expected || 0)); }
  function todayStats(){
    var t0 = todayStart(), td = sales.filter(function(s){ return s.ts>=t0; }), tot = 0;
    td.forEach(function(s){ tot += s.total; });
    var pr = profitFor(td), ac = aud.filter(function(e){ return e.ts>=t0; });
    var cnt = function(a){ return ac.filter(function(e){ return e.act===a; }); };
    var canc = cnt('cancel'), cv = 0;
    canc.forEach(function(e){ cv += (e.x && e.x.total) || 0; });
    var low = 0; products.forEach(function(p){ if(p.qty<=LOW) low++; });
    return {n:td.length,total:round(tot),profit:pr.profit,unknown:pr.unknown,cancels:canc.length,cancelVal:round(cv),edits:cnt('edit').length,delp:cnt('delp').length,stk:cnt('stock').length,fails:cnt('fail').length,closes:cnt('close'),low:low};
  }
  function buildSummary(){
    var s = todayStats(), d = new Date();
    var L = ['ملخص '+(shopCfg.name || 'المحل')+' - '+dt(d.getTime()).slice(0,10),
      'المبيعات: '+money(s.total)+' ('+fmt(s.n)+' فاتورة)',
      'صافي الربح: '+money(s.profit)+(s.unknown ? ' (من غير '+s.unknown+' سطر مفيهوش سعر جملة)' : ''),
      'فواتير ملغية: '+fmt(s.cancels)+(s.cancels ? ' بقيمة '+money(s.cancelVal) : ''),
      'فواتير متعدّلة: '+fmt(s.edits),
      'أصناف اتمسحت: '+fmt(s.delp)+' | كميات اتعدّلت: '+fmt(s.stk),
      'محاولات PIN غلط: '+fmt(s.fails),
      'أصناف قربت تخلص أو خلصت: '+fmt(s.low)];
    s.closes.forEach(function(e){
      var df = closeDiff(e);
      L.push('قفل درج '+e.who+': عدّ '+money((e.x && e.x.counted) || 0)+' - '+(df===0 ? 'مظبوط' : df<0 ? 'عجز '+money(-df) : 'زيادة '+money(df)));
    });
    return L.join('\n');
  }
  function sendWA(){
    var ph = String((sec && sec.cfg.phone) || '').replace(/\D/g,'');
    var url = 'https://wa.me/'+ph+'?text='+encodeURIComponent(buildSummary());
    logA('cfg','فتح ملخص اليوم للإرسال على واتساب');
    window.open(url,'_blank');
  }

  /* ---------- شاشة الأمان (للمالك) ---------- */
  function fillSecFields(){
    $('#sc-inv').checked = !!sec.cfg.pinInv;
    $('#sc-stock').checked = !!sec.cfg.pinStock;
    $('#sc-auto').value = String(sec.cfg.autoLock);
    $('#sc-phone').value = sec.cfg.phone || '';
  }
  function renderSec(){
    if(view!=='sec' || !isOwner() || !sec){ secShown = false; return; }
    if(!secShown){ fillSecFields(); secShown = true; }
    var s = todayStats();
    var lc = s.closes.length ? s.closes[s.closes.length-1] : null, ld = lc ? closeDiff(lc) : null;
    $('#sec-tiles').innerHTML =
      '<div class="tile"><span>مبيعات النهارده</span><strong>'+money(s.total)+'</strong><small>'+fmt(s.n)+' فاتورة</small></div>'+
      '<div class="tile"><span>صافي الربح</span><strong>'+money(s.profit)+'</strong></div>'+
      '<div class="tile'+(s.cancels ? ' alert' : '')+'"><span>فواتير ملغية</span><strong>'+fmt(s.cancels)+'</strong><small>'+(s.cancels ? 'بقيمة '+money(s.cancelVal) : 'مفيش')+'</small></div>'+
      '<div class="tile'+(s.edits ? ' alert' : '')+'"><span>فواتير متعدّلة</span><strong>'+fmt(s.edits)+'</strong></div>'+
      '<div class="tile'+((s.delp || s.stk) ? ' alert' : '')+'"><span>مسح أصناف / تعديل كميات</span><strong>'+fmt(s.delp)+' / '+fmt(s.stk)+'</strong></div>'+
      '<div class="tile'+(ld!==null && ld<0 ? ' alert' : '')+'"><span>آخر قفل درج</span><strong>'+(ld===null ? '—' : ld===0 ? 'مظبوط' : ld<0 ? 'عجز '+money(-ld) : 'زيادة '+money(ld))+'</strong></div>';
    $('#sec-users').innerHTML = sec.users.length ? sec.users.map(function(u){
      return '<li class="item"><div class="item-head"><strong>'+esc(u.name)+'</strong>'+
        '<button type="button" class="btn danger sm" data-act="udel" data-uid="'+esc(u.id)+'">'+(pendingUserDel===u.id ? 'متأكد؟ اضغط تاني' : 'حذف')+'</button></div></li>';
    }).join('') : '<li class="note">لسه مفيش كاشيرات. ضيف أول واحد من تحت.</li>';
    var cl = aud.filter(function(e){ return e.act==='close'; }).slice(-15).reverse();
    $('#sec-closes').innerHTML = cl.length ? cl.map(function(e){
      var df = closeDiff(e), x = e.x || {};
      return '<li><span class="when">'+dt(e.ts)+' · '+esc(e.who)+'</span><span class="what">عدّ '+money(x.counted || 0)+(x.open ? ' · رصيد أول '+money(x.open) : '')+' · المفروض '+money(round((x.expected || 0)+(x.open || 0)))+'</span>'+
        '<span class="sum"><span class="pill '+(df<0 ? 'bad' : df>0 ? 'warn' : 'ok')+'">'+(df===0 ? 'مظبوط' : df<0 ? 'عجز '+money(-df) : 'زيادة '+money(df))+'</span></span></li>';
    }).join('') : '<li class="note">مفيش قفل درج لسه.</li>';
    renderAud(); renderCount();
  }
  function audFiltered(){
    return aud.filter(function(e){
      if(audFilter==='all') return true;
      if(audFilter==='sens') return !!SENS[e.act];
      return !!(AUD_GROUPS[audFilter] && AUD_GROUPS[audFilter][e.act]);
    });
  }
  function renderAud(){
    var all = audFiltered(), list = all.slice(-audShow).reverse();
    $('#aud-list').innerHTML = list.length ? list.map(function(e){
      return '<li class="aud'+(SENS[e.act] ? ' sens' : '')+'"><span class="when">'+dt(e.ts)+' · '+esc(e.who)+'</span><span class="what">'+esc(e.txt)+'</span>'+
        '<span class="sum"><span class="pill '+(SENS[e.act] ? 'warn' : 'zero')+'">'+esc(ACT_NAME[e.act] || e.act)+'</span></span></li>';
    }).join('') : '<li class="note">مفيش عمليات بالفلتر ده.</li>';
    $('#aud-more').hidden = all.length<=audShow;
  }
  function exportAudit(){
    var rows = [['م','الوقت','المستخدم','النوع','التفاصيل']];
    audFiltered().forEach(function(e){ rows.push([e.n,dt(e.ts),e.who,ACT_NAME[e.act] || e.act,e.txt]); });
    downloadCsv('audit',rows);
  }

  /* ---------- الجرد ---------- */
  function renderCount(){
    $('#cnt-box').hidden = !countDraft;
    if(!countDraft) return;
    var list = Array.from(products.values()).sort(byName);
    $('#cnt-body').innerHTML = list.map(function(p){
      var v = countDraft[p.id], has = (v!==undefined && v!==''), df = has ? round(v-p.qty) : null;
      return '<tr><td>'+esc(p.name)+'</td><td class="n">'+fmt(p.qty)+'</td><td class="n"><input type="number" inputmode="decimal" min="0" step="any" data-cnt="'+esc(p.id)+'" value="'+(has ? v : '')+'"></td>'+
        '<td class="n" data-diff="'+esc(p.id)+'">'+(df===null ? '—' : df===0 ? 'مظبوط' : (df>0 ? '+' : '')+fmt(df))+'</td></tr>';
    }).join('');
    $('#cnt-apply').textContent = pendingCnt ? 'متأكد؟ اضغط تاني' : 'اعتمد الجرد وعدّل المخزن';
  }
  function applyCount(){
    if(!ready() || !countDraft) return;
    var upd = [], lines = [], lossVal = 0;
    products.forEach(function(p){
      var v = countDraft[p.id];
      if(v===undefined || v==='') return;
      var df = round(v-p.qty);
      if(df===0) return;
      upd.push(Object.assign({},p,{qty:round(v)}));
      lines.push(p.name+': '+fmt(p.qty)+'←'+fmt(v));
      if(df<0 && p.cost!=null) lossVal += -df*p.cost;
    });
    if(!upd.length){ toast('مفيش فروق في الأصناف اللي عدّيتها'); countDraft = null; renderCount(); return; }
    upd.forEach(function(p){ products.set(p.id,p); });
    logA('count','جرد: '+upd.length+' صنف فيه فرق'+(lossVal ? '، قيمة العجز بسعر الجملة '+money(round(lossVal)) : '')+' — '+lines.slice(0,12).join('، ')+(lines.length>12 ? '…' : ''),{n:upd.length,loss:round(lossVal)});
    persist(function(){
      var ch = Promise.resolve();
      upd.forEach(function(u){ ch = ch.then(function(){ return db.doc('products/'+u.id).set(u); }); });
      return ch;
    });
    countDraft = null; pendingCnt = false;
    toast('اتعدّل المخزن حسب الجرد'+(lossVal ? '. العجز '+money(round(lossVal)) : ''));
    render();
  }

  /* ---------- أحداث الأمان ---------- */
  document.addEventListener('click',function(e){
    var b = e.target.closest('[data-act]');
    if(!b) return;
    switch(b.dataset.act){
      case 'logout': logout('قفل يدوي'); break;
      case 'cl-save': doClose(); break;
      case 'wa-send': if(isOwner()) sendWA(); break;
      case 'aud-verify': {
        if(!isOwner()) return;
        if(mode==='cloud'){
          $('#aud-state').textContent = 'السجل محفوظ على السيرفر: '+aud.length+' عملية، ومفيش حد (ولا حتى انت) يقدر يعدّل أو يمسح منها.';
          $('#aud-state').className = 'hint'; break;
        }
        var bad = audVerify();
        $('#aud-state').textContent = bad<0 ? 'السجل سليم: '+aud.length+' عملية متسلسلة ومفيش تلاعب.' : 'تحذير: السجل اتغيّر أو اتمسح منه جزء عند العملية رقم '+aud[bad].n+'.';
        $('#aud-state').className = 'hint '+(bad<0 ? '' : 'lock-err');
        break;
      }
      case 'aud-export': if(isOwner()) exportAudit(); break;
      case 'aud-more': audShow += 60; renderAud(); break;
      case 'udel': {
        if(!isOwner()) return;
        var uid2 = b.dataset.uid, u = sec.users.filter(function(x){ return x.id===uid2; })[0];
        if(!u) return;
        if(pendingUserDel!==uid2){
          pendingUserDel = uid2; clearTimeout(userDelTimer);
          userDelTimer = setTimeout(function(){ pendingUserDel = null; renderSec(); },3000);
          renderSec(); return;
        }
        clearTimeout(userDelTimer); pendingUserDel = null;
        sec.users = sec.users.filter(function(x){ return x.id!==uid2; });
        secSave(); logA('user','حذف الكاشير: '+u.name);
        toast('اتحذف الكاشير'); renderSec();
        break;
      }
      case 'cnt-open': if(isOwner()){ countDraft = {}; pendingCnt = false; renderCount(); } break;
      case 'cnt-cancel': countDraft = null; pendingCnt = false; renderCount(); break;
      case 'cnt-apply': {
        if(!isOwner() || !countDraft) return;
        if(!pendingCnt){
          pendingCnt = true; clearTimeout(cntTimer);
          cntTimer = setTimeout(function(){ pendingCnt = false; renderCount(); },3000);
          renderCount(); return;
        }
        clearTimeout(cntTimer); applyCount();
        break;
      }
    }
  });
  $('#cnt-body').addEventListener('change',function(e){
    var inp = e.target.closest('[data-cnt]');
    if(!inp || !countDraft) return;
    var id = inp.dataset.cnt, p = products.get(id);
    countDraft[id] = inp.value==='' ? '' : parseFloat(inp.value);
    renderCount();
  });
  $('#aud-filter').addEventListener('change',function(){ audFilter = $('#aud-filter').value; audShow = 60; renderAud(); });

  $('#u-form').addEventListener('submit',function(e){
    e.preventDefault();
    if(!isOwner()) return;
    var name = $('#u-name').value.trim(), pin = $('#u-pin').value.trim();
    if(!name){ toast('اكتب اسم الكاشير',true); $('#u-name').focus(); return; }
    if(name==='المالك'){ toast('الاسم ده محجوز',true); return; }
    if(!/^\d{4,8}$/.test(pin)){ toast('الـ PIN لازم يكون من 4 لـ 8 أرقام',true); $('#u-pin').focus(); return; }
    var salt = newSalt();
    pinHash(pin,salt).then(function(h){
      var ex = sec.users.filter(function(u){ return u.name===name; })[0];
      if(ex){ ex.salt = salt; ex.hash = h; logA('user','غيّر PIN الكاشير: '+name); }
      else { sec.users.push({id:uid(),name:name,salt:salt,hash:h}); logA('user','ضاف كاشير: '+name); }
      secSave(); $('#u-form').reset(); toast('اتحفظ حساب '+name); render();
    });
  });
  $('#o-form').addEventListener('submit',function(e){
    e.preventDefault();
    if(!isOwner()) return;
    var p1 = $('#o-pin').value.trim(), p2 = $('#o-pin2').value.trim();
    if(!/^\d{4,8}$/.test(p1)){ toast('الـ PIN لازم يكون من 4 لـ 8 أرقام',true); return; }
    if(p1!==p2){ toast('الـ PIN مش متطابق',true); return; }
    var salt = newSalt();
    pinHash(p1,salt).then(function(h){
      sec.owner = {salt:salt,hash:h}; secSave();
      logA('cfg','غيّر PIN المالك');
      $('#o-form').reset(); toast('اتغيّر PIN المالك');
    });
  });
  function saveCfgField(label,fn){
    if(!isOwner()) return;
    fn(); secSave();
    logA('cfg','غيّر إعداد: '+label);
    toast('اتحفظ الإعداد');
  }
  $('#sc-inv').addEventListener('change',function(){ saveCfgField('الكاشير يحتاج موافقة المالك للفواتير = '+($('#sc-inv').checked ? 'أيوه' : 'لأ'),function(){ sec.cfg.pinInv = $('#sc-inv').checked; }); });
  $('#sc-stock').addEventListener('change',function(){ saveCfgField('الكاشير يحتاج موافقة المالك للأصناف = '+($('#sc-stock').checked ? 'أيوه' : 'لأ'),function(){ sec.cfg.pinStock = $('#sc-stock').checked; }); });
  $('#sc-auto').addEventListener('change',function(){ saveCfgField('القفل التلقائي = '+$('#sc-auto').value+' دقيقة',function(){ sec.cfg.autoLock = +$('#sc-auto').value; }); });
  $('#sc-phone').addEventListener('change',function(){ saveCfgField('رقم واتساب المالك',function(){ sec.cfg.phone = $('#sc-phone').value.replace(/\D/g,''); }); });

  $('#au-go').addEventListener('click',doAuth);
  ['au-pin','au-pin2','au-cpw'].forEach(function(id){ $('#'+id).addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); doAuth(); } }); });
  $('#au-forgot').addEventListener('click',function(){ showAuth('recover'); });
  $('#au-back').addEventListener('click',function(){ showAuth('login'); });
  $('#ap-ok').addEventListener('click',doApprove);
  $('#ap-no').addEventListener('click',closeApprove);
  $('#ap-pin').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); doApprove(); } });