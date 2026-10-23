import type { Knex } from 'knex';
import { createTestKnex, reiniciarEsquema } from './knex-test';

// Columnas esperadas por tabla, en orden, con su tipo en information_schema.
const expectedColumns: Record<string, [string, string][]> = {
  roles: [
    ['id', 'bigint'],
    ['nombre', 'text'],
    ['permisos', 'jsonb'],
  ],
  dependencias: [
    ['id', 'bigint'],
    ['nombre', 'text'],
    ['coordinador_id', 'bigint'],
    ['activa', 'boolean'],
  ],
  categorias: [
    ['id', 'bigint'],
    ['nombre', 'text'],
    ['dependencia_id', 'bigint'],
    ['campos_extra', 'jsonb'],
    ['activa', 'boolean'],
  ],
  politicas_sla: [
    ['id', 'bigint'],
    ['categoria_id', 'bigint'],
    ['prioridad', 'text'],
    ['horas_respuesta', 'integer'],
    ['horas_resolucion', 'integer'],
  ],
  zonas: [
    ['id', 'bigint'],
    ['nombre', 'text'],
    ['tipo', 'text'],
  ],
  calendario_laboral: [
    ['fecha', 'date'],
    ['es_habil', 'boolean'],
    ['descripcion', 'text'],
  ],
  usuarios: [
    ['id', 'bigint'],
    ['nombre', 'text'],
    ['email', 'text'],
    ['telefono', 'text'],
    ['dpi', 'text'],
    ['password_hash', 'text'],
    ['rol_id', 'bigint'],
    ['dependencia_id', 'bigint'],
    ['activo', 'boolean'],
    ['intentos_fallidos', 'integer'],
    ['bloqueado_hasta', 'timestamp with time zone'],
  ],
  sesiones: [
    ['id', 'bigint'],
    ['usuario_id', 'bigint'],
    ['token_hash', 'text'],
    ['expira_en', 'timestamp with time zone'],
    ['revocada_en', 'timestamp with time zone'],
    ['reemplazada_por', 'bigint'],
    ['creado_en', 'timestamp with time zone'],
  ],
  tickets: [
    ['id', 'bigint'],
    ['numero', 'text'],
    ['solicitante_id', 'bigint'],
    ['categoria_id', 'bigint'],
    ['dependencia_id', 'bigint'],
    ['asignado_a', 'bigint'],
    ['estado', 'USER-DEFINED'],
    ['prioridad', 'text'],
    ['canal', 'text'],
    ['zona_id', 'bigint'],
    ['direccion', 'text'],
    ['lat', 'numeric'],
    ['lng', 'numeric'],
    ['datos_extra', 'jsonb'],
    ['vence_respuesta', 'timestamp with time zone'],
    ['vence_resolucion', 'timestamp with time zone'],
    ['escalado', 'boolean'],
    ['creado_en', 'timestamp with time zone'],
    ['resuelto_en', 'timestamp with time zone'],
    ['cerrado_en', 'timestamp with time zone'],
  ],
  ticket_historial: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['estado_anterior', 'USER-DEFINED'],
    ['estado_nuevo', 'USER-DEFINED'],
    ['usuario_id', 'bigint'],
    ['motivo', 'text'],
    ['creado_en', 'timestamp with time zone'],
  ],
  comentarios: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['autor_id', 'bigint'],
    ['cuerpo', 'text'],
    ['es_interno', 'boolean'],
    ['creado_en', 'timestamp with time zone'],
  ],
  adjuntos: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['comentario_id', 'bigint'],
    ['nombre', 'text'],
    ['ruta', 'text'],
    ['tipo_mime', 'text'],
    ['tamano_bytes', 'integer'],
  ],
  encuestas: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['calificacion', 'smallint'],
    ['comentario', 'text'],
    ['creado_en', 'timestamp with time zone'],
  ],
  notificaciones: [
    ['id', 'bigint'],
    ['usuario_id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['tipo', 'text'],
    ['leida', 'boolean'],
    ['creado_en', 'timestamp with time zone'],
  ],
  bitacora: [
    ['id', 'bigint'],
    ['usuario_id', 'bigint'],
    ['accion', 'text'],
    ['entidad', 'text'],
    ['entidad_id', 'text'],
    ['detalle', 'jsonb'],
    ['ip', 'inet'],
    ['creado_en', 'timestamp with time zone'],
  ],
};

// Códigos SQLSTATE de Postgres.
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

describe('Esquema de base de datos', () => {
  let db: Knex;

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

  // Cada caso trabaja en una transacción que se revierte, así los datos no se cruzan entre pruebas.
  async function withRollback(fn: (trx: Knex.Transaction) => Promise<void>): Promise<void> {
    const trx = await db.transaction();
    try {
      await fn(trx);
    } finally {
      await trx.rollback();
    }
  }

  // pg devuelve los bigint como string.
  async function insertRol(trx: Knex.Transaction): Promise<string> {
    const [rol] = await trx('roles').insert({ nombre: 'rol_prueba' }).returning('id');
    return rol.id;
  }

  // Inserta un ticket válido con sus dependencias mínimas; `overrides` cambia columnas puntuales.
  async function insertTicket(trx: Knex.Transaction, overrides: Record<string, unknown> = {}): Promise<string> {
    const rolId = await insertRol(trx);
    const [solicitante] = await trx('usuarios').insert({ nombre: 'Vecino', telefono: '55550000', rol_id: rolId }).returning('id');
    const [dependencia] = await trx('dependencias').insert({ nombre: 'Dependencia prueba' }).returning('id');
    const [categoria] = await trx('categorias')
      .insert({ nombre: 'Categoría prueba', dependencia_id: dependencia.id })
      .returning('id');
    const [zona] = await trx('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    const [ticket] = await trx('tickets')
      .insert({
        numero: 'Q-2026-000001',
        solicitante_id: solicitante.id,
        categoria_id: categoria.id,
        canal: 'portal',
        zona_id: zona.id,
        direccion: 'Calle principal',
        ...overrides,
      })
      .returning('id');
    return ticket.id;
  }

  it.each(Object.keys(expectedColumns))('la tabla %s tiene sus columnas', async (table) => {
    const rows: { column_name: string; data_type: string }[] = await db('information_schema.columns')
      .select('column_name', 'data_type')
      .where({ table_schema: 'public', table_name: table })
      .orderBy('ordinal_position');

    expect(rows.map((row) => [row.column_name, row.data_type])).toEqual(expectedColumns[table]);
  });

  describe('usuarios', () => {
    it('rechaza un usuario sin email ni teléfono', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        await expect(trx('usuarios').insert({ nombre: 'Sin contacto', rol_id: rolId })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));

    it('el email es único sin distinguir mayúsculas', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        await trx('usuarios').insert({ nombre: 'Ana', email: 'Ana@x.gt', rol_id: rolId });
        await expect(trx('usuarios').insert({ nombre: 'Ana bis', email: 'ana@x.gt', rol_id: rolId })).rejects.toMatchObject({
          code: UNIQUE_VIOLATION,
        });
      }));

    it('no permite borrar una dependencia con categorías (RESTRICT)', () =>
      withRollback(async (trx) => {
        const [dependencia] = await trx('dependencias').insert({ nombre: 'Dependencia prueba' }).returning('id');
        await trx('categorias').insert({ nombre: 'Categoría prueba', dependencia_id: dependencia.id });
        await expect(trx('dependencias').where({ id: dependencia.id }).delete()).rejects.toMatchObject({
          code: FOREIGN_KEY_VIOLATION,
        });
      }));
  });

  describe('autenticación', () => {
    it('rechaza intentos_fallidos negativo', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        await expect(
          trx('usuarios').insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId, intentos_fallidos: -1 }),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('un usuario nuevo empieza sin intentos fallidos ni bloqueo', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        const [usuario] = await trx('usuarios')
          .insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId })
          .returning(['intentos_fallidos', 'bloqueado_hasta']);
        expect(usuario).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
      }));

    it('dos sesiones no pueden tener el mismo token_hash', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        const [usuario] = await trx('usuarios').insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId }).returning('id');
        const sesion = { usuario_id: usuario.id, token_hash: 'a'.repeat(64), expira_en: '2026-10-29T00:00:00Z' };
        await trx('sesiones').insert(sesion);
        await expect(trx('sesiones').insert(sesion)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      }));
  });

  describe('tickets', () => {
    it('el enum estado_ticket tiene los 8 estados en orden', async () => {
      const result = await db.raw('SELECT unnest(enum_range(NULL::estado_ticket))::text AS estado');
      expect(result.rows.map((row: { estado: string }) => row.estado)).toEqual([
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

    it('rechaza un numero que no cumple Q-AAAA-NNNNNN', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { numero: 'Q-26-1' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('acepta un numero con formato Q-AAAA-NNNNNN', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { numero: 'Q-2026-000123' })).resolves.toEqual(expect.any(String));
      }));

    it('rechaza una prioridad fuera de la lista', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { prioridad: 'critica' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('rechaza un canal fuera de la lista', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { canal: 'whatsapp' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));
  });

  describe('hijos del ticket', () => {
    it('rechaza una calificación fuera de 1 a 5', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        await expect(trx('encuestas').insert({ ticket_id: ticketId, calificacion: 6 })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));

    it('permite una sola encuesta por ticket', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        await trx('encuestas').insert({ ticket_id: ticketId, calificacion: 5 });
        await expect(trx('encuestas').insert({ ticket_id: ticketId, calificacion: 4 })).rejects.toMatchObject({
          code: UNIQUE_VIOLATION,
        });
      }));

    it('no permite borrar un ticket con comentarios (RESTRICT)', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        const { solicitante_id: autorId } = await trx('tickets').where({ id: ticketId }).first('solicitante_id');
        await trx('comentarios').insert({ ticket_id: ticketId, autor_id: autorId, cuerpo: 'Comentario de prueba' });
        await expect(trx('tickets').where({ id: ticketId }).delete()).rejects.toMatchObject({
          code: FOREIGN_KEY_VIOLATION,
        });
      }));
  });

  describe('bitacora', () => {
    const SOLO_INSERCION = 'bitacora es solo de inserción';

    async function insertBitacora(trx: Knex.Transaction): Promise<string> {
      const [fila] = await trx('bitacora')
        .insert({ accion: 'crear', entidad: 'calendario_laboral', entidad_id: '2026-12-25', ip: '127.0.0.1' })
        .returning('id');
      return fila.id;
    }

    it('permite INSERT', () =>
      withRollback(async (trx) => {
        await insertBitacora(trx);
        expect(await trx('bitacora').count({ total: '*' })).toEqual([{ total: '1' }]);
      }));

    it('rechaza UPDATE', () =>
      withRollback(async (trx) => {
        const id = await insertBitacora(trx);
        await expect(trx('bitacora').where({ id }).update({ accion: 'editar' })).rejects.toThrow(SOLO_INSERCION);
      }));

    it('rechaza DELETE', () =>
      withRollback(async (trx) => {
        const id = await insertBitacora(trx);
        await expect(trx('bitacora').where({ id }).delete()).rejects.toThrow(SOLO_INSERCION);
      }));

    it('rechaza TRUNCATE', () =>
      withRollback(async (trx) => {
        await insertBitacora(trx);
        await expect(trx.raw('TRUNCATE bitacora')).rejects.toThrow(SOLO_INSERCION);
      }));
  });

  describe('migración 0006_roles', () => {
    // Matriz de SPEC 08, escrita aparte de la migración para que la prueba no la copie.
    const MATRIZ: Record<string, Record<string, string>> = {
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
        'bitacora.ver': 'todas',
      },
    };

    async function permisosPorRol(): Promise<Record<string, unknown>> {
      const roles: { nombre: string; permisos: unknown }[] = await db('roles').select('nombre', 'permisos').orderBy('id');
      return Object.fromEntries(roles.map((rol) => [rol.nombre, rol.permisos]));
    }

    it('deja exactamente los 6 roles con la matriz de permisos', async () => {
      expect(await permisosPorRol()).toEqual(MATRIZ);
      expect(Object.keys(await permisosPorRol())).toEqual([
        'vecino',
        'receptor',
        'tecnico',
        'coordinador',
        'supervisor',
        'administrador',
      ]);
    });

    it('carga la matriz en roles que ya existían con permisos vacíos, sin duplicarlos', async () => {
      await db.migrate.down();
      await db('roles').insert(Object.keys(MATRIZ).map((nombre) => ({ nombre, permisos: {} })));
      await db.migrate.latest();

      expect(await permisosPorRol()).toEqual(MATRIZ);
    });

    it('el down falla si un usuario tiene uno de esos roles', async () => {
      const { id: rolId } = await db('roles').where({ nombre: 'vecino' }).first('id');
      const [usuario] = await db('usuarios').insert({ nombre: 'Vecino', telefono: '55550000', rol_id: rolId }).returning('id');
      try {
        await expect(db.migrate.down()).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
        expect(await permisosPorRol()).toEqual(MATRIZ);
      } finally {
        await db('usuarios').where({ id: usuario.id }).delete();
      }
    });

    it('seed.run() termina sin error con la carpeta seeds/ vacía', async () => {
      await expect(db.seed.run()).resolves.toEqual([[]]);
    });
  });

  // Debe ser el último caso: deja la base sin esquema.
  describe('rollback completo', () => {
    it('no deja ninguna tabla, ni el enum, ni la función de la bitácora', async () => {
      await db.migrate.rollback(undefined, true);

      const tables = await db('information_schema.tables')
        .select('table_name')
        .where({ table_schema: 'public' })
        .whereIn('table_name', Object.keys(expectedColumns));
      expect(tables).toEqual([]);
      expect(Object.keys(expectedColumns)).toHaveLength(15);

      const tipos = await db('pg_type').select('typname').where({ typname: 'estado_ticket' });
      expect(tipos).toEqual([]);

      const funciones = await db('pg_proc').select('proname').where({ proname: 'bitacora_solo_insercion' });
      expect(funciones).toEqual([]);
    });
  });
});
