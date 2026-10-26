import { AsyncLocalStorage } from 'node:async_hooks';
import type { ContextoSolicitud } from '../../domain/auditoria/contexto-solicitud';

// El contexto de solicitud con AsyncLocalStorage (SPEC 41). Si algún flujo asíncrono perdiera el contexto, ip()
// devuelve null y el registro se guarda igual, sin IP.
export class ContextoSolicitudAls implements ContextoSolicitud {
  private readonly almacen = new AsyncLocalStorage<{ ip: string | null }>();

  ip(): string | null {
    return this.almacen.getStore()?.ip ?? null;
  }

  ejecutar<T>(ip: string | null, trabajo: () => T): T {
    return this.almacen.run({ ip }, trabajo);
  }
}
