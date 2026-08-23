"""
Runs the SQL pipeline (bronze -> silver -> gold) against a local DuckDB
file, one script at a time and in order.

Run step by step (not all in a single connection with no feedback) so
that if something breaks, we can isolate which layer broke it, instead
of getting one generic error at the end.
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
                print(f"[{capa}] no scripts, skipping")
                continue
            print(f"[{capa}]")
            for script in scripts:
                ejecutar_script(con, script)
    finally:
        con.close()

    print(f"\nDone. Database: {DB_PATH}")


if __name__ == "__main__":
    main()
