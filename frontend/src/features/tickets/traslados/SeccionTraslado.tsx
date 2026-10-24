import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { useSession } from '../../../shared/auth/session'
import { CLAVES_TRASLADOS, type DatosSolicitudTraslado, listarDependencias, solicitarTraslado } from '../api/traslados-api'

const MOTIVO_MAX = 1000

interface FormTraslado {
  motivo: string
  dependenciaSugeridaId: number | ''
}

// Traslado a otra dependencia (SPEC 21). El coordinador solicita y el supervisor decide; el supervisor también
// traslada en el momento, con confirmación. En los dos casos la queja vuelve a revisión al aprobarse.
export interface TicketTrasladable {
  id: number
  numero: string
  dependenciaId: number // la actual, que no se ofrece como sugerida
}

export function SeccionTraslado({
  ticket,
  clavesBandeja,
  onTerminar,
}: {
  ticket: TicketTrasladable
  clavesBandeja: readonly unknown[] // la bandeja de la pantalla que la usa, para recargarla después
  onTerminar: (aviso: string) => void
}) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const session = useSession()
  const directo = session?.rol === 'supervisor'
  const [abierto, setAbierto] = useState(false)
  const [confirmando, setConfirmando] = useState<DatosSolicitudTraslado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dependencias = useQuery({
    queryKey: CLAVES_TRASLADOS.dependencias,
    queryFn: listarDependencias,
    enabled: abierto,
  })
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormTraslado>({ defaultValues: { motivo: '', dependenciaSugeridaId: '' } })

  const traslado = useMutation({
    mutationFn: (datos: DatosSolicitudTraslado) => solicitarTraslado(ticket.id, datos),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clavesBandeja })
      void queryClient.invalidateQueries({ queryKey: CLAVES_TRASLADOS.bandeja })
      onTerminar(t(directo ? 'traslados.panel.trasladada' : 'traslados.panel.solicitada'))
    },
    onError: (fallo) => {
      if (fallo instanceof ApiError && fallo.codigo === 'TRASLADO_PENDIENTE') {
        setError(t('traslados.panel.pendiente'))
        return
      }
      if (fallo instanceof ApiError && (fallo.codigo === 'TRANSICION_INVALIDA' || fallo.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: clavesBandeja })
        onTerminar(t('traslados.panel.cambioEstado'))
        return
      }
      setError(t(fallo instanceof ApiError && fallo.status === 0 ? 'traslados.errores.red' : 'traslados.errores.generico'))
    },
  })

  const accion = t(directo ? 'traslados.panel.trasladar' : 'traslados.panel.solicitar')
  if (!abierto) {
    return (
      <Button variant="outlined" onClick={() => setAbierto(true)}>
        {accion}
      </Button>
    )
  }

  // La dependencia actual no se ofrece: sugerirla sería la misma de origen.
  const opciones = (dependencias.data ?? []).filter((dependencia) => dependencia.id !== ticket.dependenciaId)
  const enviar = handleSubmit(({ motivo, dependenciaSugeridaId }) => {
    const datos: DatosSolicitudTraslado = {
      motivo,
      ...(dependenciaSugeridaId === '' ? {} : { dependenciaSugeridaId }),
    }
    if (directo) {
      setConfirmando(datos)
    } else {
      traslado.mutate(datos)
    }
  })

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={enviar} aria-label={accion}>
      <Typography variant="subtitle1" component="h3">
        {accion}
      </Typography>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <TextField
        {...register('motivo', {
          validate: (motivo) =>
            (motivo.trim() !== '' && [...motivo].length <= MOTIVO_MAX) || t('traslados.panel.motivoRequerido'),
        })}
        id="traslado-motivo"
        label={t('traslados.panel.motivo')}
        required
        multiline
        minRows={2}
        error={Boolean(errors.motivo)}
        helperText={errors.motivo?.message}
      />
      <Controller
        control={control}
        name="dependenciaSugeridaId"
        render={({ field }) => (
          <TextField
            {...field}
            select
            id="traslado-sugerida"
            label={t('traslados.panel.sugerida')}
            onChange={(evento) => field.onChange(evento.target.value === '' ? '' : Number(evento.target.value))}
          >
            <MenuItem value="">{t('traslados.panel.ninguna')}</MenuItem>
            {opciones.map((dependencia) => (
              <MenuItem key={dependencia.id} value={dependencia.id}>
                {dependencia.nombre}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" color="warning" disabled={traslado.isPending}>
          {directo ? t('traslados.panel.trasladar') : t('traslados.panel.enviar')}
        </Button>
        <Button onClick={() => setAbierto(false)}>{t('traslados.panel.cancelar')}</Button>
      </Stack>
      <Dialog open={confirmando !== null} onClose={() => setConfirmando(null)}>
        <DialogTitle>{t('traslados.panel.confirmarTitulo')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('traslados.panel.confirmarTexto', { numero: ticket.numero })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmando(null)}>{t('traslados.panel.cancelar')}</Button>
          <Button
            color="warning"
            onClick={() => {
              if (confirmando) traslado.mutate(confirmando)
              setConfirmando(null)
            }}
          >
            {t('traslados.panel.confirmar')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
