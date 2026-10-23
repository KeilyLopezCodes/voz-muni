import { type Filtro, intersectar } from '../../../src/domain/autorizacion/filtro';

type Campo = 'a' | 'b';

describe('intersectar', () => {
  const unaA: Filtro<Campo> = [{ campo: 'a', valor: 1 }];
  const unaB: Filtro<Campo> = [{ campo: 'b', valor: 2 }];

  it('con null da null, sin importar el orden', () => {
    expect(intersectar(null, unaA)).toBeNull();
    expect(intersectar(unaA, null)).toBeNull();
    expect(intersectar<Campo>(null, [])).toBeNull();
  });

  it('[] es neutro: no agrega condiciones', () => {
    expect(intersectar<Campo>([], [])).toEqual([]);
    expect(intersectar([], unaA)).toEqual(unaA);
    expect(intersectar(unaB, [])).toEqual(unaB);
  });

  it('con 2 condiciones devuelve ambas (AND)', () => {
    expect(intersectar(unaA, unaB)).toEqual([
      { campo: 'a', valor: 1 },
      { campo: 'b', valor: 2 },
    ]);
  });
});
