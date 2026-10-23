import { DomainError } from '../../../src/domain/errors/domain-error';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';

describe('Errores de dominio', () => {
  it('InvalidTransitionError expone desde, hacia y el código TRANSICION_INVALIDA', () => {
    const error = new InvalidTransitionError('resuelta', 'en_revision');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect(error.codigo).toBe('TRANSICION_INVALIDA');
    expect(error.desde).toBe('resuelta');
    expect(error.hacia).toBe('en_revision');
    expect(error.name).toBe('InvalidTransitionError');
    expect(error.message).toContain('resuelta');
    expect(error.message).toContain('en_revision');
  });

  it('ReglaDeNegocioError conserva el código y el mensaje que recibe', () => {
    const error = new ReglaDeNegocioError('MOTIVO_REQUERIDO', 'El motivo es obligatorio');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).not.toBeInstanceOf(InvalidTransitionError);
    expect(error.codigo).toBe('MOTIVO_REQUERIDO');
    expect(error.message).toBe('El motivo es obligatorio');
    expect(error.name).toBe('ReglaDeNegocioError');
  });
});
