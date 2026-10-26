import {
  ACCIONES_BITACORA,
  CLAVES_ACCIONES,
  ENTIDADES_BITACORA,
  esAccionBitacora,
  FORMATO_ACCION,
} from '../../../src/domain/auditoria/acciones';

describe('catálogo de acciones de la bitácora', () => {
  it('todas las claves cumplen el formato entidad.verbo del CHECK de la base', () => {
    for (const accion of CLAVES_ACCIONES) {
      expect(accion).toMatch(FORMATO_ACCION);
    }
  });

  it('cada acción declara su entidad, y la entidad es el prefijo salvo politica_sla (que es de una categoría)', () => {
    for (const accion of CLAVES_ACCIONES) {
      const entidad = ACCIONES_BITACORA[accion].entidad;
      expect(accion === 'politica_sla.reemplazar' ? 'categoria' : accion.split('.')[0]).toBe(entidad);
    }
    expect(ENTIDADES_BITACORA.sort()).toEqual(['categoria', 'dependencia', 'encuesta', 'parametro', 'ticket', 'traslado', 'usuario', 'zona']);
  });

  it('esAccionBitacora solo acepta las del catálogo', () => {
    expect(esAccionBitacora('ticket.aceptar')).toBe(true);
    expect(esAccionBitacora('sesion.iniciar')).toBe(false); // reservada para SPEC 42
    expect(esAccionBitacora('toString')).toBe(false);
  });
});
