import type { Knex } from 'knex';
import type { Permisos } from '../../src/domain/auth/permisos';
import { filtroBitacora } from '../../src/domain/autorizacion/alcance-bitacora';
import { filtroReportes } from '../../src/domain/autorizacion/alcance-reportes';
import { filtroTicketsParaAccion, type UsuarioAlcance } from '../../src/domain/autorizacion/alcance-tickets';
import { KnexBitacoraLecturaRepository } from '../../src/infrastructure/repositories/knex-bitacora-lectura-repository';
import { KnexReporteLecturaRepository } from '../../src/infrastructure/repositories/knex-reporte-lectura-repository';
import { KnexTicketLecturaRepository } from '../../src/infrastructure/repositories/knex-ticket-lectura-repository';
import { createTestKnex, reiniciarEsquema } from './knex-test';

// Fixture de SPEC 11: 2 dependencias (A y B), un usuario por rol y 4 tickets.
// | Ticket | Solicitante | Registrado por | Dependencia | Asignado a |
// | T1     | V1          | V1             | A           | TA         |
// | T2     | V1          | R              | B           | TB         |
// | T3     | V2          | R              | null        | null       |
// | T4     | V2          | V2             | A           | null       |
const NOMBRES_USUARIOS = ['V1', 'V2', 'R', 'TA', 'TB', 'CA', 'S', 'AD'] as const;
type NombreUsuario = (typeof NOMBRES_USUARIOS)[number];
type NombreTicket = 'T1' | 'T2' | 'T3' | 'T4';

const VE: Record<NombreUsuario, NombreTicket[]> = {
  V1: ['T1', 'T2'],
  V2: ['T3', 'T4'],
  R: ['T2', 'T3'],
  TA: ['T1'],
  TB: ['T2'],
  CA: ['T1', 'T4'],
  S: ['T1', 'T2', 'T3', 'T4'],
  AD: ['T1', 'T2', 'T3', 'T4'],
};

interface Fixture {
  usuarios: Record<NombreUsuario, UsuarioAlcance>;
  tickets: Record<NombreTicket, number>;
  nombreDeTicket: Map<number, NombreTicket>;
  dependencias: { A: number; B: number };
}

async function crearFixture(db: Knex): Promise<Fixture> {
  const [A, B] = (await db('dependencias').insert([{ nombre: 'A' }, { nombre: 'B' }]).returning('id')).map((f) =>
    Number(f.id),
  );
  const [categoria] = await db('categorias').insert({ nombre: 'Categoría A', dependencia_id: A }).returning('id');
  const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');

  const roles: { id: string; nombre: string; permisos: Permisos }[] = await db('roles').select('id', 'nombre', 'permisos');
  const rol = (nombre: string) => roles.find((r) => r.nombre === nombre)!;
  const definiciones: Record<NombreUsuario, { rol: string; dependenciaId: number | null }> = {
    V1: { rol: 'vecino', dependenciaId: null },
    V2: { rol: 'vecino', dependenciaId: null },
    R: { rol: 'receptor', dependenciaId: null },
    TA: { rol: 'tecnico', dependenciaId: A },
    TB: { rol: 'tecnico', dependenciaId: B },
    CA: { rol: 'coordinador', dependenciaId: A },
    S: { rol: 'supervisor', dependenciaId: null },
    AD: { rol: 'administrador', dependenciaId: null },
  };

  const usuarios = {} as Record<NombreUsuario, UsuarioAlcance>;
  for (const nombre of NOMBRES_USUARIOS) {
    const { rol: nombreRol, dependenciaId } = definiciones[nombre];
    const [fila] = await db('usuarios')
      .insert({
        nombre,
        email: `${nombre.toLowerCase()}@alcance.test`,
        rol_id: rol(nombreRol).id,
        dependencia_id: dependenciaId,
      })
      .returning('id');
    // Los permisos salen de roles.permisos, como en autenticar (SPEC 08).
    usuarios[nombre] = { id: Number(fila.id), dependenciaId, permisos: rol(nombreRol).permisos };
  }

  const u = (nombre: NombreUsuario) => usuarios[nombre].id;
  const filasTickets: [NombreTicket, NombreUsuario, NombreUsuario, number | null, NombreUsuario | null, string][] = [
    ['T1', 'V1', 'V1', A, 'TA', 'asignada'],
    ['T2', 'V1', 'R', B, 'TB', 'en_proceso'],
    ['T3', 'V2', 'R', null, null, 'en_revision'],
    ['T4', 'V2', 'V2', A, null, 'en_revision'],
  ];
  const tickets = {} as Record<NombreTicket, number>;
  const nombreDeTicket = new Map<number, NombreTicket>();
  for (const [i, [nombre, solicitante, registrador, dependenciaId, asignado, estado]] of filasTickets.entries()) {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-00000${i + 1}`,
        solicitante_id: u(solicitante),
        registrado_por: u(registrador),
        categoria_id: categoria.id,
        dependencia_id: dependenciaId,
        asignado_a: asignado === null ? null : u(asignado),
        estado,
        canal: 'portal',
        zona_id: zona.id,
        direccion: 'Calle principal',
        // T1 es el más antiguo: el listado sale T4, T3, T2, T1.
        creado_en: new Date(Date.UTC(2026, 9, 20 + i)),
      })
      .returning('id');
    tickets[nombre] = Number(fila.id);
    nombreDeTicket.set(Number(fila.id), nombre);
  }

  // Bitácora: 2 filas de A, 1 de B y 1 sin dependencia. Sin usuario_id, para poder borrar los usuarios al terminar.
  await db('bitacora').insert([
    { accion: 'asignar', entidad: 'ticket', entidad_id: String(tickets.T1), dependencia_id: A },
    { accion: 'clasificar', entidad: 'ticket', entidad_id: String(tickets.T4), dependencia_id: A },
    { accion: 'asignar', entidad: 'ticket', entidad_id: String(tickets.T2), dependencia_id: B },
    { accion: 'crear', entidad: 'usuario', entidad_id: String(usuarios.TA.id), dependencia_id: null },
  ]);

  return { usuarios, tickets, nombreDeTicket, dependencias: { A, B } };
}

describe('Repositorios de lectura con alcance (SPEC 11)', () => {
  let db: Knex;
  let f: Fixture;
  let consultas = 0;
  const contar = () => {
    consultas += 1;
  };

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();
    f = await crearFixture(db);
    db.on('query', contar);
  });

  afterAll(async () => {
    db.removeListener('query', contar);
    try {
      await reiniciarEsquema(db);
    } finally {
      await db.destroy();
    }
  });

  describe('tickets', () => {
    let repo: KnexTicketLecturaRepository;

    beforeAll(() => {
      repo = new KnexTicketLecturaRepository(db);
    });

    it.each(NOMBRES_USUARIOS)('%s ve exactamente sus tickets, del más nuevo al más viejo', async (nombre) => {
      const pagina = await repo.listar(filtroTicketsParaAccion(f.usuarios[nombre], 'tickets.ver'), 1, 20);

      const esperados = [...VE[nombre]].reverse();
      expect(pagina.datos.map((t) => f.nombreDeTicket.get(t.id))).toEqual(esperados);
      expect(pagina.total).toBe(esperados.length);
    });

    it('pagina y cuenta el total completo', async () => {
      const pagina = await repo.listar([], 2, 3);

      expect(pagina).toMatchObject({ pagina: 2, tamano: 3, total: 4 });
      expect(pagina.datos.map((t) => f.nombreDeTicket.get(t.id))).toEqual(['T1']);
    });

    it('obtener(T2) como TA devuelve null, igual que un id inexistente', async () => {
      const filtroTA = filtroTicketsParaAccion(f.usuarios.TA, 'tickets.ver');

      expect(await repo.obtener(f.tickets.T2, filtroTA)).toBeNull();
      expect(await repo.obtener(999999, filtroTA)).toBeNull();
      expect(await repo.obtener(f.tickets.T1, filtroTA)).toMatchObject({
        numero: 'Q-2026-000001',
        estado: 'asignada',
        solicitanteId: f.usuarios.V1.id,
        registradoPor: f.usuarios.V1.id,
        asignadoA: f.usuarios.TA.id,
        dependenciaId: f.dependencias.A,
      });
    });

    it('el coordinador no puede clasificar ni asignar un ticket de otra dependencia', async () => {
      for (const accion of ['tickets.clasificar', 'tickets.asignar'] as const) {
        const filtro = filtroTicketsParaAccion(f.usuarios.CA, accion);
        expect(await repo.obtener(f.tickets.T2, filtro)).toBeNull();
        expect(await repo.obtener(f.tickets.T4, filtro)).not.toBeNull();
      }
    });

    it('un filtro null no ejecuta ninguna consulta', async () => {
      const antes = consultas;
      const filtroNulo = filtroTicketsParaAccion(f.usuarios.AD, 'tickets.asignar');

      expect(filtroNulo).toBeNull();
      expect(await repo.listar(filtroNulo, 1, 20)).toEqual({ datos: [], pagina: 1, tamano: 20, total: 0 });
      expect(await repo.obtener(f.tickets.T1, filtroNulo)).toBeNull();
      expect(consultas).toBe(antes);
    });
  });

  describe('reportes', () => {
    let repo: KnexReporteLecturaRepository;
    const ceros = {
      nueva: 0,
      en_revision: 0,
      rechazada: 0,
      asignada: 0,
      en_proceso: 0,
      en_espera: 0,
      resuelta: 0,
      cerrada: 0,
    };

    beforeAll(() => {
      repo = new KnexReporteLecturaRepository(db);
    });

    it('el técnico cuenta solo sus tickets asignados', async () => {
      expect(await repo.contarPorEstado(filtroReportes(f.usuarios.TA))).toEqual({ ...ceros, asignada: 1 });
    });

    it('el coordinador cuenta solo su dependencia', async () => {
      expect(await repo.contarPorEstado(filtroReportes(f.usuarios.CA))).toEqual({ ...ceros, asignada: 1, en_revision: 1 });
    });

    it('el supervisor cuenta todos, con los 8 estados', async () => {
      const conteo = await repo.contarPorEstado(filtroReportes(f.usuarios.S));

      expect(conteo).toEqual({ ...ceros, asignada: 1, en_proceso: 1, en_revision: 2 });
      expect(Object.keys(conteo)).toHaveLength(8);
    });

    it('sin reportes.ver devuelve los 8 estados en 0 sin consultar la base', async () => {
      const antes = consultas;

      expect(await repo.contarPorEstado(filtroReportes(f.usuarios.V1))).toEqual(ceros);
      expect(consultas).toBe(antes);
    });
  });

  describe('bitácora', () => {
    let repo: KnexBitacoraLecturaRepository;

    beforeAll(() => {
      repo = new KnexBitacoraLecturaRepository(db);
    });

    it('el coordinador ve solo las 2 filas de su dependencia', async () => {
      const pagina = await repo.listar(filtroBitacora(f.usuarios.CA), 1, 20);

      expect(pagina.total).toBe(2);
      expect(pagina.datos.map((fila) => fila.dependenciaId)).toEqual([f.dependencias.A, f.dependencias.A]);
    });

    it.each(['S', 'AD'] as const)('%s ve las 4 filas, incluida la que no tiene dependencia', async (nombre) => {
      const pagina = await repo.listar(filtroBitacora(f.usuarios[nombre]), 1, 20);

      expect(pagina.total).toBe(4);
      expect(pagina.datos.filter((fila) => fila.dependenciaId === null)).toHaveLength(1);
    });

    it('el técnico, sin bitacora.ver, no ve nada y no consulta la base', async () => {
      const antes = consultas;

      expect(await repo.listar(filtroBitacora(f.usuarios.TA), 1, 20)).toEqual({ datos: [], pagina: 1, tamano: 20, total: 0 });
      expect(consultas).toBe(antes);
    });
  });
});
