import type { Accion, Alcance, Permisos } from '../../../src/domain/auth/permisos';
import {
  cumpleFiltro,
  type FiltroTickets,
  filtroTicketsParaAccion,
  filtroTicketsPorAlcance,
  puedeAccederTicket,
  type TicketAlcance,
  type UsuarioAlcance,
} from '../../../src/domain/autorizacion/alcance-tickets';

// Matriz de permisos de SPEC 08 (0006_roles) más admin.usuarios de SPEC 10.
const MATRIZ: Record<string, Permisos> = {
  vecino: {
    'tickets.crear': 'propia',
    'tickets.ver': 'propia',
    'tickets.cambiar_estado': 'propia',
    'comentarios.publico': 'si',
  },
  receptor: {
    'tickets.crear': 'a_nombre_de_vecino',
    'tickets.ver': 'registradas',
    'tickets.clasificar': 'todas',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
  },
  tecnico: {
    'tickets.ver': 'asignadas',
    'tickets.trasladar': 'solicitar',
    'tickets.cambiar_estado': 'asignadas',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
    'reportes.ver': 'propia',
  },
  coordinador: {
    'tickets.ver': 'dependencia',
    'tickets.clasificar': 'todas',
    'tickets.asignar': 'dependencia',
    'tickets.trasladar': 'solicitar',
    'tickets.cambiar_estado': 'dependencia',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
    'reportes.ver': 'dependencia',
    'bitacora.ver': 'dependencia',
  },
  supervisor: {
    'tickets.crear': 'todas',
    'tickets.ver': 'todas',
    'tickets.clasificar': 'todas',
    'tickets.asignar': 'todas',
    'tickets.trasladar': 'todas',
    'tickets.cambiar_estado': 'todas',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
    'reportes.ver': 'todas',
    'bitacora.ver': 'todas',
  },
  administrador: {
    'tickets.ver': 'todas',
    'reportes.ver': 'todas',
    'admin.catalogos': 'si',
    'admin.usuarios': 'si',
    'bitacora.ver': 'todas',
  },
};

const DEP = 10;
const USUARIOS: Record<string, UsuarioAlcance> = {
  vecino: { id: 1, dependenciaId: null, permisos: MATRIZ.vecino },
  receptor: { id: 2, dependenciaId: null, permisos: MATRIZ.receptor },
  tecnico: { id: 3, dependenciaId: DEP, permisos: MATRIZ.tecnico },
  coordinador: { id: 4, dependenciaId: DEP, permisos: MATRIZ.coordinador },
  supervisor: { id: 5, dependenciaId: null, permisos: MATRIZ.supervisor },
  administrador: { id: 6, dependenciaId: null, permisos: MATRIZ.administrador },
};

const sol = (valor: number) => ({ campo: 'solicitanteId' as const, valor });
const reg = (valor: number) => ({ campo: 'registradoPor' as const, valor });
const asig = (valor: number) => ({ campo: 'asignadoA' as const, valor });
const dep = (valor: number) => ({ campo: 'dependenciaId' as const, valor });

describe('filtroTicketsPorAlcance', () => {
  const usuario: UsuarioAlcance = { id: 7, dependenciaId: DEP, permisos: {} };

  it.each<[Alcance, FiltroTickets]>([
    ['propia', [sol(7)]],
    ['registradas', [reg(7)]],
    ['asignadas', [asig(7)]],
    ['dependencia', [dep(DEP)]],
    ['todas', []],
    ['si', []],
    ['solicitar', []],
    ['a_nombre_de_vecino', []],
  ])('%s → %j', (alcance, esperado) => {
    expect(filtroTicketsPorAlcance(usuario, alcance)).toEqual(esperado);
  });

  it('dependencia sin dependencia → null', () => {
    expect(filtroTicketsPorAlcance({ ...usuario, dependenciaId: null }, 'dependencia')).toBeNull();
  });
});

describe('filtroTicketsParaAccion con la matriz de SPEC 08', () => {
  // [rol, ver, clasificar, asignar, trasladar, cambiar_estado]
  const ACCIONES: Accion[] = [
    'tickets.ver',
    'tickets.clasificar',
    'tickets.asignar',
    'tickets.trasladar',
    'tickets.cambiar_estado',
  ];
  const ESPERADO: [string, FiltroTickets[]][] = [
    ['vecino', [[sol(1)], null, null, null, [sol(1), sol(1)]]],
    ['receptor', [[reg(2)], [reg(2)], null, null, null]],
    ['tecnico', [[asig(3)], null, null, [asig(3)], [asig(3), asig(3)]]],
    ['coordinador', [[dep(DEP)], [dep(DEP)], [dep(DEP), dep(DEP)], [dep(DEP)], [dep(DEP), dep(DEP)]]],
    ['supervisor', [[], [], [], [], []]],
    ['administrador', [[], null, null, null, null]],
  ];

  for (const [rol, filtros] of ESPERADO) {
    it.each(ACCIONES.map((accion, i) => [accion, filtros[i]] as const))(`${rol} y %s → %j`, (accion, esperado) => {
      expect(filtroTicketsParaAccion(USUARIOS[rol], accion)).toEqual(esperado);
    });
  }

  it('el coordinador solo clasifica en su dependencia aunque su alcance de clasificar sea todas', () => {
    expect(filtroTicketsParaAccion(USUARIOS.coordinador, 'tickets.clasificar')).toEqual([dep(DEP)]);
  });

  it('sin tickets.ver no accede aunque tenga la acción', () => {
    const sinVer: UsuarioAlcance = { id: 9, dependenciaId: null, permisos: { 'tickets.clasificar': 'todas' } };
    expect(filtroTicketsParaAccion(sinVer, 'tickets.clasificar')).toBeNull();
  });
});

describe('cumpleFiltro y puedeAccederTicket', () => {
  const ticket: TicketAlcance = { solicitanteId: 1, registradoPor: 2, asignadoA: 3, dependenciaId: DEP };
  const sinDependencia: TicketAlcance = { solicitanteId: 1, registradoPor: 2, asignadoA: null, dependenciaId: null };

  it('null no deja pasar nada y [] deja pasar todo', () => {
    expect(cumpleFiltro(ticket, null)).toBe(false);
    expect(cumpleFiltro(ticket, [])).toBe(true);
  });

  it('exige todas las condiciones', () => {
    expect(cumpleFiltro(ticket, [asig(3), dep(DEP)])).toBe(true);
    expect(cumpleFiltro(ticket, [asig(3), dep(99)])).toBe(false);
  });

  it('un ticket sin dependencia no lo ven el coordinador ni el técnico', () => {
    expect(puedeAccederTicket(USUARIOS.coordinador, 'tickets.ver', sinDependencia)).toBe(false);
    expect(puedeAccederTicket(USUARIOS.tecnico, 'tickets.ver', sinDependencia)).toBe(false);
  });

  it('un ticket sin dependencia sí lo ven el supervisor, el administrador, el solicitante y quien lo registró', () => {
    for (const rol of ['supervisor', 'administrador', 'vecino', 'receptor']) {
      expect(puedeAccederTicket(USUARIOS[rol], 'tickets.ver', sinDependencia)).toBe(true);
    }
  });

  it('el coordinador no asigna un ticket de otra dependencia', () => {
    expect(puedeAccederTicket(USUARIOS.coordinador, 'tickets.asignar', { ...ticket, dependenciaId: 99 })).toBe(false);
    expect(puedeAccederTicket(USUARIOS.coordinador, 'tickets.asignar', ticket)).toBe(true);
  });
});
