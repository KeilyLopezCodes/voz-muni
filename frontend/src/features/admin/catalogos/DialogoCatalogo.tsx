import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'

const CODIGOS_DEL_NOMBRE = new Set(['NOMBRE_DUPLICADO', 'NOMBRE_INVALIDO'])
const CODIGOS_CONOCIDOS = new Set([
  ...CODIGOS_DEL_NOMBRE,
  'DEPENDENCIA_EN_USO',
  'DEPENDENCIA_INACTIVA',
  'SLA_INCOMPLETO',
  'NO_ENCONTRADO',
])

// El código de un error del backend, o GENERICO. Los del nombre van en el campo; el resto, en un aviso (SPEC 40).
export function codigoDeError(error: unknown): string {
  return error instanceof ApiError && CODIGOS_CONOCIDOS.has(error.codigo) ? error.codigo : 'GENERICO'
}

export const esErrorDelNombre = (codigo: string | null) => codigo !== null && CODIGOS_DEL_NOMBRE.has(codigo)

interface DialogoCatalogoProps {
  abierto: boolean
  titulo: string
  nombre: string
  onNombre: (nombre: string) => void
  error: string | null // código del último error, o null
  avisoError?: ReactNode // contenido extra del aviso de error (enlaces), si corresponde
  enviando: boolean
  onCerrar: () => void
  onGuardar: () => void
  children?: ReactNode // campos propios del catálogo (dependencia, tipo, …)
}

// El diálogo de crear o editar de los 3 catálogos: el nombre y los campos propios de cada uno. NOMBRE_DUPLICADO y
// NOMBRE_INVALIDO se muestran en el campo del nombre; los demás errores, en un aviso dentro del diálogo.
export function DialogoCatalogo({
  abierto,
  titulo,
  nombre,
  onNombre,
  error,
  avisoError,
  enviando,
  onCerrar,
  onGuardar,
  children,
}: DialogoCatalogoProps) {
  const { t } = useTranslation('admin')
  return (
    <Dialog open={abierto} onClose={onCerrar} fullWidth maxWidth="sm">
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          onGuardar()
        }}
      >
        <DialogTitle>{titulo}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && !esErrorDelNombre(error) && (
              <Alert severity="error" role="alert">
                {t(`catalogos.errores.${error}`)}
                {avisoError}
              </Alert>
            )}
            <TextField
              label={t('catalogos.nombre')}
              value={nombre}
              onChange={(evento) => onNombre(evento.target.value)}
              error={esErrorDelNombre(error)}
              helperText={esErrorDelNombre(error) ? t(`catalogos.errores.${error}`) : undefined}
              slotProps={{ htmlInput: { maxLength: 120 }, formHelperText: { role: esErrorDelNombre(error) ? 'alert' : undefined } }}
              required
              fullWidth
              autoFocus
            />
            {children}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={onCerrar}>{t('catalogos.cancelar')}</Button>
          <Button type="submit" variant="contained" disabled={enviando || nombre.trim() === ''}>
            {t('catalogos.guardar')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

interface ConfirmarDesactivarProps {
  nombre: string | null // null: cerrado
  enviando: boolean
  error: string | null
  avisoError?: ReactNode
  onCancelar: () => void
  onConfirmar: () => void
}

// Desactivar pide confirmación: el registro deja de estar disponible para quejas nuevas (SPEC 40).
export function ConfirmarDesactivar({ nombre, enviando, error, avisoError, onCancelar, onConfirmar }: ConfirmarDesactivarProps) {
  const { t } = useTranslation('admin')
  return (
    <Dialog open={nombre !== null} onClose={onCancelar} fullWidth maxWidth="xs">
      <DialogTitle>{t('catalogos.confirmarTitulo', { nombre })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('catalogos.confirmarTexto', { nombre })}</DialogContentText>
        {error && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {t(`catalogos.errores.${error}`)}
            {avisoError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onCancelar}>{t('catalogos.cancelar')}</Button>
        <Button color="error" variant="contained" onClick={onConfirmar} disabled={enviando}>
          {t('catalogos.desactivar')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
