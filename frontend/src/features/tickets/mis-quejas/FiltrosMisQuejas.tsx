import CheckRounded from '@mui/icons-material/CheckRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUSQUEDA_MAX } from '../api/tickets-api'
import { type GrupoVecino, ORDEN_GRUPOS } from './grupos'

export const ESPERA_BUSQUEDA_MS = 300

interface FiltrosMisQuejasProps {
  grupo: GrupoVecino
  contadores: Record<GrupoVecino, number> | null // null mientras carga el resumen
  q: string // la búsqueda vigente (la de la URL)
  onGrupo: (grupo: GrupoVecino) => void
  onBuscar: (texto: string) => void
}

// Grupos y búsqueda de "Mis quejas" (SPEC 38). El chip elegido se marca con aria-pressed, el ícono y el relleno, no
// solo con el color. La búsqueda espera 300 ms sin escribir antes de avisar.
export function FiltrosMisQuejas({ grupo, contadores, q, onGrupo, onBuscar }: FiltrosMisQuejasProps) {
  const { t } = useTranslation('tickets')
  const [texto, setTexto] = useState(q)
  const ultimoAvisado = useRef(q)

  // Atrás o Adelante cambian la búsqueda desde la URL: el campo la refleja.
  useEffect(() => {
    if (q !== ultimoAvisado.current) {
      ultimoAvisado.current = q
      setTexto(q)
    }
  }, [q])

  useEffect(() => {
    if (texto === ultimoAvisado.current) {
      return
    }
    const espera = setTimeout(() => {
      ultimoAvisado.current = texto
      onBuscar(texto)
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto, onBuscar])

  const limpiar = () => {
    setTexto('')
    ultimoAvisado.current = ''
    onBuscar('')
  }

  return (
    <Stack spacing={2}>
      <TextField
        type="search"
        label={t('misQuejas.busqueda.etiqueta')}
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        size="small"
        fullWidth
        slotProps={{
          htmlInput: { maxLength: BUSQUEDA_MAX },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: texto ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={limpiar} aria-label={t('misQuejas.busqueda.limpiar')} edge="end">
                  <CloseRounded fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      {/* En celular los chips se desplazan dentro de su fila, sin desbordar la página. */}
      <Stack
        role="group"
        aria-label={t('misQuejas.grupos.etiqueta')}
        direction="row"
        spacing={1}
        sx={{ overflowX: 'auto', pb: 0.5, maxWidth: '100%' }}
      >
        {ORDEN_GRUPOS.map((g) => {
          const elegido = g === grupo
          const nombre = t(`misQuejas.grupos.${g}`)
          return (
            <Chip
              key={g}
              clickable
              aria-pressed={elegido}
              color={elegido ? 'primary' : 'default'}
              variant={elegido ? 'filled' : 'outlined'}
              icon={elegido ? <CheckRounded /> : undefined}
              label={contadores ? t('misQuejas.grupos.conContador', { grupo: nombre, cantidad: contadores[g] }) : nombre}
              onClick={() => onGrupo(g)}
              sx={{ flexShrink: 0, fontWeight: elegido ? 700 : undefined }}
            />
          )
        })}
      </Stack>
    </Stack>
  )
}
