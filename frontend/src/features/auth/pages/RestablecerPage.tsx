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
import { Navigate, Link as RouterLink, useSearchParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { inicioPorRol } from '../../../shared/auth/inicio-por-rol'
import { useSession } from '../../../shared/auth/session'
import { restablecer } from '../api/auth-api'
import { useIniciarSesion } from '../AuthProvider'
import { validarConfirmacion, validarPassword } from '../validacion-registro'

const ERRORES_DE_RED = new Set(['RED_NO_DISPONIBLE', 'TIEMPO_AGOTADO'])

interface Formulario {
  password: string
  confirmacion: string
}

// MUI recibe la ref de React Hook Form en inputRef, no en ref.
function campo({ ref, ...resto }: UseFormRegisterReturn) {
  return { ...resto, inputRef: ref }
}

// Define la contraseña con un enlace de recuperación (SPEC 09) o de invitación (SPEC 10 y 13), e inicia sesión.
export function RestablecerPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const [params] = useSearchParams()
  const token = params.get('token')
  const session = useSession()
  const iniciarSesion = useIniciarSesion()
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'TOKEN_RECUPERACION_INVALIDO')
  const {
    register,
    handleSubmit,
    setError: setErrorDeCampo,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ defaultValues: { password: '', confirmacion: '' } })

  // Traduce el código de una regla, o deja pasar el valor válido.
  const regla =
    (validar: (valor: string) => string | null) =>
    (valor: string): true | string => {
      const codigo = validar(valor)
      return codigo === null ? true : t(`auth:registro.errores.${codigo}`)
    }

  const enviar = handleSubmit(async ({ password }) => {
    if (!token) return
    setError(null)
    try {
      const respuesta = await restablecer(token, password)
      if (iniciarSesion(respuesta)) {
        setListo(true)
      } else {
        setError('GENERICO')
      }
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : ''
      if (codigo === 'POLITICA_PASSWORD') {
        setErrorDeCampo(
          'password',
          { message: t('auth:restablecer.errores.POLITICA_PASSWORD') },
          { shouldFocus: true },
        )
      } else if (codigo === 'TOKEN_RECUPERACION_INVALIDO') {
        setError(codigo)
      } else {
        setError(ERRORES_DE_RED.has(codigo) ? 'RED_NO_DISPONIBLE' : 'GENERICO')
      }
    }
  })

  // La sesión nueva ya está fijada: al inicio del rol.
  if (listo && session) {
    return <Navigate to={inicioPorRol(session.rol)} replace />
  }

  const enlaceInvalido = error === 'TOKEN_RECUPERACION_INVALIDO'

  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('comun:app.titulo')}
      </Typography>
      <Typography variant="h5" component="h2" gutterBottom>
        {t('auth:restablecer.titulo')}
      </Typography>

      {error && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {t(`auth:restablecer.errores.${error}`)}
          {enlaceInvalido && (
            <>
              {' '}
              <Link component={RouterLink} to="/recuperar">
                {t('auth:restablecer.pedirOtro')}
              </Link>
            </>
          )}
        </Alert>
      )}

      {!enlaceInvalido && (
        <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
          <TextField
            label={t('auth:restablecer.campos.password')}
            type="password"
            autoComplete="new-password"
            error={Boolean(errors.password)}
            slotProps={{ formHelperText: { role: errors.password ? 'alert' : undefined } }}
            helperText={errors.password?.message ?? t('auth:registro.ayuda.password')}
            required
            fullWidth
            {...campo(register('password', { validate: regla(validarPassword) }))}
          />
          <TextField
            label={t('auth:restablecer.campos.confirmacion')}
            type="password"
            autoComplete="new-password"
            error={Boolean(errors.confirmacion)}
            slotProps={{ formHelperText: { role: errors.confirmacion ? 'alert' : undefined } }}
            helperText={errors.confirmacion?.message}
            required
            fullWidth
            {...campo(
              register('confirmacion', {
                validate: regla((valor) => validarConfirmacion(getValues('password'), valor)),
              }),
            )}
          />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? t('auth:restablecer.enviando') : t('auth:restablecer.enviar')}
          </Button>
        </Stack>
      )}
    </Container>
  )
}
