import { validarPassword } from '../auth/politica-password';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { validarVecinoNuevo } from './vecino';

// Registro propio del vecino en el portal (RF-01, SPEC 16).
export interface DatosRegistroVecino {
  nombre: string;
  dpi: string;
  email: string;
  telefono: string | null;
  password: string;
}

// Normaliza y valida. Estas reglas pueden responder 400: no revelan nada sobre cuentas existentes.
export function validarRegistro(datos: DatosRegistroVecino): DatosRegistroVecino {
  if (typeof datos.email !== 'string' || datos.email.trim() === '') {
    throw new ReglaDeNegocioError('EMAIL_INVALIDO', 'El correo es obligatorio para registrarse');
  }
  // Mismas reglas de nombre, DPI, correo y teléfono que el alta en ventanilla (SPEC 13).
  const vecino = validarVecinoNuevo({ nombre: datos.nombre, dpi: datos.dpi, email: datos.email, telefono: datos.telefono });
  const motivo = validarPassword(datos.password);
  if (motivo) {
    throw new ReglaDeNegocioError('POLITICA_PASSWORD', motivo);
  }
  return { nombre: vecino.nombre, dpi: vecino.dpi, email: vecino.email!, telefono: vecino.telefono, password: datos.password };
}

// Lo que importa de un usuario existente para decidir el caso.
export interface UsuarioParaRegistro {
  id: number;
  rol: string;
  activo: boolean;
  tienePassword: boolean;
  verificado: boolean;
}

// Los 5 casos de la spec. La respuesta HTTP es la misma en todos; cambia la acción y el correo.
export type CasoRegistro =
  | 1 // correo y DPI nuevos: se crea el vecino y se envía verificacion_correo
  | 2 // registro pendiente del mismo correo: se reemplazan sus datos y se envía un enlace nuevo
  | 3 // el correo ya es de una cuenta (verificada, de ventanilla o interna): cuenta_existente
  | 4 // el DPI es de otro usuario: registro_no_completado al correo ingresado
  | 5; // el usuario del correo está inactivo: nada

// Pendiente = vecino que se registró solo (tiene contraseña) y todavía no verificó su correo.
export function esRegistroPendiente(usuario: UsuarioParaRegistro): boolean {
  return usuario.rol === 'vecino' && usuario.tienePassword && !usuario.verificado;
}

// `porCorreo` es el usuario con ese correo (sin distinguir mayúsculas), `porDpi` el usuario con ese DPI.
export function decidirCasoRegistro(
  porCorreo: UsuarioParaRegistro | null,
  porDpi: UsuarioParaRegistro | null,
): CasoRegistro {
  if (porCorreo) {
    if (!porCorreo.activo) {
      return 5;
    }
    if (!esRegistroPendiente(porCorreo)) {
      return 3;
    }
    return porDpi && porDpi.id !== porCorreo.id ? 4 : 2;
  }
  return porDpi ? 4 : 1;
}
