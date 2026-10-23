import type { UsuarioAlcance } from './alcance-tickets';
import type { Filtro } from './filtro';

export type CampoBitacora = 'dependenciaId';
export type FiltroBitacora = Filtro<CampoBitacora>;

// Según permisos['bitacora.ver']. Las filas sin dependencia (usuarios, catálogos, sistema) solo las ve el alcance `todas`.
export function filtroBitacora(usuario: UsuarioAlcance): FiltroBitacora {
  switch (usuario.permisos['bitacora.ver']) {
    case 'dependencia':
      return usuario.dependenciaId === null ? null : [{ campo: 'dependenciaId', valor: usuario.dependenciaId }];
    case 'todas':
      return [];
    default:
      return null;
  }
}
