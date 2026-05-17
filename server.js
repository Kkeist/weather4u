/* 本地中转 + 静态服务器（开发期用，0 依赖，纯 Node）。
   作用：浏览器有跨域限制（CORS）直接抓不了天气/新闻网站；
   这个小服务器在本机帮忙抓真实数据、转成干净 JSON，并顺带把网页本身也发出去，
   于是网页和数据同源，没有跨域问题。
   用法：命令行 `node server.js`，然后浏览器打开提示的网址即可。
   最终 APK 里改用安卓原生网络请求，没有 CORS，不需要这个中转。

   真实数据源（均无需 key）：
   - 天气：腾讯 wis.qq.com（实时 / 逐小时48h / 每日8天 / 空气 / 预警）
   - 新闻：中新网即时 RSS + 央视要闻 + 人民网时政，多源合并 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const PORT = 8787;
const ROOT = __dirname;

// 常用城市 -> 腾讯接口需要的省/市中文名（老人够用，可继续加）
// 全国直辖市 + 各省会 + 主要地级市（province/city 用腾讯接口认的中文名，已逐个验证可取到数据）
const CITIES = [
  { name: '北京', province: '北京市', city: '北京市' },
  { name: '上海', province: '上海市', city: '上海市' },
  { name: '天津', province: '天津市', city: '天津市' },
  { name: '重庆', province: '重庆市', city: '重庆市' },
  { name: '广州', province: '广东省', city: '广州市' },
  { name: '深圳', province: '广东省', city: '深圳市' },
  { name: '东莞', province: '广东省', city: '东莞市' },
  { name: '佛山', province: '广东省', city: '佛山市' },
  { name: '珠海', province: '广东省', city: '珠海市' },
  { name: '杭州', province: '浙江省', city: '杭州市' },
  { name: '宁波', province: '浙江省', city: '宁波市' },
  { name: '温州', province: '浙江省', city: '温州市' },
  { name: '南京', province: '江苏省', city: '南京市' },
  { name: '苏州', province: '江苏省', city: '苏州市' },
  { name: '无锡', province: '江苏省', city: '无锡市' },
  { name: '常州', province: '江苏省', city: '常州市' },
  { name: '徐州', province: '江苏省', city: '徐州市' },
  { name: '成都', province: '四川省', city: '成都市' },
  { name: '绵阳', province: '四川省', city: '绵阳市' },
  { name: '武汉', province: '湖北省', city: '武汉市' },
  { name: '宜昌', province: '湖北省', city: '宜昌市' },
  { name: '西安', province: '陕西省', city: '西安市' },
  { name: '郑州', province: '河南省', city: '郑州市' },
  { name: '洛阳', province: '河南省', city: '洛阳市' },
  { name: '长沙', province: '湖南省', city: '长沙市' },
  { name: '济南', province: '山东省', city: '济南市' },
  { name: '青岛', province: '山东省', city: '青岛市' },
  { name: '烟台', province: '山东省', city: '烟台市' },
  { name: '潍坊', province: '山东省', city: '潍坊市' },
  { name: '沈阳', province: '辽宁省', city: '沈阳市' },
  { name: '大连', province: '辽宁省', city: '大连市' },
  { name: '哈尔滨', province: '黑龙江省', city: '哈尔滨市' },
  { name: '长春', province: '吉林省', city: '长春市' },
  { name: '石家庄', province: '河北省', city: '石家庄市' },
  { name: '唐山', province: '河北省', city: '唐山市' },
  { name: '保定', province: '河北省', city: '保定市' },
  { name: '太原', province: '山西省', city: '太原市' },
  { name: '合肥', province: '安徽省', city: '合肥市' },
  { name: '南昌', province: '江西省', city: '南昌市' },
  { name: '福州', province: '福建省', city: '福州市' },
  { name: '厦门', province: '福建省', city: '厦门市' },
  { name: '泉州', province: '福建省', city: '泉州市' },
  { name: '昆明', province: '云南省', city: '昆明市' },
  { name: '贵阳', province: '贵州省', city: '贵阳市' },
  { name: '南宁', province: '广西壮族自治区', city: '南宁市' },
  { name: '桂林', province: '广西壮族自治区', city: '桂林市' },
  { name: '海口', province: '海南省', city: '海口市' },
  { name: '三亚', province: '海南省', city: '三亚市' },
  { name: '兰州', province: '甘肃省', city: '兰州市' },
  { name: '西宁', province: '青海省', city: '西宁市' },
  { name: '银川', province: '宁夏回族自治区', city: '银川市' },
  { name: '呼和浩特', province: '内蒙古自治区', city: '呼和浩特市' },
  { name: '乌鲁木齐', province: '新疆维吾尔自治区', city: '乌鲁木齐市' },
  { name: '拉萨', province: '西藏自治区', city: '拉萨市' }
];

// 抓远程，返回 Buffer
function get(url, headers) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const hd = Object.assign({ 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip, deflate, br' }, headers || {});
    const req = lib.get(url, { headers: hd }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = (res.headers['content-encoding'] || '').toLowerCase();
        try {
          if (enc === 'gzip') return resolve(zlib.gunzipSync(raw));
          if (enc === 'deflate') return resolve(zlib.inflateSync(raw));
          if (enc === 'br') return resolve(zlib.brotliDecompressSync(raw));
        } catch (e) { /* 解压失败就按原始返回，下游再判断 */ }
        resolve(raw);
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('超时')));
  });
}

// 天气现象中文 -> 项目图标类型
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

// 城市搜索：走腾讯 city/like，返回全国任意省/市/县（不再受预设列表限制）。
// 返回每条 { name(最细一级地名), sub(上级，给老人看清是哪个), province, city, county }
async function searchCities(q) {
  if (!q || !q.trim()) return [];
  const j = JSON.parse((await get('https://wis.qq.com/city/like?source=pc&city=' + encodeURIComponent(q.trim()))).toString('utf8'));
  const map = (j && j.data) || {};
  const out = [];
  const seen = new Set();
  Object.keys(map).forEach(k => {
    const parts = String(map[k]).split(/,\s*/).filter(Boolean);
    if (!parts.length) return;
    const province = parts[0], city = parts[1] || parts[0], county = parts[2] || '';
    const name = county || city;
    const sub = county ? (city + '，' + province) : (province === city ? '' : province);
    const key = province + '|' + city + '|' + county;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, sub, province, city, county });
  });
  return out;
}

// 把一个城市名/搜索片段解析成可查天气的省市县；解析不到回落上海
async function resolveCity(name) {
  if (name && name.trim()) {
    try {
      const r = await searchCities(name);
      if (r.length) return r[0];
    } catch (e) { /* 搜索源临时不可用就走下面回落 */ }
    const hit = CITIES.filter(c => name.indexOf(c.name) >= 0 || c.name.indexOf(name) >= 0)[0];
    if (hit) return { name: hit.name, sub: '', province: hit.province, city: hit.city, county: '' };
  }
  const sh = CITIES[1];
  return { name: sh.name, sub: '', province: sh.province, city: sh.city, county: '' };
}

// 取真实天气并转成统一结构。sel 可为 {province,city,county,name} 或纯地名字符串
async function buildWeather(sel, located) {
  const c = (sel && typeof sel === 'object' && sel.province) ? sel : await resolveCity(sel);
  const url = 'https://wis.qq.com/weather/common?source=pc&weather_type=observe%7Cforecast_1h%7Cforecast_24h%7Cair%7Calarm'
    + '&province=' + encodeURIComponent(c.province) + '&city=' + encodeURIComponent(c.city)
    + (c.county ? '&county=' + encodeURIComponent(c.county) : '');
  const j = JSON.parse((await get(url)).toString('utf8'));
  const d = j.data || {};
  const ob = d.observe || {};

  // 逐小时：取最近 24 小时
  const h1 = d.forecast_1h || {};
  const hourly = Object.keys(h1).map(k => h1[k])
    .sort((a, b) => a.update_time.localeCompare(b.update_time))
    .slice(0, 24)
    .map(x => ({
      hour: parseInt(String(x.update_time).slice(8, 10), 10),
      type: weatherType(x.weather_short || x.weather),
      temp: Math.round(parseFloat(x.degree)),
      desc: x.weather_short || x.weather
    }));

  // 每日：从今天起
  const todayYmd = new Date().toISOString().slice(0, 10);
  const f24 = d.forecast_24h || {};
  const daily = Object.keys(f24).map(k => f24[k])
    .filter(x => x.time >= todayYmd)
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 7)
    .map((x, i) => ({
      day: i === 0 ? '今天' : i === 1 ? '明天' : i === 2 ? '后天' : weekday(x.time),
      date: parseInt(x.time.slice(5, 7), 10) + '月' + parseInt(x.time.slice(8, 10), 10) + '日',
      type: weatherType(x.day_weather_short || x.day_weather),
      desc: x.day_weather_short || x.day_weather,
      max: parseInt(x.max_degree, 10),
      min: parseInt(x.min_degree, 10),
      aqiName: x.aqi_name || ''
    }));

  // 预警（含灾害提示，归到天气页）
  const alerts = (Array.isArray(d.alarm) ? d.alarm : Object.keys(d.alarm || {}).map(k => d.alarm[k]))
    .map(a => ({
      title: (a.type_name || a.type || '预警') + (a.level_name ? ' ' + a.level_name : ''),
      level: a.level_name || '',
      text: a.detail || a.text || ''
    }));

  return {
    city: c.name,
    located: !!located,
    updatedAt: Date.now(),
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
    alerts: alerts
  , hourly: hourly, daily: daily };
}

function weekday(ymd) {
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return w[new Date(ymd + 'T00:00:00').getDay()];
}

// 去 CDATA / 标签，拿纯文本
// 命名 HTML 实体表（中文新闻里常见的引号/破折号/省略号等）
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
  const diff = (Date.now() - ms) / 1000;
  if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  const d = new Date(ms);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// 解析 RSS 的 <item>
function parseRss(xml, source, category) {
  const items = [];
  const re = /<item[\s>][\s\S]*?<\/item>/g;
  const blocks = xml.match(re) || [];
  for (const b of blocks) {
    const t = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const link = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    const desc = (b.match(/<description>([\s\S]*?)<\/description>/) || [])[1];
    const pd = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    if (!t || !link) continue;
    let ms = 0;
    if (pd) { const p = Date.parse(clean(pd)); if (!isNaN(p)) ms = p; }
    let img = (String(desc || '').match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
    if (img) { try { img = new URL(img, clean(link)).href; } catch (e) { img = ''; } }
    items.push({
      title: clean(t), url: clean(link), source: source, category: category,
      ms: ms, time: relTime(ms), summary: clean(desc), image: img
    });
  }
  return items;
}

const NEWS_FIRST = 90;   // 首屏新闻条数
const NEWS_CEIL = 400;   // 「看更早的」最多能翻到多少（多源合并去重后的池子上限）

async function buildNews(max) {
  const want = Math.min(NEWS_CEIL, Math.max(NEWS_FIRST, parseInt(max, 10) || NEWS_FIRST));
  const out = [];
  // 多源 + 分类抓取：每个源带真实分类，新闻页据此做分类筛选；多源合并让条数更多
  const jobs = [
    ['https://www.chinanews.com.cn/rss/china.xml', '中新网', '国内', 'rss'],
    ['https://www.chinanews.com.cn/rss/world.xml', '中新网', '国际', 'rss'],
    ['https://www.chinanews.com.cn/rss/finance.xml', '中新网', '财经', 'rss'],
    ['https://www.chinanews.com.cn/rss/society.xml', '中新网', '社会', 'rss'],
    ['https://www.chinanews.com.cn/rss/sports.xml', '中新网', '体育', 'rss'],
    ['http://www.people.com.cn/rss/politics.xml', '人民网', '时政', 'rss'],
    ['https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/news_1.jsonp', '央视新闻', '要闻', 'cctv']
  ];
  const results = await Promise.allSettled(jobs.map(j => get(j[0])));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const [, source, category, kind] = jobs[i];
    const txt = r.value.toString('utf8');
    try {
      if (kind === 'rss') {
        out.push.apply(out, parseRss(txt, source, category));
      } else {
        const js = JSON.parse(txt.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, ''));
        (js.data && js.data.list || []).forEach(x => {
          const ms = Date.parse((x.focus_date || '').replace(/-/g, '/')) || 0;
          out.push({
            title: x.title, url: x.url, source: source, category: category,
            ms: ms, time: relTime(ms), summary: clean(x.brief),
            image: x.image || x.image2 || x.image3 || ''
          });
        });
      }
    } catch (e) { /* 单源失败只跳过该源，不影响其它源 */ }
  });
  // 同一篇可能同时出现在多个分类源里，按链接去重（保留先抓到的那条及其分类）
  const seen = new Set();
  const uniq = out.filter(n => {
    if (!n.url || seen.has(n.url)) return false;
    seen.add(n.url); return true;
  });
  uniq.sort((a, b) => b.ms - a.ms);
  return uniq.slice(0, want).map((n, i) => ({
    id: 'n' + i, title: n.title, source: n.source, category: n.category,
    time: n.time, url: n.url, image: n.image || '',
    summary: n.summary || ''
  }));
}

// 按编码解码网页（中文站点有 utf-8 / gbk / gb2312）
function decodeHtml(buf) {
  var head = buf.toString('latin1').slice(0, 1500);
  var cs = (head.match(/charset=["']?\s*([\w-]+)/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(cs).decode(buf); }
  catch (e) { return buf.toString('utf8'); }
}

// 只允许抓这几个新闻站，避免被滥用去抓任意地址
var NEWS_HOSTS = ['news.cctv.com', 'cctv.com', 'chinanews.com.cn', 'chinanews.com', 'people.com.cn', 'people.cn'];

// 从文章页提取正文段落
async function fetchArticle(url) {
  var host = '';
  try { host = new URL(url).hostname; } catch (e) { return null; }
  if (!NEWS_HOSTS.some(function (h) { return host === h || host.endsWith('.' + h) || host.indexOf(h) >= 0; })) return null;
  // 注意：央视等站把正文 <p> 输出在 <script> 字符串里，绝不能整体删 script，
  // 否则正文一起没了。只去掉 style 和注释，靠下面的过滤器挑掉代码/噪声段。
  var html = decodeHtml(await get(url, { 'Referer': 'http://' + host + '/' }));
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '')
             .replace(/<!--(?!\[!--)[\s\S]*?-->/g, '');
  // 正文结束标记：编辑署名 / 相关推荐 / 版权区。这些紧跟正文之后出现，
  // 但不一定包在 <p> 里（中新网【编辑】、央视相关推荐都是 <div>/<a>），
  // 所以靠「逐个 <p> 撞到才停」会漏 —— 必须先按它们在原文里的位置把正文段切断，
  // 正文之后的一切（那一堆推荐标题）物理上就进不来。
  var endMark = /【编辑|责任编辑|責任編輯|编辑：|編輯：|相关新闻|相關新聞|相关报道|延伸阅读|推荐阅读|阅读推荐|热门推荐|热点推荐|点击排行|滚动新闻|网友评论|本网站所刊|版权所有|Copyright|ICP备/;
  var junk = /\[!--|function\s|\bvar\s|document\.|window\.|cookie|http-equiv|\.css|\.js|getElementById|视频加载|点击进入专题|＜/i;
  var re = /<p[\s>][\s\S]*?<\/p>|<img\b[^>]*>/gi;
  var raw = [], m, firstParaIdx = -1;
  while ((m = re.exec(html))) {
    var tag = m[0];
    if (tag.charAt(1) === 'p' || tag.charAt(1) === 'P') {
      var t = clean(tag);
      if (t.length < 15 || junk.test(t)) continue; // 跳脚本残渣/太短
      if (firstParaIdx < 0) firstParaIdx = m.index; // 正文从第一段实打实的文字算起
      raw.push({ t: 'p', v: t, idx: m.index });
    } else {
      raw.push({ t: 'img', tag: tag, idx: m.index });
    }
  }
  // 正文边界：从第一段正文之后，原文里第一个结束标记的位置；之后的块全部丢弃。
  // 从 firstParaIdx 往后找，避开页头 meta 里那个无关的「责任编辑」（在正文之前）。
  var cut = Infinity;
  if (firstParaIdx >= 0) {
    var mm = endMark.exec(html.slice(firstParaIdx));
    if (mm) cut = firstParaIdx + mm.index;
  }
  var blocks = [], seen = {}, imgCount = 0;
  for (var bi = 0; bi < raw.length; bi++) {
    var b = raw[bi];
    if (b.idx >= cut) break;                       // 到正文结束标记就停，推荐区进不来
    if (b.t === 'p') { blocks.push({ t: 'p', v: b.v }); continue; }
    var src = (b.tag.match(/\b(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!src || /^data:|\.gif($|\?)|logo|icon|ad[sx]?[\/_.]|spacer|blank|1x1|loading|qrcode|weixin|share/i.test(src)) continue;
    try { src = new URL(src, url).href; } catch (e) { continue; }
    // 内容图都在图片 CDN 子域(i2.chinanews / p3.img.cctvpic 等)；
    // www.* 上的多是站点模板图/logo(那张反复出现的 2022 png)，丢掉
    var ih = ''; try { ih = new URL(src).hostname; } catch (e) {}
    if (/^www\./i.test(ih)) continue;
    if (seen[src]) continue; seen[src] = 1;
    if (imgCount >= 10) continue;   // 图片再多也封顶，避免相关图库刷屏
    imgCount++;
    blocks.push({ t: 'img', v: src });
  }
  // 去掉正文前后无意义的纯图片（栏目头图/页脚图）
  while (blocks.length && blocks[0].t === 'img') blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].t === 'img') blocks.pop();
  return blocks.length ? blocks : null;
}

// IP 自动定位（无 key），失败回默认城市
async function locateCity() {
  try {
    const j = JSON.parse((await get('http://ip-api.com/json/?fields=city,regionName&lang=zh-CN')).toString('utf8'));
    return (j.city || j.regionName || '').replace(/市$/, '');
  } catch (e) { return ''; }
}

function sendJson(res, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/cities') {
      return sendJson(res, CITIES.map(c => c.name));
    }
    if (u.pathname === '/api/citysearch') {
      return sendJson(res, await searchCities(u.searchParams.get('q') || ''));
    }
    if (u.pathname === '/api/weather') {
      const province = u.searchParams.get('province');
      const cityP = u.searchParams.get('city');
      const county = u.searchParams.get('county') || '';
      const name = u.searchParams.get('name') || cityP || '';
      let located = false;
      let sel;
      if (province && cityP) {
        sel = { name: name || county || cityP, sub: '', province: province, city: cityP, county: county };
      } else if (u.searchParams.get('city')) {
        sel = cityP;                       // 只给了名字，交给 resolveCity 解析
      } else {
        sel = await locateCity(); located = true;   // 没指定：IP 定位
      }
      return sendJson(res, await buildWeather(sel, located));
    }
    if (u.pathname === '/api/news') {
      return sendJson(res, await buildNews(u.searchParams.get('max')));
    }
    if (u.pathname === '/api/article') {
      var blocks = await fetchArticle(u.searchParams.get('url') || '');
      return sendJson(res, { blocks: blocks });   // 抓不到 blocks=null，前端回落到摘要
    }
    // 图片中转：浏览器统一向本机要图，由服务端带 Referer 去源站抓回，
    // 既绕过潜在防盗链，也避免任何混合内容/跨域问题，图片更稳定显示
    if (u.pathname === '/api/img') {
      var iu = u.searchParams.get('u') || '';
      var ihost = '';
      try { ihost = new URL(iu).hostname; } catch (e) { res.writeHead(400); return res.end('bad'); }
      var okImg = /(cctvpic\.com|chinanews\.com(\.cn)?|people\.(com\.)?cn|xinhuanet\.com|news\.cn)$/i.test(ihost);
      if (!okImg || !/^https?:/i.test(iu)) { res.writeHead(403); return res.end('forbidden'); }
      try {
        var ib = await get(iu, { 'Referer': 'https://' + ihost + '/' });
        res.writeHead(200, {
          'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(ib);
      } catch (e) { res.writeHead(502); return res.end('img fail'); }
    }
    // 浏览器会自动要 favicon，没有就别报 404 噪声
    if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    // 静态文件
    let p = u.pathname === '/' ? '/index.html' : u.pathname;
    const fp = path.join(ROOT, decodeURIComponent(p));
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('not found'); }
    // 开发期不缓存，宝宝一刷新就是最新代码，避免改了没生效的假象
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    // 抓取失败如实回错，前端据此显示「没拉到」，不假装成功；
    // 若响应头已发出就别再 writeHead（否则会抛错连累整个服务）
    try {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: String(e && e.message || e) }));
      } else { res.end(); }
    } catch (e2) { /* 已断开就算了，绝不让一个请求搞挂整个服务 */ }
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log('服务已经在运行了，直接看浏览器就行（这个窗口可以关掉）。');
    process.exit(0);
  }
  console.log('启动出错：' + e.message);
  process.exit(1);
});

// 全局兜底：任何没接住的异常/Promise 失败都只记日志，绝不让服务进程退出，
// 否则单次抓取出错就会害整个 app「全是 error」
process.on('uncaughtException', e => console.log('已忽略异常：' + (e && e.message || e)));
process.on('unhandledRejection', e => console.log('已忽略未处理拒绝：' + (e && e.message || e)));

server.listen(PORT, () => {
  console.log('===========================================');
  console.log('  天气新闻 已启动');
  console.log('  浏览器会自动打开： http://localhost:' + PORT);
  console.log('  用完直接关这个黑窗口就停止');
  console.log('===========================================');
});
