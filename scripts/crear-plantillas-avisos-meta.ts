/**
 * Crea en una cuenta de WhatsApp Business (WABA) las plantillas de los avisos del pedido
 * (`electron/utils/avisos-plantillas.ts`) que todavía no estén, y muestra el estado de todas.
 *
 *   npx ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json \
 *     scripts/crear-plantillas-avisos-meta.ts <WABA_ID> [--solo-ver]
 *
 * El token sale del llavero (el mismo que usa la tienda: com.frcgourmet.app /
 * tienda-whatsapp-cloud-token) y nunca se imprime. Es idempotente: una plantilla que ya existe
 * con ese nombre e idioma no se vuelve a crear.
 */
import { IDIOMA_PLANTILLAS_AVISO, PLANTILLAS_AVISO } from '../electron/utils/avisos-plantillas';

const GRAPH = 'https://graph.facebook.com/v20.0';
const EJEMPLO = ['LA COCINA', 'PO-000123', 'https://tienda.ejemplo.com/tienda/pedido/PO-000123'];

async function main() {
  const waba = process.argv[2];
  const soloVer = process.argv.includes('--solo-ver');
  if (!/^\d+$/.test(waba || '')) throw new Error('Falta el WABA_ID (solo dígitos)');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const keytar = require('keytar');
  const token: string = (await keytar.getPassword('com.frcgourmet.app', 'tienda-whatsapp-cloud-token')) || '';
  if (!token) throw new Error('No hay token en el llavero');
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const limpio = (t: string) => t.split(token).join('***');

  const listar = async () => {
    const r = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,language,status,category,rejected_reason&limit=200`, { headers: h });
    const j: any = await r.json();
    if (!r.ok) throw new Error(limpio(`listar: HTTP ${r.status} ${JSON.stringify(j?.error?.message || j)}`));
    return (j.data || []) as any[];
  };

  const existentes = await listar();
  for (const p of Object.values(PLANTILLAS_AVISO)) {
    if (existentes.some((e) => e.name === p.nombre && e.language === IDIOMA_PLANTILLAS_AVISO)) continue;
    if (soloVer) { console.log(`falta  ${p.nombre}`); continue; }
    const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
      method: 'POST', headers: h,
      body: JSON.stringify({
        name: p.nombre, language: IDIOMA_PLANTILLAS_AVISO, category: 'UTILITY',
        components: [{ type: 'BODY', text: p.cuerpo, example: { body_text: [EJEMPLO] } }],
      }),
    });
    const j: any = await r.json();
    console.log(r.ok
      ? `creada ${p.nombre}: ${j.status}${j.category && j.category !== 'UTILITY' ? ` (Meta la pasó a ${j.category})` : ''}`
      : limpio(`ERROR  ${p.nombre}: HTTP ${r.status} ${j?.error?.error_user_msg || j?.error?.message || ''}`));
  }
  console.log('\nEstado:');
  const nombres = new Set(Object.values(PLANTILLAS_AVISO).map((p) => p.nombre));
  for (const e of await listar()) {
    if (nombres.has(e.name)) console.log(`  ${e.name.padEnd(36)} ${e.language}  ${e.status}  ${e.category}${e.rejected_reason && e.rejected_reason !== 'NONE' ? `  motivo: ${e.rejected_reason}` : ''}`);
  }
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
