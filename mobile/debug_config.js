const {loadConfig} = require('@react-native-community/cli');
const cfg = loadConfig();
console.log('Available platforms:', JSON.stringify(Object.keys(cfg.platforms)));
console.log('project:', JSON.stringify(cfg.project));

// Check cli-platform-android
try {
  const android = require('@react-native-community/cli-platform-android');
  console.log('cli-platform-android keys:', JSON.stringify(Object.keys(android)));
} catch(e) {
  console.error('cli-platform-android error:', e.message);
}

// Check react-native built-in config
try {
  const rnConfig = require('react-native/react-native.config.js');
  console.log('react-native config platforms:', JSON.stringify(Object.keys(rnConfig.platforms || {})));
} catch(e) {
  console.error('react-native config error:', e.message);
}
