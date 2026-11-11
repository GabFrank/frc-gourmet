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

// keytar en memoria: los tests NUNCA tocan el llavero real de la máquina. Escribían y borraban
// secretos con los mismos nombres que la app (token de WhatsApp, credenciales de pago) y se
// llevaban por delante los que el dueño había cargado (2026-11-11: dos veces el token de Meta).
const llaveroDePrueba = new Map<string, string>();
const claveLlavero = (s: string, a: string) => `${s}\u0000${a}`;
require.cache[require.resolve('keytar')] = {
  id: 'keytar',
  filename: 'keytar',
  loaded: true,
  exports: {
    getPassword: async (s: string, a: string) => llaveroDePrueba.get(claveLlavero(s, a)) ?? null,
    setPassword: async (s: string, a: string, v: string) => { llaveroDePrueba.set(claveLlavero(s, a), String(v)); },
    deletePassword: async (s: string, a: string) => llaveroDePrueba.delete(claveLlavero(s, a)),
    findCredentials: async (s: string) => [...llaveroDePrueba.entries()]
      .filter(([k]) => k.startsWith(`${s}\u0000`)).map(([k, password]) => ({ account: k.split('\u0000')[1], password })),
    findPassword: async (s: string) => [...llaveroDePrueba.entries()].find(([k]) => k.startsWith(`${s}\u0000`))?.[1] ?? null,
  },
} as any;

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
