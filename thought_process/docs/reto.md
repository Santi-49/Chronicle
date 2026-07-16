# LineWise — Comprensión del reto y metodología

> Reto Damm × Engineering HUB. Líneas 14 / 17 / 19 de latas, fábrica El Prat.
> Este documento describe **qué hemos entendido que pide el reto**, **cómo planteamos resolverlo** (función objetivo, post-mortem, simulación realista, perturbaciones) y los **contratos** entre módulos. Los datos crudos están descritos en [`datos.md`](./datos.md).

---

## 0. Lectura del reto en una página

**Lo que pide Damm**:
1. Detectar cambios históricos ineficientes y explicar por qué impactaron en el OEE.
2. Predecir el impacto en OEE de una nueva secuencia / cambio / reasignación de línea.
3. Permitir comparar escenarios (planificación original vs alternativa).
4. Recomendar línea + secuencia con impacto estimado en OEE.
5. Visualizar la secuenciación y permitir mover elementos para ver el impacto esperado.
6. Demo funcional + repo + componente IA.

**Nuestro encuadre del problema**:
- La unidad de planificación es la **semana** (lunes → domingo). La demanda llega como buckets semanales: "esta semana hay que producir N uds de SKU S".
- El optimizador decide, dentro de cada semana, **qué línea**, **qué día** y **qué turno** ejecutan cada bucket, en qué orden y con qué cambios entre WOs.
- La métrica objetivo es **horas productivas efectivas** = Σ OEE × duración_run (matemáticamente equivalente a minimizar tiempo perdido cuando Calidad ≡ 1, que es nuestro caso).
- El post-mortem es **comparar la planificación real de Damm vs la propuesta del optimizador** a la ventana que elija el usuario (mes / semana / día). El zoom a día es el más explicable.
- El simulador soporta **perturbaciones en marcha**: averías y demanda urgente sobrevenida → re-plan del horizonte restante respetando una ventana de congelación.
- Los incidentes de máquina se **replayean determinísticamente** cuando se evalúa `S_opt` sobre histórico, para que la comparación sea justa.

---

## 1. Métrica de optimización: cómo conjugar tiempo y OEE

### 1.1 Descomposición disponible

```
OEE = Disponibilidad × Rendimiento × Calidad

Disponibilidad ≈ (H. Tot. - Par. tot - Limpieza - CIP) / H. Tot.
Rendimiento     = UDS_producidas / (Tiempo Operativo × Velocidad teórica)
Calidad         = UDS_buenas / UDS_producidas    (≡ 1 en este dataset)
```

Como **Calidad ≡ 1**, en este reto **OEE = A × P** y se puede reformular completamente en horas:

```
Tiempo perdido por WO = H. Tot. × (1 - OEE)
                       = paros + baja velocidad + limpieza/CIP + espera mantenimiento
```

**Equivalencia clave**: maximizar `Σ OEE × duración` ≡ minimizar tiempo perdido ponderado. Es la misma optimización expresada en la métrica que Damm reporta.

### 1.2 Coste de una secuencia

Sea una secuencia `S = [WO_1, …, WO_k]` en una línea `L`:

```
C(S) = Σ_i  duration_run(WO_i)                          (tiempo productivo neto)
     + Σ_i  changeover(WO_{i-1}.sku → WO_i.sku, L)      (tiempo de cambio)
     + Σ_e  forced_event(viernes_limpieza, lunes_mant)  (eventos fijos)
     + Σ_i  expected_downtime(WO_i)                     (downtime esperado por SKU/línea)
     − bonus_oee(WO_i)                                  (premio por OEE histórico alto en esa línea)
```

donde:

```
duration_run(WO_i)        = uds_pedidas(WO_i) / velocidad_efectiva(sku_i, L)
velocidad_efectiva(sku,L) = mediana(UDS / Tiempo Máquina en Marcha) por (sku, línea)
expected_downtime(WO_i)   = E[H.Tot.×(1-OEE) | sku, línea, día_semana] (modelo)
changeover(a→b, L)        = max( T_teórico(a,b,L), media_empírica(a→b,L) )
```

### 1.3 Construcción de `changeover(a→b, L)`

1. **Base teórica** desde `Tabla CF Prat 2026…`:
   - `cambio_lata` (tipo envase a → b)
   - `cambio_cerveza` si cambia `Cerveza`
   - `cambio_etiqueta/tapón` si cambia `Mat. Precio` con misma cerveza
   - `cambio_packaging` si cambia `Packaging Primario/Secundario`
   - `arranque/final` si hay cambio de turno con personal distinto
2. **Ajuste empírico** desde `Cambios + Tiempo`:
   - Para cada par `(sku_prev, sku_actual)` o por componentes (flags `C.Brand=1`, `C.Envase=1`, …) → `Tiempo Máquina en paro` o primer tramo `PNP` previo a marcha.
   - Si ≥ 5 observaciones por par/combinación → mediana empírica; si no → teórico.
3. **Penalización por incertidumbre**: añadir P75/P90 si se quiere política conservadora.

### 1.4 Función objetivo

```
maximize    Σ_i  OEE_estimado(WO_i) × duration_run(WO_i)   ← horas productivas reales

           − λ · changeover_total
           + ν · margen[sku] · UDS_producidas[sku]          ← beneficio de lo producido
           − μ · uds_no_cubiertas[sku] · margen[sku]        (penalty por demanda dropeada, redundante con +ν)
```

Hiperparámetros: `λ`, `μ`, `ν`, **horizonte de planificación** (default 1 mes), **ventana de congelación** y `margen[sku]` (€/uds, default = todos iguales).

**Dos regímenes implícitos** (no requiere lógica adicional):

1. **Demanda factible** (toda la demanda cabe en el horizonte):
   - El término `+ ν · margen · uds_producidas` es **constante** (todo lo demandado se produce).
   - El objetivo se reduce a: `max Σ OEE × h − λ · cambios` → maximizar horas productivas, minimizar cambios.
   - Equivalente al modo "happy path".

2. **Demanda infactible** (errores / demanda urgente / capacidad insuficiente):
   - Cubrir todo deja de ser posible → `uds_producidas < uds_demanded` para algún SKU.
   - El término `+ ν · margen · uds_producidas` se vuelve **decisivo**: el optimizador elige sacrificar primero los SKUs de menor `margen[sku]`.
   - Resultado natural: maximiza el beneficio total producido en el tiempo disponible.

**Caso especial — SKUs obligatorios**: si un SKU no se puede dropear (cliente clave, compromiso contractual), se modela con `prioridad = 5` en `demand.csv` → multiplicador adicional muy alto en su `margen` efectivo. Garantiza producción incluso a coste de OEE.

> **Importante**: cuando la matriz de beneficio no se conoce (default), `margen[sku] = 1` para todos los SKUs. En ese caso "minimizar pérdida" se convierte en "minimizar uds no producidas", que sigue siendo un comportamiento sensato como fallback.

### 1.5 Métricas secundarias para el dashboard

| Métrica | Cómo se calcula | Para qué |
|---|---|---|
| OEE plan vs OEE propuesta | media ponderada por horas | KPI principal |
| Horas perdidas en cambios | Σ changeover | Mide eficiencia secuenciación |
| % pedidos cumplidos en plazo | sobre `Cntd plan` | KPI de servicio |
| Nº cambios totales | Σ N° cambios | Indicador operativo |
| Tiempo de limpieza/mantenimiento | suma horas LIMPIEZA + PRT-M | Verifica restricciones |
| Throughput por línea | UDS/h y HL/h | Capacidad real |

### 1.6 ¿Optimizar OEE solo, tiempo solo, o ambos?

**Recomendación**: optimizar **horas productivas efectivas = Σ OEE × H.Tot.** Es matemáticamente equivalente a "minimizar tiempo perdido" pero está expresado en la métrica del negocio. Las submétricas (A, P, Q) sirven para **explicar** la recomendación al usuario, no como objetivos separados.

---

## 2. Tratamiento del OEE como variable predicha (no constante)

OEE **no se asume constante**. Depende de:

**Estructurales**: SKU, línea, atributos del producto (envase, marca, packaging, palet).
**De secuencia**: SKU predecesor + tipo de cambio (flags C.Brand, C.Envase, etc.), tiempo desde la última limpieza, carga acumulada del día.
**Volumen/duración**: duración planificada (encapsula uds + velocidad esperada). WOs más largos amortizan el arranque.
**Contextuales**: día de la semana, hora del día.

**Calcular vs predecir**:
- **WO ejecutado** (histórico) → calcular (ya está en los datos).
- **WO hipotético del optimizador** → predecir con modelo.

**Cómo lo incorpora el optimizador**: a través de una función `oee_esperado(sku, tren, sku_prev, duración, contexto) → float`. Esta función está respaldada por:
- **Nivel 0 (baseline)**: lookup `mediana(OEE histórico | sku, tren)` con fallbacks.
- **Nivel 1 (modelo)**: gradient boosting (LightGBM/XGBoost) con features estructurales + de secuencia + duración + contexto. Sin features de leakage (Nº LLamadas, tiempos de paro reales).
- **Nivel 1.5 (híbrido recomendado)**: `w · ML + (1-w) · baseline`, con `w` proporcional a la confianza (nº de WOs vistos para esa combinación).

**Validación**: walk-forward sobre 2025 (entrenar W-1, predecir W). Métricas: `MAE(OEE)`, `RMSE(horas perdidas)`. Reportar P50 y P90 — la varianza residual del proceso es alta (~33% CV).

---

## 3. Simulación realista para evaluar `S_opt`

**Principio fundamental**: cuando evaluamos `S_opt` sobre una ventana histórica, los incidentes de máquina deben **replicarse de forma determinista**, no muestrearse aleatoriamente. Si no, `S_opt` podría ganar a `S_real` solo por suerte.

### 3.1 Replay determinista (modo post-mortem y demo 2026)

**Construcción de `incident_log.csv`** desde `Mantenimiento` y `Tiempo`:
- Para cada WO con `Nº LLamadas > 0` o `Tiempo Paro` significativo: emitir un bloque `(tren, instante_inicio, duracion_h, motivo)`.
- `instante_inicio` derivado de `Fecha Fin - H. Tot. + offset` (offset = 0 si no se puede precisar).
- `motivo`: `averia / mantenimiento_no_planificado / saturacion / falta_producto / otro`.

**Anclaje recomendado: `(tren, instante)`** — el incidente pertenece al equipo y al momento, no al SKU. Una avería del llenador del TREN 17 a las 10:00 ocurrió **independientemente** del SKU encima. Si `S_opt` pone otro SKU ahí, igualmente lo sufre. Física y operativamente cierto.

**Anclaje opcional: `(sku, tren)`** — solo para incidentes claramente atribuibles al producto (atasco recurrente típico de un formato). Excepciones documentadas.

**Cómo se aplica al evaluar `S_opt`**:
1. Para cada slot del plan propuesto: computar la intersección con `incident_log.csv` en su `(tren, ventana_temporal)`.
2. Restar las horas de incidente del tiempo útil → recalcular OEE realizado.
3. Sumar al pool de "horas perdidas no controlables", separadas de "horas perdidas por cambios" (que sí dependen de la secuencia).

**Limpieza y mantenimiento PROGRAMADOS** (viernes 8 h, lunes quincenal 8 h) **NO** son incidentes — viven en `calendar_constraints.csv` como restricciones para ambos `S_opt` y `S_real`.

### 3.2 Modo Monte Carlo (escenarios futuros sin histórico, opcional)

Para what-if puros sin histórico:
- **Optimista**: ignorar incidentes (best-case).
- **Monte Carlo**: muestrear desde `p(incidente | tren, hora_día, día_semana)` empírica. Reportar P50/P90. Solo si queda tiempo.

### 3.3 Resultado: comparación justa

| Métrica | Contiene |
|---|---|
| OEE de `S_real` | OEE realmente observado (datos brutos) |
| OEE de `S_opt` | OEE simulado con replay determinista de incidentes + cambios de la secuencia propuesta |
| Δ atribuible a **secuenciación** | Diferencia neta tras descontar las horas de incidente (iguales en ambos) |

El delta refleja **solo lo que el optimizador podía controlar**: asignación de línea, orden, cambios.

---

## 4. Post-mortem: comparar planificación real vs propuesta

**Idea única**: dado un periodo (histórico o plan futuro), ejecutar el optimizador con la misma demanda agregada y comparar `S_opt` vs `S_real`. El usuario elige la **ventana de comparación**:

| Ventana | Para qué sirve | Métricas clave |
|---|---|---|
| **Horizonte completo** (mes / trimestre) | KPI agregado: "ahorraríamos X% de horas perdidas en media" | Δh_cambios totales, ΔOEE_ponderado |
| **Semana** (default) | Lectura operativa: "esta semana habríamos hecho 3 cambios menos" | Δh_cambios, ΔOEE, coverage |
| **Día** (drill-down, **más explicable**) | Storytelling: "el martes en la 17 esta transición fue cara y se podía haber evitado" | Transición real vs propuesta, OEE pre/post, qué cambió, contexto |

El drill-down `horizonte → semana → día → transición concreta` es el modo más explicable. Es lo que llevamos al jurado.

**Cómo se opera**:
1. Reagregar `executed_runs` (2025) o `Planificado…` (2026) a buckets semanales por SKU → `demand.csv` (ver §6).
2. Pasar al optimizador → `S_opt` desglosada a día/turno.
3. **Evaluar `S_opt` con replay determinista** de incidentes (§3). Sin este paso la comparación sería injusta.
4. Comparar `S_opt` vs `S_real` a la granularidad elegida.
5. En la ventana con peor delta, drilldown a transiciones concretas con explicación.

**Métricas estándar de comparación**:

| Métrica | Definición |
|---|---|
| ΔOEE_pond | `Σ OEE×h (S_opt) − Σ OEE×h (S_real)` — horas productivas ganadas |
| Δh_cambios | `Σ changeover(S_opt) − Σ changeover(S_real)` |
| Δn_cambios | nº transiciones |
| Δreasignaciones_línea | nº SKUs movidos a otra línea |
| Coverage | % UDS demandadas cubiertas |

**Caso especial — semana 18–22 may 2026**: única ventana con plan + realidad ya separados (`Planificado…` vs `Produccion_L…`). Tres secuencias lado a lado: plan de Damm / realidad / recomendación. **Escaparate de la demo.**

---

## 5. Re-planificación en marcha (perturbaciones)

Durante una semana ya planificada deben poder inyectarse eventos no previstos:

| Perturbación | Cómo se materializa | Source |
|---|---|---|
| **Avería / mantenimiento no planificado** | Bloque ocupado en `calendar_constraints.csv` (tren, fecha_ini, duracion_h, evento="averia") | Usuario o evento simulado |
| **Demanda urgente sobrevenida** | Fila nueva en `demand.csv` con la ventana correspondiente | Usuario |

**Comportamiento esperado**:
1. Acepta el evento como input adicional respetando los contratos (§6) — no se inventa schema nuevo.
2. Marca el **estado actual**: qué slots ya se ejecutaron, cuáles están en marcha, cuáles no han empezado.
3. Respeta la **ventana de congelación** (`freeze_days`): no se reasigna lo que ya está corriendo ni los próximos N días.
4. Re-lanza el optimizador con demanda residual + perturbación + estado actual + ventana de congelación.

**Notas arquitectónicas**:

| Estrategia | Pros | Cons | Cuándo |
|---|---|---|---|
| **Re-plan completo** | Simple, sin estado entre runs, robusto | Latencia más alta | Default para hackathon. Suficiente con horizonte ≤ 1 semana |
| **Warm-start / re-optimización local** | Más rápido, cambios mínimos respecto al plan vigente | Más complejo, requiere serializar estado del solver | Solo si re-plan completo no cumple <5 s |

**Caso de uso del reto**: *"llega una petición urgente de más volumen del producto X"* → el usuario añade una fila a `demand.csv` desde la UI → el sistema dispara el re-plan → propone si producirla esta semana o la próxima, en qué línea, con qué impacto en ΔOEE / Δhoras perdidas.

### 5.1 Fallback cuando no hay capacidad para todo

Si una perturbación (avería larga o demanda urgente añadida) hace que la demanda residual **ya no quepa** en el horizonte restante, el sistema **no falla**: el optimizador entra naturalmente en el régimen 2 de la función objetivo (§1.4) y elige qué sacrificar.

**Flujo concreto**:

1. **El simulador detecta la infactibilidad** durante la evaluación del re-plan: hora restante asignable a producción < hora necesaria para cubrir toda la demanda residual.
2. **No es el simulador quien decide qué dropear**: solo levanta la bandera "infactible" y devuelve la capacidad disponible.
3. **El optimizador se re-llama** con la **misma función objetivo** (§1.4). Como el término `+ν · margen · uds_producidas` ya estaba ahí, sin tocar nada:
   - SKUs de alto margen → producidos íntegramente.
   - SKUs de bajo margen → reducidos o eliminados.
   - SKUs con `prioridad = 5` → mantenidos incluso a coste de OEE.
4. **La UI presenta la decisión** con dos vistas:
   - **Lo que sí se produce** (con OEE estimado y línea asignada).
   - **Lo que queda fuera** (SKUs, uds, margen perdido total). El usuario decide si acepta la propuesta o reorganiza prioridades.

**Cómo cada arquitectura del optimizador lo implementa** (detalles en [`implementacion.md`](./implementacion.md) §3):

| Arquitectura | Cómo modela el dropeo selectivo |
|---|---|
| A (greedy) | Ordena demanda por `margen × uds` desc, asigna hasta que se llena la capacidad. Lo que queda fuera es la solución. |
| B (ILP) | Variables de "uds asignadas" con `uds[sku] ≤ demand[sku]` (no `=`). Objetivo incluye `+ ν · margen × uds_asignadas`. |
| C (greedy + ML) | Igual que A en infactibilidad, más búsqueda local sobre qué SKU dropear para mejorar el OEE de lo que se mantiene. |
| D (m-TSP + ML) | OR-Tools VRP soporta nativamente **disjunciones con penalty**: cada nodo de demanda es opcional con penalty = `margen[sku] × uds`. El solver decide qué nodos visitar. |

**Lo elegante**: el dropeo no es una rama de código separada — es **el mismo objetivo** que decide diferente cuando la capacidad cambia. Esto significa:
- Un único optimizador implementado, dos comportamientos emergentes.
- Sin riesgo de divergencia entre "modo normal" y "modo emergencia".
- La transición entre regímenes es continua (si tienes 95% de capacidad, dropea el 5% menos rentable; si tienes 50%, dropea el 50% menos rentable).

**Caso de uso del reto**: *"se ha roto la línea 14 hasta el jueves"* → el usuario inyecta un bloque de avería en `calendar_constraints.csv` → re-plan → si la demanda residual no cabe → el sistema propone "estos SKUs de bajo margen quedan fuera esta semana; recomendamos pasarlos a la semana siguiente" → muestra impacto en € y OEE.

---

## 6. Contrato de entrada/salida del optimizador

> **Principio de diseño**: el optimizador no debe saber de dónde sale la demanda. Cualquier fuente (histórico 2025, plan 2026, what-if del usuario, futuras integraciones) produce un fichero que cumple el mismo schema. Esto desacopla los componentes y facilita testing.

### 6.1 Schema `demand.csv` (interfaz única)

La demanda se expresa como **buckets por ventana temporal**: "en esta ventana hay que producir N uds de SKU S; el optimizador decide cuándo y en qué línea dentro de la ventana".

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `window_id` | str | sí | Identificador legible. Default: `YYYY-Wnn` (semana ISO) |
| `window_start` | date | sí | Inicio (inclusivo). Default: lunes |
| `window_end` | date | sí | Fin (inclusivo). Default: domingo |
| `sku` | str | sí | Identificador del SKU. Debe existir en `sku_master.csv` |
| `uds_demanded` | int ≥ 0 | sí | Unidades (UDS) a producir en esa ventana |
| `source` | str | no | Trazabilidad: `histórico_2025`, `plan_2026`, `whatif_usuario`, … |
| `prioridad` | int (1-5) | no | Default 3. Solo se usa si hay competencia por capacidad |

> Campos que **NO** lleva la demanda: ❌ `tren`, ❌ `dia`, ❌ `turno`, ❌ `fecha_fin_wo`. Todos son resultado de la planificación.

> **Sobre la ventana**: por defecto semana ISO (lunes→domingo). Configurable a quincena/mes según horizonte. Más fino que semana (e.g. día) no se contempla — la planificación real no opera así.

### 6.2 Mapeo de cada fuente al schema

Todas las fuentes se reagregan a buckets de ventana antes de entrar al optimizador.

| Fuente | Cómo se obtiene `demand.csv` |
|---|---|
| **Histórico 2025** | De `executed_runs`: derivar `semana_iso` desde `Fecha Fin`, agregar `uds` por (sku, semana), filtrar SKU=LIMPIEZA. `source = "histórico_2025"` |
| **Plan real 2026** | De `Planificado - producciones…`: normalizar `Cntd plan` (CAJ → UN con `Unidad/caja`), derivar `semana_iso` desde `Fecha ini.`, agregar por (sku, semana). **Descartar `Tren`, `Hora ini.`, `Definición de turno`** — son la solución de ellos, no la demanda. `source = "plan_2026"` |
| **What-if del usuario** | Formulario en la UI con campos sku/window/uds. `source = "whatif_usuario"` |
| **Cualquier otra** | Mismo formato. El optimizador no distingue |

> Importante: tanto `executed_runs` 2025 como `Planificado…` 2026 son a su vez **soluciones de planificación previas**. Al agregarlas a nivel semanal, "deshacemos" esa decisión y reconstruimos la demanda agnóstica que la originó. El optimizador la replanifica desde cero.

### 6.3 Inputs hermanos (también fuente-agnósticos)

El optimizador no consume solo demanda. Necesita además:

| Input | Schema esencial | Quién lo produce |
|---|---|---|
| `sku_line_capability.csv` | `sku, tren, can_produce (bool), speed_median_uds_h, oee_median, n_wos_historico` | Derivado de `executed_runs` |
| `changeover_matrix.csv` | `tren, sku_from, sku_to, hours, source ("teórico"\|"empírico"\|"híbrido")` | Fusión de `Tabla CF Prat` + agregaciones de `executed_runs` + `changes_actual` |
| `calendar_constraints.csv` | `tren, regla_temporal, evento, duracion_h, frecuencia` | `Tabla CF Prat` (Tiempos adicionales) + reglas operativas + perturbaciones runtime |
| `optimizer_hyperparams.yaml` | `horizon_days` (default 30), `freeze_days`, `lambda_changeover`, `mu_demanda_no_cubierta`, `nu_beneficio`, `margen_per_sku` (dict sku → €/uds, opcional, default 1.0 para todos) | Configuración / usuario. `margen_per_sku` activa el dropeo selectivo cuando hay infactibilidad |

### 6.4 Schema de salida (`sequence.csv`)

Para que visualización y comparador sean también independientes:

| Campo | Tipo | Descripción |
|---|---|---|
| `slot_id` | str | Identificador del slot |
| `tren` | int | Línea asignada (decisión del optimizador) |
| `sku` | str | SKU asignado |
| `fecha_inicio` | datetime | Inicio planificado |
| `fecha_fin` | datetime | Fin planificado |
| `uds_planificadas` | int | Cuánto producir en este slot |
| `oee_esperado` | float | Predicción del modelo |
| `tipo` | str | `produccion` / `limpieza` / `mantenimiento` / `cambio` |
| `sku_prev` | str | Para slots `cambio`, el SKU origen |
| `coste_cambio_h` | float | Solo para slots `cambio` |

### 6.5 Arquitectura modular

```
┌──────────────────┐        ┌─────────────────────┐
│  Generador de    │        │  Generador de       │
│  demanda 2025    │───┐    │  demanda What-if    │──┐
└──────────────────┘   │    └─────────────────────┘  │
                       │                              │
┌──────────────────┐   │    ┌─────────────────────┐  │
│  Mapper plan     │───┼───►│   demand.csv        │──┼──►┌─────────────┐
│  2026            │   │    │   (schema fijo)     │  │   │ OPTIMIZADOR │──► sequence.csv ──► UI / Comparador
└──────────────────┘   │    └─────────────────────┘  │   │  (núcleo)   │
                       │                              │   └─────────────┘
                       │    ┌─────────────────────┐  │          ▲
                       └───►│ Otras fuentes…      │──┘          │
                            └─────────────────────┘             │
                                                                │
                       ┌──────────────────────────────────┐     │
                       │ sku_line_capability.csv          │─────┤
                       │ changeover_matrix.csv            │─────┤
                       │ calendar_constraints.csv         │─────┤
                       │ optimizer_hyperparams.yaml       │─────┘
                       └──────────────────────────────────┘
```

**Beneficios para el hackathon**:
1. **Trabajo en paralelo**: optimizador, ETL y UI separados.
2. **Testing fácil**: el optimizador se prueba con cualquier `demand.csv` mock.
3. **Demo segura**: si el mapper del plan 2026 falla en vivo, se demuestra con la demanda histórica.
4. **Extensible**: nueva fuente = nuevo mapper a `demand.csv`.

---

## 7. Próximos pasos (en orden de ejecución)

1. **ETL** de los 8 ficheros relevantes (descartar `data - 2026-05-18…` y `Diario Hl_Planif…`) → tablas limpias en CSV (ver [`datos.md`](./datos.md) §3). Script: `etl.py`.
2. **EDA** sobre `executed_runs`: distribución de OEE por línea/SKU/día semana, top-10 cambios más caros realmente, top-10 cambios sospechosos.
3. **Modelo de OEE esperado**: gradient boosting con features estructurales + de secuencia + duración + contexto. Target = OEE del WO. Validación walk-forward.
4. **Optimizador**: dado `demand.csv` con buckets semanales, encuentra asignación de línea + secuencia intra-semana (día y turno) maximizando `Σ OEE × h_productiva`. Empezar con greedy + búsqueda local o ILP sobre una semana.
5. **Post-mortem** (§4): aplicar el comparador real vs propuesto sobre 3-6 semanas representativas de 2025 (drill-down a día para el caso narrado).
6. **Demo principal**: aplicar el mismo comparador a la semana 18–24 may 2026 → mostrar plan de Damm, realidad y recomendación.
7. **Simulador what-if + perturbaciones** (§5): UI que permita inyectar avería o demanda urgente y re-lanzar el optimizador con el estado actual y la ventana de congelación.
8. **UI final**: Gantt/timeline **editable** por línea (mover elementos para ver impacto, conforme pide el brief) + métricas en vivo + selector de ventana (mes/semana/día) + recomendaciones explicadas con feature contributions (SHAP o reglas simples).
