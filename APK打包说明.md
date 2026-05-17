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

## 没验证的（如实记录）

debug APK 已成功构建、内部已含前端与原生数据层；`native-data.js` 的抓取/解析
逻辑已在等效无 CORS 环境（Node 直连真实源）逐项跑通。但**尚未在真实安卓机/模拟器里
实跑过这个 APK**（此环境无设备）。装到手机后若某项数据异常，多半在 CapacitorHttp
的请求头/混合内容细节，需在真机上按那一项排查。
