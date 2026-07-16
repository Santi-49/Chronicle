"""Inspecciona cada Excel del dataset y guarda un resumen en stdout.

Para cada hoja: shape, columnas, dtypes, head(5), nulos, nunique en categóricas,
min/max en numéricas o de fecha. No interpretamos negocio aquí — solo describimos.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

DATA_DIR = Path(r"C:/Users/romag/Documents/Repte operacions/data")

FILES = [
    "Cambios 14_17_19_ 2025.xlsx",
    "Diario Hl_Planif.xlsx",
    "Mantenimiento 14_17_19_ 2025.xlsx",
    "OEE 14_17_19_ 2025.xlsx",
    "Planificado - producciones 14 - 17 - 19.XLSX",
    "Produccion_L14,17,19_18-22.xlsx",
    "Tabla CF Prat 2026_14_17_19.xlsx",
    "Tiempo 14_17_19_ 2025.xlsx",
    "Volumen 14_17_19_ 2025.xlsx",
    "data - 2026-05-18T181640.542.xlsx",
]


def describe_df(df: pd.DataFrame, sheet: str) -> None:
    print(f"\n  -- Sheet: {sheet} --")
    print(f"  Shape: {df.shape}")
    print(f"  Columns ({len(df.columns)}):")
    for c in df.columns:
        dt = df[c].dtype
        nn = df[c].notna().sum()
        nu = df[c].nunique(dropna=True)
        extra = ""
        if pd.api.types.is_numeric_dtype(df[c]):
            try:
                extra = f" min={df[c].min()} max={df[c].max()} mean={df[c].mean():.2f}"
            except Exception:
                extra = ""
        elif pd.api.types.is_datetime64_any_dtype(df[c]):
            try:
                extra = f" min={df[c].min()} max={df[c].max()}"
            except Exception:
                extra = ""
        else:
            try:
                # show up to 5 sample values for low-cardinality strings
                if nu <= 15:
                    extra = f" values={sorted(map(str, df[c].dropna().unique().tolist()))[:15]}"
            except Exception:
                extra = ""
        print(f"    - {c!r:40s} dtype={str(dt):15s} non_null={nn:>7d} nunique={nu:>6d}{extra}")
    print("  Head:")
    with pd.option_context("display.max_columns", None, "display.width", 200, "display.max_colwidth", 40):
        print(df.head(5).to_string())


def main() -> None:
    for f in FILES:
        path = DATA_DIR / f
        print("\n" + "=" * 100)
        print(f"FILE: {f}  ({path.stat().st_size/1024:.1f} KB)")
        print("=" * 100)
        try:
            xl = pd.ExcelFile(path)
        except Exception as e:
            print(f"  ERROR opening: {e}")
            continue
        print(f"  Sheets: {xl.sheet_names}")
        for sheet in xl.sheet_names:
            try:
                df = pd.read_excel(path, sheet_name=sheet)
            except Exception as e:
                print(f"  ERROR reading sheet {sheet}: {e}")
                continue
            describe_df(df, sheet)


if __name__ == "__main__":
    main()
