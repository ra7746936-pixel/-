/* مخزني — الاتصال بـ Firebase.
   إعدادات الاتصال دي عامة (مش أسرار). الحماية الحقيقية في قواعد Firestore (ملف firestore.rules).
   الفتح من ملف على الجهاز (file://) أو بإضافة ?local للرابط = الوضع المحلي القديم من غير سحابة. */
(function(){
  var CFG = {
    apiKey: "AIzaSyBHHvaYyh4Z_lhpD2TNW9D_48eO-IAIyzg",
    authDomain: "makhzani-16e1e.firebaseapp.com",
    projectId: "makhzani-16e1e",
    storageBucket: "makhzani-16e1e.firebasestorage.app",
    messagingSenderId: "24820958119",
    appId: "1:24820958119:web:c7f9107875f0694848ec82"
  };
  var SDK_VERSION = '13.2.0';
  window.FB_CONFIG = CFG;
  window.FB_ADMIN_UID = 'dqK2AqfNGIMSlQ6UkWcLPxC32Uh1';

  function fire(n){ try{ window.dispatchEvent(new Event(n)); }catch(e){} }

  /* بديل للاختبار بس */
  if(window.FB_FAKE){
    window.FB = window.FB_FAKE; window.CLOUD_ON = true;
    setTimeout(function(){ fire('fb-ready'); },0);
    return;
  }
  /* ?local بيشتغل على جهازك إنت بس (localhost). على الرابط المنشور مبيفتحش الوضع المحلي. */
  var isDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if(location.protocol.indexOf('http')!==0 || (isDev && /[?&]local\b/.test(location.search))) return;

  window.CLOUD_ON = true;
  var base = 'https://www.gstatic.com/firebasejs/'+SDK_VERSION+'/';
  Promise.all([
    import(base+'firebase-app.js'),
    import(base+'firebase-auth.js'),
    import(base+'firebase-firestore.js')
  ]).then(function(m){
    var A = m[0], Au = m[1], F = m[2];
    /* جلسة دخول مستقلة لكل صفحة: الأدمن بيحط FB_APP_NAME عشان ميتشاركش الجلسة مع التطبيق */
    var app = window.FB_APP_NAME ? A.initializeApp(CFG,window.FB_APP_NAME) : A.initializeApp(CFG);
    var auth = Au.getAuth(app);
    var fs = F.getFirestore(app);
    window.FB = {
      onUser: function(cb){ return Au.onAuthStateChanged(auth,cb); },
      user: function(){ return auth.currentUser; },
      signIn: function(email,pass){
        return Au.signInWithEmailAndPassword(auth,email,pass).then(function(c){ return c.user; });
      },
      reauth: function(pass){
        var u = auth.currentUser;
        if(!u || !u.email) return Promise.reject({code:'auth/no-user'});
        return Au.signInWithEmailAndPassword(auth,u.email,pass).then(function(){ return true; });
      },
      signOut: function(){ return Au.signOut(auth); },
      reset: function(email){ return Au.sendPasswordResetEmail(auth,email); },
      get: function(path){
        return F.getDoc(F.doc(fs,path)).then(function(s){ return s.exists() ? s.data() : null; });
      },
      set: function(path,data,merge){
        return merge ? F.setDoc(F.doc(fs,path),data,{merge:true}) : F.setDoc(F.doc(fs,path),data);
      },
      list: function(path){
        return F.getDocs(F.collection(fs,path)).then(function(q){
          return q.docs.map(function(d){ var v = d.data(); v.id = d.id; return v; });
        });
      },
      newId: function(path){ return F.doc(F.collection(fs,path)).id; },
      /* إنشاء حساب لعميل من غير ما يتسجّل خروج الأدمن (تطبيق تاني جوه نفس الصفحة) */
      createUser: function(email,pass){
        var sec;
        try{ sec = A.getApp('sec'); }catch(e){ sec = A.initializeApp(CFG,'sec'); }
        var sa = Au.getAuth(sec);
        return Au.createUserWithEmailAndPassword(sa,email,pass).then(function(c){
          var uid = c.user.uid;
          return Au.signOut(sa).then(function(){ return uid; });
        });
      }
    };
    fire('fb-ready');
  }).catch(function(e){
    window.FB_ERR = e;
    fire('fb-failed');
  });
})();