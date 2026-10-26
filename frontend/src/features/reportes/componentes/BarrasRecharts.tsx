import { useTheme } from '@mui/material/styles'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface Props {
  datos: { etiqueta: string; cantidad: number }[]
  etiquetaValor: string
}

const ALTO_BARRA = 36

// Barras horizontales de Recharts (SPEC 43). Se carga con React.lazy: Recharts queda fuera del bundle inicial.
// Cada barra lleva su número, así el color nunca es la única forma de leer el dato.
export default function BarrasRecharts({ datos, etiquetaValor }: Props) {
  const theme = useTheme()
  const paleta = (theme.vars ?? theme).palette
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, datos.length * ALTO_BARRA + 40)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 8, right: 40, bottom: 8, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={paleta.divider} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: paleta.text.secondary, fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={120}
          tick={{ fill: paleta.text.secondary, fontSize: 12 }}
          interval={0}
        />
        <Tooltip />
        <Bar dataKey="cantidad" name={etiquetaValor} fill={paleta.primary.main} radius={[0, 6, 6, 0]} isAnimationActive={false}>
          <LabelList dataKey="cantidad" position="right" fill={paleta.text.primary} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
