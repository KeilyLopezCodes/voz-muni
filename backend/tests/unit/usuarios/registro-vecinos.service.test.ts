import { EnvioCorreo } from '../../../src/application/services/envio-correo';
import {
  MENSAJE_REGISTRO,
  MENSAJE_VERIFICADO,
  RegistroVecinosService,
} from '../../../src/application/services/registro-vecinos.service';
import type { MensajeCorreo } from '../../../src/domain/notificaciones/enviador-correo';
import {
  correosPendientes,
  EnviadorEnMemoria,
  HasherFalso,
  MINUTO,
  PlantillasEnMemoria,
  RegistroVecinosEnMemoria,
  RelojFalso,
  RestablecimientosEnMemoria,
  TokensFalsos,
  TransaccionEnMemoria,
  type UsuarioFalso,
  UsuariosEnMemoria,
  usuario,
} from '../auth/dobles';

const HORA = 60 * MINUTO;

// Un enviador que tarda: permite comprobar que registrar no espera el correo.
class EnviadorLento extends EnviadorEnMemoria {
  liberar: () => void = () => {};

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    await new Promise<void>((resolver) => {
      this.liberar = resolver;
    });
    return super.enviar(mensaje);
  }
}

function crearEscenario(filas: UsuarioFalso[] = [], enviador = new EnviadorEnMemoria()) {
  const usuarios = new UsuariosEnMemoria(filas);
  const restablecimientos = new RestablecimientosEnMemoria();
  const errores: string[] = [];
  const reloj = new RelojFalso(new Date('2026-10-22T15:00:00.000Z'));
  const servicio = new RegistroVecinosService(
    new TransaccionEnMemoria({ usuarios, restablecimientos, registroVecinos: new RegistroVecinosEnMemoria(usuarios) }),
    new EnvioCorreo(new PlantillasEnMemoria(), enviador, (mensaje) => errores.push(mensaje)),
    new HasherFalso(),
    new TokensFalsos(),
    reloj,
    'http://localhost:5173',
  );
  return { servicio, usuarios, restablecimientos, enviador, errores, reloj };
}

const datos = {
  nombre: 'Ana López',
  dpi: '2547 12345 0101',
  email: 'Ana@Correo.GT',
  telefono: null,
  password: 'Clave-2026',
};

// Usuarios existentes para cada caso.
const verificado = (cambios: Partial<UsuarioFalso> = {}) =>
  usuario({ id: 1, email: 'ana@correo.gt', rol: 'vecino', dependenciaId: null, dpi: '9999999999999', ...cambios });
const pendiente = (cambios: Partial<UsuarioFalso> = {}) => verificado({ correoVerificado: false, ...cambios });

describe('RegistroVecinosService.registrar', () => {
  it('caso 1: crea el vecino sin verificar, con un enlace de 24 h, y envía verificacion_correo', async () => {
    const e = crearEscenario();

    await expect(e.servicio.registrar(datos)).resolves.toEqual({ mensaje: MENSAJE_REGISTRO });
    await correosPendientes();

    expect(e.usuarios.filas).toEqual([
      expect.objectContaining({
        nombre: 'Ana López',
        email: 'ana@correo.gt',
        dpi: '2547123450101',
        rol: 'vecino',
        activo: true,
        passwordHash: 'hash:Clave-2026',
        correoVerificado: false,
      }),
    ]);
    expect(e.restablecimientos.filas).toEqual([
      expect.objectContaining({ tipo: 'verificacion', expiraEn: new Date(e.reloj.actual.getTime() + 24 * HORA) }),
    ]);
    expect(e.enviador.enviados).toEqual([
      expect.objectContaining({
        para: 'ana@correo.gt',
        asunto: 'Verifica',
        texto: 'Ana López: http://localhost:5173/verificar?token=renovacion-1',
      }),
    ]);
  });

  it('caso 2: un registro pendiente se reemplaza y solo sirve el enlace nuevo', async () => {
    const e = crearEscenario([pendiente({ nombre: 'Nombre viejo', passwordHash: 'hash:Vieja-1', dpi: '2547123450101' })]);
    await e.restablecimientos.crear(1, 'sha:viejo', 'verificacion', e.reloj.actual);

    await e.servicio.registrar({ ...datos, nombre: 'Ana Nueva' });
    await correosPendientes();

    expect(e.usuarios.filas[0]).toMatchObject({ nombre: 'Ana Nueva', passwordHash: 'hash:Clave-2026', correoVerificado: false });
    expect(e.restablecimientos.filas.map((f) => [f.tokenHash, f.invalidadoEn !== null])).toEqual([
      ['sha:viejo', true],
      ['sha:renovacion-1', false],
    ]);
    expect(e.enviador.enviados[0].asunto).toBe('Verifica');
  });

  it.each([
    ['una cuenta verificada', verificado()],
    ['un vecino de ventanilla sin contraseña', pendiente({ passwordHash: null })],
    ['un usuario interno', verificado({ rol: 'tecnico', correoVerificado: false })],
  ])('caso 3: %s no se modifica y recibe cuenta_existente', async (_caso, existente) => {
    const e = crearEscenario([{ ...existente }]);
    const antes = JSON.stringify(e.usuarios.filas);

    await expect(e.servicio.registrar(datos)).resolves.toEqual({ mensaje: MENSAJE_REGISTRO });
    await correosPendientes();

    expect(JSON.stringify(e.usuarios.filas)).toBe(antes);
    expect(e.restablecimientos.filas).toEqual([]);
    expect(e.enviador.enviados).toEqual([expect.objectContaining({ para: 'ana@correo.gt', asunto: 'Ya existe' })]);
  });

  it('caso 4: el DPI es de otro usuario → no cambia nada y envía registro_no_completado al correo ingresado', async () => {
    const e = crearEscenario([verificado({ id: 7, email: 'otro@correo.gt', dpi: '2547123450101' })]);

    await expect(e.servicio.registrar(datos)).resolves.toEqual({ mensaje: MENSAJE_REGISTRO });
    await correosPendientes();

    expect(e.usuarios.filas).toHaveLength(1);
    expect(e.enviador.enviados).toEqual([expect.objectContaining({ para: 'ana@correo.gt', asunto: 'No completado' })]);
  });

  it('caso 4 también cuando el registro pendiente usa el DPI de otro', async () => {
    const e = crearEscenario([pendiente(), verificado({ id: 7, email: 'otro@correo.gt', dpi: '2547123450101' })]);

    await e.servicio.registrar(datos);
    await correosPendientes();

    expect(e.usuarios.filas[0].nombre).toBe('Ana Coordinadora');
    expect(e.enviador.enviados[0].asunto).toBe('No completado');
  });

  it('caso 5: el usuario del correo está inactivo → no cambia nada ni envía correo', async () => {
    const e = crearEscenario([verificado({ activo: false })]);

    await expect(e.servicio.registrar(datos)).resolves.toEqual({ mensaje: MENSAJE_REGISTRO });
    await correosPendientes();

    expect(e.enviador.enviados).toEqual([]);
    expect(e.restablecimientos.filas).toEqual([]);
  });

  it('responde antes de que termine el envío del correo', async () => {
    const enviador = new EnviadorLento();
    const e = crearEscenario([], enviador);

    await e.servicio.registrar(datos);
    expect(enviador.enviados).toEqual([]);

    enviador.liberar();
    await correosPendientes();
    expect(enviador.enviados).toHaveLength(1);
  });

  it('un fallo del enviador no se propaga y queda en el log sin el token', async () => {
    const e = crearEscenario();
    e.enviador.fallar = true;

    await expect(e.servicio.registrar(datos)).resolves.toEqual({ mensaje: MENSAJE_REGISTRO });
    await correosPendientes();

    expect(e.errores).toEqual([expect.stringContaining('verificacion_correo')]);
    expect(e.errores[0]).not.toContain('renovacion-1');
  });

  it('datos inválidos se rechazan con su código antes de buscar cuentas', async () => {
    const e = crearEscenario();

    await expect(e.servicio.registrar({ ...datos, dpi: '123' })).rejects.toMatchObject({ codigo: 'DPI_INVALIDO' });
    await expect(e.servicio.registrar({ ...datos, password: 'abcdefgh' })).rejects.toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'POLITICA_PASSWORD',
    });
    expect(e.usuarios.filas).toEqual([]);
  });
});

describe('RegistroVecinosService.verificar', () => {
  async function registrado() {
    const e = crearEscenario();
    await e.servicio.registrar(datos);
    return e;
  }

  it('con un token vigente marca el correo como verificado y consume el token', async () => {
    const e = await registrado();

    await expect(e.servicio.verificar('renovacion-1')).resolves.toEqual({ mensaje: MENSAJE_VERIFICADO });

    expect(e.usuarios.filas[0].correoVerificado).toBe(true);
    expect(e.restablecimientos.filas[0].usadoEn).toEqual(e.reloj.actual);
  });

  it('un token usado, vencido, inexistente o de un usuario inactivo → TOKEN_VERIFICACION_INVALIDO', async () => {
    const usado = await registrado();
    await usado.servicio.verificar('renovacion-1');
    await expect(usado.servicio.verificar('renovacion-1')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });

    const vencido = await registrado();
    vencido.reloj.avanzar(24 * HORA);
    await expect(vencido.servicio.verificar('renovacion-1')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });

    await expect(vencido.servicio.verificar('no-existe')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });

    const inactivo = await registrado();
    inactivo.usuarios.filas[0].activo = false;
    await expect(inactivo.servicio.verificar('renovacion-1')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
  });

  it('un token de otro tipo (recuperación o invitación) no sirve para verificar', async () => {
    const e = crearEscenario([pendiente()]);
    await e.restablecimientos.crear(1, 'sha:recuperar', 'recuperacion', e.reloj.actual);
    await e.restablecimientos.crear(1, 'sha:invitar', 'invitacion', e.reloj.actual);

    await expect(e.servicio.verificar('recuperar')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
    await expect(e.servicio.verificar('invitar')).rejects.toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
    expect(e.usuarios.filas[0].correoVerificado).toBe(false);
  });
});
