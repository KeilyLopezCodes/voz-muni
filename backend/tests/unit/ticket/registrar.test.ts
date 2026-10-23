import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { type DatosRegistro, Ticket } from '../../../src/domain/ticket/ticket';

const ahora = new Date('2026-10-22T15:00:00.000Z');
const ctx = { actorId: 7, ahora };

const datos: DatosRegistro = {
  solicitanteId: 3,
  registradoPor: 7,
  categoriaId: 2,
  zonaId: 5,
  canal: 'ventanilla',
  titulo: 'Bache en la calle',
  descripcion: 'Hay un bache profundo frente a la escuela',
  direccion: '5a avenida 3-20, zona 1',
};

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

describe('Ticket.registrar', () => {
  it('devuelve la queja en nueva con su historial de creación a nombre de quien registra', () => {
    expect(Ticket.registrar(datos, ctx)).toEqual({
      datos,
      estado: 'nueva',
      historial: { estadoAnterior: null, estadoNuevo: 'nueva', usuarioId: 7, motivo: null, creadoEn: ahora },
    });
  });

  it('recorta título, descripción y dirección', () => {
    const { datos: recortados } = Ticket.registrar(
      { ...datos, titulo: '  Bache  ', descripcion: '\n Descripción larga \t', direccion: '  Calle 1, zona 2 ' },
      ctx,
    );

    expect(recortados).toMatchObject({ titulo: 'Bache', descripcion: 'Descripción larga', direccion: 'Calle 1, zona 2' });
  });

  it.each([
    ['titulo', 'x'.repeat(4), 'TITULO_INVALIDO'],
    ['titulo', 'x'.repeat(151), 'TITULO_INVALIDO'],
    ['titulo', `   ${'x'.repeat(4)}   `, 'TITULO_INVALIDO'],
    ['descripcion', 'x'.repeat(9), 'DESCRIPCION_INVALIDA'],
    ['descripcion', 'x'.repeat(4001), 'DESCRIPCION_INVALIDA'],
    ['direccion', 'x'.repeat(4), 'DIRECCION_INVALIDA'],
    ['direccion', 'x'.repeat(301), 'DIRECCION_INVALIDA'],
  ])('%s fuera de rango (%#) → %s', (campo, valor, codigo) => {
    expect(codigoDe(() => Ticket.registrar({ ...datos, [campo]: valor }, ctx))).toBe(codigo);
  });

  it.each([
    ['titulo', 5],
    ['titulo', 150],
    ['descripcion', 10],
    ['descripcion', 4000],
    ['direccion', 5],
    ['direccion', 300],
  ])('acepta %s con %i caracteres', (campo, longitud) => {
    expect(codigoDe(() => Ticket.registrar({ ...datos, [campo]: 'x'.repeat(longitud) }, ctx))).toBeNull();
  });

  it.each(['solicitanteId', 'registradoPor', 'categoriaId', 'zonaId'])('%s inválido → DATO_INVALIDO', (campo) => {
    for (const valor of [0, -1, 1.5]) {
      expect(codigoDe(() => Ticket.registrar({ ...datos, [campo]: valor }, ctx))).toBe('DATO_INVALIDO');
    }
  });

  it('un canal desconocido → DATO_INVALIDO', () => {
    expect(codigoDe(() => Ticket.registrar({ ...datos, canal: 'whatsapp' as DatosRegistro['canal'] }, ctx))).toBe(
      'DATO_INVALIDO',
    );
  });
});
