import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import axios from 'axios';

const server = Fastify({ logger: true });

// Registrar soporte de CORS y WebSockets
server.register(fastifyCors, { origin: '*' });
server.register(fastifyWebsocket);

// Precios iniciales por defecto
let prices: Record<string, number> = {
  BTCUSDT: 68500.00,
  ETHUSDT: 3500.00,
};

// Consultar API pública de Bitget V2 cada 3 segundos
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

    console.log('✅ Precios en vivo de Bitget:', prices);
  } catch (error) {
    console.log('⚠️ Error al obtener precios desde Bitget');
  }
}, 3000);

// Conexión en vivo por WebSocket
server.register(async (fastify) => {
  fastify.get('/ws/portfolio', { websocket: true }, (connection) => {
    const ws = (connection as any).socket || connection;

    console.log('🟢 Cliente conectado a DMA CAPITAL Live Feed');

    const intervalId = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        
        const btcValue = 1.5 * (prices['BTCUSDT'] || 0);
        const ethValue = 10.0 * (prices['ETHUSDT'] || 0);
        const netWorth = btcValue + ethValue;

        const payload = {
          event: 'PORTFOLIO_TICK',
          data: {
            netWorthUSD: netWorth.toFixed(2),
            prices: prices,
            timestamp: Date.now()
          }
        };

        ws.send(JSON.stringify(payload));
      }
    }, 1000);

    ws.on('close', () => {
      console.log('🔴 Cliente desconectado');
      clearInterval(intervalId);
    });
  });
});

// Iniciar el servidor
const start = async () => {
  try {
    await server.listen({ port: 4000, host: '0.0.0.0' });
    console.log('🚀 Servidor de DMA CAPITAL corriendo en puerto 4000');
  } catch (err) {
    process.exit(1);
  }
};

start();