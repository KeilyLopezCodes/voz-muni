import type { Permisos } from '../../../src/domain/auth/permisos';
import { filtroBitacora } from '../../../src/domain/autorizacion/alcance-bitacora';
import { filtroReportes } from '../../../src/domain/autorizacion/alcance-reportes';
import type { UsuarioAlcance } from '../../../src/domain/autorizacion/alcance-tickets';

const DEP = 10;

function usuario(id: number, permisos: Permisos, dependenciaId: number | null = DEP): UsuarioAlcance {
  return { id, dependenciaId, permisos };
}

const tecnico = usuario(3, { 'reportes.ver': 'propia' });
const coordinador = usuario(4, { 'reportes.ver': 'dependencia', 'bitacora.ver': 'dependencia' });
const supervisor = usuario(5, { 'reportes.ver': 'todas', 'bitacora.ver': 'todas' }, null);
const vecino = usuario(1, { 'tickets.ver': 'propia' }, null);

describe('filtroReportes', () => {
  it('técnico → sus tickets asignados', () => {
    expect(filtroReportes(tecnico)).toEqual([{ campo: 'asignadoA', valor: 3 }]);
  });

  it('coordinador → su dependencia, o null sin dependencia', () => {
    expect(filtroReportes(coordinador)).toEqual([{ campo: 'dependenciaId', valor: DEP }]);
    expect(filtroReportes({ ...coordinador, dependenciaId: null })).toBeNull();
  });

  it('supervisor → todos', () => {
    expect(filtroReportes(supervisor)).toEqual([]);
  });

  it('vecino sin reportes.ver → null', () => {
    expect(filtroReportes(vecino)).toBeNull();
  });

  it('un alcance que no se usa en reportes → null', () => {
    expect(filtroReportes(usuario(9, { 'reportes.ver': 'si' }))).toBeNull();
  });
});

describe('filtroBitacora', () => {
  it('técnico sin bitacora.ver → null', () => {
    expect(filtroBitacora(tecnico)).toBeNull();
  });

  it('coordinador → su dependencia, o null sin dependencia', () => {
    expect(filtroBitacora(coordinador)).toEqual([{ campo: 'dependenciaId', valor: DEP }]);
    expect(filtroBitacora({ ...coordinador, dependenciaId: null })).toBeNull();
  });

  it('supervisor → todas las filas', () => {
    expect(filtroBitacora(supervisor)).toEqual([]);
  });

  it('propia no se usa en la bitácora → null', () => {
    expect(filtroBitacora(usuario(9, { 'bitacora.ver': 'propia' }))).toBeNull();
  });
});
