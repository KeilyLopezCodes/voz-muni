import { z } from 'zod';
import { CLAVES_ACCIONES, ENTIDADES_BITACORA } from '../../domain/auditoria/acciones';

const accion = z.enum(CLAVES_ACCIONES as [string, ...string[]]);

// GET /api/v1/bitacora (SPEC 41). El rango de fechas (formato y 92 días como máximo) lo valida el dominio.
export const consultaBitacoraSchema = z
  .object({
    desde: z.string().optional(),
    hasta: z.string().optional(),
    // Repetible: ?accion=a&accion=b.
    accion: z
      .union([accion, z.array(accion)])
      .transform((valor) => (Array.isArray(valor) ? valor : [valor]))
      .optional(),
    entidad: z.enum(ENTIDADES_BITACORA as [string, ...string[]]).optional(),
    usuarioId: z.coerce.number().int().positive().optional(),
    numero: z
      .string()
      .regex(/^Q-\d{4}-\d{6}$/i)
      .optional(),
    cursor: z.string().min(1).max(500).optional(),
    tamano: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
