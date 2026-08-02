import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Limpiar posiciones anteriores si existen
  await prisma.position.deleteMany({});
  await prisma.account.deleteMany({});

  // 1. Crear Cuenta Principal
  const account = await prisma.account.create({
    data: {
      name: 'DMA Portfolio #1',
      address: '0x71C...9A23',
    },
  });

  // 2. Crear Posición LP Concentrada (ETH/USDC)
  await prisma.position.create({
    data: {
      accountId: account.id,
      type: 'LP',
      symbol: 'ETH/USDC',
      rangeLower: 3100.0,  // Rango Mínimo
      rangeUpper: 3800.0,  // Rango Máximo
      collateralUSD: 5000,
    },
  });

  // 3. Crear Posición de Futuros Apalancada (BTCUSDT)
  await prisma.position.create({
    data: {
      accountId: account.id,
      type: 'FUTURE',
      symbol: 'BTCUSDT',
      leverage: 10,
      entryPrice: 65000.0,
      size: 0.5,           // 0.5 BTC
      borrowedUSD: 32500,  // Deuda tomada
      collateralUSD: 3250, // Colateral inicial (10x)
      liquidationPrice: 59000.0, // Nivel crítico
    },
  });

  console.log('✅ Base de datos poblada con posiciones iniciales.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });