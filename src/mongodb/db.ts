'use strict';

import * as mongoose from 'mongoose';
import { createData } from './data'

export const doConnectMongo = () => {
  return new Promise((rsv, rej) => {
    mongoose.connect('mongodb://127.0.0.1:27017/', {
      dbName: 'snooker28',
      user: 'root',
      pass: 'Test15259980589'
    });
    const db = mongoose.connection;

    db.once('open', async () => {
      console.log('连接数据库成功')
      await createData()
      rsv(null)
    })

    db.on('error', function (error) {
      console.warn('Error in MongoDb connection: ' + error)
      mongoose.disconnect();
      rej(null)
    });

    db.on('close', function () {
      console.warn('数据库断开，重新连接数据库')
      rej(null)
    });
  })

}
