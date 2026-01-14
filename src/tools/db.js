import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';

const { Pool } = pg;

// Helper to manage connection persistence on the agent
async function getDbConnection(agent) {
    if (agent.dbConnection) {
        return agent.dbConnection;
    }
    throw new Error("No active database connection. Use db_connect first.");
}

export const db_tools = {
    db_connect: async ({ type, host, port, user, password, database, filename }, { agent }) => {
        try {
            // Close existing connection if any
            if (agent.dbConnection) {
                try {
                    await agent.dbConnection.close();
                } catch (e) {
                    console.error("Error closing previous connection:", e);
                }
                agent.dbConnection = null;
            }

            console.log(`Connecting to ${type} database...`);

            let connection;
            if (type === 'sqlite') {
                if (!filename) throw new Error("filename is required for sqlite");
                const db = await open({
                    filename,
                    driver: sqlite3.Database
                });
                
                // Add wrapper methods to unify interface
                connection = {
                    query: async (sql, params) => {
                        const lowerSql = sql.trim().toLowerCase();
                        const method = (lowerSql.startsWith('select') || lowerSql.startsWith('pragma')) ? 'all' : 'run';
                        return await db[method](sql, params);
                    },
                    close: async () => await db.close(),
                    type: 'sqlite',
                    native: db
                };

            } else if (type === 'mysql') {
                const conn = await mysql.createConnection({
                    host, port: port || 3306, user, password, database
                });
                
                // Wrapper
                connection = {
                    query: async (sql, params) => {
                        const [rows] = await conn.execute(sql, params);
                        return rows;
                    },
                    close: async () => await conn.end(),
                    type: 'mysql',
                    native: conn
                };

            } else if (type === 'postgres') {
                const pool = new Pool({
                    host, port: port || 5432, user, password, database
                });
                
                // Verify connection
                const client = await pool.connect();
                client.release();

                connection = {
                    query: async (sql, params) => {
                        const res = await pool.query(sql, params);
                        return res.rows;
                    },
                    close: async () => await pool.end(),
                    type: 'postgres',
                    native: pool
                };
            } else {
                throw new Error(`Unsupported database type: ${type}. Supported: sqlite, mysql, postgres`);
            }

            agent.dbConnection = connection;
            return `Successfully connected to ${type} database.`;

        } catch (e) {
            return `Connection failed: ${e.message}`;
        }
    },

    db_query: async ({ sql, params = [] }, { agent }) => {
        try {
            const conn = await getDbConnection(agent);
            console.log(`Executing query: ${sql}`);
            const results = await conn.query(sql, params);
            
            // Format results for display
            if (Array.isArray(results)) {
                if (results.length === 0) return "Query executed successfully. No rows returned.";
                return JSON.stringify(results.slice(0, 50), null, 2) + 
                       (results.length > 50 ? `\n... (${results.length - 50} more rows)` : '');
            }
            // For non-select queries in SQLite/MySQL that return object
            return JSON.stringify(results, null, 2);
        } catch (e) {
            return `Query error: ${e.message}`;
        }
    },

    db_list_tables: async ({}, { agent }) => {
        try {
            const conn = await getDbConnection(agent);
            let sql;
            if (conn.type === 'sqlite') {
                sql = "SELECT name FROM sqlite_master WHERE type='table';";
            } else if (conn.type === 'mysql') {
                sql = "SHOW TABLES;";
            } else if (conn.type === 'postgres') {
                sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';";
            }
            
            const rows = await conn.query(sql);
            return JSON.stringify(rows, null, 2);
        } catch (e) {
            return `Error listing tables: ${e.message}`;
        }
    },
    
    db_schema: async ({ table }, { agent }) => {
         try {
            const conn = await getDbConnection(agent);
            let sql;
            if (conn.type === 'sqlite') {
                sql = `PRAGMA table_info(${table});`;
            } else if (conn.type === 'mysql') {
                sql = `DESCRIBE ${table};`;
            } else if (conn.type === 'postgres') {
                sql = `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${table}';`;
            }
            
            const rows = await conn.query(sql);
            return JSON.stringify(rows, null, 2);
        } catch (e) {
            return `Error getting schema for ${table}: ${e.message}`;
        }
    }
};
