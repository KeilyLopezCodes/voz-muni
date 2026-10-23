import type { Knex } from 'knex';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { RegistroTicketRepository, TicketCreado } from '../../domain/repositories/registro-ticket-repository';
import { anioGuatemala, formatearNumero, MAX_CORRELATIVO } from '../../domain/ticket/numero-ticket';
import type { TicketRegistrado } from '../../domain/ticket/ticket';

const CHECK_VIOLATION = '23514';

export class KnexRegistroTicketRepository implements RegistroTicketRepository {
  constructor(private readonly db: Knex) {}

  registrar({ datos, estado, historial }: TicketRegistrado): Promise<TicketCreado> {
    const creadoEn = historial.creadoEn;
    const anio = anioGuatemala(creadoEn);

    return this.db.transaction(async (trx) => {
      const numero = formatearNumero(anio, await this.siguienteCorrelativo(trx, anio));

      const [ticket] = await trx('tickets')
        .insert({
          numero,
          solicitante_id: datos.solicitanteId,
          registrado_por: datos.registradoPor,
          categoria_id: datos.categoriaId,
          zona_id: datos.zonaId,
          canal: datos.canal,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          direccion: datos.direccion,
          estado,
          creado_en: creadoEn,
          // dependencia, técnico, prioridad, ubicación y vencimientos se definen después (RF-10, RF-12, RF-26).
          datos_extra: '{}',
          escalado: false,
        })
        .returning('id');
      const id = Number(ticket.id);

      await trx('ticket_historial').insert({
        ticket_id: id,
        estado_anterior: historial.estadoAnterior,
        estado_nuevo: historial.estadoNuevo,
        usuario_id: historial.usuarioId,
        motivo: historial.motivo,
        creado_en: historial.creadoEn,
      });

      return { id, numero, creadoEn };
    });
  }

  // La fila del año queda bloqueada hasta el commit: dos registros simultáneos reciben números consecutivos,
  // y un rollback devuelve el número.
  private async siguienteCorrelativo(trx: Knex.Transaction, anio: number): Promise<number> {
    try {
      const resultado = await trx.raw(
        `INSERT INTO correlativos (anio, ultimo) VALUES (?, 1)
         ON CONFLICT (anio) DO UPDATE SET ultimo = correlativos.ultimo + 1
         RETURNING ultimo`,
        [anio],
      );
      return Number(resultado.rows[0].ultimo);
    } catch (error) {
      // El CHECK de correlativos.ultimo corta en 999999.
      if ((error as { code?: string }).code === CHECK_VIOLATION) {
        throw new ReglaDeNegocioError(
          'CORRELATIVO_AGOTADO',
          `Se agotaron los ${MAX_CORRELATIVO} números del año ${anio}`,
        );
      }
      throw error;
    }
  }
}
