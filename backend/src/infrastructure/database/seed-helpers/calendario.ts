export interface Asueto {
  fecha: string; // 'AAAA-MM-DD'
  descripcion: string;
  mediodia: boolean; // true = asueto desde mediodía, el día sigue siendo hábil
}

export interface FilaCalendario {
  fecha: string; // 'AAAA-MM-DD'
  es_habil: boolean;
  descripcion: string | null;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Una fila por día entre `desde` y `hasta` (inclusive), calculada en UTC.
export function generarCalendario(desde: string, hasta: string, asuetos: readonly Asueto[]): FilaCalendario[] {
  const asuetosPorFecha = new Map(asuetos.map((asueto) => [asueto.fecha, asueto]));
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  const filas: FilaCalendario[] = [];

  for (let ms = Date.parse(`${desde}T00:00:00Z`); ms <= fin; ms += UN_DIA_MS) {
    const dia = new Date(ms);
    const fecha = dia.toISOString().slice(0, 10);
    const esFinDeSemana = dia.getUTCDay() === 0 || dia.getUTCDay() === 6;
    const asueto = asuetosPorFecha.get(fecha);

    if (asueto?.mediodia) {
      filas.push({ fecha, es_habil: true, descripcion: `${asueto.descripcion} (asueto desde mediodía)` });
    } else if (asueto) {
      filas.push({ fecha, es_habil: false, descripcion: asueto.descripcion });
    } else {
      filas.push({ fecha, es_habil: !esFinDeSemana, descripcion: null });
    }
  }

  return filas;
}
