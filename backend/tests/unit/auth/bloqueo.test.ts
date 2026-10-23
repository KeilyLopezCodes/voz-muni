import {
  DURACION_BLOQUEO_MS,
  type EstadoBloqueo,
  estaBloqueado,
  MAX_INTENTOS,
  registrarExito,
  registrarFallo,
  SIN_BLOQUEO,
} from '../../../src/domain/auth/bloqueo';

const ahora = new Date('2026-10-22T15:00:00.000Z');

function fallar(veces: number, desde: EstadoBloqueo = SIN_BLOQUEO): EstadoBloqueo {
  let estado = desde;
  for (let i = 0; i < veces; i++) {
    estado = registrarFallo(estado, ahora).estado;
  }
  return estado;
}

describe('bloqueo por intentos fallidos', () => {
  it('usa 5 intentos y 15 minutos', () => {
    expect(MAX_INTENTOS).toBe(5);
    expect(DURACION_BLOQUEO_MS).toBe(15 * 60 * 1000);
  });

  it('4 fallos suman intentos pero no bloquean', () => {
    const estado = fallar(4);

    expect(estado).toEqual({ intentosFallidos: 4, bloqueadoHasta: null });
    expect(estaBloqueado(estado, ahora)).toBe(false);
  });

  it('el 5.º fallo bloquea 15 minutos y reinicia el contador', () => {
    const resultado = registrarFallo(fallar(4), ahora);

    expect(resultado.bloqueado).toBe(true);
    expect(resultado.estado).toEqual({
      intentosFallidos: 0,
      bloqueadoHasta: new Date('2026-10-22T15:15:00.000Z'),
    });
    expect(estaBloqueado(resultado.estado, ahora)).toBe(true);
  });

  it('sigue bloqueado justo antes de que venza y se desbloquea al vencer', () => {
    const estado = fallar(5);
    const vence = estado.bloqueadoHasta!.getTime();

    expect(estaBloqueado(estado, new Date(vence - 1))).toBe(true);
    expect(estaBloqueado(estado, new Date(vence))).toBe(false);
    expect(estaBloqueado(estado, new Date(vence + 1))).toBe(false);
  });

  it('un éxito limpia intentos y bloqueo', () => {
    expect(fallar(3)).toEqual({ intentosFallidos: 3, bloqueadoHasta: null });
    expect(registrarExito()).toEqual({ intentosFallidos: 0, bloqueadoHasta: null });
  });

  it('no modifica el estado recibido', () => {
    const estado: EstadoBloqueo = { intentosFallidos: 2, bloqueadoHasta: null };
    registrarFallo(estado, ahora);

    expect(estado).toEqual({ intentosFallidos: 2, bloqueadoHasta: null });
  });
});
