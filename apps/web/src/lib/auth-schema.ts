import { z } from 'zod';

// Esquema compartido por el formulario de login y el provider de credenciales.
export const credentialsSchema = z.object({
  email: z.string().email('Email no válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export type Credentials = z.infer<typeof credentialsSchema>;
