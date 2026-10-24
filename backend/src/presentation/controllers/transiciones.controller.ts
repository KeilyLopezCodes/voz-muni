import type { Request, Response } from 'express';
import type { ComandoAtencion } from '../../application/dto/atencion.dto';
import type { ComandoTriage } from '../../application/dto/triage.dto';
import type { AtencionService } from '../../application/services/atencion.service';
import type { TriageService } from '../../application/services/triage.service';
import { ALCANCES_ATENCION, esAccionAtencion } from '../../domain/atencion/acciones-atencion';
import { verificarPermiso } from '../middlewares/requiere-permiso';
import { bandejaAtencionSchema, idTicketSchema, transicionSchema } from '../validators/transiciones.validators';
import { bandejaTriageSchema } from '../validators/triage.validators';

const esComandoAtencion = (comando: ComandoTriage | ComandoAtencion): comando is ComandoAtencion =>
  esAccionAtencion(comando.accion);

// Solo traduce HTTP ↔ DTO. Va después de autenticar, que deja el usuario.
// /transiciones verifica el permiso según la acción (SPEC 22): las del triage piden tickets.triage, y las de
// atención tickets.cambiar_estado con un alcance de atención. Se valida antes de buscar el ticket, así un rol sin
// permiso recibe 403 sin saber si el ticket existe.
export class TransicionesController {
  constructor(
    private readonly triage: TriageService,
    private readonly atencion: AtencionService,
  ) {}

  transicionar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    const comando = transicionSchema.parse(req.body);
    if (esComandoAtencion(comando)) {
      verificarPermiso(req, 'tickets.cambiar_estado', ALCANCES_ATENCION);
      res.status(200).json(await this.atencion.transicionar(req.usuario!, id, comando));
      return;
    }
    verificarPermiso(req, 'tickets.triage');
    res.status(200).json(await this.triage.transicionar(req.usuario!, id, comando));
  };

  bandeja = async (req: Request, res: Response): Promise<void> => {
    const { estados, pagina, tamano } = bandejaTriageSchema.parse(req.query);
    res.status(200).json(await this.triage.listar(req.usuario!, estados, pagina, tamano));
  };

  bandejaAtencion = async (req: Request, res: Response): Promise<void> => {
    const { estados, pagina, tamano } = bandejaAtencionSchema.parse(req.query);
    res.status(200).json(await this.atencion.listar(req.usuario!, estados, pagina, tamano));
  };
}
