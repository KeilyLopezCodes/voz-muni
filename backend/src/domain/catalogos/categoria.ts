import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Una categoría activa recibe quejas y las envía a su dependencia al aceptarlas (SPEC 19), con los plazos de su
// matriz de SLA (SPEC 29 y 30). Por eso solo se activa con la matriz completa y con su dependencia activa.
export function exigirActivable(slaCompleto: boolean, dependenciaActiva: boolean): void {
  exigirDependenciaActiva(dependenciaActiva);
  if (!slaCompleto) {
    throw new ReglaDeNegocioError('SLA_INCOMPLETO', 'Define los plazos de SLA de las 4 prioridades antes de activarla');
  }
}

// Crear o mover una categoría exige una dependencia activa.
export function exigirDependenciaActiva(activa: boolean): void {
  if (!activa) {
    throw new ReglaDeNegocioError('DEPENDENCIA_INACTIVA', 'La dependencia está inactiva');
  }
}
