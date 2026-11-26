/**
 * Teléfonos de la tienda: la validación del storefront (país + número) y la normalización del
 * servidor tienen que coincidir. Corre sin base de datos.
 *
 *   npm run test:telefono
 */
import { PAISES_TELEFONO, analizarTelefono, separarTelefono, telefonoLegible } from '../projects/storefront/src/app/core/telefono';
import { normalizarTelefonoContacto, telefonoInternacional, variantesTelefono } from '../electron/utils/telefono-contacto.utils';

let ok = 0; let fallas = 0;
const check = (nombre: string, cond: boolean, extra?: any) => {
  if (cond) { ok++; console.log(`  ✅ ${nombre}`); } else { fallas++; console.log(`  ❌ ${nombre}`, extra ?? ''); }
};
const pais = (iso: string) => PAISES_TELEFONO.find((p) => p.iso === iso)!;
const PY = pais('PY');

console.log('\n== Paraguay ==');
for (const t of ['0982187492', '982187492', '0982 187 492', '+595 982 187 492', '595982187492', '00595982187492']) {
  const a = analizarTelefono(PY, t, { soloMovil: true });
  check(`«${t}» → 595982187492`, a.estado === 'valido' && a.e164 === '595982187492', a);
}
check('legible', analizarTelefono(PY, '0982187492').legible === '+595 982 187 492');
check('incompleto mientras escribe', analizarTelefono(PY, '09821').estado === 'incompleto');
check('pista cuenta los dígitos', analizarTelefono(PY, '0982187').mensaje === 'Faltan 2 dígitos.', analizarTelefono(PY, '0982187'));
check('demasiados dígitos', analizarTelefono(PY, '09821874921').estado === 'invalido');
check('fijo de Asunción vale como contacto', analizarTelefono(PY, '021 123 456').estado === 'valido');
check('fijo no vale para el código de WhatsApp', analizarTelefono(PY, '021 123 456', { soloMovil: true }).estado === 'invalido');
check('fijo se marca apenas se ve el prefijo', analizarTelefono(PY, '021', { soloMovil: true }).estado === 'invalido');
check('celular a medias no se marca como error', analizarTelefono(PY, '098', { soloMovil: true }).estado === 'incompleto');
check('vacío', analizarTelefono(PY, '').estado === 'vacio');
check('letras solas = vacío', analizarTelefono(PY, 'abc').estado === 'vacio');

console.log('\n== Otros países ==');
check('Argentina', analizarTelefono(pais('AR'), '11 2345 6789').e164 === '541123456789');
check('Brasil celular', analizarTelefono(pais('BR'), '(11) 91234-5678', { soloMovil: true }).e164 === '5511912345678');
check('Brasil fijo no es celular', analizarTelefono(pais('BR'), '11 3123 4567', { soloMovil: true }).estado === 'invalido');
check('Uruguay con 0', analizarTelefono(pais('UY'), '094 123 456').e164 === '59894123456');
check('EE.UU.', analizarTelefono(pais('US'), '(201) 555-0123').e164 === '12015550123');
check('Otro país pide el código', analizarTelefono(pais('XX'), '+44 7400 123456').e164 === '447400123456');
check('Otro país con 0 local = inválido', analizarTelefono(pais('XX'), '0982187492').estado === 'invalido');
check('Otro país con 00', analizarTelefono(pais('XX'), '0044 7400 123456').e164 === '447400123456');
check('Otro país corto = incompleto', analizarTelefono(pais('XX'), '+44 74').estado === 'incompleto');

console.log('\n== Precarga de lo guardado ==');
let s = separarTelefono('595982187492');
check('internacional PY', s.pais.iso === 'PY' && s.numero === '982187492', s);
s = separarTelefono('0981000222');
check('local viejo', s.pais.iso === 'PY' && s.numero === '981000222', s);
s = separarTelefono('5511912345678');
check('Brasil', s.pais.iso === 'BR' && s.numero === '11912345678', s);
s = separarTelefono('447400123456');
check('desconocido → Otro país', s.pais.iso === 'XX', s);
check('telefonoLegible', telefonoLegible('595982187492') === '+595 982 187 492');
check('telefonoLegible vacío', telefonoLegible(null) === '');

console.log('\n== Servidor ==');
check('local PY → internacional', telefonoInternacional('0981 555 111') === '595981555111');
check('sin 0 → internacional', telefonoInternacional('981555111') === '595981555111');
check('ya internacional', telefonoInternacional('595981555111') === '595981555111');
check('otro país intacto', telefonoInternacional('5511912345678') === '5511912345678');
check('variantes PY', JSON.stringify(variantesTelefono('595981555111')) === JSON.stringify(['595981555111', '0981555111', '981555111']));
check('variantes otro país', variantesTelefono('5511912345678').length === 1);
const c = normalizarTelefonoContacto('0981000222');
check('contacto local → internacional', c.ok && (c as any).telefono === '595981000222', c);
check('contacto corto', !normalizarTelefonoContacto('12345').ok);

// Lo que el storefront manda, el servidor lo deja igual.
for (const p of PAISES_TELEFONO.filter((x) => x.codigo)) {
  const a = analizarTelefono(p, p.ejemplo);
  check(`${p.iso}: ejemplo válido y el servidor no lo cambia`, a.estado === 'valido' && telefonoInternacional(a.e164) === a.e164, a);
}

console.log(`\n${ok} OK, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
