console.clear();

import express from 'express';
import nodemailer from 'nodemailer';
import { pool } from './db.js';
import { PORT, EMAIL_USER, EMAIL_PASS, SERVER_URL } from './config.js';

const expressApp = express();
expressApp.use(express.json()); // Middleware para parsear JSON

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', // Puedes cambiarlo si usas otro servicio
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Función para enviar correo
const enviarCorreo = async (email, numero_constancia,numero_orden) => {
    const approveLink = `${SERVER_URL}/aprobar-orden?numero_constancia=${numero_constancia}`;
    const rejectLink = `${SERVER_URL}/rechazar-orden?numero_constancia=${numero_constancia}`;

    const mailOptions = {
        from: EMAIL_USER,
        to: email,
        subject: 'Solicitud de Aprobación de Acta de conformidad:'+ `${numero_orden}`,
        html: `
            <p>Se ha registrado una nueva orden con el número <strong>${numero_constancia}</strong>.</p>
            <p>Por favor, elige una opción:</p>
            <ul>
                <li><a href="${approveLink}">Aprobar Orden</a></li>
                <li><a href="${rejectLink}">Rechazar Orden</a></li>
            </ul>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Correo enviado con éxito');
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};

expressApp.post('/registrar-orden', async (req, res) => {
    const { Id_usuario, detalle, proveedor, tipo, Norden, email } = req.body;
    
    if (!Id_usuario || !detalle || !proveedor || !tipo || !Norden || !email) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        // Registrar la orden en la base de datos
        const [result] = await pool.query(
            'CALL RegistrarOrden(?, ?, ?, ?, ?)',
            [Id_usuario, detalle, proveedor, tipo, Norden]
        );

        // Buscar el último numero_constancia generado para esta orden
        const [constanciaResult] = await pool.query(
            'SELECT NContancia FROM Acta WHERE Norden = ? ORDER BY NContancia DESC LIMIT 1',
            [Norden]
        );

        if (constanciaResult.length === 0) {
            return res.status(500).json({ error: 'No se encontró la constancia para esta orden' });
        }

        const NContancia = constanciaResult[0].NContancia;

        // Enviar correo con enlaces de aprobación/rechazo usando el numero_constancia
        await enviarCorreo(email, NContancia,Norden);

        res.json({ message: 'Orden registrada exitosamente y correo enviado', NContancia });
    } catch (error) {
        console.error('Error al registrar la orden:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});


// Aprobar orden y actualizar Acta
expressApp.get('/aprobar-orden', async (req, res) => {
    const { numero_constancia } = req.query;

    if (!numero_constancia) {
        return res.status(400).json({ error: 'Número de orden requerido' });
    }

    try {
        

        // Actualizar la tabla Acta, estableciendo estado = 1 (aprobado)
        await pool.query('UPDATE Acta SET estado = 1 WHERE NContancia = ?', [numero_constancia]);

        res.send('Orden aprobada con éxito y estado actualizado en Acta');
    } catch (error) {
        console.error('Error al aprobar la orden:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// Rechazar orden y mantener estado en Acta como 0
expressApp.get('/rechazar-orden', async (req, res) => {
    const { numero_constancia} = req.query;

    if (!numero_constancia) {
        return res.status(400).json({ error: 'Número de orden requerido' });
    }

    try {

        // No cambia el estado en Acta porque por defecto es 0 (rechazado)
        await pool.query('UPDATE Acta SET estado = 0 WHERE NContancia = ?', [numero_constancia]);

        res.send('Orden rechazada con éxito y estado actualizado en Acta');
    } catch (error) {
        console.error('Error al rechazar la orden:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

expressApp.get('/', (req, res) => {
    res.send('Welcome to the server');
});

expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
