import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { UseQueryResult } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export interface Columna<T> {
  titulo: string
  valor: (fila: T) => ReactNode
}

interface ListaCatalogoProps<T extends { id: number; nombre: string; activa: boolean }> {
  titulo: string
  descripcion: string
  textoNuevo: string
  onNuevo: () => void
  consulta: UseQueryResult<T[]>
  columnas: Columna<T>[] // además del nombre y el estado, que siempre van
  acciones: (fila: T) => ReactNode
  aviso: string | null
  onCerrarAviso: () => void
}

// El estado siempre con texto, no solo con color.
export function ChipEstado({ activa }: { activa: boolean }) {
  const { t } = useTranslation('admin')
  return (
    <Chip
      size="small"
      variant={activa ? 'filled' : 'outlined'}
      color={activa ? 'success' : 'default'}
      label={t(activa ? 'catalogos.activa' : 'catalogos.inactiva')}
    />
  )
}

// La pantalla común de los 3 catálogos (SPEC 40): volver al índice, título, "Mostrar inactivas" (apagado por
// defecto), "Nueva …" y la lista: una tabla desde sm, tarjetas en el celular, sin desbordar la página.
export function ListaCatalogo<T extends { id: number; nombre: string; activa: boolean }>({
  titulo,
  descripcion,
  textoNuevo,
  onNuevo,
  consulta,
  columnas,
  acciones,
  aviso,
  onCerrarAviso,
}: ListaCatalogoProps<T>) {
  const { t } = useTranslation('admin')
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [mostrarInactivas, setMostrarInactivas] = useState(false)
  const filas = (consulta.data ?? []).filter((fila) => mostrarInactivas || fila.activa)

  return (
    <Stack spacing={2}>
      <Box>
        <Button component={Link} to="/admin" startIcon={<ArrowBackRounded />} size="small">
          {t('catalogos.volver')}
        </Button>
      </Box>
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          {titulo}
        </Typography>
        <Typography color="text.secondary">{descripcion}</Typography>
      </Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <FormControlLabel
          control={<Switch checked={mostrarInactivas} onChange={(evento) => setMostrarInactivas(evento.target.checked)} />}
          label={t('catalogos.mostrarInactivas')}
        />
        <Button variant="contained" startIcon={<AddRounded />} onClick={onNuevo}>
          {textoNuevo}
        </Button>
      </Stack>

      {aviso && (
        <Alert severity="success" role="status" onClose={onCerrarAviso}>
          {aviso}
        </Alert>
      )}
      {consulta.isPending && <CircularProgress aria-label={t('catalogos.cargando')} />}
      {consulta.isError && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void consulta.refetch()}>
              {t('catalogos.reintentar')}
            </Button>
          }
        >
          {t('catalogos.errorCarga')}
        </Alert>
      )}
      {consulta.isSuccess && filas.length === 0 && <Typography color="text.secondary">{t('catalogos.vacio')}</Typography>}

      {filas.length > 0 &&
        (celular ? (
          <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {filas.map((fila) => (
              <Card component="li" variant="outlined" key={fila.id}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                    <Typography variant="subtitle1" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                      {fila.nombre}
                    </Typography>
                    <ChipEstado activa={fila.activa} />
                  </Stack>
                  <Box component="dl" sx={{ m: 0, mt: 1 }}>
                    {columnas.map((columna) => (
                      <Box key={columna.titulo} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Typography component="dt" variant="body2" color="text.secondary">
                          {columna.titulo}:
                        </Typography>
                        <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                          {columna.valor(fila)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
                    {acciones(fila)}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('catalogos.nombre')}</TableCell>
                  <TableCell>{t('catalogos.estado')}</TableCell>
                  {columnas.map((columna) => (
                    <TableCell key={columna.titulo}>{columna.titulo}</TableCell>
                  ))}
                  <TableCell>{t('catalogos.acciones')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell component="th" scope="row" sx={{ overflowWrap: 'anywhere' }}>
                      {fila.nombre}
                    </TableCell>
                    <TableCell>
                      <ChipEstado activa={fila.activa} />
                    </TableCell>
                    {columnas.map((columna) => (
                      <TableCell key={columna.titulo}>{columna.valor(fila)}</TableCell>
                    ))}
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                        {acciones(fila)}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
    </Stack>
  )
}
