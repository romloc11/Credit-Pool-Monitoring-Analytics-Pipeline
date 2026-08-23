# Architecture

This project follows a simplified modern data pipeline:

MariaDB → SQL Server → Power BI

## Components

### Source
Operational database (MariaDB)

### Integration
Linked Server connection using OPENQUERY

### Transformation
SQL View:
- Business logic
- KPI generation
- Data standardization

### Storage
Analytical table (pool_credito)

### Visualization
Power BI dashboard
