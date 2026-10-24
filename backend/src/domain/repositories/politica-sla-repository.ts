import type { MatrizSla, PlazoSla } from '../sla/politica-sla';
import type { Prioridad } from '../ticket/prioridad';

export interface CategoriaConSla {
  categoria: { id: number; nombre: string; activa: boolean };
  dependencia: { id: number; nombre: string };
  plazos: PlazoSla[]; // las filas que existan, en el orden de PRIORIDADES
  completa: boolean; // tiene las 4 prioridades
  actualizadoEn: Date | null;
  actualizadoPor: { id: number; nombre: string } | null;
}

export interface PoliticaSlaRepository {
  listarPorCategoria(): Promise<CategoriaConSla[]>;
  obtenerCategoria(categoriaId: number): Promise<CategoriaConSla | null>;
  // Bloquea la categoría (FOR UPDATE) y hace upsert de las 4 filas. false si la categoría no existe.
  reemplazar(categoriaId: number, matriz: MatrizSla, usuarioId: number, ahora: Date): Promise<boolean>;
  // Plazo de una categoría y prioridad (SPEC 30). null si no hay política.
  obtenerPlazo(categoriaId: number, prioridad: Prioridad): Promise<PlazoSla | null>;
}
