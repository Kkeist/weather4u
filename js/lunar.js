/* 农历 + 24 节气 + 中国节日（纯离线，不联网）。
   用经典 1900–2100 lunarInfo 表 + 节气分钟偏移表，算今天对应的：
   农历日期串（如「四月廿一」）、当天节气（如「立夏」）、中国节日（如「端午节」）。
   只暴露 Lunar.today(date) → { lunar, term, festival, label }。 */
(function (global) {
  'use strict';

  // 1900-2100 每年农历信息（民间通用压缩表）
  var lunarInfo = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ];
  // 节气分钟偏移表（与 1900 基准配合算每个节气具体日）
  var sTermInfo = [0,21208,42467,63836,85337,107014,128867,150921,173149,195551,
    218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,
    462224,483532,504758];
  var TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满',
    '芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
  var nStr1 = ['日','一','二','三','四','五','六','七','八','九','十'];
  var nStr2 = ['初','十','廿','卅'];
  var mStr = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];

  function lYearDays(y) {
    var sum = 348;
    for (var i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
    return sum + leapDays(y);
  }
  function leapMonth(y) { return lunarInfo[y - 1900] & 0xf; }
  function leapDays(y) {
    if (leapMonth(y)) return (lunarInfo[y - 1900] & 0x10000) ? 30 : 29;
    return 0;
  }
  function monthDays(y, m) { return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29; }

  // 公历 -> 农历
  function solar2lunar(date) {
    var y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    var offset = (Date.UTC(y, m, d) - Date.UTC(1900, 0, 31)) / 86400000;
    var i, temp = 0;
    for (i = 1900; i < 2101 && offset > 0; i++) { temp = lYearDays(i); offset -= temp; }
    if (offset < 0) { offset += temp; i--; }
    var lunarYear = i;
    var leap = leapMonth(i), isLeap = false;
    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === (leap + 1) && !isLeap) { --i; isLeap = true; temp = leapDays(lunarYear); }
      else { temp = monthDays(lunarYear, i); }
      if (isLeap && i === (leap + 1)) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) { isLeap = false; } else { isLeap = true; --i; }
    }
    if (offset < 0) { offset += temp; --i; }
    var lunarMonth = i, lunarDay = offset + 1;
    return { year: lunarYear, month: lunarMonth, day: lunarDay, isLeap: isLeap };
  }

  function cnDay(d) {
    if (d === 10) return '初十';
    if (d === 20) return '二十';
    if (d === 30) return '三十';
    return nStr2[Math.floor(d / 10)] + nStr1[d % 10];
  }
  function cnMonth(m, isLeap) { return (isLeap ? '闰' : '') + mStr[m - 1] + '月'; }

  // 某年某节气（0-23）的日
  function termDay(y, n) {
    var base = new Date(Date.UTC(1900, 0, 6, 2, 5, 0));
    var ms = 31556925974.7 * (y - 1900) + sTermInfo[n] * 60000;
    var t = new Date(base.getTime() + ms);
    return t.getUTCDate();
  }

  // 固定公历节日
  var SOLAR_FEST = {
    '1-1': '元旦', '3-8': '妇女节', '4-1': '愚人节', '5-1': '劳动节',
    '5-4': '青年节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节',
    '9-10': '教师节', '10-1': '国庆节', '12-13': '国家公祭日'
  };
  // 固定农历节日（按农历月-日）
  var LUNAR_FEST = {
    '1-1': '春节', '1-15': '元宵节', '2-2': '龙抬头', '5-5': '端午节',
    '7-7': '七夕', '7-15': '中元节', '8-15': '中秋节', '9-9': '重阳节',
    '12-8': '腊八节', '12-23': '小年'
  };

  function today(date) {
    date = date || new Date();
    var y = date.getFullYear(), mo = date.getMonth() + 1, da = date.getDate();
    var l = solar2lunar(date);
    var lunarStr = cnMonth(l.month, l.isLeap) + cnDay(l.day);

    // 当天是否某节气
    var term = '';
    for (var n = 0; n < 24; n++) {
      var tm = Math.floor(n / 2) + 1;
      if (tm === mo && termDay(y, n) === da) { term = TERMS[n]; break; }
    }
    // 节日：公历固定 / 农历固定 / 除夕（腊月最后一天）/ 清明=节气
    var fest = SOLAR_FEST[mo + '-' + da] || '';
    if (!fest) {
      var nextDay = solar2lunar(new Date(date.getTime() + 86400000));
      if (l.month === 12 && (l.day === 29 || l.day === 30) && nextDay.month === 1 && nextDay.day === 1) fest = '除夕';
      else if (!l.isLeap && LUNAR_FEST[l.month + '-' + l.day]) fest = LUNAR_FEST[l.month + '-' + l.day];
    }
    if (!fest && term === '清明') fest = '清明节';

    // label：节日优先，否则节气，否则空
    var label = fest || term || '';
    return { lunar: lunarStr, term: term, festival: fest, label: label };
  }

  global.Lunar = { today: today };
})(window);
