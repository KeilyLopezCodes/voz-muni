import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormularioQueja } from '../../../src/features/tickets/registro/FormularioQueja'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import '../../../src/shared/i18n/i18n'
import { type Manejador, renderConConsultas, respuesta, rutasCatalogos, simularApi } from './api-simulada'

vi.mock('../../../src/features/tickets/registro/MapaUbicacion', () => ({ default: () => null }))

const { nuevo } = tickets
const { solicitante } = nuevo

const VECINO = { id: 31, nombre: 'Ana Pérez', email: 'a***@correo.gt', telefono: '****0000' }
const CREADO = { id: 9, numero: 'Q-2026-000050', estado: 'nueva', creadoEn: '2026-10-23T18:00:00.000Z' }

const tituloPaso = () => screen.getByRole('heading', { level: 2 })
const enPaso = (paso: keyof typeof nuevo.pasos) =>
  waitFor(() => expect(tituloPaso()).toHaveTextContent(nuevo.pasos[paso]))
const siguiente = () => fireEvent.click(screen.getByRole('button', { name: nuevo.acciones.siguiente }))
const textbox = (etiqueta: string) => screen.getByRole('textbox', { name: new RegExp(`^${etiqueta}`) })
const canal = (nombre: string) =>
  within(screen.getByRole('radiogroup', { name: new RegExp(`^${solicitante.canal}`) })).getByRole('radio', {
    name: nombre,
  })

function montar(rutas: Record<string, Manejador> = {}, rol: Rol = 'receptor') {
  const fetchMock = simularApi({
    ...rutasCatalogos({ limites: null }),
    'GET /vecinos': () => respuesta(200, { datos: [VECINO] }),
    ...rutas,
  })
  renderConConsultas(<FormularioQueja rol={rol} />)
  return fetchMock
}

const llamadas = (fetchMock: ReturnType<typeof montar>, metodo: string, ruta: string) =>
  fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === metodo && String(url).includes(ruta))

async function buscarPorTelefono(valor: string) {
  fireEvent.change(textbox(solicitante.tipos.telefono), { target: { value: valor } })
  fireEvent.click(screen.getByRole('button', { name: solicitante.buscar }))
}

function abrirAlta() {
  fireEvent.click(screen.getByRole('button', { name: solicitante.alta.abrir }))
}

function llenarAlta(datos: { nombre?: string; dpi?: string; email?: string; telefono?: string }) {
  const alta = within(screen.getByRole('region', { name: solicitante.alta.titulo }))
  const escribir = (etiqueta: string, valor: string) =>
    fireEvent.change(alta.getByRole('textbox', { name: new RegExp(`^${etiqueta}`) }), { target: { value: valor } })
  escribir(solicitante.alta.nombre, datos.nombre ?? 'Juan García')
  escribir(solicitante.alta.dpi, datos.dpi ?? '2547 12345 0101')
  escribir(solicitante.alta.email, datos.email ?? '')
  escribir(solicitante.alta.telefono, datos.telefono ?? '')
  fireEvent.click(alta.getByRole('button', { name: solicitante.alta.registrar }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PasoSolicitante', () => {
  it('el vecino no ve este paso', () => {
    montar({}, 'vecino')
    expect(tituloPaso()).toHaveTextContent(nuevo.pasos.categoria)
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: solicitante.buscar })).not.toBeInTheDocument()
  })

  it.each(['receptor', 'supervisor'] as const)('%s empieza por Solicitante, de 5 pasos', (rol) => {
    montar({}, rol)
    expect(tituloPaso()).toHaveTextContent(nuevo.pasos.solicitante)
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
  })

  it('buscar por teléfono muestra los resultados enmascarados, y elegir uno habilita el canal', async () => {
    const fetchMock = montar()
    expect(canal(solicitante.canales.telefono)).toBeDisabled()
    await buscarPorTelefono('5555-0000')

    const lista = await screen.findByRole('list', { name: solicitante.resultados })
    expect(lista).toHaveTextContent('Ana Pérez')
    expect(lista).toHaveTextContent('a***@correo.gt · ****0000')
    expect(String(llamadas(fetchMock, 'GET', '/vecinos')[0][0])).toBe('/api/v1/vecinos?telefono=5555-0000')

    fireEvent.click(screen.getByRole('button', { name: 'Elegir a Ana Pérez' }))
    expect(screen.getByRole('region', { name: solicitante.elegido })).toHaveTextContent('Ana Pérez')
    expect(canal(solicitante.canales.telefono)).toBeEnabled()
  })

  it('un teléfono mal escrito no busca', async () => {
    const fetchMock = montar()
    await buscarPorTelefono('5555')

    expect(await screen.findByRole('alert')).toHaveTextContent(solicitante.errores.TELEFONO_INVALIDO)
    expect(llamadas(fetchMock, 'GET', '/vecinos')).toHaveLength(0)
  })

  it('sin resultados lo dice y ofrece el alta', async () => {
    montar({ 'GET /vecinos': () => respuesta(200, { datos: [] }) })
    await buscarPorTelefono('55550000')

    expect(await screen.findByText(solicitante.sinResultados)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: solicitante.alta.abrir })).toBeInTheDocument()
  })

  it('no avanza sin vecino ni canal', async () => {
    montar()
    siguiente()
    expect(await screen.findByText(solicitante.requerido)).toBeInTheDocument()
    expect(screen.getByText(solicitante.canalRequerido)).toBeInTheDocument()
    expect(tituloPaso()).toHaveTextContent(nuevo.pasos.solicitante)
  })

  describe('vecino nuevo', () => {
    it('valida el DPI sin llamar a la API', async () => {
      const fetchMock = montar()
      abrirAlta()
      llenarAlta({ dpi: '12345', telefono: '55550000' })

      expect(await screen.findByText(solicitante.errores.DPI_INVALIDO)).toBeInTheDocument()
      expect(llamadas(fetchMock, 'POST', '/vecinos')).toHaveLength(0)
    })

    it('exige correo o teléfono', async () => {
      const fetchMock = montar()
      abrirAlta()
      llenarAlta({})

      expect(await screen.findByText(solicitante.errores.SIN_CONTACTO)).toBeInTheDocument()
      expect(llamadas(fetchMock, 'POST', '/vecinos')).toHaveLength(0)
    })

    it('llama a POST /vecinos y deja elegido al vecino creado', async () => {
      const fetchMock = montar({
        'POST /vecinos': () =>
          respuesta(201, { vecino: { id: 40, nombre: 'Juan García', email: null, telefono: '****0000' }, invitacionEnviada: false }),
      })
      abrirAlta()
      llenarAlta({ telefono: '5555-0000' })

      expect(await screen.findByRole('region', { name: solicitante.elegido })).toHaveTextContent('Juan García')
      expect(JSON.parse(String(llamadas(fetchMock, 'POST', '/vecinos')[0][1]?.body))).toEqual({
        nombre: 'Juan García',
        dpi: '2547 12345 0101',
        telefono: '5555-0000',
      })
      // Sin correo no hay invitación que avisar.
      expect(screen.queryByText(solicitante.sinInvitacion)).not.toBeInTheDocument()
    })

    it('si dio correo y la invitación no salió, avisa', async () => {
      montar({
        'POST /vecinos': () =>
          respuesta(201, { vecino: { id: 40, nombre: 'Juan García', email: 'j***@correo.gt', telefono: null }, invitacionEnviada: false }),
      })
      abrirAlta()
      llenarAlta({ email: 'juan@correo.gt' })

      expect(await screen.findByText(solicitante.sinInvitacion)).toBeInTheDocument()
    })

    it('DPI_DUPLICADO pide buscarlo', async () => {
      montar({ 'POST /vecinos': () => respuesta(409, { codigo: 'DPI_DUPLICADO', mensaje: 'x' }) })
      abrirAlta()
      llenarAlta({ telefono: '55550000' })

      expect(await screen.findByRole('alert')).toHaveTextContent(nuevo.avisos.vecinoDuplicado)
      expect(screen.queryByRole('region', { name: solicitante.elegido })).not.toBeInTheDocument()
    })
  })

  it('el envío final incluye solicitanteId y el canal elegido', async () => {
    const fetchMock = montar({ 'POST /tickets': () => respuesta(201, CREADO) })
    await buscarPorTelefono('55550000')
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir a Ana Pérez' }))
    fireEvent.click(canal(solicitante.canales.telefono))
    siguiente()

    await enPaso('categoria')
    fireEvent.click(await screen.findByRole('radio', { name: 'Baches' }))
    siguiente()
    await enPaso('descripcion')
    fireEvent.change(textbox(nuevo.descripcion.titulo), { target: { value: 'Bache en la calle' } })
    fireEvent.change(textbox(nuevo.descripcion.descripcion), {
      target: { value: 'Hay un bache enorme frente a la escuela' },
    })
    siguiente()
    await enPaso('ubicacion')
    const zona = screen.getByRole('combobox', { name: new RegExp(`^${nuevo.ubicacion.zona}`) })
    fireEvent.change(zona, { target: { value: 'Zona 1' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Zona 1' }))
    fireEvent.change(textbox(nuevo.ubicacion.direccion), { target: { value: 'Frente al parque central' } })
    siguiente()
    await enPaso('resumen')

    const seccion = screen.getByRole('region', { name: nuevo.pasos.solicitante })
    expect(seccion).toHaveTextContent('Ana Pérez')
    expect(seccion).toHaveTextContent(solicitante.canales.telefono)
    fireEvent.click(screen.getByRole('button', { name: nuevo.acciones.registrar }))

    expect(await screen.findByRole('heading', { level: 2, name: nuevo.exito.tituloVentanilla })).toBeInTheDocument()
    expect(screen.getByText(nuevo.exito.dictar)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: nuevo.exito.verMisQuejas })).not.toBeInTheDocument()
    expect(JSON.parse(String(llamadas(fetchMock, 'POST', '/tickets')[0][1]?.body))).toEqual({
      categoriaId: 2,
      zonaId: 10,
      titulo: 'Bache en la calle',
      descripcion: 'Hay un bache enorme frente a la escuela',
      direccion: 'Frente al parque central',
      solicitanteId: 31,
      canal: 'telefono',
    })
  })
})
