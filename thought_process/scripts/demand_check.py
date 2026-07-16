"""¿Cuánta demanda tenemos? ¿Es Diario Hl_Planif un pivot de Planificado?"""
from pathlib import Path
import pandas as pd

DATA = Path(r"C:/Users/romag/Documents/Repte operacions/data")

plan = pd.read_excel(DATA / "Planificado - producciones 14 - 17 - 19.XLSX")
diario = pd.read_excel(DATA / "Diario Hl_Planif.xlsx")

print("=== Planificado ===")
print(f"rows={len(plan)}")
print(f"date range: {plan['Fecha ini.'].min()} → {plan['Fecha ini.'].max()}")
print(f"unique SKUs: {plan['Material'].nunique()}")
print(f"unique TRENs: {sorted(plan['Tren'].unique())}")
print(f"unique dias: {sorted(plan['Fecha ini.'].dt.date.unique())}")
print(f"unique turnos: {sorted(plan['Definición de turno'].unique())}")
print(f"Cntd plan total: {plan['Cntd plan'].sum():,.0f}  unidad mix: {plan['Unidad medida base'].value_counts().to_dict()}")

print("\n=== Diario Hl_Planif ===")
print(f"rows={len(diario)}, cols={len(diario.columns)}")
# first col tiene labels mezclados (línea+sku)
labels = diario.iloc[:, 0].dropna().astype(str).tolist()
print(f"First-col labels (first 25): {labels[:25]}")
# extract just SKU-like labels (no spaces, no 'Tren', no 'Centro')
sku_like = [l for l in labels if 'Tren' not in l and 'Centro' not in l and 'Total' not in l]
print(f"SKU-like labels: {sku_like}")
# Compare with planificado SKUs
plan_skus = set(plan['Material'])
diario_skus = set(s.strip() for s in sku_like)
print(f"\nPlan SKUs ({len(plan_skus)}): {sorted(plan_skus)}")
print(f"Diario SKUs ({len(diario_skus)}): {sorted(diario_skus)}")
print(f"In plan but not in diario: {plan_skus - diario_skus}")
print(f"In diario but not in plan: {diario_skus - plan_skus}")

# HL: ¿son consistentes? Total HL del Diario (col TOTAL Programa Prod.) vs Planificado convertido
print("\n=== HL consistency ===")
total_hl_diario = diario['Programa Prod.\nTOTAL'].sum()
print(f"Diario Programa Prod. TOTAL sum: {total_hl_diario:,.2f} HL")
# Plan está en CAJ/UN, no HL directo, así que no se puede comparar trivialmente — flag

print("\n=== ¿Hay demanda fuera de la semana 18-24/05/2026 en algún sitio? ===")
# Look at Planificado date range and check if it's only that week
print(f"Plan total days: {plan['Fecha ini.'].dt.date.nunique()}")
print(f"Diario columnas únicas (extraer fechas): ", end="")
date_cols = sorted({c.split('\n')[1] for c in diario.columns if '\n' in c and 'TOTAL' not in c})
print(date_cols)
