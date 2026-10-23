import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import SvgIcon from '@mui/material/SvgIcon'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { RUTAS_PROTEGIDAS } from '../auth/rutas'
import { useCerrarSesion, useSession } from '../auth/session'

const ANCHO_MENU = 240

interface AppLayoutProps {
  children: ReactNode
}

// Menú lateral permanente desde md; en pantallas chicas (desde 360 px) se abre con el botón.
export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation('comun')
  const session = useSession()
  const cerrarSesion = useCerrarSesion()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const rutasDelMenu = RUTAS_PROTEGIDAS.filter(
    (ruta) => ruta.enMenu && session !== null && ruta.roles.includes(session.rol),
  )

  const menu = (
    <nav aria-label={t('menu.principal')}>
      <Toolbar />
      <List>
        {rutasDelMenu.map((ruta) => (
          <ListItemButton
            key={ruta.path}
            component={NavLink}
            to={ruta.path}
            end
            onClick={() => setMenuAbierto(false)}
          >
            <ListItemText primary={t(ruta.etiqueta)} />
          </ListItemButton>
        ))}
      </List>
    </nav>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            aria-label={t('menu.abrir')}
            onClick={() => setMenuAbierto(true)}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <SvgIcon>
              <path d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z" />
            </SvgIcon>
          </IconButton>
          <Typography variant="h6" component="div" noWrap sx={{ flexGrow: 1 }}>
            {t('app.titulo')}
          </Typography>
          {session && (
            <Button color="inherit" onClick={() => void cerrarSesion()} sx={{ flexShrink: 0 }}>
              {t('menu.cerrarSesion')}
            </Button>
          )}
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
