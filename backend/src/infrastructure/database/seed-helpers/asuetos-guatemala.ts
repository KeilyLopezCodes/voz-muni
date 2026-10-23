import type { Asueto } from './calendario';

// Datos ficticios de desarrollo (SPEC 05). En producción el administrador carga el calendario oficial.
// Semana Santa va como fecha literal por año, sin calcular la Pascua.
export const ASUETOS_2026_2027: readonly Asueto[] = [
  { fecha: '2026-01-01', descripcion: 'Año Nuevo', mediodia: false },
  { fecha: '2026-04-02', descripcion: 'Jueves Santo', mediodia: false },
  { fecha: '2026-04-03', descripcion: 'Viernes Santo', mediodia: false },
  { fecha: '2026-04-04', descripcion: 'Sábado Santo', mediodia: false },
  { fecha: '2026-05-01', descripcion: 'Día del Trabajo', mediodia: false },
  { fecha: '2026-06-30', descripcion: 'Día del Ejército', mediodia: false },
  { fecha: '2026-09-15', descripcion: 'Día de la Independencia', mediodia: false },
  { fecha: '2026-10-20', descripcion: 'Día de la Revolución', mediodia: false },
  { fecha: '2026-11-01', descripcion: 'Día de Todos los Santos', mediodia: false },
  { fecha: '2026-12-24', descripcion: 'Nochebuena', mediodia: true },
  { fecha: '2026-12-25', descripcion: 'Navidad', mediodia: false },
  { fecha: '2026-12-31', descripcion: 'Fin de año', mediodia: true },

  { fecha: '2027-01-01', descripcion: 'Año Nuevo', mediodia: false },
  { fecha: '2027-03-25', descripcion: 'Jueves Santo', mediodia: false },
  { fecha: '2027-03-26', descripcion: 'Viernes Santo', mediodia: false },
  { fecha: '2027-03-27', descripcion: 'Sábado Santo', mediodia: false },
  { fecha: '2027-05-01', descripcion: 'Día del Trabajo', mediodia: false },
  { fecha: '2027-06-30', descripcion: 'Día del Ejército', mediodia: false },
  { fecha: '2027-09-15', descripcion: 'Día de la Independencia', mediodia: false },
  { fecha: '2027-10-20', descripcion: 'Día de la Revolución', mediodia: false },
  { fecha: '2027-11-01', descripcion: 'Día de Todos los Santos', mediodia: false },
  { fecha: '2027-12-24', descripcion: 'Nochebuena', mediodia: true },
  { fecha: '2027-12-25', descripcion: 'Navidad', mediodia: false },
  { fecha: '2027-12-31', descripcion: 'Fin de año', mediodia: true },
];
