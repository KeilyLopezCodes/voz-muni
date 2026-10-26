import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FiltrosReportes as Filtros, PRIORIDADES, type Prioridad } from '../api/reportes-api'

export interface OpcionesFiltros {
  dependencias: { id: number; nombre: string }[]
  categorias: { id: number; nombre: string }[]
  zonas: { id: number; nombre: string }[]
}

interface Props {
  valores: Filtros
  opciones: OpcionesFiltros
  mostrarDependencia: boolean // oculto con el alcance dependencia o propia
  errorRango: boolean // RANGO_INVALIDO del backend
  onAplicar: (filtros: Filtros) => void
  onLimpiar: () => void
}

const TODAS = ''
const aId = (valor: string) => (valor === TODAS ? null : Number(valor))

// Filtros del tablero (SPEC 43). Se editan aquí y se aplican con "Aplicar"; el padre los guarda en la URL y monta
// el componente con una `key` por cada URL, así el borrador siempre parte de lo aplicado.
export function FiltrosReportes({ valores, opciones, mostrarDependencia, errorRango, onAplicar, onLimpiar }: Props) {
  const { t } = useTranslation(['reportes', 'comun'])
  const [borrador, setBorrador] = useState(valores)
  const cambiar = (cambios: Partial<Filtros>) => setBorrador((actual) => ({ ...actual, ...cambios }))

  const selector = (
    etiqueta: string,
    valor: number | null,
    lista: { id: number; nombre: string }[],
    alCambiar: (id: number | null) => void,
  ) => (
    <TextField
      select
      size="small"
      label={etiqueta}
      value={valor === null ? TODAS : String(valor)}
      onChange={(evento) => alCambiar(aId(evento.target.value))}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      sx={{ minWidth: 0, flex: 1 }}
    >
      <MenuItem value={TODAS}>{t('filtros.todas')}</MenuItem>
      {/* Lo aplicado sigue disponible aunque ya no tenga quejas en el rango. */}
      {valor !== null && !lista.some((o) => o.id === valor) && <MenuItem value={String(valor)}>#{valor}</MenuItem>}
      {lista.map((opcion) => (
        <MenuItem key={opcion.id} value={String(opcion.id)}>
          {opcion.nombre}
        </MenuItem>
      ))}
    </TextField>
  )

  return (
    <Stack
      component="form"
      aria-label={t('filtros.titulo')}
      spacing={2}
      onSubmit={(evento) => {
        evento.preventDefault()
        onAplicar(borrador)
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          type="date"
          size="small"
          label={t('filtros.desde')}
          value={borrador.desde}
          onChange={(evento) => cambiar({ desde: evento.target.value })}
          error={errorRango}
          helperText={errorRango ? t('rangoInvalido') : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          size="small"
          label={t('filtros.hasta')}
          value={borrador.hasta}
          onChange={(evento) => cambiar({ hasta: evento.target.value })}
          error={errorRango}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {mostrarDependencia &&
          selector(t('filtros.dependencia'), borrador.dependenciaId, opciones.dependencias, (id) => cambiar({ dependenciaId: id }))}
        {selector(t('filtros.categoria'), borrador.categoriaId, opciones.categorias, (id) => cambiar({ categoriaId: id }))}
        {selector(t('filtros.zona'), borrador.zonaId, opciones.zonas, (id) => cambiar({ zonaId: id }))}
        <TextField
          select
          size="small"
          label={t('filtros.prioridad')}
          value={borrador.prioridad ?? TODAS}
          onChange={(evento) => cambiar({ prioridad: (evento.target.value || null) as Prioridad | null })}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 0, flex: 1 }}
        >
          <MenuItem value={TODAS}>{t('filtros.todas')}</MenuItem>
          {PRIORIDADES.map((prioridad) => (
            <MenuItem key={prioridad} value={prioridad}>
              {t(`comun:prioridades.${prioridad}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained">
          {t('filtros.aplicar')}
        </Button>
        <Button type="button" onClick={onLimpiar}>
          {t('filtros.limpiar')}
        </Button>
      </Stack>
    </Stack>
  )
}
