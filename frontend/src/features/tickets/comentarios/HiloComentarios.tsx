import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type Ref, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import type { Rol } from '../../../shared/auth/roles'
import { useSession } from '../../../shared/auth/session'
import { antiguedad, fechaGuatemala } from '../antiguedad'
import {
  CLAVES_COMENTARIOS,
  comentar,
  type Comentario,
  type ComentarioCreado,
  CUERPO_MAX,
  editarComentario,
  listarComentarios,
} from '../api/comentarios-api'

// Roles con comentarios.interno en la matriz de SPEC 08. Solo decide si se muestra el selector: el backend
// sigue validando el permiso y filtra las notas en la consulta.
const ROLES_CON_NOTAS: readonly Rol[] = ['receptor', 'tecnico', 'coordinador', 'supervisor']
const ESTADOS_FINALES = ['rechazada', 'cerrada']

const largo = (texto: string) => [...texto].length

interface HiloComentariosProps {
  ticketId: number
  estadoTicket: string
  clavesBandeja: readonly unknown[] // la bandeja del panel, para recargarla si el comentario cambió el estado
  nivelTitulo?: 'h2' | 'h3'
  campoRef?: Ref<HTMLTextAreaElement> // la caja de texto, para llevarle el foco desde "Responder" (SPEC 25)
  onComentado?: (respuesta: ComentarioCreado) => void
}

// Comentarios públicos y notas internas de una queja (SPEC 23), al pie de los paneles internos y en el detalle
// del vecino (SPEC 25). Quien no tiene comentarios.interno (el vecino) no ve el selector de nota interna.
export function HiloComentarios({
  ticketId,
  estadoTicket,
  clavesBandeja,
  nivelTitulo = 'h3',
  campoRef,
  onComentado,
}: HiloComentariosProps) {
  const { t, i18n } = useTranslation('tickets')
  const session = useSession()
  const hilo = useQuery({ queryKey: CLAVES_COMENTARIOS.hilo(ticketId), queryFn: () => listarComentarios(ticketId) })
  const ahora = new Date()

  return (
    <Stack spacing={2} component="section" aria-label={t('comentarios.titulo')}>
      <Typography variant="subtitle1" component={nivelTitulo}>
        {t('comentarios.titulo')}
      </Typography>
      {hilo.isPending && <CircularProgress aria-label={t('comentarios.cargando')} />}
      {hilo.isError && <Alert severity="error">{t('comentarios.errorCarga')}</Alert>}
      {hilo.isSuccess && hilo.data.datos.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('comentarios.vacio')}
        </Typography>
      )}
      {hilo.data?.datos.map((comentario) => (
        <ItemComentario
          key={comentario.id}
          ticketId={ticketId}
          comentario={comentario}
          antiguedad={antiguedad(comentario.creadoEn, ahora, i18n.language)}
          fecha={fechaGuatemala(comentario.creadoEn, i18n.language)}
        />
      ))}
      <CajaComentario
        ticketId={ticketId}
        estadoTicket={estadoTicket}
        clavesBandeja={clavesBandeja}
        puedeNotas={session !== null && ROLES_CON_NOTAS.includes(session.rol)}
        campoRef={campoRef}
        onComentado={onComentado}
      />
    </Stack>
  )
}

function ItemComentario({
  ticketId,
  comentario,
  antiguedad,
  fecha,
}: {
  ticketId: number
  comentario: Comentario
  antiguedad: string
  fecha: string
}) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(comentario.cuerpo)
  const [error, setError] = useState<string | null>(null)

  const edicion = useMutation({
    mutationFn: (cuerpo: string) => editarComentario(ticketId, comentario.id, cuerpo),
    onSuccess: () => {
      setEditando(false)
      void queryClient.invalidateQueries({ queryKey: CLAVES_COMENTARIOS.hilo(ticketId) })
    },
    onError: (fallo) => {
      if (fallo instanceof ApiError && fallo.codigo === 'EDICION_VENCIDA') {
        setEditando(false)
        setError(t('comentarios.edicionVencida'))
        void queryClient.invalidateQueries({ queryKey: CLAVES_COMENTARIOS.hilo(ticketId) })
        return
      }
      setError(t('comentarios.errorEnvio'))
    },
  })
  const invalido = texto.trim() === '' || largo(texto) > CUERPO_MAX

  return (
    // Las notas internas llevan otro fondo y además la etiqueta de texto: no dependen solo del color (WCAG).
    // id: destino de los enlaces del historial (SPEC 28).
    <Paper
      variant="outlined"
      component="article"
      id={`comentario-${comentario.id}`}
      sx={{ p: 1.5, bgcolor: comentario.interno ? 'action.hover' : 'background.paper', overflowWrap: 'anywhere' }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {comentario.autor.nombre}
        </Typography>
        {/* Si escribe el solicitante y es vecino, la marca "Vecino" ya dice su rol. */}
        {!(comentario.esDelSolicitante && comentario.autor.rol === 'vecino') && (
          <Typography variant="caption" color="text.secondary">
            {t(`comentarios.roles.${comentario.autor.rol}`)}
          </Typography>
        )}
        {comentario.esDelSolicitante && <Chip size="small" label={t('comentarios.vecino')} />}
        {comentario.interno && <Chip size="small" color="warning" label={t('comentarios.notaInterna')} />}
        <Typography variant="caption" color="text.secondary" component="time" dateTime={comentario.creadoEn} title={fecha}>
          {antiguedad}
        </Typography>
        {comentario.editadoEn && (
          <Typography variant="caption" color="text.secondary">
            {t('comentarios.editado')}
          </Typography>
        )}
      </Stack>
      {error && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
      {editando ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <TextField
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            label={t('comentarios.editarCampo')}
            multiline
            minRows={2}
            error={largo(texto) > CUERPO_MAX}
            helperText={t('comentarios.contador', { actual: largo(texto), maximo: CUERPO_MAX })}
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" disabled={invalido || edicion.isPending} onClick={() => edicion.mutate(texto)}>
              {t('comentarios.guardar')}
            </Button>
            <Button
              size="small"
              onClick={() => {
                setEditando(false)
                setTexto(comentario.cuerpo)
              }}
            >
              {t('comentarios.cancelar')}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <>
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
            {comentario.cuerpo}
          </Typography>
          {comentario.editable && (
            <Button
              size="small"
              sx={{ mt: 0.5 }}
              onClick={() => {
                setError(null)
                setEditando(true)
              }}
            >
              {t('comentarios.editar')}
            </Button>
          )}
        </>
      )}
    </Paper>
  )
}

function CajaComentario({
  ticketId,
  estadoTicket,
  clavesBandeja,
  puedeNotas,
  campoRef,
  onComentado,
}: {
  ticketId: number
  estadoTicket: string
  clavesBandeja: readonly unknown[]
  puedeNotas: boolean
  campoRef?: Ref<HTMLTextAreaElement>
  onComentado?: (respuesta: ComentarioCreado) => void
}) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const finalizada = ESTADOS_FINALES.includes(estadoTicket)
  // Por defecto nota interna, para no publicar al vecino sin querer. En una queja final solo caben notas.
  const [interno, setInterno] = useState(puedeNotas)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)

  const envio = useMutation({
    mutationFn: () => comentar(ticketId, { cuerpo: texto, interno }),
    onMutate: () => setError(null),
    onSuccess: (respuesta) => {
      setTexto('')
      void queryClient.invalidateQueries({ queryKey: CLAVES_COMENTARIOS.hilo(ticketId) })
      if (respuesta.ticket.estado !== estadoTicket) {
        void queryClient.invalidateQueries({ queryKey: clavesBandeja })
      }
      onComentado?.(respuesta)
    },
    onError: (fallo) => {
      setError(
        t(
          fallo instanceof ApiError && fallo.codigo === 'QUEJA_FINALIZADA'
            ? 'comentarios.quejaFinalizada'
            : 'comentarios.errorEnvio',
        ),
      )
    },
  })

  // Sin permiso de notas, en una queja final no hay nada que se pueda escribir.
  if (finalizada && !puedeNotas) {
    return null
  }
  const exceso = largo(texto) > CUERPO_MAX
  const vacio = texto.trim() === ''

  return (
    <Box
      component="form"
      aria-label={t('comentarios.nuevo')}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!vacio && !exceso) envio.mutate()
      }}
    >
      <Stack spacing={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          label={t('comentarios.campo')}
          multiline
          minRows={2}
          inputRef={campoRef}
          error={exceso}
          helperText={t('comentarios.contador', { actual: largo(texto), maximo: CUERPO_MAX })}
        />
        {puedeNotas && (
          <ToggleButtonGroup
            value={interno ? 'interno' : 'publico'}
            exclusive
            size="small"
            aria-label={t('comentarios.visibilidad')}
            onChange={(_evento, valor: 'interno' | 'publico' | null) => {
              if (valor) setInterno(valor === 'interno')
            }}
            sx={{ flexWrap: 'wrap' }}
          >
            <ToggleButton value="publico" disabled={finalizada}>
              {t('comentarios.publico')}
            </ToggleButton>
            <ToggleButton value="interno">{t('comentarios.notaInterna')}</ToggleButton>
          </ToggleButtonGroup>
        )}
        <Button type="submit" variant="contained" disabled={vacio || exceso || envio.isPending}>
          {envio.isPending ? t('comentarios.enviando') : t('comentarios.enviar')}
        </Button>
      </Stack>
    </Box>
  )
}
