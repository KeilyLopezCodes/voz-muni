import type { Request, Response } from 'express';
import type { ConsultaPublicaService } from '../../application/services/consulta-publica.service';
import { contactoConsultaSchema, numeroConsultaSchema } from '../validators/consulta-publica.validators';

// Solo traduce HTTP ↔ DTO. Sin sesión: el contacto del solicitante es la prueba de que la queja es suya (SPEC 37).
export class ConsultaPublicaController {
  constructor(private readonly consultas: ConsultaPublicaService) {}

  consultar = async (req: Request, res: Response): Promise<void> => {
    const { numero } = numeroConsultaSchema.parse(req.params);
    const { contacto } = contactoConsultaSchema.parse(req.query);
    res.status(200).json(await this.consultas.consultar(numero, contacto));
  };
}
