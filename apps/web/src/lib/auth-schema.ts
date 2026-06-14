import { z } from 'zod';

// Esquema compartido por el formulario de login y el provider de credenciales.
// El provider de credenciales de Auth.js recibe los campos como strings
// (o undefined si el campo no se envió).
//
// totp y recoveryCode son opcionales: solo se envían en el segundo paso MFA.
// La validación estricta de formato se hace en auth.ts tras confirmar la contraseña.
export const credentialsSchema = z.object({
  email:        z.string().email('Email no válido'),
  password:     z.string().min(1, 'La contraseña es obligatoria'),
  totp:         z.string().optional(),
  recoveryCode: z.string().optional(),
});

export type Credentials = z.infer<typeof credentialsSchema>;
