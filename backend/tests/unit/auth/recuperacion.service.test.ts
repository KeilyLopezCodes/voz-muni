import { EnvioCorreo } from '../../../src/application/services/envio-correo';
import { RecuperacionService } from '../../../src/application/services/recuperacion.service';
import {
  correosPendientes,
  EnviadorEnMemoria,
  HasherFalso,
  MINUTO,
  PlantillasEnMemoria,
  RegistroVecinosEnMemoria,
  RelojFalso,
  RestablecimientosEnMemoria,
  SesionesEnMemoria,
  TokensFalsos,
  TransaccionEnMemoria,
  type UsuarioFalso,
  UsuariosAdminEnMemoria,
  UsuariosEnMemoria,
  usuario,
  VecinosEnMemoria,
} from './dobles';

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
    new TransaccionEnMemoria({
      usuarios,
      usuariosAdmin: new UsuariosAdminEnMemoria(usuarios),
      sesiones,
      restablecimientos,
      vecinos: new VecinosEnMemoria(usuarios),
      registroVecinos: new RegistroVecinosEnMemoria(usuarios),
    }),
    new EnvioCorreo(new PlantillasEnMemoria(), enviador, (mensaje) => errores.push(mensaje)),
    new HasherFalso(),
    new TokensFalsos(),
    reloj,
    'http://localhost:5173',
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

describe('Ampliaciones de SPEC 10', () => {
  it('un usuario interno activo sin contraseña recibe el enlace de recuperación', async () => {
    const e = crearEscenario([usuario({ passwordHash: null, rol: 'tecnico' })]);

    await e.servicio.solicitar('ana@vozmuni.test');
    await correosPendientes();

    expect(e.restablecimientos.filas).toEqual([expect.objectContaining({ usuarioId: 1, tipo: 'recuperacion' })]);
    expect(e.enviador.enviados).toEqual([expect.objectContaining({ para: 'ana@vozmuni.test', asunto: 'Recupera' })]);
  });

  it('un vecino activo sin contraseña y con correo recibe el enlace (SPEC 13)', async () => {
    const e = crearEscenario([usuario({ passwordHash: null, rol: 'vecino', dependenciaId: null })]);

    await e.servicio.solicitar('ana@vozmuni.test');
    await correosPendientes();

    expect(e.restablecimientos.filas).toEqual([expect.objectContaining({ usuarioId: 1, tipo: 'recuperacion' })]);
    expect(e.enviador.enviados).toEqual([expect.objectContaining({ para: 'ana@vozmuni.test', asunto: 'Recupera' })]);
  });

  it('un usuario inactivo no recibe nada, tenga o no contraseña', async () => {
    for (const passwordHash of [null, 'hash:x']) {
      const e = crearEscenario([usuario({ passwordHash, rol: 'vecino', dependenciaId: null, activo: false })]);

      await e.servicio.solicitar('ana@vozmuni.test');
      await correosPendientes();

      expect(e.enviador.enviados).toEqual([]);
    }
  });

  it('un vecino sin correo no puede pedir el enlace: no hay correo con el cual buscarlo', async () => {
    const e = crearEscenario([usuario({ email: null, telefono: '55550000', rol: 'vecino', dependenciaId: null })]);

    await e.servicio.solicitar('ana@vozmuni.test');
    await correosPendientes();

    expect(e.restablecimientos.filas).toEqual([]);
    expect(e.enviador.enviados).toEqual([]);
  });

  it('restablecer con un token de invitación define la contraseña sin enviar password_cambiado', async () => {
    const e = crearEscenario([usuario({ passwordHash: null, rol: 'tecnico' })]);
    await e.restablecimientos.crear(1, 'sha:invitacion', 'invitacion', e.reloj.actual);

    await expect(e.servicio.restablecer('invitacion', NUEVA)).resolves.toMatchObject({ usuario: { id: 1 } });
    await correosPendientes();

    expect(e.usuarios.filas[0].passwordHash).toBe(`hash:${NUEVA}`);
    expect(e.enviador.enviados).toEqual([]);
  });

  it('restablecer con un token de recuperación sí envía password_cambiado', async () => {
    const e = crearEscenario();
    const token = await pedirToken(e);

    await e.servicio.restablecer(token, NUEVA);
    await correosPendientes();

    expect(e.enviador.enviados.map((correo) => correo.asunto)).toEqual(['Recupera', 'Cambiada']);
  });

  it('la invitación sigue vigente a las 23 h y vence a las 24 h', async () => {
    const e = crearEscenario([usuario({ passwordHash: null, rol: 'tecnico' })]);
    await e.restablecimientos.crear(1, 'sha:invitacion', 'invitacion', e.reloj.actual);

    e.reloj.avanzar(24 * 60 * MINUTO);
    await expect(e.servicio.restablecer('invitacion', NUEVA)).rejects.toMatchObject({ codigo: 'TOKEN_RECUPERACION_INVALIDO' });
    e.reloj.avanzar(-60 * MINUTO);
    await expect(e.servicio.restablecer('invitacion', NUEVA)).resolves.toMatchObject({ usuario: { id: 1 } });
  });
});

describe('Ampliaciones de SPEC 16', () => {
  it('restablecer marca el correo como verificado', async () => {
    const e = crearEscenario([usuario({ rol: 'vecino', correoVerificadoEn: null })]);
    const token = await pedirToken(e);

    await e.servicio.restablecer(token, NUEVA);

    expect(e.usuarios.filas[0].correoVerificadoEn).toEqual(e.reloj.actual);
  });

  it('restablecer conserva la fecha de verificación de un correo ya verificado', async () => {
    const verificado = new Date('2026-01-01T00:00:00Z');
    const e = crearEscenario([usuario({ correoVerificadoEn: verificado })]);
    const token = await pedirToken(e);

    await e.servicio.restablecer(token, NUEVA);

    expect(e.usuarios.filas[0].correoVerificadoEn).toEqual(verificado);
  });

  it('un token de verificación no sirve para restablecer la contraseña', async () => {
    const e = crearEscenario([usuario({ rol: 'vecino', correoVerificadoEn: null })]);
    const hashOriginal = e.usuarios.filas[0].passwordHash;
    await e.restablecimientos.crear(1, 'sha:verificacion', 'verificacion', e.reloj.actual);

    await expect(e.servicio.restablecer('verificacion', NUEVA)).rejects.toMatchObject({ codigo: 'TOKEN_RECUPERACION_INVALIDO' });
    expect(e.usuarios.filas[0]).toMatchObject({ passwordHash: hashOriginal, correoVerificadoEn: null });
    expect(e.restablecimientos.filas[0].usadoEn).toBeNull();
  });
});
