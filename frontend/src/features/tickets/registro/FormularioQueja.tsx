import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ComponentType, useEffect, useRef, useState } from 'react'
import { FormProvider, type Path, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import type { Rol } from '../../../shared/auth/roles'
import { CLAVES_REGISTRO, crearTicket, listarCategorias } from '../api/registro-api'
import { type Aviso, camposExtraConError, destinoDeError } from './errores-registro'
import { cuerpoDelRegistro, ESTADO_INICIAL, type EstadoRegistro, type Paso, pasosPara } from './estado-registro'
import { ExitoRegistro } from './ExitoRegistro'
import { PasoCategoria } from './PasoCategoria'
import { PasoDescripcion } from './PasoDescripcion'
import { PasoResumen } from './PasoResumen'
import { PasoSolicitante } from './PasoSolicitante'
import { PasoUbicacion } from './PasoUbicacion'

interface FormularioQuejaProps {
  rol: Rol
}

// Contenido de cada paso; el resumen se monta aparte porque necesita la navegación.
const CONTENIDO: Partial<Record<Paso, ComponentType>> = {
  solicitante: PasoSolicitante,
  categoria: PasoCategoria,
  descripcion: PasoDescripcion,
  ubicacion: PasoUbicacion,
}

// Campos que se validan antes de salir de cada paso.
const CAMPOS_POR_PASO: Partial<Record<Paso, Path<EstadoRegistro>[]>> = {
  solicitante: ['solicitante', 'canal'],
  categoria: ['categoriaId', 'datosExtra'],
  descripcion: ['titulo', 'descripcion'],
  ubicacion: ['zonaId', 'direccion', 'ubicacion'],
}

// Formulario por pasos de SPEC 18. El estado vive solo en memoria: recargar pierde lo escrito.
export function FormularioQueja({ rol }: FormularioQuejaProps) {
  const { t } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const metodos = useForm<EstadoRegistro>({ defaultValues: ESTADO_INICIAL, mode: 'onTouched' })
  const categorias = useQuery({ queryKey: CLAVES_REGISTRO.categorias, queryFn: listarCategorias })
  const pasos = pasosPara(rol)
  const ventanilla = pasos.includes('solicitante')
  const [indice, setIndice] = useState(0)
  const [aviso, setAviso] = useState<{ paso: Paso; aviso: Aviso } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [numero, setNumero] = useState<string | null>(null)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const montado = useRef(false)

  const paso = pasos[indice]
  const esUltimo = indice === pasos.length - 1

  // Al cambiar de paso, el foco va a su título (no al cargar la página).
  useEffect(() => {
    if (montado.current) {
      tituloRef.current?.focus()
    }
    montado.current = true
  }, [indice])

  const irAPaso = (destino: Paso) => setIndice(Math.max(pasos.indexOf(destino), 0))

  const siguiente = async () => {
    const campos = CAMPOS_POR_PASO[paso] ?? []
    if (campos.length > 0 && !(await metodos.trigger(campos, { shouldFocus: true }))) {
      return
    }
    setAviso(null)
    setIndice((actual) => Math.min(actual + 1, pasos.length - 1))
  }

  const atras = () => setIndice((actual) => Math.max(actual - 1, 0))

  const camposDeLaCategoria = () =>
    categorias.data?.find((categoria) => categoria.id === metodos.getValues('categoriaId'))?.camposExtra ?? []

  // Lleva el error del backend a su paso y su campo, sin tocar lo escrito.
  const mostrarError = (error: unknown) => {
    const codigo = error instanceof ApiError ? error.codigo : ''
    const destino = destinoDeError(codigo)
    const pasoDestino = pasos.includes(destino.paso) ? destino.paso : 'resumen'
    let avisoDestino = destino.aviso

    if (destino.campo) {
      metodos.setError(destino.campo, { message: t(`nuevo.errores.${codigo}`) })
    }
    if (destino.camposExtra && error instanceof ApiError) {
      const campos = camposDeLaCategoria()
      for (const { nombre, problema } of camposExtraConError(error.detalles)) {
        const campo = campos.find((definicion) => `datosExtra.${definicion.clave}` === nombre)
        if (!campo) {
          // La definición cambió desde que se cargó: se recarga y se pide revisar.
          avisoDestino = 'camposActualizados'
          void queryClient.invalidateQueries({ queryKey: CLAVES_REGISTRO.categorias })
          continue
        }
        const limites = 'min' in campo || 'max' in campo ? { min: campo.min, max: campo.max } : {}
        metodos.setError(nombre, { message: t(`nuevo.camposExtra.errores.${problema}`, limites) })
      }
    }
    for (const efecto of destino.efectos ?? []) {
      if (efecto === 'recargarCategorias') {
        void queryClient.invalidateQueries({ queryKey: CLAVES_REGISTRO.categorias })
      } else if (efecto === 'recargarLimites') {
        void queryClient.invalidateQueries({ queryKey: CLAVES_REGISTRO.limites })
      } else if (efecto === 'quitarUbicacion') {
        metodos.setValue('ubicacion', null)
      } else {
        metodos.setValue('solicitante', null)
      }
    }

    setAviso(avisoDestino ? { paso: pasoDestino, aviso: avisoDestino } : null)
    irAPaso(pasoDestino)
  }

  const registrar = async () => {
    setEnviando(true)
    setAviso(null)
    try {
      const cuerpo = cuerpoDelRegistro(metodos.getValues(), { ventanilla, camposExtra: camposDeLaCategoria() })
      const creado = await crearTicket(cuerpo)
      setNumero(creado.numero)
    } catch (error) {
      mostrarError(error)
    } finally {
      setEnviando(false)
    }
  }

  const registrarOtra = () => {
    metodos.reset(ESTADO_INICIAL)
    setNumero(null)
    setAviso(null)
    setIndice(0)
  }

  if (numero) {
    return <ExitoRegistro numero={numero} ventanilla={ventanilla} onRegistrarOtra={registrarOtra} />
  }

  const Contenido = CONTENIDO[paso]

  return (
    <FormProvider {...metodos}>
      <Box
        component="form"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          if (!esUltimo) {
            void siguiente()
          } else if (!enviando) {
            void registrar()
          }
        }}
      >
        <Typography variant="body2" color="text.secondary" id="progreso-registro">
          {t('nuevo.progreso', { actual: indice + 1, total: pasos.length })}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={((indice + 1) / pasos.length) * 100}
          aria-labelledby="progreso-registro"
          aria-valuenow={indice + 1}
          aria-valuemin={1}
          aria-valuemax={pasos.length}
          aria-valuetext={t('nuevo.progreso', { actual: indice + 1, total: pasos.length })}
          sx={{ mt: 1, mb: 3 }}
        />

        <Typography variant="h5" component="h2" tabIndex={-1} ref={tituloRef} gutterBottom sx={{ outline: 'none' }}>
          {t(`nuevo.pasos.${paso}`)}
        </Typography>

        {aviso?.paso === paso && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }}>
            {t(`nuevo.avisos.${aviso.aviso}`)}
          </Alert>
        )}

        {paso === 'resumen' ? <PasoResumen pasos={pasos} irAPaso={irAPaso} /> : Contenido && <Contenido />}

        <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: 'space-between' }}>
          {indice > 0 ? (
            <Button variant="outlined" onClick={atras} disabled={enviando}>
              {t('nuevo.acciones.atras')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="contained" disabled={enviando}>
            {esUltimo
              ? t(enviando ? 'nuevo.acciones.registrando' : 'nuevo.acciones.registrar')
              : t('nuevo.acciones.siguiente')}
          </Button>
        </Stack>
      </Box>
    </FormProvider>
  )
}
