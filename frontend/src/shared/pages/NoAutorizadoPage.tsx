import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function NoAutorizadoPage() {
  const { t } = useTranslation('comun')
  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('errores.noAutorizado.titulo')}
      </Typography>
      <Typography sx={{ mb: 3 }}>{t('errores.noAutorizado.descripcion')}</Typography>
      <Button variant="contained" component={Link} to="/">
        {t('errores.volverAlInicio')}
      </Button>
    </Container>
  )
}
