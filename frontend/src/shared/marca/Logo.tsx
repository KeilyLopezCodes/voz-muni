import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'

// Globo de diálogo con tres barras de "voz" recortadas (evenodd): una sola tinta, currentColor,
// así toma el color de donde se use (índigo sobre crema, blanco sobre el panel de marca).
const GLOBO =
  'M10 6H38A8 8 0 0 1 46 14V30A8 8 0 0 1 38 38H22L13 45V38H10A8 8 0 0 1 2 30V14A8 8 0 0 1 10 6Z' +
  'M14 18H18V26H14Z M22 14H26V30H22Z M30 18H34V26H30Z'

interface LogoProps {
  // 'icono': solo el globo. 'completo': globo y el nombre "VozMuni".
  variante?: 'icono' | 'completo'
  // Alto del globo en px.
  tamano?: number
  // true cuando el nombre ya está al lado como texto (por ejemplo, el h1 de PantallaPublica).
  decorativo?: boolean
  sx?: SxProps<Theme>
}

// Logotipo genérico de VozMuni (SPEC 44). La marca de cada municipalidad queda para una spec futura.
export function Logo({ variante = 'completo', tamano = 40, decorativo = false, sx }: LogoProps) {
  const { t } = useTranslation('comun')
  const accesible = decorativo ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t('marca.logo') }
  return (
    <Box
      {...accesible}
      sx={[{ display: 'inline-flex', alignItems: 'center', gap: 1, color: 'primary.main' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Box component="svg" viewBox="0 0 48 48" width={tamano} height={tamano} sx={{ flexShrink: 0, display: 'block' }}>
        <path d={GLOBO} fill="currentColor" fillRule="evenodd" />
      </Box>
      {variante === 'completo' && (
        <Typography component="span" aria-hidden sx={{ fontWeight: 800, fontSize: tamano * 0.6, lineHeight: 1, color: 'inherit' }}>
          {t('marca.logo')}
        </Typography>
      )}
    </Box>
  )
}
