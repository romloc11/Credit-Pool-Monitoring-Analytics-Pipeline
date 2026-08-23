CREATE OR ALTER PROCEDURE dbo.sp_load_pool_credito
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        BEGIN TRAN;

        TRUNCATE TABLE dbo.pool_credito;

        INSERT INTO dbo.pool_credito
        SELECT *
        FROM dbo.vw_pool_credito;

        COMMIT;
    END TRY
    BEGIN CATCH
        ROLLBACK;

        THROW;
    END CATCH
END;
