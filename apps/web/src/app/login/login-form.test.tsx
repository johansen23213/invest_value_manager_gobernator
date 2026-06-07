import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// La server action no puede ejecutarse en jsdom; la mockeamos.
vi.mock('@/app/login/actions', () => ({
  authenticate: vi.fn(async () => undefined),
}));

import { LoginForm } from './login-form';

describe('LoginForm', () => {
  it('renderiza los campos y el botón de entrar', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });
});
