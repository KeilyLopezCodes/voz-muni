import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { verificar } from '../api/registro-api'

type Estado = 'verificando' | 'exito' | 'error'

// Verifica al abrir, sin botón, y no inicia sesión (SPEC 16).
export function VerificarPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const [parametros] = useSearchParams()
  const token = parametros.get('token')
  const [estado, setEstado] = useState<Estado>(token ? 'verificando' : 'error')
  // El token se consume una sola vez, aunque StrictMode monte el efecto dos veces.
  const llamado = useRef(false)

  useEffect(() => {
    if (!token || llamado.current) return
    llamado.current = true
    verificar(token).then(
      () => setEstado('exito'),
      () => setEstado('error'),
    )
  }, [token])

  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('comun:app.titulo')}
      </Typography>
      <Typography variant="h5" component="h2" gutterBottom>
        {t('auth:verificar.titulo')}
      </Typography>
      {estado === 'verificando' && (
        <Alert severity="info" role="status">
          {t('auth:verificar.verificando')}
        </Alert>
      )}
      {estado === 'exito' && (
        <Alert severity="success" role="status">
          <AlertTitle>{t('auth:verificar.exito')}</AlertTitle>
          {t('auth:verificar.exitoDetalle')}{' '}
          <Link component={RouterLink} to="/login">
            {t('auth:verificar.irALogin')}
          </Link>
        </Alert>
      )}
      {estado === 'error' && (
        <Alert severity="error" role="status">
          <AlertTitle>{t('auth:verificar.error')}</AlertTitle>
          {t('auth:verificar.errorDetalle')}{' '}
          <Link component={RouterLink} to="/registro">
            {t('auth:verificar.irARegistro')}
          </Link>
        </Alert>
      )}
    </Container>
  )
}
