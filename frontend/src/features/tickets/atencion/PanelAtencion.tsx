import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import {
  CLAVES_ATENCION,
  type ComandoAtencion,
  type TicketAtencion,
  transicionarAtencion,
} from '../api/atencion-api'
import { HiloComentarios } from '../comentarios/HiloComentarios'
import { SeccionTraslado } from '../traslados/SeccionTraslado'

const MOTIVO_MAX = 1000
const DESCRIPCION_MAX = 4000

interface PanelAtencionProps {
  ticket: TicketAtencion | null
  onCerrar: () => void
  onTerminar: (aviso: string) => void // la acción terminó, bien o porque la queja cambió: cierra y avisa
}

// Detalle y acciones de atención según el estado (SPEC 22). En pantallas chicas ocupa todo el ancho; en las
// grandes, un panel lateral.
export function PanelAtencion({ ticket, onCerrar, onTerminar }: PanelAtencionProps) {
  const { t } = useTranslation('tickets')
  return (
    <Drawer
      anchor="right"
      open={ticket !== null}
      onClose={onCerrar}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 480 }, boxSizing: 'border-box' } }}
    >
      {ticket && (
        <Box sx={{ p: 2 }} role="region" aria-label={t('atencion.panel.titulo', { numero: ticket.numero })}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h5" component="h2">
              {t('atencion.panel.titulo', { numero: ticket.numero })}
            </Typography>
            <Button onClick={onCerrar}>{t('atencion.panel.cerrar')}</Button>
          </Stack>
          {/* key: al cambiar de queja, los formularios empiezan de cero. */}
          <ContenidoPanel key={ticket.id} ticket={ticket} onTerminar={onTerminar} />
        </Box>
      )}
    </Drawer>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="p">
        {etiqueta}
      </Typography>
      <Typography sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{children}</Typography>
    </Box>
  )
}

function ContenidoPanel({ ticket, onTerminar }: { ticket: TicketAtencion; onTerminar: (aviso: string) => void }) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const accion = useMutation({
    mutationFn: ({ comando }: { comando: ComandoAtencion; aviso: string }) => transicionarAtencion(ticket.id, comando),
    onMutate: () => setError(null),
    onSuccess: (_respuesta, { aviso }) => {
      void queryClient.invalidateQueries({ queryKey: CLAVES_ATENCION.bandeja })
      onTerminar(aviso)
    },
    onError: (fallo) => {
      // Otra persona ya cambió la queja (409) o salió del alcance (404): se recarga la bandeja y se cierra.
      if (fallo instanceof ApiError && (fallo.status === 409 || fallo.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: CLAVES_ATENCION.bandeja })
        onTerminar(t('atencion.avisos.cambioEstado'))
        return
      }
      setError(t(fallo instanceof ApiError && fallo.status === 0 ? 'atencion.errores.red' : 'atencion.errores.generico'))
    },
  })
  const ejecutar = (comando: ComandoAtencion, aviso: string) => accion.mutate({ comando, aviso })
  const enviando = accion.isPending
  // El traslado solo aplica desde asignada o en_proceso (SPEC 21), y si no hay uno pendiente.
  const puedeTrasladar = (ticket.estado === 'asignada' || ticket.estado === 'en_proceso') && !ticket.trasladoPendiente

  return (
    <Stack spacing={2}>
      <Stack spacing={1.5}>
        <Typography variant="h6" component="h3" sx={{ overflowWrap: 'anywhere' }}>
          {ticket.titulo}
        </Typography>
        <Dato etiqueta={t('atencion.panel.descripcion')}>{ticket.descripcion}</Dato>
        <Dato etiqueta={t('atencion.panel.categoria')}>{ticket.categoria.nombre}</Dato>
        <Dato etiqueta={t('atencion.panel.zona')}>{ticket.zona.nombre}</Dato>
        <Dato etiqueta={t('atencion.panel.direccion')}>{ticket.direccion}</Dato>
        <Dato etiqueta={t('atencion.panel.ubicacion')}>
          {ticket.ubicacion ? `${ticket.ubicacion.lat}, ${ticket.ubicacion.lng}` : t('atencion.panel.sinUbicacion')}
        </Dato>
        {Object.keys(ticket.datosExtra).length > 0 && (
          <Box>
            <Typography variant="subtitle2" component="h4">
              {t('atencion.panel.datosExtra')}
            </Typography>
            {/* Las etiquetas viven en la definición de la categoría, que el técnico no puede leer: se usa la clave. */}
            {Object.entries(ticket.datosExtra).map(([clave, valor]) => (
              <Dato key={clave} etiqueta={clave}>
                {typeof valor === 'boolean' ? t(valor ? 'atencion.panel.si' : 'atencion.panel.no') : String(valor)}
              </Dato>
            ))}
          </Box>
        )}
      </Stack>
      {ticket.estado === 'en_espera' && ticket.motivoEspera && (
        <Alert severity="info">{t('atencion.panel.informacionSolicitada', { motivo: ticket.motivoEspera })}</Alert>
      )}
      <Divider />
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      {ticket.estado === 'asignada' && (
        <Stack spacing={1}>
          <Button
            variant="contained"
            disabled={enviando || ticket.tecnico === null}
            onClick={() => ejecutar({ accion: 'iniciar' }, t('atencion.avisos.iniciada'))}
          >
            {t('atencion.acciones.iniciar')}
          </Button>
          {ticket.tecnico === null && <Alert severity="warning">{t('atencion.acciones.sinTecnico')}</Alert>}
        </Stack>
      )}
      {ticket.estado === 'en_proceso' && (
        <>
          <PonerEnEspera enviando={enviando} onEnviar={ejecutar} />
          <Divider />
          <Resolver numero={ticket.numero} enviando={enviando} onEnviar={ejecutar} />
        </>
      )}
      {ticket.estado === 'en_espera' && (
        <Button
          variant="contained"
          disabled={enviando}
          onClick={() => ejecutar({ accion: 'reanudar' }, t('atencion.avisos.reanudada'))}
        >
          {t('atencion.acciones.reanudar')}
        </Button>
      )}

      {puedeTrasladar && (
        <>
          <Divider />
          <SeccionTraslado
            ticket={{ id: ticket.id, numero: ticket.numero, dependenciaId: ticket.dependencia.id }}
            clavesBandeja={CLAVES_ATENCION.bandeja}
            onTerminar={onTerminar}
          />
        </>
      )}
      <Divider />
      <HiloComentarios ticketId={ticket.id} estadoTicket={ticket.estado} clavesBandeja={CLAVES_ATENCION.bandeja} />
    </Stack>
  )
}

type Enviar = (comando: ComandoAtencion, aviso: string) => void

function PonerEnEspera({ enviando, onEnviar }: { enviando: boolean; onEnviar: Enviar }) {
  const { t } = useTranslation('tickets')
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ motivo: string }>({ defaultValues: { motivo: '' } })

  return (
    <Stack
      component="form"
      spacing={1}
      noValidate
      aria-label={t('atencion.acciones.ponerEnEspera')}
      onSubmit={handleSubmit(({ motivo }) =>
        onEnviar({ accion: 'poner_en_espera', motivo }, t('atencion.avisos.enEspera')),
      )}
    >
      <TextField
        {...register('motivo', {
          validate: (motivo) =>
            (motivo.trim() !== '' && [...motivo].length <= MOTIVO_MAX) || t('atencion.acciones.motivoRequerido'),
        })}
        id="atencion-motivo"
        label={t('atencion.acciones.motivoEspera')}
        required
        multiline
        minRows={2}
        error={Boolean(errors.motivo)}
        helperText={errors.motivo?.message}
      />
      <Button type="submit" variant="outlined" disabled={enviando}>
        {t('atencion.acciones.confirmarEspera')}
      </Button>
    </Stack>
  )
}

function Resolver({ numero, enviando, onEnviar }: { numero: string; enviando: boolean; onEnviar: Enviar }) {
  const { t } = useTranslation('tickets')
  const [confirmando, setConfirmando] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<{ descripcion: string }>({ defaultValues: { descripcion: '' } })

  return (
    <Stack
      component="form"
      spacing={1}
      noValidate
      aria-label={t('atencion.acciones.resolver')}
      onSubmit={handleSubmit(() => setConfirmando(true))}
    >
      <TextField
        {...register('descripcion', {
          validate: (descripcion) =>
            (descripcion.trim() !== '' && [...descripcion].length <= DESCRIPCION_MAX) ||
            t('atencion.acciones.descripcionRequerida'),
        })}
        id="atencion-descripcion"
        label={t('atencion.acciones.descripcion')}
        required
        multiline
        minRows={3}
        error={Boolean(errors.descripcion)}
        helperText={errors.descripcion?.message}
      />
      <Button type="submit" variant="contained" color="success" disabled={enviando}>
        {enviando ? t('atencion.acciones.enviando') : t('atencion.acciones.resolver')}
      </Button>
      <Dialog open={confirmando} onClose={() => setConfirmando(false)}>
        <DialogTitle>{t('atencion.acciones.confirmarResolverTitulo')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('atencion.acciones.confirmarResolverTexto', { numero })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmando(false)}>{t('atencion.acciones.cancelar')}</Button>
          <Button
            color="success"
            onClick={() => {
              setConfirmando(false)
              onEnviar({ accion: 'resolver', descripcion: getValues('descripcion') }, t('atencion.avisos.resuelta'))
            }}
          >
            {t('atencion.acciones.confirmar')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
