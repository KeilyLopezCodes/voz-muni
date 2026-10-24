import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { PantallaPublica } from '../../../shared/layout/PantallaPublica'
import { registrar } from '../api/registro-api'
import {
  validarConfirmacion,
  validarDpi,
  validarEmail,
  validarNombre,
  validarPassword,
  validarTelefono,
} from '../validacion-registro'

interface Formulario {
  nombre: string
  dpi: string
  email: string
  telefono: string
  password: string
  confirmacion: string
}

// Los 400 del servidor que corresponden a un campo se muestran en ese campo.
const CAMPO_POR_CODIGO: Partial<Record<string, keyof Formulario>> = {
  NOMBRE_INVALIDO: 'nombre',
  DPI_INVALIDO: 'dpi',
  EMAIL_INVALIDO: 'email',
  TELEFONO_INVALIDO: 'telefono',
  POLITICA_PASSWORD: 'password',
}

const ERRORES_DE_RED = new Set(['RED_NO_DISPONIBLE', 'TIEMPO_AGOTADO'])

// MUI recibe la ref de React Hook Form en inputRef, no en ref.
function campo({ ref, ...resto }: UseFormRegisterReturn) {
  return { ...resto, inputRef: ref }
}

export function RegistroPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const [enviado, setEnviado] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    defaultValues: { nombre: '', dpi: '', email: '', telefono: '', password: '', confirmacion: '' },
  })

  // Traduce el código de una regla, o deja pasar el valor válido.
  const regla =
    (validar: (valor: string) => string | null) =>
    (valor: string): true | string => {
      const codigo = validar(valor)
      return codigo === null ? true : t(`auth:registro.errores.${codigo}`)
    }

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)
    try {
      const telefono = datos.telefono.trim()
      await registrar({
        nombre: datos.nombre,
        dpi: datos.dpi,
        email: datos.email.trim(),
        ...(telefono === '' ? {} : { telefono }),
        password: datos.password,
      })
      setEnviado(true)
    } catch (error) {
      const codigo = error instanceof ApiError ? error.codigo : ''
      const campoConError = CAMPO_POR_CODIGO[codigo]
      if (campoConError) {
        setError(campoConError, { message: t(`auth:registro.errores.${codigo}`) }, { shouldFocus: true })
      } else if (ERRORES_DE_RED.has(codigo)) {
        setErrorGeneral(t('auth:registro.errores.RED_NO_DISPONIBLE'))
      } else {
        setErrorGeneral(t('auth:registro.errores.GENERICO'))
      }
    }
  })

  return (
    <PantallaPublica titulo={t('auth:registro.titulo')}>

      {enviado ? (
        <Alert severity="success" role="status">
          <AlertTitle>{t('auth:registro.exito.titulo')}</AlertTitle>
          {t('auth:registro.exito.descripcion')}
        </Alert>
      ) : (
        <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
          {errorGeneral && (
            <Alert severity="error" role="alert">
              {errorGeneral}
            </Alert>
          )}
          <TextField
            label={t('auth:registro.campos.nombre')}
            autoComplete="name"
            error={Boolean(errors.nombre)}
            helperText={errors.nombre?.message}
            required
            fullWidth
            {...campo(register('nombre', { validate: regla(validarNombre) }))}
          />
          <TextField
            label={t('auth:registro.campos.dpi')}
            inputMode="numeric"
            autoComplete="off"
            error={Boolean(errors.dpi)}
            helperText={errors.dpi?.message ?? t('auth:registro.ayuda.dpi')}
            required
            fullWidth
            {...campo(register('dpi', { validate: regla(validarDpi) }))}
          />
          <TextField
            label={t('auth:registro.campos.email')}
            type="email"
            autoComplete="email"
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            required
            fullWidth
            {...campo(register('email', { validate: regla(validarEmail) }))}
          />
          <TextField
            label={t('auth:registro.campos.telefono')}
            type="tel"
            autoComplete="tel"
            error={Boolean(errors.telefono)}
            helperText={errors.telefono?.message ?? t('auth:registro.ayuda.telefono')}
            fullWidth
            {...campo(register('telefono', { validate: regla(validarTelefono) }))}
          />
          <TextField
            label={t('auth:registro.campos.password')}
            type="password"
            autoComplete="new-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message ?? t('auth:registro.ayuda.password')}
            required
            fullWidth
            {...campo(register('password', { validate: regla(validarPassword) }))}
          />
          <TextField
            label={t('auth:registro.campos.confirmacion')}
            type="password"
            autoComplete="new-password"
            error={Boolean(errors.confirmacion)}
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
            {isSubmitting ? t('auth:registro.enviando') : t('auth:registro.enviar')}
          </Button>
        </Stack>
      )}
    </PantallaPublica>
  )
}
