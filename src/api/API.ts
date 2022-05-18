
var request = require("request");
export default class API {
  static doAjax({ url, method, data }) {
    return new Promise((rsv, rej) => {
      request(
        {
          url: url,
          method: method,
          json: true,
          headers: {
            "content-type": "application/json"
          },
          body: data
        },
        function(error, response, body) {
          if (!error && response.statusCode == 200) {
            rsv(body);
          } else {
            rej(error);
          }
        }
      );
    });
  }

}
