import type { Plantilla } from '../notificaciones/plantilla';

export interface PlantillaRepository {
  // Se lee en cada envío: un cambio en la base aplica sin reiniciar.
  buscarPorClave(clave: string): Promise<Plantilla | null>;
}
