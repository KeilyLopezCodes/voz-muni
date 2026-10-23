import { describe, expect, it } from 'vitest'
import { destinoTrasLogin } from '../../src/features/auth/destino-login'

describe('destinoTrasLogin', () => {
  it.each([
    ['vecino', undefined, '/tickets'],
    ['administrador', undefined, '/admin'],
    ['vecino', null, '/tickets'],
    ['vecino', {}, '/tickets'],
    ['vecino', { desde: 42 }, '/tickets'],
    ['vecino', { desde: '/tickets/nueva' }, '/tickets/nueva'],
    ['vecino', { desde: '/tickets?pagina=2' }, '/tickets?pagina=2'],
    ['supervisor', { desde: '/reportes' }, '/reportes'],
    // Rutas que el rol no puede usar, o que no son protegidas.
    ['vecino', { desde: '/admin' }, '/tickets'],
    ['administrador', { desde: '/tickets/nueva' }, '/admin'],
    ['vecino', { desde: '/' }, '/tickets'],
    ['vecino', { desde: '/no-existe' }, '/tickets'],
    // Destinos externos.
    ['vecino', { desde: '//evil.com' }, '/tickets'],
    ['vecino', { desde: '/\\evil.com' }, '/tickets'],
    ['vecino', { desde: 'https://evil.com' }, '/tickets'],
    ['vecino', { desde: 'tickets' }, '/tickets'],
  ] as const)('%s con estado %j → %s', (rol, estado, esperado) => {
    expect(destinoTrasLogin(rol, estado)).toBe(esperado)
  })
})
