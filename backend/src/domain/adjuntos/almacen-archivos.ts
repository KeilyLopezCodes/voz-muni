// Puerto de almacenamiento de los adjuntos (SPEC 24). Todo acceso a los archivos pasa por aquí: hoy un adaptador
// de disco, mañana uno de S3, sin tocar los servicios. `Buffer` y `NodeJS.ReadableStream` son tipos de Node, no un
// paquete npm.
export interface AlmacenArchivos {
  // Devuelve la ruta relativa generada (UUID v4, sin el nombre ni la extensión del usuario).
  guardar(contenido: Buffer): Promise<string>;
  leer(ruta: string): Promise<NodeJS.ReadableStream>;
  // Idempotente: borrar una ruta que ya no existe no falla.
  borrar(ruta: string): Promise<void>;
}
