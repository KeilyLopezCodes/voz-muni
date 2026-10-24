import CheckRounded from '@mui/icons-material/CheckRounded'
import DarkModeRounded from '@mui/icons-material/DarkModeRounded'
import LightModeRounded from '@mui/icons-material/LightModeRounded'
import SettingsBrightnessRounded from '@mui/icons-material/SettingsBrightnessRounded'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useColorScheme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'

type Modo = 'light' | 'dark' | 'system'

const OPCIONES: readonly { modo: Modo; clave: string; Icono: ComponentType }[] = [
  { modo: 'light', clave: 'tema.claro', Icono: LightModeRounded },
  { modo: 'dark', clave: 'tema.oscuro', Icono: DarkModeRounded },
  { modo: 'system', clave: 'tema.sistema', Icono: SettingsBrightnessRounded },
]

// Antes de montar, MUI todavía no conoce el modo: se trata como "Sistema", el valor por defecto.
function useModo(): [Modo, (modo: Modo) => void] {
  const { mode, setMode } = useColorScheme()
  return [mode ?? 'system', setMode]
}

interface OpcionesTemaProps {
  alElegir?: () => void
}

// Las 3 opciones como ítems de un menú existente. MUI guarda la elección en localStorage['vozmuni.tema'].
function OpcionesTema({ alElegir }: OpcionesTemaProps) {
  const { t } = useTranslation('comun')
  const [modo, setModo] = useModo()
  return (
    <>
      <ListSubheader sx={{ lineHeight: 2.5, bgcolor: 'transparent' }}>{t('tema.etiqueta')}</ListSubheader>
      {OPCIONES.map(({ modo: opcion, clave, Icono }) => (
        <MenuItem
          key={opcion}
          role="menuitemradio"
          aria-checked={modo === opcion}
          selected={modo === opcion}
          onClick={() => {
            setModo(opcion)
            alElegir?.()
          }}
        >
          <ListItemIcon>
            <Icono />
          </ListItemIcon>
          <ListItemText>{t(clave)}</ListItemText>
          {modo === opcion && <CheckRounded fontSize="small" color="primary" sx={{ ml: 2 }} />}
        </MenuItem>
      ))}
    </>
  )
}

// Botón con su propio menú. El icono muestra el modo elegido.
function BotonTema() {
  const { t } = useTranslation('comun')
  const [modo] = useModo()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const Icono = OPCIONES.find((opcion) => opcion.modo === modo)?.Icono ?? SettingsBrightnessRounded
  return (
    <>
      <Tooltip title={t('tema.etiqueta')}>
        <IconButton
          aria-label={t('tema.etiqueta')}
          aria-haspopup="menu"
          aria-expanded={ancla ? 'true' : undefined}
          onClick={(evento) => setAncla(evento.currentTarget)}
        >
          <Icono />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={ancla} open={ancla !== null} onClose={() => setAncla(null)}>
        <OpcionesTema alElegir={() => setAncla(null)} />
      </Menu>
    </>
  )
}

interface SelectorTemaProps {
  // 'opciones': ítems para un menú existente (MenuUsuario). 'boton': icono con su propio menú (PantallaPublica).
  variante: 'opciones' | 'boton'
  // Solo con 'opciones': por ejemplo, cerrar el menú que las contiene.
  alElegir?: () => void
}

// Selector Claro / Oscuro / Sistema (SPEC 44).
export function SelectorTema({ variante, alElegir }: SelectorTemaProps) {
  return variante === 'boton' ? <BotonTema /> : <OpcionesTema alElegir={alElegir} />
}
