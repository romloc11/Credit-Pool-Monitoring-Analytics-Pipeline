"""
Ejecuta el pipeline SQL (bronze -> silver -> gold) contra un archivo
DuckDB local, un script a la vez y en orden.

Se corre paso a paso (no todo en una sola conexion sin feedback) para
poder aislar en que capa truena algo si algo truena, en vez de recibir
un solo error generico al final.
"""

import sys
from pathlib import Path

import duckdb

DB_PATH = Path("data/pool_credito.duckdb")

CAPAS = ["bronze", "silver", "gold"]


def ejecutar_script(con: duckdb.DuckDBPyConnection, script: Path) -> None:
    sql = script.read_text(encoding="utf-8")
    print(f"  -> {script.name}")
    con.execute(sql)


def main() -> None:
    capas_a_correr = sys.argv[1:] or CAPAS

    con = duckdb.connect(str(DB_PATH))
    try:
        for capa in capas_a_correr:
            carpeta = Path("sql") / capa
            scripts = sorted(carpeta.glob("*.sql"))
            if not scripts:
                print(f"[{capa}] sin scripts, se omite")
                continue
            print(f"[{capa}]")
            for script in scripts:
                ejecutar_script(con, script)
    finally:
        con.close()

    print(f"\nListo. Base de datos: {DB_PATH}")


if __name__ == "__main__":
    main()
