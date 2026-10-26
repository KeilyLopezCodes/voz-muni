import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import { RegistroVecinosService } from '../../../src/application/services/registro-vecinos.service';
import type { EnviadorCorreo, MensajeCorreo } from '../../../src/domain/notificaciones/enviador-correo';
import type { DatosRegistro } from '../../../src/domain/usuarios/registro-vecino';
import {
  DIA,
  EnviadorEnMemoria,
  HasherFalso,
  PlantillasEnMemoria,
  RegistroVecinosEnMemoria,
  RelojFalso,
  RestablecimientosEnMemoria,
  TokensFalsos,
  TransaccionEnMemoria,
  type UsuarioFalso,
  UsuariosEnMemoria,
  correosPendientes,
  usuario,
} from '../auth/dobles';
import { notificadorDePrueba } from '../notificaciones/dobles-correo';

const APP_URL = 'http://app.test';

const datos: DatosRegistro = {
  nombre: 'María López',
  dpi: '2547 12345 0101',
  email: 'Maria@Correo.GT',
  telefono: '5555-0000',
  password: 'Abc12345',
};

function preparar(filas: UsuarioFalso[] = [], enviador: EnviadorCorreo = new EnviadorEnMemoria(), despachoSincronico = true) {
  const reloj = new RelojFalso(new Date('2026-10-23T15:00:00Z'));
  const usuarios = new UsuariosEnMemoria(filas);
  const registroVecinos = new RegistroVecinosEnMemoria(usuarios);
  const restablecimientos = new RestablecimientosEnMemoria();
  const hasher = new HasherFalso();
  const hashes = jest.spyOn(hasher, 'hash');
  const errores: string[] = [];
  const servicio = new RegistroVecinosService(
    new TransaccionEnMemoria({ usuarios, registroVecinos, restablecimientos }),
    notificadorDePrueba(new PlantillasEnMemoria(), enviador, (mensaje) => errores.push(mensaje), { despachoSincronico }),
    hasher,
    new TokensFalsos(),
    reloj,
    APP_URL,
  );
  return { servicio, usuarios, registroVecinos, restablecimientos, hashes, errores, reloj };
}

const enviados = (enviador: EnviadorEnMemoria) => enviador.enviados.map((m: MensajeCorreo) => [m.para, m.asunto]);

// Usuarios existentes para los casos de la tabla.
const pendiente = () =>
  usuario({ id: 10, rol: 'vecino', email: 'maria@correo.gt', dpi: '2547123450101', correoVerificadoEn: null, nombre: 'Viejo' });
const verificado = () => usuario({ id: 11, rol: 'vecino', email: 'maria@correo.gt', dpi: '9999999999999' });
const ventanilla = () =>
  usuario({ id: 12, rol: 'vecino', email: 'maria@correo.gt', dpi: '8888888888888', passwordHash: null, correoVerificadoEn: null });
const interno = () => usuario({ id: 13, rol: 'tecnico', email: 'maria@correo.gt', dpi: '7777777777777' });
const otroConDpi = () => usuario({ id: 20, rol: 'vecino', email: 'otro@correo.gt', dpi: '2547123450101' });

describe('RegistroVecinosService.registrar', () => {
  it('caso 1: crea el vecino sin verificar, un enlace de 24 h y envía verificacion_correo', async () => {
    const enviador = new EnviadorEnMemoria();
    const { servicio, usuarios, restablecimientos, reloj } = preparar([], enviador);

    await servicio.registrar(datos);
    await correosPendientes();

    const creado = usuarios.filas[0];
    expect(creado).toMatchObject({
      nombre: 'María López',
      email: 'maria@correo.gt',
      dpi: '2547123450101',
      telefono: '55550000',
      rol: 'vecino',
      activo: true,
      passwordHash: 'hash:Abc12345',
      correoVerificadoEn: null,
    });
    expect(restablecimientos.filas).toEqual([
      expect.objectContaining({
        usuarioId: creado.id,
        tipo: 'verificacion',
        expiraEn: new Date(reloj.actual.getTime() + DIA),
      }),
    ]);
    expect(enviados(enviador)).toEqual([['maria@correo.gt', 'Confirma']]);
    expect(enviador.enviados[0].texto).toBe(`María López: ${APP_URL}/verificar?token=renovacion-1`);
  });

  it('caso 2: reemplaza un registro pendiente, invalida su enlace anterior y envía uno nuevo', async () => {
    const enviador = new EnviadorEnMemoria();
    const { servicio, usuarios, restablecimientos, reloj } = preparar([pendiente()], enviador);
    await restablecimientos.crear(10, 'sha:viejo', 'verificacion', reloj.actual);

    await servicio.registrar({ ...datos, password: 'Nueva2026' });
    await correosPendientes();

    expect(usuarios.filas).toHaveLength(1);
    expect(usuarios.filas[0]).toMatchObject({ id: 10, nombre: 'María López', passwordHash: 'hash:Nueva2026' });
    expect(restablecimientos.filas[0].invalidadoEn).toEqual(reloj.actual);
    expect(restablecimientos.filas[1]).toMatchObject({ usuarioId: 10, tipo: 'verificacion', invalidadoEn: null });
    expect(enviados(enviador)).toEqual([['maria@correo.gt', 'Confirma']]);
  });

  it.each([
    ['una cuenta verificada', verificado],
    ['un vecino de ventanilla sin contraseña', ventanilla],
    ['un usuario interno', interno],
  ])('caso 3: el correo es de %s → no cambia nada y envía cuenta_existente', async (_tipo, existente) => {
    const enviador = new EnviadorEnMemoria();
    const original = existente();
    const { servicio, usuarios, restablecimientos } = preparar([{ ...original }], enviador);

    await servicio.registrar(datos);
    await correosPendientes();

    expect(usuarios.filas).toEqual([original]);
    expect(restablecimientos.filas).toEqual([]);
    expect(enviados(enviador)).toEqual([['maria@correo.gt', 'Ya tienes cuenta']]);
  });

  it('caso 4: el DPI es de otro usuario → no crea nada y envía registro_no_completado al correo ingresado', async () => {
    const enviador = new EnviadorEnMemoria();
    const { servicio, usuarios, restablecimientos } = preparar([otroConDpi()], enviador);

    await servicio.registrar(datos);
    await correosPendientes();

    expect(usuarios.filas).toHaveLength(1);
    expect(restablecimientos.filas).toEqual([]);
    expect(enviados(enviador)).toEqual([['maria@correo.gt', 'No se pudo']]);
  });

  it('caso 4: un registro pendiente con el DPI de otro usuario no se reemplaza', async () => {
    const enviador = new EnviadorEnMemoria();
    const { servicio, usuarios } = preparar(
      [{ ...pendiente(), dpi: '1111111111111' }, otroConDpi()],
      enviador,
    );

    await servicio.registrar(datos);
    await correosPendientes();

    expect(usuarios.filas[0]).toMatchObject({ nombre: 'Viejo', dpi: '1111111111111' });
    expect(enviados(enviador)).toEqual([['maria@correo.gt', 'No se pudo']]);
  });

  it('caso 5: el usuario del correo está inactivo → no cambia nada ni envía correo', async () => {
    const enviador = new EnviadorEnMemoria();
    const original = { ...verificado(), activo: false };
    const { servicio, usuarios } = preparar([{ ...original }], enviador);

    await servicio.registrar(datos);
    await correosPendientes();

    expect(usuarios.filas).toEqual([original]);
    expect(enviador.enviados).toEqual([]);
  });

  it.each([
    ['nuevo', []],
    ['cuenta existente', [verificado()]],
    ['DPI ajeno', [otroConDpi()]],
    ['inactivo', [{ ...verificado(), activo: false }]],
  ] as const)('calcula el hash de la contraseña siempre (%s), para que el tiempo no delate el caso', async (_c, filas) => {
    const { servicio, hashes } = preparar([...filas]);
    await servicio.registrar(datos);
    expect(hashes).toHaveBeenCalledTimes(1);
  });

  it('termina antes de que el correo se envíe', async () => {
    let terminoEnvio = false;
    const enviadorLento: EnviadorCorreo = {
      enviar: () =>
        new Promise<void>((resolver) =>
          setTimeout(() => {
            terminoEnvio = true;
            resolver();
          }, 50),
        ),
    };
    // Sin despacho sincrónico, como en producción.
    const { servicio } = preparar([], enviadorLento, false);

    await servicio.registrar(datos);

    expect(terminoEnvio).toBe(false);
  });

  it('un fallo del enviador no se propaga y queda en el log', async () => {
    const enviador = new EnviadorEnMemoria();
    enviador.fallar = true;
    const { servicio, errores } = preparar([], enviador);

    await expect(servicio.registrar(datos)).resolves.toBeUndefined();
    await correosPendientes();

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('verificacion_correo');
    expect(errores[0]).not.toContain('renovacion-1');
  });

  it.each([
    ['EMAIL_DUPLICADO', 'Ya tienes cuenta'],
    ['DPI_DUPLICADO', 'No se pudo'],
  ] as const)('si otro registro gana la carrera (%s), responde igual y envía el aviso que corresponde', async (codigo, asunto) => {
    const enviador = new EnviadorEnMemoria();
    const { servicio, registroVecinos } = preparar([], enviador);
    registroVecinos.duplicadoEnCarrera = codigo;

    await expect(servicio.registrar(datos)).resolves.toBeUndefined();
    await correosPendientes();

    expect(enviados(enviador)).toEqual([['maria@correo.gt', asunto]]);
  });

  it.each([
    [{ dpi: '254712345010' }, 'DPI_INVALIDO'],
    [{ email: 'no-es-correo' }, 'EMAIL_INVALIDO'],
    [{ telefono: '5555000' }, 'TELEFONO_INVALIDO'],
    [{ password: 'abcdefgh' }, 'POLITICA_PASSWORD'],
  ] as const)('datos inválidos %p → ErrorDeAplicacion %s, sin tocar nada', async (cambio, codigo) => {
    const { servicio, usuarios, hashes } = preparar();
    await expect(servicio.registrar({ ...datos, ...cambio })).rejects.toEqual(
      expect.objectContaining({ codigo, constructor: ErrorDeAplicacion }),
    );
    expect(usuarios.filas).toEqual([]);
    expect(hashes).not.toHaveBeenCalled();
  });
});

describe('RegistroVecinosService.verificar', () => {
  async function registrado() {
    const contexto = preparar();
    await contexto.servicio.registrar(datos);
    return contexto;
  }

  it('marca el correo como verificado y consume el token', async () => {
    const { servicio, usuarios, restablecimientos, reloj } = await registrado();

    await servicio.verificar('renovacion-1');

    expect(usuarios.filas[0].correoVerificadoEn).toEqual(reloj.actual);
    expect(restablecimientos.filas[0].usadoEn).toEqual(reloj.actual);
  });

  it('un token ya usado → TOKEN_VERIFICACION_INVALIDO', async () => {
    const { servicio } = await registrado();
    await servicio.verificar('renovacion-1');
    await expect(servicio.verificar('renovacion-1')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
  });

  it('un token vencido (24 h + 1 ms) → TOKEN_VERIFICACION_INVALIDO', async () => {
    const { servicio, reloj } = await registrado();
    reloj.avanzar(DIA + 1);
    await expect(servicio.verificar('renovacion-1')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
  });

  it('un token de otro tipo (recuperacion o invitacion) → TOKEN_VERIFICACION_INVALIDO', async () => {
    const { servicio, restablecimientos, usuarios, reloj } = await registrado();
    await restablecimientos.crear(usuarios.filas[0].id, 'sha:de-recuperacion', 'recuperacion', reloj.actual);
    await restablecimientos.crear(usuarios.filas[0].id, 'sha:de-invitacion', 'invitacion', reloj.actual);

    await expect(servicio.verificar('de-recuperacion')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
    await expect(servicio.verificar('de-invitacion')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
    expect(usuarios.filas[0].correoVerificadoEn).toBeNull();
  });

  it('un usuario inactivo → TOKEN_VERIFICACION_INVALIDO', async () => {
    const { servicio, usuarios } = await registrado();
    usuarios.filas[0].activo = false;
    await expect(servicio.verificar('renovacion-1')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
  });

  it('un token inexistente → TOKEN_VERIFICACION_INVALIDO', async () => {
    const { servicio } = preparar();
    await expect(servicio.verificar('no-existe')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
  });
});
