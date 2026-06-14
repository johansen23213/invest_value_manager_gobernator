# Disciplina de verificación

> Se carga automáticamente con CLAUDE.md
> Nace de la auditoría 2026-06-14: el CIO dio CI por verde llevando días rojo, y
> reportó una feature (push) como hecha sin comprobarla. No repetir.

---

## Principio: verificar, no validar

Un report (propio o de un especialista) NO es evidencia. La evidencia es la ejecución.
Antes de decir "hecho", "verde" o "cerrado":

1. **CI verde > local verde.** Lo que pasa en local (donde el rol de app ya existe, la BD
   ya tiene datos, las migraciones ya están aplicadas) NO prueba que pase en un entorno
   limpio. Tras cada merge a `main`, **comprobar el estado real del run de CI** (no asumirlo).
   Un gate rojo desatendido es un fallo de gobierno.

2. **No reportar "hecho" sin comprobarlo.** Si un especialista dice que añadió X (un handler,
   un endpoint, una clave), **verificarlo en el código/BD** antes de propagarlo o de
   comunicárselo a Angel. Caso real: se reportó el service worker de push con handlers que
   no existían.

3. **Verificar los hallazgos, también los propios.** En una auditoría/incidente, el CIO
   comprueba en vivo los críticos en lugar de fiarse de los reportes. Esto caza falsos
   positivos (un auditor dijo ".env en git" — era falso) y confirma los reales.

4. **Paridad dev ↔ CI ↔ prod.** Si el entorno local no ejercita lo mismo que CI/prod
   (p. ej. RLS solo se enforce con el rol no-propietario), el local miente. Cerrar esas
   divergencias es prioridad: ocultan bugs hasta producción.

5. **Los tests que no corren no protegen.** "Compila / se parsea" ≠ "se ejecuta". Un suite
   e2e que solo se lista en CI no cubre nada. Un permiso sin test de matriz no está cubierto.

## Cómo se aplica

- Tras propagar a `main`: confirmar CI en verde (run real) antes de declarar un hito cerrado.
- Antes de marcar algo en `project_state.yaml` como `done`: la verificación concreta que lo
  respalda (qué se ejecutó y con qué resultado), no "el especialista dijo".
- Ante un report sorprendentemente positivo: dudar y comprobar.
- Honestidad con uno mismo: documentar los propios errores (como este) para no repetirlos.
