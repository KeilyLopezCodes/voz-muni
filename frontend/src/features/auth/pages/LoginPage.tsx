import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, Link as RouterLink, useLocation } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { useEstadoServidor, type EstadoServidor } from '../../../shared/api/health'
import { useSession } from '../../../shared/auth/session'
import { login } from '../api/auth-api'
import { useIniciarSesion } from '../AuthProvider'
import { destinoTrasLogin } from '../destino-login'
import { validarEmail } from '../validacion-registro'

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

// Códigos con mensaje propio; cualquier otro muestra el genérico.
const CODIGOS_CONOCIDOS = new Set([
  'CREDENCIALES_INVALIDAS',
  'CUENTA_BLOQUEADA',
  'CORREO_NO_VERIFICADO',
  'DEMASIADAS_PETICIONES',
])
const ERRORES_DE_RED = new Set(['RED_NO_DISPONIBLE', 'TIEMPO_AGOTADO'])

function claveDeError(codigo: string): string {
  if (CODIGOS_CONOCIDOS.has(codigo)) return codigo
  if (ERRORES_DE_RED.has(codigo)) return 'RED_NO_DISPONIBLE'
  return 'GENERICO'
}

interface Formulario {
  email: string
  password: string
}

// MUI recibe la ref de React Hook Form en inputRef, no en ref.
function campo({ ref, ...resto }: UseFormRegisterReturn) {
  return { ...resto, inputRef: ref }
}

export function LoginPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const estado = useEstadoServidor()
  const session = useSession()
  const location = useLocation()
  const iniciarSesion = useIniciarSesion()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ defaultValues: { email: '', password: '' } })

  const enviar = handleSubmit(async ({ email, password }) => {
    setError(null)
    try {
      const respuesta = await login(email.trim(), password)
      // Con la sesión fijada, el render siguiente redirige al destino.
      if (!iniciarSesion(respuesta)) {
        setError('GENERICO')
      }
    } catch (e) {
      setError(claveDeError(e instanceof ApiError ? e.codigo : ''))
    }
  })

  // Con sesión (ya iniciada o recién iniciada) no hay nada que hacer aquí.
  if (session) {
    return <Navigate to={destinoTrasLogin(session.rol, location.state)} replace />
  }

  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('comun:app.titulo')}
      </Typography>
      <Typography variant="h5" component="h2" gutterBottom>
        {t('auth:login.titulo')}
      </Typography>
      <Alert severity={SEVERIDAD[estado]} role="status" sx={{ mb: 3 }}>
        {t(CLAVE[estado])}
      </Alert>

      <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
        {error && (
          <Alert severity="error" role="alert">
            {t(`auth:login.errores.${error}`)}
            {error === 'CORREO_NO_VERIFICADO' && (
              <>
                {' '}
                <Link component={RouterLink} to="/registro">
                  {t('auth:login.irARegistro')}
                </Link>
              </>
            )}
          </Alert>
        )}
        <TextField
          label={t('auth:login.campos.email')}
          type="email"
          autoComplete="email"
          error={Boolean(errors.email)}
          slotProps={{ formHelperText: { role: errors.email ? 'alert' : undefined } }}
          helperText={errors.email?.message}
          required
          fullWidth
          {...campo(
            register('email', {
              validate: (valor) => validarEmail(valor) === null || t('auth:login.validacion.EMAIL_INVALIDO'),
            }),
          )}
        />
        <TextField
          label={t('auth:login.campos.password')}
          type="password"
          autoComplete="current-password"
          error={Boolean(errors.password)}
          slotProps={{ formHelperText: { role: errors.password ? 'alert' : undefined } }}
          helperText={errors.password?.message}
          required
          fullWidth
          {...campo(
            register('password', {
              validate: (valor) => valor !== '' || t('auth:login.validacion.PASSWORD_REQUERIDA'),
            }),
          )}
        />
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {isSubmitting ? t('auth:login.enviando') : t('auth:login.enviar')}
        </Button>
      </Stack>

      {/* gap en lugar de spacing: al pasar a dos líneas (360 px) el margen de spacing deja sangría. */}
      <Stack direction="row" sx={{ mt: 2, gap: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Button component={RouterLink} to="/recuperar">
          {t('auth:login.olvide')}
        </Button>
        <Button component={RouterLink} to="/registro">
          {t('auth:login.crearCuenta')}
        </Button>
      </Stack>
    </Container>
  )
}
