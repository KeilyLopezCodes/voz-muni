import { validarPassword } from '../auth/politica-password';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { validarVecinoNuevo } from './vecino';

// Registro propio del vecino en el portal (RF-01, SPEC 16).
export interface DatosRegistro {
  nombre: string;
  dpi: string;
  email: string;
  telefono: string | null;
  password: string;
}

// Recorta y normaliza con las reglas de SPEC 13 (nombre, DPI, correo y teléfono) y aplica RNF-08 a la contraseña.
// A diferencia del alta en ventanilla, el correo es obligatorio: es el usuario de login y se verifica.
export function validarRegistro(datos: DatosRegistro): DatosRegistro {
  if (typeof datos.email !== 'string' || datos.email.trim() === '') {
    throw new ReglaDeNegocioError('EMAIL_INVALIDO', 'El correo es obligatorio');
  }
  const { nombre, dpi, email, telefono } = validarVecinoNuevo({
    nombre: datos.nombre,
    dpi: datos.dpi,
    email: datos.email,
    telefono: datos.telefono,
  });

  const motivo = validarPassword(datos.password);
  if (motivo !== null) {
    throw new ReglaDeNegocioError('POLITICA_PASSWORD', motivo);
  }
  return { nombre, dpi, email: email as string, telefono, password: datos.password };
}

// Lo que importa de un usuario existente para decidir el caso.
export interface UsuarioParaRegistro {
  id: number;
  rol: string;
  activo: boolean;
  tienePassword: boolean;
  verificado: boolean;
}

// Los 5 casos de la tabla de SPEC 16. La respuesta HTTP es la misma en todos; solo cambia la acción y el correo.
export type CasoRegistro =
  | { caso: 'nuevo' } // 1: crea el vecino y envía verificacion_correo
  | { caso: 'reemplazar_pendiente'; usuarioId: number } // 2: reemplaza el registro sin verificar y reenvía
  | { caso: 'cuenta_existente' } // 3: no cambia nada; envía cuenta_existente
  | { caso: 'dpi_ajeno' } // 4: no cambia nada; envía registro_no_completado
  | { caso: 'inactivo' }; // 5: no cambia nada ni envía correo

// Un registro pendiente es un vecino activo, con contraseña y sin verificar: nadie lo usó todavía.
export function esRegistroPendiente(usuario: UsuarioParaRegistro): boolean {
  return usuario.rol === 'vecino' && usuario.activo && usuario.tienePassword && !usuario.verificado;
}

// porCorreo: el usuario con lower(email) igual al ingresado; porDpi: el usuario con ese DPI.
export function decidirCasoRegistro(
  porCorreo: UsuarioParaRegistro | null,
  porDpi: UsuarioParaRegistro | null,
): CasoRegistro {
  if (porCorreo !== null && !porCorreo.activo) {
    return { caso: 'inactivo' };
  }
  const dpiDeOtro = porDpi !== null && porDpi.id !== porCorreo?.id;

  if (porCorreo !== null) {
    if (!esRegistroPendiente(porCorreo)) {
      return { caso: 'cuenta_existente' };
    }
    return dpiDeOtro ? { caso: 'dpi_ajeno' } : { caso: 'reemplazar_pendiente', usuarioId: porCorreo.id };
  }
  return dpiDeOtro ? { caso: 'dpi_ajeno' } : { caso: 'nuevo' };
}
