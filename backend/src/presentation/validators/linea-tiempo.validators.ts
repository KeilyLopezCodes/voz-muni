import { z } from 'zod';
import { type CursorLineaTiempo, decodificarCursor } from '../../application/services/linea-tiempo.service';

// Query de GET /api/v1/tickets/:id/linea-tiempo (SPEC 28). Un cursor mal formado responde VALIDACION.
export const lineaTiempoSchema = z
  .object({
    cursor: z
      .string()
      .max(500)
      .optional()
      .transform((valor, ctx): CursorLineaTiempo | null => {
        if (valor === undefined) {
          return null;
        }
        const cursor = decodificarCursor(valor);
        if (!cursor) {
          ctx.addIssue({ code: 'custom', message: 'cursor inválido' });
          return z.NEVER;
        }
        return cursor;
      }),
    tamano: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
