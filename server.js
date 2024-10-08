import express from 'express';
import startServer from './services/boot';
import injectRoutes from './routes';

const server = express();

server.use(express.json({ limit: '200mb' }));
injectRoutes(server);
startServer(server);

export default server;
