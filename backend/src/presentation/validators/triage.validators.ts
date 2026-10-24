import { z } from 'zod';
import { ESTADOS_TRIAGE } from '../../domain/repositories/triage-lectura-repository';

// Sin `estado` la bandeja trae los dos (nueva y en_revision).
export const bandejaTriageSchema = z
  .object({
    estado: z.enum(ESTADOS_TRIAGE).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .transform(({ estado, ...resto }) => ({ ...resto, estados: estado ? [estado] : [...ESTADOS_TRIAGE] }));
