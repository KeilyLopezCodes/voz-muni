import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CLAVES_POLITICAS_SLA, type CategoriaSla, listarPoliticasSla, PRIORIDADES } from '../api/politicas-sla-api'
import { DialogoMatrizSla } from './DialogoMatrizSla'

const ZONA_HORARIA = 'America/Guatemala'

// Las activas sin SLA completo van primero: son los huecos que bloquearán el cálculo de vencimientos (RF-27).
// Dentro de cada grupo se respeta el orden por nombre del servidor.
const sinSla = (c: CategoriaSla) => c.categoria.activa && !c.completa

export function ordenarCategorias(categorias: readonly CategoriaSla[]): CategoriaSla[] {
  return [...categorias.filter(sinSla), ...categorias.filter((c) => !sinSla(c))]
}

// Pantalla /admin/sla (SPEC 29): la matriz de cada categoría y su edición. Solo el administrador llega aquí; el
// backend valida admin.catalogos en cada petición.
export function PoliticasSlaPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()
  const lista = useQuery({ queryKey: CLAVES_POLITICAS_SLA.lista, queryFn: listarPoliticasSla })
  const [editando, setEditando] = useState<CategoriaSla | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const categorias = ordenarCategorias(lista.data?.datos ?? [])
  const incompletas = categorias.filter(sinSla).length

  return (
    <Stack spacing={2}>
      <Box>
        <Button component={Link} to="/admin" startIcon={<ArrowBackRounded />} size="small">
          {t('sla.volver')}
        </Button>
      </Box>
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('sla.titulo')}
        </Typography>
        <Typography color="text.secondary">{t('sla.descripcion')}</Typography>
      </Box>

      {aviso && (
        <Alert severity="success" role="status" onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}
      {lista.isPending && <CircularProgress aria-label={t('sla.cargando')} />}
      {lista.isError && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void lista.refetch()}>
              {t('sla.reintentar')}
            </Button>
          }
        >
          {t('sla.errorCarga')}
        </Alert>
      )}
      {incompletas > 0 && (
        <Alert severity="warning" role="status">
          {t('sla.avisoIncompletas', { count: incompletas })}
        </Alert>
      )}
      {lista.isSuccess && categorias.length === 0 && <Typography color="text.secondary">{t('sla.vacio')}</Typography>}
      {categorias.length > 0 && <ListaCategorias categorias={categorias} onEditar={setEditando} />}

      {editando && (
        <DialogoMatrizSla
          key={editando.categoria.id}
          categoria={editando}
          onCancelar={() => setEditando(null)}
          onGuardado={(actualizada) => {
            setEditando(null)
            setAviso(t('sla.guardado', { categoria: actualizada.categoria.nombre }))
            void queryClient.invalidateQueries({ queryKey: CLAVES_POLITICAS_SLA.lista })
          }}
        />
      )}
    </Stack>
  )
}

function ListaCategorias({
  categorias,
  onEditar,
}: {
  categorias: CategoriaSla[]
  onEditar: (categoria: CategoriaSla) => void
}) {
  const { t } = useTranslation('admin')
  const theme = useTheme()
  const ancha = useMediaQuery(theme.breakpoints.up('md'))

  if (!ancha) {
    // En celular, cada categoría es una tarjeta.
    return (
      <Stack spacing={1.5} component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {categorias.map((c) => (
          <Paper key={c.categoria.id} component="li" variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="subtitle1" component="h2">
                {c.categoria.nombre}
              </Typography>
              <Marcas categoria={c} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {c.dependencia.nombre}
            </Typography>
            <Box sx={{ my: 1 }}>
              <Resumen categoria={c} />
            </Box>
            <Typography variant="caption" color="text.secondary" component="p">
              <Actualizacion categoria={c} />
            </Typography>
            <BotonEditar categoria={c} onEditar={onEditar} />
          </Paper>
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={t('sla.titulo')}>
        <TableHead>
          <TableRow>
            <TableCell>{t('sla.columnas.categoria')}</TableCell>
            <TableCell>{t('sla.columnas.dependencia')}</TableCell>
            <TableCell>{t('sla.columnas.plazos')}</TableCell>
            <TableCell>{t('sla.columnas.actualizacion')}</TableCell>
            <TableCell>
              <Box component="span" sx={visuallyHidden}>
                {t('sla.columnas.acciones')}
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {categorias.map((c) => (
            <TableRow key={c.categoria.id}>
              <TableCell>
                <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                  <span>{c.categoria.nombre}</span>
                  <Marcas categoria={c} />
                </Stack>
              </TableCell>
              <TableCell>{c.dependencia.nombre}</TableCell>
              <TableCell>
                <Resumen categoria={c} />
              </TableCell>
              <TableCell>
                <Actualizacion categoria={c} />
              </TableCell>
              <TableCell>
                <BotonEditar categoria={c} onEditar={onEditar} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

// Etiquetas de texto, no solo color (WCAG).
function Marcas({ categoria }: { categoria: CategoriaSla }) {
  const { t } = useTranslation('admin')
  return (
    <Stack direction="row" spacing={0.5}>
      {sinSla(categoria) && <Chip size="small" color="warning" label={t('sla.sinSla')} />}
      {!categoria.categoria.activa && <Chip size="small" variant="outlined" label={t('sla.inactiva')} />}
    </Stack>
  )
}

// "Urgente 2 / 24 h", de urgente a baja.
function Resumen({ categoria }: { categoria: CategoriaSla }) {
  const { t } = useTranslation(['admin', 'comun'])
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.25 }}>
      {[...PRIORIDADES].reverse().map((prioridad) => {
        const plazo = categoria.plazos.find((p) => p.prioridad === prioridad)
        return (
          <Box key={prioridad} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {t(`comun:prioridades.${prioridad}`)}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0 }}>
              {plazo
                ? t('admin:sla.plazo', { respuesta: plazo.horasRespuesta, resolucion: plazo.horasResolucion })
                : t('admin:sla.sinPlazo')}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

function Actualizacion({ categoria }: { categoria: CategoriaSla }) {
  const { t, i18n } = useTranslation('admin')
  if (categoria.actualizadoEn === null || categoria.actualizadoPor === null) {
    return <>{t('sla.nuncaEditada')}</>
  }
  const fecha = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: ZONA_HORARIA,
  }).format(new Date(categoria.actualizadoEn))
  return (
    <time dateTime={categoria.actualizadoEn}>
      {t('sla.actualizadoPor', { fecha, nombre: categoria.actualizadoPor.nombre })}
    </time>
  )
}

function BotonEditar({ categoria, onEditar }: { categoria: CategoriaSla; onEditar: (c: CategoriaSla) => void }) {
  const { t } = useTranslation('admin')
  return (
    <Button
      size="small"
      onClick={() => onEditar(categoria)}
      aria-label={t('sla.editarCategoria', { categoria: categoria.categoria.nombre })}
    >
      {t('sla.editar')}
    </Button>
  )
}
