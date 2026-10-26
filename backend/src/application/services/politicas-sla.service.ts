import type { Clock } from '../../domain/health/clock';
import type { CategoriaConSla, PoliticaSlaRepository } from '../../domain/repositories/politica-sla-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { type PlazoSla, validarMatriz } from '../../domain/sla/politica-sla';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export interface CategoriaSlaDto {
  categoria: { id: number; nombre: string; activa: boolean };
  dependencia: { id: number; nombre: string };
  plazos: PlazoSla[];
  completa: boolean;
  actualizadoEn: string | null; // ISO 8601 en UTC
  actualizadoPor: { id: number; nombre: string } | null;
}

const aDto = ({ actualizadoEn, ...resto }: CategoriaConSla): CategoriaSlaDto => ({
  ...resto,
  actualizadoEn: actualizadoEn === null ? null : actualizadoEn.toISOString(),
});

// Administración de la matriz de SLA de cada categoría (RF-26, RF-41, SPEC 29). Solo guarda las horas: cambiar
// una política no toca tickets, y los vencimientos ya calculados no cambian.
export class PoliticasSlaService {
  constructor(
    private readonly politicas: Pick<PoliticaSlaRepository, 'listarPorCategoria'>,
    private readonly transaccion: Transaccion,
    private readonly clock: Clock,
  ) {}

  async listar(): Promise<{ datos: CategoriaSlaDto[] }> {
    return { datos: (await this.politicas.listarPorCategoria()).map(aDto) };
  }

  // Reemplaza la matriz completa de la categoría. Una categoría inactiva también se puede preparar.
  reemplazar(usuario: UsuarioAutenticado, categoriaId: number, plazos: PlazoSla[]): Promise<CategoriaSlaDto> {
    return conReglasDeNegocio(async () => {
      const matriz = validarMatriz(plazos);
      return this.transaccion.ejecutar(async ({ politicasSla }) => {
        if (!(await politicasSla.obtenerCategoria(categoriaId))) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la categoría ${categoriaId}`);
        }
        await politicasSla.reemplazar(categoriaId, matriz, usuario.id, this.clock.now());
        return aDto((await politicasSla.obtenerCategoria(categoriaId))!);
      });
    });
  }
}
