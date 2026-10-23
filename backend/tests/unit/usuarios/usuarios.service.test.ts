import { EnvioCorreo } from '../../../src/application/services/envio-correo';
import { UsuariosService } from '../../../src/application/services/usuarios.service';
import {
  correosPendientes,
  EnviadorEnMemoria,
  PlantillasEnMemoria,
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
} from '../auth/dobles';

const ADMIN_ID = 1;
const DOBLE_DPI = '2547 12345 0101';

function admin(cambios: Partial<UsuarioFalso> = {}): UsuarioFalso {
  return usuario({
    id: ADMIN_ID,
    nombre: 'Admin',
    email: 'admin@vozmuni.test',
    rol: 'administrador',
    dependenciaId: null,
    ...cambios,
  });
}

function crearEscenario(filas: UsuarioFalso[] = [admin()]) {
  const usuarios = new UsuariosEnMemoria(filas);
  const usuariosAdmin = new UsuariosAdminEnMemoria(usuarios);
  const sesiones = new SesionesEnMemoria();
  const restablecimientos = new RestablecimientosEnMemoria();
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const reloj = new RelojFalso(new Date('2026-10-22T15:00:00.000Z'));
  const servicio = new UsuariosService(
    usuariosAdmin,
    new TransaccionEnMemoria({ usuarios, usuariosAdmin, sesiones, restablecimientos, vecinos: new VecinosEnMemoria(usuarios) }),
    new EnvioCorreo(new PlantillasEnMemoria(), enviador, (mensaje) => errores.push(mensaje)),
    new TokensFalsos(),
    reloj,
    'http://localhost:5173',
  );
  return { servicio, usuarios, usuariosAdmin, sesiones, restablecimientos, enviador, errores, reloj };
}

const altaTecnico = {
  nombre: 'Tomás Técnico',
  email: 'tomas@vozmuni.test',
  dpi: DOBLE_DPI,
  telefono: null,
  rol: 'tecnico',
  dependenciaId: 4,
};

// Agrega un técnico ya creado, con una sesión activa.
async function conTecnico(e: ReturnType<typeof crearEscenario>) {
  const { usuario: tecnico } = await e.servicio.crear(altaTecnico);
  await e.sesiones.crear({ usuarioId: tecnico.id, tokenHash: 'sha:previa', expiraEn: new Date('2026-10-29T00:00:00Z') });
  return tecnico;
}

describe('UsuariosService.crear', () => {
  it('crea el usuario activo y sin contraseña, con un enlace de invitación de 24 h, y envía la invitación', async () => {
    const e = crearEscenario();

    const resultado = await e.servicio.crear(altaTecnico);

    expect(resultado).toEqual({
      usuario: {
        id: 2,
        nombre: 'Tomás Técnico',
        email: 'tomas@vozmuni.test',
        telefono: null,
        dpi: '2547123450101',
        rol: 'tecnico',
        dependenciaId: 4,
        activo: true,
        tienePassword: false,
        bloqueadoHasta: null,
      },
      invitacionEnviada: true,
    });
    expect(e.restablecimientos.filas).toEqual([
      expect.objectContaining({
        usuarioId: 2,
        tipo: 'invitacion',
        tokenHash: 'sha:renovacion-1',
        expiraEn: new Date('2026-10-23T15:00:00.000Z'),
      }),
    ]);
    expect(e.enviador.enviados).toEqual([
      {
        para: 'tomas@vozmuni.test',
        asunto: 'Invitación',
        texto: 'Tomás Técnico (tecnico): http://localhost:5173/restablecer?token=renovacion-1',
        html: '<a href="http://localhost:5173/restablecer?token=renovacion-1">Tomás Técnico</a>',
      },
    ]);
  });

  it('si el envío falla, responde invitacionEnviada: false y el usuario queda creado', async () => {
    const e = crearEscenario();
    e.enviador.fallar = true;

    const resultado = await e.servicio.crear(altaTecnico);

    expect(resultado.invitacionEnviada).toBe(false);
    expect(await e.usuariosAdmin.obtenerInterno(resultado.usuario.id)).not.toBeNull();
    expect(e.errores).toEqual([expect.stringContaining('invitacion_usuario')]);
    expect(e.errores[0]).not.toContain('renovacion-1');
  });

  it.each([
    [{ rol: 'vecino' }, 'ROL_NO_PERMITIDO'],
    [{ rol: 'root' }, 'ROL_NO_PERMITIDO'],
    [{ dependenciaId: null }, 'DEPENDENCIA_REQUERIDA'],
    [{ rol: 'supervisor' }, 'DEPENDENCIA_NO_PERMITIDA'],
    [{ dependenciaId: 99 }, 'DEPENDENCIA_INVALIDA'],
    [{ dpi: '12345' }, 'DPI_INVALIDO'],
    [{ email: 'ADMIN@vozmuni.test' }, 'EMAIL_DUPLICADO'],
  ])('rechaza %o con %s y no envía nada', async (cambios, codigo) => {
    const e = crearEscenario();

    await expect(e.servicio.crear({ ...altaTecnico, ...cambios })).rejects.toMatchObject({ codigo });
    expect(e.enviador.enviados).toEqual([]);
    expect(e.restablecimientos.filas).toEqual([]);
  });

  it('un DPI repetido responde DPI_DUPLICADO', async () => {
    const e = crearEscenario([admin({ dpi: '2547123450101' })]);

    await expect(e.servicio.crear(altaTecnico)).rejects.toMatchObject({ codigo: 'DPI_DUPLICADO' });
  });
});

describe('UsuariosService.actualizar', () => {
  it('cambiar el rol revoca las sesiones del usuario', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);

    const actualizado = await e.servicio.actualizar(ADMIN_ID, tecnico.id, { rol: 'supervisor', dependenciaId: null });

    expect(actualizado).toMatchObject({ rol: 'supervisor', dependenciaId: null });
    expect(e.sesiones.activasDe(tecnico.id)).toEqual([]);
  });

  it('cambiar la dependencia revoca las sesiones', async () => {
    const e = crearEscenario();
    e.usuariosAdmin.dependenciasActivas.add(5);
    const tecnico = await conTecnico(e);

    await e.servicio.actualizar(ADMIN_ID, tecnico.id, { dependenciaId: 5 });

    expect(e.sesiones.activasDe(tecnico.id)).toEqual([]);
  });

  it('cambiar solo el nombre o el teléfono no revoca las sesiones', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);

    const actualizado = await e.servicio.actualizar(ADMIN_ID, tecnico.id, { nombre: 'Tomás T.', telefono: '55551234' });

    expect(actualizado).toMatchObject({ nombre: 'Tomás T.', telefono: '55551234', rol: 'tecnico' });
    expect(e.sesiones.activasDe(tecnico.id)).toHaveLength(1);
  });

  it('valida la dependencia sobre el estado final', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);

    await expect(e.servicio.actualizar(ADMIN_ID, tecnico.id, { rol: 'supervisor' })).rejects.toMatchObject({
      codigo: 'DEPENDENCIA_NO_PERMITIDA',
    });
    await expect(e.servicio.actualizar(ADMIN_ID, tecnico.id, { dependenciaId: null })).rejects.toMatchObject({
      codigo: 'DEPENDENCIA_REQUERIDA',
    });
  });

  it('un administrador no puede quitarse el rol a sí mismo', async () => {
    const e = crearEscenario([admin(), admin({ id: 2, email: 'otro@vozmuni.test' })]);

    await expect(e.servicio.actualizar(ADMIN_ID, ADMIN_ID, { rol: 'supervisor' })).rejects.toMatchObject({
      codigo: 'OPERACION_SOBRE_SI_MISMO',
    });
    expect(e.usuarios.filas[0].rol).toBe('administrador');
  });

  it('quitar el rol al único administrador activo responde ULTIMO_ADMINISTRADOR', async () => {
    const e = crearEscenario([admin(), admin({ id: 2, email: 'inactivo@vozmuni.test', activo: false })]);

    await expect(e.servicio.actualizar(99, ADMIN_ID, { rol: 'supervisor' })).rejects.toMatchObject({
      codigo: 'ULTIMO_ADMINISTRADOR',
    });
    expect(e.usuariosAdmin.bloqueosDeConteo).toBe(1);
  });

  it('un id inexistente o de un vecino responde NO_ENCONTRADO', async () => {
    const e = crearEscenario([admin(), usuario({ id: 7, email: 'vecino@vozmuni.test', rol: 'vecino', dependenciaId: null })]);

    await expect(e.servicio.actualizar(ADMIN_ID, 7, { nombre: 'X' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    await expect(e.servicio.obtener(42)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });
});

describe('UsuariosService.desactivar / activar / desbloquear', () => {
  it('desactivar revoca las sesiones, invalida los enlaces y envía cuenta_desactivada', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);

    const desactivado = await e.servicio.desactivar(ADMIN_ID, tecnico.id);
    await correosPendientes();

    expect(desactivado.activo).toBe(false);
    expect(e.sesiones.activasDe(tecnico.id)).toEqual([]);
    expect(e.restablecimientos.filas.every((f) => f.invalidadoEn !== null)).toBe(true);
    expect(e.enviador.enviados.at(-1)).toMatchObject({ para: 'tomas@vozmuni.test', asunto: 'Desactivada' });
  });

  it('desactivar a un usuario ya inactivo no hace nada', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);
    await e.servicio.desactivar(ADMIN_ID, tecnico.id);
    await correosPendientes();
    const enviados = e.enviador.enviados.length;

    await expect(e.servicio.desactivar(ADMIN_ID, tecnico.id)).resolves.toMatchObject({ activo: false });
    await correosPendientes();

    expect(e.enviador.enviados).toHaveLength(enviados);
  });

  it('si el aviso de desactivación falla, la desactivación igual ocurre y queda en el log', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);
    e.enviador.fallar = true;

    await expect(e.servicio.desactivar(ADMIN_ID, tecnico.id)).resolves.toMatchObject({ activo: false });
    await correosPendientes();

    expect(e.errores).toEqual([expect.stringContaining('cuenta_desactivada')]);
  });

  it('un administrador no puede desactivarse a sí mismo', async () => {
    const e = crearEscenario([admin(), admin({ id: 2, email: 'otro@vozmuni.test' })]);

    await expect(e.servicio.desactivar(ADMIN_ID, ADMIN_ID)).rejects.toMatchObject({ codigo: 'OPERACION_SOBRE_SI_MISMO' });
  });

  it('desactivar al único administrador activo responde ULTIMO_ADMINISTRADOR', async () => {
    const e = crearEscenario();

    await expect(e.servicio.desactivar(99, ADMIN_ID)).rejects.toMatchObject({ codigo: 'ULTIMO_ADMINISTRADOR' });
    expect(e.usuarios.filas[0].activo).toBe(true);
  });

  it('con dos administradores, uno puede desactivar al otro', async () => {
    const e = crearEscenario([admin(), admin({ id: 2, email: 'otro@vozmuni.test' })]);

    await expect(e.servicio.desactivar(ADMIN_ID, 2)).resolves.toMatchObject({ activo: false });
  });

  it('reactivar no envía correo y es idempotente', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);
    await e.servicio.desactivar(ADMIN_ID, tecnico.id);
    await correosPendientes();
    const enviados = e.enviador.enviados.length;

    await expect(e.servicio.activar(tecnico.id)).resolves.toMatchObject({ activo: true });
    await expect(e.servicio.activar(tecnico.id)).resolves.toMatchObject({ activo: true });
    await correosPendientes();

    expect(e.enviador.enviados).toHaveLength(enviados);
  });

  it('desbloquear limpia intentos y bloqueo', async () => {
    const e = crearEscenario();
    const tecnico = await conTecnico(e);
    e.usuarios.filas[1].bloqueo = { intentosFallidos: 0, bloqueadoHasta: new Date('2026-10-22T15:10:00Z') };

    const desbloqueado = await e.servicio.desbloquear(tecnico.id);

    expect(desbloqueado.bloqueadoHasta).toBeNull();
    expect(e.usuarios.filas[1].bloqueo).toEqual({ intentosFallidos: 0, bloqueadoHasta: null });
  });
});
