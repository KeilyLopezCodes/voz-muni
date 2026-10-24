import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import ForumRounded from '@mui/icons-material/ForumRounded'
import TimelineRounded from '@mui/icons-material/TimelineRounded'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Theme } from '@mui/material/styles'
import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../marca/Logo'
import { SelectorTema } from '../theme/SelectorTema'

const BENEFICIOS: readonly { clave: string; Icono: ComponentType }[] = [
  { clave: 'marca.beneficios.registra', Icono: EditNoteRounded },
  { clave: 'marca.beneficios.sigue', Icono: TimelineRounded },
  { clave: 'marca.beneficios.respuesta', Icono: ForumRounded },
]

// Con el tema de CSS variables usa theme.vars; sin él (pruebas sin ThemeProvider), la paleta normal.
const paleta = (theme: Theme) => (theme.vars ?? theme).palette

interface PantallaPublicaProps {
  // El h2 de la página: "Iniciar sesión", "Crear cuenta", …
  titulo: string
  children: ReactNode
}

// Marco de las pantallas públicas (SPEC 44). Desde md: panel de marca a la izquierda y el contenido a la derecha.
// En pantallas chicas, solo el contenido con el logo arriba. Siempre un solo h1 ("VozMuni") y el h2 del título.
export function PantallaPublica({ titulo, children }: PantallaPublicaProps) {
  const { t } = useTranslation('comun')
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' } }}>
      <Box
        component="aside"
        sx={(theme) => ({
          display: { xs: 'none', md: 'flex' },
          position: 'relative',
          overflow: 'hidden',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 5,
          px: 6,
          py: 8,
          color: paleta(theme).primary.contrastText,
          background: `linear-gradient(150deg, ${paleta(theme).primary.dark} 0%, ${paleta(theme).primary.main} 100%)`,
          ...theme.applyStyles('dark', {
            color: paleta(theme).text.primary,
            background: paleta(theme).background.paper,
            borderRight: `1px solid ${paleta(theme).divider}`,
          }),
        })}
      >
        <FormasDeFondo />
        <Logo tamano={56} sx={(theme) => ({ color: 'inherit', ...theme.applyStyles('dark', { color: paleta(theme).primary.main }) })} />
        <Typography component="p" variant="h3" sx={{ maxWidth: 420, position: 'relative' }}>
          {t('marca.lema')}
        </Typography>
        <Stack component="ul" spacing={2.5} sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>
          {BENEFICIOS.map(({ clave, Icono }) => (
            <Stack component="li" key={clave} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', width: 44, height: 44 }}>
                <Icono />
              </Avatar>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 600 }}>{t(clave)}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      <Box
        component="main"
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: { xs: 2, sm: 4 }, py: { xs: 3, md: 6 } }}
      >
        <Box sx={{ width: '100%', maxWidth: 480, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Logo variante="icono" tamano={36} decorativo />
            <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.6rem', sm: '1.9rem' } }}>
              {t('app.titulo')}
            </Typography>
          </Stack>
          <SelectorTema variante="boton" />
        </Box>
        <Card sx={{ width: '100%', maxWidth: 480, p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h5" component="h2" gutterBottom>
            {titulo}
          </Typography>
          {children}
        </Card>
      </Box>
    </Box>
  )
}

// Formas abstractas del panel de marca, con los colores del tema (sin imágenes externas).
function FormasDeFondo() {
  return (
    <Box
      component="svg"
      aria-hidden
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <Box component="circle" cx="360" cy="40" r="120" sx={{ fill: 'currentColor', opacity: 0.08 }} />
      <Box component="circle" cx="40" cy="380" r="90" sx={{ fill: (theme) => paleta(theme).secondary.main, opacity: 0.35 }} />
      <Box component="circle" cx="330" cy="330" r="36" sx={{ fill: (theme) => paleta(theme).secondary.main, opacity: 0.55 }} />
    </Box>
  )
}
