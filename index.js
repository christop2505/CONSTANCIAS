console.clear();

import express from 'express';
import nodemailer from 'nodemailer';
import { pool } from './db.js';
import { PORT, EMAIL_USER, EMAIL_PASS, SERVER_URL } from './config.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';


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


const obtenerFirmaUsuario = async (idUsuario) => {
    const [usuario] = await pool.query('SELECT firma FROM usuario WHERE Id_usuario = ?', [idUsuario]);
    if (usuario.length > 0 && usuario[0].firma) {
        return `data:image/png;base64,${usuario[0].firma.toString('base64')}`;
    }
    return null;
};

const generarPDF = async (numeroOrden, proveedor, detalle, firma, Nombre_Completo) => {
    const fechaActual = new Date().toLocaleDateString();
    
    const htmlContent = `
    <html>
    <head><style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background-color: green; color: green; padding: 10px; text-align: left; }
        .header p { font-size: 12px; margin: 0; }
        .title { font-size: 18px; font-weight: bold; text-align: center; margin-top: 20px; }
        .content { margin-top: 30px; font-size: 16px; text-align: left; }
        .firma { margin-top: 50px; text-align: left; }
        .firma img { width: 200px; }
        .footer { position: fixed; bottom: 0; width: 100%; font-size: 12px; text-align: center; }
    </style></head>
    <body>
        <div class="header">
            <p><b>Parque Del Norte S.A.</b></p>
            <p>Atención al Cliente: 274841 - 240125</p>
            <p>C. Pascual Saco N° 270 Res. Lurín - Chiclayo</p>
            <p>Email: informes@parquedelnorte.com</p>
        </div>
        
        <div class="title">ACTA DE CONFORMIDAD</div>
        <p class="content">
            Conste por el presente documento que, en la fecha ${fechaActual}, 
            se está recibiendo el servicio correspondiente a la Orden de Servicio Nro. <b>${numeroOrden}</b>, 
            realizado por el proveedor:
        </p>
        <h2 style="text-align:center;">${proveedor}</h2>
        <p class="content">Mediante este documento se deja constancia que la empresa PARQUE DEL NORTE S.A. se encuentra conforme con el producto recibido:</p>
        A continuación, se detalla el producto de: 
        </p>
        <h3 style="text-align:center;">${detalle}</h3>
        <p class="content">
            Habiéndose culminado el presente trabajo en satisfacción del usuario y correspondiente a la Orden de Servicio Nro. ${numeroOrden}, se brinda la conformidad por parte de PARQUE DEL NORTE S.A., y se firma la presente. </p>
        <p class="content">Chiclayo, ${fechaActual}</p>

       <div class="firma">
            ${firma ? `<img src="${firma}" alt="Firma">` : '<p>_______________________________</p>'}
            <p>${Nombre_Completo}</p>
        </div>

        <div class="footer">Documento generado por sistema</div>
    </body>
    </html>`;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const pdfPath = path.join("./", `acta_${numeroOrden}.pdf`);
    await page.pdf({ path: pdfPath, format: 'A4' });
    await browser.close();
    return pdfPath;
};


const enviarCorreoConPDF = async (email, pdfPath, numeroOrden) => {
    const mailOptions = {
        from: EMAIL_USER,
        to: email,
        subject: `Acta de Conformidad - Orden ${numeroOrden}`,
        text: 'Adjunto encontrará el acta de conformidad generada.',
        attachments: [{ filename: `acta_${numeroOrden}.pdf`, path: pdfPath }]
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Correo con PDF enviado con éxito');
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};
expressApp.get('/aprobar-orden', async (req, res) => {
    const { numero_constancia } = req.query;
    if (!numero_constancia) {
        return res.status(400).json({ error: 'Número de constancia requerido' });
    }

    try {
        const [orden] = await pool.query('SELECT Id_orden FROM Acta WHERE NContancia = ?', [numero_constancia]);
        if (orden.length === 0) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const { Id_orden } = orden[0];
        const [orden_2] = await pool.query('SELECT * FROM orden WHERE ID = ?', [Id_orden]);
        if (orden.length === 0) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const [V_usuario] = await pool.query('SELECT Correo , Nombre_Completo FROM usuario WHERE Id_usuario = ?', [idUsuario]);
        if (orden.length === 0) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const { Correo,Nombre_Completo } = V_usuario[0];
        const { Norden, Proveedor, Detalle, Id_usuario } = orden_2[0];
        const firma = await obtenerFirmaUsuario(Id_usuario);
        await pool.query('UPDATE Acta SET estado = 1 WHERE NContancia = ?', [numero_constancia]);
        const pdfPath = await generarPDF(Norden, Proveedor, Detalle, firma,Nombre_Completo);
        await enviarCorreoConPDF(Correo, pdfPath, Norden);
        res.send('Orden aprobada y correo con acta enviado');
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
