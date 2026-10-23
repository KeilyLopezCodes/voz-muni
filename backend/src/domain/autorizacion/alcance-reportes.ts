import type { FiltroTickets, UsuarioAlcance } from './alcance-tickets';

// Los reportes cuentan tickets, así que su filtro es sobre tickets, según permisos['reportes.ver'].
// `propia` del técnico = sus tickets asignados: un técnico no es solicitante de quejas (decisión revisable de SPEC 11).
export function filtroReportes(usuario: UsuarioAlcance): FiltroTickets {
  switch (usuario.permisos['reportes.ver']) {
    case 'propia':
      return [{ campo: 'asignadoA', valor: usuario.id }];
    case 'dependencia':
      return usuario.dependenciaId === null ? null : [{ campo: 'dependenciaId', valor: usuario.dependenciaId }];
    case 'todas':
      return [];
    default:
      return null;
  }
}
