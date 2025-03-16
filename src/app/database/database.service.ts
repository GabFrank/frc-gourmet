import { DataSource } from 'typeorm';
import { createDataSource } from './database.config';

/**
 * Service to manage database operations with TypeORM
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private dataSource: DataSource | null = null;

  private constructor() {}

  /**
   * Get singleton instance of DatabaseService
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize the database connection
   * @param userDataPath Path to store the database
   */
  public async initialize(userDataPath: string): Promise<DataSource> {
    if (!this.dataSource) {
      this.dataSource = await createDataSource(userDataPath);
      console.log('Database connection initialized');
    }
    return this.dataSource;
  }

  /**
   * Get the DataSource instance
   */
  public getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    if (this.dataSource) {
      await this.dataSource.destroy();
      this.dataSource = null;
      console.log('Database connection closed');
    }
  }
} 