/* 图标层分两套：
   1) 天气主图标用 emoji —— 系统自带、零成本、老人一眼能认；
      真实数据源（和风）的图标编码会在 data 层映射成下面这些天气类型字符串。
   2) 功能 / 装饰图标（底部标签、分隔线等）用线条 SVG，写在页面里，
      因为要跟随主题色变化、要清晰几何感，emoji 做不到。 */
(function (global) {
  // 天气类型 -> emoji
  var EMOJI = {
    sunny:     '☀️',   // ☀️ 晴
    partly:    '⛅',         // ⛅ 晴间多云
    cloudy:    '☁️',   // ☁️ 阴 / 多云
    rain:      '🌧️', // 🌧️ 雨
    heavyrain: '⛈️',   // ⛈️ 大雨 / 暴雨
    thunder:   '⛈️',   // ⛈️ 雷阵雨
    snow:      '❄️',   // ❄️ 雪
    fog:       '🌫️'  // 🌫️ 雾 / 霾
  };

  // 把天气类型转成 emoji；未知类型回落到多云，绝不空白
  function emoji(type) {
    return EMOJI[type] || EMOJI.cloudy;
  }

  global.WeatherIcons = { emoji: emoji, types: Object.keys(EMOJI) };
})(window);
