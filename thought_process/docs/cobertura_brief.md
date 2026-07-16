# Cobertura del brief original vs nuestros documentos

> Revisión sistemática del PDF `LineWise Operaciones ES.pdf` punto a punto, marcando qué se ha cubierto en [`datos.md`](./datos.md) y [`reto.md`](./reto.md), qué se ha decidido conscientemente no cubrir, y qué **gaps o riesgos** quedan por mitigar.

Convenciones: ✅ cubierto · ⚠️ cubierto con asunción que conviene resaltar · 🟡 implícito (no destacado) · ❌ gap real.

---

## 1. El reto en una frase (§1 del PDF)

> *"Construir una herramienta que aprenda de lo que realmente ocurrió … para detectar ineficiencias, simular cambios de planificación y recomendar la mejor línea y secuencia ante nuevas demandas urgentes."*

| Componente del enunciado | Estado | Dónde |
|---|---|---|
| Aprender del histórico real | ✅ | `datos.md` §1 + `reto.md` §2 (modelo de OEE entrenado con histórico) |
| Detectar ineficiencias | ✅ | `reto.md` §4 (post-mortem comparador + drill-down) |
| Simular cambios de planificación | ✅ | `reto.md` §4 + §5 (post-mortem + perturbaciones) |
| Recomendar línea y secuencia | ✅ | `reto.md` §1 (función objetivo) + §6 (línea es decisión del optimizador) |
| Ante nuevas demandas urgentes | ✅ | `reto.md` §5 (perturbación tipo "demanda urgente sobrevenida") |

---

## 2. Contexto de negocio (§2 del PDF)

| Punto | Estado | Notas |
|---|---|---|
| Planificación teórica (Blue Yonder/JDA) vs realidad | ✅ | `datos.md` §1.7 menciona `Cntd JDA` vs `Cntd plan` |
| No sustituir planificación, sino enriquecerla | ✅ | `reto.md` §0 — la propuesta es comparativa, no impositiva |
| Foco en líneas 14/17/19 de El Prat | ✅ | Filtrado implícito en todos los datasets |
| Pregunta de fondo (¿seguir secuencia "lógica" o mover producción?) | ✅ | `reto.md` §4 trata explícitamente este caso |

---

## 3. Objetivos del reto (§3 del PDF)

| Objetivo | Estado | Dónde |
|---|---|---|
| Detectar cambios históricos ineficientes y explicar por qué | ✅ | `reto.md` §4 (drill-down a transición con `C.Brand/C.Envase/…`, contexto, OEE pre/post) |
| Predecir impacto en OEE de nueva secuencia/cambio/reasignación | ✅ | `reto.md` §2 (modelo predictivo) + §1 (función `oee_esperado` que el optimizador evalúa) |
| Comparar escenarios (original vs alternativa) | ✅ | `reto.md` §4 (ΔOEE_pond, Δh_cambios, etc.) |
| Recomendar línea + secuencia con impacto estimado | ✅ | `reto.md` §6 — `sku_line_capability.csv` aporta candidatos; optimizador decide |
| Visualizar y permitir **mover elementos** para ver impacto | ⚠️ | `reto.md` §7 paso 8 menciona "Gantt editable". **Es un requisito explícito del brief** — asegurar que la UI lo implementa, no solo lo visualice |

---

## 4. Datos disponibles (§4 del PDF)

| Dataset que el PDF promete | Mapeo a Excels reales | Estado |
|---|---|---|
| Secuenciaciones desde 2024 | `OEE/Tiempo/Volumen/Mantenimiento 14_17_19_ 2025.xlsx` — solo 2025, no 2024 | ⚠️ El PDF dice "desde 2024" pero los datos son **solo 2025**. Si el organizador tiene 2024 podría enriquecer; no lo pedimos por decisión propia. Anotado en `datos.md` §4 implícito |
| Todos los cambios | `Cambios 14_17_19_ 2025.xlsx` | ✅ `datos.md` §1.6 |
| Mantenimientos realizados | `Mantenimiento 14_17_19_ 2025.xlsx` | ✅ `datos.md` §1.4 + `incident_log.csv` derivado |
| Planificación teórica + ejecución real | `Planificado…` (teórico) + `Produccion_L…` (real) | ✅ `datos.md` §1.7 + §1.9 |
| **OEE por horas** | OEE viene a nivel de WO en `OEE.xlsx`, no por hora | ⚠️ Posible discrepancia. El brief dice "OEE por horas" y la FAQ dice "granularidad por horas". Nuestros datos son por WO (1 WO puede durar varias horas). Podemos derivar OEE-equivalente por hora con `OEE_WO × peso_horas` pero no es nativo. **Sin gap funcional**, solo de fraseo |
| Producción final y rendimientos | `Volumen.xlsx` + `Rendimiento` en OEE | ✅ |
| Tablas de tiempos | `Tiempo.xlsx` | ✅ `datos.md` §1.2 |
| Tablas de volúmenes producidos | `Volumen.xlsx` | ✅ |
| Matriz de cambios por línea | `Tabla CF Prat 2026_14_17_19.xlsx` | ✅ `datos.md` §1.5 |
| Datos externos / métodos | — | 🟡 Decisión propia: no usamos fuentes externas (el brief lo permite pero no obliga). `reto.md` §0 implícito |

---

## 5. Qué se espera que se construya (§5 del PDF)

| Entregable | Estado | Dónde |
|---|---|---|
| Modelo/lógica IA que estime impacto OEE actual y futuro | ✅ | `reto.md` §2 |
| Simulador que acepte nueva demanda o secuencia movida | ✅ | `reto.md` §5 |
| Recomendación línea+secuencia justificada con datos | ✅ | `reto.md` §1 + §4 (drill-down explica el "por qué") |
| Visualización (calendario/Gantt/timeline) | ⚠️ | `reto.md` §7 paso 8. Asegurar que es **interactiva con drag-and-drop**, no solo display |
| Código en repo + demo funcional | 🟡 | No es contenido del .md, es entregable del hackathon |

---

## 6. Reglas de trabajo (§6 del PDF)

| Regla | Estado | Notas |
|---|---|---|
| Datos confidenciales, no salen del hackathon | 🟡 | Implícito. Conviene **no commitear datos al repo**. Añadir `.gitignore` para `data/` y `data - original/` |
| Permitido y deseable complementar con fuentes externas (con cita) | 🟡 | Decidimos no hacerlo. Si surge necesidad, documentarla |
| IA generativa / AutoML / no-code / Streamlit permitidos | ✅ | Sin restricción técnica en la arquitectura |
| Repo entregable + demo funcional (no maqueta estática) | 🟡 | Asunto de ejecución, no del .md |
| Documentar cómo ejecutar y dependencias | 🟡 | Necesario en el README del repo, no aquí |

---

## 7. Qué se valorará (§7 del PDF)

| Criterio | Cómo lo cubrimos | Estado |
|---|---|---|
| **Accionabilidad** (no solo mostrar datos) | Recomendación concreta + drill-down explicativo | ✅ |
| **Solidez técnica** (análisis, modelos, lógica optimización) | Función objetivo en `reto.md` §1, modelo predictivo §2, replay determinista §3 | ✅ |
| **Uso de datos** (limpieza, integración, enriquecimiento) | `datos.md` completo + ETL en próximos pasos | ✅ |
| **Explicabilidad** | Drill-down `reto.md` §4 + feature contributions en §7.8 | ✅ |
| **Demo funcional** | Pendiente de ejecución | 🟡 |

---

## 8. Preguntas frecuentes (§8 del PDF) — alineación con nuestras decisiones

| FAQ | Nuestra implementación |
|---|---|
| No hay matriz de turnos; granularidad por horas | OK. Trabajamos con datos por WO y derivamos a hora cuando hace falta |
| No hay dataset de demanda urgente; podéis simular | ✅ `reto.md` §5 — perturbación tipo demanda urgente desde la UI |
| No hay restricciones duras de compatibilidad; inferir del histórico | ✅ `sku_line_capability.csv` derivado de `executed_runs` |
| Debe haber componente de IA, no solo dashboard | ✅ Modelo predictivo de OEE + post-mortem + comparador |
| Métrica principal: mejora esperada del OEE | ✅ Función objetivo en `reto.md` §1 |
| Podemos usar datos externos | 🟡 Decidimos no, por simplicidad |
| Podemos usar IA generativa | 🟡 No central, podría usarse en la explicabilidad |
| No sacar los datos del hackathon | ⚠️ Asegurar `.gitignore` |
| Documentar supuestos si los datos tienen ruido | ✅ `datos.md` §4 + §5 |

---

## 9. Checklist final del PDF (§9)

| Check del PDF | Cubierto en nuestros docs / pipeline |
|---|---|
| Repo con instrucciones de ejecución | 🟡 Pendiente (README del repo) |
| Demo permite detectar cambios históricos ineficientes | ✅ `reto.md` §4 (post-mortem) |
| Demo permite introducir o simular nueva demanda | ✅ `reto.md` §5 (perturbaciones) |
| Solución recomienda línea+secuencia con impacto OEE | ✅ `reto.md` §1 + §6 |
| Recomendación explicada con datos | ✅ `reto.md` §4 drill-down |
| Documentados supuestos, limitaciones, próximos pasos | ✅ `datos.md` §4-§5 + `reto.md` §7 |

---

## 10. Gaps reales y riesgos a vigilar

| # | Riesgo / gap | Severidad | Mitigación propuesta |
|---|---|---|---|
| 1 | **UI editable con drag-and-drop** del Gantt no está aún detallada — es requisito explícito del brief ("permitir mover elementos para ver impacto") | 🔴 alta | Confirmar en planificación del hackathon que esta capacidad existe en el front (Streamlit + plotly o equivalente). Si no, fallback a "selector de slot + parámetro a editar + recomputar" |
| 2 | **Confidencialidad de datos** | 🔴 alta | Añadir `.gitignore` con `data/`, `data - original/`, `*.xlsx`, `*.parquet`. Verificar antes del primer push |
| 3 | **"OEE por horas"** del brief vs OEE-por-WO en los datos | 🟡 media | Documentar la conversión: OEE por hora derivado pondera el OEE del WO por las horas que cae en cada hora natural. No bloqueante |
| 4 | **Dato "desde 2024"** del brief vs "solo 2025" disponible | 🟡 media | Si el organizador tiene 2024 disponible que no ha enviado, pedirlo o asumir 2025 únicamente. Decisión actual: trabajar con 2025 |
| 5 | **Componente IA real**, no solo reglas | 🟡 media | El modelo de OEE esperado (gradient boosting) cubre este requisito. **No reducirlo a lookup** o el jurado lo notará |
| 6 | **Justificación con datos** en cada recomendación | 🟢 baja | Drill-down al transition level + feature contributions. Verificar que cada recomendación tiene un "por qué" en el render |
| 7 | **Demo en vivo robusta** | 🟢 baja | Probar la demo end-to-end al menos 1 hora antes de presentar; tener fallback con demo grabada |
| 8 | **Latencia del re-plan** | 🟢 baja | <5 s objetivo. Si re-plan completo no cumple, warm-start. Medir durante desarrollo |

---

## 11. Lo que añadimos por encima del brief

Cosas que el brief no exige explícitamente pero que mejoran la solución y son defendibles ante el jurado:

| Aporte | Justificación |
|---|---|
| **Replay determinista de incidentes** (`reto.md` §3) | Asegura que ΔOEE refleja solo lo controlable por secuenciación, no suerte. Argumento sólido de "solidez técnica" |
| **Schema de demanda fuente-agnóstico** (`reto.md` §6) | Permite testing y demo robusta. Argumento de arquitectura limpia |
| **Selector de ventana de comparación** (mes/semana/día) | Adapta el storytelling a la audiencia. Argumento de explicabilidad |
| **Ventana de congelación** en hyperparams | Realismo operativo — los planners no pueden cambiar lo que ya está corriendo |
| **Matriz de beneficio opcional como hiperparámetro** | Cubre el caso "priorizar SKUs rentables" del brief sin requerir info comercial |
| **Hibridación baseline+ML para OEE esperado** | Robustez ante SKUs raros con pocos datos |

---

## 12. Decisiones que conviene mencionar al jurado

Por transparencia (el brief pide documentar supuestos):

1. **Descartamos `Diario Hl_Planif.xlsx`** por redundancia + inconsistencias.
2. **Descartamos `data - 2026-05-18….xlsx`** por ser duplicado de OEE.
3. **No usamos fuentes externas** — decisión consciente para focalizar en el histórico, que es lo que el brief enfatiza.
4. **`Calidad ≡ 1`** → optimizamos solo Disponibilidad × Rendimiento.
5. **Demanda histórica reconstruida = producción real** — no hay otra fuente.
6. **Asignación de línea es decisión del optimizador**, no input. Es uno de los entregables del brief.
7. **Granularidad de demanda = semana**, no día. Refleja cómo planifica realmente el negocio.
