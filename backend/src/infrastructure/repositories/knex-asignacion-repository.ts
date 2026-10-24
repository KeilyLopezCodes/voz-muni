import type { Knex } from 'knex';
import type { RegistroAsignacion, TecnicoCandidato } from '../../domain/asignacion/asignacion-tecnico';
import type { Rol } from '../../domain/auth/roles';
import {
  type AsignacionRepository,
  ESTADOS_ABIERTOS,
  type TecnicoConCarga,
} from '../../domain/repositories/asignacion-repository';

export class KnexAsignacionRepository implements AsignacionRepository {
  constructor(private readonly db: Knex) {}

  async obtenerCandidato(usuarioId: number): Promise<TecnicoCandidato | null> {
    // pg devuelve los bigint como string.
    const fila: { id: string; rol: Rol; activo: boolean; dependencia_id: string | null } | undefined = await this.db(
      'usuarios as u',
    )
      .join('roles as r', 'r.id', 'u.rol_id')
      .where('u.id', usuarioId)
      .first('u.id', 'r.nombre as rol', 'u.activo', 'u.dependencia_id');
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      rol: fila.rol,
      activo: fila.activo,
      dependenciaId: fila.dependencia_id === null ? null : Number(fila.dependencia_id),
    };
  }

  async registrar(registro: RegistroAsignacion): Promise<void> {
    await this.db('ticket_asignaciones').insert({
      ticket_id: registro.ticketId,
      tecnico_anterior: registro.tecnicoAnterior,
      tecnico_nuevo: registro.tecnicoNuevo,
      asignado_por: registro.asignadoPor,
      motivo: registro.motivo,
      creado_en: registro.creadoEn,
    });
  }

  // La carga usa el índice tickets (asignado_a, estado) de SPEC 03.
  async tecnicosConCarga(dependenciaId: number): Promise<TecnicoConCarga[]> {
    const filas: { id: string; nombre: string; carga: string }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .leftJoin('tickets as t', (on) =>
        on.on('t.asignado_a', 'u.id').onIn('t.estado', ESTADOS_ABIERTOS as unknown as string[]),
      )
      .where({ 'r.nombre': 'tecnico', 'u.activo': true, 'u.dependencia_id': dependenciaId })
      .groupBy('u.id', 'u.nombre')
      .select('u.id', 'u.nombre', this.db.raw('count(t.id) as carga'))
      .orderBy([{ column: 'carga' }, { column: 'u.nombre' }, { column: 'u.id' }]);
    return filas.map((fila) => ({ id: Number(fila.id), nombre: fila.nombre, carga: Number(fila.carga) }));
  }
}
