import API from "../api/API";
import AgoraTokenGenerater from "../api/AgoraTokenGenerater";
import Util from "../socket/Util";
import ModelUser from "../models/ModelUser";
import ModelConfigRoom from "../models/ModelConfigRoom";

var express = require("express");
var router = express.Router();
/* GET home page. */
router.post("/room/save", async (req, res, next) => {
  let data = req.body;
  for (let i = 0; i < data.length; i++) {
    let confEach = data[i];
    if (typeof confEach.AP != 'string') {
      confEach.AP = JSON.stringify(confEach.AP);
    }
    await ModelConfigRoom.updateOne({ id: confEach.id }, {
      RP: confEach.RP,
      PG: confEach.PG,
      ZG: confEach.ZG,
      AP: confEach.AP
    });
  }
  res.send({ code: 0 });
});
router.get("/room/list", async (req, res, next) => {
  let data = req.query;
  let conf: any = await ModelConfigRoom.find({});
  conf.forEach(e => {
    e.chipList = JSON.parse(e.chipList);
  });
  res.send({
    code: 0, data: conf
  });
});
router.get("/user/list", async (req, res, next) => {
  let data = req.query;
  let list: any = await ModelUser.find({});
  res.send(list);
});
router.post("/userinfo", async (req, res, next) => {
  let data = req.body;
  let result = (await API.getUserInfo(data.uid)) as any;
  res.send(result);
});

module.exports = router;
