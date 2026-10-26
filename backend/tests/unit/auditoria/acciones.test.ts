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

  // politica_sla es de una categoría, y sesion y password son de un usuario (SPEC 42).
  const ENTIDAD_POR_PREFIJO: Record<string, string> = { politica_sla: 'categoria', sesion: 'usuario', password: 'usuario' };

  it('cada acción declara su entidad, y la entidad es el prefijo salvo politica_sla, sesion y password', () => {
    for (const accion of CLAVES_ACCIONES) {
      const prefijo = accion.split('.')[0];
      expect(ACCIONES_BITACORA[accion].entidad).toBe(ENTIDAD_POR_PREFIJO[prefijo] ?? prefijo);
    }
    expect([...ENTIDADES_BITACORA].sort()).toEqual([
      'adjunto',
      'categoria',
      'comentario',
      'dependencia',
      'encuesta',
      'parametro',
      'ticket',
      'traslado',
      'usuario',
      'zona',
    ]);
  });

  it('las 12 acciones de SPEC 42 están en el catálogo', () => {
    const nuevas = [
      'sesion.iniciar',
      'sesion.fallar',
      'sesion.bloquear',
      'sesion.cerrar',
      'password.solicitar',
      'password.definir',
      'usuario.registrar',
      'usuario.verificar_correo',
      'comentario.crear',
      'comentario.editar',
      'adjunto.subir',
      'adjunto.borrar',
    ];
    expect(nuevas.filter((accion) => !esAccionBitacora(accion))).toEqual([]);
    expect(CLAVES_ACCIONES).toHaveLength(44);
  });

  it('esAccionBitacora solo acepta las del catálogo', () => {
    expect(esAccionBitacora('ticket.aceptar')).toBe(true);
    expect(esAccionBitacora('sesion.renovar')).toBe(false); // la renovación no se registra (SPEC 42)
    expect(esAccionBitacora('toString')).toBe(false);
  });
});
