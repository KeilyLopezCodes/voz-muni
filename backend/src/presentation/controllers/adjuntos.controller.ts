import type { Request, Response } from 'express';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';
import type { AdjuntosService } from '../../application/services/adjuntos.service';
import { camposSubidaSchema, idAdjuntoSchema, idTicketSchema } from '../validators/adjuntos.validators';

// Las imágenes se muestran en el navegador; PDF y DOCX se descargan siempre, para que no se abran en el contexto
// de la app (SPEC 24).
const EN_LINEA = new Set(['image/jpeg', 'image/png']);

// filename para navegadores viejos (solo ASCII) y filename* en UTF-8 (RFC 5987).
function disposicion(tipo: 'inline' | 'attachment', nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

// Solo traduce HTTP ↔ DTO. Va después de autenticar.
export class AdjuntosController {
  constructor(private readonly adjuntos: AdjuntosService) {}

  subir = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    const { interno } = camposSubidaSchema.parse(req.body ?? {});
    const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (archivos.length === 0) {
      throw new ErrorDeAplicacion('VALIDACION', 'Hay que enviar de 1 a 5 archivos en el campo archivos');
    }
    const subidos = archivos.map((archivo) => ({ nombre: archivo.originalname, contenido: archivo.buffer }));
    res.status(201).json(await this.adjuntos.subir(req.usuario!, id, subidos, interno));
  };

  listar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    res.status(200).json(await this.adjuntos.listar(req.usuario!, id));
  };

  descargar = async (req: Request, res: Response): Promise<void> => {
    const { id, adjuntoId } = idAdjuntoSchema.parse(req.params);
    const descarga = await this.adjuntos.descargar(req.usuario!, id, adjuntoId);
    res.status(200);
    res.setHeader('Content-Type', descarga.mime);
    res.setHeader('Content-Length', String(descarga.tamanoBytes));
    res.setHeader('Content-Disposition', disposicion(EN_LINEA.has(descarga.mime) ? 'inline' : 'attachment', descarga.nombre));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    descarga.contenido.pipe(res);
  };

  borrar = async (req: Request, res: Response): Promise<void> => {
    const { id, adjuntoId } = idAdjuntoSchema.parse(req.params);
    await this.adjuntos.borrar(req.usuario!, id, adjuntoId);
    res.status(204).end();
  };
}
