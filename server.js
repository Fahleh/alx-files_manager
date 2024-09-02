import express from 'express';
import startServer from './libs/boot';
import injectRoutes from './routes';
import injectMiddlewares from './libs/middlewares';

const server = express();

// injectMiddlewares(server);
server.use(express.json({ limit: '200mb' }));
injectRoutes(server);
startServer(server);

export default server;
