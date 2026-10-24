// ¿Este ZIP es un documento de Word? Leer el ZIP necesita una librería, que vive en infrastructure/ (SPEC 24);
// el dominio solo conoce esta interfaz.
export interface InspectorDocx {
  esDocx(contenido: Uint8Array): Promise<boolean>;
}
