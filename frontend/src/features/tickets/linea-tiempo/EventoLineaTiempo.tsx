import AttachFileRounded from '@mui/icons-material/AttachFileRounded'
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { fechaGuatemala } from '../antiguedad'
import type { ActorEvento, EventoLineaTiempo as Evento } from '../api/linea-tiempo-api'

const ICONO: Record<Evento['detalle']['tipo'], ReactElement> = {
  estado: <FlagRounded fontSize="small" />,
  asignacion: <PersonAddAltRounded fontSize="small" />,
  traslado_solicitado: <SwapHorizRounded fontSize="small" />,
  traslado_rechazado: <SwapHorizRounded fontSize="small" />,
  traslado_retirado: <SwapHorizRounded fontSize="small" />,
  traslado_sin_efecto: <SwapHorizRounded fontSize="small" />,
  comentario: <ChatBubbleOutlineRounded fontSize="small" />,
  adjunto: <AttachFileRounded fontSize="small" />,
}

type T = (clave: string, opciones?: Record<string, unknown>) => string

function nombreActor(actor: ActorEvento, t: T): string {
  if (actor.tipo !== 'usuario') {
    return t(`lineaTiempo.actores.${actor.tipo}`)
  }
  const rol = actor.esSolicitante ? t('comentarios.vecino') : t(`comentarios.roles.${actor.rol}`)
  return t('lineaTiempo.actores.usuario', { nombre: actor.nombre, rol })
}

interface Frase {
  texto: string
  conActor: boolean // la frase ya nombra al actor; si no, se muestra junto a la fecha
  motivo: string | null
  enlace: { href: string; texto: string } | null
  interno: boolean
}

function frase({ actor: quien, detalle }: Evento, t: T): Frase {
  const actor = nombreActor(quien, t)
  // "Tú cambiaste…": con el propio vecino la frase va en segunda persona.
  const context = quien.tipo === 'tu' ? 'tu' : undefined
  const base = { conActor: true, motivo: null, enlace: null, interno: false }
  switch (detalle.tipo) {
    case 'estado':
      return detalle.estadoAnterior === null
        ? { ...base, texto: t('lineaTiempo.eventos.registrada'), conActor: false, motivo: detalle.motivo }
        : {
            ...base,
            texto: t('lineaTiempo.eventos.estado', { actor, context, estado: t(`estados.${detalle.estadoNuevo}`) }),
            motivo: detalle.motivo,
          }
    case 'asignacion':
      return {
        ...base,
        texto:
          detalle.tecnicoAnterior === null
            ? t('lineaTiempo.eventos.asignacion', { actor, tecnico: detalle.tecnicoNuevo.nombre })
            : t('lineaTiempo.eventos.reasignacion', {
                actor,
                anterior: detalle.tecnicoAnterior.nombre,
                nuevo: detalle.tecnicoNuevo.nombre,
              }),
        motivo: detalle.motivo,
      }
    case 'traslado_solicitado':
      return {
        ...base,
        texto:
          detalle.dependenciaSugerida === null
            ? t('lineaTiempo.eventos.trasladoSolicitadoOtra', { actor })
            : t('lineaTiempo.eventos.trasladoSolicitado', { actor, dependencia: detalle.dependenciaSugerida }),
        motivo: detalle.motivo,
      }
    case 'traslado_rechazado':
      return { ...base, texto: t('lineaTiempo.eventos.trasladoRechazado'), conActor: false, motivo: detalle.motivo }
    case 'traslado_retirado':
      return { ...base, texto: t('lineaTiempo.eventos.trasladoRetirado'), conActor: false, motivo: detalle.motivo }
    case 'traslado_sin_efecto':
      return { ...base, texto: t('lineaTiempo.eventos.trasladoSinEfecto'), conActor: false, motivo: detalle.motivo }
    case 'comentario':
      return {
        ...base,
        texto: detalle.interno
          ? t('lineaTiempo.eventos.notaInterna', { actor })
          : t('lineaTiempo.eventos.comentario', { actor, context }),
        enlace: { href: `#comentario-${detalle.comentarioId}`, texto: t('lineaTiempo.verComentario') },
        interno: detalle.interno,
      }
    case 'adjunto':
      return {
        ...base,
        texto: t('lineaTiempo.eventos.adjunto', { actor, context, nombre: detalle.nombre }),
        enlace: { href: '#adjuntos', texto: t('lineaTiempo.verAdjuntos') },
        interno: detalle.interno,
      }
  }
}

// Un evento de la línea de tiempo (SPEC 28). El motivo es texto plano: React lo escapa, nunca se interpreta como HTML.
export function EventoLineaTiempo({ evento }: { evento: Evento }) {
  const { t, i18n } = useTranslation('tickets')
  const { texto, conActor, motivo, enlace, interno } = frase(evento, t)
  const fecha = fechaGuatemala(evento.ocurridoEn, i18n.language)

  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.5, py: 1, minWidth: 0 }}>
      <Box sx={{ color: 'primary.main', pt: 0.25, flexShrink: 0, display: 'flex' }} aria-hidden>
        {ICONO[evento.detalle.tipo]}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="body2">{texto}</Typography>
          {/* La marca es un texto visible, no solo un color (WCAG). */}
          {interno && <Chip size="small" color="warning" label={t('lineaTiempo.interno')} />}
          {enlace && (
            <Link href={enlace.href} variant="body2">
              {enlace.texto}
            </Link>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
          {!conActor && `${nombreActor(evento.actor, t)} · `}
          <time dateTime={evento.ocurridoEn}>{fecha}</time>
        </Typography>
        {motivo && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
            {motivo}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
