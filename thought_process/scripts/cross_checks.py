"""Cruza tablas para confirmar relaciones y descubrir granularidad real."""
from __future__ import annotations
from pathlib import Path
import pandas as pd

DATA = Path(r"C:/Users/romag/Documents/Repte operacions/data")

oee = pd.read_excel(DATA / "OEE 14_17_19_ 2025.xlsx")
raw = pd.read_excel(DATA / "data - 2026-05-18T181640.542.xlsx")
tiempo = pd.read_excel(DATA / "Tiempo 14_17_19_ 2025.xlsx")
volumen = pd.read_excel(DATA / "Volumen 14_17_19_ 2025.xlsx")
mant = pd.read_excel(DATA / "Mantenimiento 14_17_19_ 2025.xlsx")
cambios = pd.read_excel(DATA / "Cambios 14_17_19_ 2025.xlsx")
plan = pd.read_excel(DATA / "Planificado - producciones 14 - 17 - 19.XLSX")
prod = pd.read_excel(DATA / "Produccion_L14,17,19_18-22.xlsx")

print("=== 1) Is `data - ...` a duplicate of OEE? ===")
print(f"OEE rows={len(oee)}, raw rows={len(raw)}")
print(f"OEE columns set == raw columns set: {set(oee.columns) == set(raw.columns)}")
# common OFs
common = set(oee['OF'].dropna()) & set(raw['OF'].dropna())
only_oee = set(oee['OF'].dropna()) - set(raw['OF'].dropna())
only_raw = set(raw['OF'].dropna()) - set(oee['OF'].dropna())
print(f"OFs common={len(common)} only_in_OEE={len(only_oee)} only_in_raw={len(only_raw)}")
print(f"Examples only in raw: {list(only_raw)[:5]}")
print(f"Examples only in OEE: {list(only_oee)[:5]}")
# check if numeric columns match
if common:
    sample = list(common)[:1][0]
    a = oee[oee.OF == sample].iloc[0]
    b = raw[raw.OF == sample].iloc[0]
    diff_cols = [c for c in oee.columns if c in raw.columns and not (pd.isna(a[c]) and pd.isna(b[c])) and a[c] != b[c]]
    print(f"For OF={sample}, columns differing: {diff_cols[:10]}")

print("\n=== 2) Same OF set across OEE/Tiempo/Volumen/Mantenimiento? ===")
sets = {
    "OEE": set(oee['OF'].dropna()),
    "Tiempo": set(tiempo['WOID'].dropna()),
    "Volumen": set(volumen['OF'].dropna()),
    "Mantenimiento": set(mant['OF'].dropna()),
    "Cambios": set(cambios['OF'].dropna()),
}
for k, v in sets.items():
    print(f"  {k}: {len(v)} unique OFs")
print(f"  Intersection of all 5: {len(set.intersection(*sets.values()))}")
print(f"  OEE \\ Tiempo: {len(sets['OEE']-sets['Tiempo'])}")
print(f"  Tiempo \\ OEE: {len(sets['Tiempo']-sets['OEE'])}")
print(f"  OEE \\ Cambios: {len(sets['OEE']-sets['Cambios'])}")
print(f"  Cambios \\ OEE: {len(sets['Cambios']-sets['OEE'])}")

print("\n=== 3) WO durations & ordering ===")
print("Tiempo H. Tot describe:")
print(tiempo['H. Tot.'].describe())
# is there a Fecha Inicio anywhere? Check whether OFs are ordered by Fecha Fin within line
print("\nSample ordered by TREN, Fecha Fin in Tiempo:")
print(tiempo.sort_values(['TREN','Fecha Fin']).head(8)[['WOID','Fecha Fin','TREN','SKU','H. Tot.','OEE']].to_string())

print("\n=== 4) Cambios - per-WO meaning ===")
print("Cambios head, focusing on transition meaning:")
print(cambios.head(8)[['OF','Fecha Fin','SKU','Nº de Cambios','Frecuencia Total','C. PRINCIPAL']].to_string())
print(f"\nCambios row count vs OEE row count: {len(cambios)} vs {len(oee)}")
print(f"Does Cambios have TREN? Columns: {list(cambios.columns)}")

print("\n=== 5) Limpieza rows ===")
limp_in_tiempo = tiempo[tiempo['SKU']=='LIMPIEZA']
print(f"Limpieza rows in Tiempo: {len(limp_in_tiempo)}")
print(limp_in_tiempo.head(8)[['WOID','Fecha Fin','TREN','SKU','H. Tot.','Limpieza','PNP']].to_string())
print("Distribution of Limpieza H. Tot.:")
print(limp_in_tiempo['H. Tot.'].describe())

print("\n=== 6) Plan vs actual for the 18-22 May window ===")
print(f"Plan rows: {len(plan)}, dates: {plan['Fecha ini.'].min()} - {plan['Fecha ini.'].max()}")
print(plan[['Material','Tren','Fecha ini.','Hora ini.','Definición de turno','Cntd plan','Versión producción']].head(15).to_string())
print(f"\nProd rows: {len(prod)}, dates: {prod['Fecha Fin'].min()} - {prod['Fecha Fin'].max()}")
print(prod[['OF','Fecha Fin','SKU','TREN','UDS','HL','OEE']].to_string())

print("\n=== 7) Compare plan SKUs vs actual SKUs that week ===")
plan_skus = set(plan['Material'])
prod_skus = set(prod['SKU'].dropna())
print(f"Plan unique SKUs: {len(plan_skus)} | Actual unique SKUs: {len(prod_skus)}")
print(f"In plan but not produced: {plan_skus - prod_skus}")
print(f"Produced but not in plan: {prod_skus - plan_skus}")

print("\n=== 8) OEE distribution by SKU type (real beer vs LIMPIEZA) ===")
print(oee.groupby('Familia')['OEE'].agg(['count','mean','min','max']).sort_values('count', ascending=False).head(15).to_string())

print("\n=== 9) Per-line OEE & throughput overall ===")
print(oee.groupby('TREN')[['OEE','Disponibilidad','Rendimiento']].agg(['mean','count']).to_string())
print("Volumen per line:")
print(volumen.groupby('TREN')[['UDS','HL']].sum().to_string())

print("\n=== 10) Are 'changes' (Cambios.SI in OEE.Cambios col) correlated with lower OEE? ===")
print(oee.groupby('Cambios')['OEE'].agg(['count','mean','median','std']).to_string())

print("\n=== 11) Speed by SKU (UDS / Tiempo Operativo Neto) ===")
m = tiempo.merge(volumen[['OF','UDS','HL']], left_on='WOID', right_on='OF', how='left')
m['UDS_per_h'] = m['UDS'] / m['Tiempo Máquina en Marcha'].replace(0, pd.NA)
top = m[m['SKU']!='LIMPIEZA'].groupby('SKU')['UDS_per_h'].agg(['count','mean','median']).query('count>=5').sort_values('mean', ascending=False)
print("Top throughput SKUs:")
print(top.head(10).to_string())
print("Bottom throughput SKUs:")
print(top.tail(10).to_string())
