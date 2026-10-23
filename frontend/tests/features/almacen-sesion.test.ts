import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  borrarRefresh,
  CLAVE_REFRESH,
  guardarRefresh,
  leerRefresh,
} from '../../src/features/auth/sesion/almacen-sesion'

beforeEach(() => {
  localStorage.clear()
  borrarRefresh()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('almacen-sesion', () => {
  it('guarda, lee y borra el token en localStorage con la clave vozmuni.refreshToken', () => {
    expect(CLAVE_REFRESH).toBe('vozmuni.refreshToken')
    expect(leerRefresh()).toBeNull()

    guardarRefresh('token-1')
    expect(localStorage.getItem('vozmuni.refreshToken')).toBe('token-1')
    expect(leerRefresh()).toBe('token-1')

    borrarRefresh()
    expect(localStorage.getItem('vozmuni.refreshToken')).toBeNull()
    expect(leerRefresh()).toBeNull()
  })

  it('lee el valor actual de localStorage, también si lo cambió otra pestaña', () => {
    guardarRefresh('token-1')
    localStorage.setItem(CLAVE_REFRESH, 'token-de-otra-pestaña')

    expect(leerRefresh()).toBe('token-de-otra-pestaña')
  })

  it('no usa sessionStorage', () => {
    guardarRefresh('token-1')

    expect(sessionStorage.length).toBe(0)
  })

  it('si localStorage lanza al leer, escribir y borrar, no rompe y la sesión vive en memoria', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })

    expect(leerRefresh()).toBeNull()
    expect(() => guardarRefresh('token-1')).not.toThrow()
    expect(leerRefresh()).toBe('token-1')
    expect(() => borrarRefresh()).not.toThrow()
    expect(leerRefresh()).toBeNull()
  })
})
