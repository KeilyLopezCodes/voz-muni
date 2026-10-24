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
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { CLAVES_REGISTRO, type CampoExtra, listarCategorias, type ValorExtra } from '../api/registro-api'
import {
  CLAVES_TRIAGE,
  type ComandoTriage,
  PRIORIDADES,
  type Prioridad,
  type TicketTriage,
  transicionar,
} from '../api/triage-api'

const MOTIVO_MAX = 1000

interface PanelTriageProps {
  ticket: TicketTriage | null
  onCerrar: () => void
  onTerminar: (aviso: string) => void // la acción terminó, bien o con conflicto: cierra y avisa
}

interface FormAceptar {
  prioridad: Prioridad | ''
  categoriaId: number
}

interface FormRechazar {
  motivo: string
}

// Detalle de una queja y las acciones del triage. En pantallas chicas ocupa todo el ancho; en las grandes,
// un panel lateral.
export function PanelTriage({ ticket, onCerrar, onTerminar }: PanelTriageProps) {
  const { t } = useTranslation('tickets')
  return (
    <Drawer
      anchor="right"
      open={ticket !== null}
      onClose={onCerrar}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 480 }, boxSizing: 'border-box' } }}
    >
      {ticket && (
        <Box sx={{ p: 2 }} role="region" aria-label={t('triage.panel.titulo', { numero: ticket.numero })}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h5" component="h2">
              {t('triage.panel.titulo', { numero: ticket.numero })}
            </Typography>
            <Button onClick={onCerrar}>{t('triage.panel.cerrar')}</Button>
          </Stack>
          {/* key: al cambiar de queja, los formularios empiezan de cero. */}
          <ContenidoPanel key={ticket.id} ticket={ticket} onTerminar={onTerminar} />
        </Box>
      )}
    </Drawer>
  )
}

function ContenidoPanel({ ticket, onTerminar }: { ticket: TicketTriage; onTerminar: (aviso: string) => void }) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const categorias = useQuery({ queryKey: CLAVES_REGISTRO.categorias, queryFn: listarCategorias })
  const [error, setError] = useState<string | null>(null)

  const accion = useMutation({
    mutationFn: ({ comando }: { comando: ComandoTriage; aviso: string }) => transicionar(ticket.id, comando),
    onMutate: () => setError(null),
    onSuccess: (_respuesta, { aviso }) => {
      void queryClient.invalidateQueries({ queryKey: CLAVES_TRIAGE.bandeja })
      onTerminar(aviso)
    },
    onError: (fallo) => {
      // Otra persona ya actuó (409) o la queja salió de la bandeja (404): se recarga y se cierra.
      if (fallo instanceof ApiError && (fallo.status === 409 || fallo.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: CLAVES_TRIAGE.bandeja })
        onTerminar(t('triage.avisos.conflicto'))
        return
      }
      if (fallo instanceof ApiError && fallo.codigo === 'CATEGORIA_INVALIDA') {
        void queryClient.invalidateQueries({ queryKey: CLAVES_REGISTRO.categorias })
        setError(t('triage.errores.CATEGORIA_INVALIDA'))
        return
      }
      setError(t(fallo instanceof ApiError && fallo.status === 0 ? 'triage.errores.red' : 'triage.errores.generico'))
    },
  })
  const ejecutar = (comando: ComandoTriage, aviso: string) => accion.mutate({ comando, aviso })

  const camposExtra = categorias.data?.find((categoria) => categoria.id === ticket.categoria.id)?.camposExtra ?? []

  return (
    <Stack spacing={2}>
      <Detalle ticket={ticket} camposExtra={camposExtra} />
      <Divider />
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {ticket.estado === 'nueva' ? (
        <Button
          variant="contained"
          disabled={accion.isPending}
          onClick={() => ejecutar({ accion: 'tomar' }, t('triage.avisos.tomada'))}
        >
          {accion.isPending ? t('triage.acciones.enviando') : t('triage.acciones.tomar')}
        </Button>
      ) : (
        <>
          <Aceptar ticket={ticket} enviando={accion.isPending} onAceptar={ejecutar} />
          <Divider />
          <Rechazar ticket={ticket} enviando={accion.isPending} onRechazar={ejecutar} />
        </>
      )}
    </Stack>
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

function Detalle({ ticket, camposExtra }: { ticket: TicketTriage; camposExtra: CampoExtra[] }) {
  const { t } = useTranslation('tickets')

  // Cada valor con la etiqueta de su campo; si el campo ya no existe en la categoría, con su clave.
  const valorLegible = (campo: CampoExtra | undefined, valor: ValorExtra): string => {
    if (typeof valor === 'boolean') return t(valor ? 'triage.panel.si' : 'triage.panel.no')
    if (campo?.tipo === 'seleccion') return campo.opciones.find((o) => o.valor === valor)?.etiqueta ?? String(valor)
    return String(valor)
  }
  const extras = Object.entries(ticket.datosExtra)

  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h3" sx={{ overflowWrap: 'anywhere' }}>
        {ticket.titulo}
      </Typography>
      <Dato etiqueta={t('triage.panel.descripcion')}>{ticket.descripcion}</Dato>
      <Dato etiqueta={t('triage.panel.categoria')}>{ticket.categoria.nombre}</Dato>
      <Dato etiqueta={t('triage.panel.zona')}>{ticket.zona.nombre}</Dato>
      <Dato etiqueta={t('triage.panel.direccion')}>{ticket.direccion}</Dato>
      <Dato etiqueta={t('triage.panel.ubicacion')}>
        {ticket.ubicacion ? `${ticket.ubicacion.lat}, ${ticket.ubicacion.lng}` : t('triage.panel.sinUbicacion')}
      </Dato>
      <Dato etiqueta={t('triage.panel.canal')}>{t(`triage.canales.${ticket.canal}`)}</Dato>
      <Dato etiqueta={t('triage.panel.solicitante')}>{ticket.solicitanteNombre}</Dato>
      {extras.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="h4">
            {t('triage.panel.datosExtra')}
          </Typography>
          {extras.map(([clave, valor]) => {
            const campo = camposExtra.find((c) => c.clave === clave)
            return (
              <Dato key={clave} etiqueta={campo?.etiqueta ?? clave}>
                {valorLegible(campo, valor)}
              </Dato>
            )
          })}
        </Box>
      )}
    </Stack>
  )
}

function Aceptar({
  ticket,
  enviando,
  onAceptar,
}: {
  ticket: TicketTriage
  enviando: boolean
  onAceptar: (comando: ComandoTriage, aviso: string) => void
}) {
  const { t } = useTranslation('tickets')
  const categorias = useQuery({ queryKey: CLAVES_REGISTRO.categorias, queryFn: listarCategorias })
  const { control, handleSubmit } = useForm<FormAceptar>({
    defaultValues: { prioridad: '', categoriaId: ticket.categoria.id },
  })
  const categoriaId = useWatch({ control, name: 'categoriaId' })
  const lista = categorias.data ?? []
  // La categoría actual puede no estar en la lista si se desactivó; se ofrece igual para no cambiarla sin querer.
  const opciones = lista.some((c) => c.id === ticket.categoria.id)
    ? lista
    : [{ id: ticket.categoria.id, nombre: ticket.categoria.nombre, dependencia: null }, ...lista]
  const dependencia = lista.find((c) => c.id === categoriaId)?.dependencia ?? null

  const aceptar = handleSubmit(({ prioridad, categoriaId: elegida }) => {
    const comando: ComandoTriage = {
      accion: 'aceptar',
      prioridad: prioridad as Prioridad,
      ...(elegida === ticket.categoria.id ? {} : { categoriaId: elegida }),
    }
    onAceptar(comando, t('triage.avisos.aceptada', { dependencia: dependencia?.nombre ?? '' }))
  })

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={aceptar}>
      <Controller
        control={control}
        name="prioridad"
        rules={{ validate: (valor) => valor !== '' || t('triage.acciones.prioridadRequerida') }}
        render={({ field, fieldState: { error } }) => (
          <TextField
            {...field}
            select
            id="triage-prioridad"
            label={t('triage.acciones.prioridad')}
            required
            error={Boolean(error)}
            helperText={error?.message}
          >
            {PRIORIDADES.map((prioridad) => (
              <MenuItem key={prioridad} value={prioridad}>
                {t(`triage.prioridades.${prioridad}`)}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        control={control}
        name="categoriaId"
        render={({ field }) => (
          <TextField
            {...field}
            select
            id="triage-categoria"
            label={t('triage.acciones.categoria')}
            helperText={dependencia ? t('triage.acciones.dependencia', { dependencia: dependencia.nombre }) : ' '}
            onChange={(evento) => field.onChange(Number(evento.target.value))}
          >
            {opciones.map((categoria) => (
              <MenuItem key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Button type="submit" variant="contained" disabled={enviando}>
        {enviando ? t('triage.acciones.enviando') : t('triage.acciones.aceptar')}
      </Button>
    </Stack>
  )
}

function Rechazar({
  ticket,
  enviando,
  onRechazar,
}: {
  ticket: TicketTriage
  enviando: boolean
  onRechazar: (comando: ComandoTriage, aviso: string) => void
}) {
  const { t } = useTranslation('tickets')
  const [confirmando, setConfirmando] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormRechazar>({ defaultValues: { motivo: '' } })

  const validarMotivo = (motivo: string) =>
    (motivo.trim() !== '' && [...motivo].length <= MOTIVO_MAX) || t('triage.acciones.motivoRequerido')

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(() => setConfirmando(true))}>
      <TextField
        {...register('motivo', { validate: validarMotivo })}
        id="triage-motivo"
        label={t('triage.acciones.motivo')}
        required
        multiline
        minRows={3}
        error={Boolean(errors.motivo)}
        helperText={errors.motivo?.message ?? t('triage.acciones.motivoAyuda')}
      />
      <Button type="submit" variant="outlined" color="error" disabled={enviando}>
        {t('triage.acciones.rechazar')}
      </Button>
      <Dialog open={confirmando} onClose={() => setConfirmando(false)}>
        <DialogTitle>{t('triage.acciones.confirmarTitulo')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('triage.acciones.confirmarTexto', { numero: ticket.numero })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmando(false)}>{t('triage.acciones.cancelar')}</Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmando(false)
              onRechazar({ accion: 'rechazar', motivo: getValues('motivo') }, t('triage.avisos.rechazada'))
            }}
          >
            {t('triage.acciones.confirmar')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
