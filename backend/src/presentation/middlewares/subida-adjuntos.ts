import multer from 'multer';
import { TAMANO_MAXIMO } from '../../domain/adjuntos/tipo-archivo';

export const MAX_ARCHIVOS_POR_PETICION = 5;

// Multipart de POST /tickets/:id/adjuntos (SPEC 24). En memoria, con límites: un archivo de más de 10 MB se corta
// sin terminar de leerse, y más de 5 archivos se rechazan. Los MulterError los traduce manejadorErrores.
// defParamCharset utf8: los nombres con tildes o ñ llegan bien (Multer usa latin1 por defecto).
export const subidaAdjuntos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO, files: MAX_ARCHIVOS_POR_PETICION },
  defParamCharset: 'utf8',
}).array('archivos', MAX_ARCHIVOS_POR_PETICION);
