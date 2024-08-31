/* eslint-disable import/no-named-as-default */
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export default class AppController {
  static getStatus(_, res) {
    res.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    });
  }

  static getStats(_, res) {
    // prettier-ignore
    Promise.all([dbClient.nbUsers(), dbClient.nbFiles()])
      .then(([users, files]) => {
        res.status(200).json({ users, files });
      });
  }
}
