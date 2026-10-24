import AddCircleRounded from '@mui/icons-material/AddCircleRounded'
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded'
import AssignmentIndRounded from '@mui/icons-material/AssignmentIndRounded'
import FactCheckRounded from '@mui/icons-material/FactCheckRounded'
import HandymanRounded from '@mui/icons-material/HandymanRounded'
import InsertChartRounded from '@mui/icons-material/InsertChartRounded'
import ListAltRounded from '@mui/icons-material/ListAltRounded'
import MenuRounded from '@mui/icons-material/MenuRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import { useState, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { RUTAS_PROTEGIDAS } from '../auth/rutas'
import { useSession } from '../auth/session'
import { Logo } from '../marca/Logo'
import { MenuUsuario } from './MenuUsuario'

const ANCHO_MENU = 248

// Icono de cada ruta del menú (SPEC 44). Vive aquí y no en rutas.ts, para que las guardas no dependan de los iconos.
// Una ruta nueva con enMenu necesita su icono: lo exige app-layout.test.tsx.
export const ICONO_POR_RUTA: Record<string, ComponentType> = {
  '/tickets': ListAltRounded,
  '/tickets/nueva': AddCircleRounded,
  '/triage': FactCheckRounded,
  '/asignacion': AssignmentIndRounded,
  '/atencion': HandymanRounded,
  '/traslados': SwapHorizRounded,
  '/reportes': InsertChartRounded,
  '/admin': AdminPanelSettingsRounded,
}

interface AppLayoutProps {
  children: ReactNode
}

// Menú lateral permanente desde md; en pantallas chicas (desde 360 px) se abre con el botón.
// La barra ocupa el ancho del contenido, así el logo queda arriba del menú lateral.
export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation('comun')
  const session = useSession()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const rutasDelMenu = RUTAS_PROTEGIDAS.filter(
    (ruta) => ruta.enMenu && session !== null && ruta.roles.includes(session.rol),
  )

  const menu = (
    <nav aria-label={t('menu.principal')}>
      <Toolbar sx={{ px: 2.5 }}>
        <Logo tamano={32} />
      </Toolbar>
      {/* NavLink pone aria-current="page" en la ruta actual; el tema lo resalta. */}
      <List sx={{ pt: 1 }}>
        {rutasDelMenu.map((ruta) => {
          const Icono = ICONO_POR_RUTA[ruta.path]
          return (
            <ListItemButton
              key={ruta.path}
              component={NavLink}
              to={ruta.path}
              end
              onClick={() => setMenuAbierto(false)}
              sx={{ mb: 0.5 }}
            >
              {Icono && (
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                  <Icono />
                </ListItemIcon>
              )}
              <ListItemText primary={t(ruta.etiqueta)} slotProps={{ primary: { sx: { fontWeight: 'inherit' } } }} />
            </ListItemButton>
          )
        })}
      </List>
    </nav>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ width: { md: `calc(100% - ${ANCHO_MENU}px)` }, ml: { md: `${ANCHO_MENU}px` } }}>
        <Toolbar>
          <IconButton
            edge="start"
            aria-label={t('menu.abrir')}
            onClick={() => setMenuAbierto(true)}
            sx={{ mr: 1, display: { md: 'none' } }}
          >
            <MenuRounded />
          </IconButton>
          {/* En escritorio el logo ya está en el menú lateral. */}
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <Logo tamano={28} />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          {session && <MenuUsuario session={session} />}
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: ANCHO_MENU } }}
      >
        {menu}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: ANCHO_MENU,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: ANCHO_MENU, boxSizing: 'border-box' },
        }}
      >
        {menu}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, sm: 3 } }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  )
}
