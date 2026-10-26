import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Typography from '@mui/material/Typography'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { IndicadoresDeGrupo } from '../api/reportes-api'
import { formatoNumero } from './formato'

export type Columna =
  | 'nombre'
  | 'cantidad'
  | 'horasRespuesta'
  | 'horasResolucion'
  | 'cumplimientoRespuesta'
  | 'cumplimientoResolucion'
  | 'escaladas'

const COLUMNAS: readonly Columna[] = [
  'nombre',
  'cantidad',
  'horasRespuesta',
  'horasResolucion',
  'cumplimientoRespuesta',
  'cumplimientoResolucion',
  'escaladas',
]

const VALOR: Record<Columna, (fila: IndicadoresDeGrupo) => string | number | null> = {
  nombre: (f) => f.nombre,
  cantidad: (f) => f.cantidad,
  horasRespuesta: (f) => f.horasPromedioRespuesta,
  horasResolucion: (f) => f.horasPromedioResolucion,
  cumplimientoRespuesta: (f) => f.cumplimientoRespuesta.porcentaje,
  cumplimientoResolucion: (f) => f.cumplimientoResolucion.porcentaje,
  escaladas: (f) => f.escaladasAbiertas,
}

// Ordena por una columna; los null (sin datos) quedan siempre al final, en cualquier dirección.
export function ordenarFilas(filas: readonly IndicadoresDeGrupo[], columna: Columna, direccion: 'asc' | 'desc'): IndicadoresDeGrupo[] {
  const signo = direccion === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    const va = VALOR[columna](a)
    const vb = VALOR[columna](b)
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
    const comparacion = typeof va === 'string' ? va.localeCompare(String(vb), 'es') : va - (vb as number)
    return comparacion * signo
  })
}

interface Props {
  titulo: string
  filas: IndicadoresDeGrupo[]
}

// Indicadores por dependencia o por categoría (SPEC 43), ordenables por cualquier columna. En pantallas chicas la
// tabla se desplaza dentro de su contenedor, nunca la página.
export function TablaIndicadores({ titulo, filas }: Props) {
  const { t } = useTranslation('reportes')
  const idTitulo = useId()
  const [orden, setOrden] = useState<{ columna: Columna; direccion: 'asc' | 'desc' }>({ columna: 'cantidad', direccion: 'desc' })
  const ordenadas = useMemo(() => ordenarFilas(filas, orden.columna, orden.direccion), [filas, orden])
  const sinDato = t('sinDato')
  const horas = (valor: number | null) => (valor === null ? sinDato : formatoNumero(valor))
  const porcentaje = (valor: number | null) => (valor === null ? sinDato : t('porcentaje', { valor: formatoNumero(valor) }))

  const ordenarPor = (columna: Columna) =>
    setOrden((actual) =>
      actual.columna === columna
        ? { columna, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: columna === 'nombre' ? 'asc' : 'desc' },
    )

  return (
    <Card variant="outlined" component="section" aria-labelledby={idTitulo}>
      <CardContent>
        <Typography id={idTitulo} variant="h6" component="h2" gutterBottom>
          {titulo}
        </Typography>
        {filas.length === 0 ? (
          <Typography color="text.secondary">{t('tablas.vacia')}</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }} data-testid="contenedor-tabla">
            <Table size="small" aria-labelledby={idTitulo} sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  {COLUMNAS.map((columna) => (
                    <TableCell
                      key={columna}
                      align={columna === 'nombre' ? 'left' : 'right'}
                      sortDirection={orden.columna === columna ? orden.direccion : false}
                    >
                      <TableSortLabel
                        active={orden.columna === columna}
                        direction={orden.columna === columna ? orden.direccion : 'asc'}
                        onClick={() => ordenarPor(columna)}
                        aria-label={t('tablas.ordenarPor', { columna: t(`tablas.columnas.${columna}`) })}
                      >
                        {t(`tablas.columnas.${columna}`)}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {ordenadas.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell component="th" scope="row" sx={{ overflowWrap: 'anywhere' }}>
                      {fila.nombre}
                    </TableCell>
                    <TableCell align="right">{formatoNumero(fila.cantidad)}</TableCell>
                    <TableCell align="right">{horas(fila.horasPromedioRespuesta)}</TableCell>
                    <TableCell align="right">{horas(fila.horasPromedioResolucion)}</TableCell>
                    <TableCell align="right">{porcentaje(fila.cumplimientoRespuesta.porcentaje)}</TableCell>
                    <TableCell align="right">{porcentaje(fila.cumplimientoResolucion.porcentaje)}</TableCell>
                    <TableCell align="right">{formatoNumero(fila.escaladasAbiertas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
