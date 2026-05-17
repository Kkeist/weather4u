/* APK 原生数据层：手机上没有黑窗口 server.js，改由这里直接抓真实数据。
   靠 Capacitor 的 CapacitorHttp（已在 capacitor.config 里 enabled）把 fetch
   转成安卓原生请求——天然没有跨域、能设 Referer/UA、自动解压 gzip/br。
   把 server.js 里那套抓取+解析逻辑原样搬到前端，返回结构与 /api/* 完全一致，
   所以 app.js / 渲染层一行都不用改。
   纯浏览器(开发期)下不激活：data.js 仅在 Capacitor 原生环境里切到这个 provider。 */
(function (global) {
  'use strict';

  var UA = 'Mozilla/5.0';

  // 文本抓取（utf-8 源：wis JSON / RSS / cctv jsonp）。CapacitorHttp 已原生绕过 CORS。
  function getText(url, headers) {
    var h = Object.assign({ 'User-Agent': UA }, headers || {});
    return fetch(url, { method: 'GET', headers: h }).then(function (r) { return r.text(); });
  }
  // 字节抓取（文章页可能是 GBK，要按原始字节自己定编码解码）
  function getBuf(url, headers) {
    var h = Object.assign({ 'User-Agent': UA }, headers || {});
    return fetch(url, { method: 'GET', headers: h }).then(function (r) { return r.arrayBuffer(); });
  }
  function decodeHtml(buf) {
    var bytes = new Uint8Array(buf);
    var head = '';
    for (var i = 0; i < Math.min(bytes.length, 1500); i++) head += String.fromCharCode(bytes[i]);
    var cs = (head.match(/charset=["']?\s*([\w-]+)/i) || [])[1] || 'utf-8';
    try { return new TextDecoder(cs).decode(buf); }
    catch (e) { try { return new TextDecoder('utf-8').decode(buf); } catch (e2) { return head; } }
  }

  // ---- 城市表（与 server.js 一致，作搜索失败时的回落） ----
  var CITIES = [
    ['北京','北京市','北京市'],['上海','上海市','上海市'],['天津','天津市','天津市'],['重庆','重庆市','重庆市'],
    ['广州','广东省','广州市'],['深圳','广东省','深圳市'],['东莞','广东省','东莞市'],['佛山','广东省','佛山市'],
    ['珠海','广东省','珠海市'],['杭州','浙江省','杭州市'],['宁波','浙江省','宁波市'],['温州','浙江省','温州市'],
    ['南京','江苏省','南京市'],['苏州','江苏省','苏州市'],['无锡','江苏省','无锡市'],['常州','江苏省','常州市'],
    ['徐州','江苏省','徐州市'],['成都','四川省','成都市'],['绵阳','四川省','绵阳市'],['武汉','湖北省','武汉市'],
    ['宜昌','湖北省','宜昌市'],['西安','陕西省','西安市'],['郑州','河南省','郑州市'],['洛阳','河南省','洛阳市'],
    ['长沙','湖南省','长沙市'],['济南','山东省','济南市'],['青岛','山东省','青岛市'],['烟台','山东省','烟台市'],
    ['潍坊','山东省','潍坊市'],['沈阳','辽宁省','沈阳市'],['大连','辽宁省','大连市'],['哈尔滨','黑龙江省','哈尔滨市'],
    ['长春','吉林省','长春市'],['石家庄','河北省','石家庄市'],['唐山','河北省','唐山市'],['保定','河北省','保定市'],
    ['太原','山西省','太原市'],['合肥','安徽省','合肥市'],['南昌','江西省','南昌市'],['福州','福建省','福州市'],
    ['厦门','福建省','厦门市'],['泉州','福建省','泉州市'],['昆明','云南省','昆明市'],['贵阳','贵州省','贵阳市'],
    ['南宁','广西壮族自治区','南宁市'],['桂林','广西壮族自治区','桂林市'],['海口','海南省','海口市'],['三亚','海南省','三亚市'],
    ['兰州','甘肃省','兰州市'],['西宁','青海省','西宁市'],['银川','宁夏回族自治区','银川市'],['呼和浩特','内蒙古自治区','呼和浩特市'],
    ['乌鲁木齐','新疆维吾尔自治区','乌鲁木齐市'],['拉萨','西藏自治区','拉萨市']
  ].map(function (a) { return { name: a[0], province: a[1], city: a[2] }; });

  // ---- 与 server.js 同步的纯函数 ----
  function weatherType(s) {
    s = s || '';
    if (s.indexOf('雷') >= 0) return 'thunder';
    if (s.indexOf('雪') >= 0) return 'snow';
    if (s.indexOf('暴雨') >= 0 || s.indexOf('大雨') >= 0) return 'heavyrain';
    if (s.indexOf('雨') >= 0) return 'rain';
    if (s.indexOf('雾') >= 0 || s.indexOf('霾') >= 0 || s.indexOf('沙') >= 0) return 'fog';
    if (s.indexOf('阴') >= 0) return 'cloudy';
    if (s.indexOf('多云') >= 0 || s.indexOf('少云') >= 0) return 'partly';
    if (s.indexOf('晴') >= 0) return 'sunny';
    return 'cloudy';
  }
  function weekday(ymd) {
    var w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return w[new Date(ymd + 'T00:00:00').getDay()];
  }
  var ENT = {
    nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', bdquo: '„',
    mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•',
    times: '×', divide: '÷', deg: '°', permil: '‰', prime: '′', Prime: '″',
    copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', laquo: '«', raquo: '»',
    lsaquo: '‹', rsaquo: '›', emsp: ' ', ensp: ' ', thinsp: ' ', shy: ''
  };
  function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var code = e.charAt(1) === 'x' || e.charAt(1) === 'X'
          ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(code) ? m : String.fromCodePoint(code);
      }
      return ENT.hasOwnProperty(e) ? ENT[e] : m;
    });
  }
  function clean(s) {
    return decodeEntities((s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ').trim();
  }
  function relTime(ms) {
    if (!ms) return '';
    var diff = (Date.now() - ms) / 1000;
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    var d = new Date(ms);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function parseRss(xml, source, category) {
    var items = [], blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var t = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      var link = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
      var desc = (b.match(/<description>([\s\S]*?)<\/description>/) || [])[1];
      var pd = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      if (!t || !link) continue;
      var ms = 0;
      if (pd) { var p = Date.parse(clean(pd)); if (!isNaN(p)) ms = p; }
      var img = (String(desc || '').match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
      if (img) { try { img = new URL(img, clean(link)).href; } catch (e) { img = ''; } }
      items.push({ title: clean(t), url: clean(link), source: source, category: category,
        ms: ms, time: relTime(ms), summary: clean(desc), image: img });
    }
    return items;
  }

  // ---- 城市搜索 / 解析 ----
  function searchCities(q) {
    if (!q || !q.trim()) return Promise.resolve([]);
    return getText('https://wis.qq.com/city/like?source=pc&city=' + encodeURIComponent(q.trim())).then(function (txt) {
      var map = (JSON.parse(txt) || {}).data || {};
      var out = [], seen = {};
      Object.keys(map).forEach(function (k) {
        var parts = String(map[k]).split(/,\s*/).filter(Boolean);
        if (!parts.length) return;
        var province = parts[0], city = parts[1] || parts[0], county = parts[2] || '';
        var name = county || city;
        var sub = county ? (city + '，' + province) : (province === city ? '' : province);
        var key = province + '|' + city + '|' + county;
        if (seen[key]) return; seen[key] = 1;
        out.push({ name: name, sub: sub, province: province, city: city, county: county });
      });
      return out;
    }).catch(function () { return []; });
  }
  function resolveCity(name) {
    if (name && String(name).trim()) {
      return searchCities(name).then(function (r) {
        if (r && r.length) return r[0];
        var hit = CITIES.filter(function (c) { return name.indexOf(c.name) >= 0 || c.name.indexOf(name) >= 0; })[0];
        if (hit) return { name: hit.name, sub: '', province: hit.province, city: hit.city, county: '' };
        var sh = CITIES[1];
        return { name: sh.name, sub: '', province: sh.province, city: sh.city, county: '' };
      });
    }
    var sh = CITIES[1];
    return Promise.resolve({ name: sh.name, sub: '', province: sh.province, city: sh.city, county: '' });
  }

  function buildWeather(sel, located) {
    var pSel = (sel && typeof sel === 'object' && sel.province) ? Promise.resolve(sel) : resolveCity(sel);
    return pSel.then(function (c) {
      var url = 'https://wis.qq.com/weather/common?source=pc&weather_type=observe%7Cforecast_1h%7Cforecast_24h%7Cair%7Calarm'
        + '&province=' + encodeURIComponent(c.province) + '&city=' + encodeURIComponent(c.city)
        + (c.county ? '&county=' + encodeURIComponent(c.county) : '');
      return getText(url).then(function (txt) {
        var d = (JSON.parse(txt) || {}).data || {};
        var ob = d.observe || {};
        var h1 = d.forecast_1h || {};
        var hourly = Object.keys(h1).map(function (k) { return h1[k]; })
          .sort(function (a, b) { return a.update_time.localeCompare(b.update_time); })
          .slice(0, 24)
          .map(function (x) {
            return { hour: parseInt(String(x.update_time).slice(8, 10), 10),
              type: weatherType(x.weather_short || x.weather),
              temp: Math.round(parseFloat(x.degree)), desc: x.weather_short || x.weather };
          });
        var todayYmd = new Date().toISOString().slice(0, 10);
        var f24 = d.forecast_24h || {};
        var daily = Object.keys(f24).map(function (k) { return f24[k]; })
          .filter(function (x) { return x.time >= todayYmd; })
          .sort(function (a, b) { return a.time.localeCompare(b.time); })
          .slice(0, 7)
          .map(function (x, i) {
            return { day: i === 0 ? '今天' : i === 1 ? '明天' : i === 2 ? '后天' : weekday(x.time),
              date: parseInt(x.time.slice(5, 7), 10) + '月' + parseInt(x.time.slice(8, 10), 10) + '日',
              type: weatherType(x.day_weather_short || x.day_weather),
              desc: x.day_weather_short || x.day_weather,
              max: parseInt(x.max_degree, 10), min: parseInt(x.min_degree, 10),
              aqiName: x.aqi_name || '' };
          });
        var alerts = (Array.isArray(d.alarm) ? d.alarm : Object.keys(d.alarm || {}).map(function (k) { return d.alarm[k]; }))
          .map(function (a) {
            return { title: (a.type_name || a.type || '预警') + (a.level_name ? ' ' + a.level_name : ''),
              level: a.level_name || '', text: a.detail || a.text || '' };
          });
        return {
          city: c.name, located: !!located, updatedAt: Date.now(),
          current: {
            temp: Math.round(parseFloat(ob.degree)),
            type: weatherType(ob.weather_short || ob.weather),
            desc: ob.weather_short || ob.weather || '',
            feel: Math.round(parseFloat(ob.degree)),
            humidity: (ob.humidity || '--') + '%',
            wind: (ob.wind_direction_name || '') + ' ' + (ob.wind_power || '') + '级',
            rain: parseFloat(ob.precipitation || '0'),
            aqi: (d.air && d.air.aqi) || null,
            aqiName: (d.air && d.air.aqi_name) || ''
          },
          alerts: alerts, hourly: hourly, daily: daily
        };
      });
    });
  }

  var NEWS_FIRST = 90, NEWS_CEIL = 400;
  var NEWS_JOBS = [
    ['https://www.chinanews.com.cn/rss/china.xml', '中新网', '国内', 'rss'],
    ['https://www.chinanews.com.cn/rss/world.xml', '中新网', '国际', 'rss'],
    ['https://www.chinanews.com.cn/rss/finance.xml', '中新网', '财经', 'rss'],
    ['https://www.chinanews.com.cn/rss/society.xml', '中新网', '社会', 'rss'],
    ['https://www.chinanews.com.cn/rss/sports.xml', '中新网', '体育', 'rss'],
    ['http://www.people.com.cn/rss/politics.xml', '人民网', '时政', 'rss'],
    ['https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/news_1.jsonp', '央视新闻', '要闻', 'cctv']
  ];
  function buildNews(max) {
    var want = Math.min(NEWS_CEIL, Math.max(NEWS_FIRST, parseInt(max, 10) || NEWS_FIRST));
    return Promise.all(NEWS_JOBS.map(function (j) {
      return getText(j[0]).then(function (t) { return { ok: true, t: t }; }).catch(function () { return { ok: false }; });
    })).then(function (results) {
      var out = [];
      results.forEach(function (r, i) {
        if (!r.ok) return;
        var job = NEWS_JOBS[i], source = job[1], category = job[2], kind = job[3], txt = r.t;
        try {
          if (kind === 'rss') {
            out.push.apply(out, parseRss(txt, source, category));
          } else {
            var js = JSON.parse(txt.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, ''));
            (js.data && js.data.list || []).forEach(function (x) {
              var ms = Date.parse((x.focus_date || '').replace(/-/g, '/')) || 0;
              out.push({ title: x.title, url: x.url, source: source, category: category,
                ms: ms, time: relTime(ms), summary: clean(x.brief),
                image: x.image || x.image2 || x.image3 || '' });
            });
          }
        } catch (e) { /* 单源失败跳过 */ }
      });
      var seen = {}, uniq = out.filter(function (n) {
        if (!n.url || seen[n.url]) return false; seen[n.url] = 1; return true;
      });
      uniq.sort(function (a, b) { return b.ms - a.ms; });
      return uniq.slice(0, want).map(function (n, i) {
        return { id: 'n' + i, title: n.title, source: n.source, category: n.category,
          time: n.time, url: n.url, image: n.image || '', summary: n.summary || '' };
      });
    });
  }

  var NEWS_HOSTS = ['news.cctv.com', 'cctv.com', 'chinanews.com.cn', 'chinanews.com', 'people.com.cn', 'people.cn'];
  function fetchArticle(url) {
    var host = '';
    try { host = new URL(url).hostname; } catch (e) { return Promise.resolve({ blocks: null }); }
    if (!NEWS_HOSTS.some(function (h) { return host === h || host.endsWith('.' + h) || host.indexOf(h) >= 0; }))
      return Promise.resolve({ blocks: null });
    return getBuf(url, { 'Referer': 'http://' + host + '/' }).then(function (buf) {
      var html = decodeHtml(buf);
      html = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--(?!\[!--)[\s\S]*?-->/g, '');
      var endMark = /【编辑|责任编辑|責任編輯|编辑：|編輯：|相关新闻|相關新聞|相关报道|延伸阅读|推荐阅读|阅读推荐|热门推荐|热点推荐|点击排行|滚动新闻|网友评论|本网站所刊|版权所有|Copyright|ICP备/;
      var junk = /\[!--|function\s|\bvar\s|document\.|window\.|cookie|http-equiv|\.css|\.js|getElementById|视频加载|点击进入专题|＜/i;
      var re = /<p[\s>][\s\S]*?<\/p>|<img\b[^>]*>/gi;
      var raw = [], m, firstParaIdx = -1;
      while ((m = re.exec(html))) {
        var tag = m[0];
        if (tag.charAt(1) === 'p' || tag.charAt(1) === 'P') {
          var t = clean(tag);
          if (t.length < 15 || junk.test(t)) continue;
          if (firstParaIdx < 0) firstParaIdx = m.index;
          raw.push({ t: 'p', v: t, idx: m.index });
        } else {
          raw.push({ t: 'img', tag: tag, idx: m.index });
        }
      }
      var cut = Infinity;
      if (firstParaIdx >= 0) {
        var mm = endMark.exec(html.slice(firstParaIdx));
        if (mm) cut = firstParaIdx + mm.index;
      }
      var blocks = [], seen = {}, imgCount = 0;
      for (var bi = 0; bi < raw.length; bi++) {
        var b = raw[bi];
        if (b.idx >= cut) break;
        if (b.t === 'p') { blocks.push({ t: 'p', v: b.v }); continue; }
        var src = (b.tag.match(/\b(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (!src || /^data:|\.gif($|\?)|logo|icon|ad[sx]?[\/_.]|spacer|blank|1x1|loading|qrcode|weixin|share/i.test(src)) continue;
        try { src = new URL(src, url).href; } catch (e) { continue; }
        var ih = ''; try { ih = new URL(src).hostname; } catch (e) {}
        if (/^www\./i.test(ih)) continue;
        if (seen[src]) continue; seen[src] = 1;
        if (imgCount >= 10) continue;
        imgCount++;
        blocks.push({ t: 'img', v: src });
      }
      while (blocks.length && blocks[0].t === 'img') blocks.shift();
      while (blocks.length && blocks[blocks.length - 1].t === 'img') blocks.pop();
      return { blocks: blocks.length ? blocks : null };
    }).catch(function () { return { blocks: null }; });
  }

  function locateCity() {
    return getText('http://ip-api.com/json/?fields=city,regionName&lang=zh-CN').then(function (t) {
      var j = JSON.parse(t);
      return (j.city || j.regionName || '').replace(/市$/, '');
    }).catch(function () { return ''; });
  }

  // ---- 新闻图片：源站防盗链 + 手机 https WebView 混合内容，
  // 用原生请求带 Referer 抓回，转 data URI 塞回 <img>，<img> 自身不走 CapacitorHttp ----
  var OK_IMG = /(cctvpic\.com|chinanews\.com(\.cn)?|people\.(com\.)?cn|xinhuanet\.com|news\.cn)$/i;
  function bufToDataUri(buf) {
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:image/jpeg;base64,' + btoa(bin);
  }
  function fixImg(img) {
    if (img.getAttribute('data-nfix')) return;
    var s = img.getAttribute('src') || '';
    var mm = s.match(/[?&]u=([^&]+)/);
    if (!/\/api\/img\?/.test(s) || !mm) return;
    img.setAttribute('data-nfix', '1');
    var real = decodeURIComponent(mm[1]); var ih = '';
    try { ih = new URL(real).hostname; } catch (e) { return; }
    if (!OK_IMG.test(ih) || !/^https?:/i.test(real)) { img.remove(); return; }
    getBuf(real, { 'Referer': 'https://' + ih + '/' }).then(function (buf) {
      try { img.src = bufToDataUri(buf); } catch (e) { img.remove(); }
    }).catch(function () { img.remove(); });
  }
  function startImgFixer() {
    var scan = function (root) {
      var imgs = (root.querySelectorAll ? root.querySelectorAll('img[src*="/api/img?"]') : []);
      Array.prototype.forEach.call(imgs, fixImg);
    };
    scan(document);
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        Array.prototype.forEach.call(mu.addedNodes || [], function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'IMG') fixImg(n); else scan(n);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  global.NativeData = {
    isNative: function () {
      return !!(global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function'
        && global.Capacitor.isNativePlatform());
    },
    provider: {
      getWeather: function (sel) {
        if (sel && typeof sel === 'object' && sel.province) return buildWeather(sel, false);
        if (sel) return buildWeather(sel, false);          // 纯名字
        return locateCity().then(function (n) { return buildWeather(n, true); }); // 空=IP定位
      },
      getNews: function (max) { return buildNews(max); },
      getCities: function () { return Promise.resolve(CITIES.map(function (c) { return c.name; })); },
      searchCities: function (q) { return searchCities(q); },
      getArticle: function (url) { return fetchArticle(url); }
    },
    startImgFixer: startImgFixer
  };
})(window);
