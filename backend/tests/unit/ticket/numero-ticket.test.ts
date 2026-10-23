import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { anioGuatemala, formatearNumero, MAX_CORRELATIVO } from '../../../src/domain/ticket/numero-ticket';

describe('formatearNumero', () => {
  it('rellena el correlativo a 6 dígitos', () => {
    expect(formatearNumero(2026, 123)).toBe('Q-2026-000123');
    expect(formatearNumero(2026, 1)).toBe('Q-2026-000001');
    expect(formatearNumero(2027, MAX_CORRELATIVO)).toBe('Q-2027-999999');
  });

  it('cumple el formato del CHECK de tickets.numero', () => {
    expect(formatearNumero(2026, 42)).toMatch(/^Q-[0-9]{4}-[0-9]{6}$/);
  });

  it('1000000 lanza CORRELATIVO_AGOTADO', () => {
    expect(() => formatearNumero(2026, 1_000_000)).toThrow(ReglaDeNegocioError);
    expect(() => formatearNumero(2026, 1_000_000)).toThrow(expect.objectContaining({ codigo: 'CORRELATIVO_AGOTADO' }));
  });
});

describe('anioGuatemala (UTC-6, sin horario de verano)', () => {
  it('el 31 de diciembre a las 23:59:59 en Guatemala todavía es el año que termina', () => {
    expect(anioGuatemala(new Date('2027-01-01T05:59:59Z'))).toBe(2026);
  });

  it('a la medianoche en Guatemala ya es el año nuevo', () => {
    expect(anioGuatemala(new Date('2027-01-01T06:00:00Z'))).toBe(2027);
  });

  it('el 31 de diciembre a las 23:30 hora de Guatemala da el año en curso', () => {
    expect(anioGuatemala(new Date('2027-01-01T05:30:00Z'))).toBe(2026);
  });
});
