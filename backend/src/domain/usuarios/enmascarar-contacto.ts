// Contacto enmascarado: para respuestas que no deben revelarlo (SPEC 12) y para los logs (SPEC 34).

// a***@dominio.gt: primer carácter + *** + @dominio.
export function enmascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  return `${email.charAt(0)}***${email.slice(arroba)}`;
}

// ****0000: solo los 4 últimos dígitos.
export function enmascararTelefono(telefono: string): string {
  return `****${telefono.replace(/\D/g, '').slice(-4)}`;
}
