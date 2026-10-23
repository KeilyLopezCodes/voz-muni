import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { verificar } from '../api/registro-api'

type Estado = 'verificando' | 'exito' | 'invalido' | 'sin-conexion'

const ERRORES_DE_RED = new Set(['RED_NO_DISPONIBLE', 'TIEMPO_AGOTADO'])

// Verifica al abrir el enlace del correo (SPEC 16). No inicia sesión: lleva a /login.
export function VerificarPage() {
  const { t } = useTranslation(['auth', 'comun'])
  const [params] = useSearchParams()
  const token = params.get('token')
  const [estado, setEstado] = useState<Estado>(token ? 'verificando' : 'invalido')
  // El token es de un solo uso: StrictMode monta dos veces y la segunda llamada respondería 400.
  const llamado = useRef(false)

  useEffect(() => {
    if (!token || llamado.current) {
      return
    }
    llamado.current = true
    verificar(token)
      .then(() => setEstado('exito'))
      .catch((error: unknown) => {
        const sinConexion = error instanceof ApiError && ERRORES_DE_RED.has(error.codigo)
        setEstado(sinConexion ? 'sin-conexion' : 'invalido')
      })
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
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
          <CircularProgress size={24} />
          <Typography>{t('auth:verificar.verificando')}</Typography>
        </Stack>
      )}

      {estado === 'exito' && (
        <Stack spacing={2}>
          <Alert severity="success" role="status">
            <AlertTitle>{t('auth:verificar.exito.titulo')}</AlertTitle>
            {t('auth:verificar.exito.descripcion')}
          </Alert>
          <Button variant="contained" component={Link} to="/login">
            {t('auth:verificar.irALogin')}
          </Button>
        </Stack>
      )}

      {estado === 'invalido' && (
        <Stack spacing={2}>
          <Alert severity="error" role="alert">
            <AlertTitle>{t('auth:verificar.invalido.titulo')}</AlertTitle>
            {t('auth:verificar.invalido.descripcion')}
          </Alert>
          <Button variant="contained" component={Link} to="/registro">
            {t('auth:verificar.irARegistro')}
          </Button>
        </Stack>
      )}

      {estado === 'sin-conexion' && (
        <Alert severity="error" role="alert">
          {t('auth:verificar.sinConexion')}
        </Alert>
      )}
    </Container>
  )
}
