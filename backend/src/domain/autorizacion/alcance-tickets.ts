import type { Accion, Alcance, Permisos } from '../auth/permisos';
import { type Filtro, intersectar } from './filtro';

export type CampoTicket = 'solicitanteId' | 'registradoPor' | 'asignadoA' | 'dependenciaId';
export type FiltroTickets = Filtro<CampoTicket>;

// Los campos del ticket que importan para decidir el acceso.
export interface TicketAlcance {
  solicitanteId: number;
  registradoPor: number | null;
  asignadoA: number | null;
  dependenciaId: number | null; // null mientras está en nueva o en_revision
}

export interface UsuarioAlcance {
  id: number;
  dependenciaId: number | null;
  permisos: Permisos;
}

// Traduce un alcance a un filtro sobre tickets.
// todas, si, solicitar y a_nombre_de_vecino no restringen registros: su modo de acción lo define la spec de cada acción.
export function filtroTicketsPorAlcance(usuario: UsuarioAlcance, alcance: Alcance): FiltroTickets {
  switch (alcance) {
    case 'propia':
      return [{ campo: 'solicitanteId', valor: usuario.id }];
    case 'registradas':
      return [{ campo: 'registradoPor', valor: usuario.id }];
    case 'asignadas':
      return [{ campo: 'asignadoA', valor: usuario.id }];
    case 'dependencia':
      return usuario.dependenciaId === null ? null : [{ campo: 'dependenciaId', valor: usuario.dependenciaId }];
    case 'todas':
    case 'si':
    case 'solicitar':
    case 'a_nombre_de_vecino':
      return [];
  }
}

// Para actuar sobre un ticket hace falta la acción y también verlo: alcance de la acción ∩ alcance de tickets.ver.
// null si falta cualquiera de los dos permisos.
export function filtroTicketsParaAccion(usuario: UsuarioAlcance, accion: Accion): FiltroTickets {
  const alcanceVer = usuario.permisos['tickets.ver'];
  const alcanceAccion = usuario.permisos[accion];
  if (!alcanceVer || !alcanceAccion) {
    return null;
  }
  const filtroVer = filtroTicketsPorAlcance(usuario, alcanceVer);
  if (accion === 'tickets.ver') {
    return filtroVer;
  }
  return intersectar(filtroTicketsPorAlcance(usuario, alcanceAccion), filtroVer);
}

// Un ticket con dependenciaId null no cumple una condición de dependencia: null nunca es igual a un id.
export function cumpleFiltro(ticket: TicketAlcance, filtro: FiltroTickets): boolean {
  return filtro !== null && filtro.every(({ campo, valor }) => ticket[campo] === valor);
}

export function puedeAccederTicket(usuario: UsuarioAlcance, accion: Accion, ticket: TicketAlcance): boolean {
  return cumpleFiltro(ticket, filtroTicketsParaAccion(usuario, accion));
}
