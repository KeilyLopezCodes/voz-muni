import { ALCANCES } from '../../../src/domain/auth/permisos';
import { esVistaPublica, motivoEsPublico } from '../../../src/domain/linea-tiempo/visibilidad';
import { ESTADOS_TICKET, type EstadoTicket } from '../../../src/domain/ticket/estado-ticket';

describe('motivoEsPublico', () => {
  it.each<[EstadoTicket, EstadoTicket]>([
    ['en_revision', 'rechazada'],
    ['en_proceso', 'en_espera'],
    ['en_proceso', 'resuelta'],
    ['resuelta', 'en_proceso'],
  ])('%s → %s está dirigido al vecino', (anterior, nuevo) => {
    expect(motivoEsPublico(anterior, nuevo)).toBe(true);
  });

  it.each<[EstadoTicket | null, EstadoTicket, string]>([
    [null, 'nueva', 'la creación'],
    ['nueva', 'en_revision', 'tomar en triage'],
    ['en_revision', 'asignada', 'la nota del triage'],
    ['asignada', 'en_revision', 'un traslado'],
    ['en_proceso', 'en_revision', 'un traslado en proceso'],
    ['asignada', 'en_proceso', 'iniciar'],
    ['en_espera', 'en_proceso', 'reanudar'],
    ['resuelta', 'cerrada', 'la confirmación'],
  ])('%s → %s (%s) no es público', (anterior, nuevo) => {
    expect(motivoEsPublico(anterior, nuevo)).toBe(false);
  });

  it('solo las 4 transiciones de la lista son públicas', () => {
    const publicas: string[] = [];
    for (const anterior of [null, ...ESTADOS_TICKET]) {
      for (const nuevo of ESTADOS_TICKET) {
        if (motivoEsPublico(anterior, nuevo) && nuevo !== 'rechazada') {
          publicas.push(`${anterior} → ${nuevo}`);
        }
      }
    }
    expect(publicas.sort()).toEqual(['en_proceso → en_espera', 'en_proceso → resuelta', 'resuelta → en_proceso']);
  });
});

describe('esVistaPublica', () => {
  it.each(ALCANCES)('%s', (alcance) => {
    expect(esVistaPublica(alcance)).toBe(alcance === 'propia');
  });
});
