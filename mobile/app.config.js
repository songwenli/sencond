// 在 app.json 的基础上补充需要判断的配置。
// google-services.json 来自 Firebase（安卓推送需要），放在 mobile/ 目录下后自动生效；
// 没有这个文件时照常能用 Expo Go / 网页版开发，只是安卓开发版收不到推送。
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(googleServices)) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }
  return config;
};
