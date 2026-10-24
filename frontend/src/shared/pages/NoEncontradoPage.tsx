import SearchOffRounded from '@mui/icons-material/SearchOffRounded'
import { useTranslation } from 'react-i18next'
import { PaginaDeError } from './PaginaDeError'

export function NoEncontradoPage() {
  const { t } = useTranslation('comun')
  return (
    <PaginaDeError
      Icono={SearchOffRounded}
      titulo={t('errores.noEncontrado.titulo')}
      descripcion={t('errores.noEncontrado.descripcion')}
    />
  )
}
