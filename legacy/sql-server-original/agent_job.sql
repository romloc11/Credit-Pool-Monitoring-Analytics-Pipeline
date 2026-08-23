-- =============================================
-- Job: Load Credit Pool
-- Description: Executes stored procedure to refresh analytics table
--> Note: Object names and database names have been generalized to avoid exposing sensitive business information.
-- =============================================

EXEC sp_add_job 
    @job_name = 'Load Credit Pool';

EXEC sp_add_jobstep
    @job_name = 'Load Credit Pool',
    @step_name = 'Execute SP',
    @subsystem = 'TSQL',
    @database_name = 'AnalyticsDB',
    @command = 'EXEC dbo.sp_load_credit_pool;';
