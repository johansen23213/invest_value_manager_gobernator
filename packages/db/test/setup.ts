import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga el .env de la raíz del monorepo si existe (desarrollo local).
// En CI las variables vienen del entorno del job, por lo que la ausencia de
// fichero es inofensiva (dotenv simplemente no hace nada).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });
