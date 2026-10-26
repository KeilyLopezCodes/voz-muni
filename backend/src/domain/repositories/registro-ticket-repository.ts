import type { CampoExtra } from '../categorias/campo-extra';
import type { DatosExtra } from '../categorias/datos-extra';
import type { TicketRegistrado } from '../ticket/ticket';
import type { CorreoSalienteRepository } from './correo-saliente-repository';

export interface TicketCreado {
  id: number;
  numero: string; // Q-AAAA-NNNNNN
  creadoEn: Date;
}

// Valida datosExtra contra los campos de la categoría y devuelve los valores normalizados, o lanza.
export type PrepararDatosExtra = (campos: CampoExtra[]) => DatosExtra;

// Lo que el caso de uso hace con el ticket ya insertado, en la misma transacción: encolar el aviso (SPEC 34).
export type AlRegistrar = (creado: TicketCreado, correos: CorreoSalienteRepository) => Promise<void>;

export interface RegistroTicketRepository {
  // En una sola transacción:
  //  1. lee los campos adicionales de la categoría (FOR SHARE: un cambio de definición espera) y llama a
  //     `prepararDatosExtra`; si lanza, no se escribe nada ni se consume un número;
  //  2. toma el siguiente correlativo del año en Guatemala;
  //  3. inserta el ticket con sus datos adicionales y su historial;
  //  4. llama a `alRegistrar` con la bandeja de salida de esa transacción.
  // Lanza ReglaDeNegocioError CORRELATIVO_AGOTADO si el año ya usó los 999999 números.
  registrar(
    registro: TicketRegistrado,
    prepararDatosExtra: PrepararDatosExtra,
    alRegistrar?: AlRegistrar,
  ): Promise<TicketCreado>;
}
