// Política de contraseña de RNF-08. La reutilizan el restablecimiento (RF-03), el registro (RF-01) y el alta de usuarios (RF-04).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export type MotivoPasswordInvalida = 'MUY_CORTA' | 'MUY_LARGA' | 'SIN_LETRA' | 'SIN_NUMERO';

const LETRA = /\p{L}/u; // incluye tildes y ñ
const NUMERO = /\p{Nd}/u;

// Devuelve null si cumple RNF-08, o el motivo si no. La longitud se mide en caracteres, sin recortar espacios.
export function validarPassword(password: string): MotivoPasswordInvalida | null {
  const longitud = [...password].length;
  if (longitud < PASSWORD_MIN) {
    return 'MUY_CORTA';
  }
  if (longitud > PASSWORD_MAX) {
    return 'MUY_LARGA';
  }
  if (!LETRA.test(password)) {
    return 'SIN_LETRA';
  }
  if (!NUMERO.test(password)) {
    return 'SIN_NUMERO';
  }
  return null;
}
