# 📊 Credit Pool – Data Pipeline & Dashboard

## 🚀 Project Overview
This project delivers an end-to-end data solution to monitor and analyze the **credit pool of customer orders**, enabling visibility into blocked, released, and canceled orders.

The pipeline:
- Extracts data from a transactional system (MySQL via Linked Server)
- Transforms data using business rules
- Loads it into SQL Server
- Feeds a Power BI dashboard with automatic refresh

---

## 🏗️ Architecture
MariaDB (CiosaCOM)
        │
        ▼
OPENQUERY (Linked Server)
        │
        ▼
SQL Server (View: vw_pool_credito)
        │
        ▼
Tabla destino: pool_credito
        │
        ▼
SQL Job (Automatización)
        │
        ▼
Power BI Dashboard (Visualización)


---

## ⚙️ ETL Process

### 1. Extraction
Data is extracted using `OPENQUERY` from a Linked Server (`CiosaCOM`) querying:

- `pedidos_pool_clientes`

---

### 2. Transformation
Business rules are applied in the SQL view `vw_pool_credito`.

#### 🔹 Blocking Reason Classification
- SAP Block
- Overdue Balance
- Credit Limit Exceeded
- Other

#### 🔹 Status Standardization
- `0 → Retained`
- Other values mapped from `estatus_pool`

#### 🔹 Calculated Indicators
- `indicador_liberado` (released)
- `indicador_cancelado` (canceled)
- `indicador_en_pool` (still in pool)

#### 🔹 Time Metrics
- Minutes to release
- Minutes to cancellation

#### 🔹 Data Cleaning
- User names normalized (lowercase)
- Null handling (`Sistema` as default)

---

### 3. Load
Data is loaded into:
dbo.pool_credito


Process:
1. `TRUNCATE TABLE`
2. `INSERT INTO ... SELECT * FROM vw_pool_credito`

---

### 4. Automation
A SQL Server Agent Job is used to automate the pipeline:

---sql
EXEC sp_add_job @job_name = 'Load Pool Credito';

---

## 📊 Power BI Dashboard

The dashboard provides insights such as:

### 🔍 Key Metrics

Orders in pool

Released orders

Canceled orders

Average release time

Average cancellation time

### 📈 Analysis

Trends over time

Blocking reasons

Performance by user (who releases orders)

Pool aging (time in queue)

### 🔄 Auto Refresh

The dashboard connects directly to pool_credito and refreshes automatically based on a scheduled interval (to be defined).

---

## 📁 Project Structure
/sql
  ├── create_view.sql
  ├── create_table.sql
  ├── load_data.sql
  ├── job.sql

/powerbi
  ├── pool_credito_dashboard.pbix

/docs
  ├── data_model.png
  ├── process_flow.png

README.md

--- 

## 🧠 Technical Decisions

Used Linked Server + OPENQUERY for cross-system integration

Centralized transformations in SQL (view layer)

Implemented Full Load (TRUNCATE + INSERT) for simplicity

Layered architecture (view → table → BI)

Automated pipeline using SQL Server Agent

---

## 🛠️ Tech Stack

SQL Server

MySQL

Linked Server (OPENQUERY)

Power BI

SQL Server Agent
