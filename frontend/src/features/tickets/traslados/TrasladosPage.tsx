import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Pagination from '@mui/material/Pagination'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { antiguedad, fechaGuatemala } from '../antiguedad'
import {
  aprobarTraslado,
  CLAVES_TRASLADOS,
  ESTADOS_SOLICITUD,
  type EstadoSolicitud,
  listarTraslados,
  rechazarTraslado,
  type SolicitudTraslado,
  TAMANO_PAGINA,
} from '../api/traslados-api'

const MOTIVO_MAX = 1000

// Bandeja del supervisor (SPEC 21): aprobar devuelve la queja a revisión; rechazar exige motivo.
export function TrasladosPage() {
  const { t, i18n } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const [estado, setEstado] = useState<EstadoSolicitud>('pendiente')
  const [pagina, setPagina] = useState(1)
  const [aprobando, setAprobando] = useState<SolicitudTraslado | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const bandeja = useQuery({
    queryKey: [...CLAVES_TRASLADOS.bandeja, estado, pagina],
    queryFn: () => listarTraslados(estado, pagina),
  })
  const ahora = new Date()
  const paginas = bandeja.data ? Math.ceil(bandeja.data.total / TAMANO_PAGINA) : 0

  // Después de cualquier decisión, bien o con conflicto, la bandeja se recarga.
  const terminar = (mensaje: string) => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_TRASLADOS.bandeja })
    setAviso(mensaje)
  }
  const avisoDeError = (fallo: unknown): string => {
    if (fallo instanceof ApiError && fallo.codigo === 'TRASLADO_YA_RESUELTO') return t('traslados.avisos.yaResuelta')
    if (fallo instanceof ApiError && fallo.codigo === 'TRASLADO_SIN_EFECTO') return t('traslados.avisos.sinEfecto')
    return t(fallo instanceof ApiError && fallo.status === 0 ? 'traslados.errores.red' : 'traslados.errores.generico')
  }

  const aprobacion = useMutation({
    mutationFn: (id: number) => aprobarTraslado(id),
    onSuccess: () => terminar(t('traslados.avisos.aprobada')),
    onError: (fallo) => terminar(avisoDeError(fallo)),
  })
  const rechazo = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => rechazarTraslado(id, motivo),
    onSuccess: () => terminar(t('traslados.avisos.rechazada')),
    onError: (fallo) => terminar(avisoDeError(fallo)),
  })
  const enviando = aprobacion.isPending || rechazo.isPending

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('traslados.titulo')}
      </Typography>

      <Stack spacing={2}>
        <ToggleButtonGroup
          value={estado}
          exclusive
          size="small"
          aria-label={t('traslados.filtro.etiqueta')}
          onChange={(_evento, valor: EstadoSolicitud | null) => {
            if (valor) {
              setEstado(valor)
              setPagina(1)
            }
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          {ESTADOS_SOLICITUD.map((opcion) => (
            <ToggleButton key={opcion} value={opcion}>
              {t(`traslados.filtro.${opcion}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {bandeja.isPending && <CircularProgress aria-label={t('traslados.cargando')} />}
        {bandeja.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void bandeja.refetch()}>
                {t('traslados.reintentar')}
              </Button>
            }
          >
            {t('traslados.errorCarga')}
          </Alert>
        )}
        {bandeja.isSuccess && bandeja.data.datos.length === 0 && <Alert severity="info">{t('traslados.vacia')}</Alert>}

        {bandeja.data?.datos.map((solicitud) => (
          <Card key={solicitud.id} variant="outlined" component="article" aria-label={solicitud.ticket.numero}>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="overline">{solicitud.ticket.numero}</Typography>
                <Chip size="small" label={t(`traslados.estados.${solicitud.estado}`)} />
              </Stack>
              <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                {solicitud.ticket.titulo}
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 1, overflowWrap: 'anywhere' }}>
                <Typography variant="body2">
                  {t('traslados.origen', { dependencia: solicitud.dependenciaOrigen.nombre })}
                </Typography>
                <Typography variant="body2">
                  {solicitud.dependenciaSugerida
                    ? t('traslados.sugerida', { dependencia: solicitud.dependenciaSugerida.nombre })
                    : t('traslados.sinSugerencia')}
                </Typography>
                <Typography variant="body2">
                  {t('traslados.solicitadoPor', {
                    nombre: solicitud.solicitadoPor.nombre,
                    rol: t(`traslados.roles.${solicitud.solicitadoPor.rol}`),
                  })}{' '}
                  ·{' '}
                  <time dateTime={solicitud.creadoEn} title={fechaGuatemala(solicitud.creadoEn, i18n.language)}>
                    {antiguedad(solicitud.creadoEn, ahora, i18n.language)}
                  </time>
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                  {t('traslados.motivo', { motivo: solicitud.motivo })}
                </Typography>
                {solicitud.motivoResolucion && (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                    {t('traslados.motivoResolucion', { motivo: solicitud.motivoResolucion })}
                  </Typography>
                )}
              </Stack>
            </CardContent>
            {solicitud.estado === 'pendiente' && (
              <Decision
                enviando={enviando}
                onAprobar={() => setAprobando(solicitud)}
                onRechazar={(motivo) => rechazo.mutate({ id: solicitud.id, motivo })}
              />
            )}
          </Card>
        ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={pagina}
            onChange={(_evento, nueva) => setPagina(nueva)}
            aria-label={t('traslados.paginacion')}
          />
        )}
      </Stack>

      <Dialog open={aprobando !== null} onClose={() => setAprobando(null)}>
        <DialogTitle>{t('traslados.acciones.confirmarTitulo')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('traslados.acciones.confirmarTexto', { numero: aprobando?.ticket.numero ?? '' })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAprobando(null)}>{t('traslados.acciones.cancelar')}</Button>
          <Button
            onClick={() => {
              if (aprobando) aprobacion.mutate(aprobando.id)
              setAprobando(null)
            }}
          >
            {t('traslados.acciones.confirmar')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={aviso !== null} autoHideDuration={5000} onClose={() => setAviso(null)} message={aviso} />
    </>
  )
}

// Aprobar (con confirmación) o rechazar (con motivo obligatorio) una solicitud pendiente.
function Decision({
  enviando,
  onAprobar,
  onRechazar,
}: {
  enviando: boolean
  onAprobar: () => void
  onRechazar: (motivo: string) => void
}) {
  const { t } = useTranslation('tickets')
  const [rechazando, setRechazando] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ motivo: string }>({ defaultValues: { motivo: '' } })

  if (!rechazando) {
    return (
      <CardActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="contained" disabled={enviando} onClick={onAprobar}>
          {t('traslados.acciones.aprobar')}
        </Button>
        <Button color="error" disabled={enviando} onClick={() => setRechazando(true)}>
          {t('traslados.acciones.rechazar')}
        </Button>
      </CardActions>
    )
  }
  return (
    <Stack
      component="form"
      spacing={1}
      sx={{ p: 2, pt: 0 }}
      noValidate
      onSubmit={handleSubmit(({ motivo }) => onRechazar(motivo))}
    >
      <TextField
        {...register('motivo', {
          validate: (motivo) =>
            (motivo.trim() !== '' && [...motivo].length <= MOTIVO_MAX) || t('traslados.acciones.motivoRequerido'),
        })}
        label={t('traslados.acciones.motivoRechazo')}
        required
        multiline
        minRows={2}
        error={Boolean(errors.motivo)}
        helperText={errors.motivo?.message}
      />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Button type="submit" color="error" variant="contained" disabled={enviando}>
          {enviando ? t('traslados.acciones.enviando') : t('traslados.acciones.confirmarRechazo')}
        </Button>
        <Button onClick={() => setRechazando(false)}>{t('traslados.acciones.cancelar')}</Button>
      </Stack>
    </Stack>
  )
}
