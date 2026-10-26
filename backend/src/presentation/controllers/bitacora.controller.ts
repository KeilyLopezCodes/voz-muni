import type { Request, Response } from 'express';
import type { BitacoraService } from '../../application/services/bitacora.service';
import type { AccionBitacora } from '../../domain/auditoria/acciones';
import { consultaBitacoraSchema } from '../validators/bitacora.validators';

// Solo traduce HTTP ↔ DTO (SPEC 41). La bitácora es de solo lectura desde la API.
export class BitacoraController {
  constructor(private readonly bitacora: BitacoraService) {}

  consultar = async (req: Request, res: Response): Promise<void> => {
    const { accion, ...resto } = consultaBitacoraSchema.parse(req.query);
    res.status(200).json(await this.bitacora.consultar(req.usuario!, { ...resto, acciones: (accion ?? []) as AccionBitacora[] }));
  };

  acciones = (_req: Request, res: Response): void => {
    res.status(200).json(this.bitacora.acciones());
  };
}
