/* مخزني - الجزء 2 من 3 (UTF-8، جنب index.html) */
  /* ---------- مرتجعات وتعديل الفواتير ---------- */
  function findSale(id){ for(var i=0;i<sales.length;i++){ if(sales[i].id===id) return sales[i]; } return null; }
  function maxFor(d){ var p = products.get(d.pid); return round(d.orig + (p ? p.qty : 0)); }
  function draftTotal(){ var t = 0; draft.forEach(function(d){ t += d.qty*d.price; }); return round(t); }

  function openInvEdit(sid){
    var s = findSale(sid);
    if(!s) return;
    editSale = sid; pendingCancelInv = false;
    draft = s.lines.map(function(l){ return {pid:l.pid,name:l.name,price:l.price,cost:(l.cost==null?null:l.cost),qty:l.qty,orig:l.qty}; });
    render();
    var el = $('#inv-edit'); if(el.scrollIntoView) el.scrollIntoView({block:'start'});
  }
  function closeInvEdit(){ editSale = null; draft = []; pendingCancelInv = false; clearTimeout(cancelInvTimer); render(); }

  function renderInvEdit(){
    var box = $('#inv-edit'), s = editSale ? findSale(editSale) : null;
    if(editSale && !s){ editSale = null; draft = []; }
    box.hidden = !s;
    if(!s) return;
    $('#ie-title').textContent = 'تعديل فاتورة '+invCode(s)+' · '+dt(s.ts);
    $('#ie-hint').textContent = 'الفاتورة الأصلية '+money(s.total)+'. نقّص الكمية = مرتجع بيرجع للمخزن. زوّد أو ضيف صنف = بيتخصم من المخزن.';
    $('#ie-lines').innerHTML = draft.map(function(d,i){
      var note = d.qty===0 ? 'هيتشال من الفاتورة ويرجع للمخزن' : (d.orig>0 ? 'كان '+fmt(d.orig)+' · ' : 'صنف جديد · ')+fmt(d.price)+' × '+fmt(d.qty)+' = '+money(d.qty*d.price);
      if(!products.get(d.pid)) note += ' · الصنف اتمسح من المخزن';
      return '<li class="cline"><div class="cl-name">'+esc(d.name)+'<small>'+note+'</small></div>'+
        '<div class="step"><button type="button" data-act="ie-dec" data-i="'+i+'" aria-label="نقّص">−</button>'+
        '<input type="number" inputmode="decimal" min="0" step="any" value="'+d.qty+'" data-iqty="'+i+'" aria-label="الكمية">'+
        '<button type="button" data-act="ie-inc" data-i="'+i+'" aria-label="زوّد">+</button></div>'+
        '<button type="button" class="rm" data-act="ie-rm" data-i="'+i+'" aria-label="شيل الصنف">×</button></li>';
    }).join('');
    var opts = '<option value="">ضيف صنف تاني…</option>'+Array.from(products.values()).sort(byName).map(function(p){
      return '<option value="'+esc(p.id)+'">'+esc(p.name)+' (فاضل '+fmt(p.qty)+')</option>';
    }).join('');
    if(opts!==lastIeOpts){ var sel = $('#ie-add'), cur = sel.value; sel.innerHTML = opts; if(cur) sel.value = cur; lastIeOpts = opts; }
    var tot = draftTotal(), diff = round(tot - s.total);
    $('#ie-total').textContent = money(tot);
    $('#ie-diff').textContent = diff<0 ? 'ترجّع للعميل '+money(-diff) : diff>0 ? 'العميل يدفع فرق '+money(diff) : 'مفيش فرق في المبلغ';
    $('#ie-cancel').textContent = pendingCancelInv ? 'متأكد؟ اضغط تاني' : 'إلغاء الفاتورة كلها (مرتجع كامل)';
  }

  function applySaleChange(ns,prods,delId){
    var olds = prods.map(function(p){ return products.get(p.id); });
    prods.forEach(function(p){ products.set(p.id,p); });
    if(ns) sales = sales.map(function(x){ return x.id===ns.id ? ns : x; });
    else sales = sales.filter(function(x){ return x.id!==delId; });
    persist(function(){
      var ch = Promise.resolve();
      prods.forEach(function(u,i){ ch = ch.then(function(){ return prodWrite(u,olds[i]); }); });
      return ch.then(function(){ return ns ? db.doc('sales/'+ns.id).set(ns) : db.doc('sales/'+delId).delete(); });
    });
  }

  function saveInvEdit(ok){
    if(!ready()) return;
    var s = findSale(editSale);
    if(!s) return;
    if(!ok && needApproval('inv')){ askOwner('تعديل فاتورة '+invCode(s),function(){ saveInvEdit(true); }); return; }
    var kept = draft.filter(function(d){ return d.qty>0; });
    if(!kept.length){ toast('مفيش أصناف في الفاتورة. لو عايز تلغيها كلها اضغط «إلغاء الفاتورة».',true); return; }
    var upd = new Map(), bad = null;
    draft.forEach(function(d){
      var delta = round(d.qty-d.orig);
      if(!delta) return;
      var p = upd.get(d.pid) || products.get(d.pid);
      if(!p){ if(delta>0) bad = d; return; }
      var nq = round(p.qty-delta);
      if(nq<0){ bad = d; return; }
      upd.set(d.pid,Object.assign({},p,{qty:nq,sold:Math.max(0,round((p.sold||0)+delta)),revenue:Math.max(0,round((p.revenue||0)+delta*d.price))}));
    });
    if(bad){ toast('المتاح من '+bad.name+' مش كفاية',true); return; }
    var total = draftTotal(), diff = round(total-s.total);
    var ns = Object.assign({},s,{
      lines:kept.map(function(d){ return {pid:d.pid,name:d.name,qty:d.qty,price:d.price,cost:d.cost}; }),
      total:total,
      edits:(s.edits||[]).concat([{ts:Date.now(),from:s.total,to:total,by:(sess?sess.name:'')}])
    });
    var chg = draft.filter(function(d){ return d.qty!==d.orig; }).map(function(d){ return d.name+': '+fmt(d.orig)+'←'+fmt(d.qty); }).join('، ');
    logA('edit','تعديل فاتورة '+invCode(s)+' من '+money(s.total)+' إلى '+money(total)+' ('+chg+')'+(s.by ? ' — البائع: '+s.by.name : ''),{id:s.id,from:s.total,to:total});
    applySaleChange(ns,Array.from(upd.values()));
    closeInvEdit();
    toast(diff<0 ? 'اتعدّلت الفاتورة. ترجّع للعميل '+money(-diff) : diff>0 ? 'اتعدّلت الفاتورة. العميل يدفع فرق '+money(diff) : 'اتعدّلت الفاتورة');
  }

  function cancelInvoice(ok){
    var s = findSale(editSale);
    if(!s) return;
    if(!ok){
      if(!pendingCancelInv){
        pendingCancelInv = true; clearTimeout(cancelInvTimer);
        cancelInvTimer = setTimeout(function(){ pendingCancelInv = false; renderInvEdit(); },3000);
        renderInvEdit(); return;
      }
      clearTimeout(cancelInvTimer); pendingCancelInv = false;
    }
    if(!ready()) return;
    if(!ok && needApproval('inv')){ askOwner('إلغاء فاتورة '+invCode(s)+' بقيمة '+money(s.total),function(){ cancelInvoice(true); }); return; }
    var upd = [];
    s.lines.forEach(function(l){
      var p = products.get(l.pid);
      if(p) upd.push(Object.assign({},p,{qty:round(p.qty+l.qty),sold:Math.max(0,round((p.sold||0)-l.qty)),revenue:Math.max(0,round((p.revenue||0)-l.qty*l.price))}));
    });
    logA('cancel','إلغاء فاتورة '+invCode(s)+' بقيمة '+money(s.total)+': '+linesText(s.lines)+(s.by ? ' — البائع: '+s.by.name : ''),{id:s.id,total:s.total});
    applySaleChange(null,upd,s.id);
    var t = s.total;
    closeInvEdit();
    toast('اتلغت الفاتورة. ترجّع للعميل '+money(t));
  }

  /* ---------- الموردين ---------- */
  function supStats(s){
    var bought = 0, paid = 0, ret = 0;
    (s.entries||[]).forEach(function(e){
      if(e.type==='purchase'){ bought += e.total; paid += (e.paid||0); }
      else if(e.type==='return'){ ret += e.total; }
      else paid += e.amount;
    });
    return {bought:round(bought),paid:round(paid),ret:round(ret),bal:round(bought-paid-ret)};
  }
  function balLabel(bal){
    if(bal>0) return ['له عندي '+money(bal),'warn'];
    if(bal<0) return ['ليا عنده '+money(-bal),'ok'];
    return ['متسوّي','zero'];
  }
  function dt(ts){
    var d = new Date(ts), z = function(n){ n = String(n); return n.length<2 ? '0'+n : n; };
    return z(d.getDate())+'/'+z(d.getMonth()+1)+'/'+d.getFullYear()+' '+z(d.getHours())+':'+z(d.getMinutes());
  }

  function renderSup(){
    var s = selSup ? suppliers.get(selSup) : null;
    if(selSup && !s) selSup = null;
    $('#sup-list-view').hidden = !!s;
    $('#sup-detail').hidden = !s;

    var list = Array.from(suppliers.values()).sort(byName);
    $('#suplist').innerHTML = list.length ? list.map(function(x){
      var b = balLabel(supStats(x).bal);
      return '<li class="item"><button type="button" class="sup-row" data-act="opensup" data-id="'+esc(x.id)+'">'+
        '<span class="sup-main"><strong>'+esc(x.name)+'</strong>'+(x.phone?'<span class="pmeta">'+esc(x.phone)+'</span>':'')+'</span>'+
        '<span class="pill '+b[1]+'">'+b[0]+'</span></button></li>';
    }).join('') : '<li class="note">لسه ماسجلتش موردين. ضيف أول مورد من فوق.</li>';
    if(!s) return;

    var st = supStats(s), b = balLabel(st.bal);
    $('#sd-name').textContent = s.name;
    $('#sd-phone').textContent = s.phone ? 'تليفون: '+s.phone : '';
    $('#sd-pill').textContent = b[0];
    $('#sd-pill').className = 'pill '+b[1];
    $('#sd-del').textContent = pendingSup===s.id ? 'متأكد؟ اضغط تاني' : 'حذف المورد';
    $('#sd-tiles').innerHTML =
      '<div class="tile"><span>إجمالي البضاعة منه</span><strong>'+money(st.bought)+'</strong></div>'+
      '<div class="tile"><span>اللي دفعته</span><strong>'+money(st.paid)+'</strong></div>'+
      (st.ret>0?'<div class="tile"><span>مرتجعات رجّعتها له</span><strong>'+money(st.ret)+'</strong></div>':'')+
      '<div class="tile"><span>'+(st.bal<0?'ليا عنده':'الباقي له عندي')+'</span><strong>'+money(Math.abs(st.bal))+'</strong></div>';

    var opts = '<option value="">اختار الصنف…</option>'+
      Array.from(products.values()).sort(byName).map(function(p){ return '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>'; }).join('')+
      '<option value="__new">+ صنف جديد</option>';
    if(opts!==lastOpts){
      var sel = $('#pu-prod'), cur = sel.value;
      sel.innerHTML = opts;
      if(cur) sel.value = cur;
      lastOpts = opts;
    }
    $('#pu-new').hidden = ($('#pu-prod').value!=='__new');
    var ropts = '<option value="">اختار الصنف…</option>'+
      Array.from(products.values()).sort(byName).map(function(p){ return '<option value="'+esc(p.id)+'">'+esc(p.name)+' (فاضل '+fmt(p.qty)+')</option>'; }).join('');
    if(ropts!==lastRtOpts){
      var rsel = $('#rt-prod'), rcur = rsel.value;
      rsel.innerHTML = ropts;
      if(rcur) rsel.value = rcur;
      lastRtOpts = ropts;
    }
    renderEntEdit(s);

    var entries = s.entries||[];
    $('#sd-ledger').innerHTML = entries.length ? entries.map(function(e){
      var del = pendingEntry===e.id;
      var btn = '<div class="lg-btns"><button type="button" class="btn sm" data-act="editent" data-eid="'+esc(e.id)+'">تعديل</button>'+
        '<button type="button" class="btn danger sm" data-act="delentry" data-eid="'+esc(e.id)+'">'+(del?'متأكد؟ اضغط تاني':'إلغاء')+'</button></div>';
      var tag = e.edited ? ' <span class="pill warn">اتعدّلت</span>' : '';
      if(e.type==='purchase'){
        return '<li class="ledger-row"><div class="lg-main"><strong>بضاعة: '+esc(e.name)+' × '+fmt(e.qty)+tag+'</strong>'+
          '<span class="pmeta">سعر الوحدة '+money(e.cost)+' = '+money(e.total)+' · دفعت '+money(e.paid)+'</span>'+
          '<span class="when">'+dt(e.ts)+'</span></div>'+btn+'</li>';
      }
      if(e.type==='return'){
        return '<li class="ledger-row"><div class="lg-main"><strong>مرتجع: '+esc(e.name)+' × '+fmt(e.qty)+tag+'</strong>'+
          '<span class="pmeta">سعر الوحدة '+money(e.cost)+' = '+money(e.total)+' · اتخصم من حسابك</span>'+
          (e.note?'<span class="pmeta">'+esc(e.note)+'</span>':'')+'<span class="when">'+dt(e.ts)+'</span></div>'+btn+'</li>';
      }
      return '<li class="ledger-row"><div class="lg-main"><strong>دفعة '+money(e.amount)+tag+'</strong>'+
        (e.note?'<span class="pmeta">'+esc(e.note)+'</span>':'')+'<span class="when">'+dt(e.ts)+'</span></div>'+btn+'</li>';
    }).join('') : '<li class="note">مفيش حركات لسه.</li>';
  }

  function updatePuTotal(){
    var q = parseFloat($('#pu-qty').value), c = parseFloat($('#pu-cost').value);
    $('#pu-total').textContent = 'إجمالي البضاعة: '+money((q>0&&c>=0)?q*c:0);
  }

  /* ---------- مرتجعات الموردين وتعديل الحركات ---------- */
  function findEntry(s,eid){ var a = s.entries||[]; for(var i=0;i<a.length;i++){ if(a[i].id===eid) return a[i]; } return null; }
  function setEeFields(type){
    $('#ee-f-qty').hidden = (type==='payment');
    $('#ee-f-cost').hidden = (type==='payment');
    $('#ee-f-paid').hidden = (type!=='purchase');
    $('#ee-f-amount').hidden = (type!=='payment');
    $('#ee-f-note').hidden = (type==='purchase');
  }
  function openEntEdit(eid){
    var s = selSup ? suppliers.get(selSup) : null;
    var e = s ? findEntry(s,eid) : null;
    if(!e) return;
    editEnt = eid; pendingEntry = null;
    setEeFields(e.type);
    $('#ee-qty').value = (e.qty==null?'':e.qty);
    $('#ee-cost').value = (e.cost==null?'':e.cost);
    $('#ee-paid').value = (e.paid==null?'':e.paid);
    $('#ee-amount').value = (e.amount==null?'':e.amount);
    $('#ee-note').value = e.note||'';
    renderSup(); updateEeSum();
    var el = $('#ent-edit'); if(el.scrollIntoView) el.scrollIntoView({block:'start'});
  }
  function closeEntEdit(){ editEnt = null; renderSup(); }
  function renderEntEdit(s){
    var e = (editEnt && s) ? findEntry(s,editEnt) : null;
    if(editEnt && !e) editEnt = null;
    $('#ent-edit').hidden = !e;
    if(!e) return;
    setEeFields(e.type);
    $('#ee-title').textContent = e.type==='purchase' ? 'تعديل بضاعة: '+e.name : e.type==='return' ? 'تعديل مرتجع: '+e.name : 'تعديل دفعة';
    $('#ee-hint').textContent = e.type==='purchase' ? 'تغيير الكمية بيزوّد أو ينقّص المخزن بالفرق. لو اتباع من الكمية دي مش هينفع تنقّصها لأقل من اللي اتباع.'
      : e.type==='return' ? 'تغيير الكمية المرتجعة بيعدّل المخزن بالفرق.' : 'عدّل المبلغ أو الملاحظة.';
  }
  function updateEeSum(){
    var s = selSup ? suppliers.get(selSup) : null, e = (s && editEnt) ? findEntry(s,editEnt) : null;
    if(!e) return;
    var q = parseFloat($('#ee-qty').value), c = parseFloat($('#ee-cost').value);
    if(e.type==='payment') { $('#ee-sum').textContent = ''; return; }
    var t = (q>0&&c>=0) ? round(q*c) : 0;
    $('#ee-sum').textContent = (e.type==='purchase' ? 'إجمالي البضاعة: ' : 'قيمة المرتجع: ')+money(t)+' (كان '+money(e.total)+')';
  }
  function saveEntEdit(){
    if(!ready()) return;
    var s = selSup ? suppliers.get(selSup) : null, e = (s && editEnt) ? findEntry(s,editEnt) : null;
    if(!e) return;
    var upd = [], ne;
    if(e.type==='payment'){
      var amt = parseFloat($('#ee-amount').value);
      if(!(amt>0)){ toast('اكتب المبلغ',true); return; }
      ne = Object.assign({},e,{amount:round(amt),note:$('#ee-note').value.trim(),edited:true});
    } else {
      var qty = parseFloat($('#ee-qty').value), cost = parseFloat($('#ee-cost').value);
      if(!(qty>0)){ toast('اكتب الكمية',true); $('#ee-qty').focus(); return; }
      if(!(cost>=0)){ toast('اكتب سعر الوحدة',true); $('#ee-cost').focus(); return; }
      var delta = round(qty-e.qty), pr = products.get(e.pid);
      if(e.type==='purchase'){
        var paidRaw = $('#ee-paid').value, paid = paidRaw==='' ? 0 : parseFloat(paidRaw);
        if(!(paid>=0)){ toast('المبلغ المدفوع غلط',true); return; }
        if(pr){
          var nq = round(pr.qty+delta);
          if(nq<0){ toast('مينفعش. اتباع من الصنف ده، فاضل '+fmt(pr.qty)+' بس والتنقيص أكبر.',true); return; }
          var latest = null; (s.entries||[]).forEach(function(x){ if(!latest && x.type==='purchase' && x.pid===e.pid) latest = x; });
          var np = Object.assign({},pr,{qty:nq});
          if(latest && latest.id===e.id) np.cost = round(cost);
          upd.push(np);
        }
        ne = Object.assign({},e,{qty:round(qty),cost:round(cost),total:round(qty*cost),paid:round(paid),edited:true});
      } else {
        if(pr){
          var nq2 = round(pr.qty-delta);
          if(nq2<0){ toast('الفاضل من '+pr.name+' '+fmt(pr.qty)+' بس. مينفعش ترجّع أكتر.',true); return; }
          upd.push(Object.assign({},pr,{qty:nq2}));
        } else if(delta>0){ toast('الصنف ده اتمسح من المخزن، مينفعش تزوّد المرتجع.',true); return; }
        ne = Object.assign({},e,{qty:round(qty),cost:round(cost),total:round(qty*cost),note:$('#ee-note').value.trim(),edited:true});
      }
    }
    logA('entedit','تعديل حركة عند المورد '+s.name+': '+(e.type==='purchase' ? 'بضاعة '+e.name : e.type==='return' ? 'مرتجع '+e.name : 'دفعة')+' — '+(e.type==='payment' ? money(e.amount)+'←'+money(ne.amount) : fmt(e.qty)+'×'+money(e.cost)+'←'+fmt(ne.qty)+'×'+money(ne.cost)));
    commit(upd,Object.assign({},s,{entries:s.entries.map(function(x){ return x.id===e.id ? ne : x; })}));
    editEnt = null; renderSup();
    toast('اتعدّلت الحركة');
  }

  function updateRtTotal(){
    var q = parseFloat($('#rt-qty').value), c = parseFloat($('#rt-cost').value);
    $('#rt-total').textContent = 'قيمة المرتجع: '+money((q>0&&c>=0)?q*c:0);
  }

  /* ---------- الطباعة ---------- */
  function loadShopCfg(){
    try{ var r = localStorage.getItem('makhzani-print'); if(r) shopCfg = Object.assign(shopCfg,JSON.parse(r)); }catch(e){}
    $('#ps-name').value = shopCfg.name||''; $('#ps-foot').value = shopCfg.foot||''; $('#ps-w').value = shopCfg.w==='58' ? '58' : '80';
  }
  function saveShopCfg(){
    shopCfg = {name:$('#ps-name').value.trim(),foot:$('#ps-foot').value.trim(),w:$('#ps-w').value==='58' ? '58' : '80'};
    try{ localStorage.setItem('makhzani-print',JSON.stringify(shopCfg)); }catch(e){}
    if(mode==='cloud' && db) db.doc('meta/print').set(shopCfg);
    toast('اتحفظت بيانات الفاتورة');
  }
  function buildReceipt(s){
    var rows = s.lines.map(function(l){
      return '<tr><td class="rn">'+esc(l.name)+'</td><td>'+fmt(l.qty)+'</td><td>'+fmt(l.price)+'</td><td>'+fmt(round(l.qty*l.price))+'</td></tr>';
    }).join('');
    return '<div class="rc-shop">'+esc(shopCfg.name||'مخزني')+'</div>'+
      '<div class="rc-meta">'+dt(s.ts)+' · فاتورة '+esc(invCode(s))+'</div>'+
      '<table><thead><tr><th class="rn">الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="rc-total"><span>الإجمالي</span><strong>'+money(s.total)+'</strong></div>'+
      (shopCfg.foot ? '<div class="rc-foot">'+esc(shopCfg.foot)+'</div>' : '');
  }
  function printSale(sid){
    var s = findSale(sid);
    if(!s){ toast('الفاتورة مش موجودة',true); return; }
    logA('print','طباعة فاتورة '+invCode(s)+' ('+money(s.total)+')');
    var mm = shopCfg.w==='58' ? 58 : 80;
    var st = document.getElementById('pg-style');
    if(!st){ st = document.createElement('style'); st.id = 'pg-style'; document.head.appendChild(st); }
    st.textContent = '@page{size:'+mm+'mm auto;margin:0}';
    var rc = $('#receipt');
    rc.innerHTML = buildReceipt(s);
    rc.style.width = (mm-8)+'mm';
    var root = document.documentElement;
    if((' '+root.className+' ').indexOf(' printing ')<0) root.className += ' printing';
    var done = function(){
      window.removeEventListener('afterprint',done);
      root.className = (' '+root.className+' ').replace(/ printing /g,' ').replace(/\s+/g,' ').replace(/^ | $/g,'');
    };
    window.addEventListener('afterprint',done);
    setTimeout(function(){ try{ window.print(); }catch(e){ done(); toast('الطباعة مش متاحة هنا',true); } },50);
  }

  /* ---------- الباركود ---------- */
  function focusQ(){
    try{ if(view==='sell' && !locked && sess && window.matchMedia && window.matchMedia('(pointer:fine)').matches) $('#q').focus(); }catch(e){}
  }
  function scanEnter(){
    var q = $('#q'), raw = q.value.trim();
    if(!raw) return;
    var low = raw.toLowerCase(), all = Array.from(products.values()), hit = null;
    all.forEach(function(p){ if(!hit && p.barcode && String(p.barcode)===raw) hit = p; });
    if(!hit){
      var m = all.filter(function(p){ return p.name.toLowerCase().indexOf(low)>=0; });
      if(m.length===1) hit = m[0];
    }
    if(!hit){ toast('مفيش صنف بالباركود أو الاسم ده',true); q.select(); return; }
    if(hit.qty<=0){ toast(hit.name+' خلص من المخزن',true); q.select(); return; }
    var cur = cart[hit.id]||0, next = round(Math.min(cur+1,hit.qty));
    q.value = '';
    if(next===cur){ toast('وصلت لآخر كمية متاحة من '+hit.name,true); renderSell(); return; }
    cart[hit.id] = next; renderSell();
    toast('+ '+hit.name);
  }

  /* ---------- تصدير Excel (CSV) ---------- */
  function csvCell(v){
    if(v==null) return '';
    var t = String(v);
    if(typeof v==='string' && /^[=+\-@\t\r]/.test(t)) t = "'"+t;
    return /[",\n\r]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t;
  }
  function downloadCsv(name,rows){
    var txt = '\ufeffsep=,\r\n'+rows.map(function(r){ return r.map(csvCell).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));
    var d = new Date(), a = document.createElement('a');
    a.href = url;
    a.download = 'makhzani-'+name+'-'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
    toast('اتحمّل الملف. افتحه بـ Excel');
  }
  function exportItems(){
    var r = periodRows();
    var rows = [['الصنف','اتباع','فاضل','الإيراد']];
    r.rows.forEach(function(x){ rows.push([x.name,x.sold,(x.left===null?'':x.left),round(x.rev)]); });
    downloadCsv('items-'+period,rows);
  }
  function exportInvoices(){
    var t0 = periodRows().t0;
    var rows = [['التاريخ','رقم الفاتورة','الصنف','الكمية','سعر الوحدة','الإجمالي','سعر الجملة','الربح']];
    sales.filter(function(s){ return period==='all' || s.ts>=t0; }).forEach(function(s){
      s.lines.forEach(function(l){
        var hasC = !(l.cost==null || !isFinite(+l.cost));
        rows.push([dt(s.ts),invCode(s),l.name,l.qty,l.price,round(l.qty*l.price),(hasC?l.cost:''),(hasC?round((l.price-l.cost)*l.qty):'')]);
      });
    });
    downloadCsv('invoices-'+period,rows);
  }
  function exportSupplier(){
    var s = selSup ? suppliers.get(selSup) : null;
    if(!s) return;
    var rows = [['المورد: '+s.name],['التاريخ','النوع','الصنف','الكمية','سعر الوحدة','قيمة البضاعة','المدفوع','ملاحظة']];
    (s.entries||[]).slice().reverse().forEach(function(e){
      if(e.type==='purchase') rows.push([dt(e.ts),'بضاعة',e.name,e.qty,e.cost,e.total,e.paid||0,'']);
      else if(e.type==='return') rows.push([dt(e.ts),'مرتجع',e.name,e.qty,e.cost,-e.total,'',e.note||'']);
      else rows.push([dt(e.ts),'دفعة','','','','',e.amount,e.note||'']);
    });
    var st = supStats(s);
    rows.push([]);
    rows.push(['الإجمالي','','','','',round(st.bought-st.ret),st.paid,'']);
    rows.push(['الرصيد (موجب = له عندي / سالب = ليا عنده)','','','','',st.bal,'','']);
    downloadCsv('supplier-'+s.name.replace(/[^\w\u0600-\u06FF]+/g,'_'),rows);
  }

  /* ---------- البيع ---------- */
  function confirmSale(){
    if(!ready()) return;
    var lines = [], updated = [], total = 0, bad = null;
    Object.keys(cart).forEach(function(pid){
      var p = products.get(pid), q = cart[pid];
      if(!p || !(q>0)) return;
      if(q>p.qty){ bad = p; return; }
      lines.push({pid:pid,name:p.name,qty:q,price:p.price,cost:(p.cost==null?null:p.cost)});
      total += q*p.price;
      updated.push(Object.assign({},p,{qty:round(p.qty-q),sold:round((p.sold||0)+q),revenue:round((p.revenue||0)+q*p.price)}));
    });
    if(bad){ toast('المتاح من '+bad.name+' '+fmt(bad.qty)+' بس',true); return; }
    if(!lines.length) return;
    var sale = {id:uid(),ts:Date.now(),lines:lines,total:round(total)};
    if(sess) sale.by = {id:sess.id,name:sess.name};
    cart = {};
    if(mode==='cloud'){
      /* رقم الفاتورة من عدّاد المحل كله. لو مفيش نت بنكمل برقم مؤقت من أكبر رقم الجهاز شايفه */
      var floor = invSeq;
      sales.forEach(function(s){ if(s.no>floor) floor = s.no; });
      render();
      var fin = function(no){
        sale.no = no; if(no>invSeq) invSeq = no;
        lastSaleId = sale.id;
        recordSale(sale,updated);
        toast('تم البيع: '+money(total));
        focusQ();
      };
      /* من غير نت: الفاتورة بتتحفظ برقم مؤقت وبتاخد رقمها الحقيقي أول ما النت يرجع (عشان مفيش رقمين يتكرروا) */
      db.nextNo(floor).then(fin,function(){ sale.pn = true; sale.dev = cloudDevId(); fin(0); });
      return;
    }
    sale.no = ++invSeq;
    lastSaleId = sale.id;
    recordSale(sale,updated);
    toast('تم البيع: '+money(total));
    focusQ();
  }

  /* ---------- المخزن ---------- */
  function resetForm(){
    $('#pform').reset();
    editingId = null;
    $('#f-title').textContent = 'إضافة صنف';
    $('#f-submit').textContent = 'إضافة للمخزن';
    $('#f-qty-label').textContent = 'الكمية';
    $('#f-cancel').hidden = true;
    $('#f-ctn-wrap').hidden = false;
  }

  function seedExamples(){
    if(!ready()) return;
    [['أرز 1 كجم',38,40],['سكر 1 كجم',32,30],['زيت 1 لتر',85,24],['شاي 100 جم',28,3],['مكرونة 400 جم',12,60]].forEach(function(x){
      putProduct({id:uid(),name:x[0],price:x[1],qty:x[2],cost:null,sold:0,revenue:0,created:Date.now()});
    });
    toast('اتضافت 5 أصناف تجريبية. تقدر تمسحها من هنا.');
  }

  /* ---------- نسخة احتياطية ---------- */
  var BK_KEY = 'makhzani-lastbackup';
  var pendingRestore = null;
  var pad2 = function(n){ n = String(n); return n.length<2 ? '0'+n : n; };

  function renderBackup(){
    $('#backup').hidden = ((mode!=='local' && mode!=='cloud') || !isOwner());
    $('#b-import').hidden = false;
    var ip = $('#imp-panel'); if(ip) ip.hidden = !((mode==='local' || mode==='cloud') && isOwner());
    var last = null;
    try{ last = localStorage.getItem(BK_KEY); }catch(e){}
    var cl = (typeof cloudLastBackup!=='undefined') ? cloudLastBackup : 0;
    if(cl > (+last||0)) last = cl;
    $('#b-last').textContent = last
      ? 'آخر نسخة احتياطية: '+dt(+last)
      : 'لسه ماعملتش نسخة احتياطية.';
    /* تذكير للمالك لو عدّى 3 أيام من غير نسخة */
    var w = $('#bk-warn');
    if(w){
      var old = !last || (Date.now()-(+last)) > 3*86400000;
      w.hidden = !(old && isOwner() && (mode==='cloud' || mode==='local'));
      if(!w.hidden) w.textContent = last ? 'عدّى أكتر من 3 أيام على آخر نسخة احتياطية. حمّل نسخة Excel من تاب الأمان.' : 'ماعملتش نسخة احتياطية لحد دلوقتي. حمّل نسخة Excel من تاب الأمان.';
    }
  }

  function withAll(cb){ if(typeof cloudAll==='function') cloudAll(cb); else cb(sales,aud); }
  function exportBackup(){ withAll(doExportBackup); }
  function buildBackup(S,A){ return {app:'makhzani',version:1,exportedAt:Date.now(),products:Array.from(products.values()),sales:S,suppliers:Array.from(suppliers.values()),seq:invSeq,audit:A}; }
  /* بتستخدمها خاصية الرفع على Drive (cloud.js) */
  window.mkBackupData = function(cb){ withAll(function(S,A){ cb(buildBackup(S,A)); }); };
  window.mkBackupDone = function(where){
    try{ localStorage.setItem(BK_KEY,String(Date.now())); }catch(e){}
    if(typeof cloudMarkBackup==='function') cloudMarkBackup();
    renderBackup(); logA('backup','رفع نسخة احتياطية على '+where);
  };
  function doExportBackup(S,A){
    var data = buildBackup(S,A);
    var blob = new Blob([JSON.stringify(data)],{type:'application/json'});
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var a = document.createElement('a');
    a.href = url;
    a.download = 'makhzani-backup-'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'.makhzani';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
    try{ localStorage.setItem(BK_KEY,String(Date.now())); }catch(e){}
    if(typeof cloudMarkBackup==='function') cloudMarkBackup();
    renderBackup();
    logA('backup','تحميل نسخة احتياطية');
    toast('اتحمّل ملف الاسترجاع. احتفظ بيه في مكان آمن');
  }

  function cleanBackup(d){
    if(!d || !Array.isArray(d.products) || !Array.isArray(d.sales)) return null;
    var num = function(v,def){ v = +v; return isFinite(v) ? v : def; };
    var ps = [], ss = [];
    d.products.forEach(function(p){
      if(p && p.id && typeof p.name==='string' && p.name){
        ps.push({id:String(p.id),name:p.name,price:num(p.price,0),qty:num(p.qty,0),barcode:String(p.barcode||''),pack:(+p.pack>1?Math.floor(+p.pack):0),sold:num(p.sold,0),revenue:num(p.revenue,0),cost:((p.cost==null||!isFinite(+p.cost))?null:+p.cost),created:num(p.created,Date.now())});
      }
    });
    d.sales.forEach(function(s){
      if(s && isFinite(+s.ts) && Array.isArray(s.lines)){
        var lines = s.lines.filter(function(l){ return l && l.pid; }).map(function(l){
          return {pid:String(l.pid),name:String(l.name||''),qty:num(l.qty,0),price:num(l.price,0),cost:((l.cost==null||!isFinite(+l.cost))?null:+l.cost)};
        });
        var eds = (Array.isArray(s.edits)?s.edits:[]).filter(function(x){ return x && isFinite(+x.ts); }).map(function(x){ return {ts:+x.ts,from:num(x.from,0),to:num(x.to,0),by:String(x.by||'')}; });
        var one = {id:String(s.id||uid()),ts:+s.ts,lines:lines,total:num(s.total,0)};
        if(+s.no>0) one.no = Math.floor(+s.no);
        if(eds.length) one.edits = eds;
        if(s.by && s.by.name) one.by = {id:String(s.by.id||''),name:String(s.by.name)};
        ss.push(one);
      }
    });
    ss.sort(function(a,b){ return b.ts-a.ts; });
    var sp = [];
    (Array.isArray(d.suppliers)?d.suppliers:[]).forEach(function(s){
      if(s && s.id && typeof s.name==='string' && s.name){
        var en = (Array.isArray(s.entries)?s.entries:[]).filter(function(e){ return e && e.id && (e.type==='purchase'||e.type==='payment'||e.type==='return'); }).map(function(e){
          var o;
          if(e.type==='payment') o = {id:String(e.id),type:'payment',ts:num(e.ts,0),amount:num(e.amount,0),note:String(e.note||'')};
          else {
            o = {id:String(e.id),type:e.type,ts:num(e.ts,0),pid:String(e.pid||''),name:String(e.name||''),qty:num(e.qty,0),cost:num(e.cost,0),total:num(e.total,0)};
            if(e.type==='purchase') o.paid = num(e.paid,0); else o.note = String(e.note||'');
          }
          if(e.edited) o.edited = true;
          return o;
        });
        sp.push({id:String(s.id),name:s.name,phone:String(s.phone||''),entries:en,created:num(s.created,Date.now())});
      }
    });
    return {products:ps,sales:ss,suppliers:sp,seq:Math.max(0,Math.floor(+d.seq||0))};
  }