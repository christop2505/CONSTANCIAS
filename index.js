console.clear();

import express from 'express';
import { pool } from './db.js';
import { PORT } from './config.js';

const expressApp = express();
expressApp.use(express.json()); // Middleware para parsear JSON

expressApp.post('/cuenta', (req, res) => {
    console.log(req.query);
    res.send();
});

expressApp.post('/registrar-orden', async (req, res) => {
    const { Id_usuario, detalle, proveedor, tipo, numero_orden } = req.body;
    
    if (!Id_usuario || !detalle || !proveedor || !tipo || !numero_orden) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        const [result] = await pool.query(
            'CALL RegistrarOrden(?, ?, ?, ?, ?)',
            [Id_usuario, detalle, proveedor, tipo, numero_orden]
        );
        res.json({ message: 'Orden registrada exitosamente', result });
    } catch (error) {
        console.error('Error al registrar la orden:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

expressApp.get('/ping', async (req, res) => {
    try {
        const [result] = await pool.query('SELECT "hello world" AS result');
        console.log(result);
        res.json(result[0]);
    } catch (error) {
        console.error('Error en ping:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

expressApp.get('/', (req, res) => {
    res.send('Welcome to the server');
});

expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});