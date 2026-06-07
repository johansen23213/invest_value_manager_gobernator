import { z } from 'zod';

// Validación de variables de entorno del servidor (Zod). Falla rápido y claro
// si falta configuración. Las variables se documentan en .env.example.
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET es obligatoria'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Variables de entorno inválidas:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  throw new Error('Configuración de entorno inválida. Revisa tu .env (ver .env.example).');
}

export const env = parsed.data;
