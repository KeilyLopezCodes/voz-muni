import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import {
  asignarTecnico,
  CLAVES_ASIGNACION,
  type DatosAsignacion,
  listarTecnicos,
  type TicketPorAsignar,
} from '../api/asignacion-api'

const MOTIVO_MAX = 1000

interface PanelAsignacionProps {
  ticket: TicketPorAsignar | null
  onCerrar: () => void
  onTerminar: (aviso: string) => void // la acción terminó, bien o porque la queja cambió: cierra y avisa
}

interface FormAsignacion {
  tecnicoId: string // valor del radio
  motivo: string
}

// Elegir técnico para una queja. En pantallas chicas ocupa todo el ancho; en las grandes, un panel lateral.
export function PanelAsignacion({ ticket, onCerrar, onTerminar }: PanelAsignacionProps) {
  const { t } = useTranslation('tickets')
  return (
    <Drawer
      anchor="right"
      open={ticket !== null}
      onClose={onCerrar}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 480 }, boxSizing: 'border-box' } }}
    >
      {ticket && (
        <Box sx={{ p: 2 }} role="region" aria-label={t('asignacion.panel.titulo', { numero: ticket.numero })}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h5" component="h2">
              {t('asignacion.panel.titulo', { numero: ticket.numero })}
            </Typography>
            <Button onClick={onCerrar}>{t('asignacion.panel.cerrar')}</Button>
          </Stack>
          {/* key: al cambiar de queja, el formulario empieza de cero. */}
          <FormularioAsignacion key={ticket.id} ticket={ticket} onTerminar={onTerminar} />
        </Box>
      )}
    </Drawer>
  )
}

function FormularioAsignacion({ ticket, onTerminar }: { ticket: TicketPorAsignar; onTerminar: (aviso: string) => void }) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const claveTecnicos = CLAVES_ASIGNACION.tecnicos(ticket.dependencia.id)
  const tecnicos = useQuery({ queryKey: claveTecnicos, queryFn: () => listarTecnicos(ticket.dependencia.id) })
  const [error, setError] = useState<string | null>(null)
  const reasignar = ticket.tecnico !== null
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormAsignacion>({ defaultValues: { tecnicoId: '', motivo: '' } })

  const asignacion = useMutation({
    mutationFn: ({ datos }: { datos: DatosAsignacion; nombre: string }) => asignarTecnico(ticket.id, datos),
    onMutate: () => setError(null),
    onSuccess: (_respuesta, { nombre }) => {
      void queryClient.invalidateQueries({ queryKey: CLAVES_ASIGNACION.bandeja })
      void queryClient.invalidateQueries({ queryKey: claveTecnicos })
      onTerminar(t('asignacion.avisos.asignada', { nombre }))
    },
    onError: (fallo) => {
      if (fallo instanceof ApiError && fallo.codigo === 'TECNICO_NO_ELEGIBLE') {
        void queryClient.invalidateQueries({ queryKey: claveTecnicos })
        setError(t('asignacion.errores.TECNICO_NO_ELEGIBLE'))
        return
      }
      // La queja cambió de estado o salió del alcance: se recarga la bandeja y se cierra.
      if (fallo instanceof ApiError && (fallo.codigo === 'OPERACION_NO_PERMITIDA' || fallo.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: CLAVES_ASIGNACION.bandeja })
        onTerminar(t('asignacion.avisos.cambioEstado'))
        return
      }
      setError(t(fallo instanceof ApiError && fallo.status === 0 ? 'asignacion.errores.red' : 'asignacion.errores.generico'))
    },
  })

  const lista = tecnicos.data ?? []
  const enviar = handleSubmit(({ tecnicoId, motivo }) => {
    const elegido = lista.find((tecnico) => String(tecnico.id) === tecnicoId)
    if (!elegido) return
    asignacion.mutate({
      datos: { tecnicoId: elegido.id, ...(reasignar ? { motivo } : {}) },
      nombre: elegido.nombre,
    })
  })

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
      <Typography variant="h6" component="h3" sx={{ overflowWrap: 'anywhere' }}>
        {ticket.titulo}
      </Typography>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {tecnicos.isPending && <CircularProgress aria-label={t('asignacion.cargando')} />}
      {tecnicos.isError && (
        <Alert severity="error" role="alert">
          {t('asignacion.panel.errorTecnicos')}
        </Alert>
      )}
      {tecnicos.isSuccess && lista.length === 0 && (
        <Alert severity="warning">{t('asignacion.panel.sinTecnicos')}</Alert>
      )}
      {lista.length > 0 && (
        <Controller
          control={control}
          name="tecnicoId"
          rules={{ validate: (valor) => valor !== '' || t('asignacion.panel.tecnicoRequerido') }}
          render={({ field, fieldState: { error: errorCampo } }) => (
            <FormControl error={Boolean(errorCampo)}>
              <FormLabel id="asignacion-tecnicos">
                {t('asignacion.panel.tecnicos', { dependencia: ticket.dependencia.nombre })}
              </FormLabel>
              <RadioGroup {...field} aria-labelledby="asignacion-tecnicos">
                {lista.map((tecnico) => {
                  const actual = tecnico.id === ticket.tecnico?.id
                  const carga = t('asignacion.panel.carga', { count: tecnico.carga })
                  return (
                    <FormControlLabel
                      key={tecnico.id}
                      value={String(tecnico.id)}
                      control={<Radio />}
                      // El actual no se puede elegir: asignarlo de nuevo no cambia nada (TECNICO_SIN_CAMBIO).
                      disabled={actual}
                      label={`${tecnico.nombre} · ${carga}${actual ? ` · ${t('asignacion.panel.actual')}` : ''}`}
                      sx={{ overflowWrap: 'anywhere' }}
                    />
                  )
                })}
              </RadioGroup>
              {errorCampo && <FormHelperText>{errorCampo.message}</FormHelperText>}
            </FormControl>
          )}
        />
      )}
      {reasignar && (
        <TextField
          {...register('motivo', {
            validate: (motivo) =>
              (motivo.trim() !== '' && [...motivo].length <= MOTIVO_MAX) || t('asignacion.panel.motivoRequerido'),
          })}
          id="asignacion-motivo"
          label={t('asignacion.panel.motivo')}
          required
          multiline
          minRows={2}
          error={Boolean(errors.motivo)}
          helperText={errors.motivo?.message}
        />
      )}
      <Button type="submit" variant="contained" disabled={asignacion.isPending || lista.length === 0}>
        {asignacion.isPending
          ? t('asignacion.panel.enviando')
          : t(reasignar ? 'asignacion.panel.reasignar' : 'asignacion.panel.asignar')}
      </Button>
    </Stack>
  )
}
