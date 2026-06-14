# Estrategia de Backup y Disaster Recovery — Vetlla
**Fecha:** 2026-06-14
**Owner:** leo-devops
**Estado:** pendiente de ejecución — bloqueado en Q-004 (OVHcloud, Angel)

---

## Contexto y obligatoriedad

Los datos que gestiona Vetlla son datos de salud (art. 9 RGPD). La pérdida o
indisponibilidad de datos de residentes (expediente, medicación, constantes, PIA)
es inaceptable legal y éticamente. Esta estrategia es **requisito previo al primer
piloto con datos reales** (ver checklist P-06 de la auditoría 2026-06-14).

---

## Objetivos RTO / RPO

| Métrica | Objetivo | Justificación |
|---|---|---|
| **RPO** (Recovery Point Objective) | < 1 hora | PITR de 1h minimiza la pérdida de registros clínicos. |
| **RTO** (Recovery Time Objective) | < 4 horas | Tiempo máximo sin servicio aceptable para un centro. |

Estos objetivos deben revisarse con operaciones y con los centros piloto antes del
lanzamiento. Un fallo de BD en turno de noche con residentes en medicación exige
evaluación real del impacto.

---

## Estrategia de backup (OVHcloud Managed Databases for PostgreSQL)

### Backups automáticos diarios

OVHcloud Managed Databases incluye backups automáticos configurables:

- **Frecuencia:** diaria (snapshot de la BD completa).
- **Retención mínima:** 7 días (ajustable hasta 30 según plan).
- **Ubicación:** región EU del mismo clúster (GRA o SBG). Los backups NO salen de la UE.
- **Cifrado:** en reposo con las claves del proveedor (revisar si OVHcloud ofrece BYOK
  para datos art. 9 RGPD — consultar con Sofia DPO).

Configuración tras crear el clúster (consola OVHcloud o API):
```
# Verificar que los backups automáticos están activos:
ovh cloud database service get --service-name <nombre>
# Buscar campo: backup.regions, backup.retention
```

### PITR (Point-In-Time Recovery)

El PITR requiere WAL (Write-Ahead Log) archivado continuamente. Con OVHcloud:

- Activar PITR en la configuración del clúster (disponible en planes Business/Production).
- **Ventana de PITR objetivo:** mínimo 7 días (cubre una semana de operación).
- Los WALs también permanecen en la UE.

Con PITR activo se puede restaurar a cualquier segundo dentro de la ventana, lo que
permite un RPO < 1 hora en la práctica.

---

## Procedimiento de restore

### Restore desde backup diario (pérdida de hasta 24h)

```bash
# 1. Identificar el backup más reciente antes del incidente:
#    Consola OVHcloud → Databases → <nombre> → Backups → seleccionar punto

# 2. Restaurar a una instancia de BD NUEVA (nunca sobrescribir en producción):
#    OVHcloud ofrece "restore to new instance" desde la consola.
#    También disponible vía API:
#    POST /cloud/project/{serviceName}/database/postgresql/{clusterId}/restore
#    { "timestamp": "<ISO 8601 del punto de restore>" }

# 3. Verificar integridad antes de apuntar la app:
psql "$NEW_DATABASE_URL" -c "SELECT COUNT(*) FROM residents;"
psql "$NEW_DATABASE_URL" -c "SELECT MAX(recorded_at) FROM care_records;"

# 4. Ejecutar app-role.sql sobre la BD restaurada (los GRANTs se recrean):
psql "$NEW_DATABASE_URL" \
  -v app_password="<secreto vetlla_app>" \
  -f packages/db/prisma/sql/app-role.sql

# 5. Actualizar APP_DATABASE_URL para apuntar a la nueva instancia.
# 6. Reiniciar la app.
# 7. Verificar que el healthcheck responde y que los logs no muestran errores.
```

### Restore PITR (pérdida de hasta 1h o menos)

Igual que el anterior, pero en el paso 2 se especifica el timestamp exacto de PITR:

```bash
# Ejemplo: restaurar al estado de hace 30 minutos
RESTORE_TO="$(date -u -d '30 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"
# Usar la API o consola de OVHcloud con ese timestamp.
```

### Drill de restore (OBLIGATORIO antes del primer piloto)

Antes de arrancar con datos reales, ejecutar un restore de prueba completo:

```
1. Crear un backup manual de la BD de staging.
2. Restaurar a una BD efímera de test.
3. Verificar:
   a. psql conecta como vetlla_app con las credenciales del restore.
   b. RLS activa: SELECT desde vetlla_app solo devuelve datos del tenant correcto.
   c. Conteo de registros coherente con el origen.
   d. Las migraciones no necesitan volver a ejecutarse.
4. Documentar el tiempo real de restore (debe ser < RTO = 4h).
5. Destruir la BD efímera de test.
```

Este drill debe repetirse al menos una vez al trimestre y tras cambios mayores de schema.

---

## Monitorización de backups

- Configurar alerta en OVHcloud si el backup diario falla (OVHcloud Alerting o webhook).
- Verificar semanalmente que el último backup tiene menos de 25 horas de antigüedad.
- Incluir el estado del backup en el healthcheck de readiness (`/api/health/ready`) — pendiente.

---

## Multi-region / alta disponibilidad (fase posterior)

El objetivo inicial es single-region EU (GRA) con PITR. Para GA:

- Réplica de lectura en segunda región EU (SBG) — failover manual en caso de fallo de región.
- Tiempo de failover esperado: 15-30 min (manual) → RTO mejoraría a <30 min.
- Evaluación de OVHcloud Managed Databases HA (alta disponibilidad incluida en plan Production).

---

## Referencias

- ADR-0011 — Proveedor de hosting UE (OVHcloud HDS).
- Q-004 — Credenciales OVHcloud + DPA (Angel, bloqueante).
- Q-005 — Confirmación de `CREATE ROLE` en Postgres gestionado.
- `docs/devops/despliegue-ue.md` — Runbook de despliegue.
- Auditoría 2026-06-14, H-14 — Origen de este documento.
