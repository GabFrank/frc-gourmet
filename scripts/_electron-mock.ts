/**
 * Mock de `electron` para tests Node puros (sin Electron runtime).
 *
 * DEBE importarse ANTES que cualquier módulo que haga `import ... from 'electron'`
 * (ej. handler-registry, los *.handler.ts). Como los imports se izan en orden de
 * aparición, poné `import './_electron-mock';` como primer import del test.
 *
 * `ipcMain.handle` delega (lazy) al `handlerRegistry` real, así los handlers
 * registrados quedan invocables vía `invokeHandlerWithContext`.
 */
import * as path from 'path';

function reg() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../electron/utils/handler-registry').handlerRegistry as Map<string, any>;
}

const mockIpcMain = {
  handle: (channel: string, fn: any) => reg().set(channel, fn),
  handleOnce: (channel: string, fn: any) => reg().set(channel, fn),
  removeHandler: (channel: string) => reg().delete(channel),
};

require.cache[require.resolve('electron')] = {
  id: 'electron',
  filename: 'electron',
  loaded: true,
  exports: {
    ipcMain: mockIpcMain,
    app: {
      getPath: () => path.resolve(__dirname, '../.tmp'),
      isReady: () => true,
      relaunch: () => {},
      exit: () => {},
      quit: () => {},
      on: () => {},
      getVersion: () => '0.0.0-test',
    },
    BrowserWindow: class { static getAllWindows() { return []; } },
    dialog: {},
    shell: {},
    protocol: { registerSchemesAsPrivileged: () => {}, registerFileProtocol: () => {}, registerStringProtocol: () => {} },
    nativeImage: { createFromPath: () => ({}) },
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  },
} as any;
