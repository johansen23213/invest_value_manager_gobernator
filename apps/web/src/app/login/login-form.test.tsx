import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// La server action no puede ejecutarse en jsdom; la mockeamos.
vi.mock('@/app/login/actions', () => ({
  authenticate: vi.fn(async () => undefined),
}));

import { LoginForm } from './login-form';
import { I18nProvider } from '@/i18n/provider';

describe('LoginForm', () => {
  it('renderiza los campos y el botón de entrar', () => {
    render(
      <I18nProvider locale="es">
        <LoginForm />
      </I18nProvider>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });
});
