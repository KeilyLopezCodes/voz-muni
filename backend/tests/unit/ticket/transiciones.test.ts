import { ESTADOS_FINALES, ESTADOS_TICKET, esFinal, type EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { PRIORIDADES, esPrioridad } from '../../../src/domain/ticket/prioridad';
import { TRANSICIONES, puedeTransicionar } from '../../../src/domain/ticket/transiciones';

// Tabla de la SPEC 04, escrita aparte para no comparar TRANSICIONES consigo misma.
const PERMITIDAS: [EstadoTicket, EstadoTicket][] = [
  ['nueva', 'en_revision'],
  ['en_revision', 'asignada'],
  ['en_revision', 'rechazada'],
  ['asignada', 'en_proceso'],
  ['asignada', 'en_revision'],
  ['en_proceso', 'en_espera'],
  ['en_proceso', 'resuelta'],
  ['en_proceso', 'en_revision'],
  ['en_espera', 'en_proceso'],
  ['resuelta', 'cerrada'],
  ['resuelta', 'en_proceso'],
];

describe('Estados y prioridades', () => {
  it('ESTADOS_TICKET tiene los 8 estados en el orden del enum de SPEC 03', () => {
    expect(ESTADOS_TICKET).toEqual([
      'nueva',
      'en_revision',
      'rechazada',
      'asignada',
      'en_proceso',
      'en_espera',
      'resuelta',
      'cerrada',
    ]);
  });

  it('PRIORIDADES tiene los 4 valores del CHECK de SPEC 03', () => {
    expect(PRIORIDADES).toEqual(['baja', 'media', 'alta', 'urgente']);
  });

  it('solo rechazada y cerrada son finales', () => {
    expect(ESTADOS_FINALES).toEqual(['rechazada', 'cerrada']);
    expect(ESTADOS_TICKET.filter(esFinal)).toEqual(['rechazada', 'cerrada']);
  });

  it('esPrioridad acepta solo los valores de PRIORIDADES', () => {
    expect(PRIORIDADES.every(esPrioridad)).toBe(true);
    expect(esPrioridad('critica')).toBe(false);
    expect(esPrioridad('')).toBe(false);
    expect(esPrioridad(null)).toBe(false);
  });
});

describe('puedeTransicionar', () => {
  const pares = ESTADOS_TICKET.flatMap((desde) => ESTADOS_TICKET.map((hacia) => [desde, hacia] as const));

  it('recorre los 64 pares origen-destino', () => {
    expect(pares).toHaveLength(64);
  });

  it.each(pares)('%s → %s coincide con la tabla de la spec', (desde, hacia) => {
    const esperada = PERMITIDAS.some(([d, h]) => d === desde && h === hacia);
    expect(puedeTransicionar(desde, hacia)).toBe(esperada);
  });

  it('exactamente 11 pares están permitidos', () => {
    expect(pares.filter(([desde, hacia]) => puedeTransicionar(desde, hacia))).toHaveLength(11);
  });

  it('los estados finales no tienen salidas', () => {
    for (const estado of ESTADOS_FINALES) {
      expect(TRANSICIONES[estado]).toEqual([]);
    }
  });
});
