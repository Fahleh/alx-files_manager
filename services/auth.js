/* eslint-disable no-unused-vars */
import { Request, Response, NextFunction } from 'express';
import { getUserFromTokenHeader, getUserFromAuthHeader } from '../utils/auth';

// Applies authentication to a route.
export const basicAuthenticate = async (req, res, next) => {
  const user = await getUserFromAuthHeader(req);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
};

// Applies X-Token authentication to a route
export const xTokenAuthenticate = async (req, res, next) => {
  const user = await getUserFromTokenHeader(req);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
};
