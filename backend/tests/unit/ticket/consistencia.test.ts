import type { ContextoTransicion } from '../../../src/domain/ticket/contexto-transicion';
import { ESTADOS_TICKET, type EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { Ticket, type ResultadoTransicion } from '../../../src/domain/ticket/ticket';
import { TRANSICIONES, puedeTransicionar } from '../../../src/domain/ticket/transiciones';

// Cada método que cambia de estado, con datos válidos y los estados "Desde" de la tabla de la SPEC 04.
const ahora = new Date('2026-10-22T15:00:00.000Z');
const vecino: ContextoTransicion = { actorId: 7, ahora };
const sistema: ContextoTransicion = { actorId: null, ahora };
const vigente = new Date(ahora.getTime() + 1);
const vencido = new Date(ahora.getTime() - 1);

const METODOS: { nombre: string; desde: EstadoTicket[]; ejecutar: (t: Ticket) => ResultadoTransicion }[] = [
  { nombre: 'enviarARevision', desde: ['nueva'], ejecutar: (t) => t.enviarARevision(vecino) },
  { nombre: 'rechazar', desde: ['en_revision'], ejecutar: (t) => t.rechazar(vecino, 'motivo') },
  { nombre: 'asignar', desde: ['en_revision'], ejecutar: (t) => t.asignar(vecino, 4, 'media') },
  { nombre: 'iniciar', desde: ['asignada'], ejecutar: (t) => t.iniciar(vecino) },
  { nombre: 'ponerEnEspera', desde: ['en_proceso'], ejecutar: (t) => t.ponerEnEspera(vecino, 'motivo') },
  { nombre: 'reanudar', desde: ['en_espera'], ejecutar: (t) => t.reanudar(vecino) },
  { nombre: 'resolver', desde: ['en_proceso'], ejecutar: (t) => t.resolver(vecino, 'hecho') },
  { nombre: 'confirmarSolucion', desde: ['resuelta'], ejecutar: (t) => t.confirmarSolucion(vecino, vigente) },
  { nombre: 'cerrarPorVencimiento', desde: ['resuelta'], ejecutar: (t) => t.cerrarPorVencimiento(sistema, vencido) },
  { nombre: 'reabrir', desde: ['resuelta'], ejecutar: (t) => t.reabrir(vecino, 'motivo', vigente) },
  { nombre: 'trasladar', desde: ['asignada', 'en_proceso'], ejecutar: (t) => t.trasladar(vecino, 'motivo') },
];

function ticketEn(estado: EstadoTicket): Ticket {
  return Ticket.reconstituir({
    id: 1,
    numero: 'Q-2026-000001',
    estado,
    dependenciaId: 4,
    asignadoA: 9,
    prioridad: 'media',
    escalado: false,
    resueltoEn: null,
    cerradoEn: null,
  });
}

// Pares (desde, hacia) que producen los métodos al ejecutarse desde cada estado de su columna "Desde".
const producidos = METODOS.flatMap((metodo) =>
  metodo.desde.map((desde) => {
    const { ticket, historial } = metodo.ejecutar(ticketEn(desde));
    return { metodo: metodo.nombre, desde, hacia: ticket.estado, historial };
  }),
);

describe('Consistencia entre los métodos de Ticket y TRANSICIONES', () => {
  it.each(producidos)('$metodo: $desde → $hacia existe en TRANSICIONES', ({ desde, hacia, historial }) => {
    expect(puedeTransicionar(desde, hacia)).toBe(true);
    expect(historial).toMatchObject({ estadoAnterior: desde, estadoNuevo: hacia });
  });

  it('cada una de las 11 transiciones la produce al menos un método', () => {
    const tabla = ESTADOS_TICKET.flatMap((desde) => TRANSICIONES[desde].map((hacia) => `${desde}→${hacia}`));
    const cubiertas = new Set(producidos.map(({ desde, hacia }) => `${desde}→${hacia}`));

    expect(tabla).toHaveLength(11);
    expect([...cubiertas].sort()).toEqual([...tabla].sort());
  });
});
