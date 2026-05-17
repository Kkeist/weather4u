/* 渲染层：真实数据填页面；天气/新闻切换；换城市、日夜、12/24 制，选择都记住。
   交互全用点击(tap)，失败如实显示不假装。 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LS = window.localStorage;
  // 城市选择：新格式存 {name,province,city,county} 的 JSON；兼容旧版纯名字字符串
  function loadCitySel() {
    var raw = LS.getItem('app_city');
    if (!raw) return null;
    try { var o = JSON.parse(raw); if (o && (o.province || o.name)) return o; } catch (e) {}
    return { name: raw, province: '', city: '', county: '' };
  }
  var NEWS_FIRST = 90;                            // 首屏新闻条数（和服务端一致）
  var state = {
    city: loadCitySel(),
    clock12: LS.getItem('app_clock12') === '1',
    dark: LS.getItem('app_dark') === '1',
    newsCat: LS.getItem('app_news_cat') || '',    // 空 = 全部
    newsMax: NEWS_FIRST                           // 当前已要到第几条，「看更早的」会加大
  };
  var newsCache = [];
  var newsLoading = false;
  var NEWS_ALL = '全部';                          // 筛选条里「看全部」那一项的文字

  // 日夜图标：白天显示月亮(点了进夜间)，夜间显示太阳(点了回白天)
  var SVG_MOON = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z"/></svg>';
  var SVG_SUN = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><line x1="12" y1="2" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="22"/><line x1="2" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/></svg>';

  applyMode();
  applyClockLabel();

  function fmtHour(h, isFirst) {
    if (isFirst) return '现在';
    if (!state.clock12) return h + '时';
    if (h === 0) return '凌晨12点';
    if (h < 6) return '凌晨' + h + '点';
    if (h < 12) return '上午' + h + '点';
    if (h === 12) return '中午12点';
    if (h < 18) return '下午' + (h - 12) + '点';
    return '晚上' + (h - 12) + '点';
  }

  // ---- 天气 ----
  function renderWeather(w) {
    state.city = w.city;
    $('cityName').textContent = w.city;
    $('cityHint').textContent = w.located ? '已自动定位 · 点这里换城市' : '点这里换城市';
    $('nowDate').textContent = fmtDate(w.updatedAt);
    $('updatedAt').textContent = '更新于 ' + fmtTime(w.updatedAt);

    var c = w.current;
    $('nowIcon').textContent = WeatherIcons.emoji(c.type);
    $('nowTemp').textContent = c.temp + '°';
    $('nowDesc').textContent = c.desc;
    $('nowFeel').textContent = c.feel + '°';
    $('nowHumidity').textContent = c.humidity;
    // 风：风向一行、风力一行，永远整齐两行，不会在「3-4级」中间难看地断开
    var wind = String(c.wind == null ? '--' : c.wind).trim();
    var ws = wind.indexOf(' ');
    $('nowWind').innerHTML = ws > 0
      ? '<span>' + esc(wind.slice(0, ws)) + '</span><span>' + esc(wind.slice(ws + 1)) + '</span>'
      : esc(wind);
    $('nowAir').textContent = c.aqiName || '--';

    var today = w.daily && w.daily[0];
    $('nowRange').textContent = today ? ('最高 ' + today.max + '°  最低 ' + today.min + '°') : '';

    // 下雨信息按天融进「本周天气」（见下），大头不再放整块红条
    $('nowPop').hidden = true;

    var box = $('alertBox');
    if (w.alerts && w.alerts.length) {
      box.innerHTML = w.alerts.map(function (a) {
        return '<div class="alert-item"><span class="alert-emoji">⚠️</span>' +
               '<div><div class="alert-title">' + esc(a.title) + '</div>' +
               '<div class="alert-text">' + esc(a.text) + '</div></div></div>';
      }).join('');
      box.hidden = false;
    } else { box.hidden = true; }

    $('hourlyScroll').innerHTML = buildHourlyChart(w.hourly);

    // 每天一小列横排在同一个框里；最高/最低写出文字，不只是两个数字
    $('dailyList').innerHTML = w.daily.map(function (d) {
      var air = d.aqiName ? '<div class="day-air">空气' + esc(d.aqiName) + '</div>' : '';
      // 恶劣天气(雨/雷/雪)那天只把天气词变色，不另起一行字
      var wet = /雨|雷|雪/.test(String(d.desc || '')) ? ' wet' : '';
      return '<div class="day-col">' +
               '<div class="day-name">' + esc(d.day) + '</div>' +
               '<div class="day-date">' + esc(d.date || '') + '</div>' +
               '<div class="day-icon">' + WeatherIcons.emoji(d.type) + '</div>' +
               '<div class="day-desc' + wet + '">' + esc(d.desc) + '</div>' +
               '<div class="day-hi"><span class="lab">最高</span>' + d.max + '°</div>' +
               '<div class="day-lo"><span class="lab">最低</span>' + d.min + '°</div>' +
               air +
             '</div>';
    }).join('');
  }

  /* 逐小时温度：平滑曲线 + 面积渐变 + 当前点高亮，可左右滑。
     用 Catmull-Rom 把折点转成顺滑贝塞尔曲线，不再是难看的尖折线。 */
  function buildHourlyChart(hours) {
    var n = hours.length;
    if (!n) return '';
    var step = 64, W = n * step, H = 248;
    var lineTop = 60, lineBot = 150, emojiY = 182, descY = 206, timeY = 230;
    var temps = hours.map(function (h) { return h.temp; });
    var tMax = Math.max.apply(null, temps), tMin = Math.min.apply(null, temps);
    if (tMax === tMin) { tMax += 1; tMin -= 1; }
    var X = function (i) { return Math.round(step * i + step / 2); };
    var Y = function (t) { return Math.round(lineBot - (t - tMin) / (tMax - tMin) * (lineBot - lineTop)); };
    var pts = hours.map(function (h, i) { return [X(i), Y(h.temp)]; });

    // Catmull-Rom -> 三次贝塞尔
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1];
    }
    var areaBot = lineBot + 14;   // 渐变面积收口在折线下方一点，腾出图标/文字/时间三行
    var area = d + 'L' + pts[n - 1][0] + ',' + areaBot + 'L' + pts[0][0] + ',' + areaBot + 'Z';

    var p = [];
    p.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">');
    p.push('<defs><linearGradient id="htgrad" x1="0" y1="0" x2="0" y2="1">' +
           '<stop class="g1" offset="0"/><stop class="g2" offset="1"/></linearGradient></defs>');
    p.push('<path class="ht-area" d="' + area + '"/>');
    p.push('<path class="ht-line" d="' + d + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
    hours.forEach(function (h, i) {
      var x = X(i), y = Y(h.temp), now = i === 0;
      p.push('<text class="ht-temp" x="' + x + '" y="' + (y - 14) + '" text-anchor="middle" font-size="17">' + h.temp + '°</text>');
      if (now) p.push('<g class="ht-now"><circle cx="' + x + '" cy="' + y + '" r="6"/></g>');
      else p.push('<circle class="ht-dot" cx="' + x + '" cy="' + y + '" r="4" stroke-width="2.5"/>');
      p.push('<text x="' + x + '" y="' + emojiY + '" text-anchor="middle" font-size="22">' + WeatherIcons.emoji(h.type) + '</text>');
      p.push('<text class="ht-wx" x="' + x + '" y="' + descY + '" text-anchor="middle" font-size="14">' + esc(h.desc) + '</text>');
      p.push('<text class="ht-sub" x="' + x + '" y="' + timeY + '" text-anchor="middle" font-size="15">' + esc(fmtHour(h.hour, now)) + '</text>');
    });
    p.push('</svg>');
    return p.join('');
  }

  // ---- 新闻 ----
  function renderNews(list) {
    newsCache = list || [];
    buildNewsFilter();
    renderNewsList();
  }

  // 「看更早的新闻」按钮：还可能有更早的就给按钮，到底了说人话
  function renderMoreBtn(failed) {
    var box = $('newsMore');
    if (!newsCache.length) { box.innerHTML = ''; return; }
    if (newsLoading) { box.innerHTML = '<div class="news-more-tip">正在找更早的新闻…</div>'; return; }
    if (failed) {
      box.innerHTML = '<button id="moreBtn" class="news-more-btn" type="button">没找到，点这里再试一次</button>';
    } else if (newsCache.length >= state.newsMax) {
      box.innerHTML = '<button id="moreBtn" class="news-more-btn" type="button">看更早的新闻</button>';
    } else {
      box.innerHTML = '<div class="news-more-tip">已经到最早的了</div>';
    }
    var b = $('moreBtn');
    if (b) b.addEventListener('click', loadMoreNews);
  }

  // 分类筛选条：分类按当前新闻里实际有的动态生成，不写死
  function buildNewsFilter() {
    var box = $('newsFilter');
    if (!newsCache.length) { box.innerHTML = ''; return; }
    var cats = [];
    newsCache.forEach(function (n) {
      if (n.category && cats.indexOf(n.category) < 0) cats.push(n.category);
    });
    if (state.newsCat && cats.indexOf(state.newsCat) < 0) state.newsCat = ''; // 选中的分类没了→回全部
    var chips = [NEWS_ALL].concat(cats);
    box.innerHTML = chips.map(function (c) {
      var val = c === NEWS_ALL ? '' : c;
      var on = state.newsCat === val ? ' on' : '';
      return '<button class="news-chip' + on + '" type="button" data-cat="' + esc(val) + '">' + esc(c) + '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.news-chip'), function (el) {
      el.addEventListener('click', function () {
        state.newsCat = el.getAttribute('data-cat') || '';
        LS.setItem('app_news_cat', state.newsCat);
        buildNewsFilter();
        renderNewsList();
      });
    });
  }

  function renderNewsList() {
    if (!newsCache.length) {
      $('newsList').innerHTML = stateMsg('暂时没有新闻，过一会儿再看看', true);
      $('newsMore').innerHTML = '';
      bindRetry(); return;
    }
    var list = state.newsCat
      ? newsCache.filter(function (n) { return n.category === state.newsCat; })
      : newsCache;
    if (!list.length) {
      $('newsList').innerHTML = stateMsg('这个分类暂时没有新闻，看看别的分类', false);
      renderMoreBtn();
      return;
    }
    $('newsList').innerHTML = list.map(function (n) {
      var thumb = n.image ? '<img class="news-thumb" src="' + esc(imgProxy(n.image)) + '" alt="" loading="lazy" onerror="this.remove()">' : '';
      return '<button class="news-card" type="button" data-id="' + esc(n.id) + '">' + thumb +
               '<span class="news-body">' +
                 '<span class="news-cat">' + esc(n.category) + '</span>' +
                 '<span class="news-title">' + esc(n.title) + '</span>' +
                 '<span class="news-meta">' + esc(n.source) + ' · ' + esc(n.time) + '</span>' +
               '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('newsList').querySelectorAll('.news-card'), function (el) {
      el.addEventListener('click', function () { openReader(el.getAttribute('data-id')); });
    });
    renderMoreBtn();
  }

  function openReader(id) {
    var n = newsCache.filter(function (x) { return x.id === id; })[0];
    if (!n) return;
    // 主图放正文顶部，央视视频稿没内文图时也至少有这张
    var lead = n.image ? '<img src="' + esc(imgProxy(n.image)) + '" alt="" onerror="this.remove()">' : '';
    var head =
      '<span class="reader-cat">' + esc(n.category) + '</span>' +
      '<h1 class="reader-title">' + esc(n.title) + '</h1>' +
      '<div class="reader-meta">' + esc(n.source) + ' · ' + esc(n.time) + '</div>' + lead;
    function blocksHtml(blocks) {
      return blocks.map(function (b) {
        if (b.t === 'img') return '<img src="' + esc(imgProxy(b.v)) + '" alt="" loading="lazy" onerror="this.remove()">';
        return '<p>' + esc(b.v) + '</p>';
      }).join('');
    }
    function render(blocks, loading) {
      $('readerBody').innerHTML = head + blocksHtml(blocks) +
        (loading ? '<p class="reader-loading">正在加载全文…</p>' : '');
    }
    var initial = n.summary ? [{ t: 'p', v: n.summary }] : [];
    render(initial, true);
    $('readerBody').scrollTop = 0;
    $('reader').hidden = false;
    DataSource.getArticle(n.url).then(function (r) {
      if (r && r.blocks && r.blocks.length) render(r.blocks, false);
      else render(initial, false);   // 抓不到全文就保留摘要，不假装
    }).catch(function () { render(initial, false); });
  }
  $('readerBack').addEventListener('click', function () { $('reader').hidden = true; });

  // 连不上时不显示一堆零碎 error，而是盖一个全屏人话引导
  function showNetGuide(mode) {
    var msg = mode === 'file'
      ? '你是直接打开了网页文件，这样读不到数据。<br><br>请回到那个文件夹，<b>双击「启动天气新闻」</b>，等黑色小窗口出现、浏览器会<b>自动打开</b>，就能用了。'
      : '没连上后台服务。<br><br>请检查那个<b>黑色小窗口还开着没</b>（关掉天气新闻就停了）。<br>没有就<b>双击「启动天气新闻」</b>重新打开一次。';
    $('netMsg').innerHTML = msg;
    $('netGuide').hidden = false;
  }
  $('netRetry').addEventListener('click', function () { location.reload(); });

  // ---- 加载 ----
  function loadWeather() {
    DataSource.getWeather(state.city).then(function (w) {
      $('netGuide').hidden = true; renderWeather(w);
    }).catch(function () { showNetGuide('down'); });
  }
  function loadNews() {
    state.newsMax = NEWS_FIRST;
    newsLoading = false;
    $('newsList').innerHTML = stateMsg('正在加载新闻…', false);
    $('newsMore').innerHTML = '';
    DataSource.getNews(state.newsMax).then(renderNews).catch(function () { showNetGuide('down'); });
  }

  // 看更早的：要更多条（服务端从合并去重的池子里多给一截），保留当前滚动位置不跳走
  function loadMoreNews() {
    if (newsLoading || newsCache.length < state.newsMax) return;
    newsLoading = true;
    state.newsMax += NEWS_FIRST;
    renderMoreBtn();
    var y = window.scrollY;
    DataSource.getNews(state.newsMax).then(function (list) {
      newsLoading = false;
      renderNews(list);
      window.scrollTo(0, y);
    }).catch(function () {
      newsLoading = false;
      state.newsMax -= NEWS_FIRST;
      renderMoreBtn(true);
    });
  }
  function stateMsg(t, retry) {
    return '<div class="state-msg">' + esc(t) +
           (retry ? '<br><button id="retryBtn" type="button">重新加载</button>' : '') + '</div>';
  }
  function bindRetry() {
    var b = $('retryBtn');
    if (b) b.addEventListener('click', function () { loadWeather(); loadNews(); });
  }

  // ---- 标签切换 ----
  function showPage(name) {
    var weather = name === 'weather';
    $('page-weather').hidden = !weather;
    $('page-news').hidden = weather;
    $('tab-weather').classList.toggle('tab-active', weather);
    $('tab-news').classList.toggle('tab-active', !weather);
    window.scrollTo(0, 0);
  }
  $('tab-weather').addEventListener('click', function () { showPage('weather'); });
  $('tab-news').addEventListener('click', function () { showPage('news'); });

  // ---- 换城市（常用城市快捷格 + 搜索全国任意城市） ----
  function setCity(sel) {
    state.city = sel;
    LS.setItem('app_city', JSON.stringify(sel));
    $('cityPanel').hidden = true;
    $('cityName').textContent = '加载中…';
    loadWeather();
  }

  function fillCityGrid() {
    DataSource.getCities().then(function (cities) {
      $('cityGrid').innerHTML = cities.map(function (c) {
        return '<button class="city-opt" type="button" data-c="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
      Array.prototype.forEach.call($('cityGrid').querySelectorAll('.city-opt'), function (el) {
        el.addEventListener('click', function () { setCity({ name: el.getAttribute('data-c') }); });
      });
    }).catch(function () {});
  }

  var citySearchResults = [];
  var citySearchTimer = null;
  var citySearchToken = 0;

  function showCityResults(html) {
    $('cityResults').innerHTML = html;
    $('cityResults').hidden = false;
    $('cityGrid').hidden = true;
    var note = document.querySelector('.city-note'); if (note) note.hidden = true;
  }
  function showCityGrid() {
    $('cityResults').hidden = true;
    $('cityResults').innerHTML = '';
    $('cityGrid').hidden = false;
    var note = document.querySelector('.city-note'); if (note) note.hidden = false;
  }

  function runCitySearch(q) {
    var token = ++citySearchToken;
    showCityResults('<div class="city-tip">正在找…</div>');
    DataSource.searchCities(q).then(function (list) {
      if (token !== citySearchToken) return;          // 旧请求结果作废，只认最后一次
      citySearchResults = list || [];
      if (!citySearchResults.length) {
        showCityResults('<div class="city-tip">没找到这个城市，换个说法再试试</div>');
        return;
      }
      showCityResults(citySearchResults.map(function (c, i) {
        var sub = c.sub ? '<span class="city-row-sub">' + esc(c.sub) + '</span>' : '';
        return '<button class="city-row" type="button" data-i="' + i + '">' +
                 '<span class="city-row-name">' + esc(c.name) + '</span>' + sub +
               '</button>';
      }).join(''));
      Array.prototype.forEach.call($('cityResults').querySelectorAll('.city-row'), function (el) {
        el.addEventListener('click', function () {
          setCity(citySearchResults[parseInt(el.getAttribute('data-i'), 10)]);
        });
      });
    }).catch(function () {
      if (token !== citySearchToken) return;
      showCityResults('<div class="city-tip">没连上，关掉再搜一次</div>');
    });
  }

  $('cityBtn').addEventListener('click', function () {
    $('citySearch').value = '';
    showCityGrid();
    fillCityGrid();
    $('cityPanel').hidden = false;
  });
  $('cityClose').addEventListener('click', function () { $('cityPanel').hidden = true; });
  $('citySearch').addEventListener('input', function () {
    var q = $('citySearch').value.trim();
    if (citySearchTimer) clearTimeout(citySearchTimer);
    if (!q) { showCityGrid(); return; }
    citySearchTimer = setTimeout(function () { runCitySearch(q); }, 280);
  });

  // ---- 日夜模式 ----
  function applyMode() {
    document.body.classList.toggle('dark', state.dark);
    $('modeIc').innerHTML = state.dark ? SVG_SUN : SVG_MOON;
    $('modeTx').textContent = state.dark ? '白天' : '夜间';
  }
  $('modeBtn').addEventListener('click', function () {
    state.dark = !state.dark;
    LS.setItem('app_dark', state.dark ? '1' : '0');
    applyMode();
  });

  // ---- 12 / 24 小时制（小字显示当前是哪种） ----
  function applyClockLabel() {
    $('clockTx').textContent = state.clock12 ? '12小时' : '24小时';
  }
  $('clockBtn').addEventListener('click', function () {
    state.clock12 = !state.clock12;
    LS.setItem('app_clock12', state.clock12 ? '1' : '0');
    applyClockLabel();
    loadWeather();
  });

  // ---- 工具 ----
  function fmtTime(ms) {
    var d = new Date(ms), h = d.getHours();
    if (state.clock12) {
      var ap = h < 12 ? '上午' : '下午', hh = h % 12; if (hh === 0) hh = 12;
      return ap + hh + ':' + pad(d.getMinutes());
    }
    return pad(h) + ':' + pad(d.getMinutes());
  }
  // 几月几号 + 星期几（老人一眼看清今天）
  // 公历日期 + 星期 + 农历 + 当天节气/中国节日（像日历一样）
  function fmtDate(ms) {
    var d = new Date(ms);
    var wk = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var s = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wk[d.getDay()];
    try {
      if (window.Lunar) {
        var L = window.Lunar.today(d);
        s += ' · 农历' + L.lunar;
        if (L.label) s += ' · ' + L.label;   // 节日优先，否则节气
      }
    } catch (e) { /* 农历算不出不影响公历显示 */ }
    return s;
  }
  // 图片统一走本机中转，避免源站防盗链/跨域，显示更稳
  function imgProxy(u) { return '/api/img?u=' + encodeURIComponent(u); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // 直接双击网页文件(file://)永远连不上 /api，先挡住给清楚指引，别让满屏 error
  if (location.protocol === 'file:') {
    showNetGuide('file');
  } else {
    loadWeather();
    loadNews();
  }
})();
