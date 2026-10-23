import { RecuperacionService } from '../../../src/application/services/recuperacion.service';
import type { EnviadorCorreo, MensajeCorreo } from '../../../src/domain/notificaciones/enviador-correo';
import type { Plantilla } from '../../../src/domain/notificaciones/plantilla';
import type { PlantillaRepository } from '../../../src/domain/repositories/plantilla-repository';
import type { RestablecimientoRepository } from '../../../src/domain/repositories/restablecimiento-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';
import {
  HasherFalso,
  MINUTO,
  RelojFalso,
  SesionesEnMemoria,
  TokensFalsos,
  type UsuarioFalso,
  UsuariosEnMemoria,
  usuario,
} from './dobles';

interface RestablecimientoFalso {
  id: number;
  usuarioId: number;
  tokenHash: string;
  expiraEn: Date;
  usadoEn: Date | null;
  invalidadoEn: Date | null;
}

class RestablecimientosEnMemoria implements RestablecimientoRepository {
  readonly filas: RestablecimientoFalso[] = [];

  async invalidarPendientes(usuarioId: number, ahora: Date): Promise<void> {
    for (const r of this.filas.filter((f) => f.usuarioId === usuarioId && !f.usadoEn && !f.invalidadoEn)) {
      r.invalidadoEn = ahora;
    }
  }

  async crear(usuarioId: number, tokenHash: string, expiraEn: Date): Promise<void> {
    this.filas.push({ id: this.filas.length + 1, usuarioId, tokenHash, expiraEn, usadoEn: null, invalidadoEn: null });
  }

  async buscarVigente(tokenHash: string, ahora: Date): Promise<{ id: number; usuarioId: number } | null> {
    const r = this.filas.find(
      (f) => f.tokenHash === tokenHash && !f.usadoEn && !f.invalidadoEn && f.expiraEn.getTime() > ahora.getTime(),
    );
    return r ? { id: r.id, usuarioId: r.usuarioId } : null;
  }

  async marcarUsado(id: number, ahora: Date): Promise<void> {
    this.filas.find((f) => f.id === id)!.usadoEn = ahora;
  }
}

// Las plantillas reales viven en la base; aquí basta con usar las variables.
class PlantillasEnMemoria implements PlantillaRepository {
  readonly plantillas = new Map<string, Plantilla>([
    ['recuperacion_password', { clave: 'recuperacion_password', asunto: 'Recupera', cuerpoTexto: '{{nombre}}: {{enlace}}', cuerpoHtml: '<a href="{{enlace}}">{{nombre}}</a>' }],
    ['password_cambiado', { clave: 'password_cambiado', asunto: 'Cambiada', cuerpoTexto: '{{nombre}}', cuerpoHtml: '<p>{{nombre}}</p>' }],
  ]);

  async buscarPorClave(clave: string): Promise<Plantilla | null> {
    return this.plantillas.get(clave) ?? null;
  }
}

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  fallar = false;

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.fallar) {
      throw new Error('ECONNREFUSED smtp');
    }
    this.enviados.push(mensaje);
  }
}

// Sin rollback real: los dobles en memoria no lo necesitan para estas pruebas.
class TransaccionEnMemoria implements Transaccion {
  constructor(private readonly repos: ReposTransaccionales) {}

  ejecutar<T>(trabajo: (repos: ReposTransaccionales) => Promise<T>): Promise<T> {
    return trabajo(this.repos);
  }
}

// El correo sale sin esperar: deja correr las promesas pendientes.
const correosPendientes = () => new Promise((resolver) => setImmediate(resolver));

const NUEVA = 'Nueva-clave-2026';

function crearEscenario(filas: UsuarioFalso[] = [usuario()]) {
  const usuarios = new UsuariosEnMemoria(filas);
  const sesiones = new SesionesEnMemoria();
  const restablecimientos = new RestablecimientosEnMemoria();
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const reloj = new RelojFalso(new Date('2026-10-22T15:00:00.000Z'));
  const servicio = new RecuperacionService(
    usuarios,
    restablecimientos,
    new PlantillasEnMemoria(),
    new TransaccionEnMemoria({ usuarios, sesiones, restablecimientos }),
    enviador,
    new HasherFalso(),
    new TokensFalsos(),
    reloj,
    { appUrl: 'http://localhost:5173', registrarError: (mensaje) => errores.push(mensaje) },
  );
  return { servicio, usuarios, sesiones, restablecimientos, enviador, errores, reloj };
}

// Pide el enlace y devuelve el token que viaja en el correo.
async function pedirToken(escenario: ReturnType<typeof crearEscenario>): Promise<string> {
  await escenario.servicio.solicitar('ana@vozmuni.test');
  await correosPendientes();
  const correo = escenario.enviador.enviados.at(-1)!;
  return /token=([^\s"<]+)/.exec(correo.texto)![1];
}

describe('RecuperacionService.solicitar', () => {
  it('un correo existente guarda el hash del token, vence en 30 min y envía el enlace', async () => {
    const e = crearEscenario();

    await e.servicio.solicitar('ana@vozmuni.test');
    await correosPendientes();

    expect(e.restablecimientos.filas).toEqual([
      expect.objectContaining({
        usuarioId: 1,
        tokenHash: 'sha:renovacion-1',
        expiraEn: new Date('2026-10-22T15:30:00.000Z'),
      }),
    ]);
    expect(e.enviador.enviados).toEqual([
      {
        para: 'ana@vozmuni.test',
        asunto: 'Recupera',
        texto: 'Ana Coordinadora: http://localhost:5173/restablecer?token=renovacion-1',
        html: '<a href="http://localhost:5173/restablecer?token=renovacion-1">Ana Coordinadora</a>',
      },
    ]);
  });

  it('una segunda solicitud invalida el enlace anterior', async () => {
    const e = crearEscenario();

    await e.servicio.solicitar('ana@vozmuni.test');
    await e.servicio.solicitar('ana@vozmuni.test');

    expect(e.restablecimientos.filas.map((f) => f.invalidadoEn)).toEqual([e.reloj.actual, null]);
  });

  it.each([
    ['inexistente', [usuario()], 'nadie@vozmuni.test'],
    ['inactivo', [usuario({ activo: false })], 'ana@vozmuni.test'],
    ['sin password_hash', [usuario({ passwordHash: null })], 'ana@vozmuni.test'],
  ])('un correo %s termina igual y no envía nada', async (_caso, filas, email) => {
    const e = crearEscenario(filas);

    await expect(e.servicio.solicitar(email)).resolves.toBeUndefined();
    await correosPendientes();

    expect(e.restablecimientos.filas).toEqual([]);
    expect(e.enviador.enviados).toEqual([]);
  });

  it('un fallo del enviador no se propaga y queda en el log sin el token', async () => {
    const e = crearEscenario();
    e.enviador.fallar = true;

    await expect(e.servicio.solicitar('ana@vozmuni.test')).resolves.toBeUndefined();
    await correosPendientes();

    expect(e.errores).toHaveLength(1);
    expect(e.errores[0]).toContain('recuperacion_password');
    expect(e.errores[0]).toContain('usuario_id 1');
    expect(e.errores[0]).not.toContain('renovacion-1');
  });
});

describe('RecuperacionService.restablecer', () => {
  it.each([
    ['Abc1234', 'MUY_CORTA'],
    ['12345678', 'SIN_LETRA'],
    ['abcdefgh', 'SIN_NUMERO'],
  ])('una contraseña débil (%s) lanza POLITICA_PASSWORD y no consume el token', async (password, motivo) => {
    const e = crearEscenario();
    const token = await pedirToken(e);

    await expect(e.servicio.restablecer(token, password)).rejects.toMatchObject({
      codigo: 'POLITICA_PASSWORD',
      message: motivo,
    });
    expect(e.restablecimientos.filas[0].usadoEn).toBeNull();
  });

  it('un token vencido, usado, invalidado o inexistente lanza TOKEN_RECUPERACION_INVALIDO', async () => {
    const e = crearEscenario();
    const invalidado = await pedirToken(e);
    const usado = await pedirToken(e);
    await e.servicio.restablecer(usado, NUEVA);
    const vencido = await pedirToken(e);
    e.reloj.avanzar(30 * MINUTO);

    for (const token of [vencido, usado, invalidado, 'no-existe']) {
      await expect(e.servicio.restablecer(token, NUEVA)).rejects.toMatchObject({ codigo: 'TOKEN_RECUPERACION_INVALIDO' });
    }
  });

  it('un usuario desactivado después de pedir el enlace no puede restablecer', async () => {
    const e = crearEscenario();
    const token = await pedirToken(e);
    e.usuarios.filas[0].activo = false;

    await expect(e.servicio.restablecer(token, NUEVA)).rejects.toMatchObject({ codigo: 'TOKEN_RECUPERACION_INVALIDO' });
  });

  it('un restablecimiento correcto cambia el hash, limpia el bloqueo, deja solo la sesión nueva y avisa por correo', async () => {
    const bloqueadoHasta = new Date('2026-10-22T15:10:00.000Z');
    const e = crearEscenario([usuario({ bloqueo: { intentosFallidos: 0, bloqueadoHasta } })]);
    await e.sesiones.crear({ usuarioId: 1, tokenHash: 'sha:vieja', expiraEn: new Date('2026-10-29T00:00:00Z') });
    const token = await pedirToken(e);

    const respuesta = await e.servicio.restablecer(token, NUEVA);
    await correosPendientes();

    expect(respuesta).toMatchObject({
      accessToken: expect.stringMatching(/^acceso:/),
      refreshToken: expect.any(String),
      usuario: { id: 1, nombre: 'Ana Coordinadora', rol: 'coordinador', dependenciaId: 4 },
    });
    expect(e.usuarios.filas[0]).toMatchObject({
      passwordHash: `hash:${NUEVA}`,
      bloqueo: { intentosFallidos: 0, bloqueadoHasta: null },
    });
    expect(e.restablecimientos.filas[0].usadoEn).toEqual(e.reloj.actual);
    expect(e.sesiones.activasDe(1).map((s) => s.tokenHash)).toEqual([`sha:${respuesta.refreshToken}`]);
    expect(e.enviador.enviados.at(-1)).toEqual({
      para: 'ana@vozmuni.test',
      asunto: 'Cambiada',
      texto: 'Ana Coordinadora',
      html: '<p>Ana Coordinadora</p>',
    });
  });

  it('si el aviso falla, el restablecimiento igual responde y el fallo queda en el log', async () => {
    const e = crearEscenario();
    const token = await pedirToken(e);
    e.enviador.fallar = true;

    await expect(e.servicio.restablecer(token, NUEVA)).resolves.toMatchObject({ usuario: { id: 1 } });
    await correosPendientes();

    expect(e.errores).toEqual([expect.stringContaining('password_cambiado')]);
  });
});
