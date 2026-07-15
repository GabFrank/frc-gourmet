// Karma configuration for the mobile PWA unit tests.
// Uses a headless Chromium with --no-sandbox (required in CI/containers).
// Point CHROME_BIN at the available Chromium binary before running, e.g.:
//   CHROME_BIN=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     ng test mobile --karma-config projects/mobile/karma.conf.js --watch=false
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    reporters: ['progress'],
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: false,
    singleRun: true,
  });
};
