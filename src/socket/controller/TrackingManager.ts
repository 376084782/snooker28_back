import ModelConfigBasic from "../../models/ModelConfigBasic";
import ModelUser from "../../models/ModelUser";

export default class TrackingManager {
  static async addtracking28(uid) {
    let db = await ModelUser.findOne({ uid });
    if (!db) {
      await ModelUser.create({ uid, count: 1 })
    } else {
      await ModelConfigBasic.updateOne({ uid }, { count: db.count28 + 1 })
    }
  }
  static async addtrackingCost(uid, cost) {
    let db = await ModelUser.findOne({ uid });
    if (!db) {
      await ModelUser.create({ uid, gain: cost })
    } else {
      await ModelConfigBasic.updateOne({ uid }, { gain: db.gain + cost })
    }
  }
}