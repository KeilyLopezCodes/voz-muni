import LogoutRounded from '@mui/icons-material/LogoutRounded'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCerrarSesion, type Session } from '../auth/session'
import { SelectorTema } from '../theme/SelectorTema'

// Iniciales del nombre para el avatar: primera letra de las dos primeras palabras ("María López" → "ML").
export function iniciales(nombre: string): string {
  const letras = nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => [...palabra][0]?.toLocaleUpperCase('es') ?? '')
    .join('')
  return letras || '?'
}

interface MenuUsuarioProps {
  session: Session
}

// Avatar de la barra (SPEC 44): abre un menú con el nombre, el rol, el tema y "Cerrar sesión".
export function MenuUsuario({ session }: MenuUsuarioProps) {
  const { t } = useTranslation('comun')
  const cerrarSesion = useCerrarSesion()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const cerrar = () => setAncla(null)

  return (
    <>
      <IconButton
        aria-label={t('menuUsuario.abrir')}
        aria-haspopup="menu"
        aria-expanded={ancla ? 'true' : undefined}
        onClick={(evento) => setAncla(evento.currentTarget)}
        sx={{ p: 0.5 }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 36, height: 36, fontSize: '0.95rem', fontWeight: 700 }}>
          {iniciales(session.nombre)}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={ancla}
        open={ancla !== null}
        onClose={cerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
      >
        {/* Encabezado informativo: no es un ítem del menú. */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{session.nombre}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t(`roles.${session.rol}`)}
          </Typography>
        </Box>
        <Divider />
        <SelectorTema variante="opciones" alElegir={cerrar} />
        <Divider />
        <MenuItem
          onClick={() => {
            cerrar()
            void cerrarSesion()
          }}
        >
          <ListItemIcon>
            <LogoutRounded />
          </ListItemIcon>
          <ListItemText>{t('menu.cerrarSesion')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}
