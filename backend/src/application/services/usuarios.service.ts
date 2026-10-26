import { type TokenService, VIGENCIA_RESTABLECIMIENTO_MS } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioAdminRepository, UsuarioInterno } from '../../domain/repositories/usuario-admin-repository';
import {
  esRolInterno,
  normalizarDpi,
  type RolInterno,
  validarAsignacion,
  verificarProteccionAdmin,
} from '../../domain/usuarios/usuario-interno';
import type {
  DatosAltaUsuario,
  DatosEdicionUsuario,
  FiltroUsuariosDto,
  PaginaUsuarios,
  UsuarioCreadoDto,
  UsuarioInternoDto,
} from '../dto/usuario-interno.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { NotificadorCorreo } from './notificador-correo.service';

function aDto(usuario: UsuarioInterno): UsuarioInternoDto {
  return { ...usuario, bloqueadoHasta: usuario.bloqueadoHasta?.toISOString() ?? null };
}

function rolInterno(rol: string): RolInterno {
  if (!esRolInterno(rol)) {
    throw new ErrorDeAplicacion('ROL_NO_PERMITIDO', `El rol ${rol} no se asigna desde la administración de usuarios`);
  }
  return rol;
}

// Gestión de usuarios internos por el administrador (RF-04). Los usuarios nunca se borran.
export class UsuariosService {
  constructor(
    private readonly usuarios: UsuarioAdminRepository,
    private readonly transaccion: Transaccion,
    private readonly correo: NotificadorCorreo,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  async listar(filtro: FiltroUsuariosDto): Promise<PaginaUsuarios> {
    const { datos, total } = await this.usuarios.listar({
      ...filtro,
      rol: filtro.rol === undefined ? undefined : rolInterno(filtro.rol),
    });
    return { datos: datos.map(aDto), pagina: filtro.pagina, tamano: filtro.tamano, total };
  }

  async obtener(id: number): Promise<UsuarioInternoDto> {
    return aDto(await this.obtenerInterno(id));
  }

  // El usuario nace activo y sin contraseña; la define con el enlace de invitación (24 h).
  async crear(datos: DatosAltaUsuario): Promise<UsuarioCreadoDto> {
    return conReglasDeNegocio(async () => {
      const rol = rolInterno(datos.rol);
      validarAsignacion(rol, datos.dependenciaId);
      await this.exigirDependenciaActiva(datos.dependenciaId);
      const dpi = normalizarDpi(datos.dpi);

      const ahora = this.clock.now();
      const token = this.tokens.generarRenovacion();
      const { usuario, correoId } = await this.transaccion.ejecutar(async (repos) => {
        const creado = await repos.usuariosAdmin.crear({ ...datos, rol, dpi });
        await repos.restablecimientos.crear(creado.id, this.tokens.hashRenovacion(token), 'invitacion', ahora);
        // La invitación se encola en la misma transacción (SPEC 34), con el vencimiento del enlace.
        const id = await this.correo.encolar(
          'invitacion_usuario',
          { nombre: creado.nombre, rol: creado.rol, enlace: `${this.appUrl}/restablecer?token=${token}` },
          {
            para: creado.email,
            usuarioId: creado.id,
            expiraEn: new Date(ahora.getTime() + VIGENCIA_RESTABLECIMIENTO_MS.invitacion),
          },
          repos.correosSalientes,
        );
        return { usuario: creado, correoId: id };
      });

      // Se espera el primer intento para avisar al administrador si falló; el usuario ya quedó creado y el job de
      // correos lo reintenta.
      const invitacionEnviada = await this.correo.despacharYEsperar([correoId]);
      return { usuario: aDto(usuario), invitacionEnviada };
    });
  }

  // La regla de dependencia se valida sobre el estado final.
  async actualizar(actorId: number, id: number, cambios: DatosEdicionUsuario): Promise<UsuarioInternoDto> {
    return conReglasDeNegocio(async () => {
      const actual = await this.obtenerInterno(id);
      const rol = cambios.rol === undefined ? actual.rol : rolInterno(cambios.rol);
      const dependenciaId = cambios.dependenciaId === undefined ? actual.dependenciaId : cambios.dependenciaId;
      validarAsignacion(rol, dependenciaId);
      if (dependenciaId !== actual.dependenciaId) {
        await this.exigirDependenciaActiva(dependenciaId);
      }
      const cambiaAcceso = rol !== actual.rol || dependenciaId !== actual.dependenciaId;
      const ahora = this.clock.now();

      const actualizado = await this.transaccion.ejecutar(async (repos) => {
        if (rol !== actual.rol) {
          await this.protegerAdmins(repos.usuariosAdmin, actorId, actual, actual.activo && rol === 'administrador');
        }
        const resultado = await repos.usuariosAdmin.actualizar(id, {
          nombre: cambios.nombre,
          telefono: cambios.telefono,
          rol,
          dependenciaId,
        });
        // El próximo token debe reflejar el rol o la dependencia nuevos.
        if (cambiaAcceso) {
          await repos.sesiones.revocarTodasDelUsuario(id, ahora);
        }
        return resultado;
      });
      return aDto(actualizado);
    });
  }

  // Idempotente: si ya estaba inactivo no hace nada.
  async desactivar(actorId: number, id: number): Promise<UsuarioInternoDto> {
    return conReglasDeNegocio(async () => {
      const actual = await this.obtenerInterno(id);
      if (!actual.activo) {
        return aDto(actual);
      }
      const ahora = this.clock.now();
      const { desactivado, correoId } = await this.transaccion.ejecutar(async (repos) => {
        await this.protegerAdmins(repos.usuariosAdmin, actorId, actual, false);
        const resultado = await repos.usuariosAdmin.actualizar(id, { activo: false });
        await repos.sesiones.revocarTodasDelUsuario(id, ahora);
        await repos.restablecimientos.invalidarPendientes(id, ahora);
        const correo = await this.correo.encolar(
          'cuenta_desactivada',
          { nombre: resultado.nombre },
          { para: resultado.email, usuarioId: id },
          repos.correosSalientes,
        );
        return { desactivado: resultado, correoId: correo };
      });
      // La desactivación ya ocurrió: no depende del correo.
      await this.correo.despachar([correoId]);
      return aDto(desactivado);
    });
  }

  // Idempotente. No envía correo ni crea un enlace: sin contraseña, se usa "olvidé mi contraseña".
  async activar(id: number): Promise<UsuarioInternoDto> {
    const actual = await this.obtenerInterno(id);
    if (actual.activo) {
      return aDto(actual);
    }
    return aDto(await this.usuarios.actualizar(id, { activo: true }));
  }

  async desbloquear(id: number): Promise<UsuarioInternoDto> {
    await this.obtenerInterno(id);
    return aDto(await this.usuarios.actualizar(id, { desbloquear: true }));
  }

  private async obtenerInterno(id: number): Promise<UsuarioInterno> {
    const usuario = await this.usuarios.obtenerInterno(id);
    if (!usuario) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el usuario interno ${id}`);
    }
    return usuario;
  }

  private async exigirDependenciaActiva(dependenciaId: number | null): Promise<void> {
    if (dependenciaId !== null && !(await this.usuarios.dependenciaActiva(dependenciaId))) {
      throw new ErrorDeAplicacion('DEPENDENCIA_INVALIDA', `La dependencia ${dependenciaId} no existe o está inactiva`);
    }
  }

  // Solo cuenta (con FOR UPDATE) si la operación le quita a un administrador activo su condición.
  private async protegerAdmins(
    usuariosAdmin: UsuarioAdminRepository,
    actorId: number,
    objetivo: UsuarioInterno,
    quedaraAdminActivo: boolean,
  ): Promise<void> {
    const objetivoEsAdminActivo = objetivo.activo && objetivo.rol === 'administrador';
    if (!objetivoEsAdminActivo || quedaraAdminActivo) {
      return;
    }
    verificarProteccionAdmin({
      actorId,
      objetivoId: objetivo.id,
      objetivoEsAdminActivo,
      quedaraAdminActivo,
      adminsActivos: await usuariosAdmin.contarAdminsActivosParaActualizar(),
    });
  }
}
