import mongodb from 'mongodb';
// eslint-disable-next-line no-unused-vars
import Collection from 'mongodb/lib/collection';
import loadEnv from './envConfig';

class DBClient {
  // Creates a new instance of DBClient.
  constructor() {
    loadEnv();
    const HOST = process.env.DB_HOST || 'localhost';
    const PORT = process.env.DB_PORT || 27017;
    const DB = process.env.DB_DATABASE || 'files_manager';
    const DB_URL = `mongodb://${HOST}:${PORT}/${DB}`;

    this.client = new mongodb.MongoClient(DB_URL, { useUnifiedTopology: true });
    this.client.connect();
  }

  // Checks if the mongodb connection is active
  isAlive() {
    return this.client.isConnected();
  }

  // Returns the number of users in the database.
  async nbUsers() {
    return this.client.db().collection('users').countDocuments();
  }

  // Returns the number of files in the database
  async nbFiles() {
    return this.client.db().collection('files').countDocuments();
  }

  // Returns a reference to `users`.
  async findUsers() {
    return this.client.db().collection('users');
  }

  // Returns a reference to `files`.
  async findFiles() {
    return this.client.db().collection('files');
  }
}

const dbClient = new DBClient();
export default dbClient;
