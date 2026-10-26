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

// Índice de administración (SPEC 29). Cada sección nueva agrega aquí su tarjeta.
export function AdminPage() {
  const { t } = useTranslation('admin')
  const idSla = useId()
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('indice.descripcion')}
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 1fr))' } }}>
        <Card variant="outlined" component="section" aria-labelledby={idSla}>
          <CardContent>
            <Box sx={{ color: 'primary.main', mb: 1, display: 'flex' }} aria-hidden>
              <ScheduleRounded />
            </Box>
            <Typography id={idSla} variant="h6" component="h2">
              {t('indice.sla.titulo')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('indice.sla.descripcion')}
            </Typography>
          </CardContent>
          <CardActions>
            <Button component={Link} to="/admin/sla" size="small">
              {t('indice.sla.titulo')}
            </Button>
          </CardActions>
        </Card>
      </Box>
    </>
  )
}
