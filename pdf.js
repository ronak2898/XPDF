"use strict";
const { exec } = require("child_process");
module.exports = {
  mergePdf: function (array) {
    let list = "";
    const mergePdfName = `Merged-${Date.now()}.pdf`;
    array.map(({ givenName }) => {
      list += `./pdf/${givenName} `;
    });
    const command = `pdftk ${list}cat output ./pdf/${mergePdfName}`; // Add del command to delete list
    return new Promise((resolve) => {
      exec(command, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true, message: `./pdf/${mergePdfName}` });
        }
      });
    });
  },
};
