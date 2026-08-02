import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const server = Fastify({ logger: true });

// Configuración del cliente Prisma con el adaptador Pg para Prisma 7
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

server.register(fastifyCors, { origin: '*' });
server.register(fastifyWebsocket);

let prices: Record<string, number> = {
  BTCUSDT: 68500.00,
  ETHUSDT: 3500.00,
};

// Polling de precios desde Bitget
setInterval(async () => {
  try {
    const btcRes = await axios.get('https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT');
    const ethRes = await axios.get('https://api.bitget.com/api/v2/spot/market/tickers?symbol=ETHUSDT');

    if (btcRes.data?.data?.[0]?.lastPr) {
      prices['BTCUSDT'] = parseFloat(btcRes.data.data[0].lastPr);
    }
    if (ethRes.data?.data?.[0]?.lastPr) {
      prices['ETHUSDT'] = parseFloat(ethRes.data.data[0].lastPr);
    }
  } catch (error) {
    console.log('⚠️ Error al consultar Bitget API');
  }
}, 3000);

// WebSocket Stream con Métricas DeFi y Futuros
server.register(async (fastify) => {
  fastify.get('/ws/portfolio', { websocket: true }, (connection) => {
    const ws = (connection as any).socket || connection;

    console.log('🟢 Cliente conectado');

    const intervalId = setInterval(async () => {
      if (ws.readyState === ws.OPEN) {
        try {
          // Consultar posiciones reales desde Supabase
          const positions = await prisma.position.findMany();
          
          const currentBtc = prices['BTCUSDT'] || 68500;
          const currentEth = prices['ETHUSDT'] || 3500;

          // 1. Procesar Posición LP
          const lp = positions.find(p => p.type === 'LP');
          const isLpInRange = lp && currentEth >= (lp.rangeLower || 0) && currentEth <= (lp.rangeUpper || 0);

          // 2. Procesar Posición Futuros
          const future = positions.find(p => p.type === 'FUTURE');
          let uPnL = 0;
          let healthFactor = 2.0;

          if (future && future.entryPrice && future.size) {
            uPnL = (currentBtc - future.entryPrice) * future.size;

            if (future.liquidationPrice) {
              const riskDistance = (currentBtc - future.liquidationPrice) / future.liquidationPrice;
              healthFactor = Math.max(0.5, parseFloat((1 + riskDistance).toFixed(2)));
            }
          }

          const payload = {
            event: 'PORTFOLIO_TICK',
            data: {
              prices,
              lpStatus: {
                symbol: lp?.symbol || 'ETH/USDC',
                inRange: isLpInRange,
                lower: lp?.rangeLower || 0,
                upper: lp?.rangeUpper || 0
              },
              futuresStatus: {
                symbol: future?.symbol || 'BTCUSDT',
                leverage: future?.leverage || 1,
                entryPrice: future?.entryPrice || 0,
                uPnL: uPnL.toFixed(2),
                liquidationPrice: future?.liquidationPrice || 0,
                healthFactor: healthFactor
              },
              timestamp: Date.now()
            }
          };

          ws.send(JSON.stringify(payload));
        } catch (err) {
          console.error('Error procesando tick:', err);
        }
      }
    }, 1000);

    ws.on('close', () => {
      clearInterval(intervalId);
    });
  });
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Servidor corriendo en puerto ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();