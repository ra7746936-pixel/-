/* مخزني - الجزء 4 من 4 (UTF-8، جنب index.html) */
  /* ---------- أحداث ---------- */
  document.addEventListener('click',function(e){
    var tab = e.target.closest('[data-tab]');
    if(tab){ view = tab.dataset.tab; render(); if(view==='sell') focusQ(); return; }
    var per = e.target.closest('[data-period]');
    if(per){ period = per.dataset.period; render(); return; }
    var btn = e.target.closest('[data-act]');
    if(!btn) return;
    var id = btn.dataset.id, p = id ? products.get(id) : null;
    switch(btn.dataset.act){
      case 'add': {
        if(!p || p.qty<=0) return;
        var cur = cart[id]||0, next = round(Math.min(cur+1,p.qty));
        if(next===cur){ toast('وصلت لآخر كمية متاحة من '+p.name,true); return; }
        cart[id] = next; renderSell(); focusQ(); break;
      }
      case 'addc': {
        if(!p || !(p.pack>1)) return;
        var cc = cart[id]||0, nc = round(cc+p.pack);
        if(nc>p.qty){ toast('المتاح من '+p.name+' '+fmt(p.qty)+' قطعة بس، مش كرتونة كاملة',true); return; }
        cart[id] = nc; renderSell(); focusQ(); break;
      }
      case 'inc': {
        if(!p) return;
        var c2 = cart[id]||0, n2 = round(Math.min(c2+1,p.qty));
        if(n2===c2){ toast('وصلت لآخر كمية متاحة من '+p.name,true); return; }
        cart[id] = n2; renderSell(); break;
      }
      case 'dec': {
        var c3 = round((cart[id]||0)-1);
        if(c3>0) cart[id]=c3; else delete cart[id];
        renderSell(); break;
      }
      case 'rm': delete cart[id]; renderSell(); break;
      case 'edit': {
        if(!p) return;
        editingId = id;
        $('#f-name').value = p.name; $('#f-price').value = p.price; $('#f-cost').value = (p.cost==null?'':p.cost); $('#f-qty').value = p.qty; $('#f-barcode').value = p.barcode||''; $('#f-pack').value = p.pack>1 ? p.pack : ''; $('#f-ctn-wrap').hidden = true;
        $('#f-title').textContent = 'تعديل الصنف';
        $('#f-submit').textContent = 'حفظ التعديل';
        $('#f-qty-label').textContent = 'الفاضل دلوقتي';
        $('#f-cancel').hidden = false;
        $('#pform').scrollIntoView({block:'center'});
        $('#f-name').focus();
        break;
      }
      case 'del': {
        if(pendingDel===id){
          clearTimeout(delTimer); pendingDel = null;
          if(!ready()) return;
          var dp = products.get(id);
          var doDel = function(){
            if(editingId===id) resetForm();
            if(dp) logA('delp','مسح صنف: '+dp.name+' (فاضل '+fmt(dp.qty)+' بسعر '+money(dp.price)+')',{pid:id,qty:dp.qty});
            removeProduct(id); toast('اتمسح الصنف');
          };
          if(needApproval('stock')) askOwner('مسح صنف: '+(dp ? dp.name : ''),doDel); else doDel();
        } else {
          pendingDel = id; clearTimeout(delTimer);
          delTimer = setTimeout(function(){ pendingDel=null; renderStock(); },3000);
          renderStock();
        }
        break;
      }
      case 'opensup': selSup = id; pendingEntry = null; pendingSup = null; editEnt = null; renderSup(); break;
      case 'supback': selSup = null; pendingEntry = null; pendingSup = null; editEnt = null; renderSup(); break;
      case 'delsup': {
        var sp = selSup ? suppliers.get(selSup) : null;
        if(!sp) return;
        if(pendingSup===sp.id){
          clearTimeout(supTimer); pendingSup = null;
          if(!ready()) return;
          logA('delsup','مسح المورد '+sp.name+' (رصيده '+money(supStats(sp).bal)+')');
          selSup = null; removeSupplier(sp.id); toast('اتمسح المورد');
        } else {
          pendingSup = sp.id; clearTimeout(supTimer);
          supTimer = setTimeout(function(){ pendingSup=null; renderSup(); },3000);
          renderSup();
        }
        break;
      }
      case 'delentry': {
        var eid = btn.dataset.eid, sv = selSup ? suppliers.get(selSup) : null;
        if(!sv) return;
        if(pendingEntry!==eid){
          pendingEntry = eid; clearTimeout(entryTimer);
          entryTimer = setTimeout(function(){ pendingEntry=null; renderSup(); },3000);
          renderSup(); return;
        }
        clearTimeout(entryTimer); pendingEntry = null;
        if(!ready()) return;
        var en = (sv.entries||[]).filter(function(x){ return x.id===eid; })[0];
        if(!en) return;
        var upd = [], note = '';
        if(en.type==='return'){
          var pr0 = products.get(en.pid);
          if(pr0) upd.push(Object.assign({},pr0,{qty:round(pr0.qty+en.qty)}));
        }
        if(en.type==='purchase'){
          var pr = products.get(en.pid);
          if(pr){
            var nq = round(pr.qty-en.qty);
            if(nq<0){ nq = 0; note = ' (الكمية في المخزن كانت أقل، فاتخصمت للصفر)'; }
            upd.push(Object.assign({},pr,{qty:nq}));
          }
        }
        if(editEnt===eid) editEnt = null;
        logA('entdel','إلغاء حركة عند المورد '+sv.name+': '+(en.type==='purchase' ? 'بضاعة '+en.name+' ×'+fmt(en.qty) : en.type==='return' ? 'مرتجع '+en.name+' ×'+fmt(en.qty) : 'دفعة '+money(en.amount)));
        commit(upd,Object.assign({},sv,{entries:sv.entries.filter(function(x){ return x.id!==eid; })}));
        toast('اتلغت الحركة'+note);
        break;
      }
      case 'editent': openEntEdit(btn.dataset.eid); break;
      case 'ee-close': closeEntEdit(); break;
      case 'ee-save': saveEntEdit(); break;
      case 'editinv': openInvEdit(btn.dataset.sid); break;
      case 'ie-close': closeInvEdit(); break;
      case 'ie-save': saveInvEdit(); break;
      case 'ie-cancel': cancelInvoice(); break;
      case 'ie-dec': {
        var d1 = draft[+btn.dataset.i]; if(!d1) return;
        d1.qty = Math.max(0,round(d1.qty-1)); renderInvEdit(); break;
      }
      case 'ie-inc': {
        var d2 = draft[+btn.dataset.i]; if(!d2) return;
        var mx = maxFor(d2), nx = round(Math.min(d2.qty+1,mx));
        if(nx===d2.qty){ toast('وصلت لآخر كمية متاحة من '+d2.name,true); return; }
        d2.qty = nx; renderInvEdit(); break;
      }
      case 'ie-rm': {
        var d3 = draft[+btn.dataset.i]; if(!d3) return;
        d3.qty = 0; renderInvEdit(); break;
      }
      case 'ie-addbtn': {
        var pv = $('#ie-add').value, pp = pv ? products.get(pv) : null;
        if(!pp){ toast('اختار الصنف الأول',true); return; }
        var ex = null; draft.forEach(function(d){ if(d.pid===pp.id) ex = d; });
        if(ex){
          var nq2 = round(Math.min(ex.qty+1,maxFor(ex)));
          if(nq2===ex.qty){ toast('وصلت لآخر كمية متاحة من '+ex.name,true); return; }
          ex.qty = nq2;
        } else {
          if(pp.qty<=0){ toast(pp.name+' خلص من المخزن',true); return; }
          draft.push({pid:pp.id,name:pp.name,price:pp.price,cost:(pp.cost==null?null:pp.cost),qty:1,orig:0});
        }
        $('#ie-add').value = '';
        renderInvEdit(); break;
      }
      case 'print': printSale(btn.dataset.sid); break;
      case 'exp-items': exportItems(); break;
      case 'exp-inv': exportInvoices(); break;
      case 'exp-sup': exportSupplier(); break;
      case 'seed': seedExamples(); break;
      case 'focusform': $('#f-name').focus(); break;
    }
  });

  $('#checkout').addEventListener('click',confirmSale);
  $('#q').addEventListener('input',renderSell);
  $('#q').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); scanEnter(); } });
  document.addEventListener('keydown',function(e){
    if(view!=='sell' || locked || !sess || e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length!==1) return;
    var tg = e.target && e.target.tagName;
    if(tg==='INPUT' || tg==='TEXTAREA' || tg==='SELECT') return;
    $('#q').focus();
  });
  ['#ps-name','#ps-foot','#ps-w'].forEach(function(id){ $(id).addEventListener('change',saveShopCfg); });
  $('#f-cancel').addEventListener('click',resetForm);

  $('#cart').addEventListener('change',function(e){
    var inp = e.target.closest('[data-qty]');
    if(!inp) return;
    var id = inp.dataset.qty, p = products.get(id), v = parseFloat(inp.value);
    if(!p) return;
    if(!(v>0)){ delete cart[id]; }
    else if(v>p.qty){ cart[id]=p.qty; toast('المتاح من '+p.name+' '+fmt(p.qty)+' بس',true); }
    else cart[id]=round(v);
    renderSell();
  });

  $('#ie-lines').addEventListener('change',function(e){
    var inp = e.target.closest('[data-iqty]');
    if(!inp) return;
    var d = draft[+inp.dataset.iqty], v = parseFloat(inp.value);
    if(!d) return;
    var mx = maxFor(d);
    if(!(v>0)) d.qty = 0;
    else if(v>mx){ d.qty = mx; toast('المتاح من '+d.name+' '+fmt(mx)+' بس',true); }
    else d.qty = round(v);
    renderInvEdit();
  });

  $('#pform').addEventListener('submit',function(e){
    e.preventDefault();
    if(!ready()) return;
    var name = $('#f-name').value.trim();
    var price = parseFloat($('#f-price').value);
    var qty = parseFloat($('#f-qty').value);
    var costV = parseFloat($('#f-cost').value), cost = costV>=0 ? round(costV) : null;
    var barcode = $('#f-barcode').value.trim();
    var packV = parseInt($('#f-pack').value,10), pack = packV>1 ? packV : 0;
    if($('#f-pack').value.trim() && !pack){ toast('عدد القطع في الكرتونة لازم يكون 2 أو أكتر',true); $('#f-pack').focus(); return; }
    var ctn = parseFloat($('#f-ctn').value);
    if(ctn>0){ if(!pack){ toast('اكتب عدد القطع في الكرتونة الأول',true); $('#f-pack').focus(); return; } qty = (qty>=0 ? qty : 0) + round(ctn*pack); }
    if(barcode){
      var dupB = null;
      products.forEach(function(x){ if(x.barcode===barcode && x.id!==editingId) dupB = x; });
      if(dupB){ toast('الباركود ده متسجل على: '+dupB.name,true); $('#f-barcode').focus(); return; }
    }
    if(!name){ toast('اكتب اسم الصنف',true); $('#f-name').focus(); return; }
    if(!(price>=0)){ toast('اكتب سعر البيع',true); $('#f-price').focus(); return; }
    if(!(qty>=0)){ toast('اكتب الكمية (أو عدد الكراتين)',true); $('#f-qty').focus(); return; }
    var old = editingId ? products.get(editingId) : null;
    if(!isOwner()) cost = old ? (old.cost==null ? null : old.cost) : null;
    var finish = function(){
      if(old){
        var ch = [], oc = old.cost==null ? null : old.cost;
        if(old.name!==name) ch.push('الاسم '+old.name+'←'+name);
        if(old.price!==round(price)) ch.push('السعر '+fmt(old.price)+'←'+fmt(round(price)));
        if(oc!==cost) ch.push('سعر الجملة '+(oc==null ? '—' : fmt(oc))+'←'+(cost==null ? '—' : fmt(cost)));
        if((old.barcode||'')!==barcode) ch.push('الباركود');
        if(old.qty!==round(qty)) logA('stock','تعديل كمية '+old.name+' من '+fmt(old.qty)+' إلى '+fmt(round(qty)),{pid:old.id,from:old.qty,to:round(qty)});
        if(ch.length) logA('editp','تعديل صنف '+old.name+': '+ch.join('، '));
        putProduct(Object.assign({},old,{name:name,price:round(price),cost:cost,qty:round(qty),barcode:barcode,pack:pack}));
        toast('اتعدّل: '+name);
      } else {
        logA('addp','إضافة صنف: '+name+' بسعر '+money(round(price))+' وكمية '+fmt(round(qty)));
        putProduct({id:uid(),name:name,price:round(price),qty:round(qty),cost:cost,barcode:barcode,pack:pack,sold:0,revenue:0,created:Date.now()});
        toast('اتضاف: '+name);
      }
      resetForm();
      $('#f-name').focus();
    };
    if(old && needApproval('stock')) askOwner('تعديل صنف: '+old.name,finish); else finish();
  });

  $('#slist').addEventListener('submit',function(e){
    var f = e.target.closest('form.restock');
    if(!f) return;
    e.preventDefault();
    if(!ready()) return;
    var p = products.get(f.dataset.id), n = parseFloat(f.elements.n.value), unit = '';
    if(!p || !(n>0)){ toast('اكتب كمية التوريد',true); return; }
    if(p.pack>1 && f.elements.u && f.elements.u.value==='c'){ unit = fmt(n)+' كرتونة = '; n = round(n*p.pack); }
    logA('restock','توريد +'+unit+fmt(n)+' لـ '+p.name+' (من '+fmt(p.qty)+' إلى '+fmt(round(p.qty+n))+')');
    f.elements.n.value = '';
    putProduct(Object.assign({},p,{qty:round(p.qty+n)}));
    toast('اتزوّد '+(unit||'')+fmt(n)+' من '+p.name);
  });

  $('#sform').addEventListener('submit',function(e){
    e.preventDefault();
    if(!ready()) return;
    var name = $('#s-name').value.trim();
    if(!name){ toast('اكتب اسم المورد',true); $('#s-name').focus(); return; }
    var dup = Array.from(suppliers.values()).some(function(x){ return x.name===name; });
    if(dup){ toast('المورد ده متسجل قبل كده',true); return; }
    var s = {id:uid(),name:name,phone:$('#s-phone').value.trim(),entries:[],created:Date.now()};
    $('#sform').reset();
    selSup = s.id; pendingEntry = null;
    logA('sup','ضاف مورد: '+name);
    putSupplier(s);
    toast('اتضاف المورد: '+name);
  });

  $('#pu-prod').addEventListener('change',function(){
    var p = products.get($('#pu-prod').value);
    if(p && p.cost!=null && !$('#pu-cost').value) $('#pu-cost').value = p.cost;
    updatePuTotal(); renderSup();
  });
  $('#pu-qty').addEventListener('input',updatePuTotal);
  $('#pu-cost').addEventListener('input',updatePuTotal);

  $('#pu-form').addEventListener('submit',function(e){
    e.preventDefault();
    if(!ready()) return;
    var s = suppliers.get(selSup);
    if(!s) return;
    var val = $('#pu-prod').value;
    var qty = parseFloat($('#pu-qty').value), cost = parseFloat($('#pu-cost').value);
    var paidRaw = $('#pu-paid').value, paid = paidRaw==='' ? 0 : parseFloat(paidRaw);
    if(!val){ toast('اختار الصنف',true); $('#pu-prod').focus(); return; }
    var base;
    if(val==='__new'){
      var nm = $('#pu-newname').value.trim(), pr = parseFloat($('#pu-newprice').value);
      if(!nm){ toast('اكتب اسم الصنف الجديد',true); $('#pu-newname').focus(); return; }
      if(!(pr>=0)){ toast('اكتب سعر البيع للزبون',true); $('#pu-newprice').focus(); return; }
      base = {id:uid(),name:nm,price:round(pr),qty:0,sold:0,revenue:0,cost:null,created:Date.now()};
    } else {
      base = products.get(val);
      if(!base){ toast('الصنف مش موجود',true); return; }
    }
    if(!(qty>0)){ toast('اكتب الكمية',true); $('#pu-qty').focus(); return; }
    if(!(cost>=0)){ toast('اكتب سعر الجملة',true); $('#pu-cost').focus(); return; }
    if(!(paid>=0)){ toast('المبلغ المدفوع غلط',true); $('#pu-paid').focus(); return; }
    var p = Object.assign({},base,{qty:round(base.qty+qty),cost:round(cost)});
    var entry = {id:uid(),type:'purchase',ts:Date.now(),pid:p.id,name:p.name,qty:round(qty),cost:round(cost),total:round(qty*cost),paid:round(paid)};
    logA('sup','بضاعة من '+s.name+': '+p.name+' ×'+fmt(entry.qty)+' بسعر '+money(entry.cost)+' (دفعت '+money(entry.paid)+')');
    commit([p],Object.assign({},s,{entries:[entry].concat(s.entries||[])}));
    $('#pu-form').reset();
    updatePuTotal(); renderSup();
    toast('اتسجلت البضاعة وزادت في المخزن');
  });

  $('#ee-qty').addEventListener('input',updateEeSum);
  $('#ee-cost').addEventListener('input',updateEeSum);

  $('#rt-prod').addEventListener('change',function(){
    var p = products.get($('#rt-prod').value), s = suppliers.get(selSup);
    if(!p) return;
    var last = null;
    ((s && s.entries) || []).forEach(function(x){ if(!last && x.type==='purchase' && x.pid===p.id) last = x; });
    var c = last ? last.cost : p.cost;
    $('#rt-cost').value = (c==null ? '' : c);
    updateRtTotal();
  });
  $('#rt-qty').addEventListener('input',updateRtTotal);
  $('#rt-cost').addEventListener('input',updateRtTotal);

  $('#rt-form').addEventListener('submit',function(e){
    e.preventDefault();
    if(!ready()) return;
    var s = suppliers.get(selSup);
    if(!s) return;
    var p = products.get($('#rt-prod').value);
    var qty = parseFloat($('#rt-qty').value), cost = parseFloat($('#rt-cost').value);
    if(!p){ toast('اختار الصنف',true); $('#rt-prod').focus(); return; }
    if(!(qty>0)){ toast('اكتب الكمية المرتجعة',true); $('#rt-qty').focus(); return; }
    if(!(cost>=0)){ toast('اكتب سعر الوحدة',true); $('#rt-cost').focus(); return; }
    if(qty>p.qty){ toast('الفاضل من '+p.name+' '+fmt(p.qty)+' بس. مينفعش ترجّع أكتر منه.',true); return; }
    var entry = {id:uid(),type:'return',ts:Date.now(),pid:p.id,name:p.name,qty:round(qty),cost:round(cost),total:round(qty*cost),note:$('#rt-note').value.trim()};
    logA('sup','مرتجع للمورد '+s.name+': '+p.name+' ×'+fmt(entry.qty)+' = '+money(entry.total));
    commit([Object.assign({},p,{qty:round(p.qty-qty)})],Object.assign({},s,{entries:[entry].concat(s.entries||[])}));
    $('#rt-form').reset();
    updateRtTotal(); renderSup();
    toast('اتسجّل المرتجع. اتخصم '+money(entry.total)+' من حسابك');
  });

  $('#pay-form').addEventListener('submit',function(e){
    e.preventDefault();
    if(!ready()) return;
    var s = suppliers.get(selSup);
    if(!s) return;
    var amt = parseFloat($('#pay-amount').value);
    if(!(amt>0)){ toast('اكتب المبلغ',true); $('#pay-amount').focus(); return; }
    var entry = {id:uid(),type:'payment',ts:Date.now(),amount:round(amt),note:$('#pay-note').value.trim()};
    logA('sup','دفعة للمورد '+s.name+': '+money(entry.amount));
    commit([],Object.assign({},s,{entries:[entry].concat(s.entries||[])}));
    $('#pay-form').reset();
    toast('اتسجلت الدفعة: '+money(amt));
  });

  $('#b-export').addEventListener('click',exportBackup);
  $('#b-xlsx').addEventListener('click',exportXlsx);
  $('#b-import').addEventListener('click',function(){ $('#b-file').click(); });
  $('#b-file').addEventListener('change',function(e){
    var f = e.target.files && e.target.files[0];
    if(!f) return;
    var r = new FileReader();
    r.onload = function(){
      var d = null;
      try{ d = cleanBackup(JSON.parse(r.result)); }catch(err){}
      if(!d){ toast('الملف ده مش نسخة احتياطية صالحة',true); return; }
      pendingRestore = d;
      $('#b-msg').textContent = 'الملف فيه '+d.products.length+' صنف و '+d.sales.length+' فاتورة و '+d.suppliers.length+' مورد. لو كملت، البيانات الحالية '+(mode==='cloud' ? 'للمحل كله (على كل الأجهزة) ' : '')+'هتتبدل بيها. حمّل نسخة من الحالي الأول لو محتاجها.';
      $('#b-confirm').hidden = false;
    };
    r.onerror = function(){ toast('ماقدرتش أقرا الملف',true); };
    r.readAsText(f);
    e.target.value = '';
  });
  $('#b-yes').addEventListener('click',function(){
    if(!pendingRestore || (mode!=='local' && mode!=='cloud') || !isOwner()) return;
    if(mode==='cloud' && !pendingRestore.__all){
      withAll(function(S,A,full){ var d = pendingRestore; d.__all = S.map(function(x){ return x.id; }); $('#b-yes').click(); });
      return;
    }
    logA('restore','استرجاع نسخة احتياطية ('+pendingRestore.products.length+' صنف، '+pendingRestore.sales.length+' فاتورة، '+pendingRestore.suppliers.length+' مورد)');
    var oldIds = {p:Array.from(products.keys()),s:(pendingRestore.__all||sales.map(function(x){ return x.id; })),u:Array.from(suppliers.keys())};
    products = new Map();
    pendingRestore.products.forEach(function(p){ products.set(p.id,p); });
    sales = pendingRestore.sales;
    invSeq = Math.max(invSeq,pendingRestore.seq||0);
    numberSales();
    suppliers = new Map();
    pendingRestore.suppliers.forEach(function(s){ suppliers.set(s.id,s); });
    selSup = null;
    cart = {}; 
    if(mode==='cloud') cloudRestoreWrite(pendingRestore,oldIds);
    pendingRestore = null;
    $('#b-confirm').hidden = true;
    if(mode!=='cloud') lsSave();
    render();
    toast('اتسترجعت البيانات');
  });
  $('#b-no').addEventListener('click',function(){ pendingRestore = null; $('#b-confirm').hidden = true; });


  /* ---------- نسخة Excel (.xlsx حقيقي) ---------- */
  var CRC_T = null;
  function crc32(u){
    if(!CRC_T){ CRC_T = []; for(var n = 0; n < 256; n++){ var c = n; for(var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_T[n] = c >>> 0; } }
    var x = 0xFFFFFFFF;
    for(var i = 0; i < u.length; i++) x = CRC_T[(x ^ u[i]) & 255] ^ (x >>> 8);
    return (x ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files){
    var enc = new TextEncoder(), parts = [], cen = [], off = 0;
    function w16(a,v){ a.push(v & 255, (v >> 8) & 255); }
    function w32(a,v){ a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
    files.forEach(function(f){
      var nm = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data), h = [];
      w32(h,0x04034b50); w16(h,20); w16(h,0x0800); w16(h,0); w16(h,0); w16(h,0x21); w32(h,crc); w32(h,data.length); w32(h,data.length); w16(h,nm.length); w16(h,0);
      parts.push(new Uint8Array(h), nm, data);
      var c = [];
      w32(c,0x02014b50); w16(c,20); w16(c,20); w16(c,0x0800); w16(c,0); w16(c,0); w16(c,0x21); w32(c,crc); w32(c,data.length); w32(c,data.length); w16(c,nm.length); w16(c,0); w16(c,0); w16(c,0); w16(c,0); w32(c,0); w32(c,off);
      cen.push(new Uint8Array(c), nm);
      off += h.length + nm.length + data.length;
    });
    var csz = 0; cen.forEach(function(p){ csz += p.length; });
    var e = [];
    w32(e,0x06054b50); w16(e,0); w16(e,0); w16(e,files.length); w16(e,files.length); w32(e,csz); w32(e,off); w16(e,0);
    return new Blob(parts.concat(cen,[new Uint8Array(e)]),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function xmlEsc(s){
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function colName(i){ var s = ''; i++; while(i > 0){ var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetXml(rows,widths){
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    widths.forEach(function(w,i){ x += '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>'; });
    x += '</cols><sheetData>';
    rows.forEach(function(r,ri){
      x += '<row r="'+(ri+1)+'">';
      r.forEach(function(v,ci){
        if(v===null || v===undefined || v==='') return;
        var ref = colName(ci)+(ri+1), st = ri===0 ? ' s="1"' : '';
        if(typeof v==='number' && isFinite(v)) x += '<c r="'+ref+'"'+st+'><v>'+v+'</v></c>';
        else x += '<c r="'+ref+'"'+st+' t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(v)+'</t></is></c>';
      });
      x += '</row>';
    });
    return x + '</sheetData></worksheet>';
  }
  function xlsxFromSheets(sheets){
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    var wr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    var files = [];
    sheets.forEach(function(s,i){
      var n = i+1;
      ct += '<Override PartName="/xl/worksheets/sheet'+n+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wb += '<sheet name="'+xmlEsc(s[0])+'" sheetId="'+n+'" r:id="rId'+n+'"/>';
      wr += '<Relationship Id="rId'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+n+'.xml"/>';
      files.push({name:'xl/worksheets/sheet'+n+'.xml',data:sheetXml(s[1],s[2])});
    });
    ct += '</Types>'; wb += '</sheets></workbook>';
    wr += '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    files.unshift({name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},{name:'xl/workbook.xml',data:wb},{name:'xl/_rels/workbook.xml.rels',data:wr},{name:'xl/styles.xml',data:styles});
    return zipStore(files);
  }
  function exportXlsx(){
    if(!isOwner()){ toast('الملف ده للمالك بس',true); return; }
    withAll(function(S){ doExportXlsx(S); });
  }
  function buildExcelBlob(sales){
    var prods = Array.from(products.values()), sups = Array.from(suppliers.values());
    var inv = [['رقم الفاتورة','التاريخ','البائع','الصنف','الكمية','سعر الوحدة','الإجمالي','سعر الجملة','الربح']];
    var rev = 0, profit = 0;
    sales.slice().sort(function(a,b){ return (a.no||0)-(b.no||0) || a.ts-b.ts; }).forEach(function(s){
      s.lines.forEach(function(l){
        var hasC = !(l.cost==null || !isFinite(+l.cost)), tot = round(l.qty*l.price);
        rev += tot; if(hasC) profit += (l.price-l.cost)*l.qty;
        inv.push([invCode(s),dt(s.ts),s.by ? s.by.name : '',l.name,l.qty,l.price,tot,hasC ? l.cost : '',hasC ? round((l.price-l.cost)*l.qty) : '']);
      });
    });
    var stockVal = 0;
    var itm = [['الصنف','سعر البيع','الكمية المتبقية','الحالة','القطع في الكرتونة','الكراتين المتبقية','سعر الجملة','قيمة المخزون (جملة)','الباركود','اتباع (قطعة)','إجمالي الإيراد']];
    prods.slice().sort(byName).forEach(function(p){
      var hasC = !(p.cost==null || !isFinite(+p.cost)); if(hasC) stockVal += p.qty*p.cost;
      var pk = p.pack>1 ? p.pack : 0, st = p.qty<=0 ? 'خلصان' : (p.qty<=LOW ? 'قرب يخلص' : 'متوفر');
      itm.push([p.name,p.price,p.qty,st,pk||'',pk ? (Math.floor(p.qty/pk)+' كرتونة'+(round(p.qty%pk)>0 ? ' و '+round(p.qty%pk)+' قطعة' : '')) : '',hasC ? p.cost : '',hasC ? round(p.qty*p.cost) : '',p.barcode||'',p.sold||0,p.revenue||0]);
    });
    var sup = [['المورد','التاريخ','النوع','الصنف','الكمية','سعر الوحدة','قيمة البضاعة','المدفوع','ملاحظة']];
    var bal = [['المورد','رقم التليفون','إجمالي البضاعة','المرتجع','المدفوع','الرصيد (موجب = له عندي / سالب = ليا عنده)']];
    var totalBal = 0;
    sups.forEach(function(s){
      (s.entries||[]).slice().reverse().forEach(function(e){
        if(e.type==='purchase') sup.push([s.name,dt(e.ts),'بضاعة',e.name,e.qty,e.cost,e.total,e.paid||0,'']);
        else if(e.type==='return') sup.push([s.name,dt(e.ts),'مرتجع',e.name,e.qty,e.cost,-e.total,'',e.note||'']);
        else sup.push([s.name,dt(e.ts),'دفعة','','','','',e.amount,e.note||'']);
      });
      var st = supStats(s); totalBal += st.bal;
      bal.push([s.name,s.phone||'',round(st.bought),round(st.ret),round(st.paid),round(st.bal)]);
    });
    var sm = [['البند','القيمة'],
      ['تاريخ النسخة',dt(Date.now())],
      ['عدد الأصناف',prods.length],
      ['قيمة المخزون بسعر الجملة',round(stockVal)],
      ['عدد الفواتير',sales.length],
      ['إجمالي المبيعات',round(rev)],
      ['صافي الربح',round(profit)],
      ['عدد الموردين',sups.length],
      ['إجمالي أرصدة الموردين (موجب = عليك)',round(totalBal)]];
    var sheets = [['الأصناف',itm,[28,12,14,12,16,22,12,18,18,12,14]],['الفواتير',inv,[14,18,14,28,10,12,12,12,12]],['حركات الموردين',sup,[20,18,10,26,10,12,14,12,24]],['أرصدة الموردين',bal,[22,16,16,12,12,30]],['ملخص',sm,[40,22]]];
    return xlsxFromSheets(sheets);
  }
  function doExportXlsx(sales){
    var blob = buildExcelBlob(sales), url = URL.createObjectURL(blob), d = new Date();
    var a = document.createElement('a');
    a.href = url;
    a.download = 'makhzani-excel-'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
    try{ localStorage.setItem(BK_KEY,String(Date.now())); }catch(e){}
    if(typeof cloudMarkBackup==='function') cloudMarkBackup();
    renderBackup();
    logA('backup','تحميل نسخة Excel');
    toast('اتحمّلت نسخة Excel. افتحها بـ Excel');
  }

  /* ---------- الترخيص ---------- */
  var LIC_KEY = 'makhzani-license', SEEN_KEY = 'makhzani-seen', DEV_KEY = 'makhzani-device';

  function getDeviceId(){
    var id = null;
    try{ id = localStorage.getItem(DEV_KEY); }catch(e){}
    if(!id){
      var al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', a = new Uint8Array(8);
      try{ crypto.getRandomValues(a); }catch(e){ for(var j=0;j<8;j++) a[j] = Math.floor(Math.random()*256); }
      for(var i=0;i<8;i++) s += al.charAt(a[i]%al.length);
      id = s.slice(0,4)+'-'+s.slice(4);
      try{ localStorage.setItem(DEV_KEY,id); }catch(e){}
    }
    return id;
  }
  function b64uToBytes(s){
    s = s.replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function verifyCode(code){
    return new Promise(function(resolve){
      try{
        if(!(window.crypto && crypto.subtle)) return resolve({ok:false,nosub:true});
        var parts = String(code||'').replace(/\s+/g,'').split('.');
        if(parts.length!==2) return resolve({ok:false});
        var pb = b64uToBytes(parts[0]), sig = b64uToBytes(parts[1]);
        var p = JSON.parse(new TextDecoder().decode(pb));
        crypto.subtle.importKey('jwk',JSON.parse(LICENSE_KEY_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
          .then(function(k){ return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},k,sig,pb); })
          .then(function(ok){ resolve(ok ? {ok:true,p:p} : {ok:false}); })
          .catch(function(){ resolve({ok:false}); });
      }catch(e){ resolve({ok:false}); }
    });
  }
  function todayStr(){
    var d = new Date(), z = function(n){ n = String(n); return n.length<2 ? '0'+n : n; };
    return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());
  }
  function daysBetween(a,b){
    var x = a.split('-'), y = b.split('-');
    return Math.round((Date.UTC(+y[0],y[1]-1,+y[2])-Date.UTC(+x[0],x[1]-1,+x[2]))/86400000);
  }
  function evalLicense(p){
    if(p && p.t) return {s:'device'};
    if(!p || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.e||'')) || String(p.d||'').toUpperCase()!==getDeviceId()) return {s:'device'};
    var now = Date.now(), seen = 0;
    try{ seen = +localStorage.getItem(SEEN_KEY) || 0; }catch(e){}
    if(now < seen - 2*86400000) return {s:'clock'};
    var left = daysBetween(todayStr(),p.e);
    if(left<0) return {s:'expired',left:left};
    try{ if(now>seen) localStorage.setItem(SEEN_KEY,String(now)); }catch(e){}
    return {s:'ok',left:left};
  }
  function showLock(title,msg){
    locked = true;
    document.documentElement.className = (document.documentElement.className.replace(/\blocked\b/g,'')+' locked').replace(/\s+/g,' ');
    $('#lock').hidden = false;
    $('#lock-title').textContent = title;
    $('#lock-msg').textContent = msg || '';
    $('#lock-dev').value = getDeviceId();
    $('#lock-contact').textContent = CONTACT;
    $('#lic-note').hidden = true;
    $('#auth').hidden = true; setAuthClass(false);
  }
  function hideLock(){
    locked = false;
    document.documentElement.className = document.documentElement.className.replace(/\blocked\b/g,'').replace(/\s+/g,' ');
    $('#lock').hidden = true;
    gate();
  }
  function updateNote(left){
    var el = $('#lic-note');
    if(left<=7){
      el.textContent = 'الاشتراك ينتهي '+(left===0 ? 'النهارده' : 'بعد '+left+' يوم')+'. '+CONTACT;
      el.hidden = false;
    } else el.hidden = true;
  }
  function lockFor(e,p){
    if(e.s==='expired') showLock('انتهى الاشتراك','الاشتراك انتهى يوم '+p.e+'. ابعت رقم جهازك واطلب كود التجديد.');
    else if(e.s==='clock') showLock('تاريخ الجهاز غلط','ساعة الكمبيوتر راجعة لورا. اظبط التاريخ والوقت وهيشتغل تاني لوحده.');
    else showLock('التطبيق محتاج تفعيل','ابعت رقم جهازك واطلب كود التفعيل.');
  }
  function licenseCheck(){
    if(!LICENSE_KEY_JWK || mode==='db' || !lic) return;
    var e = evalLicense(lic);
    if(e.s==='ok'){ if(locked) hideLock(); updateNote(e.left); } else lockFor(e,lic);
  }
  function licenseStart(){
    if(!LICENSE_KEY_JWK){ hideLock(); return; }
    var saved = null;
    try{ saved = localStorage.getItem(LIC_KEY); }catch(e){}
    if(!saved){ showLock('التطبيق محتاج تفعيل','ابعت رقم جهازك واطلب كود التفعيل.'); return; }
    verifyCode(saved).then(function(r){
      if(!r.ok){ showLock('التطبيق محتاج تفعيل','الكود المحفوظ مش سليم. اطلب كود جديد.'); return; }
      lic = r.p; licenseCheck();
    });
  }

  $('#lock-copy').addEventListener('click',function(){
    var i = $('#lock-dev'); i.select();
    try{ document.execCommand('copy'); toast('اتنسخ رقم الجهاز'); }catch(e){}
  });
  $('#lock-backup').addEventListener('click',exportBackup);
  $('#lock-go').addEventListener('click',function(){
    var code = $('#lock-code').value, err = $('#lock-err');
    err.textContent = '';
    verifyCode(code).then(function(r){
      if(r.nosub){ err.textContent = 'المتصفح ده مش بيدعم التفعيل. افتح الملف بمتصفح Chrome.'; return; }
      if(!r.ok){ err.textContent = 'الكود غلط. اتأكد إنك نسخته كله.'; return; }
      var e = evalLicense(r.p);
      if(e.s==='device'){ err.textContent = 'الكود ده متعمل لجهاز تاني. ابعت رقم جهازك اللي فوق.'; return; }
      if(e.s==='expired'){ err.textContent = 'الكود ده منتهي. اطلب كود جديد.'; return; }
      if(e.s==='clock'){ err.textContent = 'ساعة الجهاز غلط. اظبط التاريخ وجرّب تاني.'; return; }
      try{ localStorage.setItem(LIC_KEY,String(code).replace(/\s+/g,'')); }catch(x){}
      lic = r.p; hideLock(); updateNote(e.left);
      toast('اتفعّل التطبيق لحد '+r.p.e);
    });
  });

  /* ---------- بداية ---------- */
  function startLocal(){
    /* على رابط منشور التطبيق دايما سحابي، حتى لو fb.js اتحجب أو اتشال */
    if(!window.CLOUD_ON && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.CLOUD_ON = true;
    /* السحابي: البيانات بتيجي من السيرفر بعد التحقق من الاشتراك. الوضع المحلي: من الجهاز */
    mode = window.CLOUD_ON ? 'pending' : 'local';
    if(!window.CLOUD_ON) lsLoad();
    secLoad(); audLoad(); render();
    if(window.CLOUD_ON){ cloudStart(); } else { licenseStart(); gate(); }
  }
  function startDb(c){
    db = c; mode = 'db'; sess = {role:'owner',id:'owner',name:'المالك'}; hideLock();
    var fail = function(err){ toast('مشكلة في الاتصال بالبيانات: '+((err&&err.message)||''),true); };
    db.collection('products').onSnapshot(function(snap){
      var m = new Map();
      snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
      products = m; render();
    },fail);
    db.collection('sales').orderBy('ts','desc').limit(1000).onSnapshot(function(snap){
      sales = snap.docs.map(function(d){ return Object.assign({},d.data(),{id:d.id}); });
      render();
    },fail);
    db.collection('suppliers').onSnapshot(function(snap){
      var m = new Map();
      snap.docs.forEach(function(d){ var v = d.data(); if(v) m.set(d.id,Object.assign({},v,{id:d.id})); });
      suppliers = m; render();
    },fail);
    render();
  }
  render();
  loadShopCfg();
  initIdle();
  setInterval(licenseCheck,60000);
  focusQ();
  var dbReq = null;
  try{ dbReq = window.claude ? window.claude.use('db') : null; }catch(e){ dbReq = null; }
  if(dbReq && dbReq.then){
    dbReq.then(function(c){ if(c) startDb(c); else startLocal(); }, function(){ startLocal(); });
  } else {
    startLocal();
  }

/* تلميح الكراتين: عدد الكراتين × القطع في الكرتونة */
(function(){
  function hint(){
    var pk = parseInt($('#f-pack').value,10), c = parseFloat($('#f-ctn').value), h = $('#f-ctn-hint');
    h.textContent = (pk>1 && c>0) ? ('= '+fmt(round(c*pk))+' قطعة هتتضاف') : '';
  }
  $('#f-pack').addEventListener('input',hint); $('#f-ctn').addEventListener('input',hint);
})();

/* ---------- استيراد أصناف من Excel / CSV (المالك بس) ---------- */
var impRows = null, impBusy = false;
function impMsg(t,bad){ var m = $('#imp-msg'); m.hidden = !t; m.textContent = t||''; m.style.color = bad ? 'var(--bad-ink)' : ''; }
function impNorm(x){
  return String(x==null ? '' : x).toLowerCase().replace(/[ً-ٟـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s_\-.:()\/]+/g,'');
}
function impNum(v){
  if(v==null) return NaN;
  var t = String(v).replace(/[٠-٩]/g,function(c){ return c.charCodeAt(0)-0x0660; }).replace(/[۰-۹]/g,function(c){ return c.charCodeAt(0)-0x06F0; })
    .replace(/٫/g,'.').replace(/٬/g,'').replace(/[^\d.,\-]/g,'');
  if(!t) return NaN;
  if(t.indexOf(',')>=0 && t.indexOf('.')<0 && /,\d{1,2}$/.test(t)) t = t.replace(',','.'); else t = t.replace(/,/g,'');
  return parseFloat(t);
}
function impCsv(text){
  if(text.charCodeAt(0)===0xFEFF) text = text.slice(1);
  var first = text.split(/\r?\n/)[0]||'', d = ',';
  if((first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length) d = ';';
  if((first.match(/\t/g)||[]).length > (first.match(new RegExp('['+d+']','g'))||[]).length) d = '\t';
  var rows = [], row = [], cur = '', q = false;
  for(var i = 0; i < text.length; i++){
    var c = text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if(c==='"') q = true;
    else if(c===d){ row.push(cur); cur = ''; }
    else if(c==='\n' || c==='\r'){ if(c==='\r' && text[i+1]==='\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function impInflate(u8){
  if(typeof DecompressionStream==='undefined') return Promise.reject(new Error('nodecomp'));
  var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(u8); w.close();
  return new Response(ds.readable).arrayBuffer().then(function(b){ return new Uint8Array(b); });
}
function impUnzip(buf){
  var u = new Uint8Array(buf), dv = new DataView(buf), e = -1, i;
  for(i = u.length-22; i >= Math.max(0,u.length-70000); i--){ if(dv.getUint32(i,true)===0x06054b50){ e = i; break; } }
  if(e<0) return Promise.reject(new Error('notzip'));
  var n = dv.getUint16(e+10,true), off = dv.getUint32(e+16,true), dec = new TextDecoder(), ent = {};
  for(i = 0; i < n; i++){
    if(dv.getUint32(off,true)!==0x02014b50) break;
    var meth = dv.getUint16(off+10,true), cs = dv.getUint32(off+20,true), nl = dv.getUint16(off+28,true), xl = dv.getUint16(off+30,true), cl = dv.getUint16(off+32,true), lo = dv.getUint32(off+42,true);
    ent[dec.decode(u.subarray(off+46,off+46+nl))] = {meth:meth,cs:cs,lo:lo};
    off += 46+nl+xl+cl;
  }
  function get(name){
    var f = ent[name]; if(!f) return Promise.resolve(null);
    var ds = f.lo+30+dv.getUint16(f.lo+26,true)+dv.getUint16(f.lo+28,true), raw = u.subarray(ds,ds+f.cs);
    if(f.meth===0) return Promise.resolve(raw);
    if(f.meth===8) return impInflate(raw);
    return Promise.reject(new Error('method'));
  }
  return {names:Object.keys(ent),get:get};
}
function impColIdx(ref){ var m = /^([A-Z]+)/.exec(ref||''), n = 0; if(!m) return 0; for(var i = 0; i < m[1].length; i++) n = n*26+(m[1].charCodeAt(i)-64); return n-1; }
function impXlsx(buf){
  var z; try{ z = impUnzip(buf); }catch(e){ return Promise.reject(e); }
  if(z.then) return z;
  var dec = new TextDecoder(), parse = function(u){ return new DOMParser().parseFromString(dec.decode(u),'application/xml'); };
  var sheets = z.names.filter(function(n){ return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(function(a,b){ return parseInt(a.replace(/\D/g,''),10)-parseInt(b.replace(/\D/g,''),10); });
  if(!sheets.length) return Promise.reject(new Error('nosheet'));
  return Promise.all([z.get('xl/sharedStrings.xml'),z.get(sheets[0])]).then(function(r){
    var ss = [];
    if(r[0]){
      var sd = parse(r[0]).getElementsByTagName('si');
      for(var i = 0; i < sd.length; i++){ var ts = sd[i].getElementsByTagName('t'), t = ''; for(var k = 0; k < ts.length; k++) t += ts[k].textContent; ss.push(t); }
    }
    var cells = parse(r[1]).getElementsByTagName('row'), rows = [];
    for(var ri = 0; ri < cells.length; ri++){
      var rn = parseInt(cells[ri].getAttribute('r'),10)-1, cs = cells[ri].getElementsByTagName('c'), row = [];
      for(var ci = 0; ci < cs.length; ci++){
        var c = cs[ci], t2 = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
        if(t2==='s') val = v ? (ss[parseInt(v.textContent,10)]||'') : '';
        else if(t2==='inlineStr'){ var it = c.getElementsByTagName('t'); for(var q = 0; q < it.length; q++) val += it[q].textContent; }
        else val = v ? v.textContent : '';
        row[impColIdx(c.getAttribute('r'))] = val;
      }
      rows[isNaN(rn) ? rows.length : rn] = row;
    }
    var out = []; for(var x = 0; x < rows.length; x++) out.push(rows[x]||[]);
    return out;
  });
}
var IMP_FIELDS = [
  {k:'pack',kw:['كرتون','علبه','عبوه','pack','carton','box']},
  {k:'cost',kw:['جمله','تكلف','شراء','cost','wholesale','purchase']},
  {k:'barcode',kw:['باركود','barcode','sku','كود']},
  {k:'qty',kw:['كميه','رصيد','مخزون','الفاضل','عدد','qty','quantity','stock','balance']},
  {k:'name',kw:['صنف','اسم','منتج','بيان','name','item','product','description']},
  {k:'price',kw:['سعربيع','سعرالبيع','بيع','سعر','price','sell','retail']}
];
function impGuess(head){
  var used = {}, g = {};
  IMP_FIELDS.forEach(function(f){
    for(var i = 0; i < head.length; i++){
      if(used[i]) continue; var h = impNorm(head[i]); if(!h) continue;
      if(f.kw.some(function(w){ return h.indexOf(w)>=0; })){ g[f.k] = i; used[i] = true; return; }
    }
  });
  return g;
}
function impFill(rows){
  var head = rows[0].map(function(h){ return String(h==null?'':h).trim(); }), g = impGuess(head), w = Math.max.apply(null,rows.slice(0,50).map(function(r){ return r.length; }).concat([head.length]));
  var opts = function(req){ var h = req ? '' : '<option value="-1">— مفيش —</option>'; for(var i = 0; i < w; i++) h += '<option value="'+i+'">'+esc(head[i] ? head[i] : 'عمود '+(i+1))+'</option>'; return h; };
  ['name','price'].forEach(function(k){ $('#imp-c-'+k).innerHTML = opts(true); $('#imp-c-'+k).value = g[k]!=null ? g[k] : (k==='name' ? 0 : Math.min(1,w-1)); });
  ['cost','qty','barcode','pack'].forEach(function(k){ $('#imp-c-'+k).innerHTML = opts(false); $('#imp-c-'+k).value = g[k]!=null ? g[k] : -1; });
  $('#imp-info').textContent = 'لقيت '+fmt(rows.length-1)+' صف في الملف. راجع إن كل عمود مختار صح، وبعدين اضغط استورد.';
  impPreview();
}
function impParse(){
  var col = function(k){ return parseInt($('#imp-c-'+k).value,10); }, c = {name:col('name'),price:col('price'),cost:col('cost'),qty:col('qty'),barcode:col('barcode'),pack:col('pack')};
  var items = [], bad = 0, seen = {};
  for(var i = 1; i < impRows.length; i++){
    var r = impRows[i], name = String(r[c.name]==null ? '' : r[c.name]).trim();
    if(!name && !r.some(function(x){ return String(x||'').trim(); })) continue;
    var price = impNum(r[c.price]);
    if(!name || !(price>=0)){ bad++; continue; }
    var qty = c.qty>=0 ? impNum(r[c.qty]) : 0, cost = c.cost>=0 ? impNum(r[c.cost]) : NaN, pk = c.pack>=0 ? Math.floor(impNum(r[c.pack])) : 0;
    var bc = c.barcode>=0 ? String(r[c.barcode]==null ? '' : r[c.barcode]).trim() : '';
    var kb = bc ? 'b'+bc : '', kn = 'n'+name.toLowerCase();
    if((kb && seen[kb]) || seen[kn]){ bad++; continue; } if(kb) seen[kb] = 1; seen[kn] = 1;
    items.push({name:name,price:round(price),qty:(qty>=0 ? round(qty) : 0),cost:(cost>=0 ? round(cost) : null),pack:(pk>1 ? pk : 0),barcode:bc,hasQty:(c.qty>=0 && qty>=0),hasCost:(c.cost>=0 && cost>=0)});
  }
  return {items:items,bad:bad};
}
function impPreview(){
  if(!impRows) return;
  var r = impParse(), f = r.items.slice(0,3).map(function(x){ return x.name+' — '+fmt(x.price)+' ج'+(x.qty ? ' — كمية '+fmt(x.qty) : ''); }).join('  |  ');
  $('#imp-prev').textContent = 'هيتستورد '+fmt(r.items.length)+' صنف'+(r.bad ? ' (و'+fmt(r.bad)+' صف هيتخطى: اسم فاضي أو سعر غلط أو مكرر)' : '')+(f ? '. مثال: '+f : '.');
  $('#imp-go').disabled = !r.items.length;
}
function impHandleFile(file){
  impMsg('بقرا الملف…'); $('#imp-map').hidden = true; impRows = null;
  var isX = /\.xlsx$/i.test(file.name);
  var fr = new FileReader();
  fr.onerror = function(){ impMsg('معرفتش أقرا الملف.',true); };
  fr.onload = function(){
    var done = function(rows){
      rows = (rows||[]).filter(function(r){ return r && r.some(function(x){ return String(x==null?'':x).trim(); }); });
      if(rows.length<2){ impMsg('الملف فاضي أو فيه صف العناوين بس.',true); return; }
      if(rows.length>5001){ impMsg('الملف كبير (أكتر من 5000 صنف). قسّمه على ملفين.',true); return; }
      impRows = rows; impMsg(''); impFill(rows); $('#imp-map').hidden = false;
    };
    if(isX) impXlsx(fr.result).then(done,function(e){ impMsg(e && e.message==='nodecomp' ? 'المتصفح ده قديم ومش بيقرا ملفات Excel. احفظ الملف CSV واختاره.' : 'معرفتش أقرا ملف Excel. تأكد إنه .xlsx، أو احفظه CSV.',true); });
    else done(impCsv(new TextDecoder('utf-8').decode(new Uint8Array(fr.result))));
  };
  fr.readAsArrayBuffer(file);
}
$('#imp-pick').addEventListener('click',function(){ $('#imp-file').click(); });
$('#imp-file').addEventListener('change',function(e){ var f = e.target.files[0]; e.target.value = ''; if(f) impHandleFile(f); });
$('#imp-cancel').addEventListener('click',function(){ impRows = null; $('#imp-map').hidden = true; impMsg(''); });
['name','price','cost','qty','barcode','pack'].forEach(function(k){ $('#imp-c-'+k).addEventListener('change',impPreview); });
$('#imp-tpl').addEventListener('click',function(){
  var rows = [['اسم الصنف','سعر البيع','سعر الجملة','الكمية','الباركود','عدد القطع في الكرتونة'],['مياه 600 مل',5,3.5,48,'6221234567890',12],['سكر 1 كجم',32,27,20,'',0]];
  var blob = xlsxFromSheets([['الأصناف',rows,[28,12,12,10,18,22]]]), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'makhzani-items-template.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); },1000);
});
$('#imp-go').addEventListener('click',function(){
  if(impBusy || !impRows) return;
  if(!isOwner()){ toast('الاستيراد للمالك بس',true); return; }
  if(!ready()) return;
  var r = impParse(), mode2 = $('#imp-dup').value, byB = {}, byN = {}, added = 0, upd = 0, skipped = 0, i = 0;
  products.forEach(function(p){ if(p.barcode) byB[p.barcode] = p; byN[p.name.toLowerCase()] = p; });
  impBusy = true; $('#imp-go').disabled = true; holdRender(true);
  (function step(){
    var end = Math.min(i+40,r.items.length);
    for(; i < end; i++){
      var x = r.items[i], old = (x.barcode && byB[x.barcode]) || byN[x.name.toLowerCase()];
      if(old){
        if(mode2==='skip'){ skipped++; continue; }
        putProduct(Object.assign({},old,{name:x.name,price:x.price,pack:x.pack||old.pack||0,barcode:x.barcode||old.barcode||'',qty:x.hasQty ? x.qty : old.qty,cost:x.hasCost ? x.cost : (old.cost==null ? null : old.cost)})); upd++;
      } else {
        var np = {id:uid(),name:x.name,price:x.price,qty:x.qty,cost:x.cost,barcode:x.barcode,pack:x.pack,sold:0,revenue:0,created:Date.now()+i};
        putProduct(np); added++; if(np.barcode) byB[np.barcode] = np; byN[np.name.toLowerCase()] = np;
      }
    }
    impMsg('بستورد… '+fmt(i)+' من '+fmt(r.items.length));
    if(i<r.items.length){ setTimeout(step,30); return; }
    logA('addp','استيراد أصناف من Excel: '+fmt(added)+' جديد، '+fmt(upd)+' اتحدّث، '+fmt(skipped)+' اتخطّى');
    impBusy = false; impRows = null; $('#imp-map').hidden = true; holdRender(false);
    impMsg('تمام: اتضاف '+fmt(added)+' صنف جديد'+(upd ? '، واتحدّث '+fmt(upd) : '')+(skipped ? '، واتخطّى '+fmt(skipped)+' موجودين قبل كده' : '')+'.');
    toast('اتستورد '+fmt(added+upd)+' صنف');
  })();
});

/* نسخة كاملة + ملف Excel مقروء (لرفعهم على Drive) */
window.mkBackupBundle = function(cb){ mkBackupData(function(data){ cb(data, buildExcelBlob(data.sales||[])); }); };