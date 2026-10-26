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
    ['actualizado_en', 'timestamp with time zone'],
    ['actualizado_por', 'bigint'],
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
    ['correo_verificado_en', 'timestamp with time zone'],
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
    ['registrado_por', 'bigint'],
    ['titulo', 'text'],
    ['descripcion', 'text'],
    ['resolucion', 'text'],
    ['resuelto_por', 'bigint'],
    ['confirmacion_vence_en', 'timestamp with time zone'],
    ['reaperturas', 'integer'],
    ['primera_respuesta_en', 'timestamp with time zone'],
    ['sla_inicio_resolucion', 'timestamp with time zone'],
    ['sla_pausa_minutos', 'integer'],
    ['sla_pausado_desde', 'timestamp with time zone'],
    ['sla_restante_minutos', 'integer'],
    ['alerta_respuesta_en', 'timestamp with time zone'],
    ['alerta_resolucion_en', 'timestamp with time zone'],
    ['alerta_respuesta_enviada_en', 'timestamp with time zone'],
    ['alerta_resolucion_enviada_en', 'timestamp with time zone'],
    ['escalado_en', 'timestamp with time zone'],
    ['escalado_por', 'text'],
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
  ticket_asignaciones: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['tecnico_anterior', 'bigint'],
    ['tecnico_nuevo', 'bigint'],
    ['asignado_por', 'bigint'],
    ['motivo', 'text'],
    ['creado_en', 'timestamp with time zone'],
  ],
  solicitudes_traslado: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['solicitado_por', 'bigint'],
    ['dependencia_origen_id', 'bigint'],
    ['dependencia_sugerida_id', 'bigint'],
    ['motivo', 'text'],
    ['estado', 'text'],
    ['resuelto_por', 'bigint'],
    ['motivo_resolucion', 'text'],
    ['creado_en', 'timestamp with time zone'],
    ['resuelto_en', 'timestamp with time zone'],
  ],
  comentarios: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['autor_id', 'bigint'],
    ['cuerpo', 'text'],
    ['es_interno', 'boolean'],
    ['creado_en', 'timestamp with time zone'],
    ['editado_en', 'timestamp with time zone'],
  ],
  adjuntos: [
    ['id', 'bigint'],
    ['ticket_id', 'bigint'],
    ['comentario_id', 'bigint'],
    ['nombre', 'text'],
    ['ruta', 'text'],
    ['tipo_mime', 'text'],
    ['tamano_bytes', 'integer'],
    ['subido_por', 'bigint'],
    ['creado_en', 'timestamp with time zone'],
    ['interno', 'boolean'],
    ['origen', 'text'],
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
    ['datos', 'jsonb'],
  ],
  correos_salientes: [
    ['id', 'bigint'],
    ['plantilla_clave', 'text'],
    ['para', 'text'],
    ['asunto', 'text'],
    ['texto', 'text'],
    ['html', 'text'],
    ['ticket_id', 'bigint'],
    ['usuario_id', 'bigint'],
    ['estado', 'text'],
    ['intentos', 'integer'],
    ['proximo_intento_en', 'timestamp with time zone'],
    ['expira_en', 'timestamp with time zone'],
    ['ultimo_error', 'text'],
    ['creado_en', 'timestamp with time zone'],
    ['terminado_en', 'timestamp with time zone'],
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
    ['dependencia_id', 'bigint'],
  ],
  parametros: [
    ['clave', 'text'],
    ['valor', 'jsonb'],
    ['actualizado_en', 'timestamp with time zone'],
  ],
  correlativos: [
    ['anio', 'smallint'],
    ['ultimo', 'integer'],
  ],
  plantillas_notificacion: [
    ['id', 'bigint'],
    ['clave', 'text'],
    ['asunto', 'text'],
    ['cuerpo_texto', 'text'],
    ['cuerpo_html', 'text'],
    ['actualizado_en', 'timestamp with time zone'],
  ],
  restablecimientos: [
    ['id', 'bigint'],
    ['usuario_id', 'bigint'],
    ['token_hash', 'text'],
    ['expira_en', 'timestamp with time zone'],
    ['usado_en', 'timestamp with time zone'],
    ['invalidado_en', 'timestamp with time zone'],
    ['creado_en', 'timestamp with time zone'],
    ['tipo', 'text'],
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
        titulo: 'Bache en la calle',
        descripcion: 'Hay un bache profundo frente a la escuela',
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

  describe('plantillas_notificacion', () => {
    const plantilla = { asunto: 'Asunto', cuerpo_texto: 'Texto', cuerpo_html: '<p>Html</p>' };

    it('la migración carga recuperacion_password y password_cambiado', async () => {
      const filas: { clave: string; asunto: string }[] = await db('plantillas_notificacion')
        .select('clave', 'asunto')
        .whereIn('clave', ['recuperacion_password', 'password_cambiado'])
        .orderBy('id');

      expect(filas).toEqual([
        { clave: 'recuperacion_password', asunto: 'VozMuni: restablece tu contraseña' },
        { clave: 'password_cambiado', asunto: 'VozMuni: tu contraseña fue cambiada' },
      ]);
    });

    it('la migración 0010 carga invitacion_usuario y cuenta_desactivada', async () => {
      const filas: { clave: string; asunto: string }[] = await db('plantillas_notificacion')
        .select('clave', 'asunto')
        .whereIn('clave', ['invitacion_usuario', 'cuenta_desactivada'])
        .orderBy('id');

      expect(filas).toEqual([
        { clave: 'invitacion_usuario', asunto: 'VozMuni: activa tu cuenta' },
        { clave: 'cuenta_desactivada', asunto: 'VozMuni: tu cuenta fue desactivada' },
      ]);
    });

    it('rechaza una clave con mayúsculas', () =>
      withRollback(async (trx) => {
        await expect(trx('plantillas_notificacion').insert({ clave: 'Bienvenida', ...plantilla })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));

    it('una clave repetida viola UNIQUE', () =>
      withRollback(async (trx) => {
        await expect(
          trx('plantillas_notificacion').insert({ clave: 'recuperacion_password', ...plantilla }),
        ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      }));
  });

  describe('parametros', () => {
    it('la migración no carga limites_municipio', async () => {
      expect(await db('parametros').where({ clave: 'limites_municipio' }).select('clave')).toEqual([]);
    });

    it('rechaza una clave con mayúsculas', () =>
      withRollback(async (trx) => {
        await expect(trx('parametros').insert({ clave: 'LimitesMunicipio', valor: {} })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));
  });

  describe('correlativos', () => {
    it('rechaza ultimo = 1000000', () =>
      withRollback(async (trx) => {
        await expect(trx('correlativos').insert({ anio: 2026, ultimo: 1_000_000 })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));

    it('acepta ultimo = 999999 y un solo registro por año', () =>
      withRollback(async (trx) => {
        await trx('correlativos').insert({ anio: 2026, ultimo: 999_999 });
        await expect(trx('correlativos').insert({ anio: 2026, ultimo: 1 })).rejects.toMatchObject({
          code: UNIQUE_VIOLATION,
        });
      }));

    it('existe la plantilla queja_registrada', async () => {
      expect(await db('plantillas_notificacion').where({ clave: 'queja_registrada' }).first('asunto')).toEqual({
        asunto: 'VozMuni: recibimos tu queja {{numero}}',
      });
    });

    it('existe invitacion_vecino y desaparece al revertir solo 0013', async () => {
      const plantilla = () => db('plantillas_notificacion').where({ clave: 'invitacion_vecino' }).first('asunto');
      expect(await plantilla()).toEqual({ asunto: 'VozMuni: sigue tus quejas en el portal' });

      await db.migrate.down({ name: '0013_invitacion_vecino.js' });
      try {
        expect(await plantilla()).toBeUndefined();
      } finally {
        await db.migrate.latest();
      }
      expect(await plantilla()).toBeDefined();
    });
  });

  describe('restablecimientos', () => {
    it('dos filas no pueden tener el mismo token_hash', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        const [usuario] = await trx('usuarios').insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId }).returning('id');
        const fila = { usuario_id: usuario.id, token_hash: 'b'.repeat(64), expira_en: '2026-10-23T00:30:00Z' };
        await trx('restablecimientos').insert(fila);
        await expect(trx('restablecimientos').insert(fila)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      }));

    it('tipo vale recuperacion por defecto y rechaza otros valores', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        const [usuario] = await trx('usuarios').insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId }).returning('id');
        const [fila] = await trx('restablecimientos')
          .insert({ usuario_id: usuario.id, token_hash: 'c'.repeat(64), expira_en: '2026-10-23T00:30:00Z' })
          .returning('tipo');
        expect(fila.tipo).toBe('recuperacion');
        await expect(
          trx('restablecimientos').insert({
            usuario_id: usuario.id,
            token_hash: 'd'.repeat(64),
            expira_en: '2026-10-23T00:30:00Z',
            tipo: 'otro',
          }),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('revertir 0010 quita tipo y las 2 plantillas, y latest() las vuelve a crear', async () => {
      // 0015 redefine el CHECK de tipo: se revierte antes que 0010 para no dejar el CHECK viejo al reaplicar.
      await db.migrate.down({ name: '0015_verificacion_correo.js' });
      await db.migrate.down({ name: '0010_invitaciones.js' });
      try {
        const columnas = await db('information_schema.columns')
          .where({ table_schema: 'public', table_name: 'restablecimientos', column_name: 'tipo' })
          .select('column_name');
        expect(columnas).toEqual([]);
        expect(
          await db('plantillas_notificacion').whereIn('clave', ['invitacion_usuario', 'cuenta_desactivada']).select('clave'),
        ).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
      expect(await db('plantillas_notificacion').count({ total: '*' })).toEqual([{ total: '15' }]);
    });
  });

  describe('verificación de correo (0015)', () => {
    const CLAVES_0015 = ['verificacion_correo', 'cuenta_existente', 'registro_no_completado'];

    async function checkTipo(): Promise<string> {
      const fila: { def: string } = await db('pg_constraint')
        .where({ conname: 'restablecimientos_tipo_check' })
        .first(db.raw('pg_get_constraintdef(oid) AS def'));
      return fila.def;
    }

    it('un usuario nuevo empieza sin correo verificado', () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        const [usuario] = await trx('usuarios')
          .insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId })
          .returning('correo_verificado_en');
        expect(usuario.correo_verificado_en).toBeNull();
      }));

    it("tipo acepta 'verificacion' y rechaza 'otro'", () =>
      withRollback(async (trx) => {
        const rolId = await insertRol(trx);
        const [usuario] = await trx('usuarios').insert({ nombre: 'Ana', email: 'ana@x.gt', rol_id: rolId }).returning('id');
        const base = { usuario_id: usuario.id, expira_en: '2026-10-24T00:00:00Z' };
        await trx('restablecimientos').insert({ ...base, token_hash: 'e'.repeat(64), tipo: 'verificacion' });
        await expect(
          trx('restablecimientos').insert({ ...base, token_hash: 'f'.repeat(64), tipo: 'otro' }),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('existen las 3 plantillas de la verificación', async () => {
      const filas: { clave: string }[] = await db('plantillas_notificacion').whereIn('clave', CLAVES_0015).select('clave');
      expect(filas.map((fila) => fila.clave).sort()).toEqual([...CLAVES_0015].sort());
    });

    it('marca como verificados a los usuarios con contraseña creados antes de la migración', async () => {
      await db.migrate.down({ name: '0015_verificacion_correo.js' });
      try {
        const [rol] = await db('roles').where({ nombre: 'vecino' }).select('id');
        await db('usuarios').insert([
          { nombre: 'Con contraseña', email: 'previo-con@x.gt', password_hash: 'hash', rol_id: rol.id },
          { nombre: 'Sin contraseña', email: 'previo-sin@x.gt', rol_id: rol.id },
        ]);
      } finally {
        await db.migrate.latest();
      }
      try {
        const filas: { email: string; verificado: boolean }[] = await db('usuarios')
          .whereIn('email', ['previo-con@x.gt', 'previo-sin@x.gt'])
          .orderBy('email')
          .select('email', db.raw('correo_verificado_en IS NOT NULL AS verificado'));
        expect(filas).toEqual([
          { email: 'previo-con@x.gt', verificado: true },
          { email: 'previo-sin@x.gt', verificado: false },
        ]);
      } finally {
        await db('usuarios').whereIn('email', ['previo-con@x.gt', 'previo-sin@x.gt']).delete();
      }
    });

    it('revertir 0015 restaura el CHECK anterior y quita la columna y las plantillas', async () => {
      expect(await checkTipo()).toContain('verificacion');
      await db.migrate.down({ name: '0015_verificacion_correo.js' });
      try {
        expect(await checkTipo()).not.toContain('verificacion');
        expect(await checkTipo()).toContain('invitacion');
        const columnas = await db('information_schema.columns')
          .where({ table_schema: 'public', table_name: 'usuarios', column_name: 'correo_verificado_en' })
          .select('column_name');
        expect(columnas).toEqual([]);
        expect(await db('plantillas_notificacion').whereIn('clave', CLAVES_0015).select('clave')).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
      expect(await checkTipo()).toContain('verificacion');
    });
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

    it('rechaza un titulo de 4 caracteres', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { titulo: 'Hoyo' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('rechaza una descripcion de 4001 caracteres', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { descripcion: 'x'.repeat(4001) })).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('acepta título y descripción en sus límites (150 y 4000)', () =>
      withRollback(async (trx) => {
        await expect(
          insertTicket(trx, { titulo: 't'.repeat(150), descripcion: 'd'.repeat(4000) }),
        ).resolves.toEqual(expect.any(String));
      }));

    it('lat y lng van juntas o ninguna (tickets_ubicacion_completa)', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { lat: 14.6 })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'tickets_ubicacion_completa',
        });
      }));

    it('acepta un ticket con ambas coordenadas', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { lat: 14.6, lng: -90.5 })).resolves.toEqual(expect.any(String));
      }));

    it('rechaza un canal fuera de la lista', () =>
      withRollback(async (trx) => {
        await expect(insertTicket(trx, { canal: 'whatsapp' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));
  });

  describe('resolución (0021)', () => {
    it('las columnas son NULL por defecto y resuelto_por referencia a usuarios', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        const fila = await trx('tickets').where({ id: ticketId }).first('resolucion', 'resuelto_por');
        expect(fila).toEqual({ resolucion: null, resuelto_por: null });
        await expect(trx('tickets').where({ id: ticketId }).update({ resuelto_por: 999999999 })).rejects.toMatchObject({
          code: FOREIGN_KEY_VIOLATION,
        });
      }));

    it('rellena las quejas resueltas o cerradas con su última entrada a resuelta', async () => {
      await db.migrate.down({ name: '0021_resolucion.js' });
      const ids: Record<string, string> = {};
      try {
        const [rol] = await db('roles').where({ nombre: 'tecnico' }).select('id');
        const [vecino] = await db('usuarios').insert({ nombre: 'Vecino 0021', telefono: '55550021', rol_id: rol.id }).returning('id');
        const [primero] = await db('usuarios').insert({ nombre: 'Técnico A', email: 'a-0021@x.gt', rol_id: rol.id }).returning('id');
        const [segundo] = await db('usuarios').insert({ nombre: 'Técnico B', email: 'b-0021@x.gt', rol_id: rol.id }).returning('id');
        Object.assign(ids, { vecino: vecino.id, primero: primero.id, segundo: segundo.id });
        const [dependencia] = await db('dependencias').insert({ nombre: 'Dependencia 0021' }).returning('id');
        const [categoria] = await db('categorias').insert({ nombre: 'Categoría 0021', dependencia_id: dependencia.id }).returning('id');
        const [zona] = await db('zonas').insert({ nombre: 'Zona 0021', tipo: 'zona' }).returning('id');
        Object.assign(ids, { dependencia: dependencia.id, categoria: categoria.id, zona: zona.id });
        const ticket = async (numero: string, estado: string) => {
          const [fila] = await db('tickets')
            .insert({
              numero,
              solicitante_id: vecino.id,
              categoria_id: categoria.id,
              canal: 'portal',
              zona_id: zona.id,
              direccion: 'Calle principal',
              titulo: 'Bache en la calle',
              descripcion: 'Hay un bache profundo frente a la escuela',
              estado,
            })
            .returning('id');
          return fila.id as string;
        };
        ids.resuelta = await ticket('Q-2026-000921', 'resuelta');
        ids.cerrada = await ticket('Q-2026-000922', 'cerrada');
        ids.reabierta = await ticket('Q-2026-000923', 'en_proceso');
        const aResuelta = (ticketId: string, usuarioId: string, motivo: string, creadoEn: string) =>
          db('ticket_historial').insert({
            ticket_id: ticketId,
            estado_anterior: 'en_proceso',
            estado_nuevo: 'resuelta',
            usuario_id: usuarioId,
            motivo,
            creado_en: creadoEn,
          });
        await aResuelta(ids.resuelta, primero.id, 'Primera solución', '2026-10-01T10:00:00Z');
        await aResuelta(ids.resuelta, segundo.id, 'Se rellenó el bache', '2026-10-02T10:00:00Z');
        await aResuelta(ids.cerrada, primero.id, 'Se cambió la lámpara', '2026-10-03T10:00:00Z');
        await aResuelta(ids.reabierta, primero.id, 'Solución rechazada', '2026-10-04T10:00:00Z');
      } finally {
        await db.migrate.latest();
      }
      try {
        const filas: { id: string; resolucion: string | null; resuelto_por: string | null }[] = await db('tickets')
          .whereIn('id', [ids.resuelta, ids.cerrada, ids.reabierta])
          .orderBy('id')
          .select('id', 'resolucion', 'resuelto_por');
        expect(filas).toEqual([
          { id: ids.resuelta, resolucion: 'Se rellenó el bache', resuelto_por: ids.segundo },
          { id: ids.cerrada, resolucion: 'Se cambió la lámpara', resuelto_por: ids.primero },
          { id: ids.reabierta, resolucion: null, resuelto_por: null },
        ]);
      } finally {
        const tickets = [ids.resuelta, ids.cerrada, ids.reabierta].filter(Boolean);
        await db('ticket_historial').whereIn('ticket_id', tickets).delete();
        await db('tickets').whereIn('id', tickets).delete();
        await db('categorias').where({ id: ids.categoria }).delete();
        await db('dependencias').where({ id: ids.dependencia }).delete();
        await db('zonas').where({ id: ids.zona }).delete();
        await db('usuarios').whereIn('id', [ids.vecino, ids.primero, ids.segundo].filter(Boolean)).delete();
      }
    });

    it('revertir 0021 quita las dos columnas', async () => {
      await db.migrate.down({ name: '0021_resolucion.js' });
      try {
        const columnas = await db('information_schema.columns')
          .where({ table_schema: 'public', table_name: 'tickets' })
          .whereIn('column_name', ['resolucion', 'resuelto_por'])
          .select('column_name');
        expect(columnas).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('confirmación (0022)', () => {
    it('confirmacion_vence_en es NULL, reaperturas vale 0 por defecto y rechaza negativos', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        expect(await trx('tickets').where({ id: ticketId }).first('confirmacion_vence_en', 'reaperturas')).toEqual({
          confirmacion_vence_en: null,
          reaperturas: 0,
        });
        await expect(trx('tickets').where({ id: ticketId }).update({ reaperturas: -1 })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));

    it('carga los parámetros plazo_confirmacion_dias_habiles = 5 y max_reaperturas = 2', async () => {
      const filas: { clave: string; valor: unknown }[] = await db('parametros')
        .whereIn('clave', ['plazo_confirmacion_dias_habiles', 'max_reaperturas'])
        .orderBy('clave')
        .select('clave', 'valor');
      expect(filas).toEqual([
        { clave: 'max_reaperturas', valor: 2 },
        { clave: 'plazo_confirmacion_dias_habiles', valor: 5 },
      ]);
    });

    it('carga las plantillas queja_cerrada y queja_reabierta', async () => {
      const filas: { clave: string; asunto: string }[] = await db('plantillas_notificacion')
        .whereIn('clave', ['queja_cerrada', 'queja_reabierta'])
        .orderBy('clave')
        .select('clave', 'asunto');
      expect(filas).toEqual([
        { clave: 'queja_cerrada', asunto: 'VozMuni: tu queja {{numero}} fue cerrada' },
        { clave: 'queja_reabierta', asunto: 'VozMuni: reabrimos tu queja {{numero}}' },
      ]);
    });

    it('rellena el vencimiento y las reaperturas de las quejas resueltas antes de la migración', async () => {
      // 0028 tiene un índice parcial sobre confirmacion_vence_en: Postgres lo borraría con la columna.
      await db.migrate.down({ name: '0028_cierre_automatico.js' });
      await db.migrate.down({ name: '0022_confirmacion.js' });
      const ids: Record<string, string> = {};
      // Noviembre de 2026 con fines de semana no hábiles y el 4 de asueto.
      const calendario = Array.from({ length: 30 }, (_, i) => {
        const fecha = `2026-11-${String(i + 1).padStart(2, '0')}`;
        const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
        return { fecha, es_habil: dia !== 0 && dia !== 6 && fecha !== '2026-11-04' };
      });
      try {
        await db('calendario_laboral').insert(calendario);
        const [rol] = await db('roles').where({ nombre: 'tecnico' }).select('id');
        const [vecino] = await db('usuarios').insert({ nombre: 'Vecino 0022', telefono: '55550022', rol_id: rol.id }).returning('id');
        const [dependencia] = await db('dependencias').insert({ nombre: 'Dependencia 0022' }).returning('id');
        const [categoria] = await db('categorias').insert({ nombre: 'Categoría 0022', dependencia_id: dependencia.id }).returning('id');
        const [zona] = await db('zonas').insert({ nombre: 'Zona 0022', tipo: 'zona' }).returning('id');
        Object.assign(ids, { vecino: vecino.id, dependencia: dependencia.id, categoria: categoria.id, zona: zona.id });
        const ticket = async (numero: string, estado: string, resueltoEn: string | null) => {
          const [fila] = await db('tickets')
            .insert({
              numero,
              solicitante_id: vecino.id,
              categoria_id: categoria.id,
              canal: 'portal',
              zona_id: zona.id,
              direccion: 'Calle principal',
              titulo: 'Bache en la calle',
              descripcion: 'Hay un bache profundo frente a la escuela',
              estado,
              resuelto_en: resueltoEn,
            })
            .returning('id');
          return fila.id as string;
        };
        // Lunes 2 a las 23:30 en Guatemala: cuenta desde el lunes; con el 4 de asueto vence el martes 10.
        ids.resuelta = await ticket('Q-2026-000931', 'resuelta', '2026-11-03T05:30:00Z');
        ids.cerrada = await ticket('Q-2026-000932', 'cerrada', '2026-11-02T15:00:00Z');
        ids.sinCalendario = await ticket('Q-2026-000933', 'resuelta', '2026-11-25T15:00:00Z');
        ids.enProceso = await ticket('Q-2026-000934', 'en_proceso', null);
        const reapertura = (ticketId: string) =>
          db('ticket_historial').insert({ ticket_id: ticketId, estado_anterior: 'resuelta', estado_nuevo: 'en_proceso' });
        await reapertura(ids.resuelta);
        await reapertura(ids.enProceso);
        await reapertura(ids.enProceso);
      } finally {
        await db.migrate.latest();
      }
      try {
        const filas: { id: string; confirmacion_vence_en: Date | null; reaperturas: number }[] = await db('tickets')
          .whereIn('id', [ids.resuelta, ids.cerrada, ids.sinCalendario, ids.enProceso])
          .orderBy('id')
          .select('id', 'confirmacion_vence_en', 'reaperturas');
        expect(filas.map((f) => [f.id, f.confirmacion_vence_en?.toISOString() ?? null, f.reaperturas])).toEqual([
          [ids.resuelta, '2026-11-11T05:59:59.999Z', 1],
          [ids.cerrada, '2026-11-11T05:59:59.999Z', 0],
          [ids.sinCalendario, null, 0],
          [ids.enProceso, null, 2],
        ]);
      } finally {
        const tickets = [ids.resuelta, ids.cerrada, ids.sinCalendario, ids.enProceso].filter(Boolean);
        await db('ticket_historial').whereIn('ticket_id', tickets).delete();
        await db('tickets').whereIn('id', tickets).delete();
        await db('categorias').where({ id: ids.categoria }).delete();
        await db('dependencias').where({ id: ids.dependencia }).delete();
        await db('zonas').where({ id: ids.zona }).delete();
        await db('usuarios').where({ id: ids.vecino }).delete();
        await db('calendario_laboral').whereIn('fecha', calendario.map((d) => d.fecha)).delete();
      }
    });

    it('revertir 0022 quita las columnas, los parámetros y las plantillas', async () => {
      // 0028 tiene un índice parcial sobre confirmacion_vence_en: Postgres lo borraría con la columna.
      await db.migrate.down({ name: '0028_cierre_automatico.js' });
      await db.migrate.down({ name: '0022_confirmacion.js' });
      try {
        const columnas = await db('information_schema.columns')
          .where({ table_schema: 'public', table_name: 'tickets' })
          .whereIn('column_name', ['confirmacion_vence_en', 'reaperturas'])
          .select('column_name');
        expect(columnas).toEqual([]);
        expect(await db('parametros').whereIn('clave', ['plazo_confirmacion_dias_habiles', 'max_reaperturas'])).toEqual([]);
        expect(await db('plantillas_notificacion').whereIn('clave', ['queja_cerrada', 'queja_reabierta'])).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('adjuntos (0020)', () => {
    async function insertAdjunto(trx: Knex.Transaction, cambios: Record<string, unknown> = {}) {
      const ticketId = await insertTicket(trx);
      const { solicitante_id: autorId } = await trx('tickets').where({ id: ticketId }).first('solicitante_id');
      return trx('adjuntos')
        .insert({
          ticket_id: ticketId,
          nombre: 'foto.jpg',
          ruta: 'ab/ab000000-0000-4000-8000-000000000000',
          tipo_mime: 'image/jpeg',
          tamano_bytes: 1024,
          subido_por: autorId,
          origen: 'registro',
          ...cambios,
        })
        .returning(['id', 'ticket_id', 'subido_por', 'creado_en', 'interno']);
    }

    it('acepta un adjunto de registro público con creado_en e interno por defecto', () =>
      withRollback(async (trx) => {
        const [fila] = await insertAdjunto(trx);
        expect(fila.interno).toBe(false);
        expect(fila.creado_en).toBeInstanceOf(Date);
      }));

    it.each([
      ['un adjunto de registro interno', { interno: true }],
      ['10485761 bytes', { tamano_bytes: 10485761 }],
      ['un origen desconocido', { origen: 'vecino' }],
      ['un nombre vacío', { nombre: '' }],
      ['un nombre de 256 caracteres', { nombre: 'a'.repeat(256) }],
    ])('rechaza %s', (_caso, cambios) =>
      withRollback(async (trx) => {
        await expect(insertAdjunto(trx, cambios)).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }),
    );

    it('acepta 10485760 bytes y una evidencia interna de atención', () =>
      withRollback(async (trx) => {
        await insertAdjunto(trx, { tamano_bytes: 10485760, origen: 'atencion', interno: true });
      }));

    it('una ruta repetida viola UNIQUE', () =>
      withRollback(async (trx) => {
        const [fila] = await insertAdjunto(trx);
        await expect(
          trx('adjuntos').insert({
            ticket_id: fila.ticket_id,
            nombre: 'otra.jpg',
            ruta: 'ab/ab000000-0000-4000-8000-000000000000',
            tipo_mime: 'image/jpeg',
            tamano_bytes: 10,
            subido_por: fila.subido_por,
            origen: 'atencion',
          }),
        ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      }));
  });

  describe('comentarios (0019)', () => {
    async function insertComentario(trx: Knex.Transaction, cuerpo: string) {
      const ticketId = await insertTicket(trx);
      const { solicitante_id: autorId } = await trx('tickets').where({ id: ticketId }).first('solicitante_id');
      return trx('comentarios').insert({ ticket_id: ticketId, autor_id: autorId, cuerpo }).returning(['id', 'editado_en']);
    }

    it('acepta 4000 caracteres y deja editado_en en null', () =>
      withRollback(async (trx) => {
        const [fila] = await insertComentario(trx, 'a'.repeat(4000));
        expect(fila.editado_en).toBeNull();
      }));

    it.each([
      ['vacío', ''],
      ['de 4001 caracteres', 'a'.repeat(4001)],
    ])('rechaza un cuerpo %s', (_caso, cuerpo) =>
      withRollback(async (trx) => {
        await expect(insertComentario(trx, cuerpo)).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }),
    );

    it('el índice (ticket_id, creado_en) reemplaza al de solo ticket_id', async () => {
      const indices: { indexname: string; indexdef: string }[] = await db('pg_indexes')
        .where({ schemaname: 'public', tablename: 'comentarios' })
        .select('indexname', 'indexdef');
      const nombres = indices.map((i) => i.indexname);
      expect(nombres).toContain('comentarios_ticket_creado_idx');
      expect(nombres).not.toContain('comentarios_ticket_idx');
      expect(indices.find((i) => i.indexname === 'comentarios_ticket_creado_idx')!.indexdef).toContain('(ticket_id, creado_en)');
    });

    it('revertir 0019 restaura el índice original y quita la columna y el CHECK', async () => {
      await db.migrate.down({ name: '0019_comentarios.js' });
      try {
        const nombres = (await db('pg_indexes').where({ schemaname: 'public', tablename: 'comentarios' }).select('indexname')).map(
          (i: { indexname: string }) => i.indexname,
        );
        expect(nombres).toContain('comentarios_ticket_idx');
        expect(nombres).not.toContain('comentarios_ticket_creado_idx');
        expect(
          await db('information_schema.columns').where({ table_name: 'comentarios', column_name: 'editado_en' }).select('column_name'),
        ).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('bandeja de salida de correos (0029)', () => {
    const correo = (cambios: Record<string, unknown> = {}) => ({
      plantilla_clave: 'queja_registrada',
      para: 'ana@correo.gt',
      asunto: 'VozMuni: registramos tu queja',
      texto: 'Hola',
      html: '<p>Hola</p>',
      ...cambios,
    });

    it('un correo nuevo queda pendiente, sin intentos y con el cuerpo', () =>
      withRollback(async (trx) => {
        const [fila] = await trx('correos_salientes').insert(correo()).returning(['estado', 'intentos', 'terminado_en']);
        expect(fila).toEqual({ estado: 'pendiente', intentos: 0, terminado_en: null });
      }));

    it.each<[string, Record<string, unknown>]>([
      ['un enviado con texto', { estado: 'enviado', terminado_en: new Date() }],
      ['un pendiente sin texto', { texto: null }],
      ['un enviado sin terminado_en', { estado: 'enviado', texto: null, html: null }],
      ['intentos = 4', { intentos: 4 }],
      ['un estado desconocido', { estado: 'perdido', texto: null, html: null, terminado_en: new Date() }],
    ])('rechaza %s', (_caso, cambios) =>
      withRollback(async (trx) => {
        await expect(trx('correos_salientes').insert(correo(cambios))).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }),
    );

    it('acepta un enviado sin cuerpo y con terminado_en', () =>
      withRollback(async (trx) => {
        await trx('correos_salientes').insert(correo({ estado: 'enviado', texto: null, html: null, terminado_en: new Date(), intentos: 1 }));
      }));

    it('crea el índice parcial de pendientes', async () => {
      const indice = await db('pg_indexes')
        .where({ schemaname: 'public', tablename: 'correos_salientes', indexname: 'correos_salientes_pendientes_idx' })
        .first('indexdef');
      expect(indice.indexdef).toContain("(proximo_intento_en) WHERE (estado = 'pendiente'::text)");
    });

    it('revertir 0029 elimina la tabla', async () => {
      await db.migrate.down({ name: '0029_correos_salientes.js' });
      try {
        expect(await db.schema.hasTable('correos_salientes')).toBe(false);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('cierre automático (0028)', () => {
    const CLAVES_0028 = ['queja_resuelta', 'queja_cerrada_automaticamente'];

    it('carga las dos plantillas con sus asuntos y el índice parcial', async () => {
      expect(await db('plantillas_notificacion').whereIn('clave', CLAVES_0028).orderBy('clave').select('clave', 'asunto')).toEqual([
        { clave: 'queja_cerrada_automaticamente', asunto: 'VozMuni: cerramos tu queja {{numero}}' },
        { clave: 'queja_resuelta', asunto: 'VozMuni: resolvimos tu queja {{numero}}' },
      ]);
      const indice = await db('pg_indexes')
        .where({ schemaname: 'public', tablename: 'tickets', indexname: 'tickets_confirmacion_pendiente_idx' })
        .first('indexdef');
      expect(indice.indexdef).toContain("(confirmacion_vence_en) WHERE (estado = 'resuelta'::estado_ticket)");
    });

    it('revertir 0028 quita las plantillas y el índice', async () => {
      await db.migrate.down({ name: '0028_cierre_automatico.js' });
      try {
        expect(await db('plantillas_notificacion').whereIn('clave', CLAVES_0028).select('clave')).toEqual([]);
        expect(
          await db('pg_indexes').where({ tablename: 'tickets', indexname: 'tickets_confirmacion_pendiente_idx' }).select('indexname'),
        ).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('escalamiento (0027)', () => {
    it('crea los 3 índices parciales', async () => {
      const indices: { indexname: string; indexdef: string }[] = await db('pg_indexes')
        .where({ schemaname: 'public', tablename: 'tickets' })
        .select('indexname', 'indexdef');
      const definicion = (nombre: string) => indices.find((i) => i.indexname === nombre)?.indexdef;
      expect(definicion('tickets_escalar_respuesta_idx')).toContain('(vence_respuesta) WHERE ((NOT escalado) AND (primera_respuesta_en IS NULL))');
      expect(definicion('tickets_escalar_resolucion_idx')).toContain('(vence_resolucion) WHERE (NOT escalado)');
      expect(definicion('tickets_escaladas_idx')).toContain('(escalado_en) WHERE escalado');
    });

    it.each<[string, Record<string, unknown>]>([
      ['escalado sin escalado_en', { escalado: true }],
      ['escalado_en sin escalado', { escalado_en: new Date(), escalado_por: 'respuesta' }],
      ['escalado_en sin escalado_por', { escalado: true, escalado_en: new Date() }],
      ['escalado_por = otro', { escalado: true, escalado_en: new Date(), escalado_por: 'otro' }],
    ])('rechaza %s', (_caso, cambios) =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        await expect(trx('tickets').where({ id: ticketId }).update(cambios)).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }),
    );

    it('acepta una queja escalada completa', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        await trx('tickets').where({ id: ticketId }).update({ escalado: true, escalado_en: new Date(), escalado_por: 'resolucion' });
      }));

    it('revertir 0027 quita las columnas, el CHECK y los índices', async () => {
      await db.migrate.down({ name: '0027_escalamiento.js' });
      try {
        expect(
          await db('information_schema.columns')
            .where({ table_name: 'tickets' })
            .whereIn('column_name', ['escalado_en', 'escalado_por'])
            .select('column_name'),
        ).toEqual([]);
        expect(await db('pg_constraint').where({ conname: 'tickets_escalado_consistente' }).select('conname')).toEqual([]);
        const nombres = (await db('pg_indexes').where({ schemaname: 'public', tablename: 'tickets' }).select('indexname')).map(
          (i: { indexname: string }) => i.indexname,
        );
        expect(nombres).not.toContain('tickets_escalar_respuesta_idx');
        expect(nombres).not.toContain('tickets_escalar_resolucion_idx');
        expect(nombres).not.toContain('tickets_escaladas_idx');
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('alertas del SLA (0026)', () => {
    async function indices(tabla: string): Promise<{ indexname: string; indexdef: string }[]> {
      return db('pg_indexes').where({ schemaname: 'public', tablename: tabla }).select('indexname', 'indexdef');
    }

    it('crea los dos índices parciales de alertas pendientes', async () => {
      const deTickets = await indices('tickets');
      const respuesta = deTickets.find((i) => i.indexname === 'tickets_alerta_respuesta_pendiente_idx')!;
      const resolucion = deTickets.find((i) => i.indexname === 'tickets_alerta_resolucion_pendiente_idx')!;
      expect(respuesta.indexdef).toContain('(alerta_respuesta_en) WHERE (alerta_respuesta_enviada_en IS NULL)');
      expect(resolucion.indexdef).toContain('(alerta_resolucion_en) WHERE (alerta_resolucion_enviada_en IS NULL)');
    });

    it('notificaciones.datos es jsonb NOT NULL con {} por defecto, con el índice (usuario_id, creado_en)', async () => {
      const columna = await db('information_schema.columns')
        .where({ table_name: 'notificaciones', column_name: 'datos' })
        .first('is_nullable', 'column_default');
      expect(columna).toEqual({ is_nullable: 'NO', column_default: "'{}'::jsonb" });
      const indice = (await indices('notificaciones')).find((i) => i.indexname === 'notificaciones_usuario_creado_idx')!;
      expect(indice.indexdef).toContain('(usuario_id, creado_en)');
    });

    it('carga sla_umbral_alerta = 80', async () => {
      expect(await db('parametros').where({ clave: 'sla_umbral_alerta' }).first('valor')).toEqual({ valor: 80 });
    });

    it('revertir 0026 quita las columnas, los índices y el parámetro', async () => {
      await db.migrate.down({ name: '0026_alertas_sla.js' });
      try {
        expect(
          await db('information_schema.columns')
            .whereIn('table_name', ['tickets', 'notificaciones'])
            .whereIn('column_name', [
              'alerta_respuesta_en',
              'alerta_resolucion_en',
              'alerta_respuesta_enviada_en',
              'alerta_resolucion_enviada_en',
              'datos',
            ])
            .select('column_name'),
        ).toEqual([]);
        const nombres = [...(await indices('tickets')), ...(await indices('notificaciones'))].map((i) => i.indexname);
        expect(nombres).not.toContain('tickets_alerta_respuesta_pendiente_idx');
        expect(nombres).not.toContain('tickets_alerta_resolucion_pendiente_idx');
        expect(nombres).not.toContain('notificaciones_usuario_creado_idx');
        expect(await db('parametros').where({ clave: 'sla_umbral_alerta' }).select('clave')).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('seguimiento del SLA (0025)', () => {
    it('sla_pausa_minutos es 0 por defecto y los dos contadores rechazan negativos', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        expect(await trx('tickets').where({ id: ticketId }).first('sla_pausa_minutos', 'sla_restante_minutos')).toEqual({
          sla_pausa_minutos: 0,
          sla_restante_minutos: null,
        });
        await expect(trx('tickets').where({ id: ticketId }).update({ sla_pausa_minutos: -1 })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }));

    it('sla_pausado_desde sin sla_restante_minutos viola tickets_sla_pausa_completa, y al revés también', () =>
      withRollback(async (trx) => {
        const ticketId = await insertTicket(trx);
        await trx.raw('SAVEPOINT pausa');
        await expect(
          trx('tickets').where({ id: ticketId }).update({ sla_pausado_desde: new Date() }),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'tickets_sla_pausa_completa' });
        await trx.raw('ROLLBACK TO SAVEPOINT pausa');
        await expect(trx('tickets').where({ id: ticketId }).update({ sla_restante_minutos: 10 })).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'tickets_sla_pausa_completa',
        });
        await trx.raw('ROLLBACK TO SAVEPOINT pausa');
        await trx('tickets').where({ id: ticketId }).update({ sla_pausado_desde: new Date(), sla_restante_minutos: 10 });
      }));

    it('carga jornada_laboral = 08:00–16:00', async () => {
      expect(await db('parametros').where({ clave: 'jornada_laboral' }).first('valor')).toEqual({
        valor: { inicio: '08:00', fin: '16:00' },
      });
    });

    it('revertir 0025 quita las 5 columnas, el CHECK y el parámetro', async () => {
      // 0027 tiene un índice parcial sobre primera_respuesta_en: Postgres lo borraría con la columna.
      await db.migrate.down({ name: '0027_escalamiento.js' });
      await db.migrate.down({ name: '0025_sla.js' });
      try {
        expect(
          await db('information_schema.columns')
            .where({ table_name: 'tickets' })
            .whereIn('column_name', [
              'primera_respuesta_en',
              'sla_inicio_resolucion',
              'sla_pausa_minutos',
              'sla_pausado_desde',
              'sla_restante_minutos',
            ])
            .select('column_name'),
        ).toEqual([]);
        expect(await db('pg_constraint').where({ conname: 'tickets_sla_pausa_completa' }).select('conname')).toEqual([]);
        expect(await db('parametros').where({ clave: 'jornada_laboral' }).select('clave')).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('políticas de SLA (0024)', () => {
    async function insertCategoria(trx: Knex.Transaction): Promise<string> {
      const [dependencia] = await trx('dependencias').insert({ nombre: 'Dependencia 0024' }).returning('id');
      const [categoria] = await trx('categorias').insert({ nombre: 'Categoría 0024', dependencia_id: dependencia.id }).returning('id');
      return categoria.id;
    }

    it('actualizado_en es NOT NULL con valor por defecto y actualizado_por es NULL y apunta a usuarios', async () => {
      const columnas: { column_name: string; is_nullable: string; column_default: string | null }[] = await db(
        'information_schema.columns',
      )
        .where({ table_name: 'politicas_sla' })
        .whereIn('column_name', ['actualizado_en', 'actualizado_por'])
        .select('column_name', 'is_nullable', 'column_default')
        .orderBy('column_name');
      expect(columnas).toEqual([
        { column_name: 'actualizado_en', is_nullable: 'NO', column_default: 'now()' },
        { column_name: 'actualizado_por', is_nullable: 'YES', column_default: null },
      ]);
      await withRollback(async (trx) => {
        const categoriaId = await insertCategoria(trx);
        await expect(
          trx('politicas_sla').insert({
            categoria_id: categoriaId,
            prioridad: 'baja',
            horas_respuesta: 1,
            horas_resolucion: 2,
            actualizado_por: 999999999,
          }),
        ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      });
    });

    it('rechaza horas_respuesta > horas_resolucion y acepta valores iguales', () =>
      withRollback(async (trx) => {
        const categoriaId = await insertCategoria(trx);
        await trx('politicas_sla').insert({ categoria_id: categoriaId, prioridad: 'media', horas_respuesta: 24, horas_resolucion: 24 });
        await expect(
          trx('politicas_sla').insert({ categoria_id: categoriaId, prioridad: 'baja', horas_respuesta: 80, horas_resolucion: 72 }),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'politicas_sla_respuesta_no_mayor' });
      }));

    it('revertir 0024 quita las dos columnas y el CHECK', async () => {
      await db.migrate.down({ name: '0024_politicas_sla.js' });
      try {
        expect(
          await db('information_schema.columns')
            .where({ table_name: 'politicas_sla' })
            .whereIn('column_name', ['actualizado_en', 'actualizado_por'])
            .select('column_name'),
        ).toEqual([]);
        expect(
          await db('pg_constraint').where({ conname: 'politicas_sla_respuesta_no_mayor' }).select('conname'),
        ).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
    });
  });

  describe('línea de tiempo (0023)', () => {
    async function indices(tabla: string): Promise<{ indexname: string; indexdef: string }[]> {
      return db('pg_indexes').where({ schemaname: 'public', tablename: tabla }).select('indexname', 'indexdef');
    }

    it('crea los índices (ticket_id, creado_en) y quita adjuntos_ticket_idx', async () => {
      const traslados = await indices('solicitudes_traslado');
      const adjuntos = await indices('adjuntos');
      expect(traslados.find((i) => i.indexname === 'solicitudes_traslado_ticket_creado_idx')!.indexdef).toContain(
        '(ticket_id, creado_en)',
      );
      expect(adjuntos.find((i) => i.indexname === 'adjuntos_ticket_creado_idx')!.indexdef).toContain('(ticket_id, creado_en)');
      expect(adjuntos.map((i) => i.indexname)).not.toContain('adjuntos_ticket_idx');
    });

    it('revertir 0023 restaura adjuntos_ticket_idx y quita los dos índices', async () => {
      await db.migrate.down({ name: '0023_linea_tiempo.js' });
      try {
        const adjuntos = (await indices('adjuntos')).map((i) => i.indexname);
        expect(adjuntos).toContain('adjuntos_ticket_idx');
        expect(adjuntos).not.toContain('adjuntos_ticket_creado_idx');
        expect((await indices('solicitudes_traslado')).map((i) => i.indexname)).not.toContain(
          'solicitudes_traslado_ticket_creado_idx',
        );
      } finally {
        await db.migrate.latest();
      }
    });
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

  describe('índices de alcance (0011)', () => {
    it.each([
      ['tickets_solicitante_idx', 'tickets', '(solicitante_id)'],
      ['tickets_registrado_por_idx', 'tickets', '(registrado_por)'],
      ['bitacora_dependencia_creado_en_idx', 'bitacora', '(dependencia_id, creado_en)'],
    ])('existe %s', async (nombre, tabla, columnas) => {
      const indice = await db('pg_indexes').where({ schemaname: 'public', indexname: nombre }).first('tablename', 'indexdef');
      expect(indice.tablename).toBe(tabla);
      expect(indice.indexdef).toContain(columnas);
    });
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

    it('acepta una fila con dependencia_id y el trigger sigue bloqueando UPDATE', () =>
      withRollback(async (trx) => {
        const [dependencia] = await trx('dependencias').insert({ nombre: 'Dependencia prueba' }).returning('id');
        const [fila] = await trx('bitacora')
          .insert({ accion: 'crear', entidad: 'ticket', entidad_id: '1', dependencia_id: dependencia.id })
          .returning(['id', 'dependencia_id']);
        expect(fila.dependencia_id).toBe(dependencia.id);
        await expect(trx('bitacora').where({ id: fila.id }).update({ dependencia_id: null })).rejects.toThrow(
          SOLO_INSERCION,
        );
      }));

    it('rechaza TRUNCATE', () =>
      withRollback(async (trx) => {
        await insertBitacora(trx);
        await expect(trx.raw('TRUNCATE bitacora')).rejects.toThrow(SOLO_INSERCION);
      }));
  });

  describe('ticket_asignaciones (0017)', () => {
    const SOLO_INSERCION = 'ticket_asignaciones es solo de inserción';

    // Un ticket con dos usuarios para usar como técnicos; devuelve los ids.
    async function preparar(trx: Knex.Transaction): Promise<{ ticketId: string; a: string; b: string }> {
      const ticketId = await insertTicket(trx);
      const { id: rolId } = await trx('roles').where({ nombre: 'rol_prueba' }).first('id');
      const [a, b] = await trx('usuarios')
        .insert([
          { nombre: 'Técnico A', telefono: '55550001', rol_id: rolId },
          { nombre: 'Técnico B', telefono: '55550002', rol_id: rolId },
        ])
        .returning('id');
      return { ticketId, a: a.id, b: b.id };
    }

    async function insertAsignacion(trx: Knex.Transaction): Promise<string> {
      const { ticketId, a, b } = await preparar(trx);
      const [fila] = await trx('ticket_asignaciones')
        .insert({ ticket_id: ticketId, tecnico_anterior: null, tecnico_nuevo: a, asignado_por: b })
        .returning('id');
      return fila.id;
    }

    it('existe el índice (ticket_id, creado_en)', async () => {
      const indice = await db('pg_indexes')
        .where({ schemaname: 'public', indexname: 'ticket_asignaciones_ticket_creado_en_idx' })
        .first('tablename', 'indexdef');
      expect(indice.tablename).toBe('ticket_asignaciones');
      expect(indice.indexdef).toContain('(ticket_id, creado_en)');
    });

    it('permite INSERT con tecnico_anterior null y creado_en por defecto', () =>
      withRollback(async (trx) => {
        const id = await insertAsignacion(trx);
        const fila = await trx('ticket_asignaciones').where({ id }).first('tecnico_anterior', 'creado_en');
        expect(fila.tecnico_anterior).toBeNull();
        expect(fila.creado_en).toBeInstanceOf(Date);
      }));

    it('rechaza tecnico_anterior = tecnico_nuevo', () =>
      withRollback(async (trx) => {
        const { ticketId, a, b } = await preparar(trx);
        await expect(
          trx('ticket_asignaciones').insert({ ticket_id: ticketId, tecnico_anterior: a, tecnico_nuevo: a, asignado_por: b }),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }));

    it('rechaza UPDATE', () =>
      withRollback(async (trx) => {
        const id = await insertAsignacion(trx);
        await expect(trx('ticket_asignaciones').where({ id }).update({ motivo: 'otro' })).rejects.toThrow(SOLO_INSERCION);
      }));

    it('rechaza DELETE', () =>
      withRollback(async (trx) => {
        const id = await insertAsignacion(trx);
        await expect(trx('ticket_asignaciones').where({ id }).delete()).rejects.toThrow(SOLO_INSERCION);
      }));

    it('rechaza TRUNCATE', () =>
      withRollback(async (trx) => {
        await insertAsignacion(trx);
        await expect(trx.raw('TRUNCATE ticket_asignaciones')).rejects.toThrow(SOLO_INSERCION);
      }));
  });

  describe('solicitudes_traslado (0018)', () => {
    // Un ticket con su dependencia y el usuario solicitante; devuelve los ids.
    async function preparar(trx: Knex.Transaction) {
      const ticketId = await insertTicket(trx);
      const { categoria_id: categoriaId, solicitante_id: usuarioId } = await trx('tickets').where({ id: ticketId }).first();
      const { dependencia_id: origen } = await trx('categorias').where({ id: categoriaId }).first('dependencia_id');
      const [otra] = await trx('dependencias').insert({ nombre: 'Otra dependencia' }).returning('id');
      return { ticketId, usuarioId, origen, otra: otra.id };
    }

    const solicitud = (p: Awaited<ReturnType<typeof preparar>>, cambios: Record<string, unknown> = {}) => ({
      ticket_id: p.ticketId,
      solicitado_por: p.usuarioId,
      dependencia_origen_id: p.origen,
      motivo: 'No es de esta dependencia',
      ...cambios,
    });

    it.each([
      ['solicitudes_traslado_una_pendiente', '(ticket_id) WHERE (estado = '],
      ['solicitudes_traslado_estado_creado_en_idx', '(estado, creado_en)'],
    ])('existe el índice %s', async (nombre, definicion) => {
      const indice = await db('pg_indexes').where({ schemaname: 'public', indexname: nombre }).first('tablename', 'indexdef');
      expect(indice.tablename).toBe('solicitudes_traslado');
      expect(indice.indexdef).toContain(definicion);
    });

    it('estado vale pendiente por defecto', () =>
      withRollback(async (trx) => {
        const p = await preparar(trx);
        const [fila] = await trx('solicitudes_traslado').insert(solicitud(p)).returning('estado');
        expect(fila.estado).toBe('pendiente');
      }));

    it('una segunda pendiente para el mismo ticket viola el índice único parcial; con otro estado se acepta', () =>
      withRollback(async (trx) => {
        const p = await preparar(trx);
        await trx('solicitudes_traslado').insert(solicitud(p));
        await trx('solicitudes_traslado').insert(solicitud(p, { estado: 'rechazada' }));
        await expect(trx('solicitudes_traslado').insert(solicitud(p))).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      }));

    it.each<[string, (p: Awaited<ReturnType<typeof preparar>>) => Record<string, unknown>]>([
      ['la sugerida igual a la de origen', (p) => ({ dependencia_sugerida_id: p.origen })],
      ['un motivo vacío', () => ({ motivo: '' })],
      ['un motivo de 1001 caracteres', () => ({ motivo: 'a'.repeat(1001) })],
      ['un estado desconocido', () => ({ estado: 'en_curso' })],
    ])('rechaza %s', (_caso, cambios) =>
      withRollback(async (trx) => {
        const p = await preparar(trx);
        await expect(trx('solicitudes_traslado').insert(solicitud(p, cambios(p)))).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      }),
    );

    it('acepta una sugerida distinta de la de origen', () =>
      withRollback(async (trx) => {
        const p = await preparar(trx);
        await trx('solicitudes_traslado').insert(solicitud(p, { dependencia_sugerida_id: p.otra }));
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

    // 0016_triage agrega tickets.triage al supervisor.
    const MATRIZ_CON_TRIAGE = { ...MATRIZ, supervisor: { ...MATRIZ.supervisor, 'tickets.triage': 'todas' } };
    // Estado tras todas las migraciones: 0009_permiso_admin_usuarios agrega admin.usuarios al administrador.
    const MATRIZ_ACTUAL = {
      ...MATRIZ_CON_TRIAGE,
      administrador: { ...MATRIZ.administrador, 'admin.usuarios': 'si' },
    };

    async function permisosPorRol(): Promise<Record<string, unknown>> {
      const roles: { nombre: string; permisos: unknown }[] = await db('roles').select('nombre', 'permisos').orderBy('id');
      return Object.fromEntries(roles.map((rol) => [rol.nombre, rol.permisos]));
    }

    it('deja exactamente los 6 roles con la matriz de permisos', async () => {
      expect(await permisosPorRol()).toEqual(MATRIZ_ACTUAL);
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
      // 0009 y 0016 dependen de los roles: se revierten antes y vuelven a aplicarse con latest().
      await db.migrate.down({ name: '0016_triage.js' });
      await db.migrate.down({ name: '0009_permiso_admin_usuarios.js' });
      await db.migrate.down({ name: '0006_roles.js' });
      await db('roles').insert(Object.keys(MATRIZ).map((nombre) => ({ nombre, permisos: {} })));
      await db.migrate.latest();

      expect(await permisosPorRol()).toEqual(MATRIZ_ACTUAL);
    });

    it('el down falla si un usuario tiene uno de esos roles', async () => {
      const { id: rolId } = await db('roles').where({ nombre: 'vecino' }).first('id');
      const [usuario] = await db('usuarios').insert({ nombre: 'Vecino', telefono: '55550000', rol_id: rolId }).returning('id');
      try {
        await expect(db.migrate.down({ name: '0006_roles.js' })).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
        expect(await permisosPorRol()).toEqual(MATRIZ_ACTUAL);
      } finally {
        await db('usuarios').where({ id: usuario.id }).delete();
      }
    });

    it('seed.run() termina sin error con la carpeta seeds/ vacía', async () => {
      await expect(db.seed.run()).resolves.toEqual([[]]);
    });

    describe('migración 0009_permiso_admin_usuarios', () => {
      it('solo el administrador tiene admin.usuarios = si', async () => {
        const conPermiso: { nombre: string; valor: string }[] = await db('roles')
          .select('nombre', db.raw("permisos->>'admin.usuarios' as valor"))
          .whereRaw("permisos->>'admin.usuarios' IS NOT NULL");

        expect(conPermiso).toEqual([{ nombre: 'administrador', valor: 'si' }]);
      });

      it('al revertirla desaparece la clave y el resto de los permisos queda igual', async () => {
        await db.migrate.down({ name: '0009_permiso_admin_usuarios.js' });
        try {
          expect(await permisosPorRol()).toEqual(MATRIZ_CON_TRIAGE);
        } finally {
          await db.migrate.latest();
        }
        expect(await permisosPorRol()).toEqual(MATRIZ_ACTUAL);
      });
    });
  });

  describe('triage (0016)', () => {
    const CLAVES_0016 = ['queja_aceptada', 'queja_rechazada'];

    async function conTriage(): Promise<{ nombre: string; valor: string }[]> {
      return db('roles')
        .select('nombre', db.raw("permisos->>'tickets.triage' as valor"))
        .whereRaw("permisos->>'tickets.triage' IS NOT NULL");
    }

    it('solo el supervisor tiene tickets.triage = todas', async () => {
      expect(await conTriage()).toEqual([{ nombre: 'supervisor', valor: 'todas' }]);
    });

    it('existen queja_aceptada y queja_rechazada', async () => {
      const filas: { clave: string; asunto: string }[] = await db('plantillas_notificacion')
        .whereIn('clave', CLAVES_0016)
        .orderBy('clave')
        .select('clave', 'asunto');
      expect(filas).toEqual([
        { clave: 'queja_aceptada', asunto: 'VozMuni: tu queja {{numero}} fue aceptada' },
        { clave: 'queja_rechazada', asunto: 'VozMuni: tu queja {{numero}} no fue aceptada' },
      ]);
    });

    it('revertir 0016 quita el permiso y las 2 plantillas, y latest() los vuelve a crear', async () => {
      await db.migrate.down({ name: '0016_triage.js' });
      try {
        expect(await conTriage()).toEqual([]);
        expect(await db('plantillas_notificacion').whereIn('clave', CLAVES_0016).select('clave')).toEqual([]);
      } finally {
        await db.migrate.latest();
      }
      expect(await conTriage()).toEqual([{ nombre: 'supervisor', valor: 'todas' }]);
      expect(await db('plantillas_notificacion').whereIn('clave', CLAVES_0016)).toHaveLength(2);
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
      expect(Object.keys(expectedColumns)).toHaveLength(22);

      const tipos = await db('pg_type').select('typname').where({ typname: 'estado_ticket' });
      expect(tipos).toEqual([]);

      const funciones = await db('pg_proc')
        .select('proname')
        .whereIn('proname', ['bitacora_solo_insercion', 'ticket_asignaciones_solo_insercion']);
      expect(funciones).toEqual([]);
    });
  });
});
