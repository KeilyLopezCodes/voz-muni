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

interface DialogoConfirmarProps {
  open: boolean
  exigeMotivo: boolean // un interno confirma en nombre del vecino y explica cómo (SPEC 27)
  enviando: boolean
  onCancelar: () => void
  onConfirmar: (motivo?: string) => void
}

const largo = (texto: string) => [...texto].length

// Confirmar la solución cierra la queja. El vecino confirma sin motivo; un interno debe dar uno.
export function DialogoConfirmar({ open, exigeMotivo, enviando, onCancelar, onConfirmar }: DialogoConfirmarProps) {
  const { t } = useTranslation('tickets')
  const [motivo, setMotivo] = useState('')
  const exceso = largo(motivo) > MOTIVO_MAX
  const invalido = exceso || (exigeMotivo && motivo.trim() === '')

  return (
    <Dialog open={open} onClose={onCancelar} fullWidth maxWidth="sm" aria-labelledby="dialogo-confirmar-titulo">
      <DialogTitle id="dialogo-confirmar-titulo">{t('detalle.confirmacion.dialogoConfirmar.titulo')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('detalle.confirmacion.dialogoConfirmar.texto')}</DialogContentText>
        {exigeMotivo && (
          <TextField
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            label={t('detalle.confirmacion.dialogoConfirmar.motivo')}
            required
            fullWidth
            multiline
            minRows={2}
            margin="normal"
            error={exceso}
            helperText={t('detalle.confirmacion.contador', { actual: largo(motivo), maximo: MOTIVO_MAX })}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onCancelar}>{t('detalle.confirmacion.cancelar')}</Button>
        <Button
          variant="contained"
          disabled={invalido || enviando}
          onClick={() => onConfirmar(exigeMotivo ? motivo : undefined)}
        >
          {enviando ? t('detalle.confirmacion.enviando') : t('detalle.confirmacion.dialogoConfirmar.aceptar')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
