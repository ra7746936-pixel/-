/* مخزني - الجزء 1 من 3 (UTF-8، جنب index.html) */
  document.documentElement.setAttribute('dir','rtl');
  var $ = function(s){ return document.querySelector(s); };
  var esc = function(s){ return String(s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var fmt = function(n){ return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2}); };
  var money = function(n){ return fmt(n)+' ج.م'; };
  var round = function(n){ return Math.round(n*1000)/1000; };
  var uid = function(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); };
  var byName = function(a,b){ return a.name.localeCompare(b.name,'ar'); };
  var LOW = 5;

  var products = new Map();
  var suppliers = new Map();
  var selSup = null;
  var pendingEntry = null, entryTimer = null, pendingSup = null, supTimer = null;
  var lastOpts = '';
  var sales = [];
  var cart = {};
  var view = 'sell';
  var period = 'today';
  var editingId = null;
  var pendingDel = null, delTimer = null;
  var mode = 'pending';
  var db = null;
  var LICENSE_KEY_JWK = window.LICENSE_PUBLIC_KEY || '';
  var CONTACT = window.CONTACT_TEXT || '';
  var locked = !!LICENSE_KEY_JWK;
  var lic = null;
  var editSale = null, draft = [], pendingCancelInv = false, cancelInvTimer = null, lastIeOpts = '';
  var editEnt = null, lastRtOpts = '';
  var invSeq = 0;
  var lastSaleId = null, shopCfg = {name:'',foot:'',w:'80'};

  /* ---------- حفظ ---------- */
  var LS_KEY = 'makhzani-v1';
  function lsLoad(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        var d = JSON.parse(raw);
        (d.products||[]).forEach(function(p){ products.set(p.id,p); });
        sales = d.sales||[];
        (d.suppliers||[]).forEach(function(s){ suppliers.set(s.id,s); });
        invSeq = +d.seq||0;
      }
    }catch(e){}
    numberSales();
  }
  /* ترقيم الفواتير: 1,2,3… بالترتيب. الفواتير القديمة بتاخد رقم حسب وقتها، والعدّاد عمره ما بيرجع لورا */
  function numberSales(){
    var mx = invSeq;
    sales.forEach(function(s){ if(s.no>mx) mx = s.no; });
    sales.filter(function(s){ return !(s.no>0); }).sort(function(a,b){ return a.ts-b.ts; }).forEach(function(s){ s.no = ++mx; });
    invSeq = mx;
  }
  function lsSave(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({products:Array.from(products.values()),sales:sales,suppliers:Array.from(suppliers.values()),seq:invSeq})); }catch(e){}
  }
  var chain = Promise.resolve();
  function enqueue(fn){
    chain = chain.then(fn).catch(function(e){ toast('الحفظ ماتمش: '+((e&&e.message)||'جرب تاني'),true); });
    return chain;
  }
  function persist(dbFn){
    if(mode==='db' || mode==='cloud') enqueue(dbFn); else if(mode==='local') lsSave();
    render();
  }
  function ready(){
    if(locked){ toast('التطبيق مقفول. فعّله الأول.',true); return false; }
    if(!sess){ toast('سجّل الدخول الأول',true); return false; }
    if(mode==='pending'){ toast('استنى ثواني لحد ما البيانات تتحمّل',true); return false; }
    return true;
  }
  /* كتابة صنف: في السحابة بنبعت الفرق في الكمية مش الكمية نفسها، عشان بيع جهاز تاني في نفس اللحظة ما يتمسحش */
  function prodWrite(u,old){
    if(mode!=='cloud' || !old) return db.doc('products/'+u.id).set(u);
    var rest = Object.assign({},u); delete rest.qty; delete rest.sold; delete rest.revenue;
    var d = {}, f = {qty:1,sold:1,revenue:1};
    Object.keys(f).forEach(function(k){ var x = round((+u[k]||0)-(+old[k]||0)); if(x) d[k] = x; });
    return db.upd('products/'+u.id,rest,d);
  }
  /* كتابة مورد: الحركات الجديدة بتتضاف لوحدها، وأي تعديل أو حذف بيكتب المورد كله */
  function supWrite(s,old){
    if(mode!=='cloud' || !old) return db.doc('suppliers/'+s.id).set(s);
    var oe = old.entries||[], ne = s.entries||[], oid = {}, nid = {};
    oe.forEach(function(e){ oid[e.id] = e; }); ne.forEach(function(e){ nid[e.id] = 1; });
    var removed = oe.some(function(e){ return !nid[e.id]; });
    var changed = ne.some(function(e){ return oid[e.id] && JSON.stringify(e)!==JSON.stringify(oid[e.id]); });
    if(removed || changed) return db.doc('suppliers/'+s.id).set(s);
    var added = ne.filter(function(e){ return !oid[e.id]; });
    var rest = Object.assign({},s); delete rest.entries;
    return db.upd('suppliers/'+s.id,rest,null,added.length ? {entries:added} : null);
  }
  function putProduct(p){
    var old = products.get(p.id);
    products.set(p.id,p);
    persist(function(){ return prodWrite(p,old); });
  }
  function removeProduct(id){
    products.delete(id);
    persist(function(){ return db.doc('products/'+id).delete(); });
  }
  function recordSale(sale,updated){
    updated.forEach(function(p){ products.set(p.id,p); });
    sales.unshift(sale);
    var cloud = (mode==='cloud');
    persist(function(){
      if(cloud){
        /* في السحابة المخزون بيتعدّل بالنقص مش بقيمة جديدة، عشان جهازين يبيعوا مع بعض والكمية تطلع صح */
        sale.lines.forEach(function(l){ db.inc('products/'+l.pid,{qty:-l.qty,sold:l.qty,revenue:round(l.qty*l.price)}); });
        return db.doc('sales/'+sale.id).set(sale);
      }
      var ch = Promise.resolve();
      updated.forEach(function(u){ ch = ch.then(function(){ return db.doc('products/'+u.id).set(u); }); });
      return ch.then(function(){ return db.doc('sales/'+sale.id).set(sale); });
    });
  }

  function putSupplier(s){
    var old = suppliers.get(s.id);
    suppliers.set(s.id,s);
    persist(function(){ return supWrite(s,old); });
  }
  function removeSupplier(id){
    suppliers.delete(id);
    persist(function(){ return db.doc('suppliers/'+id).delete(); });
  }
  function commit(prods,sup){
    var olds = prods.map(function(p){ return products.get(p.id); }), oldSup = suppliers.get(sup.id);
    prods.forEach(function(p){ products.set(p.id,p); });
    suppliers.set(sup.id,sup);
    persist(function(){
      var ch = Promise.resolve();
      prods.forEach(function(u,i){ ch = ch.then(function(){ return prodWrite(u,olds[i]); }); });
      return ch.then(function(){ return supWrite(sup,oldSup); });
    });
  }

  /* ---------- رسالة سريعة ---------- */
  var tt;
  function toast(msg,bad){
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show'+(bad?' bad':'');
    clearTimeout(tt);
    tt = setTimeout(function(){ el.className='toast'; },2600);
  }

  /* ---------- رسم ---------- */
  function render(){ renderStatus(); renderTabs(); renderSell(); renderStock(); renderSup(); renderReport(); renderInvEdit(); renderBackup(); renderMine(); renderSec(); renderRoleUI(); if(typeof renderCloudInfo==='function') renderCloudInfo(); }

  function renderStatus(){
    var el = $('#sync');
    if(mode==='db'){ el.textContent='محفوظ ومتزامن'; el.className='chip db'; }
    else if(mode==='cloud'){
      var on = (navigator.onLine!==false);
      var pn = window.FB_PEND||0, ver = ' · '+(window.APP_VER||'قديمة');
      el.textContent = !on ? 'أوفلاين: هيتزامن لما النت يرجع'+ver : pn>0 ? 'بيتبعت للسيرفر ('+pn+')…'+ver : 'متزامن مع السحابة'+ver;
      el.className = (on && !pn) ? 'chip db' : 'chip local';
    }
    else if(mode==='local'){ el.textContent='محفوظ على الجهاز ده بس'; el.className='chip local'; }
    else { el.textContent='بيحمّل…'; el.className='chip'; }
  }

  function renderTabs(){
    if(!tabAllowed(view)) view = 'sell';
    ['sell','stock','sup','report','sec'].forEach(function(v){
      $('#v-'+v).hidden = (v!==view);
      $('#t-'+v).setAttribute('aria-selected', v===view ? 'true':'false');
      $('#t-'+v).hidden = !tabAllowed(v);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-period]'),function(b){
      b.setAttribute('aria-pressed', b.dataset.period===period ? 'true':'false');
    });
  }

  function cleanCart(){
    Object.keys(cart).forEach(function(id){
      var p = products.get(id);
      if(!p || p.qty<=0){ delete cart[id]; return; }
      if(cart[id]>p.qty) cart[id]=p.qty;
      if(!(cart[id]>0)) delete cart[id];
    });
  }

  function renderSell(){
    var q = ($('#q').value||'').trim().toLowerCase();
    var list = Array.from(products.values()).filter(function(p){ return !q || p.name.toLowerCase().indexOf(q)>=0 || (p.barcode && String(p.barcode).toLowerCase().indexOf(q)>=0); }).sort(byName);
    $('#plist').innerHTML = list.length ? list.map(function(p){
      return '<li><button type="button" class="prow" data-act="add" data-id="'+esc(p.id)+'"'+(p.qty<=0?' disabled':'')+'>'+
        '<span class="pname">'+esc(p.name)+'</span>'+
        '<span class="pmeta">'+money(p.price)+' · '+(p.qty<=0?'خلص':'فاضل '+fmt(p.qty))+'</span>'+
        '<span class="padd" aria-hidden="true">+</span></button></li>';
    }).join('') : '<li class="note">'+(products.size ? 'مفيش صنف بالاسم ده.' : 'لسه مفيش أصناف. افتح «المخزن» وضيف أول صنف.')+'</li>';

    cleanCart();
    var ids = Object.keys(cart), total = 0;
    $('#cart').innerHTML = ids.length ? ids.map(function(id){
      var p = products.get(id), q2 = cart[id], sub = q2*p.price; total += sub;
      return '<li class="cline"><div class="cl-name">'+esc(p.name)+'<small>'+fmt(p.price)+' × '+fmt(q2)+' = '+money(sub)+'</small></div>'+
        '<div class="step"><button type="button" data-act="dec" data-id="'+esc(id)+'" aria-label="نقّص">−</button>'+
        '<input type="number" inputmode="decimal" min="0" step="any" value="'+q2+'" data-qty="'+esc(id)+'" aria-label="الكمية">'+
        '<button type="button" data-act="inc" data-id="'+esc(id)+'" aria-label="زوّد">+</button></div>'+
        '<button type="button" class="rm" data-act="rm" data-id="'+esc(id)+'" aria-label="شيل من الفاتورة">×</button></li>';
    }).join('') : '<li class="note">اضغط على الأصناف اللي عايز تبيعها.</li>';
    $('#total').textContent = money(total);
    $('#checkout').disabled = !ids.length;
    var ls = lastSaleId ? findSale(lastSaleId) : null;
    $('#last-sale').hidden = !ls;
    if(ls){ $('#ls-txt').textContent = 'آخر فاتورة '+invCode(ls)+': '+money(ls.total); $('#last-sale button').setAttribute('data-sid',ls.id); }
  }

  function statusOf(p){
    if(p.qty<=0) return '<span class="pill bad">خلص</span>';
    if(p.qty<=LOW) return '<span class="pill warn">قرب يخلص</span>';
    return '<span class="pill ok">متوفر</span>';
  }

  function renderStock(){
    var list = Array.from(products.values()).sort(byName);
    var box = $('#slist');
    if(!list.length){
      box.innerHTML = '<li class="empty"><p>لسه مفيش أصناف في المخزن.</p><div class="row">'+
        '<button type="button" class="btn primary" data-act="focusform">ضيف أول صنف</button>'+
        '<button type="button" class="btn" data-act="seed">جرّب بأصناف تجريبية</button></div></li>';
      return;
    }
    box.innerHTML = list.map(function(p){
      var del = pendingDel===p.id;
      return '<li class="item"><div class="item-head"><strong>'+esc(p.name)+'</strong>'+statusOf(p)+'</div>'+(p.cost!=null && isOwner()?'<div class="pmeta">سعر الجملة: '+money(p.cost)+'</div>':'')+(p.barcode?'<div class="pmeta">باركود: '+esc(p.barcode)+'</div>':'')+
        '<dl class="stats"><div><dt>السعر</dt><dd>'+money(p.price)+'</dd></div>'+
        '<div><dt>اتباع</dt><dd>'+fmt(p.sold)+'</dd></div>'+
        '<div><dt>فاضل</dt><dd>'+fmt(p.qty)+'</dd></div></dl>'+
        '<div class="item-actions">'+
        '<form class="restock" data-id="'+esc(p.id)+'"><input name="n" type="number" inputmode="decimal" min="0" step="any" placeholder="كمية جديدة" aria-label="كمية التوريد لـ '+esc(p.name)+'"><button class="btn" type="submit">+ توريد</button></form>'+
        '<button type="button" class="btn" data-act="edit" data-id="'+esc(p.id)+'">تعديل</button>'+
        '<button type="button" class="btn danger" data-act="del" data-id="'+esc(p.id)+'">'+(del?'متأكد؟ اضغط تاني':'حذف')+'</button>'+
        '</div></li>';
    }).join('');
  }

  function periodRows(){
    var t0 = new Date(); t0.setHours(0,0,0,0); t0 = t0.getTime();
    var rows = new Map(), invoices = 0;
    if(period==='today'){
      sales.filter(function(s){ return s.ts>=t0; }).forEach(function(s){
        invoices++;
        s.lines.forEach(function(l){
          var r = rows.get(l.pid) || {name:l.name,sold:0,rev:0};
          r.sold += l.qty; r.rev += l.qty*l.price; rows.set(l.pid,r);
        });
      });
    } else {
      products.forEach(function(p){ rows.set(p.id,{name:p.name,sold:p.sold||0,rev:p.revenue||0}); });
    }
    products.forEach(function(p){ if(!rows.has(p.id)) rows.set(p.id,{name:p.name,sold:0,rev:0}); });
    var out = [];
    rows.forEach(function(r,pid){ var p = products.get(pid); out.push({name:r.name,sold:r.sold,rev:r.rev,left:p?p.qty:null}); });
    out.sort(function(a,b){ return (b.sold-a.sold) || a.name.localeCompare(b.name,'ar'); });
    return {rows:out,invoices:invoices,t0:t0};
  }

  function profitFor(list){
    var profit = 0, unknown = 0;
    list.forEach(function(s){
      s.lines.forEach(function(l){
        if(l.cost==null || !isFinite(+l.cost)) unknown++;
        else profit += (l.price-l.cost)*l.qty;
      });
    });
    return {profit:round(profit),unknown:unknown};
  }

  function renderReport(){
    var r = periodRows();
    var rev = 0, pcs = 0, stockVal = 0;
    r.rows.forEach(function(x){ rev += x.rev; pcs += x.sold; });
    products.forEach(function(p){ stockVal += p.qty*p.price; });
    var pr = profitFor(sales.filter(function(s){ return period==='all' || s.ts>=r.t0; }));
    var owed = 0;
    suppliers.forEach(function(s){ var b = supStats(s).bal; if(b>0) owed += b; });
    $('#tiles').innerHTML =
      '<div class="tile"><span>مبيعات '+(period==='today'?'النهارده':'من الأول')+'</span><strong>'+money(rev)+'</strong>'+(period==='today'?'<small>'+fmt(r.invoices)+' فاتورة</small>':'')+'</div>'+
      '<div class="tile"><span>صافي الربح '+(period==='today'?'النهارده':'من الأول')+'</span><strong>'+money(pr.profit)+'</strong><small>'+(pr.unknown ? 'من غير '+fmt(pr.unknown)+' سطر مفيهوش سعر جملة' : 'الإيراد − سعر الجملة')+'</small></div>'+
      '<div class="tile"><span>قطع اتباعت</span><strong>'+fmt(pcs)+'</strong></div>'+
      '<div class="tile"><span>قيمة اللي فاضل في المخزن</span><strong>'+money(stockVal)+'</strong></div>'+
      '<div class="tile"><span>مستحق للموردين</span><strong>'+money(owed)+'</strong></div>';
    $('#rtable').innerHTML = r.rows.length ? r.rows.map(function(x){
      return '<tr><td>'+esc(x.name)+'</td><td class="n">'+fmt(x.sold)+'</td><td class="n">'+(x.left===null?'—':fmt(x.left))+'</td><td class="n">'+money(x.rev)+'</td></tr>';
    }).join('') : '<tr><td colspan="4" class="note">مفيش أصناف لسه.</td></tr>';
    var recent = sales.filter(function(s){ return period==='all' || s.ts>=r.t0; }).slice(0,15);
    $('#recent').innerHTML = recent.length ? recent.map(function(s){
      var when = dt(s.ts);
      var tag = (s.edits && s.edits.length) ? '<span class="pill warn">اتعدّلت</span>' : '';
      return '<li><span class="when">'+esc(invCode(s))+' · '+when+'</span><span class="what">'+s.lines.map(function(l){ return esc(l.name)+' ×'+fmt(l.qty); }).join('، ')+'</span><span class="sum">'+money(s.total)+'</span>'+
        '<div class="inv-act"><button type="button" class="btn sm" data-act="editinv" data-sid="'+esc(s.id)+'">مرتجع / تعديل</button><button type="button" class="btn sm" data-act="print" data-sid="'+esc(s.id)+'">اطبع</button>'+tag+'</div></li>';
    }).join('') : '<li class="note">مفيش فواتير في الفترة دي.</li>';
  }