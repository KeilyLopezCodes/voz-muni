import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import type { Rol } from '../../../shared/auth/roles'
import { useSession } from '../../../shared/auth/session'
import {
  type Adjunto,
  borrarAdjunto,
  CLAVES_ADJUNTOS,
  descargarAdjunto,
  listarAdjuntos,
  subirAdjuntos,
} from '../api/adjuntos-api'
import { CLAVES_LINEA_TIEMPO } from '../api/linea-tiempo-api'
import { ACEPTA, etiquetaTipo, MAX_ARCHIVOS, problemaArchivo, tamanoLegible } from './validar-archivos'

// Roles con comentarios.interno en la matriz de SPEC 08: decide si se ofrece "Interno". El backend valida.
const ROLES_CON_NOTAS: readonly Rol[] = ['receptor', 'tecnico', 'coordinador', 'supervisor']
const ESTADOS_FINALES = ['rechazada', 'cerrada']
const IMAGENES = ['image/jpeg', 'image/png']

interface AdjuntosTicketProps {
  ticketId: number
  estadoTicket: string
  soloLectura?: boolean // el detalle del vecino (SPEC 25): ver y descargar, sin subir ni borrar
  nivelTitulo?: 'h2' | 'h3'
}

// Adjuntos de una queja en los paneles internos (SPEC 24): lista, descarga, evidencias y borrado en 5 minutos.
export function AdjuntosTicket({ ticketId, estadoTicket, soloLectura = false, nivelTitulo = 'h3' }: AdjuntosTicketProps) {
  const { t, i18n } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const session = useSession()
  const lista = useQuery({ queryKey: CLAVES_ADJUNTOS.lista(ticketId), queryFn: () => listarAdjuntos(ticketId) })
  const [aviso, setAviso] = useState<string | null>(null)
  // Subir o borrar también cambia el historial del detalle (SPEC 28).
  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_ADJUNTOS.lista(ticketId) })
    void queryClient.invalidateQueries({ queryKey: CLAVES_LINEA_TIEMPO.lista(ticketId) })
  }

  // Descarga con el token (no es un enlace directo): se arma un Blob y se abre o se guarda.
  const abrir = async (adjunto: Adjunto, ver: boolean) => {
    setAviso(null)
    try {
      const url = URL.createObjectURL(await descargarAdjunto(ticketId, adjunto.id))
      if (ver) {
        window.open(url, '_blank', 'noopener')
      } else {
        const enlace = document.createElement('a')
        enlace.href = url
        enlace.download = adjunto.nombre
        enlace.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setAviso(t('adjuntos.errores.descarga'))
    }
  }

  const borrado = useMutation({
    mutationFn: (adjuntoId: number) => borrarAdjunto(ticketId, adjuntoId),
    onSuccess: recargar,
    onError: (fallo) => {
      setAviso(t(fallo instanceof ApiError && fallo.codigo === 'EDICION_VENCIDA' ? 'adjuntos.errores.borradoVencido' : 'adjuntos.errores.generico'))
      recargar()
    },
  })

  const evidencias = (lista.data?.datos ?? []).filter((a) => a.origen === 'atencion').length

  return (
    // id="adjuntos": destino de los enlaces del historial (SPEC 28).
    <Stack spacing={1.5} component="section" id="adjuntos" aria-label={t('adjuntos.titulo')}>
      <Typography variant="subtitle1" component={nivelTitulo}>
        {t('adjuntos.titulo')}
      </Typography>
      {lista.isPending && <CircularProgress aria-label={t('adjuntos.cargando')} />}
      {lista.isError && <Alert severity="error">{t('adjuntos.errorCarga')}</Alert>}
      {lista.isSuccess && lista.data.datos.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('adjuntos.vacio')}
        </Typography>
      )}
      {aviso && <Alert severity="warning">{aviso}</Alert>}
      {lista.data?.datos.map((adjunto) => (
        <Paper key={adjunto.id} variant="outlined" component="article" aria-label={adjunto.nombre} sx={{ p: 1.5, overflowWrap: 'anywhere' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Chip size="small" variant="outlined" label={etiquetaTipo(adjunto.mime)} />
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {adjunto.nombre}
            </Typography>
            {adjunto.interno && <Chip size="small" color="warning" label={t('adjuntos.interno')} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" component="p">
            {tamanoLegible(adjunto.tamanoBytes, i18n.language)} · {adjunto.subidoPor.nombre}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
            {IMAGENES.includes(adjunto.mime) && (
              <Button size="small" onClick={() => void abrir(adjunto, true)}>
                {t('adjuntos.ver')}
              </Button>
            )}
            <Button size="small" onClick={() => void abrir(adjunto, false)}>
              {t('adjuntos.descargar')}
            </Button>
            {adjunto.borrable && !soloLectura && (
              <Button size="small" color="error" disabled={borrado.isPending} onClick={() => borrado.mutate(adjunto.id)}>
                {t('adjuntos.borrar')}
              </Button>
            )}
          </Stack>
        </Paper>
      ))}
      {!soloLectura && (
        <SubirEvidencia
          ticketId={ticketId}
          finalizada={ESTADOS_FINALES.includes(estadoTicket)}
          puedeInterno={session !== null && ROLES_CON_NOTAS.includes(session.rol)}
          restantes={Math.max(0, MAX_ARCHIVOS - evidencias)}
          onSubido={recargar}
        />
      )}
    </Stack>
  )
}

function SubirEvidencia({
  ticketId,
  finalizada,
  puedeInterno,
  restantes,
  onSubido,
}: {
  ticketId: number
  finalizada: boolean
  puedeInterno: boolean
  restantes: number
  onSubido: () => void
}) {
  const { t } = useTranslation('tickets')
  const entrada = useRef<HTMLInputElement>(null)
  // Por defecto interno, para no publicar al vecino sin querer. En una queja final solo caben internos.
  const [interno, setInterno] = useState(puedeInterno)
  const [errores, setErrores] = useState<string[]>([])

  const subida = useMutation({
    mutationFn: (archivos: File[]) => subirAdjuntos(ticketId, archivos, interno),
    onMutate: () => setErrores([]),
    onSuccess: onSubido,
    onError: (fallo) => setErrores(mensajesDeError(fallo, t)),
  })

  if (finalizada && !puedeInterno) {
    return null
  }

  const elegir = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    if (archivos.length === 0) return
    if (archivos.length > restantes) {
      setErrores([t('adjuntos.errores.cupo', { restantes })])
      return
    }
    const problemas = archivos.flatMap((archivo) => {
      const problema = problemaArchivo(archivo)
      return problema ? [t(`adjuntos.problemas.${problema}`, { nombre: archivo.name })] : []
    })
    if (problemas.length > 0) {
      setErrores(problemas)
      return
    }
    subida.mutate(archivos)
  }

  return (
    <Stack spacing={1}>
      {errores.map((error) => (
        <Alert key={error} severity="error">
          {error}
        </Alert>
      ))}
      {puedeInterno && (
        <ToggleButtonGroup
          value={interno ? 'interno' : 'publico'}
          exclusive
          size="small"
          aria-label={t('adjuntos.visibilidad')}
          onChange={(_evento, valor: 'interno' | 'publico' | null) => {
            if (valor) setInterno(valor === 'interno')
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          <ToggleButton value="publico" disabled={finalizada}>
            {t('adjuntos.publico')}
          </ToggleButton>
          <ToggleButton value="interno">{t('adjuntos.interno')}</ToggleButton>
        </ToggleButtonGroup>
      )}
      <Typography variant="caption" color="text.secondary">
        {t('adjuntos.cupo', { restantes, maximo: MAX_ARCHIVOS })}
      </Typography>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEPTA}
        hidden
        onChange={elegir}
        aria-label={t('adjuntos.elegir')}
        data-testid="entrada-evidencia"
      />
      <Button
        variant="outlined"
        disabled={subida.isPending || restantes === 0}
        onClick={() => entrada.current?.click()}
      >
        {subida.isPending ? t('adjuntos.subiendo') : t('adjuntos.subir')}
      </Button>
    </Stack>
  )
}

// Un mensaje por problema: el cupo, cada archivo inválido o el registro cerrado.
export function mensajesDeError(fallo: unknown, t: (clave: string, opciones?: Record<string, unknown>) => string): string[] {
  if (!(fallo instanceof ApiError)) {
    return [t('adjuntos.errores.generico')]
  }
  switch (fallo.codigo) {
    case 'LIMITE_ADJUNTOS': {
      const restantes = fallo.detalles.find((d) => d.campo === 'restantes')?.problema ?? '0'
      return [t('adjuntos.errores.cupo', { restantes })]
    }
    case 'ADJUNTO_INVALIDO':
      return fallo.detalles.length > 0
        ? fallo.detalles.map((d) => t(`adjuntos.problemas.${d.problema}`, { nombre: d.campo }))
        : [t('adjuntos.errores.generico')]
    case 'ADJUNTOS_CERRADOS':
      return [t('adjuntos.errores.cerrados')]
    case 'QUEJA_FINALIZADA':
      return [t('adjuntos.errores.finalizada')]
    default:
      return [t(fallo.status === 0 ? 'adjuntos.errores.red' : 'adjuntos.errores.generico')]
  }
}
