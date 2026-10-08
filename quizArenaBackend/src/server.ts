import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './database/prisma'

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

async function start() {
  try{
    await prisma.$queryRaw`SELECT 1`;
    console.log('Conexão com o PostgreSQL estabelecida com sucesso!');

    app.get('/', (req, res) => {
      res.status(200).json({ status: 'ok', message: 'Backend rodando com sucesso!' });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
    });
  } catch(error) {
    console.error('Falha ao conectar no banco de dados: ', error);
    process.exit(1);
  }
  
}

start();