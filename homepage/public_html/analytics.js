/* =====================================================================
   East-one ホームページ アクセス解析（GA4 / Microsoft Clarity）
   全ページ（index / juyojiko / privacy / 404）から読み込む。

   ▼ ここに ID を入れるだけで計測が始まります。空のあいだは何も読み込まず、何も送信しません。
     GA4     … 「G-」で始まる測定ID（GA4 管理 → データストリーム → ウェブ で確認）
     Clarity … プロジェクトID（Clarity の Settings → Overview で確認。英数字10桁前後）
   ===================================================================== */
var EASTONE_GA4_ID = '';      // 例: 'G-XXXXXXXXXX'
var EASTONE_CLARITY_ID = '';  // 例: 'abcd123456'

/* ---------------------------------------------------------------------
   送るイベント（GA4 の「イベント」レポートにこの名前で出る）
     tel_tap          電話番号のタップ（store=本店/三島店/長泉店）
     line_click       公式LINE「友だち追加」
     trial_click      「見学・無料体験」へのボタン
     instagram_click  Instagram へのリンク
     nav_click        ページ内のメニュー・ボタン、重要事項などのページへのリンク
     outbound_click   運営会社・採用情報など、ほかのサイトへのリンク
     section_view     各セクションを1秒以上表示した（section=セクション名）
   共通のパラメータ
     link_text        押されたボタン・リンクの文字
     link_location    押された場所（ヘッダー／ヒーロー／施設一覧 など）
     link_url         リンク先
   詳しくは homepage/docs/analytics.md
   --------------------------------------------------------------------- */
(function(){
  var ga = EASTONE_GA4_ID, cl = EASTONE_CLARITY_ID;
  if(!ga && !cl) return;

  /* Microsoft Clarity（ヒートマップ・操作の録画） */
  if(cl){
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", cl);
  }

  /* Google アナリティクス 4 */
  if(ga){
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    // アドレスの最後に ?debug=1 を付けて開くと、GA4 の DebugView で送信内容をその場で確認できる
    var debug = /[?&]debug=1(&|$)/.test(location.search);
    gtag('config', ga, debug ? {debug_mode: true} : {});
  }

  /* GA4 と Clarity の両方に同じイベントを送る */
  function send(name, params){
    if(ga) gtag('event', name, params);
    if(cl) window.clarity('event', name);
  }

  /* 押された場所を日本語の名前にする（レポートで読みやすくするため） */
  var PLACE = {
    header:'ヘッダー', top:'ヒーロー', entrance:'2つの入口', concept:'East-oneとは',
    why:'半日型の理由', program:'プログラム', flow:'1日の流れ', voices:'利用者様の声',
    trial:'見学・体験の流れ', stores:'施設一覧', caremanager:'ケアマネージャーの方へ',
    fee:'費用', contact:'お問い合わせ', footer:'フッター', nav:'メニュー',
    common:'重要事項：共通', honten:'重要事項：本店', mishima:'重要事項：三島店', nagaizumi:'重要事項：長泉店'
  };
  var STORE_BY_TEL = {'0559417807':'本店', '0559886006':'三島店', '0559555185':'長泉店'};

  function placeOf(el){
    var box = el.closest('section[id], header, footer, nav');
    if(!box) return 'その他';
    var key = box.id || box.tagName.toLowerCase();
    return PLACE[key] || key;
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if(!a) return;
    var href = a.getAttribute('href') || '';
    var p = {
      // カード型のリンク（2つの入口など）は説明文を除いて見出しだけにする
      link_text: ((a.querySelector('strong') || a).textContent || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      link_location: placeOf(a),
      link_url: href.slice(0, 100)
    };
    if(!p.link_text){ var img = a.querySelector('img[alt]'); if(img) p.link_text = img.alt.slice(0, 50); }

    if(href.indexOf('tel:') === 0){
      var num = href.slice(4).replace(/\D/g, '');
      p.store = STORE_BY_TEL[num] || num;
      send('tel_tap', p);
    }else if(href.indexOf('lin.ee') !== -1 || href.indexOf('line.me') !== -1){
      send('line_click', p);
    }else if(href.indexOf('instagram.com') !== -1){
      send('instagram_click', p);
    }else if(/#contact$/.test(href)){
      send('trial_click', p);
    }else if(/^https?:/.test(href) && a.hostname !== location.hostname){
      send('outbound_click', p);
    }else{
      send('nav_click', p);
    }
  });

  /* どこまで読まれたか（各セクションが1秒以上画面に入っていたら1回だけ送信。
     ボタンで #contact へ移動するときに通り過ぎただけのセクションは数えない） */
  if(!document.getElementById('top') || !('IntersectionObserver' in window)) return;  // トップページだけ
  var timers = {};
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      var id = en.target.id;
      if(!en.isIntersecting){ clearTimeout(timers[id]); return; }
      timers[id] = setTimeout(function(){
        send('section_view', {section: PLACE[id] || id});
        io.unobserve(en.target);
      }, 1000);
    });
  }, {threshold: 0.25});
  ['concept','why','program','flow','voices','trial','stores','caremanager','fee','contact'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && el.tagName === 'SECTION') io.observe(el);
  });
})();
