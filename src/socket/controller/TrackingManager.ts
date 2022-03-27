import ModelConfigBasic from "../../models/ModelConfigBasic";

export default class TrackingManager {
  static flagAdding = true;
  static countWillAdd = 0;
  static async addtracking28() {
    this.countWillAdd++;
    if (this.flagAdding) {
      return
    }
    this.flagAdding = true;
    let db = await ModelConfigBasic.findOne();
    await ModelConfigBasic.updateOne({ _id: db._id }, { count: db.count + this.countWillAdd })
    this.flagAdding = false;
  }
}