/**
 * Resolución y alta de clientes por RUC.
 *
 * El RUC puede vivir en dos lugares que nunca se unificaron: `clientes.ruc` y
 * `personas.documento` (con `personas.tipoDocumento`). El buscador de clientes ya
 * mira los dos, así que acá se hace lo mismo — y al crear se escribe en ambos,
 * para que el cliente nuevo lo encuentren tanto este lookup como el buscador.
 *
 * No hay UNIQUE sobre ninguna de las dos columnas y no se puede agregar sin saber
 * qué datos hay en producción (las migraciones corren al arrancar la app). Por eso
 * el desempate es explícito: primero el activo, después el de id menor.
 */
import { DataSource, EntityManager } from 'typeorm';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { Persona } from '../../src/app/database/entities/personas/persona.entity';
import { DocumentoTipo } from '../../src/app/database/entities/personas/documento-tipo.enum';
import { setEntityUserTracking } from './entity.utils';

/**
 * Normaliza un RUC **para comparar**: sin espacios, puntos ni guiones, en
 * mayúsculas. El guion del dígito verificador se saca a propósito — el mismo RUC
 * se tipea igual de seguido como `80012345-6` que como `800123456`, y sin esto
 * cada variante crearía su propio cliente.
 *
 * Lo que se GUARDA es el formato que tipeó el usuario (sólo trim + mayúsculas):
 * normalizar el almacenamiento mostraría `800123456` en el módulo de Clientes,
 * que no es como se escribe un RUC.
 */
export function normalizarRuc(ruc: string | null | undefined): string {
  return String(ruc ?? '').replace(/[\s.\-]/g, '').trim().toUpperCase();
}

/** El RUC tal cual se guarda: se respeta el formato tipeado. */
export function formatoGuardadoRuc(ruc: string | null | undefined): string {
  return String(ruc ?? '').trim().toUpperCase();
}

export interface DatosReceptor {
  ruc?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

/**
 * Cliente cuyo RUC coincide exactamente, mirando `clientes.ruc` y
 * `personas.documento`. Prefiere el activo; entre iguales, el de id menor.
 */
export async function buscarClientePorRuc(
  managerOrDs: DataSource | EntityManager,
  ruc: string | null | undefined,
): Promise<Cliente | null> {
  const buscado = normalizarRuc(ruc);
  if (!buscado) return null;

  const candidatos: Cliente[] = await managerOrDs
    .getRepository(Cliente)
    .createQueryBuilder('cliente')
    .leftJoinAndSelect('cliente.persona', 'persona')
    .where(
      `REPLACE(REPLACE(REPLACE(UPPER(COALESCE(cliente.ruc, '')), ' ', ''), '.', ''), '-', '') = :ruc
       OR REPLACE(REPLACE(REPLACE(UPPER(COALESCE(persona.documento, '')), ' ', ''), '.', ''), '-', '') = :ruc`,
      { ruc: buscado },
    )
    .orderBy('cliente.id', 'ASC')
    .getMany();

  if (!candidatos.length) return null;
  // Un cliente desactivado a propósito (baja, duplicado, morosidad) no debe
  // resucitar sólo por tener el id más bajo.
  return candidatos.find((c) => (c as any).activo !== false) ?? candidatos[0];
}

/**
 * Devuelve el cliente del RUC, creándolo si no existe.
 *
 * Si ya existe, **sólo completa los campos que estaban vacíos**: un tipeo apurado
 * en el PdV no puede degradar un cliente curado desde el módulo de Clientes.
 *
 * Devuelve `null` si no hay RUC o no hay nombre — sin eso no hay cliente que crear.
 */
export async function resolverOCrearClientePorRuc(
  dataSource: DataSource,
  datos: DatosReceptor,
  userId?: number,
): Promise<Cliente | null> {
  const ruc = normalizarRuc(datos.ruc);
  const rucGuardado = formatoGuardadoRuc(datos.ruc);
  const nombre = String(datos.nombre ?? '').trim().toUpperCase();
  if (!ruc || !nombre) return null;

  const existente = await buscarClientePorRuc(dataSource, ruc);
  if (existente) {
    const persona: any = (existente as any).persona;
    if (persona) {
      let tocado = false;
      const completar = (campo: string, valor?: string | null) => {
        const v = String(valor ?? '').trim();
        if (v && !String(persona[campo] ?? '').trim()) {
          persona[campo] = campo === 'email' ? v : v.toUpperCase();
          tocado = true;
        }
      };
      completar('direccion', datos.direccion);
      completar('telefono', datos.telefono);
      completar('email', datos.email);
      if (tocado) {
        await setEntityUserTracking(dataSource, persona, userId, true);
        await dataSource.getRepository(Persona).save(persona);
      }
    }
    return existente;
  }

  const personaRepo = dataSource.getRepository(Persona);
  const clienteRepo = dataSource.getRepository(Cliente);

  const persona: any = personaRepo.create({
    nombre,
    // El RUC va también acá para que lo encuentre el buscador de clientes, que
    // mira `persona.documento`.
    documento: rucGuardado,
    tipoDocumento: DocumentoTipo.RUC,
    direccion: String(datos.direccion ?? '').trim().toUpperCase() || undefined,
    telefono: String(datos.telefono ?? '').trim() || undefined,
    email: String(datos.email ?? '').trim() || undefined,
  });
  await setEntityUserTracking(dataSource, persona, userId, false);
  const personaGuardada = await personaRepo.save(persona);

  const cliente: any = clienteRepo.create({
    persona: personaGuardada,
    ruc: rucGuardado,
    razon_social: nombre,
    activo: true,
    // Facturar no otorga crédito: eso se habilita a mano desde Clientes.
    tributa: true,
    credito: false,
    limite_credito: 0,
  });
  await setEntityUserTracking(dataSource, cliente, userId, false);
  const guardado = await clienteRepo.save(cliente);

  return await clienteRepo.findOne({ where: { id: guardado.id }, relations: ['persona'] });
}
