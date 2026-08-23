"""
Genera datos de origen sinteticos que simulan el sistema transaccional
(pedidos_pool_clientes, estatus_pool, vendedores) del que originalmente
se extraia via OPENQUERY/Linked Server.

El dataset real de la empresa no puede publicarse. Este generador crea
un dataset con la misma estructura y las mismas inconsistencias que
tenia el dato real (usuarios con formato libre, estatus fuera de
catalogo en un rango de fechas, pedidos aun sin resolver), para que
las capas silver/gold tengan trabajo real de limpieza que hacer y no
sean solo una copia del origen.

Semilla fija -> mismo dataset en cada corrida (reproducible).
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
# Catalogos
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
    # nota: estatus = 0 no vive en el catalogo -> el sistema origen lo usa
    # como bandera especial de "recien retenido, aun sin tocar"


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
# Pedidos
# ---------------------------------------------------------------------------

def _fecha_aleatoria(dia_base: pd.Timestamp) -> pd.Timestamp:
    segundos = rng.integers(0, 24 * 3600)
    return dia_base + pd.Timedelta(seconds=int(segundos))


def _formato_usuario_ruidoso(usuario: str) -> str:
    """Replica el formato inconsistente que llegaba del sistema origen."""
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
        # entrada al pool: entre 10 y 30 pedidos por dia, con algo de
        # variabilidad de fin de mes (mas pedidos bloqueados por limite
        # de credito cuando se factura mas)
        media_dia = 20 + (6 if dia.day >= 25 else 0)
        n_pedidos_dia = max(0, int(rng.normal(media_dia, 5)))

        for _ in range(n_pedidos_dia):
            creado_en = _fecha_aleatoria(dia)

            # motivo de bloqueo: no equiprobable
            motivo_rand = rng.random()
            if motivo_rand < 0.45:
                bsap, bvs, belx = 0, 0, 1          # limite excedido
            elif motivo_rand < 0.70:
                bsap, bvs, belx = 0, 1, 0          # saldo vencido
            elif motivo_rand < 0.85:
                bsap, bvs, belx = 1, 0, 0          # bloqueo SAP
            else:
                bsap, bvs, belx = 0, 0, 0          # otro

            valor_pedido = round(float(rng.lognormal(mean=8.5, sigma=0.9)), 2)

            # resolucion: liberado / cancelado / sigue en pool
            resolucion = rng.random()
            liberado_fecha = pd.NaT
            cancelado_fecha = pd.NaT
            usuario_libero = ""
            estatus = 0  # retenido, sin resolver

            # a los pedidos de los ultimos 2 dias del dataset les damos
            # menos probabilidad de haberse resuelto ya (todavia no da
            # tiempo), igual que pasaria en el sistema real
            dias_desde_creacion = (FECHA_FIN - creado_en).days
            prob_resuelto = min(0.95, 0.35 + dias_desde_creacion * 0.05)

            if resolucion < prob_resuelto * 0.75:
                # se libera: la mayoria rapido (minutos/horas), cola larga
                minutos = int(rng.exponential(scale=180))
                minutos = min(minutos, dias_desde_creacion and 4000 or 4000)
                liberado_fecha = creado_en + pd.Timedelta(minutes=minutos)
                usuario_base = rng.choice(usuarios_validos)
                usuario_libero = _formato_usuario_ruidoso(usuario_base)
                estatus = 4 if rng.random() < 0.1 else 1
            elif resolucion < prob_resuelto:
                # se cancela: tiempos mas largos en promedio
                minutos = int(rng.exponential(scale=600))
                cancelado_fecha = creado_en + pd.Timedelta(minutes=minutos)
                estatus = 2
            else:
                # sigue en el pool sin resolver al cierre del dataset
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

    # problema de calidad conocido: durante las primeras 2 semanas, antes
    # de que se estabilizara la captura, una parte de los pedidos quedo
    # con un codigo de estatus fuera de catalogo (99). silver lo corrige
    # por regla de negocio en vez de descartar esas filas.
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

    print(f"pedidos_pool_clientes: {len(pedidos):,} filas")
    print(f"  liberados:  {(pedidos['liberado_fecha'].notna()).sum():,}")
    print(f"  cancelados: {(pedidos['cancelado_fecha'].notna()).sum():,}")
    print(f"  en pool:    {(pedidos['liberado_fecha'].isna() & pedidos['cancelado_fecha'].isna()).sum():,}")
    print(f"  estatus fuera de catalogo (99): {(pedidos['estatus'] == 99).sum():,}")
    print("estatus_pool:", len(estatus_pool), "filas")
    print("vendedores:", len(vendedores), "filas")


if __name__ == "__main__":
    main()
