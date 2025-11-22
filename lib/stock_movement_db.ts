import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";


let HOST: string | undefined;
let DATABASE: string | undefined;
let USER: string | undefined;
let PASSWORD: string | undefined;

let pool:Pool | undefined = undefined; 

if (process.env.ENVIRONMENT == "development") {
  HOST = process.env.DEV_MYSQL_HOST;
  DATABASE = process.env.DEV_MYSQL_DATABASE;
  USER = process.env.DEV_MYSQL_USER;
  PASSWORD = process.env.DEV_MYSQL_PASSWORD;

  pool = mysql.createPool({
    host: HOST,
    database: DATABASE,
    user: USER,
    password: PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}
else{
  HOST = process.env.PROD_MYSQL_HOST;
  DATABASE = process.env.PROD_MYSQL_DATABASE;
  USER = process.env.PROD_MYSQL_USER;
  PASSWORD = process.env.PROD_MYSQL_PASSWORD;

  pool = mysql.createPool({
    host: HOST,
    database: DATABASE,
    user: USER,
    password: PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: { rejectUnauthorized: true },
    queueLimit: 0,
  });
  
}

// 1. Check for env variables
// if (HOST ||DATABASE || USER || PASSWORD) {
//   throw new Error("Missing one or more required MySQL environment variables (HOST, DATABASE,_USER, or PASSWORD).");
// }

console.log("Database connection pool created successfully.");

// 3. Export the pool so other files can use it
export default pool;
/**
 * Executes a parameterized SQL query using a connection pool.
 * ...
 */
export async function query<T extends RowDataPacket[] | ResultSetHeader>({query,values,}: {query: string;values?: any;}): Promise<T | undefined> {
  
  let connection:PoolConnection | undefined;
  if (pool) {
    connection = await pool.getConnection();
    console.log("Pool connection established")
  }

  else{
    throw new Error("Failed to establish pool connection")
  }

  try {

    if (connection) {
      // Execute the query on the borrowed connection
      const [results] = await connection.query(query, values);
      return results as T;
    }
    

  } catch (error) {
    console.error("Error executing query:", {
        // @ts-ignore
        sql: error.sql,
        // @ts-ignore
        sqlMessage: error.sqlMessage,
    });
    throw error as Error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}