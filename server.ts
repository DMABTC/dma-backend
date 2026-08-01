import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import axios from 'axios';

const server = Fastify({ logger: true });

// Registrar soporte de CORS y WebSockets
server.register(fastifyCors, { origin: '*' });
server.register(fastifyWebsocket);

// Precios simulados/iniciales
let prices: Record<string, number> = {
  BTCUSDT: 68500.00,
  ETHUSDT: 3500.00,
};

// Función para buscar precios reales de Binance cada 3 segundos
setInterval(async () => {
  try {
    const response = await axios.get(
      'https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT"]'
    );
    for (const item of response.data) {
      prices[item.symbol] = parseFloat(item.price);
    }
  } catch (error) {
    console.log('Error al obtener precios en vivo');
  }
}, 3000);

// Conexión en vivo por WebSocket
server.register(async (fastify) => {
  fastify.get('/ws/portfolio', { websocket: true }, (connection) => {
    // Manejo de compatibilidad para extraer el socket de la conexión
    const ws = (connection as any).socket || connection;

    console.log('🟢 Cliente conectado a DMA CAPITAL Live Feed');

    // Enviar datos en tiempo real cada 1 segundo
    const intervalId = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        
        // Simulación de cálculo del portafolio del usuario
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