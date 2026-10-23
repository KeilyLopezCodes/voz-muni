import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategoriaFormulario, LimitesMunicipio } from '../../../src/features/tickets/api/registro-api'
import { FormularioQueja } from '../../../src/features/tickets/registro/FormularioQueja'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { CATEGORIAS, type Manejador, renderConConsultas, respuesta, rutasCatalogos, simularApi } from './api-simulada'

// Leaflet no funciona en jsdom: el mapa se reemplaza por dos botones que marcan un punto
// dentro (14.6, -90.5) o fuera (15, -91) de la caja de LIMITES.
vi.mock('../../../src/features/tickets/registro/MapaUbicacion', () => ({
  default: ({ onMarcar }: { onMarcar: (punto: { lat: number; lng: number }) => void }) => (
    <div>
      <button type="button" onClick={() => onMarcar({ lat: 14.6, lng: -90.5 })}>
        tocar dentro
      </button>
      <button type="button" onClick={() => onMarcar({ lat: 15, lng: -91 })}>
        tocar fuera
      </button>
    </div>
  ),
}))

const { nuevo } = tickets

const tituloPaso = () => screen.getByRole('heading', { level: 2 })
const siguiente = () => fireEvent.click(screen.getByRole('button', { name: nuevo.acciones.siguiente }))
const atras = () => fireEvent.click(screen.getByRole('button', { name: nuevo.acciones.atras }))
const campo = (etiqueta: string) => screen.getByLabelText(etiqueta, { exact: false })
const enPaso = (paso: keyof typeof nuevo.pasos) =>
  waitFor(() => expect(tituloPaso()).toHaveTextContent(nuevo.pasos[paso]))

function montar(
  categorias: CategoriaFormulario[] = CATEGORIAS,
  limites?: LimitesMunicipio | null,
  otras: Record<string, Manejador> = {},
) {
  const fetchMock = simularApi({ ...rutasCatalogos({ categorias, limites }), ...otras })
  renderConConsultas(<FormularioQueja rol="vecino" />)
  return fetchMock
}

async function elegirZona(nombre: string) {
  const input = await screen.findByRole('combobox', { name: new RegExp(`^${nuevo.ubicacion.zona}`) })
  fireEvent.change(input, { target: { value: nombre } })
  fireEvent.click(await screen.findByRole('option', { name: nombre }))
}

function escribirDireccion(direccion: string) {
  fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`^${nuevo.ubicacion.direccion}`) }), {
    target: { value: direccion },
  })
}

async function irAUbicacion() {
  await irADescripcion()
  escribirDescripcion('Bache en la calle', 'Hay un bache enorme frente a la escuela')
  siguiente()
  await enPaso('ubicacion')
}

function simularGeolocalizacion(implementacion: Geolocation['getCurrentPosition']) {
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: implementacion } })
}

async function elegirCategoria(nombre: string) {
  fireEvent.click(await screen.findByRole('radio', { name: nombre }))
}

async function irADescripcion() {
  await elegirCategoria('Baches')
  siguiente()
  await enPaso('descripcion')
}

function escribirDescripcion(titulo: string, descripcion: string) {
  fireEvent.change(campo(nuevo.descripcion.titulo), { target: { value: titulo } })
  fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`^${nuevo.descripcion.descripcion}`) }), {
    target: { value: descripcion },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FormularioQueja', () => {
  it('muestra el progreso "Paso N de M" con aria-valuenow', async () => {
    montar()
    const barra = screen.getByRole('progressbar', { name: /^Paso/ })
    expect(barra).toHaveAttribute('aria-valuenow', '1')
    expect(barra).toHaveAttribute('aria-valuemax', '4')
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()

    await irADescripcion()
    expect(screen.getByRole('progressbar', { name: /^Paso/ })).toHaveAttribute('aria-valuenow', '2')
  })

  it('un título de 4 caracteres muestra el error y no avanza', async () => {
    montar()
    await irADescripcion()
    escribirDescripcion('abcd', 'Hay un bache enorme frente a la escuela')
    siguiente()

    expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.errores.TITULO_INVALIDO)
    expect(tituloPaso()).toHaveTextContent(nuevo.pasos.descripcion)
  })

  it('una descripción corta, contada sin espacios, no avanza', async () => {
    montar()
    await irADescripcion()
    escribirDescripcion('Bache en la calle', '   corta    ')
    siguiente()

    expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.errores.DESCRIPCION_INVALIDA)
    expect(tituloPaso()).toHaveTextContent(nuevo.pasos.descripcion)
  })

  it('"Atrás" conserva lo escrito', async () => {
    montar()
    await irADescripcion()
    escribirDescripcion('Bache en la calle', 'Hay un bache enorme frente a la escuela')
    atras()
    await enPaso('categoria')
    expect(screen.getByRole('radio', { name: 'Baches' })).toBeChecked()
    siguiente()
    await enPaso('descripcion')

    expect(campo(nuevo.descripcion.titulo)).toHaveValue('Bache en la calle')
  })

  it('el resumen muestra los datos y "Editar" vuelve al paso', async () => {
    montar()
    await elegirCategoria('Alumbrado público')
    fireEvent.change(await screen.findByRole('textbox', { name: /Número de poste/ }), { target: { value: ' P-123 ' } })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '¿Hay cables expuestos?' })).getByRole('radio', { name: 'Sí' }))
    siguiente()
    await enPaso('descripcion')
    escribirDescripcion('  Poste sin luz  ', 'El poste de la esquina no enciende desde el lunes')
    siguiente()
    await enPaso('ubicacion')
    await elegirZona('El Mirador')
    escribirDireccion('  3a avenida y 5a calle  ')
    fireEvent.click(await screen.findByRole('button', { name: 'tocar dentro' }))
    siguiente()
    await enPaso('resumen')

    const ubicacion = screen.getByRole('region', { name: nuevo.pasos.ubicacion })
    expect(ubicacion).toHaveTextContent('El Mirador')
    expect(ubicacion).toHaveTextContent('3a avenida y 5a calle')
    expect(ubicacion).toHaveTextContent('Punto marcado: 14.6, -90.5')
    const categoria = screen.getByRole('region', { name: nuevo.pasos.categoria })
    expect(categoria).toHaveTextContent('Alumbrado público')
    expect(categoria).toHaveTextContent('Número de poste')
    expect(categoria).toHaveTextContent('P-123')
    expect(categoria).toHaveTextContent('¿Hay cables expuestos?Sí')
    const descripcion = screen.getByRole('region', { name: nuevo.pasos.descripcion })
    expect(descripcion).toHaveTextContent('Poste sin luz')
    expect(descripcion).toHaveTextContent('El poste de la esquina no enciende desde el lunes')
    expect(screen.queryByRole('button', { name: nuevo.acciones.siguiente })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: `Editar ${nuevo.pasos.descripcion}` }))
    await enPaso('descripcion')
    expect(campo(nuevo.descripcion.titulo)).toHaveValue('  Poste sin luz  ')
  })

  it('al cambiar de paso el foco va al título del paso nuevo', async () => {
    montar()
    expect(tituloPaso()).not.toHaveFocus()
    await irADescripcion()
    expect(tituloPaso()).toHaveFocus()
  })

  it('no guarda nada en localStorage ni en sessionStorage', async () => {
    localStorage.clear()
    sessionStorage.clear()
    montar()
    await irADescripcion()
    escribirDescripcion('Bache en la calle', 'Hay un bache enorme frente a la escuela')
    siguiente()

    await enPaso('ubicacion')
    expect(localStorage).toHaveLength(0)
    expect(sessionStorage).toHaveLength(0)
  })

  describe('paso Categoría', () => {
    it('sin elegir categoría no avanza', async () => {
      montar()
      await screen.findByRole('radio', { name: 'Baches' })
      siguiente()

      expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.categoria.requerida)
      expect(tituloPaso()).toHaveTextContent(nuevo.pasos.categoria)
    })

    it('al elegir una categoría aparecen sus campos adicionales en orden', async () => {
      montar()
      await elegirCategoria('Alumbrado público')

      const campos = screen.getByRole('group', { name: nuevo.categoria.camposAdicionales })
      expect(within(campos).getByRole('textbox', { name: /Número de poste/ })).toBeRequired()
      expect(within(campos).getByRole('radiogroup', { name: '¿Hay cables expuestos?' })).toBeInTheDocument()
    })

    it('un campo adicional requerido vacío bloquea el avance', async () => {
      montar()
      await elegirCategoria('Alumbrado público')
      siguiente()

      expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.camposExtra.errores.REQUERIDO)
      expect(tituloPaso()).toHaveTextContent(nuevo.pasos.categoria)
    })

    it('cambiar de categoría vacía los datos adicionales', async () => {
      montar()
      await elegirCategoria('Alumbrado público')
      fireEvent.change(screen.getByRole('textbox', { name: /Número de poste/ }), { target: { value: 'P-123' } })
      await elegirCategoria('Baches')
      await elegirCategoria('Alumbrado público')

      expect(screen.getByRole('textbox', { name: /Número de poste/ })).toHaveValue('')
    })

    it('sin categorías muestra un aviso y no avanza', async () => {
      montar([])
      expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.categoria.sinCategorias)
      siguiente()

      await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
      expect(tituloPaso()).toHaveTextContent(nuevo.pasos.categoria)
    })
  })

  describe('paso Ubicación', () => {
    it('zona y dirección son obligatorias', async () => {
      montar()
      await irAUbicacion()
      siguiente()

      expect(await screen.findByText(nuevo.errores.ZONA_INVALIDA)).toBeInTheDocument()
      expect(screen.getByText(nuevo.errores.DIRECCION_INVALIDA)).toBeInTheDocument()
      expect(tituloPaso()).toHaveTextContent(nuevo.pasos.ubicacion)

      await elegirZona('Zona 1')
      escribirDireccion('Frente al parque central')
      siguiente()
      await enPaso('resumen')
    })

    it('la zona se elige de una lista agrupada por tipo', async () => {
      montar()
      await irAUbicacion()
      const input = await screen.findByRole('combobox', { name: new RegExp(`^${nuevo.ubicacion.zona}`) })
      fireEvent.mouseDown(input)
      fireEvent.change(input, { target: { value: '' } })

      expect(await screen.findByText(nuevo.ubicacion.tipos.colonia)).toBeInTheDocument()
      expect(screen.getByText(nuevo.ubicacion.tipos.zona)).toBeInTheDocument()
    })

    it('con limites: null no se muestra el mapa ni el botón de ubicación', async () => {
      montar(CATEGORIAS, null)
      await irAUbicacion()
      await elegirZona('Zona 1')

      expect(screen.queryByText(nuevo.ubicacion.mapaTitulo)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: nuevo.ubicacion.usarMiUbicacion })).not.toBeInTheDocument()
    })

    it('tocar el mapa marca el punto, otro toque fuera de la caja avisa y no lo mueve', async () => {
      montar()
      await irAUbicacion()
      fireEvent.click(await screen.findByRole('button', { name: 'tocar dentro' }))
      expect(screen.getByRole('status')).toHaveTextContent('Punto marcado: 14.6, -90.5')

      fireEvent.click(screen.getByRole('button', { name: 'tocar fuera' }))
      expect(screen.getByRole('alert')).toHaveTextContent(nuevo.ubicacion.avisos.fueraDelMunicipio)
      expect(screen.getByRole('status')).toHaveTextContent('Punto marcado: 14.6, -90.5')
    })

    it('"Usar mi ubicación" con un punto dentro lo marca, redondeado a 6 decimales', async () => {
      simularGeolocalizacion((exito) =>
        exito({ coords: { latitude: 14.61234567, longitude: -90.51234567 } } as GeolocationPosition),
      )
      montar()
      await irAUbicacion()
      fireEvent.click(await screen.findByRole('button', { name: nuevo.ubicacion.usarMiUbicacion }))

      expect(screen.getByRole('status')).toHaveTextContent('Punto marcado: 14.612346, -90.512346')
    })

    it('"Usar mi ubicación" con un punto fuera avisa y no marca nada', async () => {
      simularGeolocalizacion((exito) => exito({ coords: { latitude: 15, longitude: -91 } } as GeolocationPosition))
      montar()
      await irAUbicacion()
      fireEvent.click(await screen.findByRole('button', { name: nuevo.ubicacion.usarMiUbicacion }))

      expect(screen.getByRole('alert')).toHaveTextContent(nuevo.ubicacion.avisos.fueraDelMunicipio)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('"Usar mi ubicación" con el permiso negado avisa y no marca nada', async () => {
      simularGeolocalizacion((_exito, fallo) => fallo?.({ code: 1 } as GeolocationPositionError))
      montar()
      await irAUbicacion()
      fireEvent.click(await screen.findByRole('button', { name: nuevo.ubicacion.usarMiUbicacion }))

      expect(screen.getByRole('alert')).toHaveTextContent(nuevo.ubicacion.avisos.sinPermiso)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('"Quitar ubicación" borra el punto', async () => {
      montar()
      await irAUbicacion()
      fireEvent.click(await screen.findByRole('button', { name: 'tocar dentro' }))
      fireEvent.click(screen.getByRole('button', { name: nuevo.ubicacion.quitar }))

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: nuevo.ubicacion.quitar })).not.toBeInTheDocument()
    })
  })

  describe('envío del vecino', () => {
    const CREADO = { id: 7, numero: 'Q-2026-000042', estado: 'nueva', creadoEn: '2026-10-23T18:00:00.000Z' }
    const registrar = () => fireEvent.click(screen.getByRole('button', { name: nuevo.acciones.registrar }))

    // Alumbrado público, con sus dos campos adicionales y un punto en el mapa.
    async function llegarAlResumenCompleto() {
      await elegirCategoria('Alumbrado público')
      fireEvent.change(await screen.findByRole('textbox', { name: /Número de poste/ }), { target: { value: ' P-123 ' } })
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: '¿Hay cables expuestos?' })).getByRole('radio', { name: 'Sí' }),
      )
      siguiente()
      await enPaso('descripcion')
      escribirDescripcion('  Poste sin luz  ', 'El poste de la esquina no enciende desde el lunes')
      siguiente()
      await enPaso('ubicacion')
      await elegirZona('El Mirador')
      escribirDireccion(' 3a avenida y 5a calle ')
      fireEvent.click(await screen.findByRole('button', { name: 'tocar dentro' }))
      siguiente()
      await enPaso('resumen')
    }

    // Baches, sin campos adicionales ni punto.
    async function llegarAlResumenSimple() {
      await irAUbicacion()
      await elegirZona('Zona 1')
      escribirDireccion('Frente al parque central')
      siguiente()
      await enPaso('resumen')
    }

    const cuerpoEnviado = (fetchMock: ReturnType<typeof montar>) => {
      const llamada = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      return JSON.parse(String(llamada?.[1]?.body))
    }

    it('llama a POST /api/v1/tickets sin solicitanteId ni canal, con los tipos JSON correctos', async () => {
      const fetchMock = montar(CATEGORIAS, undefined, { 'POST /tickets': () => respuesta(201, CREADO) })
      await llegarAlResumenCompleto()
      registrar()

      await screen.findByText('Q-2026-000042')
      expect(cuerpoEnviado(fetchMock)).toEqual({
        categoriaId: 1,
        zonaId: 11,
        titulo: 'Poste sin luz',
        descripcion: 'El poste de la esquina no enciende desde el lunes',
        direccion: '3a avenida y 5a calle',
        datosExtra: { numero_poste: 'P-123', hay_cables: true },
        lat: 14.6,
        lng: -90.5,
      })
    })

    it('sin campos adicionales ni punto, omite datosExtra, lat y lng', async () => {
      const fetchMock = montar(CATEGORIAS, null, { 'POST /tickets': () => respuesta(201, CREADO) })
      await llegarAlResumenSimple()
      registrar()

      await screen.findByText('Q-2026-000042')
      expect(cuerpoEnviado(fetchMock)).toEqual({
        categoriaId: 2,
        zonaId: 10,
        titulo: 'Bache en la calle',
        descripcion: 'Hay un bache enorme frente a la escuela',
        direccion: 'Frente al parque central',
      })
    })

    it('muestra el número, "Copiar número", "Ver mis quejas" y "Registrar otra"', async () => {
      montar(CATEGORIAS, null, { 'POST /tickets': () => respuesta(201, CREADO) })
      await llegarAlResumenSimple()
      registrar()

      const titulo = await screen.findByRole('heading', { level: 2, name: nuevo.exito.titulo })
      expect(titulo).toHaveFocus()
      expect(screen.getByLabelText(nuevo.exito.numero)).toHaveTextContent('Q-2026-000042')
      expect(screen.getByText(nuevo.exito.correo)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: nuevo.exito.copiar })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: nuevo.exito.verMisQuejas })).toHaveAttribute('href', '/tickets')
      expect(screen.getByRole('button', { name: nuevo.exito.registrarOtra })).toBeInTheDocument()
    })

    it('"Copiar número" usa el portapapeles, y avisa si no está disponible', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      montar(CATEGORIAS, null, { 'POST /tickets': () => respuesta(201, CREADO) })
      await llegarAlResumenSimple()
      registrar()
      fireEvent.click(await screen.findByRole('button', { name: nuevo.exito.copiar }))

      expect(await screen.findByRole('status')).toHaveTextContent(nuevo.exito.copiado)
      expect(writeText).toHaveBeenCalledWith('Q-2026-000042')

      vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
      fireEvent.click(screen.getByRole('button', { name: nuevo.exito.copiar }))
      expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.exito.copiaNoDisponible)
    })

    it('"Registrar otra" vuelve al primer paso con el formulario vacío', async () => {
      montar(CATEGORIAS, null, { 'POST /tickets': () => respuesta(201, CREADO) })
      await llegarAlResumenSimple()
      registrar()
      fireEvent.click(await screen.findByRole('button', { name: nuevo.exito.registrarOtra }))

      await enPaso('categoria')
      expect(screen.getByRole('radio', { name: 'Baches' })).not.toBeChecked()
      expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    })

    it('el botón se deshabilita durante el envío y no se envía dos veces', async () => {
      let responder: (valor: Response) => void = () => {}
      const fetchMock = montar(CATEGORIAS, null, {
        'POST /tickets': () => new Promise<Response>((resolver) => (responder = resolver)),
      })
      await llegarAlResumenSimple()
      registrar()

      const boton = await screen.findByRole('button', { name: nuevo.acciones.registrando })
      expect(boton).toBeDisabled()
      fireEvent.click(boton)
      responder(respuesta(201, CREADO))

      await screen.findByText('Q-2026-000042')
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    })

    it('DATOS_EXTRA_INVALIDOS vuelve al paso Categoría con el error en su campo', async () => {
      montar(CATEGORIAS, undefined, {
        'POST /tickets': () =>
          respuesta(400, {
            codigo: 'DATOS_EXTRA_INVALIDOS',
            mensaje: 'x',
            detalles: [{ campo: 'numero_poste', problema: 'MUY_LARGO' }],
          }),
      })
      await llegarAlResumenCompleto()
      registrar()

      await enPaso('categoria')
      expect(await screen.findByText(/^Debe tener como máximo 20 caracteres./)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /Número de poste/ })).toHaveValue(' P-123 ')
    })

    it('TITULO_INVALIDO vuelve al paso Descripción con el error en el título', async () => {
      montar(CATEGORIAS, null, {
        'POST /tickets': () => respuesta(400, { codigo: 'TITULO_INVALIDO', mensaje: 'x' }),
      })
      await llegarAlResumenSimple()
      registrar()

      await enPaso('descripcion')
      expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.errores.TITULO_INVALIDO)
      expect(campo(nuevo.descripcion.titulo)).toHaveValue('Bache en la calle')
    })

    it('CATEGORIA_INVALIDA vuelve al paso Categoría con un aviso y recarga las categorías', async () => {
      const fetchMock = montar(CATEGORIAS, null, {
        'POST /tickets': () => respuesta(400, { codigo: 'CATEGORIA_INVALIDA', mensaje: 'x' }),
      })
      await llegarAlResumenSimple()
      registrar()

      await enPaso('categoria')
      expect(await screen.findByText(nuevo.avisos.categoriaNoDisponible)).toBeInTheDocument()
      await waitFor(() =>
        expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/categorias')).length).toBeGreaterThan(1),
      )
    })

    it('un error de red se queda en el resumen con un aviso y conserva los datos', async () => {
      montar(CATEGORIAS, null, {
        'POST /tickets': () => {
          throw new TypeError('Failed to fetch')
        },
      })
      await llegarAlResumenSimple()
      registrar()

      expect(await screen.findByText(nuevo.avisos.red)).toBeInTheDocument()
      expect(tituloPaso()).toHaveTextContent(nuevo.pasos.resumen)
      expect(screen.getByRole('region', { name: nuevo.pasos.descripcion })).toHaveTextContent('Bache en la calle')
      expect(screen.getByRole('button', { name: nuevo.acciones.registrar })).toBeEnabled()
    })
  })
})
