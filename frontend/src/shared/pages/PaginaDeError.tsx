import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface PaginaDeErrorProps {
  Icono: ComponentType<{ sx?: object }>
  titulo: string
  descripcion: string
}

// Estado vacío de las páginas 403 y 404 (SPEC 44): icono grande, título, descripción y "Volver al inicio".
// Sin panel de marca: solo el tema.
export function PaginaDeError({ Icono, titulo, descripcion }: PaginaDeErrorProps) {
  const { t } = useTranslation('comun')
  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2, py: 6 }}
    >
      <Avatar sx={{ width: 96, height: 96, bgcolor: 'primary.main', color: 'primary.contrastText', mb: 1 }}>
        <Icono sx={{ fontSize: 48 }} />
      </Avatar>
      <Typography variant="h4" component="h1">
        {titulo}
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
        {descripcion}
      </Typography>
      <Button variant="contained" component={Link} to="/" sx={{ mt: 1 }}>
        {t('errores.volverAlInicio')}
      </Button>
    </Stack>
  )
}
