import { calcularCambios } from '../../domain/auditoria/saneamiento';
import { validarDefinicion } from '../../domain/categorias/campo-extra';
import { cambiosIncompatibles } from '../../domain/categorias/compatibilidad';
import type { CategoriaFormulario } from '../../domain/repositories/catalogo-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

// Edición de los campos adicionales de una categoría por el administrador (RF-09, SPEC 14).
export class CamposExtraService {
  constructor(private readonly transaccion: Transaccion) {}

  // Reemplaza la lista completa. En una categoría con quejas, solo acepta cambios compatibles con los datos guardados.
  async actualizar(actorId: number, categoriaId: number, campos: unknown): Promise<CategoriaFormulario> {
    return conReglasDeNegocio(async () => {
      const definicion = validarDefinicion(campos);

      return this.transaccion.ejecutar(async (repos) => {
        // La fila queda bloqueada: el registro de una queja en esta categoría espera hasta el commit.
        const actual = await repos.categoriasAdmin.obtenerParaActualizar(categoriaId);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la categoría ${categoriaId}`);
        }
        if (await repos.categoriasAdmin.tieneTickets(categoriaId)) {
          const incompatibles = cambiosIncompatibles(actual.camposExtra, definicion);
          if (incompatibles.length > 0) {
            throw new ErrorDeAplicacion(
              'CAMBIO_INCOMPATIBLE',
              'La categoría tiene quejas y el cambio invalidaría sus datos guardados',
              incompatibles,
            );
          }
        }
        await repos.categoriasAdmin.guardarCampos(categoriaId, definicion);
        // Con la dependencia de la categoría; las claves antes y después, sin copiar cada definición (SPEC 41).
        const categoria = await repos.catalogosAdmin.categoria(categoriaId);
        await repos.auditoria.registrar({
          accion: 'categoria.campos_extra',
          entidadId: categoriaId,
          usuarioId: actorId,
          dependenciaId: categoria?.dependencia.id ?? null,
          cambios: calcularCambios(
            { campos: actual.camposExtra.map((c) => c.clave) },
            { campos: definicion.map((c) => c.clave) },
          ),
          datos: { cantidadCampos: definicion.length },
        });
        return { id: actual.id, nombre: actual.nombre, camposExtra: definicion };
      });
    });
  }
}
