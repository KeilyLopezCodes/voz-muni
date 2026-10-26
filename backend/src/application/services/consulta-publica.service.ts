import {
  type ContactoConsulta,
  contactoCoincide,
  interpretarContacto,
  normalizarNumeroQueja,
  PATRON_NUMERO_QUEJA,
} from '../../domain/consulta/contacto-consulta';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { Clock } from '../../domain/health/clock';
import { motivoEsPublico } from '../../domain/linea-tiempo/visibilidad';
import type { ConsultaPublicaRepository } from '../../domain/repositories/consulta-publica-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export type ActorPublico = 'vecino' | 'municipalidad' | 'sistema';

export interface ConsultaPublicaDto {
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  categoria: string;
  zona: string; // solo el nombre de la zona, sin dirección ni coordenadas
  creadoEn: string; // ISO 8601 en UTC
  resueltoEn: string | null;
  cerradoEn: string | null;
  cierreAutomatico: boolean; // SPEC 33
  esperaRespuesta: boolean; // estado === 'en_espera'
  solucion: { descripcion: string; resueltaEn: string } | null; // SPEC 26, en resuelta o cerrada
  confirmacion: { venceEn: string; vencida: boolean } | null; // SPEC 27, solo en resuelta
  lineaTiempo: {
    ocurridoEn: string;
    actor: ActorPublico;
    estadoAnterior: EstadoTicket | null;
    estadoNuevo: EstadoTicket;
    motivo: string | null; // solo si motivoEsPublico (SPEC 28)
  }[];
  comentarios: {
    cuerpo: string;
    autor: Exclude<ActorPublico, 'sistema'>;
    creadoEn: string;
    editadoEn: string | null;
  }[];
}

export const MAX_EVENTOS_PUBLICOS = 200;
export const MAX_COMENTARIOS_PUBLICOS = 100;

// El mismo error para "no existe" y "el contacto no coincide": la respuesta nunca revela si un número existe.
const noEncontrada = () => new ErrorDeAplicacion('CONSULTA_NO_ENCONTRADA', 'No encontramos una queja con esos datos');

const iso = (fecha: Date | null) => (fecha ? fecha.toISOString() : null);

// Consulta pública del estado de una queja, sin sesión (RF-35, SPEC 37). Nunca devuelve datos personales (RNF-12):
// ni el nombre ni el contacto del solicitante, ni la dirección, las coordenadas, la dependencia, la prioridad, el
// técnico, los ids internos, los vencimientos o el escalamiento.
export class ConsultaPublicaService {
  constructor(
    private readonly consultas: ConsultaPublicaRepository,
    private readonly clock: Clock,
  ) {}

  async consultar(numero: string, contacto: string): Promise<ConsultaPublicaDto> {
    const normalizado = normalizarNumeroQueja(numero);
    if (!PATRON_NUMERO_QUEJA.test(normalizado)) {
      throw new ErrorDeAplicacion('VALIDACION', 'El número de queja debe tener la forma Q-AAAA-NNNNNN');
    }
    const datoDeContacto = this.contacto(contacto);
    const queja = await this.consultas.obtenerPorNumero(normalizado);
    if (!queja || !contactoCoincide(datoDeContacto, queja.solicitante)) {
      throw noEncontrada();
    }

    const [cambios, comentarios] = await Promise.all([
      this.consultas.cambiosDeEstado(queja.id, MAX_EVENTOS_PUBLICOS),
      this.consultas.comentariosPublicos(queja.id, MAX_COMENTARIOS_PUBLICOS),
    ]);
    // Como la vista pública de SPEC 28, sin nombres: el solicitante es "vecino" y cualquier otro usuario,
    // "municipalidad".
    const autor = (usuarioId: number) => (usuarioId === queja.solicitante.id ? 'vecino' : 'municipalidad');
    const resueltaOCerrada = queja.estado === 'resuelta' || queja.estado === 'cerrada';

    return {
      numero: queja.numero,
      titulo: queja.titulo,
      estado: queja.estado,
      categoria: queja.categoria,
      zona: queja.zona,
      creadoEn: queja.creadoEn.toISOString(),
      resueltoEn: iso(queja.resueltoEn),
      cerradoEn: iso(queja.cerradoEn),
      cierreAutomatico: queja.cierreAutomatico,
      esperaRespuesta: queja.estado === 'en_espera',
      solucion:
        resueltaOCerrada && queja.resolucion !== null && queja.resueltoEn !== null
          ? { descripcion: queja.resolucion, resueltaEn: queja.resueltoEn.toISOString() }
          : null,
      confirmacion:
        queja.estado === 'resuelta' && queja.confirmacionVenceEn !== null
          ? {
              venceEn: queja.confirmacionVenceEn.toISOString(),
              vencida: this.clock.now().getTime() > queja.confirmacionVenceEn.getTime(),
            }
          : null,
      lineaTiempo: cambios.map((c) => ({
        ocurridoEn: c.ocurridoEn.toISOString(),
        actor: c.usuarioId === null ? 'sistema' : autor(c.usuarioId),
        estadoAnterior: c.estadoAnterior,
        estadoNuevo: c.estadoNuevo,
        motivo: motivoEsPublico(c.estadoAnterior, c.estadoNuevo) ? c.motivo : null,
      })),
      comentarios: comentarios.map((c) => ({
        cuerpo: c.cuerpo,
        autor: autor(c.autorId),
        creadoEn: c.creadoEn.toISOString(),
        editadoEn: iso(c.editadoEn),
      })),
    };
  }

  // Un contacto mal formado es un 400 VALIDACION que no dice nada de la queja.
  private contacto(contacto: string): ContactoConsulta {
    try {
      return interpretarContacto(contacto);
    } catch (error) {
      if (error instanceof ReglaDeNegocioError) {
        throw new ErrorDeAplicacion('VALIDACION', error.message);
      }
      throw error;
    }
  }
}
