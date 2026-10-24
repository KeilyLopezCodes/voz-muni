import LockRounded from '@mui/icons-material/LockRounded'
import { useTranslation } from 'react-i18next'
import { PaginaDeError } from './PaginaDeError'

export function NoAutorizadoPage() {
  const { t } = useTranslation('comun')
  return (
    <PaginaDeError
      Icono={LockRounded}
      titulo={t('errores.noAutorizado.titulo')}
      descripcion={t('errores.noAutorizado.descripcion')}
    />
  )
}
