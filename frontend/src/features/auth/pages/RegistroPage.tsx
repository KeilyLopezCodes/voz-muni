import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { registrar } from '../api/registro-api'
import {
  CAMPO_POR_CODIGO,
  ERROR_SERVIDOR_POR_CAMPO,
  validarConfirmacion,
  validarDpi,
  validarEmail,
  validarNombre,
  validarPassword,
  validarTelefono,
  type CampoRegistro,
  type DatosFormularioRegistro,
} from '../validacion-registro'

// react-hook-form espera true o el mensaje del error.
const regla = (error: string | null) => error ?? true

export function RegistroPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const [enviado, setEnviado] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosFormularioRegistro>({
    mode: 'onTouched',
    defaultValues: { nombre: '', dpi: '', email: '', telefono: '', password: '', confirmacion: '' },
  })

  const enviar = handleSubmit(async ({ confirmacion: _confirmacion, telefono, ...datos }) => {
    setErrorGeneral(false)
    try {
      await registrar({ ...datos, ...(telefono.trim() === '' ? {} : { telefono }) })
      setEnviado(true)
    } catch (error) {
      const campo = error instanceof ApiError && error.status === 400 ? CAMPO_POR_CODIGO[error.codigo] : undefined
      if (campo && campo !== 'confirmacion') {
        setError(campo, { message: ERROR_SERVIDOR_POR_CAMPO[campo] }, { shouldFocus: true })
      } else {
        setErrorGeneral(true)
      }
    }
  })

  // Propiedades comunes de cada campo: el error traducido debajo y ancho completo.
  const campo = (nombre: CampoRegistro) => ({
    id: `registro-${nombre}`,
    label: t(`auth:registro.campos.${nombre}`),
    error: Boolean(errors[nombre]),
    helperText: errors[nombre]?.message ? t(errors[nombre].message) : undefined,
    fullWidth: true,
  })

  return (
    <Container component="main" maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('comun:app.titulo')}
      </Typography>
      <Typography variant="h5" component="h2" gutterBottom>
        {t('auth:registro.titulo')}
      </Typography>
      {enviado ? (
        <Alert severity="success" role="status">
          <AlertTitle>{t('auth:registro.enviado.titulo')}</AlertTitle>
          {t('auth:registro.enviado.detalle')}
        </Alert>
      ) : (
        <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
          {errorGeneral && <Alert severity="error">{t('auth:registro.errores.general')}</Alert>}
          <TextField
            {...campo('nombre')}
            {...register('nombre', { validate: (v) => regla(validarNombre(v)) })}
            autoComplete="name"
          />
          <TextField
            {...campo('dpi')}
            {...register('dpi', { validate: (v) => regla(validarDpi(v)) })}
            inputMode="numeric"
          />
          <TextField
            {...campo('email')}
            {...register('email', { validate: (v) => regla(validarEmail(v)) })}
            type="email"
            autoComplete="email"
          />
          <TextField
            {...campo('telefono')}
            {...register('telefono', { validate: (v) => regla(validarTelefono(v)) })}
            type="tel"
            autoComplete="tel"
          />
          <TextField
            {...campo('password')}
            {...register('password', { validate: (v) => regla(validarPassword(v)) })}
            type="password"
            autoComplete="new-password"
          />
          <TextField
            {...campo('confirmacion')}
            {...register('confirmacion', { validate: (v, valores) => regla(validarConfirmacion(v, valores.password)) })}
            type="password"
            autoComplete="new-password"
          />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {t('auth:registro.enviar')}
          </Button>
          <Typography variant="body2">
            {t('auth:registro.yaTienesCuenta')}{' '}
            <Link component={RouterLink} to="/login">
              {t('auth:registro.iniciarSesion')}
            </Link>
          </Typography>
        </Stack>
      )}
    </Container>
  )
}
