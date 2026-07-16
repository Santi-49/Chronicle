# LineWise — Arquitectura de implementación

> Cómo se evalúa el OEE de la propuesta para que sea comparable con el real, cómo se separan los engines de simulación y optimización, y qué tres arquitecturas concretas tenemos sobre la mesa con sus trade-offs. Lectura previa recomendada: [`reto.md`](./reto.md).

---

## 1. Cómo evaluar el OEE de `S_opt` de forma comparable con `S_real`

**Pregunta clave**: cuando el optimizador propone una secuencia `S_opt`, ¿el OEE que reportamos al usuario es un cálculo determinista o requiere un modelo ML?

**Respuesta: es determinista**. No hace falta ML para evaluar la propuesta, solo para guiar el optimizador (y eso es opcional).

### 1.1 Por qué es determinista

El OEE de cada slot del plan propuesto se calcula a partir de cantidades **conocidas o lookup-eables**:

```
OEE(slot) = horas_productivas_efectivas / horas_totales_slot

horas_totales_slot         = duración del slot en el calendario
horas_productivas_efectivas = horas_totales_slot
                            − horas_cambio_entrada
                            − horas_baja_velocidad_estimadas
                            − horas_eventos_calendario (limpieza, mantenimiento)
                            − horas_incidentes_replayed
```

Todos los términos del denominador y numerador salen de tablas estáticas:
- `speed_median(sku, tren)` ← `executed_runs` agregado.
- `changeover_matrix(sku_from, sku_to, tren)` ← teórico + empírico fusionados.
- `calendar_constraints` ← regla viernes/lunes.
- `incident_log` ← replay determinista por (tren, instante) (ver `reto.md` §3).

No interviene aleatoriedad. La función `evaluate_sequence(S, inputs) → métricas` es **idempotente**: misma entrada, misma salida.

### 1.2 Cuándo entra ML

ML aparece solo si queremos **mejorar la predicción de OEE durante la búsqueda del optimizador** — predecir efectos de segundo orden que el modelo determinista no captura (ej. "los lunes a primera hora la línea 14 va un 5% peor incluso sin incidentes"). Es una mejora opcional del optimizador, **no parte de la evaluación**.

Esto significa que:
- El evaluador de `S_opt` es **el mismo simulador** para las tres arquitecturas que propongo abajo.
- La comparación `S_opt` vs `S_real` siempre se hace con números deterministas, comparables 1:1.

### 1.3 Semántica del OEE a nivel ventana (semana / horizonte)

La intuición que mencionas es correcta y conviene formalizarla:

**OEE de una semana en una línea**:
```
OEE_semana_línea = Σ slot.OEE × slot.horas    (sobre slots en esa semana y línea)
                 / Σ slot.horas
```

Comportamientos:

| Escenario | Efecto en OEE_semana_línea |
|---|---|
| `S_opt` acaba toda la demanda antes de cierre de semana | Si los slots tras la última producción se dejan ocupados con limpieza programada o como hueco, el OEE puede subir porque hay menos cambios proporcionales (más bloques de producción largos amortizan el arranque). Si el hueco se deja vacío y se cuenta como "tiempo no usado", baja la Disponibilidad del bucket. **Decisión**: cuentas solo las horas que el optimizador asigna a la línea, no la semana entera, para no penalizar acabar antes |
| `S_opt` no completa la demanda en la ventana | El OEE de los slots ejecutados puede estar bien, pero hay **uds no producidas** → métrica `coverage < 100%` y penalty `slack_demanda` en la función objetivo |
| `S_opt` tiene más cambios que `S_real` | OEE_semana baja: más horas de cambio en el denominador, mismas horas productivas (o menos) en el numerador |
| `S_opt` reasigna SKU a una línea con mayor `speed_median` | Mismas uds, menos horas → más horas libres para otros SKUs → OEE_semana sube |

**Implicación de diseño**: reportar siempre dos métricas, no una sola:
- **OEE_semana_línea**: calidad de uso del tiempo asignado.
- **Coverage**: % de demanda cubierta. Si baja, OEE se mira con escepticismo.

Sin esta dualidad, el optimizador podría "ganar" produciendo menos pero con OEE alto.

---

## 2. Los dos engines separados

### 2.1 Engine de **simulación** (determinista, realista)

**Rol**: dado un `S` (cualquier secuencia propuesta, real o sintética) y los inputs hermanos, calcular qué pasaría realmente con esa secuencia. Devuelve métricas por slot, por línea y por ventana.

**Inputs**:
- `S` (secuencia: lista de slots con tren, sku, fecha_inicio, fecha_fin, uds).
- `sku_line_capability.csv` (velocidad mediana, OEE mediano por sku × línea).
- `changeover_matrix.csv` (coste de cambio entre SKUs por línea).
- `calendar_constraints.csv` (limpieza viernes, mantenimiento lunes quincenal, perturbaciones inyectadas).
- `incident_log.csv` (replay determinista de averías históricas anclado a tren+instante).
- `sku_master.csv` (atributos).

**Lógica** (por línea, en orden cronológico):
1. Coloca eventos forzados del calendario en sus instantes.
2. Para cada slot en `S` (en orden):
   - Calcula `changeover(sku_prev, sku_actual, tren)` y lo añade como bloque pre-slot.
   - Calcula `horas_marcha = uds / speed_median(sku, tren)`.
   - Resta intersección con incidentes que caen en su `(tren, ventana)` → ajusta horas productivas.
   - Computa `OEE(slot) = horas_productivas_efectivas / horas_totales_slot`.
3. Agrega por ventana: `OEE_semana_línea`, horas perdidas desglosadas (cambios / incidentes / limpieza / baja velocidad), coverage.

**Garantías**:
- Mismo input → mismo output (determinismo).
- Aplicado a `S_real` reproduce el OEE histórico observado (validación: si no lo reproduce, el motor está mal calibrado).
- Aplicado a `S_opt` usa los mismos incidentes y reglas → comparación justa.

**Realismo cubierto**:
- ✅ Cambios entre SKUs (matriz teórica + empírica).
- ✅ Limpieza obligatoria (viernes 8 h).
- ✅ Mantenimiento obligatorio (lunes quincenal 8 h).
- ✅ Averías históricas (replay determinista).
- ✅ Baja velocidad por SKU (mediana de speed_efectiva).
- ⚠️ NO cubre: averías futuras desconocidas (se manejan en modo Monte Carlo opcional, ver `reto.md` §3.2).

### 2.2 Engine de **optimización** (varía según arquitectura)

**Rol**: dado `demand.csv` (buckets semanales por SKU, sin línea) y los inputs hermanos, devolver la secuencia `S_opt` que maximiza la función objetivo.

**Input**: `demand.csv` + sibling inputs + hyperparams.
**Output**: `S_opt` = lista de slots asignados a (tren, día, turno, sku, uds).

**Llamada al simulador**: durante la búsqueda, el optimizador llama al simulador (o a una versión rápida del mismo) para evaluar candidatos. El número de llamadas depende de la arquitectura.

**Responsabilidades del optimizador** (las cuatro dimensiones de decisión):
1. **Distribución entre líneas**: asignar cada bucket de demanda a una o varias líneas según `sku_line_capability` (qué SKUs puede producir cada línea + OEE mediano + velocidad).
2. **Secuenciación intra-línea**: orden de SKUs en cada línea, minimizando coste acumulado de cambios.
3. **Distribución temporal intra-semana**: en qué día/turno cae cada slot, respetando calendario y huecos forzados.
4. **Selección bajo capacidad limitada** (régimen 2 de la función objetivo): cuando la demanda no cabe en el horizonte, decidir qué SKUs sacrificar para minimizar pérdida de margen total. Ver `reto.md` §1.4 y §5.1.

> El **simulador no decide** qué dropear. Solo levanta la bandera "infactible" cuando la demanda excede capacidad, y devuelve la capacidad disponible. El optimizador, con la **misma** función objetivo (no una rama distinta), elige automáticamente qué dejar fuera.

**Distribución entre líneas — política recomendada para las tres arquitecturas**:
- Default: cada bucket va a **la línea con mejor `oee_median × speed_median` para ese SKU**.
- Si la línea preferida no tiene capacidad horaria para asumirlo todo, se parte el bucket entre las top-2 líneas con esa SKU en `sku_line_capability`.
- Restricción dura: nunca asignar a una línea con `can_produce = False` para ese SKU.

---

## 3. Top 4 arquitecturas (engine de optimización)

> Las cuatro comparten el mismo engine de simulación. Lo que cambia es **cómo se busca** la secuencia óptima.

### Arquitectura A — **Greedy + reglas**

**Idea**: ordenar la demanda de la semana por prioridad (volumen, dificultad de cambio, OEE histórico) y colocarla línea a línea evitando cambios caros, con un par de heurísticas locales (e.g., agrupar SKUs con misma `Familia`, evitar pasar de 1/3 a 1/2 dos veces seguidas, etc.).

**Algoritmo**:
1. Para cada semana: tomar `demand.csv` ordenada por uds_demanded descendente.
2. Para cada bucket (sku, uds): elegir la línea con mejor OEE histórico mediano para ese SKU que aún tenga capacidad.
3. Dentro de cada línea: ordenar SKUs minimizando el coste de cambio acumulado (heurística: agrupar por `Tipo Envase` → luego por `Cerveza` → luego por `Packaging`).
4. Insertar los eventos forzados de calendario.
5. Llamar al simulador para obtener métricas.

**Pros**:
- Súper simple. Implementable en horas.
- Cada decisión es trazable a una regla → muy explicable.
- Sin riesgo de overfitting ni dependencias raras.

**Cons**:
- No óptimo. Una decisión inicial mala se arrastra.
- No aprende patrones (e.g., "cambiar a TURIA después de FREE DAMM cuesta el doble que al revés").
- Si la demanda es muy heterogénea, el resultado puede no ser mejor que `S_real`.

### Arquitectura B — **ILP / Constraint Programming**

**Idea**: formulación formal de optimización. Variables enteras representan la asignación slot → SKU; restricciones expresan demanda, capacidad y calendario; objetivo es `Σ OEE_estimado × horas`.

**Algoritmo** (esqueleto):
- Variables: `x[tren, día, turno, sku] ∈ {0, 1}` (¿este turno produce este SKU?) o `u[tren, día, turno, sku] ∈ ℕ` (uds asignadas).
- Restricciones:
  - `Σ_día,turno,tren u[…,sku] ≥ demand[sku]` (cobertura).
  - `Σ_sku u[tren,día,turno,sku] / speed[sku,tren] ≤ horas_turno_disponibles[tren,día,turno]` (capacidad).
  - `x[tren,día,turno,sku] = 0` si `can_produce[sku,tren] = False` (capability).
  - `x[tren, viernes, X, "LIMPIEZA"] = 1` y similar para mantenimiento.
- Objetivo: maximizar `Σ x[…,sku] × oee_median[sku,tren] × horas[…] − λ · Σ cambios_entre_turnos_consecutivos`.
- Resolver con OR-Tools (CP-SAT) o PuLP + CBC.
- Llamar al simulador post-hoc para validar y reportar.

**Pros**:
- Óptimo (dentro del modelo).
- Estándar de la industria — el jurado lo reconocerá.
- Restricciones explícitas → muy auditable.

**Cons**:
- Formulación delicada. Los cambios entre SKUs son combinatoriales — modelarlos exactamente puede explotar.
- Latencia: para 3 líneas × 7 días × 3 turnos × 33 SKUs en una semana es manejable; para horizonte mensual se complica.
- No captura efectos no lineales (el OEE depende del predecesor de forma no convexa).
- Menos "narrable" al jurado no técnico ("hemos resuelto un programa entero" suena a caja negra).

### Arquitectura C — **Greedy + búsqueda local + ML para OEE esperado** (recomendada)

**Idea**: solución inicial greedy rápida + iteraciones de búsqueda local (swaps de SKUs entre líneas, reordenes intra-línea) + un modelo de ML que predice OEE esperado dado el contexto (predecesor, hora, día, flags de cambio) para guiar la búsqueda.

**Componentes**:
- **Inicialización**: el greedy de la Arquitectura A.
- **Búsqueda local**: operadores 2-opt (intercambiar dos slots consecutivos) y move-cross-line (mover un SKU de la línea A a la línea B). Simulated annealing o tabu search para escapar mínimos locales.
- **Modelo de OEE esperado** (`reto.md` §2): gradient boosting con features estructurales + de secuencia. Predice OEE de cada slot candidato durante la búsqueda. **No** se usa para reportar al usuario — el reporte se hace con el simulador determinista.
- **Función de fitness**: la del simulador determinista, pero acelerada usando el modelo ML para evitar simular completamente cada candidato.

**Pros**:
- Equilibrio entre simplicidad y calidad.
- ML cubre el "componente IA" exigido por el brief.
- Búsqueda local es muy paralelizable (varios restarts).
- Explicable: el modelo ML aporta SHAP values → "cambiamos este SKU porque históricamente reduce OEE un 8% tras VOLL DAMM".
- Latencia controlable: si re-plan tarda demasiado, recortar iteraciones.

**Cons**:
- Más piezas que A, más complejidad que B.
- El modelo ML hay que entrenarlo y validarlo (walk-forward).
- Riesgo de inconsistencia entre OEE predicho por ML y OEE simulado determinista (mitigable con un ratio de validación).

### Arquitectura D — **Grafo / pathfinding con aristas predichas por ML**

**Idea**: modelar la planificación como un problema de **m-TSP** (varios viajantes — uno por línea) sobre un grafo de SKUs/chunks. ML predice solo el peso de las aristas (tiempo de cambio entre SKUs). El optimizador minimiza tiempo total. El OEE no se predice — solo se simula post-hoc sobre la solución encontrada.

**Justificación matemática**:

Cuando la demanda está fijada y Calidad ≡ 1:
```
OEE_semana = uds_buenas / (uds_buenas × velocidad⁻¹ + tiempo_cambios + overhead)
           = constante / (constante + tiempo_perdido)
```
→ **minimizar tiempo perdido ≡ maximizar OEE**. Por eso es legítimo optimizar tiempo y reportar OEE: matemáticamente equivalente.

**Formulación del grafo**:

| Elemento | Qué representa |
|---|---|
| **Nodo** | Un chunk de demanda `(sku, uds_chunk, tren_candidato)`. Un SKU grande se parte en varios chunks (e.g., máx 8 h productivas cada uno). También nodos sintéticos para `inicio_línea`, `fin_línea`, `limpieza_obligatoria`, `mantenimiento_obligatorio` |
| **Peso del nodo** | `run_time(sku, tren) = uds_chunk / speed_median(sku, tren) + expected_overhead` |
| **Arista (a → b)** | Posibilidad de hacer el chunk `b` justo después del `a` en la misma línea |
| **Peso de arista** | `changeover_time(sku_a, sku_b, tren)` ← **target de ML** |
| **Path por línea** | Una secuencia de nodos visitada por esa línea de inicio_línea a fin_línea |
| **Restricciones globales** | Cada nodo de demanda se visita por **exactamente una** línea (cobertura). Las líneas no se solapan en chunks |

**Algoritmo**:

1. **Construir el grafo**: enumerar todos los chunks factibles `(sku, tren)` según `sku_line_capability`. Insertar nodos forzados de limpieza/mantenimiento en sus posiciones temporales.
2. **Predecir aristas con ML**: entrenar modelo (gradient boosting o red simple) con target `changeover_time` y features `(sku_from, sku_to, tren, día_semana, hora_día, atributos SKU from/to)`. Datos: derivar `changeover_time` empírico desde `PNP` previo a marcha en `executed_runs` ordenado, con fallback al teórico de `Tabla CF Prat`.
3. **Resolver m-TSP**: OR-Tools `RoutingModel` (VRP). Tres "vehículos" (uno por línea), cada uno con capacidad temporal = horas disponibles_semana. Objetivo: minimizar **makespan** (`max(tiempo_línea_14, tiempo_línea_17, tiempo_línea_19)`) + ε · suma_total. Restricciones duras: cobertura, capability, eventos forzados de calendario.
4. **Simular el resultado**: pasar la solución al simulador determinista. Aplicar replay de incidentes. Reportar OEE y métricas estándar.

**Por qué es elegante para este reto**:

- **Storytelling perfecto**: "encontramos el camino más corto que recorre todos tus pedidos sin repetir cambios caros". Concepto intuitivo para no técnicos.
- **ML acotado y validatable**: la tarea es predecir un tiempo de cambio, no un KPI compuesto. Más fácil de entrenar bien y de explicar (SHAP sobre features de cambio es muy interpretable).
- **Decoupling limpio**: ML para aristas, simulador para OEE. Cada componente tiene una responsabilidad clara y validable independientemente.
- **Maduro algorítmicamente**: OR-Tools tiene VRP listo. No hay que inventar nada.
- **Captura naturalmente la asignación de línea**: tres "viajantes" (uno por línea), demanda repartida. La distribución entre líneas emerge de la optimización, no es una decisión separada.
- **Maneja capacidad insuficiente nativamente**: OR-Tools VRP soporta **disjunciones** — nodos opcionales con penalty. Cuando la avería o la demanda urgente hace infactible cubrir todo, el solver elige los nodos a dropear según el penalty (= `margen[sku] × uds`). Sin código adicional. Ver `reto.md` §5.1.

**Caveats a vigilar**:

- La arista debe incluir todo el tiempo "entre productivo y productivo": cambio + arranque/final si aplica. Documentar exactamente qué entra y qué no.
- El número de chunks crece con la demanda → grafos de cientos de nodos por semana. Manejable, pero auditar tamaño y latencia.
- La métrica `makespan` no es lo mismo que `Σ tiempos`. Si dos líneas acaban a las 18h y una a las 23h, el makespan = 23h. Conviene reportar las dos.
- Predecir `changeover_time` con ML solo aporta cuando hay observaciones suficientes para ese par. Para pares raros, fallback al teórico de la matriz CF.

**Pros**:
- Mejor storytelling de las 4 arquitecturas.
- ML focal (un solo target, bien definido) → menos riesgo de overfitting o explicaciones difíciles.
- OR-Tools VRP es maduro y rápido.
- Línea-aware nativamente (m-TSP es multi-vehículo).
- Componente IA defendible.

**Cons**:
- Modelar correctamente nodos forzados (limpieza, mantenimiento) como "visitas obligatorias en ventanas concretas" requiere conocer la API de VRPTW de OR-Tools.
- Si la demanda es muy desigual entre líneas (todo apunta a TREN 17), el m-TSP se degenera y la solución es esencialmente single-line.
- Requiere convertir la demanda en chunks ANTES de optimizar, lo cual ya es una decisión de diseño.

**Cuándo elegir D sobre C**:
- Si te sientes cómodo con OR-Tools o ya tienes experiencia con VRP.
- Si valoras más el storytelling "shortest path" que la flexibilidad del local search.
- Si la demanda es naturalmente partible en chunks claros (lo cual es nuestro caso).

**Cuándo elegir C sobre D**:
- Si quieres más flexibilidad para meter heurísticas operativas ad-hoc.
- Si te preocupa la inflexibilidad de la formulación VRP (cambios futuros del modelo).
- Si la búsqueda local con simulated annealing te resulta más familiar.

---

## 4. Matriz comparativa por dimensiones

Puntuación 1-5 (5 = excelente).

| Dimensión | A: Greedy + reglas | B: ILP / CP | C: Greedy + ML | **D: Grafo + ML** |
|---|---|---|---|---|
| **Explicabilidad** | ⭐⭐⭐⭐⭐ Reglas humanas | ⭐⭐⭐ Objetivo opaco | ⭐⭐⭐⭐ Reglas + SHAP | ⭐⭐⭐⭐⭐ "Path más corto" + SHAP sobre aristas |
| **Simulación realista** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Calidad recomendaciones** | ⭐⭐⭐ Subóptimo | ⭐⭐⭐⭐⭐ Óptimo en modelo | ⭐⭐⭐⭐ Cerca óptimo | ⭐⭐⭐⭐⭐ Cerca óptimo, heurísticas TSP maduras |
| **Simplicidad** | ⭐⭐⭐⭐⭐ Horas | ⭐⭐ Días | ⭐⭐⭐ Manejable | ⭐⭐⭐⭐ OR-Tools VRP listo, ML acotado |
| **Storytelling no técnico** | ⭐⭐⭐⭐ Reglas | ⭐⭐ Caja negra | ⭐⭐⭐⭐⭐ "IA aprende" | ⭐⭐⭐⭐⭐ "Camino más corto que cubre todo" |
| **Componente IA** | ⭐ Sin IA | ⭐⭐ Matemática, no IA | ⭐⭐⭐⭐⭐ ML predice OEE | ⭐⭐⭐⭐ ML predice aristas (target bien acotado) |
| **Latencia re-plan** | ⭐⭐⭐⭐⭐ <1 s | ⭐⭐ Variable | ⭐⭐⭐⭐ <5 s | ⭐⭐⭐⭐ <5 s con OR-Tools |
| **Decoupling limpio** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ ML y eval pueden divergir | ⭐⭐⭐⭐⭐ ML solo aristas, OEE solo simulador |

**Recomendaciones por escenario**:

- **Hackathon corto (1 día, equipo pequeño)** → **A** con fallback de detección descriptiva.
- **Hackathon estándar (2 días, equipo de 3-4)** → **C** como objetivo, A como red de seguridad.
- **Hackathon con experiencia previa en OR-Tools / VRP** → **D** es la apuesta más elegante. Storytelling impecable, decoupling perfecto, ML bien acotado.
- **Solo si hay alguien con experiencia formal en MILP** → **B** brilla.

**Mi recomendación actualizada para este reto: D**, con A como fallback. Razones:
1. La intuición original ("es un pathfinding") era correcta — modelarlo así honra la mejor comprensión natural del problema.
2. ML sobre aristas (changeover) es **mucho más defendible** que ML sobre OEE — target observable, derivable directamente del histórico, validatable.
3. El framing "camino más corto" es **el mejor storytelling** posible para no técnicos.
4. OR-Tools VRP es **un solver maduro**, no hay que inventar la búsqueda.
5. La separación tiempo→optimizar / OEE→simular es **arquitectónicamente más limpia** que mezclar ambas en la fitness function.

---

## 5. Storytelling para audiencia no técnica

Esta es la narrativa que llevaremos al jurado (y al lector del README), independiente de la arquitectura elegida:

### 5.1 El problema en una frase

> *"Damm produce cervezas en latas en tres líneas distintas. Cada vez que cambia de un producto a otro, las máquinas tardan en reajustarse y se pierde tiempo de producción. Además hay limpiezas y mantenimientos obligatorios. Si planificas mejor la **secuencia** de productos, pierdes menos tiempo y produces más con las mismas máquinas."*

### 5.2 Qué datos tenemos

> *"Un año de producción real, donde sabemos para cada lote: qué SKU se hizo, en qué línea, cuándo, cuánto tardó, cuánto produjo, y qué OEE consiguió. También sabemos qué cambios hubo entre lotes y qué averías se produjeron. Y tenemos el plan teórico de una semana concreta de 2026 para comparar."*

### 5.3 Qué métrica optimizamos y por qué

> *"Optimizamos el OEE ponderado por horas — es como decir 'horas productivas efectivas'. Es exactamente la métrica que el negocio ya reporta. Cuando reducimos el tiempo perdido en cambios o agrupamos mejor productos similares, este número sube directamente."*

> *"Además vigilamos que se cumpla toda la demanda (coverage del 100%) y reportamos cuántas horas se han ahorrado en cambios concretos. Así cualquiera puede leer la propuesta sin saber nada de OEE: 'tres cambios menos esta semana, ocho horas extra de producción'."*

### 5.4 Cómo funciona nuestra solución (tres bloques)

1. **Aprendemos del pasado**: estudiamos qué transiciones entre productos fueron caras realmente, y qué SKUs se producen mejor en qué línea.
2. **Proponemos una alternativa**: el optimizador reordena la semana, redistribuye entre líneas y muestra el ΔOEE estimado.
3. **Validamos en simulador**: ejecutamos la propuesta sobre el mismo escenario real (mismas averías, misma limpieza, misma capacidad) para que la comparación con lo que pasó de verdad sea justa.

### 5.5 Qué hace única nuestra solución

- **Simulación realista**: las averías que ocurrieron en el día real también ocurren en nuestra propuesta. No ganamos por suerte.
- **Drill-down explicable**: la herramienta no solo dice "esta semana iría mejor" — dice "el martes a las 10 de la mañana, este cambio de marca era evitable porque podías producir antes el otro SKU pendiente; te ahorras 1h 20min".
- **Replanifica en caliente**: si en mitad de la semana llega un pedido urgente o se rompe una línea, vuelve a calcular el resto de la semana respetando lo ya producido.

---

## 6. Detección de ineficiencias — con y sin datos de demanda

Cuestión muy importante: **¿se pueden detectar cambios ineficientes sin saber la demanda?** Sí. Y con demanda, podemos ir más lejos.

### 6.1 Sin datos de demanda — análisis descriptivo

Ningún optimizador, solo el simulador y el histórico.

| Análisis | Cómo se hace | Salida |
|---|---|---|
| **Top-N transiciones caras** | Para cada par `(WO_{i-1}, WO_i)` en `executed_runs` ordenado: calcular `coste_real_cambio = PNP_inicial + Tiempo_baja_velocidad`. Comparar con teórico de `changeover_matrix`. Flag si `real > 1.5 × teórico` | Lista de las peores transiciones con explicación: qué cambió (flags `C.Brand/C.Envase/…`), día, hora, contexto |
| **SKUs con OEE crónicamente bajo en una línea** | Agregar por (sku, tren) y comparar mediana de OEE contra la mediana de ese SKU en otras líneas. Flag si la diferencia > 10 puntos | Recomendación: "este SKU rinde 12% mejor en TREN 17 que en TREN 14" |
| **Cambios redundantes** | Detectar patrones A→B→A separados por <12 h en la misma línea, cuando agrupar habría evitado un cambio | Recomendación: "el 14/03 hiciste FREE DAMM, luego ESTRELLA, luego FREE DAMM otra vez — agrupándolo te habrías ahorrado 1.5 h" |
| **Limpiezas mal posicionadas** | Detectar limpiezas que caen antes de un SKU del mismo grupo que el anterior (limpieza innecesaria) | Recomendación: "la limpieza del 22/06 podría haberse pospuesto al cambio del 23/06 sin perder higiene" |

Funciona con las tres arquitecturas — porque no usan el optimizador, solo el simulador + queries sobre `executed_runs` y `changes_actual`.

### 6.2 Con datos de demanda — análisis contrafactual

Aquí entra el optimizador. Para una ventana histórica:

| Análisis | Cómo se hace | Salida |
|---|---|---|
| **Reasignaciones de línea mejores** | Reagregar producción real a demanda. Pasar al optimizador. Ver qué SKUs el optimizador asigna a una línea distinta de la que se usó | "Ese DL13LT del 8/03 deberías haberlo hecho en TREN 17 y no en 19; te habrías ahorrado 2.1 h de cambio" |
| **Secuencia intra-línea mejorada** | Misma demanda, misma línea (forzando asignación si quieres aislar el efecto), pero permitir reordenar slots | "Cambiando el orden TURIA→FREE DAMM→TURIA por TURIA→TURIA→FREE DAMM en TREN 14 el martes, ahorras un cambio entero" |
| **WO splits ventajosos** | Permitir partir un bucket en dos slots cuando ayuda a la secuencia | "Producir el ESTRELLA DAMM del jueves en dos turnos en lugar de uno permite intercalar el FREE DAMM más eficientemente" |
| **Coverage gaps explicables** | Buscar semanas donde `S_real` no cubrió el 100% y ver si `S_opt` sí lo hace | "Esta semana se quedaron pendientes 50k de SK13LN — con la reasignación propuesta sí entraban" |

Esto solo funciona si reconstruimos la demanda a partir del histórico (`reto.md` §6.2 mapper "histórico_2025"). Si tenemos también la demanda real planeada (caso 2026), aún mejor.

### 6.3 Resumen: capacidades por arquitectura

| Capacidad | A: Greedy | B: ILP | C: Greedy + ML | D: Grafo + ML |
|---|---|---|---|---|
| Detección **sin demanda** (descriptiva) | ✅ (simulador + queries) | ✅ | ✅ | ✅ + análisis de aristas caras del grafo histórico |
| Detección **con demanda** (contrafactual) | ✅ Subóptima | ✅ Óptima dentro del modelo | ✅ Buena, escala bien | ✅ Buena, además identifica los segmentos de path más caros |
| Atribución de causas | ✅ Reglas | ⚠️ Post-procesado | ✅ Reglas + SHAP | ✅ SHAP sobre arista + visualización del path |
| Argumentos de "ML real" para el brief | ❌ | ⚠️ matemática, no IA | ✅ OEE predicho | ✅ Changeover predicho (target acotado) |

---

## 7. Distribución de la demanda entre líneas — detalle

El brief lo pide explícitamente: "Recomendar línea y secuencia". Importante que las tres arquitecturas lo hagan, no solo secuencien dentro de una línea fija.

### 7.1 Restricciones de capability

De `sku_line_capability.csv` extraemos `can_produce(sku, tren) ∈ {True, False}`. Un SKU solo puede ir a una línea donde se haya producido al menos una vez históricamente (regla operativa razonable: si la línea jamás lo ha hecho, no asumimos que pueda).

### 7.2 Criterio de preferencia entre líneas factibles

Para cada SKU candidato a una línea factible `t`:
```
score(sku, t) = oee_median(sku, t) × speed_median(sku, t)
             ≈ uds_buenas_por_hora_históricas(sku, t)
```

Default: asignar a la línea con mayor `score`. Si la capacidad horaria de esa línea ya está saturada por la semana, ir a la segunda.

### 7.3 Casos donde partir entre líneas

Un bucket de uds grandes puede no caber en la línea preferida. Política:
- Si `uds_demanded × 1 / speed_median(sku, t_best) > horas_disponibles_t_best`, parte el bucket en `(t_best, t_second)`.
- Asigna al menos un mínimo razonable (e.g., 4 h productivas) a cada parte para que el cambio merezca la pena.

### 7.4 Esto se simula igual con las cuatro arquitecturas

El simulador no sabe (ni le importa) qué arquitectura del optimizador generó la asignación. Recibe `S_opt` con tren ya asignado a cada slot y lo evalúa. Esto refuerza la modularidad.

En la Arquitectura D la asignación de línea es **nativa** del m-TSP (un viajante por línea), mientras que en A/B/C es una decisión separada. En las cuatro el output al simulador es el mismo schema.

---

## 8. Comparación final

Lo que el usuario ve al final, independiente de arquitectura interna:

1. **Plan real** (`S_real`): tal cual ocurrió.
2. **Plan propuesto** (`S_opt`): la recomendación del optimizador, evaluada con el mismo simulador.
3. **Métricas lado a lado**:
   - ΔOEE_ponderado en horas.
   - Δh_cambios.
   - Δreasignaciones_línea.
   - Coverage (ambas deberían ser 100%).
4. **Drill-down**: clica en el día del peor delta → muestra qué transición concreta hace la diferencia + atribución de causa.

Este patrón es el mismo si bajo el capó usas A, B, C o D.

---

## 9. Plan concreto de implementación (orden recomendado)

Aproximadamente para 2 días de hackathon, 4 personas. **Plan asumiendo arquitectura D objetivo** con A de fallback.

| Bloque | Quién | Cuándo | Output |
|---|---|---|---|
| ETL → CSVs limpios | 1 persona | Sábado AM | `executed_runs.csv`, `changes_actual.csv`, etc. |
| Simulador determinista | 1 persona | Sábado AM/PM | Función `evaluate_sequence(S) → métricas`. Validación: aplicarlo a `S_real` reproduce OEE histórico |
| Construcción del grafo (nodos chunks + aristas teóricas) | 1 persona | Sábado AM/PM | `graph_builder.py` + matriz teórica de aristas |
| Optimizador A (greedy + reglas) | 1 persona | Sábado PM | Pipeline end-to-end funcionando con datos reales — **fallback garantizado** |
| UI básica (Gantt + métricas) | 1 persona | Sábado tarde | Visualización editable mínima |
| Detección de ineficiencias sin demanda | (paralelo) | Sábado tarde | Listado de top transiciones / aristas caras del grafo histórico |
| Modelo ML de aristas (changeover_time) | 1 persona | Sábado tarde / domingo AM | Gradient boosting + walk-forward + SHAP |
| Solver VRP con OR-Tools (Arq. D) | 1 persona | Domingo AM | Optimizador D funcional, salida = `sequence.csv` |
| Re-plan / perturbaciones | 1 persona | Domingo PM | What-if con avería o demanda urgente |
| Demo dry-run | Todos | Domingo final | Storytelling + métricas finales |

**Política fail-safe**: si la integración VRP falla, presentar con Arquitectura A (que ya está funcionando desde el sábado). Si el optimizador completo no funciona, presentar la detección descriptiva sin contrafactual (sigue siendo un entregable válido por el Objetivo 1 del brief).

**Pista de integración**: el ML de aristas y el simulador son **piezas reusables** entre arquitecturas. Si construyes A primero y luego decides cambiar a D, el simulador y el modelo ML siguen siendo útiles. Por eso el orden propuesto es robusto a pivotes.
