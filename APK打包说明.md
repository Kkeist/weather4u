# 打包 APK 说明（开发用）

产物：`天气和新闻.apk`（debug 版，可直接发安卓手机侧装；手机设置里开「允许安装未知来源」即可装，不用应用商店、不用登录、无广告）。

## 重新打包步骤（改了前端后）

需要：已装 Android Studio / Android SDK、JDK 21（用 Android Studio 自带的 jbr 最稳）。

```
npm install                      # 仅首次
node build-www.js                # 把前端拷进 www/（不含 server.js）
npx cap sync android             # 同步到安卓工程
```

构建（PowerShell，注意把 JAVA_HOME 指到 JDK21，否则会用到坏的 jre1.8）：

```
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="C:\Users\chris\AppData\Local\Android\Sdk"
cd android
.\gradlew.bat assembleDebug --no-daemon --console=plain
```

出来的 APK 在 `android/app/build/outputs/apk/debug/app-debug.apk`，复制重命名即可。

## 已知坑（已处理）

- 工程路径含中文：AGP 会拦。已在 `android/gradle.properties` 加
  `android.overridePathCheck=true`。**注意**：`npx cap add android` 重新生成 android/
  时这行会丢，需要再加一次（或别删 android/ 目录，只 `cap sync`）。
- 系统 `JAVA_HOME` 指向已失效的 `jre1.8.0_421`，必须按上面覆盖成 JDK21。
- 手机上没有黑窗口 server.js：数据改由 `js/native-data.js` 用 Capacitor 的
  CapacitorHttp 原生抓取（绕 CORS、带 Referer、解压），逻辑与 server.js 一致。

## 应用名 / 图标

- 名字「晨起之时」：`capacitor.config.json` 的 `appName`（`cap add android` 时写进
  `android/.../res/values/strings.xml` 的 app_name / title）。若 android/ 已存在，
  改名后需手动同步那两个 string，或删 android/ 重新 `cap add`。
- 图标源：`resources/icon.svg`（晨起日出，配色随报纸主题）。改图标流程：
  改 svg → headless Chrome 渲成 `resources/icon.png`(1024) →
  `npx @capacitor/assets generate --android` 生成各密度 → 重打包。
- **关于「图标用当天天气+温度」**：安卓**不允许** app 把自己的桌面图标动态改成
  实时天气/温度（系统没有这个能力，只能在固定几个预置图标间切，做不到任意温度）。
  真要主屏看实时天气+温度，得另做**桌面小组件(App Widget)**，那是独立的安卓原生
  开发，不在这个网页壳范围内。现在用的是契合「晨起之时」的静态图标。

## 没验证的（如实记录）

debug APK 已成功构建、内部已含前端与原生数据层；`native-data.js` 的抓取/解析
逻辑已在等效无 CORS 环境（Node 直连真实源）逐项跑通。但**尚未在真实安卓机/模拟器里
实跑过这个 APK**（此环境无设备）。装到手机后若某项数据异常，多半在 CapacitorHttp
的请求头/混合内容细节，需在真机上按那一项排查。
