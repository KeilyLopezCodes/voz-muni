import { z } from 'zod';
import { TIPOS_ZONA } from '../../domain/catalogos/zona';

// /api/v1/admin/{dependencias,categorias,zonas} (SPEC 40). El largo y la forma del nombre los valida el dominio
// (NOMBRE_INVALIDO); aquí solo un tope contra cuerpos enormes.
const nombre = z.string().max(1000);
const alMenosUno = (cuerpo: Record<string, unknown>) => Object.values(cuerpo).some((valor) => valor !== undefined);
const ALGUN_CAMBIO = { error: 'envía al menos un campo' };

export const idCatalogoSchema = z.object({ id: z.coerce.number().int().positive() });

export const nuevaDependenciaSchema = z.object({ nombre }).strict();
export const cambiosDependenciaSchema = z
  .object({ nombre: nombre.optional(), activa: z.boolean().optional() })
  .strict()
  .refine(alMenosUno, ALGUN_CAMBIO);

export const nuevaCategoriaSchema = z.object({ nombre, dependenciaId: z.number().int().positive() }).strict();
export const cambiosCategoriaSchema = z
  .object({ nombre: nombre.optional(), dependenciaId: z.number().int().positive().optional(), activa: z.boolean().optional() })
  .strict()
  .refine(alMenosUno, ALGUN_CAMBIO);

export const nuevaZonaSchema = z.object({ nombre, tipo: z.enum(TIPOS_ZONA) }).strict();
export const cambiosZonaSchema = z
  .object({ nombre: nombre.optional(), tipo: z.enum(TIPOS_ZONA).optional(), activa: z.boolean().optional() })
  .strict()
  .refine(alMenosUno, ALGUN_CAMBIO);
