# Tongpin（同频）

意图匹配 app · 海外版。客户端 Expo（React Native），后端 Supabase。

```
tongpin/
├─ mobile/                      # Expo app
│  ├─ src/app/                  # 路由（文件即页面，expo-router）
│  │  ├─ _layout.tsx            # 根布局：Query / Auth / 登录保护
│  │  ├─ sign-in.tsx            # 邮箱验证码登录
│  │  ├─ (tabs)/                # 发布 / 推荐 / 消息 / 我的
│  │  ├─ intent/[id].tsx        # 意图详情
│  │  ├─ match/[id].tsx         # 匹配详情（单人 / 多人）
│  │  └─ chat/[id].tsx          # 聊天
│  ├─ src/features/<模块>/api.ts # 数据层：页面只调这里的 hooks
│  └─ src/shared/
│     ├─ api/                   # Supabase 客户端 + 自动生成的数据库类型
│     ├─ theme/tokens.ts        # 设计 Token（颜色、字号、间距）
│     ├─ i18n/                  # 多语言（en、zh-Hans），跟随手机系统语言
│     ├─ auth/                  # 登录状态
│     ├─ push/                  # 推送：注册 token、点击通知跳转
│     └─ ui/                    # 基础组件
└─ supabase/
   ├─ migrations/               # 数据库迁移（已在 Supabase 上执行过）
   └─ functions/
      ├─ match-worker/          # 匹配：审核 → 解析 → 向量 → 召回 → 大模型判断
      └─ push-sender/           # 推送：发件箱 → Expo Push API
```

## 第一次运行（Windows PowerShell）

```powershell
cd tongpin\mobile
npm install
npx expo start
```

终端里会出现一个二维码：

- **iPhone**：用相机扫码，在 Expo Go 里打开
- **安卓**：打开 Expo Go，点 Scan QR code 扫码

手机和电脑要连同一个 Wi-Fi。连不上时改用 `npx expo start --tunnel`。

> `npm install` 走你已配好的 npm 代理 / 镜像即可。不要用 `npm install <包名>` 加新依赖，
> 一律用 `npx expo install <包名>`，它会自动选与 Expo SDK 兼容的版本。

## 登录前必须做的一步：让 Supabase 发验证码

Supabase 默认的登录邮件是「魔法链接」，app 里需要的是 6 位验证码。到 Supabase 后台：

**Authentication → Emails → Templates → Magic Link**，把正文改成包含 `{{ .Token }}`，例如：

```html
<h2>Your Tongpin code</h2>
<p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
```

另外，Supabase 自带的发信服务每小时只能发很少几封，开发够用；正式上线前要在
**Authentication → SMTP Settings** 接入自己的发信服务（如 Resend、SendGrid）。

## 推送通知：安卓开发版

推送在 Expo Go 里不能用，要装一个自己 app 的开发版安装包（APK）。只需要做一次，
之后改代码照常 `npx expo start`，开发版会像 Expo Go 一样自动刷新。

**一、Firebase（安卓推送走 Google FCM，需要挂代理）**

1. 打开 console.firebase.google.com，新建项目（名字随意，如 tongpin）。
2. 项目里「添加应用 → Android」，软件包名填 `com.youlai.tongpin`，下载 `google-services.json`，
   放到 `mobile/` 目录下（和 `app.json` 同级）。这个文件可以提交到仓库。
3. 「项目设置 → 服务账号 → 生成新的私钥」，下载一个 JSON 私钥文件。
   **这个文件不能提交**，`.gitignore` 已经排除了常见文件名，放在 `mobile/` 之外更稳妥。

**二、EAS（在 `mobile/` 目录运行）**

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` 会在 expo.dev 建项目，并把 `projectId` 写进 `app.json`（这一改动要提交）。

然后把第一步的私钥上传给 Expo：打开 expo.dev → 项目 → **Credentials → Android →
com.youlai.tongpin → FCM V1 service account key → Add a service account key**，上传那个 JSON。

**三、打包并安装**

```powershell
npx eas-cli@latest build --platform android --profile development
```

云端打包约 10–20 分钟，完成后终端和 expo.dev 上都有下载链接 / 二维码，用安卓手机打开安装。
之后 `npx expo start`，用开发版扫码打开项目。第一次进入会弹出通知权限，点允许。

> 手机需要有 **Google Play 服务**，否则收不到 FCM 推送（国行华为、部分国行小米 / OPPO / vivo 没有）。
> 海外用户的手机都有。没有的话可以用电脑上带 Google Play 的安卓模拟器测试。

**怎么测：** 用两个账号（一台手机 + 网页版也行）互相发能匹配上的意图，或在已有会话里发消息，
锁屏状态下手机会收到通知，点通知直接跳到匹配详情 / 聊天。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npx expo start` | 启动开发服务器 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run gen:types` | 数据库改动后重新生成类型（需先 `npx supabase login`） |
| `npx expo install <包>` | 安装依赖（自动匹配 SDK 版本） |
| `npx expo-doctor` | 检查依赖和配置问题 |

## 约定

1. **页面不直接调用 supabase**，一律通过 `src/features/<模块>/api.ts` 里的 hooks。
2. **不写死颜色和字号**，统一引用 `src/shared/theme/tokens.ts`。
3. **不写死文案**，先加到 `src/shared/i18n/locales/en.ts`，再补 `zh-Hans.ts`（类型检查会提醒）。
4. **数据库改动写成新的迁移文件**放进 `supabase/migrations/`，不要在后台手动点改。
5. 状态变更（跳过匹配、发起会话、加入群）走数据库 RPC，业务规则在服务端校验。

## 当前进度

- [x] 数据库：16 张表、RLS、RPC、匹配队列（`supabase/migrations/`）
- [x] 骨架：路由、主题、多语言、登录、发布意图、「我的」意图列表
- [x] 匹配 worker（向量化 + 召回 + LLM 理由），每 30 秒自动处理新意图
- [x] 推荐页、匹配详情、聊天（Realtime）、首条消息规则
- [x] 推送通知：新匹配、新消息（安卓；iPhone 需要 Apple 开发者账号）
- [ ] 匹配质量批量验证与调优
- [ ] 举报 / 拉黑、删除账号
- [ ] Sign in with Apple / Google
