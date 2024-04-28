"use strict";
const { exec } = require("child_process");
const pdfPageCounter = require("pdf-page-counter");
const fs = require("fs");
const { getCache, deleteCache } = require("./node-cache");

module.exports = {
  getMergePdf: async function (array) {
    let list = "";
    const mergePdfName = `Merged-${Date.now()}.pdf`;
    array.map(({ givenName }) => {
      list += `./pdf/${givenName} `;
    });
    const command = `pdftk ${list}cat output ./pdf/${mergePdfName}`; // Add && del command to delete list
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

  getTotalPages: async function (pdf) {
    return new Promise((resolve) => {
      const pdfBuffer = fs.readFileSync(`./pdf/${pdf}`);
      pdfPageCounter(pdfBuffer).then(function ({ numpages }) {
        resolve(numpages);
      });
    });
  },

  pdfPageKeyboard: function (totalPages, removedPages = []) {
    let keyboardArray = [];
    let tmp = [];
    let n = 1;
    // if (totalPages === removedPages.length) {
    //   removedPages = [];
    // }
    while (totalPages) {
      if (n % 5) {
        tmp.push(n.toString());
        tmp = tmp.filter((i) => {
          return removedPages.includes(i) ? "" : i;
        });
      } else {
        tmp.push(n.toString());
        keyboardArray.push(
          tmp.filter((i) => {
            return removedPages.includes(i) ? "" : i;
          })
        );
        tmp = [];
      }
      n++;
      totalPages--;
    }
    if (tmp.length) {
      keyboardArray.push(tmp);
    }
    keyboardArray.push(removedPages.length ? ["Done", "Cancel"] : ["Cancel"]);
    return keyboardArray;
  },

  pdfPageSplitKeyboard: function (totalPages, removedPages) {
    let keyboardArray = [];
    let tmp = [];
    let n = 1;
    while (totalPages) {
      if (n % 5) {
        if (n >= removedPages) {
          tmp.push(n.toString());
        }
      } else {
        if (n >= removedPages) {
          tmp.push(n.toString());
          keyboardArray.push(tmp);
        }
        tmp = [];
      }
      n++;
      totalPages--;
    }
    if (tmp.length) {
      keyboardArray.push(tmp);
    }
    keyboardArray.push(["Cancel"]);
    return keyboardArray;
  },

  removePages: function (array, total, removedPages) {
    const [{ givenName, originalName }] = array;
    const removedPagePdfName = `RemovedPages-${Date.now()}.pdf`;
    const removedPagesList = removedPages
      .map((n) => Number(n))
      .sort((a, b) => a - b);
    let text = "";
    removedPagesList.map((n, index) => {
      let f = 0;
      let l = 0;
      if (n !== removedPagesList[index + 1] - 1) {
        if (removedPagesList.length === 1 && (n === 1 || n === total)) {
          f = n === 1 ? 2 : 1;
          l = n === 1 ? total : total - 1;
          text += `${f}-${l} `;
        } else {
          if (n !== 1 && index === 0) {
            f = 1;
            l = removedPagesList[index] - 1;
            text += `${f}-${l} `;
          }
          if (n !== total) {
            f = n + 1;
            l = removedPagesList[index + 1] - 1;
            text += `${f}-${l ? l : total} `;
          }
        }
      } else {
        if (index === 0 && n !== 1) {
          text += `1-${removedPagesList[index] - 1} `;
        }
      }
    });
    return new Promise((resolve) => {
      exec(
        `pdftk ./pdf/${givenName} cat ${text}output ./pdf/${removedPagePdfName}`,
        (err, stdout, stderr) => {
          if (err) {
            resolve({ success: false, message: err.message });
          } else {
            resolve({ success: true, message: `./pdf/${removedPagePdfName}` });
          }
        }
      );
    });
  },

  deleteOldDataOnNewCommand: function (id) {
    const getUserData = getCache(id);
    if (getUserData) {
      module.exports.deletePDFs(getUserData.files || []);
      deleteCache(id);
    }
    return true;
  },

  deletePDFs: function (files) {
    files.map(({ givenName }) => {
      fs.unlink(`./pdf/${givenName}`, (err) => {
        if (err) {
          console.log("deletePDFs err: ", err);
        }
      });
    });
    return true;
  },

  getSplitPdf: async function (array, ranges) {
    const [{ givenName, originalName }] = array;
    const removedPagePdfName = `SplitPdf-${Date.now()}.pdf`;
    let text = "";
    const len = ranges.length;
    ranges.forEach((a, index) => {
      const [f, l] = a;
      text += `pdftk ./pdf/${givenName} cat ${f}-${l? l : f} output ./pdf/${removedPagePdfName}`;
      if (len !== ++index) {
        text += ` && `;
      }
    });
    return new Promise((resolve) => {
      exec(text, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true, message: `./pdf/${removedPagePdfName}` });
        }
      });
    });
  },
};
