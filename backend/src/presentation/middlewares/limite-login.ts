import type { RequestHandler } from 'express';
import { limitePorIp } from './limite-por-ip';

// RNF-10: límite de peticiones a /auth/login por IP (SPEC 08).
export function limiteLogin(limitePorVentana: number): RequestHandler {
  return limitePorIp(limitePorVentana, 'Demasiados intentos de inicio de sesión; espera unos minutos');
}
