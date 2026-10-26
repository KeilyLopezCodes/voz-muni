import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { lazy, Suspense, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatoNumero } from './formato'

// Recharts solo se descarga cuando se dibuja la primera gráfica (SPEC 43).
const BarrasRecharts = lazy(() => import('./BarrasRecharts'))

export interface DatoGrafica {
  clave: string
  etiqueta: string
  cantidad: number
}

interface Props {
  titulo: string
  descripcion: string
  datos: DatoGrafica[]
}

// Una gráfica de barras con su tabla equivalente ("Ver como tabla"), que muestra los mismos números (SPEC 43).
export function GraficaBarras({ titulo, descripcion, datos }: Props) {
  const { t } = useTranslation('reportes')
  const [comoTabla, setComoTabla] = useState(false)
  const idTitulo = useId()
  const idDescripcion = useId()

  return (
    <Card variant="outlined" component="section" aria-labelledby={idTitulo}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography id={idTitulo} variant="h6" component="h2">
            {titulo}
          </Typography>
          <Button size="small" onClick={() => setComoTabla((valor) => !valor)} aria-pressed={comoTabla}>
            {comoTabla ? t('graficas.verGrafica') : t('graficas.verTabla')}
          </Button>
        </Box>
        <Typography id={idDescripcion} variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {descripcion}
        </Typography>
        {comoTabla ? (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-labelledby={idTitulo}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('graficas.columnaNombre')}</TableCell>
                  <TableCell align="right">{t('graficas.columnaCantidad')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {datos.map((dato) => (
                  <TableRow key={dato.clave}>
                    <TableCell component="th" scope="row" sx={{ overflowWrap: 'anywhere' }}>
                      {dato.etiqueta}
                    </TableCell>
                    <TableCell align="right">{formatoNumero(dato.cantidad)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ) : (
          <Box role="img" aria-labelledby={idTitulo} aria-describedby={idDescripcion}>
            <Suspense fallback={<CircularProgress aria-label={t('graficas.cargando')} />}>
              <BarrasRecharts datos={datos} etiquetaValor={t('graficas.columnaCantidad')} />
            </Suspense>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
