/* 把静态 app（不含 server.js）拷进 www/ 供 Capacitor 打包。
   server.js 是开发期本机中转，APK 里不需要也不打进去。 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WWW = path.join(ROOT, 'www');

function rmrf(p) { fs.existsSync(p) && fs.rmSync(p, { recursive: true, force: true }); }
function copyInto(src, dstDir) {
  const dst = path.join(dstDir, path.basename(src));
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copyInto(path.join(src, f), dst);
  } else {
    fs.copyFileSync(src, dst);
  }
}

rmrf(WWW);
fs.mkdirSync(WWW, { recursive: true });
// 只打包前端：网页 + 样式 + 脚本（含原生数据层 native-data.js）
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(WWW, 'index.html'));
copyInto(path.join(ROOT, 'css'), WWW);
copyInto(path.join(ROOT, 'js'), WWW);
console.log('www built:', fs.readdirSync(WWW).join(', '));
