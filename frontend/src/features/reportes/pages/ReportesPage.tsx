import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

export function ReportesPage() {
  const { t } = useTranslation(['reportes', 'comun'])
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('reportes:titulo')}
      </Typography>
      <Typography>{t('comun:placeholder.proximamente')}</Typography>
    </>
  )
}
