/* 公開資料（documents.html）：管理画面で登録した資料を files/documents.json から読み込んで並べる。
   data-docs="カテゴリ名" の付いた <ul> に、そのカテゴリの資料を新しい順に入れる。 */
(function(){
  var lists = document.querySelectorAll('[data-docs]');
  if(!lists.length) return;

  function size(n){
    if(!n) return '';
    return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
  }
  function date(d){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
  }
  function render(docs){
    lists.forEach(function(ul){
      var mine = docs.filter(function(d){ return d.category === ul.getAttribute('data-docs'); });
      ul.innerHTML = '';
      if(!mine.length){
        var li = document.createElement('li');
        li.className = 'doc-empty';
        li.textContent = '現在、掲載している資料はありません（準備中）。';
        ul.appendChild(li);
        return;
      }
      mine.forEach(function(d){
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = d.url;
        a.target = '_blank';
        a.rel = 'noopener';
        var t = document.createElement('span'); t.className = 'doc-title'; t.textContent = d.title; a.appendChild(t);
        var meta = document.createElement('span'); meta.className = 'doc-meta';
        meta.textContent = [date(d.date), d.type + (d.size ? '・' + size(d.size) : '')].filter(Boolean).join('　');
        a.appendChild(meta);
        li.appendChild(a);
        ul.appendChild(li);
      });
    });
  }
  fetch('files/documents.json', {cache: 'no-cache'})
    .then(function(r){ return r.ok ? r.json() : {documents: []}; })
    .then(function(j){ render(j.documents || []); })
    .catch(function(){ render([]); });
})();
