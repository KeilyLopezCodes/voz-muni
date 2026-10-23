import type { DetalleError } from '../../../shared/api/api-error'
import type { Paso } from './estado-registro'

// Errores del backend al registrar (SPEC 12 a 15) y dónde se muestran en el formulario (SPEC 18).
// Los mensajes viven en tickets.json: `nuevo.errores.<codigo>` en un campo, `nuevo.avisos.<aviso>` en el paso.

export type CampoConError = 'titulo' | 'descripcion' | 'zonaId' | 'direccion' | 'ubicacion'

// Efectos además de mostrar el error.
export type Efecto = 'recargarCategorias' | 'recargarLimites' | 'quitarUbicacion' | 'quitarSolicitante'

export type Aviso =
  | 'categoriaNoDisponible'
  | 'ubicacionNoConfigurada'
  | 'solicitanteInvalido'
  | 'vecinoDuplicado'
  | 'camposActualizados'
  | 'red'
  | 'generico'

export interface DestinoError {
  paso: Paso
  campo?: CampoConError // el mensaje es nuevo.errores.<codigo>
  camposExtra?: boolean // cada detalles[].campo en su input
  aviso?: Aviso
  efectos?: Efecto[]
}

const TABLA: Record<string, DestinoError> = {
  CATEGORIA_INVALIDA: { paso: 'categoria', aviso: 'categoriaNoDisponible', efectos: ['recargarCategorias'] },
  DATOS_EXTRA_INVALIDOS: { paso: 'categoria', camposExtra: true },
  TITULO_INVALIDO: { paso: 'descripcion', campo: 'titulo' },
  DESCRIPCION_INVALIDA: { paso: 'descripcion', campo: 'descripcion' },
  ZONA_INVALIDA: { paso: 'ubicacion', campo: 'zonaId' },
  DIRECCION_INVALIDA: { paso: 'ubicacion', campo: 'direccion' },
  UBICACION_FUERA_DEL_MUNICIPIO: { paso: 'ubicacion', campo: 'ubicacion' },
  UBICACION_INCOMPLETA: { paso: 'ubicacion', campo: 'ubicacion' },
  UBICACION_INVALIDA: { paso: 'ubicacion', campo: 'ubicacion' },
  // El municipio quitó su caja después de cargar el paso: el mapa se oculta y el punto se descarta.
  UBICACION_NO_CONFIGURADA: {
    paso: 'ubicacion',
    aviso: 'ubicacionNoConfigurada',
    efectos: ['recargarLimites', 'quitarUbicacion'],
  },
  SOLICITANTE_INVALIDO: { paso: 'solicitante', aviso: 'solicitanteInvalido', efectos: ['quitarSolicitante'] },
  // Alta de un vecino nuevo en ventanilla (POST /vecinos, SPEC 13).
  EMAIL_DUPLICADO: { paso: 'solicitante', aviso: 'vecinoDuplicado' },
  DPI_DUPLICADO: { paso: 'solicitante', aviso: 'vecinoDuplicado' },
  RED_NO_DISPONIBLE: { paso: 'resumen', aviso: 'red' },
  TIEMPO_AGOTADO: { paso: 'resumen', aviso: 'red' },
}

// Cualquier otro código queda en el resumen con un aviso general, sin perder los datos.
export function destinoDeError(codigo: string): DestinoError {
  return TABLA[codigo] ?? { paso: 'resumen', aviso: 'generico' }
}

// detalles[] de DATOS_EXTRA_INVALIDOS → nombre del campo del formulario y su problema.
export function camposExtraConError(detalles: DetalleError[]): { nombre: `datosExtra.${string}`; problema: string }[] {
  return detalles.map(({ campo, problema }) => ({ nombre: `datosExtra.${campo}`, problema }))
}
