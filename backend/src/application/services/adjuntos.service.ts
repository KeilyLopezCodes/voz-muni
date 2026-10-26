import type { AlmacenArchivos } from '../../domain/adjuntos/almacen-archivos';
import type { InspectorDocx } from '../../domain/adjuntos/inspector-docx';
import {
  decidirOrigen,
  esBorrable,
  exigirBorrable,
  exigirCupo,
  exigirVisibilidad,
} from '../../domain/adjuntos/reglas-adjuntos';
import { validarArchivos } from '../../domain/adjuntos/tipo-archivo';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { Clock } from '../../domain/health/clock';
import type { AdjuntoLeido } from '../../domain/repositories/adjunto-repository';
import type { TicketLecturaRepository } from '../../domain/repositories/ticket-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { AdjuntoDto, ArchivoSubido, DescargaAdjunto } from '../dto/adjuntos.dto';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

// Adjuntos del registro y evidencias de la atención (RF-06, RF-20, SPEC 24). El acceso a la queja sale de
// tickets.ver (SPEC 11); los internos solo los ve quien tiene comentarios.interno. Todo archivo pasa por
// AlmacenArchivos.
export class AdjuntosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly tickets: TicketLecturaRepository,
    private readonly almacen: AlmacenArchivos,
    private readonly inspector: InspectorDocx,
    private readonly clock: Clock,
    private readonly registrarError: (mensaje: string) => void,
  ) {}

  // Todo o nada: si un archivo es inválido o no cabe, no se guarda ninguno, ni en la base ni en el disco.
  async subir(
    usuario: UsuarioAutenticado,
    ticketId: number,
    archivos: readonly ArchivoSubido[],
    internoSolicitado: boolean | undefined,
  ): Promise<{ adjuntos: AdjuntoDto[] }> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.ver');
    const escritas: string[] = [];
    try {
      return await conReglasDeNegocio(() =>
        this.transaccion.ejecutar(async ({ adjuntos, auditoria }) => {
          // FOR UPDATE: dos subidas a la vez no se saltan el cupo.
          const ticket = await adjuntos.ticketParaAdjuntar(ticketId, filtro);
          if (!ticket) {
            throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${ticketId}`);
          }
          const origen = decidirOrigen({
            estadoTicket: ticket.estado,
            usuarioId: usuario.id,
            solicitanteId: ticket.solicitanteId,
            registradoPor: ticket.registradoPor,
          });
          const interno = internoSolicitado ?? false;
          exigirVisibilidad(origen, ticket.estado, interno);
          // En la atención se sube con los mismos permisos que se comenta (SPEC 23).
          if (origen === 'atencion' && !usuario.permisos[interno ? 'comentarios.interno' : 'comentarios.publico']) {
            throw new ErrorDeAplicacion('PERMISO_DENEGADO', `El rol ${usuario.rol} no puede subir adjuntos así`);
          }
          exigirCupo(await adjuntos.contarPorOrigen(ticketId, origen), archivos.length);
          const validados = await validarArchivos(
            archivos.map((a) => ({ nombre: a.nombre, contenido: a.contenido })),
            this.inspector,
          );

          const ahora = this.clock.now();
          const ids: number[] = [];
          for (const [i, archivo] of archivos.entries()) {
            const ruta = await this.almacen.guardar(archivo.contenido);
            escritas.push(ruta);
            const id = await adjuntos.crear({
              ticketId,
              nombre: validados[i].nombre,
              ruta,
              mime: validados[i].mime,
              tamanoBytes: archivo.contenido.length,
              subidoPor: usuario.id,
              interno,
              origen,
              creadoEn: ahora,
            });
            ids.push(id);
            // Un registro por archivo (SPEC 42), con la dependencia de la queja.
            await auditoria.registrar({
              accion: 'adjunto.subir',
              entidadId: id,
              usuarioId: usuario.id,
              dependenciaId: ticket.dependenciaId,
              datos: {
                ticketId,
                nombre: validados[i].nombre,
                tipoMime: validados[i].mime,
                tamanoBytes: archivo.contenido.length,
                interno,
                origen,
              },
            });
          }
          const leidos = await adjuntos.listar(ticketId, true);
          return { adjuntos: leidos.filter((a) => ids.includes(a.id)).map((a) => this.aDto(a, usuario, ahora)) };
        }),
      );
    } catch (error) {
      // La transacción se revirtió: los archivos ya escritos no tienen fila y se borran.
      await Promise.all(escritas.map((ruta) => this.borrarArchivo(ruta)));
      throw error;
    }
  }

  async listar(usuario: UsuarioAutenticado, ticketId: number): Promise<{ datos: AdjuntoDto[] }> {
    await this.exigirTicketVisible(usuario, ticketId);
    const ahora = this.clock.now();
    const leidos = await this.transaccion.ejecutar(({ adjuntos }) =>
      adjuntos.listar(ticketId, this.veInternos(usuario)),
    );
    return { datos: leidos.map((a) => this.aDto(a, usuario, ahora)) };
  }

  // Un adjunto interno, para quien no tiene comentarios.interno, responde lo mismo que uno inexistente.
  async descargar(usuario: UsuarioAutenticado, ticketId: number, adjuntoId: number): Promise<DescargaAdjunto> {
    await this.exigirTicketVisible(usuario, ticketId);
    const adjunto = await this.transaccion.ejecutar(({ adjuntos }) =>
      adjuntos.obtener(ticketId, adjuntoId, this.veInternos(usuario)),
    );
    if (!adjunto) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el adjunto ${adjuntoId}`);
    }
    return {
      nombre: adjunto.nombre,
      mime: adjunto.mime,
      tamanoBytes: adjunto.tamanoBytes,
      contenido: await this.almacen.leer(adjunto.ruta),
    };
  }

  // Solo el autor, durante 5 minutos. Se borra la fila y después el archivo; si borrar el archivo falla, queda en
  // el log y la fila igual desaparece.
  async borrar(usuario: UsuarioAutenticado, ticketId: number, adjuntoId: number): Promise<void> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.ver');
    const ruta = await conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ adjuntos, auditoria }) => {
        const ticket = await adjuntos.ticketParaAdjuntar(ticketId, filtro);
        const adjunto = ticket ? await adjuntos.obtenerDelAutor(ticketId, adjuntoId, usuario.id) : null;
        if (!ticket || !adjunto) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el adjunto ${adjuntoId}`);
        }
        exigirBorrable(adjunto.creadoEn, this.clock.now());
        await adjuntos.borrar(adjunto.id);
        await auditoria.registrar({
          accion: 'adjunto.borrar',
          entidadId: adjunto.id,
          usuarioId: usuario.id,
          dependenciaId: ticket.dependenciaId,
          datos: { ticketId, nombre: adjunto.nombre, interno: adjunto.interno },
        });
        return adjunto.ruta;
      }),
    );
    await this.borrarArchivo(ruta);
  }

  private async exigirTicketVisible(usuario: UsuarioAutenticado, ticketId: number): Promise<void> {
    const ticket = await this.tickets.obtener(ticketId, filtroTicketsParaAccion(usuario, 'tickets.ver'));
    if (!ticket) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${ticketId}`);
    }
  }

  private veInternos(usuario: UsuarioAutenticado): boolean {
    return usuario.permisos['comentarios.interno'] !== undefined;
  }

  private async borrarArchivo(ruta: string): Promise<void> {
    try {
      await this.almacen.borrar(ruta);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.registrarError(`No se pudo borrar el archivo de adjunto ${ruta}: ${detalle}`);
    }
  }

  private aDto({ ruta: _ruta, ...adjunto }: AdjuntoLeido, usuario: UsuarioAutenticado, ahora: Date): AdjuntoDto {
    return {
      ...adjunto,
      creadoEn: adjunto.creadoEn.toISOString(),
      borrable: adjunto.subidoPor.id === usuario.id && esBorrable(adjunto.creadoEn, ahora),
    };
  }
}
