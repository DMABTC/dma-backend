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

// Función para consultar precios (CoinGecko -> Fallback MEXC)
setInterval(async () => {
  try {
    // 1. Intentar obtener precios desde CoinGecko
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
    );
    
    if (response.data.bitcoin?.usd) {
      prices['BTCUSDT'] = response.data.bitcoin.usd;
    }
    if (response.data.ethereum?.usd) {
      prices['ETHUSDT'] = response.data.ethereum.usd;
    }
    console.log('✅ Precios actualizados desde CoinGecko:', prices);
  } catch (error) {
    // 2. Fallback: Consultar API pública de MEXC si CoinGecko no responde
    try {
      const responseMexc = await axios.get(
        'https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT'
      );
      const responseMexcEth = await axios.get(
        'https://api.mexc.com/api/v3/ticker/price?symbol=ETHUSDT'
      );

      if (responseMexc.data?.price) {
        prices['BTCUSDT'] = parseFloat(responseMexc.data.price);
      }
      if (responseMexcEth.data?.price) {
        prices['ETHUSDT'] = parseFloat(responseMexcEth.data.price);
      }
      console.log('✅ Precios actualizados desde MEXC:', prices);
    } catch (mexcError) {
      console.log('⚠️ Error al consultar precios en CoinGecko y MEXC');
    }
  }
}, 5000);

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
    console.log('🚀 Servidor de DMA CAPITAL corriendo en http://localhost:4000');
  } catch (err) {
    process.exit(1);
  }
};

start();