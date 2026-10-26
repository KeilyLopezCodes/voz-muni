import { z } from 'zod';

// GET /api/v1/public/tickets/:numero?contacto= (SPEC 37). El formato del número y el contacto los valida el servicio.
export const numeroConsultaSchema = z.object({ numero: z.string().min(1).max(20) });

// Solo `contacto`: cualquier otro parámetro responde 400.
export const contactoConsultaSchema = z.object({ contacto: z.string().min(1).max(254) }).strict();
