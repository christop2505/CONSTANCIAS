import {createPool} from 'mysql2/promise'
import { DB_HOST,DB_PASSWORD,DB_USER,DN_NAME,DN_PORT } from './config.js'
export const pool = createPool({
    user: DB_USER,
    password:DB_PASSWORD,
    host: DB_HOST,
    port:DN_PORT,
    database:DN_NAME
})

