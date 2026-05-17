/* 数据层：对 UI 只暴露 getWeather(city) / getNews() / getCities()。
   默认走真实数据 provider —— 请求本机中转 server.js 的 /api/*（同源，无跨域）。
   先 `node server.js` 再用浏览器打开它给的网址，数据就是真实的。
   最终 APK 里把 BASE 换成原生抓取层即可，UI 不用改。

   统一数据结构：
   weather = {
     city, located, updatedAt,
     current:{ temp, type, desc, feel, humidity, wind, rain, aqi, aqiName },
     alerts:[ {title, level, text} ],
     hourly:[ {hour(0-23), type, temp, desc} ],   // 真实逐小时，24 条
     daily:[ {day, type, desc, max, min, aqiName} ]
   }
   news = [ {id, title, source, category, time, url, body:[段落...]} ]
*/
(function (global) {

  // 真实数据：打中转的 /api/*。空 city 时由中转做 IP 自动定位。
  var enc = encodeURIComponent;
  var RealProvider = {
    // sel 可为 {province,city,county,name} 结构（搜索/精确选择）或纯地名字符串（快捷选择）；空 = 服务端 IP 定位
    getWeather: function (sel) {
      var q = '';
      if (sel && typeof sel === 'object') {
        if (sel.province && sel.city) {
          q = '?province=' + enc(sel.province) + '&city=' + enc(sel.city) +
              (sel.county ? '&county=' + enc(sel.county) : '') + '&name=' + enc(sel.name || sel.city);
        } else if (sel.name) {
          q = '?city=' + enc(sel.name);
        }
      } else if (sel) {
        q = '?city=' + enc(sel);
      }
      return fetchJson('/api/weather' + q);
    },
    getNews: function (max) { return fetchJson('/api/news' + (max ? ('?max=' + enc(max)) : '')); },
    searchCities: function (q) { return fetchJson('/api/citysearch?q=' + enc(q || '')); },
    getCities: function () { return fetchJson('/api/cities'); },
    getArticle: function (url) { return fetchJson('/api/article?url=' + enc(url)); }
  };

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('数据获取失败 ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.error) throw new Error(j.error);
      return j;
    });
  }

  var ACTIVE = RealProvider;

  global.DataSource = {
    getWeather: function (sel) { return ACTIVE.getWeather(sel); },
    getNews: function (max) { return ACTIVE.getNews(max); },
    searchCities: function (q) { return ACTIVE.searchCities ? ACTIVE.searchCities(q) : Promise.resolve([]); },
    getCities: function () { return ACTIVE.getCities ? ACTIVE.getCities() : Promise.resolve([]); },
    getArticle: function (url) { return ACTIVE.getArticle ? ACTIVE.getArticle(url) : Promise.resolve({ body: null }); },
    use: function (p) { ACTIVE = p; }
  };
})(window);
