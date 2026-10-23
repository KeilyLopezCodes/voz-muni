import Alert from '@mui/material/Alert'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { useEstadoServidor, type EstadoServidor } from '../../../shared/api/health'

const SEVERIDAD = {
  verificando: 'info',
  disponible: 'success',
  'no-disponible': 'error',
} as const satisfies Record<EstadoServidor, 'info' | 'success' | 'error'>

const CLAVE = {
  verificando: 'auth:estadoServidor.verificando',
  disponible: 'auth:estadoServidor.disponible',
  'no-disponible': 'auth:estadoServidor.noDisponible',
} as const satisfies Record<EstadoServidor, string>

// El formulario de login llega con la spec de autenticación.
export function LoginPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const estado = useEstadoServidor()
  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('comun:app.titulo')}
      </Typography>
      <Typography variant="h5" component="h2" gutterBottom>
        {t('auth:login.titulo')}
      </Typography>
      <Alert severity={SEVERIDAD[estado]} role="status">
        {t(CLAVE[estado])}
      </Alert>
      <Typography variant="body2" sx={{ mt: 2 }}>
        {t('auth:login.sinCuenta')}{' '}
        <Link component={RouterLink} to="/registro">
          {t('auth:login.crearCuenta')}
        </Link>
      </Typography>
    </Container>
  )
}
