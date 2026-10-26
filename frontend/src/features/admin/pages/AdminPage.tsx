import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded'
import CategoryRounded from '@mui/icons-material/CategoryRounded'
import PlaceRounded from '@mui/icons-material/PlaceRounded'
import ScheduleRounded from '@mui/icons-material/ScheduleRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

// Las secciones del índice, en el orden en que se muestran: los catálogos de la organización (SPEC 40) y el SLA
// (SPEC 29).
const SECCIONES = [
  { clave: 'dependencias', ruta: '/admin/dependencias', icono: <AccountTreeRounded /> },
  { clave: 'categorias', ruta: '/admin/categorias', icono: <CategoryRounded /> },
  { clave: 'zonas', ruta: '/admin/zonas', icono: <PlaceRounded /> },
  { clave: 'sla', ruta: '/admin/sla', icono: <ScheduleRounded /> },
] as const

function TarjetaSeccion({ clave, ruta, icono }: (typeof SECCIONES)[number]) {
  const { t } = useTranslation('admin')
  const idTitulo = useId()
  return (
    <Card variant="outlined" component="section" aria-labelledby={idTitulo}>
      <CardContent>
        <Box sx={{ color: 'primary.main', mb: 1, display: 'flex' }} aria-hidden>
          {icono}
        </Box>
        <Typography id={idTitulo} variant="h6" component="h2">
          {t(`indice.${clave}.titulo`)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(`indice.${clave}.descripcion`)}
        </Typography>
      </CardContent>
      <CardActions>
        <Button component={Link} to={ruta} size="small">
          {t(`indice.${clave}.titulo`)}
        </Button>
      </CardActions>
    </Card>
  )
}

// Índice de administración (SPEC 29 y 40). Cada sección nueva agrega aquí su tarjeta.
export function AdminPage() {
  const { t } = useTranslation('admin')
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('indice.descripcion')}
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 1fr))' } }}>
        {SECCIONES.map((seccion) => (
          <TarjetaSeccion key={seccion.clave} {...seccion} />
        ))}
      </Box>
    </>
  )
}
