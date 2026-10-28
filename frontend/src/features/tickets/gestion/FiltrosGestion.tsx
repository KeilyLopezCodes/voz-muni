import CloseRounded from '@mui/icons-material/CloseRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FiltrosGestion as Filtros, type OpcionesGestion, SIN_ASIGNAR } from '../api/gestion-api'
import { BUSQUEDA_MAX, ESTADOS_TICKET, type EstadoTicket } from '../api/tickets-api'
import { PRIORIDADES, type Prioridad } from '../api/triage-api'
import { ESPERA_BUSQUEDA_MS } from '../mis-quejas/FiltrosMisQuejas'
import { esFechaValida } from './filtros-url'

// Valor del select que significa "sin filtro".
const TODAS = 'todas'

type Cambios = Partial<Omit<Filtros, 'pagina'>>

interface FiltrosGestionProps {
  filtros: Filtros
  opciones: OpcionesGestion | undefined // mientras carga, los selects quedan vacíos
  mostrarTecnico: boolean // el técnico solo ve sus quejas: el filtro no le sirve
  q: string // la búsqueda escrita en la URL
  onCambiar: (cambios: Cambios) => void
  onBuscar: (texto: string) => void
}

// Filtros del listado de gestión (SPEC 45). La búsqueda espera 300 ms sin escribir, como "Mis quejas" (SPEC 38).
// Las categorías y los técnicos se limitan a la dependencia elegida.
export function FiltrosGestion({ filtros, opciones, mostrarTecnico, q, onCambiar, onBuscar }: FiltrosGestionProps) {
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

  const limpiarBusqueda = () => {
    setTexto('')
    ultimoAvisado.current = ''
    onBuscar('')
  }

  const dependencias = opciones?.dependencias ?? []
  const deLaDependencia = <T extends { dependenciaId: number }>(lista: T[]) =>
    filtros.dependenciaId === null ? lista : lista.filter((x) => x.dependenciaId === filtros.dependenciaId)
  const categorias = deLaDependencia(opciones?.categorias ?? [])
  const tecnicos = deLaDependencia(opciones?.tecnicos ?? [])
  const nombre = (x: { nombre: string; activa?: boolean; activo?: boolean }) =>
    x.activa === false
      ? t('gestion.filtros.inactiva', { nombre: x.nombre })
      : x.activo === false
        ? t('gestion.filtros.inactivo', { nombre: x.nombre })
        : x.nombre

  // Al cambiar de dependencia se sueltan la categoría y el técnico que no le pertenecen.
  const elegirDependencia = (valor: string) => {
    const dependenciaId = valor === TODAS ? null : Number(valor)
    const pertenece = (lista: { id: number; dependenciaId: number }[], id: number | null) =>
      dependenciaId === null || lista.some((x) => x.id === id && x.dependenciaId === dependenciaId)
    onCambiar({
      dependenciaId,
      categoriaId: pertenece(opciones?.categorias ?? [], filtros.categoriaId) ? filtros.categoriaId : null,
      tecnico:
        typeof filtros.tecnico === 'number' && !pertenece(opciones?.tecnicos ?? [], filtros.tecnico) ? null : filtros.tecnico,
    })
  }

  const fecha = (valor: string) => (esFechaValida(valor) ? valor : null)
  const seleccion = { slotProps: { inputLabel: { shrink: true } }, select: true, size: 'small' as const, fullWidth: true }

  return (
    <Stack spacing={2} component="section" aria-label={t('gestion.filtros.etiqueta')}>
      <TextField
        type="search"
        label={t('gestion.filtros.busqueda')}
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
                <IconButton size="small" onClick={limpiarBusqueda} aria-label={t('gestion.filtros.limpiarBusqueda')} edge="end">
                  <CloseRounded fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
        <TextField
          {...seleccion}
          label={t('gestion.filtros.estados')}
          value={[...filtros.estados]}
          onChange={(evento) => {
            const valor = evento.target.value as unknown as string[] | string
            onCambiar({ estados: (Array.isArray(valor) ? valor : valor.split(',')) as EstadoTicket[] })
          }}
          slotProps={{
            inputLabel: { shrink: true },
            select: {
              multiple: true,
              displayEmpty: true,
              renderValue: (valor) => {
                const elegidos = valor as unknown as EstadoTicket[]
                return elegidos.length === 0 ? t('gestion.filtros.todos') : elegidos.map((e) => t(`estados.${e}`)).join(', ')
              },
            },
          }}
        >
          {ESTADOS_TICKET.map((estado) => (
            <MenuItem key={estado} value={estado}>
              {t(`estados.${estado}`)}
            </MenuItem>
          ))}
        </TextField>

        {dependencias.length > 1 && (
          <TextField
            {...seleccion}
            label={t('gestion.filtros.dependencia')}
            value={filtros.dependenciaId === null ? TODAS : String(filtros.dependenciaId)}
            onChange={(evento) => elegirDependencia(evento.target.value)}
          >
            <MenuItem value={TODAS}>{t('gestion.filtros.todas')}</MenuItem>
            {dependencias.map((d) => (
              <MenuItem key={d.id} value={String(d.id)}>
                {nombre(d)}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          {...seleccion}
          label={t('gestion.filtros.categoria')}
          value={filtros.categoriaId !== null && categorias.some((c) => c.id === filtros.categoriaId) ? String(filtros.categoriaId) : TODAS}
          onChange={(evento) => onCambiar({ categoriaId: evento.target.value === TODAS ? null : Number(evento.target.value) })}
        >
          <MenuItem value={TODAS}>{t('gestion.filtros.todas')}</MenuItem>
          {categorias.map((c) => (
            <MenuItem key={c.id} value={String(c.id)}>
              {nombre(c)}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          {...seleccion}
          label={t('gestion.filtros.prioridad')}
          value={filtros.prioridad ?? TODAS}
          onChange={(evento) => onCambiar({ prioridad: evento.target.value === TODAS ? null : (evento.target.value as Prioridad) })}
        >
          <MenuItem value={TODAS}>{t('gestion.filtros.todas')}</MenuItem>
          {[...PRIORIDADES].reverse().map((p) => (
            <MenuItem key={p} value={p}>
              {t(`triage.prioridades.${p}`)}
            </MenuItem>
          ))}
        </TextField>

        {mostrarTecnico && (
          <TextField
            {...seleccion}
            label={t('gestion.filtros.tecnico')}
            value={
              filtros.tecnico === null || (typeof filtros.tecnico === 'number' && !tecnicos.some((x) => x.id === filtros.tecnico))
                ? TODAS
                : String(filtros.tecnico)
            }
            onChange={(evento) => {
              const valor = evento.target.value
              onCambiar({ tecnico: valor === TODAS ? null : valor === SIN_ASIGNAR ? SIN_ASIGNAR : Number(valor) })
            }}
          >
            <MenuItem value={TODAS}>{t('gestion.filtros.todosTecnicos')}</MenuItem>
            <MenuItem value={SIN_ASIGNAR}>{t('gestion.filtros.sinAsignar')}</MenuItem>
            {tecnicos.map((x) => (
              <MenuItem key={x.id} value={String(x.id)}>
                {nombre(x)}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          type="date"
          size="small"
          fullWidth
          label={t('gestion.filtros.desde')}
          value={filtros.desde ?? ''}
          onChange={(evento) => onCambiar({ desde: fecha(evento.target.value) })}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: filtros.hasta ?? undefined } }}
        />
        <TextField
          type="date"
          size="small"
          fullWidth
          label={t('gestion.filtros.hasta')}
          value={filtros.hasta ?? ''}
          onChange={(evento) => onCambiar({ hasta: fecha(evento.target.value) })}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filtros.desde ?? undefined } }}
        />
      </Box>
    </Stack>
  )
}
