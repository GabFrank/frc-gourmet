/* Service worker mínimo para que la PWA sea instalable (manifest + SW + HTTPS).
   No cachea agresivo: solo necesita un handler de fetch (passthrough) + activarse
   ya. El auto-recovery de la app maneja los chunks; acá no interferimos. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: deja pasar la request a la red */ });
