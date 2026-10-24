import {
  debeReanudar,
  esEditable,
  exigirComentable,
  exigirEditable,
  validarCuerpo,
} from '../../../src/domain/comentarios/comentario';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { ESTADOS_TICKET } from '../../../src/domain/ticket/estado-ticket';

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

describe('validarCuerpo', () => {
  it('recorta el texto', () => {
    expect(validarCuerpo('  ¿Tiene una foto?  ')).toBe('¿Tiene una foto?');
  });

  it('acepta 4000 caracteres, también con tildes', () => {
    expect(validarCuerpo('ñ'.repeat(4000))).toHaveLength(4000);
  });

  it.each(['', '   ', 'a'.repeat(4001)])('rechaza %p con CUERPO_INVALIDO', (cuerpo) => {
    expect(codigoDe(() => validarCuerpo(cuerpo))).toBe('CUERPO_INVALIDO');
  });
});

describe('exigirComentable', () => {
  it.each(['cerrada', 'rechazada'] as const)('en %s rechaza un público con QUEJA_FINALIZADA y acepta una nota interna', (estado) => {
    expect(codigoDe(() => exigirComentable(estado, false))).toBe('QUEJA_FINALIZADA');
    expect(codigoDe(() => exigirComentable(estado, true))).toBeNull();
  });

  it.each(ESTADOS_TICKET.filter((e) => e !== 'cerrada' && e !== 'rechazada'))('en %s acepta un público', (estado) => {
    expect(codigoDe(() => exigirComentable(estado, false))).toBeNull();
  });
});

describe('debeReanudar', () => {
  const base = { estadoTicket: 'en_espera' as const, autorId: 7, solicitanteId: 7, interno: false };

  it('el solicitante, en público y en en_espera, reanuda', () => {
    expect(debeReanudar(base)).toBe(true);
  });

  it.each([
    ['otro autor', { autorId: 8 }],
    ['una nota interna', { interno: true }],
    ['en en_proceso', { estadoTicket: 'en_proceso' as const }],
    ['en resuelta', { estadoTicket: 'resuelta' as const }],
  ])('con %s no reanuda', (_caso, cambios) => {
    expect(debeReanudar({ ...base, ...cambios })).toBe(false);
  });
});

describe('exigirEditable', () => {
  const creado = new Date('2026-10-23T15:00:00.000Z');

  it('acepta a los 5 minutos exactos y rechaza 1 ms después', () => {
    expect(codigoDe(() => exigirEditable(creado, new Date('2026-10-23T15:05:00.000Z')))).toBeNull();
    expect(codigoDe(() => exigirEditable(creado, new Date('2026-10-23T15:05:00.001Z')))).toBe('EDICION_VENCIDA');
  });

  it('esEditable sigue la misma ventana', () => {
    expect(esEditable(creado, new Date('2026-10-23T15:05:00.000Z'))).toBe(true);
    expect(esEditable(creado, new Date('2026-10-23T15:05:00.001Z'))).toBe(false);
  });
});
