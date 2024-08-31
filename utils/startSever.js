import loadEnv from './envConfig';

// Starts up the server.
const startServer = (api) => {
  loadEnv();

  const PORT = process.env.PORT || 5000;
  const ENV = process.env.npm_lifecycle_event || 'dev';

  api.listen(PORT, () => {
    console.log(`[${ENV}] Server has started. Listening on port:${PORT}`);
  });
};

export default startServer;
