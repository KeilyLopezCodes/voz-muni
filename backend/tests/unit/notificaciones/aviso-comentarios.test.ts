import {
  alComentar,
  debeEnviarAgrupado,
  type EstadoAvisoComentarios,
  ventanaValida,
} from '../../../src/domain/notificaciones/aviso-comentarios';

const T0 = new Date('2026-11-02T15:00:00.000Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);
const VENTANA = 30;
const SIN_AVISO: EstadoAvisoComentarios = { avisoComentarioEn: null, pendientes: 0 };

describe('alComentar', () => {
  it('sin aviso previo envía ahora y abre la ventana', () => {
    expect(alComentar(SIN_AVISO, T0, VENTANA)).toEqual({
      tipo: 'enviar_ahora',
      nuevoEstado: { avisoComentarioEn: T0, pendientes: 0 },
    });
  });

  it('dentro de la ventana acumula: 1 y luego 2 pendientes', () => {
    const primero = alComentar({ avisoComentarioEn: T0, pendientes: 0 }, minutos(10), VENTANA);
    expect(primero).toEqual({ tipo: 'acumular', nuevoEstado: { avisoComentarioEn: T0, pendientes: 1 } });
    const segundo = alComentar(primero.nuevoEstado, minutos(20), VENTANA);
    expect(segundo).toEqual({ tipo: 'acumular', nuevoEstado: { avisoComentarioEn: T0, pendientes: 2 } });
  });

  it('a los 30 minutos exactos la ventana está cerrada y envía ahora', () => {
    expect(alComentar({ avisoComentarioEn: T0, pendientes: 2 }, minutos(30), VENTANA)).toEqual({
      tipo: 'enviar_ahora',
      nuevoEstado: { avisoComentarioEn: minutos(30), pendientes: 0 },
    });
  });

  it('con ventana 0 (parámetro inválido) siempre envía al instante', () => {
    expect(alComentar({ avisoComentarioEn: T0, pendientes: 0 }, T0, 0).tipo).toBe('enviar_ahora');
  });
});

describe('debeEnviarAgrupado', () => {
  it('es true solo con pendientes y la ventana cerrada', () => {
    expect(debeEnviarAgrupado({ avisoComentarioEn: T0, pendientes: 2 }, minutos(30), VENTANA)).toBe(true);
    expect(debeEnviarAgrupado({ avisoComentarioEn: T0, pendientes: 2 }, minutos(29), VENTANA)).toBe(false);
    expect(debeEnviarAgrupado({ avisoComentarioEn: T0, pendientes: 0 }, minutos(60), VENTANA)).toBe(false);
  });
});

describe('ventanaValida', () => {
  it('acepta enteros de 1 a 1440', () => {
    expect(ventanaValida(30)).toBe(30);
    expect(ventanaValida(1)).toBe(1);
    expect(ventanaValida(1440)).toBe(1440);
  });

  it.each([0, 1441, 2.5, '30', null, undefined])('rechaza %p', (valor) => {
    expect(ventanaValida(valor)).toBeNull();
  });
});
