# Estudio de la competencia — software de gestión para residencias (España)

- **Autor:** equipo Vetlla · **Fecha:** 2026-06-07
- **Método:** búsqueda web (junio 2026) + conocimiento de sector. Fuentes citadas al final.
- **Aviso de fiabilidad:** es un panorama de orientación. Los detalles de producto de cada
  competidor (módulos exactos, arquitectura, si es nube real o escritorio) deben
  **verificarse con demos/fichas oficiales** antes de usarlos en material comercial o de
  inversión. Marcamos con «(?)» lo que no hemos podido confirmar con fuente directa.

---

## 1. Panorama del mercado

El sector de software de gestión sociosanitaria para residencias en España está **maduro y
fragmentado**: hay **más de 8 soluciones** establecidas, varias con 15–30 años de recorrido
y amplia base instalada. El mercado se mueve hoy en tres frentes:

1. **Transición a la nube** (la mayoría nació como escritorio cliente-servidor y migra a web/SaaS).
2. **Apps para familias** (canal de transparencia, ya muy extendido entre grupos grandes).
3. **Inteligencia artificial** (emergente: predicción de riesgos, calidad asistencial,
   apoyo a la decisión; aún mayoritariamente de servidor/propietaria, no "copiloto").

**Líder:** **ResiPlus** (de **ADD Informática**), referencia del sector desde 1990, con
gestión sociosanitaria y administrativa integrada para residencias, centros de día,
discapacidad y vivienda tutelada.

## 2. Principales actores

| Producto | Fabricante | Modelo | Notas |
|---|---|---|---|
| **ResiPlus** | ADD Informática | Escritorio cliente-servidor (Windows/SQL Server) con capas web/app añadidas (?) | Líder histórico (1990). Muy completo: cuidados, medicación, planes de atención, horarios, transporte, comunicación con familias. Producto específico para **vivienda tutelada**. |
| **GERIGES** | Geriges | **Online / SaaS** (pago periódico) | Orientado a cumplir la norma de calidad **UNE 158301**. Expediente del residente, datos médicos/farmacológicos, PIA, control de costes/compras/personal/facturación. |
| **Gestión de Residencias (GdR)** | gestionderesidencias.es | **SaaS** (desde 2006) | Enfoque "simple y flexible". Tiene **app de información a familias**. |
| **Resilife** | (vía Nextret) | Nube, con copia de seguridad automática | Posicionado en **continuidad operativa y resiliencia**. |
| **Resiges** | resiges.com | Software de gestión (residencias y centros de día) | Gestión de residentes y centros de día. |
| **SeniorClose** | SeniorClose | Móvil/tablet | Gestión de la información del residente desde dispositivos; con un clic registra **medicación, comidas y estado**. |

**Apps de familias** (no son ERP, pero compiten en el "portal de familias"): Sanitas
Mayores, **Ágora Familiar** (Grupo Albertia), IMQ Igurco, "Residencias Transparentes"
(bilingüe euskera/castellano, ajuste de tamaño de fuente). Muestran medicación,
alimentación, actividades y estado en tiempo real.

**IA en el sector** (incipiente): proveedores como Ibernex, Costaisa, InterSystems Iberia,
Medicip Health, Zerintia, Dedalus. Soluciones concretas: **ACCURO.AI** (IA de servidor,
algoritmos propietarios, integrada en plataforma de comunicación paciente-enfermería) y
**Verif-AI** (evaluación de calidad asistencial por visión: caídas, patrones de movimiento,
sin contacto). El discurso del sector ya exige **IA explicable y conforme a RGPD + marco
europeo de IA**.

## 3. Ejes de comparación (dónde se juega)

| Eje | Estado del mercado | Hueco para Vetlla |
|---|---|---|
| **Cloud-native real** | Muchos siguen siendo escritorio/cliente-servidor con web "atornillada"; otros ya son SaaS (GERIGES, GdR, Resilife). | "Cloud de verdad", multitenant, alta en minutos, **cero instalación**. |
| **API-first** | Poco visible como argumento; integraciones suelen ser a medida. (?) | Plataforma **API-first** documentada como ventaja de ecosistema. |
| **IA** | Emergente, de servidor/propietaria, sobre todo predicción/visión y apoyo a decisión. | **Copiloto agéntico útil** (lenguaje natural → registro, borrador de PIA) con humano en el bucle. |
| **UX a pie de cama / offline** | Existen apps de registro en tablet (SeniorClose, registros que "acompañan al cuidador"). | **Offline-first** robusto (sin red, sin duplicados) + UX de pocos toques. |
| **Portal de familias** | **Muy extendido** entre grupos grandes. No es diferenciador por sí solo. | Cumplir bien + integrarlo nativo (no como app aparte). |
| **RGPD / datos en UE** | Requisito asumido; la IA añade presión regulatoria. | **RGPD-first** y residencia de datos en UE **desde el diseño** como confianza. |

## 4. Posicionamiento de Vetlla

- **Tesis (del brief):** no competir en **completitud funcional** (la tiene el líder), sino
  en **(1) cloud-native de verdad, (2) API-first, (3) copiloto de IA agéntica**, con
  **UX para auxiliares** y **offline** como ventaja operativa.
- **Lo que el estudio confirma:** el hueco existe — el grueso del mercado es escritorio o
  nube parcial; la IA está empezando y es mayormente de servidor/visión, no un copiloto que
  reduzca el trabajo administrativo; el portal de familias ya está resuelto por muchos (no
  es bandera).
- **Lo que el estudio matiza (riesgos):**
  - Los incumbentes tienen **enorme cobertura funcional** y **base instalada** (coste de
    cambio alto, integración con administración autonómica, inspecciones).
  - **Familias e IA ya están en la conversación** de la competencia → nuestro diferencial
    debe ser **ejecución** (IA realmente útil, offline que funciona, UX), no un checklist.
  - Sector **regulado y conservador**: la confianza (RGPD/UE, trazabilidad, soporte) pesa
    tanto como la tecnología.

## 5. Implicaciones para el producto/UX

1. **No competir por features, competir por fricción**: nuestro caballo de batalla es el
   **flujo del auxiliar** y el **copiloto** (ahorro de tiempo administrativo real).
2. **API-first como cuña de ecosistema**: convertirlo en argumento explícito (integraciones,
   datos del operador, portabilidad).
3. **IA con gobernanza**: explicable, humano en el bucle, datos en UE — alineado con lo que
   el propio sector ya está exigiendo.
4. **Cumplimiento como producto** (roadmap): norma de calidad (UNE 158301, como GERIGES),
   justificación de conciertos/inspecciones autonómicas → es la "cuña defendible" del brief.

## 6. Próximos pasos del estudio (recomendado)

- Verificar con **demos/fichas oficiales** la arquitectura real (nube vs escritorio) y los
  módulos de ResiPlus, GERIGES, GdR y Resilife.
- **Pricing**: recoger modelos (por plaza/módulo) — clave para nuestro `Subscription/PlanTier`.
- Entrevistar a **2–3 centros** que usen el líder para mapear dolores reales (el mejor input
  para los arquetipos Rosa/David/Marta).

---

## Fuentes

- [Mejor Software para Residencias 2026 — SoftwareDOIT](https://www.softwaredoit.es/software-medico/software-residencias.html)
- [ADD Informática — ResiPlus](https://addinformatica.com/) · [Centros de mayores](https://addinformatica.com/software-gestion-centros-mayores/) · [Software de gestión residencias](https://addinformatica.com/software-gestion-residencias/)
- [GERIGES](https://www.geriges.com/) · [GERIGES (SoftwareDOIT)](https://www.softwaredoit.es/geriges/geriges.html)
- [Gestión de Residencias (GdR)](https://www.gestionderesidencias.es/) · [App información a familias (GdR)](https://www.gestionderesidencias.es/app-informacion-familias/)
- [Resilife (Nextret)](https://nextret.net/resilife-software-de-gestion-de-residencias-orientado-a-continuidad-operativa-y-resiliencia/) · [Cómo elegir software (Nextret)](https://nextret.net/como-elegir-un-software-para-residencias-de-ancianos-y-mejorar-la-atencion/)
- [Resiges](https://resiges.com/) · [SeniorClose](https://www.seniorclose.com/)
- [Cómo elegir un software de gestión — Inforesidencias](https://www.inforesidencias.com/blog/index.php/2024/05/22/como-elegir-un-software-de-gestion-para-residencias-de-mayores/)
- [La IA transforma el software de gestión sociosanitario — Alimarket](https://www.alimarket.es/sanidad/noticia/387190/la-ia-transforma-el-software-de-gestion-sociosanitario)
- [IA en residencias — Medicip Health](https://www.mediciphealth.com/ia-en-residencias/)
- [Ágora Familiar — Grupo Albertia](https://www.albertia.es/agora-familiar-la-app-del-grupo-albertia-desarrollada-para-los-familiares-de-los-usuarios/) · [App familias — Sanitas](https://corporativo.sanitas.es/una-aplicacion-movil-acerca-cuidado-los-mayores-familiares/)
