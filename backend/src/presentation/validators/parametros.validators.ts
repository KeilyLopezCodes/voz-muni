import { z } from 'zod';

// Solo el sobre: un objeto. Las propiedades y sus rangos los valida el dominio (LIMITES_INVALIDOS).
export const limitesMunicipioSchema = z.record(z.string(), z.unknown());
