import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

export function AdminPage() {
  const { t } = useTranslation(['admin', 'comun'])
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('admin:titulo')}
      </Typography>
      <Typography>{t('comun:placeholder.proximamente')}</Typography>
    </>
  )
}
