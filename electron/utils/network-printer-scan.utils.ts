/**
 * Descubrimiento de impresoras en la red local.
 *
 * Dos técnicas complementarias:
 *  1) mDNS/Bonjour (`bonjour-service`, JS puro): las impresoras de red modernas
 *     se anuncian por `_pdl-datastream._tcp` (RAW 9100), `_printer._tcp` (LPD) e
 *     `_ipp._tcp`. Rápido y con metadata (nombre/modelo), sin escanear.
 *  2) Barrido TCP del /24 local en el puerto RAW 9100 (y opcional 515): encuentra
 *     impresoras que no anuncian por mDNS. Sin dependencias (net.Socket).
 *
 * Ambos son best-effort y nunca lanzan: devuelven lo que encuentran.
 */
import * as net from 'net';
import * as os from 'os';

export interface DiscoveredPrinter {
  name: string;
  address: string;       // IPv4
  port: number;
  source: 'mdns' | 'tcp';
  protocol?: string;     // pdl-datastream | printer | ipp | raw
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Descubre impresoras vía mDNS. Devuelve [] si el módulo no está o no hay red. */
export async function discoverMdnsPrinters(timeoutMs = 3000): Promise<DiscoveredPrinter[]> {
  let Bonjour: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('bonjour-service');
    Bonjour = mod.Bonjour || mod.default || mod;
  } catch {
    return [];
  }

  const found = new Map<string, DiscoveredPrinter>();
  let bonjour: any;
  try {
    bonjour = new Bonjour();
    const tipos = ['pdl-datastream', 'printer', 'ipp'];
    const browsers = tipos.map((type) =>
      bonjour.find({ type, protocol: 'tcp' }, (service: any) => {
        const ipv4 = (service?.addresses || []).find((a: string) => /^\d+\.\d+\.\d+\.\d+$/.test(a))
          || service?.referer?.address;
        if (!ipv4) return;
        const port = service?.port || (type === 'ipp' ? 631 : type === 'printer' ? 515 : 9100);
        found.set(`${ipv4}:${port}`, {
          name: service?.name || service?.fqdn || ipv4,
          address: ipv4,
          port,
          source: 'mdns',
          protocol: type,
        });
      }),
    );
    await delay(timeoutMs);
    browsers.forEach((b: any) => { try { b.stop(); } catch { /* noop */ } });
  } catch {
    /* noop */
  } finally {
    try { bonjour?.destroy(); } catch { /* noop */ }
  }
  return Array.from(found.values());
}

/** Deriva los prefijos /24 de las interfaces IPv4 locales no internas. */
function getLocalV24Prefixes(): string[] {
  const prefixes = new Set<string>();
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        const parts = info.address.split('.');
        if (parts.length === 4) prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
  return Array.from(prefixes);
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* noop */ }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

/**
 * Barre el /24 local probando el puerto RAW (9100 por default) con concurrencia
 * acotada. Devuelve los hosts que aceptan conexión.
 */
export async function sweepTcpPrinters(port = 9100, timeoutMs = 350, concurrency = 40): Promise<DiscoveredPrinter[]> {
  const prefixes = getLocalV24Prefixes();
  if (prefixes.length === 0) return [];

  const hosts: string[] = [];
  for (const prefix of prefixes) {
    for (let i = 1; i <= 254; i++) hosts.push(`${prefix}.${i}`);
  }

  const results: DiscoveredPrinter[] = [];
  let idx = 0;
  async function worker() {
    while (idx < hosts.length) {
      const host = hosts[idx++];
      const ok = await probeTcp(host, port, timeoutMs);
      if (ok) results.push({ name: host, address: host, port, source: 'tcp', protocol: 'raw' });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, () => worker()));
  return results;
}

/** Combina mDNS + (opcional) barrido TCP, deduplicando por address:port. */
export async function scanNetworkPrinters(opts?: { mdns?: boolean; tcpScan?: boolean; tcpPort?: number }): Promise<DiscoveredPrinter[]> {
  const useMdns = opts?.mdns !== false;
  const useTcp = opts?.tcpScan === true;
  const tcpPort = opts?.tcpPort || 9100;

  const byKey = new Map<string, DiscoveredPrinter>();
  const collect = (list: DiscoveredPrinter[]) => {
    for (const p of list) {
      const key = `${p.address}:${p.port}`;
      if (!byKey.has(key)) byKey.set(key, p);
    }
  };

  const tasks: Promise<DiscoveredPrinter[]>[] = [];
  if (useMdns) tasks.push(discoverMdnsPrinters());
  if (useTcp) tasks.push(sweepTcpPrinters(tcpPort));
  const all = await Promise.all(tasks);
  all.forEach(collect);
  return Array.from(byKey.values());
}
