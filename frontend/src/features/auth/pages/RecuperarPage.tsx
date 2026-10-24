import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { PantallaPublica } from '../../../shared/layout/PantallaPublica'
import { recuperar } from '../api/auth-api'
import { validarEmail } from '../validacion-registro'

const ERRORES_DE_RED = new Set(['RED_NO_DISPONIBLE', 'TIEMPO_AGOTADO'])

function claveDeError(codigo: string): string {
  if (codigo === 'DEMASIADAS_PETICIONES') return codigo
  if (ERRORES_DE_RED.has(codigo)) return 'RED_NO_DISPONIBLE'
  return 'GENERICO'
}

interface Formulario {
  email: string
}

// "Olvidé mi contraseña" (SPEC 09). El mensaje final es el mismo exista o no el correo.
export function RecuperarPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ defaultValues: { email: '' } })
  const { ref, ...email } = register('email', {
    validate: (valor) => validarEmail(valor) === null || t('auth:login.validacion.EMAIL_INVALIDO'),
  })

  const enviar = handleSubmit(async (datos) => {
    setError(null)
    try {
      await recuperar(datos.email.trim())
      setEnviado(true)
    } catch (e) {
      setError(claveDeError(e instanceof ApiError ? e.codigo : ''))
    }
  })

  return (
    <PantallaPublica titulo={t('auth:recuperar.titulo')}>

      {enviado ? (
        <Alert severity="success" role="status">
          {t('auth:recuperar.enviado')}
        </Alert>
      ) : (
        <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
          <Typography>{t('auth:recuperar.instrucciones')}</Typography>
          {error && (
            <Alert severity="error" role="alert">
              {t(`auth:login.errores.${error}`)}
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
            inputRef={ref}
            {...email}
          />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? t('auth:recuperar.enviando') : t('auth:recuperar.enviar')}
          </Button>
        </Stack>
      )}
    </PantallaPublica>
  )
}
