import { ACCIONES_BITACORA, type AccionBitacora, CLAVES_ACCIONES } from '../../domain/auditoria/acciones';
import { DIAS_POR_DEFECTO, rangoBitacora, sumarDias } from '../../domain/auditoria/consulta';
import type { DetalleBitacora } from '../../domain/auditoria/saneamiento';
import type { Rol } from '../../domain/auth/roles';
import { filtroBitacora } from '../../domain/autorizacion/alcance-bitacora';
import { fechaLocal } from '../../domain/calendario/plazo-confirmacion';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { Clock } from '../../domain/health/clock';
import type { BitacoraLecturaRepository, RegistroBitacora } from '../../domain/repositories/bitacora-lectura-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export const TAMANO_BITACORA_POR_DEFECTO = 50;

export interface ConsultaBitacora {
  desde?: string; // YYYY-MM-DD en America/Guatemala
  hasta?: string; // incluido
  acciones: readonly AccionBitacora[];
  entidad?: string;
  usuarioId?: number;
  numero?: string;
  cursor?: string;
  tamano?: number;
}

export interface RegistroBitacoraDto {
  id: number;
  creadoEn: string; // ISO 8601 en UTC
  accion: AccionBitacora;
  entidad: string;
  entidadId: string | null;
  ticketNumero: string | null;
  usuario: { id: number; nombre: string; rol: Rol } | null; // null = sistema
  dependencia: { id: number; nombre: string } | null;
  ip: string | null;
  detalle: DetalleBitacora; // ya saneado al escribir
}

// El cursor es el base64url de { creadoEn, id } del último registro de la página.
export function codificarCursor(registro: Pick<RegistroBitacora, 'creadoEn' | 'id'>): string {
  return Buffer.from(JSON.stringify({ creadoEn: registro.creadoEn.toISOString(), id: registro.id })).toString('base64url');
}

export function decodificarCursor(cursor: string): { creadoEn: Date; id: number } | null {
  try {
    const { creadoEn, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    const fecha = typeof creadoEn === 'string' ? new Date(creadoEn) : null;
    return fecha && !Number.isNaN(fecha.getTime()) && Number.isInteger(id) ? { creadoEn: fecha, id: id as number } : null;
  } catch {
    return null;
  }
}

// Consulta de la bitácora (RF-42, SPEC 41), de solo lectura, según el alcance de bitacora.ver: el coordinador ve su
// dependencia (sin las acciones globales) y el supervisor y el administrador, todo. Sin `desde` ni `hasta`, los
// últimos 7 días de Guatemala.
export class BitacoraService {
  constructor(
    private readonly bitacora: BitacoraLecturaRepository,
    private readonly clock: Clock,
  ) {}

  async consultar(
    usuario: UsuarioAutenticado,
    consulta: ConsultaBitacora,
  ): Promise<{ datos: RegistroBitacoraDto[]; siguienteCursor: string | null }> {
    const hasta = consulta.hasta ?? fechaLocal(this.clock.now());
    const desde = consulta.desde ?? sumarDias(hasta, -(DIAS_POR_DEFECTO - 1));
    const rango = this.rango(desde, hasta);
    const cursor = consulta.cursor === undefined ? null : decodificarCursor(consulta.cursor);
    if (consulta.cursor !== undefined && cursor === null) {
      throw new ErrorDeAplicacion('VALIDACION', 'El cursor no es válido');
    }
    const tamano = consulta.tamano ?? TAMANO_BITACORA_POR_DEFECTO;
    // Uno más para saber si hay otra página.
    const registros = await this.bitacora.consultar(filtroBitacora(usuario), {
      ...rango,
      acciones: consulta.acciones,
      entidad: consulta.entidad ?? null,
      usuarioId: consulta.usuarioId ?? null,
      numero: consulta.numero?.toUpperCase() ?? null,
      cursor,
      limite: tamano + 1,
    });
    const pagina = registros.slice(0, tamano);
    return {
      datos: pagina.map((r) => ({ ...r, creadoEn: r.creadoEn.toISOString() })),
      siguienteCursor: registros.length > tamano ? codificarCursor(pagina[pagina.length - 1]) : null,
    };
  }

  // Las acciones del catálogo con su entidad, para el filtro de la pantalla.
  acciones(): { datos: { accion: AccionBitacora; entidad: string }[] } {
    return { datos: CLAVES_ACCIONES.map((accion) => ({ accion, entidad: ACCIONES_BITACORA[accion].entidad })) };
  }

  private rango(desde: string, hasta: string) {
    try {
      return rangoBitacora(desde, hasta);
    } catch (error) {
      if (error instanceof ReglaDeNegocioError) {
        throw new ErrorDeAplicacion('VALIDACION', error.message);
      }
      throw error;
    }
  }
}
