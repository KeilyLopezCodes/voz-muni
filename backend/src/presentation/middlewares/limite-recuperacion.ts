import type { RequestHandler } from 'express';
import { limitePorIp } from './limite-por-ip';

// Límite de solicitudes a /auth/recuperar por IP (SPEC 09).
export function limiteRecuperacion(limitePorVentana: number): RequestHandler {
  return limitePorIp(limitePorVentana, 'Demasiadas solicitudes de recuperación; espera unos minutos');
}
