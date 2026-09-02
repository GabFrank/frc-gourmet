// Karma configuration para los unit tests del proyecto desktop (Angular).
// Espeja projects/mobile/karma.conf.js: headless con --no-sandbox (CI/contenedores)
// y sin el reporter de cobertura (el builder por defecto exige `karma-coverage`,
// que no está entre las devDependencies).
//   CHROME_BIN=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test
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
