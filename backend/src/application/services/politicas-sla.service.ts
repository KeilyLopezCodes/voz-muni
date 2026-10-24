import type { Clock } from '../../domain/health/clock';
import type { CategoriaConSla, PoliticaSlaRepository } from '../../domain/repositories/politica-sla-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { type PlazoSla, validarMatriz } from '../../domain/sla/politica-sla';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export interface CategoriaSlaDto extends Omit<CategoriaConSla, 'actualizadoEn'> {
  actualizadoEn: string | null; // ISO 8601 en UTC
}

const aDto = ({ actualizadoEn, ...resto }: CategoriaConSla): CategoriaSlaDto => ({
  ...resto,
  actualizadoEn: actualizadoEn ? actualizadoEn.toISOString() : null,
});

// Administración de la matriz de SLA por categoría (RF-26, RF-41, SPEC 29). Cambiar una política no toca los
// vencimientos ya calculados.
export class PoliticasSlaService {
  constructor(
    private readonly politicas: PoliticaSlaRepository,
    private readonly transaccion: Transaccion,
    private readonly clock: Clock,
  ) {}

  async listar(): Promise<{ datos: CategoriaSlaDto[] }> {
    return { datos: (await this.politicas.listarPorCategoria()).map(aDto) };
  }

  reemplazar(usuario: UsuarioAutenticado, categoriaId: number, plazos: PlazoSla[]): Promise<CategoriaSlaDto> {
    return conReglasDeNegocio(async () => {
      const matriz = validarMatriz(plazos);
      return this.transaccion.ejecutar(async ({ politicasSla }) => {
        if (!(await politicasSla.reemplazar(categoriaId, matriz, usuario.id, this.clock.now()))) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la categoría ${categoriaId}`);
        }
        return aDto((await politicasSla.obtenerCategoria(categoriaId))!);
      });
    });
  }
}
