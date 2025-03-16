"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const database_config_1 = require("./database.config");
/**
 * Service to manage database operations with TypeORM
 */
class DatabaseService {
    constructor() {
        this.dataSource = null;
    }
    /**
     * Get singleton instance of DatabaseService
     */
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }
    /**
     * Initialize the database connection
     * @param userDataPath Path to store the database
     */
    async initialize(userDataPath) {
        if (!this.dataSource) {
            this.dataSource = await (0, database_config_1.createDataSource)(userDataPath);
            console.log('Database connection initialized');
        }
        return this.dataSource;
    }
    /**
     * Get the DataSource instance
     */
    getDataSource() {
        if (!this.dataSource) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.dataSource;
    }
    /**
     * Close the database connection
     */
    async close() {
        if (this.dataSource) {
            await this.dataSource.destroy();
            this.dataSource = null;
            console.log('Database connection closed');
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.service.js.map