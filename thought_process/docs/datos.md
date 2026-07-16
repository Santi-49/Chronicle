# LineWise — Datos

> Reto Damm × Engineering HUB. Líneas 14 / 17 / 19 de latas, fábrica El Prat.
> Este documento describe **qué hay** en cada Excel facilitado, **cómo se enlazan** las tablas, y qué **datasets limpios** salen del ETL. La interpretación del problema y la metodología de optimización están en [`reto.md`](./reto.md).

---

## 0. Mapa rápido

| Bloque | Tabla(s) | Granularidad | Para qué sirve |
|---|---|---|---|
| **Pedidos / Demanda** | `Planificado - producciones 14 - 17 - 19.XLSX` (única fuente real) — `Diario Hl_Planif.xlsx` descartado | Día × turno × línea × SKU, **solo semana 18–24 may 2026** | Único input de demanda. Se reagrega a buckets semanales antes de entrar al optimizador |
| **Producción real (histórico)** | `OEE 14_17_19_ 2025.xlsx` ≡ `data - 2026-05-18….xlsx`, `Volumen…`, `Tiempo…`, `Mantenimiento…` | 1 fila = 1 WO terminado (2025-01 a 2025-12) | Qué pasó realmente: OEE, UDS, HL, descomposición temporal, mantenimiento |
| **Producción real (ventana demo)** | `Produccion_L14,17,19_18-22.xlsx` | 1 fila = 1 WO terminado (18–21 may 2026) | Realidad de la semana planificada (comparación final con la recomendación) |
| **Costes de transición** | `Tabla CF Prat 2026_14_17_19.xlsx` (hoja `LATA_BARRIL`), `Cambios 14_17_19_ 2025.xlsx` | Matriz por línea (teórico) + flags por OF (empírico) | Coste en horas de cambiar de un formato/SKU a otro |
| **Limpieza / mantenimiento** | `Tabla CF Prat 2026…` (hoja `Tiempos adicionales`) + filas con `SKU = LIMPIEZA` o `OF "PRT…-M"` | Calendario teórico + ejecución histórica | Restricciones de calendario y huecos forzados |
| **Catálogo SKU** | Columnas de producto en `OEE…` (Marca, Familia, Cerveza, Envase, Tipo Envase, Mat. Precio, Packaging…) | 1 fila = 1 WO, pero útil como lookup SKU → atributos | Para definir compatibilidades, features de cambio, y matriz de cambio |

**Pista clave**: `data - 2026-05-18T181640.542.xlsx` y `OEE 14_17_19_ 2025.xlsx` son **el mismo export** salvo dos filas de cabecera/total. Quédate con uno (recomiendo `OEE…`).

---

## 1. Inventario tabla por tabla

> Convención: ✅ relevante, ⚪ útil de contexto, ❌ ignorar para el optimizador.

### 1.1 `OEE 14_17_19_ 2025.xlsx` (sheet `Export`) — **Tabla maestra de WO ejecutados**

- Forma: **2.274 filas × 43 columnas**. Periodo 2025-01-02 → 2025-12-31.
- **Granularidad**: 1 fila = 1 work order (OF) terminado en una línea. `OF` es la clave única.
- **Por qué importa**: combina OEE + descomposición + atributos completos del SKU → es la espina dorsal del modelado.

| Columna | Tipo | Rol | Notas |
|---|---|---|---|
| `OF` | str | ✅ PK | Único. WOs reales empiezan con `0000…-1`; los `PRT…-M` son mantenimientos/limpiezas o ajustes manuales |
| `Fecha Fin` | datetime | ✅ ordenar secuencia | **No hay Fecha Inicio**: se infiere con `Fecha Fin - H. Tot.` |
| `SKU` | str | ✅ nodo del grafo | 170 únicos. Incluye `"LIMPIEZA"` como pseudo-SKU |
| `TREN` | float | ✅ partición línea | 14 / 17 / 19 |
| `OEE` | float | ✅ métrica principal | Mean 0.49, max 1.57 (Rend > 1 puntual). NaN en LIMPIEZA |
| `Disponibilidad` | float | ✅ submétrica A | Mean 0.55 |
| `Rendimiento` | float | ✅ submétrica P | Mean 0.82 |
| `Ineficiencia` | float | ✅ | Mean 0.09 — incluye casos negativos (correcciones / overshoot) |
| `Cambios` | str (SI/NO) | ✅ flag transición | Marca si hubo cambio respecto a la WO anterior |
| `Marca`, `Supramarca`, `Familia`, `Cerveza`, `ID Material Precio`, `Mat. Precio`, `Envase`, `Tipo Envase` | str | ✅ atributos SKU | Para features de cambio (cambio marca, formato, tapón…) |
| `Packaging Primario/Secundario`, `Tipo Palet`, `Unidades packaging primario/Secundario`, `Unidad/caja` | str/num | ✅ atributos SKU | Inducen tiempos de cambio (ver §1.5) |
| `Canal distribución`, `Organización ventas`, `Línea de Negocio/Producto`, `Material Comercial`, `Grupo materiales 4/5` | str | ⚪ contexto | Útiles para priorización comercial / matriz de beneficio |
| `CENTRO` | str | ❌ | Constante `PRAT` |
| `Columna Blanca`, `Cantidad registros`, `ID Tipo artículo`, `Tipo artículo`, `Retornable`, `ID Retornable`, `Palet` | str/num | ❌ | Casi constantes o vacías |

> **Calidad = 1 en todos los WO no-LIMPIEZA**. En este dataset OEE = A × P en la práctica. Lo confirmamos numéricamente.

### 1.2 `Tiempo 14_17_19_ 2025.xlsx` — **Descomposición temporal por WO**

- Forma: **2.278 × 33**. Misma granularidad que OEE (1 fila = 1 WO).
- Llave: `WOID` (≡ `OF` en el resto de tablas).

| Columna | Rol | Para qué |
|---|---|---|
| `WOID`, `Fecha Fin`, `SKU`, `TREN` | ✅ PK + dims | Join con OEE/Volumen |
| `H. Tot.` | ✅ duración total del WO (horas) | Mean 18.5 h, mediana 5.5 h (hay outliers). Es lo más cercano a duración |
| `Tiempo Máquina en Marcha` | ✅ tiempo productivo neto | Numerador de Disp en cierta medida |
| `Tiempo Máquina en paro` / `Par. tot` / `% Parada` | ✅ paradas | Numerador del downtime |
| `PNP` | ✅ paro no programado | Componente de la ineficiencia |
| `Limpieza` | ✅ tiempo de limpieza dentro del WO | No solo aparece en LIMPIEZA WOs |
| `IDLE` | ✅ | Tiempo idle |
| `Tiempo Paro por Saturación a la Salida` | ✅ | Bloqueado downstream |
| `Tiempo Paro por Falta Producto` | ✅ | Bloqueado upstream / falta de inputs |
| `Tiempo Baja Velocidad` | ✅ | Bajada de rendimiento |
| `Tiempo de CIP`, `Tiempo de esterilización` | ✅ | Higiene/CIP del propio WO |
| `Tiempo Operativo Neto`, `Tiempo Operativo Neto2` | ⚪ | Net operating time (definiciones distintas — descartar) |
| `OEE/Disp./Rend./Calidad/Inef.` | ⚪ | Duplicado de OEE table |
| `MAQUINA` | ❌ | Constante `LLENAD` |
| `Calidad` | ❌ | Constante 1 |

> **Tip**: `Tiempo Máquina en Marcha / H. Tot.` ≈ Disponibilidad. `UDS / Tiempo Máquina en Marcha` da velocidad real por hora. Combinando ambos por SKU obtenemos *speed_real_por_sku*.

### 1.3 `Volumen 14_17_19_ 2025.xlsx` — **Producción real por WO**

- Forma: **2.278 × 19**. 1 fila = 1 WO. Llave: `OF`.

| Columna | Rol |
|---|---|
| `OF`, `Fecha Fin`, `SKU`, `TREN` | ✅ PK + dims |
| `UDS` | ✅ unidades producidas (latas) |
| `HL` | ✅ hectolitros producidos |
| `OEE/DISP/REND/CALID/INEF` | ⚪ duplicado |
| Resto | ❌ duplicados |

> En la práctica `Volumen` aporta solo dos columnas nuevas vs OEE/Tiempo: **`UDS` y `HL`**. Todo lo demás se elimina tras el join.

### 1.4 `Mantenimiento 14_17_19_ 2025.xlsx` — **Intervenciones de mantenimiento por WO**

- Forma: **2.276 × 23**. 1 fila = 1 WO con métricas de mantenimiento (NaN si no se llamó). Llave: `OF`.

| Columna | Rol |
|---|---|
| `OF`, `Fecha Fin`, `SKU`, `TREN` | ✅ PK + dims |
| `Nº LLamadas` | ✅ número de avisos durante el WO |
| `Tiempo en Espera` | ✅ horas WO parado esperando al técnico |
| `Tiempo Intervención` | ✅ horas técnico interviniendo |
| `Tiempo Total` | ✅ suma de los dos anteriores |
| `Tiempo Total en Marcha`, `Tiempo Total en Paro` | ✅ desagregación |
| `OEE/DISP/REND/CALID/INEF` | ⚪ duplicado |

> **Uso**: feature predictiva para el modelo de OEE esperado **y** fuente principal de `incident_log.csv` para el replay determinista (ver `reto.md` §3.7).

### 1.5 `Tabla CF Prat 2026_14_17_19.xlsx` — **Matriz teórica de cambios y calendario**

- 2 hojas. Estructura "humana" (multinivel, con cabeceras combinadas). Parsear a mano.

**Hoja `LATA_BARRIL` — matriz de cambio entre formatos por línea**
- Por cada `TREN`: sub-matriz de transiciones entre formatos (`1/3 → 1/2 → 2/5 → Cambio Packaging → Cambio a Bandeja → Cambio Paletizado`).
- Valores: duración del cambio (`30 min`, `1 h`, `3 h`, `6 h`, `8 h`…). String — hay que convertir a horas.
- Ejemplo TREN 14: `1/3 → 1/2` = 3 h. Hay celdas vacías que pueden significar "no aplica".

**Hoja `Tiempos adicionales` — durations a sumar y calendario de limpieza/mantenimiento**
- Tiempos por evento, por línea, según número de turnos (1/2/3/5 turnos):
  - **Arranque** (1 h), **Final** (30 min), **Cambio cerveza**, **Cambio etiqueta/tapón**, **Cambio lata**, **CIP**, **Esterilización**, **Limpieza** (8 h), **Mantenimiento** (8 h)
- Frecuencias: MENSUAL / QUINCENAL / SEMANAL / día concreto (L, J, V).
- **TREN 14 a 5 turnos**: Limpieza = 8 h los viernes (semanal); Mantenimiento = 8 h los lunes (quincenal). ✔️ coincide con el briefing.

> Es la **fuente teórica** de costes. La pareja "matriz teórica + histórico real" permite detectar cambios ineficientes.

### 1.6 `Cambios 14_17_19_ 2025.xlsx` — **Histórico empírico de transiciones por WO**

- Forma: **2.181 × 22** (137 WOs sin entrada — coinciden con LIMPIEZA y algunos mantenimientos).
- Llave: `OF` (la WO de destino, *después* del cambio).

| Columna | Rol |
|---|---|
| `OF`, `Fecha Fin`, `SKU` | ✅ PK + destino |
| `Nº de Cambios` | ✅ nº componentes que cambiaron al entrar a este WO |
| `Frecuencia Total` | ⚠️ mean 1.65, max 17.5 — magnitud parece horas, nombre ambiguo. Tratada como horas empíricas con validación cruzada (ver §6) |
| `C. PRINCIPAL` | ✅ tipo principal: `Contenido`, `Marca`, `Pack, Primario`, `Pack. Secundario`, `Palet`, `Referencia`, `Tapa/Tapón`, `Volumen Envase` |
| `C. Brand`, `C. CAP`, `C. Envase`, `C. Palet`, `C. Primario`, `C. Producto`, `C. Secundario`, `C. Volum` | ✅ flags binarios (0/1; algún outlier en Brand) por componente |
| `Marca`, `Familia`, `Cerveza`, `Material Precio`, `Envase`, `Tipo Envase` | ⚪ atributos SKU destino |
| `CENTRO`, `Columna Blanca` | ❌ |

> **No tiene `TREN`** — siempre join con OEE vía `OF` para conocer la línea.
> Es esencial para construir la **matriz empírica de transiciones**.

### 1.7 `Planificado - producciones 14 - 17 - 19.XLSX` — **Plan teórico semana 18-24 may 2026**

- Forma: **78 × 16**. 1 fila = 1 slot planificado (línea + fecha + turno + SKU + cantidad).
- Cubre 7 días con 33 SKUs únicos. Cantidad total: ~4.13 M (mezcla CAJ/UN).

| Columna | Rol |
|---|---|
| `Material` | ✅ = SKU |
| `Centro` | ❌ siempre 99 |
| `Tren` | ✅ 14/17/19 |
| `Fecha ini.`, `Hora ini.`, `Fecha fin` | ✅ ventana del slot |
| `Definición de turno` | ✅ M / T / N (mañana/tarde/noche) |
| `Cntd JDA` | ⚪ cantidad propuesta por Blue Yonder (JDA) |
| `Cntd plan` | ✅ cantidad acordada del plan |
| `Pndt. Env` | ✅ pendiente de envasar |
| `Unidad medida base` | ⚪ CAJ / UN |
| `Versión producción` | ✅ versión por línea (V014, V017, V019) |
| `Secuencia`, `No PAC`, `Manual`, `Entrada en tabla` | ❌ flags casi vacíos |

> **OJO unidades**: `Cntd plan` viene en CAJ o UN. Normalizar a UDS usando `Unidad/caja` (en OEE master).

> **Rol en el pipeline**: es **una solución de planificación de los planners de Damm** (ya tiene línea, día y turno), **no es demanda cruda**. Para usarlo como input del optimizador hay que reagregarlo a buckets semanales descartando tren/día/turno. Para la comparación final con la propuesta sí se conserva tal cual.

### 1.8 `Diario Hl_Planif.xlsx` — **DESCARTAR** (redundante e inconsistente)

- Forma: **44 × 98** en formato pivot (cabeceras mezcladas con línea y SKU).
- Cubre la misma ventana (18–24/05/2026) que `Planificado…` pero con discrepancias:
  - 5 SKUs en `Planificado` no aparecen aquí (`3BNZFLB1, 3BNMSL20, VO13LT, ED13LCN, ENB13LBF`).
  - 6 SKUs aquí no aparecen en `Planificado` (`ED13P24N, FDT13LTM, ED13LTMC, VI1324MY, ED13LMCM` + fila `TOTAL`).
  - Unidades distintas: aquí HL, en `Planificado` CAJ/UN.

**Recomendación**: **no usar**. `Planificado - producciones…` cubre la misma información con granularidad operativa.

### 1.9 `Produccion_L14,17,19_18-22.xlsx` — **Producción real semana 18-22 may 2026**

- Forma: **36 × 19**. 1 fila = 1 WO terminado entre 2026-05-18 y 2026-05-21.

> **Función**: validación. Plan vs realidad de esa semana muestra ya el desfase:
> - 78 slots planeados → 36 WOs reales.
> - SKUs planificados pero no producidos: `VO13LT, ED13LCN, EX1324NB, SK13LN, ENB13LBF, 3BNMSL20, 3BNZFLB1, EN1324BI`.
> - SKUs producidos pero no planeados: `VI13M12X, VI13P12X, FDT13LTM, ED13LMCM`.

### 1.10 `data - 2026-05-18T181640.542.xlsx` — **DUPLICADO de OEE 14_17_19_ 2025**

- Confirmado por intersección 2274/2274 OFs y valores idénticos. Diferencia: 2 filas adicionales (Total + Filtros).
- **Acción**: descartar.

---

## 2. Esquema de datos limpios y joins

```
                       ┌─────────────────────────┐
                       │   sku_master            │  ← drop_duplicates por SKU desde OEE
                       │   (SKU PK)              │
                       │   marca, familia,       │
                       │   tipo_envase, cerveza, │
                       │   pkg_pri, pkg_sec,     │
                       │   uds_por_caja…         │
                       └────────────┬────────────┘
                                    │ SKU
                       ┌────────────┴─────────────┐
                       │  executed_runs           │  ← join OEE+Tiempo+Volumen+Mant. por OF
                       │  (of PK)                 │
                       │  sku, tren, fecha_fin,   │
                       │  fecha_ini (derivada),   │
                       │  h_tot, t_marcha,        │
                       │  t_paro, t_baja_vel,     │
                       │  t_limpieza, t_cip,      │
                       │  uds, hl,                │
                       │  oee, a, p, q,           │
                       │  n_llamadas_mant,        │
                       │  t_mant_total,           │
                       │  cambio_si_no            │
                       └──────────┬───────────────┘
                                  │ OF
                       ┌──────────┴───────────────┐
                       │  changes_actual          │  ← Cambios (origen empírico)
                       │  (of PK)                 │
                       │  c_principal, n_cambios, │
                       │  c_brand…c_volum,        │
                       │  frecuencia_total ⚠      │
                       └──────────────────────────┘
```

### 2.1 Joins exactos

| Tabla limpia | Origen | Join |
|---|---|---|
| `executed_runs` | OEE + Tiempo + Volumen + Mantenimiento | `OF == WOID` (1:1) |
| `changes_actual` | Cambios | `OF` (137 WOs sin cambio asociado → LIMPIEZA/M) |
| `sku_master` | OEE (drop_duplicates por SKU) | — |
| `changeover_matrix_theoretical` | Tabla CF (`LATA_BARRIL` + `Tiempos adicionales`) | parseo manual |
| `changeover_matrix_empirical` | `executed_runs` ordenado por TREN+Fecha Fin → calcular transición `(sku_prev → sku_actual)` y cruzar con `changes_actual.frecuencia_total` y `Tiempo.PNP` previo al inicio de marcha | — |
| `orders` semana 2026 | `Planificado…` (limpieza de unidades) | — |
| `weekly_actual` semana 2026 | `Produccion_L14,17,19_18-22.xlsx` | (subconjunto de executed_runs en 2026) |

### 2.2 Transformaciones críticas a documentar en código

1. **Derivar `fecha_ini` de cada WO**: ordenar por `(TREN, Fecha Fin)` y restar `H. Tot.` o tomar el `Fecha Fin` del WO anterior + tiempo de cambio.
2. **Normalizar unidades del plan**: `Cntd plan` × `Unidad/caja` cuando `Unidad medida base == "CAJ"`.
3. **Convertir strings de la matriz CF** a horas (`"1 h 15 min"` → 1.25 h).
4. **Identificar tipo de evento por OF**: `OF.startswith("PRT") and SKU == "LIMPIEZA"` → evento de limpieza; `OF.startswith("PRT")` con SKU real → re-ejecución de producción manual; resto → WO normal.
5. **Calcular velocidad efectiva por SKU**: `UDS / Tiempo Máquina en Marcha` agrupado por SKU y línea (mediana). En el histórico: rango ~43k–86k UDS/h.

---

## 3. Datasets limpios output del ETL (CSV)

> Los datasets se dividen en **tres bloques** según su rol respecto al optimizador. Los contratos de entrada/salida del optimizador están en [`reto.md`](./reto.md) §4.bis.

### 3.1 Tablas-fuente (resultado del ETL bruto)

| Fichero | Origen | Filas aprox | Descripción |
|---|---|---|---|
| `executed_runs.csv` | join OEE + Tiempo + Volumen + Mantenimiento | 2.274 | tabla maestra histórica de WOs |
| `changes_actual.csv` | Cambios | 2.181 | flags de cambio por WO destino |
| `sku_master.csv` | OEE → drop_duplicates por SKU | 170 | catálogo SKU |

### 3.2 Inputs del optimizador (cumplen el contrato en `reto.md` §4.bis)

| Fichero | Rol | Filas aprox |
|---|---|---|
| `demand.csv` | **Demanda** (interfaz única, schema fijo) | variable |
| `sku_line_capability.csv` | Qué SKUs puede producir cada línea + velocidad y OEE medianos por (sku, tren) | ~170 × 3 ≈ 510 |
| `changeover_matrix.csv` | Coste en horas para pasar de `sku_from` a `sku_to` en una línea. Fusión teórico + empírico | variable |
| `calendar_constraints.csv` | Eventos fijos por línea (limpieza viernes 8 h, mantenimiento lunes quincenal 8 h, etc.) | reglas |
| `optimizer_hyperparams.yaml` | Hiperparámetros del optimizador | — |

### 3.3 Trazabilidad, comparación y simulación realista (no son input del optimizador)

| Fichero | Origen | Para qué |
|---|---|---|
| `weekly_actual_v2026_05.csv` | `Produccion_L…` | Realidad semana demo (comparación final con `S_opt`) |
| `executed_sequences.csv` | derivado de `executed_runs` ordenado por (tren, fecha_fin) | Secuencias reales — `S_real` del post-mortem |
| `incident_log.csv` | derivado de `Mantenimiento` + `Tiempo` (`Nº LLamadas`, `Tiempo en Espera`, `Tiempo Intervención`, `Tiempo Paro por Saturación a la Salida`, `Tiempo Paro por Falta Producto`) | Bloques de incidentes anclados a `(tren, instante, duracion_h, motivo)`. Se usa en el replay determinista para evaluar `S_opt` con la misma carga de averías que sufrió `S_real` |

---

## 4. Asunciones y advertencias sobre los datos

1. **`data - 2026-05-18….xlsx` es duplicado** de `OEE 14_17_19_ 2025.xlsx`. Verificado por OF y valores. **No usar como fuente independiente.**
2. **Calidad ≡ 1** en el dataset 2025 (todas las filas no-LIMPIEZA). En la práctica solo optimizamos A × P.
3. **OEE > 1 en algunos WO** (max 1.57): el rendimiento puede superar 1 porque la velocidad teórica está conservadora. Mantener tal cual y reportar P50/P95.
4. **`Frecuencia Total` en `Cambios.xlsx`**: magnitud parece horas, nombre ambiguo. Validar por correlación con `PNP`; fallback al teórico si no correlaciona.
5. **No tenemos `Fecha Inicio` explícita** por WO — la inferimos. Puede introducir solapes con limpiezas: investigar.
6. **`H. Tot.` máximo 21065 h** (≈ 877 días) — outlier evidente. Filtrar/clip antes de modelar.
7. **WOs `PRT…-M`** no son siempre mantenimiento. Regla: `PRT*-M ∧ SKU=LIMPIEZA → limpieza`; resto → re-ejecuciones de producción.
8. **`Cambios` no tiene `TREN`** → siempre llegar a la línea vía `OEE.OF`.
9. **Unidades inconsistentes en plan**: mezcla `CAJ` y `UN`. Normalizar con `Unidad/caja`.
10. **WOs sin par anterior** (primero de la línea o tras hueco grande): no se les asigna `sku_prev`. Tratar como "desde estado neutro" usando `arranque` puro.
11. **`Diario Hl_Planif`** descartado por redundancia + inconsistencias + formato pivot duro.
12. **`Mantenimiento.Tiempo en Espera + Intervención`** se solapan con `Tiempo.PNP` y `Tiempo Máquina en paro` → no sumar a ciegas, hay double-counting. Auditar con WO de ejemplo antes de modelar.
13. **Velocidad teórica por SKU no aparece** — la inferimos del histórico (mediana).
14. **Matriz de beneficio** no existe en los datos → hiperparámetro de usuario.

---

## 5. Decisiones internas tomadas con los datos que hay

> No se piden más datos. Para cada ambigüedad se aplica la decisión más conservadora y se documenta el porqué para que el jurado pueda criticarla con base.

| Ambigüedad | Decisión | Justificación |
|---|---|---|
| Significado de `Frecuencia Total` en `Cambios.xlsx` | **Tratar como horas de cambio empíricas**. Validar correlación con `PNP`. Si débil, **ignorar** y usar match teórico + `Tiempo Máquina en paro` | Magnitudes (mean 1.65 h, max 17.5 h) son compatibles con horas |
| `OEE > 1` y `Ineficiencia < 0` | **Mantener tal cual sin capar**. Reportar P50 y P95 | Capar destruye información de mejora real |
| Falta de **velocidad estándar por SKU** | Derivada del histórico: `velocidad_efectiva(sku, línea) = mediana(UDS / Tiempo Máquina en Marcha)` | Velocidad real observada, mejor que un teórico ausente |
| Falta de **`Fecha Inicio`** | Derivada como `Fecha Fin - H. Tot.` con ajustes para no solapar el WO anterior | Suficiente para Gantt aproximada y para sumar cambios |
| `Tiempo Operativo Neto` vs `Tiempo Operativo Neto2` | **Usar `Tiempo Máquina en Marcha`** y descartar las dos columnas Neto | Es la columna con interpretación operativa más clara |
| **No hay demanda histórica real** | **Producción real 2025 ≡ demanda 2025**. Agregamos UDS por (SKU, semana) → input del post-mortem | Permite back-testing sin inventar datos |
| `Calidad ≡ 1` | Asumimos calidad ya descontada aguas arriba. **No optimizamos Q** | Comportamiento consistente en 2.274 WOs |
| Falta de **tabla maestra de packaging→tiempo** | Parseo manual de `Tabla CF Prat`. Donde el Excel no aplica → mediana empírica de la transición | Fallback automático |
| WOs `PRT…-M` con SKU real | Tratarlos como WOs de producción normales. Solo `SKU=LIMPIEZA` es especial | Sus métricas son comparables |
| Definición exacta de **Disponibilidad** | `Disponibilidad = Tiempo Máquina en Marcha / H. Tot.` y validar contra columna provista. Si difiere, usar la provista | Pragmático |
| **Matriz de beneficio por SKU** | Hiperparámetro de usuario en la UI. Default = todos iguales | Permite el caso "priorizar SKUs rentables" sin requerir info comercial |
