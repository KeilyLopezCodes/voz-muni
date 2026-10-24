// Validación de archivos en el navegador (SPEC 24), copia de RNF-11. El backend vuelve a validar, y por
// contenido: aquí solo se miran la extensión y el tamaño para avisar antes de subir.

export const MAX_ARCHIVOS = 5
export const TAMANO_MAXIMO = 10 * 1024 * 1024
export const EXTENSIONES = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'] as const
export const ACEPTA = EXTENSIONES.join(',')

export type ProblemaArchivo = 'TIPO_NO_PERMITIDO' | 'MUY_GRANDE' | 'VACIO'

export function problemaArchivo(archivo: { name: string; size: number }): ProblemaArchivo | null {
  const nombre = archivo.name.toLowerCase()
  if (!EXTENSIONES.some((extension) => nombre.endsWith(extension))) return 'TIPO_NO_PERMITIDO'
  if (archivo.size === 0) return 'VACIO'
  if (archivo.size > TAMANO_MAXIMO) return 'MUY_GRANDE'
  return null
}

// "2,5 MB" o "830 KB", con el formato del idioma activo.
export function tamanoLegible(bytes: number, idioma: string): string {
  const formato = new Intl.NumberFormat(idioma, { maximumFractionDigits: 1 })
  return bytes >= 1024 * 1024 ? `${formato.format(bytes / (1024 * 1024))} MB` : `${formato.format(Math.max(1, bytes / 1024))} KB`
}

// Etiqueta corta del tipo, para mostrar junto al nombre.
export function etiquetaTipo(mimeONombre: string): string {
  const valor = mimeONombre.toLowerCase()
  if (valor.includes('pdf')) return 'PDF'
  if (valor.includes('png')) return 'PNG'
  if (valor.includes('jpeg') || valor.endsWith('.jpg')) return 'JPG'
  if (valor.includes('word') || valor.endsWith('.docx')) return 'DOCX'
  return '—'
}
