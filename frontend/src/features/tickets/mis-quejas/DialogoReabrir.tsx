import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MOTIVO_MAX } from '../api/tickets-api'

interface DialogoReabrirProps {
  open: boolean
  reaperturasRestantes: number
  enviando: boolean
  onCancelar: () => void
  onReabrir: (motivo: string) => void
}

const largo = (texto: string) => [...texto].length

// Reabrir siempre exige motivo (sección 3): la queja vuelve al mismo técnico.
export function DialogoReabrir({ open, reaperturasRestantes, enviando, onCancelar, onReabrir }: DialogoReabrirProps) {
  const { t } = useTranslation('tickets')
  const [motivo, setMotivo] = useState('')
  const exceso = largo(motivo) > MOTIVO_MAX
  const invalido = exceso || motivo.trim() === ''

  return (
    <Dialog open={open} onClose={onCancelar} fullWidth maxWidth="sm" aria-labelledby="dialogo-reabrir-titulo">
      <DialogTitle id="dialogo-reabrir-titulo">{t('detalle.confirmacion.dialogoReabrir.titulo')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('detalle.confirmacion.dialogoReabrir.restantes', { count: reaperturasRestantes })}
        </DialogContentText>
        <TextField
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          label={t('detalle.confirmacion.dialogoReabrir.motivo')}
          required
          fullWidth
          multiline
          minRows={3}
          margin="normal"
          error={exceso}
          helperText={t('detalle.confirmacion.contador', { actual: largo(motivo), maximo: MOTIVO_MAX })}
        />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onCancelar}>{t('detalle.confirmacion.cancelar')}</Button>
        <Button variant="contained" disabled={invalido || enviando} onClick={() => onReabrir(motivo)}>
          {enviando ? t('detalle.confirmacion.enviando') : t('detalle.confirmacion.dialogoReabrir.aceptar')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
