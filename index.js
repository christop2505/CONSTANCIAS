console.clear();

import express from 'express';
import {pool} from './db.js';
import {PORT} from './config.js';

const expressApp=express();


expressApp.post('/cuenta',(req,res)=>
{
    console.log(req.query);
    res.send();
})

expressApp.get('/ping',async (req,res)=>{
    const [result]=await pool.query(`select "hello world" as result`)
    console.log(result)
    res.json(result[0])
    
})
expressApp.get('/',(req,res)=>{
    res.send('welcome to server');
})

expressApp.listen(PORT)
console.log('server PORT')