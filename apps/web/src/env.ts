import { z } from 'zod';

// Validación de variables de entorno del servidor (Zod). Falla rápido y claro
// si falta configuración. Las variables se documentan en .env.example.
//
// NOTA: ANTHROPIC_API_KEY está intencionalmente AUSENTE de este schema.
// El acceso a Claude debe ser exclusivamente vía BedrockProvider o VertexProvider
// (ambos detrás de la interfaz ModelProvider con residencia UE garantizada).
// No añadir una clave directa de Anthropic aquí: saltaría la capa de
// seudonimización y enviaría PII fuera del control de la capa ai/ (ADR-0010).
// Cuando se implemente BedrockProvider/VertexProvider, las credenciales necesarias
// (AI_BEDROCK_REGION, AI_VERTEX_PROJECT…) se definen en packages/ai/src/models.ts.
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET es obligatoria'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // SEC-C01: clave AES-256-GCM para cifrar el secreto TOTP en reposo.
  // Debe ser de exactamente 32 bytes codificados en base64.
  // Genera una con: openssl rand -base64 32
  // KMS-ready (Q-SEC): cuando se integre KMS soberano UE, este campo queda obsoleto
  // y getKey() en mfa-crypto.ts se sustituye por la llamada al KMS.
  MFA_ENCRYPTION_KEY: z.string().min(1, 'MFA_ENCRYPTION_KEY es obligatoria (32 bytes en base64)'),
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
