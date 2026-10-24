import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface ExitoRegistroProps {
  numero: string // Q-AAAA-NNNNNN
  ventanilla: boolean
  onRegistrarOtra: () => void
  // Los archivos no se subieron (SPEC 24): se muestran los errores y "Reintentar", que no vuelve a crear la queja.
  subidaFallida?: { errores: string[]; reintentar: () => Promise<boolean> } | null
}

type EstadoCopia = 'copiado' | 'noDisponible' | null

// El vecino guarda su número; en ventanilla, el receptor se lo dicta al vecino (SPEC 18).
export function ExitoRegistro({ numero, ventanilla, onRegistrarOtra, subidaFallida = null }: ExitoRegistroProps) {
  const { t } = useTranslation('tickets')
  const [copia, setCopia] = useState<EstadoCopia>(null)
  const [reintentando, setReintentando] = useState(false)
  const [subidos, setSubidos] = useState(false)
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  const copiar = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error('sin portapapeles')
      }
      await navigator.clipboard.writeText(numero)
      setCopia('copiado')
    } catch {
      setCopia('noDisponible')
    }
  }

  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h5" component="h2" tabIndex={-1} ref={tituloRef} sx={{ outline: 'none' }}>
        {t(ventanilla ? 'nuevo.exito.tituloVentanilla' : 'nuevo.exito.titulo')}
      </Typography>
      <Typography>{t(ventanilla ? 'nuevo.exito.dictar' : 'nuevo.exito.tuNumero')}</Typography>
      <Paper variant="outlined" sx={{ px: 2, py: 1, maxWidth: '100%' }}>
        <Typography
          component="p"
          aria-label={t('nuevo.exito.numero')}
          sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem' }, fontWeight: 700, fontFamily: 'monospace', overflowWrap: 'anywhere' }}
        >
          {numero}
        </Typography>
      </Paper>
      <Button variant="outlined" onClick={() => void copiar()}>
        {t('nuevo.exito.copiar')}
      </Button>
      {copia === 'copiado' && (
        <Alert severity="success" role="status">
          {t('nuevo.exito.copiado')}
        </Alert>
      )}
      {copia === 'noDisponible' && (
        <Alert severity="warning" role="alert">
          {t('nuevo.exito.copiaNoDisponible')}
        </Alert>
      )}
      {subidaFallida && (
        <Alert
          severity="warning"
          role="alert"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={reintentando}
              onClick={async () => {
                setReintentando(true)
                setSubidos(await subidaFallida.reintentar())
                setReintentando(false)
              }}
            >
              {reintentando ? t('nuevo.exito.subiendo') : t('nuevo.exito.reintentar')}
            </Button>
          }
        >
          {t('nuevo.exito.falloSubida')}
          {subidaFallida.errores.map((error) => (
            <Typography key={error} variant="body2">
              {error}
            </Typography>
          ))}
        </Alert>
      )}
      {subidos && (
        <Alert severity="success" role="status">
          {t('nuevo.exito.subidos')}
        </Alert>
      )}
      {!ventanilla && <Typography>{t('nuevo.exito.correo')}</Typography>}
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {!ventanilla && (
          <Button component={Link} to="/tickets" variant="contained">
            {t('nuevo.exito.verMisQuejas')}
          </Button>
        )}
        <Button variant={ventanilla ? 'contained' : 'text'} onClick={onRegistrarOtra}>
          {t('nuevo.exito.registrarOtra')}
        </Button>
      </Stack>
    </Stack>
  )
}
