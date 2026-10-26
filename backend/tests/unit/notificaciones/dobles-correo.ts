import { DespachoCorreosService } from '../../../src/application/services/despacho-correos.service';
import { NotificadorCorreo } from '../../../src/application/services/notificador-correo.service';
import type { Clock } from '../../../src/domain/health/clock';
import type { EnviadorCorreo } from '../../../src/domain/notificaciones/enviador-correo';
import type { EstadoCorreo } from '../../../src/domain/notificaciones/correo-saliente';
import type {
  CorreoReclamado,
  CorreoSalienteRepository,
  NuevoCorreo,
} from '../../../src/domain/repositories/correo-saliente-repository';
import type { PlantillaRepository } from '../../../src/domain/repositories/plantilla-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';

export interface FilaCorreoEnMemoria extends CorreoReclamado {
  estado: EstadoCorreo;
  proximoIntentoEn: Date;
  ultimoError: string | null;
}

// La bandeja de salida en memoria (SPEC 34), para las pruebas unitarias de los casos de uso que envían correos.
export class CorreosEnMemoria implements CorreoSalienteRepository {
  readonly filas: FilaCorreoEnMemoria[] = [];

  async insertar(correo: NuevoCorreo): Promise<number> {
    const id = this.filas.length + 1;
    this.filas.push({ ...correo, id, intentos: 0, estado: 'pendiente', proximoIntentoEn: new Date(0), ultimoError: null });
    return id;
  }

  async reclamarPorId(ids: readonly number[]): Promise<CorreoReclamado[]> {
    return this.filas.filter((f) => ids.includes(f.id) && f.estado === 'pendiente').map((f) => ({ ...f }));
  }

  async reclamarVencidos(ahora: Date, limite: number): Promise<CorreoReclamado[]> {
    return this.filas
      .filter((f) => f.estado === 'pendiente' && f.proximoIntentoEn.getTime() <= ahora.getTime())
      .slice(0, limite)
      .map((f) => ({ ...f }));
  }

  async marcarEnviado(id: number): Promise<void> {
    const fila = this.fila(id);
    Object.assign(fila, { estado: 'enviado', intentos: fila.intentos + 1, texto: '', html: '' });
  }

  async marcarDescartado(id: number): Promise<void> {
    Object.assign(this.fila(id), { estado: 'descartado', texto: '', html: '' });
  }

  async registrarFallo(id: number, error: string, proximo: Date | null): Promise<void> {
    const fila = this.fila(id);
    fila.intentos += 1;
    fila.ultimoError = error;
    if (proximo === null) {
      Object.assign(fila, { estado: 'fallido', texto: '', html: '' });
    } else {
      fila.proximoIntentoEn = proximo;
    }
  }

  private fila(id: number): FilaCorreoEnMemoria {
    return this.filas.find((f) => f.id === id)!;
  }
}

// Por defecto el despacho corre en el instante 0: ningún enlace aparece vencido aunque el caso de uso use un reloj
// fijo. El descarte por vencimiento se prueba en tests/unit/notificaciones y en tests/db/correos-salientes.
const RELOJ_SIN_VENCIMIENTOS: Clock = { now: () => new Date(0) };

// Un NotificadorCorreo completo en memoria, con el primer intento sincrónico por defecto: las pruebas comprueban el
// enviador falso justo después del caso de uso, como antes de SPEC 34.
export function notificadorDePrueba(
  plantillas: PlantillaRepository,
  enviador: EnviadorCorreo,
  log: (mensaje: string) => void,
  {
    correos = new CorreosEnMemoria(),
    reloj = RELOJ_SIN_VENCIMIENTOS,
    despachoSincronico = true,
  }: { correos?: CorreosEnMemoria; reloj?: Clock; despachoSincronico?: boolean } = {},
): NotificadorCorreo {
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => trabajo({ correosSalientes: correos } as unknown as ReposTransaccionales),
  };
  const despacho = new DespachoCorreosService(transaccion, enviador, log);
  return new NotificadorCorreo(plantillas, correos, despacho, reloj, log, { despachoSincronico });
}
