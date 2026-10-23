import type { CampoExtra } from '../categorias/campo-extra';
import type { CategoriaFormulario } from './catalogo-lectura-repository';

// Edición de los campos adicionales de una categoría (SPEC 14). Se usa dentro de una Transaccion.
export interface CategoriaAdminRepository {
  // Bloquea la fila (FOR UPDATE) hasta el commit: no se registra una queja en medio del cambio. Incluye inactivas.
  obtenerParaActualizar(categoriaId: number): Promise<CategoriaFormulario | null>;
  // Al menos un ticket, en cualquier estado.
  tieneTickets(categoriaId: number): Promise<boolean>;
  guardarCampos(categoriaId: number, campos: CampoExtra[]): Promise<void>;
}
