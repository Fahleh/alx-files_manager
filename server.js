import express from 'express';
import startServer from './utils/startSever';
import createRoutes from './routes';

const server = express();

server.use(express.json({ limit: '200mb' }));
createRoutes(server);
startServer(server);

export default server;
