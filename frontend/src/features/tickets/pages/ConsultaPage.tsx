import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

// Consulta pública del estado de una queja (RF-35).
export function ConsultaPage() {
  const { t } = useTranslation(['tickets', 'comun'])
  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('tickets:consulta.titulo')}
      </Typography>
      <Typography>{t('comun:placeholder.proximamente')}</Typography>
    </Container>
  )
}
