import CloseRounded from '@mui/icons-material/CloseRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUSQUEDA_MAX, BUSQUEDA_MIN, ESTADOS_TICKET, type EstadoTicket, type ResumenTickets } from '../api/tickets-api'
import { type Prioridad, PRIORIDADES } from '../api/triage-api'
import { type CriteriosListadoInterno, criteriosPorDefecto, RANGO_MAXIMO_DIAS } from './criterios-url'

export const ESPERA_BUSQUEDA_MS = 300

interface Opcion {
  id: number
  nombre: string
}

interface FiltrosListadoProps {
  criterios: CriteriosListadoInterno
  hoy: string // fecha local de Guatemala, para los valores por defecto
  resumen: ResumenTickets | null // contadores por estado; null mientras carga
  dependencias: readonly Opcion[]
  categorias: readonly Opcion[]
  mostrarDependencia: boolean // solo con el alcance `todas` de tickets.ver
  onCambiar: (cambio: Partial<CriteriosListadoInterno>, reemplazar?: boolean) => void
  onLimpiar: () => void
}

const busquedaValida = (texto: string) => {
  const recortado = texto.trim()
  return [...recortado].length >= BUSQUEDA_MIN ? recortado : null
}

const diasDelRango = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1

// Cuántos filtros difieren del valor por defecto, para el título plegado en celular.
export function filtrosActivos(criterios: CriteriosListadoInterno, hoy: string): number {
  const base = criteriosPorDefecto(hoy)
  const mismosEstados =
    criterios.estados.length === base.estados.length && criterios.estados.every((e) => base.estados.includes(e))
  return [
    !mismosEstados,
    criterios.q !== null,
    criterios.dependenciaId !== null,
    criterios.categoriaId !== null,
    criterios.prioridad !== null,
    criterios.desde !== base.desde || criterios.hasta !== base.hasta,
    criterios.escalado,
  ].filter(Boolean).length
}

// Filtros del listado interno (SPEC 45). La búsqueda espera 300 ms y no se envía con menos de 2 caracteres, como en
// "Mis quejas" (SPEC 38). Las fechas solo se aplican cuando forman un rango válido. En celular se pliegan.
export function FiltrosListado({
  criterios,
  hoy,
  resumen,
  dependencias,
  categorias,
  mostrarDependencia,
  onCambiar,
  onLimpiar,
}: FiltrosListadoProps) {
  const { t } = useTranslation(['tickets', 'comun'])
  const theme = useTheme()
  const escritorio = useMediaQuery(theme.breakpoints.up('md'))
  const ids = useId()
  const [texto, setTexto] = useState(criterios.q ?? '')
  const ultimoAvisado = useRef(criterios.q ?? '')
  const [desde, setDesde] = useState(criterios.desde)
  const [hasta, setHasta] = useState(criterios.hasta)

  // Atrás, Adelante o "Limpiar filtros" cambian los criterios desde la URL: los campos los reflejan.
  useEffect(() => {
    const q = criterios.q ?? ''
    if (busquedaValida(ultimoAvisado.current) !== criterios.q) {
      ultimoAvisado.current = q
      setTexto(q)
    }
  }, [criterios.q])
  useEffect(() => {
    setDesde(criterios.desde)
    setHasta(criterios.hasta)
  }, [criterios.desde, criterios.hasta])

  useEffect(() => {
    if (texto === ultimoAvisado.current) {
      return
    }
    const espera = setTimeout(() => {
      ultimoAvisado.current = texto
      const q = busquedaValida(texto)
      if (q !== criterios.q) {
        onCambiar({ q }, true)
      }
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto, criterios.q, onCambiar])

  const rangoValido = (d: string, h: string) => d !== '' && h !== '' && diasDelRango(d, h) >= 1 && diasDelRango(d, h) <= RANGO_MAXIMO_DIAS
  const cambiarFecha = (d: string, h: string) => {
    setDesde(d)
    setHasta(h)
    if (rangoValido(d, h) && (d !== criterios.desde || h !== criterios.hasta)) {
      onCambiar({ desde: d, hasta: h })
    }
  }

  const etiquetaEstado = (estado: EstadoTicket) =>
    resumen === null
      ? t(`tickets:estados.${estado}`)
      : t('tickets:listadoInterno.filtros.estadoConContador', {
          estado: t(`tickets:estados.${estado}`),
          cantidad: resumen.porEstado[estado],
        })

  const contenido = (
    <Stack spacing={2}>
      <TextField
        type="search"
        label={t('tickets:listadoInterno.filtros.busqueda')}
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
                <IconButton
                  size="small"
                  edge="end"
                  aria-label={t('tickets:listadoInterno.filtros.limpiarBusqueda')}
                  onClick={() => {
                    setTexto('')
                    ultimoAvisado.current = ''
                    onCambiar({ q: null }, true)
                  }}
                >
                  <CloseRounded fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
        <FormControl size="small" fullWidth>
          <InputLabel id={`${ids}-estados`}>{t('tickets:listadoInterno.filtros.estados')}</InputLabel>
          <Select
            labelId={`${ids}-estados`}
            multiple
            value={[...criterios.estados]}
            label={t('tickets:listadoInterno.filtros.estados')}
            onChange={(evento) => {
              const valor = evento.target.value
              const elegidos = (typeof valor === 'string' ? valor.split(',') : valor) as EstadoTicket[]
              // Sin ningún estado elegido se vuelve al valor por defecto (las activas).
              onCambiar({ estados: elegidos.length > 0 ? elegidos : criteriosPorDefecto(hoy).estados })
            }}
            renderValue={(elegidos) => elegidos.map((estado) => t(`tickets:estados.${estado}`)).join(', ')}
          >
            {ESTADOS_TICKET.map((estado) => (
              <MenuItem key={estado} value={estado}>
                <Checkbox size="small" checked={criterios.estados.includes(estado)} />
                <ListItemText primary={etiquetaEstado(estado)} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {mostrarDependencia && (
          <SelectorOpcional
            etiqueta={t('tickets:listadoInterno.filtros.dependencia')}
            todas={t('tickets:listadoInterno.filtros.todas')}
            valor={criterios.dependenciaId}
            opciones={dependencias}
            onCambiar={(dependenciaId) => onCambiar({ dependenciaId })}
          />
        )}
        <SelectorOpcional
          etiqueta={t('tickets:listadoInterno.filtros.categoria')}
          todas={t('tickets:listadoInterno.filtros.todas')}
          valor={criterios.categoriaId}
          opciones={categorias}
          onCambiar={(categoriaId) => onCambiar({ categoriaId })}
        />
        <TextField
          select
          size="small"
          fullWidth
          label={t('tickets:listadoInterno.filtros.prioridad')}
          value={criterios.prioridad ?? ''}
          onChange={(evento) => onCambiar({ prioridad: evento.target.value === '' ? null : (evento.target.value as Prioridad) })}
        >
          <MenuItem value="">{t('tickets:listadoInterno.filtros.todas')}</MenuItem>
          {[...PRIORIDADES].reverse().map((prioridad) => (
            <MenuItem key={prioridad} value={prioridad}>
              {t(`comun:prioridades.${prioridad}`)}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          type="date"
          size="small"
          fullWidth
          label={t('tickets:listadoInterno.filtros.desde')}
          value={desde}
          onChange={(evento) => cambiarFecha(evento.target.value, hasta)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy } }}
        />
        <TextField
          type="date"
          size="small"
          fullWidth
          label={t('tickets:listadoInterno.filtros.hasta')}
          value={hasta}
          onChange={(evento) => cambiarFecha(desde, evento.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy } }}
        />
      </Box>
      {!rangoValido(desde, hasta) && (
        <Typography variant="body2" color="error" role="alert">
          {t('tickets:listadoInterno.filtros.rangoInvalido', { dias: RANGO_MAXIMO_DIAS })}
        </Typography>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <FormControlLabel
          control={<Switch checked={criterios.escalado} onChange={(evento) => onCambiar({ escalado: evento.target.checked })} />}
          label={t('tickets:listadoInterno.filtros.soloEscaladas')}
        />
        <Button onClick={onLimpiar} disabled={filtrosActivos(criterios, hoy) === 0}>
          {t('tickets:listadoInterno.filtros.limpiar')}
        </Button>
      </Stack>
    </Stack>
  )

  if (escritorio) {
    return contenido
  }
  const activos = filtrosActivos(criterios, hoy)
  return (
    <Accordion disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreRounded />}>
        <Typography>
          {activos > 0
            ? t('tickets:listadoInterno.filtros.tituloActivos', { count: activos })
            : t('tickets:listadoInterno.filtros.titulo')}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>{contenido}</AccordionDetails>
    </Accordion>
  )
}

interface SelectorOpcionalProps {
  etiqueta: string
  todas: string
  valor: number | null
  opciones: readonly Opcion[]
  onCambiar: (valor: number | null) => void
}

// Un catálogo con la opción "Todas" (sin filtro).
function SelectorOpcional({ etiqueta, todas, valor, opciones, onCambiar }: SelectorOpcionalProps) {
  // Un id de la URL que no está entre las opciones activas se muestra igual, para no ocultar el filtro aplicado.
  const conValor = valor !== null && !opciones.some((o) => o.id === valor) ? [...opciones, { id: valor, nombre: `#${valor}` }] : opciones
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={etiqueta}
      value={valor === null ? '' : String(valor)}
      onChange={(evento) => onCambiar(evento.target.value === '' ? null : Number(evento.target.value))}
    >
      <MenuItem value="">{todas}</MenuItem>
      {conValor.map((opcion) => (
        <MenuItem key={opcion.id} value={String(opcion.id)}>
          {opcion.nombre}
        </MenuItem>
      ))}
    </TextField>
  )
}
