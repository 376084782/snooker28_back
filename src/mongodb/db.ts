"use strict";

import * as mongoose from "mongoose";
import socketManager from "../socket";
import { createData } from "./data";
import { DBHost, DBName, DBUser, DBPass } from "../socket/config";

export const doConnectMongo = () => {
  return new Promise((rsv, rej) => {
    if (socketManager.isTest) {
      mongoose.connect("mongodb://39.101.162.107:20017/", {
        dbName: "snooker28",
        user: "root",
        pass: "123456"
      });
    } else {
      mongoose.connect(DBHost, {
        dbName: DBName,
        user: DBUser,
        pass: DBPass
      });
    }
    const db = mongoose.connection;

    db.once("open", async () => {
      console.log("连接数据库成功");
      await createData();
      rsv(null);
    });

    db.on("error", function(error) {
      console.warn("Error in MongoDb connection: " + error);
      mongoose.disconnect();
      rej(null);
    });

    db.on("close", function() {
      console.warn("数据库断开，重新连接数据库");
      rej(null);
    });
  });
};
