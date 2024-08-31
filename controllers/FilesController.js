/* eslint-disable import/no-named-as-default */
/* eslint-disable no-unused-vars */
import { tmpdir } from 'os';
import { promisify } from 'util';
import Queue from 'bull/lib/queue';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile, stat, existsSync, realpath } from 'fs';
import { join as joinPath } from 'path';
import { Request, Response } from 'express';
import { contentType } from 'mime-types';
import mongoDBCore from 'mongodb/lib/core';
import dbClient from '../utils/db';
import { getUserFromTokenHeader } from '../utils/auth';

const VALID_TYPES = {
  folder: 'folder',
  file: 'file',
  image: 'image',
};
const FOLDER_ID = 0;
const DEFAULT_FOLDER = 'files_manager';
const makeDir = promisify(mkdir);
const writeFilePromise = promisify(writeFile);
const statPromise = promisify(stat);
const realPath = promisify(realpath);
// Max File Per Page
const MAX_FPP = 20;
const FILEQUEUE = new Queue('thumbnail generation');
const DEFAULT_ID = Buffer.alloc(24, '0').toString('utf-8');

// Checks if an ID is valid.
const isIDValid = (id) => {
  const len = 24;
  let i = 0;
  const ASCIIChars = [
    [48, 57],
    [97, 102],
    [65, 70],
  ];
  if (typeof id !== 'string' || id.length !== len) {
    return false;
  }
  while (i < len) {
    const char = id[i];
    const code = char.charCodeAt(0);

    if (!ASCIIChars.some((list) => code >= list[0] && code <= list[1])) {
      return false;
    }
    i += 1;
  }
  return true;
};

export default class FilesController {
  // Handles file upload.
  static async postUpload(req, res) {
    const { user } = req;
    const name = req.body ? req.body.name : null;
    const type = req.body ? req.body.type : null;
    const parentId =
      req.body && req.body.parentId ? req.body.parentId : FOLDER_ID;
    const isPublic = req.body && req.body.isPublic ? req.body.isPublic : false;
    const dataInBase64 = req.body && req.body.data ? req.body.data : '';

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type || !Object.values(VALID_TYPES).includes(type)) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!req.body.data && type !== VALID_TYPES.folder) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    if (parentId !== FOLDER_ID && parentId !== FOLDER_ID.toString()) {
      const file = await (
        await dbClient.filesCollection()
      ).findOne({
        _id: new mongoDBCore.BSON.ObjectId(
          isIDValid(parentId) ? parentId : DEFAULT_ID
        ),
      });

      if (!file) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (file.type !== VALID_TYPES.folder) {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }
    const userId = user._id.toString();
    const baseFolder =
      `${process.env.FOLDER_PATH || ''}`.trim().length > 0
        ? process.env.FOLDER_PATH.trim()
        : joinPath(tmpdir(), DEFAULT_FOLDER);

    const fileData = {
      userId: new mongoDBCore.BSON.ObjectId(userId),
      name,
      type,
      isPublic,
      parentId:
        parentId === FOLDER_ID || parentId === FOLDER_ID.toString()
          ? '0'
          : new mongoDBCore.BSON.ObjectId(parentId),
    };

    await makeDir(baseFolder, { recursive: true });
    if (type !== VALID_TYPES.folder) {
      const localPath = joinPath(baseFolder, uuidv4());
      await writeFilePromise(localPath, Buffer.from(dataInBase64, 'base64'));
      fileData.localPath = localPath;
    }

    const filesList = await (
      await dbClient.filesCollection()
    ).insertOne(fileData);

    const fileId = filesList.insertedId.toString();
    // start thumbnail generation worker
    if (type === VALID_TYPES.image) {
      const jobName = `Image thumbnail [${userId}-${fileId}]`;
      FILEQUEUE.add({ userId, fileId, name: jobName });
    }

    res.status(201).json({
      id: fileId,
      userId,
      name,
      type,
      isPublic,
      parentId:
        parentId === FOLDER_ID || parentId === FOLDER_ID.toString()
          ? 0
          : parentId,
    });
  }

  static async getShow(req, res) {
    const { user } = req;
    const id = req.params ? req.params.id : DEFAULT_ID;
    const userId = user._id.toString();
    const file = await (
      await dbClient.filesCollection()
    ).findOne({
      _id: new mongoDBCore.BSON.ObjectId(isIDValid(id) ? id : DEFAULT_ID),
      userId: new mongoDBCore.BSON.ObjectId(
        isIDValid(userId) ? userId : DEFAULT_ID
      ),
    });

    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({
      id,
      userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId:
        file.parentId === FOLDER_ID.toString() ? 0 : file.parentId.toString(),
    });
  }

  // Returns the files associated with a specific user.
  static async getIndex(req, res) {
    const { user } = req;
    const parentId = req.query.parentId || FOLDER_ID.toString();
    const page = /\d+/.test((req.query.page || '').toString())
      ? parseInt(req.query.page, 10)
      : 0;
    const filter = {
      userId: user._id,
      parentId:
        parentId === FOLDER_ID.toString()
          ? parentId
          : new mongoDBCore.BSON.ObjectId(
              isIDValid(parentId) ? parentId : DEFAULT_ID
            ),
    };

    const fileList = await (
      await (
        await dbClient.filesCollection()
      ).aggregate([
        { $match: filter },
        { $sort: { _id: -1 } },
        { $skip: page * MAX_FPP },
        { $limit: MAX_FPP },
        {
          $project: {
            _id: 0,
            id: '$_id',
            userId: '$userId',
            name: '$name',
            type: '$type',
            isPublic: '$isPublic',
            parentId: {
              $cond: {
                if: { $eq: ['$parentId', '0'] },
                then: 0,
                else: '$parentId',
              },
            },
          },
        },
      ])
    ).toArray();
    res.status(200).json(fileList);
  }

  static async putPublish(req, res) {
    const { user } = req;
    const { id } = req.params;
    const userId = user._id.toString();
    const filter = {
      _id: new mongoDBCore.BSON.ObjectId(isIDValid(id) ? id : DEFAULT_ID),
      userId: new mongoDBCore.BSON.ObjectId(
        isIDValid(userId) ? userId : DEFAULT_ID
      ),
    };
    const fileData = await (await dbClient.filesCollection()).findOne(filter);

    if (!fileData) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await (
      await dbClient.filesCollection()
    ).updateOne(filter, { $set: { isPublic: true } });
    res.status(200).json({
      id,
      userId,
      name: fileData.name,
      type: fileData.type,
      isPublic: true,
      parentId:
        fileData.parentId === FOLDER_ID.toString()
          ? 0
          : fileData.parentId.toString(),
    });
  }

  static async putUnpublish(req, res) {
    const { user } = req;
    const { id } = req.params;
    const userId = user._id.toString();
    const filter = {
      _id: new mongoDBCore.BSON.ObjectId(isIDValid(id) ? id : DEFAULT_ID),
      userId: new mongoDBCore.BSON.ObjectId(
        isIDValid(userId) ? userId : DEFAULT_ID
      ),
    };
    const fileData = await (await dbClient.filesCollection()).findOne(filter);

    if (!fileData) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await (
      await dbClient.filesCollection()
    ).updateOne(filter, { $set: { isPublic: false } });
    res.status(200).json({
      id,
      userId,
      name: fileData.name,
      type: fileData.type,
      isPublic: false,
      parentId:
        fileData.parentId === FOLDER_ID.toString()
          ? 0
          : fileData.parentId.toString(),
    });
  }

  // Returns the content of a file.
  static async getFile(req, res) {
    const user = await getUserFromTokenHeader(req);
    const { id } = req.params;
    const size = req.query.size || null;
    const userId = user ? user._id.toString() : '';
    const filter = {
      _id: new mongoDBCore.BSON.ObjectId(isIDValid(id) ? id : DEFAULT_ID),
    };
    const fileData = await (await dbClient.filesCollection()).findOne(filter);

    if (
      !fileData ||
      (!fileData.isPublic && fileData.userId.toString() !== userId)
    ) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (fileData.type === VALID_TYPES.folder) {
      res.status(400).json({ error: "A folder doesn't have content" });
      return;
    }

    let filePath = fileData.localPath;

    if (size) {
      filePath = `${fileData.localPath}_${size}`;
    }

    if (existsSync(filePath)) {
      const fileInfo = await statPromise(filePath);
      if (!fileInfo.isFile()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    } else {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const absoluteFilePath = await realPath(filePath);
    res.setHeader(
      'Content-Type',
      contentType(fileData.name) || 'text/plain; charset=utf-8'
    );
    res.status(200).sendFile(absoluteFilePath);
  }
}
