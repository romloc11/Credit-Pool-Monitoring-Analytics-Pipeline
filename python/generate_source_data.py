"""
Generates synthetic source data that simulates the transactional system
(pedidos_pool_clientes, estatus_pool, vendedores) it was originally
extracted from via OPENQUERY/Linked Server.

The company's real dataset can't be published. This generator creates
a dataset with the same structure and the same inconsistencies the real
data had (freely formatted usernames, out-of-catalog status in a date
range, orders still unresolved), so the silver/gold layers have real
cleaning work to do instead of just being a copy of the source.

Fixed seed -> same dataset on every run (reproducible).
"""

import numpy as np
import pandas as pd

SEED = 42
rng = np.random.default_rng(SEED)

FECHA_INICIO = pd.Timestamp("2026-01-01")
DIAS_HISTORIA = 180
FECHA_FIN = FECHA_INICIO + pd.Timedelta(days=DIAS_HISTORIA)

N_CLIENTES = 200
N_ANALISTAS = 10


# ---------------------------------------------------------------------------
# Catalogs
# ---------------------------------------------------------------------------

def generar_estatus_pool() -> pd.DataFrame:
    return pd.DataFrame(
        [
            (1, "Liberado"),
            (2, "Cancelado"),
            (3, "En revision"),
            (4, "Liberado con excepcion"),
        ],
        columns=["estatus", "descripcion"],
    )
    # note: estatus = 0 doesn't live in the catalog -> the source system uses
    # it as a special flag for "just blocked, not touched yet"


def generar_vendedores() -> pd.DataFrame:
    nombres = [
        "Ana Torres", "Luis Ramirez", "Karla Mendez", "Jorge Salinas",
        "Paola Herrera", "Diego Castillo", "Monica Vega", "Sergio Nunez",
        "Ivonne Rios", "Hector Paredes",
    ]
    usuarios = [n.split()[0].lower() + "." + n.split()[1].lower() for n in nombres]
    return pd.DataFrame(
        {"usuario": usuarios[:N_ANALISTAS], "nombre": nombres[:N_ANALISTAS]}
    )


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

def _fecha_aleatoria(dia_base: pd.Timestamp) -> pd.Timestamp:
    segundos = rng.integers(0, 24 * 3600)
    return dia_base + pd.Timedelta(seconds=int(segundos))


def _formato_usuario_ruidoso(usuario: str) -> str:
    """Replicates the inconsistent format that came from the source system."""
    variante = rng.integers(0, 4)
    if variante == 0:
        return usuario.upper()
    if variante == 1:
        return f" {usuario} "
    if variante == 2:
        return usuario.replace(".", "_")
    return usuario


def generar_pedidos(vendedores: pd.DataFrame) -> pd.DataFrame:
    clientes = [f"CLI-{i:04d}" for i in range(1, N_CLIENTES + 1)]
    usuarios_validos = vendedores["usuario"].tolist()

    filas = []
    pedido_id = 1

    for offset in range(DIAS_HISTORIA):
        dia = FECHA_INICIO + pd.Timedelta(days=offset)
        # entering the pool: between 10 and 30 orders per day, with some
        # end-of-month variability (more orders blocked by credit limit
        # when billing is higher)
        media_dia = 20 + (6 if dia.day >= 25 else 0)
        n_pedidos_dia = max(0, int(rng.normal(media_dia, 5)))

        for _ in range(n_pedidos_dia):
            creado_en = _fecha_aleatoria(dia)

            # block reason: non-equiprobable
            motivo_rand = rng.random()
            if motivo_rand < 0.45:
                bsap, bvs, belx = 0, 0, 1          # exceeded limit
            elif motivo_rand < 0.70:
                bsap, bvs, belx = 0, 1, 0          # past-due balance
            elif motivo_rand < 0.85:
                bsap, bvs, belx = 1, 0, 0          # SAP block
            else:
                bsap, bvs, belx = 0, 0, 0          # other

            valor_pedido = round(float(rng.lognormal(mean=8.5, sigma=0.9)), 2)

            # resolution: released / canceled / still in pool
            resolucion = rng.random()
            liberado_fecha = pd.NaT
            cancelado_fecha = pd.NaT
            usuario_libero = ""
            estatus = 0  # blocked, unresolved

            # orders from the last 2 days of the dataset get a lower
            # probability of already being resolved (not enough time has
            # passed yet), just like it would happen in the real system
            dias_desde_creacion = (FECHA_FIN - creado_en).days
            prob_resuelto = min(0.95, 0.35 + dias_desde_creacion * 0.05)

            if resolucion < prob_resuelto * 0.75:
                # released: most quickly (minutes/hours), long tail
                minutos = int(rng.exponential(scale=180))
                minutos = min(minutos, dias_desde_creacion and 4000 or 4000)
                liberado_fecha = creado_en + pd.Timedelta(minutes=minutos)
                usuario_base = rng.choice(usuarios_validos)
                usuario_libero = _formato_usuario_ruidoso(usuario_base)
                estatus = 4 if rng.random() < 0.1 else 1
            elif resolucion < prob_resuelto:
                # canceled: longer times on average
                minutos = int(rng.exponential(scale=600))
                cancelado_fecha = creado_en + pd.Timedelta(minutes=minutos)
                estatus = 2
            else:
                # still in the pool unresolved at the dataset's cutoff
                estatus = 3 if rng.random() < 0.3 else 0

            filas.append(
                {
                    "pedido": f"PED-{pedido_id:06d}",
                    "cliente": rng.choice(clientes),
                    "valor_pedido": valor_pedido,
                    "bsap": bsap,
                    "bvs": bvs,
                    "belx": belx,
                    "estatus": estatus,
                    "creado_en": creado_en,
                    "liberado_fecha": liberado_fecha,
                    "cancelado_fecha": cancelado_fecha,
                    "usuario_libero": usuario_libero,
                }
            )
            pedido_id += 1

    df = pd.DataFrame(filas)

    # known quality issue: during the first 2 weeks, before capture
    # stabilized, some orders ended up with an out-of-catalog status code
    # (99). Silver fixes it with a business rule instead of discarding
    # those rows.
    ventana_mala = df["creado_en"] < (FECHA_INICIO + pd.Timedelta(days=14))
    idx_mal_capturados = df[ventana_mala].sample(frac=0.15, random_state=SEED).index
    df.loc[idx_mal_capturados, "estatus"] = 99

    return df


def main() -> None:
    estatus_pool = generar_estatus_pool()
    vendedores = generar_vendedores()
    pedidos = generar_pedidos(vendedores)

    estatus_pool.to_csv("data/bronze/estatus_pool.csv", index=False)
    vendedores.to_csv("data/bronze/vendedores.csv", index=False)
    pedidos.to_csv("data/bronze/pedidos_pool_clientes.csv", index=False)

    print(f"pedidos_pool_clientes: {len(pedidos):,} rows")
    print(f"  released:  {(pedidos['liberado_fecha'].notna()).sum():,}")
    print(f"  canceled: {(pedidos['cancelado_fecha'].notna()).sum():,}")
    print(f"  in pool:    {(pedidos['liberado_fecha'].isna() & pedidos['cancelado_fecha'].isna()).sum():,}")
    print(f"  out-of-catalog status (99): {(pedidos['estatus'] == 99).sum():,}")
    print("estatus_pool:", len(estatus_pool), "rows")
    print("vendedores:", len(vendedores), "rows")


if __name__ == "__main__":
    main()
